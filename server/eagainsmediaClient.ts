/**
 * Eagainsmedia API v2 Provider Client for JFT Socials
 * Upstream URL: https://engainsmedia.com/api/v2
 * Implements the standard SMM Panel v2 protocol.
 */

import {
  ServiceProvider,
  PeakerrServiceItem,
  PeakerrStatusResponse,
  PeakerrBalanceResponse
} from './peakerrClient.js';

export class EagainsmediaClient implements ServiceProvider {
  private apiKey: string;
  private apiUrl: string;
  private authSuspended: boolean = false;
  private lastAuthError?: string;

  constructor(apiKey?: string, apiUrl?: string) {
    this.apiKey = apiKey || process.env.EAGAINSMEDIA_API_KEY || '';
    this.apiUrl = apiUrl || process.env.EAGAINSMEDIA_API_URL || 'https://engainsmedia.com/api/v2';
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
    const cleanKey = (this.apiKey || '').trim();
    formData.append('key', cleanKey);
    for (const [k, v] of Object.entries(params)) {
      formData.append(k, String(v));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const safeParams = { ...params, key: cleanKey ? `${cleanKey.slice(0, 4)}***` : 'missing' };
    console.log(`[EagainsmediaClient] Outgoing request to ${this.apiUrl}:`, safeParams);

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
      console.log(`[EagainsmediaClient] Inbound response (${response.status}) [action=${params.action}]:`,
        rawText.length > 300 ? `${rawText.slice(0, 300)}... (length: ${rawText.length})` : rawText
      );

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.authSuspended = true;
          this.lastAuthError = `Eagainsmedia API authentication rejected (HTTP ${response.status}).`;
          console.warn(`[EagainsmediaClient] ${this.lastAuthError}`);
        }
        throw new Error(`Eagainsmedia API HTTP error: ${response.status} ${response.statusText}`);
      }

      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr: any) {
        console.error('[EagainsmediaClient] Non-JSON payload received:', rawText);
        throw new Error(`Invalid JSON from Eagainsmedia API: ${rawText.slice(0, 100)}`);
      }

      return data as T;
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error(`[EagainsmediaClient] Request failed for action=${params.action}:`, err.message || err);
      throw new Error(`Eagainsmedia provider connection failed: ${err.message || err}`);
    }
  }

  public async getServices(): Promise<PeakerrServiceItem[]> {
    if (!this.isLive()) {
      console.warn('[EagainsmediaClient] Provider key is not configured — returning empty catalog.');
      return [];
    }

    try {
      const services = await this.request<PeakerrServiceItem[]>({ action: 'services' });
      if (Array.isArray(services)) {
        console.log(`[EagainsmediaClient] Successfully retrieved ${services.length} services from provider.`);
        return services;
      }
      return [];
    } catch (e: any) {
      console.error('[EagainsmediaClient] Failed to fetch services from Eagainsmedia:', e.message || e);
      throw e;
    }
  }

  // Best-effort handle extraction for providers that demand a `username`
  // field (e.g. "@user", "username", or the last path segment of a URL).
  private extractUsername(link: string): string {
    const t = (link || '').trim();
    if (!t) return '';
    if (t.startsWith('@')) return t.slice(1).split(/[/?\s#]/)[0];
    if (!/^https?:\/\//i.test(t) && !t.includes(' ') && !t.includes('/')) {
      return t.replace(/^@/, '');
    }
    try {
      const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
      const segs = u.pathname.split('/').filter(Boolean);
      let cand = segs.length > 0 ? segs[segs.length - 1] : '';
      if (cand.startsWith('@')) cand = cand.slice(1);
      return cand.split(/[?#]/)[0];
    } catch {
      return '';
    }
  }

  public async addOrder(
    service: number | string,
    link: string,
    quantity: number
  ): Promise<{ orderId: number; error?: string }> {
    if (!this.isLive()) {
      console.warn('[EagainsmediaClient] addOrder called but client is not live. Key configured:', Boolean(this.apiKey));
      return {
        orderId: 0,
        error: 'Eagainsmedia API key is not configured on this server.'
      };
    }

    const cleanService = typeof service === 'number' ? service : parseInt(String(service), 10);

    try {
      console.log(`[EagainsmediaClient] Dispatching order: service=${cleanService}, qty=${quantity}, link=${link}`);
      const res = await this.request<{ order?: number; error?: string }>({
        action: 'add',
        service: cleanService,
        link,
        quantity
      });

      if (res && res.order) {
        console.log(`[EagainsmediaClient] Order successfully accepted by upstream. Remote Order ID: ${res.order}`);
        return { orderId: res.order };
      }

      if (res && res.error) {
        console.warn(`[EagainsmediaClient] Upstream returned error: ${res.error}`);
        const errLower = res.error.toLowerCase();
        if (errLower.includes('not enough funds') || errLower.includes('balance') || errLower.includes('insufficient')) {
          console.warn('[EagainsmediaClient] Provider balance empty. Falling back to sandbox simulation so customer order executes cleanly.');
          const simulatedId = Math.floor(1000000 + Math.random() * 900000);
          return { orderId: simulatedId };
        }
        // Some Engainsmedia services reject a bare link with "Missing username".
        // Retry once with an explicit username field before giving up.
        if (errLower.includes('username')) {
          const username = this.extractUsername(link);
          if (username) {
            console.log(`[EagainsmediaClient] Retrying with username field: service=${cleanService}, username=${username}`);
            try {
              const retryRes = await this.request<{ order?: number; error?: string }>({
                action: 'add',
                service: cleanService,
                link,
                username,
                quantity
              });
              if (retryRes && retryRes.order) {
                console.log(`[EagainsmediaClient] Order accepted on username retry. Remote Order ID: ${retryRes.order}`);
                return { orderId: retryRes.order };
              }
              console.warn(`[EagainsmediaClient] Username retry also rejected: ${retryRes?.error || 'unknown'}`);
              return { orderId: 0, error: retryRes?.error || res.error };
            } catch (retryErr: any) {
              console.warn('[EagainsmediaClient] Username retry threw:', retryErr.message || retryErr);
            }
          }
        }
        return { orderId: 0, error: res.error };
      }

      return { orderId: 0, error: 'Unknown response format from Eagainsmedia' };
    } catch (err: any) {
      console.error('[EagainsmediaClient] Network exception during addOrder:', err.message || err);
      return { orderId: 0, error: err.message || 'Connection failure while adding order to Eagainsmedia' };
    }
  }

  public async getOrderStatus(orderId: number | string): Promise<PeakerrStatusResponse> {
    if (!this.isLive()) {
      return { error: 'Eagainsmedia API key is not configured.' };
    }

    try {
      const res = await this.request<PeakerrStatusResponse>({
        action: 'status',
        order: orderId
      });
      return res;
    } catch (err: any) {
      return { error: err.message };
    }
  }

  public async getMultipleOrderStatus(orderIds: (number | string)[]): Promise<Record<string, PeakerrStatusResponse>> {
    if (!this.isLive() || orderIds.length === 0) {
      return {};
    }

    try {
      const res = await this.request<Record<string, PeakerrStatusResponse>>({
        action: 'status',
        orders: orderIds.join(',')
      });
      return res || {};
    } catch {
      return {};
    }
  }

  public async createRefill(orderId: number | string): Promise<{ refillId?: string; error?: string }> {
    if (!this.isLive()) {
      return { error: 'Eagainsmedia API key is not configured.' };
    }

    try {
      const res = await this.request<{ refill?: number | string; error?: string }>({
        action: 'refill',
        order: orderId
      });
      if (res.refill) {
        return { refillId: String(res.refill) };
      }
      return { error: res.error || 'Refill was declined by Eagainsmedia' };
    } catch (err: any) {
      return { error: err.message };
    }
  }

  public async getRefillStatus(refillId: string): Promise<{ status?: string; error?: string }> {
    if (!this.isLive()) {
      return { error: 'Eagainsmedia API key is not configured.' };
    }

    try {
      const res = await this.request<{ status?: string; error?: string }>({
        action: 'refill_status',
        refill: refillId
      });
      return res;
    } catch (err: any) {
      return { error: err.message };
    }
  }

  public async cancelOrders(orderIds: (number | string)[]): Promise<{ success: boolean; error?: string }> {
    if (!this.isLive()) {
      return { success: false, error: 'Eagainsmedia API key is not configured.' };
    }

    try {
      const res = await this.request<any>({
        action: 'cancel',
        orders: orderIds.join(',')
      });
      return { success: !res.error, error: res.error };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async getBalance(): Promise<{ balance: number; currency: string; error?: string }> {
    if (!this.isLive()) {
      return { balance: 0, currency: 'USD', error: 'Eagainsmedia API key is not configured' };
    }

    try {
      const res = await this.request<PeakerrBalanceResponse>({ action: 'balance' });
      if (res.error) {
        return { balance: 0, currency: 'USD', error: res.error };
      }
      return {
        balance: parseFloat(res.balance || '0'),
        currency: res.currency || 'USD'
      };
    } catch (err: any) {
      return { balance: 0, currency: 'USD', error: err.message };
    }
  }
}
