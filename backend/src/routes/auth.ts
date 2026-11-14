import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '../db';
import { crmAgents, systemSettings } from '../db/schema';

const SESSION_COOKIE = 'crm_session';
export const ALL_PERMISSIONS = [
  'dashboard',
  'contacts',
  'broadcasts',
  'birthday',
  'tracking',
  'conversations',
  'settings',
] as const;

export type PermissionKey = (typeof ALL_PERMISSIONS)[number];

export async function getSettingMap(): Promise<Record<string, string>> {
  const rows = await db.select().from(systemSettings);
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }
  return map;
}

async function upsertSetting(key: string, value: string): Promise<void> {
  const now = new Date();
  await db
    .insert(systemSettings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value, updatedAt: now },
    });
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

function signToken(email: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ email, iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token: string, secret: string): { email: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return parsed?.email ? { email: String(parsed.email) } : null;
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

export function parseAgentPermissions(raw: string | null | undefined, role: string): string[] {
  if (role === 'ADMIN') return [...ALL_PERMISSIONS];
  if (!raw) return ['dashboard', 'conversations', 'contacts'];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((p) => String(p)).filter((p) => (ALL_PERMISSIONS as readonly string[]).includes(p));
    }
  } catch {
    // Fallback comma-separated
    return raw
      .split(',')
      .map((p) => p.trim())
      .filter((p) => (ALL_PERMISSIONS as readonly string[]).includes(p));
  }
  return ['dashboard', 'conversations', 'contacts'];
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
      name,
      email: email.toLowerCase(),
      passwordHash: passHash,
      role: 'ADMIN',
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
  permissions: string[];
}

export async function getCurrentAuthUser(req: FastifyRequest): Promise<AuthUserSession | null> {
  const map = await getSettingMap();
  await ensurePrimaryAdminSeeded(map);

  const secret = map['crm_auth_secret'] || '';
  const token = parseCookie(req.headers.cookie, SESSION_COOKIE);
  const verified = token && secret ? verifyToken(token, secret) : null;
  if (!verified?.email) return null;

  const rows = await db
    .select()
    .from(crmAgents)
    .where(eq(crmAgents.email, verified.email.toLowerCase()));
  const agent = rows[0];
  if (!agent || !agent.isActive) return null;

  const role: 'ADMIN' | 'AGENT' = agent.role === 'ADMIN' ? 'ADMIN' : 'AGENT';
  return {
    id: agent.id,
    name: agent.name,
    email: agent.email,
    role,
    permissions: parseAgentPermissions(agent.permissions, role),
  };
}

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
      error: 'Akses menu ini dibatasi oleh admin',
    });
  };
}

export default async function authRouter(fastify: FastifyInstance) {
  fastify.get('/status', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const map = await getSettingMap();
      await ensurePrimaryAdminSeeded(map);

      const agents = await db.select().from(crmAgents);
      const initialized = agents.length > 0 || Boolean(map['crm_admin_email'] && map['crm_admin_password_hash']);

      if (!initialized) {
        return reply.send({ success: true, data: { initialized: false, authenticated: false, user: null } });
      }

      const user = await getCurrentAuthUser(req);
      return reply.send({
        success: true,
        data: {
          initialized: true,
          authenticated: Boolean(user),
          user,
        },
      });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  fastify.post('/setup', async (req: FastifyRequest<{
    Body: { name: string; email: string; password: string };
  }>, reply: FastifyReply) => {
    try {
      const map = await getSettingMap();
      await ensurePrimaryAdminSeeded(map);
      const agents = await db.select().from(crmAgents);
      if (agents.length > 0 || (map['crm_admin_email'] && map['crm_admin_password_hash'])) {
        return reply.status(409).send({ success: false, error: 'Akun admin sudah terdaftar. Silakan login.' });
      }
      const name = String(req.body?.name || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      if (!name || !email || password.length < 6) {
        return reply.status(400).send({ success: false, error: 'Nama, email, dan password (min. 6 karakter) wajib diisi.' });
      }

      const passHash = hashPassword(password);
      const secret = map['crm_auth_secret'] || crypto.randomBytes(32).toString('hex');
      await upsertSetting('crm_admin_name', name);
      await upsertSetting('crm_admin_email', email);
      await upsertSetting('crm_admin_password_hash', passHash);
      await upsertSetting('crm_auth_secret', secret);

      const now = new Date();
      const agentId = crypto.randomUUID();
      await db.insert(crmAgents).values({
        id: agentId,
        name,
        email,
        passwordHash: passHash,
        role: 'ADMIN',
        permissions: JSON.stringify([...ALL_PERMISSIONS]),
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      const token = signToken(email, secret);
      reply.header('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
      return reply.send({
        success: true,
        data: {
          user: { id: agentId, name, email, role: 'ADMIN', permissions: [...ALL_PERMISSIONS] },
        },
      });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  fastify.post('/login', async (req: FastifyRequest<{
    Body: { email: string; password: string };
  }>, reply: FastifyReply) => {
    try {
      const map = await getSettingMap();
      await ensurePrimaryAdminSeeded(map);
      const secret = map['crm_auth_secret'] || crypto.randomBytes(32).toString('hex');
      if (!map['crm_auth_secret']) {
        await upsertSetting('crm_auth_secret', secret);
      }

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

      const token = signToken(agent.email, secret);
      reply.header('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
      const role: 'ADMIN' | 'AGENT' = agent.role === 'ADMIN' ? 'ADMIN' : 'AGENT';
      return reply.send({
        success: true,
        data: {
          user: {
            id: agent.id,
            name: agent.name,
            email: agent.email,
            role,
            permissions: parseAgentPermissions(agent.permissions, role),
          },
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
