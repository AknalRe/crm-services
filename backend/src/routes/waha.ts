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
import { wahaService } from '../services/waha.service';
import { licenseService } from '../services/license.service';
import { liveEvents } from '../services/events.service';
import {
  fromWahaChatId,
  isPersonalWahaJid,
  isPhoneWahaJid,
  normalizePhoneNumber,
} from '../services/phone.utils';
import { handleInboundAutomation } from '../services/automation.service';
import { requirePermission } from './auth';
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
    payload?.from,
    payload?.chatId,
    payload?._data?.Info?.SenderAlt,
    payload?._data?.Info?.Chat,
    payload?._data?.Info?.RecipientAlt,
    payload?._data?.key?.remoteJidAlt,
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
      const lic = await licenseService.assertLicenseActive();
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
    Body: { event: string; session?: string; payload: any };
  }>, reply: FastifyReply) => {
    try {
      const { event, session: webhookSession, payload } = req.body || {};
      console.log(`[WAHA Webhook] Received event: ${event}`);

      if (event === 'session.status') {
        wahaService.recordWebhookEvent({
          receivedAt: new Date().toISOString(),
          event,
          session: webhookSession || payload?.name || null,
          from: null,
          outcome: 'PROCESSED',
          note: `Status sesi: ${payload?.status || '-'}`,
        });
        liveEvents.emit('waha:status', {
          action: 'webhook',
          session: webhookSession || payload?.name,
          status: payload?.status,
        });
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
            .where(or(...recipientConditions));

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
                  .where(eq(campaigns.id, recipient.campaignId));
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
                    .where(eq(campaigns.id, recipient.campaignId));
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
            .where(and(or(...chatConditions), lt(chatMessages.ackStatus, ackValue)));

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
                .where(and(eq(scheduledPosts.channel, 'WHATSAPP_STATUS'), or(...statusPostConditions)));

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
                });
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
        });
        liveEvents.emit('tracking:update', { ack: ackValue, msgId: exactIds[0] });
        liveEvents.emit('conversations:update', { ack: ackValue, msgId: exactIds[0] });
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
              .where(inArray(contacts.nomorWhatsapp, variants))
              .limit(1);
            matchedContactId = found[0]?.id || null;
          }

          if (!matchedContactId) {
            const idRow = await db
              .select({ contactId: contactIdentities.contactId })
              .from(contactIdentities)
              .where(
                and(
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
              .where(and(eq(conversations.contactId, matchedContactId), eq(conversations.channel, 'WHATSAPP')))
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
              });
            }
          }
        }
      }

      // 2. Incoming Messages (message / message.any) - personal 1:1 chats (@c.us / @s.whatsapp.net / @lid)
      const isInboundMessageEvent = event === 'message' || event === 'message.any';
      const rawFrom = String(
        payload?.from ||
        payload?.chatId ||
        payload?._data?.Info?.Chat ||
        payload?._data?.key?.remoteJid ||
        ''
      ).trim();
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
        if (isWahaFromMe(payload)) {
          return reply.send({ success: true, message: 'Webhook ignored (fromMe)' });
        }
        if (!isPersonalChat && !isGroupChat) {
          wahaService.recordWebhookEvent({
            receivedAt: now.toISOString(),
            event,
            session: webhookSession || null,
            from: rawFrom || null,
            outcome: 'IGNORED',
            note: 'Bukan chat personal atau grup WA',
          });
          return reply.send({ success: true, message: 'Webhook ignored (unsupported JID)' });
        }

        const inboundSession = webhookSession ? String(webhookSession).trim() : null;
        const { exactIds } = extractWahaMessageIds(payload);
        const msgId = exactIds[0] || null;

        if (msgId) {
          const dupMsg = await db
            .select({ id: chatMessages.id, conversationId: chatMessages.conversationId })
            .from(chatMessages)
            .where(eq(chatMessages.wahaMessageId, msgId))
            .limit(1);
          if (dupMsg[0]) {
            wahaService.recordWebhookEvent({
              receivedAt: now.toISOString(),
              event,
              session: inboundSession,
              from: rawFrom,
              outcome: 'DEDUP',
              note: 'Pesan duplikat diabaikan',
            });
            return reply.send({ success: true, deduplicated: true, message: 'Duplicate webhook ignored' });
          }
        }

        const mediaMeta = extractInboundWahaMediaMeta(payload);
        let mediaUrl: string | null = mediaMeta.rawMediaUrl;
        const mediaType = mediaMeta.mediaType;
        const mediaName = mediaMeta.mediaName;
        const hasMedia = mediaMeta.hasMedia;
        const rawText = extractInboundWahaText(payload);

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
        const body = rawText || (hasMedia ? mediaFallbackLabel : '');

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

        if (!body && !hasMedia) {
          wahaService.recordWebhookEvent({
            receivedAt: now.toISOString(),
            event,
            session: inboundSession,
            from: rawFrom,
            outcome: 'IGNORED',
            note: 'Event tanpa isi pesan atau media',
          });
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
                eq(contactIdentities.channel, 'WHATSAPP'),
                eq(contactIdentities.externalId, groupJid)
              )
            )
            .limit(1);

          if (groupIdRows[0]) {
            const byId = await db
              .select()
              .from(contacts)
              .where(eq(contacts.id, groupIdRows[0].contactId))
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
              .where(inArray(contacts.nomorWhatsapp, pVariants))
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

          // Find contact by normalized phone OR WAHA @lid contact identity
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
              .where(inArray(contacts.nomorWhatsapp, phoneVariants));
            contact = contactList[0];
          }

          if (!contact && isLidSource) {
            const identityRows = await db
              .select()
              .from(contactIdentities)
              .where(
                and(
                  eq(contactIdentities.channel, 'WHATSAPP'),
                  eq(contactIdentities.externalId, rawFrom)
                )
              );
            if (identityRows[0]) {
              const byId = await db
                .select()
                .from(contacts)
                .where(eq(contacts.id, identityRows[0].contactId));
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
                  .where(eq(contacts.nomorWhatsapp, fromPhone));
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
          .where(and(eq(conversations.contactId, contact.id), eq(conversations.channel, 'WHATSAPP')))
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
            firstInboundAt: now,
            lastInboundAt: now,
            sessionStartedAt: now,
            unreadCount: 1,
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
              firstInboundAt: existingConv.firstInboundAt || now,
              lastInboundAt: now,
              lastMessage: effectiveConversationPreview,
              lastMessageAt: now,
              unreadCount: sql`${conversations.unreadCount} + 1`,
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
            .where(eq(chatMessages.wahaMessageId, String(quotedWahaId)))
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
          conversationId: convId,
          contactId: contact.id,
          direction: 'INBOUND',
          messageType: mediaType ? 'MEDIA' : 'TEXT',
          channel: 'WHATSAPP',
          wahaSession: inboundSession,
          senderJid: isGroupChat ? groupSenderJid : rawFrom || null,
          senderPhone: isGroupChat ? groupSenderPhone : fromPhone || null,
          senderName: isGroupChat ? groupSenderName : notifyName || null,
          body,
          mediaUrl,
          mediaType,
          mediaName,
          replyToMessageId,
          replyToBody,
          replyToSender,
          wahaMessageId: msgId,
          status: 'DELIVERED',
          ackStatus: 2,
          createdAt: now,
        });

        wahaService.recordWebhookEvent({
          receivedAt: now.toISOString(),
          event,
          session: inboundSession,
          from: isGroupChat ? (groupSenderPhone || groupJid || rawFrom) : (fromPhone || rawFrom),
          outcome: 'PROCESSED',
          note: existingConv
            ? isGroupChat
              ? 'Pesan grup masuk ditambahkan ke inbox'
              : 'Pesan masuk ditambahkan ke inbox'
            : isGroupChat
            ? 'Percakapan grup WA baru dibuat (otomatis Non-Penilaian)'
            : 'Percakapan baru dibuat di inbox',
        });

        liveEvents.emit('conversations:presence', {
          conversationId: convId,
          presence: 'paused',
          session: inboundSession || null,
          updatedAt: now.toISOString(),
        });
        liveEvents.emit('conversations:update', { conversationId: convId });
        liveEvents.emit('tracking:update', { conversationId: convId });

        if (body && !isGroupChat && !contact.excludeFromMetrics && !existingConv?.excludeFromMetrics) {
          void handleInboundAutomation({
            conversationId: convId,
            contact,
            assignedAgentId: existingConv?.assignedAgentId || null,
            inboundBody: body,
            externalThreadId: isLidSource ? rawFrom : existingConv?.externalThreadId || null,
            sessionName: inboundSession || existingConv?.wahaSession || null,
            isNewConversation: !existingConv,
          });
        }
      } else if (
        event &&
        event !== 'message.ack' &&
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
        });
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
      });
      console.error('[WAHA Webhook] Error:', error.message);
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
