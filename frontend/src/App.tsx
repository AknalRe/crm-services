import React, { useState, useEffect } from 'react';
import { ShieldAlert } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import QRCodeModal from './components/QRCodeModal';
import { PlansModal, PlansModalView } from './components/PlansModal';
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
import { hasAnyPerm, hasPerm } from './lib/permissions';
import { subscribeLiveEvent } from './services/liveEvents';
import {
  getAppRootPath,
  getLandingPath,
  getLoginPath,
  isConnectChannelPathname,
  isCsatPathname,
  isLandingPathname,
  isLoginPathname,
} from './services/paths';
import {
  AuthStatus,
  WahaStatus,
  LicenseInfo,
  SettingsSection,
  ConversationNavigationTarget,
} from './types';

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
  const [accessRestriction, setAccessRestriction] = useState<{
    code: string;
    error: string;
    host?: string;
  } | null>(null);
  const [currentTab, setCurrentTabState] = useState<string>(initialLoc.tab);
  const [settingsSection, setSettingsSectionState] = useState<SettingsSection>(
    initialLoc.settingsSection
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentPathname, setCurrentPathname] = useState<string>(() => {
    if (typeof window === 'undefined') return '/';
    return window.location.pathname;
  });
  const [showLandingPage, setShowLandingPage] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return isLandingPathname(window.location.pathname) || window.location.hash === '#landing';
  });
  const [authGateInitialMode, setAuthGateInitialMode] = useState<'login' | 'setup'>('login');

  const rootPath = getAppRootPath(currentPathname);
  const loginPath = getLoginPath(currentPathname);
  const landingPath = getLandingPath(currentPathname);
  const isLoginRoute = isLoginPathname(currentPathname);

  const navigatePath = (targetPathname: string, hash = '', replace = false) => {
    if (typeof window === 'undefined') return;
    const nextUrl = `${targetPathname}${hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (currentUrl !== nextUrl) {
      if (replace) {
        window.history.replaceState(null, '', nextUrl);
      } else {
        window.history.pushState(null, '', nextUrl);
      }
    }
    setCurrentPathname(targetPathname);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);
    if (window.location.hash === '#login' || searchParams.get('login') === '1') {
      navigatePath(getLoginPath(window.location.pathname), '', true);
    } else if (/\/login\/+$/i.test(window.location.pathname)) {
      navigatePath(getLoginPath(window.location.pathname), window.location.hash, true);
    } else if (
      window.location.hash === '#landing' ||
      searchParams.get('landing') === '1' ||
      /\/landing\/+$/i.test(window.location.pathname)
    ) {
      setShowLandingPage(true);
      navigatePath(getLandingPath(window.location.pathname), '', true);
    }

    const onPopState = () => {
      const nextPath = window.location.pathname;
      setCurrentPathname(nextPath);
      setShowLandingPage(isLandingPathname(nextPath) || window.location.hash === '#landing');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const syncHash = (tab: string, section: SettingsSection) => {
    if (typeof window === 'undefined') return;
    const targetHash = tab === 'settings' ? `#settings/${section}` : `#${tab}`;
    if (window.location.hash !== targetHash) {
      window.history.replaceState(null, '', `${window.location.pathname}${targetHash}`);
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
  const [plansInitialView, setPlansInitialView] = useState<PlansModalView>('overview');
  const openPlansModal = (mode: PlansModalView = 'overview') => {
    setPlansInitialView(mode);
    setIsPlansModalOpen(true);
  };
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [preselectedContactIds, setPreselectedContactIds] = useState<string[]>([]);
  const [targetConversation, setTargetConversation] = useState<ConversationNavigationTarget | null>(null);
  const [targetContact, setTargetContact] = useState<{
    contactId?: string | null;
    phone?: string | null;
    name?: string | null;
  } | null>(null);
  const [prefillPost, setPrefillPost] = useState<{
    channel?: 'INSTAGRAM' | 'FACEBOOK' | 'THREADS' | 'TELEGRAM';
    caption?: string;
    mediaUrl?: string;
  } | null>(null);

  const fetchWahaStatus = async (): Promise<WahaStatus | null> => {
    try {
      const status = await api.getWahaStatus();
      setWahaStatus(status);
      return status;
    } catch (err) {
      console.error('Failed to get WAHA status:', err);
      return null;
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
      setAccessRestriction(null);
      try {
        if (data?.authenticated) {
          localStorage.setItem('crm_auth_hint', '1');
        } else {
          localStorage.removeItem('crm_auth_hint');
        }
      } catch {
        // Ignore storage errors
      }
      setAuthStatus(data);
    } catch (err: any) {
      const errCode = String(err?.response?.data?.code || '');
      if (
        err?.response?.status === 403 &&
        (errCode === 'DOMAIN_NOT_ALLOWED' || errCode === 'RENEO_ENV_REQUIRED')
      ) {
        try {
          localStorage.removeItem('crm_auth_hint');
        } catch {
          // Ignore storage errors
        }
        setAccessRestriction({
          code: errCode,
          error:
            String(err?.response?.data?.error || '') ||
            'CRM ini hanya dapat diinstal dan diakses dari hostname serta domain yang diizinkan di lingkungan Reneo.',
          host: err?.response?.data?.host ? String(err.response.data.host) : undefined,
        });
      }
      console.error('Failed to get Auth status:', err);
      setAuthStatus({ initialized: true, authenticated: false, user: null });
    } finally {
      setAuthChecked(true);
    }
  };

  useEffect(() => {
    fetchAuthStatus();
  }, []);

  useEffect(() => {
    if (authStatus?.authenticated && isLoginRoute) {
      navigatePath(rootPath, '', true);
    }
  }, [authStatus?.authenticated, isLoginRoute, rootPath]);

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
    const canSeeSettings = hasPerm(user, 'settings');
    const canManageAgents = hasPerm(user, 'settings.agents');
    if (settingsSection === 'agents' && !canManageAgents) {
      setSettingsSection('whatsapp');
    } else if (settingsSection !== 'agents' && !canSeeSettings && canManageAgents) {
      setSettingsSection('agents');
    }
    if (!Array.isArray(user.permissions)) {
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
    const isTabAllowed = (tabName: string) => {
      if (tabName === 'settings') {
        return hasAnyPerm(user, ['settings', 'settings.agents']);
      }
      const reqPerm = TAB_REQUIRED_PERMISSION[tabName] ?? tabName;
      return hasPerm(user, reqPerm);
    };
    if (!isTabAllowed(currentTab)) {
      const candidateTabs = [
        'dashboard',
        'conversations',
        'contacts',
        'broadcasts',
        'posts',
        'birthday',
        'tracking',
        'settings',
      ];
      const firstAllowed = candidateTabs.find((candidate) => isTabAllowed(candidate));
      if (firstAllowed && firstAllowed !== currentTab) {
        setCurrentTab(firstAllowed);
      }
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
        return 'Galeri';
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

  const openLandingPage = () => {
    setShowLandingPage(true);
    navigatePath(landingPath, '');
  };

  if (accessRestriction) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-white border border-rose-200 rounded-xl p-6 space-y-3 shadow-xs">
          <div className="flex items-center gap-2.5 text-rose-700">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <h1 className="text-base font-bold">Akses Lingkungan &amp; Domain Dibatasi</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            {accessRestriction.error}
          </p>
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] font-mono text-slate-700 space-y-1">
            <div>Kode: {accessRestriction.code}</div>
            {(accessRestriction.host || (typeof window !== 'undefined' ? window.location.host : '')) && (
              <div>
                Host: {accessRestriction.host || window.location.host}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!authChecked) {
    let hasAuthHint = false;
    try {
      hasAuthHint = localStorage.getItem('crm_auth_hint') === '1';
    } catch {
      hasAuthHint = false;
    }
    if (!hasAuthHint && !isLoginRoute) {
      return (
        <LandingPage
          initialized={true}
          authenticated={false}
          onEnterLogin={() => {
            setAuthGateInitialMode('login');
            navigatePath(loginPath);
          }}
          onEnterRegister={() => {
            setAuthGateInitialMode('setup');
            navigatePath(loginPath);
          }}
        />
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA] text-gray-600 text-sm">
        Memeriksa sesi CRM...
      </div>
    );
  }

  if (!authStatus?.authenticated) {
    if (!isLoginRoute) {
      return (
        <LandingPage
          initialized={Boolean(authStatus?.initialized)}
          authenticated={false}
          onEnterLogin={() => {
            setAuthGateInitialMode('login');
            navigatePath(loginPath);
          }}
          onEnterRegister={() => {
            setAuthGateInitialMode('setup');
            navigatePath(loginPath);
          }}
        />
      );
    }

    return (
      <SetupLoginGate
        initialized={Boolean(authStatus?.initialized)}
        initialMode={authGateInitialMode}
        onAuthenticated={(user) => {
          try {
            localStorage.setItem('crm_auth_hint', '1');
          } catch {
            // Ignore storage errors
          }
          setShowLandingPage(false);
          setAuthStatus({
            initialized: true,
            authenticated: true,
            user,
          });
          navigatePath(rootPath, '', true);
        }}
        onBackToLanding={() => {
          navigatePath(landingPath);
        }}
      />
    );
  }

  if (showLandingPage) {
    return (
      <LandingPage
        initialized={Boolean(authStatus?.initialized)}
        authenticated={true}
        onEnterLogin={() => {
          setShowLandingPage(false);
          const targetHash =
            currentTab === 'settings' ? `#settings/${settingsSection}` : `#${currentTab}`;
          navigatePath(rootPath, targetHash);
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
          onOpenPlans={() => openPlansModal(licenseInfo.status === 'UNLICENSED' ? 'plans' : 'overview')}
          onBackToLanding={openLandingPage}
          onWorkspaceSwitched={(nextUser, nextLicense) => {
            setAuthStatus((prev) => (prev ? { ...prev, user: nextUser } : prev));
            if (nextLicense) {
              setLicenseInfo(nextLicense);
            }
            void handleGlobalRefresh();
          }}
          onLogout={async () => {
            try {
              await api.logoutAuth();
            } catch {
              // ignore
            }
            try {
              localStorage.removeItem('crm_auth_hint');
            } catch {
              // ignore
            }
            setShowLandingPage(false);
            setAuthStatus({ initialized: true, authenticated: false, user: null });
            navigatePath(loginPath, '', true);
          }}
        />
        <PlansModal
          isOpen={isPlansModalOpen}
          onClose={() => setIsPlansModalOpen(false)}
          currentLicense={licenseInfo}
          onLicenseUpdated={fetchLicenseStatus}
          defaultBuyer={authStatus.user ?? undefined}
          initialView={plansInitialView}
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
        onOpenLanding={openLandingPage}
        onOpenPlans={() => openPlansModal('plans')}
        onUserUpdated={(nextUser) => {
          setAuthStatus((prev) => (prev ? { ...prev, user: nextUser } : prev));
        }}
        onWorkspaceSwitched={(nextUser, nextLicense) => {
          setAuthStatus((prev) => (prev ? { ...prev, user: nextUser } : prev));
          if (nextLicense) {
            setLicenseInfo(nextLicense);
          }
          void handleGlobalRefresh();
        }}
        onLogout={async () => {
          try {
            await api.logoutAuth();
          } catch {
            // ignore
          }
          try {
            localStorage.removeItem('crm_auth_hint');
          } catch {
            // ignore
          }
          setShowLandingPage(false);
          setAuthStatus({ initialized: true, authenticated: false, user: null });
          navigatePath(loginPath, '', true);
        }}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar
          title={getPageTitle()}
          licenseInfo={licenseInfo}
          onRefresh={handleGlobalRefresh}
          onOpenPlans={() => openPlansModal('overview')}
          onOpenLanding={openLandingPage}
          onMenuClick={() => setIsSidebarOpen(true)}
          isRefreshing={isRefreshing}
        />

        <main
          className={
            currentTab === 'conversations'
              ? 'flex-1 min-h-0 flex flex-col overflow-hidden p-0 sm:p-4 lg:p-5'
              : 'flex-1 overflow-y-auto overflow-x-hidden p-2.5 sm:p-5 lg:p-6'
          }
        >
          <div
            className={
              currentTab === 'conversations'
                ? 'w-full min-w-0 flex-1 min-h-0 flex flex-col'
                : 'w-full min-w-0'
            }
          >
            {currentTab === 'dashboard' && (
              <Dashboard
                currentUser={authStatus?.user}
                onNavigate={(tab, target) => {
                  setTargetConversation(target || null);
                  setCurrentTab(tab);
                }}
              />
            )}
            {currentTab === 'contacts' && (
              <Contacts
                currentUser={authStatus?.user}
                onStartBroadcastWithContacts={handleStartBroadcastWithContacts}
                licenseInfo={licenseInfo}
                targetContact={targetContact}
                onTargetContactHandled={() => setTargetContact(null)}
              />
            )}
            {currentTab === 'broadcasts' && (
              <Broadcasts
                currentUser={authStatus?.user}
                initialContactIds={preselectedContactIds}
                licenseInfo={licenseInfo}
              />
            )}
            {currentTab === 'posts' && (
              <ScheduledPosts
                currentUser={authStatus?.user}
                prefill={prefillPost}
                onClearPrefill={() => setPrefillPost(null)}
              />
            )}
            {currentTab === 'ideas' && (
              <ContentIdeas
                currentUser={authStatus?.user}
                onConvertToPost={(p) => {
                  setPrefillPost(p);
                  setCurrentTab('posts');
                }}
              />
            )}
            {currentTab === 'media' && (
              <MediaLibrary
                currentUser={authStatus?.user}
                onUseInPost={(url) => {
                  setPrefillPost({ mediaUrl: url });
                  setCurrentTab('posts');
                }}
              />
            )}
            {currentTab === 'comments' && <Comments />}
            {currentTab === 'feed' && <SocialFeed />}
            {currentTab === 'automations' && <Automations currentUser={authStatus?.user} />}
            {currentTab === 'ai-agent' && <AiAgent currentUser={authStatus?.user} />}
            {currentTab === 'birthday' && <BirthdayAutomation />}
            {currentTab === 'tracking' && <Tracking />}
            {currentTab === 'conversations' && (
              <Conversations
                licenseInfo={licenseInfo}
                currentUser={authStatus?.user}
                targetConversation={targetConversation}
                onTargetHandled={() => setTargetConversation(null)}
                onOpenContact={(target) => {
                  setTargetContact(target);
                  setCurrentTab('contacts');
                }}
                onOpenPlans={() => openPlansModal('plans')}
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
                onOpenPlans={() => openPlansModal('plans')}
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
        initialView={plansInitialView}
      />
    </div>
  );
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: any): AppErrorBoundaryState {
    return {
      hasError: true,
      message: String(error?.message || 'Terjadi kesalahan antarmuka CRM.'),
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA] p-4">
          <div className="bg-white border border-gray-200 rounded-lg p-6 max-w-md w-full space-y-3 text-center">
            <h2 className="text-sm font-semibold text-gray-900">
              Terjadi Kesalahan Tampilan CRM
            </h2>
            <p className="text-xs text-gray-600 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium"
            >
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  const isCsatRoute =
    typeof window !== 'undefined' && isCsatPathname(window.location.pathname);
  const isConnectChannelRoute =
    typeof window !== 'undefined' && isConnectChannelPathname(window.location.pathname);

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
    <AppErrorBoundary>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </AppErrorBoundary>
  );
}

export default App;
