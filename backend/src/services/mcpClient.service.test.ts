import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import {
  buildAgentToolRegistry,
  callMcpTool,
  discoverMcpTools,
  parseMcpRpcResponse,
  sanitizeSchemaForGemini,
} from './mcpClient.service';
import { parseMarkdownToChapters, parseSkillMarkdown } from './aiCatalog.service';

test('parseMcpRpcResponse handles JSON objects, batch arrays, and Streamable HTTP SSE frames', () => {
  const single = parseMcpRpcResponse({ jsonrpc: '2.0', id: 1, result: { ok: true } }, 1);
  assert.equal(single.result.ok, true);

  const ssePayload = [
    'event: endpoint',
    'data: /mcp',
    '',
    'event: message',
    'data: {"jsonrpc":"2.0","id":"abc","result":{"tools":[{"name":"list_containers"}]}}',
    '',
  ].join('\n');
  const parsedSse = parseMcpRpcResponse(ssePayload, 'abc');
  assert.equal(parsedSse.result.tools[0].name, 'list_containers');
});

test('discoverMcpTools paginates tools/list and propagates Mcp-Session-Id & auth headers safely', async (t) => {
  const origPost = axios.post;
  t.after(() => {
    axios.post = origPost;
  });

  const seenHeaders: any[] = [];
  axios.post = (async (_url: string, body: any, cfg: any) => {
    seenHeaders.push(cfg?.headers || {});
    if (body.method === 'initialize') {
      return {
        headers: { 'mcp-session-id': 'sess-99' },
        data: { jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2024-11-05' } },
      };
    }
    if (body.method === 'notifications/initialized') {
      return { headers: {}, data: '' };
    }
    if (body.method === 'tools/list') {
      if (!body.params?.cursor) {
        return {
          headers: {},
          data: {
            jsonrpc: '2.0',
            id: body.id,
            result: {
              tools: [{ name: 'docker_ps', description: 'List containers' }],
              nextCursor: 'p2',
            },
          },
        };
      }
      return {
        headers: {},
        data: {
          jsonrpc: '2.0',
          id: body.id,
          result: {
            tools: [{ name: 'system_stats', description: 'Read system stats' }],
          },
        },
      };
    }
    if (body.method === 'tools/call') {
      return {
        headers: {},
        data: {
          jsonrpc: '2.0',
          id: body.id,
          result: { content: [{ type: 'text', text: '3 containers running' }] },
        },
      };
    }
    throw new Error(`Unexpected method ${body.method}`);
  }) as any;

  const srv = {
    id: 'srv-1',
    name: 'Reneo MCP',
    transport: 'HTTP',
    endpointUrl: 'http://localhost:8000/mcp',
    authType: 'BEARER' as const,
    authHeaderName: 'X-API-Key',
    authToken: 'secret-token-xyz',
    cachedTools: [],
    disabledTools: [],
    isActive: true,
  };

  const tools = await discoverMcpTools(srv);
  assert.deepEqual(
    tools.map((x) => x.name),
    ['docker_ps', 'system_stats']
  );
  assert.equal(seenHeaders[0].Authorization, 'Bearer secret-token-xyz');
  assert.equal(seenHeaders[2]['Mcp-Session-Id'], 'sess-99');

  const callRes = await callMcpTool(srv, 'docker_ps', {});
  assert.equal(callRes.ok, true);
  assert.equal(callRes.output, '3 containers running');
});

test('sanitizeSchemaForGemini strips unsupported JSON Schema keywords cleanly', () => {
  const sanitized = sanitizeSchemaForGemini({
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    additionalProperties: false,
    properties: {
      query: { type: ['string', 'null'], description: 'Search text', default: '' },
    },
    required: ['query'],
  });
  assert.equal(sanitized.$schema, undefined);
  assert.equal(sanitized.additionalProperties, undefined);
  assert.equal(sanitized.properties.query.type, 'string');
  assert.equal(sanitized.properties.query.default, undefined);
  assert.deepEqual(sanitized.required, ['query']);
});

test('buildAgentToolRegistry deduplicates names and respects disabledTools and skill links', () => {
  const registry = buildAgentToolRegistry({
    enabledBuiltinTools: ['crm_search_products'],
    linkedToolsFromSkills: ['crm_escalate_to_human'],
    mcpServers: [
      {
        id: 'm1',
        name: 'Server A',
        transport: 'HTTP',
        endpointUrl: 'http://a.local/mcp',
        authType: 'NONE',
        authHeaderName: 'X-API-Key',
        cachedTools: [
          { name: 'search', description: 'Search A', inputSchema: { type: 'object', properties: {} } },
          { name: 'secret_tool', description: 'Disabled', inputSchema: { type: 'object', properties: {} } },
        ],
        disabledTools: ['secret_tool'],
        isActive: true,
      },
      {
        id: 'm2',
        name: 'Server A',
        transport: 'HTTP',
        endpointUrl: 'http://b.local/mcp',
        authType: 'NONE',
        authHeaderName: 'X-API-Key',
        cachedTools: [
          { name: 'search', description: 'Search B', inputSchema: { type: 'object', properties: {} } },
        ],
        disabledTools: [],
        isActive: true,
      },
    ],
  });

  const names = registry.definitions.map((d) => d.llmName);
  assert.deepEqual(names, [
    'crm_search_products',
    'crm_escalate_to_human',
    'mcp_server_a_search',
    'mcp_server_a_search_2',
  ]);
});

test('parseMarkdownToChapters and parseSkillMarkdown extract structured Knowledge Book & Skill metadata', () => {
  const chapters = parseMarkdownToChapters(
    `# Pengiriman\nPaket dikirim tiap jam 15.00 WIB.\n\n## Garansi\nGaransi 30 hari untuk kerusakan pabrik.`,
    'Panduan'
  );
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].title, 'Pengiriman');
  assert.equal(chapters[1].title, 'Garansi');

  const skill = parseSkillMarkdown(
    `---\nname: Lead Qualifier\ndescription: Menilai prospek baru\ncategory: sales\ntrigger: Saat calon pelanggan baru menyapa\n---\n# Playbook\n1. Sapa dengan sopan.\n2. Tanyakan kebutuhan.`
  );
  assert.equal(skill.slug, 'lead-qualifier');
  assert.equal(skill.name, 'Lead Qualifier');
  assert.equal(skill.category, 'SALES');
  assert.match(skill.triggerHint, /calon pelanggan baru/);
  assert.match(skill.instructions, /Sapa dengan sopan/);
});

