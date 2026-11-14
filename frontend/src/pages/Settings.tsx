import React, { useCallback, useEffect, useState } from 'react';
import {
  Server,
  RefreshCw,
  QrCode,
  Send,
  LogOut,
  Power,
  ShieldCheck,
  Globe,
  Lock,
  Plus,
  Check,
  Trash2,
  Users,
  Clock,
  Star,
  Edit3,
  UserPlus,
} from 'lucide-react';
import api from '../services/api';
import { subscribeLiveEvent } from '../services/liveEvents';
import {
  AgentItem,
  AgentQuota,
  AuthStatus,
  LicenseInfo,
  WahaSessionItem,
  WahaStatus,
} from '../types';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useToast } from '../components/ui/ToastProvider';

const PERMISSION_OPTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'contacts', label: 'Kontak Pelanggan' },
  { id: 'broadcasts', label: 'Siaran WhatsApp' },
  { id: 'birthday', label: 'Ulang Tahun' },
  { id: 'tracking', label: 'Pelacakan Status' },
  { id: 'conversations', label: 'Live Chat CRM' },
  { id: 'settings', label: 'Pengaturan & WAHA' },
];

interface SettingsProps {
  wahaStatus: WahaStatus | null;
  licenseInfo?: LicenseInfo | null;
  currentUser?: AuthStatus['user'] | null;
  onOpenPlans?: () => void;
  onRefreshStatus: () => void;
  onOpenQr: (sessionName?: string) => void;
}

