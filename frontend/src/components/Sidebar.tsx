import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  Send,
  Cake,
  CheckCheck,
  MessageCircle,
  Settings,
  Smartphone,
  Lock,
  X,
  LogOut,
  ChevronDown,
  ChevronRight,
  Globe,
  Bot,
  Sliders,
  Plug,
  CalendarClock,
  Lightbulb,
  Image as ImageIcon,
  Plus,
  MessageSquare,
  Radio,
  Zap,
  Database,
  Package,
  Tag,
  FileText,
  Home,
} from 'lucide-react';
import { AuthStatus, LicenseInfo, SettingsSection } from '../types';
import { ReneoCrmLogo } from './ReneoCrmLogo';
import { hasPerm } from '../lib/permissions';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  settingsSection?: SettingsSection;
  onSelectSettingsSection?: (section: SettingsSection) => void;
  licenseInfo?: LicenseInfo | null;
  user?: AuthStatus['user'] | null;
  onOpenLanding?: () => void;
  onLogout?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  settingsSection = 'whatsapp',
  onSelectSettingsSection,
  licenseInfo,
  user,
  onOpenLanding,
  onLogout,
  isOpen = false,
  onClose,
}) => {
  const isLiveChatUnlocked =
    !licenseInfo ||
    Boolean(!licenseInfo.isExpired && licenseInfo.features?.liveChatCrm);
  const isAdmin = !user || user.role === 'ADMIN';
  const canManageAgents = isAdmin || hasPerm(user, 'settings.agents');

  const isIntegrationsActive =
    currentTab === 'settings' &&
    (settingsSection === 'whatsapp' || settingsSection === 'omnichannel');
  const isMasterDataActive =
    currentTab === 'settings' &&
    (settingsSection === 'quick_replies' ||
      settingsSection === 'products' ||
      settingsSection === 'labels' ||
      settingsSection === 'templates');
  const isSystemSettingsActive =
    currentTab === 'settings' &&
    (settingsSection === 'automation' ||
      settingsSection === 'sla_csat' ||
      settingsSection === 'agents');

  const [openDropdowns, setOpenDropdowns] = useState<{
    integrations: boolean;
    master: boolean;
    settings: boolean;
  }>({
    integrations: true,
    master: isMasterDataActive,
    settings: isSystemSettingsActive,
  });

  useEffect(() => {
    if (isIntegrationsActive) {
      setOpenDropdowns((prev) => ({ ...prev, integrations: true }));
    }
    if (isMasterDataActive) {
      setOpenDropdowns((prev) => ({ ...prev, master: true }));
    }
    if (isSystemSettingsActive) {
      setOpenDropdowns((prev) => ({ ...prev, settings: true }));
    }
  }, [isIntegrationsActive, isMasterDataActive, isSystemSettingsActive]);

  const menuGroups = [
    {
      title: 'Overview',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, locked: false },
      ],
    },
    {
      title: 'Inbox & Sosial',
      items: [
        { id: 'conversations', label: 'Inbox CRM', icon: MessageCircle, locked: !isLiveChatUnlocked },
        { id: 'comments', label: 'Komentar', icon: MessageSquare, locked: false, perm: 'conversations' },
        { id: 'feed', label: 'Feed Sosial', icon: Radio, locked: false, perm: 'conversations' },
      ],
    },
    {
      title: 'Pelanggan & Siaran',
      items: [
        { id: 'contacts', label: 'Kontak', icon: Users, locked: false },
        { id: 'broadcasts', label: 'Siaran & Kampanye', icon: Send, locked: false, perm: 'broadcasts' },
        { id: 'birthday', label: 'Ulang Tahun', icon: Cake, locked: false },
        { id: 'tracking', label: 'Pelacakan Status', icon: CheckCheck, locked: false },
      ],
    },
    {
      title: 'Publikasi Konten',
      items: [
        { id: 'posts', label: 'Jadwal Post', icon: CalendarClock, locked: false, perm: 'broadcasts' },
        { id: 'ideas', label: 'Ide Konten', icon: Lightbulb, locked: false, perm: 'broadcasts' },
        { id: 'media', label: 'Pustaka Media', icon: ImageIcon, locked: false, perm: 'broadcasts' },
      ],
    },
    {
      title: 'Otomasi & AI',
      items: [
        { id: 'automations', label: 'Otomasi Komentar', icon: Zap, locked: false, perm: 'settings' },
        { id: 'ai-agent', label: 'Agent AI & KB', icon: Bot, locked: false, perm: 'settings' },
      ],
    },
  ];

  const integrationSubItems: { id: SettingsSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'whatsapp', label: 'WhatsApp (WAHA)', icon: Smartphone },
    { id: 'omnichannel', label: 'Omnichannel', icon: Globe },
  ];

  const masterDataSubItems: { id: SettingsSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'quick_replies', label: 'Balasan Cepat', icon: Zap },
    { id: 'products', label: 'Katalog Produk', icon: Package },
    { id: 'labels', label: 'Label & Kategori', icon: Tag },
    { id: 'templates', label: 'Template Siaran', icon: FileText },
  ];

  const isItemAllowed = (id: string) => hasPerm(user, id);

  const settingsSubItems: { id: SettingsSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    ...(isItemAllowed('settings')
      ? [
          { id: 'automation' as const, label: 'Auto-Reply & Jam Kerja', icon: Bot },
          { id: 'sla_csat' as const, label: 'SLA, Routing & CSAT', icon: Sliders },
        ]
      : []),
    ...(canManageAgents ? [{ id: 'agents' as const, label: 'Tim & Hak Akses', icon: Users }] : []),
  ];

  const handleOpenSettingsSub = (section: SettingsSection) => {
    setCurrentTab('settings');
    onSelectSettingsSection?.(section);
    onClose?.();
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 bg-[#121622] text-gray-200 flex flex-col h-screen supports-[height:100dvh]:h-dvh shrink-0 border-r border-[#1E2438] select-none transition-transform duration-200 lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-14 px-4 flex items-center justify-between gap-2.5 border-b border-[#1E2438]">
          <div className="flex items-center gap-2.5 min-w-0">
            <ReneoCrmLogo className="w-7 h-7 shrink-0" />
            <div className="min-w-0">
              <h1 className="font-semibold text-sm text-white tracking-tight truncate">
                Reneo CRM
              </h1>
              <p className="text-[11px] text-gray-400 truncate">Omnichannel Suite</p>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="lg:hidden p-1 text-gray-400 hover:text-white rounded"
              aria-label="Tutup Menu"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
        {isItemAllowed('broadcasts') && isItemAllowed('broadcasts.send') && (
          <button
            type="button"
            onClick={() => {
              setCurrentTab('posts');
              onClose?.();
            }}
            className="w-full h-8 px-3 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>Buat Post</span>
          </button>
        )}
        {menuGroups.map((group) => {
          const visibleItems = group.items.filter((item: any) => isItemAllowed(item.perm || item.id));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.title} className="space-y-0.5">
              <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                {group.title}
              </div>
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setCurrentTab(item.id);
                      onClose?.();
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium transition-colors ${
                      isActive
                        ? 'bg-[#1E2438] text-white'
                        : 'text-gray-400 hover:bg-[#1E2438]/60 hover:text-gray-100'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-indigo-400' : 'text-gray-400'
                      }`}
                    />
                    <span className="truncate flex-1 text-left">{item.label}</span>
                    {item.locked && (
                      <span
                        title="Terkunci oleh lisensi — butuh paket Pro atau Enterprise"
                        className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-800/60 text-amber-400 shrink-0"
                      >
                        <Lock className="w-3 h-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}

        {(isItemAllowed('settings') || canManageAgents) && (
          <div className="space-y-1">
            <div className="px-2.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Konfigurasi
            </div>

            {isItemAllowed('settings') && (
              <>
            {/* Dropdown: Integrasi & Kanal */}
            <div>
              <button
                type="button"
                onClick={() =>
                  setOpenDropdowns((prev) => ({ ...prev, integrations: !prev.integrations }))
                }
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium transition-colors ${
                  isIntegrationsActive
                    ? 'bg-[#1E2438] text-white'
                    : 'text-gray-400 hover:bg-[#1E2438]/60 hover:text-gray-100'
                }`}
              >
                <Plug
                  className={`w-4 h-4 shrink-0 ${
                    isIntegrationsActive ? 'text-indigo-400' : 'text-gray-400'
                  }`}
                />
                <span className="truncate flex-1 text-left">Integrasi &amp; Kanal</span>
                {openDropdowns.integrations ? (
                  <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                )}
              </button>
              {openDropdowns.integrations && (
                <div className="mt-0.5 ml-3 pl-2.5 border-l border-[#242B42] space-y-0.5">
                  {integrationSubItems.map((sub) => {
                    const SubIcon = sub.icon;
                    const active = currentTab === 'settings' && settingsSection === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => handleOpenSettingsSub(sub.id)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          active
                            ? 'bg-indigo-600/20 text-indigo-300'
                            : 'text-gray-400 hover:bg-[#1E2438]/50 hover:text-gray-200'
                        }`}
                      >
                        <SubIcon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate text-left">{sub.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Dropdown: Master Data */}
            <div>
              <button
                type="button"
                onClick={() =>
                  setOpenDropdowns((prev) => ({ ...prev, master: !prev.master }))
                }
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium transition-colors ${
                  isMasterDataActive
                    ? 'bg-[#1E2438] text-white'
                    : 'text-gray-400 hover:bg-[#1E2438]/60 hover:text-gray-100'
                }`}
              >
                <Database
                  className={`w-4 h-4 shrink-0 ${
                    isMasterDataActive ? 'text-indigo-400' : 'text-gray-400'
                  }`}
                />
                <span className="truncate flex-1 text-left">Master Data</span>
                {openDropdowns.master ? (
                  <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                )}
              </button>
              {openDropdowns.master && (
                <div className="mt-0.5 ml-3 pl-2.5 border-l border-[#242B42] space-y-0.5">
                  {masterDataSubItems.map((sub) => {
                    const SubIcon = sub.icon;
                    const active = currentTab === 'settings' && settingsSection === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => handleOpenSettingsSub(sub.id)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          active
                            ? 'bg-indigo-600/20 text-indigo-300'
                            : 'text-gray-400 hover:bg-[#1E2438]/50 hover:text-gray-200'
                        }`}
                      >
                        <SubIcon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate text-left">{sub.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
              </>
            )}

            {/* Dropdown: Pengaturan CRM */}
            <div>
              <button
                type="button"
                onClick={() =>
                  setOpenDropdowns((prev) => ({ ...prev, settings: !prev.settings }))
                }
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium transition-colors ${
                  isSystemSettingsActive
                    ? 'bg-[#1E2438] text-white'
                    : 'text-gray-400 hover:bg-[#1E2438]/60 hover:text-gray-100'
                }`}
              >
                <Settings
                  className={`w-4 h-4 shrink-0 ${
                    isSystemSettingsActive ? 'text-indigo-400' : 'text-gray-400'
                  }`}
                />
                <span className="truncate flex-1 text-left">Pengaturan CRM</span>
                {openDropdowns.settings ? (
                  <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                )}
              </button>
              {openDropdowns.settings && (
                <div className="mt-0.5 ml-3 pl-2.5 border-l border-[#242B42] space-y-0.5">
                  {settingsSubItems.map((sub) => {
                    const SubIcon = sub.icon;
                    const active = currentTab === 'settings' && settingsSection === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => handleOpenSettingsSub(sub.id)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          active
                            ? 'bg-indigo-600/20 text-indigo-300'
                            : 'text-gray-400 hover:bg-[#1E2438]/50 hover:text-gray-200'
                        }`}
                      >
                        <SubIcon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate text-left">{sub.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* User Card */}
      {(user || onOpenLanding) && (
        <div className="p-3 border-t border-[#1E2438] space-y-2">
          {onOpenLanding && (
            <button
              type="button"
              onClick={() => {
                onOpenLanding();
                onClose?.();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-gray-300 bg-[#181D2D]/80 hover:bg-[#1E2438] hover:text-white border border-[#242B42] transition-colors"
            >
              <Home className="w-3.5 h-3.5 shrink-0 text-gray-400" />
              <span className="truncate">Halaman Utama CRM</span>
            </button>
          )}
          {user && (
            <div className="px-2.5 py-2 rounded-md bg-[#181D2D] border border-[#242B42] space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-white truncate min-w-0 flex-1">{user.name}</p>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase shrink-0 max-w-[96px] truncate ${
                    user.role === 'AGENT'
                      ? 'bg-sky-950/70 text-sky-300 border border-sky-800/60'
                      : 'bg-indigo-950/70 text-indigo-300 border border-indigo-800/60'
                  }`}
                  title={user.roleName || (user.role === 'AGENT' ? 'Agent' : 'Admin')}
                >
                  {user.roleName || (user.role === 'AGENT' ? 'Agent' : 'Admin')}
                </span>
                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    title="Keluar / Ganti Akun"
                    aria-label="Keluar / Ganti Akun"
                    className="p-1 rounded text-gray-400 hover:text-red-300 hover:bg-red-950/40 shrink-0 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="text-[11px] text-gray-400 truncate" title={user.email}>
                {user.email}
              </p>
            </div>
          )}
        </div>
      )}
    </aside>
    </>
  );
};

export default Sidebar;
