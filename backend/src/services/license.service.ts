import axios from 'axios';
import { db } from '../db';
import { systemSettings } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { config } from '../config';

export interface LicenseInfo {
  status: 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'SUSPENDED' | 'GRACE_PERIOD' | 'UNLICENSED';
  plan: string; // e.g. "Bulanan (Pro)", "Tahunan", "Free Trial"
  period: 'monthly' | 'quarterly' | 'annual' | 'trial';
  expiresAt: string; // ISO string
  startedAt?: string;
  priceAmount?: number;
  daysLeft: number;
  isExpired: boolean;
  managedByReneo: boolean;
  reneoBillingUrl: string;
  licenseKey?: string;
  publicUrls?: string[];
  features: {
    unlimitedBroadcast: boolean;
    maxBroadcastPerMonth: number;
    birthdayAutomation: boolean;
    liveChatCrm: boolean;
    multiSession: boolean;
    maxSessions: number;
    maxContacts: number;
    maxTemplates: number;
    maxUsers: number;
    multiAgent: boolean;
    maxAgents: number;
    apiAccess: boolean;
    supportPriority: string;
  };
}

function buildLockedFeatures(): LicenseInfo['features'] {
  return {
    unlimitedBroadcast: false,
    maxBroadcastPerMonth: 0,
    birthdayAutomation: false,
    liveChatCrm: false,
    multiSession: false,
    maxSessions: 0,
    maxContacts: 0,
    maxTemplates: 0,
    maxUsers: 0,
    multiAgent: false,
    maxAgents: 0,
    apiAccess: false,
    supportPriority: 'standard',
  };
}

function resolveFeatures(raw: any, isExpired: boolean, planName?: string): LicenseInfo['features'] {
  if (isExpired) return buildLockedFeatures();

  const src = raw && typeof raw === 'object' ? raw : {};
  const isStarter = (planName || '').toLowerCase().includes('starter');
  const isEnterprise = (planName || '').toLowerCase().includes('enterprise');

  const unlimitedBroadcast =
    src.unlimitedBroadcast !== undefined ? Boolean(src.unlimitedBroadcast) : !isStarter;
  const maxBroadcastPerMonth = unlimitedBroadcast
    ? 0
    : typeof src.maxBroadcastPerMonth === 'number' && src.maxBroadcastPerMonth >= 0
    ? src.maxBroadcastPerMonth
    : 500;
  const birthdayAutomation =
    src.birthdayBot !== undefined
      ? Boolean(src.birthdayBot)
      : src.birthdayAutomation !== undefined
      ? Boolean(src.birthdayAutomation)
      : true;
  const liveChatCrm =
    src.liveChat !== undefined
      ? Boolean(src.liveChat)
      : src.liveChatCrm !== undefined
      ? Boolean(src.liveChatCrm)
      : !isStarter;
  const multiSession =
    src.multiSession !== undefined ? Boolean(src.multiSession) : liveChatCrm || unlimitedBroadcast;
  const maxSessions =
    typeof src.maxSessions === 'number' && src.maxSessions > 0
      ? src.maxSessions
      : multiSession
      ? isEnterprise
        ? 25
        : 5
      : 1;
  const maxContacts =
    typeof src.maxContacts === 'number' && src.maxContacts >= 0
      ? src.maxContacts
      : isStarter
      ? 1000
      : isEnterprise
      ? 50000
      : 10000;
  const maxTemplates =
    typeof src.maxTemplates === 'number' && src.maxTemplates >= 0 ? src.maxTemplates : 0;
  const multiAgent =
    src.multiAgent !== undefined ? Boolean(src.multiAgent) : !isStarter;
  const maxAgents =
    typeof src.maxAgents === 'number' && src.maxAgents > 0
      ? src.maxAgents
      : typeof src.maxUsers === 'number' && src.maxUsers > 0
      ? src.maxUsers
      : multiAgent
      ? isEnterprise
        ? 25
        : 5
      : 1;
  const maxUsers = maxAgents;
  const apiAccess =
    src.apiAccess !== undefined ? Boolean(src.apiAccess) : !isStarter;
  const supportPriority =
    typeof src.supportPriority === 'string' && src.supportPriority
      ? src.supportPriority
      : isEnterprise
      ? 'vip'
      : isStarter
      ? 'standard'
      : 'fast';

  return {
    unlimitedBroadcast,
    maxBroadcastPerMonth,
    birthdayAutomation,
    liveChatCrm,
    multiSession,
    maxSessions,
    maxContacts,
    maxTemplates,
    maxUsers,
    multiAgent,
    maxAgents,
    apiAccess,
    supportPriority,
  };
}

