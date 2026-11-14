import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { and, eq, inArray, like, lt, or, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  campaignRecipients,
  campaigns,
  chatMessages,
  contacts,
  conversations,
} from '../db/schema';
import { wahaService } from '../services/waha.service';
import { licenseService } from '../services/license.service';
import { liveEvents } from '../services/events.service';
import { fromWahaChatId, normalizePhoneNumber } from '../services/phone.utils';
import crypto from 'crypto';

function extractWahaMessageIds(payload: any): { exactIds: string[]; stanzaIds: string[] } {
  const rawCandidates = [
    payload?.id?._serialized,
    typeof payload?.id === 'string' ? payload.id : null,
    payload?.id?.id,
    payload?._data?.id?._serialized,
    payload?._data?.id?.id,
    payload?._data?.Info?.ID,
    payload?._data?.key?.id,
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
  // GET WAHA server & session status
  fastify.get('/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = await wahaService.getStatus();
      return reply.send({ success: true, data: status });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET all WAHA sessions
  fastify.get('/sessions', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await wahaService.listSessions();
      return reply.send({ success: true, data });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST create & start a new WAHA session (gated by multiSession / maxSessions license)
  fastify.post('/sessions', async (req: FastifyRequest<{
    Body: { name: string; setActive?: boolean };
  }>, reply: FastifyReply) => {
    try {
      const { name, setActive = true } = req.body || {};
      const clean = (name || '').trim();
      const lic = await licenseService.assertLicenseActive();

      let existingCount = 0;
      let alreadyExists = false;
      try {
        const listed = await wahaService.listSessions();
        existingCount = listed.sessions.length;
        alreadyExists = listed.sessions.some((s) => s.name === clean);
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
      liveEvents.emit('waha:status', { action: 'create', session: clean });
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(error.statusCode || 400).send({ success: false, error: error.message });
    }
  });

  // POST switch active WAHA session
  fastify.post('/sessions/active', async (req: FastifyRequest<{
    Body: { session: string };
  }>, reply: FastifyReply) => {
    try {
      const active = await wahaService.setActiveSession(req.body?.session || '');
      liveEvents.emit('waha:status', { action: 'switch', session: active });
      return reply.send({ success: true, data: { activeSession: active } });
    } catch (error: any) {
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  // DELETE remove a WAHA session
  fastify.delete('/sessions/:name', async (req: FastifyRequest<{
    Params: { name: string };
  }>, reply: FastifyReply) => {
    try {
      const result = await wahaService.deleteSession(req.params.name);
      liveEvents.emit('waha:status', { action: 'delete', session: req.params.name });
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET QR code
  fastify.get('/qr', async (req: FastifyRequest<{
    Querystring: { session?: string };
  }>, reply: FastifyReply) => {
    try {
      const qrData = await wahaService.getQrCode(req.query?.session);
      return reply.send({ success: true, data: qrData });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST start session
  fastify.post('/session/start', async (req: FastifyRequest<{
    Body?: { session?: string };
  }>, reply: FastifyReply) => {
    try {
      const result = await wahaService.startSession(req.body?.session);
      liveEvents.emit('waha:status', { action: 'start', session: req.body?.session });
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST stop session
  fastify.post('/session/stop', async (req: FastifyRequest<{
    Body?: { session?: string };
  }>, reply: FastifyReply) => {
    try {
      const result = await wahaService.stopSession(req.body?.session);
      liveEvents.emit('waha:status', { action: 'stop', session: req.body?.session });
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST logout session
  fastify.post('/session/logout', async (req: FastifyRequest<{
    Body?: { session?: string };
  }>, reply: FastifyReply) => {
    try {
      const result = await wahaService.logoutSession(req.body?.session);
      liveEvents.emit('waha:status', { action: 'logout', session: req.body?.session });
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST test send message
  fastify.post('/send-test', async (req: FastifyRequest<{
    Body: { phone: string; message: string; session?: string };
  }>, reply: FastifyReply) => {
    try {
      const { phone, message, session } = req.body;
      if (!phone || !message) {
        return reply.status(400).send({ success: false, error: 'Phone dan message wajib diisi' });
      }
      const result = await wahaService.sendTextMessage(phone, message, session?.trim() || undefined);
      return reply.send({ success: result.success, data: result });
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
        liveEvents.emit('tracking:update', { ack: ackValue, msgId: exactIds[0] });
        liveEvents.emit('conversations:update', { ack: ackValue, msgId: exactIds[0] });
      }

      // 2. Incoming Messages (message) - only personal 1:1 chats (@c.us / @s.whatsapp.net)
      const rawFrom = String(payload?.from || '');
      const isPersonalChat =
        rawFrom.endsWith('@c.us') || rawFrom.endsWith('@s.whatsapp.net');
      if (event === 'message' && payload && !payload.fromMe && isPersonalChat) {
        const fromPhone = normalizePhoneNumber(fromWahaChatId(rawFrom));
        const digitCount = fromPhone.replace(/\D/g, '').length;
        if (digitCount < 8 || digitCount > 15) {
          return reply.send({ success: true, message: 'Webhook ignored (non-phone JID)' });
        }
        const body = payload.body || (payload.hasMedia ? '[Lampiran Media]' : '');
        const now = new Date();
        const msgId = payload.id?._serialized || payload.id?.id || payload.id;
        const inboundSession = webhookSession ? String(webhookSession).trim() : null;
        const mediaUrl = payload.media?.url || payload.mediaUrl || null;
        const rawMime = String(payload.media?.mimetype || payload._data?.mimetype || '');
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

        // Find or create contact
        const contactList = await db
          .select()
          .from(contacts)
          .where(eq(contacts.nomorWhatsapp, fromPhone));

        let contact = contactList[0];

        if (!contact) {
          const contactName = payload._data?.notifyName || `Kontak ${fromPhone.slice(-4)}`;
          const insertedContacts = await db
            .insert(contacts)
            .values({
              id: crypto.randomUUID(),
              namaLengkap: contactName,
              nomorWhatsapp: fromPhone,
              tags: 'Inbound Lead',
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          contact = insertedContacts[0];
        }

        // Upsert Conversation
        const convList = await db
          .select()
          .from(conversations)
          .where(eq(conversations.contactId, contact.id));

        const existingConv = convList[0];
        let convId = existingConv?.id;

        if (!convId) {
          convId = crypto.randomUUID();
          await db.insert(conversations).values({
            id: convId,
            contactId: contact.id,
            wahaSession: inboundSession,
            status: 'OPEN',
            lastMessage: body,
            lastMessageAt: now,
            firstInboundAt: now,
            unreadCount: 1,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          await db
            .update(conversations)
            .set({
              wahaSession: inboundSession || existingConv.wahaSession,
              status: existingConv.status === 'RESOLVED' ? 'OPEN' : existingConv.status,
              firstInboundAt: existingConv.firstInboundAt || now,
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

        liveEvents.emit('conversations:update', { conversationId: convId });
        liveEvents.emit('tracking:update', { conversationId: convId });
      }

      return reply.send({ success: true, message: 'Webhook processed' });
    } catch (error: any) {
      console.error('[WAHA Webhook] Error:', error.message);
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
