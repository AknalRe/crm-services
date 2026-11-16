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
import ScheduledPosts from './pages/ScheduledPosts';
import ContentIdeas from './pages/ContentIdeas';
import MediaLibrary from './pages/MediaLibrary';
import Comments from './pages/Comments';
import SocialFeed from './pages/SocialFeed';
import Automations from './pages/Automations';
import AiAgent from './pages/AiAgent';
import BirthdayAutomation from './pages/BirthdayAutomation';
import Tracking from './pages/Tracking';
import Conversations from './pages/Conversations';
import Settings from './pages/Settings';
import PublicCsatPage from './pages/PublicCsatPage';
import PublicChannelConnectPage from './pages/PublicChannelConnectPage';
import LandingPage from './pages/LandingPage';
import api from './services/api';
import { subscribeLiveEvent } from './services/liveEvents';
import { AuthStatus, WahaStatus, LicenseInfo, SettingsSection } from './types';

const VALID_TABS = new Set([
  'dashboard',
  'contacts',
  'broadcasts',
  'posts',
  'ideas',
  'media',
  'comments',
  'feed',
  'automations',
  'ai-agent',
  'birthday',
  'tracking',
  'conversations',
  'settings',
]);

const VALID_SETTINGS_SECTIONS = new Set<SettingsSection>([
  'whatsapp',
  'omnichannel',
  'quick_replies',
  'products',
  'labels',
  'templates',
  'automation',
  'sla_csat',
  'agents',
]);

function normalizeSettingsSection(raw: string): SettingsSection {
  if (raw === 'crm_products') return 'sla_csat';
  return VALID_SETTINGS_SECTIONS.has(raw as SettingsSection) ? (raw as SettingsSection) : 'whatsapp';
}

