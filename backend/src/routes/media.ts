import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requirePermission } from './auth';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'application/pdf': '.pdf',
};

const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
};

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

export default async function mediaRouter(fastify: FastifyInstance) {
  // Public file serving endpoint so Meta/Telegram servers and browser previews can fetch media
  fastify.get<{ Params: { filename: string } }>(
    '/files/:filename',
    async (req: FastifyRequest<{ Params: { filename: string } }>, reply: FastifyReply) => {
      try {
        const filename = String(req.params.filename || '').trim();
        if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
          return reply.status(400).send({ success: false, error: 'Invalid filename' });
        }
        const filePath = path.join(UPLOADS_DIR, filename);
        if (!fs.existsSync(filePath)) {
          return reply.status(404).send({ success: false, error: 'File not found' });
        }
        const ext = path.extname(filename).toLowerCase();
        const contentType = EXT_MIME[ext] || 'application/octet-stream';
        const buffer = await fs.promises.readFile(filePath);
        reply.header('Content-Type', contentType);
        reply.header('Cache-Control', 'public, max-age=86400');
        return reply.send(buffer);
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  // Authenticated upload endpoint (accepts base64 JSON payload)
  fastify.post<{
    Body: { fileName?: string; mimeType?: string; base64?: string };
  }>(
    '/upload',
    { preHandler: requirePermission('broadcasts', 'conversations') },
    async (req, reply) => {
      try {
        const mimeType = String(req.body?.mimeType || '').trim().toLowerCase();
        const base64Raw = String(req.body?.base64 || '').trim();
        if (!base64Raw) {
          return reply.status(400).send({ success: false, error: 'Data file base64 wajib diisi' });
        }

        const cleanBase64 = base64Raw.replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(cleanBase64, 'base64');
        if (buffer.length === 0) {
          return reply.status(400).send({ success: false, error: 'File kosong' });
        }
        if (buffer.length > 10 * 1024 * 1024) {
          return reply.status(400).send({
            success: false,
            error: 'Ukuran file maksimal 10 MB',
          });
        }

        const extFromName = path.extname(String(req.body?.fileName || '')).toLowerCase();
        const ext = MIME_EXT[mimeType] || (EXT_MIME[extFromName] ? extFromName : '.png');
        const safeName = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`;

        ensureUploadsDir();
        await fs.promises.writeFile(path.join(UPLOADS_DIR, safeName), buffer);

        const proto =
          (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() ||
          req.protocol ||
          'http';
        const host =
          (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() ||
          req.headers.host ||
          'localhost';
        const relativeUrl = `/api/media/files/${safeName}`;
        const url = `${proto}://${host}${relativeUrl}`;

        return reply.status(201).send({
          success: true,
          data: {
            filename: safeName,
            relativeUrl,
            url,
          },
        });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );
}
