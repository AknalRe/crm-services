import crypto from 'crypto';
import axios from 'axios';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import {
  aiKnowledgeBooks,
  aiKnowledgeItems,
  aiSkills,
  systemSettings,
} from '../db/schema';
import {
  AgentToolRegistry,
  AiQueuedOutboundMedia,
  AiToolCallTrace,
  BUILTIN_CRM_TOOLS,
  McpServerConfigRecord,
  buildAgentToolRegistry,
  loadActiveMcpServers,
  sanitizeSchemaForGemini,
} from './mcpClient.service';

export type { AiQueuedOutboundMedia, AiToolCallTrace } from './mcpClient.service';

export type AiProviderId =
  | 'OPENAI'
  | 'GEMINI'
  | 'ANTHROPIC'
  | 'OPENROUTER'
  | 'GROQ'
  | 'DEEPSEEK'
  | 'CUSTOM_OPENAI'
  | 'LOCAL_KB';

export type ExternalAiProviderId = Exclude<AiProviderId, 'LOCAL_KB'>;

export interface AiModelOption {
  id: string;
  label: string;
  source?: 'api' | 'recommended';
}

export interface AiProviderCatalogEntry {
  id: AiProviderId;
  label: string;
  protocol: 'openai' | 'gemini' | 'anthropic' | 'local';
  defaultBaseUrl: string;
  defaultModel: string;
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  supportsModelFetch: boolean;
  apiKeyPlaceholder: string;
  baseUrlPlaceholder: string;
  recommendedModels: AiModelOption[];
}

export interface AiFallbackTarget {
  id: string;
  enabled: boolean;
  provider: ExternalAiProviderId;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  hasApiKey?: boolean;
  apiKeyPreview?: string;
  clearApiKey?: boolean;
}

export interface AiPersonalityProfile {
  roleTitle: string;
  tone: 'PROFESSIONAL' | 'FRIENDLY' | 'FORMAL' | 'CASUAL' | 'EMPATHETIC';
  language: 'INDONESIAN' | 'ENGLISH' | 'BILINGUAL' | 'MATCH_USER';
  responseLength: 'CONCISE' | 'BALANCED' | 'DETAILED';
  emojiUsage: 'NONE' | 'MINIMAL' | 'MODERATE';
  greetingStyle: string;
  closingStyle: string;
}

export interface AiAgentConfig {
  enabled: boolean;
  name: string;
  persona: string;
  personality: AiPersonalityProfile;
  positivePrompt: string;
  negativePrompt: string;
  enabledBuiltinTools: string[];
  autoReplyDm: boolean;
  autoReplyComment: boolean;
  dmChannels: string[];
  commentChannels: string[];
  dmWahaSessions: string[];
  dmScope: 'PERSONAL' | 'GROUP' | 'BOTH';
  groupMentionOnly: boolean;
  humanTyping: boolean;
  replyToNonPenilaian: boolean;
  provider: AiProviderId;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  hasApiKey?: boolean;
  apiKeyPreview?: string;
  clearApiKey?: boolean;
  fallbacks: AiFallbackTarget[];
  fallbackToLocalKb: boolean;
  temperature: number;
  maxTokens: number;
  contextLength?: number;
  maxHistoryMessages?: number;
  timeoutMs: number;
}

export interface AiConversationTurn {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  imageUrl?: string | null;
  mediaName?: string | null;
  mediaType?: string | null;
  replyToMessageId?: string | null;
}

export interface AiAttemptTrace {
  role: 'PRIMARY' | 'FALLBACK' | 'LOCAL_KB';
  slotId: string;
  slotLabel: string;
  provider: AiProviderId;
  providerLabel: string;
  model: string;
  ok: boolean;
  durationMs: number;
  error?: string;
}

export interface AiGenerationResult {
  config: AiAgentConfig;
  reply: string;
  source: AiProviderId;
  providerLabel: string;
  model: string;
  fallbackUsed: boolean;
  matchedKb: boolean;
  attempts: AiAttemptTrace[];
  toolCalls: AiToolCallTrace[];
  outboundMedia?: AiQueuedOutboundMedia[];
  replyToMessageId?: string | null;
  replyToPreview?: string | null;
  escalation?: { queueNo: number; queueTotal: number; slaTarget: number; executeHandoverNotes?: () => Promise<void> } | null;
}

export const AI_PROVIDER_CATALOG: AiProviderCatalogEntry[] = [
  {
    id: 'OPENAI',
    label: 'OpenAI',
    protocol: 'openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModelFetch: true,
    apiKeyPlaceholder: 'sk-...',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
    recommendedModels: [
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'o4-mini', label: 'o4-mini' },
    ],
  },
  {
    id: 'GEMINI',
    label: 'Google Gemini',
    protocol: 'gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModelFetch: true,
    apiKeyPlaceholder: 'AIza...',
    baseUrlPlaceholder: 'https://generativelanguage.googleapis.com/v1beta',
    recommendedModels: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-Lite' },
    ],
  },
  {
    id: 'ANTHROPIC',
    label: 'Anthropic (Claude)',
    protocol: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModelFetch: true,
    apiKeyPlaceholder: 'sk-ant-...',
    baseUrlPlaceholder: 'https://api.anthropic.com/v1',
    recommendedModels: [
      { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
      { id: 'claude-3-7-sonnet-latest', label: 'Claude 3.7 Sonnet' },
      { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' },
      { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet' },
    ],
  },
  {
    id: 'OPENROUTER',
    label: 'OpenRouter',
    protocol: 'openai',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModelFetch: true,
    apiKeyPlaceholder: 'sk-or-v1-...',
    baseUrlPlaceholder: 'https://openrouter.ai/api/v1',
    recommendedModels: [
      { id: 'openai/gpt-4o-mini', label: 'OpenAI: GPT-4o Mini' },
      { id: 'google/gemini-2.5-flash', label: 'Google: Gemini 2.5 Flash' },
      { id: 'anthropic/claude-3.5-haiku', label: 'Anthropic: Claude 3.5 Haiku' },
      { id: 'deepseek/deepseek-chat-v3-0324', label: 'DeepSeek: Chat v3' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (Free)' },
    ],
  },
  {
    id: 'GROQ',
    label: 'Groq',
    protocol: 'openai',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModelFetch: true,
    apiKeyPlaceholder: 'gsk_...',
    baseUrlPlaceholder: 'https://api.groq.com/openai/v1',
    recommendedModels: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
      { id: 'qwen-qwq-32b', label: 'Qwen QwQ 32B' },
      { id: 'gemma2-9b-it', label: 'Gemma 2 9B' },
    ],
  },
  {
    id: 'DEEPSEEK',
    label: 'DeepSeek',
    protocol: 'openai',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModelFetch: true,
    apiKeyPlaceholder: 'sk-...',
    baseUrlPlaceholder: 'https://api.deepseek.com/v1',
    recommendedModels: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat (V3)' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)' },
    ],
  },
  {
    id: 'CUSTOM_OPENAI',
    label: 'Custom OpenAI-Compatible (Ollama / LiteLLM / Gateway)',
    protocol: 'openai',
    defaultBaseUrl: '',
    defaultModel: 'llama3.1',
    requiresApiKey: false,
    requiresBaseUrl: true,
    supportsModelFetch: true,
    apiKeyPlaceholder: 'Opsional (kosongkan untuk Ollama lokal)',
    baseUrlPlaceholder: 'http://host.docker.internal:11434/v1',
    recommendedModels: [
      { id: 'llama3.1', label: 'llama3.1' },
      { id: 'qwen2.5', label: 'qwen2.5' },
      { id: 'mistral', label: 'mistral' },
      { id: 'gemma2', label: 'gemma2' },
    ],
  },
  {
    id: 'LOCAL_KB',
    label: 'Knowledge Matcher (Lokal)',
    protocol: 'local',
    defaultBaseUrl: '',
    defaultModel: 'local-kb-matcher',
    requiresApiKey: false,
    requiresBaseUrl: false,
    supportsModelFetch: false,
    apiKeyPlaceholder: '',
    baseUrlPlaceholder: '',
    recommendedModels: [{ id: 'local-kb-matcher', label: 'Knowledge Matcher (Lokal)' }],
  },
];

const PROVIDER_MAP = new Map<AiProviderId, AiProviderCatalogEntry>(
  AI_PROVIDER_CATALOG.map((p) => [p.id, p])
);

const EXTERNAL_PROVIDER_IDS = new Set<ExternalAiProviderId>([
  'OPENAI',
  'GEMINI',
  'ANTHROPIC',
  'OPENROUTER',
  'GROQ',
  'DEEPSEEK',
  'CUSTOM_OPENAI',
]);

const MAX_FALLBACKS = 10;

