import React, { useState } from 'react';
import {
  Send,
  Bot,
  Cake,
  BarChart3,
  ShieldCheck,
  ArrowRight,
  Users,
  CheckCircle2,
  Globe,
  Clock,
  Sparkles,
  Link2,
  Layers,
  Tag,
  AlertCircle,
  Briefcase,
  Check,
  X,
  ChevronDown,
} from 'lucide-react';
import { ReneoCrmLogo } from '../components/ReneoCrmLogo';

interface LandingPageProps {
  initialized: boolean;
  onEnterLogin: () => void;
}

const PAIN_SOLUTIONS = [
  {
    problem: 'Chat tercecer di banyak HP & admin',
    solution: 'Satu Layar untuk Semua Pesan Masuk',
    detail:
      'Semua pesan WhatsApp, Instagram, Facebook, Threads, dan Telegram berkumpul di satu kotak masuk. Pemilik usaha dan tim bisa memantau mana yang belum dibalas, sedang diproses, atau sudah selesai.',
  },
  {
    problem: 'Calon pembeli kabur karena lambat dibalas',
    solution: 'Asisten AI & Balasan Otomatis 24 Jam',
    detail:
      'Saat admin sedang istirahat atau di luar jam buka toko, asisten pintar langsung menjawab pertanyaan stok, harga, dan cara pesan berdasarkan informasi usaha Anda.',
  },
  {
    problem: 'Kirim promo massal sering bikin nomor terblokir',
    solution: 'Kirim Pesan Terjadwal dengan Jeda Aman',
    detail:
      'Atur jeda pengiriman antar pesan, pakai beberapa nomor pengirim atau WhatsApp Bisnis resmi, dan pantau langsung pesan yang sudah terkirim hingga dibaca pelanggan.',
  },
];

const USE_CASES = [
  {
    tag: 'Toko Online & Retail',
    title: 'Komentar "Harga Berapa?" di Instagram & Facebook Sering Terlewat',
    problem:
      'Saat postingan produk ramai komentar, admin kewalahan membalas satu per satu sehingga calon pembeli keburu beli di toko lain.',
    solution:
      'Reneo otomatis membalas komentar pelanggan sekaligus mengirim detail katalog ke DM mereka, lalu tim CS tinggal melanjutkan transaksi dari satu kotak masuk.',
  },
  {
    tag: 'Tim Sales & Customer Service',
    title: 'Chat Pelanggan Hilang Saat Admin Berganti atau HP Bermasalah',
    problem:
      'Memakai banyak HP berbeda membuat pemilik usaha sulit memantau pelayanan CS dan riwayat negosiasi sering terputus.',
    solution:
      'Hubungkan beberapa nomor WhatsApp (scan QR maupun WhatsApp Bisnis resmi) ke satu ruang kerja. Pesan masuk dibagi rata ke tim, dan seluruh riwayat tersimpan aman.',
  },
  {
    tag: 'Klinik, Jasa & Bisnis Berulang',
    title: 'Pelanggan Lama Lupa Kembali & Pertanyaan Malam Hari Tidak Terjawab',
    problem:
      'Tanpa pengingat rutin, pelanggan lama jarang melakukan pemesanan ulang, sementara admin tidak bisa berjaga 24 jam penuh.',
    solution:
      'Jadwalkan pesan promo berkala, aktifkan ucapan ulang tahun otomatis setiap pagi untuk menjaga kedekatan, serta biarkan Asisten AI menjawab FAQ dasar kapan saja.',
  },
];

