import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Inbox,
  Menu,
  MessageSquare,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import { ReneoCrmLogo } from '../components/ReneoCrmLogo';
import { api } from '../services/api';
import type { LicensePlan } from '../types';

interface LandingPageProps {
  initialized: boolean;
  authenticated?: boolean;
  onEnterLogin: () => void;
  onEnterRegister?: () => void;
  onOpenGuide?: () => void;
}

const PANEL_URL = 'https://panel.reneo.my.id';
const PANEL_INSTALL_URL = 'https://panel.reneo.my.id/install';

const NAV_LINKS = [
  { href: '#fitur', label: 'Fitur' },
  { href: '#kanal', label: 'Kanal' },
  { href: '#paket', label: 'Paket & Harga' },
  { href: '#perbandingan', label: 'Perbandingan' },
  { href: '#faq', label: 'FAQ' },
  { href: '/panduan', label: 'Buku Panduan' },
];

const HERO_CHANNEL_PREVIEWS = [
  {
    id: 'instagram',
    label: 'Instagram',
    dotClass: 'bg-pink-500',
    customerName: '@nadia.beautystore',
    customerSub: 'DM dari Komentar Reels Promo',
    statusLabel: 'Ditangani Rina',
    time: '09:14',
    incoming: 'Kak, paket skincare di video tadi masih promo gratis ongkir hari ini?',
    outgoing: 'Masih berlaku sampai jam 21.00 ya Kak Nadia. Mau dibantu pilih varian yang cocok?',
    crmOwner: 'Rina · Shift Pagi',
    crmFollowUp: 'Follow-up pilih varian',
    crmHistory: 'Pelanggan baru · iklan Reels',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    dotClass: 'bg-emerald-500',
    customerName: 'Siti Aminah',
    customerSub: 'WhatsApp Cabang Pusat · Sesi #2',
    statusLabel: 'Rating 5/5',
    time: '09:11',
    incoming: 'Halo kak, mau repeat order paket bundling 3 pcs seperti bulan lalu ya.',
    outgoing: 'Siap Kak Siti, alamat dan pesanan sebelumnya sudah tercatat. Total Rp 245.000.',
    crmOwner: 'Dimas · Shift Siang',
    crmFollowUp: 'Kirim resi hari ini',
    crmHistory: '3x transaksi · alamat tersimpan',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    dotClass: 'bg-blue-500',
    customerName: 'Budi Santoso',
    customerSub: 'Messenger · Halaman Toko',
    statusLabel: 'Respon 1 mnt',
    time: '09:08',
    incoming: 'Min, kalau kirim ke Surabaya hari ini estimasi sampai kapan?',
    outgoing: 'Transfer sebelum jam 15.00 ikut pengiriman hari ini Pak Budi, estimasi 1–2 hari.',
    crmOwner: 'Rina · Shift Pagi',
    crmFollowUp: 'Cek konfirmasi transfer',
    crmHistory: 'Tanya ongkir · prospek hangat',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    dotClass: 'bg-sky-400',
    customerName: 'Reseller Malang',
    customerSub: 'Telegram · Mitra Grosir',
    statusLabel: 'Prioritas',
    time: '09:02',
    incoming: 'Kak, stok katalog grosir minggu ini sudah diperbarui?',
    outgoing: 'Sudah siap Kak, daftar harga grosir terbaru langsung saya kirimkan.',
    crmOwner: 'Ayu · Tim Grosir',
    crmFollowUp: 'Jadwal restock Jumat',
    crmHistory: 'Mitra aktif · 12 pesanan',
  },
];

const OPERATIONAL_GAPS = [
  {
    index: '01',
    title: 'Pesan menumpuk di HP terpisah',
    detail:
      'Calon pembeli di Instagram, WhatsApp, dan Facebook sering telat dibalas karena admin harus berpindah-pindah perangkat dan akun.',
  },
  {
    index: '02',
    title: 'Konteks putus saat ganti shift',
    detail:
      'Ketika admin berganti shift atau libur, admin berikutnya tidak melihat riwayat obrolan dan catatan pesanan sebelumnya.',
  },
  {
    index: '03',
    title: 'Laporan CS bias oleh chat non-pembeli',
    detail:
      'Pesan kurir, supplier, dan grup kantor bercampur dengan pembeli sehingga kecepatan balas tim sulit diukur secara objektif.',
  },
];

