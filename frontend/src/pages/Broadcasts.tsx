import React, { useEffect, useState } from 'react';
import {
  Send,
  Calendar,
  Clock,
  Users,
  CheckCircle,
  Eye,
  AlertCircle,
  XCircle,
  Sliders,
  Sparkles,
  Info,
  Check,
  ChevronRight,
  RefreshCw,
  X,
} from 'lucide-react';
import api from '../services/api';
import { Campaign, Contact, CampaignRecipient } from '../types';

interface BroadcastsProps {
  initialContactIds?: string[];
}

export const Broadcasts: React.FC<BroadcastsProps> = ({ initialContactIds }) => {
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  // Form State
  const [title, setTitle] = useState('');
  const [broadcastType, setBroadcastType] = useState<'IMMEDIATE' | 'SCHEDULED'>('IMMEDIATE');
  const [scheduledAt, setScheduledAt] = useState('');
  const [recipientMode, setRecipientMode] = useState<'ALL' | 'TAGS' | 'MANUAL'>('ALL');
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>(initialContactIds || []);
  const [messageTemplate, setMessageTemplate] = useState(
    'Halo {nama_panggilan}! Kami dari tim ingin menginfokan penawaran istimewa untuk Anda...'
  );

  // Anti-Ban & Pacing settings
  const [delaySeconds, setDelaySeconds] = useState(5);
  const [intervalSeconds, setIntervalSeconds] = useState(30);
  const [batchSize, setBatchSize] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Detail Modal State
  const [selectedCampaign, setSelectedCampaign] = useState<(Campaign & { recipients: CampaignRecipient[] }) | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  useEffect(() => {
    loadContactsAndTags();
    loadCampaigns();
  }, []);

  useEffect(() => {
    if (initialContactIds && initialContactIds.length > 0) {
      setRecipientMode('MANUAL');
      setSelectedContactIds(initialContactIds);
    }
  }, [initialContactIds]);

  const loadContactsAndTags = async () => {
    try {
      const res = await api.getContacts({ limit: 1000 });
      setAllContacts(res.data);
      const tags = await api.getContactTags();
      setAvailableTags(tags);
    } catch (err) {
      console.error('Failed to load contacts:', err);
    }
  };

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const data = await api.getCampaigns();
      setCampaigns(data);
    } catch (err) {
      console.error('Failed to load campaigns:', err);
    } finally {
      setLoading(false);
    }
  };

  const insertVariable = (variable: string) => {
    setMessageTemplate((prev) => prev + variable);
  };

  // Preview message with sample data
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

  // Calculate target count
  let targetCount = allContacts.length;
  if (recipientMode === 'MANUAL') {
    targetCount = selectedContactIds.length;
  } else if (recipientMode === 'TAGS' && selectedTag) {
    targetCount = allContacts.filter((c) => c.tags?.includes(selectedTag)).length;
  }

  // Estimated total time in seconds
  const estimatedSeconds =
    targetCount * delaySeconds + Math.floor(targetCount / batchSize) * intervalSeconds;
  const estimatedMinutes = Math.ceil(estimatedSeconds / 60);

  const handleSubmitCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !messageTemplate.trim()) {
      alert('Judul dan pesan siaran wajib diisi.');
      return;
    }

    if (recipientMode === 'MANUAL' && selectedContactIds.length === 0) {
      alert('Pilih minimal satu kontak pelanggan.');
      return;
    }

    if (broadcastType === 'SCHEDULED' && !scheduledAt) {
      alert('Tentukan tanggal dan jam untuk siaran terjadwal.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createCampaign({
        title,
        messageTemplate,
        type: broadcastType,
        scheduledAt: broadcastType === 'SCHEDULED' ? scheduledAt : null,
        delaySeconds,
        intervalSeconds,
        batchSize,
        contactIds: recipientMode === 'MANUAL' ? selectedContactIds : undefined,
        filterTags: recipientMode === 'TAGS' && selectedTag ? [selectedTag] : undefined,
      });

      alert(
        broadcastType === 'SCHEDULED'
          ? 'Siaran berhasil dijadwalkan!'
          : 'Broadcast langsung mulai diproses di background queue!'
      );

      setTitle('');
      setActiveTab('history');
      loadCampaigns();
    } catch (err: any) {
      alert(err.response?.data?.error || err.message || 'Gagal membuat kampanye');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelCampaign = async (id: string) => {
    if (confirm('Yakin ingin membatalkan kampanye ini? Sisa pesan tidak akan dikirim.')) {
      try {
        await api.cancelCampaign(id);
        loadCampaigns();
      } catch (err: any) {
        alert(err.response?.data?.error || 'Gagal membatalkan kampanye');
      }
    }
  };

  const handleOpenDetail = async (id: string) => {
    try {
      const data = await api.getCampaign(id);
      setSelectedCampaign(data);
      setIsDetailOpen(true);
    } catch (err: any) {
      alert('Gagal memuat detail kampanye');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab('create')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'create'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Send className="w-4 h-4" />
          <span>Buat Siaran Baru</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('history');
            loadCampaigns();
          }}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Riwayat &amp; Progress Siaran</span>
        </button>
      </div>

      {activeTab === 'create' ? (
        <form onSubmit={handleSubmitCampaign} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Setup Column (2 cols) */}
          <div className="lg:col-span-2 space-y-5">
            {/* 1. Campaign Type & Title */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-bold">
                  1
                </span>
                <span>Tipe &amp; Judul Kampanye</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setBroadcastType('IMMEDIATE')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    broadcastType === 'IMMEDIATE'
                      ? 'border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500 text-slate-900'
                      : 'border-slate-200 hover:border-slate-300 text-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5 text-emerald-600" /> Broadcast Langsung
                    </span>
                    {broadcastType === 'IMMEDIATE' && <Check className="w-4 h-4 text-emerald-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Kirim pesan sekarang juga secara berurutan dengan jeda aman.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setBroadcastType('SCHEDULED')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    broadcastType === 'SCHEDULED'
                      ? 'border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500 text-slate-900'
                      : 'border-slate-200 hover:border-slate-300 text-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-blue-600" /> Siaran Terjadwal
                    </span>
                    {broadcastType === 'SCHEDULED' && <Check className="w-4 h-4 text-emerald-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Tentukan tanggal dan jam tertentu untuk pengiriman otomatis.
                  </p>
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Judul Kampanye <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Promo Flash Sale Akhir Bulan / Pengumuman Libur"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {broadcastType === 'SCHEDULED' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal &amp; Jam Kirim <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full sm:w-auto px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              )}
            </div>

            {/* 2. Target Recipients Selection */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-bold">
                  2
                </span>
                <span>Pilih Kontak Penerima ({targetCount} Kontak Terpilih)</span>
              </h3>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRecipientMode('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    recipientMode === 'ALL'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Semua Kontak ({allContacts.length})
                </button>

                <button
                  type="button"
                  onClick={() => setRecipientMode('TAGS')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    recipientMode === 'TAGS'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Filter Tag Segmen
                </button>

                <button
                  type="button"
                  onClick={() => setRecipientMode('MANUAL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    recipientMode === 'MANUAL'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Pilih Manual ({selectedContactIds.length})
                </button>
              </div>

              {recipientMode === 'TAGS' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Pilih Tag
                  </label>
                  <select
                    value={selectedTag}
                    onChange={(e) => setSelectedTag(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="">-- Pilih Tag --</option>
                    {availableTags.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag} (
                        {allContacts.filter((c) => c.tags?.includes(tag)).length} kontak)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {recipientMode === 'MANUAL' && (
                <div className="border border-slate-200 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
                  <div className="flex justify-between items-center pb-2 mb-2 border-b border-slate-100 text-xs">
                    <span className="font-semibold text-slate-600">Daftar Kontak:</span>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedContactIds(
                          selectedContactIds.length === allContacts.length
                            ? []
                            : allContacts.map((c) => c.id)
                        )
                      }
                      className="text-emerald-600 hover:underline"
                    >
                      {selectedContactIds.length === allContacts.length
                        ? 'Hapus Semua Pilihan'
                        : 'Pilih Semua'}
                    </button>
                  </div>
                  {allContacts.map((contact) => (
                    <label
                      key={contact.id}
                      className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded text-xs cursor-pointer"
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
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="font-medium text-slate-800">{contact.nama_lengkap}</span>
                      <span className="text-slate-400 font-mono">({contact.nomor_whatsapp})</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Message Template Composer */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-bold">
                    3
                  </span>
                  <span>Isi Pesan Siaran</span>
                </h3>

                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500">Sisipkan variabel:</span>
                  <button
                    type="button"
                    onClick={() => insertVariable(' {nama_panggilan}')}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-mono border"
                  >
                    {'{nama_panggilan}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => insertVariable(' {nama_lengkap}')}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-mono border"
                  >
                    {'{nama_lengkap}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => insertVariable(' {alamat}')}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-mono border"
                  >
                    {'{alamat}'}
                  </button>
                </div>
              </div>

              <textarea
                rows={5}
                required
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs leading-relaxed focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                placeholder="Tulis pesan broadcast WhatsApp Anda..."
              />
            </div>
          </div>

          {/* Settings & Preview Column (1 col) */}
          <div className="space-y-5">
            {/* Speed & Anti-Ban Controls */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-emerald-600" />
                <span>Jeda Waktu &amp; Anti-Ban</span>
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <div className="flex justify-between font-semibold text-slate-700 mb-1">
                    <span>Jeda Antar Pesan:</span>
                    <span className="text-emerald-600">{delaySeconds} Detik</span>
                  </div>
                  <input
                    type="range"
                    min="3"
                    max="20"
                    step="1"
                    value={delaySeconds}
                    onChange={(e) => setDelaySeconds(parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-600 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400">
                    Disarankan minimal 5 detik agar nomor WhatsApp tidak terblokir.
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <div className="flex justify-between font-semibold text-slate-700 mb-1">
                    <span>Jeda Interval Batch:</span>
                    <span className="text-blue-600">{intervalSeconds} Detik</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="120"
                    step="5"
                    value={intervalSeconds}
                    onChange={(e) => setIntervalSeconds(parseInt(e.target.value, 10))}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                  <div className="text-[10px] text-slate-400 mt-1">
                    Istirahat {intervalSeconds} detik setiap pengiriman {batchSize} pesan.
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Ukuran Batch (Pesan per jeda batch):
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="50"
                    value={batchSize}
                    onChange={(e) => setBatchSize(parseInt(e.target.value, 10) || 10)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs"
                  />
                </div>

                {/* Estimate Summary */}
                <div className="bg-emerald-50/60 border border-emerald-200/60 p-3 rounded-lg text-emerald-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-xs">
                    <Info className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Estimasi Pengiriman:</span>
                  </div>
                  <div className="text-xs">
                    Target: <strong>{targetCount}</strong> pesan
                  </div>
                  <div className="text-xs">
                    Waktu Total: <strong>~{estimatedMinutes} menit</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Live Message Preview Box */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-slate-400" />
                <span>Pratinjau Pesan Pelanggan</span>
              </h4>

              <div className="bg-[#e5ddd5] p-4 rounded-xl border border-slate-300/80 shadow-inner">
                <div className="bg-white rounded-lg p-3 text-xs shadow-sm max-w-[90%] ml-auto rounded-tr-none text-slate-800 whitespace-pre-wrap leading-relaxed relative">
                  {previewMessage || '(Ketik pesan untuk melihat pratinjau)'}
                  <div className="text-[9px] text-slate-400 text-right mt-1">
                    10:30 • <span className="text-blue-500 font-bold">✓✓</span>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-2 text-center">
                Disimulasikan untuk: {sampleContact.nama_lengkap} ({sampleContact.nomor_whatsapp})
              </p>
            </div>

            {/* Submit Action Button */}
            <button
              type="submit"
              disabled={isSubmitting || targetCount === 0}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all shadow-md flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Menyiapkan Antrean...'
                  : broadcastType === 'SCHEDULED'
                  ? `Jadwalkan Siaran (${targetCount} Kontak)`
                  : `Kirim Sekarang (${targetCount} Kontak)`}
              </span>
            </button>
          </div>
        </form>
      ) : (
        /* History & Progress Tab */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm">Semua Kampanye Siaran WhatsApp</h3>
            <button
              onClick={loadCampaigns}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Segarkan</span>
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="divide-y divide-slate-100">
              {campaigns.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400">
                  Belum ada riwayat siaran. Mulai dengan membuat siaran baru!
                </div>
              ) : (
                campaigns.map((camp) => {
                  const total = camp.totalCount || 1;
                  const percentSent = Math.round((camp.sentCount / total) * 100);
                  const percentDelivered = Math.round((camp.deliveredCount / total) * 100);
                  const percentRead = Math.round((camp.readCount / total) * 100);

                  return (
                    <div key={camp.id} className="p-5 hover:bg-slate-50 transition-colors">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-slate-800 text-sm">{camp.title}</h4>
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

                          <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-3">
                            <span>
                              Dibuat: {new Date(camp.createdAt).toLocaleString('id-ID')}
                            </span>
                            {camp.scheduledAt && (
                              <span className="text-blue-600 font-medium">
                                Jadwal: {new Date(camp.scheduledAt).toLocaleString('id-ID')}
                              </span>
                            )}
                            <span>Jeda: {camp.delaySeconds}s (interval: {camp.intervalSeconds}s)</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                              camp.status === 'COMPLETED'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : camp.status === 'PROCESSING'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse'
                                : camp.status === 'CANCELLED'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {camp.status}
                          </span>

                          {camp.status === 'PROCESSING' && (
                            <button
                              onClick={() => handleCancelCampaign(camp.id)}
                              className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-medium rounded-lg"
                            >
                              Batalkan
                            </button>
                          )}

                          <button
                            onClick={() => handleOpenDetail(camp.id)}
                            className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg shadow-sm"
                          >
                            Detail Lead
                          </button>
                        </div>
                      </div>

                      {/* Multi-tier Progress Bar */}
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden flex mb-2">
                        <div
                          className="bg-purple-600 h-2.5 transition-all"
                          style={{ width: `${percentRead}%` }}
                          title={`Dibaca: ${camp.readCount} (${percentRead}%)`}
                        />
                        <div
                          className="bg-emerald-500 h-2.5 transition-all"
                          style={{
                            width: `${Math.max(0, percentDelivered - percentRead)}%`,
                          }}
                          title={`Sampai: ${camp.deliveredCount} (${percentDelivered}%)`}
                        />
                        <div
                          className="bg-blue-400 h-2.5 transition-all"
                          style={{
                            width: `${Math.max(0, percentSent - percentDelivered)}%`,
                          }}
                          title={`Terkirim: ${camp.sentCount} (${percentSent}%)`}
                        />
                      </div>

                      {/* Metrics Breakdown */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs text-slate-600 pt-1">
                        <div>
                          Total Target: <strong>{camp.totalCount}</strong>
                        </div>
                        <div className="text-blue-600">
                          Terkirim: <strong>{camp.sentCount}</strong>
                        </div>
                        <div className="text-emerald-600">
                          Sampai (Centang Dua): <strong>{camp.deliveredCount}</strong>
                        </div>
                        <div className="text-purple-600">
                          Dibaca (Centang Biru): <strong>{camp.readCount}</strong>
                        </div>
                        <div className="text-red-500">
                          Gagal: <strong>{camp.failedCount}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Campaign Detail Modal */}
      {isDetailOpen && selectedCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl relative border border-slate-100 max-h-[85vh] flex flex-col">
            <button
              onClick={() => setIsDetailOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <h3 className="text-base font-bold text-slate-800">
                Detail Pengiriman: {selectedCampaign.title}
              </h3>
              <p className="text-xs text-slate-500">
                Daftar semua lead dan status centang WA (Terkirim, Sampai, Dibaca).
              </p>
            </div>

            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Pelanggan</th>
                    <th className="py-2.5 px-3">Nomor WA</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Waktu Sampai / Baca</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedCampaign.recipients.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-800">
                        {rec.contact?.nama_lengkap || '-'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">+{rec.phone}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                            rec.status === 'READ'
                              ? 'bg-purple-100 text-purple-800'
                              : rec.status === 'DELIVERED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : rec.status === 'SENT'
                              ? 'bg-blue-100 text-blue-800'
                              : rec.status === 'FAILED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {rec.status === 'READ'
                            ? 'Dibaca (Centang Biru)'
                            : rec.status === 'DELIVERED'
                            ? 'Sampai (Centang Dua)'
                            : rec.status === 'SENT'
                            ? 'Terkirim'
                            : rec.status === 'FAILED'
                            ? 'Gagal'
                            : 'Pending'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px]">
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

            <div className="mt-4 pt-3 border-t border-slate-100 text-right">
              <button
                onClick={() => setIsDetailOpen(false)}
                className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default Broadcasts;

