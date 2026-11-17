import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { and, eq, ne, desc, asc, gt, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  conversations,
  chatMessages,
  contacts,
  contactIdentities,
  crmAgents,
  cannedResponses,
  csatResponses,
  channelAccounts,
} from '../db/schema';
import {
  wahaService,
  WahaInteractiveButtonInput,
  WahaLocationData,
  WahaSendResult,
  WahaSharedContactItem,
  formatInteractiveButtonsFallbackText,
  formatLinkPreviewFallbackText,
} from '../services/waha.service';
import { fromWahaChatId, normalizePhoneNumber } from '../services/phone.utils';
import { licenseService } from '../services/license.service';
import { liveEvents } from '../services/events.service';
import {
  getActiveCompanyId,
  getCompanySettingValue,
  upsertCompanySetting,
} from '../services/tenantContext';
import { OmnichannelType, sendOutboundChannelMessage } from '../services/channel.service';
import {
  buildCsatSnapshot,
  DEFAULT_CSAT_CTA_TEMPLATE,
  extractCsatCriteriaDetails,
  parseCsatSurveyConfig,
  resolveCsatProfileForConversation,
} from '../services/csat.service';
import {
  getCurrentAuthUser,
  getRequestCompanyId,
  getSettingMap,
  hasUserPermission,
  requirePermission,
} from './auth';
import { readUploadedMediaAsDataUri, saveBase64MediaFile } from './media';
import { pickBestContactDisplayName, isGenericDisplayName } from './waha';
import { syncWhatsAppProfile } from '../services/profile.service';
import crypto from 'crypto';

const VALID_STATUSES = new Set(['OPEN', 'PENDING', 'RESOLVED']);

export interface ResolvedMention {
  token: string;
  jid: string | null;
  phone: string | null;
  name: string | null;
  contactId: string | null;
}

// Extract @mention tokens (phone or @lid digits) from message text and stored WAHA mention JIDs
export function collectMentionTokens(body?: string | null, metadataJson?: string | null): Map<string, string | null> {
  const tokens = new Map<string, string | null>();
  for (const m of String(body || '').matchAll(/@(\d{6,20})\b/g)) {
    if (!tokens.has(m[1])) tokens.set(m[1], null);
  }
  if (metadataJson) {
    try {
      const meta = JSON.parse(metadataJson);
      if (Array.isArray(meta?.mentions)) {
        for (const raw of meta.mentions) {
          const jid = String(raw || '').trim();
          const digits = jid.replace(/@.*$/, '').replace(/\D/g, '');
          if (digits.length >= 6) tokens.set(digits, jid.includes('@') ? jid : null);
        }
      }
    } catch {
      // ignore invalid metadata
    }
  }
  return tokens;
}

function phoneLookupVariants(phone: string): string[] {
  return Array.from(
    new Set([phone, `+${phone}`, phone.startsWith('62') ? `0${phone.slice(2)}` : ''].filter(Boolean))
  );
}

// Resolve mentioned numbers to CRM contact names so chat text can show "@Nama" and link to the contact
export async function resolveMessageMentions(params: {
  companyId: string;
  messages: Array<typeof chatMessages.$inferSelect>;
}): Promise<Map<string, ResolvedMention[]>> {
  const result = new Map<string, ResolvedMention[]>();
  const sessionForLookup = params.messages.find((m) => m.wahaSession)?.wahaSession || undefined;
  const perMessage = new Map<string, Map<string, string | null>>();
  const allTokens = new Map<string, string | null>();
  for (const msg of params.messages) {
    const tokens = collectMentionTokens(msg.body, msg.metadataJson);
    if (tokens.size === 0) continue;
    perMessage.set(msg.id, tokens);
    for (const [t, jid] of tokens) {
      if (!allTokens.has(t) || (!allTokens.get(t) && jid)) allTokens.set(t, jid);
    }
  }
  if (allTokens.size === 0) return result;

  const senderNames = new Map<string, string>();
  for (const msg of params.messages) {
    if (msg.direction !== 'INBOUND' || !msg.senderName) continue;
    const keys = [
      msg.senderPhone ? msg.senderPhone.replace(/\D/g, '') : '',
      msg.senderJid ? msg.senderJid.replace(/@.*$/, '').replace(/\D/g, '') : '',
    ].filter(Boolean);
    for (const k of keys) {
      if (!senderNames.has(k) && !isGenericDisplayName(msg.senderName)) senderNames.set(k, msg.senderName);
    }
  }

  const lidJids = Array.from(allTokens.entries())
    .filter(([, jid]) => jid && jid.toLowerCase().endsWith('@lid'))
    .map(([, jid]) => jid as string);
  const identityByLid = new Map<string, string>();
  if (lidJids.length > 0) {
    const idRows = await db
      .select({ externalId: contactIdentities.externalId, contactId: contactIdentities.contactId })
      .from(contactIdentities)
      .where(
        and(
          eq(contactIdentities.companyId, params.companyId),
          eq(contactIdentities.channel, 'WHATSAPP'),
          inArray(contactIdentities.externalId, lidJids)
        )
      );
    for (const r of idRows) identityByLid.set(r.externalId.toLowerCase(), r.contactId);
  }

  const phoneByToken = new Map<string, string | null>();
  let lidResolveBudget = 8;
  for (const [token, jid] of allTokens) {
    if (jid && jid.toLowerCase().endsWith('@lid')) {
      let phone: string | null = null;
      if (!identityByLid.has(jid.toLowerCase()) && lidResolveBudget > 0) {
        lidResolveBudget -= 1;
        phone = await wahaService.resolveLidToPhone(sessionForLookup, jid).catch(() => null);
      }
      phoneByToken.set(token, phone);
    } else {
      phoneByToken.set(token, normalizePhoneNumber(token) || token);
    }
  }

  const phones = Array.from(new Set(Array.from(phoneByToken.values()).filter(Boolean) as string[]));
  const contactByPhone = new Map<string, { id: string; namaLengkap: string }>();
  const contactById = new Map<string, { id: string; namaLengkap: string; nomorWhatsapp: string | null }>();
  if (phones.length > 0) {
    const variants = Array.from(new Set(phones.flatMap(phoneLookupVariants)));
    const rows = await db
      .select({ id: contacts.id, namaLengkap: contacts.namaLengkap, nomorWhatsapp: contacts.nomorWhatsapp })
      .from(contacts)
      .where(and(eq(contacts.companyId, params.companyId), inArray(contacts.nomorWhatsapp, variants)));
    for (const r of rows) {
      if (r.nomorWhatsapp) {
        contactByPhone.set(normalizePhoneNumber(r.nomorWhatsapp) || r.nomorWhatsapp, r);
      }
    }
  }
  const lidContactIds = Array.from(new Set(identityByLid.values()));
  if (lidContactIds.length > 0) {
    const rows = await db
      .select({ id: contacts.id, namaLengkap: contacts.namaLengkap, nomorWhatsapp: contacts.nomorWhatsapp })
      .from(contacts)
      .where(and(eq(contacts.companyId, params.companyId), inArray(contacts.id, lidContactIds)));
    for (const r of rows) contactById.set(r.id, r);
  }

  const resolvedByToken = new Map<string, ResolvedMention>();
  for (const [token, jid] of allTokens) {
    let phone = phoneByToken.get(token) || null;
    let contactRow: { id: string; namaLengkap: string; nomorWhatsapp?: string | null } | undefined;
    if (jid && jid.toLowerCase().endsWith('@lid')) {
      const cid = identityByLid.get(jid.toLowerCase());
      if (cid) contactRow = contactById.get(cid);
      if (contactRow?.nomorWhatsapp && !phone) {
        phone = normalizePhoneNumber(contactRow.nomorWhatsapp) || contactRow.nomorWhatsapp;
      }
    }
    if (!contactRow && phone) contactRow = contactByPhone.get(phone);
    const pushName = senderNames.get(token) || (phone ? senderNames.get(phone) : undefined) || null;
    const best = pickBestContactDisplayName(contactRow?.namaLengkap, pushName, null);
    resolvedByToken.set(token, {
      token,
      jid,
      phone,
      name: best && !isGenericDisplayName(best) ? best : null,
      contactId: contactRow?.id || null,
    });
  }

  for (const [msgId, tokens] of perMessage) {
    const list = Array.from(tokens.keys())
      .map((t) => resolvedByToken.get(t))
      .filter((x): x is ResolvedMention => Boolean(x));
    if (list.length > 0) result.set(msgId, list);
  }
  return result;
}
const DEFAULT_CSAT_TEMPLATE =
  'Halo {nama_panggilan}, terima kasih telah menghubungi kami. Mohon bantuannya untuk memberikan penilaian layanan kami melalui tautan berikut:\n{link_csat}';

export function selectWhatsAppConversationForSession<
  T extends { wahaSession?: string | null; isGroup?: boolean | null; externalThreadId?: string | null }
>(existingRows: T[], requestedSession?: string | null): T | undefined {
  const directRows = existingRows.filter(
    (c) => !c.isGroup && !(c.externalThreadId || '').toLowerCase().endsWith('@g.us')
  );
  const pool = directRows.length > 0 ? directRows : existingRows;
  const cleanReq = String(requestedSession || '').trim().toLowerCase();
  if (!cleanReq) {
    return pool[0];
  }
  return (
    pool.find((c) => (c.wahaSession || '').trim().toLowerCase() === cleanReq) ||
    pool.find((c) => !(c.wahaSession || '').trim())
  );
}

function resolveRequestAppBaseUrl(req: FastifyRequest): string {
  const rawPrefix = String(req.headers['x-forwarded-prefix'] || '').split(',')[0].trim();
  const fwdPrefix =
    rawPrefix && /^\/app\/[^/]+/i.test(rawPrefix) ? rawPrefix.replace(/\/+$/, '') : '';
  const fwdHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const fwdProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  if (fwdHost) {
    const proto = fwdProto || (req.protocol === 'https' ? 'https' : 'http');
    let appPrefix = fwdPrefix;
    if (!appPrefix) {
      const referer = String(req.headers.referer || '').trim();
      const m = referer.match(/https?:\/\/[^/]+(\/app\/[^/]+)/i);
      if (m) appPrefix = m[1];
    }
    return `${proto}://${fwdHost}${appPrefix}`;
  }

  const referer = String(req.headers.referer || '').trim();
  if (referer) {
    try {
      const u = new URL(referer);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        const appMatch = u.pathname.match(/^(\/app\/[^/]+)/i);
        return `${u.origin}${appMatch ? appMatch[1] : fwdPrefix}`;
      }
    } catch {
      // ignore invalid referer
    }
  }
  const host = String(req.headers.host || '').trim();
  if (!host) return '';
  const proto = fwdProto || (req.protocol === 'https' ? 'https' : 'http');
  return `${proto}://${host}${fwdPrefix}`;
}

async function resolveWhatsAppTarget(
  conv: typeof conversations.$inferSelect,
  contact: typeof contacts.$inferSelect
): Promise<string | null> {
  if (conv.externalThreadId && conv.externalThreadId.toLowerCase().endsWith('@g.us')) {
    return conv.externalThreadId.trim();
  }
  if (contact.nomorWhatsapp && contact.nomorWhatsapp.trim()) {
    return contact.nomorWhatsapp.trim();
  }
  if (conv.externalThreadId && conv.externalThreadId.trim()) {
    return conv.externalThreadId.trim();
  }
  const idRows = await db
    .select({ externalId: contactIdentities.externalId })
    .from(contactIdentities)
    .where(and(eq(contactIdentities.contactId, contact.id), eq(contactIdentities.channel, 'WHATSAPP')))
    .limit(1);
  return idRows[0]?.externalId || null;
}

