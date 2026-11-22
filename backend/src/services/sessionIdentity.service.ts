import { getActiveCompanyId, getCompanySettingValue, upsertCompanySetting } from './tenantContext';
import { normalizePhoneNumber } from './phone.utils';

export interface SessionIdentityHistoryEntry {
  identity: string;
  action: 'INITIAL' | 'SWITCH' | 'RESTORE' | 'LOGOUT';
  timestamp: string;
  note?: string;
}

export interface SessionIdentityRecord {
  sessionName: string;
  initialIdentity: string;
  lastIdentity: string;
  currentIdentity: string | null;
  switchCount: number;
  history: SessionIdentityHistoryEntry[];
  updatedAt: string;
}

export interface SessionIdentityInfo {
  sessionName: string;
  currentIdentity: string | null;
  lastIdentity: string | null;
  initialIdentity: string | null;
  switchCount: number;
  maxLimit: number;
  remainingSwitches: number;
  isLimitReached: boolean;
  history: SessionIdentityHistoryEntry[];
}

export interface SessionIdentityEvaluationResult {
  allowed: boolean;
  sessionName: string;
  currentIdentity: string | null;
  lastIdentity: string;
  switchCount: number;
  maxLimit: number;
  isSwitch: boolean;
  isRestored: boolean;
  error?: string;
}

export class SessionIdentityService {
  private static SETTING_KEY = 'session_identity_history';
  private static memoryFallback = new Map<string, Record<string, SessionIdentityRecord>>();

  public static normalizeIdentity(raw?: string | null): string {
    if (!raw) return '';
    const clean = String(raw).trim();
    const withoutSuffix = clean.replace(/@.*$/, '');
    const normalized = normalizePhoneNumber(withoutSuffix);
    if (normalized) return normalized;
    return withoutSuffix.replace(/[^\d]/g, '');
  }

  private static async getMap(companyId?: string): Promise<Record<string, SessionIdentityRecord>> {
    const cid = getActiveCompanyId(companyId);
    if (process.env.NODE_ENV === 'test') {
      return this.memoryFallback.get(cid) || {};
    }
    try {
      const raw = await getCompanySettingValue(this.SETTING_KEY, cid);
      if (!raw) return this.memoryFallback.get(cid) || {};
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return this.memoryFallback.get(cid) || {};
    }
  }

  private static async saveMap(map: Record<string, SessionIdentityRecord>, companyId?: string): Promise<void> {
    const cid = getActiveCompanyId(companyId);
    this.memoryFallback.set(cid, map);
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    try {
      await upsertCompanySetting(this.SETTING_KEY, JSON.stringify(map), cid);
    } catch {
      // Ignored in offline / test fallback
    }
  }

  public static async getIdentityRecord(
    companyId: string,
    sessionName: string
  ): Promise<SessionIdentityRecord | null> {
    const map = await this.getMap(companyId);
    return map[sessionName.toLowerCase()] || null;
  }

  public static async getIdentityInfo(
    companyId: string,
    sessionName: string,
    maxLimit: number
  ): Promise<SessionIdentityInfo> {
    const record = await this.getIdentityRecord(companyId, sessionName);
    const switchCount = record?.switchCount ?? 0;
    const remaining = maxLimit > 0 ? Math.max(0, maxLimit - switchCount) : 999;
    const isLimitReached = maxLimit > 0 && switchCount >= maxLimit;

    return {
      sessionName,
      currentIdentity: record?.currentIdentity || null,
      lastIdentity: record?.lastIdentity || null,
      initialIdentity: record?.initialIdentity || null,
      switchCount,
      maxLimit,
      remainingSwitches: remaining,
      isLimitReached,
      history: record?.history || [],
    };
  }

