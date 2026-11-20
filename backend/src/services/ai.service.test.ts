import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import {
  DEFAULT_AI_CONFIG,
  buildExecutionChain,
  generateAiAgentReply,
  listProviderModels,
  mergeAiAgentConfig,
  normalizeBaseUrl,
  resolveSlotApiKey,
  sanitizeAiError,
  sanitizeConfigForClient,
  verifySingleAiSlot,
} from './ai.service';

test('normalizeBaseUrl strips endpoint suffixes and rejects non-http protocols', () => {
  assert.equal(
    normalizeBaseUrl('OPENAI', 'https://api.openai.com/v1/chat/completions/'),
    'https://api.openai.com/v1'
  );
  assert.equal(
    normalizeBaseUrl('ANTHROPIC', 'https://api.anthropic.com/v1/messages'),
    'https://api.anthropic.com/v1'
  );
  assert.equal(
    normalizeBaseUrl('GEMINI', 'https://generativelanguage.googleapis.com/v1beta/models/'),
    'https://generativelanguage.googleapis.com/v1beta'
  );
  assert.throws(() => normalizeBaseUrl('CUSTOM_OPENAI', 'ftp://localhost:11434'), /http/i);
});

test('mergeAiAgentConfig protects keys across provider changes and fallback reordering', () => {
  const saved = {
    ...DEFAULT_AI_CONFIG,
    provider: 'OPENAI' as const,
    model: 'gpt-4o',
    apiKey: 'sk-primary-secret-1234',
    fallbacks: [
      {
        id: 'fb-1',
        enabled: true,
        provider: 'GEMINI' as const,
        model: 'gemini-2.5-flash',
        apiKey: 'AIza-fallback-key-9999',
      },
    ],
  };

  // Preserves keys on same-provider save with empty inputs
  const kept = mergeAiAgentConfig(saved, {
    provider: 'OPENAI',
    model: 'gpt-4.1-mini',
    apiKey: '',
    fallbacks: [
      {
        id: 'fb-1',
        enabled: true,
        provider: 'GEMINI',
        model: 'gemini-2.5-pro',
        apiKey: '',
      },
    ],
  });
  assert.equal(kept.apiKey, 'sk-primary-secret-1234');
  assert.equal(kept.fallbacks[0].apiKey, 'AIza-fallback-key-9999');

  // Prevents leaking OpenAI key into Gemini when user switches Primary provider
  const switched = mergeAiAgentConfig(saved, {
    provider: 'GEMINI',
    model: 'gemini-2.5-flash',
    apiKey: '',
    fallbacks: [
      {
        id: 'fb-1',
        enabled: true,
        provider: 'GROQ',
        model: 'llama-3.3-70b-versatile',
        apiKey: '',
      },
    ],
  });
  assert.equal(switched.apiKey, '');
  assert.equal(switched.fallbacks[0].apiKey, '');

  // Clears key when clearApiKey is explicitly true
  const cleared = mergeAiAgentConfig(saved, {
    provider: 'OPENAI',
    clearApiKey: true,
  });
  assert.equal(cleared.apiKey, '');

  // Client payload never exposes raw secret keys
  const sanitized = sanitizeConfigForClient(saved);
  assert.equal(sanitized.apiKey, '');
  assert.equal(sanitized.hasApiKey, true);
  assert.equal(sanitized.apiKeyPreview, 'sk-p...1234');
  assert.equal(sanitized.fallbacks[0].apiKey, '');
  assert.equal(sanitized.fallbacks[0].hasApiKey, true);
});

