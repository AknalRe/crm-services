import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { and, desc, eq, inArray, like, lt, ne, or, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  campaignRecipients,
  campaigns,
  chatMessages,
  contactIdentities,
  contacts,
  conversations,
  scheduledPosts,
} from '../db/schema';
import { upsertWhatsappStatusView } from '../services/post.service';
import {
  parseVCardString,
  WahaLocationData,
  wahaService,
  WahaSharedContactItem,
} from '../services/waha.service';
import { licenseService } from '../services/license.service';
import { liveEvents } from '../services/events.service';
import { runWithCompany } from '../services/tenantContext';
import {
  fromWahaChatId,
  isPersonalWahaJid,
  isPhoneWahaJid,
  normalizePhoneNumber,
} from '../services/phone.utils';
import { handleInboundAutomation } from '../services/automation.service';
import { getRequestCompanyId, requirePermission } from './auth';
import { saveBase64MediaFile, saveMediaBufferFile } from './media';
import { syncWhatsAppProfile } from '../services/profile.service';
import crypto from 'crypto';

const webhookKeyLocks = new Map<string, Promise<void>>();

async function withWebhookKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = webhookKeyLocks.get(key) || Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((res) => {
    release = res;
  });
  const chained = prev.then(() => gate);
  webhookKeyLocks.set(key, chained);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (webhookKeyLocks.get(key) === chained) {
      webhookKeyLocks.delete(key);
    }
  }
}

function isPgUniqueViolation(err: any): boolean {
  const code = String(err?.code || err?.cause?.code || '');
  const msg = String(err?.message || err?.cause?.message || '').toLowerCase();
  return code === '23505' || msg.includes('duplicate key value violates unique constraint');
}

export function resolveRequestPublicBase(req: FastifyRequest): string | null {
  const fwdHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const fwdProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const rawPrefix = String(req.headers['x-forwarded-prefix'] || '').split(',')[0].trim();
  let appPrefix =
    rawPrefix && /^\/app\/[^/]+/i.test(rawPrefix) ? rawPrefix.replace(/\/+$/, '') : '';

  if (fwdHost) {
    const proto = fwdProto || (req.protocol === 'https' ? 'https' : 'http');
    if (!appPrefix) {
      const ref = String(req.headers.referer || '').trim();
      const match = ref.match(/https?:\/\/[^/]+(\/app\/[^/]+)/i);
      if (match) appPrefix = match[1];
    }
    return `${proto}://${fwdHost}${appPrefix}`;
  }

  const referer = String(req.headers.referer || '').trim();
  if (referer) {
    try {
      const u = new URL(referer);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        const match = u.pathname.match(/^(\/app\/[^/]+)/i);
        return `${u.origin}${match ? match[1] : appPrefix}`;
      }
    } catch {
      // ignore invalid referer
    }
  }

  const host = String(req.headers.host || '').trim();
  if (!host) return null;
  const proto = fwdProto || (req.protocol === 'https' ? 'https' : 'http');
  return `${proto}://${host}${appPrefix}`;
}

export function isWahaFromMe(payload: any): boolean {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.fromMe === true || payload.fromMe === 'true') return true;
  if (payload._data?.key?.fromMe === true || payload._data?.Info?.IsFromMe === true) return true;
  if (typeof payload.id === 'string' && payload.id.startsWith('true_')) return true;
  if (typeof payload.id?._serialized === 'string' && payload.id._serialized.startsWith('true_')) {
    return true;
  }
  if (payload.id?.fromMe === true) return true;
  return false;
}

export function detectWahaOutboundOrigin(payload: any): {
  sentVia: 'WHATSAPP_WEB' | 'WHATSAPP_PHONE' | 'WHATSAPP_DEVICE' | 'WHATSAPP_API';
  label: string;
  deviceType: string;
} {
  const rawSource = String(payload?.source || '').trim().toLowerCase();
  const rawDevice = String(
    payload?.deviceType ||
      payload?._data?.deviceType ||
      payload?._data?.Info?.DeviceType ||
      payload?._data?.Info?.Platform ||
      payload?._data?.platform ||
      ''
  )
    .trim()
    .toLowerCase();

  const rawId = String(
    payload?._data?.Info?.ID ||
      payload?.id?.id ||
      payload?._data?.key?.id ||
      (typeof payload?.id === 'string' ? payload.id : payload?.id?._serialized || '')
  ).trim();
  const stanzaId = rawId.includes('_') ? rawId.split('_').pop() || rawId : rawId;

  if (/android/.test(rawDevice)) {
    return { sentVia: 'WHATSAPP_PHONE', label: 'WhatsApp HP (Android)', deviceType: rawDevice };
  }
  if (/ios|iphone|ipad/.test(rawDevice)) {
    return { sentVia: 'WHATSAPP_PHONE', label: 'WhatsApp HP (iOS)', deviceType: rawDevice };
  }
  if (/web|desktop|mac|win|linux|chrome|edge|firefox|safari/.test(rawDevice)) {
    return { sentVia: 'WHATSAPP_WEB', label: 'WhatsApp Web', deviceType: rawDevice };
  }
  if (/^3A[0-9A-F]{12,}$/i.test(stanzaId)) {
    return { sentVia: 'WHATSAPP_PHONE', label: 'WhatsApp HP (iOS)', deviceType: 'ios' };
  }
  if (/^3EB0[0-9A-F]{10,}$/i.test(stanzaId)) {
    return rawSource === 'app'
      ? { sentVia: 'WHATSAPP_WEB', label: 'WhatsApp Web / Tertaut', deviceType: 'web' }
      : { sentVia: 'WHATSAPP_DEVICE', label: 'WhatsApp Web / HP', deviceType: rawSource || 'web' };
  }
  if (rawSource === 'api') {
    return { sentVia: 'WHATSAPP_API', label: 'WAHA API Eksternal', deviceType: 'api' };
  }
  return {
    sentVia: 'WHATSAPP_DEVICE',
    label: 'WhatsApp HP / Web',
    deviceType: rawSource || 'device',
  };
}

export function extractWahaContextInfo(payload: any): Record<string, any> | null {
  if (!payload || typeof payload !== 'object') return null;
  const containers = [
    payload?._data?.message,
    payload?._data?.Message,
    payload?._data?.Info?.Message,
    payload?._data,
    payload,
  ];
  const msgKeys = [
    'extendedTextMessage',
    'imageMessage',
    'videoMessage',
    'documentMessage',
    'documentWithCaptionMessage',
    'audioMessage',
    'stickerMessage',
    'contactMessage',
    'contactsArrayMessage',
    'locationMessage',
    'liveLocationMessage',
    'buttonsResponseMessage',
    'listResponseMessage',
    'templateButtonReplyMessage',
  ];
  for (const container of containers) {
    if (!container || typeof container !== 'object') continue;
    const nestedViewOnce =
      container?.viewOnceMessage?.message ||
      container?.viewOnceMessageV2?.message ||
      container?.viewOnceMessageV2Extension?.message;
    if (container.contextInfo && typeof container.contextInfo === 'object') {
      return container.contextInfo;
    }
    for (const key of msgKeys) {
      const inner = container[key] || nestedViewOnce?.[key];
      if (inner?.contextInfo && typeof inner.contextInfo === 'object') {
        return inner.contextInfo;
      }
      if (inner?.message?.documentMessage?.contextInfo) {
        return inner.message.documentMessage.contextInfo;
      }
    }
  }
  return null;
}

export function extractWahaForwardingMeta(payload: any): {
  forwarded: boolean;
  forwardingScore: number;
  forwardedFromChannel?: string;
} | null {
  const ctxInfo = extractWahaContextInfo(payload);
  const rawScore = Number(
    ctxInfo?.forwardingScore ??
      payload?.forwardingScore ??
      payload?._data?.forwardingScore ??
      payload?._data?.Info?.ForwardingScore ??
      0
  );
  const score = Number.isFinite(rawScore) && rawScore > 0 ? Math.floor(rawScore) : 0;
  const newsletterInfo =
    ctxInfo?.forwardedNewsletterMessageInfo ||
    payload?._data?.forwardedNewsletterMessageInfo ||
    null;
  const newsletterName = String(
    newsletterInfo?.newsletterName || newsletterInfo?.name || ''
  ).trim();
  const isForwarded = Boolean(
    ctxInfo?.isForwarded === true ||
      payload?.isForwarded === true ||
      payload?._data?.isForwarded === true ||
      payload?._data?.Info?.IsForwarded === true ||
      score > 0 ||
      newsletterInfo
  );
  if (!isForwarded) return null;
  return {
    forwarded: true,
    forwardingScore: score > 0 ? score : 1,
    ...(newsletterName ? { forwardedFromChannel: newsletterName } : {}),
  };
}

export function isGenericDisplayName(name?: string | null): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (
    /^(pelanggan|anggota grup|tim cs|whatsapp langsung|whatsapp user|kontak baru|peserta|pesan sebelumnya|tanpa nama|unknown)$/i.test(
      trimmed
    )
  ) {
    return true;
  }
  if (/^kontak\s+\+?\d{3,16}$/i.test(trimmed)) return true;
  if (/@(lid|c\.us|s\.whatsapp\.net|g\.us)$/i.test(trimmed)) return true;
  if (/^\+?\d{6,16}$/.test(trimmed.replace(/[\s-]/g, ''))) return true;
  return false;
}

// Bind a WhatsApp group JID to exactly one CRM contact even when several sessions receive the same group message at once
async function claimGroupIdentity(params: {
  companyId: string;
  groupJid: string;
  contact: typeof contacts.$inferSelect;
  name: string;
  now: Date;
}): Promise<typeof contacts.$inferSelect> {
  const { companyId, groupJid, contact, name, now } = params;
  await db
    .insert(contactIdentities)
    .values({
      id: crypto.randomUUID(),
      companyId,
      contactId: contact.id,
      channel: 'WHATSAPP',
      externalId: groupJid,
      handle: name,
      createdAt: now,
    })
    .onConflictDoNothing()
    .catch(() => {});

  const owner = await db
    .select()
    .from(contactIdentities)
    .where(
      and(
        eq(contactIdentities.companyId, companyId),
        eq(contactIdentities.channel, 'WHATSAPP'),
        eq(contactIdentities.externalId, groupJid)
      )
    )
    .limit(1);
  if (!owner[0] || owner[0].contactId === contact.id) return contact;

  const winner = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, owner[0].contactId), eq(contacts.companyId, companyId)))
    .limit(1);
  if (!winner[0]) return contact;
  await db
    .delete(contacts)
    .where(and(eq(contacts.id, contact.id), eq(contacts.companyId, companyId)))
    .catch(() => {});
  return winner[0];
}

export function pickSessionScopedMessage<T extends { wahaSession?: string | null }>(
  rows: T[],
  session?: string | null
): T | undefined {
  if (!rows.length) return undefined;
  const clean = String(session || '').trim().toLowerCase();
  if (clean) {
    const match = rows.find((r) => String(r.wahaSession || '').trim().toLowerCase() === clean);
    if (match) return match;
  }
  return rows[0];
}

export function pickBestContactDisplayName(
  contactName?: string | null,
  pushName?: string | null,
  fallbackPhone?: string | null
): string | null {
  const cleanContact = contactName?.trim() || '';
  const cleanPush = pushName?.trim() || '';
  if (cleanContact && !isGenericDisplayName(cleanContact)) return cleanContact;
  if (cleanPush && !isGenericDisplayName(cleanPush)) return cleanPush;
  if (cleanContact) return cleanContact;
  if (cleanPush) return cleanPush;
  const norm = normalizePhoneNumber(fallbackPhone || '');
  return norm ? `+${norm}` : null;
}

export interface InboundWahaRichData {
  messageType: 'TEXT' | 'MEDIA' | 'LOCATION' | 'CONTACT' | 'POLL' | 'BUTTONS';
  body: string;
  metadata: Record<string, any> | null;
  reaction?: {
    targetMessageId: string;
    emoji: string;
  } | null;
  revokedTargetId?: string | null;
}

export function extractInboundWahaRichData(
  payload: any,
  mediaMeta: InboundWahaMediaMeta,
  fallbackText?: string
): InboundWahaRichData {
  const base = extractBaseInboundWahaRichData(payload, mediaMeta, fallbackText);
  if (!base.reaction && !base.revokedTargetId) {
    const fwdMeta = extractWahaForwardingMeta(payload);
    if (fwdMeta) {
      base.metadata = { ...(base.metadata || {}), ...fwdMeta };
    }
  }
  return base;
}