export const AI_DM_CHANNELS = ['WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'THREADS', 'TELEGRAM'] as const;
export const AI_COMMENT_CHANNELS = ['INSTAGRAM', 'FACEBOOK', 'THREADS'] as const;

function sanitizeChannelList(raw: unknown, allowed: readonly string[], fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback;
  const allowedSet = new Set(allowed);
  return Array.from(
    new Set(
      raw.map((x) => String(x || '').trim().toUpperCase()).filter((x) => allowedSet.has(x))
    )
  );
}

function sanitizeSessionList(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback;
  return Array.from(
    new Set(raw.map((x) => String(x || '').trim()).filter(Boolean))
  ).slice(0, 100);
}

function sanitizeDmScope(raw: unknown, fallback: 'PERSONAL' | 'GROUP' | 'BOTH'): 'PERSONAL' | 'GROUP' | 'BOTH' {
  const v = String(raw || '').toUpperCase();
  return v === 'PERSONAL' || v === 'GROUP' || v === 'BOTH' ? v : fallback;
}

// Cek apakah Agent AI boleh membalas DM pada kanal & sesi WhatsApp ini
export function isAiAllowedForDm(
  cfg: Pick<AiAgentConfig, 'dmChannels' | 'dmWahaSessions'> &
    Partial<Pick<AiAgentConfig, 'dmScope'>>,
  channel: string,
  sessionName?: string | null,
  isGroup = false
): boolean {
  const ch = String(channel || 'WHATSAPP').toUpperCase();
  const scope = cfg.dmScope || 'PERSONAL';
  if (isGroup) {
    if (scope === 'PERSONAL' || ch !== 'WHATSAPP') return false;
  } else if (scope === 'GROUP') {
    return false;
  }
  const channels = Array.isArray(cfg.dmChannels) ? cfg.dmChannels : [...AI_DM_CHANNELS];
  if (!channels.includes(ch)) return false;
  if (ch === 'WHATSAPP') {
    const sessions = Array.isArray(cfg.dmWahaSessions) ? cfg.dmWahaSessions : [];
    if (sessions.length > 0) {
      const sess = String(sessionName || '').trim().toLowerCase();
      return sessions.some((s) => s.trim().toLowerCase() === sess);
    }
  }
  return true;
}

// Cek apakah Agent AI boleh membalas komentar pada kanal ini
export function isAiAllowedForComment(
  cfg: Pick<AiAgentConfig, 'commentChannels'>,
  channel: string
): boolean {
  const channels = Array.isArray(cfg.commentChannels) ? cfg.commentChannels : [...AI_COMMENT_CHANNELS];
  return channels.includes(String(channel || '').toUpperCase());
}

const DEFAULT_PERSONALITY: AiPersonalityProfile = {
  roleTitle: 'Customer Service & Konsultan CRM',
  tone: 'PROFESSIONAL',
  language: 'MATCH_USER',
  responseLength: 'CONCISE',
  emojiUsage: 'MINIMAL',
  greetingStyle: '',
  closingStyle: '',
};

const VALID_TONES = new Set(['PROFESSIONAL', 'FRIENDLY', 'FORMAL', 'CASUAL', 'EMPATHETIC']);
const VALID_LANGUAGES = new Set(['INDONESIAN', 'ENGLISH', 'BILINGUAL', 'MATCH_USER']);
const VALID_LENGTHS = new Set(['CONCISE', 'BALANCED', 'DETAILED']);
const VALID_EMOJI = new Set(['NONE', 'MINIMAL', 'MODERATE']);
const VALID_BUILTIN_TOOL_NAMES = new Set(BUILTIN_CRM_TOOLS.map((t) => t.name));

export const DEFAULT_AI_CONFIG: AiAgentConfig = {
  enabled: false,
  name: 'Asisten CRM',
  persona: 'Ramah, ringkas, profesional, dan selalu merujuk pada Knowledge Book perusahaan.',
  personality: { ...DEFAULT_PERSONALITY },
  positivePrompt:
    'Utamakan menjawab inti pertanyaan pelanggan terlebih dahulu dengan bahasa yang jelas, sopan, dan terstruktur.\nArahkan pelanggan ke langkah berikutnya bila ingin melakukan pemesanan atau konsultasi lebih lanjut.',
  negativePrompt:
    'Jangan mengarang harga, promo, diskon, atau kebijakan yang tidak tertulis di Knowledge Book atau Katalog Produk.\nJangan meminta kata sandi, PIN, atau OTP pelanggan.\nJangan menjelekkan kompetitor atau memberikan janji garansi di luar kebijakan tertulis.',
  enabledBuiltinTools: [
    'crm_search_products',
    'crm_search_knowledge',
    'crm_get_customer_info',
    'crm_get_chat_history',
    'crm_inspect_customer_media',
    'crm_list_gallery_media',
    'crm_send_media',
    'crm_reply_to_message',
    'crm_update_customer_profile',
    'crm_escalate_to_human',
  ],
  autoReplyDm: false,
  autoReplyComment: false,
  dmChannels: [...AI_DM_CHANNELS],
  commentChannels: [...AI_COMMENT_CHANNELS],
  dmWahaSessions: [],
  dmScope: 'PERSONAL',
  groupMentionOnly: true,
  humanTyping: true,
  replyToNonPenilaian: true,
  provider: 'LOCAL_KB',
  model: 'local-kb-matcher',
  baseUrl: '',
  apiKey: '',
  fallbacks: [],
  fallbackToLocalKb: true,
  temperature: 0.4,
  maxTokens: 2048,
  contextLength: 32768,
  maxHistoryMessages: 20,
  timeoutMs: 15000,
};

export function isValidAiProvider(raw: unknown): raw is AiProviderId {
  return typeof raw === 'string' && PROVIDER_MAP.has(raw as AiProviderId);
}

export function isExternalAiProvider(raw: unknown): raw is ExternalAiProviderId {
  return typeof raw === 'string' && EXTERNAL_PROVIDER_IDS.has(raw as ExternalAiProviderId);
}

export function getProviderEntry(provider: AiProviderId): AiProviderCatalogEntry {
  return PROVIDER_MAP.get(provider) || PROVIDER_MAP.get('LOCAL_KB')!;
}

export function maskApiKey(raw?: string): string {
  const clean = String(raw || '').trim();
  if (!clean) return '';
  if (clean.length <= 8) return '••••';
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

export function normalizeBaseUrl(provider: AiProviderId, rawBaseUrl?: string): string {
  const entry = getProviderEntry(provider);
  const input = String(rawBaseUrl || '').trim();
  const effectiveRaw = input || entry.defaultBaseUrl;
  if (!effectiveRaw) return '';

  let parsed: URL;
  try {
    parsed = new URL(effectiveRaw);
  } catch {
    throw new Error(`Base URL untuk ${entry.label} tidak valid`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Base URL untuk ${entry.label} harus diawali http:// atau https://`);
  }

  let clean = parsed.toString().replace(/\/+$/, '');
  if (entry.protocol === 'openai') {
    clean = clean.replace(/\/chat\/completions$/i, '').replace(/\/models$/i, '');
  } else if (entry.protocol === 'anthropic') {
    clean = clean.replace(/\/messages$/i, '').replace(/\/models$/i, '');
  } else if (entry.protocol === 'gemini') {
    clean = clean.replace(/\/models$/i, '');
  }
  return clean.replace(/\/+$/, '');
}

function clampNumber(val: unknown, fallback: number, min: number, max: number): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function sanitizePersonality(
  raw: any,
  fallback: AiPersonalityProfile = DEFAULT_PERSONALITY
): AiPersonalityProfile {
  const tone = String(raw?.tone || fallback.tone).toUpperCase();
  const language = String(raw?.language || fallback.language).toUpperCase();
  const responseLength = String(raw?.responseLength || fallback.responseLength).toUpperCase();
  const emojiUsage = String(raw?.emojiUsage || fallback.emojiUsage).toUpperCase();

  return {
    roleTitle:
      raw?.roleTitle !== undefined
        ? String(raw.roleTitle || '').trim()
        : fallback.roleTitle,
    tone: (VALID_TONES.has(tone) ? tone : fallback.tone) as AiPersonalityProfile['tone'],
    language: (VALID_LANGUAGES.has(language)
      ? language
      : fallback.language) as AiPersonalityProfile['language'],
    responseLength: (VALID_LENGTHS.has(responseLength)
      ? responseLength
      : fallback.responseLength) as AiPersonalityProfile['responseLength'],
    emojiUsage: (VALID_EMOJI.has(emojiUsage)
      ? emojiUsage
      : fallback.emojiUsage) as AiPersonalityProfile['emojiUsage'],
    greetingStyle:
      raw?.greetingStyle !== undefined
        ? String(raw.greetingStyle || '').trim()
        : fallback.greetingStyle,
    closingStyle:
      raw?.closingStyle !== undefined
        ? String(raw.closingStyle || '').trim()
        : fallback.closingStyle,
  };
}

function sanitizeBuiltinTools(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback;
  return Array.from(
    new Set(
      raw
        .map((x) => String(x || '').trim())
        .filter((x) => VALID_BUILTIN_TOOL_NAMES.has(x))
    )
  );
}

function sanitizeStoredConfig(raw: any): AiAgentConfig {
  const provider: AiProviderId = isValidAiProvider(raw?.provider)
    ? raw.provider
    : DEFAULT_AI_CONFIG.provider;
  const entry = getProviderEntry(provider);
  const model = String(raw?.model || '').trim() || entry.defaultModel;
  let baseUrl = String(raw?.baseUrl || '').trim();
  if (baseUrl) {
    try {
      baseUrl = normalizeBaseUrl(provider, baseUrl);
    } catch {
      baseUrl = '';
    }
  }

  const rawFallbacks = Array.isArray(raw?.fallbacks) ? raw.fallbacks.slice(0, MAX_FALLBACKS) : [];
  const fallbacks: AiFallbackTarget[] = [];
  for (const item of rawFallbacks) {
    if (!item || !isExternalAiProvider(item.provider)) continue;
    const fbEntry = getProviderEntry(item.provider);
    let fbBaseUrl = String(item.baseUrl || '').trim();
    if (fbBaseUrl) {
      try {
        fbBaseUrl = normalizeBaseUrl(item.provider, fbBaseUrl);
      } catch {
        fbBaseUrl = '';
      }
    }
    fallbacks.push({
      id: String(item.id || '').trim() || crypto.randomUUID(),
      enabled: item.enabled !== undefined ? Boolean(item.enabled) : true,
      provider: item.provider,
      model: String(item.model || '').trim() || fbEntry.defaultModel,
      baseUrl: fbBaseUrl,
      apiKey: String(item.apiKey || '').trim(),
    });
  }

  return {
    enabled: raw?.enabled !== undefined ? Boolean(raw.enabled) : DEFAULT_AI_CONFIG.enabled,
    name: String(raw?.name || '').trim() || DEFAULT_AI_CONFIG.name,
    persona: raw?.persona !== undefined ? String(raw.persona).trim() : DEFAULT_AI_CONFIG.persona,
    personality: sanitizePersonality(raw?.personality, DEFAULT_PERSONALITY),
    positivePrompt:
      raw?.positivePrompt !== undefined
        ? String(raw.positivePrompt).trim()
        : DEFAULT_AI_CONFIG.positivePrompt,
    negativePrompt:
      raw?.negativePrompt !== undefined
        ? String(raw.negativePrompt).trim()
        : DEFAULT_AI_CONFIG.negativePrompt,
    enabledBuiltinTools: sanitizeBuiltinTools(
      raw?.enabledBuiltinTools,
      DEFAULT_AI_CONFIG.enabledBuiltinTools
    ),
    autoReplyDm:
      raw?.autoReplyDm !== undefined ? Boolean(raw.autoReplyDm) : DEFAULT_AI_CONFIG.autoReplyDm,
    autoReplyComment:
      raw?.autoReplyComment !== undefined
        ? Boolean(raw.autoReplyComment)
        : DEFAULT_AI_CONFIG.autoReplyComment,
    dmChannels: sanitizeChannelList(raw?.dmChannels, AI_DM_CHANNELS, [...AI_DM_CHANNELS]),
    commentChannels: sanitizeChannelList(raw?.commentChannels, AI_COMMENT_CHANNELS, [
      ...AI_COMMENT_CHANNELS,
    ]),
    dmWahaSessions: sanitizeSessionList(raw?.dmWahaSessions, []),
    dmScope: sanitizeDmScope(raw?.dmScope, DEFAULT_AI_CONFIG.dmScope),
    groupMentionOnly:
      raw?.groupMentionOnly !== undefined
        ? Boolean(raw.groupMentionOnly)
        : DEFAULT_AI_CONFIG.groupMentionOnly,
    humanTyping:
      raw?.humanTyping !== undefined ? Boolean(raw.humanTyping) : DEFAULT_AI_CONFIG.humanTyping,
    replyToNonPenilaian:
      raw?.replyToNonPenilaian !== undefined
        ? Boolean(raw.replyToNonPenilaian)
        : DEFAULT_AI_CONFIG.replyToNonPenilaian,
    provider,
    model,
    baseUrl,
    apiKey: String(raw?.apiKey || '').trim(),
    fallbacks,
    fallbackToLocalKb:
      raw?.fallbackToLocalKb !== undefined
        ? Boolean(raw.fallbackToLocalKb)
        : DEFAULT_AI_CONFIG.fallbackToLocalKb,
    temperature: clampNumber(raw?.temperature, DEFAULT_AI_CONFIG.temperature, 0, 1.5),
    maxTokens: Math.round(clampNumber(raw?.maxTokens, DEFAULT_AI_CONFIG.maxTokens, 64, 131072)),
    contextLength: Math.round(
      clampNumber(raw?.contextLength, DEFAULT_AI_CONFIG.contextLength || 32768, 2048, 2097152)
    ),
    maxHistoryMessages: Math.round(
      clampNumber(
        raw?.maxHistoryMessages,
        DEFAULT_AI_CONFIG.maxHistoryMessages || 20,
        1,
        100
      )
    ),
    timeoutMs: Math.round(clampNumber(raw?.timeoutMs, DEFAULT_AI_CONFIG.timeoutMs, 3000, 180000)),
  };
}

export function mergeAiAgentConfig(prev: AiAgentConfig, incoming: Partial<AiAgentConfig>): AiAgentConfig {
  const nextProvider: AiProviderId = isValidAiProvider(incoming?.provider)
    ? incoming.provider
    : prev.provider;
  const entry = getProviderEntry(nextProvider);

  let nextBaseUrl = prev.baseUrl || '';
  if (incoming?.baseUrl !== undefined) {
    const trimmed = String(incoming.baseUrl || '').trim();
    nextBaseUrl = trimmed ? normalizeBaseUrl(nextProvider, trimmed) : '';
  } else if (nextProvider !== prev.provider) {
    nextBaseUrl = '';
  }

  let nextApiKey = '';
  if (incoming?.clearApiKey === true) {
    nextApiKey = '';
  } else if (typeof incoming?.apiKey === 'string' && incoming.apiKey.trim() !== '') {
    nextApiKey = incoming.apiKey.trim();
  } else if (nextProvider === prev.provider && nextProvider !== 'LOCAL_KB') {
    nextApiKey = String(prev.apiKey || '').trim();
  }

  const nextModel =
    incoming?.model !== undefined
      ? String(incoming.model || '').trim() || entry.defaultModel
      : nextProvider === prev.provider
        ? prev.model || entry.defaultModel
        : entry.defaultModel;

  const prevFbById = new Map<string, AiFallbackTarget>(
    (prev.fallbacks || []).map((f) => [f.id, f])
  );

  let nextFallbacks: AiFallbackTarget[] = prev.fallbacks || [];
  if (Array.isArray(incoming?.fallbacks)) {
    nextFallbacks = [];
    for (const rawFb of incoming.fallbacks.slice(0, MAX_FALLBACKS)) {
      if (!rawFb || !isExternalAiProvider(rawFb.provider)) continue;
      const fbEntry = getProviderEntry(rawFb.provider);
      const fbId = String(rawFb.id || '').trim() || crypto.randomUUID();
      const prevFb = prevFbById.get(fbId);

      const trimmedBase = String(rawFb.baseUrl || '').trim();
      const fbBaseUrl = trimmedBase ? normalizeBaseUrl(rawFb.provider, trimmedBase) : '';

      let fbApiKey = '';
      if (rawFb.clearApiKey === true) {
        fbApiKey = '';
      } else if (typeof rawFb.apiKey === 'string' && rawFb.apiKey.trim() !== '') {
        fbApiKey = rawFb.apiKey.trim();
      } else if (prevFb && prevFb.provider === rawFb.provider) {
        fbApiKey = String(prevFb.apiKey || '').trim();
      }

      nextFallbacks.push({
        id: fbId,
        enabled: rawFb.enabled !== undefined ? Boolean(rawFb.enabled) : true,
        provider: rawFb.provider,
        model: String(rawFb.model || '').trim() || fbEntry.defaultModel,
        baseUrl: fbBaseUrl,
        apiKey: fbApiKey,
      });
    }
  }

  return {
    enabled: incoming?.enabled !== undefined ? Boolean(incoming.enabled) : prev.enabled,
    name:
      incoming?.name !== undefined
        ? String(incoming.name || '').trim() || DEFAULT_AI_CONFIG.name
        : prev.name,
    persona: incoming?.persona !== undefined ? String(incoming.persona).trim() : prev.persona,
    personality:
      incoming?.personality !== undefined
        ? sanitizePersonality(incoming.personality, prev.personality || DEFAULT_PERSONALITY)
        : prev.personality || { ...DEFAULT_PERSONALITY },
    positivePrompt:
      incoming?.positivePrompt !== undefined
        ? String(incoming.positivePrompt).trim()
        : prev.positivePrompt,
    negativePrompt:
      incoming?.negativePrompt !== undefined
        ? String(incoming.negativePrompt).trim()
        : prev.negativePrompt,
    enabledBuiltinTools: sanitizeBuiltinTools(
      incoming?.enabledBuiltinTools,
      prev.enabledBuiltinTools || DEFAULT_AI_CONFIG.enabledBuiltinTools
    ),
    autoReplyDm:
      incoming?.autoReplyDm !== undefined ? Boolean(incoming.autoReplyDm) : prev.autoReplyDm,
    autoReplyComment:
      incoming?.autoReplyComment !== undefined
        ? Boolean(incoming.autoReplyComment)
        : prev.autoReplyComment,
    dmChannels: sanitizeChannelList(
      incoming?.dmChannels,
      AI_DM_CHANNELS,
      prev.dmChannels || [...AI_DM_CHANNELS]
    ),
    commentChannels: sanitizeChannelList(
      incoming?.commentChannels,
      AI_COMMENT_CHANNELS,
      prev.commentChannels || [...AI_COMMENT_CHANNELS]
    ),
    dmWahaSessions: sanitizeSessionList(incoming?.dmWahaSessions, prev.dmWahaSessions || []),
    dmScope: sanitizeDmScope(incoming?.dmScope, prev.dmScope || 'PERSONAL'),
    groupMentionOnly:
      incoming?.groupMentionOnly !== undefined
        ? Boolean(incoming.groupMentionOnly)
        : prev.groupMentionOnly ?? true,
    humanTyping:
      incoming?.humanTyping !== undefined ? Boolean(incoming.humanTyping) : prev.humanTyping ?? true,
    replyToNonPenilaian:
      incoming?.replyToNonPenilaian !== undefined
        ? Boolean(incoming.replyToNonPenilaian)
        : prev.replyToNonPenilaian ?? true,
    provider: nextProvider,
    model: nextModel,
    baseUrl: nextBaseUrl,
    apiKey: nextApiKey,
    fallbacks: nextFallbacks,
    fallbackToLocalKb:
      incoming?.fallbackToLocalKb !== undefined
        ? Boolean(incoming.fallbackToLocalKb)
        : prev.fallbackToLocalKb,
    temperature: clampNumber(
      incoming?.temperature !== undefined ? incoming.temperature : prev.temperature,
      DEFAULT_AI_CONFIG.temperature,
      0,
      1.5
    ),
    maxTokens: Math.round(
      clampNumber(
        incoming?.maxTokens !== undefined ? incoming.maxTokens : prev.maxTokens,
        DEFAULT_AI_CONFIG.maxTokens,
        64,
        131072
      )
    ),
    contextLength: Math.round(
      clampNumber(
        incoming?.contextLength !== undefined
          ? incoming.contextLength
          : prev.contextLength ?? DEFAULT_AI_CONFIG.contextLength ?? 32768,
        DEFAULT_AI_CONFIG.contextLength || 32768,
        2048,
        2097152
      )
    ),
    maxHistoryMessages: Math.round(
      clampNumber(
        incoming?.maxHistoryMessages !== undefined
          ? incoming.maxHistoryMessages
          : prev.maxHistoryMessages ?? DEFAULT_AI_CONFIG.maxHistoryMessages ?? 20,
        DEFAULT_AI_CONFIG.maxHistoryMessages || 20,
        1,
        100
      )
    ),
    timeoutMs: Math.round(
      clampNumber(
        incoming?.timeoutMs !== undefined ? incoming.timeoutMs : prev.timeoutMs,
        DEFAULT_AI_CONFIG.timeoutMs,
        3000,
        180000
      )
    ),
  };
}

export function sanitizeConfigForClient(cfg: AiAgentConfig): AiAgentConfig {
  return {
    ...cfg,
    hasApiKey: Boolean(cfg.apiKey),
    apiKeyPreview: maskApiKey(cfg.apiKey),
    apiKey: '',
    fallbacks: (cfg.fallbacks || []).map((fb) => ({
      id: fb.id,
      enabled: fb.enabled,
      provider: fb.provider,
      model: fb.model,
      baseUrl: fb.baseUrl || '',
      hasApiKey: Boolean(fb.apiKey),
      apiKeyPreview: maskApiKey(fb.apiKey),
      apiKey: '',
    })),
  };
}

export async function getAiAgentConfig(): Promise<AiAgentConfig> {
  const [configRow] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, 'ai_agent_config'));
  if (!configRow?.value) {
    return { ...DEFAULT_AI_CONFIG, fallbacks: [] };
  }
  try {
    return sanitizeStoredConfig(JSON.parse(configRow.value));
  } catch {
    return { ...DEFAULT_AI_CONFIG, fallbacks: [] };
  }
}

export function sanitizeAiError(err: any, apiKeyToScrub?: string): string {
  const status = err?.response?.status;
  const upstreamMsg =
    err?.response?.data?.error?.message ||
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.message ||
    'Permintaan API AI gagal';

  let msg = typeof upstreamMsg === 'string' ? upstreamMsg : JSON.stringify(upstreamMsg);
  if (err?.code === 'ECONNABORTED') {
    msg = `Timeout koneksi API AI (${msg})`;
  } else if (err?.code === 'ECONNREFUSED') {
    msg = 'Koneksi ke endpoint API AI ditolak (ECONNREFUSED)';
  }
  if (status && !msg.includes(String(status))) {
    msg = `HTTP ${status}: ${msg}`;
  }
  if (apiKeyToScrub && apiKeyToScrub.length >= 6) {
    msg = msg.split(apiKeyToScrub).join('[REDACTED]');
  }
  return msg.slice(0, 320);
}

function resolveBaseUrlSafe(provider: AiProviderId, baseUrl?: string): string {
  return normalizeBaseUrl(provider, baseUrl);
}

export function resolveSlotApiKey(params: {
  slotId?: string;
  provider: AiProviderId;
  baseUrl?: string;
  explicitApiKey?: string;
  clearApiKey?: boolean;
  savedConfig?: AiAgentConfig | null;
  extraCandidates?: Array<{ provider: AiProviderId; baseUrl?: string; apiKey?: string }>;
}): string {
  if (params.clearApiKey) return '';
  const explicit = String(params.explicitApiKey || '').trim();
  if (explicit) return explicit;

  const saved = params.savedConfig;
  if (params.provider === 'LOCAL_KB') return '';

  const targetBase = resolveBaseUrlSafe(params.provider, params.baseUrl);

  if (saved) {
    if (params.slotId && params.slotId !== 'primary') {
      const matchedFb = (saved.fallbacks || []).find((f) => f.id === params.slotId);
      if (matchedFb && matchedFb.provider === params.provider && matchedFb.apiKey) {
        return matchedFb.apiKey;
      }
    }

    if (
      saved.provider === params.provider &&
      resolveBaseUrlSafe(saved.provider, saved.baseUrl) === targetBase &&
      saved.apiKey
    ) {
      return saved.apiKey;
    }

    if (params.slotId === 'primary' && saved.provider === params.provider && saved.apiKey) {
      return saved.apiKey;
    }

    const matchingFallback = (saved.fallbacks || []).find(
      (f) =>
        f.provider === params.provider &&
        resolveBaseUrlSafe(f.provider, f.baseUrl) === targetBase &&
        Boolean(f.apiKey)
    );
    if (matchingFallback?.apiKey) {
      return matchingFallback.apiKey;
    }
  }

  for (const cand of params.extraCandidates || []) {
    if (
      cand.provider === params.provider &&
      resolveBaseUrlSafe(cand.provider, cand.baseUrl) === targetBase &&
      cand.apiKey?.trim()
    ) {
      return cand.apiKey.trim();
    }
  }

  return '';
}

function isOpenAIReasoningModel(model: string): boolean {
  return /^(o1|o3|o4|gpt-5)(-|$)/i.test(model.trim());
}

function shouldFilterOpenAIModel(provider: AiProviderId, modelId: string): boolean {
  if (provider !== 'OPENAI' && provider !== 'GROQ') return false;
  const lower = modelId.toLowerCase();
  const excluded = [
    'whisper',
    'tts-',
    'dall-e',
    'text-embedding',
    'embedding',
    'moderation',
    'omni-moderation',
    'babbage',
    'davinci',
    'gpt-image',
    'transcribe',
    'sora',
    'realtime',
  ];
  return excluded.some((prefix) => lower.includes(prefix));
}

function normalizeAnthropicMessages(
  history: AiConversationTurn[],
  latestMessage: string
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const combined: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  const allTurns = [
    ...history.filter((t) => t.content.trim()),
    { role: 'user' as const, content: latestMessage },
  ];

  for (const turn of allTurns) {
    if (combined.length === 0 && turn.role === 'assistant') {
      continue;
    }
    const prev = combined[combined.length - 1];
    if (prev && prev.role === turn.role) {
      prev.content = `${prev.content}\n\n${turn.content}`;
    } else {
      combined.push({ role: turn.role, content: turn.content });
    }
  }
  if (combined.length === 0) {
    combined.push({ role: 'user', content: latestMessage });
  }
  return combined;
}

function extractOpenAiContent(data: any): string {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('')
      .trim();
  }
  return '';
}

