import axios from 'axios';
import { db } from '../db';
import { systemSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { config } from '../config';

export interface LicenseInfo {
  status: 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'GRACE_PERIOD';
  plan: string; // e.g. "Bulanan (Pro)", "Tahunan", "Free Trial"
  period: 'monthly' | 'quarterly' | 'annual' | 'trial';
  expiresAt: string; // ISO string
  daysLeft: number;
  isExpired: boolean;
  managedByReneo: boolean;
  reneoBillingUrl: string;
  licenseKey?: string;
  features: {
    unlimitedBroadcast: boolean;
    birthdayAutomation: boolean;
    liveChatCrm: boolean;
    maxContacts: number;
  };
}

export class LicenseService {
  private static instance: LicenseService;
  private cachedLicense: LicenseInfo | null = null;
  private lastCheckedAt: number = 0;
  private readonly CACHE_TTL_MS = 1000 * 60 * 15; // 15 minutes cache

  private constructor() {}

  public static getInstance(): LicenseService {
    if (!LicenseService.instance) {
      LicenseService.instance = new LicenseService();
    }
    return LicenseService.instance;
  }

  /**
   * Get current license information, synced with Reneo Panel
   */
  public async getLicense(): Promise<LicenseInfo> {
    const now = Date.now();
    if (this.cachedLicense && now - this.lastCheckedAt < this.CACHE_TTL_MS) {
      return this.cachedLicense;
    }

    return await this.syncWithReneo();
  }

  /**
   * Synchronize license status with Reneo Homeserver Desktop
   */
  public async syncWithReneo(): Promise<LicenseInfo> {
    const reneoUrl = process.env.RENEO_PANEL_URL || 'http://host.docker.internal:8000';
    const appToken = process.env.RENEO_APP_TOKEN || '';

    try {
      // 1. Try checking with Reneo panel endpoint if reachable
      if (reneoUrl) {
        try {
          const res = await axios.get(`${reneoUrl.replace(/\/+$/, '')}/api/v1/app-catalog/license/reneo-crm`, {
            headers: {
              'X-Reneo-App-Token': appToken,
              Accept: 'application/json',
            },
            timeout: 5000,
          });

          if (res.data && res.data.ok) {
            const data = res.data;
            const expDate = new Date(data.expiresAt);
            const now = new Date();
            const daysLeft = Math.max(0, Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
            const isExpired = expDate.getTime() < now.getTime();

            this.cachedLicense = {
              status: isExpired ? 'EXPIRED' : data.status || 'ACTIVE',
              plan: data.plan || 'Bulanan (Pro)',
              period: data.period || 'monthly',
              expiresAt: data.expiresAt,
              daysLeft,
              isExpired,
              managedByReneo: true,
              reneoBillingUrl: data.billingUrl || `${reneoUrl}/hosting`,
              licenseKey: data.licenseKey,
              features: {
                unlimitedBroadcast: true,
                birthdayAutomation: true,
                liveChatCrm: true,
                maxContacts: data.maxContacts || 10000,
              },
            };
            this.lastCheckedAt = Date.now();
            return this.cachedLicense;
          }
        } catch {
          // If Reneo panel endpoint is not answering yet, fallback to local DB settings
        }
      }

      // 2. Read from internal database settings
      const settings = await db.select().from(systemSettings);
      const planSetting = settings.find((s) => s.key === 'license_plan');
      const expiresSetting = settings.find((s) => s.key === 'license_expires_at');
      const keySetting = settings.find((s) => s.key === 'license_key');

      const now = new Date();
      // Default: 14-day trial from installation if not yet set
      let expiresAt: Date;
      let plan = planSetting?.value || 'Trial 14 Hari (Reneo)';

      if (expiresSetting?.value) {
        expiresAt = new Date(expiresSetting.value);
      } else {
        expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
        await db
          .insert(systemSettings)
          .values({
            key: 'license_expires_at',
            value: expiresAt.toISOString(),
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: systemSettings.key,
            set: { value: expiresAt.toISOString(), updatedAt: now },
          });
      }

      const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      const isExpired = expiresAt.getTime() < now.getTime();

      this.cachedLicense = {
        status: isExpired ? 'EXPIRED' : plan.includes('Trial') ? 'TRIAL' : 'ACTIVE',
        plan,
        period: plan.toLowerCase().includes('tahun') ? 'annual' : 'monthly',
        expiresAt: expiresAt.toISOString(),
        daysLeft,
        isExpired,
        managedByReneo: true,
        reneoBillingUrl: `${reneoUrl}/hosting`,
        licenseKey: keySetting?.value || 'RENEO-MANAGED-CRM',
        features: {
          unlimitedBroadcast: !isExpired,
          birthdayAutomation: !isExpired,
          liveChatCrm: true,
          maxContacts: 5000,
        },
      };
      this.lastCheckedAt = Date.now();
      return this.cachedLicense;
    } catch (err) {
      console.error('[LicenseService] Error resolving license:', err);
      // Fail-safe default
      return {
        status: 'ACTIVE',
        plan: 'Bulanan (Pro Reneo)',
        period: 'monthly',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        daysLeft: 30,
        isExpired: false,
        managedByReneo: true,
        reneoBillingUrl: `${reneoUrl}/hosting`,
        features: {
          unlimitedBroadcast: true,
          birthdayAutomation: true,
          liveChatCrm: true,
          maxContacts: 10000,
        },
      };
    }
  }

  /**
   * Enforce active license before running broadcasts
   */
  public async assertLicenseActive(): Promise<void> {
    const lic = await this.getLicense();
    if (lic.isExpired || lic.status === 'EXPIRED') {
      throw new Error(
        `Lisensi CRM di Reneo telah berakhir (${lic.plan}). Silakan perpanjang pembayaran di panel Reneo untuk melanjutkan siaran.`
      );
    }
  }

  /**
   * Update license locally when Reneo issues a renewal
   */
  public async updateLicense(data: {
    plan: string;
    expiresAt: string;
    licenseKey?: string;
  }) {
    const now = new Date();
    await db
      .insert(systemSettings)
      .values({ key: 'license_plan', value: data.plan, updatedAt: now })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: data.plan, updatedAt: now },
      });

    await db
      .insert(systemSettings)
      .values({ key: 'license_expires_at', value: data.expiresAt, updatedAt: now })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: data.expiresAt, updatedAt: now },
      });

    if (data.licenseKey) {
      await db
        .insert(systemSettings)
        .values({ key: 'license_key', value: data.licenseKey, updatedAt: now })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: data.licenseKey, updatedAt: now },
        });
    }

    this.cachedLicense = null;
    return await this.getLicense();
  }
}

export const licenseService = LicenseService.getInstance();

