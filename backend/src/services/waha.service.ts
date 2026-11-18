import crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';
import { and, eq } from 'drizzle-orm';
import { config } from '../config';
import { db } from '../db';
import { companySettings, DEFAULT_COMPANY_ID } from '../db/schema';
import { licenseService } from './license.service';
import {
  getActiveCompanyId,
  getCompanySettingMap,
  listActiveCompanyIds,
  upsertCompanySetting,
} from './tenantContext';
import { fromWahaChatId, isPhoneWahaJid, normalizePhoneNumber, toWahaChatId } from './phone.utils';

export interface WahaSessionPrivacyRule {
  autoReadOnOpen: boolean;
  sendOnlinePresence: boolean;
  readReceipts: boolean;
}

export interface WahaPrivacyConfig {
  general: WahaSessionPrivacyRule;
  sessions: Record<string, Partial<WahaSessionPrivacyRule>>;
}

export const DEFAULT_WAHA_PRIVACY_RULE: WahaSessionPrivacyRule = {
  autoReadOnOpen: true,
  sendOnlinePresence: true,
  readReceipts: true,
};

export const DEFAULT_WAHA_PRIVACY_CONFIG: WahaPrivacyConfig = {
  general: { ...DEFAULT_WAHA_PRIVACY_RULE },
  sessions: {},
};

export function sanitizeWahaPrivacyRule(raw: any, fallback: WahaSessionPrivacyRule = DEFAULT_WAHA_PRIVACY_RULE): WahaSessionPrivacyRule {
  return {
    autoReadOnOpen: typeof raw?.autoReadOnOpen === 'boolean' ? raw.autoReadOnOpen : fallback.autoReadOnOpen,
    sendOnlinePresence: typeof raw?.sendOnlinePresence === 'boolean' ? raw.sendOnlinePresence : fallback.sendOnlinePresence,
    readReceipts: typeof raw?.readReceipts === 'boolean' ? raw.readReceipts : fallback.readReceipts,
  };
}

export function parseWahaPrivacyConfig(raw: unknown): WahaPrivacyConfig {
  let obj: any = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      obj = null;
    }
  }
  if (!obj || typeof obj !== 'object') {
    return {
      general: { ...DEFAULT_WAHA_PRIVACY_RULE },
      sessions: {},
    };
  }
  const general = sanitizeWahaPrivacyRule(obj.general, DEFAULT_WAHA_PRIVACY_RULE);
  const sessions: Record<string, Partial<WahaSessionPrivacyRule>> = {};
  if (obj.sessions && typeof obj.sessions === 'object') {
    for (const [k, v] of Object.entries(obj.sessions)) {
      const cleanName = String(k || '').trim();
      if (!cleanName || !v || typeof v !== 'object') continue;
      const entry: Partial<WahaSessionPrivacyRule> = {};
      if (typeof (v as any).autoReadOnOpen === 'boolean') {
        entry.autoReadOnOpen = (v as any).autoReadOnOpen;
      }
      if (typeof (v as any).sendOnlinePresence === 'boolean') {
        entry.sendOnlinePresence = (v as any).sendOnlinePresence;
      }
      if (typeof (v as any).readReceipts === 'boolean') {
        entry.readReceipts = (v as any).readReceipts;
      }
      if (Object.keys(entry).length > 0) {
        sessions[cleanName] = entry;
      }
    }
  }
  return { general, sessions };
}

export function resolveSessionPrivacyRule(
  privacyConfig: WahaPrivacyConfig,
  sessionName?: string | null
): WahaSessionPrivacyRule {
  const cleanSession = String(sessionName || '').trim();
  const specific = cleanSession ? privacyConfig.sessions?.[cleanSession] : undefined;
  return {
    autoReadOnOpen:
      typeof specific?.autoReadOnOpen === 'boolean'
        ? specific.autoReadOnOpen
        : privacyConfig.general.autoReadOnOpen,
    sendOnlinePresence:
      typeof specific?.sendOnlinePresence === 'boolean'
        ? specific.sendOnlinePresence
        : privacyConfig.general.sendOnlinePresence,
    readReceipts:
      typeof specific?.readReceipts === 'boolean'
        ? specific.readReceipts
        : privacyConfig.general.readReceipts,
  };
}

export function resolveWahaMediaTargetUrl(
  rawUrl?: string | null,
  wahaBaseUrl?: string | null
): URL | null {
  const cleaned = String(rawUrl || '').trim();
  const base = String(wahaBaseUrl || '').trim();
  if (!cleaned || !base) return null;

  let wahaOrigin = '';
  try {
    wahaOrigin = new URL(base).origin;
  } catch {
    return null;
  }

  if (cleaned.startsWith('/api/files/') || cleaned.startsWith('/files/')) {
    return new URL(cleaned, wahaOrigin);
  }
  if (!/^https?:\/\//i.test(cleaned)) {
    return null;
  }

  try {
    const parsed = new URL(cleaned);
    if (parsed.origin === wahaOrigin) {
      return parsed;
    }
    if (parsed.pathname.startsWith('/api/files/') || parsed.pathname.startsWith('/files/')) {
      return new URL(`${parsed.pathname}${parsed.search}`, wahaOrigin);
    }
    return null;
  } catch {
    return null;
  }
}

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

export interface WahaStatusReceipt {
  viewerJid: string;
  phone: string | null;
  ackStatus: number;
  viewedAt?: string | null;
}

export function extractStatusReceiptsFromWahaMessage(msgData: any): WahaStatusReceipt[] {
  if (!msgData || typeof msgData !== 'object') return [];
  const receiptsRaw: any[] = [];

  if (Array.isArray(msgData.receipts)) receiptsRaw.push(...msgData.receipts);
  if (Array.isArray(msgData._data?.receipts)) receiptsRaw.push(...msgData._data.receipts);
  if (Array.isArray(msgData._data?.userReceipt)) receiptsRaw.push(...msgData._data.userReceipt);
  if (Array.isArray(msgData._data?.Info?.ReadBy)) {
    for (const jid of msgData._data.Info.ReadBy) {
      receiptsRaw.push({ userJid: jid, ack: 3 });
    }
  }
  if (Array.isArray(msgData._data?.ReadBy)) {
    for (const jid of msgData._data.ReadBy) {
      receiptsRaw.push({ userJid: jid, ack: 3 });
    }
  }

  const byViewer = new Map<string, WahaStatusReceipt>();
  for (const item of receiptsRaw) {
    if (!item) continue;
    const rawJid =
      typeof item === 'string'
        ? item.trim()
        : String(
            item.userJid ||
              item.jid ||
              item.participant ||
              item.user ||
              item.id ||
              item.from ||
              ''
          ).trim();
    if (!rawJid || rawJid === 'status@broadcast' || rawJid.endsWith('@g.us')) continue;

    let ackStatus = 0;
    if (typeof item.ack === 'number' && !Number.isNaN(item.ack)) {
      ackStatus = item.ack;
    } else if (item.playedTimestamp) {
      ackStatus = 4;
    } else if (item.readTimestamp || item.receiptTimestamp || item.ackName === 'READ') {
      ackStatus = 3;
    } else if (item.deliveryTimestamp || item.ackName === 'DEVICE') {
      ackStatus = 2;
    } else if (typeof item === 'string') {
      ackStatus = 3;
    }

    const rawTs = item.playedTimestamp || item.readTimestamp || item.receiptTimestamp || item.timestamp;
    let viewedAt: string | null = null;
    if (typeof rawTs === 'number' && rawTs > 0) {
      viewedAt = new Date(rawTs > 10_000_000_000 ? rawTs : rawTs * 1000).toISOString();
    } else if (typeof rawTs === 'string' && rawTs.trim()) {
      const parsed = new Date(rawTs);
      if (!Number.isNaN(parsed.getTime())) viewedAt = parsed.toISOString();
    }

    const phone = isPhoneWahaJid(rawJid) ? normalizePhoneNumber(fromWahaChatId(rawJid)) : null;
    const prev = byViewer.get(rawJid);
    if (!prev || ackStatus > prev.ackStatus) {
      byViewer.set(rawJid, {
        viewerJid: rawJid,
        phone: phone || null,
        ackStatus,
        viewedAt: viewedAt || prev?.viewedAt || null,
      });
    }
  }
  return Array.from(byViewer.values());
}

export interface WahaContactRecord {
  jid: string;
  lid?: string | null;
  phone: string | null;
  name: string | null;
  pushName: string | null;
  isMyContact: boolean;
  isGroup: boolean;
  isMe: boolean;
}

export interface WahaGroupParticipant {
  jid: string;
  phone: string | null;
  name: string | null;
  role: 'superadmin' | 'admin' | 'member';
}

export interface WahaGroupInfo {
  groupJid: string;
  subject: string | null;
  description?: string | null;
  participants: WahaGroupParticipant[];
}

function extractValidNormalizedPhone(rawCandidate: unknown): string | null {
  if (typeof rawCandidate !== 'string' && typeof rawCandidate !== 'number') return null;
  const raw = String(rawCandidate).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.endsWith('@g.us') || lower.endsWith('@broadcast') || lower.endsWith('@newsletter') || lower.endsWith('@lid')) {
    return null;
  }
  const withoutDomain = raw.includes('@') ? fromWahaChatId(raw) : raw;
  const normalized = normalizePhoneNumber(withoutDomain);
  const digits = normalized.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return normalized;
}

export function normalizeWahaContactEntries(
  rawList: any[],
  lidPhoneMap?: Map<string, string>
): WahaContactRecord[] {
  if (!Array.isArray(rawList)) return [];
  const byKey = new Map<string, WahaContactRecord>();

  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const rawJid = String(
      item?.id?._serialized || item?.id?.id || item?.id || item?.jid || item?.JID || item?.chatId || ''
    ).trim();
    const lowerJid = rawJid.toLowerCase();
    if (!rawJid || lowerJid === 'status@broadcast' || lowerJid.endsWith('@broadcast') || lowerJid.endsWith('@newsletter')) {
      continue;
    }
    const isGroup = Boolean(item.isGroup || lowerJid.endsWith('@g.us'));
    if (isGroup) continue;
    const isMe = Boolean(item.isMe);
    if (isMe) continue;

    const lid = lowerJid.endsWith('@lid')
      ? rawJid
      : typeof item.lid === 'string' && item.lid.toLowerCase().endsWith('@lid')
      ? item.lid.trim()
      : null;

    const phoneCandidates = [
      item.number,
      item.phoneNumber,
      item.PhoneNumber,
      item.pn,
      item.PN,
      item.phone,
      isPhoneWahaJid(rawJid) ? rawJid : null,
      lid ? lidPhoneMap?.get(lid) || null : null,
    ];
    let phone: string | null = null;
    for (const c of phoneCandidates) {
      const parsed = extractValidNormalizedPhone(c);
      if (parsed) {
        phone = parsed;
        break;
      }
    }

    const nameRaw =
      item.name ||
      item.FullName ||
      item.fullName ||
      item.verifiedName ||
      item.shortName ||
      item.FirstName ||
      item.BusinessName ||
      null;
    const pushRaw = item.pushname || item.pushName || item.PushName || item.notify || null;
    const name = typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw.trim() : null;
    const pushName = typeof pushRaw === 'string' && pushRaw.trim() ? pushRaw.trim() : null;
    const isMyContact = Boolean(item.isMyContact);

    if (!phone && !lid) continue;
    const dedupKey = phone ? `p:${phone}` : `l:${lid}`;
    const prev = byKey.get(dedupKey);
    if (!prev) {
      byKey.set(dedupKey, {
        jid: rawJid,
        lid,
        phone,
        name,
        pushName,
        isMyContact,
        isGroup: false,
        isMe: false,
      });
    } else {
      byKey.set(dedupKey, {
        ...prev,
        lid: prev.lid || lid,
        phone: prev.phone || phone,
        name: prev.name || name,
        pushName: prev.pushName || pushName,
        isMyContact: prev.isMyContact || isMyContact,
      });
    }
  }

  return Array.from(byKey.values());
}

