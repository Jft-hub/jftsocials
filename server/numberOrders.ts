/**
 * Number order lifecycle: reconcile, cancel, finish, check and the background sweeper.
 *
 * Provider-agnostic: every method routes by order.provider ('fivesim' | 'herosms').
 * Legacy orders without a provider are treated as 5sim.
 *
 * Money rules:
 *  - A number order is refunded at most once (db.refundNumberOrderOnce is idempotent
 *    on the ledger reference REF-<order.id>).
 *  - The local status flips to CANCELING atomically before any provider call so a
 *    double-click cannot start two cancellations.
 *  - Raw upstream error text is never returned to customers.
 */
import { db } from './db.js';
import { NumberOrder } from '../src/types/index.js';

export interface NumberProviderOrder {
  id: number | string;
  status: string;
  expires?: string;
  sms?: Array<{ code: string; text: string }>;
}

/** The small surface every numbers provider (5sim, Hero SMS) must offer. */
export interface NumberProvider {
  isLive(): boolean;
  checkOrder(id: number | string): Promise<NumberProviderOrder>;
  cancelOrder(id: number | string): Promise<NumberProviderOrder>;
  finishOrder(id: number | string): Promise<NumberProviderOrder>;
}

export type NumberProviderResolver = (providerId?: string) => NumberProvider | undefined;

