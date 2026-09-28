import React, { useState } from 'react';
import { X, Lock, Mail, User, ArrowRight, Zap } from 'lucide-react';
import { useApp } from '../../context/AppContext.js';
import { LegalContent, LEGAL_TITLES, LegalKey } from '../common/LegalContent.js';

export const AuthModal: React.FC = () => {
  const { authModalOpen, setAuthModalOpen, authMode, login, showToast } = useApp();
  const [mode, setMode] = useState<'login' | 'register'>(authMode);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [legalView, setLegalView] = useState<LegalKey | null>(null);

  if (!authModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      if (mode === 'register') {
        if (!termsAccepted) {
          setErrorMsg('Please agree to the Terms of Service and Acceptable Use Policy.');
          setLoading(false);
          return;
        }

        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, username, email, password })
        });

        const data = await res.json();
        if (!data.success) {
          setErrorMsg(data.error || 'Registration failed.');
          setLoading(false);
          return;
        }

        login(data.token, data.user);
      } else {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ login: email || username, password })
        });

        const data = await res.json();
        if (!data.success) {
          setErrorMsg(data.error || 'Login failed.');
          setLoading(false);
          return;
        }

        login(data.token, data.user);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Connection error.');
    } finally {
      setLoading(false);
    }
  };

  // NOTE: one-click demo/admin logins were removed. A public "Admin Console"
  // button with a hardcoded password is an open door to the money controls.
  // Admins sign in with their own credentials like everyone else.

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-md bg-[#0b0f19] border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 text-slate-100">
        <button
          onClick={() => setAuthModalOpen(false)}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          aria-label="Close auth dialog"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-400 p-[1px] shadow-lg shadow-indigo-500/30">
            <div className="w-full h-full bg-[#07090e] rounded-[11px] flex items-center justify-center">
              <Zap className="w-5 h-5 text-cyan-400" />
            </div>
          </div>
          <h2 className="text-xl font-bold font-display tracking-tight text-white">
            {mode === 'login' ? 'Sign in to JFT Socials' : 'Create your JFT Socials Account'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {mode === 'login'
              ? 'Access your multi-currency wallet & order pipeline'
              : 'Instant registration. Dual NGN & USDT wallet setup included.'}
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. David Cole"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Username</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-slate-400">@</span>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="david_growth"
                    className="w-full pl-8 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              {mode === 'login' ? 'Email or Username' : 'Email Address'}
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type={mode === 'register' ? 'email' : 'text'}
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={mode === 'register' ? 'name@example.com' : 'Enter email or username'}
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
          </div>

          {mode === 'register' && (
            <div className="flex items-start gap-2 pt-1">
              <input
                type="checkbox"
                id="terms"
                checked={termsAccepted}
                onChange={e => setTermsAccepted(e.target.checked)}
                className="mt-0.5 rounded border-slate-800 bg-slate-900 text-indigo-600 focus:ring-0"
              />
              <label htmlFor="terms" className="text-[11px] text-slate-400 leading-tight">
                I accept the{' '}
                <span className="text-cyan-400 hover:underline cursor-pointer" onClick={e => { e.preventDefault(); setLegalView('terms'); }}>Terms of Service</span>,{' '}
                <span className="text-cyan-400 hover:underline cursor-pointer" onClick={e => { e.preventDefault(); setLegalView('refund'); }}>Refund Policy</span>, and{' '}
                <span className="text-cyan-400 hover:underline cursor-pointer" onClick={e => { e.preventDefault(); setLegalView('acceptable'); }}>Acceptable Use Policy</span>.
              </label>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-semibold text-xs transition shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>{mode === 'login' ? 'Sign In to Account' : 'Complete Registration'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Mode Switcher */}
        <div className="mt-4 text-center text-xs text-slate-400">
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <button
                onClick={() => setMode('register')}
                className="text-cyan-400 hover:text-cyan-300 font-semibold transition"
              >
                Sign Up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => setMode('login')}
                className="text-cyan-400 hover:text-cyan-300 font-semibold transition"
              >
                Log In
              </button>
            </>
          )}
        </div>

        {/* Legal viewer (terms / refund / acceptable use) */}
        {legalView && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <div className="relative w-full max-w-md bg-[#0b0f19] border border-slate-800 rounded-2xl p-6 text-slate-100 shadow-2xl">
              <button
                onClick={() => setLegalView(null)}
                className="absolute top-4 right-4 p-1 text-slate-400 hover:text-white"
              >
                ✕
              </button>
              <h3 className="text-base font-bold text-white uppercase font-display mb-3">
                {LEGAL_TITLES[legalView]}
              </h3>
              <div className="text-xs text-slate-300 space-y-2 leading-relaxed max-h-[50vh] overflow-y-auto">
                <LegalContent which={legalView} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
