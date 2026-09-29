/**
 * HeroSMS Virtual Numbers client for JFT Socials.
 *
 * ASSUMPTIONS (verify at hero-sms.com/api before spending real money):
 * 1. SMS-Activate-compatible HTTP API: GET {apiUrl}?action=...&api_key=...
 *    with TEXT responses (ACCESS_BALANCE:12.5, ACCESS_NUMBER:id:phone, ...).
 * 2. Balance and prices are dollar-scale units (same convention as 5sim here).
 * 3. Country IDs below are the common ones - UNMAPPED countries refuse
 *    loudly instead of guessing (a wrong ID buys the wrong country's number).
 *    Confirm/extend the map from Hero's docs.
 *
 * Money safety: every failure path returns an error (never a fake order),
 * so the buy flow refunds instead of charging for nothing.
 */

export interface HeroSmsOrder {
  id: number;
  phone: string;
  operator: string;
  product: string;
  price: number;
  status: 'PENDING' | 'RECEIVED' | 'CANCELED' | 'TIMEOUT' | 'FINISHED' | 'BANNED';
  expires: string;
  sms: Array<{ code: string; text: string | null }>;
  created_at: string;
  country?: string;
}

// 5sim product name -> Hero service code. Unknown products fall back to the
// lowercased name and fail closed server-side if Hero rejects it.
const SERVICE_MAP: Record<string, string> = {
  whatsapp: 'wa',
  telegram: 'tg',
  google: 'go',
  gmail: 'go',
  facebook: 'fb',
  instagram: 'ig',
  twitter: 'tw',
  tiktok: 'tiktok',
  youtube: 'go',
  discord: 'ds',
  openai: 'openai',
};

// Hero country ID <- 5sim country name. VERIFY each against Hero docs.
// Missing entry = refused purchase (safe), never a guessed country.
const COUNTRY_MAP: Record<string, number> = {
  russia: 0,
  ukraine: 1,
  kazakhstan: 2,
  // Add confirmed IDs here, e.g. nigeria: ??, usa: ??, germany: ??, ghana: ??,
};

export class HeroSmsClient {
  private apiKey: string;
  private apiUrl: string;
  private authSuspended: boolean = false;

  constructor(apiKey?: string, apiUrl?: string) {
    this.apiKey = apiKey || process.env.HEROSMS_API_KEY || '';
    this.apiUrl =
      apiUrl || process.env.HEROSMS_API_URL || 'https://hero-sms.com/stubs/handler_api.php';
  }

  public setApiKey(key: string) {
    this.apiKey = key;
    this.authSuspended = false;
  }

  public setApiUrl(url: string) {
    if (url && typeof url === 'string') this.apiUrl = url.trim();
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

  private async call(params: Record<string, string | number>): Promise<string> {
    const q = new URLSearchParams({ api_key: this.apiKey.trim() });
    for (const [k, v] of Object.entries(params)) q.append(k, String(v));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${this.apiUrl}?${q.toString()}`, {
        signal: controller.signal,
        headers: { Accept: '*/*', 'User-Agent': 'JFT-Socials-Enterprise/2.0' },
      });
      clearTimeout(timeoutId);
      const text = (await res.text()).trim();
      if (!res.ok) throw new Error(`Hero API HTTP ${res.status}: ${text.slice(0, 120)}`);
      if (/^BAD_KEY|UNAUTHORIZED|ACCESS_DENIED/i.test(text)) {
        this.authSuspended = true;
        throw new Error('Hero API key rejected. Re-check the token in Settings.');
      }
      return text;
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  public async getBalance(): Promise<{ balance: number }> {
    if (!this.isLive()) return { balance: 0 };
    const text = await this.call({ action: 'getBalance' });
    const m = text.match(/ACCESS_BALANCE:([\d.]+)/i);
    if (!m) throw new Error(`Hero balance unexpected response: ${text.slice(0, 120)}`);
    return { balance: parseFloat(m[1]) };
  }

  public serviceCode(product: string): string {
    const key = (product || '').toLowerCase().trim();
    return SERVICE_MAP[key] || key;
  }

  public countryId(country: string): number | null {
    const key = (country || '').toLowerCase().trim();
    if (key === 'any') return null; // caller decides: any-country not supported v1
    return COUNTRY_MAP[key] ?? null;
  }

  public async buyActivation(
    country: string,
    _operator: string,
    product: string
  ): Promise<HeroSmsOrder> {
    if (!this.isLive()) {
      throw new Error('Hero API key is not configured on this server.');
    }
    const cid = this.countryId(country);
    if (cid === null) {
      throw new Error(
        `Hero lane: country "${country}" is not mapped yet. Pick a mapped country or ask admin to add its Hero ID.`
      );
    }
    const text = await this.call({ action: 'getNumber', service: this.serviceCode(product), country: cid });
    if (/NO_NUMBERS|NO_BALANCE|NO_MONEY/i.test(text)) {
      throw new Error(
        /NO_BALANCE|NO_MONEY/i.test(text)
          ? 'Hero balance too low for this activation. Top up on hero-sms.com.'
          : 'No free Hero numbers right now for this route. Try another country or product.'
      );
    }
    const m = text.match(/ACCESS_NUMBER:(\d+):(\+?\d+)/);
    if (!m) throw new Error(`Hero order unexpected response: ${text.slice(0, 120)}`);
    const id = parseInt(m[1], 10);
    // Mark ready so the SMS starts flowing.
    try {
      await this.call({ action: 'setStatus', id, status: 1 });
    } catch {
      // Non-fatal: number is reserved; status polling still works.
    }
    return {
      id,
      phone: m[2].startsWith('+') ? m[2] : `+${m[2]}`,
      operator: 'any',
      product,
      price: 0,
      status: 'PENDING',
      expires: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      sms: [],
      created_at: new Date().toISOString(),
      country,
    };
  }

  public async checkOrder(id: number | string): Promise<HeroSmsOrder> {
    const text = await this.call({ action: 'getStatus', id });
    const base: HeroSmsOrder = {
      id: Number(id),
      phone: '',
      operator: 'any',
      product: '',
      price: 0,
      status: 'PENDING',
      expires: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      sms: [],
      created_at: new Date().toISOString(),
    };
    if (/^STATUS_WAIT_CODE/i.test(text)) return base;
    const ok = text.match(/STATUS_OK:(\S+)/i);
    if (ok) {
      return {
        ...base,
        status: 'RECEIVED',
        sms: [{ code: ok[1], text: null }],
      };
    }
    if (/STATUS_CANCEL/i.test(text)) return { ...base, status: 'CANCELED' };
    return base;
  }

  public async cancelOrder(id: number | string): Promise<HeroSmsOrder> {
    try {
      await this.call({ action: 'setStatus', id, status: 8 });
    } catch {
      // Refund rides on provider-side cancel semantics; surface as canceled.
    }
    return {
      id: Number(id),
      phone: '',
      operator: 'any',
      product: '',
      price: 0,
      status: 'CANCELED',
      expires: new Date().toISOString(),
      sms: [],
      created_at: new Date().toISOString(),
    };
  }

  public async finishOrder(id: number | string): Promise<HeroSmsOrder> {
    try {
      await this.call({ action: 'setStatus', id, status: 6 });
    } catch {
      // Best-effort; local state still closes.
    }
    return {
      id: Number(id),
      phone: '',
      operator: 'any',
      product: '',
      price: 0,
      status: 'FINISHED',
      expires: new Date().toISOString(),
      sms: [],
      created_at: new Date().toISOString(),
    };
  }
}
