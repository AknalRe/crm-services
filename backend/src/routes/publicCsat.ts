import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { conversations, contacts } from '../db/schema';
import { liveEvents } from '../services/events.service';

export default async function publicCsatRouter(fastify: FastifyInstance) {
  // GET CSAT details by public token (no panel auth required)
  fastify.get('/:token', async (req: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
    try {
      const token = (req.params.token || '').trim();
      if (!token) {
        return reply.status(400).send({ success: false, error: 'Token CSAT tidak valid' });
      }

      const rows = await db
        .select({
          conv: conversations,
          contact: contacts,
        })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(eq(conversations.csatToken, token));

      const row = rows[0];
      if (!row) {
        return reply.status(404).send({ success: false, error: 'Tautan penilaian tidak ditemukan atau sudah kedaluwarsa' });
      }

      return reply.send({
        success: true,
        data: {
          contactName: row.contact?.namaPanggilan || row.contact?.namaLengkap || 'Pelanggan',
          alreadyRated: Boolean(row.conv.csatRating),
          rating: row.conv.csatRating,
          feedback: row.conv.csatFeedback,
          submittedAt: row.conv.csatSubmittedAt,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST submit CSAT rating & feedback
  fastify.post('/:token', async (req: FastifyRequest<{
    Params: { token: string };
    Body: { rating: number; feedback?: string };
  }>, reply: FastifyReply) => {
    try {
      const token = (req.params.token || '').trim();
      const rating = Number(req.body?.rating);
      const feedback = req.body?.feedback ? String(req.body.feedback).trim() : null;

      if (!token) {
        return reply.status(400).send({ success: false, error: 'Token CSAT tidak valid' });
      }
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return reply.status(400).send({ success: false, error: 'Penilaian harus berupa angka 1 sampai 5' });
      }

      const rows = await db
        .select()
        .from(conversations)
        .where(eq(conversations.csatToken, token));

      const conv = rows[0];
      if (!conv) {
        return reply.status(404).send({ success: false, error: 'Tautan penilaian tidak ditemukan' });
      }

      const now = new Date();
      await db
        .update(conversations)
        .set({
          csatRating: rating,
          csatFeedback: feedback,
          csatSubmittedAt: now,
          updatedAt: now,
        })
        .where(eq(conversations.id, conv.id));

      liveEvents.emit('conversations:update', { conversationId: conv.id, csatRating: rating });
      liveEvents.emit('tracking:update', { conversationId: conv.id, csatRating: rating });

      return reply.send({
        success: true,
        message: 'Terima kasih atas penilaian Anda!',
        data: {
          rating,
          feedback,
          submittedAt: now,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
