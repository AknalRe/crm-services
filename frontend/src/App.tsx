import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import QRCodeModal from './components/QRCodeModal';
import { PlansModal } from './components/PlansModal';
import { SetupLoginGate } from './components/SetupLoginGate';
import { LicenseActivationScreen } from './components/LicenseActivationScreen';
import { ToastProvider } from './components/ui/ToastProvider';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import Broadcasts from './pages/Broadcasts';
import BirthdayAutomation from './pages/BirthdayAutomation';
import Tracking from './pages/Tracking';
import Conversations from './pages/Conversations';
import Settings from './pages/Settings';
import PublicCsatPage from './pages/PublicCsatPage';
import api from './services/api';
import { subscribeLiveEvent } from './services/liveEvents';
import { AuthStatus, WahaStatus, LicenseInfo } from './types';

const VALID_TABS = new Set([
  'dashboard',
  'contacts',
  'broadcasts',
  'birthday',
  'tracking',
  'conversations',
  'settings',
]);

function getInitialTab(): string {
  if (typeof window === 'undefined') return 'dashboard';
  const hashTab = window.location.hash.replace(/^#/, '').trim();
  if (VALID_TABS.has(hashTab)) return hashTab;
  try {
    const saved = localStorage.getItem('crm_current_tab') || '';
    if (VALID_TABS.has(saved)) return saved;
  } catch {
    // Ignore storage access error
  }
  return 'dashboard';
}

function AppShell() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentTab, setCurrentTabState] = useState<string>(getInitialTab);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const setCurrentTab = (tab: string) => {
    const next = VALID_TABS.has(tab) ? tab : 'dashboard';
    setCurrentTabState(next);
    try {
      localStorage.setItem('crm_current_tab', next);
    } catch {
      // Ignore storage error
    }
    if (typeof window !== 'undefined' && window.location.hash !== `#${next}`) {
      window.history.replaceState(null, '', `#${next}`);
    }
  };

  const [wahaStatus, setWahaStatus] = useState<WahaStatus | null>(null);
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrSessionName, setQrSessionName] = useState<string | undefined>(undefined);
  const [isPlansModalOpen, setIsPlansModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [preselectedContactIds, setPreselectedContactIds] = useState<string[]>([]);

  const fetchWahaStatus = async () => {
    try {
      const status = await api.getWahaStatus();
      setWahaStatus(status);
    } catch (err) {
      console.error('Failed to get WAHA status:', err);
    }
  };

  const fetchLicenseStatus = async () => {
    try {
      const lic = await api.getLicenseStatus();
      setLicenseInfo(lic);
    } catch (err) {
      console.error('Failed to get License status:', err);
    }
  };

  const handleGlobalRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([fetchWahaStatus(), fetchLicenseStatus()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const fetchAuthStatus = async () => {
    try {
      const data = await api.getAuthStatus();
      setAuthStatus(data);
    } catch (err) {
      console.error('Failed to get Auth status:', err);
      setAuthStatus({ initialized: false, authenticated: false, user: null });
    } finally {
      setAuthChecked(true);
    }
  };

  useEffect(() => {
    fetchAuthStatus();
  }, []);

  useEffect(() => {
    if (!authStatus?.authenticated) return;
    fetchWahaStatus();
    fetchLicenseStatus();
    const unsubWaha = subscribeLiveEvent('waha:status', () => {
      void fetchWahaStatus();
    });
    const unsubLicense = subscribeLiveEvent('license:update', () => {
      void fetchLicenseStatus();
    });
    const interval = setInterval(() => {
      fetchWahaStatus();
      fetchLicenseStatus();
    }, 60000);
    return () => {
      unsubWaha();
      unsubLicense();
      clearInterval(interval);
    };
  }, [authStatus?.authenticated]);

  useEffect(() => {
    const user = authStatus?.user;
    if (!user || user.role === 'ADMIN' || !Array.isArray(user.permissions) || user.permissions.length === 0) {
      return;
    }
    if (!user.permissions.includes(currentTab)) {
      setCurrentTab(user.permissions[0]);
    }
  }, [authStatus?.user, currentTab]);

  const handleStartBroadcastWithContacts = (contactIds: string[]) => {
    setPreselectedContactIds(contactIds);
    setCurrentTab('broadcasts');
  };

  const getPageTitle = () => {
    switch (currentTab) {
      case 'dashboard':
        return 'Dashboard Analitik CRM';
      case 'contacts':
        return 'Data Kontak Pelanggan';
      case 'broadcasts':
        return 'Siaran WhatsApp';
      case 'birthday':
        return 'Ucapan Ulang Tahun Otomatis';
      case 'tracking':
        return 'Pelacakan Status Pengiriman';
      case 'conversations':
        return 'Live Chat CRM WhatsApp';
      case 'settings':
        return 'Pengaturan & Koneksi WAHA';
      default:
        return 'CRM WhatsApp Services';
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA] text-gray-600 text-sm">
        Memeriksa sesi CRM...
      </div>
    );
  }

  if (!authStatus?.authenticated) {
    return (
      <SetupLoginGate
        initialized={Boolean(authStatus?.initialized)}
        onAuthenticated={(user) =>
          setAuthStatus({
            initialized: true,
            authenticated: true,
            user,
          })
        }
      />
    );
  }

  if (licenseInfo && (licenseInfo.status === 'UNLICENSED' || licenseInfo.isExpired)) {
    return (
      <>
        <LicenseActivationScreen
          licenseInfo={licenseInfo}
          user={authStatus.user ?? null}
          onLicenseUpdated={fetchLicenseStatus}
          onOpenPlans={() => setIsPlansModalOpen(true)}
        />
        <PlansModal
          isOpen={isPlansModalOpen}
          onClose={() => setIsPlansModalOpen(false)}
          currentLicense={licenseInfo}
          onLicenseUpdated={fetchLicenseStatus}
          defaultBuyer={authStatus.user ?? undefined}
        />
      </>
    );
  }

  return (
    <div className="flex h-screen bg-[#F5F6FA] text-gray-900 overflow-hidden font-sans">
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={(tab) => {
          if (tab !== 'broadcasts') setPreselectedContactIds([]);
          setCurrentTab(tab);
        }}
        wahaStatus={wahaStatus}
        licenseInfo={licenseInfo}
        user={authStatus?.user}
        onLogout={async () => {
          try {
            await api.logoutAuth();
          } catch {
            // ignore
          }
          setAuthStatus({ initialized: true, authenticated: false, user: null });
        }}
        onOpenQrModal={() => setIsQrModalOpen(true)}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar
          title={getPageTitle()}
          wahaStatus={wahaStatus}
          licenseInfo={licenseInfo}
          onRefresh={handleGlobalRefresh}
          onOpenQr={() => setIsQrModalOpen(true)}
          onOpenPlans={() => setIsPlansModalOpen(true)}
          onMenuClick={() => setIsSidebarOpen(true)}
          isRefreshing={isRefreshing}
        />

        <main className="flex-1 overflow-y-auto p-3 sm:p-5 lg:p-6">
          <div className="w-full">
            {currentTab === 'dashboard' && <Dashboard onNavigate={setCurrentTab} />}
            {currentTab === 'contacts' && (
              <Contacts
                onStartBroadcastWithContacts={handleStartBroadcastWithContacts}
                licenseInfo={licenseInfo}
              />
            )}
            {currentTab === 'broadcasts' && (
              <Broadcasts
                initialContactIds={preselectedContactIds}
                licenseInfo={licenseInfo}
              />
            )}
            {currentTab === 'birthday' && <BirthdayAutomation />}
            {currentTab === 'tracking' && <Tracking />}
            {currentTab === 'conversations' && (
              <Conversations
                licenseInfo={licenseInfo}
                currentUser={authStatus?.user}
                onOpenPlans={() => setIsPlansModalOpen(true)}
              />
            )}
            {currentTab === 'settings' && (
              <Settings
                wahaStatus={wahaStatus}
                licenseInfo={licenseInfo}
                currentUser={authStatus?.user}
                onOpenPlans={() => setIsPlansModalOpen(true)}
                onRefreshStatus={fetchWahaStatus}
                onOpenQr={(sessionName?: string) => {
                  setQrSessionName(sessionName);
                  setIsQrModalOpen(true);
                }}
              />
            )}
          </div>
        </main>
      </div>

      <QRCodeModal
        isOpen={isQrModalOpen}
        onClose={() => {
          setIsQrModalOpen(false);
          setQrSessionName(undefined);
        }}
        onStatusChange={(newStatus) => setWahaStatus(newStatus)}
        sessionName={qrSessionName}
      />

      <PlansModal
        isOpen={isPlansModalOpen}
        onClose={() => setIsPlansModalOpen(false)}
        currentLicense={licenseInfo}
        onLicenseUpdated={fetchLicenseStatus}
        defaultBuyer={authStatus.user ?? undefined}
      />
    </div>
  );
}

export function App() {
  const isCsatRoute =
    typeof window !== 'undefined' && /\/csat\/?$/i.test(window.location.pathname);

  if (isCsatRoute) {
    return (
      <ToastProvider>
        <PublicCsatPage />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}

export default App;
