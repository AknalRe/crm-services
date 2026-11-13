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

  /**
   * Get active WAHA configuration (database overrides .env)
   */
  public async getConfig(): Promise<WahaConfig> {
    try {
      const settings = await db.select().from(systemSettings);
      const urlSetting = settings.find((s) => s.key === 'waha_base_url');
      const keySetting = settings.find((s) => s.key === 'waha_api_key');
      const sessionSetting = settings.find((s) => s.key === 'waha_session');

      return {
        baseUrl: urlSetting?.value || config.waha.baseUrl,
        apiKey: keySetting?.value || config.waha.apiKey,
        session: sessionSetting?.value || config.waha.session,
      };
    } catch {
      return {
        baseUrl: config.waha.baseUrl,
        apiKey: config.waha.apiKey,
        session: config.waha.session,
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
    config: WahaConfig;
  }> {
    const currentConfig = await this.getConfig();
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
        config: currentConfig,
      };
    } catch (err: any) {
      return {
        connected: false,
        sessionStatus: 'OFFLINE',
        error: err.response?.data?.message || err.message,
        config: currentConfig,
      };
    }
  }

  /**
   * Start a session
   */
  public async startSession(sessionName?: string): Promise<any> {
    const { client, session } = await this.getClient();
    const targetSession = sessionName || session;
    const response = await client.post('/api/sessions/start', {
      name: targetSession,
      config: {
        webhooks: [
          {
            url: config.webhookUrl,
            events: ['message', 'message.ack', 'session.status'],
          },
        ],
      },
    });
    return response.data;
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
   * Get QR Code for scanning
   */
  public async getQrCode(sessionName?: string): Promise<{ qr?: string; status: string }> {
    const { client, session } = await this.getClient();
    const targetSession = sessionName || session;

    try {
      const statusRes = await this.getStatus();
      const currentStatus = statusRes.sessionStatus;

      if (currentStatus === 'WORKING') {
        return { status: 'WORKING' };
      }

      try {
        const qrRes = await client.get(`/api/${targetSession}/auth/qr?format=raw`);
        if (qrRes.data && qrRes.data.value) {
          return { qr: qrRes.data.value, status: 'SCAN_QR_CODE' };
        }
      } catch {}

      const imgRes = await client.get(`/api/${targetSession}/auth/qr`, {
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
