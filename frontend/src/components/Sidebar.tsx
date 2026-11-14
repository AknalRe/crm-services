import React from 'react';
import {
  LayoutDashboard,
  Users,
  Send,
  Cake,
  CheckCheck,
  MessageCircle,
  Settings,
  Smartphone,
  Lock,
} from 'lucide-react';
import { LicenseInfo, WahaStatus } from '../types';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  wahaStatus: WahaStatus | null;
  licenseInfo?: LicenseInfo | null;
  onOpenQrModal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  wahaStatus,
  licenseInfo,
  onOpenQrModal,
}) => {
  const isLiveChatUnlocked = Boolean(
    licenseInfo && !licenseInfo.isExpired && licenseInfo.features?.liveChatCrm
  );

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, locked: false },
    { id: 'contacts', label: 'Kontak Pelanggan', icon: Users, locked: false },
    { id: 'broadcasts', label: 'Siaran WhatsApp', icon: Send, locked: false },
    { id: 'birthday', label: 'Ulang Tahun', icon: Cake, locked: false },
    { id: 'tracking', label: 'Pelacakan Status', icon: CheckCheck, locked: false },
    { id: 'conversations', label: 'Live Chat CRM', icon: MessageCircle, locked: !isLiveChatUnlocked },
    { id: 'settings', label: 'Koneksi WAHA', icon: Settings, locked: false },
  ];

  const isConnected = wahaStatus?.connected && wahaStatus?.sessionStatus === 'WORKING';

  return (
    <aside className="w-60 bg-[#121622] text-gray-200 flex flex-col h-screen shrink-0 border-r border-[#1E2438] select-none">
      {/* Brand Header */}
      <div className="h-14 px-4 flex items-center gap-2.5 border-b border-[#1E2438]">
        <MessageCircle className="w-5 h-5 text-indigo-400 shrink-0" />
        <div className="min-w-0">
          <h1 className="font-semibold text-sm text-white tracking-tight truncate">
            CRM WhatsApp
          </h1>
          <p className="text-[11px] text-gray-400 truncate">Reneo Business Suite</p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Menu Utama
        </div>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setCurrentTab(item.id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium transition-colors ${
                isActive
                  ? 'bg-[#1E2438] text-white'
                  : 'text-gray-400 hover:bg-[#1E2438]/60 hover:text-gray-100'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  isActive ? 'text-indigo-400' : 'text-gray-400'
                }`}
              />
              <span className="truncate flex-1 text-left">{item.label}</span>
              {item.locked && (
                <span
                  title="Terkunci oleh lisensi — butuh paket Pro atau Enterprise"
                  className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-800/60 text-amber-400 shrink-0"
                >
                  <Lock className="w-3 h-3" />
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* WAHA Status Card */}
      <div className="p-3 border-t border-[#1E2438]">
        <div className="bg-[#181D2D] rounded-md p-3 border border-[#242B42]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium text-gray-400">Status WAHA</span>
            <span
              className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                isConnected
                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                  : 'bg-amber-950/60 text-amber-400 border border-amber-800/60'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isConnected ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              {isConnected ? 'Terhubung' : 'Terputus'}
            </span>
          </div>

          <p className="text-[11px] text-gray-400 font-mono truncate mb-2.5">
            {wahaStatus?.sessionStatus || 'CHECKING'}
          </p>

          {!isConnected && (
            <button
              type="button"
              onClick={onOpenQrModal}
              className="w-full h-8 px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition-colors"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Scan QR WhatsApp</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