export async function listProviderModels(params: {
  provider: AiProviderId;
  baseUrl?: string;
  apiKey?: string;
}): Promise<{ models: AiModelOption[]; source: 'api' | 'recommended' }> {
  const entry = getProviderEntry(params.provider);
  if (params.provider === 'LOCAL_KB' || !entry.supportsModelFetch) {
    return { models: entry.recommendedModels, source: 'recommended' };
  }

  const effectiveBaseUrl = normalizeBaseUrl(params.provider, params.baseUrl);
  if (entry.requiresBaseUrl && !effectiveBaseUrl) {
    throw new Error(`Base URL wajib diisi untuk ${entry.label}`);
  }
  const cleanKey = String(params.apiKey || '').trim();
  if (entry.requiresApiKey && !cleanKey && params.provider !== 'OPENROUTER') {
    throw new Error(`API Key wajib diisi untuk memuat model dari ${entry.label}`);
  }

  try {
    if (entry.protocol === 'gemini') {
      const res = await axios.get(`${effectiveBaseUrl}/models`, {
        headers: cleanKey ? { 'x-goog-api-key': cleanKey } : undefined,
        params: { pageSize: 100 },
        timeout: 12000,
      });
      const rawModels = Array.isArray(res.data?.models) ? res.data.models : [];
      const models: AiModelOption[] = rawModels
        .filter((m: any) => {
          const methods = Array.isArray(m?.supportedGenerationMethods)
            ? m.supportedGenerationMethods
            : [];
          return methods.includes('generateContent');
        })
        .map((m: any) => {
          const id = String(m?.name || '').replace(/^models\//, '').trim();
          const label = String(m?.displayName || id).trim();
          return { id, label: label === id ? id : `${label} (${id})`, source: 'api' as const };
        })
        .filter((m: AiModelOption) => Boolean(m.id) && !/embedding|imagen|veo|aqa/i.test(m.id));

      if (models.length === 0) {
        return {
          models: entry.recommendedModels.map((m) => ({ ...m, source: 'recommended' })),
          source: 'recommended',
        };
      }
      return { models, source: 'api' };
    }

    if (entry.protocol === 'anthropic') {
      const res = await axios.get(`${effectiveBaseUrl}/models`, {
        headers: {
          'x-api-key': cleanKey,
          'anthropic-version': '2023-06-01',
        },
        params: { limit: 100 },
        timeout: 12000,
      });
      const rawModels = Array.isArray(res.data?.data) ? res.data.data : [];
      const models: AiModelOption[] = rawModels
        .map((m: any) => {
          const id = String(m?.id || '').trim();
          const name = String(m?.display_name || '').trim();
          return {
            id,
            label: name && name !== id ? `${name} (${id})` : id,
            source: 'api' as const,
          };
        })
        .filter((m: AiModelOption) => Boolean(m.id));

      if (models.length === 0) {
        return {
          models: entry.recommendedModels.map((m) => ({ ...m, source: 'recommended' })),
          source: 'recommended',
        };
      }
      return { models, source: 'api' };
    }

    const headers: Record<string, string> = {};
    if (cleanKey) {
      headers.Authorization = `Bearer ${cleanKey}`;
    }
    if (params.provider === 'OPENROUTER') {
      headers['HTTP-Referer'] = 'https://panel.reneo.my.id';
      headers['X-Title'] = 'Reneo CRM';
    }

    let rawList: any[] = [];
    try {
      const res = await axios.get(`${effectiveBaseUrl}/models`, { headers, timeout: 12000 });
      rawList = Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data?.models)
          ? res.data.models
          : [];
    } catch (firstErr) {
      if (params.provider === 'CUSTOM_OPENAI') {
        const origin = effectiveBaseUrl.replace(/\/v1$/i, '');
        const tagsRes = await axios
          .get(`${origin}/api/tags`, { headers, timeout: 8000 })
          .catch(() => null);
        if (tagsRes && Array.isArray(tagsRes.data?.models)) {
          rawList = tagsRes.data.models.map((m: any) => ({ id: m?.name || m?.model }));
        } else {
          throw firstErr;
        }
      } else {
        throw firstErr;
      }
    }

    const seen = new Set<string>();
    const models: AiModelOption[] = [];
    for (const item of rawList) {
      const id = String(item?.id || item?.name || '').trim();
      if (!id || seen.has(id) || shouldFilterOpenAIModel(params.provider, id)) continue;
      seen.add(id);
      const displayName = String(item?.name || '').trim();
      models.push({
        id,
        label: displayName && displayName !== id ? `${displayName} (${id})` : id,
        source: 'api',
      });
    }

    models.sort((a, b) => a.id.localeCompare(b.id));
    if (models.length === 0) {
      return {
        models: entry.recommendedModels.map((m) => ({ ...m, source: 'recommended' })),
        source: 'recommended',
      };
    }
    return { models: models.slice(0, 200), source: 'api' };
  } catch (err: any) {
    throw new Error(sanitizeAiError(err, cleanKey));
  }
}

