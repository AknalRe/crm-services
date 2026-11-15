import axios from 'axios';
import cron from 'node-cron';
import { and, eq, lte } from 'drizzle-orm';
import { db } from '../db';
import { channelAccounts, scheduledPosts } from '../db/schema';
import { liveEvents } from './events.service';

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

    const [account] = await db
      .select()
      .from(channelAccounts)
      .where(eq(channelAccounts.id, post.channelAccountId));

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

    await db
      .update(scheduledPosts)
      .set({ status: 'PUBLISHING', errorMessage: null, updatedAt: new Date() })
      .where(eq(scheduledPosts.id, postId));

    const ch = post.channel.toUpperCase();
    try {
      let externalPostId: string | null = null;

      if (ch === 'INSTAGRAM') {
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
      } else if (ch === 'FACEBOOK') {
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
      } else if (ch === 'THREADS') {
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
      } else if (ch === 'TELEGRAM') {
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
          errorMessage: null,
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
