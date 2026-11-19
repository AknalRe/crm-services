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
  fullTitle: 'Reneo CRM — Kotak Masuk WhatsApp & Media Sosial Self-Hosted',
  description:
    'Reneo CRM adalah aplikasi layanan pelanggan self-hosted di server Linux untuk mengelola WhatsApp Multi-Nomor (WAHA QR & Cloud API), Instagram DM & Komentar, Facebook Messenger, Threads, dan Telegram dalam satu kotak masuk tim CS. Dilengkapi pengaturan Role granular, filter Non-Penilaian, Batas Mulai & Selesai Sesi SLA/CSAT, siaran terjadwal, dan Agent AI (OpenAI, Gemini, Anthropic, Ollama, MCP).',
  keywords:
    'Reneo CRM, CRM omnichannel, WhatsApp CRM self-hosted, inbox multi admin WhatsApp, WhatsApp Cloud API, WAHA CRM, CSAT multi sesi, SLA customer service, Agent AI MCP, WhatsApp Story terjadwal, CRM toko online Indonesia',
};

const CRM_STORY_BEATS = [
  {
    step: 'Kami pernah mengalami',
    text: 'Chat pelanggan tersebar di banyak HP admin dan akun media sosial; saat staf berganti shift atau perangkat bermasalah, riwayat obrolan terputus, sementara pesan kurir, supplier, dan grup internal bercampur dengan chat pembeli.',
  },
  {
    step: 'Kami menyadari',
    text: 'Masalah tersebut ternyata bukan sekadar persoalan kecil: ketika percakapan makin ramai, pelanggan menunggu terlalu lama, tim mengulang pertanyaan yang sama, dan laporan respon CS maupun kepuasan layanan menjadi tidak akurat.',
  },
  {
    step: 'Kami merasa',
    text: 'Solusi yang tersedia belum menjawab kebutuhan operasional kami — biayanya membengkak seiring jumlah admin dan pesan, data pelanggan bergantung pada server luar, dan chat non-pelanggan masih mengacaukan metrik SLA maupun CSAT.',
  },
  {
    step: 'Karena itu, kami membuat Reneo CRM',
    text: 'Satu kotak masuk self-hosted yang dibangun langsung dari alur kerja nyata tim CS kami sendiri di atas PostgreSQL dan Redis pada server sendiri, bukan sekadar ingin membuat software baru.',
  },
  {
    step: 'Tujuan kami',
    text: 'Membuat pengelolaan percakapan pelanggan, pembagian tugas tim, batas sesi penanganan, dan evaluasi layanan yang sebelumnya menyulitkan menjadi lebih terstruktur, terukur, dan mudah dilakukan.',
  },
];

const CRM_WHY_WE_BUILT_IT = [
  {
    title: 'Chat tersebar di banyak HP admin, lalu hilang saat staf berganti',
    detail:
      'Tiap admin memegang perangkat sendiri untuk melayani banyak nomor WhatsApp dan akun media sosial. Begitu admin shift berganti atau staf keluar, riwayat chat lama terputus dan pembeli harus mengulang penjelasan dari awal.',
  },
  {
    title: 'Chat internal, kurir, dan grup WA mengacaukan laporan SLA',
    detail:
      'Nomor CS harian juga menerima pesan dari kurir, supplier, staf internal, dan grup operasional. Di alat lain, semua ikut masuk hitungan keterlambatan SLA dan malah menerima survei rating CSAT.',
  },
  {
    title: 'Sulit memisahkan batas sesi tanpa memutus riwayat pelanggan',
    detail:
      'Pelanggan lama sering kembali memesan atau bertanya di minggu berikutnya. Riwayat percakapan tetap harus utuh dalam satu utas, tetapi setiap siklus penanganan perlu penanda Batas Mulai Sesi dan Batas Selesai Sesi serta CSAT tersendiri.',
  },
  {
    title: 'Biaya per pesan membengkak dan database berada di server luar',
    detail:
      'Saat tim CS bertambah, biaya kursi dan biaya per pesan naik, sementara data pelanggan bergantung pada server vendor pihak ketiga. Reneo CRM dibangun untuk berjalan penuh di PostgreSQL dan Redis pada server Anda sendiri.',
  },
];

