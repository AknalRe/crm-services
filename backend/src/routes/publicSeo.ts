import fs from 'fs';
import path from 'path';
import axios from 'axios';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const PANEL_URL = 'https://panel.reneo.my.id';
const PANEL_INSTALL_URL = 'https://panel.reneo.my.id/install';
const PANEL_ORDER_URL = 'https://panel.reneo.my.id/order?addon=reneo-crm';
const DOCKER_IMAGE = 'ghcr.io/aknalre/crm-services';

export const CRM_SEO_META = {
  name: 'Reneo CRM',
  fullTitle: 'Reneo CRM — Layanan Pelanggan Terpadu untuk Instagram, WhatsApp & Media Sosial',
  description:
    'Reneo CRM menyatukan pesan pelanggan dari Instagram, WhatsApp, Facebook, Threads, dan Telegram dalam satu kotak masuk bersama tim CS. Dilengkapi pembagian peran staf, filter chat non-pelanggan agar laporan SLA & kepuasan tetap akurat, promo terjadwal, dan asisten balasan otomatis.',
  keywords:
    'Reneo CRM, CRM omnichannel Indonesia, layanan pelanggan terpadu, kotak masuk Instagram WhatsApp Facebook Threads Telegram, aplikasi CS toko online, laporan SLA dan kepuasan pelanggan',
};

const CRM_STORY_BEATS = [
  {
    step: 'Kami pernah mengalami',
    text: 'Pesan pembeli tersebar di banyak HP admin dan akun media sosial; saat staf berganti shift atau HP bermasalah, riwayat obrolan terputus, sementara chat kurir, supplier, dan grup kantor bercampur dengan chat pembeli.',
  },
  {
    step: 'Kami menyadari',
    text: 'Masalah itu bukan hal sepele: begitu pesan makin ramai, pembeli menunggu terlalu lama lalu pindah ke toko lain, tim menanyakan hal yang sama berulang kali, dan pemilik usaha tidak bisa melihat laporan kecepatan respon yang jujur.',
  },
  {
    step: 'Kami merasa',
    text: 'Aplikasi lain yang kami coba terasa belum pas untuk operasional harian — biayanya cepat membengkak setiap kali tambah admin atau chat makin ramai, data pelanggan tidak sepenuhnya kami pegang, dan chat non-pelanggan masih mengacaukan laporan tim.',
  },
  {
    step: 'Karena itu, kami membuat Reneo CRM',
    text: 'Satu ruang kerja layanan pelanggan yang lahir langsung dari alur kerja nyata tim kami sendiri setiap hari — untuk menyatukan Instagram, WhatsApp, Facebook, Threads, dan Telegram dalam satu layar yang rapi.',
  },
  {
    step: 'Tujuan kami',
    text: 'Membuat pengelolaan chat pelanggan, pembagian tugas tim, riwayat percakapan, dan penilaian kualitas layanan yang dulunya melelahkan menjadi jauh lebih tenang, terukur, dan mudah dijalankan setiap hari.',
  },
];

const CRM_WHY_WE_BUILT_IT = [
  {
    title: 'Chat tersebar di banyak HP admin, lalu hilang saat staf berganti',
    detail:
      'Tiap admin memegang perangkat sendiri untuk melayani banyak nomor WhatsApp dan akun media sosial. Begitu admin shift berganti atau staf keluar, riwayat chat lama terputus dan pembeli harus mengulang penjelasan dari awal.',
  },
  {
    title: 'Chat internal, kurir, dan grup kantor mengacaukan laporan kecepatan tim',
    detail:
      'Nomor CS harian juga menerima pesan dari kurir, supplier, staf internal, dan grup operasional. Di alat lain, semua ikut masuk hitungan keterlambatan respon dan malah menerima survei kepuasan.',
  },
  {
    title: 'Sulit memisahkan batas sesi tanpa memutus riwayat pelanggan',
    detail:
      'Pelanggan lama sering kembali memesan atau bertanya di minggu berikutnya. Riwayat percakapan tetap harus utuh dalam satu utas, tetapi setiap siklus penanganan perlu penanda batas mulai dan selesai sesi serta penilaian kepuasan tersendiri.',
  },
  {
    title: 'Biaya membengkak saat tim tumbuh dan data pelanggan tidak dipegang penuh',
    detail:
      'Saat tim CS bertambah, biaya kursi dan biaya per pesan ikut melonjak, sementara data pelanggan bergantung pada pihak luar. Reneo CRM dirancang dengan paket yang jelas dan kepemilikan data 100% di tangan usaha Anda.',
  },
];

