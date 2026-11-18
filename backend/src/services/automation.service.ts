import crypto from 'crypto';
import axios from 'axios';
import { asc, desc, eq, and, ne, isNull, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  autoReplyRules,
  chatMessages,
  conversations,
  crmAgents,
  webhookDeliveries,
} from '../db/schema';
import { getSettingMap } from '../routes/auth';
import {
  AiConversationTurn,
  generateAiAgentReply,
  getAiAgentConfig,
} from './ai.service';
import { wahaService } from './waha.service';
import { OmnichannelType, sendOutboundChannelMessage } from './channel.service';
import { liveEvents } from './events.service';
import { getActiveCompanyId, listActiveCompanyIds, runWithCompany, upsertCompanySetting } from './tenantContext';

const offHoursCooldown = new Map<string, number>();
const slaAlertedAt = new Map<string, number>();
const OFF_HOURS_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const SLA_ALERT_COOLDOWN_MS = 30 * 60 * 1000;

function formatPersonalization(
  template: string,
  contact: { namaLengkap?: string | null; namaPanggilan?: string | null }
): string {
  const fullName = contact.namaLengkap || 'Pelanggan';
  const nickName = contact.namaPanggilan || fullName.split(' ')[0] || 'Kak';
  return template
    .replace(/\{nama_lengkap\}/gi, fullName)
    .replace(/\{nama_panggilan\}/gi, nickName);
}

function isWithinBusinessHours(settings: Record<string, string>, now = new Date()): boolean {
  // Use Asia/Jakarta (WIB, UTC+7) as default operational timezone if TZ not overridden
  const localStr = now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
  const local = new Date(localStr);
  const day = local.getDay(); // 0=Sun..6=Sat
  const daysRaw = (settings.business_days || '1,2,3,4,5')
    .split(',')
    .map((d) => Number.parseInt(d.trim(), 10))
    .filter((d) => Number.isFinite(d));

  if (daysRaw.length > 0 && !daysRaw.includes(day)) {
    return false;
  }

  const startStr = settings.business_hours_start || '08:00';
  const endStr = settings.business_hours_end || '17:00';
  const [sh, sm] = startStr.split(':').map((n) => Number.parseInt(n, 10) || 0);
  const [eh, em] = endStr.split(':').map((n) => Number.parseInt(n, 10) || 0);

  const curMins = local.getHours() * 60 + local.getMinutes();
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;

  if (endMins >= startMins) {
    return curMins >= startMins && curMins <= endMins;
  }
  return curMins >= startMins || curMins <= endMins;
}

async function sendAutoReplyMessage(params: {
  conversationId: string;
  contactId: string;
  channel: OmnichannelType;
  channelAccountId?: string | null;
  externalThreadId?: string | null;
  phone?: string | null;
  sessionName?: string | null;
  text: string;
}): Promise<void> {
  const {
    conversationId,
    contactId,
    channel,
    channelAccountId,
    externalThreadId,
    phone,
    sessionName,
    text,
  } = params;
  const now = new Date();
  let msgId: string | null = `auto_${crypto.randomUUID()}`;
  let sendSucceeded = true;
  let effectiveSession: string | null = channel === 'WHATSAPP' ? sessionName || null : null;
  let sendError: string | null = null;

  if (channel === 'WHATSAPP') {
    const targetWa = phone || externalThreadId;
    if (!targetWa) return;
    const sendRes = await wahaService.sendTextMessage(targetWa, text, sessionName || undefined);
    sendSucceeded = sendRes.success;
    msgId = sendRes.success ? sendRes.messageId || msgId : null;
    effectiveSession = sendRes.sessionUsed || sessionName || null;
    sendError = sendRes.success ? null : sendRes.error || 'Auto-reply WhatsApp gagal terkirim';
  } else {
    const out = await sendOutboundChannelMessage({
      channel,
      channelAccountId,
      contactId,
      externalThreadId,
      text,
    });
    if (out.externalMessageId) {
      msgId = out.externalMessageId;
    }
  }

  await db.insert(chatMessages).values({
    id: crypto.randomUUID(),
    companyId: getActiveCompanyId(),
    conversationId,
    contactId,
    direction: 'OUTBOUND',
    messageType: 'TEXT',
    channel,
    externalMessageId: channel === 'WHATSAPP' ? null : msgId,
    wahaSession: channel === 'WHATSAPP' ? effectiveSession : null,
    body: text,
    wahaMessageId: channel === 'WHATSAPP' ? msgId : null,
    status: sendSucceeded ? 'SENT' : 'FAILED',
    ackStatus: sendSucceeded ? 1 : -1,
    errorMessage: sendError,
    sentAt: sendSucceeded ? now : null,
    createdAt: now,
  });

  if (sendSucceeded) {
    await db
      .update(conversations)
      .set({
        wahaSession: effectiveSession || undefined,
        lastMessage: text,
        lastMessageAt: now,
        firstResponseAt: sql`COALESCE(${conversations.firstResponseAt}, ${now})`,
        updatedAt: now,
      })
      .where(eq(conversations.id, conversationId));
  }

  liveEvents.emit('conversations:update', { conversationId, channel });
}

