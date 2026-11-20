import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { config } from '../config';
import {
  buildVCardString,
  parseVCardString,
  parseWahaPrivacyConfig,
  resolveSessionPrivacyRule,
  WahaConfig,
  wahaService,
} from './waha.service';
import {
  extractInboundWahaMediaMeta,
  extractInboundWahaRichData,
  extractWahaContextInfo,
  extractWahaForwardingMeta,
  pickBestContactDisplayName,
} from '../routes/waha';

function stubGetConfig(t: test.TestContext, conf: WahaConfig) {
  wahaService.invalidateExternalEngineCache();
  const origGetConfig = wahaService.getConfig.bind(wahaService);
  (wahaService as any).getConfig = async (maskSecret = false) => ({
    ...conf,
    apiKey: maskSecret ? (conf.apiKey ? '••••••••' : '') : conf.apiKey,
  });
  t.after(() => {
    wahaService.invalidateExternalEngineCache();
    (wahaService as any).getConfig = origGetConfig;
  });
}

function stubWahaEnvSession(t: test.TestContext, sessionName: string) {
  const orig = config.waha.session;
  config.waha.session = sessionName;
  t.after(() => {
    config.waha.session = orig;
  });
}

test('External WAHA mode supports full multi-session listing and accurate status aggregation', async (t) => {
  stubWahaEnvSession(t, 'tenantA');
  stubGetConfig(t, {
    mode: 'EXTERNAL',
    baseUrl: 'https://waha.example.com/',
    apiKey: 'ext-secret',
    session: 'cs-1',
    internalLocked: false,
    hasApiKey: true,
  });

  const origCreate = axios.create;
  t.after(() => {
    axios.create = origCreate;
  });

  let capturedBaseUrl = '';
  axios.create = ((cfg: any) => {
    capturedBaseUrl = cfg?.baseURL || '';
    return {
      get: async (url: string) => {
        if (url === '/api/version') {
          return { data: { version: '2026.8.2', engine: 'GOWS', tier: 'PLUS' } };
        }
        if (url.startsWith('/api/sessions?all=true')) {
          return {
            data: [
              { name: 'cs-1', status: 'WORKING', me: { id: '628111@c.us', pushName: 'CS 1' } },
              { name: 'sales', status: 'SCAN_QR_CODE', me: null },
              { name: 'backup', status: 'FAILED', me: null },
            ],
          };
        }
        throw new Error(`Unexpected GET ${url}`);
      },
      post: async () => ({ data: {} }),
      put: async () => ({ data: {} }),
      delete: async () => ({ data: {} }),
    } as any;
  }) as any;

  const listed = await wahaService.listSessions();
  assert.equal(capturedBaseUrl, 'https://waha.example.com');
  assert.equal(listed.activeSession, 'cs-1');
  assert.deepEqual(
    listed.sessions.map((s) => s.name),
    ['cs-1', 'sales', 'backup']
  );

  const status = await wahaService.getStatus();
  assert.equal(status.connected, true);
  assert.equal(status.sessionStatus, 'WORKING');
  assert.equal(status.connectedSessions, 1);
  assert.equal(status.totalSessions, 3);
});

test('getStatus reports OFFLINE and explicit error on empty external baseUrl or 401 auth failure', async (t) => {
  stubGetConfig(t, {
    mode: 'EXTERNAL',
    baseUrl: '',
    apiKey: '',
    session: 'default',
    internalLocked: false,
    hasApiKey: false,
  });

  const emptyUrlStatus = await wahaService.getStatus();
  assert.equal(emptyUrlStatus.connected, false);
  assert.equal(emptyUrlStatus.sessionStatus, 'OFFLINE');
  assert.match(emptyUrlStatus.error || '', /Base URL WAHA belum dikonfigurasi/i);

  stubGetConfig(t, {
    mode: 'EXTERNAL',
    baseUrl: 'https://waha.example.com',
    apiKey: 'wrong-key',
    session: 'default',
    internalLocked: false,
    hasApiKey: true,
  });

  const origCreate = axios.create;
  t.after(() => {
    axios.create = origCreate;
  });

  axios.create = (() =>
    ({
      get: async () => {
        const err: any = new Error('Request failed with status code 401');
        err.response = { status: 401, data: { message: 'Unauthorized' } };
        throw err;
      },
    }) as any) as any;

  const authErrStatus = await wahaService.getStatus();
  assert.equal(authErrStatus.connected, false);
  assert.equal(authErrStatus.sessionStatus, 'OFFLINE');
  assert.match(authErrStatus.error || '', /Autentikasi WAHA gagal \(401\)/);
});

test('getStatus returns NOT_FOUND cleanly without forging synthetic STOPPED rows when server has 0 sessions', async (t) => {
  stubGetConfig(t, {
    mode: 'EXTERNAL',
    baseUrl: 'https://waha.example.com',
    apiKey: '',
    session: 'default',
    internalLocked: false,
    hasApiKey: false,
  });

  const origCreate = axios.create;
  t.after(() => {
    axios.create = origCreate;
  });

  axios.create = (() =>
    ({
      get: async (url: string) => {
        if (url === '/api/version') {
          return { data: { version: '2026.8.2', engine: 'GOWS', tier: 'PLUS' } };
        }
        if (url.startsWith('/api/sessions?all=true')) {
          return { data: [] };
        }
        if (url === '/api/sessions/default') {
          const err: any = new Error('Not found');
          err.response = { status: 404 };
          throw err;
        }
        throw new Error(`Unexpected GET ${url}`);
      },
    }) as any) as any;

  const status = await wahaService.getStatus();
  assert.equal(status.connected, true);
  assert.equal(status.sessionStatus, 'NOT_FOUND');
  assert.equal(status.totalSessions, 0);
  assert.deepEqual(status.sessions, []);
});

test('stopSession & logoutSession resolve owned prefix in INTERNAL mode and fall back on 404 to legacy endpoints', async (t) => {
  stubWahaEnvSession(t, 'renaldi');
  stubGetConfig(t, {
    mode: 'INTERNAL',
    baseUrl: 'http://reneo-waha:3000',
    apiKey: 'int-key',
    session: 'renaldi',
    internalLocked: true,
    hasApiKey: true,
  });

  const origCreate = axios.create;
  t.after(() => {
    axios.create = origCreate;
  });

  const calls: Array<{ url: string; body: any }> = [];
  axios.create = (() =>
    ({
      post: async (url: string, body?: any) => {
        calls.push({ url, body });
        if (url === '/api/sessions/renaldi-cs1/stop' || url === '/api/sessions/renaldi-cs1/logout') {
          const err: any = new Error('Not Found');
          err.response = { status: 404 };
          throw err;
        }
        return { data: { status: 'STOPPED', name: body?.name || 'renaldi-cs1' } };
      },
    }) as any) as any;

  await wahaService.stopSession('cs1');
  await wahaService.logoutSession('cs1');

  assert.deepEqual(
    calls.map((c) => c.url),
    [
      '/api/sessions/renaldi-cs1/stop',
      '/api/sessions/stop',
      '/api/sessions/renaldi-cs1/logout',
      '/api/sessions/logout',
    ]
  );
  assert.equal(calls[1].body.name, 'renaldi-cs1');
  assert.equal(calls[3].body.name, 'renaldi-cs1');
});

test('startSession explains WAHA Core single-session limit clearly instead of masking it', async (t) => {
  stubGetConfig(t, {
    mode: 'EXTERNAL',
    baseUrl: 'https://waha-core.example.com',
    apiKey: '',
    session: 'default',
    internalLocked: false,
    hasApiKey: false,
  });

  const origCreate = axios.create;
  t.after(() => {
    axios.create = origCreate;
  });

  axios.create = (() =>
    ({
      get: async (url: string) => {
        if (url === '/api/version') {
          return { data: { version: '2026.8.2', engine: 'GOWS', tier: 'CORE' } };
        }
        return { data: {} };
      },
      post: async () => {
        const err: any = new Error('Unprocessable Entity');
        err.response = {
          status: 422,
          data: { message: "WAHA Core support only 'default' session. Upgrade to WAHA Plus." },
        };
        throw err;
      },
    }) as any) as any;

  await assert.rejects(
    () => wahaService.startSession('cs-2'),
    /WAHA Core yang hanya mendukung 1 sesi bernama 'default'/
  );
});

test('getQrCode recovers FAILED session via restart and surfaces descriptive error on failure', async (t) => {
  stubWahaEnvSession(t, 'renaldi');
  stubGetConfig(t, {
    mode: 'INTERNAL',
    baseUrl: 'http://reneo-waha:3000',
    apiKey: 'int-key',
    session: 'renaldi',
    internalLocked: true,
    hasApiKey: true,
  });

  const origCreate = axios.create;
  t.after(() => {
    axios.create = origCreate;
  });

  let restarted = false;
  axios.create = (() =>
    ({
      get: async (url: string) => {
        if (url === '/api/sessions/renaldi') {
          return { data: { name: 'renaldi', status: restarted ? 'SCAN_QR_CODE' : 'FAILED' } };
        }
        if (url === '/api/renaldi/auth/qr') {
          return {
            headers: { 'content-type': 'image/png' },
            data: Buffer.from('fake-png-bytes'),
          };
        }
        throw new Error(`Unexpected GET ${url}`);
      },
      post: async (url: string) => {
        if (url === '/api/sessions/renaldi/restart') {
          restarted = true;
          return { data: { status: 'SCAN_QR_CODE' } };
        }
        throw new Error(`Unexpected POST ${url}`);
      },
    }) as any) as any;

  const qrResult = await wahaService.getQrCode('renaldi');
  assert.equal(restarted, true);
  assert.equal(qrResult.status, 'SCAN_QR_CODE');
  assert.match(qrResult.qr || '', /^data:image\/png;base64,/);
});

test('testConnection reuses stored secret when masked placeholder is submitted', async (t) => {
  stubGetConfig(t, {
    mode: 'EXTERNAL',
    baseUrl: 'https://old.example.com',
    apiKey: 'real-secret-token',
    session: 'default',
    internalLocked: false,
    hasApiKey: true,
  });

  const origCreate = axios.create;
  t.after(() => {
    axios.create = origCreate;
  });

  let sentApiKey = '';
  axios.create = ((cfg: any) => {
    sentApiKey = cfg?.headers?.['X-Api-Key'] || '';
    return {
      get: async (url: string) => {
        if (url.startsWith('/api/sessions')) {
          return { data: [{ name: 'default', status: 'WORKING' }] };
        }
        if (url === '/api/version') {
          return { data: { version: '2026.1.0', engine: 'GOWS', tier: 'PLUS' } };
        }
        return { data: {} };
      },
    } as any;
  }) as any;

  const res = await wahaService.testConnection({
    mode: 'EXTERNAL',
    baseUrl: 'https://new-waha.example.com',
    apiKey: '••••••••',
  });

  assert.equal(sentApiKey, 'real-secret-token');
  assert.equal(res.connected, true);
  assert.equal(res.tier, 'PLUS');
  assert.equal(res.engine, 'GOWS');
  assert.equal(res.isGows, true);
  assert.equal(res.sessionCount, 1);
});

test('External WAHA falls back from stale/default DB session to active WORKING sessions', async (t) => {
  stubWahaEnvSession(t, 'renaldi');
  stubGetConfig(t, {
    mode: 'EXTERNAL',
    baseUrl: 'https://wagt.example.com',
    apiKey: 'secret',
    session: 'renaldi',
    internalLocked: false,
    hasApiKey: true,
  });

  const origCreate = axios.create;
  t.after(() => {
    axios.create = origCreate;
  });

  axios.create = (() =>
    ({
      get: async (url: string) => {
        if (url === '/api/version') {
          return { data: { version: '2026.8.2', engine: 'GOWS', tier: 'PLUS' } };
        }
        if (url.startsWith('/api/sessions?all=true')) {
          return {
            data: [
              { name: 'HRIS_MINTI', status: 'WORKING', me: { id: '628222@c.us', pushName: 'Admin' } },
              { name: 'HRIS_HR', status: 'WORKING', me: { id: '628111@c.us', pushName: 'Clarice' } },
            ],
          };
        }
        throw new Error(`Unexpected GET ${url}`);
      },
      put: async () => ({ data: {} }),
    }) as any) as any;

  const status = await wahaService.getStatus();
  assert.equal(status.connected, true);
  assert.equal(status.sessionStatus, 'WORKING');
  assert.equal(status.activeSession, 'HRIS_MINTI');
  assert.equal(status.connectedSessions, 2);
  assert.equal(status.totalSessions, 2);

  const listed = await wahaService.listSessions();
  assert.equal(listed.activeSession, 'HRIS_MINTI');
  assert.equal(listed.sessions.length, 2);
});