async function sendCsatCtaForConversation(
  conv: typeof conversations.$inferSelect,
  contact: typeof contacts.$inferSelect,
  opts: { session?: string; baseUrl?: string; customMessage?: string; triggerType?: 'MANUAL' | 'AUTO_RESOLVE' }
) {
  const settings = await getSettingMap();
  const surveyConfig = parseCsatSurveyConfig(settings.csat_survey_config);
  const matchedProfile = resolveCsatProfileForConversation(surveyConfig, {
    channel: conv.channel,
    wahaSession: opts.session?.trim() || conv.wahaSession,
    labels: conv.labels,
  });
  const snapshot = buildCsatSnapshot(matchedProfile);

  const token = crypto.randomBytes(12).toString('hex');
  const configuredBase = (settings.csat_base_url || '').trim().replace(/\/+$/, '');
  const runtimeBase = (opts.baseUrl || '').trim().replace(/\/+$/, '');
  const base = configuredBase || runtimeBase;
  const csatUrl = base
    ? `${base.replace(/\/csat$/i, '')}/csat?token=${token}`
    : `/csat?token=${token}`;
  const template =
    (opts.customMessage || '').trim() ||
    (matchedProfile.ctaTemplate || '').trim() ||
    settings.csat_template ||
    DEFAULT_CSAT_CTA_TEMPLATE;
  const namaPanggilan = contact.namaPanggilan || contact.namaLengkap;
  const ctaBody = template
    .replace(/\{nama_panggilan\}/gi, namaPanggilan)
    .replace(/\{nama_lengkap\}/gi, contact.namaLengkap)
    .replace(/\{link_csat\}/gi, csatUrl);

  const targetSession = opts.session?.trim() || conv.wahaSession || undefined;
  const convChannel = ((conv.channel || 'WHATSAPP').toUpperCase()) as OmnichannelType;
  let sendResult: { success: boolean; messageId?: string; sessionUsed?: string; error?: string };

  if (convChannel !== 'WHATSAPP') {
    const out = await sendOutboundChannelMessage({
      channel: convChannel,
      channelAccountId: conv.channelAccountId,
      contactId: conv.contactId,
      externalThreadId: conv.externalThreadId,
      text: ctaBody,
    });
    sendResult = { success: true, messageId: out.externalMessageId || undefined };
  } else {
    const targetWa = await resolveWhatsAppTarget(conv, contact);
    if (!targetWa) {
      throw new Error('Kontak belum memiliki nomor WhatsApp');
    }
    sendResult = await wahaService.sendTextMessage(
      targetWa,
      ctaBody,
      targetSession
    );
    if (!sendResult.success) {
      throw new Error(sendResult.error || 'Gagal mengirim tautan CSAT melalui WhatsApp');
    }
  }

  const effectiveSession = sendResult.sessionUsed || targetSession || null;
  const now = new Date();
  const cycleStartedAt = conv.sessionStartedAt || conv.firstInboundAt || conv.createdAt || now;
  const cycleResolvedAt =
    conv.resolvedAt || (opts.triggerType === 'AUTO_RESOLVE' ? now : null);
  const companyId = conv.companyId || getActiveCompanyId();
  await db.insert(csatResponses).values({
    id: crypto.randomUUID(),
    companyId,
    conversationId: conv.id,
    contactId: conv.contactId,
    wahaSession: effectiveSession,
    assignedAgentId: conv.assignedAgentId || null,
    assignedAgentName: conv.assignedAgentName || null,
    token,
    triggerType: opts.triggerType || 'MANUAL',
    profileId: matchedProfile.id,
    profileName: matchedProfile.name,
    snapshotJson: JSON.stringify(snapshot),
    conversationStartedAt: cycleStartedAt,
    conversationResolvedAt: cycleResolvedAt,
    sentAt: now,
  });

  const inserted = await db
    .insert(chatMessages)
    .values({
      id: crypto.randomUUID(),
      companyId,
      conversationId: conv.id,
      contactId: conv.contactId,
      direction: 'OUTBOUND',
      messageType: 'CSAT',
      channel: convChannel,
      wahaSession: effectiveSession,
      body: ctaBody,
      wahaMessageId: sendResult.messageId || null,
      status: 'SENT',
      ackStatus: 1,
      sentAt: now,
      createdAt: now,
    })
    .returning();

  await db
    .update(conversations)
    .set({
      csatToken: token,
      wahaSession: effectiveSession || conv.wahaSession,
      firstResponseAt: conv.firstInboundAt && !conv.firstResponseAt ? now : conv.firstResponseAt,
      lastMessage: ctaBody,
      lastMessageAt: now,
      updatedAt: now,
    })
    .where(eq(conversations.id, conv.id));

  liveEvents.emit('conversations:update', { conversationId: conv.id }, companyId);
  liveEvents.emit('tracking:update', { conversationId: conv.id }, companyId);

  return {
    message: inserted[0],
    csatUrl,
    csatToken: token,
  };
}

const lastSeenSentByConv = new Map<string, string>();

type OutboundMessageKind =
  | 'TEXT'
  | 'MEDIA'
  | 'STICKER'
  | 'LOCATION'
  | 'CONTACT'
  | 'LINK_PREVIEW'
  | 'BUTTONS'
  | 'POLL';

const STICKER_PACK_SETTINGS_KEY = 'crm_sticker_pack_v1';

interface SavedStickerItem {
  id: string;
  name: string;
  mediaUrl: string;
  createdAt: string;
}

async function readSavedStickers(companyId?: string): Promise<SavedStickerItem[]> {
  const raw = await getCompanySettingValue(STICKER_PACK_SETTINGS_KEY, companyId);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x) => x && typeof x.id === 'string' && typeof x.mediaUrl === 'string')
      : [];
  } catch {
    return [];
  }
}

async function writeSavedStickers(items: SavedStickerItem[], companyId?: string): Promise<void> {
  await upsertCompanySetting(
    STICKER_PACK_SETTINGS_KEY,
    JSON.stringify(items.slice(0, 120)),
    companyId
  );
}

interface OutboundLinkPreviewPayload {
  url: string;
  title?: string;
  description?: string;
  caption?: string;
  imageUrl?: string;
  highQuality?: boolean;
}

interface OutboundButtonsPayload {
  header?: string;
  body: string;
  footer?: string;
  fallbackTextOnUnsupported?: boolean;
  buttons: WahaInteractiveButtonInput[];
}

interface OutboundPollPayload {
  question: string;
  options: string[];
  multipleAnswers?: boolean;
}

function buildPollFallbackDisplayText(poll: OutboundPollPayload): string {
  const lines = [`[Polling] ${poll.question.trim()}`];
  poll.options.forEach((opt, idx) => {
    lines.push(`${idx + 1}. ${opt}`);
  });
  return lines.join('\n');
}

async function markWhatsAppConversationSeen(
  conv: typeof conversations.$inferSelect,
  contact: typeof contacts.$inferSelect,
  messagesList: Array<typeof chatMessages.$inferSelect>,
  force = false
): Promise<{ seenSent: boolean; skippedByPrivacy?: boolean; error?: string }> {
  if (((conv.channel || 'WHATSAPP').toUpperCase()) !== 'WHATSAPP') {
    return { seenSent: false };
  }

  const privacy = await wahaService.resolveSessionPrivacy(conv.wahaSession, conv.companyId);
  if (!privacy.readReceipts) {
    return {
      seenSent: false,
      skippedByPrivacy: true,
      error: force
        ? 'Centang 2 biru (Read Receipts) dinonaktifkan pada pengaturan privasi sesi ini.'
        : undefined,
    };
  }
  if (!force && !privacy.autoReadOnOpen) {
    return { seenSent: false, skippedByPrivacy: true };
  }

  const inboundIds = messagesList
    .filter((m) => m.direction === 'INBOUND' && Boolean(m.wahaMessageId))
    .slice(-10)
    .map((m) => String(m.wahaMessageId).trim())
    .filter(Boolean);
  if (inboundIds.length === 0) return { seenSent: false };

  const latestId = inboundIds[inboundIds.length - 1];
  if (!force && lastSeenSentByConv.get(conv.id) === latestId) {
    return { seenSent: false };
  }
  lastSeenSentByConv.set(conv.id, latestId);

  const targetWa = await resolveWhatsAppTarget(conv, contact);
  if (!targetWa) return { seenSent: false };

  const res = await wahaService.sendSeen(targetWa, conv.wahaSession || undefined, {
    messageIds: inboundIds,
  });
  if (!res.success) {
    if (force) lastSeenSentByConv.delete(conv.id);
    return { seenSent: false, error: res.error };
  }
  return { seenSent: true };
}

