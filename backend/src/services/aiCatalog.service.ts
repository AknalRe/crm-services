import axios from 'axios';

export interface KnowledgeBookPreset {
  id: string;
  title: string;
  description: string;
  category: 'FAQ' | 'CATALOG' | 'POLICY' | 'WEB' | 'GENERAL' | 'SOP';
  chapters: Array<{
    title: string;
    category: 'FAQ' | 'CATALOG' | 'POLICY' | 'WEB';
    content: string;
  }>;
}

export interface SkillPreset {
  slug: string;
  name: string;
  description: string;
  category: 'CRM' | 'SALES' | 'SUPPORT' | 'OPERATIONS' | 'CUSTOM';
  triggerHint: string;
  instructions: string;
  linkedTools: string[];
}

export const KNOWLEDGE_BOOK_PRESETS: KnowledgeBookPreset[] = [
  {
    id: 'ecommerce-cs',
    title: 'Buku CS Toko & Pemesanan',
    description:
      'Panduan standar customer service toko online: cara order, metode pembayaran, ongkir/resi, serta aturan retur.',
    category: 'FAQ',
    chapters: [
      {
        title: 'Alur Pemesanan & Pembayaran',
        category: 'FAQ',
        content:
          'Pelanggan dapat memesan langsung melalui admin atau tautan checkout resmi. Setelah invoice terbit, konfirmasi pembayaran akan diproses otomatis atau diverifikasi tim kami pada jam kerja.',
      },
      {
        title: 'Pengiriman & Pelacakan Resi',
        category: 'POLICY',
        content:
          'Pesanan yang lunas sebelum pukul 15.00 WIB diproses pada hari kerja yang sama. Nomor resi dikirimkan setelah paket diserahkan ke ekspedisi.',
      },
      {
        title: 'Kebijakan Retur & Garansi',
        category: 'POLICY',
        content:
          'Klaim produk rusak atau salah kirim wajib disertai video unboxing maksimal 2x24 jam setelah paket diterima sesuai resi ekspedisi.',
      },
    ],
  },
  {
    id: 'saas-onboarding',
    title: 'Buku Panduan SaaS & Lisensi',
    description:
      'Dokumentasi dasar untuk produk aplikasi/SaaS: aktivasi akun, kunci lisensi, perpanjangan paket, dan kendala login.',
    category: 'SOP',
    chapters: [
      {
        title: 'Aktivasi Akun & Kunci Lisensi',
        category: 'FAQ',
        content:
          'Setelah pembayaran berhasil, kunci lisensi aktif otomatis di halaman akun/billing. Masukkan kunci lisensi pada menu Aktivasi Lisensi di aplikasi.',
      },
      {
        title: 'Bantuan Login & Akses Workspace',
        category: 'FAQ',
        content:
          'Jika mengalami kendala login, pastikan email sudah benar, bersihkan cache browser, atau hubungi admin untuk reset kata sandi akun.',
      },
      {
        title: 'Perpanjangan & Upgrade Paket',
        category: 'POLICY',
        content:
          'Upgrade paket dapat dilakukan kapan saja tanpa menghilangkan data yang sudah tersimpan. Masa aktif baru mengikuti paket yang dipilih.',
      },
    ],
  },
  {
    id: 'service-booking',
    title: 'Buku Layanan & Reservasi',
    description:
      'Panduan reservasi jasa/klinik/konsultasi: jam layanan, penjadwalan ulang (reschedule), dan ketentuan DP.',
    category: 'FAQ',
    chapters: [
      {
        title: 'Jam Operasional & Lokasi Layanan',
        category: 'FAQ',
        content:
          'Layanan reguler buka Senin–Jumat pukul 08.00–17.00 WIB dan Sabtu pukul 09.00–14.00 WIB. Hari Minggu dan libur nasional tutup.',
      },
      {
        title: 'Cara Booking & Reschedule Jadwal',
        category: 'POLICY',
        content:
          'Sertakan nama lengkap, layanan yang dipilih, serta tanggal dan jam yang diinginkan. Perubahan jadwal (reschedule) maksimal dilakukan H-1.',
      },
      {
        title: 'Ketentuan Uang Muka (DP) & Pembatalan',
        category: 'POLICY',
        content:
          'Slot jadwal dikunci setelah konfirmasi DP diterima. Pembatalan sepihak di hari H tidak dapat dikembalikan, namun dapat dialihkan satu kali ke jadwal berikutnya.',
      },
    ],
  },
];

