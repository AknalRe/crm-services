import crypto from 'crypto';
import axios from 'axios';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  channelAccounts,
  chatMessages,
  contactIdentities,
  contacts,
  conversations,
} from '../db/schema';
import { liveEvents } from './events.service';
import { handleInboundAutomation } from './automation.service';

export type OmnichannelType =
  | 'WHATSAPP'
  | 'WHATSAPP_CLOUD'
  | 'INSTAGRAM'
  | 'FACEBOOK'
  | 'THREADS'
  | 'TELEGRAM';

export async function upsertInboundChannelMessage(params: {
  channel: OmnichannelType;
  channelAccountId: string;
  externalSenderId: string;
  senderName?: string | null;
  senderHandle?: string | null;
  externalMessageId?: string | null;
  externalThreadId?: string | null;
  contextTitle?: string | null;
  body: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
}): Promise<{ conversationId: string; contactId: string }> {
  const {
    channel,
    channelAccountId,
    externalSenderId,
    senderName,
    senderHandle,
    externalMessageId,
    externalThreadId,
    contextTitle,
    body,
    mediaUrl,
    mediaType,
  } = params;

  const now = new Date();

  // Deduplicate by externalMessageId if present
  if (externalMessageId) {
    const dup = await db
      .select({ id: chatMessages.id, conversationId: chatMessages.conversationId, contactId: chatMessages.contactId })
      .from(chatMessages)
      .where(eq(chatMessages.externalMessageId, externalMessageId));
    if (dup[0]) {
      return { conversationId: dup[0].conversationId, contactId: dup[0].contactId };
    }
  }

  // 1. Find or create contact via contact_identities
  const identityRows = await db
    .select()
    .from(contactIdentities)
    .where(
      and(
        eq(contactIdentities.channel, channel),
        eq(contactIdentities.externalId, externalSenderId)
      )
    );

  let contactId = identityRows[0]?.contactId;

  if (!contactId && channel === 'WHATSAPP_CLOUD') {
    const cleanPhone = externalSenderId.replace(/\D/g, '');
    if (cleanPhone) {
      const byPhone = await db
        .select()
        .from(contacts)
        .where(eq(contacts.nomorWhatsapp, cleanPhone));
      if (byPhone[0]) {
        contactId = byPhone[0].id;
        await db.insert(contactIdentities).values({
          id: crypto.randomUUID(),
          contactId,
          channel,
          externalId: externalSenderId,
          handle: `+${cleanPhone}`,
          createdAt: now,
        });
      }
    }
  }

  if (!contactId) {
    const displayName =
      (senderName || '').trim() ||
      (senderHandle ? `@${senderHandle.replace(/^@/, '')}` : '') ||
      `${channel} ${externalSenderId.slice(-6)}`;

    const cleanWaCloud =
      channel === 'WHATSAPP_CLOUD' ? externalSenderId.replace(/\D/g, '') || null : null;

    contactId = crypto.randomUUID();
    await db.insert(contacts).values({
      id: contactId,
      namaLengkap: displayName,
      namaPanggilan: senderHandle || senderName || null,
      nomorWhatsapp: cleanWaCloud,
      tags: `Inbound ${channel}`,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(contactIdentities).values({
      id: crypto.randomUUID(),
      contactId,
      channel,
      externalId: externalSenderId,
      handle: senderHandle || (cleanWaCloud ? `+${cleanWaCloud}` : null),
      createdAt: now,
    });
  }

  // 2. Find or create conversation for (contactId, channel, channelAccountId)
  const convRows = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.contactId, contactId),
        eq(conversations.channel, channel),
        eq(conversations.channelAccountId, channelAccountId)
      )
    );

  const existing = convRows[0];
  let conversationId = existing?.id;
  const inboundPush = (senderName || senderHandle || '').trim() || null;

  const contactRows = await db
    .select({
      excludeFromMetrics: contacts.excludeFromMetrics,
      excludeReason: contacts.excludeReason,
    })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  const contactExcluded = Boolean(contactRows[0]?.excludeFromMetrics);
  const contactExcludeReason = contactExcluded
    ? (contactRows[0]?.excludeReason || 'Bukan Customer')
    : null;

  if (!conversationId) {
    conversationId = crypto.randomUUID();
    await db.insert(conversations).values({
      id: conversationId,
      contactId,
      channel,
      channelAccountId,
      externalThreadId: externalThreadId || null,
      contextTitle: contextTitle || null,
      pushName: inboundPush,
      excludeFromMetrics: contactExcluded,
      excludeReason: contactExcludeReason,
      status: 'OPEN',
      lastMessage: body,
      lastMessageAt: now,
      firstInboundAt: now,
      lastInboundAt: now,
      sessionStartedAt: now,
      unreadCount: 1,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    const isReopeningFromResolved = existing.status === 'RESOLVED';
    await db
      .update(conversations)
      .set({
        externalThreadId: externalThreadId || existing.externalThreadId,
        contextTitle: contextTitle || existing.contextTitle,
        pushName: inboundPush || existing.pushName,
        excludeFromMetrics: contactExcluded ? true : existing.excludeFromMetrics,
        excludeReason: contactExcluded
          ? (contactExcludeReason || existing.excludeReason || 'Bukan Customer')
          : existing.excludeReason,
        status: isReopeningFromResolved ? 'OPEN' : existing.status,
        sessionStartedAt: isReopeningFromResolved
          ? now
          : existing.sessionStartedAt || existing.firstInboundAt || existing.createdAt,
        resolvedAt: isReopeningFromResolved ? null : existing.resolvedAt,
        firstInboundAt: existing.firstInboundAt || now,
        lastInboundAt: now,
        lastMessage: body,
        lastMessageAt: now,
        unreadCount: sql`${conversations.unreadCount} + 1`,
        updatedAt: now,
      })
      .where(eq(conversations.id, conversationId));
  }

  // 3. Insert chatMessage
  await db.insert(chatMessages).values({
    id: crypto.randomUUID(),
    conversationId,
    contactId,
    direction: 'INBOUND',
    messageType: mediaUrl ? 'MEDIA' : 'TEXT',
    channel,
    externalMessageId: externalMessageId || null,
    body,
    mediaUrl: mediaUrl || null,
    mediaType: mediaType || null,
    status: 'DELIVERED',
    ackStatus: 2,
    createdAt: now,
  });

  liveEvents.emit('conversations:update', { conversationId, channel });

  if (body) {
    const contactRows = await db.select().from(contacts).where(eq(contacts.id, contactId));
    const contactRecord = contactRows[0] || { id: contactId, namaLengkap: senderName || 'Pelanggan' };
    void handleInboundAutomation({
      conversationId,
      contact: contactRecord,
      assignedAgentId: existing?.assignedAgentId || null,
      inboundBody: body,
      channel,
      channelAccountId,
      externalThreadId: externalThreadId || existing?.externalThreadId || null,
      isNewConversation: !existing,
    });
  }

  return { conversationId, contactId };
}

export async function sendOutboundChannelMessage(params: {
  channel: OmnichannelType;
  channelAccountId?: string | null;
  contactId: string;
  externalThreadId?: string | null;
  text: string;
}): Promise<{ externalMessageId: string | null }> {
  const { channel, channelAccountId, contactId, externalThreadId, text } = params;

  if (!channelAccountId) {
    throw new Error(`Akun channel ${channel} belum tertaut pada percakapan ini`);
  }

  const [account] = await db
    .select()
    .from(channelAccounts)
    .where(eq(channelAccounts.id, channelAccountId));

  if (!account || !account.isActive) {
    throw new Error(`Akun ${channel} tidak ditemukan atau sedang nonaktif`);
  }
  if (!account.accessToken) {
    throw new Error(`Access token untuk ${account.name} (${channel}) belum dikonfigurasi`);
  }

  const [identity] = await db
    .select()
    .from(contactIdentities)
    .where(and(eq(contactIdentities.contactId, contactId), eq(contactIdentities.channel, channel)));

  let targetExternalId = identity?.externalId || '';
  if (!targetExternalId && channel === 'WHATSAPP_CLOUD') {
    const [contactRow] = await db.select().from(contacts).where(eq(contacts.id, contactId));
    if (contactRow?.nomorWhatsapp) {
      targetExternalId = contactRow.nomorWhatsapp.replace(/\D/g, '');
    }
  }

  if (!targetExternalId) {
    throw new Error(`Identitas penerima untuk channel ${channel} tidak ditemukan`);
  }

  if (channel === 'WHATSAPP_CLOUD') {
    const toPhone = targetExternalId.replace(/\D/g, '');
    const res = await axios.post(
      `https://graph.facebook.com/v20.0/${account.accountId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'text',
        text: { body: text },
      },
      {
        headers: { Authorization: `Bearer ${account.accessToken}` },
        timeout: 12_000,
      }
    );
    const msgId = res.data?.messages?.[0]?.id ? String(res.data.messages[0].id) : null;
    return { externalMessageId: msgId };
  }

  if (channel === 'TELEGRAM') {
    const res = await axios.post(
      `https://api.telegram.org/bot${account.accessToken}/sendMessage`,
      {
        chat_id: targetExternalId,
        text,
      },
      { timeout: 10_000 }
    );
    const msgId = res.data?.result?.message_id ? String(res.data.result.message_id) : null;
    return { externalMessageId: msgId };
  }

  if (channel === 'FACEBOOK' || channel === 'INSTAGRAM') {
    const endpoint =
      channel === 'INSTAGRAM'
        ? `https://graph.instagram.com/v21.0/${account.accountId}/messages`
        : `https://graph.facebook.com/v21.0/${account.accountId}/messages`;

    const res = await axios.post(
      endpoint,
      {
        recipient: { id: targetExternalId },
        message: { text },
      },
      {
        params: { access_token: account.accessToken },
        timeout: 10_000,
      }
    );
    return { externalMessageId: res.data?.message_id || null };
  }

  if (channel === 'THREADS') {
    // Two-step Threads Graph API reply
    const createRes = await axios.post(
      `https://graph.threads.net/v1.0/${account.accountId}/threads`,
      null,
      {
        params: {
          media_type: 'TEXT',
          text,
          ...(externalThreadId ? { reply_to_id: externalThreadId } : {}),
          access_token: account.accessToken,
        },
        timeout: 10_000,
      }
    );
    const creationId = createRes.data?.id;
    if (!creationId) {
      throw new Error('Threads API tidak mengembalikan creation_id');
    }
    const pubRes = await axios.post(
      `https://graph.threads.net/v1.0/${account.accountId}/threads_publish`,
      null,
      {
        params: {
          creation_id: creationId,
          access_token: account.accessToken,
        },
        timeout: 10_000,
      }
    );
    return { externalMessageId: pubRes.data?.id || creationId };
  }

  throw new Error(`Channel ${channel} belum didukung untuk pengiriman keluar`);
}
