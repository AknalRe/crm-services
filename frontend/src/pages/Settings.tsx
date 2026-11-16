import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Server,
  Globe,
  Trash2,
  Edit3,
  Search,
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
  LicenseInfo,
  SettingsSection,
  WahaSessionItem,
  WahaStatus,
} from '../types';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useToast } from '../components/ui/ToastProvider';

const PERMISSION_OPTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'contacts', label: 'Kontak Pelanggan' },
  { id: 'broadcasts', label: 'Siaran & Kampanye' },
  { id: 'birthday', label: 'Ulang Tahun' },
  { id: 'tracking', label: 'Pelacakan Status' },
  { id: 'conversations', label: 'Live Chat CRM' },
  { id: 'settings', label: 'Master Data & Pengaturan' },
];

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

  // Multi-Agent state (ADMIN only)
  const isAdmin = !currentUser || currentUser.role !== 'AGENT';
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [agentQuota, setAgentQuota] = useState<AgentQuota | null>(null);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentEmail, setAgentEmail] = useState('');
  const [agentPassword, setAgentPassword] = useState('');
  const [agentRole, setAgentRole] = useState<'ADMIN' | 'AGENT'>('AGENT');
  const [agentPermissions, setAgentPermissions] = useState<string[]>(['dashboard', 'contacts', 'conversations']);
  const [savingAgent, setSavingAgent] = useState(false);
  const [confirmDeleteAgent, setConfirmDeleteAgent] = useState<AgentItem | null>(null);
  const [internalTab, setInternalTab] = useState<SettingsSection>('whatsapp');
  const settingsTab = activeSection ?? internalTab;
  const setSettingsTab = (sec: SettingsSection) => {
    setInternalTab(sec);
    onSectionChange?.(sec);
  };

  const fetchAgents = useCallback(async () => {
    if (!isAdmin) return;
    setAgentsLoading(true);
    try {
      const data = await api.getAgents();
      setAgents(data.agents || []);
      setAgentQuota(data.quota || null);
    } catch {
      setAgents([]);
    } finally {
      setAgentsLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  const resetAgentForm = () => {
    setEditingAgentId(null);
    setAgentName('');
    setAgentEmail('');
    setAgentPassword('');
    setAgentRole('AGENT');
    setAgentPermissions(['dashboard', 'contacts', 'conversations']);
    setShowAgentForm(false);
  };

  const handleStartEditAgent = (agent: AgentItem) => {
    setEditingAgentId(agent.id);
    setAgentName(agent.name);
    setAgentEmail(agent.email);
    setAgentPassword('');
    setAgentRole(agent.role);
    setAgentPermissions(agent.permissions || []);
    setShowAgentForm(true);
  };

  const togglePermission = (perm: string) => {
    setAgentPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const handleSaveAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAgent(true);
    try {
      if (editingAgentId) {
        await api.updateAgent(editingAgentId, {
          name: agentName.trim(),
          email: agentEmail.trim(),
          ...(agentPassword.trim() ? { password: agentPassword.trim() } : {}),
          role: agentRole,
          permissions: agentRole === 'ADMIN' ? PERMISSION_OPTIONS.map((p) => p.id) : agentPermissions,
        });
        toast.success('Data agent berhasil diperbarui.');
      } else {
        await api.createAgent({
          name: agentName.trim(),
          email: agentEmail.trim(),
          password: agentPassword.trim(),
          role: agentRole,
          permissions: agentRole === 'ADMIN' ? PERMISSION_OPTIONS.map((p) => p.id) : agentPermissions,
        });
        toast.success('Agent baru berhasil ditambahkan.');
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
      const coreNote =
        res.tier?.toUpperCase() === 'CORE'
          ? ' Catatan: WAHA Core hanya mendukung 1 sesi ("default"); multi-sesi memerlukan WAHA Plus.'
          : '';
      setExternalTestResult({
        ok: true,
        text: `Koneksi berhasil ke WAHA${tierLabel}${verLabel}. Ditemukan ${res.sessionCount} sesi.${coreNote}`,
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
      ? 'OFFLINE'
      : activeSessionItem?.status || wahaStatus?.sessionStatus || 'STOPPED'
  ).toUpperCase();
  const isActiveWorking = wahaStatus?.connected && effectiveSessionStatus === 'WORKING';
  const isServerOffline = effectiveSessionStatus === 'OFFLINE';
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
  const webhookUrlValue = wahaStatus?.webhookUrl || `${window.location.origin}/api/waha/webhook`;

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

  return (
    <div className="space-y-5">
      {settingsTab === 'whatsapp' && (
      <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Koneksi Layanan WhatsApp (WAHA)</h1>
          <p className="text-xs text-gray-500 mt-0.5">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
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
                onClick={() => handleSelectMode('INTERNAL')}
                className={`p-3.5 rounded-lg border text-left transition-colors ${
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
                onClick={() => handleSelectMode('EXTERNAL')}
                className={`p-3.5 rounded-lg border text-left transition-colors ${
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
                  {wahaStatus?.config && savedMode === 'EXTERNAL' && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                      Aktif
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Gunakan URL dan API Key gateway WAHA eksternal milik Anda sendiri dengan dukungan multi-sesi.
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
                      onClick={() => void handleActivateInternalMode()}
                    >
                      Simpan &amp; Aktifkan WAHA Internal
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleSaveWahaSettings} className="space-y-3.5 pt-1">
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
                  <Button type="submit" variant="primary" isLoading={saving}>
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
                        disabled={sessions.length >= maxSessions}
                        className="w-full flex-none sm:flex-1 h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] font-mono focus:outline-none focus:border-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                      />
                      <Button
                        type="submit"
                        variant="primary"
                        size="md"
                        isLoading={creatingSession}
                        disabled={!newSessionName.trim() || sessions.length >= maxSessions}
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
                                  disabled={isBusy}
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
                                    disabled={isBusy}
                                    onClick={() => void handleQuickStartSession(item.name)}
                                  >
                                    Start
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
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
                                  disabled={isBusy}
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

          <form onSubmit={handleSendTest} className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Kirim Pesan Uji Coba</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Verifikasi pengiriman pesan langsung ke nomor WhatsApp tujuan.
              </p>
            </div>

            {sessions.length > 1 && (
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
                  disabled={isServerOffline || sessionActionLoading}
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
                  disabled={isActiveWorking || isServerOffline || sessionActionLoading}
                  isLoading={sessionActionLoading}
                >
                  Start Sesi
                </Button>

                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setConfirmAction('stop')}
                  disabled={!canStopOrLogout || sessionActionLoading}
                >
                  Stop Sesi
                </Button>
              </div>

              <Button
                variant="secondary"
                size="md"
                className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 hover:text-red-700"
                onClick={() => setConfirmAction('logout')}
                disabled={!canStopOrLogout || sessionActionLoading}
              >
                Logout Sesi WhatsApp
              </Button>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5 text-xs space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-gray-900 font-semibold text-sm">Webhook Tracking Otomatis</h3>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void handleCopyWebhook()}
              >
                {webhookCopied ? 'Tersalin' : 'Salin'}
              </Button>
            </div>
            <p className="text-gray-500 text-[11px] leading-relaxed">
              WAHA mengirimkan event <code className="font-mono text-gray-800">message.ack</code> ke endpoint backend CRM:
            </p>
            <div className="bg-gray-50 p-2.5 rounded-md font-mono text-[11px] text-gray-800 break-all select-all border border-gray-200">
              {webhookUrlValue}
            </div>
            <p className="text-[11px] text-gray-500">
              Event ini mencatat status pesan sampai (Centang Dua) dan dibaca (Centang Biru).
            </p>
          </div>
        </div>
      </div>
      </div>
      )}

      {/* Pengaturan SLA, Routing Agent & Survei CSAT */}
      {settingsTab === 'sla_csat' && (
        <SlaRoutingCsatSettings licenseInfo={licenseInfo} />
      )}

      {/* Manajemen Multi-Agent & Hak Akses (ADMIN only) */}
      {settingsTab === 'agents' && !isAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 text-xs text-amber-800">
          Halaman Manajemen Multi-Agent &amp; Hak Akses hanya tersedia untuk pengguna dengan peran ADMIN.
        </div>
      )}
      {settingsTab === 'agents' && isAdmin && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-gray-100">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900">Manajemen Akun &amp; Agent</h3>
                {agentQuota && (
                  <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[11px] font-mono border border-gray-200">
                    {agentQuota.currentCount}/{agentQuota.maxAgents} akun
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Kelola akun agent dan batasi akses menu untuk masing-masing agent sesuai paket lisensi.
              </p>
            </div>

            {agentQuota && !agentQuota.multiAgent ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onOpenPlans}
              >
                Upgrade untuk Multi-Agent
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
                Tambah Agent
              </Button>
            )}
          </div>

          {agentQuota && !agentQuota.multiAgent && (
            <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800 flex flex-wrap items-center justify-between gap-3">
              <span>
                Paket <strong>{agentQuota.plan}</strong> hanya mendukung 1 akun admin utama. Upgrade ke paket Pro (maks 5 agent) atau Enterprise (maks 25 agent) untuk menambah agent dengan pembatasan akses.
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
            <form onSubmit={handleSaveAgent} className="p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-gray-900">
                  {editingAgentId ? 'Edit Data Agent' : 'Tambah Agent Baru'}
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
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Nama</label>
                  <input
                    type="text"
                    required
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="Nama Agent"
                    className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={agentEmail}
                    onChange={(e) => setAgentEmail(e.target.value)}
                    placeholder="agent@domain.com"
                    className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
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
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Peran</label>
                  <select
                    value={agentRole}
                    onChange={(e) => setAgentRole(e.target.value as 'ADMIN' | 'AGENT')}
                    className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs"
                  >
                    <option value="AGENT">AGENT (Terbatas)</option>
                    <option value="ADMIN">ADMIN (Akses Penuh)</option>
                  </select>
                </div>
              </div>

              {agentRole === 'AGENT' && (
                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
                    Batasan Akses Menu
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PERMISSION_OPTIONS.map((perm) => {
                      const checked = agentPermissions.includes(perm.id);
                      return (
                        <label
                          key={perm.id}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs cursor-pointer ${
                            checked
                              ? 'bg-indigo-50 border-indigo-300 text-indigo-800'
                              : 'bg-white border-gray-200 text-gray-600'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePermission(perm.id)}
                            className="rounded border-gray-300 text-indigo-600"
                          />
                          <span>{perm.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="secondary" size="sm" onClick={resetAgentForm}>
                  Batal
                </Button>
                <Button type="submit" variant="primary" size="sm" isLoading={savingAgent}>
                  {editingAgentId ? 'Simpan Perubahan' : 'Buat Akun Agent'}
                </Button>
              </div>
            </form>
          )}

          {agentsLoading ? (
            <div className="text-xs text-gray-500 py-4 text-center">Memuat daftar agent...</div>
          ) : agents.length === 0 ? (
            <div className="text-xs text-gray-500 py-4 text-center">Belum ada data agent.</div>
          ) : (
            <>
              <div className="sm:hidden divide-y divide-gray-200 border border-gray-200 rounded-md overflow-hidden">
                {agents.map((ag) => {
                  const isSelf = currentUser?.id === ag.id || currentUser?.email === ag.email;
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
                            {ag.role}
                          </span>
                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={() => void handleToggleAgentActive(ag)}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              ag.isActive
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-gray-100 text-gray-500 border border-gray-200'
                            } ${isSelf ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            {ag.isActive ? 'Aktif' : 'Nonaktif'}
                          </button>
                        </div>
                      </div>

                      <div>
                        {ag.role === 'ADMIN' ? (
                          <span className="text-[11px] text-gray-500">Akses: Semua Menu</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {(ag.permissions || []).map((p) => (
                              <span
                                key={p}
                                className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px]"
                              >
                                {PERMISSION_OPTIONS.find((o) => o.id === p)?.label || p}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-gray-100">
                        <button
                          type="button"
                          onClick={() => handleStartEditAgent(ag)}
                          className="h-7 px-2.5 rounded border border-gray-200 bg-white inline-flex items-center gap-1 text-[11px] text-gray-700 hover:bg-gray-50"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                        {!isSelf && (
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
                <table className="w-full min-w-[540px] text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-[11px] uppercase text-gray-500">
                      <th className="py-2 pr-3 font-medium">Nama &amp; Email</th>
                      <th className="py-2 px-3 font-medium">Peran</th>
                      <th className="py-2 px-3 font-medium">Akses Menu</th>
                      <th className="py-2 px-3 font-medium">Status</th>
                      <th className="py-2 pl-3 font-medium text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {agents.map((ag) => {
                      const isSelf = currentUser?.id === ag.id || currentUser?.email === ag.email;
                      return (
                        <tr key={ag.id} className="hover:bg-gray-50/70">
                          <td className="py-2.5 pr-3">
                            <div className="font-medium text-gray-900">{ag.name}</div>
                            <div className="text-[11px] text-gray-500 font-mono">{ag.email}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                ag.role === 'ADMIN'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : 'bg-sky-50 text-sky-700 border border-sky-200'
                              }`}
                            >
                              {ag.role}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            {ag.role === 'ADMIN' ? (
                              <span className="text-[11px] text-gray-500">Semua Menu</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {(ag.permissions || []).map((p) => (
                                  <span
                                    key={p}
                                    className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px]"
                                  >
                                    {PERMISSION_OPTIONS.find((o) => o.id === p)?.label || p}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <button
                              type="button"
                              disabled={isSelf}
                              onClick={() => void handleToggleAgentActive(ag)}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                ag.isActive
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-gray-100 text-gray-500 border border-gray-200'
                              } ${isSelf ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              {ag.isActive ? 'Aktif' : 'Nonaktif'}
                            </button>
                          </td>
                          <td className="py-2.5 pl-3 text-right">
                            <div className="inline-flex items-center rounded-md border border-gray-200 bg-white divide-x divide-gray-200 overflow-hidden shadow-xs">
                              <button
                                type="button"
                                onClick={() => handleStartEditAgent(ag)}
                                className="h-7 w-7 inline-flex items-center justify-center text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
                                title="Edit Agent"
                              >
                                <Edit3 className="w-3.5 h-3.5" strokeWidth={1.75} />
                              </button>
                              {!isSelf && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteAgent(ag)}
                                  className="h-7 w-7 inline-flex items-center justify-center text-gray-600 hover:text-red-700 hover:bg-red-50 transition-colors"
                                  title="Hapus Agent"
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

      {(settingsTab === 'quick_replies' ||
        settingsTab === 'products' ||
        settingsTab === 'labels' ||
        settingsTab === 'templates') && (
        <MasterDataSettings section={settingsTab as MasterDataSection} />
      )}
      {settingsTab === 'automation' && <AutomationSettings />}
      {settingsTab === 'omnichannel' && <OmnichannelSettings />}

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
    </div>
  );
};

export default Settings;
