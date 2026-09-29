import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrderPrice, calculateNumberPrice, isNumberPricingConfigured } from './pricingEngine.js';
import type { Service, SystemSettings, Currency } from '../src/types/index.js';

const settings = {
  exchange_rate_usd_ngn: 1500,
  payment_fee_enabled: false,
  payment_fee_percentage: 0
} as unknown as SystemSettings;

function svc(name: string, providerRate: number, customPrice?: number): Service {
  return {
    id: 'test_srv',
    provider_id: 'peakerr',
    provider_service_id: 1,
    name,
    category_id: 'cat_ig',
    provider_rate: providerRate,
    custom_price: customPrice,
    min_quantity: 1,
    max_quantity: 1000000,
    refill_supported: true,
    cancel_supported: true,
    active: true,
    ordering_enabled: true
  } as unknown as Service;
}

function price(name: string, rate: number, quantity: number, currency: Currency = 'NGN', custom?: number) {
  return calculateOrderPrice({ service: svc(name, rate, custom), quantity, currency, settings });
}

const F = 'Instagram Followers [30 Day Refill]';

test('followers: cost 1200/1000 uses flat 2.50 per unit', () => {
  assert.equal(price(F, 1200, 1000).customer_price, 2500);
  assert.equal(price(F, 1200, 100).customer_price, 250);
  assert.equal(price(F, 1200, 10).customer_price, 25);
  assert.equal(price(F, 1200, 500).customer_price, 1250);
  assert.equal(price(F, 1200, 1000).pricing_rule_version, 'v5-followers-2500');
});

test('followers: cost 2499.99 stays on the flat branch', () => {
  assert.equal(price(F, 2499.99, 1000).customer_price, 2500);
});

test('followers: cost 2500 and above is cost x 1.30 with no floor', () => {
  assert.equal(price(F, 2500, 1000).customer_price, 3250);
  assert.equal(price(F, 4000, 1000).customer_price, 5200);
  assert.equal(price(F, 4000, 100).customer_price, 520);
  assert.equal(price(F, 4000, 1000).applied_markup, 1200);
});

test('followers: custom_price overrides provider_rate as the base rate', () => {
  assert.equal(price(F, 1200, 1000, 'NGN', 3000).customer_price, 3900);
});

test('non-followers keep the v4.1 rule (base < 50 => +50, else +30%)', () => {
  const likes = price('Instagram Likes', 40, 1000);
  assert.equal(likes.customer_price, 90);
  assert.equal(likes.pricing_rule_version, 'v4.1-flat50-plus30');
  assert.equal(price('Instagram Likes', 1000, 1000).customer_price, 1300);
});

test('USDT conversion happens after the NGN price is computed', () => {
  const r = price(F, 4000, 1000, 'USDT');
  assert.equal(r.currency, 'USDT');
  assert.equal(r.customer_price, 3.47); // 5200 / 1500
  assert.equal(price(F, 1200, 1000, 'USDT').customer_price, 1.67); // 2500 / 1500
});

// ---- Virtual numbers (5sim is USD-scale; site flat rate 1500; +30%) ----
const numSettings = (over: Record<string, unknown> = {}) => ({
  exchange_rate_usd_ngn: 1500,
  five_sim_rate_to_ngn: 0,
  five_sim_markup_percentage: 30,
  ...over
}) as unknown as SystemSettings;

test('numbers: raw 0.09 USD x 1500 x 1.30 = 175.50 NGN using the site rate', () => {
  const r = calculateNumberPrice(0.09, 'NGN', numSettings());
  assert.equal(r.customerPrice, 175.5);
  assert.equal(r.providerCostNGN, 135);
});

test('numbers: explicit rate override (raw 10, rate 20, markup 30 -> 260.00)', () => {
  assert.equal(calculateNumberPrice(10, 'NGN', numSettings({ five_sim_rate_to_ngn: 20 })).customerPrice, 260);
});

test('numbers: USDT price is the NGN customer price / site rate', () => {
  assert.equal(calculateNumberPrice(1, 'USDT', numSettings()).customerPrice, 1.3);
  assert.equal(calculateNumberPrice(0.09, 'USDT', numSettings()).customerPrice, 0.12);
});

test('numbers: no rate at all throws and is reported as not configured', () => {
  const none = numSettings({ exchange_rate_usd_ngn: 0, five_sim_rate_to_ngn: 0 });
  assert.equal(isNumberPricingConfigured(none), false);
  assert.throws(() => calculateNumberPrice(1, 'NGN', none));
});
