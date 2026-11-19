import React, { useState } from 'react';
import {
  ArrowUpRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Layers,
  Maximize2,
  Menu,
  MessageSquare,
  Minus,
  Play,
  Radio,
  Server,
  ShieldCheck,
  Star,
  X,
} from 'lucide-react';
import { ReneoCrmLogo } from '../components/ReneoCrmLogo';

interface LandingPageProps {
  initialized: boolean;
  authenticated?: boolean;
  onEnterLogin: () => void;
}

const PANEL_URL = 'https://panel.reneo.my.id';
const PANEL_INSTALL_URL = 'https://panel.reneo.my.id/install';
const PANEL_ORDER_URL = 'https://panel.reneo.my.id/order?addon=reneo-crm';

const NAV_LINKS = [
  { href: '#modul', label: 'Modul' },
  { href: '#studi-kasus', label: 'Studi Kasus' },
  { href: '#kanal', label: 'Kanal' },
  { href: '#perbandingan', label: 'Perbandingan' },
  { href: '#faq', label: 'FAQ' },
];

const ARCHITECTURE_SPECS = [
  {
    label: '6+ Kanal Resmi & QR',
    detail: 'Multi-sesi WA, Grup @g.us, WA Cloud API, IG, FB, Threads, Telegram',
  },
  {
    label: 'RBAC 18+ Kontrol Izin',
    detail: 'Batasi akses menu, ekspor CSV, aksi balas & pengaturan per role',
  },
  {
    label: 'Sesi SLA & CSAT Akurat',
    detail: 'Batas Mulai/Selesai Sesi tanpa reset chat & filter Non-Penilaian',
  },
  {
    label: 'Self-Hosted PG + Redis',
    detail: 'Data persisten di server sendiri, nol biaya tambahan per pesan',
  },
];

const MODULE_TABS = [
  {
    id: 'inbox',
    num: '01',
    title: 'Kotak Masuk 6 Kanal & Multi-Sesi WA',
    summary:
      'Gabungkan pesan WhatsApp QR multi-nomor, WhatsApp Cloud API, Instagram DM & komentar, Facebook Messenger, Threads, dan Telegram di satu antrean kerja.',
    icon: MessageSquare,
    highlights: [
      'Pemisahan percakapan per nomor WA & push name sambil tetap tertaut pada 1 profil kontak.',
      'Kirim media (foto, video, audio, dokumen), balasan kutipan (quote reply), tombol interaktif, polling WA, dan Quick Quote produk.',
      'Dukungan penuh chat Grup WhatsApp (@g.us) beserta daftar partisipan dan resolusi @mention.',
    ],
    techNote: 'Sinkronisasi real-time SSE dengan status pesan terkirim/dibaca dan indikator mengetik.',
  },
  {
    id: 'rbac',
    num: '02',
    title: 'Role Multi-CS & Kontrol Non-Penilaian',
    summary:
      'Atur hak akses staf shift hingga supervisor tanpa membuka akses ekspor database kontak atau pengaturan WAHA.',
    icon: ShieldCheck,
    highlights: [
      'Builder role custom dengan 18+ izin menu hingga level tombol dan endpoint API.',
      'Grup WhatsApp otomatis berstatus Non-Penilaian agar tidak merusak skor SLA dan CSAT.',
      'Penandaan kontak internal/vendor sebagai Non-Penilaian permanen berlaku lintas sesi.',
    ],
    techNote: 'Autentikasi cookie HttpOnly terpisah per ruang kerja perusahaan.',
  },
  {
    id: 'sla',
    num: '03',
    title: 'Batas Sesi Tiket, SLA & CSAT Multi-Sesi',
    summary:
      'Catat siklus penanganan pelanggan dari awal sesi dibuka hingga tiket ditutup tanpa pernah menghapus riwayat percakapan terdahulu.',
    icon: Clock,
    highlights: [
      'Penanda visual Batas Mulai Sesi dan Batas Selesai Sesi otomatis di linimasa obrolan.',
      'Survei CSAT multi-kriteria (profil penilaian bisa dibedakan per kanal, label, atau sesi WA).',
      'Analitik klik-untuk-detail (drilldown) pada KPI dashboard untuk melompat ke segmen sesi terkait.',
    ],
    techNote: 'Pelacakan waktu respons pertama, kepatuhan SLA, dan rekam histori survei CSAT.',
  },
  {
    id: 'broadcast',
    num: '04',
    title: 'Siaran Anti-Ban & WhatsApp Story Terjadwal',
    summary:
      'Kelola kampanye siaran dan jadwal posting media sosial serta WhatsApp Status dari satu kalender kerja.',
    icon: Radio,
    highlights: [
      'Antrean siaran BullMQ dengan jeda natural antar pesan dan rotasi multi-sesi WA.',
      'Jadwalkan WhatsApp Story (teks, foto, video, audio) ke daftar kontak pilihan & cek penonton Story.',
      'Otomasi balasan komentar Instagram, Facebook, dan Threads sekaligus pembuka DM.',
    ],
    techNote: 'Worker antrean Redis menjalankan jeda kirim dan jadwal posting tanpa membebani proses chat.',
  },
  {
    id: 'ai',
    num: '05',
    title: 'Agent AI Multi-Model, Knowledge Book & MCP',
    summary:
      'Gunakan panduan produk Markdown agar AI menjawab pertanyaan dasar di luar jam kerja atau menyiapkan draf balasan CS.',
    icon: Bot,
    highlights: [
      'Mendukung OpenAI, Gemini, Anthropic, hingga model lokal Ollama tanpa kunci vendor.',
      'Knowledge Book terstruktur, skill kustom Markdown, dan failover otomatis antar penyedia model.',
      'Koneksi eksternal ke sistem katalog/ERP melalui Model Context Protocol (MCP) tools.',
    ],
    techNote: 'Bisa diatur membalas berdasarkan jam operasional, tag obrolan, atau eskalasi ke agen manusia.',
  },
];

