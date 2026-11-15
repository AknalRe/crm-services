import React, { useEffect, useState, useCallback } from 'react';
import {
  Users,
  Send,
  CheckCircle2,
  Eye,
  AlertCircle,
  Cake,
  Clock,
  ArrowUpRight,
  TrendingUp,
  MessageSquare,
  Star,
  ShieldCheck,
  Smartphone,
  Download,
} from 'lucide-react';
import StatCard from '../components/StatCard';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/ToastProvider';
import { LoadingState, ErrorState, EmptyState } from '../components/ui/StateBlocks';
import api from '../services/api';
import { subscribeLiveEvent } from '../services/liveEvents';
import { DashboardStats } from '../types';

interface DashboardProps {
  onNavigate: (tab: string) => void;
}

function formatDurationShort(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '-';
  if (seconds < 60) return `${seconds} dtk`;
  const mins = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (mins < 60) return remSec > 0 ? `${mins}m ${remSec}d` : `${mins} mnt`;
  const hours = Math.floor(mins / 60);
  const remMin = mins % 60;
  return remMin > 0 ? `${hours}j ${remMin}m` : `${hours} jam`;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const toast = useToast();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportingType, setExportingType] = useState<'agents' | 'conversations' | 'broadcasts' | null>(null);

  const handleExport = async (type: 'agents' | 'conversations' | 'broadcasts') => {
    setExportingType(type);
    try {
      await api.downloadDashboardExport(type);
      toast.success('Laporan CSV berhasil diunduh');
    } catch {
      toast.error('Gagal mengunduh laporan CSV');
    } finally {
      setExportingType(null);
    }
  };

  const loadData = useCallback(async () => {
    try {
      const data = await api.getDashboardStats();
      setStats(data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Gagal memuat statistik dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const unsubTracking = subscribeLiveEvent('tracking:update', () => {
      void loadData();
    });
    const unsubConv = subscribeLiveEvent('conversations:update', () => {
      void loadData();
    });
    const unsubWaha = subscribeLiveEvent('waha:status', () => {
      void loadData();
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void loadData();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(() => {
      void loadData();
    }, 30_000);
    return () => {
      unsubTracking();
      unsubConv();
      unsubWaha();
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
    };
  }, [loadData]);

  if (loading && !stats) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <LoadingState message="Memuat ringkasan analitik CRM..." />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <ErrorState message={error} onRetry={loadData} />
      </div>
    );
  }

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

  const convAnalytics = stats?.conversationAnalytics || {
    totalConversations: 0,
    openCount: 0,
    pendingCount: 0,
    resolvedCount: 0,
    avgFirstResponseSeconds: null,
    avgResolutionSeconds: null,
    slaTargetSeconds: 900,
    slaMeasuredCount: 0,
    slaMetCount: 0,
    slaBreachedCount: 0,
    slaComplianceRate: null,
    csatCount: 0,
    csatAverage: null,
    csatDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    recentCsat: [],
    bySession: [],
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Ringkasan Aktivitas CRM</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Pantau kontak pelanggan, tingkat pengiriman siaran, dan otomasi ulang tahun.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="inline-flex items-center rounded-md border border-gray-200 bg-white divide-x divide-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => void handleExport('conversations')}
              disabled={exportingType !== null}
              title="Ekspor Laporan Percakapan & SLA (CSV)"
              className="h-9 px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-gray-500" />
              <span>CSV Chat</span>
            </button>
            <button
              type="button"
              onClick={() => void handleExport('agents')}
              disabled={exportingType !== null}
              title="Ekspor Laporan Performa Agent (CSV)"
              className="h-9 px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
            >
              <span>Agent</span>
            </button>
            <button
              type="button"
              onClick={() => void handleExport('broadcasts')}
              disabled={exportingType !== null}
              title="Ekspor Laporan Broadcast (CSV)"
              className="h-9 px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
            >
              <span>Broadcast</span>
            </button>
          </div>
          <Button
            variant="secondary"
            size="md"
            onClick={() => onNavigate('contacts')}
            leftIcon={<Users className="w-4 h-4" />}
          >
            Kelola Pelanggan
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => onNavigate('broadcasts')}
            leftIcon={<Send className="w-4 h-4" />}
          >
            Kirim Siaran Baru
          </Button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Total Pelanggan"
          value={summary.totalContacts}
          subtitle="Database kontak aktif"
          icon={Users}
          color="indigo"
          onClick={() => onNavigate('contacts')}
        />
        <StatCard
          title="Siaran Terkirim"
          value={summary.sent}
          subtitle="Keluar dari server WA"
          icon={Send}
          color="blue"
        />
        <StatCard
          title="Lead Sampai"
          value={summary.delivered}
          subtitle={`Delivery rate ${summary.deliveryRate}%`}
          icon={CheckCircle2}
          color="emerald"
          trend={{ value: `${summary.deliveryRate}%`, positive: true }}
        />
        <StatCard
          title="Lead Dibaca"
          value={summary.read}
          subtitle={`Read rate ${summary.readRate}%`}
          icon={Eye}
          color="purple"
          trend={{ value: `${summary.readRate}%`, positive: true }}
        />
        <StatCard
          title="Gagal Terkirim"
          value={summary.failed}
          subtitle="Nomor tidak valid / error"
          icon={AlertCircle}
          color="rose"
        />
        <StatCard
          title="Ultah Hari Ini"
          value={summary.birthdayTodayCount}
          subtitle="Penerima otomatis"
          icon={Cake}
          color="amber"
          onClick={() => onNavigate('birthday')}
        />
      </div>

      {/* Delivery & Birthday Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">
                Tingkat Keberhasilan Pengiriman
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Persentase status pesan dari total yang diproses
              </p>
            </div>
            <TrendingUp className="w-4 h-4 text-indigo-600" />
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-medium mb-1.5">
                <span className="text-gray-600">Pesan Tersampaikan (Delivered)</span>
                <span className="text-emerald-700 font-semibold tabular-nums">
                  {summary.deliveryRate}% ({summary.delivered} pesan)
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded h-2 overflow-hidden">
                <div
                  className="bg-emerald-600 h-2 rounded transition-all duration-300"
                  style={{ width: `${Math.min(100, summary.deliveryRate)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1.5">
                <span className="text-gray-600">Pesan Dibaca (Read Receipts)</span>
                <span className="text-indigo-700 font-semibold tabular-nums">
                  {summary.readRate}% ({summary.read} pesan)
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded h-2 overflow-hidden">
                <div
                  className="bg-indigo-600 h-2 rounded transition-all duration-300"
                  style={{ width: `${Math.min(100, summary.readRate)}%` }}
                />
              </div>
            </div>

            <div className="pt-3 border-t border-gray-200 grid grid-cols-3 gap-2.5 text-center text-xs">
              <div className="bg-gray-50 border border-gray-200 p-2.5 rounded-md">
                <span className="block text-gray-500 text-[11px]">Terkirim</span>
                <span className="font-bold text-gray-900 tabular-nums">{summary.sent}</span>
              </div>
              <div className="bg-emerald-50/70 border border-emerald-200 p-2.5 rounded-md">
                <span className="block text-emerald-700 text-[11px]">Centang Dua</span>
                <span className="font-bold text-emerald-800 tabular-nums">{summary.delivered}</span>
              </div>
              <div className="bg-indigo-50/70 border border-indigo-200 p-2.5 rounded-md">
                <span className="block text-indigo-700 text-[11px]">Centang Biru</span>
                <span className="font-bold text-indigo-800 tabular-nums">{summary.read}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                <Cake className="w-3.5 h-3.5" />
                Otomasi Ulang Tahun
              </span>
              <button
                type="button"
                onClick={() => onNavigate('birthday')}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-0.5"
              >
                Pengaturan <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <h4 className="text-base font-semibold text-gray-900">
              {summary.birthdayTodayCount > 0
                ? `${summary.birthdayTodayCount} Pelanggan Berulang Tahun Hari Ini`
                : 'Belum Ada Pelanggan Ulang Tahun Hari Ini'}
            </h4>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Sistem memeriksa tanggal lahir pelanggan setiap pagi dan mengirimkan ucapan personal dengan jeda pengiriman teratur.
            </p>
          </div>

          <div className="mt-5 pt-4 border-t border-gray-200 flex items-center justify-between gap-3">
            <span className="text-xs text-gray-500">
              Jadwal Harian: <strong className="text-gray-900 font-mono">08:00 WIB</strong>
            </span>
            <Button variant="secondary" size="sm" onClick={() => onNavigate('birthday')}>
              Lihat Daftar Ulang Tahun
            </Button>
          </div>
        </div>
      </div>

      {/* Chatwoot-style Conversation, SLA & CSAT Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                <span>Analitik Percakapan &amp; SLA Live Chat</span>
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Metrik respon awal (FRT), waktu penyelesaian, dan kepatuhan SLA (target &le;{' '}
                {Math.max(1, Math.round((convAnalytics.slaTargetSeconds || 900) / 60))} menit)
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('conversations')}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-0.5"
            >
              Buka Live Chat <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-md bg-gray-50 border border-gray-200">
              <span className="text-[11px] text-gray-500 block">Rata-rata Respon Awal</span>
              <span className="text-base font-bold text-gray-900 font-mono tabular-nums mt-0.5 block">
                {formatDurationShort(convAnalytics.avgFirstResponseSeconds)}
              </span>
              <span className="text-[10px] text-gray-400">First Response Time</span>
            </div>
            <div className="p-3 rounded-md bg-gray-50 border border-gray-200">
              <span className="text-[11px] text-gray-500 block">Rata-rata Penyelesaian</span>
              <span className="text-base font-bold text-gray-900 font-mono tabular-nums mt-0.5 block">
                {formatDurationShort(convAnalytics.avgResolutionSeconds)}
              </span>
              <span className="text-[10px] text-gray-400">Resolution Time</span>
            </div>
            <div className="p-3 rounded-md bg-emerald-50/70 border border-emerald-200">
              <span className="text-[11px] text-emerald-700 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                Kepatuhan SLA
              </span>
              <span className="text-base font-bold text-emerald-800 font-mono tabular-nums mt-0.5 block">
                {convAnalytics.slaComplianceRate !== null
                  ? `${convAnalytics.slaComplianceRate}%`
                  : '-'}
              </span>
              <span className="text-[10px] text-emerald-700/80">
                {convAnalytics.slaMetCount}/{convAnalytics.slaMeasuredCount} tepat waktu
              </span>
            </div>
            <div className="p-3 rounded-md bg-indigo-50/70 border border-indigo-200">
              <span className="text-[11px] text-indigo-700 block">Status Percakapan</span>
              <div className="flex items-center gap-2 mt-1 text-[11px] font-semibold tabular-nums">
                <span className="text-blue-700">{convAnalytics.openCount} Open</span>
                <span className="text-amber-700">{convAnalytics.pendingCount} Wait</span>
                <span className="text-emerald-700">{convAnalytics.resolvedCount} Done</span>
              </div>
              <span className="text-[10px] text-indigo-700/80">
                Total {convAnalytics.totalConversations} obrolan
              </span>
            </div>
          </div>

          {convAnalytics.bySession.length > 0 && (
            <div className="pt-3 border-t border-gray-200">
              <span className="text-[11px] font-semibold text-gray-600 block mb-2">
                Distribusi per Sesi WhatsApp
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {convAnalytics.bySession.map((sess) => (
                  <div
                    key={sess.session}
                    className="flex items-center justify-between px-3 py-2 rounded-md border border-gray-200 bg-gray-50/60 text-xs"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Smartphone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="font-mono text-[11px] font-medium text-gray-800 truncate">
                        {sess.session}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] tabular-nums shrink-0">
                      <span className="text-gray-700 font-semibold">{sess.count} chat</span>
                      {sess.avgCsat !== null && (
                        <span className="inline-flex items-center gap-0.5 text-amber-700 font-semibold">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                          {sess.avgCsat}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
                  <span>Hasil Rating CSAT</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Kepuasan pelanggan dari tautan CTA</p>
              </div>
              <div className="text-right">
                <span className="text-xl font-bold text-gray-900 font-mono tabular-nums">
                  {convAnalytics.csatAverage !== null ? convAnalytics.csatAverage.toFixed(1) : '-'}
                </span>
                <span className="text-[11px] text-gray-400 block">
                  / 5.0 ({convAnalytics.csatCount} nilai)
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = convAnalytics.csatDistribution?.[star] || 0;
                const pct =
                  convAnalytics.csatCount > 0
                    ? Math.round((count / convAnalytics.csatCount) * 100)
                    : 0;
                return (
                  <div key={star} className="flex items-center gap-2 text-[11px]">
                    <span className="w-8 font-mono text-gray-600 flex items-center gap-0.5">
                      {star}
                      <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-500" />
                    </span>
                    <div className="flex-1 bg-gray-100 rounded h-1.5 overflow-hidden">
                      <div
                        className="bg-amber-400 h-1.5 rounded transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-6 text-right font-mono text-gray-500 tabular-nums">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-gray-200 space-y-2">
            <span className="text-[11px] font-semibold text-gray-600 block">Ulasan Terbaru</span>
            {convAnalytics.recentCsat.length === 0 ? (
              <p className="text-[11px] text-gray-400">
                Belum ada ulasan CSAT masuk. Kirim tautan CSAT dari Live Chat CRM.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {convAnalytics.recentCsat.map((item) => (
                  <div
                    key={item.conversationId}
                    className="p-2 rounded bg-amber-50/60 border border-amber-200 text-[11px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-gray-900 truncate">
                        {item.contactName}
                      </span>
                      <span className="inline-flex items-center gap-0.5 font-mono font-semibold text-amber-800 shrink-0">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                        {item.rating}
                      </span>
                    </div>
                    {item.feedback && (
                      <p className="text-gray-600 truncate mt-0.5 italic">"{item.feedback}"</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Per-Agent Performance Breakdown */}
      {convAnalytics.byAgent && convAnalytics.byAgent.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Performa Percakapan per Agent</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Ringkasan jumlah obrolan, tingkat selesai, kepatuhan SLA, dan rata-rata CSAT masing-masing agent
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-[11px] uppercase text-gray-500">
                  <th className="py-2 pr-3 font-medium">Agent</th>
                  <th className="py-2 px-3 font-medium">Total Obrolan</th>
                  <th className="py-2 px-3 font-medium">Selesai</th>
                  <th className="py-2 px-3 font-medium">Kepatuhan SLA</th>
                  <th className="py-2 pl-3 font-medium text-right">Rata-rata CSAT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {convAnalytics.byAgent.map((ag) => (
                  <tr key={ag.agentName} className="hover:bg-gray-50/70">
                    <td className="py-2 pr-3 font-medium text-gray-900">{ag.agentName}</td>
                    <td className="py-2 px-3 font-mono">{ag.count}</td>
                    <td className="py-2 px-3 font-mono text-emerald-700">{ag.resolvedCount}</td>
                    <td className="py-2 px-3 font-mono">
                      {ag.slaRate !== null ? `${ag.slaRate}%` : '-'}
                    </td>
                    <td className="py-2 pl-3 font-mono text-right">
                      {ag.avgCsat !== null ? `${ag.avgCsat}/5` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Campaigns & Activity Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Kampanye Siaran Terakhir</h3>
              <p className="text-xs text-gray-500 mt-0.5">Progres pengiriman dan respons penerima</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('broadcasts')}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
            >
              Lihat Semua <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-gray-200">
            {!stats?.recentCampaigns || stats.recentCampaigns.length === 0 ? (
              <EmptyState
                title="Belum ada kampanye siaran"
                description="Buat kampanye siaran pertama Anda untuk mulai mengirim pesan ke pelanggan."
              />
            ) : (
              stats.recentCampaigns.map((camp) => {
                const total = camp.totalCount || 1;
                const percentSent = Math.round((camp.sentCount / total) * 100);
                const percentDelivered = Math.round((camp.deliveredCount / total) * 100);
                const percentRead = Math.round((camp.readCount / total) * 100);

                return (
                  <div key={camp.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900 text-sm truncate">
                            {camp.title}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-700 border border-gray-200">
                            {camp.type}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">
                          {camp.messageTemplate}
                        </p>
                      </div>

                      <span
                        className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-semibold border ${
                          camp.status === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : camp.status === 'PROCESSING'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : camp.status === 'SCHEDULED'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-gray-100 text-gray-700 border-gray-200'
                        }`}
                      >
                        {camp.status}
                      </span>
                    </div>

                    <div className="w-full bg-gray-100 h-2 rounded overflow-hidden flex">
                      <div
                        className="bg-indigo-600 h-2 transition-all"
                        style={{ width: `${percentRead}%` }}
                        title={`Dibaca: ${camp.readCount}`}
                      />
                      <div
                        className="bg-emerald-600 h-2 transition-all"
                        style={{ width: `${Math.max(0, percentDelivered - percentRead)}%` }}
                        title={`Sampai: ${camp.deliveredCount}`}
                      />
                      <div
                        className="bg-blue-500 h-2 transition-all"
                        style={{ width: `${Math.max(0, percentSent - Math.max(percentDelivered, percentRead))}%` }}
                        title={`Terkirim: ${camp.sentCount}`}
                      />
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500 tabular-nums">
                      <span>
                        Total: <strong className="text-gray-900">{camp.totalCount}</strong> kontak
                      </span>
                      <div className="flex gap-3">
                        <span className="text-emerald-700">
                          Terkirim: <strong>{camp.sentCount}</strong>
                        </span>
                        <span className="text-blue-700">
                          Sampai: <strong>{camp.deliveredCount}</strong>
                        </span>
                        <span className="text-indigo-700">
                          Dibaca: <strong>{camp.readCount}</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Aktivitas Terakhir</h3>
              <p className="text-xs text-gray-500 mt-0.5">Event pengiriman real-time</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('tracking')}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Lihat Detail
            </button>
          </div>

          <div className="p-4 space-y-2.5 flex-1 overflow-y-auto max-h-[380px]">
            {!stats?.recentActivity || stats.recentActivity.length === 0 ? (
              <EmptyState title="Belum ada aktivitas" description="Log pengiriman terbaru akan tampil di sini." />
            ) : (
              stats.recentActivity.map((act) => {
                const isRead = act.status === 'READ';
                const isDelivered = act.status === 'DELIVERED';
                const isFailed = act.status === 'FAILED';

                return (
                  <div
                    key={act.id}
                    className="flex items-start gap-2.5 p-2.5 rounded-md border border-gray-200 bg-gray-50/70"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-gray-900 truncate">
                          {act.contact?.nama_lengkap || act.phone}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                            isRead
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : isDelivered
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : isFailed
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : 'bg-gray-100 text-gray-700 border-gray-200'
                          }`}
                        >
                          {act.status}
                        </span>
                      </div>

                      <p className="text-[11px] text-gray-500 truncate mt-0.5">
                        {act.campaign?.title || 'Siaran'} •{' '}
                        <span className="font-mono">{act.phone}</span>
                      </p>

                      <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-1 tabular-nums">
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
