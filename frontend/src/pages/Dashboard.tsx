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
  ChevronDown,
  ChevronRight,
  X,
  BarChart3,
  EyeOff,
  FolderKanban,
  ExternalLink,
} from 'lucide-react';
import StatCard from '../components/StatCard';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/ToastProvider';
import { LoadingState, ErrorState, EmptyState } from '../components/ui/StateBlocks';
import api from '../services/api';
import { subscribeLiveEvent } from '../services/liveEvents';
import { hasPerm } from '../lib/permissions';
import {
  AuthStatus,
  ConversationNavigationTarget,
  DashboardDrilldownKind,
  DashboardStats,
} from '../types';

interface DrilldownModalState {
  title: string;
  subtitle?: string;
  kind: DashboardDrilldownKind;
  filter: string;
  value?: string;
  shortcutTab?: string;
  shortcutLabel?: string;
  loading: boolean;
  error?: string | null;
  totalMatched: number;
  items: any[];
  search: string;
}

interface DashboardProps {
  currentUser?: AuthStatus['user'] | null;
  onNavigate: (tab: string, target?: ConversationNavigationTarget) => void;
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

export const Dashboard: React.FC<DashboardProps> = ({ currentUser, onNavigate }) => {
  const canExportCsv = hasPerm(currentUser, 'dashboard.export');
  const canAccessContacts = hasPerm(currentUser, 'contacts');
  const canSendBroadcast = hasPerm(currentUser, 'broadcasts') && hasPerm(currentUser, 'broadcasts.send');
  const toast = useToast();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportingType, setExportingType] = useState<'agents' | 'conversations' | 'broadcasts' | null>(null);
  const [showCsatDetailsModal, setShowCsatDetailsModal] = useState(false);
  const [expandedCriterionKey, setExpandedCriterionKey] = useState<string | null>(null);
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
  const [expandedAgentName, setExpandedAgentName] = useState<string | null>(null);
  const [drilldown, setDrilldown] = useState<DrilldownModalState | null>(null);

