import crypto from 'crypto';
import axios from 'axios';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db';
import {
  aiKnowledgeBooks,
  aiKnowledgeItems,
  aiMcpServers,
  chatMessages,
  contacts,
  conversations,
  crmAgents,
  products,
} from '../db/schema';
import { liveEvents } from './events.service';
import { getActiveCompanyId } from './tenantContext';

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export interface McpServerConfigRecord {
  id: string;
  name: string;
  description?: string | null;
  transport: string;
  endpointUrl: string;
  authType: 'NONE' | 'BEARER' | 'HEADER';
  authHeaderName: string;
  authToken?: string | null;
  hasAuthToken?: boolean;
  authTokenPreview?: string;
  cachedTools: McpToolDescriptor[];
  disabledTools: string[];
  lastSyncedAt?: Date | string | null;
  lastError?: string | null;
  isActive: boolean;
}

export interface AiRuntimeToolDefinition {
  llmName: string;
  originalName: string;
  displayName: string;
  source: 'CRM' | 'MCP';
  serverId?: string;
  serverName?: string;
  description: string;
  parameters: Record<string, any>;
}

export interface AiToolCallTrace {
  toolName: string;
  displayName: string;
  source: 'CRM' | 'MCP';
  serverName?: string;
  ok: boolean;
  durationMs: number;
  summary: string;
}

export interface BuiltinCrmToolMeta {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, any>;
}

export const BUILTIN_CRM_TOOLS: BuiltinCrmToolMeta[] = [
  {
    name: 'crm_search_products',
    label: 'Cari Katalog Produk & Harga',
    description:
      'Mencari daftar produk atau layanan aktif di Katalog CRM beserta SKU, harga, satuan, dan deskripsi. Gunakan setiap kali pelanggan bertanya harga, paket, atau katalog.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Kata kunci nama produk, SKU, atau kategori (kosongkan untuk melihat daftar utama).',
        },
        limit: {
          type: 'integer',
          description: 'Jumlah maksimal produk yang dikembalikan (1-20).',
        },
      },
    },
  },
  {
    name: 'crm_search_knowledge',
    label: 'Cari Knowledge Book',
    description:
      'Mencari materi FAQ, kebijakan, SOP, atau panduan dari Knowledge Book CRM yang sedang aktif berdasarkan kata kunci pertanyaan pelanggan.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Kata kunci topik atau pertanyaan yang dicari.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'crm_get_customer_info',
    label: 'Lihat Profil Kontak Pelanggan',
    description:
      'Mengambil profil kontak pelanggan dan status percakapan aktif (nama, kategori, tag, catatan) jika pesan berasal dari percakapan Live Chat.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'crm_escalate_to_human',
    label: 'Eskalasi ke Agen Manusia',
    description:
      'Menandai percakapan saat ini untuk ditindaklanjuti langsung oleh agen/CS manusia (misalnya komplain berat, permintaan refund, atau pertanyaan di luar kewenangan AI).',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Ringkasan singkat alasan eskalasi dan kebutuhan pelanggan.',
        },
      },
      required: ['reason'],
    },
  },
];

const BUILTIN_TOOL_MAP = new Map<string, BuiltinCrmToolMeta>(
  BUILTIN_CRM_TOOLS.map((t) => [t.name, t])
);

export function maskSecretValue(raw?: string | null): string {
  const clean = String(raw || '').trim();
  if (!clean) return '';
  if (clean.length <= 8) return '••••';
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

export function sanitizeMcpEndpointUrl(rawUrl: string): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    throw new Error('URL endpoint MCP wajib diisi');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Format URL endpoint MCP tidak valid');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL endpoint MCP harus diawali http:// atau https://');
  }
  return parsed.toString();
}

export function sanitizeMcpError(err: any, secretToScrub?: string | null): string {
  const status = err?.response?.status;
  const upstream =
    err?.response?.data?.error?.message ||
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.message ||
    'Permintaan MCP gagal';
  let msg = typeof upstream === 'string' ? upstream : JSON.stringify(upstream);
  if (err?.code === 'ECONNABORTED') {
    msg = `Timeout koneksi MCP (${msg})`;
  } else if (err?.code === 'ECONNREFUSED') {
    msg = 'Koneksi ke server MCP ditolak (ECONNREFUSED)';
  }
  if (status && !msg.includes(String(status))) {
    msg = `HTTP ${status}: ${msg}`;
  }
  if (secretToScrub && secretToScrub.length >= 6) {
    msg = msg.split(secretToScrub).join('[REDACTED]');
  }
  return msg.slice(0, 320);
}

