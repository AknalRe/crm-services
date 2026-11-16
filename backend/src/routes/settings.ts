import crypto from 'crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { systemSettings, birthdaySettings, autoReplyRules, webhookDeliveries } from '../db/schema';
import { BirthdayService } from '../services/birthday.service';
import { wahaService } from '../services/waha.service';
import { licenseService } from '../services/license.service';
import { liveEvents } from '../services/events.service';
import { notifyAlertWebhook } from '../services/automation.service';
import {
  DEFAULT_CSAT_CTA_TEMPLATE,
  parseCsatSurveyConfig,
  sanitizeCsatSurveyConfig,
} from '../services/csat.service';
import { requirePermission } from './auth';
import { resolveRequestPublicBase } from './waha';

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
            csatTemplate: settingMap.csat_template || DEFAULT_CSAT_CTA_TEMPLATE,
            csatAutoOnResolve: settingMap.csat_auto_on_resolve === 'true',
            slaTargetMinutes,
            csatBaseUrl: settingMap.csat_base_url || '',
            csatSurveyConfig: parseCsatSurveyConfig(settingMap.csat_survey_config),
          },
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST update WAHA settings
  fastify.post<{
    Body: { mode?: 'INTERNAL' | 'EXTERNAL'; baseUrl?: string; apiKey?: string; session?: string; webhookUrl?: string };
  }>('/waha', { preHandler: requirePermission('settings') }, async (req, reply: FastifyReply) => {
    try {
      const { mode = 'INTERNAL', baseUrl, apiKey, session, webhookUrl } = req.body || {};
      const now = new Date();
      const publicBase = resolveRequestPublicBase(req);
      await wahaService.rememberPublicBaseUrl(publicBase);

      const pairs: Array<{ key: string; value: string }> = [
        { key: 'waha_mode', value: mode === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL' },
      ];

      if (mode === 'EXTERNAL') {
        const cleanUrl = (baseUrl || '').trim();
        if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) {
          return reply.status(400).send({
            success: false,
            error: 'Base URL WAHA wajib diisi dan diawali http:// atau https:// untuk mode eksternal',
          });
        }
        pairs.push({ key: 'waha_base_url', value: cleanUrl });
        if (apiKey !== undefined && apiKey !== '••••••••') {
          pairs.push({ key: 'waha_api_key', value: apiKey.trim() });
        }
      }

      if (session && session.trim()) {
        pairs.push({ key: 'waha_session', value: session.trim() });
      }

      if (webhookUrl !== undefined) {
        const cleanWebhook = String(webhookUrl || '').trim();
        if (!cleanWebhook) {
          await db.delete(systemSettings).where(eq(systemSettings.key, 'waha_webhook_url'));
        } else {
          if (!/^https?:\/\//i.test(cleanWebhook)) {
            return reply.status(400).send({
              success: false,
              error: 'URL Webhook WAHA harus diawali http:// atau https://',
            });
          }
          pairs.push({ key: 'waha_webhook_url', value: cleanWebhook });
        }
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

      void wahaService.syncSessionWebhooks(publicBase).catch(() => {});
      liveEvents.emit('waha:status', { action: 'settings', mode });
      return reply.send({ success: true, message: 'Pengaturan WAHA berhasil disimpan' });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST test WAHA connection (supports testing unsaved external URL & API Key)
  fastify.post<{
    Body: { mode?: 'INTERNAL' | 'EXTERNAL'; baseUrl?: string; apiKey?: string };
  }>('/waha/test', { preHandler: requirePermission('settings') }, async (req, reply: FastifyReply) => {
    try {
      const result = await wahaService.testConnection(req.body || {});
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(error.statusCode || 502).send({ success: false, error: error.message });
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
        channel: 'WHATSAPP',
        channelAccountId: null,
        wahaSession: null,
        lastRunDate: null,
      };

      const baseSetting = list[0] || defaultSetting;
      const [multiRow] = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, 'birthday_multi_senders'));

      let multiSenders = {
        mode: 'AUTO_MULTI',
        wahaSessions: baseSetting.wahaSession ? [baseSetting.wahaSession] : [],
        channelAccountIds: baseSetting.channelAccountId ? [baseSetting.channelAccountId] : [],
      };
      if (multiRow?.value) {
        try {
          multiSenders = { ...multiSenders, ...JSON.parse(multiRow.value) };
        } catch {
          // fallback
        }
      }

      return reply.send({
        success: true,
        data: {
          setting: { ...baseSetting, multiSenders },
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
      channel?: 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | 'THREADS' | 'TELEGRAM';
      channelAccountId?: string | null;
      wahaSession?: string | null;
      multiSenders?: {
        mode?: 'AUTO_MULTI' | 'SINGLE';
        wahaSessions?: string[];
        channelAccountIds?: string[];
      };
    };
  }>('/birthday', { preHandler: requirePermission('birthday') }, async (req, reply: FastifyReply) => {
    try {
      const {
        isEnabled,
        sendTime,
        messageTemplate,
        delaySeconds,
        channel,
        channelAccountId,
        wahaSession,
        multiSenders,
      } = req.body;
      const now = new Date();
      if (sendTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(sendTime).trim())) {
        return reply.status(400).send({
          success: false,
          error: 'Format jam kirim ulang tahun tidak valid (gunakan HH:mm)',
        });
      }

      const normalizedDelay =
        delaySeconds !== undefined && Number.isFinite(Number(delaySeconds))
          ? Math.max(0, Math.min(300, Math.round(Number(delaySeconds))))
          : undefined;

      const updateData: any = { updatedAt: now };
      if (isEnabled !== undefined) updateData.isEnabled = Boolean(isEnabled);
      if (sendTime) updateData.sendTime = String(sendTime).trim();
      if (messageTemplate !== undefined) {
        const cleanTpl = String(messageTemplate).trim();
        if (!cleanTpl) {
          return reply.status(400).send({ success: false, error: 'Template pesan ucapan tidak boleh kosong' });
        }
        updateData.messageTemplate = cleanTpl;
      }
      if (normalizedDelay !== undefined) updateData.delaySeconds = normalizedDelay;
      if (channel !== undefined) updateData.channel = channel || 'WHATSAPP';
      if (channelAccountId !== undefined) {
        updateData.channelAccountId =
          channelAccountId && channelAccountId.trim() ? channelAccountId.trim() : null;
      }
      if (wahaSession !== undefined) {
        updateData.wahaSession = wahaSession && wahaSession.trim() ? wahaSession.trim() : null;
      }

      const updated = await db
        .insert(birthdaySettings)
        .values({
          id: 'default',
          isEnabled: isEnabled !== undefined ? Boolean(isEnabled) : true,
          sendTime: sendTime ? String(sendTime).trim() : '08:00',
          messageTemplate:
            (messageTemplate && String(messageTemplate).trim()) ||
            'Halo {nama_panggilan}! Selamat ulang tahun 🎉🎂 Semoga panjang umur, sehat selalu, berkah, dan sukses selalu!',
          delaySeconds: normalizedDelay ?? 5,
          channel: channel || 'WHATSAPP',
          channelAccountId:
            channelAccountId && channelAccountId.trim() ? channelAccountId.trim() : null,
          wahaSession: wahaSession && wahaSession.trim() ? wahaSession.trim() : null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: birthdaySettings.id,
          set: updateData,
        })
        .returning();

      if (multiSenders) {
        const sanitizedMulti = {
          mode: multiSenders.mode === 'SINGLE' ? 'SINGLE' : 'AUTO_MULTI',
          wahaSessions: Array.isArray(multiSenders.wahaSessions)
            ? multiSenders.wahaSessions.map((s) => String(s).trim()).filter(Boolean)
            : [],
          channelAccountIds: Array.isArray(multiSenders.channelAccountIds)
            ? multiSenders.channelAccountIds.map((s) => String(s).trim()).filter(Boolean)
            : [],
        };
        await db
          .insert(systemSettings)
          .values({ key: 'birthday_multi_senders', value: JSON.stringify(sanitizedMulti) })
          .onConflictDoUpdate({
            target: systemSettings.key,
            set: { value: JSON.stringify(sanitizedMulti), updatedAt: now },
          });
      }

      return reply.send({
        success: true,
        message: 'Pengaturan ucapan ulang tahun berhasil disimpan',
        data: { ...updated[0], multiSenders },
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

  // POST update CRM CSAT template & SLA settings (supports partial updates)
  fastify.post('/crm', { preHandler: requirePermission('settings') }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = (req.body || {}) as {
        csatTemplate?: string;
        csatAutoOnResolve?: boolean;
        slaTargetMinutes?: number;
        csatBaseUrl?: string;
        csatSurveyConfig?: unknown;
      };
      const now = new Date();
      const pairs: Array<[string, string]> = [];

      if (body.csatTemplate !== undefined) {
        const template = String(body.csatTemplate ?? '').trim();
        if (!template) {
          return reply.status(400).send({ success: false, error: 'Template pesan CSAT tidak boleh kosong' });
        }
        pairs.push(['csat_template', template]);
      }

      if (body.slaTargetMinutes !== undefined) {
        const slaRaw = Number(body.slaTargetMinutes);
        const slaTargetMinutes = Number.isFinite(slaRaw) ? Math.max(1, Math.min(1440, Math.round(slaRaw))) : 15;
        pairs.push(['sla_target_minutes', String(slaTargetMinutes)]);
      }

      if (body.csatAutoOnResolve !== undefined) {
        pairs.push(['csat_auto_on_resolve', body.csatAutoOnResolve ? 'true' : 'false']);
      }

      if (body.csatBaseUrl !== undefined) {
        const csatBaseUrl = String(body.csatBaseUrl ?? '')
          .trim()
          .replace(/\/+$/, '');
        if (csatBaseUrl && !/^https?:\/\//i.test(csatBaseUrl)) {
          return reply.status(400).send({
            success: false,
            error: 'URL Publik CSAT harus diawali http:// atau https://',
          });
        }
        pairs.push(['csat_base_url', csatBaseUrl]);
      }

      if (body.csatSurveyConfig !== undefined) {
        const sanitizedSurvey = sanitizeCsatSurveyConfig(body.csatSurveyConfig);
        pairs.push(['csat_survey_config', JSON.stringify(sanitizedSurvey)]);
      }

      for (const [key, value] of pairs) {
        await db
          .insert(systemSettings)
          .values({ key, value, updatedAt: now })
          .onConflictDoUpdate({
            target: systemSettings.key,
            set: { value, updatedAt: now },
          });
      }

      const rows = await db.select().from(systemSettings);
      const map: Record<string, string> = {};
      for (const r of rows) map[r.key] = r.value;
      const slaRaw = Number.parseInt(map.sla_target_minutes || '15', 10);
      const slaTargetMinutes = Number.isFinite(slaRaw) && slaRaw >= 1 ? Math.min(1440, slaRaw) : 15;

      return reply.send({
        success: true,
        message: 'Pengaturan CSAT & SLA berhasil disimpan',
        data: {
          csatTemplate: map.csat_template || DEFAULT_CSAT_CTA_TEMPLATE,
          csatAutoOnResolve: map.csat_auto_on_resolve === 'true',
          slaTargetMinutes,
          csatBaseUrl: map.csat_base_url || '',
          csatSurveyConfig: parseCsatSurveyConfig(map.csat_survey_config),
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
      const now = new Date();
      const pairs: Array<[string, string]> = [];

      if (b.autoAssignMode !== undefined) {
        const autoAssignMode =
          b.autoAssignMode === 'ROUND_ROBIN' || b.autoAssignMode === 'LEAST_BUSY'
            ? b.autoAssignMode
            : 'NONE';
        pairs.push(['auto_assign_mode', autoAssignMode]);
      }

      if (b.slaAlertWebhookUrl !== undefined) {
        const webhookUrl = String(b.slaAlertWebhookUrl || '').trim();
        if (webhookUrl && !/^https?:\/\//i.test(webhookUrl)) {
          return reply.status(400).send({
            success: false,
            error: 'URL Webhook Eskalasi SLA harus diawali http:// atau https://',
          });
        }
        pairs.push(['sla_alert_webhook_url', webhookUrl]);
      }

      if (b.slaEscalationEnabled !== undefined) {
        pairs.push(['sla_escalation_enabled', b.slaEscalationEnabled === false ? 'false' : 'true']);
      }

      if (b.welcomeEnabled !== undefined) {
        pairs.push(['welcome_enabled', b.welcomeEnabled ? 'true' : 'false']);
      }
      if (b.welcomeMessage !== undefined) {
        pairs.push(['welcome_message', String(b.welcomeMessage || '').trim()]);
      }
      if (b.offhoursEnabled !== undefined) {
        pairs.push(['offhours_enabled', b.offhoursEnabled ? 'true' : 'false']);
      }
      if (b.businessHoursStart !== undefined || b.businessHoursEnd !== undefined) {
        const startHour = String(b.businessHoursStart || '08:00').trim() || '08:00';
        const endHour = String(b.businessHoursEnd || '17:00').trim() || '17:00';
        if (
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(startHour) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(endHour)
        ) {
          return reply.status(400).send({
            success: false,
            error: 'Format jam operasional harus HH:mm (contoh 08:00 - 17:00)',
          });
        }
        if (b.businessHoursStart !== undefined) pairs.push(['business_hours_start', startHour]);
        if (b.businessHoursEnd !== undefined) pairs.push(['business_hours_end', endHour]);
      }
      if (b.businessDays !== undefined) {
        const cleanDays = String(b.businessDays || '')
          .split(',')
          .map((d) => Number.parseInt(d.trim(), 10))
          .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
        pairs.push([
          'business_days',
          Array.from(new Set(cleanDays)).sort().join(',') || '1,2,3,4,5',
        ]);
      }
      if (b.offhoursMessage !== undefined) {
        pairs.push(['offhours_message', String(b.offhoursMessage || '').trim()]);
      }

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
    Body: { isActive?: boolean; keyword?: string; matchType?: string; replyText?: string; priority?: number };
  }>('/auto-replies/:id', { preHandler: requirePermission('settings') }, async (req, reply) => {
    try {
      const patch: Record<string, any> = { updatedAt: new Date() };
      if (req.body?.isActive !== undefined) patch.isActive = Boolean(req.body.isActive);
      if (req.body?.keyword !== undefined) {
        const cleanKw = String(req.body.keyword).trim();
        if (!cleanKw) {
          return reply.status(400).send({ success: false, error: 'Kata kunci tidak boleh kosong' });
        }
        patch.keyword = cleanKw;
      }
      if (req.body?.replyText !== undefined) {
        const cleanReply = String(req.body.replyText).trim();
        if (!cleanReply) {
          return reply.status(400).send({ success: false, error: 'Balasan otomatis tidak boleh kosong' });
        }
        patch.replyText = cleanReply;
      }
      if (req.body?.matchType !== undefined) {
        patch.matchType =
          req.body.matchType === 'EXACT' || req.body.matchType === 'STARTS_WITH'
            ? req.body.matchType
            : 'CONTAINS';
      }
      if (req.body?.priority !== undefined && Number.isFinite(Number(req.body.priority))) {
        patch.priority = Math.round(Number(req.body.priority));
      }

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
        const deleted = await db
          .delete(autoReplyRules)
          .where(eq(autoReplyRules.id, req.params.id))
          .returning();
        if (!deleted[0]) {
          return reply.status(404).send({ success: false, error: 'Aturan auto-reply tidak ditemukan' });
        }
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