export class LicenseService {
  private static instance: LicenseService;
  private cachedLicense: LicenseInfo | null = null;
  private lastCheckedAt: number = 0;
  private readonly CACHE_TTL_MS = 1000 * 60 * 15; // 15 minutes cache

  private constructor() {}

  private getReneoHeaders(): Record<string, string> {
    const token = (config.reneo.appToken || process.env.RENEO_APP_TOKEN || '').trim();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) {
      headers['X-Reneo-App-Token'] = token;
    }
    return headers;
  }

  public static getInstance(): LicenseService {
    if (!LicenseService.instance) {
      LicenseService.instance = new LicenseService();
    }
    return LicenseService.instance;
  }

  public getCachedPublicUrls(): string[] {
    return Array.isArray(this.cachedLicense?.publicUrls) ? this.cachedLicense.publicUrls : [];
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
    const reneoUrl = config.reneo.panelUrl || process.env.RENEO_PANEL_URL || 'http://host.docker.internal:8000';

    try {
      // 1. Try checking with Reneo panel endpoint if reachable
      if (reneoUrl) {
        try {
          const res = await axios.get(`${reneoUrl.replace(/\/+$/, '')}/api/v1/app-catalog/license/reneo-crm`, {
            headers: this.getReneoHeaders(),
            timeout: 5000,
          });

          if (res.data && res.data.ok && res.data.status === 'UNLICENSED') {
            await db
              .delete(systemSettings)
              .where(inArray(systemSettings.key, ['license_key', 'license_plan', 'license_expires_at', 'license_features']));

            this.cachedLicense = {
              status: 'UNLICENSED',
              plan: 'Belum Diaktivasi',
              period: 'monthly',
              expiresAt: new Date().toISOString(),
              daysLeft: 0,
              isExpired: true,
              managedByReneo: true,
              reneoBillingUrl: res.data.billingUrl || `${reneoUrl}/hosting`,
              features: buildLockedFeatures(),
            };
            this.lastCheckedAt = Date.now();
            return this.cachedLicense;
          }

          if (res.data && res.data.ok && (res.data.status === 'SUSPENDED' || res.data.isSuspended)) {
            this.cachedLicense = {
              status: 'SUSPENDED',
              plan: res.data.plan || 'Disuspend',
              period: res.data.period || 'monthly',
              expiresAt: res.data.expiresAt || new Date().toISOString(),
              daysLeft: 0,
              isExpired: true,
              managedByReneo: true,
              reneoBillingUrl: res.data.billingUrl || `${reneoUrl}/hosting`,
              licenseKey: res.data.licenseKey,
              features: buildLockedFeatures(),
            };
            this.lastCheckedAt = Date.now();
            return this.cachedLicense;
          }

          if (
            res.data &&
            res.data.ok &&
            res.data.status !== 'UNLICENSED' &&
            res.data.status !== 'SUSPENDED' &&
            !res.data.isSuspended &&
            !res.data.isExpired &&
            res.data.licenseKey &&
            res.data.licenseKey !== 'RN-CRM-DEMO-2026'
          ) {
            const data = res.data;
            const expDate = new Date(data.expiresAt);
            const now = new Date();
            const daysLeft = Math.max(0, Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
            const isExpired = expDate.getTime() < now.getTime();
            const planName = data.plan || 'Pro Bulanan';
            const features = resolveFeatures(data.features, isExpired, planName);

            // Persist synced license metadata & features for offline fallback
            const syncPairs = [
              { key: 'license_plan', value: planName },
              { key: 'license_expires_at', value: expDate.toISOString() },
              { key: 'license_key', value: String(data.licenseKey) },
              { key: 'license_features', value: JSON.stringify(features) },
            ];
            for (const pair of syncPairs) {
              await db
                .insert(systemSettings)
                .values({ key: pair.key, value: pair.value, updatedAt: now })
                .onConflictDoUpdate({
                  target: systemSettings.key,
                  set: { value: pair.value, updatedAt: now },
                });
            }

            this.cachedLicense = {
              status: isExpired ? 'EXPIRED' : data.status || 'ACTIVE',
              plan: planName,
              period: data.period || 'monthly',
              startedAt: data.startedAt ? String(data.startedAt) : undefined,
              priceAmount:
                typeof data.priceAmount === 'number' && data.priceAmount >= 0
                  ? data.priceAmount
                  : undefined,
              expiresAt: data.expiresAt,
              daysLeft,
              isExpired,
              managedByReneo: true,
              reneoBillingUrl: data.billingUrl || `${reneoUrl}/hosting`,
              publicUrls: Array.isArray(data.publicUrls) ? data.publicUrls.map(String) : undefined,
              licenseKey: data.licenseKey,
              features,
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
      const featuresSetting = settings.find((s) => s.key === 'license_features');

      const now = new Date();
      if (!keySetting?.value || !expiresSetting?.value) {
        this.cachedLicense = {
          status: 'UNLICENSED',
          plan: 'Belum Diaktivasi',
          period: 'monthly',
          expiresAt: now.toISOString(),
          daysLeft: 0,
          isExpired: true,
          managedByReneo: true,
          reneoBillingUrl: `${reneoUrl}/hosting`,
          features: buildLockedFeatures(),
        };
        this.lastCheckedAt = Date.now();
        return this.cachedLicense;
      }

      const expiresAt = new Date(expiresSetting.value);
      const plan = planSetting?.value || 'Lisensi Aktif';
      const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      const isExpired = expiresAt.getTime() < now.getTime();
      let parsedRawFeatures: any = null;
      if (featuresSetting?.value) {
        try {
          parsedRawFeatures = JSON.parse(featuresSetting.value);
        } catch {
          parsedRawFeatures = null;
        }
      }

      const isTrial = plan.toLowerCase().includes('trial');
      this.cachedLicense = {
        status: isExpired ? 'EXPIRED' : isTrial ? 'TRIAL' : 'ACTIVE',
        plan,
        period: isTrial ? 'trial' : plan.toLowerCase().includes('tahun') ? 'annual' : 'monthly',
        expiresAt: expiresAt.toISOString(),
        daysLeft,
        isExpired,
        managedByReneo: true,
        reneoBillingUrl: `${reneoUrl}/hosting`,
        licenseKey: keySetting.value,
        features: resolveFeatures(parsedRawFeatures, isExpired, plan),
      };
      this.lastCheckedAt = Date.now();
      return this.cachedLicense;
    } catch (err) {
      console.error('[LicenseService] Error resolving license:', err);
      return {
        status: 'UNLICENSED',
        plan: 'Belum Diaktivasi',
        period: 'monthly',
        expiresAt: new Date().toISOString(),
        daysLeft: 0,
        isExpired: true,
        managedByReneo: true,
        reneoBillingUrl: `${reneoUrl}/hosting`,
        features: buildLockedFeatures(),
      };
    }
  }

  /**
   * Enforce active license before running protected operations
   */
  public async assertLicenseActive(): Promise<LicenseInfo> {
    const lic = await this.getLicense();
    if (lic.status === 'SUSPENDED') {
      const err: any = new Error(
        `Lisensi aplikasi Anda sedang disuspend oleh administrator (${lic.plan}). Hubungi admin untuk mengaktifkan kembali.`
      );
      err.statusCode = 403;
      throw err;
    }
    if (lic.isExpired || lic.status === 'EXPIRED' || lic.status === 'UNLICENSED') {
      const err: any = new Error(
        lic.status === 'UNLICENSED'
          ? 'Lisensi CRM belum diaktivasi. Pilih atau aktivasi paket lisensi di panel Reneo terlebih dahulu.'
          : `Lisensi CRM di Reneo telah berakhir (${lic.plan}). Silakan perpanjang pembayaran di panel Reneo untuk melanjutkan.`
      );
      err.statusCode = 403;
      throw err;
    }
    return lic;
  }

  /**
   * Enforce a specific licensed feature (e.g. liveChatCrm, multiSession)
   */
  public async assertFeature(
    feature: 'liveChatCrm' | 'multiSession' | 'birthdayAutomation' | 'unlimitedBroadcast',
    customMessage?: string
  ): Promise<LicenseInfo> {
    const lic = await this.assertLicenseActive();
    if (!lic.features[feature]) {
      const labels: Record<string, string> = {
        liveChatCrm: 'Live Chat CRM (Percakapan)',
        multiSession: 'Multi-Sesi WhatsApp',
        birthdayAutomation: 'Otomasi Ulang Tahun',
        unlimitedBroadcast: 'Siaran Tanpa Batas',
      };
      const err: any = new Error(
        customMessage ||
          `Fitur ${labels[feature] || feature} terkunci pada paket "${lic.plan}". Upgrade ke paket Pro Bulanan atau Enterprise untuk membukanya.`
      );
      err.statusCode = 403;
      throw err;
    }
    return lic;
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

  /**
   * Activate license using a license key issued by Reneo
   */
  public async activateLicenseKey(licenseKey: string): Promise<LicenseInfo> {
    const cleanKey = String(licenseKey || '').trim();
    if (!cleanKey || cleanKey.length < 8) {
      throw new Error('Kunci lisensi tidak valid (minimal 8 karakter).');
    }

    const reneoUrl = config.reneo.panelUrl || process.env.RENEO_PANEL_URL || 'http://host.docker.internal:8000';
    try {
      const verifyRes = await axios.get(`${reneoUrl.replace(/\/+$/, '')}/api/v1/app-licenses/verify`, {
        params: { key: cleanKey, catalogId: 'reneo-crm' },
        headers: this.getReneoHeaders(),
        timeout: 5000,
      });
      if (!verifyRes.data || !verifyRes.data.valid) {
        const err: any = new Error(
          verifyRes.data?.message || 'Kunci lisensi tidak valid, sudah berakhir, atau bukan untuk Reneo CRM.'
        );
        err.statusCode = 400;
        throw err;
      }

      const now = new Date();
      const features = resolveFeatures(verifyRes.data.features, false, verifyRes.data.planName);
      const pairs = [
        { key: 'license_plan', value: verifyRes.data.planName || 'Lisensi Aktif (Reneo CRM)' },
        { key: 'license_expires_at', value: verifyRes.data.expiresAt },
        { key: 'license_key', value: cleanKey },
        { key: 'license_features', value: JSON.stringify(features) },
      ];
      for (const pair of pairs) {
        if (!pair.value) continue;
        await db
          .insert(systemSettings)
          .values({ key: pair.key, value: String(pair.value), updatedAt: now })
          .onConflictDoUpdate({
            target: systemSettings.key,
            set: { value: String(pair.value), updatedAt: now },
          });
      }
      this.cachedLicense = null;
      const synced = await this.syncWithReneo();
      return synced.status !== 'UNLICENSED' ? synced : this.getLicense();
    } catch (err: any) {
      if (err?.response?.data?.message || err?.response?.data?.error) {
        const e: any = new Error(err.response.data.message || err.response.data.error);
        e.statusCode = err.response.status >= 400 && err.response.status < 500 ? err.response.status : 400;
        throw e;
      }
      if (err?.statusCode) {
        throw err;
      }
      if (err?.message && !err?.isAxiosError) {
        throw err;
      }
      const e: any = new Error(
        'Tidak dapat memverifikasi kunci lisensi ke panel Reneo. Pastikan server panel Reneo aktif dan terhubung.'
      );
      e.statusCode = 502;
      throw e;
    }
  }

  /**
   * Fetch available license plans configured in Reneo
   */
  public async getPlans(): Promise<any[]> {
    const reneoUrl = process.env.RENEO_PANEL_URL || 'http://host.docker.internal:8000';
    try {
      const res = await axios.get(`${reneoUrl.replace(/\/+$/, '')}/api/v1/app-catalog/plans/reneo-crm`, {
        timeout: 5000,
      });
      if (res.data && res.data.ok && Array.isArray(res.data.plans)) {
        return res.data.plans;
      }
    } catch {
      // Fallback preset plans if Reneo is offline
    }

    return [
      {
        id: 1,
        catalogId: 'reneo-crm',
        slug: 'starter-monthly',
        name: 'Starter Bulanan',
        tagline: 'Cocok untuk UMKM pemula yang mulai mengelola kontak & broadcast WhatsApp.',
        period: 'monthly',
        months: 1,
        trialDays: 7,
        priceAmount: 49000,
        highlighted: false,
        features: {
          unlimitedBroadcast: false,
          maxContacts: 1000,
          birthdayBot: true,
          liveChat: false,
          multiSession: false,
          maxSessions: 1,
          multiAgent: false,
          maxAgents: 1,
          wahaSync: true,
        },
      },
      {
        id: 2,
        catalogId: 'reneo-crm',
        slug: 'pro-monthly',
        name: 'Pro Bulanan',
        tagline: 'Fitur komprehensif lengkap: broadcast tanpa batas, bot ultah, multi-sesi, dan Live Chat CRM.',
        period: 'monthly',
        months: 1,
        trialDays: 7,
        priceAmount: 99000,
        highlighted: true,
        features: {
          unlimitedBroadcast: true,
          maxContacts: 10000,
          birthdayBot: true,
          liveChat: true,
          multiSession: true,
          maxSessions: 5,
          multiAgent: true,
          maxAgents: 5,
          wahaSync: true,
        },
      },
      {
        id: 3,
        catalogId: 'reneo-crm',
        slug: 'enterprise-annual',
        name: 'Enterprise Tahunan',
        tagline: 'Paket tahunan hemat 17%: kapasitas kontak masif, multi-sesi hingga 25 akun, & support prioritas.',
        period: 'annual',
        months: 12,
        trialDays: 7,
        priceAmount: 990000,
        highlighted: false,
        features: {
          unlimitedBroadcast: true,
          maxContacts: 50000,
          birthdayBot: true,
          liveChat: true,
          multiSession: true,
          maxSessions: 25,
          multiAgent: true,
          maxAgents: 25,
          wahaSync: true,
        },
      },
    ];
  }

  /**
   * Start a 7-day trial for any plan tier via Reneo (with one-time offline dev fallback only if panel unreachable)
   */
  public async startTrial(planSlug: string): Promise<LicenseInfo> {
    const reneoUrl = config.reneo.panelUrl || process.env.RENEO_PANEL_URL || 'http://host.docker.internal:8000';
    const slug = (planSlug || 'pro-monthly').trim();
    try {
      const res = await axios.post(
        `${reneoUrl.replace(/\/+$/, '')}/api/v1/app-catalog/trial`,
        { catalogId: 'reneo-crm', planSlug: slug },
        { headers: this.getReneoHeaders(), timeout: 6000 }
      );
      if (res.data?.ok) {
        this.cachedLicense = null;
        return this.syncWithReneo();
      }
    } catch (err: any) {
      if (err?.response?.status && err.response.status >= 400 && err.response.status < 500) {
        const msg = err.response.data?.error || 'Gagal mengaktifkan paket trial.';
        const e: any = new Error(msg);
        e.statusCode = err.response.status;
        throw e;
      }
      // Check if trial or license already used locally before offline fallback
      const existingRows = await db
        .select()
        .from(systemSettings)
        .where(inArray(systemSettings.key, ['license_key']));
      if (existingRows[0]?.value) {
        const e: any = new Error('Aplikasi ini sudah pernah menggunakan sesi lisensi/trial sebelumnya.');
        e.statusCode = 409;
        throw e;
      }
    }

    const plans = await this.getPlans();
    const target = plans.find((p) => p.slug === slug) || plans[1] || plans[0];
    const trialDays = typeof target?.trialDays === 'number' && target.trialDays > 0 ? target.trialDays : 7;
    const now = new Date();
    const expDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    const trialPlanName = `${target?.name || 'Pro Bulanan'} (Trial ${trialDays} Hari)`;
    const trialKey = `RN-TRIAL-${slug.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)}-${Date.now().toString(36).toUpperCase()}`;

    const pairs = [
      { key: 'license_plan', value: trialPlanName },
      { key: 'license_expires_at', value: expDate.toISOString() },
      { key: 'license_key', value: trialKey },
      { key: 'license_features', value: JSON.stringify(target?.features || {}) },
    ];
    for (const pair of pairs) {
      await db
        .insert(systemSettings)
        .values({ key: pair.key, value: pair.value, updatedAt: now })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: pair.value, updatedAt: now },
        });
    }
    this.cachedLicense = null;
    return this.getLicense();
  }

  /**
   * Issue an official invoice order via Reneo
   */
  public async createOrder(payload: {
    planSlug: string;
    quantity?: number;
    buyerName?: string;
    buyerEmail?: string;
    buyerPhone?: string;
    paymentMethod?: string;
  }) {
    const reneoUrl = process.env.RENEO_PANEL_URL || 'http://host.docker.internal:8000';
    let buyerName = payload.buyerName;
    let buyerEmail = payload.buyerEmail;
    if (!buyerName || !buyerEmail) {
      const rows = await db
        .select()
        .from(systemSettings)
        .where(inArray(systemSettings.key, ['crm_admin_name', 'crm_admin_email']));
      const map = new Map(rows.map((r) => [r.key, r.value]));
      buyerName = buyerName || map.get('crm_admin_name') || 'Pelanggan CRM';
      buyerEmail = buyerEmail || map.get('crm_admin_email') || undefined;
    }
    const rawQty = Number(payload.quantity ?? 1);
    const quantity = Number.isFinite(rawQty) ? Math.min(24, Math.max(1, Math.round(rawQty))) : 1;
    const res = await axios.post(
      `${reneoUrl.replace(/\/+$/, '')}/api/v1/app-catalog/order`,
      {
        catalogId: 'reneo-crm',
        planSlug: payload.planSlug,
        quantity,
        buyerName,
        buyerEmail,
        buyerPhone: payload.buyerPhone,
        paymentMethod: payload.paymentMethod || 'transfer',
      },
      { headers: this.getReneoHeaders(), timeout: 6000 }
    );
    return res.data;
  }

  /**
   * Get invoice order status & payment instructions from Reneo
   */
  public async getOrder(publicId: string) {
    const reneoUrl = config.reneo.panelUrl || process.env.RENEO_PANEL_URL || 'http://host.docker.internal:8000';
    const res = await axios.get(
      `${reneoUrl.replace(/\/+$/, '')}/api/v1/app-catalog/orders/${publicId}`,
      { headers: this.getReneoHeaders(), timeout: 5000 }
    );
    return res.data;
  }

  /**
   * Pay/settle the invoice order in Reneo
   */
  public async payOrder(publicId: string, paymentMethod = 'saldo') {
    const reneoUrl = config.reneo.panelUrl || process.env.RENEO_PANEL_URL || 'http://host.docker.internal:8000';
    const res = await axios.post(
      `${reneoUrl.replace(/\/+$/, '')}/api/v1/app-catalog/orders/${publicId}/pay`,
      { paymentMethod },
      { headers: this.getReneoHeaders(), timeout: 6000 }
    );
    this.cachedLicense = null;
    await this.syncWithReneo();
    return res.data;
  }
}

export const licenseService = LicenseService.getInstance();

