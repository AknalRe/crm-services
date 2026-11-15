import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sql, desc, eq, gte, isNotNull, or } from 'drizzle-orm';
import { db } from '../db';
import { contacts, campaigns, campaignRecipients, conversations, csatResponses } from '../db/schema';
import { formatCampaign, formatRecipient } from './broadcasts';
import { getSettingMap, requirePermission } from './auth';

const DEFAULT_SLA_TARGET_MINUTES = 15;

export default async function dashboardRouter(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requirePermission('dashboard'));
  fastify.get('/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const settings = await getSettingMap();
      const slaRaw = Number.parseInt(settings.sla_target_minutes || String(DEFAULT_SLA_TARGET_MINUTES), 10);
      const slaTargetMinutes = Number.isFinite(slaRaw) && slaRaw >= 1 ? Math.min(1440, slaRaw) : DEFAULT_SLA_TARGET_MINUTES;
      const slaTargetSeconds = slaTargetMinutes * 60;

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
        conversationRows,
        csatRows,
      ] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(contacts),
        db.select({ count: sql<number>`count(*)` }).from(campaigns),
        db.select({ count: sql<number>`count(*)` }).from(campaignRecipients),
        db.select({ count: sql<number>`count(*)` }).from(campaignRecipients).where(eq(campaignRecipients.status, 'PENDING')),
        db.select({ count: sql<number>`count(*)` }).from(campaignRecipients).where(
          or(eq(campaignRecipients.status, 'SENT'), eq(campaignRecipients.ackStatus, 1))
        ),
        db.select({ count: sql<number>`count(*)` }).from(campaignRecipients).where(
          or(eq(campaignRecipients.status, 'DELIVERED'), eq(campaignRecipients.ackStatus, 2))
        ),
        db.select({ count: sql<number>`count(*)` }).from(campaignRecipients).where(
          or(eq(campaignRecipients.status, 'READ'), gte(campaignRecipients.ackStatus, 3))
        ),
        db.select({ count: sql<number>`count(*)` }).from(campaignRecipients).where(
          or(eq(campaignRecipients.status, 'FAILED'), eq(campaignRecipients.ackStatus, -1))
        ),
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
        db
          .select({
            conv: conversations,
            contact: contacts,
          })
          .from(conversations)
          .leftJoin(contacts, eq(conversations.contactId, contacts.id)),
        db.select().from(csatResponses).where(isNotNull(csatResponses.rating)),
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

      // Check today's birthdays in Asia/Jakarta (WIB)
      const wibParts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Jakarta',
          month: '2-digit',
          day: '2-digit',
        })
          .formatToParts(new Date())
          .map((p) => [p.type, p.value])
      );
      const currentMonth = Number.parseInt(wibParts.month, 10);
      const currentDay = Number.parseInt(wibParts.day, 10);
      const birthdayTodayCount = birthdayContactsList.filter((c) => {
        if (!c.tanggalLahir) return false;
        const bDate = new Date(c.tanggalLahir);
        return bDate.getUTCMonth() + 1 === currentMonth && bDate.getUTCDate() === currentDay;
      }).length;

      // Chatwoot-style Conversation, SLA & CSAT Analytics
      let openCount = 0;
      let pendingCount = 0;
      let resolvedCount = 0;
      let frtTotalSec = 0;
      let frtCount = 0;
      let slaMetCount = 0;
      let resTotalSec = 0;
      let resCount = 0;
      let csatSum = 0;
      let csatCount = 0;
      const csatDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      const sessionMap = new Map<
        string,
        { session: string; count: number; resolvedCount: number; csatSum: number; csatCount: number }
      >();
      const channelMap = new Map<
        string,
        { channel: string; count: number; resolvedCount: number; csatSum: number; csatCount: number }
      >();
      const agentMap = new Map<
        string,
        {
          agentName: string;
          count: number;
          resolvedCount: number;
          slaMetCount: number;
          slaMeasuredCount: number;
          csatSum: number;
          csatCount: number;
        }
      >();

      const recentCsatList: Array<{
        conversationId: string;
        contactName: string;
        phone: string;
        wahaSession: string | null;
        rating: number;
        feedback: string | null;
        submittedAt: Date | null;
      }> = [];

      const convIdsWithCsatRows = new Set<string>(csatRows.map((r) => r.conversationId));
      const convMetaMap = new Map<
        string,
        { contactName: string; phone: string; wahaSession: string | null }
      >();

      for (const row of conversationRows) {
        const c = row.conv;
        convMetaMap.set(c.id, {
          contactName: row.contact?.namaLengkap || row.contact?.nomorWhatsapp || 'Pelanggan',
          phone: row.contact?.nomorWhatsapp || '',
          wahaSession: c.wahaSession,
        });
        const st = (c.status || 'OPEN').toUpperCase();
        if (st === 'RESOLVED') resolvedCount++;
        else if (st === 'PENDING') pendingCount++;
        else openCount++;

        const ch = (c.channel || 'WHATSAPP').toUpperCase();
        const chEntry = channelMap.get(ch) || {
          channel: ch,
          count: 0,
          resolvedCount: 0,
          csatSum: 0,
          csatCount: 0,
        };
        chEntry.count += 1;
        if (st === 'RESOLVED') chEntry.resolvedCount += 1;
        if (c.csatRating) {
          chEntry.csatSum += c.csatRating;
          chEntry.csatCount += 1;
        }
        channelMap.set(ch, chEntry);

        if (c.firstInboundAt && c.firstResponseAt) {
          const frtSec = Math.max(
            0,
            Math.round((new Date(c.firstResponseAt).getTime() - new Date(c.firstInboundAt).getTime()) / 1000)
          );
          frtTotalSec += frtSec;
          frtCount++;
          if (frtSec <= slaTargetSeconds) slaMetCount++;
        }

        if (c.resolvedAt && c.createdAt) {
          const resSec = Math.max(
            0,
            Math.round((new Date(c.resolvedAt).getTime() - new Date(c.createdAt).getTime()) / 1000)
          );
          resTotalSec += resSec;
          resCount++;
        }

        if (!convIdsWithCsatRows.has(c.id) && c.csatRating && c.csatRating >= 1 && c.csatRating <= 5) {
          csatSum += c.csatRating;
          csatCount++;
          csatDistribution[c.csatRating] = (csatDistribution[c.csatRating] || 0) + 1;
          recentCsatList.push({
            conversationId: c.id,
            contactName: row.contact?.namaLengkap || row.contact?.nomorWhatsapp || 'Pelanggan',
            phone: row.contact?.nomorWhatsapp || '',
            wahaSession: c.wahaSession,
            rating: c.csatRating,
            feedback: c.csatFeedback,
            submittedAt: c.csatSubmittedAt,
          });
        }

        const sessKey = c.wahaSession || 'Default';
        const prevSess = sessionMap.get(sessKey) || {
          session: sessKey,
          count: 0,
          resolvedCount: 0,
          csatSum: 0,
          csatCount: 0,
        };
        prevSess.count++;
        if (st === 'RESOLVED') prevSess.resolvedCount++;
        if (!convIdsWithCsatRows.has(c.id) && c.csatRating && c.csatRating >= 1 && c.csatRating <= 5) {
          prevSess.csatSum += c.csatRating;
          prevSess.csatCount++;
        }
        sessionMap.set(sessKey, prevSess);

        const agentKey = c.assignedAgentId || 'unassigned';
        const prevAgent = agentMap.get(agentKey) || {
          agentName: c.assignedAgentName || 'Belum Ditugaskan',
          count: 0,
          resolvedCount: 0,
          slaMetCount: 0,
          slaMeasuredCount: 0,
          csatSum: 0,
          csatCount: 0,
        };
        prevAgent.count++;
        if (st === 'RESOLVED') prevAgent.resolvedCount++;
        if (c.firstInboundAt && c.firstResponseAt) {
          const frtSec = Math.max(
            0,
            Math.round((new Date(c.firstResponseAt).getTime() - new Date(c.firstInboundAt).getTime()) / 1000)
          );
          prevAgent.slaMeasuredCount++;
          if (frtSec <= slaTargetSeconds) prevAgent.slaMetCount++;
        }
        if (!convIdsWithCsatRows.has(c.id) && c.csatRating && c.csatRating >= 1 && c.csatRating <= 5) {
          prevAgent.csatSum += c.csatRating;
          prevAgent.csatCount++;
        }
        agentMap.set(agentKey, prevAgent);
      }

      for (const r of csatRows) {
        if (!r.rating || r.rating < 1 || r.rating > 5) continue;
        const meta = convMetaMap.get(r.conversationId);
        csatSum += r.rating;
        csatCount++;
        csatDistribution[r.rating] = (csatDistribution[r.rating] || 0) + 1;
        recentCsatList.push({
          conversationId: r.conversationId,
          contactName: meta?.contactName || 'Pelanggan',
          phone: meta?.phone || '',
          wahaSession: r.wahaSession || meta?.wahaSession || null,
          rating: r.rating,
          feedback: r.feedback || null,
          submittedAt: r.submittedAt || null,
        });

        const sessKey = r.wahaSession || meta?.wahaSession || 'Default';
        const sessEntry = sessionMap.get(sessKey);
        if (sessEntry) {
          sessEntry.csatSum += r.rating;
          sessEntry.csatCount++;
        }

        const agentKey = r.assignedAgentId || 'unassigned';
        const agentEntry = agentMap.get(agentKey);
        if (agentEntry) {
          agentEntry.csatSum += r.rating;
          agentEntry.csatCount++;
        }
      }

      recentCsatList.sort((a, b) => {
        const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return tb - ta;
      });

      const conversationAnalytics = {
        totalConversations: conversationRows.length,
        openCount,
        pendingCount,
        resolvedCount,
        avgFirstResponseSeconds: frtCount > 0 ? Math.round(frtTotalSec / frtCount) : null,
        avgResolutionSeconds: resCount > 0 ? Math.round(resTotalSec / resCount) : null,
        slaTargetSeconds,
        slaMeasuredCount: frtCount,
        slaMetCount,
        slaBreachedCount: Math.max(0, frtCount - slaMetCount),
        slaComplianceRate: frtCount > 0 ? Math.round((slaMetCount / frtCount) * 100) : null,
        csatCount,
        csatAverage: csatCount > 0 ? Number((csatSum / csatCount).toFixed(2)) : null,
        csatDistribution,
        recentCsat: recentCsatList.slice(0, 6),
        bySession: Array.from(sessionMap.values()).map((s) => ({
          session: s.session,
          count: s.count,
          resolvedCount: s.resolvedCount,
          avgCsat: s.csatCount > 0 ? Number((s.csatSum / s.csatCount).toFixed(2)) : null,
        })),
        byChannel: Array.from(channelMap.values()).map((ch) => ({
          channel: ch.channel,
          count: ch.count,
          resolvedCount: ch.resolvedCount,
          avgCsat: ch.csatCount > 0 ? Number((ch.csatSum / ch.csatCount).toFixed(2)) : null,
        })),
        byAgent: Array.from(agentMap.values()).map((a) => ({
          agentName: a.agentName,
          count: a.count,
          resolvedCount: a.resolvedCount,
          slaRate: a.slaMeasuredCount > 0 ? Math.round((a.slaMetCount / a.slaMeasuredCount) * 100) : null,
          avgCsat: a.csatCount > 0 ? Number((a.csatSum / a.csatCount).toFixed(2)) : null,
        })),
      };

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
          conversationAnalytics,
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

  // CSV Export endpoint for reports (agents | conversations | broadcasts)
  fastify.get<{ Querystring: { type?: string } }>(
    '/export',
    async (req, reply) => {
      try {
        const exportType = (req.query?.type || 'conversations').toLowerCase();
        const escapeCsv = (val: unknown): string => {
          const s = val === null || val === undefined ? '' : String(val);
          if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        };
        const toCsv = (headers: string[], rows: unknown[][]): string => {
          const lines = [headers.map(escapeCsv).join(',')];
          for (const row of rows) {
            lines.push(row.map(escapeCsv).join(','));
          }
          return '\uFEFF' + lines.join('\r\n');
        };

        if (exportType === 'broadcasts') {
          const list = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
          const csv = toCsv(
            ['ID', 'Judul', 'Tipe', 'Status', 'Total', 'Terkirim', 'Sampai', 'Dibaca', 'Gagal', 'Dibuat'],
            list.map((c) => [
              c.id,
              c.title,
              c.type,
              c.status,
              c.totalCount,
              c.sentCount,
              c.deliveredCount,
              c.readCount,
              c.failedCount,
              c.createdAt ? new Date(c.createdAt).toISOString() : '',
            ])
          );
          reply.header('Content-Type', 'text/csv; charset=utf-8');
          reply.header('Content-Disposition', 'attachment; filename="laporan-broadcast-crm.csv"');
          return reply.send(csv);
        }

        const settings = await getSettingMap();
        const slaRaw = Number.parseInt(settings.sla_target_minutes || String(DEFAULT_SLA_TARGET_MINUTES), 10);
        const slaTargetSeconds =
          (Number.isFinite(slaRaw) && slaRaw >= 1 ? Math.min(1440, slaRaw) : DEFAULT_SLA_TARGET_MINUTES) * 60;

        const convRows = await db
          .select({ conv: conversations, contact: contacts })
          .from(conversations)
          .leftJoin(contacts, eq(conversations.contactId, contacts.id))
          .orderBy(desc(conversations.updatedAt));

        if (exportType === 'agents') {
          const csatRows = await db.select().from(csatResponses).where(isNotNull(csatResponses.rating));
          const map = new Map<
            string,
            {
              name: string;
              total: number;
              resolved: number;
              frtSum: number;
              frtCount: number;
              resSum: number;
              resCount: number;
              slaMet: number;
              csatSum: number;
              csatCount: number;
            }
          >();
          const ensure = (name: string) => {
            let item = map.get(name);
            if (!item) {
              item = {
                name,
                total: 0,
                resolved: 0,
                frtSum: 0,
                frtCount: 0,
                resSum: 0,
                resCount: 0,
                slaMet: 0,
                csatSum: 0,
                csatCount: 0,
              };
              map.set(name, item);
            }
            return item;
          };

          for (const { conv } of convRows) {
            const ag = ensure(conv.assignedAgentName || 'Belum Ditugaskan');
            ag.total++;
            if (conv.status === 'RESOLVED') ag.resolved++;
            if (conv.firstInboundAt && conv.firstResponseAt) {
              const frt = Math.max(
                0,
                Math.round((new Date(conv.firstResponseAt).getTime() - new Date(conv.firstInboundAt).getTime()) / 1000)
              );
              ag.frtSum += frt;
              ag.frtCount++;
              if (frt <= slaTargetSeconds) ag.slaMet++;
            }
            if (conv.firstInboundAt && conv.resolvedAt) {
              const resSec = Math.max(
                0,
                Math.round((new Date(conv.resolvedAt).getTime() - new Date(conv.firstInboundAt).getTime()) / 1000)
              );
              ag.resSum += resSec;
              ag.resCount++;
            }
          }
          for (const c of csatRows) {
            if (typeof c.rating === 'number') {
              const ag = ensure(c.assignedAgentName || 'Belum Ditugaskan');
              ag.csatSum += c.rating;
              ag.csatCount++;
            }
          }

          const csv = toCsv(
            [
              'Nama Agent',
              'Total Chat',
              'Chat Selesai',
              'Rata-rata FRT (detik)',
              'Rata-rata Penyelesaian (detik)',
              'Kepatuhan SLA (%)',
              'Rata-rata CSAT',
              'Jumlah Penilaian CSAT',
            ],
            Array.from(map.values()).map((a) => [
              a.name,
              a.total,
              a.resolved,
              a.frtCount > 0 ? Math.round(a.frtSum / a.frtCount) : '',
              a.resCount > 0 ? Math.round(a.resSum / a.resCount) : '',
              a.frtCount > 0 ? Math.round((a.slaMet / a.frtCount) * 100) : '',
              a.csatCount > 0 ? (a.csatSum / a.csatCount).toFixed(2) : '',
              a.csatCount,
            ])
          );
          reply.header('Content-Type', 'text/csv; charset=utf-8');
          reply.header('Content-Disposition', 'attachment; filename="laporan-performa-agent-crm.csv"');
          return reply.send(csv);
        }

        // Default: conversations
        const csv = toCsv(
          [
            'ID Percakapan',
            'Nama Kontak',
            'WhatsApp',
            'Kategori Kontak',
            'Sesi WAHA',
            'Agent',
            'Status',
            'Label',
            'Pesan Masuk Pertama',
            'Respon Pertama',
            'FRT (detik)',
            'Waktu Selesai',
            'Rating CSAT',
          ],
          convRows.map(({ conv, contact }) => {
            const frtSec =
              conv.firstInboundAt && conv.firstResponseAt
                ? Math.max(
                    0,
                    Math.round(
                      (new Date(conv.firstResponseAt).getTime() - new Date(conv.firstInboundAt).getTime()) / 1000
                    )
                  )
                : '';
            return [
              conv.id,
              contact?.namaLengkap || '',
              contact?.nomorWhatsapp || '',
              contact?.kategori || '',
              conv.wahaSession || '',
              conv.assignedAgentName || '',
              conv.status,
              conv.labels || '',
              conv.firstInboundAt ? new Date(conv.firstInboundAt).toISOString() : '',
              conv.firstResponseAt ? new Date(conv.firstResponseAt).toISOString() : '',
              frtSec,
              conv.resolvedAt ? new Date(conv.resolvedAt).toISOString() : '',
              conv.csatRating ?? '',
            ];
          })
        );
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', 'attachment; filename="laporan-percakapan-crm.csv"');
        return reply.send(csv);
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );
}
