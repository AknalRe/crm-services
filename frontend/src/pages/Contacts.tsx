import React, { useEffect, useState, useCallback } from 'react';
import {
  Search,
  Plus,
  Upload,
  Edit,
  Trash2,
  Phone,
  Calendar,
  Send,
  Cake,
  Users,
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

export const Contacts: React.FC<ContactsProps> = ({
  onStartBroadcastWithContacts,
  licenseInfo,
}) => {
  const toast = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
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
    tags: '',
    notes: '',
  });

  const [importText, setImportText] = useState('');

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getContacts({
        search: search || undefined,
        tag: selectedTag !== 'ALL' ? selectedTag : undefined,
        limit: 500,
      });
      setContacts(res.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Gagal memuat data kontak');
    } finally {
      setLoading(false);
    }
  }, [search, selectedTag]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

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

  const handleOpenAddModal = () => {
    setEditingContact(null);
    setFormData({
      nama_lengkap: '',
      nama_panggilan: '',
      tanggal_lahir: '',
      nomor_whatsapp: '',
      alamat: '',
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
        await api.createContact(formData);
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

  const handleBulkImport = async () => {
    if (importing || !importText.trim()) return;
    setImporting(true);
    try {
      const lines = importText.split('\n').filter((l) => l.trim().length > 0);
      const items: any[] = [];

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

      if (items.length === 0) {
        toast.warning('Format CSV tidak valid. Minimal: Nama Lengkap, Nomor WhatsApp.');
        return;
      }

      const res = await api.bulkImportContacts(items);
      toast.success(res.message || `${items.length} kontak berhasil diimpor.`);
      setIsImportModalOpen(false);
      setImportText('');
      fetchContacts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengimpor data CSV');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Action Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2 flex-wrap sm:flex-nowrap">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama, panggilan, nomor WA, alamat..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 bg-white border border-gray-200 rounded-md text-[13px] text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-500"
            />
          </form>

          <select
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
            className="h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] text-gray-700 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">Semua Tag</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                Tag: {tag}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {licenseInfo && licenseInfo.features?.maxContacts > 0 && (
            <span className="inline-flex items-center h-8 px-2.5 rounded text-xs font-mono font-medium bg-gray-50 text-gray-700 border border-gray-200 tabular-nums">
              {contacts.length}/{licenseInfo.features.maxContacts.toLocaleString('id-ID')} kontak
            </span>
          )}
          {selectedIds.length > 0 && onStartBroadcastWithContacts && (
            <Button
              variant="primary"
              size="md"
              onClick={() => onStartBroadcastWithContacts(selectedIds)}
              leftIcon={<Send className="w-4 h-4" />}
            >
              Siaran ke {selectedIds.length} Terpilih
            </Button>
          )}

          <Button
            variant="secondary"
            size="md"
            onClick={() => setIsImportModalOpen(true)}
            leftIcon={<Upload className="w-4 h-4" />}
          >
            Import CSV
          </Button>

          <Button
            variant={selectedIds.length > 0 ? 'secondary' : 'primary'}
            size="md"
            onClick={handleOpenAddModal}
            leftIcon={<Plus className="w-4 h-4" />}
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
              <Button variant="primary" size="sm" onClick={handleOpenAddModal} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                Tambah Kontak
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
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
                        <a
                          href={`https://wa.me/${contact.nomor_whatsapp}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-indigo-600 hover:text-indigo-700 hover:underline"
                        >
                          <Phone className="w-3 h-3 text-gray-400" />
                          <span>+{contact.nomor_whatsapp}</span>
                        </a>
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
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(contact)}
                            className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                            title="Edit Kontak"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteTarget({ id: contact.id, name: contact.nama_lengkap })
                            }
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Hapus Kontak"
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
                Nomor WhatsApp <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
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
        </form>
      </Modal>

      {/* Bulk Import CSV Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Import Data Pelanggan CSV"
        subtitle="Tempel data teks CSV (satu pelanggan per baris)"
        isLoading={importing}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsImportModalOpen(false)}
              disabled={importing}
            >
              Batal
            </Button>
            <Button
              variant="primary"
              onClick={handleBulkImport}
              isLoading={importing}
              disabled={!importText.trim()}
            >
              Proses Import
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-xs text-gray-600">
            Format kolom per baris:
            <code className="block mt-1 text-gray-800 font-mono text-[11px] bg-gray-100 px-2 py-1.5 rounded border border-gray-200">
              Nama Lengkap, Nomor WhatsApp, Nama Panggilan, YYYY-MM-DD, Alamat, Tag
            </code>
          </div>
          <textarea
            rows={6}
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
