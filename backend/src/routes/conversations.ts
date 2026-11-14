import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc, asc } from 'drizzle-orm';
import { db } from '../db';
import { conversations, chatMessages, contacts } from '../db/schema';
import { wahaService } from '../services/waha.service';
import { licenseService } from '../services/license.service';
import crypto from 'crypto';

export default async function conversationsRouter(fastify: FastifyInstance) {
  // Enforce Live Chat CRM license on all conversation routes
  fastify.addHook('preHandler', async (_req: FastifyRequest, reply: FastifyReply) => {
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

      const data = rows.map((r) => ({
        id: r.conv.id,
        contactId: r.conv.contactId,
        lastMessage: r.conv.lastMessage,
        lastMessageAt: r.conv.lastMessageAt,
        unreadCount: r.conv.unreadCount,
        createdAt: r.conv.createdAt,
        updatedAt: r.conv.updatedAt,
        contact: r.contact
          ? {
              id: r.contact.id,
              nama_lengkap: r.contact.namaLengkap,
              nama_panggilan: r.contact.namaPanggilan,
              nomor_whatsapp: r.contact.nomorWhatsapp,
              tags: r.contact.tags,
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

      // Reset unread count
      await db
        .update(conversations)
        .set({ unreadCount: 0, updatedAt: new Date() })
        .where(eq(conversations.id, req.params.id));

      return reply.send({ success: true, data: messages });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST send reply message
  fastify.post('/:id/messages', async (req: FastifyRequest<{
    Params: { id: string };
    Body: { body: string; session?: string };
  }>, reply: FastifyReply) => {
    try {
      const { body, session } = req.body;
      if (!body || !body.trim()) {
        return reply.status(400).send({ success: false, error: 'Pesan tidak boleh kosong' });
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

      const sendResult = await wahaService.sendTextMessage(
        conversation.contact.nomorWhatsapp,
        body.trim(),
        session?.trim() || undefined
      );

      const now = new Date();
      const messageId = crypto.randomUUID();

      const inserted = await db
        .insert(chatMessages)
        .values({
          id: messageId,
          conversationId: conversation.conv.id,
          contactId: conversation.conv.contactId,
          direction: 'OUTBOUND',
          body: body.trim(),
          wahaMessageId: sendResult.messageId,
          status: sendResult.success ? 'SENT' : 'FAILED',
          ackStatus: sendResult.success ? 1 : -1,
          sentAt: sendResult.success ? now : null,
          createdAt: now,
        })
        .returning();

      await db
        .update(conversations)
        .set({
          lastMessage: body.trim(),
          lastMessageAt: now,
          updatedAt: now,
        })
        .where(eq(conversations.id, conversation.conv.id));

      return reply.status(201).send({ success: true, data: inserted[0] });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
