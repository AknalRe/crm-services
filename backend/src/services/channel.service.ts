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

export type OmnichannelType = 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | 'THREADS' | 'TELEGRAM';

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

  if (!contactId) {
    const displayName =
      (senderName || '').trim() ||
      (senderHandle ? `@${senderHandle.replace(/^@/, '')}` : '') ||
      `${channel} ${externalSenderId.slice(-6)}`;

    contactId = crypto.randomUUID();
    await db.insert(contacts).values({
      id: contactId,
      namaLengkap: displayName,
      namaPanggilan: senderHandle || senderName || null,
      nomorWhatsapp: null,
      tags: `Inbound ${channel}`,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(contactIdentities).values({
      id: crypto.randomUUID(),
      contactId,
      channel,
      externalId: externalSenderId,
      handle: senderHandle || null,
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

  if (!conversationId) {
    conversationId = crypto.randomUUID();
    await db.insert(conversations).values({
      id: conversationId,
      contactId,
      channel,
      channelAccountId,
      externalThreadId: externalThreadId || null,
      contextTitle: contextTitle || null,
      status: 'OPEN',
      lastMessage: body,
      lastMessageAt: now,
      firstInboundAt: now,
      unreadCount: 1,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(conversations)
      .set({
        externalThreadId: externalThreadId || existing.externalThreadId,
        contextTitle: contextTitle || existing.contextTitle,
        status: existing.status === 'RESOLVED' ? 'OPEN' : existing.status,
        firstInboundAt: existing.firstInboundAt || now,
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

  if (!identity) {
    throw new Error(`Identitas penerima untuk channel ${channel} tidak ditemukan`);
  }

  if (channel === 'TELEGRAM') {
    const res = await axios.post(
      `https://api.telegram.org/bot${account.accessToken}/sendMessage`,
      {
        chat_id: identity.externalId,
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
        recipient: { id: identity.externalId },
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
