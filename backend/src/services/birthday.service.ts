import cron from 'node-cron';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../db';
import {
  birthdaySettings,
  channelAccounts,
  contactIdentities,
  contacts,
} from '../db/schema';
import { BroadcastService } from './broadcast.service';
import { licenseService } from './license.service';
import { OmnichannelType } from './channel.service';
import { formatContact } from '../routes/contacts';
import {
  getActiveCompanyId,
  getCompanySettingValue,
  listActiveCompanyIds,
  runWithCompany,
} from './tenantContext';

export interface BirthdayMultiSenders {
  mode: 'AUTO_MULTI' | 'SINGLE';
  wahaSessions: string[];
  channelAccountIds: string[];
}

function getJakartaParts(d = new Date()): {
  dateStr: string;
  timeStr: string;
  month: number;
  day: number;
} {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const month = Number.parseInt(parts.month, 10);
  const day = Number.parseInt(parts.day, 10);
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    timeStr: `${hour}:${parts.minute}`,
    month,
    day,
  };
}

export class BirthdayService {
  private static cronTask: cron.ScheduledTask | null = null;

  /**
   * Initialize Birthday Cron Scheduler
   */
  public static async initScheduler() {
    console.log('[BirthdayService] Initializing Birthday Greeting Scheduler with Fastify & Drizzle...');

    // Schedule checking every minute
    if (this.cronTask) {
      this.cronTask.stop();
    }

    this.cronTask = cron.schedule('* * * * *', async () => {
      try {
        await BirthdayService.checkAndTriggerDailyBirthday();
      } catch (err) {
        console.error('[BirthdayService] Error in cron check:', err);
      }
    });

    console.log('[BirthdayService] Scheduler initialized successfully.');
  }

  /**
   * Check if today's birthday messages should be triggered
   */
  public static async checkAndTriggerDailyBirthday() {
    const companyIds = await listActiveCompanyIds();
    for (const cid of companyIds) {
      await runWithCompany(cid, async () => {
        try {
          await BirthdayService.checkCompanyBirthday(cid);
        } catch (err) {
          console.error(`[BirthdayService] Error for company ${cid}:`, err);
        }
      });
    }
  }

  private static async checkCompanyBirthday(companyId: string) {
    const list = await db
      .select()
      .from(birthdaySettings)
      .where(eq(birthdaySettings.companyId, companyId));

    const setting = list[0];
    if (!setting || !setting.isEnabled) return;

    const jakarta = getJakartaParts();
    const currentTimeStr = jakarta.timeStr;
    const todayDateStr = jakarta.dateStr;

    if (currentTimeStr === setting.sendTime && setting.lastRunDate !== todayDateStr) {
      const lic = await licenseService.getLicense(companyId);
      if (lic.isExpired || !lic.features.birthdayAutomation) {
        return;
      }
      console.log(`[BirthdayService][${companyId}] Triggering birthday greetings for ${todayDateStr} at ${currentTimeStr}`);
      await this.runBirthdayBroadcast(companyId, todayDateStr);
    }
  }

