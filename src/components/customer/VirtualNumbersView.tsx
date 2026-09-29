import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  PhoneCall,
  MessageSquare,
  Copy,
  Check,
  Clock,
  RefreshCw,
  XCircle,
  CheckCircle2,
  AlertCircle,
  Globe,
  ShieldCheck,
  Search,
  Wallet,
  ExternalLink,
  ChevronRight,
  Filter
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';
import { NumberOrder, Currency } from '../../types/index.js';

interface CountryItem {
  iso: string;
  name: string;
  prefix: string;
}

interface ProductItem {
  name: string;
  category: string;
  count: number;
  price_native: number;
  price_ngn: number;
  price_usdt: number;
}

export const VirtualNumbersView: React.FC = () => {
  const { token, currency, wallets, showToast, refreshUserData } = useApp();

  const [activeTab, setActiveTab] = useState<'buy' | 'orders'>('buy');
  const [countries, setCountries] = useState<Record<string, any>>({});
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [rateUsed, setRateUsed] = useState<number>(0);

  // Always-available country list so the picker never vanishes, even if the
  // live country feed hiccups. Live results override these when they arrive.
  const FALLBACK_COUNTRIES: Record<string, any> = {
    nigeria: { text_en: 'Nigeria', prefix: '+234' },
    ghana: { text_en: 'Ghana', prefix: '+233' },
    kenya: { text_en: 'Kenya', prefix: '+254' },
    southafrica: { text_en: 'South Africa', prefix: '+27' },
    usa: { text_en: 'United States', prefix: '+1' },
    unitedkingdom: { text_en: 'United Kingdom', prefix: '+44' },
    canada: { text_en: 'Canada', prefix: '+1' },
    germany: { text_en: 'Germany', prefix: '+49' },
  };
  const countryEntries = Object.entries({ ...FALLBACK_COUNTRIES, ...countries });
  const [orders, setOrders] = useState<NumberOrder[]>([]);

  // Selection states. Default is Nigeria (real inventory on first paint):
  // the 5sim guest catalog needs a real country - "any" returns nothing live.
  const [selectedCountry, setSelectedCountry] = useState<string>('nigeria');
  const [selectedOperator, setSelectedOperator] = useState<string>('any');
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Loading and purchasing states
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [activeOrder, setActiveOrder] = useState<NumberOrder | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [checkingOrderId, setCheckingOrderId] = useState<string | null>(null);

  // Countdown timer for active order
  const [timeLeftSec, setTimeLeftSec] = useState<number>(0);

  const activeWallet = wallets.find(w => w.currency === currency) || wallets[0];
  const userBalance = activeWallet?.available_balance ?? 0;

  // Fetch countries on mount
  useEffect(() => {
    fetch('/api/numbers/countries')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.countries) {
          setCountries(data.countries);
        }
      })
      .catch(console.error);
  }, []);

  // Fetch products when country or operator changes, plus a light 60s
  // refresh while on the buy tab so "available" counts stay truthful.
  useEffect(() => {
    let cancelled = false;
    const loadProducts = () => {
      setLoadingProducts(true);
      fetch(`/api/numbers/products?country=${selectedCountry}&operator=${selectedOperator}`)
        .then(r => r.json())
        .then(data => {
          if (cancelled) return;
          if (data.success && data.products) {
            setProducts(data.products);
            if (typeof data.rate_used_ngn === 'number') setRateUsed(data.rate_used_ngn);
            // If previous selection is no longer valid, pick the first available
            if (data.products.length > 0) {
              const exists = data.products.find((p: ProductItem) => p.name === selectedProduct);
              if (!exists) {
                setSelectedProduct(data.products[0].name);
              }
            }
          }
        })
        .catch(console.error)
        .finally(() => {
          if (!cancelled) setLoadingProducts(false);
        });
    };
    loadProducts();
    const timer = setInterval(() => {
      if (activeTab === 'buy') loadProducts();
    }, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCountry, selectedOperator, activeTab]);

  // Fetch past orders
  const fetchOrders = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/numbers/orders', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.orders) {
        setOrders(data.orders);
        // Find most recent pending order to set as activeOrder if none selected
        if (!activeOrder) {
          const pending = data.orders.find((o: NumberOrder) => o.status === 'PENDING' || (o.status === 'RECEIVED' && !o.sms_code));
          if (pending) {
            setActiveOrder(pending);
          }
        } else {
          // Update activeOrder reference
          const updatedActive = data.orders.find((o: NumberOrder) => o.id === activeOrder.id);
          if (updatedActive) {
            setActiveOrder(updatedActive);
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [token]);

  // Auto-poll active order when pending
  useEffect(() => {
    if (!token || !activeOrder) return;
    if (activeOrder.status !== 'PENDING' && activeOrder.status !== 'RECEIVED') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/numbers/orders/${activeOrder.id}/check`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && data.order) {
          setActiveOrder(data.order);
          // If an SMS code just arrived
          if (data.order.sms_code && !activeOrder.sms_code) {
            showToast(`SMS code received: ${data.order.sms_code}`, 'success');
            refreshUserData();
          }
          fetchOrders();
        }
      } catch (e) {
        console.error('Error polling order:', e);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [token, activeOrder?.id, activeOrder?.status, activeOrder?.sms_code]);

  // Expiry countdown effect
  useEffect(() => {
    if (!activeOrder || !activeOrder.expires_at) {
      setTimeLeftSec(0);
      return;
    }

    const calcTime = () => {
      const diff = Math.max(0, Math.floor((new Date(activeOrder.expires_at!).getTime() - Date.now()) / 1000));
      setTimeLeftSec(diff);
    };

    calcTime();
    const timer = setInterval(calcTime, 1000);
    return () => clearInterval(timer);
  }, [activeOrder?.expires_at]);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    showToast(`Copied ${field} to clipboard!`, 'info');
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleBuyNumber = async () => {
    if (!token) return;
    if (!selectedProduct) {
      showToast('Please select a service/product.', 'error');
      return;
    }

    const currentProduct = products.find(p => p.name === selectedProduct);
    if (!currentProduct) return;

    if ((currentProduct.count ?? 0) <= 0) {
      showToast('This product just ran out of stock. Pick another service.', 'error');
      return;
    }

    const price = currency === 'USDT' ? currentProduct.price_usdt : currentProduct.price_ngn;
    if (userBalance < price) {
      showToast(`Insufficient ${currency} balance. Please fund your wallet.`, 'error');
      return;
    }

    setPurchasing(true);
    try {
      const res = await fetch('/api/numbers/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          country: selectedCountry,
          operator: selectedOperator,
          product: selectedProduct,
          currency
        })
      });
      const data = await res.json();
      if (data.success && data.order) {
        showToast('Virtual number assigned successfully!', 'success');
        setActiveOrder(data.order);
        setActiveTab('buy');
        fetchOrders();
        refreshUserData();
      } else {
        showToast(data.error || 'Failed to order virtual number.', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Network error.', 'error');
    } finally {
      setPurchasing(false);
    }
  };

  const handleCheckOrder = async (orderId: string) => {
    if (!token) return;
    setCheckingOrderId(orderId);
    try {
      const res = await fetch(`/api/numbers/orders/${orderId}/check`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.order) {
        if (activeOrder && activeOrder.id === orderId) {
          setActiveOrder(data.order);
        }
        fetchOrders();
        if (data.order.sms_code) {
          showToast(`SMS Code: ${data.order.sms_code}`, 'success');
        } else {
          showToast('Waiting for SMS code from provider...', 'info');
        }
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setCheckingOrderId(null);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    if (!token) return;
    if (!confirm('Cancel this number order? If no SMS has arrived, your wallet will be refunded immediately.')) {
      return;
    }

    try {
      const res = await fetch(`/api/numbers/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Order cancelled and refunded.', 'success');
        if (activeOrder && activeOrder.id === orderId) {
          setActiveOrder(data.order);
        }
        fetchOrders();
        refreshUserData();
      } else {
        showToast(data.error || 'Failed to cancel order.', 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleFinishOrder = async (orderId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/numbers/orders/${orderId}/finish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showToast('Number activation completed!', 'success');
        if (activeOrder && activeOrder.id === orderId) {
          setActiveOrder(data.order);
        }
        fetchOrders();
      } else {
        showToast(data.error || 'Failed to finish order.', 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedProductObj = products.find(p => p.name === selectedProduct);
  const currentPrice = selectedProductObj
    ? currency === 'USDT'
      ? selectedProductObj.price_usdt
      : selectedProductObj.price_ngn
    : 0;

  const formatSeconds = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const popularCountries = [
    { code: 'any', label: 'Any Country (Fastest)' },
    { code: 'usa', label: 'United States' },
    { code: 'unitedkingdom', label: 'United Kingdom' },
    { code: 'nigeria', label: 'Nigeria' },
    { code: 'canada', label: 'Canada' },
    { code: 'netherlands', label: 'Netherlands' },
    { code: 'germany', label: 'Germany' }
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs uppercase tracking-wider">
            <PhoneCall className="w-4 h-4" />
            <span>5 Automated OTP Engine</span>
          </div>
          <h1 className="text-2xl font-bold font-display text-white mt-1">Virtual Numbers for SMS Verification</h1>
          <p className="text-xs text-slate-400 mt-1">
            Receive temporary SMS verification codes for WhatsApp, Telegram, Google, TikTok, Instagram & 100+ services.
          </p>
        </div>

        {/* Tab Switcher & Wallet quick badge */}
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs flex items-center gap-2">
            <Wallet className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-slate-400">Balance:</span>
            <span className="font-mono font-bold text-white">
              {currency === 'NGN' ? `₦${(userBalance ?? 0).toLocaleString()}` : `$${(userBalance ?? 0).toFixed(2)} USDT`}
            </span>
          </div>

          <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('buy')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'buy'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Order Number
            </button>
            <button
              onClick={() => {
                setActiveTab('orders');
                fetchOrders();
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'orders'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>My Numbers</span>
              {orders.filter(o => o.status === 'PENDING').length > 0 && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ACTIVE RUNNING NUMBER BANNER (if any) */}
      {activeOrder && (activeOrder.status === 'PENDING' || activeOrder.status === 'RECEIVED') && (
        <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-950/60 to-slate-900 border-2 border-indigo-500/50 shadow-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-indigo-500/20">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <div>
                <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                  Active Virtual Number • {activeOrder.product.toUpperCase()}
                </span>
                <div className="text-[11px] text-slate-400">
                  Country: <span className="capitalize text-slate-300 font-semibold">{activeOrder.country}</span> • Operator: <span className="capitalize text-slate-300">{activeOrder.operator}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-900/40 text-indigo-300 border border-indigo-700/40 text-xs font-mono">
                <Clock className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                <span>Expires in: {formatSeconds(timeLeftSec)}</span>
              </div>

              <button
                onClick={() => handleCheckOrder(activeOrder.id)}
                disabled={checkingOrderId === activeOrder.id}
                className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingOrderId === activeOrder.id ? 'animate-spin' : ''}`} />
                <span>Check SMS</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Phone Number Display */}
            <div className="p-4 rounded-xl bg-[#07090e] border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Phone Number</span>
              <div className="flex items-center justify-between">
                <span className="text-xl sm:text-2xl font-mono font-bold text-white tracking-wide">
                  {activeOrder.phone}
                </span>
                <button
                  onClick={() => handleCopy(activeOrder.phone, 'Phone Number')}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
                  title="Copy Phone Number"
                >
                  {copiedField === 'Phone Number' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Enter this number in {activeOrder.product} to request verification SMS.
              </p>
            </div>

            {/* OTP Code Display */}
            <div className="p-4 rounded-xl bg-[#07090e] border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Incoming SMS / OTP</span>
              <div className="flex items-center justify-between">
                {activeOrder.sms_code ? (
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-mono font-bold text-emerald-400 tracking-widest bg-emerald-950/60 px-3 py-0.5 rounded-lg border border-emerald-500/40">
                      {activeOrder.sms_code}
                    </span>
                    <button
                      onClick={() => handleCopy(activeOrder.sms_code!, 'SMS Code')}
                      className="p-2 rounded-lg bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 transition cursor-pointer"
                      title="Copy OTP Code"
                    >
                      {copiedField === 'SMS Code' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold py-1">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Waiting for SMS... (auto-checking)</span>
                  </div>
                )}
              </div>
              {activeOrder.sms_text && (
                <div className="text-[11px] text-slate-400 font-mono mt-1 bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                  {activeOrder.sms_text}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            {!activeOrder.sms_code && (
              <button
                onClick={() => handleCancelOrder(activeOrder.id)}
                className="px-4 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Cancel & Refund</span>
              </button>
            )}

            {activeOrder.sms_code && (
              <button
                onClick={() => handleFinishOrder(activeOrder.id)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-lg shadow-emerald-600/20"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Finish Activation</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: ORDER NUMBER */}
      {activeTab === 'buy' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Selection Area (2 Columns) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 1: Country Selection */}
            <div className="p-5 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold font-display text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-indigo-400" />
                  <span>1. Select Country</span>
                </label>
                <span className="text-[11px] text-slate-400">
                  Selected: <span className="text-white font-semibold capitalize">{selectedCountry}</span>
                </span>
              </div>

              {/* Quick Country Pills */}
              <div className="flex flex-wrap gap-2">
                {popularCountries.map(c => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setSelectedCountry(c.code)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
                      selectedCountry === c.code
                        ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              {/* Full Country Dropdown (always visible - fallback list built in) */}
              <div className="pt-2">
                <select
                  value={selectedCountry}
                  onChange={e => setSelectedCountry(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  {countryEntries.map(([iso, c]: [string, any]) => (
                    <option key={iso} value={iso}>
                      {c.text_en || iso} ({c.prefix ? (String(c.prefix).startsWith('+') ? c.prefix : `+${c.prefix}`) : iso})
                    </option>
                  ))}
                </select>
                {rateUsed > 0 && (
                  <p className="text-[10px] text-slate-500 mt-1">
                    Prices: native units × ₦{rateUsed} + 50% (rate set in Admin → Settings → 5)
                  </p>
                )}
              </div>
            </div>

            {/* Step 2: Service / Product Selection */}
            <div className="p-5 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <label className="text-xs font-bold font-display text-white flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                  <span>2. Select App / Service</span>
                </label>

                {/* Search Input */}
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search WhatsApp, Telegram..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {loadingProducts ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
                  <span>Loading live numbers inventory...</span>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No services found matching your query in {selectedCountry}. Try selecting "Any Country".
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[420px] overflow-y-auto pr-1">
                  {filteredProducts.map(p => {
                    const isSelected = selectedProduct === p.name;
                    const price = currency === 'USDT' ? `$${(p.price_usdt ?? 0).toFixed(2)}` : `₦${(p.price_ngn ?? 0).toLocaleString()}`;

                    return (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => setSelectedProduct(p.name)}
                        className={`p-3 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-950/40 border-indigo-500 text-white shadow-md'
                            : 'bg-slate-900/60 hover:bg-slate-800/60 border-slate-800/80 text-slate-300'
                        }`}
                      >
                        <div className="truncate">
                          <div className="font-semibold text-xs text-white capitalize truncate">{p.name}</div>
                          <div className="text-[10px] text-slate-400">
                            {(p.count ?? 0).toLocaleString()} available • {p.price_native} units
                          </div>
                        </div>

                        <div className="text-right whitespace-nowrap">
                          <div className="font-mono font-bold text-xs text-emerald-400">{price}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Checkout / Summary Sidebar (1 Column) */}
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-5">
              <h2 className="text-sm font-bold font-display text-white">Order Summary</h2>

              <div className="space-y-3 text-xs divide-y divide-slate-800/60">
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Target Service:</span>
                  <span className="font-bold text-white capitalize">{selectedProduct || 'None'}</span>
                </div>

                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Country:</span>
                  <span className="font-semibold text-slate-200 capitalize">{selectedCountry}</span>
                </div>

                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Available Numbers:</span>
                  <span className="font-mono text-slate-300">
                    {selectedProductObj ? (selectedProductObj.count ?? 0).toLocaleString() : '0'}
                  </span>
                </div>

                <div className="flex justify-between py-2 items-center">
                  <span className="text-sm font-bold text-white">Total Charge:</span>
                  <span className="text-lg font-mono font-bold text-emerald-400">
                    {currency === 'USDT' ? `$${(currentPrice ?? 0).toFixed(2)} USDT` : `₦${(currentPrice ?? 0).toLocaleString()}`}
                  </span>
                </div>
              </div>

              {/* Guarantees & Features */}
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 text-[11px] text-slate-400">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-slate-200">Instant Automated Refund:</strong> If no SMS verification code is received within the expiration window, the charge is automatically credited back to your wallet.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <span>Numbers remain active for 15–20 minutes to receive your SMS code.</span>
                </div>
              </div>

              {/* Purchase CTA */}
              <button
                type="button"
                onClick={handleBuyNumber}
                disabled={purchasing || !selectedProductObj || selectedProductObj.count === 0}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/25 transition cursor-pointer flex items-center justify-center gap-2"
              >
                {purchasing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Acquiring Number...</span>
                  </>
                ) : (
                  <>
                    <Phone className="w-4 h-4" />
                    <span>Acquire Number ({currency === 'USDT' ? `$${(currentPrice ?? 0).toFixed(2)}` : `₦${(currentPrice ?? 0).toLocaleString()}`})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: MY NUMBER ORDERS */}
      {activeTab === 'orders' && (
        <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold font-display text-white">Your Virtual Number Activations</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Full history of past temporary phone numbers and SMS codes.</p>
            </div>
            <button
              onClick={fetchOrders}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 transition cursor-pointer"
              title="Refresh Orders"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {orders.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-500">
              You haven't ordered any virtual numbers yet. Click "Order Number" to get started!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">Order ID</th>
                    <th className="py-3 px-4">Service</th>
                    <th className="py-3 px-4">Phone Number</th>
                    <th className="py-3 px-4">Country</th>
                    <th className="py-3 px-4">Charge</th>
                    <th className="py-3 px-4">SMS Code</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {orders.map(o => {
                    const isPending = o.status === 'PENDING' || o.status === 'RECEIVED';

                    return (
                      <tr key={o.id} className="hover:bg-slate-900/40 transition">
                        <td className="py-3.5 px-4 font-mono font-bold text-white whitespace-nowrap">
                          {o.id}
                        </td>

                        <td className="py-3.5 px-4 font-semibold text-slate-200 capitalize">
                          {o.product}
                        </td>

                        <td className="py-3.5 px-4 font-mono font-bold text-white whitespace-nowrap">
                          {o.phone}
                        </td>

                        <td className="py-3.5 px-4 capitalize text-slate-300">
                          {o.country}
                        </td>

                        <td className="py-3.5 px-4 font-mono font-bold text-emerald-400 whitespace-nowrap">
                          {o.currency === 'USDT' ? `$${(o.customer_charge ?? 0).toFixed(2)}` : `₦${(o.customer_charge ?? 0).toLocaleString()}`}
                        </td>

                        <td className="py-3.5 px-4 font-mono">
                          {o.sms_code ? (
                            <span className="font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/40">
                              {o.sms_code}
                            </span>
                          ) : isPending ? (
                            <span className="text-amber-400 text-[11px] animate-pulse">Awaiting SMS...</span>
                          ) : (
                            <span className="text-slate-500 text-[11px]">No SMS</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              o.status === 'FINISHED' || o.sms_code
                                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                                : o.status === 'CANCELED'
                                ? 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                                : o.status === 'TIMEOUT'
                                ? 'bg-slate-800 text-slate-400'
                                : 'bg-amber-950/60 text-amber-400 border border-amber-800/40 animate-pulse'
                            }`}
                          >
                            {o.status}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {isPending && (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleCheckOrder(o.id)}
                                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold transition cursor-pointer"
                              >
                                Check SMS
                              </button>
                              {!o.sms_code && (
                                <button
                                  onClick={() => handleCancelOrder(o.id)}
                                  className="px-2 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 text-[11px] transition cursor-pointer"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
