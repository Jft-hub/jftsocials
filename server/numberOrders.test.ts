import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolated database: db.ts stores its JSON file under <cwd>/data.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jft-num-test-'));
process.chdir(tmp);
process.env.ENCRYPTION_KEY = 'unit-test-encryption-key-0123456789abcdef';

const { db } = await import('./db.js');
const { createNumberOrderService, NumberProviderError } = await import('./numberOrders.js');
import type { NumberOrder } from '../src/types/index.js';

type Up = { id: number; status: string; sms?: any[]; expires?: string };

function makeProvider(opts: {
  live?: boolean;
  check?: () => Promise<Up>;
  cancel?: () => Promise<Up>;
  finish?: () => Promise<Up>;
}) {
  return {
    isLive: () => opts.live !== false,
    checkOrder: opts.check || (async () => ({ id: 1, status: 'PENDING', sms: [] })),
    cancelOrder: opts.cancel || (async () => ({ id: 1, status: 'CANCELED', sms: [] })),
    finishOrder: opts.finish || (async () => ({ id: 1, status: 'FINISHED', sms: [] }))
  };
}

let seq = 0;
const CHARGE = 500;

function newOrder(status: NumberOrder['status'] = 'PENDING'): { order: NumberOrder; userId: string } {
  seq++;
  const userId = `user_t${seq}`;
  const id = `JFT-NUM-T${seq}`;
  db.creditWallet(userId, 'NGN', 1000, 'manual', `seed_${seq}`, 'seed');
  db.debitWallet(userId, 'NGN', CHARGE, 'order', id, 'test order');
  const now = new Date().toISOString();
  const order: NumberOrder = {
    id, user_id: userId, provider: 'fivesim', provider_order_id: 1000 + seq,
    country: 'nigeria', operator: 'any', product: 'whatsapp', phone: '+2348000000000',
    status, provider_cost: 0.1, customer_charge: CHARGE, currency: 'NGN',
    sms_code: null, sms_text: null, expires_at: now, created_at: now, updated_at: now
  };
  db.createNumberOrder(order);
  return { order, userId };
}

const balance = (userId: string) => db.getWallet(userId, 'NGN').available_balance;
const refundEntries = (orderId: string) =>
  (db as any).data.wallet_transactions.filter((t: any) => t.reference_id === `REF-${orderId}` && t.type === 'refund');
const svc = (p: ReturnType<typeof makeProvider>) => createNumberOrderService(() => p as any);

test('cancel pending order: refunded once, second cancel rejected', async () => {
  const { order, userId } = newOrder();
  const s = svc(makeProvider({}));
  const r1 = await s.cancelNumberOrder(order.id, { id: userId, role: 'user' });
  assert.equal(r1.status, 200);
  assert.equal(balance(userId), 1000);
  const r2 = await s.cancelNumberOrder(order.id, { id: userId, role: 'user' });
  assert.equal(r2.status, 400);
  assert.equal(balance(userId), 1000);
  assert.equal(refundEntries(order.id).length, 1);
});