export async function notifyAlertWebhook(
  event: 'sla_breach' | 'low_csat' | 'test_ping',
  payload: Record<string, unknown>,
  companyIdArg?: string
): Promise<{ delivered: boolean; httpStatus?: number; error?: string }> {
  const settings = await getSettingMap(getActiveCompanyId(companyIdArg));
  const webhookUrl = (settings.sla_alert_webhook_url || '').trim();
  if (!webhookUrl) {
    return { delivered: false, error: 'URL Webhook Alert belum dikonfigurasi' };
  }
  const summary = JSON.stringify(payload).slice(0, 300);
  try {
    const res = await axios.post(
      webhookUrl,
      {
        event,
        timestamp: new Date().toISOString(),
        ...payload,
      },
      { timeout: 5000 }
    );
    await db.insert(webhookDeliveries).values({
      id: crypto.randomUUID(),
      companyId: getActiveCompanyId(companyIdArg),
      event,
      targetUrl: webhookUrl,
      status: 'SUCCESS',
      httpStatus: res.status,
      errorMessage: null,
      payloadSummary: summary,
      createdAt: new Date(),
    });
    return { delivered: true, httpStatus: res.status };
  } catch (err: any) {
    const httpStatus = err?.response?.status ?? null;
    const errMsg = String(err?.message || 'Webhook request failed');
    await db
      .insert(webhookDeliveries)
      .values({
        id: crypto.randomUUID(),
        companyId: getActiveCompanyId(companyIdArg),
        event,
        targetUrl: webhookUrl,
        status: 'FAILED',
        httpStatus,
        errorMessage: errMsg,
        payloadSummary: summary,
        createdAt: new Date(),
      })
      .catch(() => {});
    console.warn(`[AlertWebhook] Failed to send ${event}:`, errMsg);
    return { delivered: false, httpStatus: httpStatus ?? undefined, error: errMsg };
  }
}