const CRM_USE_CASES = [
  {
    segment: 'Toko Online & Banyak Kanal Penjualan',
    problem: 'Chat dari Instagram, WhatsApp cabang, dan Facebook tercampur sehingga pembeli sering terlewat atau dibalas dobel.',
    solution: 'Semua kanal masuk ke satu kotak masuk rapi namun tetap terpisah jelas berdasarkan asal kanal & profil pelanggan.',
  },
  {
    segment: 'Tim Multi-CS dengan Kebutuhan Kontrol Ketat',
    problem: 'Staf baru berisiko menghapus kontak, mengunduh daftar pelanggan, atau membuka obrolan agen lain.',
    solution: 'Pembagian peran staf mengatur izin akses per menu dan aksi agar data pelanggan tetap aman.',
  },
  {
    segment: 'Grup Kantor & Chat Kurir Mengacaukan Laporan',
    problem: 'Pesan grup operasional, kurir, atau vendor merusak laporan kecepatan respon dan memicu survei kepuasan.',
    solution: 'Grup dan kontak non-pelanggan bisa ditandai Non-Penilaian sekali agar otomatis dikecualikan dari laporan SLA & survei.',
  },
];

const CRM_CHANNELS = [
  { name: 'Instagram', mode: 'DM, Feed & Komentar', detail: 'Balas Direct Message, jadwalkan unggahan, dan ubah komentar iklan atau postingan langsung jadi obrolan penjualan.' },
  { name: 'WhatsApp', mode: 'Multi-Nomor, Bisnis & Story', detail: 'Satukan banyak nomor WhatsApp cabang dan tim CS dalam satu layar bersama, lengkap dengan jadwal promo dan Story.' },
  { name: 'Facebook Messenger & Page', mode: 'Pesan Halaman & Komentar', detail: 'Kelola pesan masuk halaman bisnis, jadwal konten, serta interaksi komentar dalam satu kotak masuk.' },
  { name: 'Threads', mode: 'Utas & Interaksi', detail: 'Jadwalkan utas rutin dan pantau interaksi audiens merek Anda bersama kanal komunikasi lainnya.' },
  { name: 'Telegram', mode: 'Pesan Pelanggan & Channel', detail: 'Layani pertanyaan pembeli, mitra, atau reseller melalui Telegram langsung dari kotak masuk utama.' },
];

const CRM_CAPABILITIES = [
  {
    title: 'Satu Kotak Masuk untuk Semua Kanal',
    detail: 'Satukan pesan dari Instagram, WhatsApp, Facebook, Threads, dan Telegram di satu layar tanpa perlu gonta-ganti HP atau aplikasi.',
  },
  {
    title: 'Pembagian Tugas & Kontrol Akses Tim CS',
    detail: 'Atur staf mana yang bisa melihat semua chat atau hanya miliknya, batasi ekspor data pelanggan, dan jaga riwayat tetap aman saat pergantian shift.',
  },
  {
    title: 'Laporan Kecepatan Respon & Survei Kepuasan yang Jujur',
    detail: 'Pantau kecepatan balas tim dan rating pelanggan per sesi, sambil mengecualikan grup kantor, kurir, atau vendor agar angka laporan tetap akurat.',
  },
  {
    title: 'Siaran Promo Terjadwal & Katalog Produk Siap Kirim',
    detail: 'Kirim info promo ke pelanggan lama dengan jeda kirim yang aman, dan bagikan harga serta detail produk dalam sekali klik.',
  },
  {
    title: 'Asisten Balasan Otomatis 24 Jam',
    detail: 'Bantu menjawab pertanyaan umum pembeli di luar jam kerja berdasarkan panduan produk usaha Anda, lalu teruskan ke tim CS bila diperlukan.',
  },
];

