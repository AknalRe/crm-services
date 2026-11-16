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
} from 'lucide-react';
import api from '../services/api';
import { Contact, LicenseInfo } from '../types';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useToast } from '../components/ui/ToastProvider';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/StateBlocks';

interface ContactsProps {
  onStartBroadcastWithContacts?: (contactIds: string[]) => void;
  licenseInfo?: LicenseInfo | null;
}

const DEFAULT_CONTACT_CATEGORIES = ['Umum', 'VIP', 'Prospek', 'Pelanggan Tetap', 'Korporat', 'Partner'];

export const Contacts: React.FC<ContactsProps> = ({
  onStartBroadcastWithContacts,
  licenseInfo,
}) => {
  const toast = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [masterCategories, setMasterCategories] = useState<string[]>(DEFAULT_CONTACT_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState('ALL');
  const [selectedKategori, setSelectedKategori] = useState('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [newIdChannel, setNewIdChannel] = useState<'TELEGRAM' | 'INSTAGRAM' | 'FACEBOOK' | 'THREADS'>('TELEGRAM');
  const [newIdExternal, setNewIdExternal] = useState('');
  const [newIdHandle, setNewIdHandle] = useState('');
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [formData, setFormData] = useState({
    nama_lengkap: '',
    nama_panggilan: '',
    tanggal_lahir: '',
    nomor_whatsapp: '',
    alamat: '',
    kategori: '',
    tags: '',
    notes: '',
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
        limit: 500,
      });
      setContacts(res.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Gagal memuat data kontak');
    } finally {
      setLoading(false);
    }
  }, [search, selectedTag, selectedKategori]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

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
    fetchContacts();
  };

  const availableTags = Array.from(
    new Set(
      contacts
        .flatMap((c) => (c.tags ? c.tags.split(',').map((t) => t.trim()) : []))
        .filter(Boolean)
    )
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

  const toggleSelectAll = () => {
    if (selectedIds.length === contacts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(contacts.map((c) => c.id));
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

  return (
    <div className="space-y-5">
      {/* Action Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex flex-1 flex-col sm:flex-row sm:items-center gap-2 min-w-0">
          <form onSubmit={handleSearchSubmit} className="relative w-full flex-none sm:flex-1 min-w-0 sm:min-w-[200px] lg:max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama, panggilan, nomor WA, alamat..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 bg-white border border-gray-200 rounded-md text-[13px] text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-500"
            />
          </form>

          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            <select
              value={selectedKategori}
              onChange={(e) => setSelectedKategori(e.target.value)}
              title="Filter Kelompok / Kategori Kontak"
              className="w-full sm:w-auto max-w-full h-9 px-2.5 sm:px-3 bg-white border border-gray-200 rounded-md text-[13px] text-gray-700 focus:outline-none focus:border-indigo-500 truncate"
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
              onChange={(e) => setSelectedTag(e.target.value)}
              className="w-full sm:w-auto max-w-full h-9 px-2.5 sm:px-3 bg-white border border-gray-200 rounded-md text-[13px] text-gray-700 focus:outline-none focus:border-indigo-500 truncate"
            >
              <option value="ALL">Semua Tag</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  Tag: {tag}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {licenseInfo && licenseInfo.features?.maxContacts > 0 && (
            <span className="inline-flex items-center h-9 px-2.5 rounded-md text-xs font-mono font-medium bg-gray-50 text-gray-700 border border-gray-200 tabular-nums">
              {contacts.length}/{licenseInfo.features.maxContacts.toLocaleString('id-ID')} kontak
            </span>
          )}
          {selectedIds.length > 0 && onStartBroadcastWithContacts && (
            <Button
              variant="primary"
              size="md"
              onClick={() => onStartBroadcastWithContacts(selectedIds)}
            >
              Siaran ({selectedIds.length})
            </Button>
          )}

          <Button
            variant="secondary"
            size="md"
            onClick={() => setIsImportModalOpen(true)}
          >
            Import Data
          </Button>

          <Button
            variant={selectedIds.length > 0 ? 'secondary' : 'primary'}
            size="md"
            onClick={handleOpenAddModal}
          >
            Tambah Kontak
          </Button>
        </div>
      </div>

      {/* Contacts Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading && contacts.length === 0 ? (
          <LoadingState message="Memuat data pelanggan..." />
        ) : error && contacts.length === 0 ? (
          <ErrorState message={error} onRetry={fetchContacts} />
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={<Users className="w-8 h-8" />}
            title="Belum ada data pelanggan"
            description="Tambahkan kontak pelanggan secara manual atau impor daftar melalui CSV."
            action={
              <Button variant="primary" size="sm" onClick={handleOpenAddModal}>
                Tambah Kontak
              </Button>
            }
          />
        ) : (
          <>
            <div className="sm:hidden divide-y divide-gray-200">
              <div className="px-3.5 py-2.5 bg-gray-50 flex items-center justify-between text-xs text-gray-600">
                <label className="inline-flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={contacts.length > 0 && selectedIds.length === contacts.length}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>Pilih Semua ({contacts.length})</span>
                </label>
                {selectedIds.length > 0 && (
                  <span className="font-semibold text-indigo-700">{selectedIds.length} dipilih</span>
                )}
              </div>
              {contacts.map((contact) => {
                const isSelected = selectedIds.includes(contact.id);
                const birthDate = contact.tanggal_lahir ? new Date(contact.tanggal_lahir) : null;
                const isBirthdayToday =
                  birthDate &&
                  birthDate.getMonth() === new Date().getMonth() &&
                  birthDate.getDate() === new Date().getDate();
                return (
                  <div
                    key={contact.id}
                    className={`p-3.5 space-y-2 text-xs ${isSelected ? 'bg-indigo-50/40' : 'bg-white'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <label className="flex items-start gap-2.5 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectContact(contact.id)}
                          className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 truncate">{contact.nama_lengkap}</div>
                          {contact.nama_panggilan && (
                            <div className="text-[11px] text-gray-500">
                              Panggilan: <span className="text-gray-700">{contact.nama_panggilan}</span>
                            </div>
                          )}
                        </div>
                      </label>
                      <div className="inline-flex items-center rounded-md border border-gray-200 bg-white divide-x divide-gray-200 overflow-hidden shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(contact)}
                          className="h-7 w-7 inline-flex items-center justify-center text-gray-600 hover:text-indigo-700 hover:bg-indigo-50"
                          title="Edit Kontak"
                        >
                          <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({ id: contact.id, name: contact.nama_lengkap })
                          }
                          className="h-7 w-7 inline-flex items-center justify-center text-gray-600 hover:text-red-700 hover:bg-red-50"
                          title="Hapus Kontak"
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>

                    <div className="pl-6 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {contact.nomor_whatsapp ? (
                          <a
                            href={`https://wa.me/${contact.nomor_whatsapp}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-indigo-600 hover:underline"
                          >
                            <Phone className="w-3 h-3 text-gray-400" />
                            <span>+{contact.nomor_whatsapp}</span>
                          </a>
                        ) : (
                          <span className="text-[11px] text-gray-400">Tanpa WA</span>
                        )}
                        {contact.kategori && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            <FolderKanban className="w-2.5 h-2.5 text-slate-500" strokeWidth={1.75} />
                            <span>{contact.kategori}</span>
                          </span>
                        )}
                        {isBirthdayToday && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <Cake className="w-2.5 h-2.5" /> Ultah
                          </span>
                        )}
                      </div>

                      {contact.identities && contact.identities.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {contact.identities.map((idItem) => (
                            <span
                              key={idItem.id}
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

                      {(birthDate || contact.alamat) && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                          {birthDate && (
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Calendar className="w-3 h-3 text-gray-400" />
                              {birthDate.toLocaleDateString('id-ID', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          )}
                          {contact.alamat && <span className="truncate max-w-full">{contact.alamat}</span>}
                        </div>
                      )}

                      {contact.tags && (
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
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="p-3.5 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={contacts.length > 0 && selectedIds.length === contacts.length}
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
                          <div className="font-semibold text-gray-900">{contact.nama_lengkap}</div>
                          {contact.nama_panggilan && (
                            <div className="text-[11px] text-gray-500">
                              Panggilan: <span className="text-gray-700">{contact.nama_panggilan}</span>
                            </div>
                          )}
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
                          <div className="inline-flex items-center rounded-md border border-gray-200 bg-white divide-x divide-gray-200 overflow-hidden shadow-xs">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(contact)}
                              className="h-7 w-7 inline-flex items-center justify-center text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
                              title="Edit Kontak"
                            >
                              <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                            </button>
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

        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
          <span className="tabular-nums">
            Total: <strong className="text-gray-900">{contacts.length}</strong> pelanggan | Terpilih:{' '}
            <strong className="text-indigo-700">{selectedIds.length}</strong>
          </span>
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-xs text-gray-500 hover:text-gray-800 underline"
            >
              Batalkan Pilihan
            </button>
          )}
        </div>
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
                <div className="flex flex-wrap gap-1.5">
                  {editingContact.identities.map((idItem) => (
                    <span
                      key={idItem.id}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-gray-50 border border-gray-200 text-[11px] font-mono text-gray-700"
                    >
                      <span className="font-semibold text-indigo-700">{idItem.channel}</span>
                      <span>{idItem.handle || idItem.externalId}</span>
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
                  className="sm:col-span-4 h-8 px-2.5 bg-white border border-gray-200 rounded text-xs font-mono"
                />
                <input
                  type="text"
                  placeholder="@handle (opsional)"
                  value={newIdHandle}
                  onChange={(e) => setNewIdHandle(e.target.value)}
                  className="sm:col-span-3 h-8 px-2.5 bg-white border border-gray-200 rounded text-xs"
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
                  className="sm:col-span-2 h-8"
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
    </div>
  );
};

export default Contacts;
