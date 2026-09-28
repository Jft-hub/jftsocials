import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();
import {
  User,
  Wallet,
  WalletTransaction,
  Category,
  Service,
  Order,
  Payment,
  SupportTicket,
  SupportMessage,
  NotificationItem,
  AuditLog,
  SystemSettings,
  Currency,
  NumberOrder,
  AccountCategory,
  AccountListing,
  AccountOrder,
  GroupedService
} from '../src/types/index.js';
import { queueMirrorSnapshot, MirrorSnapshot } from './supabaseMirror.js';

interface DatabaseSchema {
  users: User[];
  wallets: Wallet[];
  wallet_transactions: WalletTransaction[];
  categories: Category[];
  services: Service[];
  grouped_services?: GroupedService[];
  orders: Order[];
  number_orders?: NumberOrder[];
  accountCategories?: AccountCategory[];
  accountListings?: AccountListing[];
  accountOrders?: AccountOrder[];
  payments: Payment[];
  support_tickets: SupportTicket[];
  support_messages: SupportMessage[];
  notifications: NotificationItem[];
  audit_logs: AuditLog[];
  settings: SystemSettings;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'jft_database.json');

// Default system settings
const DEFAULT_SETTINGS: SystemSettings = {
  platform_name: 'JFT Socials',
  primary_domain: 'jftsocials.online',
  whatsapp_support_number: '+2347018409997',
  default_markup_percentage: 20, // 20%
  default_min_margin_ngn: 10,    // ₦10 minimum platform margin
  payment_fee_percentage: 3,     // 3% payment/deposit fee
  payment_fee_enabled: true,
  exchange_rate_usd_ngn: 1500,   // ₦1,500 = 1 USDT
  min_deposit_ngn: 100,
  max_deposit_ngn: 5000000,
  min_deposit_usdt: 5,
  max_deposit_usdt: 10000,
  usdt_trc20_address: 'TLvQxJFTsocialsNetworkTRC20OfficialDepositAddress',
  usdt_network: 'TRON (TRC-20)',
  maintenance_mode: false,
  maintenance_message: 'JFT Socials infrastructure upgrade in progress. Order automation services remain protected.',
  peakerr_api_url: 'https://peakerr.com/api/v2',
  peakerr_key_configured: false,
  eagainsmedia_api_url: 'https://engainsmedia.com/api/v2',
  eagainsmedia_key_configured: false,
  five_sim_rate_to_ngn: 0,
  five_sim_markup_percentage: 50,
  fivesim_key_configured: false,
  sync_interval_minutes: 10,
  low_balance_threshold_usd: 25.0
};

// --- Credential encryption (AES-256-GCM) for secrets stored in the JSON DB ---
// Enforces that ENCRYPTION_KEY is provided in the environment or .env file (>= 32 chars).
// Any insecure hardcoded fallback has been removed to protect provider secrets at rest.
function getCandidateRawKeys(): string[] {
  const keys: string[] = [];
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.trim().length >= 32) {
    keys.push(process.env.ENCRYPTION_KEY.trim());
  }
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/^ENCRYPTION_KEY=["']?([^"'\r\n]+)["']?/m);
      if (match && match[1] && match[1].trim().length >= 32 && !keys.includes(match[1].trim())) {
        keys.push(match[1].trim());
      }
    }
  } catch (e) {
    // ignore
  }
  return keys;
}

export function validateEncryptionConfig(): void {
  const candidates = getCandidateRawKeys();
  if (candidates.length === 0) {
    throw new Error(
      'FATAL CONFIGURATION ERROR: ENCRYPTION_KEY environment variable is not set or is shorter than 32 characters. ' +
      'A secure 32+ character key is required to encrypt provider API keys and sensitive credentials at rest. ' +
      'Please set ENCRYPTION_KEY in your environment or .env file before running in production.'
    );
  }
}

function getEncryptionKey(): Buffer {
  const candidates = getCandidateRawKeys();
  if (candidates.length === 0) {
    validateEncryptionConfig();
  }
  return crypto.createHash('sha256').update(candidates[0]).digest();
}