const MODULE_TABS = [
  {
    id: 'inbox',
    shortLabel: 'Kotak Masuk',
    title: 'Seluruh pesan masuk terhubung langsung ke profil pelanggan',
    summary:
      'Instagram, banyak nomor WhatsApp, Facebook Messenger, Threads, dan Telegram dikelola dalam satu antrean kerja yang rapi.',
    icon: MessageSquare,
    highlights: [
      'Kirim foto, dokumen, katalog harga, dan balasan cepat dalam satu klik.',
      'Komentar iklan Instagram & Facebook otomatis dibalas dan diarahkan ke obrolan pribadi.',
      'Riwayat interaksi lintas kanal tercatat pada satu kartu pelanggan.',
    ],
  },
  {
    id: 'team',
    shortLabel: 'Tim & Shift',
    title: 'Pembagian tugas jelas dan data pelanggan tetap aman',
    summary:
      'Setiap percakapan memiliki penanggung jawab, catatan internal antar staf, dan batasan hak akses sesuai peran.',
    icon: SlidersHorizontal,
    highlights: [
      'Staf baru cukup melihat obrolan miliknya tanpa akses ekspor daftar kontak.',
      'Serah terima antar shift berjalan lewat catatan internal tanpa membuat pembeli mengulang cerita.',
      'Tandai chat kurir, vendor, atau grup kantor sebagai Non-Penilaian.',
    ],
  },
  {
    id: 'sla',
    shortLabel: 'Laporan & Rating',
    title: 'Pantau kecepatan respon dan kepuasan pelanggan per sesi',
    summary:
      'Supervisor melihat waktu balas rata-rata, jam tersibuk, beban kerja tiap admin, dan survei kepuasan pelanggan secara nyata.',
    icon: Clock,
    highlights: [
      'Pembatasan sesi otomatis tiap kali pelanggan kembali menghubungi di hari berbeda.',
      'Tautan survei rating terkirim otomatis setelah sesi layanan ditutup.',
      'Evaluasi kinerja tim berdasarkan angka aktual, bukan laporan lisan.',
    ],
  },
  {
    id: 'campaign',
    shortLabel: 'Follow-Up & Konten',
    title: 'Jadwalkan tindak lanjut, siaran promo, dan unggahan rutin',
    summary:
      'Rawat pelanggan lama dan prospek yang belum selesai transaksi dari ruang kerja yang sama.',
    icon: CalendarClock,
    highlights: [
      'Kelompokkan pelanggan dengan label agar tim tahu siapa yang perlu dihubungi ulang.',
      'Kirim pengingat promo dan ucapan ulang tahun otomatis dengan jeda pengiriman terukur.',
      'Jadwalkan postingan Instagram, Facebook, Threads, dan Story WhatsApp dalam satu kalender.',
    ],
  },
  {
    id: 'ai',
    shortLabel: 'Asisten Otomatis',
    title: 'Sambut pesan di luar jam kerja lalu teruskan ke admin aktif',
    summary:
      'Asisten menjawab pertanyaan dasar berdasarkan daftar harga dan panduan usaha Anda, kemudian menyerahkan ke staf saat butuh penanganan lanjut.',
    icon: Bot,
    highlights: [
      'Jawaban mengacu pada katalog, harga, dan aturan layanan yang Anda unggah sendiri.',
      'Gaya bahasa bisa disesuaikan agar tetap sopan dan konsisten dengan karakter merek.',
      'Percakapan otomatis dialihkan ke admin bertugas lengkap dengan ringkasan konteks.',
    ],
  },
];

const CHANNELS = [
  {
    name: 'Instagram',
    role: 'DM, Komentar & Feed',
    desc: 'Balas DM, tanggapi komentar iklan otomatis ke pesan pribadi, dan jadwalkan unggahan.',
  },
  {
    name: 'WhatsApp',
    role: 'Multi-Nomor & Story',
    desc: 'Kelola banyak nomor admin dalam satu tempat lengkap dengan riwayat grup dan Story.',
  },
  {
    name: 'Facebook',
    role: 'Messenger & Halaman',
    desc: 'Tangani pesan halaman toko, komentar calon pembeli, dan jadwal posting berkala.',
  },
  {
    name: 'Threads',
    role: 'Utas & Interaksi',
    desc: 'Jadwalkan utas rutin dan pantau respons audiens bersama kanal utama lainnya.',
  },
  {
    name: 'Telegram',
    role: 'Pelanggan & Mitra',
    desc: 'Layani pembeli, reseller, dan mitra grosir dari antrean kotak masuk yang sama.',
  },
  {
    name: 'Komentar Iklan',
    role: 'Otomasi Prospek',
    desc: 'Ubah komentar tanya harga pada iklan menjadi percakapan pribadi sebelum tenggelam.',
  },
];

const STORY_POINTS = [
  {
    step: '01 · Berawal dari operasional harian',
    text: 'Kami mengalami sendiri bagaimana chat pelanggan tersebar di banyak HP dan akun saat volume pesanan meningkat.',
  },
  {
    step: '02 · Lebih dari sekadar balas pesan',
    text: 'Masalah utamanya adalah riwayat yang putus saat ganti shift, tindak lanjut yang terlewat, dan pemilik usaha yang sulit memantau pelayanan.',
  },
  {
    step: '03 · Satu alur kerja utuh',
    text: 'Reneo CRM menyatukan komunikasi, data pelanggan, pembagian tugas tim, dan laporan kinerja agar tidak bergantung pada ingatan satu admin.',
  },
  {
    step: '04 · Multi-usaha dalam satu akun',
    text: 'Kelola beberapa cabang atau merek usaha di ruang kerja terpisah masing-masing tanpa mencampur data pelanggan.',
  },
];

const COMPARISON_ROWS = [
  {
    aspect: 'Pergantian shift & tim bertambah',
    manual: 'Riwayat tertahan di HP masing-masing admin; konteks langsung putus.',
    other: 'Pesan terkumpul, tetapi pembagian tugas & catatan kerja sering terbatas.',
    reneo: 'Riwayat pelanggan, catatan internal, dan penanggung jawab tersambung lintas shift.',
  },
  {
    aspect: 'Kepemilikan & keterpusatan data',
    manual: 'Rawan hilang saat HP rusak atau staf berhenti bekerja.',
    other: 'Tersebar di layanan pihak luar tanpa kontrol ruang kerja penuh.',
    reneo: 'Seluruh data kontak dan percakapan tersimpan terpusat di ruang kerja usaha Anda.',
  },
  {
    aspect: 'Akurasi laporan kecepatan tim',
    manual: 'Harus dicek dan direkap manual satu per satu.',
    other: 'Chat kurir dan grup kantor ikut dihitung sehingga angka bias.',
    reneo: 'Filter Non-Penilaian memisahkan chat internal agar laporan CS tetap akurat.',
  },
  {
    aspect: 'Skala biaya operasional',
    manual: 'Harus membeli HP baru setiap menambah admin.',
    other: 'Biaya naik tajam mengikuti jumlah kursi dan volume pesan.',
    reneo: 'Struktur paket transparan tanpa tambahan biaya per pesan.',
  },
];

