import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { config } from '../config';
import { WahaConfig, wahaService } from './waha.service';

function stubGetConfig(t: test.TestContext, conf: WahaConfig) {
  const origGetConfig = wahaService.getConfig.bind(wahaService);
  (wahaService as any).getConfig = async (maskSecret = false) => ({
    ...conf,
    apiKey: maskSecret ? (conf.apiKey ? '••••••••' : '') : conf.apiKey,
  });
  t.after(() => {
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
          return { data: { version: '2026.1.0', tier: 'PLUS' } };
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

  const textRes = await wahaService.sendTextMessage('0812-3456-7890', 'Tes kirim');
  assert.equal(textRes.success, true);
  assert.equal(textRes.sessionUsed, 'HRIS_HR');
  assert.equal(textRes.messageId, 'true_6281234567890@c.us_MSG123');
  assert.equal(posted[0].url, '/api/sendText');
  assert.equal(posted[0].body.session, 'HRIS_HR');
  assert.equal(posted[0].body.chatId, '6281234567890@c.us');

  const videoRes = await wahaService.sendMediaMessage(
    '123456789012345@lid',
    {
      base64: 'data:video/mp4;base64,AAAA',
      mimetype: 'video/mp4',
      filename: 'promo.mp4',
      caption: 'Video promo',
    },
    'HRIS_HR'
  );
  assert.equal(videoRes.success, true);
  assert.equal(videoRes.sessionUsed, 'HRIS_HR');
  assert.equal(posted[1].url, '/api/sendVideo');
  assert.equal(posted[2].url, '/api/sendFile');
  assert.equal(posted[2].body.chatId, '123456789012345@lid');

  const stoppedRes = await wahaService.sendTextMessage('081234567890', 'Halo', 'WA_OFF');
  assert.equal(stoppedRes.success, false);
  assert.match(stoppedRes.error || '', /SCAN_QR_CODE/);
});

