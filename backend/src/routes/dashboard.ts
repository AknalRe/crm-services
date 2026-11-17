import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { and, sql, desc, eq, gte, isNotNull, isNull, or } from 'drizzle-orm';
import { db } from '../db';
import { contacts, campaigns, campaignRecipients, conversations, csatResponses, chatMessages } from '../db/schema';
import { formatCampaign, formatRecipient } from './broadcasts';
import { CsatCriterionScoreDetail, extractCsatCriteriaDetails } from '../services/csat.service';
import { getRequestCompanyId, getSettingMap, requirePermission } from './auth';

function toWibDateKey(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const dateObj = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dateObj.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(dateObj)
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getWibTodayStart(): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00.000+07:00`);
}

function getPeriodDateRange(
  period?: string,
  customStart?: string,
  customEnd?: string
): { start: Date | null; end: Date | null } {
  if (period === 'custom' && (customStart || customEnd)) {
    const start = customStart ? new Date(customStart) : null;
    const end = customEnd ? new Date(customEnd) : null;
    return {
      start: start && !Number.isNaN(start.getTime()) ? start : null,
      end: end && !Number.isNaN(end.getTime()) ? end : null,
    };
  }
  if (!period || period === 'all') return { start: null, end: null };
  const now = new Date();
  const todayStart = getWibTodayStart();
  if (period === 'today') {
    return { start: todayStart, end: now };
  }
  if (period === '7d') {
    const start = new Date(todayStart.getTime() - 6 * 86_400_000);
    return { start, end: now };
  }
  if (period === '30d') {
    const start = new Date(todayStart.getTime() - 29 * 86_400_000);
    return { start, end: now };
  }
  if (period === 'month') {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
      })
        .formatToParts(now)
        .map((p) => [p.type, p.value])
    );
    const start = new Date(`${parts.year}-${parts.month}-01T00:00:00.000+07:00`);
    return { start, end: now };
  }
  return { start: null, end: null };
}

function isDateInRange(
  d: Date | string | null | undefined,
  start: Date | null,
  end: Date | null
): boolean {
  if (!start && !end) return true;
  if (!d) return false;
  const time = (d instanceof Date ? d : new Date(d)).getTime();
  if (Number.isNaN(time)) return false;
  if (start && time < start.getTime()) return false;
  if (end && time > end.getTime()) return false;
  return true;
}

function isBirthdayToday(
  d: Date | string | null | undefined,
  currentMonth: number,
  currentDay: number
): boolean {
  if (!d) return false;
  const dateObj = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dateObj.getTime())) return false;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(dateObj)
      .map((p) => [p.type, p.value])
  );
  if (
    Number.parseInt(parts.month, 10) === currentMonth &&
    Number.parseInt(parts.day, 10) === currentDay
  ) {
    return true;
  }
  return dateObj.getUTCMonth() + 1 === currentMonth && dateObj.getUTCDate() === currentDay;
}

function isExcludedConversation(c: typeof conversations.$inferSelect): boolean {
  return Boolean(c.excludeFromMetrics || c.isGroup);
}

function getConversationCycleStart(c: typeof conversations.$inferSelect): Date | null {
  const d = c.sessionStartedAt || c.firstInboundAt || c.createdAt;
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function getConversationDisplayName(
  c: typeof conversations.$inferSelect,
  contact?: typeof contacts.$inferSelect | null
): string {
  return (
    c.channelDisplayName?.trim() ||
    c.contextTitle?.trim() ||
    c.pushName?.trim() ||
    contact?.namaLengkap?.trim() ||
    contact?.nomorWhatsapp?.trim() ||
    'Pelanggan'
  );
}

type CriterionAggMap = Map<
  string,
  { key: string; label: string; sum: number; count: number; distribution: Record<number, number> }
>;

function accumulateCriteria(map: CriterionAggMap, details: CsatCriterionScoreDetail[]) {
  for (const d of details) {
    const bucket = map.get(d.key) || {
      key: d.key,
      label: d.label,
      sum: 0,
      count: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
    bucket.label = d.label || bucket.label;
    bucket.sum += d.score;
    bucket.count += 1;
    const rounded = Math.max(1, Math.min(5, Math.round(d.score)));
    bucket.distribution[rounded] = (bucket.distribution[rounded] || 0) + 1;
    map.set(d.key, bucket);
  }
}

function serializeCriteriaSummary(map: CriterionAggMap) {
  return Array.from(map.values())
    .map((c) => ({
      key: c.key,
      label: c.label,
      average: Number((c.sum / c.count).toFixed(2)),
      count: c.count,
      distribution: c.distribution,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

const DEFAULT_SLA_TARGET_MINUTES = 15;

export default async function dashboardRouter(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (req, reply) => {
    const path = req.routeOptions?.url || req.url || '';
    if (path.includes('/export')) {
      return requirePermission('dashboard.export')(req, reply);
    }
    return requirePermission('dashboard')(req, reply);
  });

  fastify.get<{
    Querystring: {
      period?: string;
      startDate?: string;
      endDate?: string;
      session?: string;
      channel?: string;
    };
  }>('/stats', async (req, reply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const settings = await getSettingMap(companyId);
      const slaRaw = Number.parseInt(
        settings.sla_target_minutes || String(DEFAULT_SLA_TARGET_MINUTES),
        10
      );
      const slaTargetMinutes =
        Number.isFinite(slaRaw) && slaRaw >= 1
          ? Math.min(1440, slaRaw)
          : DEFAULT_SLA_TARGET_MINUTES;
      const slaTargetSeconds = slaTargetMinutes * 60;

      const period = String(req.query?.period || 'all').toLowerCase().trim();
      const dateRange = getPeriodDateRange(period, req.query?.startDate, req.query?.endDate);
      const sessionFilter = req.query?.session && req.query.session !== 'all' ? req.query.session.trim() : null;
      const channelFilter = req.query?.channel && req.query.channel !== 'all' ? req.query.channel.trim().toUpperCase() : null;

      const todayStartWib = getWibTodayStart();

      // Parallel aggregations scoped to companyId
      const [
        allContactsList,
        totalCampaignsRes,
        allRecipientsRows,
        recentCampaignsList,
        recentActivityList,
        conversationRows,
        csatRows,
        todayMsgRows,
      ] = await Promise.all([
        db
          .select({
            id: contacts.id,
            kategori: contacts.kategori,
            tanggalLahir: contacts.tanggalLahir,
            nomorWhatsapp: contacts.nomorWhatsapp,
          })
          .from(contacts)
          .where(eq(contacts.companyId, companyId)),
        db
          .select({ count: sql<number>`count(*)` })
          .from(campaigns)
          .where(eq(campaigns.companyId, companyId)),
        db
          .select({
            status: campaignRecipients.status,
            ackStatus: campaignRecipients.ackStatus,
            sentAt: campaignRecipients.sentAt,
            readAt: campaignRecipients.readAt,
            deliveredAt: campaignRecipients.deliveredAt,
            createdAt: campaignRecipients.createdAt,
          })
          .from(campaignRecipients)
          .where(eq(campaignRecipients.companyId, companyId)),
        db
          .select()
          .from(campaigns)
          .where(eq(campaigns.companyId, companyId))
          .orderBy(desc(campaigns.createdAt))
          .limit(5),
        db
          .select({
            recipient: campaignRecipients,
            contact: contacts,
            campaign: campaigns,
          })
          .from(campaignRecipients)
          .leftJoin(contacts, eq(campaignRecipients.contactId, contacts.id))
          .leftJoin(campaigns, eq(campaignRecipients.campaignId, campaigns.id))
          .where(eq(campaignRecipients.companyId, companyId))
          .orderBy(desc(campaignRecipients.updatedAt))
          .limit(10),
        db
          .select({
            conv: conversations,
            contact: contacts,
          })
          .from(conversations)
          .leftJoin(contacts, eq(conversations.contactId, contacts.id))
          .where(eq(conversations.companyId, companyId)),
        db
          .select()
          .from(csatResponses)
          .where(and(eq(csatResponses.companyId, companyId), isNotNull(csatResponses.rating))),
        db
          .select({
            direction: chatMessages.direction,
            messageType: chatMessages.messageType,
            conversationId: chatMessages.conversationId,
          })
          .from(chatMessages)
          .where(and(eq(chatMessages.companyId, companyId), gte(chatMessages.createdAt, todayStartWib))),
      ]);

      const customerContacts = allContactsList.filter(
        (c) => (c.kategori || '').trim().toLowerCase() !== 'grup whatsapp'
      );
      const totalContacts = customerContacts.length;
      const groupContactsCount = allContactsList.length - customerContacts.length;

      const categoryCountMap = new Map<string, number>();
      for (const c of customerContacts) {
        const cat = (c.kategori || '').trim() || 'Tanpa Kategori';
        categoryCountMap.set(cat, (categoryCountMap.get(cat) || 0) + 1);
      }
      const contactCategories = Array.from(categoryCountMap.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

      // Birthday count for today in Asia/Jakarta (WIB)
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
      const birthdayTodayCount = customerContacts.filter((c) =>
        isBirthdayToday(c.tanggalLahir, currentMonth, currentDay)
      ).length;

      // Filter recipients by active date range (broadcasts are not session-filtered)
      const filteredRecipientsRows = allRecipientsRows.filter((r) =>
        isDateInRange(r.sentAt || r.createdAt, dateRange.start, dateRange.end)
      );

      // Mutually exclusive recipient state counting to ensure mathematical validity
      let pendingRecipients = 0;
      let sentOnlyRecipients = 0;
      let deliveredOnlyRecipients = 0;
      let readRecipients = 0;
      let failedRecipients = 0;

      for (const r of filteredRecipientsRows) {
        const isFailed = r.status === 'FAILED' || r.ackStatus === -1;
        if (isFailed) {
          failedRecipients++;
          continue;
        }
        const isRead = r.status === 'READ' || r.ackStatus >= 3;
        if (isRead) {
          readRecipients++;
          continue;
        }
        const isDelivered = r.status === 'DELIVERED' || r.ackStatus === 2;
        if (isDelivered) {
          deliveredOnlyRecipients++;
          continue;
        }
        const isSent = r.status === 'SENT' || r.ackStatus === 1;
        if (isSent) {
          sentOnlyRecipients++;
          continue;
        }
        pendingRecipients++;
      }

      // Total reached sent or beyond (sent + delivered + read)
      const totalSentAndBeyond = sentOnlyRecipients + deliveredOnlyRecipients + readRecipients;
      // Total reached delivered or beyond (delivered + read)
      const totalDeliveredAndRead = deliveredOnlyRecipients + readRecipients;
      const deliveryRate =
        totalSentAndBeyond > 0
          ? Math.round((totalDeliveredAndRead / totalSentAndBeyond) * 100)
          : 0;
      const readRate =
        totalDeliveredAndRead > 0
          ? Math.round((readRecipients / totalDeliveredAndRead) * 100)
          : 0;

      // Build 7-day trend buckets (always last 7 days ending today WIB)
      const trendBuckets: Array<{
        date: string;
        label: string;
        conversationsAssessed: number;
        conversationsExcluded: number;
        broadcastSent: number;
        broadcastRead: number;
      }> = [];
      const trendMap = new Map<string, (typeof trendBuckets)[number]>();
      for (let i = 6; i >= 0; i--) {
        const day = new Date(todayStartWib.getTime() - i * 86_400_000);
        const key = toWibDateKey(day)!;
        const label = new Intl.DateTimeFormat('id-ID', {
          timeZone: 'Asia/Jakarta',
          day: 'numeric',
          month: 'short',
        }).format(day);
        const entry = {
          date: key,
          label,
          conversationsAssessed: 0,
          conversationsExcluded: 0,
          broadcastSent: 0,
          broadcastRead: 0,
        };
        trendBuckets.push(entry);
        trendMap.set(key, entry);
      }

      for (const r of allRecipientsRows) {
        const sentKey = toWibDateKey(r.sentAt || r.createdAt);
        if (sentKey && trendMap.has(sentKey)) {
          if (r.status === 'SENT' || r.status === 'DELIVERED' || r.status === 'READ' || r.ackStatus >= 1) {
            trendMap.get(sentKey)!.broadcastSent += 1;
          }
          if (r.status === 'READ' || r.ackStatus >= 3) {
            trendMap.get(sentKey)!.broadcastRead += 1;
          }
        }
      }

      // Populate conversation trend buckets (unfiltered by period to show consistent 7d activity)
      for (const row of conversationRows) {
        const c = row.conv;
        if (sessionFilter && (c.wahaSession || 'Default') !== sessionFilter) continue;
        if (channelFilter && (c.channel || 'WHATSAPP').toUpperCase() !== channelFilter) continue;
        const convDay = toWibDateKey(c.lastMessageAt || c.lastInboundAt || c.firstInboundAt || c.createdAt);
        if (convDay && trendMap.has(convDay)) {
          if (isExcludedConversation(c)) {
            trendMap.get(convDay)!.conversationsExcluded += 1;
          } else {
            trendMap.get(convDay)!.conversationsAssessed += 1;
          }
        }
      }

      // Meta map for conversation lookups
      const convMetaMap = new Map<
        string,
        {
          contactName: string;
          phone: string;
          wahaSession: string | null;
          channel: string;
          assignedAgentId: string | null;
          assignedAgentName: string | null;
          excluded: boolean;
        }
      >();

      for (const row of conversationRows) {
        const c = row.conv;
        convMetaMap.set(c.id, {
          contactName: getConversationDisplayName(c, row.contact),
          phone: row.contact?.nomorWhatsapp || '',
          wahaSession: c.wahaSession,
          channel: c.channel || 'WHATSAPP',
          assignedAgentId: c.assignedAgentId,
          assignedAgentName: c.assignedAgentName,
          excluded: isExcludedConversation(c),
        });
      }

      // Filter conversations for the requested period, session, and channel
      const filteredConversationRows = conversationRows.filter((row) => {
        const c = row.conv;
        if (sessionFilter && (c.wahaSession || 'Default') !== sessionFilter) return false;
        if (channelFilter && (c.channel || 'WHATSAPP').toUpperCase() !== channelFilter) return false;
        if (dateRange.start || dateRange.end) {
          const actDate = c.lastMessageAt || c.lastInboundAt || c.firstInboundAt || c.createdAt;
          if (!isDateInRange(actDate, dateRange.start, dateRange.end)) return false;
        }
        return true;
      });

      const assessedRows = filteredConversationRows.filter((r) => !isExcludedConversation(r.conv));
      const excludedCount = filteredConversationRows.length - assessedRows.length;
      const groupCount = filteredConversationRows.filter((r) => Boolean(r.conv.isGroup)).length;

      // Filter CSAT responses for the requested period, session, and channel
      const filteredCsatRows = csatRows.filter((r) => {
        const meta = convMetaMap.get(r.conversationId);
        if (meta?.excluded) return false;
        const sess = r.wahaSession || meta?.wahaSession || 'Default';
        if (sessionFilter && sess !== sessionFilter) return false;
        const ch = (meta?.channel || 'WHATSAPP').toUpperCase();
        if (channelFilter && ch !== channelFilter) return false;
        if (dateRange.start || dateRange.end) {
          const dt = r.submittedAt || r.sentAt;
          if (!isDateInRange(dt, dateRange.start, dateRange.end)) return false;
        }
        return true;
      });

      // Count today's inbound & outbound messages (non-NOTE, assessed only, matching session/channel)
      let todayInboundCount = 0;
      let todayOutboundCount = 0;
      for (const m of todayMsgRows) {
        if (m.messageType === 'NOTE') continue;
        const meta = convMetaMap.get(m.conversationId);
        if (meta?.excluded) continue;
        if (sessionFilter && (meta?.wahaSession || 'Default') !== sessionFilter) continue;
        if (channelFilter && (meta?.channel || 'WHATSAPP').toUpperCase() !== channelFilter) continue;
        if (m.direction === 'INBOUND') todayInboundCount++;
        else if (m.direction === 'OUTBOUND') todayOutboundCount++;
      }

      // Aggregation accumulators
      let openCount = 0;
      let pendingCount = 0;
      let resolvedCount = 0;
      let unansweredCount = 0;
      let frtTotalSec = 0;
      let frtCount = 0;
      let slaMetCount = 0;
      let resTotalSec = 0;
      let resCount = 0;
      let csatSum = 0;
      let csatCount = 0;
      const csatDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      const globalCriteriaMap: CriterionAggMap = new Map();

      const profileMap = new Map<
        string,
        { profileId: string; profileName: string; sum: number; count: number; criteriaMap: CriterionAggMap }
      >();

      const sessionMap = new Map<
        string,
        {
          session: string;
          count: number;
          openCount: number;
          pendingCount: number;
          resolvedCount: number;
          slaMetCount: number;
          slaMeasuredCount: number;
          csatSum: number;
          csatCount: number;
          criteriaMap: CriterionAggMap;
        }
      >();

      const channelMap = new Map<
        string,
        {
          channel: string;
          count: number;
          openCount: number;
          pendingCount: number;
          resolvedCount: number;
          slaMetCount: number;
          slaMeasuredCount: number;
          csatSum: number;
          csatCount: number;
          criteriaMap: CriterionAggMap;
        }
      >();

      const agentMap = new Map<
        string,
        {
          agentId: string | null;
          agentName: string;
          count: number;
          openCount: number;
          pendingCount: number;
          resolvedCount: number;
          slaMetCount: number;
          slaMeasuredCount: number;
          frtSum: number;
          frtCount: number;
          resSum: number;
          resCount: number;
          csatSum: number;
          csatCount: number;
          criteriaMap: CriterionAggMap;
        }
      >();

      const recentCsatList: Array<{
        id: string;
        conversationId: string;
        token?: string | null;
        contactName: string;
        phone: string;
        wahaSession: string | null;
        agentName: string | null;
        profileName: string | null;
        rating: number;
        overallScore: number;
        criteriaDetails: CsatCriterionScoreDetail[];
        feedback: string | null;
        conversationStartedAt?: Date | null;
        conversationResolvedAt?: Date | null;
        submittedAt: Date | null;
      }> = [];

      const convIdsWithCsatRows = new Set<string>(filteredCsatRows.map((r) => r.conversationId));

      // Process assessed customer conversations
      for (const row of assessedRows) {
        const c = row.conv;
        const st = (c.status || 'OPEN').toUpperCase();
        if (st === 'RESOLVED') resolvedCount++;
        else if (st === 'PENDING') pendingCount++;
        else openCount++;

        // A conversation is unanswered if it's OPEN and either never responded to OR has unread inbound messages
        if (st === 'OPEN') {
          const isNeverAnswered = Boolean(c.firstInboundAt) && !c.firstResponseAt;
          const hasUnreadInbound = (c.unreadCount ?? 0) > 0;
          if (isNeverAnswered || hasUnreadInbound) {
            unansweredCount++;
          }
        }

        const ch = (c.channel || 'WHATSAPP').toUpperCase();
        const chEntry = channelMap.get(ch) || {
          channel: ch,
          count: 0,
          openCount: 0,
          pendingCount: 0,
          resolvedCount: 0,
          slaMetCount: 0,
          slaMeasuredCount: 0,
          csatSum: 0,
          csatCount: 0,
          criteriaMap: new Map(),
        };
        chEntry.count += 1;
        if (st === 'RESOLVED') chEntry.resolvedCount += 1;
        else if (st === 'PENDING') chEntry.pendingCount += 1;
        else chEntry.openCount += 1;

        const sessKey = c.wahaSession || 'Default';
        const prevSess = sessionMap.get(sessKey) || {
          session: sessKey,
          count: 0,
          openCount: 0,
          pendingCount: 0,
          resolvedCount: 0,
          slaMetCount: 0,
          slaMeasuredCount: 0,
          csatSum: 0,
          csatCount: 0,
          criteriaMap: new Map(),
        };
        prevSess.count++;
        if (st === 'RESOLVED') prevSess.resolvedCount++;
        else if (st === 'PENDING') prevSess.pendingCount++;
        else prevSess.openCount++;

        const agentName = c.assignedAgentName?.trim() || null;
        const agentId = c.assignedAgentId?.trim() || null;
        const agentKey = agentId || (agentName ? `name:${agentName}` : 'unassigned');
        const prevAgent = agentMap.get(agentKey) || {
          agentId,
          agentName: agentName || 'Belum Ditugaskan',
          count: 0,
          openCount: 0,
          pendingCount: 0,
          resolvedCount: 0,
          slaMetCount: 0,
          slaMeasuredCount: 0,
          frtSum: 0,
          frtCount: 0,
          resSum: 0,
          resCount: 0,
          csatSum: 0,
          csatCount: 0,
          criteriaMap: new Map(),
        };
        prevAgent.count++;
        if (st === 'RESOLVED') prevAgent.resolvedCount++;
        else if (st === 'PENDING') prevAgent.pendingCount++;
        else prevAgent.openCount++;

        // First Response Time (FRT) calculation
        if (c.firstInboundAt && c.firstResponseAt) {
          const respMs = new Date(c.firstResponseAt).getTime();
          const inbMs = new Date(c.firstInboundAt).getTime();
          if (respMs >= inbMs) {
            const frtSec = Math.round((respMs - inbMs) / 1000);
            frtTotalSec += frtSec;
            frtCount++;
            if (frtSec <= slaTargetSeconds) slaMetCount++;

            chEntry.slaMeasuredCount++;
            if (frtSec <= slaTargetSeconds) chEntry.slaMetCount++;

            prevSess.slaMeasuredCount++;
            if (frtSec <= slaTargetSeconds) prevSess.slaMetCount++;

            prevAgent.slaMeasuredCount++;
            prevAgent.frtSum += frtSec;
            prevAgent.frtCount++;
            if (frtSec <= slaTargetSeconds) prevAgent.slaMetCount++;
          }
        }

        // Resolution duration calculation based on conversation service cycle start
        if (c.resolvedAt) {
          const cycleStart = getConversationCycleStart(c);
          if (cycleStart) {
            const resMs = new Date(c.resolvedAt).getTime();
            const startMs = cycleStart.getTime();
            if (resMs >= startMs) {
              const resSec = Math.round((resMs - startMs) / 1000);
              resTotalSec += resSec;
              resCount++;
              prevAgent.resSum += resSec;
              prevAgent.resCount++;
            }
          }
        }

        // Legacy CSAT score from conversations table if no row exists in csatResponses
        if (!convIdsWithCsatRows.has(c.id) && c.csatRating && c.csatRating >= 1 && c.csatRating <= 5) {
          const scoreVal = c.csatOverallScore ?? c.csatRating;
          csatSum += scoreVal;
          csatCount++;
          csatDistribution[c.csatRating] = (csatDistribution[c.csatRating] || 0) + 1;

          chEntry.csatSum += scoreVal;
          chEntry.csatCount++;

          prevSess.csatSum += scoreVal;
          prevSess.csatCount++;

          prevAgent.csatSum += scoreVal;
          prevAgent.csatCount++;

          recentCsatList.push({
            id: c.id,
            conversationId: c.id,
            contactName: getConversationDisplayName(c, row.contact),
            phone: row.contact?.nomorWhatsapp || '',
            wahaSession: c.wahaSession,
            agentName: c.assignedAgentName || null,
            profileName: 'Umum (Default)',
            rating: c.csatRating,
            overallScore: Number(scoreVal.toFixed(2)),
            criteriaDetails: [],
            feedback: c.csatFeedback,
            conversationStartedAt: getConversationCycleStart(c),
            conversationResolvedAt: c.resolvedAt,
            submittedAt: c.csatSubmittedAt,
          });
        }

        channelMap.set(ch, chEntry);
        sessionMap.set(sessKey, prevSess);
        agentMap.set(agentKey, prevAgent);
      }

      // Process CSAT responses table
      for (const r of filteredCsatRows) {
        if (!r.rating || r.rating < 1 || r.rating > 5) continue;
        const meta = convMetaMap.get(r.conversationId);
        if (meta?.excluded) continue;

        const scoreVal =
          typeof r.overallScore === 'number' && Number.isFinite(r.overallScore)
            ? r.overallScore
            : r.rating;
        const criteriaDetails = extractCsatCriteriaDetails(r);

        csatSum += scoreVal;
        csatCount++;
        csatDistribution[r.rating] = (csatDistribution[r.rating] || 0) + 1;
        accumulateCriteria(globalCriteriaMap, criteriaDetails);

        const profId = r.profileId || 'default';
        const profName = r.profileName || 'Umum (Default)';
        const profEntry = profileMap.get(profId) || {
          profileId: profId,
          profileName: profName,
          sum: 0,
          count: 0,
          criteriaMap: new Map(),
        };
        profEntry.sum += scoreVal;
        profEntry.count += 1;
        accumulateCriteria(profEntry.criteriaMap, criteriaDetails);
        profileMap.set(profId, profEntry);

        recentCsatList.push({
          id: r.id,
          conversationId: r.conversationId,
          token: r.token,
          contactName: meta?.contactName || 'Pelanggan',
          phone: meta?.phone || '',
          wahaSession: r.wahaSession || meta?.wahaSession || null,
          agentName: r.assignedAgentName || meta?.assignedAgentName || null,
          profileName: profName,
          rating: r.rating,
          overallScore: Number(scoreVal.toFixed(2)),
          criteriaDetails,
          feedback: r.feedback || null,
          conversationStartedAt: r.conversationStartedAt || null,
          conversationResolvedAt: r.conversationResolvedAt || null,
          submittedAt: r.submittedAt || null,
        });

        const sessKey = r.wahaSession || meta?.wahaSession || 'Default';
        const sessEntry = sessionMap.get(sessKey) || {
          session: sessKey,
          count: 0,
          openCount: 0,
          pendingCount: 0,
          resolvedCount: 0,
          slaMetCount: 0,
          slaMeasuredCount: 0,
          csatSum: 0,
          csatCount: 0,
          criteriaMap: new Map(),
        };
        sessEntry.csatSum += scoreVal;
        sessEntry.csatCount++;
        accumulateCriteria(sessEntry.criteriaMap, criteriaDetails);
        sessionMap.set(sessKey, sessEntry);

        const chKey = (meta?.channel || 'WHATSAPP').toUpperCase();
        const chEntry = channelMap.get(chKey) || {
          channel: chKey,
          count: 0,
          openCount: 0,
          pendingCount: 0,
          resolvedCount: 0,
          slaMetCount: 0,
          slaMeasuredCount: 0,
          csatSum: 0,
          csatCount: 0,
          criteriaMap: new Map(),
        };
        chEntry.csatSum += scoreVal;
        chEntry.csatCount++;
        accumulateCriteria(chEntry.criteriaMap, criteriaDetails);
        channelMap.set(chKey, chEntry);

        const agName = r.assignedAgentName?.trim() || meta?.assignedAgentName?.trim() || null;
        const agId = r.assignedAgentId?.trim() || meta?.assignedAgentId?.trim() || null;
        const agentKey = agId || (agName ? `name:${agName}` : 'unassigned');
        const agentEntry = agentMap.get(agentKey) || {
          agentId: agId,
          agentName: agName || 'Belum Ditugaskan',
          count: 0,
          openCount: 0,
          pendingCount: 0,
          resolvedCount: 0,
          slaMetCount: 0,
          slaMeasuredCount: 0,
          frtSum: 0,
          frtCount: 0,
          resSum: 0,
          resCount: 0,
          csatSum: 0,
          csatCount: 0,
          criteriaMap: new Map(),
        };
        agentEntry.csatSum += scoreVal;
        agentEntry.csatCount++;
        accumulateCriteria(agentEntry.criteriaMap, criteriaDetails);
        agentMap.set(agentKey, agentEntry);
      }

      recentCsatList.sort((a, b) => {
        const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return tb - ta;
      });

      const conversationAnalytics = {
        totalConversations: assessedRows.length,
        allConversationsCount: filteredConversationRows.length,
        excludedCount,
        groupCount,
        openCount,
        pendingCount,
        resolvedCount,
        unansweredCount,
        todayInboundCount,
        todayOutboundCount,
        avgFirstResponseSeconds: frtCount > 0 ? Math.round(frtTotalSec / frtCount) : null,
        avgFirstResponseMinutes: frtCount > 0 ? Number((frtTotalSec / frtCount / 60).toFixed(1)) : null,
        avgResolutionSeconds: resCount > 0 ? Math.round(resTotalSec / resCount) : null,
        avgResolutionMinutes: resCount > 0 ? Number((resTotalSec / resCount / 60).toFixed(1)) : null,
        slaTargetSeconds,
        slaMeasuredCount: frtCount,
        slaMetCount,
        slaBreachedCount: Math.max(0, frtCount - slaMetCount),
        slaComplianceRate: frtCount > 0 ? Math.round((slaMetCount / frtCount) * 100) : null,
        csatCount,
        csatAverage: csatCount > 0 ? Number((csatSum / csatCount).toFixed(2)) : null,
        csatDistribution,
        csatByCriterion: serializeCriteriaSummary(globalCriteriaMap),
        csatByProfile: Array.from(profileMap.values()).map((p) => ({
          profileId: p.profileId,
          profileName: p.profileName,
          average: Number((p.sum / p.count).toFixed(2)),
          count: p.count,
          criteria: serializeCriteriaSummary(p.criteriaMap),
        })),
        recentCsat: recentCsatList.slice(0, 12),
        bySession: Array.from(sessionMap.values()).map((s) => ({
          session: s.session,
          count: s.count,
          openCount: s.openCount,
          pendingCount: s.pendingCount,
          resolvedCount: s.resolvedCount,
          slaRate: s.slaMeasuredCount > 0 ? Math.round((s.slaMetCount / s.slaMeasuredCount) * 100) : null,
          csatCount: s.csatCount,
          avgCsat: s.csatCount > 0 ? Number((s.csatSum / s.csatCount).toFixed(2)) : null,
          csatCriteria: serializeCriteriaSummary(s.criteriaMap),
        })).sort((a, b) => b.count - a.count || a.session.localeCompare(b.session)),
        byChannel: Array.from(channelMap.values()).map((ch) => ({
          channel: ch.channel,
          count: ch.count,
          openCount: ch.openCount,
          pendingCount: ch.pendingCount,
          resolvedCount: ch.resolvedCount,
          slaRate: ch.slaMeasuredCount > 0 ? Math.round((ch.slaMetCount / ch.slaMeasuredCount) * 100) : null,
          csatCount: ch.csatCount,
          avgCsat: ch.csatCount > 0 ? Number((ch.csatSum / ch.csatCount).toFixed(2)) : null,
          csatCriteria: serializeCriteriaSummary(ch.criteriaMap),
        })).sort((a, b) => b.count - a.count || a.channel.localeCompare(b.channel)),
        byAgent: Array.from(agentMap.values()).map((a) => ({
          agentId: a.agentId,
          agentName: a.agentName,
          count: a.count,
          openCount: a.openCount,
          pendingCount: a.pendingCount,
          resolvedCount: a.resolvedCount,
          avgFrtSeconds: a.frtCount > 0 ? Math.round(a.frtSum / a.frtCount) : null,
          avgResolutionSeconds: a.resCount > 0 ? Math.round(a.resSum / a.resCount) : null,
          slaRate: a.slaMeasuredCount > 0 ? Math.round((a.slaMetCount / a.slaMeasuredCount) * 100) : null,
          csatCount: a.csatCount,
          avgCsat: a.csatCount > 0 ? Number((a.csatSum / a.csatCount).toFixed(2)) : null,
          csatCriteria: serializeCriteriaSummary(a.criteriaMap),
        })).sort((a, b) => b.count - a.count || b.resolvedCount - a.resolvedCount || a.agentName.localeCompare(b.agentName)),
      };

      return reply.send({
        success: true,
        data: {
          filters: {
            period: period || 'all',
            session: sessionFilter || 'all',
            channel: channelFilter || 'all',
          },
          summary: {
            totalContacts,
            groupContactsCount,
            totalCampaigns: Number(totalCampaignsRes[0]?.count || 0),
            totalRecipients: filteredRecipientsRows.length,
            pending: pendingRecipients,
            sent: totalSentAndBeyond,
            delivered: totalDeliveredAndRead,
            read: readRecipients,
            failed: failedRecipients,
            deliveryRate,
            readRate,
            birthdayTodayCount,
            contactCategories,
            activityTrend7d: trendBuckets,
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

  // Interactive Click-to-Detail Drilldown endpoint for every Dashboard card, chart & table row
  fastify.get<{
    Querystring: {
      kind?: string;
      filter?: string;
      value?: string;
      q?: string;
      period?: string;
      startDate?: string;
      endDate?: string;
      session?: string;
      channel?: string;
    };
  }>('/drilldown', async (req, reply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const kind = String(req.query?.kind || 'conversations').toLowerCase().trim();
      const filter = String(req.query?.filter || 'all').toLowerCase().trim();
      const value = req.query?.value !== undefined ? String(req.query.value).trim() : '';
      const q = String(req.query?.q || '').trim().toLowerCase();

      const period = String(req.query?.period || 'all').toLowerCase().trim();
      const dateRange = getPeriodDateRange(period, req.query?.startDate, req.query?.endDate);
      const sessionFilter = req.query?.session && req.query.session !== 'all' ? req.query.session.trim() : null;
      const channelFilter = req.query?.channel && req.query.channel !== 'all' ? req.query.channel.trim().toUpperCase() : null;

      if (kind === 'contacts') {
        const rows = await db
          .select()
          .from(contacts)
          .where(eq(contacts.companyId, companyId))
          .orderBy(desc(contacts.createdAt));

        const wibParts = Object.fromEntries(
          new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Jakarta',
            month: '2-digit',
            day: '2-digit',
          })
            .formatToParts(new Date())
            .map((p) => [p.type, p.value])
        );
        const curMonth = Number.parseInt(wibParts.month, 10);
        const curDay = Number.parseInt(wibParts.day, 10);

        let matched = rows;
        if (filter === 'group') {
          matched = rows.filter((c) => (c.kategori || '').trim().toLowerCase() === 'grup whatsapp');
        } else {
          const nonGroupContacts = rows.filter(
            (c) => (c.kategori || '').trim().toLowerCase() !== 'grup whatsapp'
          );
          if (filter === 'birthday_today') {
            matched = nonGroupContacts.filter((c) => isBirthdayToday(c.tanggalLahir, curMonth, curDay));
          } else if (filter === 'category' && value) {
            matched = nonGroupContacts.filter(
              (c) => ((c.kategori || '').trim() || 'Tanpa Kategori').toLowerCase() === value.toLowerCase()
            );
          } else {
            matched = nonGroupContacts;
          }
        }

        if (q) {
          matched = matched.filter(
            (c) =>
              (c.namaLengkap || '').toLowerCase().includes(q) ||
              (c.nomorWhatsapp || '').includes(q) ||
              (c.kategori || '').toLowerCase().includes(q) ||
              (c.tags || '').toLowerCase().includes(q)
          );
        }

        return reply.send({
          success: true,
          data: {
            kind: 'contacts',
            totalMatched: matched.length,
            items: matched.slice(0, 200).map((c) => ({
              id: c.id,
              nama_lengkap: c.namaLengkap,
              nama_panggilan: c.namaPanggilan,
              nomor_whatsapp: c.nomorWhatsapp,
              kategori: c.kategori || 'Tanpa Kategori',
              tags: c.tags,
              tanggal_lahir: c.tanggalLahir,
              createdAt: c.createdAt,
            })),
          },
        });
      }

      if (kind === 'recipients') {
        const rows = await db
          .select({
            recipient: campaignRecipients,
            contact: contacts,
            campaign: campaigns,
          })
          .from(campaignRecipients)
          .leftJoin(contacts, eq(campaignRecipients.contactId, contacts.id))
          .leftJoin(campaigns, eq(campaignRecipients.campaignId, campaigns.id))
          .where(eq(campaignRecipients.companyId, companyId))
          .orderBy(desc(campaignRecipients.updatedAt));

        let matched = rows;
        if (dateRange.start || dateRange.end) {
          matched = matched.filter((r) =>
            isDateInRange(r.recipient.sentAt || r.recipient.createdAt, dateRange.start, dateRange.end)
          );
        }

        if (filter === 'sent') {
          matched = matched.filter(
            (r) =>
              r.recipient.status === 'SENT' ||
              r.recipient.status === 'DELIVERED' ||
              r.recipient.status === 'READ' ||
              r.recipient.ackStatus >= 1
          );
        } else if (filter === 'delivered') {
          matched = matched.filter(
            (r) =>
              r.recipient.status === 'DELIVERED' ||
              r.recipient.status === 'READ' ||
              r.recipient.ackStatus >= 2
          );
        } else if (filter === 'read') {
          matched = matched.filter(
            (r) => r.recipient.status === 'READ' || r.recipient.ackStatus >= 3
          );
        } else if (filter === 'failed') {
          matched = matched.filter(
            (r) => r.recipient.status === 'FAILED' || r.recipient.ackStatus === -1
          );
        } else if (filter === 'pending') {
          matched = matched.filter(
            (r) =>
              (r.recipient.status === 'PENDING' || r.recipient.ackStatus === 0) &&
              r.recipient.status !== 'FAILED' &&
              r.recipient.status !== 'SENT' &&
              r.recipient.status !== 'DELIVERED' &&
              r.recipient.status !== 'READ'
          );
        } else if (filter === 'campaign' && value) {
          matched = matched.filter((r) => r.recipient.campaignId === value);
        } else if (filter === 'date' && value) {
          matched = matched.filter(
            (r) => toWibDateKey(r.recipient.sentAt || r.recipient.createdAt) === value
          );
        }

        if (q) {
          matched = matched.filter(
            (r) =>
              (r.contact?.namaLengkap || '').toLowerCase().includes(q) ||
              (r.recipient.phone || '').includes(q) ||
              (r.campaign?.title || '').toLowerCase().includes(q) ||
              (r.recipient.status || '').toLowerCase().includes(q)
          );
        }

        return reply.send({
          success: true,
          data: {
            kind: 'recipients',
            totalMatched: matched.length,
            items: matched.slice(0, 200).map((r) => formatRecipient(r.recipient, r.contact, r.campaign)),
          },
        });
      }

      if (kind === 'csat') {
        const [csatList, convRows] = await Promise.all([
          db
            .select()
            .from(csatResponses)
            .where(and(eq(csatResponses.companyId, companyId), isNotNull(csatResponses.rating)))
            .orderBy(desc(csatResponses.submittedAt)),
          db
            .select({ conv: conversations, contact: contacts })
            .from(conversations)
            .leftJoin(contacts, eq(conversations.contactId, contacts.id))
            .where(eq(conversations.companyId, companyId)),
        ]);

        const convMap = new Map(convRows.map((r) => [r.conv.id, r]));
        const items: any[] = [];
        const seenConvIds = new Set<string>();

        // 1. Process csatResponses rows
        for (const r of csatList) {
          const row = convMap.get(r.conversationId);
          if (row && isExcludedConversation(row.conv)) continue;

          const sess = r.wahaSession || row?.conv.wahaSession || 'Default';
          if (sessionFilter && sess !== sessionFilter) continue;
          const ch = (row?.conv.channel || 'WHATSAPP').toUpperCase();
          if (channelFilter && ch !== channelFilter) continue;

          if (dateRange.start || dateRange.end) {
            const dt = r.submittedAt || r.sentAt;
            if (!isDateInRange(dt, dateRange.start, dateRange.end)) continue;
          }

          const criteriaDetails = extractCsatCriteriaDetails(r);
          const overallScore =
            typeof r.overallScore === 'number' && Number.isFinite(r.overallScore)
              ? r.overallScore
              : r.rating || 0;

          if (filter === 'star' && value) {
            if (String(r.rating) !== value) continue;
          } else if (filter === 'criterion' && value) {
            if (!criteriaDetails.some((cd) => cd.key === value)) continue;
          } else if (filter === 'profile' && value) {
            const profId = r.profileId || 'default';
            if (profId !== value) continue;
          } else if (filter === 'agent' && value) {
            const agName = r.assignedAgentName || row?.conv.assignedAgentName || 'Belum Ditugaskan';
            const agId = r.assignedAgentId || row?.conv.assignedAgentId || '';
            if (agName.toLowerCase() !== value.toLowerCase() && agId !== value) continue;
          }

          seenConvIds.add(r.conversationId);
          const contactName = row ? getConversationDisplayName(row.conv, row.contact) : 'Pelanggan';
          const phone = row?.contact?.nomorWhatsapp || '';

          if (q) {
            const hay = `${contactName} ${phone} ${r.feedback || ''} ${r.assignedAgentName || ''} ${r.profileName || ''}`.toLowerCase();
            if (!hay.includes(q)) continue;
          }

          items.push({
            id: r.id,
            conversationId: r.conversationId,
            token: r.token,
            contactName,
            phone,
            wahaSession: sess,
            agentName: r.assignedAgentName || row?.conv.assignedAgentName || null,
            profileName: r.profileName || 'Umum (Default)',
            rating: r.rating,
            overallScore: Number(overallScore.toFixed(2)),
            criteriaDetails,
            feedback: r.feedback || null,
            conversationStartedAt: r.conversationStartedAt || (row ? getConversationCycleStart(row.conv) : null),
            conversationResolvedAt: r.conversationResolvedAt || row?.conv.resolvedAt || null,
            submittedAt: r.submittedAt || null,
          });
        }

        // 2. Include conversations with legacy csatRating that don't have a row in csatResponses
        for (const row of convRows) {
          const c = row.conv;
          if (seenConvIds.has(c.id)) continue;
          if (isExcludedConversation(c)) continue;
          if (!c.csatRating || c.csatRating < 1 || c.csatRating > 5) continue;

          const sess = c.wahaSession || 'Default';
          if (sessionFilter && sess !== sessionFilter) continue;
          const ch = (c.channel || 'WHATSAPP').toUpperCase();
          if (channelFilter && ch !== channelFilter) continue;

          if (dateRange.start || dateRange.end) {
            const dt = c.csatSubmittedAt || c.resolvedAt || c.updatedAt;
            if (!isDateInRange(dt, dateRange.start, dateRange.end)) continue;
          }

          if (filter === 'star' && value) {
            if (String(c.csatRating) !== value) continue;
          } else if (filter === 'profile' && value) {
            if (value !== 'default') continue;
          } else if (filter === 'agent' && value) {
            const agName = c.assignedAgentName || 'Belum Ditugaskan';
            const agId = c.assignedAgentId || '';
            if (agName.toLowerCase() !== value.toLowerCase() && agId !== value) continue;
          }

          const contactName = getConversationDisplayName(c, row.contact);
          const phone = row.contact?.nomorWhatsapp || '';

          if (q) {
            const hay = `${contactName} ${phone} ${c.csatFeedback || ''} ${c.assignedAgentName || ''}`.toLowerCase();
            if (!hay.includes(q)) continue;
          }

          const overallScore = c.csatOverallScore ?? c.csatRating;
          items.push({
            id: c.id,
            conversationId: c.id,
            token: c.csatToken || null,
            contactName,
            phone,
            wahaSession: sess,
            agentName: c.assignedAgentName || null,
            profileName: 'Umum (Default)',
            rating: c.csatRating,
            overallScore: Number(overallScore.toFixed(2)),
            criteriaDetails: [],
            feedback: c.csatFeedback || null,
            conversationStartedAt: getConversationCycleStart(c),
            conversationResolvedAt: c.resolvedAt || null,
            submittedAt: c.csatSubmittedAt || null,
          });
        }

        items.sort((a, b) => {
          const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
          const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
          return tb - ta;
        });

        return reply.send({
          success: true,
          data: {
            kind: 'csat',
            totalMatched: items.length,
            items: items.slice(0, 200),
          },
        });
      }

      // Default: kind === 'conversations'
      const settings = await getSettingMap(companyId);
      const slaRaw = Number.parseInt(settings.sla_target_minutes || String(DEFAULT_SLA_TARGET_MINUTES), 10);
      const slaTargetSeconds =
        (Number.isFinite(slaRaw) && slaRaw >= 1 ? Math.min(1440, slaRaw) : DEFAULT_SLA_TARGET_MINUTES) * 60;

      const convRows = await db
        .select({ conv: conversations, contact: contacts })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(eq(conversations.companyId, companyId))
        .orderBy(desc(conversations.updatedAt));

      let matched = convRows;

      // Apply active session and channel filters if requested
      if (sessionFilter) {
        matched = matched.filter((r) => (r.conv.wahaSession || 'Default') === sessionFilter);
      }
      if (channelFilter) {
        matched = matched.filter(
          (r) => (r.conv.channel || 'WHATSAPP').toUpperCase() === channelFilter
        );
      }
      // Apply active date range if requested
      if (dateRange.start || dateRange.end) {
        matched = matched.filter((r) => {
          const act = r.conv.lastMessageAt || r.conv.lastInboundAt || r.conv.firstInboundAt || r.conv.createdAt;
          return isDateInRange(act, dateRange.start, dateRange.end);
        });
      }

      if (filter === 'excluded') {
        matched = matched.filter((r) => isExcludedConversation(r.conv));
      } else if (filter === 'group') {
        matched = matched.filter((r) => Boolean(r.conv.isGroup));
      } else {
        const assessedOnly =
          filter === 'date' ? matched : matched.filter((r) => !isExcludedConversation(r.conv));
        if (filter === 'open') {
          matched = assessedOnly.filter((r) => (r.conv.status || 'OPEN').toUpperCase() === 'OPEN');
        } else if (filter === 'unanswered') {
          matched = assessedOnly.filter(
            (r) =>
              (r.conv.status || 'OPEN').toUpperCase() === 'OPEN' &&
              ((Boolean(r.conv.firstInboundAt) && !r.conv.firstResponseAt) || (r.conv.unreadCount ?? 0) > 0)
          );
        } else if (filter === 'pending') {
          matched = assessedOnly.filter((r) => (r.conv.status || 'OPEN').toUpperCase() === 'PENDING');
        } else if (filter === 'resolved') {
          matched = assessedOnly.filter((r) => (r.conv.status || 'OPEN').toUpperCase() === 'RESOLVED');
        } else if (filter === 'frt') {
          matched = assessedOnly.filter(
            (r) =>
              Boolean(r.conv.firstInboundAt && r.conv.firstResponseAt) &&
              new Date(r.conv.firstResponseAt!).getTime() >= new Date(r.conv.firstInboundAt!).getTime()
          );
        } else if (filter === 'resolved_time') {
          matched = assessedOnly.filter((r) => {
            const start = getConversationCycleStart(r.conv);
            return Boolean(r.conv.resolvedAt && start);
          });
        } else if (filter === 'sla_met') {
          matched = assessedOnly.filter((r) => {
            if (!r.conv.firstInboundAt || !r.conv.firstResponseAt) return false;
            const respMs = new Date(r.conv.firstResponseAt).getTime();
            const inbMs = new Date(r.conv.firstInboundAt).getTime();
            if (respMs < inbMs) return false;
            const sec = Math.round((respMs - inbMs) / 1000);
            return sec <= slaTargetSeconds;
          });
        } else if (filter === 'sla_breached') {
          matched = assessedOnly.filter((r) => {
            if (!r.conv.firstInboundAt || !r.conv.firstResponseAt) return false;
            const respMs = new Date(r.conv.firstResponseAt).getTime();
            const inbMs = new Date(r.conv.firstInboundAt).getTime();
            if (respMs < inbMs) return false;
            const sec = Math.round((respMs - inbMs) / 1000);
            return sec > slaTargetSeconds;
          });
        } else if (filter === 'session' && value) {
          matched = assessedOnly.filter(
            (r) => (r.conv.wahaSession || 'Default').toLowerCase() === value.toLowerCase()
          );
        } else if (filter === 'channel' && value) {
          matched = assessedOnly.filter(
            (r) => (r.conv.channel || 'WHATSAPP').toUpperCase() === value.toUpperCase()
          );
        } else if (filter === 'agent' && value) {
          matched = assessedOnly.filter(
            (r) =>
              (r.conv.assignedAgentName || 'Belum Ditugaskan').toLowerCase() === value.toLowerCase() ||
              r.conv.assignedAgentId === value
          );
        } else if (filter === 'date' && value) {
          matched = assessedOnly.filter(
            (r) =>
              toWibDateKey(r.conv.lastMessageAt || r.conv.lastInboundAt || r.conv.firstInboundAt || r.conv.createdAt) === value
          );
        } else {
          matched = assessedOnly;
        }
      }

      if (q) {
        matched = matched.filter((r) => {
          const disp = getConversationDisplayName(r.conv, r.contact);
          const hay = `${disp} ${r.contact?.namaLengkap || ''} ${r.contact?.nomorWhatsapp || ''} ${r.conv.wahaSession || ''} ${r.conv.assignedAgentName || ''} ${r.conv.lastMessage || ''}`.toLowerCase();
          return hay.includes(q);
        });
      }

      return reply.send({
        success: true,
        data: {
          kind: 'conversations',
          totalMatched: matched.length,
          items: matched.slice(0, 200).map(({ conv, contact }) => {
            const hasFrt =
              conv.firstInboundAt &&
              conv.firstResponseAt &&
              new Date(conv.firstResponseAt).getTime() >= new Date(conv.firstInboundAt).getTime();
            const frtSeconds = hasFrt
              ? Math.round(
                  (new Date(conv.firstResponseAt!).getTime() - new Date(conv.firstInboundAt!).getTime()) / 1000
                )
              : null;
            const cycleStart = getConversationCycleStart(conv);
            const resolutionSeconds =
              conv.resolvedAt && cycleStart && new Date(conv.resolvedAt).getTime() >= cycleStart.getTime()
                ? Math.round((new Date(conv.resolvedAt).getTime() - cycleStart.getTime()) / 1000)
                : null;
            return {
              id: conv.id,
              contactId: conv.contactId,
              displayName: getConversationDisplayName(conv, contact),
              contactName: contact?.namaLengkap || 'Pelanggan',
              phone: contact?.nomorWhatsapp || '',
              channel: conv.channel || 'WHATSAPP',
              wahaSession: conv.wahaSession || null,
              status: conv.status || 'OPEN',
              isGroup: Boolean(conv.isGroup),
              excludeFromMetrics: Boolean(conv.excludeFromMetrics),
              excludeReason: conv.excludeReason || null,
              assignedAgentName: conv.assignedAgentName || null,
              frtSeconds,
              resolutionSeconds,
              slaMet: frtSeconds !== null ? frtSeconds <= slaTargetSeconds : null,
              csatScore: conv.csatOverallScore ?? conv.csatRating ?? null,
              lastMessage: conv.lastMessage || '',
              lastMessageAt: conv.lastMessageAt,
            };
          }),
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // CSV Export endpoint for reports (agents | conversations | broadcasts)
  fastify.get<{
    Querystring: {
      type?: string;
      period?: string;
      startDate?: string;
      endDate?: string;
      session?: string;
      channel?: string;
    };
  }>('/export', async (req, reply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const exportType = (req.query?.type || 'conversations').toLowerCase();
      const period = String(req.query?.period || 'all').toLowerCase().trim();
      const dateRange = getPeriodDateRange(period, req.query?.startDate, req.query?.endDate);
      const sessionFilter = req.query?.session && req.query.session !== 'all' ? req.query.session.trim() : null;
      const channelFilter = req.query?.channel && req.query.channel !== 'all' ? req.query.channel.trim().toUpperCase() : null;

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
        let list = await db
          .select()
          .from(campaigns)
          .where(eq(campaigns.companyId, companyId))
          .orderBy(desc(campaigns.createdAt));

        if (dateRange.start || dateRange.end) {
          list = list.filter((c) => isDateInRange(c.createdAt, dateRange.start, dateRange.end));
        }

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

      const settings = await getSettingMap(companyId);
      const slaRaw = Number.parseInt(settings.sla_target_minutes || String(DEFAULT_SLA_TARGET_MINUTES), 10);
      const slaTargetSeconds =
        (Number.isFinite(slaRaw) && slaRaw >= 1 ? Math.min(1440, slaRaw) : DEFAULT_SLA_TARGET_MINUTES) * 60;

      let convRows = await db
        .select({ conv: conversations, contact: contacts })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(eq(conversations.companyId, companyId))
        .orderBy(desc(conversations.updatedAt));

      if (sessionFilter) {
        convRows = convRows.filter((r) => (r.conv.wahaSession || 'Default') === sessionFilter);
      }
      if (channelFilter) {
        convRows = convRows.filter(
          (r) => (r.conv.channel || 'WHATSAPP').toUpperCase() === channelFilter
        );
      }
      if (dateRange.start || dateRange.end) {
        convRows = convRows.filter((r) => {
          const act = r.conv.lastMessageAt || r.conv.lastInboundAt || r.conv.firstInboundAt || r.conv.createdAt;
          return isDateInRange(act, dateRange.start, dateRange.end);
        });
      }

      if (exportType === 'agents') {
        const csatRows = await db
          .select()
          .from(csatResponses)
          .where(and(eq(csatResponses.companyId, companyId), isNotNull(csatResponses.rating)));
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
            criteriaMap: CriterionAggMap;
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
              criteriaMap: new Map(),
            };
            map.set(name, item);
          }
          return item;
        };

        const excludedConvIds = new Set(
          convRows.filter((r) => isExcludedConversation(r.conv)).map((r) => r.conv.id)
        );
        for (const { conv } of convRows) {
          if (isExcludedConversation(conv)) continue;
          const ag = ensure(conv.assignedAgentName || 'Belum Ditugaskan');
          ag.total++;
          if (conv.status === 'RESOLVED') ag.resolved++;
          if (conv.firstInboundAt && conv.firstResponseAt) {
            const respMs = new Date(conv.firstResponseAt).getTime();
            const inbMs = new Date(conv.firstInboundAt).getTime();
            if (respMs >= inbMs) {
              const frt = Math.round((respMs - inbMs) / 1000);
              ag.frtSum += frt;
              ag.frtCount++;
              if (frt <= slaTargetSeconds) ag.slaMet++;
            }
          }
          if (conv.resolvedAt) {
            const cycleStart = getConversationCycleStart(conv);
            if (cycleStart) {
              const resMs = new Date(conv.resolvedAt).getTime();
              const startMs = cycleStart.getTime();
              if (resMs >= startMs) {
                const resSec = Math.round((resMs - startMs) / 1000);
                ag.resSum += resSec;
                ag.resCount++;
              }
            }
          }
        }
        const criterionLabels = new Map<string, string>();
        for (const c of csatRows) {
          if (excludedConvIds.has(c.conversationId)) continue;
          if (dateRange.start || dateRange.end) {
            if (!isDateInRange(c.submittedAt || c.sentAt, dateRange.start, dateRange.end)) continue;
          }
          if (sessionFilter && (c.wahaSession || 'Default') !== sessionFilter) continue;

          if (typeof c.rating === 'number') {
            const ag = ensure(c.assignedAgentName || 'Belum Ditugaskan');
            const scoreVal =
              typeof c.overallScore === 'number' && Number.isFinite(c.overallScore)
                ? c.overallScore
                : c.rating;
            ag.csatSum += scoreVal;
            ag.csatCount++;
            const details = extractCsatCriteriaDetails(c);
            accumulateCriteria(ag.criteriaMap, details);
            for (const d of details) criterionLabels.set(d.key, d.label);
          }
        }

        const allCriterionKeys = Array.from(criterionLabels.entries());
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
            ...allCriterionKeys.map(([, label]) => `CSAT - ${label}`),
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
            ...allCriterionKeys.map(([key]) => {
              const entry = a.criteriaMap.get(key);
              return entry && entry.count > 0 ? (entry.sum / entry.count).toFixed(2) : '';
            }),
          ])
        );
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', 'attachment; filename="laporan-performa-agent-crm.csv"');
        return reply.send(csv);
      }

      const allRatedCsat = await db
        .select()
        .from(csatResponses)
        .where(and(eq(csatResponses.companyId, companyId), isNotNull(csatResponses.rating)))
        .orderBy(desc(csatResponses.submittedAt));
      const latestCsatByConv = new Map<string, CsatCriterionScoreDetail[]>();
      const convCriterionLabels = new Map<string, string>();
      for (const r of allRatedCsat) {
        if (latestCsatByConv.has(r.conversationId)) continue;
        const details = extractCsatCriteriaDetails(r);
        latestCsatByConv.set(r.conversationId, details);
        for (const d of details) convCriterionLabels.set(d.key, d.label);
      }
      const convCriterionCols = Array.from(convCriterionLabels.entries());

      // Default: conversations
      const csv = toCsv(
        [
          'ID Percakapan',
          'Nama Kontak',
          'WhatsApp',
          'Kategori Kontak',
          'Sesi WAHA',
          'Channel',
          'Grup WA',
          'Status Penilaian',
          'Agent',
          'Status',
          'Label',
          'Pesan Masuk Pertama',
          'Respon Pertama',
          'FRT (detik)',
          'Waktu Selesai',
          'Durasi Selesai (detik)',
          'Rating CSAT',
          ...convCriterionCols.map(([, label]) => `CSAT - ${label}`),
        ],
        convRows.map(({ conv, contact }) => {
          const hasFrt =
            conv.firstInboundAt &&
            conv.firstResponseAt &&
            new Date(conv.firstResponseAt).getTime() >= new Date(conv.firstInboundAt).getTime();
          const frtSec = hasFrt
            ? Math.round(
                (new Date(conv.firstResponseAt!).getTime() - new Date(conv.firstInboundAt!).getTime()) / 1000
              )
            : '';
          const cycleStart = getConversationCycleStart(conv);
          const resSec =
            conv.resolvedAt && cycleStart && new Date(conv.resolvedAt).getTime() >= cycleStart.getTime()
              ? Math.round((new Date(conv.resolvedAt).getTime() - cycleStart.getTime()) / 1000)
              : '';
          const details = latestCsatByConv.get(conv.id) || [];
          const excludedLabel = isExcludedConversation(conv)
            ? `Non-Penilaian (${conv.excludeReason || 'Bukan Customer'})`
            : 'Dinilai';
          return [
            conv.id,
            getConversationDisplayName(conv, contact),
            contact?.nomorWhatsapp || '',
            contact?.kategori || '',
            conv.wahaSession || '',
            conv.channel || 'WHATSAPP',
            conv.isGroup ? 'Ya' : 'Tidak',
            excludedLabel,
            conv.assignedAgentName || '',
            conv.status,
            conv.labels || '',
            conv.firstInboundAt ? new Date(conv.firstInboundAt).toISOString() : '',
            conv.firstResponseAt ? new Date(conv.firstResponseAt).toISOString() : '',
            frtSec,
            conv.resolvedAt ? new Date(conv.resolvedAt).toISOString() : '',
            resSec,
            conv.csatOverallScore ?? conv.csatRating ?? '',
            ...convCriterionCols.map(([key]) => details.find((d) => d.key === key)?.score ?? ''),
          ];
        })
      );
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', 'attachment; filename="laporan-percakapan-crm.csv"');
      return reply.send(csv);
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
