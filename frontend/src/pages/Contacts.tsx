import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  Trash2,
  Edit,
  Send,
  Upload,
  Phone,
  MapPin,
  Calendar,
  X,
  Cake,
  Check,
} from 'lucide-react';
import api from '../services/api';
import { Contact } from '../types';

interface ContactsProps {
  onStartBroadcastWithContacts?: (contactIds: string[]) => void;
}

export const Contacts: React.FC<ContactsProps> = ({ onStartBroadcastWithContacts }) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState('ALL');
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    nama_lengkap: '',
    nama_panggilan: '',
    tanggal_lahir: '',
    nomor_whatsapp: '',
    alamat: '',
    tags: '',
    notes: '',
  });

  // Bulk Import State
  const [importText, setImportText] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const res = await api.getContacts({
        search: search || undefined,
        tag: selectedTag !== 'ALL' ? selectedTag : undefined,
      });
      setContacts(res.data);

      const tags = await api.getContactTags();
      setAvailableTags(tags);
    } catch (err) {
      console.error('Error fetching contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, [selectedTag]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchContacts();
  };

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
      tanggal_lahir: contact.tanggal_lahir ? contact.tanggal_lahir.slice(0, 10) : '',
      nomor_whatsapp: contact.nomor_whatsapp,
      alamat: contact.alamat || '',
      tags: contact.tags || '',
      notes: contact.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingContact) {
        await api.updateContact(editingContact.id, formData);
      } else {
        await api.createContact(formData);
      }
      setIsModalOpen(false);
      fetchContacts();
    } catch (err: any) {
      alert(err.response?.data?.error || err.message || 'Gagal menyimpan kontak');
    }
  };

  const handleDeleteContact = async (id: string, name: string) => {
    if (confirm(`Yakin ingin menghapus kontak "${name}"?`)) {
      try {
        await api.deleteContact(id);
        fetchContacts();
        setSelectedIds((prev) => prev.filter((i) => i !== id));
      } catch (err: any) {
        alert(err.response?.data?.error || 'Gagal menghapus kontak');
      }
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
    try {
      setImportStatus('Memproses import...');
      const lines = importText.split('\n').filter((l) => l.trim().length > 0);
      const items: any[] = [];

      for (const line of lines) {
        // format CSV: nama_lengkap, nomor_whatsapp, nama_panggilan, tanggal_lahir, alamat, tags
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

      const res = await api.bulkImportContacts(items);
      setImportStatus(res.message);
      fetchContacts();
      setTimeout(() => {
        setIsImportModalOpen(false);
        setImportStatus(null);
        setImportText('');
      }, 1500);
    } catch (err: any) {
      setImportStatus(err.response?.data?.error || 'Gagal mengimpor data');
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search & Tag Filter */}
        <div className="flex flex-1 items-center gap-2">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama, panggilan, nomor WA, alamat..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </form>

          <select
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="ALL">Semua Tag</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                Tag: {tag}
              </option>
            ))}
          </select>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && onStartBroadcastWithContacts && (
            <button
              onClick={() => onStartBroadcastWithContacts(selectedIds)}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-sm animate-bounce"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Broadcast ke {selectedIds.length} Terpilih</span>
            </button>
          )}

          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-xs border border-slate-200 transition-colors flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import CSV</span>
          </button>

          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Kontak</span>
          </button>
        </div>
      </div>

      {/* Contacts Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="p-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={contacts.length > 0 && selectedIds.length === contacts.length}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
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

            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Memuat data pelanggan...
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Belum ada data pelanggan. Silakan klik "Tambah Kontak" atau "Import CSV".
                  </td>
                </tr>
              ) : (
                contacts.map((contact) => {
                  const isSelected = selectedIds.includes(contact.id);
                  const birthDate = contact.tanggal_lahir ? new Date(contact.tanggal_lahir) : null;
                  const isBirthdayToday =
                    birthDate &&
                    birthDate.getMonth() === new Date().getMonth() &&
                    birthDate.getDate() === new Date().getDate();

                  return (
                    <tr
                      key={contact.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        isSelected ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      <td className="p-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectContact(contact.id)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </td>

                      {/* Name */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{contact.nama_lengkap}</div>
                        {contact.nama_panggilan && (
                          <div className="text-[11px] text-slate-400">
                            Panggilan: <span className="text-slate-600">{contact.nama_panggilan}</span>
                          </div>
                        )}
                      </td>

                      {/* WhatsApp Phone */}
                      <td className="py-3 px-4">
                        <a
                          href={`https://wa.me/${contact.nomor_whatsapp}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-emerald-700 hover:text-emerald-800 hover:underline"
                        >
                          <Phone className="w-3 h-3 text-emerald-500" />
                          <span>+{contact.nomor_whatsapp}</span>
                        </a>
                      </td>

                      {/* Birthday */}
                      <td className="py-3 px-4">
                        {birthDate ? (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>
                              {birthDate.toLocaleDateString('id-ID', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                            {isBirthdayToday && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 animate-pulse">
                                <Cake className="w-2.5 h-2.5" /> Ultah!
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Address */}
                      <td className="py-3 px-4 max-w-xs truncate text-slate-600">
                        {contact.alamat ? (
                          <span title={contact.alamat}>{contact.alamat}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Tags */}
                      <td className="py-3 px-4">
                        {contact.tags ? (
                          <div className="flex flex-wrap gap-1">
                            {contact.tags.split(',').map((tag, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
                              >
                                {tag.trim()}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEditModal(contact)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                            title="Edit Kontak"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteContact(contact.id, contact.nama_lengkap)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Hapus Kontak"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Summary */}
        <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>
            Total: <strong>{contacts.length}</strong> pelanggan | Terpilih:{' '}
            <strong className="text-emerald-700">{selectedIds.length}</strong>
          </span>
          {selectedIds.length > 0 && (
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs text-slate-400 hover:text-slate-600 underline"
            >
              Batalkan Pilihan
            </button>
          )}
        </div>
      </div>

      {/* Add / Edit Contact Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl relative border border-slate-100">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-800 mb-1">
              {editingContact ? 'Edit Data Pelanggan' : 'Tambah Pelanggan Baru'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Informasi lengkap untuk personalisasi siaran dan ucapan otomatis.
            </p>

            <form onSubmit={handleSaveContact} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Lengkap <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Budi Santoso"
                    value={formData.nama_lengkap}
                    onChange={(e) => setFormData({ ...formData, nama_lengkap: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Panggilan
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Budi"
                    value={formData.nama_panggilan}
                    onChange={(e) => setFormData({ ...formData, nama_panggilan: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nomor WhatsApp <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 08123456789"
                    value={formData.nomor_whatsapp}
                    onChange={(e) => setFormData({ ...formData, nomor_whatsapp: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-400">Otomatis diubah ke format 62...</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Lahir
                  </label>
                  <input
                    type="date"
                    value={formData.tanggal_lahir}
                    onChange={(e) => setFormData({ ...formData, tanggal_lahir: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-400">Digunakan untuk ucapan ultah</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Alamat</label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Jl. Sudirman No. 45, Jakarta Selatan"
                  value={formData.alamat}
                  onChange={(e) => setFormData({ ...formData, alamat: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tag / Segmen
                  </label>
                  <input
                    type="text"
                    placeholder="Pisahkan koma: VIP, Reseller, Retail"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Catatan Tambahan
                  </label>
                  <input
                    type="text"
                    placeholder="Catatan khusus pelanggan..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow"
                >
                  {editingContact ? 'Simpan Perubahan' : 'Tambah Pelanggan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import CSV Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl relative border border-slate-100">
            <button
              onClick={() => setIsImportModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-800 mb-1">Import Data Pelanggan CSV</h3>
            <p className="text-xs text-slate-500 mb-3">
              Tempel data teks CSV (satu pelanggan per baris) dengan format:
              <br />
              <code className="text-slate-700 font-mono text-[11px] bg-slate-100 px-1 py-0.5 rounded">
                Nama Lengkap, Nomor WhatsApp, Nama Panggilan, YYYY-MM-DD, Alamat, Tag
              </code>
            </p>

            <textarea
              rows={6}
              placeholder="Budi Santoso, 081234567890, Budi, 1992-05-14, Jakarta Selatan, VIP&#10;Siti Rahma, 082198765432, Siti, 1995-11-20, Bandung, Retail"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />

            {importStatus && (
              <div className="mt-2 text-xs font-medium text-emerald-700 bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                {importStatus}
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleBulkImport}
                disabled={!importText.trim()}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow"
              >
                Proses Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default Contacts;

