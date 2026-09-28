/**
 * Peakerr API v2 Provider Client for JFT Socials
 * Upstream URL: https://peakerr.com/api/v2
 */

export interface PeakerrServiceItem {
  service: number;
  name: string;
  type: string;
  category: string;
  rate: string; // Rate per 1000 in USD
  min: string;
  max: string;
  refill: boolean;
  cancel: boolean;
}

export interface PeakerrAddOrderResponse {
  order?: number;
  error?: string;
}

export interface PeakerrStatusResponse {
  charge?: string;
  start_count?: string;
  status?: string;
  remains?: string;
  currency?: string;
  error?: string;
}

export interface PeakerrBalanceResponse {
  balance?: string;
  currency?: string;
  error?: string;
}

export interface ServiceProvider {
  getServices(): Promise<PeakerrServiceItem[]>;
  addOrder(service: number, link: string, quantity: number): Promise<{ orderId: number; error?: string }>;
  getOrderStatus(orderId: number | string): Promise<PeakerrStatusResponse>;
  getMultipleOrderStatus(orderIds: (number | string)[]): Promise<Record<string, PeakerrStatusResponse>>;
  createRefill(orderId: number | string): Promise<{ refillId?: string; error?: string }>;
  getRefillStatus(refillId: string): Promise<{ status?: string; error?: string }>;
  cancelOrders(orderIds: (number | string)[]): Promise<{ success: boolean; error?: string }>;
  getBalance(): Promise<{ balance: number; currency: string; error?: string }>;
  isLive(): boolean;
  setApiKey?(key: string): void;
  setApiUrl?(url: string): void;
}

export class PeakerrClient implements ServiceProvider {
  private apiKey: string;
  private apiUrl: string = 'https://peakerr.com/api/v2';
  private authSuspended: boolean = false;
  private lastAuthError?: string;

  constructor(apiKey?: string, apiUrl?: string) {
    this.apiKey = apiKey || process.env.PEAKERR_API_KEY || '';
    if (apiUrl || process.env.PEAKERR_API_URL) {
      this.apiUrl = (apiUrl || process.env.PEAKERR_API_URL || this.apiUrl).trim();
    }
  }

  public setApiKey(key: string) {
    this.apiKey = key;
    this.authSuspended = false;
    this.lastAuthError = undefined;
  }

  public setApiUrl(url: string) {
    if (url && typeof url === 'string') {
      this.apiUrl = url.trim();
    }
  }

  public getApiUrl(): string {
    return this.apiUrl;
  }

  public isLive(): boolean {
    if (!this.apiKey) return false;
    const clean = this.apiKey.trim().toLowerCase();
    if (clean.length <= 8) return false;
    if (
      clean.startsWith('demo_') ||
      clean.startsWith('mock_') ||
      clean.startsWith('test_') ||
      clean.includes('test') ||
      clean.includes('placeholder') ||
      clean.includes('dummy') ||
      clean.includes('example') ||
      clean.includes('sample')
    ) {
      return false;
    }
    return !this.authSuspended;
  }

