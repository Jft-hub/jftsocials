import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, Wallet, Order, Currency, NotificationItem, SystemSettings } from '../types/index.js';

interface AppContextType {
  user: User | null;
  token: string | null;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  wallets: Wallet[];
  orders: Order[];
  notifications: NotificationItem[];
  settings: SystemSettings | null;
  unreadCount: number;
  login: (token: string, user: User) => void;
  logout: () => void;
  refreshUserData: () => Promise<void>;
  refreshOrders: () => Promise<void>;
  markNotificationAsRead: (id: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  toast: { msg: string; type: 'success' | 'error' | 'info' } | null;
  activeView: string;
  setActiveView: (view: string) => void;
  orderServicePreset: { serviceId: string } | null;
  setOrderServicePreset: (preset: { serviceId: string } | null) => void;
  isAdminMode: boolean;
  setIsAdminMode: (admin: boolean) => void;
  openAuthModal: (mode?: 'login' | 'register') => void;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  authMode: 'login' | 'register';
  onboardingOpen: boolean;
  setOnboardingOpen: (open: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('jft_token'));
  const [currency, setCurrency] = useState<Currency>('NGN');
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [activeView, setActiveView] = useState<string>('landing');
  // Service pre-selected from the catalog's "Order Now" button. Consumed once
  // by the New Order form (which also clears it), so the exact chosen service
  // is what lands in the order - never the cheapest-default fallback.
  const [orderServicePreset, setOrderServicePreset] = useState<{ serviceId: string } | null>(null);
  const [isAdminMode, setIsAdminMode] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [onboardingOpen, setOnboardingOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => {
      setToast(prev => (prev?.msg === msg ? null : prev));
    }, 4500);
  }, []);

  const openAuthModal = useCallback((mode: 'login' | 'register' = 'login') => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  }, []);

  // Fetch Public Settings
  useEffect(() => {
    fetch('/api/public/config')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setSettings(data);
        }
      })
      .catch(err => console.error('Failed to load public config:', err));
  }, []);

  // Fetch User Info
  const refreshUserData = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        setWallets(data.wallets || []);
      } else {
        // Expired session
        localStorage.removeItem('jft_token');
        setToken(null);
        setUser(null);
      }
    } catch (e) {
      console.error('Error refreshing user data:', e);
    }
  }, [token]);

  // Fetch Orders
  const refreshOrders = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/orders', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setOrders(data.orders || []);
      }
    } catch (e) {
      console.error('Error refreshing orders:', e);
    }
  }, [token]);

  // Fetch Notifications
  const refreshNotifications = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setNotifications(data.notifications || []);
      }
    } catch (e) {
      console.error('Error refreshing notifications:', e);
    }
  }, [token]);

  // Initial session restoration when token is present
  useEffect(() => {
    if (token) {
      refreshUserData();
      refreshOrders();
      refreshNotifications();
    }
  }, [token, refreshUserData, refreshOrders, refreshNotifications]);

  // Auto-polling for live order updates every 25 seconds when authenticated.
  // (Was 8s: three API calls every 8 seconds per open tab was hammering the
  // small server and slowing the whole site for everyone.)
  useEffect(() => {
    if (!token) return;

    const timer = setInterval(() => {
      refreshOrders();
      refreshUserData();
      refreshNotifications();
    }, 25000);

    return () => clearInterval(timer);
  }, [token, refreshUserData, refreshOrders, refreshNotifications]);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('jft_token', newToken);
    setToken(newToken);
    setUser(newUser);
    setAuthModalOpen(false);
    showToast(`Welcome back, ${newUser.name}!`, 'success');
    if (['admin', 'superadmin'].includes(newUser.role)) {
      setActiveView('admin-dashboard');
      setIsAdminMode(true);
    } else {
      setActiveView('dashboard');
      setIsAdminMode(false);
    }
  };

  const logout = async () => {
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (e) {
        // ignore
      }
    }
    localStorage.removeItem('jft_token');
    setToken(null);
    setUser(null);
    setWallets([]);
    setOrders([]);
    setIsAdminMode(false);
    setActiveView('landing');
    showToast('You have been logged out securely.', 'info');
  };

  const markNotificationAsRead = async (id: string) => {
    if (!token) return;
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (e) {
      console.error(e);
    }
  };

  const markAllNotificationsAsRead = async () => {
    if (!token) return;
    try {
      await fetch(`/api/notifications/read-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (e) {
      console.error(e);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <AppContext.Provider
      value={{
        user,
        token,
        currency,
        setCurrency,
        wallets,
        orders,
        notifications,
        settings,
        unreadCount,
        login,
        logout,
        refreshUserData,
        refreshOrders,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        showToast,
        toast,
        activeView,
        setActiveView,
        orderServicePreset,
        setOrderServicePreset,
        isAdminMode,
        setIsAdminMode,
        openAuthModal,
        authModalOpen,
        setAuthModalOpen,
        authMode,
        onboardingOpen,
        setOnboardingOpen
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
