import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '../db';
import { systemSettings } from '../db/schema';

const SESSION_COOKIE = 'crm_session';

async function getSettingMap(): Promise<Record<string, string>> {
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

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
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

export default async function authRouter(fastify: FastifyInstance) {
  fastify.get('/status', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const map = await getSettingMap();
      const email = map['crm_admin_email'] || '';
      const name = map['crm_admin_name'] || '';
      const passHash = map['crm_admin_password_hash'] || '';
      const secret = map['crm_auth_secret'] || '';
      const initialized = Boolean(email && passHash);

      if (!initialized) {
        return reply.send({ success: true, data: { initialized: false, authenticated: false, user: null } });
      }

      const token = parseCookie(req.headers.cookie, SESSION_COOKIE);
      const verified = token && secret ? verifyToken(token, secret) : null;
      const authenticated = Boolean(verified && verified.email === email);

      return reply.send({
        success: true,
        data: {
          initialized: true,
          authenticated,
          user: authenticated ? { name, email } : null,
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
      if (map['crm_admin_email'] && map['crm_admin_password_hash']) {
        return reply.status(409).send({ success: false, error: 'Akun admin sudah terdaftar. Silakan login.' });
      }
      const name = String(req.body?.name || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      if (!name || !email || password.length < 6) {
        return reply.status(400).send({ success: false, error: 'Nama, email, dan password (min. 6 karakter) wajib diisi.' });
      }

      const secret = map['crm_auth_secret'] || crypto.randomBytes(32).toString('hex');
      await upsertSetting('crm_admin_name', name);
      await upsertSetting('crm_admin_email', email);
      await upsertSetting('crm_admin_password_hash', hashPassword(password));
      await upsertSetting('crm_auth_secret', secret);

      const token = signToken(email, secret);
      reply.header('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
      return reply.send({ success: true, data: { user: { name, email } } });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  fastify.post('/login', async (req: FastifyRequest<{
    Body: { email: string; password: string };
  }>, reply: FastifyReply) => {
    try {
      const map = await getSettingMap();
      const storedEmail = map['crm_admin_email'] || '';
      const storedName = map['crm_admin_name'] || '';
      const storedHash = map['crm_admin_password_hash'] || '';
      const secret = map['crm_auth_secret'] || '';
      if (!storedEmail || !storedHash) {
        return reply.status(400).send({ success: false, error: 'Setup awal belum dilakukan.' });
      }
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      if (email !== storedEmail || !verifyPassword(password, storedHash)) {
        return reply.status(401).send({ success: false, error: 'Email atau password salah.' });
      }
      const token = signToken(storedEmail, secret);
      reply.header('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
      return reply.send({ success: true, data: { user: { name: storedName, email: storedEmail } } });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  fastify.post('/logout', async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.header('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return reply.send({ success: true });
  });
}

