import crypto from 'crypto';
import axios from 'axios';
import { asc, desc, eq, and, ne, isNull, isNotNull, sql, inArray, lt } from 'drizzle-orm';
import { db } from '../db';
import {
  autoReplyRules,
  chatMessages,
  contacts,
  conversations,
  crmAgents,
  csatResponses,
  webhookDeliveries,
} from '../db/schema';
import { getSettingMap } from '../routes/auth';
import { readUploadedMediaAsDataUri } from '../routes/media';
import {
  AiConversationTurn,
  AiQueuedOutboundMedia,
  generateAiAgentReply,
  getAiAgentConfig,
  isAiAllowedForDm,
} from './ai.service';
import { wahaService } from './waha.service';
import { OmnichannelType, sendOutboundChannelMessage } from './channel.service';
import { liveEvents } from './events.service';
import { getActiveCompanyId, listActiveCompanyIds, runWithCompany, upsertCompanySetting } from './tenantContext';
import { sendCsatCtaForConversation, recordConversationActivity } from './csatSender.service';

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
  replyToMessageId?: string | null;
  outboundMedia?: AiQueuedOutboundMedia[];
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
    replyToMessageId,
    outboundMedia,
  } = params;
  const now = new Date();
  let msgId: string | null = `auto_${crypto.randomUUID()}`;
  let sendSucceeded = true;
  let effectiveSession: string | null = channel === 'WHATSAPP' ? sessionName || null : null;
  let sendError: string | null = null;
  let resolvedReplyToId: string | null = null;
  let resolvedWahaReplyTo: string | undefined;

  if (replyToMessageId) {
    const [quotedRow] = await db
      .select({
        id: chatMessages.id,
        wahaMessageId: chatMessages.wahaMessageId,
      })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.conversationId, conversationId),
          eq(chatMessages.id, replyToMessageId)
        )
      )
      .limit(1);
    if (quotedRow) {
      resolvedReplyToId = quotedRow.id;
      resolvedWahaReplyTo = quotedRow.wahaMessageId || undefined;
    }
  }

  if (channel === 'WHATSAPP') {
    const targetWa = phone || externalThreadId;
    if (!targetWa) return;
    const sendRes = await wahaService.sendTextMessage(
      targetWa,
      text,
      sessionName || undefined,
      resolvedWahaReplyTo ? { replyTo: resolvedWahaReplyTo } : undefined
    );
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
    senderName: 'Agent AI',
    body: text,
    replyToMessageId: resolvedReplyToId,
    metadataJson: JSON.stringify({ sentVia: 'AI_BOT', sentViaLabel: 'Bot AI' }),
    wahaMessageId: channel === 'WHATSAPP' ? msgId : null,
    status: sendSucceeded ? 'SENT' : 'FAILED',
    ackStatus: sendSucceeded ? 1 : -1,
    errorMessage: sendError,
    sentAt: sendSucceeded ? now : null,
    createdAt: now,
  });

  if (Array.isArray(outboundMedia) && outboundMedia.length > 0 && channel === 'WHATSAPP') {
    const targetWa = phone || externalThreadId;
    if (targetWa) {
      for (const item of outboundMedia) {
        try {
          const loaded = await readUploadedMediaAsDataUri(item.mediaUrl, item.mimeType);
          if (!loaded) continue;
          const mediaSendRes = await wahaService.sendMediaMessage(
            targetWa,
            {
              base64: loaded.dataUri,
              mimetype: loaded.mimetype,
              filename: item.fileName || 'media.jpg',
              caption: item.caption || '',
              asDocument: item.asDocument,
            },
            effectiveSession || sessionName || undefined
          );
          const msgType = item.asDocument
            ? 'DOCUMENT'
            : item.mediaType === 'image'
              ? 'IMAGE'
              : item.mediaType === 'video'
                ? 'VIDEO'
                : item.mediaType === 'audio'
                  ? 'AUDIO'
                  : 'DOCUMENT';
          await db.insert(chatMessages).values({
            id: crypto.randomUUID(),
            companyId: getActiveCompanyId(),
            conversationId,
            contactId,
            direction: 'OUTBOUND',
            messageType: msgType,
            channel,
            wahaSession: mediaSendRes.sessionUsed || effectiveSession,
            senderName: 'Agent AI',
            body: item.caption || item.fileName,
            mediaUrl: item.mediaUrl,
            mediaType: loaded.mimetype,
            mediaName: item.fileName,
            metadataJson: JSON.stringify({ sentVia: 'AI_BOT', sentViaLabel: 'Bot AI' }),
            wahaMessageId: mediaSendRes.success ? mediaSendRes.messageId || null : null,
            status: mediaSendRes.success ? 'SENT' : 'FAILED',
            ackStatus: mediaSendRes.success ? 1 : -1,
            errorMessage: mediaSendRes.success ? null : mediaSendRes.error || null,
            sentAt: mediaSendRes.success ? new Date() : null,
            createdAt: new Date(),
          });
        } catch (mediaErr: any) {
          console.warn('[AutomationService] Failed to send AI outbound media:', mediaErr?.message);
        }
      }
    }
  }

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
  isGroup?: boolean;
  isExcluded?: boolean;
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
    isGroup = false,
    isExcluded = false,
    companyId: companyIdParam,
  } = params;

  const resolvedCompanyId = getActiveCompanyId(companyIdParam);
  return runWithCompany(resolvedCompanyId, async () => {
  try {
    const settings = await getSettingMap(resolvedCompanyId);

    // 1. Auto-Assign Agent if unassigned (only assign to ONLINE / ready agents, skip AWAY/OFFLINE, skip groups & non-penilaian)
    const assignMode = settings.auto_assign_mode || 'NONE';
    if (!isGroup && !isExcluded && !assignedAgentId && (assignMode === 'ROUND_ROBIN' || assignMode === 'LEAST_BUSY')) {
      const allActiveAgents = await db
        .select()
        .from(crmAgents)
        .where(and(eq(crmAgents.companyId, getActiveCompanyId()), eq(crmAgents.isActive, true)))
        .orderBy(asc(crmAgents.createdAt));

      const activeAgents = allActiveAgents.filter(
        (a) => (a.availabilityStatus || 'ONLINE').toUpperCase() === 'ONLINE'
      );

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
      phone: isGroup ? null : contact.nomorWhatsapp,
      sessionName,
    };

    if (channel === 'WHATSAPP' && !contact.nomorWhatsapp && !externalThreadId) return;

    // 2. Keyword Auto-Reply Rules (WhatsApp & Omnichannel)
    const trimmedBody = (inboundBody || '').trim().toLowerCase();
    if (trimmedBody && !isGroup && !isExcluded) {
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
    if (!isGroup && !isExcluded && isNewConversation && settings.welcome_enabled === 'true' && settings.welcome_message?.trim()) {
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
        const [convState] = await db
          .select({
            escalatedAt: conversations.escalatedAt,
            assignedAgentId: conversations.assignedAgentId,
            status: conversations.status,
          })
          .from(conversations)
          .where(eq(conversations.id, conversationId))
          .limit(1);
        const isHandledByHuman = Boolean(convState?.escalatedAt || convState?.assignedAgentId);
        if (
          aiCfg.enabled &&
          aiCfg.autoReplyDm &&
          !isHandledByHuman &&
          convState?.status !== 'RESOLVED' &&
          (!isExcluded || aiCfg.replyToNonPenilaian !== false) &&
          isAiAllowedForDm(aiCfg, channel, sessionName, isGroup) &&
          (!isGroup ||
            !aiCfg.groupMentionOnly ||
            inboundBody.toLowerCase().includes(aiCfg.name.trim().toLowerCase()))
        ) {
          const maxHist = Math.max(2, Math.min(100, aiCfg.maxHistoryMessages || 20));
          const recentRows = await db
            .select({
              id: chatMessages.id,
              direction: chatMessages.direction,
              messageType: chatMessages.messageType,
              body: chatMessages.body,
              mediaUrl: chatMessages.mediaUrl,
              mediaName: chatMessages.mediaName,
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
            .limit(maxHist + 1);

          const trimmedInbound = inboundBody.trim();
          const latestRow = recentRows[0];
          const isLatestSameInbound =
            latestRow?.direction === 'INBOUND' &&
            String(latestRow?.body || '').trim() === trimmedInbound;
          const priorTurnsRaw = recentRows.slice(isLatestSameInbound ? 1 : 0);

          const history: AiConversationTurn[] = priorTurnsRaw
            .slice(0, maxHist)
            .reverse()
            .filter((r) => Boolean(String(r.body || '').trim() || r.mediaUrl))
            .map((r) => {
              const rawText = String(r.body || '').trim();
              const mediaTag =
                r.messageType !== 'TEXT' && (r.mediaName || r.mediaUrl)
                  ? `[Lampiran ${r.messageType}: ${r.mediaName || r.mediaUrl} | ID: ${r.id}] `
                  : '';
              return {
                id: r.id,
                role: r.direction === 'OUTBOUND' ? 'assistant' : 'user',
                content: `${mediaTag}${rawText}`.trim(),
                mediaName: r.mediaName,
                mediaType: r.messageType,
              };
            });

          let latestImageDataUri: string | null = null;
          let latestMediaName: string | null = null;
          if (
            isLatestSameInbound &&
            latestRow?.messageType === 'IMAGE' &&
            latestRow?.mediaUrl
          ) {
            const loaded = await readUploadedMediaAsDataUri(latestRow.mediaUrl).catch(() => null);
            if (loaded && loaded.mimetype.startsWith('image/')) {
              latestImageDataUri = loaded.dataUri;
              latestMediaName = latestRow.mediaName || 'foto-pelanggan.jpg';
            }
          }

          const waTypingTarget =
            channel === 'WHATSAPP' && aiCfg.humanTyping !== false
              ? (isGroup ? externalThreadId : contact.nomorWhatsapp || externalThreadId) || null
              : null;
          const aiStartedAt = Date.now();
          if (waTypingTarget) {
            // Tampilkan status "sedang mengetik..." tanpa sendSeen dulu agar pesan tidak tertandai dibaca jika AI gagal / tidak membalas
            await wahaService.setTyping(waTypingTarget, true, sessionName || undefined).catch(() => {});
          }
          // Pancarkan informasi real-time ke Live Chat CRM bahwa AI sedang berpikir & menyusun balasan
          liveEvents.emit('conversations:ai_typing', {
            conversationId,
            isTyping: true,
            aiName: aiCfg.name || 'Agent AI',
          });

          let aiResult: Awaited<ReturnType<typeof generateAiAgentReply>>;
          try {
            aiResult = await generateAiAgentReply(trimmedInbound, {
              configOverride: aiCfg,
              history,
              imageUrl: latestImageDataUri,
              mediaName: latestMediaName,
              conversationId,
              contactName: contact.namaPanggilan || contact.namaLengkap || null,
              contactPhone: contact.nomorWhatsapp || null,
              channel,
            });
          } catch (genErr) {
            if (waTypingTarget) {
              await wahaService.setTyping(waTypingTarget, false, sessionName || undefined).catch(() => {});
            }
            liveEvents.emit('conversations:ai_typing', {
              conversationId,
              isTyping: false,
              aiName: aiCfg.name || 'Agent AI',
            });
            throw genErr;
          }
          if (aiResult.reply) {
            if (waTypingTarget) {
              // Durasi mengetik menyesuaikan panjang balasan (maks. 8 detik, termasuk waktu AI berpikir)
              const typingMs = Math.min(8000, Math.max(1500, aiResult.reply.length * 35));
              const remainingMs = typingMs - (Date.now() - aiStartedAt);
              if (remainingMs > 0) await new Promise((resolve) => setTimeout(resolve, remainingMs));
              // Tandai pesan dibaca (centang 2 biru) sesaat sebelum balasan terkirim
              await wahaService.sendSeen(waTypingTarget, sessionName || undefined).catch(() => {});
            }
            try {
              // 1. Kirim pesan balasan ke pelanggan terlebih dahulu
              await sendAutoReplyMessage({
                ...replyBase,
                text: aiResult.reply,
                replyToMessageId: aiResult.replyToMessageId || null,
                outboundMedia: aiResult.outboundMedia,
              });

              // 2. Setelah pesan terkirim, baru buat catatan internal dan linimasa aktivitas perpindahan tugas
              if (aiResult.escalation?.executeHandoverNotes) {
                await aiResult.escalation.executeHandoverNotes().catch((err: any) => {
                  console.error('[AutomationService] Failed to execute deferred escalation note:', err);
                });
              }
            } finally {
              if (waTypingTarget) {
                await wahaService.setTyping(waTypingTarget, false, sessionName || undefined).catch(() => {});
              }
              liveEvents.emit('conversations:ai_typing', {
                conversationId,
                isTyping: false,
                aiName: aiCfg.name || 'Agent AI',
              });
            }
            return;
          }
          if (waTypingTarget) {
            await wahaService.setTyping(waTypingTarget, false, sessionName || undefined).catch(() => {});
          }
          liveEvents.emit('conversations:ai_typing', {
            conversationId,
            isTyping: false,
            aiName: aiCfg.name || 'Agent AI',
          });
          if (aiResult.escalation?.executeHandoverNotes) {
            await aiResult.escalation.executeHandoverNotes().catch(() => {});
          }
        }
      } catch (aiErr: any) {
        console.warn('[AutomationService] AI auto-reply skipped:', aiErr.message);
      }
    }

    // 5. Off-Hours Auto-Reply (throttled per conversation)
    if (
      !isGroup &&
      !isExcluded &&
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

let inactivityTimer: NodeJS.Timeout | null = null;

export function startInactivityAutoResolveMonitor(): void {
  if (inactivityTimer) return;
  // Periksa setiap 60 detik
  inactivityTimer = setInterval(async () => {
    try {
      const companyIds = await listActiveCompanyIds();
      for (const cid of companyIds) {
        await runWithCompany(cid, () => runInactivityAutoResolveForCompany(cid));
      }
    } catch (err: any) {
      console.warn('[InactivityAutoResolve] Check failed:', err.message);
    }
  }, 60_000);
}

export function shouldAutoResolveByLastDirection(
  lastChatDirection: string | null | undefined
): boolean {
  return String(lastChatDirection || '').toUpperCase() === 'OUTBOUND';
}

export function shouldSendCsatOnAutoResolve(params: {
  settingEnabled: boolean;
  csatSentAt?: Date | string | null;
  lastInboundAt?: Date | string | null;
}): boolean {
  if (!params.settingEnabled) return false;
  if (!params.csatSentAt) return true;
  const sentMs = new Date(params.csatSentAt).getTime();
  if (Number.isNaN(sentMs)) return true;
  if (!params.lastInboundAt) return false;
  const inbMs = new Date(params.lastInboundAt).getTime();
  if (Number.isNaN(inbMs)) return false;
  return sentMs < inbMs;
}

export async function runInactivityAutoResolveForCompany(companyId: string): Promise<number> {
  let resolvedCount = 0;
  try {
    const settings = await getSettingMap(companyId);
    if (settings.auto_resolve_inactivity_enabled !== 'true') return 0;

    const hoursRaw = Number.parseInt(settings.auto_resolve_inactivity_hours || '24', 10);
    const inactivityHours = Number.isFinite(hoursRaw) && hoursRaw >= 1 ? Math.min(168, hoursRaw) : 24;
    const cutoffDate = new Date(Date.now() - inactivityHours * 3600 * 1000);

    const candidates = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.companyId, companyId),
          inArray(conversations.status, ['OPEN', 'PENDING']),
          eq(conversations.excludeFromMetrics, false),
          eq(conversations.isGroup, false),
          isNotNull(conversations.lastMessageAt),
          lt(conversations.lastMessageAt, cutoffDate)
        )
      );

    if (candidates.length === 0) return 0;

    const shouldSendCsatSetting = settings.auto_resolve_inactivity_send_csat !== 'false';

    for (const conv of candidates) {
      // Verifikasi pesan chat terakhir (abaikan log SYSTEM agar tidak salah resolve chat pelanggan yang belum dibalas)
      const lastMessages = await db
        .select({ direction: chatMessages.direction })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.conversationId, conv.id),
            inArray(chatMessages.direction, ['INBOUND', 'OUTBOUND'])
          )
        )
        .orderBy(desc(chatMessages.createdAt))
        .limit(1);

      if (!shouldAutoResolveByLastDirection(lastMessages[0]?.direction)) {
        continue;
      }

      const now = new Date();

      await db
        .update(conversations)
        .set({
          status: 'RESOLVED',
          resolvedAt: now,
          updatedAt: now,
        })
        .where(eq(conversations.id, conv.id));

      resolvedCount++;

      // Kirim survei CSAT otomatis jika opsi diaktifkan dan belum terkirim pada siklus ini
      let csatOutcome = 'tanpa CSAT';
      let lastCsatSentAt: Date | null = null;
      if (shouldSendCsatSetting) {
        const [latestCsat] = await db
          .select({ sentAt: csatResponses.sentAt })
          .from(csatResponses)
          .where(eq(csatResponses.conversationId, conv.id))
          .orderBy(desc(csatResponses.sentAt))
          .limit(1);
        lastCsatSentAt = latestCsat?.sentAt ?? null;
      }
      const shouldSendCsat = shouldSendCsatOnAutoResolve({
        settingEnabled: shouldSendCsatSetting,
        csatSentAt: lastCsatSentAt,
        lastInboundAt: conv.lastInboundAt,
      });
      if (shouldSendCsat) {
        const [contact] = await db
          .select()
          .from(contacts)
          .where(and(eq(contacts.id, conv.contactId), eq(contacts.companyId, companyId)));

        if (contact) {
          try {
            const refreshedConv = { ...conv, status: 'RESOLVED' as const, resolvedAt: now };
            await sendCsatCtaForConversation(refreshedConv, contact, {
              triggerType: 'AUTO_RESOLVE',
            });
            csatOutcome = 'survei CSAT terkirim';
          } catch (csatErr: any) {
            csatOutcome = `gagal kirim CSAT: ${csatErr.message}`;
            console.warn('[InactivityAutoResolve] Failed to send CSAT for conv', conv.id, csatErr.message);
          }
        }
      }

      // Catat di linimasa percakapan
      await recordConversationActivity({
        companyId,
        conversationId: conv.id,
        contactId: conv.contactId,
        wahaSession: conv.wahaSession,
        channel: conv.channel,
        actorName: 'Otomasi Sistem',
        actorRole: 'System',
        action: 'AUTO_RESOLVED_INACTIVITY',
        summary: `Obrolan diselesaikan otomatis karena pelanggan tidak merespon selama ${inactivityHours} jam (${csatOutcome})`,
        createdAt: now,
      });

      liveEvents.emit('conversations:update', { conversationId: conv.id }, companyId);
      liveEvents.emit('tracking:update', { conversationId: conv.id }, companyId);
    }
  } catch (err: any) {
    console.warn('[InactivityAutoResolve] Error processing auto-resolve:', err.message);
  }
  return resolvedCount;
}