export function normalizeWahaGroupInfo(
  groupJid: string,
  rawData: any,
  lidPhoneMap?: Map<string, string>
): WahaGroupInfo | null {
  if (!rawData || typeof rawData !== 'object') return null;
  const subjectRaw =
    rawData.subject ||
    rawData.Subject ||
    rawData.name ||
    rawData.Name ||
    rawData.groupMetadata?.subject ||
    null;
  const descRaw =
    rawData.desc ||
    rawData.description ||
    rawData.Topic ||
    rawData.groupMetadata?.desc ||
    null;

  const rawParticipants: any[] = Array.isArray(rawData.participants)
    ? rawData.participants
    : Array.isArray(rawData.Participants)
    ? rawData.Participants
    : Array.isArray(rawData.groupMetadata?.participants)
    ? rawData.groupMetadata.participants
    : [];

  const byParticipant = new Map<string, WahaGroupParticipant>();
  for (const p of rawParticipants) {
    if (!p || typeof p !== 'object') continue;
    const rawJid = String(p.id?._serialized || p.id?.id || p.id || p.JID || p.jid || '').trim();
    if (!rawJid) continue;
    const phone =
      extractValidNormalizedPhone(p.phoneNumber) ||
      extractValidNormalizedPhone(p.PhoneNumber) ||
      extractValidNormalizedPhone(p.pn) ||
      extractValidNormalizedPhone(p.PN) ||
      (isPhoneWahaJid(rawJid) ? extractValidNormalizedPhone(rawJid) : null) ||
      (lidPhoneMap?.get(rawJid) ? extractValidNormalizedPhone(lidPhoneMap.get(rawJid)) : null);

    const isSuper = Boolean(p.isSuperAdmin || p.IsSuperAdmin || p.admin === 'superadmin' || p.role === 'superadmin');
    const isAdmin = Boolean(p.isAdmin || p.IsAdmin || p.admin === 'admin' || p.role === 'admin');
    const role: WahaGroupParticipant['role'] = isSuper ? 'superadmin' : isAdmin ? 'admin' : 'member';
    const rawName =
      p.name ||
      p.pushName ||
      p.pushname ||
      p.PushName ||
      p.FullName ||
      p.DisplayName ||
      p.BusinessName ||
      p.notify ||
      null;
    const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : null;

    const prev = byParticipant.get(rawJid);
    byParticipant.set(rawJid, {
      jid: rawJid,
      phone: phone || prev?.phone || null,
      name: name || prev?.name || null,
      role: role !== 'member' ? role : (prev?.role || 'member'),
    });
  }

  return {
    groupJid,
    subject: typeof subjectRaw === 'string' && subjectRaw.trim() ? subjectRaw.trim() : null,
    description: typeof descRaw === 'string' && descRaw.trim() ? descRaw.trim() : null,
    participants: Array.from(byParticipant.values()),
  };
}

export interface WahaInteractiveButtonInput {
  type: 'reply' | 'url' | 'call' | 'copy';
  text: string;
  url?: string;
  phoneNumber?: string;
  copyCode?: string;
}

export interface WahaSharedContactItem {
  fullName: string;
  phones: string[];
  waId?: string;
  organization?: string;
  email?: string;
  vcard?: string;
}

export interface WahaLocationData {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  url?: string;
  isLive?: boolean;
  accuracyInMeters?: number;
}

export function parseVCardString(
  rawVcard: string,
  fallbackName?: string | null
): WahaSharedContactItem | null {
  const clean = String(rawVcard || '').trim();
  if (!clean && !fallbackName) return null;

  // Unfold RFC 2425/6350 folded lines before splitting
  const unfolded = clean.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let fn = '';
  let nFallback = '';
  let org = '';
  let email = '';
  let waId = '';
  const phones: string[] = [];
  const seenPhones = new Set<string>();

  const pushPhone = (val: string) => {
    const rawTrim = val.trim();
    if (!rawTrim) return;
    const norm = normalizePhoneNumber(rawTrim);
    const digitsOnly = rawTrim.replace(/[^\d]/g, '');
    const key = norm || (digitsOnly.length >= 6 ? digitsOnly : rawTrim);
    if (!key || seenPhones.has(key)) return;
    seenPhones.add(key);
    phones.push(norm || rawTrim);
  };

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx <= 0) continue;
    const rawProp = line.slice(0, colonIdx);
    const val = line.slice(colonIdx + 1).trim();
    if (!val) continue;

    // Strip itemN. grouping prefix if present (e.g. item1.TEL)
    const propWithoutGroup = rawProp.includes('.') ? rawProp.split('.').slice(1).join('.') : rawProp;
    const [propNameRaw, ...paramParts] = propWithoutGroup.split(';');
    const propName = propNameRaw.trim().toUpperCase();

    for (const p of paramParts) {
      const m = p.match(/waid=([^;:]+)/i);
      if (m && m[1]) {
        const waDigits = m[1].replace(/[^\d]/g, '');
        if (waDigits.length >= 6) {
          waId = waDigits;
          pushPhone(waDigits);
        }
      }
    }

    if (propName === 'FN') {
      fn = val;
    } else if (propName === 'N' && !nFallback) {
      const parts = val.split(';').map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        nFallback = `${parts[1]} ${parts[0]}`.trim();
      } else if (parts.length === 1) {
        nFallback = parts[0];
      }
    } else if (propName === 'ORG') {
      org = val.replace(/;+/g, ' ').trim();
    } else if (propName === 'EMAIL' && !email) {
      email = val;
    } else if (propName === 'TEL') {
      pushPhone(val);
    }
  }

  const fullName =
    (fn || nFallback || String(fallbackName || '').trim() || (phones[0] ? `+${phones[0]}` : 'Kontak WhatsApp')).trim();

  if (!fullName && phones.length === 0) return null;

  return {
    fullName,
    phones,
    ...(waId ? { waId } : {}),
    ...(org ? { organization: org } : {}),
    ...(email ? { email } : {}),
    ...(clean ? { vcard: clean } : {}),
  };
}

export function buildVCardString(contact: {
  fullName: string;
  phoneNumber: string;
  organization?: string;
  email?: string;
}): string {
  const safeName = contact.fullName.trim().replace(/\r?\n/g, ' ');
  const norm = normalizePhoneNumber(contact.phoneNumber) || contact.phoneNumber.replace(/[^\d]/g, '');
  const displayTel = norm ? `+${norm}` : contact.phoneNumber.trim();
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:;${safeName};;;`,
    `FN:${safeName}`,
  ];
  if (contact.organization?.trim()) {
    lines.push(`ORG:${contact.organization.trim().replace(/\r?\n/g, ' ')}`);
  }
  if (contact.email?.trim()) {
    lines.push(`EMAIL:${contact.email.trim().replace(/\r?\n/g, ' ')}`);
  }
  lines.push(`TEL;type=CELL;type=VOICE;waid=${norm || displayTel}:${displayTel}`);
  lines.push('END:VCARD');
  return lines.join('\n');
}

export interface WahaSendResult {
  success: boolean;
  messageId?: string;
  sessionUsed?: string;
  error?: string;
  usedFallbackText?: boolean;
  fallbackReason?: string;
}

export function formatLinkPreviewFallbackText(data: {
  url: string;
  title?: string;
  description?: string;
  caption?: string;
}): string {
  const parts: string[] = [];
  const cleanTitle = (data.title || '').trim();
  const cleanCaption = (data.caption || '').trim();
  const cleanDesc = (data.description || '').trim();
  const cleanUrl = data.url.trim();
  if (cleanCaption) parts.push(cleanCaption);
  if (cleanTitle && !cleanCaption.includes(cleanTitle)) parts.push(`*${cleanTitle}*`);
  if (cleanDesc && cleanDesc !== cleanCaption) parts.push(cleanDesc);
  if (cleanUrl && !parts.some((p) => p.includes(cleanUrl))) parts.push(cleanUrl);
  return parts.join('\n').trim();
}

export function formatInteractiveButtonsFallbackText(data: {
  header?: string;
  body: string;
  footer?: string;
  buttons: WahaInteractiveButtonInput[];
}): string {
  const lines: string[] = [];
  if (data.header?.trim()) lines.push(`*${data.header.trim()}*`);
  if (data.body.trim()) lines.push(data.body.trim());
  if (data.buttons.length > 0) {
    lines.push('');
    data.buttons.forEach((btn, idx) => {
      const num = idx + 1;
      if (btn.type === 'url' && btn.url) {
        lines.push(`${num}. ${btn.text}: ${btn.url}`);
      } else if (btn.type === 'call' && btn.phoneNumber) {
        lines.push(`${num}. ${btn.text}: ${btn.phoneNumber}`);
      } else if (btn.type === 'copy' && btn.copyCode) {
        lines.push(`${num}. ${btn.text}: \`${btn.copyCode}\``);
      } else {
        lines.push(`${num}. ${btn.text}`);
      }
    });
  }
  if (data.footer?.trim()) {
    lines.push('');
    lines.push(`_${data.footer.trim()}_`);
  }
  return lines.join('\n').trim();
}

export interface WahaWebhookTelemetry {
  receivedAt: string;
  event: string;
  session?: string | null;
  from?: string | null;
  outcome: 'PROCESSED' | 'DEDUP' | 'IGNORED' | 'ERROR';
  note?: string;
}

export interface WahaProfileInfo {
  jid: string;
  isGroup: boolean;
  name?: string;
  pushName?: string;
  about?: string;
  pictureUrl?: string;
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
  private externalEngineCache = new Map<
    string,
    { engine: string | null; version: string | null; tier: string | null; checkedAt: number }
  >();
  private readonly EXTERNAL_ENGINE_CACHE_MS = 60_000;
  private lastWebhookEventByCompany = new Map<string, WahaWebhookTelemetry>();
  private detectedPublicUrlByCompany = new Map<string, string>();

  private constructor() { }

  public invalidateExternalEngineCache(): void {
    this.externalEngineCache.clear();
  }

  public recordWebhookEvent(entry: WahaWebhookTelemetry, companyId?: string): void {
    const cid = getActiveCompanyId(companyId);
    this.lastWebhookEventByCompany.set(cid, entry);
  }

