import React, { useState, useEffect } from 'react';
import {
  Zap,
  Shield,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Clock,
  Layers,
  ChevronRight,
  ExternalLink,
  MessageCircle,
  Play,
  TrendingUp,
  RefreshCw,
  Wallet
} from 'lucide-react';
import { Hero3DCanvas } from '../3d/Hero3DCanvas.js';
import { WhatsAppBadge } from '../layout/WhatsAppBadge.js';
import { useApp } from '../../context/AppContext.js';
import { Currency } from '../../types/index.js';

export const LandingPage: React.FC = () => {
  const { openAuthModal, currency, setCurrency, setOnboardingOpen, setActiveView, user } = useApp();
  const [services, setServices] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [legalModal, setLegalModal] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/services?currency=${currency}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) setServices(data.services || []);
      })
      .catch(console.error);

    fetch('/api/categories')
      .then(r => r.json())
      .then(data => {
        if (data.success) setCategories(data.categories || []);
      })
      .catch(console.error);
  }, [currency]);

  const filteredServices = services.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
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
    <div className="relative min-h-screen text-slate-100 selection:bg-indigo-500 selection:text-white">
      {/* Subtle futuristic background ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] bg-gradient-to-b from-indigo-950/20 via-cyan-950/10 to-transparent blur-3xl pointer-events-none -z-10" />

      {/* HERO SECTION */}
      <section className="relative pt-12 pb-20 md:pt-20 md:pb-28 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Value Proposition */}
            <div className="lg:col-span-7 space-y-6 text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 border border-indigo-500/30 text-xs font-semibold text-cyan-400 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span>Next-Gen Social Infrastructure — jftsocials.online</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold font-display tracking-tight text-white leading-[1.1]">
                Social Growth Infrastructure,{' '}
                <span className="bg-gradient-to-r from-cyan-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
                  Built for Speed.
                </span>
              </h1>

              <p className="text-base sm:text-lg text-slate-300 max-w-2xl leading-relaxed">
                Empowering brands, creators, and agencies with institutional-grade social media acceleration.
                Direct Peakerr v2 API fulfillment, real-time order tracking, and dual NGN & USDT settlement.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={() => (user ? setActiveView('new-order') : openAuthModal('register'))}
                  className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold text-sm shadow-xl shadow-indigo-600/25 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2.5 cursor-pointer"
                >
                  <span>{user ? 'Launch Order Engine' : 'Get Started Now'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setOnboardingOpen(true)}
                  className="px-5 py-3.5 rounded-xl bg-slate-900/80 hover:bg-slate-850 border border-slate-700/80 text-white font-semibold text-sm transition flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  <Play className="w-4 h-4 text-cyan-400 fill-current" />
                  <span>3D Onboarding Tour</span>
                </button>

                <a
                  href="https://wa.me/2347018409997?text=Hello%20JFT%20Socials%20Agent!%20I%20have%20an%20inquiry."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-3.5 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/30 text-emerald-300 font-semibold text-xs flex items-center gap-1.5 transition"
                >
                  <MessageCircle className="w-4 h-4 text-[#25D366] fill-current" />
                  <span>WhatsApp Agent</span>
                </a>
              </div>

              {/* Live Metric Badges */}
              <div className="pt-6 grid grid-cols-3 gap-4 border-t border-slate-800/80 max-w-xl">
                <div>
                  <div className="text-xl sm:text-2xl font-bold font-mono text-white">99.9%</div>
                  <div className="text-xs text-slate-400">Pipeline Uptime</div>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold font-mono text-cyan-400">&lt; 2 min</div>
                  <div className="text-xs text-slate-400">Instant Dispatch</div>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold font-mono text-indigo-300">₦2,000</div>
                  <div className="text-xs text-slate-400">Min Margin Floor</div>
                </div>
              </div>
            </div>

            {/* Right Column: Interactive 3D Canvas */}
            <div className="lg:col-span-5 relative flex items-center justify-center">
              <div className="relative w-full aspect-square max-w-[440px] rounded-3xl bg-slate-900/30 border border-slate-800/80 p-2 shadow-2xl backdrop-blur-sm overflow-hidden flex items-center justify-center">
                <Hero3DCanvas className="w-full h-full" />
                <div className="absolute bottom-4 left-4 right-4 p-3 rounded-xl bg-slate-950/80 backdrop-blur-md border border-slate-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-slate-300 font-mono">Live Node: peakerr.com/v2</span>
                  </div>
                  <span className="text-cyan-400 font-semibold">Interactive 3D</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHATSAPP SUPPORT HERO BANNER */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
        <WhatsAppBadge variant="banner" />
      </section>

      {/* PLATFORM VALUE HIGHLIGHTS */}
      <section className="py-12 border-y border-slate-800/80 bg-slate-950/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/60 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white font-display">Automated Peakerr Pipeline</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Direct upstream node synchronization handles high-volume requests with zero manual delay. Refill guarantees and live counters synchronized continuously.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/60 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-600/20 text-cyan-400 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white font-display">Transparent Pricing Engine</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Enforces a strict ₦2,000 minimum platform profit protection on all orders with clear payment fee accounting (3% deposit fee clearly segregated).
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/60 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white font-display">Dual NGN & USDT Settlement</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Fund via Paystack in Nigerian Naira or verify blockchain transfers in USDT (TRC-20) with separate ledger ledgers and strict server-side audit logs.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SERVICE CATALOG BROWSER */}
      <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-cyan-400 mb-1">
              Dynamic Service Network
            </div>
            <h2 className="text-3xl font-extrabold font-display text-white">
              Explore Available Services
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              All prices shown in <span className="text-white font-bold">{currency}</span> per 1,000 units with instant delivery.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search services..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 w-full sm:w-64"
            />
          </div>
        </div>

        {/* Platform Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {platforms.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedPlatform(p.id)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                selectedPlatform === p.id
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                  : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredServices.map(service => (
            <div
              key={service.id}
              className="p-5 rounded-2xl bg-[#0b0f19] border border-slate-800/80 hover:border-slate-700/80 transition-all flex flex-col justify-between space-y-4 group"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                    ID #{service.id.replace('srv_', '')}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {service.refill_supported && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                        Refill Guarantee
                      </span>
                    )}
                    {service.cancel_supported && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">
                        Cancel Allowed
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors line-clamp-2">
                  {service.name}
                </h3>
                <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                  {service.description}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-400">Price per 1,000 units</div>
                  <div className="text-base font-extrabold font-mono text-white">
                    {currency === 'NGN'
                      ? `₦${(service.price_per_1000 ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                      : `${(service.price_per_1000 ?? 0).toFixed(2)} USDT`}
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (user) {
                      setActiveView('new-order');
                    } else {
                      openAuthModal('login');
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Order</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-20 border-t border-slate-800/80 bg-slate-950/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <div className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
              Straightforward Architecture
            </div>
            <h2 className="text-3xl font-extrabold font-display text-white">
              How JFT Socials Operates
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              An institutional workflow built for speed and precision.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                step: '01',
                title: 'Create Account',
                desc: 'Register in seconds with immediate dual NGN and USDT wallet provision.'
              },
              {
                step: '02',
                title: 'Fund Wallet',
                desc: 'Instant Paystack card/bank funding or submit verified USDT TRC-20 crypto transactions.'
              },
              {
                step: '03',
                title: 'Select Service',
                desc: 'Browse dynamic categories, enter target URL/handle, and review exact pricing calculations.'
              },
              {
                step: '04',
                title: 'Watch Live Status',
                desc: 'Autonomous background polling updates start counts, remains, and completion in real-time.'
              }
            ].map(s => (
              <div key={s.step} className="p-6 rounded-2xl bg-[#0b0f19] border border-slate-800/80 space-y-3">
                <div className="text-2xl font-extrabold font-mono text-cyan-400">{s.step}</div>
                <h3 className="text-base font-bold text-white">{s.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ & REFUND PROTOCOL SUMMARY */}
      <section className="py-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center space-y-2">
          <div className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
            Clarity & Reliability
          </div>
          <h2 className="text-3xl font-extrabold font-display text-white">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-4">
          {[
            {
              q: 'How does the platform pricing formula work?',
              a: 'JFT Socials applies a percentage markup with a strict ₦2,000 minimum platform margin per individual transaction. For example, if provider cost is ₦1,000, 50% markup is ₦500, but our ₦2,000 floor increases the selling price to ₦3,000. If provider cost is ₦10,000, the 50% markup yields ₦15,000.'
            },
            {
              q: 'How does the Refund Policy work?',
              a: 'Customers do not receive instantaneous unverified one-click refunds. Instead, you contact support via ticket or our WhatsApp agent (+2347018409997). An administrator investigates the order on the provider ledger, confirms eligibility, and issues a credited refund directly to your platform wallet with full audit logging.'
            },
            {
              q: 'Do I have to refresh the page to see order updates?',
              a: 'No. JFT Socials features autonomous background polling. When you view your orders, active tasks refresh automatically every 8 seconds with start count and remaining units.'
            },
            {
              q: 'What deposit methods are supported?',
              a: 'We support Nigerian Naira (NGN) with instant Paystack checkout (cards, bank transfer, USSD) and USDT (TRC-20) cryptocurrency deposits with immutable wallet ledger accounting.'
            }
          ].map((faq, i) => (
            <div key={i} className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-2">
              <h3 className="text-sm font-bold text-white">{faq.q}</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-12 border-t border-slate-800/80 bg-[#07090e] text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                <Zap className="w-4 h-4" />
              </div>
              <span className="text-base font-extrabold font-display text-white">
                JFT SOCIALS
              </span>
              <span className="text-[11px] font-mono text-cyan-400">jftsocials.online</span>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <button
                onClick={() => setLegalModal('terms')}
                className="hover:text-white transition cursor-pointer"
              >
                Terms of Service
              </button>
              <button
                onClick={() => setLegalModal('privacy')}
                className="hover:text-white transition cursor-pointer"
              >
                Privacy Policy
              </button>
              <button
                onClick={() => setLegalModal('refund')}
                className="hover:text-white transition cursor-pointer"
              >
                Refund Policy
              </button>
              <button
                onClick={() => setLegalModal('acceptable')}
                className="hover:text-white transition cursor-pointer"
              >
                Acceptable Use Policy
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-900">
            <p>© {new Date().getFullYear()} JFT Socials (jftsocials.online). All rights reserved.</p>
            <p className="text-[11px] text-slate-500">
              Peakerr API v2 Integration • Direct WhatsApp Support: +2347018409997
            </p>
          </div>
        </div>
      </footer>

      {/* LEGAL MODAL */}
      {legalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-xl bg-[#0b0f19] border border-slate-800 rounded-2xl p-6 text-slate-200 max-h-[80vh] overflow-y-auto space-y-4">
            <button
              onClick={() => setLegalModal(null)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-white rounded"
            >
              ✕
            </button>
            <h3 className="text-lg font-bold text-white uppercase font-display">
              {legalModal === 'terms' && 'Terms of Service'}
              {legalModal === 'privacy' && 'Privacy Policy'}
              {legalModal === 'refund' && 'Refund & Investigation Policy'}
              {legalModal === 'acceptable' && 'Acceptable Use Policy'}
            </h3>
            <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
              {legalModal === 'refund' ? (
                <>
                  <p>
                    <strong>1. No Automatic Instant Refunds:</strong> To maintain operational integrity and prevent duplicate financial reversals, customers cannot initiate instant automated refunds directly from their dashboards.
                  </p>
                  <p>
                    <strong>2. Investigation Flow:</strong> Customers experiencing order delays, partial delivery, or drops must submit a Support Ticket or contact our verified WhatsApp agent at <strong>+2347018409997</strong>.
                  </p>
                  <p>
                    <strong>3. Admin Resolution:</strong> A platform administrator reviews the upstream Peakerr order ID. If approved, the refund is credited directly to the customer's wallet balance in the original currency (NGN or USDT) and recorded in the double-entry transaction ledger.
                  </p>
                </>
              ) : legalModal === 'acceptable' ? (
                <>
                  <p>
                    JFT Socials prohibits any use of our service that violates applicable international laws or promotes fraud, hate speech, defamation, or spam.
                  </p>
                  <p>
                    Services are provided strictly for marketing and algorithmic reach enhancement. JFT Socials makes no warranty of permanent account safety or viral success.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    By accessing or utilizing JFT Socials (jftsocials.online), you agree to be bound by our operating guidelines, service minimums, and platform terms.
                  </p>
                  <p>
                    All services are executed through verified upstream API nodes. Financial transactions are conducted under strict server-side authorization.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
