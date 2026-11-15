import crypto from 'crypto';
import axios from 'axios';
import { asc, eq, and, isNull, isNotNull } from 'drizzle-orm';
import { db } from '../db';
import {
  autoReplyRules,
  chatMessages,
  conversations,
  crmAgents,
  systemSettings,
} from '../db/schema';
import { getSettingMap } from '../routes/auth';
import { wahaService } from './waha.service';
import { liveEvents } from './events.service';

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
  phone: string;
  sessionName?: string | null;
  text: string;
}): Promise<void> {
  const { conversationId, contactId, phone, sessionName, text } = params;
  const now = new Date();
  const sendRes = await wahaService.sendTextMessage(phone, text, sessionName || undefined);
  const msgId = sendRes?.messageId || `auto_${crypto.randomUUID()}`;

  await db.insert(chatMessages).values({
    id: crypto.randomUUID(),
    conversationId,
    contactId,
    direction: 'OUTBOUND',
    messageType: 'TEXT',
    wahaSession: sessionName || null,
    body: text,
    wahaMessageId: msgId,
    status: 'SENT',
    ackStatus: 1,
    sentAt: now,
    createdAt: now,
  });

  await db
    .update(conversations)
    .set({
      lastMessage: text,
      lastMessageAt: now,
      firstResponseAt: now,
      updatedAt: now,
    })
    .where(eq(conversations.id, conversationId));

  liveEvents.emit('conversations:update', { conversationId });
}

export async function notifyAlertWebhook(
  event: 'sla_breach' | 'low_csat',
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const settings = await getSettingMap();
    const webhookUrl = (settings.sla_alert_webhook_url || '').trim();
    if (!webhookUrl) return;
    await axios.post(
      webhookUrl,
      {
        event,
        timestamp: new Date().toISOString(),
        ...payload,
      },
      { timeout: 5000 }
    );
  } catch (err: any) {
    console.warn(`[AlertWebhook] Failed to send ${event}:`, err.message);
  }
}

export async function handleInboundAutomation(params: {
  conversationId: string;
  contact: {
    id: string;
    namaLengkap?: string | null;
    namaPanggilan?: string | null;
    nomorWhatsapp: string;
  };
  assignedAgentId?: string | null;
  inboundBody: string;
  sessionName?: string | null;
  isNewConversation: boolean;
}): Promise<void> {
  const {
    conversationId,
    contact,
    assignedAgentId,
    inboundBody,
    sessionName,
    isNewConversation,
  } = params;

  try {
    const settings = await getSettingMap();

    // 1. Auto-Assign Agent if unassigned
    const assignMode = settings.auto_assign_mode || 'NONE';
    if (!assignedAgentId && (assignMode === 'ROUND_ROBIN' || assignMode === 'LEAST_BUSY')) {
      const activeAgents = await db
        .select()
        .from(crmAgents)
        .where(eq(crmAgents.isActive, true))
        .orderBy(asc(crmAgents.createdAt));

      if (activeAgents.length > 0) {
        let chosen = activeAgents[0];

        if (assignMode === 'ROUND_ROBIN') {
          const cursorRaw = Number.parseInt(settings.auto_assign_cursor || '0', 10);
          const nextIdx = Number.isFinite(cursorRaw) ? cursorRaw % activeAgents.length : 0;
          chosen = activeAgents[nextIdx];
          await db
            .insert(systemSettings)
            .values({
              key: 'auto_assign_cursor',
              value: String((nextIdx + 1) % activeAgents.length),
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: systemSettings.key,
              set: {
                value: String((nextIdx + 1) % activeAgents.length),
                updatedAt: new Date(),
              },
            });
        } else if (assignMode === 'LEAST_BUSY') {
          const openConvs = await db
            .select({ assignedAgentId: conversations.assignedAgentId })
            .from(conversations)
            .where(eq(conversations.status, 'OPEN'));
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

    // 2. Keyword Auto-Reply Rules
    const trimmedBody = (inboundBody || '').trim().toLowerCase();
    if (trimmedBody) {
      const rules = await db
        .select()
        .from(autoReplyRules)
        .where(eq(autoReplyRules.isActive, true))
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
            conversationId,
            contactId: contact.id,
            phone: contact.nomorWhatsapp,
            sessionName,
            text: formatPersonalization(rule.replyText, contact),
          });
          return;
        }
      }
    }

    // 3. Welcome Message for new conversations
    if (isNewConversation && settings.welcome_enabled === 'true' && settings.welcome_message?.trim()) {
      await sendAutoReplyMessage({
        conversationId,
        contactId: contact.id,
        phone: contact.nomorWhatsapp,
        sessionName,
        text: formatPersonalization(settings.welcome_message.trim(), contact),
      });
      return;
    }

    // 4. Off-Hours Auto-Reply (throttled per conversation)
    if (
      settings.offhours_enabled === 'true' &&
      settings.offhours_message?.trim() &&
      !isWithinBusinessHours(settings)
    ) {
      const lastSent = offHoursCooldown.get(conversationId) || 0;
      if (Date.now() - lastSent > OFF_HOURS_COOLDOWN_MS) {
        offHoursCooldown.set(conversationId, Date.now());
        await sendAutoReplyMessage({
          conversationId,
          contactId: contact.id,
          phone: contact.nomorWhatsapp,
          sessionName,
          text: formatPersonalization(settings.offhours_message.trim(), contact),
        });
      }
    }
  } catch (err: any) {
    console.warn('[AutomationService] Inbound automation error:', err.message);
  }
}

let slaTimer: NodeJS.Timeout | null = null;

export function startSlaMonitor(): void {
  if (slaTimer) return;
  slaTimer = setInterval(async () => {
    try {
      const settings = await getSettingMap();
      if (settings.sla_escalation_enabled === 'false') return;
      const slaRaw = Number.parseInt(settings.sla_target_minutes || '15', 10);
      const slaMinutes = Number.isFinite(slaRaw) && slaRaw >= 1 ? Math.min(1440, slaRaw) : 15;
      const cutoff = Date.now() - slaMinutes * 60 * 1000;

      const openUnanswered = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.status, 'OPEN'),
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
        });
        await notifyAlertWebhook('sla_breach', {
          conversationId: conv.id,
          contactId: conv.contactId,
          assignedAgentName: conv.assignedAgentName,
          waitingMinutes,
          slaTargetMinutes: slaMinutes,
        });
      }
    } catch (err: any) {
      console.warn('[SlaMonitor] Check failed:', err.message);
    }
  }, 60_000);
}
