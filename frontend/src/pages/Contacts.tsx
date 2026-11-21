import React, { useEffect, useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Search,
  Upload,
  FileSpreadsheet,
  Pencil,
  Trash2,
  Phone,
  Calendar,
  Cake,
  Users,
  FolderKanban,
  MapPin,
  X,
  Send,
  RefreshCw,
  Smartphone,
  EyeOff,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Plus,
} from 'lucide-react';
import api from '../services/api';
import { getApiBaseUrl } from '../services/paths';
import { subscribeLiveEvent } from '../services/liveEvents';
import { AuthStatus, Contact, LicenseInfo, WahaSessionItem } from '../types';
import { hasPerm } from '../lib/permissions';
import { Button } from '../components/ui/Button';
import { TablePagination } from '../components/ui/Pagination';
import { Modal } from '../components/ui/Modal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { VerifiedMetaBadge } from '../components/VerifiedMetaBadge';
import { useToast } from '../components/ui/ToastProvider';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/StateBlocks';

function resolveContactAvatarUrl(url?: string | null): string {
  if (!url) return '';
  if (url.startsWith('/api/')) {
    const apiBase = typeof window !== 'undefined' ? getApiBaseUrl(window.location.pathname) : './api';
    return `${apiBase}${url.slice('/api'.length)}`;
  }
  return url;
}

