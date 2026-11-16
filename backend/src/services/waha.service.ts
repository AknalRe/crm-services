import crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';
import { eq } from 'drizzle-orm';
import { config } from '../config';
import { db } from '../db';
import { systemSettings } from '../db/schema';
import { licenseService } from './license.service';
import { fromWahaChatId, isPhoneWahaJid, normalizePhoneNumber, toWahaChatId } from './phone.utils';

export function isPrivateOrInternalUrl(rawUrl?: string | null): boolean {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return true;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (!host) return true;
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host === 'host.docker.internal' ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return true;
    }
    if (!host.includes('.')) {
      return true;
    }
    if (/^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) {
      return true;
    }
    const octets = host.split('.');
    if (octets.length === 4 && octets[0] === '172') {
      const second = Number(octets[1]);
      if (second >= 16 && second <= 31) return true;
    }
    return false;
  } catch {
    return true;
  }
}

export interface WahaWebhookTelemetry {
  receivedAt: string;
  event: string;
  session?: string | null;
  from?: string | null;
  outcome: 'PROCESSED' | 'DEDUP' | 'IGNORED' | 'ERROR';
  note?: string;
}

export interface WahaConfig {
  baseUrl: string;
  apiKey?: string;
  session: string;
  mode?: 'INTERNAL' | 'EXTERNAL';
  internalLocked?: boolean;
  hasApiKey?: boolean;
  customWebhookUrl?: string;
  detectedPublicUrl?: string;
  externalConfig?: {
    baseUrl: string;
    apiKey?: string;
    hasApiKey?: boolean;
  };
  internalConfig?: {
    baseUrl: string;
    hasApiKey?: boolean;
  };
}

export interface WahaSessionInfo {
  name: string;
  status: string;
  me?: {
    id?: string;
    pushName?: string;
  } | null;
}

export class WahaService {
  private static instance: WahaService;
  private webhookSyncAt = new Map<string, number>();
  private lidPhoneCache = new Map<string, string>();
  private lastWebhookEvent: WahaWebhookTelemetry | null = null;
  private lastDetectedPublicBaseUrl = '';

  private constructor() { }

  public recordWebhookEvent(entry: WahaWebhookTelemetry): void {
    this.lastWebhookEvent = entry;
  }

  public getLastWebhookEvent(): WahaWebhookTelemetry | null {
    return this.lastWebhookEvent;
  }

  public static getInstance(): WahaService {
    if (!WahaService.instance) {
      WahaService.instance = new WahaService();
    }
    return WahaService.instance;
  }

  private hasInternalEnv(): boolean {
    return Boolean(process.env.WAHA_BASE_URL && process.env.WAHA_BASE_URL.trim() !== '');
  }

  /**
   * In shared internal WAHA mode, scope all sessions to this CRM instance's owner prefix
   * (e.g. "nivertari" -> allows "nivertari" and "nivertari-*") so tenants never see or touch
   * another user's WhatsApp sessions.
   */
  private getOwnerPrefix(mode?: 'INTERNAL' | 'EXTERNAL'): string | null {
    if (mode !== 'INTERNAL') return null;
    const base = (config.waha.session || '').trim();
    if (!base || base === 'default') return null;
    return base;
  }

  private isOwnedSession(sessionName: string, ownerPrefix: string | null): boolean {
    if (!ownerPrefix) return true;
    return (
      sessionName === ownerPrefix ||
      sessionName.startsWith(`${ownerPrefix}-`) ||
      sessionName.startsWith(`${ownerPrefix}_`)
    );
  }

  private resolveOwnedSessionName(inputName: string, ownerPrefix: string | null): string {
    const clean = inputName.trim();
    if (!ownerPrefix) return clean;
    if (this.isOwnedSession(clean, ownerPrefix)) return clean;
    return `${ownerPrefix}-${clean}`;
  }

  private assertOwnedSession(sessionName: string, ownerPrefix: string | null): void {
    if (!this.isOwnedSession(sessionName, ownerPrefix)) {
      const err: any = new Error('Sesi WhatsApp ini tidak dimiliki oleh akun CRM Anda.');
      err.statusCode = 403;
      throw err;
    }
  }

