import React, { useEffect, useState, useCallback } from 'react';
import {
  Cake,
  Clock,
  Send,
  Save,
  Eye,
  Sliders,
} from 'lucide-react';
import api from '../services/api';
import { Contact } from '../types';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useToast } from '../components/ui/ToastProvider';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/StateBlocks';

export const BirthdayAutomation: React.FC = () => {
  const toast = useToast();
  const [celebrantsToday, setCelebrantsToday] = useState<Contact[]>([]);
  const [totalRegistered, setTotalRegistered] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [confirmTriggerOpen, setConfirmTriggerOpen] = useState(false);

  const [isEnabled, setIsEnabled] = useState(true);
  const [sendTime, setSendTime] = useState('08:00');
  const [messageTemplate, setMessageTemplate] = useState('');
  const [delaySeconds, setDelaySeconds] = useState(5);

  const loadBirthdayData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getBirthdaySettings();
      setIsEnabled(data.setting.isEnabled);
      setSendTime(data.setting.sendTime);
      setMessageTemplate(data.setting.messageTemplate);
      setDelaySeconds(data.setting.delaySeconds || 5);
      setCelebrantsToday(data.celebrants.today || []);
      setTotalRegistered(data.celebrants.totalRegistered || 0);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Gagal memuat pengaturan ulang tahun');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBirthdayData();
  }, [loadBirthdayData]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await api.updateBirthdaySettings({
        isEnabled,
        sendTime,
        messageTemplate,
        delaySeconds,
      });
      toast.success('Pengaturan ucapan ulang tahun berhasil disimpan.');
      loadBirthdayData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Gagal menyimpan pengaturan');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmTriggerNow = async () => {
    if (triggering) return;
    setTriggering(true);
    try {
      const res = await api.triggerBirthdayGreetings();
      toast.success(`${res.data.count} pesan ucapan berhasil dimasukkan ke antrean siaran.`);
      setConfirmTriggerOpen(false);
      loadBirthdayData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Gagal mengirim ucapan');
    } finally {
      setTriggering(false);
    }
  };

  if (loading && !messageTemplate) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <LoadingState message="Memuat konfigurasi otomasi ulang tahun..." />
      </div>
    );
  }

  if (error && !messageTemplate) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <ErrorState message={error} onRetry={loadBirthdayData} />
      </div>
    );
  }

  const sampleContact = celebrantsToday[0] || {
    nama_lengkap: 'Siti Aminah',
    nama_panggilan: 'Siti',
    nomor_whatsapp: '6281298765432',
  };

  const previewMessage = messageTemplate
    .replace(/{nama_lengkap}/gi, sampleContact.nama_lengkap)
    .replace(/{nama_panggilan}/gi, sampleContact.nama_panggilan || 'Siti');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Ucapan Ulang Tahun Otomatis</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Kirim ucapan personal otomatis setiap pagi kepada pelanggan yang berulang tahun.
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 px-4 py-2.5 flex items-center gap-3 shrink-0">
          <Cake className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <span className="text-[11px] text-gray-500 block">Ulang Tahun Hari Ini</span>
            <span className="text-sm font-bold text-gray-900 tabular-nums">
              {celebrantsToday.length}{' '}
              <span className="text-xs font-normal text-gray-500">
                dari {totalRegistered} kontak bertanggal lahir
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <form onSubmit={handleSaveSettings} className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
            <div className="flex items-center justify-between pb-3.5 border-b border-gray-200">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Pengaturan Bot Ucapan</h3>
                <p className="text-xs text-gray-500 mt-0.5">Konfigurasi jadwal dan template pesan</p>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs font-medium text-gray-700">
                  {isEnabled ? 'Aktif' : 'Nonaktif'}
                </span>
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => setIsEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 relative" />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Jam Kirim Otomatis Harian
                </label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="time"
                    required
                    value={sendTime}
                    onChange={(e) => setSendTime(e.target.value)}
                    className="w-full h-9 pl-9 pr-3 bg-white border border-gray-200 rounded-md text-[13px] font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <span className="text-[11px] text-gray-400 mt-1 block">
                  Disarankan pukul 08:00 - 09:00 pagi
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Jeda Antar Pesan (Detik)
                </label>
                <div className="relative">
                  <Sliders className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    min="3"
                    max="30"
                    value={delaySeconds}
                    onChange={(e) => setDelaySeconds(parseInt(e.target.value, 10) || 5)}
                    className="w-full h-9 pl-9 pr-3 bg-white border border-gray-200 rounded-md text-[13px] font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <span className="text-[11px] text-gray-400 mt-1 block">
                  Jeda pengiriman saat terdapat beberapa penerima
                </span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-gray-700">
                  Template Pesan Ucapan
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMessageTemplate((prev) => prev + ' {nama_panggilan}')}
                    className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-[11px] font-mono border border-gray-200"
                  >
                    {'{nama_panggilan}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMessageTemplate((prev) => prev + ' {nama_lengkap}')}
                    className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-[11px] font-mono border border-gray-200"
                  >
                    {'{nama_lengkap}'}
                  </button>
                </div>
              </div>

              <textarea
                rows={5}
                required
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                className="w-full p-3 bg-white border border-gray-200 rounded-md text-[13px] leading-relaxed focus:outline-none focus:border-indigo-500"
                placeholder="Tulis ucapan ulang tahun..."
              />
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-gray-200">
              <Button
                type="submit"
                variant="primary"
                isLoading={saving}
                leftIcon={<Save className="w-4 h-4" />}
              >
                Simpan Pengaturan
              </Button>
            </div>
          </form>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">
                  Daftar Pelanggan Ulang Tahun Hari Ini
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>

              {celebrantsToday.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmTriggerOpen(true)}
                  disabled={triggering}
                  leftIcon={<Send className="w-3.5 h-3.5" />}
                >
                  Kirim Sekarang
                </Button>
              )}
            </div>

            <div className="divide-y divide-gray-200">
              {celebrantsToday.length === 0 ? (
                <EmptyState
                  title="Tidak ada pelanggan ulang tahun hari ini"
                  description="Daftar akan terisi otomatis jika ada kontak yang tanggal lahirnya cocok dengan hari ini."
                />
              ) : (
                celebrantsToday.map((contact) => (
                  <div
                    key={contact.id}
                    className="px-5 py-3.5 flex items-center justify-between hover:bg-gray-50"
                  >
                    <div>
                      <div className="font-semibold text-gray-900 text-xs">
                        {contact.nama_lengkap}{' '}
                        {contact.nama_panggilan && (
                          <span className="text-gray-500 font-normal">
                            ({contact.nama_panggilan})
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 font-mono mt-0.5">
                        +{contact.nomor_whatsapp} {contact.alamat && `• ${contact.alamat}`}
                      </div>
                    </div>

                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                      Ulang Tahun
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h4 className="font-semibold text-gray-700 text-xs uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-gray-400" />
              <span>Pratinjau Pesan</span>
            </h4>

            <div className="bg-[#e5ddd5] p-4 rounded-lg border border-gray-200">
              <div className="bg-white rounded-md p-3 text-xs shadow-sm max-w-[90%] ml-auto text-gray-800 whitespace-pre-wrap leading-relaxed">
                {previewMessage || '(Ketik template untuk melihat pratinjau)'}
                <div className="text-[10px] text-gray-400 text-right mt-1 font-mono">
                  {sendTime}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-2 text-center">
              Simulasi target: {sampleContact.nama_lengkap}
            </p>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5 text-xs space-y-2.5">
            <h4 className="font-semibold text-gray-900 text-sm">Cara Kerja Otomasi</h4>
            <ul className="space-y-1.5 text-gray-600 text-[11px] leading-relaxed list-disc list-inside">
              <li>Sistem memeriksa tanggal dan bulan lahir pelanggan setiap hari.</li>
              <li>Pesan dikirim otomatis pada pukul <strong className="font-mono">{sendTime} WIB</strong>.</li>
              <li>Jeda pengiriman (<strong className="font-mono">{delaySeconds} detik</strong>) menjaga keamanan sesi WhatsApp.</li>
              <li>Riwayat pengiriman tercatat pada daftar siaran dengan tipe <code className="font-mono text-gray-800">BIRTHDAY</code>.</li>
            </ul>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmTriggerOpen}
        onClose={() => setConfirmTriggerOpen(false)}
        onConfirm={handleConfirmTriggerNow}
        isLoading={triggering}
        title="Kirim Ucapan Ulang Tahun Sekarang?"
        description={`Sistem akan memasukkan ucapan ulang tahun untuk ${celebrantsToday.length} pelanggan hari ini ke dalam antrean siaran.`}
        confirmLabel="Kirim Sekarang"
        variant="primary"
      />
    </div>
  );
};

export default BirthdayAutomation;
