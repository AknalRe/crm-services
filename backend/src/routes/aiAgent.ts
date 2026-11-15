import crypto from 'crypto';
import axios from 'axios';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { aiKnowledgeItems, systemSettings } from '../db/schema';
import { requirePermission } from './auth';

interface AiAgentConfig {
  enabled: boolean;
  name: string;
  persona: string;
  autoReplyDm: boolean;
  autoReplyComment: boolean;
  provider: 'OPENAI' | 'GEMINI' | 'LOCAL_KB';
  model: string;
  apiKey?: string;
}

export const DEFAULT_CONFIG: AiAgentConfig = {
  enabled: false,
  name: 'Asisten CRM',
  persona: 'Ramah, ringkas, profesional, dan selalu merujuk pada Knowledge Base perusahaan.',
  autoReplyDm: false,
  autoReplyComment: false,
  provider: 'LOCAL_KB',
  model: 'gpt-4o-mini',
  apiKey: '',
};

export async function getAiAgentConfig(): Promise<AiAgentConfig> {
  const [configRow] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, 'ai_agent_config'));
  let cfg = { ...DEFAULT_CONFIG };
  if (configRow?.value) {
    try {
      cfg = { ...DEFAULT_CONFIG, ...JSON.parse(configRow.value) };
    } catch {
      // fallback to defaults
    }
  }
  return cfg;
}

export async function generateAiAgentReply(message: string): Promise<{
  config: AiAgentConfig;
  reply: string;
  source: 'OPENAI' | 'GEMINI' | 'LOCAL_KB';
  matchedKb: boolean;
}> {
  const cfg = await getAiAgentConfig();
  const kbItems = await db
    .select()
    .from(aiKnowledgeItems)
    .where(eq(aiKnowledgeItems.isActive, true));

  const kbContext = kbItems
    .map((k) => `[${k.category}] ${k.title}: ${k.content}`)
    .join('\n\n');

  const systemPrompt = `Nama Anda ${cfg.name}. Persona: ${cfg.persona}\n\nKnowledge Base:\n${kbContext || 'Belum ada knowledge base.'}`;

  if (cfg.provider === 'OPENAI' && cfg.apiKey) {
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: cfg.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        temperature: 0.4,
      },
      { headers: { Authorization: `Bearer ${cfg.apiKey}` }, timeout: 15000 }
    );
    const reply = String(res.data?.choices?.[0]?.message?.content || '').trim();
    return { config: cfg, reply, source: 'OPENAI', matchedKb: true };
  }

  if (cfg.provider === 'GEMINI' && cfg.apiKey) {
    const modelName = (cfg.model || 'gemini-2.0-flash').replace(/^models\//, '');
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
      {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: message }] }],
        generationConfig: { temperature: 0.4 },
      },
      { headers: { 'x-goog-api-key': cfg.apiKey }, timeout: 15000 }
    );
    const parts = res.data?.candidates?.[0]?.content?.parts;
    const reply = Array.isArray(parts)
      ? parts.map((p: any) => p?.text || '').join('').trim()
      : '';
    return { config: cfg, reply, source: 'GEMINI', matchedKb: true };
  }

  const tokens = message
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  let bestItem = null;
  let bestScore = 0;
  for (const item of kbItems) {
    const haystack = `${item.title} ${item.content}`.toLowerCase();
    const score = tokens.reduce((acc, tok) => (haystack.includes(tok) ? acc + 1 : acc), 0);
    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  const replyText = bestItem
    ? `Halo! Berdasarkan ${bestItem.title} (${bestItem.category}): ${bestItem.content}`
    : `Halo, saya ${cfg.name}. Terima kasih sudah menghubungi kami! Tim kami akan segera membantu pertanyaan Anda terkait "${message}".`;

  return {
    config: cfg,
    reply: replyText,
    source: 'LOCAL_KB',
    matchedKb: Boolean(bestItem),
  };
}

export default async function aiAgentRouter(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requirePermission('settings'));

  fastify.get('/config', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const [row] = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, 'ai_agent_config'));
      let config = { ...DEFAULT_CONFIG };
      if (row?.value) {
        try {
          config = { ...DEFAULT_CONFIG, ...JSON.parse(row.value) };
        } catch {
          // fallback
        }
      }
      return reply.send({
        success: true,
        data: {
          ...config,
          hasApiKey: Boolean(config.apiKey),
          apiKey: '',
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.put<{ Body: Partial<AiAgentConfig> }>('/config', async (req, reply) => {
    try {
      const [existingRow] = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, 'ai_agent_config'));
      let prev = { ...DEFAULT_CONFIG };
      if (existingRow?.value) {
        try {
          prev = { ...DEFAULT_CONFIG, ...JSON.parse(existingRow.value) };
        } catch {
          // fallback
        }
      }

      const next: AiAgentConfig = {
        enabled: req.body?.enabled !== undefined ? Boolean(req.body.enabled) : prev.enabled,
        name: req.body?.name ? String(req.body.name).trim() : prev.name,
        persona: req.body?.persona !== undefined ? String(req.body.persona).trim() : prev.persona,
        autoReplyDm:
          req.body?.autoReplyDm !== undefined ? Boolean(req.body.autoReplyDm) : prev.autoReplyDm,
        autoReplyComment:
          req.body?.autoReplyComment !== undefined
            ? Boolean(req.body.autoReplyComment)
            : prev.autoReplyComment,
        provider:
          req.body?.provider && ['OPENAI', 'GEMINI', 'LOCAL_KB'].includes(req.body.provider)
            ? req.body.provider
            : prev.provider,
        model: req.body?.model ? String(req.body.model).trim() : prev.model,
        apiKey: req.body?.apiKey ? String(req.body.apiKey).trim() : prev.apiKey,
      };

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
        data: { ...next, hasApiKey: Boolean(next.apiKey), apiKey: '' },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.get('/knowledge', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const rows = await db
        .select()
        .from(aiKnowledgeItems)
        .orderBy(desc(aiKnowledgeItems.updatedAt));
      return reply.send({ success: true, data: rows });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post<{
    Body: { title?: string; category?: string; content?: string; sourceUrl?: string | null };
  }>('/knowledge', async (req, reply) => {
    try {
      const title = String(req.body?.title || '').trim();
      const content = String(req.body?.content || '').trim();
      if (!title || !content) {
        return reply.status(400).send({ success: false, error: 'Judul dan isi knowledge wajib diisi' });
      }
      const now = new Date();
      const [inserted] = await db
        .insert(aiKnowledgeItems)
        .values({
          id: crypto.randomUUID(),
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
    Body: { title?: string; category?: string; content?: string; sourceUrl?: string | null; isActive?: boolean };
  }>('/knowledge/:id', async (req, reply) => {
    try {
      const updateData: any = { updatedAt: new Date() };
      if (req.body?.title !== undefined) updateData.title = String(req.body.title).trim();
      if (req.body?.category !== undefined) updateData.category = String(req.body.category).toUpperCase();
      if (req.body?.content !== undefined) updateData.content = String(req.body.content).trim();
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

  fastify.post<{ Body: { message?: string } }>('/test', async (req, reply) => {
    try {
      const message = String(req.body?.message || '').trim();
      if (!message) {
        return reply.status(400).send({ success: false, error: 'Pesan uji wajib diisi' });
      }

      const result = await generateAiAgentReply(message);
      return reply.send({
        success: true,
        data: { reply: result.reply, source: result.source },
      });
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: error.response?.data?.error?.message || error.message,
      });
    }
  });
}
