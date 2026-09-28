// Live Supabase mirror (write-through backup).
//
// The JSON file remains the primary store: every read in the app still comes
// from memory/file, so this module can NEVER change balances or break orders.
// On each local save it upserts only the small, irreplaceable tables
// (users, wallets, ledger, orders, payments, settings) to Supabase.
// The multi-MB provider catalog (services/grouped_services) is intentionally
// skipped: it re-downloads from providers on boot and would waste egress.
//
// Required env (Render dashboard, backend only - NEVER expose to frontend):
//   SUPABASE_URL          e.g. https://xyzcompany.supabase.co
//   SUPABASE_SERVICE_KEY  the service_role key (bypasses RLS)
//
// If either is missing, the mirror quietly disables itself (one log line).

export interface MirrorSnapshot {
  users: any[];
  wallets: any[];
  wallet_transactions: any[];
  orders: any[];
  number_orders: any[];
  account_categories: any[];
  account_listings: any[];
  account_orders: any[];
  payments: any[];
  support_tickets: any[];
  support_messages: any[];
  notifications: any[];
  audit_logs: any[];
  settings: any | null;
}

const TABLES: Array<keyof Omit<MirrorSnapshot, 'settings'>> = [
  'users',
  'wallets',
  'wallet_transactions',
  'orders',
  'number_orders',
  'account_categories',
  'account_listings',
  'account_orders',
  'payments',
  'support_tickets',
  'support_messages',
  'notifications',
  'audit_logs',
  'deleted_users',
];

let disabledLogged = false;
let pending: MirrorSnapshot | null = null;
let timer: NodeJS.Timeout | null = null;
const FLUSH_INTERVAL_MS = 45 * 1000; // at most one mirror batch per 45s

function config(): { url: string; key: string } | null {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = (process.env.SUPABASE_SERVICE_KEY || '').trim();
  if (!url || !key) {
    if (!disabledLogged) {
      disabledLogged = true;
      console.log('[SupabaseMirror] SUPABASE_URL/SUPABASE_SERVICE_KEY not set - mirror disabled, JSON file unaffected.');
    }
    return null;
  }
  return { url, key };
}

async function upsertTable(url: string, key: string, table: string, rows: any[]): Promise<void> {
  if (!rows || rows.length === 0) return;
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`upsert ${table} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
}

async function flush(snapshot: MirrorSnapshot): Promise<void> {
  const cfg = config();
  if (!cfg) return;
  // Fire each table independently so one bad row can never block the rest.
  const jobs: Promise<void>[] = TABLES.map((t) =>
    upsertTable(cfg.url, cfg.key, t, snapshot[t] || []).catch((e: any) => {
      console.warn(`[SupabaseMirror] ${t}: ${e.message || e}`);
    })
  );
  if (snapshot.settings) {
    jobs.push(
      upsertTable(cfg.url, cfg.key, 'system_settings', [{ id: 1, ...snapshot.settings }]).catch((e: any) => {
        console.warn(`[SupabaseMirror] system_settings: ${e.message || e}`);
      })
    );
  }
  await Promise.all(jobs);
  console.log('[SupabaseMirror] Mirror batch pushed.');
}

// Called from Database.save(). Fire-and-forget by design: it must never
// throw and never delay the request that triggered the save.
export function queueMirrorSnapshot(snapshot: MirrorSnapshot): void {
  try {
    if (!config()) return;
    pending = snapshot; // always keep only the latest - older states are obsolete
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      const batch = pending;
      pending = null;
      if (batch) {
        flush(batch).catch((e: any) => {
          console.warn('[SupabaseMirror] Batch failed (local JSON unaffected):', e.message || e);
        });
      }
    }, FLUSH_INTERVAL_MS);
    if (typeof (timer as any).unref === 'function') (timer as any).unref();
  } catch (e: any) {
    console.warn('[SupabaseMirror] Queue failed (local JSON unaffected):', e.message || e);
  }
}

// Boot-time reconciliation log: compares local counts vs Supabase counts.
// Warn-only. Never throws, never blocks startup.
export function verifyMirrorAtBoot(local: Record<string, number>): void {
  try {
    const cfg = config();
    if (!cfg) return;
    (async () => {
      try {
        for (const t of TABLES) {
          const expected = local[t] ?? 0;
          if (expected === 0) continue;
          const res = await fetch(
            `${cfg.url}/rest/v1/${t}?select=id&limit=1`,
            {
              headers: {
                apikey: cfg.key,
                Authorization: `Bearer ${cfg.key}`,
                Prefer: 'count=exact',
              } as any,
            }
          );
          const range = res.headers.get('content-range');
          const remote = range && range.includes('/') ? range.split('/')[1] : '?';
          console.log(`[SupabaseMirror] ${t}: local=${expected} supabase=${remote}`);
        }
      } catch (e: any) {
        console.warn('[SupabaseMirror] Boot verify skipped (local JSON unaffected):', e.message || e);
      }
    })();
  } catch {
    // intentionally silent
  }
}