test('double-click cancel (concurrent) refunds exactly once', async () => {
  const { order, userId } = newOrder();
  const slow = makeProvider({ cancel: async () => { await new Promise(r => setTimeout(r, 30)); return { id: 1, status: 'CANCELED', sms: [] }; } });
  const s = svc(slow);
  const [a, b] = await Promise.all([
    s.cancelNumberOrder(order.id, { id: userId, role: 'user' }),
    s.cancelNumberOrder(order.id, { id: userId, role: 'user' })
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(balance(userId), 1000);
  assert.equal(refundEntries(order.id).length, 1);
});

test('provider says "order not found": refund once, CANCELED, audit flagged, no raw text', async () => {
  const { order, userId } = newOrder();
  const notFound = async () => { throw new Error('5sim request failed: 5sim API error (404): order not found'); };
  const s = svc(makeProvider({ cancel: notFound, check: notFound }));
  const r = await s.cancelNumberOrder(order.id, { id: userId, role: 'user' });
  assert.equal(r.status, 200);
  assert.doesNotMatch(JSON.stringify(r.body), /5sim|not found/i);
  assert.equal(db.findNumberOrderById(order.id)!.status, 'CANCELED');
  assert.equal(balance(userId), 1000);
  assert.equal(refundEntries(order.id).length, 1);
  const audited = (db as any).data.audit_logs.some((a: any) => a.entity_id === order.id && /provider order missing, review/.test(a.details));
  assert.ok(audited);
});

test('cancel errors but upstream is TIMEOUT with no SMS: treated as cancel, refunded once', async () => {
  const { order, userId } = newOrder();
  const s = svc(makeProvider({
    cancel: async () => { throw new Error('order is expired'); },
    check: async () => ({ id: 1, status: 'TIMEOUT', sms: [] })
  }));
  const r = await s.cancelNumberOrder(order.id, { id: userId, role: 'user' });
  assert.equal(r.status, 200);
  assert.equal(db.findNumberOrderById(order.id)!.status, 'TIMEOUT');
  assert.equal(balance(userId), 1000);
  assert.equal(refundEntries(order.id).length, 1);
});

test('SMS already arrived: 409 use Finish, no refund, status RECEIVED', async () => {
  const { order, userId } = newOrder();
  const s = svc(makeProvider({
    cancel: async () => { throw new Error('order has sms'); },
    check: async () => ({ id: 1, status: 'RECEIVED', sms: [{ code: '123456', text: 'Your code 123456' }] })
  }));
  const r = await s.cancelNumberOrder(order.id, { id: userId, role: 'user' });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /use Finish instead/);
  assert.equal(db.findNumberOrderById(order.id)!.status, 'RECEIVED');
  assert.equal(balance(userId), 500);
  assert.equal(refundEntries(order.id).length, 0);
});

test('transient provider failure: friendly 502, order back to PENDING, no refund', async () => {
  const { order, userId } = newOrder();
  const boom = async () => { throw new Error('5sim request failed: fetch failed ETIMEDOUT'); };
  const s = svc(makeProvider({ cancel: boom, check: boom }));
  const r = await s.cancelNumberOrder(order.id, { id: userId, role: 'user' });
  assert.equal(r.status, 502);
  assert.doesNotMatch(JSON.stringify(r.body), /5sim|ETIMEDOUT/);
  assert.equal(db.findNumberOrderById(order.id)!.status, 'PENDING');
  assert.equal(balance(userId), 500);
});

test('provider not live: 503 for cancel/check/finish and nothing changes', async () => {
  const { order, userId } = newOrder();
  const s = svc(makeProvider({ live: false }));
  assert.equal((await s.cancelNumberOrder(order.id, { id: userId, role: 'user' })).status, 503);
  assert.equal((await s.checkNumberOrder(order.id, { id: userId, role: 'user' })).status, 503);
  assert.equal((await s.finishNumberOrder(order.id, { id: userId, role: 'user' })).status, 503);
  assert.equal(db.findNumberOrderById(order.id)!.status, 'PENDING');
  assert.equal(balance(userId), 500);
});

test('early cancel denied: message with seconds, order stays PENDING', async () => {
  const { order, userId } = newOrder();
  const s = svc(makeProvider({ cancel: async () => { throw new NumberProviderError('EARLY_CANCEL_DENIED', 'early', 30); } }));
  const r = await s.cancelNumberOrder(order.id, { id: userId, role: 'user' });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'You can cancel in 30 seconds');
  assert.equal(db.findNumberOrderById(order.id)!.status, 'PENDING');
  assert.equal(balance(userId), 500);
});

test('sweeper refunds a timed-out order once, even when run repeatedly', async () => {
  const { order, userId } = newOrder();
  const s = svc(makeProvider({ check: async () => ({ id: 1, status: 'TIMEOUT', sms: [] }) }));
  await s.sweepNumberOrders();
  await s.sweepNumberOrders();
  assert.equal(db.findNumberOrderById(order.id)!.status, 'TIMEOUT');
  assert.equal(balance(userId), 1000);
  assert.equal(refundEntries(order.id).length, 1);
});

test('sweeper leaves a still-pending order alone and never refunds an order with SMS', async () => {
  const a = newOrder();
  const b = newOrder();
  const s = createNumberOrderService(() => ({
    isLive: () => true,
    cancelOrder: async () => ({ id: 1, status: 'CANCELED' }),
    finishOrder: async () => ({ id: 1, status: 'FINISHED' }),
    checkOrder: async (id: number | string) =>
      Number(id) === a.order.provider_order_id
        ? { id: 1, status: 'PENDING', sms: [] }
        : { id: 2, status: 'RECEIVED', sms: [{ code: '999', text: 'code 999' }] }
  }) as any);
  await s.sweepNumberOrders();
  assert.equal(db.findNumberOrderById(a.order.id)!.status, 'PENDING');
  assert.equal(balance(a.userId), 500);
  assert.equal(db.findNumberOrderById(b.order.id)!.status, 'RECEIVED');
  assert.equal(balance(b.userId), 500);
});
