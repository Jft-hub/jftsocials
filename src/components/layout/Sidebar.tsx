import React from 'react';
import {
  LayoutDashboard,
  PlusCircle,
  ListOrdered,
  Layers,
  Wallet,
  Headphones,
  User,
  Shield,
  Sliders,
  DollarSign,
  CreditCard,
  Users,
  Settings,
  FileText,
  MessageCircle,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  PhoneCall,
  ShoppingBag,
  KeyRound
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { activeView, setActiveView, user, isAdminMode, setIsAdminMode } = useApp();

  const isPrivileged = user && ['admin', 'superadmin', 'manager'].includes(user.role);

  const customerNav = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'new-order', label: 'New Order', icon: PlusCircle, badge: 'Instant' },
    { id: 'virtual-numbers', label: 'Virtual Numbers', icon: PhoneCall, badge: 'OTP SMS' },
    { id: 'accounts-store', label: 'Account Store', icon: ShoppingBag, badge: 'TikTok' },
    { id: 'my-accounts', label: 'My Accounts', icon: KeyRound },
    { id: 'orders', label: 'My Orders', icon: ListOrdered },
    { id: 'services', label: 'Service Catalog', icon: Layers },
    { id: 'wallet', label: 'Wallet & Deposits', icon: Wallet },
    { id: 'support', label: 'Support & Help', icon: Headphones },
    { id: 'profile', label: 'Profile & Security', icon: User }
  ];

  const adminNav = [
    { id: 'admin-dashboard', label: 'Admin Overview', icon: LayoutDashboard },
    { id: 'admin-orders', label: 'Orders Control', icon: ListOrdered },
    { id: 'admin-accounts', label: 'Account Stock', icon: KeyRound, badge: 'Stock' },
    { id: 'admin-services', label: 'Services & Sync', icon: Layers },
    { id: 'admin-pricing', label: 'Pricing & Calculator', icon: DollarSign, badge: '₦2k Min' },
    { id: 'admin-payments', label: 'Payments & Crypto', icon: CreditCard },
    { id: 'admin-users', label: 'Users & Wallets', icon: Users },
    { id: 'admin-support', label: 'Support Tickets', icon: Headphones },
    { id: 'admin-settings', label: 'System Settings', icon: Settings },
    { id: 'admin-audit-logs', label: 'Audit Logs', icon: FileText }
  ];

  const currentNav = isAdminMode ? adminNav : customerNav;

  const handleNavClick = (viewId: string) => {
    setActiveView(viewId);
    onClose();
  };

  const whatsappNumber = '+2347018409997';
  const whatsappUrl = `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hello JFT Socials Support! I need assistance with my account.')}`;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-16 bottom-0 left-0 z-40 w-64 bg-[#07090e] border-r border-slate-800/80 flex flex-col transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Privilege Mode Switcher Banner (if user is admin) */}
        {isPrivileged && (
          <div className="p-3 border-b border-slate-800/80">
            <button
              onClick={() => {
                const nextMode = !isAdminMode;
                setIsAdminMode(nextMode);
                setActiveView(nextMode ? 'admin-dashboard' : 'dashboard');
              }}
              className={`w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                isAdminMode
                  ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/50 border border-indigo-500/30'
              }`}
            >
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                <span>{isAdminMode ? 'Administrator Panel' : 'Customer View'}</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 opacity-70" />
            </button>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {isAdminMode ? 'Platform Management' : 'Customer Portal'}
          </div>

          {currentNav.map(item => {
            const Icon = item.icon;
            const isActive = activeView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white font-semibold shadow-md shadow-indigo-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-900/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-indigo-500/10 text-cyan-400 border border-indigo-500/20'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer Support Hub with direct WhatsApp Agent Contact */}
        <div className="p-3 border-t border-slate-800/80 bg-[#090d16]/60">
          <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-950/20 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#25D366]/20 flex items-center justify-center text-[#25D366]">
                <MessageCircle className="w-4 h-4 fill-current" />
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold text-white">Direct Agent</div>
                <div className="text-[10px] text-emerald-400 font-mono font-medium">WhatsApp Support</div>
              </div>
            </div>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-1.5 px-2.5 rounded-lg bg-[#25D366] hover:bg-[#20ba59] text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 transition shadow-sm"
            >
              <span>{whatsappNumber}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </aside>
    </>
  );
};
