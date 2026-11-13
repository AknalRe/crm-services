import React from 'react';
import { QrCode, RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react';
import { WahaStatus, LicenseInfo } from '../types';
import { Button } from './ui/Button';

interface NavbarProps {
  title: string;
  wahaStatus: WahaStatus | null;
  licenseInfo?: LicenseInfo | null;
  onRefresh: () => void;
  onOpenQr: () => void;
  onOpenPlans?: () => void;
  isRefreshing?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  title,
  wahaStatus,
  licenseInfo,
  onRefresh,
  onOpenQr,
  onOpenPlans,
  isRefreshing = false,
}) => {
  const isConnected = wahaStatus?.connected && wahaStatus?.sessionStatus === 'WORKING';
  const isLicenseActive = licenseInfo && !licenseInfo.isExpired;

  return (
    <header className="h-14 bg-white border-b border-gray-200 px-6 flex items-center justify-between sticky top-0 z-20 shrink-0">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-gray-900 truncate">{title}</h2>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        {licenseInfo && (
          <button
            type="button"
            onClick={onOpenPlans}
            className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded text-xs font-medium border transition-colors ${
              isLicenseActive
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                : 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100'
            }`}
            title="Kelola Paket & Lisensi Reneo"
          >
            {isLicenseActive ? (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
            )}
            <span className="tabular-nums">
              {isLicenseActive
                ? `${licenseInfo.plan} (${licenseInfo.daysLeft} hari)`
                : 'Lisensi Kedaluwarsa'}
            </span>
          </button>
        )}

        <div className="hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded bg-gray-50 text-xs font-medium border border-gray-200 text-gray-700">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isConnected ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          />
          <span>{isConnected ? 'WhatsApp Aktif' : 'Belum Terhubung'}</span>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={onOpenQr}
          leftIcon={<QrCode className="w-3.5 h-3.5" />}
        >
          Scan QR
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Segarkan Data"
          aria-label="Segarkan Data"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
        </Button>
      </div>
    </header>
  );
};

export default Navbar;