test('buildExecutionChain supports same-provider key inheritance, backup keys, and optional LOCAL_KB', () => {
  const chain = buildExecutionChain({
    ...DEFAULT_AI_CONFIG,
    enabled: true,
    provider: 'OPENAI',
    model: 'gpt-4o',
    apiKey: 'sk-main-1',
    fallbackToLocalKb: true,
    fallbacks: [
      // Inherits sk-main-1 from Primary
      { id: 'fb1', enabled: true, provider: 'OPENAI', model: 'gpt-4o-mini', apiKey: '' },
      // Same provider & model, backup API key -> kept distinct!
      { id: 'fb2', enabled: true, provider: 'OPENAI', model: 'gpt-4o', apiKey: 'sk-backup-2' },
      // Disabled slot -> skipped
      { id: 'fb3', enabled: false, provider: 'GROQ', model: 'llama-3.3-70b-versatile', apiKey: 'gsk_1' },
      // Cross provider
      { id: 'fb4', enabled: true, provider: 'GEMINI', model: 'gemini-2.5-flash', apiKey: 'AIza-1' },
      // Inherits AIza-1 from earlier Gemini fallback
      { id: 'fb5', enabled: true, provider: 'GEMINI', model: 'gemini-2.0-flash', apiKey: '' },
    ],
  });

  assert.equal(chain.length, 6);
  assert.equal(chain[0].role, 'PRIMARY');
  assert.equal(chain[1].apiKey, 'sk-main-1');
  assert.equal(chain[1].model, 'gpt-4o-mini');
  assert.equal(chain[2].apiKey, 'sk-backup-2');
  assert.equal(chain[3].provider, 'GEMINI');
  assert.equal(chain[4].apiKey, 'AIza-1');
  assert.equal(chain[4].model, 'gemini-2.0-flash');
  assert.equal(chain[5].provider, 'LOCAL_KB');

  const noLocalChain = buildExecutionChain({
    ...DEFAULT_AI_CONFIG,
    provider: 'OPENAI',
    model: 'gpt-4o',
    apiKey: 'sk-main-1',
    fallbackToLocalKb: false,
    fallbacks: [],
  });
  assert.equal(noLocalChain.length, 1);
});

test('resolveSlotApiKey picks matching saved or draft key safely', () => {
  const saved = {
    ...DEFAULT_AI_CONFIG,
    provider: 'OPENAI' as const,
    apiKey: 'sk-saved-primary',
    fallbacks: [
      { id: 'fb1', enabled: true, provider: 'GEMINI' as const, model: 'gemini-2.5-flash', apiKey: 'AIza-saved-fb' },
    ],
  };

  assert.equal(
    resolveSlotApiKey({ slotId: 'fb1', provider: 'GEMINI', savedConfig: saved }),
    'AIza-saved-fb'
  );
  assert.equal(
    resolveSlotApiKey({ slotId: 'fb-new', provider: 'OPENAI', savedConfig: saved }),
    'sk-saved-primary'
  );
  assert.equal(
    resolveSlotApiKey({
      slotId: 'fb-new',
      provider: 'GROQ',
      savedConfig: saved,
      extraCandidates: [{ provider: 'GROQ', apiKey: 'gsk-draft-key' }],
    }),
    'gsk-draft-key'
  );
  assert.equal(
    resolveSlotApiKey({
      slotId: 'fb1',
      provider: 'GEMINI',
      clearApiKey: true,
      savedConfig: saved,
    }),
    ''
  );
});

