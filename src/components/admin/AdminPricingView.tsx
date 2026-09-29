import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  Calculator,
  ShieldCheck,
  TrendingUp,
  Save,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';

export const AdminPricingView: React.FC = () => {
  const { token, showToast } = useApp();

  // Settings State
  const [markupPercent, setMarkupPercent] = useState<number>(20);
  const [minMarkupNGN, setMinMarkupNGN] = useState<number>(10);
  const [usdtRate, setUsdtRate] = useState<number>(1500);
  const [depositFeePercent, setDepositFeePercent] = useState<number>(3);
  const [savingSettings, setSavingSettings] = useState(false);

  // Live Calculator State
  const [calcProviderRate, setCalcProviderRate] = useState<number>(1200); // Provider cost per 1k in NGN
  const [calcQuantity, setCalcQuantity] = useState<number>(1000);
  const [calcResult, setCalcResult] = useState<any>(null);

  // Fetch Current Settings
  useEffect(() => {
    if (!token) return;
    fetch('/api/admin/settings', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.success && data.settings) {
          const s = data.settings;
          setMarkupPercent(s.default_markup_percentage ?? s.default_markup_percent ?? 20);
          setMinMarkupNGN(s.default_min_margin_ngn ?? s.minimum_markup_ngn ?? 10);
          setUsdtRate(s.exchange_rate_usd_ngn ?? s.exchange_rate_usdt_ngn ?? 1500);
          setDepositFeePercent(s.payment_fee_percentage ?? s.deposit_fee_percent ?? 3);
        }
      })
      .catch(console.error);
  }, [token]);

  // Live Calculator Logic (mirrors the live v4.1 engine rule exactly)
  useEffect(() => {
    const providerCost = (calcProviderRate * calcQuantity) / 1000;
    const percentageProfit = providerCost * 0.3;
    const floorProfit = 50;
    const isFloorApplied = providerCost < 50;
    const grossProfit = isFloorApplied ? 50 : percentageProfit;
    const finalSellingPrice = isFloorApplied ? providerCost + 50 : providerCost + percentageProfit;
    const effectiveMargin = finalSellingPrice > 0 ? (grossProfit / finalSellingPrice) * 100 : 0;

    setCalcResult({
      providerCost,
      percentageProfit,
      floorProfit,
      isFloorApplied,
      grossProfit,
      finalSellingPrice,
      effectiveMargin,
      priceInUSDT: finalSellingPrice / usdtRate
    });
  }, [calcProviderRate, calcQuantity, usdtRate]);

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSavingSettings(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          default_markup_percent: Number(markupPercent),
          minimum_markup_ngn: Number(minMarkupNGN),
          exchange_rate_usdt_ngn: Number(usdtRate),
          deposit_fee_percent: Number(depositFeePercent)
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Pricing engine rules updated successfully.', 'success');
      } else {
        showToast(data.error || 'Failed to update settings.', 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300">
            Rule of Truth
          </span>
          <span className="text-xs font-mono text-cyan-400">
            Selling Price = Cost + ₦50 under ₦50, else Cost + 30%
          </span>
        </div>
        <h1 className="text-2xl font-bold font-display text-white mt-1">
          Pricing Engine & Profit Simulator
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Guarantees platform profitability on micro and macro order volumes.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live Interactive Calculator (7 cols) */}
        <div className="lg:col-span-7 bg-[#0b0f19] border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-cyan-400" />
              <h2 className="text-base font-bold font-display text-white">Live Admin Pricing Simulator</h2>
            </div>
            <span className="text-[11px] text-slate-400">Real-time dynamic breakdown</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Provider Cost per 1,000 units (₦)
              </label>
              <input
                type="number"
                min={1}
                value={calcProviderRate}
                onChange={e => setCalcProviderRate(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Order Quantity (units)
              </label>
              <input
                type="number"
                min={100}
                step={100}
                value={calcQuantity}
                onChange={e => setCalcQuantity(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Step-by-Step Mathematical Output Card */}
          {calcResult && (
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Mathematical Execution Trace
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center text-slate-300">
                  <span>1. Base Provider Upstream Cost:</span>
                  <span className="font-mono font-bold text-white">
                    ₦{calcResult.providerCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex justify-between items-center text-slate-300">
                  <span>2. Standard 30% Markup:</span>
                  <span className="font-mono text-slate-300">
                    ₦{calcResult.percentageProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex justify-between items-center text-slate-300">
                  <span>3. Micro-Order Margin:</span>
                  <span className="font-mono text-indigo-300 font-semibold">
                    +₦50 flat under ₦50
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-cyan-400" />
                    <span className="text-[11px] font-medium text-slate-200">
                      Applied Profit Margin:
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-emerald-400">
                      +₦{calcResult.grossProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-cyan-400 font-semibold">
                      {calcResult.isFloorApplied ? '+₦50 Micro Margin Applied' : '30% Standard Markup Applied'}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
                  <div>
                    <div className="text-[11px] text-slate-400">Customer Final Selling Price:</div>
                    <div className="text-2xl font-extrabold font-mono text-white">
                      ₦{calcResult.finalSellingPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-slate-400">In USDT (@ ₦{usdtRate}):</div>
                    <div className="text-lg font-bold font-mono text-cyan-400">
                      {calcResult.priceInUSDT.toFixed(2)} USDT
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                  <span>Effective Margin:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {calcResult.effectiveMargin.toFixed(1)}% Gross Margin
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Global Pricing Rules Form (5 cols) */}
        <div className="lg:col-span-5 bg-[#0b0f19] border border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <TrendingUp className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold font-display text-white">Global Pricing Parameters</h2>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-300 leading-relaxed">
            <span className="font-bold text-white">Live pricing rule:</span> totals under ₦50 carry{' '}
            <span className="font-mono font-bold text-white">+₦50</span> (₦3 → ₦53); totals ₦50+ carry{' '}
            <span className="font-mono font-bold text-white">+30%</span>. Customers only ever see the
            final total. USDT totals convert at the rate below.
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                USDT to NGN Exchange Rate
              </label>
              <input
                type="number"
                min={100}
                step={50}
                required
                value={usdtRate}
                onChange={e => setUsdtRate(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">1 USDT = ₦{(usdtRate ?? 0).toLocaleString()}</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Payment Gateway Deposit Fee (%)
              </label>
              <input
                type="number"
                min={0}
                max={15}
                step={0.5}
                required
                value={depositFeePercent}
                onChange={e => setDepositFeePercent(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">3% standard Paystack fee.</p>
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/25 transition cursor-pointer flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{savingSettings ? 'Saving...' : 'Apply Global Pricing'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
