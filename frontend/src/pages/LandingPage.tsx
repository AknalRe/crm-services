import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Menu,
  MessageSquare,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { ReneoCrmLogo } from '../components/ReneoCrmLogo';
import { api } from '../services/api';

interface LandingPageProps {
  initialized: boolean;
  authenticated?: boolean;
  onEnterLogin: () => void;
  onEnterRegister?: () => void;
}

const PANEL_URL = 'https://panel.reneo.my.id';
const PANEL_INSTALL_URL = 'https://panel.reneo.my.id/install';
const PANEL_ORDER_URL = 'https://panel.reneo.my.id/order?addon=reneo-crm';

const NAV_LINKS = [
  { href: '#masalah', label: 'Kenapa Penting' },
  { href: '#kenapa-dibuat', label: 'Cerita Kami' },
  { href: '#modul', label: 'Fitur Utama' },
  { href: '#kanal', label: 'Semua Kanal' },
  { href: '#perbandingan', label: 'Perbandingan' },
  { href: '#faq', label: 'FAQ' },
  { href: '#hubungi-kami', label: 'Hubungi Kami' },
];

const HERO_CHANNEL_PREVIEWS = [
  {
    id: 'instagram',
    label: 'Instagram',
    badgeClass: 'bg-pink-50 text-pink-700 border-pink-200',
    dotClass: 'bg-pink-500',
    customerName: '@nadia.beautystore',
    customerSub: 'DM dari Komentar Reels Promo',
    statusLabel: 'Ditangani Rina',
    incoming: 'Kak, paket skincare yang di video tadi masih promo ongkir gratis hari ini?',
    outgoing: 'Masih berlaku sampai jam 21.00 ya Kak Nadia! Mau dibantu pilih varian yang cocok?',
    footerNote: 'Komentar iklan otomatis dibalas & masuk ke kotak masuk CS.',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
    customerName: 'Siti Aminah',
    customerSub: 'WhatsApp Cabang Pusat · Sesi #2',
    statusLabel: 'Rating 5/5',
    incoming: 'Halo kak, mau repeat order paket bundling 3 pcs seperti bulan lalu ya.',
    outgoing: 'Siap Kak Siti! Data alamat & pesanan sebelumnya sudah tercatat. Total Rp 245.000 ya.',
    footerNote: 'Riwayat order lama tetap utuh meski ditangani admin shift berbeda.',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    dotClass: 'bg-blue-600',
    customerName: 'Budi Santoso',
    customerSub: 'Facebook Messenger · Halaman Toko',
    statusLabel: 'Respon 1 mnt',
    incoming: 'Min, kalau kirim ke Surabaya hari ini estimasi sampai kapan ya?',
    outgoing: 'Kalau transfer sebelum jam 15.00 ikut pengiriman hari ini Pak Budi, estimasi 1–2 hari sampai.',
    footerNote: 'Pesan Halaman Facebook & komentar postingan dibalas dari satu layar.',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    dotClass: 'bg-sky-500',
    customerName: 'Reseller Malang',
    customerSub: 'Telegram · Mitra Grosir',
    statusLabel: 'Prioritas',
    incoming: 'Kak, stok katalog grosir minggu ini sudah update belum?',
    outgoing: 'Sudah siap Kak! Ini daftar harga grosir terbaru langsung saya kirimkan ya.',
    footerNote: 'Semua pesan pelanggan dari berbagai aplikasi terkumpul tanpa pindah tab.',
  },
];

const HIDDEN_COSTS = [
  {
    stat: '15 Menit',
    title: 'Telat balas sedikit, calon pembeli pindah ke toko sebelah',
    detail:
      'Saat chat dari Instagram, Facebook, Telegram, dan beberapa nomor WhatsApp menumpuk di HP terpisah, pesan pembeli yang siap bayar sering baru terbaca saat mereka sudah membeli di tempat lain.',
  },
  {
    stat: 'Ganti Shift',
    title: 'Admin berganti, konteks pelanggan langsung hilang',
    detail:
      'Pembeli paling malas diminta menjelaskan ulang keluhan atau pesanan yang sudah dibahas kemarin. Tanpa riwayat terpusat, tim Anda terlihat kurang kompak di mata pelanggan.',
  },
  {
    stat: 'Tanpa Ukur',
    title: 'Sulit tahu mana CS yang sigap dan mana iklan yang benar-benar menghasilkan',
    detail:
      'Karena chat pembeli bercampur dengan pesan kurir, vendor, dan grup internal, Anda tidak pernah tahu kecepatan balas sebenarnya maupun tingkat kepuasan pelanggan.',
  },
];