test('generateAiAgentReply fails over across primary model error, fallback timeout, to succeeding provider', async (t) => {
  const origPost = axios.post;
  t.after(() => {
    axios.post = origPost;
  });

  const calledUrls: string[] = [];
  const calledBodies: any[] = [];

  axios.post = (async (url: string, data: any) => {
    calledUrls.push(url);
    calledBodies.push(data);

    if (url.includes('api.openai.com') && data?.model === 'o4-mini') {
      const err: any = new Error('Rate limit reached for key sk-secret-openai-9999');
      err.response = { status: 429, data: { error: { message: 'Quota exceeded for sk-secret-openai-9999' } } };
      throw err;
    }

    if (url.includes('api.anthropic.com')) {
      return {
        data: {
          content: [{ type: 'text', text: 'Halo kak! Paket Pro tersedia mulai Rp99.000/bulan.' }],
        },
      };
    }

    throw new Error(`Unexpected call to ${url}`);
  }) as any;

  const cfg = {
    ...DEFAULT_AI_CONFIG,
    enabled: true,
    provider: 'OPENAI' as const,
    model: 'o4-mini',
    apiKey: 'sk-secret-openai-9999',
    fallbackToLocalKb: true,
    fallbacks: [
      {
        id: 'fb-anth',
        enabled: true,
        provider: 'ANTHROPIC' as const,
        model: 'claude-sonnet-4-20250514',
        apiKey: 'sk-ant-secret-1111',
      },
    ],
  };

  const res = await generateAiAgentReply('Berapa harga paket pro?', {
    configOverride: { ...cfg, enabledBuiltinTools: [] },
    history: [
      { role: 'assistant', content: 'Ada yang bisa dibantu?' },
      { role: 'user', content: 'Mau tanya harga' },
      { role: 'user', content: 'Khusus UMKM' },
    ],
    kbBooksOverride: [],
    kbItemsOverride: [
      { title: 'Paket Pro', category: 'CATALOG', content: 'Rp99.000 per bulan.' },
    ],
    skillsOverride: [],
    mcpServersOverride: [],
  });

  assert.equal(res.source, 'ANTHROPIC');
  assert.equal(res.model, 'claude-sonnet-4-20250514');
  assert.equal(res.fallbackUsed, true);
  assert.match(res.reply, /Paket Pro/);
  assert.equal(res.attempts.length, 2);
  assert.equal(res.attempts[0].ok, false);
  // Secret API key must be scrubbed from error message
  assert.ok(!res.attempts[0].error?.includes('sk-secret-openai-9999'));
  assert.ok(res.attempts[0].error?.includes('[REDACTED]'));
  assert.equal(res.attempts[1].ok, true);

  // Check OpenAI reasoning model formatting (uses max_completion_tokens without temperature)
  assert.equal(calledBodies[0].max_completion_tokens, DEFAULT_AI_CONFIG.maxTokens);
  assert.equal(calledBodies[0].temperature, undefined);

  // Check Anthropic leading-assistant trimming and consecutive-user merge
  assert.equal(calledBodies[1].messages.length, 1);
  assert.equal(calledBodies[1].messages[0].role, 'user');
  assert.match(calledBodies[1].messages[0].content, /Mau tanya harga/);
  assert.match(calledBodies[1].messages[0].content, /Berapa harga paket pro/);
});

test('generateAiAgentReply falls back to LOCAL_KB when enabled, and throws detailed error when disabled', async (t) => {
  const origPost = axios.post;
  t.after(() => {
    axios.post = origPost;
  });

  axios.post = (async () => {
    const err: any = new Error('timeout of 15000ms exceeded');
    err.code = 'ECONNABORTED';
    throw err;
  }) as any;

  const baseCfg = {
    ...DEFAULT_AI_CONFIG,
    enabled: true,
    provider: 'GEMINI' as const,
    model: 'gemini-2.5-flash',
    apiKey: 'AIza-test-123456',
    fallbacks: [],
  };

  const kbRes = await generateAiAgentReply('jam operasional kapan?', {
    configOverride: { ...baseCfg, enabledBuiltinTools: [], fallbackToLocalKb: true },
    kbBooksOverride: [],
    kbItemsOverride: [
      { title: 'Jam Operasional', category: 'FAQ', content: 'Senin - Jumat pukul 08:00 - 17:00 WIB.' },
    ],
    skillsOverride: [],
    mcpServersOverride: [],
  });
  assert.equal(kbRes.source, 'LOCAL_KB');
  assert.equal(kbRes.fallbackUsed, true);
  assert.match(kbRes.reply, /08:00 - 17:00 WIB/);

  await assert.rejects(
    () =>
      generateAiAgentReply('halo?', {
        configOverride: { ...baseCfg, enabledBuiltinTools: [], fallbackToLocalKb: false },
        kbBooksOverride: [],
        kbItemsOverride: [],
        skillsOverride: [],
        mcpServersOverride: [],
      }),
    /Semua provider AI gagal merespons/
  );
});

