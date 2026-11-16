import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { conversations, contacts, csatResponses } from '../db/schema';
import { liveEvents } from '../services/events.service';
import { notifyAlertWebhook } from '../services/automation.service';

export default async function publicCsatRouter(fastify: FastifyInstance) {
  // GET CSAT details by public token (no panel auth required)
  fastify.get('/:token', async (req: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
    try {
      const token = (req.params.token || '').trim();
      if (!token) {
        return reply.status(400).send({ success: false, error: 'Token CSAT tidak valid' });
      }

      const csatRows = await db
        .select({
          csat: csatResponses,
          contact: contacts,
        })
        .from(csatResponses)
        .leftJoin(contacts, eq(csatResponses.contactId, contacts.id))
        .where(eq(csatResponses.token, token));

      if (csatRows[0]) {
        const item = csatRows[0];
        return reply.send({
          success: true,
          data: {
            contactName: item.contact?.namaPanggilan || item.contact?.namaLengkap || 'Pelanggan',
            alreadyRated: Boolean(item.csat.rating),
            rating: item.csat.rating,
            feedback: item.csat.feedback,
            submittedAt: item.csat.submittedAt,
          },
        });
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

      const now = new Date();
      const csatRows = await db
        .select()
        .from(csatResponses)
        .where(eq(csatResponses.token, token));

      let convId: string | null = null;
      if (csatRows[0]) {
        if (csatRows[0].rating !== null) {
          return reply.status(409).send({
            success: false,
            error: 'Penilaian untuk tautan ini sudah pernah dikirim',
          });
        }
        convId = csatRows[0].conversationId;
        const updatedCsat = await db
          .update(csatResponses)
          .set({
            rating,
            feedback,
            submittedAt: now,
          })
          .where(and(eq(csatResponses.id, csatRows[0].id), isNull(csatResponses.rating)))
          .returning();
        if (!updatedCsat[0]) {
          return reply.status(409).send({
            success: false,
            error: 'Penilaian untuk tautan ini sudah pernah dikirim',
          });
        }
      } else {
        const rows = await db
          .select()
          .from(conversations)
          .where(eq(conversations.csatToken, token));
        if (!rows[0]) {
          return reply.status(404).send({ success: false, error: 'Tautan penilaian tidak ditemukan' });
        }
        if (rows[0].csatRating !== null) {
          return reply.status(409).send({
            success: false,
            error: 'Penilaian untuk tautan ini sudah pernah dikirim',
          });
        }
        convId = rows[0].id;
      }

      await db
        .update(conversations)
        .set({
          csatRating: rating,
          csatFeedback: feedback,
          csatSubmittedAt: now,
          updatedAt: now,
        })
        .where(eq(conversations.id, convId));

      liveEvents.emit('conversations:update', { conversationId: convId, csatRating: rating });
      liveEvents.emit('tracking:update', { conversationId: convId, csatRating: rating });
      if (rating <= 2) {
        liveEvents.emit('csat:low', { conversationId: convId, rating, feedback });
        void notifyAlertWebhook('low_csat', {
          conversationId: convId,
          rating,
          feedback,
        });
      }

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