test('built-in CRM tools execute chat history, customer media inspection, quote reply, outbound media, and profile update in simulator mode', async () => {
  const registry = buildAgentToolRegistry({
    enabledBuiltinTools: [
      'crm_get_chat_history',
      'crm_inspect_customer_media',
      'crm_reply_to_message',
      'crm_send_media',
      'crm_update_customer_profile',
    ],
    linkedToolsFromSkills: [],
    mcpServers: [],
    context: {
      isSimulator: true,
      contactName: 'Riky',
      contactPhone: '+6288996555448',
      simulatorHistory: [
        {
          id: 'sim_msg_1',
          role: 'user',
          content: 'Halo min, ini bukti transfer saya ya',
          imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          mediaName: 'bukti-tf.png',
        },
      ],
    },
  });

  const histRes = await registry.executeTool('crm_get_chat_history', { limit: 10 });
  assert.equal(histRes.trace.ok, true);
  assert.match(histRes.output, /sim_msg_1/);
  assert.match(histRes.output, /bukti-tf\.png/);

  const mediaRes = await registry.executeTool('crm_inspect_customer_media', {
    messageId: 'sim_msg_1',
  });
  assert.equal(mediaRes.trace.ok, true);
  assert.equal(registry.sideEffects.inspectedImages.length, 1);
  assert.equal(registry.sideEffects.inspectedImages[0].label, 'bukti-tf.png');

  const replyRes = await registry.executeTool('crm_reply_to_message', {
    messageId: 'sim_msg_1',
  });
  assert.equal(replyRes.trace.ok, true);
  assert.equal(registry.sideEffects.replyToMessageId, 'sim_msg_1');

  const sendMediaRes = await registry.executeTool('crm_send_media', {
    mediaUrlOrName: 'https://crm.reneo.my.id/api/media/files/katalog-pro.jpg',
    caption: 'Berikut brosur Paket Pro',
  });
  assert.equal(sendMediaRes.trace.ok, true);
  assert.equal(registry.sideEffects.outboundMedia.length, 1);
  assert.equal(registry.sideEffects.outboundMedia[0].caption, 'Berikut brosur Paket Pro');

  const profileRes = await registry.executeTool('crm_update_customer_profile', {
    category: 'Pelanggan Aktif',
    addLabel: 'Sudah Transfer',
    notes: 'Transfer paket Pro terkonfirmasi',
  });
  assert.equal(profileRes.trace.ok, true);
  assert.match(profileRes.output, /Pelanggan Aktif/);
});