const USE_CASE_ROWS = [
  {
    segment: 'Toko Online & Multi-Nomor WhatsApp',
    problem:
      'Pelanggan menghubungi Nomor Admin A dan Nomor Cabang B — chat tercampur jadi satu benang, atau nama kontak berubah-ubah saat push name baru masuk.',
    solution:
      'Percakapan dipisah per nomor WhatsApp dan kanal sosial dengan push name atau label khusus per kanal, namun tetap tertaut ke profil pelanggan tunggal beserta identitas lintas kanalnya.',
  },
  {
    segment: 'Tim Multi-CS dengan Kebutuhan Role Ketat',
    problem:
      'Semua akun staf punya akses yang sama — CS baru berisiko menghapus kontak, mengunduh seluruh database CSV, membuka chat agen lain, atau mengubah integrasi WAHA.',
    solution:
      'Buat Role custom dari checklist batasan menu, aksi, dan tombol (termasuk izin lihat semua chat, balas/kelola tiket, ekspor CSV, edit kontak, kirim siaran, hingga kelola pengaturan).',
  },
  {
    segment: 'Grup WhatsApp & Chat Internal Mengacaukan Laporan',
    problem:
      'Pesan dari grup WhatsApp operasional, kurir, vendor, atau bot ikut masuk perhitungan SLA keterlambatan balas dan memicu survei CSAT otomatis.',
    solution:
      'Grup WhatsApp (@g.us) masuk lengkap dengan daftar partisipan & otomatis berstatus Non-Penilaian. Kontak non-customer juga bisa ditandai Non-Penilaian permanen agar obrolan seterusnya tetap dikecualikan.',
  },
  {
    segment: 'Promosi WhatsApp Story & Jadwal Konten Harian',
    problem:
      'Admin lupa posting Story WA atau unggahan IG/FB/Threads saat jam promo, tidak bisa menyasar kontak WA tertentu, dan tidak tahu siapa saja yang menonton Story.',
    solution:
      'Jadwalkan postingan lintas kanal serta WhatsApp Story (teks, gambar, video, suara) ke daftar kontak terpilih, lengkap dengan sinkronisasi data penonton Story dari WhatsApp.',
  },
  {
    segment: 'Evaluasi SLA, CSAT Multi-Sesi & Analitik Terlalu Dangkal',
    problem:
      'Pelanggan bertanya berkali-kali di hari berbeda, tetapi riwayat chat tertimpa/terputus dan angka grafik dashboard tidak menjelaskan percakapan mana yang lambat dibalas.',
    solution:
      'Riwayat chat tetap utuh tanpa reset; setiap sesi mencatat Batas Mulai Sesi hingga Batas Selesai Sesi dan mengirim survei CSAT multi-kriteria baru dengan fitur drilldown langsung dari grafik dashboard.',
  },
  {
    segment: 'Komentar Iklan IG / FB / Threads & Pertanyaan Luar Jam Kerja',
    problem:
      'Komentar "harga?" di postingan iklan menumpuk tanpa DM balasan, sementara chat malam hari menunggu admin pagi hingga calon pembeli keburu pindah toko.',
    solution:
      'Balas komentar & kirim pembuka DM otomatis, jalankan auto-reply kata kunci/jam operasional, atau aktifkan Agent AI (OpenAI, Gemini, Anthropic, Ollama, Knowledge Book & MCP Tools).',
  },
];

const CHANNEL_ROWS = [
  {
    name: 'WhatsApp (Scan QR Multi-Sesi)',
    mode: 'Chat, Grup & Story',
    detail: 'Hubungkan banyak nomor WA sekaligus, sinkronkan kontak & grup WA, plus jadwalkan WhatsApp Story.',
  },
  {
    name: 'WhatsApp Bisnis Resmi',
    mode: 'Meta Cloud API',
    detail: 'Nomor resmi terverifikasi untuk komunikasi terstruktur, media interaktif, dan siaran bisnis.',
  },
  {
    name: 'Instagram',
    mode: 'DM, Feed & Komentar',
    detail: 'Balas DM, jadwalkan postingan feed, dan kirim DM otomatis ke komentar iklan dari satu layar.',
  },
  {
    name: 'Facebook Messenger',
    mode: 'Halaman & Komentar',
    detail: 'Kelola pesan masuk halaman bisnis, penjadwalan post Page, dan komentar tanpa pindah aplikasi.',
  },
  {
    name: 'Threads',
    mode: 'Post & Mentions',
    detail: 'Jadwalkan utas Threads serta pantau dan balas interaksi komentar akun usaha Anda.',
  },
  {
    name: 'Telegram',
    mode: 'Bot Bisnis & Channel',
    detail: 'Terima pertanyaan pelanggan lewat bot Telegram atau jadwalkan pengumuman ke channel.',
  },
];

