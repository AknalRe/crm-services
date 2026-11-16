import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { and, eq, desc, asc, gt } from 'drizzle-orm';
import axios from 'axios';
import { db } from '../db';
import { conversations, chatMessages, contacts, contactIdentities, crmAgents, cannedResponses, csatResponses } from '../db/schema';
import { wahaService } from '../services/waha.service';
import { licenseService } from '../services/license.service';
import { liveEvents } from '../services/events.service';
import { OmnichannelType, sendOutboundChannelMessage } from '../services/channel.service';
import { getSettingMap, requirePermission } from './auth';
import crypto from 'crypto';

const VALID_STATUSES = new Set(['OPEN', 'PENDING', 'RESOLVED']);
const DEFAULT_CSAT_TEMPLATE =
  'Halo {nama_panggilan}, terima kasih telah menghubungi kami. Mohon bantuannya untuk memberikan penilaian layanan kami melalui tautan berikut:\n{link_csat}';

function resolveRequestAppBaseUrl(req: FastifyRequest): string {
  const rawPrefix = String(req.headers['x-forwarded-prefix'] || '').split(',')[0].trim();
  const fwdPrefix =
    rawPrefix && /^\/app\/[^/]+/i.test(rawPrefix) ? rawPrefix.replace(/\/+$/, '') : '';
  const fwdHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const fwdProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  if (fwdHost) {
    const proto = fwdProto || (req.protocol === 'https' ? 'https' : 'http');
    let appPrefix = fwdPrefix;
    if (!appPrefix) {
      const referer = String(req.headers.referer || '').trim();
      const m = referer.match(/https?:\/\/[^/]+(\/app\/[^/]+)/i);
      if (m) appPrefix = m[1];
    }
    return `${proto}://${fwdHost}${appPrefix}`;
  }

  const referer = String(req.headers.referer || '').trim();
  if (referer) {
    try {
      const u = new URL(referer);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        const appMatch = u.pathname.match(/^(\/app\/[^/]+)/i);
        return `${u.origin}${appMatch ? appMatch[1] : fwdPrefix}`;
      }
    } catch {
      // ignore invalid referer
    }
  }
  const host = String(req.headers.host || '').trim();
  if (!host) return '';
  const proto = fwdProto || (req.protocol === 'https' ? 'https' : 'http');
  return `${proto}://${host}${fwdPrefix}`;
}

async function resolveWhatsAppTarget(
  conv: typeof conversations.$inferSelect,
  contact: typeof contacts.$inferSelect
): Promise<string | null> {
  if (contact.nomorWhatsapp && contact.nomorWhatsapp.trim()) {
    return contact.nomorWhatsapp.trim();
  }
  if (conv.externalThreadId && conv.externalThreadId.trim()) {
    return conv.externalThreadId.trim();
  }
  const idRows = await db
    .select({ externalId: contactIdentities.externalId })
    .from(contactIdentities)
    .where(and(eq(contactIdentities.contactId, contact.id), eq(contactIdentities.channel, 'WHATSAPP')))
    .limit(1);
  return idRows[0]?.externalId || null;
}

