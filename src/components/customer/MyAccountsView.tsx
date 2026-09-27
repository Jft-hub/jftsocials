import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  ShieldCheck,
  Copy,
  Check,
  Eye,
  EyeOff,
  ShoppingBag,
  Calendar,
  Lock,
  ExternalLink,
  RefreshCw,
  Search,
  AlertCircle
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';

interface PurchasedAccountOrder {
  id: string;
  user_id: string;
  category_id: string;
  category_name: string;
  listing_id: string;
  price_charged: number;
  currency: string;
  created_at: string;
  email: string | null;
  password: string | null;
}

export const MyAccountsView: React.FC = () => {
  const { token, setActiveView, showToast } = useApp();
  const [orders, setOrders] = useState<PurchasedAccountOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [copiedStates, setCopiedStates] = useState<Record<string, string>>({});

  const fetchMyAccounts = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/accounts/my-purchases', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setOrders(data.orders || []);
      }
    } catch (err) {
      console.error('Failed to fetch account orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyAccounts();
  }, []);

  const togglePasswordVisibility = (orderId: string) => {
    setVisiblePasswords(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  const copyField = (key: string, text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedStates(prev => ({ ...prev, [key]: label }));
    setTimeout(() => {
      setCopiedStates(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 2000);
    showToast(`${label} copied to clipboard!`, 'info');
  };

  const filteredOrders = orders.filter(o =>
    o.category_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (o.email && o.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <KeyRound className="w-3.5 h-3.5" />
            Purchased Inventory
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            My Accounts
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            View, manage, and access login credentials for all accounts you have purchased.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveView('accounts-store')}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Account Store</span>
          </button>
          <button
            onClick={fetchMyAccounts}
            disabled={loading}
            className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Security Tip Banner */}
      <div className="p-4 bg-indigo-950/20 border border-indigo-500/30 rounded-2xl flex items-start gap-3.5 text-xs text-indigo-200">
        <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-white">Account Security Recommendation</p>
          <p className="text-slate-300 leading-relaxed">
            Upon first login, we recommend binding your own secondary recovery email/phone and changing the password to ensure permanent ownership.
          </p>
        </div>
      </div>

      {/* Filter / Search bar if user has orders */}
      {orders.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by account type, order ID, or email..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
            />
          </div>
          <span className="text-xs text-slate-500">
            Showing {filteredOrders.length} of {orders.length} accounts
          </span>
        </div>
      )}

      {/* Orders List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-sm text-slate-400">Loading your account credentials...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center max-w-lg mx-auto space-y-4">
          <div className="w-14 h-14 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
            <KeyRound className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">No Accounts Purchased Yet</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              You haven't bought any pre-made accounts yet. Browse our verified inventory starting with UK TikTok accounts at fixed prices.
            </p>
          </div>
          <button
            onClick={() => setActiveView('accounts-store')}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/20 inline-flex items-center gap-2"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Explore Account Store</span>
          </button>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-xs">
          No accounts matched your search criteria "{searchQuery}".
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map(order => {
            const isPasswordVisible = !!visiblePasswords[order.id];
            const emailCopied = copiedStates[`${order.id}_email`];
            const passwordCopied = copiedStates[`${order.id}_pass`];
            const allCopied = copiedStates[`${order.id}_all`];

            return (
              <div
                key={order.id}
                className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 sm:p-6 transition-all duration-200 shadow-lg shadow-black/20"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-white">{order.category_name}</h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Active · Verified
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 font-mono">
                        <span>Order: {order.id}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-slate-400">
                          <Calendar className="w-3 h-3" />
                          {new Date(order.created_at).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end lg:self-auto">
                    <div className="text-right">
                      <div className="text-[10px] uppercase font-bold text-slate-500">Paid</div>
                      <div className="text-sm font-extrabold text-white">
                        ₦{(order.price_charged ?? 0).toLocaleString('en-NG')}
                      </div>
                    </div>

                    {order.email && order.password && (
                      <button
                        onClick={() =>
                          copyField(
                            `${order.id}_all`,
                            `${order.email}:${order.password}`,
                            'Email & Password'
                          )
                        }
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition-colors flex items-center gap-1.5"
                      >
                        {allCopied ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{allCopied ? 'Copied All' : 'Copy All'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Credentials Section */}
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Email Box */}
                  <div className="p-3 bg-slate-950/70 border border-slate-800/90 rounded-xl flex items-center justify-between gap-3">
                    <div className="overflow-hidden space-y-0.5">
                      <div className="text-[10px] uppercase font-bold text-slate-500">Login Email / Username</div>
                      <div className="text-xs font-mono text-slate-200 select-all truncate">
                        {order.email || '—'}
                      </div>
                    </div>
                    {order.email && (
                      <button
                        onClick={() => copyField(`${order.id}_email`, order.email!, 'Email')}
                        className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors shrink-0"
                        title="Copy Email"
                      >
                        {emailCopied ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Password Box */}
                  <div className="p-3 bg-slate-950/70 border border-slate-800/90 rounded-xl flex items-center justify-between gap-3">
                    <div className="overflow-hidden space-y-0.5">
                      <div className="text-[10px] uppercase font-bold text-slate-500">Password</div>
                      <div className="text-xs font-mono text-indigo-300 select-all truncate">
                        {order.password
                          ? isPasswordVisible
                            ? order.password
                            : '••••••••••••••••'
                          : '—'}
                      </div>
                    </div>
                    {order.password && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => togglePasswordVisibility(order.id)}
                          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                          title={isPasswordVisible ? 'Hide Password' : 'Show Password'}
                        >
                          {isPasswordVisible ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => copyField(`${order.id}_pass`, order.password!, 'Password')}
                          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                          title="Copy Password"
                        >
                          {passwordCopied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
