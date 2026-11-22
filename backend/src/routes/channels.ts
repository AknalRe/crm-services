import crypto from 'crypto';
import axios from 'axios';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, asc, desc, eq } from 'drizzle-orm';
import { config } from '../config';
import { db } from '../db';
import { channelAccounts, channelConnectLinks, DEFAULT_COMPANY_ID, socialComments } from '../db/schema';
import { licenseService } from '../services/license.service';
import { getSystemSettingMap, runWithCompany, upsertSystemSetting } from '../services/tenantContext';
import { getRequestCompanyId, requirePermission } from './auth';
import { applyCommentAutomations } from './comments';
import {
  OmnichannelType,
  upsertInboundChannelMessage,
} from '../services/channel.service';

const ALLOWED_CHANNELS = new Set<OmnichannelType>([
  'WHATSAPP_CLOUD',
  'INSTAGRAM',
  'FACEBOOK',
  'THREADS',
  'TELEGRAM',
]);

function maskChannelAccount(row: typeof channelAccounts.$inferSelect) {
  return {
    id: row.id,
    channel: row.channel,
    name: row.name,
    accountId: row.accountId,
    verifyToken: row.verifyToken,
    hasToken: Boolean(row.accessToken && row.accessToken.trim().length > 0),
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export default async function channelsRouter(fastify: FastifyInstance) {
  // List configured channel accounts
  fastify.get(
    '/',
    { preHandler: requirePermission('settings', 'conversations') },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const companyId = getRequestCompanyId(req);
        const rows = await db
          .select()
          .from(channelAccounts)
          .where(eq(channelAccounts.companyId, companyId))
          .orderBy(asc(channelAccounts.channel), asc(channelAccounts.createdAt));
        return reply.send({ success: true, data: rows.map(maskChannelAccount) });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  // Create channel account
  fastify.post<{
    Body: {
      channel?: string;
      name?: string;
      accountId?: string;
      accessToken?: string;
      verifyToken?: string;
    };
  }>('/', { preHandler: requirePermission('settings.edit') }, async (req, reply) => {
    try {
      const companyId = getRequestCompanyId(req);
      await licenseService.assertQuota('channels', 1, companyId);

      const channel = String(req.body?.channel || '').trim().toUpperCase() as OmnichannelType;
      if (!ALLOWED_CHANNELS.has(channel)) {
        return reply.status(400).send({
          success: false,
          error: 'Channel harus salah satu dari INSTAGRAM, FACEBOOK, THREADS, TELEGRAM, atau WHATSAPP_CLOUD',
        });
      }
      const name = String(req.body?.name || '').trim();
      const accountId = String(req.body?.accountId || '').trim();
      if (!name || !accountId) {
        return reply
          .status(400)
          .send({ success: false, error: 'Nama tampilan dan ID Akun / Page ID wajib diisi' });
      }
      const verifyToken =
        String(req.body?.verifyToken || '').trim() ||
        `reneo_${crypto.randomBytes(8).toString('hex')}`;
      const now = new Date();

      const [created] = await db
        .insert(channelAccounts)
        .values({
          id: crypto.randomUUID(),
          companyId,
          channel,
          name,
          accountId,
          accessToken: String(req.body?.accessToken || '').trim() || null,
          verifyToken,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return reply.status(201).send({ success: true, data: maskChannelAccount(created) });
    } catch (error: any) {
      return reply.status(error?.statusCode || 500).send({
        success: false,
        code: error?.code,
        feature: error?.feature,
        error: error.message,
      });
    }
  });

  // Update channel account
  fastify.patch<{
    Params: { id: string };
    Body: { name?: string; accountId?: string; accessToken?: string; isActive?: boolean };
  }>('/:id', { preHandler: requirePermission('settings.edit') }, async (req, reply) => {
    try {
      const companyId = getRequestCompanyId(req);
      await licenseService.assertFeature('omnichannel', undefined, companyId);
      const patch: Record<string, any> = { updatedAt: new Date() };
      if (req.body?.name !== undefined) patch.name = String(req.body.name).trim();
      if (req.body?.accountId !== undefined) patch.accountId = String(req.body.accountId).trim();
      if (req.body?.accessToken !== undefined && req.body.accessToken.trim() !== '') {
        patch.accessToken = req.body.accessToken.trim();
      }
      if (req.body?.isActive !== undefined) patch.isActive = Boolean(req.body.isActive);

      const [updated] = await db
        .update(channelAccounts)
        .set(patch)
        .where(and(eq(channelAccounts.id, req.params.id), eq(channelAccounts.companyId, companyId)))
        .returning();
      if (!updated) {
        return reply.status(404).send({ success: false, error: 'Akun channel tidak ditemukan' });
      }
      return reply.send({ success: true, data: maskChannelAccount(updated) });
    } catch (error: any) {
      return reply.status(error?.statusCode || 500).send({
        success: false,
        code: error?.code,
        feature: error?.feature,
        error: error.message,
      });
    }
  });

  // Delete channel account
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requirePermission('settings.edit') },
    async (req, reply) => {
      try {
        const companyId = getRequestCompanyId(req);
        const deleted = await db
          .delete(channelAccounts)
          .where(and(eq(channelAccounts.id, req.params.id), eq(channelAccounts.companyId, companyId)))
          .returning();
        if (!deleted[0]) {
          return reply.status(404).send({ success: false, error: 'Akun channel tidak ditemukan' });
        }
        return reply.send({ success: true });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  // Meta Graph Webhook Verification (Facebook Messenger, Instagram, Threads)
  fastify.get<{
    Querystring: {
      'hub.mode'?: string;
      'hub.verify_token'?: string;
      'hub.challenge'?: string;
    };
  }>('/webhook/meta', async (req, reply) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token) {
      const sysMap = await getSystemSettingMap().catch(() => ({} as Record<string, string>));
      const effectiveVerifyToken =
        sysMap.meta_webhook_verify_token || config.meta.webhookVerifyToken || 'reneo_meta_verify_2026';
      if (effectiveVerifyToken && token === effectiveVerifyToken) {
        return reply.code(200).send(challenge || 'OK');
      }
      const accounts = await db.select().from(channelAccounts);
      const matched = accounts.find((a) => a.isActive && a.verifyToken === token);
      if (matched) {
        return reply.code(200).send(challenge || 'OK');
      }
    }
    return reply.code(403).send({ error: 'Verify token tidak cocok' });
  });

  // Meta Graph Webhook Inbound (Instagram DM, Facebook Messenger, Threads Replies/Mentions)
  fastify.post('/webhook/meta', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    try {
      const body: any = req.body || {};
      const objectType = String(body.object || '').toLowerCase();
      const entries: any[] = Array.isArray(body.entry) ? body.entry : [];
      const allAccounts = await db.select().from(channelAccounts);

      for (const entry of entries) {
        if (objectType === 'whatsapp_business_account') {
          const changes: any[] = Array.isArray(entry.changes) ? entry.changes : [];
          for (const ch of changes) {
            const val = ch.value || {};
            const phoneNumberId = String(val.metadata?.phone_number_id || '');
            const waActive = allAccounts.filter(
              (a) => a.isActive && a.channel === 'WHATSAPP_CLOUD'
            );
            const waAccount =
              waActive.find((a) => a.accountId === phoneNumberId) ||
              (waActive.length === 1 ? waActive[0] : undefined);
            if (!waAccount) continue;

            const waContacts: any[] = Array.isArray(val.contacts) ? val.contacts : [];
            const messages: any[] = Array.isArray(val.messages) ? val.messages : [];
            for (const msg of messages) {
              const senderId = String(msg.from || '');
              if (!senderId) continue;
              const profileName =
                waContacts.find((c) => c.wa_id === senderId)?.profile?.name || null;
              const msgBody =
                String(
                  msg.text?.body ||
                    msg.button?.text ||
                    msg.interactive?.button_reply?.title ||
                    msg.interactive?.list_reply?.title ||
                    ''
                ).trim() || (msg.type ? `[${String(msg.type).toUpperCase()}]` : '');
              if (!msgBody) continue;

              await runWithCompany(waAccount.companyId, () =>
                upsertInboundChannelMessage({
                  channel: 'WHATSAPP_CLOUD',
                  channelAccountId: waAccount.id,
                  externalSenderId: senderId,
                  senderName: profileName,
                  senderHandle: `+${senderId.replace(/\D/g, '')}`,
                  externalMessageId: msg.id || null,
                  body: msgBody,
                })
              );
            }
          }
          continue;
        }

        const pageOrAccountId = String(entry.id || '');
        const channelGuess: OmnichannelType =
          objectType === 'instagram'
            ? 'INSTAGRAM'
            : objectType === 'threads'
            ? 'THREADS'
            : 'FACEBOOK';

        const channelAccountsActive = allAccounts.filter(
          (a) => a.isActive && a.channel === channelGuess
        );
        const account =
          channelAccountsActive.find((a) => a.accountId === pageOrAccountId) ||
          (channelAccountsActive.length === 1 ? channelAccountsActive[0] : undefined);

        if (!account) continue;

        // 1. Messenger / Instagram Messaging Events
        const messagingList: any[] = Array.isArray(entry.messaging) ? entry.messaging : [];
        for (const ev of messagingList) {
          if (ev.message?.is_echo) continue;
          const senderId = String(ev.sender?.id || '');
          if (!senderId || senderId === account.accountId) continue;

          const text = String(ev.message?.text || '').trim();
          const firstAttachment = Array.isArray(ev.message?.attachments)
            ? ev.message.attachments[0]
            : null;
          const mediaUrl = firstAttachment?.payload?.url || null;
          const mediaType = firstAttachment?.type || null;
          const displayBody = text || (mediaType ? `[${mediaType.toUpperCase()}]` : '');
          if (!displayBody) continue;

          await runWithCompany(account.companyId, () =>
            upsertInboundChannelMessage({
              channel: channelGuess,
              channelAccountId: account.id,
              externalSenderId: senderId,
              externalMessageId: ev.message?.mid || null,
              body: displayBody,
              mediaUrl,
              mediaType,
            })
          );
        }

        // 2. Instagram / Facebook / Threads Comments & Mentions (changes array)
        const changes: any[] = Array.isArray(entry.changes) ? entry.changes : [];
        for (const ch of changes) {
          const val = ch.value || {};
          const text = String(val.text || val.message || '').trim();
          const senderId = String(val.from?.id || val.user_id || '');
          if (!text || !senderId || senderId === account.accountId) continue;

          const extCommentId = String(val.id || val.comment_id || '');

          await runWithCompany(account.companyId, () =>
            upsertInboundChannelMessage({
              channel: channelGuess,
              channelAccountId: account.id,
              externalSenderId: senderId,
              senderName: val.from?.name || val.from?.username || null,
              senderHandle: val.from?.username || val.username || null,
              externalMessageId: extCommentId || null,
              externalThreadId: val.id || val.media?.id || null,
              contextTitle: ch.field ? `Interaksi ${ch.field}` : undefined,
              body: text,
            })
          );

          if (
            objectType !== 'whatsapp_business_account' &&
            (ch.field === 'comments' || val.item === 'comment')
          ) {
            const existingComment = extCommentId
              ? (
                  await db
                    .select({ id: socialComments.id })
                    .from(socialComments)
                    .where(
                      and(
                        eq(socialComments.companyId, account.companyId),
                        eq(socialComments.channelAccountId, account.id),
                        eq(socialComments.externalCommentId, extCommentId)
                      )
                    )
                    .limit(1)
                )[0]
              : undefined;

            if (!existingComment) {
              const postId =
                String(val.media?.id || val.post_id || val.parent_id || '').trim() || null;
              const authorName = val.from?.name || val.from?.username || null;
              const authorHandle = val.from?.username || val.username || null;
              const [insertedComment] = await db
                .insert(socialComments)
                .values({
                  id: crypto.randomUUID(),
                  companyId: account.companyId,
                  channel: channelGuess,
                  channelAccountId: account.id,
                  postId,
                  postCaption: null,
                  externalCommentId: extCommentId || `webhook-${crypto.randomUUID()}`,
                  authorName,
                  authorHandle,
                  content: text,
                  status: 'UNREPLIED',
                  createdAt: new Date(),
                })
                .returning();

              if (insertedComment) {
                await applyCommentAutomations(account, insertedComment);
              }
            }
          }
        }
      }

      return reply.code(200).send({ status: 'ok' });
    } catch (error: any) {
      console.error('[Meta Webhook] Error:', error.message);
      return reply.code(200).send({ status: 'ok' });
    }
  });

  // Telegram Bot Webhook Inbound
  fastify.post<{ Params: { accountId: string }; Body: any }>(
    '/webhook/telegram/:accountId',
    async (req, reply) => {
      try {
        const [account] = await db
          .select()
          .from(channelAccounts)
          .where(eq(channelAccounts.id, req.params.accountId));

        if (!account || !account.isActive || account.channel !== 'TELEGRAM') {
          return reply.code(404).send({ success: false, error: 'Akun Telegram tidak aktif' });
        }

        const tgBody: any = req.body || {};
        const msg = tgBody?.message || tgBody?.edited_message;
        if (msg && msg.chat?.id) {
          const chatId = String(msg.chat.id);
          const senderName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ');
          const senderHandle = msg.from?.username || null;
          const text = String(msg.text || msg.caption || '').trim();
          if (text) {
            await runWithCompany(account.companyId, () =>
              upsertInboundChannelMessage({
                channel: 'TELEGRAM',
                channelAccountId: account.id,
                externalSenderId: chatId,
                senderName: senderName || null,
                senderHandle,
                externalMessageId: msg.message_id ? `tg_${msg.message_id}` : null,
                body: text,
              })
            );
          }
        }
        return reply.send({ ok: true });
      } catch (error: any) {
        console.error('[Telegram Webhook] Error:', error.message);
        return reply.send({ ok: true });
      }
    }
  );

  // Connect Links (Shareable OAuth/Account Onboarding Links for Clients)
  fastify.get(
    '/connect-links',
    { preHandler: requirePermission('settings') },
    async (req, reply) => {
      try {
        const companyId = getRequestCompanyId(req);
        const rows = await db
          .select()
          .from(channelConnectLinks)
          .where(eq(channelConnectLinks.companyId, companyId))
          .orderBy(desc(channelConnectLinks.createdAt))
          .limit(20);
        return reply.send({ success: true, data: rows });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  fastify.post<{ Body: { channel?: string; label?: string; expiresHours?: number } }>(
    '/connect-links',
    { preHandler: requirePermission('settings.edit') },
    async (req, reply) => {
      try {
        const companyId = getRequestCompanyId(req);
        await licenseService.assertQuota('channels', 1, companyId);
        const rawChannel = String(req.body?.channel || '').trim().toUpperCase();
        if (!ALLOWED_CHANNELS.has(rawChannel as OmnichannelType) && rawChannel !== 'META') {
          return reply.status(400).send({
            success: false,
            error: 'Channel harus META, INSTAGRAM, FACEBOOK, THREADS, WHATSAPP_CLOUD, atau TELEGRAM',
          });
        }
        const channel = rawChannel;
        const hours = Math.max(1, Math.min(168, Number(req.body?.expiresHours) || 24));
        const now = new Date();
        const expiresAt = new Date(now.getTime() + hours * 3600 * 1000);
        const token = crypto.randomBytes(16).toString('hex');

        const [created] = await db
          .insert(channelConnectLinks)
          .values({
            id: crypto.randomUUID(),
            companyId,
            token,
            channel,
            label: String(req.body?.label || '').trim() || null,
            expiresAt,
            createdAt: now,
          })
          .returning();

        return reply.status(201).send({ success: true, data: created });
      } catch (error: any) {
        return reply.status(error?.statusCode || 500).send({
          success: false,
          code: error?.code,
          feature: error?.feature,
          error: error.message,
        });
      }
    }
  );

  // OAuth helpers (Reneo OAuth Broker + Direct Meta/Instagram/Threads OAuth with DB & env fallback)
  const DEFAULT_RENEO_META_APP_ID = '2455041348580254';
  const DEFAULT_RENEO_INSTAGRAM_APP_ID = '1906731137407082';
  const DEFAULT_RENEO_THREADS_APP_ID = '1742677016843989';

  const resolveEffectiveOAuthCredentials = async () => {
    const sysMap = await getSystemSettingMap().catch(() => ({} as Record<string, string>));
    const metaAppId = (sysMap.meta_app_id || config.meta.appId || DEFAULT_RENEO_META_APP_ID).trim();
    const metaAppSecret = (sysMap.meta_app_secret || config.meta.appSecret || '').trim();
    const instagramAppId = (
      sysMap.instagram_app_id ||
      process.env.INSTAGRAM_APP_ID ||
      DEFAULT_RENEO_INSTAGRAM_APP_ID
    ).trim();
    const instagramAppSecret = (
      sysMap.instagram_app_secret ||
      process.env.INSTAGRAM_APP_SECRET ||
      ''
    ).trim();
    const threadsAppId = (sysMap.threads_app_id || config.meta.threadsAppId || DEFAULT_RENEO_THREADS_APP_ID).trim();
    const threadsAppSecret = (sysMap.threads_app_secret || config.meta.threadsAppSecret || '').trim();
    const webhookVerifyToken = (
      sysMap.meta_webhook_verify_token ||
      config.meta.webhookVerifyToken ||
      'reneo_meta_verify_2026'
    ).trim();
    return {
      metaAppId,
      metaAppSecret,
      instagramAppId,
      instagramAppSecret,
      threadsAppId,
      threadsAppSecret,
      webhookVerifyToken,
      reneoOAuthReady: Boolean(config.reneo.oauthUrl),
      directMetaReady: Boolean(metaAppId),
      directInstagramReady: Boolean(instagramAppId && instagramAppSecret),
      directThreadsReady: Boolean(threadsAppId),
    };
  };

  // Public Connect Link endpoints (no panel login required, validated by token)
  fastify.get<{ Params: { token: string } }>('/connect/:token', async (req, reply) => {
    try {
      const [link] = await db
        .select()
        .from(channelConnectLinks)
        .where(eq(channelConnectLinks.token, req.params.token.trim()));
      if (!link) {
        return reply.status(404).send({ success: false, error: 'Tautan koneksi tidak ditemukan' });
      }
      const isExpired = new Date(link.expiresAt).getTime() < Date.now();
      const oauthCreds = await resolveEffectiveOAuthCredentials();
      return reply.send({
        success: true,
        data: {
          channel: link.channel,
          label: link.label,
          expiresAt: link.expiresAt,
          usedAt: link.usedAt,
          isExpired,
          oauthConfig: {
            reneoOAuthReady: oauthCreds.reneoOAuthReady,
            directMetaReady: oauthCreds.directMetaReady,
            directThreadsReady: oauthCreds.directThreadsReady,
          },
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post<{
    Params: { token: string };
    Body: { name?: string; accountId?: string; accessToken?: string };
  }>('/connect/:token', async (req, reply) => {
    try {
      const [link] = await db
        .select()
        .from(channelConnectLinks)
        .where(eq(channelConnectLinks.token, req.params.token.trim()));
      if (!link) {
        return reply.status(404).send({ success: false, error: 'Tautan koneksi tidak ditemukan' });
      }
      if (link.usedAt) {
        return reply.status(400).send({ success: false, error: 'Tautan ini sudah pernah digunakan' });
      }
      if (new Date(link.expiresAt).getTime() < Date.now()) {
        return reply.status(400).send({ success: false, error: 'Tautan koneksi sudah kedaluwarsa' });
      }

      const name = String(req.body?.name || '').trim();
      const accountId = String(req.body?.accountId || '').trim();
      const accessToken = String(req.body?.accessToken || '').trim();
      if (!name || !accountId || !accessToken) {
        return reply.status(400).send({
          success: false,
          error: 'Nama akun, ID Akun/Page, dan Access Token wajib diisi',
        });
      }

      const targetCompanyId = link.companyId || DEFAULT_COMPANY_ID;
      await licenseService.assertFeature('omnichannel', undefined, targetCompanyId);

      const now = new Date();
      const existingAccRows = await db
        .select()
        .from(channelAccounts)
        .where(
          and(
            eq(channelAccounts.companyId, targetCompanyId),
            eq(channelAccounts.channel, link.channel),
            eq(channelAccounts.accountId, accountId)
          )
        );

      let savedAccount: typeof channelAccounts.$inferSelect;
      if (existingAccRows[0]) {
        const [updatedAcc] = await db
          .update(channelAccounts)
          .set({
            name,
            accessToken,
            isActive: true,
            updatedAt: now,
          })
          .where(eq(channelAccounts.id, existingAccRows[0].id))
          .returning();
        savedAccount = updatedAcc;
      } else {
        await licenseService.assertQuota('channels', 1, targetCompanyId);
        const verifyToken = `reneo_${crypto.randomBytes(8).toString('hex')}`;
        const [createdAcc] = await db
          .insert(channelAccounts)
          .values({
            id: crypto.randomUUID(),
            companyId: targetCompanyId,
            channel: link.channel,
            name,
            accountId,
            accessToken,
            verifyToken,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        savedAccount = createdAcc;
      }

      await db
        .update(channelConnectLinks)
        .set({ usedAt: now, createdChannelAccountId: savedAccount.id })
        .where(eq(channelConnectLinks.id, link.id));

      return reply.status(201).send({
        success: true,
        message: `Akun ${link.channel} berhasil terhubung!`,
        data: maskChannelAccount(savedAccount),
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // OAuth helpers (Reneo OAuth Broker + Direct Meta/Threads OAuth)
  const getOAuthSecret = () =>
    config.reneo.appToken || process.env.JWT_SECRET || 'reneo_oauth_state_secret';

  const signOAuthState = (payload: Record<string, any>) => {
    const encoded = Buffer.from(JSON.stringify({ ...payload, ts: Date.now() })).toString('base64url');
    const sig = crypto.createHmac('sha256', getOAuthSecret()).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
  };

  const verifyOAuthState = (raw: string): Record<string, any> | null => {
    const [encoded, sig] = String(raw || '').split('.');
    if (!encoded || !sig) return null;
    const expected = crypto.createHmac('sha256', getOAuthSecret()).update(encoded).digest('base64url');
    if (sig !== expected) return null;
    try {
      const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      if (Date.now() - Number(parsed.ts || 0) > 15 * 60_000) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  fastify.get('/oauth/config', async (_req: FastifyRequest, reply: FastifyReply) => {
    const creds = await resolveEffectiveOAuthCredentials();
    return reply.send({
      success: true,
      data: {
        reneoOAuthReady: creds.reneoOAuthReady,
        directMetaReady: creds.directMetaReady,
        directInstagramReady: creds.directInstagramReady,
        directThreadsReady: creds.directThreadsReady,
        metaAppId: creds.metaAppId,
        hasMetaAppSecret: Boolean(creds.metaAppSecret),
        instagramAppId: creds.instagramAppId,
        hasInstagramAppSecret: Boolean(creds.instagramAppSecret),
        threadsAppId: creds.threadsAppId,
        hasThreadsAppSecret: Boolean(creds.threadsAppSecret),
        webhookVerifyToken: creds.webhookVerifyToken,
      },
    });
  });

  fastify.put<{
    Body: {
      metaAppId?: string;
      metaAppSecret?: string;
      instagramAppId?: string;
      instagramAppSecret?: string;
      threadsAppId?: string;
      threadsAppSecret?: string;
      webhookVerifyToken?: string;
    };
  }>('/oauth/config', { preHandler: requirePermission('settings.edit') }, async (req, reply) => {
    try {
      if (req.body?.metaAppId !== undefined) {
        await upsertSystemSetting('meta_app_id', String(req.body.metaAppId).trim() || DEFAULT_RENEO_META_APP_ID);
      }
      if (req.body?.metaAppSecret !== undefined && String(req.body.metaAppSecret).trim() !== '') {
        await upsertSystemSetting('meta_app_secret', String(req.body.metaAppSecret).trim());
      }
      if (req.body?.instagramAppId !== undefined) {
        await upsertSystemSetting(
          'instagram_app_id',
          String(req.body.instagramAppId).trim() || DEFAULT_RENEO_INSTAGRAM_APP_ID
        );
      }
      if (req.body?.instagramAppSecret !== undefined && String(req.body.instagramAppSecret).trim() !== '') {
        await upsertSystemSetting('instagram_app_secret', String(req.body.instagramAppSecret).trim());
      }
      if (req.body?.threadsAppId !== undefined) {
        await upsertSystemSetting('threads_app_id', String(req.body.threadsAppId).trim() || DEFAULT_RENEO_THREADS_APP_ID);
      }
      if (req.body?.threadsAppSecret !== undefined && String(req.body.threadsAppSecret).trim() !== '') {
        await upsertSystemSetting('threads_app_secret', String(req.body.threadsAppSecret).trim());
      }
      if (req.body?.webhookVerifyToken !== undefined && String(req.body.webhookVerifyToken).trim() !== '') {
        await upsertSystemSetting('meta_webhook_verify_token', String(req.body.webhookVerifyToken).trim());
      }
      const creds = await resolveEffectiveOAuthCredentials();
      return reply.send({
        success: true,
        data: {
          reneoOAuthReady: creds.reneoOAuthReady,
          directMetaReady: creds.directMetaReady,
          directInstagramReady: creds.directInstagramReady,
          directThreadsReady: creds.directThreadsReady,
          metaAppId: creds.metaAppId,
          hasMetaAppSecret: Boolean(creds.metaAppSecret),
          instagramAppId: creds.instagramAppId,
          hasInstagramAppSecret: Boolean(creds.instagramAppSecret),
          threadsAppId: creds.threadsAppId,
          hasThreadsAppSecret: Boolean(creds.threadsAppSecret),
          webhookVerifyToken: creds.webhookVerifyToken,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.get<{
    Querystring: { channel?: string; connectToken?: string };
  }>('/oauth/start', async (req, reply) => {
    try {
      const channel = String(req.query?.channel || '').trim().toUpperCase();
      const connectToken = String(req.query?.connectToken || '').trim();
      if (!['INSTAGRAM', 'FACEBOOK', 'META', 'THREADS', 'WHATSAPP_CLOUD'].includes(channel)) {
        return reply.status(400).send({ success: false, error: 'Channel OAuth tidak valid' });
      }

      let targetCompanyId = DEFAULT_COMPANY_ID;
      if (connectToken) {
        const [link] = await db
          .select()
          .from(channelConnectLinks)
          .where(eq(channelConnectLinks.token, connectToken));
        if (!link || new Date(link.expiresAt).getTime() < Date.now()) {
          return reply.status(400).send({ success: false, error: 'Link koneksi tidak valid atau kedaluwarsa' });
        }
        targetCompanyId = link.companyId || DEFAULT_COMPANY_ID;
      } else {
        const authCheck = await new Promise<boolean>((resolve) => {
          requirePermission('settings.edit')(req as any, reply as any).then(
            () => resolve(!reply.sent),
            () => resolve(false)
          );
        });
        if (!authCheck) return;
        targetCompanyId = getRequestCompanyId(req);
      }

      await licenseService.assertQuota('channels', 1, targetCompanyId);
      const oauthCreds = await resolveEffectiveOAuthCredentials();

      const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5000').split(',')[0].trim();
      let appPrefix = '';
      const rawPrefix = String(req.headers['x-forwarded-prefix'] || '').split(',')[0].trim();
      if (rawPrefix && /^\/app\/[^/]+/i.test(rawPrefix)) {
        appPrefix = rawPrefix.replace(/\/+$/, '');
      } else {
        const referer = String(req.headers.referer || '').trim();
        const refMatch = referer.match(/https?:\/\/[^/]+(\/app\/[^/]+)/i);
        if (refMatch) appPrefix = refMatch[1];
      }
      const baseUrl = (config.meta.publicBaseUrl || `${proto}://${host}${appPrefix}`).replace(/\/+$/, '');
      const callbackUrl = `${baseUrl}/api/channels/oauth/callback`;
      const state = signOAuthState({
        channel,
        connectToken: connectToken || null,
        companyId: targetCompanyId,
        returnBase: baseUrl,
      });

      if (config.reneo.oauthUrl) {
        const lic = await licenseService.getLicense(targetCompanyId);
        const brokerStart = `${config.reneo.oauthUrl.replace(/\/+$/, '')}/start`;
        const target = `${brokerStart}?channel=${encodeURIComponent(channel)}&state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(callbackUrl)}&license_key=${encodeURIComponent(lic.licenseKey || '')}`;
        return reply.redirect(target);
      }

      if (channel === 'THREADS' && oauthCreds.threadsAppId) {
        const target = `https://threads.net/oauth/authorize?client_id=${encodeURIComponent(oauthCreds.threadsAppId)}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=${encodeURIComponent('threads_basic,threads_content_publish,threads_manage_replies,threads_keyword_search')}&response_type=code&state=${encodeURIComponent(state)}`;
        return reply.redirect(target);
      }

      if (channel === 'INSTAGRAM' && oauthCreds.directInstagramReady) {
        const igState = signOAuthState({
          channel: 'INSTAGRAM',
          igDirect: true,
          connectToken: connectToken || null,
          companyId: targetCompanyId,
          returnBase: baseUrl,
        });
        const igScope =
          'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish,instagram_business_manage_insights';
        const target = `https://www.instagram.com/oauth/authorize?force_reauth=true&client_id=${encodeURIComponent(oauthCreds.instagramAppId)}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=${encodeURIComponent(igScope)}&state=${encodeURIComponent(igState)}`;
        return reply.redirect(target);
      }

      if ((channel === 'INSTAGRAM' || channel === 'FACEBOOK' || channel === 'META' || channel === 'WHATSAPP_CLOUD') && oauthCreds.metaAppId) {
        const scope =
          channel === 'WHATSAPP_CLOUD'
            ? 'whatsapp_business_management,whatsapp_business_messaging,business_management'
            : 'pages_show_list,pages_messaging,pages_manage_posts,pages_read_engagement,business_management,instagram_basic,instagram_manage_messages,instagram_manage_comments,instagram_content_publish';
        // When metaAppSecret is configured, use code flow; otherwise use zero-secret Client OAuth token flow (response_type=token)
        const responseType = oauthCreds.metaAppSecret ? 'code' : 'token';
        const target = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${encodeURIComponent(oauthCreds.metaAppId)}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=${encodeURIComponent(scope)}&response_type=${responseType}&auth_type=rerequest&state=${encodeURIComponent(state)}`;
        return reply.redirect(target);
      }

      return reply.status(400).send({
        success: false,
        error: 'Kredensial OAuth Meta/Threads belum lengkap. Isi App Secret di Pengaturan → Omnichannel → Konfigurasi OAuth.',
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.get<{
    Querystring: {
      code?: string;
      access_token?: string;
      grant_code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    };
  }>('/oauth/callback', async (req, reply) => {
    // Bridge URL hash fragment (#access_token=...&state=...) from zero-secret Client OAuth token flow into query params
    if (
      !req.query?.code &&
      !req.query?.access_token &&
      !req.query?.grant_code &&
      !req.query?.error
    ) {
      return reply.type('text/html; charset=utf-8').send(`<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Menghubungkan Akun...</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb;color:#374151;font-size:13px;">
  <div>Menyelesaikan otorisasi akun...</div>
  <script>
    (function(){
      var h = window.location.hash ? window.location.hash.replace(/^#/, '') : '';
      if (h && (h.indexOf('access_token=') !== -1 || h.indexOf('error=') !== -1)) {
        var sep = window.location.search ? '&' : '?';
        window.location.replace(window.location.pathname + window.location.search + sep + h);
      } else {
        window.location.replace('/settings/omnichannel?oauth=error&msg=' + encodeURIComponent('Otorisasi dibatalkan atau token tidak ditemukan.'));
      }
    })();
  </script>
</body></html>`);
    }

    const parsedState = verifyOAuthState(String(req.query?.state || ''));
    const returnBase = parsedState?.returnBase || config.frontendUrl.replace(/\/+$/, '');
    const failRedirect = (msg: string) => {
      const dest = parsedState?.connectToken
        ? `${returnBase}/connect-channel?token=${encodeURIComponent(parsedState.connectToken)}&oauth=error&msg=${encodeURIComponent(msg)}`
        : `${returnBase}/settings/omnichannel?oauth=error&msg=${encodeURIComponent(msg)}`;
      return reply.redirect(dest);
    };

    try {
      if (req.query?.error) {
        return failRedirect(req.query.error_description || req.query.error);
      }
      if (!parsedState) {
        return failRedirect('Sesi OAuth tidak valid atau kedaluwarsa.');
      }

      const accountsToSave: Array<{
        channel: string;
        name: string;
        accountId: string;
        accessToken: string;
        subscribePageId?: string;
        subscribePageToken?: string;
      }> = [];

      if (req.query?.grant_code && config.reneo.oauthUrl) {
        const exchangeRes = await axios.post(
          `${config.reneo.oauthUrl.replace(/\/+$/, '')}/exchange`,
          { grant_code: req.query.grant_code, app_token: config.reneo.appToken },
          { timeout: 15000 }
        );
        const list = exchangeRes.data?.data?.accounts || exchangeRes.data?.accounts || [];
        for (const item of list) {
          if (item.channel && item.accountId && item.accessToken) {
            accountsToSave.push({
              channel: String(item.channel).toUpperCase(),
              name: String(item.name || item.accountId),
              accountId: String(item.accountId),
              accessToken: String(item.accessToken),
            });
          }
        }
      } else if (req.query?.code || req.query?.access_token) {
        const oauthCreds = await resolveEffectiveOAuthCredentials();
        const callbackUrl = `${returnBase}/api/channels/oauth/callback`;
        if (parsedState.channel === 'INSTAGRAM' && parsedState.igDirect && req.query?.code && oauthCreds.instagramAppId && oauthCreds.instagramAppSecret) {
          const cleanCode = String(req.query.code).replace(/#_$/, '').trim();
          const tokenRes = await axios.post(
            'https://api.instagram.com/oauth/access_token',
            new URLSearchParams({
              client_id: oauthCreds.instagramAppId,
              client_secret: oauthCreds.instagramAppSecret,
              grant_type: 'authorization_code',
              redirect_uri: callbackUrl,
              code: cleanCode,
            }).toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
          );
          const firstEntry = Array.isArray(tokenRes.data?.data) ? tokenRes.data.data[0] : tokenRes.data;
          let igToken = String(firstEntry?.access_token || '').trim();
          const fallbackIgId = String(firstEntry?.user_id || '').trim();
          if (igToken) {
            try {
              const longIgRes = await axios.get('https://graph.instagram.com/access_token', {
                params: {
                  grant_type: 'ig_exchange_token',
                  client_secret: oauthCreds.instagramAppSecret,
                  access_token: igToken,
                },
                timeout: 10000,
              });
              if (longIgRes.data?.access_token) {
                igToken = String(longIgRes.data.access_token).trim();
              }
            } catch {
              // fallback to short-lived IG token
            }
            const meRes = await axios.get('https://graph.instagram.com/v21.0/me', {
              params: {
                fields: 'id,user_id,username,name,account_type',
                access_token: igToken,
              },
              timeout: 10000,
            });
            const igUserId = String(meRes.data?.user_id || meRes.data?.id || fallbackIgId);
            const igDisplay = meRes.data?.username
              ? `@${meRes.data.username}`
              : meRes.data?.name || 'Instagram';
            accountsToSave.push({
              channel: 'INSTAGRAM',
              name: igDisplay,
              accountId: igUserId,
              accessToken: igToken,
            });
          }
        } else if (parsedState.channel === 'THREADS' && oauthCreds.threadsAppId) {
          let shortToken = String(req.query?.access_token || '').trim();
          let fallbackUserId = '';
          if (!shortToken && req.query?.code && oauthCreds.threadsAppSecret) {
            const tokenRes = await axios.post(
              'https://graph.threads.net/oauth/access_token',
              new URLSearchParams({
                client_id: oauthCreds.threadsAppId,
                client_secret: oauthCreds.threadsAppSecret,
                grant_type: 'authorization_code',
                redirect_uri: callbackUrl,
                code: req.query.code,
              }).toString(),
              { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
            );
            shortToken = tokenRes.data?.access_token || '';
            fallbackUserId = String(tokenRes.data?.user_id || '');
          }
          if (shortToken) {
            let finalThreadsToken = shortToken;
            if (oauthCreds.threadsAppSecret) {
              try {
                const longRes = await axios.get('https://graph.threads.net/access_token', {
                  params: {
                    grant_type: 'th_exchange_token',
                    client_secret: oauthCreds.threadsAppSecret,
                    access_token: shortToken,
                  },
                  timeout: 10000,
                });
                if (longRes.data?.access_token) {
                  finalThreadsToken = longRes.data.access_token;
                }
              } catch {
                // fallback to short token if exchange fails
              }
            }
            const meRes = await axios.get('https://graph.threads.net/v1.0/me', {
              params: { fields: 'id,username,name', access_token: finalThreadsToken },
              timeout: 10000,
            });
            accountsToSave.push({
              channel: 'THREADS',
              name: meRes.data?.username ? `@${meRes.data.username}` : meRes.data?.name || 'Threads',
              accountId: String(meRes.data?.id || fallbackUserId),
              accessToken: finalThreadsToken,
            });
          }
        } else if (oauthCreds.metaAppId) {
          let shortUserToken = String(req.query?.access_token || '').trim();
          if (!shortUserToken && req.query?.code && oauthCreds.metaAppSecret) {
            const tokenRes = await axios.get('https://graph.facebook.com/v20.0/oauth/access_token', {
              params: {
                client_id: oauthCreds.metaAppId,
                client_secret: oauthCreds.metaAppSecret,
                redirect_uri: callbackUrl,
                code: req.query.code,
              },
              timeout: 15000,
            });
            shortUserToken = tokenRes.data?.access_token || '';
          }
          if (shortUserToken) {
            // Exchange to 60-day Long-Lived User Token when metaAppSecret is available
            let userToken = shortUserToken;
            if (oauthCreds.metaAppSecret) {
              try {
                const longUserRes = await axios.get('https://graph.facebook.com/v20.0/oauth/access_token', {
                  params: {
                    grant_type: 'fb_exchange_token',
                    client_id: oauthCreds.metaAppId,
                    client_secret: oauthCreds.metaAppSecret,
                    fb_exchange_token: shortUserToken,
                  },
                  timeout: 15000,
                });
                if (longUserRes.data?.access_token) {
                  userToken = longUserRes.data.access_token;
                }
              } catch {
                // fallback to direct user token
              }
            }

            const pagesRes = await axios.get('https://graph.facebook.com/v20.0/me/accounts', {
              params: {
                limit: 100,
                fields:
                  'id,name,access_token,instagram_business_account{id,username,name},connected_instagram_account{id,username,name}',
                access_token: userToken,
              },
              timeout: 15000,
            });
            const seenIgIds = new Set<string>();
            for (const page of pagesRes.data?.data || []) {
              const pageToken = String(page.access_token || userToken);
              const wantFacebook = parsedState.channel === 'FACEBOOK' || parsedState.channel === 'META';
              const wantInstagram = parsedState.channel === 'INSTAGRAM' || parsedState.channel === 'META';

              if (wantFacebook) {
                accountsToSave.push({
                  channel: 'FACEBOOK',
                  name: String(page.name || page.id),
                  accountId: String(page.id),
                  accessToken: pageToken,
                  subscribePageId: String(page.id),
                  subscribePageToken: pageToken,
                });
              }
              const ig = page.instagram_business_account || page.connected_instagram_account;
              if (wantInstagram && ig?.id && !seenIgIds.has(String(ig.id))) {
                seenIgIds.add(String(ig.id));
                accountsToSave.push({
                  channel: 'INSTAGRAM',
                  name: ig.username ? `@${ig.username}` : ig.name || page.name,
                  accountId: String(ig.id),
                  accessToken: pageToken,
                  subscribePageId: String(page.id),
                  subscribePageToken: pageToken,
                });
              }
            }

            // Fallback: also inspect Meta Business Portfolios (/me/businesses) for Instagram Business accounts not linked to a classic Facebook Page
            if (
              (parsedState.channel === 'INSTAGRAM' || parsedState.channel === 'META') &&
              seenIgIds.size === 0
            ) {
              try {
                const bizRes = await axios.get('https://graph.facebook.com/v20.0/me/businesses', {
                  params: {
                    fields:
                      'id,name,instagram_business_accounts{id,username,name},owned_instagram_accounts{id,username,name}',
                    access_token: userToken,
                  },
                  timeout: 12000,
                });
                for (const biz of bizRes.data?.data || []) {
                  const igList = [
                    ...(biz.instagram_business_accounts?.data || []),
                    ...(biz.owned_instagram_accounts?.data || []),
                  ];
                  for (const ig of igList) {
                    if (ig?.id && !seenIgIds.has(String(ig.id))) {
                      seenIgIds.add(String(ig.id));
                      accountsToSave.push({
                        channel: 'INSTAGRAM',
                        name: ig.username ? `@${ig.username}` : ig.name || biz.name || 'Instagram',
                        accountId: String(ig.id),
                        accessToken: userToken,
                      });
                    }
                  }
                }
              } catch {
                // ignore if business_management not granted
              }
            }
          }
        }
      }

      if (accountsToSave.length === 0) {
        const emptyHint =
          parsedState.channel === 'INSTAGRAM'
            ? 'Tidak ditemukan akun Instagram Business yang terhubung ke Facebook Page Anda.'
            : 'Tidak ada akun kanal yang berhasil diambil dari OAuth.';
        return failRedirect(emptyHint);
      }

      const targetCompanyId = String(parsedState.companyId || '').trim() || DEFAULT_COMPANY_ID;
      const now = new Date();
      let firstCreatedId = '';
      let savedCount = 0;
      const subscribedPages = new Set<string>();

      for (const acc of accountsToSave) {
        const existing = await db
          .select()
          .from(channelAccounts)
          .where(
            and(
              eq(channelAccounts.companyId, targetCompanyId),
              eq(channelAccounts.channel, acc.channel),
              eq(channelAccounts.accountId, acc.accountId)
            )
          );
        if (existing.length > 0) {
          await db
            .update(channelAccounts)
            .set({ name: acc.name, accessToken: acc.accessToken, isActive: true, updatedAt: now })
            .where(eq(channelAccounts.id, existing[0].id));
          if (!firstCreatedId) firstCreatedId = existing[0].id;
          savedCount += 1;
        } else {
          try {
            await licenseService.assertQuota('channels', 1, targetCompanyId);
          } catch {
            // Stop adding more new accounts once license channel quota is reached
            break;
          }
          const newId = crypto.randomUUID();
          await db.insert(channelAccounts).values({
            id: newId,
            companyId: targetCompanyId,
            channel: acc.channel,
            name: acc.name,
            accountId: acc.accountId,
            accessToken: acc.accessToken,
            verifyToken: `reneo_${crypto.randomBytes(8).toString('hex')}`,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          });
          if (!firstCreatedId) firstCreatedId = newId;
          savedCount += 1;
        }

        // Best-effort auto-subscribe Facebook Page webhook so DMs & comments flow automatically
        if (acc.subscribePageId && acc.subscribePageToken && !subscribedPages.has(acc.subscribePageId)) {
          subscribedPages.add(acc.subscribePageId);
          axios
            .post(
              `https://graph.facebook.com/v20.0/${encodeURIComponent(acc.subscribePageId)}/subscribed_apps`,
              null,
              {
                params: {
                  subscribed_fields: 'messages,messaging_postbacks,feed',
                  access_token: acc.subscribePageToken,
                },
                timeout: 8000,
              }
            )
            .catch(() => {});
        }
      }

      if (savedCount === 0) {
        return failRedirect('Kuota channel paket lisensi sudah penuh.');
      }

      if (parsedState.connectToken && firstCreatedId) {
        await db
          .update(channelConnectLinks)
          .set({ usedAt: now, createdChannelAccountId: firstCreatedId })
          .where(eq(channelConnectLinks.token, parsedState.connectToken));
        return reply.redirect(
          `${returnBase}/connect-channel?token=${encodeURIComponent(parsedState.connectToken)}&oauth=success&count=${savedCount}&channel=${encodeURIComponent(String(parsedState.channel || ''))}`
        );
      }

      return reply.redirect(`${returnBase}/settings/omnichannel?oauth=success&count=${savedCount}`);
    } catch (error: any) {
      return failRedirect(error.response?.data?.error?.message || error.message || 'OAuth gagal');
    }
  });
}
