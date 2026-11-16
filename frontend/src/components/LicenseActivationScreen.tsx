import React, { useState } from 'react';
import api from '../services/api';
import { LicenseInfo } from '../types';
import { Button } from './ui/Button';
import { useToast } from './ui/ToastProvider';

interface LicenseActivationScreenProps {
  licenseInfo: LicenseInfo;
  user: { name: string; email: string } | null;
  onLicenseUpdated: () => void;
  onOpenPlans: () => void;
  onLogout?: () => void;
  onBackToLanding?: () => void;
}

export const LicenseActivationScreen: React.FC<LicenseActivationScreenProps> = ({
  licenseInfo,
  user,
  onLicenseUpdated,
  onOpenPlans,
  onLogout,
  onBackToLanding,
}) => {
  const toast = useToast();
  const [licenseKey, setLicenseKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [syncing, setSyncing] = useState(false);

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
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-gray-900">
              Aktivasi Lisensi Reneo CRM
            </h1>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              {licenseInfo.status === 'EXPIRED'
                ? 'Masa aktif lisensi CRM Anda telah berakhir. Perpanjang atau masukkan kunci lisensi baru untuk melanjutkan.'
                : 'Akun CRM Anda sudah siap. Pilih paket lisensi (tersedia Trial 7 Hari) dan lakukan pembayaran, atau masukkan kunci lisensi yang sudah Anda terima.'}
            </p>
            {user && (
              <p className="text-[11px] text-gray-500 mt-1 break-all">
                Akun terdaftar: <span className="font-medium text-gray-800">{user.name}</span> ({user.email})
              </p>
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
                  Landing
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
              1. Beli / Pilih Paket Lisensi
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Lihat daftar paket lisensi resmi dari panel Reneo, lakukan pembayaran, dan dapatkan kunci aktivasi secara otomatis.
            </p>
            <Button
              type="button"
              variant="primary"
              className="w-full"
              onClick={onOpenPlans}
            >
              Pilih Paket &amp; Bayar
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

