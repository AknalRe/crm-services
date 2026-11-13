import React, { useEffect, useState } from 'react';
import {
  Server,
  RefreshCw,
  QrCode,
  Send,
  LogOut,
  Power,
  ShieldCheck,
  Globe,
} from 'lucide-react';
import api from '../services/api';
import { WahaStatus } from '../types';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useToast } from '../components/ui/ToastProvider';

interface SettingsProps {
  wahaStatus: WahaStatus | null;
  onRefreshStatus: () => void;
  onOpenQr: () => void;
}

export const Settings: React.FC<SettingsProps> = ({
  wahaStatus,
  onRefreshStatus,
  onOpenQr,
}) => {
  const toast = useToast();
  const [configMode, setConfigMode] = useState<'LOCAL' | 'RENEO'>('LOCAL');
  const [baseUrl, setBaseUrl] = useState('http://localhost:3000');
  const [apiKey, setApiKey] = useState('');
  const [session, setSession] = useState('default');
  const [saving, setSaving] = useState(false);

  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Halo, ini adalah pesan uji coba dari CRM WhatsApp.');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const [sessionActionLoading, setSessionActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'stop' | 'logout' | null>(null);

  useEffect(() => {
    if (wahaStatus?.config) {
      setBaseUrl(wahaStatus.config.baseUrl);
      setApiKey(wahaStatus.config.apiKey || '');
      setSession(wahaStatus.config.session || 'default');

      if (
        wahaStatus.config.baseUrl.includes('reneo') ||
        (wahaStatus.config.apiKey && wahaStatus.config.apiKey.length > 0)
      ) {
        setConfigMode('RENEO');
      } else {
        setConfigMode('LOCAL');
      }
    }
  }, [wahaStatus]);

  const handleApplyPreset = (mode: 'LOCAL' | 'RENEO') => {
    setConfigMode(mode);
    if (mode === 'LOCAL') {
      setBaseUrl('http://waha:3000');
      setApiKey('');
      setSession('default');
    } else {
      setBaseUrl('https://wa.reneo.id');
      setApiKey('');
      setSession('reneo_crm');
    }
  };

  const handleSaveWahaSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await api.updateWahaSettings({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), session: session.trim() });
      toast.success('Konfigurasi koneksi WAHA berhasil disimpan.');
      onRefreshStatus();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan konfigurasi WAHA');
    } finally {
      setSaving(false);
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
          <form onSubmit={handleSaveWahaSettings} className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Mode Koneksi WhatsApp</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Sesuaikan dengan infrastruktur server atau gateway WhatsApp Anda.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleApplyPreset('LOCAL')}
                className={`p-3.5 rounded-lg border text-left transition-colors ${
                  configMode === 'LOCAL'
                    ? 'border-indigo-600 bg-indigo-50/40 text-gray-900'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-xs mb-1 text-gray-900">
                  <Server className="w-4 h-4 text-indigo-600" />
                  <span>WAHA Internal (Docker)</span>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Menggunakan server WAHA yang berjalan dalam Docker Compose crm-services.
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleApplyPreset('RENEO')}
                className={`p-3.5 rounded-lg border text-left transition-colors ${
                  configMode === 'RENEO'
                    ? 'border-indigo-600 bg-indigo-50/40 text-gray-900'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-xs mb-1 text-gray-900">
                  <Globe className="w-4 h-4 text-blue-600" />
                  <span>Service Reneo / WAHA Eksternal</span>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Menggunakan URL dan API Key dari gateway WAHA eksternal.
                </p>
              </button>
            </div>

            <div className="space-y-3.5 pt-1">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Base URL Server WAHA <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="http://waha:3000 atau https://wa.reneo.id"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] font-mono focus:outline-none focus:border-indigo-500"
                />
                <span className="text-[11px] text-gray-400 mt-1 block">
                  Dalam satu network Docker gunakan <code className="font-mono">http://waha:3000</code>.
                </span>
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
                  <span className="text-[11px] text-gray-400 mt-1 block">
                    Default sesi WhatsApp: <code className="font-mono">default</code>
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-200 flex justify-end">
              <Button type="submit" variant="primary" isLoading={saving}>
                Simpan Konfigurasi WAHA
              </Button>
            </div>
          </form>

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
            <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
              <QrCode className="w-4 h-4 text-indigo-600" />
              <span>Status Sesi WhatsApp</span>
            </h3>

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
                onClick={onOpenQr}
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
              http://backend:5000/api/waha/webhook
            </div>
            <p className="text-[11px] text-gray-400">
              Event ini mencatat status pesan sampai (Centang Dua) dan dibaca (Centang Biru).
            </p>
          </div>
        </div>
      </div>

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
    </div>
  );
};

export default Settings;
