import React, { useState, useMemo } from 'react';
import {
  ListOrdered,
  Search,
  RotateCw,
  RefreshCw,
  XCircle,
  ExternalLink,
  MessageCircle,
  HelpCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  Activity,
  DollarSign,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { useApp } from '../../context/AppContext.js';
import { WhatsAppBadge } from '../layout/WhatsAppBadge.js';

export const OrdersView: React.FC = () => {
  const { orders, token, currency, refreshOrders, showToast, setActiveView } = useApp();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [chartMetric, setChartMetric] = useState<'both' | 'spending' | 'frequency'>('both');
  const [showChart, setShowChart] = useState<boolean>(true);

  // --- RECHARTS TREND DATA AGGREGATION ---
  const { trendData, stats } = useMemo(() => {
    let totalSpend = 0;
    let completedCount = 0;
    let inProgressCount = 0;

    const safeOrders = Array.isArray(orders) ? orders : [];

    // Group orders by formatted calendar day (YYYY-MM-DD)
    const dayBuckets = new Map<string, {
      dateKey: string;
      label: string;
      rawDate: number;
      ordersCount: number;
      spending: number;
      completed: number;
    }>();

    // Sort orders oldest to newest
    const sorted = [...safeOrders].sort((a, b) => {
      const timeA = a && a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b && b.created_at ? new Date(b.created_at).getTime() : 0;
      return (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB);
    });

    for (const order of sorted) {
      if (!order) continue;
      let d = new Date(order.created_at || Date.now());
      if (isNaN(d.getTime())) d = new Date();
      const dateKey = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const charge = typeof order.customer_charge === 'number' ? order.customer_charge : 0;

      totalSpend += charge;
      if (order.status === 'completed') completedCount++;
      if (['in_progress', 'processing'].includes(order.status || '')) inProgressCount++;

      if (!dayBuckets.has(dateKey)) {
        dayBuckets.set(dateKey, {
          dateKey,
          label,
          rawDate: d.getTime(),
          ordersCount: 1,
          spending: charge,
          completed: order.status === 'completed' ? 1 : 0
        });
      } else {
        const item = dayBuckets.get(dateKey)!;
        item.ordersCount += 1;
        item.spending = Math.round((item.spending + charge) * 100) / 100;
        if (order.status === 'completed') item.completed += 1;
      }
    }

    let points = Array.from(dayBuckets.values());

    // If fewer than 4 data points, pad recent days to give a continuous trendline
    if (points.length < 4) {
      const now = new Date();
      const paddedMap = new Map<string, { dateKey: string; label: string; rawDate: number; ordersCount: number; spending: number; completed: number }>();

      for (let i = 6; i >= 0; i--) {
        const past = new Date(now.getTime() - i * 86400000);
        const k = past.toISOString().slice(0, 10);
        const l = past.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        paddedMap.set(k, {
          dateKey: k,
          label: l,
          rawDate: past.getTime(),
          ordersCount: 0,
          spending: 0,
          completed: 0
        });
      }

      for (const p of points) {
        paddedMap.set(p.dateKey, p);
      }
      points = Array.from(paddedMap.values()).sort((a, b) => a.rawDate - b.rawDate);
    }

    const completionRate = safeOrders.length > 0
      ? Math.round((completedCount / safeOrders.length) * 100)
      : 0;

    return {
      trendData: points,
      stats: {
        totalSpend: Math.round(totalSpend * 100) / 100,
        totalOrders: safeOrders.length,
        completedCount,
        inProgressCount,
        completionRate
      }
    };
  }, [orders]);

  const safeOrdersList = Array.isArray(orders) ? orders : [];
  const filteredOrders = safeOrdersList.filter(order => {
    if (!order) return false;
    const rawLink = (order.link || (order as any).target_link || '').toLowerCase();
    const matchesSearch =
      (order.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      rawLink.includes(searchQuery.toLowerCase()) ||
      (order.service_name && order.service_name.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (filterStatus === 'all') return true;
    return (order.status || 'processing') === filterStatus;
  });

  const handleRefill = async (orderId: string) => {
    if (!token) return;
    setActionLoadingId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}/refill`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Refill initiated successfully.', 'success');
        refreshOrders();
      } else {
        showToast(data.error || 'Refill failed.', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Error processing refill.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancel = async (orderId: string) => {
    if (!token) return;
    if (!confirm('Are you sure you want to cancel this order?')) return;
    setActionLoadingId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showToast('Order cancelled successfully.', 'success');
        refreshOrders();
      } else {
        showToast(data.error || 'Cancel failed.', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Error cancelling order.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const statuses = [
    { id: 'all', label: 'All Orders' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'completed', label: 'Completed' },
    { id: 'pending', label: 'Pending' },
    { id: 'partial', label: 'Partial' },
    { id: 'cancelled', label: 'Cancelled' },
    { id: 'refunded', label: 'Refunded' }
  ];

  const whatsappNumber = '+2347018409997';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">Order Tracking</h1>
          <p className="text-xs text-slate-400 mt-1">
            Autonomous live sync with multi-provider routing every 8 seconds.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refreshOrders()}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white flex items-center gap-2 transition cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sync Live Status</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-[#0b0f19] border border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-slate-400">Total Spent</div>
            <div className="text-base font-extrabold font-mono text-white truncate">
              {currency === 'NGN' ? `₦${stats.totalSpend.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : `${stats.totalSpend.toFixed(2)} USDT`}
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#0b0f19] border border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-slate-400">Order Volume</div>
            <div className="text-base font-extrabold font-mono text-white truncate">
              {stats.totalOrders} <span className="text-xs font-normal text-slate-400">orders</span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#0b0f19] border border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-slate-400">In Progress</div>
            <div className="text-base font-extrabold font-mono text-white truncate">
              {stats.inProgressCount} <span className="text-xs font-normal text-slate-400">active</span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#0b0f19] border border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-slate-400">Completion Rate</div>
            <div className="text-base font-extrabold font-mono text-white truncate">
              {stats.completionRate}%
            </div>
          </div>
        </div>
      </div>

      {/* Recharts Trend Line Graph Card */}
      <div className="p-5 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold font-display text-white">Order Frequency & Spending Trends</h2>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setChartMetric('both')}
                className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                  chartMetric === 'both' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                All Metrics
              </button>
              <button
                type="button"
                onClick={() => setChartMetric('spending')}
                className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                  chartMetric === 'spending' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Spending
              </button>
              <button
                type="button"
                onClick={() => setChartMetric('frequency')}
                className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                  chartMetric === 'frequency' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Orders
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowChart(!showChart)}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              title={showChart ? 'Collapse Chart' : 'Expand Chart'}
            >
              {showChart ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {showChart && (
          <div className="pt-2">
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="freqGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#64748b"
                    fontSize={10}
                    tickLine={false}
                    axisLine={{ stroke: '#334155' }}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="#64748b"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={val => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val)}
                  />
                  {chartMetric === 'both' && (
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="#06b6d4"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                  )}
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="p-3 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl text-xs space-y-1.5">
                            <div className="font-semibold text-slate-300 pb-1 border-b border-slate-800">{label}</div>
                            {payload.map((entry, index) => (
                              <div key={index} className="flex items-center justify-between gap-4">
                                <span className="flex items-center gap-1.5 text-slate-400">
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                                  {entry.name}:
                                </span>
                                <span className="font-mono font-bold text-white">
                                  {entry.dataKey === 'spending'
                                    ? currency === 'NGN' ? `₦${Number(entry.value).toLocaleString()}` : `${Number(entry.value).toFixed(2)} USDT`
                                    : `${entry.value} orders`}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  {(chartMetric === 'both' || chartMetric === 'spending') && (
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="spending"
                      name="Spending"
                      stroke="#6366f1"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#spendGradient)"
                    />
                  )}
                  {(chartMetric === 'both' || chartMetric === 'frequency') && (
                    <Area
                      yAxisId={chartMetric === 'both' ? 'right' : 'left'}
                      type="monotone"
                      dataKey="ordersCount"
                      name="Orders Placed"
                      stroke="#06b6d4"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#freqGradient)"
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-center gap-6 pt-3 text-[11px] text-slate-400 border-t border-slate-800/60 mt-2">
              {(chartMetric === 'both' || chartMetric === 'spending') && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                  <span>Spending Trend ({currency})</span>
                </div>
              )}
              {(chartMetric === 'both' || chartMetric === 'frequency') && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                  <span>Order Frequency (Count)</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-[#0b0f19] border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
          {statuses.map(st => (
            <button
              key={st.id}
              onClick={() => setFilterStatus(st.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                filterStatus === st.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search order ID or link..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <ListOrdered className="w-8 h-8 mx-auto text-slate-500" />
            <p className="text-sm">No orders found matching your filter criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Order ID</th>
                  <th className="py-3.5 px-4">Service & Target</th>
                  <th className="py-3.5 px-4">Quantity</th>
                  <th className="py-3.5 px-4">Charge</th>
                  <th className="py-3.5 px-4">Start / Remains</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredOrders.map(order => {
                  const isCompleted = order.status === 'completed';
                  const isInProgress = ['in_progress', 'processing'].includes(order.status);
                  const isPending = order.status === 'pending';
                  const isCancelled = order.status === 'cancelled';
                  const isRefunded = order.status === 'refunded';
                  const canCancel = Boolean(order.cancel_eligible) && ['pending', 'processing', 'in_progress'].includes(order.status);

                  return (
                    <tr key={order.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-4 px-4 font-mono font-bold text-white whitespace-nowrap">
                        {order.id}
                        <div className="text-[10px] text-slate-400 font-normal">
                          {order.created_at ? new Date(order.created_at).toLocaleDateString() : 'Recent'}
                        </div>
                      </td>

                      <td className="py-4 px-4 max-w-xs">
                        <div className="font-semibold text-slate-200 truncate">
                          {order.service_name || 'Social Media Service'}
                        </div>
                        {(() => {
                          const displayLink = order.link || (order as any).target_link || '';
                          if (!displayLink) {
                            return <span className="text-[11px] text-slate-500 italic mt-0.5 block">No target link</span>;
                          }
                          const href = displayLink.startsWith('http')
                            ? displayLink
                            : (displayLink.startsWith('@') ? `https://tiktok.com/${displayLink}` : `https://${displayLink}`);
                          return (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-cyan-400 hover:underline truncate inline-flex items-center gap-1 mt-0.5"
                            >
                              <span className="truncate max-w-[180px]">{displayLink}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          );
                        })()}
                      </td>

                      <td className="py-4 px-4 font-mono">
                        {(order.quantity ?? 0).toLocaleString()}
                      </td>

                      <td className="py-4 px-4 font-mono font-bold text-white whitespace-nowrap">
                        {order.currency === 'NGN'
                          ? `₦${(order.customer_charge ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                          : `${(order.customer_charge ?? 0).toFixed(2)} USDT`}
                      </td>

                      <td className="py-4 px-4 font-mono text-[11px] whitespace-nowrap">
                        <span className="text-slate-400">Start:</span> {order.start_count}
                        <br />
                        <span className="text-cyan-400 font-semibold">Remains: {order.remains}</span>
                      </td>

                      <td className="py-4 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
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
                          {(order.status || 'processing').replace('_', ' ')}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-right whitespace-nowrap space-x-1.5">
                        {isCompleted && (
                          <button
                            onClick={() => handleRefill(order.id)}
                            disabled={actionLoadingId === order.id}
                            className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-medium text-slate-200 hover:text-white transition cursor-pointer"
                            title="Request Refill"
                          >
                            <RefreshCw className="w-3 h-3 inline mr-1" />
                            Refill
                          </button>
                        )}

                        {canCancel && (
                          <button
                            onClick={() => handleCancel(order.id)}
                            disabled={actionLoadingId === order.id}
                            className="px-2.5 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-[11px] font-medium text-rose-300 transition cursor-pointer"
                            title="Cancel Order"
                          >
                            <XCircle className="w-3 h-3 inline mr-1" />
                            Cancel
                          </button>
                        )}

                        {/* Order Help & Refund inquiry via WhatsApp */}
                        <a
                          href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                            `Hello JFT Socials Support! I need assistance/investigation for Order ID: ${order.id}`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-600/40 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 transition"
                          title="Contact WhatsApp Agent for this order"
                        >
                          <MessageCircle className="w-3 h-3" />
                          <span>Help</span>
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bottom Guidance Card */}
      <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 text-xs text-slate-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>
            Need order investigation or refund assistance? Connect with our dedicated WhatsApp agent directly.
          </span>
        </div>
        <a
          href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3.5 py-1.5 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white font-semibold text-xs whitespace-nowrap transition flex items-center gap-1.5"
        >
          <MessageCircle className="w-3.5 h-3.5 fill-current" />
          <span>WhatsApp: {whatsappNumber}</span>
        </a>
      </div>
    </div>
  );
};
