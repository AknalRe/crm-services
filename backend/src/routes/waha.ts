import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, or, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  campaignRecipients,
  campaigns,
  chatMessages,
  contacts,
  conversations,
} from '../db/schema';
import { wahaService } from '../services/waha.service';
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

  // GET QR code
  fastify.get('/qr', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const qrData = await wahaService.getQrCode();
      return reply.send({ success: true, data: qrData });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST start session
  fastify.post('/session/start', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await wahaService.startSession();
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST stop session
  fastify.post('/session/stop', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await wahaService.stopSession();
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST logout session
  fastify.post('/session/logout', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await wahaService.logoutSession();
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST test send message
  fastify.post('/send-test', async (req: FastifyRequest<{
    Body: { phone: string; message: string };
  }>, reply: FastifyReply) => {
    try {
      const { phone, message } = req.body;
      if (!phone || !message) {
        return reply.status(400).send({ success: false, error: 'Phone dan message wajib diisi' });
      }
      const result = await wahaService.sendTextMessage(phone, message);
      return reply.send({ success: result.success, data: result });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // WAHA Webhook Receiver
  fastify.post('/webhook', async (req: FastifyRequest<{
    Body: { event: string; payload: any };
  }>, reply: FastifyReply) => {
    try {
      const { event, payload } = req.body || {};
      console.log(`[WAHA Webhook] Received event: ${event}`);

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
            const updateData: any = { ackStatus: ackValue, updatedAt: now };

            if (ackValue === 2) {
              updateData.status = 'DELIVERED';
              updateData.deliveredAt = now;
              await db
                .update(campaigns)
                .set({
                  deliveredCount: sql`${campaigns.deliveredCount} + 1`,
                  updatedAt: now,
                })
                .where(eq(campaigns.id, recipient.campaignId));
            } else if (ackValue >= 3) {
              updateData.status = 'READ';
              updateData.readAt = now;
              await db
                .update(campaigns)
                .set({
                  readCount: sql`${campaigns.readCount} + 1`,
                  updatedAt: now,
                })
                .where(eq(campaigns.id, recipient.campaignId));
            }

            await db
              .update(campaignRecipients)
              .set(updateData)
              .where(eq(campaignRecipients.id, recipient.id));
          }

          // Update ChatMessages if matched
          await db
            .update(chatMessages)
            .set({
              ackStatus: ackValue,
              status: ackValue >= 3 ? 'READ' : ackValue === 2 ? 'DELIVERED' : 'SENT',
              deliveredAt: ackValue === 2 ? now : undefined,
              readAt: ackValue >= 3 ? now : undefined,
            })
            .where(
              or(
                eq(chatMessages.wahaMessageId, msgId),
                payload.id?.id ? eq(chatMessages.wahaMessageId, payload.id.id) : undefined
              )
            );
        }
      }

      // 2. Incoming Messages (message)
      if (event === 'message' && payload && !payload.fromMe) {
        const fromPhone = normalizePhoneNumber(fromWahaChatId(payload.from));
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
      }

      return reply.send({ success: true, message: 'Webhook processed' });
    } catch (error: any) {
      console.error('[WAHA Webhook] Error:', error.message);
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
