import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { and, eq, inArray, like, lt, or, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  campaignRecipients,
  campaigns,
  chatMessages,
  contactIdentities,
  contacts,
  conversations,
} from '../db/schema';
import { wahaService } from '../services/waha.service';
import { licenseService } from '../services/license.service';
import { liveEvents } from '../services/events.service';
import {
  fromWahaChatId,
  isPersonalWahaJid,
  isPhoneWahaJid,
  normalizePhoneNumber,
} from '../services/phone.utils';
import { handleInboundAutomation } from '../services/automation.service';
import { requirePermission } from './auth';
import crypto from 'crypto';

export function resolveRequestPublicBase(req: FastifyRequest): string | null {
  const fwdHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const fwdProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const rawPrefix = String(req.headers['x-forwarded-prefix'] || '').split(',')[0].trim();
  let appPrefix =
    rawPrefix && /^\/app\/[^/]+/i.test(rawPrefix) ? rawPrefix.replace(/\/+$/, '') : '';

  if (fwdHost) {
    const proto = fwdProto || (req.protocol === 'https' ? 'https' : 'http');
    if (!appPrefix) {
      const ref = String(req.headers.referer || '').trim();
      const match = ref.match(/https?:\/\/[^/]+(\/app\/[^/]+)/i);
      if (match) appPrefix = match[1];
    }
    return `${proto}://${fwdHost}${appPrefix}`;
  }

  const referer = String(req.headers.referer || '').trim();
  if (referer) {
    try {
      const u = new URL(referer);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        const match = u.pathname.match(/^(\/app\/[^/]+)/i);
        return `${u.origin}${match ? match[1] : appPrefix}`;
      }
    } catch {
      // ignore invalid referer
    }
  }

  const host = String(req.headers.host || '').trim();
  if (!host) return null;
  const proto = fwdProto || (req.protocol === 'https' ? 'https' : 'http');
  return `${proto}://${host}${appPrefix}`;
}

export function isWahaFromMe(payload: any): boolean {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.fromMe === true || payload.fromMe === 'true') return true;
  if (payload._data?.key?.fromMe === true || payload._data?.Info?.IsFromMe === true) return true;
  if (typeof payload.id === 'string' && payload.id.startsWith('true_')) return true;
  if (typeof payload.id?._serialized === 'string' && payload.id._serialized.startsWith('true_')) {
    return true;
  }
  if (payload.id?.fromMe === true) return true;
  return false;
}

