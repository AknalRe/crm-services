import React, { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { api } from '../services/api';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { LoadingState, ErrorState } from './ui/StateBlocks';
import { useToast } from './ui/ToastProvider';

interface CompanyProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (company: {
    id: string;
    name: string;
    slug: string;
    ownerName?: string | null;
    ownerEmail?: string | null;
    ownerPhone?: string | null;
  }) => void;
}

export const CompanyProfileModal: React.FC<CompanyProfileModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');

  const loadCompany = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await api.getCurrentCompany();
      const c = res.company;
      setName(c.name || '');
      setSlug(c.slug || '');
      setOwnerName(c.ownerName || '');
      setOwnerEmail(c.ownerEmail || '');
      setOwnerPhone(c.ownerPhone || '');
    } catch (err: any) {
      setLoadError(err?.response?.data?.error || err?.message || 'Gagal memuat data usaha.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    void loadCompany();
  }, [isOpen]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      toast.error('Nama usaha wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      const updated = await api.updateCurrentCompany({
        name: cleanName,
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim(),
        ownerPhone: ownerPhone.trim(),
      });
      toast.success('Data usaha berhasil diperbarui.');
      onSaved?.(updated);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Gagal menyimpan data usaha.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Data Usaha"
      subtitle="Perbarui nama usaha dan informasi kontak pemilik workspace aktif"
      maxWidthClass="max-w-lg"
      isLoading={saving}
      footer={
        <div className="w-full grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={saving}
            className="justify-center"
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => void handleSave()}
            isLoading={saving}
            disabled={loading || Boolean(loadError) || !name.trim()}
            className="justify-center"
          >
            Simpan Perubahan
          </Button>
        </div>
      }
    >
      {loading ? (
        <LoadingState message="Memuat data usaha..." />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={() => void loadCompany()} />
      ) : (
        <form onSubmit={handleSave} className="space-y-3.5 text-xs">
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="text-[11px] text-gray-500">Kode Workspace</span>
            </div>
            <span className="font-mono text-[11px] font-semibold text-gray-800 truncate">
              {slug || '-'}
            </span>
          </div>

          <div>
            <label htmlFor="company-profile-name" className="block text-gray-700 font-medium mb-1">
              Nama Usaha / Perusahaan <span className="text-red-500">*</span>
            </label>
            <input
              id="company-profile-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: PT Sumber Makmur"
              className="w-full h-9 px-3 text-[13px] rounded-md border border-gray-200 bg-white text-gray-900 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="company-profile-owner" className="block text-gray-700 font-medium mb-1">
              Nama Pemilik / PIC
            </label>
            <input
              id="company-profile-owner"
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Contoh: Budi Santoso"
              className="w-full h-9 px-3 text-[13px] rounded-md border border-gray-200 bg-white text-gray-900 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="company-profile-email" className="block text-gray-700 font-medium mb-1">
                Email Usaha
              </label>
              <input
                id="company-profile-email"
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="admin@usaha.com"
                className="w-full h-9 px-3 text-[13px] rounded-md border border-gray-200 bg-white text-gray-900 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="company-profile-phone" className="block text-gray-700 font-medium mb-1">
                Nomor WhatsApp Usaha
              </label>
              <input
                id="company-profile-phone"
                type="tel"
                value={ownerPhone}
                onChange={(e) => setOwnerPhone(e.target.value)}
                placeholder="081234567890"
                className="w-full h-9 px-3 text-[13px] rounded-md border border-gray-200 bg-white text-gray-900 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
};