const COMPARISON_ROWS = [
  {
    aspect: 'Semua chat WA, WA Bisnis, IG, FB, Threads & Telegram di 1 layar',
    manual: { ok: false, text: 'Harus buka banyak HP & aplikasi' },
    saas: { ok: true, text: 'Ada, umumnya dibatasi kuota kanal' },
    reneo: { ok: true, text: '6 kanal + multi-nomor WA terpisah per sesi' },
  },
  {
    aspect: 'Role CS Custom dengan batasan menu, aksi & tombol di UI/API',
    manual: { ok: false, text: 'Semua pegang HP akses penuh' },
    saas: { ok: true, text: 'Umumnya terkunci di paket Enterprise' },
    reneo: { ok: true, text: 'Termasuk builder Role & izin granular' },
  },
  {
    aspect: 'Pengecualian grup WA & kontak Non-Penilaian pada metrik SLA/CSAT',
    manual: { ok: false, text: 'Sulit dipilah di spreadsheet' },
    saas: { ok: false, text: 'Semua chat masuk rata dihitung laporan' },
    reneo: { ok: true, text: 'Otomatis untuk grup WA & melekat di kontak' },
  },
  {
    aspect: 'WhatsApp Story terjadwal + pilih target kontak + sinkron penonton',
    manual: { ok: false, text: 'Posting manual tiap hari dari HP' },
    saas: { ok: false, text: 'Tidak tersedia untuk WA Status/Story' },
    reneo: { ok: true, text: 'Terjadwal multi-format + daftar penonton' },
  },
  {
    aspect: 'Kepemilikan data pelanggan & biaya per pesan dari panel',
    manual: { ok: false, text: 'Chat hilang jika HP rusak / staf resign' },
    saas: { ok: false, text: 'Data di server vendor + biaya per pesan' },
    reneo: { ok: true, text: '100% di server sendiri, nol biaya pesan panel' },
  },
  {
    aspect: 'Analitik Drilldown klik-untuk-detail + Agent AI (Multi-Model & MCP)',
    manual: { ok: false, text: 'Tidak ada metrik SLA & AI' },
    saas: { ok: true, text: 'Biasanya add-on berbayar terpisah' },
    reneo: { ok: true, text: 'Bawaan langsung & fleksibel bawa API key sendiri' },
  },
];

const STEPS = [
  {
    num: '01',
    title: 'Pilih Hosting Siap Pakai atau Server Sendiri',
    desc: 'Beli paket Hosting + Reneo CRM dalam satu tagihan agar langsung aktif, atau pasang image Docker CRM ini di server Linux milik Anda sendiri.',
  },
  {
    num: '02',
    title: 'Setup Akun & Aktifkan Lisensi (Trial 7 Hari)',
    desc: 'Buka alamat CRM Anda, buat akun pemilik usaha pertama, lalu aktifkan Trial 7 Hari gratis atau pilih paket lisensi yang sesuai.',
  },
  {
    num: '03',
    title: 'Sambungkan Kanal, Sinkron Kontak & Atur Role CS',
    desc: 'Scan QR WhatsApp multi-nomor, sinkronkan kontak WhatsApp, hubungkan kanal sosial media, lalu buat Role & akun tim CS sesuai batas wewenangnya.',
  },
];