const CHANNELS = [
  {
    name: 'WhatsApp (Multi-Nomor QR)',
    badge: 'Scan QR',
    badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    desc: 'Sambungkan beberapa nomor WhatsApp tim cukup lewat scan QR, lengkap dengan pemantauan status terkirim dan centang biru.',
  },
  {
    name: 'WhatsApp Bisnis Resmi (Meta)',
    badge: 'Resmi Meta',
    badgeCls: 'bg-teal-50 text-teal-700 border-teal-200',
    desc: 'Gunakan nomor WhatsApp Business resmi dari Meta dengan login 1-klik untuk pengiriman skala besar yang lebih stabil.',
  },
  {
    name: 'Instagram DM & Komentar',
    badge: 'Instagram',
    badgeCls: 'bg-pink-50 text-pink-700 border-pink-200',
    desc: 'Balas DM dan komentar postingan dari satu layar, serta kirim DM otomatis saat ada calon pembeli menanyakan produk di komentar.',
  },
  {
    name: 'Facebook Messenger & Halaman',
    badge: 'Facebook',
    badgeCls: 'bg-blue-50 text-blue-700 border-blue-200',
    desc: 'Terima semua pesan Messenger halaman bisnis dan balas komentar iklan atau postingan lebih cepat tanpa berpindah aplikasi.',
  },
  {
    name: 'Threads (Balasan & Sebutan)',
    badge: 'Threads',
    badgeCls: 'bg-gray-100 text-gray-800 border-gray-300',
    desc: 'Pantau dan balas sebutan atau komentar pelanggan di Threads langsung dari ruang kerja CRM agar peluang penjualan tetap terjaga.',
  },
  {
    name: 'Telegram',
    badge: 'Telegram',
    badgeCls: 'bg-sky-50 text-sky-700 border-sky-200',
    desc: 'Hubungkan akun bot Telegram layanan pelanggan Anda sehingga seluruh percakapan langsung tercatat bersama riwayat kontak.',
  },
];

const FEATURES = [
  {
    icon: Tag,
    title: 'Kirim Daftar Harga & Penawaran Cepat',
    desc: 'Simpan katalog produk Anda sekali, lalu sisipkan harga dan rincian paket ke ruang chat hanya dengan satu klik.',
  },
  {
    icon: Bot,
    title: 'Asisten AI Sesuai Info Usaha Anda',
    desc: 'Masukkan daftar harga, FAQ, dan aturan toko Anda agar AI dapat membantu menjawab pertanyaan pelanggan dengan tepat.',
  },
  {
    icon: Send,
    title: 'Siaran Promo Terjadwal & Personal',
    desc: 'Kirim pengumuman atau promo ke daftar pelanggan tertentu dengan sapaan nama otomatis dan jadwal kirim yang fleksibel.',
  },
  {
    icon: Cake,
    title: 'Ucapan Ulang Tahun Otomatis',
    desc: 'Kirim ucapan ulang tahun dan voucher khusus setiap pagi ke pelanggan melalui WhatsApp maupun kanal sosial media.',
  },
  {
    icon: BarChart3,
    title: 'Penilaian Kepuasan & Kecepatan Balas',
    desc: 'Kirim tautan survei singkat saat layanan selesai dan pantau apakah tim Anda membalas sesuai target waktu yang ditentukan.',
  },
  {
    icon: Link2,
    title: 'Tautan Sambung Akun untuk Klien',
    desc: 'Bagikan tautan khusus sekali pakai jika Anda mengelola akun sosial media milik klien, tanpa perlu memberi akses masuk admin.',
  },
];

const STEPS = [
  {
    num: '01',
    title: 'Masuk atau Buat Akun Pemilik',
    desc: 'Klik tombol Masuk di halaman ini untuk membuat akun utama usaha Anda dalam hitungan detik.',
  },
  {
    num: '02',
    title: 'Sambungkan WhatsApp & Media Sosial',
    desc: 'Scan QR WhatsApp atau hubungkan WhatsApp Bisnis Resmi, Instagram, Facebook, Threads, dan Telegram Anda.',
  },
  {
    num: '03',
    title: 'Ajak Tim CS & Mulai Layani Pelanggan',
    desc: 'Tambahkan akun untuk staf CS atau Sales, atur pembagian chat otomatis, dan aktifkan asisten balasan cepat.',
  },
];

