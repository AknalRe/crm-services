import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sql, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '../db';
import { contacts, campaigns, campaignRecipients } from '../db/schema';
import { formatCampaign, formatRecipient } from './broadcasts';

export default async function dashboardRouter(fastify: FastifyInstance) {
  fastify.get('/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      // Parallel aggregations
      const [
        totalContactsRes,
        totalCampaignsRes,
        totalRecipientsRes,
        pendingRes,
        sentRes,
        deliveredRes,
        readRes,
        failedRes,
        recentCampaignsList,
        recentActivityList,
        birthdayContactsList,
      ] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(contacts),
        db.select({ count: sql<number>`count(*)` }).from(campaigns),
        db.select({ count: sql<number>`count(*)` }).from(campaignRecipients),
        db.select({ count: sql<number>`count(*)` }).from(campaignRecipients).where(eq(campaignRecipients.status, 'PENDING')),
        db.select({ count: sql<number>`count(*)` }).from(campaignRecipients).where(eq(campaignRecipients.status, 'SENT')),
        db.select({ count: sql<number>`count(*)` }).from(campaignRecipients).where(eq(campaignRecipients.status, 'DELIVERED')),
        db.select({ count: sql<number>`count(*)` }).from(campaignRecipients).where(eq(campaignRecipients.status, 'READ')),
        db.select({ count: sql<number>`count(*)` }).from(campaignRecipients).where(eq(campaignRecipients.status, 'FAILED')),
        db.select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(5),
        db
          .select({
            recipient: campaignRecipients,
            contact: contacts,
            campaign: campaigns,
          })
          .from(campaignRecipients)
          .leftJoin(contacts, eq(campaignRecipients.contactId, contacts.id))
          .leftJoin(campaigns, eq(campaignRecipients.campaignId, campaigns.id))
          .orderBy(desc(campaignRecipients.updatedAt))
          .limit(10),
        db.select({ tanggalLahir: contacts.tanggalLahir }).from(contacts).where(isNotNull(contacts.tanggalLahir)),
      ]);

      const totalContacts = Number(totalContactsRes[0]?.count || 0);
      const totalCampaigns = Number(totalCampaignsRes[0]?.count || 0);
      const totalRecipients = Number(totalRecipientsRes[0]?.count || 0);
      const pendingRecipients = Number(pendingRes[0]?.count || 0);
      const sentRecipients = Number(sentRes[0]?.count || 0);
      const deliveredRecipients = Number(deliveredRes[0]?.count || 0);
      const readRecipients = Number(readRes[0]?.count || 0);
      const failedRecipients = Number(failedRes[0]?.count || 0);

      const totalSentAndBeyond = sentRecipients + deliveredRecipients + readRecipients;
      const deliveryRate =
        totalSentAndBeyond > 0
          ? Math.round(((deliveredRecipients + readRecipients) / totalSentAndBeyond) * 100)
          : 0;
      const readRate =
        deliveredRecipients + readRecipients > 0
          ? Math.round((readRecipients / (deliveredRecipients + readRecipients)) * 100)
          : 0;

      // Check today's birthdays
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentDay = now.getDate();
      const birthdayTodayCount = birthdayContactsList.filter((c) => {
        if (!c.tanggalLahir) return false;
        const bDate = new Date(c.tanggalLahir);
        return bDate.getMonth() + 1 === currentMonth && bDate.getDate() === currentDay;
      }).length;

      return reply.send({
        success: true,
        data: {
          summary: {
            totalContacts,
            totalCampaigns,
            totalRecipients,
            pending: pendingRecipients,
            sent: totalSentAndBeyond,
            delivered: deliveredRecipients + readRecipients,
            read: readRecipients,
            failed: failedRecipients,
            deliveryRate,
            readRate,
            birthdayTodayCount,
          },
          recentCampaigns: recentCampaignsList.map(formatCampaign),
          recentActivity: recentActivityList.map((r) =>
            formatRecipient(r.recipient, r.contact, r.campaign)
          ),
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
