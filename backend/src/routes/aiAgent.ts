import crypto from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db';
import {
  aiKnowledgeBooks,
  aiKnowledgeItems,
  aiMcpServers,
  aiSkills,
  products,
  systemSettings,
} from '../db/schema';
import {
  AI_PROVIDER_CATALOG,
  AiAgentConfig,
  AiProviderId,
  DEFAULT_AI_CONFIG,
  generateAiAgentReply,
  getAiAgentConfig,
  isValidAiProvider,
  listProviderModels,
  mergeAiAgentConfig,
  resolveSlotApiKey,
  sanitizeConfigForClient,
  verifySingleAiSlot,
} from '../services/ai.service';
import {
  KNOWLEDGE_BOOK_PRESETS,
  SKILL_PRESETS,
  fetchPublicDocumentFromUrl,
  parseMarkdownToChapters,
  parseSkillMarkdown,
  slugifySkillName,
} from '../services/aiCatalog.service';
import {
  BUILTIN_CRM_TOOLS,
  McpServerConfigRecord,
  discoverMcpTools,
  sanitizeMcpEndpointUrl,
  serializeMcpServerForClient,
} from '../services/mcpClient.service';
import { requirePermission } from './auth';

export { DEFAULT_AI_CONFIG as DEFAULT_CONFIG, getAiAgentConfig, generateAiAgentReply };

interface SlotPayloadBody {
  slotId?: string;
  provider?: AiProviderId;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  timeoutMs?: number;
  extraCandidates?: Array<{ provider: AiProviderId; baseUrl?: string; apiKey?: string }>;
}

function parseJsonStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

function serializeSkill(row: typeof aiSkills.$inferSelect) {
  return {
    ...row,
    linkedTools: parseJsonStringArray(row.linkedTools),
  };
}