test('testConnection uses saved externalConfig key (not internal key) when active mode is INTERNAL', async (t) => {
  stubGetConfig(t, {
    mode: 'INTERNAL',
    baseUrl: 'http://reneo-waha:3000',
    apiKey: 'internal-container-key',
    session: 'renaldi',
    internalLocked: true,
    hasApiKey: true,
    externalConfig: {
      baseUrl: 'https://wagt.example.com',
      apiKey: 'external-saved-key',
      hasApiKey: true,
    },
    internalConfig: {
      baseUrl: 'http://reneo-waha:3000',
      hasApiKey: true,
    },
  });

  const origCreate = axios.create;
  t.after(() => {
    axios.create = origCreate;
  });

  let sentKey = '';
  axios.create = ((cfg: any) => {
    sentKey = cfg?.headers?.['X-Api-Key'] || '';
    return {
      get: async (url: string) => {
        if (url === '/api/version') return { data: { version: '2026.8.2', engine: 'GOWS', tier: 'PLUS' } };
        if (url.startsWith('/api/sessions')) return { data: [{ name: 'HRIS_HR', status: 'WORKING' }] };
        return { data: {} };
      },
    } as any;
  }) as any;

  const res = await wahaService.testConnection({
    mode: 'EXTERNAL',
    baseUrl: 'https://wagt.example.com',
    apiKey: '••••••••',
  });

  assert.equal(sentKey, 'external-saved-key');
  assert.equal(res.connected, true);
  assert.equal(res.sessionCount, 1);
});

test('phone utils handle multi-device suffixes and @lid / group JID classification', () => {
  const {
    fromWahaChatId,
    isPhoneWahaJid,
    isPersonalWahaJid,
  } = require('./phone.utils') as typeof import('./phone.utils');

  assert.equal(fromWahaChatId('6281234567890:12@s.whatsapp.net'), '6281234567890');
  assert.equal(fromWahaChatId('6281234567890@c.us'), '6281234567890');
  assert.equal(fromWahaChatId('123456789012345:0@lid'), '123456789012345');

  assert.equal(isPhoneWahaJid('6281234567890:4@s.whatsapp.net'), true);
  assert.equal(isPhoneWahaJid('6281234567890@c.us'), true);
  assert.equal(isPhoneWahaJid('123456789012345@lid'), false);

  assert.equal(isPersonalWahaJid('123456789012345@lid'), true);
  assert.equal(isPersonalWahaJid('6281234567890@s.whatsapp.net'), true);
  assert.equal(isPersonalWahaJid('120363000000000@g.us'), false);
  assert.equal(isPersonalWahaJid('status@broadcast'), false);
  assert.equal(isPersonalWahaJid('120363000000000@newsletter'), false);
});

test('isPrivateOrInternalUrl identifies internal Docker/LAN webhook targets vs public HTTPS URLs', () => {
  const { isPrivateOrInternalUrl } = require('./waha.service') as typeof import('./waha.service');

  assert.equal(isPrivateOrInternalUrl('http://reneo-app-1-reneo-crm/api/waha/webhook'), true);
  assert.equal(isPrivateOrInternalUrl('http://localhost:3001/api/waha/webhook'), true);
  assert.equal(isPrivateOrInternalUrl('http://127.0.0.1:3001/api/waha/webhook'), true);
  assert.equal(isPrivateOrInternalUrl('http://192.168.1.50:8080/api/waha/webhook'), true);
  assert.equal(isPrivateOrInternalUrl('https://crm.claricebeauty.co.id/api/waha/webhook'), false);
});

test('EXTERNAL mode prefers public webhook URL over internal Docker WEBHOOK_URL and preserves external WAHA webhooks', async (t) => {
  const { config } = require('../config') as typeof import('../config');
  const { db } = require('../db') as typeof import('../db');

  const origWebhookUrl = config.webhookUrl;
  const origPublicBase = config.meta.publicBaseUrl;
  const origGetConfig = wahaService.getConfig.bind(wahaService);
  const origDbSelect = db.select.bind(db);
  const origCreate = axios.create;

  t.after(() => {
    config.webhookUrl = origWebhookUrl;
    config.meta.publicBaseUrl = origPublicBase;
    (wahaService as any).getConfig = origGetConfig;
    (db as any).select = origDbSelect;
    axios.create = origCreate;
  });

  config.webhookUrl = 'http://reneo-app-1-reneo-crm/api/waha/webhook';
  config.meta.publicBaseUrl = '';

  const settingsRows: Array<{ key: string; value: string }> = [];
  (db as any).select = () => ({
    from: () => ({
      where: async () => settingsRows,
    }),
  });

  (wahaService as any).getConfig = async () => ({
    mode: 'EXTERNAL',
    baseUrl: 'https://wagt.example.com',
    apiKey: 'ext-key',
    sessionName: 'HRIS_HR',
    isCustomUrl: true,
    hasApiKey: true,
    webhookUrlOverride: '',
  });

  const resolvedFromRequest = await (wahaService as any).resolveEffectiveWebhookUrl(
    undefined,
    'https://crm.claricebeauty.co.id'
  );
  assert.deepEqual(resolvedFromRequest, {
    url: 'https://crm.claricebeauty.co.id/api/waha/webhook',
    isPublic: true,
    source: 'request_origin',
  });

  let putCalled = false;
  axios.create = (() => ({
    get: async (url: string) => {
      if (url === '/api/version') {
        return { data: { version: '2026.8.2', engine: 'GOWS', tier: 'PLUS' } };
      }
      if (url.startsWith('/api/sessions/HRIS_HR')) {
        return {
          data: {
            name: 'HRIS_HR',
            status: 'WORKING',
            config: {
              webhooks: [{ url: 'https://manual-public.example.com/api/waha/webhook', events: ['message'] }],
            },
          },
        };
      }
      if (url.startsWith('/api/sessions')) {
        return { data: [{ name: 'HRIS_HR', status: 'WORKING' }] };
      }
      return { data: {} };
    },
    put: async () => {
      putCalled = true;
      return { data: {} };
    },
  })) as any;

  // Without any public URL available, EXTERNAL mode must NOT overwrite external WAHA webhook with internal Docker URL
  const status = await wahaService.getStatus();
  assert.equal(status.connected, true);
  assert.equal(putCalled, false);
});

test('resolveLidToPhone resolves @lid via WAHA lids endpoint and caches the result', async (t) => {
  const origGetConfig = wahaService.getConfig.bind(wahaService);
  const origCreate = axios.create;

  t.after(() => {
    (wahaService as any).getConfig = origGetConfig;
    axios.create = origCreate;
  });

  (wahaService as any).getConfig = async () => ({
    mode: 'EXTERNAL',
    baseUrl: 'https://wagt.example.com',
    apiKey: 'ext-key',
    sessionName: 'HRIS_HR',
    isCustomUrl: true,
    hasApiKey: true,
  });

  let lidApiCalls = 0;
  axios.create = (() => ({
    get: async (url: string) => {
      if (url === '/api/version') {
        return { data: { version: '2026.8.2', engine: 'GOWS', tier: 'PLUS' } };
      }
      if (url.includes('/api/HRIS_HR/lids/998877665544%40lid') || url.includes('/api/HRIS_HR/lids/998877665544@lid')) {
        lidApiCalls += 1;
        return { data: { lid: '998877665544@lid', pn: '6281122334455@c.us' } };
      }
      return { data: {} };
    },
  })) as any;

  const first = await wahaService.resolveLidToPhone('HRIS_HR', '998877665544@lid');
  const second = await wahaService.resolveLidToPhone('HRIS_HR', '998877665544@lid');

  assert.equal(first, '6281122334455');
  assert.equal(second, '6281122334455');
  assert.equal(lidApiCalls, 1);
});

test('inbound WAHA payload helpers extract phone candidates from @lid alt fields and message content', () => {
  const {
    isWahaFromMe,
    extractInboundWahaText,
    extractPhoneCandidatesFromWahaPayload,
  } = require('../routes/waha') as typeof import('../routes/waha');

  const lidPayload = {
    from: '123456789012345@lid',
    fromMe: false,
    body: '',
    caption: 'Halo kak, mau tanya promo',
    _data: {
      Info: {
        SenderAlt: '6281299988877:3@s.whatsapp.net',
        IsFromMe: false,
      },
    },
  };

  assert.equal(isWahaFromMe(lidPayload), false);
  assert.equal(extractInboundWahaText(lidPayload), 'Halo kak, mau tanya promo');
  assert.deepEqual(extractPhoneCandidatesFromWahaPayload(lidPayload), ['6281299988877']);

  const keyPayload = {
    from: '123456789012345@lid',
    _data: {
      key: {
        fromMe: true,
        remoteJidAlt: '0813-5555-6666@s.whatsapp.net',
      },
      message: {
        extendedTextMessage: { text: 'Balasan dari HP' },
      },
    },
  };

  assert.equal(isWahaFromMe(keyPayload), true);
  assert.equal(extractInboundWahaText(keyPayload), 'Balasan dari HP');
  assert.deepEqual(extractPhoneCandidatesFromWahaPayload(keyPayload), ['6281355556666']);

  assert.equal(extractInboundWahaText({ location: { latitude: -6.2 } }), '[Lokasi dibagikan]');
  assert.equal(extractInboundWahaText({ type: 'sticker' }), '[Stiker]');
  assert.equal(extractInboundWahaText({ vCards: ['BEGIN:VCARD'] }), '[Kontak dibagikan]');
});

test('toWahaChatId strips device suffixes and rejects empty recipients safely', () => {
  const { toWahaChatId } = require('./phone.utils') as typeof import('./phone.utils');

  assert.equal(toWahaChatId(''), '');
  assert.equal(toWahaChatId('   '), '');
  assert.equal(toWahaChatId('081234567890'), '6281234567890@c.us');
  assert.equal(toWahaChatId('6281234567890:12@s.whatsapp.net'), '6281234567890@c.us');
  assert.equal(toWahaChatId('123456789012345:0@lid'), '123456789012345@lid');
});

test('sendTextMessage & sendMediaMessage resolve away from stale default session, fallback video->file, and reject empty target', async (t) => {
  const origGetConfig = wahaService.getConfig.bind(wahaService);
  const origCreate = axios.create;

  t.after(() => {
    (wahaService as any).getConfig = origGetConfig;
    axios.create = origCreate;
  });

  (wahaService as any).getConfig = async () => ({
    mode: 'EXTERNAL',
    baseUrl: 'https://wagt.example.com',
    apiKey: 'ext-key',
    session: 'default',
    internalLocked: false,
    hasApiKey: true,
  });

  const invalid = await wahaService.sendTextMessage('', 'Halo');
  assert.equal(invalid.success, false);

  const posted: Array<{ url: string; body: any }> = [];
  axios.create = (() => ({
    get: async (url: string) => {
      if (url === '/api/version') {
        return { data: { version: '2026.8.2', engine: 'GOWS', tier: 'PLUS' } };
      }
      if (url.startsWith('/api/sessions/WA_OFF')) {
        return { data: { name: 'WA_OFF', status: 'SCAN_QR_CODE' } };
      }
      if (url.startsWith('/api/sessions')) {
        return {
          data: [
            { name: 'HRIS_MINTI', status: 'STOPPED' },
            { name: 'HRIS_HR', status: 'WORKING' },
          ],
        };
      }
      return { data: {} };
    },
    post: async (url: string, body: any) => {
      posted.push({ url, body });
      if (url === '/api/sendVideo') {
        const err: any = new Error('Not Found');
        err.response = { status: 404, data: { message: 'Not Found' } };
        throw err;
      }
      if (body?.session === 'WA_OFF') {
        const err: any = new Error('Unprocessable Entity');
        err.response = { status: 422, data: { message: 'Session WA_OFF is not WORKING' } };
        throw err;
      }
      return { data: { id: { _serialized: `true_${body.chatId}_MSG123` } } };
    },
  })) as any;

  const textRes = await wahaService.sendTextMessage('0812-3456-7890', 'Tes kirim', undefined, {
    replyTo: 'true_6281234567890@c.us_ORIG1',
  });
  assert.equal(textRes.success, true);
  assert.equal(textRes.sessionUsed, 'HRIS_HR');
  assert.equal(textRes.messageId, 'true_6281234567890@c.us_MSG123');
  assert.equal(posted[0].url, '/api/sendText');
  assert.equal(posted[0].body.session, 'HRIS_HR');
  assert.equal(posted[0].body.chatId, '6281234567890@c.us');
  assert.equal(posted[0].body.reply_to, 'true_6281234567890@c.us_ORIG1');

  const videoRes = await wahaService.sendMediaMessage(
    '123456789012345@lid',
    {
      base64: 'data:video/mp4;base64,AAAA',
      mimetype: 'video/mp4',
      filename: 'promo.mp4',
      caption: 'Video promo',
      replyTo: 'true_123456789012345@lid_ORIG2',
    },
    'HRIS_HR'
  );
  assert.equal(videoRes.success, true);
  assert.equal(videoRes.sessionUsed, 'HRIS_HR');
  assert.equal(posted[1].url, '/api/sendVideo');
  assert.equal(posted[2].url, '/api/sendFile');
  assert.equal(posted[2].body.chatId, '123456789012345@lid');
  assert.equal(posted[2].body.reply_to, 'true_123456789012345@lid_ORIG2');

  const docImgRes = await wahaService.sendMediaMessage(
    '081234567890',
    {
      base64: 'data:image/png;base64,iVBOR',
      mimetype: 'image/png',
      filename: 'invoice.png',
      asDocument: true,
    },
    'HRIS_HR'
  );
  assert.equal(docImgRes.success, true);
  assert.equal(posted[3].url, '/api/sendFile');
  assert.equal(posted[3].body.file.filename, 'invoice.png');

  const stoppedRes = await wahaService.sendTextMessage('081234567890', 'Halo', 'WA_OFF');
  assert.equal(stoppedRes.success, false);
  assert.match(stoppedRes.error || '', /SCAN_QR_CODE/);
});