export async function handleInboundAutomation(params: {
  conversationId: string;
  contact: {
    id: string;
    namaLengkap?: string | null;
    namaPanggilan?: string | null;
    nomorWhatsapp?: string | null;
  };
  assignedAgentId?: string | null;
  inboundBody: string;
  channel?: OmnichannelType;
  channelAccountId?: string | null;
  externalThreadId?: string | null;
  sessionName?: string | null;
  isNewConversation: boolean;
  companyId?: string;
}): Promise<void> {
  const {
    conversationId,
    contact,
    assignedAgentId,
    inboundBody,
    channel = 'WHATSAPP',
    channelAccountId = null,
    externalThreadId = null,
    sessionName,
    isNewConversation,
    companyId: companyIdParam,
  } = params;

  const resolvedCompanyId = getActiveCompanyId(companyIdParam);
  return runWithCompany(resolvedCompanyId, async () => {
  try {
    const settings = await getSettingMap(resolvedCompanyId);

    // 1. Auto-Assign Agent if unassigned
    const assignMode = settings.auto_assign_mode || 'NONE';
    if (!assignedAgentId && (assignMode === 'ROUND_ROBIN' || assignMode === 'LEAST_BUSY')) {
      const activeAgents = await db
        .select()
        .from(crmAgents)
        .where(and(eq(crmAgents.companyId, getActiveCompanyId()), eq(crmAgents.isActive, true)))
        .orderBy(asc(crmAgents.createdAt));

      if (activeAgents.length > 0) {
        let chosen = activeAgents[0];

        if (assignMode === 'ROUND_ROBIN') {
          const cursorRaw = Number.parseInt(settings.auto_assign_cursor || '0', 10);
          const nextIdx = Number.isFinite(cursorRaw) ? cursorRaw % activeAgents.length : 0;
          chosen = activeAgents[nextIdx];
          await upsertCompanySetting('auto_assign_cursor', String((nextIdx + 1) % activeAgents.length));
        } else if (assignMode === 'LEAST_BUSY') {
          const openConvs = await db
            .select({ assignedAgentId: conversations.assignedAgentId })
            .from(conversations)
            .where(and(eq(conversations.companyId, getActiveCompanyId()), eq(conversations.status, 'OPEN')));
          const counts = new Map<string, number>();
          for (const c of openConvs) {
            if (c.assignedAgentId) {
              counts.set(c.assignedAgentId, (counts.get(c.assignedAgentId) || 0) + 1);
            }
          }
          chosen = activeAgents.reduce((best, cur) => {
            const bestCount = counts.get(best.id) || 0;
            const curCount = counts.get(cur.id) || 0;
            return curCount < bestCount ? cur : best;
          }, activeAgents[0]);
        }

        await db
          .update(conversations)
          .set({
            assignedAgentId: chosen.id,
            assignedAgentName: chosen.name,
            updatedAt: new Date(),
          })
          .where(eq(conversations.id, conversationId));
        liveEvents.emit('conversations:update', { conversationId });
      }
    }

    const replyBase = {
      conversationId,
      contactId: contact.id,
      channel,
      channelAccountId,
      externalThreadId,
      phone: contact.nomorWhatsapp,
      sessionName,
    };

    if (channel === 'WHATSAPP' && !contact.nomorWhatsapp && !externalThreadId) return;

    // 2. Keyword Auto-Reply Rules (WhatsApp & Omnichannel)
    const trimmedBody = (inboundBody || '').trim().toLowerCase();
    if (trimmedBody) {
      const rules = await db
        .select()
        .from(autoReplyRules)
        .where(and(eq(autoReplyRules.companyId, getActiveCompanyId()), eq(autoReplyRules.isActive, true)))
        .orderBy(asc(autoReplyRules.priority), asc(autoReplyRules.createdAt));

      for (const rule of rules) {
        const kw = rule.keyword.trim().toLowerCase();
        if (!kw) continue;
        let matched = false;
        if (rule.matchType === 'EXACT') matched = trimmedBody === kw;
        else if (rule.matchType === 'STARTS_WITH') matched = trimmedBody.startsWith(kw);
        else matched = trimmedBody.includes(kw);

        if (matched) {
          await sendAutoReplyMessage({
            ...replyBase,
            text: formatPersonalization(rule.replyText, contact),
          });
          return;
        }
      }
    }

    // 3. Welcome Message for new conversations
    if (isNewConversation && settings.welcome_enabled === 'true' && settings.welcome_message?.trim()) {
      await sendAutoReplyMessage({
        ...replyBase,
        text: formatPersonalization(settings.welcome_message.trim(), contact),
      });
      return;
    }

    // 4. AI Agent DM Auto-Reply (if enabled + autoReplyDm)
    if (inboundBody.trim()) {
      try {
        const aiCfg = await getAiAgentConfig();
        if (aiCfg.enabled && aiCfg.autoReplyDm) {
          const recentRows = await db
            .select({
              direction: chatMessages.direction,
              body: chatMessages.body,
            })
            .from(chatMessages)
            .where(
              and(
                eq(chatMessages.conversationId, conversationId),
                ne(chatMessages.messageType, 'NOTE'),
                ne(chatMessages.messageType, 'ACTIVITY')
              )
            )
            .orderBy(desc(chatMessages.createdAt))
            .limit(7);

          const trimmedInbound = inboundBody.trim();
          const priorTurnsRaw = recentRows.slice(
            recentRows[0]?.direction === 'INBOUND' &&
              String(recentRows[0]?.body || '').trim() === trimmedInbound
              ? 1
              : 0
          );
          const history: AiConversationTurn[] = priorTurnsRaw
            .slice(0, 6)
            .reverse()
            .filter((r) => Boolean(String(r.body || '').trim()))
            .map((r) => ({
              role: r.direction === 'OUTBOUND' ? 'assistant' : 'user',
              content: String(r.body || '').trim(),
            }));

          const aiResult = await generateAiAgentReply(trimmedInbound, {
            configOverride: aiCfg,
            history,
            conversationId,
            contactName: contact.namaPanggilan || contact.namaLengkap || null,
            channel,
          });
          if (aiResult.reply) {
            await sendAutoReplyMessage({
              ...replyBase,
              text: aiResult.reply,
            });
            return;
          }
        }
      } catch (aiErr: any) {
        console.warn('[AutomationService] AI auto-reply skipped:', aiErr.message);
      }
    }

    // 5. Off-Hours Auto-Reply (throttled per conversation)
    if (
      settings.offhours_enabled === 'true' &&
      settings.offhours_message?.trim() &&
      !isWithinBusinessHours(settings)
    ) {
      const lastSent = offHoursCooldown.get(conversationId) || 0;
      if (Date.now() - lastSent > OFF_HOURS_COOLDOWN_MS) {
        offHoursCooldown.set(conversationId, Date.now());
        await sendAutoReplyMessage({
          ...replyBase,
          text: formatPersonalization(settings.offhours_message.trim(), contact),
        });
      }
    }
  } catch (err: any) {
    console.warn('[AutomationService] Inbound automation error:', err.message);
  }
  }); // end runWithCompany
}