export function extractInboundWahaText(payload: any): string {
  const viewOnceMsg =
    payload?._data?.message?.viewOnceMessage?.message ||
    payload?._data?.message?.viewOnceMessageV2?.message;
  const candidates = [
    payload?.body,
    payload?.caption,
    payload?._data?.body,
    payload?._data?.caption,
    payload?._data?.message?.conversation,
    payload?._data?.message?.extendedTextMessage?.text,
    payload?._data?.message?.imageMessage?.caption,
    payload?._data?.message?.videoMessage?.caption,
    payload?._data?.message?.documentMessage?.caption,
    viewOnceMsg?.imageMessage?.caption,
    viewOnceMsg?.videoMessage?.caption,
    payload?._data?.message?.buttonsResponseMessage?.selectedDisplayText,
    payload?._data?.message?.listResponseMessage?.title,
    payload?._data?.message?.templateButtonReplyMessage?.selectedDisplayText,
    payload?._data?.Message?.conversation,
    payload?._data?.Message?.extendedTextMessage?.text,
    payload?._data?.Message?.imageMessage?.caption,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  if (payload?.location || payload?._data?.message?.locationMessage) {
    return '[Lokasi dibagikan]';
  }
  if (payload?.vCards || payload?._data?.message?.contactMessage || payload?._data?.message?.contactsArrayMessage) {
    return '[Kontak dibagikan]';
  }
  if (payload?._data?.message?.stickerMessage || payload?.type === 'sticker') {
    return '[Stiker]';
  }
  return '';
}

export function extractPhoneCandidatesFromWahaPayload(payload: any): string[] {
  const raw = [
    payload?.from,
    payload?.chatId,
    payload?._data?.Info?.SenderAlt,
    payload?._data?.Info?.Chat,
    payload?._data?.Info?.RecipientAlt,
    payload?._data?.key?.remoteJidAlt,
    payload?._data?.key?.senderPn,
    payload?._data?.key?.participantPn,
    payload?.participant,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of raw) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (!trimmed || !isPhoneWahaJid(trimmed)) continue;
    const normalized = normalizePhoneNumber(fromWahaChatId(trimmed));
    const digits = normalized.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15 && !seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

function extractWahaMessageIds(payload: any): { exactIds: string[]; stanzaIds: string[] } {
  const batchIds = [
    ...(Array.isArray(payload?.ids) ? payload.ids : []),
    ...(Array.isArray(payload?._data?.Info?.IDs) ? payload._data.Info.IDs : []),
  ];
  const rawCandidates = [
    payload?.id?._serialized,
    typeof payload?.id === 'string' ? payload.id : null,
    payload?.id?.id,
    payload?._data?.id?._serialized,
    payload?._data?.id?.id,
    payload?._data?.Info?.ID,
    payload?._data?.key?.id,
    ...batchIds,
  ];
  const exactSet = new Set<string>();
  const stanzaSet = new Set<string>();

  for (const val of rawCandidates) {
    if (typeof val !== 'string') continue;
    const trimmed = val.trim();
    if (!trimmed) continue;
    exactSet.add(trimmed);
    const lastUnderscore = trimmed.lastIndexOf('_');
    if (lastUnderscore !== -1 && lastUnderscore < trimmed.length - 1) {
      const stanza = trimmed.slice(lastUnderscore + 1).trim();
      if (stanza.length >= 8) {
        stanzaSet.add(stanza);
      }
    }
  }

  return {
    exactIds: Array.from(exactSet),
    stanzaIds: Array.from(stanzaSet),
  };
}

function normalizeWahaAck(payload: any): number | null {
  if (typeof payload?.ack === 'number' && !Number.isNaN(payload.ack)) {
    return payload.ack;
  }
  if (
    payload?.ack !== undefined &&
    payload?.ack !== null &&
    String(payload.ack).trim() !== '' &&
    !Number.isNaN(Number(payload.ack))
  ) {
    return Number(payload.ack);
  }
  const ackName = String(payload?.ackName || '').toUpperCase().trim();
  if (ackName === 'READ') return 3;
  if (ackName === 'PLAYED') return 4;
  if (ackName === 'DEVICE' || ackName === 'DELIVERED') return 2;
  if (ackName === 'SERVER' || ackName === 'SENT') return 1;
  if (ackName === 'ERROR' || ackName === 'FAILED') return -1;
  if (ackName === 'PENDING') return 0;
  return null;
}

export default async function wahaRouter(fastify: FastifyInstance) {
  const requireWahaRead = requirePermission('settings', 'conversations', 'broadcasts');
  const requireWahaManage = requirePermission('settings');

  // GET WAHA server & session status
  fastify.get('/status', { preHandler: requireWahaRead }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = await wahaService.getStatus(resolveRequestPublicBase(req));
      return reply.send({ success: true, data: status });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST manually sync CRM webhook URL to WAHA sessions
  fastify.post('/webhook/sync', { preHandler: requireWahaManage }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await wahaService.syncSessionWebhooks(resolveRequestPublicBase(req));
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  });

  // GET all WAHA sessions
  fastify.get('/sessions', { preHandler: requireWahaRead }, async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await wahaService.listSessions();
      return reply.send({ success: true, data });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  });

  // POST create & start a new WAHA session (gated by multiSession / maxSessions license)
  fastify.post<{
    Body: { name: string; setActive?: boolean };
  }>('/sessions', { preHandler: requireWahaManage }, async (req, reply) => {
    try {
      const { name, setActive = true } = req.body || {};
      const clean = (name || '').trim();
      if (!clean || !/^[a-zA-Z0-9_-]+$/.test(clean)) {
        return reply.status(400).send({
          success: false,
          error: 'Nama sesi hanya boleh huruf, angka, tanda hubung (-), atau underscore (_)',
        });
      }
      const lic = await licenseService.assertLicenseActive();
      const resolvedTarget = await wahaService.resolveSessionName(clean);

      let existingCount = 0;
      let alreadyExists = false;
      try {
        const listed = await wahaService.listSessions();
        existingCount = listed.sessions.length;
        alreadyExists = listed.sessions.some(
          (s) => s.name === clean || s.name === resolvedTarget
        );
      } catch {
        // Ignore if WAHA hasn't returned sessions yet
      }

      if (!alreadyExists && existingCount >= 1) {
        if (!lic.features.multiSession) {
          return reply.status(403).send({
            success: false,
            code: 'FEATURE_LOCKED',
            feature: 'multiSession',
            error: `Fitur Multi-Sesi WhatsApp terkunci pada paket "${lic.plan}". Upgrade ke Pro Bulanan atau Enterprise untuk menambah sesi lebih dari 1.`,
          });
        }
        if (existingCount >= lic.features.maxSessions) {
          return reply.status(403).send({
            success: false,
            code: 'QUOTA_EXCEEDED',
            feature: 'multiSession',
            error: `Batas maksimal ${lic.features.maxSessions} sesi WhatsApp untuk paket "${lic.plan}" telah tercapai.`,
          });
        }
      }

      const result = await wahaService.createAndStartSession(clean, setActive);
      liveEvents.emit('waha:status', { action: 'create', session: resolvedTarget });
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(error.statusCode || 400).send({ success: false, error: error.message });
    }
  });

  // POST switch active WAHA session
  fastify.post<{
    Body: { session: string };
  }>('/sessions/active', { preHandler: requireWahaManage }, async (req, reply) => {
    try {
      const active = await wahaService.setActiveSession(req.body?.session || '');
      liveEvents.emit('waha:status', { action: 'switch', session: active });
      return reply.send({ success: true, data: { activeSession: active } });
    } catch (error: any) {
      return reply.status(error.statusCode || 400).send({ success: false, error: error.message });
    }
  });

  // DELETE remove a WAHA session
  fastify.delete<{
    Params: { name: string };
  }>('/sessions/:name', { preHandler: requireWahaManage }, async (req, reply) => {
    try {
      const result = await wahaService.deleteSession(req.params.name);
      liveEvents.emit('waha:status', { action: 'delete', session: req.params.name });
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  });

  // GET QR code
  fastify.get<{
    Querystring: { session?: string };
  }>('/qr', { preHandler: requireWahaManage }, async (req, reply) => {
    try {
      const qrData = await wahaService.getQrCode(req.query?.session);
      return reply.send({ success: true, data: qrData });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  });

  // POST start session
  fastify.post<{
    Body: { session?: string } | undefined;
  }>('/session/start', { preHandler: requireWahaManage }, async (req, reply) => {
    try {
      const result = await wahaService.startSession(req.body?.session);
      liveEvents.emit('waha:status', { action: 'start', session: req.body?.session });
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  });

  // POST stop session
  fastify.post<{
    Body: { session?: string } | undefined;
  }>('/session/stop', { preHandler: requireWahaManage }, async (req, reply) => {
    try {
      const result = await wahaService.stopSession(req.body?.session);
      liveEvents.emit('waha:status', { action: 'stop', session: req.body?.session });
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  });

  // POST logout session
  fastify.post<{
    Body: { session?: string } | undefined;
  }>('/session/logout', { preHandler: requireWahaManage }, async (req, reply) => {
    try {
      const result = await wahaService.logoutSession(req.body?.session);
      liveEvents.emit('waha:status', { action: 'logout', session: req.body?.session });
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  });

  // POST test send message
  fastify.post<{
    Body: { phone: string; message: string; session?: string };
  }>('/send-test', { preHandler: requireWahaManage }, async (req, reply) => {
    try {
      const { phone, message, session } = req.body;
      if (!phone || !message) {
        return reply.status(400).send({ success: false, error: 'Phone dan message wajib diisi' });
      }
      const result = await wahaService.sendTextMessage(phone, message, session?.trim() || undefined);
      return reply.send({ success: result.success, error: result.error, data: result });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // WAHA Webhook Receiver
  fastify.post('/webhook', async (req: FastifyRequest<{
    Body: { event: string; session?: string; payload: any };
  }>, reply: FastifyReply) => {
    try {
      const { event, session: webhookSession, payload } = req.body || {};
      console.log(`[WAHA Webhook] Received event: ${event}`);

      if (event === 'session.status') {
        wahaService.recordWebhookEvent({
          receivedAt: new Date().toISOString(),
          event,
          session: webhookSession || payload?.name || null,
          from: null,
          outcome: 'PROCESSED',
          note: `Status sesi: ${payload?.status || '-'}`,
        });
        liveEvents.emit('waha:status', {
          action: 'webhook',
          session: webhookSession || payload?.name,
          status: payload?.status,
        });
      }

      // 1. Delivery & Read Receipts (message.ack)
      if (event === 'message.ack' && payload) {
        const ackValue = normalizeWahaAck(payload); // 1 = SERVER/SENT, 2 = DELIVERED, 3 = READ, 4 = PLAYED
        const { exactIds, stanzaIds } = extractWahaMessageIds(payload);
        const allIds = Array.from(new Set([...exactIds, ...stanzaIds]));
        const now = new Date();

        if (ackValue !== null && allIds.length > 0) {
          const recipientConditions = [
            inArray(campaignRecipients.wahaMessageId, allIds),
            ...stanzaIds.map((stanza) => like(campaignRecipients.wahaMessageId, `%_${stanza}`)),
          ];

          const recList = await db
            .select()
            .from(campaignRecipients)
            .where(or(...recipientConditions));

          for (const recipient of recList) {
            const currentAck = recipient.ackStatus ?? 0;
            if (ackValue > currentAck) {
              const updateData: any = { ackStatus: ackValue, updatedAt: now };

              if (ackValue >= 2 && !recipient.deliveredAt) {
                updateData.deliveredAt = now;
                await db
                  .update(campaigns)
                  .set({
                    deliveredCount: sql`${campaigns.deliveredCount} + 1`,
                    updatedAt: now,
                  })
                  .where(eq(campaigns.id, recipient.campaignId));
              }

              if (ackValue === 2) {
                updateData.status = 'DELIVERED';
              } else if (ackValue >= 3) {
                updateData.status = 'READ';
                if (!recipient.readAt) {
                  updateData.readAt = now;
                  await db
                    .update(campaigns)
                    .set({
                      readCount: sql`${campaigns.readCount} + 1`,
                      updatedAt: now,
                    })
                    .where(eq(campaigns.id, recipient.campaignId));
                }
              }

              await db
                .update(campaignRecipients)
                .set(updateData)
                .where(eq(campaignRecipients.id, recipient.id));
            }
          }

          // Update ChatMessages if matched (never downgrade ackStatus)
          const chatConditions = [
            inArray(chatMessages.wahaMessageId, allIds),
            ...stanzaIds.map((stanza) => like(chatMessages.wahaMessageId, `%_${stanza}`)),
          ];
          await db
            .update(chatMessages)
            .set({
              ackStatus: ackValue,
              status: ackValue >= 3 ? 'READ' : ackValue === 2 ? 'DELIVERED' : 'SENT',
              deliveredAt: ackValue >= 2 ? now : undefined,
              readAt: ackValue >= 3 ? now : undefined,
            })
            .where(and(or(...chatConditions), lt(chatMessages.ackStatus, ackValue)));

          console.log(
            `[WAHA Webhook] message.ack session=${webhookSession || '-'} ack=${ackValue} ids=${allIds.join(',')} matchedRecipients=${recList.length}`
          );
        }
        wahaService.recordWebhookEvent({
          receivedAt: now.toISOString(),
          event,
          session: webhookSession || null,
          from: exactIds[0] || null,
          outcome: 'PROCESSED',
          note: `Ack=${ackValue ?? '-'}`,
        });
        liveEvents.emit('tracking:update', { ack: ackValue, msgId: exactIds[0] });
        liveEvents.emit('conversations:update', { ack: ackValue, msgId: exactIds[0] });
      }

      // 2. Incoming Messages (message / message.any) - personal 1:1 chats (@c.us / @s.whatsapp.net / @lid)
      const isInboundMessageEvent = event === 'message' || event === 'message.any';
      const rawFrom = String(
        payload?.from ||
        payload?.chatId ||
        payload?._data?.Info?.Chat ||
        payload?._data?.key?.remoteJid ||
        ''
      ).trim();
      const rawChatId = String(payload?.chatId || rawFrom).trim();
      const lowerFrom = rawFrom.toLowerCase();
      const lowerChat = rawChatId.toLowerCase();
      const isNonPersonal =
        !rawFrom ||
        lowerFrom === 'status@broadcast' ||
        lowerChat === 'status@broadcast' ||
        lowerFrom.endsWith('@broadcast') ||
        lowerChat.endsWith('@broadcast') ||
        lowerFrom.endsWith('@newsletter') ||
        lowerChat.endsWith('@newsletter') ||
        lowerFrom.endsWith('@g.us') ||
        lowerChat.endsWith('@g.us');
      const isPersonalChat = !isNonPersonal && isPersonalWahaJid(rawFrom);

      if (isInboundMessageEvent && payload) {
        const now = new Date();
        if (isWahaFromMe(payload)) {
          return reply.send({ success: true, message: 'Webhook ignored (fromMe)' });
        }
        if (!isPersonalChat) {
          wahaService.recordWebhookEvent({
            receivedAt: now.toISOString(),
            event,
            session: webhookSession || null,
            from: rawFrom || null,
            outcome: 'IGNORED',
            note: 'Bukan chat personal 1:1',
          });
          return reply.send({ success: true, message: 'Webhook ignored (non-personal JID)' });
        }

        const inboundSession = webhookSession ? String(webhookSession).trim() : null;
        const { exactIds } = extractWahaMessageIds(payload);
        const msgId = exactIds[0] || null;

        if (msgId) {
          const dupMsg = await db
            .select({ id: chatMessages.id, conversationId: chatMessages.conversationId })
            .from(chatMessages)
            .where(eq(chatMessages.wahaMessageId, msgId))
            .limit(1);
          if (dupMsg[0]) {
            wahaService.recordWebhookEvent({
              receivedAt: now.toISOString(),
              event,
              session: inboundSession,
              from: rawFrom,
              outcome: 'DEDUP',
              note: 'Pesan duplikat diabaikan',
            });
            return reply.send({ success: true, deduplicated: true, message: 'Duplicate webhook ignored' });
          }
        }

        const mediaUrl = payload.media?.url || payload.mediaUrl || payload._data?.mediaUrl || null;
        const rawMime = String(
          payload.media?.mimetype ||
          payload._data?.mimetype ||
          payload._data?.message?.imageMessage?.mimetype ||
          payload._data?.message?.videoMessage?.mimetype ||
          payload._data?.message?.audioMessage?.mimetype ||
          payload._data?.message?.documentMessage?.mimetype ||
          ''
        );
        const mediaType = rawMime.startsWith('image/')
          ? 'image'
          : rawMime.startsWith('video/')
          ? 'video'
          : rawMime.startsWith('audio/')
          ? 'audio'
          : payload.hasMedia || mediaUrl
          ? 'document'
          : null;
        const mediaName = payload.media?.filename || payload._data?.filename || null;
        const rawText = extractInboundWahaText(payload);
        const hasMedia = Boolean(payload.hasMedia || mediaUrl || mediaType);
        const body = rawText || (hasMedia ? '[Lampiran Media]' : '');

        if (!body && !hasMedia) {
          wahaService.recordWebhookEvent({
            receivedAt: now.toISOString(),
            event,
            session: inboundSession,
            from: rawFrom,
            outcome: 'IGNORED',
            note: 'Event tanpa isi pesan atau media',
          });
          return reply.send({ success: true, message: 'Webhook ignored (empty message body)' });
        }

        const isLidSource = lowerFrom.endsWith('@lid');
        let fromPhone: string | null = extractPhoneCandidatesFromWahaPayload(payload)[0] || null;
        if (!fromPhone && isLidSource) {
          fromPhone = await wahaService.resolveLidToPhone(inboundSession, rawFrom);
        }

        const notifyName = String(
          payload.notifyName ||
          payload._data?.notifyName ||
          payload._data?.Info?.PushName ||
          payload._data?.pushName ||
          ''
        ).trim();

        // Find contact by normalized phone OR WAHA @lid contact identity
        let contact: typeof contacts.$inferSelect | undefined;
        if (fromPhone) {
          const phoneVariants = Array.from(
            new Set([
              fromPhone,
              `+${fromPhone}`,
              fromPhone.startsWith('62') ? `0${fromPhone.slice(2)}` : '',
            ].filter(Boolean))
          );
          const contactList = await db
            .select()
            .from(contacts)
            .where(inArray(contacts.nomorWhatsapp, phoneVariants));
          contact = contactList[0];
        }

        if (!contact && isLidSource) {
          const identityRows = await db
            .select()
            .from(contactIdentities)
            .where(
              and(
                eq(contactIdentities.channel, 'WHATSAPP'),
                eq(contactIdentities.externalId, rawFrom)
              )
            );
          if (identityRows[0]) {
            const byId = await db
              .select()
              .from(contacts)
              .where(eq(contacts.id, identityRows[0].contactId));
            contact = byId[0];
          }
        }

        if (!contact) {
          const fallbackSuffix = fromPhone ? fromPhone.slice(-4) : rawFrom.split('@')[0].slice(-4);
          const contactName = notifyName || `Kontak ${fallbackSuffix}`;
          try {
            const insertedContacts = await db
              .insert(contacts)
              .values({
                id: crypto.randomUUID(),
                namaLengkap: contactName,
                nomorWhatsapp: fromPhone || null,
                tags: 'Inbound Lead',
                createdAt: now,
                updatedAt: now,
              })
              .returning();
            contact = insertedContacts[0];
          } catch (insertErr: any) {
            if (fromPhone) {
              const retryList = await db
                .select()
                .from(contacts)
                .where(eq(contacts.nomorWhatsapp, fromPhone));
              contact = retryList[0];
            }
            if (!contact) throw insertErr;
          }
        } else if (fromPhone && !contact.nomorWhatsapp) {
          await db
            .update(contacts)
            .set({ nomorWhatsapp: fromPhone, updatedAt: now })
            .where(eq(contacts.id, contact.id))
            .catch(() => {});
        }

        if (isLidSource && contact) {
          await db
            .insert(contactIdentities)
            .values({
              id: crypto.randomUUID(),
              contactId: contact.id,
              channel: 'WHATSAPP',
              externalId: rawFrom,
              handle: fromPhone ? `+${fromPhone}` : notifyName || null,
              createdAt: now,
            })
            .onConflictDoNothing()
            .catch(() => {});
        }

        // Upsert WhatsApp Conversation
        const convList = await db
          .select()
          .from(conversations)
          .where(and(eq(conversations.contactId, contact.id), eq(conversations.channel, 'WHATSAPP')));

        const existingConv = convList[0];
        let convId = existingConv?.id;

        if (!convId) {
          convId = crypto.randomUUID();
          await db.insert(conversations).values({
            id: convId,
            contactId: contact.id,
            channel: 'WHATSAPP',
            externalThreadId: isLidSource ? rawFrom : null,
            wahaSession: inboundSession,
            status: 'OPEN',
            lastMessage: body,
            lastMessageAt: now,
            firstInboundAt: now,
            lastInboundAt: now,
            unreadCount: 1,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          await db
            .update(conversations)
            .set({
              wahaSession: inboundSession || existingConv.wahaSession,
              externalThreadId: isLidSource ? rawFrom : existingConv.externalThreadId,
              status: existingConv.status === 'RESOLVED' ? 'OPEN' : existingConv.status,
              firstInboundAt: existingConv.firstInboundAt || now,
              lastInboundAt: now,
              lastMessage: body,
              lastMessageAt: now,
              unreadCount: sql`${conversations.unreadCount} + 1`,
              updatedAt: now,
            })
            .where(eq(conversations.id, convId));
        }

        // Create ChatMessage
        await db.insert(chatMessages).values({
          id: crypto.randomUUID(),
          conversationId: convId,
          contactId: contact.id,
          direction: 'INBOUND',
          messageType: mediaType ? 'MEDIA' : 'TEXT',
          channel: 'WHATSAPP',
          wahaSession: inboundSession,
          body,
          mediaUrl,
          mediaType,
          mediaName,
          wahaMessageId: msgId,
          status: 'DELIVERED',
          ackStatus: 2,
          createdAt: now,
        });

        wahaService.recordWebhookEvent({
          receivedAt: now.toISOString(),
          event,
          session: inboundSession,
          from: fromPhone || rawFrom,
          outcome: 'PROCESSED',
          note: existingConv ? 'Pesan masuk ditambahkan ke inbox' : 'Percakapan baru dibuat di inbox',
        });

        liveEvents.emit('conversations:update', { conversationId: convId });
        liveEvents.emit('tracking:update', { conversationId: convId });

        if (body) {
          void handleInboundAutomation({
            conversationId: convId,
            contact,
            assignedAgentId: existingConv?.assignedAgentId || null,
            inboundBody: body,
            externalThreadId: isLidSource ? rawFrom : existingConv?.externalThreadId || null,
            sessionName: inboundSession || existingConv?.wahaSession || null,
            isNewConversation: !existingConv,
          });
        }
      } else if (event && event !== 'message.ack' && event !== 'session.status') {
        wahaService.recordWebhookEvent({
          receivedAt: new Date().toISOString(),
          event: String(event),
          session: webhookSession || null,
          from: rawFrom || null,
          outcome: 'IGNORED',
          note: `Event "${event}" diterima`,
        });
      }

      return reply.send({ success: true, message: 'Webhook processed' });
    } catch (error: any) {
      wahaService.recordWebhookEvent({
        receivedAt: new Date().toISOString(),
        event: String(req.body?.event || 'unknown'),
        session: req.body?.session || null,
        from: req.body?.payload?.from || null,
        outcome: 'ERROR',
        note: error.message,
      });
      console.error('[WAHA Webhook] Error:', error.message);
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
