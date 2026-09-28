import React, { useState, useEffect } from 'react';
import { Layers, RotateCw, Search, Check, X, Edit2, DollarSign } from 'lucide-react';
import { useApp } from '../../context/AppContext.js';

export const AdminServicesView: React.FC = () => {
  const { token, showToast } = useApp();
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');

  // Edit Service modal state
  const [editingService, setEditingService] = useState<any | null>(null);
  const [customMarkup, setCustomMarkup] = useState<number | ''>('');
  const [customSellingPrice, setCustomSellingPrice] = useState<number | ''>('');

  const fetchAdminServices = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/services', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setServices(data.services || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncServices = async (provider = 'all') => {
    if (!token) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/services/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ provider })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Synced ${data.count || 0} services from ${data.provider || provider} API!`, 'success');
        fetchAdminServices();
      } else {
        showToast(data.error || 'Sync failed.', 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleService = async (serviceId: string, currentStatus: boolean) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/services/${serviceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ is_active: !currentStatus })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Service status updated.', 'success');
        fetchAdminServices();
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleSaveCustomPricing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingService) return;

    try {
      const res = await fetch(`/api/admin/services/${editingService.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          custom_markup_percent: customMarkup === '' ? null : Number(customMarkup),
          custom_fixed_price_ngn: customSellingPrice === '' ? null : Number(customSellingPrice)
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Custom pricing applied to service.', 'success');
        setEditingService(null);
        fetchAdminServices();
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  useEffect(() => {
    fetchAdminServices();
  }, [token]);

  const filtered = services.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">Service Catalog & Node Sync</h1>
          <p className="text-xs text-slate-400 mt-1">
            Upstream catalog control, custom price overrides, and visibility toggles.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleSyncServices('all')}
            disabled={syncing}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-indigo-600/25 cursor-pointer"
          >
            <RotateCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync All Providers'}</span>
          </button>
          <button
            onClick={() => handleSyncServices('peakerr')}
            disabled={syncing}
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 transition cursor-pointer"
          >
            P
          </button>
          <button
            onClick={() => handleSyncServices('eagainsmedia')}
            disabled={syncing}
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 transition cursor-pointer"
          >
            E
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-4 rounded-2xl bg-[#0b0f19] border border-slate-800 flex items-center justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search service name or ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <span className="text-xs text-slate-400">Total Services: {services.length}</span>
      </div>

      {/* Services Table */}
      <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Service ID</th>
                <th className="py-3 px-4">Service Name</th>
                <th className="py-3 px-4">Provider Rate (1k)</th>
                <th className="py-3 px-4">Selling Rate (1k)</th>
                <th className="py-3 px-4">Min / Max</th>
                <th className="py-3 px-4">Visibility</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map(s => {
                return (
                  <tr key={s.id} className="hover:bg-slate-900/40 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-white whitespace-nowrap">
                      {s.id}
                      <div className="text-[10px] text-slate-400 font-normal flex items-center gap-1.5 mt-0.5">
                        <span className={`px-1.5 py-0.2 rounded text-[9px] uppercase font-bold ${
                          s.provider_id === 'eagainsmedia'
                            ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/40'
                            : 'bg-indigo-950/80 text-indigo-400 border border-indigo-800/40'
                        }`}>
                          {s.provider_id || 'peakerr'}
                        </span>
                        <span>#{s.provider_service_id}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 max-w-md">
                      <div className="font-semibold text-slate-200">{s.name}</div>
                      <div className="text-[11px] text-slate-400 line-clamp-1">{s.description}</div>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-slate-400 whitespace-nowrap">
                      ₦{s.provider_rate_per_1000_ngn?.toLocaleString() ?? '0'}
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-white whitespace-nowrap">
                      ₦{s.selling_price_per_1000_ngn?.toLocaleString() ?? '0'}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-[11px] whitespace-nowrap">
                      {s.min_quantity} - {s.max_quantity?.toLocaleString() ?? '0'}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleService(s.id, s.is_active)}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition ${
                          s.is_active
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {s.is_active ? 'Active' : 'Disabled'}
                      </button>
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => {
                          setEditingService(s);
                          setCustomMarkup(s.custom_markup_percent ?? '');
                          setCustomSellingPrice(s.custom_fixed_price_ngn ?? '');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] text-slate-300 hover:text-white transition cursor-pointer"
                      >
                        Edit Pricing
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* EDIT PRICING MODAL */}
      {editingService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-[#0b0f19] border border-slate-800 rounded-2xl p-6 text-slate-100 shadow-2xl space-y-4">
            <button
              onClick={() => setEditingService(null)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-white"
            >
              ✕
            </button>

            <div>
              <h3 className="text-base font-bold font-display text-white">Custom Pricing Override</h3>
              <p className="text-xs text-slate-400 truncate">{editingService.name}</p>
            </div>

            <form onSubmit={handleSaveCustomPricing} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Custom Markup % (Leave blank for global 50%)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 75"
                  value={customMarkup}
                  onChange={e => setCustomMarkup(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Custom Fixed Selling Price (₦ per 1k units, overrides markup)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 4500"
                  value={customSellingPrice}
                  onChange={e =>
                    setCustomSellingPrice(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="text-[11px] text-slate-400">
                Provider cost: ₦{editingService.provider_rate_per_1000_ngn} / 1k. Floor rule (₦2,000 min) applies unless custom fixed price is set.
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/25 transition cursor-pointer"
              >
                Save Pricing Overrides
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