async function sendCsatCtaForConversation(
  conv: typeof conversations.$inferSelect,
  contact: typeof contacts.$inferSelect,
  opts: { session?: string; baseUrl?: string; customMessage?: string; triggerType?: 'MANUAL' | 'AUTO_RESOLVE' }
) {
  const settings = await getSettingMap();
  const token = crypto.randomBytes(12).toString('hex');
  const configuredBase = (settings.csat_base_url || '').trim().replace(/\/+$/, '');
  const runtimeBase = (opts.baseUrl || '').trim().replace(/\/+$/, '');
  const base = configuredBase || runtimeBase;
  const csatUrl = base
    ? `${base.replace(/\/csat$/i, '')}/csat?token=${token}`
    : `/csat?token=${token}`;
  const template = (opts.customMessage || '').trim() || settings.csat_template || DEFAULT_CSAT_TEMPLATE;
  const namaPanggilan = contact.namaPanggilan || contact.namaLengkap;
  const ctaBody = template
    .replace(/\{nama_panggilan\}/gi, namaPanggilan)
    .replace(/\{nama_lengkap\}/gi, contact.namaLengkap)
    .replace(/\{link_csat\}/gi, csatUrl);

  const targetSession = opts.session?.trim() || conv.wahaSession || undefined;
  const convChannel = ((conv.channel || 'WHATSAPP').toUpperCase()) as OmnichannelType;
  let sendResult: { success: boolean; messageId?: string; sessionUsed?: string; error?: string };

  if (convChannel !== 'WHATSAPP') {
    const out = await sendOutboundChannelMessage({
      channel: convChannel,
      channelAccountId: conv.channelAccountId,
      contactId: conv.contactId,
      externalThreadId: conv.externalThreadId,
      text: ctaBody,
    });
    sendResult = { success: true, messageId: out.externalMessageId || undefined };
  } else {
    const targetWa = await resolveWhatsAppTarget(conv, contact);
    if (!targetWa) {
      throw new Error('Kontak belum memiliki nomor WhatsApp');
    }
    sendResult = await wahaService.sendTextMessage(
      targetWa,
      ctaBody,
      targetSession
    );
    if (!sendResult.success) {
      throw new Error(sendResult.error || 'Gagal mengirim tautan CSAT melalui WhatsApp');
    }
  }

  const effectiveSession = sendResult.sessionUsed || targetSession || null;
  const now = new Date();
  await db.insert(csatResponses).values({
    id: crypto.randomUUID(),
    conversationId: conv.id,
    contactId: conv.contactId,
    wahaSession: effectiveSession,
    assignedAgentId: conv.assignedAgentId || null,
    assignedAgentName: conv.assignedAgentName || null,
    token,
    triggerType: opts.triggerType || 'MANUAL',
    sentAt: now,
  });

  const inserted = await db
    .insert(chatMessages)
    .values({
      id: crypto.randomUUID(),
      conversationId: conv.id,
      contactId: conv.contactId,
      direction: 'OUTBOUND',
      messageType: 'CSAT',
      channel: convChannel,
      wahaSession: effectiveSession,
      body: ctaBody,
      wahaMessageId: sendResult.messageId || null,
      status: 'SENT',
      ackStatus: 1,
      sentAt: now,
      createdAt: now,
    })
    .returning();

  await db
    .update(conversations)
    .set({
      csatToken: token,
      wahaSession: effectiveSession || conv.wahaSession,
      firstResponseAt: conv.firstInboundAt && !conv.firstResponseAt ? now : conv.firstResponseAt,
      lastMessage: ctaBody,
      lastMessageAt: now,
      updatedAt: now,
    })
    .where(eq(conversations.id, conv.id));

  liveEvents.emit('conversations:update', { conversationId: conv.id });
  liveEvents.emit('tracking:update', { conversationId: conv.id });

  return {
    message: inserted[0],
    csatUrl,
    csatToken: token,
  };
}

