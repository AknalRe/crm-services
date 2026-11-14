import React from 'react';
import { QrCode, RefreshCw, ShieldCheck, AlertTriangle, Menu } from 'lucide-react';
import { WahaStatus, LicenseInfo } from '../types';
import { Button } from './ui/Button';

interface NavbarProps {
  title: string;
  wahaStatus: WahaStatus | null;
  licenseInfo?: LicenseInfo | null;
  onRefresh: () => void;
  onOpenQr: () => void;
  onOpenPlans?: () => void;
  onMenuClick?: () => void;
  isRefreshing?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  title,
  wahaStatus,
  licenseInfo,
  onRefresh,
  onOpenQr,
  onOpenPlans,
  onMenuClick,
  isRefreshing = false,
}) => {
  const activeSession = wahaStatus?.activeSession || wahaStatus?.config?.session || 'default';
  const totalSessions = wahaStatus?.totalSessions ?? 1;
  const connectedSessions =
    wahaStatus?.connectedSessions ?? (wahaStatus?.sessionStatus === 'WORKING' ? 1 : 0);
  const isActiveWorking = Boolean(wahaStatus?.connected && wahaStatus?.sessionStatus === 'WORKING');
  const isAnyConnected = Boolean(wahaStatus?.connected && connectedSessions > 0);
  const allConnected = isActiveWorking && connectedSessions >= totalSessions;
  const isLicenseActive = licenseInfo && !licenseInfo.isExpired;

  const statusLabel = (() => {
    if (!wahaStatus) return 'Memeriksa WAHA...';
    if (totalSessions > 1) {
      if (isActiveWorking) return `WA Aktif (${connectedSessions}/${totalSessions} sesi)`;
      if (isAnyConnected) return `Sesi Aktif Terputus (${connectedSessions}/${totalSessions} aktif)`;
      return `Belum Terhubung (0/${totalSessions} sesi)`;
    }
    return isActiveWorking ? `WA Aktif • ${activeSession}` : `Belum Terhubung • ${activeSession}`;
  })();

  return (
    <header className="h-14 bg-white border-b border-gray-200 px-3 sm:px-6 flex items-center justify-between gap-2 sticky top-0 z-20 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="lg:hidden p-1.5 -ml-1 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Buka Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <h2 className="text-sm sm:text-base font-semibold text-gray-900 truncate">{title}</h2>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
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

        <div
          className="hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded bg-gray-50 text-xs font-medium border border-gray-200 text-gray-700 max-w-[260px]"
          title={`Sesi aktif: ${activeSession} (${wahaStatus?.sessionStatus || 'CHECKING'})`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              isActiveWorking ? 'bg-emerald-500' : isAnyConnected ? 'bg-amber-500' : 'bg-amber-500'
            }`}
          />
          <span className="truncate">{statusLabel}</span>
        </div>

        {!allConnected && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onOpenQr}
            leftIcon={<QrCode className="w-3.5 h-3.5" />}
            title={`Scan QR untuk sesi aktif: ${activeSession}`}
          >
            Scan QR
          </Button>
        )}

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