function ContactAvatarImg({
  url,
  name,
  className = '',
}: {
  url?: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const resolved = resolveContactAvatarUrl(url);
  useEffect(() => {
    setFailed(false);
  }, [resolved]);
  if (resolved && !failed) {
    return (
      <img
        src={resolved}
        alt={name}
        onError={() => setFailed(true)}
        className={`object-cover shrink-0 ${className}`}
      />
    );
  }
  return (
    <div className={`flex items-center justify-center shrink-0 ${className}`}>
      {(name || 'KN').slice(0, 2).toUpperCase()}
    </div>
  );
}

interface ContactsProps {
  currentUser?: AuthStatus['user'] | null;
  onStartBroadcastWithContacts?: (contactIds: string[]) => void;
  licenseInfo?: LicenseInfo | null;
  targetContact?: { contactId?: string | null; phone?: string | null; name?: string | null } | null;
  onTargetContactHandled?: () => void;
}

const DEFAULT_CONTACT_CATEGORIES = ['Umum', 'VIP', 'Prospek', 'Pelanggan Tetap', 'Korporat', 'Partner'];

export const Contacts: React.FC<ContactsProps> = ({
  currentUser,
  onStartBroadcastWithContacts,
  licenseInfo,
  targetContact,
  onTargetContactHandled,
}) => {
  const toast = useToast();
  const canCreateContact = hasPerm(currentUser, 'contacts.create');
  const canEditContact = hasPerm(currentUser, 'contacts.edit');
  const canDeleteContact = hasPerm(currentUser, 'contacts.delete');
  const canSendBroadcast = hasPerm(currentUser, 'broadcasts') && hasPerm(currentUser, 'broadcasts.send');

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [masterCategories, setMasterCategories] = useState<string[]>(DEFAULT_CONTACT_CATEGORIES);
  const [metaTags, setMetaTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState('ALL');
  const [selectedKategori, setSelectedKategori] = useState('ALL');
  const [metricFilter, setMetricFilter] = useState<'ALL' | 'ASSESSED' | 'EXCLUDED'>('ALL');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalAll, setTotalAll] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectingAllFiltered, setSelectingAllFiltered] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [expandedMobileIds, setExpandedMobileIds] = useState<Record<string, boolean>>({});
  const toggleMobileCard = (id: string) =>
    setExpandedMobileIds((prev) => ({ ...prev, [id]: !prev[id] }));

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [newIdChannel, setNewIdChannel] = useState<'TELEGRAM' | 'INSTAGRAM' | 'FACEBOOK' | 'THREADS'>('TELEGRAM');
  const [newIdExternal, setNewIdExternal] = useState('');
  const [newIdHandle, setNewIdHandle] = useState('');
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [isWaSyncModalOpen, setIsWaSyncModalOpen] = useState(false);
  const [waSessions, setWaSessions] = useState<WahaSessionItem[]>([]);
  const [syncSession, setSyncSession] = useState('');
  const [overwriteNames, setOverwriteNames] = useState(false);
  const [syncingWa, setSyncingWa] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    sessionUsed: string;
    totalFetched: number;
    created: number;
    updated: number;
    skipped: number;
    quotaStopped: boolean;
    currentTotal?: number;
    maxContacts?: number;
  } | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [syncingProfile, setSyncingProfile] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [formData, setFormData] = useState({
    nama_lengkap: '',
    nama_panggilan: '',
    tanggal_lahir: '',
    nomor_whatsapp: '',
    alamat: '',
    kategori: '',
    tags: '',
    notes: '',
    exclude_from_metrics: false,
    exclude_reason: '',
  });

  const [importText, setImportText] = useState('');
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importFileRows, setImportFileRows] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getContacts({
        search: search || undefined,
        tag: selectedTag !== 'ALL' ? selectedTag : undefined,
        kategori: selectedKategori !== 'ALL' ? selectedKategori : undefined,
        excludeFromMetrics: metricFilter !== 'ALL' ? metricFilter : undefined,
        page,
        limit,
      });
      const list = res.data || [];
      const meta = res.pagination;
      setContacts(list);
      setTotal(meta?.total ?? list.length);
      setTotalPages(meta?.totalPages ?? 1);
      setTotalAll(meta?.totalAll ?? meta?.total ?? list.length);
      if (list.length === 0 && page > 1 && meta && meta.total > 0) {
        setPage(Math.max(1, meta.totalPages));
      }
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Gagal memuat data kontak');
    } finally {
      setLoading(false);
    }
  }, [search, selectedTag, selectedKategori, metricFilter, page, limit]);

  useEffect(() => {
    fetchContacts();
    const unsub = subscribeLiveEvent('contacts:update', () => {
      void fetchContacts();
    });
    return unsub;
  }, [fetchContacts]);

  useEffect(() => {
    if (!targetContact) return;
    let active = true;
    const openFromTarget = async () => {
      try {
        if (targetContact.contactId) {
          const c = await api.getContact(targetContact.contactId);
          if (!active) return;
          if (c) {
            setSearch(c.nomor_whatsapp || c.nama_lengkap || '');
            setPage(1);
            handleOpenEditModal(c);
            return;
          }
        }
        const query = (targetContact.phone || targetContact.name || '').trim();
        if (query) {
          setSearch(query);
          setPage(1);
          const res = await api.getContacts({ search: query, limit: 10 });
          if (!active) return;
          const list = res.data || [];
          const cleanPhone = (targetContact.phone || '').replace(/\D/g, '');
          const exact =
            list.find((x) => cleanPhone && (x.nomor_whatsapp || '').replace(/\D/g, '').endsWith(cleanPhone.slice(-8))) ||
            list[0];
          if (exact) {
            handleOpenEditModal(exact);
          } else {
            setEditingContact(null);
            setFormData({
              nama_lengkap: targetContact.name || (cleanPhone ? `Kontak +${cleanPhone}` : ''),
              nama_panggilan: '',
              tanggal_lahir: '',
              nomor_whatsapp: cleanPhone,
              alamat: '',
              kategori: '',
              tags: '',
              notes: '',
              exclude_from_metrics: false,
              exclude_reason: '',
            });
            setIsModalOpen(true);
            toast.info('Kontak belum terdaftar di CRM. Silakan lengkapi & simpan.');
          }
        }
      } catch {
        toast.error('Gagal membuka detail kontak');
      } finally {
        if (active) onTargetContactHandled?.();
      }
    };
    void openFromTarget();
    return () => {
      active = false;
    };
  }, [targetContact, onTargetContactHandled, toast]);

  const loadMetaTags = useCallback(async () => {
    try {
      const tags = await api.getContactTags();
      if (Array.isArray(tags)) setMetaTags(tags);
    } catch {
      // ignore tag meta fetch errors
    }
  }, []);

  useEffect(() => {
    void loadMetaTags();
  }, [loadMetaTags]);

  const handleOpenWaSyncModal = async () => {
    setSyncResult(null);
    setIsWaSyncModalOpen(true);
    try {
      const res = await api.getWahaSessions();
      const list = res.sessions || [];
      setWaSessions(list);
      const preferred =
        list.find((s) => s.name === res.activeSession && s.status === 'WORKING')?.name ||
        list.find((s) => s.status === 'WORKING')?.name ||
        list[0]?.name ||
        '';
      setSyncSession(preferred);
    } catch {
      setWaSessions([]);
    }
  };

  const handleRunWaSync = async () => {
    if (syncingWa) return;
    setSyncingWa(true);
    setSyncResult(null);
    try {
      const result = await api.syncWhatsAppContacts({
        session: syncSession || undefined,
        overwriteNames,
      });
      setSyncResult(result);
      toast.success(
        `Sinkronisasi selesai: ${result.created} kontak baru, ${result.updated} diperbarui.`
      );
      await Promise.all([fetchContacts(), loadMetaTags()]);
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Gagal sinkronisasi kontak WhatsApp');
    } finally {
      setSyncingWa(false);
    }
  };

  useEffect(() => {
    api
      .getMasterLabels('CONTACT_CATEGORY', true)
      .then((list) => {
        if (list && list.length > 0) {
          setMasterCategories(list.map((l) => l.name));
        }
      })
      .catch(() => {});
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (page !== 1) {
      setPage(1);
    } else {
      fetchContacts();
    }
  };

  const availableTags = Array.from(
    new Set([
      ...metaTags,
      ...contacts.flatMap((c) => (c.tags ? c.tags.split(',').map((t) => t.trim()) : [])),
    ].filter(Boolean))
  );

  const availableCategories = Array.from(
    new Set([
      ...masterCategories,
      ...contacts.map((c) => (c.kategori || '').trim()).filter(Boolean),
    ])
  );

  const handleOpenAddModal = () => {
    setEditingContact(null);
    setFormData({
      nama_lengkap: '',
      nama_panggilan: '',
      tanggal_lahir: '',
      nomor_whatsapp: '',
      alamat: '',
      kategori: '',
      tags: '',
      notes: '',
      exclude_from_metrics: false,
      exclude_reason: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (contact: Contact) => {
    setEditingContact(contact);
    setFormData({
      nama_lengkap: contact.nama_lengkap,
      nama_panggilan: contact.nama_panggilan || '',
      tanggal_lahir: contact.tanggal_lahir || '',
      nomor_whatsapp: contact.nomor_whatsapp,
      alamat: contact.alamat || '',
      kategori: contact.kategori || '',
      tags: contact.tags || '',
      notes: contact.notes || '',
      exclude_from_metrics: Boolean(contact.exclude_from_metrics),
      exclude_reason: contact.exclude_reason || '',
    });
    setIsModalOpen(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingContact) return;
    setSavingContact(true);
    try {
      if (editingContact) {
        await api.updateContact(editingContact.id, formData);
        toast.success('Data pelanggan berhasil diperbarui.');
      } else {
        const payload: any = { ...formData };
        if (newIdExternal.trim()) {
          payload.identities = [
            {
              channel: newIdChannel,
              externalId: newIdExternal.trim(),
              handle: newIdHandle.trim() || undefined,
            },
          ];
        }
        await api.createContact(payload);
        setNewIdExternal('');
        setNewIdHandle('');
        toast.success('Pelanggan baru berhasil ditambahkan.');
      }
      setIsModalOpen(false);
      fetchContacts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Gagal menyimpan kontak');
    } finally {
      setSavingContact(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await api.deleteContact(deleteTarget.id);
      toast.success(`Kontak "${deleteTarget.name}" berhasil dihapus.`);
      setSelectedIds((prev) => prev.filter((i) => i !== deleteTarget.id));
      setDeleteTarget(null);
      fetchContacts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menghapus kontak');
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedIds.length === 0 || bulkDeleting) return;
    setBulkDeleting(true);
    try {
      const idsToDelete = [...selectedIds];
      const res = await api.bulkDeleteContacts(idsToDelete);
      toast.success(
        res.message || `${res.deleted.toLocaleString('id-ID')} kontak berhasil dihapus permanen.`
      );
      setSelectedIds([]);
      setBulkDeleteOpen(false);
      await Promise.all([fetchContacts(), loadMetaTags()]);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menghapus kontak terpilih');
    } finally {
      setBulkDeleting(false);
    }
  };

  const pageContactIds = contacts.map((c) => c.id);
  const isAllPageSelected =
    pageContactIds.length > 0 && pageContactIds.every((id) => selectedIds.includes(id));

  const toggleSelectAll = () => {
    if (isAllPageSelected) {
      const pageSet = new Set(pageContactIds);
      setSelectedIds((prev) => prev.filter((id) => !pageSet.has(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageContactIds])));
    }
  };

  const handleSelectAllFiltered = async () => {
    if (selectingAllFiltered) return;
    setSelectingAllFiltered(true);
    try {
      const res = await api.getContactIds({
        search: search || undefined,
        tag: selectedTag !== 'ALL' ? selectedTag : undefined,
        kategori: selectedKategori !== 'ALL' ? selectedKategori : undefined,
        excludeFromMetrics: metricFilter !== 'ALL' ? metricFilter : undefined,
      });
      setSelectedIds(res.ids);
      toast.success(`${res.ids.length.toLocaleString('id-ID')} kontak dipilih.`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal memilih seluruh kontak hasil filter');
    } finally {
      setSelectingAllFiltered(false);
    }
  };

  const toggleSelectContact = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const formatExcelDate = (val: unknown): string | undefined => {
    if (val === null || val === undefined || val === '') return undefined;
    if (typeof val === 'number' && val > 1000) {
      const parsed = XLSX.SSF.parse_date_code(val);
      if (parsed && parsed.y && parsed.m && parsed.d) {
        const mm = String(parsed.m).padStart(2, '0');
        const dd = String(parsed.d).padStart(2, '0');
        return `${parsed.y}-${mm}-${dd}`;
      }
    }
    const str = String(val).trim();
    return str || undefined;
  };

  const normalizeImportHeader = (key: string) =>
    key.toLowerCase().replace(/[^a-z0-9]/g, '');

  const mapExcelRowToContact = (row: Record<string, unknown>) => {
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      normalized[normalizeImportHeader(k)] = v;
    }
    const namaLengkap = String(
      normalized.namalengkap ?? normalized.nama ?? normalized.name ?? normalized.fullname ?? ''
    ).trim();
    const nomorWhatsapp = String(
      normalized.nomorwhatsapp ??
        normalized.nowhatsapp ??
        normalized.nowa ??
        normalized.whatsapp ??
        normalized.phone ??
        normalized.telepon ??
        normalized.hp ??
        ''
    ).trim();
    if (!namaLengkap || !nomorWhatsapp) return null;

    return {
      nama_lengkap: namaLengkap,
      nomor_whatsapp: nomorWhatsapp,
      nama_panggilan:
        String(normalized.namapanggilan ?? normalized.panggilan ?? normalized.nickname ?? '').trim() ||
        undefined,
      tanggal_lahir: formatExcelDate(
        normalized.tanggallahir ?? normalized.tgllahir ?? normalized.birthday ?? normalized.dob
      ),
      alamat: String(normalized.alamat ?? normalized.address ?? '').trim() || undefined,
      tags: String(normalized.tag ?? normalized.tags ?? normalized.label ?? '').trim() || undefined,
      notes: String(normalized.catatan ?? normalized.notes ?? normalized.note ?? '').trim() || undefined,
    };
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) {
        toast.warning('File tidak memiliki sheet data.');
        return;
      }
      const sheet = workbook.Sheets[firstSheet];
      const objectRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      let parsed = objectRows.map(mapExcelRowToContact).filter(Boolean);

      if (parsed.length === 0) {
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
        parsed = matrix
          .filter((r) => Array.isArray(r) && r.length >= 2)
          .map((r) => ({
            nama_lengkap: String(r[0] ?? '').trim(),
            nomor_whatsapp: String(r[1] ?? '').trim(),
            nama_panggilan: String(r[2] ?? '').trim() || undefined,
            tanggal_lahir: formatExcelDate(r[3]),
            alamat: String(r[4] ?? '').trim() || undefined,
            tags: String(r[5] ?? '').trim() || undefined,
            notes: String(r[6] ?? '').trim() || undefined,
          }))
          .filter(
            (item) =>
              item.nama_lengkap &&
              item.nomor_whatsapp &&
              normalizeImportHeader(item.nama_lengkap) !== 'namalengkap'
          );
      }

      if (parsed.length === 0) {
        toast.warning(
          'Tidak ada baris kontak valid ditemukan. Pastikan kolom Nama Lengkap dan Nomor WhatsApp terisi.'
        );
        return;
      }

      setImportFileName(file.name);
      setImportFileRows(parsed);
      toast.success(`${parsed.length} kontak terbaca dari "${file.name}".`);
    } catch {
      toast.error('Gagal membaca file Excel/CSV. Pastikan format file valid.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownloadTemplate = (format: 'xlsx' | 'csv') => {
    const templateRows = [
      {
        'Nama Lengkap': 'Budi Santoso',
        'Nomor WhatsApp': '081234567890',
        'Nama Panggilan': 'Budi',
        'Tanggal Lahir (YYYY-MM-DD)': '1992-05-14',
        Alamat: 'Jakarta Selatan',
        Tag: 'VIP',
        Catatan: 'Pelanggan tetap',
      },
      {
        'Nama Lengkap': 'Siti Rahma',
        'Nomor WhatsApp': '082198765432',
        'Nama Panggilan': 'Siti',
        'Tanggal Lahir (YYYY-MM-DD)': '1995-11-20',
        Alamat: 'Bandung',
        Tag: 'Retail',
        Catatan: '',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(templateRows);
    ws['!cols'] = [
      { wch: 22 },
      { wch: 18 },
      { wch: 16 },
      { wch: 24 },
      { wch: 24 },
      { wch: 14 },
      { wch: 22 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Kontak');
    if (format === 'xlsx') {
      XLSX.writeFile(wb, 'template-kontak-crm.xlsx');
    } else {
      XLSX.writeFile(wb, 'template-kontak-crm.csv', { bookType: 'csv' });
    }
  };

  const handleBulkImport = async () => {
    if (importing || (!importText.trim() && importFileRows.length === 0)) return;
    setImporting(true);
    try {
      const items: any[] = [...importFileRows];
      if (importText.trim()) {
        const lines = importText.split('\n').filter((l) => l.trim().length > 0);
        for (const line of lines) {
          const parts = line.split(',').map((p) => p.trim());
          if (parts.length >= 2) {
            items.push({
              nama_lengkap: parts[0],
              nomor_whatsapp: parts[1],
              nama_panggilan: parts[2] || undefined,
              tanggal_lahir: parts[3] || undefined,
              alamat: parts[4] || undefined,
              tags: parts[5] || undefined,
            });
          }
        }
      }

      if (items.length === 0) {
        toast.warning('Data import belum tersedia. Unggah file Excel/CSV atau tempel data CSV.');
        return;
      }

      const res = await api.bulkImportContacts(items);
      toast.success(res.message || `${items.length} kontak berhasil diimpor.`);
      setIsImportModalOpen(false);
      setImportText('');
      setImportFileName(null);
      setImportFileRows([]);
      fetchContacts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengimpor data kontak');
    } finally {
      setImporting(false);
    }
  };

  const hasActiveFilter =
    Boolean(search.trim()) ||
    selectedTag !== 'ALL' ||
    selectedKategori !== 'ALL' ||
    metricFilter !== 'ALL';

  const activeDropdownCount =
    (selectedKategori !== 'ALL' ? 1 : 0) +
    (selectedTag !== 'ALL' ? 1 : 0) +
    (metricFilter !== 'ALL' ? 1 : 0);

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* Action Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-2.5 sm:p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 sm:gap-3">
        <div className="flex flex-1 flex-col sm:flex-row sm:items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 w-full sm:w-auto sm:flex-1 min-w-0 sm:min-w-[200px] lg:max-w-md">
            <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Cari nama, panggilan, WA..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full h-9 pl-9 pr-8 bg-white border border-gray-200 rounded-md text-[13px] text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setPage(1);
                  }}
                  title="Bersihkan pencarian"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </form>

            {/* Mobile Filter Toggle + Compact Action Buttons */}
            <button
              type="button"
              onClick={() => {
                setShowMobileFilters((v) => !v);
                setShowMobileActions(false);
              }}
              aria-label="Filter Kontak"
              className={`sm:hidden relative h-9 px-2.5 rounded-md border inline-flex items-center gap-1 text-xs font-medium shrink-0 transition-colors ${
                showMobileFilters || activeDropdownCount > 0
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filter</span>
              {activeDropdownCount > 0 && (
                <span className="px-1 rounded-full bg-indigo-600 text-white text-[10px] font-mono leading-tight">
                  {activeDropdownCount}
                </span>
              )}
            </button>

            {canCreateContact && (
              <button
                type="button"
                onClick={handleOpenAddModal}
                aria-label="Tambah Kontak"
                title="Tambah Kontak"
                className="sm:hidden h-9 w-9 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white inline-flex items-center justify-center shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}

            {(canCreateContact || (canSendBroadcast && selectedIds.length > 0)) && (
              <div className="relative sm:hidden shrink-0">
                <button
                  type="button"
                  onClick={() => setShowMobileActions((v) => !v)}
                  aria-label="Menu Aksi Kontak"
                  className="h-9 w-9 rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 inline-flex items-center justify-center"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {showMobileActions && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      onClick={() => setShowMobileActions(false)}
                    />
                    <div className="absolute right-0 mt-1.5 w-48 rounded-lg border border-gray-200 bg-white shadow-lg py-1 z-30 text-xs">
                      {canSendBroadcast && selectedIds.length > 0 && onStartBroadcastWithContacts && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowMobileActions(false);
                            onStartBroadcastWithContacts(selectedIds);
                          }}
                          className="w-full px-3 py-2 text-left flex items-center gap-2 font-semibold text-indigo-700 hover:bg-indigo-50"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Siaran ({selectedIds.length} dipilih)</span>
                        </button>
                      )}
                      {canDeleteContact && selectedIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowMobileActions(false);
                            setBulkDeleteOpen(true);
                          }}
                          className="w-full px-3 py-2 text-left flex items-center gap-2 font-semibold text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hapus ({selectedIds.length} dipilih)</span>
                        </button>
                      )}
                      {canCreateContact && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setShowMobileActions(false);
                              void handleOpenWaSyncModal();
                            }}
                            className="w-full px-3 py-2 text-left flex items-center gap-2 text-gray-700 hover:bg-gray-50"
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-gray-500" />
                            <span>Sinkronkan WA</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowMobileActions(false);
                              setIsImportModalOpen(true);
                            }}
                            className="w-full px-3 py-2 text-left flex items-center gap-2 text-gray-700 hover:bg-gray-50"
                          >
                            <Upload className="w-3.5 h-3.5 text-gray-500" />
                            <span>Import Data Excel/CSV</span>
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div
            className={`${
              showMobileFilters ? 'grid grid-cols-2 gap-2 pt-1' : 'hidden'
            } sm:flex items-center gap-2 min-w-0`}
          >
            <select
              value={selectedKategori}
              onChange={(e) => {
                setSelectedKategori(e.target.value);
                setPage(1);
              }}
              title="Filter Kelompok / Kategori Kontak"
              className="w-full sm:w-auto max-w-full min-w-0 h-9 px-2.5 sm:px-3 bg-white border border-gray-200 rounded-md text-xs sm:text-[13px] text-gray-700 focus:outline-none focus:border-indigo-500 truncate"
            >
              <option value="ALL">Semua Kelompok</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  Kelompok: {cat}
                </option>
              ))}
              <option value="UNGROUPED">Tanpa Kelompok</option>
            </select>

            <select
              value={selectedTag}
              onChange={(e) => {
                setSelectedTag(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-auto max-w-full min-w-0 h-9 px-2.5 sm:px-3 bg-white border border-gray-200 rounded-md text-xs sm:text-[13px] text-gray-700 focus:outline-none focus:border-indigo-500 truncate"
            >
              <option value="ALL">Semua Tag</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  Tag: {tag}
                </option>
              ))}
            </select>

            <select
              value={metricFilter}
              onChange={(e) => {
                setMetricFilter(e.target.value as 'ALL' | 'ASSESSED' | 'EXCLUDED');
                setPage(1);
              }}
              title="Filter Status Penilaian SLA/CSAT"
              className="col-span-2 sm:col-span-1 w-full sm:w-auto max-w-full min-w-0 h-9 px-2.5 sm:px-3 bg-white border border-gray-200 rounded-md text-xs sm:text-[13px] text-gray-700 focus:outline-none focus:border-indigo-500 truncate"
            >
              <option value="ALL">Semua Penilaian</option>
              <option value="ASSESSED">Masuk Penilaian</option>
              <option value="EXCLUDED">Non-Penilaian</option>
            </select>

            {licenseInfo && licenseInfo.features?.maxContacts > 0 && (
              <div className="col-span-2 sm:hidden flex items-center justify-between pt-0.5 text-[11px] text-gray-500">
                <span>Kuota Kontak:</span>
                <span
                  className={`font-mono font-medium tabular-nums ${
                    totalAll >= licenseInfo.features.maxContacts ? 'text-red-600 font-semibold' : 'text-gray-700'
                  }`}
                >
                  {totalAll.toLocaleString('id-ID')}/{licenseInfo.features.maxContacts.toLocaleString('id-ID')}
                  {totalAll > licenseInfo.features.maxContacts
                    ? ' (Melebihi Kuota)'
                    : totalAll === licenseInfo.features.maxContacts
                    ? ' (Penuh)'
                    : ''}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="hidden sm:flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
          {licenseInfo && licenseInfo.features?.maxContacts > 0 && (
            <div className="flex items-center justify-between sm:justify-start">
              <span
                className={`inline-flex items-center h-8 sm:h-9 px-2.5 rounded-md text-[11px] sm:text-xs font-mono font-medium border tabular-nums ${
                  totalAll >= licenseInfo.features.maxContacts
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : 'bg-gray-50 text-gray-700 border-gray-200'
                }`}
                title={
                  totalAll >= licenseInfo.features.maxContacts
                    ? 'Kuota kontak paket sudah penuh. Hapus kontak lama atau upgrade paket untuk menambah kontak baru.'
                    : 'Pemakaian kuota kontak pada paket aktif'
                }
              >
                {totalAll.toLocaleString('id-ID')}/{licenseInfo.features.maxContacts.toLocaleString('id-ID')} kontak
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
            {canSendBroadcast && selectedIds.length > 0 && onStartBroadcastWithContacts && (
              <Button
                variant="primary"
                size="md"
                onClick={() => onStartBroadcastWithContacts(selectedIds)}
                className="col-span-2 sm:col-span-1 justify-center"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Siaran ({selectedIds.length})</span>
              </Button>
            )}
            {canDeleteContact && selectedIds.length > 0 && (
              <Button
                variant="danger"
                size="md"
                onClick={() => setBulkDeleteOpen(true)}
                className="col-span-2 sm:col-span-1 justify-center"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus ({selectedIds.length})</span>
              </Button>
            )}

            {canCreateContact && (
              <>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => void handleOpenWaSyncModal()}
                  className="justify-center"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sinkronkan WA</span>
                </Button>

                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setIsImportModalOpen(true)}
                  className="justify-center"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import Data</span>
                </Button>

                <Button
                  variant={selectedIds.length > 0 && canSendBroadcast ? 'secondary' : 'primary'}
                  size="md"
                  onClick={handleOpenAddModal}
                  className="col-span-2 sm:col-span-1 justify-center"
                >
                  <span>Tambah Kontak</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {canSendBroadcast && selectedIds.length > 0 && onStartBroadcastWithContacts && (
        <div className="sm:hidden flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200 text-xs">
          <span className="font-semibold text-indigo-800 tabular-nums">
            {selectedIds.length} kontak dipilih
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onStartBroadcastWithContacts(selectedIds)}
          >
            <Send className="w-3 h-3" />
            <span>Kirim Siaran</span>
          </Button>
        </div>
      )}

      {/* Contacts Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading && contacts.length === 0 ? (
          <LoadingState message="Memuat data pelanggan..." />
        ) : error && contacts.length === 0 ? (
          <ErrorState message={error} onRetry={fetchContacts} />
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={<Users className="w-8 h-8" />}
            title={hasActiveFilter ? 'Tidak ada kontak di filter ini' : 'Belum ada data pelanggan'}
            description={
              hasActiveFilter
                ? 'Ubah filter pencarian, kelompok, tag, atau status Non-Penilaian untuk melihat daftar kontak lain.'
                : 'Tambahkan kontak pelanggan secara manual atau impor daftar melalui CSV.'
            }
            action={
              canCreateContact && !hasActiveFilter ? (
                <Button variant="primary" size="sm" onClick={handleOpenAddModal}>
                  Tambah Kontak
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="lg:hidden divide-y divide-gray-200">
              <div className="px-3.5 py-2.5 bg-gray-50 flex items-center justify-between gap-2 text-xs text-gray-600">
                <label className="inline-flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={isAllPageSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>Pilih Halaman ({contacts.length})</span>
                </label>
                {selectedIds.length > 0 && (
                  <span className="font-semibold text-indigo-700 tabular-nums">
                    {selectedIds.length} dipilih
                  </span>
                )}
              </div>
              <div className="divide-y divide-gray-200 md:grid md:grid-cols-2 md:divide-y-0 md:gap-px md:bg-gray-200">
                {contacts.map((contact) => {
                  const isSelected = selectedIds.includes(contact.id);
                  const birthDate = contact.tanggal_lahir ? new Date(contact.tanggal_lahir) : null;
                  const isBirthdayToday =
                    birthDate &&
                    birthDate.getMonth() === new Date().getMonth() &&
                    birthDate.getDate() === new Date().getDate();
                  const tagList = contact.tags
                    ? contact.tags
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean)
                    : [];
                  const isExpanded = Boolean(expandedMobileIds[contact.id]);
                  const hasExtraDetails = Boolean(
                    contact.nama_panggilan ||
                      birthDate ||
                      (contact.identities && contact.identities.length > 0) ||
                      contact.alamat ||
                      contact.notes ||
                      tagList.length > 0
                  );
                  return (
                    <div
                      key={contact.id}
                      className={`p-3 space-y-2 text-xs transition-colors ${
                        isSelected ? 'bg-indigo-50/60' : 'bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <label className="flex items-start gap-2 flex-1 min-w-0 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectContact(contact.id)}
                            className="mt-1 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                          />
                          <ContactAvatarImg
                            url={contact.profile_picture_url}
                            name={contact.nama_lengkap}
                            className="w-8 h-8 rounded-md bg-indigo-50 text-indigo-700 font-semibold text-xs border border-indigo-200/70"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-gray-900 text-[13px] leading-snug break-words flex flex-wrap items-center gap-1.5">
                              <span>{contact.nama_lengkap}</span>
                              <VerifiedMetaBadge contact={contact} />
                              {contact.exclude_from_metrics && (
                                <span
                                  title={contact.exclude_reason || 'Dikecualikan dari penilaian SLA/CSAT'}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-medium"
                                >
                                  <EyeOff className="w-2.5 h-2.5" />
                                  <span>Non-Penilaian</span>
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {contact.nomor_whatsapp ? (
                                <a
                                  href={`https://wa.me/${contact.nomor_whatsapp}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-700 hover:underline"
                                >
                                  <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                                  <span>+{contact.nomor_whatsapp}</span>
                                </a>
                              ) : (
                                <span className="text-[11px] text-gray-400">Tanpa WA</span>
                              )}
                              {contact.kategori && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium max-w-full truncate">
                                  {contact.kategori}
                                </span>
                              )}
                              {isBirthdayToday && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                  <Cake className="w-2.5 h-2.5 shrink-0" /> Ultah
                                </span>
                              )}
                            </div>
                          </div>
                        </label>

                        <div className="flex items-center gap-1 shrink-0">
                          {hasExtraDetails && (
                            <button
                              type="button"
                              onClick={() => toggleMobileCard(contact.id)}
                              className="h-8 px-2 rounded-md border border-gray-200 bg-gray-50 text-[11px] font-medium text-gray-600 hover:text-gray-900 inline-flex items-center gap-0.5"
                            >
                              <span>{isExpanded ? 'Tutup' : 'Detail'}</span>
                              {isExpanded ? (
                                <ChevronDown className="w-3 h-3" />
                              ) : (
                                <ChevronRight className="w-3 h-3" />
                              )}
                            </button>
                          )}
                          {(canEditContact || canDeleteContact) && (
                            <div className="inline-flex items-center rounded-md border border-gray-200 bg-white divide-x divide-gray-200 overflow-hidden shrink-0">
                              {canEditContact && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditModal(contact)}
                                  className="h-8 w-8 inline-flex items-center justify-center text-gray-600 hover:text-indigo-700 hover:bg-indigo-50"
                                  title="Edit Kontak"
                                >
                                  <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                                </button>
                              )}
                              {canDeleteContact && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDeleteTarget({ id: contact.id, name: contact.nama_lengkap })
                                  }
                                  className="h-8 w-8 inline-flex items-center justify-center text-gray-600 hover:text-red-700 hover:bg-red-50"
                                  title="Hapus Kontak"
                                >
                                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {isExpanded && hasExtraDetails && (
                        <div className="pl-6 pt-1.5 border-t border-gray-100 space-y-1.5 text-[11px]">
                          {contact.nama_panggilan && (
                            <div className="text-gray-500">
                              Panggilan: <span className="text-gray-800 font-medium">{contact.nama_panggilan}</span>
                            </div>
                          )}
                          {birthDate && (
                            <div className="flex items-center gap-1.5 text-gray-600 tabular-nums">
                              <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span>
                                Ultah:{' '}
                                {birthDate.toLocaleDateString('id-ID', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </span>
                            </div>
                          )}
                          {contact.identities && contact.identities.length > 0 && (
                            <div className="flex flex-wrap gap-1 min-w-0">
                              {contact.identities.map((idItem) => (
                                <span
                                  key={idItem.id}
                                  className="inline-flex items-center max-w-full px-1.5 py-0.5 rounded text-[10px] font-mono bg-gray-100 text-gray-700 border border-gray-200"
                                >
                                  <span className="truncate">
                                    {idItem.channel === 'INSTAGRAM'
                                      ? 'IG'
                                      : idItem.channel === 'FACEBOOK'
                                      ? 'FB'
                                      : idItem.channel === 'TELEGRAM'
                                      ? 'TG'
                                      : idItem.channel}
                                    : {idItem.handle || idItem.externalId}
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                          {contact.alamat && (
                            <div className="flex items-start gap-1.5 text-gray-600 leading-relaxed">
                              <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                              <span className="break-words">{contact.alamat}</span>
                            </div>
                          )}
                          {contact.notes && (
                            <p className="text-gray-500 italic break-words">
                              Catatan: {contact.notes}
                            </p>
                          )}
                          {tagList.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {tagList.map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50/70 text-indigo-700 border border-indigo-200/80 max-w-full truncate"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="p-3.5 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllPageSelected}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-4">Nama Lengkap &amp; Panggilan</th>
                    <th className="py-3 px-4">Nomor WhatsApp</th>
                    <th className="py-3 px-4">Kelompok</th>
                    <th className="py-3 px-4">Tanggal Lahir</th>
                    <th className="py-3 px-4">Alamat</th>
                    <th className="py-3 px-4">Tag / Segmen</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200 text-xs">
                  {contacts.map((contact) => {
                    const isSelected = selectedIds.includes(contact.id);
                    const birthDate = contact.tanggal_lahir ? new Date(contact.tanggal_lahir) : null;
                    const isBirthdayToday =
                      birthDate &&
                      birthDate.getMonth() === new Date().getMonth() &&
                      birthDate.getDate() === new Date().getDate();

                    return (
                      <tr
                        key={contact.id}
                        className={`hover:bg-gray-50 transition-colors ${
                          isSelected ? 'bg-indigo-50/40' : ''
                        }`}
                      >
                        <td className="p-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectContact(contact.id)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-start gap-2.5">
                            <ContactAvatarImg
                              url={contact.profile_picture_url}
                              name={contact.nama_lengkap}
                              className="w-8 h-8 rounded-md bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200 mt-0.5"
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-gray-900">{contact.nama_lengkap}</span>
                                <VerifiedMetaBadge contact={contact} />
                                {contact.exclude_from_metrics && (
                                  <span
                                    title={contact.exclude_reason || 'Dikecualikan dari penilaian SLA/CSAT'}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200 text-[10px] font-medium"
                                  >
                                    <EyeOff className="w-2.5 h-2.5 text-slate-400" />
                                    <span>Non-Penilaian</span>
                                  </span>
                                )}
                              </div>
                              {contact.nama_panggilan && (
                                <div className="text-[11px] text-gray-500">
                                  Panggilan: <span className="text-gray-700">{contact.nama_panggilan}</span>
                                </div>
                              )}
                              {contact.profile_about && (
                                <div className="text-[11px] text-gray-500 truncate max-w-[260px]" title={contact.profile_about}>
                                  {contact.profile_about}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            {contact.nomor_whatsapp ? (
                              <a
                                href={`https://wa.me/${contact.nomor_whatsapp}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 font-mono text-indigo-600 hover:text-indigo-700 hover:underline"
                              >
                                <Phone className="w-3 h-3 text-gray-400" />
                                <span>+{contact.nomor_whatsapp}</span>
                              </a>
                            ) : (
                              <span className="text-[11px] text-gray-400">Tanpa WA</span>
                            )}
                            {contact.identities && contact.identities.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {contact.identities.map((idItem) => (
                                  <span
                                    key={idItem.id}
                                    title={`${idItem.channel}: ${idItem.externalId}`}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-gray-100 text-gray-700 border border-gray-200"
                                  >
                                    {idItem.channel === 'INSTAGRAM'
                                      ? 'IG'
                                      : idItem.channel === 'FACEBOOK'
                                      ? 'FB'
                                      : idItem.channel === 'TELEGRAM'
                                      ? 'TG'
                                      : idItem.channel}
                                    : {idItem.handle || idItem.externalId}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          {contact.kategori ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                              <FolderKanban className="w-3 h-3 text-slate-500 shrink-0" strokeWidth={1.75} />
                              <span>{contact.kategori}</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-gray-400">Umum</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          {birthDate ? (
                            <div className="flex items-center gap-1.5 tabular-nums text-gray-700">
                              <Calendar className="w-3 h-3 text-gray-400" />
                              <span>
                                {birthDate.toLocaleDateString('id-ID', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </span>
                              {isBirthdayToday && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                  <Cake className="w-2.5 h-2.5" /> Ultah
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>

                        <td className="py-3 px-4 max-w-xs truncate text-gray-600">
                          {contact.alamat ? (
                            <span title={contact.alamat}>{contact.alamat}</span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          {contact.tags ? (
                            <div className="flex flex-wrap gap-1">
                              {contact.tags.split(',').map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700 border border-gray-200"
                                >
                                  {tag.trim()}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          {(canEditContact || canDeleteContact) ? (
                            <div className="inline-flex items-center rounded-md border border-gray-200 bg-white divide-x divide-gray-200 overflow-hidden shadow-xs">
                              {canEditContact && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditModal(contact)}
                                  className="h-7 w-7 inline-flex items-center justify-center text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
                                  title="Edit Kontak"
                                >
                                  <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                                </button>
                              )}
                              {canDeleteContact && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDeleteTarget({ id: contact.id, name: contact.nama_lengkap })
                                  }
                                  className="h-7 w-7 inline-flex items-center justify-center text-gray-600 hover:text-red-700 hover:bg-red-50 transition-colors"
                                  title="Hapus Kontak"
                                >
                                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-gray-400">Lihat saja</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {(selectedIds.length > 0 || total > contacts.length) && (
          <div className="px-3.5 sm:px-4 py-2.5 bg-indigo-50/60 border-t border-indigo-100 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-700">
            <div className="flex flex-wrap items-center gap-3">
              <span className="tabular-nums">
                Terpilih: <strong className="text-indigo-700">{selectedIds.length.toLocaleString('id-ID')}</strong> kontak
              </span>
              {total > contacts.length && selectedIds.length < total && (
                <button
                  type="button"
                  disabled={selectingAllFiltered}
                  onClick={handleSelectAllFiltered}
                  className="text-xs font-semibold text-indigo-700 hover:underline disabled:opacity-50"
                >
                  {selectingAllFiltered
                    ? 'Memilih semua...'
                    : `Pilih semua ${total.toLocaleString('id-ID')} kontak di hasil filter`}
                </button>
              )}
            </div>
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-3">
                {canSendBroadcast && onStartBroadcastWithContacts && (
                  <button
                    type="button"
                    onClick={() => onStartBroadcastWithContacts(selectedIds)}
                    className="text-xs font-semibold text-indigo-700 hover:underline inline-flex items-center gap-1"
                  >
                    <Send className="w-3 h-3" />
                    <span>Kirim Siaran ({selectedIds.length.toLocaleString('id-ID')})</span>
                  </button>
                )}
                {canDeleteContact && (
                  <button
                    type="button"
                    onClick={() => setBulkDeleteOpen(true)}
                    className="text-xs font-semibold text-red-600 hover:underline inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Hapus Terpilih ({selectedIds.length.toLocaleString('id-ID')})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="text-xs text-gray-500 hover:text-gray-800 underline"
                >
                  Batalkan Pilihan
                </button>
              </div>
            )}
          </div>
        )}

        <TablePagination
          page={page}
          limit={limit}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          onLimitChange={(nextLimit) => {
            setLimit(nextLimit);
            setPage(1);
          }}
          limitOptions={[25, 50, 100, 250, 500]}
          itemLabel="pelanggan"
          loading={loading}
        />
      </div>

      {/* Add / Edit Contact Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingContact ? 'Edit Data Pelanggan' : 'Tambah Pelanggan Baru'}
        subtitle="Informasi lengkap untuk personalisasi siaran dan ucapan otomatis."
        isLoading={savingContact}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)} disabled={savingContact}>
              Batal
            </Button>
            <Button type="submit" form="contact-form" variant="primary" isLoading={savingContact}>
              {editingContact ? 'Simpan Perubahan' : 'Tambah Pelanggan'}
            </Button>
          </>
        }
      >
        <form id="contact-form" onSubmit={handleSaveContact} className="space-y-3.5">
          {editingContact && (
            <div className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-gray-50 border border-gray-200">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-md bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0 overflow-hidden border border-indigo-200">
                  {editingContact.profile_picture_url ? (
                    <img
                      src={resolveContactAvatarUrl(editingContact.profile_picture_url)}
                      alt={editingContact.nama_lengkap}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    editingContact.nama_lengkap.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-gray-900 truncate flex items-center gap-1.5">
                    <span className="truncate">{editingContact.nama_lengkap}</span>
                    <VerifiedMetaBadge contact={editingContact} />
                  </div>
                  {editingContact.verified_name &&
                    editingContact.verified_name.trim().toLowerCase() !== editingContact.nama_lengkap.trim().toLowerCase() && (
                      <div className="text-[11px] text-sky-700 font-medium truncate">
                        Nama Verified Meta: {editingContact.verified_name}
                      </div>
                    )}
                  <div className="text-[11px] text-gray-500 truncate">
                    {editingContact.profile_about || 'Belum ada bio/deskripsi WhatsApp'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                disabled={syncingProfile}
                onClick={async () => {
                  setSyncingProfile(true);
                  try {
                    const res = await api.syncContactProfile(editingContact.id);
                    setEditingContact(res.contact);
                    setFormData((prev) => ({
                      ...prev,
                      nama_lengkap: res.contact.nama_lengkap || prev.nama_lengkap,
                    }));
                    toast.success('Profil WhatsApp berhasil diperbarui');
                    fetchContacts();
                  } catch (err: any) {
                    toast.error(err?.response?.data?.error || 'Gagal mengambil profil WhatsApp');
                  } finally {
                    setSyncingProfile(false);
                  }
                }}
                className="px-2.5 py-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-100 text-[11px] font-medium text-gray-700 inline-flex items-center gap-1 shrink-0 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${syncingProfile ? 'animate-spin' : ''}`} />
                <span>{syncingProfile ? 'Menyinkronkan...' : 'Sync Profil WA'}</span>
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Nama Lengkap <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: Budi Santoso"
                value={formData.nama_lengkap}
                onChange={(e) => setFormData({ ...formData, nama_lengkap: e.target.value })}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Nama Panggilan
              </label>
              <input
                type="text"
                placeholder="Contoh: Budi"
                value={formData.nama_panggilan}
                onChange={(e) => setFormData({ ...formData, nama_panggilan: e.target.value })}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Nomor WhatsApp <span className="text-gray-400 font-normal">(opsional jika ada kanal lain)</span>
              </label>
              <input
                type="text"
                placeholder="Contoh: 08123456789"
                value={formData.nomor_whatsapp}
                onChange={(e) => setFormData({ ...formData, nomor_whatsapp: e.target.value })}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] font-mono focus:outline-none focus:border-indigo-500"
              />
              <span className="text-[11px] text-gray-400">Otomatis diformat ke awalan 62</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Tanggal Lahir
              </label>
              <input
                type="date"
                value={formData.tanggal_lahir}
                onChange={(e) => setFormData({ ...formData, tanggal_lahir: e.target.value })}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] focus:outline-none focus:border-indigo-500"
              />
              <span className="text-[11px] text-gray-400">Untuk ucapan ulang tahun otomatis</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Alamat</label>
            <textarea
              rows={2}
              placeholder="Contoh: Jl. Sudirman No. 45, Jakarta Selatan"
              value={formData.alamat}
              onChange={(e) => setFormData({ ...formData, alamat: e.target.value })}
              className="w-full p-2.5 bg-white border border-gray-200 rounded-md text-[13px] focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Kategori / Kelompok Kontak
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {masterCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFormData({ ...formData, kategori: cat })}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                    formData.kategori === cat
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Pilih di atas atau ketik kelompok kustom..."
              value={formData.kategori}
              onChange={(e) => setFormData({ ...formData, kategori: e.target.value })}
              className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tag / Segmen</label>
              <input
                type="text"
                placeholder="Pisahkan koma: VIP, Reseller"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Catatan</label>
              <input
                type="text"
                placeholder="Catatan khusus pelanggan..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="p-3 rounded-md bg-amber-50/60 border border-amber-200/80 space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.exclude_from_metrics}
                onChange={(e) =>
                  setFormData({ ...formData, exclude_from_metrics: e.target.checked })
                }
                className="mt-0.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
              />
              <div className="text-xs leading-snug">
                <div className="font-semibold text-gray-900">
                  Dikecualikan dari Penilaian SLA &amp; CSAT (Non-Penilaian)
                </div>
                <p className="text-[11px] text-gray-600 mt-0.5">
                  Aktifkan jika kontak ini bukan pelanggan (misal internal tim, kurir, vendor, atau bot). Otomatis berlaku ke semua obrolan aktif &amp; obrolan masuk berikutnya.
                </p>
              </div>
            </label>
            {formData.exclude_from_metrics && (
              <div>
                <input
                  type="text"
                  placeholder="Alasan (misal: Tim Internal / Kurir / Vendor)"
                  value={formData.exclude_reason}
                  onChange={(e) => setFormData({ ...formData, exclude_reason: e.target.value })}
                  className="w-full h-8 px-2.5 bg-white border border-amber-200 rounded text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
            )}
          </div>

          {!editingContact && (
            <div className="pt-3 border-t border-gray-200 space-y-2">
              <label className="block text-xs font-semibold text-gray-800">
                Identitas Kanal Lain (Opsional, wajib jika Nomor WhatsApp kosong)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <select
                  value={newIdChannel}
                  onChange={(e) => setNewIdChannel(e.target.value as any)}
                  className="sm:col-span-3 h-8 px-2 bg-white border border-gray-200 rounded text-xs"
                >
                  <option value="TELEGRAM">Telegram</option>
                  <option value="INSTAGRAM">Instagram</option>
                  <option value="FACEBOOK">Facebook</option>
                  <option value="THREADS">Threads</option>
                </select>
                <input
                  type="text"
                  placeholder="External ID / Chat ID"
                  value={newIdExternal}
                  onChange={(e) => setNewIdExternal(e.target.value)}
                  className="sm:col-span-5 h-8 px-2.5 bg-white border border-gray-200 rounded text-xs font-mono"
                />
                <input
                  type="text"
                  placeholder="@handle (opsional)"
                  value={newIdHandle}
                  onChange={(e) => setNewIdHandle(e.target.value)}
                  className="sm:col-span-4 h-8 px-2.5 bg-white border border-gray-200 rounded text-xs"
                />
              </div>
            </div>
          )}

          {editingContact && (
            <div className="pt-3 border-t border-gray-200 space-y-2.5">
              <label className="block text-xs font-semibold text-gray-800">
                Identitas Kanal Omnichannel
              </label>
              {editingContact.identities && editingContact.identities.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 min-w-0">
                  {editingContact.identities.map((idItem) => (
                    <span
                      key={idItem.id}
                      className="inline-flex items-center gap-1.5 max-w-full px-2 py-1 rounded bg-gray-50 border border-gray-200 text-[11px] font-mono text-gray-700"
                    >
                      <span className="font-semibold text-indigo-700 shrink-0">{idItem.channel}</span>
                      <span className="truncate max-w-[180px] sm:max-w-xs">
                        {idItem.handle || idItem.externalId}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await api.deleteContactIdentity(editingContact.id, idItem.id);
                            setEditingContact((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    identities: (prev.identities || []).filter(
                                      (x) => x.id !== idItem.id
                                    ),
                                  }
                                : null
                            );
                            fetchContacts();
                          } catch {
                            toast.error('Gagal menghapus identitas kanal');
                          }
                        }}
                        className="text-gray-400 hover:text-red-600 ml-0.5"
                        title="Hapus identitas"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-gray-400">
                  Belum ada identitas Telegram / Instagram / Facebook / Threads tertaut.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <select
                  value={newIdChannel}
                  onChange={(e) => setNewIdChannel(e.target.value as any)}
                  className="sm:col-span-3 w-full h-9 sm:h-8 px-2 bg-white border border-gray-200 rounded text-xs"
                >
                  <option value="TELEGRAM">Telegram</option>
                  <option value="INSTAGRAM">Instagram</option>
                  <option value="FACEBOOK">Facebook</option>
                  <option value="THREADS">Threads</option>
                </select>
                <input
                  type="text"
                  placeholder="External ID / Chat ID"
                  value={newIdExternal}
                  onChange={(e) => setNewIdExternal(e.target.value)}
                  className="sm:col-span-4 w-full min-w-0 h-9 sm:h-8 px-2.5 bg-white border border-gray-200 rounded text-xs font-mono"
                />
                <input
                  type="text"
                  placeholder="@handle (opsional)"
                  value={newIdHandle}
                  onChange={(e) => setNewIdHandle(e.target.value)}
                  className="sm:col-span-3 w-full min-w-0 h-9 sm:h-8 px-2.5 bg-white border border-gray-200 rounded text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={savingIdentity || !newIdExternal.trim()}
                  onClick={async () => {
                    if (!newIdExternal.trim()) return;
                    setSavingIdentity(true);
                    try {
                      const created = await api.addContactIdentity(editingContact.id, {
                        channel: newIdChannel,
                        externalId: newIdExternal.trim(),
                        handle: newIdHandle.trim() || undefined,
                      });
                      setEditingContact((prev) =>
                        prev
                          ? { ...prev, identities: [...(prev.identities || []), created] }
                          : null
                      );
                      setNewIdExternal('');
                      setNewIdHandle('');
                      fetchContacts();
                      toast.success('Identitas kanal ditambahkan');
                    } catch (err: any) {
                      toast.error(err.response?.data?.error || 'Gagal menambah identitas');
                    } finally {
                      setSavingIdentity(false);
                    }
                  }}
                  className="sm:col-span-2 w-full h-9 sm:h-8 justify-center"
                >
                  Tambah
                </Button>
              </div>
            </div>
          )}
        </form>
      </Modal>

      {/* Bulk Import Excel / CSV Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => {
          setIsImportModalOpen(false);
          setImportFileName(null);
          setImportFileRows([]);
        }}
        title="Import Data Pelanggan (Excel / CSV)"
        subtitle="Unggah file .xlsx / .xls / .csv atau tempel data teks CSV"
        isLoading={importing}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setIsImportModalOpen(false);
                setImportFileName(null);
                setImportFileRows([]);
              }}
              disabled={importing}
            >
              Batal
            </Button>
            <Button
              variant="primary"
              onClick={handleBulkImport}
              isLoading={importing}
              disabled={!importText.trim() && importFileRows.length === 0}
            >
              Proses Import{importFileRows.length > 0 ? ` (${importFileRows.length})` : ''}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-md bg-gray-50 border border-gray-200">
            <span className="text-xs font-medium text-gray-700">
              Unduh template resmi agar format kolom sesuai:
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => handleDownloadTemplate('xlsx')}
              >
                Template Excel (.xlsx)
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => handleDownloadTemplate('csv')}
              >
                Template CSV
              </Button>
            </div>
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImportFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full p-4 border-2 border-dashed border-gray-300 hover:border-indigo-400 rounded-lg bg-white hover:bg-indigo-50/30 transition-colors flex flex-col items-center justify-center gap-1.5 text-center"
            >
              <FileSpreadsheet className="w-6 h-6 text-indigo-600" />
              <span className="text-xs font-semibold text-gray-800">
                {importFileName
                  ? `${importFileName} (${importFileRows.length} kontak siap diimpor)`
                  : 'Klik untuk pilih file Excel (.xlsx / .xls) atau CSV'}
              </span>
              <span className="text-[11px] text-gray-500">
                Kolom wajib: Nama Lengkap & Nomor WhatsApp
              </span>
            </button>
          </div>

          <div className="text-xs text-gray-600">
            Atau tempel teks CSV (satu pelanggan per baris):
            <code className="block mt-1 text-gray-800 font-mono text-[11px] bg-gray-100 px-2 py-1.5 rounded border border-gray-200">
              Nama Lengkap, Nomor WhatsApp, Nama Panggilan, YYYY-MM-DD, Alamat, Tag
            </code>
          </div>
          <textarea
            rows={4}
            placeholder="Budi Santoso, 081234567890, Budi, 1992-05-14, Jakarta Selatan, VIP&#10;Siti Rahma, 082198765432, Siti, 1995-11-20, Bandung, Retail"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            className="w-full p-2.5 bg-white border border-gray-200 rounded-md text-xs font-mono focus:outline-none focus:border-indigo-500"
          />
        </div>
      </Modal>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        isLoading={deleting}
        title="Hapus Data Pelanggan?"
        description={`Kontak "${deleteTarget?.name || ''}" akan dihapus secara permanen dari daftar pelanggan.`}
        confirmLabel="Hapus Kontak"
        variant="danger"
      />

      <ConfirmModal
        isOpen={bulkDeleteOpen}
        onClose={() => !bulkDeleting && setBulkDeleteOpen(false)}
        onConfirm={handleConfirmBulkDelete}
        isLoading={bulkDeleting}
        title={`Hapus ${selectedIds.length.toLocaleString('id-ID')} Kontak Terpilih?`}
        description={`Sebanyak ${selectedIds.length.toLocaleString('id-ID')} kontak yang dipilih akan dihapus secara permanen beserta riwayat percakapan terkait. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel={`Hapus ${selectedIds.length.toLocaleString('id-ID')} Kontak`}
        variant="danger"
      />

      {/* WhatsApp Contact Sync Modal */}
      <Modal
        isOpen={isWaSyncModalOpen}
        onClose={() => !syncingWa && setIsWaSyncModalOpen(false)}
        title="Sinkronkan Kontak dari WhatsApp"
        subtitle="Ambil daftar kontak tersimpan & chat dari sesi WAHA ke CRM"
        isLoading={syncingWa}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsWaSyncModalOpen(false)}
              disabled={syncingWa}
            >
              Tutup
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleRunWaSync()}
              isLoading={syncingWa}
              disabled={waSessions.length === 0}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Mulai Sinkronkan</span>
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs text-gray-700">
          <div>
            <label className="block font-medium text-gray-700 mb-1">
              Pilih Sesi / Nomor WhatsApp (WAHA)
            </label>
            {waSessions.length === 0 ? (
              <div className="p-2.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800">
                Belum ada sesi WhatsApp WAHA yang terhubung. Pastikan sesi berstatus WORKING di menu Integrasi &amp; Kanal.
              </div>
            ) : (
              <select
                value={syncSession}
                onChange={(e) => setSyncSession(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs font-mono focus:outline-none focus:border-indigo-500"
              >
                {waSessions.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} ({s.status}){s.me?.pushName ? ` — ${s.me.pushName}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <label className="flex items-start gap-2 p-2.5 rounded-md border border-gray-200 bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={overwriteNames}
              onChange={(e) => setOverwriteNames(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="font-medium text-gray-900 block">
                Timpa nama kontak CRM yang sudah ada dengan nama dari WhatsApp
              </span>
              <span className="text-[11px] text-gray-500">
                Jika tidak dicentang, nama pelanggan yang sudah Anda edit manual tidak akan berubah (hanya menambah kontak baru &amp; mengisi nama bawaan kosong).
              </span>
            </div>
          </label>

          {syncResult && (
            <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 space-y-2">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-900">
                <Smartphone className="w-4 h-4 text-emerald-600" />
                <span>Hasil Sinkronisasi (Sesi: {syncResult.sessionUsed})</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center tabular-nums">
                <div className="bg-white rounded border border-emerald-200 p-2">
                  <span className="text-[10px] text-gray-500 block">Ditemukan</span>
                  <span className="font-bold text-gray-900 text-sm">{syncResult.totalFetched}</span>
                </div>
                <div className="bg-white rounded border border-emerald-200 p-2">
                  <span className="text-[10px] text-emerald-700 block">Baru</span>
                  <span className="font-bold text-emerald-800 text-sm">+{syncResult.created}</span>
                </div>
                <div className="bg-white rounded border border-emerald-200 p-2">
                  <span className="text-[10px] text-indigo-700 block">Diperbarui</span>
                  <span className="font-bold text-indigo-800 text-sm">{syncResult.updated}</span>
                </div>
                <div className="bg-white rounded border border-emerald-200 p-2">
                  <span className="text-[10px] text-gray-500 block">Dilewati</span>
                  <span className="font-bold text-gray-700 text-sm">{syncResult.skipped}</span>
                </div>
              </div>
              {syncResult.quotaStopped && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  Sebagian kontak tidak ditambahkan karena kuota maksimal lisensi kontak
                  {syncResult.maxContacts
                    ? ` (${(syncResult.currentTotal ?? 0).toLocaleString('id-ID')}/${syncResult.maxContacts.toLocaleString('id-ID')})`
                    : ''}{' '}
                  telah tercapai.
                </p>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default Contacts;
