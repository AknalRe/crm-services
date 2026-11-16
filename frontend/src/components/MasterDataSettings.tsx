import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Zap,
  Package,
  Tag,
  FileText,
  Search,
  Edit3,
  Trash2,
  Copy,
  Check,
} from 'lucide-react';
import api from '../services/api';
import {
  CannedResponse,
  CrmLabelColor,
  CrmLabelItem,
  CrmLabelScope,
  MessageTemplateItem,
  OmnichannelType,
  ProductItem,
} from '../types';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { ConfirmModal } from './ui/ConfirmModal';
import { LoadingState, EmptyState, ErrorState } from './ui/StateBlocks';
import { useToast } from './ui/ToastProvider';

export type MasterDataSection = 'quick_replies' | 'products' | 'labels' | 'templates';

const QUICK_REPLY_PRESET_CATEGORIES = ['Umum', 'Harga', 'Order', 'Pembayaran', 'Follow Up', 'Komplain'];
const TEMPLATE_PRESET_CATEGORIES = ['Promo', 'Follow Up', 'Informasi', 'Ucapan', 'Umum'];
const PRODUCT_UNITS = ['pcs', 'paket', 'bulan', 'tahun', 'jam', 'unit', 'layanan'];

export const LABEL_COLOR_MAP: Record<
  CrmLabelColor,
  { label: string; badge: string; dot: string }
