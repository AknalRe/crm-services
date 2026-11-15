import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CalendarClock,
  Send,
  Trash2,
  XCircle,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Upload,
  List,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import api from '../services/api';
import { subscribeLiveEvent } from '../services/liveEvents';
import { ChannelAccount, ScheduledPostItem } from '../types';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/ToastProvider';
import { LoadingState, EmptyState } from '../components/ui/StateBlocks';

type PostChannel = 'INSTAGRAM' | 'FACEBOOK' | 'THREADS' | 'TELEGRAM';

interface ScheduledPostsProps {
  prefill?: {
    channel?: PostChannel;
    caption?: string;
    mediaUrl?: string;
  } | null;
  onClearPrefill?: () => void;
}

const POST_CHANNEL_META: Record<PostChannel, { label: string; badgeCls: string }> = {
  INSTAGRAM: { label: 'Instagram Feed', badgeCls: 'bg-pink-50 text-pink-700 border-pink-200' },
  FACEBOOK: { label: 'Facebook Page', badgeCls: 'bg-blue-50 text-blue-700 border-blue-200' },
  THREADS: { label: 'Threads', badgeCls: 'bg-gray-100 text-gray-800 border-gray-300' },
  TELEGRAM: { label: 'Telegram Channel', badgeCls: 'bg-sky-50 text-sky-700 border-sky-200' },
};