const CRM_COMPARISON = [
  {
    aspect: 'Mengelola banyak kanal sekaligus',
    manual: 'Buka HP dan aplikasi satu per satu, chat mudah terlewat',
    saas: 'Tersedia, tetapi sering dibatasi kuota kanal & biaya tambah admin tinggi',
    reneo: 'Instagram, WhatsApp, Facebook, Threads & Telegram menyatu di satu layar',
  },
  {
    aspect: 'Keamanan & kepemilikan data pelanggan',
    manual: 'Rawan hilang saat HP rusak atau staf keluar',
    saas: 'Data tersimpan di tempat penyedia luar',
    reneo: 'Data pelanggan tersimpan aman di ruang milik usaha Anda sendiri',
  },
  {
    aspect: 'Kebersihan laporan kecepatan & kepuasan CS',
    manual: 'Harus rekap manual dan sulit objektif',
    saas: 'Chat kurir, vendor, atau grup kantor ikut mengacaukan angka laporan',
    reneo: 'Bisa menandai chat non-pelanggan agar laporan SLA & kepuasan tetap akurat',
  },
  {
    aspect: 'Pengeluaran saat tim & chat bertambah',
    manual: 'Harus beli HP tambahan untuk tiap admin baru',
    saas: 'Biaya berlipat mengikuti jumlah admin dan jumlah pesan',
    reneo: 'Paket jelas & terjangkau tanpa biaya tambahan per pesan dari panel',
  },
];

const CRM_FAQS = [
  {
    q: 'Apakah saya harus mengerti hal teknis untuk mulai memakai Reneo CRM?',
    a: 'Tidak perlu. Anda bisa langsung mendaftar akun CRM baru untuk segera mencoba gratis 7 hari, atau memesan paket Hosting + CRM siap pakai.',
  },
  {
    q: 'Apakah Reneo CRM hanya untuk WhatsApp saja?',
    a: 'Tidak. Reneo CRM dirancang untuk menyatukan seluruh percakapan pelanggan Anda — mulai dari Instagram DM & komentar, Facebook Messenger, Threads, Telegram, hingga banyak nomor WhatsApp dalam satu ruang kerja.',
  },
  {
    q: 'Apakah riwayat chat pelanggan aman jika ada admin yang berganti shift atau resign?',
    a: 'Ya. Seluruh riwayat percakapan, catatan internal, dan profil pelanggan tersimpan terpusat. Anda cukup mengganti akses staf tanpa pernah kehilangan riwayat obrolan lama.',
  },
  {
    q: 'Bagaimana jika nomor CS juga sering dipakai untuk chat kurir atau grup kantor?',
    a: 'Anda dapat menandai kontak tertentu maupun grup kantor sebagai Non-Penilaian. Obrolan tetap bisa dibalas seperti biasa, tetapi tidak akan mengganggu laporan kecepatan respon dan tidak dikirimi survei kepuasan.',
  },
  {
    q: 'Bagaimana cara mulai berlangganan atau memesan Reneo CRM?',
    a: `Ada 2 pilihan mudah: (1) Daftar Akun CRM Baru langsung di halaman masuk untuk mulai coba gratis 7 hari, atau (2) Order Hosting + CRM melalui ${PANEL_ORDER_URL}.`,
  },
];

let cachedIndexTemplate: string | null | undefined;

function readBuiltIndexTemplate(): string | null {
  if (cachedIndexTemplate !== undefined) return cachedIndexTemplate;
  const candidates = [
    '/usr/share/nginx/html/index.html',
    path.resolve(process.cwd(), '../frontend/dist/index.html'),
    path.resolve(process.cwd(), 'frontend/dist/index.html'),
  ];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        cachedIndexTemplate = fs.readFileSync(filePath, 'utf-8');
        return cachedIndexTemplate;
      }
    } catch {
      // Ignore missing filesystem path
    }
  }
  cachedIndexTemplate = null;
  return null;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstHeader(value: string | string[] | undefined): string {
  if (!value) return '';
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw || '').split(',')[0].trim();
}

