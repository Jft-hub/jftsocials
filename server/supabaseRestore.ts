// Boot-time self-healing from the Supabase mirror.
//
// Problem: on free hosting the local JSON file resets to the committed copy
// on every redeploy, wiping live drift (new users, debits, role changes).
// The mirror (server/supabaseMirror.ts) already pushes every save upstream.
// This module closes the loop: at startup, if Supabase holds NEWER data than
// the local file (strictly greater row counts), it pulls the mirror down and
// replaces the local small tables before the server starts serving.
//
// Safety rules (read carefully):
// - Restore ONLY fires when remote counts are strictly greater than local.
//   It can never overwrite newer local data with older remote data.
// - The provider catalog (services/grouped_services/categories) is NEVER
//   touched: it re-syncs from providers on boot anyway.
// - Any failure (no env, network error, timeout) = boot continues on the
//   local JSON file. This module can delay startup by at most RESTORE_TIMEOUT_MS.
// - Reads/writes during normal operation are unchanged (JSON stays primary).

export interface MirrorCounts {
  [table: string]: number;
}

const MIRROR_TABLES = [
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
  'deleted_orders',
];

// Tables whose growth proves the mirror is newer. Catalog-ish small tables
// (account_categories) are restored too, but don't trigger on their own.
const GROWTH_TABLES = [
  'users',
  'wallets',
  'wallet_transactions',
  'orders',
  'number_orders',
  'account_orders',
  'payments',
  'support_tickets',
  'support_messages',
  'notifications',
  'deleted_users',
  'deleted_orders',
];

const RESTORE_TIMEOUT_MS = 25000;
const PAGE_SIZE = 2000;

function config(): { url: string; key: string } | null {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = (process.env.SUPABASE_SERVICE_KEY || '').trim();
  if (!url || !key) return null;
  return { url, key };
}

function headers(key: string): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

async function remoteCount(url: string, key: string, table: string): Promise<number> {
  const res = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, {
    headers: { ...headers(key), Prefer: 'count=exact' },
  });
  if (!res.ok) throw new Error(`${table} count -> HTTP ${res.status}`);
  const range = res.headers.get('content-range') || '';
  const total = range.includes('/') ? parseInt(range.split('/')[1], 10) : NaN;
  return isNaN(total) ? 0 : total;
}

async function downloadTable(url: string, key: string, table: string): Promise<any[]> {
  const rows: any[] = [];
  let offset = 0;
  for (let page = 0; page < 25; page++) {
    // No ORDER BY: tables are wholesale-replaced and small, and not every
    // table (e.g. deleted_users) has a created_at column.
    const res = await fetch(
      `${url}/rest/v1/${table}?select=*&limit=${PAGE_SIZE}&offset=${offset}`,
      { headers: headers(key) }
    );
    if (!res.ok) throw new Error(`${table} download -> HTTP ${res.status}`);
    const batch = (await res.json()) as any[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += batch.length;
  }
  return rows;
}

async function downloadSettings(url: string, key: string): Promise<any | null> {
  const res = await fetch(`${url}/rest/v1/system_settings?select=*&id=eq.1&limit=1`, {
    headers: headers(key),
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as any[];
  if (!rows || rows.length === 0) return null;
  const { id, ...settings } = rows[0];
  return settings;
}

// Returns true when a restore happened. Never throws.
export async function maybeRestoreFromMirror(
  localCounts: MirrorCounts,
  apply: (tables: Record<string, any[]>, settings: any | null) => void
): Promise<boolean> {
  const cfg = config();
  if (!cfg) return false;

  const job = (async (): Promise<boolean> => {
    // 1. Compare counts (cheap: no row data transferred).
    let newer = false;
    const remoteCounts: MirrorCounts = {};
    for (const t of MIRROR_TABLES) {
      try {
        remoteCounts[t] = await remoteCount(cfg.url, cfg.key, t);
      } catch {
        remoteCounts[t] = localCounts[t] || 0;
      }
      if (GROWTH_TABLES.includes(t) && remoteCounts[t] > (localCounts[t] || 0)) {
        newer = true;
      }
    }

    if (!newer) {
      console.log('[SupabaseRestore] Local data is current - no restore needed.');
      return false;
    }

    // 2. Remote is strictly newer: download and apply.
    console.log('[SupabaseRestore] Mirror is newer than local file - restoring...');
    const tables: Record<string, any[]> = {};
    for (const t of MIRROR_TABLES) {
      if ((remoteCounts[t] || 0) === 0) {
        tables[t] = [];
        continue;
      }
      tables[t] = await downloadTable(cfg.url, cfg.key, t);
    }
    const settings = await downloadSettings(cfg.url, cfg.key);

    apply(tables, settings);
    console.log('[SupabaseRestore] Restore complete.');
    return true;
  })();

  const timeout = new Promise<boolean>((resolve) =>
    setTimeout(() => {
      console.warn('[SupabaseRestore] Timed out - booting on local JSON file.');
      resolve(false);
    }, RESTORE_TIMEOUT_MS)
  );

  try {
    return await Promise.race([job, timeout]);
  } catch (e: any) {
    console.warn('[SupabaseRestore] Failed - booting on local JSON file:', e.message || e);
    return false;
  }
}
