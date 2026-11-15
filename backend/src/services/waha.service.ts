import axios, { AxiosInstance } from 'axios';
import { eq } from 'drizzle-orm';
import { config } from '../config';
import { db } from '../db';
import { systemSettings } from '../db/schema';
import { toWahaChatId } from './phone.utils';

export interface WahaConfig {
  baseUrl: string;
  apiKey?: string;
  session: string;
  mode?: 'INTERNAL' | 'EXTERNAL';
  internalLocked?: boolean;
  hasApiKey?: boolean;
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

  private constructor() { }

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

      const mode: 'INTERNAL' | 'EXTERNAL' =
        modeSetting?.value === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL';

      if (mode === 'INTERNAL') {
        const baseUrl = internalEnv
          ? config.waha.baseUrl
          : urlSetting?.value || config.waha.baseUrl;
        const rawApiKey = internalEnv
          ? config.waha.apiKey
          : keySetting?.value || config.waha.apiKey;
        const session = sessionSetting?.value || config.waha.session || 'default';
        return {
          baseUrl,
          apiKey: maskSecret ? (rawApiKey ? '••••••••' : '') : rawApiKey,
          session,
          mode: 'INTERNAL',
          internalLocked: true,
          hasApiKey: Boolean(rawApiKey && rawApiKey.trim() !== ''),
        };
      }

