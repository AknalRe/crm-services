import React from 'react';
import { QrCode, RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react';
import { WahaStatus, LicenseInfo } from '../types';

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
    <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-20">
      <div>
        <h2 className="text-xl font-bold text-slate-800">{title}</h2>
      </div>

      <div className="flex items-center gap-3">
        {/* Reneo Managed License Pill / Button */}
        {licenseInfo && (
          <button
            type="button"
            onClick={onOpenPlans}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              isLicenseActive
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 hover:shadow-sm'
                : 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100 animate-pulse'
            }`}
            title="Pilih Paket & Terbitkan Invoice di Reneo"
          >
            {isLicenseActive ? (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
            )}
            <span>
              {isLicenseActive
                ? `${licenseInfo.plan} (${licenseInfo.daysLeft} hari)`
                : 'Lisensi Kedaluwarsa (Pilih Paket)'}
            </span>
          </button>
        )}

        {/* WA Status Pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-xs font-medium border border-slate-200">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          />
          <span className="text-slate-600">
            {isConnected ? 'WhatsApp Aktif' : 'WhatsApp Belum Terhubung'}
          </span>
        </div>

        {/* Scan QR Button */}
        <button
          onClick={onOpenQr}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
          title="Buka QR Code Scanner"
        >
          <QrCode className="w-3.5 h-3.5" />
          <span>Scan QR</span>
        </button>

        {/* Global Refresh Button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
          title="Segarkan Data"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
        </button>
      </div>
    </header>
  );
};
export default Navbar;

