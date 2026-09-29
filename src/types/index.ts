export type UserRole = 'customer' | 'support' | 'manager' | 'admin' | 'superadmin';

export type Currency = 'NGN' | 'USDT';

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  password_hash: string;
  role: UserRole;
  status: 'active' | 'suspended' | 'pending';
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface Wallet {
  id: string;
  user_id: string;
  currency: Currency;
  available_balance: number;
  created_at: string;
  updated_at: string;
}

export type TransactionType = 'deposit' | 'order_debit' | 'refund' | 'admin_credit' | 'admin_debit' | 'fee';

export interface WalletTransaction {
  id: string;
  wallet_id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  balance_before: number;
  balance_after: number;
  currency: Currency;
  reference_type: 'order' | 'payment' | 'manual' | 'refund';
  reference_id: string;
  description: string;
  status: 'completed' | 'pending' | 'failed';
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  platform: 'instagram' | 'tiktok' | 'youtube' | 'telegram' | 'twitter' | 'facebook' | 'spotify' | 'other';
  icon?: string;
  description: string;
  active: boolean;
  sort_order: number;
}

export interface Service {
  id: string;
  provider_id: string;
  provider_service_id: number;
  name: string;
  description: string;
  category_id: string;
  provider_rate: number; // Rate per 1000 in NGN (converted from USD if needed)
  min_quantity: number;
  max_quantity: number;
  refill_supported: boolean;
  cancel_supported: boolean;
  active: boolean;
  ordering_enabled: boolean;
  custom_price?: number; // Fixed custom selling price per 1000 if admin overrides
  markup_percentage_override?: number;
  min_margin_override?: number;
  sort_order: number;
  synced_at: string;
}

export type ServiceCategoryType =
  | 'followers'
  | 'likes'
  | 'comments'
  | 'saves'
  | 'shares'
  | 'views'
  | 'other';

export interface ServiceProviderOption {
  service_id: string;
  provider_id: string; // 'peakerr' | 'eagainsmedia'
  provider_service_id: number;
  provider_name: string;
  original_name: string;
  provider_rate: number; // in NGN per 1,000 units
  customer_price_per_1000: number; // Provider rate + 20% markup
  min_quantity: number;
  max_quantity: number;
  refill_supported: boolean;
  cancel_supported: boolean;
  is_cheapest: boolean;
}