> = {
  slate: { label: 'Abu-abu', badge: 'bg-slate-100 text-slate-700 border-slate-300', dot: 'bg-slate-500' },
  indigo: { label: 'Biru Indigo', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500' },
  emerald: { label: 'Hijau', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  amber: { label: 'Kuning / VIP', badge: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
  rose: { label: 'Merah', badge: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
  sky: { label: 'Biru Langit', badge: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500' },
  violet: { label: 'Ungu', badge: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
};

const TEMPLATE_CHANNEL_LABELS: Record<'ALL' | OmnichannelType, string> = {
  ALL: 'Semua Kanal',
  WHATSAPP: 'WhatsApp (WAHA)',
  WHATSAPP_CLOUD: 'WhatsApp Cloud',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  THREADS: 'Threads',
  TELEGRAM: 'Telegram',
};

interface MasterDataSettingsProps {
  section: MasterDataSection;
}

export const MasterDataSettings: React.FC<MasterDataSettingsProps> = ({ section }) => {
  if (section === 'quick_replies') return <QuickRepliesMaster />;
  if (section === 'products') return <ProductsMaster />;
  if (section === 'labels') return <LabelsCategoriesMaster />;
  return <TemplatesMaster />;
};

// -----------------------------------------------------------------------------
// 1. Master Balasan Cepat (/kode)
// -----------------------------------------------------------------------------
const QuickRepliesMaster: React.FC = () => {
  const toast = useToast();
  const [items, setItems] = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CannedResponse | null>(null);
  const [shortCode, setShortCode] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Umum');
  const [content, setContent] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<CannedResponse | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getMasterQuickReplies();
      setItems(list);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal memuat master balasan cepat');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const categories = useMemo(
    () =>
      Array.from(
        new Set([...QUICK_REPLY_PRESET_CATEGORIES, ...items.map((i) => i.category || 'Umum')])
      ),
    [items]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (catFilter !== 'ALL' && (item.category || 'Umum') !== catFilter) return false;
      if (!q) return true;
      return (
        item.shortCode.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q)
      );
    });
  }, [items, search, catFilter]);

  const openCreate = () => {
    setEditing(null);
    setShortCode('');
    setTitle('');
    setCategory('Umum');
    setContent('');
    setIsActive(true);
    setModalOpen(true);
  };

  const openEdit = (item: CannedResponse) => {
    setEditing(item);
    setShortCode(item.shortCode);
    setTitle(item.title);
    setCategory(item.category || 'Umum');
    setContent(item.content);
    setIsActive(item.isActive !== false);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shortCode.trim() || !title.trim() || !content.trim() || saving) return;
    setSaving(true);
    try {
      if (editing) {
        const updated = await api.updateMasterQuickReply(editing.id, {
          shortCode: shortCode.trim(),
          title: title.trim(),
          category: category.trim() || 'Umum',
          content: content.trim(),
          isActive,
        });
        setItems((prev) => prev.map((x) => (x.id === editing.id ? updated : x)));
        toast.success(`Balasan cepat /${updated.shortCode} diperbarui`);
      } else {
        const created = await api.createMasterQuickReply({
          shortCode: shortCode.trim(),
          title: title.trim(),
          category: category.trim() || 'Umum',
          content: content.trim(),
          isActive,
        });
        setItems((prev) => [...prev, created]);
        toast.success(`Balasan cepat /${created.shortCode} ditambahkan`);
      }
      setModalOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan balasan cepat');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: CannedResponse) => {
    try {
      const updated = await api.updateMasterQuickReply(item.id, { isActive: !(item.isActive !== false) });
      setItems((prev) => prev.map((x) => (x.id === item.id ? updated : x)));
    } catch {
      toast.error('Gagal mengubah status balasan cepat');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await api.deleteMasterQuickReply(deleteTarget.id);
      setItems((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      toast.success(`Balasan cepat /${deleteTarget.shortCode} dihapus`);
      setDeleteTarget(null);
    } catch {
      toast.error('Gagal menghapus balasan cepat');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-200">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            Master Balasan Cepat (Quick Replies)
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Ketik <code className="font-mono bg-gray-100 px-1 rounded">/kode</code> di Inbox Live Chat untuk menyisipkan template secara instan.
          </p>
        </div>
        <Button type="button" variant="primary" size="sm" onClick={openCreate}>
          Tambah Balasan Cepat
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari kode singkat, judul, atau isi balasan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-8 pr-3 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
          />
        </div>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs text-gray-700 sm:w-44 focus:outline-none focus:border-indigo-500"
        >
          <option value="ALL">Semua Kategori</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingState message="Memuat daftar balasan cepat..." />
      ) : error ? (
        <ErrorState message={error} onRetry={loadItems} />
      ) : filtered.length === 0 ? (
        items.length > 0 ? (
          <EmptyState
            icon={<Search className="w-6 h-6" />}
            title="Tidak ada balasan cepat yang cocok"
            description="Coba ubah kata kunci pencarian atau pilih semua kategori."
            action={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setCatFilter('ALL');
                }}
              >
                Reset Filter
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Zap className="w-6 h-6" />}
            title="Belum ada balasan cepat"
            description="Buat shortcut seperti /sapa, /harga, atau /pembayaran agar agent menjawab chat lebih konsisten."
            action={
              <Button type="button" variant="secondary" size="sm" onClick={openCreate}>
                Tambah Template Pertama
              </Button>
            }
          />
        )
      ) : (
        <>
          <div className="sm:hidden space-y-2.5">
            {filtered.map((item) => {
              const active = item.isActive !== false;
              return (
                <div key={item.id} className="p-3 rounded-lg border border-gray-200 bg-gray-50/40 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex items-center flex-wrap gap-1.5">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono text-[11px] font-semibold">
                        /{item.shortCode}
                      </span>
                      <span className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px]">
                        {item.category || 'Umum'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleToggleActive(item)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer shrink-0 ${
                        active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-gray-100 text-gray-500 border-gray-200'
                      }`}
                    >
                      {active ? 'Aktif' : 'Nonaktif'}
                    </button>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-900">{item.title}</div>
                    <p className="text-xs text-gray-600 whitespace-pre-wrap line-clamp-3 mt-1">{item.content}</p>
                  </div>
                  <div className="flex items-center justify-end gap-1 pt-1 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(item.content);
                        setCopiedId(item.id);
                        setTimeout(() => setCopiedId(null), 1500);
                        toast.success('Teks balasan disalin');
                      }}
                      className="h-7 px-2 rounded border border-gray-200 bg-white inline-flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-900"
                    >
                      {copiedId === item.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>Salin</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="h-7 px-2 rounded border border-gray-200 bg-white inline-flex items-center gap-1 text-[11px] text-gray-600 hover:text-indigo-700"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      className="h-7 px-2 rounded border border-gray-200 bg-white inline-flex items-center gap-1 text-[11px] text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Hapus</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden sm:block overflow-x-auto border border-gray-200 rounded-md">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase text-gray-500">
                  <th className="py-2 px-3">Kode</th>
                  <th className="py-2 px-3">Judul &amp; Kategori</th>
                  <th className="py-2 px-3">Isi Balasan</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((item) => {
                  const active = item.isActive !== false;
                  return (
                    <tr key={item.id} className="hover:bg-gray-50 align-top">
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono text-[11px] font-semibold">
                          /{item.shortCode}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 min-w-[150px]">
                        <div className="font-medium text-gray-900">{item.title}</div>
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px]">
                          {item.category || 'Umum'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-gray-600 max-w-md">
                        <p className="line-clamp-2 whitespace-pre-wrap">{item.content}</p>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => void handleToggleActive(item)}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer ${
                            active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-gray-100 text-gray-500 border-gray-200'
                          }`}
                        >
                          {active ? 'Aktif' : 'Nonaktif'}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center rounded-md border border-gray-200 bg-white divide-x divide-gray-200 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(item.content);
                              setCopiedId(item.id);
                              setTimeout(() => setCopiedId(null), 1500);
                              toast.success('Teks balasan disalin');
                            }}
                            className="h-7 w-7 inline-flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                            title="Salin Isi Balasan"
                          >
                            {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            className="h-7 w-7 inline-flex items-center justify-center text-gray-500 hover:text-indigo-700 hover:bg-indigo-50"
                            title="Edit"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            className="h-7 w-7 inline-flex items-center justify-center text-gray-500 hover:text-red-700 hover:bg-red-50"
                            title="Hapus"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? `Edit Balasan Cepat /${editing.shortCode}` : 'Tambah Balasan Cepat Baru'}
        subtitle="Gunakan variabel {nama_panggilan} atau {nama_lengkap} agar personal saat disisipkan ke chat."
        isLoading={saving}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" form="quick-reply-form" variant="primary" isLoading={saving}>
              {editing ? 'Simpan Perubahan' : 'Simpan Balasan Cepat'}
            </Button>
          </>
        }
      >
        <form id="quick-reply-form" onSubmit={handleSave} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Kode Singkat (/kode)</label>
              <div className="flex items-center border border-gray-200 rounded-md overflow-hidden focus-within:border-indigo-500 bg-white">
                <span className="px-2.5 h-9 inline-flex items-center bg-gray-50 border-r border-gray-200 text-xs font-mono text-gray-500">
                  /
                </span>
                <input
                  type="text"
                  required
                  placeholder="mis. sapa, harga, ongkir"
                  value={shortCode}
                  onChange={(e) => setShortCode(e.target.value)}
                  className="flex-1 min-w-0 h-9 px-2.5 text-xs font-mono focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Kategori</label>
              <input
                type="text"
                list="qr-categories-list"
                placeholder="Umum, Harga, Order..."
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
              />
              <datalist id="qr-categories-list">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Judul Template</label>
            <input
              type="text"
              required
              placeholder="Contoh: Sapaan Awal Pelanggan Baru"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
              <label className="text-xs font-medium text-gray-700">Isi Balasan</label>
              <div className="flex flex-wrap gap-1">
                {['{nama_panggilan}', '{nama_lengkap}'].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() =>
                      setContent((prev) => `${prev}${!prev || prev.endsWith(' ') || prev.endsWith('\n') ? '' : ' '}${chip}`)
                    }
                    className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-mono hover:bg-indigo-100"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              rows={4}
              required
              placeholder="Halo {nama_panggilan}, ada yang bisa kami bantu hari ini?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full p-2.5 bg-white border border-gray-200 rounded-md text-xs leading-relaxed focus:outline-none focus:border-indigo-500"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600"
            />
            <span>Aktif (tampil di pilihan /kode Live Chat CRM)</span>
          </label>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        isLoading={deleting}
        title={`Hapus Balasan Cepat /${deleteTarget?.shortCode}?`}
        description="Template ini akan dihapus dari daftar quick reply semua agent."
        confirmLabel="Ya, Hapus"
        variant="danger"
      />
    </div>
  );
};

// -----------------------------------------------------------------------------
// 2. Master Katalog Produk & Jasa
// -----------------------------------------------------------------------------
const ProductsMaster: React.FC = () => {
  const toast = useToast();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProductItem | null>(null);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ProductItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getProducts(false);
      setProducts(list || []);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal memuat katalog produk');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const categories = useMemo(
    () =>
      Array.from(new Set(products.map((p) => (p.category || '').trim()).filter(Boolean))).sort(),
    [products]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (catFilter !== 'ALL' && (p.category || '') !== catFilter) return false;
      if (!q) return true;
      return (
        p.sku.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      );
    });
  }, [products, search, catFilter]);

  const openCreate = () => {
    setEditing(null);
    setSku('');
    setName('');
    setCategory('');
    setPrice('');
    setUnit('pcs');
    setDescription('');
    setIsActive(true);
    setModalOpen(true);
  };

  const openEdit = (p: ProductItem) => {
    setEditing(p);
    setSku(p.sku);
    setName(p.name);
    setCategory(p.category || '');
    setPrice(String(p.price ?? 0));
    setUnit(p.unit || 'pcs');
    setDescription(p.description || '');
    setIsActive(p.isActive);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      if (editing) {
        const updated = await api.updateProduct(editing.id, {
          sku: sku.trim() || editing.sku,
          name: name.trim(),
          category: category.trim(),
          price: Number(price) || 0,
          unit: unit.trim() || 'pcs',
          description: description.trim(),
          isActive,
        });
        setProducts((prev) => prev.map((x) => (x.id === editing.id ? updated : x)));
        toast.success(`Produk "${updated.name}" diperbarui`);
      } else {
        const created = await api.createProduct({
          sku: sku.trim() || undefined,
          name: name.trim(),
          category: category.trim() || undefined,
          price: Number(price) || 0,
          unit: unit.trim() || 'pcs',
          description: description.trim() || undefined,
        });
        setProducts((prev) => [...prev, created]);
        toast.success(`Produk "${created.name}" ditambahkan`);
      }
      setModalOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan produk');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (p: ProductItem) => {
    try {
      const updated = await api.updateProduct(p.id, { isActive: !p.isActive });
      setProducts((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
    } catch {
      toast.error('Gagal memperbarui status produk');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await api.deleteProduct(deleteTarget.id);
      setProducts((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      toast.success(`Produk "${deleteTarget.name}" dihapus`);
      setDeleteTarget(null);
    } catch {
      toast.error('Gagal menghapus produk');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-200">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            Master Katalog Produk &amp; Layanan
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Daftar produk/jasa untuk penawaran cepat (Quick Quote) saat agent membalas pelanggan di Inbox CRM.
          </p>
        </div>
        <Button type="button" variant="primary" size="sm" onClick={openCreate}>
          Tambah Produk
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari SKU, nama produk, atau deskripsi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-8 pr-3 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
          />
        </div>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs text-gray-700 sm:w-44 focus:outline-none focus:border-indigo-500"
        >
          <option value="ALL">Semua Kategori</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingState message="Memuat katalog produk..." />
      ) : error ? (
        <ErrorState message={error} onRetry={loadProducts} />
      ) : filtered.length === 0 ? (
        products.length > 0 ? (
          <EmptyState
            icon={<Search className="w-6 h-6" />}
            title="Tidak ada produk yang cocok"
            description="Coba ubah kata kunci pencarian atau pilih semua kategori."
            action={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setCatFilter('ALL');
                }}
              >
                Reset Filter
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Package className="w-6 h-6" />}
            title="Belum ada produk di katalog"
            description="Tambahkan produk atau paket layanan agar agent dapat menyisipkan harga & deskripsi langsung di chat."
            action={
              <Button type="button" variant="secondary" size="sm" onClick={openCreate}>
                Tambah Produk Pertama
              </Button>
            }
          />
        )
      ) : (
        <>
          <div className="sm:hidden space-y-2.5">
            {filtered.map((p) => (
              <div key={p.id} className="p-3 rounded-lg border border-gray-200 bg-gray-50/40 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="inline-block font-mono text-[11px] text-gray-600 bg-white border border-gray-200 px-1.5 py-0.5 rounded">
                      {p.sku}
                    </span>
                    <div className="text-xs font-semibold text-gray-900 mt-1">{p.name}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleToggleActive(p)}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer shrink-0 ${
                      p.isActive
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-gray-100 text-gray-500 border-gray-200'
                    }`}
                  >
                    {p.isActive ? 'Aktif' : 'Nonaktif'}
                  </button>
                </div>
                {p.description && <p className="text-[11px] text-gray-500">{p.description}</p>}
                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-gray-100">
                  <div className="text-xs">
                    <span className="font-mono font-semibold text-gray-900">
                      Rp {new Intl.NumberFormat('id-ID').format(p.price || 0)}
                    </span>{' '}
                    <span className="text-gray-500 text-[11px]">/ {p.unit}</span>
                    {p.category && <span className="ml-1.5 text-[10px] text-gray-500">· {p.category}</span>}
                  </div>
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="h-7 px-2 rounded border border-gray-200 bg-white inline-flex items-center gap-1 text-[11px] text-gray-600 hover:text-indigo-700"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(p)}
                      className="h-7 px-2 rounded border border-gray-200 bg-white inline-flex items-center gap-1 text-[11px] text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Hapus</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden sm:block overflow-x-auto border border-gray-200 rounded-md">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase text-gray-500">
                  <th className="py-2 px-3">SKU</th>
                  <th className="py-2 px-3">Produk / Jasa</th>
                  <th className="py-2 px-3">Kategori</th>
                  <th className="py-2 px-3">Harga</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 align-top">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-gray-600 whitespace-nowrap">{p.sku}</td>
                    <td className="py-2.5 px-3 font-medium text-gray-900 min-w-[180px]">
                      <div>{p.name}</div>
                      {p.description && <div className="text-[11px] text-gray-500 font-normal mt-0.5">{p.description}</div>}
                    </td>
                    <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">{p.category || '-'}</td>
                    <td className="py-2.5 px-3 font-mono text-gray-900 whitespace-nowrap">
                      Rp {new Intl.NumberFormat('id-ID').format(p.price || 0)} / {p.unit}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => void handleToggleActive(p)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer ${
                          p.isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-gray-100 text-gray-500 border-gray-200'
                        }`}
                      >
                        {p.isActive ? 'Aktif' : 'Nonaktif'}
                      </button>
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center rounded-md border border-gray-200 bg-white divide-x divide-gray-200 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="h-7 w-7 inline-flex items-center justify-center text-gray-500 hover:text-indigo-700 hover:bg-indigo-50"
                          title="Edit Produk"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(p)}
                          className="h-7 w-7 inline-flex items-center justify-center text-gray-500 hover:text-red-700 hover:bg-red-50"
                          title="Hapus Produk"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? `Edit Produk "${editing.name}"` : 'Tambah Produk Baru'}
        isLoading={saving}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" form="product-master-form" variant="primary" isLoading={saving}>
              {editing ? 'Simpan Perubahan' : 'Simpan Produk'}
            </Button>
          </>
        }
      >
        <form id="product-master-form" onSubmit={handleSave} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Kode SKU (Opsional)</label>
              <input
                type="text"
                placeholder="Auto jika kosong (mis. PRD-001)"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Kategori</label>
              <input
                type="text"
                placeholder="Paket, Konsultasi, Produk Fisik..."
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nama Produk / Jasa</label>
            <input
              type="text"
              required
              placeholder="Contoh: Paket Maintenance Website Tahunan"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Harga (Rp)</label>
              <input
                type="number"
                min={0}
                required
                placeholder="150000"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Satuan</label>
              <input
                type="text"
                list="product-units-list"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
              />
              <datalist id="product-units-list">
                {PRODUCT_UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Deskripsi Singkat</label>
            <textarea
              rows={3}
              placeholder="Keterangan singkat yang akan ikut terkirim saat agent menyisipkan penawaran..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-2.5 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          {editing && (
            <label className="inline-flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600"
              />
              <span>Aktif (tampil di Quick Quote Live Chat)</span>
            </label>
          )}
        </form>
      </Modal>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        isLoading={deleting}
        title={`Hapus Produk "${deleteTarget?.name}"?`}
        description="Produk akan dihapus permanen dari daftar Quick Quote."
        confirmLabel="Ya, Hapus"
        variant="danger"
      />
    </div>
  );
};