const STORY_BEATS = [
  {
    number: '01',
    step: 'Kami pernah mengalaminya sendiri.',
    paragraphs: [
      'Dalam operasional sehari-hari, komunikasi dengan pelanggan datang dari berbagai kanal dan ditangani oleh beberapa admin. Percakapan tersebar di banyak perangkat dan akun, sehingga informasi pelanggan tidak selalu berada di satu tempat.',
      'Ketika aktivitas semakin ramai, kami mulai merasakan betapa sulitnya memastikan setiap percakapan ditangani dengan baik.',
    ],
  },
  {
    number: '02',
    step: 'Kami menyadari masalahnya lebih besar dari sekadar chat.',
    paragraphs: [
      'Pergantian shift bisa membuat riwayat komunikasi terputus. Follow-up pelanggan berisiko terlewat. Admin lain tidak selalu mengetahui apa yang sudah dibicarakan sebelumnya, sementara pemilik bisnis kesulitan memantau pekerjaan dan pelayanan tim.',
      'Pada akhirnya, masalahnya bukan hanya tentang membalas pesan, tetapi bagaimana memastikan setiap pelanggan mendapatkan penanganan yang berkelanjutan.',
    ],
  },
  {
    number: '03',
    step: 'Kami merasa membutuhkan sesuatu yang lebih menyeluruh.',
    paragraphs: [
      'Kami membutuhkan sistem yang bukan hanya mengumpulkan pesan dari berbagai kanal, tetapi juga membantu mengelola data pelanggan, membagi tanggung jawab, memantau aktivitas admin, dan memastikan setiap tindak lanjut berjalan.',
      'Kami ingin seluruh proses tersebut saling terhubung, bukan berjalan sendiri-sendiri.',
    ],
  },
  {
    number: '04',
    step: 'Karena itu, kami membuat Reneo CRM.',
    paragraphs: [
      'Kami membangun Reneo CRM berdasarkan kebutuhan yang kami alami sendiri. Sebuah sistem CRM yang membantu tim mengelola pelanggan, menyatukan komunikasi, menjaga kesinambungan pekerjaan, dan memberikan gambaran yang lebih jelas tentang aktivitas operasional.',
      'Bukan sekadar tempat untuk menerima pesan, tetapi ruang kerja untuk mengelola hubungan dengan pelanggan.',
    ],
  },
  {
    number: '05',
    step: 'Tujuan kami.',
    paragraphs: [
      'Kami ingin pengelolaan pelanggan tidak lagi bergantung pada ingatan masing-masing admin, percakapan yang tersebar, atau informasi yang harus dicari ulang.',
      'Setiap pelanggan memiliki riwayat, setiap pekerjaan memiliki tindak lanjut, dan setiap anggota tim memiliki gambaran yang jelas tentang apa yang perlu dikerjakan.',
      'Karena bagi kami, pelayanan pelanggan yang baik tidak berhenti pada membalas pesan. Pelayanan yang baik adalah memastikan setiap pelanggan ditangani dengan baik, dari awal percakapan hingga proses selanjutnya.',
    ],
  },
];

const MODULE_TABS = [
  {
    id: 'inbox',
    shortLabel: 'Komunikasi Terpusat',
    title: 'Menjaga Komunikasi Semua Kanal Tetap Terpusat di Satu Alur CRM',
    summary:
      'Agar percakapan tidak lagi tercecer di banyak HP dan akun, seluruh pesan dari Instagram, WhatsApp, Facebook, Threads, dan Telegram masuk ke satu ruang kerja yang langsung terhubung ke profil pelanggan.',
    icon: MessageSquare,
    highlights: [
      'Semua pesan masuk dari media sosial dan banyak nomor WhatsApp tersimpan rapi dalam satu antrean yang langsung mencatat riwayat pelanggan.',
      'Kirim foto, video, dokumen, katalog harga produk, hingga balasan cepat pakai template dalam satu klik.',
      'Komentar iklan atau postingan Instagram & Facebook bisa otomatis dibalas dan diteruskan ke obrolan pribadi agar peluang tidak tenggelam.',
    ],
    benefitNote: 'Komunikasi terpusat membuat tim langsung melihat konteks pelanggan tanpa berpindah perangkat atau menebak riwayat sebelumnya.',
  },
  {
    id: 'team',
    shortLabel: 'Tim, Shift & Akses',
    title: 'Memastikan Tanggung Jawab Tim Tidak Terputus Saat Pergantian Shift',
    summary:
      'Setiap percakapan memiliki penanggung jawab yang jelas, catatan internal, dan batasan akses sesuai peran staf — sehingga pekerjaan tetap berlanjut mulus saat shift berganti dan data pelanggan tetap aman.',
    icon: SlidersHorizontal,
    highlights: [
      'Atur pembagian tugas antar admin dan tentukan hak akses tiap staf: staf baru cukup melihat obrolan miliknya tanpa bisa mengunduh daftar kontak.',
      'Saat shift berganti, admin berikutnya langsung membaca riwayat lengkap dan catatan internal tanpa meminta pelanggan mengulang cerita.',
      'Tandai chat internal, kurir, supplier, atau grup kantor sebagai Non-Penilaian agar tidak mengacaukan antrean dan laporan CS.',
    ],
    benefitNote: 'Pengelolaan pelanggan tidak lagi bergantung pada ingatan satu admin atau perangkat pribadi.',
  },
  {
    id: 'sla',
    shortLabel: 'Monitoring & Rating',
    title: 'Memantau Aktivitas Tim, Kecepatan Respon & Kepuasan Secara Nyata',
    summary:
      'Pemilik bisnis dan supervisor bisa melihat gambaran jelas tentang pekerjaan tim, kecepatan balas rata-rata, hingga penilaian kepuasan pelanggan per sesi layanan.',
    icon: Clock,
    highlights: [
      'Setiap pelanggan yang kembali menghubungi di hari lain mendapat batas sesi penanganan baru tanpa menghapus riwayat obrolan sebelumnya.',
      'Kirim tautan penilaian bintang & masukan pelanggan otomatis setelah satu sesi layanan selesai.',
      'Pantau jam paling sibuk, beban kerja, dan performa tiap admin langsung dari dashboard untuk evaluasi operasional yang objektif.',
    ],
    benefitNote: 'Pemilik bisnis melihat kondisi pelayanan yang sebenarnya, bukan lagi sekadar laporan lisan.',
  },
  {
    id: 'campaign',
    shortLabel: 'Follow-Up & Promosi',
    title: 'Memastikan Tindak Lanjut Pelanggan & Promosi Tidak Pernah Terlupakan',
    summary:
      'Hubungan dengan pelanggan tidak berhenti setelah pesan dibalas. Kelola daftar kontak, jadwalkan tindak lanjut, ucapan ulang tahun, hingga konten sosial dari satu alur kerja yang sama.',
    icon: CalendarClock,
    highlights: [
      'Simpan profil, label, dan riwayat interaksi pelanggan agar tim tahu siapa yang perlu di-follow-up kembali.',
      'Kirim pengingat promo, info produk baru, atau ucapan ulang tahun otomatis ke segmen pelanggan terpilih dengan jeda pengiriman yang aman.',
      'Jadwalkan unggahan Instagram, Facebook, Threads, hingga pembaruan status WhatsApp dalam satu kalender kerja tim.',
    ],
    benefitNote: 'Setiap peluang dan pelanggan lama tetap terawat tanpa harus diingat satu per satu secara manual.',
  },
  {
    id: 'ai',
    shortLabel: 'Asisten AI',
    title: 'Asisten AI yang Menjaga Respon Awal & Meneruskan ke Admin Saat Dibutuhkan',
    summary:
      'Saat antrean sedang padat atau di luar jam kerja, Asisten AI membantu menjawab pertanyaan awal berdasarkan panduan bisnis Anda, lalu meneruskan percakapan ke admin yang siap bekerja.',
    icon: Bot,
    highlights: [
      'Cukup unggah daftar harga, FAQ, atau panduan produk Anda agar jawaban AI tetap akurat sesuai kebijakan bisnis.',
      'Atur gaya bahasa ramah sesuai karakter usaha Anda agar pelanggan langsung disambut meski menghubungi di luar jam operasional.',
      'Begitu pelanggan butuh penanganan lebih lanjut, percakapan langsung diteruskan ke admin yang aktif bertugas beserta ringkasan konteksnya.',
    ],
    benefitNote: 'Pelanggan tetap tertangani sejak menit pertama, dan admin bisa fokus pada tindak lanjut yang bernilai tinggi.',
  },
];