export function resolvePublicOriginAndBase(req: FastifyRequest): {
  origin: string;
  baseUrl: string;
  prefix: string;
} {
  const fwdHost = firstHeader(req.headers['x-forwarded-host']) || firstHeader(req.headers.host) || 'panel.reneo.my.id';
  const rawProto = firstHeader(req.headers['x-forwarded-proto']);
  const proto =
    rawProto === 'http' || rawProto === 'https'
      ? rawProto
      : /^(localhost|127\.0\.0\.1)(:|$)/i.test(fwdHost)
        ? 'http'
        : 'https';
  const rawPrefix = firstHeader(req.headers['x-forwarded-prefix']);
  let prefix = rawPrefix.replace(/\/+$/, '');
  if (prefix && !prefix.startsWith('/')) {
    prefix = `/${prefix}`;
  }
  const origin = `${proto}://${fwdHost}`;
  const baseUrl = prefix ? `${origin}${prefix}` : origin;
  return { origin, baseUrl, prefix };
}

function buildJsonLd(baseUrl: string): Record<string, unknown> {
  const rootUrl = `${baseUrl}/`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${PANEL_URL}/#organization`,
        name: 'Reneo',
        url: PANEL_URL,
        sameAs: ['https://github.com/friskipradana/y-panel'],
      },
      {
        '@type': 'WebSite',
        '@id': `${rootUrl}#website`,
        name: CRM_SEO_META.name,
        url: rootUrl,
        inLanguage: 'id-ID',
        publisher: { '@id': `${PANEL_URL}/#organization` },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${rootUrl}#software`,
        name: CRM_SEO_META.name,
        alternateName: 'Reneo CRM Omnichannel Services',
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Customer Relationship Management (CRM)',
        operatingSystem: 'Linux, Docker, Web',
        softwareRequirements: 'Docker, PostgreSQL, Redis, WAHA (opsional)',
        url: rootUrl,
        description: CRM_SEO_META.description,
        featureList: CRM_CAPABILITIES.map((c) => `${c.title}: ${c.detail}`),
        offers: {
          '@type': 'Offer',
          url: PANEL_ORDER_URL,
          availability: 'https://schema.org/OnlineOnly',
          priceCurrency: 'IDR',
        },
        publisher: { '@id': `${PANEL_URL}/#organization` },
      },
      {
        '@type': 'FAQPage',
        '@id': `${rootUrl}#faq`,
        mainEntity: CRM_FAQS.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.a,
          },
        })),
      },
    ],
  };
}

