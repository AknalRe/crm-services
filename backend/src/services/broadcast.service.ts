import { eq, inArray, and } from 'drizzle-orm';
import { db } from '../db';
import { contacts, campaigns, campaignRecipients } from '../db/schema';
import { broadcastQueue } from './queue.service';
import { licenseService } from './license.service';
import crypto from 'crypto';

export interface CreateCampaignDTO {
  title: string;
  messageTemplate: string;
  type?: 'IMMEDIATE' | 'SCHEDULED' | 'BIRTHDAY';
  scheduledAt?: string | null;
  delaySeconds?: number;
  intervalSeconds?: number;
  batchSize?: number;
  contactIds?: string[];
  filterTags?: string[];
  sessionName?: string;
}

export class BroadcastService {
  /**
   * Replace template placeholders with contact details
   */
  public static personalizeMessage(
    template: string,
    contact: {
      namaLengkap: string;
      namaPanggilan?: string | null;
      alamat?: string | null;
      nomorWhatsapp: string;
    }
  ): string {
    const panggilan = contact.namaPanggilan || contact.namaLengkap.split(' ')[0];
    return template
      .replace(/{nama_lengkap}/gi, contact.namaLengkap)
      .replace(/{nama_panggilan}/gi, panggilan)
      .replace(/{alamat}/gi, contact.alamat || '')
      .replace(/{nomor_whatsapp}/gi, contact.nomorWhatsapp);
  }

  /**
   * Create and launch or schedule a broadcast campaign
   */
  public static async createCampaign(dto: CreateCampaignDTO) {
    const {
      title,
      messageTemplate,
      type = 'IMMEDIATE',
      scheduledAt,
      delaySeconds = 5,
      intervalSeconds = 30,
      batchSize = 10,
      contactIds,
      filterTags,
      sessionName,
    } = dto;

    // Enforce active Reneo license
    await licenseService.assertLicenseActive();

    // 1. Find target contacts
    let targetContacts: any[] = [];

    if (contactIds && contactIds.length > 0) {
      targetContacts = await db
        .select()
        .from(contacts)
        .where(inArray(contacts.id, contactIds));
    } else if (filterTags && filterTags.length > 0 && !filterTags.includes('ALL')) {
      const allContacts = await db.select().from(contacts);
      targetContacts = allContacts.filter((c) => {
        if (!c.tags) return false;
        return filterTags.some((tag) => c.tags?.toLowerCase().includes(tag.toLowerCase()));
      });
    } else {
      targetContacts = await db.select().from(contacts);
    }

    if (targetContacts.length === 0) {
      throw new Error('Tidak ada kontak yang dipilih atau ditemukan.');
    }

    // 2. Determine initial status & schedule
    const isScheduled =
      type === 'SCHEDULED' && scheduledAt && new Date(scheduledAt).getTime() > Date.now();
    const status = isScheduled ? 'SCHEDULED' : 'PROCESSING';
    const scheduleDate = isScheduled ? new Date(scheduledAt) : null;
    const campaignId = crypto.randomUUID();
    const now = new Date();

    // 3. Create Campaign in DB
    const insertedCampaigns = await db
      .insert(campaigns)
      .values({
        id: campaignId,
        title,
        messageTemplate,
        type,
        status,
        scheduledAt: scheduleDate,
        delaySeconds,
        intervalSeconds,
        batchSize,
        filterTags: filterTags ? filterTags.join(',') : 'ALL',
        totalCount: targetContacts.length,
        sentCount: 0,
        deliveredCount: 0,
        readCount: 0,
        failedCount: 0,
        startedAt: isScheduled ? null : now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const createdCampaign = insertedCampaigns[0];

    // 4. Create Campaign Recipients
    const recipientData = targetContacts.map((c) => ({
      id: crypto.randomUUID(),
      campaignId: createdCampaign.id,
      contactId: c.id,
      phone: c.nomorWhatsapp,
      personalizedMessage: this.personalizeMessage(messageTemplate, c),
      status: 'PENDING',
      ackStatus: 0,
      createdAt: now,
      updatedAt: now,
    }));

    const insertedRecipients = await db
      .insert(campaignRecipients)
      .values(recipientData)
      .returning();

    // 5. Calculate delays and dispatch to BullMQ
    const baseInitialDelay =
      isScheduled && scheduleDate ? Math.max(0, scheduleDate.getTime() - Date.now()) : 0;

    for (let i = 0; i < insertedRecipients.length; i++) {
      const recipient = insertedRecipients[i];

      const batchNumber = Math.floor(i / batchSize);
      const delayForBatch = batchNumber * (intervalSeconds * 1000);
      const delayForSingle = i * (delaySeconds * 1000);
      const jitter = Math.floor(Math.random() * 1500); // 0-1.5s human-like jitter

      const totalDelay = baseInitialDelay + delayForSingle + delayForBatch + jitter;

      await broadcastQueue.add(
        'send-message',
        {
          recipientId: recipient.id,
          campaignId: createdCampaign.id,
          contactId: recipient.contactId,
          phone: recipient.phone,
          message: recipient.personalizedMessage,
          sessionName,
        },
        {
          delay: totalDelay,
          jobId: `msg_${recipient.id}`,
        }
      );
    }

    return {
      campaign: createdCampaign,
      recipientCount: insertedRecipients.length,
      estimatedDurationSeconds: Math.round(
        targetContacts.length * delaySeconds +
          Math.floor(targetContacts.length / batchSize) * intervalSeconds
      ),
    };
  }

  /**
   * Cancel an ongoing or scheduled campaign
   */
  public static async cancelCampaign(campaignId: string) {
    const campList = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));

    if (campList.length === 0) throw new Error('Kampanye tidak ditemukan');

    await db
      .update(campaigns)
      .set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId));

    await db
      .update(campaignRecipients)
      .set({
        status: 'FAILED',
        errorMessage: 'Dibatalkan oleh pengguna',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(campaignRecipients.campaignId, campaignId),
          eq(campaignRecipients.status, 'PENDING')
        )
      );

    return { success: true };
  }
}