test('listProviderModels fetches and filters models for OpenAI, Gemini, and Ollama fallback tags', async (t) => {
  const origGet = axios.get;
  t.after(() => {
    axios.get = origGet;
  });

  axios.get = (async (url: string) => {
    if (url === 'https://api.openai.com/v1/models') {
      return {
        data: {
          data: [
            { id: 'gpt-4o-mini' },
            { id: 'whisper-1' },
            { id: 'text-embedding-3-small' },
            { id: 'gpt-4.1' },
          ],
        },
      };
    }
    if (url.includes('generativelanguage.googleapis.com')) {
      return {
        data: {
          models: [
            { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/embedding-001', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
          ],
        },
      };
    }
    if (url === 'http://localhost:11434/v1/models') {
      const err: any = new Error('Not Found');
      err.response = { status: 404 };
      throw err;
    }
    if (url === 'http://localhost:11434/api/tags') {
      return {
        data: { models: [{ name: 'qwen2.5:7b' }, { name: 'llama3.2:latest' }] },
      };
    }
    throw new Error(`Unexpected GET ${url}`);
  }) as any;

  const oai = await listProviderModels({ provider: 'OPENAI', apiKey: 'sk-test' });
  assert.equal(oai.source, 'api');
  assert.deepEqual(
    oai.models.map((m) => m.id),
    ['gpt-4.1', 'gpt-4o-mini']
  );

  const gem = await listProviderModels({ provider: 'GEMINI', apiKey: 'AIza-test' });
  assert.equal(gem.source, 'api');
  assert.deepEqual(gem.models.map((m) => m.id), ['gemini-2.5-flash']);

  const ollama = await listProviderModels({
    provider: 'CUSTOM_OPENAI',
    baseUrl: 'http://localhost:11434/v1',
  });
  assert.equal(ollama.source, 'api');
  assert.deepEqual(ollama.models.map((m) => m.id), ['llama3.2:latest', 'qwen2.5:7b']);
});

test('verifySingleAiSlot reports structured success and error without leaking credentials', async (t) => {
  const origPost = axios.post;
  t.after(() => {
    axios.post = origPost;
  });

  axios.post = (async () => ({
    data: { choices: [{ message: { content: 'Koneksi OK' } }] },
  })) as any;

  const okRes = await verifySingleAiSlot({
    provider: 'GROQ',
    model: 'llama-3.3-70b-versatile',
    apiKey: 'gsk_valid_secret_key',
  });
  assert.equal(okRes.ok, true);
  assert.equal(okRes.replyPreview, 'Koneksi OK');

  const failRes = await verifySingleAiSlot({
    provider: 'OPENAI',
    model: 'gpt-4o-mini',
    apiKey: '',
  });
  assert.equal(failRes.ok, false);
  assert.match(failRes.error || '', /API Key untuk OpenAI belum diisi/);

  assert.equal(sanitizeAiError(new Error('bad key sk-abc-999999'), 'sk-abc-999999'), 'bad key [REDACTED]');
});

test('generateAiAgentReply injects personality, positive/negative prompts, active skills, and active knowledge books only', async (t) => {
  const origPost = axios.post;
  t.after(() => {
    axios.post = origPost;
  });

  let capturedSystemPrompt = '';
  axios.post = (async (_url: string, data: any) => {
    capturedSystemPrompt = data?.messages?.[0]?.content || '';
    return {
      data: { choices: [{ message: { content: 'Halo Kak Budi, garansi 30 hari tersedia!' } }] },
    };
  }) as any;

  const cfg = {
    ...DEFAULT_AI_CONFIG,
    enabled: true,
    name: 'Rina CS',
    persona: 'Spesialis layanan purna jual.',
    personality: {
      roleTitle: 'Senior Customer Care',
      tone: 'FRIENDLY' as const,
      language: 'INDONESIAN' as const,
      responseLength: 'CONCISE' as const,
      emojiUsage: 'NONE' as const,
      greetingStyle: 'Halo Kak {nama}',
      closingStyle: 'Terima kasih sudah menghubungi kami.',
    },
    positivePrompt: 'Selalu utamakan solusi di kalimat pembuka.',
    negativePrompt: 'Dilarang menjanjikan refund tunai tanpa verifikasi.',
    enabledBuiltinTools: [],
    provider: 'OPENAI' as const,
    model: 'gpt-4o-mini',
    apiKey: 'sk-test-key',
    fallbacks: [],
  };

  const res = await generateAiAgentReply('Garansinya berapa hari?', {
    configOverride: cfg,
    contactName: 'Budi',
    channel: 'WHATSAPP',
    kbBooksOverride: [
      { id: 'book-active', title: 'Buku Garansi Resmi', isActive: true },
      { id: 'book-inactive', title: 'Draft Lama Tidak Dipakai', isActive: false },
    ],
    kbItemsOverride: [
      { bookId: 'book-active', title: 'Garansi', category: 'POLICY', content: 'Garansi resmi 30 hari.', isActive: true },
      { bookId: 'book-inactive', title: 'Promo Lama', category: 'POLICY', content: 'DISKON_RAHASIA_99', isActive: true },
    ],
    skillsOverride: [
      {
        slug: 'warranty-check',
        name: 'Pengecekan Garansi',
        triggerHint: 'Saat ditanya masa garansi',
        instructions: 'Sebutkan masa garansi resmi sesuai Buku Garansi Resmi.',
        isActive: true,
      },
    ],
    mcpServersOverride: [],
  });

  assert.match(res.reply, /garansi 30 hari/i);
  assert.match(capturedSystemPrompt, /Senior Customer Care/);
  assert.match(capturedSystemPrompt, /Halo Kak Budi/);
  assert.match(capturedSystemPrompt, /ARAHAN POSITIF/);
  assert.match(capturedSystemPrompt, /Selalu utamakan solusi di kalimat pembuka/);
  assert.match(capturedSystemPrompt, /BATASAN & LARANGAN/);
  assert.match(capturedSystemPrompt, /Dilarang menjanjikan refund tunai/);
  assert.match(capturedSystemPrompt, /Skill: Pengecekan Garansi/);
  assert.match(capturedSystemPrompt, /Buku: Buku Garansi Resmi/);
  assert.doesNotMatch(capturedSystemPrompt, /DISKON_RAHASIA_99/);
});

test('generateAiAgentReply executes MCP and CRM tool calls across multi-round OpenAI, Gemini, and Anthropic loops', async (t) => {
  const origPost = axios.post;
  t.after(() => {
    axios.post = origPost;
  });

  // 1. OpenAI tool loop
  let openaiRound = 0;
  axios.post = (async (_url: string, body: any) => {
    openaiRound++;
    if (openaiRound === 1) {
      assert.ok(Array.isArray(body.tools) && body.tools.length === 1);
      return {
        data: {
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'crm_search_products', arguments: '{"query":"CRM"}' },
                  },
                ],
              },
            },
          ],
        },
      };
    }
    const toolMsg = body.messages.find((m: any) => m.role === 'tool');
    assert.match(toolMsg?.content || '', /Reneo CRM Pro/);
    return {
      data: {
        choices: [{ message: { content: 'Produk Reneo CRM Pro tersedia Rp99.000/bulan.' } }],
      },
    };
  }) as any;

  const openAiRes = await generateAiAgentReply('Harga CRM berapa?', {
    configOverride: {
      ...DEFAULT_AI_CONFIG,
      enabled: true,
      enabledBuiltinTools: ['crm_search_products'],
      provider: 'OPENAI',
      model: 'gpt-4o-mini',
      apiKey: 'sk-tool-test',
      fallbacks: [],
    },
    kbBooksOverride: [],
    kbItemsOverride: [],
    skillsOverride: [],
    mcpServersOverride: [],
    customToolExecutor: async () => ({ ok: true, output: 'Reneo CRM Pro - Rp99.000/bulan' }),
  });

  assert.equal(openAiRes.toolCalls.length, 1);
  assert.equal(openAiRes.toolCalls[0].toolName, 'crm_search_products');
  assert.match(openAiRes.reply, /Rp99\.000/);

  // 2. Gemini tool loop
  let gemRound = 0;
  axios.post = (async () => {
    gemRound++;
    if (gemRound === 1) {
      return {
        data: {
          candidates: [
            {
              content: {
                parts: [{ functionCall: { name: 'mcp_panel_check_docker', args: { host: 'srv1' } } }],
              },
            },
          ],
        },
      };
    }
    return {
      data: {
        candidates: [{ content: { parts: [{ text: 'Container CRM berjalan normal.' }] } }],
      },
    };
  }) as any;

  const gemRes = await generateAiAgentReply('Cek status server', {
    configOverride: {
      ...DEFAULT_AI_CONFIG,
      enabled: true,
      enabledBuiltinTools: [],
      provider: 'GEMINI',
      model: 'gemini-2.5-flash',
      apiKey: 'AIza-test',
      fallbacks: [],
    },
    kbBooksOverride: [],
    kbItemsOverride: [],
    skillsOverride: [],
    mcpServersOverride: [
      {
        id: 'srv1',
        name: 'panel',
        transport: 'HTTP',
        endpointUrl: 'http://localhost:8000/mcp',
        authType: 'NONE',
        authHeaderName: 'X-API-Key',
        cachedTools: [
          {
            name: 'check_docker',
            description: 'Check docker',
            inputSchema: { type: 'object', additionalProperties: false, properties: { host: { type: 'string' } } },
          },
        ],
        disabledTools: [],
        isActive: true,
      },
    ],
    customToolExecutor: async (def) => ({ ok: true, output: `${def.originalName}: running` }),
  });
  assert.equal(gemRes.toolCalls.length, 1);
  assert.equal(gemRes.toolCalls[0].source, 'MCP');
  assert.match(gemRes.reply, /berjalan normal/);

  // 3. Anthropic tool loop
  let antRound = 0;
  axios.post = (async () => {
    antRound++;
    if (antRound === 1) {
      return {
        data: {
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'tu_1', name: 'crm_search_knowledge', input: { query: 'faq' } }],
        },
      };
    }
    return {
      data: {
        content: [{ type: 'text', text: 'Ini ringkasan FAQ yang Anda cari.' }],
      },
    };
  }) as any;

  const antRes = await generateAiAgentReply('Apa FAQ nya?', {
    configOverride: {
      ...DEFAULT_AI_CONFIG,
      enabled: true,
      enabledBuiltinTools: ['crm_search_knowledge'],
      provider: 'ANTHROPIC',
      model: 'claude-sonnet-4-20250514',
      apiKey: 'sk-ant-test',
      fallbacks: [],
    },
    kbBooksOverride: [],
    kbItemsOverride: [],
    skillsOverride: [],
    mcpServersOverride: [],
    customToolExecutor: async () => ({ ok: true, output: 'FAQ: Dukungan 24/7 tersedia.' }),
  });
  assert.equal(antRes.toolCalls.length, 1);
  assert.equal(antRes.toolCalls[0].toolName, 'crm_search_knowledge');
  assert.match(antRes.reply, /ringkasan FAQ/);
});
