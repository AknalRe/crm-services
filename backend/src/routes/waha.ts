import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { and, desc, eq, inArray, like, lt, or, sql } from 'drizzle-orm';
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
import crypto from 'crypto';

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

  // 2. Revoked / Deleted for everyone by sender (protocolMessage type 0 / REVOKE)
  const protoMsg = msg?.protocolMessage;
  if (
    protoMsg &&
    (protoMsg.type === 0 || String(protoMsg.type).toUpperCase() === 'REVOKE') &&
    protoMsg?.key?.id
  ) {
    return {
      messageType: 'TEXT',
      body: '',
      metadata: null,
      revokedTargetId: String(protoMsg.key.id).trim(),
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
  if (rawMime.startsWith('image/') || isSticker || imgMsg || rawType === 'image') {
    mediaType = 'image';
  } else if (rawMime.startsWith('video/') || vidMsg || rawType === 'video') {
    mediaType = 'video';
  } else if (rawMime.startsWith('audio/') || audMsg || rawType === 'audio' || rawType === 'ptt') {
    mediaType = 'audio';
  } else if (docMsg || rawType === 'document' || payload?.hasMedia || rawMediaUrl || inlineBase64) {
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

export function extractPhoneCandidatesFromWahaPayload(payload: any): string[] {
  const raw = [
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
            : richReaction.revokedTargetId || payload?.revokedMessageId || payload?.id || null;

        if (targetIdCandidate) {
          const cleanTarget = String(targetIdCandidate).trim();
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
            .limit(1);
          if (targetMsgs[0]) {
            const targetMsg = targetMsgs[0];
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
              await db
                .update(chatMessages)
                .set({ metadataJson: JSON.stringify({ ...prevMeta, revoked: true }) })
                .where(eq(chatMessages.id, targetMsg.id));
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

      // 2. Incoming & Direct Outgoing Messages (message / message.any)
      const isInboundMessageEvent = event === 'message' || event === 'message.any';
      const isFromMe = isWahaFromMe(payload);
      const rawTarget = isFromMe
        ? String(
            payload?.to ||
            payload?.chatId ||
            payload?._data?.key?.remoteJid ||
            payload?._data?.Info?.Chat ||
            payload?.from ||
            ''
          ).trim()
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

        // Dedup: for group chats, scope by session so each session inbox is populated independently.
        // For personal chats, global dedup by wahaMessageId is sufficient.
        if (msgId) {
          const isGroupForDedup =
            !rawFrom ||
            rawFrom.toLowerCase().endsWith('@g.us') ||
            String(payload?.chatId || '').toLowerCase().endsWith('@g.us');
          const dedupConditions = isGroupForDedup && inboundSession
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
            .limit(1);
          if (targetMsgs[0]) {
            const targetMsg = targetMsgs[0];
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
                or(eq(chatMessages.wahaMessageId, cleanTarget), like(chatMessages.wahaMessageId, `%_${stanzaPart}`))
              )
            )
            .limit(1);
          if (targetMsgs[0]) {
            const targetMsg = targetMsgs[0];
            let prevMeta: Record<string, any> = {};
            if (targetMsg.metadataJson) {
              try {
                prevMeta = JSON.parse(targetMsg.metadataJson);
              } catch {
                prevMeta = {};
              }
            }
            await db
              .update(chatMessages)
              .set({ metadataJson: JSON.stringify({ ...prevMeta, revoked: true }) })
              .where(eq(chatMessages.id, targetMsg.id));
            liveEvents.emit('conversations:update', { conversationId: targetMsg.conversationId }, companyId);
          }
          return reply.send({ success: true, message: 'Message revocation processed' });
        }

        // Download & persist inbound WAHA media locally so files never disappear when WAHA purges /api/files/
        if (hasMedia) {
          if (mediaMeta.inlineBase64) {
            try {
              const saved = await saveBase64MediaFile({
                base64: mediaMeta.inlineBase64,
                mimeType: mediaMeta.mimetype || undefined,
                fileName: mediaName || undefined,
                maxBytes: 25 * 1024 * 1024,
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

        const quotedWahaId =
          (typeof payload.replyTo === 'string' ? payload.replyTo : payload.replyTo?.id) ||
          payload._data?.quotedStanzaID ||
          payload._data?.message?.extendedTextMessage?.contextInfo?.stanzaId ||
          payload._data?.Message?.extendedTextMessage?.contextInfo?.stanzaId ||
          null;
        const quotedRawBody =
          payload.replyTo?.body ||
          payload._data?.quotedMsg?.body ||
          payload._data?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
          payload._data?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text ||
          null;

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
            await db
              .insert(contactIdentities)
              .values({
                id: crypto.randomUUID(),
                companyId,
                contactId: contact.id,
                channel: 'WHATSAPP',
                externalId: groupJid,
                handle: effectiveGroupName,
                createdAt: now,
              })
              .onConflictDoNothing()
              .catch(() => {});
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
          fromPhone = extractPhoneCandidatesFromWahaPayload(payload)[0] || null;
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
            const contactName = notifyName || `Kontak ${fallbackSuffix}`;
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
          } else if (fromPhone && !contact.nomorWhatsapp) {
            await db
              .update(contacts)
              .set({ nomorWhatsapp: fromPhone, updatedAt: now })
              .where(eq(contacts.id, contact.id))
              .catch(() => {});
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

        const existingConv = normalizedInboundSession
          ? convList.find((c) => c.wahaSession === normalizedInboundSession) ||
            convList.find((c) => !c.wahaSession)
          : convList[0];
        let convId: string;

        const contactExcluded = Boolean(isGroupChat || contact.excludeFromMetrics);
        const contactExcludeReason = isGroupChat
          ? 'Grup WhatsApp'
          : contact.excludeFromMetrics
          ? (contact.excludeReason || 'Bukan Customer')
          : null;

        if (!existingConv) {
          convId = crypto.randomUUID();
          await db.insert(conversations).values({
            id: convId,
            companyId,
            contactId: contact.id,
            channel: 'WHATSAPP',
            externalThreadId: isGroupChat ? groupJid : isLidSource ? rawFrom : null,
            contextTitle: isGroupChat ? (resolvedGroupSubject || contact.namaLengkap) : null,
            wahaSession: normalizedInboundSession,
            pushName: isGroupChat ? (resolvedGroupSubject || contact.namaLengkap) : notifyName || null,
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
        } else {
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
                : notifyName || existingConv.pushName,
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
          const quotedRows = await db
            .select({
              id: chatMessages.id,
              body: chatMessages.body,
              direction: chatMessages.direction,
              senderName: chatMessages.senderName,
            })
            .from(chatMessages)
            .where(and(eq(chatMessages.companyId, companyId), eq(chatMessages.wahaMessageId, String(quotedWahaId))))
            .limit(1);
          if (quotedRows[0]) {
            replyToMessageId = quotedRows[0].id;
            if (!replyToBody) replyToBody = quotedRows[0].body.slice(0, 160);
            replyToSender =
              quotedRows[0].direction === 'OUTBOUND'
                ? 'Tim CS'
                : (quotedRows[0].senderName || contact.namaLengkap || 'Pelanggan');
          }
        }

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
          senderName: isGroupChat ? groupSenderName : isFromMe ? (notifyName || 'WhatsApp Langsung') : notifyName || null,
          body,
          mediaUrl,
          mediaType,
          mediaName: mediaMeta.isSticker && !mediaName ? 'sticker.webp' : mediaName,
          metadataJson: richData.metadata ? JSON.stringify(richData.metadata) : null,
          replyToMessageId,
          replyToBody,
          replyToSender,
          wahaMessageId: msgId,
          status: isFromMe ? 'SENT' : 'DELIVERED',
          ackStatus: isFromMe ? 1 : 2,
          sentAt: isFromMe ? now : null,
          createdAt: now,
        });

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
              isNewConversation: !existingConv,
            })
          );
        }
      } else if (
        event &&
        event !== 'message.ack' &&
        event !== 'message.reaction' &&
        event !== 'message.revoked' &&
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
