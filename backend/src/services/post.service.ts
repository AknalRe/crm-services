import crypto from 'crypto';
import axios from 'axios';
import cron from 'node-cron';
import { and, desc, eq, inArray, lte } from 'drizzle-orm';
import { db } from '../db';
import {
  channelAccounts,
  contactIdentities,
  contacts,
  scheduledPosts,
  whatsappStatusViews,
} from '../db/schema';
import { liveEvents } from './events.service';
import { wahaService } from './waha.service';
import { fromWahaChatId, isPhoneWahaJid, normalizePhoneNumber } from './phone.utils';
import { readUploadedMediaAsDataUri } from '../routes/media';

export interface PostTargetContact {
  contactId?: string | null;
  phone: string;
  name?: string | null;
}

export interface WhatsAppStatusStyle {
  backgroundColor?: string;
  font?: number;
}

export function parsePostTargetContacts(raw?: string | null): PostTargetContact[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.phone === 'string' && item.phone.trim())
      .map((item) => ({
        contactId: item.contactId ? String(item.contactId) : null,
        phone: normalizePhoneNumber(String(item.phone).trim()),
        name: item.name ? String(item.name).trim() : null,
      }))
      .filter((item) => item.phone.length > 0);
  } catch {
    return [];
  }
}

export async function upsertWhatsappStatusView(params: {
  postId: string;
  viewerJid: string;
  viewerPhone?: string | null;
  sessionName?: string | null;
  ackStatus: number;
  viewedAt?: Date | null;
}): Promise<void> {
  const cleanJid = String(params.viewerJid || '').trim();
  if (!cleanJid || cleanJid === 'status@broadcast' || cleanJid.endsWith('@g.us')) return;

  let resolvedPhone = params.viewerPhone ? normalizePhoneNumber(params.viewerPhone) : null;
  if (!resolvedPhone && isPhoneWahaJid(cleanJid)) {
    const normalized = normalizePhoneNumber(fromWahaChatId(cleanJid));
    if (normalized) resolvedPhone = normalized;
  }
  if (!resolvedPhone && cleanJid.endsWith('@lid')) {
    resolvedPhone = await wahaService
      .resolveLidToPhone(params.sessionName, cleanJid)
      .catch(() => null);
  }

  let matchedContactId: string | null = null;
  let matchedName: string | null = null;

  if (resolvedPhone) {
    const variants = Array.from(
      new Set([
        resolvedPhone,
        `+${resolvedPhone}`,
        resolvedPhone.startsWith('62') ? `0${resolvedPhone.slice(2)}` : '',
      ].filter(Boolean))
    );
    const contactRows = await db
      .select({ id: contacts.id, namaLengkap: contacts.namaLengkap })
      .from(contacts)
      .where(inArray(contacts.nomorWhatsapp, variants))
      .limit(1);
    if (contactRows[0]) {
      matchedContactId = contactRows[0].id;
      matchedName = contactRows[0].namaLengkap;
    }
  }

  if (!matchedContactId) {
    const idRows = await db
      .select({ contactId: contactIdentities.contactId })
      .from(contactIdentities)
      .where(and(eq(contactIdentities.channel, 'WHATSAPP'), eq(contactIdentities.externalId, cleanJid)))
      .limit(1);
    if (idRows[0]) {
      const [c] = await db
        .select({ id: contacts.id, namaLengkap: contacts.namaLengkap })
        .from(contacts)
        .where(eq(contacts.id, idRows[0].contactId))
        .limit(1);
      if (c) {
        matchedContactId = c.id;
        matchedName = c.namaLengkap;
      }
    }
  }

  const now = new Date();
  const effectiveViewedAt = params.viewedAt || now;
  const existingRows = await db
    .select()
    .from(whatsappStatusViews)
    .where(and(eq(whatsappStatusViews.postId, params.postId), eq(whatsappStatusViews.viewerJid, cleanJid)))
    .limit(1);
  const existing = existingRows[0];

  if (!existing) {
    try {
      await db.insert(whatsappStatusViews).values({
        id: crypto.randomUUID(),
        postId: params.postId,
        viewerJid: cleanJid,
        viewerPhone: resolvedPhone,
        contactId: matchedContactId,
        viewerName: matchedName || (resolvedPhone ? `+${resolvedPhone}` : cleanJid),
        ackStatus: params.ackStatus,
        viewedAt: effectiveViewedAt,
        updatedAt: now,
      });
    } catch {
      // Handle rare concurrent webhook insert collision gracefully
    }
  } else {
    const nextAck = Math.max(existing.ackStatus, params.ackStatus);
    await db
      .update(whatsappStatusViews)
      .set({
        viewerPhone: resolvedPhone || existing.viewerPhone,
        contactId: matchedContactId || existing.contactId,
        viewerName: matchedName || existing.viewerName,
        ackStatus: nextAck,
        viewedAt: existing.viewedAt || effectiveViewedAt,
        updatedAt: now,
      })
      .where(eq(whatsappStatusViews.id, existing.id));
  }

  const allViews = await db
    .select({ ackStatus: whatsappStatusViews.ackStatus })
    .from(whatsappStatusViews)
    .where(eq(whatsappStatusViews.postId, params.postId));
  const seenCount = allViews.filter((v) => v.ackStatus >= 3).length;
  await db
    .update(scheduledPosts)
    .set({ viewerCount: seenCount, updatedAt: now })
    .where(eq(scheduledPosts.id, params.postId));

  liveEvents.emit('posts:update', { postId: params.postId });
}