export interface ExecutionTarget {
  role: 'PRIMARY' | 'FALLBACK' | 'LOCAL_KB';
  slotId: string;
  slotLabel: string;
  provider: AiProviderId;
  model: string;
  baseUrl: string;
  apiKey: string;
}

export function buildExecutionChain(cfg: AiAgentConfig): ExecutionTarget[] {
  const targets: ExecutionTarget[] = [];
  const primaryEntry = getProviderEntry(cfg.provider);
  const primaryBase = resolveBaseUrlSafe(cfg.provider, cfg.baseUrl);
  const primaryKey = String(cfg.apiKey || '').trim();

  targets.push({
    role: 'PRIMARY',
    slotId: 'primary',
    slotLabel: 'Utama',
    provider: cfg.provider,
    model: cfg.model || primaryEntry.defaultModel,
    baseUrl: primaryBase,
    apiKey: primaryKey,
  });

  const inheritedKeys = new Map<string, string>();
  if (primaryKey) {
    inheritedKeys.set(`${cfg.provider}|${primaryBase}`, primaryKey);
  }

  const seenSignatures = new Set<string>([
    `${cfg.provider}|${cfg.model || primaryEntry.defaultModel}|${primaryBase}|${primaryKey}`,
  ]);

  let fallbackNumber = 0;
  for (const fb of cfg.fallbacks || []) {
    if (fb.enabled === false) continue;
    fallbackNumber++;
    const fbEntry = getProviderEntry(fb.provider);
    const fbModel = fb.model || fbEntry.defaultModel;
    const fbBaseUrl = resolveBaseUrlSafe(fb.provider, fb.baseUrl);
    const keyScope = `${fb.provider}|${fbBaseUrl}`;
    let fbApiKey = String(fb.apiKey || '').trim();

    if (fbApiKey) {
      if (!inheritedKeys.has(keyScope)) {
        inheritedKeys.set(keyScope, fbApiKey);
      }
    } else if (inheritedKeys.has(keyScope)) {
      fbApiKey = inheritedKeys.get(keyScope) || '';
    }

    const sig = `${fb.provider}|${fbModel}|${fbBaseUrl}|${fbApiKey}`;
    if (seenSignatures.has(sig)) continue;
    seenSignatures.add(sig);

    targets.push({
      role: 'FALLBACK',
      slotId: fb.id,
      slotLabel: `Fallback #${fallbackNumber}`,
      provider: fb.provider,
      model: fbModel,
      baseUrl: fbBaseUrl,
      apiKey: fbApiKey,
    });
  }

  if (cfg.provider !== 'LOCAL_KB' && cfg.fallbackToLocalKb !== false) {
    targets.push({
      role: 'LOCAL_KB',
      slotId: 'local-kb',
      slotLabel: 'Knowledge Matcher (Lokal)',
      provider: 'LOCAL_KB',
      model: 'local-kb-matcher',
      baseUrl: '',
      apiKey: '',
    });
  }

  return targets;
}

