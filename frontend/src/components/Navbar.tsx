import React from 'react';
import { RefreshCw, AlertTriangle, Menu } from 'lucide-react';
import { LicenseInfo } from '../types';
import { Button } from './ui/Button';

interface NavbarProps {
  title: string;
  licenseInfo?: LicenseInfo | null;
  onRefresh: () => void;
  onOpenPlans?: () => void;
  onMenuClick?: () => void;
  isRefreshing?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  title,
  licenseInfo,
  onRefresh,
  onOpenPlans,
  onMenuClick,
  isRefreshing = false,
}) => {
  const isLicenseActive = licenseInfo && !licenseInfo.isExpired;

  return (
    <header className="h-14 bg-white border-b border-gray-200 px-3 sm:px-6 flex items-center justify-between gap-2 sticky top-0 z-20 shrink-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
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
        <h2 className="text-sm sm:text-base font-semibold text-gray-900 truncate">{title}</h2>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {licenseInfo && (
          <button
            type="button"
            onClick={onOpenPlans}
            className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium border whitespace-nowrap transition-colors ${
              isLicenseActive
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                : 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100'
            }`}
            title="Kelola Paket & Lisensi Reneo"
          >
            {!isLicenseActive && (
              <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
            )}
            <span className="tabular-nums truncate max-w-[130px] sm:max-w-none">
              {isLicenseActive
                ? `${licenseInfo.plan} (${licenseInfo.daysLeft} hari)`
                : 'Lisensi Kedaluwarsa'}
            </span>
          </button>
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