export async function listStatusViewersForPost(postId: string) {
  return db
    .select()
    .from(whatsappStatusViews)
    .where(eq(whatsappStatusViews.postId, postId))
    .orderBy(desc(whatsappStatusViews.viewedAt));
}

export class PostService {
  private static cronTask: cron.ScheduledTask | null = null;

  public static async initPostScheduler() {
    if (this.cronTask) {
      this.cronTask.stop();
    }

    this.cronTask = cron.schedule('* * * * *', async () => {
      try {
        await this.processDuePosts();
      } catch (err) {
        console.error('[PostService] Error in cron check:', err);
      }
    });

    console.log('[PostService] Scheduled post publisher initialized.');
  }

  public static async processDuePosts() {
    const now = new Date();
    const duePosts = await db
      .select()
      .from(scheduledPosts)
      .where(and(eq(scheduledPosts.status, 'SCHEDULED'), lte(scheduledPosts.scheduledAt, now)));

    for (const post of duePosts) {
      try {
        await this.publishChannelPost(post.id);
      } catch (err: any) {
        console.error(`[PostService] Failed due post ${post.id}:`, err?.message || err);
      }
    }
  }

  public static async publishChannelPost(postId: string) {
    const [post] = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, postId));
    if (!post) throw new Error('Jadwal postingan tidak ditemukan');
    if (post.status === 'PUBLISHED') throw new Error('Postingan ini sudah pernah diterbitkan');
    if (post.status === 'PUBLISHING') throw new Error('Postingan sedang dalam proses penerbitan');
    if (post.status === 'CANCELLED') throw new Error('Postingan sudah dibatalkan');

    const ch = post.channel.toUpperCase();
    const isWahaPostChannel = ch === 'WHATSAPP' || ch === 'WHATSAPP_STATUS';
    let account: typeof channelAccounts.$inferSelect | undefined;

    if (!isWahaPostChannel) {
      if (!post.channelAccountId) {
        await db
          .update(scheduledPosts)
          .set({
            status: 'FAILED',
            errorMessage: 'Akun kanal tidak ditemukan',
            updatedAt: new Date(),
          })
          .where(eq(scheduledPosts.id, postId));
        liveEvents.emit('posts:update', { postId });
        throw new Error('Akun kanal tidak ditemukan');
      }
      const [foundAcc] = await db
        .select()
        .from(channelAccounts)
        .where(eq(channelAccounts.id, post.channelAccountId));
      account = foundAcc;

      if (!account || !account.isActive) {
        await db
          .update(scheduledPosts)
          .set({
            status: 'FAILED',
            errorMessage: 'Akun kanal tidak ditemukan atau nonaktif',
            updatedAt: new Date(),
          })
          .where(eq(scheduledPosts.id, postId));
        liveEvents.emit('posts:update', { postId });
        throw new Error('Akun kanal tidak ditemukan atau nonaktif');
      }

      if (!account.accessToken) {
        await db
          .update(scheduledPosts)
          .set({
            status: 'FAILED',
            errorMessage: `Access token untuk ${account.name} belum dikonfigurasi`,
            updatedAt: new Date(),
          })
          .where(eq(scheduledPosts.id, postId));
        liveEvents.emit('posts:update', { postId });
        throw new Error(`Access token untuk ${account.name} belum dikonfigurasi`);
      }
    }

    await db
      .update(scheduledPosts)
      .set({ status: 'PUBLISHING', errorMessage: null, updatedAt: new Date() })
      .where(eq(scheduledPosts.id, postId));

    let effectiveWahaSession = post.wahaSession?.trim() || null;
    let partialWarning: string | null = null;
    try {
      let externalPostId: string | null = null;

      if (ch === 'WHATSAPP_STATUS') {
        const targets = parsePostTargetContacts(post.targetContactsJson).map((t) => t.phone);
        let style: WhatsAppStatusStyle = {};
        if (post.statusStyleJson) {
          try {
            style = JSON.parse(post.statusStyleJson);
          } catch {
            style = {};
          }
        }
        const rawType = (post.postType || '').toUpperCase();
        const mediaUrl = post.mediaUrl?.trim() || '';
        const localMedia = mediaUrl ? await readUploadedMediaAsDataUri(mediaUrl) : null;
        let resolvedType: 'STATUS_TEXT' | 'STATUS_IMAGE' | 'STATUS_VIDEO' | 'STATUS_VOICE' =
          rawType === 'STATUS_VIDEO' || rawType === 'STATUS_IMAGE' || rawType === 'STATUS_VOICE'
            ? (rawType as any)
            : mediaUrl
            ? localMedia?.mimetype?.startsWith('video/') || /\.(mp4|mov|webm)(\?|$)/i.test(mediaUrl)
              ? 'STATUS_VIDEO'
              : localMedia?.mimetype?.startsWith('audio/') || /\.(mp3|ogg|wav|m4a|opus)(\?|$)/i.test(mediaUrl)
              ? 'STATUS_VOICE'
              : 'STATUS_IMAGE'
            : 'STATUS_TEXT';

        const sendRes =
          resolvedType === 'STATUS_TEXT'
            ? await wahaService.sendTextStatus(
                {
                  text: post.caption,
                  backgroundColor: style.backgroundColor,
                  font: style.font,
                  contacts: targets.length > 0 ? targets : undefined,
                },
                effectiveWahaSession || undefined
              )
            : await wahaService.sendMediaStatus(
                {
                  mediaType:
                    resolvedType === 'STATUS_VIDEO'
                      ? 'video'
                      : resolvedType === 'STATUS_VOICE'
                      ? 'voice'
                      : 'image',
                  file: localMedia
                    ? {
                        base64: localMedia.dataUri,
                        mimetype: localMedia.mimetype,
                      }
                    : { url: mediaUrl },
                  caption: post.caption || undefined,
                  backgroundColor: style.backgroundColor,
                  contacts: targets.length > 0 ? targets : undefined,
                },
                effectiveWahaSession || undefined
              );

        if (!sendRes.success) {
          throw new Error(sendRes.error || 'Gagal mengirim WhatsApp Status');
        }
        externalPostId = sendRes.messageId || null;
        if (sendRes.sessionUsed) effectiveWahaSession = sendRes.sessionUsed;
      } else if (ch === 'WHATSAPP') {
        const targets = parsePostTargetContacts(post.targetContactsJson);
        if (targets.length === 0) {
          throw new Error('Pilih minimal 1 kontak penerima untuk posting WhatsApp');
        }
        const mediaUrl = post.mediaUrl?.trim() || '';
        let mediaFilePayload: { base64: string; mimetype: string; filename: string } | null = null;
        if (mediaUrl) {
          const localMedia = await readUploadedMediaAsDataUri(mediaUrl);
          if (localMedia) {
            const fname = mediaUrl.split('/').pop()?.split('?')[0] || 'media';
            mediaFilePayload = {
              base64: localMedia.dataUri,
              mimetype: localMedia.mimetype,
              filename: fname,
            };
          } else {
            const dl = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 25_000 });
            const mime = String(dl.headers?.['content-type'] || 'image/jpeg').split(';')[0].trim();
            const fname = mediaUrl.split('/').pop()?.split('?')[0] || 'media';
            mediaFilePayload = {
              base64: `data:${mime};base64,${Buffer.from(dl.data).toString('base64')}`,
              mimetype: mime,
              filename: fname,
            };
          }
        }

        const sentIds: string[] = [];
        const failedTargets: string[] = [];
        for (let i = 0; i < targets.length; i++) {
          const tgt = targets[i];
          const sendRes = mediaFilePayload
            ? await wahaService.sendMediaMessage(
                tgt.phone,
                {
                  ...mediaFilePayload,
                  caption: post.caption,
                },
                effectiveWahaSession || undefined
              )
            : await wahaService.sendTextMessage(
                tgt.phone,
                post.caption,
                effectiveWahaSession || undefined
              );
          if (sendRes.sessionUsed) effectiveWahaSession = sendRes.sessionUsed;
          if (sendRes.success && sendRes.messageId) {
            sentIds.push(sendRes.messageId);
          } else if (!sendRes.success) {
            failedTargets.push(`${tgt.name || tgt.phone}: ${sendRes.error || 'gagal'}`);
          }
          if (i < targets.length - 1) {
            await new Promise((r) => setTimeout(r, 700));
          }
        }
        if (sentIds.length === 0) {
          throw new Error(failedTargets[0] || 'Semua pengiriman posting WhatsApp gagal');
        }
        externalPostId = sentIds.join(',');
        if (failedTargets.length > 0) {
          partialWarning = `${sentIds.length}/${targets.length} terkirim. Gagal: ${failedTargets.slice(0, 2).join('; ')}`;
        }
      } else if (ch === 'INSTAGRAM' && account) {
        if (!post.mediaUrl) {
          throw new Error('Postingan Instagram Feed memerlukan URL gambar/media publik.');
        }
        const containerRes = await axios.post(
          `https://graph.instagram.com/v21.0/${account.accountId}/media`,
          null,
          {
            params: {
              image_url: post.mediaUrl,
              caption: post.caption,
              access_token: account.accessToken,
            },
            timeout: 15_000,
          }
        );
        const creationId = containerRes.data?.id;
        if (!creationId) throw new Error('Instagram Graph API tidak mengembalikan creation_id');

        const publishRes = await axios.post(
          `https://graph.instagram.com/v21.0/${account.accountId}/media_publish`,
          null,
          {
            params: {
              creation_id: creationId,
              access_token: account.accessToken,
            },
            timeout: 15_000,
          }
        );
        externalPostId = publishRes.data?.id ? String(publishRes.data.id) : String(creationId);
      } else if (ch === 'FACEBOOK' && account) {
        if (post.mediaUrl) {
          const res = await axios.post(
            `https://graph.facebook.com/v21.0/${account.accountId}/photos`,
            null,
            {
              params: {
                url: post.mediaUrl,
                caption: post.caption,
                access_token: account.accessToken,
              },
              timeout: 15_000,
            }
          );
          externalPostId = res.data?.post_id || res.data?.id || null;
        } else {
          const res = await axios.post(
            `https://graph.facebook.com/v21.0/${account.accountId}/feed`,
            null,
            {
              params: {
                message: post.caption,
                access_token: account.accessToken,
              },
              timeout: 15_000,
            }
          );
          externalPostId = res.data?.id || null;
        }
      } else if (ch === 'THREADS' && account) {
        if (!account.accessToken) {
          throw new Error('Access token Threads belum dikonfigurasi pada akun kanal ini.');
        }
        const params: Record<string, string> = {
          media_type: post.mediaUrl ? 'IMAGE' : 'TEXT',
          text: post.caption,
          access_token: account.accessToken,
        };
        if (post.mediaUrl) {
          params.image_url = post.mediaUrl;
        }
        const createRes = await axios.post(
          `https://graph.threads.net/v1.0/${account.accountId}/threads`,
          null,
          { params, timeout: 15_000 }
        );
        const creationId = createRes.data?.id;
        if (!creationId) throw new Error('Threads API tidak mengembalikan creation_id');

        const pubRes = await axios.post(
          `https://graph.threads.net/v1.0/${account.accountId}/threads_publish`,
          null,
          {
            params: {
              creation_id: creationId,
              access_token: account.accessToken,
            },
            timeout: 15_000,
          }
        );
        externalPostId = pubRes.data?.id ? String(pubRes.data.id) : String(creationId);
      } else if (ch === 'TELEGRAM' && account) {
        const target = post.targetChatId?.trim();
        if (!target) {
          throw new Error('Target Channel / Group ID Telegram (mis. @namachannel) wajib diisi.');
        }
        if (post.mediaUrl) {
          const res = await axios.post(
            `https://api.telegram.org/bot${account.accessToken}/sendPhoto`,
            {
              chat_id: target,
              photo: post.mediaUrl,
              caption: post.caption,
            },
            { timeout: 15_000 }
          );
          externalPostId = res.data?.result?.message_id
            ? String(res.data.result.message_id)
            : null;
        } else {
          const res = await axios.post(
            `https://api.telegram.org/bot${account.accessToken}/sendMessage`,
            {
              chat_id: target,
              text: post.caption,
            },
            { timeout: 15_000 }
          );
          externalPostId = res.data?.result?.message_id
            ? String(res.data.result.message_id)
            : null;
        }
      } else {
        throw new Error(`Channel ${ch} belum mendukung penjadwalan postingan`);
      }

      const now = new Date();
      const [updated] = await db
        .update(scheduledPosts)
        .set({
          status: 'PUBLISHED',
          publishedAt: now,
          externalPostId,
          wahaSession: effectiveWahaSession,
          errorMessage: partialWarning,
          updatedAt: now,
        })
        .where(eq(scheduledPosts.id, postId))
        .returning();

      liveEvents.emit('posts:update', { postId });
      return updated;
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.description ||
        err?.message ||
        'Gagal menerbitkan postingan';
      await db
        .update(scheduledPosts)
        .set({
          status: 'FAILED',
          errorMessage: String(msg),
          updatedAt: new Date(),
        })
        .where(eq(scheduledPosts.id, postId));
      liveEvents.emit('posts:update', { postId });
      throw new Error(String(msg));
    }
  }
}
