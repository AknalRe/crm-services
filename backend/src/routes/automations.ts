import crypto from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { commentAutomations } from '../db/schema';
import { requirePermission } from './auth';

export default async function automationsRouter(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requirePermission('settings'));

  fastify.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const rows = await db
        .select()
        .from(commentAutomations)
        .orderBy(desc(commentAutomations.createdAt));
      return reply.send({ success: true, data: rows });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post<{
    Body: {
      name?: string;
      channel?: string;
      keyword?: string;
      matchType?: string;
      replyComment?: string | null;
      sendDm?: boolean;
      dmText?: string | null;
      isActive?: boolean;
    };
  }>('/', async (req, reply) => {
    try {
      const name = String(req.body?.name || '').trim();
      const keyword = String(req.body?.keyword || '').trim();
      if (!name || !keyword) {
        return reply.status(400).send({ success: false, error: 'Nama aturan dan kata kunci wajib diisi' });
      }
      const now = new Date();
      const [inserted] = await db
        .insert(commentAutomations)
        .values({
          id: crypto.randomUUID(),
          name,
          channel: String(req.body?.channel || 'ALL').toUpperCase(),
          keyword,
          matchType: String(req.body?.matchType || 'CONTAINS').toUpperCase() === 'EXACT' ? 'EXACT' : 'CONTAINS',
          replyComment: req.body?.replyComment ? String(req.body.replyComment).trim() : null,
          sendDm: Boolean(req.body?.sendDm),
          dmText: req.body?.dmText ? String(req.body.dmText).trim() : null,
          isActive: req.body?.isActive !== false,
          triggerCount: 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return reply.status(201).send({ success: true, data: inserted });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      channel?: string;
      keyword?: string;
      matchType?: string;
      replyComment?: string | null;
      sendDm?: boolean;
      dmText?: string | null;
      isActive?: boolean;
    };
  }>('/:id', async (req, reply) => {
    try {
      const updateData: any = { updatedAt: new Date() };
      if (req.body?.name !== undefined) {
        const cleanName = String(req.body.name).trim();
        if (!cleanName) {
          return reply.status(400).send({ success: false, error: 'Nama aturan tidak boleh kosong' });
        }
        updateData.name = cleanName;
      }
      if (req.body?.channel !== undefined) updateData.channel = String(req.body.channel).toUpperCase();
      if (req.body?.keyword !== undefined) {
        const cleanKeyword = String(req.body.keyword).trim();
        if (!cleanKeyword) {
          return reply.status(400).send({ success: false, error: 'Kata kunci tidak boleh kosong' });
        }
        updateData.keyword = cleanKeyword;
      }
      if (req.body?.matchType !== undefined) {
        updateData.matchType = String(req.body.matchType).toUpperCase() === 'EXACT' ? 'EXACT' : 'CONTAINS';
      }
      if (req.body?.replyComment !== undefined) {
        updateData.replyComment = req.body.replyComment ? String(req.body.replyComment).trim() : null;
      }
      if (req.body?.sendDm !== undefined) updateData.sendDm = Boolean(req.body.sendDm);
      if (req.body?.dmText !== undefined) {
        updateData.dmText = req.body.dmText ? String(req.body.dmText).trim() : null;
      }
      if (req.body?.isActive !== undefined) updateData.isActive = Boolean(req.body.isActive);

      const [updated] = await db
        .update(commentAutomations)
        .set(updateData)
        .where(eq(commentAutomations.id, req.params.id))
        .returning();
      if (!updated) {
        return reply.status(404).send({ success: false, error: 'Aturan otomasi tidak ditemukan' });
      }
      return reply.send({ success: true, data: updated });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    try {
      await db.delete(commentAutomations).where(eq(commentAutomations.id, req.params.id));
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
