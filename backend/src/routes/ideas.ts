import crypto from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { contentIdeas, systemSettings } from '../db/schema';
import { requirePermission } from './auth';

const DEFAULT_IDEA_COLUMNS = [
  { id: 'IDE', label: 'Ide' },
  { id: 'DIKERJAKAN', label: 'Dikerjakan' },
  { id: 'SIAP', label: 'Siap' },
];

export default async function ideasRouter(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requirePermission('broadcasts'));

  fastify.get('/columns', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const [row] = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, 'idea_columns'));
      if (!row?.value) {
        return reply.send({ success: true, data: DEFAULT_IDEA_COLUMNS });
      }
      try {
        const parsed = JSON.parse(row.value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return reply.send({ success: true, data: parsed });
        }
      } catch {
        // fallback to default
      }
      return reply.send({ success: true, data: DEFAULT_IDEA_COLUMNS });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.put<{
    Body: { columns?: Array<{ id: string; label: string }> };
  }>('/columns', async (req, reply) => {
    try {
      const incoming = Array.isArray(req.body?.columns) ? req.body.columns : [];
      const sanitized = incoming
        .map((c) => ({
          id: String(c?.id || '')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9_]/g, '_'),
          label: String(c?.label || '').trim(),
        }))
        .filter((c) => c.id && c.label);

      if (sanitized.length === 0) {
        return reply.status(400).send({ success: false, error: 'Minimal 1 kolom diperlukan' });
      }

      const payload = JSON.stringify(sanitized);
      await db
        .insert(systemSettings)
        .values({ key: 'idea_columns', value: payload })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: payload, updatedAt: new Date() },
        });
      return reply.send({ success: true, data: sanitized });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const rows = await db.select().from(contentIdeas).orderBy(desc(contentIdeas.updatedAt));
      return reply.send({ success: true, data: rows });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post<{
    Body: { title?: string; notes?: string | null; channel?: string; stage?: string };
  }>('/', async (req, reply) => {
    try {
      const title = String(req.body?.title || '').trim();
      if (!title) {
        return reply.status(400).send({ success: false, error: 'Judul ide wajib diisi' });
      }
      const now = new Date();
      const [inserted] = await db
        .insert(contentIdeas)
        .values({
          id: crypto.randomUUID(),
          title,
          notes: req.body?.notes ? String(req.body.notes).trim() : null,
          channel: String(req.body?.channel || 'INSTAGRAM').toUpperCase(),
          stage: String(req.body?.stage || 'IDE').toUpperCase(),
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
    Body: { title?: string; notes?: string | null; channel?: string; stage?: string };
  }>('/:id', async (req, reply) => {
    try {
      const updateData: any = { updatedAt: new Date() };
      if (req.body?.title !== undefined) {
        const cleanTitle = String(req.body.title).trim();
        if (!cleanTitle) {
          return reply.status(400).send({ success: false, error: 'Judul ide tidak boleh kosong' });
        }
        updateData.title = cleanTitle;
      }
      if (req.body?.notes !== undefined) {
        updateData.notes = req.body.notes ? String(req.body.notes).trim() : null;
      }
      if (req.body?.channel !== undefined) updateData.channel = String(req.body.channel).toUpperCase();
      if (req.body?.stage !== undefined) updateData.stage = String(req.body.stage).toUpperCase();

      const [updated] = await db
        .update(contentIdeas)
        .set(updateData)
        .where(eq(contentIdeas.id, req.params.id))
        .returning();
      if (!updated) {
        return reply.status(404).send({ success: false, error: 'Ide konten tidak ditemukan' });
      }
      return reply.send({ success: true, data: updated });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    try {
      await db.delete(contentIdeas).where(eq(contentIdeas.id, req.params.id));
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
