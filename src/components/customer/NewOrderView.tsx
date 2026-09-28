import React, { useState, useEffect } from 'react';
import {
  Zap,
  Info,
  AlertCircle,
  CheckCircle2,
  Wallet,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  XCircle,
  X,
  CreditCard
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';
import { Currency } from '../../types/index.js';

export const NewOrderView: React.FC = () => {
  const { token, currency, wallets, showToast, setActiveView, refreshOrders, refreshUserData, orderServicePreset, setOrderServicePreset } = useApp();

  const [categories, setCategories] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('instagram');
  const [selectedCategoryType, setSelectedCategoryType] = useState<string>('all');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [targetLink, setTargetLink] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(10);
  const [runs, setRuns] = useState<number>(1);
  const [interval, setInterval] = useState<number>(0);

  const [priceQuote, setPriceQuote] = useState<any>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [orderSuccessData, setOrderSuccessData] = useState<any>(null);

  // Fetch Categories & Services
  useEffect(() => {
    let isMounted = true;
    setLoadingData(true);

    Promise.all([
      fetch('/api/categories').then(r => r.json()).catch(() => ({ success: false })),
      fetch(`/api/services?currency=${currency}`).then(r => r.json()).catch(() => ({ success: false }))
    ])
      .then(([catData, srvData]) => {
        if (!isMounted) return;
        if (catData?.success) {
          setCategories(catData.categories || []);
        }
        if (srvData?.success) {
          setServices(srvData.services || []);
        }
      })
      .catch(console.error)
      .finally(() => {
        if (isMounted) setLoadingData(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currency]);

  // Identify current platform category ID
  const platformCategory = categories.find(c => c.platform === selectedPlatform);
  const platformCategoryId = platformCategory?.id || (
    selectedPlatform === 'instagram' ? 'cat_ig' :
    selectedPlatform === 'tiktok' ? 'cat_tk' :
    selectedPlatform === 'youtube' ? 'cat_yt' :
    selectedPlatform === 'telegram' ? 'cat_tg' :
    selectedPlatform === 'twitter' ? 'cat_tw' :
    selectedPlatform === 'facebook' ? 'cat_fb' :
    selectedPlatform === 'spotify' ? 'cat_sp' : 'cat_ig'
  );

  const platforms = [
    { id: 'instagram', name: 'Instagram' },
    { id: 'tiktok', name: 'TikTok' },
    { id: 'youtube', name: 'YouTube' },
    { id: 'telegram', name: 'Telegram' },
    { id: 'twitter', name: 'Twitter (X)' },
    { id: 'facebook', name: 'Facebook' },
    { id: 'spotify', name: 'Spotify' }
  ];

  const currentPlatformName = platforms.find(p => p.id === selectedPlatform)?.name || 'Platform';

  // All services under the active platform
  const platformServices = services.filter(s => s.category_id === platformCategoryId);

  // Dynamic Service Category filters (Followers, Likes, Comments, Saves, Shares, Views, etc.)
  const categoryTypeDefinitions = [
    { id: 'all', label: 'All Services', test: () => true },
    { id: 'followers', label: 'Followers', test: (name: string) => /follower|subscriber|member/i.test(name) },
    { id: 'likes', label: 'Likes', test: (name: string) => /like|reaction/i.test(name) },
    { id: 'comments', label: 'Comments', test: (name: string) => /comment/i.test(name) },
    { id: 'saves', label: 'Saves', test: (name: string) => /save|favorite|bookmark/i.test(name) },
    { id: 'shares', label: 'Shares', test: (name: string) => /share|retweet|repost/i.test(name) },
    { id: 'views', label: 'Views', test: (name: string) => /view|play|stream|story|impression|reach|watch/i.test(name) }
  ];

  const categoryOptions = categoryTypeDefinitions
    .map(ct => {
      const count = ct.id === 'all'
        ? platformServices.length
        : platformServices.filter(s => ct.test(s.name)).length;
      return {
        id: ct.id,
        name: ct.id === 'all' ? `${currentPlatformName} (All Services)` : `${currentPlatformName} ${ct.label}`,
        count
      };
    })
    .filter(ct => ct.id === 'all' || ct.count > 0);

  // Reset category filter type to 'all' whenever platform changes
  useEffect(() => {
    setSelectedCategoryType('all');
  }, [selectedPlatform]);

  // Filter services by platform AND selected category type, RANKED FROM CHEAPEST TO HIGHEST
  const filteredServices = platformServices
    .filter(s => {
      if (selectedCategoryType === 'all') return true;
      const typeDef = categoryTypeDefinitions.find(t => t.id === selectedCategoryType);
      return typeDef ? typeDef.test(s.name) : true;
    })
    .sort((a, b) => (a.price_per_1000 ?? 0) - (b.price_per_1000 ?? 0));

  // Set default service whenever filtered services or category type changes
  useEffect(() => {
    if (filteredServices.length > 0) {
      const stillValid = filteredServices.some(s => s.id === selectedServiceId);
      if (!stillValid) {
        setSelectedServiceId(filteredServices[0].id);
        const minVal = filteredServices[0].min_quantity === 50 ? 10 : (filteredServices[0].min_quantity || 10);
        setQuantity(minVal);
      }
    } else {
      setSelectedServiceId('');
    }
  }, [selectedCategoryType, selectedPlatform, services]);

  // Honor the catalog's "Order Now" choice: jump to the exact service that was
  // clicked (including its platform tab), then clear the preset. Runs after
  // the catalog loads so the service is present before we select it.
  useEffect(() => {
    if (!orderServicePreset || services.length === 0) return;
    const target = services.find(s => s.id === orderServicePreset.serviceId);
    setOrderServicePreset(null);
    if (!target) return;
    const targetCategory = categories.find(c => c.id === target.category_id);
    if (targetCategory && targetCategory.platform && targetCategory.platform !== selectedPlatform) {
      setSelectedPlatform(targetCategory.platform);
    }
    setSelectedServiceId(target.id);
    const minVal = target.min_quantity === 50 ? 10 : (target.min_quantity || 10);
    setQuantity(minVal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderServicePreset, services]);

  const activeService = services.find(s => s.id === selectedServiceId);
  const effectiveMinQuantity = activeService ? (activeService.min_quantity === 50 ? 10 : (activeService.min_quantity || 10)) : 10;

  // Calculate live quote
  useEffect(() => {
    if (!selectedServiceId || !quantity || quantity <= 0) {
      setPriceQuote(null);
      return;
    }

    let isCancelled = false;
    setLoadingQuote(true);
    setErrorMsg('');

    fetch(
      `/api/services/calculate-price?service_id=${encodeURIComponent(selectedServiceId)}&quantity=${encodeURIComponent(quantity)}&currency=${encodeURIComponent(currency)}`
    )
      .then(async r => {
        const text = await r.text();
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error('Server returned an unexpected response format while calculating price.');
        }
        if (!r.ok || !data) {
          throw new Error(data?.error || `Failed to calculate price (${r.status}).`);
        }
        return data;
      })
      .then(data => {
        if (isCancelled) return;
        if (data.success) {
          const quote = data.quote || {
            service_id: selectedServiceId,
            quantity: Number(quantity),
            currency: data.currency || currency,
            customer_charge: data.customer_charge ?? data.customer_price ?? data.total_charge,
            customer_price: data.customer_price,
            total_charge: data.total_charge,
            payment_fee: data.payment_fee
          };
          setPriceQuote(quote);
        } else {
          setErrorMsg(data.error || 'Failed to calculate price.');
        }
      })
      .catch(err => {
        if (isCancelled) return;
        console.error('Price calculation error:', err);
        setErrorMsg(err.message || 'Error calculating price.');
      })
      .finally(() => {
        if (!isCancelled) {
          setLoadingQuote(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedServiceId, quantity, currency]);

  // Check customer balance
  const activeWallet = wallets.find(w => w.currency === currency);
  const currentBalance = activeWallet?.available_balance || 0;
  const isBalanceSufficient = priceQuote ? currentBalance >= priceQuote.customer_charge : false;

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (!selectedServiceId) {
      setErrorMsg('Please select a service option.');
      return;
    }

    const cleanLink = targetLink.trim();
    if (!cleanLink) {
      setErrorMsg('Target profile link or handle is required.');
      return;
    }

    const numQty = Number(quantity);
    if (isNaN(numQty) || numQty <= 0) {
      setErrorMsg(`Please enter a valid positive quantity (minimum ${effectiveMinQuantity}).`);
      return;
    }

    if (activeService) {
      if (numQty < effectiveMinQuantity || numQty > activeService.max_quantity) {
        setErrorMsg(`Quantity must be between ${effectiveMinQuantity} and ${activeService.max_quantity.toLocaleString()}.`);
        return;
      }
    }

    if (!isBalanceSufficient) {
      setErrorMsg(`Insufficient ${currency} balance. Please fund your wallet first.`);
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          service_id: selectedServiceId,
          target_link: cleanLink,
          link: cleanLink,
          quantity: numQty,
          currency,
          runs: Number(runs) || 1,
          interval: Number(interval) || 0
        })
      });

      const data = await res.json();
      if (!data.success) {
        setErrorMsg(data.error || 'Failed to submit order.');
        setSubmitting(false);
        return;
      }

      setOrderSuccessData(data.order);
      showToast(`Order #${data.order.id} placed successfully!`, 'success');
      try {
        await refreshOrders();
        await refreshUserData();
      } catch (err) {
        console.warn('Silent refresh error after order:', err);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error submitting order.');
    } finally {
      setSubmitting(false);
    }
  };

  if (orderSuccessData) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-[#0b0f19] border border-emerald-500/30 rounded-2xl p-8 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <span className="text-[11px] font-bold tracking-wider uppercase px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Order Dispatched
            </span>
            <h2 className="text-xl font-bold font-display text-white mt-2">
              Order #{orderSuccessData.id} Confirmed!
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Your order has been registered and sent to the high-speed execution queue. Delivery begins automatically.
            </p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 text-xs space-y-2.5 text-left max-w-lg mx-auto">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <span className="text-slate-400">Service:</span>
              <span className="font-semibold text-slate-200 truncate max-w-[280px]">
                {orderSuccessData.service_name}
              </span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <span className="text-slate-400">Target Profile / Link:</span>
              <span className="font-mono text-cyan-400 truncate max-w-[280px]">
                {orderSuccessData.target_link || orderSuccessData.link}
              </span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <span className="text-slate-400">Ordered Quantity:</span>
              <span className="font-mono font-bold text-white">
                {(orderSuccessData.quantity ?? quantity).toLocaleString()} units
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Total Charged:</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">
                {orderSuccessData.currency === 'NGN' ? '₦' : ''}
                {(orderSuccessData.customer_charge ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
                {orderSuccessData.currency}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
            <button
              onClick={() => {
                setOrderSuccessData(null);
                setActiveView('orders');
              }}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/30"
            >
              <span>View All Orders</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setOrderSuccessData(null);
                setTargetLink('');
              }}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-xs transition cursor-pointer"
            >
              <span>Create Another Order</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* View Header */}
      <div>
        <h1 className="text-2xl font-bold font-display text-white">Create New Order</h1>
        <p className="text-xs text-slate-400 mt-1">
          Instant execution via multi-provider routing with automated 20% transparent pricing.
        </p>
      </div>

      {loadingData ? (
        /* Skeleton Loading State for NewOrderView */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-pulse">
          <div className="lg:col-span-7 bg-[#0b0f19] border border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="space-y-2">
              <div className="h-3 w-32 bg-slate-800 rounded"></div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {[...Array(7)].map((_, i) => (
                  <div key={i} className="h-9 bg-slate-900 rounded-xl border border-slate-800/60"></div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-3 w-28 bg-slate-800 rounded"></div>
              <div className="h-10 bg-slate-900 rounded-xl border border-slate-800/60"></div>
            </div>
            <div className="space-y-2">
              <div className="h-3 w-36 bg-slate-800 rounded"></div>
              <div className="h-10 bg-slate-900 rounded-xl border border-slate-800/60"></div>
            </div>
            <div className="h-16 bg-slate-900/60 rounded-xl border border-slate-800/40"></div>
            <div className="space-y-2">
              <div className="h-3 w-36 bg-slate-800 rounded"></div>
              <div className="h-10 bg-slate-900 rounded-xl border border-slate-800/60"></div>
            </div>
            <div className="space-y-2">
              <div className="h-3 w-20 bg-slate-800 rounded"></div>
              <div className="h-10 bg-slate-900 rounded-xl border border-slate-800/60"></div>
            </div>
            <div className="h-11 bg-slate-800 rounded-xl"></div>
          </div>
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="h-4 w-36 bg-slate-800 rounded"></div>
              <div className="space-y-3 pt-3 border-t border-slate-800">
                <div className="flex justify-between"><div className="h-3 w-24 bg-slate-800 rounded"></div><div className="h-3 w-16 bg-slate-800 rounded"></div></div>
                <div className="flex justify-between"><div className="h-3 w-20 bg-slate-800 rounded"></div><div className="h-3 w-16 bg-slate-800 rounded"></div></div>
                <div className="flex justify-between"><div className="h-3 w-28 bg-slate-800 rounded"></div><div className="h-3 w-20 bg-slate-800 rounded"></div></div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Form: 7 cols */}
          <div className="lg:col-span-7 bg-[#0b0f19] border border-slate-800 rounded-2xl p-6 space-y-5">
            {errorMsg && (
              <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                    <div>
                      <span className="font-bold text-rose-300 block mb-0.5">Order Submission Notice</span>
                      <span>{errorMsg}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setErrorMsg('')}
                    className="text-rose-400 hover:text-white p-1 cursor-pointer"
                    title="Dismiss notice"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
                {errorMsg.toLowerCase().includes('balance') && (
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveView('wallet')}
                      className="px-3 py-1.5 rounded-lg bg-rose-900/80 hover:bg-rose-800 text-white font-semibold text-[11px] flex items-center gap-1 transition cursor-pointer"
                    >
                      <Wallet className="w-3 h-3" />
                      <span>Fund Wallet Now</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handlePlaceOrder} className="space-y-4">
              {/* Platform Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Target Social Platform
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {platforms.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPlatform(p.id)}
                      className={`py-2 px-2.5 rounded-xl text-xs font-medium transition cursor-pointer text-center truncate ${
                        selectedPlatform === p.id
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Service Category
                </label>
                <select
                  value={selectedCategoryType}
                  onChange={e => setSelectedCategoryType(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  {categoryOptions.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} ({cat.count.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              {/* Service Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Service Option ({filteredServices.length.toLocaleString()} available)
                </label>
                <select
                  value={selectedServiceId}
                  onChange={e => {
                    const newId = e.target.value;
                    setSelectedServiceId(newId);
                    const chosen = filteredServices.find(s => s.id === newId);
                    if (chosen) {
                      const minQ = chosen.min_quantity === 50 ? 10 : (chosen.min_quantity || 10);
                      setQuantity(prev => (prev < minQ ? minQ : prev));
                    }
                  }}
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  {filteredServices.map(srv => (
                    <option key={srv.id} value={srv.id}>
                      {srv.name} — ({currency === 'NGN' ? `₦${(srv.price_per_1000 ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : `${(srv.price_per_1000 ?? 0).toFixed(2)} USDT`}/1k)
                    </option>
                  ))}
                </select>
              </div>

              {/* Service Specs Badge Box */}
              {activeService && (
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-400">
                      Limits: <strong className="text-slate-200">{effectiveMinQuantity}</strong> min — <strong className="text-slate-200">{activeService.max_quantity?.toLocaleString() ?? ''}</strong> max
                    </span>
                    <div className="flex items-center gap-2">
                      {activeService.refill_supported && (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold">
                          30-Day Refill
                        </span>
                      )}
                      {activeService.cancel_supported && (
                        <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-semibold">
                          Cancel Support
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    {activeService.description}
                  </p>
                </div>
              )}

              {/* Target Link */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Target URL or Username
                </label>
                <input
                  type="text"
                  required
                  placeholder="https://instagram.com/username or @handle"
                  value={targetLink}
                  onChange={e => setTargetLink(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Quantity */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">Quantity</label>
                  {activeService && (
                    <span className="text-[10px] text-slate-400">
                      Min: {effectiveMinQuantity} | Max: {activeService.max_quantity?.toLocaleString() ?? ''}
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  required
                  min={effectiveMinQuantity}
                  max={activeService?.max_quantity || 100000}
                  step={1}
                  value={quantity}
                  onChange={e => setQuantity(Number(e.target.value))}
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Insufficient Balance Notice */}
              {priceQuote && !isBalanceSufficient && (
                <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/50 text-amber-300 text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Required: <strong className="text-white">{currency === 'NGN' ? '₦' : ''}{(priceQuote.customer_charge ?? 0).toLocaleString()}</strong> | Available: <strong className="text-white">{currency === 'NGN' ? '₦' : ''}{currentBalance.toLocaleString()}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveView('wallet')}
                    className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] shrink-0 transition cursor-pointer"
                  >
                    Fund Wallet
                  </button>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting || loadingQuote || !priceQuote || !isBalanceSufficient || !targetLink.trim()}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs transition shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Processing Order...</span>
                  </>
                ) : loadingQuote ? (
                  <span>Computing Live Quote...</span>
                ) : !targetLink.trim() ? (
                  <span>Enter Target Profile / Link to Continue</span>
                ) : !isBalanceSufficient ? (
                  <span>Insufficient Balance — Fund Wallet</span>
                ) : (
                  <>
                    <span>
                      Place Order Now ({currency === 'NGN' ? `₦${(priceQuote?.customer_charge ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : `${(priceQuote?.customer_charge ?? 0).toFixed(2)} USDT`})
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Right Price Breakdown: 5 cols */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-bold font-display text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-cyan-400" />
                <span>Financial Calculation</span>
              </h3>

              {loadingQuote ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  <RefreshCw className="w-4 h-4 mx-auto animate-spin mb-2 text-indigo-400" />
                  <span>Computing live price quote...</span>
                </div>
              ) : priceQuote ? (
                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                  <span className="text-slate-400">Order Quantity:</span>
                  <span className="font-mono text-white font-semibold">
                    {(priceQuote.quantity ?? 0).toLocaleString()} units
                  </span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                  <span className="text-slate-400">Selected Currency:</span>
                  <span className="font-mono text-cyan-400 font-semibold">{priceQuote.currency}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-400">Total Customer Charge</div>
                  <div className="text-2xl font-extrabold font-mono text-white">
                    {currency === 'NGN'
                      ? `₦${(priceQuote.customer_charge ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                      : `${(priceQuote.customer_charge ?? 0).toFixed(2)} USDT`}
                  </div>
                  <div className="text-[10px] text-emerald-400 font-medium">
                    ✓ Includes platform floor protection & instantaneous dispatch
                  </div>
                </div>

                {/* Wallet Balance Check */}
                <div className="pt-2">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-slate-400">Your {currency} Balance:</span>
                    <span className={`font-mono font-bold ${isBalanceSufficient ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {currency === 'NGN' ? `₦${(currentBalance ?? 0).toLocaleString()}` : `${(currentBalance ?? 0).toFixed(2)} USDT`}
                    </span>
                  </div>

                  {!isBalanceSufficient ? (
                    <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs space-y-2 mt-2">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Insufficient Balance</span>
                      </div>
                      <p className="text-[11px] text-rose-200">
                        You need an additional{' '}
                        <strong>
                          {currency === 'NGN'
                            ? `₦${Math.max(0, (priceQuote.customer_charge ?? 0) - (currentBalance ?? 0)).toLocaleString()}`
                            : `${Math.max(0, (priceQuote.customer_charge ?? 0) - (currentBalance ?? 0)).toFixed(2)} USDT`}
                        </strong>{' '}
                        to submit this order.
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveView('wallet')}
                        className="w-full py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[11px] flex items-center justify-center gap-1.5 transition"
                      >
                        <Wallet className="w-3.5 h-3.5" />
                        <span>Add Funds to Wallet</span>
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
                      <span>Remaining after order:</span>
                      <span className="font-mono text-slate-200">
                        {currency === 'NGN'
                          ? `₦${Math.max(0, (currentBalance ?? 0) - (priceQuote.customer_charge ?? 0)).toLocaleString()}`
                          : `${Math.max(0, (currentBalance ?? 0) - (priceQuote.customer_charge ?? 0)).toFixed(2)} USDT`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 text-xs">
                Select a service and quantity to view the live price calculation.
              </div>
            )}
          </div>

          {/* Guarantee Note */}
          <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 text-xs text-slate-300 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-indigo-300">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span>Fulfillment & Refill Safeguard</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Orders are transmitted via encrypted API streams directly to P. If the upstream provider experiences drops on refill-eligible packages, click Refill on your Orders dashboard.
            </p>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