function extractBaseInboundWahaRichData(
  payload: any,
  mediaMeta: InboundWahaMediaMeta,
  fallbackText?: string
): InboundWahaRichData {
  const msg = payload?._data?.message || payload?._data?.Message || {};

  // 1. Reaction (inline reactionMessage OR message.reaction payload)
  const reactionPayload = payload?.reaction || msg?.reactionMessage;
  if (reactionPayload && typeof reactionPayload === 'object') {
    const targetMessageId = String(
      reactionPayload?.messageId ||
        reactionPayload?.key?.id ||
        reactionPayload?.key?.ID ||
        payload?._data?.reaction?.key?.id ||
        ''
    ).trim();
    if (targetMessageId) {
      return {
        messageType: 'TEXT',
        body: '',
        metadata: null,
        reaction: {
          targetMessageId,
          emoji: String(reactionPayload?.text ?? reactionPayload?.emoji ?? '').trim(),
        },
      };
    }
  }

  // 2. Revoked / Deleted for everyone by sender (protocolMessage type 0 / REVOKE across NOWEB, GOWS, WEBJS)
  const protoMsg =
    msg?.protocolMessage ||
    payload?.protocolMessage ||
    payload?._data?.protocolMessage ||
    payload?.after?._data?.Message?.protocolMessage ||
    payload?.after?._data?.message?.protocolMessage;
  const protoType = protoMsg?.type ?? protoMsg?.Type;
  const protoTargetId =
    protoMsg?.key?.id ||
    protoMsg?.key?.ID ||
    protoMsg?.Key?.ID ||
    protoMsg?.Key?.id ||
    payload?.revokedMessageId ||
    payload?._data?.protocolMessageKey?.id ||
    payload?._data?.protocolMessageKey?._serialized ||
    payload?.before?.id ||
    null;
  if (
    (protoMsg &&
      (protoType === 0 || String(protoType).toUpperCase() === 'REVOKE') &&
      protoTargetId) ||
    ((payload?.type === 'revoked' ||
      payload?._data?.subtype === 'revoke' ||
      payload?._data?.Info?.Type === 'revoked') &&
      protoTargetId)
  ) {
    return {
      messageType: 'TEXT',
      body: '',
      metadata: null,
      revokedTargetId: String(protoTargetId).trim(),
    };
  }

  // 3. Location / Live Location
  const rawLoc = payload?.location || msg?.locationMessage || msg?.liveLocationMessage;
  if (rawLoc && typeof rawLoc === 'object') {
    const lat = Number(rawLoc.latitude ?? rawLoc.degreesLatitude ?? rawLoc.lat);
    const lng = Number(rawLoc.longitude ?? rawLoc.degreesLongitude ?? rawLoc.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const isLive = Boolean(msg?.liveLocationMessage || rawLoc.live || payload?.type === 'live_location');
      const name =
        String(rawLoc.name || rawLoc.description || rawLoc.comment || rawLoc.caption || '').trim() ||
        undefined;
      const address = String(rawLoc.address || '').trim() || undefined;
      const url =
        String(rawLoc.url || '').trim() || `https://www.google.com/maps?q=${lat},${lng}`;
      const accuracyRaw = Number(rawLoc.accuracyInMeters);
      const locationData: WahaLocationData = {
        latitude: lat,
        longitude: lng,
        ...(name ? { name } : {}),
        ...(address ? { address } : {}),
        url,
        ...(isLive ? { isLive: true } : {}),
        ...(Number.isFinite(accuracyRaw) && accuracyRaw > 0 ? { accuracyInMeters: accuracyRaw } : {}),
      };
      const label = [name, address].filter(Boolean).join(' — ');
      const bodyText = isLive
        ? `[Live Lokasi]${label ? ` ${label}` : ''}`
        : label
        ? `[Lokasi] ${label}`
        : `[Lokasi dibagikan] ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      return {
        messageType: 'LOCATION',
        body: bodyText,
        metadata: {
          kind: 'LOCATION',
          location: locationData,
        },
      };
    }
  }

  // 4. Shared Contacts (vCard / contactMessage / contactsArrayMessage)
  const vCardInputs: Array<{ vcard: string; displayName?: string }> = [];
  if (Array.isArray(payload?.vCards)) {
    for (const v of payload.vCards) {
      if (typeof v === 'string' && v.trim()) vCardInputs.push({ vcard: v });
      else if (v && typeof v === 'object' && typeof v.vcard === 'string') {
        vCardInputs.push({ vcard: v.vcard, displayName: v.displayName });
      }
    }
  }
  if (Array.isArray(payload?._data?.vCards)) {
    for (const v of payload._data.vCards) {
      if (typeof v === 'string' && v.trim()) vCardInputs.push({ vcard: v });
    }
  }
  if (msg?.contactMessage?.vcard) {
    vCardInputs.push({
      vcard: String(msg.contactMessage.vcard),
      displayName: msg.contactMessage.displayName,
    });
  }
  if (Array.isArray(msg?.contactsArrayMessage?.contacts)) {
    for (const c of msg.contactsArrayMessage.contacts) {
      if (c?.vcard) {
        vCardInputs.push({ vcard: String(c.vcard), displayName: c.displayName });
      }
    }
  }
  if (Array.isArray(payload?.contacts)) {
    for (const c of payload.contacts) {
      if (typeof c === 'string' && c.includes('BEGIN:VCARD')) {
        vCardInputs.push({ vcard: c });
      } else if (c && typeof c === 'object' && c.vcard) {
        vCardInputs.push({ vcard: String(c.vcard), displayName: c.displayName || c.fullName });
      }
    }
  }

  if (vCardInputs.length > 0) {
    const parsedContacts: WahaSharedContactItem[] = [];
    const seen = new Set<string>();
    for (const entry of vCardInputs) {
      const parsed = parseVCardString(entry.vcard, entry.displayName);
      if (!parsed) continue;
      const key = `${parsed.fullName}|${parsed.phones.join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      parsedContacts.push(parsed);
    }
    if (parsedContacts.length > 0) {
      const first = parsedContacts[0];
      const firstPhone = first.phones[0] ? ` (+${first.phones[0].replace(/^\+/, '')})` : '';
      const extraCount = parsedContacts.length > 1 ? ` +${parsedContacts.length - 1} kontak lainnya` : '';
      return {
        messageType: 'CONTACT',
        body: `[Kontak] ${first.fullName}${firstPhone}${extraCount}`,
        metadata: {
          kind: 'CONTACT',
          sharedContacts: parsedContacts,
        },
      };
    }
  }

  // 5. Stickers (clear dedicated metadata + clean sticker flag)
  if (mediaMeta.isSticker) {
    const isAnimated = Boolean(msg?.stickerMessage?.isAnimated);
    return {
      messageType: 'MEDIA',
      body: '[Stiker]',
      metadata: {
        kind: 'STICKER',
        sticker: { isAnimated },
      },
    };
  }

  // 6. Polls (pollCreationMessage / V2 / V3)
  const pollMsg =
    msg?.pollCreationMessageV3 ||
    msg?.pollCreationMessageV2 ||
    msg?.pollCreationMessage ||
    payload?.poll;
  if (pollMsg && (pollMsg.name || pollMsg.question)) {
    const question = String(pollMsg.name || pollMsg.question).trim();
    const rawOpts = Array.isArray(pollMsg.options) ? pollMsg.options : [];
    const options = rawOpts
      .map((o: any) => (typeof o === 'string' ? o : String(o?.optionName || o?.name || '').trim()))
      .filter(Boolean);
    const selectableCount = Number(pollMsg.selectableOptionsCount ?? pollMsg.selectableCount);
    const multipleAnswers = Number.isFinite(selectableCount) ? selectableCount !== 1 : Boolean(pollMsg.multipleAnswers);
    if (question) {
      const summaryLines = [`[Polling] ${question}`, ...options.map((o: string, i: number) => `${i + 1}. ${o}`)];
      return {
        messageType: 'POLL',
        body: summaryLines.join('\n'),
        metadata: {
          kind: 'POLL',
          poll: {
            question,
            options,
            multipleAnswers,
          },
        },
      };
    }
  }

  // 7. Catalog Product / Order / Group Invite / Call log
  if (msg?.orderMessage && typeof msg.orderMessage === 'object') {
    const om = msg.orderMessage;
    const itemCount = Number(om.itemCount || 0);
    const orderTitle = String(om.orderTitle || om.message || 'Pesanan WhatsApp').trim();
    const totalAmount = om.totalAmount1000 ? Math.round(Number(om.totalAmount1000) / 1000) : undefined;
    const currency = String(om.totalCurrencyCode || 'IDR').trim();
    return {
      messageType: 'TEXT',
      body: `[Pesanan] ${orderTitle}${itemCount > 0 ? ` (${itemCount} item)` : ''}`,
      metadata: {
        kind: 'ORDER',
        order: {
          orderId: om.orderId || undefined,
          title: orderTitle,
          itemCount: itemCount || undefined,
          totalAmount,
          currency,
        },
      },
    };
  }

  if (msg?.productMessage?.product && typeof msg.productMessage.product === 'object') {
    const prod = msg.productMessage.product;
    const title = String(prod.title || 'Produk Katalog').trim();
    const desc = String(prod.description || '').trim() || undefined;
    const price = prod.priceAmount1000 ? Math.round(Number(prod.priceAmount1000) / 1000) : undefined;
    const currency = String(prod.currencyCode || 'IDR').trim();
    return {
      messageType: 'TEXT',
      body: `[Produk Katalog] ${title}`,
      metadata: {
        kind: 'PRODUCT',
        product: {
          productId: prod.productId || undefined,
          title,
          description: desc,
          price,
          currency,
        },
      },
    };
  }

  if (msg?.groupInviteMessage && typeof msg.groupInviteMessage === 'object') {
    const gi = msg.groupInviteMessage;
    const groupName = String(gi.groupName || 'Grup WhatsApp').trim();
    const caption = String(gi.caption || '').trim() || undefined;
    return {
      messageType: 'TEXT',
      body: `[Undangan Grup] ${groupName}${caption ? ` — ${caption}` : ''}`,
      metadata: {
        kind: 'GROUP_INVITE',
        groupInvite: {
          groupJid: gi.groupJid || undefined,
          groupName,
          inviteCode: gi.inviteCode || undefined,
          caption,
        },
      },
    };
  }

  if (mediaMeta.hasMedia || mediaMeta.mediaType) {
    return {
      messageType: 'MEDIA',
      body: fallbackText || '',
      metadata: null,
    };
  }

  return {
    messageType: 'TEXT',
    body: fallbackText || '',
    metadata: null,
  };
}

export function extractInboundWahaText(payload: any): string {
  const msg = payload?._data?.message || payload?._data?.Message || {};
  const viewOnceMsg =
    msg?.viewOnceMessage?.message ||
    msg?.viewOnceMessageV2?.message ||
    msg?.viewOnceMessageV2Extension?.message;
  const docWithCaptionMsg = msg?.documentWithCaptionMessage?.message?.documentMessage;
  const candidates = [
    payload?.body,
    payload?.caption,
    payload?._data?.body,
    payload?._data?.caption,
    msg?.conversation,
    msg?.extendedTextMessage?.text,
    msg?.imageMessage?.caption,
    msg?.videoMessage?.caption,
    msg?.documentMessage?.caption,
    docWithCaptionMsg?.caption,
    viewOnceMsg?.imageMessage?.caption,
    viewOnceMsg?.videoMessage?.caption,
    viewOnceMsg?.documentMessage?.caption,
    msg?.buttonsResponseMessage?.selectedDisplayText,
    msg?.listResponseMessage?.title,
    msg?.templateButtonReplyMessage?.selectedDisplayText,
    msg?.interactiveResponseMessage?.body?.text,
    msg?.pollUpdateMessage ? '[Suara polling diterima]' : null,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  if (payload?.location || msg?.locationMessage) {
    return '[Lokasi dibagikan]';
  }
  if (payload?.vCards || msg?.contactMessage || msg?.contactsArrayMessage) {
    return '[Kontak dibagikan]';
  }
  if (msg?.stickerMessage || payload?.type === 'sticker') {
    return '[Stiker]';
  }
  return '';
}

export interface InboundWahaMediaMeta {
  hasMedia: boolean;
  rawMediaUrl: string | null;
  inlineBase64: string | null;
  mimetype: string | null;
  mediaType: 'image' | 'video' | 'audio' | 'document' | null;
  mediaName: string | null;
  isSticker: boolean;
}

export function extractInboundWahaMediaMeta(payload: any): InboundWahaMediaMeta {
  const msg = payload?._data?.message || payload?._data?.Message || {};
  const viewOnceMsg =
    msg?.viewOnceMessage?.message ||
    msg?.viewOnceMessageV2?.message ||
    msg?.viewOnceMessageV2Extension?.message ||
    {};
  const docMsg = msg?.documentWithCaptionMessage?.message?.documentMessage || msg?.documentMessage;
  const imgMsg = viewOnceMsg?.imageMessage || msg?.imageMessage;
  const vidMsg = viewOnceMsg?.videoMessage || msg?.videoMessage;
  const audMsg = msg?.audioMessage || viewOnceMsg?.audioMessage;
  const stickerMsg = msg?.stickerMessage;

  const rawMediaUrl =
    String(payload?.media?.url || payload?.mediaUrl || payload?._data?.mediaUrl || '').trim() ||
    null;
  const inlineBase64 =
    String(payload?.media?.data || payload?.media?.base64 || payload?._data?.mediaData || '').trim() ||
    null;

  const rawType = String(payload?.type || '').toLowerCase().trim();
  const isSticker = Boolean(stickerMsg || rawType === 'sticker');

  const rawMime = String(
    payload?.media?.mimetype ||
      payload?._data?.mimetype ||
      imgMsg?.mimetype ||
      vidMsg?.mimetype ||
      audMsg?.mimetype ||
      docMsg?.mimetype ||
      stickerMsg?.mimetype ||
      ''
  )
    .split(';')[0]
    .trim()
    .toLowerCase();

  let mediaType: 'image' | 'video' | 'audio' | 'document' | null = null;
  if (docMsg || rawType === 'document') {
    mediaType = 'document';
  } else if (rawMime.startsWith('image/') || isSticker || imgMsg || rawType === 'image') {
    mediaType = 'image';
  } else if (rawMime.startsWith('video/') || vidMsg || rawType === 'video') {
    mediaType = 'video';
  } else if (rawMime.startsWith('audio/') || audMsg || rawType === 'audio' || rawType === 'ptt') {
    mediaType = 'audio';
  } else if (payload?.hasMedia || rawMediaUrl || inlineBase64) {
    mediaType = 'document';
  }

  const effectiveMime =
    rawMime ||
    (isSticker
      ? 'image/webp'
      : mediaType === 'image'
      ? 'image/jpeg'
      : mediaType === 'video'
      ? 'video/mp4'
      : mediaType === 'audio'
      ? 'audio/ogg'
      : null);

  const rawName =
    String(
      payload?.media?.filename ||
        payload?._data?.filename ||
        docMsg?.fileName ||
        payload?._data?.Info?.FileName ||
        ''
    ).trim() || null;

  const hasMedia = Boolean(
    payload?.hasMedia || rawMediaUrl || inlineBase64 || imgMsg || vidMsg || audMsg || docMsg || stickerMsg
  );

  return {
    hasMedia,
    rawMediaUrl,
    inlineBase64,
    mimetype: effectiveMime,
    mediaType: hasMedia ? mediaType : null,
    mediaName: rawName,
    isSticker,
  };
}

export function extractPhoneCandidatesFromWahaPayload(payload: any, isFromMe?: boolean): string[] {
  const fromMeFlag = isFromMe !== undefined ? isFromMe : isWahaFromMe(payload);
  const raw = fromMeFlag
    ? [
        payload?._data?.key?.remoteJid,
        payload?.chatId,
        payload?.to,
        payload?._data?.Info?.Chat,
        payload?._data?.key?.remoteJidAlt,
        payload?._data?.Info?.RecipientAlt,
      ]
    : [
        payload?.to,
        payload?.from,
        payload?.chatId,
        payload?._data?.Info?.SenderAlt,
        payload?._data?.Info?.Chat,
        payload?._data?.Info?.RecipientAlt,
        payload?._data?.key?.remoteJidAlt,
        payload?._data?.key?.remoteJid,
        payload?._data?.key?.senderPn,
        payload?._data?.key?.participantPn,
        payload?.participant,
      ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of raw) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (!trimmed || !isPhoneWahaJid(trimmed)) continue;
    const normalized = normalizePhoneNumber(fromWahaChatId(trimmed));
    const digits = normalized.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15 && !seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

export function extractGroupParticipant(payload: any): {
  participantJid: string | null;
  participantPhone: string | null;
} {
  const jidCandidates = [
    payload?.participant,
    payload?.author,
    payload?._data?.participant,
    payload?._data?.key?.participant,
    payload?._data?.Info?.SenderAlt,
    payload?._data?.Info?.Sender,
  ];
  let participantJid: string | null = null;
  for (const c of jidCandidates) {
    if (typeof c !== 'string') continue;
    const trimmed = c.trim();
    if (!trimmed || trimmed.toLowerCase().endsWith('@g.us') || trimmed.toLowerCase().endsWith('@broadcast')) {
      continue;
    }
    participantJid = trimmed;
    break;
  }

  const phoneCandidates = [
    payload?._data?.Info?.SenderAlt,
    payload?._data?.key?.participantPn,
    payload?._data?.key?.senderPn,
    participantJid,
  ];
  let participantPhone: string | null = null;
  for (const c of phoneCandidates) {
    if (typeof c !== 'string') continue;
    const trimmed = c.trim();
    if (!trimmed || !isPhoneWahaJid(trimmed)) continue;
    const normalized = normalizePhoneNumber(fromWahaChatId(trimmed));
    const digits = normalized.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15) {
      participantPhone = normalized;
      break;
    }
  }

  return { participantJid, participantPhone };
}

export function extractWahaPresence(
  payload: any
): { chatId: string; status: 'typing' | 'recording' | 'online' | 'paused' } | null {
  if (!payload || typeof payload !== 'object') return null;
  const chatId = String(payload.id || payload.chatId || payload.from || '').trim();
  if (!chatId || !isPersonalWahaJid(chatId)) return null;

  const firstEntry = Array.isArray(payload.presences) ? payload.presences[0] : null;
  const rawPresence = String(
    firstEntry?.lastKnownPresence ||
      firstEntry?.presence ||
      payload.lastKnownPresence ||
      payload.presence ||
      ''
  )
    .toLowerCase()
    .trim();

  if (rawPresence === 'composing' || rawPresence === 'typing') {
    return { chatId, status: 'typing' };
  }
  if (rawPresence === 'recording') {
    return { chatId, status: 'recording' };
  }
  if (rawPresence === 'available' || rawPresence === 'online') {
    return { chatId, status: 'online' };
  }
  if (rawPresence === 'paused' || rawPresence === 'unavailable' || rawPresence === 'offline') {
    return { chatId, status: 'paused' };
  }
  return null;
}

export function extractWahaMessageIds(payload: any): { exactIds: string[]; stanzaIds: string[] } {
  const batchIds = [
    ...(Array.isArray(payload?.ids) ? payload.ids : []),
    ...(Array.isArray(payload?._data?.Info?.IDs) ? payload._data.Info.IDs : []),
  ];
  const rawCandidates = [
    payload?.id?._serialized,
    typeof payload?.id === 'string' ? payload.id : null,
    payload?.id?.id,
    payload?._data?.id?._serialized,
    payload?._data?.id?.id,
    payload?._data?.Info?.ID,
    payload?._data?.key?.id,
    ...batchIds,
  ];
  const exactSet = new Set<string>();
  const stanzaSet = new Set<string>();

  for (const val of rawCandidates) {
    if (typeof val !== 'string') continue;
    const trimmed = val.trim();
    if (!trimmed) continue;
    exactSet.add(trimmed);
    // WAHA status ACK ids follow `<fromMe>_status@broadcast_<STANZA>_<VIEWER_JID>`
    const statusMatch = trimmed.match(/status@broadcast_([^_]+)(?:_|$)/i);
    if (statusMatch?.[1] && statusMatch[1].length >= 6) {
      stanzaSet.add(statusMatch[1].trim());
    }
    const lastUnderscore = trimmed.lastIndexOf('_');
    if (lastUnderscore !== -1 && lastUnderscore < trimmed.length - 1) {
      const stanza = trimmed.slice(lastUnderscore + 1).trim();
      if (stanza.length >= 8 && !stanza.includes('@')) {
        stanzaSet.add(stanza);
      }
    }
  }

  return {
    exactIds: Array.from(exactSet),
    stanzaIds: Array.from(stanzaSet),
  };
}

export function extractStatusAckParticipant(payload: any, exactIds: string[]): string | null {
  const directCandidates = [
    payload?.participant,
    payload?.id?.participant,
    payload?._data?.Info?.SenderAlt,
    payload?._data?.Info?.Sender,
    payload?._data?.participant,
    payload?._data?.key?.participant,
  ];
  for (const candidate of directCandidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed && !trimmed.toLowerCase().startsWith('status@broadcast')) {
        return trimmed;
      }
    }
  }
  for (const idStr of exactIds) {
    const suffixMatch = idStr.match(/status@broadcast_[^_]+_(.+)$/i);
    if (suffixMatch?.[1]) {
      const viewer = suffixMatch[1].trim();
      if (viewer && !viewer.toLowerCase().startsWith('status@broadcast')) {
        return viewer;
      }
    }
  }
  return null;
}