  /**
   * Run the Birthday broadcast for today's celebrants
   */
  public static async runBirthdayBroadcast(companyIdArg?: string, targetDateStr?: string) {
    const companyId = getActiveCompanyId(companyIdArg);
    const list = await db
      .select()
      .from(birthdaySettings)
      .where(eq(birthdaySettings.companyId, companyId));

    const setting = list[0];
    if (!setting) throw new Error('Pengaturan ulang tahun belum dikonfigurasi.');

    let targetMonth: number;
    let targetDay: number;
    let dateLabel: string;
    if (targetDateStr && /^\d{4}-\d{2}-\d{2}$/.test(targetDateStr)) {
      const [y, m, d] = targetDateStr.split('-').map((n) => Number.parseInt(n, 10));
      targetMonth = m;
      targetDay = d;
      dateLabel = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    } else {
      const jakarta = getJakartaParts(targetDateStr ? new Date(targetDateStr) : new Date());
      targetMonth = jakarta.month;
      targetDay = jakarta.day;
      dateLabel = jakarta.dateStr;
    }

    // Fetch all contacts with tanggal_lahir inside this company
    const allContacts = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.companyId, companyId), isNotNull(contacts.tanggalLahir)));

    const birthdayContacts = allContacts.filter((contact) => {
      if (!contact.tanggalLahir) return false;
      const bDate = new Date(contact.tanggalLahir);
      return bDate.getUTCMonth() + 1 === targetMonth && bDate.getUTCDate() === targetDay;
    });

    if (birthdayContacts.length === 0) {
      console.log(`[BirthdayService] Tidak ada pelanggan yang berulang tahun pada ${dateLabel}`);
      await db
        .update(birthdaySettings)
        .set({ lastRunDate: dateLabel, updatedAt: new Date() })
        .where(eq(birthdaySettings.id, setting.id));
      return { count: 0, message: 'Tidak ada pelanggan yang berulang tahun hari ini.' };
    }

    console.log(`[BirthdayService] Ditemukan ${birthdayContacts.length} pelanggan berulang tahun pada ${dateLabel}`);

    const multiRaw = await getCompanySettingValue('birthday_multi_senders', companyId);

    let multiSenders: BirthdayMultiSenders = {
      mode: 'AUTO_MULTI',
      wahaSessions: setting.wahaSession ? [setting.wahaSession] : [],
      channelAccountIds: setting.channelAccountId ? [setting.channelAccountId] : [],
    };
    if (multiRaw) {
      try {
        const parsed = JSON.parse(multiRaw);
        multiSenders = {
          mode: parsed.mode === 'SINGLE' ? 'SINGLE' : 'AUTO_MULTI',
          wahaSessions: Array.isArray(parsed.wahaSessions) ? parsed.wahaSessions : [],
          channelAccountIds: Array.isArray(parsed.channelAccountIds) ? parsed.channelAccountIds : [],
        };
      } catch {
        // fallback
      }
    }

    if (multiSenders.mode === 'SINGLE') {
      const campaignResult = await BroadcastService.createCampaign({
        companyId,
        title: `Ucapan Ulang Tahun (${dateLabel})`,
        messageTemplate: setting.messageTemplate,
        type: 'BIRTHDAY',
        channel: ((setting.channel || 'WHATSAPP').toUpperCase() as OmnichannelType),
        channelAccountId: setting.channelAccountId || null,
        delaySeconds: setting.delaySeconds || 5,
        intervalSeconds: 15,
        batchSize: 5,
        sessionName: setting.wahaSession || undefined,
        contactIds: birthdayContacts.map((c) => c.id),
      });

      await db
        .update(birthdaySettings)
        .set({ lastRunDate: dateLabel, updatedAt: new Date() })
        .where(eq(birthdaySettings.id, setting.id));

      return {
        count: birthdayContacts.length,
        campaign: campaignResult.campaign,
        contacts: birthdayContacts,
      };
    }

    // Multi-channel & multi-session routing
    const contactIds = birthdayContacts.map((c) => c.id);
    const idRows = await db
      .select()
      .from(contactIdentities)
      .where(and(eq(contactIdentities.companyId, companyId), inArray(contactIdentities.contactId, contactIds)));
    const identitiesByContact = new Map<string, typeof idRows>();
    for (const r of idRows) {
      const arr = identitiesByContact.get(r.contactId) || [];
      arr.push(r);
      identitiesByContact.set(r.contactId, arr);
    }

    const activeAccounts = await db
      .select()
      .from(channelAccounts)
      .where(and(eq(channelAccounts.companyId, companyId), eq(channelAccounts.isActive, true)));
    const selectedAccounts =
      multiSenders.channelAccountIds.length > 0
        ? activeAccounts.filter((a) => multiSenders.channelAccountIds.includes(a.id))
        : activeAccounts;

    type GroupKey = string;
    const groups = new Map<
      GroupKey,
      { channel: OmnichannelType; sessionName?: string; channelAccountId?: string | null; contactIds: string[] }
    >();
    let waRoundRobinIdx = 0;

    for (const c of birthdayContacts) {
      const cIdentities = identitiesByContact.get(c.id) || [];
      let assigned = false;

      // 1. Prefer WhatsApp if contact has WA number and WA is not explicitly excluded
      const waAllowed =
        multiSenders.wahaSessions.length > 0 || multiSenders.channelAccountIds.length === 0;
      if (c.nomorWhatsapp && waAllowed) {
        const sessionName =
          multiSenders.wahaSessions.length > 0
            ? multiSenders.wahaSessions[waRoundRobinIdx % multiSenders.wahaSessions.length]
            : setting.wahaSession || undefined;
        waRoundRobinIdx++;
        const key = `WHATSAPP::${sessionName || 'default'}`;
        const grp = groups.get(key) || {
          channel: 'WHATSAPP',
          sessionName,
          channelAccountId: null,
          contactIds: [],
        };
        grp.contactIds.push(c.id);
        groups.set(key, grp);
        assigned = true;
      }

      // 2. Otherwise match any enabled omnichannel identity (Telegram, Instagram, Facebook, Threads)
      if (!assigned && cIdentities.length > 0) {
        for (const acc of selectedAccounts) {
          if (cIdentities.some((ci) => ci.channel === acc.channel)) {
            const key = `${acc.channel}::${acc.id}`;
            const grp = groups.get(key) || {
              channel: acc.channel as OmnichannelType,
              channelAccountId: acc.id,
              contactIds: [],
            };
            grp.contactIds.push(c.id);
            groups.set(key, grp);
            assigned = true;
            break;
          }
        }
      }
    }

    let firstCampaign: any = null;
    for (const grp of groups.values()) {
      const res = await BroadcastService.createCampaign({
        companyId,
        title: `Ucapan Ulang Tahun ${grp.channel} (${dateLabel})`,
        messageTemplate: setting.messageTemplate,
        type: 'BIRTHDAY',
        channel: grp.channel,
        channelAccountId: grp.channelAccountId || null,
        delaySeconds: setting.delaySeconds || 5,
        intervalSeconds: 15,
        batchSize: 5,
        sessionName: grp.sessionName,
        contactIds: grp.contactIds,
      });
      if (!firstCampaign) firstCampaign = res.campaign;
    }

    await db
      .update(birthdaySettings)
      .set({ lastRunDate: dateLabel, updatedAt: new Date() })
      .where(eq(birthdaySettings.id, setting.id));

    return {
      count: birthdayContacts.length,
      campaign: firstCampaign,
      contacts: birthdayContacts,
    };
  }

  /**
   * Get contacts celebrating birthday today or registered
   */
  public static async getBirthdayContacts(companyIdArg?: string) {
    const companyId = getActiveCompanyId(companyIdArg);
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    const allContacts = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.companyId, companyId), isNotNull(contacts.tanggalLahir)));

    const todayList = allContacts.filter((c) => {
      if (!c.tanggalLahir) return false;
      const bDate = new Date(c.tanggalLahir);
      return bDate.getMonth() + 1 === currentMonth && bDate.getDate() === currentDay;
    });

    const todayIds = todayList.map((c) => c.id);
    const idMap = new Map<string, any[]>();
    if (todayIds.length > 0) {
      const idRows = await db
        .select()
        .from(contactIdentities)
        .where(and(eq(contactIdentities.companyId, companyId), inArray(contactIdentities.contactId, todayIds)));
      for (const r of idRows) {
        const arr = idMap.get(r.contactId) || [];
        arr.push(r);
        idMap.set(r.contactId, arr);
      }
    }

    return {
      today: todayList.map((c) => ({
        ...formatContact(c),
        identities: idMap.get(c.id) || [],
      })),
      totalRegistered: allContacts.length,
    };
  }
}
