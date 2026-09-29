import express, { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { db, hashPassword, verifyPassword, encryptSecret, decryptSecret } from './server/db.js';
import { PeakerrClient, ServiceProvider } from './server/peakerrClient.js';
import { EagainsmediaClient } from './server/eagainsmediaClient.js';
import { FiveSimClient } from './server/fiveSimClient.js';
import { calculateOrderPrice, calculateNumberPrice, roundMoney } from './server/pricingEngine.js';
import { AutomationEngine } from './server/automation.js';
import { User, Currency, NumberOrder, AccountCategory, AccountListing, AccountOrder } from './src/types/index.js';
import { verifyMirrorAtBoot } from './server/supabaseMirror.js';
import { maybeRestoreFromMirror } from './server/supabaseRestore.js';

dotenv.config();

const app = express();
const PORT = 3000;

// Behind Render's load balancer: needed so req.ip is the real visitor
// (without this, rate limiting would throttle all users as one).
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true, limit: '200kb' }));

// ---- Gzip responses (the 1MB+ JS bundle shrinks to ~1/4 over the wire) ----
app.use(compression());

// ---- Security headers (no dependencies, safe subset that cannot break
// the Vite bundle or the Paystack inline script) ----
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// ---- Lightweight rate limiting (in-memory; single instance) ----
// Fails open: any limiter error skips straight to next(), never blocks legit traffic.
const rateBuckets = new Map<string, number[]>();
function rateLimit(maxHits: number, windowMs: number) {
  return (req: any, res: any, next: any) => {
    try {
      const key = `${req.ip || 'anon'}:${req.path}`;
      const now = Date.now();
      const hits = (rateBuckets.get(key) || []).filter(t => now - t < windowMs);
      hits.push(now);
      rateBuckets.set(key, hits);
      if (rateBuckets.size > 5000) {
        for (const [k, v] of rateBuckets) {
          if (v.length === 0 || now - v[v.length - 1] > windowMs) rateBuckets.delete(k);
          if (rateBuckets.size < 4000) break;
        }
      }
      if (hits.length > maxHits) {
        return res.status(429).json({ success: false, error: 'Too many requests. Please slow down and retry.' });
      }
      next();
    } catch {
      next();
    }
  };
}
const authLimiter = rateLimit(20, 60 * 1000); // login/register: 20 per minute per IP
const moneyLimiter = rateLimit(30, 60 * 1000); // orders/payments/numbers: 30 per minute per IP
app.use('/api/auth/', authLimiter);

// Initialize Provider Clients & Automation Engine
// Prefer keys saved through the admin panel (encrypted in DB) over .env values
const initialSettings = db.getSettings();
const persistedPeakerrKey = db.getProviderApiKey('peakerr');
const peakerr = new PeakerrClient(
  persistedPeakerrKey || process.env.PEAKERR_API_KEY || '',
  initialSettings.peakerr_api_url
);
if (persistedPeakerrKey && peakerr.isLive()) {
  console.log('[Startup] Loaded Peakerr API key from persisted settings.');
} else if (process.env.PEAKERR_API_KEY && peakerr.isLive()) {
  console.log('[Startup] Loaded Peakerr API key from environment variable.');
} else {
  console.info('[Startup] No live Peakerr API key configured — running in demo/mock mode.');
}

const persistedEagainsmediaKey = db.getProviderApiKey('eagainsmedia');
const eagainsmedia = new EagainsmediaClient(
  persistedEagainsmediaKey || process.env.EAGAINSMEDIA_API_KEY || '',
  initialSettings.eagainsmedia_api_url
);
if (persistedEagainsmediaKey) {
  console.log('[Startup] Loaded Eagainsmedia API key from persisted settings.');
} else if (process.env.EAGAINSMEDIA_API_KEY) {
  console.log('[Startup] Loaded Eagainsmedia API key from environment variable.');
}

const persistedFiveSimKey = db.getProviderApiKey('fivesim');
const fiveSim = new FiveSimClient(persistedFiveSimKey || process.env.FIVESIM_API_KEY || '');
if (persistedFiveSimKey) {
  console.log('[Startup] Loaded 5sim API key from persisted settings.');
} else if (process.env.FIVESIM_API_KEY) {
  console.log('[Startup] Loaded 5sim API key from environment variable.');
}

function getProviderClient(providerId?: string): ServiceProvider {
  if (providerId && providerId.toLowerCase() === 'eagainsmedia') {
    return eagainsmedia;
  }
  return peakerr;
}

const automation = new AutomationEngine(getProviderClient);
automation.start();

// Self keep-alive: while this instance is awake, knock on our own public
// /api/health every 10 minutes so the host never sees 15 idle minutes.
// Honest limits: this PREVENTS sleep, it cannot WAKE a sleeping server
// (timers don't run while asleep) - keep the external pinger as the waker.
// Bandwidth cost is ~100 bytes per knock. Never touches money or the DB.
{
  const SELF_PING_MINUTES = 10;
  const publicUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');
  if (!publicUrl || !/^https?:\/\//i.test(publicUrl)) {
    console.log('[KeepAlive] APP_URL not set - self-ping disabled (set APP_URL to enable).');
  } else {
    const knock = async () => {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 10000);
        await fetch(`${publicUrl}/api/health`, { signal: controller.signal });
        clearTimeout(t);
      } catch {
        // Asleep, restarting, or network blip - next knock in 10 minutes.
        // External pinger handles the wake-up.
      }
    };
    const timer = setInterval(knock, SELF_PING_MINUTES * 60 * 1000);
    if (typeof (timer as any).unref === 'function') (timer as any).unref();
    console.log(`[KeepAlive] Self-ping enabled: ${publicUrl}/api/health every ${SELF_PING_MINUTES}min.`);
  }
}

// Live Supabase mirror reconciliation log (warn-only, never blocks startup).
// Reads still come from the local JSON file; this only reports counts.
try {
  verifyMirrorAtBoot(db.getMirrorCounts());
} catch {
  // intentionally silent
}

// Simple in-memory session token store (token -> userId)
const activeSessions = new Map<string, string>();

// Dev-only convenience sessions. These are NEVER seeded in production, and
// even in development they're random per-boot tokens (not fixed strings),
// logged once to the console so a developer can copy them if needed.
if (process.env.NODE_ENV !== 'production') {
  const adminUser = db.findUserByEmail('admin@jftsocials.online');
  if (adminUser) {
    const devAdminToken = `dev_admin_${crypto.randomBytes(24).toString('hex')}`;
    activeSessions.set(devAdminToken, adminUser.id);
    console.log(`[dev] Admin session token: ${devAdminToken}`);
  }
  const demoUser = db.findUserByEmail('customer@jftsocials.online');
  if (demoUser) {
    const devDemoToken = `dev_demo_${crypto.randomBytes(24).toString('hex')}`;
    activeSessions.set(devDemoToken, demoUser.id);
    console.log(`[dev] Demo customer session token: ${devDemoToken}`);
  }
}

// --- AUTH MIDDLEWARE ---
interface AuthenticatedRequest extends Request {
  user?: User;
}

function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '') || (req.headers['x-session-token'] as string);

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required. Please log in.' });
  }

  const userId = activeSessions.get(token);
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Invalid or expired session. Please log in again.' });
  }

  const user = db.findUserById(userId);
  if (!user || user.status === 'suspended') {
    return res.status(403).json({ success: false, error: 'User account is inactive or suspended.' });
  }

  req.user = user;
  next();
}

function verifyAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  authenticate(req, res, () => {
    if (!req.user || !['admin', 'superadmin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied. Administrative privileges required.' });
    }
    next();
  });
}

// -----------------------------
// PUBLIC & CLIENT ROUTES
// -----------------------------

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    platform: 'JFT Socials',
    version: '2.0.0-enterprise',
    timestamp: new Date().toISOString()
  });
});

// Platform public configuration & WhatsApp contact info
app.get('/api/public/config', (req, res) => {
  const settings = db.getSettings();
  res.json({
    success: true,
    platform_name: settings.platform_name,
    primary_domain: settings.primary_domain,
    whatsapp_support_number: settings.whatsapp_support_number,
    maintenance_mode: settings.maintenance_mode,
    maintenance_message: settings.maintenance_message,
    exchange_rate_usd_ngn: settings.exchange_rate_usd_ngn,
    payment_fee_percentage: settings.payment_fee_percentage,
    payment_fee_enabled: settings.payment_fee_enabled,
    usdt_trc20_address: settings.usdt_trc20_address,
    paystack_public_key: process.env.PAYSTACK_PUBLIC_KEY || '',
    usdt_network: settings.usdt_network,
    min_deposit_ngn: settings.min_deposit_ngn,
    min_deposit_usdt: settings.min_deposit_usdt
  });
});

// Public liveness badge. Booleans only - balances and secrets never leave
// the server here. Cached 60s so page loads don't hammer upstream APIs.
let publicStatusCache: { at: number; data: any } | null = null;
app.get('/api/public/status', async (req, res) => {
  try {
    if (publicStatusCache && Date.now() - publicStatusCache.at < 60 * 1000) {
      return res.json({ success: true, ...publicStatusCache.data });
    }
    const peakerrLive = peakerr.isLive();
    const eagainsLive = eagainsmedia.isLive();
    let canDeliver = peakerrLive || eagainsLive;
    try {
      const [pb, eb] = await Promise.all([peakerr.getBalance(), eagainsmedia.getBalance()]);
      const pOk = peakerrLive && !pb.error && pb.balance > 0;
      const eOk = eagainsLive && !eb.error && eb.balance > 0;
      canDeliver = pOk || eOk;
    } catch {
      // balance check failed - fall back to key validity
    }
    const data = { peakerr_live: peakerrLive, eagainsmedia_live: eagainsLive, ordering_ok: canDeliver };
    publicStatusCache = { at: Date.now(), data };
    res.json({ success: true, ...data });
  } catch (err: any) {
    res.json({ success: true, peakerr_live: false, eagainsmedia_live: false, ordering_ok: false });
  }
});

// -----------------------------
// AUTHENTICATION
// -----------------------------

