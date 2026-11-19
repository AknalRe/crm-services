import crypto from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { chatMessages, contacts, conversations } from '../db/schema';
import { liveEvents } from './events.service';
import { wahaService } from './waha.service';
import {
  extractGroupParticipant,
  extractInboundWahaText,
  extractWahaMessageIds,
  isWahaFromMe,
  normalizeWahaAck,
} from '../routes/waha';
import { toWahaChatId } from './phone.utils';

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

export async function syncRecentWhatsAppChatMessages(
  conv: typeof conversations.$inferSelect,
  contact: typeof contacts.$inferSelect,
  opts?: { force?: boolean; limit?: number }
): Promise<{ inserted: number; acksUpdated: number }> {
  if ((conv.channel || 'WHATSAPP').toUpperCase() !== 'WHATSAPP') {
    return { inserted: 0, acksUpdated: 0 };
  }

  const key = `${conv.companyId}:${conv.id}`;
  const nowMs = Date.now();
  if (!opts?.force) {
    const prev = lastChatSyncAt.get(key) || 0;
    if (nowMs - prev < CHAT_SYNC_COOLDOWN_MS) {
      return { inserted: 0, acksUpdated: 0 };
    }
  }
  lastChatSyncAt.set(key, nowMs);

  const targetJid =
    conv.externalThreadId?.trim() ||
    (contact.nomorWhatsapp ? toWahaChatId(contact.nomorWhatsapp) : '');
  if (!targetJid) return { inserted: 0, acksUpdated: 0 };

  const rawMessages = await wahaService.fetchChatMessages(
    targetJid,
    opts?.limit ?? 25,
    conv.wahaSession || undefined
  );
  if (rawMessages.length === 0) return { inserted: 0, acksUpdated: 0 };

  const existingRows = await db
    .select({
      id: chatMessages.id,
      wahaMessageId: chatMessages.wahaMessageId,
      ackStatus: chatMessages.ackStatus,
      direction: chatMessages.direction,
    })
    .from(chatMessages)
    .where(and(eq(chatMessages.conversationId, conv.id), eq(chatMessages.companyId, conv.companyId)))
    .orderBy(desc(chatMessages.createdAt))
    .limit(120);

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

    const ackValue = normalizeWahaAck(m);
    if (matchedExisting) {
      if (
        matchedExisting.direction === 'OUTBOUND' &&
        ackValue !== null &&
        ackValue > (matchedExisting.ackStatus ?? 0)
      ) {
        const now = new Date();
        await db
          .update(chatMessages)
          .set({
            ackStatus: ackValue,
            status: ackValue >= 3 ? 'READ' : ackValue === 2 ? 'DELIVERED' : 'SENT',
            deliveredAt: ackValue >= 2 ? now : undefined,
            readAt: ackValue >= 3 ? now : undefined,
          })
          .where(eq(chatMessages.id, matchedExisting.id))
          .catch(() => {});
        matchedExisting.ackStatus = ackValue;
        acksUpdated++;
      }
      continue;
    }

    const rawText = extractInboundWahaText(m).trim();
    const hasMedia = Boolean(m.hasMedia);
    const body = rawText || (hasMedia ? '[Media]' : '');
    if (!body) continue;

    const fromMe = isWahaFromMe(m);
    const msgDate = parseWahaTimestamp(m.timestamp ?? m._data?.Info?.Timestamp);
    const effectiveAck = ackValue ?? (fromMe ? 1 : 2);
    const msgStatus = fromMe
      ? effectiveAck >= 3
        ? 'READ'
        : effectiveAck === 2
        ? 'DELIVERED'
        : 'SENT'
      : 'DELIVERED';

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
        wahaMessageId: primaryId,
        status: msgStatus,
        ackStatus: effectiveAck,
        sentAt: fromMe ? msgDate : null,
        deliveredAt: effectiveAck >= 2 ? msgDate : null,
        readAt: effectiveAck >= 3 ? msgDate : null,
        metadataJson: fromMe
          ? JSON.stringify({ sentVia: 'WHATSAPP_DEVICE', sentViaLabel: 'Perangkat WA' })
          : null,
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
      });
    }
    inserted++;
    const previewText = conv.isGroup && !fromMe && senderName ? `${senderName}: ${body}` : body;
    if (!latestMsgAt || msgDate.getTime() > latestMsgAt.getTime()) {
      latestMsgAt = msgDate;
      latestMsgBody = previewText;
    }
  }

  if (latestMsgBody && latestMsgAt) {
    await db
      .update(conversations)
      .set({
        lastMessage: latestMsgBody,
        lastMessageAt: latestMsgAt,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conv.id))
      .catch(() => {});
  }

  if (inserted > 0 || acksUpdated > 0) {
    liveEvents.emit('conversations:update', { conversationId: conv.id }, conv.companyId);
  }

  return { inserted, acksUpdated };
}
