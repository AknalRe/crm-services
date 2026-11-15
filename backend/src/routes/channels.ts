import crypto from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { channelAccounts, channelConnectLinks } from '../db/schema';
import { requirePermission } from './auth';
import {
  OmnichannelType,
  upsertInboundChannelMessage,
} from '../services/channel.service';

const ALLOWED_CHANNELS = new Set<OmnichannelType>([
  'INSTAGRAM',
  'FACEBOOK',
  'THREADS',
  'TELEGRAM',
]);

function maskChannelAccount(row: typeof channelAccounts.$inferSelect) {
  return {
    id: row.id,
    channel: row.channel,
    name: row.name,
    accountId: row.accountId,
    verifyToken: row.verifyToken,
    hasToken: Boolean(row.accessToken && row.accessToken.trim().length > 0),
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export default async function channelsRouter(fastify: FastifyInstance) {
  // List configured channel accounts
  fastify.get(
    '/',
    { preHandler: requirePermission('settings', 'conversations') },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const rows = await db
          .select()
          .from(channelAccounts)
          .orderBy(asc(channelAccounts.channel), asc(channelAccounts.createdAt));
        return reply.send({ success: true, data: rows.map(maskChannelAccount) });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  // Create channel account
  fastify.post<{
    Body: {
      channel?: string;
      name?: string;
      accountId?: string;
      accessToken?: string;
      verifyToken?: string;
    };
  }>('/', { preHandler: requirePermission('settings') }, async (req, reply) => {
    try {
      const channel = String(req.body?.channel || '').trim().toUpperCase() as OmnichannelType;
      if (!ALLOWED_CHANNELS.has(channel)) {
        return reply.status(400).send({
          success: false,
          error: 'Channel harus salah satu dari INSTAGRAM, FACEBOOK, THREADS, atau TELEGRAM',
        });
      }
      const name = String(req.body?.name || '').trim();
      const accountId = String(req.body?.accountId || '').trim();
      if (!name || !accountId) {
        return reply
          .status(400)
          .send({ success: false, error: 'Nama tampilan dan ID Akun / Page ID wajib diisi' });
      }
      const verifyToken =
        String(req.body?.verifyToken || '').trim() ||
        `reneo_${crypto.randomBytes(8).toString('hex')}`;
      const now = new Date();

      const [created] = await db
        .insert(channelAccounts)
        .values({
          id: crypto.randomUUID(),
          channel,
          name,
          accountId,
          accessToken: String(req.body?.accessToken || '').trim() || null,
          verifyToken,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return reply.status(201).send({ success: true, data: maskChannelAccount(created) });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // Update channel account
  fastify.patch<{
    Params: { id: string };
    Body: { name?: string; accountId?: string; accessToken?: string; isActive?: boolean };
  }>('/:id', { preHandler: requirePermission('settings') }, async (req, reply) => {
    try {
      const patch: Record<string, any> = { updatedAt: new Date() };
      if (req.body?.name !== undefined) patch.name = String(req.body.name).trim();
      if (req.body?.accountId !== undefined) patch.accountId = String(req.body.accountId).trim();
      if (req.body?.accessToken !== undefined && req.body.accessToken.trim() !== '') {
        patch.accessToken = req.body.accessToken.trim();
      }
      if (req.body?.isActive !== undefined) patch.isActive = Boolean(req.body.isActive);

      const [updated] = await db
        .update(channelAccounts)
        .set(patch)
        .where(eq(channelAccounts.id, req.params.id))
        .returning();
      if (!updated) {
        return reply.status(404).send({ success: false, error: 'Akun channel tidak ditemukan' });
      }
      return reply.send({ success: true, data: maskChannelAccount(updated) });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // Delete channel account
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requirePermission('settings') },
    async (req, reply) => {
      try {
        await db.delete(channelAccounts).where(eq(channelAccounts.id, req.params.id));
        return reply.send({ success: true });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  // Meta Graph Webhook Verification (Facebook Messenger, Instagram, Threads)
  fastify.get<{
    Querystring: {
      'hub.mode'?: string;
      'hub.verify_token'?: string;
      'hub.challenge'?: string;
    };
  }>('/webhook/meta', async (req, reply) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token) {
      const accounts = await db.select().from(channelAccounts);
      const matched = accounts.find((a) => a.isActive && a.verifyToken === token);
      if (matched) {
        return reply.code(200).send(challenge || 'OK');
      }
    }
    return reply.code(403).send({ error: 'Verify token tidak cocok' });
  });

  // Meta Graph Webhook Inbound (Instagram DM, Facebook Messenger, Threads Replies/Mentions)
  fastify.post('/webhook/meta', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    try {
      const body: any = req.body || {};
      const objectType = String(body.object || '').toLowerCase();
      const entries: any[] = Array.isArray(body.entry) ? body.entry : [];
      const allAccounts = await db.select().from(channelAccounts);

      for (const entry of entries) {
        const pageOrAccountId = String(entry.id || '');
        const channelGuess: OmnichannelType =
          objectType === 'instagram'
            ? 'INSTAGRAM'
            : objectType === 'threads'
            ? 'THREADS'
            : 'FACEBOOK';

        const account =
          allAccounts.find(
            (a) => a.isActive && a.accountId === pageOrAccountId && a.channel === channelGuess
          ) || allAccounts.find((a) => a.isActive && a.channel === channelGuess);

        if (!account) continue;

        // 1. Messenger / Instagram Messaging Events
        const messagingList: any[] = Array.isArray(entry.messaging) ? entry.messaging : [];
        for (const ev of messagingList) {
          if (ev.message?.is_echo) continue;
          const senderId = String(ev.sender?.id || '');
          if (!senderId || senderId === account.accountId) continue;

          const text = String(ev.message?.text || '').trim();
          const firstAttachment = Array.isArray(ev.message?.attachments)
            ? ev.message.attachments[0]
            : null;
          const mediaUrl = firstAttachment?.payload?.url || null;
          const mediaType = firstAttachment?.type || null;
          const displayBody = text || (mediaType ? `[${mediaType.toUpperCase()}]` : '');
          if (!displayBody) continue;

          await upsertInboundChannelMessage({
            channel: channelGuess,
            channelAccountId: account.id,
            externalSenderId: senderId,
            externalMessageId: ev.message?.mid || null,
            body: displayBody,
            mediaUrl,
            mediaType,
          });
        }

        // 2. Instagram / Facebook / Threads Comments & Mentions (changes array)
        const changes: any[] = Array.isArray(entry.changes) ? entry.changes : [];
        for (const ch of changes) {
          const val = ch.value || {};
          const text = String(val.text || val.message || '').trim();
          const senderId = String(val.from?.id || val.user_id || '');
          if (!text || !senderId || senderId === account.accountId) continue;

          await upsertInboundChannelMessage({
            channel: channelGuess,
            channelAccountId: account.id,
            externalSenderId: senderId,
            senderName: val.from?.name || val.from?.username || null,
            senderHandle: val.from?.username || val.username || null,
            externalMessageId: val.id || val.comment_id || null,
            externalThreadId: val.id || val.media?.id || null,
            contextTitle: ch.field ? `Interaksi ${ch.field}` : undefined,
            body: text,
          });
        }
      }

      return reply.code(200).send({ status: 'ok' });
    } catch (error: any) {
      console.error('[Meta Webhook] Error:', error.message);
      return reply.code(200).send({ status: 'ok' });
    }
  });

  // Telegram Bot Webhook Inbound
  fastify.post<{ Params: { accountId: string }; Body: any }>(
    '/webhook/telegram/:accountId',
    async (req, reply) => {
      try {
        const [account] = await db
          .select()
          .from(channelAccounts)
          .where(eq(channelAccounts.id, req.params.accountId));

        if (!account || !account.isActive || account.channel !== 'TELEGRAM') {
          return reply.code(404).send({ success: false, error: 'Akun Telegram tidak aktif' });
        }

        const tgBody: any = req.body || {};
        const msg = tgBody?.message || tgBody?.edited_message;
        if (msg && msg.chat?.id) {
          const chatId = String(msg.chat.id);
          const senderName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ');
          const senderHandle = msg.from?.username || null;
          const text = String(msg.text || msg.caption || '').trim();
          if (text) {
            await upsertInboundChannelMessage({
              channel: 'TELEGRAM',
              channelAccountId: account.id,
              externalSenderId: chatId,
              senderName: senderName || null,
              senderHandle,
              externalMessageId: msg.message_id ? `tg_${msg.message_id}` : null,
              body: text,
            });
          }
        }
        return reply.send({ ok: true });
      } catch (error: any) {
        console.error('[Telegram Webhook] Error:', error.message);
        return reply.send({ ok: true });
      }
    }
  );

  // Connect Links (Shareable OAuth/Account Onboarding Links for Clients)
  fastify.get(
    '/connect-links',
    { preHandler: requirePermission('settings') },
    async (_req, reply) => {
      try {
        const rows = await db
          .select()
          .from(channelConnectLinks)
          .orderBy(desc(channelConnectLinks.createdAt))
          .limit(20);
        return reply.send({ success: true, data: rows });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  fastify.post<{ Body: { channel?: string; label?: string; expiresHours?: number } }>(
    '/connect-links',
    { preHandler: requirePermission('settings') },
    async (req, reply) => {
      try {
        const channel = String(req.body?.channel || '').trim().toUpperCase() as OmnichannelType;
        if (!ALLOWED_CHANNELS.has(channel)) {
          return reply.status(400).send({
            success: false,
            error: 'Channel harus INSTAGRAM, FACEBOOK, THREADS, atau TELEGRAM',
          });
        }
        const hours = Math.max(1, Math.min(168, Number(req.body?.expiresHours) || 24));
        const now = new Date();
        const expiresAt = new Date(now.getTime() + hours * 3600 * 1000);
        const token = crypto.randomBytes(16).toString('hex');

        const [created] = await db
          .insert(channelConnectLinks)
          .values({
            id: crypto.randomUUID(),
            token,
            channel,
            label: String(req.body?.label || '').trim() || null,
            expiresAt,
            createdAt: now,
          })
          .returning();

        return reply.status(201).send({ success: true, data: created });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  // Public Connect Link endpoints (no panel login required, validated by token)
  fastify.get<{ Params: { token: string } }>('/connect/:token', async (req, reply) => {
    try {
      const [link] = await db
        .select()
        .from(channelConnectLinks)
        .where(eq(channelConnectLinks.token, req.params.token.trim()));
      if (!link) {
        return reply.status(404).send({ success: false, error: 'Tautan koneksi tidak ditemukan' });
      }
      const isExpired = new Date(link.expiresAt).getTime() < Date.now();
      return reply.send({
        success: true,
        data: {
          channel: link.channel,
          label: link.label,
          expiresAt: link.expiresAt,
          usedAt: link.usedAt,
          isExpired,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post<{
    Params: { token: string };
    Body: { name?: string; accountId?: string; accessToken?: string };
  }>('/connect/:token', async (req, reply) => {
    try {
      const [link] = await db
        .select()
        .from(channelConnectLinks)
        .where(eq(channelConnectLinks.token, req.params.token.trim()));
      if (!link) {
        return reply.status(404).send({ success: false, error: 'Tautan koneksi tidak ditemukan' });
      }
      if (link.usedAt) {
        return reply.status(400).send({ success: false, error: 'Tautan ini sudah pernah digunakan' });
      }
      if (new Date(link.expiresAt).getTime() < Date.now()) {
        return reply.status(400).send({ success: false, error: 'Tautan koneksi sudah kedaluwarsa' });
      }

      const name = String(req.body?.name || '').trim();
      const accountId = String(req.body?.accountId || '').trim();
      const accessToken = String(req.body?.accessToken || '').trim();
      if (!name || !accountId || !accessToken) {
        return reply.status(400).send({
          success: false,
          error: 'Nama akun, ID Akun/Page, dan Access Token wajib diisi',
        });
      }

      const now = new Date();
      const verifyToken = `reneo_${crypto.randomBytes(8).toString('hex')}`;
      const [created] = await db
        .insert(channelAccounts)
        .values({
          id: crypto.randomUUID(),
          channel: link.channel,
          name,
          accountId,
          accessToken,
          verifyToken,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await db
        .update(channelConnectLinks)
        .set({ usedAt: now, createdChannelAccountId: created.id })
        .where(eq(channelConnectLinks.id, link.id));

      return reply.status(201).send({
        success: true,
        message: `Akun ${link.channel} berhasil terhubung!`,
        data: maskChannelAccount(created),
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