export const SKILL_PRESETS: SkillPreset[] = [
  {
    slug: 'catalog-advisor',
    name: 'Konsultan Produk & Harga',
    description:
      'Mengambil data produk dan harga langsung dari Katalog Produk CRM untuk menjawab pertanyaan harga dan rekomendasi paket.',
    category: 'SALES',
    triggerHint: 'Saat pelanggan menanyakan harga, daftar produk, paket layanan, SKU, atau rekomendasi.',
    instructions:
      '1. Gunakan tool crm_search_products sebelum menyebutkan harga atau spesifikasi produk.\n2. Cantumkan nama produk, harga per satuan, dan ringkasan manfaat secara rapi.\n3. Jika ada beberapa pilihan, tawarkan opsi yang paling sesuai dengan kebutuhan pelanggan.',
    linkedTools: ['crm_search_products'],
  },
  {
    slug: 'knowledge-researcher',
    name: 'Penelusur Buku Pengetahuan',
    description:
      'Mencari referensi detail di Knowledge Book aktif sebelum menyusun jawaban agar jawaban tetap akurat sesuai SOP.',
    category: 'SUPPORT',
    triggerHint: 'Saat pelanggan bertanya tentang SOP, kebijakan retur, garansi, syarat, atau cara penggunaan.',
    instructions:
      '1. Gunakan tool crm_search_knowledge untuk mencari bab relevan di Knowledge Book.\n2. Rujuk isi kebijakan yang tertulis secara konsisten tanpa menambah janji di luar dokumen.\n3. Jika materi belum ditemukan, sampaikan dengan jujur bahwa tim akan memastikannya.',
    linkedTools: ['crm_search_knowledge'],
  },
  {
    slug: 'lead-qualifier',
    name: 'Kualifikasi Prospek (Lead)',
    description:
      'Menggali kebutuhan calon pelanggan baru secara ramah untuk mempermudah tindak lanjut tim sales.',
    category: 'SALES',
    triggerHint: 'Saat prospek baru bertanya umum seperti "info dong", "bisa bantu?", atau "mau konsultasi".',
    instructions:
      '1. Jawab inti pertanyaan terlebih dahulu secara singkat.\n2. Ajukan maksimal 2 pertanyaan lanjutan yang relevan (kebutuhan utama dan perkiraan skala/timeline).\n3. Hindari gaya interogasi; tetap sopan dan membantu.',
    linkedTools: ['crm_get_customer_info'],
  },
  {
    slug: 'complaint-handler',
    name: 'Penanganan Komplain & Eskalasi',
    description:
      'Merespons keluhan pelanggan dengan empati dan langsung melakukan eskalasi tiket ke agen manusia bila butuh penanganan khusus.',
    category: 'SUPPORT',
    triggerHint: 'Saat pelanggan marah, komplain produk/pembayaran, meminta refund, atau meminta bicara dengan admin.',
    instructions:
      '1. Awali dengan empati dan permohonan maaf yang tulus tanpa menyalahkan pelanggan.\n2. Minta detail pendukung singkat (nomor order/kendala) jika belum ada.\n3. Panggil tool crm_escalate_to_human dengan ringkasan jelas agar agen manusia segera mengambil alih.',
    linkedTools: ['crm_escalate_to_human', 'crm_get_customer_info'],
  },
  {
    slug: 'social-comment-moderator',
    name: 'Moderator Komentar Sosial Media',
    description:
      'Membalas komentar publik Instagram, Facebook, dan Threads secara singkat lalu mengarahkan diskusi detail ke DM.',
    category: 'CRM',
    triggerHint: 'Saat membalas komentar publik di media sosial.',
    instructions:
      '1. Tulis balasan singkat (maksimal 2–3 kalimat), hangat, dan bebas data sensitif.\n2. Arahkan pelanggan mengirim DM atau klik tautan resmi bila membutuhkan rincian pesanan atau data pribadi.',
    linkedTools: ['crm_search_products'],
  },
  {
    slug: 'follow-up-assistant',
    name: 'Asisten Follow-Up & Pembayaran',
    description:
      'Membantu pelanggan menuntaskan kendala pembayaran, konfirmasi order, atau status layanan secara tertib.',
    category: 'OPERATIONS',
    triggerHint: 'Saat pelanggan menanyakan status pembayaran, konfirmasi transfer, atau kelanjutan proses order.',
    instructions:
      '1. Periksa profil kontak dengan crm_get_customer_info bila tersedia.\n2. Arahkan langkah verifikasi pembayaran secara jelas tanpa meminta PIN/OTP/kata sandi.',
    linkedTools: ['crm_get_customer_info', 'crm_search_knowledge'],
  },
];

function assertPublicHttpUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    throw new Error('URL tidak valid');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL harus diawali http:// atau https://');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === '169.254.169.254' ||
    host === 'metadata.google.internal' ||
    host.endsWith('.internal') && host.includes('metadata')
  ) {
    throw new Error('URL metadata cloud tidak diizinkan');
  }
  return parsed;
}

