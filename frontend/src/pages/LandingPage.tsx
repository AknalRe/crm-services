import React from 'react';
import {
  MessageSquare,
  Send,
  Bot,
  Cake,
  BarChart3,
  ShieldCheck,
  ArrowRight,
  Zap,
  Users,
  CheckCircle2,
  Globe,
  Clock,
} from 'lucide-react';
import { ReneoCrmLogo } from '../components/ReneoCrmLogo';

interface LandingPageProps {
  initialized: boolean;
  onEnterLogin: () => void;
}

const CHANNELS = [
  {
    name: 'WhatsApp (WAHA Multi-Sesi)',
    badge: 'WAHA QR',
    badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    desc: 'Hubungkan beberapa nomor WhatsApp via QR, pantau centang dua & dibaca real-time, dengan jeda kirim anti-ban.',
  },
  {
    name: 'WhatsApp Business Cloud API',
    badge: 'Meta Cloud',
    badgeCls: 'bg-teal-50 text-teal-700 border-teal-200',
    desc: 'Integrasi resmi Meta Graph API menggunakan Phone Number ID dan login 1-klik OAuth tanpa gateway tambahan.',
  },
  {
    name: 'Instagram DM & Komentar',
    badge: 'Instagram',
    badgeCls: 'bg-pink-50 text-pink-700 border-pink-200',
    desc: 'Kelola pesan langsung dan balas komentar postingan Instagram pelanggan dari satu kotak masuk terpadu.',
  },
  {
    name: 'Facebook Messenger & Page',
    badge: 'Facebook',
    badgeCls: 'bg-blue-50 text-blue-700 border-blue-200',
    desc: 'Terima pesan Messenger halaman bisnis serta otomatisasi balasan komentar masuk secara instan.',
  },
  {
    name: 'Threads (Replies & Mentions)',
    badge: 'Threads',
    badgeCls: 'bg-gray-100 text-gray-800 border-gray-300',
    desc: 'Pantau sebutan dan balasan Threads pelanggan tanpa perlu berpindah-pindah aplikasi.',
  },
  {
    name: 'Telegram Bot',
    badge: 'Telegram',
    badgeCls: 'bg-sky-50 text-sky-700 border-sky-200',
    desc: 'Sambungkan bot Telegram untuk layanan pelanggan cepat langsung ke Live Chat CRM.',
  },
];