test('sendSeen, setTyping, sendLinkPreviewMessage, sendButtonsMessage, sendPollMessage work with WAHA endpoints and graceful fallbacks', async (t) => {
  const origGetConfig = wahaService.getConfig.bind(wahaService);
  const origCreate = axios.create;

  t.after(() => {
    (wahaService as any).getConfig = origGetConfig;
    axios.create = origCreate;
  });

  (wahaService as any).getConfig = async () => ({
    mode: 'EXTERNAL',
    baseUrl: 'https://wagt.example.com',
    apiKey: 'ext-key',
    session: 'HRIS_HR',
    internalLocked: false,
    hasApiKey: true,
  });

  const posted: Array<{ url: string; body: any }> = [];
  let failSendButtons = true;
  let failCustomPreview = true;
  let failSendSeenPrimary = true;

  axios.create = (() => ({
    get: async (url: string) =>
      url === '/api/version'
        ? { data: { version: '2026.8.2', engine: 'GOWS', tier: 'PLUS' } }
        : { data: [{ name: 'HRIS_HR', status: 'WORKING' }] },
    post: async (url: string, body: any) => {
      posted.push({ url, body });
      if (url === '/api/sendSeen' && failSendSeenPrimary) {
        const err: any = new Error('Not Found');
        err.response = { status: 404, data: { message: 'Not Found' } };
        throw err;
      }
      if (url === '/api/send/link-custom-preview' && failCustomPreview) {
        const err: any = new Error('Not Implemented');
        err.response = { status: 501, data: { message: 'Not Implemented' } };
        throw err;
      }
      if (url === '/api/sendButtons' && failSendButtons) {
        const err: any = new Error('Buttons are deprecated');
        err.response = { status: 422, data: { message: 'Buttons are deprecated on this engine' } };
        throw err;
      }
      return { data: { id: { _serialized: `true_${body?.chatId || 'x'}_OK1` } } };
    },
  })) as any;

  // 1. sendSeen (primary 404 -> fallback chats/.../messages/read)
  const seenRes = await wahaService.sendSeen('081234567890', 'HRIS_HR', {
    messageIds: ['false_6281234567890@c.us_IN1'],
  });
  assert.equal(seenRes.success, true);
  assert.equal(posted[0].url, '/api/sendSeen');
  assert.equal(posted[0].body.messageId, 'false_6281234567890@c.us_IN1');
  assert.equal(posted[1].url, '/api/HRIS_HR/chats/6281234567890%40c.us/messages/read');

  // 2. setTyping start & stop
  const startTyp = await wahaService.setTyping('081234567890', true, 'HRIS_HR');
  const stopTyp = await wahaService.setTyping('081234567890', false, 'HRIS_HR');
  assert.equal(startTyp.success, true);
  assert.equal(stopTyp.success, true);
  assert.equal(posted[2].url, '/api/startTyping');
  assert.equal(posted[3].url, '/api/stopTyping');

  // 3. sendLinkPreviewMessage fallback -> sendText with linkPreview: true, and native preview when supported
  const linkFallbackRes = await wahaService.sendLinkPreviewMessage(
    '081234567890',
    {
      url: 'https://reneo.id/promo',
      title: 'Promo Akhir Bulan',
      description: 'Diskon 30%',
      caption: 'Cek katalog kami',
      replyTo: 'ORIG_LINK',
    },
    'HRIS_HR'
  );
  assert.equal(linkFallbackRes.success, true);
  assert.equal(linkFallbackRes.usedFallbackText, true);
  assert.equal(posted[4].url, '/api/send/link-custom-preview');
  assert.equal(posted[5].url, '/api/sendText');
  assert.equal(posted[5].body.linkPreview, true);
  assert.equal(posted[5].body.reply_to, 'ORIG_LINK');
  assert.match(posted[5].body.text, /https:\/\/reneo\.id\/promo/);

  failCustomPreview = false;
  const linkNativeRes = await wahaService.sendLinkPreviewMessage(
    '081234567890',
    {
      url: 'https://reneo.id/promo',
      title: 'Promo',
      imageUrl: 'https://reneo.id/thumb.png',
    },
    'HRIS_HR'
  );
  assert.equal(linkNativeRes.success, true);
  assert.equal(linkNativeRes.usedFallbackText, undefined);
  assert.equal(posted[6].url, '/api/send/link-custom-preview');
  assert.equal(posted[6].body.preview.image.url, 'https://reneo.id/thumb.png');

  // 4. sendButtonsMessage fallback when WAHA rejects buttons, strict failure when fallback disabled, and native success
  const btnFallbackRes = await wahaService.sendButtonsMessage(
    '081234567890',
    {
      header: 'Konfirmasi Order',
      body: 'Pilih tindakan:',
      footer: 'Tim CS Reneo',
      buttons: [
        { type: 'reply', text: 'Ya, Lanjut' },
        { type: 'url', text: 'Buka Invoice', url: 'https://reneo.id/inv/1' },
      ],
      fallbackTextOnUnsupported: true,
    },
    'HRIS_HR'
  );
  assert.equal(btnFallbackRes.success, true);
  assert.equal(btnFallbackRes.usedFallbackText, true);
  assert.equal(posted[7].url, '/api/sendButtons');
  assert.equal(posted[8].url, '/api/sendText');
  assert.match(posted[8].body.text, /1\. Ya, Lanjut/);
  assert.match(posted[8].body.text, /2\. Buka Invoice: https:\/\/reneo\.id\/inv\/1/);

  const btnStrictFail = await wahaService.sendButtonsMessage(
    '081234567890',
    {
      body: 'Pilih:',
      buttons: [{ type: 'reply', text: 'Oke' }],
      fallbackTextOnUnsupported: false,
    },
    'HRIS_HR'
  );
  assert.equal(btnStrictFail.success, false);

  failSendButtons = false;
  const btnNativeRes = await wahaService.sendButtonsMessage(
    '081234567890',
    {
      body: 'Silakan pilih:',
      buttons: [
        { type: 'reply', text: 'Setuju' },
        { type: 'copy', text: 'Salin Promo', copyCode: 'RENEO20' },
      ],
    },
    'HRIS_HR'
  );
  assert.equal(btnNativeRes.success, true);
  assert.equal(btnNativeRes.usedFallbackText, undefined);
  assert.equal(posted[10].url, '/api/sendButtons');
  assert.equal(posted[10].body.buttons[1].copyCode, 'RENEO20');

  // 5. sendPollMessage
  const pollRes = await wahaService.sendPollMessage(
    '081234567890',
    {
      question: 'Jadwal yang paling sesuai?',
      options: ['Pagi', 'Siang', 'Sore'],
      multipleAnswers: false,
    },
    'HRIS_HR'
  );
  assert.equal(pollRes.success, true);
  assert.equal(posted[11].url, '/api/sendPoll');
  assert.equal(posted[11].body.poll.name, 'Jadwal yang paling sesuai?');
  assert.deepEqual(posted[11].body.poll.options, ['Pagi', 'Siang', 'Sore']);
});

test('extractWahaPresence & interactiveResponseMessage parse presence and interactive button replies', () => {
  const { extractWahaPresence, extractInboundWahaText } = require('../routes/waha') as typeof import('../routes/waha');

  assert.deepEqual(
    extractWahaPresence({
      id: '6281234567890@c.us',
      presences: [{ participant: '6281234567890@c.us', lastKnownPresence: 'composing' }],
    }),
    { chatId: '6281234567890@c.us', status: 'typing' }
  );
  assert.deepEqual(
    extractWahaPresence({ id: '99887766@lid', lastKnownPresence: 'recording' }),
    { chatId: '99887766@lid', status: 'recording' }
  );
  assert.deepEqual(
    extractWahaPresence({ id: '6281234567890@c.us', presence: 'paused' }),
    { chatId: '6281234567890@c.us', status: 'paused' }
  );
  assert.equal(
    extractWahaPresence({ id: '120363000000@g.us', presences: [{ lastKnownPresence: 'composing' }] }),
    null
  );

  assert.equal(
    extractInboundWahaText({
      _data: { message: { interactiveResponseMessage: { body: { text: 'Konfirmasi Bayar' } } } },
    }),
    'Konfirmasi Bayar'
  );
});

test('inbound WAHA media extraction, unmasked downloadMedia proxy, and mime normalization work end-to-end', async (t) => {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const { resolveWahaMediaTargetUrl } = require('./waha.service') as typeof import('./waha.service');
  const { extractInboundWahaMediaMeta, extractInboundWahaText } = require('../routes/waha') as typeof import('../routes/waha');
  const { saveBase64MediaFile } = require('../routes/media') as typeof import('../routes/media');

  assert.equal(
    resolveWahaMediaTargetUrl('http://localhost:3000/api/files/default/a.jpg', 'http://127.0.0.1:4100')?.toString(),
    'http://127.0.0.1:4100/api/files/default/a.jpg'
  );
  assert.equal(
    resolveWahaMediaTargetUrl('http://waha:3000/api/files/default/b.mp4', 'https://waha.example.com')?.toString(),
    'https://waha.example.com/api/files/default/b.mp4'
  );
  assert.equal(
    resolveWahaMediaTargetUrl('/api/files/c.pdf', 'https://waha.example.com')?.toString(),
    'https://waha.example.com/api/files/c.pdf'
  );
  assert.equal(
    resolveWahaMediaTargetUrl('https://evil.example.com/secret', 'https://waha.example.com'),
    null
  );

  const origGetConfig = wahaService.getConfig.bind(wahaService);
  const origAxiosGet = axios.get;
  t.after(() => {
    (wahaService as any).getConfig = origGetConfig;
    (axios as any).get = origAxiosGet;
  });

  (wahaService as any).getConfig = async (maskSecret = false) => ({
    mode: 'INTERNAL',
    baseUrl: 'http://127.0.0.1:4100',
    apiKey: maskSecret ? '••••••••' : 'real-secret-waha-key',
    session: 'default',
    internalLocked: true,
    hasApiKey: true,
  });

  let capturedUrl = '';
  let capturedHeaders: Record<string, string> = {};
  (axios as any).get = async (url: string, cfg: any) => {
    capturedUrl = url;
    capturedHeaders = cfg?.headers || {};
    return {
      data: Buffer.from([1, 2, 3, 4]),
      headers: { 'content-type': 'image/jpeg' },
    };
  };

  const downloaded = await wahaService.downloadMedia('http://localhost:3000/api/files/default/foto.jpg');
  assert.equal(capturedUrl, 'http://127.0.0.1:4100/api/files/default/foto.jpg');
  assert.equal(capturedHeaders['X-Api-Key'], 'real-secret-waha-key');
  assert.equal(downloaded.contentType, 'image/jpeg');
  assert.equal(downloaded.buffer.length, 4);

  const imgMeta = extractInboundWahaMediaMeta({
    hasMedia: true,
    media: {
      url: 'http://localhost:3000/api/files/default/img.jpg',
      mimetype: 'image/jpeg',
      filename: 'bukti-tf.jpg',
    },
  });
  assert.equal(imgMeta.hasMedia, true);
  assert.equal(imgMeta.mediaType, 'image');
  assert.equal(imgMeta.mimetype, 'image/jpeg');
  assert.equal(imgMeta.mediaName, 'bukti-tf.jpg');

  const pttMeta = extractInboundWahaMediaMeta({
    hasMedia: true,
    type: 'ptt',
    media: {
      url: '/api/files/default/voice.ogg',
      mimetype: 'audio/ogg; codecs=opus',
    },
  });
  assert.equal(pttMeta.mediaType, 'audio');
  assert.equal(pttMeta.mimetype, 'audio/ogg');

  const stickerMeta = extractInboundWahaMediaMeta({
    hasMedia: true,
    type: 'sticker',
    _data: { message: { stickerMessage: { mimetype: 'image/webp' } } },
    media: { url: '/api/files/default/stk.webp' },
  });
  assert.equal(stickerMeta.mediaType, 'image');
  assert.equal(stickerMeta.isSticker, true);
  assert.equal(stickerMeta.mimetype, 'image/webp');

  const docCapPayload = {
    _data: {
      message: {
        documentWithCaptionMessage: {
          message: {
            documentMessage: {
              mimetype: 'application/pdf',
              fileName: 'invoice-01.pdf',
              caption: 'Berikut invoice tagihan Anda',
            },
          },
        },
      },
    },
    media: { url: '/api/files/default/invoice-01.pdf' },
  };
  const docMeta = extractInboundWahaMediaMeta(docCapPayload);
  assert.equal(docMeta.mediaType, 'document');
  assert.equal(docMeta.mediaName, 'invoice-01.pdf');
  assert.equal(extractInboundWahaText(docCapPayload), 'Berikut invoice tagihan Anda');

  const savedOgg = await saveBase64MediaFile({
    base64: Buffer.from('OggS').toString('base64'),
    mimeType: 'audio/ogg; codecs=opus',
  });
  t.after(async () => {
    await fs.promises.unlink(path.resolve(process.cwd(), 'uploads', savedOgg.filename)).catch(() => {});
  });
  assert.match(savedOgg.relativeUrl, /\.ogg$/);
});

