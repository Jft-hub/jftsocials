/**
 * 5sim.net Virtual Numbers (SMS Activation) API Client
 * Upstream URL: https://5sim.net/v1
 */

export interface FiveSimOrder {
  id: number;
  phone: string;
  operator: string;
  product: string;
  price: number;
  status: 'PENDING' | 'RECEIVED' | 'CANCELED' | 'TIMEOUT' | 'FINISHED' | 'BANNED';
  expires: string;
  sms: Array<{ created_at: string; date: string; sender: string; text: string; code: string }>;
  created_at: string;
  country?: string;
}

/** Thrown when the upstream provider cannot be used (no key, rejected key, unreachable, no cached data). */
export class NumberProviderUnavailableError extends Error {
  constructor(message = 'Virtual numbers temporarily unavailable') {
    super(message);
    this.name = 'NumberProviderUnavailableError';
  }
}

export class FiveSimClient {
  private apiKey: string;
  private apiUrl: string = 'https://5sim.net/v1';
  private authSuspended: boolean = false;
  private lastAuthError?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.FIVESIM_API_KEY || '';
  }

  public setApiKey(key: string) {
    this.apiKey = key;
    this.authSuspended = false;
    this.lastAuthError = undefined;
  }

  public isLive(): boolean {
    if (!this.apiKey) return false;
    const clean = this.apiKey.trim().toLowerCase();
    if (clean.length <= 10) return false;
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

  private async request<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(`${this.apiUrl}${path}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
          'User-Agent': 'JFT-Socials-Enterprise/2.0 (+https://jftsocials.online)'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.authSuspended = true;
          this.lastAuthError = `5sim API authentication rejected (HTTP ${response.status}). Numbers are unavailable until a valid API key is saved.`;
          console.info(`[FiveSimClient] ${this.lastAuthError}`);
        }
        const text = await response.text().catch(() => '');
        throw new Error(`5sim API error (${response.status}): ${text || response.statusText}`);
      }
      // 5sim sometimes answers errors as plain text (e.g. "no free phones")
      // instead of JSON. Translate those into human errors, never raw dumps.
      const rawText = await response.text();
      try {
        return JSON.parse(rawText) as T;
      } catch {
        const lowered = rawText.toLowerCase();
        if (lowered.includes('no free')) {
          throw new Error('No free numbers right now for this route. Try another country or product.');
        }
        if (lowered.includes('not enough') || lowered.includes('balance')) {
          throw new Error('5sim balance too low for this activation. Top up on 5sim.net.');
        }
        throw new Error(`5sim error: ${rawText.slice(0, 120)}`);
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw new Error(`5sim request failed: ${err.message || err}`);
    }
  }

  public async getBalance(): Promise<{ balance: number }> {
    if (!this.isLive()) {
      return { balance: 0 };
    }
    const profile = await this.request<{ balance: number }>('/user/profile');
    return { balance: profile.balance };
  }

  // Resilient guest cache: 10-minute TTL, serve-stale-on-error.
  // Upstream hiccups must never hang the numbers pages - worst case the
  // customer sees prices up to 10 minutes old, never a spinner of death.
  private guestCache = new Map<string, { at: number; data: any }>();
  private static readonly GUEST_TTL_MS = 10 * 60 * 1000;

  private getCached(key: string): any | null {
    const hit = this.guestCache.get(key);
    if (hit && Date.now() - hit.at < FiveSimClient.GUEST_TTL_MS) return hit.data;
    return null;
  }

  private setCached(key: string, data: any): void {
    try {
      this.guestCache.set(key, { at: Date.now(), data });
      // Bound memory: drop entries older than 2x TTL on every write.
      for (const [k, v] of this.guestCache) {
        if (Date.now() - v.at > FiveSimClient.GUEST_TTL_MS * 2) this.guestCache.delete(k);
      }
    } catch {
      // cache is best-effort only
    }
  }

  private async guestFetch(path: string): Promise<any | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${this.apiUrl}${path}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) return (await res.json()) as any;
      return null;
    } catch {
      clearTimeout(timeoutId);
      return null;
    }
  }

  // country="any" and operator="any" are valid, per the docs
  public async getProducts(
    country: string,
    operator: string = 'any'
  ): Promise<Record<string, { Category: string; Qty: number; Price: number }>> {
    const cacheKey = `products:${country}:${operator}`;
    const cached = this.getCached(cacheKey);
    // Fast path: fresh cache serves instantly without touching upstream.
    if (cached) return cached;
    // Slow path: refresh in background-friendly way (8s cap), fall back to
    // stale cache of any age; never a mock catalog.
    const fresh = await this.guestFetch(`/guest/products/${encodeURIComponent(country)}/${encodeURIComponent(operator)}`);
    if (fresh && typeof fresh === 'object') {
      this.setCached(cacheKey, fresh);
      return fresh as Record<string, { Category: string; Qty: number; Price: number }>;
    }
    const stale = this.guestCache.get(cacheKey);
    if (stale) return stale.data;

    // No mock catalog: if upstream is unreachable and nothing is cached, numbers are unavailable.
    throw new NumberProviderUnavailableError();
  }

  public async getCountries(): Promise<Record<string, any>> {
    const cacheKey = 'countries';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;
    const fresh = await this.guestFetch('/guest/countries');
    if (fresh && typeof fresh === 'object') {
      this.setCached(cacheKey, fresh);
      return fresh as Record<string, any>;
    }
    const stale = this.guestCache.get(cacheKey);
    if (stale) return stale.data;

    throw new NumberProviderUnavailableError();
  }

  public async buyActivation(country: string, operator: string, product: string): Promise<FiveSimOrder> {
    if (!this.isLive()) {
      throw new NumberProviderUnavailableError();
    }
    return this.request(`/user/buy/activation/${encodeURIComponent(country)}/${encodeURIComponent(operator)}/${encodeURIComponent(product)}`);
  }

  public async checkOrder(id: number | string): Promise<FiveSimOrder> {
    if (!this.isLive()) {
      throw new NumberProviderUnavailableError();
    }
    return this.request(`/user/check/${id}`);
  }

  public async finishOrder(id: number | string): Promise<FiveSimOrder> {
    if (!this.isLive()) {
      throw new NumberProviderUnavailableError();
    }
    return this.request(`/user/finish/${id}`);
  }

  public async cancelOrder(id: number | string): Promise<FiveSimOrder> {
    if (!this.isLive()) {
      throw new NumberProviderUnavailableError();
    }
    return this.request(`/user/cancel/${id}`);
  }

  public async banOrder(id: number | string): Promise<FiveSimOrder> {
    if (!this.isLive()) {
      throw new NumberProviderUnavailableError();
    }
    return this.request(`/user/ban/${id}`);
  }
}
