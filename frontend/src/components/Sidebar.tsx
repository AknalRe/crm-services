import React from 'react';
import {
  LayoutDashboard,
  Users,
  Send,
  Cake,
  CheckCheck,
  MessageSquare,
  Settings,
  Radio,
} from 'lucide-react';
import { WahaStatus } from '../types';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  wahaStatus: WahaStatus | null;
  onOpenQrModal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  wahaStatus,
  onOpenQrModal,
}) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'contacts', label: 'Kontak Pelanggan', icon: Users },
    { id: 'broadcasts', label: 'Broadcast WA', icon: Send },
    { id: 'birthday', label: 'Ucapan Ulang Tahun', icon: Cake },
    { id: 'tracking', label: 'Lead & Read Tracking', icon: CheckCheck },
    { id: 'conversations', label: 'Live Chat CRM', icon: MessageSquare },
    { id: 'settings', label: 'Koneksi WAHA', icon: Settings },
  ];

  const isConnected = wahaStatus?.connected && wahaStatus?.sessionStatus === 'WORKING';
  const isScanRequired = wahaStatus?.sessionStatus === 'SCAN_QR_CODE';

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 min-h-screen">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 gap-3 border-b border-slate-800">
        <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xl border border-emerald-500/20">
          W
        </div>
        <div>
          <h1 className="font-semibold text-white tracking-wide text-base leading-tight">
            CRM WhatsApp
          </h1>
          <span className="text-xs text-slate-400">Marketing & Lead Engine</span>
        </div>
      </div>

      {/* Nav Menu */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* WAHA Connection Status Badge */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
              Status WAHA
            </span>
          </div>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              isConnected
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : isScanRequired
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}
          >
            {isConnected ? 'Terhubung' : isScanRequired ? 'Perlu Scan' : 'Offline'}
          </span>
        </div>

        <div className="text-xs text-slate-500 mb-3 truncate">
          Session: <span className="text-slate-300 font-mono">{wahaStatus?.config?.session || 'default'}</span>
        </div>

        {isScanRequired ? (
          <button
            onClick={onOpenQrModal}
            className="w-full py-1.5 px-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded text-xs transition-colors flex items-center justify-center gap-1.5 shadow"
          >
            <span>Scan QR WhatsApp</span>
          </button>
        ) : !isConnected ? (
          <button
            onClick={() => setCurrentTab('settings')}
            className="w-full py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors"
          >
            Atur Koneksi
          </button>
        ) : (
          <div className="text-[11px] text-emerald-400/90 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            Siap mengirim broadcast
          </div>
        )}
      </div>
    </aside>
  );
};
export default Sidebar;

