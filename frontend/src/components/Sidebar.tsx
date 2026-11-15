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
  Star,
  Plug,
  CalendarClock,
  Lightbulb,
  Image as ImageIcon,
  Plus,
  MessageSquare,
  Radio,
  Zap,
} from 'lucide-react';
import { AuthStatus, LicenseInfo, SettingsSection } from '../types';
import { ReneoCrmLogo } from './ReneoCrmLogo';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  settingsSection?: SettingsSection;
  onSelectSettingsSection?: (section: SettingsSection) => void;
  licenseInfo?: LicenseInfo | null;
  user?: AuthStatus['user'] | null;
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
  onLogout,
  isOpen = false,
  onClose,
}) => {
  const isLiveChatUnlocked = Boolean(
    licenseInfo && !licenseInfo.isExpired && licenseInfo.features?.liveChatCrm
  );
  const isAdmin = !user || user.role !== 'AGENT';

  const isIntegrationsActive =
    currentTab === 'settings' &&
    (settingsSection === 'whatsapp' || settingsSection === 'omnichannel');
  const isSystemSettingsActive =
    currentTab === 'settings' &&
    (settingsSection === 'automation' ||
      settingsSection === 'crm_products' ||
      settingsSection === 'agents');

  const [openDropdowns, setOpenDropdowns] = useState<{
    integrations: boolean;
    settings: boolean;
  }>({
    integrations: true,
    settings: isSystemSettingsActive,
  });

  useEffect(() => {
    if (isIntegrationsActive) {
      setOpenDropdowns((prev) => ({ ...prev, integrations: true }));
    }
    if (isSystemSettingsActive) {
      setOpenDropdowns((prev) => ({ ...prev, settings: true }));
    }
  }, [isIntegrationsActive, isSystemSettingsActive]);

  const menuGroups = [
    {
      title: 'Overview',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, locked: false },
      ],
    },
    {
      title: 'Publikasi',
      items: [
        { id: 'posts', label: 'Posts', icon: CalendarClock, locked: false, perm: 'broadcasts' },
        { id: 'ideas', label: 'Ideas', icon: Lightbulb, locked: false, perm: 'broadcasts' },
        { id: 'media', label: 'Media', icon: ImageIcon, locked: false, perm: 'broadcasts' },
      ],
    },
    {
      title: 'Interaksi & CRM',
      items: [
        { id: 'comments', label: 'Comments', icon: MessageSquare, locked: false },
        { id: 'conversations', label: 'Inbox CRM', icon: MessageCircle, locked: !isLiveChatUnlocked },
        { id: 'feed', label: 'Feed', icon: Radio, locked: false },
        { id: 'automations', label: 'Automations', icon: Zap, locked: false, perm: 'settings' },
        { id: 'ai-agent', label: 'Agent AI', icon: Bot, locked: false, perm: 'settings' },
        { id: 'contacts', label: 'Kontak', icon: Users, locked: false },
        { id: 'broadcasts', label: 'Siaran', icon: Send, locked: false, perm: 'broadcasts' },
        { id: 'birthday', label: 'Ulang Tahun', icon: Cake, locked: false },
        { id: 'tracking', label: 'Pelacakan', icon: CheckCheck, locked: false },
      ],
    },
  ];

  const integrationSubItems: { id: SettingsSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'whatsapp', label: 'WhatsApp (WAHA)', icon: Smartphone },
    { id: 'omnichannel', label: 'Omnichannel', icon: Globe },
  ];

  const settingsSubItems: { id: SettingsSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'automation', label: 'Otomatisasi & Bot', icon: Bot },
    { id: 'crm_products', label: 'CSAT, SLA & Produk', icon: Star },
    ...(isAdmin ? [{ id: 'agents' as const, label: 'Tim & Akses', icon: Users }] : []),
  ];

  const isItemAllowed = (id: string) => {
    if (!user || user.role === 'ADMIN' || !Array.isArray(user.permissions)) return true;
    return user.permissions.includes(id);
  };

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
        className={`fixed inset-y-0 left-0 z-40 w-60 bg-[#121622] text-gray-200 flex flex-col h-screen shrink-0 border-r border-[#1E2438] select-none transition-transform duration-200 lg:static lg:translate-x-0 ${
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
        {isItemAllowed('broadcasts') && (
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

        {isItemAllowed('settings') && (
          <div className="space-y-1">
            <div className="px-2.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Konfigurasi
            </div>

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

            {/* Dropdown: Pengaturan */}
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
                <span className="truncate flex-1 text-left">Pengaturan</span>
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
      {user && (
        <div className="p-3 border-t border-[#1E2438]">
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-[#181D2D] border border-[#242B42]">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-white truncate">{user.name}</p>
              <p className="text-[10px] text-gray-400 truncate">{user.email}</p>
            </div>
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase shrink-0 ${
                user.role === 'AGENT'
                  ? 'bg-sky-950/70 text-sky-300 border border-sky-800/60'
                  : 'bg-indigo-950/70 text-indigo-300 border border-indigo-800/60'
              }`}
            >
              {user.role === 'AGENT' ? 'Agent' : 'Admin'}
            </span>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                title="Keluar / Ganti Akun"
                className="p-1 rounded text-gray-400 hover:text-red-300 hover:bg-red-950/40 shrink-0 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
    </>
  );
};

export default Sidebar;