export interface PollVoteMetadataEntry {
  voterId: string;
  voterName?: string | null;
  voterPhone?: string | null;
  selectedOptions: string[];
  updatedAt: string;
  fromMe?: boolean;
  voteFailed?: boolean;
}

export interface ExtractedWahaPollVote {
  voteFailed: boolean;
  voteId: string | null;
  pollId: string | null;
  pollStanzaId: string | null;
  chatJid: string | null;
  voterJid: string | null;
  voterPhone: string | null;
  voterName: string | null;
  fromMe: boolean;
  selectedOptions: string[];
  pollQuestion: string | null;
  pollOptions: string[];
  multipleAnswers: boolean;
  timestamp: Date;
}

function normalizePollOptionLabels(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        return String(item.optionName || item.name || item.text || item.title || '').trim();
      }
      return '';
    })
    .filter(Boolean);
}

function isUsableWahaJid(raw: any): raw is string {
  if (typeof raw !== 'string') return false;
  const s = raw.trim();
  if (!s || s.toLowerCase() === 'me') return false;
  return s.includes('@') || /^\d{6,16}$/.test(s);
}

function extractStanzaTail(rawId: string | null): string | null {
  if (!rawId) return null;
  const clean = rawId.trim();
  if (!clean) return null;
  const idx = clean.lastIndexOf('_');
  if (idx !== -1 && idx < clean.length - 1) {
    const tail = clean.slice(idx + 1).trim();
    if (tail && !tail.includes('@')) return tail;
  }
  return clean;
}

export function extractWahaPollVoteEvent(event: string, payload: any): ExtractedWahaPollVote {
  const voteFailed = event === 'poll.vote.failed';
  const voteNode = payload?.vote && typeof payload.vote === 'object' ? payload.vote : payload || {};
  const pollNode = payload?.poll && typeof payload.poll === 'object' ? payload.poll : {};

  const voteId = String(voteNode?.id || voteNode?._serialized || payload?.id || '').trim() || null;
  const pollId =
    String(
      pollNode?.id ||
        pollNode?._serialized ||
        voteNode?.pollCreationMessageKey?.id ||
        voteNode?.pollCreationMessageKey?.ID ||
        voteNode?.pollId ||
        payload?.pollId ||
        ''
    ).trim() || null;
  const pollStanzaId = extractStanzaTail(pollId);
  const fromMe = Boolean(voteNode?.fromMe ?? (voteId ? voteId.startsWith('true_') : false));
  const selectedOptions = voteFailed ? [] : normalizePollOptionLabels(voteNode?.selectedOptions);

  const pollConfig = pollNode?.poll && typeof pollNode.poll === 'object' ? pollNode.poll : pollNode;
  const pollQuestion = String(pollConfig?.name || pollConfig?.question || '').trim() || null;
  const pollOptions = normalizePollOptionLabels(pollConfig?.options);
  const multipleAnswers = Boolean(pollConfig?.multipleAnswers);

  const jidCandidates = [
    payload?.chatId,
    pollNode?.chatId,
    pollNode?.fromMe ? pollNode?.to : pollNode?.from,
    pollNode?.to,
    pollNode?.from,
    voteNode?.chatId,
    voteNode?.to,
    voteNode?.from,
  ].filter(isUsableWahaJid);

  const groupCandidate = jidCandidates.find((j) => j.toLowerCase().endsWith('@g.us'));
  const chatJid =
    groupCandidate ||
    (!fromMe && isUsableWahaJid(voteNode?.from) ? voteNode.from.trim() : null) ||
    jidCandidates[0]?.trim() ||
    null;

  const voterCandidates = [
    voteNode?.participantPn,
    voteNode?.participant,
    voteNode?._data?.Info?.SenderAlt,
    voteNode?._data?.Info?.Sender,
    voteNode?.from,
  ].filter(isUsableWahaJid);
  const nonGroupVoter = voterCandidates.find((j) => !j.toLowerCase().endsWith('@g.us'));
  const voterJid =
    nonGroupVoter?.trim() || (!fromMe && chatJid && !chatJid.toLowerCase().endsWith('@g.us') ? chatJid : null);

  let voterPhone: string | null = null;
  if (voterJid && !voterJid.toLowerCase().endsWith('@lid') && !voterJid.toLowerCase().endsWith('@g.us')) {
    voterPhone = normalizePhoneNumber(fromWahaChatId(voterJid)) || null;
  }

  const voterName =
    String(
      voteNode?.pushName ||
        voteNode?.notifyName ||
        payload?.notifyName ||
        voteNode?._data?.Info?.PushName ||
        payload?._data?.Info?.PushName ||
        ''
    ).trim() || null;

  const rawTs = Number(voteNode?.timestamp ?? payload?.timestamp);
  const timestamp =
    Number.isFinite(rawTs) && rawTs > 0
      ? new Date(rawTs > 1_000_000_000_000 ? rawTs : rawTs * 1000)
      : new Date();

  return {
    voteFailed,
    voteId,
    pollId,
    pollStanzaId,
    chatJid,
    voterJid,
    voterPhone,
    voterName,
    fromMe,
    selectedOptions,
    pollQuestion,
    pollOptions,
    multipleAnswers,
    timestamp,
  };
}

export function upsertPollVoteInMetadata(
  prevMeta: Record<string, any> | null | undefined,
  entry: PollVoteMetadataEntry,
  fallbackPoll?: { question?: string | null; options?: string[]; multipleAnswers?: boolean }
): Record<string, any> {
  const safeMeta = prevMeta && typeof prevMeta === 'object' ? { ...prevMeta } : {};
  const existingPoll = safeMeta.poll && typeof safeMeta.poll === 'object' ? { ...safeMeta.poll } : {};
  const mergedOptions =
    Array.isArray(existingPoll.options) && existingPoll.options.length > 0
      ? existingPoll.options
      : fallbackPoll?.options || [];

  const prevVotes: PollVoteMetadataEntry[] = Array.isArray(existingPoll.votes)
    ? existingPoll.votes.filter((v: any) => v && typeof v.voterId === 'string')
    : [];

  const normVoterKey = entry.voterId.trim().toLowerCase();
  const prevMatch = prevVotes.find((v) => v.voterId.trim().toLowerCase() === normVoterKey);

  const nextEntry: PollVoteMetadataEntry =
    entry.voteFailed && prevMatch && prevMatch.selectedOptions.length > 0
      ? {
          ...prevMatch,
          voterName: entry.voterName || prevMatch.voterName,
          voterPhone: entry.voterPhone || prevMatch.voterPhone,
          voteFailed: true,
          updatedAt: entry.updatedAt,
        }
      : {
          ...entry,
          voterName: entry.voterName || prevMatch?.voterName || null,
          voterPhone: entry.voterPhone || prevMatch?.voterPhone || null,
        };

  const nextVotes = [
    ...prevVotes.filter((v) => v.voterId.trim().toLowerCase() !== normVoterKey),
    nextEntry,
  ];

  return {
    ...safeMeta,
    kind: safeMeta.kind || 'POLL',
    poll: {
      question: existingPoll.question || fallbackPoll?.question || 'Polling WhatsApp',
      options: mergedOptions,
      multipleAnswers:
        existingPoll.multipleAnswers !== undefined
          ? Boolean(existingPoll.multipleAnswers)
          : Boolean(fallbackPoll?.multipleAnswers),
      votes: nextVotes,
    },
  };
}

function normalizeWahaAck(payload: any): number | null {
  if (typeof payload?.ack === 'number' && !Number.isNaN(payload.ack)) {
    return payload.ack;
  }
  if (
    payload?.ack !== undefined &&
    payload?.ack !== null &&
    String(payload.ack).trim() !== '' &&
    !Number.isNaN(Number(payload.ack))
  ) {
    return Number(payload.ack);
  }
  const ackName = String(payload?.ackName || '').toUpperCase().trim();
  if (ackName === 'READ') return 3;
  if (ackName === 'PLAYED') return 4;
  if (ackName === 'DEVICE' || ackName === 'DELIVERED') return 2;
  if (ackName === 'SERVER' || ackName === 'SENT') return 1;
  if (ackName === 'ERROR' || ackName === 'FAILED') return -1;
  if (ackName === 'PENDING') return 0;
  return null;
}