export function encryptSecret(plainText: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Store iv + authTag + ciphertext together, base64, so it's one string in the JSON file.
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptSecret(stored: string, onFallbackKeyUsed?: () => void): string {
  const rawKeys = getCandidateRawKeys();
  if (rawKeys.length === 0) {
    validateEncryptionConfig();
  }

  const raw = Buffer.from(stored, 'base64');
  if (raw.length < 28) {
    throw new Error('Stored encrypted secret payload is malformed.');
  }

  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);

  let lastError: any = null;
  for (let i = 0; i < rawKeys.length; i++) {
    try {
      const keyBuf = crypto.createHash('sha256').update(rawKeys[i]).digest();
      const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
      if (i > 0 && onFallbackKeyUsed) {
        onFallbackKeyUsed();
      }
      return decrypted;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Decryption failed with all candidate encryption keys.');
}

// Password hashing (bcrypt, 12 rounds, random per-user salt built in)
export function hashPassword(plainText: string): string {
  return bcrypt.hashSync(plainText, 12);
}

// Legacy hash scheme, kept ONLY so existing accounts created before this
// patch can still log in once and be transparently migrated. Do not use
// this for new passwords.
function legacyHashPassword(plainText: string): string {
  return crypto.createHash('sha256').update(plainText + 'jft_salt_enterprise_2026').digest('hex');
}

// Verifies a plaintext password against a stored hash. Handles both bcrypt
// hashes (current) and legacy SHA-256 hashes (pre-migration accounts). When
// a legacy hash matches, the caller-supplied `onMigrate` callback is invoked
// with a freshly-generated bcrypt hash so the account can be upgraded in place.
export function verifyPassword(
  plainText: string,
  storedHash: string,
  onMigrate?: (newHash: string) => void
): boolean {
  const isBcryptHash = storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$');

  if (isBcryptHash) {
    return bcrypt.compareSync(plainText, storedHash);
  }

  // Legacy SHA-256 path
  const matchesLegacy = legacyHashPassword(plainText) === storedHash;
  if (matchesLegacy && onMigrate) {
    onMigrate(hashPassword(plainText));
  }
  return matchesLegacy;
}

class Database {
  private data: DatabaseSchema;
  private isWriting: boolean = false;

  constructor() {
    validateEncryptionConfig();
    this.ensureDirectory();
    this.data = this.loadOrCreate();
  }

  private ensureDirectory() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private save() {
    if (this.isWriting) return;
    this.isWriting = true;
    try {
      this.ensureDirectory();
      const tempFile = `${DB_FILE}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempFile, DB_FILE);
    } catch (err) {
      console.error('[Database] Failed to write database file:', err);
    } finally {
      this.isWriting = false;
    }
    // Live Supabase mirror (write-through backup). Fire-and-forget: it can
    // never throw and never affects the JSON file or the current request.
    try {
      queueMirrorSnapshot(this.buildMirrorSnapshot());
    } catch {
      // intentionally silent - the local file is the source of truth
    }
  }

  // Builds the small-table snapshot for Supabase. Only irreplaceable data;
  // the multi-MB provider catalog is skipped (it re-syncs from providers).
  // Every row is mapped to exact Supabase column names - unknown fields are
  // dropped so a single bad key can never fail the batch.
  private buildMirrorSnapshot(): MirrorSnapshot {
    const s = this.data.settings || ({} as any);
    const settings: any = {};
    const SETTING_COLS = [
      'platform_name', 'primary_domain', 'whatsapp_support_number',
      'default_markup_percentage', 'default_min_margin_ngn',
      'payment_fee_percentage', 'payment_fee_enabled',
      'exchange_rate_usd_ngn', 'min_deposit_ngn', 'max_deposit_ngn',
      'min_deposit_usdt', 'max_deposit_usdt', 'usdt_trc20_address',
      'usdt_network', 'maintenance_mode', 'maintenance_message',
      'peakerr_api_url', 'peakerr_key_configured', 'peakerr_api_key_encrypted',
      'eagainsmedia_api_url', 'eagainsmedia_key_configured', 'eagainsmedia_api_key_encrypted',
      'five_sim_rate_to_ngn', 'five_sim_markup_percentage',
      'fivesim_key_configured', 'fivesim_api_key_encrypted',
      'sync_interval_minutes', 'low_balance_threshold_usd'
    ];
    for (const c of SETTING_COLS) {
      if (s[c] !== undefined) settings[c] = s[c];
    }
    return {
      users: this.data.users || [],
      wallets: this.data.wallets || [],
      wallet_transactions: this.data.wallet_transactions || [],
      orders: (this.data.orders || []).map((o: any) => ({
        id: o.id, user_id: o.user_id, user_name: o.user_name ?? null,
        user_email: o.user_email ?? null, service_id: o.service_id,
        service_name: o.service_name ?? null, provider_id: o.provider_id || 'peakerr',
        provider_service_id: o.provider_service_id ?? null,
        provider_order_id: o.provider_order_id === undefined || o.provider_order_id === null
          ? null : String(o.provider_order_id),
        target_link: o.target_link, quantity: o.quantity,
        provider_charge: o.provider_charge ?? 0, customer_charge: o.customer_charge ?? 0,
        markup_amount: o.markup_amount ?? 0, markup_percentage: o.markup_percentage ?? 0,
        minimum_markup: o.minimum_markup ?? 0, applied_markup: o.applied_markup ?? 0,
        payment_fee: o.payment_fee ?? 0, net_profit: o.net_profit ?? 0,
        currency: o.currency, exchange_rate_used: o.exchange_rate_used ?? 1500,
        pricing_rule_version: o.pricing_rule_version || 'v1',
        start_count: o.start_count ?? 0, remains: o.remains ?? 0,
        status: o.status, provider_status: o.provider_status ?? null,
        refill_eligible: !!o.refill_eligible, cancel_eligible: !!o.cancel_eligible,
        last_refill_requested_at: o.last_refill_requested_at ?? null,
        refunded_at: o.refunded_at ?? null, refund_reason: o.refund_reason ?? null,
        refund_admin_id: o.refund_admin_id ?? null,
        dispatch_attempts: o.dispatch_attempts ?? 0,
        last_dispatch_attempt_at: o.last_dispatch_attempt_at ?? null,
        created_at: o.created_at, updated_at: o.updated_at,
        completed_at: o.completed_at ?? null
      })),
      number_orders: this.data.number_orders || [],
      account_categories: (this.data.accountCategories || []).map((c: any) => ({
        id: c.id, name: c.name, description: c.description || '',
        price_ngn: c.price_ngn ?? 0, active: !!c.active, created_at: c.created_at
      })),
      account_listings: this.data.accountListings || [],
      account_orders: this.data.accountOrders || [],
      payments: (this.data.payments || []).map((p: any) => ({
        id: p.id, user_id: p.user_id, user_name: p.user_name ?? null,
        user_email: p.user_email ?? null, provider: p.provider, reference: p.reference,
        amount: p.amount ?? 0, fee_amount: p.fee_amount ?? 0, net_amount: p.net_amount ?? 0,
        currency: p.currency, status: p.status, metadata: p.metadata || {},
        created_at: p.created_at, updated_at: p.updated_at
      })),
      support_tickets: this.data.support_tickets || [],
      support_messages: this.data.support_messages || [],
      notifications: this.data.notifications || [],
      audit_logs: (this.data.audit_logs || []).map((a: any) => ({
        id: a.id, actor_id: a.actor_id || '', actor_name: a.actor_name || '',
        actor_role: a.actor_role || '', action: a.action || '',
        entity_type: a.entity_type || '', entity_id: a.entity_id || '',
        details: a.details || '', ip: a.ip || '', created_at: a.created_at
      })),
      settings: Object.keys(settings).length > 0 ? settings : null
    };
  }

  // Applies a Supabase mirror download after boot-time healing decides the
  // remote is strictly newer. Small tables are replaced wholesale; the
  // provider catalog is never touched. Persists to the local file immediately.
  public restoreFromMirror(tables: Record<string, any[]>, settings: any | null): void {
    const pick = (k: string): any[] | null =>
      Array.isArray(tables[k]) ? tables[k] : null;
    const assign = (tableKey: string, dataKey: string) => {
      const rows = pick(tableKey);
      if (rows) (this.data as any)[dataKey] = rows;
    };
    assign('users', 'users');
    assign('wallets', 'wallets');
    assign('wallet_transactions', 'wallet_transactions');
    assign('orders', 'orders');
    assign('number_orders', 'number_orders');
    assign('account_categories', 'accountCategories');
    assign('account_listings', 'accountListings');
    assign('account_orders', 'accountOrders');
    assign('payments', 'payments');
    assign('support_tickets', 'support_tickets');
    assign('support_messages', 'support_messages');
    assign('notifications', 'notifications');
    assign('audit_logs', 'audit_logs');
    if (settings && typeof settings === 'object') {
      this.data.settings = { ...this.data.settings, ...settings };
    }
    // Ledger reconciliation: a wallet snapshot can miss the final seconds
    // before a wipe, but every ledger entry carries its balance_after. Replay
    // the latest entry per wallet so balances always match history.
    try {
      const latestByWallet = new Map<string, any>();
      for (const t of this.data.wallet_transactions || []) {
        if (!t || !t.wallet_id) continue;
        const prev = latestByWallet.get(t.wallet_id);
        if (!prev || String(t.created_at) > String(prev.created_at)) {
          latestByWallet.set(t.wallet_id, t);
        }
      }
      for (const w of this.data.wallets || []) {
        const t = latestByWallet.get(w.id);
        if (
          t && typeof t.balance_after === 'number' && isFinite(t.balance_after) &&
          (!t.currency || t.currency === w.currency) &&
          w.available_balance !== t.balance_after
        ) {
          console.log(`[Restore] Reconciled wallet ${w.id}: ${w.available_balance} -> ${t.balance_after} (ledger)`);
          w.available_balance = t.balance_after;
        }
      }
    } catch (e: any) {
      console.warn('[Restore] Ledger reconciliation skipped:', e.message || e);
    }
    this.save();
  }

  // Row counts for the boot-time mirror verification log.
  public getMirrorCounts(): Record<string, number> {
    return {
      users: this.data.users?.length || 0,
      wallets: this.data.wallets?.length || 0,
      wallet_transactions: this.data.wallet_transactions?.length || 0,
      orders: this.data.orders?.length || 0,
      number_orders: this.data.number_orders?.length || 0,
      account_categories: this.data.accountCategories?.length || 0,
      account_listings: this.data.accountListings?.length || 0,
      account_orders: this.data.accountOrders?.length || 0,
      payments: this.data.payments?.length || 0,
      support_tickets: this.data.support_tickets?.length || 0,
      support_messages: this.data.support_messages?.length || 0,
      notifications: this.data.notifications?.length || 0,
      audit_logs: this.data.audit_logs?.length || 0
    };
  }

  private loadOrCreate(): DatabaseSchema {
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.users && parsed.orders && parsed.settings) {
          if (!parsed.number_orders) {
            parsed.number_orders = [];
          }
          if (!parsed.grouped_services) {
            parsed.grouped_services = [];
          }
          if (!parsed.accountCategories) {
            parsed.accountCategories = [];
          }
          if (!parsed.accountListings) {
            parsed.accountListings = [];
          }
          if (!parsed.accountOrders) {
            parsed.accountOrders = [];
          }
          if (!parsed.accountCategories.some((c: any) => c.id === 'uk_tiktok')) {
            parsed.accountCategories.push({
              id: 'uk_tiktok',
              name: 'UK TikTok Account',
              description: 'Aged UK-region TikTok account, email login. Direct UK algorithm reach & Creator Rewards Program eligibility.',
              price_ngn: 8000,
              active: true,
              created_at: new Date().toISOString()
            });
          }
          if (parsed.settings && parsed.settings.min_deposit_ngn === 1000) {
            parsed.settings.min_deposit_ngn = 100;
          }
          return parsed;
        }
      } catch (err) {
        console.warn('[Database] Corrupted DB file, rebuilding seed data:', err);
      }
    }

    // Seed new database
    const initial = this.createSeedData();
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Database] Failed to write initial seed DB:', e);
    }
    return initial;
  }

  private createSeedData(): DatabaseSchema {
    const now = new Date().toISOString();

    const adminUser: User = {
      id: 'usr_admin_01',
      name: 'JFT Platform Administrator',
      username: 'jftadmin',
      email: 'admin@jftsocials.online',
      password_hash: hashPassword('AdminSecureKey2026!'),
      role: 'superadmin',
      status: 'active',
      email_verified: true,
      created_at: now,
      updated_at: now
    };

    const demoUser: User = {
      id: 'usr_demo_01',
      name: 'Alex Vance',
      username: 'demouser',
      email: 'customer@jftsocials.online',
      password_hash: hashPassword('Password123!'),
      role: 'customer',
      status: 'active',
      email_verified: true,
      created_at: now,
      updated_at: now
    };

    const wallets: Wallet[] = [
      {
        id: 'wal_admin_ngn',
        user_id: adminUser.id,
        currency: 'NGN',
        available_balance: 5000000,
        created_at: now,
        updated_at: now
      },
      {
        id: 'wal_admin_usdt',
        user_id: adminUser.id,
        currency: 'USDT',
        available_balance: 10000,
        created_at: now,
        updated_at: now
      },
      {
        id: 'wal_demo_ngn',
        user_id: demoUser.id,
        currency: 'NGN',
        available_balance: 75000, // ₦75,000 starting wallet
        created_at: now,
        updated_at: now
      },
      {
        id: 'wal_demo_usdt',
        user_id: demoUser.id,
        currency: 'USDT',
        available_balance: 50.00, // 50 USDT starting balance
        created_at: now,
        updated_at: now
      }
    ];

    const categories: Category[] = [
      { id: 'cat_ig', name: 'Instagram', platform: 'instagram', icon: 'Instagram', description: 'Followers, Likes, Reel Views, Engagement', active: true, sort_order: 1 },
      { id: 'cat_tk', name: 'TikTok', platform: 'tiktok', icon: 'Video', description: 'Followers, FYP Views, Saves, Shares, Likes', active: true, sort_order: 2 },
      { id: 'cat_yt', name: 'YouTube', platform: 'youtube', icon: 'Youtube', description: 'Monetization Views, High Retention Subscribers, Likes', active: true, sort_order: 3 },
      { id: 'cat_tg', name: 'Telegram', platform: 'telegram', icon: 'Send', description: 'Channel Members, Post Auto-Views, Group Growth', active: true, sort_order: 4 },
      { id: 'cat_tw', name: 'Twitter (X)', platform: 'twitter', icon: 'Twitter', description: 'Profile Followers, Retweets, Impressions, Poll Votes', active: true, sort_order: 5 },
      { id: 'cat_fb', name: 'Facebook', platform: 'facebook', icon: 'Share2', description: 'Page Likes, Group Members, Video Views', active: true, sort_order: 6 },
      { id: 'cat_sp', name: 'Spotify', platform: 'spotify', icon: 'Music', description: 'Royalty Eligible Global Track Streams, Playlist Followers', active: true, sort_order: 7 }
    ];

    const services: Service[] = [
      {
        id: 'srv_101',
        provider_id: 'peakerr',
        provider_service_id: 101,
        name: 'Instagram HQ Followers [Instant Start + 30D Refill Guarantee]',
        description: 'Instant start within 5-15 mins. Real profiles with posts and profile pictures. 30 days automated refill guarantee.',
        category_id: 'cat_ig',
        provider_rate: 1425, // ₦1,425 per 1k (Peakerr rate)
        min_quantity: 10,
        max_quantity: 50000,
        refill_supported: true,
        cancel_supported: true,
        active: true,
        ordering_enabled: true,
        sort_order: 1,
        synced_at: now
      },
      {
        id: 'srv_102',
        provider_id: 'peakerr',
        provider_service_id: 102,
        name: 'Instagram Real Active Post Likes [Super Fast Speed]',
        description: 'Instant start post likes. Improves algorithmic reach and explorer page discovery.',
        category_id: 'cat_ig',
        provider_rate: 525, // ₦525 per 1k
        min_quantity: 20,
        max_quantity: 100000,
        refill_supported: true,
        cancel_supported: true,
        active: true,
        ordering_enabled: true,
        sort_order: 2,
        synced_at: now
      },
      {
        id: 'srv_103',
        provider_id: 'peakerr',
        provider_service_id: 103,
        name: 'Instagram Video & Reels Views [High Retention]',
        description: 'Super fast delivery. High watch time to boost Instagram Reels algorithm rankings.',
        category_id: 'cat_ig',
        provider_rate: 225, // ₦225 per 1k
        min_quantity: 100,
        max_quantity: 1000000,
        refill_supported: false,
        cancel_supported: true,
        active: true,
        ordering_enabled: true,
        sort_order: 3,
        synced_at: now
      },
      {
        id: 'srv_201',
        provider_id: 'peakerr',
        provider_service_id: 201,
        name: 'TikTok Genuine Followers [Real Accounts + 60D Refill]',
        description: 'High grade TikTok followers suitable for LIVE streaming unlocking (1,000+ required) and Creator Rewards.',
        category_id: 'cat_tk',
        provider_rate: 2700, // ₦2,700 per 1k
        min_quantity: 10,
        max_quantity: 30000,
        refill_supported: true,
        cancel_supported: false,
        active: true,
        ordering_enabled: true,
        sort_order: 4,
        synced_at: now
      },
      {
        id: 'srv_202',
        provider_id: 'peakerr',
        provider_service_id: 202,
        name: 'TikTok High Retention FYP Video Views [Algorithm Booster]',
        description: 'Instant start. Delivered from organic IP pools to optimize For You Page placement.',
        category_id: 'cat_tk',
        provider_rate: 120, // ₦120 per 1k
        min_quantity: 500,
        max_quantity: 5000000,
        refill_supported: false,
        cancel_supported: true,
        active: true,
        ordering_enabled: true,
        sort_order: 5,
        synced_at: now
      },
      {
        id: 'srv_301',
        provider_id: 'peakerr',
        provider_service_id: 301,
        name: 'YouTube Watch Time Views [Monetization Eligible]',
        description: 'Safe monetization views with 3 to 5 minutes retention per view. Natural gradual distribution.',
        category_id: 'cat_yt',
        provider_rate: 3600, // ₦3,600 per 1k
        min_quantity: 500,
        max_quantity: 100000,
        refill_supported: true,
        cancel_supported: true,
        active: true,
        ordering_enabled: true,
        sort_order: 6,
        synced_at: now
      },
      {
        id: 'srv_401',
        provider_id: 'peakerr',
        provider_service_id: 401,
        name: 'Telegram Channel Members [Non-Drop Global]',
        description: 'HQ Telegram subscribers for public and private channels or groups.',
        category_id: 'cat_tg',
        provider_rate: 1275, // ₦1,275 per 1k
        min_quantity: 100,
        max_quantity: 50000,
        refill_supported: true,
        cancel_supported: true,
        active: true,
        ordering_enabled: true,
        sort_order: 7,
        synced_at: now
      }
    ];

    const orders: Order[] = [
      {
        id: 'JFT-ORD-8821',
        user_id: demoUser.id,
        user_name: demoUser.name,
        user_email: demoUser.email,
        service_id: 'srv_101',
        service_name: 'Instagram HQ Followers [Instant Start + 30D Refill Guarantee]',
        provider_id: 'peakerr',
        provider_order_id: 247910,
        target_link: 'https://instagram.com/jftsocials_official',
        quantity: 1000,
        provider_charge: 1425,
        customer_charge: 1710, // 1425 + 20% markup (285)
        markup_amount: 285,
        markup_percentage: 20,
        minimum_markup: 0,
        applied_markup: 285,
        payment_fee: 51.3,
        net_profit: 233.7,
        currency: 'NGN',
        exchange_rate_used: 1500,
        pricing_rule_version: 'v3.0-percent-markup-20',
        start_count: 3200,
        remains: 0,
        status: 'completed',
        provider_status: 'Completed',
        refill_eligible: true,
        cancel_eligible: false,
        created_at: new Date(Date.now() - 86400000).toISOString(),
        updated_at: new Date(Date.now() - 82000000).toISOString(),
        completed_at: new Date(Date.now() - 82000000).toISOString()
      },
      {
        id: 'JFT-ORD-8822',
        user_id: demoUser.id,
        user_name: demoUser.name,
        user_email: demoUser.email,
        service_id: 'srv_201',
        service_name: 'TikTok Genuine Followers [Real Accounts + 60D Refill]',
        provider_id: 'peakerr',
        provider_order_id: 247985,
        target_link: 'https://www.tiktok.com/@creativelabs_ng',
        quantity: 1000,
        provider_charge: 2700,
        customer_charge: 3240, // 2700 + 20% markup (540)
        markup_amount: 540,
        markup_percentage: 20,
        minimum_markup: 0,
        applied_markup: 540,
        payment_fee: 97.2,
        net_profit: 442.8,
        currency: 'NGN',
        exchange_rate_used: 1500,
        pricing_rule_version: 'v3.0-percent-markup-20',
        start_count: 1540,
        remains: 230,
        status: 'in_progress',
        provider_status: 'In progress',
        refill_eligible: false,
        cancel_eligible: true,
        created_at: new Date(Date.now() - 7200000).toISOString(),
        updated_at: now
      }
    ];

    const wallet_transactions: WalletTransaction[] = [
      {
        id: 'tx_seed_01',
        wallet_id: 'wal_demo_ngn',
        user_id: demoUser.id,
        type: 'deposit',
        amount: 83125,
        balance_before: 0,
        balance_after: 83125,
        currency: 'NGN',
        reference_type: 'payment',
        reference_id: 'pstk_ref_seed_01',
        description: 'Paystack Verified Instant Deposit',
        status: 'completed',
        created_at: new Date(Date.now() - 90000000).toISOString()
      },
      {
        id: 'tx_seed_02',
        wallet_id: 'wal_demo_ngn',
        user_id: demoUser.id,
        type: 'order_debit',
        amount: 3425,
        balance_before: 83125,
        balance_after: 79700,
        currency: 'NGN',
        reference_type: 'order',
        reference_id: 'JFT-ORD-8821',
        description: 'Order JFT-ORD-8821: Instagram HQ Followers',
        status: 'completed',
        created_at: new Date(Date.now() - 86400000).toISOString()
      },
      {
        id: 'tx_seed_03',
        wallet_id: 'wal_demo_ngn',
        user_id: demoUser.id,
        type: 'order_debit',
        amount: 4700,
        balance_before: 79700,
        balance_after: 75000,
        currency: 'NGN',
        reference_type: 'order',
        reference_id: 'JFT-ORD-8822',
        description: 'Order JFT-ORD-8822: TikTok Genuine Followers',
        status: 'completed',
        created_at: new Date(Date.now() - 7200000).toISOString()
      }
    ];

    const payments: Payment[] = [
      {
        id: 'pay_01',
        user_id: demoUser.id,
        user_name: demoUser.name,
        user_email: demoUser.email,
        provider: 'paystack',
        reference: 'pstk_ref_seed_01',
        amount: 85690,
        fee_amount: 2565, // 3% fee
        net_amount: 83125,
        currency: 'NGN',
        status: 'confirmed',
        created_at: new Date(Date.now() - 90000000).toISOString(),
        updated_at: new Date(Date.now() - 90000000).toISOString()
      }
    ];

    const support_tickets: SupportTicket[] = [
      {
        id: 'tkt_01',
        ticket_number: 'JFT-TKT-104',
        user_id: demoUser.id,
        user_name: demoUser.name,
        user_email: demoUser.email,
        category: 'order',
        subject: 'Refill status for completed Instagram order',
        priority: 'medium',
        status: 'open',
        assigned_admin: 'JFT Platform Administrator',
        created_at: new Date(Date.now() - 3600000).toISOString(),
        updated_at: now
      }
    ];

    const support_messages: SupportMessage[] = [
      {
        id: 'msg_01',
        ticket_id: 'tkt_01',
        sender_id: demoUser.id,
        sender_name: demoUser.name,
        sender_role: 'customer',
        message: 'Hello! I noticed a drop of about 15 followers on my Instagram order JFT-ORD-8821. Would love to request the 30-day refill guaranteed on this service.',
        created_at: new Date(Date.now() - 3600000).toISOString()
      },
      {
        id: 'msg_02',
        ticket_id: 'tkt_01',
        sender_id: adminUser.id,
        sender_name: adminUser.name,
        sender_role: 'superadmin',
        message: 'Hello Alex! We have triggered the provider refill task on order JFT-ORD-8821. The count will be replenished within 1-2 hours automatically. You can also contact us on WhatsApp at +2347018409997 anytime!',
        created_at: new Date(Date.now() - 1800000).toISOString()
      }
    ];

    const notifications: NotificationItem[] = [
      {
        id: 'notif_01',
        user_id: demoUser.id,
        type: 'deposit',
        title: 'Wallet Funded Successfully',
        message: '₦83,125.00 has been credited to your JFT Socials NGN wallet.',
        read: true,
        link: '/wallet',
        created_at: new Date(Date.now() - 90000000).toISOString()
      },
      {
        id: 'notif_02',
        user_id: demoUser.id,
        type: 'order',
        title: 'Order Completed',
        message: 'Order JFT-ORD-8821 has completed successfully.',
        read: false,
        link: '/orders',
        created_at: new Date(Date.now() - 82000000).toISOString()
      }
    ];

    const audit_logs: AuditLog[] = [
      {
        id: 'aud_01',
        actor_id: adminUser.id,
        actor_name: adminUser.name,
        actor_role: 'superadmin',
        action: 'PLATFORM_INITIALIZATION',
        entity_type: 'system',
        entity_id: 'jft_system',
        details: 'Initial system boot and Peakerr catalog configuration loaded.',
        ip: '127.0.0.1',
        created_at: now
      }
    ];

    const accountCategories: AccountCategory[] = [
      {
        id: 'uk_tiktok',
        name: 'UK TikTok Account',
        description: 'Aged UK-region TikTok account, email login. Direct UK algorithm reach & Creator Rewards Program eligibility.',
        price_ngn: 8000,
        active: true,
        created_at: now
      }
    ];

    return {
      users: [adminUser, demoUser],
      wallets,
      wallet_transactions,
      categories,
      services,
      orders,
      number_orders: [],
      accountCategories,
      accountListings: [],
      accountOrders: [],
      payments,
      support_tickets,
      support_messages,
      notifications,
      audit_logs,
      settings: DEFAULT_SETTINGS
    };
  }

  // --- ACCESSORS ---

  public getSettings(): SystemSettings {
    return { ...this.data.settings };
  }

  public updateSettings(partial: Partial<SystemSettings>, actor?: User, ip: string = '127.0.0.1'): SystemSettings {
    this.data.settings = { ...this.data.settings, ...partial };
    this.save();

    if (actor) {
      this.addAuditLog({
        actor_id: actor.id,
        actor_name: actor.name,
        actor_role: actor.role,
        action: 'UPDATE_SYSTEM_SETTINGS',
        entity_type: 'settings',
        entity_id: 'global',
        details: `Updated settings: ${Object.keys(partial).join(', ')}`,
        ip
      });
    }

    return this.data.settings;
  }

  public saveProviderApiKey(providerId: string, plainKey: string, admin: User, ip: string = '127.0.0.1') {
    const pId = providerId.toLowerCase();
    if (!plainKey || plainKey.trim() === '') {
      if (pId === 'peakerr') {
        delete this.data.settings.peakerr_api_key_encrypted;
        this.data.settings.peakerr_key_configured = false;
      } else if (pId === 'eagainsmedia') {
        delete this.data.settings.eagainsmedia_api_key_encrypted;
        this.data.settings.eagainsmedia_key_configured = false;
      } else if (pId === 'fivesim' || pId === '5sim') {
        delete this.data.settings.fivesim_api_key_encrypted;
        this.data.settings.fivesim_key_configured = false;
      }
      this.save();
      return;
    }

    const encrypted = encryptSecret(plainKey);
    if (pId === 'peakerr') {
      this.data.settings.peakerr_api_key_encrypted = encrypted;
      this.data.settings.peakerr_key_configured = true;
    } else if (pId === 'eagainsmedia') {
      this.data.settings.eagainsmedia_api_key_encrypted = encrypted;
      this.data.settings.eagainsmedia_key_configured = true;
    } else if (pId === 'fivesim' || pId === '5sim') {
      this.data.settings.fivesim_api_key_encrypted = encrypted;
      this.data.settings.fivesim_key_configured = true;
    }
    this.save();

    this.addAuditLog({
      actor_id: admin.id,
      actor_name: admin.name,
      actor_role: admin.role,
      action: `UPDATE_${providerId.toUpperCase()}_API_KEY`,
      entity_type: 'settings',
      entity_id: 'global',
      details: `${providerId} API key was updated and encrypted at rest.`,
      ip
    });
  }

  public getProviderApiKey(providerId: string): string | null {
    const pId = providerId.toLowerCase();
    let encrypted: string | undefined;
    if (pId === 'peakerr') {
      encrypted = this.data.settings.peakerr_api_key_encrypted;
    } else if (pId === 'eagainsmedia') {
      encrypted = this.data.settings.eagainsmedia_api_key_encrypted;
    } else if (pId === 'fivesim' || pId === '5sim') {
      encrypted = this.data.settings.fivesim_api_key_encrypted;
    }
    if (!encrypted) return null;

    try {
      return decryptSecret(encrypted, () => {
        try {
          const plain = decryptSecret(encrypted!);
          const reEncrypted = encryptSecret(plain);
          if (pId === 'peakerr') {
            this.data.settings.peakerr_api_key_encrypted = reEncrypted;
          } else if (pId === 'eagainsmedia') {
            this.data.settings.eagainsmedia_api_key_encrypted = reEncrypted;
          } else if (pId === 'fivesim' || pId === '5sim') {
            this.data.settings.fivesim_api_key_encrypted = reEncrypted;
          }
          this.save();
        } catch {
          // ignore
        }
      });
    } catch (err) {
      console.warn(`[Database] Failed to decrypt stored ${providerId} API key:`, err);
      return null;
    }
  }

  public savePeakerrApiKey(plainKey: string, admin: User, ip: string = '127.0.0.1') {
    this.saveProviderApiKey('peakerr', plainKey, admin, ip);
  }

  public getPeakerrApiKey(): string | null {
    return this.getProviderApiKey('peakerr');
  }

  // --- USERS ---

  public getUsers(): User[] {
    return this.data.users.map(u => ({ ...u }));
  }

  public findUserById(id: string): User | undefined {
    return this.data.users.find(u => u.id === id);
  }

  public findUserByEmail(email: string): User | undefined {
    return this.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  public findUserByUsername(username: string): User | undefined {
    return this.data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  }

  public createUser(userData: Omit<User, 'id' | 'created_at' | 'updated_at'>): User {
    const now = new Date().toISOString();
    const newUser: User = {
      ...userData,
      id: `usr_${crypto.randomBytes(6).toString('hex')}`,
      created_at: now,
      updated_at: now
    };
    this.data.users.push(newUser);

    // Automatically create both NGN and USDT wallets
    this.data.wallets.push({
      id: `wal_${crypto.randomBytes(6).toString('hex')}`,
      user_id: newUser.id,
      currency: 'NGN',
      available_balance: 0,
      created_at: now,
      updated_at: now
    });
    this.data.wallets.push({
      id: `wal_${crypto.randomBytes(6).toString('hex')}`,
      user_id: newUser.id,
      currency: 'USDT',
      available_balance: 0,
      created_at: now,
      updated_at: now
    });

    this.save();
    return newUser;
  }

  public updateUser(id: string, updates: Partial<User>): User | null {
    const idx = this.data.users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    this.data.users[idx] = {
      ...this.data.users[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    this.save();
    return this.data.users[idx];
  }

  // --- WALLET & LEDGER ---

  public getWallets(userId: string): Wallet[] {
    return this.data.wallets.filter(w => w.user_id === userId);
  }

  public getWallet(userId: string, currency: Currency): Wallet {
    let wallet = this.data.wallets.find(w => w.user_id === userId && w.currency === currency);
    if (!wallet) {
      wallet = {
        id: `wal_${crypto.randomBytes(6).toString('hex')}`,
        user_id: userId,
        currency,
        available_balance: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.data.wallets.push(wallet);
      this.save();
    }
    return wallet;
  }

  public getTransactions(userId?: string): WalletTransaction[] {
    if (userId) {
      return this.data.wallet_transactions
        .filter(t => t.user_id === userId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return this.data.wallet_transactions
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  /**
   * Atomic wallet debit with double-entry ledger transaction.
   * Throws Error if balance is insufficient.
   */
  public debitWallet(
    userId: string,
    currency: Currency,
    amount: number,
    referenceType: 'order' | 'payment' | 'manual' | 'refund',
    referenceId: string,
    description: string
  ): { success: boolean; transaction: WalletTransaction; newBalance: number } {
    const wallet = this.getWallet(userId, currency);
    if (wallet.available_balance < amount) {
      throw new Error(`Insufficient ${currency} balance. Required: ${amount.toLocaleString()}, Available: ${wallet.available_balance.toLocaleString()}`);
    }

    const before = wallet.available_balance;
    const after = Math.round((before - amount + Number.EPSILON) * 100) / 100;
    wallet.available_balance = after;
    wallet.updated_at = new Date().toISOString();

    const transaction: WalletTransaction = {
      id: `tx_${crypto.randomBytes(8).toString('hex')}`,
      wallet_id: wallet.id,
      user_id: userId,
      type: referenceType === 'order' ? 'order_debit' : 'admin_debit',
      amount,
      balance_before: before,
      balance_after: after,
      currency,
      reference_type: referenceType,
      reference_id: referenceId,
      description,
      status: 'completed',
      created_at: new Date().toISOString()
    };

    this.data.wallet_transactions.unshift(transaction);
    this.save();

    return { success: true, transaction, newBalance: after };
  }

  /**
   * Atomic wallet credit with double-entry ledger transaction.
   */
  public creditWallet(
    userId: string,
    currency: Currency,
    amount: number,
    referenceType: 'order' | 'payment' | 'manual' | 'refund',
    referenceId: string,
    description: string
  ): { success: boolean; transaction: WalletTransaction; newBalance: number } {
    const wallet = this.getWallet(userId, currency);
    const before = wallet.available_balance;
    const after = Math.round((before + amount + Number.EPSILON) * 100) / 100;
    wallet.available_balance = after;
    wallet.updated_at = new Date().toISOString();

    const transaction: WalletTransaction = {
      id: `tx_${crypto.randomBytes(8).toString('hex')}`,
      wallet_id: wallet.id,
      user_id: userId,
      type: referenceType === 'refund' ? 'refund' : (referenceType === 'payment' ? 'deposit' : 'admin_credit'),
      amount,
      balance_before: before,
      balance_after: after,
      currency,
      reference_type: referenceType,
      reference_id: referenceId,
      description,
      status: 'completed',
      created_at: new Date().toISOString()
    };

    this.data.wallet_transactions.unshift(transaction);
    this.save();

    return { success: true, transaction, newBalance: after };
  }

  // --- ORDERS ---

  public getOrders(userId?: string): Order[] {
    if (userId) {
      return this.data.orders
        .filter(o => o.user_id === userId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return this.data.orders
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public findOrderById(id: string): Order | undefined {
    return this.data.orders.find(o => o.id === id);
  }

  public generateUniqueOrderId(): string {
    let orderId = '';
    let attempts = 0;
    do {
      const timePart = Date.now().toString(36).toUpperCase();
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      orderId = `JFT-ORD-${timePart}-${randomSuffix}`;
      attempts++;
    } while (this.findOrderById(orderId) && attempts < 100);
    return orderId;
  }

  public createOrder(order: Order): Order {
    if (this.findOrderById(order.id)) {
      throw new Error(`Duplicate order ID collision detected: ${order.id}. Order IDs must be unique.`);
    }
    this.data.orders.unshift(order);
    this.save();
    return order;
  }

  public updateOrder(id: string, updates: Partial<Order>): Order | null {
    const idx = this.data.orders.findIndex(o => o.id === id);
    if (idx === -1) return null;
    this.data.orders[idx] = {
      ...this.data.orders[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    this.save();
    return this.data.orders[idx];
  }

  // --- NUMBER ORDERS (5sim) ---

  public getNumberOrders(userId?: string): NumberOrder[] {
    if (!this.data.number_orders) this.data.number_orders = [];
    if (userId) {
      return this.data.number_orders
        .filter(o => o.user_id === userId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return this.data.number_orders
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public getNumberOrdersByUser(userId: string): NumberOrder[] {
    return this.getNumberOrders(userId);
  }

  public findNumberOrderById(id: string): NumberOrder | undefined {
    if (!this.data.number_orders) this.data.number_orders = [];
    return this.data.number_orders.find(o => o.id === id);
  }

  public createNumberOrder(order: NumberOrder): NumberOrder {
    if (!this.data.number_orders) this.data.number_orders = [];
    this.data.number_orders.unshift(order);
    this.save();
    return order;
  }

  public updateNumberOrder(id: string, updates: Partial<NumberOrder>): NumberOrder | null {
    if (!this.data.number_orders) this.data.number_orders = [];
    const idx = this.data.number_orders.findIndex(o => o.id === id);
    if (idx === -1) return null;
    this.data.number_orders[idx] = {
      ...this.data.number_orders[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    this.save();
    return this.data.number_orders[idx];
  }

  /**
   * Strictly Enforced Admin Refund Protocol:
   * 1. Customer contacts support/WhatsApp.
   * 2. Administrator investigates.
   * 3. Admin executes refund from admin panel with mandatory reason & admin identity.
   * 4. Double-refund protection: throws error if already refunded.
   * 5. Credits wallet in exact order currency.
   * 6. Writes ledger entry.
   * 7. Creates notification for customer.
   * 8. Records audit log.
   */
  public processRefund(
    orderId: string,
    admin: User,
    reason: string,
    ip: string = '127.0.0.1'
  ): { success: boolean; order: Order; refundedAmount: number } {
    const order = this.findOrderById(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found.`);
    }

    if (order.status === 'refunded' || order.refunded_at) {
      throw new Error(`Order ${orderId} has already been refunded. Duplicate refund prevented.`);
    }

    const refundAmount = order.customer_charge;

    // 1. Credit customer wallet
    this.creditWallet(
      order.user_id,
      order.currency,
      refundAmount,
      'refund',
      order.id,
      `Refund for Order ${order.id}: ${reason}`
    );

    // 2. Mark order refunded
    const now = new Date().toISOString();
    order.status = 'refunded';
    order.refunded_at = now;
    order.refund_reason = reason;
    order.refund_admin_id = admin.id;
    order.updated_at = now;
    this.save();

    // 3. Notify customer
    this.createNotification({
      user_id: order.user_id,
      type: 'refund',
      title: 'Order Refund Credited',
      message: `Your order ${order.id} has been refunded in the amount of ${order.currency} ${refundAmount.toLocaleString()}. Reason: ${reason}`,
      read: false,
      link: `/orders`
    });

    // 4. Record Audit Log
    this.addAuditLog({
      actor_id: admin.id,
      actor_name: admin.name,
      actor_role: admin.role,
      action: 'PROCESS_ORDER_REFUND',
      entity_type: 'order',
      entity_id: order.id,
      details: `Refunded ${order.currency} ${refundAmount} to user ${order.user_id}. Reason: ${reason}`,
      ip
    });

    return { success: true, order, refundedAmount: refundAmount };
  }

  public processSystemRefund(
    orderId: string,
    reason: string
  ): { success: boolean; order: Order; refundedAmount: number } {
    const order = this.findOrderById(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found.`);
    }

    if (order.status === 'refunded' || order.refunded_at) {
      throw new Error(`Order ${orderId} has already been refunded. Duplicate refund prevented.`);
    }

    const refundAmount = order.customer_charge;

    this.creditWallet(
      order.user_id,
      order.currency,
      refundAmount,
      'refund',
      order.id,
      `Auto-refund for Order ${order.id}: ${reason}`
    );

    const now = new Date().toISOString();
    order.status = 'failed';
    order.refunded_at = now;
    order.refund_reason = reason;
    order.refund_admin_id = 'system';
    order.updated_at = now;
    this.save();

    this.createNotification({
      user_id: order.user_id,
      type: 'refund',
      title: 'Order Failed — Automatically Refunded',
      message: `We couldn't complete your order ${order.id}, so it's been cancelled and ${order.currency} ${refundAmount.toLocaleString()} has been refunded to your wallet. Reason: ${reason}`,
      read: false,
      link: '/orders'
    });

    this.addAuditLog({
      actor_id: 'system',
      actor_name: 'Automation Engine',
      actor_role: 'system',
      action: 'AUTO_REFUND_FAILED_DISPATCH',
      entity_type: 'order',
      entity_id: order.id,
      details: `Auto-refunded ${order.currency} ${refundAmount} to user ${order.user_id} after repeated provider dispatch failure. Reason: ${reason}`,
      ip: 'system'
    });

    return { success: true, order, refundedAmount: refundAmount };
  }

  // --- SERVICES & CATEGORIES ---

  public getCategories(): Category[] {
    return this.data.categories.slice().sort((a, b) => a.sort_order - b.sort_order);
  }

  public updateCategory(id: string, updates: Partial<Category>): Category | null {
    const idx = this.data.categories.findIndex(c => c.id === id);
    if (idx === -1) return null;
    this.data.categories[idx] = { ...this.data.categories[idx], ...updates };
    this.save();
    return this.data.categories[idx];
  }

  public getServices(onlyActive: boolean = true): Service[] {
    if (onlyActive) {
      return this.data.services
        .filter(s => s.active && s.ordering_enabled)
        .sort((a, b) => a.sort_order - b.sort_order);
    }
    return this.data.services.slice().sort((a, b) => a.sort_order - b.sort_order);
  }

  public findServiceById(id: string): Service | undefined {
    return this.data.services.find(s => s.id === id);
  }

  public updateService(id: string, updates: Partial<Service>): Service | null {
    const idx = this.data.services.findIndex(s => s.id === id);
    if (idx === -1) return null;
    this.data.services[idx] = { ...this.data.services[idx], ...updates };
    this.save();
    return this.data.services[idx];
  }

  public setServices(services: Service[]) {
    this.data.services = services;
    this.save();
  }

  // --- GROUPED SERVICES (PARENT-CHILD MULTI-PROVIDER AGGREGATION) ---

  public getGroupedServices(onlyActive: boolean = true): GroupedService[] {
    const list = this.data.grouped_services || [];
    if (onlyActive) {
      return list.filter(g => g.active);
    }
    return list.slice();
  }

  public findGroupedServiceById(id: string): GroupedService | undefined {
    return (this.data.grouped_services || []).find(g => g.id === id);
  }

  public setGroupedServices(grouped: GroupedService[]) {
    this.data.grouped_services = grouped;
    this.save();
  }

  // --- PAYMENTS ---

  public getPayments(userId?: string): Payment[] {
    if (userId) {
      return this.data.payments
        .filter(p => p.user_id === userId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return this.data.payments
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public createPayment(payment: Payment): Payment {
    this.data.payments.unshift(payment);
    this.save();
    return payment;
  }

  public findPaymentByReference(ref: string): Payment | undefined {
    return this.data.payments.find(p => p.reference === ref);
  }

  public updatePayment(id: string, updates: Partial<Payment>): Payment | null {
    const idx = this.data.payments.findIndex(p => p.id === id);
    if (idx === -1) return null;
    this.data.payments[idx] = {
      ...this.data.payments[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    this.save();
    return this.data.payments[idx];
  }

  // --- SUPPORT TICKETS ---

  public getTickets(userId?: string): SupportTicket[] {
    if (userId) {
      return this.data.support_tickets
        .filter(t => t.user_id === userId)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }
    return this.data.support_tickets
      .slice()
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  public findTicketById(id: string): SupportTicket | undefined {
    return this.data.support_tickets.find(t => t.id === id);
  }

  public createTicket(ticket: Omit<SupportTicket, 'id' | 'ticket_number' | 'created_at' | 'updated_at'>): SupportTicket {
    const count = this.data.support_tickets.length + 105;
    const now = new Date().toISOString();
    const newTicket: SupportTicket = {
      ...ticket,
      id: `tkt_${crypto.randomBytes(6).toString('hex')}`,
      ticket_number: `JFT-TKT-${count}`,
      created_at: now,
      updated_at: now
    };
    this.data.support_tickets.unshift(newTicket);
    this.save();
    return newTicket;
  }

  public updateTicket(id: string, updates: Partial<SupportTicket>): SupportTicket | null {
    const idx = this.data.support_tickets.findIndex(t => t.id === id);
    if (idx === -1) return null;
    this.data.support_tickets[idx] = {
      ...this.data.support_tickets[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    this.save();
    return this.data.support_tickets[idx];
  }

  public getTicketMessages(ticketId: string): SupportMessage[] {
    return this.data.support_messages
      .filter(m => m.ticket_id === ticketId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  public addSupportMessage(msg: Omit<SupportMessage, 'id' | 'created_at'>): SupportMessage {
    const newMsg: SupportMessage = {
      ...msg,
      id: `msg_${crypto.randomBytes(6).toString('hex')}`,
      created_at: new Date().toISOString()
    };
    this.data.support_messages.push(newMsg);

    // Bump ticket updated_at
    const ticket = this.findTicketById(msg.ticket_id);
    if (ticket) {
      ticket.updated_at = new Date().toISOString();
      if (msg.sender_role === 'customer' && ticket.status === 'awaiting_customer') {
        ticket.status = 'open';
      }
    }
    this.save();
    return newMsg;
  }

  // --- NOTIFICATIONS ---

  public getNotifications(userId: string): NotificationItem[] {
    return this.data.notifications
      .filter(n => n.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public createNotification(item: Omit<NotificationItem, 'id' | 'created_at'>): NotificationItem {
    const notif: NotificationItem = {
      ...item,
      id: `notif_${crypto.randomBytes(6).toString('hex')}`,
      created_at: new Date().toISOString()
    };
    this.data.notifications.unshift(notif);
    this.save();
    return notif;
  }

  public markNotificationRead(id: string, userId: string): boolean {
    const notif = this.data.notifications.find(n => n.id === id && n.user_id === userId);
    if (notif) {
      notif.read = true;
      this.save();
      return true;
    }
    return false;
  }

  public markAllNotificationsRead(userId: string): void {
    this.data.notifications
      .filter(n => n.user_id === userId)
      .forEach(n => { n.read = true; });
    this.save();
  }

  // --- AUDIT LOGS ---

  public getAuditLogs(limit: number = 200): AuditLog[] {
    return this.data.audit_logs
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
  }

  public addAuditLog(item: Omit<AuditLog, 'id' | 'created_at'>): AuditLog {
    const log: AuditLog = {
      ...item,
      id: `aud_${crypto.randomBytes(6).toString('hex')}`,
      created_at: new Date().toISOString()
    };
    this.data.audit_logs.unshift(log);
    // Keep max 1000 logs in storage
    if (this.data.audit_logs.length > 1000) {
      this.data.audit_logs.pop();
    }
    this.save();
    return log;
  }

  // --- ACCOUNT STORE (PRE-MADE ACCOUNTS) ---

  public getAccountCategories(onlyActive: boolean = true): AccountCategory[] {
    const cats = this.data.accountCategories || [];
    return onlyActive ? cats.filter(c => c.active) : cats;
  }

  public getAvailableStockCount(categoryId: string): number {
    return (this.data.accountListings || []).filter(
      l => l.category_id === categoryId && l.status === 'available'
    ).length;
  }

  public getSoldCountByCategory(categoryId: string): number {
    return (this.data.accountOrders || []).filter(
      o => o.category_id === categoryId
    ).length;
  }

  public upsertAccountCategory(data: { id: string; name: string; description?: string; price_ngn: number; active?: boolean }): AccountCategory {
    if (!this.data.accountCategories) {
      this.data.accountCategories = [];
    }
    const idx = this.data.accountCategories.findIndex(c => c.id === data.id);
    const now = new Date().toISOString();
    if (idx >= 0) {
      this.data.accountCategories[idx] = {
        ...this.data.accountCategories[idx],
        name: data.name,
        description: data.description !== undefined ? data.description : this.data.accountCategories[idx].description,
        price_ngn: data.price_ngn,
        active: data.active !== undefined ? data.active : this.data.accountCategories[idx].active
      };
      this.save();
      return this.data.accountCategories[idx];
    } else {
      const newCat: AccountCategory = {
        id: data.id,
        name: data.name,
        description: data.description || '',
        price_ngn: data.price_ngn,
        active: data.active ?? true,
        created_at: now
      };
      this.data.accountCategories.push(newCat);
      this.save();
      return newCat;
    }
  }

  public addAccountStock(categoryId: string, credentials: Array<{ email: string; password: string }>): number {
    const now = new Date().toISOString();
    const newListings: AccountListing[] = credentials.map(c => ({
      id: `acct_${crypto.randomBytes(8).toString('hex')}`,
      category_id: categoryId,
      status: 'available',
      email_encrypted: encryptSecret(c.email),
      password_encrypted: encryptSecret(c.password),
      added_at: now
    }));
    this.data.accountListings = [...(this.data.accountListings || []), ...newListings];
    this.save();
    return newListings.length;
  }

  // Claims one available listing for a category and marks it sold, atomically —
  // no `await` happens between reading availability and writing the sold state,
  // so two simultaneous purchase requests can never claim the same listing
  // (Node's event loop can't interleave synchronous code).
  public claimAccountListing(categoryId: string, userId: string, orderId: string): AccountListing {
    const listing = (this.data.accountListings || []).find(
      l => l.category_id === categoryId && l.status === 'available'
    );
    if (!listing) {
      throw new Error('This account type is currently out of stock.');
    }
    listing.status = 'sold';
    listing.sold_to_user_id = userId;
    listing.sold_order_id = orderId;
    listing.sold_at = new Date().toISOString();
    this.save();
    return listing;
  }

  public createAccountOrder(data: Omit<AccountOrder, 'created_at'> & { id?: string; created_at?: string }): AccountOrder {
    const order: AccountOrder = {
      ...data,
      id: data.id || `acctord_${crypto.randomBytes(8).toString('hex')}`,
      created_at: data.created_at || new Date().toISOString()
    };
    this.data.accountOrders = [...(this.data.accountOrders || []), order];
    this.save();
    return order;
  }

  public getAccountOrdersByUser(userId: string): AccountOrder[] {
    return (this.data.accountOrders || []).filter(o => o.user_id === userId);
  }

  public getAllAccountOrders(): AccountOrder[] {
    return (this.data.accountOrders || []).slice();
  }

  public getAccountListingById(id: string): AccountListing | undefined {
    return (this.data.accountListings || []).find(l => l.id === id);
  }
}

export const db = new Database();
