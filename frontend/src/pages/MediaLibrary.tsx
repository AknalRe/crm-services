import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Trash2, Copy, Send, Film } from 'lucide-react';
import api from '../services/api';
import { MediaLibraryItem } from '../types';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/ToastProvider';
import { LoadingState, EmptyState } from '../components/ui/StateBlocks';

interface MediaLibraryProps {
  onUseInPost?: (mediaUrl: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const MediaLibrary: React.FC<MediaLibraryProps> = ({ onUseInPost }) => {
  const toast = useToast();
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filterKind, setFilterKind] = useState<'all' | 'image' | 'video'>('all');
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

  const handleDelete = async (filename: string) => {
    try {
      await api.deleteMediaFile(filename);
      setItems((prev) => prev.filter((i) => i.filename !== filename));
      toast.info('Media dihapus');
    } catch {
      toast.error('Gagal menghapus media');
    }
  };

  const totalBytes = items.reduce((acc, i) => acc + i.sizeBytes, 0);
  const filtered = items.filter((i) => (filterKind === 'all' ? true : i.mediaKind === filterKind));

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Pustaka Media</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Foto dan video yang pernah Anda unggah, siap dipakai ulang untuk postingan kanal.
          </p>
        </div>
        <div>
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
          >
            Unggah Media
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs text-gray-600">
          Penyimpanan terpakai: <strong className="font-mono text-gray-900">{formatBytes(totalBytes)}</strong> ({items.length} file)
        </div>
        <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
          {([
            { id: 'all', label: 'Semua' },
            { id: 'image', label: 'Foto' },
            { id: 'video', label: 'Video' },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilterKind(t.id)}
              className={`px-3 py-1 rounded text-xs font-medium ${
                filterKind === t.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-5">
        {loading ? (
          <LoadingState message="Memuat pustaka media..." />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Belum ada media"
            description="Unggah foto atau video di sini agar bisa dipakai ulang di Jadwal Postingan."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((item) => (
              <div
                key={item.filename}
                className="rounded-lg border border-gray-200 overflow-hidden bg-gray-50/40 flex flex-col"
              >
                <div className="aspect-video bg-gray-100 flex items-center justify-center overflow-hidden">
                  {item.mediaKind === 'video' ? (
                    <Film className="w-8 h-8 text-gray-400" />
                  ) : (
                    <img
                      src={item.relativeUrl.startsWith('/') ? `.${item.relativeUrl}` : item.relativeUrl}
                      alt={item.filename}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="p-3 space-y-2 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="text-[11px] font-mono text-gray-800 truncate" title={item.filename}>
                      {item.filename}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {formatBytes(item.sizeBytes)} • {new Date(item.createdAt).toLocaleDateString('id-ID')}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-1 pt-1 border-t border-gray-200/70">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(item.url);
                          toast.success('URL media disalin');
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white border border-gray-200 text-[10px] font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <Copy className="w-3 h-3" />
                        Salin
                      </button>
                      {onUseInPost && (
                        <button
                          type="button"
                          onClick={() => onUseInPost(item.url)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-600 text-white text-[10px] font-medium hover:bg-indigo-700"
                        >
                          <Send className="w-3 h-3" />
                          Pakai
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.filename)}
                      className="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50"
                      title="Hapus media"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaLibrary;