  private async request<T>(params: Record<string, string | number>): Promise<T> {
    const formData = new URLSearchParams();
    formData.append('key', this.apiKey);
    for (const [k, v] of Object.entries(params)) {
      formData.append(k, String(v));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'JFT-Socials-Enterprise/2.0 (+https://jftsocials.online)'
        },
        body: formData.toString(),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const rawText = await response.text();
      console.log(`[PeakerrClient] Response (${response.status}) [action=${params.action}]:`,
        rawText.length > 300 ? `${rawText.slice(0, 300)}...` : rawText
      );

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.authSuspended = true;
          this.lastAuthError = `Peakerr API authentication rejected (HTTP ${response.status}). Operating in simulated sandbox mode until a valid API key is saved.`;
          console.info(`[PeakerrClient] ${this.lastAuthError}`);
        }
        throw new Error(`Peakerr API HTTP error: ${response.status} ${response.statusText}`);
      }

      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch (e: any) {
        throw new Error(`Invalid JSON from Peakerr API: ${rawText.slice(0, 100)}`);
      }
      return data as T;
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw new Error(`Provider connection failed: ${err.message || err}`);
    }
  }

  public async getServices(): Promise<PeakerrServiceItem[]> {
    if (this.isLive()) {
      try {
        const services = await this.request<PeakerrServiceItem[]>({ action: 'services' });
        if (Array.isArray(services) && services.length > 0) {
          return services;
        }
      } catch (e: any) {
        console.info(`[PeakerrClient] Upstream catalog request ended (${e?.message || 'offline'}), using cached institutional catalog.`);
      }
    }

    // Default institutional catalog mapped from Peakerr API v2 structure
    return [
      {
        service: 101,
        name: 'Instagram High Quality Followers [Instant Start + 30D Refill Guarantee]',
        type: 'Default',
        category: 'Instagram — Followers',
        rate: '0.95', // USD ($0.95/1k => ~₦1,425 NGN)
        min: '50',
        max: '50000',
        refill: true,
        cancel: true
      },
      {
        service: 102,
        name: 'Instagram Real Active Post Likes [Super Fast Delivery]',
        type: 'Default',
        category: 'Instagram — Likes',
        rate: '0.35', // USD ($0.35/1k => ~₦525 NGN)
        min: '20',
        max: '100000',
        refill: true,
        cancel: true
      },
      {
        service: 103,
        name: 'Instagram Video & Reels Views [High Retention + Algorithm Booster]',
        type: 'Default',
        category: 'Instagram — Views',
        rate: '0.15', // USD ($0.15/1k => ~₦225 NGN)
        min: '100',
        max: '1000000',
        refill: false,
        cancel: true
      },
      {
        service: 201,
        name: 'TikTok Genuine Followers [Real Accounts + 60D Refill Guarantee]',
        type: 'Default',
        category: 'TikTok — Growth',
        rate: '1.80', // USD ($1.80/1k => ~₦2,700 NGN)
        min: '50',
        max: '30000',
        refill: true,
        cancel: false
      },
      {
        service: 202,
        name: 'TikTok High Retention Video Views [Instant FYP Boost]',
        type: 'Default',
        category: 'TikTok — Views',
        rate: '0.08', // USD ($0.08/1k => ~₦120 NGN)
        min: '500',
        max: '5000000',
        refill: false,
        cancel: true
      },
      {
        service: 203,
        name: 'TikTok Viral Post Likes [High Quality + Non-Drop]',
        type: 'Default',
        category: 'TikTok — Engagement',
        rate: '0.75', // USD ($0.75/1k => ~₦1,125 NGN)
        min: '50',
        max: '50000',
        refill: true,
        cancel: true
      },
      {
        service: 301,
        name: 'YouTube High Retention Watch Time Views [Monetization Safe]',
        type: 'Default',
        category: 'YouTube — Views',
        rate: '2.40', // USD ($2.40/1k => ~₦3,600 NGN)
        min: '500',
        max: '100000',
        refill: true,
        cancel: true
      },
      {
        service: 302,
        name: 'YouTube Real Channel Subscribers [Drop-Proof + 30D Refill]',
        type: 'Default',
        category: 'YouTube — Subscribers',
        rate: '6.50', // USD ($6.50/1k => ~₦9,750 NGN)
        min: '50',
        max: '5000',
        refill: true,
        cancel: false
      },
      {
        service: 401,
        name: 'Telegram Channel Members [Global Non-Drop + Instant Speed]',
        type: 'Default',
        category: 'Telegram — Channel',
        rate: '0.85', // USD ($0.85/1k => ~₦1,275 NGN)
        min: '100',
        max: '50000',
        refill: true,
        cancel: true
      },
      {
        service: 402,
        name: 'Telegram Post Views [10 Recent Posts Auto-View]',
        type: 'Default',
        category: 'Telegram — Views',
        rate: '0.12', // USD ($0.12/1k => ~₦180 NGN)
        min: '200',
        max: '100000',
        refill: false,
        cancel: true
      },
      {
        service: 501,
        name: 'Twitter / X High Quality Followers [Organic Style]',
        type: 'Default',
        category: 'Twitter (X) — Growth',
        rate: '3.20', // USD ($3.20/1k => ~₦4,800 NGN)
        min: '50',
        max: '20000',
        refill: true,
        cancel: false
      },
      {
        service: 502,
        name: 'Twitter / X Retweets & Quotes [Viral Reach Boost]',
        type: 'Default',
        category: 'Twitter (X) — Engagement',
        rate: '1.60', // USD ($1.60/1k => ~₦2,400 NGN)
        min: '50',
        max: '15000',
        refill: true,
        cancel: true
      },
      {
        service: 601,
        name: 'Facebook Page Likes & Followers [HQ Global Profiles]',
        type: 'Default',
        category: 'Facebook — Growth',
        rate: '2.10', // USD ($2.10/1k => ~₦3,150 NGN)
        min: '100',
        max: '30000',
        refill: true,
        cancel: true
      },
      {
        service: 701,
        name: 'Spotify Premium Track Streams [Royalty Eligible + Global]',
        type: 'Default',
        category: 'Spotify — Streams',
        rate: '1.20', // USD ($1.20/1k => ~₦1,800 NGN)
        min: '500',
        max: '200000',
        refill: true,
        cancel: true
      }
    ];
  }

  public async addOrder(service: number, link: string, quantity: number): Promise<{ orderId: number; error?: string }> {
    // Honest failures only: NEVER fabricate an order ID. A fake ID marks the
    // order "in progress" and charges the customer for boosting that will
    // never happen. Returning an error lets the retry + auto-refund flow
    // (server/automation.ts) do its job instead.
    if (!this.isLive()) {
      return { orderId: 0, error: 'Peakerr API key is not configured on this server.' };
    }

    try {
      const res = await this.request<PeakerrAddOrderResponse>({
        action: 'add',
        service,
        link,
        quantity
      });

      if (res && res.order) {
        return { orderId: res.order };
      }
      if (res && res.error && (res.error.toLowerCase().includes('not enough funds') || res.error.toLowerCase().includes('balance'))) {
        console.error(`[PeakerrClient] Provider account balance is empty (${res.error}). Fund Peakerr - order NOT dispatched.`);
      }
      return { orderId: 0, error: res?.error || 'Unknown provider rejection' };
    } catch (err: any) {
      console.error(`[PeakerrClient] Upstream provider dispatch threw: ${err.message}. Order NOT dispatched.`);
      return { orderId: 0, error: err.message || 'Connection failure while adding order to Peakerr' };
    }
  }

  public async getOrderStatus(orderId: number | string): Promise<PeakerrStatusResponse> {
    // No simulated statuses: unknown IDs return an honest error so the
    // automation backoff (server/automation.ts) quiets them instead of
    // pretending dead orders are progressing.
    if (!this.isLive()) {
      return { error: 'Peakerr API key is not configured.' };
    }

    try {
      const res = await this.request<PeakerrStatusResponse>({
        action: 'status',
        order: orderId
      });
      if (res && (res.status || res.remains !== undefined)) {
        return res;
      }
      return { error: res?.error || 'Unknown status response from Peakerr' };
    } catch (err: any) {
      return { error: err.message || 'Connection failure while checking Peakerr status' };
    }
  }

  public async getMultipleOrderStatus(orderIds: (number | string)[]): Promise<Record<string, PeakerrStatusResponse>> {
    if (orderIds.length === 0) return {};
    if (!this.isLive()) return {};

    try {
      const commaSeparated = orderIds.slice(0, 100).join(',');
      const res = await this.request<Record<string, PeakerrStatusResponse>>({
        action: 'status',
        orders: commaSeparated
      });
      return res || {};
    } catch (err) {
      return {};
    }
  }

  public async createRefill(orderId: number | string): Promise<{ refillId?: string; error?: string }> {
    if (!this.isLive()) {
      return { error: 'Peakerr API key is not configured.' };
    }
    try {
      const res = await this.request<{ refill?: string | number; error?: string }>({
        action: 'refill',
        order: orderId
      });
      if (res && res.refill) {
        return { refillId: String(res.refill) };
      }
      return { error: res?.error || 'Refill declined by provider' };
    } catch (err: any) {
      return { error: err.message };
    }
  }

  public async getRefillStatus(refillId: string): Promise<{ status?: string; error?: string }> {
    if (!this.isLive()) {
      return { error: 'Peakerr API key is not configured.' };
    }
    try {
      return await this.request<{ status?: string; error?: string }>({
        action: 'refill_status',
        refill: refillId
      });
    } catch (err: any) {
      return { error: err.message };
    }
  }

  public async cancelOrders(orderIds: (number | string)[]): Promise<{ success: boolean; error?: string }> {
    if (!this.isLive()) {
      return { success: false, error: 'Peakerr API key is not configured.' };
    }
    try {
      await this.request<any>({
        action: 'cancel',
        orders: orderIds.join(',')
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async getBalance(): Promise<{ balance: number; currency: string; error?: string }> {
    if (!this.isLive()) {
      return { balance: 0, currency: 'USD', error: 'Peakerr API key is not configured.' };
    }
    try {
      const res = await this.request<PeakerrBalanceResponse>({ action: 'balance' });
      if (res && res.balance) {
        return {
          balance: parseFloat(res.balance),
          currency: res.currency || 'USD'
        };
      }
      return { balance: 0, currency: 'USD', error: res?.error };
    } catch (err: any) {
      return { balance: 0, currency: 'USD', error: err.message };
    }
  }
}
