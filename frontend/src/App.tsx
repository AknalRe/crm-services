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
import api from './services/api';
import { AuthStatus, WahaStatus, LicenseInfo } from './types';

function AppShell() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentTab, setCurrentTab] = useState('dashboard');
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
    const interval = setInterval(() => {
      fetchWahaStatus();
      fetchLicenseStatus();
    }, 15000);
    return () => clearInterval(interval);
  }, [authStatus?.authenticated]);

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
        return 'Koneksi Server WhatsApp WAHA';
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
        onOpenQrModal={() => setIsQrModalOpen(true)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar
          title={getPageTitle()}
          wahaStatus={wahaStatus}
          licenseInfo={licenseInfo}
          onRefresh={handleGlobalRefresh}
          onOpenQr={() => setIsQrModalOpen(true)}
          onOpenPlans={() => setIsPlansModalOpen(true)}
          isRefreshing={isRefreshing}
        />

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            {currentTab === 'dashboard' && <Dashboard onNavigate={setCurrentTab} />}
            {currentTab === 'contacts' && (
              <Contacts onStartBroadcastWithContacts={handleStartBroadcastWithContacts} />
            )}
            {currentTab === 'broadcasts' && (
              <Broadcasts initialContactIds={preselectedContactIds} />
            )}
            {currentTab === 'birthday' && <BirthdayAutomation />}
            {currentTab === 'tracking' && <Tracking />}
            {currentTab === 'conversations' && <Conversations />}
            {currentTab === 'settings' && (
              <Settings
                wahaStatus={wahaStatus}
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
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}

export default App;
