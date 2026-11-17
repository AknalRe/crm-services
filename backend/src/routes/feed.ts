import axios from 'axios';
import { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { channelAccounts } from '../db/schema';
import { licenseService } from '../services/license.service';
import { getRequestCompanyId, requirePermission } from './auth';

export default async function feedRouter(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requirePermission('conversations'));

  fastify.get<{
    Querystring: { q?: string; channel?: string };
  }>('/search', async (req, reply) => {
    try {
      const companyId = getRequestCompanyId(req);
      await licenseService.assertFeature('omnichannel', undefined, companyId);
      const q = String(req.query?.q || '').trim();
      const accounts = await db
        .select()
        .from(channelAccounts)
        .where(and(eq(channelAccounts.companyId, companyId), eq(channelAccounts.isActive, true)));

      const threadsAccount = accounts.find((a) => a.channel === 'THREADS' && a.accessToken);
      if (!threadsAccount) {
        return reply.send({
          success: true,
          data: {
            connected: false,
            items: [],
            message: 'Belum ada akun Threads aktif yang terhubung. Hubungkan akun Threads di Integrasi & Kanal.',
          },
        });
      }

      if (!q) {
        return reply.send({
          success: true,
          data: {
            connected: true,
            accountName: threadsAccount.name,
            items: [],
          },
        });
      }

      try {
        const res = await axios.get('https://graph.threads.net/v1.0/keyword_search', {
          params: {
            q,
            search_type: 'TOP',
            fields: 'id,text,username,permalink,timestamp',
            access_token: threadsAccount.accessToken,
          },
          timeout: 12000,
        });
        return reply.send({
          success: true,
          data: {
            connected: true,
            accountName: threadsAccount.name,
            items: res.data?.data || [],
          },
        });
      } catch (apiErr: any) {
        return reply.status(400).send({
          success: false,
          error:
            apiErr.response?.data?.error?.message ||
            'Akun Threads belum memiliki izin threads_keyword_search. Hubungkan ulang akun Threads Anda.',
        });
      }
    } catch (error: any) {
      return reply.status(error?.statusCode || 500).send({
        success: false,
        code: error?.code,
        feature: error?.feature,
        error: error.message,
      });
    }
  });

  fastify.post<{
    Body: { postId?: string; text?: string };
  }>('/reply', async (req, reply) => {
    try {
      const companyId = getRequestCompanyId(req);
      await licenseService.assertFeature('omnichannel', undefined, companyId);
      const postId = String(req.body?.postId || '').trim();
      const text = String(req.body?.text || '').trim();
      if (!postId || !text) {
        return reply.status(400).send({ success: false, error: 'postId dan teks balasan wajib diisi' });
      }

      const accounts = await db
        .select()
        .from(channelAccounts)
        .where(and(eq(channelAccounts.companyId, companyId), eq(channelAccounts.isActive, true)));
      const threadsAccount = accounts.find((a) => a.channel === 'THREADS' && a.accessToken);
      if (!threadsAccount) {
        return reply.status(400).send({ success: false, error: 'Akun Threads aktif tidak ditemukan.' });
      }

      const containerRes = await axios.post(
        `https://graph.threads.net/v1.0/${threadsAccount.accountId}/threads`,
        null,
        {
          params: {
            media_type: 'TEXT',
            text,
            reply_to_id: postId,
            access_token: threadsAccount.accessToken,
          },
          timeout: 10000,
        }
      );
      const creationId = containerRes.data?.id;
      if (!creationId) {
        return reply.status(400).send({ success: false, error: 'Gagal membuat container balasan Threads' });
      }

      const publishRes = await axios.post(
        `https://graph.threads.net/v1.0/${threadsAccount.accountId}/threads_publish`,
        null,
        {
          params: { creation_id: creationId, access_token: threadsAccount.accessToken },
          timeout: 10000,
        }
      );

      return reply.send({ success: true, data: { id: publishRes.data?.id || creationId } });
    } catch (error: any) {
      return reply.status(error?.statusCode || 400).send({
        success: false,
        code: error?.code,
        feature: error?.feature,
        error: error.response?.data?.error?.message || error.message,
      });
    }
  });
}
