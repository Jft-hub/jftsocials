import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Shield,
  RotateCw,
  Search,
  PlusCircle,
  MinusCircle
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';

export const AdminPaymentsView: React.FC = () => {
  const { token, showToast } = useApp();

  const [usdtDeposits, setUsdtDeposits] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Manual Adjustment State
  const [selectedUserId, setSelectedUserId] = useState('');
  const [adjustCurrency, setAdjustCurrency] = useState<'NGN' | 'USDT'>('NGN');
  const [adjustType, setAdjustType] = useState<'credit' | 'debit'>('credit');
  const [adjustAmount, setAdjustAmount] = useState<number>(1000);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const fetchPaymentsData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const depRes = await fetch('/api/admin/payments/usdt-pending', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const depData = await depRes.json();
      if (depData.success) {
        setUsdtDeposits(depData.deposits || []);
      }

      const userRes = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const userData = await userRes.json();
      if (userData.success) {
        setUsers(userData.users || []);
        if (userData.users.length > 0 && !selectedUserId) {
          setSelectedUserId(userData.users[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPaymentsData();
  }, [token]);

  const handleApproveUsdt = async (depositId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/payments/usdt/${depositId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showToast('USDT deposit approved and credited to user wallet.', 'success');
        fetchPaymentsData();
      } else {
        showToast(data.error || 'Approval failed.', 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleRejectUsdt = async (depositId: string) => {
    if (!token) return;
    const reason = prompt('Please enter rejection reason:');
    if (!reason) return;

    try {
      const res = await fetch(`/api/admin/payments/usdt/${depositId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (data.success) {
        showToast('USDT deposit marked as rejected.', 'info');
        fetchPaymentsData();
      } else {
        showToast(data.error || 'Rejection failed.', 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleManualAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedUserId || !adjustReason.trim()) return;

    setAdjusting(true);
    try {
      const res = await fetch('/api/admin/wallet/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: selectedUserId,
          currency: adjustCurrency,
          type: adjustType,
          amount: Number(adjustAmount),
          reason: adjustReason.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(
          `Successfully ${adjustType === 'credit' ? 'credited' : 'debited'} ${adjustCurrency} ${adjustAmount}.`,
          'success'
        );
        setAdjustReason('');
        fetchPaymentsData();
      } else {
        showToast(data.error || 'Adjustment failed.', 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">Payment Operations & Crypto</h1>
          <p className="text-xs text-slate-400 mt-1">
            Verify blockchain deposits and execute audited manual balance modifications.
          </p>
        </div>

        <button
          onClick={fetchPaymentsData}
          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 flex items-center gap-1.5 transition"
        >
          <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* USDT Approvals: 7 cols */}
        <div className="lg:col-span-7 bg-[#0b0f19] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h2 className="text-base font-bold font-display text-white">
              USDT Deposit Submissions ({usdtDeposits.length})
            </h2>
            <span className="text-[11px] text-cyan-400 font-mono">TRC-20 Queue</span>
          </div>

          {usdtDeposits.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No pending crypto deposit submissions at this time.
            </div>
          ) : (
            <div className="space-y-3">
              {usdtDeposits.map(d => (
                <div
                  key={d.id}
                  className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white font-mono">{d.amount} USDT</span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] uppercase font-bold">
                        {d.status}
                      </span>
                    </div>
                    <div className="text-slate-400 text-[11px]">
                      User: <strong className="text-slate-200">{d.user_name || d.user_id}</strong>
                    </div>
                    <div className="text-[10px] font-mono text-cyan-400 truncate max-w-xs">
                      TXID: {d.tx_hash}
                    </div>
                  </div>

                  {d.status === 'pending' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleApproveUsdt(d.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleRejectUsdt(d.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 text-xs transition cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Manual Wallet Credit/Debit: 5 cols */}
        <div className="lg:col-span-5 bg-[#0b0f19] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Shield className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold font-display text-white">Manual Balance Adjustment</h2>
          </div>

          <form onSubmit={handleManualAdjustment} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Target Customer</label>
              <select
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} (@{u.username})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Currency</label>
                <select
                  value={adjustCurrency}
                  onChange={e => setAdjustCurrency(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="NGN">NGN (₦)</option>
                  <option value="USDT">USDT</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Action Type</label>
                <select
                  value={adjustType}
                  onChange={e => setAdjustType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="credit">Credit (+)</option>
                  <option value="debit">Debit (-)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Amount</label>
              <input
                type="number"
                min={1}
                required
                value={adjustAmount}
                onChange={e => setAdjustAmount(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Mandatory Audit Reason
              </label>
              <textarea
                rows={2}
                required
                placeholder="e.g. Manual bank wire verified via WhatsApp receipt"
                value={adjustReason}
                onChange={e => setAdjustReason(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={adjusting || !adjustReason.trim()}
              className={`w-full py-2.5 rounded-xl font-bold text-xs shadow-lg transition cursor-pointer flex items-center justify-center gap-2 ${
                adjustType === 'credit'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25'
                  : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/25'
              }`}
            >
              {adjusting ? (
                'Processing...'
              ) : (
                <>
                  {adjustType === 'credit' ? (
                    <PlusCircle className="w-4 h-4" />
                  ) : (
                    <MinusCircle className="w-4 h-4" />
                  )}
                  <span>Execute Balance Modification</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
