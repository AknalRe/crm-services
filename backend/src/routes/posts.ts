import crypto from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { channelAccounts, contacts, scheduledPosts } from '../db/schema';
import { licenseService } from '../services/license.service';
import {
  listStatusViewersForPost,
  parsePostTargetContacts,
  PostService,
  PostTargetContact,
  upsertWhatsappStatusView,
  WhatsAppStatusStyle,
} from '../services/post.service';
import { wahaService } from '../services/waha.service';
import { normalizePhoneNumber } from '../services/phone.utils';
import { getRequestCompanyId, requirePermission } from './auth';

function serializeScheduledPost(post: typeof scheduledPosts.$inferSelect, accountName?: string | null, accountExternalId?: string | null) {
  let statusStyle: WhatsAppStatusStyle | null = null;
  if (post.statusStyleJson) {
    try {
      statusStyle = JSON.parse(post.statusStyleJson);
    } catch {
      statusStyle = null;
    }
  }
  return {
    ...post,
    accountName: accountName || (post.wahaSession ? `WhatsApp (${post.wahaSession})` : null),
    accountExternalId: accountExternalId || post.wahaSession || null,
    targetContacts: parsePostTargetContacts(post.targetContactsJson),
    statusStyle,
  };
}

async function resolveTargetContactsFromInput(
  companyId: string,
  rawTargets?: Array<{ contactId?: string | null; phone?: string; name?: string | null }>,
  rawContactIds?: string[]
): Promise<PostTargetContact[]> {
  const byPhone = new Map<string, PostTargetContact>();
  if (Array.isArray(rawContactIds) && rawContactIds.length > 0) {
    const cleanIds = rawContactIds.map((x) => String(x || '').trim()).filter(Boolean);
    if (cleanIds.length > 0) {
      const dbContacts = await db
        .select({ id: contacts.id, namaLengkap: contacts.namaLengkap, nomorWhatsapp: contacts.nomorWhatsapp })
        .from(contacts)
        .where(and(eq(contacts.companyId, companyId), inArray(contacts.id, cleanIds)));
      for (const c of dbContacts) {
        const phone = c.nomorWhatsapp ? normalizePhoneNumber(c.nomorWhatsapp) : '';
        if (!phone) continue;
        byPhone.set(phone, { contactId: c.id, phone, name: c.namaLengkap });
      }
    }
  }
  if (Array.isArray(rawTargets)) {
    for (const item of rawTargets) {
      const phone = item?.phone ? normalizePhoneNumber(String(item.phone)) : '';
      if (!phone) continue;
      if (!byPhone.has(phone)) {
        byPhone.set(phone, {
          contactId: item.contactId || null,
          phone,
          name: item.name || null,
        });
      }
    }
  }
  return Array.from(byPhone.values());
}

function resolveScheduledPostType(
  channel: string,
  requestedPostType?: string | null,
  mediaUrl?: string | null
): string {
  const reqType = String(requestedPostType || '').toUpperCase().trim();
  if (channel === 'WHATSAPP') return 'WA_POST';
  if (channel === 'INSTAGRAM') {
    if (reqType === 'STORY' || reqType === 'IG_STORY') return 'STORY';
    return 'FEED';
  }
  if (channel !== 'WHATSAPP_STATUS') return 'FEED';
  if (['STATUS_TEXT', 'STATUS_IMAGE', 'STATUS_VIDEO', 'STATUS_VOICE'].includes(reqType)) {
    return reqType;
  }
  if (!mediaUrl) return 'STATUS_TEXT';
  if (/\.(mp4|mov|webm)(\?|$)/i.test(mediaUrl)) return 'STATUS_VIDEO';
  if (/\.(mp3|ogg|wav|m4a|opus)(\?|$)/i.test(mediaUrl)) return 'STATUS_VOICE';
  return 'STATUS_IMAGE';
}

