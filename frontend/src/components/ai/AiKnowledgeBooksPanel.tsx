import React, { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import api from '../../services/api';
import {
  AiKnowledgeBook,
  AiKnowledgeBookPreset,
  AiKnowledgeItem,
} from '../../types';
import { Button } from '../ui/Button';
import { ConfirmModal } from '../ui/ConfirmModal';
import { EmptyState } from '../ui/StateBlocks';
import { useToast } from '../ui/ToastProvider';

interface AiKnowledgeBooksPanelProps {
  books: AiKnowledgeBook[];
  bookPresets: AiKnowledgeBookPreset[];
  knowledge: AiKnowledgeItem[];
  onRefreshKnowledge: () => Promise<void>;
}

const SOURCE_LABELS: Record<AiKnowledgeBook['sourceType'], string> = {
  MANUAL: 'Manual',
  PRESET: 'Paket Install',
  URL: 'Impor URL',
  CATALOG_SYNC: 'Sinkron Katalog',
  MARKDOWN: 'Dokumen MD',
};

export const AiKnowledgeBooksPanel: React.FC<AiKnowledgeBooksPanelProps> = ({
  books,
  bookPresets,
  knowledge,
  onRefreshKnowledge,
}) => {
  const toast = useToast();
  const [selectedBookId, setSelectedBookId] = useState<string>('ALL');
  const [installMode, setInstallMode] = useState<'NONE' | 'NEW_BOOK' | 'PRESET' | 'URL' | 'MARKDOWN'>('NONE');
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Create Book form
  const [bookTitle, setBookTitle] = useState('');
  const [bookDesc, setBookDesc] = useState('');
  const [bookCat, setBookCat] = useState('GENERAL');

  // Install URL form
  const [importUrl, setImportUrl] = useState('');
  const [importUrlTitle, setImportUrlTitle] = useState('');

  // Install Markdown form
  const [mdTitle, setMdTitle] = useState('');
  const [mdCategory, setMdCategory] = useState('SOP');
  const [mdBody, setMdBody] = useState('');

  // Add Chapter / Knowledge item form
  const [kbTitle, setKbTitle] = useState('');
  const [kbCategory, setKbCategory] = useState<'FAQ' | 'CATALOG' | 'POLICY' | 'WEB'>('FAQ');
  const [kbContent, setKbContent] = useState('');
  const [kbUrl, setKbUrl] = useState('');
  const [savingKb, setSavingKb] = useState(false);

  const [deleteBookTarget, setDeleteBookTarget] = useState<AiKnowledgeBook | null>(null);
  const [deleteItemTarget, setDeleteItemTarget] = useState<AiKnowledgeItem | null>(null);

  const bookMap = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);

  const visibleItems = useMemo(() => {
    if (selectedBookId === 'ALL') return knowledge;
    if (selectedBookId === 'UNGROUPED') return knowledge.filter((k) => !k.bookId);
    return knowledge.filter((k) => k.bookId === selectedBookId);
  }, [knowledge, selectedBookId]);

  const selectedBook = selectedBookId !== 'ALL' && selectedBookId !== 'UNGROUPED'
    ? bookMap.get(selectedBookId) || null
    : null;

  const handleCreateBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookTitle.trim()) return;
    setBusyAction('create-book');
    try {
      const created = await api.createAiKnowledgeBook({
        title: bookTitle.trim(),
        description: bookDesc.trim() || null,
        category: bookCat,
      });
      setBookTitle('');
      setBookDesc('');
      setInstallMode('NONE');
      setSelectedBookId(created.id);
      await onRefreshKnowledge();
      toast.success(`Knowledge Book "${created.title}" dibuat`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal membuat Knowledge Book');
    } finally {
      setBusyAction(null);
    }
  };

  const handleInstallPreset = async (presetId: string) => {
    setBusyAction(`preset:${presetId}`);
    try {
      const created = await api.installAiKnowledgeBookPreset(presetId);
      setSelectedBookId(created.id);
      setInstallMode('NONE');
      await onRefreshKnowledge();
      toast.success(`Knowledge Book "${created.title}" berhasil di-install`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal meng-install paket Knowledge Book');
    } finally {
      setBusyAction(null);
    }
  };

  const handleInstallUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl.trim()) return;
    setBusyAction('install-url');
    try {
      const created = await api.installAiKnowledgeBookUrl({
        url: importUrl.trim(),
        title: importUrlTitle.trim() || undefined,
      });
      setImportUrl('');
      setImportUrlTitle('');
      setInstallMode('NONE');
      setSelectedBookId(created.id);
      await onRefreshKnowledge();
      toast.success(`Diimpor "${created.title}" (${created.itemCount || 0} bab)`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengimpor halaman URL');
    } finally {
      setBusyAction(null);
    }
  };

  const handleInstallMarkdown = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mdTitle.trim() || !mdBody.trim()) return;
    setBusyAction('install-md');
    try {
      const created = await api.installAiKnowledgeBookMarkdown({
        title: mdTitle.trim(),
        category: mdCategory,
        rawText: mdBody.trim(),
      });
      setMdTitle('');
      setMdBody('');
      setInstallMode('NONE');
      setSelectedBookId(created.id);
      await onRefreshKnowledge();
      toast.success(`Knowledge Book "${created.title}" (${created.itemCount || 0} bab) di-install`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal memasang dokumen Markdown');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSyncCatalogBook = async () => {
    setBusyAction('sync-catalog');
    try {
      const book = await api.installAiKnowledgeBookCatalog();
      setSelectedBookId(book.id);
      await onRefreshKnowledge();
      toast.success(`Katalog Produk disinkronkan (${book.itemCount || 0} produk)`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyinkronkan Katalog Produk');
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleBook = async (book: AiKnowledgeBook) => {
    setBusyAction(`toggle-book:${book.id}`);
    try {
      await api.updateAiKnowledgeBook(book.id, { isActive: !book.isActive });
      await onRefreshKnowledge();
    } catch {
      toast.error('Gagal mengubah status Knowledge Book');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteBook = async () => {
    if (!deleteBookTarget) return;
    setBusyAction(`delete-book:${deleteBookTarget.id}`);
    try {
      await api.deleteAiKnowledgeBook(deleteBookTarget.id);
      if (selectedBookId === deleteBookTarget.id) setSelectedBookId('ALL');
      setDeleteBookTarget(null);
      await onRefreshKnowledge();
      toast.success('Knowledge Book dihapus');
    } catch {
      toast.error('Gagal menghapus Knowledge Book');
    } finally {
      setBusyAction(null);
    }
  };

  const handleAddKb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kbTitle.trim() || !kbContent.trim()) return;
    setSavingKb(true);
    try {
      await api.createAiKnowledge({
        bookId: selectedBook ? selectedBook.id : null,
        title: kbTitle.trim(),
        category: kbCategory,
        content: kbContent.trim(),
        sourceUrl: kbUrl.trim() || null,
      });
      setKbTitle('');
      setKbContent('');
      setKbUrl('');
      await onRefreshKnowledge();
      toast.success('Bab / entri Knowledge ditambahkan');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menambahkan knowledge');
    } finally {
      setSavingKb(false);
    }
  };

  const handleToggleItem = async (item: AiKnowledgeItem) => {
    setBusyAction(`toggle-item:${item.id}`);
    try {
      await api.updateAiKnowledge(item.id, { isActive: !item.isActive });
      await onRefreshKnowledge();
    } catch {
      toast.error('Gagal mengubah status entri knowledge');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteItem = async () => {
    if (!deleteItemTarget) return;
    setBusyAction(`delete-item:${deleteItemTarget.id}`);
    try {
      await api.deleteAiKnowledge(deleteItemTarget.id);
      setDeleteItemTarget(null);
      await onRefreshKnowledge();
      toast.success('Materi Knowledge dihapus');
    } catch {
      toast.error('Gagal menghapus materi knowledge');
    } finally {
      setBusyAction(null);
    }
  };

  const ungroupedCount = knowledge.filter((k) => !k.bookId).length;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Knowledge Book (Buku Pengetahuan AI)</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Buat buku pengetahuan sendiri, sinkronkan dari Katalog Produk, atau install dari paket template, URL web, dan dokumen Markdown.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={installMode === 'NEW_BOOK' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setInstallMode((m) => (m === 'NEW_BOOK' ? 'NONE' : 'NEW_BOOK'))}
          >
            Buat Buku Baru
          </Button>
          <Button
            type="button"
            variant={installMode === 'PRESET' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setInstallMode((m) => (m === 'PRESET' ? 'NONE' : 'PRESET'))}
          >
            Install Paket ({bookPresets.length})
          </Button>
          <Button
            type="button"
            variant={installMode === 'URL' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setInstallMode((m) => (m === 'URL' ? 'NONE' : 'URL'))}
          >
            Install dari URL
          </Button>
          <Button
            type="button"
            variant={installMode === 'MARKDOWN' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setInstallMode((m) => (m === 'MARKDOWN' ? 'NONE' : 'MARKDOWN'))}
          >
            Impor Markdown
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            isLoading={busyAction === 'sync-catalog'}
            onClick={() => void handleSyncCatalogBook()}
          >
            Sinkron Katalog Produk
          </Button>
        </div>
      </div>

      {installMode === 'NEW_BOOK' && (
        <form
          onSubmit={handleCreateBook}
          className="bg-white rounded-lg border border-gray-200 p-4 space-y-3"
        >
          <h3 className="text-xs font-semibold text-gray-900">Buat Knowledge Book Baru</h3>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <input
              type="text"
              required
              placeholder="Judul buku (mis. Panduan Garansi & Pengiriman)"
              value={bookTitle}
              onChange={(e) => setBookTitle(e.target.value)}
              className="sm:col-span-5 h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
            />
            <select
              value={bookCat}
              onChange={(e) => setBookCat(e.target.value)}
              className="sm:col-span-3 h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs"
            >
              <option value="GENERAL">Umum</option>
              <option value="FAQ">FAQ</option>
              <option value="CATALOG">Katalog</option>
              <option value="POLICY">Kebijakan</option>
              <option value="SOP">SOP</option>
            </select>
            <input
              type="text"
              placeholder="Deskripsi singkat (opsional)"
              value={bookDesc}
              onChange={(e) => setBookDesc(e.target.value)}
              className="sm:col-span-4 h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setInstallMode('NONE')}>
              Tutup
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={busyAction === 'create-book'}>
              Simpan Buku
            </Button>
          </div>
        </form>
      )}

      {installMode === 'PRESET' && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-900">Katalog Knowledge Book Siap Install</h3>
            <button
              type="button"
              onClick={() => setInstallMode('NONE')}
              className="text-[11px] text-gray-500 hover:text-gray-800"
            >
              Tutup
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {bookPresets.map((preset) => (
              <div
                key={preset.id}
                className="rounded-md border border-gray-200 p-3.5 flex flex-col justify-between gap-3 bg-gray-50/50"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-900">{preset.title}</span>
                    <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-semibold">
                      {preset.chapters.length} bab
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-relaxed">{preset.description}</p>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  isLoading={busyAction === `preset:${preset.id}`}
                  onClick={() => void handleInstallPreset(preset.id)}
                >
                  Install Buku Ini
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {installMode === 'URL' && (
        <form
          onSubmit={handleInstallUrl}
          className="bg-white rounded-lg border border-gray-200 p-4 space-y-3"
        >
          <h3 className="text-xs font-semibold text-gray-900">
            Install Knowledge Book dari Halaman Web / Dokumentasi URL
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <input
              type="url"
              required
              placeholder="https://domainanda.com/faq atau URL file Markdown mentah"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              className="sm:col-span-7 h-9 px-3 bg-white border border-gray-200 rounded-md text-xs font-mono"
            />
            <input
              type="text"
              placeholder="Judul buku kustom (opsional, otomatis dari judul web)"
              value={importUrlTitle}
              onChange={(e) => setImportUrlTitle(e.target.value)}
              className="sm:col-span-5 h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setInstallMode('NONE')}>
              Tutup
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={busyAction === 'install-url'}>
              Ambil &amp; Install
            </Button>
          </div>
        </form>
      )}

      {installMode === 'MARKDOWN' && (
        <form
          onSubmit={handleInstallMarkdown}
          className="bg-white rounded-lg border border-gray-200 p-4 space-y-3"
        >
          <h3 className="text-xs font-semibold text-gray-900">
            Impor Knowledge Book dari Dokumen Markdown / Teks SOP
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <input
              type="text"
              required
              placeholder="Judul Knowledge Book"
              value={mdTitle}
              onChange={(e) => setMdTitle(e.target.value)}
              className="sm:col-span-8 h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
            />
            <select
              value={mdCategory}
              onChange={(e) => setMdCategory(e.target.value)}
              className="sm:col-span-4 h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs"
            >
              <option value="SOP">SOP</option>
              <option value="FAQ">FAQ</option>
              <option value="POLICY">Kebijakan</option>
              <option value="CATALOG">Katalog</option>
            </select>
          </div>
          <textarea
            rows={5}
            required
            placeholder="Tempel teks atau Markdown (# Bab 1, ## Sub-bab)... Setiap heading otomatis dipecah menjadi bab terpisah."
            value={mdBody}
            onChange={(e) => setMdBody(e.target.value)}
            className="w-full p-2.5 bg-white border border-gray-200 rounded-md text-xs font-mono"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setInstallMode('NONE')}>
              Tutup
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={busyAction === 'install-md'}>
              Parse &amp; Install
            </Button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-4 bg-white rounded-lg border border-gray-200 p-4 space-y-2">
          <div className="text-xs font-semibold text-gray-900 pb-2 border-b border-gray-100">
            Daftar Buku ({books.length})
          </div>

          <button
            type="button"
            onClick={() => setSelectedBookId('ALL')}
            className={`w-full text-left px-3 py-2 rounded-md border text-xs flex items-center justify-between ${
              selectedBookId === 'ALL'
                ? 'border-indigo-300 bg-indigo-50/70 text-indigo-900 font-semibold'
                : 'border-gray-200 hover:bg-gray-50 text-gray-700'
            }`}
          >
            <span>Semua Materi</span>
            <span className="font-mono text-[11px]">{knowledge.length}</span>
          </button>

          {ungroupedCount > 0 && (
            <button
              type="button"
              onClick={() => setSelectedBookId('UNGROUPED')}
              className={`w-full text-left px-3 py-2 rounded-md border text-xs flex items-center justify-between ${
                selectedBookId === 'UNGROUPED'
                  ? 'border-indigo-300 bg-indigo-50/70 text-indigo-900 font-semibold'
                  : 'border-gray-200 hover:bg-gray-50 text-gray-700'
              }`}
            >
              <span>Materi Lepas (Umum)</span>
              <span className="font-mono text-[11px]">{ungroupedCount}</span>
            </button>
          )}

          {books.length === 0 ? (
            <p className="text-[11px] text-gray-500 py-2">
              Belum ada Knowledge Book. Buat buku baru atau install paket siap pakai di atas.
            </p>
          ) : (
            <div className="space-y-2 pt-1">
              {books.map((book) => {
                const isSelected = selectedBookId === book.id;
                return (
                  <div
                    key={book.id}
                    className={`rounded-md border p-2.5 space-y-1.5 transition-colors ${
                      isSelected ? 'border-indigo-300 bg-indigo-50/50' : 'border-gray-200 bg-white'
                    } ${book.isActive ? '' : 'opacity-65'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedBookId(book.id)}
                        className="text-left min-w-0 flex-1"
                      >
                        <div className="text-xs font-semibold text-gray-900 truncate">
                          {book.title}
                        </div>
                        {book.description && (
                          <div className="text-[11px] text-gray-500 line-clamp-2 mt-0.5">
                            {book.description}
                          </div>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteBookTarget(book)}
                        title="Hapus Buku"
                        className="p-1 text-gray-400 hover:text-rose-600 rounded shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1 text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">
                          {SOURCE_LABELS[book.sourceType] || book.sourceType}
                        </span>
                        <span className="font-mono text-gray-500">
                          {book.itemCount ?? knowledge.filter((k) => k.bookId === book.id).length} bab
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={busyAction === `toggle-book:${book.id}`}
                        onClick={() => void handleToggleBook(book)}
                        className={`px-2 py-0.5 rounded font-medium border ${
                          book.isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-gray-100 text-gray-600 border-gray-200'
                        }`}
                      >
                        {book.isActive ? 'Aktif' : 'Nonaktif'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-8 bg-white rounded-lg border border-gray-200 p-4 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-100">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                {selectedBook
                  ? selectedBook.title
                  : selectedBookId === 'UNGROUPED'
                    ? 'Materi Lepas (Tanpa Buku)'
                    : `Semua Bab & Materi (${visibleItems.length})`}
              </h3>
              {selectedBook?.sourceUrl && (
                <a
                  href={selectedBook.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-indigo-600 hover:underline break-all"
                >
                  {selectedBook.sourceUrl}
                </a>
              )}
            </div>
          </div>

          <form onSubmit={handleAddKb} className="space-y-2.5 pb-3 border-b border-gray-100">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <input
                type="text"
                required
                placeholder={
                  selectedBook
                    ? `Tambah bab baru ke "${selectedBook.title}"...`
                    : 'Judul bab / materi FAQ / kebijakan...'
                }
                value={kbTitle}
                onChange={(e) => setKbTitle(e.target.value)}
                className="sm:col-span-8 h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
              />
              <select
                value={kbCategory}
                onChange={(e) => setKbCategory(e.target.value as any)}
                className="sm:col-span-4 h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs"
              >
                <option value="FAQ">FAQ</option>
                <option value="CATALOG">Katalog Produk</option>
                <option value="POLICY">Kebijakan</option>
                <option value="WEB">Halaman Web</option>
              </select>
            </div>
            <textarea
              rows={2}
              required
              placeholder="Isi materi atau jawaban..."
              value={kbContent}
              onChange={(e) => setKbContent(e.target.value)}
              className="w-full p-2.5 bg-white border border-gray-200 rounded-md text-xs"
            />
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                placeholder="URL Referensi (opsional)"
                value={kbUrl}
                onChange={(e) => setKbUrl(e.target.value)}
                className="flex-1 h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
              />
              <Button type="submit" variant="primary" size="sm" isLoading={savingKb}>
                Tambah Materi
              </Button>
            </div>
          </form>

          {visibleItems.length === 0 ? (
            <EmptyState
              title="Belum ada bab di bagian ini"
              description="Tambahkan materi di form di atas atau install Knowledge Book dari paket / URL / Katalog Produk."
            />
          ) : (
            <div className="divide-y divide-gray-200 max-h-[480px] overflow-y-auto pr-1">
              {visibleItems.map((k) => {
                const parentBook = k.bookId ? bookMap.get(k.bookId) : null;
                return (
                  <div
                    key={k.id}
                    className={`py-2.5 flex items-start justify-between gap-2 ${
                      k.isActive ? '' : 'opacity-60'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700">
                          {k.category}
                        </span>
                        {parentBook && selectedBookId === 'ALL' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700">
                            {parentBook.title}
                          </span>
                        )}
                        <span className="text-xs font-semibold text-gray-900">{k.title}</span>
                      </div>
                      <p className="text-xs text-gray-600 whitespace-pre-wrap">{k.content}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={busyAction === `toggle-item:${k.id}`}
                        onClick={() => void handleToggleItem(k)}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                          k.isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-gray-100 text-gray-600 border-gray-200'
                        }`}
                      >
                        {k.isActive ? 'Aktif' : 'Nonaktif'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteItemTarget(k)}
                        className="p-1 text-gray-400 hover:text-rose-600 rounded"
                        title="Hapus"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={Boolean(deleteBookTarget)}
        onClose={() => setDeleteBookTarget(null)}
        onConfirm={() => void handleDeleteBook()}
        isLoading={Boolean(deleteBookTarget && busyAction === `delete-book:${deleteBookTarget.id}`)}
        title="Hapus Knowledge Book?"
        description={
          deleteBookTarget
            ? `Buku "${deleteBookTarget.title}" beserta seluruh bab di dalamnya akan dihapus.`
            : ''
        }
        confirmLabel="Hapus Buku"
        variant="danger"
      />

      <ConfirmModal
        isOpen={Boolean(deleteItemTarget)}
        onClose={() => setDeleteItemTarget(null)}
        onConfirm={() => void handleDeleteItem()}
        isLoading={Boolean(deleteItemTarget && busyAction === `delete-item:${deleteItemTarget.id}`)}
        title="Hapus Materi Knowledge?"
        description={
          deleteItemTarget
            ? `Materi "${deleteItemTarget.title}" akan dihapus dari Knowledge Book.`
            : ''
        }
        confirmLabel="Hapus"
        variant="danger"
      />
    </div>
  );
};