const FEATURES = [
  {
    icon: MessageSquare,
    title: 'Live Chat Omnichannel & SLA',
    desc: 'Filter percakapan berdasarkan status, channel, dan agent. Dilengkapi catatan internal, penawaran cepat katalog produk, serta target waktu respon pertama (SLA).',
  },
  {
    icon: Send,
    title: 'Siaran Terjadwal Multi-Channel',
    desc: 'Jalankan kampanye siaran ke segmen kontak dengan pengaturan jeda antar pesan, variabel personalisasi, dan pelacakan status pengiriman.',
  },
  {
    icon: Bot,
    title: 'Agent AI & Otomatisasi Kata Kunci',
    desc: 'Balas pertanyaan umum otomatis menggunakan Knowledge Base produk Anda, pesan selamat datang, dan auto-reply di luar jam operasional.',
  },
  {
    icon: Cake,
    title: 'Bot Ucapan Ulang Tahun Harian',
    desc: 'Kirim ucapan ulang tahun personal otomatis setiap pagi ke kontak melalui channel dan sesi pengiriman yang Anda pilih.',
  },
  {
    icon: BarChart3,
    title: 'Survei CSAT & Pelacakan Analitik',
    desc: 'Kirim tautan penilaian layanan pelanggan (/csat) otomatis saat tiket selesai, pantau rating kepuasan, dan alert eskalasi webhook.',
  },
  {
    icon: Users,
    title: 'Manajemen Tim & Hak Akses',
    desc: 'Tambahkan akun agent dengan pembatasan akses menu sesuai peran dan distribusi chat masuk otomatis (auto-assign).',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({ initialized, onEnterLogin }) => {
  return (
    <div className="min-h-screen bg-[#F5F6FA] text-gray-900 font-sans overflow-y-auto">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <ReneoCrmLogo className="w-8 h-8 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 leading-tight truncate">
                Reneo CRM
              </div>
              <div className="text-[11px] text-gray-500 leading-tight truncate">
                Omnichannel Suite
              </div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-gray-600">
            <a href="#kanal" className="hover:text-gray-900 transition-colors whitespace-nowrap">
              Kanal Terintegrasi
            </a>
            <a href="#fitur" className="hover:text-gray-900 transition-colors whitespace-nowrap">
              Fitur Utama
            </a>
            <a href="#otomatisasi" className="hover:text-gray-900 transition-colors whitespace-nowrap">
              Alur Kerja
            </a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onEnterLogin}
              className="h-9 px-4 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <span>{initialized ? 'Masuk ke CRM' : 'Setup Admin CRM'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-5">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-medium">
              <Globe className="w-3.5 h-3.5" />
              <span>Self-Hosted Omnichannel CRM</span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight leading-tight">
              Kelola WhatsApp, Instagram, Facebook, Threads &amp; Telegram dalam Satu Workspace
            </h1>

            <p className="text-sm sm:text-base text-gray-600 leading-relaxed max-w-2xl">
              Reneo CRM menyatukan Live Chat pelanggan, siaran terjadwal anti-ban, bot ulang tahun,
              Agent AI berbasis Knowledge Base, hingga pengukuran SLA &amp; CSAT langsung di server
              Anda sendiri.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onEnterLogin}
                className="h-10 px-5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <span>{initialized ? 'Masuk ke Workspace' : 'Mulai Setup Awal'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="#kanal"
                className="h-10 px-4 rounded-md bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                Lihat Kanal Didukung
              </a>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-3 border-t border-gray-100 max-w-lg">
              <div>
                <div className="text-base font-bold text-gray-900">6 Kanal</div>
                <div className="text-xs text-gray-500">WA, Cloud API, IG, FB, Threads, TG</div>
              </div>
              <div>
                <div className="text-base font-bold text-gray-900">Multi-Sesi</div>
                <div className="text-xs text-gray-500">Rotasi &amp; kontrol sesi WAHA</div>
              </div>
              <div>
                <div className="text-base font-bold text-gray-900">1-Klik OAuth</div>
                <div className="text-xs text-gray-500">Koneksi Meta &amp; Threads</div>
              </div>
            </div>
          </div>

          {/* Structured Live Preview Panel */}
          <div className="lg:col-span-5">
            <div className="bg-[#F5F6FA] border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-gray-200 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-indigo-600 text-white flex items-center justify-center">
                    <MessageSquare className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-semibold text-gray-800">Ringkasan Inbox CRM</span>
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
                    msg: 'Halo kak, apakah stok paket pro masih tersedia?',
                    time: 'Baru saja',
                  },
                  {
                    name: '@tokoresmi.id',
                    channel: 'Instagram',
                    channelCls: 'bg-pink-50 text-pink-700 border-pink-200',
                    msg: 'Balas komentar: Cek DM ya kak untuk katalog lengkap.',
                    time: '2m lalu',
                  },
                  {
                    name: 'Budi Santoso',
                    channel: 'WAHA',
                    channelCls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    msg: 'Terima kasih, pesanan sudah kami terima.',
                    time: '8m lalu',
                  },
                ].map((item) => (
                  <div
                    key={item.name}
                    className="bg-white border border-gray-200 rounded-md p-3 space-y-1.5"
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
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="bg-white border border-gray-200 rounded-md p-2.5 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] text-gray-500">Target SLA</div>
                    <div className="text-xs font-semibold text-gray-900">15 Menit</div>
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-md p-2.5 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] text-gray-500">Data Lokal</div>
                    <div className="text-xs font-semibold text-gray-900">PostgreSQL + Redis</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Channels */}
      <section id="kanal" className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold text-gray-900">Kanal Komunikasi Terintegrasi</h2>
          <p className="text-sm text-gray-600">
            Hubungkan seluruh akun bisnis Anda ke satu kotak masuk tanpa biaya per-pesan tambahan
            dari panel.
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
            <h2 className="text-xl font-bold text-gray-900">Fitur Operasional CRM</h2>
            <p className="text-sm text-gray-600">
              Dirancang untuk tim sales, customer service, dan operasional yang membutuhkan
              kecepatan dan kontrol penuh.
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

      {/* Workflow */}
      <section id="otomatisasi" className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-white border border-gray-200 rounded-lg p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600">
              <Zap className="w-3.5 h-3.5" />
              <span>Siap Digunakan di Server Anda</span>
            </div>
            <h2 className="text-lg font-bold text-gray-900">
              Akses Langsung dari Path Aplikasi yang Anda Konfigurasi
            </h2>
            <ul className="space-y-1 text-xs text-gray-600">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Mendukung akses subpath panel (/app/nama-aplikasi) maupun domain khusus.</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Tautan publik survei CSAT (/csat) &amp; Connect Link klien (/connect-channel).</span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={onEnterLogin}
            className="h-10 px-5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <span>{initialized ? 'Masuk ke CRM' : 'Setup Akun Admin'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
          <div>Reneo CRM Omnichannel Suite</div>
          <button
            type="button"
            onClick={onEnterLogin}
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            {initialized ? 'Masuk ke Dashboard CRM' : 'Setup Awal CRM'}
          </button>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