export function parseMcpRpcResponse(rawData: unknown, expectedId?: string | number): any {
  if (!rawData) return null;

  if (typeof rawData === 'object' && !Array.isArray(rawData)) {
    return rawData;
  }

  if (Array.isArray(rawData)) {
    if (expectedId !== undefined) {
      const match = rawData.find((item) => item && item.id === expectedId);
      if (match) return match;
    }
    return rawData[rawData.length - 1] || null;
  }

  if (typeof rawData === 'string') {
    const trimmed = rawData.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return parseMcpRpcResponse(JSON.parse(trimmed), expectedId);
      } catch {
        // fall through to SSE parser
      }
    }

    const candidates: any[] = [];
    const lines = trimmed.split(/\r?\n/);
    let dataBuf: string[] = [];

    const flush = () => {
      if (dataBuf.length === 0) return;
      const joined = dataBuf.join('\n').trim();
      dataBuf = [];
      if (!joined || joined === '[DONE]') return;
      try {
        candidates.push(JSON.parse(joined));
      } catch {
        // ignore non-json SSE keepalive/event chunks
      }
    };

    for (const line of lines) {
      if (line.startsWith('data:')) {
        dataBuf.push(line.slice(5).trimStart());
      } else if (line.trim() === '') {
        flush();
      }
    }
    flush();

    if (expectedId !== undefined) {
      const matched = candidates.find((c) => c && c.id === expectedId);
      if (matched) return matched;
    }
    return candidates[candidates.length - 1] || null;
  }

  return null;
}

