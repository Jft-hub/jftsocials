import React, { useState, useEffect } from 'react';
import {
  Zap,
  Bell,
  Wallet as WalletIcon,
  Shield,
  User as UserIcon,
  LogOut,
  ChevronDown,
  ExternalLink,
  Sparkles,
  Menu,
  X,
  Check,
  Globe
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';
import { Currency } from '../../types/index.js';

export const Navbar: React.FC<{ onToggleSidebar?: () => void; isSidebarOpen?: boolean }> = ({
  onToggleSidebar,
  isSidebarOpen
}) => {
  const {
    user,
    currency,
    setCurrency,
    wallets,
    notifications,
    unreadCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    logout,
    openAuthModal,
    activeView,
    setActiveView,
    isAdminMode,
    setIsAdminMode,
    setOnboardingOpen
  } = useApp();

  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  // Live platform status (booleans only - no balances leak to the client).
  const [netStatus, setNetStatus] = useState<{ ordering_ok: boolean; any_live: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/public/status');
        const data = await res.json();
        if (!cancelled && data && data.success) {
          setNetStatus({
            ordering_ok: Boolean(data.ordering_ok),
            any_live: Boolean(data.peakerr_live || data.eagainsmedia_live)
          });
        }
      } catch {
        // badge keeps its last known state
      }
    };
    load();
    const timer = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Active wallet balance based on selected currency
  const activeWallet = wallets.find(w => w.currency === currency);
  const rawBalance = activeWallet?.available_balance;
  const numBalance = typeof rawBalance === 'number' && !isNaN(rawBalance) ? rawBalance : 0;
  const formattedBalance = currency === 'NGN'
    ? `₦${numBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    : `${numBalance.toFixed(2)} USDT`;

  const isPrivileged = user && ['admin', 'superadmin', 'manager'].includes(user.role);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#07090e]/90 backdrop-blur-xl transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: Brand Logo & Domain */}
        <div className="flex items-center gap-3">
          {user && onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 focus:outline-none"
              aria-label="Toggle Navigation"
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          )}

          <div
            onClick={() => setActiveView(user ? (isAdminMode ? 'admin-dashboard' : 'dashboard') : 'landing')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-cyan-500 p-[1px] shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/30 transition">
              <div className="w-full h-full bg-[#07090e] rounded-[11px] flex items-center justify-center">
                <Zap className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold font-display tracking-tight text-white group-hover:text-cyan-300 transition-colors">
                  JFT SOCIALS
                </span>
                <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  jftsocials.online
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Live Status Indicator (real upstream state, no hardcoded claims) */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 text-xs text-slate-300">
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${netStatus && !netStatus.ordering_ok ? (netStatus.any_live ? 'bg-amber-400' : 'bg-rose-400') : 'bg-emerald-400'}`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${netStatus && !netStatus.ordering_ok ? (netStatus.any_live ? 'bg-amber-500' : 'bg-rose-500') : 'bg-emerald-500'}`}></span>
          </span>
          <span className="font-medium text-slate-300">Network:</span>
          <span className={`font-semibold ${netStatus ? (netStatus.ordering_ok ? 'text-emerald-400' : netStatus.any_live ? 'text-amber-400' : 'text-rose-400') : 'text-slate-400'}`}>
            {!netStatus ? 'Checking…' : netStatus.ordering_ok ? 'Operational' : netStatus.any_live ? 'Limited' : 'Offline'}
          </span>
        </div>

        {/* Right Action Stack */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* 3D Walkthrough Trigger */}
          <button
            onClick={() => setOnboardingOpen(true)}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800/40 hover:bg-slate-800 border border-slate-700/60 transition"
            title="Interactive 3D Onboarding Walkthrough"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>3D Experience</span>
          </button>

          {/* Currency Switcher */}
          <div className="flex items-center p-0.5 bg-slate-900/90 border border-slate-800 rounded-lg text-xs font-semibold">
            <button
              onClick={() => setCurrency('NGN')}
              className={`px-2.5 py-1 rounded-md transition ${
                currency === 'NGN'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ₦ NGN
            </button>
            <button
              onClick={() => setCurrency('USDT')}
              className={`px-2.5 py-1 rounded-md transition ${
                currency === 'USDT'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              USDT
            </button>
          </div>

          {/* Logged in User Controls */}
          {user ? (
            <>
              {/* Wallet Pill */}
              <button
                onClick={() => {
                  setIsAdminMode(false);
                  setActiveView('wallet');
                }}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-850 border border-indigo-500/20 text-xs font-medium transition cursor-pointer"
                title="Manage Wallet & Add Funds"
              >
                <div className="w-5 h-5 rounded-md bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                  <WalletIcon className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <div className="text-[10px] text-slate-400 font-normal">Balance</div>
                  <div className="font-bold text-white font-mono">{formattedBalance}</div>
                </div>
              </button>

              {/* Notifications Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setNotifDropdownOpen(prev => !prev)}
                  className="relative p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 border border-transparent hover:border-slate-700/60 transition"
                  aria-label="Notifications"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-cyan-400 ring-2 ring-[#07090e]" />
                  )}
                </button>

                {notifDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-[#0b0f19] border border-slate-800 shadow-2xl p-4 text-xs z-50">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                      <div className="font-semibold text-white">System Notifications</div>
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllNotificationsAsRead}
                          className="text-cyan-400 hover:text-cyan-300 text-[11px]"
                        >
                          Mark all as read
                        </button>
                      )}
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-800/60 py-2">
                      {notifications.length === 0 ? (
                        <div className="py-6 text-center text-slate-400">No notifications yet.</div>
                      ) : (
                        notifications.slice(0, 8).map(n => (
                          <div
                            key={n.id}
                            onClick={() => {
                              markNotificationAsRead(n.id);
                              if (n.link) {
                                setActiveView(n.link.replace('/', ''));
                                setNotifDropdownOpen(false);
                              }
                            }}
                            className={`py-2.5 px-2 rounded-lg cursor-pointer transition ${
                              n.read ? 'opacity-60 hover:bg-slate-850/40' : 'bg-slate-850/60 hover:bg-slate-850'
                            }`}
                          >
                            <div className="font-semibold text-slate-200 flex items-center justify-between">
                              <span>{n.title}</span>
                              <span className="text-[10px] text-slate-400">
                                {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-slate-300 text-[11px] mt-0.5">{n.message}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* User Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setUserDropdownOpen(prev => !prev)}
                  className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-xl bg-slate-900/80 hover:bg-slate-850 border border-slate-800 text-xs transition"
                >
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center font-bold text-white uppercase text-[11px]">
                    {user.name.charAt(0)}
                  </div>
                  <span className="hidden md:inline font-medium text-slate-200 max-w-[100px] truncate">
                    {user.name}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {userDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-[#0b0f19] border border-slate-800 shadow-2xl p-2 text-xs z-50">
                    <div className="px-3 py-2 border-b border-slate-800">
                      <div className="font-semibold text-white truncate">{user.name}</div>
                      <div className="text-[10px] text-slate-400 truncate">{user.email}</div>
                      <div className="mt-1">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {user.role}
                        </span>
                      </div>
                    </div>

                    <div className="py-1">
                      {isPrivileged && (
                        <button
                          onClick={() => {
                            setIsAdminMode(!isAdminMode);
                            setActiveView(isAdminMode ? 'dashboard' : 'admin-dashboard');
                            setUserDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg font-medium text-cyan-400 hover:bg-slate-800 flex items-center gap-2 transition"
                        >
                          <Shield className="w-4 h-4 text-cyan-400" />
                          <span>{isAdminMode ? 'Switch to Customer View' : 'Switch to Admin Panel'}</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setIsAdminMode(false);
                          setActiveView('dashboard');
                          setUserDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg text-slate-200 hover:bg-slate-800 flex items-center gap-2 transition"
                      >
                        <UserIcon className="w-4 h-4 text-slate-400" />
                        <span>My Dashboard</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsAdminMode(false);
                          setActiveView('wallet');
                          setUserDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg text-slate-200 hover:bg-slate-800 flex items-center gap-2 transition"
                      >
                        <WalletIcon className="w-4 h-4 text-slate-400" />
                        <span>Wallet & Transactions</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsAdminMode(false);
                          setActiveView('profile');
                          setUserDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg text-slate-200 hover:bg-slate-800 flex items-center gap-2 transition"
                      >
                        <UserIcon className="w-4 h-4 text-slate-400" />
                        <span>Profile & Security</span>
                      </button>
                    </div>

                    <div className="pt-1 border-t border-slate-800">
                      <button
                        onClick={() => {
                          setUserDropdownOpen(false);
                          logout();
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg text-rose-400 hover:bg-rose-950/30 flex items-center gap-2 transition"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => openAuthModal('login')}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/60 transition cursor-pointer"
              >
                Sign In
              </button>
              <button
                onClick={() => openAuthModal('register')}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 shadow-md shadow-indigo-500/20 transition cursor-pointer"
              >
                Get Started
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
