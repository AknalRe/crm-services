import axios from 'axios';
import net from 'net';
import { config } from '../config';

const APP_TOKEN_PATTERN = /^v1\|\d+\|reneo-crm\|\d+\|[a-f0-9]{64}$/i;
const RENEO_VERIFY_TTL_MS = 60_000;
const RENEO_RETRY_INTERVAL_MS = 5_000;
const RENEO_OUTAGE_GRACE_MS = 5 * 60_000;

export interface DomainGuardCheckResult {
  allowed: boolean;
  statusCode?: number;
  code?: 'RENEO_ENV_REQUIRED' | 'DOMAIN_NOT_ALLOWED';
  error?: string;
  hostname?: string;
}

export interface ReneoRuntimeStatus {
  verified: boolean;
  lastVerifiedAt: number;
  lastAttemptAt: number;
  lastFailureReason: string | null;
  dynamicHosts: string[];
}

export interface ReneoVerifyFetcher {
  (url: string, headers: Record<string, string>): Promise<{
    authenticated?: boolean;
    reneoVerified?: boolean;
    allowedHosts?: string[];
    publicUrls?: string[];
    serverHostname?: string | null;
  } | null>;
}

const runtimeState: ReneoRuntimeStatus = {
  verified: false,
  lastVerifiedAt: 0,
  lastAttemptAt: 0,
  lastFailureReason: null,
  dynamicHosts: [],
};

let inflightVerifyPromise: Promise<ReneoRuntimeStatus> | null = null;

export function isValidReneoAppTokenFormat(token?: string | null): boolean {
  return APP_TOKEN_PATTERN.test(String(token || '').trim());
}

export function normalizeHostRule(raw?: string | null): string {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .trim();
  if (!cleaned) return '';
  if (cleaned.startsWith('[')) {
    const closeIdx = cleaned.indexOf(']');
    if (closeIdx > 0) return cleaned.slice(1, closeIdx);
  }
  const withoutPort = cleaned.replace(/:\d+$/, '');
  if (!withoutPort || withoutPort === '*') return '';
  return withoutPort;
}

export function extractHostnameFromHeader(rawHeader?: string | string[] | null): string {
  const firstVal = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const firstEntry = String(firstVal || '').split(',')[0].trim();
  return normalizeHostRule(firstEntry);
}

export function extractHostsFromUrls(urls?: string[] | null): string[] {
  if (!Array.isArray(urls)) return [];
  const out = new Set<string>();
  for (const item of urls) {
    const raw = String(item || '').trim();
    if (!raw) continue;
    try {
      const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
      const h = normalizeHostRule(parsed.host);
      if (h) out.add(h);
    } catch {
      const h = normalizeHostRule(raw);
      if (h) out.add(h);
    }
  }
  return Array.from(out);
}

export function matchesAllowedHostRule(hostname: string, rule: string): boolean {
  const host = normalizeHostRule(hostname);
  const pattern = normalizeHostRule(rule);
  if (!host || !pattern || pattern === '*') return false;
  if (pattern.startsWith('*.')) {
    const base = pattern.slice(2);
    if (!base) return false;
    return host === base || host.endsWith(`.${base}`);
  }
  if (pattern.startsWith('.')) {
    const base = pattern.slice(1);
    if (!base) return false;
    return host === base || host.endsWith(pattern);
  }
  return host === pattern;
}

export function isLoopbackHostname(hostname: string): boolean {
  const host = normalizeHostRule(hostname);
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (net.isIP(host)) {
    return host.startsWith('127.') || host === '::1';
  }
  return false;
}

export function isInternalContainerHost(hostname: string): boolean {
  const host = normalizeHostRule(hostname);
  if (!host) return false;
  if (isLoopbackHostname(host) || host === 'host.docker.internal') return true;
  // Single-label internal Docker service/container names (e.g., "backend", "reneo-app-1-reneo-crm")
  if (!host.includes('.')) return true;
  if (net.isIP(host) === 4) {
    const parts = host.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
  }
  return false;
}

