import React from 'react';
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
} from 'lucide-react';
import { ReneoCrmLogo } from '../components/ReneoCrmLogo';

interface LandingPageProps {
  initialized: boolean;
  onEnterLogin: () => void;
}

const PAIN_SOLUTIONS = [
  {
    problem: 'Chat tercecer di banyak HP & browser',
    solution: 'Satu Inbox Omnichannel Terpadu',
    detail:
      'Semua pesan WhatsApp, Instagram DM/Komentar, Facebook, Threads, dan Telegram masuk ke satu antrean rapi lengkap dengan status Open, Pending, Selesai, dan penugasan agent.',
  },
  {
    problem: 'Follow-up lambat & lead lepas di luar jam kerja',
    solution: 'Agent AI + Auto-Reply 24/7',
    detail:
      'Agent AI menjawab pertanyaan produk berdasarkan Knowledge Base Anda secara otomatis, sementara aturan di luar jam kerja menjaga pelanggan tetap mendapat respons cepat.',
  },
  {
    problem: 'Broadcast manual rawan blokir & sulit dipantau',
    solution: 'Siaran Anti-Ban & Pelacakan Real-Time',
    detail:
      'Atur jeda antar pesan, gunakan multi-sesi WAHA atau WhatsApp Business Cloud API resmi, dan pantau status terkirim hingga dibaca (centang biru) secara langsung.',
  },
];

const CHANNELS = [
  {
    name: 'WhatsApp (WAHA Multi-Sesi)',
    badge: 'WAHA QR',
    badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    desc: 'Hubungkan beberapa nomor WhatsApp via scan QR, rotasi sesi pengiriman, dan pantau status centang dua/biru real-time.',
  },
  {
    name: 'WhatsApp Business Cloud API',
    badge: 'Meta Cloud',
    badgeCls: 'bg-teal-50 text-teal-700 border-teal-200',
    desc: 'Integrasi resmi Meta Graph API melalui Phone Number ID dan login 1-klik OAuth untuk skala pengiriman bisnis resmi.',
  },
  {
    name: 'Instagram DM & Komentar',
    badge: 'Instagram',
    badgeCls: 'bg-pink-50 text-pink-700 border-pink-200',
    desc: 'Balas DM dan komentar postingan dari satu tempat, plus otomatisasi kirim DM saat ada komentar kata kunci tertentu.',
  },
  {
    name: 'Facebook Messenger & Page',
    badge: 'Facebook',
    badgeCls: 'bg-blue-50 text-blue-700 border-blue-200',
    desc: 'Tangkap setiap pesan masuk halaman Facebook bisnis dan balas komentar postingan lebih cepat tanpa berpindah tab.',
  },
  {
    name: 'Threads (Replies & Mentions)',
    badge: 'Threads',
    badgeCls: 'bg-gray-100 text-gray-800 border-gray-300',
    desc: 'Pantau mention dan balasan Threads pelanggan langsung dari feed & inbox CRM agar tidak ada peluang interaksi terlewat.',
  },
  {
    name: 'Telegram Bot',
    badge: 'Telegram',
    badgeCls: 'bg-sky-50 text-sky-700 border-sky-200',
    desc: 'Sambungkan bot Telegram untuk layanan pelanggan instan yang langsung tercatat ke riwayat kontak CRM.',
  },
];

const FEATURES = [
  {
    icon: Tag,
    title: 'Quick Quote & Katalog Produk',
    desc: 'Sisipkan detail harga dan deskripsi produk dari katalog langsung ke ruang chat untuk mempercepat closing penjualan.',
  },
  {
    icon: Bot,
    title: 'Agent AI Berbasis Knowledge Base',
    desc: 'Latih AI dengan dokumen FAQ, daftar harga, dan SOP bisnis Anda agar jawaban tetap akurat dan relevan.',
  },
  {
    icon: Send,
    title: 'Siaran Terjadwal & Personalisasi',
    desc: 'Kirim kampanye promo atau pengingat tagihan ke segmen kontak dengan variabel nama otomatis dan jadwal teratur.',
  },
  {
    icon: Cake,
    title: 'Bot Ucapan Ulang Tahun Multi-Kanal',
    desc: 'Bangun loyalitas pelanggan dengan ucapan ulang tahun otomatis setiap pagi melalui channel dan sesi pilihan Anda.',
  },
  {
    icon: BarChart3,
    title: 'Survei CSAT & Monitoring SLA',
    desc: 'Kirim tautan penilaian (/csat) otomatis saat tiket selesai, pantau target waktu respon pertama, dan kirim alert webhook.',
  },
  {
    icon: Link2,
    title: 'Connect Link Klien Tanpa Login CRM',
    desc: 'Bagikan tautan aman sekali pakai agar klien bisa menautkan akun Instagram, Facebook, atau Threads mereka sendiri.',
  },
];

