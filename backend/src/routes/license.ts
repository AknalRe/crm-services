import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { licenseService } from '../services/license.service';

export default async function licenseRouter(fastify: FastifyInstance) {
  // GET license status
  fastify.get('/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const license = await licenseService.getLicense();
      return reply.send({ success: true, data: license });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST sync license with Reneo
  fastify.post('/sync', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const license = await licenseService.syncWithReneo();
      return reply.send({
        success: true,
        message: 'Status lisensi berhasil disinkronkan dengan Reneo',
        data: license,
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST update license locally
  fastify.post('/update', async (req: FastifyRequest<{
    Body: { plan: string; expiresAt: string; licenseKey?: string };
  }>, reply: FastifyReply) => {
    try {
      const { plan, expiresAt, licenseKey } = req.body;
      if (!plan || !expiresAt) {
        return reply.status(400).send({ success: false, error: 'Plan dan expiresAt wajib diisi' });
      }

      const updated = await licenseService.updateLicense({ plan, expiresAt, licenseKey });
      return reply.send({
        success: true,
        message: 'Lisensi berhasil diperbarui',
        data: updated,
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET license plans from Reneo
  fastify.get('/plans', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const plans = await licenseService.getPlans();
      return reply.send({ success: true, data: plans });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST create invoice order in Reneo
  fastify.post('/order', async (req: FastifyRequest<{
    Body: {
      planSlug: string;
      buyerName?: string;
      buyerEmail?: string;
      buyerPhone?: string;
      paymentMethod?: string;
    };
  }>, reply: FastifyReply) => {
    try {
      const result = await licenseService.createOrder(req.body);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET invoice order details
  fastify.get('/order/:publicId', async (req: FastifyRequest<{
    Params: { publicId: string };
  }>, reply: FastifyReply) => {
    try {
      const result = await licenseService.getOrder(req.params.publicId);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST pay invoice order in Reneo
  fastify.post('/order/:publicId/pay', async (req: FastifyRequest<{
    Params: { publicId: string };
    Body: { paymentMethod?: string };
  }>, reply: FastifyReply) => {
    try {
      const result = await licenseService.payOrder(req.params.publicId, req.body?.paymentMethod);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}

