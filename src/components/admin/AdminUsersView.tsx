import React, { useState, useEffect } from 'react';
import { Users, Search, Shield, RotateCw, Wallet, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext.js';

export const AdminUsersView: React.FC = () => {
  const { token, showToast } = useApp();
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchUsers = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setUsers(data.users || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const walletBalance = (u: any, currency: string): number => {
    const w = (u.wallets || []).find((x: any) => x.currency === currency);
    return typeof w?.available_balance === 'number' ? w.available_balance : 0;
  };

  const handleStatusChange = async (userId: string, email: string, suspend: boolean) => {
    if (!token) return;
    const action = suspend ? 'blacklist (suspend)' : 'un-suspend';
    if (!window.confirm(`Are you sure you want to ${action} ${email}?${suspend ? ' They will be logged out everywhere and blocked from logging in.' : ''}`)) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: suspend ? 'suspended' : 'active' })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`User ${suspend ? 'blacklisted' : 'restored'} successfully.`, 'success');
        fetchUsers();
      } else {
        showToast(data.error || 'Failed to update status.', 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleDelete = async (userId: string, email: string) => {
    if (!token) return;
    if (!window.confirm(`PERMANENTLY delete ${email}?\n\nWallets, ledger, tickets and notifications are removed. Past orders stay in the books anonymized. This cannot be undone.`)) return;
    if (!window.confirm(`Final confirmation: erase ${email} completely?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showToast('User permanently deleted.', 'success');
        fetchUsers();
      } else {
        showToast(data.error || 'Failed to delete user.', 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ role: newRole })
      });
      const data = await res.json();
      if (data.success) {
        showToast('User role updated successfully.', 'success');
        fetchUsers();
      } else {
        showToast(data.error || 'Failed to update role.', 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">Users & Accounts</h1>
          <p className="text-xs text-slate-400 mt-1">
            Overview of customer profiles, wallet balances, and role permissions.
          </p>
        </div>

        <button
          onClick={fetchUsers}
          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 flex items-center gap-1.5 transition"
        >
          <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
          <span>Refresh Users</span>
        </button>
      </div>

      {/* Search */}
      <div className="p-4 rounded-2xl bg-[#0b0f19] border border-slate-800 flex items-center justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, email, or @handle..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <span className="text-xs text-slate-400">Total: {users.length} Users</span>
      </div>

      {/* Users Table */}
      <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">NGN Balance</th>
                  <th className="py-3 px-4">USDT Balance</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map(u => (
                <tr key={u.id} className="hover:bg-slate-900/40 transition">
                  <td className="py-3.5 px-4 font-semibold text-white whitespace-nowrap">
                    {u.name}
                    <div className="text-[10px] text-cyan-400 font-mono">@{u.username}</div>
                  </td>

                  <td className="py-3.5 px-4 text-slate-300">{u.email}</td>

                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        ['admin', 'superadmin'].includes(u.role)
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 font-mono font-bold text-white whitespace-nowrap">
                    ₦{walletBalance(u, 'NGN').toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>

                  <td className="py-3.5 px-4 font-mono font-bold text-emerald-400 whitespace-nowrap">
                    {walletBalance(u, 'USDT').toFixed(2)} USDT
                  </td>

                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {u.status === 'suspended' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-rose-400 font-bold uppercase">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                        Blacklisted
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Active
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <select
                        value={u.role}
                        onChange={e => handleRoleChange(u.id, e.target.value)}
                        className="bg-slate-900 border border-slate-700 text-slate-200 rounded px-2 py-1 text-[11px] focus:outline-none"
                        title="Change role"
                      >
                        <option value="customer">Customer</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Administrator</option>
                        <option value="superadmin">Super Admin</option>
                      </select>
                      {u.status === 'suspended' ? (
                        <button
                          onClick={() => handleStatusChange(u.id, u.email, false)}
                          className="px-2 py-1 rounded bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/60 text-emerald-300 text-[11px] font-semibold transition cursor-pointer"
                          title="Remove blacklist"
                        >
                          Unban
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStatusChange(u.id, u.email, true)}
                          className="px-2 py-1 rounded bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/60 text-amber-300 text-[11px] font-semibold transition cursor-pointer"
                          title="Blacklist (suspend login)"
                        >
                          Blacklist
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(u.id, u.email)}
                        className="px-2 py-1 rounded bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 text-[11px] font-semibold transition cursor-pointer"
                        title="Permanently delete user"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