const CRM_USE_CASES = [
  {
    segment: 'Toko Online & Multi-Nomor WhatsApp',
    problem: 'Chat dari Nomor Admin A dan Cabang B tercampur atau nama kontak berubah mengikuti push name terbaru.',
    solution: 'Percakapan dipisah per nomor WA & push name, namun tetap tertaut ke 1 profil kontak CRM tunggal.',
  },
  {
    segment: 'Tim Multi-CS dengan Kebutuhan Role Ketat',
    problem: 'Staf baru berisiko menghapus kontak, mengunduh CSV database, membuka chat agen lain, atau mengubah WAHA.',
    solution: 'Builder Role custom menyediakan pembatasan izin granular per menu hingga level tombol dan endpoint API.',
  },
  {
    segment: 'Grup WhatsApp & Chat Internal Mengacaukan Laporan',
    problem: 'Pesan grup operasional, kurir, atau vendor merusak metrik SLA dan memicu survei CSAT otomatis.',
    solution: 'Grup WA (@g.us) & kontak Non-Penilaian otomatis dikecualikan dari SLA, Status, Penugasan, dan CSAT.',
  },
];

const CRM_CHANNELS = [
  { name: 'WhatsApp (Multi-Nomor QR / WAHA)', mode: 'Chat, Grup & Story WA', detail: 'Hubungkan banyak nomor WA sekaligus, tampilkan daftar partisipan grup @g.us, dan jadwalkan WhatsApp Story ke kontak terpilih.' },
  { name: 'WhatsApp Business Cloud API (Meta)', mode: 'API Resmi', detail: 'Kirim pesan interaktif, template resmi, dan kelola percakapan bisnis skala tim tanpa batasan sesi lokal.' },
  { name: 'Instagram', mode: 'DM, Feed & Komentar', detail: 'Balas Direct Message, jadwalkan unggahan feed, dan otomasi balasan DM dari komentar iklan/postingan.' },
  { name: 'Facebook Messenger & Page', mode: 'Messenger & Komentar', detail: 'Kelola pesan masuk halaman bisnis, jadwal post Page, serta interaksi komentar dalam satu inbox.' },
  { name: 'Threads', mode: 'Post & Mentions', detail: 'Jadwalkan utas Threads dan pantau komentar akun usaha terpusat.' },
  { name: 'Telegram', mode: 'Bot Bisnis & Channel', detail: 'Terima pertanyaan pelanggan melalui bot Telegram dan publikasikan pembaruan ke channel.' },
];

const CRM_CAPABILITIES = [
  {
    title: 'Multi-CS Role & Batasan Akses Granular',
    detail: 'Atur hak akses per menu hingga tombol (lihat semua chat vs milik sendiri, balas/kelola tiket, ekspor CSV, edit kontak, siaran, hingga pengaturan WAHA).',
  },
  {
    title: 'Kontrol Penilaian SLA, CSAT Multi-Sesi & Filter Non-Penilaian',
    detail: 'Catat batas mulai dan batas selesai setiap sesi tanpa mereset riwayat pesan, kirim survei CSAT per sesi selesai, dan kecualikan grup WA maupun kontak internal/vendor melalui status Non-Penilaian.',
  },
  {
    title: 'Analitik Dashboard Klik-untuk-Detail (Drilldown)',
    detail: 'Telusuri kartu KPI, tren harian, jam sibuk, funnel siaran, performa CS, dan skor CSAT langsung ke daftar obrolan serta segmen chat terkait.',
  },
  {
    title: 'Siaran Terjadwal Anti-Ban, Katalog Produk & WhatsApp Story',
    detail: 'Kirim siaran terjadwal multi-sesi dengan jeda natural, bagikan Quick Quote produk langsung di chat, dan jadwalkan WhatsApp Story dengan pembacaan daftar penonton.',
  },
  {
    title: 'Agent AI Multi-Model, Knowledge Book & MCP Tools',
    detail: 'Hubungkan OpenAI, Gemini, Anthropic, atau Ollama lokal dengan buku panduan Markdown, skill, serta MCP server eksternal dan sistem failover otomatis.',
  },
  {
    title: 'Self-Hosted 100% di Server Sendiri',
    detail: 'Data pelanggan dan riwayat chat tersimpan utuh di PostgreSQL dan Redis pada server Anda sendiri (image Docker ghcr.io/aknalre/crm-services), tanpa biaya tambahan per pesan dari panel.',
  },
];

