import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { and, eq, desc, sql, or, ilike } from 'drizzle-orm';
import { db } from '../db';
import { campaigns, campaignRecipients, contacts } from '../db/schema';
import { BroadcastService } from '../services/broadcast.service';
import { licenseService } from '../services/license.service';
import { getRequestCompanyId, requirePermission } from './auth';

export function formatCampaign(c: any) {
  if (!c) return null;
  return {
    id: c.id,
    title: c.title,
    messageTemplate: c.messageTemplate,
    mediaUrl: c.mediaUrl || null,
    mediaType: c.mediaType || null,
    mediaName: c.mediaName || null,
    type: c.type,
    channel: c.channel || 'WHATSAPP',
    channelAccountId: c.channelAccountId || null,
    status: c.status,
    scheduledAt: c.scheduledAt,
    delaySeconds: c.delaySeconds,
    intervalSeconds: c.intervalSeconds,
    batchSize: c.batchSize,
    filterTags: c.filterTags,
    totalCount: c.totalCount,
    sentCount: c.sentCount,
    deliveredCount: c.deliveredCount,
    readCount: c.readCount,
    failedCount: c.failedCount,
    startedAt: c.startedAt,
    completedAt: c.completedAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export function formatRecipient(r: any, contact?: any, campaign?: any) {
  if (!r) return null;
  return {
    id: r.id,
    campaignId: r.campaignId,
    contactId: r.contactId,
    phone: r.phone,
    personalizedMessage: r.personalizedMessage,
    wahaMessageId: r.wahaMessageId,
    status: r.status,
    ackStatus: r.ackStatus,
    sentAt: r.sentAt,
    deliveredAt: r.deliveredAt,
    readAt: r.readAt,
    errorMessage: r.errorMessage,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    contact: contact
      ? {
          id: contact.id,
          nama_lengkap: contact.namaLengkap,
          nama_panggilan: contact.namaPanggilan,
          nomor_whatsapp: contact.nomorWhatsapp,
        }
      : undefined,
    campaign: campaign
      ? {
          id: campaign.id,
          title: campaign.title,
          type: campaign.type,
        }
      : undefined,
  };
}

export default async function broadcastsRouter(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (req, reply) => {
    if (req.url.includes('/session-check')) {
      const allowed = requirePermission('broadcasts', 'tracking', 'settings', 'settings.edit');
      return allowed(req, reply);
    }
    const allowed =
      req.method === 'GET'
        ? requirePermission('broadcasts', 'tracking')
        : requirePermission('broadcasts.send');
    return allowed(req, reply);
  });

  // GET all campaigns (supports pagination, search & status/type filters)
  fastify.get('/', async (req: FastifyRequest<{
    Querystring: { status?: string; type?: string; search?: string; page?: string; limit?: string };
  }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const { status, type, search, page = '1', limit = '25' } = req.query;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 25));
      const offset = (pageNum - 1) * limitNum;

      const conditions: any[] = [eq(campaigns.companyId, companyId)];
      if (status && status !== 'ALL') conditions.push(eq(campaigns.status, status));
      if (type && type !== 'ALL') conditions.push(eq(campaigns.type, type));
      if (search && search.trim()) {
        const s = `%${search.trim()}%`;
        conditions.push(or(ilike(campaigns.title, s), ilike(campaigns.messageTemplate, s)));
      }
      const whereClause = and(...conditions);

      const [list, countResult] = await Promise.all([
        db
          .select()
          .from(campaigns)
          .where(whereClause)
          .orderBy(desc(campaigns.createdAt))
          .limit(limitNum)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)` })
          .from(campaigns)
          .where(whereClause),
      ]);

      const total = Number(countResult[0]?.count || 0);

      return reply.send({
        success: true,
        data: list.map(formatCampaign),
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

  // GET check session campaigns history for logout / delete session warnings
  fastify.get('/session-check', async (req: FastifyRequest<{
    Querystring: { session?: string; channel?: string; channelAccountId?: string; sessionPhone?: string };
  }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const { session, channel, channelAccountId, sessionPhone } = req.query;
      const result = await BroadcastService.checkSessionCampaigns({
        companyId,
        sessionName: session,
        channel,
        channelAccountId,
        sessionPhone,
      });
      return reply.send({ success: true, data: result });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // GET single campaign with recipients
  fastify.get('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const campList = await db
        .select()
        .from(campaigns)
        .where(and(eq(campaigns.id, req.params.id), eq(campaigns.companyId, companyId)));

      if (campList.length === 0) {
        return reply.status(404).send({ success: false, error: 'Kampanye tidak ditemukan' });
      }

      const rawRecipients = await db
        .select({
          recipient: campaignRecipients,
          contact: contacts,
        })
        .from(campaignRecipients)
        .leftJoin(contacts, eq(campaignRecipients.contactId, contacts.id))
        .where(
          and(
            eq(campaignRecipients.campaignId, req.params.id),
            eq(campaignRecipients.companyId, companyId)
          )
        )
        .orderBy(campaignRecipients.createdAt);

      const recipients = rawRecipients.map((item) =>
        formatRecipient(item.recipient, item.contact)
      );

      return reply.send({
        success: true,
        data: {
          ...formatCampaign(campList[0]),
          recipients,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST create and launch/schedule broadcast
  fastify.post('/', async (req: FastifyRequest<{
    Body: {
      title: string;
      messageTemplate: string;
      mediaUrl?: string | null;
      mediaType?: string | null;
      mediaName?: string | null;
      type?: 'IMMEDIATE' | 'SCHEDULED' | 'BIRTHDAY';
      channel?: 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | 'THREADS' | 'TELEGRAM';
      channelAccountId?: string | null;
      scheduledAt?: string | null;
      delaySeconds?: number;
      intervalSeconds?: number;
      batchSize?: number;
      contactIds?: string[];
      filterTags?: string[];
      sessionName?: string;
    };
  }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const {
        title,
        messageTemplate,
        mediaUrl,
        mediaType,
        mediaName,
        type,
        channel,
        channelAccountId,
        scheduledAt,
        delaySeconds,
        intervalSeconds,
        batchSize,
        contactIds,
        filterTags,
        sessionName,
      } = req.body;

      if (!title || !messageTemplate) {
        return reply.status(400).send({
          success: false,
          error: 'Judul kampanye dan template pesan wajib diisi.',
        });
      }

      const result = await BroadcastService.createCampaign({
        companyId,
        title,
        messageTemplate,
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
        mediaName: mediaName || null,
        type: type || 'IMMEDIATE',
        channel: channel || 'WHATSAPP',
        channelAccountId: channelAccountId || null,
        scheduledAt,
        delaySeconds: delaySeconds ? Number(delaySeconds) : 5,
        intervalSeconds: intervalSeconds ? Number(intervalSeconds) : 30,
        batchSize: batchSize ? Number(batchSize) : 10,
        contactIds: Array.isArray(contactIds) ? contactIds : undefined,
        filterTags: Array.isArray(filterTags) ? filterTags : undefined,
        sessionName: sessionName?.trim() || undefined,
      });

      return reply.status(201).send({
        success: true,
        message:
          type === 'SCHEDULED'
            ? 'Kampanye siaran terjadwal berhasil dibuat.'
            : 'Kampanye siaran langsung mulai dikirimkan.',
        data: {
          ...result,
          campaign: formatCampaign(result.campaign),
        },
      });
    } catch (error: any) {
      return reply.status(error.statusCode || 400).send({
        success: false,
        code: error?.code,
        feature: error?.feature,
        error: error.message,
      });
    }
  });

  // POST cancel campaign
  fastify.post('/:id/cancel', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const result = await BroadcastService.cancelCampaign(req.params.id, companyId);
      return reply.send({ success: true, message: 'Kampanye berhasil dibatalkan', data: result });
    } catch (error: any) {
      return reply.status(error.statusCode || 400).send({ success: false, error: error.message });
    }
  });

  // POST retry failed recipients
  fastify.post('/:id/retry-failed', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const result = await BroadcastService.retryFailedRecipients(req.params.id, companyId);
      return reply.send({
        success: true,
        message: `${result.retriedCount} penerima gagal dimasukkan kembali ke antrean`,
        data: result,
      });
    } catch (error: any) {
      return reply.status(error.statusCode || 400).send({
        success: false,
        code: error?.code,
        feature: error?.feature,
        error: error.message,
      });
    }
  });

  // DELETE campaign
  fastify.delete('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const deleted = await db
        .delete(campaigns)
        .where(and(eq(campaigns.id, req.params.id), eq(campaigns.companyId, companyId)))
        .returning({ id: campaigns.id });
      if (!deleted[0]) {
        return reply.status(404).send({ success: false, error: 'Kampanye tidak ditemukan' });
      }
      return reply.send({ success: true, message: 'Kampanye berhasil dihapus' });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET recipient tracking
  fastify.get('/tracking/recipients', async (req: FastifyRequest<{
    Querystring: { status?: string; search?: string; page?: string; limit?: string };
  }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      await licenseService.assertFeature('scheduledPosts', undefined, companyId);
      const { status, search, page = '1', limit = '50' } = req.query;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, Math.min(500, parseInt(limit, 10) || 50));
      const offset = (pageNum - 1) * limitNum;

      const conditions: any[] = [eq(campaignRecipients.companyId, companyId)];
      if (status && status !== 'ALL') {
        conditions.push(eq(campaignRecipients.status, status));
      }

      if (search && search.trim()) {
        const s = `%${search.trim()}%`;
        conditions.push(
          or(
            ilike(campaignRecipients.phone, s),
            ilike(contacts.namaLengkap, s),
            ilike(campaigns.title, s)
          )
        );
      }

      const whereClause = and(...conditions);

      const rows = await db
        .select({
          recipient: campaignRecipients,
          contact: contacts,
          campaign: campaigns,
        })
        .from(campaignRecipients)
        .leftJoin(contacts, eq(campaignRecipients.contactId, contacts.id))
        .leftJoin(campaigns, eq(campaignRecipients.campaignId, campaigns.id))
        .where(whereClause)
        .orderBy(desc(campaignRecipients.updatedAt))
        .limit(limitNum)
        .offset(offset);

      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(campaignRecipients)
        .leftJoin(contacts, eq(campaignRecipients.contactId, contacts.id))
        .leftJoin(campaigns, eq(campaignRecipients.campaignId, campaigns.id))
        .where(whereClause);

      const total = Number(countResult[0]?.count || 0);

      const items = rows.map((r) => formatRecipient(r.recipient, r.contact, r.campaign));

      return reply.send({
        success: true,
        data: items,
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
}
