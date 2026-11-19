import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  FileText,
  Film,
  Music,
  Search,
  UploadCloud,
  X,
} from 'lucide-react';
import api from '../../services/api';
import { MediaLibraryItem } from '../../types';
import { Modal } from './Modal';
import { Button } from './Button';
import { EmptyState, LoadingState } from './StateBlocks';
import { useToast } from './ToastProvider';

export function resolveCrmMediaUrl(url?: string | null): string {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/api/media/')) {
    return `.${raw}`;
  }
  return raw;
}

export type MediaLibraryKind = 'image' | 'video' | 'document' | 'audio';

interface MediaLibraryPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  multiple?: boolean;
  allowedKinds?: MediaLibraryKind[];
  defaultKind?: 'all' | MediaLibraryKind;
  showAsDocumentOption?: boolean;
  allowUploadInside?: boolean;
  onConfirm: (items: MediaLibraryItem[], options: { asDocument: boolean }) => void | Promise<void>;
}

export const MediaLibraryPickerModal: React.FC<MediaLibraryPickerModalProps> = ({
  isOpen,
  onClose,
  title = 'Pilih Berkas dari Galeri',
  subtitle,
  multiple = false,
  allowedKinds,
  defaultKind = 'all',
  showAsDocumentOption = false,
  allowUploadInside = true,
  onConfirm,
}) => {
  const toast = useToast();
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [filterKind, setFilterKind] = useState<'all' | MediaLibraryKind>(defaultKind);
  const [asDocument, setAsDocument] = useState(false);
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const uploadRef = useRef<HTMLInputElement>(null);

  const loadList = async () => {
    setLoading(true);
    try {
      const list = await api.getMediaLibrary();
      setItems(list || []);
    } catch {
      toast.error('Gagal memuat daftar galeri');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setSelectedNames([]);
    setAsDocument(false);
    if (allowedKinds && allowedKinds.length === 1) {
      setFilterKind(allowedKinds[0]);
    } else {
      setFilterKind(defaultKind);
    }
    void loadList();
  }, [isOpen, defaultKind]);

  const kindTabs = useMemo(() => {
    const allTabs: Array<{ id: 'all' | MediaLibraryKind; label: string }> = [
      { id: 'all', label: 'Semua' },
      { id: 'image', label: 'Foto' },
      { id: 'video', label: 'Video' },
      { id: 'document', label: 'Dokumen' },
      { id: 'audio', label: 'Audio' },
    ];
    if (!allowedKinds || allowedKinds.length === 0) return allTabs;
    if (allowedKinds.length === 1) {
      return allTabs.filter((t) => t.id === allowedKinds[0]);
    }
    return allTabs.filter((t) => t.id === 'all' || allowedKinds.includes(t.id));
  }, [allowedKinds]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (allowedKinds && allowedKinds.length > 0 && !allowedKinds.includes(item.mediaKind)) {
        return false;
      }
      if (filterKind !== 'all' && item.mediaKind !== filterKind) {
        return false;
      }
      if (q) {
        const hay = [
          item.originalFileName,
          item.filename,
          item.label,
          item.sessionName,
          item.senderName,
          item.channel,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, allowedKinds, filterKind, search]);

  const handleToggleItem = (filename: string) => {
    if (!multiple) {
      setSelectedNames((prev) => (prev[0] === filename ? [] : [filename]));
      return;
    }
    setSelectedNames((prev) =>
      prev.includes(filename) ? prev.filter((f) => f !== filename) : [...prev, filename]
    );
  };

  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setUploading(true);
    try {
      const uploadedNames: string[] = [];
      for (const file of files) {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => resolve('');
          reader.readAsDataURL(file);
        });
        if (!base64) continue;
        const res = await api.uploadMedia({
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          base64,
          channel: 'DIRECT',
          label: 'Unggahan Galeri',
          source: 'UPLOAD',
        });
        if (res?.filename) uploadedNames.push(res.filename);
      }
      await loadList();
      if (uploadedNames.length > 0) {
        setSelectedNames((prev) =>
          multiple ? Array.from(new Set([...uploadedNames, ...prev])) : [uploadedNames[0]]
        );
        toast.success(`${uploadedNames.length} berkas diunggah ke Galeri`);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal mengunggah berkas ke Galeri');
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = async () => {
    if (selectedNames.length === 0) return;
    const byName = new Map(items.map((m) => [m.filename, m]));
    const picked = selectedNames
      .map((fn) => byName.get(fn))
      .filter((x): x is MediaLibraryItem => Boolean(x));
    if (picked.length === 0) return;
    setSubmitting(true);
    try {
      await onConfirm(picked, { asDocument });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const uploadAccept = useMemo(() => {
    if (!allowedKinds || allowedKinds.length === 0 || allowedKinds.includes('document')) {
      return '*/*';
    }
    const mimes: string[] = [];
    if (allowedKinds.includes('image')) mimes.push('image/*');
    if (allowedKinds.includes('video')) mimes.push('video/*');
    if (allowedKinds.includes('audio')) mimes.push('audio/*');
    return mimes.join(',') || '*/*';
  }, [allowedKinds]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      maxWidthClass="max-w-3xl"
      isLoading={submitting}
    >
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama berkas, sesi (WA_TEST, HRIS_HR), atau pengirim..."
              className="w-full h-8 pl-8 pr-7 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-indigo-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {kindTabs.length > 1 && (
              <div className="inline-flex flex-wrap rounded-md border border-gray-200 bg-gray-50 p-0.5 text-[11px] font-medium shrink-0">
                {kindTabs.map((kt) => (
                  <button
                    key={kt.id}
                    type="button"
                    onClick={() => setFilterKind(kt.id)}
                    className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                      filterKind === kt.id
                        ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {kt.label}
                  </button>
                ))}
              </div>
            )}

            {allowUploadInside && (
              <>
                <input
                  ref={uploadRef}
                  type="file"
                  accept={uploadAccept}
                  multiple={multiple}
                  onChange={(e) => void handleUploadFiles(e)}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  isLoading={uploading}
                  onClick={() => uploadRef.current?.click()}
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Upload Baru</span>
                </Button>
              </>
            )}
          </div>
        </div>

        {showAsDocumentOption && (
          <label className="flex items-center gap-2 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={asDocument}
              onChange={(e) => setAsDocument(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600"
            />
            <span>Kirim foto terpilih sebagai Dokumen (tanpa pratinjau/kompresi gambar)</span>
          </label>
        )}

        <div className="max-h-[380px] overflow-y-auto pr-0.5">
          {loading ? (
            <LoadingState message="Memuat berkas galeri..." />
          ) : filteredItems.length === 0 ? (
            <EmptyState
              title="Belum ada berkas yang sesuai"
              description="Unggah berkas baru melalui tombol Upload Baru di atas atau kirim/terima media di obrolan."
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {filteredItems.map((item) => {
                const isSelected = selectedNames.includes(item.filename);
                const extLabel =
                  (item.originalFileName || item.filename).split('.').pop()?.slice(0, 6) || 'FILE';
                return (
                  <button
                    key={item.filename}
                    type="button"
                    onClick={() => handleToggleItem(item.filename)}
                    className={`relative text-left rounded-lg border overflow-hidden flex flex-col transition-all cursor-pointer ${
                      isSelected
                        ? 'border-indigo-600 ring-2 ring-indigo-500/30 bg-indigo-50/30'
                        : 'border-gray-200 bg-white hover:border-indigo-300'
                    }`}
                  >
                    <div className="relative aspect-video bg-slate-50 border-b border-gray-100 flex items-center justify-center overflow-hidden w-full">
                      {item.mediaKind === 'image' ? (
                        <img
                          src={resolveCrmMediaUrl(item.relativeUrl)}
                          alt={item.originalFileName || item.filename}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      ) : item.mediaKind === 'video' ? (
                        <Film className="w-7 h-7 text-indigo-500" />
                      ) : item.mediaKind === 'audio' ? (
                        <Music className="w-7 h-7 text-emerald-600" />
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <FileText className="w-7 h-7 text-amber-600" />
                          <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded bg-white border border-gray-200 text-gray-700">
                            {extLabel}
                          </span>
                        </div>
                      )}
                      {item.label && (
                        <span className="absolute top-1 left-1 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-white/95 text-gray-800 border border-gray-200 truncate max-w-[75%]">
                          {item.label}
                        </span>
                      )}
                      {isSelected && (
                        <span className="absolute top-1 right-1 h-5 w-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    <div className="p-2 w-full space-y-0.5">
                      <div
                        className="text-[11px] font-mono font-medium text-gray-900 truncate"
                        title={item.originalFileName || item.filename}
                      >
                        {item.originalFileName || item.filename}
                      </div>
                      <div className="text-[10px] text-gray-500 flex items-center justify-between">
                        <span>
                          {item.sizeBytes >= 1024 * 1024
                            ? `${(item.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
                            : `${Math.max(1, Math.round(item.sizeBytes / 1024))} KB`}
                        </span>
                        {item.senderName && (
                          <span className="truncate max-w-[85px]" title={item.senderName}>
                            {item.senderName}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-500">
            {selectedNames.length > 0
              ? `${selectedNames.length} aset dipilih`
              : multiple
              ? 'Klik aset untuk memilih (bisa lebih dari satu)'
              : 'Klik aset untuk memilih'}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              isLoading={submitting}
              disabled={selectedNames.length === 0}
              onClick={() => void handleConfirm()}
            >
              {multiple ? `Tambahkan (${selectedNames.length})` : 'Pilih Media Ini'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