const CRM_COMPARISON = [
  {
    aspect: 'Kotak masuk 6 kanal (WA QR, WA Cloud, IG, FB, Threads, Telegram)',
    manual: 'Buka banyak HP dan aplikasi terpisah',
    saas: 'Tersedia, umumnya dibatasi kuota kanal & kursi mahal',
    reneo: '6 kanal + multi-nomor WA dalam satu layar tanpa biaya kursi per pesan panel',
  },
  {
    aspect: 'Role CS Custom (pembatasan menu, aksi & ekspor data)',
    manual: 'Semua staf pegang akses penuh',
    saas: 'Biasanya terkunci di paket Enterprise mahal',
    reneo: 'Termasuk builder Role & izin granular bawaan',
  },
  {
    aspect: 'Pengecualian grup WA & kontak Non-Penilaian pada laporan SLA/CSAT',
    manual: 'Sulit dipilah manual di spreadsheet',
    saas: 'Chat non-pelanggan sering ikut menghitung SLA',
    reneo: 'Otomatis mengecualikan grup WA (@g.us) & kontak berstatus Non-Penilaian',
  },
  {
    aspect: 'Kepemilikan data pelanggan & privasi',
    manual: 'Risiko chat hilang bila HP rusak / staf keluar',
    saas: 'Data bergantung server pihak ketiga',
    reneo: '100% tersimpan di database PostgreSQL/Redis server Anda sendiri',
  },
  {
    aspect: 'Analitik Drilldown + Agent AI Multi-Model & MCP',
    manual: 'Tidak tersedia',
    saas: 'Umumnya biaya add-on terpisah',
    reneo: 'Bawaan langsung dan mendukung API key sendiri / Ollama lokal',
  },
];