export default async function postsRouter(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (req, reply) => {
    const allowed =
      req.method === 'GET'
        ? requirePermission('broadcasts')
        : requirePermission('broadcasts.send');
    return allowed(req, reply);
  });

  fastify.get('/', async (req: FastifyRequest<{
    Querystring: {
      channel?: string;
      status?: string;
      search?: string;
      page?: string;
      limit?: string;
    };
  }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const { channel, status, search, page = '1', limit = '200' } = req.query;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, Math.min(500, parseInt(limit, 10) || 200));
      const offset = (pageNum - 1) * limitNum;

      const conditions: any[] = [eq(scheduledPosts.companyId, companyId)];
      if (channel && channel !== 'ALL') {
        conditions.push(eq(scheduledPosts.channel, channel.toUpperCase().trim()));
      }
      if (status && status !== 'ALL') {
        conditions.push(eq(scheduledPosts.status, status.toUpperCase().trim()));
      }
      if (search && search.trim()) {
        conditions.push(ilike(scheduledPosts.caption, `%${search.trim()}%`));
      }
      const whereClause = and(...conditions);

      const [rows, countResult] = await Promise.all([
        db
          .select({
            post: scheduledPosts,
            accountName: channelAccounts.name,
            accountExternalId: channelAccounts.accountId,
          })
          .from(scheduledPosts)
          .leftJoin(channelAccounts, eq(scheduledPosts.channelAccountId, channelAccounts.id))
          .where(whereClause)
          .orderBy(desc(scheduledPosts.scheduledAt))
          .limit(limitNum)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)` })
          .from(scheduledPosts)
          .where(whereClause),
      ]);

      const total = Number(countResult[0]?.count || 0);
      const data = rows.map((r) => serializeScheduledPost(r.post, r.accountName, r.accountExternalId));
      return reply.send({
        success: true,
        data,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.max(1, Math.ceil(total / limitNum)),
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post<{
    Body: {
      channel?: string;
      channelAccountId?: string | null;
      wahaSession?: string | null;
      postType?: string;
      caption?: string;
      mediaUrl?: string | null;
      targetChatId?: string | null;
      targetContactIds?: string[];
      targetContacts?: Array<{ contactId?: string | null; phone?: string; name?: string | null }>;
      statusStyle?: WhatsAppStatusStyle | null;
      scheduledAt?: string | null;
      publishNow?: boolean;
    };
  }>('/', async (req, reply) => {
    try {
      const companyId = getRequestCompanyId(req);
      await licenseService.assertFeature('scheduledPosts', undefined, companyId);

      const channel = String(req.body?.channel || '').trim().toUpperCase();
      const channelAccountId = req.body?.channelAccountId
        ? String(req.body.channelAccountId).trim() || null
        : null;
      const wahaSession = req.body?.wahaSession ? String(req.body.wahaSession).trim() || null : null;
      const caption = String(req.body?.caption || '').trim();
      const mediaUrl = req.body?.mediaUrl ? String(req.body.mediaUrl).trim() : null;
      const targetChatId = req.body?.targetChatId ? String(req.body.targetChatId).trim() : null;
      const publishNow = Boolean(req.body?.publishNow);
      const isWaChannel = channel === 'WHATSAPP_STATUS' || channel === 'WHATSAPP';

      if (!channel) {
        return reply.status(400).send({ success: false, error: 'Channel wajib dipilih.' });
      }

      const resolvedPostType = resolveScheduledPostType(channel, req.body?.postType, mediaUrl);

      if (!isWaChannel) {
        await licenseService.assertFeature('omnichannel', undefined, companyId);
        const isIgStory = channel === 'INSTAGRAM' && resolvedPostType === 'STORY';
        if (!channelAccountId || (!caption && !isIgStory)) {
          return reply.status(400).send({
            success: false,
            error: isIgStory
              ? 'Akun Instagram wajib dipilih untuk Instagram Story.'
              : 'Channel, akun kanal, dan caption wajib diisi.',
          });
        }
        if (channel === 'INSTAGRAM' && !mediaUrl) {
          return reply.status(400).send({
            success: false,
            error: isIgStory
              ? 'Instagram Story memerlukan gambar atau video (rasio 9:16).'
              : 'Postingan Instagram Feed memerlukan URL gambar/media publik.',
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
          .where(and(eq(channelAccounts.id, channelAccountId), eq(channelAccounts.companyId, companyId)));
        if (!account || !account.isActive || account.channel !== channel) {
          return reply.status(400).send({
            success: false,
            error: `Akun kanal ${channel} tidak ditemukan atau sedang nonaktif.`,
          });
        }
      } else {
        if (!caption && !mediaUrl) {
          return reply.status(400).send({
            success: false,
            error: 'Isi teks/caption atau unggah media untuk posting WhatsApp.',
          });
        }
      }

      const resolvedTargets = isWaChannel
        ? await resolveTargetContactsFromInput(companyId, req.body?.targetContacts, req.body?.targetContactIds)
        : [];

      if (channel === 'WHATSAPP' && resolvedTargets.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'Pilih minimal 1 kontak tujuan untuk posting WhatsApp.',
        });
      }

      if (channel === 'WHATSAPP_STATUS') {
        if (resolvedPostType !== 'STATUS_TEXT' && !mediaUrl) {
          return reply.status(400).send({
            success: false,
            error: 'Story media memerlukan URL atau file media gambar/video/audio.',
          });
        }
        if (resolvedPostType === 'STATUS_TEXT' && !caption) {
          return reply.status(400).send({
            success: false,
            error: 'Teks WhatsApp Story wajib diisi.',
          });
        }
      }

      const now = new Date();
      const scheduledAt =
        publishNow || !req.body?.scheduledAt ? now : new Date(req.body.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) {
        return reply.status(400).send({ success: false, error: 'Format waktu jadwal tidak valid.' });
      }

      const statusStyleJson = req.body?.statusStyle
        ? JSON.stringify({
            backgroundColor: req.body.statusStyle.backgroundColor || '#38b42f',
            font: typeof req.body.statusStyle.font === 'number' ? req.body.statusStyle.font : 1,
          })
        : null;

      const id = crypto.randomUUID();
      const [inserted] = await db
        .insert(scheduledPosts)
        .values({
          id,
          companyId,
          channel,
          channelAccountId: isWaChannel ? null : channelAccountId,
          wahaSession: isWaChannel ? wahaSession : null,
          postType: resolvedPostType,
          caption,
          mediaUrl,
          targetChatId,
          targetContactsJson: resolvedTargets.length > 0 ? JSON.stringify(resolvedTargets) : null,
          statusStyleJson,
          viewerCount: 0,
          status: 'SCHEDULED',
          scheduledAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (publishNow || scheduledAt.getTime() <= Date.now()) {
        try {
          const published = await PostService.publishChannelPost(inserted.id);
          return reply.status(201).send({
            success: true,
            data: serializeScheduledPost(published),
          });
        } catch (pubErr: any) {
          return reply.status(400).send({
            success: false,
            error: pubErr.message || 'Gagal menerbitkan postingan',
          });
        }
      }

      return reply.status(201).send({ success: true, data: serializeScheduledPost(inserted) });
    } catch (error: any) {
      return reply.status(error?.statusCode || 500).send({
        success: false,
        code: error?.code,
        feature: error?.feature,
        error: error.message,
      });
    }
  });

  // GET status viewers for a WhatsApp Status (Story) post
  fastify.get<{
    Params: { id: string };
    Querystring: { sync?: string };
  }>('/:id/viewers', async (req, reply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const [post] = await db
        .select()
        .from(scheduledPosts)
        .where(and(eq(scheduledPosts.id, req.params.id), eq(scheduledPosts.companyId, companyId)));
      if (!post) {
        return reply.status(404).send({ success: false, error: 'Postingan tidak ditemukan' });
      }

      let syncError: string | null = null;
      if (
        req.query?.sync !== 'false' &&
        post.channel === 'WHATSAPP_STATUS' &&
        post.externalPostId
      ) {
        try {
          const receipts = await wahaService.fetchStatusViewers(
            post.externalPostId,
            post.wahaSession || undefined
          );
          for (const rec of receipts) {
            if (rec.ackStatus >= 2) {
              await upsertWhatsappStatusView({
                postId: post.id,
                viewerJid: rec.viewerJid,
                viewerPhone: rec.phone,
                sessionName: post.wahaSession,
                ackStatus: rec.ackStatus,
                viewedAt: rec.viewedAt ? new Date(rec.viewedAt) : null,
              });
            }
          }
        } catch (err: any) {
          syncError = err?.message || 'Gagal menyinkronkan penonton dari WAHA';
        }
      }

      const [refreshedPost] = await db
        .select()
        .from(scheduledPosts)
        .where(and(eq(scheduledPosts.id, post.id), eq(scheduledPosts.companyId, companyId)));
      const viewers = await listStatusViewersForPost(post.id);
      const targets = parsePostTargetContacts(post.targetContactsJson);

      return reply.send({
        success: true,
        data: {
          post: serializeScheduledPost(refreshedPost || post),
          targets,
          viewers,
          totalViewed: viewers.filter((v) => v.ackStatus >= 3).length,
          totalDelivered: viewers.length,
          syncError,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST delete published WhatsApp Status from remote WhatsApp via WAHA
  fastify.post<{ Params: { id: string } }>('/:id/delete-remote', async (req, reply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const [post] = await db
        .select()
        .from(scheduledPosts)
        .where(and(eq(scheduledPosts.id, req.params.id), eq(scheduledPosts.companyId, companyId)));
      if (!post || post.channel !== 'WHATSAPP_STATUS' || !post.externalPostId) {
        return reply.status(400).send({
          success: false,
          error: 'Hanya WhatsApp Story yang sudah terbit yang dapat ditarik dari WhatsApp',
        });
      }
      const res = await wahaService.deleteStatus(post.externalPostId, post.wahaSession || undefined);
      if (!res.success) {
        return reply.status(400).send({ success: false, error: res.error || 'Gagal menghapus status di WAHA' });
      }
      const [updated] = await db
        .update(scheduledPosts)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(and(eq(scheduledPosts.id, post.id), eq(scheduledPosts.companyId, companyId)))
        .returning();
      return reply.send({ success: true, data: serializeScheduledPost(updated) });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post<{ Params: { id: string } }>('/:id/publish-now', async (req, reply) => {
    try {
      const companyId = getRequestCompanyId(req);
      await licenseService.assertFeature('scheduledPosts', undefined, companyId);
      const [post] = await db
        .select({ id: scheduledPosts.id })
        .from(scheduledPosts)
        .where(and(eq(scheduledPosts.id, req.params.id), eq(scheduledPosts.companyId, companyId)));
      if (!post) {
        return reply.status(404).send({ success: false, error: 'Postingan tidak ditemukan' });
      }
      const published = await PostService.publishChannelPost(req.params.id);
      return reply.send({ success: true, data: serializeScheduledPost(published) });
    } catch (error: any) {
      return reply.status(error?.statusCode || 400).send({
        success: false,
        code: error?.code,
        feature: error?.feature,
        error: error.message,
      });
    }
  });

  fastify.post<{ Params: { id: string } }>('/:id/cancel', async (req, reply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const [updated] = await db
        .update(scheduledPosts)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(and(eq(scheduledPosts.id, req.params.id), eq(scheduledPosts.companyId, companyId)))
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
        channelAccountId?: string | null;
        wahaSession?: string | null;
        postType?: string | null;
        caption?: string;
        mediaUrl?: string | null;
        targetChatId?: string | null;
        targetContactIds?: string[];
        targetContacts?: Array<{ contactId?: string | null; phone?: string; name?: string | null }>;
        scheduledAt?: string | null;
      }>;
    };
  }>('/import', async (req, reply) => {
    try {
      const companyId = getRequestCompanyId(req);
      await licenseService.assertFeature('scheduledPosts', undefined, companyId);

      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      if (items.length === 0) {
        return reply.status(400).send({ success: false, error: 'Tidak ada baris CSV untuk diimpor.' });
      }

      const accounts = await db
        .select()
        .from(channelAccounts)
        .where(and(eq(channelAccounts.companyId, companyId), eq(channelAccounts.isActive, true)));
      let imported = 0;
      const failed: Array<{ row: number; error: string }> = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const channel = String(item.channel || '').trim().toUpperCase();
        const isWaChannel = channel === 'WHATSAPP_STATUS' || channel === 'WHATSAPP';
        const caption = String(item.caption || '').trim();
        const mediaUrl = item.mediaUrl ? String(item.mediaUrl).trim() : null;
        const targetChatId = item.targetChatId ? String(item.targetChatId).trim() : null;
        const wahaSession = item.wahaSession ? String(item.wahaSession).trim() || null : null;
        let channelAccountId: string | null = item.channelAccountId ? String(item.channelAccountId).trim() || null : null;

        if (!isWaChannel && !channelAccountId) {
          const matchedAcc = accounts.find((a) => a.channel === channel);
          if (matchedAcc) channelAccountId = matchedAcc.id;
        }

        if (!channel || (!caption && !(isWaChannel && mediaUrl))) {
          failed.push({ row: i + 1, error: 'Channel atau caption/media kosong' });
          continue;
        }
        if (!isWaChannel && !channelAccountId) {
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

        const csvPhoneTargets =
          isWaChannel && targetChatId
            ? targetChatId
                .split(/[;,]/)
                .map((p) => p.trim())
                .filter(Boolean)
                .map((phone) => ({ phone }))
            : [];
        const resolvedTargets = isWaChannel
          ? await resolveTargetContactsFromInput(
              companyId,
              [...(item.targetContacts || []), ...csvPhoneTargets],
              item.targetContactIds
            )
          : [];

        if (channel === 'WHATSAPP' && resolvedTargets.length === 0) {
          failed.push({ row: i + 1, error: 'WhatsApp memerlukan minimal 1 nomor tujuan (targetChatId)' });
          continue;
        }

        const resolvedPostType = resolveScheduledPostType(channel, item.postType, mediaUrl);
        if (channel === 'WHATSAPP_STATUS' && resolvedPostType !== 'STATUS_TEXT' && !mediaUrl) {
          failed.push({ row: i + 1, error: 'Story media memerlukan mediaUrl' });
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
          companyId,
          channel,
          channelAccountId: isWaChannel ? null : channelAccountId,
          wahaSession: isWaChannel ? wahaSession : null,
          postType: resolvedPostType,
          caption,
          mediaUrl,
          targetChatId: isWaChannel ? null : targetChatId,
          targetContactsJson: resolvedTargets.length > 0 ? JSON.stringify(resolvedTargets) : null,
          viewerCount: 0,
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
      return reply.status(error?.statusCode || 500).send({
        success: false,
        code: error?.code,
        feature: error?.feature,
        error: error.message,
      });
    }
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    try {
      const companyId = getRequestCompanyId(req);
      await db
        .delete(scheduledPosts)
        .where(and(eq(scheduledPosts.id, req.params.id), eq(scheduledPosts.companyId, companyId)));
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
