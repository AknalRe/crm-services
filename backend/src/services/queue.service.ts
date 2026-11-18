import { Queue, Worker, Job } from 'bullmq';
import { eq, and, ne, sql } from 'drizzle-orm';
import { redisConnection } from './redis';
import { db, waitForDbInitialized } from '../db';
import {
  campaigns,
  campaignRecipients,
  conversations,
  chatMessages,
} from '../db/schema';
import { wahaService } from './waha.service';
import { sendOutboundChannelMessage, OmnichannelType } from './channel.service';
import { liveEvents } from './events.service';
import { getActiveCompanyId, runWithCompany } from './tenantContext';
import crypto from 'crypto';

export interface SendMessageJobData {
  companyId?: string;
  recipientId: string;
  campaignId: string;
  contactId: string;
  phone: string;
  message: string;
  sessionName?: string;
  channel?: OmnichannelType;
  channelAccountId?: string | null;
}

export const BROADCAST_QUEUE_NAME = 'whatsapp-broadcast';

export const broadcastQueue = new Queue<SendMessageJobData>(BROADCAST_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

/**
 * Worker to process broadcast messages with rate-limiting and delay
 */
export const broadcastWorker = new Worker<SendMessageJobData>(
  BROADCAST_QUEUE_NAME,
  async (job: Job<SendMessageJobData>) => {
    await waitForDbInitialized();
    const {
      companyId: rawCompanyId,
      recipientId,
      campaignId,
      contactId,
      phone,
      message,
      sessionName,
      channel = 'WHATSAPP',
      channelAccountId = null,
    } = job.data;

    let resolvedCompanyId = getActiveCompanyId(rawCompanyId);
    if (!rawCompanyId) {
      const [campRow] = await db
        .select({ companyId: campaigns.companyId })
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);
      if (campRow?.companyId) resolvedCompanyId = campRow.companyId;
    }

    return await runWithCompany(resolvedCompanyId, async () => {
    const targetChannel = (channel || 'WHATSAPP').toUpperCase() as OmnichannelType;
    console.log(`[Queue Worker][${resolvedCompanyId}] Processing ${targetChannel} message for ${phone} (Campaign: ${campaignId}, Recipient: ${recipientId})`);

    // Ensure campaign isn't cancelled
    const campaignList = await db
      .select({ status: campaigns.status })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));

    const currentCampaign = campaignList[0];

    if (currentCampaign?.status === 'CANCELLED') {
      console.log(`[Queue Worker] Campaign ${campaignId} was cancelled. Skipping recipient ${recipientId}`);
      await db
        .update(campaignRecipients)
        .set({
          status: 'FAILED',
          errorMessage: 'Campaign was cancelled by user',
          updatedAt: new Date(),
        })
        .where(and(eq(campaignRecipients.id, recipientId), eq(campaignRecipients.status, 'PENDING')));
      return;
    }

    // Idempotency guard: only send if recipient is still PENDING
    const recRows = await db
      .select({ status: campaignRecipients.status })
      .from(campaignRecipients)
      .where(eq(campaignRecipients.id, recipientId));
    if (!recRows[0] || recRows[0].status !== 'PENDING') {
      console.log(`[Queue Worker] Recipient ${recipientId} is already processed (${recRows[0]?.status || 'missing'}). Skipping duplicate send.`);
      return;
    }

    // Attempt to send via selected channel
    let sendResult: { success: boolean; messageId?: string; sessionUsed?: string; error?: string };
    if (targetChannel !== 'WHATSAPP') {
      try {
        const ext = await sendOutboundChannelMessage({
          channel: targetChannel,
          channelAccountId,
          contactId,
          text: message,
        });
        sendResult = {
          success: true,
          messageId: ext.externalMessageId ? `${targetChannel}_${ext.externalMessageId}` : undefined,
        };
      } catch (err: any) {
        sendResult = {
          success: false,
          error: err?.message || `Gagal mengirim pesan via ${targetChannel}`,
        };
      }
    } else {
      sendResult = await wahaService.sendTextMessage(phone, message, sessionName);
    }

    if (sendResult.success) {
      const now = new Date();
      const effectiveSession =
        targetChannel === 'WHATSAPP' ? sendResult.sessionUsed || sessionName || null : null;

      // Update recipient record
      await db
        .update(campaignRecipients)
        .set({
          status: 'SENT',
          ackStatus: 1, // 1 = sent to WhatsApp server
          wahaMessageId: sendResult.messageId,
          sentAt: now,
          errorMessage: null,
          updatedAt: now,
        })
        .where(eq(campaignRecipients.id, recipientId));

      // Increment campaign sent count
      await db
        .update(campaigns)
        .set({
          sentCount: sql`${campaigns.sentCount} + 1`,
          status: 'PROCESSING',
          startedAt:
            currentCampaign?.status === 'SCHEDULED' || currentCampaign?.status === 'DRAFT'
              ? now
              : undefined,
          updatedAt: now,
        })
        .where(eq(campaigns.id, campaignId));

      // Update or create conversation history
      try {
        const convList = await db
          .select()
          .from(conversations)
          .where(
            and(
              eq(conversations.companyId, resolvedCompanyId),
              eq(conversations.contactId, contactId),
              eq(conversations.channel, targetChannel)
            )
          );

        const matchedConv = effectiveSession
          ? convList.find(
              (c) => (c.wahaSession || '').trim().toLowerCase() === effectiveSession.trim().toLowerCase()
            ) || convList.find((c) => !(c.wahaSession || '').trim())
          : convList[0];
        let convId = matchedConv?.id;

        if (!convId) {
          convId = crypto.randomUUID();
          try {
            await db.insert(conversations).values({
              id: convId,
              companyId: resolvedCompanyId,
              contactId,
              channel: targetChannel,
              channelAccountId: targetChannel === 'WHATSAPP' ? null : channelAccountId,
              wahaSession: effectiveSession,
              lastMessage: message,
              lastMessageAt: now,
              unreadCount: 0,
              createdAt: now,
              updatedAt: now,
            });
          } catch (convErr: any) {
            const code = String(convErr?.code || convErr?.cause?.code || '');
            if (code !== '23505') throw convErr;
            const retryList = await db
              .select()
              .from(conversations)
              .where(
                and(
                  eq(conversations.companyId, resolvedCompanyId),
                  eq(conversations.contactId, contactId),
                  eq(conversations.channel, targetChannel)
                )
              );
            const fallbackConv = effectiveSession
              ? retryList.find(
                  (c) => (c.wahaSession || '').trim().toLowerCase() === effectiveSession.trim().toLowerCase()
                ) || retryList[0]
              : retryList[0];
            if (!fallbackConv) throw convErr;
            convId = fallbackConv.id;
            await db
              .update(conversations)
              .set({
                lastMessage: message,
                lastMessageAt: now,
                updatedAt: now,
              })
              .where(eq(conversations.id, convId));
          }
        } else {
          await db
            .update(conversations)
            .set({
              wahaSession: effectiveSession || undefined,
              channelAccountId: targetChannel === 'WHATSAPP' ? undefined : channelAccountId || undefined,
              lastMessage: message,
              lastMessageAt: now,
              updatedAt: now,
            })
            .where(eq(conversations.id, convId));
        }

        await db.insert(chatMessages).values({
          id: crypto.randomUUID(),
          companyId: resolvedCompanyId,
          conversationId: convId,
          contactId,
          direction: 'OUTBOUND',
          messageType: 'TEXT',
          channel: targetChannel,
          externalMessageId: sendResult.messageId || null,
          wahaSession: effectiveSession,
          senderName: 'Siaran Terjadwal',
          body: message,
          metadataJson: JSON.stringify({ sentVia: 'BROADCAST', sentViaLabel: 'Siaran Terjadwal' }),
          wahaMessageId: sendResult.messageId,
          status: 'SENT',
          ackStatus: 1,
          sentAt: now,
          createdAt: now,
        });
      } catch (chatErr) {
        console.error('[Queue Worker] Failed to update conversation log:', chatErr);
      }
    } else {
      // Mark as failed
      await db
        .update(campaignRecipients)
        .set({
          status: 'FAILED',
          ackStatus: -1,
          errorMessage: sendResult.error || 'Failed to send message',
          updatedAt: new Date(),
        })
        .where(eq(campaignRecipients.id, recipientId));

      await db
        .update(campaigns)
        .set({
          failedCount: sql`${campaigns.failedCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaignId));
    }

    // Check if campaign is finished
    const pendingList = await db
      .select({ count: sql<number>`count(*)` })
      .from(campaignRecipients)
      .where(
        and(
          eq(campaignRecipients.campaignId, campaignId),
          eq(campaignRecipients.status, 'PENDING')
        )
      );

    const remaining = Number(pendingList[0]?.count || 0);

    if (remaining === 0) {
      const updatedCamp = await db
        .select({ sentCount: campaigns.sentCount, failedCount: campaigns.failedCount })
        .from(campaigns)
        .where(eq(campaigns.id, campaignId));
      const cStats = updatedCamp[0];
      const finalStatus =
        cStats && Number(cStats.sentCount || 0) === 0 && Number(cStats.failedCount || 0) > 0
          ? 'FAILED'
          : 'COMPLETED';
      await db
        .update(campaigns)
        .set({
          status: finalStatus,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(campaigns.id, campaignId), ne(campaigns.status, 'CANCELLED')));
      console.log(`[Queue Worker] Campaign ${campaignId} finished with status ${finalStatus}.`);
    }

    liveEvents.emit('tracking:update', { campaignId, recipientId }, resolvedCompanyId);
    if (sendResult.success) {
      liveEvents.emit('conversations:update', { campaignId, contactId }, resolvedCompanyId);
    }
    });
  },
  {
    connection: redisConnection,
    concurrency: 1, // Sequential execution for anti-ban rate limiting
  }
);

broadcastWorker.on('completed', (job) => {
  console.log(`[Queue Worker] Job ${job.id} completed.`);
});

broadcastWorker.on('failed', (job, err) => {
  console.error(`[Queue Worker] Job ${job?.id} failed:`, err.message);
});
