import React, { useEffect, useState } from 'react';
import {
  Users,
  Send,
  CheckCircle,
  Eye,
  AlertCircle,
  Cake,
  Clock,
  ArrowUpRight,
  TrendingUp,
} from 'lucide-react';
import StatCard from '../components/StatCard';
import api from '../services/api';
import { DashboardStats } from '../types';

interface DashboardProps {
  onNavigate: (tab: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const data = await api.getDashboardStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 8000);
    return () => clearInterval(interval);
  }, []);

  const summary = stats?.summary || {
    totalContacts: 0,
    totalCampaigns: 0,
    totalRecipients: 0,
    pending: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    deliveryRate: 0,
    readRate: 0,
    birthdayTodayCount: 0,
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Welcome & Quick Actions */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 rounded-2xl p-6 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 mb-2">
            CRM &amp; WhatsApp Marketing Hub
          </span>
          <h2 className="text-2xl font-bold">Ringkasan Aktivitas CRM</h2>
          <p className="text-slate-300 text-xs mt-1 max-w-xl">
            Kelola data pelanggan, pantau status pesan siaran (terkirim, sampai, dan dibaca), serta jalankan kampanye terjadwal &amp; ucapan ulang tahun otomatis.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => onNavigate('broadcasts')}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Kirim Broadcast Baru</span>
          </button>
          <button
            onClick={() => onNavigate('contacts')}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg text-xs border border-slate-700 transition-colors flex items-center gap-1.5"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Kelola Pelanggan</span>
          </button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Total Pelanggan"
          value={summary.totalContacts}
          subtext="Database Kontak Aktif"
          icon={Users}
          color="indigo"
        />
        <StatCard
          title="Siaran Terkirim"
          value={summary.sent}
          subtext="Keluar dari Server WA"
          icon={Send}
          color="blue"
        />
        <StatCard
          title="Lead Sampai"
          value={summary.delivered}
          subtext={`Delivery Rate: ${summary.deliveryRate}%`}
          icon={CheckCircle}
          color="emerald"
          badge={`${summary.deliveryRate}%`}
        />
        <StatCard
          title="Lead Dibaca"
          value={summary.read}
          subtext={`Read Rate: ${summary.readRate}%`}
          icon={Eye}
          color="purple"
          badge={`${summary.readRate}%`}
        />
        <StatCard
          title="Gagal Terkirim"
          value={summary.failed}
          subtext="Nomor Tidak Valid / Error"
          icon={AlertCircle}
          color="red"
        />
        <StatCard
          title="Ultah Hari Ini"
          value={summary.birthdayTodayCount}
          subtext="Penerima Otomatis"
          icon={Cake}
          color="amber"
          badge={summary.birthdayTodayCount > 0 ? 'Siap Kirim' : '0'}
        />
      </div>

      {/* Delivery & Read Rate Analytics Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Delivery Funnel Progress */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Tingkat Keberhasilan Pengiriman Lead</h3>
              <p className="text-xs text-slate-500">Persentase status pesan dari total yang diproses</p>
            </div>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-slate-600">Pesan Tersampaikan (Delivered)</span>
                <span className="text-emerald-600 font-bold">{summary.deliveryRate}% ({summary.delivered} pesan)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, summary.deliveryRate)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-slate-600">Pesan Dibaca oleh Lead (Read Receipts)</span>
                <span className="text-purple-600 font-bold">{summary.readRate}% ({summary.read} pesan)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-purple-600 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, summary.readRate)}%` }}
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-slate-50 p-2 rounded-lg">
                <span className="block text-slate-400 text-[11px]">Terkirim</span>
                <span className="font-bold text-slate-800">{summary.sent}</span>
              </div>
              <div className="bg-emerald-50 p-2 rounded-lg">
                <span className="block text-emerald-600 text-[11px]">Centang Dua</span>
                <span className="font-bold text-emerald-700">{summary.delivered}</span>
              </div>
              <div className="bg-purple-50 p-2 rounded-lg">
                <span className="block text-purple-600 text-[11px]">Centang Biru</span>
                <span className="font-bold text-purple-700">{summary.read}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Birthday Automation Quick Box */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                <Cake className="w-3.5 h-3.5" />
                Robot Ucapan Ulang Tahun
              </span>
              <button
                onClick={() => onNavigate('birthday')}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-0.5"
              >
                Pengaturan <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>

            <h4 className="text-base font-bold text-slate-800">
              {summary.birthdayTodayCount > 0
                ? `${summary.birthdayTodayCount} Pelanggan Berulang Tahun Hari Ini! 🎉`
                : 'Belum Ada Pelanggan Ulang Tahun Hari Ini'}
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              Sistem secara otomatis mengecek tanggal lahir pelanggan setiap pagi dan mengirimkan ucapan personal yang sudah disesuaikan dengan jeda anti-ban.
            </p>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">Jadwal Harian: <strong>08:00 WIB</strong></span>
            <button
              onClick={() => onNavigate('birthday')}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded-lg text-xs transition-colors shadow-sm"
            >
              Lihat Daftar Ulang Tahun
            </button>
          </div>
        </div>
      </div>

      {/* Campaigns & Recent Activity Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Campaigns (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Kampanye Siaran Terakhir</h3>
              <p className="text-xs text-slate-500">Progress pengiriman dan respons lead</p>
            </div>
            <button
              onClick={() => onNavigate('broadcasts')}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
            >
              Lihat Semua <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {(!stats?.recentCampaigns || stats.recentCampaigns.length === 0) ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Belum ada kampanye siaran yang dijalankan.
              </div>
            ) : (
              stats.recentCampaigns.map((camp) => {
                const total = camp.totalCount || 1;
                const percentSent = Math.round((camp.sentCount / total) * 100);
                const percentRead = Math.round((camp.readCount / total) * 100);

                return (
                  <div key={camp.id} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800 text-sm">{camp.title}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              camp.type === 'BIRTHDAY'
                                ? 'bg-amber-100 text-amber-800'
                                : camp.type === 'SCHEDULED'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {camp.type}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                          {camp.messageTemplate}
                        </p>
                      </div>

                      <span
                        className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          camp.status === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : camp.status === 'PROCESSING'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse'
                            : camp.status === 'SCHEDULED'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {camp.status}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
                      <div
                        className="bg-purple-600 h-2 transition-all"
                        style={{ width: `${percentRead}%` }}
                        title={`Dibaca: ${camp.readCount}`}
                      />
                      <div
                        className="bg-emerald-500 h-2 transition-all"
                        style={{ width: `${Math.max(0, percentSent - percentRead)}%` }}
                        title={`Terkirim: ${camp.sentCount}`}
                      />
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Total: <strong>{camp.totalCount}</strong> kontak</span>
                      <div className="flex gap-3">
                        <span className="text-emerald-600">Terkirim: <strong>{camp.sentCount}</strong></span>
                        <span className="text-blue-600">Sampai: <strong>{camp.deliveredCount}</strong></span>
                        <span className="text-purple-600">Dibaca: <strong>{camp.readCount}</strong></span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Live Lead Activity Feed (1 col) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Aktivitas Terakhir Lead</h3>
              <p className="text-xs text-slate-500">Event status pengiriman real-time</p>
            </div>
            <button
              onClick={() => onNavigate('tracking')}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Lihat Detail
            </button>
          </div>

          <div className="p-4 space-y-3 flex-1 overflow-y-auto max-h-[380px]">
            {(!stats?.recentActivity || stats.recentActivity.length === 0) ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Belum ada aktivitas pesan terbaru.
              </div>
            ) : (
              stats.recentActivity.map((act) => {
                const isRead = act.status === 'READ';
                const isDelivered = act.status === 'DELIVERED';
                const isFailed = act.status === 'FAILED';

                return (
                  <div
                    key={act.id}
                    className="flex items-start gap-3 p-2.5 rounded-lg border border-slate-100 bg-slate-50/60 hover:bg-slate-50 transition-colors"
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                        isRead
                          ? 'bg-purple-100 text-purple-700'
                          : isDelivered
                          ? 'bg-emerald-100 text-emerald-700'
                          : isFailed
                          ? 'bg-red-100 text-red-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {isRead ? 'R' : isDelivered ? 'D' : isFailed ? '!' : 'S'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-slate-800 truncate">
                          {act.contact?.nama_lengkap || act.phone}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                            isRead
                              ? 'bg-purple-50 text-purple-700'
                              : isDelivered
                              ? 'bg-emerald-50 text-emerald-700'
                              : isFailed
                              ? 'bg-red-50 text-red-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {act.status}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {act.campaign?.title || 'Broadcast'} • {act.phone}
                      </p>

                      <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        <span>
                          {act.readAt
                            ? `Dibaca ${new Date(act.readAt).toLocaleTimeString('id-ID')}`
                            : act.deliveredAt
                            ? `Sampai ${new Date(act.deliveredAt).toLocaleTimeString('id-ID')}`
                            : act.sentAt
                            ? `Kirim ${new Date(act.sentAt).toLocaleTimeString('id-ID')}`
                            : 'Pending'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default Dashboard;