function buildMcpRequestHeaders(
  server: Pick<McpServerConfigRecord, 'authType' | 'authHeaderName' | 'authToken'>,
  sessionId?: string | null
): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  const token = String(server.authToken || '').trim();
  if (token) {
    if (server.authType === 'BEARER') {
      headers.Authorization = /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`;
    } else if (server.authType === 'HEADER') {
      const headerName = String(server.authHeaderName || 'X-API-Key').trim() || 'X-API-Key';
      headers[headerName] = token;
    }
  }
  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId;
  }
  return headers;
}

async function sendMcpRpc(params: {
  server: McpServerConfigRecord;
  method: string;
  rpcParams?: Record<string, any>;
  rpcId?: string | number | null;
  sessionId?: string | null;
  timeoutMs?: number;
}): Promise<{ rpc: any; sessionId: string | null }> {
  const endpoint = sanitizeMcpEndpointUrl(params.server.endpointUrl);
  const body: Record<string, any> = {
    jsonrpc: '2.0',
    method: params.method,
  };
  if (params.rpcParams !== undefined) {
    body.params = params.rpcParams;
  }
  if (params.rpcId !== null) {
    body.id = params.rpcId ?? `crm_${Date.now()}`;
  }

  const res = await axios.post(endpoint, body, {
    headers: buildMcpRequestHeaders(params.server, params.sessionId),
    timeout: params.timeoutMs || 12000,
  });

  const nextSession =
    String(res.headers?.['mcp-session-id'] || res.headers?.['Mcp-Session-Id'] || '').trim() ||
    params.sessionId ||
    null;

  if (params.rpcId === null) {
    return { rpc: null, sessionId: nextSession };
  }

  const rpc = parseMcpRpcResponse(res.data, body.id);
  if (!rpc) {
    throw new Error('Respons server MCP kosong atau bukan JSON-RPC 2.0 valid');
  }
  if (rpc.error) {
    throw new Error(rpc.error.message || `MCP error ${rpc.error.code || ''}`.trim());
  }
  return { rpc, sessionId: nextSession };
}

async function initializeMcpSession(
  server: McpServerConfigRecord,
  timeoutMs = 10000
): Promise<string | null> {
  const initRes = await sendMcpRpc({
    server,
    method: 'initialize',
    rpcId: `init_${Date.now()}`,
    rpcParams: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'reneo-crm-agent', version: '1.4.2' },
    },
    timeoutMs,
  });

  // Notify initialized cleanly; ignore servers that treat notification as optional
  await sendMcpRpc({
    server,
    method: 'notifications/initialized',
    rpcParams: {},
    rpcId: null,
    sessionId: initRes.sessionId,
    timeoutMs: 5000,
  }).catch(() => {});

  return initRes.sessionId;
}

export async function discoverMcpTools(
  server: McpServerConfigRecord,
  timeoutMs = 12000
): Promise<McpToolDescriptor[]> {
  try {
    const sessionId = await initializeMcpSession(server, timeoutMs);
    const allTools: McpToolDescriptor[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;

    for (let page = 0; page < 5; page++) {
      const listRes = await sendMcpRpc({
        server,
        method: 'tools/list',
        rpcParams: cursor ? { cursor } : {},
        rpcId: `tools_${page}_${Date.now()}`,
        sessionId,
        timeoutMs,
      });

      const rawTools = Array.isArray(listRes.rpc?.result?.tools) ? listRes.rpc.result.tools : [];
      for (const t of rawTools) {
        const name = String(t?.name || '').trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        allTools.push({
          name,
          description: String(t?.description || `Tool ${name} dari MCP ${server.name}`).trim(),
          inputSchema:
            t?.inputSchema && typeof t.inputSchema === 'object'
              ? t.inputSchema
              : { type: 'object', properties: {} },
        });
      }

      const nextCursor = String(listRes.rpc?.result?.nextCursor || '').trim();
      if (!nextCursor) break;
      cursor = nextCursor;
    }

    return allTools;
  } catch (err: any) {
    throw new Error(sanitizeMcpError(err, server.authToken));
  }
}

export async function callMcpTool(
  server: McpServerConfigRecord,
  toolName: string,
  args: Record<string, any>,
  timeoutMs = 15000
): Promise<{ ok: boolean; output: string }> {
  try {
    const sessionId = await initializeMcpSession(server, Math.min(timeoutMs, 10000));
    const callRes = await sendMcpRpc({
      server,
      method: 'tools/call',
      rpcId: `call_${Date.now()}`,
      sessionId,
      rpcParams: {
        name: toolName,
        arguments: args || {},
      },
      timeoutMs,
    });

    const result = callRes.rpc?.result || {};
    const blocks = Array.isArray(result.content) ? result.content : [];
    const textParts: string[] = [];

    for (const b of blocks) {
      if (!b) continue;
      if (typeof b === 'string') {
        textParts.push(b);
      } else if (typeof b.text === 'string') {
        textParts.push(b.text);
      } else if (b.type === 'resource' && b.resource?.text) {
        textParts.push(String(b.resource.text));
      } else {
        textParts.push(JSON.stringify(b));
      }
    }

    const joined =
      textParts.join('\n').trim() ||
      (result.structuredContent ? JSON.stringify(result.structuredContent) : JSON.stringify(result));

    return {
      ok: !Boolean(result.isError),
      output: joined.slice(0, 8000),
    };
  } catch (err: any) {
    return {
      ok: false,
      output: sanitizeMcpError(err, server.authToken),
    };
  }
}

export function sanitizeSchemaForGemini(schema: any): Record<string, any> {
  if (!schema || typeof schema !== 'object') {
    return { type: 'object', properties: {} };
  }
  const out: Record<string, any> = {};
  if (Array.isArray(schema.type)) {
    const nonNull = schema.type.find((t: string) => t !== 'null');
    out.type = nonNull || 'string';
  } else if (typeof schema.type === 'string') {
    out.type = schema.type;
  }
  if (typeof schema.description === 'string' && schema.description) {
    out.description = schema.description;
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    out.enum = schema.enum;
  }
  if (schema.properties && typeof schema.properties === 'object') {
    const props: Record<string, any> = {};
    for (const [key, val] of Object.entries(schema.properties)) {
      props[key] = sanitizeSchemaForGemini(val);
    }
    out.properties = props;
    if (!out.type) out.type = 'object';
  } else if (out.type === 'object') {
    out.properties = {};
  }
  if (out.type === 'array' && schema.items) {
    out.items = sanitizeSchemaForGemini(schema.items);
  }
  if (Array.isArray(schema.required) && schema.required.length > 0) {
    out.required = schema.required;
  }
  return out;
}

function makeLlmFunctionName(raw: string, usedNames: Set<string>): string {
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 56) || 'mcp_tool';
  let candidate = base;
  let n = 2;
  while (usedNames.has(candidate)) {
    const suffix = `_${n++}`;
    candidate = `${base.slice(0, 64 - suffix.length)}${suffix}`;
  }
  usedNames.add(candidate);
  return candidate;
}

function safeParseJsonArray<T = string>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function serializeMcpServerForClient(row: typeof aiMcpServers.$inferSelect): McpServerConfigRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    transport: row.transport || 'HTTP',
    endpointUrl: row.endpointUrl,
    authType:
      row.authType === 'BEARER' || row.authType === 'HEADER' ? row.authType : 'NONE',
    authHeaderName: row.authHeaderName || 'X-API-Key',
    authToken: '',
    hasAuthToken: Boolean(row.authToken),
    authTokenPreview: maskSecretValue(row.authToken),
    cachedTools: safeParseJsonArray<McpToolDescriptor>(row.cachedTools),
    disabledTools: safeParseJsonArray<string>(row.disabledTools),
    lastSyncedAt: row.lastSyncedAt,
    lastError: row.lastError,
    isActive: row.isActive,
  };
}

export async function loadActiveMcpServers(): Promise<McpServerConfigRecord[]> {
  const rows = await db
    .select()
    .from(aiMcpServers)
    .where(eq(aiMcpServers.isActive, true));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    transport: row.transport || 'HTTP',
    endpointUrl: row.endpointUrl,
    authType:
      row.authType === 'BEARER' || row.authType === 'HEADER' ? row.authType : 'NONE',
    authHeaderName: row.authHeaderName || 'X-API-Key',
    authToken: row.authToken || '',
    cachedTools: safeParseJsonArray<McpToolDescriptor>(row.cachedTools),
    disabledTools: safeParseJsonArray<string>(row.disabledTools),
    lastSyncedAt: row.lastSyncedAt,
    lastError: row.lastError,
    isActive: row.isActive,
  }));
}

async function executeBuiltinCrmTool(
  toolName: string,
  args: Record<string, any>,
  ctx?: { conversationId?: string | null; contactName?: string | null; isSimulator?: boolean }
): Promise<{ ok: boolean; output: string }> {
  if (toolName === 'crm_search_products') {
    const q = String(args?.query || '').trim().toLowerCase();
    const rawLimit = Number(args?.limit);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(20, Math.round(rawLimit))) : 10;
    const rows = await db
      .select()
      .from(products)
      .where(eq(products.isActive, true));

    const matched = rows
      .filter((p) => {
        if (!q) return true;
        const hay = `${p.name} ${p.sku} ${p.category || ''} ${p.description || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, limit);

    if (matched.length === 0) {
      return {
        ok: true,
        output: q
          ? `Tidak ditemukan produk aktif dengan kata kunci "${q}".`
          : 'Belum ada produk aktif di katalog CRM.',
      };
    }

    const lines = matched.map((p) => {
      const priceText = `Rp ${Number(p.price || 0).toLocaleString('id-ID')}/${p.unit || 'pcs'}`;
      return `- [${p.sku}] ${p.name}${p.category ? ` (${p.category})` : ''}: ${priceText}${p.description ? ` — ${p.description}` : ''}`;
    });
    return { ok: true, output: lines.join('\n') };
  }

  if (toolName === 'crm_search_knowledge') {
    const q = String(args?.query || '').trim().toLowerCase();
    const tokens = q.split(/\s+/).filter((t) => t.length > 1);
    const [books, items] = await Promise.all([
      db.select().from(aiKnowledgeBooks).where(eq(aiKnowledgeBooks.isActive, true)),
      db.select().from(aiKnowledgeItems).where(eq(aiKnowledgeItems.isActive, true)),
    ]);

    const activeBookMap = new Map(books.map((b) => [b.id, b.title]));
    const allBookRows = await db.select({ id: aiKnowledgeBooks.id }).from(aiKnowledgeBooks);
    const allKnownBookIds = new Set(allBookRows.map((b) => b.id));

    const eligible = items.filter((item) => {
      if (!item.bookId) return true;
      if (!allKnownBookIds.has(item.bookId)) return true;
      return activeBookMap.has(item.bookId);
    });

    const scored = eligible
      .map((item) => {
        const hay = `${item.title} ${item.category} ${item.content}`.toLowerCase();
        const score =
          tokens.length === 0
            ? 1
            : tokens.reduce((acc, tok) => (hay.includes(tok) ? acc + 1 : acc), 0);
        return { item, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    if (scored.length === 0) {
      return {
        ok: true,
        output: `Tidak ditemukan materi relevan di Knowledge Book aktif untuk "${q}".`,
      };
    }

    const lines = scored.map(({ item }) => {
      const bookTitle = item.bookId ? activeBookMap.get(item.bookId) : null;
      const prefix = bookTitle ? `[Buku: ${bookTitle} | ${item.category}]` : `[${item.category}]`;
      return `${prefix} ${item.title}:\n${item.content}`;
    });
    return { ok: true, output: lines.join('\n\n') };
  }

  if (toolName === 'crm_get_customer_info') {
    if (!ctx?.conversationId) {
      return {
        ok: true,
        output: ctx?.contactName
          ? `Mode simulasi / non-percakapan. Nama pelanggan: ${ctx.contactName}.`
          : 'Berjalan di mode simulasi (tidak terikat percakapan Live Chat).',
      };
    }
    const rows = await db
      .select({ conv: conversations, contact: contacts })
      .from(conversations)
      .leftJoin(contacts, eq(conversations.contactId, contacts.id))
      .where(eq(conversations.id, ctx.conversationId));
    const row = rows[0];
    if (!row || !row.contact) {
      return { ok: true, output: 'Data pelanggan tidak ditemukan.' };
    }
    const c = row.contact;
    return {
      ok: true,
      output: [
        `Nama Lengkap: ${c.namaLengkap}`,
        c.namaPanggilan ? `Nama Panggilan: ${c.namaPanggilan}` : '',
        c.kategori ? `Kategori: ${c.kategori}` : '',
        c.tags ? `Tag: ${c.tags}` : '',
        c.notes ? `Catatan CS: ${c.notes}` : '',
        `Status Tiket: ${row.conv.status} (Kanal: ${row.conv.channel})`,
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  if (toolName === 'crm_escalate_to_human') {
    const reason = String(args?.reason || 'Pelanggan meminta bantuan agen manusia').trim();
    if (!ctx?.conversationId || ctx?.isSimulator) {
      return {
        ok: true,
        output: `Eskalasi simulasi dicatat: "${reason}". Beri tahu pelanggan dengan sopan bahwa tim CS manusia akan membantu.`,
      };
    }

    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, ctx.conversationId));
    if (!conv) {
      return { ok: false, output: 'Percakapan tidak ditemukan untuk eskalasi.' };
    }

    const companyId = conv.companyId || getActiveCompanyId();
    const activeAgents = await db
      .select()
      .from(crmAgents)
      .where(and(eq(crmAgents.companyId, companyId), eq(crmAgents.isActive, true)))
      .orderBy(asc(crmAgents.createdAt));

    const onlineAgents = activeAgents.filter(
      (a) => (a.availabilityStatus || 'ONLINE').toUpperCase() === 'ONLINE'
    );

    let chosenAgent =
      conv.assignedAgentId
        ? onlineAgents.find((a) => a.id === conv.assignedAgentId) || null
        : null;

    if (!chosenAgent && onlineAgents.length > 0) {
      const openConvs = await db
        .select({ assignedAgentId: conversations.assignedAgentId })
        .from(conversations)
        .where(and(eq(conversations.companyId, companyId), eq(conversations.status, 'OPEN')));
      const counts = new Map<string, number>();
      for (const c of openConvs) {
        if (c.assignedAgentId) {
          counts.set(c.assignedAgentId, (counts.get(c.assignedAgentId) || 0) + 1);
        }
      }
      chosenAgent = onlineAgents.reduce((best, cur) => {
        const bestCount = counts.get(best.id) || 0;
        const curCount = counts.get(cur.id) || 0;
        return curCount < bestCount ? cur : best;
      }, onlineAgents[0]);
    }

    const now = new Date();
    const convUpdates: Record<string, any> = {
      status: 'OPEN',
      resolvedAt: null,
      updatedAt: now,
    };
    if (chosenAgent) {
      convUpdates.assignedAgentId = chosenAgent.id;
      convUpdates.assignedAgentName = chosenAgent.name;
    }

    await db
      .update(conversations)
      .set(convUpdates)
      .where(eq(conversations.id, conv.id));

    const notePrefix = chosenAgent
      ? `[Eskalasi Agent AI -> ${chosenAgent.name}]`
      : '[Eskalasi Agent AI · Menunggu Agen Siap]';

    await db.insert(chatMessages).values({
      id: crypto.randomUUID(),
      companyId,
      conversationId: conv.id,
      contactId: conv.contactId,
      direction: 'OUTBOUND',
      messageType: 'NOTE',
      wahaSession: conv.wahaSession,
      body: `${notePrefix} ${reason}`,
      status: 'NOTE',
      ackStatus: 0,
      createdAt: now,
    });

    liveEvents.emit('conversations:update', {
      conversationId: conv.id,
      escalated: true,
      assignedAgentId: chosenAgent?.id || conv.assignedAgentId || null,
      assignedAgentName: chosenAgent?.name || conv.assignedAgentName || null,
    });
    return {
      ok: true,
      output: chosenAgent
        ? `Percakapan berhasil dieskalasi dan ditugaskan ke agen aktif "${chosenAgent.name}" dengan catatan: "${reason}".`
        : `Percakapan berhasil ditandai untuk agen manusia (saat ini semua agen sedang istirahat/offline) dengan catatan: "${reason}".`,
    };
  }

  return { ok: false, output: `Tool CRM "${toolName}" tidak dikenal.` };
}

export interface AgentToolRegistry {
  definitions: AiRuntimeToolDefinition[];
  executeTool: (
    llmName: string,
    args: Record<string, any>
  ) => Promise<{ trace: AiToolCallTrace; output: string }>;
}

export function buildAgentToolRegistry(params: {
  enabledBuiltinTools: string[];
  linkedToolsFromSkills: string[];
  mcpServers: McpServerConfigRecord[];
  context?: {
    conversationId?: string | null;
    contactName?: string | null;
    isSimulator?: boolean;
  };
  customExecutor?: (
    def: AiRuntimeToolDefinition,
    args: Record<string, any>
  ) => Promise<{ ok: boolean; output: string }>;
}): AgentToolRegistry {
  const definitions: AiRuntimeToolDefinition[] = [];
  const usedNames = new Set<string>();
  const executorMap = new Map<
    string,
    { def: AiRuntimeToolDefinition; server?: McpServerConfigRecord }
  >();

  const enabledBuiltins = new Set<string>([
    ...params.enabledBuiltinTools,
    ...params.linkedToolsFromSkills.filter((t) => BUILTIN_TOOL_MAP.has(t)),
  ]);

  for (const name of enabledBuiltins) {
    const meta = BUILTIN_TOOL_MAP.get(name);
    if (!meta) continue;
    const llmName = makeLlmFunctionName(meta.name, usedNames);
    const def: AiRuntimeToolDefinition = {
      llmName,
      originalName: meta.name,
      displayName: meta.label,
      source: 'CRM',
      description: meta.description,
      parameters: meta.parameters,
    };
    definitions.push(def);
    executorMap.set(llmName, { def });
  }

  for (const srv of params.mcpServers) {
    if (!srv.isActive) continue;
    const disabled = new Set(srv.disabledTools || []);
    const srvSlug = srv.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 16) || 'srv';

    for (const tool of srv.cachedTools || []) {
      if (!tool?.name || disabled.has(tool.name)) continue;
      const llmName = makeLlmFunctionName(`mcp_${srvSlug}_${tool.name}`, usedNames);
      const def: AiRuntimeToolDefinition = {
        llmName,
        originalName: tool.name,
        displayName: `${tool.name} (${srv.name})`,
        source: 'MCP',
        serverId: srv.id,
        serverName: srv.name,
        description: tool.description || `Tool ${tool.name} dari MCP server ${srv.name}`,
        parameters: tool.inputSchema || { type: 'object', properties: {} },
      };
      definitions.push(def);
      executorMap.set(llmName, { def, server: srv });
    }
  }

  const executeTool = async (
    llmName: string,
    args: Record<string, any>
  ): Promise<{ trace: AiToolCallTrace; output: string }> => {
    const started = Date.now();
    const target = executorMap.get(llmName);
    if (!target) {
      const msg = `Tool "${llmName}" tidak terdaftar atau sedang nonaktif.`;
      return {
        trace: {
          toolName: llmName,
          displayName: llmName,
          source: 'CRM',
          ok: false,
          durationMs: Date.now() - started,
          summary: msg,
        },
        output: msg,
      };
    }

    let res: { ok: boolean; output: string };
    if (params.customExecutor) {
      res = await params.customExecutor(target.def, args);
    } else if (target.def.source === 'MCP' && target.server) {
      res = await callMcpTool(target.server, target.def.originalName, args);
    } else {
      res = await executeBuiltinCrmTool(target.def.originalName, args, params.context);
    }

    return {
      trace: {
        toolName: target.def.originalName,
        displayName: target.def.displayName,
        source: target.def.source,
        serverName: target.def.serverName,
        ok: res.ok,
        durationMs: Date.now() - started,
        summary: res.output.replace(/\s+/g, ' ').slice(0, 140),
      },
      output: res.output,
    };
  };

  return { definitions, executeTool };
}
