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
  Building2,
  Check,
  Pencil,
  Trash2,
  Eraser,
} from 'lucide-react';
import {
  AgentAvailabilityStatus,
  AuthStatus,
  LicenseInfo,
  SettingsSection,
  TenantWorkspaceItem,
} from '../types';
import { ReneoCrmLogo } from './ReneoCrmLogo';
import { CompanyProfileModal } from './CompanyProfileModal';
import { ConfirmModal } from './ui/ConfirmModal';
import { hasPerm } from '../lib/permissions';
import api from '../services/api';
import { useToast } from './ui/ToastProvider';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  settingsSection?: SettingsSection;
  onSelectSettingsSection?: (section: SettingsSection) => void;
  licenseInfo?: LicenseInfo | null;
  user?: AuthStatus['user'] | null;
  onOpenLanding?: () => void;
  onOpenPlans?: () => void;
  onUserUpdated?: (user: NonNullable<AuthStatus['user']>) => void;
  onWorkspaceSwitched?: (user: NonNullable<AuthStatus['user']>, license?: LicenseInfo) => void;
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
  onOpenPlans,
  onUserUpdated,
  onWorkspaceSwitched,
  onLogout,
  isOpen = false,
  onClose,
}) => {
  const toast = useToast();
  const isLicenseActive = !licenseInfo || (!licenseInfo.isExpired && licenseInfo.status !== 'UNLICENSED' && licenseInfo.status !== 'SUSPENDED');
  const feats = licenseInfo?.features;

  const isMenuUnlocked = (menuId: string): boolean => {
    if (!licenseInfo) return true;
    if (!isLicenseActive) return menuId === 'dashboard';
    if (Array.isArray(feats?.allowedMenus) && feats.allowedMenus.length > 0) {
      return feats.allowedMenus.includes(menuId);
    }
    switch (menuId) {
      case 'conversations':
        return Boolean(feats?.liveChatCrm);
      case 'comments':
      case 'feed':
        return Boolean(feats?.omnichannel);
      case 'birthday':
        return Boolean(feats?.birthdayAutomation);
      case 'tracking':
      case 'posts':
      case 'ideas':
        return Boolean(feats?.scheduledPosts);
      case 'automations':
        return feats?.autoReply !== undefined ? Boolean(feats.autoReply) : true;
      case 'ai-agent':
        return Boolean(feats?.aiAgent);
      default:
        return true;
    }
  };

  const isAdmin = !user || user.role === 'ADMIN';
  const canManageAgents = isAdmin || hasPerm(user, 'settings.agents');

  const [updatingAvailability, setUpdatingAvailability] = useState(false);
  const currentAvailability: AgentAvailabilityStatus =
    user?.availabilityStatus === 'AWAY' || user?.availabilityStatus === 'OFFLINE'
      ? user.availabilityStatus
      : 'ONLINE';

  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<TenantWorkspaceItem[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [showNewWorkspaceForm, setShowNewWorkspaceForm] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState<string | null>(null);
  const [showCompanyProfileModal, setShowCompanyProfileModal] = useState(false);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<TenantWorkspaceItem | null>(null);
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);
  const [showClearDataModal, setShowClearDataModal] = useState(false);
  const [clearingData, setClearingData] = useState(false);

  const loadWorkspaces = async () => {
    if (!user) return;
    setLoadingWorkspaces(true);
    try {
      const res = await api.getMyWorkspaces();
      setWorkspaces(res.workspaces || []);
    } catch {
      // ignore
    } finally {
      setLoadingWorkspaces(false);
    }
  };

  const handleToggleAvailability = async (next: AgentAvailabilityStatus) => {
    if (!user || updatingAvailability || next === currentAvailability) return;
    setUpdatingAvailability(true);
    try {
      const res = await api.updateMyAvailability(next);
      onUserUpdated?.(res.user);
      if (next === 'ONLINE') {
        toast.success('Status: Siap Aktivitas — siap menerima penugasan chat & eskalasi AI.');
      } else if (next === 'AWAY') {
        toast.info('Status: Istirahat — penugasan chat baru otomatis & eskalasi AI dijeda.');
      } else {
        toast.info('Status: Offline — tidak menerima penugasan otomatis baru.');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal memperbarui status kehadiran.');
    } finally {
      setUpdatingAvailability(false);
    }
  };

  const handleSwitchWorkspace = async (companyId: string) => {
    if (switchingWorkspaceId || companyId === (user?.companyId || licenseInfo?.companyId)) {
      setWorkspaceMenuOpen(false);
      return;
    }
    setSwitchingWorkspaceId(companyId);
    try {
      const res = await api.switchWorkspace(companyId);
      setWorkspaceMenuOpen(false);
      toast.success(`Beralih ke workspace "${res.company?.name || res.user.companyName}"`);
      onWorkspaceSwitched?.(res.user, res.license);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal beralih workspace perusahaan.');
    } finally {
      setSwitchingWorkspaceId(null);
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newWorkspaceName.trim();
    if (!cleanName || creatingWorkspace) return;
    setCreatingWorkspace(true);
    try {
      const res = await api.createMyWorkspace({ name: cleanName });
      setNewWorkspaceName('');
      setShowNewWorkspaceForm(false);
      setWorkspaceMenuOpen(false);
      const isAlreadyActive = res.license?.status === 'ACTIVE' && !res.license?.isExpired;
      toast.success(
        isAlreadyActive
          ? `Bisnis "${cleanName}" berhasil dibuat dan langsung aktif (${res.license.plan}).`
          : `Bisnis "${cleanName}" berhasil dibuat. Silakan pilih paket lisensi untuk mengaktifkannya.`
      );
      onWorkspaceSwitched?.(res.user, res.license);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal membuat workspace baru.');
    } finally {
      setCreatingWorkspace(false);
    }
  };

  const handleConfirmDeleteWorkspace = async () => {
    if (!workspaceToDelete || deletingWorkspace) return;
    const target = workspaceToDelete;
    setDeletingWorkspace(true);
    try {
      const res = await api.deleteMyWorkspace(target.id);
      setWorkspaces((prev) => prev.filter((ws) => ws.id !== target.id));
      setWorkspaceToDelete(null);
      if (res.switched && res.user) {
        setWorkspaceMenuOpen(false);
        toast.success(
          `Bisnis "${target.name}" dihapus permanen. Beralih ke "${res.company?.name || res.user.companyName}".`
        );
        onWorkspaceSwitched?.(res.user, res.license);
      } else {
        toast.success(`Bisnis "${target.name}" beserta seluruh datanya telah dihapus permanen.`);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || `Gagal menghapus bisnis "${target.name}".`);
    } finally {
      setDeletingWorkspace(false);
    }
  };

  const handleConfirmClearCompanyData = async () => {
    if (clearingData || !user) return;
    setClearingData(true);
    try {
      const res = await api.clearCurrentCompanyData();
      setShowClearDataModal(false);
      setWorkspaceMenuOpen(false);
      toast.success(
        res.message || 'Seluruh data operasional bisnis ini berhasil dibersihkan.'
      );
      onWorkspaceSwitched?.(user, res.license);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal membersihkan data bisnis ini.');
    } finally {
      setClearingData(false);
    }
  };

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
        {
          id: 'conversations',
          label: 'Inbox CRM',
          icon: MessageCircle,
          locked: !isMenuUnlocked('conversations'),
          lockReason: 'Inbox Live Chat CRM tersedia mulai paket Growth Pro.',
        },
        {
          id: 'comments',
          label: 'Komentar',
          icon: MessageSquare,
          locked: !isMenuUnlocked('comments'),
          lockReason: 'Manajemen Komentar Sosial tersedia mulai paket Growth Pro.',
          perm: 'conversations',
        },
        {
          id: 'feed',
          label: 'Feed Sosial',
          icon: Radio,
          locked: !isMenuUnlocked('feed'),
          lockReason: 'Feed Media Sosial tersedia mulai paket Growth Pro.',
          perm: 'conversations',
        },
      ],
    },
    {
      title: 'Pelanggan & Siaran',
      items: [
        { id: 'contacts', label: 'Kontak', icon: Users, locked: !isMenuUnlocked('contacts') },
        {
          id: 'broadcasts',
          label: 'Siaran & Kampanye',
          icon: Send,
          locked: !isMenuUnlocked('broadcasts'),
          perm: 'broadcasts',
        },
        {
          id: 'birthday',
          label: 'Ulang Tahun',
          icon: Cake,
          locked: !isMenuUnlocked('birthday'),
          lockReason: 'Otomasi Ulang Tahun tidak termasuk dalam paket Anda saat ini.',
        },
        {
          id: 'tracking',
          label: 'Pelacakan Status',
          icon: CheckCheck,
          locked: !isMenuUnlocked('tracking'),
          lockReason: 'Pelacakan Story & Status WA tersedia mulai paket Growth Pro.',
        },
      ],
    },
    {
      title: 'Publikasi Konten',
      items: [
        {
          id: 'posts',
          label: 'Jadwal Post',
          icon: CalendarClock,
          locked: !isMenuUnlocked('posts'),
          lockReason: 'Jadwal Post & Story WA tersedia mulai paket Growth Pro.',
          perm: 'broadcasts',
        },
        {
          id: 'ideas',
          label: 'Ide Konten',
          icon: Lightbulb,
          locked: !isMenuUnlocked('ideas'),
          lockReason: 'Perencana Ide Konten tersedia mulai paket Growth Pro.',
          perm: 'broadcasts',
        },
        { id: 'media', label: 'Galeri', icon: ImageIcon, locked: !isMenuUnlocked('media'), perm: 'broadcasts' },
      ],
    },
    {
      title: 'Otomasi & AI',
      items: [
        {
          id: 'automations',
          label: 'Otomasi Komentar',
          icon: Zap,
          locked: !isMenuUnlocked('automations'),
          lockReason: 'Otomasi balasan tidak termasuk pada paket Anda saat ini.',
          perm: 'settings',
        },
        {
          id: 'ai-agent',
          label: 'Agent AI & KB',
          icon: Bot,
          locked: !isMenuUnlocked('ai-agent'),
          lockReason: 'Agent AI & Knowledge Book tersedia pada paket Business AI dan Enterprise.',
          perm: 'settings',
        },
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

        {/* Multi-Tenant Workspace Switcher (Each workspace has its own license subscription) */}
        {user && (
          <div className="px-3 py-2.5 border-b border-[#1E2438]">
            <button
              type="button"
              onClick={() => {
                const nextOpen = !workspaceMenuOpen;
                setWorkspaceMenuOpen(nextOpen);
                if (nextOpen) {
                  void loadWorkspaces();
                }
              }}
              className={`w-full px-2.5 py-2 rounded-lg border flex items-center justify-between gap-2 text-left transition-colors ${
                workspaceMenuOpen
                  ? 'bg-[#1B2235] border-indigo-500/40'
                  : 'bg-[#171C2B] hover:bg-[#1D2336] border-[#252D45]'
              }`}
              title="Kelola atau beralih workspace bisnis"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-md bg-indigo-500/15 border border-indigo-500/25 text-indigo-400 flex items-center justify-center shrink-0">
                  <Building2 className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate leading-tight">
                    {user.companyName || licenseInfo?.companyName || 'Workspace Utama'}
                  </div>
                  <div className="text-[10.5px] text-gray-400 truncate mt-0.5 leading-tight">
                    {licenseInfo?.plan || 'Lisensi Aktif'}
                  </div>
                </div>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${
                  workspaceMenuOpen ? 'rotate-180 text-indigo-300' : ''
                }`}
              />
            </button>

            {workspaceMenuOpen && (
              <div className="mt-1.5 rounded-lg bg-[#151A28] border border-[#262F48] overflow-hidden text-xs shadow-xl">
                {/* Compact Single-Line Header */}
                <div className="px-2.5 py-2 border-b border-[#222A40] flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">
                    Bisnis Anda {!loadingWorkspaces && workspaces.length > 0 ? `(${workspaces.length})` : ''}
                  </span>
                  {isAdmin && !showNewWorkspaceForm && (
                    <button
                      type="button"
                      onClick={() => setShowNewWorkspaceForm(true)}
                      className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-0.5 whitespace-nowrap transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Baru</span>
                    </button>
                  )}
                </div>

                {/* Clean Flat Workspace List */}
                <div className="p-1.5 max-h-48 overflow-y-auto space-y-0.5 sidebar-scroll">
                  {loadingWorkspaces ? (
                    <div className="px-2 py-2 text-[11px] text-gray-400 text-center">
                      Memuat daftar bisnis...
                    </div>
                  ) : (
                    workspaces.map((ws) => {
                      const active = ws.isCurrent || ws.id === user.companyId;
                      const isUnlicensed = ws.license.status === 'UNLICENSED';
                      const isExpired = !isUnlicensed && ws.license.isExpired;
                      const canDelete = isAdmin && !ws.isDefault && workspaces.length > 1;
                      const statusDotCls = isUnlicensed
                        ? 'bg-amber-400'
                        : isExpired
                        ? 'bg-red-400'
                        : 'bg-emerald-400';
                      const statusText = isUnlicensed
                        ? 'Belum Berlisensi'
                        : isExpired
                        ? 'Lisensi Berakhir'
                        : `${ws.license.plan} · ${ws.license.daysLeft}h`;

                      return (
                        <div
                          key={ws.id}
                          className={`group rounded-md flex items-center gap-1 px-2 py-1.5 transition-colors ${
                            active
                              ? 'bg-indigo-500/15 text-white'
                              : 'text-gray-300 hover:bg-[#1E2538]'
                          }`}
                        >
                          <button
                            type="button"
                            disabled={Boolean(switchingWorkspaceId)}
                            onClick={() => void handleSwitchWorkspace(ws.id)}
                            className="min-w-0 flex-1 text-left focus-visible:outline-none"
                            title={`${ws.name} — ${statusText}`}
                          >
                            <div className="text-xs font-medium truncate leading-snug">
                              {ws.name}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-gray-400 min-w-0">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotCls}`} />
                              <span className="truncate">{statusText}</span>
                            </div>
                          </button>

                          {active ? (
                            <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          ) : canDelete ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setWorkspaceToDelete(ws);
                              }}
                              className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 opacity-70 group-hover:opacity-100 transition-colors shrink-0"
                              title={`Hapus bisnis ${ws.name}`}
                              aria-label={`Hapus bisnis ${ws.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Inline New Workspace Form or Clean Stacked Actions */}
                {isAdmin && (
                  <div className="p-1.5 border-t border-[#222A40] bg-[#121623]/70">
                    {showNewWorkspaceForm ? (
                      <form onSubmit={handleCreateWorkspace} className="p-1 space-y-2">
                        <input
                          type="text"
                          value={newWorkspaceName}
                          onChange={(e) => setNewWorkspaceName(e.target.value)}
                          placeholder="Nama bisnis / cabang baru..."
                          className="w-full h-8 px-2.5 rounded-md bg-[#0E121D] border border-[#2B3554] text-white text-xs focus:outline-none focus:border-indigo-400"
                          autoFocus
                        />
                        <p className="text-[10px] text-gray-400 leading-snug">
                          Bisnis baru memiliki ruang kerja &amp; lisensi terpisah.
                        </p>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setShowNewWorkspaceForm(false);
                              setNewWorkspaceName('');
                            }}
                            className="px-2 py-1 rounded text-[11px] text-gray-400 hover:text-white"
                          >
                            Batal
                          </button>
                          <button
                            type="submit"
                            disabled={creatingWorkspace || !newWorkspaceName.trim()}
                            className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-[11px] font-semibold"
                          >
                            {creatingWorkspace ? 'Membuat...' : 'Buat'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="space-y-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setWorkspaceMenuOpen(false);
                            setShowCompanyProfileModal(true);
                          }}
                          className="w-full px-2 py-1.5 rounded-md text-[11.5px] font-medium text-gray-300 hover:text-white hover:bg-[#1E2538] flex items-center gap-2 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="truncate">Edit Profil Bisnis</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowClearDataModal(true)}
                          className="w-full px-2 py-1.5 rounded-md text-[11.5px] font-medium text-amber-300/90 hover:text-amber-200 hover:bg-amber-500/10 flex items-center gap-2 transition-colors"
                        >
                          <Eraser className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">Bersihkan Data Bisnis</span>
                        </button>
                        {(() => {
                          const currentWs = workspaces.find((ws) => ws.isCurrent || ws.id === user.companyId);
                          if (!currentWs || currentWs.isDefault || workspaces.length <= 1) return null;
                          return (
                            <button
                              type="button"
                              onClick={() => setWorkspaceToDelete(currentWs)}
                              className="w-full px-2 py-1.5 rounded-md text-[11.5px] font-medium text-red-400/90 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">Hapus Bisnis Ini</span>
                            </button>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
        {isItemAllowed('broadcasts') && isItemAllowed('broadcasts.send') && (
          <button
            type="button"
            onClick={() => {
              if (!isMenuUnlocked('posts')) {
                toast.info('Menu Jadwal Post & Story WA tersedia mulai paket Growth Pro.');
                onOpenPlans?.();
                return;
              }
              setCurrentTab('posts');
              onClose?.();
            }}
            className="w-full h-8 px-3 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>Buat Post</span>
            {!isMenuUnlocked('posts') && <Lock className="w-3 h-3 text-amber-300 shrink-0" />}
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
              {visibleItems.map((item: any) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.locked) {
                        toast.info(
                          item.lockReason ||
                            `Menu "${item.label}" terkunci pada paket "${licenseInfo?.plan || 'Saat Ini'}". Silakan upgrade paket lisensi.`
                        );
                        onOpenPlans?.();
                        return;
                      }
                      setCurrentTab(item.id);
                      onClose?.();
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium transition-colors ${
                      isActive
                        ? 'bg-[#1E2438] text-white'
                        : item.locked
                        ? 'text-gray-500 hover:bg-[#1E2438]/40 hover:text-gray-300'
                        : 'text-gray-400 hover:bg-[#1E2438]/60 hover:text-gray-100'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-indigo-400' : item.locked ? 'text-gray-500' : 'text-gray-400'
                      }`}
                    />
                    <span className="truncate flex-1 text-left">{item.label}</span>
                    {item.locked && (
                      <span
                        title={
                          item.lockReason ||
                          'Terkunci oleh paket lisensi — klik untuk melihat paket upgrade'
                        }
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
      {user && (
        <div className="p-3 border-t border-[#1E2438] space-y-2">
          <div className="px-2.5 py-2 rounded-md bg-[#181D2D] border border-[#242B42] space-y-2">
              <div className="space-y-0.5">
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

              {/* Agent Self-Service Availability Status (Siap / Istirahat / Offline) */}
              <div className="pt-1.5 border-t border-[#242B42] space-y-1">
                <div className="flex items-center justify-between text-[10px] text-gray-400">
                  <span>Status Kehadiran CS</span>
                  <span className="font-medium text-gray-300">
                    {currentAvailability === 'ONLINE'
                      ? 'Siap Aktivitas'
                      : currentAvailability === 'AWAY'
                      ? 'Sedang Istirahat'
                      : 'Offline'}
                  </span>
                </div>
                <div
                  role="group"
                  aria-label="Ubah status kehadiran agen"
                  className="grid grid-cols-3 gap-1 bg-[#111521] p-0.5 rounded-md border border-[#242B42]"
                >
                  {(
                    [
                      {
                        id: 'ONLINE' as const,
                        label: 'Siap',
                        dot: 'bg-emerald-400',
                        activeCls: 'bg-emerald-950/80 text-emerald-200 border border-emerald-700/60',
                        hint: 'Siap menerima penugasan chat otomatis & eskalasi AI',
                      },
                      {
                        id: 'AWAY' as const,
                        label: 'Istirahat',
                        dot: 'bg-amber-400',
                        activeCls: 'bg-amber-950/80 text-amber-200 border border-amber-700/60',
                        hint: 'Aktif login tetapi jeda menerima chat baru otomatis & eskalasi AI',
                      },
                      {
                        id: 'OFFLINE' as const,
                        label: 'Offline',
                        dot: 'bg-gray-400',
                        activeCls: 'bg-slate-800 text-gray-200 border border-slate-600',
                        hint: 'Tidak menerima penugasan chat baru',
                      },
                    ]
                  ).map((opt) => {
                    const active = currentAvailability === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={updatingAvailability}
                        onClick={() => void handleToggleAvailability(opt.id)}
                        title={opt.hint}
                        className={`py-1 px-1.5 rounded text-[10px] font-semibold inline-flex items-center justify-center gap-1 transition-colors disabled:opacity-60 ${
                          active ? opt.activeCls : 'text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${opt.dot}`} />
                        <span className="truncate">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
        </div>
      )}
    </aside>
    {user && isAdmin && (
      <CompanyProfileModal
        isOpen={showCompanyProfileModal}
        onClose={() => setShowCompanyProfileModal(false)}
        onSaved={(updated) => {
          onUserUpdated?.({ ...user, companyName: updated.name });
          setWorkspaces((prev) =>
            prev.map((ws) => (ws.id === updated.id ? { ...ws, name: updated.name } : ws))
          );
        }}
      />
    )}
    <ConfirmModal
      isOpen={workspaceToDelete !== null}
      onClose={() => !deletingWorkspace && setWorkspaceToDelete(null)}
      onConfirm={handleConfirmDeleteWorkspace}
      isLoading={deletingWorkspace}
      title={`Hapus Bisnis "${workspaceToDelete?.name || ''}"?`}
      description={
        workspaceToDelete && (workspaceToDelete.isCurrent || workspaceToDelete.id === user?.companyId)
          ? `Seluruh data kontak, riwayat chat, jadwal kampanye, kanal, dan pengaturan pada bisnis "${workspaceToDelete.name}" akan dihapus permanen. Setelah dihapus, sistem otomatis memindahkan Anda ke bisnis lain yang masih aktif.`
          : `Seluruh data kontak, riwayat chat, jadwal kampanye, kanal, dan pengaturan pada bisnis "${workspaceToDelete?.name || ''}" akan dihapus permanen dan tidak dapat dibatalkan.`
      }
      confirmLabel="Hapus Bisnis"
      variant="danger"
    />
    <ConfirmModal
      isOpen={showClearDataModal && Boolean(user)}
      onClose={() => !clearingData && setShowClearDataModal(false)}
      onConfirm={handleConfirmClearCompanyData}
      isLoading={clearingData}
      title={`Bersihkan Data "${user?.companyName || licenseInfo?.companyName || 'Bisnis Ini'}"?`}
      description="Seluruh data operasional pada bisnis ini (kontak, percakapan, pesan, siaran/kampanye, jadwal post, dan komentar) akan dihapus permanen. Workspace bisnis, paket lisensi aktif, akun tim/agen CS, dan pengaturan koneksi kanal tetap aman."
      confirmLabel="Bersihkan Data"
      variant="danger"
    />
    </>
  );
};

export default Sidebar;