function stripHtmlToReadableText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch
    ? titleMatch[1].replace(/\s+/g, ' ').replace(/&amp;/g, '&').trim()
    : '';

  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '\n')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '\n')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '\n')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '\n')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '\n');

  cleaned = cleaned
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<(br|p|div|section|article|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title, text: cleaned };
}

export async function fetchPublicDocumentFromUrl(rawUrl: string): Promise<{
  url: string;
  title: string;
  content: string;
  isMarkdown: boolean;
}> {
  const parsed = assertPublicHttpUrl(rawUrl);
  const res = await axios.get<string>(parsed.toString(), {
    timeout: 12000,
    maxContentLength: 1024 * 1024,
    responseType: 'text',
    headers: {
      'User-Agent': 'Reneo-CRM-KnowledgeImporter/1.4',
      Accept: 'text/markdown, text/plain, text/html, */*',
    },
  });

  const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2);
  const contentType = String(res.headers?.['content-type'] || '').toLowerCase();
  const looksLikeHtml = contentType.includes('text/html') || /<!doctype html|<html/i.test(body.slice(0, 500));

  if (looksLikeHtml) {
    const stripped = stripHtmlToReadableText(body);
    return {
      url: parsed.toString(),
      title: stripped.title || parsed.hostname,
      content: stripped.text.slice(0, 40000),
      isMarkdown: false,
    };
  }

  return {
    url: parsed.toString(),
    title: parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname,
    content: body.trim().slice(0, 40000),
    isMarkdown: parsed.pathname.toLowerCase().endsWith('.md') || contentType.includes('markdown'),
  };
}

export function parseMarkdownToChapters(
  rawText: string,
  fallbackTitle = 'Ringkasan Materi'
): Array<{ title: string; content: string }> {
  const lines = String(rawText || '').replace(/\r\n/g, '\n').split('\n');
  const chapters: Array<{ title: string; content: string }> = [];

  let currentTitle = fallbackTitle;
  let currentLines: string[] = [];

  const flush = () => {
    const content = currentLines.join('\n').trim();
    if (content) {
      chapters.push({ title: currentTitle.slice(0, 120), content: content.slice(0, 6000) });
    }
    currentLines = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      flush();
      currentTitle = headingMatch[1].trim() || fallbackTitle;
    } else {
      currentLines.push(line);
    }
  }
  flush();

  if (chapters.length === 0) {
    return [];
  }
  return chapters.slice(0, 30);
}

export function slugifySkillName(raw: string): string {
  const clean = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || `skill-${Date.now()}`;
}

export function parseSkillMarkdown(
  rawMarkdown: string,
  fallbackName = 'Custom Skill'
): {
  slug: string;
  name: string;
  description: string;
  category: 'CRM' | 'SALES' | 'SUPPORT' | 'OPERATIONS' | 'CUSTOM';
  triggerHint: string;
  instructions: string;
} {
  let body = String(rawMarkdown || '').replace(/\r\n/g, '\n').trim();
  const meta: Record<string, string> = {};

  if (body.startsWith('---')) {
    const endIdx = body.indexOf('\n---', 3);
    if (endIdx !== -1) {
      const yamlBlock = body.slice(3, endIdx).trim();
      body = body.slice(endIdx + 4).trim();
      for (const line of yamlBlock.split('\n')) {
        const kv = line.match(/^([a-zA-Z0-9_-]+):\s*(.+)$/);
        if (kv) {
          meta[kv[1].toLowerCase()] = kv[2].replace(/^['"]|['"]$/g, '').trim();
        }
      }
    }
  }

  let headingName = '';
  const headingMatch = body.match(/^#\s+(.+)$/m);
  if (headingMatch) {
    headingName = headingMatch[1].trim();
  }

  const name = meta.name || headingName || fallbackName;
  const description =
    meta.description ||
    body
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#')) ||
    '';

  const allowedCats = new Set(['CRM', 'SALES', 'SUPPORT', 'OPERATIONS', 'CUSTOM']);
  const rawCat = String(meta.category || 'CUSTOM').toUpperCase();
  const category = (allowedCats.has(rawCat) ? rawCat : 'CUSTOM') as
    | 'CRM'
    | 'SALES'
    | 'SUPPORT'
    | 'OPERATIONS'
    | 'CUSTOM';

  return {
    slug: slugifySkillName(meta.slug || name),
    name: name.slice(0, 100),
    description: description.slice(0, 240),
    category,
    triggerHint: (meta.trigger || meta.when || '').slice(0, 240),
    instructions: body.slice(0, 12000),
  };
}