function getInitialLocation(): { tab: string; settingsSection: SettingsSection } {
  if (typeof window === 'undefined') return { tab: 'dashboard', settingsSection: 'whatsapp' };
  const rawHash = window.location.hash.replace(/^#/, '').trim();
  if (rawHash.startsWith('settings/')) {
    return {
      tab: 'settings',
      settingsSection: normalizeSettingsSection(rawHash.slice('settings/'.length)),
    };
  }
  if (VALID_TABS.has(rawHash)) {
    let savedSub: SettingsSection = 'whatsapp';
    try {
      const s = localStorage.getItem('crm_settings_section') || '';
      savedSub = normalizeSettingsSection(s);
    } catch {
      // ignore
    }
    return { tab: rawHash, settingsSection: savedSub };
  }
  try {
    const savedTab = localStorage.getItem('crm_current_tab') || '';
    const savedSub = localStorage.getItem('crm_settings_section') || '';
    return {
      tab: VALID_TABS.has(savedTab) ? savedTab : 'dashboard',
      settingsSection: normalizeSettingsSection(savedSub),
    };
  } catch {
    return { tab: 'dashboard', settingsSection: 'whatsapp' };
  }
}

function AppShell() {
  const initialLoc = getInitialLocation();
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentTab, setCurrentTabState] = useState<string>(initialLoc.tab);
  const [settingsSection, setSettingsSectionState] = useState<SettingsSection>(
    initialLoc.settingsSection
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showLoginGate, setShowLoginGate] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.location.hash === '#login' ||
      new URLSearchParams(window.location.search).get('login') === '1'
    );
  });

  const syncHash = (tab: string, section: SettingsSection) => {
    if (typeof window === 'undefined') return;
    const targetHash = tab === 'settings' ? `#settings/${section}` : `#${tab}`;
    if (window.location.hash !== targetHash) {
      window.history.replaceState(null, '', targetHash);
    }
  };

  const setCurrentTab = (tab: string, sectionOverride?: SettingsSection) => {
    const next = VALID_TABS.has(tab) ? tab : 'dashboard';
    setCurrentTabState(next);
    try {
      localStorage.setItem('crm_current_tab', next);
    } catch {
      // Ignore storage error
    }
    syncHash(next, sectionOverride ?? settingsSection);
  };

  const setSettingsSection = (section: SettingsSection) => {
    const next = VALID_SETTINGS_SECTIONS.has(section) ? section : 'whatsapp';
    setSettingsSectionState(next);
    try {
      localStorage.setItem('crm_settings_section', next);
    } catch {
      // Ignore storage error
    }
    syncHash('settings', next);
  };

  const [wahaStatus, setWahaStatus] = useState<WahaStatus | null>(null);
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrSessionName, setQrSessionName] = useState<string | undefined>(undefined);
  const [isPlansModalOpen, setIsPlansModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [preselectedContactIds, setPreselectedContactIds] = useState<string[]>([]);
  const [prefillPost, setPrefillPost] = useState<{
    channel?: 'INSTAGRAM' | 'FACEBOOK' | 'THREADS' | 'TELEGRAM';
    caption?: string;
    mediaUrl?: string;
  } | null>(null);

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
    if (!user || user.role === 'ADMIN') {
      return;
    }
    if (settingsSection === 'agents') {
      setSettingsSection('whatsapp');
    }
    if (!Array.isArray(user.permissions) || user.permissions.length === 0) {
      return;
    }
    const TAB_REQUIRED_PERMISSION: Record<string, string> = {
      dashboard: 'dashboard',
      contacts: 'contacts',
      broadcasts: 'broadcasts',
      posts: 'broadcasts',
      ideas: 'broadcasts',
      media: 'broadcasts',
      birthday: 'birthday',
      tracking: 'tracking',
      conversations: 'conversations',
      comments: 'conversations',
      feed: 'conversations',
      settings: 'settings',
      automations: 'settings',
      'ai-agent': 'settings',
    };
    const requiredPerm = TAB_REQUIRED_PERMISSION[currentTab] ?? currentTab;
    if (!user.permissions.includes(requiredPerm)) {
      setCurrentTab(user.permissions[0]);
    }
  }, [authStatus?.user, currentTab, settingsSection]);

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
        return 'Siaran & Kampanye';
      case 'posts':
        return 'Jadwal Postingan Kanal';
      case 'ideas':
        return 'Ide Konten';
      case 'media':
        return 'Pustaka Media';
      case 'birthday':
        return 'Ucapan Ulang Tahun Otomatis';
      case 'tracking':
        return 'Pelacakan Status Pengiriman';
      case 'conversations':
        return 'Live Chat CRM';
      case 'settings':
        switch (settingsSection) {
          case 'whatsapp':
            return 'Integrasi WhatsApp (WAHA)';
          case 'omnichannel':
            return 'Integrasi Omnichannel';
          case 'quick_replies':
            return 'Master Balasan Cepat';
          case 'products':
            return 'Master Katalog Produk';
          case 'labels':
            return 'Master Label & Kategori';
          case 'templates':
            return 'Master Template Siaran';
          case 'automation':
            return 'Auto-Reply & Jam Kerja';
          case 'sla_csat':
            return 'SLA, Routing & CSAT';
          case 'agents':
            return 'Tim & Hak Akses';
          default:
            return 'Pengaturan & Konfigurasi';
        }
      case 'comments':
        return 'Komentar Sosial Media';
      case 'feed':
        return 'Feed Sosial Media';
      case 'automations':
        return 'Otomasi Komentar & DM';
      case 'ai-agent':
        return 'Agent AI & Knowledge Base';
      default:
        return 'Reneo CRM Omnichannel';
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
    if (!showLoginGate) {
      return (
        <LandingPage
          initialized={Boolean(authStatus?.initialized)}
          onEnterLogin={() => {
            setShowLoginGate(true);
            if (typeof window !== 'undefined') {
              window.history.replaceState(null, '', '#login');
            }
          }}
        />
      );
    }

    return (
      <SetupLoginGate
        initialized={Boolean(authStatus?.initialized)}
        onAuthenticated={(user) => {
          setShowLoginGate(false);
          setAuthStatus({
            initialized: true,
            authenticated: true,
            user,
          });
        }}
        onBackToLanding={() => {
          setShowLoginGate(false);
          if (typeof window !== 'undefined' && window.location.hash === '#login') {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }
        }}
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
          onBackToLanding={async () => {
            try {
              await api.logoutAuth();
            } catch {
              // ignore
            }
            if (typeof window !== 'undefined') {
              window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
            setShowLoginGate(false);
            setAuthStatus({ initialized: true, authenticated: false, user: null });
          }}
          onLogout={async () => {
            try {
              await api.logoutAuth();
            } catch {
              // ignore
            }
            setAuthStatus({ initialized: true, authenticated: false, user: null });
          }}
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
    <div className="flex h-screen supports-[height:100dvh]:h-dvh bg-[#F5F6FA] text-gray-900 overflow-hidden font-sans">
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={(tab) => {
          if (tab !== 'broadcasts') setPreselectedContactIds([]);
          setCurrentTab(tab);
        }}
        settingsSection={settingsSection}
        onSelectSettingsSection={setSettingsSection}
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
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar
          title={getPageTitle()}
          licenseInfo={licenseInfo}
          onRefresh={handleGlobalRefresh}
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
            {currentTab === 'posts' && (
              <ScheduledPosts
                prefill={prefillPost}
                onClearPrefill={() => setPrefillPost(null)}
              />
            )}
            {currentTab === 'ideas' && (
              <ContentIdeas
                onConvertToPost={(p) => {
                  setPrefillPost(p);
                  setCurrentTab('posts');
                }}
              />
            )}
            {currentTab === 'media' && (
              <MediaLibrary
                onUseInPost={(url) => {
                  setPrefillPost({ mediaUrl: url });
                  setCurrentTab('posts');
                }}
              />
            )}
            {currentTab === 'comments' && <Comments />}
            {currentTab === 'feed' && <SocialFeed />}
            {currentTab === 'automations' && <Automations />}
            {currentTab === 'ai-agent' && <AiAgent />}
            {currentTab === 'birthday' && <BirthdayAutomation />}
            {currentTab === 'tracking' && <Tracking />}
            {currentTab === 'conversations' && (
              <Conversations
                licenseInfo={licenseInfo}
                currentUser={authStatus?.user}
                onOpenPlans={() => setIsPlansModalOpen(true)}
                onOpenSettings={(sec) => {
                  setSettingsSection(sec);
                  setCurrentTab('settings', sec);
                }}
              />
            )}
            {currentTab === 'settings' && (
              <Settings
                wahaStatus={wahaStatus}
                licenseInfo={licenseInfo}
                currentUser={authStatus?.user}
                activeSection={settingsSection}
                onSectionChange={setSettingsSection}
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
  const isConnectChannelRoute =
    typeof window !== 'undefined' && /\/connect-channel\/?$/i.test(window.location.pathname);

  if (isCsatRoute) {
    return (
      <ToastProvider>
        <PublicCsatPage />
      </ToastProvider>
    );
  }

  if (isConnectChannelRoute) {
    return (
      <ToastProvider>
        <PublicChannelConnectPage />
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
