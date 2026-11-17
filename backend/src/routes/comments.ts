import crypto from 'crypto';
import axios from 'axios';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { channelAccounts, commentAutomations, socialComments } from '../db/schema';
import { generateAiAgentReply, getAiAgentConfig } from '../services/ai.service';
import { licenseService } from '../services/license.service';
import { getActiveCompanyId, runWithCompany } from '../services/tenantContext';
import { getRequestCompanyId, requirePermission } from './auth';

async function sendCommentReplyApi(
  acc: typeof channelAccounts.$inferSelect,
  comment: typeof socialComments.$inferSelect,
  replyText: string
): Promise<void> {
  if (!acc.accessToken || !comment.externalCommentId) return;
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

export async function applyCommentAutomations(
  acc: typeof channelAccounts.$inferSelect,
  comment: typeof socialComments.$inferSelect
): Promise<void> {
  const companyId = getActiveCompanyId(comment.companyId || acc.companyId);
  return await runWithCompany(companyId, async () => {
    try {
      const lic = await licenseService.getLicense(companyId);
      if (lic.isExpired || !lic.features.omnichannel || !lic.features.autoReply) return;

      const rules = await db
        .select()
        .from(commentAutomations)
        .where(and(eq(commentAutomations.companyId, companyId), eq(commentAutomations.isActive, true)));

      const contentLower = String(comment.content || '').trim().toLowerCase();
      if (!contentLower) return;

      const matched = rules.find((rule) => {
        if (rule.channel !== 'ALL' && rule.channel !== comment.channel) return false;
        const kw = String(rule.keyword || '').trim().toLowerCase();
        if (!kw) return false;
        return rule.matchType === 'EXACT' ? contentLower === kw : contentLower.includes(kw);
      });
      if (!matched) {
        if (!comment.replyText && lic.features.aiAgent) {
          const aiCfg = await getAiAgentConfig();
          const ageMs = Date.now() - new Date(comment.createdAt).getTime();
          if (aiCfg.enabled && aiCfg.autoReplyComment && ageMs <= 24 * 60 * 60 * 1000) {
            try {
              const aiRes = await generateAiAgentReply(comment.content, {
                configOverride: aiCfg,
                contactName: comment.authorName,
                channel: comment.channel,
                isComment: true,
              });
              if (aiRes.reply) {
                await sendCommentReplyApi(acc, comment, aiRes.reply);
                await db
                  .update(socialComments)
                  .set({ replyText: aiRes.reply, repliedAt: new Date(), status: 'DONE' })
                  .where(eq(socialComments.id, comment.id));
              }
            } catch (aiErr: any) {
              console.warn('[CommentAutomation] AI reply failed:', aiErr?.message);
            }
          }
        }
        return;
      }

      let executed = false;

      if (matched.replyComment) {
        try {
          await sendCommentReplyApi(acc, comment, matched.replyComment);
          await db
            .update(socialComments)
            .set({ replyText: matched.replyComment, repliedAt: new Date(), status: 'DONE' })
            .where(eq(socialComments.id, comment.id));
          executed = true;
        } catch (err: any) {
          console.warn('[CommentAutomation] Public reply failed:', err?.response?.data || err?.message);
        }
      }

      if (
        matched.sendDm &&
        matched.dmText &&
        acc.accessToken &&
        comment.externalCommentId &&
        (comment.channel === 'INSTAGRAM' || comment.channel === 'FACEBOOK')
      ) {
        try {
          await axios.post(
            `https://graph.facebook.com/v20.0/${acc.accountId}/messages`,
            {
              recipient: { comment_id: comment.externalCommentId },
              message: { text: matched.dmText },
            },
            { headers: { Authorization: `Bearer ${acc.accessToken}` }, timeout: 10000 }
          );
          executed = true;
        } catch (err: any) {
          console.warn('[CommentAutomation] Private reply DM failed:', err?.response?.data || err?.message);
        }
      }

      if (executed) {
        await db
          .update(commentAutomations)
          .set({
            triggerCount: sql`${commentAutomations.triggerCount} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(commentAutomations.id, matched.id));
      }
    } catch (err: any) {
      console.warn('[CommentAutomation] Unexpected error:', err?.message);
    }
  });
}

export default async function commentsRouter(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requirePermission('conversations'));

  fastify.get<{
    Querystring: { status?: string; channel?: string };
  }>('/', async (req, reply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const statusFilter = String(req.query?.status || 'ALL').toUpperCase();
      const channelFilter = String(req.query?.channel || 'ALL').toUpperCase();

      const rows = await db
        .select({
          comment: socialComments,
          accountName: channelAccounts.name,
        })
        .from(socialComments)
        .leftJoin(channelAccounts, eq(socialComments.channelAccountId, channelAccounts.id))
        .where(eq(socialComments.companyId, companyId))
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

  fastify.post('/sync', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      await licenseService.assertFeature('omnichannel', undefined, companyId);
      const accounts = await db
        .select()
        .from(channelAccounts)
        .where(and(eq(channelAccounts.companyId, companyId), eq(channelAccounts.isActive, true)));

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
                  .where(
                    and(
                      eq(socialComments.companyId, companyId),
                      eq(socialComments.externalCommentId, String(c.id))
                    )
                  );
                if (existing.length === 0) {
                  const [insertedComment] = await db
                    .insert(socialComments)
                    .values({
                      id: crypto.randomUUID(),
                      companyId,
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
                    })
                    .returning();
                  if (insertedComment) {
                    await applyCommentAutomations(acc, insertedComment);
                  }
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
                  .where(
                    and(
                      eq(socialComments.companyId, companyId),
                      eq(socialComments.externalCommentId, String(c.id))
                    )
                  );
                if (existing.length === 0) {
                  const [insertedComment] = await db
                    .insert(socialComments)
                    .values({
                      id: crypto.randomUUID(),
                      companyId,
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
                    })
                    .returning();
                  if (insertedComment) {
                    await applyCommentAutomations(acc, insertedComment);
                  }
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
                  .where(
                    and(
                      eq(socialComments.companyId, companyId),
                      eq(socialComments.externalCommentId, String(r.id))
                    )
                  );
                if (existing.length === 0) {
                  const [insertedComment] = await db
                    .insert(socialComments)
                    .values({
                      id: crypto.randomUUID(),
                      companyId,
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
                    })
                    .returning();
                  if (insertedComment) {
                    await applyCommentAutomations(acc, insertedComment);
                  }
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
      return reply.status(error?.statusCode || 500).send({
        success: false,
        code: error?.code,
        feature: error?.feature,
        error: error.message,
      });
    }
  });

  fastify.post<{
    Params: { id: string };
    Body: { replyText?: string };
  }>('/:id/reply', async (req, reply) => {
    try {
      const companyId = getRequestCompanyId(req);
      await licenseService.assertFeature('omnichannel', undefined, companyId);
      const replyText = String(req.body?.replyText || '').trim();
      if (!replyText) {
        return reply.status(400).send({ success: false, error: 'Teks balasan wajib diisi' });
      }

      const [comment] = await db
        .select()
        .from(socialComments)
        .where(and(eq(socialComments.id, req.params.id), eq(socialComments.companyId, companyId)));
      if (!comment) {
        return reply.status(404).send({ success: false, error: 'Komentar tidak ditemukan' });
      }

      const [acc] = await db
        .select()
        .from(channelAccounts)
        .where(and(eq(channelAccounts.id, comment.channelAccountId), eq(channelAccounts.companyId, companyId)));

      if (acc) {
        await sendCommentReplyApi(acc, comment, replyText);
      }

      const [updated] = await db
        .update(socialComments)
        .set({ replyText, repliedAt: new Date(), status: 'DONE' })
        .where(eq(socialComments.id, comment.id))
        .returning();

      return reply.send({ success: true, data: updated });
    } catch (error: any) {
      return reply.status(error?.statusCode || 400).send({
        success: false,
        code: error?.code,
        feature: error?.feature,
        error: error.response?.data?.error?.message || error.message,
      });
    }
  });

  fastify.patch<{
    Params: { id: string };
    Body: { status?: string };
  }>('/:id/status', async (req, reply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const status = String(req.body?.status || 'DONE').toUpperCase();
      const [updated] = await db
        .update(socialComments)
        .set({ status: status === 'PENDING' ? 'PENDING' : 'DONE' })
        .where(and(eq(socialComments.id, req.params.id), eq(socialComments.companyId, companyId)))
        .returning();
      if (!updated) {
        return reply.status(404).send({ success: false, error: 'Komentar tidak ditemukan' });
      }
      return reply.send({ success: true, data: updated });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    try {
      const companyId = getRequestCompanyId(req);
      await db
        .delete(socialComments)
        .where(and(eq(socialComments.id, req.params.id), eq(socialComments.companyId, companyId)));
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