  public getLastWebhookEvent(companyId?: string): WahaWebhookTelemetry | null {
    const cid = getActiveCompanyId(companyId);
    return this.lastWebhookEventByCompany.get(cid) || null;
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
   * In shared internal WAHA mode, scope all sessions per tenant company
   * so tenants never see or touch another company's WhatsApp sessions.
   */
  private getOwnerPrefix(mode?: 'INTERNAL' | 'EXTERNAL', companyId?: string): string | null {
    if (mode !== 'INTERNAL') return null;
    const cid = getActiveCompanyId(companyId);
    const base = (config.waha.session || '').trim();
    if (cid === DEFAULT_COMPANY_ID) {
      if (!base || base === 'default') return null;
      return base;
    }
    const shortId = cid.replace(/^cmp_/, '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || cid.slice(0, 12);
    return base && base !== 'default' ? `${base}-${shortId}` : `t_${shortId}`;
  }

  public async resolveCompanyIdForWebhookSession(sessionName?: string | null): Promise<string> {
    const clean = String(sessionName || '').trim();
    if (!clean) return DEFAULT_COMPANY_ID;
    try {
      const matched = await db
        .select({ companyId: companySettings.companyId })
        .from(companySettings)
        .where(and(eq(companySettings.key, 'waha_session'), eq(companySettings.value, clean)))
        .limit(1);
      if (matched[0]?.companyId) {
        return matched[0].companyId;
      }
      const companyIds = await listActiveCompanyIds();
      for (const cid of companyIds) {
        if (cid === DEFAULT_COMPANY_ID) continue;
        const prefix = this.getOwnerPrefix('INTERNAL', cid);
        if (prefix && this.isOwnedSession(clean, prefix)) {
          return cid;
        }
      }
    } catch {
      // ignore lookup errors cleanly
    }
    return DEFAULT_COMPANY_ID;
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
    if (err?.code === 'WAHA_ENGINE_NOT_GOWS') {
      return err;
    }
    const wrapped: any = new Error(this.extractWahaError(err, fallbackPrefix));
    wrapped.statusCode = err?.statusCode || err?.response?.status || 502;
    return wrapped;
  }

  private normalizeWahaEngine(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const cleaned = raw.trim().toUpperCase();
    return cleaned || null;
  }

  private buildNonGowsError(engine: string | null): Error {
    const msg = engine
      ? `WAHA Eksternal tidak dapat digunakan: wajib menggunakan engine GOWS, sedangkan server terdeteksi menggunakan engine ${engine}. Ubah WHATSAPP_DEFAULT_ENGINE=GOWS pada server WAHA eksternal Anda.`
      : `WAHA Eksternal tidak dapat digunakan: server tidak melaporkan engine GOWS pada endpoint /api/version. Pastikan server WAHA eksternal menggunakan engine GOWS (WHATSAPP_DEFAULT_ENGINE=GOWS).`;
    const err: any = new Error(msg);
    err.statusCode = 422;
    err.code = 'WAHA_ENGINE_NOT_GOWS';
    err.detectedEngine = engine;
    return err;
  }

  private async fetchServerVersionInfo(client: AxiosInstance): Promise<{
    version: string | null;
    tier: string | null;
    engine: string | null;
  }> {
    let data: any = null;
    try {
      const res = await client.get('/api/version', { timeout: 6000 });
      data = res?.data;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status && status !== 404 && status !== 405 && status !== 501) {
        throw err;
      }
      if (!status && err?.code) {
        throw err;
      }
    }

    if (!data || (!data.engine && !data.version && !data.tier)) {
      try {
        const res = await client.get('/api/server/version', { timeout: 6000 });
        if (res?.data && typeof res.data === 'object') {
          data = res.data;
        }
      } catch (err: any) {
        const status = err?.response?.status;
        if (status && status !== 404 && status !== 405 && status !== 501) {
          throw err;
        }
        if (!status && err?.code) {
          throw err;
        }
      }
    }

    const version = data?.version ? String(data.version).trim() || null : null;
    const tier = data?.tier ? String(data.tier).trim() || null : null;
    const engine = this.normalizeWahaEngine(
      data?.engine || data?.whatsappEngine || data?.defaultEngine
    );
    return { version, tier, engine };
  }

  private async ensureExternalGowsEngine(
    client: AxiosInstance,
    baseUrl: string,
    apiKey?: string,
    opts?: { bypassCache?: boolean }
  ): Promise<{ version: string | null; tier: string | null; engine: string }> {
    const cacheKey = `${String(baseUrl || '').trim().replace(/\/+$/, '')}|${String(apiKey || '').trim()}`;
    const now = Date.now();
    if (!opts?.bypassCache) {
      const cached = this.externalEngineCache.get(cacheKey);
      if (cached && now - cached.checkedAt < this.EXTERNAL_ENGINE_CACHE_MS) {
        if (cached.engine !== 'GOWS') {
          throw this.buildNonGowsError(cached.engine);
        }
        return { version: cached.version, tier: cached.tier, engine: 'GOWS' };
      }
    }

    const info = await this.fetchServerVersionInfo(client);
    this.externalEngineCache.set(cacheKey, {
      engine: info.engine,
      version: info.version,
      tier: info.tier,
      checkedAt: now,
    });

    if (info.engine !== 'GOWS') {
      throw this.buildNonGowsError(info.engine);
    }
    return { version: info.version, tier: info.tier, engine: 'GOWS' };
  }

  public async assertExternalGowsEngine(params: {
    baseUrl: string;
    apiKey?: string;
  }): Promise<{ version: string | null; tier: string | null; engine: string }> {
    const stored = await this.getConfig(false);
    const savedExtKey =
      stored.externalConfig?.apiKey !== undefined
        ? stored.externalConfig.apiKey
        : stored.mode === 'EXTERNAL'
          ? stored.apiKey
          : '';
    const effectiveKey =
      params.apiKey === undefined || params.apiKey === '••••••••'
        ? savedExtKey
        : params.apiKey;
    const client = this.createHttpClient(params.baseUrl, effectiveKey, 10000);
    try {
      return await this.ensureExternalGowsEngine(client, params.baseUrl, effectiveKey, {
        bypassCache: true,
      });
    } catch (err: any) {
      throw this.wrapWahaError(err, 'Verifikasi WAHA Eksternal gagal');
    }
  }

  public async verifyActiveExternalGowsIfNeeded(): Promise<void> {
    const conf = await this.getConfig(false);
    if (conf.mode !== 'EXTERNAL') return;
    const client = this.createHttpClient(conf.baseUrl, conf.apiKey, 10000);
    try {
      await this.ensureExternalGowsEngine(client, conf.baseUrl, conf.apiKey);
    } catch (err: any) {
      throw this.wrapWahaError(err);
    }
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
  public async getConfig(maskSecret = false, companyId?: string): Promise<WahaConfig> {
    const cid = getActiveCompanyId(companyId);
    const defaultInternalSession =
      this.getOwnerPrefix('INTERNAL', cid) || config.waha.session || 'default';
    try {
      const settings = await getCompanySettingMap(cid);
      const customWebhookUrl = (settings['waha_webhook_url'] || '').trim();
      const detectedPublicUrl = (settings['waha_detected_public_url'] || '').trim();
      if (detectedPublicUrl && !isPrivateOrInternalUrl(detectedPublicUrl)) {
        this.detectedPublicUrlByCompany.set(cid, detectedPublicUrl);
      }

      const mode: 'INTERNAL' | 'EXTERNAL' =
        settings['waha_mode'] === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL';

      const savedExternalUrl = (settings['waha_base_url'] || '').trim();
      const savedExternalKey = settings['waha_api_key'] || '';
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

      const savedSession = (settings['waha_session'] || '').trim();
      const cachedDetected = this.detectedPublicUrlByCompany.get(cid);

      if (mode === 'INTERNAL') {
        const session = savedSession || defaultInternalSession;
        return {
          baseUrl: internalUrl,
          apiKey: maskSecret ? (internalRawKey ? '••••••••' : '') : internalRawKey,
          session,
          mode: 'INTERNAL',
          internalLocked: true,
          hasApiKey: internalConfig.hasApiKey,
          customWebhookUrl,
          detectedPublicUrl: detectedPublicUrl || cachedDetected || undefined,
          externalConfig,
          internalConfig,
        };
      }

      return {
        baseUrl: savedExternalUrl,
        apiKey: maskSecret ? (savedExternalKey ? '••••••••' : '') : savedExternalKey,
        session: savedSession || 'default',
        mode: 'EXTERNAL',
        internalLocked: false,
        hasApiKey: externalConfig.hasApiKey,
        customWebhookUrl,
        detectedPublicUrl: detectedPublicUrl || cachedDetected || undefined,
        externalConfig,
        internalConfig,
      };
    } catch {
      return {
        baseUrl: config.waha.baseUrl,
        apiKey: maskSecret ? (config.waha.apiKey ? '••••••••' : '') : config.waha.apiKey,
        session: defaultInternalSession,
        mode: 'INTERNAL',
        internalLocked: true,
        hasApiKey: Boolean(config.waha.apiKey && config.waha.apiKey.trim() !== ''),
      };
    }
  }

  /**
   * Create Axios client with authentication headers
   */
  private async getClient(opts?: { bypassEngineCache?: boolean }): Promise<{
    client: AxiosInstance;
    session: string;
    ownerPrefix: string | null;
    mode: 'INTERNAL' | 'EXTERNAL';
    engine?: string | null;
  }> {
    const conf = await this.getConfig(false);
    const mode: 'INTERNAL' | 'EXTERNAL' = conf.mode === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL';
    const ownerPrefix = this.getOwnerPrefix(mode);
    const activeSession =
      ownerPrefix && !this.isOwnedSession(conf.session, ownerPrefix) ? ownerPrefix : conf.session;
    const client = this.createHttpClient(conf.baseUrl, conf.apiKey, 30000);

    let engine: string | null = null;
    if (mode === 'EXTERNAL') {
      const verified = await this.ensureExternalGowsEngine(client, conf.baseUrl, conf.apiKey, {
        bypassCache: opts?.bypassEngineCache,
      });
      engine = verified.engine;
    }

    return { client, session: activeSession, ownerPrefix, mode, engine };
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
    engine?: string | null;
    isGows?: boolean;
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
      let verInfo: { version: string | null; tier: string | null; engine: string | null };
      if (targetMode === 'EXTERNAL') {
        verInfo = await this.ensureExternalGowsEngine(client, targetUrl, targetKey, {
          bypassCache: true,
        });
      } else {
        verInfo = await this.fetchServerVersionInfo(client).catch(() => ({
          version: null,
          tier: null,
          engine: null,
        }));
      }

      const rawList = await this.fetchRawSessionList(client);
      const sessions = rawList
        .map((item: any) => ({
          name: String(item.name || 'default'),
          status: String(item.status || 'UNKNOWN'),
        }))
        .filter((item) => this.isOwnedSession(item.name, ownerPrefix));

      return {
        connected: true,
        mode: targetMode,
        baseUrl: targetUrl.replace(/\/+$/, ''),
        version: verInfo.version,
        tier: verInfo.tier,
        engine: verInfo.engine,
        isGows: verInfo.engine === 'GOWS',
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
  public async rememberPublicBaseUrl(rawBaseUrl?: string | null, companyId?: string): Promise<void> {
    const clean = String(rawBaseUrl || '').trim().replace(/\/+$/, '');
    if (!clean || !/^https?:\/\//i.test(clean) || isPrivateOrInternalUrl(clean)) return;
    const cid = getActiveCompanyId(companyId);
    this.detectedPublicUrlByCompany.set(cid, clean);
    try {
      await upsertCompanySetting('waha_detected_public_url', clean, cid);
    } catch {
      // Ignore DB persistence failures in unit tests / readonly scenarios
    }
  }

  private appendCompanyQuery(rawUrl: string, companyId: string): string {
    if (!rawUrl || companyId === DEFAULT_COMPANY_ID) return rawUrl;
    try {
      const parsed = new URL(rawUrl);
      if (!parsed.searchParams.get('companyId')) {
        parsed.searchParams.set('companyId', companyId);
      }
      return parsed.toString();
    } catch {
      return rawUrl.includes('companyId=')
        ? rawUrl
        : `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}companyId=${encodeURIComponent(companyId)}`;
    }
  }

  /**
   * Resolve the best webhook URL for WAHA events based on active mode (INTERNAL vs EXTERNAL)
   */
  public async resolveEffectiveWebhookUrl(
    currentConfig?: WahaConfig,
    requestBaseUrl?: string | null,
    companyId?: string
  ): Promise<{ url: string; isPublic: boolean; source: string }> {
    const cid = getActiveCompanyId(companyId);
    const conf = currentConfig || (await this.getConfig(true, cid));
    const custom = (conf.customWebhookUrl || '').trim();
    if (custom && /^https?:\/\//i.test(custom)) {
      return {
        url: this.appendCompanyQuery(custom, cid),
        isPublic: !isPrivateOrInternalUrl(custom),
        source: 'custom',
      };
    }

    if (conf.mode !== 'EXTERNAL') {
      const url = this.appendCompanyQuery((config.webhookUrl || '').trim(), cid);
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
    const cachedDetected = this.detectedPublicUrlByCompany.get(cid);
    if (conf.detectedPublicUrl) {
      candidates.push({ base: conf.detectedPublicUrl, source: 'detected_origin' });
    } else if (cachedDetected) {
      candidates.push({ base: cachedDetected, source: 'detected_origin' });
    }

    for (const item of candidates) {
      const cleanBase = String(item.base || '').trim().replace(/\/+$/, '');
      if (cleanBase && /^https?:\/\//i.test(cleanBase) && !isPrivateOrInternalUrl(cleanBase)) {
        const fullUrl = cleanBase.endsWith('/api/waha/webhook')
          ? cleanBase
          : `${cleanBase}/api/waha/webhook`;
        return { url: this.appendCompanyQuery(fullUrl, cid), isPublic: true, source: item.source };
      }
    }

    const fallback = this.appendCompanyQuery((config.webhookUrl || '').trim(), cid);
    return { url: fallback, isPublic: !isPrivateOrInternalUrl(fallback), source: 'internal_fallback' };
  }

  /**
   * Resolve a WhatsApp @lid privacy JID to a normalized phone number via WAHA API (cached)
   */
  public async resolveLidToPhone(sessionName: string | null | undefined, lidJid: string): Promise<string | null> {
    const cleanLid = String(lidJid || '').trim();
    if (!cleanLid || !cleanLid.toLowerCase().endsWith('@lid')) return null;

    const cid = getActiveCompanyId();
    const cacheKey = `${cid}::${cleanLid}`;
    const cached = this.lidPhoneCache.get(cacheKey);
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
          this.lidPhoneCache.set(cacheKey, phone);
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
          this.lidPhoneCache.set(cacheKey, phone);
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
    engine?: string | null;
    engineSupported?: boolean;
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
      const { client, session, ownerPrefix, engine } = await this.getClient({
        bypassEngineCache: currentConfig.mode === 'EXTERNAL',
      });
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
        engine: engine ?? null,
        engineSupported: true,
        activeSession: resolvedActiveSession,
        connectedSessions,
        totalSessions: sessionSummaries.length,
        sessions: sessionSummaries,
        details: sessionData,
        webhookUrl: resolvedWebhook.url,
        webhookReachableForExternal,
        lastWebhook: this.getLastWebhookEvent(),
        config: currentConfig,
      };
    } catch (err: any) {
      const isEngineBlocked = err?.code === 'WAHA_ENGINE_NOT_GOWS';
      return {
        connected: false,
        sessionStatus: isEngineBlocked ? 'UNSUPPORTED_ENGINE' : 'OFFLINE',
        engine: isEngineBlocked ? (err?.detectedEngine ?? null) : null,
        engineSupported: !isEngineBlocked,
        activeSession: currentConfig.session,
        connectedSessions: 0,
        totalSessions: 0,
        sessions: [],
        error: this.extractWahaError(err),
        webhookUrl: resolvedWebhook.url,
        webhookReachableForExternal,
        lastWebhook: this.getLastWebhookEvent(),
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

    const requiredEvents = [
      'message',
      'message.any',
      'message.ack',
      'session.status',
      'presence.update',
      'poll.vote',
      'poll.vote.failed',
    ];
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
      return (
        evs.includes('*') ||
        (evs.includes('message.any') &&
          evs.includes('message.ack') &&
          evs.includes('session.status') &&
          evs.includes('presence.update') &&
          evs.includes('poll.vote') &&
          evs.includes('poll.vote.failed'))
      );
    });

    if (hasValidWebhook) return true;

    const cid = getActiveCompanyId();
    const syncCacheKey = `${cid}::${sessionName}`;
    if (!opts?.force) {
      const lastAttempt = this.webhookSyncAt.get(syncCacheKey) || 0;
      if (Date.now() - lastAttempt < 30_000) return false;
    }
    this.webhookSyncAt.set(syncCacheKey, Date.now());

    const preservedWebhooks = existingWebhooks.filter(
      (wh) => wh && typeof wh.url === 'string' && !wh.url.includes('/api/waha/webhook')
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
            events: [
              'message',
              'message.any',
              'message.ack',
              'session.status',
              'presence.update',
              'poll.vote',
              'poll.vote.failed',
            ],
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
    await this.verifyActiveExternalGowsIfNeeded();
    const conf = await this.getConfig();
    const ownerPrefix = this.getOwnerPrefix(conf.mode);
    this.assertOwnedSession(clean, ownerPrefix);
    await upsertCompanySetting('waha_session', clean);
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
    const existing = await this.listSessions().catch(() => ({ sessions: [] as WahaSessionInfo[] }));
    const alreadyExists = existing.sessions.some((s) => s.name === scopedName);
    if (!alreadyExists) {
      await licenseService.assertQuota('sessions', existing.sessions.length + 1);
    }
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

  private isWahaFeatureUnsupported(err: any): boolean {
    const status = err?.response?.status;
    if (status === 404 || status === 405 || status === 501) return true;
    const rawMsg = this.extractWahaError(err).toLowerCase();
    if (
      (status === 400 || status === 422 || status === 500) &&
      /(not implemented|not supported|unsupported|deprecated|buttons?\s+(are|is)\s+(disabled|deprecated|unsupported)|cannot post)/i.test(
        rawMsg
      )
    ) {
      return true;
    }
    return false;
  }

  private async executeOutboundSend(
    phone: string,
    sessionName: string | undefined,
    sender: (client: AxiosInstance, targetSession: string, chatId: string) => Promise<any>
  ): Promise<WahaSendResult> {
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

      const sendWithSession = async (sess: string): Promise<WahaSendResult> => {
        const resData = await sender(client, sess, chatId);
        const payload = resData?.__wahaMeta ? resData.data : resData;
        const meta = resData?.__wahaMeta || {};
        return {
          success: true,
          messageId: this.extractOutboundMessageId(payload),
          sessionUsed: sess,
          ...(meta.usedFallbackText ? { usedFallbackText: true } : {}),
          ...(meta.fallbackReason ? { fallbackReason: String(meta.fallbackReason) } : {}),
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
   * Mark customer WhatsApp messages as seen/read via WAHA
   */
  public async sendSeen(
    phone: string,
    sessionName?: string,
    opts?: { messageIds?: string[] }
  ): Promise<WahaSendResult> {
    const cleanIds = (opts?.messageIds || []).map((id) => id.trim()).filter(Boolean);
    return this.executeOutboundSend(phone, sessionName, async (client, targetSession, chatId) => {
      try {
        const res = await client.post(
          '/api/sendSeen',
          {
            session: targetSession,
            chatId,
            ...(cleanIds.length > 0 ? { messageId: cleanIds[0], messageIds: cleanIds } : {}),
          },
          { timeout: 5000 }
        );
        return res.data;
      } catch (err: any) {
        const st = err?.response?.status;
        if (st === 404 || st === 405 || st === 501) {
          const fallbackRes = await client.post(
            `/api/${encodeURIComponent(targetSession)}/chats/${encodeURIComponent(chatId)}/messages/read`,
            {},
            { timeout: 5000 }
          );
          return fallbackRes.data;
        }
        throw err;
      }
    });
  }

  /**
   * Delete (revoke for everyone) a sent WhatsApp message via WAHA
   */
  public async deleteMessage(
    phone: string,
    wahaMessageId: string,
    sessionName?: string
  ): Promise<WahaSendResult> {
    const cleanMsgId = String(wahaMessageId || '').trim();
    if (!cleanMsgId) {
      return {
        success: false,
        error: 'ID pesan WAHA tidak ditemukan sehingga pesan tidak dapat ditarik di WhatsApp.',
      };
    }
    return this.executeOutboundSend(phone, sessionName, async (client, targetSession, chatId) => {
      try {
        const res = await client.delete(
          `/api/${encodeURIComponent(targetSession)}/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(cleanMsgId)}`,
          { timeout: 12000 }
        );
        return res.data;
      } catch (err: any) {
        const st = err?.response?.status;
        if (st === 404 || st === 405 || st === 501) {
          const fallbackRes = await client.post(
            '/api/messages/delete',
            { session: targetSession, chatId, messageId: cleanMsgId },
            { timeout: 12000 }
          );
          return fallbackRes.data;
        }
        throw err;
      }
    });
  }

  /**
   * Forward a WhatsApp message natively to another chat via WAHA
   */
  public async forwardMessage(
    phoneOrJid: string,
    wahaMessageId: string,
    sessionName?: string
  ): Promise<WahaSendResult> {
    const cleanMsgId = String(wahaMessageId || '').trim();
    if (!cleanMsgId) {
      return {
        success: false,
        error: 'ID pesan WhatsApp tidak ditemukan untuk diteruskan.',
      };
    }
    return this.executeOutboundSend(phoneOrJid, sessionName, async (client, targetSession, chatId) => {
      try {
        const res = await client.post(
          '/api/forwardMessage',
          { session: targetSession, chatId, messageId: cleanMsgId },
          { timeout: 15000 }
        );
        return res.data;
      } catch (err: any) {
        const st = err?.response?.status;
        if (st === 404 || st === 405 || st === 501) {
          const fallbackRes = await client.post(
            `/api/${encodeURIComponent(targetSession)}/forward-message`,
            { chatId, messageId: cleanMsgId },
            { timeout: 15000 }
          );
          return fallbackRes.data;
        }
        throw err;
      }
    });
  }

  /**
   * Pin a WhatsApp message in chat via WAHA
   * duration in seconds: 86400 (24h), 604800 (7d - default), 2592000 (30d)
   */
  public async pinMessage(
    phoneOrJid: string,
    wahaMessageId: string,
    durationSeconds: number = 604800,
    sessionName?: string
  ): Promise<WahaSendResult> {
    const cleanMsgId = String(wahaMessageId || '').trim();
    if (!cleanMsgId) {
      return {
        success: false,
        error: 'ID pesan WhatsApp tidak ditemukan untuk disematkan.',
      };
    }
    return this.executeOutboundSend(phoneOrJid, sessionName, async (client, targetSession, chatId) => {
      try {
        const res = await client.post(
          `/api/${encodeURIComponent(targetSession)}/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(cleanMsgId)}/pin`,
          { duration: durationSeconds },
          { timeout: 12000 }
        );
        return res.data;
      } catch (err: any) {
        const st = err?.response?.status;
        if (st === 404 || st === 405 || st === 501) {
          const fallbackRes = await client.post(
            '/api/pinMessage',
            { session: targetSession, chatId, messageId: cleanMsgId, duration: durationSeconds },
            { timeout: 12000 }
          );
          return fallbackRes.data;
        }
        throw err;
      }
    });
  }

  /**
   * Unpin a WhatsApp message in chat via WAHA
   */
  public async unpinMessage(
    phoneOrJid: string,
    wahaMessageId: string,
    sessionName?: string
  ): Promise<WahaSendResult> {
    const cleanMsgId = String(wahaMessageId || '').trim();
    if (!cleanMsgId) {
      return {
        success: false,
        error: 'ID pesan WhatsApp tidak ditemukan untuk dilepas sematannya.',
      };
    }
    return this.executeOutboundSend(phoneOrJid, sessionName, async (client, targetSession, chatId) => {
      try {
        const res = await client.post(
          `/api/${encodeURIComponent(targetSession)}/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(cleanMsgId)}/unpin`,
          {},
          { timeout: 12000 }
        );
        return res.data;
      } catch (err: any) {
        const st = err?.response?.status;
        if (st === 404 || st === 405 || st === 501) {
          const fallbackRes = await client.post(
            '/api/unpinMessage',
            { session: targetSession, chatId, messageId: cleanMsgId },
            { timeout: 12000 }
          );
          return fallbackRes.data;
        }
        throw err;
      }
    });
  }

  /**
   * Star or unstar a WhatsApp message via WAHA
   */
  public async starMessage(
    phoneOrJid: string,
    wahaMessageId: string,
    star: boolean,
    sessionName?: string
  ): Promise<WahaSendResult> {
    const cleanMsgId = String(wahaMessageId || '').trim();
    if (!cleanMsgId) {
      return {
        success: false,
        error: 'ID pesan WhatsApp tidak ditemukan untuk dibintangi.',
      };
    }
    return this.executeOutboundSend(phoneOrJid, sessionName, async (client, targetSession, chatId) => {
      try {
        const res = await client.put(
          '/api/star',
          { session: targetSession, chatId, messageId: cleanMsgId, star },
          { timeout: 12000 }
        );
        return res.data;
      } catch (err: any) {
        const st = err?.response?.status;
        if (st === 404 || st === 405 || st === 501) {
          const fallbackRes = await client.put(
            `/api/${encodeURIComponent(targetSession)}/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(cleanMsgId)}/star`,
            { star },
            { timeout: 12000 }
          );
          return fallbackRes.data;
        }
        throw err;
      }
    });
  }

  /**
   * Sync WhatsApp Business labels for a chat via WAHA
   */
  public async syncChatLabels(
    phoneOrJid: string,
    labelNames: string[],
    sessionName?: string
  ): Promise<WahaSendResult> {
    return this.executeOutboundSend(phoneOrJid, sessionName, async (client, targetSession, chatId) => {
      try {
        const existingRes = await client
          .get(`/api/${encodeURIComponent(targetSession)}/labels`, {
            timeout: 10000,
          })
          .catch(() => null);

        const existingLabels: Array<{ id: string; name: string }> = Array.isArray(existingRes?.data)
          ? existingRes.data
          : [];
        const existingMap = new Map<string, string>();
        for (const lbl of existingLabels) {
          if (lbl?.name) existingMap.set(lbl.name.trim().toLowerCase(), String(lbl.id));
        }

        const targetLabelIds: string[] = [];
        for (const rawName of labelNames) {
          const trimmed = rawName.trim();
          if (!trimmed) continue;
          const key = trimmed.toLowerCase();
          if (existingMap.has(key)) {
            targetLabelIds.push(existingMap.get(key)!);
          } else {
            try {
              const created = await client.post(
                `/api/${encodeURIComponent(targetSession)}/labels`,
                { name: trimmed, color: 1 },
                { timeout: 10000 }
              );
              const newId = String(created?.data?.id || created?.data?.labelId || '');
              if (newId) {
                existingMap.set(key, newId);
                targetLabelIds.push(newId);
              }
            } catch (createErr: any) {
              console.warn(`[WahaService] Could not auto-create WAHA label "${trimmed}":`, createErr?.message);
            }
          }
        }

        const res = await client.put(
          `/api/${encodeURIComponent(targetSession)}/labels/chats/${encodeURIComponent(chatId)}`,
          { labels: targetLabelIds.map((id) => ({ id })) },
          { timeout: 12000 }
        );
        return res.data;
      } catch (err: any) {
        console.warn(`[WahaService] syncChatLabels notice for ${chatId}:`, err?.response?.data || err?.message);
        return { success: false, error: err?.response?.data?.message || err?.message };
      }
    });
  }

  /**
   * Send startTyping or stopTyping indicator to customer WhatsApp via WAHA
   */
  public async setTyping(
    phone: string,
    typing: boolean,
    sessionName?: string
  ): Promise<WahaSendResult> {
    return this.executeOutboundSend(phone, sessionName, async (client, targetSession, chatId) => {
      const endpoint = typing ? '/api/startTyping' : '/api/stopTyping';
      const res = await client.post(
        endpoint,
        { session: targetSession, chatId },
        { timeout: 4000 }
      );
      return res.data;
    });
  }

  /**
   * Send WhatsApp text message
   */
  public async sendTextMessage(
    phone: string,
    text: string,
    sessionName?: string,
    opts?: { replyTo?: string; linkPreview?: boolean; linkPreviewHighQuality?: boolean; mentions?: string[] }
  ): Promise<WahaSendResult> {
    return this.executeOutboundSend(phone, sessionName, async (client, targetSession, chatId) => {
      const response = await client.post('/api/sendText', {
        session: targetSession,
        chatId,
        text,
        ...(opts?.linkPreview !== undefined ? { linkPreview: opts.linkPreview } : {}),
        ...(opts?.linkPreviewHighQuality !== undefined
          ? { linkPreviewHighQuality: opts.linkPreviewHighQuality }
          : {}),
        ...(opts?.replyTo ? { reply_to: opts.replyTo } : {}),
        ...(opts?.mentions && opts.mentions.length > 0 ? { mentions: opts.mentions } : {}),
      });
      return response.data;
    });
  }

  /**
   * Send link with custom WhatsApp preview card (falls back to sendText linkPreview if unsupported)
   */
  public async sendLinkPreviewMessage(
    phone: string,
    data: {
      url: string;
      title?: string;
      description?: string;
      caption?: string;
      imageUrl?: string;
      highQuality?: boolean;
      replyTo?: string;
    },
    sessionName?: string
  ): Promise<WahaSendResult> {
    const cleanUrl = data.url.trim();
    const cleanCaption = (data.caption || '').trim();
    const textWithUrl = cleanCaption
      ? cleanCaption.includes(cleanUrl)
        ? cleanCaption
        : `${cleanCaption}\n${cleanUrl}`
      : cleanUrl;
    const hasCustomPreview = Boolean(
      data.title?.trim() || data.description?.trim() || data.imageUrl?.trim()
    );

    return this.executeOutboundSend(phone, sessionName, async (client, targetSession, chatId) => {
      if (hasCustomPreview) {
        try {
          const res = await client.post('/api/send/link-custom-preview', {
            session: targetSession,
            chatId,
            text: textWithUrl,
            linkPreviewHighQuality: data.highQuality !== false,
            preview: {
              url: cleanUrl,
              title: data.title?.trim() || cleanUrl,
              description: data.description?.trim() || '',
              ...(data.imageUrl?.trim() ? { image: { url: data.imageUrl.trim() } } : {}),
            },
            ...(data.replyTo ? { reply_to: data.replyTo } : {}),
          });
          return res.data;
        } catch (err: any) {
          if (!this.isWahaFeatureUnsupported(err)) throw err;
          const fallbackText = formatLinkPreviewFallbackText(data);
          const fallbackRes = await client.post('/api/sendText', {
            session: targetSession,
            chatId,
            text: fallbackText,
            linkPreview: true,
            linkPreviewHighQuality: true,
            ...(data.replyTo ? { reply_to: data.replyTo } : {}),
          });
          return {
            __wahaMeta: {
              usedFallbackText: true,
              fallbackReason: this.extractWahaError(err),
            },
            data: fallbackRes.data,
          };
        }
      }

      const res = await client.post('/api/sendText', {
        session: targetSession,
        chatId,
        text: formatLinkPreviewFallbackText(data),
        linkPreview: true,
        linkPreviewHighQuality: data.highQuality !== false,
        ...(data.replyTo ? { reply_to: data.replyTo } : {}),
      });
      return res.data;
    });
  }

  /**
   * Send interactive buttons via WAHA (optionally falling back to structured text when engine rejects buttons)
   */
  public async sendButtonsMessage(
    phone: string,
    data: {
      header?: string;
      body: string;
      footer?: string;
      buttons: WahaInteractiveButtonInput[];
      replyTo?: string;
      fallbackTextOnUnsupported?: boolean;
    },
    sessionName?: string
  ): Promise<WahaSendResult> {
    const formattedButtons = data.buttons.map((b, idx) => {
      if (b.type === 'url') {
        return { type: 'url', text: b.text.trim(), url: (b.url || '').trim() };
      }
      if (b.type === 'call') {
        return { type: 'call', text: b.text.trim(), phoneNumber: (b.phoneNumber || '').trim() };
      }
      if (b.type === 'copy') {
        return { type: 'copy', text: b.text.trim(), copyCode: (b.copyCode || '').trim() };
      }
      return { type: 'reply', id: `btn_${idx + 1}`, text: b.text.trim() };
    });

    return this.executeOutboundSend(phone, sessionName, async (client, targetSession, chatId) => {
      try {
        const res = await client.post('/api/sendButtons', {
          session: targetSession,
          chatId,
          ...(data.header?.trim() ? { header: data.header.trim() } : {}),
          body: data.body.trim(),
          ...(data.footer?.trim() ? { footer: data.footer.trim() } : {}),
          buttons: formattedButtons,
          ...(data.replyTo ? { reply_to: data.replyTo } : {}),
        });
        return res.data;
      } catch (err: any) {
        if (data.fallbackTextOnUnsupported === false || !this.isWahaFeatureUnsupported(err)) {
          throw err;
        }
        const fallbackText = formatInteractiveButtonsFallbackText(data);
        const fallbackRes = await client.post('/api/sendText', {
          session: targetSession,
          chatId,
          text: fallbackText,
          linkPreview: true,
          ...(data.replyTo ? { reply_to: data.replyTo } : {}),
        });
        return {
          __wahaMeta: {
            usedFallbackText: true,
            fallbackReason: this.extractWahaError(err),
          },
          data: fallbackRes.data,
        };
      }
    });
  }

  /**
   * Send native WhatsApp Poll via WAHA
   */
  public async sendPollMessage(
    phone: string,
    data: {
      question: string;
      options: string[];
      multipleAnswers?: boolean;
      replyTo?: string;
    },
    sessionName?: string
  ): Promise<WahaSendResult> {
    return this.executeOutboundSend(phone, sessionName, async (client, targetSession, chatId) => {
      const res = await client.post('/api/sendPoll', {
        session: targetSession,
        chatId,
        poll: {
          name: data.question.trim(),
          options: data.options.map((o) => o.trim()).filter(Boolean),
          multipleAnswers: Boolean(data.multipleAnswers),
        },
        ...(data.replyTo ? { reply_to: data.replyTo } : {}),
      });
      return res.data;
    });
  }

  /**
   * Send WhatsApp image, video, audio, or document file via WAHA
   */
  public async sendMediaMessage(
    phone: string,
    file: {
      base64: string;
      mimetype: string;
      filename: string;
      caption?: string;
      replyTo?: string;
      mentions?: string[];
      asDocument?: boolean;
    },
    sessionName?: string
  ): Promise<WahaSendResult> {
    const cleanBase64 = file.base64.includes(',') ? file.base64.split(',')[1] : file.base64;
    const isImage = !file.asDocument && file.mimetype.startsWith('image/');
    const isVideo = !file.asDocument && file.mimetype.startsWith('video/');

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
        ...(file.replyTo ? { reply_to: file.replyTo } : {}),
        ...(file.mentions && file.mentions.length > 0 ? { mentions: file.mentions } : {}),
      };
      const mediaConfig = { timeout: 60000 };

      if (isImage) {
        const res = await client.post('/api/sendImage', payload, mediaConfig);
        return res.data;
      }
      if (isVideo) {
        try {
          const res = await client.post('/api/sendVideo', payload, mediaConfig);
          return res.data;
        } catch (err: any) {
          const st = err?.response?.status;
          if (st !== 404 && st !== 405 && st !== 501) throw err;
        }
      }
      const res = await client.post('/api/sendFile', payload, mediaConfig);
      return res.data;
    });
  }

  /**
   * Send WhatsApp sticker (WebP preferred; falls back to sendImage when engine omits sendSticker)
   */
  public async sendSticker(
    phone: string,
    file: { base64: string; mimetype?: string; filename?: string; replyTo?: string },
    sessionName?: string
  ): Promise<WahaSendResult> {
    const cleanBase64 = file.base64.includes(',') ? file.base64.split(',')[1] : file.base64;
    const mimetype = file.mimetype?.trim() || 'image/webp';
    const filename = file.filename?.trim() || 'sticker.webp';

    return this.executeOutboundSend(phone, sessionName, async (client, targetSession, chatId) => {
      const payload = {
        session: targetSession,
        chatId,
        file: {
          mimetype,
          filename,
          data: cleanBase64,
        },
        ...(file.replyTo ? { reply_to: file.replyTo } : {}),
      };
      try {
        const res = await client.post('/api/sendSticker', payload, { timeout: 45000 });
        return res.data;
      } catch (err: any) {
        const st = err?.response?.status;
        if (st === 404 || st === 405 || st === 501 || this.isWahaFeatureUnsupported(err)) {
          const fallbackRes = await client.post(
            '/api/sendImage',
            { ...payload, caption: '' },
            { timeout: 45000 }
          );
          return fallbackRes.data;
        }
        throw err;
      }
    });
  }

  /**
   * Send WhatsApp location pin via WAHA (with text Maps link fallback if unsupported)
   */
  public async sendLocation(
    phone: string,
    data: { latitude: number; longitude: number; title?: string; address?: string; replyTo?: string },
    sessionName?: string
  ): Promise<WahaSendResult> {
    const mapsUrl = `https://www.google.com/maps?q=${data.latitude},${data.longitude}`;
    const displayTitle = [data.title?.trim(), data.address?.trim()].filter(Boolean).join(' — ');

    return this.executeOutboundSend(phone, sessionName, async (client, targetSession, chatId) => {
      try {
        const res = await client.post('/api/sendLocation', {
          session: targetSession,
          chatId,
          latitude: data.latitude,
          longitude: data.longitude,
          ...(displayTitle ? { title: displayTitle } : {}),
          ...(data.replyTo ? { reply_to: data.replyTo } : {}),
        });
        return res.data;
      } catch (err: any) {
        if (!this.isWahaFeatureUnsupported(err)) throw err;
        const fallbackText = displayTitle ? `📍 *${displayTitle}*\n${mapsUrl}` : `📍 *Lokasi*\n${mapsUrl}`;
        const fallbackRes = await client.post('/api/sendText', {
          session: targetSession,
          chatId,
          text: fallbackText,
          linkPreview: true,
          ...(data.replyTo ? { reply_to: data.replyTo } : {}),
        });
        return {
          __wahaMeta: {
            usedFallbackText: true,
            fallbackReason: this.extractWahaError(err),
          },
          data: fallbackRes.data,
        };
      }
    });
  }

  /**
   * Share one or more contact cards (vCard) via WAHA (with formatted text fallback if unsupported)
   */
  public async sendContactVcard(
    phone: string,
    contactsList: Array<{
      fullName: string;
      phoneNumber: string;
      organization?: string;
      email?: string;
    }>,
    sessionName?: string,
    replyTo?: string
  ): Promise<WahaSendResult> {
    const formattedContacts = contactsList.map((c) => {
      const norm = normalizePhoneNumber(c.phoneNumber) || c.phoneNumber.replace(/[^\d]/g, '');
      return {
        fullName: c.fullName.trim(),
        organization: c.organization?.trim() || undefined,
        phoneNumber: norm ? `+${norm}` : c.phoneNumber.trim(),
        whatsappId: norm || undefined,
        vcard: buildVCardString(c),
      };
    });

    return this.executeOutboundSend(phone, sessionName, async (client, targetSession, chatId) => {
      try {
        const res = await client.post('/api/sendContactVcard', {
          session: targetSession,
          chatId,
          contacts: formattedContacts,
          ...(replyTo ? { reply_to: replyTo } : {}),
        });
        return res.data;
      } catch (err: any) {
        if (!this.isWahaFeatureUnsupported(err)) throw err;
        const lines = formattedContacts.map(
          (c) => `👤 *${c.fullName}*${c.organization ? ` (${c.organization})` : ''}\n${c.phoneNumber}`
        );
        const fallbackRes = await client.post('/api/sendText', {
          session: targetSession,
          chatId,
          text: lines.join('\n\n'),
          ...(replyTo ? { reply_to: replyTo } : {}),
        });
        return {
          __wahaMeta: {
            usedFallbackText: true,
            fallbackReason: this.extractWahaError(err),
          },
          data: fallbackRes.data,
        };
      }
    });
  }

  /**
   * React to a WhatsApp message with an emoji (empty string removes reaction)
   */
  public async sendReaction(
    phone: string,
    data: { messageId: string; reaction: string },
    sessionName?: string
  ): Promise<WahaSendResult> {
    const cleanMsgId = String(data.messageId || '').trim();
    if (!cleanMsgId) {
      return {
        success: false,
        error: 'ID pesan WAHA tidak ditemukan untuk mengirim reaksi emoji.',
      };
    }
    return this.executeOutboundSend(phone, sessionName, async (client, targetSession) => {
      const payload = {
        session: targetSession,
        messageId: cleanMsgId,
        reaction: data.reaction || '',
      };
      try {
        const res = await client.put('/api/reaction', payload, { timeout: 10000 });
        return res.data;
      } catch (err: any) {
        const st = err?.response?.status;
        if (st === 404 || st === 405 || st === 501) {
          const fallbackRes = await client.post('/api/reaction', payload, { timeout: 10000 });
          return fallbackRes.data;
        }
        throw err;
      }
    });
  }

  /**
   * Download inbound media file securely from configured WAHA server using unmasked X-Api-Key
   */
  public async downloadMedia(
    rawUrl: string
  ): Promise<{ buffer: Buffer; contentType: string; filename?: string }> {
    const clean = String(rawUrl || '').trim();
    if (!clean) {
      const err: any = new Error('URL media WAHA tidak valid');
      err.statusCode = 400;
      throw err;
    }
    const conf = await this.getConfig(false);
    if (!conf.baseUrl) {
      const err: any = new Error('Base URL WAHA belum valid');
      err.statusCode = 400;
      throw err;
    }
    if (conf.mode === 'EXTERNAL') {
      await this.verifyActiveExternalGowsIfNeeded();
    }
    const targetUrl = resolveWahaMediaTargetUrl(clean, conf.baseUrl);
    if (!targetUrl) {
      const err: any = new Error(
        'Hanya media dari server WAHA terkonfigurasi yang diizinkan melalui proxy'
      );
      err.statusCode = 403;
      throw err;
    }
    const headers: Record<string, string> = {};
    if (conf.apiKey && conf.apiKey.trim()) {
      headers['X-Api-Key'] = conf.apiKey.trim();
    }
    const upstream = await axios.get(targetUrl.toString(), {
      headers,
      responseType: 'arraybuffer',
      timeout: 25000,
    });
    const contentType = String(
      upstream.headers?.['content-type'] || 'application/octet-stream'
    ).trim();
    const pathName = targetUrl.pathname.split('/').pop() || undefined;
    return {
      buffer: Buffer.from(upstream.data),
      contentType,
      filename: pathName,
    };
  }

  private async executeSessionAction(
    sessionName: string | undefined,
    runner: (client: AxiosInstance, targetSession: string) => Promise<any>
  ): Promise<WahaSendResult> {
    const resolvedSession = sessionName?.trim() || undefined;
    try {
      const { client, session, ownerPrefix, mode } = await this.getClient();
      let targetSession = resolvedSession
        ? this.resolveOwnedSessionName(resolvedSession, ownerPrefix)
        : session;
      this.assertOwnedSession(targetSession, ownerPrefix);

      if (!resolvedSession && (targetSession === 'default' || !targetSession)) {
        const liveSession = await this.pickLiveWorkingSession(client, ownerPrefix);
        if (liveSession) targetSession = liveSession;
      }

      const runWith = async (sess: string): Promise<WahaSendResult> => {
        const resData = await runner(client, sess);
        return {
          success: true,
          messageId: this.extractOutboundMessageId(resData),
          sessionUsed: sess,
        };
      };

      try {
        return await runWith(targetSession);
      } catch (firstErr: any) {
        const httpStatus = firstErr?.response?.status;
        if (!resolvedSession && (httpStatus === 404 || httpStatus === 422 || mode === 'EXTERNAL')) {
          const fallbackWorking = await this.pickLiveWorkingSession(client, ownerPrefix, targetSession);
          if (fallbackWorking) return await runWith(fallbackWorking);
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
        return { success: false, sessionUsed: targetSession, error: errMsg };
      }
    } catch (err: any) {
      return {
        success: false,
        sessionUsed: resolvedSession,
        error: this.extractWahaError(err),
      };
    }
  }

  /**
   * Post WhatsApp Text Status (Story) via WAHA
   */
  public async sendTextStatus(
    data: {
      text: string;
      backgroundColor?: string;
      font?: number;
      contacts?: string[];
      linkPreview?: boolean;
    },
    sessionName?: string
  ): Promise<WahaSendResult> {
    const cleanContacts = (data.contacts || [])
      .map((c) => toWahaChatId(c))
      .filter(Boolean);
    return this.executeSessionAction(sessionName, async (client, targetSession) => {
      try {
        const res = await client.post(
          `/api/${encodeURIComponent(targetSession)}/status/text`,
          {
            text: data.text,
            backgroundColor: data.backgroundColor || '#38b42f',
            font: typeof data.font === 'number' ? data.font : 1,
            linkPreview: data.linkPreview !== false,
            ...(cleanContacts.length > 0 ? { contacts: cleanContacts } : {}),
          },
          { timeout: 30000 }
        );
        return res.data;
      } catch (err: any) {
        const raw = this.extractWahaError(err).toLowerCase();
        if (cleanContacts.length > 0 && raw.includes('contact')) {
          throw new Error(
            'Engine WAHA aktif tidak mendukung filter daftar kontak pada WhatsApp Status. Gunakan engine GOWS/NOWEB atau pilih "Semua Kontak".'
          );
        }
        throw err;
      }
    });
  }

  /**
   * Post WhatsApp Image, Video, or Voice Status (Story) via WAHA
   */
  public async sendMediaStatus(
    data: {
      mediaType: 'image' | 'video' | 'voice';
      file: { url?: string; base64?: string; mimetype?: string; filename?: string };
      caption?: string;
      backgroundColor?: string;
      contacts?: string[];
    },
    sessionName?: string
  ): Promise<WahaSendResult> {
    const cleanContacts = (data.contacts || [])
      .map((c) => toWahaChatId(c))
      .filter(Boolean);
    const cleanBase64 = data.file.base64
      ? data.file.base64.includes(',')
        ? data.file.base64.split(',')[1]
        : data.file.base64
      : undefined;
    const defaultMime =
      data.mediaType === 'video'
        ? 'video/mp4'
        : data.mediaType === 'voice'
        ? 'audio/ogg; codecs=opus'
        : 'image/jpeg';

    return this.executeSessionAction(sessionName, async (client, targetSession) => {
      const fileObj = cleanBase64
        ? {
            mimetype: data.file.mimetype || defaultMime,
            filename: data.file.filename || `status.${data.mediaType === 'video' ? 'mp4' : data.mediaType === 'voice' ? 'ogg' : 'jpg'}`,
            data: cleanBase64,
          }
        : {
            mimetype: data.file.mimetype || defaultMime,
            url: data.file.url,
          };

      try {
        const res = await client.post(
          `/api/${encodeURIComponent(targetSession)}/status/${data.mediaType}`,
          {
            file: fileObj,
            ...(data.mediaType !== 'voice' && data.caption ? { caption: data.caption } : {}),
            ...(data.backgroundColor ? { backgroundColor: data.backgroundColor } : {}),
            ...(data.mediaType === 'voice' ? { convert: true } : {}),
            ...(cleanContacts.length > 0 ? { contacts: cleanContacts } : {}),
          },
          { timeout: 90000 }
        );
        return res.data;
      } catch (err: any) {
        const raw = this.extractWahaError(err).toLowerCase();
        if (cleanContacts.length > 0 && raw.includes('contact')) {
          throw new Error(
            'Engine WAHA aktif tidak mendukung filter daftar kontak pada WhatsApp Status. Gunakan engine GOWS/NOWEB atau pilih "Semua Kontak".'
          );
        }
        throw err;
      }
    });
  }

  /**
   * Delete a previously posted WhatsApp Status (Story)
   */
  public async deleteStatus(
    statusMessageId: string,
    sessionName?: string
  ): Promise<WahaSendResult> {
    return this.executeSessionAction(sessionName, async (client, targetSession) => {
      const res = await client.post(
        `/api/${encodeURIComponent(targetSession)}/status/delete`,
        { id: statusMessageId, contacts: null },
        { timeout: 15000 }
      );
      return res.data;
    });
  }

  /**
   * Query WAHA for delivery/view receipts on a posted WhatsApp Status message
   */
  public async fetchStatusViewers(
    statusMessageId: string,
    sessionName?: string
  ): Promise<WahaStatusReceipt[]> {
    const cleanId = String(statusMessageId || '').trim();
    if (!cleanId) return [];
    const { client, session, ownerPrefix } = await this.getClient();
    let targetSession = sessionName?.trim()
      ? this.resolveOwnedSessionName(sessionName.trim(), ownerPrefix)
      : session;
    this.assertOwnedSession(targetSession, ownerPrefix);
    if (!sessionName?.trim() && (targetSession === 'default' || !targetSession)) {
      const liveSession = await this.pickLiveWorkingSession(client, ownerPrefix);
      if (liveSession) targetSession = liveSession;
    }

    const stanzaMatch = cleanId.match(/status@broadcast_([^_]+)/i);
    const shortStanza =
      stanzaMatch?.[1] ||
      (cleanId.includes('_') ? cleanId.split('_').pop() || cleanId : cleanId);

    try {
      const directRes = await client.get(
        `/api/${encodeURIComponent(targetSession)}/chats/status%40broadcast/messages/${encodeURIComponent(cleanId)}`,
        { timeout: 8000 }
      );
      const parsed = extractStatusReceiptsFromWahaMessage(directRes.data);
      if (parsed.length > 0) return parsed;
    } catch {
      // Fallback to listing recent status@broadcast messages below
    }

    try {
      const listRes = await client.get(
        `/api/${encodeURIComponent(targetSession)}/chats/status%40broadcast/messages`,
        { params: { limit: 30 }, timeout: 8000 }
      );
      const list: any[] = Array.isArray(listRes.data) ? listRes.data : [];
      const matched = list.find((m) => {
        const candId = String(m?.id?._serialized || m?.id?.id || m?.id || m?.key?.id || '');
        return candId === cleanId || (shortStanza && candId.includes(shortStanza));
      });
      if (matched) {
        return extractStatusReceiptsFromWahaMessage(matched);
      }
    } catch {
      // Non-fatal: webhook acks remain source of truth
    }
    return [];
  }

  private async resolveReadableSession(sessionName?: string): Promise<{
    client: AxiosInstance;
    targetSession: string;
  }> {
    const { client, session, ownerPrefix } = await this.getClient();
    let targetSession = sessionName?.trim()
      ? this.resolveOwnedSessionName(sessionName.trim(), ownerPrefix)
      : session;
    this.assertOwnedSession(targetSession, ownerPrefix);
    if (!sessionName?.trim() && (targetSession === 'default' || !targetSession)) {
      const liveSession = await this.pickLiveWorkingSession(client, ownerPrefix);
      if (liveSession) targetSession = liveSession;
    }
    return { client, targetSession };
  }

  /**
   * Capture WhatsApp profile (display name, about & photo URL) of a personal contact or group via WAHA
   */
  public async getWhatsAppProfile(
    jid: string,
    sessionName?: string
  ): Promise<WahaProfileInfo | null> {
    const rawJid = String(jid || '').trim();
    if (!rawJid) return null;
    const isGroup = rawJid.toLowerCase().endsWith('@g.us');
    const digits = rawJid.replace(/\D/g, '');
    const cleanJid = rawJid.includes('@') ? rawJid : digits ? `${digits}@c.us` : '';
    if (!cleanJid) return null;

    const pickString = (...candidates: unknown[]): string | undefined => {
      for (const c of candidates) {
        if (typeof c === 'string' && c.trim()) return c.trim();
      }
      return undefined;
    };
    const pickUrl = (data: any): string | undefined => {
      const found = pickString(
        data?.profilePictureURL,
        data?.profilePictureUrl,
        data?.profilePicture,
        data?.url,
        data?.imgUrl,
        data?.eurl,
        typeof data === 'string' ? data : undefined
      );
      return found && /^(https?:\/\/|\/)/i.test(found) ? found : undefined;
    };

    try {
      const { client, targetSession } = await this.resolveReadableSession(sessionName);
      const encSession = encodeURIComponent(targetSession);
      const encJid = encodeURIComponent(cleanJid);
      const result: WahaProfileInfo = { jid: cleanJid, isGroup };

      if (isGroup) {
        const info = await this.getGroupInfo(cleanJid, targetSession).catch(() => null);
        if (info?.subject) result.name = info.subject;
        if (info?.description) result.about = info.description;
        for (const endpoint of [
          `/api/${encSession}/groups/${encJid}/picture`,
          `/api/${encSession}/chats/${encJid}/picture`,
        ]) {
          const res = await client.get(endpoint, { timeout: 8000 }).catch(() => null);
          const url = pickUrl(res?.data);
          if (url) {
            result.pictureUrl = url;
            break;
          }
        }
      } else {
        const params = { session: targetSession, contactId: cleanJid };
        const contactRes = await client
          .get('/api/contacts', { params, timeout: 8000 })
          .catch(() => null);
        const contactData = contactRes?.data;
        result.name = pickString(
          contactData?.name,
          contactData?.Name,
          contactData?.fullName,
          contactData?.FullName,
          contactData?.shortName,
          contactData?.BusinessName
        );
        result.pushName = pickString(
          contactData?.pushname,
          contactData?.pushName,
          contactData?.PushName,
          contactData?.notifyName
        );

        const picRes = await client
          .get('/api/contacts/profile-picture', { params, timeout: 8000 })
          .catch(() => null);
        let url = pickUrl(picRes?.data);
        if (!url) {
          const chatPicRes = await client
            .get(`/api/${encSession}/chats/${encJid}/picture`, { timeout: 8000 })
            .catch(() => null);
          url = pickUrl(chatPicRes?.data);
        }
        if (url) result.pictureUrl = url;

        const aboutRes = await client
          .get('/api/contacts/about', { params, timeout: 8000 })
          .catch(() => null);
        result.about = pickString(aboutRes?.data?.about, aboutRes?.data?.status);
      }

      return result;
    } catch {
      return null;
    }
  }

  /**
   * Download a WhatsApp profile photo from WhatsApp CDN or the configured WAHA server only
   */
  public async downloadProfilePicture(
    rawUrl: string
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const clean = String(rawUrl || '').trim();
    if (!clean) return null;
    try {
      let parsed: URL | null = null;
      try {
        parsed = new URL(clean);
      } catch {
        parsed = null;
      }
      if (parsed) {
        const host = parsed.hostname.toLowerCase();
        const isWhatsappCdn =
          parsed.protocol === 'https:' &&
          (/(^|\.)whatsapp\.net$/.test(host) ||
            /(^|\.)whatsapp\.com$/.test(host) ||
            /(^|\.)fbcdn\.net$/.test(host));
        if (isWhatsappCdn) {
          const res = await axios.get(parsed.toString(), {
            responseType: 'arraybuffer',
            timeout: 12000,
            maxContentLength: 3 * 1024 * 1024,
          });
          const contentType = String(res.headers?.['content-type'] || 'image/jpeg').trim();
          if (!contentType.toLowerCase().startsWith('image/')) return null;
          return { buffer: Buffer.from(res.data), contentType };
        }
      }
      const downloaded = await this.downloadMedia(clean);
      if (!downloaded.contentType.toLowerCase().startsWith('image/')) return null;
      return { buffer: downloaded.buffer, contentType: downloaded.contentType };
    } catch {
      return null;
    }
  }

  private extractWahaArrayPayload(payload: any): any[] | null {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.contacts)) return payload.contacts;
    if (Array.isArray(payload?.data)) return payload.data;
    return null;
  }

  private getRawWahaContactKey(item: any): string {
    if (!item || typeof item !== 'object') return String(item || '');
    const primary = String(
      item?.id?._serialized ||
        item?.id?.id ||
        item?.id ||
        item?.jid ||
        item?.JID ||
        item?.lid ||
        item?.number ||
        item?.phoneNumber ||
        item?.pn ||
        ''
    ).trim();
    return primary || JSON.stringify(item);
  }

  private async fetchPaginatedWahaList(
    client: AxiosInstance,
    url: string,
    baseParams: Record<string, any>,
    pageSize = 1000,
    timeoutMs = 25000,
    maxPages = 50
  ): Promise<any[] | null> {
    const collected: any[] = [];
    const seenKeys = new Set<string>();

    for (let page = 0; page < maxPages; page++) {
      const offset = collected.length;
      const params: Record<string, any> = {
        ...baseParams,
        limit: pageSize,
        ...(page > 0 ? { offset } : {}),
      };
      let resData: any;
      try {
        const res = await client.get(url, { params, timeout: timeoutMs });
        resData = res.data;
      } catch (err: any) {
        if (page === 0) {
          throw err;
        }
        break;
      }

      const batch = this.extractWahaArrayPayload(resData);
      if (!batch) {
        return page === 0 ? null : collected;
      }
      if (batch.length === 0) {
        break;
      }

      let addedInBatch = 0;
      for (const item of batch) {
        const key = this.getRawWahaContactKey(item);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        collected.push(item);
        addedInBatch++;
      }

      // If endpoint ignored offset and returned duplicates, or batch is clearly below any WAHA page cap (<100)
      if (addedInBatch === 0 || batch.length < 100) {
        break;
      }
    }

    return collected;
  }

  private async fetchLidPhoneLookup(client: AxiosInstance, session: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    try {
      const list =
        (await this.fetchPaginatedWahaList(
          client,
          `/api/${encodeURIComponent(session)}/lids`,
          {},
          1000,
          10000
        )) || [];
      for (const item of list) {
        const lid = String(item?.lid || '').trim();
        const phone = extractValidNormalizedPhone(item?.pn || item?.phoneNumber);
        if (lid && phone) map.set(lid, phone);
      }
    } catch {
      // Best effort: engines that don't use @lid or omit endpoint simply skip
    }
    return map;
  }

  /**
   * Fetch WhatsApp contact book from WAHA for CRM synchronization
   */
  public async fetchAllContacts(
    sessionName?: string,
    limit = 1000
  ): Promise<{ contacts: WahaContactRecord[]; sessionUsed: string }> {
    const { client, targetSession } = await this.resolveReadableSession(sessionName);
    const endpoints: Array<{ url: string; params: Record<string, any> }> = [
      { url: '/api/contacts/all', params: { session: targetSession } },
      { url: `/api/${encodeURIComponent(targetSession)}/contacts/all`, params: {} },
      { url: '/api/contacts', params: { session: targetSession } },
    ];

    let rawList: any[] | null = null;
    let winningEndpointUrl = '';
    let lastError: any = null;
    for (const ep of endpoints) {
      try {
        const collected = await this.fetchPaginatedWahaList(client, ep.url, ep.params, limit, 25000);
        if (collected) {
          rawList = collected;
          winningEndpointUrl = ep.url;
          break;
        }
      } catch (err: any) {
        lastError = err;
        const st = err?.response?.status;
        if (st === 401 || st === 403) throw new Error(this.extractWahaError(err));
      }
    }

    if (!rawList) {
      throw new Error(this.extractWahaError(lastError) || 'Gagal mengambil daftar kontak dari WAHA');
    }

    // Some WAHA engines cap /contacts/all at 500/1000/2000 without honoring offset;
    // when that happens, also sweep /api/contacts paginated to capture remaining contacts.
    if (
      winningEndpointUrl !== '/api/contacts' &&
      rawList.length >= 100 &&
      rawList.length % 100 === 0
    ) {
      try {
        const fallbackPaged = await this.fetchPaginatedWahaList(
          client,
          '/api/contacts',
          { session: targetSession },
          limit,
          25000
        );
        if (fallbackPaged && fallbackPaged.length > 0) {
          const seenKeys = new Set(rawList.map((item) => this.getRawWahaContactKey(item)));
          for (const item of fallbackPaged) {
            const key = this.getRawWahaContactKey(item);
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              rawList.push(item);
            }
          }
        }
      } catch {
        // Ignore fallback probe error when primary list succeeded
      }
    }

    const needsLidMap = rawList.some((item) => {
      const idVal = String(item?.id?._serialized || item?.id || '').toLowerCase();
      return idVal.endsWith('@lid') && !item?.number && !item?.phoneNumber && !item?.pn;
    });
    const lidMap = needsLidMap ? await this.fetchLidPhoneLookup(client, targetSession) : undefined;

    return {
      contacts: normalizeWahaContactEntries(rawList, lidMap),
      sessionUsed: targetSession,
    };
  }

  /**
   * Privacy, auto-read, and online presence configuration (General & per-session)
   */
  public async getPrivacyConfig(companyId?: string | null): Promise<WahaPrivacyConfig> {
    const cid = getActiveCompanyId(companyId);
    const map = await getCompanySettingMap(cid);
    return parseWahaPrivacyConfig(map['waha_privacy_config']);
  }

  public async savePrivacyConfig(
    payload: Partial<WahaPrivacyConfig>,
    companyId?: string | null
  ): Promise<WahaPrivacyConfig> {
    const cid = getActiveCompanyId(companyId);
    const current = await this.getPrivacyConfig(cid);
    const next: WahaPrivacyConfig = {
      general: payload.general
        ? sanitizeWahaPrivacyRule(payload.general, current.general)
        : current.general,
      sessions:
        payload.sessions !== undefined
          ? parseWahaPrivacyConfig({ general: current.general, sessions: payload.sessions }).sessions
          : current.sessions,
    };
    await upsertCompanySetting('waha_privacy_config', JSON.stringify(next), cid);
    void this.syncAllSessionsPrivacyToWaha(next, cid).catch(() => {});
    return next;
  }

  public async resolveSessionPrivacy(
    sessionName?: string | null,
    companyId?: string | null
  ): Promise<WahaSessionPrivacyRule> {
    const cfg = await this.getPrivacyConfig(companyId);
    return resolveSessionPrivacyRule(cfg, sessionName);
  }

  public async setSessionPresence(
    sessionName: string,
    online: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const cfg = await this.getConfig(false);
      if (cfg.mode === 'EXTERNAL') {
        await this.assertExternalGowsEngine({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey });
      }
      const client = this.createHttpClient(cfg.baseUrl, cfg.apiKey, 6000);
      const presenceValue = online ? 'available' : 'unavailable';
      try {
        await client.post(
          `/api/${encodeURIComponent(sessionName)}/presence`,
          { presence: presenceValue },
          { timeout: 6000 }
        );
        return { success: true };
      } catch (err: any) {
        const st = err?.response?.status;
        if (st === 404 || st === 405 || st === 501) {
          await client.post(
            '/api/presence',
            { session: sessionName, presence: presenceValue },
            { timeout: 6000 }
          );
          return { success: true };
        }
        throw err;
      }
    } catch (err: any) {
      return { success: false, error: this.extractWahaError(err) };
    }
  }

  public async syncSessionPrivacyToWaha(
    sessionName: string,
    rule: WahaSessionPrivacyRule
  ): Promise<void> {
    await this.setSessionPresence(sessionName, rule.sendOnlinePresence).catch(() => {});
    try {
      const cfg = await this.getConfig(false);
      const client = this.createHttpClient(cfg.baseUrl, cfg.apiKey, 5000);
      // Best-effort WAHA WhatsApp privacy settings sync (readreceipts: 'all' | 'none', online: 'all' | 'match_last_seen')
      await client
        .put(
          `/api/${encodeURIComponent(sessionName)}/profile/privacy`,
          {
            readreceipts: rule.readReceipts ? 'all' : 'none',
            online: rule.sendOnlinePresence ? 'all' : 'match_last_seen',
          },
          { timeout: 4000 }
        )
        .catch(() => {});
    } catch {
      // Optional WAHA privacy endpoint may vary by WAHA version
    }
  }

  public async syncAllSessionsPrivacyToWaha(
    privacyConfig?: WahaPrivacyConfig,
    companyId?: string | null
  ): Promise<void> {
    const cfg = privacyConfig || (await this.getPrivacyConfig(companyId));
    const sessionsRes = await this.listSessions().catch(() => ({
      sessions: [],
      activeSession: '',
    }));
    const sessionsList = Array.isArray(sessionsRes?.sessions) ? sessionsRes.sessions : [];
    for (const s of sessionsList) {
      if (s.status !== 'WORKING') continue;
      const rule = resolveSessionPrivacyRule(cfg, s.name);
      await this.syncSessionPrivacyToWaha(s.name, rule);
    }
  }

  /**
   * Fetch WhatsApp group metadata (subject & participants) from WAHA
   * Calls both /groups/{id} and /groups/{id}/participants to ensure complete member list
   */
  public async getGroupInfo(
    groupJid: string,
    sessionName?: string
  ): Promise<WahaGroupInfo | null> {
    const cleanJid = String(groupJid || '').trim();
    if (!cleanJid || !cleanJid.toLowerCase().endsWith('@g.us')) return null;

    try {
      const { client, targetSession } = await this.resolveReadableSession(sessionName);
      const encodedSession = encodeURIComponent(targetSession);
      const encodedGroup = encodeURIComponent(cleanJid);

      let groupData: any = null;
      try {
        const res = await client.get(`/api/${encodedSession}/groups/${encodedGroup}`, {
          timeout: 10000,
        });
        if (res?.data && typeof res.data === 'object') {
          groupData = res.data;
        }
      } catch {
        // Group metadata endpoint may fail while /participants still succeeds
      }

      let endpointParticipants: any[] = [];
      try {
        const pRes = await client.get(`/api/${encodedSession}/groups/${encodedGroup}/participants`, {
          timeout: 10000,
        });
        const pData = pRes?.data;
        if (Array.isArray(pData)) {
          endpointParticipants = pData;
        } else if (Array.isArray(pData?.participants)) {
          endpointParticipants = pData.participants;
        } else if (Array.isArray(pData?.Participants)) {
          endpointParticipants = pData.Participants;
        }
      } catch (err: any) {
        if (err?.response?.status === 404) {
          try {
            const pV2Res = await client.get(
              `/api/${encodedSession}/groups/${encodedGroup}/participants/v2`,
              { timeout: 10000 }
            );
            const pV2Data = pV2Res?.data;
            if (Array.isArray(pV2Data)) {
              endpointParticipants = pV2Data;
            } else if (Array.isArray(pV2Data?.participants)) {
              endpointParticipants = pV2Data.participants;
            }
          } catch {
            // ignore fallback 404
          }
        }
      }

      if (!groupData && endpointParticipants.length === 0) {
        return null;
      }

      const baseParticipants: any[] = Array.isArray(groupData?.participants)
        ? groupData.participants
        : Array.isArray(groupData?.Participants)
        ? groupData.Participants
        : Array.isArray(groupData?.groupMetadata?.participants)
        ? groupData.groupMetadata.participants
        : [];
      const mergedParticipants = [...baseParticipants, ...endpointParticipants];

      const hasLidOnly = mergedParticipants.some((p: any) => {
        const jid = String(p?.id?._serialized || p?.id?.id || p?.id || p?.JID || p?.jid || '').toLowerCase();
        return jid.endsWith('@lid') && !p?.phoneNumber && !p?.PhoneNumber && !p?.pn && !p?.PN;
      });
      const lidMap = hasLidOnly ? await this.fetchLidPhoneLookup(client, targetSession) : undefined;
      return normalizeWahaGroupInfo(
        cleanJid,
        {
          ...(groupData && typeof groupData === 'object' ? groupData : {}),
          participants: mergedParticipants,
        },
        lidMap
      );
    } catch {
      return null;
    }
  }

  /**
   * Update Group Subject (Name)
   */
  public async updateGroupSubject(
    groupJid: string,
    subject: string,
    sessionName?: string
  ): Promise<{ success: boolean; error?: string }> {
    const cleanJid = String(groupJid || '').trim();
    const cleanSubject = String(subject || '').trim();
    if (!cleanJid || !cleanJid.toLowerCase().endsWith('@g.us')) {
      return { success: false, error: 'Target bukan JID grup WhatsApp valid.' };
    }
    if (!cleanSubject) {
      return { success: false, error: 'Nama grup tidak boleh kosong.' };
    }
    try {
      const { client, targetSession } = await this.resolveReadableSession(sessionName);
      const encodedSession = encodeURIComponent(targetSession);
      const encodedGroup = encodeURIComponent(cleanJid);
      await client.put(
        `/api/${encodedSession}/groups/${encodedGroup}/subject`,
        { subject: cleanSubject },
        { timeout: 10000 }
      );
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err?.response?.data?.message || err?.message || 'Gagal mengubah nama grup WhatsApp.',
      };
    }
  }

  /**
   * Update Group Description
   */
  public async updateGroupDescription(
    groupJid: string,
    description: string,
    sessionName?: string
  ): Promise<{ success: boolean; error?: string }> {
    const cleanJid = String(groupJid || '').trim();
    if (!cleanJid || !cleanJid.toLowerCase().endsWith('@g.us')) {
      return { success: false, error: 'Target bukan JID grup WhatsApp valid.' };
    }
    try {
      const { client, targetSession } = await this.resolveReadableSession(sessionName);
      const encodedSession = encodeURIComponent(targetSession);
      const encodedGroup = encodeURIComponent(cleanJid);
      await client.put(
        `/api/${encodedSession}/groups/${encodedGroup}/description`,
        { description: String(description || '').trim() },
        { timeout: 10000 }
      );
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err?.response?.data?.message || err?.message || 'Gagal mengubah deskripsi grup WhatsApp.',
      };
    }
  }

  /**
   * Update Group Picture (Avatar)
   */
  public async updateGroupPicture(
    groupJid: string,
    fileUrlOrBase64: string,
    sessionName?: string
  ): Promise<{ success: boolean; error?: string }> {
    const cleanJid = String(groupJid || '').trim();
    if (!cleanJid || !cleanJid.toLowerCase().endsWith('@g.us')) {
      return { success: false, error: 'Target bukan JID grup WhatsApp valid.' };
    }
    try {
      const { client, targetSession } = await this.resolveReadableSession(sessionName);
      const encodedSession = encodeURIComponent(targetSession);
      const encodedGroup = encodeURIComponent(cleanJid);
      const isUrl = /^https?:\/\//i.test(fileUrlOrBase64);
      const payload = isUrl
        ? { file: { url: fileUrlOrBase64 } }
        : { file: { data: fileUrlOrBase64 } };
      await client.put(
        `/api/${encodedSession}/groups/${encodedGroup}/picture`,
        payload,
        { timeout: 15000 }
      );
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err?.response?.data?.message || err?.message || 'Gagal memperbarui foto profil grup WhatsApp.',
      };
    }
  }