let slaTimer: NodeJS.Timeout | null = null;

export function startSlaMonitor(): void {
  if (slaTimer) return;
  slaTimer = setInterval(async () => {
    try {
      const companyIds = await listActiveCompanyIds();
      for (const cid of companyIds) {
        await runWithCompany(cid, () => runSlaCheckForCompany(cid));
      }
    } catch (err: any) {
      console.warn('[SlaMonitor] Check failed:', err.message);
    }
  }, 60_000);
}

async function runSlaCheckForCompany(companyId: string): Promise<void> {
  try {
    const settings = await getSettingMap(companyId);
    if (settings.sla_escalation_enabled === 'false') return;
    const slaRaw = Number.parseInt(settings.sla_target_minutes || '15', 10);
    const slaMinutes = Number.isFinite(slaRaw) && slaRaw >= 1 ? Math.min(1440, slaRaw) : 15;
    const cutoff = Date.now() - slaMinutes * 60 * 1000;

    const openUnanswered = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.companyId, companyId),
          eq(conversations.status, 'OPEN'),
          eq(conversations.excludeFromMetrics, false),
          eq(conversations.isGroup, false),
          isNotNull(conversations.firstInboundAt),
          isNull(conversations.firstResponseAt)
        )
      );

    for (const conv of openUnanswered) {
      if (!conv.firstInboundAt) continue;
      const inboundMs = new Date(conv.firstInboundAt).getTime();
      if (inboundMs > cutoff) continue;

      const lastAlert = slaAlertedAt.get(conv.id) || 0;
      if (Date.now() - lastAlert < SLA_ALERT_COOLDOWN_MS) continue;
      slaAlertedAt.set(conv.id, Date.now());

      const waitingMinutes = Math.round((Date.now() - inboundMs) / 60000);
      liveEvents.emit('sla:breach', {
        conversationId: conv.id,
        waitingMinutes,
        slaTargetMinutes: slaMinutes,
      }, companyId);
      await notifyAlertWebhook('sla_breach', {
        conversationId: conv.id,
        contactId: conv.contactId,
        assignedAgentName: conv.assignedAgentName,
        waitingMinutes,
        slaTargetMinutes: slaMinutes,
      }, companyId);
    }
  } catch (err: any) {
    console.warn('[SlaMonitor] Check failed:', err.message);
  }
}
