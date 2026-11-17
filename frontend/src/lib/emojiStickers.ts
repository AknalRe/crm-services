export interface EmojiEntry {
  char: string;
  keywords: string;
}

export interface EmojiCategory {
  id: string;
  label: string;
  icon: string;
  items: EmojiEntry[];
}

export const QUICK_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉'];

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    label: 'Ekspresi',
    icon: '😀',
    items: [
      { char: '😀', keywords: 'senyum senang happy smile' },
      { char: '😃', keywords: 'senang gembira ceria' },
      { char: '😄', keywords: 'ketawa senang bahagia' },
      { char: '😁', keywords: 'nyengir semangat' },
      { char: '😆', keywords: 'ketawa ngakak' },
      { char: '😅', keywords: 'keringat grogi haha' },
      { char: '🤣', keywords: 'ngakak ketawa lucu' },
      { char: '😂', keywords: 'ketawa air mata' },
      { char: '🙂', keywords: 'senyum ramah sopan' },
      { char: '😊', keywords: 'senyum manis malu ramah' },
      { char: '😇', keywords: 'baik tulus malaikat' },
      { char: '🥰', keywords: 'sayang cinta suka' },
      { char: '😍', keywords: 'suka cinta kagum' },
      { char: '🤩', keywords: 'terkesima wow bintang' },
      { char: '😘', keywords: 'cium sayang' },
      { char: '😋', keywords: 'enak lezat lapar' },
      { char: '😜', keywords: 'iseng bercanda' },
      { char: '🤔', keywords: 'mikir tanya ragu' },
      { char: '🤭', keywords: 'malu ups' },
      { char: '🤗', keywords: 'peluk hangat ramah' },
      { char: '😌', keywords: 'lega tenang nyaman' },
      { char: '😔', keywords: 'sedih kecewa maaf' },
      { char: '😢', keywords: 'sedih nangis maaf' },
      { char: '😭', keywords: 'nangis sedih banget' },
      { char: '😤', keywords: 'kesal marah semangat' },
      { char: '😮', keywords: 'kaget wah wow' },
      { char: '😱', keywords: 'kaget terkejut takut' },
      { char: '😴', keywords: 'tidur ngantuk istirahat' },
      { char: '🥳', keywords: 'pesta selamat ulang tahun' },
      { char: '😎', keywords: 'keren mantap santai' },
      { char: '🤓', keywords: 'pintar kutu buku kerja' },
      { char: '🧐', keywords: 'cek teliti periksa' },
    ],
  },
  {
    id: 'gestures',
    label: 'Gestur',
    icon: '🙏',
    items: [
      { char: '🙏', keywords: 'terima kasih maaf mohon tolong' },
      { char: '👍', keywords: 'ok bagus setuju mantap jempol' },
      { char: '👎', keywords: 'tidak kurang setuju' },
      { char: '👋', keywords: 'halo hai dadah sapa' },
      { char: '🤝', keywords: 'deal sepakat kerjasama salam' },
      { char: '👏', keywords: 'tepuk tangan selamat hebat' },
      { char: '🙌', keywords: 'hore semangat yey' },
      { char: '👌', keywords: 'oke sip beres pas' },
      { char: '✌️', keywords: 'peace damai dua' },
      { char: '🤞', keywords: 'semoga beruntung' },
      { char: '🫶', keywords: 'love cinta apresiasi' },
      { char: '💪', keywords: 'kuat semangat bisa' },
      { char: '☝️', keywords: 'satu perhatian info' },
      { char: '👉', keywords: 'klik lihat lanjut kanan' },
      { char: '👇', keywords: 'bawah link ini' },
      { char: '🙋', keywords: 'saya tanya bantu' },
      { char: '💁', keywords: 'layanan bantu cs info' },
      { char: '🙇', keywords: 'maaf hormat tunduk' },
      { char: '✍️', keywords: 'tulis catat tanda tangan' },
      { char: '🤳', keywords: 'foto bukti kirim' },
    ],
  },
  {
    id: 'hearts',
    label: 'Simbol',
    icon: '❤️',
    items: [
      { char: '❤️', keywords: 'hati cinta suka terima kasih' },
      { char: '🧡', keywords: 'hati oranye' },
      { char: '💛', keywords: 'hati kuning' },
      { char: '💚', keywords: 'hati hijau whatsapp' },
      { char: '💙', keywords: 'hati biru' },
      { char: '💜', keywords: 'hati ungu' },
      { char: '🖤', keywords: 'hati hitam' },
      { char: '🤍', keywords: 'hati putih' },
      { char: '💯', keywords: 'seratus sempurna mantap' },
      { char: '✨', keywords: 'spesial baru kilau cantik' },
      { char: '🔥', keywords: 'promo laris panas trending' },
      { char: '⭐', keywords: 'bintang rating ulasan favorit' },
      { char: '🌟', keywords: 'bintang terbaik unggulan' },
      { char: '⚡', keywords: 'cepat kilat instan flash' },
      { char: '✅', keywords: 'centang selesai valid lunas ok' },
      { char: '☑️', keywords: 'ceklis pilih' },
      { char: '❌', keywords: 'silang batal salah gagal' },
      { char: '⚠️', keywords: 'peringatan hati penting' },
      { char: '❗', keywords: 'penting seru' },
      { char: '❓', keywords: 'tanya bantuan' },
      { char: '💬', keywords: 'chat pesan diskusi' },
      { char: '🔔', keywords: 'notifikasi info pengingat' },
      { char: '📌', keywords: 'pin catatan penting' },
      { char: '📍', keywords: 'lokasi alamat tempat peta' },
    ],
  },
  {
    id: 'business',
    label: 'Bisnis',
    icon: '📦',
    items: [
      { char: '📦', keywords: 'paket barang kirim kurir' },
      { char: '🚚', keywords: 'pengiriman truk antar ekspedisi' },
      { char: '🛍️', keywords: 'belanja toko order produk' },
      { char: '🛒', keywords: 'keranjang beli order' },
      { char: '🧾', keywords: 'struk invoice tagihan nota' },
      { char: '💳', keywords: 'kartu bayar transfer rekening' },
      { char: '💰', keywords: 'uang harga bayar promo' },
      { char: '💵', keywords: 'tunai uang cash rupiah' },
      { char: '🏷️', keywords: 'diskon harga tag promo' },
      { char: '🎁', keywords: 'hadiah bonus kado gratis' },
      { char: '🎉', keywords: 'selamat perayaan promo ultah' },
      { char: '🎂', keywords: 'ulang tahun kue ultah' },
      { char: '📞', keywords: 'telepon hubungi kontak' },
      { char: '📱', keywords: 'hp whatsapp mobile chat' },
      { char: '💻', keywords: 'laptop komputer sistem kerja' },
      { char: '📄', keywords: 'dokumen file berkas pdf' },
      { char: '📋', keywords: 'daftar formulir catatan' },
      { char: '🗓️', keywords: 'kalender jadwal tanggal' },
      { char: '⏰', keywords: 'waktu jam pengingat' },
      { char: '⏳', keywords: 'tunggu proses antre sebentar' },
      { char: '🔒', keywords: 'aman rahasia privasi' },
      { char: '🔑', keywords: 'akses lisensi kunci login' },
      { char: '🛠️', keywords: 'perbaikan servis bantuan teknis' },
      { char: '🚀', keywords: 'cepat rilis meluncur' },
    ],
  },
];