const CRM_FAQS = [
  {
    q: 'Apa itu Reneo CRM?',
    a: 'Reneo CRM adalah aplikasi layanan pelanggan (CRM) omnichannel self-hosted yang menyatukan WhatsApp Multi-Nomor (WAHA QR), WhatsApp Business Cloud API, Instagram, Facebook Messenger, Threads, dan Telegram ke satu ruang kerja tim CS.',
  },
  {
    q: 'Apakah bisa memakai banyak nomor WhatsApp QR dan WhatsApp Cloud API sekaligus?',
    a: 'Ya. Percakapan pelanggan dipisahkan berdasarkan sesi WA / kanal sumbernya dengan push name masing-masing, tetapi tetap terhubung ke satu profil kontak CRM terpadu.',
  },
  {
    q: 'Bagaimana agar grup WhatsApp atau chat tim internal tidak merusak laporan SLA dan CSAT?',
    a: 'Obrolan grup WhatsApp otomatis berstatus Non-Penilaian dengan daftar partisipan tetap terlihat. Kontak internal atau vendor dapat ditandai Non-Penilaian sekali agar percakapan berikutnya otomatis dikecualikan dari SLA, Status, Penugasan, dan CSAT.',
  },
  {
    q: 'Bagaimana sistem sesi dan survei CSAT bekerja tanpa menghapus riwayat chat?',
    a: 'Riwayat chat dipertahankan utuh dalam satu utas dengan penanda Batas Mulai Sesi dan Batas Selesai Sesi per siklus tiket. Setiap sesi yang selesai dapat memicu survei CSAT multi-kriteria baru beserta penyorotan segmen pesan terkait.',
  },
  {
    q: 'Apakah data dan biaya per pesan dikendalikan sendiri?',
    a: 'Ya. Aplikasi dijalankan di server Linux sendiri atau paket Hosting Reneo memakai image Docker ghcr.io/aknalre/crm-services, PostgreSQL, dan Redis tanpa biaya tambahan per pesan dari panel Reneo.',
  },
  {
    q: 'Bagaimana cara mendapatkan atau memasang Reneo CRM?',
    a: `Anda dapat memesan paket Hosting + Reneo CRM siap pakai dengan trial 7 hari melalui ${PANEL_ORDER_URL}, atau memasang panel Reneo di server Linux pribadi lewat ${PANEL_INSTALL_URL}.`,
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
    <p><strong>${escapeHtml(CRM_SEO_META.name)}</strong> · Self-Hosted CRM · PostgreSQL &amp; Redis</p>
    <h1>Satu Kotak Masuk WhatsApp &amp; Media Sosial untuk Tim Customer Service</h1>
    <p>${escapeHtml(CRM_SEO_META.description)}</p>
    <nav aria-label="Tautan Penting">
      <a href="${escapeHtml(rootUrl)}">Beranda</a> ·
      <a href="${escapeHtml(landingUrl)}">Profil Produk</a> ·
      <a href="${escapeHtml(baseUrl)}/login">Masuk CRM</a> ·
      <a href="${escapeHtml(baseUrl)}/llms.txt">Ringkasan AI (llms.txt)</a> ·
      <a href="${escapeHtml(PANEL_ORDER_URL)}">Beli Hosting + CRM &amp; Lisensi</a> ·
      <a href="${escapeHtml(PANEL_INSTALL_URL)}">Pasang di Server Sendiri</a>
    </nav>
  </header>
  <section id="kenapa-dibuat">
    <h2>Kenapa Kami Membuat Reneo CRM</h2>
    <p>Reneo CRM tidak dibuat karena ingin membuat software baru, melainkan lahir dari pengalaman nyata tim kami sendiri saat mengelola chat pelanggan setiap hari.</p>
    <ul>${storyHtml}</ul>
    <ul>${whyHtml}</ul>
    <p>Dari pengalaman itulah detail seperti status Non-Penilaian untuk grup WA dan kontak internal, penanda Batas Mulai &amp; Selesai Sesi, serta pembatasan izin hingga level tombol menjadi pondasi utama aplikasi ini.</p>
  </section>
  <section id="modul">
    <h2>Modul Kerja &amp; Arsitektur Sistem CRM</h2>
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
    <h2>6 Kanal Komunikasi Terhubung</h2>
    <ul>${channelsHtml}</ul>
  </section>
  <section id="perbandingan">
    <h2>Perbandingan Cara Manual vs CRM Cloud Lain vs Reneo CRM</h2>
    <table>
      <thead><tr><th>Aspek</th><th>Manual</th><th>CRM Cloud Lain</th><th>Reneo CRM</th></tr></thead>
      <tbody>${compHtml}</tbody>
    </table>
  </section>
  <section id="aktivasi">
    <h2>Mulai Beroperasi dalam 3 Langkah</h2>
    <ol>
      <li><strong>Pilih Hosting Siap Pakai atau Server Sendiri</strong>: Pesan paket Hosting + Reneo CRM atau pasang image Docker di server Linux pribadi.</li>
      <li><strong>Setup Akun &amp; Aktifkan Lisensi (Trial 7 Hari)</strong>: Buat akun admin utama dan aktifkan masa uji coba 7 hari atau paket lisensi.</li>
      <li><strong>Sambungkan Kanal, Sinkron Kontak &amp; Atur Role CS</strong>: Scan QR multi-nomor WA, sambungkan akun medsos, dan atur hak akses staf.</li>
    </ol>
  </section>
  <section id="faq">
    <h2>Pertanyaan Umum (FAQ)</h2>
    ${faqHtml}
  </section>
  <footer>
    <p>Bagian dari <a href="${escapeHtml(PANEL_URL)}">Reneo Panel</a> · Image Docker: <code>${escapeHtml(DOCKER_IMAGE)}</code></p>
  </footer>
</main>`;
}

function renderLandingHtmlDocument(req: FastifyRequest): string {
  const { baseUrl } = resolvePublicOriginAndBase(req);
  const reqPath = req.url.split('?')[0].toLowerCase();
  const isLanding = reqPath.endsWith('/landing') || reqPath.endsWith('/landing/');
  const canonicalUrl = isLanding ? `${baseUrl}/landing` : `${baseUrl}/`;
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