test('WhatsApp Status sending, deletion, viewer parsing, and ACK ID extraction work accurately', async (t) => {
  const { extractStatusReceiptsFromWahaMessage } = require('./waha.service') as typeof import('./waha.service');
  const { extractWahaMessageIds, extractStatusAckParticipant } = require('../routes/waha') as typeof import('../routes/waha');

  // 1. Test status@broadcast ACK stanza & participant extraction
  const ackPayload = {
    id: 'false_status@broadcast_3EB0ABCDEF12_628123456789@c.us',
    from: 'status@broadcast',
    ack: 3,
  };
  const { exactIds, stanzaIds } = extractWahaMessageIds(ackPayload);
  assert.ok(exactIds.includes('false_status@broadcast_3EB0ABCDEF12_628123456789@c.us'));
  assert.ok(stanzaIds.includes('3EB0ABCDEF12'));
  assert.equal(extractStatusAckParticipant(ackPayload, exactIds), '628123456789@c.us');

  // 1b. Test 4-segment group message ID (`<fromMe>_<group>@g.us_<STANZA>_<participantJid>`) stanza extraction
  const groupOutIds = extractWahaMessageIds({
    id: 'true_120363123456789012@g.us_3EB0GRP987654_628123456789@c.us',
    fromMe: true,
  });
  assert.ok(groupOutIds.stanzaIds.includes('3EB0GRP987654'));
  const groupLidIds = extractWahaMessageIds({
    id: 'true_120363123456789012@g.us_3EB0GRP987654_99887766554433@lid',
    fromMe: true,
  });
  assert.ok(groupLidIds.stanzaIds.includes('3EB0GRP987654'));

  // 1c. Test per-participant group message receipt extraction & metadata upsert
  const { extractGroupAckParticipant, upsertGroupMessageReceiptInMetadata } =
    require('../routes/waha') as typeof import('../routes/waha');
  assert.equal(
    extractGroupAckParticipant(
      { id: 'true_120363123456789012@g.us_3EB0GRP987654_628123456789@c.us', from: '120363123456789012@g.us', ack: 2 },
      ['true_120363123456789012@g.us_3EB0GRP987654_628123456789@c.us']
    ),
    '628123456789@c.us'
  );
  const t1 = new Date('2026-11-20T06:30:00.000Z');
  const t2 = new Date('2026-11-20T06:31:00.000Z');
  const afterDelivered = upsertGroupMessageReceiptInMetadata(null, {
    jid: '628123456789@c.us',
    phone: '628123456789',
    name: 'Mba Dwi',
    ackStatus: 2,
    at: t1,
  });
  const afterRead = upsertGroupMessageReceiptInMetadata(afterDelivered, {
    jid: '628123456789@c.us',
    phone: '628123456789',
    name: 'Mba Dwi',
    ackStatus: 3,
    at: t2,
  });
  const parsedReceipts = JSON.parse(afterRead).receipts;
  assert.equal(parsedReceipts.length, 1);
  assert.equal(parsedReceipts[0].ackStatus, 3);
  assert.equal(parsedReceipts[0].deliveredAt, t1.toISOString());
  assert.equal(parsedReceipts[0].readAt, t2.toISOString());

  // 1d. Test self-reaction dedup (CRM CS reaction + WAHA fromMe echo stays count=1)
  const { upsertReactionInList } = require('../routes/waha') as typeof import('../routes/waha');
  const afterCsReact = upsertReactionInList([], { emoji: '👍', actor: 'CS', isOutbound: true });
  const afterWahaEcho = upsertReactionInList(afterCsReact, {
    emoji: '👍',
    actor: '6285155431301@c.us',
    isOutbound: true,
  });
  assert.equal(afterWahaEcho.length, 1);
  assert.equal(afterWahaEcho[0].actor, 'CS');
  assert.equal(afterWahaEcho[0].isOutbound, true);

  const nestedParticipant = extractStatusAckParticipant(
    { participant: '628987654321@lid', id: 'false_status@broadcast_3EB0999' },
    ['false_status@broadcast_3EB0999']
  );
  assert.equal(nestedParticipant, '628987654321@lid');

  // 2. Test WAHA message receipt parser (_data.receipts & Info.ReadBy)
  const gowsReceipts = extractStatusReceiptsFromWahaMessage({
    _data: {
      Info: {
        ReadBy: ['628111222333@s.whatsapp.net', '628444555666@lid'],
      },
      receipts: [
        { userJid: '628777888999@c.us', readTimestamp: 1700000100 },
      ],
    },
  });
  assert.equal(gowsReceipts.length, 3);
  assert.ok(gowsReceipts.some((r) => r.viewerJid === '628111222333@s.whatsapp.net' && r.ackStatus === 3));
  assert.ok(
    gowsReceipts.some(
      (r) =>
        r.viewerJid === '628777888999@c.us' &&
        Boolean(r.viewedAt) &&
        new Date(r.viewedAt as string).getTime() === 1700000100 * 1000
    )
  );

  // 3. Test sendTextStatus, sendMediaStatus, contacts rejection guard, deleteStatus & fetchStatusViewers
  stubWahaEnvSession(t, 'marketing');
  stubGetConfig(t, {
    mode: 'EXTERNAL',
    baseUrl: 'https://waha.example.com',
    apiKey: 'secret-token',
    session: 'marketing',
    internalLocked: false,
    hasApiKey: true,
  });

  const origCreate = axios.create;
  t.after(() => {
    axios.create = origCreate;
  });

  const postCalls: Array<{ url: string; body: any }> = [];
  axios.create = (() =>
    ({
      get: async (url: string) => {
        if (url === '/api/version') {
          return { data: { version: '2026.8.2', engine: 'GOWS', tier: 'PLUS' } };
        }
        if (url === '/api/sessions?all=true') {
          return { data: [{ name: 'marketing', status: 'WORKING' }] };
        }
        if (url.includes('/chats/status%40broadcast/messages/')) {
          return {
            data: {
              id: 'true_status@broadcast_STAT999',
              receipts: [{ jid: '628123456@c.us', ack: 3, timestamp: 1700000200 }],
            },
          };
        }
        throw new Error(`Unexpected GET ${url}`);
      },
      post: async (url: string, body: any) => {
        postCalls.push({ url, body });
        if (url.includes('/status/image') && Array.isArray(body?.contacts)) {
          throw new Error('contacts property is not supported in WEBJS engine');
        }
        return { data: { id: { _serialized: 'true_status@broadcast_STAT999' } } };
      },
      put: async () => ({ data: {} }),
      delete: async () => ({ data: {} }),
    }) as any) as any;

  const textRes = await wahaService.sendTextStatus(
    {
      text: 'Promo Akhir Pekan',
      backgroundColor: '#1d4ed8',
      font: 2,
      contacts: ['08123456789'],
    },
    'marketing'
  );
  assert.equal(textRes.messageId, 'true_status@broadcast_STAT999');
  assert.equal(postCalls[0]?.url, '/api/marketing/status/text');
  assert.deepEqual(postCalls[0]?.body?.contacts, ['628123456789@c.us']);

  const imgFailRes = await wahaService.sendMediaStatus(
    {
      mediaType: 'image',
      file: { base64: 'data:image/jpeg;base64,ZmFrZQ==', mimetype: 'image/jpeg', filename: 'story.jpg' },
      caption: 'Diskon 50%',
      contacts: ['628123456789'],
    },
    'marketing'
  );
  assert.equal(imgFailRes.success, false);
  assert.match(imgFailRes.error || '', /tidak mendukung filter daftar kontak/i);

  await wahaService.deleteStatus('true_status@broadcast_STAT999', 'marketing');
  assert.equal(postCalls[postCalls.length - 1]?.url, '/api/marketing/status/delete');
  assert.equal(postCalls[postCalls.length - 1]?.body?.id, 'true_status@broadcast_STAT999');

  const viewers = await wahaService.fetchStatusViewers('true_status@broadcast_STAT999', 'marketing');
  assert.equal(viewers.length, 1);
  assert.equal(viewers[0]?.viewerJid, '628123456@c.us');
});

test('WAHA contact synchronization and group metadata normalization support GOWS, NOWEB, and WEBJS shapes', async (t) => {
  const { normalizeWahaContactEntries, normalizeWahaGroupInfo } = require('./waha.service') as typeof import('./waha.service');
  const { extractGroupParticipant } = require('../routes/waha') as typeof import('../routes/waha');

  const gowsGroupPart = extractGroupParticipant({
    from: '12036300112233@g.us',
    _data: {
      Info: {
        Chat: '12036300112233@g.us',
        Sender: '9988776655@lid',
        SenderAlt: '628111222333:2@s.whatsapp.net',
      },
    },
  });
  assert.equal(gowsGroupPart.participantJid, '628111222333:2@s.whatsapp.net');
  assert.equal(gowsGroupPart.participantPhone, '628111222333');

  const webjsGroupPart = extractGroupParticipant({
    from: '12036300112233@g.us',
    participant: '628777888999@c.us',
  });
  assert.equal(webjsGroupPart.participantJid, '628777888999@c.us');
  assert.equal(webjsGroupPart.participantPhone, '628777888999');

  const lidMap = new Map<string, string>([['9988776655@lid', '6285511223344']]);
  const normalizedContacts = normalizeWahaContactEntries(
    [
      { id: '628111222333@c.us', name: 'Budi CRM', pushname: 'Budi', isMyContact: true },
      { id: '9988776655@lid', pushName: 'Lid Customer' },
      { id: '12036300112233@g.us', name: 'Group Should Skip', isGroup: true },
      { id: '628000000000@c.us', name: 'Self', isMe: true },
      { id: 'status@broadcast', name: 'Status' },
    ],
    lidMap
  );
  assert.equal(normalizedContacts.length, 2);
  assert.equal(normalizedContacts[0]?.phone, '628111222333');
  assert.equal(normalizedContacts[0]?.name, 'Budi CRM');
  assert.equal(normalizedContacts[1]?.phone, '6285511223344');
  assert.equal(normalizedContacts[1]?.lid, '9988776655@lid');
  assert.equal(normalizedContacts[1]?.pushName, 'Lid Customer');

  const groupInfo = normalizeWahaGroupInfo(
    '12036300112233@g.us',
    {
      Subject: 'Tim Sales Internal',
      Participants: [
        { JID: '628111222333@s.whatsapp.net', IsSuperAdmin: true, FullName: 'Leader' },
        { JID: '9988776655@lid', IsAdmin: true, PushName: 'Admin WA' },
        { JID: '628999888777:4@s.whatsapp.net' },
      ],
    },
    lidMap
  );
  assert.ok(groupInfo);
  assert.equal(groupInfo.subject, 'Tim Sales Internal');
  assert.equal(groupInfo.participants.length, 3);
  assert.equal(groupInfo.participants[0]?.role, 'superadmin');
  assert.equal(groupInfo.participants[1]?.phone, '6285511223344');
  assert.equal(groupInfo.participants[1]?.role, 'admin');
  assert.equal(groupInfo.participants[2]?.phone, '628999888777');
  assert.equal(groupInfo.participants[2]?.role, 'member');

  stubWahaEnvSession(t, 'sales');
  stubGetConfig(t, {
    mode: 'EXTERNAL',
    baseUrl: 'https://waha.example.com',
    apiKey: 'secret-token',
    session: 'sales',
    internalLocked: false,
    hasApiKey: true,
  });

  const origCreate = axios.create;
  t.after(() => {
    axios.create = origCreate;
  });

  axios.create = (() =>
    ({
      get: async (url: string) => {
        if (url === '/api/version') {
          return { data: { version: '2026.8.2', engine: 'GOWS', tier: 'PLUS' } };
        }
        if (url === '/api/contacts/all') {
          return {
            data: [
              { id: '08123456789@c.us', name: 'Andi Wijaya', isMyContact: true },
              { id: '9988776655@lid', pushName: 'Sari Lid' },
            ],
          };
        }
        if (url === '/api/sales/lids') {
          return { data: [{ lid: '9988776655@lid', pn: '6285511223344@s.whatsapp.net' }] };
        }
        if (url === '/api/sales/groups/12036300112233%40g.us') {
          return {
            data: {
              subject: 'Koordinasi Vendor',
              participants: [{ id: '628123456789@c.us', isAdmin: true }],
            },
          };
        }
        throw new Error(`Unexpected GET ${url}`);
      },
      post: async () => ({ data: {} }),
      put: async () => ({ data: {} }),
      delete: async () => ({ data: {} }),
    }) as any) as any;

  const synced = await wahaService.fetchAllContacts('sales');
  assert.equal(synced.sessionUsed, 'sales');
  assert.equal(synced.contacts.length, 2);
  assert.equal(synced.contacts[0]?.phone, '628123456789');
  assert.equal(synced.contacts[1]?.phone, '6285511223344');

  const grp = await wahaService.getGroupInfo('12036300112233@g.us', 'sales');
  assert.ok(grp);
  assert.equal(grp.subject, 'Koordinasi Vendor');
  assert.equal(grp.participants[0]?.role, 'admin');
});