export const Settings: React.FC<SettingsProps> = ({
  wahaStatus,
  licenseInfo,
  currentUser,
  onOpenPlans,
  onRefreshStatus,
  onOpenQr,
}) => {
  const toast = useToast();
  const isMultiSessionAllowed = Boolean(
    licenseInfo && !licenseInfo.isExpired && licenseInfo.features?.multiSession
  );
  const maxSessions = licenseInfo?.features?.maxSessions || 1;
  const [configMode, setConfigMode] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [session, setSession] = useState('default');
  const [saving, setSaving] = useState(false);

  const [sessions, setSessions] = useState<WahaSessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);
  const [sessionBusyName, setSessionBusyName] = useState<string | null>(null);

  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Halo, ini adalah pesan uji coba dari CRM WhatsApp.');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const [sessionActionLoading, setSessionActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'stop' | 'logout' | null>(null);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState<string | null>(null);

  // CRM CSAT Template & SLA state
  const [csatTemplate, setCsatTemplate] = useState(
    'Halo {nama_panggilan}, terima kasih telah menghubungi kami. Mohon bantuannya untuk memberikan penilaian layanan kami melalui tautan berikut:\n{link_csat}'
  );
  const [csatAutoOnResolve, setCsatAutoOnResolve] = useState(false);
  const [slaTargetMinutes, setSlaTargetMinutes] = useState(15);
  const [csatBaseUrl, setCsatBaseUrl] = useState('');
  const [savingCrm, setSavingCrm] = useState(false);

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

  const fetchCrmSettings = useCallback(async () => {
    try {
      const crm = await api.getCrmSettings();
      if (crm) {
        setCsatTemplate(crm.csatTemplate);
        setCsatAutoOnResolve(Boolean(crm.csatAutoOnResolve));
        setSlaTargetMinutes(crm.slaTargetMinutes || 15);
        setCsatBaseUrl(crm.csatBaseUrl || '');
      }
    } catch {
      // keep defaults
    }
  }, []);

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
    void fetchCrmSettings();
    void fetchAgents();
  }, [fetchCrmSettings, fetchAgents]);

  const handleSaveCrmSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCrm(true);
    try {
      await api.updateCrmSettings({
        csatTemplate,
        csatAutoOnResolve,
        slaTargetMinutes: Math.max(1, Math.min(1440, Number(slaTargetMinutes) || 15)),
        csatBaseUrl: csatBaseUrl.trim().replace(/\/+$/, ''),
      });
      toast.success('Pengaturan CSAT & SLA berhasil disimpan.');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan pengaturan CSAT & SLA.');
    } finally {
      setSavingCrm(false);
    }
  };

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
    } catch {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (wahaStatus?.config) {
      const mode = wahaStatus.config.mode === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL';
      setConfigMode(mode);
      setBaseUrl(wahaStatus.config.baseUrl || '');
      setApiKey(wahaStatus.config.apiKey || '');
      setSession(wahaStatus.config.session || 'default');
    }
  }, [wahaStatus]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions, wahaStatus?.connected, wahaStatus?.sessionStatus]);

  useEffect(() => {
    const unsub = subscribeLiveEvent('waha:status', () => {
      onRefreshStatus();
      void fetchSessions();
    });
    return unsub;
  }, [fetchSessions, onRefreshStatus]);

  const handleSelectMode = async (mode: 'INTERNAL' | 'EXTERNAL') => {
    setConfigMode(mode);
    if (mode === 'INTERNAL') {
      try {
        await api.updateWahaSettings({ mode: 'INTERNAL', session });
        toast.success('Mode WAHA Internal otomatis diaktifkan dan dikunci.');
        onRefreshStatus();
        fetchSessions();
      } catch (err: any) {
        toast.error(err.response?.data?.error || 'Gagal mengaktifkan mode WAHA Internal');
      }
    } else {
      if (wahaStatus?.config?.mode === 'INTERNAL') {
        setBaseUrl('');
        setApiKey('');
      }
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
        session: session.trim() || 'default',
      });
      toast.success('Konfigurasi WAHA eksternal berhasil disimpan.');
      onRefreshStatus();
      fetchSessions();
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
      await api.createWahaSession(clean, true);
      setNewSessionName('');
      toast.success(`Sesi "${clean}" berhasil ditambahkan dan diaktifkan.`);
      onRefreshStatus();
      fetchSessions();
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
      toast.success(`Sesi aktif beralih ke "${targetName}".`);
      onRefreshStatus();
      fetchSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengganti sesi aktif');
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
      onRefreshStatus();
      fetchSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menghapus sesi');
    } finally {
      setSessionBusyName(null);
    }
  };

  const handleStartSession = async () => {
    if (sessionActionLoading) return;
    setSessionActionLoading(true);
    try {
      await api.startWahaSession();
      toast.success('Perintah start sesi WhatsApp dikirim.');
      onRefreshStatus();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal memulai sesi WhatsApp');
    } finally {
      setSessionActionLoading(false);
    }
  };

  const handleConfirmSessionAction = async () => {
    if (!confirmAction || sessionActionLoading) return;
    setSessionActionLoading(true);
    try {
      if (confirmAction === 'stop') {
        await api.stopWahaSession();
        toast.info('Sesi WhatsApp dihentikan.');
      } else {
        await api.logoutWahaSession();
        toast.info('Sesi WhatsApp berhasil logout.');
      }
      setConfirmAction(null);
      onRefreshStatus();
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
      const res = await api.sendTestMessage(testPhone.trim(), testMessage.trim());
      if (res.success) {
        setTestResult({ ok: true, text: 'Pesan uji coba berhasil terkirim.' });
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

  const isConnected = wahaStatus?.connected && wahaStatus?.sessionStatus === 'WORKING';
  const isScanRequired = wahaStatus?.sessionStatus === 'SCAN_QR_CODE';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Koneksi Layanan WhatsApp (WAHA)</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Atur server WAHA lokal Docker atau gateway WhatsApp eksternal dengan API Key.
          </p>
        </div>

        <Button
          variant="secondary"
          size="md"
          onClick={onRefreshStatus}
          leftIcon={<RefreshCw className="w-4 h-4" />}
        >
          Periksa Koneksi
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Mode Koneksi WhatsApp</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  WAHA Internal terkonfigurasi otomatis dari server dan terkunci. Anda cukup mengelola sesi WhatsApp.
                </p>
              </div>
              {configMode === 'INTERNAL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                  <Lock className="w-3 h-3" />
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
                <div className="flex items-center gap-2 font-semibold text-xs mb-1 text-gray-900">
                  <Server className="w-4 h-4 text-indigo-600" />
                  <span>WAHA Internal (Otomatis)</span>
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
                <div className="flex items-center gap-2 font-semibold text-xs mb-1 text-gray-900">
                  <Globe className="w-4 h-4 text-blue-600" />
                  <span>WAHA Eksternal</span>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Gunakan URL dan API Key gateway WAHA eksternal milik Anda sendiri.
                </p>
              </button>
            </div>

            {configMode === 'INTERNAL' ? (
              <div className="space-y-4 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Base URL WAHA Internal
                    </label>
                    <input
                      type="text"
                      disabled
                      readOnly
                      value={baseUrl || 'Terhubung otomatis dari environment'}
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
                      value={wahaStatus?.config?.hasApiKey ? '•••••••• (Dikelola otomatis)' : 'Tidak memerlukan API key'}
                      className="w-full h-9 px-3 bg-gray-50 text-gray-600 border border-gray-200 rounded-md text-[13px] font-mono cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Multi-Session Management */}
                <div className="pt-3 border-t border-gray-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-semibold text-gray-900">Daftar Sesi WhatsApp (Multi-Sesi)</h4>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-gray-100 text-gray-700 border border-gray-200 tabular-nums">
                          {sessions.length}/{maxSessions} sesi
                        </span>
                        {!isMultiSessionAllowed && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <Lock className="w-2.5 h-2.5" />
                            Terkunci (1 Sesi)
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Tambahkan beberapa sesi dan pilih sesi aktif yang dipakai untuk pengiriman CRM.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
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
                        variant="ghost"
                        size="sm"
                        onClick={fetchSessions}
                        isLoading={sessionsLoading}
                        leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                      >
                        Muat Ulang
                      </Button>
                    </div>
                  </div>

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
                    <form onSubmit={handleCreateSession} className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        placeholder="Nama sesi baru (contoh: cs-1, sales-utama)"
                        value={newSessionName}
                        onChange={(e) => setNewSessionName(e.target.value)}
                        disabled={sessions.length >= maxSessions}
                        className="flex-1 h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] font-mono focus:outline-none focus:border-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                      />
                      <Button
                        type="submit"
                        variant="primary"
                        size="md"
                        isLoading={creatingSession}
                        disabled={!newSessionName.trim() || sessions.length >= maxSessions}
                        leftIcon={<Plus className="w-4 h-4" />}
                      >
                        Tambah Sesi
                      </Button>
                    </form>
                  )}

                  <div className="divide-y divide-gray-200 border border-gray-200 rounded-md overflow-hidden">
                    {sessions.length === 0 ? (
                      <div className="p-3 text-xs text-gray-500 text-center bg-gray-50">
                        {sessionsLoading
                          ? 'Memuat daftar sesi...'
                          : `Belum ada sesi terdeteksi. Sesi aktif saat ini: ${session}`}
                      </div>
                    ) : (
                      sessions.map((item) => {
                        const isActive = item.name === session;
                        const isWorking = item.status === 'WORKING';
                        const isBusy = sessionBusyName === item.name;
                        const accountLabel = item.me?.pushName || item.me?.id?.split('@')[0];
                        return (
                          <div
                            key={item.name}
                            onClick={() => {
                              if (!isActive && !isBusy) void handleSwitchActiveSession(item.name);
                            }}
                            className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs ${
                              isActive ? 'bg-indigo-50/40' : 'bg-white hover:bg-gray-50 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                              <span className="font-mono font-semibold text-gray-900 truncate">
                                {item.name}
                              </span>
                              {accountLabel && (
                                <span className="text-[11px] text-gray-500 font-mono truncate">
                                  ({accountLabel})
                                </span>
                              )}
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                  isWorking
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : item.status === 'SCAN_QR_CODE'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-gray-100 text-gray-600 border-gray-200'
                                }`}
                              >
                                {item.status}
                              </span>
                              {isActive && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700">
                                  <Check className="w-3 h-3" />
                                  Aktif
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                              {!isActive && (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() => handleSwitchActiveSession(item.name)}
                                >
                                  Pilih Aktif
                                </Button>
                              )}
                              {!isWorking && (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => onOpenQr(item.name)}
                                  leftIcon={<QrCode className="w-3.5 h-3.5" />}
                                >
                                  Scan QR
                                </Button>
                              )}
                              {sessions.length > 1 && (
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
                </div>
              </div>
            ) : (
              <form onSubmit={handleSaveWahaSettings} className="space-y-3.5 pt-1">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Base URL Server WAHA <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="https://wa.domainanda.com"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      API Key / Secret Token (Opsional)
                    </label>
                    <input
                      type="password"
                      placeholder="Kosongkan jika tanpa auth"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] font-mono focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-[11px] text-gray-400 mt-1 block">
                      Dikirim via header <code className="font-mono">X-Api-Key</code>
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Nama Sesi
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="default"
                      value={session}
                      onChange={(e) => setSession(e.target.value)}
                      className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-200 flex justify-end">
                  <Button type="submit" variant="primary" isLoading={saving}>
                    Simpan Konfigurasi WAHA
                  </Button>
                </div>
              </form>
            )}
          </div>

          <form onSubmit={handleSendTest} className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Kirim Pesan Uji Coba</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Verifikasi pengiriman pesan langsung ke nomor WhatsApp tujuan.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
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

              <div className="sm:col-span-2">
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

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="secondary"
                isLoading={testSending}
                disabled={!testPhone.trim()}
                leftIcon={<Send className="w-3.5 h-3.5" />}
              >
                Kirim Pesan Tes
              </Button>
            </div>
          </form>
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                <QrCode className="w-4 h-4 text-indigo-600" />
                <span>Status Sesi WhatsApp</span>
              </h3>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Menampilkan status sesi aktif yang dipilih dari daftar sesi di sebelah kiri.
              </p>
            </div>

            <div className="p-4 rounded-md bg-gray-50 border border-gray-200 text-center space-y-1.5">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold border ${
                  isConnected
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : isScanRequired
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-red-50 text-red-800 border-red-200'
                }`}
              >
                {isConnected
                  ? 'ONLINE / CONNECTED'
                  : isScanRequired
                  ? 'PERLU SCAN QR'
                  : 'OFFLINE / STOPPED'}
              </span>

              <div className="text-xs text-gray-600 pt-1">
                Session: <strong className="font-mono text-gray-900">{session}</strong>
              </div>
              <div className="text-[11px] text-gray-400 font-mono truncate">
                {baseUrl}
              </div>
            </div>

            <div className="space-y-2">
              <Button
                variant="primary"
                className="w-full"
                onClick={() => onOpenQr()}
                leftIcon={<QrCode className="w-4 h-4" />}
              >
                Buka Scanner QR WhatsApp
              </Button>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleStartSession}
                  isLoading={sessionActionLoading}
                  leftIcon={<Power className="w-3.5 h-3.5 text-emerald-600" />}
                >
                  Start Sesi
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmAction('stop')}
                  disabled={sessionActionLoading}
                >
                  Stop Sesi
                </Button>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="w-full text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setConfirmAction('logout')}
                disabled={sessionActionLoading}
                leftIcon={<LogOut className="w-3.5 h-3.5" />}
              >
                Logout Sesi WhatsApp
              </Button>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5 text-xs space-y-2.5">
            <div className="flex items-center gap-2 text-gray-900 font-semibold">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <span>Webhook Tracking Otomatis</span>
            </div>
            <p className="text-gray-500 text-[11px] leading-relaxed">
              WAHA mengirimkan event <code className="font-mono text-gray-800">message.ack</code> ke endpoint backend CRM:
            </p>
            <div className="bg-gray-50 p-2.5 rounded-md font-mono text-[11px] text-gray-800 break-all select-all border border-gray-200">
              {wahaStatus?.webhookUrl || `${window.location.origin}/api/waha/webhook`}
            </div>
            <p className="text-[11px] text-gray-400">
              Event ini mencatat status pesan sampai (Centang Dua) dan dibaca (Centang Biru).
            </p>
          </div>
        </div>
      </div>

      {/* Pengaturan CSAT Template & SLA */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500" />
              <span>Pengaturan CSAT Template & Target SLA</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Atur template pesan penilaian pelanggan (CSAT) dan target waktu respon pertama (SLA) untuk analitik Dashboard.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveCrmSettings} className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-medium text-gray-700">Template Pesan CTA CSAT</label>
              <div className="flex flex-wrap gap-1.5">
                {['{nama_panggilan}', '{nama_lengkap}', '{link_csat}'].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setCsatTemplate((prev) => `${prev}${prev.endsWith(' ') || prev.endsWith('\n') ? '' : ' '}${chip}`)}
                    className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-mono hover:bg-indigo-100"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              rows={4}
              value={csatTemplate}
              onChange={(e) => setCsatTemplate(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="Halo {nama_panggilan}, mohon isi penilaian layanan melalui {link_csat}"
            />
            <label className="inline-flex items-center gap-2 text-xs text-gray-700 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={csatAutoOnResolve}
                onChange={(e) => setCsatAutoOnResolve(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Kirim link CSAT otomatis saat percakapan diakhiri (Resolved)</span>
            </label>

            <div className="pt-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-gray-500" />
                  <span>URL Publik CSAT (Domain / Cloudflare Tunnel)</span>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setCsatBaseUrl(
                      `${window.location.origin}${window.location.pathname.replace(/\/+$/, '')}`
                    )
                  }
                  className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Gunakan URL Saat Ini
                </button>
              </div>
              <input
                type="url"
                value={csatBaseUrl}
                onChange={(e) => setCsatBaseUrl(e.target.value)}
                placeholder="https://crm.domain.com atau https://panel.domain.com/app/reneo-crm"
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Opsional. Jika diisi, tautan CSAT akan memakai domain/tunnel ini (berguna saat admin membuka panel dari localhost/IP lokal). Contoh hasil:{' '}
                <code className="font-mono text-gray-600">
                  {(csatBaseUrl.trim().replace(/\/+$/, '') || `${window.location.origin}${window.location.pathname.replace(/\/+$/, '')}`).replace(/\/csat$/i, '')}/csat?token=...
                </code>
              </p>
              {licenseInfo?.publicUrls && licenseInfo.publicUrls.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span className="text-[11px] text-gray-500">Tunnel terdeteksi:</span>
                  {licenseInfo.publicUrls.map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setCsatBaseUrl(u)}
                      className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-mono hover:bg-emerald-100"
                    >
                      {u}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-gray-500" />
                <span>Target SLA Respon Pertama (Menit)</span>
              </label>
              <input
                type="number"
                min={1}
                max={1440}
                value={slaTargetMinutes}
                onChange={(e) => setSlaTargetMinutes(Number(e.target.value) || 15)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Digunakan untuk menghitung tingkat kepatuhan SLA di Dashboard (1 - 1440 menit).
              </p>
            </div>

            <Button type="submit" variant="primary" isLoading={savingCrm} className="w-full">
              Simpan Pengaturan CSAT & SLA
            </Button>
          </div>
        </form>
      </div>

      {/* Manajemen Multi-Agent & Hak Akses (ADMIN only) */}
      {isAdmin && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-gray-100">
            <div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-semibold text-gray-900">Manajemen Akun & Agent</h3>
                {agentQuota && (
                  <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[11px] font-mono">
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
                leftIcon={<Lock className="w-3.5 h-3.5 text-amber-500" />}
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
                leftIcon={<UserPlus className="w-3.5 h-3.5" />}
              >
                Tambah Agent
              </Button>
            )}
          </div>

          {agentQuota && !agentQuota.multiAgent && (
            <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center justify-between gap-3">
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
                    className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded text-xs"
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
                    className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded text-xs"
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
                    className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Peran</label>
                  <select
                    value={agentRole}
                    onChange={(e) => setAgentRole(e.target.value as 'ADMIN' | 'AGENT')}
                    className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded text-xs"
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-[11px] uppercase text-gray-500">
                    <th className="py-2 pr-3 font-medium">Nama & Email</th>
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
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirmSessionAction}
        isLoading={sessionActionLoading}
        title={confirmAction === 'logout' ? 'Logout Sesi WhatsApp?' : 'Hentikan Sesi WhatsApp?'}
        description={
          confirmAction === 'logout'
            ? 'Anda harus melakukan scan QR ulang untuk menghubungkan kembali WhatsApp setelah logout.'
            : 'Sesi WhatsApp akan dihentikan sementara dan pesan tidak dapat dikirim hingga sesi dijalankan kembali.'
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
