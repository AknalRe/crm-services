import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Server,
  Globe,
  Trash2,
  Edit3,
  Search,
  ShieldCheck,
  Plus,
  Lock,
  Users,
  ChevronDown,
  ChevronRight,
  Eye,
} from 'lucide-react';
import api from '../services/api';
import { subscribeLiveEvent } from '../services/liveEvents';
import { AutomationSettings } from '../components/AutomationSettings';
import { MasterDataSettings, MasterDataSection } from '../components/MasterDataSettings';
import { SlaRoutingCsatSettings } from '../components/SlaRoutingCsatSettings';
import { OmnichannelSettings } from '../components/OmnichannelSettings';
import {
  AgentItem,
  AgentQuota,
  AuthStatus,
  CrmRoleItem,
  LicenseInfo,
  PermissionCatalogItem,
  SettingsSection,
  WahaSessionItem,
  WahaStatus,
  WahaPrivacyConfig,
  WahaSessionPrivacyRule,
} from '../types';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useToast } from '../components/ui/ToastProvider';
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_CATALOG_UI,
  groupPermissionCatalog,
  hasPerm,
} from '../lib/permissions';

function togglePermissionWithParent(prev: string[], perm: string): string[] {
  const isSelected = prev.includes(perm);
  if (isSelected) {
    if (!perm.includes('.')) {
      return prev.filter((item) => item !== perm && !item.startsWith(`${perm}.`));
    }
    return prev.filter((item) => item !== perm);
  }
  const next = new Set(prev);
  next.add(perm);
  if (perm.includes('.')) {
    const parentMenu = perm.split('.')[0];
    if ((ALL_PERMISSION_KEYS as readonly string[]).includes(parentMenu)) {
      next.add(parentMenu);
    }
  }
  return Array.from(next);
}

interface SettingsProps {
  wahaStatus: WahaStatus | null;
  licenseInfo?: LicenseInfo | null;
  currentUser?: AuthStatus['user'] | null;
  activeSection?: SettingsSection;
  onSectionChange?: (section: SettingsSection) => void;
  onOpenPlans?: () => void;
  onRefreshStatus: () => Promise<WahaStatus | null> | void;
  onOpenQr: (sessionName?: string) => void;
}

const WAHA_DRAFT_STORAGE_KEY = 'reneo_crm_waha_draft_v1';

interface WahaUiDraft {
  configMode?: 'INTERNAL' | 'EXTERNAL';
  baseUrl?: string;
}

