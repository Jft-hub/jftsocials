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

// Public Views
import { LandingPage } from './components/public/LandingPage.js';

// Customer Views
import { CustomerDashboard } from './components/customer/CustomerDashboard.js';
import { NewOrderView } from './components/customer/NewOrderView.js';
import { VirtualNumbersView } from './components/customer/VirtualNumbersView.js';
import { OrdersView } from './components/customer/OrdersView.js';
import { ServicesView } from './components/customer/ServicesView.js';
import { WalletView } from './components/customer/WalletView.js';
import { SupportView } from './components/customer/SupportView.js';
import { ProfileView } from './components/customer/ProfileView.js';
import { AccountsStoreView } from './components/customer/AccountsStoreView.js';
import { MyAccountsView } from './components/customer/MyAccountsView.js';

// Admin Views
import { AdminDashboard } from './components/admin/AdminDashboard.js';
import { AdminOrdersView } from './components/admin/AdminOrdersView.js';
import { AdminAccountsView } from './components/admin/AdminAccountsView.js';
import { AdminServicesView } from './components/admin/AdminServicesView.js';
import { AdminPricingView } from './components/admin/AdminPricingView.js';
import { AdminPaymentsView } from './components/admin/AdminPaymentsView.js';
import { AdminUsersView } from './components/admin/AdminUsersView.js';
import { AdminSupportView } from './components/admin/AdminSupportView.js';
import { AdminSettingsView } from './components/admin/AdminSettingsView.js';
import { AdminAuditLogsView } from './components/admin/AdminAuditLogsView.js';

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
            {renderCurrentView()}
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
