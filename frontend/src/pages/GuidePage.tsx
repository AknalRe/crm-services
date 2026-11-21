import React, { useState, useMemo, useEffect } from 'react';
import {
  BookOpen,
  Search,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  ExternalLink,
  MessageSquare,
  Users,
  Send,
  Bot,
  Clock,
  Sliders,
  Database,
  Building2,
  CalendarClock,
  Cake,
  Phone,
  Globe,
  Radio,
  FileSpreadsheet,
  AlertTriangle,
  Info,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Home,
  ShieldCheck,
  Eraser,
  Menu,
  X,
  Plus,
  HelpCircle,
  Tag,
  Star,
  FileText,
  UserCheck,
} from 'lucide-react';
import { ReneoCrmLogo } from '../components/ReneoCrmLogo';
import { AuthStatus, SettingsSection } from '../types';

export interface GuidePageProps {
  authenticated?: boolean;
  user?: AuthStatus['user'] | null;
  isStandaloneRoute?: boolean;
  onBackToApp?: () => void;
  onBackToLanding?: () => void;
  onNavigateToTab?: (tab: string, section?: SettingsSection) => void;
}

interface GuideSection {
  id: string;
  title: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string }>;
  summary: string;
  keywords: string[];
  tabTarget?: { tab: string; section?: SettingsSection; label: string };
  content: React.ReactNode;
}

