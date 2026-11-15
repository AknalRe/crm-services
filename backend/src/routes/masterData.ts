import crypto from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, asc, eq, ilike, ne, or } from 'drizzle-orm';
import { db } from '../db';
import { cannedResponses, crmLabels, messageTemplates } from '../db/schema';
import { requirePermission } from './auth';

const VALID_SCOPES = new Set(['CONVERSATION_LABEL', 'CONTACT_CATEGORY']);
const VALID_COLORS = new Set(['slate', 'indigo', 'emerald', 'amber', 'rose', 'sky', 'violet']);
const VALID_TEMPLATE_CHANNELS = new Set([
  'ALL',
  'WHATSAPP',
  'WHATSAPP_CLOUD',
  'INSTAGRAM',
  'FACEBOOK',
  'THREADS',
  'TELEGRAM',
]);

function normalizeShortCode(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/\s+/g, '-');
}

export default async function masterDataRouter(fastify: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // Master Balasan Cepat (Quick Replies / Canned Responses)
  // ---------------------------------------------------------------------------
  fastify.get<{ Querystring: { activeOnly?: string; category?: string; search?: string } }>(
    '/quick-replies',
    { preHandler: requirePermission('settings', 'conversations', 'contacts', 'broadcasts') },
    async (req, reply: FastifyReply) => {
      try {
        const { activeOnly, category, search } = req.query || {};
        const conditions: any[] = [];
        if (activeOnly === 'true') conditions.push(eq(cannedResponses.isActive, true));
        if (category && category !== 'ALL') conditions.push(eq(cannedResponses.category, category));
        if (search && search.trim()) {
          const q = `%${search.trim()}%`;
          conditions.push(
            or(
              ilike(cannedResponses.shortCode, q),
              ilike(cannedResponses.title, q),
              ilike(cannedResponses.content, q)
            )
          );
        }

        const list = await db
          .select()
          .from(cannedResponses)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(asc(cannedResponses.category), asc(cannedResponses.shortCode));

        return reply.send({ success: true, data: list });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  fastify.post<{
    Body: {
      shortCode?: string;
      title?: string;
      category?: string;
      content?: string;
      isActive?: boolean;
    };
  }>(
    '/quick-replies',
    { preHandler: requirePermission('settings', 'conversations') },
    async (req, reply: FastifyReply) => {
      try {
        const shortCode = normalizeShortCode(String(req.body?.shortCode || ''));
        const title = String(req.body?.title || '').trim();
        const category = String(req.body?.category || 'Umum').trim() || 'Umum';
        const content = String(req.body?.content || '').trim();
        if (!shortCode || !title || !content) {
          return reply.status(400).send({
            success: false,
            error: 'Kode singkat (/kode), judul, dan isi balasan wajib diisi',
          });
        }

        const now = new Date();
        const [created] = await db
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

        return reply.status(201).send({ success: true, data: created });
      } catch (error: any) {
        if (String(error.message || '').toLowerCase().includes('unique')) {
          return reply.status(400).send({ success: false, error: 'Kode singkat sudah terdaftar' });
        }
        return reply.status(400).send({ success: false, error: error.message });
      }
    }
  );

  fastify.patch<{
    Params: { id: string };
    Body: {
      shortCode?: string;
      title?: string;
      category?: string;
      content?: string;
      isActive?: boolean;
    };
  }>(
    '/quick-replies/:id',
    { preHandler: requirePermission('settings', 'conversations') },
    async (req, reply: FastifyReply) => {
      try {
        const patch: Record<string, any> = { updatedAt: new Date() };
        if (req.body?.shortCode !== undefined) {
          const shortCode = normalizeShortCode(String(req.body.shortCode));
          if (!shortCode) {
            return reply.status(400).send({ success: false, error: 'Kode singkat tidak boleh kosong' });
          }
          patch.shortCode = shortCode;
        }
        if (req.body?.title !== undefined) {
          const title = String(req.body.title).trim();
          if (!title) {
            return reply.status(400).send({ success: false, error: 'Judul balasan tidak boleh kosong' });
          }
          patch.title = title;
        }
        if (req.body?.category !== undefined) {
          patch.category = String(req.body.category).trim() || 'Umum';
        }
        if (req.body?.content !== undefined) {
          const content = String(req.body.content).trim();
          if (!content) {
            return reply.status(400).send({ success: false, error: 'Isi balasan tidak boleh kosong' });
          }
          patch.content = content;
        }
        if (req.body?.isActive !== undefined) {
          patch.isActive = Boolean(req.body.isActive);
        }

        const [updated] = await db
          .update(cannedResponses)
          .set(patch)
          .where(eq(cannedResponses.id, req.params.id))
          .returning();

        if (!updated) {
          return reply.status(404).send({ success: false, error: 'Balasan cepat tidak ditemukan' });
        }

        return reply.send({ success: true, data: updated });
      } catch (error: any) {
        if (String(error.message || '').toLowerCase().includes('unique')) {
          return reply.status(400).send({ success: false, error: 'Kode singkat sudah digunakan item lain' });
        }
        return reply.status(400).send({ success: false, error: error.message });
      }
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    '/quick-replies/:id',
    { preHandler: requirePermission('settings', 'conversations') },
    async (req, reply: FastifyReply) => {
      try {
        const deleted = await db
          .delete(cannedResponses)
          .where(eq(cannedResponses.id, req.params.id))
          .returning();
        if (!deleted[0]) {
          return reply.status(404).send({ success: false, error: 'Balasan cepat tidak ditemukan' });
        }
        return reply.send({ success: true });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Master Label Percakapan & Kategori Kontak
  // ---------------------------------------------------------------------------
  fastify.get<{ Querystring: { scope?: string; activeOnly?: string } }>(
    '/labels',
    { preHandler: requirePermission('settings', 'conversations', 'contacts', 'broadcasts') },
    async (req, reply: FastifyReply) => {
      try {
        const { scope, activeOnly } = req.query || {};
        const conditions: any[] = [];
        if (scope && VALID_SCOPES.has(scope)) conditions.push(eq(crmLabels.scope, scope));
        if (activeOnly === 'true') conditions.push(eq(crmLabels.isActive, true));

        const list = await db
          .select()
          .from(crmLabels)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(asc(crmLabels.scope), asc(crmLabels.sortOrder), asc(crmLabels.name));

        return reply.send({ success: true, data: list });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  fastify.post<{
    Body: {
      scope?: string;
      name?: string;
      color?: string;
      description?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    };
  }>('/labels', { preHandler: requirePermission('settings') }, async (req, reply: FastifyReply) => {
    try {
      const scope = String(req.body?.scope || '').trim().toUpperCase();
      if (!VALID_SCOPES.has(scope)) {
        return reply.status(400).send({
          success: false,
          error: 'Scope wajib CONVERSATION_LABEL atau CONTACT_CATEGORY',
        });
      }
      const name = String(req.body?.name || '').trim();
      if (!name) {
        return reply.status(400).send({ success: false, error: 'Nama label/kategori wajib diisi' });
      }
      const duplicate = await db
        .select({ id: crmLabels.id })
        .from(crmLabels)
        .where(and(eq(crmLabels.scope, scope), ilike(crmLabels.name, name)))
        .limit(1);
      if (duplicate[0]) {
        return reply.status(400).send({ success: false, error: `"${name}" sudah terdaftar di kelompok ini` });
      }

      const rawColor = String(req.body?.color || 'slate').trim().toLowerCase();
      const color = VALID_COLORS.has(rawColor) ? rawColor : 'slate';
      const sortOrder = Number.isFinite(Number(req.body?.sortOrder))
        ? Math.round(Number(req.body?.sortOrder))
        : 10;
      const description = req.body?.description ? String(req.body.description).trim() || null : null;
      const now = new Date();

      const [created] = await db
        .insert(crmLabels)
        .values({
          id: crypto.randomUUID(),
          scope,
          name,
          color,
          description,
          sortOrder,
          isActive: req.body?.isActive !== false,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return reply.status(201).send({ success: true, data: created });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      color?: string;
      description?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    };
  }>('/labels/:id', { preHandler: requirePermission('settings') }, async (req, reply: FastifyReply) => {
    try {
      const [existing] = await db
        .select()
        .from(crmLabels)
        .where(eq(crmLabels.id, req.params.id))
        .limit(1);
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Label/kategori tidak ditemukan' });
      }

      const patch: Record<string, any> = { updatedAt: new Date() };
      if (req.body?.name !== undefined) {
        const cleanName = String(req.body.name).trim();
        if (!cleanName) {
          return reply.status(400).send({ success: false, error: 'Nama label/kategori tidak boleh kosong' });
        }
        const dup = await db
          .select({ id: crmLabels.id })
          .from(crmLabels)
          .where(
            and(
              eq(crmLabels.scope, existing.scope),
              ilike(crmLabels.name, cleanName),
              ne(crmLabels.id, existing.id)
            )
          )
          .limit(1);
        if (dup[0]) {
          return reply.status(400).send({ success: false, error: `"${cleanName}" sudah digunakan` });
        }
        patch.name = cleanName;
      }
      if (req.body?.color !== undefined) {
        const c = String(req.body.color).trim().toLowerCase();
        patch.color = VALID_COLORS.has(c) ? c : existing.color;
      }
      if (req.body?.description !== undefined) {
        patch.description = req.body.description ? String(req.body.description).trim() || null : null;
      }
      if (req.body?.sortOrder !== undefined && Number.isFinite(Number(req.body.sortOrder))) {
        patch.sortOrder = Math.round(Number(req.body.sortOrder));
      }
      if (req.body?.isActive !== undefined) {
        patch.isActive = Boolean(req.body.isActive);
      }

      const [updated] = await db
        .update(crmLabels)
        .set(patch)
        .where(eq(crmLabels.id, existing.id))
        .returning();

      return reply.send({ success: true, data: updated });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.delete<{ Params: { id: string } }>(
    '/labels/:id',
    { preHandler: requirePermission('settings') },
    async (req, reply: FastifyReply) => {
      try {
        const deleted = await db
          .delete(crmLabels)
          .where(eq(crmLabels.id, req.params.id))
          .returning();
        if (!deleted[0]) {
          return reply.status(404).send({ success: false, error: 'Label/kategori tidak ditemukan' });
        }
        return reply.send({ success: true });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Master Template Pesan / Siaran
  // ---------------------------------------------------------------------------
  fastify.get<{ Querystring: { activeOnly?: string; channel?: string; category?: string } }>(
    '/templates',
    { preHandler: requirePermission('settings', 'broadcasts', 'conversations', 'birthday') },
    async (req, reply: FastifyReply) => {
      try {
        const { activeOnly, channel, category } = req.query || {};
        const conditions: any[] = [];
        if (activeOnly === 'true') conditions.push(eq(messageTemplates.isActive, true));
        if (channel && channel !== 'ALL') conditions.push(eq(messageTemplates.channel, channel));
        if (category && category !== 'ALL') conditions.push(eq(messageTemplates.category, category));

        const list = await db
          .select()
          .from(messageTemplates)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(asc(messageTemplates.category), asc(messageTemplates.name));

        return reply.send({ success: true, data: list });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  fastify.post<{
    Body: {
      name?: string;
      category?: string;
      channel?: string;
      content?: string;
      isActive?: boolean;
    };
  }>(
    '/templates',
    { preHandler: requirePermission('settings', 'broadcasts') },
    async (req, reply: FastifyReply) => {
      try {
        const name = String(req.body?.name || '').trim();
        const content = String(req.body?.content || '').trim();
        const category = String(req.body?.category || 'Umum').trim() || 'Umum';
        const rawChannel = String(req.body?.channel || 'ALL').trim().toUpperCase();
        const channel = VALID_TEMPLATE_CHANNELS.has(rawChannel) ? rawChannel : 'ALL';

        if (!name || !content) {
          return reply.status(400).send({
            success: false,
            error: 'Nama template dan isi pesan wajib diisi',
          });
        }

        const now = new Date();
        const [created] = await db
          .insert(messageTemplates)
          .values({
            id: crypto.randomUUID(),
            name,
            category,
            channel,
            content,
            isActive: req.body?.isActive !== false,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        return reply.status(201).send({ success: true, data: created });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  fastify.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      category?: string;
      channel?: string;
      content?: string;
      isActive?: boolean;
    };
  }>(
    '/templates/:id',
    { preHandler: requirePermission('settings', 'broadcasts') },
    async (req, reply: FastifyReply) => {
      try {
        const patch: Record<string, any> = { updatedAt: new Date() };
        if (req.body?.name !== undefined) {
          const cleanName = String(req.body.name).trim();
          if (!cleanName) {
            return reply.status(400).send({ success: false, error: 'Nama template tidak boleh kosong' });
          }
          patch.name = cleanName;
        }
        if (req.body?.content !== undefined) {
          const cleanContent = String(req.body.content).trim();
          if (!cleanContent) {
            return reply.status(400).send({ success: false, error: 'Isi pesan template tidak boleh kosong' });
          }
          patch.content = cleanContent;
        }
        if (req.body?.category !== undefined) {
          patch.category = String(req.body.category).trim() || 'Umum';
        }
        if (req.body?.channel !== undefined) {
          const ch = String(req.body.channel).trim().toUpperCase();
          patch.channel = VALID_TEMPLATE_CHANNELS.has(ch) ? ch : 'ALL';
        }
        if (req.body?.isActive !== undefined) {
          patch.isActive = Boolean(req.body.isActive);
        }

        const [updated] = await db
          .update(messageTemplates)
          .set(patch)
          .where(eq(messageTemplates.id, req.params.id))
          .returning();

        if (!updated) {
          return reply.status(404).send({ success: false, error: 'Template pesan tidak ditemukan' });
        }
        return reply.send({ success: true, data: updated });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    '/templates/:id',
    { preHandler: requirePermission('settings', 'broadcasts') },
    async (req, reply: FastifyReply) => {
      try {
        const deleted = await db
          .delete(messageTemplates)
          .where(eq(messageTemplates.id, req.params.id))
          .returning();
        if (!deleted[0]) {
          return reply.status(404).send({ success: false, error: 'Template pesan tidak ditemukan' });
        }
        return reply.send({ success: true });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );
}