function buildSemanticHtmlBody(baseUrl: string): string {
  const rootUrl = `${baseUrl}/`;
  const landingUrl = `${baseUrl}/landing`;
  const storyHtml = CRM_STORY_BEATS.map(
    (s) => `<li><strong>${escapeHtml(s.step)}:</strong> ${escapeHtml(s.text)}</li>`
  ).join('\n');
  const whyHtml = CRM_WHY_WE_BUILT_IT.map(
    (w, i) => `<li><h3>0${i + 1}. ${escapeHtml(w.title)}</h3><p>${escapeHtml(w.detail)}</p></li>`
  ).join('\n');
  const channelsHtml = CRM_CHANNELS.map(
    (ch) => `<li><strong>${escapeHtml(ch.name)}</strong> (${escapeHtml(ch.mode)}): ${escapeHtml(ch.detail)}</li>`
  ).join('\n');
  const capsHtml = CRM_CAPABILITIES.map(
    (cap) => `<li><h3>${escapeHtml(cap.title)}</h3><p>${escapeHtml(cap.detail)}</p></li>`
  ).join('\n');
  const useCasesHtml = CRM_USE_CASES.map(
    (u) => `<tr><td>${escapeHtml(u.segment)}</td><td>${escapeHtml(u.problem)}</td><td>${escapeHtml(u.solution)}</td></tr>`
  ).join('\n');
  const compHtml = CRM_COMPARISON.map(
    (row) =>
      `<tr><td>${escapeHtml(row.aspect)}</td><td>${escapeHtml(row.manual)}</td><td>${escapeHtml(row.saas)}</td><td>${escapeHtml(row.reneo)}</td></tr>`
  ).join('\n');
  const faqHtml = CRM_FAQS.map(
    (f) => `<article><h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(f.a)}</p></article>`
  ).join('\n');

  return `<main style="max-width:960px;margin:0 auto;padding:32px 20px;font-family:Inter,system-ui,-apple-system,sans-serif;line-height:1.6;color:#0f172a">
  <header>
    <p><strong>${escapeHtml(CRM_SEO_META.name)}</strong> · Instagram · WhatsApp · Facebook · Threads · Telegram</p>
    <h1>Jangan Biarkan Pembeli Kabur Cuma Karena Chat Tercecer di Banyak HP</h1>
    <p>${escapeHtml(CRM_SEO_META.description)}</p>
    <nav aria-label="Tautan Penting">
      <a href="${escapeHtml(rootUrl)}">Beranda</a> ·
      <a href="${escapeHtml(baseUrl)}/login">Daftar Akun CRM Baru / Masuk</a> ·
      <a href="${escapeHtml(PANEL_ORDER_URL)}">Order Hosting + CRM</a> ·
      <a href="${escapeHtml(baseUrl)}/llms.txt">Ringkasan AI (llms.txt)</a>
    </nav>
  </header>
  <section id="kenapa-dibuat">
    <h2>Kenapa Kami Membuat Reneo CRM</h2>
    <p>Reneo CRM tidak dibuat karena sekadar ingin meluncurkan software baru, melainkan lahir dari pengalaman nyata tim kami sendiri saat melayani pelanggan setiap hari.</p>
    <ul>${storyHtml}</ul>
    <ul>${whyHtml}</ul>
  </section>
  <section id="modul">
    <h2>Cara Kerja Reneo CRM</h2>
    <ul>${capsHtml}</ul>
  </section>
  <section id="studi-kasus">
    <h2>Masalah Harian Tim CS &amp; Cara Menanganinya</h2>
    <table>
      <thead><tr><th>Jenis Usaha</th><th>Kendala Sebelum Memakai CRM</th><th>Penanganan di Reneo CRM</th></tr></thead>
      <tbody>${useCasesHtml}</tbody>
    </table>
  </section>
  <section id="kanal">
    <h2>Semua Kanal Komunikasi Terhubung</h2>
    <ul>${channelsHtml}</ul>
  </section>
  <section id="perbandingan">
    <h2>Perbandingan Cara Manual vs Aplikasi Lain vs Reneo CRM</h2>
    <table>
      <thead><tr><th>Aspek</th><th>Manual</th><th>Aplikasi Lain</th><th>Reneo CRM</th></tr></thead>
      <tbody>${compHtml}</tbody>
    </table>
  </section>
  <section id="aktivasi">
    <h2>2 Cara Mulai Memakai Reneo CRM</h2>
    <ol>
      <li><strong>Daftar Akun CRM Baru</strong>: Buat ruang kerja usaha Anda langsung di <a href="${escapeHtml(baseUrl)}/login">${escapeHtml(baseUrl)}/login</a> dan mulai uji coba gratis 7 hari.</li>
      <li><strong>Order Hosting + CRM</strong>: Pesan paket Hosting + Reneo CRM sekaligus di <a href="${escapeHtml(PANEL_ORDER_URL)}">${escapeHtml(PANEL_ORDER_URL)}</a>.</li>
    </ol>
  </section>
  <section id="faq">
    <h2>Pertanyaan Umum (FAQ)</h2>
    ${faqHtml}
  </section>
  <footer>
    <p>Bagian dari <a href="${escapeHtml(PANEL_URL)}">Reneo Panel</a> · Layanan Pelanggan Terpadu</p>
  </footer>
</main>`;
}

