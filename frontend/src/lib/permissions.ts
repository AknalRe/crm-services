import { PermissionCatalogItem, LicenseInfo } from '../types';

export const ALL_PERMISSION_KEYS = [
  'dashboard',
  'dashboard.export',
  'contacts',
  'contacts.create',
  'contacts.edit',
  'contacts.delete',
  'broadcasts',
  'broadcasts.send',
  'birthday',
  'tracking',
  'conversations',
  'conversations.view_all',
  'conversations.reply',
  'conversations.manage',
  'conversations.csat',
  'settings',
  'settings.edit',
  'settings.agents',
] as const;

export type PermissionKey = (typeof ALL_PERMISSION_KEYS)[number];

export const PERMISSION_CATALOG_UI: PermissionCatalogItem[] = [
  {
    id: 'dashboard',
    group: 'Dashboard & Laporan',
    label: 'Akses Menu Dashboard',
    description: 'Melihat ringkasan analitik CRM dan detail drilldown.',
    kind: 'menu',
  },
  {
    id: 'dashboard.export',
    group: 'Dashboard & Laporan',
    label: 'Ekspor Laporan CSV',
    description: 'Mengunduh laporan CSV percakapan, performa CS, & siaran.',
    kind: 'action',
  },
  {
    id: 'contacts',
    group: 'Kontak Pelanggan',
    label: 'Akses Menu & Lihat Kontak',
    description: 'Membuka daftar kontak pelanggan & detail profilnya.',
    kind: 'menu',
  },
  {
    id: 'contacts.create',
    group: 'Kontak Pelanggan',
    label: 'Tambah, Impor & Sinkron WA',
    description: 'Menambah kontak manual, impor CSV/Excel, dan sinkronisasi dari WAHA.',
    kind: 'action',
  },
  {
    id: 'contacts.edit',
    group: 'Kontak Pelanggan',
    label: 'Edit, Gabung & Tandai Penilaian',
    description: 'Mengubah data kontak, menggabungkan duplikat, & menandai Non-Penilaian.',
    kind: 'action',
  },
  {
    id: 'contacts.delete',
    group: 'Kontak Pelanggan',
    label: 'Hapus Kontak Pelanggan',
    description: 'Menghapus permanen data kontak dari CRM.',
    kind: 'action',
  },
  {
    id: 'broadcasts',
    group: 'Siaran & Konten Sosial',
    label: 'Akses Menu Siaran, Jadwal Post & Galeri',
    description: 'Melihat daftar kampanye, kalender postingan, WA Story, ide konten & galeri.',
    kind: 'menu',
  },
  {
    id: 'broadcasts.send',
    group: 'Siaran & Konten Sosial',
    label: 'Buat & Kirim Siaran / Posting / Story',
    description: 'Membuat kampanye siaran, menerbitkan/menjadwalkan post, Story WA & upload media.',
    kind: 'action',
  },
  {
    id: 'birthday',
    group: 'Otomasi & Pelacakan',
    label: 'Akses & Kelola Ulang Tahun',
    description: 'Melihat & mengatur ucapan otomatis ulang tahun.',
    kind: 'menu',
  },
  {
    id: 'tracking',
    group: 'Otomasi & Pelacakan',
    label: 'Akses Pelacakan Status Kirim',
    description: 'Melihat status centang terkirim/sampai/dibaca seluruh siaran.',
    kind: 'menu',
  },
  {
    id: 'conversations',
    group: 'Inbox Live Chat & Multi-CS',
    label: 'Akses Menu Inbox, Komentar & Feed',
    description: 'Membuka kotak masuk omnichannel, grup WA, komentar, dan feed sosial.',
    kind: 'menu',
  },
  {
    id: 'conversations.view_all',
    group: 'Inbox Live Chat & Multi-CS',
    label: 'Lihat Obrolan Semua CS',
    description: 'Jika dinonaktifkan, CS hanya melihat obrolan miliknya sendiri atau yang belum ditugaskan.',
    kind: 'action',
  },
  {
    id: 'conversations.reply',
    group: 'Inbox Live Chat & Multi-CS',
    label: 'Balas Chat, Kirim Media & Tombol',
    description: 'Mengirim balasan teks, gambar, dokumen, video, tautan, tombol, & polling.',
    kind: 'action',
  },
  {
    id: 'conversations.manage',
    group: 'Inbox Live Chat & Multi-CS',
    label: 'Kelola Status, Assign CS, Label & Non-Penilaian',
    description: 'Membuat chat baru, ubah Open/Pending/Done, assign CS, edit label, nama kanal, & Non-Penilaian.',
    kind: 'action',
  },
  {
    id: 'conversations.csat',
    group: 'Inbox Live Chat & Multi-CS',
    label: 'Kirim Survei CSAT Manual',
    description: 'Mengirim tautan penilaian kepuasan pelanggan secara manual dari inbox.',
    kind: 'action',
  },
  {
    id: 'settings',
    group: 'Pengaturan & Integrasi',
    label: 'Akses Menu Pengaturan, Kanal, Master Data & AI',
    description: 'Membuka konfigurasi WAHA, omnichannel, master data, jam kerja, SLA & Agent AI.',
    kind: 'menu',
  },
  {
    id: 'settings.edit',
    group: 'Pengaturan & Integrasi',
    label: 'Ubah & Simpan Pengaturan Sistem',
    description: 'Mengubah sesi WAHA, akun kanal, AI Agent, otomasi komentar, jam kerja & SLA.',
    kind: 'action',
  },
  {
    id: 'settings.agents',
    group: 'Pengaturan & Integrasi',
    label: 'Kelola Tim CS, Role & Batasan Akses',
    description: 'Membuat role baru dengan batasan khusus serta menambah/mengedit akun CS.',
    kind: 'action',
  },
];

