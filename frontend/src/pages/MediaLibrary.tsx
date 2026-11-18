import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image as ImageIcon,
  Trash2,
  Copy,
  Send,
  Film,
  Search,
  Filter,
  Eye,
  X,
  ExternalLink,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import api from '../services/api';
import { AuthStatus, MediaLibraryItem } from '../types';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/ToastProvider';
import { LoadingState, EmptyState } from '../components/ui/StateBlocks';
import { hasPerm } from '../lib/permissions';

interface MediaLibraryProps {
  currentUser?: AuthStatus['user'] | null;
  onUseInPost?: (mediaUrl: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const CHANNEL_BADGES: Record<string, { label: string; cls: string; dot: string }> = {
  WHATSAPP: {
    label: 'WhatsApp',
    cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  INSTAGRAM: {
    label: 'Instagram',
    cls: 'bg-pink-50 text-pink-800 border-pink-200',
    dot: 'bg-pink-500',
  },
  FACEBOOK: {
    label: 'Facebook',
    cls: 'bg-blue-50 text-blue-800 border-blue-200',
    dot: 'bg-blue-500',
  },
  THREADS: {
    label: 'Threads',
    cls: 'bg-neutral-100 text-neutral-800 border-neutral-300',
    dot: 'bg-neutral-700',
  },
  TELEGRAM: {
    label: 'Telegram',
    cls: 'bg-sky-50 text-sky-800 border-sky-200',
    dot: 'bg-sky-500',
  },
  DIRECT: {
    label: 'Pustaka',
    cls: 'bg-purple-50 text-purple-800 border-purple-200',
    dot: 'bg-purple-500',
  },
};

export const MediaLibrary: React.FC<MediaLibraryProps> = ({ currentUser, onUseInPost }) => {
  const canEdit = hasPerm(currentUser, 'broadcasts.send');
  const toast = useToast();
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filterKind, setFilterKind] = useState<'all' | 'image' | 'video'>('all');
  const [filterChannel, setFilterChannel] = useState<'all' | string>('all');
  const [filterSession, setFilterSession] = useState<'all' | string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPreview, setSelectedPreview] = useState<MediaLibraryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaLibraryItem | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const loadMedia = useCallback(async () => {
    try {
      const list = await api.getMediaLibrary();
      setItems(list || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await api.uploadMedia({
          fileName: file.name,
          mimeType: file.type || 'image/png',
          base64: String(reader.result || ''),
          channel: 'DIRECT',
          label: 'Unggahan Pustaka',
          source: 'UPLOAD',
        });
        toast.success('Media berhasil diunggah ke pustaka');
        loadMedia();
      } catch (err: any) {
        toast.error(err.response?.data?.error || 'Gagal mengunggah media');
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteMediaFile(deleteTarget.filename);
      setItems((prev) => prev.filter((i) => i.filename !== deleteTarget.filename));
      toast.info('Media dihapus dari pustaka');
      setDeleteTarget(null);
    } catch {
      toast.error('Gagal menghapus media');
    }
  };

  const availableChannels = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.channel) set.add(i.channel.toUpperCase());
    });
    return Array.from(set);
  }, [items]);

  const availableSessions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.sessionName) set.add(i.sessionName);
    });
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (filterKind !== 'all' && item.mediaKind !== filterKind) return false;
      if (filterChannel !== 'all') {
        const ch = (item.channel || 'DIRECT').toUpperCase();
        if (ch !== filterChannel.toUpperCase()) return false;
      }
      if (filterSession !== 'all' && item.sessionName !== filterSession) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchName = item.filename.toLowerCase().includes(q);
        const matchOrig = item.originalFileName?.toLowerCase().includes(q);
        const matchLabel = item.label?.toLowerCase().includes(q);
        const matchSess = item.sessionName?.toLowerCase().includes(q);
        const matchSender =
          item.senderName?.toLowerCase().includes(q) || item.senderPhone?.includes(q);
        if (!matchName && !matchOrig && !matchLabel && !matchSess && !matchSender) return false;
      }
      return true;
    });
  }, [items, filterKind, filterChannel, filterSession, searchTerm]);

  const totalBytes = items.reduce((acc, i) => acc + i.sizeBytes, 0);

  return (
    <div className="space-y-4">
      {/* Page Title & Upload Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-indigo-600" />
            <span>Pustaka Media CRM</span>
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Semua aset gambar dan video dari percakapan pelanggan (WhatsApp, Instagram, dll.) dan unggahan langsung tersimpan aman dengan label asal sesi.
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/mp4"
              onChange={handleUpload}
              className="hidden"
            />
            <Button
              variant="primary"
              size="sm"
              isLoading={uploading}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 shadow-sm"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Unggah Media Baru</span>
            </Button>
          </div>
        )}
      </div>

      {/* Storage Summary & Filter Bar */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4 space-y-3 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span>Penyimpanan Terpakai:</span>
            <strong className="font-mono text-gray-900 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
              {formatBytes(totalBytes)}
            </strong>
            <span className="text-gray-400">•</span>
            <span>
              <strong>{filtered.length}</strong> ditampilkan dari <strong>{items.length}</strong> total aset
            </span>
          </div>

          {/* Quick Search */}
          <div className="relative w-full lg:w-72">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari file, sesi, atau kontak..."
              className="w-full h-8 pl-8 pr-7 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-indigo-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls */}
        <div className="pt-2 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
          {/* Format Kind Tabs */}
          <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5 text-xs font-medium">
            {(
              [
                { id: 'all', label: 'Semua Format' },
                { id: 'image', label: 'Foto' },
                { id: 'video', label: 'Video' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilterKind(t.id)}
                className={`px-2.5 py-1 rounded transition-colors ${
                  filterKind === t.id ? 'bg-white text-indigo-700 shadow-2xs font-semibold' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Channel Filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-gray-500 font-medium">Kanal / Sesi:</span>
            <select
              value={filterChannel}
              onChange={(e) => {
                setFilterChannel(e.target.value);
                setFilterSession('all');
              }}
              className="h-7 px-2 bg-white border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">Semua Saluran</option>
              {availableChannels.map((ch) => (
                <option key={ch} value={ch}>
                  {CHANNEL_BADGES[ch]?.label || ch}
                </option>
              ))}
              <option value="DIRECT">Unggahan Langsung</option>
            </select>

            {availableSessions.length > 0 && (
              <select
                value={filterSession}
                onChange={(e) => setFilterSession(e.target.value)}
                className="h-7 px-2 bg-white border border-gray-200 rounded-md text-xs font-mono text-gray-700 focus:outline-none focus:border-indigo-500 max-w-[160px]"
              >
                <option value="all">Semua Sesi ({availableSessions.length})</option>
                {availableSessions.map((sess) => (
                  <option key={sess} value={sess}>
                    {sess}
                  </option>
                ))}
              </select>
            )}

            {(filterChannel !== 'all' || filterSession !== 'all' || filterKind !== 'all' || searchTerm) && (
              <button
                type="button"
                onClick={() => {
                  setFilterChannel('all');
                  setFilterSession('all');
                  setFilterKind('all');
                  setSearchTerm('');
                }}
                className="h-7 px-2 text-xs font-medium text-indigo-600 hover:underline"
              >
                Reset Filter
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Media Grid */}
      <div className="bg-white rounded-lg border border-gray-200 p-3.5 sm:p-5 shadow-2xs">
        {loading ? (
          <LoadingState message="Memuat aset pustaka media..." />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Tidak ada aset media"
            description={
              searchTerm || filterChannel !== 'all' || filterSession !== 'all'
                ? 'Tidak ada berkas yang sesuai dengan kriteria filter saat ini.'
                : 'Aset media yang dikirim atau diterima di chat CRM akan otomatis diarsipkan di sini.'
            }
          />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {filtered.map((item) => {
              const chKey = (item.channel || 'DIRECT').toUpperCase();
              const badgeMeta = CHANNEL_BADGES[chKey] || CHANNEL_BADGES.DIRECT;
              const displayLabel = item.label || (item.sessionName ? `${badgeMeta.label} • ${item.sessionName}` : badgeMeta.label);

              return (
                <div
                  key={item.filename}
                  className="group rounded-lg border border-gray-200 overflow-hidden bg-white hover:border-indigo-300 hover:shadow-sm transition-all duration-150 flex flex-col"
                >
                  {/* Thumbnail / Media Frame */}
                  <div
                    onClick={() => setSelectedPreview(item)}
                    className="relative aspect-video bg-gray-100 flex items-center justify-center overflow-hidden cursor-pointer"
                  >
                    {item.mediaKind === 'video' ? (
                      <div className="flex flex-col items-center justify-center text-gray-500">
                        <Film className="w-8 h-8 text-gray-400 group-hover:scale-110 transition-transform" />
                        <span className="text-[10px] font-mono mt-1">Video</span>
                      </div>
                    ) : (
                      <img
                        src={item.relativeUrl.startsWith('/') ? `.${item.relativeUrl}` : item.relativeUrl}
                        alt={item.originalFileName || item.filename}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-200"
                      />
                    )}

                    {/* Channel & Session Pill on Thumbnail */}
                    <div className="absolute top-1.5 left-1.5 max-w-[85%]">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border shadow-2xs backdrop-blur-xs truncate ${badgeMeta.cls}`}
                        title={displayLabel}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${badgeMeta.dot}`} />
                        <span className="truncate">{displayLabel}</span>
                      </span>
                    </div>

                    {/* Source Indicator (INBOUND / OUTBOUND / UPLOAD) */}
                    {item.source && (
                      <div className="absolute bottom-1.5 right-1.5">
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-medium bg-black/60 text-white backdrop-blur-xs">
                          {item.source === 'INBOUND'
                            ? 'Masuk'
                            : item.source === 'OUTBOUND'
                            ? 'Keluar'
                            : 'Upload'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Card Info & Actions */}
                  <div className="p-2.5 space-y-1.5 flex-1 flex flex-col justify-between">
                    <div>
                      <div
                        className="text-[11px] font-mono font-medium text-gray-900 truncate"
                        title={item.originalFileName || item.filename}
                      >
                        {item.originalFileName || item.filename}
                      </div>

                      {item.senderName && (
                        <div className="text-[10px] text-gray-500 truncate" title={`Dari: ${item.senderName}`}>
                          Dari: <span className="font-medium text-gray-700">{item.senderName}</span>
                        </div>
                      )}

                      <div className="text-[10px] text-gray-400 flex items-center justify-between pt-0.5">
                        <span>{formatBytes(item.sizeBytes)}</span>
                        <span>{new Date(item.createdAt).toLocaleDateString('id-ID')}</span>
                      </div>
                    </div>

                    {/* Bottom Action Buttons */}
                    <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-gray-100">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(item.url);
                            toast.success('URL media disalin');
                          }}
                          title="Salin tautan media"
                          className="p-1 rounded text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 border border-gray-200 transition-colors cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedPreview(item)}
                          title="Pratinjau media"
                          className="p-1 rounded text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 border border-gray-200 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {canEdit && onUseInPost && (
                          <button
                            type="button"
                            onClick={() => onUseInPost(item.url)}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-medium hover:bg-indigo-700 cursor-pointer"
                          >
                            <Send className="w-2.5 h-2.5" />
                            <span>Pakai</span>
                          </button>
                        )}
                      </div>

                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                          className="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Hapus media dari pustaka"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox / Preview Modal */}
      {selectedPreview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          onClick={() => setSelectedPreview(null)}
        >
          <div
            className="relative bg-white rounded-xl shadow-2xl max-w-3xl w-full overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-gray-50">
              <div className="min-w-0 flex-1">
                <h4 className="text-xs sm:text-sm font-semibold text-gray-900 truncate">
                  {selectedPreview.originalFileName || selectedPreview.filename}
                </h4>
                <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5">
                  <span className="font-mono">{formatBytes(selectedPreview.sizeBytes)}</span>
                  <span>•</span>
                  <span>{new Date(selectedPreview.createdAt).toLocaleString('id-ID')}</span>
                  {selectedPreview.label && (
                    <>
                      <span>•</span>
                      <span className="font-semibold text-indigo-700">#{selectedPreview.label}</span>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPreview(null)}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 bg-black/90 p-4 flex items-center justify-center overflow-auto min-h-[300px]">
              {selectedPreview.mediaKind === 'video' ? (
                <video
                  src={selectedPreview.relativeUrl}
                  controls
                  autoPlay
                  className="max-h-[65vh] max-w-full rounded"
                />
              ) : (
                <img
                  src={selectedPreview.relativeUrl}
                  alt={selectedPreview.filename}
                  className="max-h-[65vh] max-w-full object-contain rounded"
                />
              )}
            </div>

            <div className="flex items-center justify-between p-3 bg-white border-t border-gray-200 text-xs">
              <a
                href={selectedPreview.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-indigo-600 hover:underline font-medium"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Buka di tab baru</span>
              </a>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedPreview.url);
                    toast.success('URL media disalin');
                  }}
                >
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  Salin Tautan
                </Button>
                {canEdit && onUseInPost && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      onUseInPost(selectedPreview.url);
                      setSelectedPreview(null);
                    }}
                  >
                    <Send className="w-3.5 h-3.5 mr-1" />
                    Pakai di Postingan
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-lg p-5 max-w-sm w-full space-y-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-rose-600 font-semibold text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Hapus Media dari Pustaka?</span>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Berkas <strong className="font-mono text-gray-900">{deleteTarget.originalFileName || deleteTarget.filename}</strong> akan dihapus permanen dari server. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button size="sm" variant="secondary" onClick={() => setDeleteTarget(null)}>
                Batal
              </Button>
              <Button size="sm" variant="danger" onClick={handleConfirmDelete}>
                Hapus Permanen
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaLibrary;