const FAQS = [
  {
    q: 'Apakah Reneo CRM hanya untuk menggabungkan chat?',
    a: 'Tidak. Selain menyatukan Instagram, WhatsApp, Facebook, Threads, dan Telegram, Reneo CRM mengelola profil pelanggan, pembagian shift admin, catatan tindak lanjut, jadwal konten, dan laporan kecepatan tim.',
  },
  {
    q: 'Apakah bisa mengelola lebih dari satu merek atau cabang usaha?',
    a: 'Bisa. Satu akun dapat memiliki beberapa ruang kerja perusahaan dengan URL, daftar kontak, saluran komunikasi, dan tim masing-masing yang terpisah.',
  },
  {
    q: 'Apakah riwayat pelanggan aman jika ada staf yang berganti atau keluar?',
    a: 'Aman. Seluruh percakapan dan data pelanggan tersimpan di ruang kerja usaha Anda. Anda cukup mencabut akses akun staf tanpa kehilangan riwayat lama.',
  },
  {
    q: 'Bagaimana jika nomor CS dipakai juga untuk chat kurir atau grup kantor?',
    a: 'Tandai kontak atau grup tersebut sebagai Non-Penilaian agar tetap bisa dibalas seperti biasa tanpa memengaruhi laporan waktu respon maupun survei kepuasan.',
  },
  {
    q: 'Apakah tersedia masa coba gratis sebelum berlangganan?',
    a: 'Ya, Anda dapat mendaftar dan mencoba ruang kerja Reneo CRM gratis selama 7 hari.',
  },
];

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2';