function parseSafeJsonArgs(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, any>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function isToolsUnsupportedError(err: any): boolean {
  const status = err?.response?.status;
  if (status !== 400 && status !== 422) return false;
  const msg = String(
    err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || ''
  ).toLowerCase();
  return (
    msg.includes('tool') ||
    msg.includes('function calling') ||
    msg.includes('function_call') ||
    msg.includes('does not support')
  );
}

function parseDataUriImage(raw?: string | null): { mimeType: string; base64: string } | null {
  const trimmed = String(raw || '').trim();
  const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!match) return null;
  return { mimeType: match[1].toLowerCase(), base64: match[2].trim() };
}

function isVisionUnsupportedError(err: any): boolean {
  const status = err?.response?.status;
  if (status !== 400 && status !== 422) return false;
  const msg = String(
    err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || ''
  ).toLowerCase();
  return (
    msg.includes('image_url') ||
    msg.includes('image') ||
    msg.includes('vision') ||
    msg.includes('multimodal') ||
    msg.includes('content must be a string')
  );
}

const MAX_TOOL_ROUNDS = 5;

async function invokeExternalModelTarget(params: {
  target: ExecutionTarget;
  systemPrompt: string;
  history: AiConversationTurn[];
  message: string;
  imageUrl?: string | null;
  temperature: number;
  maxTokens: number;
  contextLength?: number;
  timeoutMs: number;
  toolRegistry?: AgentToolRegistry;
}): Promise<{ reply: string; toolCalls: AiToolCallTrace[] }> {
  const {
    target,
    systemPrompt,
    history,
    message,
    imageUrl,
    temperature,
    maxTokens,
    contextLength,
    timeoutMs,
    toolRegistry,
  } = params;
  const entry = getProviderEntry(target.provider);

  if (entry.requiresBaseUrl && !target.baseUrl) {
    throw new Error(`Base URL untuk ${entry.label} belum diisi`);
  }
  if (entry.requiresApiKey && !target.apiKey) {
    throw new Error(`API Key untuk ${entry.label} belum diisi`);
  }

  const baseUrl = target.baseUrl || entry.defaultBaseUrl;
  const modelName = target.model.trim() || entry.defaultModel;
  const toolDefs = toolRegistry?.definitions || [];
  const toolCalls: AiToolCallTrace[] = [];

  if (entry.protocol === 'gemini') {
    const cleanModel = modelName.replace(/^models\//, '');
    const buildGeminiParts = (text: string, img?: string | null) => {
      const parts: any[] = [{ text: text || '(lampiran gambar)' }];
      const parsedImg = parseDataUriImage(img);
      if (parsedImg) {
        parts.push({
          inlineData: {
            mimeType: parsedImg.mimeType,
            data: parsedImg.base64,
          },
        });
      }
      return parts;
    };

    const contents: any[] = [
      ...history
        .filter((h) => h.content.trim() || h.imageUrl)
        .map((h) => ({
          role: h.role === 'assistant' ? 'model' : 'user',
          parts: buildGeminiParts(h.content, h.imageUrl),
        })),
      { role: 'user', parts: buildGeminiParts(message, imageUrl) },
    ];

    const geminiTools =
      toolDefs.length > 0
        ? [
            {
              functionDeclarations: toolDefs.map((t) => ({
                name: t.llmName,
                description: t.description,
                parameters: sanitizeSchemaForGemini(t.parameters),
              })),
            },
          ]
        : undefined;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const body: Record<string, any> = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      };
      if (geminiTools && round < MAX_TOOL_ROUNDS) {
        body.tools = geminiTools;
      }

      const res = await axios.post(
        `${baseUrl}/models/${encodeURIComponent(cleanModel)}:generateContent`,
        body,
        { headers: { 'x-goog-api-key': target.apiKey }, timeout: timeoutMs }
      );

      const parts: any[] = Array.isArray(res.data?.candidates?.[0]?.content?.parts)
        ? res.data.candidates[0].content.parts
        : [];
      const fnCalls = parts.filter((p) => p?.functionCall?.name);

      if (fnCalls.length > 0 && toolRegistry && round < MAX_TOOL_ROUNDS) {
        contents.push({ role: 'model', parts });
        const fnResponses: any[] = [];
        const prevInspectedCount = toolRegistry.sideEffects.inspectedImages.length;
        for (const callPart of fnCalls) {
          const fnName = String(callPart.functionCall.name);
          const fnArgs = parseSafeJsonArgs(callPart.functionCall.args);
          const execRes = await toolRegistry.executeTool(fnName, fnArgs);
          toolCalls.push(execRes.trace);
          fnResponses.push({
            functionResponse: {
              name: fnName,
              response: { result: execRes.output },
            },
          });
        }
        const newImages = toolRegistry.sideEffects.inspectedImages.slice(prevInspectedCount);
        for (const img of newImages) {
          const parsed = parseDataUriImage(img.dataUri);
          if (parsed) {
            fnResponses.push({
              inlineData: {
                mimeType: parsed.mimeType,
                data: parsed.base64,
              },
            });
          }
        }
        contents.push({ role: 'user', parts: fnResponses });
        continue;
      }

      const reply = parts.map((p: any) => p?.text || '').join('').trim();
      if (!reply) {
        throw new Error('Respons model Gemini kosong');
      }
      return { reply, toolCalls };
    }

    throw new Error('Melebihi batas putaran pemanggilan tool Gemini');
  }

  if (entry.protocol === 'anthropic') {
    const messages: any[] = normalizeAnthropicMessages(history, message);
    const parsedLatestImg = parseDataUriImage(imageUrl);
    if (parsedLatestImg && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'user') {
        lastMsg.content = [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: parsedLatestImg.mimeType,
              data: parsedLatestImg.base64,
            },
          },
          { type: 'text', text: typeof lastMsg.content === 'string' ? lastMsg.content : message },
        ];
      }
    }

    const anthropicTools =
      toolDefs.length > 0
        ? toolDefs.map((t) => ({
            name: t.llmName,
            description: t.description,
            input_schema: t.parameters || { type: 'object', properties: {} },
          }))
        : undefined;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const body: Record<string, any> = {
        model: modelName,
        max_tokens: maxTokens,
        temperature: Math.min(1, Math.max(0, temperature)),
        system: systemPrompt,
        messages,
      };
      if (anthropicTools && round < MAX_TOOL_ROUNDS) {
        body.tools = anthropicTools;
      }

      const res = await axios.post(`${baseUrl}/messages`, body, {
        headers: {
          'x-api-key': target.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: timeoutMs,
      });

      const blocks: any[] = Array.isArray(res.data?.content) ? res.data.content : [];
      const toolUseBlocks = blocks.filter((b) => b?.type === 'tool_use' && b?.id && b?.name);

      if (toolUseBlocks.length > 0 && toolRegistry && round < MAX_TOOL_ROUNDS) {
        messages.push({ role: 'assistant', content: blocks });
        const resultBlocks: any[] = [];
        for (const blk of toolUseBlocks) {
          const execRes = await toolRegistry.executeTool(
            String(blk.name),
            parseSafeJsonArgs(blk.input)
          );
          toolCalls.push(execRes.trace);
          resultBlocks.push({
            type: 'tool_result',
            tool_use_id: blk.id,
            content: execRes.output,
          });
        }
        messages.push({ role: 'user', content: resultBlocks });
        continue;
      }

      const reply = blocks
        .filter((b: any) => b?.type === 'text')
        .map((b: any) => b?.text || '')
        .join('')
        .trim();
      if (!reply) {
        throw new Error('Respons model Anthropic kosong');
      }
      return { reply, toolCalls };
    }

    throw new Error('Melebihi batas putaran pemanggilan tool Anthropic');
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (target.apiKey) {
    headers.Authorization = `Bearer ${target.apiKey}`;
  }
  if (target.provider === 'OPENROUTER') {
    headers['HTTP-Referer'] = 'https://panel.reneo.my.id';
    headers['X-Title'] = 'Reneo CRM';
  }

  const buildOpenAiUserContent = (text: string, img?: string | null, useVision = true): any => {
    if (!useVision || !img) return text;
    return [
      { type: 'text', text: text || 'Mohon periksa gambar lampiran ini.' },
      { type: 'image_url', image_url: { url: img } },
    ];
  };

  let allowVision = Boolean(imageUrl || history.some((h) => Boolean(h.imageUrl)));

  const buildOpenAiInitialMessages = (useVision: boolean) => [
    { role: 'system', content: systemPrompt },
    ...history
      .filter((h) => h.content.trim() || h.imageUrl)
      .map((h) => ({
        role: h.role,
        content:
          h.role === 'user'
            ? buildOpenAiUserContent(h.content, h.imageUrl, useVision)
            : h.content,
      })),
    { role: 'user', content: buildOpenAiUserContent(message, imageUrl, useVision) },
  ];

  let messages: any[] = buildOpenAiInitialMessages(allowVision);

  const openaiTools =
    toolDefs.length > 0
      ? toolDefs.map((t) => ({
          type: 'function',
          function: {
            name: t.llmName,
            description: t.description,
            parameters: t.parameters || { type: 'object', properties: {} },
          },
        }))
      : undefined;

  let allowTools = Boolean(openaiTools);
  const isOllamaEndpoint =
    target.provider === 'CUSTOM_OPENAI' && /:11434(\/|$)/i.test(baseUrl);

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const payload: Record<string, unknown> = {
      model: modelName,
      messages,
    };

    if (target.provider === 'OPENAI' && isOpenAIReasoningModel(modelName)) {
      payload.max_completion_tokens = maxTokens;
    } else {
      payload.temperature = temperature;
      payload.max_tokens = maxTokens;
    }

    if (isOllamaEndpoint && contextLength && contextLength >= 2048) {
      payload.options = { num_ctx: contextLength };
    }

    if (allowTools && openaiTools && round < MAX_TOOL_ROUNDS) {
      payload.tools = openaiTools;
    }

    let res: any;
    try {
      res = await axios.post(`${baseUrl}/chat/completions`, payload, {
        headers,
        timeout: timeoutMs,
      });
    } catch (reqErr: any) {
      if (allowVision && round === 0 && isVisionUnsupportedError(reqErr)) {
        allowVision = false;
        messages = buildOpenAiInitialMessages(false);
        payload.messages = messages;
        res = await axios.post(`${baseUrl}/chat/completions`, payload, {
          headers,
          timeout: timeoutMs,
        });
      } else if (allowTools && round === 0 && isToolsUnsupportedError(reqErr)) {
        allowTools = false;
        delete payload.tools;
        res = await axios.post(`${baseUrl}/chat/completions`, payload, {
          headers,
          timeout: timeoutMs,
        });
      } else {
        throw reqErr;
      }
    }

    const msgObj = res.data?.choices?.[0]?.message;
    const rawToolCalls: any[] = Array.isArray(msgObj?.tool_calls) ? msgObj.tool_calls : [];

    if (rawToolCalls.length > 0 && toolRegistry && round < MAX_TOOL_ROUNDS) {
      messages.push({
        role: 'assistant',
        content: msgObj?.content ?? null,
        tool_calls: rawToolCalls,
      });
      const prevInspected = toolRegistry.sideEffects.inspectedImages.length;
      for (const tc of rawToolCalls) {
        const fnName = String(tc?.function?.name || '');
        const fnArgs = parseSafeJsonArgs(tc?.function?.arguments);
        const execRes = await toolRegistry.executeTool(fnName, fnArgs);
        toolCalls.push(execRes.trace);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id || `call_${Date.now()}`,
          content: execRes.output,
        });
      }
      const newlyInspected = toolRegistry.sideEffects.inspectedImages.slice(prevInspected);
      if (allowVision && newlyInspected.length > 0) {
        messages.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Berikut lampiran gambar pelanggan (${newlyInspected.map((i) => i.label || 'foto').join(', ')}) untuk dianalisis:`,
            },
            ...newlyInspected.map((img) => ({
              type: 'image_url',
              image_url: { url: img.dataUri },
            })),
          ],
        });
      }
      continue;
    }

    const reply = extractOpenAiContent(res.data);
    if (!reply) {
      throw new Error(`Respons model ${entry.label} (${modelName}) kosong`);
    }
    return { reply, toolCalls };
  }

  throw new Error(`Melebihi batas putaran pemanggilan tool ${entry.label}`);
}

export interface AiKnowledgeBookRecord {
  id: string;
  title: string;
  isActive?: boolean;
}

export interface AiKnowledgeRecord {
  id?: string;
  bookId?: string | null;
  bookTitle?: string | null;
  title: string;
  category: string;
  content: string;
  sourceUrl?: string | null;
  isActive?: boolean;
}

export interface AiSkillRecord {
  id?: string;
  slug: string;
  name: string;
  description?: string | null;
  triggerHint?: string | null;
  instructions: string;
  linkedTools?: string[];
  isActive?: boolean;
}

function buildPersonalityInstructions(cfg: AiAgentConfig, contactName?: string | null): string[] {
  const p = cfg.personality || DEFAULT_PERSONALITY;
  const toneLabels: Record<AiPersonalityProfile['tone'], string> = {
    PROFESSIONAL: 'Profesional, sopan, dan terpercaya.',
    FRIENDLY: 'Hangat, ramah, dan membantu seperti sahabat bisnis.',
    FORMAL: 'Resmi, baku, dan sangat sopan.',
    CASUAL: 'Santai, ringan, namun tetap sopan (cocok untuk chat sosial).',
    EMPATHETIC: 'Penuh empati, sabar, dan menenangkan pelanggan.',
  };
  const langLabels: Record<AiPersonalityProfile['language'], string> = {
    INDONESIAN: 'Selalu gunakan Bahasa Indonesia yang baik dan natural.',
    ENGLISH: 'Always reply in natural, polite English.',
    BILINGUAL: 'Gunakan Bahasa Indonesia secara default, atau Inggris jika lebih sesuai konteks.',
    MATCH_USER: 'Ikuti bahasa pesan pelanggan secara otomatis (Indonesia/Inggris/daerah yang sopan).',
  };
  const lenLabels: Record<AiPersonalityProfile['responseLength'], string> = {
    CONCISE: 'Jawab singkat, padat, langsung ke inti masalah.',
    BALANCED: 'Jawab terstruktur dengan penjelasan secukupnya.',
    DETAILED: 'Berikan penjelasan yang menyeluruh dan lengkap.',
  };
  const emojiLabels: Record<AiPersonalityProfile['emojiUsage'], string> = {
    NONE: 'Jangan gunakan emoji sama sekali.',
    MINIMAL: 'Gunakan emoji secara sangat hemat (maksimal 1 jika perlu).',
    MODERATE: 'Gunakan emoji ringan seperlunya untuk kesan ramah.',
  };

  const lines = [
    `Nama Agent: ${cfg.name}`,
    p.roleTitle ? `Peran: ${p.roleTitle}` : '',
    cfg.persona ? `Kepribadian & Latar Belakang: ${cfg.persona}` : '',
    `Nada Komunikasi: ${toneLabels[p.tone]}`,
    `Bahasa: ${langLabels[p.language]}`,
    `Gaya Panjang Jawaban: ${lenLabels[p.responseLength]}`,
    `Penggunaan Emoji: ${emojiLabels[p.emojiUsage]}`,
  ];

  const cleanContact = contactName ? contactName.trim() : '';
  if (p.greetingStyle) {
    lines.push(
      `Contoh Gaya Sapaan: "${p.greetingStyle.replace(/\{nama\}/gi, cleanContact || 'Kak')}"`
    );
  }
  if (p.closingStyle) {
    lines.push(`Gaya Penutup Pesan: "${p.closingStyle}"`);
  }
  return lines.filter(Boolean);
}

function generateLocalKbReply(
  cfg: AiAgentConfig,
  message: string,
  kbItems: AiKnowledgeRecord[],
  contactName?: string | null
): { reply: string; matchedKb: boolean } {
  const tokens = message
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);

  let bestItem: AiKnowledgeRecord | null = null;
  let bestScore = 0;

  for (const item of kbItems) {
    const haystack = `${item.title} ${item.content}`.toLowerCase();
    const score = tokens.reduce((acc, tok) => (haystack.includes(tok) ? acc + 1 : acc), 0);
    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  const greetingRaw = cfg.personality?.greetingStyle?.trim();
  const prefix = greetingRaw
    ? `${greetingRaw.replace(/\{nama\}/gi, contactName?.trim() || 'Kak')} `
    : 'Halo! ';
  const closing = cfg.personality?.closingStyle?.trim()
    ? `\n\n${cfg.personality.closingStyle.trim()}`
    : '';

  const replyText = bestItem
    ? `${prefix}Berdasarkan ${bestItem.title}${bestItem.bookTitle ? ` (${bestItem.bookTitle})` : ` (${bestItem.category})`}: ${bestItem.content}${closing}`
    : `${prefix}Saya ${cfg.name}. Terima kasih sudah menghubungi kami! Tim kami akan segera membantu pertanyaan Anda terkait "${message}".${closing}`;

  return { reply: replyText, matchedKb: Boolean(bestItem) };
}

// Pastikan pelanggan menerima nomor antrean walau model tidak menyebutkannya
function appendEscalationQueueNotice(
  reply: string,
  escalation?: { queueNo: number; queueTotal: number; slaTarget: number } | null
): string {
  if (!escalation) return reply;
  if (/antre/i.test(reply) && reply.includes(`#${escalation.queueNo}`)) return reply;
  return `${reply}\n\nPercakapan Anda sudah diteruskan ke tim kami. Nomor antrean Anda: #${escalation.queueNo} dari ${escalation.queueTotal}. Target respons tim sekitar ${escalation.slaTarget} menit.`;
}

