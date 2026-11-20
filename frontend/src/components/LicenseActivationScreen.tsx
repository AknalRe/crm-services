import React, { useState, useEffect } from 'react';
import { Building2 } from 'lucide-react';
import api from '../services/api';
import { AuthStatus, LicenseInfo, TenantWorkspaceItem } from '../types';
import { Button } from './ui/Button';
import { useToast } from './ui/ToastProvider';

interface LicenseActivationScreenProps {
  licenseInfo: LicenseInfo;
  user: AuthStatus['user'] | null;
  onLicenseUpdated: () => void;
  onOpenPlans: () => void;
  onWorkspaceSwitched?: (user: NonNullable<AuthStatus['user']>, license?: LicenseInfo) => void;
  onLogout?: () => void;
  onBackToLanding?: () => void;
}

export const LicenseActivationScreen: React.FC<LicenseActivationScreenProps> = ({
  licenseInfo,
  user,
  onLicenseUpdated,
  onOpenPlans,
  onWorkspaceSwitched,
  onLogout,
  onBackToLanding,
}) => {
  const toast = useToast();
  const [licenseKey, setLicenseKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [workspaces, setWorkspaces] = useState<TenantWorkspaceItem[]>([]);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getMyWorkspaces()
      .then((res) => {
        if (active) setWorkspaces(res.workspaces || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [licenseInfo.companyId]);

  const handleSwitchWorkspace = async (companyId: string) => {
    if (!companyId || switchingId || companyId === (user?.companyId || licenseInfo.companyId)) return;
    setSwitchingId(companyId);
    try {
      const res = await api.switchWorkspace(companyId);
      toast.success(`Beralih ke workspace "${res.company?.name || res.user.companyName}"`);
      if (onWorkspaceSwitched) {
        onWorkspaceSwitched(res.user, res.license);
      } else {
        onLicenseUpdated();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal beralih workspace.');
    } finally {
      setSwitchingId(null);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKey.trim() || activating) return;
    setActivating(true);
    try {
      await api.activateLicense(licenseKey.trim());
      toast.success('Lisensi berhasil diaktivasi. Selamat datang di Reneo CRM!');
      onLicenseUpdated();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengaktivasi kunci lisensi');
    } finally {
      setActivating(false);
    }
  };

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const updated = await api.syncLicense();
      if (!updated.isExpired && updated.status === 'ACTIVE') {
        toast.success('Lisensi aktif ditemukan dan berhasil disinkronkan.');
        onLicenseUpdated();
      } else {
        toast.info('Belum ada lisensi aktif di akun Reneo Anda. Silakan pilih paket terlebih dahulu.');
      }
    } catch {
      toast.error('Gagal menyinkronkan lisensi dengan Reneo.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen supports-[height:100dvh]:min-h-dvh bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-lg border border-gray-200 p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-gray-200 pb-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase border ${
                  licenseInfo.status === 'SUSPENDED' || licenseInfo.status === 'EXPIRED'
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : 'bg-gray-100 text-gray-700 border-gray-200'
                }`}
              >
                {licenseInfo.status === 'EXPIRED'
                  ? 'Kedaluwarsa'
                  : licenseInfo.status === 'SUSPENDED'
                  ? 'Disuspend'
                  : 'Belum Aktif'}
              </span>
              {licenseInfo.plan && licenseInfo.status !== 'UNLICENSED' && (
                <span className="text-[11px] text-gray-600 font-medium">
                  Paket terakhir: <strong>{licenseInfo.plan}</strong>
                </span>
              )}
            </div>
            <h1 className="text-base font-semibold text-gray-900">
              Aktivasi &amp; Perpanjangan Lisensi Reneo CRM
            </h1>
            <p className="text-xs text-gray-500 leading-relaxed">
              {licenseInfo.status === 'EXPIRED'
                ? 'Masa aktif lisensi CRM Anda telah berakhir. Lihat info lisensi untuk memperpanjang (tersedia multi-qty durasi) atau pasang kunci lisensi baru.'
                : 'Akun CRM Anda sudah siap. Pilih paket lisensi (tersedia Trial 7 Hari atau langganan multi-bulan), atau masukkan kunci lisensi yang sudah Anda terima.'}
            </p>
            {user && (
              <div className="space-y-1.5 pt-0.5">
                <p className="text-[11px] text-gray-500 break-all">
                  Akun terdaftar: <span className="font-medium text-gray-800">{user.name}</span> ({user.email}) · Workspace:{' '}
                  <strong className="text-gray-900">
                    {user.companyName || licenseInfo.companyName || 'Workspace Utama'}
                  </strong>
                </p>
                {workspaces.length > 1 && (
                  <div className="flex items-center gap-2 flex-wrap pt-0.5">
                    <span className="text-[11px] text-gray-500 inline-flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                      Pindah Bisnis/Workspace:
                    </span>
                    <select
                      value={user.companyId || licenseInfo.companyId || ''}
                      disabled={Boolean(switchingId)}
                      onChange={(e) => void handleSwitchWorkspace(e.target.value)}
                      className="h-7 px-2 rounded border border-gray-300 bg-white text-xs font-medium text-gray-800 focus:outline-none focus:border-indigo-500"
                    >
                      {workspaces.map((ws) => (
                        <option key={ws.id} value={ws.id}>
                          {ws.name} ({ws.license.status === 'UNLICENSED' ? 'Belum Aktif' : ws.license.plan})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          {(onBackToLanding || onLogout) && (
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {onBackToLanding && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onBackToLanding}
                >
                  Halaman Utama
                </Button>
              )}
              {onLogout && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onLogout}
                >
                  Keluar
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Step 1: Pilih Lisensi & Bayar */}
          <div className="rounded-lg border border-gray-200 p-4 space-y-3 bg-gray-50/50">
            <div className="text-xs font-semibold text-gray-900">
              {licenseInfo.status === 'EXPIRED' ? '1. Info Lisensi & Perpanjang' : '1. Beli / Pilih Paket Lisensi'}
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              {licenseInfo.status === 'EXPIRED'
                ? 'Periksa detail masa aktif terakhir dan perpanjang langsung untuk 1 bulan, 3 bulan, 6 bulan, atau lebih.'
                : 'Lihat daftar paket lisensi resmi dari panel Reneo, pilih durasi langganan, dan dapatkan kunci aktivasi otomatis.'}
            </p>
            <Button
              type="button"
              variant="primary"
              className="w-full"
              onClick={onOpenPlans}
            >
              {licenseInfo.status === 'EXPIRED' ? 'Lihat Info & Perpanjang' : 'Pilih Paket & Durasi'}
            </Button>
          </div>

          {/* Step 2: Pasang / Aktivasi Kunci Lisensi */}
          <form onSubmit={handleActivate} className="rounded-lg border border-gray-200 p-4 space-y-3">
            <div className="text-xs font-semibold text-gray-900">
              2. Pasang Kunci Lisensi
            </div>
            <div>
              <input
                type="text"
                required
                placeholder="Masukkan kunci lisensi (mis. RN-CRM-...)"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                variant="secondary"
                className="flex-1"
                isLoading={activating}
                disabled={!licenseKey.trim()}
              >
                Aktivasi Lisensi
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={handleSync}
                isLoading={syncing}
                title="Sinkronkan status lisensi dari Reneo"
              >
                Sync
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

