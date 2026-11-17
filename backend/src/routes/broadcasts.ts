import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { and, eq, desc, sql, or, ilike } from 'drizzle-orm';
import { db } from '../db';
import { campaigns, campaignRecipients, contacts } from '../db/schema';
import { BroadcastService } from '../services/broadcast.service';
import { requirePermission } from './auth';

export function formatCampaign(c: any) {
  if (!c) return null;
  return {
    id: c.id,
    title: c.title,
    messageTemplate: c.messageTemplate,
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
    const allowed =
      req.method === 'GET'
        ? requirePermission('broadcasts', 'tracking')
        : requirePermission('broadcasts.send');
    return allowed(req, reply);
  });
  // GET all campaigns
  fastify.get('/', async (req: FastifyRequest<{
    Querystring: { status?: string; type?: string };
  }>, reply: FastifyReply) => {
    try {
      const { status, type } = req.query;

      const conditions: any[] = [];
      if (status && status !== 'ALL') conditions.push(eq(campaigns.status, status));
      if (type && type !== 'ALL') conditions.push(eq(campaigns.type, type));

      const list = await db
        .select()
        .from(campaigns)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(campaigns.createdAt));

      return reply.send({ success: true, data: list.map(formatCampaign) });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET single campaign with recipients
  fastify.get('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const campList = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, req.params.id));

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
        .where(eq(campaignRecipients.campaignId, req.params.id))
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
      const {
        title,
        messageTemplate,
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
        title,
        messageTemplate,
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
      return reply.status(error.statusCode || 400).send({ success: false, error: error.message });
    }
  });

  // POST cancel campaign
  fastify.post('/:id/cancel', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const result = await BroadcastService.cancelCampaign(req.params.id);
      return reply.send({ success: true, message: 'Kampanye berhasil dibatalkan', data: result });
    } catch (error: any) {
      return reply.status(error.statusCode || 400).send({ success: false, error: error.message });
    }
  });

  // POST retry failed recipients
  fastify.post('/:id/retry-failed', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const result = await BroadcastService.retryFailedRecipients(req.params.id);
      return reply.send({
        success: true,
        message: `${result.retriedCount} penerima gagal dimasukkan kembali ke antrean`,
        data: result,
      });
    } catch (error: any) {
      return reply.status(error.statusCode || 400).send({ success: false, error: error.message });
    }
  });

  // DELETE campaign
  fastify.delete('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      await db.delete(campaigns).where(eq(campaigns.id, req.params.id));
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
      const { status, search, page = '1', limit = '50' } = req.query;
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 50;
      const offset = (pageNum - 1) * limitNum;

      const conditions: any[] = [];
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

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

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
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