export default async function conversationsRouter(fastify: FastifyInstance) {
  // Enforce Live Chat CRM license and conversations permission on all conversation routes
  const checkConvPerm = requirePermission('conversations');
  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    await checkConvPerm(req, reply);
    if (reply.sent) return;
    try {
      await licenseService.assertFeature('liveChatCrm');
    } catch (err: any) {
      return reply.status(err.statusCode || 403).send({
        success: false,
        code: 'FEATURE_LOCKED',
        feature: 'liveChatCrm',
        error: err.message,
      });
    }
  });

  // GET active agents for conversation assignment
  fastify.get('/agents', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const list = await db
        .select({
          id: crmAgents.id,
          name: crmAgents.name,
          email: crmAgents.email,
          role: crmAgents.role,
          isActive: crmAgents.isActive,
        })
        .from(crmAgents)
        .where(eq(crmAgents.isActive, true))
        .orderBy(asc(crmAgents.name));
      return reply.send({ success: true, data: list });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET/POST/PATCH/DELETE canned responses (quick replies)
  fastify.get<{ Querystring: { activeOnly?: string } }>(
    '/canned',
    async (req, reply: FastifyReply) => {
      try {
        const activeOnly = req.query?.activeOnly === 'true';
        const list = activeOnly
          ? await db
              .select()
              .from(cannedResponses)
              .where(eq(cannedResponses.isActive, true))
              .orderBy(asc(cannedResponses.shortCode))
          : await db.select().from(cannedResponses).orderBy(asc(cannedResponses.shortCode));
        return reply.send({ success: true, data: list });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  fastify.post('/canned', async (req: FastifyRequest<{
    Body: { shortCode?: string; title?: string; category?: string; content?: string; isActive?: boolean };
  }>, reply: FastifyReply) => {
    try {
      const shortCode = String(req.body?.shortCode || '')
        .trim()
        .toLowerCase()
        .replace(/^\/+/, '')
        .replace(/\s+/g, '-');
      const title = String(req.body?.title || '').trim();
      const category = String(req.body?.category || 'Umum').trim() || 'Umum';
      const content = String(req.body?.content || '').trim();
      if (!shortCode || !title || !content) {
        return reply.status(400).send({ success: false, error: 'shortCode, title, dan content wajib diisi' });
      }
      const now = new Date();
      const inserted = await db
        .insert(cannedResponses)
        .values({
          id: crypto.randomUUID(),
          shortCode,
          title,
          category,
          content,
          isActive: req.body?.isActive !== false,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return reply.status(201).send({ success: true, data: inserted[0] });
    } catch (error: any) {
      if (String(error.message || '').toLowerCase().includes('unique')) {
        return reply.status(400).send({ success: false, error: 'Kode singkat sudah digunakan' });
      }
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  fastify.patch('/canned/:cannedId', async (req: FastifyRequest<{
    Params: { cannedId: string };
    Body: { shortCode?: string; title?: string; category?: string; content?: string; isActive?: boolean };
  }>, reply: FastifyReply) => {
    try {
      const patch: Record<string, any> = { updatedAt: new Date() };
      if (req.body?.shortCode !== undefined) {
        const cleanCode = String(req.body.shortCode)
          .trim()
          .toLowerCase()
          .replace(/^\/+/, '')
          .replace(/\s+/g, '-');
        if (!cleanCode) {
          return reply.status(400).send({ success: false, error: 'Kode singkat tidak boleh kosong' });
        }
        patch.shortCode = cleanCode;
      }
      if (req.body?.title !== undefined) {
        const cleanTitle = String(req.body.title).trim();
        if (!cleanTitle) {
          return reply.status(400).send({ success: false, error: 'Judul tidak boleh kosong' });
        }
        patch.title = cleanTitle;
      }
      if (req.body?.category !== undefined) {
        patch.category = String(req.body.category).trim() || 'Umum';
      }
      if (req.body?.content !== undefined) {
        const cleanContent = String(req.body.content).trim();
        if (!cleanContent) {
          return reply.status(400).send({ success: false, error: 'Isi balasan tidak boleh kosong' });
        }
        patch.content = cleanContent;
      }
      if (req.body?.isActive !== undefined) {
        patch.isActive = Boolean(req.body.isActive);
      }

      const [updated] = await db
        .update(cannedResponses)
        .set(patch)
        .where(eq(cannedResponses.id, req.params.cannedId))
        .returning();
      if (!updated) {
        return reply.status(404).send({ success: false, error: 'Template balasan cepat tidak ditemukan' });
      }
      return reply.send({ success: true, data: updated });
    } catch (error: any) {
      if (String(error.message || '').toLowerCase().includes('unique')) {
        return reply.status(400).send({ success: false, error: 'Kode singkat sudah digunakan' });
      }
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  fastify.delete('/canned/:cannedId', async (req: FastifyRequest<{
    Params: { cannedId: string };
  }>, reply: FastifyReply) => {
    try {
      const deleted = await db
        .delete(cannedResponses)
        .where(eq(cannedResponses.id, req.params.cannedId))
        .returning();
      if (!deleted[0]) {
        return reply.status(404).send({ success: false, error: 'Template balasan cepat tidak ditemukan' });
      }
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET proxy inbound WAHA media safely so internal Docker/localhost WAHA URLs render in browser
  fastify.get('/media-proxy', async (req: FastifyRequest<{
    Querystring: { url?: string };
  }>, reply: FastifyReply) => {
    try {
      const rawUrl = String(req.query?.url || '').trim();
      if (!rawUrl) {
        return reply.status(400).send({ success: false, error: 'Invalid media url' });
      }
      const wahaCfg = await wahaService.getConfig(true);
      let wahaOrigin = '';
      try {
        wahaOrigin = new URL(wahaCfg.baseUrl).origin;
      } catch {
        return reply.status(400).send({ success: false, error: 'Base URL WAHA belum valid' });
      }

      let targetUrl: URL;
      if (rawUrl.startsWith('/api/files/') || rawUrl.startsWith('/files/')) {
        targetUrl = new URL(rawUrl, wahaOrigin);
      } else if (/^https?:\/\//i.test(rawUrl)) {
        targetUrl = new URL(rawUrl);
        const host = targetUrl.hostname.toLowerCase();
        const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
        if (
          isLoopback &&
          (targetUrl.pathname.startsWith('/api/files/') || targetUrl.pathname.startsWith('/files/'))
        ) {
          targetUrl = new URL(`${targetUrl.pathname}${targetUrl.search}`, wahaOrigin);
        }
      } else {
        return reply.status(400).send({ success: false, error: 'Invalid media url' });
      }

      if (!wahaOrigin || targetUrl.origin !== wahaOrigin) {
        return reply.status(403).send({
          success: false,
          error: 'Hanya media dari server WAHA terkonfigurasi yang diizinkan melalui proxy',
        });
      }
      const headers: Record<string, string> = {};
      if (wahaCfg.apiKey) {
        headers['X-Api-Key'] = wahaCfg.apiKey;
      }
      const upstream = await axios.get(targetUrl.toString(), {
        headers,
        responseType: 'arraybuffer',
        timeout: 15000,
      });
      const contentType = upstream.headers['content-type'] || 'application/octet-stream';
      reply.header('Content-Type', contentType);
      reply.header('Cache-Control', 'private, max-age=3600');
      return reply.send(Buffer.from(upstream.data));
    } catch (error: any) {
      return reply.status(502).send({ success: false, error: error.message || 'Gagal memuat media' });
    }
  });

  // GET all conversations
  fastify.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const rows = await db
        .select({
          conv: conversations,
          contact: contacts,
        })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .orderBy(desc(conversations.updatedAt));

      const csatRows = await db
        .select()
        .from(csatResponses)
        .orderBy(desc(csatResponses.sentAt));
      const csatByConv = new Map<string, typeof csatRows>();
      for (const cr of csatRows) {
        const list = csatByConv.get(cr.conversationId) || [];
        list.push(cr);
        csatByConv.set(cr.conversationId, list);
      }

      const data = rows.map((r) => ({
        id: r.conv.id,
        contactId: r.conv.contactId,
        wahaSession: r.conv.wahaSession,
        assignedAgentId: r.conv.assignedAgentId,
        assignedAgentName: r.conv.assignedAgentName,
        status: r.conv.status || 'OPEN',
        labels: r.conv.labels,
        lastMessage: r.conv.lastMessage,
        lastMessageAt: r.conv.lastMessageAt,
        unreadCount: r.conv.unreadCount,
        firstInboundAt: r.conv.firstInboundAt,
        firstResponseAt: r.conv.firstResponseAt,
        lastInboundAt: r.conv.lastInboundAt,
        channel: r.conv.channel,
        channelAccountId: r.conv.channelAccountId,
        resolvedAt: r.conv.resolvedAt,
        csatToken: r.conv.csatToken,
        csatRating: r.conv.csatRating,
        csatFeedback: r.conv.csatFeedback,
        csatSubmittedAt: r.conv.csatSubmittedAt,
        csatHistory: csatByConv.get(r.conv.id) || [],
        createdAt: r.conv.createdAt,
        updatedAt: r.conv.updatedAt,
        contact: r.contact
          ? {
              id: r.contact.id,
              nama_lengkap: r.contact.namaLengkap,
              nama_panggilan: r.contact.namaPanggilan,
              tanggal_lahir: r.contact.tanggalLahir,
              nomor_whatsapp: r.contact.nomorWhatsapp,
              tags: r.contact.tags,
              notes: r.contact.notes,
              alamat: r.contact.alamat,
            }
          : undefined,
      }));

      return reply.send({ success: true, data });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET messages for conversation
  fastify.get('/:id/messages', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const messages = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, req.params.id))
        .orderBy(asc(chatMessages.createdAt));

      // Reset unread count only when needed without mutating conversation sort timestamp
      await db
        .update(conversations)
        .set({ unreadCount: 0 })
        .where(and(eq(conversations.id, req.params.id), gt(conversations.unreadCount, 0)));

      return reply.send({ success: true, data: messages });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST open or create a conversation for a contact
  fastify.post('/open', async (req: FastifyRequest<{
    Body: { contactId?: string; session?: string };
  }>, reply: FastifyReply) => {
    try {
      const contactId = String(req.body?.contactId || '').trim();
      if (!contactId) {
        return reply.status(400).send({ success: false, error: 'contactId wajib diisi' });
      }

      const contactRows = await db.select().from(contacts).where(eq(contacts.id, contactId));
      const contact = contactRows[0];
      if (!contact) {
        return reply.status(404).send({ success: false, error: 'Kontak tidak ditemukan' });
      }

      const existingRows = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.contactId, contact.id), eq(conversations.channel, 'WHATSAPP')))
        .orderBy(desc(conversations.updatedAt));

      const now = new Date();
      const targetSession = req.body?.session?.trim() || existingRows[0]?.wahaSession || null;

      if (existingRows[0]) {
        const updated = await db
          .update(conversations)
          .set({
            status: 'OPEN',
            resolvedAt: null,
            wahaSession: targetSession,
            updatedAt: now,
          })
          .where(eq(conversations.id, existingRows[0].id))
          .returning();
        liveEvents.emit('conversations:update', { conversationId: existingRows[0].id });
        return reply.send({ success: true, data: updated[0] });
      }

      const created = await db
        .insert(conversations)
        .values({
          id: crypto.randomUUID(),
          contactId: contact.id,
          channel: 'WHATSAPP',
          status: 'OPEN',
          wahaSession: targetSession,
          unreadCount: 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      liveEvents.emit('conversations:update', { conversationId: created[0].id });
      return reply.status(201).send({ success: true, data: created[0] });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // PATCH update conversation metadata (status, labels, wahaSession, contact notes/tags)
  fastify.patch('/:id', async (req: FastifyRequest<{
    Params: { id: string };
    Body: {
      status?: string;
      labels?: string | null;
      wahaSession?: string | null;
      contactNotes?: string | null;
      contactTags?: string | null;
      assignedAgentId?: string | null;
      sendCsat?: boolean;
      baseUrl?: string;
    };
  }>, reply: FastifyReply) => {
    try {
      const convRows = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, req.params.id));
      const existing = convRows[0];
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Percakapan tidak ditemukan' });
      }

      const now = new Date();
      const convUpdate: any = { updatedAt: now };

      if (req.body?.status !== undefined) {
        const nextStatus = String(req.body.status).toUpperCase().trim();
        if (!VALID_STATUSES.has(nextStatus)) {
          return reply.status(400).send({ success: false, error: 'Status percakapan tidak valid' });
        }
        convUpdate.status = nextStatus;
        convUpdate.resolvedAt = nextStatus === 'RESOLVED' ? (existing.resolvedAt || now) : null;
      }

      if (req.body?.labels !== undefined) {
        convUpdate.labels = req.body.labels ? String(req.body.labels).trim() || null : null;
      }

      if (req.body?.wahaSession !== undefined) {
        convUpdate.wahaSession = req.body.wahaSession ? String(req.body.wahaSession).trim() || null : null;
      }

      if (req.body?.assignedAgentId !== undefined) {
        const nextAgentId = req.body.assignedAgentId ? String(req.body.assignedAgentId).trim() : '';
        if (!nextAgentId) {
          convUpdate.assignedAgentId = null;
          convUpdate.assignedAgentName = null;
        } else {
          const agentRows = await db.select().from(crmAgents).where(eq(crmAgents.id, nextAgentId));
          if (!agentRows[0]) {
            return reply.status(404).send({ success: false, error: 'Agent tidak ditemukan' });
          }
          convUpdate.assignedAgentId = agentRows[0].id;
          convUpdate.assignedAgentName = agentRows[0].name;
        }
      }

      await db
        .update(conversations)
        .set(convUpdate)
        .where(eq(conversations.id, existing.id));

      if (req.body?.contactNotes !== undefined || req.body?.contactTags !== undefined) {
        const contactUpdate: any = { updatedAt: now };
        if (req.body.contactNotes !== undefined) {
          contactUpdate.notes = req.body.contactNotes ? String(req.body.contactNotes).trim() || null : null;
        }
        if (req.body.contactTags !== undefined) {
          contactUpdate.tags = req.body.contactTags ? String(req.body.contactTags).trim() || null : null;
        }
        await db
          .update(contacts)
          .set(contactUpdate)
          .where(eq(contacts.id, existing.contactId));
      }

      liveEvents.emit('conversations:update', { conversationId: existing.id });
      liveEvents.emit('tracking:update', { conversationId: existing.id });

      let csatSent = false;
      let csatError: string | undefined;
      const transitioningToResolved =
        convUpdate.status === 'RESOLVED' && existing.status !== 'RESOLVED';
      if (transitioningToResolved) {
        const settings = await getSettingMap();
        const shouldSendCsat =
          req.body?.sendCsat === true ||
          (req.body?.sendCsat !== false && settings.csat_auto_on_resolve === 'true');
        if (shouldSendCsat) {
          const contactRows = await db
            .select()
            .from(contacts)
            .where(eq(contacts.id, existing.contactId));
          if (contactRows[0]) {
            try {
              const refreshedConv = { ...existing, ...convUpdate };
              await sendCsatCtaForConversation(refreshedConv, contactRows[0], {
                baseUrl: req.body?.baseUrl || resolveRequestAppBaseUrl(req),
                triggerType: 'AUTO_RESOLVE',
              });
              csatSent = true;
            } catch (err: any) {
              csatError = err?.message || 'Gagal mengirim tautan CSAT otomatis';
              console.warn('[Conversations] Auto-CSAT send skipped:', csatError);
            }
          }
        }
      }

      return reply.send({ success: true, data: { csatSent, csatError } });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST add internal private note (not sent to WhatsApp)
  fastify.post('/:id/notes', async (req: FastifyRequest<{
    Params: { id: string };
    Body: { body: string };
  }>, reply: FastifyReply) => {
    try {
      const body = (req.body?.body || '').trim();
      if (!body) {
        return reply.status(400).send({ success: false, error: 'Catatan tidak boleh kosong' });
      }

      const convRows = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, req.params.id));
      const existing = convRows[0];
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Percakapan tidak ditemukan' });
      }

      const now = new Date();
      const inserted = await db
        .insert(chatMessages)
        .values({
          id: crypto.randomUUID(),
          conversationId: existing.id,
          contactId: existing.contactId,
          direction: 'OUTBOUND',
          messageType: 'NOTE',
          wahaSession: existing.wahaSession,
          body,
          status: 'NOTE',
          ackStatus: 0,
          createdAt: now,
        })
        .returning();

      await db
        .update(conversations)
        .set({ updatedAt: now })
        .where(eq(conversations.id, existing.id));

      liveEvents.emit('conversations:update', { conversationId: existing.id });

      return reply.status(201).send({ success: true, data: inserted[0] });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST send CSAT rating CTA link to customer via WhatsApp
  fastify.post('/:id/csat-cta', async (req: FastifyRequest<{
    Params: { id: string };
    Body: { session?: string; baseUrl?: string; customMessage?: string };
  }>, reply: FastifyReply) => {
    try {
      const convList = await db
        .select({
          conv: conversations,
          contact: contacts,
        })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(eq(conversations.id, req.params.id));

      const row = convList[0];
      if (!row || !row.contact) {
        return reply.status(404).send({ success: false, error: 'Percakapan tidak ditemukan' });
      }

      const result = await sendCsatCtaForConversation(row.conv, row.contact, {
        session: req.body?.session,
        baseUrl: req.body?.baseUrl || resolveRequestAppBaseUrl(req),
        customMessage: req.body?.customMessage,
      });

      return reply.status(201).send({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST send reply message (text and/or media attachment)
  fastify.post('/:id/messages', async (req: FastifyRequest<{
    Params: { id: string };
    Body: {
      body?: string;
      session?: string;
      mediaBase64?: string;
      mediaMimetype?: string;
      mediaName?: string;
    };
  }>, reply: FastifyReply) => {
    try {
      const bodyText = (req.body?.body || '').trim();
      const { session, mediaBase64, mediaMimetype, mediaName } = req.body || {};

      if (!bodyText && !mediaBase64) {
        return reply.status(400).send({ success: false, error: 'Pesan atau lampiran tidak boleh kosong' });
      }

      const convList = await db
        .select({
          conv: conversations,
          contact: contacts,
        })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(eq(conversations.id, req.params.id));

      const conversation = convList[0];
      if (!conversation || !conversation.contact) {
        return reply.status(404).send({ success: false, error: 'Percakapan tidak ditemukan' });
      }

      const targetSession = session?.trim() || conversation.conv.wahaSession || undefined;
      const convChannel = ((conversation.conv.channel || 'WHATSAPP').toUpperCase()) as OmnichannelType;
      let sendResult: { success: boolean; messageId?: string; sessionUsed?: string; error?: string };
      let mediaType: string | null = null;
      let storedMediaUrl: string | null = null;

      if (convChannel !== 'WHATSAPP') {
        if (!bodyText) {
          return reply.status(400).send({
            success: false,
            error: `Pengiriman pesan di ${convChannel} saat ini mendukung balasan teks`,
          });
        }
        const out = await sendOutboundChannelMessage({
          channel: convChannel,
          channelAccountId: conversation.conv.channelAccountId,
          contactId: conversation.conv.contactId,
          externalThreadId: conversation.conv.externalThreadId,
          text: bodyText,
        });
        sendResult = { success: true, messageId: out.externalMessageId || undefined };
      } else {
        const targetWa = await resolveWhatsAppTarget(conversation.conv, conversation.contact);
        if (!targetWa) {
          return reply.status(400).send({
            success: false,
            error: 'Kontak ini belum memiliki nomor WhatsApp atau WhatsApp ID (@lid)',
          });
        }
        if (mediaBase64 && mediaMimetype) {
          mediaType = mediaMimetype.startsWith('image/')
            ? 'image'
            : mediaMimetype.startsWith('video/')
            ? 'video'
            : mediaMimetype.startsWith('audio/')
            ? 'audio'
            : 'document';
          if (mediaType === 'image') {
            storedMediaUrl = mediaBase64.startsWith('data:')
              ? mediaBase64
              : `data:${mediaMimetype};base64,${mediaBase64}`;
          }
          sendResult = await wahaService.sendMediaMessage(
            targetWa,
            {
              base64: mediaBase64,
              mimetype: mediaMimetype,
              filename: mediaName || 'attachment',
              caption: bodyText,
            },
            targetSession
          );
        } else {
          sendResult = await wahaService.sendTextMessage(
            targetWa,
            bodyText,
            targetSession
          );
        }
      }

      const now = new Date();
      const messageId = crypto.randomUUID();
      const displayBody = bodyText || (mediaName ? `[Lampiran: ${mediaName}]` : '[Lampiran Media]');
      const effectiveSession = sendResult.sessionUsed || targetSession || null;
      const sendErrorMsg = sendResult.success ? null : (sendResult.error || 'Gagal mengirim pesan WhatsApp');

      const inserted = await db
        .insert(chatMessages)
        .values({
          id: messageId,
          conversationId: conversation.conv.id,
          contactId: conversation.conv.contactId,
          direction: 'OUTBOUND',
          messageType: mediaType ? 'MEDIA' : 'TEXT',
          channel: convChannel,
          externalMessageId: convChannel === 'WHATSAPP' ? null : (sendResult.messageId || null),
          wahaSession: convChannel === 'WHATSAPP' ? effectiveSession : null,
          body: displayBody,
          mediaUrl: storedMediaUrl,
          mediaType,
          mediaName: mediaName || null,
          wahaMessageId: convChannel === 'WHATSAPP' && sendResult.success ? (sendResult.messageId || null) : null,
          status: sendResult.success ? 'SENT' : 'FAILED',
          ackStatus: sendResult.success ? 1 : -1,
          errorMessage: sendErrorMsg,
          sentAt: sendResult.success ? now : null,
          createdAt: now,
        })
        .returning();

      if (sendResult.success) {
        await db
          .update(conversations)
          .set({
            wahaSession: effectiveSession || conversation.conv.wahaSession,
            firstResponseAt:
              conversation.conv.firstInboundAt && !conversation.conv.firstResponseAt
                ? now
                : conversation.conv.firstResponseAt,
            lastMessage: displayBody,
            lastMessageAt: now,
            updatedAt: now,
          })
          .where(eq(conversations.id, conversation.conv.id));
      }

      liveEvents.emit('conversations:update', { conversationId: conversation.conv.id });
      liveEvents.emit('tracking:update', { conversationId: conversation.conv.id });

      return reply.status(201).send({
        success: true,
        sendFailed: !sendResult.success,
        error: sendErrorMsg || undefined,
        data: inserted[0],
      });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  });

  // POST retry sending a FAILED outbound message in-place
  fastify.post('/:id/messages/:messageId/retry', async (req: FastifyRequest<{
    Params: { id: string; messageId: string };
    Body: { session?: string } | undefined;
  }>, reply: FastifyReply) => {
    try {
      const msgRows = await db
        .select()
        .from(chatMessages)
        .where(and(eq(chatMessages.id, req.params.messageId), eq(chatMessages.conversationId, req.params.id)));
      const msg = msgRows[0];
      if (!msg) {
        return reply.status(404).send({ success: false, error: 'Pesan tidak ditemukan' });
      }
      if (msg.direction !== 'OUTBOUND' || (msg.status !== 'FAILED' && msg.ackStatus >= 0)) {
        return reply.status(400).send({ success: false, error: 'Hanya pesan keluar yang gagal yang dapat dikirim ulang' });
      }

      const convList = await db
        .select({ conv: conversations, contact: contacts })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(eq(conversations.id, req.params.id));
      const conversation = convList[0];
      if (!conversation || !conversation.contact) {
        return reply.status(404).send({ success: false, error: 'Percakapan tidak ditemukan' });
      }

      const targetSession = req.body?.session?.trim() || msg.wahaSession || conversation.conv.wahaSession || undefined;
      const convChannel = ((conversation.conv.channel || 'WHATSAPP').toUpperCase()) as OmnichannelType;
      let sendResult: { success: boolean; messageId?: string; sessionUsed?: string; error?: string };

      if (convChannel !== 'WHATSAPP') {
        const out = await sendOutboundChannelMessage({
          channel: convChannel,
          channelAccountId: conversation.conv.channelAccountId,
          contactId: conversation.conv.contactId,
          externalThreadId: conversation.conv.externalThreadId,
          text: msg.body,
        });
        sendResult = { success: true, messageId: out.externalMessageId || undefined };
      } else {
        const targetWa = await resolveWhatsAppTarget(conversation.conv, conversation.contact);
        if (!targetWa) {
          return reply.status(400).send({
            success: false,
            error: 'Kontak ini belum memiliki nomor WhatsApp atau WhatsApp ID (@lid)',
          });
        }
        if (msg.messageType === 'MEDIA') {
          if (!msg.mediaUrl || !msg.mediaUrl.startsWith('data:')) {
            return reply.status(400).send({
              success: false,
              error: 'Lampiran berkas tidak tersimpan untuk kirim ulang. Unggah ulang berkas melalui kolom balas.',
            });
          }
          const mimeMatch = msg.mediaUrl.match(/^data:([^;]+);base64,/);
          sendResult = await wahaService.sendMediaMessage(
            targetWa,
            {
              base64: msg.mediaUrl,
              mimetype: mimeMatch?.[1] || 'image/png',
              filename: msg.mediaName || 'attachment',
              caption: msg.body.startsWith('[Lampiran:') ? '' : msg.body,
            },
            targetSession
          );
        } else {
          sendResult = await wahaService.sendTextMessage(targetWa, msg.body, targetSession);
        }
      }

      const now = new Date();
      const effectiveSession = sendResult.sessionUsed || targetSession || null;
      const sendErrorMsg = sendResult.success ? null : (sendResult.error || 'Gagal mengirim ulang pesan WhatsApp');

      const [updated] = await db
        .update(chatMessages)
        .set({
          wahaSession: convChannel === 'WHATSAPP' ? effectiveSession : null,
          wahaMessageId: convChannel === 'WHATSAPP' && sendResult.success ? (sendResult.messageId || null) : null,
          externalMessageId: convChannel === 'WHATSAPP' ? null : (sendResult.messageId || null),
          status: sendResult.success ? 'SENT' : 'FAILED',
          ackStatus: sendResult.success ? 1 : -1,
          errorMessage: sendErrorMsg,
          sentAt: sendResult.success ? now : null,
        })
        .where(eq(chatMessages.id, msg.id))
        .returning();

      if (sendResult.success) {
        await db
          .update(conversations)
          .set({
            wahaSession: effectiveSession || conversation.conv.wahaSession,
            firstResponseAt:
              conversation.conv.firstInboundAt && !conversation.conv.firstResponseAt
                ? now
                : conversation.conv.firstResponseAt,
            lastMessage: msg.body,
            lastMessageAt: now,
            updatedAt: now,
          })
          .where(eq(conversations.id, conversation.conv.id));
      }

      liveEvents.emit('conversations:update', { conversationId: conversation.conv.id });
      liveEvents.emit('tracking:update', { conversationId: conversation.conv.id });

      return reply.send({
        success: sendResult.success,
        error: sendErrorMsg || undefined,
        data: updated,
      });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  });
}