app.post('/api/auth/register', (req, res) => {
  try {
    const { name, username, email, password } = req.body;

    if (!name || !username || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, username, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
    }

    if (db.findUserByEmail(email)) {
      return res.status(400).json({ success: false, error: 'An account with this email address already exists.' });
    }

    if (db.findUserByUsername(username)) {
      return res.status(400).json({ success: false, error: 'Username is already taken. Please choose another.' });
    }

    const newUser = db.createUser({
      name,
      username: username.toLowerCase().trim(),
      email: email.toLowerCase().trim(),
      password_hash: hashPassword(password),
      role: 'customer',
      status: 'active',
      email_verified: true
    });

    const token = `sess_${crypto.randomBytes(16).toString('hex')}`;
    activeSessions.set(token, newUser.id);

    // Initial welcome notification
    db.createNotification({
      user_id: newUser.id,
      type: 'system',
      title: 'Welcome to JFT Socials!',
      message: 'Your account and multi-currency wallets (NGN & USDT) are ready. Fund your wallet to begin placing orders.',
      read: false,
      link: '/wallet'
    });

    res.json({
      success: true,
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({ success: false, error: 'Email or username and password are required.' });
    }

    const user = db.findUserByEmail(login) || db.findUserByUsername(login);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials. Please verify your login details.' });
    }

    const passwordOk = verifyPassword(password, user.password_hash, (newHash) => {
      // Transparent migration: this account was still on the old SHA-256
      // scheme, and the password just checked out — upgrade it to bcrypt now.
      user.password_hash = newHash;
      db.updateUser(user.id, { password_hash: newHash });
    });

    if (!passwordOk) {
      return res.status(401).json({ success: false, error: 'Invalid credentials. Please verify your login details.' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, error: 'Your account has been suspended. Please contact WhatsApp support.' });
    }

    const token = `sess_${crypto.randomBytes(16).toString('hex')}`;
    activeSessions.set(token, user.id);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/auth/me', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const wallets = db.getWallets(user.id);
  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      created_at: user.created_at
    },
    wallets
  });
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '') || (req.headers['x-session-token'] as string);
  if (token) {
    activeSessions.delete(token);
  }
  res.json({ success: true, message: 'Logged out successfully.' });
});

app.post('/api/auth/change-password', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, error: 'Current password and new password are required.' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters.' });
    }

    const passwordOk = verifyPassword(current_password, user.password_hash);
    if (!passwordOk) {
      return res.status(400).json({ success: false, error: 'Current password is incorrect.' });
    }

    const newHash = hashPassword(new_password);
    user.password_hash = newHash;
    db.updateUser(user.id, { password_hash: newHash });

    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------
// SERVICES & CATEGORIES
// -----------------------------

app.get('/api/categories', (req, res) => {
  const categories = db.getCategories().filter(c => c.active);
  res.json({ success: true, categories });
});

app.get('/api/services', (req, res) => {
  const currency = (req.query.currency as Currency) || 'NGN';
  const settings = db.getSettings();
  const services = db.getServices(true);
  const categories = db.getCategories();

  // Map services to customer view with calculated price for 1,000 units
  // CRITICAL: Filter out provider_rate, provider_charge, profit metrics!
  // Rank from cheapest to highest
  const customerServices = services.map(service => {
    const category = categories.find(c => c.id === service.category_id);
    const pricing = calculateOrderPrice({
      service,
      category,
      quantity: 1000,
      currency,
      settings
    });

    return {
      id: service.id,
      name: service.name,
      description: service.description,
      category_id: service.category_id,
      min_quantity: service.min_quantity === 50 ? 10 : (service.min_quantity || 10),
      max_quantity: service.max_quantity,
      refill_supported: service.refill_supported,
      cancel_supported: service.cancel_supported,
      price_per_1000: pricing.customer_price,
      currency
    };
  }).sort((a, b) => a.price_per_1000 - b.price_per_1000);

  res.json({ success: true, services: customerServices });
});

// Grouped services catalog (cross-provider aggregated parent entities with child provider options)
app.get('/api/services/grouped', (req, res) => {
  const currency = (req.query.currency as Currency) || 'NGN';
  const settings = db.getSettings();
  const exchangeRate = settings.exchange_rate_usd_ngn > 0 ? settings.exchange_rate_usd_ngn : 1500;
  const groups = db.getGroupedServices(true);

  // If currency is USDT, convert prices dynamically
  const converted = groups.map(g => {
    const bestPrice = currency === 'USDT'
      ? Math.round((g.best_price_per_1000 / exchangeRate) * 100) / 100
      : g.best_price_per_1000;

    const options = (g.provider_options || []).map(opt => ({
      ...opt,
      customer_price_per_1000: currency === 'USDT'
        ? Math.round((opt.customer_price_per_1000 / exchangeRate) * 100) / 100
        : opt.customer_price_per_1000
    }));

    return {
      ...g,
      currency,
      best_price_per_1000: bestPrice,
      provider_options: options
    };
  });

  res.json({ success: true, groups: converted });
});