test('deleteMessage revokes WhatsApp message via WAHA DELETE endpoint with POST fallback', async (t) => {
  stubWahaEnvSession(t, 'sales');
  stubGetConfig(t, {
    mode: 'EXTERNAL',
    baseUrl: 'https://waha.example.com',
    apiKey: 'secret-token',
    session: 'sales',
    internalLocked: false,
    hasApiKey: true,
  });

  const origCreate = axios.create;
  t.after(() => {
    axios.create = origCreate;
  });

  const deletedUrls: string[] = [];
  const postedFallback: Array<{ url: string; body: any }> = [];
  let simulate404 = false;

  axios.create = (() =>
    ({
      get: async (url: string) =>
        url === '/api/version'
          ? { data: { version: '2026.8.2', engine: 'GOWS', tier: 'PLUS' } }
          : { data: [{ name: 'sales', status: 'WORKING' }] },
      delete: async (url: string) => {
        if (simulate404) {
          const err: any = new Error('Not found');
          err.response = { status: 404, data: { message: 'Not Found' } };
          throw err;
        }
        deletedUrls.push(url);
        return { data: { ok: true } };
      },
      post: async (url: string, body: any) => {
        postedFallback.push({ url, body });
        return { data: { ok: true } };
      },
      put: async () => ({ data: {} }),
    }) as any) as any;

  const emptyIdRes = await wahaService.deleteMessage('08123456789', '', 'sales');
  assert.equal(emptyIdRes.success, false);

  const okRes = await wahaService.deleteMessage('08123456789', 'true_628123456789@c.us_ABC123', 'sales');
  assert.equal(okRes.success, true);
  assert.equal(
    deletedUrls[0],
    '/api/sales/chats/628123456789%40c.us/messages/true_628123456789%40c.us_ABC123'
  );

  simulate404 = true;
  const fallbackRes = await wahaService.deleteMessage('12036300112233@g.us', 'true_12036300112233@g.us_XYZ', 'sales');
  assert.equal(fallbackRes.success, true);
  assert.equal(postedFallback[0]?.url, '/api/messages/delete');
  assert.deepEqual(postedFallback[0]?.body, {
    session: 'sales',
    chatId: '12036300112233@g.us',
    messageId: 'true_12036300112233@g.us_XYZ',
  });
});

test('fetchAllContacts paginates beyond 500 contacts and recovers from capped /contacts/all via /api/contacts', async (t) => {
  stubWahaEnvSession(t, 'sales');
  stubGetConfig(t, {
    mode: 'EXTERNAL',
    baseUrl: 'https://waha.example.com',
    apiKey: 'secret-token',
    session: 'sales',
    internalLocked: false,
    hasApiKey: true,
  });

  const origCreate = axios.create;
  t.after(() => {
    axios.create = origCreate;
  });

  const makeEntry = (idx: number) => ({
    id: `6281100${String(idx).padStart(6, '0')}@c.us`,
    name: `Kontak ${idx}`,
    isMyContact: true,
  });

  // Scenario A: /api/contacts/all paginates with 500-item chunks up to 1250 total
  const all1250 = Array.from({ length: 1250 }, (_, i) => makeEntry(i + 1));
  axios.create = (() =>
    ({
      get: async (url: string, cfg?: any) => {
        if (url === '/api/version') {
          return { data: { version: '2026.8.2', engine: 'GOWS', tier: 'PLUS' } };
        }
        if (url === '/api/contacts/all') {
          const off = Number(cfg?.params?.offset || 0);
          return { data: all1250.slice(off, off + 500) };
        }
        if (url === '/api/contacts') {
          const off = Number(cfg?.params?.offset || 0);
          return { data: all1250.slice(off, off + 500) };
        }
        return { data: [] };
      },
    }) as any) as any;

  const pagedRes = await wahaService.fetchAllContacts('sales');
  assert.equal(pagedRes.contacts.length, 1250);

  // Scenario B: /api/contacts/all hard-caps at 500 ignoring offset, while /api/contacts supports offset up to 1250
  axios.create = (() =>
    ({
      get: async (url: string, cfg?: any) => {
        if (url === '/api/version') {
          return { data: { version: '2026.8.2', engine: 'GOWS', tier: 'PLUS' } };
        }
        if (url === '/api/contacts/all') {
          return { data: all1250.slice(0, 500) };
        }
        if (url === '/api/contacts') {
          const off = Number(cfg?.params?.offset || 0);
          return { data: all1250.slice(off, off + 500) };
        }
        return { data: [] };
      },
    }) as any) as any;

  const fallbackPagedRes = await wahaService.fetchAllContacts('sales');
  assert.equal(fallbackPagedRes.contacts.length, 1250);
  assert.equal(fallbackPagedRes.contacts[1249]?.name, 'Kontak 1250');
});

