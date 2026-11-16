import React, { useEffect, useState, useCallback } from 'react';
import {
  Send,
  Calendar,
  Clock,
  Eye,
  Sliders,
  Info,
  Check,
} from 'lucide-react';
import api from '../services/api';
import { subscribeLiveEvent } from '../services/liveEvents';
import {
  Campaign,
  ChannelAccount,
  Contact,
  CampaignRecipient,
  LicenseInfo,
  MessageTemplateItem,
  OmnichannelType,
  WahaSessionItem,
} from '../types';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useToast } from '../components/ui/ToastProvider';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/StateBlocks';

interface BroadcastsProps {
  initialContactIds?: string[];
  licenseInfo?: LicenseInfo | null;
}

export const Broadcasts: React.FC<BroadcastsProps> = ({ initialContactIds, licenseInfo }) => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [wahaSessions, setWahaSessions] = useState<WahaSessionItem[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [channel, setChannel] = useState<OmnichannelType>('WHATSAPP');
  const [channelAccounts, setChannelAccounts] = useState<ChannelAccount[]>([]);
  const [channelAccountId, setChannelAccountId] = useState<string>('');
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplateItem[]>([]);

  const [title, setTitle] = useState('');
  const [broadcastType, setBroadcastType] = useState<'IMMEDIATE' | 'SCHEDULED'>('IMMEDIATE');
  const [scheduledAt, setScheduledAt] = useState('');
  const [recipientMode, setRecipientMode] = useState<'ALL' | 'TAGS' | 'MANUAL'>('ALL');
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>(initialContactIds || []);
  const [messageTemplate, setMessageTemplate] = useState(
    'Halo {nama_panggilan}, kami ingin menginformasikan penawaran terbaru untuk Anda.'
  );

  const [delaySeconds, setDelaySeconds] = useState(5);
  const [intervalSeconds, setIntervalSeconds] = useState(30);
  const [batchSize, setBatchSize] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedCampaign, setSelectedCampaign] = useState<(Campaign & { recipients: CampaignRecipient[] }) | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadContactsAndTags = useCallback(async () => {
    try {
      const [res, tags] = await Promise.all([
        api.getContacts({ limit: 1000 }),
        api.getContactTags(),
      ]);
      setAllContacts(res.data);
      setAvailableTags(tags);
    } catch (err) {
      console.error('Failed to load contacts:', err);
    }
  }, []);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getCampaigns();
      setCampaigns(data);
      setHistoryError(null);
    } catch (err: any) {
      setHistoryError(err.response?.data?.error || err.message || 'Gagal memuat riwayat siaran');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContactsAndTags();
    loadCampaigns();
    api
      .getWahaSessions()
      .then((res) => {
        const list = res.sessions || [];
        setWahaSessions(list);
        const workingCount = list.filter((s) => s.status === 'WORKING').length;
        setSelectedSession(workingCount > 1 ? '__ALL_ACTIVE__' : res.activeSession || '');
      })
      .catch(() => {});
    api
      .getChannels()
      .then((list) => setChannelAccounts(list || []))
      .catch(() => {});
    api
      .getMessageTemplates({ activeOnly: true })
      .then((tpls) => setMessageTemplates(tpls || []))
      .catch(() => {});

    const unsub = subscribeLiveEvent('tracking:update', () => {
      void loadCampaigns();
    });
    return unsub;
  }, [loadContactsAndTags, loadCampaigns]);

  useEffect(() => {
    if (initialContactIds && initialContactIds.length > 0) {
      setRecipientMode('MANUAL');
      setSelectedContactIds(initialContactIds);
    }
  }, [initialContactIds]);

  const insertVariable = (variable: string) => {
    setMessageTemplate((prev) => prev + variable);
  };

  const sampleContact = allContacts.find((c) =>
    selectedContactIds.length > 0 ? selectedContactIds.includes(c.id) : true
  ) || {
    nama_lengkap: 'Budi Santoso',
    nama_panggilan: 'Budi',
    nomor_whatsapp: '628123456789',
    alamat: 'Jakarta Selatan',
  };

  const previewMessage = messageTemplate
    .replace(/{nama_lengkap}/gi, sampleContact.nama_lengkap)
    .replace(/{nama_panggilan}/gi, sampleContact.nama_panggilan || 'Budi')
    .replace(/{alamat}/gi, sampleContact.alamat || 'Alamat Anda')
    .replace(/{nomor_whatsapp}/gi, sampleContact.nomor_whatsapp);

  let targetCount = allContacts.length;
  if (recipientMode === 'MANUAL') {
    targetCount = selectedContactIds.length;
  } else if (recipientMode === 'TAGS' && selectedTag) {
    targetCount = allContacts.filter((c) => c.tags?.includes(selectedTag)).length;
  } else if (recipientMode === 'TAGS' && !selectedTag) {
    targetCount = 0;
  }

  const estimatedSeconds =
    targetCount * delaySeconds + Math.floor(targetCount / Math.max(1, batchSize)) * intervalSeconds;
  const estimatedMinutes = Math.ceil(estimatedSeconds / 60);

  const handleSubmitCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!title.trim() || !messageTemplate.trim()) {
      toast.warning('Judul dan pesan siaran wajib diisi.');
      return;
    }

    if (recipientMode === 'MANUAL' && selectedContactIds.length === 0) {
      toast.warning('Pilih minimal satu kontak pelanggan.');
      return;
    }

    if (recipientMode === 'TAGS' && !selectedTag) {
      toast.warning('Pilih tag segmen terlebih dahulu.');
      return;
    }

    if (broadcastType === 'SCHEDULED' && !scheduledAt) {
      toast.warning('Tentukan tanggal dan jam untuk siaran terjadwal.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createCampaign({
        title: title.trim(),
        messageTemplate,
        type: broadcastType,
        scheduledAt: broadcastType === 'SCHEDULED' ? scheduledAt : null,
        delaySeconds,
        intervalSeconds,
        batchSize,
        contactIds: recipientMode === 'MANUAL' ? selectedContactIds : undefined,
        filterTags: recipientMode === 'TAGS' && selectedTag ? [selectedTag] : undefined,
        channel,
        channelAccountId: channel === 'WHATSAPP' ? null : channelAccountId || null,
        sessionName: channel === 'WHATSAPP' ? selectedSession || undefined : undefined,
      });

      toast.success(
        broadcastType === 'SCHEDULED'
          ? 'Siaran berhasil dijadwalkan.'
          : 'Siaran langsung mulai diproses di antrean.'
      );

      setTitle('');
      setActiveTab('history');
      loadCampaigns();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Gagal membuat kampanye');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelTargetId || cancelling) return;
    setCancelling(true);
    try {
      await api.cancelCampaign(cancelTargetId);
      toast.info('Kampanye siaran dibatalkan.');
      setCancelTargetId(null);
      loadCampaigns();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal membatalkan kampanye');
    } finally {
      setCancelling(false);
    }
  };

  const handleOpenDetail = async (id: string) => {
    setLoadingDetail(true);
    setIsDetailOpen(true);
    setSelectedCampaign(null);
    try {
      const data = await api.getCampaign(id);
      setSelectedCampaign(data);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal memuat detail kampanye');
      setIsDetailOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Navigation Tabs */}
      <div className="flex border-b border-gray-200 gap-4 sm:gap-6 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('create')}
          className={`pb-3 text-[13px] font-semibold flex items-center gap-2 border-b-2 whitespace-nowrap shrink-0 transition-colors ${
            activeTab === 'create'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Send className="w-4 h-4 shrink-0" />
          <span>Buat Siaran Baru</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('history');
            loadCampaigns();
          }}
          className={`pb-3 text-[13px] font-semibold flex items-center gap-2 border-b-2 whitespace-nowrap shrink-0 transition-colors ${
            activeTab === 'history'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Clock className="w-4 h-4 shrink-0" />
          <span>Riwayat &amp; Progres Siaran</span>
        </button>
      </div>

      {activeTab === 'create' ? (
        <form onSubmit={handleSubmitCampaign} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            {/* 1. Type & Title */}
            <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
              <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs flex items-center justify-center font-bold">
                  1
                </span>
                <span>Tipe &amp; Judul Kampanye</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setBroadcastType('IMMEDIATE')}
                  className={`p-3.5 rounded-lg border text-left transition-colors ${
                    broadcastType === 'IMMEDIATE'
                      ? 'border-indigo-600 bg-indigo-50/40 text-gray-900'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs flex items-center gap-1.5 text-gray-900">
                      <Send className="w-3.5 h-3.5 text-indigo-600" /> Siaran Langsung
                    </span>
                    {broadcastType === 'IMMEDIATE' && <Check className="w-4 h-4 text-indigo-600" />}
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Kirim pesan segera secara berurutan dengan jeda pengiriman.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setBroadcastType('SCHEDULED')}
                  className={`p-3.5 rounded-lg border text-left transition-colors ${
                    broadcastType === 'SCHEDULED'
                      ? 'border-indigo-600 bg-indigo-50/40 text-gray-900'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs flex items-center gap-1.5 text-gray-900">
                      <Calendar className="w-3.5 h-3.5 text-blue-600" /> Siaran Terjadwal
                    </span>
                    {broadcastType === 'SCHEDULED' && <Check className="w-4 h-4 text-indigo-600" />}
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Tentukan tanggal dan jam tertentu untuk pengiriman otomatis.
                  </p>
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Judul Kampanye <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Promo Akhir Bulan / Pengumuman Layanan"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] focus:outline-none focus:border-indigo-500"
                />
              </div>

              {broadcastType === 'SCHEDULED' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Tanggal &amp; Jam Kirim <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full sm:w-auto h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Channel Pengirim
                  </label>
                  <select
                    value={channel}
                    onChange={(e) => {
                      const nextCh = e.target.value as OmnichannelType;
                      setChannel(nextCh);
                      const matching = channelAccounts.filter(
                        (a) => a.channel === nextCh && a.isActive
                      );
                      setChannelAccountId(matching[0]?.id || '');
                    }}
                    className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] focus:outline-none focus:border-indigo-500"
                  >
                    <option value="WHATSAPP">WhatsApp (WAHA)</option>
                    <option value="TELEGRAM">Telegram Bot</option>
                    <option value="INSTAGRAM">Instagram DM</option>
                    <option value="FACEBOOK">Facebook Messenger</option>
                    <option value="THREADS">Threads</option>
                  </select>
                </div>

                {channel === 'WHATSAPP' && licenseInfo?.features?.multiSession && wahaSessions.length > 1 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Sesi WhatsApp Pengirim
                    </label>
                    <select
                      value={selectedSession}
                      onChange={(e) => setSelectedSession(e.target.value)}
                      className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] font-mono focus:outline-none focus:border-indigo-500"
                    >
                      {wahaSessions.filter((s) => s.status === 'WORKING').length > 1 && (
                        <option value="__ALL_ACTIVE__">
                          Semua Sesi Aktif (Rotasi Otomatis •{' '}
                          {wahaSessions.filter((s) => s.status === 'WORKING').length} sesi)
                        </option>
                      )}
                      {wahaSessions.map((s) => (
                        <option key={s.name} value={s.name}>
                          {s.name} ({s.status})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {channel !== 'WHATSAPP' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Akun Kanal Pengirim
                    </label>
                    {channelAccounts.filter((a) => a.channel === channel && a.isActive).length === 0 ? (
                      <div className="h-9 px-3 flex items-center bg-amber-50 border border-amber-200 rounded-md text-[11px] text-amber-800">
                        Belum ada akun {channel} aktif di Integrasi &amp; Kanal → Omnichannel.
                      </div>
                    ) : (
                      <select
                        value={channelAccountId}
                        onChange={(e) => setChannelAccountId(e.target.value)}
                        className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] focus:outline-none focus:border-indigo-500"
                      >
                        {channelAccounts
                          .filter((a) => a.channel === channel && a.isActive)
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({a.accountId})
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 2. Target Recipients */}
            <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
              <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs flex items-center justify-center font-bold">
                  2
                </span>
                <span>Pilih Kontak Penerima ({targetCount} Terpilih)</span>
              </h3>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={recipientMode === 'ALL' ? 'primary' : 'secondary'}
                  onClick={() => setRecipientMode('ALL')}
                >
                  Semua Kontak ({allContacts.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={recipientMode === 'TAGS' ? 'primary' : 'secondary'}
                  onClick={() => setRecipientMode('TAGS')}
                >
                  Filter Tag Segmen
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={recipientMode === 'MANUAL' ? 'primary' : 'secondary'}
                  onClick={() => setRecipientMode('MANUAL')}
                >
                  Pilih Manual ({selectedContactIds.length})
                </Button>
              </div>

              {recipientMode === 'TAGS' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Pilih Tag
                  </label>
                  <select
                    value={selectedTag}
                    onChange={(e) => setSelectedTag(e.target.value)}
                    className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">-- Pilih Tag --</option>
                    {availableTags.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag} ({allContacts.filter((c) => c.tags?.includes(tag)).length} kontak)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {recipientMode === 'MANUAL' && (
                <div className="border border-gray-200 rounded-md p-3 max-h-48 overflow-y-auto space-y-1">
                  <div className="flex justify-between items-center pb-2 mb-2 border-b border-gray-200 text-xs">
                    <span className="font-semibold text-gray-700">Daftar Kontak:</span>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedContactIds(
                          selectedContactIds.length === allContacts.length
                            ? []
                            : allContacts.map((c) => c.id)
                        )
                      }
                      className="text-indigo-600 hover:underline font-medium"
                    >
                      {selectedContactIds.length === allContacts.length
                        ? 'Hapus Semua Pilihan'
                        : 'Pilih Semua'}
                    </button>
                  </div>
                  {allContacts.map((contact) => (
                    <label
                      key={contact.id}
                      className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded text-xs cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedContactIds.includes(contact.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedContactIds([...selectedContactIds, contact.id]);
                          } else {
                            setSelectedContactIds(
                              selectedContactIds.filter((id) => id !== contact.id)
                            );
                          }
                        }}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-medium text-gray-900">{contact.nama_lengkap}</span>
                      <span className="text-gray-400 font-mono">({contact.nomor_whatsapp})</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Message Composer */}
            <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs flex items-center justify-center font-bold">
                    3
                  </span>
                  <span>Isi Pesan Siaran</span>
                </h3>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-gray-500">Variabel:</span>
                  {['{nama_panggilan}', '{nama_lengkap}', '{alamat}'].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable(` ${v}`)}
                      className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-[11px] font-mono border border-gray-200"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {messageTemplates.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 rounded-md bg-gray-50 border border-gray-200">
                  <label className="text-[11px] font-medium text-gray-600 shrink-0">
                    Pakai Master Template:
                  </label>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const tpl = messageTemplates.find((t) => t.id === e.target.value);
                      if (tpl) {
                        setMessageTemplate(tpl.content);
                        if (!title.trim()) setTitle(tpl.name);
                        e.target.value = '';
                      }
                    }}
                    className="w-full flex-none sm:flex-1 min-w-0 h-8 px-2.5 bg-white border border-gray-200 rounded text-xs text-gray-700 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">-- Pilih template siaran tersimpan --</option>
                    {messageTemplates
                      .filter((t) => t.channel === 'ALL' || t.channel === channel)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          [{t.category}] {t.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <textarea
                rows={5}
                required
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                className="w-full p-3 bg-white border border-gray-200 rounded-md text-[13px] leading-relaxed focus:outline-none focus:border-indigo-500"
                placeholder="Tulis pesan siaran Anda..."
              />
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-5">
            <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
              <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-indigo-600" />
                <span>Jeda &amp; Keamanan Pengiriman</span>
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <div className="flex justify-between font-medium text-gray-700 mb-1">
                    <span>Jeda Antar Pesan</span>
                    <span className="text-indigo-600 font-mono font-semibold">{delaySeconds} Detik</span>
                  </div>
                  <input
                    type="range"
                    min="3"
                    max="20"
                    step="1"
                    value={delaySeconds}
                    onChange={(e) => setDelaySeconds(parseInt(e.target.value, 10))}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <span className="text-[11px] text-gray-400">
                    Disarankan minimal 5 detik per pesan.
                  </span>
                </div>

                <div className="pt-2 border-t border-gray-200">
                  <div className="flex justify-between font-medium text-gray-700 mb-1">
                    <span>Jeda Interval Batch</span>
                    <span className="text-indigo-600 font-mono font-semibold">{intervalSeconds} Detik</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="120"
                    step="5"
                    value={intervalSeconds}
                    onChange={(e) => setIntervalSeconds(parseInt(e.target.value, 10))}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <div className="text-[11px] text-gray-400 mt-1">
                    Istirahat {intervalSeconds} detik setiap {batchSize} pesan.
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-200">
                  <label className="block font-medium text-gray-700 mb-1">
                    Ukuran Batch (Pesan per jeda)
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="50"
                    value={batchSize}
                    onChange={(e) => setBatchSize(parseInt(e.target.value, 10) || 10)}
                    className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="bg-indigo-50/60 border border-indigo-200 p-3 rounded-md text-indigo-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-xs">
                    <Info className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Estimasi Pengiriman</span>
                  </div>
                  <div className="text-xs tabular-nums">
                    Target: <strong>{targetCount}</strong> pesan
                  </div>
                  <div className="text-xs tabular-nums">
                    Perkiraan waktu: <strong>~{estimatedMinutes} menit</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h4 className="font-semibold text-gray-700 text-xs uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-gray-400" />
                <span>Pratinjau Pesan</span>
              </h4>

              <div className="bg-[#e5ddd5] p-4 rounded-lg border border-gray-200">
                <div className="bg-white rounded-md p-3 text-xs shadow-sm max-w-[90%] ml-auto text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {previewMessage || '(Ketik pesan untuk melihat pratinjau)'}
                  <div className="text-[10px] text-gray-400 text-right mt-1 font-mono">10:30</div>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 mt-2 text-center truncate">
                Simulasi: {sampleContact.nama_lengkap} ({sampleContact.nomor_whatsapp})
              </p>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              isLoading={isSubmitting}
              disabled={targetCount === 0}
            >
              {broadcastType === 'SCHEDULED'
                ? `Jadwalkan Siaran (${targetCount} Kontak)`
                : `Kirim Sekarang (${targetCount} Kontak)`}
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm">Semua Kampanye Siaran</h3>
            <Button
              variant="secondary"
              size="sm"
              onClick={loadCampaigns}
              isLoading={loading}
            >
              Segarkan
            </Button>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {loading && campaigns.length === 0 ? (
              <LoadingState message="Memuat riwayat kampanye siaran..." />
            ) : historyError && campaigns.length === 0 ? (
              <ErrorState message={historyError} onRetry={loadCampaigns} />
            ) : campaigns.length === 0 ? (
              <EmptyState
                title="Belum ada riwayat siaran"
                description="Buat kampanye siaran pertama Anda di tab Buat Siaran Baru."
                action={
                  <Button variant="primary" size="sm" onClick={() => setActiveTab('create')}>
                    Buat Siaran Baru
                  </Button>
                }
              />
            ) : (
              <div className="divide-y divide-gray-200">
                {campaigns.map((camp) => {
                  const total = camp.totalCount || 1;
                  const percentSent = Math.round((camp.sentCount / total) * 100);
                  const percentDelivered = Math.round((camp.deliveredCount / total) * 100);
                  const percentRead = Math.round((camp.readCount / total) * 100);

                  return (
                    <div key={camp.id} className="p-5 hover:bg-gray-50 transition-colors">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-gray-900 text-sm">{camp.title}</h4>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              {camp.channel || 'WHATSAPP'}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-700 border border-gray-200">
                              {camp.type}
                            </span>
                          </div>

                          <div className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-3 tabular-nums">
                            <span>Dibuat: {new Date(camp.createdAt).toLocaleString('id-ID')}</span>
                            {camp.scheduledAt && (
                              <span className="text-blue-700 font-medium">
                                Jadwal: {new Date(camp.scheduledAt).toLocaleString('id-ID')}
                              </span>
                            )}
                            <span>
                              Jeda: {camp.delaySeconds}s (interval {camp.intervalSeconds}s)
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                              camp.status === 'COMPLETED'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : camp.status === 'PROCESSING'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : camp.status === 'CANCELLED'
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : 'bg-gray-100 text-gray-700 border-gray-200'
                            }`}
                          >
                            {camp.status}
                          </span>

                          {(camp.status === 'PROCESSING' || camp.status === 'SCHEDULED') && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setCancelTargetId(camp.id)}
                            >
                              Batalkan
                            </Button>
                          )}

                          {camp.failedCount > 0 && camp.status !== 'PROCESSING' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              isLoading={retryingId === camp.id}
                              onClick={async () => {
                                setRetryingId(camp.id);
                                try {
                                  const res = await api.retryFailedCampaign(camp.id);
                                  toast.success(
                                    `${res.retriedCount} penerima gagal dimasukkan kembali ke antrean.`
                                  );
                                  loadCampaigns();
                                } catch (err: any) {
                                  toast.error(
                                    err.response?.data?.error || 'Gagal mengulang pengiriman'
                                  );
                                } finally {
                                  setRetryingId(null);
                                }
                              }}
                            >
                              Ulangi Gagal ({camp.failedCount})
                            </Button>
                          )}

                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenDetail(camp.id)}
                          >
                            Detail Lead
                          </Button>
                        </div>
                      </div>

                      <div className="w-full bg-gray-100 h-2 rounded overflow-hidden flex mb-2.5">
                        <div
                          className="bg-indigo-600 h-2 transition-all"
                          style={{ width: `${percentRead}%` }}
                          title={`Dibaca: ${camp.readCount} (${percentRead}%)`}
                        />
                        <div
                          className="bg-emerald-600 h-2 transition-all"
                          style={{ width: `${Math.max(0, percentDelivered - percentRead)}%` }}
                          title={`Sampai: ${camp.deliveredCount} (${percentDelivered}%)`}
                        />
                        <div
                          className="bg-blue-500 h-2 transition-all"
                          style={{ width: `${Math.max(0, percentSent - percentDelivered)}%` }}
                          title={`Terkirim: ${camp.sentCount} (${percentSent}%)`}
                        />
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs text-gray-600 tabular-nums">
                        <div>
                          Total Target: <strong className="text-gray-900">{camp.totalCount}</strong>
                        </div>
                        <div className="text-blue-700">
                          Terkirim: <strong>{camp.sentCount}</strong>
                        </div>
                        <div className="text-emerald-700">
                          Sampai: <strong>{camp.deliveredCount}</strong>
                        </div>
                        <div className="text-indigo-700">
                          Dibaca: <strong>{camp.readCount}</strong>
                        </div>
                        <div className="text-red-600">
                          Gagal: <strong>{camp.failedCount}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Campaign Detail Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={selectedCampaign ? `Detail Pengiriman: ${selectedCampaign.title}` : 'Detail Pengiriman'}
        subtitle="Daftar penerima dan status tanda terima WhatsApp"
        maxWidthClass="max-w-3xl"
        footer={
          <Button variant="secondary" onClick={() => setIsDetailOpen(false)}>
            Tutup
          </Button>
        }
      >
        {loadingDetail || !selectedCampaign ? (
          <LoadingState message="Memuat daftar penerima..." />
        ) : selectedCampaign.recipients.length === 0 ? (
          <EmptyState title="Tidak ada penerima" description="Kampanye ini belum memiliki daftar penerima." />
        ) : (
          <>
            <div className="sm:hidden border border-gray-200 rounded-md divide-y divide-gray-200">
              {selectedCampaign.recipients.map((rec) => {
                const updatedText = rec.readAt
                  ? new Date(rec.readAt).toLocaleString('id-ID')
                  : rec.deliveredAt
                  ? new Date(rec.deliveredAt).toLocaleString('id-ID')
                  : rec.sentAt
                  ? new Date(rec.sentAt).toLocaleString('id-ID')
                  : '-';
                return (
                  <div key={rec.id} className="p-3 bg-white space-y-1 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate">
                          {rec.contact?.nama_lengkap || '-'}
                        </div>
                        <div className="font-mono text-[11px] text-gray-500">+{rec.phone}</div>
                      </div>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border shrink-0 ${
                          rec.status === 'READ'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : rec.status === 'DELIVERED'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : rec.status === 'SENT'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : rec.status === 'FAILED'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-gray-100 text-gray-700 border-gray-200'
                        }`}
                      >
                        {rec.status === 'READ'
                          ? 'Dibaca'
                          : rec.status === 'DELIVERED'
                          ? 'Sampai'
                          : rec.status === 'SENT'
                          ? 'Terkirim'
                          : rec.status === 'FAILED'
                          ? 'Gagal'
                          : 'Pending'}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-gray-400 tabular-nums">
                      Pembaruan: {updatedText}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden sm:block border border-gray-200 rounded-md overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-xs">
                <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200">
                  <tr>
                    <th className="py-2.5 px-3">Pelanggan</th>
                    <th className="py-2.5 px-3">Nomor WA</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Waktu Pembaruan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {selectedCampaign.recipients.map((rec) => (
                    <tr key={rec.id} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3 font-medium text-gray-900">
                        {rec.contact?.nama_lengkap || '-'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-gray-600">+{rec.phone}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${
                            rec.status === 'READ'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : rec.status === 'DELIVERED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : rec.status === 'SENT'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : rec.status === 'FAILED'
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : 'bg-gray-100 text-gray-700 border-gray-200'
                          }`}
                        >
                          {rec.status === 'READ'
                            ? 'Dibaca'
                            : rec.status === 'DELIVERED'
                            ? 'Sampai'
                            : rec.status === 'SENT'
                            ? 'Terkirim'
                            : rec.status === 'FAILED'
                            ? 'Gagal'
                            : 'Pending'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-gray-500 font-mono text-[11px] tabular-nums">
                        {rec.readAt
                          ? new Date(rec.readAt).toLocaleString('id-ID')
                          : rec.deliveredAt
                          ? new Date(rec.deliveredAt).toLocaleString('id-ID')
                          : rec.sentAt
                          ? new Date(rec.sentAt).toLocaleString('id-ID')
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>

      <ConfirmModal
        isOpen={cancelTargetId !== null}
        onClose={() => setCancelTargetId(null)}
        onConfirm={handleConfirmCancel}
        isLoading={cancelling}
        title="Batalkan Kampanye Siaran?"
        description="Sisa pesan dalam antrean tidak akan dikirimkan. Pesan yang sudah terkirim tetap tercatat."
        confirmLabel="Ya, Batalkan"
        variant="danger"
      />
    </div>
  );
};

export default Broadcasts;
