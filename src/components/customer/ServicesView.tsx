import React, { useState, useEffect } from 'react';
import { Layers, Search, ArrowRight, ShieldCheck, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext.js';

export const ServicesView: React.FC = () => {
  const { currency, setActiveView, setOrderServicePreset } = useApp();
  const [services, setServices] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/services?currency=${currency}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) setServices(data.services || []);
      })
      .finally(() => setLoading(false));

    fetch('/api/categories')
      .then(r => r.json())
      .then(data => {
        if (data.success) setCategories(data.categories || []);
      });
  }, [currency]);

  const filteredServices = services.filter(s => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (selectedPlatform === 'all') return true;
    const cat = categories.find(c => c.id === s.category_id);
    return cat ? cat.platform === selectedPlatform : false;
  });

  const platforms = [
    { id: 'all', name: 'All Services' },
    { id: 'instagram', name: 'Instagram' },
    { id: 'tiktok', name: 'TikTok' },
    { id: 'youtube', name: 'YouTube' },
    { id: 'telegram', name: 'Telegram' },
    { id: 'twitter', name: 'Twitter (X)' },
    { id: 'facebook', name: 'Facebook' },
    { id: 'spotify', name: 'Spotify' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">Platform Service Catalog</h1>
          <p className="text-xs text-slate-400 mt-1">
            Dynamic service catalog with transparent 1,000 unit rates in {currency}.
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search catalog..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Platform Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {platforms.map(p => (
          <button
            key={p.id}
            onClick={() => setSelectedPlatform(p.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              selectedPlatform === p.id
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="p-5 rounded-2xl bg-[#0b0f19] border border-slate-800 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-4 w-16 bg-slate-800 rounded"></div>
                  <div className="h-4 w-12 bg-slate-800 rounded"></div>
                </div>
                <div className="h-5 w-3/4 bg-slate-800 rounded"></div>
                <div className="space-y-1.5">
                  <div className="h-3 w-full bg-slate-850 rounded"></div>
                  <div className="h-3 w-5/6 bg-slate-850 rounded"></div>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="h-2.5 w-20 bg-slate-800 rounded"></div>
                  <div className="h-5 w-24 bg-slate-800 rounded"></div>
                </div>
                <div className="h-9 w-24 bg-slate-800 rounded-xl"></div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-[#0b0f19] border border-slate-800 rounded-2xl space-y-3">
          <Layers className="w-8 h-8 mx-auto text-slate-500" />
          <p className="text-sm">No services found matching your filter criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredServices.map(service => (
            <div
              key={service.id}
              className="p-5 rounded-2xl bg-[#0b0f19] border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                    ID #{service.id.replace('srv_', '').replace('peakerr', 'P').replace('eagainsmedia', 'E')}
                  </span>
                  <div className="flex items-center gap-1">
                    {service.refill_supported && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">
                        Refill
                      </span>
                    )}
                    {service.cancel_supported && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-medium">
                        Cancel
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="text-sm font-bold text-white line-clamp-2">{service.name}</h3>
                <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">{service.description}</p>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-400">Price / 1,000 units</div>
                  <div className="text-base font-extrabold font-mono text-white">
                    {currency === 'NGN'
                      ? `₦${(service.price_per_1000 ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                      : `${(service.price_per_1000 ?? 0).toFixed(2)} USDT`}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setOrderServicePreset({ serviceId: service.id });
                    setActiveView('new-order');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Order Now</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
