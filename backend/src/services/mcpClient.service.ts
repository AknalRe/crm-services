import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { and, asc, desc, eq, isNotNull, ne } from 'drizzle-orm';
import { db } from '../db';
import {
  aiKnowledgeBooks,
  aiKnowledgeItems,
  aiMcpServers,
  chatMessages,
  companySettings,
  contacts,
  conversations,
  crmAgents,
  products,
} from '../db/schema';
import {
  readMediaMetadata,
  readUploadedMediaAsDataUri,
  resolveUploadsDir,
} from '../routes/media';
import { liveEvents } from './events.service';
import { getActiveCompanyId } from './tenantContext';
import {
  sendCsatCtaForConversation,
  recordConversationActivity,
} from './csatSender.service';

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

export interface AiQueuedOutboundMedia {
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  mimeType: string;
  fileName: string;
  caption?: string;
  asDocument?: boolean;
}

export interface AiSimulatorHistoryTurn {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  imageUrl?: string | null;
  mediaName?: string | null;
  mediaType?: string | null;
  replyToMessageId?: string | null;
}

export interface AiToolSideEffects {
  outboundMedia: AiQueuedOutboundMedia[];
  replyToMessageId?: string | null;
  replyToPreview?: string | null;
  inspectedImages: Array<{ dataUri: string; mimeType: string; label?: string }>;
  escalation?: {
    queueNo: number;
    queueTotal: number;
    slaTarget: number;
    executeHandoverNotes?: () => Promise<void>;
  } | null;
  resolved?: {
    closingMessage?: string;
    sendCsat: boolean;
    resolutionNotes?: string;
  } | null;
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
      'Mengambil profil kontak pelanggan dan status percakapan aktif (nama, nomor WhatsApp, kategori, tag, label chat, catatan CS).',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'crm_get_chat_history',
    label: 'Baca Riwayat Chat WhatsApp & Omnichannel',
    description:
      'Membaca riwayat pesan percakapan WhatsApp/omnichannel saat ini beserta ID pesan, waktu, lampiran foto/dokumen, dan kutipan. Gunakan untuk meninjau pesan sebelumnya atau mencari ID pesan untuk di-reply.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: 'Jumlah pesan terakhir yang ingin dibaca (1-40, default 15).',
        },
        query: {
          type: 'string',
          description: 'Kata kunci opsional untuk memfilter isi pesan tertentu di riwayat chat.',
        },
      },
    },
  },
  {
    name: 'crm_inspect_customer_media',
    label: 'Baca & Analisis Foto / Dokumen Pelanggan',
    description:
      'Memeriksa foto, bukti transfer, screenshot, atau dokumen yang dikirimkan pelanggan di chat agar AI dapat melihat dan menganalisis isi gambar/file tersebut.',
    parameters: {
      type: 'object',
      properties: {
        messageId: {
          type: 'string',
          description:
            'ID pesan yang melampirkan foto/dokumen (opsional; kosongkan untuk memeriksa foto/dokumen terakhir dari pelanggan).',
        },
      },
    },
  },
  {
    name: 'crm_list_gallery_media',
    label: 'Cari Foto & Brosur di Galeri Media CRM',
    description:
      'Mencari daftar foto produk, gambar katalog, atau dokumen PDF yang tersimpan di Galeri Media CRM sebelum mengirimkannya ke pelanggan dengan crm_send_media.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Kata kunci nama file atau label media (opsional).',
        },
        mediaKind: {
          type: 'string',
          description: 'Filter jenis media: image, document, video, atau all (default: all).',
        },
        limit: {
          type: 'integer',
          description: 'Jumlah maksimal media yang ditampilkan (1-20, default 10).',
        },
      },
    },
  },
  {
    name: 'crm_send_media',
    label: 'Kirim Foto, Gambar Produk, atau Dokumen',
    description:
      'Mengirimkan foto produk, gambar brosur, atau dokumen dari Galeri Media CRM (atau URL gambar) langsung ke chat pelanggan beserta caption.',
    parameters: {
      type: 'object',
      properties: {
        mediaUrlOrName: {
          type: 'string',
          description:
            'URL media (/api/media/files/... atau https://...) atau nama file dari hasil crm_list_gallery_media.',
        },
        caption: {
          type: 'string',
          description: 'Keterangan/caption pengantar untuk foto atau dokumen yang dikirim.',
        },
        asDocument: {
          type: 'boolean',
          description: 'Kirim sebagai dokumen file asli (true untuk PDF/dokumen, false untuk foto/gambar).',
        },
      },
      required: ['mediaUrlOrName'],
    },
  },
  {
    name: 'crm_reply_to_message',
    label: 'Balas / Quote Pesan Spesifik Pelanggan',
    description:
      'Mengutip (quote/reply) pesan spesifik pelanggan berdasarkan messageId sehingga balasan AI di WhatsApp/Inbox terhubung langsung ke pesan yang dikutip.',
    parameters: {
      type: 'object',
      properties: {
        messageId: {
          type: 'string',
          description: 'ID pesan pelanggan yang ingin dikutip/di-reply (lihat dari crm_get_chat_history).',
        },
      },
      required: ['messageId'],
    },
  },
  {
    name: 'crm_update_customer_profile',
    label: 'Simpan Catatan, Kategori & Label Pelanggan',
    description:
      'Memperbarui catatan CS pada profil kontak, kategori pelanggan, atau menambahkan label percakapan (misalnya menyimpan ringkasan pesanan, alamat, atau menandai Hot Lead).',
    parameters: {
      type: 'object',
      properties: {
        notes: {
          type: 'string',
          description: 'Catatan penting pelanggan atau ringkasan kebutuhan untuk disimpan di profil kontak.',
        },
        category: {
          type: 'string',
          description: 'Kategori kontak (mis. Prospek, Pelanggan Aktif, VIP, Reseller).',
        },
        addLabel: {
          type: 'string',
          description: 'Label percakapan yang ingin ditambahkan (mis. Hot Lead, Menunggu Pembayaran, Follow Up).',
        },
      },
    },
  },
  {
    name: 'crm_escalate_to_human',
    label: 'Eskalasi ke Agen Manusia',
    description:
      'Menandai percakapan saat ini untuk ditindaklanjuti langsung oleh agen/CS manusia yang sedang aktif/ONLINE (misalnya komplain berat, permintaan refund, atau pertanyaan di luar kewenangan AI).',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Ringkasan singkat alasan eskalasi (mis. komplain berat, refund, di luar kewenangan AI).',
        },
        summary: {
          type: 'string',
          description:
            'Kesimpulan percakapan untuk agen manusia: kebutuhan pelanggan, data penting (nomor pesanan, nama, keluhan), langkah yang sudah dicoba AI, dan saran tindak lanjut.',
        },
      },
      required: ['reason', 'summary'],
    },
  },
  {
    name: 'crm_resolve_conversation',
    label: 'Selesaikan Obrolan & Kirim Penilaian CSAT',
    description:
      'Menyelesaikan obrolan / mengakhiri sesi percakapan secara profesional setelah kebutuhan atau pertanyaan pelanggan terjawab tuntas, dan secara otomatis mengirimkan tautan survei kepuasan pelanggan (CSAT) ke WhatsApp pelanggan agar pelanggan dapat memberikan penilaian (rating bintang 1-5 dan ulasan).',
    parameters: {
      type: 'object',
      properties: {
        closingMessage: {
          type: 'string',
          description:
            'Pesan penutup yang ramah dan apresiatif sebelum mengakhiri sesi (mis. "Sama-sama Kak! Senang bisa membantu. Semoga harinya menyenangkan!").',
        },
        sendCsat: {
          type: 'boolean',
          description:
            'Apakah mengirimkan tautan survei penilaian CSAT ke pelanggan (default: true).',
        },
        resolutionNotes: {
          type: 'string',
          description:
            'Ringkasan singkat penyelesaian masalah atau kebutuhan pelanggan untuk catatan riwayat CRM.',
        },
      },
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

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
};

function inferMediaKindFromMime(mime: string): 'image' | 'video' | 'audio' | 'document' {
  const lower = String(mime || '').toLowerCase();
  if (lower.startsWith('image/')) return 'image';
  if (lower.startsWith('video/')) return 'video';
  if (lower.startsWith('audio/')) return 'audio';
  return 'document';
}

export interface BuiltinToolExecutionContext {
  conversationId?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  isSimulator?: boolean;
  simulatorHistory?: AiSimulatorHistoryTurn[];
  latestCustomerImage?: string | null;
  latestCustomerMediaName?: string | null;
  sideEffects?: AiToolSideEffects;
}

async function listTenantGalleryFiles(params: {
  companyId: string;
  query?: string;
  mediaKind?: string;
  limit?: number;
}): Promise<
  Array<{
    filename: string;
    originalFileName: string;
    relativeUrl: string;
    mimeType: string;
    mediaKind: 'image' | 'video' | 'audio' | 'document';
    label?: string;
    sizeBytes: number;
  }>
> {
  const uploadsDir = resolveUploadsDir();
  if (!fs.existsSync(uploadsDir)) return [];
  const entries = await fs.promises.readdir(uploadsDir, { withFileTypes: true }).catch(() => []);
  const q = String(params.query || '').trim().toLowerCase();
  const kindFilter = String(params.mediaKind || '').trim().toLowerCase();
  const maxItems = Math.max(1, Math.min(30, params.limit || 10));
  const isDefault = !params.companyId || params.companyId === 'company_default';

  const items: Array<{
    filename: string;
    originalFileName: string;
    relativeUrl: string;
    mimeType: string;
    mediaKind: 'image' | 'video' | 'audio' | 'document';
    label?: string;
    sizeBytes: number;
    mtimeMs: number;
  }> = [];

  for (const ent of entries) {
    if (!ent.isFile() || ent.name.startsWith('.') || !/^[a-zA-Z0-9._-]+$/.test(ent.name)) continue;
    const meta = await readMediaMetadata(ent.name);
    const fileCompanyId = meta?.companyId || 'company_default';
    if (fileCompanyId !== params.companyId && !(isDefault && !meta?.companyId)) {
      continue;
    }
    const ext = path.extname(ent.name).toLowerCase();
    const mimeType = EXT_TO_MIME[ext] || 'application/octet-stream';
    const mediaKind = inferMediaKindFromMime(mimeType);
    if (kindFilter && kindFilter !== 'all' && mediaKind !== kindFilter) {
      continue;
    }
    const originalFileName = meta?.originalFileName || ent.name;
    const label = meta?.label || '';
    if (q) {
      const hay = `${ent.name} ${originalFileName} ${label} ${mediaKind}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    let mtimeMs = 0;
    let sizeBytes = meta?.sizeBytes || 0;
    try {
      const st = await fs.promises.stat(path.join(uploadsDir, ent.name));
      mtimeMs = st.mtimeMs;
      if (!sizeBytes) sizeBytes = st.size;
    } catch {
      continue;
    }
    items.push({
      filename: ent.name,
      originalFileName,
      relativeUrl: `/api/media/files/${ent.name}`,
      mimeType,
      mediaKind,
      label: label || undefined,
      sizeBytes,
      mtimeMs,
    });
  }

  items.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return items.slice(0, maxItems);
}

// Antrean eskalasi: percakapan yang menunggu respon pertama dari agen manusia setelah eskalasi
export async function getEscalationQueue(
  companyId: string
): Promise<Array<{ id: string; escalatedAt: Date | null }>> {
  const rows = await db
    .select({
      id: conversations.id,
      escalatedAt: conversations.escalatedAt,
      firstResponseAt: conversations.firstResponseAt,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.companyId, companyId),
        isNotNull(conversations.escalatedAt),
        ne(conversations.status, 'RESOLVED')
      )
    )
    .orderBy(asc(conversations.escalatedAt));
  return rows.filter((r) => {
    if (!r.firstResponseAt || !r.escalatedAt) return true;
    return new Date(r.firstResponseAt).getTime() < new Date(r.escalatedAt).getTime();
  });
}

export async function getSlaTargetMinutes(companyId: string): Promise<number> {
  const [row] = await db
    .select({ value: companySettings.value })
    .from(companySettings)
    .where(and(eq(companySettings.companyId, companyId), eq(companySettings.key, 'sla_target_minutes')))
    .limit(1);
  const parsed = Number.parseInt(row?.value || '15', 10);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(1440, parsed) : 15;
}

async function executeBuiltinCrmTool(
  toolName: string,
  args: Record<string, any>,
  ctx?: BuiltinToolExecutionContext
): Promise<{ ok: boolean; output: string }> {
  const companyId = getActiveCompanyId();

  if (toolName === 'crm_search_products') {
    const q = String(args?.query || '').trim().toLowerCase();
    const rawLimit = Number(args?.limit);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(20, Math.round(rawLimit))) : 10;
    const rows = await db
      .select()
      .from(products)
      .where(and(eq(products.companyId, companyId), eq(products.isActive, true)));

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
      db
        .select()
        .from(aiKnowledgeBooks)
        .where(and(eq(aiKnowledgeBooks.companyId, companyId), eq(aiKnowledgeBooks.isActive, true))),
      db
        .select()
        .from(aiKnowledgeItems)
        .where(and(eq(aiKnowledgeItems.companyId, companyId), eq(aiKnowledgeItems.isActive, true))),
    ]);

    const activeBookMap = new Map(books.map((b) => [b.id, b.title]));
    const allBookRows = await db
      .select({ id: aiKnowledgeBooks.id })
      .from(aiKnowledgeBooks)
      .where(eq(aiKnowledgeBooks.companyId, companyId));
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
        output: [
          `Mode: Simulasi Chat Inbox`,
          `Nama Pelanggan: ${ctx?.contactName || 'Budi Santoso'}`,
          ctx?.contactPhone ? `Nomor WhatsApp: ${ctx.contactPhone}` : 'Nomor WhatsApp: +6281234567890',
          `Kanal: WHATSAPP (Simulasi)`,
          `Status Tiket: OPEN`,
        ]
          .filter(Boolean)
          .join('\n'),
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
        c.nomorWhatsapp ? `Nomor WhatsApp: ${c.nomorWhatsapp}` : '',
        c.kategori ? `Kategori: ${c.kategori}` : '',
        c.tags ? `Tag Kontak: ${c.tags}` : '',
        row.conv.labels ? `Label Percakapan: ${row.conv.labels}` : '',
        c.notes ? `Catatan CS: ${c.notes}` : '',
        `Status Tiket: ${row.conv.status} (Kanal: ${row.conv.channel}${row.conv.wahaSession ? ` • Sesi: ${row.conv.wahaSession}` : ''})`,
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  if (toolName === 'crm_get_chat_history') {
    const rawLimit = Number(args?.limit);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(40, Math.round(rawLimit))) : 15;
    const query = String(args?.query || '').trim().toLowerCase();

    if (!ctx?.conversationId) {
      const simTurns = ctx?.simulatorHistory || [];
      const filtered = simTurns
        .filter((t) => !query || t.content.toLowerCase().includes(query) || (t.mediaName || '').toLowerCase().includes(query))
        .slice(-limit);
      if (filtered.length === 0) {
        return {
          ok: true,
          output: 'Belum ada riwayat pesan sebelumnya pada sesi simulasi chat ini.',
        };
      }
      const lines = filtered.map((t, idx) => {
        const msgId = t.id || `sim_msg_${idx + 1}`;
        const actor = t.role === 'assistant' ? 'AGEN AI' : `PELANGGAN (${ctx?.contactName || 'Pelanggan'})`;
        const mediaBadge = t.imageUrl
          ? ` [Lampiran Foto: ${t.mediaName || 'foto-pelanggan.jpg'}]`
          : '';
        return `[ID: ${msgId}] ${actor}:${mediaBadge} ${t.content}`;
      });
      return { ok: true, output: lines.join('\n') };
    }

    const msgRows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, ctx.conversationId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(Math.max(limit * 2, 30));

    const chronological = msgRows
      .filter((m) => m.messageType !== 'ACTIVITY')
      .reverse()
      .filter((m) => {
        if (!query) return true;
        const hay = `${m.body || ''} ${m.mediaName || ''} ${m.senderName || ''}`.toLowerCase();
        return hay.includes(query);
      })
      .slice(-limit);

    if (chronological.length === 0) {
      return { ok: true, output: 'Tidak ada riwayat pesan yang cocok pada percakapan ini.' };
    }

    const lines = chronological.map((m) => {
      const timeStr = m.createdAt
        ? new Date(m.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
        : '';
      const sender =
        m.direction === 'OUTBOUND'
          ? `AGEN (${m.senderName || 'CS'})`
          : `PELANGGAN (${m.senderName || ctx?.contactName || 'Pelanggan'})`;
      const mediaNote =
        m.messageType !== 'TEXT' && m.messageType !== 'NOTE'
          ? ` [Lampiran ${m.messageType}${m.mediaName ? `: ${m.mediaName}` : ''}${m.mediaUrl ? ` | URL: ${m.mediaUrl}` : ''}]`
          : '';
      return `[ID: ${m.id}] [${timeStr}] ${sender}:${mediaNote} ${m.body || '(tanpa teks)'}`;
    });

    return { ok: true, output: lines.join('\n') };
  }

  if (toolName === 'crm_inspect_customer_media') {
    const requestedMsgId = String(args?.messageId || '').trim();

    if (!ctx?.conversationId) {
      const simTurns = [...(ctx?.simulatorHistory || [])].reverse();
      const matchedTurn = requestedMsgId
        ? simTurns.find((t) => t.id === requestedMsgId && t.imageUrl)
        : simTurns.find((t) => t.role === 'user' && t.imageUrl);
      const targetImage = matchedTurn?.imageUrl || ctx?.latestCustomerImage || null;
      const targetName = matchedTurn?.mediaName || ctx?.latestCustomerMediaName || 'foto-pelanggan.jpg';

      if (!targetImage) {
        return {
          ok: true,
          output:
            'Tidak ditemukan lampiran foto atau dokumen dari pelanggan pada percakapan ini. Minta pelanggan melampirkan foto bila diperlukan.',
        };
      }

      if (targetImage.startsWith('data:image/') && ctx?.sideEffects) {
        const mimeMatch = targetImage.match(/^data:([^;]+);base64,/);
        ctx.sideEffects.inspectedImages.push({
          dataUri: targetImage,
          mimeType: mimeMatch?.[1] || 'image/jpeg',
          label: targetName,
        });
      }

      return {
        ok: true,
        output: `Lampiran foto pelanggan "${targetName}" berhasil dimuat ke konteks visual AI.${matchedTurn?.content ? ` Keterangan pelanggan: "${matchedTurn.content}".` : ''} Silakan analisis isi gambar tersebut.`,
      };
    }

    const msgRows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, ctx.conversationId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(30);

    const targetMsg = requestedMsgId
      ? msgRows.find((m) => m.id === requestedMsgId || m.wahaMessageId === requestedMsgId)
      : msgRows.find(
          (m) =>
            m.direction === 'INBOUND' &&
            (Boolean(m.mediaUrl) || ['IMAGE', 'DOCUMENT', 'VIDEO', 'AUDIO'].includes(m.messageType))
        );

    if (!targetMsg) {
      return {
        ok: true,
        output: 'Tidak ditemukan pesan berlampiran foto/dokumen dari pelanggan di percakapan ini.',
      };
    }

    const details = [
      `ID Pesan: ${targetMsg.id}`,
      `Tipe Media: ${targetMsg.messageType}`,
      targetMsg.mediaName ? `Nama File: ${targetMsg.mediaName}` : '',
      targetMsg.mediaUrl ? `URL Media: ${targetMsg.mediaUrl}` : '',
      targetMsg.body ? `Caption / Teks Pelanggan: ${targetMsg.body}` : '',
    ].filter(Boolean);

    if (targetMsg.mediaUrl && targetMsg.messageType === 'IMAGE') {
      const loaded = await readUploadedMediaAsDataUri(targetMsg.mediaUrl);
      if (loaded && loaded.mimetype.startsWith('image/') && ctx?.sideEffects) {
        ctx.sideEffects.inspectedImages.push({
          dataUri: loaded.dataUri,
          mimeType: loaded.mimetype,
          label: targetMsg.mediaName || targetMsg.id,
        });
        details.push(
          'Status Visual: Gambar berhasil dimuat ke konteks multimodal AI untuk dianalisis langsung.'
        );
      }
    }

    return { ok: true, output: details.join('\n') };
  }

  if (toolName === 'crm_list_gallery_media') {
    const query = String(args?.query || '').trim();
    const mediaKind = String(args?.mediaKind || 'all').trim();
    const rawLimit = Number(args?.limit);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(20, Math.round(rawLimit))) : 10;

    const files = await listTenantGalleryFiles({
      companyId,
      query,
      mediaKind,
      limit,
    });

    if (files.length === 0) {
      return {
        ok: true,
        output: query
          ? `Tidak ditemukan file/foto di Galeri Media CRM dengan kata kunci "${query}".`
          : 'Galeri Media CRM saat ini belum memiliki file atau foto yang diunggah.',
      };
    }

    const lines = files.map((f) => {
      const kb = Math.max(1, Math.round(f.sizeBytes / 1024));
      return `- [${f.mediaKind.toUpperCase()}] ${f.originalFileName} (fileName: ${f.filename} | URL: ${f.relativeUrl} | ${kb} KB${f.label ? ` | Label: ${f.label}` : ''})`;
    });
    return {
      ok: true,
      output: `Daftar Media Tersedia (${files.length}):\n${lines.join('\n')}\nGunakan crm_send_media dengan mediaUrlOrName berisi URL atau fileName di atas untuk mengirimkannya ke pelanggan.`,
    };
  }

  if (toolName === 'crm_send_media') {
    const rawTarget = String(args?.mediaUrlOrName || '').trim();
    const caption = String(args?.caption || '').trim();
    const asDocument = Boolean(args?.asDocument);

    if (!rawTarget) {
      return { ok: false, output: 'Parameter mediaUrlOrName wajib diisi.' };
    }

    const allFiles = await listTenantGalleryFiles({ companyId, limit: 30 });
    const targetLower = rawTarget.toLowerCase();
    const matchedFile = allFiles.find(
      (f) =>
        f.filename.toLowerCase() === targetLower ||
        f.relativeUrl.toLowerCase() === targetLower ||
        f.originalFileName.toLowerCase() === targetLower ||
        f.originalFileName.toLowerCase().includes(targetLower) ||
        f.filename.toLowerCase().includes(targetLower)
    );

    if (matchedFile) {
      if (ctx?.sideEffects) {
        ctx.sideEffects.outboundMedia.push({
          mediaUrl: matchedFile.relativeUrl,
          mediaType: asDocument ? 'document' : matchedFile.mediaKind,
          mimeType: matchedFile.mimeType,
          fileName: matchedFile.originalFileName || matchedFile.filename,
          caption: caption || undefined,
          asDocument,
        });
      }
      return {
        ok: true,
        output: `Media "${matchedFile.originalFileName}" (${matchedFile.relativeUrl}) berhasil dijadwalkan untuk dikirim ke pelanggan${caption ? ` dengan caption: "${caption}"` : ''}.`,
      };
    }

    if (/^https?:\/\//i.test(rawTarget) || rawTarget.startsWith('/api/media/files/')) {
      const ext = path.extname(rawTarget.split('?')[0]).toLowerCase();
      const mimeType = EXT_TO_MIME[ext] || (asDocument ? 'application/pdf' : 'image/jpeg');
      const mediaType = asDocument ? 'document' : inferMediaKindFromMime(mimeType);
      const fileName = path.basename(rawTarget.split('?')[0]) || 'media-crm.jpg';
      if (ctx?.sideEffects) {
        ctx.sideEffects.outboundMedia.push({
          mediaUrl: rawTarget,
          mediaType,
          mimeType,
          fileName,
          caption: caption || undefined,
          asDocument,
        });
      }
      return {
        ok: true,
        output: `Media "${fileName}" (${rawTarget}) berhasil dijadwalkan untuk dikirim ke pelanggan${caption ? ` dengan caption: "${caption}"` : ''}.`,
      };
    }

    return {
      ok: false,
      output: `Media "${rawTarget}" tidak ditemukan di Galeri Media CRM. Panggil crm_list_gallery_media terlebih dahulu untuk melihat daftar file yang tersedia.`,
    };
  }

  if (toolName === 'crm_reply_to_message') {
    const messageId = String(args?.messageId || '').trim();
    if (!messageId) {
      return { ok: false, output: 'Parameter messageId wajib diisi.' };
    }

    if (!ctx?.conversationId) {
      const simTurns = ctx?.simulatorHistory || [];
      const found = simTurns.find((t, idx) => (t.id || `sim_msg_${idx + 1}`) === messageId);
      if (ctx?.sideEffects) {
        ctx.sideEffects.replyToMessageId = messageId;
        ctx.sideEffects.replyToPreview = found?.content || `Pesan #${messageId}`;
      }
      return {
        ok: true,
        output: `Balasan AI akan mengutip (reply) pesan ID "${messageId}"${found ? ` ("${found.content.slice(0, 80)}")` : ''}.`,
      };
    }

    const [msgRow] = await db
      .select()
      .from(chatMessages)
      .where(
        and(eq(chatMessages.conversationId, ctx.conversationId), eq(chatMessages.id, messageId))
      )
      .limit(1);

    if (ctx?.sideEffects) {
      ctx.sideEffects.replyToMessageId = msgRow?.id || messageId;
      ctx.sideEffects.replyToPreview = msgRow?.body || `Pesan #${messageId}`;
    }

    return {
      ok: true,
      output: msgRow
        ? `Balasan AI akan mengutip pesan "${(msgRow.body || msgRow.mediaName || messageId).slice(0, 80)}" (ID: ${msgRow.id}).`
        : `Balasan AI diatur untuk mengutip pesan ID "${messageId}".`,
    };
  }

  if (toolName === 'crm_update_customer_profile') {
    const notes = String(args?.notes || '').trim();
    const category = String(args?.category || '').trim();
    const addLabel = String(args?.addLabel || '').trim();

    if (!notes && !category && !addLabel) {
      return {
        ok: false,
        output: 'Isi minimal satu dari parameter notes, category, atau addLabel.',
      };
    }

    if (!ctx?.conversationId || ctx?.isSimulator) {
      const summaryParts = [
        category ? `Kategori -> "${category}"` : '',
        addLabel ? `Label Chat + "${addLabel}"` : '',
        notes ? `Catatan CS -> "${notes}"` : '',
      ].filter(Boolean);
      return {
        ok: true,
        output: `[Simulasi] Profil pelanggan diperbarui: ${summaryParts.join(', ')}.`,
      };
    }

    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, ctx.conversationId));
    if (!conv) {
      return { ok: false, output: 'Percakapan tidak ditemukan.' };
    }

    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, conv.contactId));

    const now = new Date();
    const applied: string[] = [];

    if (contact && (notes || category)) {
      const contactUpdate: Record<string, any> = { updatedAt: now };
      if (category) {
        contactUpdate.kategori = category;
        applied.push(`kategori="${category}"`);
      }
      if (notes) {
        const prevNotes = String(contact.notes || '').trim();
        contactUpdate.notes = prevNotes ? `${prevNotes}\n[AI] ${notes}` : `[AI] ${notes}`;
        applied.push(`catatan ditambahkan`);
      }
      await db.update(contacts).set(contactUpdate).where(eq(contacts.id, contact.id));
    }

    if (addLabel) {
      const currentLabels = String(conv.labels || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!currentLabels.some((l) => l.toLowerCase() === addLabel.toLowerCase())) {
        currentLabels.push(addLabel);
      }
      await db
        .update(conversations)
        .set({ labels: currentLabels.join(', '), updatedAt: now })
        .where(eq(conversations.id, conv.id));
      applied.push(`label="${addLabel}"`);
    }

    liveEvents.emit('conversations:update', { conversationId: conv.id });
    return {
      ok: true,
      output: `Profil & label pelanggan berhasil diperbarui (${applied.join(', ')}).`,
    };
  }

  if (toolName === 'crm_escalate_to_human') {
    const reason = String(args?.reason || 'Pelanggan meminta bantuan agen manusia').trim();
    let summary = String(args?.summary || '').trim();
    if (!ctx?.conversationId || ctx?.isSimulator) {
      return {
        ok: true,
        output: `Eskalasi simulasi dicatat: "${reason}"${summary ? ` | Kesimpulan: "${summary}"` : ''}. Beri tahu pelanggan dengan sopan bahwa tim CS manusia akan membantu dan Anda sudah menempatkan mereka di antrean (simulasi: antrean #1).`,
      };
    }

    if (!summary) {
      const recent = await db
        .select({ direction: chatMessages.direction, body: chatMessages.body, messageType: chatMessages.messageType })
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, ctx.conversationId))
        .orderBy(desc(chatMessages.createdAt))
        .limit(6);
      summary = recent
        .filter((m) => m.messageType !== 'NOTE' && m.messageType !== 'ACTIVITY' && m.body)
        .reverse()
        .map((m) => `${m.direction === 'INBOUND' ? 'Pelanggan' : 'CS'}: ${String(m.body).slice(0, 160)}`)
        .join(' | ');
    }

    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, ctx.conversationId));
    if (!conv) {
      return { ok: false, output: 'Percakapan tidak ditemukan untuk eskalasi.' };
    }

    const convCompanyId = conv.companyId || companyId;
    const activeAgents = await db
      .select()
      .from(crmAgents)
      .where(and(eq(crmAgents.companyId, convCompanyId), eq(crmAgents.isActive, true)))
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
        .where(and(eq(conversations.companyId, convCompanyId), eq(conversations.status, 'OPEN')));
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

    const queue = await getEscalationQueue(convCompanyId);
    const queueIdx = queue.findIndex((q) => q.id === conv.id);
    const queueNo = queueIdx >= 0 ? queueIdx + 1 : queue.length + 1;
    const queueTotal = Math.max(queue.length, queueNo);
    const slaTarget = await getSlaTargetMinutes(convCompanyId);

    const noteHeader = chosenAgent
      ? `[Eskalasi Agent AI → ${chosenAgent.name}] Antrean #${queueNo} dari ${queueTotal}`
      : `[Eskalasi Agent AI · Menunggu Agen Siap] Antrean #${queueNo} dari ${queueTotal}`;
    const noteBody = [
      noteHeader,
      `Alasan: ${reason}`,
      summary ? `Kesimpulan AI: ${summary}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const executeHandoverNotes = async () => {
      const postNow = new Date();
      const convUpdates: Record<string, any> = {
        status: 'OPEN',
        resolvedAt: null,
        escalatedAt: conv.escalatedAt || postNow,
        escalationReason: reason.slice(0, 500),
        escalationSummary: summary ? summary.slice(0, 2000) : null,
        updatedAt: postNow,
      };
      if (chosenAgent) {
        convUpdates.assignedAgentId = chosenAgent.id;
        convUpdates.assignedAgentName = chosenAgent.name;
      }

      await db
        .update(conversations)
        .set(convUpdates)
        .where(eq(conversations.id, conv.id));

      await db.insert(chatMessages).values({
        id: crypto.randomUUID(),
        companyId: convCompanyId,
        conversationId: conv.id,
        contactId: conv.contactId,
        direction: 'OUTBOUND',
        messageType: 'NOTE',
        wahaSession: conv.wahaSession,
        senderName: 'Agent AI',
        body: noteBody,
        status: 'NOTE',
        ackStatus: 0,
        metadataJson: JSON.stringify({ kind: 'AI_ESCALATION', queueNo, queueTotal }),
        createdAt: postNow,
      });

      // Catat peristiwa perpindahan tugas di linimasa aktivitas percakapan (terlihat di Live Chat)
      await db.insert(chatMessages).values({
        id: crypto.randomUUID(),
        companyId: convCompanyId,
        conversationId: conv.id,
        contactId: conv.contactId,
        direction: 'SYSTEM',
        messageType: 'ACTIVITY',
        channel: conv.channel || 'WHATSAPP',
        wahaSession: conv.wahaSession,
        senderName: 'Agent AI',
        body: chosenAgent
          ? `Agent AI mengalihkan tugas ke Agent ${chosenAgent.name}`
          : `Agent AI mengalihkan tugas ke Antrean Tim CS (#${queueNo})`,
        metadataJson: JSON.stringify({
          kind: 'ACTIVITY',
          action: 'AI_HANDOVER',
          actorName: 'Agent AI',
          actorRole: 'AI Assistant',
          detail: {
            queueNo,
            queueTotal,
            reason,
            toAgentId: chosenAgent?.id || null,
            toAgentName: chosenAgent?.name || null,
          },
        }),
        status: 'SYSTEM',
        ackStatus: 0,
        createdAt: new Date(postNow.getTime() + 100),
      });

      liveEvents.emit('conversations:update', {
        conversationId: conv.id,
        escalated: true,
        assignedAgentId: chosenAgent?.id || conv.assignedAgentId || null,
        assignedAgentName: chosenAgent?.name || conv.assignedAgentName || null,
      });
    };

    if (ctx?.sideEffects) {
      ctx.sideEffects.escalation = {
        queueNo,
        queueTotal,
        slaTarget,
        executeHandoverNotes,
      };
    } else {
      await executeHandoverNotes();
    }
    const queueInfo = `Nomor antrean pelanggan: #${queueNo} dari ${queueTotal} percakapan menunggu. Target respons tim sekitar ${slaTarget} menit per percakapan; jangan menjanjikan waktu pasti.`;
    return {
      ok: true,
      output: chosenAgent
        ? `Percakapan berhasil dieskalasi dan ditugaskan ke agen aktif "${chosenAgent.name}". ${queueInfo} Sampaikan nomor antrean ini ke pelanggan dengan sopan.`
        : `Percakapan berhasil ditandai untuk agen manusia (saat ini semua agen sedang istirahat/offline). ${queueInfo} Sampaikan nomor antrean ini ke pelanggan dengan sopan.`,
    };
  }

  if (toolName === 'crm_resolve_conversation') {
    const closingMessage = String(args?.closingMessage || '').trim();
    const sendCsat = args?.sendCsat !== false;
    const resolutionNotes = String(args?.resolutionNotes || '').trim();

    if (!ctx?.conversationId || ctx?.isSimulator) {
      if (ctx?.sideEffects) {
        ctx.sideEffects.resolved = { closingMessage, sendCsat, resolutionNotes };
      }
      return {
        ok: true,
        output: `Obrolan berhasil diselesaikan (simulasi RESOLVED). ${sendCsat ? 'Tautan survei kepuasan pelanggan (CSAT) dengan rating 1-5 bintang akan dikirimkan otomatis ke kanal pelanggan.' : 'Tanpa pengiriman survei CSAT.'}`,
      };
    }

    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, ctx.conversationId));

    if (!conv) {
      return { ok: false, output: 'Percakapan tidak ditemukan untuk diselesaikan.' };
    }

    if (conv.status === 'RESOLVED') {
      return { ok: true, output: 'Obrolan sudah berstatus RESOLVED sebelumnya.' };
    }

    const now = new Date();
    const convCompanyId = conv.companyId || companyId;

    await db
      .update(conversations)
      .set({
        status: 'RESOLVED',
        resolvedAt: now,
        updatedAt: now,
      })
      .where(eq(conversations.id, ctx.conversationId));

    if (ctx?.sideEffects) {
      ctx.sideEffects.resolved = { closingMessage, sendCsat, resolutionNotes };
    }

    // Kirim survei CSAT jika diinginkan dan percakapan memenuhi syarat penilaian
    const isExcluded = Boolean(conv.excludeFromMetrics || conv.isGroup);
    let csatOutcome = isExcluded ? 'Obrolan non-penilaian/grup, tanpa CSAT' : 'Survei CSAT tidak diminta';
    if (sendCsat && !isExcluded) {
      const [contact] = await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, conv.contactId), eq(contacts.companyId, convCompanyId)));

      if (contact) {
        try {
          const refreshedConv = { ...conv, status: 'RESOLVED' as const, resolvedAt: now };
          await sendCsatCtaForConversation(refreshedConv, contact, {
            triggerType: 'AUTO_RESOLVE',
          });
          csatOutcome = `Survei CSAT otomatis terkirim ke kanal ${conv.channel || 'pelanggan'}`;
        } catch (csatErr: any) {
          csatOutcome = `Gagal mengirim CSAT: ${csatErr.message}`;
          console.warn('[AI] crm_resolve_conversation CSAT error:', csatErr.message);
        }
      }
    }

    // Catat peristiwa di linimasa percakapan
    await recordConversationActivity({
      companyId: convCompanyId,
      conversationId: conv.id,
      contactId: conv.contactId,
      wahaSession: conv.wahaSession,
      channel: conv.channel,
      actorName: 'Agent AI',
      actorRole: 'AI Assistant',
      action: 'CONVERSATION_RESOLVED',
      summary: `Agent AI menyelesaikan obrolan (${csatOutcome})${resolutionNotes ? `: "${resolutionNotes}"` : ''}`,
      createdAt: now,
    });

    liveEvents.emit('conversations:update', { conversationId: conv.id }, convCompanyId);
    liveEvents.emit('tracking:update', { conversationId: conv.id }, convCompanyId);

    return {
      ok: true,
      output: `Percakapan berhasil diselesaikan (status: RESOLVED) oleh Agent AI. ${csatOutcome}. Pelanggan dapat memberikan penilaian rating 1-5 bintang dan ulasan layanan.`,
    };
  }

  return { ok: false, output: `Tool CRM "${toolName}" tidak dikenal.` };
}

export interface AgentToolRegistry {
  definitions: AiRuntimeToolDefinition[];
  sideEffects: AiToolSideEffects;
  executeTool: (
    llmName: string,
    args: Record<string, any>
  ) => Promise<{ trace: AiToolCallTrace; output: string }>;
}

export function buildAgentToolRegistry(params: {
  enabledBuiltinTools: string[];
  linkedToolsFromSkills: string[];
  mcpServers: McpServerConfigRecord[];
  context?: Omit<BuiltinToolExecutionContext, 'sideEffects'>;
  customExecutor?: (
    def: AiRuntimeToolDefinition,
    args: Record<string, any>
  ) => Promise<{ ok: boolean; output: string }>;
}): AgentToolRegistry {
  const definitions: AiRuntimeToolDefinition[] = [];
  const usedNames = new Set<string>();
  const sideEffects: AiToolSideEffects = {
    outboundMedia: [],
    replyToMessageId: null,
    replyToPreview: null,
    inspectedImages: [],
  };
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
      res = await executeBuiltinCrmTool(target.def.originalName, args, {
        ...(params.context || {}),
        sideEffects,
      });
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

  return { definitions, sideEffects, executeTool };
}