export interface GroupedService {
  id: string;
  name: string;
  normalized_key: string;
  platform: string;
  category_id: string;
  category_type: ServiceCategoryType;
  description: string;
  refill_supported: boolean;
  cancel_supported: boolean;
  min_quantity: number;
  max_quantity: number;
  best_price_per_1000: number;
  best_provider_id: string;
  options_count: number;
  provider_options: ServiceProviderOption[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'in_progress'
  | 'completed'
  | 'partial'
  | 'cancelled'
  | 'refunded'
  | 'failed';

export interface Order {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  service_id: string;
  service_name?: string;
  provider_id: string;
  provider_order_id?: number | string;
  target_link: string;
  link?: string;
  quantity: number;
  provider_charge: number; // Historical provider cost for this exact order
  customer_charge: number; // Final customer price charged
  markup_amount: number;
  markup_percentage: number;
  minimum_markup: number;
  applied_markup: number;
  payment_fee: number;
  net_profit: number;
  currency: Currency;
  exchange_rate_used: number;
  pricing_rule_version: string;
  start_count: number;
  remains: number;
  status: OrderStatus;
  provider_status?: string;
  refill_eligible: boolean;
  cancel_eligible: boolean;
  last_refill_requested_at?: string;
  refunded_at?: string;
  refund_reason?: string;
  refund_admin_id?: string;
  dispatch_attempts?: number;
  last_dispatch_attempt_at?: string;
  provider_service_id?: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface Payment {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  provider: 'paystack' | 'usdt_manual';
  reference: string;
  amount: number;
  fee_amount: number;
  net_amount: number;
  currency: Currency;
  status: 'pending' | 'confirmed' | 'failed' | 'rejected';
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface SupportTicket {
  id: string;
  ticket_number: string;
  user_id: string;
  user_name: string;
  user_email: string;
  category: 'order' | 'payment' | 'refund' | 'technical' | 'general';
  subject: string;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'pending' | 'awaiting_customer' | 'resolved' | 'closed';
  assigned_admin?: string;
  created_at: string;
  updated_at: string;
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: UserRole;
  message: string;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  type: 'order' | 'deposit' | 'refund' | 'ticket' | 'system';
  title: string;
  message: string;
  read: boolean;
  link?: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string;
  ip: string;
  created_at: string;
}

export type NumberOrderStatus = 'PENDING' | 'RECEIVED' | 'CANCELED' | 'TIMEOUT' | 'FINISHED' | 'BANNED';

export interface NumberOrder {
  id: string;                    // our internal id
  user_id: string;
  provider?: string;             // 'fivesim' (default) | 'herosms'
  provider_order_id: number;     // upstream order id
  country: string;
  operator: string;
  product: string;               // e.g. "facebook", "whatsapp"
  phone: string;
  status: NumberOrderStatus;
  provider_cost: number;         // raw 5sim price, in 5sim's native unit
  customer_charge: number;       // what we actually debited, in `currency`
  currency: Currency;
  sms_code: string | null;
  sms_text: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface SystemSettings {
  platform_name: string;
  primary_domain: string;
  whatsapp_support_number: string;
  default_markup_percentage: number;
  default_min_margin_ngn: number;
  payment_fee_percentage: number;
  payment_fee_enabled: boolean;
  exchange_rate_usd_ngn: number; // e.g. 1500 (1 USD/USDT = ₦1500)
  min_deposit_ngn: number;
  max_deposit_ngn: number;
  min_deposit_usdt: number;
  max_deposit_usdt: number;
  usdt_trc20_address: string;
  usdt_network: string;
  paystack_public_key?: string;
  maintenance_mode: boolean;
  maintenance_message: string;
  peakerr_api_url: string;
  peakerr_key_configured: boolean;
  peakerr_api_key_encrypted?: string;
  eagainsmedia_api_url?: string;
  eagainsmedia_key_configured?: boolean;
  eagainsmedia_api_key_encrypted?: string;
  five_sim_rate_to_ngn: number; // 5sim native currency unit -> NGN
  five_sim_markup_percentage: number; // e.g. 50 for +50%
  fivesim_key_configured?: boolean;
  fivesim_api_key_encrypted?: string;
  herosms_api_url?: string;
  herosms_key_configured?: boolean;
  herosms_api_key_encrypted?: string;
  sync_interval_minutes: number;
  low_balance_threshold_usd: number;
}

export type Transaction = WalletTransaction;

export type TicketMessage = SupportMessage;

export interface PriceCalculationResult {
  provider_cost: number;
  percentage_markup: number;
  calculated_percentage_markup: number;
  minimum_markup: number;
  applied_markup: number;
  customer_price: number;
  payment_fee: number;
  total_charge: number;
  gross_profit: number;
  net_profit: number;
  effective_profit_percentage: number;
  currency: Currency;
  exchange_rate_used: number;
  pricing_rule_version: string;
}

export interface AccountCategory {
  id: string;            // e.g. "uk_tiktok"
  name: string;           // "UK TikTok Account"
  description?: string;   // shown to customers, e.g. "Aged UK-region TikTok account, email login"
  price_ngn: number;      // fixed price, e.g. 8000
  active: boolean;        // hide from the storefront without deleting stock
  created_at: string;
}

export interface AccountListing {
  id: string;
  category_id: string;
  status: 'available' | 'sold';
  email_encrypted: string;
  password_encrypted: string;
  sold_to_user_id?: string;
  sold_order_id?: string;
  sold_at?: string;
  added_at: string;
}

export interface AccountOrder {
  id: string;
  user_id: string;
  category_id: string;
  category_name: string;   // snapshot at time of purchase, in case the category is renamed later
  listing_id: string;
  price_charged: number;
  currency: Currency;
  created_at: string;
}