export function syncReneoEnvironmentHosts(params: {
  allowedHosts?: string[] | null;
  publicUrls?: string[] | null;
  serverHostname?: string | null;
  verified?: boolean;
}): void {
  const merged = new Set<string>(runtimeState.dynamicHosts);
  for (const raw of params.allowedHosts || []) {
    const h = normalizeHostRule(raw);
    if (h) merged.add(h);
  }
  for (const h of extractHostsFromUrls(params.publicUrls)) {
    merged.add(h);
  }
  if (params.serverHostname) {
    const h = normalizeHostRule(params.serverHostname);
    if (h) merged.add(h);
  }
  runtimeState.dynamicHosts = Array.from(merged);
  if (params.verified) {
    runtimeState.verified = true;
    runtimeState.lastVerifiedAt = Date.now();
    runtimeState.lastFailureReason = null;
  }
}

export function resetReneoRuntimeStateForTest(): void {
  runtimeState.verified = false;
  runtimeState.lastVerifiedAt = 0;
  runtimeState.lastAttemptAt = 0;
  runtimeState.lastFailureReason = null;
  runtimeState.dynamicHosts = [];
  inflightVerifyPromise = null;
}

const defaultReneoVerifyFetcher: ReneoVerifyFetcher = async (url, headers) => {
  const res = await axios.get(url, { headers, timeout: 4500 });
  return res.data || null;
};

export async function verifyReneoRuntimeEnvironment(options?: {
  force?: boolean;
  appToken?: string;
  panelUrl?: string;
  fetcher?: ReneoVerifyFetcher;
}): Promise<ReneoRuntimeStatus> {
  const now = Date.now();
  const appToken = (options?.appToken ?? config.reneo.appToken ?? '').trim();
  const panelUrl = (options?.panelUrl ?? config.reneo.panelUrl ?? '').trim().replace(/\/+$/, '');

  if (!isValidReneoAppTokenFormat(appToken)) {
    runtimeState.verified = false;
    runtimeState.lastAttemptAt = now;
    runtimeState.lastFailureReason = 'Token lingkungan Reneo tidak ditemukan atau formatnya tidak valid.';
    return { ...runtimeState };
  }
  if (!panelUrl) {
    runtimeState.verified = false;
    runtimeState.lastAttemptAt = now;
    runtimeState.lastFailureReason = 'URL panel Reneo (RENEO_PANEL_URL) belum dikonfigurasi.';
    return { ...runtimeState };
  }

  if (
    !options?.force &&
    runtimeState.verified &&
    now - runtimeState.lastVerifiedAt < RENEO_VERIFY_TTL_MS
  ) {
    return { ...runtimeState };
  }
  if (
    !options?.force &&
    !runtimeState.verified &&
    runtimeState.lastAttemptAt > 0 &&
    now - runtimeState.lastAttemptAt < RENEO_RETRY_INTERVAL_MS
  ) {
    return { ...runtimeState };
  }

  if (inflightVerifyPromise && !options?.force) {
    return inflightVerifyPromise;
  }

  const runVerify = async (): Promise<ReneoRuntimeStatus> => {
    const attemptAt = Date.now();
    runtimeState.lastAttemptAt = attemptAt;
    const fetcher = options?.fetcher || defaultReneoVerifyFetcher;
    try {
      const payload = await fetcher(`${panelUrl}/api/v1/app-catalog/license/reneo-crm`, {
        Accept: 'application/json',
        'X-Reneo-App-Token': appToken,
      });
      if (payload?.authenticated === true && payload?.reneoVerified === true) {
        syncReneoEnvironmentHosts({
          allowedHosts: payload.allowedHosts,
          publicUrls: payload.publicUrls,
          serverHostname: payload.serverHostname,
          verified: true,
        });
      } else {
        runtimeState.verified = false;
        runtimeState.lastVerifiedAt = 0;
        runtimeState.lastFailureReason =
          'Panel Reneo menolak token aplikasi; CRM hanya dapat dijalankan di instansiasi Reneo yang sah.';
      }
    } catch (err: any) {
      const stillInGrace =
        runtimeState.lastVerifiedAt > 0 &&
        attemptAt - runtimeState.lastVerifiedAt < RENEO_OUTAGE_GRACE_MS;
      if (!stillInGrace) {
        runtimeState.verified = false;
      }
      runtimeState.lastFailureReason =
        err?.message || 'Tidak dapat memverifikasi lingkungan panel Reneo.';
    } finally {
      inflightVerifyPromise = null;
    }
    return { ...runtimeState };
  };

  inflightVerifyPromise = runVerify();
  return inflightVerifyPromise;
}

