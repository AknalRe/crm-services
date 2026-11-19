import crypto from 'crypto';
import { and, desc, eq, inArray, like, or } from 'drizzle-orm';
import { db } from '../db';
import { chatMessages, contacts, conversations } from '../db/schema';
import { liveEvents } from './events.service';
import { wahaService } from './waha.service';
import {
  extractGroupParticipant,
  extractInboundWahaMediaMeta,
  extractInboundWahaRichData,
  extractInboundWahaText,
  extractWahaMessageIds,
  isWahaFromMe,
  normalizeWahaAck,
} from '../routes/waha';
import { saveBase64MediaFile, saveMediaBufferFile } from '../routes/media';
import {
  fromWahaChatId,
  isPersonalWahaJid,
  normalizePhoneNumber,
  toWahaChatId,
} from './phone.utils';
import { listActiveCompanyIds, runWithCompany } from './tenantContext';

const CHAT_SYNC_COOLDOWN_MS = 15_000;
const lastChatSyncAt = new Map<string, number>();

function parseWahaTimestamp(raw: unknown): Date {
  const num = Number(raw);
  if (Number.isFinite(num) && num > 0) {
    // WAHA timestamps are Unix seconds (~1.7e9) or milliseconds (~1.7e12)
    return new Date(num > 1e12 ? num : num * 1000);
  }
  return new Date();
}

const CLOCK_SKEW_TOLERANCE_MS = 10_000;

export function resolveConversationSyncBumpUpdate(params: {
  isHistoricalOffset: boolean;
  convLastMessageAt: Date | null | undefined;
  latestMsgBody: string | null;
  latestMsgAt: Date | null;
  inserted: number;
  newestInsertedBody: string | null;
  newestInsertedAt: Date | null;
  now?: Date;
}): { lastMessage: string; lastMessageAt: Date; updatedAt: Date } | null {
  if (params.isHistoricalOffset) return null;
  const now = params.now ?? new Date();
  if (params.latestMsgBody && params.latestMsgAt) {
    return {
      lastMessage: params.latestMsgBody,
      lastMessageAt: params.latestMsgAt,
      updatedAt: now,
    };
  }
  if (params.inserted > 0 && params.newestInsertedBody && params.newestInsertedAt) {
    const existingMs = params.convLastMessageAt ? new Date(params.convLastMessageAt).getTime() : 0;
    if (!params.convLastMessageAt || params.newestInsertedAt.getTime() >= existingMs - CLOCK_SKEW_TOLERANCE_MS) {
      return {
        lastMessage: params.newestInsertedBody,
        lastMessageAt: new Date(Math.max(params.newestInsertedAt.getTime(), existingMs)),
        updatedAt: now,
      };
    }
  }
  return null;
}

async function resolveSyncedMediaDetails(
  m: any,
  conv: typeof conversations.$inferSelect,
  contact: typeof contacts.$inferSelect,
  fromMe: boolean,
  senderName: string | null,
  senderPhone: string | null
): Promise<{
  hasMedia: boolean;
  mediaType: 'image' | 'video' | 'audio' | 'document' | null;
  mediaUrl: string | null;
  mediaFallbackLabel: string;
}> {
  const mediaMeta = extractInboundWahaMediaMeta(m);
  if (!mediaMeta.hasMedia) {
    return { hasMedia: false, mediaType: null, mediaUrl: null, mediaFallbackLabel: '' };
  }
  const mediaFallbackLabel = mediaMeta.isSticker
    ? '[Stiker]'
    : mediaMeta.mediaType === 'image'
    ? '[Gambar]'
    : mediaMeta.mediaType === 'video'
    ? '[Video]'
    : mediaMeta.mediaType === 'audio'
    ? '[Audio]'
    : mediaMeta.mediaType === 'document'
    ? mediaMeta.mediaName
      ? `[Dokumen: ${mediaMeta.mediaName}]`
      : '[Dokumen]'
    : '[Lampiran Media]';

  let mediaUrl: string | null = mediaMeta.rawMediaUrl;
  const mediaMetadata = {
    source: fromMe ? ('OUTBOUND' as const) : ('INBOUND' as const),
    companyId: conv.companyId,
    conversationId: conv.id,
    contactId: contact.id,
    contactName: contact.namaLengkap || undefined,
    senderName: senderName || contact.namaLengkap || undefined,
    senderPhone: senderPhone || contact.nomorWhatsapp || undefined,
    channel: 'WHATSAPP',
    label: conv.wahaSession ? `WA • ${conv.wahaSession}` : 'WhatsApp',
  };

  if (mediaMeta.inlineBase64) {
    try {
      const saved = await saveBase64MediaFile({
        base64: mediaMeta.inlineBase64,
        mimeType: mediaMeta.mimetype || undefined,
        fileName: mediaMeta.mediaName || undefined,
        maxBytes: 25 * 1024 * 1024,
        metadata: mediaMetadata,
      });
      mediaUrl = saved.relativeUrl;
    } catch {
      // keep fallback
    }
  } else if (mediaMeta.rawMediaUrl) {
    try {
      const downloaded = await wahaService.downloadMedia(mediaMeta.rawMediaUrl);
      const saved = await saveMediaBufferFile({
        buffer: downloaded.buffer,
        mimeType: mediaMeta.mimetype || downloaded.contentType,
        fileName: mediaMeta.mediaName || downloaded.filename,
        maxBytes: 25 * 1024 * 1024,
        metadata: mediaMetadata,
      });
      mediaUrl = saved.relativeUrl;
    } catch {
      // keep rawMediaUrl fallback
    }
  }

  return {
    hasMedia: true,
    mediaType: mediaMeta.mediaType,
    mediaUrl,
    mediaFallbackLabel,
  };
}

