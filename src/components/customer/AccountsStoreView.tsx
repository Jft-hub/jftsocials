import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  ShieldCheck,
  CheckCircle,
  Copy,
  Check,
  Eye,
  EyeOff,
  AlertTriangle,
  Wallet,
  ArrowRight,
  Sparkles,
  Zap,
  Globe,
  Lock,
  RefreshCw
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';

interface AccountCategoryItem {
  id: string;
  name: string;
  description?: string;
  price_ngn: number;
  in_stock: number;
}

interface PurchasedAccountData {
  category_name: string;
  email: string;
  password: string;
}

export const AccountsStoreView: React.FC = () => {
  const { user, token, wallets, refreshUserData, setActiveView, showToast } = useApp();
  const [categories, setCategories] = useState<AccountCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasingCategory, setPurchasingCategory] = useState<AccountCategoryItem | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [purchasedResult, setPurchasedResult] = useState<PurchasedAccountData | null>(null);
  const [purchasedOrderId, setPurchasedOrderId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  const ngnWallet = wallets.find(w => w.currency === 'NGN');
  const ngnBalance = ngnWallet ? ngnWallet.balance : 0;

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/accounts/categories');
      const data = await res.json();
      if (data.success) {
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error('Failed to fetch account categories:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleBuyClick = (cat: AccountCategoryItem) => {
    if (cat.in_stock <= 0) return;
    setPurchasingCategory(cat);
  };

  const confirmPurchase = async () => {
    if (!purchasingCategory) return;
    if (ngnBalance < purchasingCategory.price_ngn) {
      showToast('Insufficient NGN balance. Please top up your wallet.', 'error');
      return;
    }

    try {
      setIsProcessing(true);
      const res = await fetch('/api/accounts/buy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ category_id: purchasingCategory.id })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Purchase failed');
      }

      setPurchasedResult(data.account);
      setPurchasedOrderId(data.order_id);
      setPurchasingCategory(null);
      showToast(`Successfully purchased ${data.account.category_name}!`, 'success');
      // Refresh wallet & categories live stock
      await refreshUserData();
      await fetchCategories();
    } catch (err: any) {
      showToast(err.message || 'Purchase failed', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = (text: string, type: 'email' | 'password' | 'all') => {
    navigator.clipboard.writeText(text);
    if (type === 'email') {
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    } else if (type === 'password') {
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    } else {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/20 p-6 sm:p-8">
        <div className="absolute -right-10 -top-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              Verified Pre-Made Accounts
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Account Store
            </h1>
            <p className="text-slate-400 text-sm mt-1.5 max-w-2xl">
              Instant delivery of verified, aged accounts with email login. Credentials are released immediately after your secure wallet payment.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="px-4 py-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center gap-3">
              <Wallet className="w-5 h-5 text-indigo-400" />
              <div>
                <div className="text-xs text-slate-400">Your NGN Balance</div>
                <div className="text-base font-bold text-white">
                  ₦{(ngnBalance ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
            <button
              onClick={() => setActiveView('wallet')}
              className="px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all shadow-lg shadow-indigo-600/20"
            >
              Top Up
            </button>
            <button
              onClick={() => setActiveView('my-accounts')}
              className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-all border border-slate-700"
            >
              My Accounts
            </button>
          </div>
        </div>
      </div>

      {/* Account Categories Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-sm text-slate-400">Loading available inventory...</p>
        </div>
      ) : categories.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center">
          <ShoppingBag className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white">No Accounts Currently Listed</h3>
          <p className="text-sm text-slate-400 mt-1">Please check back shortly as new stock is added regularly.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map(cat => {
            const isOutOfStock = cat.in_stock <= 0;
            const isLowStock = cat.in_stock > 0 && cat.in_stock <= 3;
            const hasSufficientBalance = ngnBalance >= cat.price_ngn;

            return (
              <div
                key={cat.id}
                className="bg-slate-900/80 border border-slate-800 hover:border-indigo-500/40 rounded-2xl p-6 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-indigo-500/5 group"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                      <Globe className="w-6 h-6" />
                    </div>
                    {isOutOfStock ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        Out of Stock
                      </span>
                    ) : isLowStock ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/30 animate-pulse">
                        Only {cat.in_stock} left!
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        In Stock ({cat.in_stock} available)
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-white group-hover:text-indigo-300 transition-colors">
                    {cat.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed min-h-[40px]">
                    {cat.description || 'Pre-verified, aged account ready for immediate marketing and personal use.'}
                  </p>

                  <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Direct UK / Tier-1 algorithm targeting</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Full email & password credentials</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <Zap className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>Instant delivery on wallet payment</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[10px] uppercase font-semibold text-slate-500">Fixed Price</div>
                    <div className="text-xl font-extrabold text-white">
                      ₦{(cat.price_ngn ?? 0).toLocaleString('en-NG')}
                    </div>
                  </div>

                  <button
                    onClick={() => handleBuyClick(cat)}
                    disabled={isOutOfStock}
                    className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                      isOutOfStock
                        ? 'bg-slate-800/50 text-slate-500 border border-slate-800 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 hover:scale-[1.02]'
                    }`}
                  >
                    <span>{isOutOfStock ? 'Sold Out' : 'Buy Now'}</span>
                    {!isOutOfStock && <ArrowRight className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal */}
      {purchasingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-indigo-400" />
                Confirm Account Purchase
              </h3>
              <button
                onClick={() => !isProcessing && setPurchasingCategory(null)}
                className="text-slate-400 hover:text-white text-xs font-semibold"
              >
                Cancel
              </button>
            </div>

            <div className="p-4 bg-slate-950/80 border border-slate-800/80 rounded-xl space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Account:</span>
                <span className="font-semibold text-white">{purchasingCategory.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Amount to Debit:</span>
                <span className="font-bold text-indigo-300">
                  ₦{(purchasingCategory.price_ngn ?? 0).toLocaleString('en-NG')}
                </span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-slate-800/60">
                <span className="text-slate-400">Your Current Balance:</span>
                <span className={`font-semibold ${ngnBalance < (purchasingCategory.price_ngn ?? 0) ? 'text-rose-400' : 'text-emerald-400'}`}>
                  ₦{(ngnBalance ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                </span>
              </div>
              {ngnBalance >= (purchasingCategory.price_ngn ?? 0) && (
                <div className="flex justify-between text-xs text-slate-400 pt-1">
                  <span>Balance after purchase:</span>
                  <span className="font-medium text-slate-300">
                    ₦{Math.max(0, (ngnBalance ?? 0) - (purchasingCategory.price_ngn ?? 0)).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>

            {ngnBalance < purchasingCategory.price_ngn ? (
              <div className="space-y-3">
                <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>You do not have enough NGN balance to complete this purchase.</span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setPurchasingCategory(null);
                      setActiveView('wallet');
                    }}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all"
                  >
                    Deposit Funds Now
                  </button>
                  <button
                    onClick={() => setPurchasingCategory(null)}
                    className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-indigo-950/30 border border-indigo-500/20 rounded-xl text-slate-300 text-xs flex items-center gap-2">
                  <Lock className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>Wallet is debited first. Login credentials will be revealed immediately.</span>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={confirmPurchase}
                    disabled={isProcessing}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Processing Purchase...</span>
                      </>
                    ) : (
                      <>
                        <span>Pay ₦{(purchasingCategory.price_ngn ?? 0).toLocaleString('en-NG')}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setPurchasingCategory(null)}
                    disabled={isProcessing}
                    className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Success / Credentials Reveal Modal */}
      {purchasedResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl shadow-emerald-500/10">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-extrabold text-white">Purchase Successful!</h3>
              <p className="text-xs text-slate-400">
                Your <span className="text-emerald-300 font-semibold">{purchasedResult.category_name}</span> has been provisioned.
              </p>
            </div>

            {/* Prominent Reminder */}
            <div className="p-3.5 bg-amber-950/40 border border-amber-500/40 rounded-xl text-amber-300 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>Save these credentials now</strong> — you can also access them anytime under <strong>"My Accounts"</strong>.
              </span>
            </div>

            {/* Credentials Card */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-3">
              {/* Email */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-slate-900/80 rounded-lg border border-slate-800">
                <div className="space-y-0.5 overflow-hidden">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Email / Username</div>
                  <div className="text-xs font-mono text-white select-all break-all">{purchasedResult.email}</div>
                </div>
                <button
                  onClick={() => copyToClipboard(purchasedResult.email, 'email')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg flex items-center gap-1.5 self-end sm:self-auto shrink-0 transition-colors"
                >
                  {copiedEmail ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedEmail ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              {/* Password */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-slate-900/80 rounded-lg border border-slate-800">
                <div className="space-y-0.5 overflow-hidden">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Password</div>
                  <div className="text-xs font-mono text-indigo-300 select-all break-all">
                    {showPassword ? purchasedResult.password : '••••••••••••••••'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                  <button
                    onClick={() => setShowPassword(prev => !prev)}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => copyToClipboard(purchasedResult.password, 'password')}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    {copiedPassword ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedPassword ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <button
                onClick={() => copyToClipboard(`${purchasedResult.email}:${purchasedResult.password}`, 'all')}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 border border-slate-700 transition-colors"
              >
                {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedAll ? 'Credentials Copied (Email:Password)' : 'Copy All (Email:Password)'}</span>
              </button>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setPurchasedResult(null);
                    setActiveView('my-accounts');
                  }}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all"
                >
                  View in My Accounts
                </button>
                <button
                  onClick={() => setPurchasedResult(null)}
                  className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
