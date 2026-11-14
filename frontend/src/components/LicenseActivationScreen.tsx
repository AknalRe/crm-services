import React, { useState } from 'react';
import { KeyRound, CreditCard, RefreshCw } from 'lucide-react';
import api from '../services/api';
import { LicenseInfo } from '../types';
import { Button } from './ui/Button';
import { useToast } from './ui/ToastProvider';

interface LicenseActivationScreenProps {
  licenseInfo: LicenseInfo;
  user: { name: string; email: string } | null;
  onLicenseUpdated: () => void;
  onOpenPlans: () => void;
}

export const LicenseActivationScreen: React.FC<LicenseActivationScreenProps> = ({
  licenseInfo,
  user,
  onLicenseUpdated,
  onOpenPlans,
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-lg border border-gray-200 p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 pb-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-900">
                Aktivasi Lisensi Reneo CRM WhatsApp
              </h1>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                {licenseInfo.status === 'EXPIRED'
                  ? 'Masa aktif lisensi CRM Anda telah berakhir. Perpanjang atau masukkan kunci lisensi baru untuk melanjutkan.'
                  : 'Akun CRM Anda sudah siap. Pilih paket lisensi yang tersedia dan lakukan pembayaran, atau masukkan kunci lisensi yang sudah Anda terima.'}
              </p>
              {user && (
                <p className="text-[11px] text-gray-500 mt-1">
                  Akun terdaftar: <span className="font-medium text-gray-800">{user.name}</span> ({user.email})
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Step 1: Pilih Lisensi & Bayar */}
          <div className="rounded-lg border border-gray-200 p-4 space-y-3 bg-gray-50/50">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-900">
              <CreditCard className="w-4 h-4 text-indigo-600" />
              <span>1. Beli / Pilih Paket Lisensi</span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Lihat daftar paket lisensi resmi dari panel Reneo, lakukan pembayaran, dan dapatkan kunci aktivasi secara otomatis.
            </p>
            <Button
              type="button"
              variant="primary"
              className="w-full"
              onClick={onOpenPlans}
              leftIcon={<CreditCard className="w-4 h-4" />}
            >
              Pilih Paket &amp; Bayar
            </Button>
          </div>

          {/* Step 2: Pasang / Aktivasi Kunci Lisensi */}
          <form onSubmit={handleActivate} className="rounded-lg border border-gray-200 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-900">
              <KeyRound className="w-4 h-4 text-emerald-600" />
              <span>2. Pasang Kunci Lisensi</span>
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
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
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