export async function syncRecentWhatsAppChatMessages(
  conv: typeof conversations.$inferSelect,
  contact: typeof contacts.$inferSelect,
  opts?: { force?: boolean; limit?: number; offset?: number }
): Promise<{ inserted: number; acksUpdated: number; fetchedCount: number }> {
  if ((conv.channel || 'WHATSAPP').toUpperCase() !== 'WHATSAPP') {
    return { inserted: 0, acksUpdated: 0, fetchedCount: 0 };
  }

  const key = `${conv.companyId}:${conv.id}`;
  const nowMs = Date.now();
  if (!opts?.force) {
    const prev = lastChatSyncAt.get(key) || 0;
    if (nowMs - prev < CHAT_SYNC_COOLDOWN_MS) {
      return { inserted: 0, acksUpdated: 0, fetchedCount: 0 };
    }
  }
  lastChatSyncAt.set(key, nowMs);

  const targetJid =
    conv.externalThreadId?.trim() ||
    (contact.nomorWhatsapp ? toWahaChatId(contact.nomorWhatsapp) : '');
  if (!targetJid) return { inserted: 0, acksUpdated: 0, fetchedCount: 0 };

  const limit = Math.min(Math.max(Number(opts?.limit || 25), 1), 100);
  const offset = Math.max(Number(opts?.offset || 0), 0);
  const rawMessages = await wahaService.fetchChatMessages(
    targetJid,
    limit,
    conv.wahaSession || undefined,
    offset
  );
  if (rawMessages.length === 0) return { inserted: 0, acksUpdated: 0, fetchedCount: 0 };

  const existingRows = await db
    .select({
      id: chatMessages.id,
      wahaMessageId: chatMessages.wahaMessageId,
      ackStatus: chatMessages.ackStatus,
      direction: chatMessages.direction,
      mediaUrl: chatMessages.mediaUrl,
      mediaType: chatMessages.mediaType,
      body: chatMessages.body,
    })
    .from(chatMessages)
    .where(and(eq(chatMessages.conversationId, conv.id), eq(chatMessages.companyId, conv.companyId)))
    .orderBy(desc(chatMessages.createdAt))
    .limit(500);

  const byMsgId = new Map<string, (typeof existingRows)[number]>();
  for (const row of existingRows) {
    if (!row.wahaMessageId) continue;
    byMsgId.set(row.wahaMessageId, row);
    const underscoreIdx = row.wahaMessageId.lastIndexOf('_');
    if (underscoreIdx !== -1 && underscoreIdx < row.wahaMessageId.length - 1) {
      byMsgId.set(row.wahaMessageId.slice(underscoreIdx + 1), row);
    }
  }

  let inserted = 0;
  let acksUpdated = 0;
  let latestMsgBody: string | null = null;
  let latestMsgAt: Date | null = conv.lastMessageAt ? new Date(conv.lastMessageAt) : null;
  let newestInsertedBody: string | null = null;
  let newestInsertedAt: Date | null = null;

  for (const m of rawMessages) {
    if (!m || typeof m !== 'object') continue;
    const { exactIds, stanzaIds } = extractWahaMessageIds(m);
    const primaryId = exactIds[0] || stanzaIds[0] || null;
    if (!primaryId) continue;

    let matchedExisting: (typeof existingRows)[number] | undefined;
    for (const candidate of [...exactIds, ...stanzaIds]) {
      matchedExisting = byMsgId.get(candidate);
      if (matchedExisting) break;
    }

    const fromMe = isWahaFromMe(m);
    let senderName = fromMe ? 'Perangkat WA' : contact.namaLengkap;
    let senderPhone: string | null = fromMe ? null : contact.nomorWhatsapp || null;
    let senderJid: string | null = null;
    if (conv.isGroup && !fromMe) {
      const part = extractGroupParticipant(m);
      senderJid = part.participantJid;
      senderPhone = part.participantPhone;
      const rawPush = String(
        m?.notifyName || m?._data?.notifyName || m?._data?.Info?.PushName || m?._data?.pushName || ''
      ).trim();
      senderName = rawPush || (senderPhone ? `+${senderPhone}` : 'Anggota Grup');
    }

    const ackValue = normalizeWahaAck(m);
    if (matchedExisting) {
      const updateFields: Record<string, any> = {};
      if (
        matchedExisting.direction === 'OUTBOUND' &&
        ackValue !== null &&
        ackValue > (matchedExisting.ackStatus ?? 0)
      ) {
        const now = new Date();
        updateFields.ackStatus = ackValue;
        updateFields.status = ackValue >= 3 ? 'READ' : ackValue === 2 ? 'DELIVERED' : 'SENT';
        if (ackValue >= 2) updateFields.deliveredAt = now;
        if (ackValue >= 3) updateFields.readAt = now;
        matchedExisting.ackStatus = ackValue;
      }
      if (!matchedExisting.mediaUrl || !matchedExisting.mediaType) {
        const mediaCheck = extractInboundWahaMediaMeta(m);
        if (mediaCheck.hasMedia) {
          const mediaDetails = await resolveSyncedMediaDetails(
            m,
            conv,
            contact,
            fromMe,
            senderName,
            senderPhone
          );
          if (!matchedExisting.mediaUrl && mediaDetails.mediaUrl) {
            updateFields.mediaUrl = mediaDetails.mediaUrl;
            matchedExisting.mediaUrl = mediaDetails.mediaUrl;
          }
          if (!matchedExisting.mediaType && mediaDetails.mediaType) {
            updateFields.mediaType = mediaDetails.mediaType;
            matchedExisting.mediaType = mediaDetails.mediaType;
          }
          if (matchedExisting.body === '[Media]' && mediaDetails.mediaFallbackLabel) {
            const rawText = extractInboundWahaText(m).trim();
            updateFields.body = rawText || mediaDetails.mediaFallbackLabel;
            matchedExisting.body = updateFields.body;
          }
        }
      }
      if (Object.keys(updateFields).length > 0) {
        await db
          .update(chatMessages)
          .set(updateFields)
          .where(eq(chatMessages.id, matchedExisting.id))
          .catch(() => {});
        acksUpdated++;
      }
      continue;
    }

    const rawText = extractInboundWahaText(m).trim();
    const mediaMeta = extractInboundWahaMediaMeta(m);
    const richData = extractInboundWahaRichData(m, mediaMeta, rawText);
    const mediaDetails = await resolveSyncedMediaDetails(
      m,
      conv,
      contact,
      fromMe,
      senderName,
      senderPhone
    );
    const body = richData.body || (mediaDetails.hasMedia ? mediaDetails.mediaFallbackLabel : '');
    if (!body) continue;

    const mergedMeta: Record<string, any> = {
      ...(richData.metadata || {}),
      ...(fromMe ? { sentVia: 'WHATSAPP_DEVICE', sentViaLabel: 'Perangkat WA' } : {}),
    };
    const serializedMeta = Object.keys(mergedMeta).length > 0 ? JSON.stringify(mergedMeta) : null;

    const msgDate = parseWahaTimestamp(m.timestamp ?? m._data?.Info?.Timestamp);
    const effectiveAck = ackValue ?? (fromMe ? 1 : 2);
    const msgStatus = fromMe
      ? effectiveAck >= 3
        ? 'READ'
        : effectiveAck === 2
        ? 'DELIVERED'
        : 'SENT'
      : 'DELIVERED';

    await db
      .insert(chatMessages)
      .values({
        id: crypto.randomUUID(),
        companyId: conv.companyId,
        conversationId: conv.id,
        contactId: contact.id,
        wahaSession: conv.wahaSession || null,
        direction: fromMe ? 'OUTBOUND' : 'INBOUND',
        senderName,
        senderPhone,
        senderJid,
        body,
        mediaUrl: mediaDetails.mediaUrl,
        mediaType: mediaDetails.mediaType,
        wahaMessageId: primaryId,
        status: msgStatus,
        ackStatus: effectiveAck,
        sentAt: fromMe ? msgDate : null,
        deliveredAt: effectiveAck >= 2 ? msgDate : null,
        readAt: effectiveAck >= 3 ? msgDate : null,
        metadataJson: serializedMeta,
        createdAt: msgDate,
      })
      .onConflictDoNothing()
      .catch(() => {});

    for (const candidate of [...exactIds, ...stanzaIds]) {
      byMsgId.set(candidate, {
        id: primaryId,
        wahaMessageId: primaryId,
        ackStatus: effectiveAck,
        direction: fromMe ? 'OUTBOUND' : 'INBOUND',
        mediaUrl: mediaDetails.mediaUrl,
        mediaType: mediaDetails.mediaType,
        body,
      });
    }
    inserted++;
    const previewText = conv.isGroup && !fromMe && senderName ? `${senderName}: ${body}` : body;
    if (!newestInsertedAt || msgDate.getTime() >= newestInsertedAt.getTime()) {
      newestInsertedAt = msgDate;
      newestInsertedBody = previewText;
    }
    if (!latestMsgAt || msgDate.getTime() > latestMsgAt.getTime()) {
      latestMsgAt = msgDate;
      latestMsgBody = previewText;
    }
  }

  const bumpUpdate = resolveConversationSyncBumpUpdate({
    isHistoricalOffset: Boolean(opts?.offset && opts.offset > 0),
    convLastMessageAt: conv.lastMessageAt,
    latestMsgBody,
    latestMsgAt,
    inserted,
    newestInsertedBody,
    newestInsertedAt,
  });

  if (bumpUpdate) {
    await db
      .update(conversations)
      .set(bumpUpdate)
      .where(eq(conversations.id, conv.id))
      .catch(() => {});
  }

  if (inserted > 0 || acksUpdated > 0) {
    liveEvents.emit('conversations:update', { conversationId: conv.id }, conv.companyId);
  }

  return { inserted, acksUpdated, fetchedCount: rawMessages.length };
}

