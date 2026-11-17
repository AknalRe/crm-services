import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '../db';
import { companies, crmAgents, crmRoles, systemSettings } from '../db/schema';
import {
  DEFAULT_COMPANY_ID,
  generateUniqueCompanySlug,
  getActiveCompanyId,
  getCompanySettingMap,
  getSystemSettingMap,
  seedCompanyDefaults,
  upsertSystemSetting,
} from '../services/tenantContext';

const SESSION_COOKIE = 'crm_session';
export const ALL_PERMISSIONS = [
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

export type PermissionKey = (typeof ALL_PERMISSIONS)[number];

export interface PermissionCatalogEntry {
  id: PermissionKey;
  group: string;
  label: string;
  description: string;
  kind: 'menu' | 'action';
}

export const PERMISSION_CATALOG: PermissionCatalogEntry[] = [
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
    label: 'Akses Menu Siaran, Jadwal Post & Media',
    description: 'Melihat daftar kampanye, kalender postingan, WA Story, ide konten & pustaka media.',
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

export const DEFAULT_STARTER_ROLES: Array<{
  id: string;
  name: string;
  description: string;
  permissions: PermissionKey[];
  isSystem: boolean;
}> = [
  {
    id: 'role_admin',
    name: 'Administrator',
    description: 'Akses penuh ke seluruh menu, aksi, integrasi, dan manajemen role CS.',
    permissions: [...ALL_PERMISSIONS],
    isSystem: true,
  },
  {
    id: 'role_supervisor',
    name: 'Supervisor CS',
    description: 'Memantau seluruh chat tim, laporan CSV, kontak, dan menugaskan CS tanpa mengubah integrasi sistem.',
    permissions: [
      'dashboard',
      'dashboard.export',
      'contacts',
      'contacts.create',
      'contacts.edit',
      'broadcasts',
      'broadcasts.send',
      'birthday',
      'tracking',
      'conversations',
      'conversations.view_all',
      'conversations.reply',
      'conversations.manage',
      'conversations.csat',
    ],
    isSystem: true,
  },
  {
    id: 'role_cs',
    name: 'Customer Service',
    description: 'Fokus melayani obrolan miliknya/belum ditugaskan, kelola status, & tambah kontak tanpa akses hapus/ekspor/pengaturan.',
    permissions: [
      'dashboard',
      'contacts',
      'contacts.create',
      'contacts.edit',
      'conversations',
      'conversations.reply',
      'conversations.manage',
      'conversations.csat',
      'tracking',
    ],
    isSystem: true,
  },
  {
    id: 'role_content',
    name: 'Marketing & Konten',
    description: 'Mengelola siaran promo, jadwal posting sosial media, WhatsApp Story, pustaka media & pelacakan.',
    permissions: [
      'dashboard',
      'contacts',
      'contacts.create',
      'broadcasts',
      'broadcasts.send',
      'birthday',
      'tracking',
    ],
    isSystem: true,
  },
  {
    id: 'role_auditor',
    name: 'Viewer / Auditor (Read-Only)',
    description: 'Hanya memantau dashboard, riwayat chat tim, dan status pengiriman tanpa bisa membalas atau menghapus data.',
    permissions: [
      'dashboard',
      'dashboard.export',
      'contacts',
      'broadcasts',
      'tracking',
      'conversations',
      'conversations.view_all',
    ],
    isSystem: true,
  },
];

const roleSeedPromises = new Map<string, Promise<void>>();
export function getCompanyAdminRoleId(companyId: string): string {
  const cid = getActiveCompanyId(companyId);
  return cid === DEFAULT_COMPANY_ID ? 'role_admin' : `role_admin_${cid}`;
}

export async function ensureDefaultRolesSeeded(companyId?: string | null): Promise<void> {
  const cid = getActiveCompanyId(companyId);
  let p = roleSeedPromises.get(cid);
  if (!p) {
    p = (async () => {
      const existing = await db
        .select({ id: crmRoles.id })
        .from(crmRoles)
        .where(eq(crmRoles.companyId, cid));
      const existingIds = new Set(existing.map((r) => r.id));
      const now = new Date();
      for (const starter of DEFAULT_STARTER_ROLES) {
        const targetId = cid === DEFAULT_COMPANY_ID ? starter.id : `${starter.id}_${cid}`;
        if (existingIds.has(targetId)) continue;
        await db
          .insert(crmRoles)
          .values({
            id: targetId,
            companyId: cid,
            name: starter.name,
            description: starter.description,
            permissions: JSON.stringify(starter.permissions),
            isSystem: starter.isSystem,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
          .catch(() => {});
      }
    })().catch(() => {
      roleSeedPromises.delete(cid);
    });
    roleSeedPromises.set(cid, p);
  }
  await p;
}

export async function getSettingMap(companyId?: string | null): Promise<Record<string, string>> {
  return getCompanySettingMap(companyId);
}

async function upsertSetting(key: string, value: string): Promise<void> {
  await upsertSystemSetting(key, value);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, hex] = parts;
  const expected = Buffer.from(hex, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function signSessionToken(
  email: string,
  secret: string,
  activeCompanyId?: string | null
): string {
  const payload = Buffer.from(
    JSON.stringify({
      email,
      ...(activeCompanyId ? { activeCompanyId } : {}),
      iat: Date.now(),
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export async function getAuthSigningSecret(): Promise<string> {
  const sys = await getSystemSettingMap();
  if (sys['crm_auth_secret']) return sys['crm_auth_secret'];
  const secret = crypto.randomBytes(32).toString('hex');
  await upsertSetting('crm_auth_secret', secret);
  return secret;
}

const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function verifyToken(
  token: string,
  secret: string
): { email: string; activeCompanyId?: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed?.email) return null;
    const iat = Number(parsed.iat || 0);
    if (iat > 0 && Date.now() - iat > TOKEN_MAX_AGE_MS) {
      return null;
    }
    return {
      email: String(parsed.email),
      activeCompanyId: parsed.activeCompanyId ? String(parsed.activeCompanyId) : undefined,
    };
  } catch {
    return null;
  }
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

const LEGACY_COARSE_EXPANSIONS: Record<string, PermissionKey[]> = {
  dashboard: ['dashboard', 'dashboard.export'],
  contacts: ['contacts', 'contacts.create', 'contacts.edit'],
  broadcasts: ['broadcasts', 'broadcasts.send'],
  birthday: ['birthday'],
  tracking: ['tracking'],
  conversations: [
    'conversations',
    'conversations.view_all',
    'conversations.reply',
    'conversations.manage',
    'conversations.csat',
  ],
  settings: ['settings', 'settings.edit'],
};

export function expandPermissionsList(
  rawList: string[],
  role: string,
  strictGranular = false
): PermissionKey[] {
  if (role === 'ADMIN') return [...ALL_PERMISSIONS];
  const validSet = new Set<PermissionKey>();
  const validKeys = ALL_PERMISSIONS as readonly string[];
  const filtered = rawList.filter((p): p is PermissionKey => validKeys.includes(p));
  const hasDottedKey = filtered.some((p) => p.includes('.'));

  for (const p of filtered) {
    validSet.add(p);
    if (!strictGranular && !hasDottedKey && LEGACY_COARSE_EXPANSIONS[p]) {
      for (const exp of LEGACY_COARSE_EXPANSIONS[p]) {
        validSet.add(exp);
      }
    }
  }
  return Array.from(validSet);
}

export function parseAgentPermissions(
  raw: string | null | undefined,
  role: string,
  strictGranular = false
): PermissionKey[] {
  if (role === 'ADMIN') return [...ALL_PERMISSIONS];
  let parsedList: string[] = [];
  if (!raw) {
    parsedList = ['dashboard', 'conversations', 'contacts'];
  } else {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsedList = parsed.map((p) => String(p).trim());
      }
    } catch {
      parsedList = raw
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
    }
  }
  return expandPermissionsList(parsedList, role, strictGranular);
}

async function ensurePrimaryAdminSeeded(map: Record<string, string>): Promise<void> {
  const existing = await db.select().from(crmAgents);
  if (existing.length > 0) return;

  const email = map['crm_admin_email'] || '';
  const name = map['crm_admin_name'] || 'Administrator';
  const passHash = map['crm_admin_password_hash'] || '';
  if (!email || !passHash) return;

  const now = new Date();
  await db
    .insert(crmAgents)
    .values({
      id: crypto.randomUUID(),
      companyId: DEFAULT_COMPANY_ID,
      name,
      email: email.toLowerCase(),
      passwordHash: passHash,
      role: 'ADMIN',
      isPlatformAdmin: true,
      roleId: 'role_admin',
      permissions: JSON.stringify([...ALL_PERMISSIONS]),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}

export interface AuthUserSession {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'AGENT';
  roleId?: string | null;
  roleName?: string | null;
  permissions: PermissionKey[];
  companyId?: string;
  homeCompanyId?: string;
  companyName?: string;
  companySlug?: string;
  companyStatus?: string;
  isPlatformAdmin?: boolean;
}

export function getRequestCompanyId(req: FastifyRequest): string {
  const fromReq = String((req as any)?.companyId || (req as any)?.authUser?.companyId || '').trim();
  return fromReq || getActiveCompanyId();
}

export function hasUserPermission(user: AuthUserSession | null | undefined, perm: PermissionKey): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  return Array.isArray(user.permissions) && user.permissions.includes(perm);
}

export function isAdminRoleId(roleId: string | null | undefined, companyId?: string): boolean {
  if (!roleId) return false;
  if (roleId === 'role_admin') return true;
  if (companyId && roleId === `role_admin_${companyId}`) return true;
  return roleId.startsWith('role_admin_');
}

export async function resolveAgentRoleSession(
  agent: typeof crmAgents.$inferSelect,
  overrideCompanyId?: string | null
): Promise<AuthUserSession> {
  const homeCompanyId = agent.companyId || DEFAULT_COMPANY_ID;
  const isPlatformAdmin = Boolean(agent.isPlatformAdmin);
  let effectiveCompanyId = homeCompanyId;

  if (isPlatformAdmin && overrideCompanyId && overrideCompanyId.trim()) {
    const cand = await db
      .select()
      .from(companies)
      .where(eq(companies.id, overrideCompanyId.trim()))
      .limit(1);
    if (cand[0]) {
      effectiveCompanyId = cand[0].id;
    }
  }

  await ensureDefaultRolesSeeded(homeCompanyId);
  let matchedRole: typeof crmRoles.$inferSelect | undefined;
  if (agent.roleId) {
    const roleRows = await db.select().from(crmRoles).where(eq(crmRoles.id, agent.roleId)).limit(1);
    matchedRole = roleRows[0];
  }
  const role: 'ADMIN' | 'AGENT' =
    agent.role === 'ADMIN' || isAdminRoleId(matchedRole?.id, homeCompanyId) ? 'ADMIN' : 'AGENT';
  const strictGranular = Boolean(matchedRole);
  const rawPermSource = matchedRole ? matchedRole.permissions : agent.permissions;

  const companyRows = await db
    .select()
    .from(companies)
    .where(eq(companies.id, effectiveCompanyId))
    .limit(1);
  const companyRow = companyRows[0];

  // When a Platform Superadmin switches into a tenant workspace, grant full ADMIN capabilities in that workspace
  const isSwitchedTenant = isPlatformAdmin && effectiveCompanyId !== homeCompanyId;

  return {
    id: agent.id,
    name: agent.name,
    email: agent.email,
    role: isSwitchedTenant ? 'ADMIN' : role,
    roleId: isSwitchedTenant
      ? getCompanyAdminRoleId(effectiveCompanyId)
      : matchedRole?.id || agent.roleId || (role === 'ADMIN' ? getCompanyAdminRoleId(homeCompanyId) : null),
    roleName: isSwitchedTenant
      ? 'Platform Superadmin (Mode Tenant)'
      : matchedRole?.name || (role === 'ADMIN' ? 'Administrator' : 'Agent Kustom'),
    permissions: isSwitchedTenant
      ? [...ALL_PERMISSIONS]
      : parseAgentPermissions(rawPermSource, role, strictGranular),
    companyId: effectiveCompanyId,
    homeCompanyId,
    companyName: companyRow?.name || 'Perusahaan Utama',
    companySlug: companyRow?.slug || 'default',
    companyStatus: companyRow?.status || 'ACTIVE',
    isPlatformAdmin,
  };
}

export async function getCurrentAuthUser(req: FastifyRequest): Promise<AuthUserSession | null> {
  if ((req as any)._authResolved) {
    return (req as any)._authUser || null;
  }

  const sysMap = await getSystemSettingMap();
  await ensurePrimaryAdminSeeded(sysMap);

  const secret = sysMap['crm_auth_secret'] || '';
  const token = parseCookie(req.headers.cookie, SESSION_COOKIE);
  const verified = token && secret ? verifyToken(token, secret) : null;
  if (!verified?.email) {
    (req as any)._authResolved = true;
    (req as any)._authUser = null;
    return null;
  }

  const rows = await db
    .select()
    .from(crmAgents)
    .where(eq(crmAgents.email, verified.email.toLowerCase()));
  const agent = rows[0];
  if (!agent || !agent.isActive) {
    (req as any)._authResolved = true;
    (req as any)._authUser = null;
    return null;
  }

  const headerOverride = String(req.headers['x-company-id'] || '').trim() || undefined;
  const session = await resolveAgentRoleSession(
    agent,
    headerOverride || verified.activeCompanyId || undefined
  );

  // Block suspended tenant logins/sessions for non-platform admins
  if (!session.isPlatformAdmin && session.companyStatus === 'SUSPENDED') {
    (req as any)._authResolved = true;
    (req as any)._authUser = null;
    return null;
  }

  (req as any)._authResolved = true;
  (req as any)._authUser = session;
  (req as any).authUser = session;
  (req as any).companyId = session.companyId;
  return session;
}

export { SESSION_COOKIE };

export function requirePermission(...allowed: PermissionKey[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await getCurrentAuthUser(req);
    if (!user) {
      return reply.status(401).send({ success: false, error: 'Sesi tidak valid' });
    }
    if (user.role === 'ADMIN') return;
    if (allowed.some((perm) => user.permissions.includes(perm))) return;
    return reply.status(403).send({
      success: false,
      code: 'PERMISSION_DENIED',
      error: `Akses fitur atau aksi ini dibatasi oleh role "${user.roleName || user.role}"`,
    });
  };
}

export default async function authRouter(fastify: FastifyInstance) {
  fastify.get('/status', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const map = await getSystemSettingMap();
      await ensurePrimaryAdminSeeded(map);

      const agents = await db.select().from(crmAgents);
      const initialized = agents.length > 0 || Boolean(map['crm_admin_email'] && map['crm_admin_password_hash']);
      const saasRegistrationEnabled = map['saas_registration_enabled'] !== 'false';

      if (!initialized) {
        return reply.send({
          success: true,
          data: { initialized: false, authenticated: false, saasRegistrationEnabled, user: null },
        });
      }

      const user = await getCurrentAuthUser(req);
      return reply.send({
        success: true,
        data: {
          initialized: true,
          authenticated: Boolean(user),
          saasRegistrationEnabled,
          user,
        },
      });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  fastify.post('/setup', async (req: FastifyRequest<{
    Body: { name: string; email: string; password: string; companyName?: string };
  }>, reply: FastifyReply) => {
    try {
      const map = await getSystemSettingMap();
      await ensurePrimaryAdminSeeded(map);
      const agents = await db.select().from(crmAgents);
      if (agents.length > 0 || (map['crm_admin_email'] && map['crm_admin_password_hash'])) {
        return reply.status(409).send({ success: false, error: 'Akun admin sudah terdaftar. Silakan login.' });
      }
      const name = String(req.body?.name || '').trim();
      const companyName = String(req.body?.companyName || name || 'Perusahaan Utama').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6) {
        return reply.status(400).send({ success: false, error: 'Nama, email valid, dan password (min. 6 karakter) wajib diisi.' });
      }

      const passHash = hashPassword(password);
      const secret = await getAuthSigningSecret();
      await upsertSetting('crm_admin_name', name);
      await upsertSetting('crm_admin_email', email);
      await upsertSetting('crm_admin_password_hash', passHash);

      const now = new Date();
      await db
        .update(companies)
        .set({
          name: companyName,
          ownerName: name,
          ownerEmail: email,
          updatedAt: now,
        })
        .where(eq(companies.id, DEFAULT_COMPANY_ID));

      await ensureDefaultRolesSeeded(DEFAULT_COMPANY_ID);
      await seedCompanyDefaults(DEFAULT_COMPANY_ID);

      const agentId = crypto.randomUUID();
      const [created] = await db
        .insert(crmAgents)
        .values({
          id: agentId,
          companyId: DEFAULT_COMPANY_ID,
          name,
          email,
          passwordHash: passHash,
          role: 'ADMIN',
          isPlatformAdmin: true,
          roleId: 'role_admin',
          permissions: JSON.stringify([...ALL_PERMISSIONS]),
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const token = signSessionToken(email, secret, DEFAULT_COMPANY_ID);
      reply.header('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
      const userSession = await resolveAgentRoleSession(created);
      return reply.send({
        success: true,
        data: {
          user: userSession,
        },
      });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // Self-service SaaS Company registration
  fastify.post('/register-company', async (req: FastifyRequest<{
    Body: { companyName?: string; name?: string; email?: string; password?: string; phone?: string };
  }>, reply: FastifyReply) => {
    try {
      const sysMap = await getSystemSettingMap();
      if (sysMap['saas_registration_enabled'] === 'false') {
        return reply.status(403).send({
          success: false,
          error: 'Pendaftaran perusahaan baru secara mandiri dinonaktifkan oleh pengelola platform.',
        });
      }

      const companyName = String(req.body?.companyName || '').trim();
      const name = String(req.body?.name || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const phone = req.body?.phone ? String(req.body.phone).trim() : null;

      if (!companyName || companyName.length < 2) {
        return reply.status(400).send({ success: false, error: 'Nama perusahaan wajib diisi (minimal 2 karakter).' });
      }
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6) {
        return reply.status(400).send({
          success: false,
          error: 'Nama penanggung jawab, email valid, dan kata sandi (min. 6 karakter) wajib diisi.',
        });
      }

      const dupEmail = await db
        .select({ id: crmAgents.id })
        .from(crmAgents)
        .where(eq(crmAgents.email, email))
        .limit(1);
      if (dupEmail[0]) {
        return reply.status(409).send({
          success: false,
          error: 'Email sudah terdaftar. Gunakan email lain atau masuk ke akun Anda.',
        });
      }

      const now = new Date();
      const companyId = `cmp_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const slug = await generateUniqueCompanySlug(companyName);
      const passHash = hashPassword(password);
      const secret = await getAuthSigningSecret();

      await db.insert(companies).values({
        id: companyId,
        name: companyName,
        slug,
        ownerName: name,
        ownerEmail: email,
        ownerPhone: phone,
        status: 'ACTIVE',
        isDefault: false,
        licenseStatus: 'UNLICENSED',
        licensePlan: 'Belum Diaktivasi',
        licensePeriod: 'monthly',
        licensePriceAmount: 0,
        trialUsed: false,
        createdAt: now,
        updatedAt: now,
      });

      await ensureDefaultRolesSeeded(companyId);
      await seedCompanyDefaults(companyId);

      const adminRoleId = getCompanyAdminRoleId(companyId);
      const [agent] = await db
        .insert(crmAgents)
        .values({
          id: crypto.randomUUID(),
          companyId,
          name,
          email,
          passwordHash: passHash,
          role: 'ADMIN',
          isPlatformAdmin: false,
          roleId: adminRoleId,
          permissions: JSON.stringify([...ALL_PERMISSIONS]),
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const token = signSessionToken(email, secret, companyId);
      reply.header(
        'Set-Cookie',
        `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
      );
      const userSession = await resolveAgentRoleSession(agent);
      return reply.status(201).send({
        success: true,
        data: { user: userSession },
      });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  fastify.post('/login', async (req: FastifyRequest<{
    Body: { email: string; password: string };
  }>, reply: FastifyReply) => {
    try {
      const sysMap = await getSystemSettingMap();
      await ensurePrimaryAdminSeeded(sysMap);
      const secret = await getAuthSigningSecret();

      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');

      const rows = await db.select().from(crmAgents).where(eq(crmAgents.email, email));
      const agent = rows[0];
      if (!agent || !verifyPassword(password, agent.passwordHash)) {
        return reply.status(401).send({ success: false, error: 'Email atau password salah.' });
      }
      if (!agent.isActive) {
        return reply.status(403).send({ success: false, error: 'Akun agent ini sedang dinonaktifkan oleh admin.' });
      }

      const compRows = await db
        .select()
        .from(companies)
        .where(eq(companies.id, agent.companyId || DEFAULT_COMPANY_ID))
        .limit(1);
      if (compRows[0]?.status === 'SUSPENDED' && !agent.isPlatformAdmin) {
        return reply.status(403).send({
          success: false,
          error: 'Workspace perusahaan Anda sedang disuspend. Hubungi administrator platform.',
        });
      }

      const token = signSessionToken(agent.email, secret, agent.companyId || DEFAULT_COMPANY_ID);
      reply.header('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
      const userSession = await resolveAgentRoleSession(agent);
      return reply.send({
        success: true,
        data: {
          user: userSession,
        },
      });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  fastify.post('/logout', async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.header('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return reply.send({ success: true });
  });
}