export default async function wahaRouter(fastify: FastifyInstance) {
  const requireWahaRead = requirePermission('settings', 'conversations', 'broadcasts', 'contacts');
  const requireWahaManage = requirePermission('settings.edit');

  // GET WAHA server & session status
  fastify.get('/status', { preHandler: requireWahaRead }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = await wahaService.getStatus(resolveRequestPublicBase(req));
      return reply.send({ success: true, data: status });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST manually sync CRM webhook URL to WAHA sessions
  fastify.post('/webhook/sync', { preHandler: requireWahaManage }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await wahaService.syncSessionWebhooks(resolveRequestPublicBase(req));
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  });

  // GET all WAHA sessions
  fastify.get('/sessions', { preHandler: requireWahaRead }, async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await wahaService.listSessions();
      return reply.send({ success: true, data });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  });

  // POST create & start a new WAHA session (gated by multiSession / maxSessions license)
  fastify.post<{
    Body: { name: string; setActive?: boolean };
  }>('/sessions', { preHandler: requireWahaManage }, async (req, reply) => {
    try {
      const { name, setActive = true } = req.body || {};
      const clean = (name || '').trim();
      if (!clean || !/^[a-zA-Z0-9_-]+$/.test(clean)) {
        return reply.status(400).send({
          success: false,
          error: 'Nama sesi hanya boleh huruf, angka, tanda hubung (-), atau underscore (_)',
        });
      }
      const companyId = getRequestCompanyId(req);
      const lic = await licenseService.assertLicenseActive(companyId);
      const resolvedTarget = await wahaService.resolveSessionName(clean);

      let existingCount = 0;
      let alreadyExists = false;
      try {
        const listed = await wahaService.listSessions();
        existingCount = listed.sessions.length;
        alreadyExists = listed.sessions.some(
          (s) => s.name === clean || s.name === resolvedTarget
        );
      } catch {
        // Ignore if WAHA hasn't returned sessions yet
      }

      if (!alreadyExists && existingCount >= 1) {
        if (!lic.features.multiSession) {
          return reply.status(403).send({
            success: false,
            code: 'FEATURE_LOCKED',
            feature: 'multiSession',
            error: `Fitur Multi-Sesi WhatsApp terkunci pada paket "${lic.plan}". Upgrade ke Pro Bulanan atau Enterprise untuk menambah sesi lebih dari 1.`,
          });
        }
        if (existingCount >= lic.features.maxSessions) {
          return reply.status(403).send({
            success: false,
            code: 'QUOTA_EXCEEDED',
            feature: 'multiSession',
            error: `Batas maksimal ${lic.features.maxSessions} sesi WhatsApp untuk paket "${lic.plan}" telah tercapai.`,
          });
        }
      }

      const result = await wahaService.createAndStartSession(clean, setActive);
      liveEvents.emit('waha:status', { action: 'create', session: resolvedTarget });
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(error.statusCode || 400).send({ success: false, error: error.message });
    }
  });

  // POST switch active WAHA session
  fastify.post<{
    Body: { session: string };
  }>('/sessions/active', { preHandler: requireWahaManage }, async (req, reply) => {
    try {
      const active = await wahaService.setActiveSession(req.body?.session || '');
      liveEvents.emit('waha:status', { action: 'switch', session: active });
      return reply.send({ success: true, data: { activeSession: active } });
    } catch (error: any) {
      return reply.status(error.statusCode || 400).send({ success: false, error: error.message });
    }
  });

  // DELETE remove a WAHA session
  fastify.delete<{
    Params: { name: string };
  }>('/sessions/:name', { preHandler: requireWahaManage }, async (req, reply) => {
    try {
      const result = await wahaService.deleteSession(req.params.name);
      liveEvents.emit('waha:status', { action: 'delete', session: req.params.name });
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  });

  // GET QR code
  fastify.get<{
    Querystring: { session?: string };
  }>('/qr', { preHandler: requireWahaManage }, async (req, reply) => {
    try {
      const qrData = await wahaService.getQrCode(req.query?.session);
      return reply.send({ success: true, data: qrData });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  });

  // POST start session
  fastify.post<{
    Body: { session?: string } | undefined;
  }>('/session/start', { preHandler: requireWahaManage }, async (req, reply) => {
    try {
      const result = await wahaService.startSession(req.body?.session);
      liveEvents.emit('waha:status', { action: 'start', session: req.body?.session });
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  });

  // POST stop session
  fastify.post<{
    Body: { session?: string } | undefined;
  }>('/session/stop', { preHandler: requireWahaManage }, async (req, reply) => {
    try {
      const result = await wahaService.stopSession(req.body?.session);
      liveEvents.emit('waha:status', { action: 'stop', session: req.body?.session });
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  });

  // POST logout session
  fastify.post<{
    Body: { session?: string } | undefined;
  }>('/session/logout', { preHandler: requireWahaManage }, async (req, reply) => {
    try {
      const result = await wahaService.logoutSession(req.body?.session);
      liveEvents.emit('waha:status', { action: 'logout', session: req.body?.session });
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  });

  // POST test send message
  fastify.post<{
    Body: { phone: string; message: string; session?: string };
  }>('/send-test', { preHandler: requireWahaManage }, async (req, reply) => {
    try {
      const { phone, message, session } = req.body;
      if (!phone || !message) {
        return reply.status(400).send({ success: false, error: 'Phone dan message wajib diisi' });
      }
      const result = await wahaService.sendTextMessage(phone, message, session?.trim() || undefined);
      return reply.send({ success: result.success, error: result.error, data: result });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // WAHA Webhook Receiver
  fastify.post('/webhook', async (req: FastifyRequest<{
    Querystring: { companyId?: string };
    Body: { event: string; session?: string; payload: any };
  }>, reply: FastifyReply) => {
    const { event, session: webhookSession, payload } = req.body || {};
    const queryCompanyId = String(req.query?.companyId || '').trim();
    const sessionHint = webhookSession
      ? String(webhookSession).trim()
      : payload?.name
      ? String(payload.name).trim()
      : null;
    const companyId = queryCompanyId || (await wahaService.resolveCompanyIdForWebhookSession(sessionHint));

    return await runWithCompany(companyId, async () => {
    try {
      console.log(`[WAHA Webhook][${companyId}] Received event: ${event}`);

      try {
        await wahaService.verifyActiveExternalGowsIfNeeded();
      } catch (engineErr: any) {
        if (engineErr?.code === 'WAHA_ENGINE_NOT_GOWS') {
          wahaService.recordWebhookEvent({
            receivedAt: new Date().toISOString(),
            event: event || 'unknown',
            session: webhookSession || payload?.name || null,
            from: null,
            outcome: 'IGNORED',
            note: engineErr.message,
          }, companyId);
          return reply.status(422).send({ success: false, error: engineErr.message });
        }
      }

      if (event === 'session.status') {
        wahaService.recordWebhookEvent({
          receivedAt: new Date().toISOString(),
          event,
          session: webhookSession || payload?.name || null,
          from: null,
          outcome: 'PROCESSED',
          note: `Status sesi: ${payload?.status || '-'}`,
        }, companyId);
        liveEvents.emit('waha:status', {
          action: 'webhook',
          session: webhookSession || payload?.name,
          status: payload?.status,
        }, companyId);
      }

      // 1. Delivery & Read Receipts (message.ack)
      if (event === 'message.ack' && payload) {
        const ackValue = normalizeWahaAck(payload); // 1 = SERVER/SENT, 2 = DELIVERED, 3 = READ, 4 = PLAYED
        const { exactIds, stanzaIds } = extractWahaMessageIds(payload);
        const allIds = Array.from(new Set([...exactIds, ...stanzaIds]));
        const now = new Date();

        if (ackValue !== null && allIds.length > 0) {
          const recipientConditions = [
            inArray(campaignRecipients.wahaMessageId, allIds),
            ...stanzaIds.map((stanza) => like(campaignRecipients.wahaMessageId, `%_${stanza}`)),
          ];

          const recList = await db
            .select()
            .from(campaignRecipients)
            .where(and(eq(campaignRecipients.companyId, companyId), or(...recipientConditions)));

          for (const recipient of recList) {
            const currentAck = recipient.ackStatus ?? 0;
            if (ackValue > currentAck) {
              const updateData: any = { ackStatus: ackValue, updatedAt: now };

              if (ackValue >= 2 && !recipient.deliveredAt) {
                updateData.deliveredAt = now;
                await db
                  .update(campaigns)
                  .set({
                    deliveredCount: sql`${campaigns.deliveredCount} + 1`,
                    updatedAt: now,
                  })
                  .where(and(eq(campaigns.id, recipient.campaignId), eq(campaigns.companyId, companyId)));
              }

              if (ackValue === 2) {
                updateData.status = 'DELIVERED';
              } else if (ackValue >= 3) {
                updateData.status = 'READ';
                if (!recipient.readAt) {
                  updateData.readAt = now;
                  await db
                    .update(campaigns)
                    .set({
                      readCount: sql`${campaigns.readCount} + 1`,
                      updatedAt: now,
                    })
                    .where(and(eq(campaigns.id, recipient.campaignId), eq(campaigns.companyId, companyId)));
                }
              }

              await db
                .update(campaignRecipients)
                .set(updateData)
                .where(eq(campaignRecipients.id, recipient.id));
            }
          }

          // Update ChatMessages if matched (never downgrade ackStatus)
          const chatConditions = [
            inArray(chatMessages.wahaMessageId, allIds),
            ...stanzaIds.map((stanza) => like(chatMessages.wahaMessageId, `%_${stanza}`)),
          ];
          await db
            .update(chatMessages)
            .set({
              ackStatus: ackValue,
              status: ackValue >= 3 ? 'READ' : ackValue === 2 ? 'DELIVERED' : 'SENT',
              deliveredAt: ackValue >= 2 ? now : undefined,
              readAt: ackValue >= 3 ? now : undefined,
            })
            .where(and(eq(chatMessages.companyId, companyId), or(...chatConditions), lt(chatMessages.ackStatus, ackValue)));

          // Record real-time WhatsApp Status/Story viewer receipts
          const ackFrom = String(
            payload?.from || payload?.to || payload?.chatId || payload?._data?.Info?.Chat || ''
          ).toLowerCase();
          const isStatusAck =
            ackFrom === 'status@broadcast' ||
            exactIds.some((idVal) => idVal.toLowerCase().includes('status@broadcast'));
          if (isStatusAck && ackValue >= 2) {
            const viewerJid = extractStatusAckParticipant(payload, exactIds);
            if (viewerJid) {
              const statusPostConditions = [
                inArray(scheduledPosts.externalPostId, allIds),
                ...stanzaIds.map((stanza) => like(scheduledPosts.externalPostId, `%_${stanza}%`)),
                ...stanzaIds.map((stanza) => eq(scheduledPosts.externalPostId, stanza)),
              ];
              const matchedStatusPosts = await db
                .select({ id: scheduledPosts.id, wahaSession: scheduledPosts.wahaSession })
                .from(scheduledPosts)
                .where(
                  and(
                    eq(scheduledPosts.companyId, companyId),
                    eq(scheduledPosts.channel, 'WHATSAPP_STATUS'),
                    or(...statusPostConditions)
                  )
                );

              let viewerPhone: string | null = null;
              const lowerViewer = viewerJid.toLowerCase();
              if (lowerViewer.endsWith('@lid')) {
                viewerPhone = await wahaService
                  .resolveLidToPhone(webhookSession || matchedStatusPosts[0]?.wahaSession || undefined, viewerJid)
                  .catch(() => null);
              } else {
                const rawDigits = fromWahaChatId(viewerJid);
                viewerPhone = rawDigits ? normalizePhoneNumber(rawDigits) || null : null;
              }

              for (const stPost of matchedStatusPosts) {
                await upsertWhatsappStatusView({
                  postId: stPost.id,
                  viewerJid,
                  viewerPhone,
                  sessionName: webhookSession || stPost.wahaSession || null,
                  ackStatus: ackValue,
                  viewedAt: now,
                });
              }
              if (matchedStatusPosts.length > 0) {
                liveEvents.emit('posts:update', {
                  statusPostIds: matchedStatusPosts.map((p) => p.id),
                  ack: ackValue,
                }, companyId);
              }
            }
          }

          console.log(
            `[WAHA Webhook] message.ack session=${webhookSession || '-'} ack=${ackValue} ids=${allIds.join(',')} matchedRecipients=${recList.length}`
          );
        }
        wahaService.recordWebhookEvent({
          receivedAt: now.toISOString(),
          event,
          session: webhookSession || null,
          from: exactIds[0] || null,
          outcome: 'PROCESSED',
          note: `Ack=${ackValue ?? '-'}`,
        }, companyId);
        liveEvents.emit('tracking:update', { ack: ackValue, msgId: exactIds[0] }, companyId);
        liveEvents.emit('conversations:update', { ack: ackValue, msgId: exactIds[0] }, companyId);
      }

      // 1b. Typing & Presence Updates (presence.update)
      if (event === 'presence.update' && payload) {
        const parsedPresence = extractWahaPresence(payload);
        if (parsedPresence) {
          const phoneCandidate = extractPhoneCandidatesFromWahaPayload({
            from: parsedPresence.chatId,
            ...payload,
          })[0];
          let matchedContactId: string | null = null;

          if (phoneCandidate) {
            const variants = Array.from(
              new Set([
                phoneCandidate,
                `+${phoneCandidate}`,
                phoneCandidate.startsWith('62') ? `0${phoneCandidate.slice(2)}` : '',
              ].filter(Boolean))
            );
            const found = await db
              .select({ id: contacts.id })
              .from(contacts)
              .where(and(eq(contacts.companyId, companyId), inArray(contacts.nomorWhatsapp, variants)))
              .limit(1);
            matchedContactId = found[0]?.id || null;
          }

          if (!matchedContactId) {
            const idRow = await db
              .select({ contactId: contactIdentities.contactId })
              .from(contactIdentities)
              .where(
                and(
                  eq(contactIdentities.companyId, companyId),
                  eq(contactIdentities.channel, 'WHATSAPP'),
                  eq(contactIdentities.externalId, parsedPresence.chatId)
                )
              )
              .limit(1);
            matchedContactId = idRow[0]?.contactId || null;
          }

          if (matchedContactId) {
            const convCandidates = await db
              .select({ id: conversations.id, wahaSession: conversations.wahaSession })
              .from(conversations)
              .where(
                and(
                  eq(conversations.companyId, companyId),
                  eq(conversations.contactId, matchedContactId),
                  eq(conversations.channel, 'WHATSAPP')
                )
              )
              .orderBy(desc(conversations.updatedAt));
            const matchedConv =
              (webhookSession
                ? convCandidates.find((c) => c.wahaSession === webhookSession)
                : undefined) || convCandidates[0];
            if (matchedConv) {
              liveEvents.emit('conversations:presence', {
                conversationId: matchedConv.id,
                presence: parsedPresence.status,
                session: webhookSession || null,
                updatedAt: new Date().toISOString(),
              }, companyId);
            }
          }
        }
      }

      // 1c. Message Reactions (message.reaction event) & Revocations (message.revoked event)
      if ((event === 'message.reaction' || event === 'message.revoked') && payload) {
        const now = new Date();
        const richReaction = extractInboundWahaRichData(payload, {
          hasMedia: false,
          rawMediaUrl: null,
          inlineBase64: null,
          mimetype: null,
          mediaType: null,
          mediaName: null,
          isSticker: false,
        });

        const targetIdCandidate =
          event === 'message.reaction'
            ? richReaction.reaction?.targetMessageId || payload?.reaction?.messageId || null
            : richReaction.revokedTargetId ||
              payload?.revokedMessageId ||
              payload?.before?.id ||
              payload?.before?._data?.Info?.ID ||
              payload?.before?._data?.key?.id ||
              payload?.before?._data?.id?._serialized ||
              payload?.after?.revokedMessageId ||
              payload?.after?._data?.Message?.protocolMessage?.Key?.ID ||
              payload?.after?._data?.Message?.protocolMessage?.key?.id ||
              payload?.after?._data?.message?.protocolMessage?.key?.id ||
              payload?._data?.protocolMessageKey?.id ||
              payload?.id ||
              null;

        if (targetIdCandidate) {
          const cleanTarget = String(targetIdCandidate).trim();
          const stanzaPart = cleanTarget.includes('_') ? cleanTarget.split('_').pop() || cleanTarget : cleanTarget;
          const targetMsgs = await db
            .select()
            .from(chatMessages)
            .where(
              and(
                eq(chatMessages.companyId, companyId),
                or(
                  eq(chatMessages.wahaMessageId, cleanTarget),
                  eq(chatMessages.wahaMessageId, stanzaPart),
                  like(chatMessages.wahaMessageId, `%_${stanzaPart}`)
                )
              )
            )
            .limit(10);
          const scopedTarget = pickSessionScopedMessage(targetMsgs, webhookSession);
          if (scopedTarget) {
            const targetMsg = scopedTarget;
            let prevMeta: Record<string, any> = {};
            if (targetMsg.metadataJson) {
              try {
                prevMeta = JSON.parse(targetMsg.metadataJson);
              } catch {
                prevMeta = {};
              }
            }

            if (event === 'message.reaction') {
              const actor = String(payload?.from || payload?.participant || 'contact').trim();
              const actorName = String(payload?.pushName || payload?._data?.Info?.PushName || '').trim() || undefined;
              const emoji = String(richReaction.reaction?.emoji ?? payload?.reaction?.text ?? '').trim();
              const prevList: Array<any> = Array.isArray(prevMeta.reactions) ? prevMeta.reactions : [];
              const filtered = prevList.filter((r) => !(r && r.actor === actor && !r.isOutbound));
              if (emoji) {
                filtered.push({ emoji, actor, ...(actorName ? { actorName } : {}), isOutbound: false });
              }
              await db
                .update(chatMessages)
                .set({ metadataJson: JSON.stringify({ ...prevMeta, reactions: filtered }) })
                .where(eq(chatMessages.id, targetMsg.id));
            } else {
              const nowIso = now.toISOString();
              const revokeFromMe = isWahaFromMe(payload?.after || payload);
              const rawPushName = String(
                payload?.after?.pushName ||
                  payload?.before?.pushName ||
                  payload?.pushName ||
                  payload?._data?.Info?.PushName ||
                  ''
              ).trim();
              const revokedByLabel = revokeFromMe
                ? targetMsg.senderName || 'WhatsApp'
                : rawPushName || targetMsg.senderName || 'Pengirim';
              await db
                .update(chatMessages)
                .set({
                  metadataJson: JSON.stringify({
                    ...prevMeta,
                    revoked: true,
                    revokedAt: nowIso,
                    revokedBy: revokedByLabel,
                    revokedBySender: !revokeFromMe,
                    revokeScope: 'EVERYONE',
                  }),
                })
                .where(eq(chatMessages.id, targetMsg.id));

              await db.insert(chatMessages).values({
                id: crypto.randomUUID(),
                companyId,
                conversationId: targetMsg.conversationId,
                contactId: targetMsg.contactId,
                direction: 'SYSTEM',
                messageType: 'ACTIVITY',
                channel: 'WHATSAPP',
                wahaSession: targetMsg.wahaSession || webhookSession || null,
                senderName: revokedByLabel,
                body: !revokeFromMe
                  ? `menarik pesan WhatsApp`
                  : `menarik pesan dari perangkat WhatsApp`,
                metadataJson: JSON.stringify({
                  kind: 'ACTIVITY',
                  action: 'MESSAGE_REVOKED',
                  actorName: revokedByLabel,
                  revokedBySender: !revokeFromMe,
                  targetMessageId: targetMsg.id,
                }),
                status: 'SYSTEM',
                ackStatus: 0,
                createdAt: now,
              });

              const latestMsgRows = await db
                .select({ id: chatMessages.id })
                .from(chatMessages)
                .where(
                  and(
                    eq(chatMessages.conversationId, targetMsg.conversationId),
                    ne(chatMessages.messageType, 'ACTIVITY'),
                    ne(chatMessages.messageType, 'NOTE')
                  )
                )
                .orderBy(desc(chatMessages.createdAt))
                .limit(1);
              if (latestMsgRows[0]?.id === targetMsg.id) {
                await db
                  .update(conversations)
                  .set({
                    lastMessage: '🚫 Pesan ditarik oleh pengirim',
                    updatedAt: new Date(),
                  })
                  .where(eq(conversations.id, targetMsg.conversationId));
              }
            }

            liveEvents.emit('conversations:update', { conversationId: targetMsg.conversationId }, companyId);
            wahaService.recordWebhookEvent({
              receivedAt: now.toISOString(),
              event,
              session: webhookSession || null,
              from: payload?.from || null,
              outcome: 'PROCESSED',
              note: event === 'message.reaction' ? 'Reaksi pesan diperbarui' : 'Pesan ditandai ditarik',
            }, companyId);
            return reply.send({ success: true, message: `${event} processed` });
          }
        }
      }

      // 1d. WhatsApp Poll Votes (poll.vote / poll.vote.failed)
      if ((event === 'poll.vote' || event === 'poll.vote.failed') && payload) {
        const now = new Date();
        const voteInfo = extractWahaPollVoteEvent(event, payload);
        const inboundSession = webhookSession ? String(webhookSession).trim() : null;

        // 1. Try locating parent poll message stored in CRM
        let parentPollMsg: typeof chatMessages.$inferSelect | undefined;
        const pollMatchConds = [
          voteInfo.pollId ? eq(chatMessages.wahaMessageId, voteInfo.pollId) : null,
          voteInfo.pollStanzaId ? eq(chatMessages.wahaMessageId, voteInfo.pollStanzaId) : null,
          voteInfo.pollStanzaId ? like(chatMessages.wahaMessageId, `%_${voteInfo.pollStanzaId}`) : null,
        ].filter(Boolean) as any[];

        if (pollMatchConds.length > 0) {
          const candidates = await db
            .select()
            .from(chatMessages)
            .where(and(eq(chatMessages.companyId, companyId), or(...pollMatchConds)))
            .orderBy(desc(chatMessages.createdAt))
            .limit(10);
          parentPollMsg =
            (inboundSession
              ? candidates.find((m) => (m.wahaSession || '').trim() === inboundSession)
              : undefined) || candidates[0];
        }

        let convRow: typeof conversations.$inferSelect | undefined;
        let contact: typeof contacts.$inferSelect | undefined;

        if (parentPollMsg) {
          const joined = await db
            .select({ conv: conversations, contact: contacts })
            .from(conversations)
            .leftJoin(contacts, eq(conversations.contactId, contacts.id))
            .where(and(eq(conversations.id, parentPollMsg.conversationId), eq(conversations.companyId, companyId)))
            .limit(1);
          convRow = joined[0]?.conv;
          contact = joined[0]?.contact || undefined;
        }

        // 2. Fallback: locate/create contact + conversation when parent poll isn't in chat_messages (e.g. broadcast or direct phone poll)
        if (!convRow) {
          const fallbackChatJid = (voteInfo.chatJid || voteInfo.voterJid || '').trim();
          const lowerChatJid = fallbackChatJid.toLowerCase();
          const isIgnoredJid =
            !fallbackChatJid ||
            lowerChatJid === 'status@broadcast' ||
            lowerChatJid.endsWith('@broadcast') ||
            lowerChatJid.endsWith('@newsletter');

          if (isIgnoredJid) {
            wahaService.recordWebhookEvent({
              receivedAt: now.toISOString(),
              event,
              session: inboundSession,
              from: fallbackChatJid || null,
              outcome: 'IGNORED',
              note: 'Suara polling tanpa chat/percakapan target yang valid',
            }, companyId);
            return reply.send({ success: true, message: `${event} ignored (no conversation target)` });
          }

          const isGroupFallback = lowerChatJid.endsWith('@g.us');
          if (isGroupFallback) {
            const grpIdRows = await db
              .select()
              .from(contactIdentities)
              .where(
                and(
                  eq(contactIdentities.companyId, companyId),
                  eq(contactIdentities.channel, 'WHATSAPP'),
                  eq(contactIdentities.externalId, fallbackChatJid)
                )
              )
              .limit(1);
            if (grpIdRows[0]) {
              const byId = await db
                .select()
                .from(contacts)
                .where(and(eq(contacts.id, grpIdRows[0].contactId), eq(contacts.companyId, companyId)))
                .limit(1);
              contact = byId[0];
            }
            if (!contact) {
              const grpInfo = await wahaService
                .getGroupInfo(fallbackChatJid, inboundSession || undefined)
                .catch(() => null);
              const grpName = grpInfo?.subject || `Grup WhatsApp ${fromWahaChatId(fallbackChatJid).slice(-6)}`;
              const [insertedGrp] = await db
                .insert(contacts)
                .values({
                  id: crypto.randomUUID(),
                  companyId,
                  namaLengkap: grpName,
                  nomorWhatsapp: null,
                  kategori: 'Grup WhatsApp',
                  tags: 'Grup WhatsApp,Non-Penilaian',
                  excludeFromMetrics: true,
                  excludeReason: 'Grup WhatsApp',
                  createdAt: now,
                  updatedAt: now,
                })
                .returning();
              contact = insertedGrp;
              contact = await claimGroupIdentity({
                companyId,
                groupJid: fallbackChatJid,
                contact,
                name: grpName,
                now,
              });
            }
          } else {
            const isLidChat = lowerChatJid.endsWith('@lid');
            let targetPhone =
              voteInfo.voterPhone ||
              (!isLidChat ? normalizePhoneNumber(fromWahaChatId(fallbackChatJid)) : null) ||
              null;
            if (!targetPhone && isLidChat && inboundSession) {
              targetPhone = await wahaService.resolveLidToPhone(inboundSession, fallbackChatJid).catch(() => null);
            }
            if (targetPhone) {
              const variants = Array.from(
                new Set([targetPhone, `+${targetPhone}`, targetPhone.startsWith('62') ? `0${targetPhone.slice(2)}` : ''].filter(Boolean))
              );
              const existingContacts = await db
                .select()
                .from(contacts)
                .where(and(eq(contacts.companyId, companyId), inArray(contacts.nomorWhatsapp, variants)))
                .limit(1);
              contact = existingContacts[0];
            }
            if (!contact && isLidChat) {
              const lidRows = await db
                .select()
                .from(contactIdentities)
                .where(
                  and(
                    eq(contactIdentities.companyId, companyId),
                    eq(contactIdentities.channel, 'WHATSAPP'),
                    eq(contactIdentities.externalId, fallbackChatJid)
                  )
                )
                .limit(1);
              if (lidRows[0]) {
                const byId = await db
                  .select()
                  .from(contacts)
                  .where(and(eq(contacts.id, lidRows[0].contactId), eq(contacts.companyId, companyId)))
                  .limit(1);
                contact = byId[0];
              }
            }
            if (!contact) {
              const suffix = targetPhone ? targetPhone.slice(-4) : fallbackChatJid.split('@')[0].slice(-4);
              const [inserted] = await db
                .insert(contacts)
                .values({
                  id: crypto.randomUUID(),
                  companyId,
                  namaLengkap: voteInfo.voterName || `Kontak ${suffix}`,
                  nomorWhatsapp: targetPhone || null,
                  tags: 'Inbound Lead',
                  createdAt: now,
                  updatedAt: now,
                })
                .returning();
              contact = inserted;
            }
          }

          if (contact) {
            const normalizedInboundSession = inboundSession ? inboundSession.trim() : null;
            const convList = await db
              .select()
              .from(conversations)
              .where(
                and(
                  eq(conversations.companyId, companyId),
                  eq(conversations.contactId, contact.id),
                  eq(conversations.channel, 'WHATSAPP')
                )
              )
              .orderBy(desc(conversations.updatedAt));
            convRow =
              (normalizedInboundSession
                ? convList.find((c) => c.wahaSession === normalizedInboundSession) || convList.find((c) => !c.wahaSession)
                : convList[0]) || undefined;
            if (!convRow) {
              const isLidChat = lowerChatJid.endsWith('@lid');
              try {
                const [createdConv] = await db
                  .insert(conversations)
                  .values({
                    id: crypto.randomUUID(),
                    companyId,
                    contactId: contact.id,
                    channel: 'WHATSAPP',
                    externalThreadId: isGroupFallback ? fallbackChatJid : isLidChat ? fallbackChatJid : null,
                    contextTitle: isGroupFallback ? contact.namaLengkap : null,
                    wahaSession: normalizedInboundSession,
                    pushName: !isGroupFallback && !voteInfo.fromMe ? voteInfo.voterName : contact.namaLengkap,
                    isGroup: isGroupFallback,
                    excludeFromMetrics: Boolean(isGroupFallback || contact.excludeFromMetrics),
                    excludeReason: isGroupFallback ? 'Grup WhatsApp' : contact.excludeReason || null,
                    status: 'OPEN',
                    sessionStartedAt: now,
                    unreadCount: 0,
                    createdAt: now,
                    updatedAt: now,
                  })
                  .returning();
                convRow = createdConv;
              } catch (convInsErr: any) {
                if (!isPgUniqueViolation(convInsErr)) throw convInsErr;
                const retryList = await db
                  .select()
                  .from(conversations)
                  .where(
                    and(
                      eq(conversations.companyId, companyId),
                      eq(conversations.contactId, contact.id),
                      eq(conversations.channel, 'WHATSAPP')
                    )
                  )
                  .orderBy(desc(conversations.updatedAt));
                convRow =
                  (normalizedInboundSession
                    ? retryList.find((c) => c.wahaSession === normalizedInboundSession) || retryList[0]
                    : retryList[0]) || undefined;
                if (!convRow) throw convInsErr;
              }
            }
          }
        }

        if (convRow) {
          const isGroupConv = Boolean(
            convRow.isGroup ||
              convRow.externalThreadId?.toLowerCase().endsWith('@g.us') ||
              voteInfo.chatJid?.toLowerCase().endsWith('@g.us')
          );

          let resolvedVoterPhone = voteInfo.voterPhone;
          if (!resolvedVoterPhone && voteInfo.voterJid?.toLowerCase().endsWith('@lid') && inboundSession) {
            resolvedVoterPhone = await wahaService
              .resolveLidToPhone(inboundSession, voteInfo.voterJid)
              .catch(() => null);
          }
          if (!resolvedVoterPhone && !isGroupConv && !voteInfo.fromMe && contact?.nomorWhatsapp) {
            resolvedVoterPhone = normalizePhoneNumber(contact.nomorWhatsapp) || contact.nomorWhatsapp;
          }

          let voterContactName: string | null = null;
          if (isGroupConv && resolvedVoterPhone) {
            const pVars = Array.from(
              new Set([
                resolvedVoterPhone,
                `+${resolvedVoterPhone}`,
                resolvedVoterPhone.startsWith('62') ? `0${resolvedVoterPhone.slice(2)}` : '',
              ].filter(Boolean))
            );
            const matchedVoter = await db
              .select({ namaLengkap: contacts.namaLengkap })
              .from(contacts)
              .where(and(eq(contacts.companyId, companyId), inArray(contacts.nomorWhatsapp, pVars)))
              .limit(1);
            voterContactName = matchedVoter[0]?.namaLengkap || null;
          } else if (!isGroupConv && !voteInfo.fromMe && contact?.namaLengkap) {
            voterContactName = contact.namaLengkap;
          }

          const resolvedVoterName = voteInfo.fromMe
            ? voteInfo.voterName || 'Tim CS'
            : pickBestContactDisplayName(
                voterContactName,
                voteInfo.voterName || (!isGroupConv ? convRow.pushName : null),
                resolvedVoterPhone
              ) || 'Pelanggan';

          const voterId = voteInfo.fromMe
            ? 'me'
            : resolvedVoterPhone || voteInfo.voterJid || contact?.id || 'customer';

          let prevPollMeta: Record<string, any> = {};
          if (parentPollMsg?.metadataJson) {
            try {
              prevPollMeta = JSON.parse(parentPollMsg.metadataJson);
            } catch {
              prevPollMeta = {};
            }
          }

          const effectiveQuestion =
            prevPollMeta?.poll?.question || voteInfo.pollQuestion || null;
          const effectiveOptions: string[] =
            Array.isArray(prevPollMeta?.poll?.options) && prevPollMeta.poll.options.length > 0
              ? prevPollMeta.poll.options
              : voteInfo.pollOptions;

          if (parentPollMsg) {
            const updatedParentMeta = upsertPollVoteInMetadata(
              prevPollMeta,
              {
                voterId,
                voterName: resolvedVoterName,
                voterPhone: resolvedVoterPhone,
                selectedOptions: voteInfo.selectedOptions,
                updatedAt: voteInfo.timestamp.toISOString(),
                fromMe: voteInfo.fromMe,
                voteFailed: voteInfo.voteFailed,
              },
              {
                question: effectiveQuestion,
                options: effectiveOptions,
                multipleAnswers: voteInfo.multipleAnswers,
              }
            );
            await db
              .update(chatMessages)
              .set({ metadataJson: JSON.stringify(updatedParentMeta) })
              .where(eq(chatMessages.id, parentPollMsg.id));
          }

          const voteBody = voteInfo.voteFailed
            ? '[Respon Polling] Pelanggan memberikan suara polling (gagal didekripsi oleh WAHA)'
            : voteInfo.selectedOptions.length > 0
            ? `[Respon Polling] Memilih: ${voteInfo.selectedOptions.join(', ')}`
            : '[Respon Polling] Membatalkan pilihan polling';

          const voteMetadata = {
            kind: 'POLL_VOTE',
            pollVote: {
              pollMessageId: parentPollMsg?.id || null,
              pollWahaMessageId: voteInfo.pollId || parentPollMsg?.wahaMessageId || null,
              question: effectiveQuestion,
              options: effectiveOptions,
              selectedOptions: voteInfo.selectedOptions,
              voterId,
              voterName: resolvedVoterName,
              voterPhone: resolvedVoterPhone,
              voteFailed: voteInfo.voteFailed,
            },
          };

          const existingVoteRows = voteInfo.voteId
            ? await db
                .select()
                .from(chatMessages)
                .where(
                  and(
                    eq(chatMessages.companyId, companyId),
                    eq(chatMessages.conversationId, convRow.id),
                    eq(chatMessages.wahaMessageId, voteInfo.voteId)
                  )
                )
                .limit(1)
            : [];

          let shouldTouchConversation = false;
          if (existingVoteRows[0]) {
            const ex = existingVoteRows[0];
            if (ex.body === '[Suara polling diterima]' || !ex.metadataJson) {
              await db
                .update(chatMessages)
                .set({
                  messageType: 'POLL',
                  body: voteBody,
                  metadataJson: JSON.stringify(voteMetadata),
                  replyToMessageId: ex.replyToMessageId || parentPollMsg?.id || null,
                  replyToBody:
                    ex.replyToBody ||
                    (effectiveQuestion ? `[Polling] ${effectiveQuestion.slice(0, 140)}` : null),
                  replyToSender:
                    ex.replyToSender ||
                    (parentPollMsg
                      ? parentPollMsg.direction === 'OUTBOUND'
                        ? parentPollMsg.senderName || 'Tim CS'
                        : contact?.namaLengkap || 'Pelanggan'
                      : null),
                })
                .where(eq(chatMessages.id, ex.id));
              shouldTouchConversation = !voteInfo.fromMe;
            }
          } else if (!voteInfo.fromMe || !parentPollMsg) {
            await db.insert(chatMessages).values({
              id: crypto.randomUUID(),
              companyId,
              conversationId: convRow.id,
              contactId: contact?.id || convRow.contactId,
              direction: voteInfo.fromMe ? 'OUTBOUND' : 'INBOUND',
              messageType: 'POLL',
              channel: 'WHATSAPP',
              wahaSession: inboundSession || convRow.wahaSession || null,
              senderJid: voteInfo.voterJid,
              senderPhone: resolvedVoterPhone,
              senderName: resolvedVoterName,
              body: voteBody,
              metadataJson: JSON.stringify(voteMetadata),
              replyToMessageId: parentPollMsg?.id || null,
              replyToBody: effectiveQuestion ? `[Polling] ${effectiveQuestion.slice(0, 140)}` : null,
              replyToSender: parentPollMsg
                ? parentPollMsg.direction === 'OUTBOUND'
                  ? parentPollMsg.senderName || 'Tim CS'
                  : contact?.namaLengkap || 'Pelanggan'
                : null,
              wahaMessageId: voteInfo.voteId,
              status: voteInfo.fromMe ? 'SENT' : 'DELIVERED',
              ackStatus: voteInfo.fromMe ? 1 : 2,
              sentAt: voteInfo.fromMe ? now : null,
              createdAt: now,
            }).onConflictDoNothing();
            shouldTouchConversation = true;
          }

          if (shouldTouchConversation) {
            const previewText = isGroupConv
              ? `${resolvedVoterName}: ${voteBody}`
              : voteBody;
            const isReopeningFromResolved = !voteInfo.fromMe && convRow.status === 'RESOLVED';
            await db
              .update(conversations)
              .set({
                wahaSession: inboundSession || convRow.wahaSession,
                status: isReopeningFromResolved ? 'OPEN' : convRow.status,
                sessionStartedAt: isReopeningFromResolved
                  ? now
                  : convRow.sessionStartedAt || convRow.firstInboundAt || convRow.createdAt,
                resolvedAt: isReopeningFromResolved ? null : convRow.resolvedAt,
                firstInboundAt: voteInfo.fromMe ? convRow.firstInboundAt : convRow.firstInboundAt || now,
                lastInboundAt: voteInfo.fromMe ? convRow.lastInboundAt : now,
                lastMessage: previewText,
                lastMessageAt: now,
                unreadCount: voteInfo.fromMe ? convRow.unreadCount : sql`${conversations.unreadCount} + 1`,
                updatedAt: now,
              })
              .where(eq(conversations.id, convRow.id));
          }

          liveEvents.emit('conversations:update', { conversationId: convRow.id }, companyId);
          liveEvents.emit('tracking:update', { conversationId: convRow.id }, companyId);
          wahaService.recordWebhookEvent({
            receivedAt: now.toISOString(),
            event,
            session: inboundSession,
            from: resolvedVoterPhone || voteInfo.voterJid || voteInfo.chatJid || null,
            outcome: 'PROCESSED',
            note: voteInfo.voteFailed
              ? 'Respon polling diterima tetapi gagal didekripsi WAHA'
              : voteInfo.selectedOptions.length > 0
              ? `Respon polling diterima: ${voteInfo.selectedOptions.join(', ')}`
              : 'Pelanggan membatalkan pilihan polling',
          }, companyId);
          return reply.send({ success: true, message: `${event} processed` });
        }
      }

      // 1e. Label Updates from WhatsApp (label.chat.added / label.chat.deleted)
      if ((event === 'label.chat.added' || event === 'label.chat.deleted') && payload) {
        const rawChatId = String(payload?.chatId || payload?.chat_id || payload?.id || '').trim();
        const labelName = String(payload?.label?.name || payload?.name || '').trim();
        if (rawChatId) {
          const cleanPhone = rawChatId.replace(/\D/g, '');
          const convRows = await db
            .select({ conv: conversations, contact: contacts })
            .from(conversations)
            .leftJoin(contacts, eq(conversations.contactId, contacts.id))
            .where(
              and(
                eq(conversations.companyId, companyId),
                or(
                  eq(conversations.externalThreadId, rawChatId),
                  cleanPhone ? eq(contacts.nomorWhatsapp, cleanPhone) : sql`false`
                )
              )
            )
            .limit(1);
          const row = convRows[0];
          if (row?.conv) {
            const currentLabels = (row.conv.labels || '')
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean);
            let updatedLabels: string[];
            if (event === 'label.chat.added') {
              if (labelName && !currentLabels.some((l) => l.toLowerCase() === labelName.toLowerCase())) {
                updatedLabels = [...currentLabels, labelName];
              } else {
                updatedLabels = currentLabels;
              }
            } else {
              updatedLabels = labelName
                ? currentLabels.filter((l) => l.toLowerCase() !== labelName.toLowerCase())
                : currentLabels;
            }
            const nextLabelsStr = updatedLabels.length > 0 ? updatedLabels.join(', ') : null;
            if (nextLabelsStr !== row.conv.labels) {
              await db
                .update(conversations)
                .set({ labels: nextLabelsStr, updatedAt: new Date() })
                .where(eq(conversations.id, row.conv.id));
              liveEvents.emit('conversations:update', { conversationId: row.conv.id }, companyId);
            }
          }
        }
        return reply.send({ success: true, message: `${event} processed` });
      }

      // 2. Incoming & Direct Outgoing Messages (message / message.any)
      const isInboundMessageEvent = event === 'message' || event === 'message.any';
      const isFromMe = isWahaFromMe(payload);
      const rawTarget = isFromMe
        ? (() => {
            const candidates = [
              payload?.chatId,
              payload?._data?.Info?.Chat,
              payload?._data?.key?.remoteJid,
              payload?.to,
              payload?.from,
            ]
              .map((v) => String(v || '').trim())
              .filter((v) => v && v.toLowerCase() !== 'me');
            return candidates.find((v) => v.toLowerCase().endsWith('@g.us')) || candidates[0] || '';
          })()
        : String(
            payload?.from ||
            payload?.chatId ||
            payload?._data?.Info?.Chat ||
            payload?._data?.key?.remoteJid ||
            ''
          ).trim();

      const rawFrom = rawTarget;
      const rawChatId = String(payload?.chatId || rawFrom).trim();
      const lowerFrom = rawFrom.toLowerCase();
      const lowerChat = rawChatId.toLowerCase();
      const isBroadcastOrNewsletter =
        !rawFrom ||
        lowerFrom === 'status@broadcast' ||
        lowerChat === 'status@broadcast' ||
        lowerFrom.endsWith('@broadcast') ||
        lowerChat.endsWith('@broadcast') ||
        lowerFrom.endsWith('@newsletter') ||
        lowerChat.endsWith('@newsletter');
      const isGroupChat =
        !isBroadcastOrNewsletter && (lowerFrom.endsWith('@g.us') || lowerChat.endsWith('@g.us'));
      const groupJid = isGroupChat
        ? (lowerFrom.endsWith('@g.us') ? rawFrom : rawChatId)
        : null;
      const isPersonalChat = !isBroadcastOrNewsletter && !isGroupChat && isPersonalWahaJid(rawFrom);

      if (isInboundMessageEvent && payload) {
        const now = new Date();
        if (!isPersonalChat && !isGroupChat) {
          wahaService.recordWebhookEvent({
            receivedAt: now.toISOString(),
            event,
            session: webhookSession || null,
            from: rawFrom || null,
            outcome: 'IGNORED',
            note: 'Bukan chat personal atau grup WA',
          }, companyId);
          return reply.send({ success: true, message: 'Webhook ignored (unsupported JID)' });
        }

        const inboundSession = webhookSession ? String(webhookSession).trim() : null;
        const { exactIds } = extractWahaMessageIds(payload);
        const msgId = exactIds[0] || null;
        const webhookLockKey = msgId
          ? `msg:${companyId}:${(inboundSession || '').toLowerCase()}:${msgId}`
          : `chat:${companyId}:${(inboundSession || '').toLowerCase()}:${rawFrom.toLowerCase()}`;

        return await withWebhookKeyLock(webhookLockKey, async () => {
        // Dedup scoped by wahaSession so multiple sessions in the same group or thread never shadow each other
        if (msgId) {
          const dedupConditions = inboundSession
            ? and(
                eq(chatMessages.companyId, companyId),
                eq(chatMessages.wahaMessageId, msgId),
                eq(chatMessages.wahaSession, inboundSession)
              )
            : and(eq(chatMessages.companyId, companyId), eq(chatMessages.wahaMessageId, msgId));

          const dupMsg = await db
            .select({ id: chatMessages.id, conversationId: chatMessages.conversationId })
            .from(chatMessages)
            .where(dedupConditions)
            .limit(1);
          if (dupMsg[0]) {
            wahaService.recordWebhookEvent({
              receivedAt: now.toISOString(),
              event,
              session: inboundSession,
              from: rawFrom,
              outcome: 'DEDUP',
              note: isFromMe ? 'Pesan keluar WA (fromMe) sudah dicatat sebelumnya' : 'Pesan duplikat diabaikan',
            }, companyId);
            return reply.send({ success: true, deduplicated: true, message: 'Duplicate webhook ignored' });
          }
        }

        const mediaMeta = extractInboundWahaMediaMeta(payload);
        let mediaUrl: string | null = mediaMeta.rawMediaUrl;
        const mediaType = mediaMeta.mediaType;
        const mediaName = mediaMeta.mediaName;
        const hasMedia = mediaMeta.hasMedia;
        const rawText = extractInboundWahaText(payload);
        const richData = extractInboundWahaRichData(payload, mediaMeta, rawText);

        // Handle inline reactionMessage delivered on standard message / message.any channel
        if (richData.reaction) {
          const cleanTarget = richData.reaction.targetMessageId;
          const stanzaPart = cleanTarget.includes('_') ? cleanTarget.split('_').pop() || cleanTarget : cleanTarget;
          const targetMsgs = await db
            .select()
            .from(chatMessages)
            .where(
              and(
                eq(chatMessages.companyId, companyId),
                or(eq(chatMessages.wahaMessageId, cleanTarget), like(chatMessages.wahaMessageId, `%_${stanzaPart}`))
              )
            )
            .limit(10);
          const scopedTarget = pickSessionScopedMessage(targetMsgs, webhookSession);
          if (scopedTarget) {
            const targetMsg = scopedTarget;
            let prevMeta: Record<string, any> = {};
            if (targetMsg.metadataJson) {
              try {
                prevMeta = JSON.parse(targetMsg.metadataJson);
              } catch {
                prevMeta = {};
              }
            }
            const actor = String(payload?.participant || payload?.from || 'contact').trim();
            const actorName = String(payload?._data?.notifyName || payload?._data?.Info?.PushName || '').trim() || undefined;
            const prevList: Array<any> = Array.isArray(prevMeta.reactions) ? prevMeta.reactions : [];
            const filtered = prevList.filter((r) => !(r && r.actor === actor && !r.isOutbound));
            if (richData.reaction.emoji) {
              filtered.push({
                emoji: richData.reaction.emoji,
                actor,
                ...(actorName ? { actorName } : {}),
                isOutbound: false,
              });
            }
            await db
              .update(chatMessages)
              .set({ metadataJson: JSON.stringify({ ...prevMeta, reactions: filtered }) })
              .where(eq(chatMessages.id, targetMsg.id));
            liveEvents.emit('conversations:update', { conversationId: targetMsg.conversationId }, companyId);
          }
          wahaService.recordWebhookEvent({
            receivedAt: now.toISOString(),
            event,
            session: inboundSession,
            from: rawFrom,
            outcome: 'PROCESSED',
            note: 'Reaksi pesan diperbarui',
          }, companyId);
          return reply.send({ success: true, message: 'Inline reaction processed' });
        }

        // Handle inline message revocation protocolMessage delivered on message.any
        if (richData.revokedTargetId) {
          const cleanTarget = richData.revokedTargetId;
          const stanzaPart = cleanTarget.includes('_') ? cleanTarget.split('_').pop() || cleanTarget : cleanTarget;
          const targetMsgs = await db
            .select()
            .from(chatMessages)
            .where(
              and(
                eq(chatMessages.companyId, companyId),
                or(
                  eq(chatMessages.wahaMessageId, cleanTarget),
                  eq(chatMessages.wahaMessageId, stanzaPart),
                  like(chatMessages.wahaMessageId, `%_${stanzaPart}`)
                )
              )
            )
            .limit(10);
          const scopedTarget = pickSessionScopedMessage(targetMsgs, webhookSession);
          if (scopedTarget) {
            const targetMsg = scopedTarget;
            let prevMeta: Record<string, any> = {};
            if (targetMsg.metadataJson) {
              try {
                prevMeta = JSON.parse(targetMsg.metadataJson);
              } catch {
                prevMeta = {};
              }
            }
            const nowIso = new Date().toISOString();
            const rawPushName = String(
              payload?.pushName || payload?._data?.notifyName || payload?._data?.Info?.PushName || ''
            ).trim();
            const revokedByLabel = isFromMe
              ? targetMsg.senderName || 'WhatsApp'
              : rawPushName || targetMsg.senderName || 'Pengirim';
            await db
              .update(chatMessages)
              .set({
                metadataJson: JSON.stringify({
                  ...prevMeta,
                  revoked: true,
                  revokedAt: nowIso,
                  revokedBy: revokedByLabel,
                  revokedBySender: !isFromMe,
                  revokeScope: 'EVERYONE',
                }),
              })
              .where(eq(chatMessages.id, targetMsg.id));

            await db.insert(chatMessages).values({
              id: crypto.randomUUID(),
              companyId,
              conversationId: targetMsg.conversationId,
              contactId: targetMsg.contactId,
              direction: 'SYSTEM',
              messageType: 'ACTIVITY',
              channel: 'WHATSAPP',
              wahaSession: targetMsg.wahaSession || webhookSession || null,
              senderName: revokedByLabel,
              body: !isFromMe
                ? `menarik pesan WhatsApp`
                : `menarik pesan dari perangkat WhatsApp`,
              metadataJson: JSON.stringify({
                kind: 'ACTIVITY',
                action: 'MESSAGE_REVOKED',
                actorName: revokedByLabel,
                revokedBySender: !isFromMe,
                targetMessageId: targetMsg.id,
              }),
              status: 'SYSTEM',
              ackStatus: 0,
              createdAt: now,
            });

            const latestMsgRows = await db
              .select({ id: chatMessages.id })
              .from(chatMessages)
              .where(
                and(
                  eq(chatMessages.conversationId, targetMsg.conversationId),
                  ne(chatMessages.messageType, 'ACTIVITY'),
                  ne(chatMessages.messageType, 'NOTE')
                )
              )
              .orderBy(desc(chatMessages.createdAt))
              .limit(1);
            if (latestMsgRows[0]?.id === targetMsg.id) {
              await db
                .update(conversations)
                .set({
                  lastMessage: '🚫 Pesan ditarik oleh pengirim',
                  updatedAt: new Date(),
                })
                .where(eq(conversations.id, targetMsg.conversationId));
            }
            liveEvents.emit('conversations:update', { conversationId: targetMsg.conversationId }, companyId);
          }
          return reply.send({ success: true, message: 'Message revocation processed' });
        }

        // Download & persist inbound WAHA media locally so files never disappear when WAHA purges /api/files/
        if (hasMedia) {
          const inboundMediaMeta = {
            channel: 'WHATSAPP',
            sessionName: webhookSession || undefined,
            senderName:
              String(payload?._data?.notifyName || payload?._data?.Info?.PushName || '').trim() ||
              undefined,
            senderPhone: rawFrom ? String(rawFrom).replace(/\D/g, '') : undefined,
            source: isFromMe ? ('OUTBOUND' as const) : ('INBOUND' as const),
            originalFileName: mediaName || undefined,
            label: webhookSession ? `WA • ${webhookSession}` : 'WhatsApp',
          };

          if (mediaMeta.inlineBase64) {
            try {
              const saved = await saveBase64MediaFile({
                base64: mediaMeta.inlineBase64,
                mimeType: mediaMeta.mimetype || undefined,
                fileName: mediaName || undefined,
                maxBytes: 25 * 1024 * 1024,
                metadata: inboundMediaMeta,
              });
              mediaUrl = saved.relativeUrl;
            } catch (err: any) {
              console.warn('[WAHA Webhook] Gagal menyimpan base64 media masuk:', err?.message);
            }
          } else if (mediaMeta.rawMediaUrl) {
            try {
              const downloaded = await wahaService.downloadMedia(mediaMeta.rawMediaUrl);
              const saved = await saveMediaBufferFile({
                buffer: downloaded.buffer,
                mimeType: mediaMeta.mimetype || downloaded.contentType,
                fileName: mediaName || downloaded.filename,
                maxBytes: 25 * 1024 * 1024,
                metadata: inboundMediaMeta,
              });
              mediaUrl = saved.relativeUrl;
            } catch (err: any) {
              console.warn(
                '[WAHA Webhook] Gagal mengunduh media masuk ke disk, fallback ke proxy:',
                err?.message
              );
            }
          }
        }

        const mediaFallbackLabel = mediaMeta.isSticker
          ? '[Stiker]'
          : mediaType === 'image'
          ? '[Gambar]'
          : mediaType === 'video'
          ? '[Video]'
          : mediaType === 'audio'
          ? '[Audio]'
          : mediaType === 'document'
          ? mediaName
            ? `[Dokumen: ${mediaName}]`
            : '[Dokumen]'
          : '[Lampiran Media]';
        const body = richData.body || (hasMedia ? mediaFallbackLabel : '');

        const ctxInfo = extractWahaContextInfo(payload);
        const quotedWahaId =
          (typeof payload.replyTo === 'string' ? payload.replyTo : payload.replyTo?.id) ||
          payload._data?.quotedStanzaID ||
          ctxInfo?.stanzaId ||
          ctxInfo?.stanzaID ||
          null;
        const quotedMsgNode = ctxInfo?.quotedMessage || payload._data?.quotedMsg || null;
        const quotedRawBody =
          payload.replyTo?.body ||
          payload._data?.quotedMsg?.body ||
          quotedMsgNode?.conversation ||
          quotedMsgNode?.extendedTextMessage?.text ||
          quotedMsgNode?.imageMessage?.caption ||
          quotedMsgNode?.videoMessage?.caption ||
          quotedMsgNode?.documentMessage?.caption ||
          quotedMsgNode?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
          (quotedMsgNode?.documentMessage?.fileName ? `[Dokumen: ${quotedMsgNode.documentMessage.fileName}]` : null) ||
          (quotedMsgNode?.imageMessage ? '[Gambar]' : null) ||
          (quotedMsgNode?.videoMessage ? '[Video]' : null) ||
          (quotedMsgNode?.audioMessage ? '[Audio]' : null) ||
          (quotedMsgNode?.stickerMessage ? '[Stiker]' : null) ||
          null;

        const rawMentions: string[] = [
          ...(Array.isArray(payload?.mentions) ? payload.mentions : []),
          ...(Array.isArray(payload?._data?.mentionedJidList) ? payload._data.mentionedJidList : []),
          ...(Array.isArray(ctxInfo?.mentionedJid) ? ctxInfo.mentionedJid : []),
          ...(Array.isArray(payload?._data?.message?.extendedTextMessage?.contextInfo?.mentionedJid)
            ? payload._data.message.extendedTextMessage.contextInfo.mentionedJid
            : []),
          ...(Array.isArray(payload?._data?.Message?.extendedTextMessage?.contextInfo?.mentionedJid)
            ? payload._data.Message.extendedTextMessage.contextInfo.mentionedJid
            : []),
        ].map((x) => String(typeof x === 'string' ? x : x?._serialized || x?.id || '').trim()).filter(Boolean);
        const inboundMentions = Array.from(new Set(rawMentions));
        if (inboundMentions.length > 0) {
          richData.metadata = { ...(richData.metadata || {}), mentions: inboundMentions };
        }
        const isRevokedShellPayload =
          payload?.type === 'revoked' ||
          payload?._data?.subtype === 'revoke' ||
          payload?._data?.Info?.Type === 'revoked';
        if (isRevokedShellPayload) {
          richData.metadata = {
            ...(richData.metadata || {}),
            revoked: true,
            revokedAt: now.toISOString(),
            revokedBySender: !isFromMe,
            revokeScope: 'EVERYONE',
          };
        }

        if (!body && !hasMedia && !richData.metadata) {
          wahaService.recordWebhookEvent({
            receivedAt: now.toISOString(),
            event,
            session: inboundSession,
            from: rawFrom,
            outcome: 'IGNORED',
            note: 'Event tanpa isi pesan atau media',
          }, companyId);
          return reply.send({ success: true, message: 'Webhook ignored (empty message body)' });
        }

        const notifyName = String(
          payload.notifyName ||
          payload._data?.notifyName ||
          payload._data?.Info?.PushName ||
          payload._data?.pushName ||
          ''
        ).trim();

        let contact: typeof contacts.$inferSelect | undefined;
        let isLidSource = false;
        let fromPhone: string | null = null;
        let resolvedGroupSubject: string | null = null;
        let groupSenderJid: string | null = null;
        let groupSenderPhone: string | null = null;
        let groupSenderName: string | null = null;

        if (isGroupChat && groupJid) {
          // Resolve group subject and find/create Group record in CRM
          const payloadGroupName = String(
            payload.chatName ||
              payload._data?.Info?.GroupName ||
              payload._data?.groupName ||
              payload.group?.subject ||
              payload._data?.chat?.name ||
              ''
          ).trim();
          resolvedGroupSubject = payloadGroupName || null;

          const groupIdRows = await db
            .select()
            .from(contactIdentities)
            .where(
              and(
                eq(contactIdentities.companyId, companyId),
                eq(contactIdentities.channel, 'WHATSAPP'),
                eq(contactIdentities.externalId, groupJid)
              )
            )
            .limit(1);

          if (groupIdRows[0]) {
            const byId = await db
              .select()
              .from(contacts)
              .where(and(eq(contacts.id, groupIdRows[0].contactId), eq(contacts.companyId, companyId)))
              .limit(1);
            contact = byId[0];
          }

          const hasFallbackGroupName = !contact || /^Grup (WhatsApp|\d+)/i.test(contact.namaLengkap);
          if (!resolvedGroupSubject && hasFallbackGroupName) {
            const grpInfo = await wahaService
              .getGroupInfo(groupJid, inboundSession || undefined)
              .catch(() => null);
            if (grpInfo?.subject) {
              resolvedGroupSubject = grpInfo.subject;
            }
          }

          const effectiveGroupName =
            resolvedGroupSubject ||
            contact?.namaLengkap ||
            `Grup WhatsApp ${fromWahaChatId(groupJid).slice(-6)}`;

          if (!contact) {
            const [insertedGrp] = await db
              .insert(contacts)
              .values({
                id: crypto.randomUUID(),
                companyId,
                namaLengkap: effectiveGroupName,
                nomorWhatsapp: null,
                kategori: 'Grup WhatsApp',
                tags: 'Grup WhatsApp,Non-Penilaian',
                excludeFromMetrics: true,
                excludeReason: 'Grup WhatsApp',
                createdAt: now,
                updatedAt: now,
              })
              .returning();
            contact = insertedGrp;
            contact = await claimGroupIdentity({
              companyId,
              groupJid,
              contact,
              name: effectiveGroupName,
              now,
            });
          } else if (
            resolvedGroupSubject &&
            resolvedGroupSubject !== contact.namaLengkap &&
            /^Grup (WhatsApp|\d+)/i.test(contact.namaLengkap)
          ) {
            await db
              .update(contacts)
              .set({ namaLengkap: resolvedGroupSubject, updatedAt: now })
              .where(eq(contacts.id, contact.id))
              .catch(() => {});
            contact = { ...contact, namaLengkap: resolvedGroupSubject };
          }

          // Extract group message sender participant details
          const extractedParticipant = extractGroupParticipant(payload);
          groupSenderJid = extractedParticipant.participantJid;
          groupSenderPhone = extractedParticipant.participantPhone;
          if (!groupSenderPhone && groupSenderJid?.toLowerCase().endsWith('@lid')) {
            groupSenderPhone = await wahaService
              .resolveLidToPhone(inboundSession, groupSenderJid)
              .catch(() => null);
          }

          let matchedMemberName: string | null = null;
          if (groupSenderPhone) {
            const pVariants = Array.from(
              new Set([
                groupSenderPhone,
                `+${groupSenderPhone}`,
                groupSenderPhone.startsWith('62') ? `0${groupSenderPhone.slice(2)}` : '',
              ].filter(Boolean))
            );
            const matchedMember = await db
              .select({ namaLengkap: contacts.namaLengkap })
              .from(contacts)
              .where(and(eq(contacts.companyId, companyId), inArray(contacts.nomorWhatsapp, pVariants)))
              .limit(1);
            matchedMemberName = matchedMember[0]?.namaLengkap || null;
          }
          groupSenderName =
            notifyName ||
            matchedMemberName ||
            (groupSenderPhone ? `+${groupSenderPhone}` : groupSenderJid ? fromWahaChatId(groupSenderJid) : null);
        } else {
          isLidSource = lowerFrom.endsWith('@lid');
          fromPhone = isPhoneWahaJid(rawFrom)
            ? normalizePhoneNumber(fromWahaChatId(rawFrom))
            : extractPhoneCandidatesFromWahaPayload(payload, isFromMe)[0] || null;
          if (!fromPhone && isLidSource) {
            fromPhone = await wahaService.resolveLidToPhone(inboundSession, rawFrom);
          }

          // Find contact by normalized phone OR WAHA @lid contact identity within tenant company
          if (fromPhone) {
            const phoneVariants = Array.from(
              new Set([
                fromPhone,
                `+${fromPhone}`,
                fromPhone.startsWith('62') ? `0${fromPhone.slice(2)}` : '',
              ].filter(Boolean))
            );
            const contactList = await db
              .select()
              .from(contacts)
              .where(and(eq(contacts.companyId, companyId), inArray(contacts.nomorWhatsapp, phoneVariants)));
            contact = contactList[0];
          }

          if (!contact && isLidSource) {
            const identityRows = await db
              .select()
              .from(contactIdentities)
              .where(
                and(
                  eq(contactIdentities.companyId, companyId),
                  eq(contactIdentities.channel, 'WHATSAPP'),
                  eq(contactIdentities.externalId, rawFrom)
                )
              );
            if (identityRows[0]) {
              const byId = await db
                .select()
                .from(contacts)
                .where(and(eq(contacts.id, identityRows[0].contactId), eq(contacts.companyId, companyId)));
              contact = byId[0];
            }
          }

          if (!contact) {
            const fallbackSuffix = fromPhone ? fromPhone.slice(-4) : rawFrom.split('@')[0].slice(-4);
            const contactName = (!isFromMe && notifyName) || `Kontak ${fallbackSuffix}`;
            try {
              const insertedContacts = await db
                .insert(contacts)
                .values({
                  id: crypto.randomUUID(),
                  companyId,
                  namaLengkap: contactName,
                  nomorWhatsapp: fromPhone || null,
                  tags: 'Inbound Lead',
                  createdAt: now,
                  updatedAt: now,
                })
                .returning();
              contact = insertedContacts[0];
            } catch (insertErr: any) {
              if (fromPhone) {
                const retryList = await db
                  .select()
                  .from(contacts)
                  .where(and(eq(contacts.companyId, companyId), eq(contacts.nomorWhatsapp, fromPhone)));
                contact = retryList[0];
              }
              if (!contact) throw insertErr;
            }
          } else {
            const updates: Record<string, any> = {};
            if (fromPhone && !contact.nomorWhatsapp) {
              updates.nomorWhatsapp = fromPhone;
            }
            if (
              !isFromMe &&
              notifyName &&
              !isGenericDisplayName(notifyName) &&
              isGenericDisplayName(contact.namaLengkap)
            ) {
              updates.namaLengkap = notifyName;
              contact.namaLengkap = notifyName;
            }
            if (Object.keys(updates).length > 0) {
              updates.updatedAt = now;
              await db
                .update(contacts)
                .set(updates)
                .where(eq(contacts.id, contact.id))
                .catch(() => {});
            }
          }

          if (isLidSource && contact) {
            await db
              .insert(contactIdentities)
              .values({
                id: crypto.randomUUID(),
                companyId,
                contactId: contact.id,
                channel: 'WHATSAPP',
                externalId: rawFrom,
                handle: fromPhone ? `+${fromPhone}` : notifyName || null,
                createdAt: now,
              })
              .onConflictDoNothing()
              .catch(() => {});
          }
        }

        const effectiveConversationPreview =
          isGroupChat && groupSenderName ? `${groupSenderName}: ${body}` : body;

        // Upsert WhatsApp Conversation separated per wahaSession while sharing the same master Contact
        const normalizedInboundSession = inboundSession ? inboundSession.trim() : null;
        const convList = await db
          .select()
          .from(conversations)
          .where(
            and(
              eq(conversations.companyId, companyId),
              eq(conversations.contactId, contact.id),
              eq(conversations.channel, 'WHATSAPP')
            )
          )
          .orderBy(desc(conversations.updatedAt));

        let existingConv = normalizedInboundSession
          ? convList.find(
              (c) =>
                (c.wahaSession || '').trim().toLowerCase() ===
                normalizedInboundSession.toLowerCase()
            ) || convList.find((c) => !(c.wahaSession || '').trim())
          : convList[0];
        let convId!: string;

        const contactExcluded = Boolean(isGroupChat || contact.excludeFromMetrics);
        const contactExcludeReason = isGroupChat
          ? 'Grup WhatsApp'
          : contact.excludeFromMetrics
          ? (contact.excludeReason || 'Bukan Customer')
          : null;

        let createdConversation = false;
        if (!existingConv) {
          convId = crypto.randomUUID();
          try {
            await db.insert(conversations).values({
              id: convId,
              companyId,
              contactId: contact.id,
              channel: 'WHATSAPP',
              externalThreadId: isGroupChat ? groupJid : isLidSource ? rawFrom : null,
              contextTitle: isGroupChat ? (resolvedGroupSubject || contact.namaLengkap) : null,
              wahaSession: normalizedInboundSession,
              pushName: isGroupChat
                ? (resolvedGroupSubject || contact.namaLengkap)
                : (!isFromMe && notifyName ? notifyName : null),
              isGroup: isGroupChat,
              excludeFromMetrics: contactExcluded,
              excludeReason: contactExcludeReason,
              status: 'OPEN',
              lastMessage: effectiveConversationPreview,
              lastMessageAt: now,
              firstInboundAt: isFromMe ? null : now,
              firstResponseAt: isFromMe ? now : null,
              lastInboundAt: isFromMe ? null : now,
              sessionStartedAt: now,
              unreadCount: isFromMe ? 0 : 1,
              createdAt: now,
              updatedAt: now,
            });
            createdConversation = true;
          } catch (convInsErr: any) {
            if (!isPgUniqueViolation(convInsErr)) throw convInsErr;
            const retryConvList = await db
              .select()
              .from(conversations)
              .where(
                and(
                  eq(conversations.companyId, companyId),
                  eq(conversations.contactId, contact.id),
                  eq(conversations.channel, 'WHATSAPP')
                )
              )
              .orderBy(desc(conversations.updatedAt));
            existingConv =
              (normalizedInboundSession
                ? retryConvList.find(
                    (c) =>
                      (c.wahaSession || '').trim().toLowerCase() ===
                      normalizedInboundSession.toLowerCase()
                  ) || retryConvList[0]
                : retryConvList[0]) || undefined;
            if (!existingConv) throw convInsErr;
          }
        }
        if (!createdConversation && existingConv) {
          convId = existingConv.id;
          const isReopeningFromResolved = existingConv.status === 'RESOLVED';
          await db
            .update(conversations)
            .set({
              wahaSession: normalizedInboundSession || existingConv.wahaSession,
              externalThreadId: isGroupChat
                ? groupJid
                : isLidSource
                ? rawFrom
                : existingConv.externalThreadId,
              contextTitle: isGroupChat
                ? (resolvedGroupSubject || existingConv.contextTitle || contact.namaLengkap)
                : existingConv.contextTitle,
              pushName: isGroupChat
                ? (resolvedGroupSubject || existingConv.pushName || contact.namaLengkap)
                : (!isFromMe && notifyName ? notifyName : existingConv.pushName),
              isGroup: isGroupChat || existingConv.isGroup,
              excludeFromMetrics: contactExcluded ? true : existingConv.excludeFromMetrics,
              excludeReason: isGroupChat
                ? (existingConv.excludeReason || 'Grup WhatsApp')
                : contactExcluded
                ? (contactExcludeReason || existingConv.excludeReason || 'Bukan Customer')
                : existingConv.excludeReason,
              status: isReopeningFromResolved ? 'OPEN' : existingConv.status,
              sessionStartedAt: isReopeningFromResolved
                ? now
                : existingConv.sessionStartedAt || existingConv.firstInboundAt || existingConv.createdAt,
              resolvedAt: isReopeningFromResolved ? null : existingConv.resolvedAt,
              firstInboundAt: isFromMe ? existingConv.firstInboundAt : (existingConv.firstInboundAt || now),
              firstResponseAt: isFromMe ? sql`COALESCE(${conversations.firstResponseAt}, ${now})` : existingConv.firstResponseAt,
              lastInboundAt: isFromMe ? existingConv.lastInboundAt : now,
              lastMessage: effectiveConversationPreview,
              lastMessageAt: now,
              unreadCount: isFromMe ? existingConv.unreadCount : sql`${conversations.unreadCount} + 1`,
              updatedAt: now,
            })
            .where(eq(conversations.id, convId));
        }

        // Resolve quoted local message reference if inbound reply quotes an existing message
        let replyToMessageId: string | null = null;
        let replyToBody: string | null = quotedRawBody ? String(quotedRawBody).slice(0, 160) : null;
        let replyToSender: string | null = null;
        if (quotedWahaId) {
          const rawQuotedStr = String(quotedWahaId).trim();
          const quotedStanza = rawQuotedStr.includes('_') ? rawQuotedStr.split('_').pop()! : rawQuotedStr;
          const quotedRows = await db
            .select({
              id: chatMessages.id,
              body: chatMessages.body,
              direction: chatMessages.direction,
              senderName: chatMessages.senderName,
              senderPhone: chatMessages.senderPhone,
              senderJid: chatMessages.senderJid,
            })
            .from(chatMessages)
            .where(
              and(
                eq(chatMessages.companyId, companyId),
                eq(chatMessages.conversationId, convId),
                or(
                  eq(chatMessages.wahaMessageId, rawQuotedStr),
                  eq(chatMessages.wahaMessageId, quotedStanza),
                  like(chatMessages.wahaMessageId, `%_${quotedStanza}`)
                )
              )
            )
            .limit(1);

          const quotedPushName = String(
            payload.replyTo?.notifyName ||
            payload.replyTo?.pushName ||
            payload.replyTo?.senderName ||
            payload.replyTo?._data?.notifyName ||
            payload.replyTo?._data?.pushName ||
            payload._data?.quotedMsg?.notifyName ||
            payload._data?.quotedMsg?.pushName ||
            ''
          ).trim();

          const quotedParticipant = String(
            payload.replyTo?.participantPn ||
            payload.replyTo?.participant ||
            payload._data?.quotedParticipant ||
            ctxInfo?.participantPn ||
            ctxInfo?.participant ||
            ''
          ).trim();

          const resolveContactNameByPhoneOrJid = async (
            rawJid?: string | null,
            rawPhone?: string | null
          ): Promise<{ name: string | null; phone: string | null }> => {
            let p: string | null = normalizePhoneNumber(rawPhone || '') || null;
            if (!p && rawJid && !rawJid.toLowerCase().endsWith('@lid')) {
              p = normalizePhoneNumber(rawJid.replace(/@.*$/, '')) || null;
            }
            if (!p && rawJid && rawJid.toLowerCase().endsWith('@lid') && inboundSession) {
              p = await wahaService
                .resolveLidToPhone(inboundSession, rawJid)
                .catch(() => null);
            }
            if (p) {
              const variants = Array.from(
                new Set([p, `+${p}`, p.startsWith('62') ? `0${p.slice(2)}` : ''].filter(Boolean))
              );
              const matched = await db
                .select({ namaLengkap: contacts.namaLengkap })
                .from(contacts)
                .where(and(eq(contacts.companyId, companyId), inArray(contacts.nomorWhatsapp, variants)))
                .limit(1);
              if (matched[0]?.namaLengkap) {
                return { name: matched[0].namaLengkap, phone: p };
              }
            }
            return { name: null, phone: p || null };
          };

          if (quotedRows[0]) {
            replyToMessageId = quotedRows[0].id;
            if (!replyToBody) replyToBody = quotedRows[0].body.slice(0, 160);
            if (quotedRows[0].direction === 'OUTBOUND') {
              replyToSender =
                pickBestContactDisplayName(
                  quotedRows[0].senderName,
                  quotedPushName,
                  quotedRows[0].senderPhone
                ) || 'Tim CS';
            } else if (!isGroupChat) {
              const convPush = !isFromMe && notifyName ? notifyName : existingConv?.pushName;
              replyToSender =
                pickBestContactDisplayName(
                  contact.namaLengkap,
                  convPush || quotedRows[0].senderName || quotedPushName,
                  fromPhone || quotedRows[0].senderPhone
                ) || 'Pelanggan';
            } else {
              const resolvedQuotedContact = await resolveContactNameByPhoneOrJid(
                quotedRows[0].senderJid || quotedParticipant,
                quotedRows[0].senderPhone
              );
              replyToSender =
                pickBestContactDisplayName(
                  resolvedQuotedContact.name,
                  quotedRows[0].senderName || quotedPushName,
                  resolvedQuotedContact.phone || quotedRows[0].senderPhone
                ) || 'Anggota Grup';
            }
          } else if (payload.replyTo?.fromMe === true) {
            replyToSender = pickBestContactDisplayName(quotedPushName, null, null) || 'Tim CS';
          } else if (quotedParticipant) {
            const resolvedQuotedContact = await resolveContactNameByPhoneOrJid(quotedParticipant, null);
            replyToSender =
              pickBestContactDisplayName(
                resolvedQuotedContact.name,
                quotedPushName || (!isGroupChat && !isFromMe ? notifyName : existingConv?.pushName),
                resolvedQuotedContact.phone
              ) || (isGroupChat ? 'Anggota Grup' : contact.namaLengkap || 'Pelanggan');
          } else if (!isGroupChat) {
            const convPush = !isFromMe && notifyName ? notifyName : existingConv?.pushName;
            replyToSender =
              pickBestContactDisplayName(
                contact.namaLengkap,
                convPush || quotedPushName,
                fromPhone
              ) || 'Pelanggan';
          } else {
            replyToSender = quotedPushName || 'Anggota Grup';
          }
        }

        const outboundOrigin = isFromMe ? detectWahaOutboundOrigin(payload) : null;
        const effectiveMsgMeta =
          outboundOrigin || richData.metadata
            ? {
                ...(richData.metadata || {}),
                ...(outboundOrigin
                  ? {
                      sentVia: outboundOrigin.sentVia,
                      sentViaLabel: outboundOrigin.label,
                      sentDeviceType: outboundOrigin.deviceType,
                    }
                  : {}),
              }
            : null;

        // Create ChatMessage
        await db.insert(chatMessages).values({
          id: crypto.randomUUID(),
          companyId,
          conversationId: convId,
          contactId: contact.id,
          direction: isFromMe ? 'OUTBOUND' : 'INBOUND',
          messageType: richData.messageType,
          channel: 'WHATSAPP',
          wahaSession: inboundSession,
          senderJid: isGroupChat ? groupSenderJid : rawFrom || null,
          senderPhone: isGroupChat ? groupSenderPhone : fromPhone || null,
          senderName: isGroupChat
            ? groupSenderName
            : isFromMe
            ? outboundOrigin?.label || notifyName || 'WhatsApp HP / Web'
            : notifyName || null,
          body,
          mediaUrl,
          mediaType,
          mediaName: mediaMeta.isSticker && !mediaName ? 'sticker.webp' : mediaName,
          metadataJson: effectiveMsgMeta ? JSON.stringify(effectiveMsgMeta) : null,
          replyToMessageId,
          replyToBody,
          replyToSender,
          wahaMessageId: msgId,
          status: isFromMe ? 'SENT' : 'DELIVERED',
          ackStatus: isFromMe ? 1 : 2,
          sentAt: isFromMe ? now : null,
          createdAt: now,
        }).onConflictDoNothing();

        // Capture WhatsApp profile (name & photo) of the contact or group without delaying the webhook response
        const profileJid = isGroupChat
          ? groupJid
          : fromPhone
          ? `${fromPhone}@c.us`
          : rawFrom;
        if (profileJid) {
          void runWithCompany(companyId, () =>
            syncWhatsAppProfile({
              companyId,
              contactId: contact.id,
              jid: profileJid,
              session: inboundSession,
              isGroup: isGroupChat,
            })
          ).catch(() => {});
        }

        wahaService.recordWebhookEvent({
          receivedAt: now.toISOString(),
          event,
          session: inboundSession,
          from: isGroupChat ? (groupSenderPhone || groupJid || rawFrom) : (fromPhone || rawFrom),
          outcome: 'PROCESSED',
          note: isFromMe
            ? 'Pesan keluar dari WA langsung (fromMe) dicatat ke inbox'
            : existingConv
            ? isGroupChat
              ? 'Pesan grup masuk ditambahkan ke inbox'
              : 'Pesan masuk ditambahkan ke inbox'
            : isGroupChat
            ? 'Percakapan grup WA baru dibuat (otomatis Non-Penilaian)'
            : 'Percakapan baru dibuat di inbox',
        }, companyId);

        liveEvents.emit('conversations:presence', {
          conversationId: convId,
          presence: 'paused',
          session: inboundSession || null,
          updatedAt: now.toISOString(),
        }, companyId);
        liveEvents.emit('conversations:update', { conversationId: convId }, companyId);
        liveEvents.emit('tracking:update', { conversationId: convId }, companyId);

        if (body && !isFromMe && !isGroupChat && !contact.excludeFromMetrics && !existingConv?.excludeFromMetrics) {
          void runWithCompany(companyId, () =>
            handleInboundAutomation({
              conversationId: convId,
              contact,
              assignedAgentId: existingConv?.assignedAgentId || null,
              inboundBody: body,
              externalThreadId: isLidSource ? rawFrom : existingConv?.externalThreadId || null,
              sessionName: inboundSession || existingConv?.wahaSession || null,
              isNewConversation: createdConversation,
            })
          );
        }
        return reply.send({ success: true, message: 'Webhook processed' });
        });
      } else if (
        event &&
        event !== 'message.ack' &&
        event !== 'message.reaction' &&
        event !== 'message.revoked' &&
        event !== 'poll.vote' &&
        event !== 'poll.vote.failed' &&
        event !== 'session.status' &&
        event !== 'presence.update'
      ) {
        wahaService.recordWebhookEvent({
          receivedAt: new Date().toISOString(),
          event: String(event),
          session: webhookSession || null,
          from: rawFrom || null,
          outcome: 'IGNORED',
          note: `Event "${event}" diterima`,
        }, companyId);
      }

      return reply.send({ success: true, message: 'Webhook processed' });
    } catch (error: any) {
      wahaService.recordWebhookEvent({
        receivedAt: new Date().toISOString(),
        event: String(req.body?.event || 'unknown'),
        session: req.body?.session || null,
        from: req.body?.payload?.from || null,
        outcome: 'ERROR',
        note: error.message,
      }, companyId);
      console.error('[WAHA Webhook] Error:', error.message);
      return reply.status(500).send({ success: false, error: error.message });
    }
    });
  });
}