const STEPS = [
  {
    num: '01',
    title: 'Masuk atau Buat Akun Admin',
    desc: 'Buka workspace CRM melalui tombol Masuk di halaman ini untuk membuat atau masuk ke akun admin utama.',
  },
  {
    num: '02',
    title: 'Hubungkan Kanal Komunikasi',
    desc: 'Scan QR WhatsApp (WAHA), sambungkan WA Business Cloud API, atau hubungkan Instagram, Facebook, Threads & Telegram.',
  },
  {
    num: '03',
    title: 'Undang Tim & Aktifkan Otomatisasi',
    desc: 'Tambahkan akun agent CS/Sales, atur pembagian chat otomatis (auto-assign), dan aktifkan Agent AI serta template balasan.',
  },
];

const FAQS = [
  {
    q: 'Apakah bisa memakai WhatsApp QR dan WhatsApp Business Cloud API bersamaan?',
    a: 'Ya. Anda dapat menjalankan beberapa sesi WhatsApp QR (WAHA) sekaligus maupun menghubungkan nomor WhatsApp Business Cloud API resmi dari Meta di workspace yang sama.',
  },
  {
    q: 'Di mana data pelanggan dan riwayat chat disimpan?',
    a: 'Seluruh data kontak, percakapan, produk, dan media berjalan mandiri di server Anda sendiri (PostgreSQL & Redis), sehingga kontrol dan privasi data tetap berada di tangan Anda.',
  },
  {
    q: 'Apakah tim CS atau Sales bisa memakai akun masing-masing?',
    a: 'Bisa. Anda dapat membuat akun agent dengan pembatasan akses menu sesuai peran serta mengaktifkan fitur auto-assign agar chat masuk terbagi merata.',
  },
  {
    q: 'Bagaimana jika klien ingin menghubungkan akun Instagram/Facebook mereka tanpa akses admin?',
    a: 'Gunakan fitur Connect Link Klien (/connect-channel) di menu Integrasi Omnichannel. Klien cukup membuka tautan sekali pakai tersebut untuk menautkan akunnya.',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({ initialized, onEnterLogin }) => {
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
            <a href="#kanal" className="hover:text-gray-900 transition-colors whitespace-nowrap">
              Kanal
            </a>
            <a href="#fitur" className="hover:text-gray-900 transition-colors whitespace-nowrap">
              Fitur
            </a>
            <a href="#cara-mulai" className="hover:text-gray-900 transition-colors whitespace-nowrap">
              Cara Mulai
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
              <span>{initialized ? 'Masuk ke CRM' : 'Setup Admin CRM'}</span>
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
              <span>Omnichannel CRM · Self-Hosted di Server Anda</span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight leading-tight">
              Balas Semua Chat Pelanggan Lebih Cepat, Tutup Lebih Banyak Penjualan dari Satu Inbox
            </h1>

            <p className="text-sm sm:text-base text-gray-600 leading-relaxed max-w-2xl">
              Satukan WhatsApp (WAHA Multi-Sesi &amp; Business Cloud API), Instagram DM &amp; Komentar,
              Facebook Messenger, Threads, dan Telegram dalam satu workspace. Dilengkapi Agent AI,
              Quick Quote produk, siaran terjadwal, serta pelacakan SLA &amp; CSAT.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onEnterLogin}
                className="h-11 px-5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <span>{initialized ? 'Masuk ke Workspace CRM' : 'Mulai Setup CRM Sekarang'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="#solusi"
                className="h-11 px-4 rounded-md bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                Lihat Cara Kerja
              </a>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100 max-w-xl">
              <div>
                <div className="text-base font-bold text-gray-900">6 Kanal Aktif</div>
                <div className="text-xs text-gray-500">WA, Cloud API, IG, FB, Threads, TG</div>
              </div>
              <div>
                <div className="text-base font-bold text-gray-900">Multi-Agent</div>
                <div className="text-xs text-gray-500">Auto-assign &amp; kontrol hak akses</div>
              </div>
              <div>
                <div className="text-base font-bold text-gray-900">100% Data Lokal</div>
                <div className="text-xs text-gray-500">Database di server Anda sendiri</div>
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
                    <div className="text-xs font-semibold text-gray-900">Live Chat Omnichannel</div>
                    <div className="text-[11px] text-gray-500">Antrean Aktif Tim CS &amp; Sales</div>
                  </div>
                </div>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Real-Time
                </span>
              </div>

              <div className="space-y-2">
                {[
                  {
                    name: 'Siti Aminah',
                    channel: 'WA Cloud',
                    channelCls: 'bg-teal-50 text-teal-700 border-teal-200',
                    msg: 'Halo kak, mau order paket Pro 3 bulan. Bisa kirim invoice?',
                    status: 'Open · Agent: Rina',
                    time: 'Baru saja',
                  },
                  {
                    name: '@tokoresmi.id',
                    channel: 'Instagram',
                    channelCls: 'bg-pink-50 text-pink-700 border-pink-200',
                    msg: 'Auto-DM terkirim dari komentar: "Cek katalog lengkap di sini ya kak"',
                    status: 'Auto-Reply AI',
                    time: '2m lalu',
                  },
                  {
                    name: 'Budi Santoso',
                    channel: 'WAHA',
                    channelCls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    msg: 'Pembayaran sudah dikonfirmasi, terima kasih respon cepatnya!',
                    status: 'Selesai · CSAT 5/5',
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
                    <div className="text-[11px] text-gray-500">Target SLA Respon</div>
                    <div className="text-xs font-semibold text-gray-900">&lt; 15 Menit</div>
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-2.5 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] text-gray-500">Penyimpanan</div>
                    <div className="text-xs font-semibold text-gray-900">PostgreSQL + Redis</div>
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
            <span>Masalah yang Diselesaikan</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            Kenapa Tim CS &amp; Sales Beralih ke Reneo CRM?
          </h2>
          <p className="text-sm text-gray-600">
            Hentikan kebocoran lead akibat chat tidak terpantau, respon lambat, atau pergantian
            perangkat admin.
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
                <span>Siap pakai langsung di workspace</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Channels */}
      <section id="kanal" className="bg-white border-y border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-6">
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
                className="bg-[#F5F6FA] border border-gray-200 rounded-lg p-4 space-y-2.5"
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
        </div>
      </section>

      {/* Features */}
      <section id="fitur" className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Fitur Operasional &amp; Closing</span>
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
                className="bg-white border border-gray-200 rounded-lg p-4 space-y-2.5"
              >
                <div className="w-8 h-8 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center">
                  <Icon className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">{feat.title}</h3>
                <p className="text-xs text-gray-600 leading-relaxed">{feat.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Onboarding Steps */}
      <section id="cara-mulai" className="bg-white border-y border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-6">
          <div className="space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
              Mulai Beroperasi dalam 3 Langkah Sederhana
            </h2>
            <p className="text-sm text-gray-600">
              Instalasi sudah siap di server Anda—tinggal masuk dan hubungkan kanal bisnis Anda.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STEPS.map((step) => (
              <div
                key={step.num}
                className="bg-[#F5F6FA] border border-gray-200 rounded-lg p-5 space-y-2"
              >
                <div className="text-xs font-bold font-mono text-indigo-600">LANGKAH {step.num}</div>
                <h3 className="text-sm font-bold text-gray-900">{step.title}</h3>
                <p className="text-xs text-gray-600 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <div className="space-y-1.5">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Pertanyaan Umum</h2>
          <p className="text-sm text-gray-600">
            Informasi teknis dan operasional yang paling sering ditanyakan sebelum mulai.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FAQS.map((item) => (
            <div key={item.q} className="bg-white border border-gray-200 rounded-lg p-4 space-y-1.5">
              <h3 className="text-sm font-semibold text-gray-900">{item.q}</h3>
              <p className="text-xs text-gray-600 leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final Closing CTA */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-12">
        <div className="bg-[#0B2A57] text-white rounded-xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-start gap-4 max-w-2xl">
            <ReneoCrmLogo className="w-11 h-11 shrink-0" />
            <div className="space-y-1.5">
              <h2 className="text-lg sm:text-xl font-bold">
                Siap Mengelola Semua Chat &amp; Penjualan dari Satu Tempat?
              </h2>
              <p className="text-xs sm:text-sm text-blue-100 leading-relaxed">
                Masuk ke workspace Reneo CRM sekarang untuk menghubungkan WhatsApp, Instagram,
                Facebook, Threads, dan Telegram tim Anda.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onEnterLogin}
            className="h-11 px-6 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <span>{initialized ? 'Masuk ke Workspace' : 'Setup Admin Sekarang'}</span>
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
