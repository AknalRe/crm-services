import { Queue, Worker, Job } from 'bullmq';
import { eq, and, ne, sql } from 'drizzle-orm';
import { redisConnection } from './redis';
import { db } from '../db';
import {
  campaigns,
  campaignRecipients,
  conversations,
  chatMessages,
} from '../db/schema';
import { wahaService } from './waha.service';
import crypto from 'crypto';

export interface SendMessageJobData {
  recipientId: string;
  campaignId: string;
  contactId: string;
  phone: string;
  message: string;
  sessionName?: string;
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
    const { recipientId, campaignId, contactId, phone, message, sessionName } = job.data;
    console.log(`[Queue Worker] Processing message for ${phone} (Campaign: ${campaignId}, Recipient: ${recipientId})`);

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
        .where(eq(campaignRecipients.id, recipientId));
      return;
    }

    // Attempt to send via WAHA
    const sendResult = await wahaService.sendTextMessage(phone, message, sessionName);

    if (sendResult.success) {
      const now = new Date();

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
          .where(eq(conversations.contactId, contactId));

        let convId = convList[0]?.id;

        if (!convId) {
          convId = crypto.randomUUID();
          await db.insert(conversations).values({
            id: convId,
            contactId,
            lastMessage: message,
            lastMessageAt: now,
            unreadCount: 0,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          await db
            .update(conversations)
            .set({
              lastMessage: message,
              lastMessageAt: now,
              updatedAt: now,
            })
            .where(eq(conversations.id, convId));
        }

        await db.insert(chatMessages).values({
          id: crypto.randomUUID(),
          conversationId: convId,
          contactId,
          direction: 'OUTBOUND',
          body: message,
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
      await db
        .update(campaigns)
        .set({
          status: 'COMPLETED',
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(campaigns.id, campaignId), ne(campaigns.status, 'CANCELLED')));
      console.log(`[Queue Worker] Campaign ${campaignId} check completed.`);
    }
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
