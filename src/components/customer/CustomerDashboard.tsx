import React from 'react';
import {
  Wallet,
  Clock,
  CheckCircle2,
  TrendingUp,
  PlusCircle,
  ArrowUpRight,
  ExternalLink,
  MessageCircle,
  Zap,
  RotateCw,
  PhoneCall,
  ShoppingBag,
  KeyRound,
  ArrowRight
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';
import { WhatsAppBadge } from '../layout/WhatsAppBadge.js';

export const CustomerDashboard: React.FC = () => {
  const { user, wallets, orders, currency, setActiveView, refreshOrders } = useApp();

  const ngnWallet = wallets.find(w => w.currency === 'NGN');
  const usdtWallet = wallets.find(w => w.currency === 'USDT');

  const activeOrders = orders.filter(o => ['pending', 'processing', 'in_progress'].includes(o.status));
  const completedOrders = orders.filter(o => o.status === 'completed');

  // Compute total spent in NGN
  const totalSpentNGN = orders.reduce((sum, o) => {
    if (o.status !== 'refunded') {
      const charge = typeof o.customer_charge === 'number' ? o.customer_charge : 0;
      const amount = o.currency === 'USDT' ? charge * 1500 : charge;
      return sum + amount;
    }
    return sum;
  }, 0);

  return (
    <div className="space-y-6">
      {/* Top Welcome & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-[#0b0f19] via-slate-900 to-[#07090e] border border-slate-800">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">
            Welcome, {user?.name || 'Customer'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Account ID: <span className="font-mono text-cyan-400 font-semibold">{user?.username}</span> • Live Node Connected
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setActiveView('wallet')}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
          >
            <Wallet className="w-3.5 h-3.5 text-cyan-400" />
            <span>Add Funds</span>
          </button>

          <button
            onClick={() => setActiveView('virtual-numbers')}
            className="px-3.5 py-2 rounded-xl bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-700/40 text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
          >
            <PhoneCall className="w-3.5 h-3.5 text-indigo-400" />
            <span>Virtual Numbers</span>
          </button>

          <button
            onClick={() => setActiveView('accounts-store')}
            className="px-3.5 py-2 rounded-xl bg-purple-950/60 hover:bg-purple-900/60 text-purple-300 border border-purple-700/40 text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
          >
            <ShoppingBag className="w-3.5 h-3.5 text-purple-400" />
            <span>Account Store</span>
          </button>

          <button
            onClick={() => setActiveView('new-order')}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-500/20 transition cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>New SMM Order</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* NGN Wallet */}
        <div className="p-5 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>NGN Wallet Balance</span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400">NAIRA</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            ₦{ngnWallet?.available_balance?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '0.00'}
          </div>
          <button
            onClick={() => setActiveView('wallet')}
            className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 pt-1"
          >
            <span>Top up via Paystack</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>

        {/* USDT Wallet */}
        <div className="p-5 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>USDT Wallet Balance</span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">TRC-20</span>
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {usdtWallet?.available_balance !== undefined ? usdtWallet.available_balance.toFixed(2) : '0.00'} <span className="text-xs text-slate-400">USDT</span>
          </div>
          <button
            onClick={() => setActiveView('wallet')}
            className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 pt-1"
          >
            <span>Deposit Crypto</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>

        {/* Active Orders */}
        <div className="p-5 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Active Orders</span>
            <Clock className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-cyan-400">
            {activeOrders.length}
          </div>
          <div className="text-[11px] text-slate-400">
            Background sync active (8s)
          </div>
        </div>

        {/* Lifetime Spent */}
        <div className="p-5 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Lifetime Orders</span>
            <CheckCircle2 className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {completedOrders.length} <span className="text-xs text-slate-400 font-normal">Completed</span>
          </div>
          <div className="text-[11px] text-slate-400 truncate">
            Total Spent: ₦{(totalSpentNGN ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Account Store Spotlight Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-purple-950/40 via-indigo-950/30 to-slate-900 border border-purple-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-purple-500/20 border border-purple-500/30 rounded-xl text-purple-300 shrink-0">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">Pre-Made Verified Accounts Now Available</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                UK TikTok · ₦8,000
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Aged UK TikTok accounts with email login. Instant credential delivery straight to your dashboard.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setActiveView('accounts-store')}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-purple-600/20 flex items-center gap-1.5"
          >
            <span>Browse Accounts</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* WhatsApp Agent Support Card */}
      <WhatsAppBadge variant="banner" />

      {/* Recent Orders Section */}
      <div className="p-6 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold font-display text-white">Recent Orders</h2>
            <p className="text-xs text-slate-400">Autonomous status tracking from P network</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => refreshOrders()}
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs flex items-center gap-1 transition"
              title="Refresh Live Statuses"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sync Now</span>
            </button>
            <button
              onClick={() => setActiveView('orders')}
              className="text-xs font-semibold text-cyan-400 hover:underline"
            >
              View All Orders ({orders.length})
            </button>
          </div>
        </div>

        {orders.length === 0 ? (
          <div className="py-12 text-center text-slate-400 space-y-3">
            <p className="text-sm">You haven't placed an order yet.</p>
            <button
              onClick={() => setActiveView('new-order')}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create First Order</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-3">Order ID</th>
                  <th className="py-3 px-3">Service</th>
                  <th className="py-3 px-3">Quantity</th>
                  <th className="py-3 px-3">Charge</th>
                  <th className="py-3 px-3">Start / Remains</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {orders.slice(0, 5).map(order => {
                  const isCompleted = order.status === 'completed';
                  const isInProgress = ['in_progress', 'processing'].includes(order.status);
                  const isCancelled = order.status === 'cancelled';
                  const isRefunded = order.status === 'refunded';

                  return (
                    <tr key={order.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-3 px-3 font-mono font-bold text-white">{order.id}</td>
                      <td className="py-3 px-3 max-w-[200px] truncate text-slate-200">
                        {order.service_name || 'Social Growth Service'}
                      </td>
                      <td className="py-3 px-3 font-mono">{(order.quantity ?? 0).toLocaleString()}</td>
                      <td className="py-3 px-3 font-mono font-semibold text-white">
                        {order.currency === 'NGN' ? `₦${(order.customer_charge ?? 0).toLocaleString()}` : `${order.customer_charge ?? 0} USDT`}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px]">
                        {order.start_count} / <span className="text-cyan-400">{order.remains}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isCompleted
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : isInProgress
                              ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 animate-pulse'
                              : isRefunded
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              : isCancelled
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}
                        >
                          {order.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                        {new Date(order.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