const COMPARISON_ROWS = [
  {
    aspect: 'Semua chat WA, IG, FB, Threads & Telegram di 1 layar',
    manual: { ok: false, text: 'Harus buka banyak HP & aplikasi' },
    saas: { ok: true, text: 'Ada, tapi sering dibatasi paket' },
    reneo: { ok: true, text: 'Lengkap 6 kanal langsung di 1 layar' },
  },
  {
    aspect: 'Biaya tambahan per pesan & per nomor dari panel',
    manual: { ok: true, text: 'Gratis, tapi rawan chat terlewat' },
    saas: { ok: false, text: 'Kena biaya langganan / per pesan' },
    reneo: { ok: true, text: 'Tanpa biaya tambahan per pesan di panel' },
  },
  {
    aspect: 'Kepemilikan data pelanggan & riwayat chat',
    manual: { ok: false, text: 'Hilang jika HP rusak atau CS resign' },
    saas: { ok: false, text: 'Tersimpan di server pihak ketiga' },
    reneo: { ok: true, text: '100% tersimpan di server Anda sendiri' },
  },
  {
    aspect: 'Gabung WhatsApp biasa (Scan QR) + WA Bisnis Resmi',
    manual: { ok: false, text: 'Tidak terpusat' },
    saas: { ok: false, text: 'Umumnya wajib WA Resmi saja' },
    reneo: { ok: true, text: 'Bisa pakai keduanya sekaligus' },
  },
  {
    aspect: 'Asisten AI & balas otomatis komentar IG/FB/Threads',
    manual: { ok: false, text: 'Balas manual satu per satu' },
    saas: { ok: true, text: 'Biasanya fitur berbayar terpisah' },
    reneo: { ok: true, text: 'Sudah termasuk & bisa diatur per kanal' },
  },
  {
    aspect: 'Pembagian chat ke tim CS & pantau kecepatan balas',
    manual: { ok: false, text: 'Sulit dipantau, rawan rebutan chat' },
    saas: { ok: true, text: 'Tersedia di paket menengah/atas' },
    reneo: { ok: true, text: 'Pembagian otomatis, peran CS & laporan' },
  },
];