const CHANNELS = [
  {
    name: 'Instagram',
    role: 'DM, Komentar & Postingan',
    desc: 'Balas DM pelanggan, tanggapi komentar postingan/iklan otomatis jadi DM, dan jadwalkan konten feed.',
    badge: 'bg-pink-50 text-pink-700 border-pink-200',
  },
  {
    name: 'WhatsApp',
    role: 'Multi-Nomor, Grup & Story',
    desc: 'Hubungkan banyak nomor admin maupun akun bisnis resmi sekaligus, lengkap dengan riwayat grup dan jadwal Story.',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    name: 'Facebook',
    role: 'Messenger & Halaman Bisnis',
    desc: 'Tangani pesan masuk halaman toko, balas komentar calon pembeli, dan jadwalkan unggahan berkala.',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    name: 'Threads',
    role: 'Utas & Interaksi Akun',
    desc: 'Jadwalkan utas rutin dan pantau interaksi audiens merek Anda bersama kanal komunikasi lainnya.',
    badge: 'bg-slate-100 text-slate-800 border-slate-200',
  },
  {
    name: 'Telegram',
    role: 'Pesan Pelanggan & Channel',
    desc: 'Layani pertanyaan pembeli, mitra, atau reseller melalui Telegram langsung dari kotak masuk utama.',
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  {
    name: 'Komentar Iklan & Post',
    role: 'Ubah Komentar Jadi Pembeli',
    desc: 'Jangan biarkan komentar "mau dong" atau "cek harga" tenggelam — balas otomatis dan arahkan ke obrolan pribadi.',
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
  },
];

const COMPARISON_ROWS = [
  {
    aspect: 'Kesinambungan saat pergantian shift & tim bertambah',
    manual: 'Riwayat obrolan tertahan di HP masing-masing admin; saat shift berganti konteks pelanggan langsung putus',
    other: 'Pesan terkumpul, tetapi pembagian tugas & catatan kerja antar admin sering terbatas di paket mahal',
    reneo: 'Riwayat pelanggan, catatan internal, dan status tugas tersambung utuh lintas shift di satu ruang kerja CRM',
  },
  {
    aspect: 'Tindak lanjut pelanggan & keterpusatan data',
    manual: 'Bergantung pada ingatan admin; data pelanggan rawan hilang saat perangkat rusak atau staf keluar',
    other: 'Fokus hanya pada balas chat, sementara data pelanggan tersimpan di pihak luar',
    reneo: 'Data pelanggan, riwayat komunikasi semua kanal, dan jadwal tindak lanjut terpusat di ruang milik usaha Anda sendiri',
  },
  {
    aspect: 'Pengawasan pekerjaan admin & keakuratan laporan',
    manual: 'Pemilik bisnis harus cek satu per satu dan rekap manual',
    other: 'Chat kurir, vendor, atau grup kantor ikut masuk hitungan sehingga angka laporan bias',
    reneo: 'Aktivitas admin, kecepatan balas, dan kepuasan pelanggan terpantau objektif dengan filter chat non-pelanggan',
  },
  {
    aspect: 'Biaya operasional saat percakapan makin ramai',
    manual: 'Harus terus membeli HP tambahan setiap kali menambah admin baru',
    other: 'Biaya berlipat mengikuti jumlah kursi admin dan volume pesan',
    reneo: 'Struktur paket jelas untuk pengelolaan pelanggan jangka panjang tanpa biaya tambahan per pesan dari panel',
  },
];

const FAQS = [
  {
    q: 'Apakah Reneo CRM hanya aplikasi untuk menggabungkan chat saja?',
    a: 'Tidak. Menyatukan pesan dari Instagram, WhatsApp, Facebook, Threads, dan Telegram hanyalah salah satu kemampuan di dalamnya. Reneo CRM dirancang sebagai sistem pengelolaan pelanggan dan operasional tim — mencakup riwayat pelanggan terpusat, pembagian tanggung jawab lintas shift, tindak lanjut (follow-up), hingga pemantauan kinerja admin.',
  },
  {
    q: 'Apakah saya harus mengerti hal teknis untuk mulai memakai Reneo CRM?',
    a: 'Tidak perlu. Anda bisa langsung mendaftar akun baru untuk mencoba ruang kerja Reneo CRM secara gratis selama 7 hari, atau memesan paket siap pakai bersama tim Anda.',
  },
  {
    q: 'Apakah riwayat pelanggan aman jika ada admin yang berganti shift atau resign?',
    a: 'Ya. Seluruh riwayat percakapan, profil kontak, catatan internal, dan status tindak lanjut tersimpan terpusat di ruang kerja usaha Anda. Anda cukup mengatur ulang akses staf tanpa pernah kehilangan riwayat pelanggan lama.',
  },
  {
    q: 'Bagaimana jika nomor CS juga sering dipakai untuk chat kurir atau grup kantor?',
    a: 'Anda dapat menandai kontak tertentu maupun grup kantor sebagai Non-Penilaian. Obrolan tetap bisa dibalas seperti biasa, tetapi tidak akan mengganggu laporan kecepatan respon dan tidak dikirimi survei kepuasan.',
  },
  {
    q: 'Apakah bisa dicoba dulu sebelum berlangganan?',
    a: 'Tentu. Anda dapat memulai masa uji coba gratis selama 7 hari untuk merasakan langsung bagaimana Reneo CRM membantu mengelola pelanggan dan pekerjaan tim Anda sehari-hari.',
  },
];

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2';

function RevealSection({
  children,
  className = '',
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (
      !el ||
      typeof IntersectionObserver === 'undefined' ||
      (typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    ) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -24px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id={id}
      ref={ref}
      className={`transition-all duration-300 ease-out motion-reduce:transition-none motion-reduce:transform-none ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
      } ${className}`}
    >
      {children}
    </section>
  );
}

export const LandingPage: React.FC<LandingPageProps> = ({
  initialized,
  authenticated = false,
  onEnterLogin,
  onEnterRegister,
}) => {
  const handleRegister = onEnterRegister ?? onEnterLogin;
  const [activeModuleId, setActiveModuleId] = useState(MODULE_TABS[0].id);
  const [activeHeroChannelId, setActiveHeroChannelId] = useState(HERO_CHANNEL_PREVIEWS[0].id);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [inquiryType, setInquiryType] = useState<'Tambah Fitur Khusus' | 'Beli Aset Program' | 'Konsultasi & Implementasi'>('Tambah Fitur Khusus');
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
      setInquiryStatus({ ok: false, text: 'Mohon lengkapi nama, nomor WhatsApp, dan detail kebutuhan Anda.' });
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
        text:
          res.message ||
          'Permintaan Anda sudah kami terima. Anda akan segera mendapat balasan oleh tim kami melalui WhatsApp.',
      });
      setInquiryName('');
      setInquiryPhone('');
      setInquiryBusiness('');
      setInquiryMessage('');
    } catch (err: any) {
      setInquiryStatus({
        ok: false,
        text:
          err?.response?.data?.error ||
          'Gagal mengirim permintaan saat ini. Silakan coba beberapa saat lagi.',
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
    <div className="min-h-screen bg-[#f8fafc] text-[#0f172a] antialiased overflow-x-clip">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <a href="#" className="flex items-center gap-2.5 min-w-0">
            <ReneoCrmLogo className="w-8 h-8 shrink-0" />
            <div className="leading-tight min-w-0">
              <div className="text-sm font-bold text-slate-900 tracking-tight truncate">
                Reneo CRM
              </div>
              <div className="text-xs text-slate-500 hidden sm:block">
                Kelola Pelanggan &amp; Operasional Tim
              </div>
            </div>
          </a>

          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={`hover:text-slate-900 rounded-md px-1 py-1 transition-colors ${FOCUS_RING}`}
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onEnterLogin}
              className={`hidden sm:inline-flex h-11 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium items-center transition-colors ${FOCUS_RING}`}
            >
              {authenticated ? 'Buka Workspace' : initialized ? 'Masuk' : 'Lanjutkan Setup'}
            </button>
            <button
              type="button"
              onClick={authenticated ? onEnterLogin : handleRegister}
              className={`h-11 px-4 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-semibold inline-flex items-center gap-1.5 transition-colors ${FOCUS_RING}`}
            >
              <span>{authenticated ? 'Buka CRM' : 'Daftar Baru'}</span>
              <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigasi"
              aria-expanded={mobileMenuOpen}
              className={`lg:hidden h-11 w-11 rounded-lg border border-slate-200 bg-white text-slate-700 inline-flex items-center justify-center hover:bg-slate-50 ${FOCUS_RING}`}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav className="lg:hidden border-t border-slate-200 bg-white px-4 py-3.5 flex flex-col gap-1.5 text-sm shadow-sm">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2.5 rounded-lg text-slate-700 hover:bg-slate-100 font-medium"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-2.5 mt-1 border-t border-slate-100 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  if (authenticated) {
                    onEnterLogin();
                  } else {
                    handleRegister();
                  }
                }}
                className="h-11 px-4 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5"
              >
                <span>{authenticated ? 'Buka Workspace CRM' : 'Daftar Akun CRM Baru'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href={PANEL_ORDER_URL}
                target="_top"
                className="h-11 px-4 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm font-semibold inline-flex items-center justify-center gap-1.5"
              >
                <span>Order Hosting + CRM</span>
                <ArrowUpRight className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onEnterLogin();
                }}
                className="h-11 px-4 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium inline-flex items-center justify-center"
              >
                {authenticated
                  ? 'Buka Workspace CRM'
                  : initialized
                  ? 'Masuk ke Ruang Kerja'
                  : 'Lanjutkan Setup CRM'}
              </button>
            </div>
          </nav>
        )}
      </header>

      <main>
        {/* Hero Section */}
        <section className="bg-white border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
              <div className="lg:col-span-6 space-y-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-[#2563eb]">
                  Sistem CRM · Kelola Pelanggan, Bukan Hanya Percakapannya
                </div>

                <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight leading-tight">
                  Jangan Biarkan Pembeli Kabur Cuma Karena Chat Tercecer di Banyak HP
                </h1>

                <p className="text-base text-slate-600 leading-relaxed max-w-prose">
                  Satu sistem untuk mengelola komunikasi dari{' '}
                  <strong className="font-semibold text-slate-800">
                    Instagram, WhatsApp, Facebook, Threads, dan Telegram
                  </strong>{' '}
                  sekaligus data pelanggan, aktivitas tim, dan tindak lanjut dalam satu alur kerja.
                </p>

                <div className="space-y-3 pt-1">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <button
                      type="button"
                      onClick={authenticated ? onEnterLogin : handleRegister}
                      className={`min-h-[44px] py-2.5 px-6 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm sm:text-base font-semibold inline-flex items-center justify-center gap-2 transition-colors ${FOCUS_RING}`}
                    >
                      <span>{authenticated ? 'Buka Workspace CRM' : 'Daftar Akun CRM Baru'}</span>
                      <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                    <a
                      href={PANEL_ORDER_URL}
                      target="_top"
                      className={`min-h-[44px] py-2.5 px-5 rounded-lg bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-sm sm:text-base font-semibold inline-flex items-center justify-center gap-2 transition-colors ${FOCUS_RING}`}
                    >
                      <span>Order Hosting + CRM</span>
                      <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
                    </a>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-slate-500">
                    <span>Coba gratis 7 hari</span>
                    <span aria-hidden="true">·</span>
                    <span>Aktif dalam hitungan menit</span>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={onEnterLogin}
                      className={`text-[#2563eb] hover:text-[#1d4ed8] font-semibold underline underline-offset-2 rounded ${FOCUS_RING}`}
                    >
                      {authenticated ? 'Buka Workspace' : 'Sudah punya akun? Masuk'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Interactive Omnichannel Inbox Preview */}
              <div className="lg:col-span-6">
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  {/* Channel Switcher Bar */}
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700">
                        Simulasi Kotak Masuk Semua Kanal
                      </span>
                      <span className="text-xs text-slate-500">Klik kanal untuk melihat</span>
                    </div>
                    <div
                      role="tablist"
                      aria-label="Pilih kanal simulasi kotak masuk"
                      className="flex items-center gap-1.5 overflow-x-auto pb-0.5"
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
                            className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors inline-flex items-center gap-1.5 shrink-0 ${FOCUS_RING} ${
                              active
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                active ? 'bg-white' : ch.dotClass
                              }`}
                            />
                            <span>{ch.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Active Chat Preview */}
                  <div
                    key={activeHeroChannel.id}
                    className="p-4 sm:p-5 space-y-4 bg-white transition-opacity duration-300"
                  >
                    <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm sm:text-base font-bold text-slate-900 truncate">
                            {activeHeroChannel.customerName}
                          </span>
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-md border ${activeHeroChannel.badgeClass}`}
                          >
                            {activeHeroChannel.label}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {activeHeroChannel.customerSub}
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md shrink-0">
                        {activeHeroChannel.statusLabel}
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div className="bg-slate-100 text-slate-800 rounded-xl rounded-tl-xs px-3.5 py-2.5 text-sm leading-relaxed max-w-[92%]">
                        {activeHeroChannel.incoming}
                      </div>
                      <div className="bg-[#2563eb] text-white rounded-xl rounded-tr-xs px-3.5 py-2.5 text-sm leading-relaxed ml-auto max-w-[92%]">
                        {activeHeroChannel.outgoing}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center gap-2 text-xs sm:text-sm text-slate-600">
                      <CheckCircle2 className="w-4 h-4 text-[#2563eb] shrink-0" />
                      <span>{activeHeroChannel.footerNote}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Problem & Agitation Section */}
        <RevealSection id="masalah" className="bg-[#f8fafc] border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-8">
            <div className="max-w-3xl space-y-2.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-rose-600">
                Yang Sering Terjadi Tanpa Disadari
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-snug">
                Iklan Sudah Bagus, Produk Sudah Dicari — Tapi Penjualan Bocor di Tahap Balas Chat?
              </h2>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Banyak pemilik usaha mengira masalahnya ada di iklan atau harga, padahal calon pembeli batal transaksi hanya karena pengalaman membalas pesan yang lambat dan tidak terkoordinasi.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 rounded-2xl bg-white border border-slate-200 divide-y md:divide-y-0 md:divide-x divide-slate-200 overflow-hidden">
              {HIDDEN_COSTS.map((item) => (
                <div
                  key={item.title}
                  className="p-5 sm:p-6 space-y-2.5"
                >
                  <div className="text-xs font-bold uppercase tracking-wide text-rose-700">
                    {item.stat}
                  </div>
                  <h3 className="text-base font-bold text-slate-900 leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </RevealSection>

        {/* Authentic Origin Story Section — Vertical Storytelling */}
        <RevealSection id="kenapa-dibuat" className="bg-white border-b border-slate-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-14 sm:py-20 space-y-10">
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#2563eb]">
                Cerita di Balik Reneo CRM
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 tracking-tight leading-tight">
                Kenapa Kami Membuat Reneo CRM
              </h2>
              <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
                Reneo CRM tidak lahir hanya dari keinginan membuat aplikasi CRM baru. Produk ini berawal dari pengalaman kami sendiri dalam menjalankan operasional dan mengelola pelanggan setiap hari.
              </p>
            </div>

            <ol className="relative space-y-8 sm:space-y-10 before:content-[''] before:absolute before:left-[15px] sm:before:left-[19px] before:top-3 before:bottom-3 before:w-px before:bg-slate-200">
              {STORY_BEATS.map((story, idx) => {
                const isHighlightStep = idx === 3 || idx === 4;
                return (
                  <li key={story.number} className="relative pl-11 sm:pl-14">
                    <div
                      aria-hidden="true"
                      className={`absolute left-0 top-0.5 w-8 h-8 sm:w-10 sm:h-10 rounded-full border text-xs sm:text-sm font-bold font-mono flex items-center justify-center ${
                        isHighlightStep
                          ? 'bg-[#2563eb] border-[#2563eb] text-white'
                          : 'bg-white border-slate-300 text-slate-700'
                      }`}
                    >
                      {story.number}
                    </div>

                    <div className="space-y-2.5">
                      <h3 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">
                        {story.step}
                      </h3>
                      <div className="space-y-3 text-sm sm:text-base text-slate-600 leading-relaxed">
                        {story.paragraphs.map((paragraph) => (
                          <p key={paragraph}>{paragraph}</p>
                        ))}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>

            {/* Penekanan Utama */}
            <div className="rounded-xl border border-slate-200 border-l-4 border-l-[#2563eb] bg-slate-50 px-5 py-5 sm:px-7 sm:py-6 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#2563eb]">
                Penekanan Utama
              </div>
              <p className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">
                Bukan sekadar membalas pesan. Tetapi memastikan setiap pelanggan ditangani dengan baik.
              </p>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Kelola pelanggan, bukan hanya percakapannya — satu sistem untuk komunikasi, data pelanggan, aktivitas tim, dan tindak lanjut dalam satu alur kerja.
              </p>
            </div>
          </div>
        </RevealSection>

        {/* Interactive Module Explorer — Connected to Operational Problems */}
        <RevealSection id="modul" className="bg-[#f8fafc] border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-6">
            <div className="max-w-3xl space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-[#2563eb]">
                Cara Kerja Reneo CRM
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-snug">
                Dirancang untuk Menjawab Masalah Operasional Sehari-hari
              </h2>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Setiap fitur di Reneo CRM terhubung langsung dalam satu alur kerja: dari komunikasi terpusat, riwayat pelanggan, pembagian tugas lintas shift, tindak lanjut, hingga pemantauan aktivitas tim.
              </p>
            </div>

            {/* Mobile Horizontal Scrollable Pill Tabs */}
            <div
              role="tablist"
              aria-label="Pilih modul kerja Reneo CRM"
              className="flex lg:hidden items-center gap-2 overflow-x-auto pb-2 -mx-4 px-4 snap-x"
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
                    className={`snap-start shrink-0 min-h-[44px] px-3.5 py-2 rounded-lg border text-sm font-semibold inline-flex items-center gap-2 transition-colors ${FOCUS_RING} ${
                      active
                        ? 'bg-[#2563eb] text-white border-[#2563eb]'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                    <span>{tab.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Desktop Vertical Tabs */}
              <div
                role="tablist"
                aria-label="Daftar modul kerja Reneo CRM"
                className="hidden lg:flex lg:col-span-4 flex-col gap-2"
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
                      className={`w-full min-h-[52px] text-left px-4 py-3 rounded-xl border transition-colors flex items-center gap-3 ${FOCUS_RING} ${
                        active
                          ? 'bg-white border-[#2563eb] ring-1 ring-[#2563eb]/20'
                          : 'bg-white/70 border-slate-200 hover:bg-white hover:border-slate-300'
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          active
                            ? 'bg-[#2563eb] text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <Icon className="w-4 h-4" strokeWidth={1.75} />
                      </div>
                      <span
                        className={`text-sm font-semibold leading-snug ${
                          active ? 'text-slate-900' : 'text-slate-700'
                        }`}
                      >
                        {tab.shortLabel}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Active Module Detail Card */}
              <div
                key={activeModule.id}
                role="tabpanel"
                className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 sm:p-7 space-y-5"
              >
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-lg bg-blue-50 border border-blue-200 text-[#2563eb] flex items-center justify-center shrink-0">
                    <ActiveModuleIcon className="w-5 h-5" strokeWidth={1.75} />
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">
                      {activeModule.title}
                    </h3>
                    <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                      {activeModule.summary}
                    </p>
                  </div>
                </div>

                <ul className="space-y-3 pt-1">
                  {activeModule.highlights.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-sm sm:text-base text-slate-700 leading-relaxed"
                    >
                      <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" strokeWidth={1.75} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <div className="border-l-2 border-[#2563eb] pl-3.5 py-1 text-sm text-slate-700">
                  {activeModule.benefitNote}
                </div>
              </div>
            </div>
          </div>
        </RevealSection>

        {/* All Channels Grid — Omnichannel as a CRM Capability */}
        <RevealSection id="kanal" className="bg-white border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-7">
            <div className="max-w-3xl space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-[#2563eb]">
                Kemampuan Omnichannel dalam Reneo CRM
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-snug">
                Semua Kanal Komunikasi Terhubung Langsung ke Alur Pengelolaan Pelanggan
              </h2>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Menyatukan pesan hanyalah awal. Setiap percakapan dari kanal yang pelanggan pilih langsung masuk ke riwayat kontak, pembagian tugas tim, dan tindak lanjut di Reneo CRM.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {CHANNELS.map((ch) => (
                <div
                  key={ch.name}
                  className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition-colors space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-slate-900">{ch.name}</h3>
                    <span
                      className={`text-xs font-semibold px-2.5 py-0.5 rounded-md border ${ch.badge}`}
                    >
                      {ch.role}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">{ch.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </RevealSection>

        {/* Honest Comparison */}
        <RevealSection id="perbandingan" className="bg-[#f8fafc] border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-7">
            <div className="max-w-2xl space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-[#2563eb]">
                Bandingkan Sebelum Memilih
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-snug">
                Cara Lama vs Aplikasi Chat Umum vs Reneo CRM
              </h2>
            </div>

            {/* Mobile Stacked Comparison Cards */}
            <div className="space-y-3.5 md:hidden">
              {COMPARISON_ROWS.map((row) => (
                <div
                  key={row.aspect}
                  className="rounded-2xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-200 text-sm"
                >
                  <div className="px-4 py-3 bg-slate-50 font-bold text-slate-900">
                    {row.aspect}
                  </div>
                  <div className="px-4 py-3 space-y-1">
                    <div className="text-xs font-semibold text-slate-500">Cara Lama (Banyak HP)</div>
                    <p className="text-slate-600 leading-relaxed">{row.manual}</p>
                  </div>
                  <div className="px-4 py-3 space-y-1">
                    <div className="text-xs font-semibold text-slate-500">Aplikasi Chat Umum</div>
                    <p className="text-slate-600 leading-relaxed">{row.other}</p>
                  </div>
                  <div className="px-4 py-3 space-y-1 bg-blue-50/40">
                    <div className="text-xs font-bold text-[#1d4ed8]">Reneo CRM</div>
                    <p className="text-slate-900 font-medium leading-relaxed">{row.reneo}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Comparison Table */}
            <div className="hidden md:block border border-slate-200 rounded-2xl bg-white overflow-x-auto">
              <table className="w-full min-w-[700px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-sm font-bold text-slate-800">
                    <th className="py-3.5 px-5 w-[24%]">Aspek Penting</th>
                    <th className="py-3.5 px-5 w-[24%]">Cara Lama</th>
                    <th className="py-3.5 px-5 w-[24%]">Aplikasi Chat Umum</th>
                    <th className="py-3.5 px-5 w-[28%] text-[#1d4ed8] bg-blue-50/50">Reneo CRM</th>
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
        </RevealSection>

        {/* FAQ */}
        <RevealSection id="faq" className="bg-white border-b border-slate-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-6">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-[#2563eb]">
                Pertanyaan Umum
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-snug">
                Masih Ragu? Ini Jawaban yang Paling Sering Ditanyakan
              </h2>
            </div>

            <div className="divide-y divide-slate-200 border border-slate-200 rounded-2xl bg-white overflow-hidden">
              {FAQS.map((item, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div key={item.q}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      className={`w-full min-h-[52px] px-5 py-4 text-left flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors ${FOCUS_RING}`}
                    >
                      <span className="text-sm sm:text-base font-semibold text-slate-900">
                        {item.q}
                      </span>
                      <ChevronDown
                        className={`w-5 h-5 text-slate-500 shrink-0 transition-transform duration-200 ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-4 text-sm sm:text-base text-slate-600 leading-relaxed">
                        {item.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </RevealSection>

        {/* Custom Feature / Program Asset Inquiry Form */}
        <RevealSection id="hubungi-kami" className="bg-[#f8fafc] border-b border-slate-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-6">
            <div className="max-w-2xl space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-[#2563eb]">
                Kebutuhan Khusus &amp; Aset Program
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-snug">
                Ingin Tambah Fitur Khusus atau Beli Aset Program? Hubungi Kami
              </h2>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Butuh penyesuaian alur kerja khusus untuk perusahaan Anda, integrasi tambahan, atau ingin memiliki aset program secara penuh? Kirim detail kebutuhan Anda di bawah ini — tim kami akan langsung menghubungi Anda lewat WhatsApp.
              </p>
            </div>

            <form
              onSubmit={handleInquirySubmit}
              className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7 space-y-5 shadow-xs"
            >
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-800">
                  Kebutuhan Anda
                </label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      'Tambah Fitur Khusus',
                      'Beli Aset Program',
                      'Konsultasi & Implementasi',
                    ] as const
                  ).map((opt) => {
                    const selected = inquiryType === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setInquiryType(opt)}
                        className={`min-h-[44px] px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold border transition-colors ${FOCUS_RING} ${
                          selected
                            ? 'bg-[#2563eb] text-white border-[#2563eb]'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="inquiry-name" className="block text-sm font-semibold text-slate-800">
                    Nama Lengkap <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="inquiry-name"
                    type="text"
                    required
                    value={inquiryName}
                    onChange={(e) => setInquiryName(e.target.value)}
                    placeholder="Contoh: Budi Santoso"
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-[#2563eb]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="inquiry-phone" className="block text-sm font-semibold text-slate-800">
                    Nomor WhatsApp Aktif <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="inquiry-phone"
                    type="tel"
                    required
                    value={inquiryPhone}
                    onChange={(e) => setInquiryPhone(e.target.value)}
                    placeholder="081234567890"
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-sm font-mono text-slate-900 focus:outline-none focus:border-[#2563eb]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="inquiry-business" className="block text-sm font-semibold text-slate-800">
                  Nama Usaha / Perusahaan <span className="text-xs font-normal text-slate-400">(Opsional)</span>
                </label>
                <input
                  id="inquiry-business"
                  type="text"
                  value={inquiryBusiness}
                  onChange={(e) => setInquiryBusiness(e.target.value)}
                  placeholder="Contoh: Toko Clarice Official / PT Maju Bersama"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-[#2563eb]"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="inquiry-message" className="block text-sm font-semibold text-slate-800">
                  Ceritakan Kebutuhan Anda <span className="text-rose-600">*</span>
                </label>
                <textarea
                  id="inquiry-message"
                  rows={4}
                  required
                  value={inquiryMessage}
                  onChange={(e) => setInquiryMessage(e.target.value)}
                  placeholder="Contoh: Kami ingin menambah laporan khusus cabang atau ingin menanyakan pembelian aset program penuh..."
                  className="w-full p-3.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-[#2563eb]"
                />
              </div>

              {inquiryStatus && (
                <div
                  className={`p-4 rounded-xl border text-sm font-medium flex items-start gap-2.5 ${
                    inquiryStatus.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {inquiryStatus.ok ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <span>{inquiryStatus.text}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <span className="text-xs sm:text-sm text-slate-500">
                  Pesan langsung diteruskan ke tim kami dan Anda akan menerima konfirmasi di WhatsApp.
                </span>
                <button
                  type="submit"
                  disabled={inquirySubmitting}
                  className="min-h-[46px] px-6 py-2.5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white text-sm sm:text-base font-semibold inline-flex items-center justify-center gap-2 transition-colors shrink-0"
                >
                  <span>{inquirySubmitting ? 'Mengirim...' : 'Kirim Permintaan'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </RevealSection>

        {/* Final CTA — 2 Jalur Order CRM */}
        <RevealSection className="bg-slate-900 text-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-16 space-y-8">
            <div className="text-center space-y-3 max-w-3xl mx-auto">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-300">
                Pilih Cara Mulai yang Sesuai Usaha Anda
              </div>

              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight leading-snug">
                Mulai Kelola Pelanggan dan Pekerjaan Tim Secara Lebih Terstruktur Hari Ini
              </h2>

              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                Rasakan langsung bagaimana satu ruang kerja Reneo CRM menjaga komunikasi, riwayat pelanggan, pembagian shift, dan tindak lanjut tetap terhubung.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              <div className="rounded-xl border border-white/15 bg-white/5 p-5 sm:p-6 flex flex-col justify-between gap-5">
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-blue-300">
                    Opsi 1 · Langsung Pakai
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-white">
                    Daftar Akun CRM Baru
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Buat ruang kerja usaha Anda sekarang juga dan mulai masa uji coba gratis 7 hari tanpa perlu menyiapkan hosting sendiri.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={authenticated ? onEnterLogin : handleRegister}
                  className={`min-h-[44px] py-2.5 px-5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm sm:text-base font-semibold inline-flex items-center justify-center gap-2 transition-colors ${FOCUS_RING}`}
                >
                  <span>{authenticated ? 'Buka Workspace CRM' : 'Daftar Akun CRM Baru'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="rounded-xl border border-white/15 bg-white/5 p-5 sm:p-6 flex flex-col justify-between gap-5">
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                    Opsi 2 · Paket Lengkap
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-white">
                    Order Hosting + CRM
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Pesan paket hosting Reneo sekaligus aktifkan lisensi Reneo CRM dalam satu pesanan yang terkelola dari panel utama.
                  </p>
                </div>
                <a
                  href={PANEL_ORDER_URL}
                  target="_top"
                  className={`min-h-[44px] py-2.5 px-5 rounded-lg bg-white/10 hover:bg-white/15 text-white border border-white/25 text-sm sm:text-base font-semibold inline-flex items-center justify-center gap-2 transition-colors ${FOCUS_RING}`}
                >
                  <span>Order Hosting + CRM</span>
                  <ArrowUpRight className="w-4 h-4" />
                </a>
              </div>
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={onEnterLogin}
                className={`text-sm text-slate-300 hover:text-white underline underline-offset-4 rounded px-2 py-1 transition-colors ${FOCUS_RING}`}
              >
                {authenticated
                  ? 'Sudah masuk · Buka Workspace CRM'
                  : initialized
                  ? 'Sudah punya akun CRM? Masuk ke Ruang Kerja'
                  : 'Lanjutkan Setup CRM'}
              </button>
            </div>
          </div>
        </RevealSection>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs sm:text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <ReneoCrmLogo className="w-6 h-6 shrink-0" />
            <span className="font-semibold text-slate-800">Reneo CRM</span>
            <span>· Kelola Pelanggan &amp; Operasional Tim</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <a href={PANEL_URL} target="_top" className="hover:text-slate-800 transition-colors">
              Reneo Panel
            </a>
            <a
              href={PANEL_INSTALL_URL}
              target="_top"
              className="hover:text-slate-800 transition-colors"
            >
              Panduan Pemasangan
            </a>
            <a
              href={PANEL_ORDER_URL}
              target="_top"
              className="hover:text-slate-800 transition-colors"
            >
              Paket &amp; Harga
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
