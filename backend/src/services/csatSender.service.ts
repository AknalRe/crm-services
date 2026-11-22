import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import {
  chatMessages,
  contactIdentities,
  contacts,
  conversations,
  csatResponses,
} from '../db/schema';
import { wahaService } from './waha.service';
import { OmnichannelType, sendOutboundChannelMessage } from './channel.service';
import {
  buildCsatSnapshot,
  DEFAULT_CSAT_CTA_TEMPLATE,
  parseCsatSurveyConfig,
  resolveCsatProfileForConversation,
} from './csat.service';
import { liveEvents } from './events.service';
import { getActiveCompanyId, getCompanySettingMap } from './tenantContext';

export async function resolveWhatsAppTarget(
  conv: typeof conversations.$inferSelect,
  contact: typeof contacts.$inferSelect
): Promise<string | null> {
  if (conv.externalThreadId && conv.externalThreadId.toLowerCase().endsWith('@g.us')) {
    return conv.externalThreadId.trim();
  }
  if (contact.nomorWhatsapp && contact.nomorWhatsapp.trim()) {
    return contact.nomorWhatsapp.trim();
  }
  if (conv.externalThreadId && conv.externalThreadId.trim()) {
    return conv.externalThreadId.trim();
  }
  const idRows = await db
    .select({ externalId: contactIdentities.externalId })
    .from(contactIdentities)
    .where(and(eq(contactIdentities.contactId, contact.id), eq(contactIdentities.channel, 'WHATSAPP')))
    .limit(1);
  return idRows[0]?.externalId || null;
}

export async function recordConversationActivity(params: {
  companyId: string;
  conversationId: string;
  contactId: string;
  wahaSession?: string | null;
  channel?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  action: string;
  summary: string;
  detail?: Record<string, any>;
  createdAt?: Date;
}) {
  try {
    const actorName = params.actorName?.trim() || 'Sistem';
    await db.insert(chatMessages).values({
      id: crypto.randomUUID(),
      companyId: params.companyId,
      conversationId: params.conversationId,
      contactId: params.contactId,
      direction: 'SYSTEM',
      messageType: 'ACTIVITY',
      channel: params.channel || 'WHATSAPP',
      wahaSession: params.wahaSession || null,
      senderName: actorName,
      body: params.summary,
      metadataJson: JSON.stringify({
        kind: 'ACTIVITY',
        action: params.action,
        actorId: params.actorId || null,
        actorName,
        actorRole: params.actorRole || null,
        ...(params.detail ? { detail: params.detail } : {}),
      }),
      status: 'SYSTEM',
      ackStatus: 0,
      createdAt: params.createdAt || new Date(),
    });
  } catch (err: any) {
    console.warn('[Conversations] recordConversationActivity failed:', err?.message);
  }
}