// -----------------------------------------------------------------------------
// 3. Master Label Percakapan & Kategori Kontak
// -----------------------------------------------------------------------------
const LabelsCategoriesMaster: React.FC = () => {
  const toast = useToast();
  const [scope, setScope] = useState<CrmLabelScope>('CONVERSATION_LABEL');
  const [items, setItems] = useState<CrmLabelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CrmLabelItem | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState<CrmLabelColor>('indigo');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState('10');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<CrmLabelItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadLabels = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getMasterLabels();
      setItems(list);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal memuat master label & kategori');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLabels();
  }, [loadLabels]);

  const scopedItems = useMemo(
    () => items.filter((item) => item.scope === scope),
    [items, scope]
  );

  const openCreate = () => {
    setEditing(null);
    setName('');
    setColor(scope === 'CONVERSATION_LABEL' ? 'indigo' : 'slate');
    setDescription('');
    setSortOrder(String((scopedItems.length + 1) * 10));
    setIsActive(true);
    setModalOpen(true);
  };

  const openEdit = (item: CrmLabelItem) => {
    setEditing(item);
    setName(item.name);
    setColor(item.color);
    setDescription(item.description || '');
    setSortOrder(String(item.sortOrder));
    setIsActive(item.isActive);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      if (editing) {
        const updated = await api.updateMasterLabel(editing.id, {
          name: name.trim(),
          color,
          description: description.trim() || null,
          sortOrder: Number(sortOrder) || 10,
          isActive,
        });
        setItems((prev) => prev.map((x) => (x.id === editing.id ? updated : x)));
        toast.success(`"${updated.name}" diperbarui`);
      } else {
        const created = await api.createMasterLabel({
          scope,
          name: name.trim(),
          color,
          description: description.trim() || null,
          sortOrder: Number(sortOrder) || 10,
          isActive,
        });
        setItems((prev) => [...prev, created]);
        toast.success(`"${created.name}" ditambahkan`);
      }
      setModalOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan label/kategori');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: CrmLabelItem) => {
    try {
      const updated = await api.updateMasterLabel(item.id, { isActive: !item.isActive });
      setItems((prev) => prev.map((x) => (x.id === item.id ? updated : x)));
    } catch {
      toast.error('Gagal memperbarui status');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await api.deleteMasterLabel(deleteTarget.id);
      setItems((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      toast.success(`"${deleteTarget.name}" dihapus`);
      setDeleteTarget(null);
    } catch {
      toast.error('Gagal menghapus data');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-200">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            Master Label Percakapan &amp; Kategori Kontak
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Standarisasi label tiket di Inbox CRM dan kelompok kategori pada halaman Kontak Pelanggan.
          </p>
        </div>
        <Button type="button" variant="primary" size="sm" onClick={openCreate}>
          {scope === 'CONVERSATION_LABEL' ? 'Tambah Label Inbox' : 'Tambah Kategori Kontak'}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setScope('CONVERSATION_LABEL')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
            scope === 'CONVERSATION_LABEL'
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Label Percakapan Inbox ({items.filter((i) => i.scope === 'CONVERSATION_LABEL').length})
        </button>
        <button
          type="button"
          onClick={() => setScope('CONTACT_CATEGORY')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
            scope === 'CONTACT_CATEGORY'
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Kategori Pelanggan ({items.filter((i) => i.scope === 'CONTACT_CATEGORY').length})
        </button>
      </div>

      {loading ? (
        <LoadingState message="Memuat daftar label & kategori..." />
      ) : error ? (
        <ErrorState message={error} onRetry={loadLabels} />
      ) : scopedItems.length === 0 ? (
        <EmptyState
          icon={<Tag className="w-6 h-6" />}
          title="Belum ada data pada kelompok ini"
          description="Tambahkan item baru agar tampil sebagai pilihan standar tim Anda."
        />
      ) : (
        <>
          <div className="sm:hidden space-y-2.5">
            {scopedItems.map((item) => {
              const colorStyle = LABEL_COLOR_MAP[item.color] || LABEL_COLOR_MAP.slate;
              return (
                <div key={item.id} className="p-3 rounded-lg border border-gray-200 bg-gray-50/40 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-medium ${colorStyle.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${colorStyle.dot}`} />
                      {item.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleToggleActive(item)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer shrink-0 ${
                        item.isActive
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-gray-100 text-gray-500 border-gray-200'
                      }`}
                    >
                      {item.isActive ? 'Aktif' : 'Nonaktif'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-600">{item.description || 'Tanpa keterangan'}</p>
                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-gray-100">
                    <span className="font-mono text-[11px] text-gray-500">Urutan #{item.sortOrder}</span>
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="h-7 px-2 rounded border border-gray-200 bg-white inline-flex items-center gap-1 text-[11px] text-gray-600 hover:text-indigo-700"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item)}
                        className="h-7 px-2 rounded border border-gray-200 bg-white inline-flex items-center gap-1 text-[11px] text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden sm:block overflow-x-auto border border-gray-200 rounded-md">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase text-gray-500">
                  <th className="py-2 px-3">Tampilan Badge</th>
                  <th className="py-2 px-3">Keterangan</th>
                  <th className="py-2 px-3">Urutan</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {scopedItems.map((item) => {
                  const colorStyle = LABEL_COLOR_MAP[item.color] || LABEL_COLOR_MAP.slate;
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-medium ${colorStyle.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${colorStyle.dot}`} />
                          {item.name}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-gray-600">{item.description || '-'}</td>
                      <td className="py-2.5 px-3 font-mono text-gray-500 tabular-nums">{item.sortOrder}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => void handleToggleActive(item)}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer ${
                            item.isActive
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-gray-100 text-gray-500 border-gray-200'
                          }`}
                        >
                          {item.isActive ? 'Aktif' : 'Nonaktif'}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center rounded-md border border-gray-200 bg-white divide-x divide-gray-200 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            className="h-7 w-7 inline-flex items-center justify-center text-gray-500 hover:text-indigo-700 hover:bg-indigo-50"
                            title="Edit"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            className="h-7 w-7 inline-flex items-center justify-center text-gray-500 hover:text-red-700 hover:bg-red-50"
                            title="Hapus"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={
          editing
            ? `Edit ${editing.scope === 'CONVERSATION_LABEL' ? 'Label Inbox' : 'Kategori Kontak'}`
            : scope === 'CONVERSATION_LABEL'
              ? 'Tambah Label Inbox Baru'
              : 'Tambah Kategori Kontak Baru'
        }
        isLoading={saving}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" form="label-master-form" variant="primary" isLoading={saving}>
              {editing ? 'Simpan Perubahan' : 'Simpan'}
            </Button>
          </>
        }
      >
        <form id="label-master-form" onSubmit={handleSave} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nama Label / Kategori</label>
            <input
              type="text"
              required
              placeholder="Contoh: Prioritas, Reseller, Menunggu Bayar"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Warna Badge</label>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(LABEL_COLOR_MAP) as CrmLabelColor[]).map((cKey) => {
                  const style = LABEL_COLOR_MAP[cKey];
                  const selected = color === cKey;
                  return (
                    <button
                      key={cKey}
                      type="button"
                      onClick={() => setColor(cKey)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] ${
                        style.badge
                      } ${selected ? 'ring-2 ring-indigo-500 ring-offset-1 font-semibold' : 'opacity-80 hover:opacity-100'}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                      {style.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Urutan Tampil</label>
              <input
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Keterangan (Opsional)</label>
            <input
              type="text"
              placeholder="Penjelasan kapan label/kategori ini dipakai agent..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600"
            />
            <span>Aktif (muncul sebagai pilihan di halaman operasional)</span>
          </label>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        isLoading={deleting}
        title={`Hapus "${deleteTarget?.name}"?`}
        description="Item ini akan dihapus dari daftar pilihan standar."
        confirmLabel="Ya, Hapus"
        variant="danger"
      />
    </div>
  );
};

// -----------------------------------------------------------------------------
// 4. Master Template Siaran & Pesan
// -----------------------------------------------------------------------------
const TemplatesMaster: React.FC = () => {
  const toast = useToast();
  const [items, setItems] = useState<MessageTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MessageTemplateItem | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Promo');
  const [channel, setChannel] = useState<'ALL' | OmnichannelType>('ALL');
  const [content, setContent] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<MessageTemplateItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getMessageTemplates();
      setItems(list);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal memuat template siaran');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const categories = useMemo(
    () => Array.from(new Set([...TEMPLATE_PRESET_CATEGORIES, ...items.map((i) => i.category || 'Umum')])),
    [items]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((t) => {
      if (catFilter !== 'ALL' && t.category !== catFilter) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q);
    });
  }, [items, search, catFilter]);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setCategory('Promo');
    setChannel('ALL');
    setContent('');
    setIsActive(true);
    setModalOpen(true);
  };

  const openEdit = (item: MessageTemplateItem) => {
    setEditing(item);
    setName(item.name);
    setCategory(item.category);
    setChannel(item.channel);
    setContent(item.content);
    setIsActive(item.isActive);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !content.trim() || saving) return;
    setSaving(true);
    try {
      if (editing) {
        const updated = await api.updateMessageTemplate(editing.id, {
          name: name.trim(),
          category: category.trim() || 'Umum',
          channel,
          content: content.trim(),
          isActive,
        });
        setItems((prev) => prev.map((x) => (x.id === editing.id ? updated : x)));
        toast.success(`Template "${updated.name}" diperbarui`);
      } else {
        const created = await api.createMessageTemplate({
          name: name.trim(),
          category: category.trim() || 'Umum',
          channel,
          content: content.trim(),
          isActive,
        });
        setItems((prev) => [...prev, created]);
        toast.success(`Template "${created.name}" ditambahkan`);
      }
      setModalOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan template pesan');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: MessageTemplateItem) => {
    try {
      const updated = await api.updateMessageTemplate(item.id, { isActive: !item.isActive });
      setItems((prev) => prev.map((x) => (x.id === item.id ? updated : x)));
    } catch {
      toast.error('Gagal memperbarui status template');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await api.deleteMessageTemplate(deleteTarget.id);
      setItems((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      toast.success(`Template "${deleteTarget.name}" dihapus`);
      setDeleteTarget(null);
    } catch {
      toast.error('Gagal menghapus template');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-200">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            Master Template Pesan &amp; Siaran
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Kumpulan naskah siap pakai untuk kampanye Siaran &amp; Follow Up tanpa mengetik ulang.
          </p>
        </div>
        <Button type="button" variant="primary" size="sm" onClick={openCreate}>
          Tambah Template
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari nama template atau isi pesan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-8 pr-3 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
          />
        </div>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs text-gray-700 sm:w-44 focus:outline-none focus:border-indigo-500"
        >
          <option value="ALL">Semua Kategori</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingState message="Memuat daftar template pesan..." />
      ) : error ? (
        <ErrorState message={error} onRetry={loadTemplates} />
      ) : filtered.length === 0 ? (
        items.length > 0 ? (
          <EmptyState
            icon={<Search className="w-6 h-6" />}
            title="Tidak ada template yang cocok"
            description="Coba ubah kata kunci pencarian atau pilih semua kategori."
            action={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setCatFilter('ALL');
                }}
              >
                Reset Filter
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<FileText className="w-6 h-6" />}
            title="Belum ada template siaran"
            description="Simpan naskah promo, pengingat tagihan, atau follow up untuk langsung dipakai di menu Siaran."
            action={
              <Button type="button" variant="secondary" size="sm" onClick={openCreate}>
                Buat Template Pertama
              </Button>
            }
          />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((item) => (
            <div key={item.id} className="p-3.5 rounded-lg border border-gray-200 bg-gray-50/50 space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-gray-900 truncate">{item.name}</h4>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px]">
                        {item.category}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-white text-gray-600 border border-gray-200 text-[10px]">
                        {TEMPLATE_CHANNEL_LABELS[item.channel] || item.channel}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleToggleActive(item)}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer shrink-0 ${
                      item.isActive
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-gray-100 text-gray-500 border-gray-200'
                    }`}
                  >
                    {item.isActive ? 'Aktif' : 'Nonaktif'}
                  </button>
                </div>
                <p className="text-xs text-gray-600 whitespace-pre-wrap line-clamp-4 bg-white p-2.5 rounded border border-gray-200/80">
                  {item.content}
                </p>
              </div>
              <div className="flex items-center justify-end gap-1.5 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(item)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => setDeleteTarget(item)}
                >
                  Hapus
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? `Edit Template "${editing.name}"` : 'Tambah Template Siaran Baru'}
        isLoading={saving}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" form="template-master-form" variant="primary" isLoading={saving}>
              {editing ? 'Simpan Perubahan' : 'Simpan Template'}
            </Button>
          </>
        }
      >
        <form id="template-master-form" onSubmit={handleSave} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nama Template</label>
            <input
              type="text"
              required
              placeholder="Contoh: Promo Akhir Bulan Diskon 20%"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Kategori</label>
              <input
                type="text"
                list="tpl-categories-list"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
              />
              <datalist id="tpl-categories-list">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Target Kanal</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as 'ALL' | OmnichannelType)}
                className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
              >
                {Object.entries(TEMPLATE_CHANNEL_LABELS).map(([k, lbl]) => (
                  <option key={k} value={k}>
                    {lbl}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
              <label className="text-xs font-medium text-gray-700">Isi Pesan</label>
              <div className="flex flex-wrap gap-1">
                {['{nama_panggilan}', '{nama_lengkap}', '{alamat}'].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() =>
                      setContent((prev) => `${prev}${!prev || prev.endsWith(' ') || prev.endsWith('\n') ? '' : ' '}${chip}`)
                    }
                    className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-mono hover:bg-indigo-100"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              rows={5}
              required
              placeholder="Halo {nama_panggilan}, ada promo khusus minggu ini..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full p-2.5 bg-white border border-gray-200 rounded-md text-xs leading-relaxed focus:outline-none focus:border-indigo-500"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600"
            />
            <span>Aktif (muncul di daftar template halaman Siaran)</span>
          </label>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        isLoading={deleting}
        title={`Hapus Template "${deleteTarget?.name}"?`}
        description="Template ini akan dihapus dari Master Template Siaran."
        confirmLabel="Ya, Hapus"
        variant="danger"
      />
    </div>
  );
};