  private createHttpClient(baseUrl: string, apiKey?: string, timeoutMs = 30000): AxiosInstance {
    const cleanBaseUrl = (baseUrl || '').trim().replace(/\/+$/, '');
    if (!cleanBaseUrl || !/^https?:\/\//i.test(cleanBaseUrl)) {
      const err: any = new Error(
        'Base URL WAHA belum dikonfigurasi atau tidak valid (harus diawali http:// atau https://).'
      );
      err.statusCode = 400;
      throw err;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (apiKey && apiKey.trim() !== '') {
      headers['X-Api-Key'] = apiKey.trim();
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    return axios.create({
      baseURL: cleanBaseUrl,
      headers,
      timeout: timeoutMs,
    });
  }

  private extractWahaError(err: any, fallbackPrefix?: string): string {
    const status = err?.response?.status;
    const rawMsg =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      (typeof err?.response?.data === 'string' ? err.response.data : '') ||
      err?.message ||
      'Terjadi kesalahan pada server WAHA';

    const msg = String(rawMsg).trim();
    if (status === 401 || status === 403) {
      return `Autentikasi WAHA gagal (${status}): API Key tidak valid atau ditolak server WAHA.${msg ? ` (${msg})` : ''}`;
    }
    if (err?.code === 'ECONNREFUSED') {
      return `Koneksi ke server WAHA ditolak (ECONNREFUSED). Pastikan container/service WAHA sedang berjalan.`;
    }
    if (err?.code === 'ENOTFOUND' || err?.code === 'EAI_AGAIN') {
      return `Hostname server WAHA tidak ditemukan (${err.code}). Periksa kembali Base URL WAHA.`;
    }
    if (err?.code === 'ETIMEDOUT' || err?.code === 'ECONNABORTED') {
      return `Koneksi ke server WAHA timeout (${err.code}). Server tidak merespons tepat waktu.`;
    }
    return fallbackPrefix && !msg.toLowerCase().includes(fallbackPrefix.toLowerCase())
      ? `${fallbackPrefix}: ${msg}`
      : msg;
  }

  private wrapWahaError(err: any, fallbackPrefix?: string): Error {
    const wrapped: any = new Error(this.extractWahaError(err, fallbackPrefix));
    wrapped.statusCode = err?.statusCode || err?.response?.status || 502;
    return wrapped;
  }

  private isWahaCoreSingleSessionError(err: any): boolean {
    const status = err?.response?.status;
    if (status !== 400 && status !== 403 && status !== 422) return false;
    const msg = String(
      err?.response?.data?.message || err?.response?.data?.error || err?.message || ''
    ).toLowerCase();
    return (
      msg.includes('waha core') ||
      msg.includes("only 'default' session") ||
      msg.includes('only one session') ||
      msg.includes('upgrade to waha plus')
    );
  }

  private async fetchRawSessionList(client: AxiosInstance): Promise<any[]> {
    const normalize = (data: any): any[] => {
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.sessions)) return data.sessions;
      return [];
    };

    try {
      const res = await client.get('/api/sessions?all=true');
      return normalize(res.data);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 400 || status === 404 || status === 405) {
        const res = await client.get('/api/sessions');
        return normalize(res.data);
      }
      throw err;
    }
  }

  public async resolveSessionName(inputName: string): Promise<string> {
    const conf = await this.getConfig();
    const ownerPrefix = this.getOwnerPrefix(conf.mode);
    return this.resolveOwnedSessionName(inputName, ownerPrefix);
  }

  /**
   * Get active WAHA configuration (internal mode locks URL & API key to env when configured)
   */
  public async getConfig(maskSecret = false): Promise<WahaConfig> {
    const internalEnv = this.hasInternalEnv();
    try {
      const settings = await db.select().from(systemSettings);
      const modeSetting = settings.find((s) => s.key === 'waha_mode');
      const urlSetting = settings.find((s) => s.key === 'waha_base_url');
      const keySetting = settings.find((s) => s.key === 'waha_api_key');
      const sessionSetting = settings.find((s) => s.key === 'waha_session');
      const webhookSetting = settings.find((s) => s.key === 'waha_webhook_url');
      const detectedPublicSetting = settings.find((s) => s.key === 'waha_detected_public_url');
      const customWebhookUrl = (webhookSetting?.value || '').trim();
      const detectedPublicUrl = (detectedPublicSetting?.value || '').trim();
      if (detectedPublicUrl && !isPrivateOrInternalUrl(detectedPublicUrl)) {
        this.lastDetectedPublicBaseUrl = detectedPublicUrl;
      }

      const mode: 'INTERNAL' | 'EXTERNAL' =
        modeSetting?.value === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL';

      const savedExternalUrl = (urlSetting?.value || '').trim();
      const savedExternalKey = keySetting?.value || '';
      const externalConfig = {
        baseUrl: savedExternalUrl,
        apiKey: maskSecret ? (savedExternalKey ? '••••••••' : '') : savedExternalKey,
        hasApiKey: Boolean(savedExternalKey && savedExternalKey.trim() !== ''),
      };

      const internalUrl = config.waha.baseUrl;
      const internalRawKey = config.waha.apiKey;
      const internalConfig = {
        baseUrl: internalUrl,
        hasApiKey: Boolean(internalRawKey && internalRawKey.trim() !== ''),
      };

      if (mode === 'INTERNAL') {
        const session = sessionSetting?.value || config.waha.session || 'default';
        return {
          baseUrl: internalUrl,
          apiKey: maskSecret ? (internalRawKey ? '••••••••' : '') : internalRawKey,
          session,
          mode: 'INTERNAL',
          internalLocked: true,
          hasApiKey: internalConfig.hasApiKey,
          customWebhookUrl,
          detectedPublicUrl: detectedPublicUrl || this.lastDetectedPublicBaseUrl || undefined,
          externalConfig,
          internalConfig,
        };
      }

      return {
        baseUrl: savedExternalUrl,
        apiKey: maskSecret ? (savedExternalKey ? '••••••••' : '') : savedExternalKey,
        session: (sessionSetting?.value || '').trim() || 'default',
        mode: 'EXTERNAL',
        internalLocked: false,
        hasApiKey: externalConfig.hasApiKey,
        customWebhookUrl,
        detectedPublicUrl: detectedPublicUrl || this.lastDetectedPublicBaseUrl || undefined,
        externalConfig,
        internalConfig,
      };
    } catch {
      return {
        baseUrl: config.waha.baseUrl,
        apiKey: maskSecret ? (config.waha.apiKey ? '••••••••' : '') : config.waha.apiKey,
        session: config.waha.session || 'default',
        mode: 'INTERNAL',
        internalLocked: true,
        hasApiKey: Boolean(config.waha.apiKey && config.waha.apiKey.trim() !== ''),
      };
    }
  }

  /**
   * Create Axios client with authentication headers
   */
  private async getClient(): Promise<{
    client: AxiosInstance;
    session: string;
    ownerPrefix: string | null;
    mode: 'INTERNAL' | 'EXTERNAL';
  }> {
    const conf = await this.getConfig();
    const mode: 'INTERNAL' | 'EXTERNAL' = conf.mode === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL';
    const ownerPrefix = this.getOwnerPrefix(mode);
    const activeSession =
      ownerPrefix && !this.isOwnedSession(conf.session, ownerPrefix) ? ownerPrefix : conf.session;
    const client = this.createHttpClient(conf.baseUrl, conf.apiKey, 30000);
    return { client, session: activeSession, ownerPrefix, mode };
  }

  /**
   * Test connection against either current stored config or draft external credentials
   */
  public async testConnection(overrides?: {
    mode?: 'INTERNAL' | 'EXTERNAL';
    baseUrl?: string;
    apiKey?: string;
  }): Promise<{
    connected: boolean;
    mode: 'INTERNAL' | 'EXTERNAL';
    baseUrl: string;
    version?: string | null;
    tier?: string | null;
    sessionCount: number;
    sessions: Array<{ name: string; status: string }>;
  }> {
    const stored = await this.getConfig(false);
    const targetMode: 'INTERNAL' | 'EXTERNAL' =
      overrides?.mode || stored.mode || 'INTERNAL';
    const targetUrl =
      targetMode === 'INTERNAL'
        ? stored.internalConfig?.baseUrl || stored.baseUrl
        : (
            overrides?.baseUrl !== undefined
              ? overrides.baseUrl
              : stored.externalConfig?.baseUrl || stored.baseUrl
          ).trim();
    const savedExtKey =
      stored.externalConfig?.apiKey !== undefined
        ? stored.externalConfig.apiKey
        : stored.mode === 'EXTERNAL'
          ? stored.apiKey
          : '';
    const targetKey =
      targetMode === 'INTERNAL'
        ? stored.apiKey
        : overrides?.apiKey === undefined || overrides.apiKey === '••••••••'
          ? savedExtKey
          : overrides.apiKey;

    const client = this.createHttpClient(targetUrl, targetKey, 10000);
    const ownerPrefix = this.getOwnerPrefix(targetMode);

    try {
      const rawList = await this.fetchRawSessionList(client);
      const sessions = rawList
        .map((item: any) => ({
          name: String(item.name || 'default'),
          status: String(item.status || 'UNKNOWN'),
        }))
        .filter((item) => this.isOwnedSession(item.name, ownerPrefix));

      const verRes = await client
        .get('/api/version')
        .catch(() => client.get('/api/server/version'))
        .catch(() => null);

      return {
        connected: true,
        mode: targetMode,
        baseUrl: targetUrl.replace(/\/+$/, ''),
        version: verRes?.data?.version ? String(verRes.data.version) : null,
        tier: verRes?.data?.tier ? String(verRes.data.tier) : null,
        sessionCount: sessions.length,
        sessions,
      };
    } catch (err: any) {
      throw this.wrapWahaError(err, 'Tes koneksi WAHA gagal');
    }
  }

  /**
   * Persist observed public CRM base URL so background jobs / external WAHA webhook sync can use it
   */
  public async rememberPublicBaseUrl(rawBaseUrl?: string | null): Promise<void> {
    const clean = String(rawBaseUrl || '').trim().replace(/\/+$/, '');
    if (!clean || !/^https?:\/\//i.test(clean) || isPrivateOrInternalUrl(clean)) return;
    this.lastDetectedPublicBaseUrl = clean;
    try {
      const now = new Date();
      await db
        .insert(systemSettings)
        .values({ key: 'waha_detected_public_url', value: clean, updatedAt: now })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: clean, updatedAt: now },
        });
    } catch {
      // Ignore DB persistence failures in unit tests / readonly scenarios
    }
  }

  /**
   * Resolve the best webhook URL for WAHA events based on active mode (INTERNAL vs EXTERNAL)
   */
  public async resolveEffectiveWebhookUrl(
    currentConfig?: WahaConfig,
    requestBaseUrl?: string | null
  ): Promise<{ url: string; isPublic: boolean; source: string }> {
    const conf = currentConfig || (await this.getConfig(true));
    const custom = (conf.customWebhookUrl || '').trim();
    if (custom && /^https?:\/\//i.test(custom)) {
      return { url: custom, isPublic: !isPrivateOrInternalUrl(custom), source: 'custom' };
    }

    if (conf.mode !== 'EXTERNAL') {
      const url = (config.webhookUrl || '').trim();
      return { url, isPublic: !isPrivateOrInternalUrl(url), source: 'internal' };
    }

    const candidates: Array<{ base: string; source: string }> = [];
    if (config.meta.publicBaseUrl) {
      candidates.push({ base: config.meta.publicBaseUrl, source: 'public_env' });
    }
    try {
      for (const pub of licenseService.getCachedPublicUrls()) {
        if (pub) candidates.push({ base: pub, source: 'license_public_url' });
      }
    } catch {
      // Ignore license lookup failures
    }
    if (requestBaseUrl) {
      candidates.push({ base: requestBaseUrl, source: 'request_origin' });
    }
    if (conf.detectedPublicUrl) {
      candidates.push({ base: conf.detectedPublicUrl, source: 'detected_origin' });
    } else if (this.lastDetectedPublicBaseUrl) {
      candidates.push({ base: this.lastDetectedPublicBaseUrl, source: 'detected_origin' });
    }

    for (const item of candidates) {
      const cleanBase = String(item.base || '').trim().replace(/\/+$/, '');
      if (cleanBase && /^https?:\/\//i.test(cleanBase) && !isPrivateOrInternalUrl(cleanBase)) {
        const fullUrl = cleanBase.endsWith('/api/waha/webhook')
          ? cleanBase
          : `${cleanBase}/api/waha/webhook`;
        return { url: fullUrl, isPublic: true, source: item.source };
      }
    }

    const fallback = (config.webhookUrl || '').trim();
    return { url: fallback, isPublic: !isPrivateOrInternalUrl(fallback), source: 'internal_fallback' };
  }

  /**
   * Resolve a WhatsApp @lid privacy JID to a normalized phone number via WAHA API (cached)
   */
  public async resolveLidToPhone(sessionName: string | null | undefined, lidJid: string): Promise<string | null> {
    const cleanLid = String(lidJid || '').trim();
    if (!cleanLid || !cleanLid.toLowerCase().endsWith('@lid')) return null;

    const cached = this.lidPhoneCache.get(cleanLid);
    if (cached) return cached;

    try {
      const { client, session, ownerPrefix } = await this.getClient();
      const targetSession = sessionName
        ? this.resolveOwnedSessionName(sessionName, ownerPrefix)
        : session;

      const tryExtractPhone = (candidate: unknown): string | null => {
        if (typeof candidate !== 'string' || !candidate.trim()) return null;
        if (candidate.toLowerCase().endsWith('@lid')) return null;
        const normalized = normalizePhoneNumber(fromWahaChatId(candidate));
        const digits = normalized.replace(/\D/g, '');
        return digits.length >= 7 && digits.length <= 15 ? normalized : null;
      };

      const lidRes = await client
        .get(`/api/${encodeURIComponent(targetSession)}/lids/${encodeURIComponent(cleanLid)}`, {
          timeout: 3500,
        })
        .catch(() => null);

      const lidCandidates = [
        lidRes?.data?.pn,
        lidRes?.data?.phoneNumber,
        lidRes?.data?.id,
      ];
      for (const c of lidCandidates) {
        const phone = tryExtractPhone(c);
        if (phone) {
          if (this.lidPhoneCache.size > 2000) this.lidPhoneCache.clear();
          this.lidPhoneCache.set(cleanLid, phone);
          return phone;
        }
      }

      const contactRes = await client
        .get('/api/contacts', {
          params: { contactId: cleanLid, session: targetSession },
          timeout: 3500,
        })
        .catch(() => null);

      const contactCandidates = [
        contactRes?.data?.number,
        contactRes?.data?.id,
        isPhoneWahaJid(String(contactRes?.data?.id || '')) ? contactRes?.data?.id : null,
      ];
      for (const c of contactCandidates) {
        const phone = tryExtractPhone(c);
        if (phone) {
          if (this.lidPhoneCache.size > 2000) this.lidPhoneCache.clear();
          this.lidPhoneCache.set(cleanLid, phone);
          return phone;
        }
      }
    } catch {
      // Ignore LID lookup failures cleanly
    }
    return null;
  }

  /**
   * Check connection and server status
   */
  public async getStatus(requestBaseUrl?: string | null): Promise<{
    connected: boolean;
    sessionStatus?: string;
    activeSession?: string;
    connectedSessions?: number;
    totalSessions?: number;
    sessions?: Array<{ name: string; status: string }>;
    details?: any;
    error?: string;
    webhookUrl?: string;
    webhookReachableForExternal?: boolean;
    lastWebhook?: WahaWebhookTelemetry | null;
    config: WahaConfig;
  }> {
    if (requestBaseUrl) {
      void this.rememberPublicBaseUrl(requestBaseUrl);
    }
    const currentConfig = await this.getConfig(true);
    const resolvedWebhook = await this.resolveEffectiveWebhookUrl(currentConfig, requestBaseUrl);
    const webhookReachableForExternal =
      currentConfig.mode !== 'EXTERNAL' || resolvedWebhook.isPublic;

    try {
      const { client, session, ownerPrefix } = await this.getClient();
      currentConfig.session = session;

      const rawList = await this.fetchRawSessionList(client);
      const ownedList: Array<{ name: string; status: string; raw: any }> = rawList
        .map((item: any) => ({
          name: String(item.name || 'default'),
          status: String(item.status || 'UNKNOWN'),
          raw: item,
        }))
        .filter((item) => this.isOwnedSession(item.name, ownerPrefix));

      let resolvedActiveSession = session;
      let sessionData: any = ownedList.find((s) => s.name === session)?.raw || null;
      if (!sessionData && currentConfig.mode === 'EXTERNAL' && ownedList.length > 0) {
        const preferred = ownedList.find((s) => s.status === 'WORKING') || ownedList[0];
        sessionData = preferred.raw;
        resolvedActiveSession = preferred.name;
        currentConfig.session = preferred.name;
      } else if (!sessionData && session) {
        try {
          const res = await client.get(`/api/sessions/${encodeURIComponent(session)}`);
          sessionData = res.data;
        } catch (err: any) {
          if (err?.response?.status !== 404) {
            throw err;
          }
        }
      }

      const status = sessionData?.status || 'NOT_FOUND';
      const sessionSummaries = ownedList.map((s) => ({ name: s.name, status: s.status }));
      const connectedSessions = sessionSummaries.filter((s) => s.status === 'WORKING').length;

      // Ensure active/QR sessions have CRM's reachable webhook URL + inbound/ack events subscribed
      if (webhookReachableForExternal) {
        for (const item of ownedList) {
          if (item.status === 'WORKING' || item.status === 'SCAN_QR_CODE') {
            void this.ensureSessionWebhook(client, item.name, item.raw, {
              mode: currentConfig.mode,
              targetUrl: resolvedWebhook.url,
            });
          }
        }
      }

      return {
        connected: true,
        sessionStatus: status,
        activeSession: resolvedActiveSession,
        connectedSessions,
        totalSessions: sessionSummaries.length,
        sessions: sessionSummaries,
        details: sessionData,
        webhookUrl: resolvedWebhook.url,
        webhookReachableForExternal,
        lastWebhook: this.lastWebhookEvent,
        config: currentConfig,
      };
    } catch (err: any) {
      return {
        connected: false,
        sessionStatus: 'OFFLINE',
        activeSession: currentConfig.session,
        connectedSessions: 0,
        totalSessions: 0,
        sessions: [],
        error: this.extractWahaError(err),
        webhookUrl: resolvedWebhook.url,
        webhookReachableForExternal,
        lastWebhook: this.lastWebhookEvent,
        config: currentConfig,
      };
    }
  }

  /**
   * Ensure a WAHA session has CRM's webhook URL and required events configured
   */
  private async ensureSessionWebhook(
    client: AxiosInstance,
    sessionName: string,
    existingSessionData?: any,
    opts?: { mode?: 'INTERNAL' | 'EXTERNAL'; targetUrl?: string; force?: boolean }
  ): Promise<boolean> {
    const mode = opts?.mode || 'INTERNAL';
    const targetUrl = (opts?.targetUrl || config.webhookUrl || '').trim();
    if (!targetUrl) return false;
    if (mode === 'EXTERNAL' && isPrivateOrInternalUrl(targetUrl)) {
      return false;
    }

    const requiredEvents = ['message', 'message.ack', 'session.status'];
    let sessionData = existingSessionData;
    if (!sessionData) {
      try {
        const res = await client.get(`/api/sessions/${encodeURIComponent(sessionName)}`);
        sessionData = res.data;
      } catch {
        return false;
      }
    }

    const existingConfig = sessionData?.config && typeof sessionData.config === 'object' ? sessionData.config : {};
    const existingWebhooks: any[] = Array.isArray(existingConfig.webhooks) ? existingConfig.webhooks : [];
    const normTarget = targetUrl.replace(/\/+$/, '');
    const hasValidWebhook = existingWebhooks.some((wh) => {
      if (!wh || typeof wh.url !== 'string') return false;
      if (wh.url.trim().replace(/\/+$/, '') !== normTarget) return false;
      const evs: string[] = Array.isArray(wh.events) ? wh.events : [];
      const hasInbound = evs.includes('message') || evs.includes('message.any');
      return evs.includes('*') || (hasInbound && evs.includes('message.ack') && evs.includes('session.status'));
    });

    if (hasValidWebhook) return true;

    if (!opts?.force) {
      const lastAttempt = this.webhookSyncAt.get(sessionName) || 0;
      if (Date.now() - lastAttempt < 30_000) return false;
    }
    this.webhookSyncAt.set(sessionName, Date.now());

    const preservedWebhooks = existingWebhooks.filter(
      (wh) => wh && typeof wh.url === 'string' && !wh.url.replace(/\/+$/, '').endsWith('/api/waha/webhook')
    );
    const nextWebhooks = [
      ...preservedWebhooks,
      {
        url: targetUrl,
        events: requiredEvents,
      },
    ];

    try {
      await client.put(`/api/sessions/${encodeURIComponent(sessionName)}`, {
        name: sessionName,
        config: {
          ...existingConfig,
          webhooks: nextWebhooks,
        },
      });
      console.log(`[WahaService] Synced webhook for session "${sessionName}" -> ${targetUrl}`);
      return true;
    } catch (err: any) {
      console.warn(
        `[WahaService] Failed to sync webhook for session "${sessionName}":`,
        err?.response?.data || err?.message
      );
      return false;
    }
  }

  /**
   * Force webhook configuration sync across all owned sessions
   */
  public async syncSessionWebhooks(requestBaseUrl?: string | null): Promise<{
    webhookUrl: string;
    synced: string[];
    skippedReason?: string;
  }> {
    const conf = await this.getConfig(false);
    const resolved = await this.resolveEffectiveWebhookUrl(conf, requestBaseUrl);
    if (conf.mode === 'EXTERNAL' && !resolved.isPublic) {
      return {
        webhookUrl: resolved.url,
        synced: [],
        skippedReason:
          'URL Webhook saat ini masih bersifat internal Docker/lokal. Masukkan URL HTTPS publik CRM agar server WAHA eksternal dapat mengirimkan event masuk.',
      };
    }

    const { client, ownerPrefix } = await this.getClient();
    const rawList = await this.fetchRawSessionList(client);
    const owned = rawList
      .map((item: any) => ({ name: String(item.name || 'default'), status: String(item.status || 'UNKNOWN'), raw: item }))
      .filter((item) => this.isOwnedSession(item.name, ownerPrefix));

    const synced: string[] = [];
    for (const item of owned) {
      const ok = await this.ensureSessionWebhook(client, item.name, item.raw, {
        mode: conf.mode,
        targetUrl: resolved.url,
        force: true,
      });
      if (ok) synced.push(item.name);
    }
    return { webhookUrl: resolved.url, synced };
  }

  /**
   * Create/update session with automatic webhook tracking and start it
   */
  public async startSession(sessionName?: string): Promise<any> {
    const conf = await this.getConfig(false);
    const { client, session, ownerPrefix } = await this.getClient();
    const targetSession = sessionName
      ? this.resolveOwnedSessionName(sessionName, ownerPrefix)
      : session;
    this.assertOwnedSession(targetSession, ownerPrefix);

    const resolvedWebhook = await this.resolveEffectiveWebhookUrl(conf);
    const canAttachWebhook =
      Boolean(resolvedWebhook.url) && (conf.mode !== 'EXTERNAL' || resolvedWebhook.isPublic);
    const webhookConfigs = canAttachWebhook
      ? [
          {
            url: resolvedWebhook.url,
            events: ['message', 'message.ack', 'session.status'],
          },
        ]
      : [];

    try {
      const createRes = await client.post('/api/sessions', {
        name: targetSession,
        start: true,
        ...(webhookConfigs.length > 0 ? { config: { webhooks: webhookConfigs } } : {}),
      });
      return createRes.data;
    } catch (err: any) {
      if (this.isWahaCoreSingleSessionError(err)) {
        const coreErr: any = new Error(
          `Server WAHA ini menggunakan WAHA Core yang hanya mendukung 1 sesi bernama 'default'. Gunakan WAHA Plus untuk multi-sesi atau gunakan sesi 'default'.`
        );
        coreErr.statusCode = 422;
        throw coreErr;
      }

      const status = err?.response?.status;
      if (status === 409 || status === 422 || status === 404 || status === 405) {
        if ((status === 409 || status === 422) && canAttachWebhook) {
          await this.ensureSessionWebhook(client, targetSession, undefined, {
            mode: conf.mode,
            targetUrl: resolvedWebhook.url,
            force: true,
          }).catch(() => {});
        }
        try {
          const startRes = await client.post(`/api/sessions/${encodeURIComponent(targetSession)}/start`);
          return startRes.data;
        } catch (startErr: any) {
          try {
            const restartRes = await client.post(`/api/sessions/${encodeURIComponent(targetSession)}/restart`);
            return restartRes.data;
          } catch (restartErr: any) {
            await client.post(`/api/sessions/${encodeURIComponent(targetSession)}/stop`).catch(() => { });
            try {
              const startAfterStopRes = await client.post(`/api/sessions/${encodeURIComponent(targetSession)}/start`);
              return startAfterStopRes.data;
            } catch {
              await client.post('/api/sessions/stop', { name: targetSession }).catch(() => { });
              try {
                const legacyRes = await client.post('/api/sessions/start', {
                  name: targetSession,
                  ...(webhookConfigs.length > 0 ? { config: { webhooks: webhookConfigs } } : {}),
                });
                return legacyRes.data;
              } catch (legacyErr: any) {
                throw this.wrapWahaError(
                  startErr?.response ? startErr : restartErr?.response ? restartErr : legacyErr,
                  `Gagal memulai sesi "${targetSession}"`
                );
              }
            }
          }
        }
      }
      throw this.wrapWahaError(err, `Gagal memulai sesi "${targetSession}"`);
    }
  }

  /**
   * Stop a session
   */
  public async stopSession(sessionName?: string): Promise<any> {
    const { client, session, ownerPrefix } = await this.getClient();
    const targetSession = sessionName
      ? this.resolveOwnedSessionName(sessionName, ownerPrefix)
      : session;
    this.assertOwnedSession(targetSession, ownerPrefix);
    try {
      const response = await client.post(`/api/sessions/${encodeURIComponent(targetSession)}/stop`);
      return response.data;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404 || status === 405) {
        try {
          const response = await client.post('/api/sessions/stop', { name: targetSession });
          return response.data;
        } catch (legacyErr: any) {
          throw this.wrapWahaError(legacyErr, `Gagal menghentikan sesi "${targetSession}"`);
        }
      }
      throw this.wrapWahaError(err, `Gagal menghentikan sesi "${targetSession}"`);
    }
  }

  /**
   * Logout a session
   */
  public async logoutSession(sessionName?: string): Promise<any> {
    const { client, session, ownerPrefix } = await this.getClient();
    const targetSession = sessionName
      ? this.resolveOwnedSessionName(sessionName, ownerPrefix)
      : session;
    this.assertOwnedSession(targetSession, ownerPrefix);
    try {
      const response = await client.post(`/api/sessions/${encodeURIComponent(targetSession)}/logout`);
      return response.data;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404 || status === 405) {
        try {
          const response = await client.post('/api/sessions/logout', { name: targetSession });
          return response.data;
        } catch (legacyErr: any) {
          throw this.wrapWahaError(legacyErr, `Gagal logout sesi "${targetSession}"`);
        }
      }
      throw this.wrapWahaError(err, `Gagal logout sesi "${targetSession}"`);
    }
  }

  /**
   * List sessions belonging to this CRM instance (scoped in shared internal WAHA mode)
   */
  public async listSessions(): Promise<{ sessions: WahaSessionInfo[]; activeSession: string }> {
    const conf = await this.getConfig();
    const { client, session, ownerPrefix } = await this.getClient();
    try {
      const rawList = await this.fetchRawSessionList(client);
      const sessions: WahaSessionInfo[] = rawList
        .map((item: any) => ({
          name: String(item.name || 'default'),
          status: String(item.status || 'UNKNOWN'),
          me: item.me || null,
        }))
        .filter((item) => this.isOwnedSession(item.name, ownerPrefix));
      let activeSession = session;
      if (conf.mode === 'EXTERNAL' && sessions.length > 0 && !sessions.some((s) => s.name === session)) {
        activeSession = sessions.find((s) => s.status === 'WORKING')?.name || sessions[0].name;
      }
      return { sessions, activeSession };
    } catch (err: any) {
      throw this.wrapWahaError(err, 'Gagal mengambil daftar sesi WAHA');
    }
  }

  /**
   * Persist active WAHA session in database
   */
  public async setActiveSession(sessionName: string): Promise<string> {
    const clean = sessionName.trim();
    if (!clean || !/^[a-zA-Z0-9_-]+$/.test(clean)) {
      throw new Error('Nama sesi hanya boleh huruf, angka, tanda hubung (-), atau underscore (_)');
    }
    const conf = await this.getConfig();
    const ownerPrefix = this.getOwnerPrefix(conf.mode);
    this.assertOwnedSession(clean, ownerPrefix);
    const now = new Date();
    await db
      .insert(systemSettings)
      .values({ key: 'waha_session', value: clean, updatedAt: now })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: clean, updatedAt: now },
      });
    return clean;
  }

  /**
   * Create and start a WAHA session (and optionally set as active)
   */
  public async createAndStartSession(sessionName: string, setActive = true): Promise<any> {
    const clean = sessionName.trim();
    if (!clean || !/^[a-zA-Z0-9_-]+$/.test(clean)) {
      throw new Error('Nama sesi hanya boleh huruf, angka, tanda hubung (-), atau underscore (_)');
    }
    const conf = await this.getConfig();
    const ownerPrefix = this.getOwnerPrefix(conf.mode);
    const scopedName = this.resolveOwnedSessionName(clean, ownerPrefix);
    const result = await this.startSession(scopedName);
    if (setActive) {
      await this.setActiveSession(scopedName);
    }
    return result;
  }

  /**
   * Delete a session from WAHA and fallback active session if needed
   */
  public async deleteSession(sessionName: string): Promise<any> {
    const clean = sessionName.trim();
    if (!clean) {
      throw new Error('Nama sesi wajib diisi');
    }
    const { client, session: currentActive, ownerPrefix } = await this.getClient();
    const targetSession = this.resolveOwnedSessionName(clean, ownerPrefix);
    this.assertOwnedSession(targetSession, ownerPrefix);
    let result: any;
    try {
      const res = await client.delete(`/api/sessions/${encodeURIComponent(targetSession)}`);
      result = res.data;
    } catch {
      await client
        .post(`/api/sessions/${encodeURIComponent(targetSession)}/stop`)
        .catch(() => client.post('/api/sessions/stop', { name: targetSession }))
        .catch(() => null);
      const res = await client
        .post(`/api/sessions/${encodeURIComponent(targetSession)}/logout`)
        .catch(() => client.post('/api/sessions/logout', { name: targetSession }))
        .catch(() => ({ data: { ok: true } }));
      result = res.data;
    }

    if (currentActive === targetSession || currentActive === clean) {
      const fallback = ownerPrefix || 'default';
      try {
        const remaining = await this.listSessions();
        const nextSession = remaining.sessions.find((s) => s.name !== targetSession)?.name || fallback;
        await this.setActiveSession(nextSession);
      } catch {
        await this.setActiveSession(fallback).catch(() => null);
      }
    }

    return result;
  }

  /**
   * Get QR Code for scanning
   */
  public async getQrCode(sessionName?: string): Promise<{ qr?: string; status: string; error?: string }> {
    const { client, session, ownerPrefix } = await this.getClient();
    const targetSession = sessionName
      ? this.resolveOwnedSessionName(sessionName, ownerPrefix)
      : session;
    this.assertOwnedSession(targetSession, ownerPrefix);

    let currentStatus = 'UNKNOWN';
    let startError: string | undefined;
    try {
      try {
        const sRes = await client.get(`/api/sessions/${encodeURIComponent(targetSession)}`);
        currentStatus = sRes.data?.status || 'UNKNOWN';
      } catch (err: any) {
        if (err?.response?.status === 404) {
          currentStatus = 'NOT_FOUND';
        } else {
          throw err;
        }
      }

      if (currentStatus === 'WORKING') {
        return { status: 'WORKING' };
      }

      if (
        currentStatus === 'STOPPED' ||
        currentStatus === 'NOT_FOUND' ||
        currentStatus === 'UNKNOWN' ||
        currentStatus === 'FAILED'
      ) {
        try {
          if (currentStatus === 'FAILED') {
            await client
              .post(`/api/sessions/${encodeURIComponent(targetSession)}/restart`)
              .catch(() => this.startSession(targetSession));
          } else {
            await this.startSession(targetSession);
          }
        } catch (err: any) {
          startError = this.extractWahaError(err);
        }

        try {
          const sRes = await client.get(`/api/sessions/${encodeURIComponent(targetSession)}`);
          currentStatus = sRes.data?.status || 'STARTING';
        } catch {
          currentStatus = startError ? currentStatus : 'STARTING';
        }
      }

      if (currentStatus === 'WORKING') {
        return { status: 'WORKING' };
      }

      const imgRes = await client.get(`/api/${encodeURIComponent(targetSession)}/auth/qr`, {
        responseType: 'arraybuffer',
      });
      const contentType = String(imgRes.headers?.['content-type'] || 'image/png');
      if (contentType.includes('application/json')) {
        const parsed = JSON.parse(Buffer.from(imgRes.data).toString('utf8'));
        if (parsed?.data) {
          const rawData = String(parsed.data);
          const qrDataUrl = rawData.startsWith('data:image/')
            ? rawData
            : `data:${parsed.mimetype || 'image/png'};base64,${rawData}`;
          return { qr: qrDataUrl, status: 'SCAN_QR_CODE' };
        }
        return {
          status: currentStatus !== 'UNKNOWN' ? currentStatus : 'STARTING',
          qr: undefined,
          ...(startError ? { error: startError } : {}),
        };
      }
      const mime = contentType.split(';')[0].trim() || 'image/png';
      const base64 = Buffer.from(imgRes.data, 'binary').toString('base64');
      return {
        qr: `data:${mime};base64,${base64}`,
        status: 'SCAN_QR_CODE',
      };
    } catch (err: any) {
      return {
        status: currentStatus !== 'UNKNOWN' ? currentStatus : 'FAILED',
        qr: undefined,
        error: startError || this.extractWahaError(err),
      };
    }
  }

  private extractOutboundMessageId(data: any): string {
    return (
      data?.id?._serialized ||
      (typeof data?.id === 'string' ? data.id : null) ||
      data?.id?.id ||
      data?.key?.id ||
      data?.messageId ||
      `WAHA_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`
    );
  }

  private async pickLiveWorkingSession(
    client: AxiosInstance,
    ownerPrefix: string | null,
    excludeSession?: string
  ): Promise<string | null> {
    try {
      const rawList = await this.fetchRawSessionList(client);
      const owned = rawList
        .map((item: any) => ({
          name: String(item.name || 'default'),
          status: String(item.status || 'UNKNOWN'),
        }))
        .filter((item) => this.isOwnedSession(item.name, ownerPrefix));
      const working = owned.find((s) => s.status === 'WORKING' && s.name !== excludeSession);
      if (working) return working.name;
      const anyOther = owned.find((s) => s.name !== excludeSession);
      return anyOther ? anyOther.name : null;
    } catch {
      return null;
    }
  }

  private async executeOutboundSend(
    phone: string,
    sessionName: string | undefined,
    sender: (client: AxiosInstance, targetSession: string, chatId: string) => Promise<any>
  ): Promise<{ success: boolean; messageId?: string; sessionUsed?: string; error?: string }> {
    const chatId = toWahaChatId(phone);
    if (!chatId) {
      return {
        success: false,
        error: 'Nomor atau ID WhatsApp tujuan tidak valid atau kosong.',
      };
    }

    let resolvedSession = sessionName?.trim() || undefined;
    try {
      const { client, session, ownerPrefix, mode } = await this.getClient();
      let targetSession = resolvedSession
        ? this.resolveOwnedSessionName(resolvedSession, ownerPrefix)
        : session;
      this.assertOwnedSession(targetSession, ownerPrefix);

      if (!resolvedSession && (targetSession === 'default' || !targetSession)) {
        const liveSession = await this.pickLiveWorkingSession(client, ownerPrefix);
        if (liveSession) {
          targetSession = liveSession;
        }
      }

      const sendWithSession = async (sess: string) => {
        const resData = await sender(client, sess, chatId);
        return {
          success: true,
          messageId: this.extractOutboundMessageId(resData),
          sessionUsed: sess,
        };
      };

      try {
        return await sendWithSession(targetSession);
      } catch (firstErr: any) {
        const httpStatus = firstErr?.response?.status;
        if (!resolvedSession && (httpStatus === 404 || httpStatus === 422 || mode === 'EXTERNAL')) {
          const fallbackWorking = await this.pickLiveWorkingSession(client, ownerPrefix, targetSession);
          if (fallbackWorking) {
            return await sendWithSession(fallbackWorking);
          }
        }

        let errMsg = this.extractWahaError(firstErr);
        if (httpStatus === 404 || httpStatus === 422) {
          const sInfo = await client
            .get(`/api/sessions/${encodeURIComponent(targetSession)}`, { timeout: 3000 })
            .catch(() => null);
          const sessStatus = sInfo?.data?.status;
          if (sessStatus && sessStatus !== 'WORKING') {
            errMsg = `Sesi WhatsApp "${targetSession}" berstatus ${sessStatus}. Jalankan atau scan QR sesi tersebut terlebih dahulu.`;
          }
        }
        console.error('[WahaService] Send failed:', firstErr?.response?.data || errMsg);
        return {
          success: false,
          sessionUsed: targetSession,
          error: errMsg,
        };
      }
    } catch (err: any) {
      const errMsg = this.extractWahaError(err);
      console.error('[WahaService] Send failed:', err?.response?.data || errMsg);
      return {
        success: false,
        sessionUsed: resolvedSession,
        error: errMsg,
      };
    }
  }

  /**
   * Send WhatsApp text message
   */
  public async sendTextMessage(
    phone: string,
    text: string,
    sessionName?: string
  ): Promise<{ success: boolean; messageId?: string; sessionUsed?: string; error?: string }> {
    return this.executeOutboundSend(phone, sessionName, async (client, targetSession, chatId) => {
      const response = await client.post('/api/sendText', {
        session: targetSession,
        chatId,
        text,
      });
      return response.data;
    });
  }

  /**
   * Send WhatsApp image, video, or document file via WAHA
   */
  public async sendMediaMessage(
    phone: string,
    file: { base64: string; mimetype: string; filename: string; caption?: string },
    sessionName?: string
  ): Promise<{ success: boolean; messageId?: string; sessionUsed?: string; error?: string }> {
    const cleanBase64 = file.base64.includes(',') ? file.base64.split(',')[1] : file.base64;
    const isImage = file.mimetype.startsWith('image/');
    const isVideo = file.mimetype.startsWith('video/');

    return this.executeOutboundSend(phone, sessionName, async (client, targetSession, chatId) => {
      const payload = {
        session: targetSession,
        chatId,
        file: {
          mimetype: file.mimetype,
          filename: file.filename,
          data: cleanBase64,
        },
        caption: file.caption || '',
      };

      if (isImage) {
        const res = await client.post('/api/sendImage', payload);
        return res.data;
      }
      if (isVideo) {
        try {
          const res = await client.post('/api/sendVideo', payload);
          return res.data;
        } catch (err: any) {
          const st = err?.response?.status;
          if (st !== 404 && st !== 405) throw err;
        }
      }
      const res = await client.post('/api/sendFile', payload);
      return res.data;
    });
  }
}

export const wahaService = WahaService.getInstance();
