import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  DollarSign,
  Users,
  ListOrdered,
  Layers,
  RotateCw,
  ShieldCheck,
  Zap,
  Activity,
  ArrowUpRight,
  Sparkles
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';

export const AdminDashboard: React.FC = () => {
  const { token, showToast, setActiveView } = useApp();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchStats = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/overview', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncOrders = async () => {
    if (!token) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/orders/sync-all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Synced active orders with P.', 'success');
        await fetchStats();
      } else {
        showToast(data.error || 'Sync failed.', 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [token]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-[#0b0f19] via-slate-900 to-[#07090e] border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Administrator Console
            </span>
            <span className="text-xs text-slate-400">Node Status: {stats ? (stats.provider_is_live ? 'Live' : 'Offline') : 'Checking…'}</span>
          </div>
          <h1 className="text-2xl font-bold font-display text-white mt-1">Platform Operations</h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncOrders}
            disabled={syncing}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
          >
            <RotateCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : 'text-cyan-400'}`} />
            <span>{syncing ? 'Syncing...' : 'Sync Nodes'}</span>
          </button>

          <button
            onClick={() => setActiveView('admin-pricing')}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-orange-500/20 transition cursor-pointer"
          >
            <DollarSign className="w-4 h-4" />
            <span>Pricing Calculator</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="p-5 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Gross Revenue</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            ₦{stats?.total_revenue_ngn?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
          </div>
          <div className="text-[11px] text-slate-400">
            Combined customer volume
          </div>
        </div>

        {/* Net Profit */}
        <div className="p-5 rounded-2xl bg-[#0b0f19] border border-emerald-500/30 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Net Gross Margin</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            ₦{stats?.total_gross_profit_ngn?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
          </div>
          <div className="text-[11px] text-emerald-400 font-medium">
            ₦{(stats?.min_margin_ngn ?? 10).toLocaleString()} minimum margin floor enforced
          </div>
        </div>

        {/* Active Orders */}
        <div className="p-5 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total System Orders</span>
            <ListOrdered className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-cyan-400">
            {stats?.orders_count || 0}
          </div>
          <div className="text-[11px] text-slate-400">
            Automated sync pipeline
          </div>
        </div>

        {/* Active Users */}
        <div className="p-5 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Platform Users</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {stats?.users_count || 0}
          </div>
          <div className="text-[11px] text-slate-400">
            Dual NGN & USDT accounts
          </div>
        </div>
      </div>

      {/* Customer Wallet Liability - what you owe users if everyone withdrew */}
      <div className="p-5 rounded-2xl bg-[#0b0f19] border border-amber-500/30 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Total Customer Wallet Balances (your liability)</span>
          <Users className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div className="text-2xl font-bold font-mono text-white">
            ₦{stats?.total_customer_balance_ngn?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
          </div>
          <div className="text-lg font-bold font-mono text-emerald-400">
            {(stats?.total_customer_balance_usdt ?? 0).toFixed(2)} <span className="text-xs text-slate-400 font-normal">USDT</span>
          </div>
        </div>
        <div className="text-[11px] text-slate-400">
          Sum of all customer wallets across {stats?.users_count || 0} users (staff wallets excluded)
        </div>
      </div>

      {/* Upstream Provider Balances & Pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-2">
          <div className="text-xs text-slate-400">P Balance</div>
          <div className="text-2xl font-bold font-mono text-white">
            {stats?.provider_balance === null || stats?.provider_balance === undefined
              ? <span className="text-slate-500">—</span>
              : <span>{(stats?.provider_balance_currency || 'USD') === 'NGN' ? '₦' : '$'}{Number(stats.provider_balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>} <span className="text-xs text-slate-400 font-normal">{stats?.provider_balance_currency || 'USD'}</span>
          </div>
          <div className="text-[11px] text-cyan-400">
            {stats?.provider_is_live ? 'Key: Live' : 'Key: Unknown / offline'}
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-2">
          <div className="text-xs text-slate-400">E Balance</div>
          <div className="text-2xl font-bold font-mono text-white">
            {stats?.eagainsmedia_balance === null || stats?.eagainsmedia_balance === undefined
              ? <span className="text-slate-500">—</span>
              : <span>{(stats?.eagainsmedia_balance_currency || 'USD') === 'NGN' ? '₦' : '$'}{Number(stats.eagainsmedia_balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>} <span className="text-xs text-slate-400 font-normal">{stats?.eagainsmedia_balance_currency || 'USD'}</span>
          </div>
          <div className="text-[11px] text-slate-400">
            SMM failover lane
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-2">
          <div className="text-xs text-slate-400">5 Balance</div>
          <div className="text-2xl font-bold font-mono text-white">
            {stats?.fivesim_balance === null || stats?.fivesim_balance === undefined
              ? <span className="text-slate-500">—</span>
              : <span>{Number(stats.fivesim_balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>} <span className="text-xs text-slate-400 font-normal">USD</span>
          </div>
          <div className="text-[11px] text-slate-400">
            Virtual numbers wallet
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-2">
          <div className="text-xs text-slate-400">Active Service Catalog</div>
          <div className="text-2xl font-bold font-mono text-white">
            {stats?.services_count || 0} <span className="text-xs text-slate-400 font-normal">Packages</span>
          </div>
          <button
            onClick={() => setActiveView('admin-services')}
            className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1"
          >
            <span>Manage visibility & markups</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>

        <div className="p-5 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-2">
          <div className="text-xs text-slate-400">Total Provider Costs Paid</div>
          <div className="text-2xl font-bold font-mono text-slate-300">
            ₦{stats?.total_provider_cost_ngn?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
          </div>
          <div className="text-[11px] text-slate-400">
            Upstream cost settlement
          </div>
        </div>
      </div>

      {/* Operations Quick Shortcuts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => setActiveView('admin-orders')}
          className="p-4 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 text-left transition"
        >
          <div className="font-bold text-white text-xs mb-1">Orders Management</div>
          <p className="text-[11px] text-slate-400">Sync, cancel, or refund customer orders with reason logging.</p>
        </button>

        <button
          onClick={() => setActiveView('admin-payments')}
          className="p-4 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 text-left transition"
        >
          <div className="font-bold text-white text-xs mb-1">USDT Deposit Approvals</div>
          <p className="text-[11px] text-slate-400">Verify blockchain hashes and credit customer wallets.</p>
        </button>

        <button
          onClick={() => setActiveView('admin-support')}
          className="p-4 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 text-left transition"
        >
          <div className="font-bold text-white text-xs mb-1">Support Desk</div>
          <p className="text-[11px] text-slate-400">Answer inquiries and coordinate WhatsApp investigations.</p>
        </button>

        <button
          onClick={() => setActiveView('admin-audit-logs')}
          className="p-4 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 text-left transition"
        >
          <div className="font-bold text-white text-xs mb-1">Security Audit Trail</div>
          <p className="text-[11px] text-slate-400">Review tamper-evident administrator and transaction actions.</p>
        </button>
      </div>
    </div>
  );
};