/** Clean, provider-mapped error. `code` is a stable machine code, message is safe to log. */
export class NumberProviderError extends Error {
  code: string;
  retryAfterSeconds?: number;
  constructor(code: string, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'NumberProviderError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const MISSING_RE = /order not found|no such order|unknown order|order.*(does not|doesn't) exist|not found|wrong[_ ]?id|no_activation|NO_ACTIVATION|BAD_ACTION/i;

export function isMissingOrderError(err: any): boolean {
  if (err instanceof NumberProviderError) return err.code === 'ORDER_NOT_FOUND';
  return MISSING_RE.test(String(err?.message || err || ''));
}

export type ReconcileOutcome =
  | 'received'
  | 'refunded'
  | 'missing'
  | 'finished'
  | 'pending'
  | 'unavailable'
  | 'error';

export interface ReconcileResult {
  outcome: ReconcileOutcome;
  order: NumberOrder;
}

export interface ServiceResponse {
  status: number;
  body: Record<string, any>;
}

const UNAVAILABLE_MSG = 'Virtual numbers temporarily unavailable';
const RETRY_MSG = 'We could not complete this right now. Please try again in a moment.';
const STALE_CANCELING_MS = 3 * 60 * 1000;
const SWEEP_BATCH = 30;

export function createNumberOrderService(getProvider: NumberProviderResolver) {
  const nowIso = () => new Date().toISOString();
  const fresh = (o: NumberOrder) => db.findNumberOrderById(o.id) || o;

  function audit(action: string, order: NumberOrder, details: string, actor?: { id: string; name: string; role: string }, ip = 'system') {
    try {
      db.addAuditLog({
        actor_id: actor?.id || 'system',
        actor_name: actor?.name || 'System',
        actor_role: actor?.role || 'system',
        action,
        entity_type: 'number_order',
        entity_id: order.id,
        details,
        ip
      });
    } catch {
      // auditing must never break a refund
    }
  }

  function notifyRefund(order: NumberOrder) {
    try {
      db.createNotification({
        user_id: order.user_id,
        type: 'refund',
        title: 'Virtual number refunded',
        message: `Your ${order.product} number did not receive an SMS in time. Your wallet has been refunded.`,
        read: false,
        link: '/numbers'
      });
    } catch {
      // notification is best-effort
    }
  }

  /** Refund once; returns true only when money actually moved now. */
  function refundOnce(order: NumberOrder, reason: string, actor?: { id: string; name: string; role: string }): boolean {
    const cur = fresh(order);
    if (cur.sms_code) return false; // never refund an order that got its SMS
    const r = db.refundNumberOrderOnce(cur, `Refund: ${reason} - virtual number ${cur.product}`);
    if (r.refunded) {
      audit('number_order.refund', cur, `Refunded ${cur.customer_charge} ${cur.currency} (${reason})`, actor);
      notifyRefund(cur);
    }
    return r.refunded;
  }

  function settleMissing(order: NumberOrder, actor?: { id: string; name: string; role: string }): ReconcileResult {
    const cur = fresh(order);
    if (cur.sms_code) {
      const kept = db.updateNumberOrder(cur.id, { status: cur.status === 'FINISHED' ? 'FINISHED' : 'RECEIVED' }) || cur;
      return { outcome: 'received', order: kept };
    }
    const updated = db.updateNumberOrder(cur.id, { status: 'CANCELED' }) || cur;
    const refunded = refundOnce(updated, 'provider order missing', actor);
    audit(
      'number_order.provider_missing',
      updated,
      `provider order missing, review (provider=${updated.provider || 'fivesim'}, upstream id=${updated.provider_order_id}, refunded_now=${refunded})`,
      actor
    );
    return { outcome: 'missing', order: fresh(updated) };
  }

  /** Map upstream state onto the local order. Never refunds when an SMS exists. */
  function applyUpstream(order: NumberOrder, up: NumberProviderOrder, actor?: { id: string; name: string; role: string }): ReconcileResult {
    const cur = fresh(order);
    const upStatus = String(up.status || '').toUpperCase();
    const smsList = Array.isArray(up.sms) ? up.sms : [];
    const last = smsList.length > 0 ? smsList[smsList.length - 1] : null;
    const smsPatch = last ? { sms_code: last.code, sms_text: last.text } : {};
    const expiresPatch = up.expires ? { expires_at: up.expires } : {};

    if (upStatus === 'FINISHED') {
      const o = db.updateNumberOrder(cur.id, { status: 'FINISHED', ...smsPatch }) || cur;
      return { outcome: 'finished', order: o };
    }

    if (last || upStatus === 'RECEIVED') {
      // SMS arrived: no refund. Do not resurrect an order we already refunded.
      if (cur.refunded_at) return { outcome: 'refunded', order: cur };
      const next = cur.status === 'FINISHED' ? 'FINISHED' : 'RECEIVED';
      const o = db.updateNumberOrder(cur.id, { status: next, ...smsPatch, ...expiresPatch }) || cur;
      return { outcome: 'received', order: o };
    }

    if (upStatus === 'CANCELED' || upStatus === 'TIMEOUT' || upStatus === 'BANNED') {
      const o = db.updateNumberOrder(cur.id, { status: upStatus as NumberOrder['status'] }) || cur;
      refundOnce(o, upStatus === 'TIMEOUT' ? 'timed out' : upStatus === 'BANNED' ? 'number banned' : 'cancelled', actor);
      return { outcome: 'refunded', order: fresh(o) };
    }

    // PENDING (or an unknown non-terminal state): leave the status alone.
    const o = Object.keys(expiresPatch).length > 0 ? (db.updateNumberOrder(cur.id, expiresPatch) || cur) : cur;
    return { outcome: 'pending', order: o };
  }

  /**
   * Read the upstream state and map it: SMS -> RECEIVED (no refund);
   * CANCELED/TIMEOUT/BANNED with no SMS -> set status + refund once;
   * FINISHED -> FINISHED; PENDING -> unchanged.
   */
  async function reconcileNumberOrder(order: NumberOrder, actor?: { id: string; name: string; role: string }): Promise<ReconcileResult> {
    const provider = getProvider(order.provider);
    if (!provider || !provider.isLive()) return { outcome: 'unavailable', order };
    let up: NumberProviderOrder;
    try {
      up = await provider.checkOrder(order.provider_order_id);
    } catch (err: any) {
      if (isMissingOrderError(err)) return settleMissing(order, actor);
      console.warn(`[NumberOrders] reconcile ${order.id}: upstream check failed:`, err?.message || err);
      return { outcome: 'error', order };
    }
    return applyUpstream(order, up, actor);
  }

  function ownerOrNull(orderId: string, user: { id: string; role: string }): NumberOrder | null {
    const order = db.findNumberOrderById(orderId);
    if (!order) return null;
    if (order.user_id !== user.id && !['admin', 'superadmin'].includes(user.role)) return null;
    return order;
  }

  const notFound = (): ServiceResponse => ({ status: 404, body: { success: false, error: 'Order not found' } });
  const unavailable = (): ServiceResponse => ({ status: 503, body: { success: false, error: UNAVAILABLE_MSG } });

  function restorePending(id: string) {
    db.transitionNumberOrderStatus(id, ['CANCELING'], 'PENDING');
  }

  async function cancelNumberOrder(
    orderId: string,
    user: { id: string; name?: string; role: string },
    ip = ''
  ): Promise<ServiceResponse> {
    const order = ownerOrNull(orderId, user);
    if (!order) return notFound();
    const actor = { id: user.id, name: user.name || user.id, role: user.role };

    if (order.status === 'CANCELING') {
      return { status: 409, body: { success: false, error: 'Cancellation is already in progress.' } };
    }
    if (order.status === 'RECEIVED' || (order.sms_code && order.status !== 'CANCELED')) {
      return { status: 409, body: { success: false, error: 'SMS already received, use Finish instead.' } };
    }
    if (['CANCELED', 'FINISHED', 'TIMEOUT', 'BANNED'].includes(order.status)) {
      return { status: 400, body: { success: false, error: `Order is already ${order.status}` } };
    }

    const provider = getProvider(order.provider);
    if (!provider || !provider.isLive()) return unavailable();

    // Atomic lock: only one request can move PENDING -> CANCELING.
    const locked = db.transitionNumberOrderStatus(order.id, ['PENDING'], 'CANCELING');
    if (!locked) {
      const latest = fresh(order);
      return latest.status === 'CANCELING'
        ? { status: 409, body: { success: false, error: 'Cancellation is already in progress.' } }
        : { status: 400, body: { success: false, error: `Order is already ${latest.status}` } };
    }

    try {
      const up = await provider.cancelOrder(order.provider_order_id);
      const smsList = Array.isArray(up?.sms) ? up.sms : [];
      if (smsList.length > 0 || fresh(order).sms_code) {
        const r = applyUpstream(locked, { ...up, status: 'RECEIVED' }, actor);
        return { status: 409, body: { success: false, error: 'SMS already received, use Finish instead.', order: r.order } };
      }
      const canceled = db.updateNumberOrder(order.id, { status: 'CANCELED' }) || locked;
      refundOnce(canceled, 'cancelled', actor);
      return { status: 200, body: { success: true, order: fresh(canceled), message: 'Order cancelled and refunded.' } };
    } catch (err: any) {
      // Provider asked us to wait (Hero SMS early-cancel window).
      if (err instanceof NumberProviderError && err.code === 'EARLY_CANCEL_DENIED') {
        restorePending(order.id);
        const secs = Math.max(1, Math.ceil(err.retryAfterSeconds || 60));
        return {
          status: 409,
          body: { success: false, error: `You can cancel in ${secs} seconds`, retry_after_seconds: secs, code: 'EARLY_CANCEL_DENIED' }
        };
      }

      console.warn(`[NumberOrders] cancel ${order.id}: provider error:`, err?.message || err);
      try {
        // Ask the provider what really happened, then treat terminal states as a successful cancel.
        const missingOnCancel = isMissingOrderError(err);
        const r = await reconcileNumberOrder(fresh(order), actor);
        if (r.outcome === 'refunded') {
          return { status: 200, body: { success: true, order: r.order, message: 'Order cancelled and refunded.' } };
        }
        if (r.outcome === 'missing') {
          return { status: 200, body: { success: true, order: r.order, message: 'Order cancelled and refunded.' } };
        }
        if (r.outcome === 'received') {
          return { status: 409, body: { success: false, error: 'SMS already received, use Finish instead.', order: r.order } };
        }
        if (r.outcome === 'finished') {
          return { status: 400, body: { success: false, error: 'Order is already FINISHED', order: r.order } };
        }
        if (missingOnCancel) {
          const m = settleMissing(fresh(order), actor);
          if (m.outcome === 'missing') {
            return { status: 200, body: { success: true, order: m.order, message: 'Order cancelled and refunded.' } };
          }
          return { status: 409, body: { success: false, error: 'SMS already received, use Finish instead.', order: m.order } };
        }
      } catch (inner: any) {
        console.warn(`[NumberOrders] cancel ${order.id}: reconcile failed:`, inner?.message || inner);
      }
      // Transient / still pending upstream: put it back and ask the customer to retry.
      restorePending(order.id);
      return { status: 502, body: { success: false, error: RETRY_MSG } };
    }
  }

  async function checkNumberOrder(orderId: string, user: { id: string; name?: string; role: string }): Promise<ServiceResponse> {
    const order = ownerOrNull(orderId, user);
    if (!order) return notFound();
    if (['CANCELED', 'FINISHED', 'TIMEOUT', 'BANNED'].includes(order.status) || order.status === 'CANCELING') {
      return { status: 200, body: { success: true, order } };
    }
    const provider = getProvider(order.provider);
    if (!provider || !provider.isLive()) return unavailable();
    const r = await reconcileNumberOrder(order, { id: user.id, name: user.name || user.id, role: user.role });
    if (r.outcome === 'unavailable') return unavailable();
    // 'error' = transient upstream hiccup: return the stored order, the client keeps polling.
    return { status: 200, body: { success: true, order: r.order } };
  }

  async function finishNumberOrder(orderId: string, user: { id: string; name?: string; role: string }): Promise<ServiceResponse> {
    const order = ownerOrNull(orderId, user);
    if (!order) return notFound();
    if (order.status === 'CANCELING') {
      return { status: 409, body: { success: false, error: 'Cancellation is in progress.' } };
    }
    if (['CANCELED', 'TIMEOUT', 'BANNED'].includes(order.status)) {
      return { status: 400, body: { success: false, error: `Order is already ${order.status}` } };
    }
    const provider = getProvider(order.provider);
    if (!provider || !provider.isLive()) return unavailable();
    try {
      await provider.finishOrder(order.provider_order_id);
      const updated = db.updateNumberOrder(order.id, { status: 'FINISHED' });
      return { status: 200, body: { success: true, order: updated, message: 'Order completed.' } };
    } catch (err: any) {
      console.warn(`[NumberOrders] finish ${order.id}: provider error:`, err?.message || err);
      const r = await reconcileNumberOrder(fresh(order));
      if (r.outcome === 'finished') {
        return { status: 200, body: { success: true, order: r.order, message: 'Order completed.' } };
      }
      return { status: 502, body: { success: false, error: RETRY_MSG, order: r.order } };
    }
  }

  let sweeping = false;

  /**
   * Background sweeper (called every ~60s from the automation engine).
   * PENDING orders are reconciled against the provider: expired or terminal
   * upstream states are closed and refunded exactly once. CANCELING orders that
   * have been stuck for a few minutes (server restarted mid-cancel) are released.
   */
  async function sweepNumberOrders(): Promise<{ checked: number; refunded: number }> {
    if (sweeping) return { checked: 0, refunded: 0 };
    sweeping = true;
    let checked = 0;
    let refunded = 0;
    try {
      const now = Date.now();
      const candidates = db
        .getNumberOrders()
        .filter(o =>
          o.status === 'PENDING' ||
          (o.status === 'CANCELING' && now - Date.parse(o.updated_at) > STALE_CANCELING_MS)
        )
        .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))
        .slice(0, SWEEP_BATCH);

      for (const o of candidates) {
        try {
          if (o.status === 'CANCELING') restorePending(o.id);
          checked++;
          const before = fresh(o).refunded_at;
          const r = await reconcileNumberOrder(fresh(o));
          if (r.outcome === 'refunded' || r.outcome === 'missing') {
            if (!before && r.order.refunded_at) refunded++;
          }
        } catch (err: any) {
          console.warn(`[NumberOrders] sweep ${o.id} failed:`, err?.message || err);
        }
      }
      if (refunded > 0) console.log(`[NumberOrders] Sweeper refunded ${refunded} order(s) (checked ${checked}).`);
    } finally {
      sweeping = false;
    }
    return { checked, refunded };
  }

  return { reconcileNumberOrder, cancelNumberOrder, checkNumberOrder, finishNumberOrder, sweepNumberOrders };
}

export type NumberOrderService = ReturnType<typeof createNumberOrderService>;