export const ScheduledPosts: React.FC<ScheduledPostsProps> = ({
  prefill,
  onClearPrefill,
}) => {
  const toast = useToast();
  const [posts, setPosts] = useState<ScheduledPostItem[]>([]);
  const [accounts, setAccounts] = useState<ChannelAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [channel, setChannel] = useState<PostChannel>('INSTAGRAM');
  const [channelAccountId, setChannelAccountId] = useState('');
  const [caption, setCaption] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [targetChatId, setTargetChatId] = useState('');
  const [publishMode, setPublishMode] = useState<'SCHEDULED' | 'NOW'>('SCHEDULED');
  const [scheduledAt, setScheduledAt] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calendarGranularity, setCalendarGranularity] = useState<'month' | 'week'>('month');
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvText, setCsvText] = useState(
    'channel,caption,scheduledAt,mediaUrl,targetChatId\nTHREADS,Promo akhir pekan diskon 20%!,2026-11-20T10:00:00,,'
  );
  const [importingCsv, setImportingCsv] = useState(false);
  const csvFileRef = useRef<HTMLInputElement | null>(null);
  const [filterChannel, setFilterChannel] = useState<'ALL' | PostChannel>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | ScheduledPostItem['status']>('ALL');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  });

  const handleUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingMedia(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = String(reader.result || '');
        const uploaded = await api.uploadMedia({
          fileName: file.name,
          mimeType: file.type || 'image/png',
          base64: result,
        });
        setMediaUrl(uploaded.url);
        toast.success('Gambar berhasil diunggah');
      } catch (err: any) {
        toast.error(err.response?.data?.error || 'Gagal mengunggah gambar');
      } finally {
        setUploadingMedia(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const loadData = useCallback(async () => {
    try {
      const [postList, accList] = await Promise.all([
        api.getScheduledPosts(),
        api.getChannels(),
      ]);
      setPosts(postList || []);
      setAccounts(accList || []);
      setChannelAccountId((prev) => {
        if (prev) return prev;
        const first = (accList || []).find((a) => a.channel === channel && a.isActive);
        return first?.id || '';
      });
    } catch {
      // ignore initial error
    } finally {
      setLoading(false);
    }
  }, [channel]);

  useEffect(() => {
    loadData();
    const unsub = subscribeLiveEvent('posts:update', () => {
      void loadData();
    });
    return unsub;
  }, [loadData]);

  useEffect(() => {
    if (!prefill) return;
    if (prefill.channel) {
      setChannel(prefill.channel);
      const first = accounts.find((a) => a.channel === prefill.channel && a.isActive);
      if (first) setChannelAccountId(first.id);
    }
    if (prefill.caption) setCaption(prefill.caption);
    if (prefill.mediaUrl) setMediaUrl(prefill.mediaUrl);
    onClearPrefill?.();
  }, [prefill, accounts, onClearPrefill]);

  const matchingAccounts = accounts.filter((a) => a.channel === channel && a.isActive);

  const handleChannelChange = (nextCh: PostChannel) => {
    setChannel(nextCh);
    const first = accounts.find((a) => a.channel === nextCh && a.isActive);
    setChannelAccountId(first?.id || '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelAccountId) {
      toast.error(`Pilih akun ${POST_CHANNEL_META[channel].label} terlebih dahulu`);
      return;
    }
    if (!caption.trim()) {
      toast.error('Caption / teks postingan wajib diisi');
      return;
    }
    if (channel === 'INSTAGRAM' && !mediaUrl.trim()) {
      toast.error('Postingan Instagram Feed memerlukan URL gambar publik');
      return;
    }
    if (channel === 'TELEGRAM' && !targetChatId.trim()) {
      toast.error('Target Channel / Group ID Telegram wajib diisi');
      return;
    }
    if (publishMode === 'SCHEDULED' && !scheduledAt) {
      toast.error('Pilih tanggal dan jam jadwal postingan');
      return;
    }

    setSubmitting(true);
    try {
      await api.createScheduledPost({
        channel,
        channelAccountId,
        caption: caption.trim(),
        mediaUrl: mediaUrl.trim() || null,
        targetChatId: channel === 'TELEGRAM' ? targetChatId.trim() : null,
        scheduledAt: publishMode === 'SCHEDULED' ? new Date(scheduledAt).toISOString() : null,
        publishNow: publishMode === 'NOW',
      });
      toast.success(
        publishMode === 'NOW'
          ? 'Postingan berhasil diterbitkan ke kanal'
          : 'Postingan berhasil dijadwalkan'
      );
      setCaption('');
      setMediaUrl('');
      setScheduledAt('');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menjadwalkan postingan');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePublishNow = async (id: string) => {
    setBusyId(id);
    try {
      await api.publishScheduledPostNow(id);
      toast.success('Postingan berhasil diterbitkan');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menerbitkan postingan');
      loadData();
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (id: string) => {
    setBusyId(id);
    try {
      await api.cancelScheduledPost(id);
      toast.info('Jadwal postingan dibatalkan');
      loadData();
    } catch {
      toast.error('Gagal membatalkan jadwal');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      await api.deleteScheduledPost(id);
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch {
      toast.error('Gagal menghapus postingan');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Jadwal Postingan Kanal</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Jadwalkan atau terbitkan langsung konten ke Instagram Feed, Facebook Page, Threads, dan Channel Telegram.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowCsvModal(true)}
            leftIcon={<Upload className="w-3.5 h-3.5" />}
          >
            Impor CSV
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={loadData}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Segarkan
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Create / Schedule Form */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 bg-white rounded-lg border border-gray-200 p-5 space-y-4 h-fit"
        >
          <div className="pb-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-indigo-600" />
              <span>Buat Postingan Baru</span>
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {(['INSTAGRAM', 'FACEBOOK', 'THREADS', 'TELEGRAM'] as PostChannel[]).map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => handleChannelChange(ch)}
                className={`px-3 py-2 rounded-md border text-xs font-medium text-left transition-colors ${
                  channel === ch
                    ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {POST_CHANNEL_META[ch].label}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Akun Kanal Terhubung
            </label>
            {matchingAccounts.length === 0 ? (
              <div className="p-2.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                Belum ada akun {POST_CHANNEL_META[channel].label} aktif. Tambahkan di menu Integrasi &amp; Kanal → Omnichannel.
              </div>
            ) : (
              <select
                value={channelAccountId}
                onChange={(e) => setChannelAccountId(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
              >
                {matchingAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.accountId})
                  </option>
                ))}
              </select>
            )}
          </div>

          {channel === 'TELEGRAM' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Target Channel / Group ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="@channel_anda atau -100123456789"
                value={targetChatId}
                onChange={(e) => setTargetChatId(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-700">
                URL Gambar / Media Publik{' '}
                {channel === 'INSTAGRAM' ? (
                  <span className="text-red-500">*</span>
                ) : (
                  <span className="text-gray-400">(opsional)</span>
                )}
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/mp4"
                onChange={handleUploadImage}
                className="hidden"
              />
              <button
                type="button"
                disabled={uploadingMedia}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
              >
                <Upload className="w-3 h-3" />
                {uploadingMedia ? 'Mengunggah...' : 'Upload Gambar'}
              </button>
            </div>
            <div className="relative">
              <ImageIcon className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="url"
                placeholder="https://domain.com/banner-promo.jpg atau klik Upload Gambar"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                className="w-full h-9 pl-8 pr-3 bg-white border border-gray-200 rounded-md text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            {mediaUrl.trim() && /^https?:\/\//i.test(mediaUrl.trim()) && (
              <img
                src={mediaUrl.trim()}
                alt="Pratinjau media"
                className="mt-2 w-full max-h-40 object-cover rounded-md border border-gray-200"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Caption / Isi Postingan <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={4}
              required
              placeholder="Tulis caption postingan Anda..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full p-3 bg-white border border-gray-200 rounded-md text-[13px] leading-relaxed focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPublishMode('SCHEDULED')}
              className={`h-9 px-3 rounded-md border text-xs font-medium flex items-center justify-center gap-1.5 ${
                publishMode === 'SCHEDULED'
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Jadwalkan
            </button>
            <button
              type="button"
              onClick={() => setPublishMode('NOW')}
              className={`h-9 px-3 rounded-md border text-xs font-medium flex items-center justify-center gap-1.5 ${
                publishMode === 'NOW'
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              Terbitkan Sekarang
            </button>
          </div>

          {publishMode === 'SCHEDULED' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Waktu Terbit <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                required
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            isLoading={submitting}
            disabled={matchingAccounts.length === 0}
            className="w-full"
            leftIcon={publishMode === 'NOW' ? <Send className="w-4 h-4" /> : <CalendarClock className="w-4 h-4" />}
          >
            {publishMode === 'NOW' ? 'Terbitkan Postingan' : 'Simpan Jadwal Postingan'}
          </Button>
        </form>

        {/* Queue / History / Calendar */}
        <div className="lg:col-span-7 bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-200 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-900">
                Antrean &amp; Riwayat Postingan ({posts.length})
              </h2>
              <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium ${
                    viewMode === 'list' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  Daftar
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('calendar')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium ${
                    viewMode === 'calendar' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600'
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  Kalender
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterChannel}
                onChange={(e) => setFilterChannel(e.target.value as any)}
                className="h-8 px-2.5 bg-white border border-gray-200 rounded text-xs text-gray-700"
              >
                <option value="ALL">Semua Channel</option>
                <option value="INSTAGRAM">Instagram Feed</option>
                <option value="FACEBOOK">Facebook Page</option>
                <option value="THREADS">Threads</option>
                <option value="TELEGRAM">Telegram Channel</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="h-8 px-2.5 bg-white border border-gray-200 rounded text-xs text-gray-700"
              >
                <option value="ALL">Semua Status</option>
                <option value="SCHEDULED">Terjadwal</option>
                <option value="PUBLISHED">Terbit</option>
                <option value="FAILED">Gagal</option>
                <option value="CANCELLED">Dibatalkan</option>
              </select>
            </div>
          </div>

          {(() => {
            const filteredPosts = posts.filter((p) => {
              if (filterChannel !== 'ALL' && p.channel !== filterChannel) return false;
              if (filterStatus !== 'ALL' && p.status !== filterStatus) return false;
              return true;
            });

            if (loading) return <LoadingState message="Memuat daftar postingan..." />;
            if (filteredPosts.length === 0 && viewMode === 'list') {
              return (
                <EmptyState
                  title="Belum ada jadwal postingan"
                  description="Buat postingan terjadwal untuk Instagram, Facebook, Threads, atau Channel Telegram di formulir sebelah kiri."
                />
              );
            }

            if (viewMode === 'calendar') {
              const year = calendarMonth.getFullYear();
              const month = calendarMonth.getMonth();
              const firstDay = new Date(year, month, 1).getDay();
              const daysInMonth = new Date(year, month + 1, 0).getDate();

              const startOfWeek = new Date(calendarMonth);
              startOfWeek.setDate(calendarMonth.getDate() - calendarMonth.getDay());
              const weekDates = Array.from({ length: 7 }, (_, i) => {
                const d = new Date(startOfWeek);
                d.setDate(startOfWeek.getDate() + i);
                return d;
              });

              const monthCells: Array<Date | null> = [
                ...Array(firstDay).fill(null),
                ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
              ];
              const activeCells = calendarGranularity === 'week' ? weekDates : monthCells;

              const handlePrev = () => {
                if (calendarGranularity === 'week') {
                  const d = new Date(calendarMonth);
                  d.setDate(d.getDate() - 7);
                  setCalendarMonth(d);
                } else {
                  setCalendarMonth(new Date(year, month - 1, 1));
                }
              };

              const handleNext = () => {
                if (calendarGranularity === 'week') {
                  const d = new Date(calendarMonth);
                  d.setDate(d.getDate() + 7);
                  setCalendarMonth(d);
                } else {
                  setCalendarMonth(new Date(year, month + 1, 1));
                }
              };

              return (
                <div className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-800">
                      {calendarGranularity === 'week'
                        ? `${weekDates[0].toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} – ${weekDates[6].toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`
                        : calendarMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="inline-flex rounded border border-gray-200 bg-gray-50 p-0.5">
                        <button
                          type="button"
                          onClick={() => setCalendarGranularity('month')}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                            calendarGranularity === 'month'
                              ? 'bg-white text-indigo-700 shadow-sm'
                              : 'text-gray-600'
                          }`}
                        >
                          Bulan
                        </button>
                        <button
                          type="button"
                          onClick={() => setCalendarGranularity('week')}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                            calendarGranularity === 'week'
                              ? 'bg-white text-indigo-700 shadow-sm'
                              : 'text-gray-600'
                          }`}
                        >
                          Minggu
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={handlePrev}
                          className="p-1 rounded border border-gray-200 hover:bg-gray-50"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={handleNext}
                          className="p-1 rounded border border-gray-200 hover:bg-gray-50"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-gray-500">
                    {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map((d) => (
                      <div key={d} className="py-1">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {activeCells.map((cellDate, idx) => {
                      if (!cellDate) {
                        return <div key={`empty-${idx}`} className="min-h-[68px] rounded bg-gray-50/50" />;
                      }
                      const dayPosts = filteredPosts.filter((p) => {
                        const pd = new Date(p.scheduledAt);
                        return (
                          pd.getFullYear() === cellDate.getFullYear() &&
                          pd.getMonth() === cellDate.getMonth() &&
                          pd.getDate() === cellDate.getDate()
                        );
                      });
                      const visiblePosts = calendarGranularity === 'week' ? dayPosts : dayPosts.slice(0, 2);
                      return (
                        <div
                          key={cellDate.toISOString()}
                          className={`${calendarGranularity === 'week' ? 'min-h-[160px]' : 'min-h-[68px]'} p-1.5 rounded border border-gray-200 bg-white flex flex-col gap-1`}
                        >
                          <span className="text-[10px] font-mono font-semibold text-gray-500">
                            {cellDate.getDate()}
                          </span>
                          {visiblePosts.map((dp) => (
                            <button
                              key={dp.id}
                              type="button"
                              onClick={() => setViewMode('list')}
                              title={`${dp.channel}: ${dp.caption}`}
                              className={`w-full text-left px-1 py-0.5 rounded text-[9px] font-medium truncate border ${
                                POST_CHANNEL_META[dp.channel]?.badgeCls || 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {new Date(dp.scheduledAt).toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}{' '}
                              {dp.channel.slice(0, 2)}
                            </button>
                          ))}
                          {calendarGranularity === 'month' && dayPosts.length > 2 && (
                            <span className="text-[9px] text-gray-400">+{dayPosts.length - 2} lagi</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            return (
              <div className="divide-y divide-gray-200">
                {filteredPosts.map((post) => {
                  const meta = POST_CHANNEL_META[post.channel] || POST_CHANNEL_META.INSTAGRAM;
                  return (
                    <div key={post.id} className="p-4 space-y-2 hover:bg-gray-50/50">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-center flex-wrap gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${meta.badgeCls}`}>
                            {meta.label}
                          </span>
                          {post.accountName && (
                            <span className="text-[11px] font-medium text-gray-700">
                              {post.accountName}
                            </span>
                          )}
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                              post.status === 'PUBLISHED'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : post.status === 'FAILED'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : post.status === 'CANCELLED'
                                ? 'bg-gray-100 text-gray-600 border-gray-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}
                          >
                            {post.status === 'PUBLISHED' && <CheckCircle2 className="w-3 h-3" />}
                            {post.status === 'FAILED' && <AlertTriangle className="w-3 h-3" />}
                            {post.status}
                          </span>
                        </div>

                        <span className="text-[11px] font-mono text-gray-500">
                          {new Date(post.scheduledAt).toLocaleString('id-ID')}
                        </span>
                      </div>

                      <div className="flex items-start gap-3">
                        {post.mediaUrl && (
                          <img
                            src={post.mediaUrl}
                            alt="Media postingan"
                            className="w-14 h-14 rounded object-cover border border-gray-200 shrink-0"
                          />
                        )}
                        <p className="text-xs text-gray-800 whitespace-pre-wrap flex-1 line-clamp-3">
                          {post.caption}
                        </p>
                      </div>

                      {post.errorMessage && (
                        <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2.5 py-1.5">
                          {post.errorMessage}
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        {(post.status === 'SCHEDULED' || post.status === 'FAILED') && (
                          <Button
                            variant="secondary"
                            size="sm"
                            isLoading={busyId === post.id}
                            onClick={() => handlePublishNow(post.id)}
                            leftIcon={<Send className="w-3 h-3" />}
                          >
                            Terbitkan Sekarang
                          </Button>
                        )}
                        {post.status === 'SCHEDULED' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyId === post.id}
                            onClick={() => handleCancel(post.id)}
                            leftIcon={<XCircle className="w-3.5 h-3.5 text-amber-600" />}
                          >
                            Batalkan
                          </Button>
                        )}
                        <button
                          type="button"
                          disabled={busyId === post.id}
                          onClick={() => handleDelete(post.id)}
                          className="p-1.5 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50"
                          title="Hapus"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

      {showCsvModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-gray-200 max-w-xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Impor Jadwal Postingan (CSV)</h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Format kolom: <code className="font-mono">channel,caption,scheduledAt,mediaUrl,targetChatId</code>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCsvModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={csvFileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => setCsvText(String(reader.result || ''));
                  reader.readAsText(file);
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => csvFileRef.current?.click()}
                leftIcon={<Upload className="w-3.5 h-3.5" />}
              >
                Pilih File CSV
              </Button>
            </div>

            <textarea
              rows={6}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-md text-xs font-mono focus:outline-none focus:border-indigo-500"
            />

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowCsvModal(false)}>
                Batal
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                isLoading={importingCsv}
                onClick={async () => {
                  const lines = csvText
                    .split(/\r?\n/)
                    .map((l) => l.trim())
                    .filter(Boolean);
                  if (lines.length < 2) {
                    toast.error('CSV minimal berisi header dan 1 baris data');
                    return;
                  }
                  const dataRows = lines.slice(1).map((line) => {
                    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
                    return {
                      channel: cols[0] || '',
                      caption: cols[1] || '',
                      scheduledAt: cols[2] || undefined,
                      mediaUrl: cols[3] || null,
                      targetChatId: cols[4] || null,
                    };
                  });
                  setImportingCsv(true);
                  try {
                    const result = await api.importScheduledPosts(dataRows);
                    toast.success(`${result.imported} postingan berhasil dijadwalkan`);
                    if (result.failed.length > 0) {
                      toast.error(`${result.failed.length} baris gagal diimpor`);
                    }
                    setShowCsvModal(false);
                    loadData();
                  } catch (err: any) {
                    toast.error(err.response?.data?.error || 'Gagal mengimpor CSV');
                  } finally {
                    setImportingCsv(false);
                  }
                }}
              >
                Impor &amp; Jadwalkan
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduledPosts;
