import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { and, eq, lt, or, sql } from 'drizzle-orm';
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
        const ackValue = payload.ack; // 1 = SERVER/SENT, 2 = DELIVERED, 3 = READ
        const msgId = payload.id?._serialized || payload.id?.id || payload.id;
        const now = new Date();

        if (msgId) {
          const recList = await db
            .select()
            .from(campaignRecipients)
            .where(
              or(
                eq(campaignRecipients.wahaMessageId, msgId),
                payload.id?.id ? eq(campaignRecipients.wahaMessageId, payload.id.id) : undefined
              )
            );

          const recipient = recList[0];

          if (recipient) {
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
          await db
            .update(chatMessages)
            .set({
              ackStatus: ackValue,
              status: ackValue >= 3 ? 'READ' : ackValue === 2 ? 'DELIVERED' : 'SENT',
              deliveredAt: ackValue >= 2 ? now : undefined,
              readAt: ackValue >= 3 ? now : undefined,
            })
            .where(
              and(
                or(
                  eq(chatMessages.wahaMessageId, msgId),
                  payload.id?.id ? eq(chatMessages.wahaMessageId, payload.id.id) : undefined
                ),
                lt(chatMessages.ackStatus, ackValue)
              )
            );
        }
        liveEvents.emit('tracking:update', { ack: ackValue, msgId });
        liveEvents.emit('conversations:update', { ack: ackValue, msgId });
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
        const body = payload.body || '';
        const now = new Date();
        const msgId = payload.id?._serialized || payload.id?.id || payload.id;

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

        let convId = convList[0]?.id;

        if (!convId) {
          convId = crypto.randomUUID();
          await db.insert(conversations).values({
            id: convId,
            contactId: contact.id,
            lastMessage: body,
            lastMessageAt: now,
            unreadCount: 1,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          await db
            .update(conversations)
            .set({
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
          body,
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