test('parseVCardString, buildVCardString, and extractInboundWahaRichData capture shared contacts, locations, stickers, polls, orders, and reactions', () => {
  const built = buildVCardString({
    fullName: 'Budi Santoso',
    phoneNumber: '0812-3456-7890',
    organization: 'PT Maju Jaya',
    email: 'budi@majujaya.id',
  });
  const parsedVcard = parseVCardString(built);
  assert.ok(parsedVcard);
  assert.equal(parsedVcard?.fullName, 'Budi Santoso');
  assert.equal(parsedVcard?.organization, 'PT Maju Jaya');
  assert.equal(parsedVcard?.email, 'budi@majujaya.id');
  assert.equal(parsedVcard?.waId, '6281234567890');
  assert.ok(parsedVcard?.phones.includes('6281234567890'));

  // Shared contacts (vCards array / contactsArrayMessage)
  const contactRich = extractInboundWahaRichData(
    {
      _data: {
        message: {
          contactsArrayMessage: {
            contacts: [
              { displayName: 'Budi', vcard: built },
              { displayName: 'Siti', vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN:Siti Aminah\nTEL;waid=628987654321:+628987654321\nEND:VCARD' },
            ],
          },
        },
      },
    },
    {
      hasMedia: false,
      rawMediaUrl: null,
      inlineBase64: null,
      mimetype: null,
      mediaType: null,
      mediaName: null,
      isSticker: false,
    }
  );
  assert.equal(contactRich.messageType, 'CONTACT');
  assert.equal(contactRich.metadata?.kind, 'CONTACT');
  assert.equal(contactRich.metadata?.sharedContacts?.length, 2);
  assert.equal(contactRich.metadata?.sharedContacts?.[1]?.fullName, 'Siti Aminah');

  // Location & Live Location
  const locRich = extractInboundWahaRichData(
    {
      location: {
        latitude: -6.2,
        longitude: 106.816666,
        name: 'Kantor Pusat Reneo',
        address: 'Jl. Sudirman No. 10, Jakarta',
      },
    },
    {
      hasMedia: false,
      rawMediaUrl: null,
      inlineBase64: null,
      mimetype: null,
      mediaType: null,
      mediaName: null,
      isSticker: false,
    }
  );
  assert.equal(locRich.messageType, 'LOCATION');
  assert.equal(locRich.metadata?.kind, 'LOCATION');
  assert.equal(locRich.metadata?.location?.latitude, -6.2);
  assert.equal(locRich.metadata?.location?.name, 'Kantor Pusat Reneo');
  assert.match(locRich.metadata?.location?.url || '', /google\.com\/maps/);

  const liveLocRich = extractInboundWahaRichData(
    {
      _data: {
        message: {
          liveLocationMessage: {
            degreesLatitude: -6.9175,
            degreesLongitude: 107.6191,
            caption: 'Kurir OTW',
            accuracyInMeters: 15,
          },
        },
      },
    },
    {
      hasMedia: false,
      rawMediaUrl: null,
      inlineBase64: null,
      mimetype: null,
      mediaType: null,
      mediaName: null,
      isSticker: false,
    }
  );
  assert.equal(liveLocRich.messageType, 'LOCATION');
  assert.equal(liveLocRich.metadata?.location?.isLive, true);
  assert.equal(liveLocRich.metadata?.location?.name, 'Kurir OTW');

  // Sticker detection
  const stickerPayload = {
    type: 'sticker',
    hasMedia: true,
    media: { url: '/api/files/s.webp', mimetype: 'image/webp' },
    _data: { message: { stickerMessage: { isAnimated: true, mimetype: 'image/webp' } } },
  };
  const stickerMediaMeta = extractInboundWahaMediaMeta(stickerPayload);
  const stickerRich = extractInboundWahaRichData(stickerPayload, stickerMediaMeta);
  assert.equal(stickerMediaMeta.isSticker, true);
  assert.equal(stickerRich.metadata?.kind, 'STICKER');
  assert.equal(stickerRich.metadata?.sticker?.isAnimated, true);

  // Poll creation + Order + Product + Group Invite + Reaction + Revoke
  const pollRich = extractInboundWahaRichData(
    {
      _data: {
        message: {
          pollCreationMessageV3: {
            name: 'Pilih jadwal meeting',
            options: [{ optionName: 'Senin 10:00' }, { optionName: 'Selasa 14:00' }],
            selectableOptionsCount: 1,
          },
        },
      },
    },
    { hasMedia: false, rawMediaUrl: null, inlineBase64: null, mimetype: null, mediaType: null, mediaName: null, isSticker: false }
  );
  assert.equal(pollRich.messageType, 'POLL');
  assert.deepEqual(pollRich.metadata?.poll?.options, ['Senin 10:00', 'Selasa 14:00']);

  const orderRich = extractInboundWahaRichData(
    {
      _data: {
        message: {
          orderMessage: {
            orderId: 'ORD-77',
            orderTitle: 'Paket Hosting Pro',
            itemCount: 2,
            totalAmount1000: 150000000,
            totalCurrencyCode: 'IDR',
          },
        },
      },
    },
    { hasMedia: false, rawMediaUrl: null, inlineBase64: null, mimetype: null, mediaType: null, mediaName: null, isSticker: false }
  );
  assert.equal(orderRich.metadata?.kind, 'ORDER');
  assert.equal(orderRich.metadata?.order?.totalAmount, 150000);

  const reactRich = extractInboundWahaRichData(
    {
      _data: {
        message: {
          reactionMessage: {
            key: { id: 'MSG_123' },
            text: '🔥',
          },
        },
      },
    },
    { hasMedia: false, rawMediaUrl: null, inlineBase64: null, mimetype: null, mediaType: null, mediaName: null, isSticker: false }
  );
  assert.equal(reactRich.reaction?.targetMessageId, 'MSG_123');
  assert.equal(reactRich.reaction?.emoji, '🔥');

  const revokeRich = extractInboundWahaRichData(
    {
      _data: {
        message: {
          protocolMessage: {
            type: 0,
            key: { id: 'MSG_OLD_1' },
          },
        },
      },
    },
    { hasMedia: false, rawMediaUrl: null, inlineBase64: null, mimetype: null, mediaType: null, mediaName: null, isSticker: false }
  );
  assert.equal(revokeRich.revokedTargetId, 'MSG_OLD_1');

  const revokeGowsRich = extractInboundWahaRichData(
    {
      _data: {
        Message: {
          protocolMessage: {
            Type: 'REVOKE',
            Key: { ID: 'GOWS_REVOKED_1' },
          },
        },
      },
    },
    { hasMedia: false, rawMediaUrl: null, inlineBase64: null, mimetype: null, mediaType: null, mediaName: null, isSticker: false }
  );
  assert.equal(revokeGowsRich.revokedTargetId, 'GOWS_REVOKED_1');
});

test('sendSticker, sendLocation, sendContactVcard, and sendReaction dispatch expected WAHA endpoints and fallbacks', async (t) => {
  stubWahaEnvSession(t, 'sales');
  stubGetConfig(t, {
    mode: 'EXTERNAL',
    baseUrl: 'https://waha.example.com',
    apiKey: 'secret-token',
    session: 'sales',
    internalLocked: false,
    hasApiKey: true,
  });

  const calls: Array<{ method: string; url: string; body: any }> = [];
  let failSendLocation404 = false;

  const origCreate = axios.create;
  t.after(() => {
    axios.create = origCreate;
  });

  axios.create = (() =>
    ({
      get: async (url: string) =>
        url === '/api/version'
          ? { data: { version: '2026.8.2', engine: 'GOWS', tier: 'PLUS' } }
          : { data: [] },
      post: async (url: string, body: any) => {
        calls.push({ method: 'POST', url, body });
        if (url === '/api/sendLocation' && failSendLocation404) {
          const err: any = new Error('Not found');
          err.response = { status: 404, data: { message: 'Not Found' } };
          throw err;
        }
        return { data: { id: `msg_${calls.length}` } };
      },
      put: async (url: string, body: any) => {
        calls.push({ method: 'PUT', url, body });
        return { data: { ok: true } };
      },
    }) as any) as any;

  const stRes = await wahaService.sendSticker(
    '08123456789',
    { base64: 'data:image/webp;base64,AAA=', mimetype: 'image/webp', filename: 'hi.webp' },
    'sales'
  );
  assert.equal(stRes.success, true);
  assert.equal(calls[0]?.url, '/api/sendSticker');

  const locRes = await wahaService.sendLocation(
    '08123456789',
    { latitude: -6.2, longitude: 106.8, title: 'Kantor' },
    'sales'
  );
  assert.equal(locRes.success, true);
  assert.equal(calls[1]?.url, '/api/sendLocation');

  failSendLocation404 = true;
  const locFallbackRes = await wahaService.sendLocation(
    '08123456789',
    { latitude: -6.2, longitude: 106.8, title: 'Kantor' },
    'sales'
  );
  assert.equal(locFallbackRes.success, true);
  assert.equal(locFallbackRes.usedFallbackText, true);
  assert.equal(calls[3]?.url, '/api/sendText');

  const vcardRes = await wahaService.sendContactVcard(
    '08123456789',
    [{ fullName: 'Admin CS', phoneNumber: '081122334455', organization: 'Reneo' }],
    'sales'
  );
  assert.equal(vcardRes.success, true);
  assert.equal(calls[4]?.url, '/api/sendContactVcard');
  assert.equal(calls[4]?.body?.contacts?.[0]?.fullName, 'Admin CS');

  const reactRes = await wahaService.sendReaction(
    '08123456789',
    { messageId: 'true_628123456789@c.us_XYZ', reaction: '👍' },
    'sales'
  );
  assert.equal(reactRes.success, true);
  assert.equal(calls[5]?.method, 'PUT');
  assert.equal(calls[5]?.url, '/api/reaction');
});

test('EXTERNAL WAHA strictly requires GOWS engine across test, save assertion, status, sessions, and outbound send', async (t) => {
  stubGetConfig(t, {
    mode: 'EXTERNAL',
    baseUrl: 'https://ext-webjs.example.com',
    apiKey: 'secret-key',
    session: 'default',
    internalLocked: false,
    hasApiKey: true,
  });

  const origCreate = axios.create;
  t.after(() => {
    axios.create = origCreate;
  });

  let mockEngine: string | undefined = 'WEBJS';
  let sendCalled = false;
  axios.create = (() =>
    ({
      get: async (url: string) => {
        if (url === '/api/version') {
          return {
            data: mockEngine
              ? { version: '2026.8.2', engine: mockEngine, tier: 'PLUS' }
              : { version: '2026.8.2', tier: 'PLUS' },
          };
        }
        if (url.startsWith('/api/sessions')) {
          return { data: [{ name: 'default', status: 'WORKING' }] };
        }
        return { data: {} };
      },
      post: async () => {
        sendCalled = true;
        return { data: { id: 'should_not_send' } };
      },
    }) as any) as any;

  // 1. Rejects WEBJS on testConnection & assertExternalGowsEngine
  await assert.rejects(
    () =>
      wahaService.testConnection({
        mode: 'EXTERNAL',
        baseUrl: 'https://ext-webjs.example.com',
        apiKey: 'secret-key',
      }),
    (err: any) => err?.statusCode === 422 && /wajib menggunakan engine GOWS.*WEBJS/i.test(err?.message || '')
  );

  await assert.rejects(
    () =>
      wahaService.assertExternalGowsEngine({
        baseUrl: 'https://ext-webjs.example.com',
        apiKey: 'secret-key',
      }),
    (err: any) => err?.statusCode === 422 && /WEBJS/i.test(err?.message || '')
  );

  // 2. Blocks getStatus, listSessions, startSession, and sendTextMessage when external is WEBJS
  const webjsStatus = await wahaService.getStatus();
  assert.equal(webjsStatus.connected, false);
  assert.equal(webjsStatus.sessionStatus, 'UNSUPPORTED_ENGINE');
  assert.equal(webjsStatus.engineSupported, false);
  assert.equal(webjsStatus.engine, 'WEBJS');
  assert.match(webjsStatus.error || '', /wajib menggunakan engine GOWS/i);

  await assert.rejects(() => wahaService.listSessions(), /wajib menggunakan engine GOWS/i);
  await assert.rejects(() => wahaService.startSession('default'), /wajib menggunakan engine GOWS/i);

  const sendBlocked = await wahaService.sendTextMessage('08123456789', 'Halo');
  assert.equal(sendBlocked.success, false);
  assert.equal(sendCalled, false);
  assert.match(sendBlocked.error || '', /wajib menggunakan engine GOWS/i);

  // 3. Rejects NOWEB and missing-engine responses too
  mockEngine = 'NOWEB';
  wahaService.invalidateExternalEngineCache();
  await assert.rejects(
    () => wahaService.assertExternalGowsEngine({ baseUrl: 'https://ext-noweb.example.com' }),
    /NOWEB/i
  );

  mockEngine = undefined;
  wahaService.invalidateExternalEngineCache();
  await assert.rejects(
    () => wahaService.assertExternalGowsEngine({ baseUrl: 'https://ext-unknown.example.com' }),
    /tidak melaporkan engine GOWS/i
  );

  // 4. Accepts GOWS engine cleanly
  mockEngine = 'GOWS';
  wahaService.invalidateExternalEngineCache();
  const okTest = await wahaService.testConnection({
    mode: 'EXTERNAL',
    baseUrl: 'https://ext-gows.example.com',
    apiKey: 'secret-key',
  });
  assert.equal(okTest.connected, true);
  assert.equal(okTest.engine, 'GOWS');
  assert.equal(okTest.isGows, true);
});

test('extractWahaContextInfo, extractWahaForwardingMeta, and pickBestContactDisplayName handle forwarded messages and contact/pushName reply priority', () => {
  const fwdImagePayload = {
    body: 'Cek promo ini',
    _data: {
      Message: {
        imageMessage: {
          mimetype: 'image/jpeg',
          caption: 'Cek promo ini',
          contextInfo: {
            isForwarded: true,
            forwardingScore: 6,
            forwardedNewsletterMessageInfo: {
              newsletterName: 'Reneo Updates',
            },
          },
        },
      },
    },
  };
  const ctx = extractWahaContextInfo(fwdImagePayload);
  assert.equal(ctx?.isForwarded, true);

  const fwdMeta = extractWahaForwardingMeta(fwdImagePayload);
  assert.deepEqual(fwdMeta, {
    forwarded: true,
    forwardingScore: 6,
    forwardedFromChannel: 'Reneo Updates',
  });

  const rich = extractInboundWahaRichData(
    fwdImagePayload,
    extractInboundWahaMediaMeta(fwdImagePayload),
    'Cek promo ini'
  );
  assert.equal(rich.metadata?.forwarded, true);
  assert.equal(rich.metadata?.forwardingScore, 6);
  assert.equal(rich.metadata?.forwardedFromChannel, 'Reneo Updates');

  assert.equal(
    pickBestContactDisplayName('Kontak 1234', 'Budi Santoso', '6281234561234'),
    'Budi Santoso'
  );
  assert.equal(
    pickBestContactDisplayName('PT Maju Jaya - Ani', 'AniWA', '6281234561234'),
    'PT Maju Jaya - Ani'
  );
  assert.equal(
    pickBestContactDisplayName('Pelanggan', '6281234561234@lid', '6281234567890'),
    'Pelanggan'
  );
  assert.equal(
    pickBestContactDisplayName(null, null, '6281234567890'),
    '+6281234567890'
  );
});

test('parseWahaPrivacyConfig, resolveSessionPrivacyRule, and getGroupInfo participants endpoint integration work accurately', async (t) => {
  const parsed = parseWahaPrivacyConfig({
    general: { autoReadOnOpen: false, sendOnlinePresence: true, readReceipts: true },
    sessions: {
      sales_vip: { autoReadOnOpen: true, sendOnlinePresence: false, readReceipts: false },
      cs_bot: { autoReadOnOpen: true },
    },
  });

  assert.deepEqual(resolveSessionPrivacyRule(parsed, 'default'), {
    autoReadOnOpen: false,
    sendOnlinePresence: true,
    readReceipts: true,
  });
  assert.deepEqual(resolveSessionPrivacyRule(parsed, 'sales_vip'), {
    autoReadOnOpen: true,
    sendOnlinePresence: false,
    readReceipts: false,
  });
  assert.deepEqual(resolveSessionPrivacyRule(parsed, 'cs_bot'), {
    autoReadOnOpen: true,
    sendOnlinePresence: true,
    readReceipts: true,
  });

  // Verify getGroupInfo calls /groups/{id}/participants and merges participants cleanly
  stubGetConfig(t, {
    mode: 'EXTERNAL',
    baseUrl: 'https://waha-gows.example.com',
    apiKey: 'test-key',
    session: 'sales',
  });
  const origCreate = axios.create;
  const hitUrls: string[] = [];
  (axios as any).create = () => ({
    get: async (url: string) => {
      hitUrls.push(url);
      if (url === '/api/version') return { data: { version: '2026.8.2', engine: 'GOWS', tier: 'PLUS' } };
      if (url === '/api/sessions') return { data: [{ name: 'sales', status: 'WORKING' }] };
      if (url.endsWith('/groups/12036300112233%40g.us')) {
        return { data: { subject: 'Grup VIP Sales', participants: [] } };
      }
      if (url.endsWith('/groups/12036300112233%40g.us/participants')) {
        return {
          data: [
            { id: '6281111222333@c.us', pushName: 'Andi Buyer', admin: null },
            { id: '99887766@lid', phoneNumber: '6285555666777', FullName: 'Dewi Admin', isAdmin: true },
          ],
        };
      }
      throw { response: { status: 404 } };
    },
    post: async () => ({ data: {} }),
    put: async () => ({ data: {} }),
  });
  t.after(() => {
    (axios as any).create = origCreate;
  });

  const grp = await wahaService.getGroupInfo('12036300112233@g.us', 'sales');
  assert.ok(grp);
  assert.equal(grp.subject, 'Grup VIP Sales');
  assert.equal(grp.participants.length, 2);
  assert.equal(grp.participants[0].name, 'Andi Buyer');
  assert.equal(grp.participants[1].phone, '6285555666777');
  assert.equal(grp.participants[1].role, 'admin');
  assert.ok(hitUrls.some((u) => u.endsWith('/participants')));
});

test('extractWahaPollVoteEvent and upsertPollVoteInMetadata handle direct, group, failed votes and webhook registration', async (t) => {
  const {
    extractWahaPollVoteEvent,
    upsertPollVoteInMetadata,
  } = require('../routes/waha') as typeof import('../routes/waha');

  // 1. Direct personal chat poll vote
  const directVote = extractWahaPollVoteEvent('poll.vote', {
    vote: {
      id: 'false_628123456789@c.us_VOTE123456',
      to: 'me',
      from: '628123456789@c.us',
      fromMe: false,
      pushName: 'Rina',
      selectedOptions: ['Pagi', 'Siang'],
      timestamp: 1700000100,
    },
    poll: {
      id: 'true_628123456789@c.us_POLL987654',
      to: '628123456789@c.us',
      from: '6289999999@c.us',
      fromMe: true,
      poll: {
        name: 'Jadwal ketemuan?',
        options: ['Pagi', 'Siang', 'Sore'],
        multipleAnswers: true,
      },
    },
  });
  assert.equal(directVote.voteFailed, false);
  assert.equal(directVote.pollId, 'true_628123456789@c.us_POLL987654');
  assert.equal(directVote.pollStanzaId, 'POLL987654');
  assert.equal(directVote.chatJid, '628123456789@c.us');
  assert.equal(directVote.voterPhone, '628123456789');
  assert.equal(directVote.voterName, 'Rina');
  assert.deepEqual(directVote.selectedOptions, ['Pagi', 'Siang']);

  // 2. Group chat poll vote
  const groupVote = extractWahaPollVoteEvent('poll.vote', {
    vote: {
      id: 'false_12036300112233@g.us_VOTEG1',
      to: '12036300112233@g.us',
      from: '628777888999@c.us',
      participant: '628777888999@c.us',
      fromMe: false,
      selectedOptions: [{ name: 'Setuju' }],
    },
    poll: {
      id: 'true_12036300112233@g.us_POLLG1',
      to: '12036300112233@g.us',
      fromMe: true,
    },
  });
  assert.equal(groupVote.chatJid, '12036300112233@g.us');
  assert.equal(groupVote.voterPhone, '628777888999');
  assert.deepEqual(groupVote.selectedOptions, ['Setuju']);

  // 3. Failed poll vote keeps previous valid vote when upserting metadata
  const failedVote = extractWahaPollVoteEvent('poll.vote.failed', {
    vote: {
      id: 'false_628123456789@c.us_FAIL1',
      from: '628123456789@c.us',
      selectedOptions: ['ShouldBeIgnored'],
    },
    poll: { id: 'true_628123456789@c.us_POLL987654' },
  });
  assert.equal(failedVote.voteFailed, true);
  assert.deepEqual(failedVote.selectedOptions, []);

  let meta: Record<string, any> = {
    kind: 'POLL',
    poll: { question: 'Jadwal ketemuan?', options: ['Pagi', 'Siang', 'Sore'], multipleAnswers: true },
  };
  meta = upsertPollVoteInMetadata(meta, {
    voterId: '628123456789',
    voterName: 'Rina',
    voterPhone: '628123456789',
    selectedOptions: ['Pagi'],
    updatedAt: '2026-11-17T09:00:00.000Z',
  });
  meta = upsertPollVoteInMetadata(meta, {
    voterId: '628123456789',
    voterName: 'Rina',
    voterPhone: '628123456789',
    selectedOptions: [],
    updatedAt: '2026-11-17T09:05:00.000Z',
    voteFailed: true,
  });
  assert.equal(meta.poll.votes.length, 1);
  assert.deepEqual(meta.poll.votes[0].selectedOptions, ['Pagi']);
  assert.equal(meta.poll.votes[0].voteFailed, true);

  // Change vote cleanly replaces previous selection
  meta = upsertPollVoteInMetadata(meta, {
    voterId: '628123456789',
    voterName: 'Rina',
    voterPhone: '628123456789',
    selectedOptions: ['Siang', 'Sore'],
    updatedAt: '2026-11-17T09:06:00.000Z',
  });
  assert.deepEqual(meta.poll.votes[0].selectedOptions, ['Siang', 'Sore']);

  // 4. Webhook sync subscribes to poll.vote & poll.vote.failed
  stubGetConfig(t, {
    mode: 'EXTERNAL',
    baseUrl: 'https://waha-gows.example.com',
    apiKey: 'test-key',
    session: 'sales',
    customWebhookUrl: 'https://crm.example.com/api/waha/webhook',
  });
  const origCreate = axios.create;
  let putBody: any = null;
  (axios as any).create = () => ({
    get: async (url: string) => {
      if (url === '/api/version') return { data: { version: '2026.8.2', engine: 'GOWS', tier: 'PLUS' } };
      if (url.startsWith('/api/sessions')) {
        return {
          data: [
            {
              name: 'sales',
              status: 'WORKING',
              config: {
                webhooks: [
                  {
                    url: 'https://crm.example.com/api/waha/webhook',
                    events: ['message', 'message.ack', 'session.status', 'presence.update'],
                  },
                ],
              },
            },
          ],
        };
      }
      return { data: {} };
    },
    put: async (_url: string, body: any) => {
      putBody = body;
      return { data: {} };
    },
  });
  t.after(() => {
    (axios as any).create = origCreate;
  });

  const syncRes = await wahaService.syncSessionWebhooks('https://crm.example.com');
  assert.deepEqual(syncRes.synced, ['sales']);
  const syncedEvents: string[] = putBody?.config?.webhooks?.[0]?.events || [];
  assert.ok(syncedEvents.includes('message.any'));
  assert.ok(syncedEvents.includes('poll.vote'));
  assert.ok(syncedEvents.includes('poll.vote.failed'));
});

test('multi-session helpers, profile display name resolution, and getWhatsAppProfile work accurately', async (t) => {
  const { pickSessionScopedMessage, isGenericDisplayName } =
    require('../routes/waha') as typeof import('../routes/waha');
  const { resolveProfileDisplayName } =
    require('./profile.service') as typeof import('./profile.service');

  // Session-scoped selection preserves separate group message copies per session
  const scoped = pickSessionScopedMessage(
    [
      { id: 'm1', wahaSession: 'sesi_a' },
      { id: 'm2', wahaSession: 'sesi_b' },
    ],
    'SESI_B'
  );
  assert.equal(scoped?.id, 'm2');

  assert.equal(isGenericDisplayName('Kontak +628123456789'), true);
  assert.equal(isGenericDisplayName('Budi Santoso'), false);

  // Generic personal contact placeholder upgrades to WhatsApp profile/push name, custom CRM name stays preserved
  assert.equal(
    resolveProfileDisplayName({
      isGroup: false,
      currentName: 'Kontak +628123456789',
      profileName: null,
      profilePushName: 'Dewi Lestari',
    }),
    'Dewi Lestari'
  );
  assert.equal(
    resolveProfileDisplayName({
      isGroup: false,
      currentName: 'Pelanggan VIP Jakarta',
      profileName: 'Dewi WA',
      profilePushName: 'Dewi',
    }),
    null
  );
  assert.equal(
    resolveProfileDisplayName({
      isGroup: true,
      currentName: 'Grup WhatsApp 112233',
      profileName: 'Tim Operasional Pusat',
    }),
    'Tim Operasional Pusat'
  );

  // Verify getWhatsAppProfile captures both personal & group metadata + avatar URLs
  stubGetConfig(t, {
    mode: 'EXTERNAL',
    baseUrl: 'https://waha-gows.example.com',
    apiKey: 'test-key',
    session: 'sales',
  });
  const origCreate = axios.create;
  (axios as any).create = () => ({
    get: async (url: string) => {
      if (url === '/api/version') return { data: { version: '2026.8.2', engine: 'GOWS', tier: 'PLUS' } };
      if (url === '/api/sessions') return { data: [{ name: 'sales', status: 'WORKING' }] };
      if (url === '/api/contacts') return { data: { name: 'Rina Wijaya', pushname: 'Rina' } };
      if (url === '/api/contacts/profile-picture') return { data: { profilePictureURL: 'https://pps.whatsapp.net/rina.jpg' } };
      if (url === '/api/contacts/about') return { data: { about: 'Open 08:00 - 17:00' } };
      if (url.endsWith('/groups/12036300112233%40g.us')) {
        return { data: { subject: 'Grup Distributor', desc: 'Koordinasi stok harian' } };
      }
      if (url.endsWith('/groups/12036300112233%40g.us/picture')) {
        return { data: { url: 'https://pps.whatsapp.net/grup.jpg' } };
      }
      throw { response: { status: 404 } };
    },
    post: async () => ({ data: {} }),
    put: async () => ({ data: {} }),
  });
  t.after(() => {
    (axios as any).create = origCreate;
  });

  const personalProf = await wahaService.getWhatsAppProfile('628123456789@c.us', 'sales');
  assert.equal(personalProf?.name, 'Rina Wijaya');
  assert.equal(personalProf?.pushName, 'Rina');
  assert.equal(personalProf?.about, 'Open 08:00 - 17:00');
  assert.equal(personalProf?.pictureUrl, 'https://pps.whatsapp.net/rina.jpg');

  const groupProf = await wahaService.getWhatsAppProfile('12036300112233@g.us', 'sales');
  assert.equal(groupProf?.name, 'Grup Distributor');
  assert.equal(groupProf?.about, 'Koordinasi stok harian');
  assert.equal(groupProf?.pictureUrl, 'https://pps.whatsapp.net/grup.jpg');
});

test('pinMessage, unpinMessage, starMessage, and syncChatLabels dispatch accurate WAHA endpoints and payloads', async (t) => {
  stubGetConfig(t, {
    mode: 'EXTERNAL',
    baseUrl: 'https://waha-gows.example.com',
    apiKey: 'test-key',
    session: 'sales',
  });

  const calls: Array<{ method: string; url: string; data?: any }> = [];
  const origCreate = axios.create;
  (axios as any).create = () => ({
    get: async (url: string) => {
      calls.push({ method: 'GET', url });
      if (url === '/api/version') return { data: { version: '2026.8.2', engine: 'GOWS', tier: 'PLUS' } };
      if (url === '/api/sessions') return { data: [{ name: 'sales', status: 'WORKING' }] };
      if (url.includes('/labels')) return { data: [{ id: '10', name: 'VIP' }] };
      return { data: {} };
    },
    post: async (url: string, data?: any) => {
      calls.push({ method: 'POST', url, data });
      if (url.endsWith('/labels')) return { data: { id: '11', name: 'Leads' } };
      return { data: { success: true } };
    },
    put: async (url: string, data?: any) => {
      calls.push({ method: 'PUT', url, data });
      return { data: { success: true } };
    },
  });
  t.after(() => {
    (axios as any).create = origCreate;
  });

  // 1. pinMessage
  const pinRes = await wahaService.pinMessage('081234567890', 'msg_pin_1', 86400, 'sales');
  assert.equal(pinRes.success, true);
  const pinCall = calls.find((c) => c.method === 'POST' && c.url.includes('/pin'));
  assert.ok(pinCall);
  assert.equal(pinCall?.data?.duration, 86400);

  // 2. unpinMessage
  const unpinRes = await wahaService.unpinMessage('081234567890', 'msg_pin_1', 'sales');
  assert.equal(unpinRes.success, true);
  const unpinCall = calls.find((c) => c.method === 'POST' && c.url.includes('/unpin'));
  assert.ok(unpinCall);

  // 3. starMessage
  const starRes = await wahaService.starMessage('081234567890', 'msg_star_1', true, 'sales');
  assert.equal(starRes.success, true);
  const starCall = calls.find((c) => c.method === 'PUT' && c.url === '/api/star');
  assert.ok(starCall);
  assert.equal(starCall?.data?.star, true);
  assert.equal(starCall?.data?.messageId, 'msg_star_1');

  // 4. syncChatLabels
  const labelRes = await wahaService.syncChatLabels('081234567890', ['VIP', 'Leads'], 'sales');
  assert.equal(labelRes.success, true);
  const labelPutCall = calls.find((c) => c.method === 'PUT' && c.url.includes('/labels/chats/'));
  assert.ok(labelPutCall);
  assert.deepEqual(labelPutCall?.data?.labels, [{ id: '10' }, { id: '11' }]);
});

test('pinMessage and unpinMessage handle WAHA engine 501 / 404 unsupported gracefully without throwing or calling /api/unpinMessage', async (t) => {
  stubGetConfig(t, {
    mode: 'EXTERNAL',
    baseUrl: 'https://waha-gows.example.com',
    apiKey: 'test-key',
    session: 'sales',
  });

  const calls: Array<{ method: string; url: string; data?: any }> = [];
  const origCreate = axios.create;
  (axios as any).create = () => ({
    get: async (url: string) => {
      calls.push({ method: 'GET', url });
      if (url === '/api/version') return { data: { version: '2026.8.2', engine: 'GOWS', tier: 'PLUS' } };
      if (url === '/api/sessions') return { data: [{ name: 'sales', status: 'WORKING' }] };
      return { data: {} };
    },
    post: async (url: string, data?: any) => {
      calls.push({ method: 'POST', url, data });
      // Simulate 501 Not Implemented or 404 for pin/unpin on GOWS engine
      const err: any = new Error('501 Not Implemented: feature not available on GOWS');
      err.response = { status: 501, data: { message: 'Not Implemented' } };
      throw err;
    },
  });
  t.after(() => {
    (axios as any).create = origCreate;
  });

  // Test unpinMessage: should NOT call /api/unpinMessage, should return unsupportedFeature: true
  const unpinRes = await wahaService.unpinMessage('081234567890', 'false_081234567890@c.us_3EB0ABC', 'sales');
  assert.equal(unpinRes.success, false);
  assert.equal(unpinRes.unsupportedFeature, true);
  const bogusCall = calls.find((c) => c.url === '/api/unpinMessage');
  assert.equal(bogusCall, undefined, 'Must not dispatch non-existent /api/unpinMessage route');

  // Test pinMessage: should NOT call /api/pinMessage, should return unsupportedFeature: true
  const pinRes = await wahaService.pinMessage('081234567890', 'false_081234567890@c.us_3EB0ABC', 86400, 'sales');
  assert.equal(pinRes.success, false);
  assert.equal(pinRes.unsupportedFeature, true);
  const bogusPinCall = calls.find((c) => c.url === '/api/pinMessage');
  assert.equal(bogusPinCall, undefined, 'Must not dispatch non-existent /api/pinMessage route');
});

test('resolveUploadsDir persists media inside /app/data/uploads inside container and respects MEDIA_UPLOAD_DIR', async () => {
  const pathMod = await import('path');
  const { resolveUploadsDir } = await import('../routes/media');
  assert.equal(
    resolveUploadsDir('/app', {}, (p) => p === '/app/data'),
    '/app/data/uploads'
  );
  assert.equal(
    resolveUploadsDir('/app', { MEDIA_UPLOAD_DIR: '/custom/media' }, () => true),
    pathMod.resolve('/custom/media')
  );
  assert.equal(
    resolveUploadsDir('/tmp/crm-local', {}, () => false),
    pathMod.resolve('/tmp/crm-local', 'uploads')
  );
});

test('detectWahaOutboundOrigin distinguishes WhatsApp Web, HP (iOS/Android), and fallback device messages', async () => {
  const { detectWahaOutboundOrigin } = await import('../routes/waha');
  assert.equal(
    detectWahaOutboundOrigin({ fromMe: true, source: 'app', id: 'true_62812@c.us_3EB01234567890ABCD' }).sentVia,
    'WHATSAPP_WEB'
  );
  assert.equal(
    detectWahaOutboundOrigin({ fromMe: true, source: 'app', id: 'true_62812@c.us_3A1234567890ABCD' }).sentVia,
    'WHATSAPP_PHONE'
  );
  assert.equal(
    detectWahaOutboundOrigin({ fromMe: true, source: 'app', deviceType: 'android', id: 'true_62812@c.us_AC9988' }).sentVia,
    'WHATSAPP_PHONE'
  );
  assert.equal(
    detectWahaOutboundOrigin({ fromMe: true, source: 'app', id: 'true_62812@c.us_AC99887766' }).sentVia,
    'WHATSAPP_DEVICE'
  );
});

test('unwrapWahaProtoMessage, extractInboundWahaText, and extractPhoneCandidates handle linked-device deviceSentMessage & ephemeral fromMe payloads', async () => {
  const {
    isWahaFromMe,
    extractInboundWahaText,
    extractDeviceSentDestinationJid,
    extractPhoneCandidatesFromWahaPayload,
  } = await import('../routes/waha');

  const linkedDevicePayload = {
    from: '628111111111@c.us',
    _data: {
      Info: {
        Chat: '628999888777@s.whatsapp.net',
        MessageSource: { IsFromMe: true },
      },
      Message: {
        deviceSentMessage: {
          destinationJid: '628999888777@s.whatsapp.net',
          message: {
            ephemeralMessage: {
              message: {
                extendedTextMessage: {
                  text: 'Siap kak, paket sudah diproses dari WA Web',
                },
              },
            },
          },
        },
      },
    },
  };

  assert.equal(isWahaFromMe(linkedDevicePayload), true);
  assert.equal(
    extractInboundWahaText(linkedDevicePayload),
    'Siap kak, paket sudah diproses dari WA Web'
  );
  assert.equal(
    extractDeviceSentDestinationJid(linkedDevicePayload),
    '628999888777@s.whatsapp.net'
  );
  assert.deepEqual(extractPhoneCandidatesFromWahaPayload(linkedDevicePayload, true), [
    '628999888777',
  ]);
});

test('group management helpers strip data URI prefix, parse invite objects, and surface admin permission errors cleanly', async (t) => {
  const origGetClient = (wahaService as any).getClient.bind(wahaService);
  t.after(() => {
    (wahaService as any).getClient = origGetClient;
  });

  let putPicPayload: any = null;
  let addPayloads: any[] = [];
  (wahaService as any).getClient = async () => ({
    session: 'WA_TEST',
    ownerPrefix: '',
    client: {
      get: async (url: string) => {
        if (url.includes('/invite-code')) {
          return { data: { inviteCode: 'AbC123XyZ' } };
        }
        return { data: {} };
      },
      put: async (url: string, body: any) => {
        if (url.includes('/picture')) putPicPayload = body;
        return { data: {} };
      },
      post: async (url: string, body: any) => {
        if (url.includes('/participants/add')) {
          addPayloads.push(body);
          if (addPayloads.length === 1) {
            const err: any = new Error('Request failed with status code 400');
            err.response = { status: 400, data: {} };
            throw err;
          }
          return { data: { ok: true } };
        }
        return { data: {} };
      },
    },
  });

  const picRes = await wahaService.updateGroupPicture(
    '12036300112233@g.us',
    'data:image/png;base64,iVBORw0KGgo=',
    'WA_TEST'
  );
  assert.equal(picRes.success, true);
  assert.deepEqual(putPicPayload, {
    file: { mimetype: 'image/png', data: 'iVBORw0KGgo=' },
  });

  const invRes = await wahaService.getGroupInviteCode('12036300112233@g.us', 'WA_TEST');
  assert.equal(invRes.success, true);
  assert.equal(invRes.code, 'AbC123XyZ');
  assert.equal(invRes.link, 'https://chat.whatsapp.com/AbC123XyZ');

  const addRes = await wahaService.addGroupParticipants(
    '12036300112233@g.us',
    ['08123456789'],
    'WA_TEST'
  );
  assert.equal(addRes.success, true);
  assert.equal(addPayloads.length, 2);
  assert.deepEqual(addPayloads[1], { participants: ['628123456789@c.us'] });

  (wahaService as any).getClient = async () => ({
    session: 'WA_TEST',
    ownerPrefix: '',
    client: {
      get: async () => {
        const err: any = new Error('Request failed with status code 500');
        err.response = { status: 500, data: {} };
        throw err;
      },
    },
  });
  const permErr = await wahaService.getGroupInviteCode('12036300112233@g.us', 'WA_TEST');
  assert.equal(permErr.success, false);
  assert.match(permErr.error || '', /Admin grup/i);
});

test('WAHA inbound webhook deduplication resolves identical stanza and lock keys across @lid and @c.us payloads', () => {
  const { extractWahaMessageIds, buildWahaInboundLockKey } = require('../routes/waha') as typeof import('../routes/waha');

  const lidPayload = {
    id: 'false_160602458619101@lid_3EB0 pare99887766'.replace(' ', ''),
    from: '160602458619101@lid',
    _data: { Info: { ID: '3EB0pare99887766' } },
  };
  const cusPayload = {
    id: 'false_628113251288@c.us_3EB0pare99887766',
    from: '628113251288@c.us',
    notifyName: 'CS Pare',
  };
  const barePayload = {
    id: '3EB0pare99887766',
    from: '628113251288@c.us',
  };

  const lidIds = extractWahaMessageIds(lidPayload);
  const cusIds = extractWahaMessageIds(cusPayload);
  const bareIds = extractWahaMessageIds(barePayload);

  assert.ok(lidIds.stanzaIds.includes('3EB0pare99887766'));
  assert.ok(cusIds.stanzaIds.includes('3EB0pare99887766'));
  assert.ok(bareIds.stanzaIds.includes('3EB0pare99887766'));

  const lidLock = buildWahaInboundLockKey('comp-1', 'HRIS_MINTI', lidPayload, '160602458619101@lid');
  const cusLock = buildWahaInboundLockKey('comp-1', 'HRIS_MINTI', cusPayload, '628113251288@c.us');
  const bareLock = buildWahaInboundLockKey('comp-1', 'hris_minti', barePayload, '628113251288@c.us');
  const otherSessionLock = buildWahaInboundLockKey('comp-1', 'WA_TEST', cusPayload, '628113251288@c.us');

  assert.equal(lidLock, 'msg:comp-1:hris_minti:3EB0pare99887766');
  assert.equal(cusLock, lidLock);
  assert.equal(bareLock, lidLock);
  assert.notEqual(otherSessionLock, lidLock);
});

test('extractInboundWahaMentions & GOWS PascalCase forwarding helpers preserve forwarded mentions and resolveLidIdentity extracts display names', async (t) => {
  const {
    extractWahaContextInfo,
    extractWahaForwardingMeta,
    extractInboundWahaMentions,
    extractInboundWahaText,
  } = require('../routes/waha') as typeof import('../routes/waha');

  const gowsForwardedPayload = {
    from: '12036300112233@g.us',
    _data: {
      Info: { IsForwarded: true, ForwardingScore: 2 },
      Message: {
        EphemeralMessage: {
          Message: {
            ExtendedTextMessage: {
              Text: 'Tolong cek @160602458619101 ya',
              ContextInfo: {
                IsForwarded: true,
                ForwardingScore: 2,
                MentionedJID: ['160602458619101@lid', '6285155431301@s.whatsapp.net'],
              },
            },
          },
        },
      },
    },
    mentions: [
      { id: '160602458619101@lid', pushname: 'Agnes HR' },
    ],
  };

  const ctx = extractWahaContextInfo(gowsForwardedPayload);
  assert.ok(ctx);
  assert.equal(extractWahaForwardingMeta(gowsForwardedPayload)?.forwardingScore, 2);
  assert.equal(extractInboundWahaText(gowsForwardedPayload), 'Tolong cek @160602458619101 ya');
  const { mentions, mentionHints } = extractInboundWahaMentions(gowsForwardedPayload, ctx);
  assert.ok(mentions.includes('160602458619101@lid'));
  assert.ok(mentions.includes('6285155431301@s.whatsapp.net'));
  assert.equal(mentionHints['160602458619101'], 'Agnes HR');

  stubWahaEnvSession(t, 'HRIS_HR');
  stubGetConfig(t, {
    mode: 'EXTERNAL',
    baseUrl: 'https://waha.example.com',
    apiKey: 'secret-token',
    session: 'HRIS_HR',
    internalLocked: false,
    hasApiKey: true,
  });

  const origCreate = axios.create;
  t.after(() => {
    axios.create = origCreate;
  });

  axios.create = (() =>
    ({
      get: async (url: string, cfg?: any) => {
        if (url === '/api/version') {
          return { data: { version: '2026.8.2', engine: 'GOWS', tier: 'PLUS' } };
        }
        if (url === '/api/sessions?all=true') {
          return { data: [{ name: 'HRIS_HR', status: 'WORKING' }] };
        }
        if (url.includes('/lids/77665544332211%40lid')) {
          return { data: { pn: '628112233445@c.us' } };
        }
        if (url === '/api/contacts' && cfg?.params?.contactId === '77665544332211@lid') {
          return { data: { id: '77665544332211@lid', pushname: 'Bu Intan' } };
        }
        if (url === '/api/contacts' && cfg?.params?.contactId === '88990011223344@lid') {
          return { data: { id: '88990011223344@lid', pushName: 'Aldona HRD' } };
        }
        return { data: {} };
      },
    } as any)) as any;

  const withPhone = await wahaService.resolveLidIdentity('HRIS_HR', '77665544332211@lid');
  assert.deepEqual(withPhone, { phone: '628112233445', name: 'Bu Intan' });

  const nameOnly = await wahaService.resolveLidIdentity('HRIS_HR', '88990011223344@lid');
  assert.deepEqual(nameOnly, { phone: null, name: 'Aldona HRD' });
});

test('extractWahaVerification distinguishes Verified Meta accounts from plain WhatsApp Business names', () => {
  const { extractWahaVerification, normalizeWahaContactEntries } = require('./waha.service') as typeof import('./waha.service');
  const { resolveProfileDisplayName } = require('./profile.service') as typeof import('./profile.service');

  const plainBusiness = extractWahaVerification({
    BusinessName: 'Toko Maju Jaya',
    verifiedLevel: 'unknown',
  });
  assert.deepEqual(plainBusiness, {
    isVerified: false,
    verifiedName: null,
    verifiedLevel: null,
  });

  const gowsVerified = extractWahaVerification({
    VerifiedName: {
      Details: {
        VerifiedName: 'Bank Contoh Resmi',
        VerifiedLevel: 'HIGH',
      },
    },
  });
  assert.deepEqual(gowsVerified, {
    isVerified: true,
    verifiedName: 'Bank Contoh Resmi',
    verifiedLevel: 'high',
  });

  const contactsNormalized = normalizeWahaContactEntries([
    {
      id: '628111222333@c.us',
      verifiedName: 'Reneo Official',
      verifiedLevel: 'high',
      pushname: 'CS Reneo',
    },
    {
      id: '628444555666@c.us',
      BusinessName: 'Warung Kopi',
      pushname: 'Kopi',
    },
  ]);
  assert.equal(contactsNormalized[0].isVerified, true);
  assert.equal(contactsNormalized[0].verifiedName, 'Reneo Official');
  assert.equal(contactsNormalized[0].verifiedLevel, 'high');
  assert.equal(contactsNormalized[1].isVerified, false);
  assert.equal(contactsNormalized[1].verifiedName, null);

  assert.equal(
    resolveProfileDisplayName({
      isGroup: false,
      currentName: 'Kontak 2333',
      profileVerifiedName: 'Reneo Official',
      profileName: 'CS Reneo',
      profilePushName: 'CS',
    }),
    'Reneo Official'
  );
});

test('resolveInboundWahaTargetJid skips self @lid and extracts nested DeviceSentMessage destinations for fromMe messages', () => {
  const { resolveInboundWahaTargetJid, extractDeviceSentDestinationJid } = require('../routes/waha') as typeof import('../routes/waha');

  const gowsFromMeWithSelfLid = {
    id: 'true_628999888777@c.us_3EB0123456',
    fromMe: true,
    from: '628111111111@c.us',
    chatId: '160602458619101:0@lid',
    to: '628999888777@c.us',
    _data: {
      Info: {
        Chat: '160602458619101@lid',
        RecipientAlt: '628999888777@s.whatsapp.net',
      },
    },
  };
  assert.equal(
    resolveInboundWahaTargetJid(
      gowsFromMeWithSelfLid,
      { id: '628111111111@c.us', lid: '160602458619101@lid' },
      true
    ),
    '628999888777@c.us'
  );

  const nestedDeviceSent = {
    fromMe: true,
    from: '628111111111@c.us',
    _data: {
      Message: {
        viewOnceMessage: {
          message: {
            DeviceSentMessage: {
              DestinationJID: '628555444333@s.whatsapp.net',
              message: { conversation: 'Dikirim dari HP' },
            },
          },
        },
      },
    },
  };
  assert.equal(extractDeviceSentDestinationJid(nestedDeviceSent), '628555444333@s.whatsapp.net');
  assert.equal(
    resolveInboundWahaTargetJid(nestedDeviceSent, { id: '628111111111@c.us' }, true),
    '628555444333@s.whatsapp.net'
  );
});

test('extractWahaPresence and normalizeWahaAck/extractWahaMessageIds handle GOWS presence, audio recording, and batch read receipts', () => {
  const { extractWahaPresence, extractWahaMessageIds, normalizeWahaAck } = require('../routes/waha') as typeof import('../routes/waha');

  assert.deepEqual(
    extractWahaPresence({
      id: '160602458619101@lid',
      presences: [{ participant: '628111222333@s.whatsapp.net', State: 'composing', Media: 'audio' }],
    }),
    { chatId: '160602458619101@lid', status: 'recording' }
  );

  assert.deepEqual(
    extractWahaPresence({
      _data: { Chat: '628111222333@s.whatsapp.net', State: 'composing' },
    }),
    { chatId: '628111222333@s.whatsapp.net', status: 'typing' }
  );

  assert.equal(normalizeWahaAck({ ack: 'READ' }), 3);
  assert.equal(normalizeWahaAck({ _data: { Type: 'read' } }), 3);
  assert.equal(normalizeWahaAck({ _data: { Type: 'played' } }), 4);

  const ids = extractWahaMessageIds({
    _data: { Receipt: { MessageIDs: ['3EB0AAA111', '3EB0BBB222'] } },
  });
  assert.deepEqual(ids.stanzaIds, ['3EB0AAA111', '3EB0BBB222']);
});








