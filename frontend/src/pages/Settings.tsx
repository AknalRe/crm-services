import React, { useEffect, useState } from 'react';
import {
  Settings as SettingsIcon,
  Server,
  Key,
  Radio,
  RefreshCw,
  QrCode,
  Send,
  CheckCircle,
  AlertCircle,
  LogOut,
  Power,
  ShieldCheck,
  Globe,
} from 'lucide-react';
import api from '../services/api';
import { WahaStatus } from '../types';

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
  const [configMode, setConfigMode] = useState<'LOCAL' | 'RENEO'>('LOCAL');
  const [baseUrl, setBaseUrl] = useState('http://localhost:3000');
  const [apiKey, setApiKey] = useState('');
  const [session, setSession] = useState('default');
  const [saving, setSaving] = useState(false);

  // Test send state
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Halo! Ini adalah pesan tes dari CRM WhatsApp Services.');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Session Action State
  const [sessionActionLoading, setSessionActionLoading] = useState(false);

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
    setSaving(true);
    try {
      await api.updateWahaSettings({ baseUrl, apiKey, session });
      alert('Pengaturan koneksi WhatsApp WAHA berhasil disimpan!');
      onRefreshStatus();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Gagal menyimpan pengaturan');
    } finally {
      setSaving(false);
    }
  };

  const handleStartSession = async () => {
    setSessionActionLoading(true);
    try {
      await api.startWahaSession();
      alert('Perintah start session dikirim.');
      onRefreshStatus();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Gagal memulai sesi');
    } finally {
      setSessionActionLoading(false);
    }
  };

  const handleStopSession = async () => {
    if (confirm('Yakin ingin menghentikan sesi WhatsApp?')) {
      setSessionActionLoading(true);
      try {
        await api.stopWahaSession();
        onRefreshStatus();
      } catch (err: any) {
        alert(err.response?.data?.error || 'Gagal menghentikan sesi');
      } finally {
        setSessionActionLoading(false);
      }
    }
  };

  const handleLogoutSession = async () => {
    if (
      confirm(
        'Yakin ingin logout dari sesi WhatsApp? Anda harus scan QR ulang setelah logout.'
      )
    ) {
      setSessionActionLoading(true);
      try {
        await api.logoutWahaSession();
        alert('Sesi WhatsApp berhasil di-logout.');
        onRefreshStatus();
      } catch (err: any) {
        alert(err.response?.data?.error || 'Gagal logout');
      } finally {
        setSessionActionLoading(false);
      }
    }
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone || !testMessage) return;

    setTestSending(true);
    setTestResult(null);
    try {
      const res = await api.sendTestMessage(testPhone, testMessage);
      if (res.success) {
        setTestResult('Pesan uji coba berhasil terkirim!');
      } else {
        setTestResult(`Gagal: ${res.data?.error || 'Periksa koneksi WAHA'}`);
      }
    } catch (err: any) {
      setTestResult(`Error: ${err.response?.data?.error || err.message}`);
    } finally {
      setTestSending(false);
    }
  };

  const isConnected = wahaStatus?.connected && wahaStatus?.sessionStatus === 'WORKING';
  const isScanRequired = wahaStatus?.sessionStatus === 'SCAN_QR_CODE';

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 mb-2">
            <Radio className="w-3.5 h-3.5" />
            WAHA HTTP API Engine
          </span>
          <h2 className="text-2xl font-bold">Koneksi Layanan WhatsApp</h2>
          <p className="text-slate-300 text-xs mt-1 max-w-xl">
            Gunakan container WAHA bawaan Docker CRM atau sambungkan ke layanan eksternal (Service Notifikasi WhatsApp Reneo) dengan API Key mandiri.
          </p>
        </div>

        <button
          onClick={onRefreshStatus}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Periksa Koneksi</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Connection Config (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSaveWahaSettings} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Pilih Mode Koneksi WhatsApp</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Sesuaikan dengan infrastruktur server atau layanan WA Anda
              </p>
            </div>

            {/* Mode Presets */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleApplyPreset('LOCAL')}
                className={`p-4 rounded-xl border text-left transition-all ${
                  configMode === 'LOCAL'
                    ? 'border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500 text-slate-900'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-xs mb-1">
                  <Server className="w-4 h-4 text-emerald-600" />
                  <span>WAHA Internal (Docker)</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Menggunakan server WAHA yang berjalan otomatis di dalam Docker Compose crm-services.
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleApplyPreset('RENEO')}
                className={`p-4 rounded-xl border text-left transition-all ${
                  configMode === 'RENEO'
                    ? 'border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500 text-slate-900'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-xs mb-1">
                  <Globe className="w-4 h-4 text-blue-600" />
                  <span>Service Reneo / WAHA Eksternal</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Pakai URL &amp; API Key dari service notifikasi Reneo atau gateway WAHA hosting luar.
                </p>
              </button>
            </div>

            {/* Form Fields */}
            <div className="space-y-3.5 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Base URL Server WAHA <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: http://waha:3000 atau https://wa.reneo.id"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Jika Docker satu network, gunakan <code className="font-mono">http://waha:3000</code>.
                  Jika diakses dari luar, sesuaikan host / domain.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    API Key / Secret Token (Opsional)
                  </label>
                  <input
                    type="password"
                    placeholder="Kosongkan jika tanpa auth"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Dioperasikan via header <code className="font-mono">X-Api-Key</code>
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Sesi (Session Name)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="default"
                    value={session}
                    onChange={(e) => setSession(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Default sesi WhatsApp: <code className="font-mono">default</code>
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors shadow"
              >
                {saving ? 'Menyimpan...' : 'Simpan Konfigurasi WAHA'}
              </button>
            </div>
          </form>

          {/* Test WhatsApp Send Box */}
          <form onSubmit={handleSendTest} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Kirim Pesan Uji Coba (Test Send)</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Pastikan WhatsApp dapat mengirim pesan langsung ke nomor tujuan Anda
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor WhatsApp Tujuan
                </label>
                <input
                  type="text"
                  required
                  placeholder="08123456789"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Isi Pesan Uji Coba
                </label>
                <input
                  type="text"
                  required
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-lg text-xs font-medium ${
                  testResult.includes('berhasil')
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                {testResult}
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={testSending || !testPhone}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{testSending ? 'Mengirim...' : 'Kirim Pesan Tes'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Live Session Status & QR Card (1 col) */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <QrCode className="w-4 h-4 text-emerald-600" />
              <span>Status Sesi WhatsApp</span>
            </h3>

            {/* Status Pill */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold mb-2 ${
                  isConnected
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : isScanRequired
                    ? 'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse'
                    : 'bg-red-100 text-red-800 border border-red-200'
                }`}
              >
                {isConnected
                  ? 'ONLINE / CONNECTED'
                  : isScanRequired
                  ? 'PERLU SCAN QR'
                  : 'OFFLINE / STOPPED'}
              </span>

              <div className="text-xs text-slate-600">
                Session: <strong className="font-mono text-slate-800">{session}</strong>
              </div>
              <div className="text-[11px] text-slate-400 mt-1 truncate">
                Server: {baseUrl}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={onOpenQr}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                <QrCode className="w-4 h-4" />
                <span>Buka Scanner QR WhatsApp</span>
              </button>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleStartSession}
                  disabled={sessionActionLoading}
                  className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium flex items-center justify-center gap-1"
                >
                  <Power className="w-3 h-3 text-emerald-600" />
                  <span>Start Sesi</span>
                </button>

                <button
                  type="button"
                  onClick={handleLogoutSession}
                  disabled={sessionActionLoading}
                  className="py-1.5 px-3 bg-red-50 hover:bg-red-100 text-red-700 rounded text-xs font-medium flex items-center justify-center gap-1"
                >
                  <LogOut className="w-3 h-3 text-red-600" />
                  <span>Logout WA</span>
                </button>
              </div>
            </div>
          </div>

          {/* Webhook Info Card */}
          <div className="bg-slate-900 rounded-xl p-5 text-slate-300 text-xs space-y-3">
            <div className="flex items-center gap-2 text-white font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Webhook Tracking Otomatis</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              WAHA akan mengirimkan event <code className="text-emerald-400 font-mono">message.ack</code> ke endpoint backend CRM:
            </p>
            <div className="bg-slate-950 p-2.5 rounded font-mono text-[11px] text-emerald-300 break-all select-all border border-slate-800">
              http://backend:5000/api/waha/webhook
            </div>
            <p className="text-[10px] text-slate-500">
              Event ini otomatis mencatat kapan pesan sampai ke HP pelanggan (Centang Dua) dan kapan pesan dibaca (Centang Biru).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
export default Settings;

