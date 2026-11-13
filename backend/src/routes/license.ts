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
}