  /**
   * Get Group Invite Code / Link
   */
  public async getGroupInviteCode(
    groupJid: string,
    sessionName?: string
  ): Promise<{ success: boolean; code?: string; link?: string; error?: string }> {
    const cleanJid = String(groupJid || '').trim();
    if (!cleanJid || !cleanJid.toLowerCase().endsWith('@g.us')) {
      return { success: false, error: 'Target bukan JID grup WhatsApp valid.' };
    }
    try {
      const { client, targetSession } = await this.resolveReadableSession(sessionName);
      const encodedSession = encodeURIComponent(targetSession);
      const encodedGroup = encodeURIComponent(cleanJid);
      const res = await client.get(`/api/${encodedSession}/groups/${encodedGroup}/invite-code`, {
        timeout: 10000,
      });
      const code = String(res?.data?.code || res?.data || '').trim();
      const link = code ? (code.startsWith('http') ? code : `https://chat.whatsapp.com/${code}`) : undefined;
      return { success: true, code, link };
    } catch (err: any) {
      return {
        success: false,
        error: err?.response?.data?.message || err?.message || 'Gagal mengambil tautan undangan grup.',
      };
    }
  }

  /**
   * Revoke Group Invite Code
   */
  public async revokeGroupInviteCode(
    groupJid: string,
    sessionName?: string
  ): Promise<{ success: boolean; code?: string; link?: string; error?: string }> {
    const cleanJid = String(groupJid || '').trim();
    if (!cleanJid || !cleanJid.toLowerCase().endsWith('@g.us')) {
      return { success: false, error: 'Target bukan JID grup WhatsApp valid.' };
    }
    try {
      const { client, targetSession } = await this.resolveReadableSession(sessionName);
      const encodedSession = encodeURIComponent(targetSession);
      const encodedGroup = encodeURIComponent(cleanJid);
      const res = await client.post(`/api/${encodedSession}/groups/${encodedGroup}/invite-code/revoke`, {}, {
        timeout: 10000,
      });
      const code = String(res?.data?.code || res?.data || '').trim();
      const link = code ? (code.startsWith('http') ? code : `https://chat.whatsapp.com/${code}`) : undefined;
      return { success: true, code, link };
    } catch (err: any) {
      return {
        success: false,
        error: err?.response?.data?.message || err?.message || 'Gagal mengatur ulang tautan undangan grup.',
      };
    }
  }

