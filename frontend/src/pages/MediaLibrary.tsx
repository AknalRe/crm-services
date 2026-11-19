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
  FileText,
  Music,
  Download,
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
    cls: 'bg-slate-50 text-slate-700 border-slate-200',
    dot: 'bg-emerald-500',
  },
  INSTAGRAM: {
    label: 'Instagram',
    cls: 'bg-slate-50 text-slate-700 border-slate-200',
    dot: 'bg-rose-400',
  },
  FACEBOOK: {
    label: 'Facebook',
    cls: 'bg-slate-50 text-slate-700 border-slate-200',
    dot: 'bg-blue-500',
  },
  THREADS: {
    label: 'Threads',
    cls: 'bg-slate-50 text-slate-700 border-slate-200',
    dot: 'bg-slate-600',
  },
  TELEGRAM: {
    label: 'Telegram',
    cls: 'bg-slate-50 text-slate-700 border-slate-200',
    dot: 'bg-sky-500',
  },
  DIRECT: {
    label: 'Galeri',
    cls: 'bg-slate-50 text-slate-700 border-slate-200',
    dot: 'bg-indigo-500',
  },
};

export const MediaLibrary: React.FC<MediaLibraryProps> = ({ currentUser, onUseInPost }) => {
  const canEdit = hasPerm(currentUser, 'broadcasts.send');
  const toast = useToast();
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filterKind, setFilterKind] = useState<'all' | 'image' | 'video' | 'document' | 'audio'>('all');
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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setUploading(true);
    try {
      let okCount = 0;
      for (const file of files) {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => resolve('');
          reader.readAsDataURL(file);
        });
        if (!base64) continue;
        await api.uploadMedia({
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          base64,
          channel: 'DIRECT',
          label: 'Unggahan Galeri',
          source: 'UPLOAD',
        });
        okCount += 1;
      }
      if (okCount > 0) {
        toast.success(`${okCount} berkas berhasil diunggah ke galeri`);
        void loadMedia();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengunggah media');
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteMediaFile(deleteTarget.filename);
      setItems((prev) => prev.filter((i) => i.filename !== deleteTarget.filename));
      toast.info('Berkas dihapus dari galeri');
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
            <span>Galeri</span>
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Foto, video, audio, dan dokumen dari percakapan pelanggan maupun unggahan langsung. Akses berkas memerlukan sesi login aktif.
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="*/*"
              multiple
              onChange={(e) => void handleUpload(e)}
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
          <div className="inline-flex flex-wrap rounded-md border border-gray-200 bg-gray-50 p-0.5 text-xs font-medium">
            {(
              [
                { id: 'all', label: 'Semua' },
                { id: 'image', label: 'Foto' },
                { id: 'video', label: 'Video' },
                { id: 'document', label: 'Dokumen' },
                { id: 'audio', label: 'Audio' },
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
          <LoadingState message="Memuat berkas galeri..." />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Belum ada berkas media"
            description={
              searchTerm || filterChannel !== 'all' || filterSession !== 'all'
                ? 'Tidak ada berkas yang sesuai dengan kriteria filter saat ini.'
                : 'Berkas yang dikirim atau diterima lewat obrolan akan otomatis masuk ke galeri ini.'
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
                        <Film className="w-8 h-8 text-indigo-500 group-hover:scale-110 transition-transform" />
                        <span className="text-[10px] font-mono mt-1">Video</span>
                      </div>
                    ) : item.mediaKind === 'audio' ? (
                      <div className="flex flex-col items-center justify-center text-gray-500">
                        <Music className="w-8 h-8 text-emerald-600 group-hover:scale-110 transition-transform" />
                        <span className="text-[10px] font-mono mt-1">Audio</span>
                      </div>
                    ) : item.mediaKind === 'document' ? (
                      <div className="flex flex-col items-center justify-center px-3 text-center text-gray-600">
                        <FileText className="w-8 h-8 text-amber-600 group-hover:scale-110 transition-transform" />
                        <span className="text-[10px] font-mono font-semibold uppercase mt-1 px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-700">
                          {(item.originalFileName || item.filename).split('.').pop()?.slice(0, 6) || 'DOC'}
                        </span>
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
                          title="Hapus berkas dari galeri"
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
      {selectedPreview && (() => {
        const previewSrc = selectedPreview.relativeUrl.startsWith('/')
          ? `.${selectedPreview.relativeUrl}`
          : selectedPreview.relativeUrl;
        return (
        <div
          className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[1px] flex items-center justify-center p-3 sm:p-6"
          onClick={() => setSelectedPreview(null)}
        >
          <div
            className="relative bg-white rounded-xl border border-gray-200 shadow-2xl max-w-3xl w-full overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-white">
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
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              className={`flex-1 p-4 flex items-center justify-center overflow-auto min-h-[280px] ${
                selectedPreview.mediaKind === 'video' ? 'bg-slate-950' : 'bg-slate-100'
              }`}
            >
              {selectedPreview.mediaKind === 'video' ? (
                <video
                  src={previewSrc}
                  controls
                  autoPlay
                  className="max-h-[65vh] max-w-full rounded"
                />
              ) : selectedPreview.mediaKind === 'audio' ? (
                <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 shadow-2xs p-6 text-center space-y-4">
                  <Music className="w-12 h-12 mx-auto text-emerald-600" />
                  <div className="text-xs font-mono text-gray-800 break-all">
                    {selectedPreview.originalFileName || selectedPreview.filename}
                  </div>
                  <audio src={previewSrc} controls className="w-full" />
                </div>
              ) : selectedPreview.mediaKind === 'document' ? (
                selectedPreview.mimeType === 'application/pdf' ? (
                  <object
                    data={previewSrc}
                    type="application/pdf"
                    className="w-full h-[65vh] rounded border border-gray-200 bg-white"
                  >
                    <div className="bg-white rounded-xl border border-gray-200 p-6 text-center space-y-3 max-w-md mx-auto my-8">
                      <FileText className="w-12 h-12 mx-auto text-amber-600" />
                      <div className="text-sm font-semibold text-gray-900 break-all">
                        {selectedPreview.originalFileName || selectedPreview.filename}
                      </div>
                      <p className="text-xs text-gray-500">
                        Browser tidak dapat merender pratinjau PDF secara langsung.
                      </p>
                      <a
                        href={previewSrc}
                        download={selectedPreview.originalFileName || selectedPreview.filename}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Unduh PDF</span>
                      </a>
                    </div>
                  </object>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-6 text-center space-y-3 max-w-md w-full">
                    <FileText className="w-12 h-12 mx-auto text-amber-600" />
                    <div className="text-sm font-semibold text-gray-900 break-all">
                      {selectedPreview.originalFileName || selectedPreview.filename}
                    </div>
                    <div className="text-xs text-gray-500 font-mono">
                      {selectedPreview.mimeType} • {formatBytes(selectedPreview.sizeBytes)}
                    </div>
                    <a
                      href={previewSrc}
                      download={selectedPreview.originalFileName || selectedPreview.filename}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Unduh Berkas</span>
                    </a>
                  </div>
                )
              ) : (
                <img
                  src={previewSrc}
                  alt={selectedPreview.filename}
                  className="max-h-[65vh] max-w-full object-contain rounded shadow-xs bg-white"
                />
              )}
            </div>

            <div className="flex items-center justify-between p-3 bg-white border-t border-gray-200 text-xs">
              <a
                href={previewSrc}
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
        );
      })()}

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
              <span>Hapus Berkas dari Galeri?</span>
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
