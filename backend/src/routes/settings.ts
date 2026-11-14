import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { systemSettings, birthdaySettings } from '../db/schema';
import { BirthdayService } from '../services/birthday.service';
import { wahaService } from '../services/waha.service';
import { licenseService } from '../services/license.service';
import { requirePermission } from './auth';

export default async function settingsRouter(fastify: FastifyInstance) {
  // GET all settings
  fastify.get('/', { preHandler: requirePermission('settings', 'birthday', 'conversations') }, async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const wahaConfig = await wahaService.getConfig(true);
      let list = await db
        .select()
        .from(birthdaySettings)
        .where(eq(birthdaySettings.id, 'default'));

      const settingsRows = await db.select().from(systemSettings);
      const settingMap: Record<string, string> = {};
      for (const row of settingsRows) {
        settingMap[row.key] = row.value;
      }
      const slaRaw = Number.parseInt(settingMap.sla_target_minutes || '15', 10);
      const slaTargetMinutes = Number.isFinite(slaRaw) && slaRaw >= 1 ? Math.min(1440, slaRaw) : 15;

      return reply.send({
        success: true,
        data: {
          waha: wahaConfig,
          birthday: list[0] || null,
          crm: {
            csatTemplate:
              settingMap.csat_template ||
              'Halo {nama_panggilan}, terima kasih telah menghubungi kami. Mohon bantuannya untuk memberikan penilaian layanan kami melalui tautan berikut:\n{link_csat}',
            csatAutoOnResolve: settingMap.csat_auto_on_resolve === 'true',
            slaTargetMinutes,
            csatBaseUrl: settingMap.csat_base_url || '',
          },
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST update WAHA settings
  fastify.post<{
    Body: { mode?: 'INTERNAL' | 'EXTERNAL'; baseUrl?: string; apiKey?: string; session?: string };
  }>('/waha', { preHandler: requirePermission('settings') }, async (req, reply: FastifyReply) => {
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
  fastify.get('/birthday', { preHandler: requirePermission('birthday') }, async (_req: FastifyRequest, reply: FastifyReply) => {
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
        wahaSession: null,
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
  fastify.post<{
    Body: {
      isEnabled?: boolean;
      sendTime?: string;
      messageTemplate?: string;
      delaySeconds?: number;
      wahaSession?: string | null;
    };
  }>('/birthday', { preHandler: requirePermission('birthday') }, async (req, reply: FastifyReply) => {
    try {
      const { isEnabled, sendTime, messageTemplate, delaySeconds, wahaSession } = req.body;
      const now = new Date();

      const updateData: any = { updatedAt: now };
      if (isEnabled !== undefined) updateData.isEnabled = Boolean(isEnabled);
      if (sendTime) updateData.sendTime = sendTime;
      if (messageTemplate) updateData.messageTemplate = messageTemplate;
      if (delaySeconds) updateData.delaySeconds = Number(delaySeconds);
      if (wahaSession !== undefined) {
        updateData.wahaSession = wahaSession && wahaSession.trim() ? wahaSession.trim() : null;
      }

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
          wahaSession: wahaSession && wahaSession.trim() ? wahaSession.trim() : null,
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
  fastify.post('/birthday/trigger', { preHandler: requirePermission('birthday') }, async (_req: FastifyRequest, reply: FastifyReply) => {
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

  // POST update CRM CSAT template & SLA settings
  fastify.post('/crm', { preHandler: requirePermission('settings') }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = (req.body || {}) as {
        csatTemplate?: string;
        csatAutoOnResolve?: boolean;
        slaTargetMinutes?: number;
        csatBaseUrl?: string;
      };
      const template = String(body.csatTemplate ?? '').trim();
      if (!template) {
        return reply.status(400).send({ success: false, error: 'Template pesan CSAT tidak boleh kosong' });
      }
      const slaRaw = Number(body.slaTargetMinutes);
      const slaTargetMinutes = Number.isFinite(slaRaw) ? Math.max(1, Math.min(1440, Math.round(slaRaw))) : 15;
      const csatAutoOnResolve = Boolean(body.csatAutoOnResolve);
      const csatBaseUrl = String(body.csatBaseUrl ?? '')
        .trim()
        .replace(/\/+$/, '');
      if (csatBaseUrl && !/^https?:\/\//i.test(csatBaseUrl)) {
        return reply.status(400).send({
          success: false,
          error: 'URL Publik CSAT harus diawali http:// atau https://',
        });
      }
      const now = new Date();

      const pairs: Array<[string, string]> = [
        ['csat_template', template],
        ['csat_auto_on_resolve', csatAutoOnResolve ? 'true' : 'false'],
        ['sla_target_minutes', String(slaTargetMinutes)],
        ['csat_base_url', csatBaseUrl],
      ];

      for (const [key, value] of pairs) {
        await db
          .insert(systemSettings)
          .values({ key, value, updatedAt: now })
          .onConflictDoUpdate({
            target: systemSettings.key,
            set: { value, updatedAt: now },
          });
      }

      return reply.send({
        success: true,
        message: 'Pengaturan CSAT & SLA berhasil disimpan',
        data: {
          csatTemplate: template,
          csatAutoOnResolve,
          slaTargetMinutes,
          csatBaseUrl,
        },
      });
    } catch (error: any) {
      return reply.status(error.statusCode || 400).send({ success: false, error: error.message });
    }
  });
}