export type SessionUserLike =
  | {
      id?: string;
      role?: 'ADMIN' | 'AGENT' | string;
      roleId?: string | null;
      roleName?: string | null;
      permissions?: string[];
    }
  | null
  | undefined;

export function hasPerm(user: SessionUserLike, key: PermissionKey | string): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (!Array.isArray(user.permissions)) return false;
  return user.permissions.includes(key);
}

export function hasAnyPerm(user: SessionUserLike, keys: Array<PermissionKey | string>): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (!Array.isArray(user.permissions)) return false;
  return keys.some((key) => user.permissions!.includes(key));
}

export function groupPermissionCatalog(
  catalog: PermissionCatalogItem[] = PERMISSION_CATALOG_UI
): Array<{ group: string; items: PermissionCatalogItem[] }> {
  const source = catalog.length > 0 ? catalog : PERMISSION_CATALOG_UI;
  const map = new Map<string, PermissionCatalogItem[]>();
  for (const item of source) {
    const existing = map.get(item.group);
    if (existing) {
      existing.push(item);
    } else {
      map.set(item.group, [item]);
    }
  }
  return Array.from(map.entries()).map(([group, items]) => ({ group, items }));
}

export function summarizePermissions(permissions: string[]): string[] {
  const catalogMap = new Map(PERMISSION_CATALOG_UI.map((item) => [item.id, item.label]));
  return permissions.map((id) => catalogMap.get(id) || id);
}

export function isMenuUnlockedByLicense(
  menuId: string,
  licenseInfo?: LicenseInfo | null
): boolean {
  if (!licenseInfo) return true;
  const isLicenseActive =
    !licenseInfo.isExpired &&
    licenseInfo.status !== 'UNLICENSED' &&
    licenseInfo.status !== 'SUSPENDED';
  if (!isLicenseActive) return menuId === 'dashboard';
  const feats = licenseInfo.features;
  if (Array.isArray(feats?.allowedMenus) && feats.allowedMenus.length > 0) {
    return feats.allowedMenus.includes(menuId);
  }
  switch (menuId) {
    case 'conversations':
      return Boolean(feats?.liveChatCrm);
    case 'comments':
    case 'feed':
      return Boolean(feats?.omnichannel);
    case 'birthday':
      return Boolean(feats?.birthdayAutomation);
    case 'tracking':
    case 'posts':
    case 'ideas':
      return Boolean(feats?.scheduledPosts);
    case 'automations':
      return feats?.autoReply !== undefined ? Boolean(feats.autoReply) : true;
    case 'ai-agent':
      return Boolean(feats?.aiAgent);
    default:
      return true;
  }
}

export function getMenuLockReason(
  menuId: string,
  planName?: string
): { title: string; description: string } {
  const plan = planName || 'Saat Ini';
  switch (menuId) {
    case 'tracking':
      return {
        title: 'Menu Pelacakan Status Siaran Terkunci',
        description: `Paket lisensi Anda (${plan}) tidak menyertakan fitur Pelacakan Status & Centang Siaran. Upgrade paket lisensi Anda ke Pro Bulanan atau Enterprise Tahunan untuk membuka analitik dan riwayat pengiriman detail per nomor.`,
      };
    case 'conversations':
      return {
        title: 'Menu Live Chat CRM Terkunci',
        description: `Paket lisensi Anda (${plan}) tidak menyertakan fitur Live Chat CRM. Upgrade ke paket Pro Bulanan atau Enterprise Tahunan untuk membuka kotak masuk percakapan dan multi-agent.`,
      };
    case 'comments':
    case 'feed':
      return {
        title: 'Fitur Media Sosial Omnichannel Terkunci',
        description: `Paket lisensi Anda (${plan}) tidak menyertakan integrasi komentar & feed media sosial. Upgrade paket lisensi Anda untuk membuka akses omnichannel.`,
      };
    case 'posts':
    case 'ideas':
      return {
        title: 'Menu Jadwal Post & Ide Konten Terkunci',
        description: `Paket lisensi Anda (${plan}) tidak menyertakan fitur Jadwal Post & Story WhatsApp. Upgrade paket lisensi Anda untuk membuka kalender posting otomatis.`,
      };
    case 'birthday':
      return {
        title: 'Menu Otomasi Ulang Tahun Terkunci',
        description: `Paket lisensi Anda (${plan}) tidak menyertakan fitur ucapan otomatis ulang tahun pelanggan. Upgrade paket lisensi Anda untuk mengaktifkan fitur ini.`,
      };
    case 'automations':
      return {
        title: 'Menu Otomasi Terkunci',
        description: `Paket lisensi Anda (${plan}) tidak menyertakan fitur otomasi lanjutan. Upgrade paket lisensi Anda untuk mengaktifkannya.`,
      };
    case 'ai-agent':
      return {
        title: 'Menu Agent AI & Knowledge Book Terkunci',
        description: `Paket lisensi Anda (${plan}) tidak menyertakan fitur Agent AI & Knowledge Book. Upgrade ke paket Business AI atau Enterprise Tahunan untuk mengaktifkannya.`,
      };
    default:
      return {
        title: `Menu "${menuId}" Terkunci oleh Lisensi`,
        description: `Paket lisensi Anda (${plan}) belum memiliki akses ke menu ini. Silakan upgrade paket lisensi Anda.`,
      };
  }
}
