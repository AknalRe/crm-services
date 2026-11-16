import { eq, inArray, and, gte, ne, sql } from 'drizzle-orm';
import { db } from '../db';
import { contacts, campaigns, campaignRecipients, contactIdentities } from '../db/schema';
import { broadcastQueue } from './queue.service';
import { licenseService } from './license.service';
import { OmnichannelType } from './channel.service';
import { wahaService } from './waha.service';
import crypto from 'crypto';

export interface CreateCampaignDTO {
  title: string;
  messageTemplate: string;
  type?: 'IMMEDIATE' | 'SCHEDULED' | 'BIRTHDAY';
  channel?: OmnichannelType;
  channelAccountId?: string | null;
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
      channel = 'WHATSAPP',
      channelAccountId = null,
      scheduledAt,
      delaySeconds = 5,
      intervalSeconds = 30,
      batchSize = 10,
      contactIds,
      filterTags,
      sessionName,
    } = dto;

    const normalizedChannel = (channel || 'WHATSAPP').toUpperCase() as OmnichannelType;
    if (normalizedChannel !== 'WHATSAPP' && !channelAccountId) {
      throw new Error(`Pilih akun kanal ${normalizedChannel} terlebih dahulu untuk mengirim siaran.`);
    }

    const safeDelaySeconds = Math.max(0, Number.isFinite(Number(delaySeconds)) ? Number(delaySeconds) : 5);
    const safeIntervalSeconds = Math.max(0, Number.isFinite(Number(intervalSeconds)) ? Number(intervalSeconds) : 30);
    const safeBatchSize = Math.max(1, Math.floor(Number(batchSize) || 10));

    // Enforce active Reneo license
    const lic = await licenseService.assertLicenseActive();

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

    // Filter contacts compatible with selected channel
    const identityByContact = new Map<string, string>();
    if (normalizedChannel !== 'WHATSAPP') {
      const idRows = await db
        .select()
        .from(contactIdentities)
        .where(eq(contactIdentities.channel, normalizedChannel));
      for (const row of idRows) {
        if (!identityByContact.has(row.contactId)) {
          identityByContact.set(row.contactId, row.handle || row.externalId);
        }
      }
      targetContacts = targetContacts.filter((c) => identityByContact.has(c.id));
      if (targetContacts.length === 0) {
        throw new Error(
          `Tidak ada kontak terpilih yang memiliki akun/identitas ${normalizedChannel}.`
        );
      }
    } else {
      targetContacts = targetContacts.filter((c) => Boolean(c.nomorWhatsapp));
      if (targetContacts.length === 0) {
        throw new Error('Tidak ada kontak terpilih yang memiliki nomor WhatsApp.');
      }
    }

    // Enforce monthly broadcast quota when unlimitedBroadcast is disabled
    if (!lic.features.unlimitedBroadcast && lic.features.maxBroadcastPerMonth > 0) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const countRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(campaignRecipients)
        .innerJoin(campaigns, eq(campaignRecipients.campaignId, campaigns.id))
        .where(
          and(
            gte(campaignRecipients.createdAt, monthStart),
            ne(campaigns.status, 'CANCELLED')
          )
        );
      const sentThisMonth = Number(countRows[0]?.count ?? 0);

      if (sentThisMonth + targetContacts.length > lic.features.maxBroadcastPerMonth) {
        const err = new Error(
          `Kuota kirim broadcast bulan ini (${sentThisMonth.toLocaleString('id-ID')}/${lic.features.maxBroadcastPerMonth.toLocaleString('id-ID')}) tidak mencukupi untuk ${targetContacts.length.toLocaleString('id-ID')} penerima. Silakan upgrade paket lisensi Anda.`
        ) as Error & { statusCode?: number };
        err.statusCode = 403;
        throw err;
      }
    }

    // 2. Determine initial status & schedule
    let isScheduled = false;
    let scheduleDate: Date | null = null;
    if (type === 'SCHEDULED') {
      if (!scheduledAt) {
        const err: any = new Error('Tanggal dan waktu jadwal wajib diisi untuk siaran terjadwal.');
        err.statusCode = 400;
        throw err;
      }
      const parsed = new Date(scheduledAt);
      if (Number.isNaN(parsed.getTime())) {
        const err: any = new Error('Format tanggal jadwal tidak valid.');
        err.statusCode = 400;
        throw err;
      }
      if (parsed.getTime() < Date.now() - 60_000) {
        const err: any = new Error('Waktu jadwal siaran sudah terlewat. Pilih waktu di masa mendatang.');
        err.statusCode = 400;
        throw err;
      }
      isScheduled = true;
      scheduleDate = parsed;
    }
    const status = isScheduled ? 'SCHEDULED' : 'PROCESSING';
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
        channel: normalizedChannel,
        channelAccountId: normalizedChannel === 'WHATSAPP' ? null : channelAccountId,
        status,
        scheduledAt: scheduleDate,
        delaySeconds: safeDelaySeconds,
        intervalSeconds: safeIntervalSeconds,
        batchSize: safeBatchSize,
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
      phone:
        normalizedChannel === 'WHATSAPP'
          ? c.nomorWhatsapp || ''
          : identityByContact.get(c.id) || c.nomorWhatsapp || c.namaLengkap,
      personalizedMessage: this.personalizeMessage(messageTemplate, {
        ...c,
        nomorWhatsapp: c.nomorWhatsapp || identityByContact.get(c.id) || '',
      }),
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

    let rotationPool: string[] = [];
    if (normalizedChannel === 'WHATSAPP') {
      try {
        const listed = await wahaService.listSessions();
        const workingSessions = listed.sessions
          .filter((s) => s.status === 'WORKING')
          .map((s) => s.name);

        if (sessionName === '__ALL_ACTIVE__') {
          rotationPool = workingSessions;
        } else if (!isScheduled) {
          const requested = sessionName?.trim();
          if (requested && !listed.sessions.some((s) => s.name === requested && s.status === 'WORKING')) {
            const matched = listed.sessions.find((s) => s.name === requested);
            throw new Error(
              matched
                ? `Sesi WhatsApp "${requested}" berstatus ${matched.status}. Pastikan sesi WORKING sebelum mengirim siaran.`
                : `Sesi WhatsApp "${requested}" tidak ditemukan di server WAHA.`
            );
          }
          if (!requested && workingSessions.length === 0) {
            throw new Error(
              'Tidak ada sesi WhatsApp yang berstatus WORKING. Scan QR atau start sesi WAHA terlebih dahulu.'
            );
          }
        }
        if (sessionName === '__ALL_ACTIVE__' && !isScheduled && rotationPool.length === 0) {
          throw new Error(
            'Tidak ada sesi WhatsApp yang berstatus WORKING untuk rotasi siaran.'
          );
        }
      } catch (sessErr: any) {
        if (!isScheduled) {
          throw sessErr;
        }
        rotationPool = [];
      }
    }

    for (let i = 0; i < insertedRecipients.length; i++) {
      const recipient = insertedRecipients[i];
      const assignedSession =
        rotationPool.length > 0
          ? rotationPool[i % rotationPool.length]
          : sessionName === '__ALL_ACTIVE__'
          ? undefined
          : sessionName;

      const batchNumber = Math.floor(i / safeBatchSize);
      const delayForBatch = batchNumber * (safeIntervalSeconds * 1000);
      const delayForSingle = i * (safeDelaySeconds * 1000);
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
          sessionName: assignedSession,
          channel: normalizedChannel,
          channelAccountId: normalizedChannel === 'WHATSAPP' ? null : channelAccountId,
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

  /**
   * Retry all FAILED recipients in a campaign
   */
  public static async retryFailedRecipients(campaignId: string) {
    const campList = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));

    if (campList.length === 0) throw new Error('Kampanye tidak ditemukan');
    const campaign = campList[0];

    const failedRecipients = await db
      .select()
      .from(campaignRecipients)
      .where(
        and(
          eq(campaignRecipients.campaignId, campaignId),
          eq(campaignRecipients.status, 'FAILED')
        )
      );

    if (failedRecipients.length === 0) {
      throw new Error('Tidak ada penerima berstatus gagal pada kampanye ini.');
    }

    await licenseService.assertLicenseActive();

    const now = new Date();
    const targetChannel = ((campaign.channel || 'WHATSAPP').toUpperCase()) as OmnichannelType;
    const delaySeconds = Math.max(0, Number(campaign.delaySeconds ?? 5) || 0);
    const intervalSeconds = Math.max(0, Number(campaign.intervalSeconds ?? 30) || 0);
    const batchSize = Math.max(1, Number(campaign.batchSize ?? 10) || 10);

    await db
      .update(campaignRecipients)
      .set({
        status: 'PENDING',
        ackStatus: 0,
        errorMessage: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(campaignRecipients.campaignId, campaignId),
          eq(campaignRecipients.status, 'FAILED')
        )
      );

    await db
      .update(campaigns)
      .set({
        status: 'PROCESSING',
        failedCount: 0,
        completedAt: null,
        updatedAt: now,
      })
      .where(eq(campaigns.id, campaignId));

    let retryPool: string[] = [];
    if (targetChannel === 'WHATSAPP') {
      try {
        const listed = await wahaService.listSessions();
        retryPool = listed.sessions
          .filter((s) => s.status === 'WORKING')
          .map((s) => s.name);
      } catch {
        retryPool = [];
      }
    }

    for (let i = 0; i < failedRecipients.length; i++) {
      const recipient = failedRecipients[i];
      const batchNumber = Math.floor(i / batchSize);
      const totalDelay =
        i * (delaySeconds * 1000) +
        batchNumber * (intervalSeconds * 1000) +
        Math.floor(Math.random() * 1200);
      const retrySession = retryPool.length > 0 ? retryPool[i % retryPool.length] : undefined;

      await broadcastQueue.add(
        'send-message',
        {
          recipientId: recipient.id,
          campaignId: campaign.id,
          contactId: recipient.contactId,
          phone: recipient.phone,
          message: recipient.personalizedMessage,
          sessionName: retrySession,
          channel: targetChannel,
          channelAccountId: campaign.channelAccountId || null,
        },
        {
          delay: totalDelay,
          jobId: `retry_${recipient.id}_${Date.now()}`,
        }
      );
    }

    return { retriedCount: failedRecipients.length };
  }
}