function readWahaUiDraft(): WahaUiDraft | null {
  try {
    const raw = window.sessionStorage.getItem(WAHA_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeWahaUiDraft(patch: WahaUiDraft | null) {
  try {
    if (!patch) {
      window.sessionStorage.removeItem(WAHA_DRAFT_STORAGE_KEY);
      return;
    }
    const prev = readWahaUiDraft() || {};
    window.sessionStorage.setItem(WAHA_DRAFT_STORAGE_KEY, JSON.stringify({ ...prev, ...patch }));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export const Settings: React.FC<SettingsProps> = ({
  wahaStatus,
  licenseInfo,
  currentUser,
  activeSection,
  onSectionChange,
  onOpenPlans,
  onRefreshStatus,
  onOpenQr,
}) => {
  const toast = useToast();
  const isMultiSessionAllowed = Boolean(
    licenseInfo && !licenseInfo.isExpired && licenseInfo.features?.multiSession
  );
  const maxSessions = licenseInfo?.features?.maxSessions || 1;
  const initialDraftRef = useRef<WahaUiDraft | null>(readWahaUiDraft());
  const [configMode, setConfigMode] = useState<'INTERNAL' | 'EXTERNAL'>(
    initialDraftRef.current?.configMode || 'INTERNAL'
  );
  const [baseUrl, setBaseUrl] = useState(initialDraftRef.current?.baseUrl || '');
  const [apiKey, setApiKey] = useState('');
  const [session, setSession] = useState('default');
  const [saving, setSaving] = useState(false);

  const [sessions, setSessions] = useState<WahaSessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [testingExternal, setTestingExternal] = useState(false);
  const [activatingInternal, setActivatingInternal] = useState(false);
  const [externalTestResult, setExternalTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const externalDirtyRef = useRef(Boolean(initialDraftRef.current?.baseUrl !== undefined));
  const tabUserPickedRef = useRef(Boolean(initialDraftRef.current?.configMode));
  const lastServerModeRef = useRef<string>('');
  const lastExternalKeyRef = useRef<string>('');
  const [newSessionName, setNewSessionName] = useState('');
  const [sessionSearch, setSessionSearch] = useState('');
  const [inspectedSessionName, setInspectedSessionName] = useState<string>('');
  const [creatingSession, setCreatingSession] = useState(false);
  const [sessionBusyName, setSessionBusyName] = useState<string | null>(null);

  const [testPhone, setTestPhone] = useState('');
  const [testSession, setTestSession] = useState('');
  const [testMessage, setTestMessage] = useState('Halo, ini adalah pesan uji coba dari CRM WhatsApp.');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const [sessionActionLoading, setSessionActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'stop' | 'logout' | null>(null);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState<string | null>(null);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [webhookUrlDraft, setWebhookUrlDraft] = useState('');
  const webhookDirtyRef = useRef(false);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [syncingWebhook, setSyncingWebhook] = useState(false);

  // Multi-Agent & Role state (ADMIN or settings.agents)
  const isFullAdmin = !currentUser || currentUser.role === 'ADMIN';
  const canManageAgents = isFullAdmin || hasPerm(currentUser, 'settings.agents');
  const canEditSettings = isFullAdmin || hasPerm(currentUser, 'settings.edit');
  const [agentsSubTab, setAgentsSubTab] = useState<'agents' | 'roles'>('agents');
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [roles, setRoles] = useState<CrmRoleItem[]>([]);
  const [permissionCatalog, setPermissionCatalog] =
    useState<PermissionCatalogItem[]>(PERMISSION_CATALOG_UI);
  const [agentQuota, setAgentQuota] = useState<AgentQuota | null>(null);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentEmail, setAgentEmail] = useState('');
  const [agentPassword, setAgentPassword] = useState('');
  const [agentRole, setAgentRole] = useState<'ADMIN' | 'AGENT'>('AGENT');
  const [agentRoleId, setAgentRoleId] = useState<string>('role_cs');
  const [agentPermissions, setAgentPermissions] = useState<string[]>([
    'dashboard',
    'contacts',
    'contacts.create',
    'contacts.edit',
    'conversations',
    'conversations.reply',
    'conversations.manage',
    'conversations.csat',
    'tracking',
  ]);
  const [savingAgent, setSavingAgent] = useState(false);
  const [confirmDeleteAgent, setConfirmDeleteAgent] = useState<AgentItem | null>(null);

  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleNameInput, setRoleNameInput] = useState('');
  const [roleDescInput, setRoleDescInput] = useState('');
  const [rolePermissionsInput, setRolePermissionsInput] = useState<string[]>([
    'dashboard',
    'contacts',
    'contacts.create',
    'contacts.edit',
    'conversations',
    'conversations.reply',
    'conversations.manage',
  ]);
  const [savingRole, setSavingRole] = useState(false);
  const [confirmDeleteRole, setConfirmDeleteRole] = useState<CrmRoleItem | null>(null);
  const [internalTab, setInternalTab] = useState<SettingsSection>('whatsapp');
  const [showMobileWahaTest, setShowMobileWahaTest] = useState(false);
  const [showMobileWahaWebhook, setShowMobileWahaWebhook] = useState(false);
  const [privacyConfig, setPrivacyConfig] = useState<WahaPrivacyConfig>({
    general: {
      autoReadOnOpen: true,
      sendOnlinePresence: true,
      readReceipts: true,
    },
    sessions: {},
  });
  const [privacyScope, setPrivacyScope] = useState<string>('__GENERAL__');
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const settingsTab = activeSection ?? internalTab;
  const setSettingsTab = (sec: SettingsSection) => {
    setInternalTab(sec);
    onSectionChange?.(sec);
  };

  const groupedPermissionCatalog = useMemo(
    () => groupPermissionCatalog(permissionCatalog),
    [permissionCatalog]
  );

  const permissionLabelMap = useMemo(
    () => new Map(permissionCatalog.map((item) => [item.id, item.label])),
    [permissionCatalog]
  );

  const fetchAgents = useCallback(async () => {
    if (!canManageAgents) return;
    setAgentsLoading(true);
    try {
      const data = await api.getAgents();
      setAgents(data.agents || []);
      setRoles(data.roles || []);
      if (Array.isArray(data.permissionCatalog) && data.permissionCatalog.length > 0) {
        setPermissionCatalog(data.permissionCatalog);
      }
      setAgentQuota(data.quota || null);
    } catch {
      setAgents([]);
    } finally {
      setAgentsLoading(false);
    }
  }, [canManageAgents]);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    api
      .getWahaPrivacy()
      .then((cfg) => {
        if (cfg?.general) setPrivacyConfig(cfg);
      })
      .catch(() => {});
  }, []);

  const activePrivacyRule: WahaSessionPrivacyRule = useMemo(() => {
    if (privacyScope === '__GENERAL__') return privacyConfig.general;
    const override = privacyConfig.sessions?.[privacyScope];
    return {
      autoReadOnOpen:
        typeof override?.autoReadOnOpen === 'boolean'
          ? override.autoReadOnOpen
          : privacyConfig.general.autoReadOnOpen,
      sendOnlinePresence:
        typeof override?.sendOnlinePresence === 'boolean'
          ? override.sendOnlinePresence
          : privacyConfig.general.sendOnlinePresence,
      readReceipts:
        typeof override?.readReceipts === 'boolean'
          ? override.readReceipts
          : privacyConfig.general.readReceipts,
    };
  }, [privacyConfig, privacyScope]);

  const isSessionPrivacyOverridden =
    privacyScope !== '__GENERAL__' && Boolean(privacyConfig.sessions?.[privacyScope]);

  const handleTogglePrivacyField = (
    field: keyof WahaSessionPrivacyRule,
    nextVal: boolean
  ) => {
    setPrivacyConfig((prev) => {
      if (privacyScope === '__GENERAL__') {
        return {
          ...prev,
          general: {
            ...prev.general,
            [field]: nextVal,
          },
        };
      }
      return {
        ...prev,
        sessions: {
          ...prev.sessions,
          [privacyScope]: {
            ...(prev.sessions?.[privacyScope] || {}),
            [field]: nextVal,
          },
        },
      };
    });
  };

  const handleResetSessionPrivacyOverride = (sessionName: string) => {
    setPrivacyConfig((prev) => {
      const nextSessions = { ...(prev.sessions || {}) };
      delete nextSessions[sessionName];
      return {
        ...prev,
        sessions: nextSessions,
      };
    });
  };

  const handleSavePrivacyConfig = async () => {
    if (!canEditSettings || savingPrivacy) return;
    setSavingPrivacy(true);
    try {
      const saved = await api.updateWahaPrivacy(privacyConfig);
      setPrivacyConfig(saved);
      toast.success('Pengaturan privasi & tanda baca WhatsApp berhasil disimpan.');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan pengaturan privasi.');
    } finally {
      setSavingPrivacy(false);
    }
  };

  const resetAgentForm = () => {
    setEditingAgentId(null);
    setAgentName('');
    setAgentEmail('');
    setAgentPassword('');
    const csStarter = roles.find((r) => r.id === 'role_cs') || roles.find((r) => r.id !== 'role_admin');
    setAgentRole('AGENT');
    setAgentRoleId(csStarter ? csStarter.id : '__CUSTOM__');
    setAgentPermissions(
      csStarter
        ? csStarter.permissions
        : [
            'dashboard',
            'contacts',
            'contacts.create',
            'contacts.edit',
            'conversations',
            'conversations.reply',
            'conversations.manage',
            'conversations.csat',
            'tracking',
          ]
    );
    setShowAgentForm(false);
  };

  const handleStartEditAgent = (agent: AgentItem) => {
    setEditingAgentId(agent.id);
    setAgentName(agent.name);
    setAgentEmail(agent.email);
    setAgentPassword('');
    setAgentRole(agent.role);
    setAgentRoleId(
      agent.role === 'ADMIN' ? 'role_admin' : agent.roleId ? agent.roleId : '__CUSTOM__'
    );
    setAgentPermissions(agent.permissions || []);
    setShowAgentForm(true);
  };

  const handleSelectAgentRoleTemplate = (nextRoleId: string) => {
    setAgentRoleId(nextRoleId);
    if (nextRoleId === 'role_admin') {
      setAgentRole('ADMIN');
      setAgentPermissions([...ALL_PERMISSION_KEYS]);
      return;
    }
    setAgentRole('AGENT');
    if (nextRoleId === '__CUSTOM__') {
      return;
    }
    const matched = roles.find((r) => r.id === nextRoleId);
    if (matched) {
      setAgentPermissions(matched.permissions || []);
    }
  };

  const togglePermission = (perm: string) => {
    setAgentPermissions((prev) => togglePermissionWithParent(prev, perm));
  };

  const resetRoleForm = () => {
    setEditingRoleId(null);
    setRoleNameInput('');
    setRoleDescInput('');
    setRolePermissionsInput([
      'dashboard',
      'contacts',
      'contacts.create',
      'contacts.edit',
      'conversations',
      'conversations.reply',
      'conversations.manage',
    ]);
    setShowRoleForm(false);
  };

  const handleStartCreateRole = () => {
    resetRoleForm();
    setShowRoleForm(true);
  };

  const handleStartEditRole = (role: CrmRoleItem) => {
    setEditingRoleId(role.id);
    setRoleNameInput(role.name);
    setRoleDescInput(role.description || '');
    setRolePermissionsInput(Array.isArray(role.permissions) ? role.permissions : []);
    setShowRoleForm(true);
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleNameInput.trim()) {
      toast.error('Nama role wajib diisi.');
      return;
    }
    if (rolePermissionsInput.length === 0) {
      toast.error('Pilih minimal 1 izin menu/aksi untuk role ini.');
      return;
    }
    setSavingRole(true);
    try {
      if (editingRoleId) {
        await api.updateRole(editingRoleId, {
          name: roleNameInput.trim(),
          description: roleDescInput.trim() || null,
          permissions: rolePermissionsInput,
        });
        toast.success(`Role "${roleNameInput.trim()}" berhasil diperbarui.`);
      } else {
        await api.createRole({
          name: roleNameInput.trim(),
          description: roleDescInput.trim() || null,
          permissions: rolePermissionsInput,
        });
        toast.success(`Role "${roleNameInput.trim()}" berhasil dibuat.`);
      }
      resetRoleForm();
      await fetchAgents();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan role.');
    } finally {
      setSavingRole(false);
    }
  };

  const handleConfirmDeleteRole = async () => {
    if (!confirmDeleteRole) return;
    try {
      await api.deleteRole(confirmDeleteRole.id);
      toast.success(`Role "${confirmDeleteRole.name}" dihapus.`);
      setConfirmDeleteRole(null);
      await fetchAgents();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal menghapus role.');
    }
  };

  const handleSaveAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAgent(true);
    try {
      const resolvedRole: 'ADMIN' | 'AGENT' =
        agentRoleId === 'role_admin' || agentRole === 'ADMIN' ? 'ADMIN' : 'AGENT';
      const resolvedRoleId =
        resolvedRole === 'ADMIN'
          ? 'role_admin'
          : agentRoleId === '__CUSTOM__'
          ? null
          : agentRoleId || null;
      const effectivePerms =
        resolvedRole === 'ADMIN'
          ? [...ALL_PERMISSION_KEYS]
          : resolvedRoleId
          ? roles.find((r) => r.id === resolvedRoleId)?.permissions || agentPermissions
          : agentPermissions;

      if (editingAgentId) {
        await api.updateAgent(editingAgentId, {
          name: agentName.trim(),
          email: agentEmail.trim(),
          ...(agentPassword.trim() ? { password: agentPassword.trim() } : {}),
          role: resolvedRole,
          roleId: resolvedRoleId,
          permissions: effectivePerms,
        });
        toast.success('Data akun CS berhasil diperbarui.');
      } else {
        await api.createAgent({
          name: agentName.trim(),
          email: agentEmail.trim(),
          password: agentPassword.trim(),
          role: resolvedRole,
          roleId: resolvedRoleId,
          permissions: effectivePerms,
        });
        toast.success('Akun CS baru berhasil ditambahkan.');
      }
      resetAgentForm();
      await fetchAgents();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan data agent.');
    } finally {
      setSavingAgent(false);
    }
  };

  const handleToggleAgentActive = async (agent: AgentItem) => {
    try {
      await api.updateAgent(agent.id, { isActive: !agent.isActive });
      toast.success(agent.isActive ? 'Agent dinonaktifkan.' : 'Agent diaktifkan.');
      await fetchAgents();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengubah status agent.');
    }
  };

  const handleConfirmDeleteAgent = async () => {
    if (!confirmDeleteAgent) return;
    try {
      await api.deleteAgent(confirmDeleteAgent.id);
      toast.success('Agent berhasil dihapus.');
      setConfirmDeleteAgent(null);
      await fetchAgents();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menghapus agent.');
    }
  };

  const [wahaLogs, setWahaLogs] = useState<
    Array<{
      receivedAt: string;
      event: string;
      session?: string | null;
      from?: string | null;
      outcome: 'PROCESSED' | 'DEDUP' | 'IGNORED' | 'ERROR';
      statusCode?: number | null;
      note?: string;
      payload?: unknown;
    }>
  >([]);
  const [wahaLogsLoading, setWahaLogsLoading] = useState(false);
  const [wahaLogFilter, setWahaLogFilter] = useState<'ALL' | 'MESSAGE' | 'SYNC' | 'ISSUE'>('ALL');
  const [expandedWahaLogKey, setExpandedWahaLogKey] = useState<string | null>(null);

  const fetchWahaLogs = useCallback(async (silent = false) => {
    if (!silent) setWahaLogsLoading(true);
    try {
      const rows = await api.getWahaLogs();
      setWahaLogs(rows);
    } catch {
      // ignore transient error
    } finally {
      if (!silent) setWahaLogsLoading(false);
    }
  }, []);

  const handleClearWahaLogs = async () => {
    try {
      await api.clearWahaLogs();
      setWahaLogs([]);
      toast.success('Log WAHA dibersihkan.');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal membersihkan log WAHA');
    }
  };

  useEffect(() => {
    if (settingsTab !== 'whatsapp') return;
    void fetchWahaLogs();
    const timer = window.setInterval(() => {
      void fetchWahaLogs(true);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [settingsTab, fetchWahaLogs]);

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const data = await api.getWahaSessions();
      setSessions(data.sessions || []);
      setSessionsError(null);
    } catch (err: any) {
      setSessions([]);
      setSessionsError(err?.response?.data?.error || err?.message || 'Gagal memuat daftar sesi WAHA');
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (wahaStatus?.config) {
      const mode: 'INTERNAL' | 'EXTERNAL' =
        wahaStatus.config.mode === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL';

      if (!tabUserPickedRef.current) {
        setConfigMode(mode);
        lastServerModeRef.current = mode;
      } else if (lastServerModeRef.current && lastServerModeRef.current !== mode) {
        setConfigMode(mode);
        tabUserPickedRef.current = false;
        lastServerModeRef.current = mode;
      } else if (!lastServerModeRef.current) {
        lastServerModeRef.current = mode;
      }

      setSession(wahaStatus.config.session || 'default');

      const ext = wahaStatus.config.externalConfig ?? (
        mode === 'EXTERNAL'
          ? {
              baseUrl: wahaStatus.config.baseUrl || '',
              apiKey: wahaStatus.config.apiKey || '',
            }
          : null
      );
      if (ext && !externalDirtyRef.current) {
        const extKey = `${ext.baseUrl || ''}|${ext.apiKey || ''}`;
        if (extKey !== lastExternalKeyRef.current) {
          lastExternalKeyRef.current = extKey;
          setBaseUrl(ext.baseUrl || '');
          setApiKey(ext.apiKey || '');
        }
      }
      if (!webhookDirtyRef.current) {
        setWebhookUrlDraft(wahaStatus.config.customWebhookUrl || '');
      }
    }
  }, [wahaStatus]);

  useEffect(() => {
    const serverMode = wahaStatus?.config?.mode === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL';
    if (wahaStatus?.config && configMode !== serverMode) {
      return;
    }
    fetchSessions();
  }, [fetchSessions, configMode, wahaStatus?.config?.mode, wahaStatus?.connected, wahaStatus?.sessionStatus]);

  useEffect(() => {
    const unsub = subscribeLiveEvent('waha:status', () => {
      void Promise.resolve(onRefreshStatus());
      void fetchSessions();
    });
    return unsub;
  }, [fetchSessions, onRefreshStatus]);

  const handleCheckConnection = async () => {
    if (checkingConnection) return;
    setCheckingConnection(true);
    try {
      const [fresh] = await Promise.all([
        Promise.resolve(onRefreshStatus()),
        fetchSessions(),
      ]);
      if (fresh && 'connected' in fresh) {
        if (fresh.connected) {
          toast.success(
            `Terhubung ke server WAHA (${fresh.connectedSessions ?? 0}/${fresh.totalSessions ?? 0} sesi aktif).`
          );
        } else {
          toast.error(fresh.error || 'Server WAHA offline atau tidak dapat dijangkau.');
        }
      }
    } finally {
      setCheckingConnection(false);
    }
  };

  const handleSelectMode = (mode: 'INTERNAL' | 'EXTERNAL') => {
    tabUserPickedRef.current = true;
    setConfigMode(mode);
    setExternalTestResult(null);
    writeWahaUiDraft({ configMode: mode });
  };

  const handleActivateInternalMode = async () => {
    if (activatingInternal) return;
    setActivatingInternal(true);
    try {
      await api.updateWahaSettings({ mode: 'INTERNAL' });
      tabUserPickedRef.current = false;
      writeWahaUiDraft(null);
      toast.success('Mode WAHA Internal otomatis diaktifkan.');
      await Promise.all([Promise.resolve(onRefreshStatus()), fetchSessions()]);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengaktifkan mode WAHA Internal');
    } finally {
      setActivatingInternal(false);
    }
  };

  const handleTestExternalConnection = async () => {
    if (testingExternal) return;
    if (!baseUrl.trim() || !/^https?:\/\//i.test(baseUrl.trim())) {
      setExternalTestResult({
        ok: false,
        text: 'Base URL wajib diisi dan diawali http:// atau https://.',
      });
      return;
    }
    setTestingExternal(true);
    setExternalTestResult(null);
    try {
      const res = await api.testWahaConnection({
        mode: 'EXTERNAL',
        baseUrl: baseUrl.trim(),
        apiKey,
      });
      const tierLabel = res.tier ? ` (${res.tier})` : '';
      const verLabel = res.version ? ` v${res.version}` : '';
      const engLabel = res.engine ? ` • Engine: ${res.engine}` : '';
      const coreNote =
        res.tier?.toUpperCase() === 'CORE'
          ? ' Catatan: WAHA Core hanya mendukung 1 sesi ("default"); multi-sesi memerlukan WAHA Plus.'
          : '';
      setExternalTestResult({
        ok: true,
        text: `Koneksi berhasil ke WAHA${tierLabel}${verLabel}${engLabel}. Ditemukan ${res.sessionCount} sesi.${coreNote}`,
      });
    } catch (err: any) {
      setExternalTestResult({
        ok: false,
        text: err?.response?.data?.error || err?.message || 'Gagal menguji koneksi ke server WAHA eksternal.',
      });
    } finally {
      setTestingExternal(false);
    }
  };

  const handleSaveWahaSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || configMode === 'INTERNAL') return;
    setSaving(true);
    try {
      await api.updateWahaSettings({
        mode: 'EXTERNAL',
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
      });
      externalDirtyRef.current = false;
      tabUserPickedRef.current = false;
      writeWahaUiDraft(null);
      setExternalTestResult(null);
      toast.success('Konfigurasi WAHA eksternal berhasil disimpan.');
      await Promise.all([Promise.resolve(onRefreshStatus()), fetchSessions()]);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan konfigurasi WAHA');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newSessionName.trim();
    if (!clean || creatingSession) return;
    setCreatingSession(true);
    try {
      const result = await api.createWahaSession(clean, configMode === 'INTERNAL');
      const actualName = result?.name || clean;
      setNewSessionName('');
      setInspectedSessionName(actualName);
      toast.success(`Sesi "${actualName}" berhasil ditambahkan dan dijalankan.`);
      await Promise.all([Promise.resolve(onRefreshStatus()), fetchSessions()]);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menambahkan sesi WhatsApp');
    } finally {
      setCreatingSession(false);
    }
  };

  const handleSwitchActiveSession = async (targetName: string) => {
    setSessionBusyName(targetName);
    try {
      await api.setActiveWahaSession(targetName);
      setInspectedSessionName(targetName);
      toast.success(`Sesi default CRM ditetapkan ke "${targetName}".`);
      await Promise.all([Promise.resolve(onRefreshStatus()), fetchSessions()]);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menetapkan sesi default');
    } finally {
      setSessionBusyName(null);
    }
  };

  const handleQuickStartSession = async (targetName: string) => {
    setSessionBusyName(targetName);
    try {
      await api.startWahaSession(targetName);
      setInspectedSessionName(targetName);
      toast.success(`Sesi "${targetName}" dijalankan.`);
      await Promise.all([Promise.resolve(onRefreshStatus()), fetchSessions()]);
    } catch (err: any) {
      toast.error(err.response?.data?.error || `Gagal menjalankan sesi "${targetName}"`);
    } finally {
      setSessionBusyName(null);
    }
  };

  const handleConfirmDeleteSession = async () => {
    if (!confirmDeleteSession) return;
    const targetName = confirmDeleteSession;
    setSessionBusyName(targetName);
    try {
      await api.deleteWahaSession(targetName);
      toast.info(`Sesi "${targetName}" dihapus.`);
      setConfirmDeleteSession(null);
      if (inspectedSessionName === targetName) setInspectedSessionName('');
      await Promise.all([Promise.resolve(onRefreshStatus()), fetchSessions()]);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menghapus sesi');
    } finally {
      setSessionBusyName(null);
    }
  };

  const handleStartSession = async () => {
    if (sessionActionLoading) return;
    const targetSession = inspectedSession;
    setSessionActionLoading(true);
    try {
      await api.startWahaSession(targetSession);
      toast.success(`Perintah start sesi "${targetSession}" dikirim.`);
      await Promise.all([Promise.resolve(onRefreshStatus()), fetchSessions()]);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal memulai sesi WhatsApp');
    } finally {
      setSessionActionLoading(false);
    }
  };

  const handleConfirmSessionAction = async () => {
    if (!confirmAction || sessionActionLoading) return;
    const targetSession = inspectedSession;
    setSessionActionLoading(true);
    try {
      if (confirmAction === 'stop') {
        await api.stopWahaSession(targetSession);
        toast.info(`Sesi "${targetSession}" dihentikan.`);
      } else {
        await api.logoutWahaSession(targetSession);
        toast.info(`Sesi "${targetSession}" berhasil logout.`);
      }
      setConfirmAction(null);
      await Promise.all([Promise.resolve(onRefreshStatus()), fetchSessions()]);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal memproses perintah sesi');
    } finally {
      setSessionActionLoading(false);
    }
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim() || !testMessage.trim() || testSending) return;

    setTestSending(true);
    setTestResult(null);
    try {
      const targetTestSession =
        (testSession && sessions.some((s) => s.name === testSession) ? testSession : '') ||
        inspectedSession ||
        undefined;
      const res = await api.sendTestMessage(testPhone.trim(), testMessage.trim(), targetTestSession);
      if (res.success) {
        setTestResult({
          ok: true,
          text: targetTestSession
            ? `Pesan uji coba berhasil terkirim via sesi ${targetTestSession}.`
            : 'Pesan uji coba berhasil terkirim.',
        });
        toast.success('Pesan uji coba terkirim.');
      } else {
        setTestResult({ ok: false, text: `Gagal: ${res.data?.error || 'Periksa koneksi WAHA'}` });
      }
    } catch (err: any) {
      setTestResult({ ok: false, text: `Error: ${err.response?.data?.error || err.message}` });
    } finally {
      setTestSending(false);
    }
  };

  const savedMode: 'INTERNAL' | 'EXTERNAL' =
    wahaStatus?.config?.mode === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL';
  const isPendingModeSwitch = Boolean(wahaStatus?.config && configMode !== savedMode);
  const internalDisplayUrl =
    wahaStatus?.config?.internalConfig?.baseUrl ||
    (savedMode === 'INTERNAL' ? wahaStatus?.config?.baseUrl : '') ||
    '';
  const internalHasKey =
    wahaStatus?.config?.internalConfig?.hasApiKey ??
    (savedMode === 'INTERNAL' ? Boolean(wahaStatus?.config?.hasApiKey) : false);
  const liveActiveSession = wahaStatus?.activeSession || wahaStatus?.config?.session || session;
  const inspectedSession =
    !isPendingModeSwitch && inspectedSessionName && sessions.some((s) => s.name === inspectedSessionName)
      ? inspectedSessionName
      : liveActiveSession;
  const activeSessionItem = isPendingModeSwitch
    ? undefined
    : sessions.find((s) => s.name === inspectedSession);
  const workingSessionsCount = sessions.filter((s) => s.status === 'WORKING').length;
  const filteredSessions = sessionSearch.trim()
    ? sessions.filter((s) => {
        const q = sessionSearch.trim().toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          (s.me?.pushName || '').toLowerCase().includes(q) ||
          (s.me?.id || '').toLowerCase().includes(q)
        );
      })
    : sessions;
  const effectiveSessionStatus = (
    wahaStatus && !wahaStatus.connected
      ? wahaStatus.sessionStatus === 'UNSUPPORTED_ENGINE'
        ? 'UNSUPPORTED_ENGINE'
        : 'OFFLINE'
      : activeSessionItem?.status || wahaStatus?.sessionStatus || 'STOPPED'
  ).toUpperCase();
  const isActiveWorking = wahaStatus?.connected && effectiveSessionStatus === 'WORKING';
  const isServerOffline =
    effectiveSessionStatus === 'OFFLINE' || effectiveSessionStatus === 'UNSUPPORTED_ENGINE';
  const canStopOrLogout =
    !isServerOffline && effectiveSessionStatus !== 'STOPPED' && effectiveSessionStatus !== 'NOT_FOUND';
  const connectedMe =
    activeSessionItem?.me ||
    (inspectedSession === liveActiveSession ? wahaStatus?.details?.me : null) ||
    null;
  const connectedPhone = connectedMe?.id
    ? String(connectedMe.id).split('@')[0].split(':')[0]
    : '';
  const connectedPushName = connectedMe?.pushName ? String(connectedMe.pushName) : '';

  const getSessionStatusMeta = (raw?: string | null) => {
    const st = String(raw || 'STOPPED').toUpperCase();
    if (st === 'WORKING') {
      return {
        rowLabel: 'WORKING',
        cardLabel: 'ONLINE / TERHUBUNG',
        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    }
    if (st === 'SCAN_QR_CODE') {
      return {
        rowLabel: 'SCAN QR',
        cardLabel: 'PERLU SCAN QR',
        cls: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    }
    if (st === 'STARTING') {
      return {
        rowLabel: 'STARTING',
        cardLabel: 'MEMULAI SESI...',
        cls: 'bg-sky-50 text-sky-700 border-sky-200',
      };
    }
    if (st === 'NOT_FOUND') {
      return {
        rowLabel: 'NOT FOUND',
        cardLabel: 'SESI BELUM TERDAFTAR',
        cls: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    }
    if (st === 'UNSUPPORTED_ENGINE') {
      return {
        rowLabel: 'ENGINE TIDAK DIDUKUNG',
        cardLabel: 'WAJIB ENGINE GOWS',
        cls: 'bg-red-50 text-red-700 border-red-200',
      };
    }
    if (st === 'OFFLINE') {
      return {
        rowLabel: 'OFFLINE',
        cardLabel: 'SERVER OFFLINE / GAGAL KONEK',
        cls: 'bg-red-50 text-red-700 border-red-200',
      };
    }
    if (st === 'FAILED') {
      return {
        rowLabel: 'FAILED',
        cardLabel: 'GAGAL / FAILED',
        cls: 'bg-red-50 text-red-700 border-red-200',
      };
    }
    return {
      rowLabel: st,
      cardLabel: 'TERHENTI / STOPPED',
      cls: 'bg-gray-100 text-gray-700 border-gray-200',
    };
  };

  const activeStatusMeta = getSessionStatusMeta(effectiveSessionStatus);
  const browserPublicWebhook = (() => {
    try {
      const host = window.location.hostname.toLowerCase();
      const isLocal =
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '::1' ||
        !host.includes('.');
      if (isLocal) return '';
      const appMatch = window.location.pathname.match(/^(\/app\/[^/]+)/);
      return `${window.location.origin}${appMatch ? appMatch[1] : ''}/api/waha/webhook`;
    } catch {
      return '';
    }
  })();
  const webhookUrlValue = wahaStatus?.webhookUrl || browserPublicWebhook || `${window.location.origin}/api/waha/webhook`;
  const webhookWarning =
    savedMode === 'EXTERNAL' && wahaStatus?.webhookReachableForExternal === false;

  const handleCopyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrlValue);
      setWebhookCopied(true);
      toast.success('URL Webhook disalin.');
      setTimeout(() => setWebhookCopied(false), 1800);
    } catch {
      toast.error('Gagal menyalin URL Webhook.');
    }
  };

  const handleSaveWebhookUrl = async (overrideUrl?: string) => {
    if (savingWebhook) return;
    const nextUrl = (overrideUrl !== undefined ? overrideUrl : webhookUrlDraft).trim();
    const extUrl = (wahaStatus?.config?.externalConfig?.baseUrl || baseUrl).trim();
    if (savedMode === 'EXTERNAL' && !extUrl) {
      toast.error('Simpan Base URL WAHA Eksternal terlebih dahulu.');
      return;
    }
    setSavingWebhook(true);
    try {
      await api.updateWahaSettings({
        mode: savedMode,
        ...(savedMode === 'EXTERNAL' ? { baseUrl: extUrl } : {}),
        webhookUrl: nextUrl,
      });
      webhookDirtyRef.current = false;
      setWebhookUrlDraft(nextUrl);
      const syncRes = await api.syncWahaWebhooks().catch(() => null);
      if (syncRes?.skippedReason) {
        toast.info(syncRes.skippedReason);
      } else if (syncRes && syncRes.synced.length > 0) {
        toast.success(`URL Webhook disimpan & diterapkan ke ${syncRes.synced.length} sesi WAHA.`);
      } else {
        toast.success(nextUrl ? 'URL Webhook kustom disimpan.' : 'URL Webhook dikembalikan ke deteksi otomatis.');
      }
      await Promise.resolve(onRefreshStatus());
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan URL Webhook');
    } finally {
      setSavingWebhook(false);
    }
  };

  const handleSyncWebhooksNow = async () => {
    if (syncingWebhook || isPendingModeSwitch) return;
    setSyncingWebhook(true);
    try {
      const res = await api.syncWahaWebhooks();
      if (res.skippedReason) {
        toast.error(res.skippedReason);
      } else if (res.synced.length > 0) {
        toast.success(`Webhook disinkronkan ke ${res.synced.length} sesi (${res.synced.join(', ')}).`);
      } else {
        toast.info('Belum ada sesi WAHA untuk disinkronkan.');
      }
      await Promise.resolve(onRefreshStatus());
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal menyinkronkan webhook WAHA');
    } finally {
      setSyncingWebhook(false);
    }
  };

  const mobileSettingsTabs: Array<{ id: SettingsSection; label: string }> = [
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'omnichannel', label: 'Omnichannel' },
    { id: 'quick_replies', label: 'Balasan Cepat' },
    { id: 'products', label: 'Produk' },
    { id: 'labels', label: 'Label' },
    { id: 'templates', label: 'Template' },
    { id: 'automation', label: 'Balas Otomatis' },
    { id: 'sla_csat', label: 'SLA & CSAT' },
    ...(canManageAgents ? [{ id: 'agents' as const, label: 'Multi-CS & Role' }] : []),
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Mobile Quick Section Switcher */}
      <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto pb-1">
        {mobileSettingsTabs.map((tab) => {
          const isActive = settingsTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSettingsTab(tab.id)}
              className={`px-3 py-1.5 rounded-md border text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {settingsTab !== 'agents' && !canEditSettings && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Mode Lihat Saja:</strong> Role{' '}
            <strong>{currentUser?.roleName || 'Agent'}</strong> hanya dapat meninjau konfigurasi ini tanpa hak ubah/simpan (<code className="font-mono">settings.edit</code>).
          </span>
        </div>
      )}
      {settingsTab === 'whatsapp' && (
      <div className="space-y-4 sm:space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base sm:text-lg font-semibold text-gray-900">Koneksi Layanan WhatsApp (WAHA)</h1>
          <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5">
            Atur server WAHA lokal Docker atau gateway WhatsApp eksternal dengan API Key.
          </p>
        </div>

        <Button
          variant="secondary"
          size="md"
          isLoading={checkingConnection}
          onClick={handleCheckConnection}
          className="self-start sm:self-auto shrink-0"
        >
          Periksa Koneksi
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 items-start">
        <div className="lg:col-span-2 space-y-4 sm:space-y-5">
          <div className="bg-white rounded-lg border border-gray-200 p-3.5 sm:p-5 space-y-3.5 sm:space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2.5">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Mode Koneksi WhatsApp</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {configMode === 'INTERNAL'
                    ? 'WAHA Internal terkonfigurasi otomatis dari server dan terkunci. Anda cukup mengelola sesi WhatsApp.'
                    : 'Hubungkan ke server atau gateway WAHA eksternal menggunakan Base URL dan API Key.'}
                </p>
              </div>
              {configMode === 'INTERNAL' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                  Terkunci Otomatis
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={!canEditSettings}
                onClick={() => handleSelectMode('INTERNAL')}
                className={`p-3.5 rounded-lg border text-left transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                  configMode === 'INTERNAL'
                    ? 'border-indigo-600 bg-indigo-50/40 text-gray-900'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600 bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 font-semibold text-xs text-gray-900">
                    <Server className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>WAHA Internal (Otomatis)</span>
                  </div>
                  {wahaStatus?.config && savedMode === 'INTERNAL' && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                      Aktif
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Terhubung otomatis ke runtime WAHA internal Reneo dengan dukungan multi-sesi.
                </p>
              </button>

              <button
                type="button"
                disabled={!canEditSettings}
                onClick={() => handleSelectMode('EXTERNAL')}
                className={`p-3.5 rounded-lg border text-left transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                  configMode === 'EXTERNAL'
                    ? 'border-indigo-600 bg-indigo-50/40 text-gray-900'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600 bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 font-semibold text-xs text-gray-900">
                    <Globe className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>WAHA Eksternal</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                      Wajib GOWS
                    </span>
                    {wahaStatus?.config && savedMode === 'EXTERNAL' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Aktif
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Gunakan URL dan API Key gateway WAHA eksternal milik Anda sendiri (wajib engine <code className="font-mono text-gray-700">GOWS</code>).
                </p>
              </button>
            </div>

            {configMode === 'INTERNAL' ? (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Base URL WAHA Internal
                    </label>
                    <input
                      type="text"
                      disabled
                      readOnly
                      value={internalDisplayUrl || 'Terhubung otomatis dari environment'}
                      className="w-full h-9 px-3 bg-gray-50 text-gray-600 border border-gray-200 rounded-md text-[13px] font-mono cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      API Key WAHA Internal
                    </label>
                    <input
                      type="text"
                      disabled
                      readOnly
                      value={internalHasKey ? '•••••••• (Dikelola otomatis)' : 'Tidak memerlukan API key'}
                      className="w-full h-9 px-3 bg-gray-50 text-gray-600 border border-gray-200 rounded-md text-[13px] font-mono cursor-not-allowed"
                    />
                  </div>
                </div>
                {savedMode !== 'INTERNAL' && (
                  <div className="pt-2 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-amber-800">
                      Mode aktif saat ini masih <strong>WAHA Eksternal</strong>. Pengaturan eksternal Anda tetap tersimpan jika hanya melihat tab ini.
                    </span>
                    <Button
                      type="button"
                      variant="primary"
                      isLoading={activatingInternal}
                      disabled={!canEditSettings}
                      onClick={() => void handleActivateInternalMode()}
                    >
                      Simpan &amp; Aktifkan WAHA Internal
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleSaveWahaSettings} className="space-y-3.5 pt-1">
                <div className="p-2.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
                  <strong>Persyaratan Engine GOWS:</strong> Koneksi WAHA Eksternal wajib menjalankan engine <code className="font-mono font-semibold">GOWS</code> (<code className="font-mono">WHATSAPP_DEFAULT_ENGINE=GOWS</code>). Server dengan engine <code className="font-mono">WEBJS</code> atau <code className="font-mono">NOWEB</code> tidak dapat disimpan atau digunakan.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Base URL Server WAHA <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="https://wa.domainanda.com"
                      value={baseUrl}
                      onChange={(e) => {
                        externalDirtyRef.current = true;
                        setBaseUrl(e.target.value);
                        writeWahaUiDraft({ configMode: 'EXTERNAL', baseUrl: e.target.value });
                      }}
                      className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      API Key / Secret Token (Opsional)
                    </label>
                    <input
                      type="password"
                      placeholder="Kosongkan jika tanpa auth"
                      value={apiKey}
                      onChange={(e) => {
                        externalDirtyRef.current = true;
                        setApiKey(e.target.value);
                      }}
                      className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] font-mono focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-[11px] text-gray-400 mt-1 block">
                      Dikirim via header <code className="font-mono">X-Api-Key</code>
                    </span>
                  </div>
                </div>

                {externalTestResult && (
                  <div
                    className={`p-3 rounded-md text-xs font-medium border ${
                      externalTestResult.ok
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-red-50 text-red-800 border-red-200'
                    }`}
                  >
                    {externalTestResult.text}
                  </div>
                )}

                <div className="pt-3 border-t border-gray-200 flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    isLoading={testingExternal}
                    onClick={handleTestExternalConnection}
                  >
                    Tes Koneksi WAHA
                  </Button>
                  <Button type="submit" variant="primary" isLoading={saving} disabled={!canEditSettings}>
                    {savedMode !== 'EXTERNAL'
                      ? 'Simpan & Aktifkan WAHA Eksternal'
                      : 'Simpan Konfigurasi WAHA'}
                  </Button>
                </div>
              </form>
            )}

            {/* Multi-Session Management (Internal & External) */}
            <div className="pt-3.5 border-t border-gray-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-xs font-semibold text-gray-900">Daftar Sesi WhatsApp (Multi-Sesi)</h4>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-gray-100 text-gray-700 border border-gray-200 tabular-nums">
                      {sessions.length}/{maxSessions} sesi
                    </span>
                    {workingSessionsCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 tabular-nums">
                        {workingSessionsCount} Aktif Bersamaan
                      </span>
                    )}
                    {!isMultiSessionAllowed && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                        Terkunci (1 Sesi)
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Semua sesi berstatus WORKING aktif bersamaan untuk terima chat, balas Live Chat, dan siaran otomatis. Klik satu baris untuk mengontrolnya di panel kanan.
                  </p>
                </div>
                {!isPendingModeSwitch && (
                  <div className="flex items-center gap-2 shrink-0">
                    {!isMultiSessionAllowed && onOpenPlans && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={onOpenPlans}
                      >
                        Upgrade Multi-Sesi
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void Promise.all([Promise.resolve(onRefreshStatus()), fetchSessions()])}
                      isLoading={sessionsLoading}
                    >
                      Muat Ulang
                    </Button>
                  </div>
                )}
              </div>

              {isPendingModeSwitch ? (
                <div className="p-3 rounded-md bg-sky-50/70 border border-sky-200 text-xs text-sky-900">
                  Mode aktif di server saat ini masih <strong>WAHA {savedMode === 'EXTERNAL' ? 'Eksternal' : 'Internal'}</strong>. Klik tombol <strong>Simpan &amp; Aktifkan</strong> di atas terlebih dahulu jika Anda ingin berpindah dan mengelola sesi di server <strong>WAHA {configMode === 'EXTERNAL' ? 'Eksternal' : 'Internal'}</strong>.
                </div>
              ) : (
                <>
                  {(!isMultiSessionAllowed && sessions.length >= 1) ? (
                    <div className="p-3 rounded-md bg-amber-50/70 border border-amber-200 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
                      <span>
                        Paket <strong>{licenseInfo?.plan || 'Saat Ini'}</strong> hanya mendukung 1 sesi WhatsApp. Upgrade ke Pro Bulanan atau Enterprise untuk menambah sesi.
                      </span>
                      {onOpenPlans && (
                        <Button type="button" variant="secondary" size="sm" onClick={onOpenPlans}>
                          Lihat Paket
                        </Button>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={handleCreateSession} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                      <input
                        type="text"
                        placeholder="Tambah nama sesi baru (contoh: cs-1, sales)"
                        value={newSessionName}
                        onChange={(e) => setNewSessionName(e.target.value)}
                        disabled={!canEditSettings || isServerOffline || sessions.length >= maxSessions}
                        className="w-full flex-none sm:flex-1 h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] font-mono focus:outline-none focus:border-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                      />
                      <Button
                        type="submit"
                        variant="primary"
                        size="md"
                        isLoading={creatingSession}
                        disabled={!canEditSettings || isServerOffline || !newSessionName.trim() || sessions.length >= maxSessions}
                        className="w-full sm:w-auto shrink-0"
                      >
                        Tambah Sesi
                      </Button>
                    </form>
                  )}

                  {sessions.length > 1 && (
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Cari nama sesi, nama akun, atau nomor WhatsApp..."
                        value={sessionSearch}
                        onChange={(e) => setSessionSearch(e.target.value)}
                        className="w-full h-9 pl-8 pr-3 bg-gray-50 border border-gray-200 rounded-md text-xs focus:outline-none focus:bg-white focus:border-indigo-500"
                      />
                    </div>
                  )}

                  {sessionsError && (
                    <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                      {sessionsError}
                    </div>
                  )}

                  <div className="divide-y divide-gray-200 border border-gray-200 rounded-md overflow-hidden">
                    {sessions.length === 0 ? (
                      <div className="p-3 text-xs text-gray-500 text-center bg-gray-50">
                        {sessionsLoading
                          ? 'Memuat daftar sesi...'
                          : sessionsError
                            ? 'Daftar sesi tidak dapat dimuat karena koneksi WAHA bermasalah.'
                            : `Belum ada sesi terdaftar di server WAHA. Sesi target saat ini: ${liveActiveSession}`}
                      </div>
                    ) : filteredSessions.length === 0 ? (
                      <div className="p-3 text-xs text-gray-500 text-center bg-gray-50">
                        Tidak ada sesi yang cocok dengan "{sessionSearch.trim()}".
                      </div>
                    ) : (
                      filteredSessions.map((item) => {
                        const isDefaultFallback = item.name === liveActiveSession;
                        const isInspected = item.name === inspectedSession;
                        const isWorking = item.status === 'WORKING';
                        const isBusy = sessionBusyName === item.name;
                        const accountLabel = item.me?.pushName || item.me?.id?.split('@')[0];
                        const statusMeta = getSessionStatusMeta(item.status);
                        const canDelete = sessions.length > 1 || item.status === 'FAILED' || configMode === 'EXTERNAL';
                        return (
                          <div
                            key={item.name}
                            onClick={() => setInspectedSessionName(item.name)}
                            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2.5 text-xs cursor-pointer transition-colors ${
                              isInspected ? 'bg-indigo-50/40' : 'bg-white hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                              <span className="font-mono font-semibold text-gray-900 truncate">
                                {item.name}
                              </span>
                              {accountLabel && (
                                <span className="text-[11px] text-gray-500 font-mono truncate">
                                  ({accountLabel})
                                </span>
                              )}
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${statusMeta.cls}`}
                              >
                                {statusMeta.rowLabel}
                              </span>
                              {isWorking && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  Aktif
                                </span>
                              )}
                              {isDefaultFallback && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  Default
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto justify-end shrink-0" onClick={(e) => e.stopPropagation()}>
                              {!isDefaultFallback && (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  disabled={!canEditSettings || isBusy}
                                  onClick={() => handleSwitchActiveSession(item.name)}
                                >
                                  Jadikan Default
                                </Button>
                              )}
                              {!isWorking && (
                                <>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    disabled={!canEditSettings || isBusy}
                                    onClick={() => void handleQuickStartSession(item.name)}
                                  >
                                    Start
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    disabled={!canEditSettings}
                                    onClick={() => onOpenQr(item.name)}
                                  >
                                    Scan QR
                                  </Button>
                                </>
                              )}
                              {canDelete && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={!canEditSettings || isBusy}
                                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                  onClick={() => setConfirmDeleteSession(item.name)}
                                  aria-label={`Hapus sesi ${item.name}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Privacy, Auto-Read & Online Presence Card (General & Per-Session) */}
          <div className="bg-white rounded-lg border border-gray-200 p-3.5 sm:p-5 space-y-3.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Privasi, Auto-Read &amp; Status Online WhatsApp</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Atur otomatis baca saat buka chat, visibilitas status Online/mengetik, dan centang 2 biru secara general atau per sesi WhatsApp.
                </p>
              </div>
              {Object.keys(privacyConfig.sessions || {}).length > 0 && (
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {Object.keys(privacyConfig.sessions).length} Sesi Kustom
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <label className="text-xs font-medium text-gray-700 shrink-0">
                  Target Pengaturan:
                </label>
                <select
                  value={privacyScope}
                  onChange={(e) => setPrivacyScope(e.target.value)}
                  className="h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs font-medium text-gray-800 focus:outline-none focus:border-indigo-500 min-w-[200px]"
                >
                  <option value="__GENERAL__">General (Default Semua Sesi)</option>
                  {Array.from(
                    new Set([
                      ...sessions.map((s) => s.name),
                      ...Object.keys(privacyConfig.sessions || {}),
                    ])
                  )
                    .filter(Boolean)
                    .map((sName) => (
                      <option key={sName} value={sName}>
                        Sesi: {sName}
                        {privacyConfig.sessions?.[sName] ? ' (Kustom)' : ' (Ikuti General)'}
                      </option>
                    ))}
                </select>
              </div>

              {isSessionPrivacyOverridden && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!canEditSettings}
                  onClick={() => handleResetSessionPrivacyOverride(privacyScope)}
                >
                  Ikuti Pengaturan General
                </Button>
              )}
            </div>

            <div className="divide-y divide-gray-100 border border-gray-200 rounded-md bg-gray-50/40">
              <label className="flex items-start justify-between gap-3 p-3 cursor-pointer">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-gray-900">
                    Otomatis Baca Chat WhatsApp Saat Buka Percakapan
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                    Jika aktif, membuka percakapan di Live Chat CRM otomatis mengirim tanda dibaca (<code className="font-mono">sendSeen</code>) ke WhatsApp pelanggan. Nonaktifkan jika ingin membaca chat di CRM tanpa langsung memicu centang 2 biru.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={activePrivacyRule.autoReadOnOpen}
                  disabled={!canEditSettings}
                  onChange={(e) => handleTogglePrivacyField('autoReadOnOpen', e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                />
              </label>

              <label className="flex items-start justify-between gap-3 p-3 cursor-pointer">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-gray-900">
                    Mode Online &amp; Status Sedang Mengetik
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                    Jika aktif, CRM menampilkan status <span className="font-medium">Online</span> dan indikator <span className="font-medium">Sedang mengetik...</span> ke WhatsApp lawan bicara. Nonaktifkan untuk menyembunyikan status online (mode privasi offline).
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={activePrivacyRule.sendOnlinePresence}
                  disabled={!canEditSettings}
                  onChange={(e) => handleTogglePrivacyField('sendOnlinePresence', e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                />
              </label>

              <label className="flex items-start justify-between gap-3 p-3 cursor-pointer">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-gray-900">
                    Izinkan Centang 2 Biru (Read Receipts WhatsApp)
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                    Jika dinonaktifkan, CRM tidak akan pernah mengirim tanda baca centang 2 biru (<code className="font-mono">sendSeen</code>) ke WhatsApp baik secara otomatis maupun tombol manual, sekaligus menyinkronkan privasi tanda baca sesi WAHA.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={activePrivacyRule.readReceipts}
                  disabled={!canEditSettings}
                  onChange={(e) => handleTogglePrivacyField('readReceipts', e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                />
              </label>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-gray-500">
                {privacyScope === '__GENERAL__'
                  ? 'Berlaku sebagai default untuk seluruh sesi yang tidak memiliki aturan khusus.'
                  : isSessionPrivacyOverridden
                  ? `Menampilkan aturan khusus untuk sesi "${privacyScope}".`
                  : `Sesi "${privacyScope}" saat ini mengikuti aturan General. Ubah opsi di atas lalu simpan untuk membuat aturan khusus.`}
              </span>
              <Button
                type="button"
                variant="primary"
                size="sm"
                isLoading={savingPrivacy}
                disabled={!canEditSettings}
                onClick={() => void handleSavePrivacyConfig()}
                className="shrink-0"
              >
                Simpan Privasi WA
              </Button>
            </div>
          </div>

          <form onSubmit={handleSendTest} className="bg-white rounded-lg border border-gray-200 p-3.5 sm:p-5 space-y-3.5 sm:space-y-4">
            <button
              type="button"
              onClick={() => setShowMobileWahaTest((v) => !v)}
              className="lg:pointer-events-none w-full flex items-center justify-between gap-2 text-left"
            >
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Kirim Pesan Uji Coba</h3>
                <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 hidden sm:block">
                  Verifikasi pengiriman pesan langsung ke nomor WhatsApp tujuan.
                </p>
              </div>
              <span className="lg:hidden text-[11px] font-medium text-indigo-600 inline-flex items-center gap-0.5 shrink-0">
                <span>{showMobileWahaTest ? 'Tutup' : 'Buka'}</span>
                {showMobileWahaTest ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </span>
            </button>

            <div className={`${showMobileWahaTest ? 'space-y-3.5' : 'hidden lg:block lg:space-y-4'}`}>

            {sessions.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Sesi WhatsApp Pengirim
                </label>
                <select
                  value={testSession || inspectedSession}
                  onChange={(e) => setTestSession(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs font-mono focus:outline-none focus:border-indigo-500"
                >
                  {sessions.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name} ({s.status})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="sm:w-48 md:w-52 shrink-0">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Nomor WhatsApp Tujuan
                </label>
                <input
                  type="text"
                  required
                  placeholder="08123456789"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="w-full flex-none sm:flex-1 min-w-0">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Isi Pesan Uji Coba
                </label>
                <input
                  type="text"
                  required
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] focus:outline-none focus:border-indigo-500"
                />
              </div>

              <Button
                type="submit"
                variant="secondary"
                size="md"
                isLoading={testSending}
                disabled={isPendingModeSwitch || isServerOffline}
                className="w-full sm:w-auto shrink-0"
              >
                Kirim Pesan Tes
              </Button>
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-md text-xs font-medium border ${
                  testResult.ok
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-red-50 text-red-800 border-red-200'
                }`}
              >
                {testResult.text}
              </div>
            )}
            </div>
          </form>
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">
                Status Sesi WhatsApp
              </h3>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Semua sesi berstatus WORKING aktif bersamaan. Pilih sesi di bawah untuk kontrol Start, Stop, atau Logout.
              </p>
            </div>

            {sessions.length > 1 && !isPendingModeSwitch && (
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">
                  Sesi yang Dikontrol ({workingSessionsCount}/{sessions.length} Aktif)
                </label>
                <select
                  value={inspectedSession}
                  onChange={(e) => setInspectedSessionName(e.target.value)}
                  className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs font-mono focus:outline-none focus:border-indigo-500"
                >
                  {sessions.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name} ({s.status})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="p-4 rounded-md bg-gray-50 border border-gray-200 text-center space-y-1.5">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold border ${activeStatusMeta.cls}`}
              >
                {activeStatusMeta.cardLabel}
              </span>

              <div className="text-xs text-gray-600 pt-1">
                Session: <strong className="font-mono text-gray-900">{inspectedSession}</strong>
              </div>
              {wahaStatus?.engine && (
                <div className="text-[11px] font-mono text-gray-600">
                  Engine: <strong>{wahaStatus.engine}</strong>
                </div>
              )}
              {isActiveWorking && (connectedPushName || connectedPhone) && (
                <div className="text-[11px] text-emerald-700 font-medium">
                  {connectedPushName ? `${connectedPushName}` : 'WhatsApp'}
                  {connectedPhone ? (
                    <span className="font-mono text-emerald-800"> ({connectedPhone})</span>
                  ) : null}
                </div>
              )}
              {wahaStatus?.connected && workingSessionsCount > 1 && (
                <div className="text-[11px] text-emerald-700 font-medium">
                  {workingSessionsCount} dari {sessions.length} sesi aktif bersamaan
                </div>
              )}
              <div className="text-[11px] text-gray-500 font-mono truncate">
                {wahaStatus?.config?.baseUrl || '-'}
              </div>
            </div>

            {isPendingModeSwitch && (
              <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-800 leading-relaxed">
                Anda sedang meninjau tab <strong className="font-mono">WAHA {configMode}</strong>. Status aktif di server saat ini masih <strong className="font-mono">WAHA {savedMode}</strong> sampai tombol <strong>Simpan &amp; Aktifkan</strong> ditekan.
              </div>
            )}

            {wahaStatus && !wahaStatus.connected && wahaStatus.error && (
              <div className="p-3 rounded-md bg-red-50 border border-red-200 text-[11px] text-red-700 leading-relaxed">
                <strong>Detail koneksi:</strong> {wahaStatus.error}
              </div>
            )}

            {wahaStatus?.connected && effectiveSessionStatus === 'NOT_FOUND' && (
              <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-800 leading-relaxed">
                Sesi <strong className="font-mono">{inspectedSession}</strong> belum terdaftar di server WAHA. Klik <strong>Buka Scanner QR</strong> atau <strong>Start Sesi</strong> untuk membuatnya, atau pilih sesi lain di daftar kiri.
              </div>
            )}

            {wahaStatus?.connected && effectiveSessionStatus === 'FAILED' && (
              <div className="p-3 rounded-md bg-red-50 border border-red-200 text-[11px] text-red-700 leading-relaxed">
                Sesi <strong className="font-mono">{inspectedSession}</strong> gagal berjalan di server WAHA. Klik <strong>Buka Scanner QR</strong> atau <strong>Start Sesi</strong> untuk memulihkan sesi.
              </div>
            )}

            <div className="space-y-2">
              {!isActiveWorking && (
                <Button
                  variant="primary"
                  size="md"
                  className="w-full"
                  disabled={!canEditSettings || isServerOffline || sessionActionLoading}
                  onClick={() => onOpenQr(inspectedSession)}
                >
                  Buka Scanner QR WhatsApp
                </Button>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={handleStartSession}
                  disabled={!canEditSettings || isActiveWorking || isServerOffline || sessionActionLoading}
                  isLoading={sessionActionLoading}
                >
                  Start Sesi
                </Button>

                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setConfirmAction('stop')}
                  disabled={!canEditSettings || !canStopOrLogout || sessionActionLoading}
                >
                  Stop Sesi
                </Button>
              </div>

              <Button
                variant="secondary"
                size="md"
                className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 hover:text-red-700"
                onClick={() => setConfirmAction('logout')}
                disabled={!canEditSettings || !canStopOrLogout || sessionActionLoading}
              >
                Logout Sesi WhatsApp
              </Button>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-3.5 sm:p-5 text-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowMobileWahaWebhook((v) => !v)}
                className="lg:pointer-events-none flex-1 min-w-0 text-left flex items-center justify-between gap-2"
              >
                <h3 className="text-gray-900 font-semibold text-sm truncate">Webhook Masuk &amp; Tracking (WAHA)</h3>
                <span className="lg:hidden text-[11px] font-medium text-indigo-600 inline-flex items-center gap-0.5 shrink-0">
                  <span>{showMobileWahaWebhook ? 'Tutup' : 'Detail'}</span>
                  {showMobileWahaWebhook ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </span>
              </button>
              <div className={`${showMobileWahaWebhook ? 'flex' : 'hidden lg:flex'} items-center gap-1.5`}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  isLoading={syncingWebhook}
                  disabled={!canEditSettings || isPendingModeSwitch || isServerOffline}
                  onClick={() => void handleSyncWebhooksNow()}
                >
                  Sinkronkan
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleCopyWebhook()}
                >
                  {webhookCopied ? 'Tersalin' : 'Salin'}
                </Button>
              </div>
            </div>
            <div className={`${showMobileWahaWebhook ? 'space-y-3' : 'hidden lg:block lg:space-y-3'}`}>
            <p className="text-gray-500 text-[11px] leading-relaxed">
              WAHA mengirimkan event <code className="font-mono text-gray-800">message</code> (chat masuk ke Inbox) dan <code className="font-mono text-gray-800">message.ack</code> (status centang dua/biru) ke endpoint ini:
            </p>
            <div className="bg-gray-50 p-2.5 rounded-md font-mono text-[11px] text-gray-800 break-all select-all border border-gray-200">
              {webhookUrlValue}
            </div>

            {webhookWarning && (
              <div className="p-2.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-900 space-y-2 leading-relaxed">
                <p>
                  URL di atas masih alamat internal Docker sehingga server <strong>WAHA Eksternal</strong> tidak dapat mengirim chat masuk ke CRM. Masukkan URL HTTPS publik CRM Anda di bawah lalu simpan.
                </p>
                {browserPublicWebhook && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    isLoading={savingWebhook}
                    onClick={() => void handleSaveWebhookUrl(browserPublicWebhook)}
                  >
                    Pakai URL Publik Ini &amp; Terapkan
                  </Button>
                )}
              </div>
            )}

            <div className="space-y-1.5 pt-1 border-t border-gray-100">
              <label className="block text-[11px] font-medium text-gray-700">
                Override URL Webhook Publik (Opsional)
              </label>
              <div className="flex flex-col sm:flex-row gap-1.5">
                <input
                  type="url"
                  placeholder={browserPublicWebhook || 'https://crm.domainanda.com/api/waha/webhook'}
                  value={webhookUrlDraft}
                  onChange={(e) => {
                    webhookDirtyRef.current = true;
                    setWebhookUrlDraft(e.target.value);
                  }}
                  className="w-full flex-none sm:flex-1 h-8 px-2.5 bg-white border border-gray-200 rounded-md text-[11px] font-mono focus:outline-none focus:border-indigo-500"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  isLoading={savingWebhook}
                  disabled={!canEditSettings}
                  onClick={() => void handleSaveWebhookUrl()}
                  className="shrink-0"
                >
                  Simpan
                </Button>
              </div>
              <p className="text-[10px] text-gray-400">
                Kosongkan lalu klik Simpan untuk memakai deteksi URL otomatis.
              </p>
            </div>

            <div className="pt-2 border-t border-gray-100 text-[11px] text-gray-500">
              {wahaStatus?.lastWebhook ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      wahaStatus.lastWebhook.outcome === 'ERROR'
                        ? 'bg-red-500'
                        : wahaStatus.lastWebhook.outcome === 'IGNORED'
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                  />
                  <span>
                    Terakhir diterima: <strong className="font-mono text-gray-700">{wahaStatus.lastWebhook.event}</strong>
                    {wahaStatus.lastWebhook.session ? ` (${wahaStatus.lastWebhook.session})` : ''}
                    {' • '}
                    {new Date(wahaStatus.lastWebhook.receivedAt).toLocaleTimeString('id-ID')}
                  </span>
                </div>
              ) : (
                <span>Belum ada event webhook diterima sejak backend CRM dimulai.</span>
              )}
            </div>
            </div>
          </div>
        </div>
      </div>

      {/* Log Aktivitas & Webhook WAHA */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-4 sm:px-5 py-3.5 border-b border-gray-200 bg-gray-50/70 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-gray-900 font-semibold text-sm">Log Aktivitas &amp; Webhook WAHA</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Memantau event webhook masuk (<code className="font-mono">message</code>, <code className="font-mono">message.any</code>, <code className="font-mono">message.ack</code>) serta hasil sinkronisasi otomatis WAHA.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {([
              { id: 'ALL', label: 'Semua' },
              { id: 'MESSAGE', label: 'Pesan' },
              { id: 'SYNC', label: 'Sync' },
              { id: 'ISSUE', label: 'Error / Diabaikan' },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setWahaLogFilter(tab.id)}
                className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                  wahaLogFilter === tab.id
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void fetchWahaLogs()}
              disabled={wahaLogsLoading}
              className="px-2.5 py-1 rounded text-[11px] font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {wahaLogsLoading ? 'Memuat...' : 'Refresh'}
            </button>
            {canEditSettings && wahaLogs.length > 0 && (
              <button
                type="button"
                onClick={handleClearWahaLogs}
                className="px-2.5 py-1 rounded text-[11px] font-medium border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
              >
                Bersihkan
              </button>
            )}
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
          {(() => {
            const visibleLogs = wahaLogs.filter((item) => {
              if (wahaLogFilter === 'MESSAGE') {
                return item.event === 'message' || item.event === 'message.any';
              }
              if (wahaLogFilter === 'SYNC') {
                return item.event === 'chat.sync';
              }
              if (wahaLogFilter === 'ISSUE') {
                return item.outcome === 'ERROR' || item.outcome === 'IGNORED';
              }
              return true;
            });
            if (visibleLogs.length === 0) {
              return (
                <div className="px-4 py-6 text-center text-xs text-gray-500">
                  Belum ada log WAHA yang tercatat untuk filter ini.
                </div>
              );
            }
            return visibleLogs.map((log, idx) => {
              const rowKey = `${log.receivedAt}-${log.event}-${idx}`;
              const isExpanded = expandedWahaLogKey === rowKey;
              const hasJson = log.payload !== undefined;
              const formattedJson =
                typeof log.payload === 'string'
                  ? log.payload
                  : JSON.stringify(log.payload ?? {
                      receivedAt: log.receivedAt,
                      event: log.event,
                      session: log.session ?? null,
                      from: log.from ?? null,
                      outcome: log.outcome,
                      statusCode: log.statusCode ?? null,
                      note: log.note ?? null,
                    }, null, 2);
              return (
              <div key={rowKey} className="px-4 py-2.5 text-xs hover:bg-gray-50/60">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-gray-400 shrink-0">
                    {new Date(log.receivedAt).toLocaleTimeString('id-ID')}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold shrink-0 ${
                      log.outcome === 'ERROR'
                        ? 'bg-red-100 text-red-700'
                        : log.outcome === 'IGNORED'
                        ? 'bg-amber-100 text-amber-800'
                        : log.outcome === 'DEDUP'
                        ? 'bg-gray-100 text-gray-600'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {log.outcome}
                  </span>
                  {log.statusCode != null && (
                    <span
                      className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold shrink-0 ${
                        log.statusCode >= 500
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : log.statusCode >= 400
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      HTTP {log.statusCode}
                    </span>
                  )}
                  <span className="font-mono text-[11px] font-semibold text-gray-800 shrink-0">
                    {log.event}
                  </span>
                  {log.session && (
                    <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono text-[10px] shrink-0">
                      {log.session}
                    </span>
                  )}
                  {log.from && (
                    <span className="font-mono text-[11px] text-gray-600 truncate max-w-[200px]" title={log.from}>
                      {log.from}
                    </span>
                  )}
                  {log.note && (
                    <span className="text-gray-600 text-[11px] flex-1 min-w-[180px]">
                      {log.note}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setExpandedWahaLogKey(isExpanded ? null : rowKey)}
                    className="ml-auto px-2 py-0.5 rounded border border-gray-200 bg-white text-[10px] font-mono text-gray-600 hover:bg-gray-100 shrink-0"
                  >
                    {isExpanded ? 'Tutup JSON' : hasJson ? 'Lihat JSON' : 'Detail'}
                  </button>
                </div>
                {isExpanded && (
                  <div className="mt-2 rounded border border-gray-200 bg-gray-900 text-gray-100 p-2.5 overflow-x-auto">
                    <div className="flex items-center justify-between mb-1.5 text-[10px] text-gray-400 font-mono">
                      <span>{hasJson ? 'Webhook Payload JSON' : 'Ringkasan Log'}</span>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(formattedJson);
                          toast.success('JSON disalin.');
                        }}
                        className="px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-200"
                      >
                        Salin JSON
                      </button>
                    </div>
                    <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all max-h-56 overflow-y-auto">
                      {formattedJson}
                    </pre>
                  </div>
                )}
              </div>
              );
            });
          })()}
        </div>
      </div>
      </div>
      )}

      {/* Pengaturan SLA, Routing Agent & Survei CSAT */}
      {settingsTab === 'sla_csat' && (
        <SlaRoutingCsatSettings licenseInfo={licenseInfo} canEdit={canEditSettings} />
      )}

      {/* Manajemen Multi-CS, Role & Batasan Akses */}
      {settingsTab === 'agents' && !canManageAgents && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 text-xs text-amber-800">
          Halaman Manajemen Multi-CS, Role &amp; Batasan Akses hanya tersedia untuk Admin atau role dengan izin <code className="font-mono">settings.agents</code>.
        </div>
      )}
      {settingsTab === 'agents' && canManageAgents && (
        <div className="space-y-4">
          {/* Sub-navigasi Akun CS vs Role Builder */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-gray-100">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Manajemen Multi-CS &amp; Role Batasan Akses
                  </h3>
                  {agentQuota && (
                    <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[11px] font-mono border border-gray-200">
                      {agentQuota.currentCount}/{agentQuota.maxAgents} akun CS
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[11px] font-mono border border-indigo-200">
                    {roles.length} role
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Buat Role khusus dengan batasan menu, aksi, dan tombol tertentu, lalu tugaskan ke akun CS. Pembatasan berlaku di API backend maupun menu/tombol frontend.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
                  <button
                    type="button"
                    onClick={() => setAgentsSubTab('agents')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      agentsSubTab === 'agents'
                        ? 'bg-white text-gray-900 shadow-xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Akun CS ({agents.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentsSubTab('roles')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      agentsSubTab === 'roles'
                        ? 'bg-white text-gray-900 shadow-xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Role &amp; Batasan ({roles.length})</span>
                  </button>
                </div>

                {agentsSubTab === 'roles' ? (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleStartCreateRole}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Buat Role Baru
                  </Button>
                ) : agentQuota && !agentQuota.multiAgent ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={onOpenPlans}
                  >
                    Upgrade Multi-CS
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      resetAgentForm();
                      setShowAgentForm(true);
                    }}
                    disabled={Boolean(agentQuota && agentQuota.currentCount >= agentQuota.maxAgents)}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Tambah Akun CS
                  </Button>
                )}
              </div>
            </div>

            {agentsSubTab === 'agents' && (
              <div className="space-y-4">
                {agentQuota && !agentQuota.multiAgent && (
                  <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800 flex flex-wrap items-center justify-between gap-3">
                    <span>
                      Paket <strong>{agentQuota.plan}</strong> hanya mendukung 1 akun admin utama. Upgrade ke paket Pro (maks 5 akun CS) atau Enterprise (maks 25 akun CS) untuk Multi-CS dengan Role khusus.
                    </span>
                    {onOpenPlans && (
                      <button
                        type="button"
                        onClick={onOpenPlans}
                        className="px-2.5 py-1 rounded bg-amber-600 text-white text-[11px] font-medium hover:bg-amber-700 shrink-0"
                      >
                        Lihat Paket
                      </button>
                    )}
                  </div>
                )}

                {showAgentForm && (
                  <form onSubmit={handleSaveAgent} className="p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-gray-900">
                        {editingAgentId ? 'Edit Data Akun CS' : 'Tambah Akun CS Baru'}
                      </h4>
                      <button
                        type="button"
                        onClick={resetAgentForm}
                        className="text-xs text-gray-500 hover:text-gray-800"
                      >
                        Batal
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">Nama CS</label>
                        <input
                          type="text"
                          required
                          value={agentName}
                          onChange={(e) => setAgentName(e.target.value)}
                          placeholder="Misal: Rina (CS Shift Pagi)"
                          className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">Email Login</label>
                        <input
                          type="email"
                          required
                          value={agentEmail}
                          onChange={(e) => setAgentEmail(e.target.value)}
                          placeholder="cs@domain.com"
                          className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">
                          Password {editingAgentId ? '(kosongkan jika tetap)' : ''}
                        </label>
                        <input
                          type="password"
                          required={!editingAgentId}
                          minLength={6}
                          value={agentPassword}
                          onChange={(e) => setAgentPassword(e.target.value)}
                          placeholder="Min. 6 karakter"
                          className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">
                          Pilih Role &amp; Batasan
                        </label>
                        <select
                          value={agentRoleId}
                          onChange={(e) => handleSelectAgentRoleTemplate(e.target.value)}
                          className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs"
                        >
                          {roles
                            .filter((r) => isFullAdmin || r.id !== 'role_admin')
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name} ({r.permissions.length} izin)
                              </option>
                            ))}
                          <option value="__CUSTOM__">Khusus / Override Manual</option>
                        </select>
                      </div>
                    </div>

                    {agentRoleId !== 'role_admin' && agentRole !== 'ADMIN' && (
                      <div className="space-y-2.5 pt-1">
                        {agentRoleId !== '__CUSTOM__' ? (
                          <div className="p-3 rounded-md bg-white border border-gray-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="space-y-1">
                              <div className="font-medium text-gray-800">
                                Mengikuti Role:{' '}
                                <span className="text-indigo-700">
                                  {roles.find((r) => r.id === agentRoleId)?.name || agentRoleId}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {(roles.find((r) => r.id === agentRoleId)?.permissions || agentPermissions).map((p) => (
                                  <span
                                    key={p}
                                    className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px]"
                                  >
                                    {permissionLabelMap.get(p) || p}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSelectAgentRoleTemplate('__CUSTOM__')}
                              className="px-2.5 py-1.5 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100 text-[11px] font-medium text-gray-700 shrink-0 self-start sm:self-center"
                            >
                              Sesuaikan Khusus Akun Ini
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label className="text-[11px] font-semibold text-gray-700">
                                Checklist Batasan Menu &amp; Tombol Khusus ({agentPermissions.length} dipilih)
                              </label>
                              <button
                                type="button"
                                onClick={() => setAgentsSubTab('roles')}
                                className="text-[11px] text-indigo-600 hover:underline"
                              >
                                Simpan sebagai Role permanen? Buat di tab Role &amp; Batasan
                              </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                              {groupedPermissionCatalog.map((grp) => (
                                <div
                                  key={grp.group}
                                  className="p-3 rounded-md bg-white border border-gray-200 space-y-2"
                                >
                                  <div className="text-[11px] font-semibold text-gray-800 border-b border-gray-100 pb-1">
                                    {grp.group}
                                  </div>
                                  <div className="space-y-1.5">
                                    {grp.items.map((perm) => {
                                      const checked = agentPermissions.includes(perm.id);
                                      const restrictedForSubAdmin =
                                        !isFullAdmin &&
                                        (perm.id === 'settings.agents' || perm.id === 'settings.edit') &&
                                        !hasPerm(currentUser, perm.id);
                                      return (
                                        <label
                                          key={perm.id}
                                          className={`flex items-start gap-2 text-xs ${
                                            restrictedForSubAdmin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                                          }`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={restrictedForSubAdmin}
                                            onChange={() => togglePermission(perm.id)}
                                            className="mt-0.5 rounded border-gray-300 text-indigo-600"
                                          />
                                          <div className="min-w-0 leading-snug">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                              <span className="font-medium text-gray-800">{perm.label}</span>
                                              <span
                                                className={`px-1 py-0.2 rounded text-[9px] font-semibold uppercase ${
                                                  perm.kind === 'menu'
                                                    ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                                }`}
                                              >
                                                {perm.kind === 'menu' ? 'Menu' : 'Tombol'}
                                              </span>
                                            </div>
                                            <p className="text-[10px] text-gray-500">{perm.description}</p>
                                          </div>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-1">
                      <Button type="button" variant="secondary" size="sm" onClick={resetAgentForm}>
                        Batal
                      </Button>
                      <Button type="submit" variant="primary" size="sm" isLoading={savingAgent}>
                        {editingAgentId ? 'Simpan Perubahan' : 'Buat Akun CS'}
                      </Button>
                    </div>
                  </form>
                )}

                {agentsLoading ? (
                  <div className="text-xs text-gray-500 py-4 text-center">Memuat daftar akun CS...</div>
                ) : agents.length === 0 ? (
                  <div className="text-xs text-gray-500 py-4 text-center">Belum ada data akun CS.</div>
                ) : (
                  <>
                    <div className="sm:hidden divide-y divide-gray-200 border border-gray-200 rounded-md overflow-hidden">
                      {agents.map((ag) => {
                        const isSelf = currentUser?.id === ag.id || currentUser?.email === ag.email;
                        const cannotTouchAdmin = !isFullAdmin && ag.role === 'ADMIN';
                        const visiblePerms = ag.permissions || [];
                        return (
                          <div key={ag.id} className="p-3 bg-white space-y-2 text-xs">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-semibold text-gray-900 truncate">{ag.name}</div>
                                <div className="text-[11px] text-gray-500 font-mono truncate">{ag.email}</div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                    ag.role === 'ADMIN'
                                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                      : 'bg-sky-50 text-sky-700 border border-sky-200'
                                  }`}
                                >
                                  {ag.roleName || (ag.role === 'ADMIN' ? 'Administrator' : 'Custom')}
                                </span>
                                <button
                                  type="button"
                                  disabled={isSelf || cannotTouchAdmin}
                                  onClick={() => void handleToggleAgentActive(ag)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                    ag.isActive
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-gray-100 text-gray-500 border border-gray-200'
                                  } ${isSelf || cannotTouchAdmin ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                                >
                                  {ag.isActive ? 'Aktif' : 'Nonaktif'}
                                </button>
                              </div>
                            </div>

                            <div>
                              {ag.role === 'ADMIN' ? (
                                <span className="text-[11px] text-gray-500">Akses: Semua Menu &amp; Aksi Penuh</span>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {visiblePerms.slice(0, 5).map((p) => (
                                    <span
                                      key={p}
                                      className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px]"
                                    >
                                      {permissionLabelMap.get(p) || p}
                                    </span>
                                  ))}
                                  {visiblePerms.length > 5 && (
                                    <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-medium">
                                      +{visiblePerms.length - 5} izin lainnya
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-gray-100">
                              <button
                                type="button"
                                disabled={cannotTouchAdmin}
                                onClick={() => handleStartEditAgent(ag)}
                                className="h-7 px-2.5 rounded border border-gray-200 bg-white inline-flex items-center gap-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Edit</span>
                              </button>
                              {!isSelf && !cannotTouchAdmin && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteAgent(ag)}
                                  className="h-7 px-2.5 rounded border border-gray-200 bg-white inline-flex items-center gap-1 text-[11px] text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Hapus</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full min-w-[560px] text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-gray-200 text-[11px] uppercase text-gray-500">
                            <th className="py-2 pr-3 font-medium">Nama &amp; Email</th>
                            <th className="py-2 px-3 font-medium">Role</th>
                            <th className="py-2 px-3 font-medium">Batasan Menu &amp; Tombol</th>
                            <th className="py-2 px-3 font-medium">Status</th>
                            <th className="py-2 pl-3 font-medium text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {agents.map((ag) => {
                            const isSelf = currentUser?.id === ag.id || currentUser?.email === ag.email;
                            const cannotTouchAdmin = !isFullAdmin && ag.role === 'ADMIN';
                            const visiblePerms = ag.permissions || [];
                            return (
                              <tr key={ag.id} className="hover:bg-gray-50/70">
                                <td className="py-2.5 pr-3">
                                  <div className="font-medium text-gray-900">{ag.name}</div>
                                  <div className="text-[11px] text-gray-500 font-mono">{ag.email}</div>
                                </td>
                                <td className="py-2.5 px-3">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                                      ag.role === 'ADMIN'
                                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                        : 'bg-sky-50 text-sky-700 border border-sky-200'
                                    }`}
                                  >
                                    {ag.roleName || (ag.role === 'ADMIN' ? 'Administrator' : 'Custom Manual')}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3">
                                  {ag.role === 'ADMIN' ? (
                                    <span className="text-[11px] text-gray-500">Akses Penuh (18 izin)</span>
                                  ) : (
                                    <div className="flex flex-wrap gap-1 max-w-md">
                                      {visiblePerms.slice(0, 4).map((p) => (
                                        <span
                                          key={p}
                                          className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px]"
                                        >
                                          {permissionLabelMap.get(p) || p}
                                        </span>
                                      ))}
                                      {visiblePerms.length > 4 && (
                                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-medium">
                                          +{visiblePerms.length - 4} lainnya ({visiblePerms.length} total)
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3">
                                  <button
                                    type="button"
                                    disabled={isSelf || cannotTouchAdmin}
                                    onClick={() => void handleToggleAgentActive(ag)}
                                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                      ag.isActive
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-gray-100 text-gray-500 border border-gray-200'
                                    } ${isSelf || cannotTouchAdmin ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                                  >
                                    {ag.isActive ? 'Aktif' : 'Nonaktif'}
                                  </button>
                                </td>
                                <td className="py-2.5 pl-3 text-right">
                                  <div className="inline-flex items-center rounded-md border border-gray-200 bg-white divide-x divide-gray-200 overflow-hidden shadow-xs">
                                    <button
                                      type="button"
                                      disabled={cannotTouchAdmin}
                                      onClick={() => handleStartEditAgent(ag)}
                                      className="h-7 w-7 inline-flex items-center justify-center text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 transition-colors disabled:opacity-40"
                                      title="Edit Akun CS"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" strokeWidth={1.75} />
                                    </button>
                                    {!isSelf && !cannotTouchAdmin && (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteAgent(ag)}
                                        className="h-7 w-7 inline-flex items-center justify-center text-gray-600 hover:text-red-700 hover:bg-red-50 transition-colors"
                                        title="Hapus Akun CS"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {agentsSubTab === 'roles' && (
              <div className="space-y-4">
                {showRoleForm && (
                  <form onSubmit={handleSaveRole} className="p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-semibold text-gray-900">
                          {editingRoleId ? `Edit Role "${roleNameInput}"` : 'Buat Role Baru & Batasan Akses'}
                        </h4>
                        <p className="text-[11px] text-gray-500">
                          Centang menu dan aksi/tombol yang diizinkan. Semua akun CS dengan role ini otomatis diperbarui.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={resetRoleForm}
                        className="text-xs text-gray-500 hover:text-gray-800 shrink-0"
                      >
                        Batal
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">
                          Nama Role <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={roleNameInput}
                          onChange={(e) => setRoleNameInput(e.target.value)}
                          placeholder="Misal: CS Magang, Kepala Shift, Admin Konten"
                          className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">
                          Deskripsi Batasan Role
                        </label>
                        <input
                          type="text"
                          value={roleDescInput}
                          onChange={(e) => setRoleDescInput(e.target.value)}
                          placeholder="Misal: Bisa balas chat & tambah kontak, dilarang hapus/ekspor"
                          className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-medium text-gray-600 mr-1">Preset Cepat:</span>
                      <button
                        type="button"
                        onClick={() =>
                          setRolePermissionsInput(
                            ALL_PERMISSION_KEYS.filter(
                              (k) => isFullAdmin || (k !== 'settings.agents' && k !== 'settings.edit')
                            )
                          )
                        }
                        className="px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-100 text-[11px] text-gray-700"
                      >
                        Semua Izin
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setRolePermissionsInput([
                            'dashboard',
                            'contacts',
                            'contacts.create',
                            'contacts.edit',
                            'conversations',
                            'conversations.reply',
                            'conversations.manage',
                            'conversations.csat',
                            'tracking',
                          ])
                        }
                        className="px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-100 text-[11px] text-gray-700"
                      >
                        Hanya CS Chat
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setRolePermissionsInput([
                            'dashboard',
                            'contacts',
                            'broadcasts',
                            'broadcasts.send',
                            'tracking',
                          ])
                        }
                        className="px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-100 text-[11px] text-gray-700"
                      >
                        Tim Konten &amp; Story
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setRolePermissionsInput([
                            'dashboard',
                            'contacts',
                            'broadcasts',
                            'tracking',
                            'conversations',
                            'conversations.view_all',
                          ])
                        }
                        className="px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-100 text-[11px] text-gray-700"
                      >
                        Mode Read-Only / Auditor
                      </button>
                      <button
                        type="button"
                        onClick={() => setRolePermissionsInput([])}
                        className="px-2 py-1 rounded border border-gray-200 bg-white hover:bg-red-50 hover:text-red-600 text-[11px] text-gray-500"
                      >
                        Kosongkan
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {groupedPermissionCatalog.map((grp) => {
                        const groupKeys = grp.items.map((item) => item.id);
                        const allChecked = groupKeys.every((k) => rolePermissionsInput.includes(k));
                        return (
                          <div key={grp.group} className="p-3 rounded-md bg-white border border-gray-200 space-y-2">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
                              <span className="text-[11px] font-semibold text-gray-900">{grp.group}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (allChecked) {
                                    setRolePermissionsInput((prev) =>
                                      prev.filter((k) => !groupKeys.includes(k))
                                    );
                                  } else {
                                    setRolePermissionsInput((prev) =>
                                      Array.from(
                                        new Set([
                                          ...prev,
                                          ...groupKeys.filter(
                                            (k) =>
                                              isFullAdmin ||
                                              (k !== 'settings.agents' && k !== 'settings.edit') ||
                                              hasPerm(currentUser, k)
                                          ),
                                        ])
                                      )
                                    );
                                  }
                                }}
                                className="text-[10px] font-medium text-indigo-600 hover:underline"
                              >
                                {allChecked ? 'Lepas Grup' : 'Pilih Grup'}
                              </button>
                            </div>
                            <div className="space-y-2">
                              {grp.items.map((perm) => {
                                const checked = rolePermissionsInput.includes(perm.id);
                                const restrictedForSubAdmin =
                                  !isFullAdmin &&
                                  (perm.id === 'settings.agents' || perm.id === 'settings.edit') &&
                                  !hasPerm(currentUser, perm.id);
                                return (
                                  <label
                                    key={perm.id}
                                    className={`flex items-start gap-2 text-xs ${
                                      restrictedForSubAdmin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={restrictedForSubAdmin}
                                      onChange={() =>
                                        setRolePermissionsInput((prev) =>
                                          togglePermissionWithParent(prev, perm.id)
                                        )
                                      }
                                      className="mt-0.5 rounded border-gray-300 text-indigo-600"
                                    />
                                    <div className="min-w-0 leading-snug">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="font-medium text-gray-800">{perm.label}</span>
                                        <span
                                          className={`px-1 py-0.2 rounded text-[9px] font-semibold uppercase ${
                                            perm.kind === 'menu'
                                              ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                                          }`}
                                        >
                                          {perm.kind === 'menu' ? 'Menu' : 'Tombol / Aksi'}
                                        </span>
                                      </div>
                                      <p className="text-[10px] text-gray-500">{perm.description}</p>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <Button type="button" variant="secondary" size="sm" onClick={resetRoleForm}>
                        Batal
                      </Button>
                      <Button type="submit" variant="primary" size="sm" isLoading={savingRole}>
                        {editingRoleId ? 'Simpan Perubahan Role' : 'Simpan Role Baru'}
                      </Button>
                    </div>
                  </form>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {roles.map((r) => {
                    const menuCount = r.permissions.filter((p) => !p.includes('.')).length;
                    const actionCount = r.permissions.filter((p) => p.includes('.')).length;
                    const lockEditRoleAdmin = r.id === 'role_admin';
                    return (
                      <div
                        key={r.id}
                        className="p-3.5 rounded-lg border border-gray-200 bg-white flex flex-col justify-between gap-3"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-semibold text-gray-900">{r.name}</span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                  r.isSystem
                                    ? 'bg-gray-50 text-gray-600 border-gray-200'
                                    : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                }`}
                              >
                                {r.isSystem ? 'Bawaan' : 'Custom'}
                              </span>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px] font-mono shrink-0">
                              {r.agentCount || 0} CS
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 leading-relaxed">
                            {r.description || 'Tanpa deskripsi tambahan.'}
                          </p>
                          <div className="flex flex-wrap gap-1 pt-1">
                            <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-medium">
                              {menuCount} Menu
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-medium">
                              {actionCount} Batasan Tombol/Aksi
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-[11px]">
                          <span className="text-gray-400 font-mono truncate">{r.id}</span>
                          <div className="flex items-center gap-1.5">
                            {!lockEditRoleAdmin && (
                              <button
                                type="button"
                                onClick={() => handleStartEditRole(r)}
                                className="h-7 px-2.5 rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 inline-flex items-center gap-1"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Atur Batasan</span>
                              </button>
                            )}
                            {!r.isSystem && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteRole(r)}
                                className="h-7 px-2.5 rounded border border-gray-200 bg-white hover:bg-red-50 text-red-600 inline-flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Hapus</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {(settingsTab === 'quick_replies' ||
        settingsTab === 'products' ||
        settingsTab === 'labels' ||
        settingsTab === 'templates') && (
        <MasterDataSettings
          section={settingsTab as MasterDataSection}
          canEdit={canEditSettings}
        />
      )}
      {settingsTab === 'automation' && <AutomationSettings canEdit={canEditSettings} />}
      {settingsTab === 'omnichannel' && <OmnichannelSettings canEdit={canEditSettings} />}

      <ConfirmModal
        isOpen={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirmSessionAction}
        isLoading={sessionActionLoading}
        title={
          confirmAction === 'logout'
            ? `Logout Sesi "${inspectedSession}"?`
            : `Hentikan Sesi "${inspectedSession}"?`
        }
        description={
          confirmAction === 'logout'
            ? `Sesi "${inspectedSession}" akan keluar dari perangkat tertaut dan perlu scan QR ulang untuk terhubung kembali.`
            : `Sesi "${inspectedSession}" akan dihentikan sementara dan tidak dapat mengirim pesan hingga dijalankan kembali.`
        }
        confirmLabel={confirmAction === 'logout' ? 'Ya, Logout' : 'Ya, Hentikan'}
        variant="danger"
      />

      <ConfirmModal
        isOpen={confirmDeleteSession !== null}
        onClose={() => setConfirmDeleteSession(null)}
        onConfirm={handleConfirmDeleteSession}
        isLoading={sessionBusyName !== null}
        title={`Hapus Sesi "${confirmDeleteSession}"?`}
        description="Sesi WhatsApp ini akan dihapus dari server WAHA. Jika ini adalah sesi aktif, sistem akan mengalihkan sesi aktif ke sesi lain."
        confirmLabel="Ya, Hapus Sesi"
        variant="danger"
      />

      <ConfirmModal
        isOpen={confirmDeleteAgent !== null}
        onClose={() => setConfirmDeleteAgent(null)}
        onConfirm={handleConfirmDeleteAgent}
        title={`Hapus Agent "${confirmDeleteAgent?.name}"?`}
        description="Akun agent ini akan dihapus permanen dan tidak bisa login lagi ke CRM."
        confirmLabel="Ya, Hapus Agent"
        variant="danger"
      />

      <ConfirmModal
        isOpen={confirmDeleteRole !== null}
        onClose={() => setConfirmDeleteRole(null)}
        onConfirm={handleConfirmDeleteRole}
        title={`Hapus Role "${confirmDeleteRole?.name}"?`}
        description="Role custom ini akan dihapus. Jika ada CS yang menggunakannya, lepaskan/pindahkan role akun tersebut terlebih dahulu."
        confirmLabel="Ya, Hapus Role"
        variant="danger"
      />
    </div>
  );
};

export default Settings;
