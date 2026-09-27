import React, { useState, useEffect } from 'react';
import {
  Settings,
  Save,
  ShieldAlert,
  Globe,
  MessageCircle,
  PhoneCall,
  Server,
  Zap,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Coins
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';

export const AdminSettingsView: React.FC = () => {
  const { token, showToast } = useApp();

  // General & Brand Settings
  const [platformName, setPlatformName] = useState('JFT Socials');
  const [primaryDomain, setPrimaryDomain] = useState('jftsocials.online');
  const [supportWhatsapp, setSupportWhatsapp] = useState('+2347018409997');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [minDepositNgn, setMinDepositNgn] = useState<number>(100);

  // Peakerr Provider
  const [peakerrApiUrl, setPeakerrApiUrl] = useState('https://peakerr.com/api/v2');
  const [peakerrApiKey, setPeakerrApiKey] = useState('');
  const [peakerrConfigured, setPeakerrConfigured] = useState(false);

  // Eagainsmedia Provider
  const [eagainsmediaApiUrl, setEagainsmediaApiUrl] = useState('https://engainsmedia.com/api/v2');
  const [eagainsmediaApiKey, setEagainsmediaApiKey] = useState('');
  const [eagainsmediaConfigured, setEagainsmediaConfigured] = useState(false);

  // 5sim Provider & Virtual Numbers
  const [fivesimApiKey, setFivesimApiKey] = useState('');
  const [fivesimConfigured, setFivesimConfigured] = useState(false);
  const [fivesimNgnRate, setFivesimNgnRate] = useState<number>(25.0);
  const [fivesimMarkupPercent, setFivesimMarkupPercent] = useState<number>(50);
  const [fivesimMinMarginNgn, setFivesimMinMarginNgn] = useState<number>(200);

  // Status & Testing states
  const [saving, setSaving] = useState(false);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!token) return;
    fetch('/api/admin/settings', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.success && data.settings) {
          const s = data.settings;
          setPlatformName(s.platform_name || 'JFT Socials');
          setPrimaryDomain(s.primary_domain || 'jftsocials.online');
          setSupportWhatsapp(s.support_whatsapp || '+2347018409997');
          setMaintenanceMode(Boolean(s.maintenance_mode));
          setMinDepositNgn(s.min_deposit_ngn || 100);

          setPeakerrApiUrl(s.peakerr_api_url || 'https://peakerr.com/api/v2');
          setPeakerrConfigured(Boolean(s.peakerr_key_configured));

          setEagainsmediaApiUrl(s.eagainsmedia_api_url || 'https://engainsmedia.com/api/v2');
          setEagainsmediaConfigured(Boolean(s.eagainsmedia_key_configured));

          setFivesimConfigured(Boolean(s.fivesim_key_configured));
          setFivesimNgnRate(s.fivesim_ngn_rate || 25.0);
          setFivesimMarkupPercent(s.fivesim_markup_percent || 50);
          setFivesimMinMarginNgn(s.fivesim_min_margin_ngn || 200);
        }
      })
      .catch(console.error);
  }, [token]);

  const handleTestConnection = async (provider: 'peakerr' | 'eagainsmedia' | 'fivesim') => {
    if (!token) return;
    setTestingProvider(provider);
    try {
      const res = await fetch('/api/admin/provider/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ provider })
      });
      const data = await res.json();
      setTestResults(prev => ({ ...prev, [provider]: data }));
      if (data.success && !data.error) {
        showToast(
          `${data.provider}: Online! Balance: ${data.balance !== undefined ? data.balance : 'N/A'} ${data.currency || ''} (${data.latency_ms}ms)`,
          'success'
        );
      } else {
        showToast(`${data.provider || provider}: ${data.error || 'Connection failed'}`, 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Connection test error', 'error');
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        platform_name: platformName,
        primary_domain: primaryDomain,
        support_whatsapp: supportWhatsapp,
        maintenance_mode: maintenanceMode,
        min_deposit_ngn: Number(minDepositNgn),
        peakerr_api_url: peakerrApiUrl,
        eagainsmedia_api_url: eagainsmediaApiUrl,
        fivesim_ngn_rate: Number(fivesimNgnRate),
        fivesim_markup_percent: Number(fivesimMarkupPercent),
        fivesim_min_margin_ngn: Number(fivesimMinMarginNgn)
      };

      if (peakerrApiKey.trim()) {
        payload.peakerr_api_key = peakerrApiKey.trim();
      }
      if (eagainsmediaApiKey.trim()) {
        payload.eagainsmedia_api_key = eagainsmediaApiKey.trim();
      }
      if (fivesimApiKey.trim()) {
        payload.fivesim_api_key = fivesimApiKey.trim();
      }

      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast('System configuration & encrypted API keys saved successfully.', 'success');
        if (payload.peakerr_api_key) {
          setPeakerrConfigured(true);
          setPeakerrApiKey('');
        }
        if (payload.eagainsmedia_api_key) {
          setEagainsmediaConfigured(true);
          setEagainsmediaApiKey('');
        }
        if (payload.fivesim_api_key) {
          setFivesimConfigured(true);
          setFivesimApiKey('');
        }
      } else {
        showToast(data.error || 'Failed to save settings.', 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display text-white">System Settings & Upstream Providers</h1>
        <p className="text-xs text-slate-400 mt-1">
          Configure Peakerr SMM, Eagainsmedia SMM, 5sim Virtual Numbers, deposit limits, and support routing.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Brand & Financial Settings */}
        <div className="p-6 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-4">
          <h2 className="text-sm font-bold font-display text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-400" />
            <span>Brand Identity & Financial Parameters</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Platform Name
              </label>
              <input
                type="text"
                required
                value={platformName}
                onChange={e => setPlatformName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Primary Domain
              </label>
              <input
                type="text"
                required
                value={primaryDomain}
                onChange={e => setPrimaryDomain(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>Support WhatsApp Number</span>
              </label>
              <input
                type="text"
                required
                value={supportWhatsapp}
                onChange={e => setSupportWhatsapp(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-amber-400" />
                <span>Minimum NGN Deposit (₦)</span>
              </label>
              <input
                type="number"
                required
                min="10"
                value={minDepositNgn}
                onChange={e => setMinDepositNgn(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-amber-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">Configured to ₦100 minimum deposit threshold.</p>
            </div>
          </div>
        </div>

        {/* PROVIDER 1: PEAKERR SMM */}
        <div className="p-6 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-bold font-display text-white">Peakerr Provider Node (Primary SMM)</h2>
              {peakerrConfigured && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 text-[10px] font-bold">
                  Key Encrypted & Active
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleTestConnection('peakerr')}
              disabled={testingProvider === 'peakerr'}
              className="px-3 py-1.5 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-700/40 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Zap className={`w-3.5 h-3.5 ${testingProvider === 'peakerr' ? 'animate-spin' : ''}`} />
              <span>Test Peakerr Connection</span>
            </button>
          </div>

          {testResults.peakerr && (
            <div className={`p-3 rounded-xl text-xs font-mono border ${testResults.peakerr.error ? 'bg-rose-950/40 border-rose-800/40 text-rose-300' : 'bg-emerald-950/40 border-emerald-800/40 text-emerald-300'}`}>
              Status: {testResults.peakerr.is_live ? 'LIVE API' : 'MOCK / DEMO'} • Balance: {testResults.peakerr.balance} {testResults.peakerr.currency} • Latency: {testResults.peakerr.latency_ms}ms
              {testResults.peakerr.error && <div>Error: {testResults.peakerr.error}</div>}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Peakerr API Endpoint URL
              </label>
              <input
                type="text"
                required
                value={peakerrApiUrl}
                onChange={e => setPeakerrApiUrl(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Peakerr API Key {peakerrConfigured && '(leave blank to keep current encrypted key)'}
              </label>
              <input
                type="password"
                placeholder={peakerrConfigured ? '••••••••••••••••••••••••' : 'Enter Peakerr API key'}
                value={peakerrApiKey}
                onChange={e => setPeakerrApiKey(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* PROVIDER 2: EAGAINSMEDIA SMM */}
        <div className="p-6 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold font-display text-white">Eagainsmedia Provider Node (Secondary SMM)</h2>
              {eagainsmediaConfigured && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 text-[10px] font-bold">
                  Key Encrypted & Active
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleTestConnection('eagainsmedia')}
              disabled={testingProvider === 'eagainsmedia'}
              className="px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-700/40 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Zap className={`w-3.5 h-3.5 ${testingProvider === 'eagainsmedia' ? 'animate-spin' : ''}`} />
              <span>Test Eagainsmedia Connection</span>
            </button>
          </div>

          {testResults.eagainsmedia && (
            <div className={`p-3 rounded-xl text-xs font-mono border ${testResults.eagainsmedia.error ? 'bg-rose-950/40 border-rose-800/40 text-rose-300' : 'bg-emerald-950/40 border-emerald-800/40 text-emerald-300'}`}>
              Status: {testResults.eagainsmedia.is_live ? 'LIVE API' : 'MOCK / DEMO'} • Balance: {testResults.eagainsmedia.balance} {testResults.eagainsmedia.currency} • Latency: {testResults.eagainsmedia.latency_ms}ms
              {testResults.eagainsmedia.error && <div>Error: {testResults.eagainsmedia.error}</div>}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Eagainsmedia API Endpoint URL
              </label>
              <input
                type="text"
                required
                value={eagainsmediaApiUrl}
                onChange={e => setEagainsmediaApiUrl(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Eagainsmedia API Key {eagainsmediaConfigured && '(leave blank to keep current key)'}
              </label>
              <input
                type="password"
                placeholder={eagainsmediaConfigured ? '••••••••••••••••••••••••' : 'Enter Eagainsmedia API key'}
                value={eagainsmediaApiKey}
                onChange={e => setEagainsmediaApiKey(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* PROVIDER 3: 5SIM VIRTUAL NUMBERS */}
        <div className="p-6 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-bold font-display text-white">5sim.net Virtual Numbers & OTP Engine</h2>
              {fivesimConfigured && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 text-[10px] font-bold">
                  Key Encrypted & Active
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleTestConnection('fivesim')}
              disabled={testingProvider === 'fivesim'}
              className="px-3 py-1.5 rounded-lg bg-purple-950/60 hover:bg-purple-900/60 text-purple-300 border border-purple-700/40 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Zap className={`w-3.5 h-3.5 ${testingProvider === 'fivesim' ? 'animate-spin' : ''}`} />
              <span>Test 5sim Connection</span>
            </button>
          </div>

          {testResults.fivesim && (
            <div className={`p-3 rounded-xl text-xs font-mono border ${testResults.fivesim.error ? 'bg-rose-950/40 border-rose-800/40 text-rose-300' : 'bg-emerald-950/40 border-emerald-800/40 text-emerald-300'}`}>
              Status: {testResults.fivesim.is_live ? 'LIVE API' : 'MOCK / DEMO'} • Balance: {testResults.fivesim.balance} {testResults.fivesim.currency} • Latency: {testResults.fivesim.latency_ms}ms
              {testResults.fivesim.error && <div>Error: {testResults.fivesim.error}</div>}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                5sim API Token (Bearer Token) {fivesimConfigured && '(leave blank to keep current encrypted token)'}
              </label>
              <input
                type="password"
                placeholder={fivesimConfigured ? '••••••••••••••••••••••••' : 'Enter 5sim API token'}
                value={fivesimApiKey}
                onChange={e => setFivesimApiKey(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                5sim Unit Exchange Rate to NGN (₦ per unit)
              </label>
              <input
                type="number"
                step="0.1"
                required
                value={fivesimNgnRate}
                onChange={e => setFivesimNgnRate(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-purple-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">Converts 5sim native currency units to Nigerian Naira.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Markup Percentage (%)
              </label>
              <input
                type="number"
                required
                value={fivesimMarkupPercent}
                onChange={e => setFivesimMarkupPercent(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-purple-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">Added profit margin on top of upstream number cost.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Minimum Margin Floor (₦)
              </label>
              <input
                type="number"
                required
                value={fivesimMinMarginNgn}
                onChange={e => setFivesimMinMarginNgn(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-purple-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">Minimum profit guaranteed per virtual number order.</p>
            </div>
          </div>
        </div>

        {/* Platform Maintenance Mode */}
        <div className="p-4 rounded-2xl bg-[#0b0f19] border border-slate-800">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={maintenanceMode}
              onChange={e => setMaintenanceMode(e.target.checked)}
              className="rounded border-slate-800 bg-slate-900 text-indigo-600 focus:ring-0"
            />
            <div>
              <span className="text-xs font-bold text-white block">Platform Maintenance Mode</span>
              <span className="text-[11px] text-slate-400">
                When enabled, order placement is paused while admin operations continue.
              </span>
            </div>
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/25 transition cursor-pointer flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Saving System Configuration...' : 'Save All Settings & Providers'}</span>
        </button>
      </form>
    </div>
  );
};