export const GuidePage: React.FC<GuidePageProps> = ({
  authenticated = false,
  user,
  isStandaloneRoute = false,
  onBackToApp,
  onBackToLanding,
  onNavigateToTab,
}) => {
  const [activeSectionId, setActiveSectionId] = useState<string>('quickstart');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(text);
    setTimeout(() => {
      setCopiedSnippet((prev) => (prev === text ? null : prev));
    }, 2000);
  };

  const sections: GuideSection[] = useMemo(
    () => [
      {
        id: 'quickstart',
        title: 'Memulai Cepat & Alur Kerja',
        badge: 'Pengantar',
        icon: RocketIcon,
        summary:
          'Gambaran umum sistem Reneo CRM, konsep pemisahan data per bisnis, dan alur operasional harian operator.',
        keywords: [
          'memulai',
          'dasar',
          'quickstart',
          'alur kerja',
          'sop',
          'operator',
          'konsep',
          'panduan',
        ],
        tabTarget: { tab: 'dashboard', label: 'Buka Dashboard CRM' },
        content: (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-blue-50/80 border border-blue-200/80 text-blue-950 text-sm leading-relaxed">
              <div className="font-semibold text-blue-900 mb-1 flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-700 shrink-0" />
                Filosofi Reneo CRM: Kelola Pelanggan, Bukan Hanya Percakapannya
              </div>
              <p>
                Reneo CRM dirancang sebagai ruang kerja operasional terpadu yang menggabungkan seluruh pesan masuk
                (WhatsApp, Instagram, Facebook, Threads, Telegram) ke dalam kartu riwayat pelanggan, penugasan tim,
                catatan internal, hingga pengukuran waktu respon (SLA) dan kepuasan pelanggan (CSAT).
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-bold text-gray-900">Alur Kerja Harian Tim Layanan (SOP CS):</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-lg bg-white border border-gray-200 shadow-xs space-y-2">
                  <div className="w-7 h-7 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-bold text-xs">
                    01
                  </div>
                  <h4 className="text-sm font-semibold text-gray-900">Set Status Kehadiran</h4>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Setiap staf CS menyalakan status <strong>Siap</strong> di pojok kiri bawah sidebar sebelum jam operasional dimulai.
                  </p>
                </div>
                <div className="p-3.5 rounded-lg bg-white border border-gray-200 shadow-xs space-y-2">
                  <div className="w-7 h-7 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-bold text-xs">
                    02
                  </div>
                  <h4 className="text-sm font-semibold text-gray-900">Periksa Sesi WhatsApp</h4>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Pastikan status koneksi nomor WhatsApp berstatus <code className="font-mono text-[11px] bg-gray-100 px-1 py-0.5 rounded">CONNECTED</code> di menu Integrasi WhatsApp.
                  </p>
                </div>
                <div className="p-3.5 rounded-lg bg-white border border-gray-200 shadow-xs space-y-2">
                  <div className="w-7 h-7 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-bold text-xs">
                    03
                  </div>
                  <h4 className="text-sm font-semibold text-gray-900">Balas di Kotak Masuk</h4>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Gunakan <strong>Balasan Cepat</strong>, lampirkan <strong>Catatan Internal</strong> saat operasional ganti shift, dan beri <strong>Tag</strong> pada kontak.
                  </p>
                </div>
                <div className="p-3.5 rounded-lg bg-white border border-gray-200 shadow-xs space-y-2">
                  <div className="w-7 h-7 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-bold text-xs">
                    04
                  </div>
                  <h4 className="text-sm font-semibold text-gray-900">Tutup Sesi &amp; Rating</h4>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Setelah kendala terselesaikan, tutup sesi obrolan untuk memicu pengiriman survei kepuasan pelanggan (CSAT).
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-amber-50/80 border border-amber-200/80 text-amber-950 text-xs sm:text-sm space-y-1.5">
              <div className="font-semibold text-amber-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                Catatan Penting Keamanan &amp; Perangkat
              </div>
              <p>
                Sesi WhatsApp dikelola melalui mesin WAHA yang aman. Jangan membagikan tangkapan layar kode QR ke pihak lain.
                Ponsel utama WhatsApp disarankan tetap menyala dan terhubung ke koneksi internet stabil agar webhook real-time selalu sinkron.
              </p>
            </div>
          </div>
        ),
      },
      {
        id: 'workspace',
        title: 'Multi-Workspace & Profil Usaha',
        badge: 'Multi-Bisnis',
        icon: Building2,
        summary:
          'Pengelolaan banyak unit usaha mandiri dalam 1 akun pengguna, pengaturan jam operasional, dan pembersihan data operasional.',
        keywords: [
          'workspace',
          'bisnis',
          'perusahaan',
          'profil usaha',
          'multi usaha',
          'ganti bisnis',
          'tambah bisnis',
          'hapus bisnis',
          'bersihkan data',
        ],
        content: (
          <div className="space-y-6">
            <p className="text-sm text-gray-700 leading-relaxed">
              Fitur <strong>Multi-Workspace</strong> memungkinkan 1 akun mengelola beberapa entitas bisnis atau cabang berbeda
              secara mandiri. Setiap bisnis memiliki nomor WhatsApp, basis kontak, riwayat chat, template siaran, dan kuota lisensi tersendiri.
            </p>

            <div className="space-y-3">
              <h3 className="text-base font-bold text-gray-900">Cara Mengelola Ruang Kerja Bisnis:</h3>
              <div className="space-y-3">
                <div className="p-3.5 rounded-lg bg-white border border-gray-200 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center font-bold">1</span>
                    Beralih Antar Bisnis
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed pl-7">
                    Klik nama bisnis aktif di bagian atas sidebar. Daftar seluruh ruang kerja bisnis Anda akan terbuka.
                    Klik bisnis tujuan untuk berpindah seketika tanpa harus logout.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-white border border-gray-200 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center font-bold">2</span>
                    Mengubah Data Profil &amp; Jam Operasional Usaha
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed pl-7">
                    Di dalam dropdown workspace, klik <strong>Edit Data Usaha</strong>. Anda dapat memperbarui Nama Usaha,
                    Industri, Alamat Kantor, Nomor CS Resmi, Jam Kerja operasional (Senin–Minggu), dan Pesan Sapaan Awal.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-white border border-gray-200 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center font-bold">3</span>
                    Menambah Bisnis Baru (Lisensi Mandiri)
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed pl-7">
                    Klik <strong>+ Bisnis Baru</strong> di panel workspace. Masukkan nama entitas bisnis Anda. Bisnis baru akan
                    langsung memiliki masa uji coba (trial 7 hari) dan dapat diaktifkan lisensi mandirinya kapan saja.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-white border border-gray-200 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                    <Eraser className="w-4 h-4 text-amber-600 shrink-0" />
                    Pembersihan Data Operasional (Data Reset)
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed pl-7">
                    Digunakan saat ingin membersihkan seluruh data uji coba atau kontak lama: menghapus kontak, percakapan,
                    siaran, dan riwayat media. <strong>Paket lisensi, akun staf CS, dan sesi koneksi WhatsApp tetap aman dan tidak terhapus.</strong>
                  </p>
                </div>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'whatsapp',
        title: 'Integrasi WhatsApp (WAHA) & Anti-Banned',
        badge: 'Kanal Utama',
        icon: Phone,
        summary:
          'Langkah menghubungkan nomor WhatsApp via QR Code WAHA, restart sesi, serta panduan keamanan agar nomor tidak terblokir.',
        keywords: [
          'whatsapp',
          'waha',
          'qr code',
          'scan qr',
          'anti banned',
          'blokir',
          'koneksi',
          'sesi',
          'terputus',
          'jeda',
        ],
        tabTarget: { tab: 'settings', section: 'whatsapp', label: 'Buka Pengaturan WhatsApp' },
        content: (
          <div className="space-y-6">
            <div className="space-y-3">
              <h3 className="text-base font-bold text-gray-900">Cara Menghubungkan Nomor WhatsApp:</h3>
              <ol className="list-decimal pl-5 space-y-2 text-xs sm:text-sm text-gray-700 leading-relaxed">
                <li>Buka menu <strong>Integrasi &amp; Kanal &gt; WhatsApp (WAHA)</strong> di sidebar.</li>
                <li>Klik tombol <strong>Pindai QR WhatsApp</strong>. Sistem akan menyiapkan sesi aman.</li>
                <li>Buka aplikasi WhatsApp di smartphone Anda &gt; menu <strong>Titik Tiga / Pengaturan</strong> &gt; <strong>Perangkat Tertaut (Linked Devices)</strong>.</li>
                <li>Pilih <strong>Tautkan Perangkat</strong> dan arahkan kamera smartphone ke kode QR di layar Reneo CRM.</li>
                <li>Setelah terbaca, status sesi akan otomatis berubah menjadi <span className="font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-semibold text-xs">CONNECTED</span>.</li>
              </ol>
            </div>

            <div className="p-4 rounded-lg bg-white border border-gray-200 space-y-3">
              <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                Protokol Standar Keamanan Anti-Banned WhatsApp:
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-700">
                <div className="p-3 rounded-md bg-gray-50 border border-gray-200/80 space-y-1">
                  <div className="font-semibold text-gray-900">1. Gunakan Nomor yang Sudah Matang</div>
                  <p>Hindari menggunakan nomor baru aktif untuk langsung mengirim siaran ratusan pesan. Gunakan nomor bisnis yang sudah memiliki riwayat chat organik sebelumnya.</p>
                </div>
                <div className="p-3 rounded-md bg-gray-50 border border-gray-200/80 space-y-1">
                  <div className="font-semibold text-gray-900">2. Atur Jeda Pengiriman Dinamis</div>
                  <p>Di modul siaran, selalu aktifkan jeda minimal 5–10 detik antar pesan dan jeda istirahat (batch interval 30–60 detik per 10–20 pesan).</p>
                </div>
                <div className="p-3 rounded-md bg-gray-50 border border-gray-200/80 space-y-1">
                  <div className="font-semibold text-gray-900">3. Gunakan Variabel Personalisasi</div>
                  <p>Selalu sertakan variabel <code className="font-mono text-indigo-700 font-semibold">{'{nama_panggilan}'}</code> pada teks agar setiap pesan yang keluar memiliki susunan karakter yang berbeda dan tidak dianggap robot spam.</p>
                </div>
                <div className="p-3 rounded-md bg-gray-50 border border-gray-200/80 space-y-1">
                  <div className="font-semibold text-gray-900">4. Kirim Hanya ke Kontak yang Relevan</div>
                  <p>Gunakan segmentasi Tag untuk memilah penerima pesan siaran sesuai minat produk agar pelanggan tidak menandai (report) nomor sebagai spam.</p>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5">
              <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-slate-600" />
                Troubleshooting WhatsApp Terputus
              </div>
              <p>
                Jika status berubah menjadi <code className="font-mono bg-white px-1 py-0.5 rounded">STOPPED</code> atau <code className="font-mono bg-white px-1 py-0.5 rounded">FAILED</code>,
                cukup klik tombol <strong>Restart Sesi WAHA</strong> di pengaturan WhatsApp. Anda tidak perlu memindai ulang QR selama sesi tautan di smartphone belum dikeluarkan secara manual.
              </p>
            </div>
          </div>
        ),
      },
      {
        id: 'omnichannel',
        title: 'Integrasi Omnichannel (Instagram, FB, Telegram)',
        badge: 'Omnichannel',
        icon: Globe,
        summary:
          'Menghubungkan DM Instagram, komentar Reels, Facebook Messenger, Threads, dan Bot Telegram dalam satu ruang kerja.',
        keywords: [
          'omnichannel',
          'instagram',
          'facebook',
          'threads',
          'telegram',
          'meta',
          'botfather',
          'komentar',
          'dm ig',
        ],
        tabTarget: { tab: 'settings', section: 'omnichannel', label: 'Buka Pengaturan Omnichannel' },
        content: (
          <div className="space-y-6">
            <p className="text-sm text-gray-700 leading-relaxed">
              Reneo CRM menghubungkan seluruh kanal interaksi publik ke dalam 1 inbox terpadu. Percakapan dan komentar dari
              berbagai media sosial dikonsolidasikan langsung ke kartu pelanggan yang sama.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-white border border-gray-200 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-pink-50 border border-pink-200 text-pink-600 flex items-center justify-center font-bold text-xs">
                    IG
                  </div>
                  <h4 className="text-sm font-bold text-gray-900">Instagram &amp; Facebook Page</h4>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Tautkan akun Instagram Bisnis dan Halaman Facebook melalui Meta Access Token &amp; Page ID.
                </p>
                <ul className="list-disc pl-4 space-y-1 text-xs text-gray-600">
                  <li>Otomatis membaca DM dan pesan masuk.</li>
                  <li>Membaca komentar Reels / Postingan dan membalas otomatis via DM.</li>
                </ul>
              </div>

              <div className="p-4 rounded-lg bg-white border border-gray-200 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-sky-50 border border-sky-200 text-sky-600 flex items-center justify-center font-bold text-xs">
                    TG
                  </div>
                  <h4 className="text-sm font-bold text-gray-900">Telegram Bot</h4>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Hubungkan Bot Telegram untuk melayani pelanggan atau komunitas yang aktif di Telegram.
                </p>
                <ul className="list-disc pl-4 space-y-1 text-xs text-gray-600">
                  <li>Buat bot baru melalui <code className="font-mono bg-gray-100 px-1 py-0.5 rounded">@BotFather</code> di Telegram.</li>
                  <li>Salin HTTP API Token ke kolom konfigurasi Telegram di Reneo CRM.</li>
                  <li>Pesan pengguna bot otomatis masuk ke antrean Live Chat.</li>
                </ul>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'contacts',
        title: 'Manajemen Kontak & Impor Data Massal',
        badge: 'Database',
        icon: Users,
        summary:
          'Struktur basis data pelanggan, segmentasi tag/kelompok, impor via Excel/CSV, penegakan kuota paket, dan penghapusan bulk.',
        keywords: [
          'kontak',
          'pelanggan',
          'impor kontak',
          'excel',
          'csv',
          'kuota',
          'tag',
          'kelompok',
          'segmen',
          'bulk delete',
          'hapus massal',
        ],
        tabTarget: { tab: 'contacts', label: 'Buka Data Kontak' },
        content: (
          <div className="space-y-6">
            <p className="text-sm text-gray-700 leading-relaxed">
              Basis data kontak menyimpan riwayat identitas pelanggan, nomor WhatsApp, alamat, tanggal lahir (untuk otomasi ulang tahun),
              kelompok usaha, dan label segmen (tag).
            </p>

            <div className="p-4 rounded-lg bg-white border border-gray-200 space-y-3">
              <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                Format Kolom Impor Data Massal (Excel / CSV)
              </h4>
              <p className="text-xs text-gray-600">
                Gunakan baris pertama file Excel (.xlsx / .csv) sebagai judul kolom. Sistem mendukung pemetaan nama kolom berikut:
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-gray-700 border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-900 font-semibold">
                      <th className="py-2 px-3">Nama Kolom File</th>
                      <th className="py-2 px-3">Wajib?</th>
                      <th className="py-2 px-3">Format / Contoh Isian</th>
                      <th className="py-2 px-3">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <td className="py-2 px-3 font-mono text-indigo-700">nama_lengkap</td>
                      <td className="py-2 px-3"><span className="text-emerald-700 font-medium">Ya</span></td>
                      <td className="py-2 px-3">Budi Santoso</td>
                      <td className="py-2 px-3">Nama lengkap pelanggan</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-mono text-indigo-700">nama_panggilan</td>
                      <td className="py-2 px-3 text-gray-400">Opsional</td>
                      <td className="py-2 px-3">Budi</td>
                      <td className="py-2 px-3">Dipakai pada variabel <code className="font-mono text-indigo-700">{'{nama_panggilan}'}</code></td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-mono text-indigo-700">whatsapp / no_hp</td>
                      <td className="py-2 px-3"><span className="text-emerald-700 font-medium">Ya</span></td>
                      <td className="py-2 px-3">08123456789 atau 628123456789</td>
                      <td className="py-2 px-3">Otomatis dinormalisasi ke format internasional (628xxx)</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-mono text-indigo-700">kelompok</td>
                      <td className="py-2 px-3 text-gray-400">Opsional</td>
                      <td className="py-2 px-3">Pelanggan Retail, Grosir, Reseller</td>
                      <td className="py-2 px-3">Pengelompokan utama</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-mono text-indigo-700">tag / segmen</td>
                      <td className="py-2 px-3 text-gray-400">Opsional</td>
                      <td className="py-2 px-3">VIP, Promo-Lebaran, Komplain</td>
                      <td className="py-2 px-3">Pisahkan dengan koma untuk banyak tag</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-mono text-indigo-700">tgl_lahir</td>
                      <td className="py-2 px-3 text-gray-400">Opsional</td>
                      <td className="py-2 px-3">1995-08-17 atau 17/08/1995</td>
                      <td className="py-2 px-3">Untuk pemicu ucapan selamat ulang tahun otomatis</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-mono text-indigo-700">alamat</td>
                      <td className="py-2 px-3 text-gray-400">Opsional</td>
                      <td className="py-2 px-3">Jl. Ahmad Yani No. 12, Surabaya</td>
                      <td className="py-2 px-3">Dipakai pada variabel <code className="font-mono text-indigo-700">{'{alamat}'}</code></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-bold text-gray-900">Aturan Kuota Kontak &amp; Hapus Massal:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-700">
                <div className="p-3.5 rounded-lg bg-gray-50 border border-gray-200 space-y-1">
                  <div className="font-semibold text-gray-900">Batas Kuota Berdasarkan Paket</div>
                  <p>
                    Paket <strong>Starter</strong> memiliki batas maksimal 1.000 kontak aktif. Paket <strong>Pro</strong> dan <strong>Enterprise</strong> memiliki kuota kontak tanpa batas.
                    Saat kuota penuh, pesan chat baru tetap masuk normal, namun kontak tidak disimpan otomatis ke buku alamat sampai kuota ditingkatkan atau kontak dibersihkan.
                  </p>
                </div>
                <div className="p-3.5 rounded-lg bg-gray-50 border border-gray-200 space-y-1">
                  <div className="font-semibold text-gray-900">Hapus Kontak Massal (Bulk Delete)</div>
                  <p>
                    Di tabel kontak, centang kotak di header tabel atau pilih beberapa kontak secara spesifik. Tombol <strong>Hapus Terpilih</strong> berwarna merah akan muncul di atas tabel
                    dengan konfirmasi keamanan jumlah kontak yang akan dihapus.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'inbox',
        title: 'Kotak Masuk Terpadu (Live Chat CRM)',
        badge: 'Operasional',
        icon: MessageSquare,
        summary:
          'Navigasi antrean percakapan, pembagian staf CS per shift, catatan internal, canned responses, dan penandaan non-penilaian.',
        keywords: [
          'live chat',
          'kotak masuk',
          'inbox',
          'cs',
          'catatan internal',
          'balasan cepat',
          'canned response',
          'non-penilaian',
          'shift',
          'assignee',
        ],
        tabTarget: { tab: 'conversations', label: 'Buka Live Chat CRM' },
        content: (
          <div className="space-y-6">
            <p className="text-sm text-gray-700 leading-relaxed">
              Modul <strong>Live Chat CRM</strong> membagi layar kerja operator menjadi 3 area: daftar antrean percakapan (kiri),
              ruang percakapan aktif (tengah), dan kartu profil pelanggan serta catatan internal (kanan).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-lg bg-white border border-gray-200 space-y-1.5">
                <div className="font-semibold text-gray-900 text-sm">1. Penugasan Staf CS</div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Pilih nama staf pada dropdown <strong>Penanggung Jawab</strong> di bagian atas chat. Staf hanya melihat
                  percakapan miliknya jika filter "Milik Saya" diaktifkan.
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-white border border-gray-200 space-y-1.5">
                <div className="font-semibold text-gray-900 text-sm">2. Catatan Internal (Kuning)</div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Tulis catatan koordinasi di tab Catatan Internal (misalnya info nomor resi atau preferensi pembeli).
                  Pesan ini <strong>hanya terlihat oleh tim internal</strong> dan tidak dikirim ke pelanggan.
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-white border border-gray-200 space-y-1.5">
                <div className="font-semibold text-gray-900 text-sm">3. Balasan Cepat (Quick Reply)</div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Ketik shortcut atau klik ikon petir di sebelah kolom input pesan untuk menyisipkan pesan template yang sudah didaftarkan sebelumnya.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Tag className="w-4 h-4 text-slate-700 shrink-0" />
                Fitur Penandaan "Non-Penilaian":
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Beberapa percakapan bukan berasal dari pembeli melainkan kurir ekspedisi, supplier bahan baku, rekan kantor,
                atau grup komunitas. Agar obrolan ini tidak merusak metrik kecepatan balas (SLA) dan skor kepuasan (CSAT),
                cukup klik tombol <strong>Tandai Non-Penilaian</strong> di header percakapan.
              </p>
            </div>
          </div>
        ),
      },
      {
        id: 'broadcasts',
        title: 'Siaran & Kampanye Pesan (Broadcast)',
        badge: 'Marketing',
        icon: Send,
        summary:
          'Membuat siaran langsung atau terjadwal, personalisasi variabel teks, aturan jeda batch, serta pemantauan centang pengiriman.',
        keywords: [
          'siaran',
          'broadcast',
          'kampanye',
          'terjadwal',
          'variabel',
          'nama panggilan',
          'progres',
          'centang dua',
          'centang biru',
        ],
        tabTarget: { tab: 'broadcasts', label: 'Buka Siaran & Kampanye' },
        content: (
          <div className="space-y-6">
            <p className="text-sm text-gray-700 leading-relaxed">
              Modul siaran memungkinkan Anda mengirim informasi promo, pengumuman layanan, atau katalog baru ke ribuan kontak
              secara terencana dengan mekanisme keamanan anti-blokir.
            </p>

            <div className="p-4 rounded-lg bg-white border border-gray-200 space-y-3">
              <h4 className="text-sm font-bold text-gray-900">Variabel Dinamis yang Didukung:</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="p-2.5 rounded-md bg-gray-50 border border-gray-200 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-semibold text-indigo-700">{'{nama_panggilan}'}</div>
                    <div className="text-[11px] text-gray-500">Panggilan (contoh: Budi)</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy('{nama_panggilan}')}
                    className="p-1 rounded text-gray-500 hover:text-indigo-600 hover:bg-gray-200 transition-colors shrink-0"
                    title="Salin variabel"
                  >
                    {copiedSnippet === '{nama_panggilan}' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="p-2.5 rounded-md bg-gray-50 border border-gray-200 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-semibold text-indigo-700">{'{nama_lengkap}'}</div>
                    <div className="text-[11px] text-gray-500">Nama lengkap penerima</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy('{nama_lengkap}')}
                    className="p-1 rounded text-gray-500 hover:text-indigo-600 hover:bg-gray-200 transition-colors shrink-0"
                    title="Salin variabel"
                  >
                    {copiedSnippet === '{nama_lengkap}' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="p-2.5 rounded-md bg-gray-50 border border-gray-200 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-semibold text-indigo-700">{'{alamat}'}</div>
                    <div className="text-[11px] text-gray-500">Alamat domisili penerima</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy('{alamat}')}
                    className="p-1 rounded text-gray-500 hover:text-indigo-600 hover:bg-gray-200 transition-colors shrink-0"
                    title="Salin variabel"
                  >
                    {copiedSnippet === '{alamat}' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-bold text-gray-900">Langkah Menjadwalkan Siaran Baru:</h4>
              <ol className="list-decimal pl-5 space-y-1.5 text-xs sm:text-sm text-gray-700 leading-relaxed">
                <li>Klik tombol <strong>Siaran &amp; Kampanye</strong> di sidebar lalu pilih tab <strong>Buat Siaran Baru</strong>.</li>
                <li>Pilih mode: <strong>Siaran Langsung</strong> (segera diproses antrean) atau <strong>Siaran Terjadwal</strong> (tentukan tanggal dan jam pengiriman).</li>
                <li>Tentukan sasaran penerima: klik <strong>Semua Kontak</strong>, filter berdasarkan <strong>Tag Segmen</strong>, atau pilih manual kontak tertentu.</li>
                <li>Tulis isi pesan dan manfaatkan variabel dinamis agar personal. Anda juga dapat melampirkan gambar brosur atau dokumen penawaran.</li>
                <li>Sesuaikan slider <strong>Jeda Antar Pesan</strong> (rekomendasi: 5–10 detik) dan <strong>Jeda Batch</strong> (rekomendasi: istirahat 30 detik tiap 10 pesan).</li>
                <li>Klik tombol <strong>Jadwalkan / Kirim Siaran</strong>. Pantau progres pengiriman dan status centang di tab <strong>Riwayat &amp; Progres Siaran</strong>.</li>
              </ol>
            </div>
          </div>
        ),
      },
      {
        id: 'automation',
        title: 'Otomasi Pesan & Ulang Tahun Pelanggan',
        badge: 'Otomasi',
        icon: Cake,
        summary:
          'Pengaturan pesan selamat datang otomatis, pesan luar jam kerja (away message), serta ucapan selamat ulang tahun harian.',
        keywords: [
          'otomasi',
          'auto reply',
          'jam kerja',
          'ulang tahun',
          'birthday',
          'voucher',
          'away message',
          'welcome message',
        ],
        tabTarget: { tab: 'birthday', label: 'Buka Otomasi Ulang Tahun' },
        content: (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-white border border-gray-200 space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
                  <h4 className="text-sm font-bold text-gray-900">Auto-Reply &amp; Jam Operasional</h4>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Diatur melalui menu <strong>Pengaturan CRM &gt; Auto Reply &amp; Jam Kerja</strong>:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-xs text-gray-600 leading-relaxed">
                  <li><strong>Pesan Selamat Datang:</strong> Dikirim otomatis saat nomor baru pertama kali menyapa.</li>
                  <li><strong>Pesan Di Luar Jam Kerja:</strong> Dikirim otomatis saat ada pesan masuk di luar jadwal operasional yang disetel di profil usaha.</li>
                  <li><strong>Balasan Kata Kunci (Keyword Trigger):</strong> Balas info spesifik saat pelanggan mengetik kata seperti "harga", "alamat", "rekening".</li>
                </ul>
              </div>

              <div className="p-4 rounded-lg bg-white border border-gray-200 space-y-2">
                <div className="flex items-center gap-2">
                  <Cake className="w-4 h-4 text-pink-600 shrink-0" />
                  <h4 className="text-sm font-bold text-gray-900">Otomasi Ucapan Ulang Tahun</h4>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Diatur melalui menu <strong>Pelanggan &amp; Siaran &gt; Ulang Tahun</strong>:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-xs text-gray-600 leading-relaxed">
                  <li>Sistem mengecek data tanggal lahir kontak setiap pagi pukul <strong>08.00 WIB</strong>.</li>
                  <li>Otomatis mengirimkan pesan ucapan selamat dan kode voucher diskon personal.</li>
                  <li>Meningkatkan loyalitas pelanggan dan memicu repeat order tanpa kerja manual tim CS.</li>
                </ul>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'ai-agent',
        title: 'Agent AI & Knowledge Books',
        badge: 'Kecerdasan Buatan',
        icon: Bot,
        summary:
          'Melatih asisten AI dengan buku pengetahuan usaha (SOP, FAQ, katalog) untuk membantu menjawab pertanyaan pelanggan.',
        keywords: [
          'ai',
          'agent ai',
          'knowledge book',
          'buku pengetahuan',
          'sop',
          'faq',
          'copilot',
          'kecerdasan buatan',
          'asisten',
        ],
        tabTarget: { tab: 'ai-agent', label: 'Buka Agent AI & KB' },
        content: (
          <div className="space-y-6">
            <p className="text-sm text-gray-700 leading-relaxed">
              Agent AI Reneo berfungsi sebagai asisten cerdas yang memahami katalog produk, aturan toko, jam layanan, dan SOP bisnis Anda
              berdasarkan dokumen panduan (Knowledge Books) yang Anda sediakan.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-lg bg-white border border-gray-200 space-y-1.5">
                <div className="font-semibold text-gray-900 text-sm">Mode Copilot (Rekomendasi Balasan)</div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  AI menyiapkan draft jawaban di dalam kolom chat live. Staf CS dapat meninjau, mengedit sedikit,
                  dan mengirimkannya dengan 1 klik. Mode ini paling disarankan untuk menjaga kehangatan respon manusia.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-white border border-gray-200 space-y-1.5">
                <div className="font-semibold text-gray-900 text-sm">Menambahkan Knowledge Book</div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Buka tab <strong>Knowledge Books</strong> di menu Agent AI. Masukkan teks informasi produk, daftar FAQ,
                  kebijakan retur, atau daftar harga. AI hanya akan menjawab fakta yang ada di dalam buku pengetahuan tersebut.
                </p>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'posts',
        title: 'Publikasi Konten & Galeri Media',
        badge: 'Konten',
        icon: CalendarClock,
        summary:
          'Menjadwalkan publikasi status dan story WhatsApp serta menyimpan aset gambar dan dokumen di galeri terpusat.',
        keywords: [
          'jadwal post',
          'story wa',
          'story whatsapp',
          'galeri',
          'media',
          'ide konten',
          'sosial feed',
        ],
        tabTarget: { tab: 'posts', label: 'Buka Jadwal Postingan' },
        content: (
          <div className="space-y-6">
            <p className="text-sm text-gray-700 leading-relaxed">
              Modul publikasi memudahkan tim marketing merencanakan konten promosi ke status/story WhatsApp dan feed media sosial.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-lg bg-white border border-gray-200 space-y-1.5">
                <div className="font-semibold text-gray-900 text-sm">Jadwal Post &amp; Story</div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Unggah gambar/video promosi, tulis caption, lalu tetapkan tanggal dan jam tayang. Sistem akan otomatis
                  mempublikasikan ke kanal yang dipilih saat waktunya tiba.
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-white border border-gray-200 space-y-1.5">
                <div className="font-semibold text-gray-900 text-sm">Ide Konten AI</div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Gunakan generator ide konten untuk merumuskan sudut pandang edukasi, promo diskon, atau soft-selling
                  yang relevan dengan industri bisnis Anda.
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-white border border-gray-200 space-y-1.5">
                <div className="font-semibold text-gray-900 text-sm">Galeri Media Terpusat</div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Simpan aset foto produk, logo, dan flyer resmi per ruang kerja bisnis sehingga seluruh staf CS dapat
                  melampirkan foto yang sama ke obrolan pelanggan tanpa harus mencari di memori smartphone pribadi.
                </p>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'sla-csat',
        title: 'SLA Kecepatan Respon & Survei Kepuasan (CSAT)',
        badge: 'Kualitas',
        icon: Star,
        summary:
          'Pengukuran target First Response Time (FRT), penutupan sesi otomatis, dan pengiriman tautan rating kepuasan bintang 1–5.',
        keywords: [
          'sla',
          'csat',
          'rating',
          'kecepatan balas',
          'first response time',
          'survei kepuasan',
          'evaluasi tim',
          'performa cs',
        ],
        tabTarget: { tab: 'settings', section: 'sla_csat', label: 'Buka Pengaturan SLA & CSAT' },
        content: (
          <div className="space-y-6">
            <p className="text-sm text-gray-700 leading-relaxed">
              Meningkatkan retensi pembeli dengan standar layanan terukur. Supervisor dapat memantau waktu respon aktual
              setiap staf dan kepuasan pelanggan secara objektif.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-white border border-gray-200 space-y-2">
                <div className="font-bold text-gray-900 text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
                  Target SLA (First Response Time)
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Tentukan target waktu tanggap pertama (misalnya maksimal 5 menit). Obrolan yang melebihi batas target akan
                  diberi penanda visual khusus di antrean agar diprioritaskan oleh supervisor.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-white border border-gray-200 space-y-2">
                <div className="font-bold text-gray-900 text-sm flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500 shrink-0" />
                  Survei CSAT (Customer Satisfaction)
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Saat staf menyelesaikan masalah pelanggan dan menutup sesi, tautan formulir survei rating bintang 1–5
                  otomatis dikirimkan ke pelanggan. Nilai kepuasan tercatat langsung pada profil staf yang menangani sesi tersebut.
                </p>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'team-rbac',
        title: 'Tim, Peran Hak Akses (RBAC) & Kehadiran',
        badge: 'Manajemen Staf',
        icon: UserCheck,
        summary:
          'Pembagian peran Administrator, Supervisor, dan Agen CS, pembatasan ekspor data pelanggan, serta status kehadiran staf.',
        keywords: [
          'tim',
          'agen',
          'rbac',
          'hak akses',
          'admin',
          'supervisor',
          'status kehadiran',
          'kehadiran',
          'online',
          'istirahat',
        ],
        tabTarget: { tab: 'settings', section: 'agents', label: 'Buka Manajemen Tim' },
        content: (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-white border border-gray-200 space-y-3">
              <h4 className="text-sm font-bold text-gray-900">Peran &amp; Pembatasan Wewenang (RBAC):</h4>
              <div className="divide-y divide-gray-100 text-xs">
                <div className="py-2.5 flex items-start justify-between gap-4">
                  <div className="w-28 font-semibold text-gray-900 shrink-0">Administrator</div>
                  <div className="text-gray-600 flex-1">
                    Akses menyeluruh: mengelola pembayaran lisensi, integrasi WhatsApp, tambah/hapus bisnis, tambah staf tim, serta ekspor dan bersihkan data.
                  </div>
                </div>
                <div className="py-2.5 flex items-start justify-between gap-4">
                  <div className="w-28 font-semibold text-gray-900 shrink-0">Supervisor</div>
                  <div className="text-gray-600 flex-1">
                    Memantau seluruh obrolan tim, melihat laporan analitik SLA/CSAT, mengatur jadwal siaran, dan membuat template balasan cepat.
                  </div>
                </div>
                <div className="py-2.5 flex items-start justify-between gap-4">
                  <div className="w-28 font-semibold text-gray-900 shrink-0">Agen CS</div>
                  <div className="text-gray-600 flex-1">
                    Fokus membalas obrolan yang ditugaskan ke dirinya, memperbarui profil pelanggan, dan menggunakan balasan cepat.
                    <strong> Dibatasi dari menghapus basis data kontak atau mengubah konfigurasi sensitif.</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-gray-50 border border-gray-200 space-y-1.5">
              <div className="font-semibold text-gray-900 text-sm">Status Kehadiran Agen CS:</div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Setiap staf dapat menyetel status kehadiran dirinya langsung dari kotak profil di pojok kiri bawah:
                <strong className="text-emerald-700"> Siap (Online)</strong> untuk menerima penugasan obrolan baru,
                <strong className="text-amber-700"> Istirahat (Away)</strong> saat jeda makan/istirahat, atau
                <strong className="text-gray-700"> Offline</strong> saat di luar shift kerja.
              </p>
            </div>
          </div>
        ),
      },
      {
        id: 'license-maintenance',
        title: 'Manajemen Lisensi & Pemeliharaan Data',
        badge: 'Lisensi & Sistem',
        icon: ShieldCheck,
        summary:
          'Tingkatan paket lisensi, penambahan lisensi untuk ekspansi bisnis, pembersihan data operasional, dan penghapusan workspace.',
        keywords: [
          'lisensi',
          'paket',
          'starter',
          'pro',
          'enterprise',
          'beli lisensi',
          'tambah bisnis',
          'bersihkan data',
          'reset',
          'hapus bisnis',
        ],
        content: (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-white border border-gray-200 space-y-3">
              <h4 className="text-sm font-bold text-gray-900">Perbandingan Paket Lisensi Reneo CRM:</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-gray-700 border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-900 font-semibold">
                      <th className="py-2 px-3">Fitur Utama</th>
                      <th className="py-2 px-3">Starter</th>
                      <th className="py-2 px-3">Growth Pro</th>
                      <th className="py-2 px-3">Enterprise Suite</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <td className="py-2 px-3 font-medium text-gray-900">Batas Kuota Kontak</td>
                      <td className="py-2 px-3">Maks. 1.000 kontak</td>
                      <td className="py-2 px-3 font-semibold text-indigo-700">Tanpa Batas</td>
                      <td className="py-2 px-3 font-semibold text-indigo-700">Tanpa Batas</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium text-gray-900">WhatsApp WAHA &amp; Siaran</td>
                      <td className="py-2 px-3">Ya (Siaran Langsung)</td>
                      <td className="py-2 px-3">Ya (Langsung &amp; Terjadwal)</td>
                      <td className="py-2 px-3">Ya (Prioritas Antrean)</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium text-gray-900">Live Chat CRM &amp; Multi-Agen</td>
                      <td className="py-2 px-3 text-gray-400">Dasar (1 staf)</td>
                      <td className="py-2 px-3 font-semibold text-emerald-700">Lengkap (Tim CS)</td>
                      <td className="py-2 px-3 font-semibold text-emerald-700">Lengkap + RBAC Lanjut</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium text-gray-900">SLA, Routing &amp; CSAT</td>
                      <td className="py-2 px-3 text-gray-400">-</td>
                      <td className="py-2 px-3 font-semibold text-emerald-700">Termasuk</td>
                      <td className="py-2 px-3 font-semibold text-emerald-700">Termasuk</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium text-gray-900">Jadwal Post &amp; Story WA</td>
                      <td className="py-2 px-3 text-gray-400">-</td>
                      <td className="py-2 px-3 font-semibold text-emerald-700">Termasuk</td>
                      <td className="py-2 px-3 font-semibold text-emerald-700">Termasuk</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium text-gray-900">Agent AI &amp; Omnichannel</td>
                      <td className="py-2 px-3 text-gray-400">-</td>
                      <td className="py-2 px-3 text-gray-400">-</td>
                      <td className="py-2 px-3 font-semibold text-emerald-700">Lengkap (Semua Kanal)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-bold text-gray-900">Mekanisme Lisensi Multi-Bisnis:</h4>
              <p className="text-xs sm:text-sm text-gray-700 leading-relaxed">
                Anda dapat memiliki banyak ruang kerja bisnis di dalam 1 akun login. Saat Anda membuat unit bisnis baru melalui tombol
                <strong> + Bisnis Baru</strong> di sidebar, bisnis baru tersebut memiliki masa uji coba (trial) mandiri.
                Anda dapat membeli lisensi terpisah untuk masing-masing bisnis sesuai skala kebutuhan cabang tersebut.
              </p>
            </div>
          </div>
        ),
      },
      {
        id: 'troubleshooting',
        title: 'Tanya Jawab (FAQ) & Pemecahan Masalah',
        badge: 'Bantuan',
        icon: HelpCircle,
        summary:
          'Solusi kendala teknis yang sering ditemui: QR code tidak muncul, pesan tertunda, kuota kontak penuh, dan webhook terputus.',
        keywords: [
          'faq',
          'tanya jawab',
          'troubleshoot',
          'error',
          'masalah',
          'kendala',
          'bantuan',
          'gagal',
        ],
        content: (
          <div className="space-y-4">
            <div className="p-3.5 rounded-lg bg-white border border-gray-200 space-y-1">
              <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-indigo-600 shrink-0" />
                Kenapa status WhatsApp sering kembali ke STOPPED atau FAILED?
              </h4>
              <p className="text-xs text-gray-600 leading-relaxed pl-5">
                Periksa koneksi internet pada smartphone utama WhatsApp. Jika smartphone mati atau kehabisan baterai,
                server WAHA tidak dapat menerima webhook masuk. Nyalakan smartphone Anda, lalu klik tombol <strong>Restart Sesi WAHA</strong> di pengaturan WhatsApp.
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-white border border-gray-200 space-y-1">
              <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-indigo-600 shrink-0" />
                Kenapa pengiriman siaran berjalan lambat dan tidak langsung terkirim semua sekaligus?
              </h4>
              <p className="text-xs text-gray-600 leading-relaxed pl-5">
                Hal ini adalah <strong>fitur keamanan anti-banned yang disengaja</strong>. Mengirim ratusan pesan dalam satu detik
                akan memicu proteksi spam WhatsApp yang berujung pada pemblokiran nomor. Jeda dinamis memastikan pesan dikirim secara wajar menyerupai aktivitas manusia.
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-white border border-gray-200 space-y-1">
              <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-indigo-600 shrink-0" />
                Kontak baru tidak bertambah saat ada pesan masuk?
              </h4>
              <p className="text-xs text-gray-600 leading-relaxed pl-5">
                Periksa jumlah kontak aktif Anda di halaman Kontak. Pada paket Starter, terdapat batas 1.000 kontak.
                Jika sudah mencapai batas tersebut, bersihkan kontak lama yang tidak aktif menggunakan fitur bulk delete,
                atau upgrade paket lisensi ke Growth Pro untuk kuota tanpa batas.
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-white border border-gray-200 space-y-1">
              <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-indigo-600 shrink-0" />
                Apakah pesan yang dikirim lewat Reneo CRM tetap muncul di aplikasi WhatsApp HP?
              </h4>
              <p className="text-xs text-gray-600 leading-relaxed pl-5">
                Ya! Karena sistem terhubung sebagai <em>Linked Device</em> resmi WhatsApp, seluruh riwayat percakapan yang dikirim
                atau diterima lewat web Reneo CRM otomatis tersinkronisasi 100% dua arah dengan aplikasi WhatsApp di ponsel Anda.
              </p>
            </div>
          </div>
        ),
      },
    ],
    [copiedSnippet]
  );

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter((s) => {
      const matchTitle = s.title.toLowerCase().includes(q);
      const matchSummary = s.summary.toLowerCase().includes(q);
      const matchKeywords = s.keywords.some((kw) => kw.includes(q));
      return matchTitle || matchSummary || matchKeywords;
    });
  }, [sections, searchQuery]);

  const activeSection = useMemo(() => {
    return sections.find((s) => s.id === activeSectionId) || sections[0];
  }, [sections, activeSectionId]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-gray-900 flex flex-col font-sans">
      {/* Header Bar */}
      <header className="h-14 bg-white border-b border-gray-200 px-3 sm:px-6 flex items-center justify-between gap-3 sticky top-0 z-30 shrink-0 shadow-2xs">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 -ml-1 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 shrink-0"
            aria-label="Toggle Menu Panduan"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-2 min-w-0 cursor-pointer" onClick={onBackToLanding || onBackToApp}>
            <ReneoCrmLogo className="w-6 h-6 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm tracking-tight text-gray-900 truncate">Reneo CRM</span>
                <span className="px-1.5 py-0.2 rounded bg-indigo-50 border border-indigo-200/60 text-indigo-700 text-[10px] font-semibold uppercase tracking-wider">
                  Buku Panduan
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Search Bar in Header (Desktop) */}
        <div className="hidden sm:flex items-center flex-1 max-w-xs mx-4">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari topik (mis: WAHA, impor, anti-banned)..."
              className="w-full h-8 pl-8 pr-7 text-xs bg-gray-50 border border-gray-200 rounded-md text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Navigation Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {authenticated && onBackToApp && (
            <button
              type="button"
              onClick={onBackToApp}
              className="h-8 px-3 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <span>Ke Workspace CRM</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          )}

          {onBackToLanding && (
            <button
              type="button"
              onClick={onBackToLanding}
              className="h-8 px-2.5 rounded-md bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
            >
              <Home className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              <span className="hidden sm:inline">Halaman Utama</span>
            </button>
          )}

          {!authenticated && isStandaloneRoute && !onBackToApp && (
            <a
              href="/login"
              className="h-8 px-3 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <span>Buka CRM</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 max-w-7xl w-full mx-auto flex min-h-0 relative">
        {/* Mobile Search Bar */}
        <div className="sm:hidden px-3 pt-3 bg-white border-b border-gray-200 w-full absolute top-0 left-0 z-20">
          <div className="relative w-full pb-3">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari topik panduan..."
              className="w-full h-8 pl-8 pr-7 text-xs bg-gray-50 border border-gray-200 rounded-md text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Sidebar Index / TOC */}
        <aside
          className={`${
            mobileMenuOpen ? 'block' : 'hidden'
          } md:block w-full md:w-72 lg:w-80 bg-white border-r border-gray-200 shrink-0 absolute md:relative z-20 md:z-auto top-12 md:top-0 bottom-0 md:bottom-auto md:min-h-[calc(100vh-3.5rem)] overflow-y-auto`}
        >
          <div className="p-3 border-b border-gray-100 bg-gray-50/50">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 px-2 py-1">
              Daftar Bab &amp; Modul Operasional ({filteredSections.length})
            </div>
          </div>

          <nav className="p-2 space-y-0.5">
            {filteredSections.map((sec, idx) => {
              const Icon = sec.icon;
              const isActive = activeSectionId === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => {
                    setActiveSectionId(sec.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full text-left p-2.5 rounded-lg flex items-start gap-2.5 transition-colors ${
                    isActive
                      ? 'bg-indigo-50/80 text-indigo-900 border border-indigo-200/80'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                      isActive ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-gray-400 font-mono font-medium">
                        {String(idx + 1).padStart(2, '0')}.
                      </span>
                      <span className={`text-xs font-semibold truncate ${isActive ? 'text-indigo-950 font-bold' : 'text-gray-900'}`}>
                        {sec.title}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 truncate mt-0.5 leading-snug">
                      {sec.summary}
                    </p>
                  </div>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content Area */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {activeSection ? (
            <article className="max-w-4xl space-y-6">
              {/* Header of Section */}
              <div className="pb-5 border-b border-gray-200 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold text-[11px]">
                      {activeSection.badge || 'Panduan'}
                    </span>
                    <span className="text-xs text-gray-400">· Dokumen Panduan Resmi Reneo CRM</span>
                  </div>

                  {activeSection.tabTarget && onNavigateToTab && (
                    <button
                      type="button"
                      onClick={() => onNavigateToTab(activeSection.tabTarget!.tab, activeSection.tabTarget!.section)}
                      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors"
                    >
                      <span>{activeSection.tabTarget.label}</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
                  {activeSection.title}
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                  {activeSection.summary}
                </p>
              </div>

              {/* Dynamic Body Content */}
              <div className="prose prose-slate max-w-none text-gray-800">
                {activeSection.content}
              </div>

              {/* Section Footer Navigation */}
              <div className="pt-6 border-t border-gray-200 flex items-center justify-between gap-3 text-xs">
                {(() => {
                  const currentIdx = sections.findIndex((s) => s.id === activeSection.id);
                  const prevSection = currentIdx > 0 ? sections[currentIdx - 1] : null;
                  const nextSection = currentIdx < sections.length - 1 ? sections[currentIdx + 1] : null;

                  return (
                    <>
                      {prevSection ? (
                        <button
                          type="button"
                          onClick={() => setActiveSectionId(prevSection.id)}
                          className="p-2 rounded-md border border-gray-200 hover:bg-white text-gray-700 font-medium inline-flex items-center gap-1.5 transition-colors"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          <span className="truncate max-w-[140px] sm:max-w-xs">{prevSection.title}</span>
                        </button>
                      ) : (
                        <div />
                      )}

                      {nextSection && (
                        <button
                          type="button"
                          onClick={() => setActiveSectionId(nextSection.id)}
                          className="p-2 rounded-md border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-900 font-semibold inline-flex items-center gap-1.5 transition-colors ml-auto"
                        >
                          <span className="truncate max-w-[140px] sm:max-w-xs">{nextSection.title}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            </article>
          ) : (
            <div className="p-8 text-center text-gray-500 text-sm">
              Topik tidak ditemukan. Silakan coba kata kunci lain.
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

function RocketIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

export default GuidePage;
