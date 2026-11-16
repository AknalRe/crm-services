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