  public static async evaluateSessionIdentity(
    companyId: string,
    sessionName: string,
    rawIdentity: string,
    maxLimit: number
  ): Promise<SessionIdentityEvaluationResult> {
    const norm = this.normalizeIdentity(rawIdentity);
    const sessionKey = (sessionName || 'default').toLowerCase();
    const now = new Date().toISOString();

    if (!norm) {
      return {
        allowed: true,
        sessionName,
        currentIdentity: null,
        lastIdentity: '',
        switchCount: 0,
        maxLimit,
        isSwitch: false,
        isRestored: false,
      };
    }

    const map = await this.getMap(companyId);
    const existing = map[sessionKey];

    // Kasus 1: Pendaftaran identitas pertama untuk sesi ini
    if (!existing) {
      const newRecord: SessionIdentityRecord = {
        sessionName,
        initialIdentity: norm,
        lastIdentity: norm,
        currentIdentity: norm,
        switchCount: 0,
        history: [
          {
            identity: norm,
            action: 'INITIAL',
            timestamp: now,
            note: 'Pendaftaran identitas awal sesi WhatsApp',
          },
        ],
        updatedAt: now,
      };
      map[sessionKey] = newRecord;
      await this.saveMap(map, companyId);

      return {
        allowed: true,
        sessionName,
        currentIdentity: norm,
        lastIdentity: norm,
        switchCount: 0,
        maxLimit,
        isSwitch: false,
        isRestored: false,
      };
    }

    // Kasus 2: Identitas sama dengan yang sedang aktif saat ini
    if (existing.currentIdentity === norm) {
      return {
        allowed: true,
        sessionName,
        currentIdentity: norm,
        lastIdentity: existing.lastIdentity,
        switchCount: existing.switchCount,
        maxLimit,
        isSwitch: false,
        isRestored: false,
      };
    }

    // Kasus 3: Dikembalikan / login kembali ke identitas terakhir yang diizinkan
    if (existing.lastIdentity === norm) {
      existing.currentIdentity = norm;
      existing.updatedAt = now;
      existing.history.push({
        identity: norm,
        action: 'RESTORE',
        timestamp: now,
        note: `Terhubung kembali ke identitas terakhir (+${norm})`,
      });
      map[sessionKey] = existing;
      await this.saveMap(map, companyId);

      return {
        allowed: true,
        sessionName,
        currentIdentity: norm,
        lastIdentity: norm,
        switchCount: existing.switchCount,
        maxLimit,
        isSwitch: false,
        isRestored: true,
      };
    }

    // Kasus 4: Mencoba beralih ke identitas baru yang berbeda
    const isExceeded = maxLimit > 0 && existing.switchCount >= maxLimit;
    if (isExceeded) {
      return {
        allowed: false,
        sessionName,
        currentIdentity: existing.currentIdentity,
        lastIdentity: existing.lastIdentity,
        switchCount: existing.switchCount,
        maxLimit,
        isSwitch: true,
        isRestored: false,
        error: `Batas maksimal penggantian identitas sesi (${maxLimit}x) telah tercapai. Tidak dapat berganti ke nomor baru (+${norm}). Sesi hanya dapat diaktifkan kembali jika menggunakan identitas terakhir (+${existing.lastIdentity}).`,
      };
    }

    // Kuota masih ada, izinkan penggantian identitas
    existing.switchCount += 1;
    existing.lastIdentity = norm;
    existing.currentIdentity = norm;
    existing.updatedAt = now;
    existing.history.push({
      identity: norm,
      action: 'SWITCH',
      timestamp: now,
      note: `Penggantian identitas ke-${existing.switchCount} (+${norm})`,
    });
    map[sessionKey] = existing;
    await this.saveMap(map, companyId);

    return {
      allowed: true,
      sessionName,
      currentIdentity: norm,
      lastIdentity: norm,
      switchCount: existing.switchCount,
      maxLimit,
      isSwitch: true,
      isRestored: false,
    };
  }

  public static async recordSessionLogout(companyId: string, sessionName: string): Promise<void> {
    const sessionKey = (sessionName || 'default').toLowerCase();
    const map = await this.getMap(companyId);
    const existing = map[sessionKey];
    if (existing && existing.currentIdentity) {
      const now = new Date().toISOString();
      existing.history.push({
        identity: existing.currentIdentity,
        action: 'LOGOUT',
        timestamp: now,
        note: `Sesi logout dari perangkat (+${existing.currentIdentity})`,
      });
      existing.currentIdentity = null;
      existing.updatedAt = now;
      map[sessionKey] = existing;
      await this.saveMap(map, companyId);
    }
  }

  public static async simulateSwitchIdentity(
    companyId: string,
    sessionName: string,
    newPhone: string,
    maxLimit: number
  ): Promise<SessionIdentityEvaluationResult> {
    const cleanPhone = this.normalizeIdentity(newPhone);
    if (!cleanPhone) {
      throw new Error('Nomor WhatsApp baru wajib diisi untuk simulasi pergantian identitas sesi');
    }

    // Catat logout dari nomor sebelumnya terlebih dahulu
    await this.recordSessionLogout(companyId, sessionName);

    // Evaluasi koneksi dengan identitas baru
    return this.evaluateSessionIdentity(companyId, sessionName, cleanPhone, maxLimit);
  }

  public static async simulateRestoreLastIdentity(
    companyId: string,
    sessionName: string
  ): Promise<SessionIdentityEvaluationResult> {
    const sessionKey = (sessionName || 'default').toLowerCase();
    const map = await this.getMap(companyId);
    const existing = map[sessionKey];

    if (!existing || !existing.lastIdentity) {
      throw new Error(`Sesi "${sessionName}" belum memiliki riwayat identitas terakhir untuk dipulihkan`);
    }

    const now = new Date().toISOString();
    existing.currentIdentity = existing.lastIdentity;
    existing.updatedAt = now;
    existing.history.push({
      identity: existing.lastIdentity,
      action: 'RESTORE',
      timestamp: now,
      note: `Simulasi pemulihan kembali ke identitas terakhir (+${existing.lastIdentity})`,
    });
    map[sessionKey] = existing;
    await this.saveMap(map, companyId);

    return {
      allowed: true,
      sessionName,
      currentIdentity: existing.lastIdentity,
      lastIdentity: existing.lastIdentity,
      switchCount: existing.switchCount,
      maxLimit: 0,
      isSwitch: false,
      isRestored: true,
    };
  }

  public static async resetIdentityHistory(companyId: string, sessionName: string): Promise<void> {
    const sessionKey = (sessionName || 'default').toLowerCase();
    const map = await this.getMap(companyId);
    delete map[sessionKey];
    await this.saveMap(map, companyId);
  }
}