const FAQS = [
  {
    q: 'Apa itu Reneo CRM dan untuk siapa aplikasi ini dibuat?',
    a: 'Reneo CRM adalah aplikasi inbox pelanggan self-hosted untuk toko online, tim Customer Service multi-admin, dan usaha multi-cabang. Seluruh data kontak dan riwayat chat disimpan langsung di database PostgreSQL server Anda sendiri.',
  },
  {
    q: 'Apakah bisa memakai banyak nomor WhatsApp QR dan WhatsApp Bisnis Resmi bersamaan?',
    a: 'Bisa. Satu pelanggan yang mengirim pesan ke Nomor A dan Nomor B dipisahkan jendela percakapannya sesuai sesi dan push name masing-masing, tetapi tetap terhubung ke satu profil kontak CRM.',
  },
  {
    q: 'Bagaimana agar chat tim internal, kurir, atau grup WhatsApp tidak mengacaukan laporan SLA & CSAT?',
    a: 'Obrolan grup WhatsApp otomatis ditandai Non-Penilaian (dan partisipannya tetap terlihat di panel chat). Untuk kontak pribadi internal/vendor, cukup tandai Non-Penilaian sekali — sistem akan menerapkannya ke kontak tersebut serta seluruh percakapan berikutnya secara otomatis.',
  },
  {
    q: 'Apakah saya bisa membatasi staf CS agar hanya melihat chat miliknya dan tidak bisa menghapus/mengekspor data?',
    a: 'Bisa. Melalui menu Role & Batasan Akses, Anda dapat membuat role baru (seperti CS Shift, Supervisor, atau Konten) dan mencentang izin per menu hingga level tombol (balas chat, kirim CSAT, tambah/hapus kontak, ekspor CSV, atau pengaturan WAHA).',
  },
  {
    q: 'Apakah ada biaya tambahan per pesan saat mengirim broadcast, Story WA, atau membalas chat?',
    a: 'Tidak ada biaya tambahan per pesan dari panel Reneo. Nomor WhatsApp yang terhubung via scan QR (WAHA) tidak dikenakan biaya per percakapan Meta. Jika Anda memakai WhatsApp Cloud API resmi Meta, biaya mengikuti tarif langsung dari Meta Business.',
  },
  {
    q: 'Bagaimana mekanisme Batas Mulai Sesi, Batas Selesai Sesi, dan CSAT multi-sesi bekerja?',
    a: 'Riwayat chat tidak pernah direset agar audit mudah ditelusuri. Setiap siklus penanganan dimulai dengan penanda Batas Mulai Sesi hingga Batas Selesai Sesi dan membuat tiket survei CSAT tersendiri, lengkap dengan highlight segmen chat terkait.',
  },
  {
    q: 'Apakah data kontak dan riwayat chat tetap aman jika ada staf CS keluar?',
    a: 'Aman. Semua data kontak, identitas lintas kanal, dan riwayat percakapan tersimpan utuh di PostgreSQL pada server milik Anda sendiri. Anda cukup menonaktifkan atau mengganti role akun CS tersebut di Pengaturan.',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  initialized,
  authenticated = false,
  onEnterLogin,
}) => {
  const [activeModuleId, setActiveModuleId] = useState<string>(MODULE_TABS[0].id);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const currentHost =
    typeof window !== 'undefined' && window.location.host
      ? window.location.host
      : 'panel.reneo.my.id';
  const activeModule = MODULE_TABS.find((m) => m.id === activeModuleId) || MODULE_TABS[0];
  const ActiveIcon = activeModule.icon;

  return (
    <div className="min-h-screen supports-[height:100dvh]:min-h-dvh bg-[#f8fafc] text-slate-900 font-sans overflow-y-auto">
      {/* Sticky Compro Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <ReneoCrmLogo className="w-8 h-8 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 leading-tight truncate">
                Reneo CRM
              </div>
              <div className="text-[11px] font-mono text-slate-500 leading-tight truncate">
                {currentHost}
              </div>
            </div>
          </div>

          <nav aria-label="Navigasi Halaman" className="hidden md:flex items-center gap-5 text-xs font-medium text-slate-600">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="hover:text-slate-900 transition-colors whitespace-nowrap"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={onEnterLogin}
              className={`h-8 px-2.5 sm:px-3 rounded-lg text-xs font-medium inline-flex items-center transition-colors whitespace-nowrap cursor-pointer ${
                authenticated
                  ? 'bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold'
                  : 'border border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              {authenticated ? (
                <>
                  <span className="sm:hidden">Workspace</span>
                  <span className="hidden sm:inline">Buka Workspace CRM</span>
                </>
              ) : (
                <>
                  <span>{initialized ? 'Masuk' : 'Setup'}</span>
                  <span className="hidden sm:inline">&nbsp;CRM</span>
                </>
              )}
            </button>
            <a
              href={PANEL_ORDER_URL}
              target="_top"
              className="h-8 px-2.5 sm:px-3.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold inline-flex items-center transition-colors whitespace-nowrap"
            >
              <span className="sm:hidden">Beli Paket</span>
              <span className="hidden sm:inline">Beli Hosting + CRM</span>
            </a>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Menu navigasi"
              aria-expanded={mobileMenuOpen}
              className="md:hidden h-8 w-8 rounded-lg border border-slate-200 inline-flex items-center justify-center text-slate-600 hover:bg-slate-50"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        {mobileMenuOpen && (
          <nav aria-label="Menu Mobile" className="md:hidden border-t border-slate-200 bg-white px-4 py-3 flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 text-xs font-medium text-slate-700 hover:text-slate-900"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-2 mt-1 border-t border-slate-100 flex flex-col gap-2">
              <a
                href={PANEL_ORDER_URL}
                target="_top"
                className="h-9 px-3 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold inline-flex items-center justify-center"
              >
                Beli Hosting + CRM &amp; Lisensi
              </a>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onEnterLogin();
                }}
                className="h-9 px-3 rounded-lg border border-slate-200 text-slate-700 text-xs font-medium inline-flex items-center justify-center"
              >
                {authenticated
                  ? 'Buka Workspace CRM'
                  : initialized
                  ? 'Masuk ke Ruang Kerja CRM'
                  : 'Lanjutkan Setup CRM'}
              </button>
            </div>
          </nav>
        )}
      </header>

      <main>
        {/* Executive Compro Hero */}
        <section className="bg-white border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
              <div className="lg:col-span-6 space-y-5">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-mono font-medium text-slate-700">
                  <Server className="w-3.5 h-3.5 text-[#2563eb]" strokeWidth={1.75} />
                  <span>Self-Hosted CRM · PostgreSQL &amp; Redis</span>
                </div>

                <h1 className="text-2xl sm:text-4xl font-bold text-slate-900 tracking-tight leading-[1.18]">
                  Satu Kotak Masuk untuk Chat Pelanggan &amp; Pengaturan Tim CS
                </h1>

                <p className="text-sm sm:text-[15px] text-slate-600 leading-relaxed">
                  Kelola WhatsApp (Multi-Nomor QR, Grup WA, Story &amp; Bisnis Resmi),
                  komentar dan DM Instagram, Facebook, Threads, serta Telegram dari satu halaman.
                  Dilengkapi builder Role Multi-CS granular, filter Non-Penilaian, Batas Mulai &amp;
                  Selesai Sesi SLA/CSAT, siaran terjadwal, dan Agent AI (MCP).
                </p>

                <div className="space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5">
                    <a
                      href={PANEL_ORDER_URL}
                      target="_top"
                      className="min-h-[40px] py-2 px-5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 text-center transition-colors"
                    >
                      <span>Beli Hosting + CRM &amp; Lisensi</span>
                      <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
                    </a>
                    <a
                      href={PANEL_INSTALL_URL}
                      target="_top"
                      className="min-h-[40px] py-2 px-4 rounded-lg bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-sm font-semibold inline-flex items-center justify-center gap-2 text-center transition-colors"
                    >
                      Pasang di Server Sendiri
                    </a>
                  </div>
                  <div className="text-xs text-slate-500 leading-relaxed">
                    {authenticated ? (
                      <>
                        Sesi akun CRM Anda masih aktif.{' '}
                        <button
                          type="button"
                          onClick={onEnterLogin}
                          className="font-semibold text-[#2563eb] hover:underline cursor-pointer"
                        >
                          Kembali ke Workspace CRM
                        </button>
                        .
                      </>
                    ) : (
                      <>
                        Pilih paket <strong className="font-semibold text-slate-700">Hosting + Reneo CRM siap pakai</strong> (trial 7 hari) atau pasang di VPS Linux Anda. Sudah punya akun?{' '}
                        <button
                          type="button"
                          onClick={onEnterLogin}
                          className="font-semibold text-[#2563eb] hover:underline cursor-pointer"
                        >
                          {initialized ? 'Masuk ke CRM' : 'Lanjutkan Setup CRM'}
                        </button>
                        .
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Authentic Workstation Preview */}
              <div className="lg:col-span-6">
                <div className="border border-slate-300 rounded-xl bg-white overflow-hidden shadow-sm">
                  <div className="h-10 px-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <ReneoCrmLogo className="w-4 h-4 shrink-0" />
                      <span className="text-xs font-semibold text-slate-800 truncate">
                        Reneo CRM · Kotak Masuk
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-500 shrink-0">
                      <span className="w-6 h-6 inline-flex items-center justify-center rounded">
                        <Minus className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </span>
                      <span className="w-6 h-6 inline-flex items-center justify-center rounded">
                        <Maximize2 className="w-3 h-3" strokeWidth={1.75} />
                      </span>
                      <span className="w-6 h-6 inline-flex items-center justify-center rounded">
                        <X className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 text-xs">
                    <div className="sm:col-span-5 divide-y divide-slate-100 bg-slate-50/50">
                      <div className="px-3 py-2.5 bg-white">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900">Siti Aminah</span>
                          <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0">
                            WA Bisnis
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 truncate mt-1">
                          Mau pesan paket bundling 3 pcs, totalnya berapa kak?
                        </div>
                        <div className="text-[10px] text-[#1d4ed8] font-medium mt-1">
                          Ditangani: Rina (Sales)
                        </div>
                      </div>

                      <div className="px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800">@tokoresmi.id</span>
                          <span className="text-[10px] font-mono text-slate-700 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded shrink-0">
                            Instagram
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-1">
                          DM otomatis terkirim dari komentar postingan.
                        </div>
                      </div>

                      <div className="px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800">Grup Operasional</span>
                          <span className="text-[10px] font-mono text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded shrink-0">
                            Non-Nilai
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-1">
                          Dikecualikan otomatis dari laporan SLA &amp; CSAT.
                        </div>
                      </div>
                    </div>

                    <div className="sm:col-span-7 p-3.5 space-y-2.5 bg-white flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap border-b border-slate-100 pb-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900">Siti Aminah</div>
                            <div className="text-[11px] font-mono text-slate-500">+62 812-3456-7890</div>
                          </div>
                          <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded shrink-0">
                            Selesai
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 py-0.5">
                          <div className="flex-1 h-px bg-indigo-200" />
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-[9px] font-medium text-indigo-800">
                            <Play className="w-2 h-2 fill-indigo-600 text-indigo-600" />
                            <span>Batas Mulai Sesi #2 · 09.10</span>
                          </span>
                          <div className="flex-1 h-px bg-indigo-200" />
                        </div>

                        <div className="bg-slate-100 text-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] max-w-[92%]">
                          Halo kak, mau pesan paket bundling 3 pcs. Total harganya berapa?
                        </div>

                        <div className="bg-[#2563eb] text-white rounded-lg px-2.5 py-1.5 text-[11px] ml-auto max-w-[92%]">
                          Total 3 pcs Rp 245.000 ya kak. Berikut rincian penawarannya.
                        </div>

                        <div className="flex items-center gap-1.5 py-0.5">
                          <div className="flex-1 h-px bg-emerald-200" />
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[9px] font-medium text-emerald-800">
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                            <span>Batas Selesai Sesi #2</span>
                            <span className="inline-flex items-center gap-0.5 px-1 rounded bg-amber-100 text-amber-900 font-mono font-semibold">
                              <Star className="w-2 h-2 fill-amber-400 text-amber-500" />
                              5/5
                            </span>
                          </span>
                          <div className="flex-1 h-px bg-emerald-200" />
                        </div>
                      </div>

                      <div className="border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 flex items-center justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold text-slate-800">
                            Quick Quote · Katalog Produk
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">Paket Bundling (3 pcs)</div>
                        </div>
                        <span className="font-mono text-xs font-bold text-slate-900 shrink-0">Rp 245.000</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Architecture & Spec Metrics Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-slate-200 rounded-xl bg-slate-50/70 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 overflow-hidden">
              {ARCHITECTURE_SPECS.map((spec) => (
                <div key={spec.label} className="p-4 space-y-1">
                  <div className="text-xs font-bold text-slate-900">{spec.label}</div>
                  <p className="text-[11.5px] text-slate-600 leading-relaxed">{spec.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Interactive Module & Architecture Explorer */}
        <section id="modul" className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-14 space-y-5">
          <div className="space-y-1 max-w-2xl">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              Modul Kerja &amp; Arsitektur Sistem CRM
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              Lima bagian utama untuk pekerjaan harian admin CS dan tim promosi: balas chat, ukur SLA, batasi akses staf, siarkan promo, dan pasang AI.
            </p>
          </div>

          <div className="border border-slate-200 rounded-xl bg-white overflow-hidden grid grid-cols-1 lg:grid-cols-12">
            <div className="lg:col-span-5 divide-y divide-slate-200 border-b lg:border-b-0 lg:border-r border-slate-200">
              {MODULE_TABS.map((mod) => {
                const isActive = mod.id === activeModule.id;
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => setActiveModuleId(mod.id)}
                    className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors cursor-pointer ${
                      isActive ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className={`font-mono text-xs font-bold shrink-0 mt-0.5 ${
                        isActive ? 'text-[#2563eb]' : 'text-slate-400'
                      }`}
                    >
                      {mod.num}
                    </span>
                    <div className="min-w-0 space-y-0.5">
                      <div
                        className={`text-xs sm:text-sm font-semibold ${
                          isActive ? 'text-[#1d4ed8]' : 'text-slate-900'
                        }`}
                      >
                        {mod.title}
                      </div>
                      <div className="text-[11.5px] text-slate-500 line-clamp-2 leading-snug">
                        {mod.summary}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="lg:col-span-7 p-5 sm:p-6 flex flex-col justify-between gap-5 bg-white">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-[#2563eb] shrink-0">
                    <ActiveIcon className="w-4 h-4" strokeWidth={1.75} />
                  </div>
                  <div className="space-y-1">
                    <div className="font-mono text-[11px] font-semibold text-[#2563eb]">
                      MODUL {activeModule.num}
                    </div>
                    <h3 className="text-base font-bold text-slate-900">{activeModule.title}</h3>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {activeModule.summary}
                </p>

                <ul className="space-y-2.5 border-t border-slate-100 pt-3">
                  {activeModule.highlights.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-xs sm:text-[13px] text-slate-700 leading-relaxed">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" strokeWidth={2} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="px-3.5 py-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center gap-2.5 text-xs text-slate-600">
                <Layers className="w-4 h-4 text-slate-500 shrink-0" strokeWidth={1.75} />
                <span>{activeModule.techNote}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Studi Kasus */}
        <section id="studi-kasus" className="bg-white border-y border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-14 space-y-5">
            <div className="space-y-1 max-w-2xl">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                Masalah Harian Tim CS &amp; Cara Menanganinya
              </h2>
              <p className="text-xs sm:text-sm text-slate-600">
                Contoh kendala di toko online, tim shift CS, dan pengelola iklan media sosial beserta cara kerjanya di Reneo CRM.
              </p>
            </div>

            <div className="space-y-3 md:hidden">
              {USE_CASE_ROWS.map((row) => (
                <div
                  key={row.segment}
                  className="border border-slate-200 rounded-xl bg-white overflow-hidden divide-y divide-slate-200 text-xs"
                >
                  <div className="px-3.5 py-2.5 bg-slate-50 font-semibold text-slate-900">
                    {row.segment}
                  </div>
                  <div className="px-3.5 py-2.5 space-y-1">
                    <div className="text-[11px] font-semibold text-slate-500">Kendala</div>
                    <p className="text-slate-600 leading-relaxed">{row.problem}</p>
                  </div>
                  <div className="px-3.5 py-2.5 space-y-1 bg-blue-50/35">
                    <div className="text-[11px] font-semibold text-[#1d4ed8]">Penanganan di Reneo CRM</div>
                    <p className="text-slate-800 leading-relaxed">{row.solution}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block border border-slate-200 rounded-xl bg-white overflow-x-auto">
              <table className="w-full min-w-[680px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
                    <th className="py-2.5 px-4 w-[24%]">Jenis Usaha</th>
                    <th className="py-2.5 px-4 w-[38%]">Kendala Sebelum Memakai CRM</th>
                    <th className="py-2.5 px-4 w-[38%]">Penanganan di Reneo CRM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {USE_CASE_ROWS.map((row) => (
                    <tr key={row.segment} className="align-top">
                      <td className="py-3 px-4 font-semibold text-slate-900">{row.segment}</td>
                      <td className="py-3 px-4 text-slate-600 leading-relaxed">{row.problem}</td>
                      <td className="py-3 px-4 text-slate-800 leading-relaxed">{row.solution}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 6 Kanal Terhubung */}
        <section id="kanal" className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-14 space-y-5">
          <div className="space-y-1 max-w-2xl">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              6 Kanal Komunikasi dalam Satu Kotak Masuk
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              Hubungkan seluruh nomor WhatsApp dan akun media sosial usaha Anda tanpa biaya tambahan per pesan dari panel.
            </p>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-200 bg-white">
            {CHANNEL_ROWS.map((ch) => (
              <div
                key={ch.name}
                className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-4"
              >
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-xs sm:text-sm font-semibold text-slate-900">{ch.name}</span>
                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                    {ch.mode}
                  </span>
                </div>
                <p className="text-xs text-slate-600 sm:text-right">{ch.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Perbandingan */}
        <section id="perbandingan" className="bg-white border-y border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-14 space-y-5">
            <div className="space-y-1 max-w-2xl">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                Perbandingan: Cara Manual vs CRM Berlangganan vs Reneo CRM
              </h2>
              <p className="text-xs sm:text-sm text-slate-600">
                Perbandingan langsung dari sisi biaya operasional, keamanan data pelanggan, dan kendali tim.
              </p>
            </div>

            <div className="space-y-3 md:hidden">
              {COMPARISON_ROWS.map((row) => (
                <div
                  key={row.aspect}
                  className="border border-slate-200 rounded-xl bg-white overflow-hidden"
                >
                  <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-900">
                    {row.aspect}
                  </div>
                  <dl className="divide-y divide-slate-200 text-xs">
                    <div className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-3">
                      <dt className="text-slate-500 font-medium shrink-0">Manual (Banyak HP)</dt>
                      <dd className="flex items-start gap-1.5 sm:text-right text-slate-600">
                        {row.manual.ok ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" strokeWidth={2} />
                        ) : (
                          <X className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" strokeWidth={2} />
                        )}
                        <span>{row.manual.text}</span>
                      </dd>
                    </div>
                    <div className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-3">
                      <dt className="text-slate-500 font-medium shrink-0">CRM Cloud Lainnya</dt>
                      <dd className="flex items-start gap-1.5 sm:text-right text-slate-600">
                        {row.saas.ok ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" strokeWidth={2} />
                        ) : (
                          <X className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" strokeWidth={2} />
                        )}
                        <span>{row.saas.text}</span>
                      </dd>
                    </div>
                    <div className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-3 bg-blue-50/40">
                      <dt className="text-[#1d4ed8] font-semibold shrink-0">Reneo CRM</dt>
                      <dd className="flex items-start gap-1.5 sm:text-right font-medium text-slate-900">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" strokeWidth={2} />
                        <span>{row.reneo.text}</span>
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>

            <div className="hidden md:block border border-slate-200 rounded-xl bg-white overflow-x-auto">
              <table className="w-full min-w-[680px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
                    <th className="py-2.5 px-3.5 w-[31%]">Kebutuhan Usaha</th>
                    <th className="py-2.5 px-3.5 w-[23%]">Kelola Manual (Banyak HP)</th>
                    <th className="py-2.5 px-3.5 w-[23%]">CRM Cloud Lainnya</th>
                    <th className="py-2.5 px-3.5 w-[23%] bg-blue-50/70 text-[#1d4ed8] border-l border-blue-100">
                      Reneo CRM
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {COMPARISON_ROWS.map((row) => (
                    <tr key={row.aspect} className="align-top">
                      <td className="py-2.5 px-3.5 font-medium text-slate-900">{row.aspect}</td>
                      <td className="py-2.5 px-3.5 text-slate-600">
                        <div className="flex items-start gap-2">
                          {row.manual.ok ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" strokeWidth={2} />
                          ) : (
                            <X className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" strokeWidth={2} />
                          )}
                          <span>{row.manual.text}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-600">
                        <div className="flex items-start gap-2">
                          {row.saas.ok ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" strokeWidth={2} />
                          ) : (
                            <X className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" strokeWidth={2} />
                          )}
                          <span>{row.saas.text}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 bg-blue-50/35 border-l border-blue-100 text-slate-900 font-medium">
                        <div className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" strokeWidth={2} />
                          <span>{row.reneo.text}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 3 Langkah Aktivasi */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-14 space-y-5">
          <div className="space-y-1 max-w-2xl">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              Mulai Beroperasi dalam 3 Langkah
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              Dua jalur aktivasi — langsung terima beres dengan hosting Reneo atau pasang di server Linux sendiri.
            </p>
          </div>

          <ol className="grid grid-cols-1 md:grid-cols-3 border border-slate-200 rounded-xl bg-white divide-y md:divide-y-0 md:divide-x divide-slate-200 overflow-hidden">
            {STEPS.map((step) => (
              <li key={step.num} className="p-4 sm:p-5 space-y-1.5">
                <div className="font-mono text-xs font-bold text-[#2563eb]">LANGKAH {step.num}</div>
                <h3 className="text-sm font-semibold text-slate-900">{step.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{step.desc}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* FAQ using native semantic details/summary so all answers remain crawlable in DOM */}
        <section id="faq" className="bg-white border-y border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-14 space-y-5">
            <div className="space-y-1 max-w-2xl">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">Pertanyaan Umum</h2>
              <p className="text-xs sm:text-sm text-slate-600">
                Jawaban ringkas seputar fitur, lisensi, dan implementasi Reneo CRM.
              </p>
            </div>

            <div className="max-w-3xl border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden bg-white">
              {FAQS.map((item, idx) => (
                <details key={item.q} open={idx === 0} className="group">
                  <summary className="w-full px-4 py-3 text-left flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    <span className="text-xs sm:text-sm font-semibold text-slate-900">{item.q}</span>
                    <ChevronDown
                      className="w-4 h-4 text-slate-500 shrink-0 transition-transform group-open:rotate-180"
                      strokeWidth={1.75}
                    />
                  </summary>
                  <div className="px-4 pb-3.5 text-xs text-slate-600 leading-relaxed">
                    {item.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final Closing CTA */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <div className="bg-[#0B2A57] text-white rounded-xl p-6 sm:p-7 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex items-start gap-3.5 max-w-2xl">
              <ReneoCrmLogo className="w-10 h-10 shrink-0" />
              <div className="space-y-2.5">
                <h2 className="text-base sm:text-lg font-bold">
                  Siap Memindahkan Chat Pelanggan ke Server Sendiri?
                </h2>
                <p className="text-xs sm:text-sm text-blue-100 leading-relaxed">
                  Masuk ke ruang kerja CRM Anda atau kelola kontainer dan domain lewat{' '}
                  <a
                    href={PANEL_URL}
                    target="_top"
                    className="font-mono underline underline-offset-2 text-white hover:text-blue-200"
                  >
                    panel.reneo.my.id
                  </a>
                  .
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-blue-100">
                  <span>· Data tersimpan di server sendiri</span>
                  <span>· Tanpa biaya per pesan dari panel</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0 w-full lg:w-auto">
              <a
                href={PANEL_ORDER_URL}
                target="_top"
                className="min-h-[40px] py-2 px-4 sm:px-5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-semibold inline-flex items-center justify-center text-center transition-colors"
              >
                Beli Hosting + CRM &amp; Lisensi
              </a>
              <a
                href={PANEL_INSTALL_URL}
                target="_top"
                className="min-h-[40px] py-2 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/20 text-sm font-semibold inline-flex items-center justify-center text-center transition-colors"
              >
                Pasang di Server Sendiri
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
            <ReneoCrmLogo className="w-5 h-5 shrink-0" />
            <span>Reneo CRM</span>
            {currentHost !== 'panel.reneo.my.id' && (
              <>
                <span className="text-slate-300">·</span>
                <span className="font-mono text-slate-700">{currentHost}</span>
              </>
            )}
            <span className="text-slate-300">·</span>
            <a href={PANEL_URL} target="_top" className="font-mono hover:text-slate-800 transition-colors">
              panel.reneo.my.id
            </a>
            <span className="text-slate-300">·</span>
            <a href="./llms.txt" className="font-mono hover:text-slate-800 transition-colors">
              llms.txt
            </a>
          </div>
          <button
            type="button"
            onClick={onEnterLogin}
            className="text-[#2563eb] hover:text-[#1d4ed8] font-medium cursor-pointer"
          >
            {authenticated
              ? 'Buka Workspace CRM'
              : initialized
              ? 'Masuk ke Ruang Kerja CRM'
              : 'Setup Awal CRM'}
          </button>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