  const openDrilldown = async (opts: {
    title: string;
    subtitle?: string;
    kind: DashboardDrilldownKind;
    filter: string;
    value?: string;
    shortcutTab?: string;
    shortcutLabel?: string;
    searchQuery?: string;
  }) => {
    const q = opts.searchQuery ?? '';
    setDrilldown({
      title: opts.title,
      subtitle: opts.subtitle,
      kind: opts.kind,
      filter: opts.filter,
      value: opts.value,
      shortcutTab: opts.shortcutTab,
      shortcutLabel: opts.shortcutLabel,
      loading: true,
      error: null,
      totalMatched: 0,
      items: [],
      search: q,
    });
    try {
      const res = await api.getDashboardDrilldown({
        kind: opts.kind,
        filter: opts.filter,
        value: opts.value,
        q: q || undefined,
      });
      setDrilldown((prev) =>
        prev
          ? {
              ...prev,
              loading: false,
              totalMatched: res.totalMatched,
              items: res.items || [],
            }
          : null
      );
    } catch (err: any) {
      setDrilldown((prev) =>
        prev
          ? {
              ...prev,
              loading: false,
              error: err.response?.data?.error || err.message || 'Gagal memuat detail data',
            }
          : null
      );
    }
  };

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
    csatByCriterion: [],
    csatByProfile: [],
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
            Klik kartu metrik, bagan, atau baris mana pun untuk membuka rincian data di baliknya.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canExportCsv && (
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
          )}
          {canAccessContacts && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => onNavigate('contacts')}
            >
              Kelola Pelanggan
            </Button>
          )}
          {canSendBroadcast && (
            <Button
              variant="primary"
              size="md"
              onClick={() => onNavigate('broadcasts')}
            >
              Kirim Siaran Baru
            </Button>
          )}
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Total Pelanggan"
          value={summary.totalContacts}
          subtitle={
            summary.groupContactsCount
              ? `+ ${summary.groupContactsCount} grup WA`
              : 'Database kontak aktif'
          }
          icon={Users}
          color="indigo"
          onClick={() =>
            void openDrilldown({
              title: 'Daftar Pelanggan CRM',
              subtitle: 'Kontak pelanggan aktif (di luar grup WhatsApp)',
              kind: 'contacts',
              filter: 'all',
              shortcutTab: 'contacts',
              shortcutLabel: 'Buka Menu Pelanggan',
            })
          }
        />
        <StatCard
          title="Siaran Terkirim"
          value={summary.sent}
          subtitle="Keluar dari server WA"
          icon={Send}
          color="blue"
          onClick={() =>
            void openDrilldown({
              title: 'Detail Pesan Siaran Terkirim',
              subtitle: 'Seluruh penerima yang pesannya telah keluar dari server',
              kind: 'recipients',
              filter: 'sent',
              shortcutTab: 'tracking',
              shortcutLabel: 'Buka Tracking Live',
            })
          }
        />
        <StatCard
          title="Lead Sampai"
          value={summary.delivered}
          subtitle={`Delivery rate ${summary.deliveryRate}%`}
          icon={CheckCircle2}
          color="emerald"
          trend={{ value: `${summary.deliveryRate}%`, positive: true }}
          onClick={() =>
            void openDrilldown({
              title: 'Detail Pesan Tersampaikan (Delivered)',
              subtitle: 'Penerima dengan status centang dua atau dibaca',
              kind: 'recipients',
              filter: 'delivered',
              shortcutTab: 'tracking',
              shortcutLabel: 'Buka Tracking Live',
            })
          }
        />
        <StatCard
          title="Lead Dibaca"
          value={summary.read}
          subtitle={`Read rate ${summary.readRate}%`}
          icon={Eye}
          color="purple"
          trend={{ value: `${summary.readRate}%`, positive: true }}
          onClick={() =>
            void openDrilldown({
              title: 'Detail Pesan Dibaca (Read)',
              subtitle: 'Penerima dengan centang biru (sudah membaca pesan)',
              kind: 'recipients',
              filter: 'read',
              shortcutTab: 'tracking',
              shortcutLabel: 'Buka Tracking Live',
            })
          }
        />
        <StatCard
          title="Gagal Terkirim"
          value={summary.failed}
          subtitle="Nomor tidak valid / error"
          icon={AlertCircle}
          color="rose"
          onClick={() =>
            void openDrilldown({
              title: 'Detail Pengiriman Gagal',
              subtitle: 'Daftar nomor & pesan error pengiriman siaran',
              kind: 'recipients',
              filter: 'failed',
              shortcutTab: 'tracking',
              shortcutLabel: 'Buka Tracking Live',
            })
          }
        />
        <StatCard
          title="Ultah Hari Ini"
          value={summary.birthdayTodayCount}
          subtitle="Penerima otomatis"
          icon={Cake}
          color="amber"
          onClick={() =>
            void openDrilldown({
              title: 'Pelanggan Berulang Tahun Hari Ini',
              subtitle: 'Kontak dengan tanggal lahir hari ini (Asia/Jakarta)',
              kind: 'contacts',
              filter: 'birthday_today',
              shortcutTab: 'birthday',
              shortcutLabel: 'Pengaturan Otomasi Ultah',
            })
          }
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
                Klik batang progres atau kotak metrik untuk rincian penerima
              </p>
            </div>
            <TrendingUp className="w-4 h-4 text-indigo-600" />
          </div>

          <div className="space-y-4">
            <button
              type="button"
              onClick={() =>
                void openDrilldown({
                  title: 'Detail Pesan Tersampaikan (Delivered)',
                  subtitle: `Delivery rate ${summary.deliveryRate}% (${summary.delivered} pesan)`,
                  kind: 'recipients',
                  filter: 'delivered',
                  shortcutTab: 'tracking',
                  shortcutLabel: 'Buka Tracking Live',
                })
              }
              className="w-full text-left group rounded-md p-1.5 -m-1.5 hover:bg-emerald-50/40 transition-colors cursor-pointer"
            >
              <div className="flex justify-between text-xs font-medium mb-1.5">
                <span className="text-gray-600 group-hover:text-emerald-800">Pesan Tersampaikan (Delivered)</span>
                <span className="text-emerald-700 font-semibold tabular-nums inline-flex items-center gap-1">
                  {summary.deliveryRate}% ({summary.delivered} pesan)
                  <ChevronRight className="w-3 h-3 opacity-60" />
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded h-2 overflow-hidden">
                <div
                  className="bg-emerald-600 h-2 rounded transition-all duration-300"
                  style={{ width: `${Math.min(100, summary.deliveryRate)}%` }}
                />
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                void openDrilldown({
                  title: 'Detail Pesan Dibaca (Read Receipts)',
                  subtitle: `Read rate ${summary.readRate}% (${summary.read} pesan)`,
                  kind: 'recipients',
                  filter: 'read',
                  shortcutTab: 'tracking',
                  shortcutLabel: 'Buka Tracking Live',
                })
              }
              className="w-full text-left group rounded-md p-1.5 -m-1.5 hover:bg-indigo-50/40 transition-colors cursor-pointer"
            >
              <div className="flex justify-between text-xs font-medium mb-1.5">
                <span className="text-gray-600 group-hover:text-indigo-800">Pesan Dibaca (Read Receipts)</span>
                <span className="text-indigo-700 font-semibold tabular-nums inline-flex items-center gap-1">
                  {summary.readRate}% ({summary.read} pesan)
                  <ChevronRight className="w-3 h-3 opacity-60" />
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded h-2 overflow-hidden">
                <div
                  className="bg-indigo-600 h-2 rounded transition-all duration-300"
                  style={{ width: `${Math.min(100, summary.readRate)}%` }}
                />
              </div>
            </button>

            <div className="pt-3 border-t border-gray-200 grid grid-cols-3 gap-2 sm:gap-2.5 text-center text-xs">
              <button
                type="button"
                onClick={() =>
                  void openDrilldown({
                    title: 'Detail Penerima Status Terkirim',
                    kind: 'recipients',
                    filter: 'sent',
                    shortcutTab: 'tracking',
                    shortcutLabel: 'Buka Tracking',
                  })
                }
                className="bg-gray-50 hover:bg-gray-100 border border-gray-200 p-2 sm:p-2.5 rounded-md min-w-0 transition-colors cursor-pointer"
              >
                <span className="block text-gray-500 text-[10px] sm:text-[11px] truncate">Terkirim</span>
                <span className="font-bold text-gray-900 tabular-nums">{summary.sent}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  void openDrilldown({
                    title: 'Detail Penerima Centang Dua',
                    kind: 'recipients',
                    filter: 'delivered',
                    shortcutTab: 'tracking',
                    shortcutLabel: 'Buka Tracking',
                  })
                }
                className="bg-emerald-50/70 hover:bg-emerald-100/70 border border-emerald-200 p-2 sm:p-2.5 rounded-md min-w-0 transition-colors cursor-pointer"
              >
                <span className="block text-emerald-700 text-[10px] sm:text-[11px] truncate">Centang Dua</span>
                <span className="font-bold text-emerald-800 tabular-nums">{summary.delivered}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  void openDrilldown({
                    title: 'Detail Penerima Centang Biru',
                    kind: 'recipients',
                    filter: 'read',
                    shortcutTab: 'tracking',
                    shortcutLabel: 'Buka Tracking',
                  })
                }
                className="bg-indigo-50/70 hover:bg-indigo-100/70 border border-indigo-200 p-2 sm:p-2.5 rounded-md min-w-0 transition-colors cursor-pointer"
              >
                <span className="block text-indigo-700 text-[10px] sm:text-[11px] truncate">Centang Biru</span>
                <span className="font-bold text-indigo-800 tabular-nums">{summary.read}</span>
              </button>
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

            <button
              type="button"
              onClick={() =>
                void openDrilldown({
                  title: 'Daftar Pelanggan Berulang Tahun Hari Ini',
                  kind: 'contacts',
                  filter: 'birthday_today',
                  shortcutTab: 'birthday',
                  shortcutLabel: 'Kelola Ucapan Ultah',
                })
              }
              className="text-left group block w-full cursor-pointer"
            >
              <h4 className="text-base font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors inline-flex items-center gap-1">
                <span>
                  {summary.birthdayTodayCount > 0
                    ? `${summary.birthdayTodayCount} Pelanggan Berulang Tahun Hari Ini`
                    : 'Belum Ada Pelanggan Ulang Tahun Hari Ini'}
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-600" />
              </h4>
            </button>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Sistem memeriksa tanggal lahir pelanggan setiap pagi dan mengirimkan ucapan personal dengan jeda pengiriman teratur.
            </p>
          </div>

          <div className="mt-5 pt-4 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2.5">
            <span className="text-xs text-gray-500">
              Jadwal Harian: <strong className="text-gray-900 font-mono">08:00 WIB</strong>
            </span>
            <Button variant="secondary" size="sm" onClick={() => onNavigate('birthday')}>
              Lihat Daftar Ulang Tahun
            </Button>
          </div>
        </div>
      </div>

      {/* 7-Day Activity Trend & Contact Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
                <span>Tren Aktivitas 7 Hari Terakhir</span>
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Klik batang hari untuk melihat detail percakapan masuk atau pengiriman siaran pada tanggal tersebut
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-gray-600">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600" /> Obrolan Dinilai
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-300" /> Non-Penilaian
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Siaran WA
              </span>
            </div>
          </div>

          {!summary.activityTrend7d || summary.activityTrend7d.length === 0 ? (
            <EmptyState
              title="Belum ada data tren"
              description="Aktivitas percakapan dan siaran dalam 7 hari terakhir akan muncul di sini."
            />
          ) : (() => {
            const maxVal = Math.max(
              1,
              ...summary.activityTrend7d.map((d) =>
                Math.max(d.conversationsAssessed + d.conversationsExcluded, d.broadcastSent)
              )
            );
            return (
              <div className="grid grid-cols-7 gap-2 pt-2">
                {summary.activityTrend7d.map((day) => {
                  const totalConv = day.conversationsAssessed + day.conversationsExcluded;
                  const convPct = Math.round((totalConv / maxVal) * 100);
                  const assessedShare =
                    totalConv > 0 ? Math.round((day.conversationsAssessed / totalConv) * 100) : 0;
                  const bcastPct = Math.round((day.broadcastSent / maxVal) * 100);
                  return (
                    <div key={day.date} className="flex flex-col items-center gap-1.5 min-w-0">
                      <div className="w-full h-32 flex items-end justify-center gap-1.5 px-1 bg-gray-50/70 rounded-md border border-gray-100 py-2">
                        <button
                          type="button"
                          onClick={() =>
                            void openDrilldown({
                              title: `Obrolan Masuk Tanggal ${day.label}`,
                              subtitle: `${day.conversationsAssessed} dinilai • ${day.conversationsExcluded} non-penilaian/grup`,
                              kind: 'conversations',
                              filter: 'date',
                              value: day.date,
                              shortcutTab: 'conversations',
                              shortcutLabel: 'Buka Live Chat',
                            })
                          }
                          title={`${day.label}: ${day.conversationsAssessed} chat dinilai, ${day.conversationsExcluded} non-penilaian (Klik untuk detail)`}
                          className="w-4 sm:w-5 h-full flex flex-col justify-end rounded-t overflow-hidden hover:opacity-85 cursor-pointer group"
                        >
                          <div
                            style={{ height: `${Math.max(totalConv > 0 ? 8 : 2, convPct)}%` }}
                            className="w-full flex flex-col justify-end bg-slate-300 rounded-t transition-all"
                          >
                            <div
                              style={{ height: `${assessedShare}%` }}
                              className="w-full bg-indigo-600 transition-all"
                            />
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void openDrilldown({
                              title: `Pengiriman Siaran Tanggal ${day.label}`,
                              subtitle: `${day.broadcastSent} terkirim • ${day.broadcastRead} dibaca`,
                              kind: 'recipients',
                              filter: 'date',
                              value: day.date,
                              shortcutTab: 'tracking',
                              shortcutLabel: 'Buka Tracking',
                            })
                          }
                          title={`${day.label}: ${day.broadcastSent} pesan siaran dikirim (${day.broadcastRead} dibaca). Klik untuk detail.`}
                          className="w-4 sm:w-5 h-full flex flex-col justify-end rounded-t overflow-hidden hover:opacity-85 cursor-pointer"
                        >
                          <div
                            style={{ height: `${Math.max(day.broadcastSent > 0 ? 8 : 2, bcastPct)}%` }}
                            className="w-full bg-emerald-500 rounded-t transition-all"
                          />
                        </button>
                      </div>
                      <div className="text-center leading-tight">
                        <span className="text-[10px] sm:text-[11px] font-medium text-gray-700 block">
                          {day.label}
                        </span>
                        <span className="text-[9px] font-mono text-gray-400 tabular-nums">
                          {totalConv}/{day.broadcastSent}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
                <FolderKanban className="w-4 h-4 text-indigo-600" />
                <span>Kategori Pelanggan</span>
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Klik kategori untuk melihat daftar kontak
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('contacts')}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Kelola
            </button>
          </div>

          {!summary.contactCategories || summary.contactCategories.length === 0 ? (
            <EmptyState
              title="Belum ada kontak"
              description="Tambahkan atau sinkronkan kontak WhatsApp untuk melihat distribusi kategori."
            />
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {summary.contactCategories.map((cat) => {
                const pct =
                  summary.totalContacts > 0
                    ? Math.round((cat.count / summary.totalContacts) * 100)
                    : 0;
                return (
                  <button
                    key={cat.category}
                    type="button"
                    onClick={() =>
                      void openDrilldown({
                        title: `Kontak Kategori: ${cat.category}`,
                        subtitle: `${cat.count} kontak (${pct}% dari total pelanggan)`,
                        kind: 'contacts',
                        filter: 'category',
                        value: cat.category,
                        shortcutTab: 'contacts',
                        shortcutLabel: 'Buka Daftar Kontak',
                      })
                    }
                    className="w-full text-left p-2 rounded-md border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors cursor-pointer space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-gray-800 truncate">{cat.category}</span>
                      <span className="font-mono font-semibold text-gray-900 shrink-0 tabular-nums inline-flex items-center gap-1">
                        {cat.count} <span className="text-[10px] text-gray-400">({pct}%)</span>
                        <ChevronRight className="w-3 h-3 text-gray-400" />
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: `${Math.max(3, pct)}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Chatwoot-style Conversation, SLA & CSAT Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                <span>Analitik Percakapan &amp; SLA Live Chat</span>
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Metrik pelanggan dinilai (target SLA &le;{' '}
                {Math.max(1, Math.round((convAnalytics.slaTargetSeconds || 900) / 60))} mnt)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(convAnalytics.excludedCount || 0) > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    void openDrilldown({
                      title: 'Percakapan Non-Penilaian & Grup WA',
                      subtitle: `${convAnalytics.excludedCount} obrolan dikecualikan dari SLA/CSAT (${convAnalytics.groupCount || 0} Grup WA)`,
                      kind: 'conversations',
                      filter: 'excluded',
                      shortcutTab: 'conversations',
                      shortcutLabel: 'Buka Live Chat',
                    })
                  }
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 transition-colors cursor-pointer"
                >
                  <EyeOff className="w-3 h-3" />
                  <span>{convAnalytics.excludedCount} Non-Penilaian</span>
                  {(convAnalytics.groupCount || 0) > 0 && (
                    <span className="text-teal-700 font-semibold">({convAnalytics.groupCount} Grup)</span>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigate('conversations')}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-0.5 shrink-0"
              >
                Buka Live Chat <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <button
              type="button"
              onClick={() =>
                void openDrilldown({
                  title: 'Detail First Response Time (FRT)',
                  subtitle: 'Daftar percakapan beserta kecepatan respon awal agen',
                  kind: 'conversations',
                  filter: 'frt',
                  shortcutTab: 'conversations',
                  shortcutLabel: 'Buka Live Chat',
                })
              }
              className="p-3 rounded-md bg-gray-50 hover:bg-indigo-50/40 border border-gray-200 hover:border-indigo-300 text-left transition-colors cursor-pointer"
            >
              <span className="text-[11px] text-gray-500 block">Rata-rata Respon Awal</span>
              <span className="text-base font-bold text-gray-900 font-mono tabular-nums mt-0.5 block">
                {formatDurationShort(convAnalytics.avgFirstResponseSeconds)}
              </span>
              <span className="text-[10px] text-indigo-600 inline-flex items-center gap-0.5">
                First Response Time <ChevronRight className="w-2.5 h-2.5" />
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                void openDrilldown({
                  title: 'Detail Waktu Penyelesaian (Resolution)',
                  subtitle: 'Daftar percakapan yang telah selesai beserta durasinya',
                  kind: 'conversations',
                  filter: 'resolved_time',
                  shortcutTab: 'conversations',
                  shortcutLabel: 'Buka Live Chat',
                })
              }
              className="p-3 rounded-md bg-gray-50 hover:bg-indigo-50/40 border border-gray-200 hover:border-indigo-300 text-left transition-colors cursor-pointer"
            >
              <span className="text-[11px] text-gray-500 block">Rata-rata Penyelesaian</span>
              <span className="text-base font-bold text-gray-900 font-mono tabular-nums mt-0.5 block">
                {formatDurationShort(convAnalytics.avgResolutionSeconds)}
              </span>
              <span className="text-[10px] text-indigo-600 inline-flex items-center gap-0.5">
                Resolution Time <ChevronRight className="w-2.5 h-2.5" />
              </span>
            </button>
            <div className="p-3 rounded-md bg-emerald-50/70 border border-emerald-200 space-y-1">
              <button
                type="button"
                onClick={() =>
                  void openDrilldown({
                    title: 'Percakapan Memenuhi Target SLA',
                    subtitle: `${convAnalytics.slaMetCount} dari ${convAnalytics.slaMeasuredCount} obrolan direspons tepat waktu`,
                    kind: 'conversations',
                    filter: 'sla_met',
                    shortcutTab: 'conversations',
                    shortcutLabel: 'Buka Live Chat',
                  })
                }
                className="text-left w-full hover:opacity-80 cursor-pointer"
              >
                <span className="text-[11px] text-emerald-700 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Kepatuhan SLA
                </span>
                <span className="text-base font-bold text-emerald-800 font-mono tabular-nums mt-0.5 block">
                  {convAnalytics.slaComplianceRate !== null
                    ? `${convAnalytics.slaComplianceRate}%`
                    : '-'}
                </span>
              </button>
              <div className="flex items-center justify-between gap-1 text-[10px]">
                <span className="text-emerald-700/80">
                  {convAnalytics.slaMetCount}/{convAnalytics.slaMeasuredCount} tepat waktu
                </span>
                {convAnalytics.slaBreachedCount > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      void openDrilldown({
                        title: 'Percakapan Melewati Batas SLA',
                        subtitle: 'Obrolan yang respons pertamanya melebihi target SLA',
                        kind: 'conversations',
                        filter: 'sla_breached',
                        shortcutTab: 'conversations',
                        shortcutLabel: 'Buka Live Chat',
                      })
                    }
                    className="text-rose-700 font-semibold hover:underline cursor-pointer"
                  >
                    {convAnalytics.slaBreachedCount} telat
                  </button>
                )}
              </div>
            </div>
            <div className="p-3 rounded-md bg-indigo-50/70 border border-indigo-200">
              <span className="text-[11px] text-indigo-700 block">Status Percakapan</span>
              <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] font-semibold tabular-nums">
                <button
                  type="button"
                  onClick={() =>
                    void openDrilldown({
                      title: 'Percakapan Status OPEN',
                      kind: 'conversations',
                      filter: 'open',
                      shortcutTab: 'conversations',
                      shortcutLabel: 'Buka Live Chat',
                    })
                  }
                  className="text-blue-700 hover:underline cursor-pointer"
                >
                  {convAnalytics.openCount} Open
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void openDrilldown({
                      title: 'Percakapan Status PENDING',
                      kind: 'conversations',
                      filter: 'pending',
                      shortcutTab: 'conversations',
                      shortcutLabel: 'Buka Live Chat',
                    })
                  }
                  className="text-amber-700 hover:underline cursor-pointer"
                >
                  {convAnalytics.pendingCount} Wait
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void openDrilldown({
                      title: 'Percakapan Status RESOLVED',
                      kind: 'conversations',
                      filter: 'resolved',
                      shortcutTab: 'conversations',
                      shortcutLabel: 'Buka Live Chat',
                    })
                  }
                  className="text-emerald-700 hover:underline cursor-pointer"
                >
                  {convAnalytics.resolvedCount} Done
                </button>
              </div>
              <button
                type="button"
                onClick={() =>
                  void openDrilldown({
                    title: 'Semua Percakapan Customer (Dinilai)',
                    kind: 'conversations',
                    filter: 'assessed',
                    shortcutTab: 'conversations',
                    shortcutLabel: 'Buka Live Chat',
                  })
                }
                className="text-[10px] text-indigo-700/80 hover:underline mt-0.5 cursor-pointer"
              >
                Total {convAnalytics.totalConversations} obrolan dinilai
              </button>
            </div>
          </div>

          {convAnalytics.bySession.length > 0 && (
            <div className="pt-3 border-t border-gray-200">
              <span className="text-[11px] font-semibold text-gray-600 block mb-2">
                Distribusi per Sesi WhatsApp (Klik untuk rincian)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {convAnalytics.bySession.map((sess) => (
                  <button
                    key={sess.session}
                    type="button"
                    onClick={() =>
                      void openDrilldown({
                        title: `Percakapan Sesi WA: ${sess.session}`,
                        subtitle: `${sess.count} obrolan dinilai • ${sess.resolvedCount} selesai`,
                        kind: 'conversations',
                        filter: 'session',
                        value: sess.session,
                        shortcutTab: 'conversations',
                        shortcutLabel: 'Buka Live Chat',
                      })
                    }
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-md border border-gray-200 bg-gray-50/60 hover:border-indigo-300 hover:bg-indigo-50/30 text-xs transition-colors cursor-pointer"
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
                      <ChevronRight className="w-3 h-3 text-gray-400" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {convAnalytics.byChannel && convAnalytics.byChannel.length > 0 && (
            <div className="pt-3 border-t border-gray-200">
              <span className="text-[11px] font-semibold text-gray-600 block mb-2">
                Distribusi per Channel Omnichannel (Klik untuk rincian)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {convAnalytics.byChannel.map((ch) => (
                  <button
                    key={ch.channel}
                    type="button"
                    onClick={() =>
                      void openDrilldown({
                        title: `Percakapan Channel ${ch.channel}`,
                        subtitle: `${ch.count} obrolan dinilai • ${ch.resolvedCount} selesai`,
                        kind: 'conversations',
                        filter: 'channel',
                        value: ch.channel,
                        shortcutTab: 'conversations',
                        shortcutLabel: 'Buka Live Chat',
                      })
                    }
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-md border border-gray-200 bg-gray-50/60 hover:border-indigo-300 hover:bg-indigo-50/30 text-xs transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <MessageSquare className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span className="font-mono text-[11px] font-semibold text-gray-800 truncate">
                        {ch.channel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] tabular-nums shrink-0">
                      <span className="text-gray-700 font-semibold">{ch.count} chat</span>
                      <span className="text-emerald-700">{ch.resolvedCount} selesai</span>
                      {ch.avgCsat !== null && (
                        <span className="inline-flex items-center gap-0.5 text-amber-700 font-semibold">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                          {ch.avgCsat}
                        </span>
                      )}
                      <ChevronRight className="w-3 h-3 text-gray-400" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
                  <span>Hasil Rating CSAT</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Skor total &amp; rata-rata kepuasan pelanggan</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCsatDetailsModal(true)}
                title="Klik untuk melihat detail nilai per kriteria & target survei"
                className="text-right group rounded-md px-2 py-1 -mr-2 -mt-1 hover:bg-amber-50 transition-colors cursor-pointer"
              >
                <span className="text-xl font-bold text-gray-900 group-hover:text-amber-700 font-mono tabular-nums">
                  {convAnalytics.csatAverage !== null ? convAnalytics.csatAverage.toFixed(2) : '-'}
                </span>
                <span className="text-[11px] text-gray-400 block">
                  / 5.0 ({convAnalytics.csatCount} nilai)
                </span>
                {(convAnalytics.csatByCriterion?.length || 0) > 0 && (
                  <span className="text-[10px] text-indigo-600 font-medium inline-flex items-center gap-0.5 mt-0.5">
                    Rincian kriteria ({convAnalytics.csatByCriterion?.length})
                    <ChevronRight className="w-3 h-3" />
                  </span>
                )}
              </button>
            </div>

            <div className="space-y-1.5">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = convAnalytics.csatDistribution?.[star] || 0;
                const pct =
                  convAnalytics.csatCount > 0
                    ? Math.round((count / convAnalytics.csatCount) * 100)
                    : 0;
                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() =>
                      void openDrilldown({
                        title: `Respon CSAT Bintang ${star}`,
                        subtitle: `${count} penilaian pelanggan`,
                        kind: 'csat',
                        filter: 'star',
                        value: String(star),
                      })
                    }
                    className="w-full flex items-center gap-2 text-[11px] px-1.5 py-0.5 -mx-1.5 rounded hover:bg-amber-50/70 transition-colors cursor-pointer"
                  >
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
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-gray-200 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-gray-600">Ulasan Terbaru</span>
              {((convAnalytics.csatByCriterion?.length || 0) > 0 || (convAnalytics.csatByProfile?.length || 0) > 0) && (
                <button
                  type="button"
                  onClick={() => setShowCsatDetailsModal(true)}
                  className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Lihat Detail Kriteria
                </button>
              )}
            </div>
            {convAnalytics.recentCsat.length === 0 ? (
              <p className="text-[11px] text-gray-400">
                Belum ada ulasan CSAT masuk. Kirim tautan CSAT dari Live Chat CRM.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {convAnalytics.recentCsat.map((item) => {
                  const rowKey = item.id || item.conversationId;
                  const hasDetails = Boolean(item.criteriaDetails && item.criteriaDetails.length > 0);
                  const hasMeta = Boolean(hasDetails || item.profileName || item.agentName || item.conversationStartedAt);
                  const isExpanded = expandedReviewId === rowKey;
                  const scoreVal = item.overallScore ?? item.rating;
                  const openTargetConversation = () => {
                    onNavigate('conversations', {
                      conversationId: item.conversationId,
                      csatToken: item.token || null,
                      csatStartedAt: item.conversationStartedAt || null,
                      csatResolvedAt: item.conversationResolvedAt || null,
                    });
                  };
                  return (
                    <div
                      key={rowKey}
                      onClick={() => {
                        if (hasMeta) {
                          setExpandedReviewId(isExpanded ? null : rowKey);
                        } else {
                          openTargetConversation();
                        }
                      }}
                      className="p-2 rounded bg-amber-50/60 border border-amber-200 text-[11px] cursor-pointer hover:bg-amber-50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-gray-900 truncate min-w-0 flex-1">
                          {item.contactName}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="inline-flex items-center gap-0.5 font-mono font-semibold text-amber-800">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                            {typeof scoreVal === 'number' ? scoreVal.toFixed(1).replace(/\.0$/, '') : item.rating}
                            {hasMeta && (
                              isExpanded
                                ? <ChevronDown className="w-3 h-3 ml-0.5 text-amber-700" />
                                : <ChevronRight className="w-3 h-3 ml-0.5 text-amber-700" />
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openTargetConversation();
                            }}
                            title="Buka Percakapan Terkait di Live Chat CRM"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-[10px] font-medium whitespace-nowrap"
                          >
                            <span>Buka Chat</span>
                            <ArrowUpRight className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                      {item.feedback && (
                        <p className="text-gray-600 truncate mt-0.5 italic">"{item.feedback}"</p>
                      )}
                      {isExpanded && (
                        <div className="mt-1.5 pt-1.5 border-t border-amber-200/80 space-y-1 text-[10px]">
                          {(item.profileName || item.agentName) && (
                            <div className="flex flex-wrap items-center justify-between gap-1 text-gray-500">
                              {item.profileName && <span>Target: {item.profileName}</span>}
                              {item.agentName && <span>Agent: {item.agentName}</span>}
                            </div>
                          )}
                          {(item.conversationStartedAt || item.conversationResolvedAt) && (
                            <div className="text-gray-500 font-mono">
                              Sesi:{' '}
                              {item.conversationStartedAt
                                ? new Date(item.conversationStartedAt).toLocaleString('id-ID', {
                                    day: '2-digit',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '-'}{' '}
                              →{' '}
                              {item.conversationResolvedAt
                                ? new Date(item.conversationResolvedAt).toLocaleTimeString('id-ID', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : 'Berlangsung'}
                            </div>
                          )}
                          {hasDetails && (
                            <div className="grid grid-cols-1 gap-0.5">
                              {item.criteriaDetails!.map((cd) => (
                                <div key={cd.key} className="flex items-center justify-between text-gray-700">
                                  <span className="truncate">{cd.label}</span>
                                  <span className="font-mono font-semibold text-amber-900 shrink-0">
                                    {cd.score}/5
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Per-Agent Performance Breakdown */}
      {convAnalytics.byAgent && convAnalytics.byAgent.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Performa Percakapan per Agent</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Ringkasan obrolan, kepatuhan SLA, dan rata-rata CSAT. Klik agent atau nilai CSAT untuk melihat rincian per kriteria.
              </p>
            </div>
          </div>
          <div className="sm:hidden divide-y divide-gray-100 border border-gray-200 rounded-md overflow-hidden">
            {convAnalytics.byAgent.map((ag) => {
              const hasCrit = Boolean(ag.csatCriteria && ag.csatCriteria.length > 0);
              const isOpen = expandedAgentName === ag.agentName;
              return (
                <div key={ag.agentName} className="p-3 bg-white space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-900 truncate">{ag.agentName}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          void openDrilldown({
                            title: `Percakapan Agen: ${ag.agentName}`,
                            subtitle: `${ag.count} obrolan dinilai`,
                            kind: 'conversations',
                            filter: 'agent',
                            value: ag.agentName,
                            shortcutTab: 'conversations',
                            shortcutLabel: 'Buka Live Chat',
                          })
                        }
                        className="text-[11px] font-medium text-indigo-600 hover:underline"
                      >
                        Detail Chat
                      </button>
                      {hasCrit && (
                        <button
                          type="button"
                          onClick={() => setExpandedAgentName(isOpen ? null : ag.agentName)}
                          className="text-[11px] font-medium text-amber-700 inline-flex items-center gap-0.5"
                        >
                          CSAT
                          {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="flex items-center justify-between bg-gray-50 px-2 py-1 rounded">
                      <span className="text-gray-500">Obrolan</span>
                      <span className="font-mono font-semibold text-gray-900 tabular-nums">{ag.count}</span>
                    </div>
                    <div className="flex items-center justify-between bg-emerald-50/70 px-2 py-1 rounded">
                      <span className="text-emerald-700">Selesai</span>
                      <span className="font-mono font-semibold text-emerald-800 tabular-nums">{ag.resolvedCount}</span>
                    </div>
                    <div className="flex items-center justify-between bg-gray-50 px-2 py-1 rounded">
                      <span className="text-gray-500">SLA</span>
                      <span className="font-mono font-semibold text-gray-900 tabular-nums">
                        {ag.slaRate !== null ? `${ag.slaRate}%` : '-'}
                      </span>
                    </div>
                    <div
                      onClick={() => hasCrit && setExpandedAgentName(isOpen ? null : ag.agentName)}
                      className={`flex items-center justify-between bg-amber-50/70 px-2 py-1 rounded ${
                        hasCrit ? 'cursor-pointer' : ''
                      }`}
                    >
                      <span className="text-amber-800">CSAT</span>
                      <span className="font-mono font-semibold text-amber-900 tabular-nums">
                        {ag.avgCsat !== null ? `${ag.avgCsat}/5` : '-'}
                      </span>
                    </div>
                  </div>
                  {isOpen && hasCrit && (
                    <div className="p-2 rounded bg-amber-50/50 border border-amber-200 space-y-1 text-[11px]">
                      {ag.csatCriteria!.map((crit) => (
                        <div key={crit.key} className="flex items-center justify-between gap-2">
                          <span className="text-gray-700">{crit.label}</span>
                          <span className="font-mono font-semibold text-amber-900">
                            {crit.average.toFixed(2)}/5 ({crit.count})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="hidden sm:block overflow-x-auto">
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
                {convAnalytics.byAgent.map((ag) => {
                  const hasCrit = Boolean(ag.csatCriteria && ag.csatCriteria.length > 0);
                  const isOpen = expandedAgentName === ag.agentName;
                  return (
                    <React.Fragment key={ag.agentName}>
                      <tr
                        onClick={() => hasCrit && setExpandedAgentName(isOpen ? null : ag.agentName)}
                        className={hasCrit ? 'hover:bg-amber-50/40 cursor-pointer' : 'hover:bg-gray-50/70'}
                      >
                        <td className="py-2 pr-3 font-medium text-gray-900">
                          <span className="inline-flex items-center gap-1">
                            {hasCrit &&
                              (isOpen ? (
                                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                              ))}
                            <span>{ag.agentName}</span>
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void openDrilldown({
                                title: `Percakapan Agen: ${ag.agentName}`,
                                subtitle: `${ag.count} obrolan dinilai • SLA ${ag.slaRate !== null ? `${ag.slaRate}%` : '-'}`,
                                kind: 'conversations',
                                filter: 'agent',
                                value: ag.agentName,
                                shortcutTab: 'conversations',
                                shortcutLabel: 'Buka Live Chat',
                              });
                            }}
                            className="inline-flex items-center gap-1 text-indigo-700 font-semibold hover:underline cursor-pointer"
                            title="Lihat daftar obrolan agen ini"
                          >
                            <span>{ag.count}</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </td>
                        <td className="py-2 px-3 font-mono text-emerald-700">{ag.resolvedCount}</td>
                        <td className="py-2 px-3 font-mono">
                          {ag.slaRate !== null ? `${ag.slaRate}%` : '-'}
                        </td>
                        <td className="py-2 pl-3 font-mono text-right">
                          {ag.avgCsat !== null ? (
                            <span className={hasCrit ? 'text-indigo-700 font-semibold underline decoration-dotted' : ''}>
                              {ag.avgCsat}/5{ag.csatCount ? ` (${ag.csatCount})` : ''}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                      {isOpen && hasCrit && (
                        <tr className="bg-amber-50/40">
                          <td colSpan={5} className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-2">
                              {ag.csatCriteria!.map((crit) => (
                                <div
                                  key={crit.key}
                                  className="px-2.5 py-1 rounded bg-white border border-amber-200 text-[11px] flex items-center gap-2"
                                >
                                  <span className="text-gray-700 font-medium">{crit.label}:</span>
                                  <span className="font-mono font-bold text-amber-800 inline-flex items-center gap-0.5">
                                    <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                                    {crit.average.toFixed(2)}/5
                                  </span>
                                  <span className="text-[10px] text-gray-400">({crit.count})</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Campaigns & Activity Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
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
                  <div
                    key={camp.id}
                    onClick={() =>
                      void openDrilldown({
                        title: `Detail Kampanye: ${camp.title}`,
                        subtitle: `${camp.totalCount} target • Terkirim ${camp.sentCount} • Sampai ${camp.deliveredCount} • Dibaca ${camp.readCount}`,
                        kind: 'recipients',
                        filter: 'campaign',
                        value: camp.id,
                        shortcutTab: 'tracking',
                        shortcutLabel: 'Buka Tracking Live',
                      })
                    }
                    className="p-4 hover:bg-indigo-50/30 transition-colors cursor-pointer"
                  >
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

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500 tabular-nums">
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
                  <button
                    key={act.id}
                    type="button"
                    onClick={() =>
                      void openDrilldown({
                        title: `Detail Aktivitas: ${act.campaign?.title || 'Siaran'}`,
                        subtitle: `Penerima ${act.contact?.nama_lengkap || act.phone}`,
                        kind: 'recipients',
                        filter: 'campaign',
                        value: act.campaignId,
                        searchQuery: act.phone,
                        shortcutTab: 'tracking',
                        shortcutLabel: 'Buka Tracking Live',
                      })
                    }
                    className="w-full text-left flex items-start gap-2.5 p-2.5 rounded-md border border-gray-200 bg-gray-50/70 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors cursor-pointer"
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
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {drilldown && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4"
          onClick={() => setDrilldown(null)}
        >
          <div
            className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[88dvh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 sm:px-5 py-3.5 border-b border-gray-200 flex items-start justify-between gap-3 bg-gray-50/80 shrink-0">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-gray-900 truncate">{drilldown.title}</h3>
                {drilldown.subtitle && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{drilldown.subtitle}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {drilldown.shortcutTab && (
                  <button
                    type="button"
                    onClick={() => {
                      const tab = drilldown.shortcutTab!;
                      setDrilldown(null);
                      onNavigate(tab);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-medium"
                  >
                    <span>{drilldown.shortcutLabel || 'Buka Menu'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDrilldown(null)}
                  className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200/70"
                  aria-label="Tutup detail"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="px-4 sm:px-5 py-2.5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <input
                type="text"
                value={drilldown.search}
                onChange={(e) => {
                  const val = e.target.value;
                  setDrilldown((prev) => (prev ? { ...prev, search: val } : null));
                }}
                placeholder="Saring cepat di daftar ini..."
                className="flex-1 min-w-[200px] h-8 px-3 bg-gray-50 border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
              />
              {!drilldown.loading && (
                <span className="text-[11px] font-mono text-gray-500">
                  {drilldown.totalMatched} total kecocokan
                  {drilldown.totalMatched > 200 ? ' (menampilkan 200 terbaru)' : ''}
                </span>
              )}
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto flex-1 text-xs">
              {drilldown.loading ? (
                <LoadingState message="Memuat detail data..." />
              ) : drilldown.error ? (
                <ErrorState
                  message={drilldown.error}
                  onRetry={() =>
                    void openDrilldown({
                      title: drilldown.title,
                      subtitle: drilldown.subtitle,
                      kind: drilldown.kind,
                      filter: drilldown.filter,
                      value: drilldown.value,
                      shortcutTab: drilldown.shortcutTab,
                      shortcutLabel: drilldown.shortcutLabel,
                      searchQuery: drilldown.search,
                    })
                  }
                />
              ) : (() => {
                const q = drilldown.search.trim().toLowerCase();
                const visible = q
                  ? drilldown.items.filter((it) => JSON.stringify(it).toLowerCase().includes(q))
                  : drilldown.items;
                if (visible.length === 0) {
                  return (
                    <EmptyState
                      title="Tidak ada data yang sesuai"
                      description="Coba bersihkan kata pencarian atau periksa filter lain."
                    />
                  );
                }

                if (drilldown.kind === 'contacts') {
                  return (
                    <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                      {visible.map((c: any) => (
                        <div key={c.id} className="p-3 flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 truncate">{c.nama_lengkap}</div>
                            <div className="text-[11px] text-gray-500 flex flex-wrap items-center gap-2 mt-0.5">
                              <span className="font-mono">
                                {c.nomor_whatsapp ? `+${c.nomor_whatsapp}` : 'Tanpa nomor WA'}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 text-[10px]">
                                {c.kategori || 'Tanpa Kategori'}
                              </span>
                              {c.tanggal_lahir && (
                                <span className="text-amber-700 font-mono text-[10px]">
                                  Lahir: {new Date(c.tanggal_lahir).toLocaleDateString('id-ID')}
                                </span>
                              )}
                            </div>
                          </div>
                          {c.tags && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                              {c.tags}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                }

                if (drilldown.kind === 'recipients') {
                  return (
                    <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                      {visible.map((r: any) => (
                        <div key={r.id} className="p-3 space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="font-semibold text-gray-900">
                                {r.contact?.nama_lengkap || r.phone}
                              </span>{' '}
                              <span className="font-mono text-[11px] text-gray-500">+{r.phone}</span>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                r.status === 'READ'
                                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                  : r.status === 'DELIVERED'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : r.status === 'FAILED'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-gray-100 text-gray-700 border-gray-200'
                              }`}
                            >
                              {r.status}
                            </span>
                          </div>
                          {r.campaign?.title && (
                            <div className="text-[11px] text-gray-500">Kampanye: {r.campaign.title}</div>
                          )}
                          {r.errorMessage && (
                            <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
                              {r.errorMessage}
                            </div>
                          )}
                          <div className="text-[10px] font-mono text-gray-400">
                            {r.readAt
                              ? `Dibaca ${new Date(r.readAt).toLocaleString('id-ID')}`
                              : r.deliveredAt
                              ? `Sampai ${new Date(r.deliveredAt).toLocaleString('id-ID')}`
                              : r.sentAt
                              ? `Terkirim ${new Date(r.sentAt).toLocaleString('id-ID')}`
                              : 'Menunggu'}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                }

                if (drilldown.kind === 'csat') {
                  return (
                    <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                      {visible.map((item: any) => (
                        <div key={item.id} className="p-3 space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="font-semibold text-gray-900">{item.contactName}</span>
                              {item.phone && (
                                <span className="ml-2 font-mono text-[11px] text-gray-500">+{item.phone}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-mono font-bold">
                                <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                                {Number(item.overallScore ?? item.rating).toFixed(1)}/5
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setDrilldown(null);
                                  onNavigate('conversations', {
                                    conversationId: item.conversationId,
                                    csatToken: item.token || null,
                                  });
                                }}
                                className="px-2 py-0.5 rounded border border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-[11px] font-medium"
                              >
                                Buka Chat
                              </button>
                            </div>
                          </div>
                          {item.feedback && (
                            <p className="text-gray-600 italic">"{item.feedback}"</p>
                          )}
                          <div className="text-[10px] text-gray-500 flex flex-wrap gap-3">
                            {item.agentName && <span>Agent: {item.agentName}</span>}
                            {item.profileName && <span>Survei: {item.profileName}</span>}
                            {item.submittedAt && (
                              <span className="font-mono">
                                {new Date(item.submittedAt).toLocaleString('id-ID')}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                }

                // conversations
                return (
                  <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                    {visible.map((c: any) => (
                      <div key={c.id} className="p-3 space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                            <span className="font-semibold text-gray-900 truncate">{c.displayName}</span>
                            {c.isGroup && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                                Grup WA
                              </span>
                            )}
                            {c.excludeFromMetrics && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-700 border border-gray-200">
                                {c.excludeReason || 'Non-Penilaian'}
                              </span>
                            )}
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {c.wahaSession || c.channel}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              {c.status}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setDrilldown(null);
                              onNavigate('conversations', { conversationId: c.id });
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-[11px] font-medium shrink-0"
                          >
                            Buka Chat <ArrowUpRight className="w-3 h-3" />
                          </button>
                        </div>
                        {c.lastMessage && (
                          <p className="text-gray-600 line-clamp-1">{c.lastMessage}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono text-gray-500">
                          {c.assignedAgentName && <span>Agent: {c.assignedAgentName}</span>}
                          {c.frtSeconds !== null && c.frtSeconds !== undefined && (
                            <span className={c.slaMet ? 'text-emerald-700' : 'text-rose-700'}>
                              FRT: {formatDurationShort(c.frtSeconds)} ({c.slaMet ? 'SLA OK' : 'Lewat SLA'})
                            </span>
                          )}
                          {c.resolutionSeconds !== null && c.resolutionSeconds !== undefined && (
                            <span>Selesai dlm: {formatDurationShort(c.resolutionSeconds)}</span>
                          )}
                          {c.lastMessageAt && (
                            <span>{new Date(c.lastMessageAt).toLocaleString('id-ID')}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {showCsatDetailsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowCsatDetailsModal(false)}
        >
          <div
            className="bg-white rounded-xl border border-gray-200 shadow-lg w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
                  <span>Rincian Skor CSAT Per Kriteria &amp; Target</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Skor rata-rata total:{' '}
                  <strong className="font-mono text-gray-900">
                    {convAnalytics.csatAverage !== null ? convAnalytics.csatAverage.toFixed(2) : '-'} / 5.0
                  </strong>{' '}
                  dari {convAnalytics.csatCount} penilaian. Klik kriteria untuk melihat sebaran bintang.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCsatDetailsModal(false)}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                aria-label="Tutup detail CSAT"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5 text-xs">
              {/* Breakdown per Kriteria */}
              <div className="space-y-2.5">
                <h4 className="font-semibold text-gray-900 text-xs uppercase tracking-wider text-[11px]">
                  Skor Rata-rata per Parameter / Aspek
                </h4>
                {!convAnalytics.csatByCriterion || convAnalytics.csatByCriterion.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3">
                    Belum ada data penilaian per kriteria (masih menggunakan rating tunggal atau belum ada ulasan masuk).
                  </p>
                ) : (
                  <div className="space-y-2">
                    {convAnalytics.csatByCriterion.map((crit) => {
                      const pct = Math.min(100, Math.round((crit.average / 5) * 100));
                      const isExpanded = expandedCriterionKey === crit.key;
                      return (
                        <div
                          key={crit.key}
                          onClick={() => setExpandedCriterionKey(isExpanded ? null : crit.key)}
                          className="p-3 rounded-lg border border-gray-200 bg-gray-50/70 hover:bg-amber-50/40 cursor-pointer space-y-2 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-gray-900 inline-flex items-center gap-1">
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                              )}
                              <span>{crit.label}</span>
                              <span className="font-mono text-[10px] text-gray-400 font-normal">
                                ({crit.key})
                              </span>
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowCsatDetailsModal(false);
                                  void openDrilldown({
                                    title: `Respon CSAT Aspek: ${crit.label}`,
                                    subtitle: `Rata-rata ${crit.average.toFixed(2)}/5 dari ${crit.count} penilaian`,
                                    kind: 'csat',
                                    filter: 'criterion',
                                    value: crit.key,
                                  });
                                }}
                                className="text-[11px] font-medium text-indigo-600 hover:underline"
                              >
                                {crit.count} penilai →
                              </button>
                              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-mono font-bold">
                                {crit.average.toFixed(2)} / 5
                              </span>
                            </div>
                          </div>
                          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-400 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          {isExpanded && crit.distribution && (
                            <div className="pt-2 border-t border-gray-200 grid grid-cols-5 gap-1.5 text-[10px]">
                              {[5, 4, 3, 2, 1].map((s) => (
                                <div
                                  key={s}
                                  className="px-2 py-1 rounded bg-white border border-gray-200 flex items-center justify-between"
                                >
                                  <span className="font-mono text-gray-600">{s}★</span>
                                  <span className="font-mono font-semibold text-gray-900">
                                    {crit.distribution?.[s] || 0}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Breakdown per Target Profile */}
              {convAnalytics.csatByProfile && convAnalytics.csatByProfile.length > 0 && (
                <div className="space-y-2.5 pt-2 border-t border-gray-200">
                  <h4 className="font-semibold text-gray-900 text-[11px] uppercase tracking-wider">
                    Skor per Target Survei
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {convAnalytics.csatByProfile.map((prof) => (
                      <div
                        key={prof.profileId}
                        onClick={() => {
                          setShowCsatDetailsModal(false);
                          void openDrilldown({
                            title: `Respon CSAT Target: ${prof.profileName}`,
                            subtitle: `Skor ${prof.average.toFixed(2)}/5 (${prof.count} penilaian)`,
                            kind: 'csat',
                            filter: 'profile',
                            value: prof.profileId,
                          });
                        }}
                        className="p-3 rounded-lg border border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/20 cursor-pointer space-y-2 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-gray-900 truncate">{prof.profileName}</span>
                          <span className="font-mono font-bold text-indigo-700 shrink-0">
                            {prof.average.toFixed(2)}/5 ({prof.count})
                          </span>
                        </div>
                        {prof.criteria.length > 0 && (
                          <div className="space-y-1 pt-1 border-t border-gray-100 text-[11px]">
                            {prof.criteria.map((c) => (
                              <div key={c.key} className="flex items-center justify-between text-gray-600">
                                <span className="truncate">{c.label}</span>
                                <span className="font-mono font-semibold text-gray-900">
                                  {c.average.toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
