import React, { useState, useEffect } from 'react';
import { FileText, Shield, RotateCw, Search, Lock } from 'lucide-react';
import { useApp } from '../../context/AppContext.js';

export const AdminAuditLogsView: React.FC = () => {
  const { token } = useApp();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchLogs = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/audit-logs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [token]);

  const filtered = logs.filter(l =>
    l.action.toLowerCase().includes(search.toLowerCase()) ||
    l.actor_name.toLowerCase().includes(search.toLowerCase()) ||
    l.details.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-mono text-emerald-400 font-semibold">
              Immutable System Ledger
            </span>
          </div>
          <h1 className="text-2xl font-bold font-display text-white mt-1">
            Administrative & Financial Audit Trail
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Tamper-evident logs of order refunds, balance adjustments, and configuration updates.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 flex items-center gap-1.5 transition"
        >
          <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
          <span>Refresh Ledger</span>
        </button>
      </div>

      {/* Search */}
      <div className="p-4 rounded-2xl bg-[#0b0f19] border border-slate-800 flex items-center justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search action or actor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <span className="text-xs text-slate-400">Total Records: {logs.length}</span>
      </div>

      {/* Audit Log Table */}
      <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Details & Reason</th>
                <th className="py-3 px-4">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {filtered.map(l => (
                <tr key={l.id} className="hover:bg-slate-900/40 transition">
                  <td className="py-3 px-4 whitespace-nowrap text-slate-400">
                    {new Date(l.created_at).toLocaleString()}
                  </td>

                  <td className="py-3 px-4 whitespace-nowrap font-sans">
                    <span className="font-semibold text-white">{l.actor_name}</span>
                    <span className="block text-[10px] text-slate-400 font-mono">ID: {l.actor_id}</span>
                  </td>

                  <td className="py-3 px-4 whitespace-nowrap">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider font-sans ${
                        l.action.includes('REFUND')
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : l.action.includes('ADJUST') || l.action.includes('USDT')
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                      }`}
                    >
                      {l.action}
                    </span>
                  </td>

                  <td className="py-3 px-4 font-sans text-slate-200 max-w-md break-words">
                    {l.details}
                  </td>

                  <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                    {l.ip_address || '127.0.0.1'}
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
