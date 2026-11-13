import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import QRCodeModal from './components/QRCodeModal';
import { PlansModal } from './components/PlansModal';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import Broadcasts from './pages/Broadcasts';
import BirthdayAutomation from './pages/BirthdayAutomation';
import Tracking from './pages/Tracking';
import Conversations from './pages/Conversations';
import Settings from './pages/Settings';
import api from './services/api';
import { WahaStatus, LicenseInfo } from './types';

export function App() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [wahaStatus, setWahaStatus] = useState<WahaStatus | null>(null);
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
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
    await Promise.all([fetchWahaStatus(), fetchLicenseStatus()]);
    setTimeout(() => setIsRefreshing(false), 600);
  };

  useEffect(() => {
    fetchWahaStatus();
    fetchLicenseStatus();
    const interval = setInterval(() => {
      fetchWahaStatus();
      fetchLicenseStatus();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

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
        return 'WhatsApp Broadcast Engine';
      case 'birthday':
        return 'Ucapan Ulang Tahun Otomatis';
      case 'tracking':
        return 'Lead Status & Delivery Receipts';
      case 'conversations':
        return 'Live Chat CRM WhatsApp';
      case 'settings':
        return 'Koneksi Server WhatsApp WAHA';
      default:
        return 'CRM WhatsApp Services';
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={(tab) => {
          if (tab !== 'broadcasts') setPreselectedContactIds([]);
          setCurrentTab(tab);
        }}
        wahaStatus={wahaStatus}
        onOpenQrModal={() => setIsQrModalOpen(true)}
      />

      {/* Main Content Area */}
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

        <main className="flex-1 overflow-y-auto p-8">
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
                onOpenQr={() => setIsQrModalOpen(true)}
              />
            )}
          </div>
        </main>
      </div>

      {/* QR Code Scanner Modal */}
      <QRCodeModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        onStatusChange={(newStatus) => setWahaStatus(newStatus)}
      />

      {/* Reneo License Plans & Invoice Modal */}
      <PlansModal
        isOpen={isPlansModalOpen}
        onClose={() => setIsPlansModalOpen(false)}
        currentLicense={licenseInfo}
        onLicenseUpdated={fetchLicenseStatus}
      />
    </div>
  );
}

export default App;