function parseSkillTools(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x));
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function generateAiAgentReply(
  message: string,
  options?: {
    history?: AiConversationTurn[];
    imageUrl?: string | null;
    mediaName?: string | null;
    replyToMessageId?: string | null;
    contactName?: string | null;
    contactPhone?: string | null;
    channel?: string | null;
    conversationId?: string | null;
    isComment?: boolean;
    isSimulator?: boolean;
    configOverride?: AiAgentConfig;
    kbBooksOverride?: AiKnowledgeBookRecord[];
    kbItemsOverride?: AiKnowledgeRecord[];
    skillsOverride?: AiSkillRecord[];
    mcpServersOverride?: McpServerConfigRecord[];
    customToolExecutor?: (def: any, args: Record<string, any>) => Promise<{ ok: boolean; output: string }>;
  }
): Promise<AiGenerationResult> {
  const cfg = options?.configOverride || (await getAiAgentConfig());

  let books: AiKnowledgeBookRecord[] = options?.kbBooksOverride || [];
  let rawItems: AiKnowledgeRecord[] = options?.kbItemsOverride || [];
  if (options?.kbItemsOverride === undefined) {
    const [dbBooks, dbItems] = await Promise.all([
      db.select().from(aiKnowledgeBooks),
      db.select().from(aiKnowledgeItems).where(eq(aiKnowledgeItems.isActive, true)),
    ]);
    books = dbBooks;
    rawItems = dbItems;
  }

  const allBookIds = new Set(books.map((b) => b.id));
  const activeBookMap = new Map(
    books.filter((b) => b.isActive !== false).map((b) => [b.id, b.title])
  );
  const kbItems: AiKnowledgeRecord[] = rawItems
    .filter((item) => {
      if (item.isActive === false) return false;
      if (!item.bookId) return true;
      if (!allBookIds.has(item.bookId)) return true;
      return activeBookMap.has(item.bookId);
    })
    .map((item) => ({
      ...item,
      bookTitle: item.bookId ? activeBookMap.get(item.bookId) || null : null,
    }));

  let activeSkills: AiSkillRecord[] = [];
  if (options?.skillsOverride !== undefined) {
    activeSkills = options.skillsOverride.filter((s) => s.isActive !== false);
  } else {
    const skillRows = await db.select().from(aiSkills).where(eq(aiSkills.isActive, true));
    activeSkills = skillRows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      triggerHint: row.triggerHint,
      instructions: row.instructions,
      linkedTools: parseSkillTools(row.linkedTools),
      isActive: row.isActive,
    }));
  }

  const mcpServers =
    options?.mcpServersOverride !== undefined
      ? options.mcpServersOverride
      : await loadActiveMcpServers();

  const effectiveContextLength = clampNumber(cfg.contextLength, 32768, 2048, 2097152);
  const maxHistoryTurns = clampNumber(cfg.maxHistoryMessages, 20, 1, 100);
  const rawHistory = (options?.history || []).slice(-maxHistoryTurns);

  // Trim history characters so history + KB fit comfortably inside contextLength
  const maxHistoryCharBudget = Math.max(4000, Math.floor(effectiveContextLength * 1.8));
  let usedHistoryChars = 0;
  const trimmedHistoryReversed: AiConversationTurn[] = [];
  for (let i = rawHistory.length - 1; i >= 0; i--) {
    const turn = rawHistory[i];
    const len = (turn.content || '').length;
    if (trimmedHistoryReversed.length > 0 && usedHistoryChars + len > maxHistoryCharBudget) {
      break;
    }
    usedHistoryChars += len;
    trimmedHistoryReversed.push(turn);
  }
  const effectiveHistory = trimmedHistoryReversed.reverse();

  const linkedToolsFromSkills = activeSkills.flatMap((s) => s.linkedTools || []);
  const toolRegistry = buildAgentToolRegistry({
    enabledBuiltinTools: cfg.enabledBuiltinTools || [],
    linkedToolsFromSkills,
    mcpServers,
    context: {
      conversationId: options?.conversationId,
      contactName: options?.contactName,
      contactPhone: options?.contactPhone,
      isSimulator: options?.isSimulator,
      simulatorHistory: [
        ...effectiveHistory,
        {
          id: `sim_msg_${effectiveHistory.length + 1}`,
          role: 'user',
          content: message,
          imageUrl: options?.imageUrl || null,
          mediaName: options?.mediaName || null,
          replyToMessageId: options?.replyToMessageId || null,
        },
      ],
      latestCustomerImage: options?.imageUrl || null,
      latestCustomerMediaName: options?.mediaName || null,
    },
    customExecutor: options?.customToolExecutor,
  });

  if (options?.replyToMessageId && !toolRegistry.sideEffects.replyToMessageId) {
    toolRegistry.sideEffects.replyToMessageId = options.replyToMessageId;
  }

  const maxKbCharBudget = Math.min(
    160000,
    Math.max(12000, Math.floor(effectiveContextLength * 1.5))
  );
  const kbContext = kbItems
    .map((k) =>
      k.bookTitle
        ? `[Buku: ${k.bookTitle} | ${k.category}] ${k.title}: ${k.content}`
        : `[${k.category}] ${k.title}: ${k.content}`
    )
    .join('\n\n')
    .slice(0, maxKbCharBudget);

  const skillContext = activeSkills
    .map((s) =>
      [
        `### Skill: ${s.name}`,
        s.triggerHint ? `Kondisi Pemicu: ${s.triggerHint}` : '',
        `Panduan Eksekusi:\n${s.instructions}`,
      ]
        .filter(Boolean)
        .join('\n')
    )
    .join('\n\n');

  const channelInfo = options?.channel ? `Kanal Percakapan: ${options.channel}` : '';
  const contactInfo = options?.contactName ? `Nama Pelanggan: ${options.contactName}` : '';
  const mediaAttachedInfo = options?.imageUrl
    ? `Lampiran Pelanggan Saat Ini: Gambar/Foto (${options.mediaName || 'foto-pelanggan.jpg'}) telah dilampirkan di pesan ini.`
    : '';
  const commentRule = options?.isComment
    ? 'Konteks: Ini adalah balasan komentar publik media sosial; jawab singkat, sopan, dan ajak lanjut ke DM bila perlu.'
    : '';

  const systemSections = [
    `[IDENTITAS & PERSONALITY]\n${buildPersonalityInstructions(cfg, options?.contactName).join('\n')}`,
    channelInfo || contactInfo || mediaAttachedInfo || commentRule
      ? `[KONTEKS INTERAKSI]\n${[channelInfo, contactInfo, mediaAttachedInfo, commentRule].filter(Boolean).join('\n')}`
      : '',
    cfg.positivePrompt?.trim()
      ? `[ARAHAN POSITIF / POSITIVE PROMPT - UTAMAKAN]\n${cfg.positivePrompt.trim()}`
      : '',
    cfg.negativePrompt?.trim()
      ? `[BATASAN & LARANGAN / NEGATIVE PROMPT - PATUHI KERAS]\n${cfg.negativePrompt.trim()}`
      : `[BATASAN & LARANGAN]\nJangan mengarang harga, promo, atau kebijakan yang tidak tercantum di Knowledge Book atau hasil tool.`,
    skillContext ? `[SKILL AKTIF YANG TERPASANG]\n${skillContext}` : '',
    toolRegistry.definitions.length > 0
      ? `[TOOL MCP & CRM TERSEDIA]\nAnda memiliki akses tool fungsi (${toolRegistry.definitions.map((t) => t.llmName).join(', ')}). Gunakan tool bila perlu memeriksa katalog produk, membaca riwayat WhatsApp, memeriksa foto pelanggan, mengutip/reply pesan spesifik, mengirim foto/brosur dari Galeri Media, menyimpan catatan/label pelanggan, atau eskalasi ke agen manusia. Saat memanggil eskalasi, WAJIB isi reason dan summary (kesimpulan percakapan, kebutuhan pelanggan, langkah yang sudah dicoba, dan tindak lanjut untuk agen). Setelah eskalasi, beri tahu pelanggan nomor antrean dan estimasi tunggu sesuai hasil tool.`
      : '',
    `[KNOWLEDGE BOOK AKTIF]\n${kbContext || 'Belum ada materi di Knowledge Book.'}`,
  ];

  const systemPrompt = systemSections.filter(Boolean).join('\n\n');

  const chain = buildExecutionChain(cfg);
  const attempts: AiAttemptTrace[] = [];

  for (const target of chain) {
    const entry = getProviderEntry(target.provider);
    const started = Date.now();

    if (target.provider === 'LOCAL_KB') {
      const localRes = generateLocalKbReply(cfg, message, kbItems, options?.contactName);
      attempts.push({
        role: target.role,
        slotId: target.slotId,
        slotLabel: target.slotLabel,
        provider: 'LOCAL_KB',
        providerLabel: entry.label,
        model: target.model,
        ok: true,
        durationMs: Date.now() - started,
      });
      return {
        config: cfg,
        reply: localRes.reply,
        source: 'LOCAL_KB',
        providerLabel: entry.label,
        model: target.model,
        fallbackUsed: attempts.some((a) => !a.ok),
        matchedKb: localRes.matchedKb,
        attempts,
        toolCalls: [],
        outboundMedia: toolRegistry.sideEffects.outboundMedia,
        replyToMessageId: toolRegistry.sideEffects.replyToMessageId,
        replyToPreview: toolRegistry.sideEffects.replyToPreview,
        escalation: toolRegistry.sideEffects.escalation || null,
      };
    }

    try {
      const invocation = await invokeExternalModelTarget({
        target,
        systemPrompt,
        history: effectiveHistory,
        message,
        imageUrl: options?.imageUrl || null,
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
        contextLength: effectiveContextLength,
        timeoutMs: cfg.timeoutMs,
        toolRegistry: toolRegistry.definitions.length > 0 ? toolRegistry : undefined,
      });
      attempts.push({
        role: target.role,
        slotId: target.slotId,
        slotLabel: target.slotLabel,
        provider: target.provider,
        providerLabel: entry.label,
        model: target.model,
        ok: true,
        durationMs: Date.now() - started,
      });
      return {
        config: cfg,
        reply: appendEscalationQueueNotice(invocation.reply, toolRegistry.sideEffects.escalation),
        source: target.provider,
        providerLabel: entry.label,
        model: target.model,
        fallbackUsed: target.role !== 'PRIMARY' || attempts.some((a) => !a.ok),
        matchedKb: true,
        attempts,
        toolCalls: invocation.toolCalls,
        outboundMedia: toolRegistry.sideEffects.outboundMedia,
        replyToMessageId: toolRegistry.sideEffects.replyToMessageId,
        replyToPreview: toolRegistry.sideEffects.replyToPreview,
        escalation: toolRegistry.sideEffects.escalation || null,
      };
    } catch (err: any) {
      const cleanError = sanitizeAiError(err, target.apiKey);
      attempts.push({
        role: target.role,
        slotId: target.slotId,
        slotLabel: target.slotLabel,
        provider: target.provider,
        providerLabel: entry.label,
        model: target.model,
        ok: false,
        durationMs: Date.now() - started,
        error: cleanError,
      });
      console.warn(
        `[AiService] ${target.slotLabel} (${target.provider}/${target.model}) failed: ${cleanError}`
      );
    }
  }

  const summary = attempts
    .map((a) => `${a.slotLabel} (${a.providerLabel}/${a.model}): ${a.error || 'gagal'}`)
    .join(' | ');
  const finalError = new Error(`Semua provider AI gagal merespons. ${summary}`);
  (finalError as any).attempts = attempts;
  throw finalError;
}

