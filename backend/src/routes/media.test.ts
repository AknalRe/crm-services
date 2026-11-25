import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import type { AuthUserSession } from './auth';
import conversationsRouter from './conversations';
import mediaRouter, {
  buildContentDisposition,
  createSignedMediaFetchUrl,
  signMediaAccessToken,
  verifyMediaAccessToken,
} from './media';

const SAMPLE_SESSION: AuthUserSession = {
  id: 'agent-1',
  name: 'CS Uji',
  email: 'cs@example.com',
  role: 'AGENT',
  permissions: ['conversations'],
  companyId: 'default',
};

test('mediaRouter blocks unauthenticated requests to /files and /profiles and permits authenticated or valid signed tokens', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-media-auth-test-'));
  const profilesDir = path.join(tmpDir, 'profiles');
  fs.mkdirSync(profilesDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'asset-a.txt'), 'hello-crm-media', 'utf-8');
  fs.writeFileSync(path.join(tmpDir, 'asset-b.txt'), 'secret-other-file', 'utf-8');
  fs.writeFileSync(path.join(profilesDir, 'avatar.jpg'), 'fake-jpeg-bytes', 'utf-8');

  const signingSecret = 'unit-test-signing-secret-0123456789abcdef';

  try {
    const anonApp = Fastify();
    await anonApp.register(mediaRouter, {
      prefix: '/api/media',
      uploadsDir: tmpDir,
      resolveAuthUser: async () => null,
      resolveSigningSecret: async () => signingSecret,
    });
    await anonApp.register(conversationsRouter, { prefix: '/api/conversations' });

    // Unauthenticated /files access must return 401 (both existing and missing files)
    const anonFile = await anonApp.inject({ method: 'GET', url: '/api/media/files/asset-a.txt' });
    assert.equal(anonFile.statusCode, 401);
    assert.equal(anonFile.headers['cache-control'], 'no-store');

    const anonMissing = await anonApp.inject({ method: 'GET', url: '/api/media/files/does-not-exist.txt' });
    assert.equal(anonMissing.statusCode, 401);

    // Unauthenticated /profiles access must return 401
    const anonProfile = await anonApp.inject({ method: 'GET', url: '/api/media/profiles/avatar.jpg' });
    assert.equal(anonProfile.statusCode, 401);
    assert.equal(anonProfile.headers['cache-control'], 'no-store');

    // Unauthenticated /conversations/media-proxy must return 401
    const anonProxy = await anonApp.inject({
      method: 'GET',
      url: '/api/conversations/media-proxy?url=https%3A%2F%2Fexample.com%2Fimg.jpg',
    });
    assert.equal(anonProxy.statusCode, 401);

    // Tampered token must fail
    const badTokRes = await anonApp.inject({
      method: 'GET',
      url: '/api/media/files/asset-a.txt?m_tok=9999999999.bad-signature',
    });
    assert.equal(badTokRes.statusCode, 401);

    // Token minted for asset-b must NOT grant access to asset-a
    const tokenForB = signMediaAccessToken('asset-b.txt', signingSecret, 300);
    const wrongFileRes = await anonApp.inject({
      method: 'GET',
      url: `/api/media/files/asset-a.txt?m_tok=${encodeURIComponent(tokenForB)}`,
    });
    assert.equal(wrongFileRes.statusCode, 401);

    // Expired token must fail
    const expiredExp = Math.floor(Date.now() / 1000) - 60;
    const expiredSig = crypto
      .createHmac('sha256', signingSecret)
      .update(`asset-a.txt:${expiredExp}`)
      .digest('base64url');
    const expiredRes = await anonApp.inject({
      method: 'GET',
      url: `/api/media/files/asset-a.txt?m_tok=${encodeURIComponent(`${expiredExp}.${expiredSig}`)}`,
    });
    assert.equal(expiredRes.statusCode, 401);

    // Valid signed fetch URL grants access without cookie and marks response private, no-store
    const signedUrl = await createSignedMediaFetchUrl(
      'https://panel.reneo.my.id/app/reneo-crm/api/media/files/asset-a.txt',
      600,
      signingSecret
    );
    const signedParsed = new URL(signedUrl);
    assert.ok(signedParsed.searchParams.get('m_tok'));
    assert.equal(
      verifyMediaAccessToken('asset-a.txt', signedParsed.searchParams.get('m_tok')!, signingSecret),
      true
    );

    const validTokRes = await anonApp.inject({
      method: 'GET',
      url: `/api/media/files/asset-a.txt?m_tok=${encodeURIComponent(signedParsed.searchParams.get('m_tok')!)}`,
    });
    assert.equal(validTokRes.statusCode, 200);
    assert.equal(validTokRes.body, 'hello-crm-media');
    assert.equal(validTokRes.headers['cache-control'], 'private, no-store');

    await anonApp.close();

    // Authenticated user receives file and profile photo with private Vary: Cookie caching
    const authApp = Fastify();
    await authApp.register(mediaRouter, {
      prefix: '/api/media',
      uploadsDir: tmpDir,
      resolveAuthUser: async () => SAMPLE_SESSION,
      resolveSigningSecret: async () => signingSecret,
    });

    const authFile = await authApp.inject({ method: 'GET', url: '/api/media/files/asset-a.txt' });
    assert.equal(authFile.statusCode, 200);
    assert.equal(authFile.body, 'hello-crm-media');
    assert.equal(authFile.headers['cache-control'], 'private, max-age=3600');
    assert.match(String(authFile.headers['vary']), /Cookie/i);

    const authProfile = await authApp.inject({ method: 'GET', url: '/api/media/profiles/avatar.jpg' });
    assert.equal(authProfile.statusCode, 200);
    assert.equal(authProfile.body, 'fake-jpeg-bytes');
    assert.equal(authProfile.headers['cache-control'], 'private, max-age=3600');
    assert.match(String(authProfile.headers['vary']), /Cookie/i);

    await authApp.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createSignedMediaFetchUrl leaves external third-party URLs untouched', async () => {
  const external = 'https://cdn.example.com/promo/banner.jpg';
  const result = await createSignedMediaFetchUrl(external, 300, 'any-secret');
  assert.equal(result, external);
});

test('buildContentDisposition names the download after the sender file, not the stored name', () => {
  assert.equal(
    buildContentDisposition('1795577115066_c93e04e5.rar', 'Frame Akreditasi Merr.rar'),
    `inline; filename="Frame Akreditasi Merr.rar"; filename*=UTF-8''Frame%20Akreditasi%20Merr.rar`
  );
  // a name without an extension keeps the stored one, and the stored name is the fallback when the sender name is empty
  assert.match(buildContentDisposition('1_ab.pdf', 'Proposal'), /filename="Proposal\.pdf"/);
  assert.match(buildContentDisposition('1_ab.pdf', ''), /filename="1_ab\.pdf"/);
  assert.match(buildContentDisposition('1_ab.pdf', null, 'attachment'), /^attachment; /);
  // non-ASCII names get an ASCII fallback plus the UTF-8 form; quotes and path parts cannot leak into the header
  const header = buildContentDisposition('1_ab.docx', 'Laporan "Q3" é/../x.docx');
  assert.ok(!header.includes('/'), header);
  assert.match(header, /filename\*=UTF-8''Laporan%20%22Q3%22%20%C3%A9_\.\._x\.docx/);
});