export default async function conversationsRouter(fastify: FastifyInstance) {
  // Enforce Live Chat CRM license, menu access, and granular action permissions
  const checkConvPerm = requirePermission('conversations');
  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    await checkConvPerm(req, reply);
    if (reply.sent) return;
    try {
      await licenseService.assertFeature('liveChatCrm', undefined, getRequestCompanyId(req));
    } catch (err: any) {
      return reply.status(err.statusCode || 403).send({
        success: false,
        code: 'FEATURE_LOCKED',
        feature: 'liveChatCrm',
        error: err.message,
      });
    }

    const routePath = (req.routeOptions?.url || req.url || '').toLowerCase();
    if (req.method === 'DELETE' && (routePath.includes('/messages/') || routePath.includes('/stickers/'))) {
      return requirePermission('conversations.reply', 'conversations.manage')(req, reply);
    }
    if (req.method === 'POST' && routePath.endsWith('/csat-cta')) {
      return requirePermission('conversations.csat')(req, reply);
    }
    if (
      req.method === 'POST' &&
      (routePath.endsWith('/messages') ||
        routePath.endsWith('/open') ||
        routePath.endsWith('/retry') ||
        routePath.endsWith('/typing') ||
        routePath.endsWith('/reaction') ||
        routePath.endsWith('/stickers') ||
        routePath.endsWith('/save-shared-contact'))
    ) {
      return requirePermission('conversations.reply', 'conversations.manage')(req, reply);
    }
    if (
      (req.method === 'PATCH' || req.method === 'POST' || req.method === 'DELETE') &&
      !routePath.endsWith('/read')
    ) {
      return requirePermission('conversations.manage')(req, reply);
    }
  });

  // GET / POST / DELETE Saved Sticker Pack for Live Chat CRM
  fastify.get('/stickers', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const items = await readSavedStickers(getRequestCompanyId(req));
      return reply.send({ success: true, data: items });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post('/stickers', async (req: FastifyRequest<{
    Body: { name?: string; mediaBase64?: string; mimetype?: string; mediaUrl?: string };
  }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const name = String(req.body?.name || '').trim() || `Stiker ${new Date().toLocaleDateString('id-ID')}`;
      let storedUrl = String(req.body?.mediaUrl || '').trim();
      if (!storedUrl && req.body?.mediaBase64) {
        const saved = await saveBase64MediaFile({
          base64: req.body.mediaBase64,
          mimeType: req.body.mimetype || 'image/webp',
          fileName: `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.webp`,
          maxBytes: 5 * 1024 * 1024,
        });
        storedUrl = saved.relativeUrl;
      }
      if (!storedUrl) {
        return reply.status(400).send({ success: false, error: 'File stiker atau URL media stiker wajib disediakan.' });
      }
      const prev = await readSavedStickers(companyId);
      const existing = prev.find((s) => s.mediaUrl === storedUrl);
      if (existing) {
        return reply.send({ success: true, data: existing, alreadyExists: true });
      }
      const nextItem: SavedStickerItem = {
        id: crypto.randomUUID(),
        name,
        mediaUrl: storedUrl,
        createdAt: new Date().toISOString(),
      };
      await writeSavedStickers([nextItem, ...prev], companyId);
      return reply.status(201).send({ success: true, data: nextItem });
    } catch (error: any) {
      return reply.status(400).send({ success: false, error: error.message || 'Gagal menyimpan stiker' });
    }
  });

  fastify.delete('/stickers/:stickerId', async (req: FastifyRequest<{
    Params: { stickerId: string };
  }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const prev = await readSavedStickers(companyId);
      const next = prev.filter((s) => s.id !== req.params.stickerId);
      await writeSavedStickers(next, companyId);
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST quick save shared contact (vCard) to CRM contacts and optionally open/return its WhatsApp conversation
  fastify.post('/save-shared-contact', async (req: FastifyRequest<{
    Body: {
      fullName?: string;
      phoneNumber?: string;
      organization?: string;
      openConversation?: boolean;
      session?: string;
    };
  }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const rawPhone = String(req.body?.phoneNumber || '').trim();
      const normPhone = normalizePhoneNumber(rawPhone);
      if (!normPhone) {
        return reply.status(400).send({
          success: false,
          error: 'Nomor telepon kontak yang dibagikan tidak valid.',
        });
      }
      const cleanName = String(req.body?.fullName || '').trim() || `+${normPhone}`;
      const cleanOrg = String(req.body?.organization || '').trim();

      const phoneVariants = Array.from(
        new Set([
          normPhone,
          `+${normPhone}`,
          normPhone.startsWith('62') ? `0${normPhone.slice(2)}` : '',
        ].filter(Boolean))
      );
      const existingRows = await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.companyId, companyId), inArray(contacts.nomorWhatsapp, phoneVariants)))
        .limit(1);

      let contactRow = existingRows[0];
      let createdNew = false;

      if (!contactRow) {
        const currentUser = await getCurrentAuthUser(req);
        if (currentUser && !hasUserPermission(currentUser, 'contacts.create')) {
          return reply.status(403).send({
            success: false,
            error: 'Role Anda tidak memiliki izin menambah kontak baru (contacts.create).',
          });
        }
        try {
          await licenseService.assertQuota('contacts', 1, companyId);
        } catch (qErr: any) {
          return reply.status(qErr?.statusCode || 403).send({
            success: false,
            code: qErr?.code,
            error: qErr.message,
          });
        }
        const now = new Date();
        const inserted = await db
          .insert(contacts)
          .values({
            id: crypto.randomUUID(),
            companyId,
            namaLengkap: cleanName,
            nomorWhatsapp: normPhone,
            tags: 'Kontak Dibagikan',
            notes: cleanOrg ? `Perusahaan/Org: ${cleanOrg}` : null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        contactRow = inserted[0];
        createdNew = true;
        liveEvents.emit('contacts:update', { action: 'create', contactId: contactRow.id }, companyId);
      }

      let conversationRow: typeof conversations.$inferSelect | null = null;
      if (req.body?.openConversation && contactRow) {
        const convList = await db
          .select()
          .from(conversations)
          .where(
            and(
              eq(conversations.companyId, companyId),
              eq(conversations.contactId, contactRow.id),
              eq(conversations.channel, 'WHATSAPP')
            )
          )
          .orderBy(desc(conversations.updatedAt));
        const requestedSession = req.body?.session?.trim() || null;
        const matched = selectWhatsAppConversationForSession(convList, requestedSession);
        const targetSession = requestedSession || matched?.wahaSession || null;
        const now = new Date();
        if (matched) {
          const [upd] = await db
            .update(conversations)
            .set({ status: 'OPEN', wahaSession: targetSession, updatedAt: now })
            .where(eq(conversations.id, matched.id))
            .returning();
          conversationRow = upd;
        } else {
          const [insConv] = await db
            .insert(conversations)
            .values({
              id: crypto.randomUUID(),
              companyId,
              contactId: contactRow.id,
              channel: 'WHATSAPP',
              wahaSession: requestedSession,
              pushName: contactRow.namaLengkap,
              status: 'OPEN',
              sessionStartedAt: now,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          conversationRow = insConv;
        }
        liveEvents.emit('conversations:update', { conversationId: conversationRow.id }, companyId);
      }

      return reply.status(createdNew ? 201 : 200).send({
        success: true,
        data: {
          contact: contactRow,
          createdNew,
          conversation: conversationRow,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET active agents for conversation assignment
  fastify.get('/agents', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const list = await db
        .select({
          id: crmAgents.id,
          name: crmAgents.name,
          email: crmAgents.email,
          role: crmAgents.role,
          isActive: crmAgents.isActive,
        })
        .from(crmAgents)
        .where(and(eq(crmAgents.companyId, companyId), eq(crmAgents.isActive, true)))
        .orderBy(asc(crmAgents.name));
      return reply.send({ success: true, data: list });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET/POST/PATCH/DELETE canned responses (quick replies)
  fastify.get<{ Querystring: { activeOnly?: string } }>(
    '/canned',
    async (req, reply: FastifyReply) => {
      try {
        const companyId = getRequestCompanyId(req);
        const activeOnly = req.query?.activeOnly === 'true';
        const list = activeOnly
          ? await db
            .select()
            .from(cannedResponses)
            .where(and(eq(cannedResponses.companyId, companyId), eq(cannedResponses.isActive, true)))
            .orderBy(asc(cannedResponses.shortCode))
          : await db
            .select()
            .from(cannedResponses)
            .where(eq(cannedResponses.companyId, companyId))
            .orderBy(asc(cannedResponses.shortCode));
        return reply.send({ success: true, data: list });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  fastify.post('/canned', async (req: FastifyRequest<{
    Body: { shortCode?: string; title?: string; category?: string; content?: string; isActive?: boolean };
  }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const shortCode = String(req.body?.shortCode || '')
        .trim()
        .toLowerCase()
        .replace(/^\/+/, '')
        .replace(/\s+/g, '-');
      const title = String(req.body?.title || '').trim();
      const category = String(req.body?.category || 'Umum').trim() || 'Umum';
      const content = String(req.body?.content || '').trim();
      if (!shortCode || !title || !content) {
        return reply.status(400).send({ success: false, error: 'shortCode, title, dan content wajib diisi' });
      }
      const now = new Date();
      const inserted = await db
        .insert(cannedResponses)
        .values({
          id: crypto.randomUUID(),
          companyId,
          shortCode,
          title,
          category,
          content,
          isActive: req.body?.isActive !== false,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return reply.status(201).send({ success: true, data: inserted[0] });
    } catch (error: any) {
      if (String(error.message || '').toLowerCase().includes('unique')) {
        return reply.status(400).send({ success: false, error: 'Kode singkat sudah digunakan' });
      }
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  fastify.patch('/canned/:cannedId', async (req: FastifyRequest<{
    Params: { cannedId: string };
    Body: { shortCode?: string; title?: string; category?: string; content?: string; isActive?: boolean };
  }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const patch: Record<string, any> = { updatedAt: new Date() };
      if (req.body?.shortCode !== undefined) {
        const cleanCode = String(req.body.shortCode)
          .trim()
          .toLowerCase()
          .replace(/^\/+/, '')
          .replace(/\s+/g, '-');
        if (!cleanCode) {
          return reply.status(400).send({ success: false, error: 'Kode singkat tidak boleh kosong' });
        }
        patch.shortCode = cleanCode;
      }
      if (req.body?.title !== undefined) {
        const cleanTitle = String(req.body.title).trim();
        if (!cleanTitle) {
          return reply.status(400).send({ success: false, error: 'Judul tidak boleh kosong' });
        }
        patch.title = cleanTitle;
      }
      if (req.body?.category !== undefined) {
        patch.category = String(req.body.category).trim() || 'Umum';
      }
      if (req.body?.content !== undefined) {
        const cleanContent = String(req.body.content).trim();
        if (!cleanContent) {
          return reply.status(400).send({ success: false, error: 'Isi balasan tidak boleh kosong' });
        }
        patch.content = cleanContent;
      }
      if (req.body?.isActive !== undefined) {
        patch.isActive = Boolean(req.body.isActive);
      }

      const [updated] = await db
        .update(cannedResponses)
        .set(patch)
        .where(and(eq(cannedResponses.id, req.params.cannedId), eq(cannedResponses.companyId, companyId)))
        .returning();
      if (!updated) {
        return reply.status(404).send({ success: false, error: 'Template balasan cepat tidak ditemukan' });
      }
      return reply.send({ success: true, data: updated });
    } catch (error: any) {
      if (String(error.message || '').toLowerCase().includes('unique')) {
        return reply.status(400).send({ success: false, error: 'Kode singkat sudah digunakan' });
      }
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  fastify.delete('/canned/:cannedId', async (req: FastifyRequest<{
    Params: { cannedId: string };
  }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const deleted = await db
        .delete(cannedResponses)
        .where(and(eq(cannedResponses.id, req.params.cannedId), eq(cannedResponses.companyId, companyId)))
        .returning();
      if (!deleted[0]) {
        return reply.status(404).send({ success: false, error: 'Template balasan cepat tidak ditemukan' });
      }
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET proxy inbound WAHA media safely using unmasked X-Api-Key so internal Docker/localhost WAHA URLs render in browser
  fastify.get('/media-proxy', async (req: FastifyRequest<{
    Querystring: { url?: string };
  }>, reply: FastifyReply) => {
    try {
      const rawUrl = String(req.query?.url || '').trim();
      if (!rawUrl) {
        return reply.status(400).send({ success: false, error: 'Invalid media url' });
      }
      const downloaded = await wahaService.downloadMedia(rawUrl);
      reply.header('Content-Type', downloaded.contentType);
      reply.header('Cache-Control', 'private, max-age=3600');
      return reply.send(downloaded.buffer);
    } catch (error: any) {
      const status = error?.statusCode || error?.response?.status || 502;
      return reply.status(status).send({ success: false, error: error.message || 'Gagal memuat media' });
    }
  });

  // GET all conversations
  fastify.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const authUser = await getCurrentAuthUser(req);
      const canViewAll = hasUserPermission(authUser, 'conversations.view_all');

      const allRows = await db
        .select({
          conv: conversations,
          contact: contacts,
        })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(eq(conversations.companyId, companyId))
        .orderBy(desc(conversations.updatedAt));

      const rows = canViewAll
        ? allRows
        : allRows.filter(
          (r) => !r.conv.assignedAgentId || (authUser?.id && r.conv.assignedAgentId === authUser.id)
        );

      const csatRows = await db
        .select()
        .from(csatResponses)
        .where(eq(csatResponses.companyId, companyId))
        .orderBy(desc(csatResponses.sentAt));
      const csatByConv = new Map<string, Array<any>>();
      for (const cr of csatRows) {
        const list = csatByConv.get(cr.conversationId) || [];
        const criteriaDetails = extractCsatCriteriaDetails(cr);
        list.push({
          id: cr.id,
          conversationId: cr.conversationId,
          wahaSession: cr.wahaSession,
          assignedAgentName: cr.assignedAgentName,
          token: cr.token,
          triggerType: cr.triggerType,
          profileName: cr.profileName || null,
          rating: cr.rating,
          overallScore: cr.overallScore ?? cr.rating ?? null,
          criteriaDetails,
          feedback: cr.feedback,
          conversationStartedAt: cr.conversationStartedAt || null,
          conversationResolvedAt: cr.conversationResolvedAt || null,
          sentAt: cr.sentAt,
          submittedAt: cr.submittedAt,
        });
        csatByConv.set(cr.conversationId, list);
      }

      const accountRows = await db
        .select({ id: channelAccounts.id, name: channelAccounts.name })
        .from(channelAccounts)
        .where(eq(channelAccounts.companyId, companyId));
      const accountNameMap = new Map<string, string>();
      for (const acc of accountRows) {
        accountNameMap.set(acc.id, acc.name);
      }

      const data = rows.map((r) => ({
        id: r.conv.id,
        contactId: r.conv.contactId,
        wahaSession: r.conv.wahaSession,
        pushName: r.conv.pushName || null,
        channelDisplayName: r.conv.channelDisplayName || null,
        externalThreadId: r.conv.externalThreadId || null,
        contextTitle: r.conv.contextTitle || null,
        isGroup: Boolean(r.conv.isGroup || r.conv.externalThreadId?.toLowerCase().endsWith('@g.us')),
        excludeFromMetrics: Boolean(r.conv.excludeFromMetrics),
        excludeReason: r.conv.excludeReason || null,
        channelAccountName: r.conv.channelAccountId
          ? accountNameMap.get(r.conv.channelAccountId) || null
          : null,
        assignedAgentId: r.conv.assignedAgentId,
        assignedAgentName: r.conv.assignedAgentName,
        status: r.conv.status || 'OPEN',
        labels: r.conv.labels,
        lastMessage: r.conv.lastMessage,
        lastMessageAt: r.conv.lastMessageAt,
        unreadCount: r.conv.unreadCount,
        firstInboundAt: r.conv.firstInboundAt,
        firstResponseAt: r.conv.firstResponseAt,
        lastInboundAt: r.conv.lastInboundAt,
        channel: r.conv.channel,
        channelAccountId: r.conv.channelAccountId,
        resolvedAt: r.conv.resolvedAt,
        csatToken: r.conv.csatToken,
        csatRating: r.conv.csatRating,
        csatOverallScore: r.conv.csatOverallScore ?? r.conv.csatRating ?? null,
        csatFeedback: r.conv.csatFeedback,
        csatSubmittedAt: r.conv.csatSubmittedAt,
        csatHistory: csatByConv.get(r.conv.id) || [],
        createdAt: r.conv.createdAt,
        updatedAt: r.conv.updatedAt,
        contact: r.contact
          ? {
            id: r.contact.id,
            nama_lengkap: r.contact.namaLengkap,
            nama_panggilan: r.contact.namaPanggilan,
            tanggal_lahir: r.contact.tanggalLahir,
            nomor_whatsapp: r.contact.nomorWhatsapp,
            tags: r.contact.tags,
            notes: r.contact.notes,
            alamat: r.contact.alamat,
            exclude_from_metrics: Boolean(r.contact.excludeFromMetrics),
            exclude_reason: r.contact.excludeReason || null,
            profile_picture_url: r.contact.profilePictureUrl || null,
            profile_about: r.contact.profileAbout || null,
          }
          : undefined,
      }));

      return reply.send({ success: true, data });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET messages for conversation
  fastify.get('/:id/messages', async (
    req: FastifyRequest<{
      Params: { id: string };
      Querystring: { markRead?: string; forceSeen?: string };
    }>,
    reply: FastifyReply
  ) => {
    try {
      const companyId = getRequestCompanyId(req);
      const messages = await db
        .select()
        .from(chatMessages)
        .where(and(eq(chatMessages.conversationId, req.params.id), eq(chatMessages.companyId, companyId)))
        .orderBy(asc(chatMessages.createdAt));

      const shouldMarkRead =
        req.query?.markRead !== 'false' && req.query?.markRead !== '0';
      if (shouldMarkRead) {
        const convRows = await db
          .select({ conv: conversations, contact: contacts })
          .from(conversations)
          .leftJoin(contacts, eq(conversations.contactId, contacts.id))
          .where(and(eq(conversations.id, req.params.id), eq(conversations.companyId, companyId)))
          .limit(1);
        const row = convRows[0];
        if (row?.conv) {
          if ((row.conv.unreadCount ?? 0) > 0) {
            await db
              .update(conversations)
              .set({ unreadCount: 0 })
              .where(
                and(
                  eq(conversations.id, req.params.id),
                  eq(conversations.companyId, companyId),
                  gt(conversations.unreadCount, 0)
                )
              );
            liveEvents.emit('conversations:update', {
              conversationId: req.params.id,
              unreadReset: true,
            }, companyId);
          }
          if (row.contact) {
            void markWhatsAppConversationSeen(
              row.conv,
              row.contact,
              messages,
              req.query?.forceSeen === '1'
            ).catch(() => { });
          }
        }
      }

      const mentionMap = await resolveMessageMentions({
        companyId,
        messages,
      });
      const enriched = messages.map((m) => {
        const mentioned = mentionMap.get(m.id);
        return mentioned && mentioned.length > 0 ? { ...m, mentionedContacts: mentioned } : m;
      });

      return reply.send({ success: true, data: enriched });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET conversation participants (especially for WhatsApp group chats)
  fastify.get('/:id/participants', async (
    req: FastifyRequest<{
      Params: { id: string };
      Querystring: { sync?: string };
    }>,
    reply: FastifyReply
  ) => {
    try {
      const companyId = getRequestCompanyId(req);
      const convRows = await db
        .select({ conv: conversations, contact: contacts })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(and(eq(conversations.id, req.params.id), eq(conversations.companyId, companyId)))
        .limit(1);
      const row = convRows[0];
      if (!row?.conv) {
        return reply.status(404).send({ success: false, error: 'Percakapan tidak ditemukan' });
      }

      const groupJid = row.conv.externalThreadId?.toLowerCase().endsWith('@g.us')
        ? row.conv.externalThreadId.trim()
        : null;
      const isGroup = Boolean(row.conv.isGroup || groupJid);

      const msgRows = await db
        .select({
          senderJid: chatMessages.senderJid,
          senderPhone: chatMessages.senderPhone,
          senderName: chatMessages.senderName,
          direction: chatMessages.direction,
          createdAt: chatMessages.createdAt,
        })
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, row.conv.id))
        .orderBy(asc(chatMessages.createdAt));

      interface ParticipantEntry {
        jid: string;
        phone: string | null;
        name: string | null;
        contactId: string | null;
        contactName: string | null;
        role: 'superadmin' | 'admin' | 'member';
        messageCount: number;
        lastMessageAt: string | null;
        inGroup: boolean;
      }

      const byKey = new Map<string, ParticipantEntry>();
      const makeKey = (jid?: string | null, phone?: string | null, name?: string | null) => {
        if (phone) return `p:${normalizePhoneNumber(phone)}`;
        if (jid) return `j:${jid.toLowerCase()}`;
        return `n:${String(name || 'unknown').toLowerCase()}`;
      };

      for (const m of msgRows) {
        if (m.direction !== 'INBOUND') continue;
        if (!m.senderJid && !m.senderPhone && !m.senderName) continue;
        const phone = m.senderPhone ? normalizePhoneNumber(m.senderPhone) : null;
        const jid = m.senderJid || (phone ? `${phone}@c.us` : m.senderName || 'unknown');
        const key = makeKey(jid, phone, m.senderName);
        const prev = byKey.get(key);
        const iso = m.createdAt ? new Date(m.createdAt).toISOString() : null;
        if (!prev) {
          byKey.set(key, {
            jid,
            phone,
            name: m.senderName || (phone ? `+${phone}` : fromWahaChatId(jid)),
            contactId: null,
            contactName: null,
            role: 'member',
            messageCount: 1,
            lastMessageAt: iso,
            inGroup: true,
          });
        } else {
          byKey.set(key, {
            ...prev,
            name: m.senderName || prev.name,
            phone: phone || prev.phone,
            messageCount: prev.messageCount + 1,
            lastMessageAt: iso || prev.lastMessageAt,
          });
        }
      }

      let groupName: string | null = row.conv.contextTitle || row.contact?.namaLengkap || null;
      let syncError: string | null = null;
      if (isGroup && groupJid && req.query?.sync !== 'false') {
        try {
          const grpInfo = await wahaService.getGroupInfo(groupJid, row.conv.wahaSession || undefined);
          if (grpInfo) {
            if (grpInfo.subject) {
              groupName = grpInfo.subject;
              if (
                (!row.conv.contextTitle || /^Grup (WhatsApp|\d+)/i.test(row.conv.contextTitle)) &&
                row.conv.contextTitle !== grpInfo.subject
              ) {
                await db
                  .update(conversations)
                  .set({ contextTitle: grpInfo.subject, pushName: grpInfo.subject, updatedAt: new Date() })
                  .where(eq(conversations.id, row.conv.id))
                  .catch(() => { });
              }
            }
            for (const gp of grpInfo.participants) {
              const key = makeKey(gp.jid, gp.phone, gp.name);
              const prev = byKey.get(key);
              if (!prev) {
                byKey.set(key, {
                  jid: gp.jid,
                  phone: gp.phone,
                  name: gp.name || (gp.phone ? `+${gp.phone}` : fromWahaChatId(gp.jid)),
                  contactId: null,
                  contactName: null,
                  role: gp.role,
                  messageCount: 0,
                  lastMessageAt: null,
                  inGroup: true,
                });
              } else {
                byKey.set(key, {
                  ...prev,
                  role: gp.role !== 'member' ? gp.role : prev.role,
                  name: prev.name || gp.name,
                  phone: prev.phone || gp.phone,
                  inGroup: true,
                });
              }
            }
          }
        } catch (err: any) {
          syncError = err?.message || 'Gagal sinkronisasi anggota grup dari WAHA';
        }
      }

      // Enrich with CRM contacts when phone numbers match across common formats
      const phones = Array.from(
        new Set(Array.from(byKey.values()).map((x) => x.phone).filter(Boolean) as string[])
      );
      if (phones.length > 0) {
        const phoneVariants = Array.from(
          new Set(
            phones.flatMap((p) => [p, `+${p}`, p.startsWith('62') ? `0${p.slice(2)}` : ''].filter(Boolean))
          )
        );
        const matchedContacts = await db
          .select({ id: contacts.id, namaLengkap: contacts.namaLengkap, nomorWhatsapp: contacts.nomorWhatsapp })
          .from(contacts)
          .where(and(eq(contacts.companyId, companyId), inArray(contacts.nomorWhatsapp, phoneVariants)));
        const contactByPhone = new Map(
          matchedContacts
            .filter((c) => Boolean(c.nomorWhatsapp))
            .map((c) => [normalizePhoneNumber(c.nomorWhatsapp!), c])
        );
        for (const [key, entry] of byKey.entries()) {
          if (entry.phone && contactByPhone.has(entry.phone)) {
            const matched = contactByPhone.get(entry.phone)!;
            byKey.set(key, {
              ...entry,
              contactId: matched.id,
              contactName: matched.namaLengkap,
            });
          }
        }
      }

      if (isGroup && groupJid && row.contact) {
        void syncWhatsAppProfile({
          companyId,
          contactId: row.contact.id,
          jid: groupJid,
          session: row.conv.wahaSession,
          isGroup: true,
        }).catch(() => {});
      }

      const participants = Array.from(byKey.values()).sort((a, b) => {
        if (b.messageCount !== a.messageCount) return b.messageCount - a.messageCount;
        const roleRank = { superadmin: 3, admin: 2, member: 1 };
        if (roleRank[b.role] !== roleRank[a.role]) return roleRank[b.role] - roleRank[a.role];
        return (a.contactName || a.name || a.jid).localeCompare(b.contactName || b.name || b.jid);
      });

      return reply.send({
        success: true,
        data: {
          isGroup,
          groupJid,
          groupName,
          participants,
          syncError,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST force-refresh WhatsApp profile (name, about & photo) of the contact or group in this conversation
  fastify.post('/:id/sync-profile', async (
    req: FastifyRequest<{ Params: { id: string }; Body: { session?: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const companyId = getRequestCompanyId(req);
      const convRows = await db
        .select({ conv: conversations, contact: contacts })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(and(eq(conversations.id, req.params.id), eq(conversations.companyId, companyId)))
        .limit(1);
      const row = convRows[0];
      if (!row?.conv || !row.contact) {
        return reply.status(404).send({ success: false, error: 'Percakapan tidak ditemukan' });
      }
      if (((row.conv.channel || 'WHATSAPP').toUpperCase()) !== 'WHATSAPP') {
        return reply.send({ success: true, data: { updated: false, skipped: true } });
      }

      const groupJid = row.conv.externalThreadId?.toLowerCase().endsWith('@g.us')
        ? row.conv.externalThreadId.trim()
        : null;
      const isGroup = Boolean(row.conv.isGroup || groupJid);
      const targetJid = groupJid || (await resolveWhatsAppTarget(row.conv, row.contact));
      if (!targetJid) {
        return reply.status(422).send({
          success: false,
          error: 'Nomor WhatsApp kontak belum diketahui sehingga profil tidak dapat diambil',
        });
      }

      const session = req.body?.session?.trim() || row.conv.wahaSession || undefined;
      const synced = await syncWhatsAppProfile({
        companyId,
        contactId: row.contact.id,
        jid: targetJid,
        session,
        isGroup,
        force: true,
      });
      return reply.send({
        success: true,
        data: {
          updated: synced.updated,
          name: synced.name,
          profile_picture_url: synced.profilePictureUrl,
          profile_about: synced.profileAbout,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST mark conversation as read & send WhatsApp seen receipt
  fastify.post('/:id/read', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const convRows = await db
        .select({ conv: conversations, contact: contacts })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(and(eq(conversations.id, req.params.id), eq(conversations.companyId, companyId)))
        .limit(1);
      const row = convRows[0];
      if (!row?.conv || !row.contact) {
        return reply.status(404).send({ success: false, error: 'Percakapan tidak ditemukan' });
      }

      await db
        .update(conversations)
        .set({ unreadCount: 0 })
        .where(eq(conversations.id, row.conv.id));

      const messages = await db
        .select()
        .from(chatMessages)
        .where(and(eq(chatMessages.conversationId, row.conv.id), eq(chatMessages.companyId, companyId)))
        .orderBy(asc(chatMessages.createdAt));
      const seenRes = await markWhatsAppConversationSeen(row.conv, row.contact, messages, true);

      liveEvents.emit('conversations:update', {
        conversationId: row.conv.id,
        unreadReset: true,
      }, companyId);

      return reply.send({ success: true, data: seenRes });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST send typing status (startTyping / stopTyping) via WAHA
  fastify.post('/:id/typing', async (
    req: FastifyRequest<{
      Params: { id: string };
      Body: { typing?: boolean; session?: string };
    }>,
    reply: FastifyReply
  ) => {
    try {
      const companyId = getRequestCompanyId(req);
      const convRows = await db
        .select({ conv: conversations, contact: contacts })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(and(eq(conversations.id, req.params.id), eq(conversations.companyId, companyId)))
        .limit(1);
      const row = convRows[0];
      if (!row?.conv || !row.contact) {
        return reply.status(404).send({ success: false, error: 'Percakapan tidak ditemukan' });
      }
      if (((row.conv.channel || 'WHATSAPP').toUpperCase()) !== 'WHATSAPP') {
        return reply.send({ success: true, skipped: true });
      }
      const targetWa = await resolveWhatsAppTarget(row.conv, row.contact);
      if (!targetWa) {
        return reply.send({ success: false, skipped: true });
      }
      const targetSession = req.body?.session?.trim() || row.conv.wahaSession || undefined;
      const privacy = await wahaService.resolveSessionPrivacy(targetSession, companyId);
      if (!privacy.sendOnlinePresence) {
        return reply.send({ success: true, skippedByPrivacy: true });
      }
      const res = await wahaService.setTyping(targetWa, Boolean(req.body?.typing), targetSession);
      return reply.send({ success: res.success, error: res.error });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST open or create a conversation for a contact or direct phone number
  fastify.post('/open', async (req: FastifyRequest<{
    Body: { contactId?: string; phone?: string; name?: string; session?: string };
  }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const contactId = String(req.body?.contactId || '').trim();
      const rawPhone = String(req.body?.phone || '').trim();
      const customName = String(req.body?.name || '').trim();

      if (!contactId && !rawPhone) {
        return reply.status(400).send({ success: false, error: 'contactId atau nomor telepon WhatsApp wajib diisi' });
      }

      let contact: typeof contacts.$inferSelect | undefined;
      const now = new Date();

      if (contactId) {
        const contactRows = await db
          .select()
          .from(contacts)
          .where(and(eq(contacts.id, contactId), eq(contacts.companyId, companyId)));
        contact = contactRows[0];
      } else if (rawPhone) {
        const normalized = normalizePhoneNumber(rawPhone) || rawPhone.replace(/\D/g, '');
        if (!normalized) {
          return reply.status(400).send({ success: false, error: 'Format nomor WhatsApp tidak valid' });
        }
        const phoneVariants = Array.from(
          new Set([
            normalized,
            `+${normalized}`,
            normalized.startsWith('62') ? `0${normalized.slice(2)}` : '',
          ].filter(Boolean))
        );
        const contactRows = await db
          .select()
          .from(contacts)
          .where(and(eq(contacts.companyId, companyId), inArray(contacts.nomorWhatsapp, phoneVariants)))
          .limit(1);
        if (contactRows[0]) {
          contact = contactRows[0];
        } else {
          const newId = crypto.randomUUID();
          const displayName = customName || `Kontak +${normalized}`;
          const [inserted] = await db
            .insert(contacts)
            .values({
              id: newId,
              companyId,
              namaLengkap: displayName,
              nomorWhatsapp: normalized,
              tags: 'Chat Baru',
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          contact = inserted;
        }
      }

      if (!contact) {
        return reply.status(404).send({ success: false, error: 'Kontak tidak ditemukan' });
      }

      const existingRows = await db
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

      const requestedSession = req.body?.session?.trim() || null;
      const matchedExisting = selectWhatsAppConversationForSession(existingRows, requestedSession);
      const targetSession = requestedSession || matchedExisting?.wahaSession || null;

      let convRow: typeof conversations.$inferSelect;

      if (matchedExisting) {
        const isReopeningFromResolved = matchedExisting.status === 'RESOLVED';
        const updated = await db
          .update(conversations)
          .set({
            status: 'OPEN',
            sessionStartedAt: isReopeningFromResolved
              ? now
              : matchedExisting.sessionStartedAt || matchedExisting.firstInboundAt || matchedExisting.createdAt,
            resolvedAt: null,
            wahaSession: targetSession,
            updatedAt: now,
          })
          .where(eq(conversations.id, matchedExisting.id))
          .returning();
        convRow = updated[0];
        liveEvents.emit('conversations:update', { conversationId: matchedExisting.id }, companyId);
      } else {
        const created = await db
          .insert(conversations)
          .values({
            id: crypto.randomUUID(),
            companyId,
            contactId: contact.id,
            channel: 'WHATSAPP',
            status: 'OPEN',
            excludeFromMetrics: Boolean(contact.excludeFromMetrics),
            excludeReason: contact.excludeFromMetrics ? (contact.excludeReason || 'Bukan Customer') : null,
            sessionStartedAt: now,
            wahaSession: targetSession,
            unreadCount: 0,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        convRow = created[0];
        liveEvents.emit('conversations:update', { conversationId: convRow.id }, companyId);
      }

      const profileTargetJid = convRow.externalThreadId?.toLowerCase().endsWith('@g.us')
        ? convRow.externalThreadId.trim()
        : contact.nomorWhatsapp
        ? `${normalizePhoneNumber(contact.nomorWhatsapp) || contact.nomorWhatsapp.replace(/\D/g, '')}@c.us`
        : null;
      if (profileTargetJid) {
        void syncWhatsAppProfile({
          companyId,
          contactId: contact.id,
          jid: profileTargetJid,
          session: convRow.wahaSession,
          isGroup: Boolean(convRow.isGroup),
        }).catch(() => {});
      }

      const formatted = {
        ...convRow,
        contact: {
          id: contact.id,
          nama_lengkap: contact.namaLengkap,
          nama_panggilan: contact.namaPanggilan,
          tanggal_lahir: contact.tanggalLahir,
          nomor_whatsapp: contact.nomorWhatsapp,
          tags: contact.tags,
          notes: contact.notes,
          alamat: contact.alamat,
          exclude_from_metrics: Boolean(contact.excludeFromMetrics),
          exclude_reason: contact.excludeReason || null,
          profile_picture_url: contact.profilePictureUrl || null,
          profile_about: contact.profileAbout || null,
        },
      };

      return reply.send({ success: true, data: formatted });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // PATCH update conversation metadata (status, labels, channelDisplayName, excludeFromMetrics, wahaSession, contact notes/tags)
  fastify.patch('/:id', async (req: FastifyRequest<{
    Params: { id: string };
    Body: {
      status?: string;
      labels?: string | null;
      channelDisplayName?: string | null;
      excludeFromMetrics?: boolean;
      excludeReason?: string | null;
      applyToContact?: boolean;
      wahaSession?: string | null;
      contactNotes?: string | null;
      contactTags?: string | null;
      assignedAgentId?: string | null;
      sendCsat?: boolean;
      baseUrl?: string;
    };
  }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const convRows = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, req.params.id), eq(conversations.companyId, companyId)));
      const existing = convRows[0];
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Percakapan tidak ditemukan' });
      }

      const alreadyExcluded = Boolean(existing.excludeFromMetrics || existing.isGroup);
      const stayingExcluded = alreadyExcluded && req.body?.excludeFromMetrics !== false;
      if (
        stayingExcluded &&
        (req.body?.status !== undefined ||
          req.body?.assignedAgentId !== undefined ||
          req.body?.sendCsat === true)
      ) {
        return reply.status(400).send({
          success: false,
          error: 'Obrolan Non-Penilaian/Grup tidak menggunakan Status, Penugasan CS, atau survei CSAT.',
        });
      }

      const now = new Date();
      const convUpdate: any = { updatedAt: now };

      if (req.body?.status !== undefined) {
        const nextStatus = String(req.body.status).toUpperCase().trim();
        if (!VALID_STATUSES.has(nextStatus)) {
          return reply.status(400).send({ success: false, error: 'Status percakapan tidak valid' });
        }
        convUpdate.status = nextStatus;
        if (nextStatus === 'RESOLVED') {
          convUpdate.resolvedAt = existing.status === 'RESOLVED' ? (existing.resolvedAt || now) : now;
          if (!existing.sessionStartedAt) {
            convUpdate.sessionStartedAt = existing.firstInboundAt || existing.createdAt;
          }
        } else {
          convUpdate.resolvedAt = null;
          if (existing.status === 'RESOLVED') {
            convUpdate.sessionStartedAt = now;
          }
        }
      }

      if (req.body?.labels !== undefined) {
        convUpdate.labels = req.body.labels ? String(req.body.labels).trim() || null : null;
      }

      if (req.body?.channelDisplayName !== undefined) {
        convUpdate.channelDisplayName = req.body.channelDisplayName
          ? String(req.body.channelDisplayName).trim() || null
          : null;
      }

      if (typeof req.body?.excludeFromMetrics === 'boolean') {
        convUpdate.excludeFromMetrics = req.body.excludeFromMetrics;
        if (req.body.excludeFromMetrics) {
          convUpdate.excludeReason = req.body.excludeReason !== undefined
            ? (req.body.excludeReason ? String(req.body.excludeReason).trim() || 'Bukan Customer' : 'Bukan Customer')
            : (existing.excludeReason || (existing.isGroup ? 'Grup WhatsApp' : 'Bukan Customer'));
          convUpdate.assignedAgentId = null;
          convUpdate.assignedAgentName = null;
        } else if (req.body.excludeReason === undefined) {
          convUpdate.excludeReason = null;
        }
      } else if (req.body?.excludeReason !== undefined) {
        convUpdate.excludeReason = req.body.excludeReason
          ? String(req.body.excludeReason).trim() || null
          : null;
      }

      if (req.body?.wahaSession !== undefined) {
        convUpdate.wahaSession = req.body.wahaSession ? String(req.body.wahaSession).trim() || null : null;
      }

      if (req.body?.assignedAgentId !== undefined) {
        const nextAgentId = req.body.assignedAgentId ? String(req.body.assignedAgentId).trim() : '';
        if (!nextAgentId) {
          convUpdate.assignedAgentId = null;
          convUpdate.assignedAgentName = null;
        } else {
          const agentRows = await db
            .select()
            .from(crmAgents)
            .where(and(eq(crmAgents.id, nextAgentId), eq(crmAgents.companyId, companyId)));
          if (!agentRows[0]) {
            return reply.status(404).send({ success: false, error: 'Agent tidak ditemukan' });
          }
          convUpdate.assignedAgentId = agentRows[0].id;
          convUpdate.assignedAgentName = agentRows[0].name;
        }
      }

      await db
        .update(conversations)
        .set(convUpdate)
        .where(eq(conversations.id, existing.id));

      // Propagate Non-Penilaian marking to the master Contact and all its sibling/future non-group conversations by default
      const shouldPropagateMetricExclusion =
        (typeof req.body?.excludeFromMetrics === 'boolean' || req.body?.excludeReason !== undefined) &&
        req.body?.applyToContact !== false;

      if (
        req.body?.contactNotes !== undefined ||
        req.body?.contactTags !== undefined ||
        shouldPropagateMetricExclusion
      ) {
        const contactUpdate: any = { updatedAt: now };
        if (req.body.contactNotes !== undefined) {
          contactUpdate.notes = req.body.contactNotes ? String(req.body.contactNotes).trim() || null : null;
        }
        if (req.body.contactTags !== undefined) {
          contactUpdate.tags = req.body.contactTags ? String(req.body.contactTags).trim() || null : null;
        }
        if (shouldPropagateMetricExclusion) {
          const nextExcl =
            convUpdate.excludeFromMetrics !== undefined
              ? Boolean(convUpdate.excludeFromMetrics)
              : existing.excludeFromMetrics;
          const nextReason = nextExcl
            ? (convUpdate.excludeReason !== undefined ? convUpdate.excludeReason : existing.excludeReason) ||
            (existing.isGroup ? 'Grup WhatsApp' : 'Bukan Customer')
            : null;
          contactUpdate.excludeFromMetrics = nextExcl;
          contactUpdate.excludeReason = nextReason;
          await db
            .update(conversations)
            .set({
              excludeFromMetrics: nextExcl,
              excludeReason: nextReason,
              ...(nextExcl ? { assignedAgentId: null, assignedAgentName: null } : {}),
              updatedAt: now,
            })
            .where(
              and(
                eq(conversations.companyId, companyId),
                eq(conversations.contactId, existing.contactId),
                eq(conversations.isGroup, false)
              )
            );
        }
        await db
          .update(contacts)
          .set(contactUpdate)
          .where(and(eq(contacts.id, existing.contactId), eq(contacts.companyId, companyId)));
      }

      liveEvents.emit('conversations:update', { conversationId: existing.id }, companyId);
      liveEvents.emit('tracking:update', { conversationId: existing.id }, companyId);

      let csatSent = false;
      let csatError: string | undefined;
      const transitioningToResolved =
        convUpdate.status === 'RESOLVED' && existing.status !== 'RESOLVED';
      if (transitioningToResolved) {
        const settings = await getSettingMap(companyId);
        const isExcluded = Boolean(
          convUpdate.excludeFromMetrics !== undefined
            ? convUpdate.excludeFromMetrics
            : existing.excludeFromMetrics || existing.isGroup
        );
        const shouldSendCsat =
          req.body?.sendCsat === true ||
          (req.body?.sendCsat !== false && settings.csat_auto_on_resolve === 'true' && !isExcluded);
        if (shouldSendCsat) {
          const contactRows = await db
            .select()
            .from(contacts)
            .where(and(eq(contacts.id, existing.contactId), eq(contacts.companyId, companyId)));
          if (contactRows[0]) {
            try {
              const refreshedConv = { ...existing, ...convUpdate };
              await sendCsatCtaForConversation(refreshedConv, contactRows[0], {
                baseUrl: req.body?.baseUrl || resolveRequestAppBaseUrl(req),
                triggerType: 'AUTO_RESOLVE',
              });
              csatSent = true;
            } catch (err: any) {
              csatError = err?.message || 'Gagal mengirim tautan CSAT otomatis';
              console.warn('[Conversations] Auto-CSAT send skipped:', csatError);
            }
          }
        }
      }

      return reply.send({ success: true, data: { csatSent, csatError } });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST add internal private note (not sent to WhatsApp)
  fastify.post('/:id/notes', async (req: FastifyRequest<{
    Params: { id: string };
    Body: { body: string };
  }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const body = (req.body?.body || '').trim();
      if (!body) {
        return reply.status(400).send({ success: false, error: 'Catatan tidak boleh kosong' });
      }

      const convRows = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, req.params.id), eq(conversations.companyId, companyId)));
      const existing = convRows[0];
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Percakapan tidak ditemukan' });
      }

      const now = new Date();
      const inserted = await db
        .insert(chatMessages)
        .values({
          id: crypto.randomUUID(),
          companyId,
          conversationId: existing.id,
          contactId: existing.contactId,
          direction: 'OUTBOUND',
          messageType: 'NOTE',
          wahaSession: existing.wahaSession,
          body,
          status: 'NOTE',
          ackStatus: 0,
          createdAt: now,
        })
        .returning();

      await db
        .update(conversations)
        .set({ updatedAt: now })
        .where(eq(conversations.id, existing.id));

      liveEvents.emit('conversations:update', { conversationId: existing.id }, companyId);

      return reply.status(201).send({ success: true, data: inserted[0] });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST send CSAT rating CTA link to customer via WhatsApp
  fastify.post('/:id/csat-cta', async (req: FastifyRequest<{
    Params: { id: string };
    Body: { session?: string; baseUrl?: string; customMessage?: string };
  }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const convList = await db
        .select({
          conv: conversations,
          contact: contacts,
        })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(and(eq(conversations.id, req.params.id), eq(conversations.companyId, companyId)));

      const row = convList[0];
      if (!row || !row.contact) {
        return reply.status(404).send({ success: false, error: 'Percakapan tidak ditemukan' });
      }
      if (row.conv.excludeFromMetrics || row.conv.isGroup) {
        return reply.status(400).send({
          success: false,
          error: 'Obrolan bertanda Non-Penilaian / Grup WhatsApp tidak dapat dikirimi survei CSAT.',
        });
      }

      const result = await sendCsatCtaForConversation(row.conv, row.contact, {
        session: req.body?.session,
        baseUrl: req.body?.baseUrl || resolveRequestAppBaseUrl(req),
        customMessage: req.body?.customMessage,
      });

      return reply.status(201).send({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST send reply message (text, media, sticker, location, shared contact, link preview, interactive buttons, or poll)
  fastify.post('/:id/messages', async (req: FastifyRequest<{
    Params: { id: string };
    Body: {
      body?: string;
      session?: string;
      mediaBase64?: string;
      mediaMimetype?: string;
      mediaName?: string;
      mediaUrl?: string;
      replyToMessageId?: string;
      mentions?: string[];
      isForwarded?: boolean;
      forwardedFromSender?: string;
      forwardedFromChannel?: string;
      messageKind?: OutboundMessageKind;
      linkPreview?: OutboundLinkPreviewPayload;
      interactiveButtons?: OutboundButtonsPayload;
      poll?: OutboundPollPayload;
      location?: WahaLocationData;
      sharedContacts?: Array<{
        fullName: string;
        phoneNumber: string;
        organization?: string;
        email?: string;
      }>;
    };
  }>, reply: FastifyReply) => {
    try {
      const bodyText = (req.body?.body || '').trim();
      const {
        session,
        mediaBase64,
        mediaMimetype,
        mediaName,
        mediaUrl,
        replyToMessageId,
        mentions,
        isForwarded,
        forwardedFromSender,
        forwardedFromChannel,
        messageKind,
        linkPreview,
        interactiveButtons,
        poll,
        location,
        sharedContacts,
      } = req.body || {};

      const currentUser = await getCurrentAuthUser(req);
      const currentAgentName = currentUser?.name || 'Tim CS';

      const textPhoneMentions = Array.from(bodyText.matchAll(/@(\d{8,16})/g)).map(
        (m) => `${m[1]}@c.us`
      );
      const effectiveMentions = Array.from(
        new Set([
          ...(Array.isArray(mentions) ? mentions : []),
          ...textPhoneMentions,
        ])
      ).map((m) => (m.includes('@') ? m : `${m}@c.us`));

      const inferredKind: OutboundMessageKind =
        messageKind ||
        (linkPreview
          ? 'LINK_PREVIEW'
          : interactiveButtons
            ? 'BUTTONS'
            : poll
              ? 'POLL'
              : location
                ? 'LOCATION'
                : Array.isArray(sharedContacts) && sharedContacts.length > 0
                  ? 'CONTACT'
                  : mediaBase64 || mediaUrl
                    ? 'MEDIA'
                    : 'TEXT');

      if (inferredKind === 'LINK_PREVIEW') {
        const rawUrl = String(linkPreview?.url || '').trim();
        if (!/^https?:\/\/\S+$/i.test(rawUrl)) {
          return reply.status(400).send({
            success: false,
            error: 'URL tautan wajib valid dan diawali http:// atau https://',
          });
        }
      } else if (inferredKind === 'LOCATION') {
        const lat = Number(location?.latitude);
        const lng = Number(location?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return reply.status(400).send({
            success: false,
            error: 'Koordinat latitude & longitude lokasi wajib diisi dengan benar.',
          });
        }
      } else if (inferredKind === 'CONTACT') {
        if (!Array.isArray(sharedContacts) || sharedContacts.length === 0 || !sharedContacts[0]?.phoneNumber?.trim()) {
          return reply.status(400).send({
            success: false,
            error: 'Minimal 1 kontak beserta nomor WhatsApp wajib dipilih untuk dibagikan.',
          });
        }
      } else if (inferredKind === 'STICKER') {
        if (!mediaBase64 && !mediaUrl) {
          return reply.status(400).send({
            success: false,
            error: 'Data atau URL stiker wajib dipilih.',
          });
        }
      } else if (inferredKind === 'BUTTONS') {
        const cleanBody = String(interactiveButtons?.body || '').trim();
        const validButtons = Array.isArray(interactiveButtons?.buttons)
          ? interactiveButtons!.buttons.filter((b) => b && String(b.text || '').trim())
          : [];
        if (!cleanBody || validButtons.length === 0 || validButtons.length > 3) {
          return reply.status(400).send({
            success: false,
            error: 'Isi pesan dan 1 hingga 3 tombol interaktif wajib diisi',
          });
        }
        for (const b of validButtons) {
          if (b.type === 'url' && !/^https?:\/\/\S+$/i.test(String(b.url || '').trim())) {
            return reply.status(400).send({
              success: false,
              error: `URL pada tombol "${b.text}" wajib diawali http:// atau https://`,
            });
          }
          if (b.type === 'call' && !String(b.phoneNumber || '').trim()) {
            return reply.status(400).send({
              success: false,
              error: `Nomor telepon pada tombol "${b.text}" wajib diisi`,
            });
          }
          if (b.type === 'copy' && !String(b.copyCode || '').trim()) {
            return reply.status(400).send({
              success: false,
              error: `Kode salin pada tombol "${b.text}" wajib diisi`,
            });
          }
        }
      } else if (inferredKind === 'POLL') {
        const cleanQ = String(poll?.question || '').trim();
        const cleanOpts = Array.isArray(poll?.options)
          ? poll!.options.map((o) => String(o || '').trim()).filter(Boolean)
          : [];
        if (!cleanQ || cleanOpts.length < 2 || cleanOpts.length > 12) {
          return reply.status(400).send({
            success: false,
            error: 'Pertanyaan polling dan 2 hingga 12 pilihan wajib diisi',
          });
        }
      } else if (!bodyText && !mediaBase64) {
        return reply.status(400).send({ success: false, error: 'Pesan atau lampiran tidak boleh kosong' });
      }

      const companyId = getRequestCompanyId(req);
      const convList = await db
        .select({
          conv: conversations,
          contact: contacts,
        })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(and(eq(conversations.id, req.params.id), eq(conversations.companyId, companyId)));

      const conversation = convList[0];
      if (!conversation || !conversation.contact) {
        return reply.status(404).send({ success: false, error: 'Percakapan tidak ditemukan' });
      }

      // Resolve optional quoted message reference in the same conversation
      let quotedLocalId: string | null = null;
      let quotedBodyText: string | null = null;
      let quotedSenderLabel: string | null = null;
      let quotedWahaId: string | undefined;
      if (replyToMessageId && replyToMessageId.trim()) {
        const quotedRows = await db
          .select()
          .from(chatMessages)
          .where(
            and(
              eq(chatMessages.id, replyToMessageId.trim()),
              eq(chatMessages.conversationId, conversation.conv.id)
            )
          )
          .limit(1);
        if (quotedRows[0]) {
          quotedLocalId = quotedRows[0].id;
          quotedBodyText = quotedRows[0].body.slice(0, 160);
          if (quotedRows[0].direction === 'OUTBOUND') {
            quotedSenderLabel =
              pickBestContactDisplayName(quotedRows[0].senderName, null, null) || 'Tim CS';
          } else if (conversation.conv.isGroup) {
            let groupQuotedContactName: string | null = null;
            const qPhone = normalizePhoneNumber(quotedRows[0].senderPhone || '');
            if (qPhone) {
              const variants = Array.from(
                new Set([qPhone, `+${qPhone}`, qPhone.startsWith('62') ? `0${qPhone.slice(2)}` : ''].filter(Boolean))
              );
              const matchedContacts = await db
                .select({ namaLengkap: contacts.namaLengkap })
                .from(contacts)
                .where(and(eq(contacts.companyId, companyId), inArray(contacts.nomorWhatsapp, variants)))
                .limit(1);
              groupQuotedContactName = matchedContacts[0]?.namaLengkap || null;
            }
            quotedSenderLabel =
              pickBestContactDisplayName(
                groupQuotedContactName,
                quotedRows[0].senderName,
                quotedRows[0].senderPhone
              ) || 'Anggota Grup';
          } else {
            quotedSenderLabel =
              pickBestContactDisplayName(
                conversation.contact.namaLengkap,
                conversation.conv.pushName || quotedRows[0].senderName,
                conversation.contact.nomorWhatsapp
              ) || 'Pelanggan';
          }
          quotedWahaId = quotedRows[0].wahaMessageId || undefined;
        }
      }

      const targetSession = session?.trim() || conversation.conv.wahaSession || undefined;
      const convChannel = ((conversation.conv.channel || 'WHATSAPP').toUpperCase()) as OmnichannelType;
      let sendResult: WahaSendResult;
      let mediaType: string | null = null;
      let storedMediaUrl: string | null = null;
      let persistedMessageType: 'TEXT' | 'MEDIA' | 'LOCATION' | 'CONTACT' | 'LINK' | 'BUTTONS' | 'POLL' = 'TEXT';
      let persistedBody = bodyText;
      let metadataRecord: Record<string, any> | null = null;

      if (convChannel !== 'WHATSAPP') {
        if (inferredKind === 'LINK_PREVIEW' && linkPreview) {
          persistedMessageType = 'LINK';
          persistedBody = formatLinkPreviewFallbackText({
            url: linkPreview.url,
            title: linkPreview.title,
            description: linkPreview.description,
            caption: bodyText || linkPreview.caption,
          });
          metadataRecord = {
            kind: 'LINK',
            linkPreview: {
              url: linkPreview.url.trim(),
              title: linkPreview.title?.trim() || undefined,
              description: linkPreview.description?.trim() || undefined,
              caption: (bodyText || linkPreview.caption || '').trim() || undefined,
              imageUrl: linkPreview.imageUrl?.trim() || undefined,
            },
            usedFallbackText: true,
          };
        } else if (inferredKind === 'LOCATION' && location) {
          persistedMessageType = 'LOCATION';
          const lat = Number(location.latitude);
          const lng = Number(location.longitude);
          const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
          const locLabel = [location.name?.trim(), location.address?.trim()].filter(Boolean).join(' — ');
          persistedBody = locLabel ? `📍 ${locLabel}\n${mapsUrl}` : `📍 Lokasi: ${mapsUrl}`;
          metadataRecord = {
            kind: 'LOCATION',
            location: {
              latitude: lat,
              longitude: lng,
              ...(location.name?.trim() ? { name: location.name.trim() } : {}),
              ...(location.address?.trim() ? { address: location.address.trim() } : {}),
              url: mapsUrl,
            },
            usedFallbackText: true,
          };
        } else if (inferredKind === 'CONTACT' && Array.isArray(sharedContacts) && sharedContacts.length > 0) {
          persistedMessageType = 'CONTACT';
          const normalizedContacts: WahaSharedContactItem[] = sharedContacts.map((c) => {
            const norm = normalizePhoneNumber(c.phoneNumber) || c.phoneNumber.replace(/[^\d]/g, '');
            return {
              fullName: c.fullName?.trim() || `+${norm || c.phoneNumber}`,
              phones: [norm || c.phoneNumber.trim()],
              ...(norm ? { waId: norm } : {}),
              ...(c.organization?.trim() ? { organization: c.organization.trim() } : {}),
              ...(c.email?.trim() ? { email: c.email.trim() } : {}),
            };
          });
          persistedBody = normalizedContacts
            .map((c) => `👤 ${c.fullName}${c.organization ? ` (${c.organization})` : ''}: +${c.phones[0]}`)
            .join('\n');
          metadataRecord = {
            kind: 'CONTACT',
            sharedContacts: normalizedContacts,
            usedFallbackText: true,
          };
        } else if (!bodyText) {
          return reply.status(400).send({
            success: false,
            error: `Pengiriman pesan di ${convChannel} saat ini mendukung balasan teks, lokasi, kontak, & tautan`,
          });
        }
        const out = await sendOutboundChannelMessage({
          channel: convChannel,
          channelAccountId: conversation.conv.channelAccountId,
          contactId: conversation.conv.contactId,
          externalThreadId: conversation.conv.externalThreadId,
          text: persistedBody,
        });
        sendResult = { success: true, messageId: out.externalMessageId || undefined };
      } else {
        const targetWa = await resolveWhatsAppTarget(conversation.conv, conversation.contact);
        if (!targetWa) {
          return reply.status(400).send({
            success: false,
            error: 'Kontak ini belum memiliki nomor WhatsApp atau WhatsApp ID (@lid)',
          });
        }
        if (inferredKind === 'LINK_PREVIEW' && linkPreview) {
          persistedMessageType = 'LINK';
          const effectiveCaption = (bodyText || linkPreview.caption || '').trim();
          persistedBody = formatLinkPreviewFallbackText({
            url: linkPreview.url,
            title: linkPreview.title,
            description: linkPreview.description,
            caption: effectiveCaption,
          });
          sendResult = await wahaService.sendLinkPreviewMessage(
            targetWa,
            {
              url: linkPreview.url.trim(),
              title: linkPreview.title?.trim() || undefined,
              description: linkPreview.description?.trim() || undefined,
              caption: effectiveCaption || undefined,
              imageUrl: linkPreview.imageUrl?.trim() || undefined,
              highQuality: linkPreview.highQuality !== false,
              replyTo: quotedWahaId,
            },
            targetSession
          );
          metadataRecord = {
            kind: 'LINK',
            linkPreview: {
              url: linkPreview.url.trim(),
              title: linkPreview.title?.trim() || undefined,
              description: linkPreview.description?.trim() || undefined,
              caption: effectiveCaption || undefined,
              imageUrl: linkPreview.imageUrl?.trim() || undefined,
            },
            ...(sendResult.usedFallbackText ? { usedFallbackText: true } : {}),
            ...(sendResult.fallbackReason ? { fallbackReason: sendResult.fallbackReason } : {}),
          };
        } else if (inferredKind === 'BUTTONS' && interactiveButtons) {
          persistedMessageType = 'BUTTONS';
          const cleanButtons = interactiveButtons.buttons
            .filter((b) => b && String(b.text || '').trim())
            .map((b) => ({
              type: b.type,
              text: b.text.trim(),
              ...(b.url ? { url: b.url.trim() } : {}),
              ...(b.phoneNumber ? { phoneNumber: b.phoneNumber.trim() } : {}),
              ...(b.copyCode ? { copyCode: b.copyCode.trim() } : {}),
            }));
          persistedBody = formatInteractiveButtonsFallbackText({
            header: interactiveButtons.header,
            body: interactiveButtons.body,
            footer: interactiveButtons.footer,
            buttons: cleanButtons,
          });
          sendResult = await wahaService.sendButtonsMessage(
            targetWa,
            {
              header: interactiveButtons.header?.trim() || undefined,
              body: interactiveButtons.body.trim(),
              footer: interactiveButtons.footer?.trim() || undefined,
              buttons: cleanButtons,
              fallbackTextOnUnsupported: interactiveButtons.fallbackTextOnUnsupported,
              replyTo: quotedWahaId,
            },
            targetSession
          );
          metadataRecord = {
            kind: 'BUTTONS',
            interactiveButtons: {
              header: interactiveButtons.header?.trim() || undefined,
              body: interactiveButtons.body.trim(),
              footer: interactiveButtons.footer?.trim() || undefined,
              fallbackTextOnUnsupported: interactiveButtons.fallbackTextOnUnsupported,
              buttons: cleanButtons,
            },
            ...(sendResult.usedFallbackText ? { usedFallbackText: true } : {}),
            ...(sendResult.fallbackReason ? { fallbackReason: sendResult.fallbackReason } : {}),
          };
        } else if (inferredKind === 'POLL' && poll) {
          persistedMessageType = 'POLL';
          const cleanOptions = poll.options.map((o) => o.trim()).filter(Boolean);
          const cleanPoll: OutboundPollPayload = {
            question: poll.question.trim(),
            options: cleanOptions,
            multipleAnswers: Boolean(poll.multipleAnswers),
          };
          persistedBody = buildPollFallbackDisplayText(cleanPoll);
          sendResult = await wahaService.sendPollMessage(
            targetWa,
            {
              ...cleanPoll,
              replyTo: quotedWahaId,
            },
            targetSession
          );
          metadataRecord = {
            kind: 'POLL',
            poll: cleanPoll,
          };
        } else if (inferredKind === 'LOCATION' && location) {
          persistedMessageType = 'LOCATION';
          const lat = Number(location.latitude);
          const lng = Number(location.longitude);
          const cleanName = location.name?.trim() || undefined;
          const cleanAddr = location.address?.trim() || undefined;
          const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
          const locLabel = [cleanName, cleanAddr].filter(Boolean).join(' — ');
          persistedBody = locLabel ? `[Lokasi] ${locLabel}` : `[Lokasi dibagikan] ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          sendResult = await wahaService.sendLocation(
            targetWa,
            {
              latitude: lat,
              longitude: lng,
              title: cleanName,
              address: cleanAddr,
              replyTo: quotedWahaId,
            },
            targetSession
          );
          metadataRecord = {
            kind: 'LOCATION',
            location: {
              latitude: lat,
              longitude: lng,
              ...(cleanName ? { name: cleanName } : {}),
              ...(cleanAddr ? { address: cleanAddr } : {}),
              url: mapsUrl,
            },
            ...(sendResult.usedFallbackText ? { usedFallbackText: true } : {}),
          };
        } else if (inferredKind === 'CONTACT' && Array.isArray(sharedContacts) && sharedContacts.length > 0) {
          persistedMessageType = 'CONTACT';
          const normalizedContacts: WahaSharedContactItem[] = sharedContacts.map((c) => {
            const norm = normalizePhoneNumber(c.phoneNumber) || c.phoneNumber.replace(/[^\d]/g, '');
            return {
              fullName: c.fullName?.trim() || `+${norm || c.phoneNumber}`,
              phones: [norm || c.phoneNumber.trim()],
              ...(norm ? { waId: norm } : {}),
              ...(c.organization?.trim() ? { organization: c.organization.trim() } : {}),
              ...(c.email?.trim() ? { email: c.email.trim() } : {}),
            };
          });
          const first = normalizedContacts[0];
          const extra = normalizedContacts.length > 1 ? ` +${normalizedContacts.length - 1} lainnya` : '';
          persistedBody = `[Kontak] ${first.fullName} (+${first.phones[0]})${extra}`;
          sendResult = await wahaService.sendContactVcard(
            targetWa,
            sharedContacts,
            targetSession,
            quotedWahaId
          );
          metadataRecord = {
            kind: 'CONTACT',
            sharedContacts: normalizedContacts,
            ...(sendResult.usedFallbackText ? { usedFallbackText: true } : {}),
          };
        } else if (inferredKind === 'STICKER' && (mediaBase64 || mediaUrl)) {
          persistedMessageType = 'MEDIA';
          mediaType = 'image';
          persistedBody = '[Stiker]';
          let stickerDataUri = mediaBase64 || '';
          let stickerMime = mediaMimetype || 'image/webp';
          if (mediaUrl) {
            const loaded = await readUploadedMediaAsDataUri(mediaUrl);
            if (!loaded) {
              return reply.status(400).send({
                success: false,
                error: 'Berkas stiker tersimpan tidak ditemukan. Silakan unggah ulang stiker.',
              });
            }
            stickerDataUri = loaded.dataUri;
            stickerMime = loaded.mimetype || 'image/webp';
            storedMediaUrl = mediaUrl;
          } else if (mediaBase64) {
            try {
              const savedMedia = await saveBase64MediaFile({
                base64: mediaBase64,
                mimeType: stickerMime,
                fileName: mediaName || 'sticker.webp',
                maxBytes: 5 * 1024 * 1024,
              });
              storedMediaUrl = savedMedia.relativeUrl;
            } catch {
              storedMediaUrl = mediaBase64;
            }
          }
          sendResult = await wahaService.sendSticker(
            targetWa,
            {
              base64: stickerDataUri,
              mimetype: stickerMime,
              filename: mediaName || 'sticker.webp',
              replyTo: quotedWahaId,
            },
            targetSession
          );
          metadataRecord = {
            kind: 'STICKER',
            sticker: { isAnimated: false },
          };
        } else if (mediaBase64 && mediaMimetype) {
          persistedMessageType = 'MEDIA';
          mediaType = mediaMimetype.startsWith('image/')
            ? 'image'
            : mediaMimetype.startsWith('video/')
              ? 'video'
              : mediaMimetype.startsWith('audio/')
                ? 'audio'
                : 'document';
          try {
            const savedMedia = await saveBase64MediaFile({
              base64: mediaBase64,
              mimeType: mediaMimetype,
              fileName: mediaName,
            });
            storedMediaUrl = savedMedia.relativeUrl;
          } catch (saveErr: any) {
            if (mediaType === 'image') {
              storedMediaUrl = mediaBase64.startsWith('data:')
                ? mediaBase64
                : `data:${mediaMimetype};base64,${mediaBase64}`;
            } else {
              console.warn('[Conversations] Gagal menyimpan berkas lampiran ke disk:', saveErr?.message);
            }
          }
          sendResult = await wahaService.sendMediaMessage(
            targetWa,
            {
              base64: mediaBase64,
              mimetype: mediaMimetype,
              filename: mediaName || 'attachment',
              caption: bodyText,
              replyTo: quotedWahaId,
              mentions: effectiveMentions.length > 0 ? effectiveMentions : undefined,
            },
            targetSession
          );
        } else if (mediaUrl) {
          const loadedMedia = await readUploadedMediaAsDataUri(mediaUrl, mediaMimetype || undefined);
          const resolvedMime = loadedMedia?.mimetype || mediaMimetype || 'application/octet-stream';
          persistedMessageType = 'MEDIA';
          storedMediaUrl = mediaUrl;
          mediaType = resolvedMime.startsWith('image/')
            ? 'image'
            : resolvedMime.startsWith('video/')
              ? 'video'
              : resolvedMime.startsWith('audio/')
                ? 'audio'
                : 'document';
          if (loadedMedia?.dataUri) {
            sendResult = await wahaService.sendMediaMessage(
              targetWa,
              {
                base64: loadedMedia.dataUri,
                mimetype: resolvedMime,
                filename: mediaName || 'attachment',
                caption: bodyText,
                replyTo: quotedWahaId,
                mentions: effectiveMentions.length > 0 ? effectiveMentions : undefined,
              },
              targetSession
            );
          } else {
            sendResult = await wahaService.sendTextMessage(
              targetWa,
              bodyText || mediaName || 'Lampiran Media',
              targetSession,
              {
                replyTo: quotedWahaId,
                mentions: effectiveMentions.length > 0 ? effectiveMentions : undefined,
              }
            );
          }
        } else {
          sendResult = await wahaService.sendTextMessage(
            targetWa,
            bodyText,
            targetSession,
            {
              replyTo: quotedWahaId,
              mentions: effectiveMentions.length > 0 ? effectiveMentions : undefined,
            }
          );
        }
      }

      if (effectiveMentions.length > 0) {
        metadataRecord = { ...(metadataRecord || {}), mentions: effectiveMentions };
      }
      if (isForwarded) {
        metadataRecord = {
          ...(metadataRecord || {}),
          forwarded: true,
          forwardingScore: 1,
          ...(forwardedFromSender ? { forwardedFromSender: String(forwardedFromSender).trim() } : {}),
          ...(forwardedFromChannel ? { forwardedFromChannel: String(forwardedFromChannel).trim() } : {}),
        };
      }

      const now = new Date();
      const messageId = crypto.randomUUID();
      const displayBody =
        persistedBody || (mediaName ? `[Lampiran: ${mediaName}]` : '[Lampiran Media]');
      const effectiveSession = sendResult.sessionUsed || targetSession || null;
      const sendErrorMsg = sendResult.success ? null : (sendResult.error || 'Gagal mengirim pesan WhatsApp');

      const inserted = await db
        .insert(chatMessages)
        .values({
          id: messageId,
          companyId,
          conversationId: conversation.conv.id,
          contactId: conversation.conv.contactId,
          direction: 'OUTBOUND',
          senderName: currentAgentName,
          messageType: persistedMessageType,
          channel: convChannel,
          externalMessageId: convChannel === 'WHATSAPP' ? null : (sendResult.messageId || null),
          wahaSession: convChannel === 'WHATSAPP' ? effectiveSession : null,
          body: displayBody,
          mediaUrl: storedMediaUrl,
          mediaType,
          mediaName: mediaName || null,
          replyToMessageId: quotedLocalId,
          replyToBody: quotedBodyText,
          replyToSender: quotedSenderLabel,
          metadataJson: metadataRecord ? JSON.stringify(metadataRecord) : null,
          wahaMessageId: convChannel === 'WHATSAPP' && sendResult.success ? (sendResult.messageId || null) : null,
          status: sendResult.success ? 'SENT' : 'FAILED',
          ackStatus: sendResult.success ? 1 : -1,
          errorMessage: sendErrorMsg,
          sentAt: sendResult.success ? now : null,
          createdAt: now,
        })
        .returning();

      if (sendResult.success) {
        await db
          .update(conversations)
          .set({
            wahaSession: effectiveSession || conversation.conv.wahaSession,
            firstResponseAt:
              conversation.conv.firstInboundAt && !conversation.conv.firstResponseAt
                ? now
                : conversation.conv.firstResponseAt,
            lastMessage: displayBody,
            lastMessageAt: now,
            updatedAt: now,
          })
          .where(eq(conversations.id, conversation.conv.id));
      }

      liveEvents.emit('conversations:update', { conversationId: conversation.conv.id }, companyId);
      liveEvents.emit('tracking:update', { conversationId: conversation.conv.id }, companyId);

      const sentMentionMap = await resolveMessageMentions({
        companyId,
        messages: inserted,
      });
      const enrichedInserted = {
        ...inserted[0],
        ...(sentMentionMap.get(inserted[0].id)?.length
          ? { mentionedContacts: sentMentionMap.get(inserted[0].id) }
          : {}),
      };

      return reply.status(201).send({
        success: true,
        sendFailed: !sendResult.success,
        error: sendErrorMsg || undefined,
        data: enrichedInserted,
      });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  });

  // POST retry sending a FAILED outbound message in-place
  fastify.post('/:id/messages/:messageId/retry', async (req: FastifyRequest<{
    Params: { id: string; messageId: string };
    Body: { session?: string } | undefined;
  }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const msgRows = await db
        .select()
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.id, req.params.messageId),
            eq(chatMessages.conversationId, req.params.id),
            eq(chatMessages.companyId, companyId)
          )
        );
      const msg = msgRows[0];
      if (!msg) {
        return reply.status(404).send({ success: false, error: 'Pesan tidak ditemukan' });
      }
      if (msg.direction !== 'OUTBOUND' || (msg.status !== 'FAILED' && msg.ackStatus >= 0)) {
        return reply.status(400).send({ success: false, error: 'Hanya pesan keluar yang gagal yang dapat dikirim ulang' });
      }

      const convList = await db
        .select({ conv: conversations, contact: contacts })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(and(eq(conversations.id, req.params.id), eq(conversations.companyId, companyId)));
      const conversation = convList[0];
      if (!conversation || !conversation.contact) {
        return reply.status(404).send({ success: false, error: 'Percakapan tidak ditemukan' });
      }

      const targetSession = req.body?.session?.trim() || msg.wahaSession || conversation.conv.wahaSession || undefined;
      const convChannel = ((conversation.conv.channel || 'WHATSAPP').toUpperCase()) as OmnichannelType;
      let sendResult: WahaSendResult;
      let parsedMeta: Record<string, any> | null = null;
      if (msg.metadataJson) {
        try {
          parsedMeta = JSON.parse(msg.metadataJson);
        } catch {
          parsedMeta = null;
        }
      }

      if (convChannel !== 'WHATSAPP') {
        const out = await sendOutboundChannelMessage({
          channel: convChannel,
          channelAccountId: conversation.conv.channelAccountId,
          contactId: conversation.conv.contactId,
          externalThreadId: conversation.conv.externalThreadId,
          text: msg.body,
        });
        sendResult = { success: true, messageId: out.externalMessageId || undefined };
      } else {
        const targetWa = await resolveWhatsAppTarget(conversation.conv, conversation.contact);
        if (!targetWa) {
          return reply.status(400).send({
            success: false,
            error: 'Kontak ini belum memiliki nomor WhatsApp atau WhatsApp ID (@lid)',
          });
        }
        let retryWahaReplyTo: string | undefined;
        if (msg.replyToMessageId) {
          const quotedRows = await db
            .select({ wahaMessageId: chatMessages.wahaMessageId })
            .from(chatMessages)
            .where(eq(chatMessages.id, msg.replyToMessageId))
            .limit(1);
          retryWahaReplyTo = quotedRows[0]?.wahaMessageId || undefined;
        }
        if (msg.messageType === 'LINK' && parsedMeta?.linkPreview?.url) {
          sendResult = await wahaService.sendLinkPreviewMessage(
            targetWa,
            {
              ...parsedMeta.linkPreview,
              replyTo: retryWahaReplyTo,
            },
            targetSession
          );
        } else if (msg.messageType === 'BUTTONS' && parsedMeta?.interactiveButtons?.body) {
          sendResult = await wahaService.sendButtonsMessage(
            targetWa,
            {
              ...parsedMeta.interactiveButtons,
              replyTo: retryWahaReplyTo,
            },
            targetSession
          );
        } else if (msg.messageType === 'POLL' && parsedMeta?.poll?.question) {
          sendResult = await wahaService.sendPollMessage(
            targetWa,
            {
              ...parsedMeta.poll,
              replyTo: retryWahaReplyTo,
            },
            targetSession
          );
        } else if (msg.messageType === 'LOCATION' && parsedMeta?.location) {
          sendResult = await wahaService.sendLocation(
            targetWa,
            {
              latitude: Number(parsedMeta.location.latitude),
              longitude: Number(parsedMeta.location.longitude),
              title: parsedMeta.location.name,
              address: parsedMeta.location.address,
              replyTo: retryWahaReplyTo,
            },
            targetSession
          );
        } else if (msg.messageType === 'CONTACT' && Array.isArray(parsedMeta?.sharedContacts) && parsedMeta.sharedContacts.length > 0) {
          sendResult = await wahaService.sendContactVcard(
            targetWa,
            parsedMeta.sharedContacts.map((c: any) => ({
              fullName: c.fullName || 'Kontak',
              phoneNumber: c.phones?.[0] || c.waId || '',
              organization: c.organization,
              email: c.email,
            })),
            targetSession,
            retryWahaReplyTo
          );
        } else if (msg.messageType === 'MEDIA') {
          const loaded = msg.mediaUrl ? await readUploadedMediaAsDataUri(msg.mediaUrl) : null;
          if (!loaded) {
            return reply.status(400).send({
              success: false,
              error: 'Lampiran berkas tidak tersimpan untuk kirim ulang. Unggah ulang berkas melalui kolom balas.',
            });
          }
          if (parsedMeta?.kind === 'STICKER') {
            sendResult = await wahaService.sendSticker(
              targetWa,
              {
                base64: loaded.dataUri,
                mimetype: loaded.mimetype || 'image/webp',
                filename: msg.mediaName || 'sticker.webp',
                replyTo: retryWahaReplyTo,
              },
              targetSession
            );
          } else {
            sendResult = await wahaService.sendMediaMessage(
              targetWa,
              {
                base64: loaded.dataUri,
                mimetype: loaded.mimetype,
                filename: msg.mediaName || 'attachment',
                caption: msg.body.startsWith('[Lampiran:') ? '' : msg.body,
                replyTo: retryWahaReplyTo,
              },
              targetSession
            );
          }
        } else {
          sendResult = await wahaService.sendTextMessage(
            targetWa,
            msg.body,
            targetSession,
            retryWahaReplyTo ? { replyTo: retryWahaReplyTo } : undefined
          );
        }
      }

      const now = new Date();
      const effectiveSession = sendResult.sessionUsed || targetSession || null;
      const sendErrorMsg = sendResult.success ? null : (sendResult.error || 'Gagal mengirim ulang pesan WhatsApp');
      const nextMetaJson = parsedMeta
        ? JSON.stringify({
          ...parsedMeta,
          ...(sendResult.usedFallbackText ? { usedFallbackText: true } : {}),
          ...(sendResult.fallbackReason ? { fallbackReason: sendResult.fallbackReason } : {}),
        })
        : msg.metadataJson;

      const [updated] = await db
        .update(chatMessages)
        .set({
          wahaSession: convChannel === 'WHATSAPP' ? effectiveSession : null,
          wahaMessageId: convChannel === 'WHATSAPP' && sendResult.success ? (sendResult.messageId || null) : null,
          externalMessageId: convChannel === 'WHATSAPP' ? null : (sendResult.messageId || null),
          metadataJson: nextMetaJson,
          status: sendResult.success ? 'SENT' : 'FAILED',
          ackStatus: sendResult.success ? 1 : -1,
          errorMessage: sendErrorMsg,
          sentAt: sendResult.success ? now : null,
        })
        .where(eq(chatMessages.id, msg.id))
        .returning();

      if (sendResult.success) {
        await db
          .update(conversations)
          .set({
            wahaSession: effectiveSession || conversation.conv.wahaSession,
            firstResponseAt:
              conversation.conv.firstInboundAt && !conversation.conv.firstResponseAt
                ? now
                : conversation.conv.firstResponseAt,
            lastMessage: msg.body,
            lastMessageAt: now,
            updatedAt: now,
          })
          .where(eq(conversations.id, conversation.conv.id));
      }

      liveEvents.emit('conversations:update', { conversationId: conversation.conv.id }, companyId);
      liveEvents.emit('tracking:update', { conversationId: conversation.conv.id }, companyId);

      return reply.send({
        success: sendResult.success,
        error: sendErrorMsg || undefined,
        data: updated,
      });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  });

  // DELETE a single message (scope=ME local CRM only | scope=EVERYONE revoke on WhatsApp + delete from CRM)
  fastify.delete('/:id/messages/:messageId', async (req: FastifyRequest<{
    Params: { id: string; messageId: string };
    Querystring: { scope?: string; session?: string };
    Body?: { scope?: string; session?: string };
  }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const convRows = await db
        .select({ conv: conversations, contact: contacts })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(and(eq(conversations.id, req.params.id), eq(conversations.companyId, companyId)))
        .limit(1);

      const convRow = convRows[0];
      if (!convRow?.conv || !convRow.contact) {
        return reply.status(404).send({ success: false, error: 'Percakapan tidak ditemukan' });
      }

      const msgRows = await db
        .select()
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.id, req.params.messageId),
            eq(chatMessages.conversationId, convRow.conv.id),
            eq(chatMessages.companyId, companyId)
          )
        )
        .limit(1);

      const msg = msgRows[0];
      if (!msg) {
        return reply.status(404).send({ success: false, error: 'Pesan tidak ditemukan' });
      }

      const rawScope = String(req.query?.scope || (req.body as any)?.scope || 'ME').toUpperCase().trim();
      const scope: 'ME' | 'EVERYONE' = rawScope === 'EVERYONE' ? 'EVERYONE' : 'ME';
      const isGroup = Boolean(
        convRow.conv.isGroup || convRow.conv.externalThreadId?.toLowerCase().endsWith('@g.us')
      );

      if (scope === 'EVERYONE') {
        if (msg.messageType === 'NOTE') {
          return reply.status(400).send({
            success: false,
            error: 'Catatan internal tidak dikirim ke pelanggan; gunakan Hapus Pribadi.',
          });
        }
        const convChannel = (msg.channel || convRow.conv.channel || 'WHATSAPP').toUpperCase();
        if (convChannel !== 'WHATSAPP') {
          return reply.status(400).send({
            success: false,
            error: `Tarik pesan untuk semua saat ini hanya didukung untuk WhatsApp (kanal ini: ${convChannel}). Gunakan Hapus Pribadi.`,
          });
        }
        if (!msg.wahaMessageId) {
          return reply.status(400).send({
            success: false,
            error: 'Pesan ini belum memiliki ID pesan WhatsApp yang terkirim. Gunakan Hapus Pribadi untuk menghapus dari CRM.',
          });
        }
        if (msg.direction !== 'OUTBOUND' && !isGroup) {
          return reply.status(400).send({
            success: false,
            error: 'Pada chat pribadi, hanya pesan keluar Anda yang bisa ditarik untuk semua orang. Gunakan Hapus Pribadi.',
          });
        }

        const targetWa = await resolveWhatsAppTarget(convRow.conv, convRow.contact);
        if (!targetWa) {
          return reply.status(400).send({
            success: false,
            error: 'Target nomor/ID WhatsApp tidak ditemukan untuk menarik pesan.',
          });
        }

        const targetSession =
          msg.wahaSession ||
          req.query?.session?.trim() ||
          (req.body as any)?.session?.trim() ||
          convRow.conv.wahaSession ||
          undefined;

        const revokeResult = await wahaService.deleteMessage(
          targetWa,
          msg.wahaMessageId,
          targetSession
        );
        if (!revokeResult.success) {
          return reply.status(400).send({
            success: false,
            error: revokeResult.error || 'Gagal menarik pesan dari WhatsApp (WAHA).',
          });
        }
      }

      // Preserve audit trail: soft delete by updating metadataJson with revoked status
      const currentUser = await getCurrentAuthUser(req);
      const revokedBy = currentUser?.name || 'CS';
      const revokedAt = new Date().toISOString();

      let prevMeta: Record<string, any> = {};
      if (msg.metadataJson) {
        try {
          prevMeta = JSON.parse(msg.metadataJson);
        } catch {
          prevMeta = {};
        }
      }

      const updatedMeta = {
        ...prevMeta,
        revoked: true,
        revokedAt,
        revokedBy,
        revokeScope: scope,
      };

      const [updatedMsg] = await db
        .update(chatMessages)
        .set({
          metadataJson: JSON.stringify(updatedMeta),
        })
        .where(eq(chatMessages.id, msg.id))
        .returning();

      const remainingLatest = await db
        .select()
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.conversationId, convRow.conv.id),
            ne(chatMessages.messageType, 'NOTE')
          )
        )
        .orderBy(desc(chatMessages.createdAt))
        .limit(1);

      const nextLast = remainingLatest[0];
      let nextLastBody: string | null = null;
      if (nextLast) {
        let meta: any = {};
        if (nextLast.metadataJson) {
          try {
            meta = JSON.parse(nextLast.metadataJson);
          } catch {}
        }
        if (meta?.revoked) {
          nextLastBody = meta.revokeScope === 'EVERYONE' ? '🚫 Pesan ditarik' : '🚫 Pesan dihapus';
        } else {
          nextLastBody = nextLast.body;
        }
      }

      await db
        .update(conversations)
        .set({
          lastMessage: nextLastBody,
          lastMessageAt: nextLast ? nextLast.createdAt : null,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, convRow.conv.id));

      liveEvents.emit('conversations:update', { conversationId: convRow.conv.id }, companyId);

      return reply.send({
        success: true,
        data: {
          deletedId: msg.id,
          revokedId: msg.id,
          scope,
          message: updatedMsg || { ...msg, metadataJson: JSON.stringify(updatedMeta) },
        },
      });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  });

  // POST react with an emoji to a message inside conversation
  fastify.post('/:id/messages/:messageId/reaction', async (req: FastifyRequest<{
    Params: { id: string; messageId: string };
    Body: { emoji?: string; session?: string };
  }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const convRows = await db
        .select({ conv: conversations, contact: contacts })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(and(eq(conversations.id, req.params.id), eq(conversations.companyId, companyId)))
        .limit(1);
      const convRow = convRows[0];
      if (!convRow?.conv || !convRow.contact) {
        return reply.status(404).send({ success: false, error: 'Percakapan tidak ditemukan' });
      }

      const msgRows = await db
        .select()
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.id, req.params.messageId),
            eq(chatMessages.conversationId, convRow.conv.id),
            eq(chatMessages.companyId, companyId)
          )
        )
        .limit(1);
      const msg = msgRows[0];
      if (!msg) {
        return reply.status(404).send({ success: false, error: 'Pesan tidak ditemukan' });
      }

      const emoji = String(req.body?.emoji ?? '').trim();
      let prevMeta: Record<string, any> = {};
      if (msg.metadataJson) {
        try {
          prevMeta = JSON.parse(msg.metadataJson);
        } catch {
          prevMeta = {};
        }
      }
      const prevReactions: Array<any> = Array.isArray(prevMeta.reactions) ? prevMeta.reactions : [];
      const currentCsReaction = prevReactions.find((r) => r && r.actor === 'CS' && r.isOutbound);
      const effectiveEmoji =
        emoji && currentCsReaction?.emoji === emoji ? '' : emoji;

      const convChannel = (msg.channel || convRow.conv.channel || 'WHATSAPP').toUpperCase();
      if (convChannel === 'WHATSAPP' && msg.wahaMessageId) {
        const targetWa = await resolveWhatsAppTarget(convRow.conv, convRow.contact);
        if (targetWa) {
          const targetSession =
            req.body?.session?.trim() || msg.wahaSession || convRow.conv.wahaSession || undefined;
          const reactRes = await wahaService.sendReaction(
            targetWa,
            { messageId: msg.wahaMessageId, reaction: effectiveEmoji },
            targetSession
          );
          if (!reactRes.success) {
            return reply.status(400).send({
              success: false,
              error: reactRes.error || 'Gagal mengirim reaksi emoji ke WhatsApp',
            });
          }
        }
      }

      const nextReactions = prevReactions.filter((r) => !(r && r.actor === 'CS' && r.isOutbound));
      if (effectiveEmoji) {
        const currentActor = await getCurrentAuthUser(req);
        nextReactions.push({
          emoji: effectiveEmoji,
          actor: 'CS',
          actorName: currentActor?.name || 'Tim CS',
          isOutbound: true,
        });
      }

      const [updatedMsg] = await db
        .update(chatMessages)
        .set({
          metadataJson: JSON.stringify({ ...prevMeta, reactions: nextReactions }),
        })
        .where(eq(chatMessages.id, msg.id))
        .returning();

      liveEvents.emit('conversations:update', { conversationId: convRow.conv.id }, companyId);
      return reply.send({ success: true, data: updatedMsg });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  });
}