export async function evaluateDomainGuardRequest(params: {
  urlPath: string;
  hostHeader?: string | string[];
  forwardedHostHeader?: string | string[];
  requireReneoEnv?: boolean;
  enforceDomain?: boolean;
  allowedDomains?: string[];
  dynamicHosts?: string[];
  reneoStatusOverride?: ReneoRuntimeStatus;
  appToken?: string;
  panelUrl?: string;
  fetcher?: ReneoVerifyFetcher;
}): Promise<DomainGuardCheckResult> {
  const cleanPath = String(params.urlPath || '').split('?')[0];
  const requireReneoEnv = params.requireReneoEnv ?? config.reneo.requireReneoEnv;
  const enforceDomain = params.enforceDomain ?? config.reneo.enforceDomain;

  let runtimeStatus = params.reneoStatusOverride;
  if (requireReneoEnv && !runtimeStatus) {
    runtimeStatus = await verifyReneoRuntimeEnvironment({
      appToken: params.appToken,
      panelUrl: params.panelUrl,
      fetcher: params.fetcher,
    });
  }

  // Health endpoint remains probeable by local Docker while reporting verified state in payload.
  if (cleanPath === '/health') {
    return { allowed: true };
  }

  if (requireReneoEnv && !runtimeStatus?.verified) {
    return {
      allowed: false,
      statusCode: 403,
      code: 'RENEO_ENV_REQUIRED',
      error:
        'CRM ini hanya dapat diinstal dan dijalankan di lingkungan Reneo dari hostname dan domain yang diizinkan.',
    };
  }

  const staticRules = params.allowedDomains ?? config.reneo.allowedDomains;
  const dynamicRules = params.dynamicHosts ?? runtimeStatus?.dynamicHosts ?? runtimeState.dynamicHosts;
  const combinedRules = Array.from(
    new Set([...staticRules, ...dynamicRules].map((r) => normalizeHostRule(r)).filter(Boolean))
  );

  if (!enforceDomain && combinedRules.length === 0) {
    return { allowed: true };
  }

  const forwardedHost = extractHostnameFromHeader(params.forwardedHostHeader);
  const directHost = extractHostnameFromHeader(params.hostHeader);

  // Reject untrusted public Host headers trying to spoof X-Forwarded-Host directly against container port.
  if (
    forwardedHost &&
    directHost &&
    !isInternalContainerHost(directHost) &&
    !combinedRules.some((rule) => matchesAllowedHostRule(directHost, rule))
  ) {
    return {
      allowed: false,
      statusCode: 403,
      code: 'DOMAIN_NOT_ALLOWED',
      hostname: directHost,
      error:
        'Hostname atau domain tidak diizinkan. CRM ini hanya dapat diinstal dan diakses dari hostname serta domain yang terdaftar di lingkungan Reneo.',
    };
  }

  const hostname = forwardedHost || directHost;

  if (!hostname) {
    return {
      allowed: false,
      statusCode: 403,
      code: 'DOMAIN_NOT_ALLOWED',
      error:
        'Hostname tidak valid. CRM ini hanya dapat diakses dari hostname dan domain yang diizinkan di lingkungan Reneo.',
    };
  }

  // Internal container-to-container WAHA webhook traffic inside Docker bridge without external forwarded host.
  if (
    !forwardedHost &&
    (cleanPath === '/api/waha/webhook' || cleanPath.startsWith('/api/waha/webhook/')) &&
    isInternalContainerHost(hostname)
  ) {
    return { allowed: true, hostname };
  }

  // Allow local loopback only when direct host is also local/internal (never spoofed via public Host).
  if (
    (isLoopbackHostname(hostname) && (!directHost || isInternalContainerHost(directHost))) ||
    (!forwardedHost && hostname === 'host.docker.internal')
  ) {
    return { allowed: true, hostname };
  }

  if (combinedRules.some((rule) => matchesAllowedHostRule(hostname, rule))) {
    return { allowed: true, hostname };
  }

  return {
    allowed: false,
    statusCode: 403,
    code: 'DOMAIN_NOT_ALLOWED',
    hostname,
    error:
      'Hostname atau domain tidak diizinkan. CRM ini hanya dapat diinstal dan diakses dari hostname serta domain yang terdaftar di lingkungan Reneo.',
  };
}
