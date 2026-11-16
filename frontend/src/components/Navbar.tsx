import React from 'react';
import { RefreshCw, AlertTriangle, Menu, ShieldCheck, Clock, Home } from 'lucide-react';
import { LicenseInfo } from '../types';
import { Button } from './ui/Button';

interface NavbarProps {
  title: string;
  licenseInfo?: LicenseInfo | null;
  onRefresh: () => void;
  onOpenPlans?: () => void;
  onOpenLanding?: () => void;
  onMenuClick?: () => void;
  isRefreshing?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  title,
  licenseInfo,
  onRefresh,
  onOpenPlans,
  onOpenLanding,
  onMenuClick,
  isRefreshing = false,
}) => {
  const isExpired = Boolean(!licenseInfo || licenseInfo.isExpired || licenseInfo.status === 'EXPIRED' || licenseInfo.status === 'SUSPENDED' || licenseInfo.status === 'UNLICENSED');
  const isExpiringSoon = Boolean(!isExpired && licenseInfo && (licenseInfo.daysLeft <= 7 || licenseInfo.status === 'TRIAL'));

  const pillClasses = isExpired
    ? 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100'
    : isExpiringSoon
    ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
    : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100';

  return (
    <header className="h-14 bg-white border-b border-gray-200 px-2.5 sm:px-6 flex items-center justify-between gap-2 sticky top-0 z-20 shrink-0">
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="lg:hidden p-1.5 -ml-1 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 shrink-0"
            aria-label="Buka Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <h2 className="text-[13px] sm:text-base font-semibold text-gray-900 truncate">{title}</h2>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {licenseInfo && (
          <button
            type="button"
            onClick={onOpenPlans}
            className={`inline-flex items-center gap-1.5 h-8 px-2 sm:px-3 rounded-md text-[11px] sm:text-xs font-medium border whitespace-nowrap transition-colors ${pillClasses}`}
            title="Klik untuk melihat Info Lisensi, Masa Aktif, Perpanjangan, dan Upgrade Paket"
          >
            {isExpired ? (
              <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
            ) : isExpiringSoon ? (
              <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            )}

            <span className="tabular-nums sm:hidden truncate max-w-[105px]">
              {!isExpired
                ? `${licenseInfo.plan.split(' ')[0]} · ${licenseInfo.daysLeft}h`
                : licenseInfo.status === 'SUSPENDED'
                ? 'Disuspend'
                : 'Kedaluwarsa'}
            </span>
            <span className="tabular-nums hidden sm:inline">
              {!isExpired
                ? `${licenseInfo.plan} (${licenseInfo.daysLeft} hari)`
                : licenseInfo.status === 'SUSPENDED'
                ? 'Lisensi Disuspend'
                : 'Lisensi Kedaluwarsa'}
            </span>
            <span className="hidden md:inline text-[10px] opacity-75 pl-1 border-l border-current/20">
              Info Lisensi
            </span>
          </button>
        )}

        {onOpenLanding && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onOpenLanding}
            title="Kembali ke Halaman Utama / Landing Page CRM"
            aria-label="Halaman Utama CRM"
          >
            <Home className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden md:inline">Halaman Utama</span>
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
