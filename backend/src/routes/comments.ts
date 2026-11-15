import crypto from 'crypto';
import axios from 'axios';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { channelAccounts, socialComments } from '../db/schema';
import { requirePermission } from './auth';

export default async function commentsRouter(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requirePermission('conversations'));

  fastify.get<{
    Querystring: { status?: string; channel?: string };
  }>('/', async (req, reply) => {
    try {
      const statusFilter = String(req.query?.status || 'ALL').toUpperCase();
      const channelFilter = String(req.query?.channel || 'ALL').toUpperCase();

      const rows = await db
        .select({
          comment: socialComments,
          accountName: channelAccounts.name,
        })
        .from(socialComments)
        .leftJoin(channelAccounts, eq(socialComments.channelAccountId, channelAccounts.id))
        .orderBy(desc(socialComments.createdAt));

      const filtered = rows
        .map((r) => ({ ...r.comment, accountName: r.accountName || null }))
        .filter((item) => {
          if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
          if (channelFilter !== 'ALL' && item.channel !== channelFilter) return false;
          return true;
        });

      return reply.send({ success: true, data: filtered });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post('/sync', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const accounts = await db
        .select()
        .from(channelAccounts)
        .where(eq(channelAccounts.isActive, true));

      const socialAccounts = accounts.filter((a) =>
        ['INSTAGRAM', 'FACEBOOK', 'THREADS'].includes(a.channel)
      );

      if (socialAccounts.length === 0) {
        return reply.send({
          success: true,
          data: { synced: 0, message: 'Belum ada akun Instagram, Facebook, atau Threads yang terhubung.' },
        });
      }

      let synced = 0;
      const errors: string[] = [];

      for (const acc of socialAccounts) {
        if (!acc.accessToken) continue;
        try {
          if (acc.channel === 'INSTAGRAM') {
            const mediaRes = await axios.get(
              `https://graph.facebook.com/v20.0/${acc.accountId}/media`,
              {
                params: { fields: 'id,caption,comments{id,text,username,timestamp}', limit: 10 },
                headers: { Authorization: `Bearer ${acc.accessToken}` },
                timeout: 10000,
              }
            );
            const mediaList = mediaRes.data?.data || [];
            for (const m of mediaList) {
              const comments = m.comments?.data || [];
              for (const c of comments) {
                const existing = await db
                  .select({ id: socialComments.id })
                  .from(socialComments)
                  .where(eq(socialComments.externalCommentId, String(c.id)));
                if (existing.length === 0) {
                  await db.insert(socialComments).values({
                    id: crypto.randomUUID(),
                    channel: 'INSTAGRAM',
                    channelAccountId: acc.id,
                    postId: String(m.id),
                    postCaption: m.caption ? String(m.caption).slice(0, 160) : null,
                    externalCommentId: String(c.id),
                    authorName: String(c.username || 'Instagram User'),
                    authorHandle: c.username ? `@${c.username}` : null,
                    content: String(c.text || ''),
                    status: 'PENDING',
                    createdAt: c.timestamp ? new Date(c.timestamp) : new Date(),
                  });
                  synced++;
                }
              }
            }
          } else if (acc.channel === 'FACEBOOK') {
            const feedRes = await axios.get(
              `https://graph.facebook.com/v20.0/${acc.accountId}/posts`,
              {
                params: { fields: 'id,message,comments{id,message,from,created_time}', limit: 10 },
                headers: { Authorization: `Bearer ${acc.accessToken}` },
                timeout: 10000,
              }
            );
            const posts = feedRes.data?.data || [];
            for (const p of posts) {
              const comments = p.comments?.data || [];
              for (const c of comments) {
                const existing = await db
                  .select({ id: socialComments.id })
                  .from(socialComments)
                  .where(eq(socialComments.externalCommentId, String(c.id)));
                if (existing.length === 0) {
                  await db.insert(socialComments).values({
                    id: crypto.randomUUID(),
                    channel: 'FACEBOOK',
                    channelAccountId: acc.id,
                    postId: String(p.id),
                    postCaption: p.message ? String(p.message).slice(0, 160) : null,
                    externalCommentId: String(c.id),
                    authorName: String(c.from?.name || 'Facebook User'),
                    authorHandle: null,
                    content: String(c.message || ''),
                    status: 'PENDING',
                    createdAt: c.created_time ? new Date(c.created_time) : new Date(),
                  });
                  synced++;
                }
              }
            }
          } else if (acc.channel === 'THREADS') {
            const threadsRes = await axios.get(
              `https://graph.threads.net/v1.0/${acc.accountId}/threads`,
              {
                params: { fields: 'id,text', limit: 10, access_token: acc.accessToken },
                timeout: 10000,
              }
            );
            const posts = threadsRes.data?.data || [];
            for (const p of posts) {
              const repRes = await axios.get(
                `https://graph.threads.net/v1.0/${p.id}/replies`,
                {
                  params: { fields: 'id,text,username,timestamp', access_token: acc.accessToken },
                  timeout: 10000,
                }
              );
              const replies = repRes.data?.data || [];
              for (const r of replies) {
                const existing = await db
                  .select({ id: socialComments.id })
                  .from(socialComments)
                  .where(eq(socialComments.externalCommentId, String(r.id)));
                if (existing.length === 0) {
                  await db.insert(socialComments).values({
                    id: crypto.randomUUID(),
                    channel: 'THREADS',
                    channelAccountId: acc.id,
                    postId: String(p.id),
                    postCaption: p.text ? String(p.text).slice(0, 160) : null,
                    externalCommentId: String(r.id),
                    authorName: String(r.username || 'Threads User'),
                    authorHandle: r.username ? `@${r.username}` : null,
                    content: String(r.text || ''),
                    status: 'PENDING',
                    createdAt: r.timestamp ? new Date(r.timestamp) : new Date(),
                  });
                  synced++;
                }
              }
            }
          }
        } catch (accErr: any) {
          errors.push(`${acc.name}: ${accErr.response?.data?.error?.message || accErr.message}`);
        }
      }

      return reply.send({
        success: true,
        data: {
          synced,
          errors,
          message: synced > 0 ? `${synced} komentar baru disinkronkan.` : 'Tidak ada komentar baru.',
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post<{
    Params: { id: string };
    Body: { replyText?: string };
  }>('/:id/reply', async (req, reply) => {
    try {
      const replyText = String(req.body?.replyText || '').trim();
      if (!replyText) {
        return reply.status(400).send({ success: false, error: 'Teks balasan wajib diisi' });
      }

      const [comment] = await db
        .select()
        .from(socialComments)
        .where(eq(socialComments.id, req.params.id));
      if (!comment) {
        return reply.status(404).send({ success: false, error: 'Komentar tidak ditemukan' });
      }

      const [acc] = await db
        .select()
        .from(channelAccounts)
        .where(eq(channelAccounts.id, comment.channelAccountId));

      if (acc?.accessToken && comment.externalCommentId) {
        if (comment.channel === 'INSTAGRAM') {
          await axios.post(
            `https://graph.facebook.com/v20.0/${comment.externalCommentId}/replies`,
            { message: replyText },
            { headers: { Authorization: `Bearer ${acc.accessToken}` }, timeout: 10000 }
          );
        } else if (comment.channel === 'FACEBOOK') {
          await axios.post(
            `https://graph.facebook.com/v20.0/${comment.externalCommentId}/comments`,
            { message: replyText },
            { headers: { Authorization: `Bearer ${acc.accessToken}` }, timeout: 10000 }
          );
        } else if (comment.channel === 'THREADS' && comment.postId) {
          const containerRes = await axios.post(
            `https://graph.threads.net/v1.0/${acc.accountId}/threads`,
            null,
            {
              params: {
                media_type: 'TEXT',
                text: replyText,
                reply_to_id: comment.externalCommentId,
                access_token: acc.accessToken,
              },
              timeout: 10000,
            }
          );
          if (containerRes.data?.id) {
            await axios.post(
              `https://graph.threads.net/v1.0/${acc.accountId}/threads_publish`,
              null,
              { params: { creation_id: containerRes.data.id, access_token: acc.accessToken }, timeout: 10000 }
            );
          }
        }
      }

      const [updated] = await db
        .update(socialComments)
        .set({ replyText, repliedAt: new Date(), status: 'DONE' })
        .where(eq(socialComments.id, comment.id))
        .returning();

      return reply.send({ success: true, data: updated });
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: error.response?.data?.error?.message || error.message,
      });
    }
  });

  fastify.patch<{
    Params: { id: string };
    Body: { status?: string };
  }>('/:id/status', async (req, reply) => {
    try {
      const status = String(req.body?.status || 'DONE').toUpperCase();
      const [updated] = await db
        .update(socialComments)
        .set({ status: status === 'PENDING' ? 'PENDING' : 'DONE' })
        .where(eq(socialComments.id, req.params.id))
        .returning();
      return reply.send({ success: true, data: updated });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    try {
      await db.delete(socialComments).where(eq(socialComments.id, req.params.id));
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
