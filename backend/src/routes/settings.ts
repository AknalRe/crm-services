import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { systemSettings, birthdaySettings } from '../db/schema';
import { BirthdayService } from '../services/birthday.service';
import { wahaService } from '../services/waha.service';
import { licenseService } from '../services/license.service';

export default async function settingsRouter(fastify: FastifyInstance) {
  // GET all settings
  fastify.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const wahaConfig = await wahaService.getConfig(true);
      let list = await db
        .select()
        .from(birthdaySettings)
        .where(eq(birthdaySettings.id, 'default'));

      return reply.send({
        success: true,
        data: {
          waha: wahaConfig,
          birthday: list[0] || null,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST update WAHA settings
  fastify.post('/waha', async (req: FastifyRequest<{
    Body: { mode?: 'INTERNAL' | 'EXTERNAL'; baseUrl?: string; apiKey?: string; session?: string };
  }>, reply: FastifyReply) => {
    try {
      const { mode = 'INTERNAL', baseUrl, apiKey, session } = req.body || {};
      const now = new Date();

      const pairs: Array<{ key: string; value: string }> = [
        { key: 'waha_mode', value: mode === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL' },
      ];

      if (mode === 'EXTERNAL') {
        if (!baseUrl || !baseUrl.trim()) {
          return reply.status(400).send({ success: false, error: 'Base URL WAHA wajib diisi untuk mode eksternal' });
        }
        pairs.push(
          { key: 'waha_base_url', value: baseUrl.trim() },
          { key: 'waha_api_key', value: (apiKey || '').trim() },
        );
      }

      if (session && session.trim()) {
        pairs.push({ key: 'waha_session', value: session.trim() });
      }

      for (const p of pairs) {
        await db
          .insert(systemSettings)
          .values({ key: p.key, value: p.value, updatedAt: now })
          .onConflictDoUpdate({
            target: systemSettings.key,
            set: { value: p.value, updatedAt: now },
          });
      }

      return reply.send({ success: true, message: 'Pengaturan WAHA berhasil disimpan' });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET birthday settings & celebrants
  fastify.get('/birthday', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const list = await db
        .select()
        .from(birthdaySettings)
        .where(eq(birthdaySettings.id, 'default'));

      const celebrants = await BirthdayService.getBirthdayContacts();
      const defaultSetting = {
        id: 'default',
        isEnabled: true,
        sendTime: '08:00',
        messageTemplate:
          'Halo {nama_panggilan}! Selamat ulang tahun, semoga panjang umur, sehat selalu, dan sukses selalu.',
        delaySeconds: 5,
        lastRunDate: null,
      };

      return reply.send({
        success: true,
        data: {
          setting: list[0] || defaultSetting,
          celebrants,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST update birthday settings
  fastify.post('/birthday', async (req: FastifyRequest<{
    Body: {
      isEnabled?: boolean;
      sendTime?: string;
      messageTemplate?: string;
      delaySeconds?: number;
    };
  }>, reply: FastifyReply) => {
    try {
      const { isEnabled, sendTime, messageTemplate, delaySeconds } = req.body;
      const now = new Date();

      const updateData: any = { updatedAt: now };
      if (isEnabled !== undefined) updateData.isEnabled = Boolean(isEnabled);
      if (sendTime) updateData.sendTime = sendTime;
      if (messageTemplate) updateData.messageTemplate = messageTemplate;
      if (delaySeconds) updateData.delaySeconds = Number(delaySeconds);

      const updated = await db
        .insert(birthdaySettings)
        .values({
          id: 'default',
          isEnabled: isEnabled !== undefined ? Boolean(isEnabled) : true,
          sendTime: sendTime || '08:00',
          messageTemplate:
            messageTemplate ||
            'Halo {nama_panggilan}! Selamat ulang tahun 🎉🎂 Semoga panjang umur, sehat selalu, berkah, dan sukses selalu!',
          delaySeconds: delaySeconds ? Number(delaySeconds) : 5,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: birthdaySettings.id,
          set: updateData,
        })
        .returning();

      return reply.send({
        success: true,
        message: 'Pengaturan ucapan ulang tahun berhasil disimpan',
        data: updated[0],
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST trigger birthday broadcast manually
  fastify.post('/birthday/trigger', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      await licenseService.assertFeature('birthdayAutomation');
      const result = await BirthdayService.runBirthdayBroadcast();
      return reply.send({
        success: true,
        message: 'Broadcast ulang tahun berhasil diproses',
        data: result,
      });
    } catch (error: any) {
      return reply.status(error.statusCode || 400).send({ success: false, error: error.message });
    }
  });
}
