import { Service, Category, Currency, SystemSettings, PriceCalculationResult } from '../src/types/index.js';

/**
 * Rounds a financial number cleanly to 2 decimal places to avoid IEEE-754 precision issues.
 */
export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export interface PricingOptions {
  service: Service;
  category?: Category | null;
  quantity: number;
  currency: Currency;
  settings: SystemSettings;
}

/**
 * JFT Socials Core Pricing & Profit Engine (rule v4)
 *
 * Provider Cost = (Provider Rate in NGN * Customer Quantity) / 1000
 * Final Customer Price:
 *   - Base below ₦50  -> base + ₦50 flat (e.g. ₦3 -> ₦53, ₦7.30 -> ₦57.30)
 *   - Base ₦50 or more -> base + 30%
 * The base is the provider cost (or the service custom price when set).
 * Customers only ever see the final total, never the added margin.
 */
export function calculateOrderPrice(options: PricingOptions): PriceCalculationResult {
  const { service, category, quantity, currency, settings } = options;

  const exchangeRate = settings.exchange_rate_usd_ngn > 0 ? settings.exchange_rate_usd_ngn : 1500;

  // 1. Determine base provider cost for the ordered quantity
  // service.provider_rate is stored in NGN per 1,000 units.
  const rateInNGN = service.provider_rate;
  let providerCostNGN = roundMoney((rateInNGN * quantity) / 1000);

  // Base figure: service custom price when set, otherwise the provider cost.
  // (Legacy markup/floor settings are intentionally not consulted: the v4
  // rule below is the single pricing law.)
  const markupPercentage = 30;
  const minMarginNGN = 51;
  let baseNGN: number;
  if (service.custom_price && service.custom_price > 0) {
    baseNGN = roundMoney((service.custom_price * quantity) / 1000);
  } else {
    baseNGN = providerCostNGN;
  }

  // JFT rule v4.1, applied BEFORE the price is rendered anywhere.
  let customerPriceNGN: number;
  let appliedMarkupNGN: number;
  let calculatedPercentMarkupNGN: number;
  if (baseNGN < 50) {
    customerPriceNGN = roundMoney(baseNGN + 50);
    calculatedPercentMarkupNGN = roundMoney(baseNGN * 0.30);
    appliedMarkupNGN = roundMoney(customerPriceNGN - providerCostNGN);
  } else {
    calculatedPercentMarkupNGN = roundMoney(baseNGN * 0.30);
    customerPriceNGN = roundMoney(baseNGN + calculatedPercentMarkupNGN);
    appliedMarkupNGN = roundMoney(customerPriceNGN - providerCostNGN);
  }

  // Calculate gross margin in NGN
  const grossProfitNGN = roundMoney(customerPriceNGN - providerCostNGN);

  // Payment fee (if enabled, calculated on total or tracked separately)
  const paymentFeeNGN = settings.payment_fee_enabled
    ? roundMoney(customerPriceNGN * (settings.payment_fee_percentage / 100))
    : 0;

  const netProfitNGN = roundMoney(grossProfitNGN - paymentFeeNGN);

  // 4. Handle Currency Conversion (NGN vs USDT)
  let finalProviderCost: number;
  let finalCustomerPrice: number;
  let finalCalculatedPercentMarkup: number;
  let finalMinMarkup: number;
  let finalAppliedMarkup: number;
  let finalGrossProfit: number;
  let finalPaymentFee: number;
  let finalNetProfit: number;
  let finalTotalCharge: number;

  if (currency === 'USDT') {
    // 1 USDT = exchangeRate NGN
    finalProviderCost = roundMoney(providerCostNGN / exchangeRate);
    finalCalculatedPercentMarkup = roundMoney(calculatedPercentMarkupNGN / exchangeRate);
    finalMinMarkup = roundMoney(minMarginNGN / exchangeRate);
    finalAppliedMarkup = roundMoney(appliedMarkupNGN / exchangeRate);
    finalCustomerPrice = roundMoney(customerPriceNGN / exchangeRate);
    finalGrossProfit = roundMoney(grossProfitNGN / exchangeRate);
    finalPaymentFee = roundMoney(paymentFeeNGN / exchangeRate);
    finalNetProfit = roundMoney(netProfitNGN / exchangeRate);
    finalTotalCharge = finalCustomerPrice;
  } else {
    finalProviderCost = providerCostNGN;
    finalCalculatedPercentMarkup = calculatedPercentMarkupNGN;
    finalMinMarkup = minMarginNGN;
    finalAppliedMarkup = appliedMarkupNGN;
    finalCustomerPrice = customerPriceNGN;
    finalGrossProfit = grossProfitNGN;
    finalPaymentFee = paymentFeeNGN;
    finalNetProfit = netProfitNGN;
    finalTotalCharge = customerPriceNGN;
  }

  const effectiveProfitPercentage = finalProviderCost > 0
    ? roundMoney((finalGrossProfit / finalProviderCost) * 100)
    : 100;

  return {
    provider_cost: finalProviderCost,
    percentage_markup: markupPercentage,
    calculated_percentage_markup: finalCalculatedPercentMarkup,
    minimum_markup: finalMinMarkup,
    applied_markup: finalAppliedMarkup,
    customer_price: finalCustomerPrice,
    payment_fee: finalPaymentFee,
    total_charge: finalTotalCharge,
    gross_profit: finalGrossProfit,
    net_profit: finalNetProfit,
    effective_profit_percentage: effectiveProfitPercentage,
    currency,
    exchange_rate_used: exchangeRate,
    pricing_rule_version: 'v4.1-flat50-plus30'
  };
}

/**
 * Strips confidential provider and profit metrics before returning to customer clients.
 */
export function sanitizePricingForCustomer(calc: PriceCalculationResult) {
  return {
    customer_price: calc.customer_price,
    total_charge: calc.total_charge,
    currency: calc.currency,
    payment_fee: calc.payment_fee
  };
}

/**
 * Calculates selling price for single-unit virtual numbers from 5sim.net.
 */
export function calculateNumberPrice(
  providerCostNative: number,
  currency: Currency,
  settings: SystemSettings
): { customerPrice: number; providerCostNGN: number } {
  if (!settings.five_sim_rate_to_ngn || settings.five_sim_rate_to_ngn <= 0) {
    throw new Error('5sim exchange rate is not configured. An admin must set it in Settings before virtual numbers can be sold.');
  }
  const providerCostNGN = roundMoney(providerCostNative * settings.five_sim_rate_to_ngn);
  const markup = roundMoney(providerCostNGN * (settings.five_sim_markup_percentage / 100));
  const customerPriceNGN = roundMoney(providerCostNGN + markup);

  if (currency === 'USDT') {
    const exchangeRate = settings.exchange_rate_usd_ngn > 0 ? settings.exchange_rate_usd_ngn : 1500;
    return { customerPrice: roundMoney(customerPriceNGN / exchangeRate), providerCostNGN };
  }
  return { customerPrice: customerPriceNGN, providerCostNGN };
}

