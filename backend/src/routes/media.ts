import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq, ilike, like } from 'drizzle-orm';
import { db } from '../db';
import {
  chatMessages,
  contactIdentities,
  contacts,
  conversations,
  persistedMedia,
} from '../db/schema';
import {
  AuthUserSession,
  getAuthSigningSecret,
  getCurrentAuthUser,
  requirePermission,
} from './auth';

export interface MediaRouterOptions {
  resolveAuthUser?: (req: FastifyRequest) => Promise<AuthUserSession | null>;
  resolveSigningSecret?: () => Promise<string>;
  uploadsDir?: string;
}

export function extractUploadedMediaFilename(rawUrl?: string | null): string | null {
  const match = String(rawUrl || '').trim().match(/\/api\/media\/files\/([a-zA-Z0-9._-]+)(?:[?#].*)?$/);
  if (!match) return null;
  const filename = match[1];
  if (!/^[a-zA-Z0-9._-]+$/.test(filename) || filename === '.' || filename === '..') {
    return null;
  }
  return filename;
}

export function signMediaAccessToken(filename: string, secret: string, ttlSeconds = 900): string {
  const exp = Math.floor(Date.now() / 1000) + Math.max(30, Math.floor(ttlSeconds));
  const sig = crypto.createHmac('sha256', secret).update(`${filename}:${exp}`).digest('base64url');
  return `${exp}.${sig}`;
}

export function verifyMediaAccessToken(
  filename: string,
  token: string,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000)
): boolean {
  if (!filename || !token || !secret) return false;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return false;
  const expStr = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!/^\d+$/.test(expStr) || !sig) return false;
  const exp = Number(expStr);
  if (!Number.isSafeInteger(exp) || exp < nowSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${filename}:${exp}`).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

export async function createSignedMediaFetchUrl(
  rawUrl: string,
  ttlSeconds = 900,
  secretOverride?: string
): Promise<string> {
  const trimmed = String(rawUrl || '').trim();
  const filename = extractUploadedMediaFilename(trimmed);
  if (!filename) return trimmed;
  const secret = secretOverride || (await getAuthSigningSecret());
  if (!secret) return trimmed;
  const tok = signMediaAccessToken(filename, secret, ttlSeconds);
  const hashIdx = trimmed.indexOf('#');
  const hash = hashIdx >= 0 ? trimmed.slice(hashIdx) : '';
  const withoutHash = hashIdx >= 0 ? trimmed.slice(0, hashIdx) : trimmed;
  const qIdx = withoutHash.indexOf('?');
  const basePath = qIdx >= 0 ? withoutHash.slice(0, qIdx) : withoutHash;
  const params = new URLSearchParams(qIdx >= 0 ? withoutHash.slice(qIdx + 1) : '');
  params.set('m_tok', tok);
  return `${basePath}?${params.toString()}${hash}`;
}

export function resolveUploadsDir(
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
  exists: (p: string) => boolean = fs.existsSync
): string {
  const explicit = String(env.MEDIA_UPLOAD_DIR || env.UPLOAD_DIR || '').trim();
  if (explicit) return path.resolve(explicit);
  // Persist uploads inside /app/data so container recreates/updates preserve all media files
  if (cwd === '/app' && exists('/app/data')) {
    return '/app/data/uploads';
  }
  return path.resolve(cwd, 'uploads');
}

const UPLOADS_DIR = resolveUploadsDir();
const META_DIR = path.join(UPLOADS_DIR, '.meta');

export interface MediaMetadata {
  channel?: string; // e.g. 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | 'THREADS' | 'TELEGRAM' | 'DIRECT'
  sessionName?: string; // e.g. 'WA_TEST', 'HRIS_HR', 'sales'
  senderName?: string;
  senderPhone?: string;
  source?: 'INBOUND' | 'OUTBOUND' | 'UPLOAD' | 'BROADCAST';
  originalFileName?: string;
  label?: string; // e.g. 'WA • WA_TEST'
}

export async function saveMediaMetadata(filename: string, meta: MediaMetadata): Promise<void> {
  try {
    if (!fs.existsSync(META_DIR)) {
      await fs.promises.mkdir(META_DIR, { recursive: true });
    }
    await fs.promises.writeFile(
      path.join(META_DIR, `${filename}.json`),
      JSON.stringify(meta, null, 2),
      'utf-8'
    );
  } catch (err: any) {
    console.warn('[MediaMetadata] Gagal menyimpan metadata media:', err?.message);
  }
}

export async function readMediaMetadata(filename: string): Promise<MediaMetadata | null> {
  try {
    const metaPath = path.join(META_DIR, `${filename}.json`);
    if (fs.existsSync(metaPath)) {
      const content = await fs.promises.readFile(metaPath, 'utf-8');
      return JSON.parse(content) as MediaMetadata;
    }
  } catch {
    // ignore
  }
  return null;
}
const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'video/x-msvideo': '.avi',
  'video/3gpp': '.3gp',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/opus': '.opus',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/csv': '.csv',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'text/vcard': '.vcf',
  'application/json': '.json',
  'application/xml': '.xml',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'application/x-rar-compressed': '.rar',
  'application/x-7z-compressed': '.7z',
};

const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.3gp': 'video/3gpp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.opus': 'audio/opus',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.vcf': 'text/vcard',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
  '.rar': 'application/x-rar-compressed',
  '.7z': 'application/x-7z-compressed',
};

function normalizeMimeBase(raw?: string | null): string {
  return String(raw || '').split(';')[0].trim().toLowerCase();
}

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

// Profile photos live in a separate folder AND persist in PostgreSQL so container updates never lose avatars
const PROFILES_DIR = path.join(UPLOADS_DIR, 'profiles');
const PROFILE_EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
const backedUpProfileKeys = new Set<string>();
const inflightProfileHeals = new Map<string, Promise<{ buffer: Buffer; mimeType: string } | null>>();

function extractProfileFilename(relativeUrl?: string | null): string | null {
  const match = String(relativeUrl || '').match(/\/api\/media\/profiles\/([a-zA-Z0-9._-]+)(?:[?#].*)?$/);
  return match ? match[1] : null;
}

async function persistProfileBlobToDb(
  filename: string,
  mimeType: string,
  buffer: Buffer
): Promise<void> {
  const key = `profiles/${filename}`;
  try {
    const b64 = buffer.toString('base64');
    await db
      .insert(persistedMedia)
      .values({ key, mimeType, dataBase64: b64 })
      .onConflictDoUpdate({
        target: persistedMedia.key,
        set: { mimeType, dataBase64: b64 },
      });
    backedUpProfileKeys.add(key);
  } catch {
    // Non-fatal in environments without DB initialized (e.g. unit tests)
  }
}

export async function restorePersistedProfilePicture(relativeUrl?: string | null): Promise<boolean> {
  const filename = extractProfileFilename(relativeUrl);
  if (!filename) return Boolean(relativeUrl);
  const filePath = path.join(PROFILES_DIR, filename);
  if (fs.existsSync(filePath)) return true;

  try {
    const rows = await db
      .select({
        mimeType: persistedMedia.mimeType,
        dataBase64: persistedMedia.dataBase64,
      })
      .from(persistedMedia)
      .where(eq(persistedMedia.key, `profiles/${filename}`))
      .limit(1);
    const row = rows[0];
    if (!row?.dataBase64) return false;
    const buf = Buffer.from(row.dataBase64, 'base64');
    if (buf.length === 0) return false;
    await fs.promises.mkdir(PROFILES_DIR, { recursive: true });
    await fs.promises.writeFile(filePath, buf);
    backedUpProfileKeys.add(`profiles/${filename}`);
    return true;
  } catch {
    return false;
  }
}

async function healMissingProfilePicture(
  filename: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const existingHeal = inflightProfileHeals.get(filename);
  if (existingHeal) return existingHeal;

  const task = (async (): Promise<{ buffer: Buffer; mimeType: string } | null> => {
    try {
      const contactRows = await db
        .select({
          id: contacts.id,
          companyId: contacts.companyId,
          nomorWhatsapp: contacts.nomorWhatsapp,
        })
        .from(contacts)
        .where(like(contacts.profilePictureUrl, `%/${filename}`))
        .limit(1);
      const contact = contactRows[0];
      if (!contact) return null;

      const convRows = await db
        .select({
          externalThreadId: conversations.externalThreadId,
          wahaSession: conversations.wahaSession,
          isGroup: conversations.isGroup,
        })
        .from(conversations)
        .where(
          and(
            eq(conversations.companyId, contact.companyId),
            eq(conversations.contactId, contact.id),
            eq(conversations.channel, 'WHATSAPP')
          )
        )
        .orderBy(desc(conversations.lastMessageAt), desc(conversations.createdAt))
        .limit(1);
      const conv = convRows[0];

      let jid = conv?.externalThreadId?.trim() || '';
      const isGroup = Boolean(conv?.isGroup || jid.toLowerCase().endsWith('@g.us'));
      if (!jid) {
        const idRows = await db
          .select({ externalId: contactIdentities.externalId })
          .from(contactIdentities)
          .where(
            and(
              eq(contactIdentities.companyId, contact.companyId),
              eq(contactIdentities.contactId, contact.id),
              eq(contactIdentities.channel, 'WHATSAPP')
            )
          )
          .limit(1);
        jid = idRows[0]?.externalId?.trim() || '';
      }
      if (!jid && contact.nomorWhatsapp) {
        const digits = contact.nomorWhatsapp.replace(/\D/g, '');
        if (digits) jid = `${digits}@c.us`;
      }
      if (!jid) return null;

      const { syncWhatsAppProfile } = await import('../services/profile.service');
      const synced = await syncWhatsAppProfile({
        companyId: contact.companyId,
        contactId: contact.id,
        jid,
        session: conv?.wahaSession || undefined,
        isGroup,
        force: true,
      });

      const healedFilename = extractProfileFilename(synced.profilePictureUrl);
      if (!healedFilename) return null;
      const healedPath = path.join(PROFILES_DIR, healedFilename);
      if (!fs.existsSync(healedPath)) return null;
      const buffer = await fs.promises.readFile(healedPath);
      const ext = path.extname(healedFilename).toLowerCase();
      return {
        buffer,
        mimeType: PROFILE_EXT_MIME[ext] || 'image/jpeg',
      };
    } catch {
      return null;
    } finally {
      inflightProfileHeals.delete(filename);
    }
  })();

  inflightProfileHeals.set(filename, task);
  return task;
}

export async function saveProfilePictureFile(params: {
  buffer: Buffer;
  mimeType?: string;
}): Promise<{ filename: string; relativeUrl: string }> {
  if (!params.buffer || params.buffer.length === 0) {
    throw new Error('Foto profil kosong');
  }
  if (params.buffer.length > 3 * 1024 * 1024) {
    throw new Error('Ukuran foto profil melebihi 3 MB');
  }
  const mime = normalizeMimeBase(params.mimeType);
  const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
  const storedMime = PROFILE_EXT_MIME[ext] || 'image/jpeg';
  const filename = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`;
  await fs.promises.mkdir(PROFILES_DIR, { recursive: true });
  await fs.promises.writeFile(path.join(PROFILES_DIR, filename), params.buffer);
  await persistProfileBlobToDb(filename, storedMime, params.buffer);
  return { filename, relativeUrl: `/api/media/profiles/${filename}` };
}

export async function deleteProfilePictureFile(relativeUrl?: string | null): Promise<void> {
  const filename = extractProfileFilename(relativeUrl);
  if (!filename) return;
  await fs.promises.unlink(path.join(PROFILES_DIR, filename)).catch(() => {});
  try {
    const key = `profiles/${filename}`;
    backedUpProfileKeys.delete(key);
    await db.delete(persistedMedia).where(eq(persistedMedia.key, key));
  } catch {
    // Non-fatal in unit tests
  }
}

export async function saveMediaBufferFile(params: {
  buffer: Buffer;
  mimeType?: string;
  fileName?: string;
  maxBytes?: number;
  fallbackExt?: string;
  metadata?: MediaMetadata;
}): Promise<{ filename: string; relativeUrl: string; mimeType: string }> {
  const mimeType = normalizeMimeBase(params.mimeType);
  const maxBytes = params.maxBytes ?? 10 * 1024 * 1024;
  if (!params.buffer || params.buffer.length === 0) {
    throw new Error('File kosong');
  }
  if (params.buffer.length > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    throw new Error(`Ukuran file maksimal ${mb} MB`);
  }

  const extFromName = path.extname(String(params.fileName || '')).toLowerCase();
  const ext =
    MIME_EXT[mimeType] ||
    (EXT_MIME[extFromName] ? extFromName : params.fallbackExt || '.bin');
  const safeName = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`;

  ensureUploadsDir();
  await fs.promises.writeFile(path.join(UPLOADS_DIR, safeName), params.buffer);

  if (params.metadata) {
    await saveMediaMetadata(safeName, {
      ...params.metadata,
      originalFileName: params.metadata.originalFileName || params.fileName,
    });
  }

  return {
    filename: safeName,
    relativeUrl: `/api/media/files/${safeName}`,
    mimeType: mimeType || EXT_MIME[ext] || 'application/octet-stream',
  };
}

export async function saveBase64MediaFile(params: {
  base64: string;
  mimeType?: string;
  fileName?: string;
  maxBytes?: number;
  fallbackExt?: string;
  metadata?: MediaMetadata;
}): Promise<{ filename: string; relativeUrl: string; mimeType: string }> {
  const dataUriMatch = String(params.base64 || '')
    .trim()
    .match(/^data:([^;]+)(?:;[^,]*)?;base64,(.*)$/is);
  const inferredMime = dataUriMatch?.[1] || params.mimeType;
  const cleanBase64 = (dataUriMatch ? dataUriMatch[2] : String(params.base64 || '')).trim();
  if (!cleanBase64) {
    throw new Error('Data file base64 wajib diisi');
  }
  const buffer = Buffer.from(cleanBase64, 'base64');
  return saveMediaBufferFile({
    buffer,
    mimeType: params.mimeType || inferredMime,
    fileName: params.fileName,
    maxBytes: params.maxBytes,
    fallbackExt: params.fallbackExt,
    metadata: params.metadata,
  });
}

export async function readUploadedMediaAsDataUri(
  mediaUrl: string,
  fallbackMimeType?: string
): Promise<{ dataUri: string; mimetype: string } | null> {
  const trimmed = String(mediaUrl || '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:')) {
    const mimeMatch = trimmed.match(/^data:([^;]+);base64,/);
    return {
      dataUri: trimmed,
      mimetype: mimeMatch?.[1] || fallbackMimeType || 'application/octet-stream',
    };
  }
  const match = trimmed.match(/\/api\/media\/files\/([a-zA-Z0-9._-]+)(?:[?#].*)?$/);
  if (!match) return null;
  const filename = match[1];
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  const ext = path.extname(filename).toLowerCase();
  const mimetype = fallbackMimeType || EXT_MIME[ext] || 'application/octet-stream';
  const buf = await fs.promises.readFile(filePath);
  return {
    dataUri: `data:${mimetype};base64,${buf.toString('base64')}`,
    mimetype,
  };
}

function resolveMediaAppPrefix(req: FastifyRequest): string {
  const rawPrefix = String(req.headers['x-forwarded-prefix'] || '').split(',')[0].trim();
  if (rawPrefix && /^\/app\/[^/]+/i.test(rawPrefix)) {
    return rawPrefix.replace(/\/+$/, '');
  }
  const referer = String(req.headers.referer || '').trim();
  const refMatch = referer.match(/https?:\/\/[^/]+(\/app\/[^/]+)/i);
  return refMatch ? refMatch[1] : '';
}

export default async function mediaRouter(
  fastify: FastifyInstance,
  opts: MediaRouterOptions = {}
) {
  const resolveAuthUser = opts.resolveAuthUser || getCurrentAuthUser;
  const resolveSigningSecret = opts.resolveSigningSecret || getAuthSigningSecret;
  const activeUploadsDir = opts.uploadsDir ? path.resolve(opts.uploadsDir) : UPLOADS_DIR;
  const activeProfilesDir = path.join(activeUploadsDir, 'profiles');

  // List all uploaded media files in uploads/
  fastify.get(
    '/',
    { preHandler: requirePermission('broadcasts', 'conversations') },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        ensureUploadsDir();
        const entries = await fs.promises.readdir(UPLOADS_DIR, { withFileTypes: true });
        const proto =
          (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() ||
          req.protocol ||
          'http';
        const host =
          (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() ||
          req.headers.host ||
          'localhost';
        const appPrefix = resolveMediaAppPrefix(req);

        const validEntries = entries.filter(
          (e) => e.isFile() && /^[a-zA-Z0-9._-]+$/.test(e.name)
        );

        const items = await Promise.all(
          validEntries.map(async (e) => {
            const full = path.join(UPLOADS_DIR, e.name);
            const stat = await fs.promises.stat(full);
            const ext = path.extname(e.name).toLowerCase();
            const mimeType = EXT_MIME[ext] || 'application/octet-stream';
            const relativeUrl = `/api/media/files/${e.name}`;

            let meta = await readMediaMetadata(e.name);
            if (!meta) {
              // Auto-backfill metadata from chat_messages table if this file originated from a chat
              try {
                const matchedMsg = await db
                  .select({
                    channel: chatMessages.channel,
                    wahaSession: chatMessages.wahaSession,
                    senderName: chatMessages.senderName,
                    senderPhone: chatMessages.senderPhone,
                    direction: chatMessages.direction,
                    mediaName: chatMessages.mediaName,
                  })
                  .from(chatMessages)
                  .where(ilike(chatMessages.mediaUrl, `%${e.name}%`))
                  .limit(1);

                if (matchedMsg && matchedMsg[0]) {
                  const m = matchedMsg[0];
                  const ch = (m.channel || 'WHATSAPP').toUpperCase();
                  const sess = m.wahaSession || undefined;
                  const label =
                    ch === 'WHATSAPP'
                      ? sess
                        ? `WA • ${sess}`
                        : 'WhatsApp'
                      : sess
                      ? `${ch} • ${sess}`
                      : ch;

                  meta = {
                    channel: ch,
                    sessionName: sess,
                    senderName: m.senderName || undefined,
                    senderPhone: m.senderPhone || undefined,
                    source: m.direction === 'INBOUND' ? 'INBOUND' : 'OUTBOUND',
                    originalFileName: m.mediaName || undefined,
                    label,
                  };
                  void saveMediaMetadata(e.name, meta);
                }
              } catch {
                // Ignore DB error if connection or query is not ready
              }
            }

            const channel = meta?.channel || undefined;
            const sessionName = meta?.sessionName || undefined;
            const label =
              meta?.label ||
              (channel
                ? `${channel === 'WHATSAPP' ? 'WA' : channel}${sessionName ? ` • ${sessionName}` : ''}`
                : undefined);

            const mediaKind = mimeType.startsWith('image/')
              ? 'image'
              : mimeType.startsWith('video/')
              ? 'video'
              : mimeType.startsWith('audio/')
              ? 'audio'
              : 'document';

            return {
              filename: e.name,
              url: `${proto}://${host}${appPrefix}${relativeUrl}`,
              relativeUrl,
              mimeType,
              mediaKind,
              sizeBytes: stat.size,
              createdAt: stat.mtime.toISOString(),
              channel,
              sessionName,
              senderName: meta?.senderName,
              senderPhone: meta?.senderPhone,
              source: meta?.source,
              label,
              originalFileName: meta?.originalFileName,
            };
          })
        );
        items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return reply.send({ success: true, data: items });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  // Delete an uploaded media file
  fastify.delete<{ Params: { filename: string } }>(
    '/files/:filename',
    { preHandler: requirePermission('broadcasts.send') },
    async (req, reply) => {
      try {
        const filename = String(req.params.filename || '').trim();
        if (!/^[a-zA-Z0-9._-]+$/.test(filename) || filename === '.' || filename === '..') {
          return reply.status(400).send({ success: false, error: 'Invalid filename' });
        }
        const filePath = path.join(UPLOADS_DIR, filename);
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
        }
        const metaPath = path.join(META_DIR, `${filename}.json`);
        if (fs.existsSync(metaPath)) {
          await fs.promises.unlink(metaPath).catch(() => {});
        }
        return reply.send({ success: true });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  // Authenticated file serving endpoint (or signed short-lived m_tok for external channel publishing) with HTTP Range support
  fastify.get<{ Params: { filename: string }; Querystring: { m_tok?: string } }>(
    '/files/:filename',
    async (
      req: FastifyRequest<{ Params: { filename: string }; Querystring: { m_tok?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const filename = String(req.params.filename || '').trim();
        if (!/^[a-zA-Z0-9._-]+$/.test(filename) || filename === '.' || filename === '..') {
          return reply.status(400).send({ success: false, error: 'Invalid filename' });
        }

        const rawTok = typeof req.query?.m_tok === 'string' ? req.query.m_tok.trim() : '';
        const authUser = await resolveAuthUser(req);
        let tokenAuthorized = false;
        if (!authUser && rawTok) {
          const secret = await resolveSigningSecret().catch(() => '');
          tokenAuthorized = Boolean(secret && verifyMediaAccessToken(filename, rawTok, secret));
        }
        if (!authUser && !tokenAuthorized) {
          return reply
            .status(401)
            .header('Cache-Control', 'no-store')
            .send({ success: false, error: 'Autentikasi diperlukan untuk mengakses berkas media' });
        }

        const filePath = path.join(activeUploadsDir, filename);
        if (!fs.existsSync(filePath)) {
          return reply.status(404).send({ success: false, error: 'File not found' });
        }
        const stat = await fs.promises.stat(filePath);
        const totalSize = stat.size;
        const ext = path.extname(filename).toLowerCase();
        const contentType = EXT_MIME[ext] || 'application/octet-stream';
        reply.header('Content-Type', contentType);
        reply.header('Content-Disposition', `inline; filename="${filename.replace(/"/g, '')}"`);
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('Accept-Ranges', 'bytes');
        reply.header('Vary', 'Cookie');
        reply.header('Cache-Control', tokenAuthorized ? 'private, no-store' : 'private, max-age=3600');

        const rangeHeader = String(req.headers.range || '').trim();
        const rangeMatch = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
        if (rangeMatch && totalSize > 0) {
          const start = rangeMatch[1] ? Math.min(Number(rangeMatch[1]), totalSize - 1) : 0;
          const end = rangeMatch[2]
            ? Math.min(Number(rangeMatch[2]), totalSize - 1)
            : totalSize - 1;
          if (!Number.isNaN(start) && !Number.isNaN(end) && start <= end) {
            reply.status(206);
            reply.header('Content-Range', `bytes ${start}-${end}/${totalSize}`);
            reply.header('Content-Length', String(end - start + 1));
            return reply.send(fs.createReadStream(filePath, { start, end }));
          }
        }

        reply.header('Content-Length', String(totalSize));
        return reply.send(fs.createReadStream(filePath));
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  // Serve cached WhatsApp profile photos strictly to authenticated CRM users
  fastify.get<{ Params: { filename: string } }>(
    '/profiles/:filename',
    async (req: FastifyRequest<{ Params: { filename: string } }>, reply: FastifyReply) => {
      try {
        const filename = String(req.params.filename || '').trim();
        if (!/^[a-zA-Z0-9._-]+$/.test(filename) || filename === '.' || filename === '..') {
          return reply.status(400).send({ success: false, error: 'Invalid filename' });
        }

        const authUser = await resolveAuthUser(req);
        if (!authUser) {
          return reply
            .status(401)
            .header('Cache-Control', 'no-store')
            .send({ success: false, error: 'Autentikasi diperlukan untuk mengakses foto profil' });
        }

        const filePath = path.join(activeProfilesDir, filename);
        const ext = path.extname(filename).toLowerCase();
        const fallbackMime = PROFILE_EXT_MIME[ext] || 'image/jpeg';
        const key = `profiles/${filename}`;

        if (fs.existsSync(filePath)) {
          if (!backedUpProfileKeys.has(key)) {
            backedUpProfileKeys.add(key);
            void fs.promises
              .readFile(filePath)
              .then((buf) => persistProfileBlobToDb(filename, fallbackMime, buf))
              .catch(() => {});
          }
          reply.header('Content-Type', fallbackMime);
          reply.header('Vary', 'Cookie');
          reply.header('Cache-Control', 'private, max-age=3600');
          return reply.send(fs.createReadStream(filePath));
        }

        const restored = await restorePersistedProfilePicture(`/api/media/profiles/${filename}`);
        if (restored && fs.existsSync(filePath)) {
          reply.header('Content-Type', fallbackMime);
          reply.header('Vary', 'Cookie');
          reply.header('Cache-Control', 'private, max-age=3600');
          return reply.send(fs.createReadStream(filePath));
        }

        const healed = await healMissingProfilePicture(filename);
        if (healed) {
          reply.header('Content-Type', healed.mimeType);
          reply.header('Vary', 'Cookie');
          reply.header('Cache-Control', 'no-store');
          return reply.send(healed.buffer);
        }

        return reply.status(404).send({ success: false, error: 'File not found' });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  // Authenticated upload endpoint (accepts base64 JSON payload)
  fastify.post<{
    Body: {
      fileName?: string;
      mimeType?: string;
      base64?: string;
      channel?: string;
      sessionName?: string;
      label?: string;
      source?: 'INBOUND' | 'OUTBOUND' | 'UPLOAD' | 'BROADCAST';
    };
  }>(
    '/upload',
    { preHandler: requirePermission('broadcasts.send', 'conversations.reply') },
    async (req, reply) => {
      try {
        const customChannel = req.body?.channel || undefined;
        const customSession = req.body?.sessionName || undefined;
        const customLabel =
          req.body?.label ||
          (customChannel
            ? `${customChannel === 'WHATSAPP' ? 'WA' : customChannel}${customSession ? ` • ${customSession}` : ''}`
            : 'Unggahan Langsung');

        const extFromFileName = path.extname(String(req.body?.fileName || '')).toLowerCase();
        const rawUploadMime = normalizeMimeBase(req.body?.mimeType);
        const effectiveMime =
          rawUploadMime && rawUploadMime !== 'application/octet-stream'
            ? rawUploadMime
            : EXT_MIME[extFromFileName] || rawUploadMime || undefined;

        const saved = await saveBase64MediaFile({
          base64: req.body?.base64 || '',
          mimeType: effectiveMime,
          fileName: req.body?.fileName,
          maxBytes: 25 * 1024 * 1024,
          fallbackExt: '.bin',
          metadata: {
            channel: customChannel,
            sessionName: customSession,
            label: customLabel,
            source: req.body?.source || 'UPLOAD',
            originalFileName: req.body?.fileName,
          },
        });

        const proto =
          (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() ||
          req.protocol ||
          'http';
        const host =
          (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() ||
          req.headers.host ||
          'localhost';
        const appPrefix = resolveMediaAppPrefix(req);
        const relativeUrl = saved.relativeUrl;
        const safeName = saved.filename;
        const url = `${proto}://${host}${appPrefix}${relativeUrl}`;

        return reply.status(201).send({
          success: true,
          data: {
            filename: safeName,
            relativeUrl,
            url,
            channel: customChannel,
            sessionName: customSession,
            label: customLabel,
          },
        });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );
}
