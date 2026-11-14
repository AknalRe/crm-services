import cron from 'node-cron';
import { eq, isNotNull } from 'drizzle-orm';
import { db } from '../db';
import { birthdaySettings, contacts } from '../db/schema';
import { BroadcastService } from './broadcast.service';
import { licenseService } from './license.service';
import { formatContact } from '../routes/contacts';

function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
    const list = await db
      .select()
      .from(birthdaySettings)
      .where(eq(birthdaySettings.id, 'default'));

    const setting = list[0];
    if (!setting || !setting.isEnabled) return;

    const now = new Date();
    const currentHour = String(now.getHours()).padStart(2, '0');
    const currentMinute = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentHour}:${currentMinute}`;
    const todayDateStr = formatLocalDate(now);

    if (currentTimeStr === setting.sendTime && setting.lastRunDate !== todayDateStr) {
      const lic = await licenseService.getLicense();
      if (lic.isExpired || !lic.features.birthdayAutomation) {
        return;
      }
      console.log(`[BirthdayService] Triggering scheduled birthday greetings for ${todayDateStr} at ${currentTimeStr}`);
      await this.runBirthdayBroadcast(todayDateStr);
    }
  }

  /**
   * Run the Birthday broadcast for today's celebrants
   */
  public static async runBirthdayBroadcast(targetDateStr?: string) {
    const list = await db
      .select()
      .from(birthdaySettings)
      .where(eq(birthdaySettings.id, 'default'));

    const setting = list[0];
    if (!setting) throw new Error('Pengaturan ulang tahun belum dikonfigurasi.');

    const now = targetDateStr ? new Date(targetDateStr) : new Date();
    const targetMonth = now.getMonth() + 1;
    const targetDay = now.getDate();
    const dateLabel = formatLocalDate(now);

    // Fetch all contacts with tanggal_lahir
    const allContacts = await db
      .select()
      .from(contacts)
      .where(isNotNull(contacts.tanggalLahir));

    const birthdayContacts = allContacts.filter((contact) => {
      if (!contact.tanggalLahir) return false;
      const bDate = new Date(contact.tanggalLahir);
      return bDate.getMonth() + 1 === targetMonth && bDate.getDate() === targetDay;
    });

    if (birthdayContacts.length === 0) {
      console.log(`[BirthdayService] Tidak ada pelanggan yang berulang tahun pada ${dateLabel}`);
      await db
        .update(birthdaySettings)
        .set({ lastRunDate: dateLabel, updatedAt: new Date() })
        .where(eq(birthdaySettings.id, 'default'));
      return { count: 0, message: 'Tidak ada pelanggan yang berulang tahun hari ini.' };
    }

    console.log(`[BirthdayService] Ditemukan ${birthdayContacts.length} pelanggan berulang tahun pada ${dateLabel}`);

    const campaignResult = await BroadcastService.createCampaign({
      title: `Ucapan Ulang Tahun (${dateLabel})`,
      messageTemplate: setting.messageTemplate,
      type: 'BIRTHDAY',
      delaySeconds: setting.delaySeconds || 5,
      intervalSeconds: 15,
      batchSize: 5,
      sessionName: setting.wahaSession || undefined,
      contactIds: birthdayContacts.map((c) => c.id),
    });

    await db
      .update(birthdaySettings)
      .set({ lastRunDate: dateLabel, updatedAt: new Date() })
      .where(eq(birthdaySettings.id, 'default'));

    return {
      count: birthdayContacts.length,
      campaign: campaignResult.campaign,
      contacts: birthdayContacts,
    };
  }

  /**
   * Get contacts celebrating birthday today or registered
   */
  public static async getBirthdayContacts() {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    const allContacts = await db
      .select()
      .from(contacts)
      .where(isNotNull(contacts.tanggalLahir));

    const todayList = allContacts.filter((c) => {
      if (!c.tanggalLahir) return false;
      const bDate = new Date(c.tanggalLahir);
      return bDate.getMonth() + 1 === currentMonth && bDate.getDate() === currentDay;
    });

    return {
      today: todayList.map(formatContact),
      totalRegistered: allContacts.length,
    };
  }
}
