import React, { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import {
  AiAgentConfig,
  AiFallbackTarget,
  AiKnowledgeBook,
  AiKnowledgeBookPreset,
  AiKnowledgeItem,
  AiMcpServer,
  AiModelOption,
  AiProviderCatalogEntry,
  AiProviderId,
  AiSimulatorChatTurn,
  AiSkill,
  AiSkillPreset,
  AiSlotVerifyResult,
  AiTestResult,
  AuthStatus,
  BuiltinCrmTool,
  ExternalAiProviderId,
} from '../types';
import { hasPerm } from '../lib/permissions';
import { useToast } from '../components/ui/ToastProvider';
import { LoadingState, ErrorState } from '../components/ui/StateBlocks';
import { AiModelConfigPanel } from '../components/ai/AiModelConfigPanel';
import { AiPersonalityPromptPanel } from '../components/ai/AiPersonalityPromptPanel';
import { AiKnowledgeBooksPanel } from '../components/ai/AiKnowledgeBooksPanel';
import { AiSkillsMcpPanel } from '../components/ai/AiSkillsMcpPanel';
import { AiTestSimulatorPanel } from '../components/ai/AiTestSimulatorPanel';

const FALLBACK_CATALOG: AiProviderCatalogEntry[] = [
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
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { id: 'gpt-4o', label: 'GPT-4o' },
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
      { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' },
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
    recommendedModels: [{ id: 'llama3.1', label: 'llama3.1' }],
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

const DEFAULT_FORM_CONFIG: AiAgentConfig = {
  enabled: false,
  name: 'Asisten CRM',
  persona: 'Ramah, ringkas, profesional, dan selalu merujuk pada Knowledge Book perusahaan.',
  personality: {
    roleTitle: 'Customer Service & Konsultan CRM',
    tone: 'PROFESSIONAL',
    language: 'MATCH_USER',
    responseLength: 'CONCISE',
    emojiUsage: 'MINIMAL',
    greetingStyle: '',
    closingStyle: '',
  },
  positivePrompt: '',
  negativePrompt: '',
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
  dmChannels: ['WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'THREADS', 'TELEGRAM'],
  commentChannels: ['INSTAGRAM', 'FACEBOOK', 'THREADS'],
  dmWahaSessions: [],
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

type AiTabId = 'personality' | 'models' | 'knowledge' | 'skills-mcp' | 'simulator';

function normalizeConfigState(cfg?: Partial<AiAgentConfig> | null): AiAgentConfig {
  return {
    ...DEFAULT_FORM_CONFIG,
    ...cfg,
    personality: {
      ...DEFAULT_FORM_CONFIG.personality,
      ...(cfg?.personality || {}),
    },
    enabledBuiltinTools: Array.isArray(cfg?.enabledBuiltinTools)
      ? cfg.enabledBuiltinTools
      : DEFAULT_FORM_CONFIG.enabledBuiltinTools,
    fallbacks: Array.isArray(cfg?.fallbacks) ? cfg.fallbacks : [],
    dmChannels: Array.isArray(cfg?.dmChannels) ? cfg.dmChannels : DEFAULT_FORM_CONFIG.dmChannels,
    commentChannels: Array.isArray(cfg?.commentChannels)
      ? cfg.commentChannels
      : DEFAULT_FORM_CONFIG.commentChannels,
    dmWahaSessions: Array.isArray(cfg?.dmWahaSessions) ? cfg.dmWahaSessions : [],
  };
}

export const AiAgent: React.FC<{ currentUser?: AuthStatus['user'] | null }> = ({ currentUser }) => {
  const toast = useToast();
  const canEdit = hasPerm(currentUser, 'settings.edit');
  const [activeTab, setActiveTab] = useState<AiTabId>('personality');
  const [catalog, setCatalog] = useState<AiProviderCatalogEntry[]>(FALLBACK_CATALOG);
  const [config, setConfig] = useState<AiAgentConfig>(DEFAULT_FORM_CONFIG);

  const [books, setBooks] = useState<AiKnowledgeBook[]>([]);
  const [bookPresets, setBookPresets] = useState<AiKnowledgeBookPreset[]>([]);
  const [knowledge, setKnowledge] = useState<AiKnowledgeItem[]>([]);

  const [skills, setSkills] = useState<AiSkill[]>([]);
  const [skillPresets, setSkillPresets] = useState<AiSkillPreset[]>([]);
  const [builtinTools, setBuiltinTools] = useState<BuiltinCrmTool[]>([]);
  const [mcpServers, setMcpServers] = useState<AiMcpServer[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const [fetchedModelsMap, setFetchedModelsMap] = useState<Record<string, AiModelOption[]>>({});
  const [manualModelSlots, setManualModelSlots] = useState<Record<string, boolean>>({});
  const [fetchingSlotId, setFetchingSlotId] = useState<string | null>(null);
  const [verifyingSlotId, setVerifyingSlotId] = useState<string | null>(null);
  const [verifyResults, setVerifyResults] = useState<Record<string, AiSlotVerifyResult | null>>({});

  const [testMessage, setTestMessage] = useState('');
  const [testResult, setTestResult] = useState<AiTestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [chatTurns, setChatTurns] = useState<AiSimulatorChatTurn[]>([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [
        providers,
        cfg,
        bookList,
        bookCat,
        kbItems,
        skillList,
        skillCat,
        mcpData,
      ] = await Promise.all([
        api.getAiProviders().catch(() => FALLBACK_CATALOG),
        api.getAiAgentConfig(),
        api.getAiKnowledgeBooks().catch(() => []),
        api.getAiKnowledgeBooksCatalog().catch(() => []),
        api.getAiKnowledge(),
        api.getAiSkills().catch(() => []),
        api.getAiSkillsCatalog().catch(() => []),
        api.getAiMcpServers().catch(() => ({ builtinTools: [], servers: [] })),
      ]);
      if (providers && providers.length > 0) setCatalog(providers);
      setConfig(normalizeConfigState(cfg));
      setBooks(bookList || []);
      setBookPresets(bookCat || []);
      setKnowledge(kbItems || []);
      setSkills(skillList || []);
      setSkillPresets(skillCat || []);
      setBuiltinTools(mcpData.builtinTools || []);
      setMcpServers(mcpData.servers || []);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal memuat Agent AI, Knowledge Book & Skill');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const refreshKnowledgeOnly = useCallback(async () => {
    const [bookList, kbItems] = await Promise.all([
      api.getAiKnowledgeBooks(),
      api.getAiKnowledge(),
    ]);
    setBooks(bookList || []);
    setKnowledge(kbItems || []);
  }, []);

  const refreshSkillsAndMcpOnly = useCallback(async () => {
    const [skillList, mcpData] = await Promise.all([
      api.getAiSkills(),
      api.getAiMcpServers(),
    ]);
    setSkills(skillList || []);
    setBuiltinTools(mcpData.builtinTools || []);
    setMcpServers(mcpData.servers || []);
  }, []);

  const collectExtraCandidates = useCallback(() => {
    const candidates: Array<{ provider: AiProviderId; baseUrl?: string; apiKey?: string }> = [];
    if (config.provider !== 'LOCAL_KB' && config.apiKey?.trim()) {
      candidates.push({
        provider: config.provider,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey.trim(),
      });
    }
    for (const fb of config.fallbacks) {
      if (fb.apiKey?.trim()) {
        candidates.push({
          provider: fb.provider,
          baseUrl: fb.baseUrl,
          apiKey: fb.apiKey.trim(),
        });
      }
    }
    return candidates;
  }, [config.apiKey, config.baseUrl, config.fallbacks, config.provider]);

  const handleFetchModels = async (slot: {
    slotId: string;
    provider: AiProviderId;
    baseUrl?: string;
    apiKey?: string;
    clearApiKey?: boolean;
    currentModel?: string;
    onSelectDefault?: (firstId: string) => void;
  }) => {
    setFetchingSlotId(slot.slotId);
    try {
      const res = await api.fetchAiProviderModels({
        slotId: slot.slotId,
        provider: slot.provider,
        baseUrl: slot.baseUrl,
        apiKey: slot.apiKey,
        clearApiKey: slot.clearApiKey,
        extraCandidates: collectExtraCandidates(),
      });
      const cacheKey = `${slot.slotId}:${slot.provider}:${(slot.baseUrl || '').trim()}`;
      setFetchedModelsMap((prev) => ({ ...prev, [cacheKey]: res.models || [] }));
      setManualModelSlots((prev) => ({ ...prev, [slot.slotId]: false }));

      if (res.models.length > 0 && slot.onSelectDefault) {
        const currentExists = res.models.some((m) => m.id === slot.currentModel);
        const providerDefault = catalog.find((c) => c.id === slot.provider)?.defaultModel;
        if (!currentExists && (!slot.currentModel || slot.currentModel === providerDefault)) {
          slot.onSelectDefault(res.models[0].id);
        }
      }

      toast.success(
        res.source === 'api'
          ? `Berhasil memuat ${res.models.length} model dari API provider`
          : `Menampilkan ${res.models.length} model rekomendasi`
      );
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Gagal memuat daftar model');
    } finally {
      setFetchingSlotId(null);
    }
  };

  const handleVerifySlot = async (slot: {
    slotId: string;
    provider: AiProviderId;
    model: string;
    baseUrl?: string;
    apiKey?: string;
    clearApiKey?: boolean;
  }) => {
    setVerifyingSlotId(slot.slotId);
    setVerifyResults((prev) => ({ ...prev, [slot.slotId]: null }));
    try {
      const res = await api.verifyAiProviderSlot({
        slotId: slot.slotId,
        provider: slot.provider,
        model: slot.model,
        baseUrl: slot.baseUrl,
        apiKey: slot.apiKey,
        clearApiKey: slot.clearApiKey,
        timeoutMs: config.timeoutMs,
        extraCandidates: collectExtraCandidates(),
      });
      setVerifyResults((prev) => ({ ...prev, [slot.slotId]: res }));
      if (res.ok) {
        toast.success(`${res.providerLabel} (${res.model}) terhubung (${res.durationMs}ms)`);
      } else {
        toast.error(res.error || 'Uji koneksi provider gagal');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menguji koneksi provider AI');
    } finally {
      setVerifyingSlotId(null);
    }
  };

  const handleAddFallback = () => {
    if (config.fallbacks.length >= 10) {
      toast.error('Maksimal 10 rute fallback AI');
      return;
    }
    const usedProviders = new Set<AiProviderId>([
      config.provider,
      ...config.fallbacks.map((f) => f.provider),
    ]);
    const externalOptions = catalog.filter((c) => c.id !== 'LOCAL_KB');
    const suggested =
      externalOptions.find((c) => !usedProviders.has(c.id)) ||
      externalOptions.find((c) => c.id === 'GEMINI') ||
      externalOptions[0];

    const fallbackId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const nextFallback: AiFallbackTarget = {
      id: fallbackId,
      enabled: true,
      provider: (suggested?.id || 'GEMINI') as ExternalAiProviderId,
      model: suggested?.defaultModel || 'gemini-2.5-flash',
      baseUrl: '',
      apiKey: '',
      hasApiKey: false,
      apiKeyPreview: '',
    };

    setConfig((prev) => ({
      ...prev,
      fallbacks: [...prev.fallbacks, nextFallback],
    }));
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const saved = await api.saveAiAgentConfig(config);
      setConfig(normalizeConfigState(saved));
      toast.success('Konfigurasi Agent AI disimpan');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan konfigurasi Agent AI');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSaveBuiltinTools = async (nextTools: string[]) => {
    setConfig((prev) => ({ ...prev, enabledBuiltinTools: nextTools }));
    try {
      const saved = await api.saveAiAgentConfig({ enabledBuiltinTools: nextTools });
      setConfig((prev) => ({
        ...prev,
        enabledBuiltinTools: saved.enabledBuiltinTools || nextTools,
      }));
      toast.success('Akses Tool Internal CRM diperbarui');
    } catch {
      toast.error('Gagal menyimpan konfigurasi tool CRM');
    }
  };

  const handleToggleAgentEnabled = async (checked: boolean) => {
    setConfig((prev) => ({ ...prev, enabled: checked }));
    try {
      const saved = await api.saveAiAgentConfig({ enabled: checked });
      setConfig((prev) => ({ ...prev, enabled: saved.enabled }));
      toast.success(checked ? 'Agent AI diaktifkan' : 'Agent AI dinonaktifkan');
    } catch {
      toast.error('Gagal mengubah status aktif Agent AI');
    }
  };

  const handleSendChatTurn = async (payload: {
    text: string;
    imageUrl?: string | null;
    mediaName?: string | null;
    replyToMessageId?: string | null;
    replyToPreview?: string | null;
    customerName: string;
  }) => {
    const cleanText = payload.text.trim();
    if (!cleanText && !payload.imageUrl) return;

    const nowTime = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const userTurnId = `sim_msg_${chatTurns.length + 1}`;
    const userTurn: AiSimulatorChatTurn = {
      id: userTurnId,
      role: 'user',
      content: cleanText,
      timestamp: nowTime,
      imageUrl: payload.imageUrl || null,
      mediaName: payload.mediaName || null,
      replyToMessageId: payload.replyToMessageId || null,
      replyToPreview: payload.replyToPreview || null,
    };

    const priorHistory = chatTurns.map((t) => ({
      id: t.id,
      role: t.role,
      content: t.content,
      timestamp: t.timestamp,
      imageUrl: t.imageUrl || null,
      mediaName: t.mediaName || null,
      replyToMessageId: t.replyToMessageId || null,
    }));

    setChatTurns((prev) => [...prev, userTurn]);
    setTesting(true);
    setTestError(null);

    try {
      const res = await api.testAiAgent(cleanText, config, {
        history: priorHistory,
        imageUrl: payload.imageUrl || null,
        mediaName: payload.mediaName || null,
        replyToMessageId: payload.replyToMessageId || null,
        contactName: payload.customerName,
      });
      setTestResult(res);

      const aiTurn: AiSimulatorChatTurn = {
        id: `sim_msg_${chatTurns.length + 2}`,
        role: 'assistant',
        content: res.reply || '(Tidak ada teks balasan)',
        timestamp: new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        replyToMessageId: res.replyToMessageId || payload.replyToMessageId || null,
        replyToPreview: res.replyToPreview || payload.replyToPreview || null,
        resultMeta: {
          source: res.source,
          providerLabel: res.providerLabel,
          model: res.model,
          fallbackUsed: res.fallbackUsed,
          attempts: res.attempts || [],
          toolCalls: res.toolCalls || [],
          outboundMedia: res.outboundMedia || [],
        },
      };
      setChatTurns((prev) => [...prev, aiTurn]);
    } catch (err: any) {
      const attempts = err.response?.data?.data?.attempts;
      const msg = err.response?.data?.error || 'Gagal menguji balasan AI';
      setTestError(msg);
      toast.error(msg);

      const errTurn: AiSimulatorChatTurn = {
        id: `sim_msg_${chatTurns.length + 2}`,
        role: 'assistant',
        content: `Gagal memproses balasan: ${msg}`,
        timestamp: new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        resultMeta: {
          source: config.provider,
          providerLabel: config.provider,
          model: config.model,
          fallbackUsed: false,
          attempts: Array.isArray(attempts) ? attempts : [],
          toolCalls: [],
          error: msg,
        },
      };
      setChatTurns((prev) => [...prev, errTurn]);
    } finally {
      setTesting(false);
    }
  };

  const handleTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testMessage.trim()) return;
    const text = testMessage.trim();
    setTestMessage('');
    await handleSendChatTurn({
      text,
      customerName: 'Budi Santoso',
    });
  };

  const handleClearChat = () => {
    setChatTurns([]);
    setTestResult(null);
    setTestError(null);
  };

  if (loading) return <LoadingState message="Memuat Agent AI, Knowledge Book & Skill..." />;
  if (error) return <ErrorState message={error} onRetry={loadAll} />;

  const activeSkillsCount = skills.filter((s) => s.isActive).length;
  const activeMcpCount = mcpServers.filter((s) => s.isActive).length;
  const activeBooksCount = books.filter((b) => b.isActive).length;
  const enabledToolsCount =
    (config.enabledBuiltinTools?.length || 0) +
    mcpServers
      .filter((s) => s.isActive)
      .reduce((acc, s) => acc + (s.cachedTools?.length || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Agent AI</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Kelola kepribadian &amp; prompt (positif/negatif), model API + fallback, Knowledge Book, Skill, dan Tool MCP.
          </p>
        </div>

        <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-200 bg-white text-xs font-medium text-gray-800 self-start sm:self-auto">
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={config.enabled}
            onChange={(e) => void handleToggleAgentEnabled(e.target.checked)}
            className="rounded border-gray-300 disabled:opacity-50"
          />
          <span>{config.enabled ? 'Agent AI Aktif' : 'Agent AI Nonaktif'}</span>
        </label>
      </div>

      {!canEdit && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
          <strong>Mode Lihat Saja:</strong> Role <strong>{currentUser?.roleName || 'Agent'}</strong> hanya dapat meninjau konfigurasi Agent AI &amp; Knowledge Book tanpa hak mengubah (<code className="font-mono">settings.edit</code>).
        </div>
      )}

      <div className="flex items-center gap-5 border-b border-gray-200 overflow-x-auto">
        {(
          [
            { id: 'personality', label: 'Personality & Prompt' },
            {
              id: 'models',
              label: `Model AI & Fallback (${1 + config.fallbacks.length})`,
            },
            {
              id: 'knowledge',
              label: `Knowledge Book (${activeBooksCount}/${books.length})`,
            },
            {
              id: 'skills-mcp',
              label: `Skill (${activeSkillsCount}) & MCP (${activeMcpCount})`,
            },
            {
              id: 'simulator',
              label: `Simulasi Chat AI${chatTurns.length > 0 ? ` (${chatTurns.length})` : ''}`,
            },
          ] as Array<{ id: AiTabId; label: string }>
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`pb-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'personality' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <fieldset disabled={!canEdit} className="lg:col-span-7 min-w-0">
            <AiPersonalityPromptPanel
              config={config}
              savingConfig={savingConfig}
              onChangeConfig={(patch) => setConfig((prev) => ({ ...prev, ...patch }))}
              onSave={handleSaveConfig}
            />
          </fieldset>
          <div className="lg:col-span-5">
            <AiTestSimulatorPanel
              testMessage={testMessage}
              onTestMessageChange={setTestMessage}
              testing={testing}
              testResult={testResult}
              testError={testError}
              onSubmitTest={handleTest}
              providerLabelFallback={config.provider}
              agentName={config.name}
              agentModel={config.model}
              enabledToolsCount={enabledToolsCount}
              chatTurns={chatTurns}
              onSendChatTurn={handleSendChatTurn}
              onClearChat={handleClearChat}
            />
          </div>
        </div>
      )}

      {activeTab === 'models' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <fieldset disabled={!canEdit} className="lg:col-span-7 min-w-0">
            <AiModelConfigPanel
              config={config}
              catalog={catalog}
              savingConfig={savingConfig}
              fetchedModelsMap={fetchedModelsMap}
              manualModelSlots={manualModelSlots}
              fetchingSlotId={fetchingSlotId}
              verifyingSlotId={verifyingSlotId}
              verifyResults={verifyResults}
              onChangeConfig={setConfig}
              onClearVerifyResult={(slotId) =>
                setVerifyResults((prev) => ({ ...prev, [slotId]: null }))
              }
              onToggleManualModel={(slotId, manual) =>
                setManualModelSlots((prev) => ({ ...prev, [slotId]: manual }))
              }
              onFetchModels={(slot) => void handleFetchModels(slot)}
              onVerifySlot={(slot) => void handleVerifySlot(slot)}
              onAddFallback={handleAddFallback}
              onSave={handleSaveConfig}
            />
          </fieldset>
          <div className="lg:col-span-5">
            <AiTestSimulatorPanel
              testMessage={testMessage}
              onTestMessageChange={setTestMessage}
              testing={testing}
              testResult={testResult}
              testError={testError}
              onSubmitTest={handleTest}
              providerLabelFallback={config.provider}
              agentName={config.name}
              agentModel={config.model}
              enabledToolsCount={enabledToolsCount}
              chatTurns={chatTurns}
              onSendChatTurn={handleSendChatTurn}
              onClearChat={handleClearChat}
            />
          </div>
        </div>
      )}

      {activeTab === 'knowledge' && (
        <fieldset disabled={!canEdit} className="min-w-0">
          <AiKnowledgeBooksPanel
            books={books}
            bookPresets={bookPresets}
            knowledge={knowledge}
            onRefreshKnowledge={refreshKnowledgeOnly}
          />
        </fieldset>
      )}

      {activeTab === 'skills-mcp' && (
        <fieldset disabled={!canEdit} className="min-w-0">
          <AiSkillsMcpPanel
            config={config}
            skills={skills}
            skillPresets={skillPresets}
            builtinTools={builtinTools}
            mcpServers={mcpServers}
            onRefreshSkillsAndMcp={refreshSkillsAndMcpOnly}
            onSaveBuiltinTools={handleSaveBuiltinTools}
          />
        </fieldset>
      )}

      {activeTab === 'simulator' && (
        <div className="max-w-4xl">
          <AiTestSimulatorPanel
            testMessage={testMessage}
            onTestMessageChange={setTestMessage}
            testing={testing}
            testResult={testResult}
            testError={testError}
            onSubmitTest={handleTest}
            providerLabelFallback={config.provider}
            agentName={config.name}
            agentModel={config.model}
            enabledToolsCount={enabledToolsCount}
            chatTurns={chatTurns}
            onSendChatTurn={handleSendChatTurn}
            onClearChat={handleClearChat}
          />
        </div>
      )}
    </div>
  );
};

export default AiAgent;
