import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Send,
  Trash2,
  XCircle,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Upload,
  List,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  Users,
  RefreshCw,
  Smartphone,
  Video,
  Mic,
  Type as TypeIcon,
  Plus,
  FolderOpen,
} from 'lucide-react';
import api from '../services/api';
import { subscribeLiveEvent } from '../services/liveEvents';
import { hasPerm } from '../lib/permissions';
import {
  MediaLibraryPickerModal,
  resolveCrmMediaUrl,
} from '../components/ui/MediaLibraryPickerModal';
import {
  AuthStatus,
  ChannelAccount,
  Contact,
  ScheduledPostChannel,
  ScheduledPostItem,
  ScheduledPostType,
  ScheduledPostViewersResponse,
  WahaSessionItem,
} from '../types';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/ToastProvider';
import { LoadingState, EmptyState } from '../components/ui/StateBlocks';
import { TablePagination } from '../components/ui/Pagination';

type PostChannel = ScheduledPostChannel;

interface ScheduledPostsProps {
  currentUser?: AuthStatus['user'] | null;
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
  WHATSAPP_STATUS: { label: 'WhatsApp Story', badgeCls: 'bg-teal-50 text-teal-700 border-teal-200' },
  WHATSAPP: { label: 'Post WhatsApp', badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const STORY_BG_COLORS = [
  '#38b42f',
  '#0f766e',
  '#1d4ed8',
  '#6d28d9',
  '#be123c',
  '#b45309',
  '#1e293b',
];

const STORY_TYPE_LABELS: Record<ScheduledPostType, string> = {
  FEED: 'Feed',
  WA_POST: 'Post WA',
  STATUS_TEXT: 'Story Teks',
  STATUS_IMAGE: 'Story Gambar',
  STATUS_VIDEO: 'Story Video',
  STATUS_VOICE: 'Story Suara',
};

function isVideoMediaUrl(url: string): boolean {
  return /\.(mp4|mov|webm|avi|3gp)(\?|$)/i.test(url);
}

function isAudioMediaUrl(url: string): boolean {
  return /\.(mp3|ogg|wav|m4a|aac|opus)(\?|$)/i.test(url);
}

export const ScheduledPosts: React.FC<ScheduledPostsProps> = ({
  currentUser,
  prefill,
  onClearPrefill,
}) => {
  const toast = useToast();
  const canPublishPost = hasPerm(currentUser, 'broadcasts.send');
  const [posts, setPosts] = useState<ScheduledPostItem[]>([]);
  const [accounts, setAccounts] = useState<ChannelAccount[]>([]);
  const [wahaSessions, setWahaSessions] = useState<WahaSessionItem[]>([]);
  const [contactsList, setContactsList] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [channel, setChannel] = useState<PostChannel>('INSTAGRAM');
  const [channelAccountId, setChannelAccountId] = useState('');
  const [wahaSession, setWahaSession] = useState('');
  const [statusPostType, setStatusPostType] = useState<'STATUS_TEXT' | 'STATUS_IMAGE' | 'STATUS_VIDEO' | 'STATUS_VOICE'>('STATUS_TEXT');
  const [statusBgColor, setStatusBgColor] = useState('#38b42f');
  const [statusFont, setStatusFont] = useState<number>(1);
  const [targetAudienceMode, setTargetAudienceMode] = useState<'ALL' | 'SELECTED'>('ALL');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [caption, setCaption] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [targetChatId, setTargetChatId] = useState('');
  const [publishMode, setPublishMode] = useState<'SCHEDULED' | 'NOW'>('SCHEDULED');
  const [scheduledAt, setScheduledAt] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [showMediaPickerModal, setShowMediaPickerModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [viewersModal, setViewersModal] = useState<{
    post: ScheduledPostItem;
    loading: boolean;
    data: ScheduledPostViewersResponse | null;
  } | null>(null);

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
  const [listPage, setListPage] = useState(1);
  const [listLimit, setListLimit] = useState(25);
  const [listTotal, setListTotal] = useState(0);
  const [listTotalPages, setListTotalPages] = useState(1);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  });
  const [showMobileComposer, setShowMobileComposer] = useState(() => Boolean(prefill));
  const [selectedCalendarDateKey, setSelectedCalendarDateKey] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
          mimeType: file.type || 'application/octet-stream',
          base64: result,
        });
        setMediaUrl(uploaded.url);
        toast.success('Media berhasil diunggah');
      } catch (err: any) {
        toast.error(err.response?.data?.error || 'Gagal mengunggah media');
      } finally {
        setUploadingMedia(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const loadData = useCallback(async () => {
    try {
      const postPromise =
        viewMode === 'list'
          ? api.getScheduledPostsPaged({
              channel: filterChannel !== 'ALL' ? filterChannel : undefined,
              status: filterStatus !== 'ALL' ? filterStatus : undefined,
              page: listPage,
              limit: listLimit,
            })
          : api
              .getScheduledPosts({
                channel: filterChannel !== 'ALL' ? filterChannel : undefined,
                status: filterStatus !== 'ALL' ? filterStatus : undefined,
                limit: 500,
              })
              .then((list) => ({
                data: list,
                pagination: { page: 1, limit: 500, total: list.length, totalPages: 1 },
              }));

      const [postRes, accList, sessionRes, contactRes] = await Promise.all([
        postPromise,
        api.getChannels(),
        api.getWahaSessions().catch(() => ({ sessions: [], activeSession: '' })),
        api.getContacts({ limit: 10000 }).catch(() => ({ data: [] })),
      ]);
      setPosts(postRes.data || []);
      setListTotal(postRes.pagination?.total ?? (postRes.data || []).length);
      setListTotalPages(postRes.pagination?.totalPages ?? 1);
      if (
        viewMode === 'list' &&
        (postRes.data || []).length === 0 &&
        listPage > 1 &&
        postRes.pagination &&
        postRes.pagination.total > 0
      ) {
        setListPage(Math.max(1, postRes.pagination.totalPages));
      }
      setAccounts(accList || []);
      const fetchedSessions = sessionRes?.sessions || [];
      setWahaSessions(fetchedSessions);
      const rawContacts = Array.isArray(contactRes) ? contactRes : contactRes?.data || [];
      setContactsList(rawContacts.filter((c: Contact) => Boolean(c.nomor_whatsapp)));
      setChannelAccountId((prev) => {
        if (prev) return prev;
        const first = (accList || []).find((a) => a.channel === channel && a.isActive);
        return first?.id || '';
      });
      setWahaSession((prev) => {
        if (prev && fetchedSessions.some((s) => s.name === prev)) return prev;
        const preferred =
          fetchedSessions.find((s) => s.name === sessionRes?.activeSession && s.status === 'WORKING') ||
          fetchedSessions.find((s) => s.status === 'WORKING') ||
          fetchedSessions[0];
        return preferred?.name || '';
      });
    } catch {
      // ignore initial error
    } finally {
      setLoading(false);
    }
  }, [channel, viewMode, filterChannel, filterStatus, listPage, listLimit]);

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

  const isWaChannel = channel === 'WHATSAPP' || channel === 'WHATSAPP_STATUS';
  const matchingAccounts = accounts.filter((a) => a.channel === channel && a.isActive);
  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return contactsList;
    return contactsList.filter(
      (c) =>
        c.nama_lengkap?.toLowerCase().includes(q) ||
        c.nomor_whatsapp?.toLowerCase().includes(q)
    );
  }, [contactsList, contactSearch]);

  const handleChannelChange = (nextCh: PostChannel) => {
    setChannel(nextCh);
    const first = accounts.find((a) => a.channel === nextCh && a.isActive);
    setChannelAccountId(first?.id || '');
    if (nextCh === 'WHATSAPP') {
      setTargetAudienceMode('SELECTED');
    } else if (nextCh === 'WHATSAPP_STATUS') {
      setTargetAudienceMode('ALL');
    }
  };

  const toggleContactSelection = (id: string) => {
    setSelectedContactIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isWaChannel) {
      if (wahaSessions.length === 0 || !wahaSession) {
        toast.error('Pilih sesi WhatsApp (WAHA) aktif terlebih dahulu');
        return;
      }
      if (channel === 'WHATSAPP_STATUS') {
        if (statusPostType === 'STATUS_TEXT' && !caption.trim()) {
          toast.error('Teks WhatsApp Story wajib diisi');
          return;
        }
        if (statusPostType !== 'STATUS_TEXT' && !mediaUrl.trim()) {
          toast.error('Upload atau isi URL media untuk WhatsApp Story ini');
          return;
        }
      } else {
        if (selectedContactIds.length === 0) {
          toast.error('Pilih minimal 1 kontak tujuan untuk Post WhatsApp');
          return;
        }
        if (!caption.trim() && !mediaUrl.trim()) {
          toast.error('Isi teks pesan atau unggah media untuk Post WhatsApp');
          return;
        }
      }
    } else {
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
    }
    if (publishMode === 'SCHEDULED' && !scheduledAt) {
      toast.error('Pilih tanggal dan jam jadwal postingan');
      return;
    }

    setSubmitting(true);
    try {
      const effectiveTargetIds =
        channel === 'WHATSAPP' || (channel === 'WHATSAPP_STATUS' && targetAudienceMode === 'SELECTED')
          ? selectedContactIds
          : [];
      await api.createScheduledPost({
        channel,
        channelAccountId: isWaChannel ? null : channelAccountId,
        wahaSession: isWaChannel ? wahaSession : null,
        postType:
          channel === 'WHATSAPP_STATUS'
            ? statusPostType
            : channel === 'WHATSAPP'
            ? 'WA_POST'
            : 'FEED',
        caption: caption.trim(),
        mediaUrl:
          channel === 'WHATSAPP_STATUS' && statusPostType === 'STATUS_TEXT'
            ? null
            : mediaUrl.trim() || null,
        targetChatId: channel === 'TELEGRAM' ? targetChatId.trim() : null,
        targetContactIds: effectiveTargetIds.length > 0 ? effectiveTargetIds : undefined,
        statusStyle:
          channel === 'WHATSAPP_STATUS' && statusPostType === 'STATUS_TEXT'
            ? { backgroundColor: statusBgColor, font: statusFont }
            : null,
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

  const handleOpenViewers = async (post: ScheduledPostItem, sync = true) => {
    setViewersModal({ post, loading: true, data: null });
    try {
      const data = await api.getScheduledPostViewers(post.id, sync);
      setViewersModal({ post: data.post || post, loading: false, data });
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, viewerCount: data.totalViewed } : p))
      );
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal memuat daftar penonton Story');
      setViewersModal((prev) => (prev ? { ...prev, loading: false } : null));
    }
  };

  const handleDeleteRemoteStatus = async (id: string) => {
    setBusyId(id);
    try {
      await api.deleteRemoteWhatsAppStatus(id);
      toast.success('WhatsApp Story berhasil ditarik/dihapus dari WhatsApp');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menghapus Story di WhatsApp');
    } finally {
      setBusyId(null);
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
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base sm:text-lg font-semibold text-gray-900">Jadwal Postingan Kanal</h1>
          <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5">
            Jadwalkan atau terbitkan konten ke Instagram, Facebook, Threads, Telegram, dan WhatsApp.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canPublishPost && (
            <Button
              variant={showMobileComposer ? 'secondary' : 'primary'}
              size="sm"
              onClick={() => setShowMobileComposer((v) => !v)}
              className="lg:hidden"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showMobileComposer ? 'Tutup Form' : 'Buat Postingan'}</span>
            </Button>
          )}
          {canPublishPost && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowCsvModal(true)}
            >
              Impor CSV
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={loadData}
          >
            Segarkan
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {/* Create / Schedule Form */}
        {canPublishPost && (
          <form
            onSubmit={handleSubmit}
            className={`${showMobileComposer ? 'block' : 'hidden lg:block'} lg:col-span-5 bg-white rounded-lg border border-gray-200 p-3.5 sm:p-5 space-y-3.5 sm:space-y-4 h-fit`}
          >
          <div className="pb-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">
              Buat Postingan Baru
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {(
              ['INSTAGRAM', 'FACEBOOK', 'THREADS', 'TELEGRAM', 'WHATSAPP_STATUS', 'WHATSAPP'] as PostChannel[]
            ).map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => handleChannelChange(ch)}
                className={`px-2.5 py-2 rounded-md border text-xs font-medium text-left transition-colors ${
                  channel === ch
                    ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {POST_CHANNEL_META[ch].label}
              </button>
            ))}
          </div>

          {isWaChannel ? (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Sesi / Nomor WhatsApp Pengirim (WAHA)
              </label>
              {wahaSessions.length === 0 ? (
                <div className="p-2.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                  Belum ada sesi WhatsApp WAHA aktif. Hubungkan sesi di menu Integrasi &amp; Kanal → WhatsApp.
                </div>
              ) : (
                <select
                  value={wahaSession}
                  onChange={(e) => setWahaSession(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs font-mono focus:outline-none focus:border-indigo-500"
                >
                  {wahaSessions.map((sess) => (
                    <option key={sess.name} value={sess.name}>
                      {sess.name} ({sess.status}){sess.me?.pushName ? ` — ${sess.me.pushName}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
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
          )}

          {channel === 'WHATSAPP_STATUS' && (
            <div className="space-y-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Jenis WhatsApp Story
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {(
                    [
                      { id: 'STATUS_TEXT', label: 'Teks', icon: TypeIcon },
                      { id: 'STATUS_IMAGE', label: 'Gambar', icon: ImageIcon },
                      { id: 'STATUS_VIDEO', label: 'Video', icon: Video },
                      { id: 'STATUS_VOICE', label: 'Suara', icon: Mic },
                    ] as const
                  ).map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setStatusPostType(item.id)}
                        className={`px-2 py-1.5 rounded border text-xs font-medium flex items-center justify-center gap-1 ${
                          statusPostType === item.id
                            ? 'border-teal-600 bg-teal-50 text-teal-800'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {statusPostType === 'STATUS_TEXT' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-gray-600">Warna Latar Story</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {STORY_BG_COLORS.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => setStatusBgColor(hex)}
                          aria-label={`Pilih warna ${hex}`}
                          style={{ backgroundColor: hex }}
                          className={`w-5 h-5 rounded-full border-2 transition-transform ${
                            statusBgColor === hex ? 'border-gray-900 scale-110' : 'border-white'
                          }`}
                        />
                      ))}
                      <input
                        type="color"
                        value={statusBgColor}
                        onChange={(e) => setStatusBgColor(e.target.value)}
                        className="w-6 h-5 p-0 border border-gray-300 rounded cursor-pointer"
                        title="Pilih warna kustom"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-gray-600">Gaya Font</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3].map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setStatusFont(f)}
                          className={`px-2 py-0.5 rounded text-[11px] border ${
                            statusFont === f
                              ? 'border-teal-600 bg-teal-50 text-teal-800 font-semibold'
                              : 'border-gray-200 bg-white text-gray-600'
                          }`}
                        >
                          Font {f}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div
                    style={{ backgroundColor: statusBgColor }}
                    className={`rounded-md px-4 py-5 text-center text-white min-h-[76px] flex items-center justify-center shadow-inner ${
                      statusFont === 2 ? 'font-bold text-sm' : statusFont === 3 ? 'font-serif text-sm' : 'font-sans text-[13px]'
                    }`}
                  >
                    <span className="whitespace-pre-wrap break-words">
                      {caption.trim() || 'Pratinjau teks WhatsApp Story Anda...'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {isWaChannel && (
            <div className="space-y-2 p-3 rounded-lg bg-gray-50 border border-gray-200">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-gray-500" />
                  <span>
                    {channel === 'WHATSAPP' ? 'Kontak Tujuan Pengiriman' : 'Target Penonton Story'}
                  </span>
                  {channel === 'WHATSAPP' && <span className="text-red-500">*</span>}
                </label>
                {selectedContactIds.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-800">
                    {selectedContactIds.length} dipilih
                  </span>
                )}
              </div>

              {channel === 'WHATSAPP_STATUS' && (
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTargetAudienceMode('ALL')}
                    className={`px-2.5 py-1.5 rounded border text-xs font-medium ${
                      targetAudienceMode === 'ALL'
                        ? 'border-teal-600 bg-teal-50 text-teal-800'
                        : 'border-gray-200 bg-white text-gray-600'
                    }`}
                  >
                    Semua Kontak
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetAudienceMode('SELECTED')}
                    className={`px-2.5 py-1.5 rounded border text-xs font-medium ${
                      targetAudienceMode === 'SELECTED'
                        ? 'border-teal-600 bg-teal-50 text-teal-800'
                        : 'border-gray-200 bg-white text-gray-600'
                    }`}
                  >
                    Pilih Kontak Tertentu
                  </button>
                </div>
              )}

              {(channel === 'WHATSAPP' || targetAudienceMode === 'SELECTED') && (
                <div className="space-y-2 pt-1">
                  {channel === 'WHATSAPP_STATUS' && (
                    <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      Filter kontak Story didukung oleh engine GOWS / NOWEB (untuk engine WEBJS pilih Semua Kontak).
                    </p>
                  )}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      placeholder="Cari nama atau nomor WA..."
                      className="flex-1 h-8 px-2.5 bg-white border border-gray-200 rounded text-xs focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const visibleIds = filteredContacts.map((c) => c.id);
                        setSelectedContactIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
                      }}
                      className="px-2 py-1 text-[11px] font-medium rounded border border-gray-200 bg-white text-gray-700 hover:bg-gray-100"
                    >
                      Pilih Semua
                    </button>
                    {selectedContactIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedContactIds([])}
                        className="px-2 py-1 text-[11px] font-medium rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-100"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <div className="max-h-40 overflow-y-auto bg-white border border-gray-200 rounded divide-y divide-gray-100">
                    {filteredContacts.length === 0 ? (
                      <div className="p-3 text-center text-[11px] text-gray-400">
                        Tidak ada kontak dengan nomor WhatsApp yang cocok.
                      </div>
                    ) : (
                      filteredContacts.map((c) => {
                        const checked = selectedContactIds.includes(c.id);
                        return (
                          <label
                            key={c.id}
                            className={`flex items-center gap-2 px-2.5 py-1.5 cursor-pointer text-xs hover:bg-gray-50 ${
                              checked ? 'bg-indigo-50/40' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleContactSelection(c.id)}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="font-medium text-gray-800 truncate flex-1">
                              {c.nama_lengkap}
                            </span>
                            <span className="text-[11px] font-mono text-gray-500 shrink-0">
                              +{c.nomor_whatsapp}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

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

          {!(channel === 'WHATSAPP_STATUS' && statusPostType === 'STATUS_TEXT') && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-xs font-medium text-gray-700">
                  URL Media / File{' '}
                  {channel === 'INSTAGRAM' || (channel === 'WHATSAPP_STATUS' && statusPostType !== 'STATUS_TEXT') ? (
                    <span className="text-red-500">*</span>
                  ) : (
                    <span className="text-gray-400">(opsional)</span>
                  )}
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={
                    channel === 'WHATSAPP_STATUS' && statusPostType === 'STATUS_VOICE'
                      ? 'audio/*'
                      : channel === 'WHATSAPP_STATUS' && statusPostType === 'STATUS_VIDEO'
                      ? 'video/*'
                      : 'image/*,video/*,audio/*'
                  }
                  onChange={handleUploadImage}
                  className="hidden"
                />
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowMediaPickerModal(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer"
                  >
                    <FolderOpen className="w-3 h-3" />
                    <span>Pilih dari Pustaka</span>
                  </button>
                  <button
                    type="button"
                    disabled={uploadingMedia}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700 cursor-pointer"
                  >
                    <Upload className="w-3 h-3" />
                    <span>{uploadingMedia ? 'Mengunggah...' : 'Upload Media'}</span>
                  </button>
                </div>
              </div>
              <div className="relative">
                <ImageIcon className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="url"
                  placeholder="https://domain.com/media.jpg, Upload Media, atau Pilih dari Pustaka"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  className="w-full h-9 pl-8 pr-3 bg-white border border-gray-200 rounded-md text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
              {mediaUrl.trim() && isVideoMediaUrl(mediaUrl.trim()) ? (
                <video
                  src={resolveCrmMediaUrl(mediaUrl.trim())}
                  controls
                  className="mt-2 w-full max-h-44 rounded-md border border-gray-200 bg-black"
                />
              ) : mediaUrl.trim() && isAudioMediaUrl(mediaUrl.trim()) ? (
                <audio src={resolveCrmMediaUrl(mediaUrl.trim())} controls className="mt-2 w-full" />
              ) : (
                mediaUrl.trim() &&
                (/^https?:\/\//i.test(mediaUrl.trim()) || mediaUrl.trim().startsWith('/')) && (
                  <img
                    src={resolveCrmMediaUrl(mediaUrl.trim())}
                    alt="Pratinjau media"
                    className="mt-2 w-full max-h-40 object-cover rounded-md border border-gray-200"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {channel === 'WHATSAPP_STATUS' && statusPostType === 'STATUS_TEXT'
                ? 'Teks WhatsApp Story'
                : channel === 'WHATSAPP_STATUS' && statusPostType === 'STATUS_VOICE'
                ? 'Label / Catatan Internal Story (opsional)'
                : 'Caption / Isi Postingan'}{' '}
              {!(isWaChannel && (mediaUrl.trim() || statusPostType === 'STATUS_VOICE')) && (
                <span className="text-red-500">*</span>
              )}
            </label>
            <textarea
              rows={4}
              placeholder={
                channel === 'WHATSAPP_STATUS'
                  ? 'Tulis teks Story atau caption media...'
                  : 'Tulis caption postingan Anda...'
              }
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
            disabled={isWaChannel ? wahaSessions.length === 0 : matchingAccounts.length === 0}
            className="w-full"
          >
            {publishMode === 'NOW' ? 'Terbitkan Postingan' : 'Simpan Jadwal Postingan'}
          </Button>
        </form>
        )}

        {/* Queue / History / Calendar */}
        <div className={`${canPublishPost ? 'lg:col-span-7' : 'lg:col-span-12'} bg-white rounded-lg border border-gray-200 overflow-hidden`}>
          <div className="px-3.5 sm:px-5 py-3 sm:py-3.5 border-b border-gray-200 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-900">
                Antrean &amp; Riwayat Postingan ({viewMode === 'list' ? listTotal : posts.length})
              </h2>
              <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('list');
                    setListPage(1);
                  }}
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

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2">
              <select
                value={filterChannel}
                onChange={(e) => {
                  setFilterChannel(e.target.value as any);
                  setListPage(1);
                }}
                className="w-full sm:w-auto h-8 px-2.5 bg-white border border-gray-200 rounded text-xs text-gray-700"
              >
                <option value="ALL">Semua Channel</option>
                <option value="WHATSAPP_STATUS">WhatsApp Story</option>
                <option value="WHATSAPP">Post WhatsApp</option>
                <option value="INSTAGRAM">Instagram Feed</option>
                <option value="FACEBOOK">Facebook Page</option>
                <option value="THREADS">Threads</option>
                <option value="TELEGRAM">Telegram Channel</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value as any);
                  setListPage(1);
                }}
                className="w-full sm:w-auto h-8 px-2.5 bg-white border border-gray-200 rounded text-xs text-gray-700"
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
                  description="Buat postingan atau WhatsApp Story terjadwal melalui formulir di sebelah kiri."
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
                <div className="p-3 sm:p-4 space-y-3">
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

                  {/* Mobile Compact Tap-Date Calendar + Agenda */}
                  <div className="sm:hidden space-y-3">
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-gray-500">
                      {['M', 'S', 'S', 'R', 'K', 'J', 'S'].map((d, i) => (
                        <div key={`${d}-${i}`} className="py-1">{d}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {activeCells.map((cellDate, idx) => {
                        if (!cellDate) {
                          return <div key={`m-empty-${idx}`} className="h-11 rounded bg-gray-50/50" />;
                        }
                        const dateKey = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, '0')}-${String(cellDate.getDate()).padStart(2, '0')}`;
                        const dayPosts = filteredPosts.filter((p) => {
                          const pd = new Date(p.scheduledAt);
                          return (
                            pd.getFullYear() === cellDate.getFullYear() &&
                            pd.getMonth() === cellDate.getMonth() &&
                            pd.getDate() === cellDate.getDate()
                          );
                        });
                        const isPicked = selectedCalendarDateKey === dateKey;
                        return (
                          <button
                            key={dateKey}
                            type="button"
                            onClick={() => setSelectedCalendarDateKey(dateKey)}
                            className={`h-11 rounded border flex flex-col items-center justify-center gap-0.5 transition-colors ${
                              isPicked
                                ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                                : 'border-gray-200 bg-white text-gray-800'
                            }`}
                          >
                            <span className="text-[11px] font-mono font-semibold leading-none">
                              {cellDate.getDate()}
                            </span>
                            {dayPosts.length > 0 && (
                              <span className="px-1 rounded-full bg-indigo-600 text-white text-[9px] font-mono leading-tight">
                                {dayPosts.length}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {(() => {
                      const pickedPosts = filteredPosts.filter((p) => {
                        const pd = new Date(p.scheduledAt);
                        const k = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}-${String(pd.getDate()).padStart(2, '0')}`;
                        return k === selectedCalendarDateKey;
                      });
                      return (
                        <div className="border border-gray-200 rounded-md bg-gray-50/70 p-2.5 space-y-2">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-gray-800">
                              Jadwal {new Date(`${selectedCalendarDateKey}T00:00:00`).toLocaleDateString('id-ID', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'short',
                              })}
                            </span>
                            <span className="font-mono text-gray-500">{pickedPosts.length} item</span>
                          </div>
                          {pickedPosts.length === 0 ? (
                            <p className="text-[11px] text-gray-400 py-2 text-center">
                              Tidak ada postingan terjadwal di tanggal ini.
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              {pickedPosts.map((dp) => (
                                <button
                                  key={dp.id}
                                  type="button"
                                  onClick={() => setViewMode('list')}
                                  className="w-full text-left p-2 rounded border border-gray-200 bg-white space-y-1"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${
                                        POST_CHANNEL_META[dp.channel]?.badgeCls || 'bg-gray-100 text-gray-700'
                                      }`}
                                    >
                                      {POST_CHANNEL_META[dp.channel]?.label || dp.channel}
                                    </span>
                                    <span className="text-[10px] font-mono text-gray-500">
                                      {new Date(dp.scheduledAt).toLocaleTimeString('id-ID', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-gray-700 line-clamp-2">
                                    {dp.caption || '(Media / Status)'}
                                  </p>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Desktop Grid Calendar */}
                  <div className="hidden sm:block overflow-x-auto pb-1">
                    <div className="min-w-[560px] space-y-1">
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
                  </div>
                </div>
              );
            }

            return (
              <div className="divide-y divide-gray-200">
                {filteredPosts.map((post) => {
                  const meta = POST_CHANNEL_META[post.channel] || POST_CHANNEL_META.INSTAGRAM;
                  const targetCount = post.targetContacts?.length || 0;
                  const isWaStatus = post.channel === 'WHATSAPP_STATUS';
                  const isWaPost = post.channel === 'WHATSAPP';
                  const subTypeLabel = post.postType && post.postType !== 'FEED' && post.postType !== 'WA_POST'
                    ? STORY_TYPE_LABELS[post.postType]
                    : null;
                  return (
                    <div key={post.id} className="p-4 space-y-2 hover:bg-gray-50/50">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-center flex-wrap gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${meta.badgeCls}`}>
                            {meta.label}
                          </span>
                          {subTypeLabel && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700 border border-gray-200">
                              {subTypeLabel}
                            </span>
                          )}
                          {post.wahaSession ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <Smartphone className="w-2.5 h-2.5" />
                              {post.wahaSession}
                            </span>
                          ) : (
                            post.accountName && (
                              <span className="text-[11px] font-medium text-gray-700">
                                {post.accountName}
                              </span>
                            )
                          )}
                          {(isWaStatus || isWaPost) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <Users className="w-2.5 h-2.5" />
                              {targetCount > 0 ? `${targetCount} Kontak` : 'Semua Kontak'}
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
                        {post.mediaUrl ? (
                          isVideoMediaUrl(post.mediaUrl) ? (
                            <div className="w-14 h-14 rounded bg-slate-900 text-white flex items-center justify-center shrink-0">
                              <Video className="w-5 h-5" />
                            </div>
                          ) : isAudioMediaUrl(post.mediaUrl) ? (
                            <div className="w-14 h-14 rounded bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
                              <Mic className="w-5 h-5" />
                            </div>
                          ) : (
                            <img
                              src={resolveCrmMediaUrl(post.mediaUrl)}
                              alt="Media postingan"
                              className="w-14 h-14 rounded object-cover border border-gray-200 shrink-0"
                            />
                          )
                        ) : (
                          isWaStatus &&
                          post.postType === 'STATUS_TEXT' && (
                            <div
                              style={{ backgroundColor: post.statusStyle?.backgroundColor || '#38b42f' }}
                              className="w-14 h-14 rounded flex items-center justify-center text-white text-[10px] font-semibold p-1 text-center shrink-0 border border-black/10"
                            >
                              Story
                            </div>
                          )
                        )}
                        <p className="text-xs text-gray-800 whitespace-pre-wrap flex-1 line-clamp-3">
                          {post.caption || (isAudioMediaUrl(post.mediaUrl || '') ? 'Voice Story WhatsApp' : '(Media WhatsApp)')}
                        </p>
                      </div>

                      {post.errorMessage && (
                        <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2.5 py-1.5">
                          {post.errorMessage}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-2">
                          {isWaStatus && post.status === 'PUBLISHED' && (
                            <button
                              type="button"
                              onClick={() => void handleOpenViewers(post, true)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100 text-[11px] font-medium transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Penonton ({post.viewerCount ?? 0})</span>
                            </button>
                          )}
                        </div>

                        {canPublishPost && (
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {(post.status === 'SCHEDULED' || post.status === 'FAILED') && (
                              <Button
                                variant="secondary"
                                size="sm"
                                isLoading={busyId === post.id}
                                onClick={() => handlePublishNow(post.id)}
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
                              >
                                Batalkan
                              </Button>
                            )}
                            {isWaStatus && post.status === 'PUBLISHED' && post.externalPostId && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busyId === post.id}
                                onClick={() => void handleDeleteRemoteStatus(post.id)}
                              >
                                Tarik Story
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
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          {viewMode === 'list' && !loading && (
            <TablePagination
              page={listPage}
              limit={listLimit}
              total={listTotal}
              totalPages={listTotalPages}
              onPageChange={setListPage}
              onLimitChange={(nextLimit) => {
                setListLimit(nextLimit);
                setListPage(1);
              }}
              limitOptions={[10, 25, 50, 100]}
              itemLabel="postingan"
              loading={loading}
            />
          )}
        </div>
      </div>

      {viewersModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-2.5 sm:p-4">
          <div className="bg-white rounded-lg border border-gray-200 max-w-lg w-full p-4 sm:p-5 space-y-4 max-h-[90dvh] flex flex-col">
            <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-3 shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-teal-600" />
                  <span>Penonton WhatsApp Story</span>
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
                  {viewersModal.post.caption || 'Story WhatsApp'}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={viewersModal.loading}
                  onClick={() => void handleOpenViewers(viewersModal.post, true)}
                  title="Sinkronkan daftar penonton dari WAHA"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${viewersModal.loading ? 'animate-spin' : ''}`} />
                  <span>Segarkan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewersModal(null)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            </div>

            {viewersModal.loading ? (
              <LoadingState message="Mengambil data penonton Story dari WAHA..." />
            ) : (
              <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-md bg-teal-50 border border-teal-200">
                    <span className="text-[10px] font-medium text-teal-700 uppercase">Sudah Dilihat</span>
                    <p className="text-lg font-bold text-teal-900 tabular-nums">
                      {viewersModal.data?.totalViewed ?? 0}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-md bg-gray-50 border border-gray-200">
                    <span className="text-[10px] font-medium text-gray-500 uppercase">Total Tanda Terima</span>
                    <p className="text-lg font-bold text-gray-900 tabular-nums">
                      {viewersModal.data?.totalDelivered ?? 0}
                    </p>
                  </div>
                </div>

                {viewersModal.data?.syncError && (
                  <div className="p-2 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                    Catatan sinkronisasi WAHA: {viewersModal.data.syncError}. Penonton juga tercatat otomatis melalui webhook real-time saat Story dibuka.
                  </div>
                )}

                {viewersModal.data && viewersModal.data.targets.length > 0 && (
                  <div className="text-[11px] text-gray-600 bg-indigo-50/60 border border-indigo-100 rounded px-2.5 py-1.5">
                    Target khusus Story ini: <strong>{viewersModal.data.targets.length}</strong> kontak dipilih.
                  </div>
                )}

                {!viewersModal.data || viewersModal.data.viewers.length === 0 ? (
                  <EmptyState
                    title="Belum ada penonton tercatat"
                    description="Penonton akan muncul di sini secara otomatis saat kontak membuka WhatsApp Story Anda (webhook ack) atau klik Segarkan."
                  />
                ) : (
                  <div className="divide-y divide-gray-100 border border-gray-200 rounded-md">
                    {viewersModal.data.viewers.map((viewer) => (
                      <div
                        key={viewer.id}
                        className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate">
                            {viewer.viewerName ||
                              (viewer.viewerPhone ? `+${viewer.viewerPhone}` : viewer.viewerJid)}
                          </div>
                          <div className="text-[11px] font-mono text-gray-500 truncate">
                            {viewer.viewerPhone ? `+${viewer.viewerPhone}` : viewer.viewerJid}
                          </div>
                        </div>
                        <div className="text-right shrink-0 space-y-0.5">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              viewer.ackStatus >= 3
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-gray-100 text-gray-600 border border-gray-200'
                            }`}
                          >
                            {viewer.ackStatus >= 4
                              ? 'Diputar'
                              : viewer.ackStatus === 3
                              ? 'Dilihat'
                              : 'Terkirim'}
                          </span>
                          <div className="text-[10px] font-mono text-gray-400">
                            {new Date(viewer.viewedAt).toLocaleString('id-ID')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showCsvModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-2.5 sm:p-4">
          <div className="bg-white rounded-lg border border-gray-200 max-w-xl w-full p-4 sm:p-5 space-y-4 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Impor Jadwal Postingan (CSV)</h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Format kolom: <code className="font-mono">channel,caption,scheduledAt,mediaUrl,targetChatId</code>. Untuk <code className="font-mono">WHATSAPP</code> / <code className="font-mono">WHATSAPP_STATUS</code>, isi <code className="font-mono">targetChatId</code> dengan nomor WA (pisahkan <code className="font-mono">;</code>).
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

      <MediaLibraryPickerModal
        isOpen={showMediaPickerModal}
        onClose={() => setShowMediaPickerModal(false)}
        title="Pilih Media dari Pustaka"
        allowedKinds={
          channel === 'WHATSAPP_STATUS' && statusPostType === 'STATUS_VOICE'
            ? ['audio']
            : channel === 'WHATSAPP_STATUS' && statusPostType === 'STATUS_VIDEO'
            ? ['video']
            : ['image', 'video', 'audio']
        }
        defaultKind={
          channel === 'WHATSAPP_STATUS' && statusPostType === 'STATUS_VOICE'
            ? 'audio'
            : channel === 'WHATSAPP_STATUS' && statusPostType === 'STATUS_VIDEO'
            ? 'video'
            : 'all'
        }
        onConfirm={(picked) => {
          if (picked[0]) {
            setMediaUrl(picked[0].relativeUrl);
          }
        }}
      />
    </div>
  );
};

export default ScheduledPosts;