export const LandingPage: React.FC<LandingPageProps> = ({
  initialized,
  authenticated = false,
  onEnterLogin,
  onEnterRegister,
  onOpenGuide,
}) => {
  const handleRegister = onEnterRegister ?? onEnterLogin;
  const [activeModuleId, setActiveModuleId] = useState(MODULE_TABS[0].id);
  const [activeHeroChannelId, setActiveHeroChannelId] = useState(HERO_CHANNEL_PREVIEWS[0].id);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [plans, setPlans] = useState<LicensePlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');

  useEffect(() => {
    let active = true;
    api
      .getLicensePlans()
      .then((rows) => {
        if (!active) return;
        setPlans(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (active) setPlans([]);
      })
      .finally(() => {
        if (active) setPlansLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const hasAnnualPlans = useMemo(
    () => plans.some((p) => p.period === 'annual' || p.months >= 12),
    [plans]
  );

  const visiblePlans = useMemo(() => {
    if (!hasAnnualPlans) return plans;
    const matched = plans.filter((p) =>
      billingPeriod === 'annual'
        ? p.period === 'annual' || p.months >= 12
        : p.period !== 'annual' && p.months < 12
    );
    return matched.length > 0 ? matched : plans;
  }, [plans, hasAnnualPlans, billingPeriod]);
  const [inquiryType, setInquiryType] = useState<
    'Tambah Fitur Khusus' | 'Beli Aset Program' | 'Konsultasi & Implementasi'
  >('Tambah Fitur Khusus');
  const [inquiryName, setInquiryName] = useState('');
  const [inquiryPhone, setInquiryPhone] = useState('');
  const [inquiryBusiness, setInquiryBusiness] = useState('');
  const [inquiryMessage, setInquiryMessage] = useState('');
  const [inquirySubmitting, setInquirySubmitting] = useState(false);
  const [inquiryStatus, setInquiryStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const handleInquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inquirySubmitting) return;
    if (!inquiryName.trim() || !inquiryPhone.trim() || !inquiryMessage.trim()) {
      setInquiryStatus({ ok: false, text: 'Lengkapi nama, nomor WhatsApp, dan detail kebutuhan Anda.' });
      return;
    }
    try {
      setInquirySubmitting(true);
      setInquiryStatus(null);
      const res = await api.submitPublicInquiry({
        name: inquiryName.trim(),
        phone: inquiryPhone.trim(),
        businessName: inquiryBusiness.trim() || undefined,
        inquiryType,
        message: inquiryMessage.trim(),
      });
      setInquiryStatus({
        ok: true,
        text: res.message || 'Permintaan diterima. Tim kami akan menghubungi Anda melalui WhatsApp.',
      });
      setInquiryName('');
      setInquiryPhone('');
      setInquiryBusiness('');
      setInquiryMessage('');
    } catch (err: any) {
      setInquiryStatus({
        ok: false,
        text: err?.response?.data?.error || 'Gagal mengirim permintaan. Silakan coba kembali beberapa saat lagi.',
      });
    } finally {
      setInquirySubmitting(false);
    }
  };

  const activeModule = MODULE_TABS.find((m) => m.id === activeModuleId) || MODULE_TABS[0];
  const activeHeroChannel =
    HERO_CHANNEL_PREVIEWS.find((c) => c.id === activeHeroChannelId) || HERO_CHANNEL_PREVIEWS[0];
  const ActiveModuleIcon = activeModule.icon;

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-slate-900 antialiased overflow-x-clip">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0D111C]/95 backdrop-blur-xs border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <a href="#" className="flex items-center gap-2.5 min-w-0">
            <ReneoCrmLogo className="w-7 h-7 shrink-0" />
            <span className="text-[15px] font-bold text-white tracking-tight truncate">Reneo CRM</span>
          </a>

          <nav className="hidden lg:flex items-center gap-7 text-[13px] font-medium text-slate-300">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => {
                  if (link.href === '/panduan' && onOpenGuide) {
                    e.preventDefault();
                    onOpenGuide();
                  }
                }}
                className="hover:text-white transition-colors py-1"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            {!authenticated && (
              <button
                type="button"
                onClick={onEnterLogin}
                className={`hidden sm:inline-flex h-9 px-3.5 rounded-lg text-[13px] font-medium text-slate-200 hover:text-white hover:bg-white/10 items-center transition-colors ${FOCUS_RING}`}
              >
                {initialized ? 'Masuk' : 'Setup'}
              </button>
            )}
            <button
              type="button"
              onClick={authenticated ? onEnterLogin : handleRegister}
              className={`h-9 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors ${FOCUS_RING}`}
            >
              <span>{authenticated ? 'Buka Workspace' : 'Mulai Coba Gratis'}</span>
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigasi"
              aria-expanded={mobileMenuOpen}
              className="lg:hidden h-9 w-9 rounded-lg border border-white/15 text-slate-200 inline-flex items-center justify-center hover:bg-white/10"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav className="lg:hidden border-t border-white/10 bg-[#0D111C] px-4 py-3 flex flex-col gap-1 text-sm">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => {
                  setMobileMenuOpen(false);
                  if (link.href === '/panduan' && onOpenGuide) {
                    e.preventDefault();
                    onOpenGuide();
                  }
                }}
                className="px-3 py-2 rounded-lg text-slate-200 hover:bg-white/10 font-medium"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-2 mt-1 border-t border-white/10 flex flex-col gap-2">
              {!authenticated && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onEnterLogin();
                  }}
                  className="h-10 px-4 rounded-lg border border-white/15 text-slate-100 text-sm font-medium"
                >
                  Masuk ke Workspace
                </button>
              )}
              <a
                href="#paket"
                onClick={() => setMobileMenuOpen(false)}
                className="h-10 px-4 rounded-lg bg-white/10 text-white text-sm font-medium inline-flex items-center justify-center gap-1.5"
              >
                <span>Lihat Paket &amp; Harga CRM</span>
              </a>
            </div>
          </nav>
        )}
      </header>

      <main>
        {/* Hero: Dark Workstation Canvas + Realistic App Workspace Preview */}
        <section className="bg-[#0D111C] crm-hero-grid text-white border-b border-slate-800">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-14 sm:pt-16 sm:pb-20 space-y-10 sm:space-y-12">
            <div className="max-w-3xl space-y-5">
              <div className="inline-flex items-center gap-2 text-xs font-mono text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Reneo CRM · Multi-Usaha &amp; Omnichannel</span>
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-[3.25rem] font-extrabold text-white tracking-[-0.03em] leading-[1.08]">
                Satu ruang kerja untuk seluruh pesan pelanggan dan tim CS.
              </h1>

              <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl">
                Satukan percakapan dari{' '}
                <span className="text-white font-medium">
                  Instagram, WhatsApp, Facebook, Threads, dan Telegram
                </span>{' '}
                dengan riwayat kontak, pembagian shift, dan pemantauan respon tim dalam satu tempat.
              </p>

              <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={authenticated ? onEnterLogin : handleRegister}
                  className={`h-11 px-5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${FOCUS_RING}`}
                >
                  <span>{authenticated ? 'Buka Workspace CRM' : 'Coba Gratis 7 Hari'}</span>
                  <ArrowRight className="w-4 h-4" strokeWidth={2} />
                </button>
                <a
                  href="#paket"
                  className="h-11 px-5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-100 border border-white/15 text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <span>Lihat Paket &amp; Harga</span>
                </a>
                {!authenticated && (
                  <button
                    type="button"
                    onClick={onEnterLogin}
                    className="h-11 px-3 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                  >
                    Sudah punya akun? Masuk
                  </button>
                )}
              </div>
            </div>

            {/* Realistic Product Workspace Frame (Matches Actual Reneo CRM Dark Sidebar + Light Inbox) */}
            <div className="rounded-xl border border-white/15 bg-[#121622] overflow-hidden shadow-2xl">
              {/* Top App Bar inside Preview */}
              <div className="h-11 px-3.5 sm:px-4 bg-[#121622] border-b border-[#1E2438] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <ReneoCrmLogo className="w-5 h-5 shrink-0" />
                  <span className="text-xs font-semibold text-white truncate">Reneo CRM</span>
                  <span className="text-xs font-mono text-slate-500 hidden sm:inline">/toko-clarice/conversations</span>
                </div>
                <div
                  role="tablist"
                  aria-label="Pilih kanal pratinjau"
                  className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {HERO_CHANNEL_PREVIEWS.map((ch) => {
                    const active = ch.id === activeHeroChannel.id;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setActiveHeroChannelId(ch.id)}
                        className={`h-7 px-2.5 rounded-md text-[11px] font-medium inline-flex items-center gap-1.5 shrink-0 transition-colors ${
                          active
                            ? 'bg-[#1E2438] text-white'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${ch.dotClass}`} />
                        <span>{ch.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3-Pane Real CRM Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-12 bg-white text-slate-900">
                {/* Left Thread List */}
                <div className="hidden lg:block lg:col-span-4 border-r border-slate-200 bg-slate-50/70 divide-y divide-slate-200">
                  <div className="px-4 py-2.5 flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1.5">
                      <Inbox className="w-3.5 h-3.5" />
                      <span>Antrean Masuk</span>
                    </span>
                    <span className="font-mono text-slate-700">4 aktif</span>
                  </div>
                  {HERO_CHANNEL_PREVIEWS.map((ch) => {
                    const active = ch.id === activeHeroChannel.id;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => setActiveHeroChannelId(ch.id)}
                        className={`w-full text-left px-4 py-3 transition-colors space-y-1 ${
                          active ? 'bg-white border-l-2 border-l-[#2563EB]' : 'hover:bg-white/70'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-900 truncate">{ch.customerName}</span>
                          <span className="text-[11px] font-mono text-slate-400 shrink-0">{ch.time}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{ch.incoming}</div>
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500">
                          <span className={`w-1.5 h-1.5 rounded-full ${ch.dotClass}`} />
                          <span>{ch.label}</span>
                          <span>·</span>
                          <span className="truncate">{ch.statusLabel}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Center Active Chat */}
                <div className="lg:col-span-5 flex flex-col justify-between p-4 sm:p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 truncate">{activeHeroChannel.customerName}</div>
                      <div className="text-xs text-slate-500 truncate">{activeHeroChannel.customerSub}</div>
                    </div>
                    <span className="text-[11px] font-mono font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded shrink-0">
                      {activeHeroChannel.statusLabel}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    <div className="bg-slate-100 text-slate-800 rounded-lg rounded-tl-xs px-3.5 py-2.5 text-[13px] leading-relaxed max-w-[90%]">
                      {activeHeroChannel.incoming}
                    </div>
                    <div className="bg-[#2563EB] text-white rounded-lg rounded-tr-xs px-3.5 py-2.5 text-[13px] leading-relaxed ml-auto max-w-[90%]">
                      {activeHeroChannel.outgoing}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span>Balas cepat · Template · Katalog produk</span>
                    <span>{activeHeroChannel.time} WIB</span>
                  </div>
                </div>

                {/* Right CRM Contact Context */}
                <div className="lg:col-span-3 border-t lg:border-t-0 lg:border-l border-slate-200 bg-slate-50/50 p-4 space-y-3 text-xs">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    <span>Konteks Pelanggan</span>
                  </div>
                  <div className="divide-y divide-slate-200 border-y border-slate-200">
                    <div className="py-2.5">
                      <div className="text-[11px] text-slate-500">Penanggung Jawab</div>
                      <div className="font-semibold text-slate-900 mt-0.5">{activeHeroChannel.crmOwner}</div>
                    </div>
                    <div className="py-2.5">
                      <div className="text-[11px] text-slate-500">Tindak Lanjut</div>
                      <div className="font-semibold text-slate-900 mt-0.5">{activeHeroChannel.crmFollowUp}</div>
                    </div>
                    <div className="py-2.5">
                      <div className="text-[11px] text-slate-500">Riwayat</div>
                      <div className="font-semibold text-slate-900 mt-0.5">{activeHeroChannel.crmHistory}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Operational Problems Strip */}
        <section className="bg-white border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-8">
            <div className="max-w-2xl space-y-2">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-[-0.02em] leading-tight">
                Kenapa banyak transaksi berhenti di tahap balas chat
              </h2>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Saat percakapan makin ramai, kendala operasional biasanya muncul dari tiga hal yang sama.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 border-t border-slate-200">
              {OPERATIONAL_GAPS.map((item) => (
                <div
                  key={item.index}
                  className="pt-5 pb-2 md:py-6 md:pr-8 md:border-r md:last:border-r-0 md:first:pl-0 md:pl-8 border-b md:border-b-0 last:border-b-0 border-slate-200 space-y-2"
                >
                  <div className="text-xs font-mono font-semibold text-slate-400">{item.index}</div>
                  <h3 className="text-base font-bold text-slate-900 leading-snug">{item.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Interactive Module Explorer */}
        <section id="fitur" className="bg-[#FAFAFA] border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20 space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="max-w-2xl space-y-2">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-[-0.02em] leading-tight">
                  Alur kerja lengkap dari pesan masuk sampai tindak lanjut
                </h2>
                <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                  Pilih modul di bawah untuk melihat bagaimana setiap bagian saling terhubung.
                </p>
              </div>
            </div>

            {/* Clean Underlined Tabs */}
            <div
              role="tablist"
              aria-label="Modul Reneo CRM"
              className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {MODULE_TABS.map((tab) => {
                const active = tab.id === activeModule.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveModuleId(tab.id)}
                    className={`shrink-0 h-11 px-4 text-[13px] font-semibold inline-flex items-center gap-2 border-b-2 -mb-px transition-colors ${
                      active
                        ? 'border-[#2563EB] text-slate-900'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                    <span>{tab.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            {/* Flat Crisp Detail Surface */}
            <div
              key={activeModule.id}
              role="tabpanel"
              className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start"
            >
              <div className="lg:col-span-5 space-y-3">
                <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                  <ActiveModuleIcon className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 tracking-tight leading-snug">
                  {activeModule.title}
                </h3>
                <p className="text-sm sm:text-[15px] text-slate-600 leading-relaxed">
                  {activeModule.summary}
                </p>
              </div>

              <div className="lg:col-span-7 space-y-3 lg:border-l lg:border-slate-200 lg:pl-8">
                {activeModule.highlights.map((item) => (
                  <div key={item} className="flex items-start gap-3 text-sm sm:text-[15px] text-slate-700 leading-relaxed">
                    <Check className="w-4 h-4 text-[#2563EB] shrink-0 mt-1" strokeWidth={2.25} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Channels Grid */}
        <section id="kanal" className="bg-white border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20 space-y-8">
            <div className="max-w-2xl space-y-2">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-[-0.02em] leading-tight">
                Terhubung dengan kanal yang dipakai pelanggan Anda
              </h2>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Semua percakapan masuk ke antrean yang sama dan otomatis memperbarui riwayat kontak.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border-t border-l border-slate-200">
              {CHANNELS.map((ch) => (
                <div key={ch.name} className="p-5 sm:p-6 border-r border-b border-slate-200 bg-white space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-900">{ch.name}</h3>
                    <span className="text-[11px] font-mono text-slate-500">{ch.role}</span>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">{ch.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Authentic Story (Compact, Grounded, Zero Fluff) */}
        <section id="cerita" className="bg-[#FAFAFA] border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            <div className="lg:col-span-5 space-y-3">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-[-0.02em] leading-tight">
                Dibangun dari kebutuhan tim operasional sendiri
              </h2>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Pelayanan pelanggan tidak berhenti saat pesan dibalas. Yang penting adalah kesinambungan riwayat, pembagian tugas, dan tindak lanjut hingga tuntas.
              </p>
            </div>

            <div className="lg:col-span-7 divide-y divide-slate-200 border-y border-slate-200">
              {STORY_POINTS.map((item) => (
                <div key={item.step} className="py-4 sm:py-5 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4">
                  <div className="sm:col-span-5 text-xs font-mono font-semibold text-slate-800">{item.step}</div>
                  <p className="sm:col-span-7 text-sm text-slate-600 leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Comparison */}
        <section id="perbandingan" className="bg-white border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20 space-y-8">
            <div className="max-w-2xl space-y-2">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-[-0.02em] leading-tight">
                Perbandingan alur kerja
              </h2>
              <p className="text-sm sm:text-base text-slate-600">
                Perbedaan pengelolaan pelanggan dengan banyak HP, aplikasi chat biasa, dan Reneo CRM.
              </p>
            </div>

            {/* Mobile Stacked */}
            <div className="space-y-3 md:hidden">
              {COMPARISON_ROWS.map((row) => (
                <div
                  key={row.aspect}
                  className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-200 text-sm"
                >
                  <div className="px-4 py-3 bg-slate-50 font-semibold text-slate-900">{row.aspect}</div>
                  <div className="px-4 py-3 space-y-1">
                    <div className="text-xs font-mono text-slate-500">Cara Lama</div>
                    <p className="text-slate-600">{row.manual}</p>
                  </div>
                  <div className="px-4 py-3 space-y-1">
                    <div className="text-xs font-mono text-slate-500">Aplikasi Chat Umum</div>
                    <p className="text-slate-600">{row.other}</p>
                  </div>
                  <div className="px-4 py-3 space-y-1 bg-blue-50/40">
                    <div className="text-xs font-mono font-semibold text-[#1D4ED8]">Reneo CRM</div>
                    <p className="text-slate-900 font-medium">{row.reneo}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full min-w-[700px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-mono uppercase tracking-wider text-slate-600">
                    <th className="py-3.5 px-5 w-[24%]">Aspek</th>
                    <th className="py-3.5 px-5 w-[24%]">Cara Lama</th>
                    <th className="py-3.5 px-5 w-[24%]">Aplikasi Chat Umum</th>
                    <th className="py-3.5 px-5 w-[28%] text-[#1D4ED8] bg-blue-50/50">Reneo CRM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {COMPARISON_ROWS.map((row) => (
                    <tr key={row.aspect} className="align-top">
                      <td className="py-4 px-5 font-semibold text-slate-900">{row.aspect}</td>
                      <td className="py-4 px-5 text-slate-600 leading-relaxed">{row.manual}</td>
                      <td className="py-4 px-5 text-slate-600 leading-relaxed">{row.other}</td>
                      <td className="py-4 px-5 font-medium text-slate-900 bg-blue-50/30 leading-relaxed">
                        {row.reneo}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Standalone CRM Subscription Plans */}
        <section id="paket" className="bg-white border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="max-w-2xl space-y-2">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-[-0.02em] leading-tight">
                  Berlangganan Reneo CRM langsung, tanpa perlu sewa hosting
                </h2>
                <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                  Daftar akun, coba gratis 7 hari, lalu pilih paket langganan sesuai ukuran tim dan jumlah bisnis Anda.
                </p>
              </div>

              {hasAnnualPlans && (
                <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 border border-slate-200 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setBillingPeriod('monthly')}
                    className={`h-8 px-3 rounded-md text-xs font-semibold transition-colors ${
                      billingPeriod === 'monthly'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Bulanan
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingPeriod('annual')}
                    className={`h-8 px-3 rounded-md text-xs font-semibold transition-colors ${
                      billingPeriod === 'annual'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tahunan
                  </button>
                </div>
              )}
            </div>

            {plansLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="h-72 rounded-xl border border-slate-200 bg-slate-50 animate-pulse"
                  />
                ))}
              </div>
            ) : visiblePlans.length > 0 ? (
              <div
                className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${
                  visiblePlans.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
                }`}
              >
                {visiblePlans.map((plan) => {
                  const f = plan.features || {};
                  const slugLow = (plan.slug || '').toLowerCase();
                  const isStarter = slugLow.includes('starter');
                  const isPro = slugLow.includes('pro');
                  const isBusiness = slugLow.includes('business');
                  const isEnterprise = slugLow.includes('enterprise');

                  const maxContacts = Number(
                    f.maxContacts ?? (isEnterprise ? 150000 : isBusiness ? 50000 : isPro ? 10000 : 2500)
                  );
                  const hasMultiSessions = Boolean(f.multiSession ?? !isStarter);
                  const maxSessions = Number(
                    f.maxSessions ?? (isEnterprise ? 25 : isBusiness ? 10 : hasMultiSessions ? 3 : 1)
                  );
                  const hasMultiAgents = Boolean(f.multiAgent ?? !isStarter);
                  const maxAgents = Number(
                    f.maxAgents ?? (isEnterprise ? 35 : isBusiness ? 15 : hasMultiAgents ? 5 : 1)
                  );
                  const maxStorageMb = Number(
                    f.maxStorageMb ?? (isEnterprise ? 25600 : isBusiness ? 6144 : isPro ? 1536 : 500)
                  );
                  const maxBroadcast = Number(
                    f.maxBroadcastPerMonth ?? (f.unlimitedBroadcast || isEnterprise ? 0 : isBusiness ? 75000 : isPro ? 25000 : 2500)
                  );
                  const hasOmnichannel = Boolean(f.omnichannel ?? (isPro || isBusiness || isEnterprise));
                  const hasLiveChat = Boolean(f.liveChat ?? f.liveChatCrm ?? true);
                  const hasScheduled = Boolean(f.scheduledPosts ?? (isPro || isBusiness || isEnterprise));
                  const hasAi = Boolean(f.aiAgent ?? (isBusiness || isEnterprise));

                  const storageLabel =
                    maxStorageMb >= 1024
                      ? `${Math.round((maxStorageMb / 1024) * 10) / 10} GB penyimpanan media`
                      : `${maxStorageMb} MB penyimpanan media`;

                  const highlights: string[] = [
                    maxContacts === 0
                      ? 'Kontak pelanggan tanpa batas'
                      : `Hingga ${maxContacts.toLocaleString('id-ID')} kontak pelanggan`,
                    hasMultiSessions && maxSessions > 1
                      ? `Multi-nomor WhatsApp hingga ${maxSessions} sesi`
                      : '1 sesi nomor WhatsApp',
                    hasMultiAgents && maxAgents > 1
                      ? `Hingga ${maxAgents} akun tim & peran kerja`
                      : '1 akun admin usaha',
                    f.unlimitedBroadcast || maxBroadcast === 0
                      ? 'Pesan siaran tanpa batas prioritas'
                      : `${maxBroadcast.toLocaleString('id-ID')} pesan siaran / bulan`,
                    storageLabel,
                  ];
                  if (hasLiveChat) highlights.push('Kotak Masuk Live Chat & CSAT rating');
                  if (hasOmnichannel) highlights.push('Instagram, Facebook, Threads & Telegram');
                  if (hasScheduled) highlights.push('Kalender jadwal konten & Story WA');
                  if (hasAi) highlights.push('Asisten otomatis AI berbasis katalog usaha');

                  const unitLabel =
                    plan.period === 'annual' || plan.months >= 12
                      ? '/ tahun'
                      : plan.months > 1
                      ? `/ ${plan.months} bln`
                      : '/ bulan';

                  return (
                    <div
                      key={plan.slug}
                      className={`rounded-xl border p-5 flex flex-col justify-between gap-5 ${
                        plan.highlighted
                          ? 'border-[#2563EB] bg-blue-50/20 ring-1 ring-[#2563EB]/20'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="text-base font-bold text-slate-900">{plan.name}</h3>
                            {plan.highlighted && (
                              <span className="px-2 py-0.5 rounded bg-[#2563EB] text-white text-[10px] font-semibold">
                                Populer
                              </span>
                            )}
                          </div>
                          {plan.tagline && (
                            <p className="text-xs text-slate-600 leading-relaxed">{plan.tagline}</p>
                          )}
                        </div>

                        <div className="pb-4 border-b border-slate-200">
                          {((plan.originalPriceAmount && plan.originalPriceAmount > plan.priceAmount) || (plan.discountPercent && plan.discountPercent > 0)) && (
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              {plan.originalPriceAmount && plan.originalPriceAmount > plan.priceAmount && (
                                <span className="line-through text-xs font-semibold text-slate-400 tabular-nums">
                                  Rp {Number(plan.originalPriceAmount).toLocaleString('id-ID')}
                                </span>
                              )}
                              {plan.discountPercent && plan.discountPercent > 0 && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                  Hemat {plan.discountPercent}%
                                </span>
                              )}
                            </div>
                          )}

                          <div className="flex items-baseline gap-1.5">
                            <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
                              Rp {Number(plan.priceAmount || 0).toLocaleString('id-ID')}
                            </span>
                            <span className="text-xs text-slate-500">{unitLabel}</span>
                          </div>

                          {plan.promoValidUntil && (
                            <div className="mt-1 text-[10px] text-amber-800 bg-amber-50 border border-amber-200/80 rounded px-1.5 py-0.5 inline-flex items-center gap-1 font-medium">
                              <Clock className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                              <span>Promo s/d {plan.promoValidUntil}</span>
                            </div>
                          )}

                          {(plan.trialDays ?? 0) > 0 && (
                            <p className="mt-1 text-[11px] font-medium text-emerald-700">
                              Termasuk uji coba gratis {plan.trialDays} hari
                            </p>
                          )}
                        </div>

                        <ul className="space-y-2 text-xs text-slate-700">
                          {highlights.map((line) => (
                            <li key={line} className="flex items-start gap-2">
                              <Check className="w-3.5 h-3.5 text-[#2563EB] shrink-0 mt-0.5" strokeWidth={2.25} />
                              <span className="leading-snug">{line}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <button
                        type="button"
                        onClick={authenticated ? onEnterLogin : handleRegister}
                        className={`w-full h-10 px-4 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${FOCUS_RING} ${
                          plan.highlighted
                            ? 'bg-[#2563EB] hover:bg-[#1D4ED8] text-white'
                            : 'bg-slate-900 hover:bg-slate-800 text-white'
                        }`}
                      >
                        <span>{authenticated ? 'Pilih di Workspace' : 'Langganan Paket Ini'}</span>
                        <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <p className="text-xs text-slate-500">
              Langganan aktif langsung di cloud Reneo CRM — tidak perlu membeli hosting terpisah. Jika usaha Anda memiliki lebih dari satu cabang atau merek, setiap bisnis dapat berlangganan paketnya sendiri dalam satu akun.
            </p>
          </div>
        </section>

        {/* FAQ + Custom Inquiry Side-by-Side */}
        <section id="faq" className="bg-[#FAFAFA] border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
            {/* FAQ */}
            <div className="lg:col-span-6 space-y-5">
              <div className="space-y-1.5">
                <h2 className="text-2xl font-bold text-slate-900 tracking-[-0.02em]">Pertanyaan umum</h2>
                <p className="text-sm text-slate-600">Jawaban singkat sebelum mulai mencoba ruang kerja.</p>
              </div>

              <div className="divide-y divide-slate-200 border-y border-slate-200">
                {FAQS.map((item, idx) => {
                  const isOpen = openFaq === idx;
                  return (
                    <div key={item.q}>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpenFaq(isOpen ? null : idx)}
                        className="w-full py-4 text-left flex items-center justify-between gap-4 hover:text-[#2563EB] transition-colors"
                      >
                        <span className="text-sm sm:text-[15px] font-semibold text-slate-900">{item.q}</span>
                        <ChevronDown
                          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150 ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                      {isOpen && (
                        <div className="pb-4 text-sm text-slate-600 leading-relaxed">{item.a}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom Feature / Program Asset Inquiry */}
            <div id="hubungi-kami" className="lg:col-span-6 space-y-5">
              <div className="space-y-1.5">
                <h2 className="text-2xl font-bold text-slate-900 tracking-[-0.02em]">
                  Kebutuhan khusus atau beli aset program
                </h2>
                <p className="text-sm text-slate-600">
                  Kirim detail kebutuhan Anda — tim kami akan membalas langsung melalui WhatsApp.
                </p>
              </div>

              <form
                onSubmit={handleInquirySubmit}
                className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4"
              >
                <div className="flex flex-wrap gap-1.5">
                  {(
                    ['Tambah Fitur Khusus', 'Beli Aset Program', 'Konsultasi & Implementasi'] as const
                  ).map((opt) => {
                    const selected = inquiryType === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setInquiryType(opt)}
                        className={`h-9 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                          selected
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="inquiry-name" className="block text-xs font-semibold text-slate-700">
                      Nama Lengkap *
                    </label>
                    <input
                      id="inquiry-name"
                      type="text"
                      required
                      value={inquiryName}
                      onChange={(e) => setInquiryName(e.target.value)}
                      placeholder="Budi Santoso"
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="inquiry-phone" className="block text-xs font-semibold text-slate-700">
                      WhatsApp Aktif *
                    </label>
                    <input
                      id="inquiry-phone"
                      type="tel"
                      required
                      value={inquiryPhone}
                      onChange={(e) => setInquiryPhone(e.target.value)}
                      placeholder="081234567890"
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm font-mono text-slate-900 focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="inquiry-business" className="block text-xs font-semibold text-slate-700">
                    Nama Usaha (opsional)
                  </label>
                  <input
                    id="inquiry-business"
                    type="text"
                    value={inquiryBusiness}
                    onChange={(e) => setInquiryBusiness(e.target.value)}
                    placeholder="Contoh: PT Maju Bersama"
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="inquiry-message" className="block text-xs font-semibold text-slate-700">
                    Detail Kebutuhan *
                  </label>
                  <textarea
                    id="inquiry-message"
                    rows={3}
                    required
                    value={inquiryMessage}
                    onChange={(e) => setInquiryMessage(e.target.value)}
                    placeholder="Jelaskan alur kerja, integrasi, atau kebutuhan aset program yang diinginkan..."
                    className="w-full p-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                {inquiryStatus && (
                  <div
                    className={`p-3 rounded-lg border text-xs font-medium flex items-start gap-2 ${
                      inquiryStatus.ok
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    {inquiryStatus.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <span>{inquiryStatus.text}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={inquirySubmitting}
                  className={`w-full h-10 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${FOCUS_RING}`}
                >
                  <span>{inquirySubmitting ? 'Mengirim...' : 'Kirim Permintaan via WhatsApp'}</span>
                  <ArrowRight className="w-4 h-4" strokeWidth={2} />
                </button>
              </form>
            </div>
          </div>
        </section>

        {/* Closing Band */}
        <section className="bg-[#0D111C] text-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.02em] leading-tight">
                Mulai rapikan operasional layanan pelanggan hari ini
              </h2>
              <p className="text-sm sm:text-base text-slate-400">
                Uji coba gratis 7 hari langsung di ruang kerja usaha Anda, lalu lanjutkan dengan paket langganan CRM sesuai kebutuhan tim.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={authenticated ? onEnterLogin : handleRegister}
                className={`h-11 px-5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${FOCUS_RING}`}
              >
                <span>{authenticated ? 'Buka Workspace CRM' : 'Daftar & Langganan CRM'}</span>
                <ArrowRight className="w-4 h-4" strokeWidth={2} />
              </button>
              <a
                href="#paket"
                className="h-11 px-5 rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/15 text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
              >
                <span>Lihat Paket &amp; Harga</span>
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#0D111C] border-t border-white/10 text-slate-400">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2">
            <ReneoCrmLogo className="w-5 h-5 shrink-0" />
            <span className="font-semibold text-white">Reneo CRM</span>
            <span>· Kelola Pelanggan &amp; Operasional Tim</span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <a href="#paket" className="hover:text-white transition-colors">
              Paket &amp; Harga CRM
            </a>
            <a
              href="/panduan"
              onClick={(e) => {
                if (onOpenGuide) {
                  e.preventDefault();
                  onOpenGuide();
                }
              }}
              className="hover:text-white transition-colors"
            >
              Buku Panduan Penggunaan
            </a>
            <a href={PANEL_URL} target="_top" className="hover:text-white transition-colors">
              Butuh Hosting Sendiri?
            </a>
            <a href={PANEL_INSTALL_URL} target="_top" className="hover:text-white transition-colors">
              Panduan Pemasangan
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