const FAQS = [
  {
    q: 'Apakah bisa memakai WhatsApp biasa (QR) dan WhatsApp Bisnis Resmi bersamaan?',
    a: 'Bisa. Anda bebas menggabungkan beberapa nomor WhatsApp lewat scan QR sekaligus menyambungkan nomor WhatsApp Bisnis resmi dari Meta di satu tempat.',
  },
  {
    q: 'Apakah data kontak dan riwayat chat pelanggan aman?',
    a: 'Aman. Seluruh data pelanggan, katalog produk, dan percakapan tersimpan langsung di server milik Anda sendiri, tidak bercampur dengan pengguna lain.',
  },
  {
    q: 'Apakah staf CS atau Sales bisa punya akun login masing-masing?',
    a: 'Bisa. Anda dapat membuatkan akun terpisah untuk setiap staf, membatasi menu apa saja yang boleh dibuka, dan membagi chat masuk secara otomatis.',
  },
  {
    q: 'Apakah sulit menghubungkan Instagram, Facebook, dan Threads?',
    a: 'Tidak. Tersedia tombol login 1-klik maupun tautan sambung khusus agar proses menghubungkan akun media sosial berjalan cepat dan praktis.',
  },
  {
    q: 'Apakah perlu keahlian IT khusus untuk mengoperasikannya sehari-hari?',
    a: 'Tidak perlu. Tampilan ruang kerja dibuat seperti aplikasi chat harian sehingga pemilik usaha maupun admin CS baru bisa langsung memakainya dalam hitungan menit.',
  },
  {
    q: 'Bagaimana jika tim CS kami bertambah atau ganti karyawan?',
    a: 'Anda tinggal membuat akun staf baru atau menonaktifkan akun lama dari menu Pengaturan. Seluruh kontak dan riwayat chat pelanggan tetap aman tersimpan di server Anda.',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({ initialized, onEnterLogin }) => {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  return (
    <div className="min-h-screen bg-[#F5F6FA] text-gray-900 font-sans overflow-y-auto">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <ReneoCrmLogo className="w-9 h-9 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-bold text-gray-900 leading-tight truncate">
                Reneo CRM
              </div>
              <div className="text-[11px] text-gray-500 leading-tight truncate">
                Omnichannel Suite
              </div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-gray-600">
            <a href="#solusi" className="hover:text-gray-900 transition-colors whitespace-nowrap">
              Solusi
            </a>
            <a href="#studi-kasus" className="hover:text-gray-900 transition-colors whitespace-nowrap">
              Studi Kasus
            </a>
            <a href="#kanal" className="hover:text-gray-900 transition-colors whitespace-nowrap">
              Kanal
            </a>
            <a href="#fitur" className="hover:text-gray-900 transition-colors whitespace-nowrap">
              Fitur
            </a>
            <a href="#perbandingan" className="hover:text-gray-900 transition-colors whitespace-nowrap">
              Perbandingan
            </a>
            <a href="#faq" className="hover:text-gray-900 transition-colors whitespace-nowrap">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onEnterLogin}
              className="h-9 px-4 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <span>{initialized ? 'Masuk ke CRM' : 'Mulai Setup CRM'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
              <Globe className="w-3.5 h-3.5 text-emerald-600" />
              <span>Satu Pusat Chat Bisnis · Data Tersimpan di Server Anda</span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight leading-tight">
              Balas Semua Chat Pelanggan Lebih Cepat, Tutup Lebih Banyak Penjualan dari Satu Layar
            </h1>

            <p className="text-sm sm:text-base text-gray-600 leading-relaxed max-w-2xl">
              Kumpulkan pesan WhatsApp (Multi-Nomor QR &amp; Bisnis Resmi), komentar &amp; DM
              Instagram, Facebook, Threads, serta Telegram dalam satu kotak masuk. Dibantu Asisten
              AI, kirim penawaran harga cepat, dan siaran promo terjadwal.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onEnterLogin}
                className="h-11 px-5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <span>{initialized ? 'Masuk ke Ruang Kerja CRM' : 'Mulai Setup CRM Sekarang'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="#studi-kasus"
                className="h-11 px-4 rounded-md bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                Lihat Contoh Kasus
              </a>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100 max-w-xl">
              <div>
                <div className="text-base font-bold text-gray-900">6 Kanal Pesan</div>
                <div className="text-xs text-gray-500">WA, WA Bisnis, IG, FB, Threads, TG</div>
              </div>
              <div>
                <div className="text-base font-bold text-gray-900">Banyak Staf CS</div>
                <div className="text-xs text-gray-500">Bagi chat otomatis &amp; terpantau</div>
              </div>
              <div>
                <div className="text-base font-bold text-gray-900">Milik Pribadi</div>
                <div className="text-xs text-gray-500">Data aman di server usaha Anda</div>
              </div>
            </div>
          </div>

          {/* Structured Workspace Preview */}
          <div className="lg:col-span-5">
            <div className="bg-[#F5F6FA] border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                <div className="flex items-center gap-2.5">
                  <ReneoCrmLogo className="w-7 h-7 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-gray-900">Kotak Masuk Pelanggan</div>
                    <div className="text-[11px] text-gray-500">Pantauan Aktif Tim CS &amp; Sales</div>
                  </div>
                </div>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Langsung
                </span>
              </div>

              <div className="space-y-2">
                {[
                  {
                    name: 'Siti Aminah',
                    channel: 'WA Bisnis',
                    channelCls: 'bg-teal-50 text-teal-700 border-teal-200',
                    msg: 'Halo kak, mau pesan paket bundling 3 pcs. Bisa kirim total harganya?',
                    status: 'Ditangani oleh: Rina (Sales)',
                    time: 'Baru saja',
                  },
                  {
                    name: '@tokoresmi.id',
                    channel: 'Instagram',
                    channelCls: 'bg-pink-50 text-pink-700 border-pink-200',
                    msg: 'Balasan otomatis terkirim ke DM dari komentar postingan terbaru.',
                    status: 'Dibalas Asisten AI',
                    time: '2m lalu',
                  },
                  {
                    name: 'Budi Santoso',
                    channel: 'WhatsApp',
                    channelCls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    msg: 'Terima kasih kak, pesanan sudah sampai dengan baik!',
                    status: 'Selesai · Penilaian Puas (5/5)',
                    time: '8m lalu',
                  },
                ].map((item) => (
                  <div
                    key={item.name}
                    className="bg-white border border-gray-200 rounded-lg p-3 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-semibold text-gray-900 truncate">
                          {item.name}
                        </span>
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded border whitespace-nowrap ${item.channelCls}`}
                        >
                          {item.channel}
                        </span>
                      </div>
                      <span className="text-[11px] text-gray-400 whitespace-nowrap">{item.time}</span>
                    </div>
                    <p className="text-xs text-gray-600 truncate">{item.msg}</p>
                    <div className="text-[10px] font-medium text-indigo-600">{item.status}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="bg-white border border-gray-200 rounded-lg p-2.5 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] text-gray-500">Target Kecepatan Balas</div>
                    <div className="text-xs font-semibold text-gray-900">Di Bawah 15 Menit</div>
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-2.5 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] text-gray-500">Keamanan Data</div>
                    <div className="text-xs font-semibold text-gray-900">Database Pribadi</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pain vs Solution */}
      <section id="solusi" className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <div className="space-y-1.5 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600">
            <Layers className="w-3.5 h-3.5" />
            <span>Masalah Sehari-hari &amp; Solusinya</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            Kenapa Pemilik Usaha &amp; Tim CS Memilih Reneo CRM?
          </h2>
          <p className="text-sm text-gray-600">
            Hentikan kehilangan calon pembeli akibat chat tidak terpantau, balasan lambat, atau
            pergantian HP admin.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PAIN_SOLUTIONS.map((item) => (
            <div
              key={item.solution}
              className="bg-white border border-gray-200 rounded-lg p-5 space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2.5">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{item.problem}</span>
                </div>
                <h3 className="text-sm font-bold text-gray-900">{item.solution}</h3>
                <p className="text-xs text-gray-600 leading-relaxed">{item.detail}</p>
              </div>
              <div className="pt-2 border-t border-gray-100 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Langsung tersedia di ruang kerja</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Real Business Use Cases */}
      <section id="studi-kasus" className="bg-white border-y border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-6">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600">
              <Briefcase className="w-3.5 h-3.5" />
              <span>Contoh Kasus &amp; Penerapan Nyata</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
              Bagaimana Reneo CRM Membantu Bisnis Anda Closing Lebih Cepat
            </h2>
            <p className="text-sm text-gray-600">
              Lihat bagaimana alur kerja Reneo menyelesaikan kendala nyata di lapangan.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {USE_CASES.map((uc) => (
              <div
                key={uc.title}
                className="bg-[#F5F6FA] border border-gray-200 rounded-lg p-5 space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-2.5">
                  <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {uc.tag}
                  </span>
                  <h3 className="text-sm font-bold text-gray-900 leading-snug">{uc.title}</h3>
                  <div className="bg-white border border-gray-200 rounded-md p-2.5 space-y-1">
                    <div className="text-[11px] font-semibold text-gray-500 uppercase">Kondisi</div>
                    <p className="text-xs text-gray-600 leading-relaxed">{uc.problem}</p>
                  </div>
                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-md p-2.5 space-y-1">
                    <div className="text-[11px] font-semibold text-emerald-800 uppercase">
                      Solusi di Reneo CRM
                    </div>
                    <p className="text-xs text-emerald-950 leading-relaxed">{uc.solution}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Channels */}
      <section id="kanal" className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <div className="space-y-1.5">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            6 Kanal Komunikasi dalam Satu Kotak Masuk
          </h2>
          <p className="text-sm text-gray-600">
            Hubungkan seluruh akun bisnis Anda tanpa biaya tambahan per-pesan dari sisi panel.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CHANNELS.map((ch) => (
            <div
              key={ch.name}
              className="bg-white border border-gray-200 rounded-lg p-4 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900">{ch.name}</h3>
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded border whitespace-nowrap ${ch.badgeCls}`}
                >
                  {ch.badge}
                </span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">{ch.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="fitur" className="bg-white border-y border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Fitur Operasional &amp; Penjualan</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
              Alat Kerja Lengkap dari Chat Masuk Hingga Transaksi Selesai
            </h2>
            <p className="text-sm text-gray-600">
              Dirancang agar tim CS dan Sales bekerja lebih cepat tanpa perlu berpindah aplikasi.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((feat) => {
              const Icon = feat.icon;
              return (
                <div
                  key={feat.title}
                  className="bg-[#F5F6FA] border border-gray-200 rounded-lg p-4 space-y-2.5"
                >
                  <div className="w-8 h-8 rounded-md bg-white border border-gray-200 text-indigo-600 flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900">{feat.title}</h3>
                  <p className="text-xs text-gray-600 leading-relaxed">{feat.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Onboarding Steps */}
      <section id="cara-mulai" className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <div className="space-y-1.5">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            Mulai Beroperasi dalam 3 Langkah Mudah
          </h2>
          <p className="text-sm text-gray-600">
            Aplikasi sudah terpasang di server Anda—tinggal masuk dan sambungkan kanal bisnis Anda.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STEPS.map((step) => (
            <div
              key={step.num}
              className="bg-white border border-gray-200 rounded-lg p-5 space-y-2"
            >
              <div className="text-xs font-bold font-mono text-indigo-600">LANGKAH {step.num}</div>
              <h3 className="text-sm font-bold text-gray-900">{step.title}</h3>
              <p className="text-xs text-gray-600 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section id="perbandingan" className="bg-white border-t border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-6">
          <div className="space-y-1.5 max-w-2xl">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
              Perbandingan: Cara Manual vs CRM Berlangganan vs Reneo CRM
            </h2>
            <p className="text-sm text-gray-600">
              Lihat perbedaan nyata dari sisi biaya operasional, keamanan data pelanggan, dan kenyamanan tim CS.
            </p>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
            <table className="w-full text-left border-collapse min-w-[680px]">
              <thead>
                <tr className="bg-[#F5F6FA] border-b border-gray-200 text-xs font-semibold text-gray-700">
                  <th className="py-3.5 px-4 w-[31%]">Kebutuhan Bisnis</th>
                  <th className="py-3.5 px-4 w-[23%]">Kelola Manual (Banyak HP)</th>
                  <th className="py-3.5 px-4 w-[23%]">CRM Cloud Lainnya</th>
                  <th className="py-3.5 px-4 w-[23%] bg-indigo-50/80 text-indigo-900 border-l border-indigo-100">
                    Reneo CRM
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-xs">
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.aspect} className="hover:bg-gray-50/70">
                    <td className="py-3.5 px-4 font-medium text-gray-900">{row.aspect}</td>
                    <td className="py-3.5 px-4 text-gray-600">
                      <div className="flex items-start gap-2">
                        {row.manual.ok ? (
                          <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <X className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        )}
                        <span>{row.manual.text}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-gray-600">
                      <div className="flex items-start gap-2">
                        {row.saas.ok ? (
                          <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <X className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        )}
                        <span>{row.saas.text}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 bg-indigo-50/40 border-l border-indigo-100 text-gray-900 font-medium">
                      <div className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
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

      {/* FAQ */}
      <section id="faq" className="bg-[#F5F6FA] border-t border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-6">
          <div className="space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Pertanyaan Umum</h2>
            <p className="text-sm text-gray-600">
              Jawaban singkat untuk hal-hal yang paling sering ditanyakan sebelum mulai memakai Reneo CRM.
            </p>
          </div>

          <div className="space-y-2.5">
            {FAQS.map((item, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={item.q}
                  className="bg-white border border-gray-200 rounded-lg overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                    className="w-full px-4 py-3.5 text-left flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-sm font-semibold text-gray-900">{item.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 text-xs text-gray-600 leading-relaxed border-t border-gray-100">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final Closing CTA */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-[#0B2A57] text-white rounded-xl p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-start gap-4 max-w-2xl">
            <ReneoCrmLogo className="w-11 h-11 shrink-0" />
            <div className="space-y-3">
              <div className="space-y-1.5">
                <h2 className="text-lg sm:text-xl font-bold">
                  Siap Merapikan Semua Chat &amp; Meningkatkan Closing Tim Anda?
                </h2>
                <p className="text-xs sm:text-sm text-blue-100 leading-relaxed">
                  Masuk ke ruang kerja Reneo CRM sekarang untuk menghubungkan WhatsApp, Instagram,
                  Facebook, Threads, dan Telegram usaha Anda dalam hitungan menit.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-emerald-200 font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  Tanpa biaya per pesan di panel
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  Data aman di server sendiri
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  Langsung siap dipakai tim
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onEnterLogin}
            className="h-11 px-6 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <span>{initialized ? 'Masuk ke Ruang Kerja' : 'Mulai Setup Sekarang'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <ReneoCrmLogo className="w-5 h-5 shrink-0" />
            <span>Reneo CRM Omnichannel Suite</span>
          </div>
          <button
            type="button"
            onClick={onEnterLogin}
            className="text-indigo-600 hover:text-indigo-700 font-medium inline-flex items-center gap-1"
          >
            <Users className="w-3.5 h-3.5" />
            <span>{initialized ? 'Masuk ke Dashboard CRM' : 'Setup Awal CRM'}</span>
          </button>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