// Calculate live price for specific quantity before order submission (supports GET & POST)
const handleCalculatePrice = (req: any, res: any) => {
  try {
    const service_id = (req.query?.service_id || req.body?.service_id) as string;
    const rawQuantity = req.query?.quantity !== undefined ? req.query.quantity : req.body?.quantity;
    const rawCurrency = (req.query?.currency || req.body?.currency || 'NGN') as string;
    const currency = (rawCurrency.toUpperCase() === 'USDT' ? 'USDT' : 'NGN') as Currency;

    if (!service_id || rawQuantity === undefined || rawQuantity === null || rawQuantity === '') {
      return res.status(400).json({ success: false, error: 'service_id and quantity are required' });
    }

    const quantity = Number(rawQuantity);
    if (isNaN(quantity) || quantity <= 0) {
      return res.status(400).json({ success: false, error: 'Valid positive quantity is required' });
    }

    const service = db.findServiceById(service_id);
    if (!service) {
      return res.status(404).json({ success: false, error: 'Service not found' });
    }

    const settings = db.getSettings();
    const pricing = calculateOrderPrice({
      service,
      quantity,
      currency,
      settings
    });

    const quote = {
      service_id: service.id,
      quantity,
      currency: pricing.currency,
      customer_charge: pricing.customer_price,
      customer_price: pricing.customer_price,
      total_charge: pricing.total_charge,
      payment_fee: pricing.payment_fee,
      provider_cost: pricing.provider_cost,
      applied_markup: pricing.applied_markup
    };

    // Return both nested quote object and top-level fields for client interoperability
    res.json({
      success: true,
      quote,
      customer_charge: pricing.customer_price,
      customer_price: pricing.customer_price,
      total_charge: pricing.total_charge,
      currency: pricing.currency,
      payment_fee: pricing.payment_fee
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

app.get('/api/services/calculate-price', handleCalculatePrice);
app.post('/api/services/calculate-price', handleCalculatePrice);

// -----------------------------
// ORDERS (CUSTOMER)
// -----------------------------

app.post('/api/orders', moneyLimiter, authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const rawServiceId = req.body.service_id || req.body.serviceId || req.body.service;
    const rawTargetLink = req.body.target_link || req.body.link || req.body.targetLink || req.body.url || '';
    const rawQuantity = req.body.quantity;
    const currency = req.body.currency || 'NGN';

    if (!rawServiceId || !rawTargetLink || rawQuantity === undefined || rawQuantity === null || rawQuantity === '') {
      return res.status(400).json({ success: false, error: 'Service, target link, and quantity are required.' });
    }

    const service_id = String(rawServiceId).trim();
    let target_link = String(rawTargetLink).trim();

    const numQuantity = parseInt(String(rawQuantity), 10);
    if (isNaN(numQuantity) || numQuantity <= 0) {
      return res.status(400).json({ success: false, error: 'Quantity must be a positive integer.' });
    }

    let service = db.findServiceById(service_id);
    // If client sent a grouped service ID (e.g. grp_tiktok_views_standard), resolve to best child option
    if (!service && service_id.startsWith('grp_')) {
      const grouped = db.findGroupedServiceById(service_id);
      if (grouped && grouped.provider_options && grouped.provider_options.length > 0) {
        const bestOption = grouped.provider_options[0];
        service = db.findServiceById(bestOption.service_id);
      }
    }

    if (!service || !service.active || !service.ordering_enabled) {
      return res.status(400).json({ success: false, error: 'This service is currently unavailable for ordering.' });
    }

    const minRequired = service.min_quantity === 50 ? 10 : (service.min_quantity || 10);
    if (numQuantity < minRequired) {
      return res.status(400).json({ success: false, error: `Minimum quantity for this service is ${minRequired.toLocaleString()}.` });
    }

    if (numQuantity > service.max_quantity) {
      return res.status(400).json({ success: false, error: `Maximum quantity for this service is ${service.max_quantity.toLocaleString()}.` });
    }

    // Flexible link URL validation and normalization
    if (!target_link.startsWith('http://') && !target_link.startsWith('https://') && !target_link.startsWith('@')) {
      if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/i.test(target_link)) {
        target_link = `https://${target_link}`;
      } else if (!target_link.includes('/') && !target_link.includes(' ')) {
        target_link = `@${target_link}`;
      } else {
        return res.status(400).json({ success: false, error: 'Please enter a valid link or handle (e.g. https://instagram.com/user or @username).' });
      }
    }

    const settings = db.getSettings();
    const orderCurrency = (currency as Currency) === 'USDT' ? 'USDT' : 'NGN';

    // Duplicate-submission guard: an identical order (same service, link,
    // quantity) placed within the last 90 seconds is a double-click, not a
    // second order. Return the original instead of charging twice.
    const dupeWindowMs = 90 * 1000;
    const dupe = db.getOrders(user.id).find(o =>
      o.service_id === service.id &&
      o.target_link === target_link &&
      o.quantity === numQuantity &&
      o.currency === orderCurrency &&
      !['cancelled', 'refunded', 'failed'].includes(o.status) &&
      (Date.now() - new Date(o.created_at).getTime()) < dupeWindowMs
    );
    if (dupe) {
      const dupeWallet = db.getWallets(user.id).find(w => w.currency === orderCurrency);
      console.log(`[OrderCreation] Duplicate submission blocked for ${user.id} - returning existing ${dupe.id}`);
      return res.json({
        success: true,
        duplicate: true,
        order: {
          id: dupe.id,
          service_name: dupe.service_name,
          target_link: dupe.target_link,
          link: dupe.target_link,
          quantity: dupe.quantity,
          customer_charge: dupe.customer_charge,
          currency: dupe.currency,
          status: dupe.status,
          created_at: dupe.created_at
        },
        remaining_balance: dupeWallet?.available_balance || 0
      });
    }

    // 1. Calculate price server-side using strict JFT Socials formula
    const pricing = calculateOrderPrice({
      service,
      quantity: numQuantity,
      currency: orderCurrency,
      settings
    });

    // 2. Validate wallet balance before debiting
    const userWallets = db.getWallets(user.id);
    const activeWallet = userWallets.find(w => w.currency === orderCurrency);
    const availableBalance = activeWallet?.available_balance || 0;
    if (availableBalance < pricing.customer_price) {
      return res.status(400).json({
        success: false,
        error: `Insufficient ${orderCurrency} balance. Required: ${orderCurrency === 'NGN' ? '₦' : ''}${pricing.customer_price.toLocaleString()} ${orderCurrency}, Available: ${orderCurrency === 'NGN' ? '₦' : ''}${availableBalance.toLocaleString()} ${orderCurrency}. Please fund your wallet first.`
      });
    }

    const orderId = db.generateUniqueOrderId();
    const debitResult = db.debitWallet(
      user.id,
      orderCurrency,
      pricing.customer_price,
      'order',
      orderId,
      `Order ${orderId}: ${service.name} (${numQuantity.toLocaleString()} units)`
    );

    // 3. Dispatch to Provider API v2
    const targetProviderId = service.provider_id || (service.id.includes('eagains') ? 'eagainsmedia' : 'peakerr');
    const providerClient = getProviderClient(targetProviderId);
    let providerOrderId: number | string = 0;
    let dispatchFailed = false;
    let finalProviderId = targetProviderId;

    let providerServiceId = service.provider_service_id;
    if (!providerServiceId) {
      const match = service.id.match(/\d+$/);
      if (match) providerServiceId = parseInt(match[0], 10);
    }

    console.log(`[OrderCreation] Order ${orderId}: Dispatching to provider=${targetProviderId}, providerServiceId=${providerServiceId}, qty=${numQuantity}, link=${target_link}`);

    try {
      const providerRes = await providerClient.addOrder(
        providerServiceId || 0,
        target_link,
        numQuantity
      );
      console.log(`[OrderCreation] Provider response for ${orderId}:`, providerRes);
      if (providerRes.orderId) {
        providerOrderId = providerRes.orderId;
      } else {
        dispatchFailed = true;
        console.warn(`[OrderCreation] Provider warning for ${orderId}: ${providerRes.error}`);
      }
    } catch (e: any) {
      dispatchFailed = true;
      console.error(`[OrderCreation] Provider call failed for ${orderId}:`, e);
    }

    // Multi-provider automatic failover: If primary provider (e.g. Peakerr) fails or lacks funds, route to Engainsmedia
    if (dispatchFailed && targetProviderId === 'peakerr') {
      try {
        const engainsClient = getProviderClient('eagainsmedia');
        if (engainsClient && engainsClient.isLive()) {
          const engService = db.getServices(true).find(s =>
            (s.provider_id === 'eagainsmedia' || s.id.includes('eagains')) &&
            typeof s.provider_service_id === 'number' && s.provider_service_id >= 1000 &&
            s.category_id === service.category_id &&
            /view/i.test(s.name) === /view/i.test(service.name)
          );
          if (engService && engService.provider_service_id) {
            console.log(`[OrderCreation] Multi-provider failover: Routing order ${orderId} to Engainsmedia (Service #${engService.provider_service_id})...`);
            const fallbackRes = await engainsClient.addOrder(
              engService.provider_service_id,
              target_link,
              numQuantity
            );
            console.log(`[OrderCreation] Engainsmedia failover response for ${orderId}:`, fallbackRes);
            if (fallbackRes && fallbackRes.orderId) {
              providerOrderId = fallbackRes.orderId;
              finalProviderId = 'eagainsmedia';
              dispatchFailed = false;
              console.log(`[OrderCreation] Failover to Engainsmedia SUCCESS: Remote Order ID #${providerOrderId}`);
            }
          }
        }
      } catch (err: any) {
        console.warn(`[OrderCreation] Failover attempt to Engainsmedia error:`, err.message);
      }
    }

    // Reverse failover: If Engainsmedia rejects (e.g. "Missing username"),
    // try the closest Peakerr equivalent in the same category before parking
    // the order as processing.
    if (dispatchFailed && targetProviderId === 'eagainsmedia') {
      try {
        const peakerrClient = getProviderClient('peakerr');
        if (peakerrClient && peakerrClient.isLive()) {
          const peakerrService = db.getServices(true).find(s =>
            (s.provider_id === 'peakerr' || s.id.includes('peakerr')) &&
            typeof s.provider_service_id === 'number' && s.provider_service_id >= 1000 &&
            s.category_id === service.category_id &&
            /view/i.test(s.name) === /view/i.test(service.name)
          );
          if (peakerrService && peakerrService.provider_service_id) {
            console.log(`[OrderCreation] Reverse failover: Routing order ${orderId} to Peakerr (Service #${peakerrService.provider_service_id})...`);
            const fallbackRes = await peakerrClient.addOrder(
              peakerrService.provider_service_id,
              target_link,
              numQuantity
            );
            console.log(`[OrderCreation] Peakerr failover response for ${orderId}:`, fallbackRes);
            if (fallbackRes && fallbackRes.orderId) {
              providerOrderId = fallbackRes.orderId;
              finalProviderId = 'peakerr';
              dispatchFailed = false;
              console.log(`[OrderCreation] Failover to Peakerr SUCCESS: Remote Order ID #${providerOrderId}`);
            }
          }
        }
      } catch (err: any) {
        console.warn(`[OrderCreation] Failover attempt to Peakerr error:`, err.message);
      }
    }

    // 4. Record order with historical pricing snapshot
    const now = new Date().toISOString();
    const newOrder = db.createOrder({
      id: orderId,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      service_id: service.id,
      service_name: service.name,
      provider_id: finalProviderId,
      provider_service_id: service.provider_service_id,
      provider_order_id: providerOrderId || undefined,
      target_link,
      quantity: numQuantity,
      provider_charge: pricing.provider_cost,
      customer_charge: pricing.customer_price,
      markup_amount: pricing.applied_markup,
      markup_percentage: pricing.percentage_markup,
      minimum_markup: pricing.minimum_markup,
      applied_markup: pricing.applied_markup,
      payment_fee: pricing.payment_fee,
      net_profit: pricing.net_profit,
      currency: orderCurrency,
      exchange_rate_used: pricing.exchange_rate_used,
      pricing_rule_version: pricing.pricing_rule_version,
      start_count: 0,
      remains: numQuantity,
      status: providerOrderId ? 'in_progress' : 'processing',
      provider_status: providerOrderId ? 'In progress' : 'Awaiting Provider',
      refill_eligible: service.refill_supported,
      cancel_eligible: service.cancel_supported,
      dispatch_attempts: dispatchFailed ? 1 : 0,
      last_dispatch_attempt_at: dispatchFailed ? now : undefined,
      created_at: now,
      updated_at: now
    });

    // 5. Notify customer
    db.createNotification({
      user_id: user.id,
      type: 'order',
      title: dispatchFailed ? 'Order Received — Processing' : 'Order Placed Successfully',
      message: dispatchFailed
        ? `Your order ${newOrder.id} for ${service.name} (${numQuantity.toLocaleString()} units) has been received and is being processed. We'll notify you once it's confirmed.`
        : `Your order ${newOrder.id} for ${service.name} (${numQuantity.toLocaleString()} units) is now in progress.`,
      read: false,
      link: '/orders'
    });

    res.json({
      success: true,
      order: {
        id: newOrder.id,
        service_name: newOrder.service_name,
        target_link: newOrder.target_link,
        link: newOrder.target_link,
        quantity: newOrder.quantity,
        customer_charge: newOrder.customer_charge,
        currency: newOrder.currency,
        status: newOrder.status,
        created_at: newOrder.created_at
      },
      remaining_balance: debitResult.newBalance
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/orders', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const orders = db.getOrders(user.id);

  // Strip confidential margins and internal provider cost for customer privacy
  const sanitized = orders.map(o => ({
    id: o.id,
    service_name: o.service_name,
    target_link: o.target_link,
    link: o.target_link || o.link || '',
    quantity: o.quantity,
    customer_charge: o.customer_charge,
    currency: o.currency,
    start_count: o.start_count,
    remains: o.remains,
    status: o.status,
    refill_eligible: o.refill_eligible && o.status === 'completed',
    cancel_eligible: o.cancel_eligible && ['pending', 'processing', 'in_progress'].includes(o.status),
    created_at: o.created_at,
    updated_at: o.updated_at,
    completed_at: o.completed_at
  }));

  res.json({ success: true, orders: sanitized });
});

app.get('/api/orders/:id', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const order = db.findOrderById(req.params.id);

  if (!order || (order.user_id !== user.id && !['admin', 'superadmin'].includes(user.role))) {
    return res.status(404).json({ success: false, error: 'Order not found' });
  }

  res.json({
    success: true,
    order: {
      id: order.id,
      service_name: order.service_name,
      target_link: order.target_link,
      link: order.target_link || order.link || '',
      quantity: order.quantity,
      customer_charge: order.customer_charge,
      currency: order.currency,
      start_count: order.start_count,
      remains: order.remains,
      status: order.status,
      refill_eligible: order.refill_eligible && order.status === 'completed',
      cancel_eligible: order.cancel_eligible && ['pending', 'processing', 'in_progress'].includes(order.status),
      created_at: order.created_at,
      updated_at: order.updated_at,
      completed_at: order.completed_at
    }
  });
});

app.post('/api/orders/:id/refill', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const order = db.findOrderById(req.params.id);

    if (!order || order.user_id !== user.id) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (order.status !== 'completed' || !order.refill_eligible) {
      return res.status(400).json({ success: false, error: 'This order is not eligible for automated refill.' });
    }

    // Check cooldown (allow once every 24h)
    if (order.last_refill_requested_at) {
      const diff = Date.now() - new Date(order.last_refill_requested_at).getTime();
      if (diff < 24 * 60 * 60 * 1000) {
        return res.status(400).json({ success: false, error: 'Refill has already been requested for this order within the last 24 hours.' });
      }
    }

    if (order.provider_order_id) {
      await getProviderClient(order.provider_id).createRefill(order.provider_order_id);
    }

    db.updateOrder(order.id, {
      last_refill_requested_at: new Date().toISOString()
    });

    db.createNotification({
      user_id: user.id,
      type: 'order',
      title: 'Refill Request Received',
      message: `Automated refill request for order ${order.id} has been submitted to the provider network.`,
      read: false,
      link: '/orders'
    });

    res.json({ success: true, message: 'Refill task dispatched successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/orders/:id/cancel', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const order = db.findOrderById(req.params.id);

    if (!order || order.user_id !== user.id) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (!['pending', 'processing', 'in_progress'].includes(order.status) || !order.cancel_eligible) {
      return res.status(400).json({ success: false, error: 'Order cannot be cancelled at this stage or cancellation is not eligible for this service.' });
    }

    if (order.provider_order_id) {
      await getProviderClient(order.provider_id).cancelOrders([order.provider_order_id]);
    }

    db.updateOrder(order.id, {
      status: 'cancelled',
      provider_status: 'Cancelled'
    });

    res.json({ success: true, message: 'Cancellation submitted. If eligible for refund, contact WhatsApp support or open a ticket.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------
// VIRTUAL NUMBERS (5SIM) API
// -----------------------------

app.get('/api/numbers/countries', async (req, res) => {
  try {
    const countries = await fiveSim.getCountries();
    res.json({ success: true, countries });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/numbers/products', async (req, res) => {
  try {
    const country = (req.query.country as string) || 'any';
    const operator = (req.query.operator as string) || 'any';
    const rawProducts = await fiveSim.getProducts(country, operator);
    const settings = db.getSettings();

    // Only sellable inventory: zero-stock products are hidden so customers
    // never pay for a number that isn't there (backend double-guard; the
    // order endpoint rejects Qty 0 independently).
    const products = Object.entries(rawProducts)
      .filter(([, details]) => (details.Qty || 0) > 0)
      .map(([name, details]) => {
      let priceNgn = 0;
      let priceUsdt = 0;
      try {
        const pricingNgn = calculateNumberPrice(details.Price, 'NGN', settings);
        priceNgn = pricingNgn.customerPrice;
      } catch {
        priceNgn = details.Price * 25 * 1.5;
      }

      try {
        const pricingUsdt = calculateNumberPrice(details.Price, 'USDT', settings);
        priceUsdt = pricingUsdt.customerPrice;
      } catch {
        priceUsdt = Number(((details.Price * 25 * 1.5) / 1500).toFixed(2));
      }

      return {
        name,
        category: details.Category || 'Other',
        count: details.Qty || 0,
        price_native: details.Price,
        price_ngn: priceNgn,
        price_usdt: priceUsdt
      };
    });

    res.json({
      success: true,
      products,
      // Exposed so the storefront (and you) can verify the math:
      // customer price = native units x this rate + 50% markup.
      rate_used_ngn: settings.five_sim_rate_to_ngn || 0
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/numbers/order', moneyLimiter, authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { country = 'any', operator = 'any', product, currency = 'NGN' } = req.body;

    if (!product) {
      return res.status(400).json({ success: false, error: 'Product name is required.' });
    }

    const orderCurrency: Currency = (currency as Currency) === 'USDT' ? 'USDT' : 'NGN';
    const settings = db.getSettings();

    // 0. Provider readiness: never debit the customer for a number we cannot buy.
    // 5sim is prepaid-only (top-ups are manual on 5sim.net - no API funding),
    // so refuse early when our upstream balance can't cover this activation.
    if (!fiveSim.isLive()) {
      return res.status(503).json({ success: false, error: 'Virtual numbers are temporarily unavailable. Please try again later or contact support.' });
    }

    // 1. Fetch live product price from 5sim
    const rawProducts = await fiveSim.getProducts(country, operator);
    const productInfo = rawProducts[product];

    if (!productInfo || productInfo.Qty === 0) {
      return res.status(400).json({ success: false, error: `No virtual numbers currently available for ${product} in ${country}.` });
    }

    try {
      const upstreamBalance = await fiveSim.getBalance();
      if (!upstreamBalance || typeof upstreamBalance.balance !== 'number' || upstreamBalance.balance < productInfo.Price) {
        return res.status(503).json({ success: false, error: 'Virtual numbers are temporarily out of stock upstream. Please try again later.' });
      }
    } catch (balanceErr: any) {
      console.warn('[Numbers] Upstream balance check failed, proceeding to purchase attempt:', balanceErr.message || balanceErr);
    }

    // 2. Calculate customer price with markup
    const pricing = calculateNumberPrice(productInfo.Price, orderCurrency, settings);

    // 3. Atomically check & debit user wallet
    const orderId = `JFT-NUM-${Math.floor(10000 + Math.random() * 90000)}`;
    try {
      db.debitWallet(
        user.id,
        orderCurrency,
        pricing.customerPrice,
        'order',
        orderId,
        `Virtual Number: ${product} (${country})`
      );
    } catch (walletErr: any) {
      return res.status(400).json({ success: false, error: walletErr.message });
    }

    // 4. Purchase activation from 5sim
    let activation;
    try {
      activation = await fiveSim.buyActivation(country, operator, product);
    } catch (providerErr: any) {
      // Refund wallet immediately if provider purchase failed
      const reason = providerErr.message || 'Provider error';
      db.creditWallet(
        user.id,
        orderCurrency,
        pricing.customerPrice,
        'refund',
        `REF-${orderId}`,
        `Refund: Failed order for ${product} (${reason})`
      );
      // Stock/balance rejections are the customer's cue to pick another
      // route (400), not a server crash (500).
      const friendly = /no free numbers|out of stock|too low/i.test(reason);
      return res.status(friendly ? 400 : 500).json({ success: false, error: friendly ? reason : `Failed to acquire number: ${reason}` });
    }

    // 5. Store NumberOrder in database
    const now = new Date().toISOString();
    const smsCode = activation.sms && activation.sms.length > 0 ? activation.sms[0].code : null;
    const smsText = activation.sms && activation.sms.length > 0 ? activation.sms[0].text : null;

    const newOrder: NumberOrder = {
      id: orderId,
      user_id: user.id,
      provider_order_id: activation.id,
      product: activation.product || product,
      country: activation.country || country,
      operator: activation.operator || operator,
      phone: activation.phone,
      sms_code: smsCode,
      sms_text: smsText,
      customer_charge: pricing.customerPrice,
      provider_cost: productInfo.Price,
      currency: orderCurrency,
      status: activation.status || 'PENDING',
      expires_at: activation.expires,
      created_at: now,
      updated_at: now
    };

    db.createNumberOrder(newOrder);

    res.json({ success: true, order: newOrder });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/numbers/orders', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const orders = db.getNumberOrders(user.id);
  res.json({ success: true, orders });
});

app.get('/api/numbers/orders/:id', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const order = db.findNumberOrderById(req.params.id);

  if (!order || (order.user_id !== user.id && !['admin', 'superadmin'].includes(user.role))) {
    return res.status(404).json({ success: false, error: 'Order not found' });
  }

  res.json({ success: true, order });
});

app.post('/api/numbers/orders/:id/check', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const order = db.findNumberOrderById(req.params.id);

    if (!order || (order.user_id !== user.id && !['admin', 'superadmin'].includes(user.role))) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const checkRes = await fiveSim.checkOrder(order.provider_order_id);
    const smsCode = checkRes.sms && checkRes.sms.length > 0 ? checkRes.sms[checkRes.sms.length - 1].code : order.sms_code;
    const smsText = checkRes.sms && checkRes.sms.length > 0 ? checkRes.sms[checkRes.sms.length - 1].text : order.sms_text;

    const updated = db.updateNumberOrder(order.id, {
      status: checkRes.status || order.status,
      sms_code: smsCode,
      sms_text: smsText,
      expires_at: checkRes.expires || order.expires_at,
      updated_at: new Date().toISOString()
    });

    res.json({ success: true, order: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/numbers/orders/:id/cancel', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const order = db.findNumberOrderById(req.params.id);

    if (!order || (order.user_id !== user.id && !['admin', 'superadmin'].includes(user.role))) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (order.status === 'CANCELED' || order.status === 'FINISHED' || order.status === 'TIMEOUT') {
      return res.status(400).json({ success: false, error: `Order is already ${order.status}` });
    }

    await fiveSim.cancelOrder(order.provider_order_id);

    // If no SMS code was received, refund the customer
    if (!order.sms_code) {
      db.creditWallet(
        order.user_id,
        order.currency,
        order.customer_charge,
        'refund',
        `REF-${order.id}`,
        `Refund: Cancelled virtual number ${order.product}`
      );
    }

    const updated = db.updateNumberOrder(order.id, {
      status: 'CANCELED',
      updated_at: new Date().toISOString()
    });

    res.json({ success: true, order: updated, message: 'Order cancelled successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/numbers/orders/:id/finish', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const order = db.findNumberOrderById(req.params.id);

    if (!order || (order.user_id !== user.id && !['admin', 'superadmin'].includes(user.role))) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    await fiveSim.finishOrder(order.provider_order_id);

    const updated = db.updateNumberOrder(order.id, {
      status: 'FINISHED',
      updated_at: new Date().toISOString()
    });

    res.json({ success: true, order: updated, message: 'Order completed.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------
// ACCOUNT STORE (PRE-MADE ACCOUNTS)
// -----------------------------

// Storefront: categories + live stock counts, no credentials
app.get('/api/accounts/categories', (req, res) => {
  const categories = db.getAccountCategories(true).map(c => ({
    id: c.id,
    name: c.name,
    description: c.description,
    price_ngn: c.price_ngn,
    in_stock: db.getAvailableStockCount(c.id)
  }));
  res.json({ success: true, categories });
});

// Purchase — the critical ordering: debit the wallet FIRST, and only reveal
// credentials if that succeeds. If the wallet debit throws (insufficient
// balance), execution never reaches claimAccountListing, so nothing is
// ever handed out unpaid.
app.post('/api/accounts/buy', moneyLimiter, authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { category_id } = req.body;

    const category = db.getAccountCategories(true).find(c => c.id === category_id);
    if (!category) {
      return res.status(404).json({ success: false, error: 'Account category not found or unavailable.' });
    }

    if (db.getAvailableStockCount(category_id) === 0) {
      return res.status(400).json({ success: false, error: 'This account type is currently out of stock.' });
    }

    const orderId = `acctord_${crypto.randomBytes(8).toString('hex')}`;

    // 1. Payment first — throws on insufficient balance, aborting the whole request.
    //    Nothing (credentials, logs, history) is revealed before this succeeds.
    db.debitWallet(user.id, 'NGN', category.price_ngn, 'order', orderId, `Account purchase: ${category.name}`);

    // 2. Only now, with payment confirmed, claim a unit and hand over credentials.
    //    If the claim loses a stock race, refund immediately so money never
    //    leaves without an account attached.
    let listing;
    try {
      listing = db.claimAccountListing(category_id, user.id, orderId);
    } catch (claimErr: any) {
      try {
        db.creditWallet(user.id, 'NGN', category.price_ngn, 'refund', `REF-${orderId}`, `Refund: stock race on ${category.name}`);
      } catch (refundErr: any) {
        console.error(`[AccountStore] REFUND FAILED for ${orderId} - manual review required:`, refundErr.message || refundErr);
      }
      throw claimErr;
    }

    const order = db.createAccountOrder({
      id: orderId,
      user_id: user.id,
      category_id: category.id,
      category_name: category.name,
      listing_id: listing.id,
      price_charged: category.price_ngn,
      currency: 'NGN'
    });

    db.createNotification({
      user_id: user.id,
      type: 'order',
      title: 'Account Purchased',
      message: `Your ${category.name} is ready — view it under "My Accounts".`,
      read: false,
      link: '/accounts'
    });

    res.json({
      success: true,
      order_id: order.id,
      account: {
        category_name: category.name,
        email: decryptSecret(listing.email_encrypted),
        password: decryptSecret(listing.password_encrypted)
      }
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// My Accounts — customers can come back and view what they've bought at any time
app.get('/api/accounts/my-purchases', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const orders = db.getAccountOrdersByUser(user.id);
  const withCredentials = orders.map(o => {
    const listing = db.getAccountListingById(o.listing_id);
    return {
      ...o,
      email: listing ? decryptSecret(listing.email_encrypted) : null,
      password: listing ? decryptSecret(listing.password_encrypted) : null
    };
  });
  res.json({ success: true, orders: withCredentials.reverse() });
});

// -----------------------------
// WALLET & PAYMENTS
// -----------------------------

app.get('/api/wallet', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const wallets = db.getWallets(user.id);
  const settings = db.getSettings();

  res.json({
    success: true,
    wallets,
    deposit_fee_percentage: settings.payment_fee_enabled ? settings.payment_fee_percentage : 0,
    exchange_rate: settings.exchange_rate_usd_ngn
  });
});

app.get('/api/wallet/transactions', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const transactions = db.getTransactions(user.id);
  res.json({ success: true, transactions });
});

// Paystack NGN Deposit Flow
app.post('/api/payments/paystack/initialize', moneyLimiter, authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { amount } = req.body;
    const numAmount = parseFloat(amount);

    const settings = db.getSettings();
    if (isNaN(numAmount) || numAmount < settings.min_deposit_ngn) {
      return res.status(400).json({
        success: false,
        error: `Minimum NGN deposit is ₦${settings.min_deposit_ngn.toLocaleString()}.`
      });
    }

    if (numAmount > settings.max_deposit_ngn) {
      return res.status(400).json({
        success: false,
        error: `Maximum NGN deposit is ₦${settings.max_deposit_ngn.toLocaleString()}.`
      });
    }

    // Calculate 3% fee (if enabled)
    const feeAmount = settings.payment_fee_enabled
      ? roundMoney(numAmount * (settings.payment_fee_percentage / 100))
      : 0;
    const netAmount = roundMoney(numAmount - feeAmount);

    const reference = `pstk_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    db.createPayment({
      id: `pay_${crypto.randomBytes(6).toString('hex')}`,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      provider: 'paystack',
      reference,
      amount: numAmount,
      fee_amount: feeAmount,
      net_amount: netAmount,
      currency: 'NGN',
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    res.json({
      success: true,
      reference,
      amount: numAmount,
      fee_amount: feeAmount,
      net_amount: netAmount,
      currency: 'NGN',
      email: user.email
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Paystack Server-side Verification & Instant Wallet Credit (supports GET & POST)
const handlePaystackVerify = async (req: AuthenticatedRequest, res: any) => {
  try {
    const user = req.user!;
    const reference = req.params?.reference || req.body?.reference || (req.query?.reference as string);

    if (!reference) {
      return res.status(400).json({ success: false, error: 'Transaction reference is required.' });
    }

    const payment = db.findPaymentByReference(reference);
    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment record not found.' });
    }

    if (payment.user_id !== user.id && user.role !== 'admin' && user.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Unauthorized payment verification.' });
    }

    if (payment.status === 'confirmed') {
      const ngnWallet = db.getWallet(user.id, 'NGN');
      return res.json({
        success: true,
        message: 'Payment already credited.',
        credited_amount: payment.amount,
        new_balance: ngnWallet?.available_balance || 0,
        payment
      });
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      console.error('[Paystack] PAYSTACK_SECRET_KEY is not configured on the server.');
      return res.status(500).json({ success: false, error: 'Payment provider is not configured. Please contact support.' });
    }

    // Call Paystack's real verification endpoint — never trust the client's word on payment status.
    let paystackData: any;
    try {
      const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${secretKey}` }
      });
      const verifyJson = await verifyResponse.json();
      if (!verifyResponse.ok || !verifyJson.status) {
        return res.status(402).json({
          success: false,
          error: verifyJson?.message || 'Paystack could not verify this transaction.'
        });
      }
      paystackData = verifyJson.data;
    } catch (fetchErr: any) {
      console.error('[Paystack] Verification request failed:', fetchErr);
      return res.status(502).json({ success: false, error: 'Could not reach Paystack to verify this payment. Please try again.' });
    }

    if (!paystackData || paystackData.status !== 'success') {
      payment.status = 'failed';
      payment.updated_at = new Date().toISOString();
      db.updatePayment(payment.id, payment);
      return res.status(402).json({
        success: false,
        error: `Payment was not successful (Paystack status: ${paystackData?.status || 'unknown'}).`
      });
    }

    // Cross-check the amount actually paid (Paystack returns kobo) against what we expect.
    const expectedKobo = Math.round(payment.amount * 100);
    const paidKobo = paystackData.amount;
    if (paidKobo < expectedKobo) {
      payment.status = 'failed';
      payment.updated_at = new Date().toISOString();
      db.updatePayment(payment.id, payment);
      return res.status(402).json({
        success: false,
        error: `Amount mismatch: expected ₦${payment.amount.toLocaleString()}, Paystack confirmed ₦${(paidKobo / 100).toLocaleString()}.`
      });
    }

    // Mark confirmed only after real verification has passed
    payment.status = 'confirmed';
    payment.updated_at = new Date().toISOString();
    db.updatePayment(payment.id, payment);

    // Credit NGN wallet with the deposited amount
    const creditAmount = payment.amount > 0 ? payment.amount : payment.net_amount;
    const creditResult = db.creditWallet(
      user.id,
      'NGN',
      creditAmount,
      'payment',
      payment.reference,
      `Paystack Deposit (₦${creditAmount.toLocaleString()})`
    );

    db.createNotification({
      user_id: user.id,
      type: 'deposit',
      title: 'Deposit Confirmed',
      message: `₦${creditAmount.toLocaleString()} has been credited to your NGN wallet.`,
      read: false,
      link: '/wallet'
    });

    res.json({
      success: true,
      message: 'Deposit verified and credited successfully.',
      credited_amount: creditAmount,
      new_balance: creditResult.newBalance
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

app.get('/api/payments/paystack/verify/:reference', authenticate, handlePaystackVerify);
app.post('/api/payments/paystack/verify/:reference?', authenticate, handlePaystackVerify);

// USDT Crypto Deposit Submission
app.post('/api/payments/usdt/submit', moneyLimiter, authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { amount, transaction_hash, network = 'TRC-20' } = req.body;

    const numAmount = parseFloat(amount);
    const settings = db.getSettings();

    if (isNaN(numAmount) || numAmount < settings.min_deposit_usdt) {
      return res.status(400).json({
        success: false,
        error: `Minimum USDT deposit is ${settings.min_deposit_usdt} USDT.`
      });
    }

    if (!transaction_hash || transaction_hash.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid Blockchain Transaction Hash / ID (TXID).'
      });
    }

    const feeAmount = settings.payment_fee_enabled
      ? roundMoney(numAmount * (settings.payment_fee_percentage / 100))
      : 0;
    const netAmount = roundMoney(numAmount - feeAmount);

    const payment = db.createPayment({
      id: `pay_${crypto.randomBytes(6).toString('hex')}`,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      provider: 'usdt_manual',
      reference: `usdt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      amount: numAmount,
      fee_amount: feeAmount,
      net_amount: netAmount,
      currency: 'USDT',
      status: 'pending',
      metadata: {
        transaction_hash: transaction_hash.trim(),
        network,
        deposit_address: settings.usdt_trc20_address
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    db.createNotification({
      user_id: user.id,
      type: 'deposit',
      title: 'USDT Deposit Submitted',
      message: `Your deposit of ${numAmount} USDT is undergoing node confirmation. You will be credited ${netAmount} USDT once verified.`,
      read: false,
      link: '/wallet'
    });

    res.json({
      success: true,
      message: 'USDT transaction submitted. Funds will be credited once confirmed on the blockchain ledger.',
      payment
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------
// SUPPORT TICKETS & WHATSAPP
// -----------------------------

app.get('/api/support/tickets', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const tickets = db.getTickets(user.id);
  res.json({ success: true, tickets });
});

app.post('/api/support/tickets', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { category, subject, message, priority = 'medium' } = req.body;

    if (!category || !subject || !message) {
      return res.status(400).json({ success: false, error: 'Category, subject, and message are required.' });
    }

    const ticket = db.createTicket({
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      category,
      subject,
      priority,
      status: 'open'
    });

    db.addSupportMessage({
      ticket_id: ticket.id,
      sender_id: user.id,
      sender_name: user.name,
      sender_role: user.role,
      message
    });

    res.json({ success: true, ticket });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/support/tickets/:id', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const ticket = db.findTicketById(req.params.id);

  if (!ticket || (ticket.user_id !== user.id && !['admin', 'superadmin', 'support'].includes(user.role))) {
    return res.status(404).json({ success: false, error: 'Ticket not found' });
  }

  const messages = db.getTicketMessages(ticket.id);
  res.json({ success: true, ticket, messages });
});

app.post('/api/support/tickets/:id/messages', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { message } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Message cannot be empty.' });
    }

    const ticket = db.findTicketById(req.params.id);
    if (!ticket || (ticket.user_id !== user.id && !['admin', 'superadmin', 'support'].includes(user.role))) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const newMsg = db.addSupportMessage({
      ticket_id: ticket.id,
      sender_id: user.id,
      sender_name: user.name,
      sender_role: user.role,
      message: message.trim()
    });

    res.json({ success: true, message: newMsg });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------
// NOTIFICATIONS
// -----------------------------

app.get('/api/notifications', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const notifications = db.getNotifications(user.id);
  res.json({ success: true, notifications });
});

app.post('/api/notifications/:id/read', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const ok = db.markNotificationRead(req.params.id, user.id);
  res.json({ success: ok });
});

app.post('/api/notifications/read-all', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  db.markAllNotificationsRead(user.id);
  res.json({ success: true });
});

// -----------------------------
// ADMINISTRATOR API ROUTES
// -----------------------------

// Admin Dashboard Metrics
app.get('/api/admin/dashboard', verifyAdmin, async (req, res) => {
  try {
    const users = db.getUsers();
    const orders = db.getOrders();
    const services = db.getServices(false);
    const payments = db.getPayments();

    const totalUsers = users.length;
    const totalOrders = orders.length;

    const pendingOrders = orders.filter(o => ['pending', 'processing', 'in_progress'].includes(o.status)).length;
    const completedOrders = orders.filter(o => o.status === 'completed').length;
    const failedOrders = orders.filter(o => ['failed', 'cancelled'].includes(o.status)).length;
    const refundedOrders = orders.filter(o => o.status === 'refunded').length;

    // Real Financial Computations
    let totalRevenueNGN = 0;
    let totalProviderCostNGN = 0;
    let totalGrossProfitNGN = 0;
    let totalPaymentFeesNGN = 0;

    const settings = db.getSettings();
    const exchangeRate = settings.exchange_rate_usd_ngn || 1500;

    for (const order of orders) {
      // Successful business only: completed (and partial) deliveries.
      // Processing, failed, cancelled and refunded orders never touch revenue.
      if (order.status === 'completed' || order.status === 'partial') {
        const mult = order.currency === 'USDT' ? exchangeRate : 1;
        totalRevenueNGN += order.customer_charge * mult;
        totalProviderCostNGN += order.provider_charge * mult;
        totalGrossProfitNGN += order.net_profit * mult;
        totalPaymentFeesNGN += order.payment_fee * mult;
      }
    }

    // Provider Balance
    const providerBalance = await peakerr.getBalance();

    res.json({
      success: true,
      stats: {
        total_users: totalUsers,
        total_orders: totalOrders,
        pending_orders: pendingOrders,
        completed_orders: completedOrders,
        failed_orders: failedOrders,
        refunded_orders: refundedOrders,
        total_revenue_ngn: roundMoney(totalRevenueNGN),
        total_provider_cost_ngn: roundMoney(totalProviderCostNGN),
        total_gross_profit_ngn: roundMoney(totalGrossProfitNGN),
        total_payment_fees_ngn: roundMoney(totalPaymentFeesNGN),
        provider_balance_usd: providerBalance.balance,
        provider_balance_currency: providerBalance.currency,
        provider_is_live: peakerr.isLive(),
        active_services: services.filter(s => s.active).length
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Overview (field names expected by the admin dashboard UI).
// Same real computations as /api/admin/dashboard, plus total customer
// wallet balances (your liability) split by currency.
app.get('/api/admin/overview', verifyAdmin, async (req, res) => {
  try {
    const users = db.getUsers();
    const orders = db.getOrders();
    const services = db.getServices(false);

    const settings = db.getSettings();
    const exchangeRate = settings.exchange_rate_usd_ngn || 1500;

    let totalRevenueNGN = 0;
    let totalProviderCostNGN = 0;
    let totalGrossProfitNGN = 0;

    for (const order of orders) {
      // Successful business only: completed (and partial) deliveries.
      if (order.status === 'completed' || order.status === 'partial') {
        const mult = order.currency === 'USDT' ? exchangeRate : 1;
        totalRevenueNGN += order.customer_charge * mult;
        totalProviderCostNGN += order.provider_charge * mult;
        totalGrossProfitNGN += order.net_profit * mult;
      }
    }

    // Customer wallet liability: what you owe users if everyone withdrew.
    // Staff/admin wallets are excluded.
    let customerBalanceNGN = 0;
    let customerBalanceUSDT = 0;
    for (const u of users) {
      if (u.role !== 'customer') continue;
      for (const w of db.getWallets(u.id)) {
        if (w.currency === 'USDT') customerBalanceUSDT += w.available_balance;
        else customerBalanceNGN += w.available_balance;
      }
    }

    // Provider balances are best-effort (upstream can be slow); null = unknown.
    // Never fake a number: unknown renders as "—".
    let providerBalance: number | null = null;
    let providerCurrency = 'USD';
    let eagainsBalance: number | null = null;
    let eagainsCurrency = 'USD';
    let fivesimBalance: number | null = null;
    try {
      const [pb, eb, fb] = await Promise.all([
        peakerr.getBalance().catch(() => ({ balance: 0, currency: 'USD', error: 'unreachable' })),
        eagainsmedia.getBalance().catch(() => ({ balance: 0, currency: 'USD', error: 'unreachable' })),
        fiveSim.getBalance().catch(() => ({ balance: 0, error: 'unreachable' } as any))
      ]);
      if (!pb.error) {
        providerBalance = pb.balance;
        providerCurrency = pb.currency || 'USD';
      }
      if (!eb.error) {
        eagainsBalance = eb.balance;
        eagainsCurrency = eb.currency || 'USD';
      }
      if (fb && typeof fb.balance === 'number' && !(fb as any).error) {
        fivesimBalance = fb.balance;
      }
    } catch {
      // leave nulls - dashboard shows "unknown", never a fake number
    }

    res.json({
      success: true,
      stats: {
        total_revenue_ngn: roundMoney(totalRevenueNGN),
        total_provider_cost_ngn: roundMoney(totalProviderCostNGN),
        total_gross_profit_ngn: roundMoney(totalGrossProfitNGN),
        total_customer_balance_ngn: roundMoney(customerBalanceNGN),
        total_customer_balance_usdt: Math.round(customerBalanceUSDT * 100) / 100,
        orders_count: orders.length,
        users_count: users.length,
        services_count: services.filter(s => s.active).length,
        provider_balance: providerBalance,
        provider_balance_currency: providerCurrency,
        eagainsmedia_balance: eagainsBalance,
        eagainsmedia_balance_currency: eagainsCurrency,
        fivesim_balance: fivesimBalance,
        provider_is_live: peakerr.isLive(),
        min_margin_ngn: settings.default_min_margin_ngn,
        default_markup_percentage: settings.default_markup_percentage
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Users Management
app.get('/api/admin/users', verifyAdmin, (req, res) => {
  const users = db.getUsers().map(u => {
    const wallets = db.getWallets(u.id);
    const orderCount = db.getOrders(u.id).length;
    return {
      id: u.id,
      name: u.name,
      username: u.username,
      email: u.email,
      role: u.role,
      status: u.status,
      created_at: u.created_at,
      wallets,
      order_count: orderCount
    };
  });
  res.json({ success: true, users });
});

app.patch('/api/admin/users/:id', verifyAdmin, (req: AuthenticatedRequest, res) => {
  const admin = req.user!;
  const { status, role } = req.body;

  const updated = db.updateUser(req.params.id, {
    ...(status ? { status } : {}),
    ...(role ? { role } : {})
  });

  if (!updated) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  db.addAuditLog({
    actor_id: admin.id,
    actor_name: admin.name,
    actor_role: admin.role,
    action: 'UPDATE_USER',
    entity_type: 'user',
    entity_id: updated.id,
    details: `Updated user ${updated.email} status to ${status || 'unchanged'}, role to ${role || 'unchanged'}`,
    ip: req.ip || '127.0.0.1'
  });

  res.json({ success: true, user: updated });
});

// Role change endpoint used by the admin Users panel (POST .../users/:id/role).
app.post('/api/admin/users/:id/role', verifyAdmin, (req: AuthenticatedRequest, res) => {
  const admin = req.user!;
  const { role } = req.body;

  if (!role || !['customer', 'support', 'manager', 'admin', 'superadmin'].includes(role)) {
    return res.status(400).json({ success: false, error: 'Valid role is required.' });
  }

  // Nobody can demote themselves out of the admin chair (lockout prevention).
  if (req.params.id === admin.id && !['admin', 'superadmin', 'manager'].includes(role)) {
    return res.status(400).json({ success: false, error: 'You cannot remove your own admin access.' });
  }

  const updated = db.updateUser(req.params.id, { role });

  if (!updated) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  db.addAuditLog({
    actor_id: admin.id,
    actor_name: admin.name,
    actor_role: admin.role,
    action: 'UPDATE_USER_ROLE',
    entity_type: 'user',
    entity_id: updated.id,
    details: `Changed role of ${updated.email} to ${role}`,
    ip: req.ip || '127.0.0.1'
  });

  res.json({ success: true, user: updated });
});

// Full user delete. Financial rows are kept (names scrubbed) so the books
// stay honest; everything else is removed and tombstoned.
app.delete('/api/admin/users/:id', verifyAdmin, (req: AuthenticatedRequest, res) => {
  const admin = req.user!;

  if (req.params.id === admin.id) {
    return res.status(400).json({ success: false, error: 'You cannot delete your own account.' });
  }

  const target = db.findUserById(req.params.id);
  if (!target) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  if (['admin', 'superadmin'].includes(target.role)) {
    const remainingStaff = db.getUsers().filter(
      u => u.id !== target.id && ['admin', 'superadmin', 'manager'].includes(u.role)
    ).length;
    if (remainingStaff === 0) {
      return res.status(400).json({ success: false, error: 'Cannot delete the last staff account.' });
    }
  }

  const balances = db.getWallets(target.id);
  const owed = balances.reduce((sum, w) => sum + (w.available_balance || 0), 0);
  if (owed > 0 && req.body?.force !== true) {
    return res.status(400).json({
      success: false,
      error: `This user still holds ${owed.toLocaleString()} across wallets. Zero it first (adjust-wallet) or retry with force to forfeit it.`,
      non_zero_balance: owed
    });
  }

  const result = db.deleteUser(target.id);
  if (!result) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  // Kick every live session of the deleted user immediately.
  for (const [token, uid] of activeSessions) {
    if (uid === target.id) activeSessions.delete(token);
  }

  db.addAuditLog({
    actor_id: admin.id,
    actor_name: admin.name,
    actor_role: admin.role,
    action: 'DELETE_USER',
    entity_type: 'user',
    entity_id: target.id,
    details: `Permanently deleted ${target.email} (${result.ordersKept} orders kept anonymized)`,
    ip: req.ip || '127.0.0.1'
  });

  res.json({ success: true, orders_kept: result.ordersKept });
});

// Admin order status change (from the Orders Control Center dropdown).
// Refunds are NOT allowed here - they must go through the refund flow.
app.post('/api/admin/orders/:id/status', verifyAdmin, (req: AuthenticatedRequest, res) => {
  const admin = req.user!;
  const { status } = req.body;
  const allowed = ['pending', 'processing', 'in_progress', 'completed', 'partial', 'cancelled'];

  if (!status || !allowed.includes(status)) {
    return res.status(400).json({ success: false, error: 'Valid status is required (refunds use the Refund button).' });
  }

  const order = db.findOrderById(req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, error: 'Order not found' });
  }

  const updated = db.updateOrder(order.id, { status: status as any });

  db.addAuditLog({
    actor_id: admin.id,
    actor_name: admin.name,
    actor_role: admin.role,
    action: 'UPDATE_ORDER_STATUS',
    entity_type: 'order',
    entity_id: order.id,
    details: `Changed order ${order.id} status from ${order.status} to ${status}`,
    ip: req.ip || '127.0.0.1'
  });

  res.json({ success: true, order: updated });
});

// Admin manual full order-status sync with providers (dashboard button).
app.post('/api/admin/orders/sync-all', verifyAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    await automation.runOrderSync();
    const actives = db.getOrders().filter(o =>
      ['pending', 'processing', 'in_progress'].includes(o.status)
    ).length;
    res.json({ success: true, message: `Sync pass complete. ${actives} orders still active.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// One-time purge of anonymized test orders ("Deleted User"). Tombstoned so
// no redeploy or restore ever brings them back. Future deletions keep their
// anonymized rows - this is for cleaning old test pollution only.
app.delete('/api/admin/orders/purge-anonymized', verifyAdmin, (req: AuthenticatedRequest, res) => {
  const admin = req.user!;
  try {
    const result = db.purgeAnonymizedOrders();

    db.addAuditLog({
      actor_id: admin.id,
      actor_name: admin.name,
      actor_role: admin.role,
      action: 'PURGE_ANONYMIZED_ORDERS',
      entity_type: 'order',
      entity_id: 'bulk',
      details: `Purged ${result.orders} anonymized orders and ${result.payments} anonymized payments`,
      ip: req.ip || '127.0.0.1'
    });

    res.json({ success: true, purged_orders: result.orders, purged_payments: result.payments });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Manual Wallet Adjustment
app.post('/api/admin/users/:id/adjust-wallet', verifyAdmin, (req: AuthenticatedRequest, res) => {
  try {
    const admin = req.user!;
    const { currency, amount, type, reason } = req.body;

    if (!currency || !amount || !type || !reason) {
      return res.status(400).json({ success: false, error: 'Currency, amount, type (credit/debit), and reason are required.' });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be greater than zero.' });
    }

    const targetUser = db.findUserById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'Target user not found' });
    }

    let result;
    if (type === 'credit') {
      result = db.creditWallet(
        targetUser.id,
        currency as Currency,
        numAmount,
        'manual',
        `adj_${Date.now()}`,
        `Admin Credit by ${admin.name}: ${reason}`
      );
    } else {
      result = db.debitWallet(
        targetUser.id,
        currency as Currency,
        numAmount,
        'manual',
        `adj_${Date.now()}`,
        `Admin Debit by ${admin.name}: ${reason}`
      );
    }

    db.addAuditLog({
      actor_id: admin.id,
      actor_name: admin.name,
      actor_role: admin.role,
      action: type === 'credit' ? 'MANUAL_WALLET_CREDIT' : 'MANUAL_WALLET_DEBIT',
      entity_type: 'wallet',
      entity_id: targetUser.id,
      details: `${type.toUpperCase()} of ${currency} ${numAmount} for user ${targetUser.email}. Reason: ${reason}`,
      ip: req.ip || '127.0.0.1'
    });

    res.json({ success: true, new_balance: result.newBalance, transaction: result.transaction });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Admin Orders Management
app.get('/api/admin/orders', verifyAdmin, (req, res) => {
  const orders = db.getOrders();
  const normalized = orders.map(o => ({
    ...o,
    target_link: o.target_link || o.link || '',
    link: o.link || o.target_link || ''
  }));
  // Administrator sees full pricing transparency: provider_charge, customer_charge, markup_amount, net_profit
  res.json({ success: true, orders: normalized });
});

// Admin Sync Order Status with Provider
app.post('/api/admin/orders/:id/sync', verifyAdmin, async (req, res) => {
  try {
    const order = db.findOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (!order.provider_order_id) {
      return res.status(400).json({ success: false, error: 'Order has no upstream provider ID.' });
    }

    const statusRes = await peakerr.getOrderStatus(order.provider_order_id);
    if (statusRes.error) {
      return res.status(400).json({ success: false, error: statusRes.error });
    }

    const updated = db.updateOrder(order.id, {
      provider_status: statusRes.status,
      remains: statusRes.remains ? parseInt(statusRes.remains, 10) : order.remains,
      start_count: statusRes.start_count ? parseInt(statusRes.start_count, 10) : order.start_count
    });

    res.json({ success: true, order: updated, provider_response: statusRes });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Process Order Refund (Strict Enforcement of Protocol)
app.post('/api/admin/orders/:id/refund', verifyAdmin, (req: AuthenticatedRequest, res) => {
  try {
    const admin = req.user!;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({
        success: false,
        error: 'A specific investigation reason is required to authorize an order refund.'
      });
    }

    const result = db.processRefund(req.params.id, admin, reason.trim(), req.ip || '127.0.0.1');

    res.json({
      success: true,
      message: `Order ${req.params.id} has been refunded in the amount of ${result.order.currency} ${result.refundedAmount.toLocaleString()}.`,
      order: result.order
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Admin Services Management
app.get('/api/admin/services', verifyAdmin, (req, res) => {
  const services = db.getServices(false);
  const categories = db.getCategories();
  res.json({ success: true, services, categories });
});

app.patch('/api/admin/services/:id', verifyAdmin, (req: AuthenticatedRequest, res) => {
  const admin = req.user!;
  const updates = req.body;

  const updated = db.updateService(req.params.id, updates);
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Service not found' });
  }

  db.addAuditLog({
    actor_id: admin.id,
    actor_name: admin.name,
    actor_role: admin.role,
    action: 'UPDATE_SERVICE',
    entity_type: 'service',
    entity_id: updated.id,
    details: `Updated service ${updated.name}: ${Object.keys(updates).join(', ')}`,
    ip: req.ip || '127.0.0.1'
  });

  res.json({ success: true, service: updated });
});

app.post('/api/admin/services/sync', verifyAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const admin = req.user!;
    const providerToSync = req.body?.provider;
    let syncResult;

    if (providerToSync === 'all') {
      await automation.syncAllProviderCatalogs();
      syncResult = { message: 'All provider catalogs synced successfully' };
    } else {
      syncResult = await automation.syncServicesFromProvider(providerToSync || 'peakerr');
    }

    db.addAuditLog({
      actor_id: admin.id,
      actor_name: admin.name,
      actor_role: admin.role,
      action: 'SYNC_SERVICES_PROVIDER',
      entity_type: 'service',
      entity_id: 'provider_sync',
      details: `Provider sync (${providerToSync || 'peakerr'}): ${JSON.stringify(syncResult)}`,
      ip: req.ip || '127.0.0.1'
    });

    res.json({ success: true, ...syncResult });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------
// ADMIN ACCOUNT STORE & INVENTORY
// -----------------------------

// Create/update a category (e.g. set up "uk_tiktok" at ₦8,000)
app.post('/api/admin/accounts/categories', verifyAdmin, (req: AuthenticatedRequest, res) => {
  const { id, name, description, price_ngn, active } = req.body;
  if (!id || !name || price_ngn === undefined || price_ngn === null) {
    return res.status(400).json({ success: false, error: 'id, name, and price_ngn are required.' });
  }
  const category = db.upsertAccountCategory({
    id: String(id).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
    name: String(name).trim(),
    description: description ? String(description).trim() : '',
    price_ngn: Number(price_ngn),
    active: active !== undefined ? Boolean(active) : true
  });
  res.json({ success: true, category });
});

// Bulk stock upload — paste lines like "email:password", one per line
app.post('/api/admin/accounts/stock', verifyAdmin, (req: AuthenticatedRequest, res) => {
  const { category_id, raw_credentials } = req.body;
  if (!category_id || !raw_credentials) {
    return res.status(400).json({ success: false, error: 'category_id and raw_credentials are required.' });
  }

  const lines: string[] = String(raw_credentials).split('\n').map((l: string) => l.trim()).filter(Boolean);
  const parsed: Array<{ email: string; password: string }> = [];
  const rejected: string[] = [];

  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx === -1) {
      rejected.push(line);
      continue;
    }
    const email = line.slice(0, idx).trim();
    const password = line.slice(idx + 1).trim();
    if (!email || !password) {
      rejected.push(line);
      continue;
    }
    parsed.push({ email, password });
  }

  const added = db.addAccountStock(category_id, parsed);

  res.json({
    success: true,
    added,
    rejected_count: rejected.length,
    rejected_lines: rejected // so the admin can see and fix any malformed lines
  });
});

// Stock overview
app.get('/api/admin/accounts/stock', verifyAdmin, (req: AuthenticatedRequest, res) => {
  const categories = db.getAccountCategories(false).map(c => ({
    ...c,
    in_stock: db.getAvailableStockCount(c.id),
    sold_count: db.getSoldCountByCategory(c.id)
  }));
  res.json({ success: true, categories });
});

// Admin view all account orders
app.get('/api/admin/accounts/orders', verifyAdmin, (req: AuthenticatedRequest, res) => {
  const orders = db.getAllAccountOrders();
  res.json({ success: true, orders: orders.reverse() });
});

// Admin Pricing Engine & Live Calculator
app.get('/api/admin/pricing', verifyAdmin, (req, res) => {
  const settings = db.getSettings();
  res.json({
    success: true,
    pricing_rules: {
      default_markup_percentage: settings.default_markup_percentage,
      default_min_margin_ngn: settings.default_min_margin_ngn,
      payment_fee_percentage: settings.payment_fee_percentage,
      payment_fee_enabled: settings.payment_fee_enabled,
      exchange_rate_usd_ngn: settings.exchange_rate_usd_ngn
    }
  });
});

app.patch('/api/admin/pricing', verifyAdmin, (req: AuthenticatedRequest, res) => {
  const admin = req.user!;
  const {
    default_markup_percentage,
    default_min_margin_ngn,
    payment_fee_percentage,
    payment_fee_enabled,
    exchange_rate_usd_ngn
  } = req.body;

  const updatedSettings = db.updateSettings(
    {
      ...(default_markup_percentage !== undefined ? { default_markup_percentage: Number(default_markup_percentage) } : {}),
      ...(default_min_margin_ngn !== undefined ? { default_min_margin_ngn: Number(default_min_margin_ngn) } : {}),
      ...(payment_fee_percentage !== undefined ? { payment_fee_percentage: Number(payment_fee_percentage) } : {}),
      ...(payment_fee_enabled !== undefined ? { payment_fee_enabled: Boolean(payment_fee_enabled) } : {}),
      ...(exchange_rate_usd_ngn !== undefined ? { exchange_rate_usd_ngn: Number(exchange_rate_usd_ngn) } : {})
    },
    admin,
    req.ip || '127.0.0.1'
  );

  res.json({ success: true, settings: updatedSettings });
});

// Admin Pricing Preview Calculator Tool
// MUST match production pricing engine calculation precisely
app.post('/api/admin/pricing/preview', verifyAdmin, (req, res) => {
  try {
    const {
      provider_rate_per_1000, // in NGN
      quantity,
      markup_percentage,
      minimum_margin_ngn,
      currency = 'NGN'
    } = req.body;

    const settings = db.getSettings();

    // Create a virtual service for the calculator
    const virtualService = {
      id: 'preview_srv',
      provider_id: 'peakerr',
      provider_service_id: 999,
      name: 'Calculator Preview Service',
      description: 'Pricing Engine Preview',
      category_id: 'cat_ig',
      provider_rate: parseFloat(provider_rate_per_1000) || 1000,
      min_quantity: 1,
      max_quantity: 1000000,
      refill_supported: true,
      cancel_supported: true,
      active: true,
      ordering_enabled: true,
      sort_order: 1,
      synced_at: new Date().toISOString(),
      markup_percentage_override: markup_percentage !== undefined ? Number(markup_percentage) : undefined,
      min_margin_override: minimum_margin_ngn !== undefined ? Number(minimum_margin_ngn) : undefined
    };

    const preview = calculateOrderPrice({
      service: virtualService,
      quantity: parseInt(quantity, 10) || 1000,
      currency: (currency as Currency) || 'NGN',
      settings
    });

    res.json({ success: true, preview });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Admin Payments & Crypto Approvals
app.get('/api/admin/payments', verifyAdmin, (req, res) => {
  const payments = db.getPayments();
  res.json({ success: true, payments });
});

app.post('/api/admin/payments/:id/approve-usdt', verifyAdmin, (req: AuthenticatedRequest, res) => {
  try {
    const admin = req.user!;
    const payment = db.getPayments().find(p => p.id === req.params.id);

    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    if (payment.status === 'confirmed') {
      return res.status(400).json({ success: false, error: 'Payment has already been confirmed.' });
    }

    payment.status = 'confirmed';
    payment.updated_at = new Date().toISOString();
    db.updatePayment(payment.id, payment);

    // Credit USDT wallet
    const creditResult = db.creditWallet(
      payment.user_id,
      'USDT',
      payment.net_amount,
      'payment',
      payment.reference,
      `USDT Deposit Confirmed (TX: ${payment.metadata?.transaction_hash || 'Approved by Admin'})`
    );

    db.createNotification({
      user_id: payment.user_id,
      type: 'deposit',
      title: 'USDT Deposit Verified',
      message: `${payment.net_amount} USDT has been credited to your JFT Socials USDT wallet.`,
      read: false,
      link: '/wallet'
    });

    db.addAuditLog({
      actor_id: admin.id,
      actor_name: admin.name,
      actor_role: admin.role,
      action: 'APPROVE_USDT_PAYMENT',
      entity_type: 'payment',
      entity_id: payment.id,
      details: `Approved USDT deposit of ${payment.net_amount} for user ${payment.user_id}`,
      ip: req.ip || '127.0.0.1'
    });

    res.json({ success: true, message: 'USDT payment verified and customer wallet credited.', new_balance: creditResult.newBalance });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/payments/:id/reject-usdt', verifyAdmin, (req: AuthenticatedRequest, res) => {
  try {
    const admin = req.user!;
    const { reason = 'Unverified blockchain transaction' } = req.body;
    const payment = db.getPayments().find(p => p.id === req.params.id);

    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    payment.status = 'rejected';
    payment.updated_at = new Date().toISOString();
    db.updatePayment(payment.id, payment);

    db.createNotification({
      user_id: payment.user_id,
      type: 'deposit',
      title: 'USDT Deposit Rejected',
      message: `Your USDT deposit could not be verified on the blockchain. Reason: ${reason}. Please open a support ticket or contact WhatsApp.`,
      read: false,
      link: '/support'
    });

    db.addAuditLog({
      actor_id: admin.id,
      actor_name: admin.name,
      actor_role: admin.role,
      action: 'REJECT_USDT_PAYMENT',
      entity_type: 'payment',
      entity_id: payment.id,
      details: `Rejected USDT payment ${payment.id}. Reason: ${reason}`,
      ip: req.ip || '127.0.0.1'
    });

    res.json({ success: true, message: 'Payment rejected.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Support Tickets
app.get('/api/admin/support/tickets', verifyAdmin, (req, res) => {
  const tickets = db.getTickets();
  res.json({ success: true, tickets });
});

app.post('/api/admin/support/tickets/:id/reply', verifyAdmin, (req: AuthenticatedRequest, res) => {
  try {
    const admin = req.user!;
    const { message, status } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, error: 'Message cannot be empty.' });
    }

    const ticket = db.findTicketById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const msg = db.addSupportMessage({
      ticket_id: ticket.id,
      sender_id: admin.id,
      sender_name: admin.name,
      sender_role: admin.role,
      message
    });

    db.updateTicket(ticket.id, {
      status: status || 'awaiting_customer',
      assigned_admin: admin.name
    });

    db.createNotification({
      user_id: ticket.user_id,
      type: 'ticket',
      title: 'Support Reply Received',
      message: `Support agent ${admin.name} replied to ticket #${ticket.ticket_number}: ${ticket.subject}`,
      read: false,
      link: `/support`
    });

    res.json({ success: true, message: msg });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/admin/support/tickets/:id/status', verifyAdmin, (req, res) => {
  const { status } = req.body;
  const ticket = db.updateTicket(req.params.id, { status });
  if (!ticket) {
    return res.status(404).json({ success: false, error: 'Ticket not found' });
  }
  res.json({ success: true, ticket });
});

// Admin System Settings
app.get('/api/admin/settings', verifyAdmin, (req, res) => {
  const settings = db.getSettings();
  const {
    peakerr_api_key_encrypted,
    eagainsmedia_api_key_encrypted,
    fivesim_api_key_encrypted,
    ...safeSettings
  } = settings;
  safeSettings.peakerr_key_configured = Boolean(settings.peakerr_key_configured || peakerr.isLive());
  safeSettings.eagainsmedia_key_configured = Boolean(settings.eagainsmedia_key_configured || eagainsmedia.isLive());
  safeSettings.fivesim_key_configured = Boolean(settings.fivesim_key_configured || fiveSim.isLive());
  res.json({ success: true, settings: safeSettings });
});

const handleUpdateSettings = (req: AuthenticatedRequest, res: any) => {
  const admin = req.user!;
  const updates = req.body;

  // If any API key was submitted, apply it live AND persist it (encrypted)
  // so it survives a server restart, instead of only living in memory.
  if (updates.peakerr_api_key) {
    peakerr.setApiKey(updates.peakerr_api_key);
    db.saveProviderApiKey('peakerr', updates.peakerr_api_key, admin, req.ip || '127.0.0.1');
    delete updates.peakerr_api_key; // never echo the raw key back in the settings response
  }

  if (updates.peakerr_api_url) {
    peakerr.setApiUrl(updates.peakerr_api_url);
  }

  if (updates.eagainsmedia_api_key) {
    eagainsmedia.setApiKey(updates.eagainsmedia_api_key);
    db.saveProviderApiKey('eagainsmedia', updates.eagainsmedia_api_key, admin, req.ip || '127.0.0.1');
    delete updates.eagainsmedia_api_key;
  }

  if (updates.eagainsmedia_api_url) {
    eagainsmedia.setApiUrl(updates.eagainsmedia_api_url);
  }

  if (updates.fivesim_api_key) {
    fiveSim.setApiKey(updates.fivesim_api_key);
    db.saveProviderApiKey('fivesim', updates.fivesim_api_key, admin, req.ip || '127.0.0.1');
    delete updates.fivesim_api_key;
  }

  // Backward compatibility: older admin clients saved several settings
  // under different names (pricing page, settings page). Map them to the
  // canonical keys consumed by the pricing engine (server/pricingEngine.ts),
  // otherwise admin saves silently change nothing.
  const LEGACY_SETTINGS_MAP: Record<string, string> = {
    fivesim_ngn_rate: 'five_sim_rate_to_ngn',
    fivesim_markup_percent: 'five_sim_markup_percentage',
    default_markup_percent: 'default_markup_percentage',
    minimum_markup_ngn: 'default_min_margin_ngn',
    exchange_rate_usdt_ngn: 'exchange_rate_usd_ngn',
    deposit_fee_percent: 'payment_fee_percentage',
    support_whatsapp: 'whatsapp_support_number'
  };
  for (const [legacyKey, canonicalKey] of Object.entries(LEGACY_SETTINGS_MAP)) {
    if (updates[legacyKey] !== undefined && updates[canonicalKey] === undefined) {
      updates[canonicalKey] = updates[legacyKey];
    }
    delete updates[legacyKey];
  }

  const updated = db.updateSettings(updates, admin, req.ip || '127.0.0.1');
  const {
    peakerr_api_key_encrypted,
    eagainsmedia_api_key_encrypted,
    fivesim_api_key_encrypted,
    ...safeSettings
  } = updated;
  res.json({ success: true, settings: safeSettings });
};

app.patch('/api/admin/settings', verifyAdmin, handleUpdateSettings);
app.post('/api/admin/settings', verifyAdmin, handleUpdateSettings);

// Admin Test Provider Connection
app.post('/api/admin/provider/test', verifyAdmin, async (req, res) => {
  try {
    const providerName = (req.body?.provider || 'peakerr').toLowerCase();
    const start = Date.now();
    let balance: any;
    let is_live = false;
    let providerLabel = 'P';

    if (providerName === 'eagainsmedia') {
      providerLabel = 'E';
      is_live = eagainsmedia.isLive();
      balance = await eagainsmedia.getBalance();
    } else if (providerName === 'fivesim') {
      providerLabel = '5';
      is_live = fiveSim.isLive();
      balance = await fiveSim.getBalance();
    } else {
      is_live = peakerr.isLive();
      balance = await peakerr.getBalance();
    }
    const latency = Date.now() - start;

    res.json({
      success: true,
      provider: providerLabel,
      is_live,
      balance: balance.balance,
      currency: balance.currency,
      latency_ms: latency,
      error: balance.error
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Audit Logs
app.get('/api/admin/audit-logs', verifyAdmin, (req, res) => {
  const logs = db.getAuditLogs(300);
  res.json({ success: true, audit_logs: logs });
});

// -----------------------------
// VITE MIDDLEWARE & SPA FALLBACK
// -----------------------------

async function start() {
  // Self-healing: if Supabase holds newer live data than the local JSON file
  // (e.g. after a redeploy reset the file), pull it down BEFORE serving.
  // Never throws, never delays boot more than ~25s, never overwrites newer local data.
  try {
    await maybeRestoreFromMirror(db.getMirrorCounts(), (tables, settings) =>
      db.restoreFromMirror(tables, settings)
    );
  } catch {
    // boot continues on the local file
  }

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[JFT Socials] Enterprise Node server running on http://0.0.0.0:${PORT}`);
  });
}

start().catch(err => {
  console.error('[ServerStartupError]', err);
});
