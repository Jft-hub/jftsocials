import React, { useState, lazy, Suspense } from 'react';
import { AppProvider, useApp } from './context/AppContext.js';
import { Navbar } from './components/layout/Navbar.js';
import { Sidebar } from './components/layout/Sidebar.js';
import { WhatsAppBadge } from './components/layout/WhatsAppBadge.js';
// Lazy: three.js stays out of the first-paint bundle entirely.
const Onboarding3DModal = lazy(() =>
  import('./components/3d/Onboarding3DModal.js').then(m => ({ default: m.Onboarding3DModal }))
);
import { AuthModal } from './components/auth/AuthModal.js';
import { ErrorBoundary } from './components/common/ErrorBoundary.js';

// Route-level code splitting: every view below downloads only when first
// opened. The shell (nav, sidebar, auth, toasts) stays in the entry bundle
// so first paint is a fraction of the old 1.4MB download. three.js and
// recharts ride inside their views' chunks, never the landing bundle.
const lazyView = <T extends React.ComponentType<any>>(loader: () => Promise<{ [k: string]: T }>, name: string) =>
  lazy(() => loader().then(m => ({ default: m[name] as T })));

// Public Views
const LandingPage = lazyView(() => import('./components/public/LandingPage.js'), 'LandingPage');

// Customer Views
const CustomerDashboard = lazyView(() => import('./components/customer/CustomerDashboard.js'), 'CustomerDashboard');
const NewOrderView = lazyView(() => import('./components/customer/NewOrderView.js'), 'NewOrderView');
const VirtualNumbersView = lazyView(() => import('./components/customer/VirtualNumbersView.js'), 'VirtualNumbersView');
const OrdersView = lazyView(() => import('./components/customer/OrdersView.js'), 'OrdersView');
const ServicesView = lazyView(() => import('./components/customer/ServicesView.js'), 'ServicesView');
const WalletView = lazyView(() => import('./components/customer/WalletView.js'), 'WalletView');
const SupportView = lazyView(() => import('./components/customer/SupportView.js'), 'SupportView');
const ProfileView = lazyView(() => import('./components/customer/ProfileView.js'), 'ProfileView');
const AccountsStoreView = lazyView(() => import('./components/customer/AccountsStoreView.js'), 'AccountsStoreView');
const MyAccountsView = lazyView(() => import('./components/customer/MyAccountsView.js'), 'MyAccountsView');

// Admin Views
const AdminDashboard = lazyView(() => import('./components/admin/AdminDashboard.js'), 'AdminDashboard');
const AdminOrdersView = lazyView(() => import('./components/admin/AdminOrdersView.js'), 'AdminOrdersView');
const AdminAccountsView = lazyView(() => import('./components/admin/AdminAccountsView.js'), 'AdminAccountsView');
const AdminServicesView = lazyView(() => import('./components/admin/AdminServicesView.js'), 'AdminServicesView');
const AdminPricingView = lazyView(() => import('./components/admin/AdminPricingView.js'), 'AdminPricingView');
const AdminPaymentsView = lazyView(() => import('./components/admin/AdminPaymentsView.js'), 'AdminPaymentsView');
const AdminUsersView = lazyView(() => import('./components/admin/AdminUsersView.js'), 'AdminUsersView');
const AdminSupportView = lazyView(() => import('./components/admin/AdminSupportView.js'), 'AdminSupportView');
const AdminSettingsView = lazyView(() => import('./components/admin/AdminSettingsView.js'), 'AdminSettingsView');
const AdminAuditLogsView = lazyView(() => import('./components/admin/AdminAuditLogsView.js'), 'AdminAuditLogsView');

const ViewFallback: React.FC = () => (
  <div className="w-full py-20 flex flex-col items-center justify-center gap-3">
    <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 animate-pulse" />
    <div className="text-xs text-slate-500">Loading view…</div>
  </div>
);

const MainLayout: React.FC = () => {
  const { user, activeView, toast } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isPublicLanding = activeView === 'landing' && !user;

  const renderCurrentView = () => {
    switch (activeView) {
      // Public / Guest
      case 'landing':
        return <LandingPage />;

      // Customer Views
      case 'dashboard':
        return <CustomerDashboard />;
      case 'new-order':
        return <NewOrderView />;
      case 'virtual-numbers':
        return <VirtualNumbersView />;
      case 'accounts-store':
        return <AccountsStoreView />;
      case 'my-accounts':
        return <MyAccountsView />;
      case 'orders':
        return <OrdersView />;
      case 'services':
        return <ServicesView />;
      case 'wallet':
        return <WalletView />;
      case 'support':
        return <SupportView />;
      case 'profile':
        return <ProfileView />;

      // Admin Views
      case 'admin-dashboard':
        return <AdminDashboard />;
      case 'admin-orders':
        return <AdminOrdersView />;
      case 'admin-accounts':
        return <AdminAccountsView />;
      case 'admin-services':
        return <AdminServicesView />;
      case 'admin-pricing':
        return <AdminPricingView />;
      case 'admin-payments':
        return <AdminPaymentsView />;
      case 'admin-users':
        return <AdminUsersView />;
      case 'admin-support':
        return <AdminSupportView />;
      case 'admin-settings':
        return <AdminSettingsView />;
      case 'admin-audit-logs':
        return <AdminAuditLogsView />;

      default:
        return user ? <CustomerDashboard /> : <LandingPage />;
    }
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation Bar */}
      <Navbar
        onToggleSidebar={() => setSidebarOpen(prev => !prev)}
        isSidebarOpen={sidebarOpen}
      />

      {/* Main Layout Area */}
      <div className="flex-1 flex">
        {/* Sidebar (shown when user is authenticated) */}
        {user && (
          <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        )}

        {/* Content Container */}
        <main
          className={`flex-1 transition-all duration-200 ${
            user ? 'md:ml-64 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full' : 'w-full'
          }`}
        >
          <ErrorBoundary fallbackTitle="View Failed to Render">
            <Suspense fallback={<ViewFallback />}>
              {renderCurrentView()}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      {/* Global Interactive 3D Onboarding Modal */}
      <Suspense fallback={null}>
        <Onboarding3DModal />
      </Suspense>

      {/* Authentication Modal */}
      <AuthModal />

      {/* Persistent WhatsApp Support Badge */}
      <WhatsAppBadge />

      {/* Global System Toast Notification */}
      {toast && (
        <div className="fixed top-20 right-5 z-50 animate-bounce">
          <div
            className={`px-4 py-3 rounded-xl text-xs font-semibold shadow-2xl flex items-center gap-2 border ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50'
                : toast.type === 'error'
                ? 'bg-rose-950/90 text-rose-300 border-rose-500/50'
                : 'bg-slate-900/90 text-cyan-300 border-cyan-500/50'
            }`}
          >
            <span>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export function App() {
  return (
    <ErrorBoundary fallbackTitle="JFT Socials Platform Recovery">
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;
