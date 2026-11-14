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

  private constructor() {}

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
        apiKey: rawApiKey,
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
  private async getClient(): Promise<{ client: AxiosInstance; session: string }> {
    const conf = await this.getConfig();
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

    return { client, session: conf.session };
  }

  /**
   * Check connection and server status
   */
  public async getStatus(): Promise<{
    connected: boolean;
    sessionStatus?: string;
    details?: any;
    error?: string;
    webhookUrl?: string;
    config: WahaConfig;
  }> {
    const currentConfig = await this.getConfig(true);
    try {
      const { client, session } = await this.getClient();
      
      let sessionData: any = null;
      try {
        const res = await client.get(`/api/sessions/${session}`);
        sessionData = res.data;
      } catch (err: any) {
        if (err.response?.status === 404) {
          return {
            connected: true,
            sessionStatus: 'NOT_FOUND',
            webhookUrl: config.webhookUrl,
            config: currentConfig,
          };
        }
        const resAll = await client.get('/api/sessions');
        const list = Array.isArray(resAll.data) ? resAll.data : [];
        sessionData = list.find((s: any) => s.name === session);
      }

      const status = sessionData?.status || 'UNKNOWN';
      return {
        connected: true,
        sessionStatus: status,
        details: sessionData,
        webhookUrl: config.webhookUrl,
        config: currentConfig,
      };
    } catch (err: any) {
      return {
        connected: false,
        sessionStatus: 'OFFLINE',
        error: err.response?.data?.message || err.message,
        webhookUrl: config.webhookUrl,
        config: currentConfig,
      };
    }
  }

  /**
   * Create/update session with automatic webhook tracking and start it
   */
  public async startSession(sessionName?: string): Promise<any> {
    const { client, session } = await this.getClient();
    const targetSession = sessionName || session;
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
            .catch(() => {});
        }
        try {
          const startRes = await client.post(`/api/sessions/${encodeURIComponent(targetSession)}/start`);
          return startRes.data;
        } catch {
          const legacyRes = await client.post('/api/sessions/start', {
            name: targetSession,
            config: { webhooks: webhookConfigs },
          });
          return legacyRes.data;
        }
      }
      throw err;
    }
  }

  /**
   * Stop a session
   */
  public async stopSession(sessionName?: string): Promise<any> {
    const { client, session } = await this.getClient();
    const targetSession = sessionName || session;
    const response = await client.post('/api/sessions/stop', { name: targetSession });
    return response.data;
  }

  /**
   * Logout a session
   */
  public async logoutSession(sessionName?: string): Promise<any> {
    const { client, session } = await this.getClient();
    const targetSession = sessionName || session;
    const response = await client.post('/api/sessions/logout', { name: targetSession });
    return response.data;
  }

  /**
   * List all sessions on the configured WAHA server
   */
  public async listSessions(): Promise<{ sessions: WahaSessionInfo[]; activeSession: string }> {
    const { client, session } = await this.getClient();
    const res = await client.get('/api/sessions?all=true').catch(() => client.get('/api/sessions'));
    const rawList = Array.isArray(res.data) ? res.data : [];
    const sessions: WahaSessionInfo[] = rawList.map((item: any) => ({
      name: String(item.name || 'default'),
      status: String(item.status || 'UNKNOWN'),
      me: item.me || null,
    }));
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
    const result = await this.startSession(clean);
    if (setActive) {
      await this.setActiveSession(clean);
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
    const { client, session: currentActive } = await this.getClient();
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
      try {
        const remaining = await this.listSessions();
        const nextSession = remaining.sessions.find((s) => s.name !== clean)?.name || 'default';
        await this.setActiveSession(nextSession);
      } catch {
        await this.setActiveSession('default').catch(() => null);
      }
    }

    return result;
  }

  /**
   * Get QR Code for scanning
   */
  public async getQrCode(sessionName?: string): Promise<{ qr?: string; status: string }> {
    const { client, session } = await this.getClient();
    const targetSession = sessionName || session;

    try {
      let currentStatus = 'UNKNOWN';
      try {
        const sRes = await client.get(`/api/sessions/${encodeURIComponent(targetSession)}`);
        currentStatus = sRes.data?.status || 'UNKNOWN';
      } catch {}

      if (currentStatus === 'WORKING') {
        return { status: 'WORKING' };
      }

      try {
        const qrRes = await client.get(`/api/${encodeURIComponent(targetSession)}/auth/qr?format=raw`);
        if (qrRes.data && qrRes.data.value) {
          return { qr: qrRes.data.value, status: 'SCAN_QR_CODE' };
        }
      } catch {}

      const imgRes = await client.get(`/api/${encodeURIComponent(targetSession)}/auth/qr`, {
        responseType: 'arraybuffer',
      });
      const base64 = Buffer.from(imgRes.data, 'binary').toString('base64');
      return {
        qr: `data:image/png;base64,${base64}`,
        status: 'SCAN_QR_CODE',
      };
    } catch (err: any) {
      return {
        status: 'FAILED',
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
      const { client, session } = await this.getClient();
      const targetSession = sessionName || session;
      const chatId = toWahaChatId(phone);

      const response = await client.post('/api/sendText', {
        session: targetSession,
        chatId: chatId,
        text: text,
      });

      const wahaMsgId =
        response.data?.id?.id ||
        (typeof response.data?.id === 'string' ? response.data.id : null) ||
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
}

export const wahaService = WahaService.getInstance();