      const rawApiKey = keySetting?.value || '';
      return {
        baseUrl: urlSetting?.value || '',
        apiKey: maskSecret ? (rawApiKey ? '••••••••' : '') : rawApiKey,
        session: sessionSetting?.value || config.waha.session || 'default',
        mode: 'EXTERNAL',
        internalLocked: false,
        hasApiKey: Boolean(rawApiKey && rawApiKey.trim() !== ''),
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
  private async getClient(): Promise<{ client: AxiosInstance; session: string; ownerPrefix: string | null }> {
    const conf = await this.getConfig();
    const ownerPrefix = this.getOwnerPrefix(conf.mode);
    const activeSession =
      ownerPrefix && !this.isOwnedSession(conf.session, ownerPrefix) ? ownerPrefix : conf.session;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (conf.apiKey && conf.apiKey.trim() !== '') {
      headers['X-Api-Key'] = conf.apiKey;
      headers['Authorization'] = `Bearer ${conf.apiKey}`;
    }

    const client = axios.create({
      baseURL: conf.baseUrl.replace(/\/+$/, ''),
      headers,
      timeout: 30000,
    });

    return { client, session: activeSession, ownerPrefix };
  }

  /**
   * Check connection and server status
   */
  public async getStatus(): Promise<{
    connected: boolean;
    sessionStatus?: string;
    activeSession?: string;
    connectedSessions?: number;
    totalSessions?: number;
    sessions?: Array<{ name: string; status: string }>;
    details?: any;
    error?: string;
    webhookUrl?: string;
    config: WahaConfig;
  }> {
    const currentConfig = await this.getConfig(true);
    try {
      const { client, session, ownerPrefix } = await this.getClient();
      currentConfig.session = session;

      const resAll = await client
        .get('/api/sessions?all=true')
        .catch(() => client.get('/api/sessions'))
        .catch(() => null);
      const rawList = Array.isArray(resAll?.data) ? resAll.data : [];
      const ownedList: Array<{ name: string; status: string; raw: any }> = rawList
        .map((item: any) => ({
          name: String(item.name || 'default'),
          status: String(item.status || 'UNKNOWN'),
          raw: item,
        }))
        .filter((item) => this.isOwnedSession(item.name, ownerPrefix));

      let sessionData: any = ownedList.find((s) => s.name === session)?.raw || null;
      if (!sessionData) {
        try {
          const res = await client.get(`/api/sessions/${encodeURIComponent(session)}`);
          sessionData = res.data;
        } catch (err: any) {
          if (err.response?.status === 404 && ownedList.length === 0) {
            return {
              connected: true,
              sessionStatus: 'NOT_FOUND',
              activeSession: session,
              connectedSessions: 0,
              totalSessions: 1,
              sessions: [{ name: session, status: 'STOPPED' }],
              webhookUrl: config.webhookUrl,
              config: currentConfig,
            };
          }
        }
      }

      const status = sessionData?.status || 'NOT_FOUND';
      const sessionSummaries =
        ownedList.length > 0
          ? ownedList.map((s) => ({ name: s.name, status: s.status }))
          : [{ name: session, status: status === 'NOT_FOUND' ? 'STOPPED' : status }];
      const connectedSessions = sessionSummaries.filter((s) => s.status === 'WORKING').length;

      // Ensure active/QR sessions have CRM's current webhook URL + message.ack subscribed
      for (const item of ownedList) {
        if (item.status === 'WORKING' || item.status === 'SCAN_QR_CODE') {
          void this.ensureSessionWebhook(client, item.name, item.raw);
        }
      }

      return {
        connected: true,
        sessionStatus: status,
        activeSession: session,
        connectedSessions,
        totalSessions: sessionSummaries.length,
        sessions: sessionSummaries,
        details: sessionData,
        webhookUrl: config.webhookUrl,
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
        error: err.response?.data?.message || err.message,
        webhookUrl: config.webhookUrl,
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
    existingSessionData?: any
  ): Promise<void> {
    const targetUrl = (config.webhookUrl || '').trim();
    if (!targetUrl) return;

    const requiredEvents = ['message', 'message.ack', 'session.status'];
    let sessionData = existingSessionData;
    if (!sessionData) {
      try {
        const res = await client.get(`/api/sessions/${encodeURIComponent(sessionName)}`);
        sessionData = res.data;
      } catch {
        return;
      }
    }

    const existingConfig = sessionData?.config && typeof sessionData.config === 'object' ? sessionData.config : {};
    const existingWebhooks: any[] = Array.isArray(existingConfig.webhooks) ? existingConfig.webhooks : [];
    const hasValidWebhook = existingWebhooks.some((wh) => {
      if (!wh || wh.url !== targetUrl) return false;
      const evs: string[] = Array.isArray(wh.events) ? wh.events : [];
      return evs.includes('*') || requiredEvents.every((ev) => evs.includes(ev));
    });

    if (hasValidWebhook) return;

    const lastAttempt = this.webhookSyncAt.get(sessionName) || 0;
    if (Date.now() - lastAttempt < 30_000) return;
    this.webhookSyncAt.set(sessionName, Date.now());

    const preservedWebhooks = existingWebhooks.filter(
      (wh) => wh && typeof wh.url === 'string' && !wh.url.endsWith('/api/waha/webhook')
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
    } catch (err: any) {
      console.warn(
        `[WahaService] Failed to sync webhook for session "${sessionName}":`,
        err?.response?.data || err?.message
      );
    }
  }

  /**
   * Create/update session with automatic webhook tracking and start it
   */
  public async startSession(sessionName?: string): Promise<any> {
    const { client, session, ownerPrefix } = await this.getClient();
    const targetSession = sessionName
      ? this.resolveOwnedSessionName(sessionName, ownerPrefix)
      : session;
    this.assertOwnedSession(targetSession, ownerPrefix);
    const webhookConfigs = [
      {
        url: config.webhookUrl,
        events: ['message', 'message.ack', 'session.status'],
      },
    ];

    try {
      const createRes = await client.post('/api/sessions', {
        name: targetSession,
        start: true,
        config: { webhooks: webhookConfigs },
      });
      return createRes.data;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 409 || status === 422 || status === 404 || status === 405) {
        if (status === 409 || status === 422) {
          await client
            .put(`/api/sessions/${encodeURIComponent(targetSession)}`, {
              config: { webhooks: webhookConfigs },
            })
            .catch(() => { });
        }
        try {
          const startRes = await client.post(`/api/sessions/${encodeURIComponent(targetSession)}/start`);
          return startRes.data;
        } catch {
          try {
            const restartRes = await client.post(`/api/sessions/${encodeURIComponent(targetSession)}/restart`);
            return restartRes.data;
          } catch {
            await client.post('/api/sessions/stop', { name: targetSession }).catch(() => { });
            const legacyRes = await client.post('/api/sessions/start', {
              name: targetSession,
              config: { webhooks: webhookConfigs },
            });
            return legacyRes.data;
          }
        }
      }
      throw err;
    }
  }

  /**
   * Stop a session
   */
  public async stopSession(sessionName?: string): Promise<any> {
    const { client, session, ownerPrefix } = await this.getClient();
    const targetSession = sessionName ? sessionName.trim() : session;
    this.assertOwnedSession(targetSession, ownerPrefix);
    const response = await client.post('/api/sessions/stop', { name: targetSession });
    return response.data;
  }

  /**
   * Logout a session
   */
  public async logoutSession(sessionName?: string): Promise<any> {
    const { client, session, ownerPrefix } = await this.getClient();
    const targetSession = sessionName ? sessionName.trim() : session;
    this.assertOwnedSession(targetSession, ownerPrefix);
    const response = await client.post('/api/sessions/logout', { name: targetSession });
    return response.data;
  }

  /**
   * List sessions belonging to this CRM instance (scoped in shared internal WAHA mode)
   */
  public async listSessions(): Promise<{ sessions: WahaSessionInfo[]; activeSession: string }> {
    const { client, session, ownerPrefix } = await this.getClient();
    const res = await client.get('/api/sessions?all=true').catch(() => client.get('/api/sessions'));
    const rawList = Array.isArray(res.data) ? res.data : [];
    const sessions: WahaSessionInfo[] = rawList
      .map((item: any) => ({
        name: String(item.name || 'default'),
        status: String(item.status || 'UNKNOWN'),
        me: item.me || null,
      }))
      .filter((item) => this.isOwnedSession(item.name, ownerPrefix));
    if (sessions.length === 0 && session) {
      sessions.push({
        name: session,
        status: 'STOPPED',
        me: null,
      });
    }
    return { sessions, activeSession: session };
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
    this.assertOwnedSession(clean, ownerPrefix);
    let result: any;
    try {
      const res = await client.delete(`/api/sessions/${encodeURIComponent(clean)}`);
      result = res.data;
    } catch {
      await client.post('/api/sessions/stop', { name: clean }).catch(() => null);
      const res = await client.post('/api/sessions/logout', { name: clean }).catch(() => ({ data: { ok: true } }));
      result = res.data;
    }

    if (currentActive === clean) {
      const fallback = ownerPrefix || 'default';
      try {
        const remaining = await this.listSessions();
        const nextSession = remaining.sessions.find((s) => s.name !== clean)?.name || fallback;
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
  public async getQrCode(sessionName?: string): Promise<{ qr?: string; status: string }> {
    const { client, session, ownerPrefix } = await this.getClient();
    const targetSession = sessionName
      ? this.resolveOwnedSessionName(sessionName, ownerPrefix)
      : session;
    this.assertOwnedSession(targetSession, ownerPrefix);

    let currentStatus = 'UNKNOWN';
    try {
      try {
        const sRes = await client.get(`/api/sessions/${encodeURIComponent(targetSession)}`);
        currentStatus = sRes.data?.status || 'UNKNOWN';
      } catch (err: any) {
        if (err?.response?.status === 404) {
          currentStatus = 'NOT_FOUND';
        }
      }

      if (currentStatus === 'WORKING') {
        return { status: 'WORKING' };
      }

      if (currentStatus === 'STOPPED' || currentStatus === 'NOT_FOUND' || currentStatus === 'UNKNOWN') {
        await this.startSession(targetSession).catch(() => { });
        try {
          const sRes = await client.get(`/api/sessions/${encodeURIComponent(targetSession)}`);
          currentStatus = sRes.data?.status || 'STARTING';
        } catch {
          currentStatus = 'STARTING';
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
        return { status: currentStatus !== 'UNKNOWN' ? currentStatus : 'STARTING', qr: undefined };
      }
      const mime = contentType.split(';')[0].trim() || 'image/png';
      const base64 = Buffer.from(imgRes.data, 'binary').toString('base64');
      return {
        qr: `data:${mime};base64,${base64}`,
        status: 'SCAN_QR_CODE',
      };
    } catch {
      return {
        status: currentStatus !== 'UNKNOWN' ? currentStatus : 'FAILED',
        qr: undefined,
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
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const { client, session, ownerPrefix } = await this.getClient();
      const targetSession = sessionName
        ? this.resolveOwnedSessionName(sessionName, ownerPrefix)
        : session;
      this.assertOwnedSession(targetSession, ownerPrefix);
      const chatId = toWahaChatId(phone);

      const response = await client.post('/api/sendText', {
        session: targetSession,
        chatId: chatId,
        text: text,
      });

      const wahaMsgId =
        response.data?.id?._serialized ||
        (typeof response.data?.id === 'string' ? response.data.id : null) ||
        response.data?.id?.id ||
        response.data?.key?.id ||
        response.data?.messageId ||
        `WAHA_${Date.now()}`;

      return {
        success: true,
        messageId: wahaMsgId,
      };
    } catch (err: any) {
      console.error('[WahaService] Send message failed:', err.response?.data || err.message);
      return {
        success: false,
        error: err.response?.data?.message || err.message,
      };
    }
  }

  /**
   * Send WhatsApp image or document file via WAHA
   */
  public async sendMediaMessage(
    phone: string,
    file: { base64: string; mimetype: string; filename: string; caption?: string },
    sessionName?: string
  ): Promise<{ success: boolean; messageId?: string; sessionUsed?: string; error?: string }> {
    try {
      const { client, session, ownerPrefix } = await this.getClient();
      const targetSession = sessionName
        ? this.resolveOwnedSessionName(sessionName, ownerPrefix)
        : session;
      this.assertOwnedSession(targetSession, ownerPrefix);
      const chatId = toWahaChatId(phone);
      const isImage = file.mimetype.startsWith('image/');
      const endpoint = isImage ? '/api/sendImage' : '/api/sendFile';
      const cleanBase64 = file.base64.includes(',') ? file.base64.split(',')[1] : file.base64;

      const response = await client.post(endpoint, {
        session: targetSession,
        chatId,
        file: {
          mimetype: file.mimetype,
          filename: file.filename,
          data: cleanBase64,
        },
        caption: file.caption || '',
      });

      const wahaMsgId =
        response.data?.id?._serialized ||
        (typeof response.data?.id === 'string' ? response.data.id : null) ||
        response.data?.id?.id ||
        response.data?.key?.id ||
        response.data?.messageId ||
        `WAHA_${Date.now()}`;

      return {
        success: true,
        messageId: wahaMsgId,
        sessionUsed: targetSession,
      };
    } catch (err: any) {
      console.error('[WahaService] Send media failed:', err.response?.data || err.message);
      return {
        success: false,
        error: err.response?.data?.message || err.message,
      };
    }
  }
}

export const wahaService = WahaService.getInstance();
