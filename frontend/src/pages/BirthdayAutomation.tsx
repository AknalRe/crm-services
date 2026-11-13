import React, { useEffect, useState } from 'react';
import {
  Cake,
  Clock,
  Send,
  Save,
  CheckCircle,
  AlertCircle,
  Sparkles,
  Users,
  Eye,
  Sliders,
} from 'lucide-react';
import api from '../services/api';
import { BirthdaySetting, Contact } from '../types';

export const BirthdayAutomation: React.FC = () => {
  const [setting, setSetting] = useState<BirthdaySetting | null>(null);
  const [celebrantsToday, setCelebrantsToday] = useState<Contact[]>([]);
  const [totalRegistered, setTotalRegistered] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);

  // Form
  const [isEnabled, setIsEnabled] = useState(true);
  const [sendTime, setSendTime] = useState('08:00');
  const [messageTemplate, setMessageTemplate] = useState('');
  const [delaySeconds, setDelaySeconds] = useState(5);

  const loadBirthdayData = async () => {
    setLoading(true);
    try {
      const data = await api.getBirthdaySettings();
      setSetting(data.setting);
      setIsEnabled(data.setting.isEnabled);
      setSendTime(data.setting.sendTime);
      setMessageTemplate(data.setting.messageTemplate);
      setDelaySeconds(data.setting.delaySeconds || 5);
      setCelebrantsToday(data.celebrants.today || []);
      setTotalRegistered(data.celebrants.totalRegistered || 0);
    } catch (err) {
      console.error('Error loading birthday settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBirthdayData();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateBirthdaySettings({
        isEnabled,
        sendTime,
        messageTemplate,
        delaySeconds,
      });
      alert('Pengaturan ucapan ulang tahun berhasil disimpan!');
      loadBirthdayData();
    } catch (err: any) {
      alert(err.response?.data?.error || err.message || 'Gagal menyimpan pengaturan');
    } finally {
      setSaving(false);
    }
  };

  const handleTriggerNow = async () => {
    if (celebrantsToday.length === 0) {
      alert('Tidak ada pelanggan yang berulang tahun hari ini.');
      return;
    }

    if (
      confirm(
        `Kirim ucapan ulang tahun sekarang untuk ${celebrantsToday.length} pelanggan hari ini?`
      )
    ) {
      setTriggering(true);
      try {
        const res = await api.triggerBirthdayGreetings();
        alert(`Berhasil! ${res.data.count} pesan ucapan telah dimasukkan ke antrean siaran.`);
        loadBirthdayData();
      } catch (err: any) {
        alert(err.response?.data?.error || err.message || 'Gagal mengirim ucapan');
      } finally {
        setTriggering(false);
      }
    }
  };

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
      {/* Top Overview Banner */}
      <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 rounded-2xl p-6 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/20 text-white backdrop-blur-sm mb-2">
            <Cake className="w-3.5 h-3.5" />
            Birthday Automation Bot
          </span>
          <h2 className="text-2xl font-bold">Ucapan Ulang Tahun Pelanggan Otomatis</h2>
          <p className="text-amber-100 text-xs mt-1 max-w-xl">
            Tingkatkan loyalitas pelanggan dengan ucapan ulang tahun otomatis yang menyapa nama panggilan mereka setiap pagi pada jam yang Anda tentukan.
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 text-center min-w-[200px]">
          <span className="text-xs text-amber-100 block">Ulang Tahun Hari Ini</span>
          <span className="text-3xl font-extrabold text-white">{celebrantsToday.length}</span>
          <span className="text-[11px] text-amber-200 block mt-0.5">
            dari {totalRegistered} data bertanggal lahir
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings Form (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSaveSettings} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Pengaturan Bot Ucapan</h3>
                <p className="text-xs text-slate-500">Konfigurasi jadwal dan template pesan</p>
              </div>

              {/* Enable / Disable Switch */}
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs font-semibold text-slate-700">
                  {isEnabled ? 'Bot Aktif' : 'Bot Nonaktif'}
                </span>
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => setIsEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 relative" />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Jam Kirim Otomatis Setiap Pagi
                </label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="time"
                    required
                    value={sendTime}
                    onChange={(e) => setSendTime(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Disarankan jam 08:00 - 09:00 pagi
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Jeda Antar Pesan (Detik)
                </label>
                <div className="relative">
                  <Sliders className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    min="3"
                    max="30"
                    value={delaySeconds}
                    onChange={(e) => setDelaySeconds(parseInt(e.target.value, 10))}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Jeda anti-ban saat ada beberapa yang ultah
                </span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Template Pesan Ucapan
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMessageTemplate((prev) => prev + ' {nama_panggilan}')}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-mono border"
                  >
                    {'{nama_panggilan}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMessageTemplate((prev) => prev + ' {nama_lengkap}')}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-mono border"
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
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs leading-relaxed focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                placeholder="Tulis ucapan ulang tahun..."
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
              </button>
            </div>
          </form>

          {/* Today's Celebrants Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">
                  Daftar Pelanggan Ulang Tahun Hari Ini
                </h3>
                <p className="text-xs text-slate-500">
                  Tanggal {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}
                </p>
              </div>

              {celebrantsToday.length > 0 && (
                <button
                  type="button"
                  onClick={handleTriggerNow}
                  disabled={triggering}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{triggering ? 'Mengirim...' : 'Kirim Sekarang'}</span>
                </button>
              )}
            </div>

            <div className="divide-y divide-slate-100">
              {celebrantsToday.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Tidak ada pelanggan yang berulang tahun hari ini.
                </div>
              ) : (
                celebrantsToday.map((contact) => (
                  <div key={contact.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                    <div>
                      <div className="font-semibold text-slate-800 text-xs">
                        {contact.nama_lengkap}{' '}
                        {contact.nama_panggilan && (
                          <span className="text-slate-500 font-normal">
                            ({contact.nama_panggilan})
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        +{contact.nomor_whatsapp} {contact.alamat && `• ${contact.alamat}`}
                      </div>
                    </div>

                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                      Ulang Tahun 🎉
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Live Preview & Info Column (1 col) */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-slate-400" />
              <span>Pratinjau Ucapan Ulang Tahun</span>
            </h4>

            <div className="bg-[#e5ddd5] p-4 rounded-xl border border-slate-300/80 shadow-inner">
              <div className="bg-white rounded-lg p-3 text-xs shadow-sm max-w-[90%] ml-auto rounded-tr-none text-slate-800 whitespace-pre-wrap leading-relaxed relative">
                {previewMessage || '(Ketik template untuk pratinjau)'}
                <div className="text-[9px] text-slate-400 text-right mt-1">
                  {sendTime} • <span className="text-blue-500 font-bold">✓✓</span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 text-center">
              Target simulasi: {sampleContact.nama_lengkap}
            </p>
          </div>

          <div className="bg-slate-900 rounded-xl p-5 text-slate-300 text-xs space-y-3">
            <h4 className="font-bold text-white text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Cara Kerja Bot Ulang Tahun</span>
            </h4>
            <ul className="space-y-2 text-slate-400 text-[11px] leading-relaxed list-disc list-inside">
              <li>Sistem mengecek tanggal &amp; bulan lahir pelanggan setiap hari.</li>
              <li>Tepat pada jam yang ditentukan (misal {sendTime} WIB), pesan otomatis dikirimkan.</li>
              <li>Pesan menggunakan nama panggilan agar terkesan ramah dan personal.</li>
              <li>Jeda anti-ban ({delaySeconds} detik) memastikan akun WhatsApp Anda tetap aman.</li>
              <li>Setiap pengiriman tercatat di Riwayat Siaran dengan tipe <span className="text-amber-400 font-mono">BIRTHDAY</span>.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
export default BirthdayAutomation;