export async function verifySingleAiSlot(params: {
  provider: AiProviderId;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}): Promise<{ ok: boolean; provider: AiProviderId; providerLabel: string; model: string; durationMs: number; replyPreview?: string; error?: string }> {
  const entry = getProviderEntry(params.provider);
  const started = Date.now();
  const model = params.model.trim() || entry.defaultModel;

  if (params.provider === 'LOCAL_KB') {
    return {
      ok: true,
      provider: 'LOCAL_KB',
      providerLabel: entry.label,
      model,
      durationMs: Date.now() - started,
      replyPreview: 'Knowledge Matcher Lokal aktif.',
    };
  }

  try {
    const resolvedBase = resolveBaseUrlSafe(params.provider, params.baseUrl);
    const { reply } = await invokeExternalModelTarget({
      target: {
        role: 'PRIMARY',
        slotId: 'verify',
        slotLabel: 'Verifikasi',
        provider: params.provider,
        model,
        baseUrl: resolvedBase,
        apiKey: String(params.apiKey || '').trim(),
      },
      systemPrompt: 'Balas singkat dengan "Koneksi OK".',
      history: [],
      message: 'Tes koneksi model AI CRM.',
      temperature: 0,
      maxTokens: 60,
      timeoutMs: clampNumber(params.timeoutMs, 15000, 3000, 60000),
    });

    return {
      ok: true,
      provider: params.provider,
      providerLabel: entry.label,
      model,
      durationMs: Date.now() - started,
      replyPreview: reply.slice(0, 120),
    };
  } catch (err: any) {
    return {
      ok: false,
      provider: params.provider,
      providerLabel: entry.label,
      model,
      durationMs: Date.now() - started,
      error: sanitizeAiError(err, params.apiKey),
    };
  }
}
