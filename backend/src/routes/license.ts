import crypto from 'crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { licenseService } from '../services/license.service';
import { liveEvents } from '../services/events.service';
import { config } from '../config';
import { getCurrentAuthUser } from './auth';

async function requireAuthenticated(req: FastifyRequest, reply: FastifyReply) {
  const user = await getCurrentAuthUser(req);
  if (!user) {
    return reply.status(401).send({ success: false, error: 'Sesi login diperlukan' });
  }
}

async function requireAdminUser(req: FastifyRequest, reply: FastifyReply) {
  const user = await getCurrentAuthUser(req);
  if (!user) {
    return reply.status(401).send({ success: false, error: 'Sesi login diperlukan' });
  }
  if (user.role !== 'ADMIN') {
    return reply.status(403).send({
      success: false,
      error: 'Hanya administrator utama yang dapat mengelola lisensi',
    });
  }
}

function hasValidPanelToken(req: FastifyRequest): boolean {
  const expected = (config.reneo.appToken || '').trim();
  const provided = String(req.headers['x-reneo-app-token'] || '').trim();
  if (!expected || !provided || expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export default async function licenseRouter(fastify: FastifyInstance) {
  // GET license status
  fastify.get(
    '/status',
    { preHandler: requireAuthenticated },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const license = await licenseService.getLicense();
        return reply.send({ success: true, data: license });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  // POST sync license with Reneo
  fastify.post(
    '/sync',
    { preHandler: requireAdminUser },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const license = await licenseService.syncWithReneo();
        liveEvents.emit('license:update', { action: 'sync' });
        return reply.send({
          success: true,
          message: 'Status lisensi berhasil disinkronkan dengan Reneo',
          data: license,
        });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  // POST update license locally (restricted to signed Reneo panel push)
  fastify.post<{
    Body: { plan: string; expiresAt: string; licenseKey?: string };
  }>('/update', async (req, reply) => {
    if (!hasValidPanelToken(req)) {
      return reply.status(403).send({
        success: false,
        error: 'Pembaruan lisensi langsung memerlukan token panel Reneo yang valid',
      });
    }
    try {
      const { plan, expiresAt, licenseKey } = req.body;
      if (!plan || !expiresAt) {
        return reply.status(400).send({ success: false, error: 'Plan dan expiresAt wajib diisi' });
      }

      const updated = await licenseService.updateLicense({ plan, expiresAt, licenseKey });
      liveEvents.emit('license:update', { action: 'update' });
      return reply.send({
        success: true,
        message: 'Lisensi berhasil diperbarui',
        data: updated,
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST activate license with key
  fastify.post<{
    Body: { licenseKey: string };
  }>('/activate', { preHandler: requireAdminUser }, async (req, reply) => {
    try {
      const license = await licenseService.activateLicenseKey(req.body?.licenseKey || '');
      liveEvents.emit('license:update', { action: 'activate' });
      return reply.send({ success: true, data: license, message: 'Lisensi berhasil diaktivasi.' });
    } catch (error: any) {
      return reply.status(error?.statusCode || 400).send({ success: false, error: error.message });
    }
  });

  // GET license plans from Reneo
  fastify.get(
    '/plans',
    { preHandler: requireAuthenticated },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const plans = await licenseService.getPlans();
        return reply.send({ success: true, data: plans });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  // POST start a trial for any license plan
  fastify.post<{
    Body: { planSlug?: string };
  }>('/trial', { preHandler: requireAdminUser }, async (req, reply) => {
    try {
      const license = await licenseService.startTrial(req.body?.planSlug || 'pro-monthly');
      liveEvents.emit('license:update', { action: 'trial' });
      return reply.send({
        success: true,
        data: license,
        message: `Paket trial (${license.plan}) berhasil diaktifkan.`,
      });
    } catch (error: any) {
      return reply.status(error?.statusCode || 400).send({ success: false, error: error.message });
    }
  });

  // POST create invoice order in Reneo
  fastify.post<{
    Body: {
      planSlug: string;
      buyerName?: string;
      buyerEmail?: string;
      buyerPhone?: string;
      paymentMethod?: string;
    };
  }>('/order', { preHandler: requireAdminUser }, async (req, reply) => {
    try {
      const result = await licenseService.createOrder(req.body);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(error?.response?.status || 500).send({
        success: false,
        error: error.response?.data?.error || error.message,
      });
    }
  });

  // GET invoice order details
  fastify.get<{
    Params: { publicId: string };
  }>('/order/:publicId', { preHandler: requireAdminUser }, async (req, reply) => {
    try {
      const result = await licenseService.getOrder(req.params.publicId);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(error?.response?.status || 500).send({
        success: false,
        error: error.response?.data?.error || error.message,
      });
    }
  });

  // POST pay invoice order in Reneo
  fastify.post<{
    Params: { publicId: string };
    Body: { paymentMethod?: string };
  }>('/order/:publicId/pay', { preHandler: requireAdminUser }, async (req, reply) => {
    try {
      const result = await licenseService.payOrder(req.params.publicId, req.body?.paymentMethod);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(error?.response?.status || 500).send({
        success: false,
        error: error.response?.data?.error || error.message,
      });
    }
  });
}

