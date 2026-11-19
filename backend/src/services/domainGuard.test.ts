import crypto from 'crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateDomainGuardRequest,
  isValidReneoAppTokenFormat,
  matchesAllowedHostRule,
  resetReneoRuntimeStateForTest,
  verifyReneoRuntimeEnvironment,
} from './domainGuard';

function makeValidAppToken(): string {
  const sig = crypto.randomBytes(32).toString('hex');
  return `v1|1|reneo-crm|7|${sig}`;
}

test('isValidReneoAppTokenFormat accepts signed v1 reneo-crm tokens and rejects invalid formats', () => {
  assert.equal(isValidReneoAppTokenFormat(makeValidAppToken()), true);
  assert.equal(isValidReneoAppTokenFormat(''), false);
  assert.equal(isValidReneoAppTokenFormat('v1|1|other-app|7|' + 'a'.repeat(64)), false);
  assert.equal(isValidReneoAppTokenFormat('v1|1|reneo-crm|7|short'), false);
});

test('matchesAllowedHostRule supports exact hosts, wildcard subdomains, and rejects global *', () => {
  assert.equal(matchesAllowedHostRule('panel.reneo.my.id', 'panel.reneo.my.id'), true);
  assert.equal(matchesAllowedHostRule('toko.reneo.my.id', '*.reneo.my.id'), true);
  assert.equal(matchesAllowedHostRule('reneo.my.id', '*.reneo.my.id'), true);
  assert.equal(matchesAllowedHostRule('evil.com', '*.reneo.my.id'), false);
  assert.equal(matchesAllowedHostRule('evil.com', '*'), false);
});

test('verifyReneoRuntimeEnvironment fails outside Reneo and caches allowedHosts on verified response', async () => {
  resetReneoRuntimeStateForTest();

  const missingToken = await verifyReneoRuntimeEnvironment({
    force: true,
    appToken: '',
    panelUrl: 'http://host.docker.internal:8000',
  });
  assert.equal(missingToken.verified, false);

  const rejectedByPanel = await verifyReneoRuntimeEnvironment({
    force: true,
    appToken: makeValidAppToken(),
    panelUrl: 'http://host.docker.internal:8000',
    fetcher: async () => ({ authenticated: false, reneoVerified: false }),
  });
  assert.equal(rejectedByPanel.verified, false);

  const accepted = await verifyReneoRuntimeEnvironment({
    force: true,
    appToken: makeValidAppToken(),
    panelUrl: 'http://host.docker.internal:8000',
    fetcher: async () => ({
      authenticated: true,
      reneoVerified: true,
      serverHostname: 'srv-prod-01',
      allowedHosts: ['panel.reneo.my.id', '*.reneo.my.id'],
      publicUrls: ['https://crm.pelanggan.id/app/reneo-crm'],
    }),
  });
  assert.equal(accepted.verified, true);
  assert.ok(accepted.dynamicHosts.includes('srv-prod-01'));
  assert.ok(accepted.dynamicHosts.includes('panel.reneo.my.id'));
  assert.ok(accepted.dynamicHosts.includes('crm.pelanggan.id'));
});

test('evaluateDomainGuardRequest blocks non-Reneo runtime and unauthorized hostnames/domains', async () => {
  resetReneoRuntimeStateForTest();

  // 1. Non-Reneo environment must be rejected with 403 RENEO_ENV_REQUIRED
  const unverifiedRes = await evaluateDomainGuardRequest({
    urlPath: '/api/auth/me',
    hostHeader: 'panel.reneo.my.id',
    requireReneoEnv: true,
    enforceDomain: true,
    appToken: '',
  });
  assert.equal(unverifiedRes.allowed, false);
  assert.equal(unverifiedRes.statusCode, 403);
  assert.equal(unverifiedRes.code, 'RENEO_ENV_REQUIRED');

  const verifiedStatus = {
    verified: true,
    lastVerifiedAt: Date.now(),
    lastAttemptAt: Date.now(),
    lastFailureReason: null,
    dynamicHosts: ['panel.reneo.my.id', '*.reneo.my.id', 'crm.toko.id', 'srv-reneo-1'],
  };

  // 2. Allowed hostname via Reneo Proxy X-Forwarded-Host passes
  const allowedProxy = await evaluateDomainGuardRequest({
    urlPath: '/api/auth/me',
    hostHeader: '127.0.0.1:18011',
    forwardedHostHeader: 'panel.reneo.my.id',
    requireReneoEnv: true,
    enforceDomain: true,
    reneoStatusOverride: verifiedStatus,
  });
  assert.equal(allowedProxy.allowed, true);

  // 3. Allowed OS hostname & wildcard subdomain pass
  const allowedHost = await evaluateDomainGuardRequest({
    urlPath: '/api/public/seo/landing',
    hostHeader: 'srv-reneo-1:18011',
    requireReneoEnv: true,
    enforceDomain: true,
    reneoStatusOverride: verifiedStatus,
  });
  assert.equal(allowedHost.allowed, true);

  // 4. Unauthorized third-party domain & raw public IP are rejected
  const badDomain = await evaluateDomainGuardRequest({
    urlPath: '/api/auth/me',
    hostHeader: 'unauthorized-clone.com',
    requireReneoEnv: true,
    enforceDomain: true,
    reneoStatusOverride: verifiedStatus,
  });
  assert.equal(badDomain.allowed, false);
  assert.equal(badDomain.statusCode, 403);
  assert.equal(badDomain.code, 'DOMAIN_NOT_ALLOWED');

  const rawPublicIp = await evaluateDomainGuardRequest({
    urlPath: '/api/auth/me',
    hostHeader: '203.0.113.55:18011',
    requireReneoEnv: true,
    enforceDomain: true,
    reneoStatusOverride: verifiedStatus,
  });
  assert.equal(rawPublicIp.allowed, false);
  assert.equal(rawPublicIp.code, 'DOMAIN_NOT_ALLOWED');

  // 5. Spoofing X-Forwarded-Host: 127.0.0.1 or panel.reneo.my.id over untrusted public Host is rejected
  const spoofedLoopback = await evaluateDomainGuardRequest({
    urlPath: '/api/auth/me',
    hostHeader: '203.0.113.55:18011',
    forwardedHostHeader: '127.0.0.1',
    requireReneoEnv: true,
    enforceDomain: true,
    reneoStatusOverride: verifiedStatus,
  });
  assert.equal(spoofedLoopback.allowed, false);
  assert.equal(spoofedLoopback.code, 'DOMAIN_NOT_ALLOWED');

  const spoofedDomain = await evaluateDomainGuardRequest({
    urlPath: '/api/auth/me',
    hostHeader: 'evil.com',
    forwardedHostHeader: 'panel.reneo.my.id',
    requireReneoEnv: true,
    enforceDomain: true,
    reneoStatusOverride: verifiedStatus,
  });
  assert.equal(spoofedDomain.allowed, false);
  assert.equal(spoofedDomain.code, 'DOMAIN_NOT_ALLOWED');

  // 6. Internal Docker WAHA webhook inside bridge network passes
  const internalWebhook = await evaluateDomainGuardRequest({
    urlPath: '/api/waha/webhook',
    hostHeader: 'reneo-app-1-reneo-crm',
    requireReneoEnv: true,
    enforceDomain: true,
    reneoStatusOverride: verifiedStatus,
  });
  assert.equal(internalWebhook.allowed, true);
});