function renderLandingHtmlDocument(req: FastifyRequest): string {
  const { baseUrl } = resolvePublicOriginAndBase(req);
  const canonicalUrl = `${baseUrl}/`;
  const llmsUrl = `${baseUrl}/llms.txt`;
  const logoUrl = `${baseUrl}/logo.svg`;
  const jsonLd = JSON.stringify(buildJsonLd(baseUrl)).replace(/<\//g, '<\\/');
  const semanticBody = buildSemanticHtmlBody(baseUrl);

  const extraHead = `
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
    <meta name="googlebot" content="index, follow" />
    <meta name="keywords" content="${escapeHtml(CRM_SEO_META.keywords)}" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <link rel="alternate" type="text/markdown" title="AI Product Briefing (llms.txt)" href="${escapeHtml(llmsUrl)}" />
    <meta property="og:site_name" content="${escapeHtml(CRM_SEO_META.name)}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:image" content="${escapeHtml(logoUrl)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(CRM_SEO_META.fullTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(CRM_SEO_META.description)}" />
    <script type="application/ld+json">${jsonLd}</script>`;

  const builtHtml = readBuiltIndexTemplate();
  if (builtHtml) {
    let html = builtHtml;
    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(CRM_SEO_META.fullTitle)}</title>`);
    html = html.replace(
      /<meta\s+name="description"\s+content="[\s\S]*?"\s*\/?>/i,
      `<meta name="description" content="${escapeHtml(CRM_SEO_META.description)}" />`
    );
    html = html.replace(
      /<meta\s+property="og:title"\s+content="[\s\S]*?"\s*\/?>/i,
      `<meta property="og:title" content="${escapeHtml(CRM_SEO_META.fullTitle)}" />`
    );
    html = html.replace(
      /<meta\s+property="og:description"\s+content="[\s\S]*?"\s*\/?>/i,
      `<meta property="og:description" content="${escapeHtml(CRM_SEO_META.description)}" />`
    );
    // Strip static tags from index.html that are already emitted cleanly in extraHead
    html = html
      .replace(/<meta\s+name="(?:keywords|robots|googlebot)"[^>]*>\s*/gi, '')
      .replace(/<link\s+rel="(?:canonical|alternate)"[^>]*>\s*/gi, '')
      .replace(/<meta\s+property="og:(?:site_name|url|image)"[^>]*>\s*/gi, '')
      .replace(/<meta\s+name="twitter:[^"]*"[^>]*>\s*/gi, '')
      .replace(/<script\s+type="application\/ld\+json">[\s\S]*?<\/script>\s*/gi, '');
    html = html.replace('</head>', `${extraHead}\n  </head>`);
    if (/<div id="root"><\/div>/i.test(html)) {
      html = html.replace(/<div id="root"><\/div>/i, `<div id="root">${semanticBody}</div>`);
    } else if (/<div id="root">[\s\S]*?<\/div>/i.test(html)) {
      html = html.replace(/<div id="root">[\s\S]*?<\/div>/i, `<div id="root">${semanticBody}</div>`);
    }
    return html;
  }

  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(CRM_SEO_META.fullTitle)}</title>
    <meta name="description" content="${escapeHtml(CRM_SEO_META.description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(CRM_SEO_META.fullTitle)}" />
    <meta property="og:description" content="${escapeHtml(CRM_SEO_META.description)}" />${extraHead}
  </head>
  <body class="bg-slate-50 text-slate-900 antialiased">
    <div id="root">${semanticBody}</div>
  </body>
</html>`;
}

function buildLlmsTxt(baseUrl: string, full: boolean): string {
  const lines: string[] = [
    `# ${CRM_SEO_META.name}`,
    '',
    `> ${CRM_SEO_META.description}`,
    '',
    '## Ringkasan Produk & Identitas Resmi',
    `- Nama Produk: ${CRM_SEO_META.name} (Reneo CRM Omnichannel Services)`,
    `- URL Halaman Utama: ${baseUrl}/`,
    `- Halaman Profil Produk (Compro): ${baseUrl}/landing`,
    `- Panel Manajemen Server: ${PANEL_URL}`,
    `- Pemesanan Hosting + CRM (Trial 7 Hari): ${PANEL_ORDER_URL}`,
    `- Instalasi Self-Hosted di Server Linux: ${PANEL_INSTALL_URL}`,
    `- Registry Container Resmi: ${DOCKER_IMAGE}`,
    '',
    '## Susunan Section Halaman Landing (/landing)',
    '1. Hero & Pratinjau Kotak Masuk (judul, 2 CTA order/self-hosted, mockup antrean chat & Batas Mulai/Selesai Sesi, 4 kartu ringkasan teknis)',
    '2. Kenapa Kami Membuat Reneo CRM (latar belakang masalah nyata tim CS & toko online)',
    '3. Modul Kerja & Arsitektur Sistem CRM (5 tab interaktif: Inbox 6 Kanal, Role Multi-CS, SLA & CSAT Multi-Sesi, Siaran & WA Story, Agent AI & MCP)',
    '4. Masalah Harian Tim CS & Cara Menanganinya (studi kasus lapangan)',
    '5. 6 Kanal Komunikasi Terhubung',
    '6. Perbandingan: Cara Manual vs CRM Cloud Lain vs Reneo CRM',
    '7. Mulai Beroperasi dalam 3 Langkah',
    '8. Pertanyaan Umum (FAQ) & CTA Penutup',
    '',
    '## Kenapa Kami Membuat Reneo CRM',
    ...CRM_STORY_BEATS.map((s) => `- **${s.step}**: ${s.text}`),
    '',
    ...CRM_WHY_WE_BUILT_IT.map((w) => `- **${w.title}**: ${w.detail}`),
    '',
    '## Kanal Komunikasi yang Didukung',
    ...CRM_CHANNELS.map((c) => `- **${c.name}** (${c.mode}): ${c.detail}`),
    '',
    '## Fitur Utama & Kapabilitas',
    ...CRM_CAPABILITIES.map((c) => `- **${c.title}**: ${c.detail}`),
  ];

  if (full) {
    lines.push(
      '',
      '## Perbandingan: Manual vs CRM Cloud Lain vs Reneo CRM',
      '| Kebutuhan | Cara Manual | CRM Cloud Lain | Reneo CRM |',
      '| --- | --- | --- | --- |',
      ...CRM_COMPARISON.map((r) => `| ${r.aspect} | ${r.manual} | ${r.saas} | ${r.reneo} |`),
      '',
      '## Arsitektur Teknis & Keamanan',
      '- Stack: React + TypeScript + Vite (Frontend), Fastify + Drizzle ORM + PostgreSQL + Redis BullMQ (Backend), WAHA untuk multi-sesi WhatsApp QR.',
      '- Isolasi data tenant/perusahaan, autentikasi berbasis cookie HttpOnly & RBAC role builder dengan 18+ izin granular.',
      '- Riwayat obrolan persisten dengan penanda Batas Mulai Sesi dan Batas Selesai Sesi per tiket, plus metrik SLA dan CSAT multi-kriteria.',
      '- Grup WhatsApp (@g.us) dan kontak bertanda Non-Penilaian dikecualikan otomatis dari perhitungan SLA, Status, dan survei CSAT.',
      '',
      '## Pertanyaan Umum (FAQ)',
      ...CRM_FAQS.flatMap((f) => [`### ${f.q}`, f.a, ''])
    );
  } else {
    lines.push(
      '',
      '## Tautan Dokumentasi Mesin',
      `- [Halaman Profil & Fitur Lengkap](${baseUrl}/): ringkasan produk, studi kasus, perbandingan & FAQ`,
      `- [Dokumen Riset AI Lengkap](${baseUrl}/llms-full.txt): spesifikasi teknis, perbandingan & seluruh FAQ dalam Markdown`,
      `- [Sitemap XML](${baseUrl}/sitemap.xml): daftar URL publik yang dapat diindeks`
    );
  }
  return `${lines.join('\n')}\n`;
}

export default async function publicSeoRouter(fastify: FastifyInstance) {
  fastify.get('/robots.txt', async (req: FastifyRequest, reply: FastifyReply) => {
    const { baseUrl } = resolvePublicOriginAndBase(req);
    const bots = [
      '*',
      'OAI-SearchBot',
      'ChatGPT-User',
      'GPTBot',
      'ClaudeBot',
      'Claude-Web',
      'Claude-SearchBot',
      'Claude-User',
      'PerplexityBot',
      'Perplexity-User',
      'Googlebot',
      'Google-Extended',
      'Bingbot',
      'Applebot-Extended',
      'DuckAssistBot',
      'MistralAI-User',
    ];
    const body = [
      '# Reneo CRM: landing page and AI research endpoints are publicly indexable',
      ...bots.map(
        (ua) =>
          `User-agent: ${ua}\nAllow: /\nAllow: /landing\nAllow: /llms.txt\nAllow: /llms-full.txt\nAllow: /sitemap.xml\nDisallow: /api/\nDisallow: /login\nDisallow: /csat\nDisallow: /connect-channel\n`
      ),
      `Sitemap: ${baseUrl}/sitemap.xml`,
      '',
    ].join('\n');

    return reply
      .header('Content-Type', 'text/plain; charset=utf-8')
      .header('Cache-Control', 'public, max-age=3600')
      .send(body);
  });

  fastify.get('/sitemap.xml', async (req: FastifyRequest, reply: FastifyReply) => {
    const { baseUrl } = resolvePublicOriginAndBase(req);
    const today = new Date().toISOString().split('T')[0];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escapeHtml(`${baseUrl}/`)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${escapeHtml(`${baseUrl}/landing`)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>
`;
    return reply
      .header('Content-Type', 'application/xml; charset=utf-8')
      .header('Cache-Control', 'public, max-age=3600')
      .send(xml);
  });

  fastify.get('/llms.txt', async (req: FastifyRequest, reply: FastifyReply) => {
    const { baseUrl } = resolvePublicOriginAndBase(req);
    return reply
      .header('Content-Type', 'text/plain; charset=utf-8')
      .header('X-Robots-Tag', 'index, follow')
      .header('Cache-Control', 'public, max-age=1800')
      .send(buildLlmsTxt(baseUrl, false));
  });

  fastify.get('/llms-full.txt', async (req: FastifyRequest, reply: FastifyReply) => {
    const { baseUrl } = resolvePublicOriginAndBase(req);
    return reply
      .header('Content-Type', 'text/plain; charset=utf-8')
      .header('X-Robots-Tag', 'index, follow')
      .header('Cache-Control', 'public, max-age=1800')
      .send(buildLlmsTxt(baseUrl, true));
  });

  fastify.get('/landing', async (req: FastifyRequest, reply: FastifyReply) => {
    const accept = String(req.headers.accept || '').toLowerCase();
    const { baseUrl } = resolvePublicOriginAndBase(req);
    if (accept.includes('text/markdown')) {
      return reply
        .header('Content-Type', 'text/markdown; charset=utf-8')
        .header('X-Robots-Tag', 'index, follow')
        .send(buildLlmsTxt(baseUrl, true));
    }
    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('X-Robots-Tag', 'index, follow')
      .header('Cache-Control', 'public, max-age=300')
      .send(renderLandingHtmlDocument(req));
  });

  fastify.post<{
    Body: {
      name?: string;
      phone?: string;
      businessName?: string;
      inquiryType?: string;
      message?: string;
    };
  }>('/inquiry', async (req, reply) => {
    const name = String(req.body?.name || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const businessName = String(req.body?.businessName || '').trim();
    const inquiryType = String(req.body?.inquiryType || 'Tambah Fitur / Beli Aset Program').trim();
    const message = String(req.body?.message || '').trim();

    if (!name || !phone || !message) {
      return reply.status(400).send({
        success: false,
        error: 'Nama, nomor WhatsApp, dan pesan wajib diisi.',
      });
    }

    const reneoBase = (
      process.env.RENEO_PANEL_URL ||
      process.env.RENEO_URL ||
      'http://host.docker.internal:8787'
    ).replace(/\/+$/, '');
    const appToken = (process.env.RENEO_APP_TOKEN || '').trim();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (appToken) headers['X-Reneo-App-Token'] = appToken;

    try {
      const res = await axios.post(
        `${reneoBase}/api/v1/app-catalog/inquiry`,
        {
          catalogId: 'reneo-crm',
          name,
          phone,
          businessName,
          inquiryType,
          message,
        },
        { headers, timeout: 10000 }
      );
      return reply.send({
        success: true,
        message:
          res.data?.message ||
          'Permintaan Anda sudah kami terima. Anda akan segera mendapat balasan oleh tim kami.',
        data: {
          adminNotified: res.data?.adminNotified ?? 0,
          buyerNotified: Boolean(res.data?.buyerNotified),
        },
      });
    } catch (err: any) {
      const status = err?.response?.status;
      const errMsg =
        err?.response?.data?.error ||
        'Gagal mengirim permintaan saat ini. Silakan coba beberapa saat lagi.';
      return reply.status(status && status >= 400 && status < 500 ? status : 502).send({
        success: false,
        error: errMsg,
      });
    }
  });
}
