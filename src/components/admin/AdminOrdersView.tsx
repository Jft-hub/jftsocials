import React, { useState, useEffect } from 'react';
import {
  ListOrdered,
  Search,
  RotateCw,
  ExternalLink,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';

export const AdminOrdersView: React.FC = () => {
  const { token, showToast } = useApp();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Refund Modal State
  const [refundOrderId, setRefundOrderId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refunding, setRefunding] = useState(false);

  const fetchAdminOrders = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/orders', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setOrders(data.orders || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminOrders();
  }, [token]);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Order #${orderId} marked as ${newStatus}.`, 'success');
        fetchAdminOrders();
      } else {
        showToast(data.error || 'Failed to update status.', 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleExecuteRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !refundOrderId || !refundReason.trim()) return;

    setRefunding(true);
    try {
      const res = await fetch(`/api/admin/orders/${refundOrderId}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reason: refundReason.trim() })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Order #${refundOrderId} refunded and credited to customer wallet.`, 'success');
        setRefundOrderId(null);
        setRefundReason('');
        fetchAdminOrders();
      } else {
        showToast(data.error || 'Refund failed.', 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setRefunding(false);
    }
  };

  const statusCounts = orders.reduce((acc: Record<string, number>, o: any) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});
  const STATUS_TABS = ['all', 'pending', 'processing', 'in_progress', 'partial', 'completed', 'cancelled', 'failed', 'refunded'];

  const filteredOrders = orders.filter(o => {
    const rawLink = (o.link || (o as any).target_link || '').toLowerCase();
    const matchesSearch =
      o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rawLink.includes(searchQuery.toLowerCase()) ||
      (o.customer_name && o.customer_name.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (filterStatus === 'all') return true;
    return o.status === filterStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">Orders Control Center</h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time status management, provider costs, and audited wallet refunds.
          </p>
        </div>

        <button
          onClick={fetchAdminOrders}
          className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 flex items-center gap-1.5 transition self-start sm:self-auto"
        >
          <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
          <span>Sync Orders</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-2xl bg-[#0b0f19] border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
          {STATUS_TABS.map(st => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                filterStatus === st ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {st.replace('_', ' ').toUpperCase()} ({st === 'all' ? orders.length : (statusCounts[st] || 0)})
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search order, link or customer..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No orders found matching query.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
                <tr>
                  <th className="py-3.5 px-3">Order ID</th>
                  <th className="py-3.5 px-3">Customer</th>
                  <th className="py-3.5 px-3">Service & Target</th>
                  <th className="py-3.5 px-3">Quantity</th>
                  <th className="py-3.5 px-3">Customer Charged</th>
                  <th className="py-3.5 px-3">Provider Cost</th>
                  <th className="py-3.5 px-3">Gross Profit</th>
                  <th className="py-3.5 px-3">Status</th>
                  <th className="py-3.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredOrders.map(order => {
                  return (
                    <tr key={order.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-3.5 px-3 font-mono font-bold text-white whitespace-nowrap">
                        {order.id}
                        <div className="text-[10px] text-slate-400 font-normal">
                          Provider ID: {order.provider_order_id || 'N/A'}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-200">
                          {order.customer_name || 'Customer'}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          ID: {order.user_id}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 max-w-xs">
                        <div className="truncate font-medium text-slate-200">
                          {order.service_name || 'Service'}
                        </div>
                        {(() => {
                          const displayLink = order.link || (order as any).target_link || '';
                          if (!displayLink) {
                            return <span className="text-[10px] text-slate-500 italic block mt-0.5">No target link</span>;
                          }
                          const href = displayLink.startsWith('http')
                            ? displayLink
                            : (displayLink.startsWith('@') ? `https://tiktok.com/${displayLink}` : `https://${displayLink}`);
                          return (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-cyan-400 hover:underline truncate inline-flex items-center gap-1"
                            >
                              <span className="truncate max-w-[140px]">{displayLink}</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          );
                        })()}
                      </td>

                      <td className="py-3.5 px-3 font-mono">
                        {(order.quantity ?? 0).toLocaleString()}
                      </td>

                      <td className="py-3.5 px-3 font-mono font-bold text-white whitespace-nowrap">
                        {order.currency === 'NGN'
                          ? `₦${(order.customer_charge ?? 0).toLocaleString()}`
                          : `${order.customer_charge ?? 0} USDT`}
                      </td>

                      <td className="py-3.5 px-3 font-mono text-slate-400 whitespace-nowrap">
                        {order.currency === 'NGN'
                          ? `₦${(order.provider_charge ?? 0).toLocaleString()}`
                          : `${order.provider_charge ?? 0} USDT`}
                      </td>

                      <td className="py-3.5 px-3 font-mono font-bold text-emerald-400 whitespace-nowrap">
                        {order.currency === 'NGN'
                          ? `+₦${(order.net_profit ?? 0).toLocaleString()}`
                          : `+${order.net_profit ?? 0} USDT`}
                      </td>

                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <select
                          value={order.status}
                          onChange={e => handleStatusChange(order.id, e.target.value)}
                          className="bg-slate-900 border border-slate-700 text-slate-200 rounded px-2 py-1 text-[11px] focus:outline-none"
                        >
                          <option value="pending">Pending</option>
                          <option value="in_progress">In Progress</option>
                          <option value="processing">Processing</option>
                          <option value="completed">Completed</option>
                          <option value="partial">Partial</option>
                          <option value="cancelled">Cancelled</option>
                          <option value="refunded">Refunded</option>
                        </select>
                      </td>

                      <td className="py-3.5 px-3 text-right whitespace-nowrap">
                        {order.status !== 'refunded' ? (
                          <button
                            onClick={() => setRefundOrderId(order.id)}
                            className="px-2.5 py-1 rounded bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 text-[11px] font-semibold transition cursor-pointer"
                          >
                            Refund Order
                          </button>
                        ) : (
                          <span className="text-[10px] text-purple-400 font-semibold uppercase">
                            Refunded
                          </span>
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

      {/* REFUND MODAL */}
      {refundOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-[#0b0f19] border border-slate-800 rounded-2xl p-6 text-slate-100 shadow-2xl space-y-4">
            <button
              onClick={() => setRefundOrderId(null)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-white"
            >
              ✕
            </button>

            <div className="text-center">
              <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-rose-600/20 text-rose-400 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold font-display text-white">Investigate & Refund Order</h3>
              <p className="text-xs text-slate-400 mt-1">
                Order #{refundOrderId} will be refunded directly to customer's wallet with an immutable audit entry.
              </p>
            </div>

            <form onSubmit={handleExecuteRefund} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Investigation & Approval Reason
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Upstream drop verified on link; refunded per WhatsApp inquiry"
                  value={refundReason}
                  onChange={e => setRefundReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-800/40 text-[11px] text-rose-300">
                <strong>Financial Impact:</strong> The exact customer charge will be credited back into the customer's wallet and recorded as a REFUND transaction.
              </div>

              <button
                type="submit"
                disabled={refunding || !refundReason.trim()}
                className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/25 transition cursor-pointer"
              >
                {refunding ? 'Processing Refund...' : 'Confirm and Execute Refund'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
