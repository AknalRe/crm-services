import crypto from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { channelAccounts, scheduledPosts } from '../db/schema';
import { PostService } from '../services/post.service';
import { requirePermission } from './auth';

export default async function postsRouter(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requirePermission('broadcasts'));

  fastify.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const rows = await db
        .select({
          post: scheduledPosts,
          accountName: channelAccounts.name,
          accountExternalId: channelAccounts.accountId,
        })
        .from(scheduledPosts)
        .leftJoin(channelAccounts, eq(scheduledPosts.channelAccountId, channelAccounts.id))
        .orderBy(desc(scheduledPosts.scheduledAt));

      const data = rows.map((r) => ({
        ...r.post,
        accountName: r.accountName || null,
        accountExternalId: r.accountExternalId || null,
      }));
      return reply.send({ success: true, data });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post<{
    Body: {
      channel?: string;
      channelAccountId?: string;
      caption?: string;
      mediaUrl?: string | null;
      targetChatId?: string | null;
      scheduledAt?: string | null;
      publishNow?: boolean;
    };
  }>('/', async (req, reply) => {
    try {
      const channel = String(req.body?.channel || '').trim().toUpperCase();
      const channelAccountId = String(req.body?.channelAccountId || '').trim();
      const caption = String(req.body?.caption || '').trim();
      const mediaUrl = req.body?.mediaUrl ? String(req.body.mediaUrl).trim() : null;
      const targetChatId = req.body?.targetChatId ? String(req.body.targetChatId).trim() : null;
      const publishNow = Boolean(req.body?.publishNow);

      if (!channel || !channelAccountId || !caption) {
        return reply.status(400).send({
          success: false,
          error: 'Channel, akun kanal, dan caption wajib diisi.',
        });
      }
      if (channel === 'INSTAGRAM' && !mediaUrl) {
        return reply.status(400).send({
          success: false,
          error: 'Postingan Instagram memerlukan URL gambar/media publik.',
        });
      }
      if (channel === 'TELEGRAM' && !targetChatId) {
        return reply.status(400).send({
          success: false,
          error: 'Target Channel / Group ID Telegram wajib diisi.',
        });
      }

      const [account] = await db
        .select()
        .from(channelAccounts)
        .where(eq(channelAccounts.id, channelAccountId));
      if (!account || !account.isActive || account.channel !== channel) {
        return reply.status(400).send({
          success: false,
          error: `Akun kanal ${channel} tidak ditemukan atau sedang nonaktif.`,
        });
      }

      const now = new Date();
      const scheduledAt =
        publishNow || !req.body?.scheduledAt ? now : new Date(req.body.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) {
        return reply.status(400).send({ success: false, error: 'Format waktu jadwal tidak valid.' });
      }

      const id = crypto.randomUUID();
      const [inserted] = await db
        .insert(scheduledPosts)
        .values({
          id,
          channel,
          channelAccountId,
          caption,
          mediaUrl,
          targetChatId,
          status: 'SCHEDULED',
          scheduledAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (publishNow || scheduledAt.getTime() <= Date.now()) {
        try {
          const published = await PostService.publishChannelPost(inserted.id);
          return reply.status(201).send({ success: true, data: published });
        } catch (pubErr: any) {
          return reply.status(400).send({
            success: false,
            error: pubErr.message || 'Gagal menerbitkan postingan',
          });
        }
      }

      return reply.status(201).send({ success: true, data: inserted });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post<{ Params: { id: string } }>('/:id/publish-now', async (req, reply) => {
    try {
      const published = await PostService.publishChannelPost(req.params.id);
      return reply.send({ success: true, data: published });
    } catch (error: any) {
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  fastify.post<{ Params: { id: string } }>('/:id/cancel', async (req, reply) => {
    try {
      const [updated] = await db
        .update(scheduledPosts)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(eq(scheduledPosts.id, req.params.id))
        .returning();
      if (!updated) {
        return reply.status(404).send({ success: false, error: 'Jadwal postingan tidak ditemukan' });
      }
      return reply.send({ success: true, data: updated });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post<{
    Body: {
      items?: Array<{
        channel?: string;
        channelAccountId?: string;
        caption?: string;
        mediaUrl?: string | null;
        targetChatId?: string | null;
        scheduledAt?: string | null;
      }>;
    };
  }>('/import', async (req, reply) => {
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      if (items.length === 0) {
        return reply.status(400).send({ success: false, error: 'Tidak ada baris CSV untuk diimpor.' });
      }

      const accounts = await db.select().from(channelAccounts).where(eq(channelAccounts.isActive, true));
      let imported = 0;
      const failed: Array<{ row: number; error: string }> = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const channel = String(item.channel || '').trim().toUpperCase();
        const caption = String(item.caption || '').trim();
        const mediaUrl = item.mediaUrl ? String(item.mediaUrl).trim() : null;
        const targetChatId = item.targetChatId ? String(item.targetChatId).trim() : null;
        let channelAccountId = String(item.channelAccountId || '').trim();

        if (!channelAccountId) {
          const matchedAcc = accounts.find((a) => a.channel === channel);
          if (matchedAcc) channelAccountId = matchedAcc.id;
        }

        if (!channel || !caption) {
          failed.push({ row: i + 1, error: 'Channel atau caption kosong' });
          continue;
        }
        if (!channelAccountId) {
          failed.push({ row: i + 1, error: `Akun kanal ${channel} tidak ditemukan` });
          continue;
        }
        if (channel === 'INSTAGRAM' && !mediaUrl) {
          failed.push({ row: i + 1, error: 'Instagram memerlukan mediaUrl' });
          continue;
        }
        if (channel === 'TELEGRAM' && !targetChatId) {
          failed.push({ row: i + 1, error: 'Telegram memerlukan targetChatId' });
          continue;
        }

        const scheduledAt = item.scheduledAt ? new Date(item.scheduledAt) : new Date(Date.now() + 3600_000);
        if (Number.isNaN(scheduledAt.getTime())) {
          failed.push({ row: i + 1, error: 'Format scheduledAt tidak valid' });
          continue;
        }

        const now = new Date();
        await db.insert(scheduledPosts).values({
          id: crypto.randomUUID(),
          channel,
          channelAccountId,
          caption,
          mediaUrl,
          targetChatId,
          status: 'SCHEDULED',
          scheduledAt,
          createdAt: now,
          updatedAt: now,
        });
        imported++;
      }

      return reply.status(201).send({
        success: true,
        data: { imported, failed },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    try {
      await db.delete(scheduledPosts).where(eq(scheduledPosts.id, req.params.id));
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