let wahaBgSyncTimer: NodeJS.Timeout | null = null;
let wahaBgSyncRunning = false;

export async function syncCompanyRecentWhatsAppChats(companyId: string): Promise<number> {
  let totalInserted = 0;
  let sessions: Array<{ name: string; status: string }> = [];
  try {
    const listed = await wahaService.listSessions();
    sessions = listed.sessions || [];
  } catch {
    return 0;
  }
  const workingSessions = sessions.filter((s) => String(s.status || '').toUpperCase() === 'WORKING');
  if (workingSessions.length === 0) return 0;

  for (const sess of workingSessions) {
    const recentChats = await wahaService.fetchRecentChats(sess.name, 12);
    if (recentChats.length === 0) continue;

    for (const chat of recentChats) {
      if (!chat || typeof chat !== 'object') continue;
      const rawChatId = String(
        typeof chat.id === 'string'
          ? chat.id
          : chat.id?._serialized || chat.chatId || chat._serialized || ''
      ).trim();
      const lowerChatId = rawChatId.toLowerCase();
      if (
        !rawChatId ||
        lowerChatId === 'status@broadcast' ||
        lowerChatId.endsWith('@broadcast') ||
        lowerChatId.endsWith('@newsletter')
      ) {
        continue;
      }

      const isGroup = lowerChatId.endsWith('@g.us');
      if (!isGroup && !isPersonalWahaJid(rawChatId)) continue;

      const lastMsg = chat.lastMessage && typeof chat.lastMessage === 'object' ? chat.lastMessage : null;
      if (lastMsg) {
        const { exactIds, stanzaIds } = extractWahaMessageIds(lastMsg);
        const dedupIds = Array.from(new Set([...exactIds, ...stanzaIds]));
        if (dedupIds.length > 0) {
          const idMatchConditions = [
            inArray(chatMessages.wahaMessageId, dedupIds),
            ...stanzaIds.map((stanza) => {
              const escaped = stanza.replace(/[\\%_]/g, '\\$&');
              return like(chatMessages.wahaMessageId, `%_${escaped}`);
            }),
          ];
          const existingLast = await db
            .select({
              id: chatMessages.id,
              mediaUrl: chatMessages.mediaUrl,
            })
            .from(chatMessages)
            .where(and(eq(chatMessages.companyId, companyId), or(...idMatchConditions)))
            .limit(1);
          const lastHasMedia = Boolean(lastMsg.hasMedia || lastMsg.media?.url);
          if (existingLast[0] && (!lastHasMedia || existingLast[0].mediaUrl)) {
            continue;
          }
        }
      }

      let matchedConv: typeof conversations.$inferSelect | undefined;
      let matchedContact: typeof contacts.$inferSelect | undefined;

      if (isGroup) {
        const groupRows = await db
          .select({ conv: conversations, contact: contacts })
          .from(conversations)
          .leftJoin(contacts, eq(conversations.contactId, contacts.id))
          .where(
            and(
              eq(conversations.companyId, companyId),
              eq(conversations.channel, 'WHATSAPP'),
              eq(conversations.externalThreadId, rawChatId)
            )
          )
          .orderBy(desc(conversations.updatedAt));
        const picked =
          groupRows.find(
            (r) => (r.conv.wahaSession || '').trim().toLowerCase() === sess.name.toLowerCase()
          ) || groupRows[0];
        if (picked?.conv && picked?.contact) {
          matchedConv = picked.conv;
          matchedContact = picked.contact;
        }
      } else {
        const lidRows = await db
          .select({ conv: conversations, contact: contacts })
          .from(conversations)
          .leftJoin(contacts, eq(conversations.contactId, contacts.id))
          .where(
            and(
              eq(conversations.companyId, companyId),
              eq(conversations.channel, 'WHATSAPP'),
              eq(conversations.externalThreadId, rawChatId)
            )
          )
          .orderBy(desc(conversations.updatedAt));
        const lidPicked =
          lidRows.find(
            (r) => (r.conv.wahaSession || '').trim().toLowerCase() === sess.name.toLowerCase()
          ) || lidRows[0];
        if (lidPicked?.conv && lidPicked?.contact) {
          matchedConv = lidPicked.conv;
          matchedContact = lidPicked.contact;
        } else {
          let phone = !lowerChatId.endsWith('@lid') ? fromWahaChatId(rawChatId) : '';
          if (!phone && lowerChatId.endsWith('@lid')) {
            const resolved = await wahaService.resolveLidToPhone(sess.name, rawChatId);
            if (resolved) phone = normalizePhoneNumber(resolved);
          }
          if (phone) {
            const phoneCandidates = Array.from(
              new Set([phone, `+${phone}`, phone.startsWith('62') ? `0${phone.slice(2)}` : ''].filter(Boolean))
            );
            const contactRows = await db
              .select()
              .from(contacts)
              .where(and(eq(contacts.companyId, companyId), inArray(contacts.nomorWhatsapp, phoneCandidates)))
              .limit(1);
            if (contactRows[0]) {
              matchedContact = contactRows[0];
              const convRows = await db
                .select()
                .from(conversations)
                .where(
                  and(
                    eq(conversations.companyId, companyId),
                    eq(conversations.contactId, contactRows[0].id),
                    eq(conversations.channel, 'WHATSAPP'),
                    eq(conversations.isGroup, false)
                  )
                )
                .orderBy(desc(conversations.updatedAt));
              matchedConv =
                convRows.find(
                  (c) => (c.wahaSession || '').trim().toLowerCase() === sess.name.toLowerCase()
                ) || convRows.find((c) => !c.wahaSession);
            }
          }
        }
      }

      if (matchedConv && matchedContact) {
        const res = await syncRecentWhatsAppChatMessages(matchedConv, matchedContact, {
          force: true,
          limit: 15,
        });
        if (res.inserted > 0) {
          totalInserted += res.inserted;
          wahaService.recordWebhookEvent(
            {
              receivedAt: new Date().toISOString(),
              event: 'chat.sync',
              session: sess.name,
              from: rawChatId,
              outcome: 'PROCESSED',
              note: `Sinkronisasi otomatis ${res.inserted} pesan baru`,
            },
            companyId
          );
        }
      }
    }
  }
  return totalInserted;
}

export function startWahaBackgroundSyncMonitor(): void {
  if (wahaBgSyncTimer) return;
  wahaBgSyncTimer = setInterval(async () => {
    if (wahaBgSyncRunning) return;
    wahaBgSyncRunning = true;
    try {
      const companyIds = await listActiveCompanyIds();
      for (const cid of companyIds) {
        await runWithCompany(cid, () => syncCompanyRecentWhatsAppChats(cid)).catch(() => 0);
      }
    } catch {
      // ignore transient poll errors
    } finally {
      wahaBgSyncRunning = false;
    }
  }, 12_000);
}