export async function sendCsatCtaForConversation(
  conv: typeof conversations.$inferSelect,
  contact: typeof contacts.$inferSelect,
  opts: { session?: string; baseUrl?: string; customMessage?: string; triggerType?: 'MANUAL' | 'AUTO_RESOLVE' }
) {
  const companyId = conv.companyId || getActiveCompanyId();
  const settings = await getCompanySettingMap(companyId);
  const surveyConfig = parseCsatSurveyConfig(settings.csat_survey_config);
  const matchedProfile = resolveCsatProfileForConversation(surveyConfig, {
    channel: conv.channel,
    wahaSession: opts.session?.trim() || conv.wahaSession,
    labels: conv.labels,
  });
  const snapshot = buildCsatSnapshot(matchedProfile);

  const token = crypto.randomBytes(12).toString('hex');
  const configuredBase = (settings.csat_base_url || '').trim().replace(/\/+$/, '');
  const runtimeBase = (opts.baseUrl || '').trim().replace(/\/+$/, '');
  const base = configuredBase || runtimeBase;
  const csatUrl = base
    ? `${base.replace(/\/csat$/i, '')}/csat?token=${token}`
    : `/csat?token=${token}`;
  const template =
    (opts.customMessage || '').trim() ||
    (matchedProfile.ctaTemplate || '').trim() ||
    settings.csat_template ||
    DEFAULT_CSAT_CTA_TEMPLATE;
  const namaPanggilan = contact.namaPanggilan || contact.namaLengkap;
  const ctaBody = template
    .replace(/\{nama_panggilan\}/gi, namaPanggilan)
    .replace(/\{nama_lengkap\}/gi, contact.namaLengkap)
    .replace(/\{link_csat\}/gi, csatUrl);

  const targetSession = opts.session?.trim() || conv.wahaSession || undefined;
  const convChannel = ((conv.channel || 'WHATSAPP').toUpperCase()) as OmnichannelType;
  let sendResult: { success: boolean; messageId?: string; sessionUsed?: string; error?: string };

  if (convChannel !== 'WHATSAPP') {
    const out = await sendOutboundChannelMessage({
      channel: convChannel,
      channelAccountId: conv.channelAccountId,
      contactId: conv.contactId,
      externalThreadId: conv.externalThreadId,
      text: ctaBody,
    });
    sendResult = { success: true, messageId: out.externalMessageId || undefined };
  } else {
    const targetWa = await resolveWhatsAppTarget(conv, contact);
    if (!targetWa) {
      throw new Error('Kontak belum memiliki nomor WhatsApp');
    }
    sendResult = await wahaService.sendTextMessage(
      targetWa,
      ctaBody,
      targetSession
    );
    if (!sendResult.success) {
      throw new Error(sendResult.error || 'Gagal mengirim tautan CSAT melalui WhatsApp');
    }
  }

  const effectiveSession = sendResult.sessionUsed || targetSession || null;
  const now = new Date();
  const cycleStartedAt = conv.sessionStartedAt || conv.firstInboundAt || conv.createdAt || now;
  const cycleResolvedAt =
    conv.resolvedAt || (opts.triggerType === 'AUTO_RESOLVE' ? now : null);

  await db.insert(csatResponses).values({
    id: crypto.randomUUID(),
    companyId,
    conversationId: conv.id,
    contactId: conv.contactId,
    wahaSession: effectiveSession,
    assignedAgentId: conv.assignedAgentId || null,
    assignedAgentName: conv.assignedAgentName || null,
    token,
    triggerType: opts.triggerType || 'MANUAL',
    profileId: matchedProfile.id,
    profileName: matchedProfile.name,
    snapshotJson: JSON.stringify(snapshot),
    conversationStartedAt: cycleStartedAt,
    conversationResolvedAt: cycleResolvedAt,
    sentAt: now,
  });

  const inserted = await db
    .insert(chatMessages)
    .values({
      id: crypto.randomUUID(),
      companyId,
      conversationId: conv.id,
      contactId: conv.contactId,
      direction: 'OUTBOUND',
      messageType: 'CSAT',
      channel: convChannel,
      wahaSession: effectiveSession,
      body: ctaBody,
      metadataJson: JSON.stringify({ sentVia: 'CRM', actorName: 'Tim CS' }),
      wahaMessageId: sendResult.messageId || null,
      status: 'SENT',
      ackStatus: 1,
      sentAt: now,
      createdAt: now,
    })
    .returning();

  await db
    .update(conversations)
    .set({
      csatToken: token,
      wahaSession: effectiveSession || conv.wahaSession,
      firstResponseAt: conv.firstInboundAt && !conv.firstResponseAt ? now : conv.firstResponseAt,
      lastMessage: ctaBody,
      lastMessageAt: now,
      updatedAt: now,
    })
    .where(eq(conversations.id, conv.id));

  liveEvents.emit('conversations:update', { conversationId: conv.id }, companyId);
  liveEvents.emit('tracking:update', { conversationId: conv.id }, companyId);

  return {
    message: inserted[0],
    token,
    csatUrl,
    profile: matchedProfile,
    sessionUsed: effectiveSession,
  };
}
