import crypto from 'crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { systemSettings, birthdaySettings, autoReplyRules, webhookDeliveries } from '../db/schema';
import { BirthdayService } from '../services/birthday.service';
import { wahaService } from '../services/waha.service';
import { licenseService } from '../services/license.service';
import { notifyAlertWebhook } from '../services/automation.service';
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

  // GET automation & routing settings + keyword auto-reply rules
  fastify.get(
    '/automation',
    { preHandler: requirePermission('settings', 'conversations') },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const rows = await db.select().from(systemSettings);
        const map: Record<string, string> = {};
        for (const r of rows) map[r.key] = r.value;
        const rules = await db
          .select()
          .from(autoReplyRules)
          .orderBy(asc(autoReplyRules.priority), asc(autoReplyRules.createdAt));

        return reply.send({
          success: true,
          data: {
            config: {
              autoAssignMode: (map.auto_assign_mode || 'NONE') as
                | 'NONE'
                | 'ROUND_ROBIN'
                | 'LEAST_BUSY',
              welcomeEnabled: map.welcome_enabled === 'true',
              welcomeMessage:
                map.welcome_message ||
                'Halo {nama_panggilan}, terima kasih telah menghubungi kami! Tim kami akan segera membalas pesan Anda.',
              offhoursEnabled: map.offhours_enabled === 'true',
              businessHoursStart: map.business_hours_start || '08:00',
              businessHoursEnd: map.business_hours_end || '17:00',
              businessDays: map.business_days || '1,2,3,4,5',
              offhoursMessage:
                map.offhours_message ||
                'Halo {nama_panggilan}, saat ini kami sedang di luar jam operasional (08:00–17:00 WIB). Pesan Anda tetap kami catat dan akan dibalas saat jam kerja.',
              slaEscalationEnabled: map.sla_escalation_enabled !== 'false',
              slaAlertWebhookUrl: map.sla_alert_webhook_url || '',
            },
            rules,
          },
        });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  // POST update automation & routing settings
  fastify.post<{
    Body: {
      autoAssignMode?: 'NONE' | 'ROUND_ROBIN' | 'LEAST_BUSY';
      welcomeEnabled?: boolean;
      welcomeMessage?: string;
      offhoursEnabled?: boolean;
      businessHoursStart?: string;
      businessHoursEnd?: string;
      businessDays?: string;
      offhoursMessage?: string;
      slaEscalationEnabled?: boolean;
      slaAlertWebhookUrl?: string;
    };
  }>('/automation', { preHandler: requirePermission('settings') }, async (req, reply) => {
    try {
      const b = req.body || {};
      const autoAssignMode =
        b.autoAssignMode === 'ROUND_ROBIN' || b.autoAssignMode === 'LEAST_BUSY'
          ? b.autoAssignMode
          : 'NONE';
      const webhookUrl = String(b.slaAlertWebhookUrl || '').trim();
      if (webhookUrl && !/^https?:\/\//i.test(webhookUrl)) {
        return reply.status(400).send({
          success: false,
          error: 'URL Webhook Eskalasi SLA harus diawali http:// atau https://',
        });
      }

      const now = new Date();
      const pairs: Array<[string, string]> = [
        ['auto_assign_mode', autoAssignMode],
        ['welcome_enabled', b.welcomeEnabled ? 'true' : 'false'],
        ['welcome_message', String(b.welcomeMessage || '').trim()],
        ['offhours_enabled', b.offhoursEnabled ? 'true' : 'false'],
        ['business_hours_start', String(b.businessHoursStart || '08:00').trim() || '08:00'],
        ['business_hours_end', String(b.businessHoursEnd || '17:00').trim() || '17:00'],
        ['business_days', String(b.businessDays || '1,2,3,4,5').trim() || '1,2,3,4,5'],
        ['offhours_message', String(b.offhoursMessage || '').trim()],
        ['sla_escalation_enabled', b.slaEscalationEnabled === false ? 'false' : 'true'],
        ['sla_alert_webhook_url', webhookUrl],
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

      return reply.send({ success: true, message: 'Pengaturan otomatisasi & routing disimpan' });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // Auto-reply rules CRUD
  fastify.post<{
    Body: { keyword?: string; matchType?: string; replyText?: string; priority?: number };
  }>('/auto-replies', { preHandler: requirePermission('settings') }, async (req, reply) => {
    try {
      const keyword = String(req.body?.keyword || '').trim();
      const replyText = String(req.body?.replyText || '').trim();
      if (!keyword || !replyText) {
        return reply
          .status(400)
          .send({ success: false, error: 'Kata kunci dan balasan otomatis wajib diisi' });
      }
      const matchType =
        req.body?.matchType === 'EXACT' || req.body?.matchType === 'STARTS_WITH'
          ? req.body.matchType
          : 'CONTAINS';
      const priority = Number.isFinite(Number(req.body?.priority))
        ? Math.round(Number(req.body?.priority))
        : 10;
      const now = new Date();
      const [created] = await db
        .insert(autoReplyRules)
        .values({
          id: crypto.randomUUID(),
          keyword,
          matchType,
          replyText,
          isActive: true,
          priority,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return reply.status(201).send({ success: true, data: created });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.patch<{
    Params: { id: string };
    Body: { isActive?: boolean; keyword?: string; matchType?: string; replyText?: string };
  }>('/auto-replies/:id', { preHandler: requirePermission('settings') }, async (req, reply) => {
    try {
      const patch: Record<string, any> = { updatedAt: new Date() };
      if (req.body?.isActive !== undefined) patch.isActive = Boolean(req.body.isActive);
      if (req.body?.keyword !== undefined) patch.keyword = String(req.body.keyword).trim();
      if (req.body?.replyText !== undefined) patch.replyText = String(req.body.replyText).trim();
      if (req.body?.matchType !== undefined) patch.matchType = req.body.matchType;

      const [updated] = await db
        .update(autoReplyRules)
        .set(patch)
        .where(eq(autoReplyRules.id, req.params.id))
        .returning();
      if (!updated) {
        return reply.status(404).send({ success: false, error: 'Aturan tidak ditemukan' });
      }
      return reply.send({ success: true, data: updated });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.delete<{ Params: { id: string } }>(
    '/auto-replies/:id',
    { preHandler: requirePermission('settings') },
    async (req, reply) => {
      try {
        await db.delete(autoReplyRules).where(eq(autoReplyRules.id, req.params.id));
        return reply.send({ success: true });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  // Webhook Delivery Logs
  fastify.get(
    '/webhook-deliveries',
    { preHandler: requirePermission('settings') },
    async (_req, reply) => {
      try {
        const rows = await db
          .select()
          .from(webhookDeliveries)
          .orderBy(desc(webhookDeliveries.createdAt))
          .limit(30);
        return reply.send({ success: true, data: rows });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  fastify.post(
    '/webhook-deliveries/test',
    { preHandler: requirePermission('settings') },
    async (_req, reply) => {
      try {
        const result = await notifyAlertWebhook('test_ping', {
          message: 'Tes koneksi webhook alert CRM Reneo',
        });
        return reply.send({ success: true, data: result });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );
}