const RECENT_EMOJIS_KEY = 'reneo_crm_recent_emojis_v1';

export function getRecentEmojis(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_EMOJIS_KEY);
    if (!raw) return ['🙏', '👍', '😊', '✅', '❤️', '🎉', '📦', '🔥'];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0
      ? parsed.filter((x) => typeof x === 'string').slice(0, 16)
      : ['🙏', '👍', '😊', '✅', '❤️', '🎉', '📦', '🔥'];
  } catch {
    return ['🙏', '👍', '😊', '✅', '❤️', '🎉', '📦', '🔥'];
  }
}

export function pushRecentEmoji(char: string): string[] {
  const prev = getRecentEmojis();
  const next = [char, ...prev.filter((c) => c !== char)].slice(0, 16);
  try {
    localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
  return next;
}

export interface PresetStickerTemplate {
  id: string;
  label: string;
  emoji: string;
  topText: string;
  bottomText: string;
  bgHex: string;
  accentHex: string;
  textHex: string;
}

export const PRESET_STICKER_TEMPLATES: PresetStickerTemplate[] = [
  {
    id: 'halo-kak',
    label: 'Halo Kak 👋',
    emoji: '👋',
    topText: 'HALO KAK!',
    bottomText: 'Ada yg bisa dibantu?',
    bgHex: '#EEF2FF',
    accentHex: '#4F46E5',
    textHex: '#1E1B4B',
  },
  {
    id: 'terima-kasih',
    label: 'Terima Kasih 🙏',
    emoji: '🙏',
    topText: 'TERIMA KASIH',
    bottomText: 'Sudah menghubungi kami',
    bgHex: '#ECFDF5',
    accentHex: '#059669',
    textHex: '#064E3B',
  },
  {
    id: 'mohon-tunggu',
    label: 'Mohon Tunggu ⏳',
    emoji: '⏳',
    topText: 'MOHON TUNGGU',
    bottomText: 'Sedang kami cek ya kak',
    bgHex: '#FFFBEB',
    accentHex: '#D97706',
    textHex: '#78350F',
  },
  {
    id: 'siap-diproses',
    label: 'Siap Diproses 📦',
    emoji: '📦',
    topText: 'ORDER DIPROSES',
    bottomText: 'Segera kami siapkan!',
    bgHex: '#F0F9FF',
    accentHex: '#0284C7',
    textHex: '#0C4A6E',
  },
  {
    id: 'lunas-ok',
    label: 'Lunas / OK ✅',
    emoji: '✅',
    topText: 'TERVERIFIKASI',
    bottomText: 'Pembayaran diterima!',
    bgHex: '#F0FDF4',
    accentHex: '#16A34A',
    textHex: '#14532D',
  },
  {
    id: 'promo-spesial',
    label: 'Promo Spesial 🔥',
    emoji: '🔥',
    topText: 'PROMO HARI INI',
    bottomText: 'Jangan sampai kehabisan!',
    bgHex: '#FFF1F2',
    accentHex: '#E11D48',
    textHex: '#881337',
  },
];

export async function renderPresetStickerToWebp(tpl: PresetStickerTemplate): Promise<string> {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak didukung browser');

  ctx.clearRect(0, 0, size, size);

  // Rounded badge body with crisp WhatsApp sticker outline
  const pad = 28;
  const radius = 64;
  const w = size - pad * 2;
  const h = size - pad * 2;

  ctx.beginPath();
  ctx.moveTo(pad + radius, pad);
  ctx.lineTo(pad + w - radius, pad);
  ctx.quadraticCurveTo(pad + w, pad, pad + w, pad + radius);
  ctx.lineTo(pad + w, pad + h - radius);
  ctx.quadraticCurveTo(pad + w, pad + h, pad + w - radius, pad + h);
  ctx.lineTo(pad + radius, pad + h);
  ctx.quadraticCurveTo(pad, pad + h, pad, pad + h - radius);
  ctx.lineTo(pad, pad + radius);
  ctx.quadraticCurveTo(pad, pad, pad + radius, pad);
  ctx.closePath();

  ctx.fillStyle = tpl.bgHex;
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = tpl.accentHex;
  ctx.stroke();

  // Top Pill Banner
  ctx.fillStyle = tpl.accentHex;
  const pillW = 360;
  const pillH = 68;
  const pillX = (size - pillW) / 2;
  const pillY = 72;
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 24);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 34px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tpl.topText, size / 2, pillY + pillH / 2 + 2);

  // Center Emoji
  ctx.font = '164px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.fillText(tpl.emoji, size / 2, size / 2 + 12);

  // Bottom Caption
  ctx.fillStyle = tpl.textHex;
  ctx.font = 'bold 32px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText(tpl.bottomText, size / 2, size - 96, size - 96);

  const webp = canvas.toDataURL('image/webp', 0.92);
  if (webp.startsWith('data:image/webp')) return webp;
  return canvas.toDataURL('image/png');
}

export async function convertImageFileToStickerWebp(file: File): Promise<{
  dataUri: string;
  mimetype: string;
}> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Gagal membaca gambar stiker'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Format gambar tidak valid'));
    el.src = dataUrl;
  });

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUri: dataUrl, mimetype: file.type || 'image/webp' };

  ctx.clearRect(0, 0, size, size);
  const scale = Math.min((size - 24) / img.width, (size - 24) / img.height);
  const drawW = Math.round(img.width * scale);
  const drawH = Math.round(img.height * scale);
  const x = Math.round((size - drawW) / 2);
  const y = Math.round((size - drawH) / 2);
  ctx.drawImage(img, x, y, drawW, drawH);

  const webp = canvas.toDataURL('image/webp', 0.9);
  if (webp.startsWith('data:image/webp')) {
    return { dataUri: webp, mimetype: 'image/webp' };
  }
  const png = canvas.toDataURL('image/png');
  return { dataUri: png, mimetype: 'image/png' };
}
