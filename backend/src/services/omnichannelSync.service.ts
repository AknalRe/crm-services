import axios from 'axios';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { channelAccounts, chatMessages, contactIdentities, contacts, conversations, socialComments } from '../db/schema';
import { upsertInboundChannelMessage } from './channel.service';
import { liveEvents } from './events.service';
import { listActiveCompanyIds, runWithCompany } from './tenantContext';
import crypto from 'crypto';

function isInstagramLoginToken(token?: string | null): boolean {
  const t = String(token || '').trim();
  return t.startsWith('IGAA') || t.startsWith('IGQV') || t.startsWith('IGQ');
}

export function getInstagramGraphBaseUrl(token?: string | null): string {
  return isInstagramLoginToken(token)
    ? 'https://graph.instagram.com/v21.0'
    : 'https://graph.facebook.com/v21.0';
}

export interface OmnichannelSyncResult {
  accountsChecked: number;
  messagesSynced: number;
  commentsSynced: number;
  errors: string[];
  details?: Array<{
    channel: string;
    account: string;
    threadsFound: number;
    hint?: string;
  }>;
}

// Sync Instagram DMs (via Graph Conversations API) + Threads replies into CRM Inbox
export async function syncCompanyOmnichannelMessages(companyId: string): Promise<OmnichannelSyncResult> {
  const result: OmnichannelSyncResult = {
    accountsChecked: 0,
    messagesSynced: 0,
    commentsSynced: 0,
    errors: [],
    details: [],
  };

  const activeAccounts = await db
    .select()
    .from(channelAccounts)
    .where(and(eq(channelAccounts.companyId, companyId), eq(channelAccounts.isActive, true)));

  const socialAccounts = activeAccounts.filter(
    (a) => a.accessToken && ['INSTAGRAM', 'FACEBOOK', 'THREADS'].includes(a.channel)
  );

  for (const acc of socialAccounts) {
    result.accountsChecked += 1;
    const token = String(acc.accessToken || '').trim();
    if (!token) continue;

    try {
      if (acc.channel === 'INSTAGRAM') {
        const graphBase = getInstagramGraphBaseUrl(token);
        const isDirect = isInstagramLoginToken(token);
        const convPath = isDirect
          ? `${graphBase}/me/conversations`
          : `${graphBase}/${encodeURIComponent(acc.accountId)}/conversations`;

        // Ensure Instagram account is subscribed to webhook fields (best-effort)
        if (isDirect) {
          axios
            .post(`${graphBase}/me/subscribed_apps`, null, {
              params: {
                subscribed_fields: 'messages,comments,messaging_postbacks,message_reactions',
                access_token: token,
              },
              timeout: 8_000,
            })
            .catch(() => {});
        }

        const threadMap = new Map<string, any>();
        const queryVariants: Array<Record<string, any>> = [
          {
            platform: 'instagram',
            fields:
              'id,updated_time,participants,messages.limit(15){id,message,created_time,from,to,attachments{mime_type,image_data,video_data,file_url}}',
            limit: 20,
            access_token: token,
          },
          {
            platform: 'instagram',
            folder: 'general',
            fields:
              'id,updated_time,participants,messages.limit(15){id,message,created_time,from,to,attachments{mime_type,image_data,video_data,file_url}}',
            limit: 20,
            access_token: token,
          },
        ];

        let primaryError: any = null;
        for (let qi = 0; qi < queryVariants.length; qi += 1) {
          try {
            const convRes = await axios.get(convPath, {
              params: queryVariants[qi],
              timeout: 15_000,
            });
            const list: any[] = Array.isArray(convRes.data?.data) ? convRes.data.data : [];
            for (const item of list) {
              if (item?.id && !threadMap.has(String(item.id))) {
                threadMap.set(String(item.id), item);
              }
            }
          } catch (qErr: any) {
            if (qi === 0) primaryError = qErr;
          }
        }
        if (primaryError && threadMap.size === 0) {
          throw primaryError;
        }

        const threadList: any[] = Array.from(threadMap.values());
        result.details?.push({
          channel: 'INSTAGRAM',
          account: acc.name,
          threadsFound: threadList.length,
          hint:
            threadList.length === 0
              ? 'Meta mengembalikan 0 thread DM. Pastikan di Instagram HP: Pengaturan → Pesan dan balasan cerita → Kontrol pesan → Alat terhubung → Izinkan akses ke pesan = AKTIF.'
              : undefined,
        });

        for (const thread of threadList) {
          const threadId = String(thread.id || '');
          let participants: any[] = Array.isArray(thread.participants?.data)
            ? thread.participants.data
            : [];
          let rawMsgs: any[] = Array.isArray(thread.messages?.data)
            ? [...thread.messages.data].reverse()
            : [];
          if (rawMsgs.length === 0 && threadId) {
            try {
              const detailRes = await axios.get(`${graphBase}/${encodeURIComponent(threadId)}`, {
                params: {
                  fields: 'participants,messages.limit(15){id,message,created_time,from,to}',
                  access_token: token,
                },
                timeout: 10_000,
              });
              if (Array.isArray(detailRes.data?.participants?.data)) {
                participants = detailRes.data.participants.data;
              }
              if (Array.isArray(detailRes.data?.messages?.data)) {
                rawMsgs = [...detailRes.data.messages.data].reverse();
              }
            } catch {
              // ignore per-thread fallback error
            }
          }
          const otherParticipant = participants.find(
            (p) =>
              String(p?.id || '') !== String(acc.accountId) &&
              String(p?.username || '').toLowerCase() !== acc.name.replace(/^@/, '').toLowerCase()
          );

          for (const m of rawMsgs) {
            const msgId = String(m?.id || '').trim();
            if (!msgId) continue;

            const dup = await db
              .select({ id: chatMessages.id })
              .from(chatMessages)
              .where(eq(chatMessages.externalMessageId, msgId))
              .limit(1);
            if (dup[0]) continue;

            const fromId = String(m?.from?.id || '');
            const fromUsername = String(m?.from?.username || '').trim();
            const fromName = String(m?.from?.name || '').trim();
            const isFromSelf =
              fromId === String(acc.accountId) ||
              (fromUsername && fromUsername.toLowerCase() === acc.name.replace(/^@/, '').toLowerCase());

            const text = String(m?.message || '').trim();
            const firstAtt = Array.isArray(m?.attachments?.data) ? m.attachments.data[0] : null;
            const mediaUrl =
              firstAtt?.image_data?.url || firstAtt?.video_data?.url || firstAtt?.file_url || null;
            const mediaType = firstAtt?.mime_type
              ? String(firstAtt.mime_type).startsWith('video/')
                ? 'video'
                : String(firstAtt.mime_type).startsWith('image/')
                ? 'image'
                : 'document'
              : mediaUrl
              ? 'image'
              : null;
            const displayBody = text || (mediaType ? `[${mediaType.toUpperCase()}]` : '');
            if (!displayBody) continue;

            const peerId = isFromSelf
              ? String(otherParticipant?.id || m?.to?.data?.[0]?.id || '')
              : fromId || String(otherParticipant?.id || '');
            if (!peerId || peerId === String(acc.accountId)) continue;

            const peerUsername = isFromSelf
              ? String(otherParticipant?.username || m?.to?.data?.[0]?.username || '').trim()
              : fromUsername || String(otherParticipant?.username || '').trim();
            const peerName = isFromSelf
              ? String(otherParticipant?.name || m?.to?.data?.[0]?.name || '').trim()
              : fromName || String(otherParticipant?.name || '').trim();

            const msgDate = m?.created_time ? new Date(m.created_time) : new Date();

            if (!isFromSelf) {
              await upsertInboundChannelMessage({
                channel: 'INSTAGRAM',
                channelAccountId: acc.id,
                externalSenderId: peerId,
                senderName: peerName || (peerUsername ? `@${peerUsername}` : null),
                senderHandle: peerUsername || null,
                externalMessageId: msgId,
                externalThreadId: threadId || null,
                body: displayBody,
                mediaUrl,
                mediaType,
                createdAt: msgDate,
                skipAutomation: Date.now() - msgDate.getTime() > 5 * 60 * 1000,
              });
              result.messagesSynced += 1;
            } else {
              // Record outbound echo sent from Instagram app so full DM history appears in CRM
              const [ident] = await db
                .select({ contactId: contactIdentities.contactId })
                .from(contactIdentities)
                .where(
                  and(
                    eq(contactIdentities.companyId, companyId),
                    eq(contactIdentities.channel, 'INSTAGRAM'),
                    eq(contactIdentities.externalId, peerId)
                  )
                )
                .limit(1);

              let contactId = ident?.contactId;
              if (!contactId) {
                contactId = crypto.randomUUID();
                const displayName = peerName || (peerUsername ? `@${peerUsername}` : `Instagram ${peerId.slice(-6)}`);
                await db.insert(contacts).values({
                  id: contactId,
                  companyId,
                  namaLengkap: displayName,
                  namaPanggilan: peerUsername || peerName || null,
                  tags: 'Inbound INSTAGRAM',
                  createdAt: msgDate,
                  updatedAt: msgDate,
                });
                await db.insert(contactIdentities).values({
                  id: crypto.randomUUID(),
                  companyId,
                  contactId,
                  channel: 'INSTAGRAM',
                  externalId: peerId,
                  handle: peerUsername || null,
                  createdAt: msgDate,
                });
              }

              const [existingConv] = await db
                .select()
                .from(conversations)
                .where(
                  and(
                    eq(conversations.companyId, companyId),
                    eq(conversations.contactId, contactId),
                    eq(conversations.channel, 'INSTAGRAM'),
                    eq(conversations.channelAccountId, acc.id)
                  )
                )
                .limit(1);

              let convId = existingConv?.id;
              if (!convId) {
                convId = crypto.randomUUID();
                await db.insert(conversations).values({
                  id: convId,
                  companyId,
                  contactId,
                  channel: 'INSTAGRAM',
                  channelAccountId: acc.id,
                  externalThreadId: threadId || null,
                  pushName: peerName || peerUsername || null,
                  status: 'OPEN',
                  lastMessage: displayBody,
                  lastMessageAt: msgDate,
                  unreadCount: 0,
                  createdAt: msgDate,
                  updatedAt: msgDate,
                });
              } else if (!existingConv.lastMessageAt || msgDate.getTime() >= new Date(existingConv.lastMessageAt).getTime()) {
                await db
                  .update(conversations)
                  .set({
                    lastMessage: displayBody,
                    lastMessageAt: msgDate,
                    externalThreadId: threadId || existingConv.externalThreadId,
                    updatedAt: new Date(),
                  })
                  .where(eq(conversations.id, convId));
              }

              await db.insert(chatMessages).values({
                id: crypto.randomUUID(),
                companyId,
                conversationId: convId,
                contactId,
                direction: 'OUTBOUND',
                messageType: mediaUrl ? 'MEDIA' : 'TEXT',
                channel: 'INSTAGRAM',
                externalMessageId: msgId,
                body: displayBody,
                mediaUrl,
                mediaType,
                status: 'DELIVERED',
                ackStatus: 2,
                createdAt: msgDate,
              });
              liveEvents.emit('conversations:update', { conversationId: convId, channel: 'INSTAGRAM', companyId });
              result.messagesSynced += 1;
            }
          }
        }
      } else if (acc.channel === 'FACEBOOK') {
        const convRes = await axios.get(
          `https://graph.facebook.com/v21.0/${encodeURIComponent(acc.accountId)}/conversations`,
          {
            params: {
              fields: 'id,updated_time,participants,messages.limit(15){id,message,created_time,from,to}',
              limit: 20,
              access_token: token,
            },
            timeout: 15_000,
          }
        );
        const threadList: any[] = Array.isArray(convRes.data?.data) ? convRes.data.data : [];
        for (const thread of threadList) {
          const threadId = String(thread.id || '');
          const rawMsgs: any[] = Array.isArray(thread.messages?.data)
            ? [...thread.messages.data].reverse()
            : [];
          for (const m of rawMsgs) {
            const msgId = String(m?.id || '').trim();
            const fromId = String(m?.from?.id || '');
            const text = String(m?.message || '').trim();
            if (!msgId || !fromId || !text || fromId === String(acc.accountId)) continue;
            const dup = await db
              .select({ id: chatMessages.id })
              .from(chatMessages)
              .where(eq(chatMessages.externalMessageId, msgId))
              .limit(1);
            if (dup[0]) continue;
            const msgDate = m?.created_time ? new Date(m.created_time) : new Date();
            await upsertInboundChannelMessage({
              channel: 'FACEBOOK',
              channelAccountId: acc.id,
              externalSenderId: fromId,
              senderName: m?.from?.name || null,
              externalMessageId: msgId,
              externalThreadId: threadId || null,
              body: text,
              createdAt: msgDate,
              skipAutomation: Date.now() - msgDate.getTime() > 5 * 60 * 1000,
            });
            result.messagesSynced += 1;
          }
        }
      } else if (acc.channel === 'THREADS') {
        // Threads Graph API does not expose private DMs; sync public replies on user's Threads posts into CRM Inbox & Comments
        const threadsRes = await axios.get(
          `https://graph.threads.net/v1.0/${encodeURIComponent(acc.accountId)}/threads`,
          {
            params: {
              fields: 'id,text,timestamp,username',
              limit: 10,
              access_token: token,
            },
            timeout: 12_000,
          }
        );
        const posts: any[] = Array.isArray(threadsRes.data?.data) ? threadsRes.data.data : [];
        for (const post of posts) {
          try {
            const repRes = await axios.get(
              `https://graph.threads.net/v1.0/${encodeURIComponent(post.id)}/replies`,
              {
                params: {
                  fields: 'id,text,username,timestamp,replied_to',
                  access_token: token,
                },
                timeout: 12_000,
              }
            );
            const replies: any[] = Array.isArray(repRes.data?.data) ? repRes.data.data : [];
            const selfHandle = acc.name.replace(/^@/, '').toLowerCase();
            for (const rep of replies) {
              const repId = String(rep?.id || '').trim();
              const repText = String(rep?.text || '').trim();
              const repUser = String(rep?.username || '').trim();
              if (!repId || !repText) continue;
              if (repUser && repUser.toLowerCase() === selfHandle) continue;

              const repDate = rep?.timestamp ? new Date(rep.timestamp) : new Date();

              // 1. Upsert into Inbox CRM so replies appear in Live Chat
              const dupMsg = await db
                .select({ id: chatMessages.id })
                .from(chatMessages)
                .where(eq(chatMessages.externalMessageId, repId))
                .limit(1);
              if (!dupMsg[0]) {
                await upsertInboundChannelMessage({
                  channel: 'THREADS',
                  channelAccountId: acc.id,
                  externalSenderId: repUser || repId,
                  senderName: repUser ? `@${repUser}` : 'Threads User',
                  senderHandle: repUser || null,
                  externalMessageId: repId,
                  externalThreadId: repId,
                  contextTitle: post.text ? `Balasan Threads: ${String(post.text).slice(0, 60)}` : 'Balasan Threads',
                  body: repText,
                  createdAt: repDate,
                  skipAutomation: Date.now() - repDate.getTime() > 5 * 60 * 1000,
                });
                result.messagesSynced += 1;
              }

              // 2. Also ensure it appears in Comments tab
              const dupComment = await db
                .select({ id: socialComments.id })
                .from(socialComments)
                .where(
                  and(
                    eq(socialComments.companyId, companyId),
                    eq(socialComments.externalCommentId, repId)
                  )
                )
                .limit(1);
              if (!dupComment[0]) {
                await db.insert(socialComments).values({
                  id: crypto.randomUUID(),
                  companyId,
                  channel: 'THREADS',
                  channelAccountId: acc.id,
                  postId: String(post.id),
                  postCaption: post.text ? String(post.text).slice(0, 160) : null,
                  externalCommentId: repId,
                  authorName: repUser || 'Threads User',
                  authorHandle: repUser ? `@${repUser}` : null,
                  content: repText,
                  status: 'PENDING',
                  createdAt: repDate,
                });
                result.commentsSynced += 1;
              }
            }
          } catch (repErr: any) {
            const msg = repErr?.response?.data?.error?.message || repErr?.message || '';
            if (msg && !result.errors.some((e) => e.includes(acc.name))) {
              result.errors.push(`${acc.name}: ${msg}`);
            }
          }
        }
      }
    } catch (err: any) {
      result.errors.push(`${acc.name}: ${err?.response?.data?.error?.message || err?.message || 'Sync error'}`);
    }
  }

  return result;
}

let omniBgSyncTimer: NodeJS.Timeout | null = null;
let omniBgSyncRunning = false;

export function startOmnichannelBackgroundSyncMonitor(): void {
  if (omniBgSyncTimer) return;
  omniBgSyncTimer = setInterval(async () => {
    if (omniBgSyncRunning) return;
    omniBgSyncRunning = true;
    try {
      const companyIds = await listActiveCompanyIds();
      for (const cid of companyIds) {
        await runWithCompany(cid, () => syncCompanyOmnichannelMessages(cid)).catch(() => null);
      }
    } catch {
      // ignore transient poll errors
    } finally {
      omniBgSyncRunning = false;
    }
  }, 20_000);
}