  /**
   * Add Participants to Group
   */
  public async addGroupParticipants(
    groupJid: string,
    participants: string[],
    sessionName?: string
  ): Promise<{ success: boolean; error?: string }> {
    const cleanJid = String(groupJid || '').trim();
    if (!cleanJid || !cleanJid.toLowerCase().endsWith('@g.us')) {
      return { success: false, error: 'Target bukan JID grup WhatsApp valid.' };
    }
    const cleanList = participants
      .map((p) => {
        const trimmed = String(p || '').trim();
        if (!trimmed) return '';
        if (isPhoneWahaJid(trimmed) || trimmed.endsWith('@lid')) return trimmed;
        return toWahaChatId(trimmed);
      })
      .filter(Boolean);
    if (cleanList.length === 0) {
      return { success: false, error: 'Daftar nomor atau JID anggota tidak boleh kosong.' };
    }
    try {
      const { client, targetSession } = await this.resolveReadableSession(sessionName);
      const encodedSession = encodeURIComponent(targetSession);
      const encodedGroup = encodeURIComponent(cleanJid);
      await client.post(
        `/api/${encodedSession}/groups/${encodedGroup}/participants/add`,
        { participants: cleanList.map((id) => ({ id })) },
        { timeout: 15000 }
      );
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err?.response?.data?.message || err?.message || 'Gagal menambahkan anggota ke grup WhatsApp.',
      };
    }
  }
}

export const wahaService = WahaService.getInstance();