export default async function aiAgentRouter(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (req, reply) => {
    if (req.method === 'GET') {
      return requirePermission('settings')(req, reply);
    }
    return requirePermission('settings.edit')(req, reply);
  });

  // ── Provider Catalog, Config, Model Discovery & Testing ─────────────────

  fastify.get('/providers', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ success: true, data: AI_PROVIDER_CATALOG });
  });

  fastify.get('/config', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const cfg = await getAiAgentConfig();
      return reply.send({
        success: true,
        data: sanitizeConfigForClient(cfg),
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.put<{ Body: Partial<AiAgentConfig> }>('/config', async (req, reply) => {
    try {
      const prev = await getAiAgentConfig();
      let next: AiAgentConfig;
      try {
        next = mergeAiAgentConfig(prev, req.body || {});
      } catch (validationErr: any) {
        return reply.status(400).send({
          success: false,
          error: validationErr?.message || 'Konfigurasi AI tidak valid',
        });
      }

      const payload = JSON.stringify(next);
      await db
        .insert(systemSettings)
        .values({ key: 'ai_agent_config', value: payload })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: payload, updatedAt: new Date() },
        });

      return reply.send({
        success: true,
        data: sanitizeConfigForClient(next),
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post<{ Body: SlotPayloadBody }>('/models', async (req, reply) => {
    try {
      const provider = req.body?.provider;
      if (!isValidAiProvider(provider)) {
        return reply.status(400).send({ success: false, error: 'Provider AI tidak valid' });
      }

      const saved = await getAiAgentConfig();
      const extraCandidates = Array.isArray(req.body?.extraCandidates)
        ? req.body.extraCandidates.filter((c) => c && isValidAiProvider(c.provider))
        : [];
      const effectiveKey = resolveSlotApiKey({
        slotId: req.body?.slotId,
        provider,
        baseUrl: req.body?.baseUrl,
        explicitApiKey: req.body?.apiKey,
        clearApiKey: req.body?.clearApiKey,
        savedConfig: saved,
        extraCandidates,
      });

      const result = await listProviderModels({
        provider,
        baseUrl: req.body?.baseUrl,
        apiKey: effectiveKey,
      });

      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: error?.message || 'Gagal memuat daftar model dari API provider',
      });
    }
  });

  fastify.post<{ Body: SlotPayloadBody }>('/verify-slot', async (req, reply) => {
    try {
      const provider = req.body?.provider;
      if (!isValidAiProvider(provider)) {
        return reply.status(400).send({ success: false, error: 'Provider AI tidak valid' });
      }

      const saved = await getAiAgentConfig();
      const extraCandidates = Array.isArray(req.body?.extraCandidates)
        ? req.body.extraCandidates.filter((c) => c && isValidAiProvider(c.provider))
        : [];
      const effectiveKey = resolveSlotApiKey({
        slotId: req.body?.slotId,
        provider,
        baseUrl: req.body?.baseUrl,
        explicitApiKey: req.body?.apiKey,
        clearApiKey: req.body?.clearApiKey,
        savedConfig: saved,
        extraCandidates,
      });

      const result = await verifySingleAiSlot({
        provider,
        model: String(req.body?.model || '').trim(),
        baseUrl: req.body?.baseUrl,
        apiKey: effectiveKey,
        timeoutMs: req.body?.timeoutMs ?? saved.timeoutMs,
      });

      return reply.send({
        success: result.ok,
        data: result,
        error: result.error,
      });
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: error?.message || 'Gagal menguji koneksi provider AI',
      });
    }
  });

  // ── Knowledge Books (Installable & Editable) ────────────────────────────

  fastify.get('/knowledge-books/catalog', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ success: true, data: KNOWLEDGE_BOOK_PRESETS });
  });

  fastify.get('/knowledge-books', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const [books, items] = await Promise.all([
        db.select().from(aiKnowledgeBooks).orderBy(desc(aiKnowledgeBooks.updatedAt)),
        db.select().from(aiKnowledgeItems),
      ]);

      const countMap = new Map<string, { total: number; active: number }>();
      for (const item of items) {
        if (!item.bookId) continue;
        const cur = countMap.get(item.bookId) || { total: 0, active: 0 };
        cur.total++;
        if (item.isActive) cur.active++;
        countMap.set(item.bookId, cur);
      }

      const data = books.map((b) => ({
        ...b,
        itemCount: countMap.get(b.id)?.total || 0,
        activeItemCount: countMap.get(b.id)?.active || 0,
      }));
      return reply.send({ success: true, data });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post<{
    Body: { title?: string; description?: string | null; category?: string };
  }>('/knowledge-books', async (req, reply) => {
    try {
      const title = String(req.body?.title || '').trim();
      if (!title) {
        return reply.status(400).send({ success: false, error: 'Judul Knowledge Book wajib diisi' });
      }
      const now = new Date();
      const [created] = await db
        .insert(aiKnowledgeBooks)
        .values({
          id: crypto.randomUUID(),
          title,
          description: req.body?.description ? String(req.body.description).trim() : null,
          category: String(req.body?.category || 'GENERAL').toUpperCase(),
          sourceType: 'MANUAL',
          sourceUrl: null,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return reply.status(201).send({
        success: true,
        data: { ...created, itemCount: 0, activeItemCount: 0 },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post<{ Body: { presetId?: string } }>(
    '/knowledge-books/install-preset',
    async (req, reply) => {
      try {
        const presetId = String(req.body?.presetId || '').trim();
        const preset = KNOWLEDGE_BOOK_PRESETS.find((p) => p.id === presetId);
        if (!preset) {
          return reply.status(404).send({ success: false, error: 'Preset Knowledge Book tidak ditemukan' });
        }

        const now = new Date();
        const bookId = crypto.randomUUID();
        const [book] = await db
          .insert(aiKnowledgeBooks)
          .values({
            id: bookId,
            title: preset.title,
            description: preset.description,
            category: preset.category,
            sourceType: 'PRESET',
            sourceUrl: null,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        for (const ch of preset.chapters) {
          await db.insert(aiKnowledgeItems).values({
            id: crypto.randomUUID(),
            bookId,
            title: ch.title,
            category: ch.category,
            content: ch.content,
            sourceUrl: null,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          });
        }

        return reply.status(201).send({
          success: true,
          data: {
            ...book,
            itemCount: preset.chapters.length,
            activeItemCount: preset.chapters.length,
          },
        });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  fastify.post<{
    Body: { url?: string; title?: string; category?: string };
  }>('/knowledge-books/install-url', async (req, reply) => {
    try {
      const rawUrl = String(req.body?.url || '').trim();
      if (!rawUrl) {
        return reply.status(400).send({ success: false, error: 'URL sumber wajib diisi' });
      }

      const fetched = await fetchPublicDocumentFromUrl(rawUrl);
      const bookTitle = String(req.body?.title || '').trim() || fetched.title || 'Dokumen Web';
      const chapters = parseMarkdownToChapters(fetched.content, bookTitle);
      if (chapters.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'Tidak ada konten teks yang berhasil diekstrak dari URL tersebut',
        });
      }

      const now = new Date();
      const bookId = crypto.randomUUID();
      const [book] = await db
        .insert(aiKnowledgeBooks)
        .values({
          id: bookId,
          title: bookTitle,
          description: `Diimpor dari ${fetched.url}`,
          category: String(req.body?.category || 'WEB').toUpperCase(),
          sourceType: 'URL',
          sourceUrl: fetched.url,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      for (const ch of chapters) {
        await db.insert(aiKnowledgeItems).values({
          id: crypto.randomUUID(),
          bookId,
          title: ch.title,
          category: 'WEB',
          content: ch.content,
          sourceUrl: fetched.url,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      }

      return reply.status(201).send({
        success: true,
        data: {
          ...book,
          itemCount: chapters.length,
          activeItemCount: chapters.length,
        },
      });
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: error?.message || 'Gagal mengimpor Knowledge Book dari URL',
      });
    }
  });

  fastify.post<{
    Body: { title?: string; description?: string; category?: string; rawText?: string };
  }>('/knowledge-books/install-markdown', async (req, reply) => {
    try {
      const title = String(req.body?.title || '').trim();
      const rawText = String(req.body?.rawText || '').trim();
      if (!title || !rawText) {
        return reply.status(400).send({
          success: false,
          error: 'Judul buku dan isi dokumen Markdown/Teks wajib diisi',
        });
      }

      const chapters = parseMarkdownToChapters(rawText, title);
      if (chapters.length === 0) {
        return reply.status(400).send({ success: false, error: 'Dokumen kosong' });
      }

      const category = String(req.body?.category || 'GENERAL').toUpperCase();
      const itemCategory = ['FAQ', 'CATALOG', 'POLICY', 'WEB'].includes(category) ? category : 'FAQ';
      const now = new Date();
      const bookId = crypto.randomUUID();

      const [book] = await db
        .insert(aiKnowledgeBooks)
        .values({
          id: bookId,
          title,
          description: req.body?.description ? String(req.body.description).trim() : null,
          category,
          sourceType: 'MARKDOWN',
          sourceUrl: null,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      for (const ch of chapters) {
        await db.insert(aiKnowledgeItems).values({
          id: crypto.randomUUID(),
          bookId,
          title: ch.title,
          category: itemCategory,
          content: ch.content,
          sourceUrl: null,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      }

      return reply.status(201).send({
        success: true,
        data: {
          ...book,
          itemCount: chapters.length,
          activeItemCount: chapters.length,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post('/knowledge-books/install-catalog', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const activeProducts = await db
        .select()
        .from(products)
        .where(eq(products.isActive, true));

      if (activeProducts.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'Belum ada produk aktif di Master Katalog Produk CRM untuk disinkronkan.',
        });
      }

      const now = new Date();
      const [existingBook] = await db
        .select()
        .from(aiKnowledgeBooks)
        .where(eq(aiKnowledgeBooks.sourceType, 'CATALOG_SYNC'));

      let bookId = existingBook?.id || crypto.randomUUID();
      if (existingBook) {
        await db
          .update(aiKnowledgeBooks)
          .set({ updatedAt: now, isActive: true })
          .where(eq(aiKnowledgeBooks.id, bookId));
        await db.delete(aiKnowledgeItems).where(eq(aiKnowledgeItems.bookId, bookId));
      } else {
        await db.insert(aiKnowledgeBooks).values({
          id: bookId,
          title: 'Katalog Produk & Layanan CRM',
          description: 'Disinkronkan otomatis dari Master Katalog Produk CRM.',
          category: 'CATALOG',
          sourceType: 'CATALOG_SYNC',
          sourceUrl: null,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      }

      for (const p of activeProducts) {
        const priceFormatted = `Rp ${Number(p.price || 0).toLocaleString('id-ID')}/${p.unit || 'pcs'}`;
        const lines = [
          `SKU: ${p.sku}`,
          `Harga: ${priceFormatted}`,
          p.category ? `Kategori: ${p.category}` : '',
          p.description ? `Deskripsi: ${p.description}` : '',
        ]
          .filter(Boolean)
          .join('\n');

        await db.insert(aiKnowledgeItems).values({
          id: crypto.randomUUID(),
          bookId,
          title: p.name,
          category: 'CATALOG',
          content: lines,
          sourceUrl: null,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      }

      const [book] = await db
        .select()
        .from(aiKnowledgeBooks)
        .where(eq(aiKnowledgeBooks.id, bookId));

      return reply.status(201).send({
        success: true,
        data: {
          ...book,
          itemCount: activeProducts.length,
          activeItemCount: activeProducts.length,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.patch<{
    Params: { id: string };
    Body: { title?: string; description?: string | null; category?: string; isActive?: boolean };
  }>('/knowledge-books/:id', async (req, reply) => {
    try {
      const updateData: any = { updatedAt: new Date() };
      if (req.body?.title !== undefined) {
        const clean = String(req.body.title).trim();
        if (!clean) {
          return reply.status(400).send({ success: false, error: 'Judul buku tidak boleh kosong' });
        }
        updateData.title = clean;
      }
      if (req.body?.description !== undefined) {
        updateData.description = req.body.description ? String(req.body.description).trim() : null;
      }
      if (req.body?.category !== undefined) {
        updateData.category = String(req.body.category).toUpperCase();
      }
      if (req.body?.isActive !== undefined) {
        updateData.isActive = Boolean(req.body.isActive);
      }

      const [updated] = await db
        .update(aiKnowledgeBooks)
        .set(updateData)
        .where(eq(aiKnowledgeBooks.id, req.params.id))
        .returning();
      if (!updated) {
        return reply.status(404).send({ success: false, error: 'Knowledge Book tidak ditemukan' });
      }
      return reply.send({ success: true, data: updated });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.delete<{ Params: { id: string } }>('/knowledge-books/:id', async (req, reply) => {
    try {
      await db.delete(aiKnowledgeBooks).where(eq(aiKnowledgeBooks.id, req.params.id));
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // ── Knowledge Base Chapters / Items ─────────────────────────────────────

  fastify.get<{ Querystring: { bookId?: string } }>(
    '/knowledge',
    async (req, reply) => {
      try {
        const rows = req.query?.bookId
          ? await db
              .select()
              .from(aiKnowledgeItems)
              .where(eq(aiKnowledgeItems.bookId, req.query.bookId))
              .orderBy(desc(aiKnowledgeItems.updatedAt))
          : await db
              .select()
              .from(aiKnowledgeItems)
              .orderBy(desc(aiKnowledgeItems.updatedAt));
        return reply.send({ success: true, data: rows });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  fastify.post<{
    Body: {
      bookId?: string | null;
      title?: string;
      category?: string;
      content?: string;
      sourceUrl?: string | null;
    };
  }>('/knowledge', async (req, reply) => {
    try {
      const title = String(req.body?.title || '').trim();
      const content = String(req.body?.content || '').trim();
      if (!title || !content) {
        return reply.status(400).send({ success: false, error: 'Judul dan isi knowledge wajib diisi' });
      }
      const bookId = req.body?.bookId ? String(req.body.bookId).trim() : null;
      const now = new Date();
      const [inserted] = await db
        .insert(aiKnowledgeItems)
        .values({
          id: crypto.randomUUID(),
          bookId,
          title,
          category: String(req.body?.category || 'FAQ').toUpperCase(),
          content,
          sourceUrl: req.body?.sourceUrl ? String(req.body.sourceUrl).trim() : null,
          isActive: true,
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
      bookId?: string | null;
      title?: string;
      category?: string;
      content?: string;
      sourceUrl?: string | null;
      isActive?: boolean;
    };
  }>('/knowledge/:id', async (req, reply) => {
    try {
      const updateData: any = { updatedAt: new Date() };
      if (req.body?.bookId !== undefined) {
        updateData.bookId = req.body.bookId ? String(req.body.bookId).trim() : null;
      }
      if (req.body?.title !== undefined) {
        const cleanTitle = String(req.body.title).trim();
        if (!cleanTitle) {
          return reply.status(400).send({ success: false, error: 'Judul knowledge tidak boleh kosong' });
        }
        updateData.title = cleanTitle;
      }
      if (req.body?.category !== undefined) updateData.category = String(req.body.category).toUpperCase();
      if (req.body?.content !== undefined) {
        const cleanContent = String(req.body.content).trim();
        if (!cleanContent) {
          return reply.status(400).send({ success: false, error: 'Isi knowledge tidak boleh kosong' });
        }
        updateData.content = cleanContent;
      }
      if (req.body?.sourceUrl !== undefined) {
        updateData.sourceUrl = req.body.sourceUrl ? String(req.body.sourceUrl).trim() : null;
      }
      if (req.body?.isActive !== undefined) updateData.isActive = Boolean(req.body.isActive);

      const [updated] = await db
        .update(aiKnowledgeItems)
        .set(updateData)
        .where(eq(aiKnowledgeItems.id, req.params.id))
        .returning();
      return reply.send({ success: true, data: updated });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.delete<{ Params: { id: string } }>('/knowledge/:id', async (req, reply) => {
    try {
      await db.delete(aiKnowledgeItems).where(eq(aiKnowledgeItems.id, req.params.id));
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // ── Agent Skills (Installable, Custom & Markdown/URL Importer) ──────────

  fastify.get('/skills/catalog', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ success: true, data: SKILL_PRESETS });
  });

  fastify.get('/skills', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const rows = await db.select().from(aiSkills).orderBy(desc(aiSkills.updatedAt));
      return reply.send({ success: true, data: rows.map(serializeSkill) });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post<{
    Body: {
      name?: string;
      slug?: string;
      description?: string | null;
      category?: string;
      triggerHint?: string | null;
      instructions?: string;
      linkedTools?: string[];
    };
  }>('/skills', async (req, reply) => {
    try {
      const name = String(req.body?.name || '').trim();
      const instructions = String(req.body?.instructions || '').trim();
      if (!name || !instructions) {
        return reply.status(400).send({
          success: false,
          error: 'Nama skill dan instruksi/playbook wajib diisi',
        });
      }

      const baseSlug = slugifySkillName(req.body?.slug || name);
      const existing = await db.select({ id: aiSkills.id }).from(aiSkills).where(eq(aiSkills.slug, baseSlug));
      const uniqueSlug = existing.length > 0 ? `${baseSlug}-${crypto.randomBytes(2).toString('hex')}` : baseSlug;
      const linkedTools = Array.isArray(req.body?.linkedTools)
        ? req.body.linkedTools.map((x) => String(x).trim()).filter(Boolean)
        : [];
      const now = new Date();

      const [inserted] = await db
        .insert(aiSkills)
        .values({
          id: crypto.randomUUID(),
          slug: uniqueSlug,
          name,
          description: req.body?.description ? String(req.body.description).trim() : null,
          category: String(req.body?.category || 'CUSTOM').toUpperCase(),
          triggerHint: req.body?.triggerHint ? String(req.body.triggerHint).trim() : null,
          instructions,
          linkedTools: JSON.stringify(linkedTools),
          sourceType: 'MANUAL',
          sourceUrl: null,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return reply.status(201).send({ success: true, data: serializeSkill(inserted) });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post<{ Body: { slug?: string } }>('/skills/install-preset', async (req, reply) => {
    try {
      const slug = String(req.body?.slug || '').trim();
      const preset = SKILL_PRESETS.find((s) => s.slug === slug);
      if (!preset) {
        return reply.status(404).send({ success: false, error: 'Preset skill tidak ditemukan' });
      }

      const now = new Date();
      const [upserted] = await db
        .insert(aiSkills)
        .values({
          id: crypto.randomUUID(),
          slug: preset.slug,
          name: preset.name,
          description: preset.description,
          category: preset.category,
          triggerHint: preset.triggerHint,
          instructions: preset.instructions,
          linkedTools: JSON.stringify(preset.linkedTools),
          sourceType: 'PRESET',
          sourceUrl: null,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: aiSkills.slug,
          set: {
            name: preset.name,
            description: preset.description,
            category: preset.category,
            triggerHint: preset.triggerHint,
            instructions: preset.instructions,
            linkedTools: JSON.stringify(preset.linkedTools),
            isActive: true,
            updatedAt: now,
          },
        })
        .returning();

      return reply.status(201).send({ success: true, data: serializeSkill(upserted) });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post<{
    Body: { rawMarkdown?: string; sourceUrl?: string; name?: string; linkedTools?: string[] };
  }>('/skills/install-markdown', async (req, reply) => {
    try {
      let rawMarkdown = String(req.body?.rawMarkdown || '').trim();
      let sourceUrl: string | null = null;

      if (!rawMarkdown && req.body?.sourceUrl) {
        const fetched = await fetchPublicDocumentFromUrl(req.body.sourceUrl);
        rawMarkdown = fetched.content;
        sourceUrl = fetched.url;
      }

      if (!rawMarkdown) {
        return reply.status(400).send({
          success: false,
          error: 'Isi SKILL.md atau URL sumber wajib diisi',
        });
      }

      const parsed = parseSkillMarkdown(rawMarkdown, req.body?.name || 'Imported Skill');
      if (!parsed.instructions) {
        return reply.status(400).send({ success: false, error: 'Instruksi skill tidak ditemukan' });
      }

      const linkedTools = Array.isArray(req.body?.linkedTools)
        ? req.body.linkedTools.map((x) => String(x).trim()).filter(Boolean)
        : [];
      const existing = await db
        .select({ id: aiSkills.id })
        .from(aiSkills)
        .where(eq(aiSkills.slug, parsed.slug));
      const slug =
        existing.length > 0
          ? `${parsed.slug}-${crypto.randomBytes(2).toString('hex')}`
          : parsed.slug;

      const now = new Date();
      const [inserted] = await db
        .insert(aiSkills)
        .values({
          id: crypto.randomUUID(),
          slug,
          name: req.body?.name?.trim() || parsed.name,
          description: parsed.description || null,
          category: parsed.category,
          triggerHint: parsed.triggerHint || null,
          instructions: parsed.instructions,
          linkedTools: JSON.stringify(linkedTools),
          sourceType: sourceUrl ? 'URL' : 'MARKDOWN',
          sourceUrl,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return reply.status(201).send({ success: true, data: serializeSkill(inserted) });
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: error?.message || 'Gagal menginstall skill dari SKILL.md / URL',
      });
    }
  });

  fastify.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      description?: string | null;
      category?: string;
      triggerHint?: string | null;
      instructions?: string;
      linkedTools?: string[];
      isActive?: boolean;
    };
  }>('/skills/:id', async (req, reply) => {
    try {
      const updateData: any = { updatedAt: new Date() };
      if (req.body?.name !== undefined) {
        const clean = String(req.body.name).trim();
        if (!clean) return reply.status(400).send({ success: false, error: 'Nama skill tidak boleh kosong' });
        updateData.name = clean;
      }
      if (req.body?.description !== undefined) {
        updateData.description = req.body.description ? String(req.body.description).trim() : null;
      }
      if (req.body?.category !== undefined) updateData.category = String(req.body.category).toUpperCase();
      if (req.body?.triggerHint !== undefined) {
        updateData.triggerHint = req.body.triggerHint ? String(req.body.triggerHint).trim() : null;
      }
      if (req.body?.instructions !== undefined) {
        const cleanInstr = String(req.body.instructions).trim();
        if (!cleanInstr) {
          return reply.status(400).send({ success: false, error: 'Instruksi skill tidak boleh kosong' });
        }
        updateData.instructions = cleanInstr;
      }
      if (Array.isArray(req.body?.linkedTools)) {
        updateData.linkedTools = JSON.stringify(
          req.body.linkedTools.map((x) => String(x).trim()).filter(Boolean)
        );
      }
      if (req.body?.isActive !== undefined) updateData.isActive = Boolean(req.body.isActive);

      const [updated] = await db
        .update(aiSkills)
        .set(updateData)
        .where(eq(aiSkills.id, req.params.id))
        .returning();
      if (!updated) {
        return reply.status(404).send({ success: false, error: 'Skill tidak ditemukan' });
      }
      return reply.send({ success: true, data: serializeSkill(updated) });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.delete<{ Params: { id: string } }>('/skills/:id', async (req, reply) => {
    try {
      await db.delete(aiSkills).where(eq(aiSkills.id, req.params.id));
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // ── MCP Servers & Built-in CRM Tools ────────────────────────────────────

  fastify.get('/mcp-servers', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const rows = await db.select().from(aiMcpServers).orderBy(desc(aiMcpServers.updatedAt));
      return reply.send({
        success: true,
        data: {
          builtinTools: BUILTIN_CRM_TOOLS.map((t) => ({
            name: t.name,
            label: t.label,
            description: t.description,
          })),
          servers: rows.map(serializeMcpServerForClient),
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post<{
    Body: {
      name?: string;
      description?: string | null;
      endpointUrl?: string;
      authType?: 'NONE' | 'BEARER' | 'HEADER';
      authHeaderName?: string;
      authToken?: string;
      autoDiscover?: boolean;
    };
  }>('/mcp-servers/test-connection', async (req, reply) => {
    try {
      const endpointUrl = sanitizeMcpEndpointUrl(String(req.body?.endpointUrl || ''));
      const tempServer: McpServerConfigRecord = {
        id: 'preview',
        name: String(req.body?.name || 'MCP Server').trim(),
        transport: 'HTTP',
        endpointUrl,
        authType:
          req.body?.authType === 'BEARER' || req.body?.authType === 'HEADER'
            ? req.body.authType
            : 'NONE',
        authHeaderName: String(req.body?.authHeaderName || 'X-API-Key').trim() || 'X-API-Key',
        authToken: String(req.body?.authToken || '').trim(),
        cachedTools: [],
        disabledTools: [],
        isActive: true,
      };
      const tools = await discoverMcpTools(tempServer);
      return reply.send({
        success: true,
        data: { ok: true, toolsCount: tools.length, tools },
      });
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: error?.message || 'Gagal terhubung ke server MCP',
      });
    }
  });

  fastify.post<{
    Body: {
      name?: string;
      description?: string | null;
      endpointUrl?: string;
      authType?: 'NONE' | 'BEARER' | 'HEADER';
      authHeaderName?: string;
      authToken?: string;
      autoDiscover?: boolean;
    };
  }>('/mcp-servers', async (req, reply) => {
    try {
      const name = String(req.body?.name || '').trim();
      if (!name) {
        return reply.status(400).send({ success: false, error: 'Nama server MCP wajib diisi' });
      }
      const endpointUrl = sanitizeMcpEndpointUrl(String(req.body?.endpointUrl || ''));
      const authType =
        req.body?.authType === 'BEARER' || req.body?.authType === 'HEADER'
          ? req.body.authType
          : 'NONE';
      const authHeaderName =
        String(req.body?.authHeaderName || 'X-API-Key').trim() || 'X-API-Key';
      const authToken = String(req.body?.authToken || '').trim();
      const now = new Date();
      const id = crypto.randomUUID();

      let cachedTools: any[] = [];
      let lastSyncedAt: Date | null = null;
      let lastError: string | null = null;

      if (req.body?.autoDiscover !== false) {
        try {
          cachedTools = await discoverMcpTools({
            id,
            name,
            transport: 'HTTP',
            endpointUrl,
            authType,
            authHeaderName,
            authToken,
            cachedTools: [],
            disabledTools: [],
            isActive: true,
          });
          lastSyncedAt = now;
        } catch (err: any) {
          lastError = err?.message || 'Gagal sinkronisasi awal tool MCP';
        }
      }

      const [created] = await db
        .insert(aiMcpServers)
        .values({
          id,
          name,
          description: req.body?.description ? String(req.body.description).trim() : null,
          transport: 'HTTP',
          endpointUrl,
          authType,
          authHeaderName,
          authToken: authToken || null,
          cachedTools: JSON.stringify(cachedTools),
          disabledTools: '[]',
          lastSyncedAt,
          lastError,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return reply.status(201).send({
        success: true,
        data: serializeMcpServerForClient(created),
        warning: lastError || undefined,
      });
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: error?.message || 'Gagal menambahkan server MCP',
      });
    }
  });

  fastify.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      description?: string | null;
      endpointUrl?: string;
      authType?: 'NONE' | 'BEARER' | 'HEADER';
      authHeaderName?: string;
      authToken?: string;
      clearAuthToken?: boolean;
      disabledTools?: string[];
      isActive?: boolean;
    };
  }>('/mcp-servers/:id', async (req, reply) => {
    try {
      const [existing] = await db
        .select()
        .from(aiMcpServers)
        .where(eq(aiMcpServers.id, req.params.id));
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Server MCP tidak ditemukan' });
      }

      const updateData: any = { updatedAt: new Date() };
      if (req.body?.name !== undefined) {
        const clean = String(req.body.name).trim();
        if (!clean) return reply.status(400).send({ success: false, error: 'Nama server tidak boleh kosong' });
        updateData.name = clean;
      }
      if (req.body?.description !== undefined) {
        updateData.description = req.body.description ? String(req.body.description).trim() : null;
      }
      if (req.body?.endpointUrl !== undefined) {
        updateData.endpointUrl = sanitizeMcpEndpointUrl(req.body.endpointUrl);
      }
      if (req.body?.authType !== undefined) {
        updateData.authType =
          req.body.authType === 'BEARER' || req.body.authType === 'HEADER'
            ? req.body.authType
            : 'NONE';
      }
      if (req.body?.authHeaderName !== undefined) {
        updateData.authHeaderName = String(req.body.authHeaderName || 'X-API-Key').trim() || 'X-API-Key';
      }
      if (req.body?.clearAuthToken === true) {
        updateData.authToken = null;
      } else if (typeof req.body?.authToken === 'string' && req.body.authToken.trim() !== '') {
        updateData.authToken = req.body.authToken.trim();
      }
      if (Array.isArray(req.body?.disabledTools)) {
        updateData.disabledTools = JSON.stringify(
          req.body.disabledTools.map((x) => String(x).trim()).filter(Boolean)
        );
      }
      if (req.body?.isActive !== undefined) {
        updateData.isActive = Boolean(req.body.isActive);
      }

      const [updated] = await db
        .update(aiMcpServers)
        .set(updateData)
        .where(eq(aiMcpServers.id, req.params.id))
        .returning();

      return reply.send({ success: true, data: serializeMcpServerForClient(updated) });
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: error?.message || 'Gagal memperbarui server MCP',
      });
    }
  });

  fastify.post<{ Params: { id: string } }>(
    '/mcp-servers/:id/discover',
    async (req, reply) => {
      try {
        const [existing] = await db
          .select()
          .from(aiMcpServers)
          .where(eq(aiMcpServers.id, req.params.id));
        if (!existing) {
          return reply.status(404).send({ success: false, error: 'Server MCP tidak ditemukan' });
        }

        const srvRecord: McpServerConfigRecord = {
          id: existing.id,
          name: existing.name,
          transport: existing.transport || 'HTTP',
          endpointUrl: existing.endpointUrl,
          authType:
            existing.authType === 'BEARER' || existing.authType === 'HEADER'
              ? existing.authType
              : 'NONE',
          authHeaderName: existing.authHeaderName || 'X-API-Key',
          authToken: existing.authToken || '',
          cachedTools: [],
          disabledTools: parseJsonStringArray(existing.disabledTools),
          isActive: existing.isActive,
        };

        try {
          const tools = await discoverMcpTools(srvRecord);
          const now = new Date();
          const [updated] = await db
            .update(aiMcpServers)
            .set({
              cachedTools: JSON.stringify(tools),
              lastSyncedAt: now,
              lastError: null,
              updatedAt: now,
            })
            .where(eq(aiMcpServers.id, existing.id))
            .returning();

          return reply.send({
            success: true,
            data: serializeMcpServerForClient(updated),
          });
        } catch (err: any) {
          const msg = err?.message || 'Gagal mengambil daftar tool MCP';
          await db
            .update(aiMcpServers)
            .set({ lastError: msg, updatedAt: new Date() })
            .where(eq(aiMcpServers.id, existing.id));
          return reply.status(400).send({ success: false, error: msg });
        }
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  fastify.delete<{ Params: { id: string } }>('/mcp-servers/:id', async (req, reply) => {
    try {
      await db.delete(aiMcpServers).where(eq(aiMcpServers.id, req.params.id));
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // ── Simulator Test ──────────────────────────────────────────────────────

  fastify.post<{ Body: { message?: string; draftConfig?: Partial<AiAgentConfig> } }>(
    '/test',
    async (req, reply) => {
      try {
        const message = String(req.body?.message || '').trim();
        if (!message) {
          return reply.status(400).send({ success: false, error: 'Pesan uji wajib diisi' });
        }

        let configOverride: AiAgentConfig | undefined;
        if (req.body?.draftConfig) {
          const saved = await getAiAgentConfig();
          configOverride = mergeAiAgentConfig(saved, req.body.draftConfig);
        }

        const result = await generateAiAgentReply(message, {
          configOverride,
          isSimulator: true,
        });
        return reply.send({
          success: true,
          data: {
            reply: result.reply,
            source: result.source,
            providerLabel: result.providerLabel,
            model: result.model,
            fallbackUsed: result.fallbackUsed,
            attempts: result.attempts,
            toolCalls: result.toolCalls,
          },
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: error?.message || 'Gagal menguji Agent AI',
          data: error?.attempts ? { attempts: error.attempts, toolCalls: [] } : undefined,
        });
      }
    }
  );
}
