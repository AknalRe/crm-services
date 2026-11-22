import axios from 'axios';
import { db } from '../db';
import {
  companies,
  contacts,
  crmAgents,
  messageTemplates,
  channelAccounts,
  campaignRecipients,
  DEFAULT_COMPANY_ID,
} from '../db/schema';
import { and, count, eq, gte, inArray, ne, or } from 'drizzle-orm';
import { config } from '../config';
import { getActiveCompanyId, getCompanySettingMap } from './tenantContext';
import { syncReneoEnvironmentHosts } from './domainGuard';
import { computeCompanyStorageUsageBytes } from '../routes/media';

export type LicenseFeatureKey =
  | 'unlimitedBroadcast'
  | 'unlimitedContacts'
  | 'birthdayAutomation'
  | 'liveChatCrm'
  | 'multiSession'
  | 'multiAgent'
  | 'customRoles'
  | 'omnichannel'
  | 'scheduledPosts'
  | 'autoReply'
  | 'aiAgent'
  | 'mcpTools'
  | 'exportReports'
  | 'wahaSync'
  | 'apiAccess';

export interface LicenseUsage {
  contacts: number;
  agents: number;
  templates: number;
  channels: number;
  broadcastsThisMonth: number;
  storageUsedBytes: number;
  storageUsedMb: number;
}

export interface LicenseInfo {
  status: 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'SUSPENDED' | 'GRACE_PERIOD' | 'UNLICENSED';
  plan: string;
  planSlug?: string | null;
  period: 'monthly' | 'quarterly' | 'annual' | 'trial';
  expiresAt: string;
  startedAt?: string;
  priceAmount?: number;
  daysLeft: number;
  isExpired: boolean;
  managedByReneo: boolean;
  reneoBillingUrl: string;
  licenseKey?: string;
  publicUrls?: string[];
  companyId: string;
  companyName?: string;
  trialUsed?: boolean;
  usage?: LicenseUsage;
  features: {
    unlimitedBroadcast: boolean;
    maxBroadcastPerMonth: number;
    unlimitedContacts: boolean;
    maxContacts: number;
    birthdayAutomation: boolean;
    liveChatCrm: boolean;
    multiSession: boolean;
    maxSessions: number;
    maxSessionIdentitySwitches: number;
    maxTemplates: number;
    maxUsers: number;
    multiAgent: boolean;
    maxAgents: number;
    customRoles: boolean;
    omnichannel: boolean;
    maxChannels: number;
    scheduledPosts: boolean;
    autoReply: boolean;
    aiAgent: boolean;
    mcpTools: boolean;
    exportReports: boolean;
    wahaSync: boolean;
    apiAccess: boolean;
    supportPriority: string;
    maxStorageMb: number;
    maxAttachmentSizeMb: number;
    allowedMenus: string[];
  };
}

export interface LicensePlanDefinition {
  id: number;
  catalogId: string;
  slug: string;
  name: string;
  tagline: string;
  period: 'monthly' | 'quarterly' | 'annual';
  months: number;
  trialDays: number;
  priceAmount: number;
  originalPriceAmount?: number;
  discountPercent?: number;
  promoValidUntil?: string;
  highlighted: boolean;
  features: Record<string, boolean | number | string | string[]>;
}

export function getPromoValidUntilString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  return `${lastDay} ${monthNames[month]} ${year}`;
}

export function enrichPlanWithDiscount<T extends { priceAmount: number; [key: string]: any }>(plan: T): T {
  const promoValidUntil = plan.promoValidUntil || getPromoValidUntilString();
  let originalPrice = plan.originalPriceAmount;
  let discountPercent = plan.discountPercent;

  if (!originalPrice || originalPrice <= plan.priceAmount) {
    if (plan.slug.includes('starter')) {
      originalPrice = 99000;
    } else if (plan.slug === 'pro-monthly') {
      originalPrice = 199000;
    } else if (plan.slug === 'pro-annual') {
      originalPrice = 2388000;
    } else if (plan.slug === 'business-monthly') {
      originalPrice = 499000;
    } else if (plan.slug === 'business-annual') {
      originalPrice = 5988000;
    } else if (plan.slug === 'enterprise-monthly') {
      originalPrice = 999000;
    } else if (plan.slug === 'enterprise-annual') {
      originalPrice = 11988000;
    } else if (plan.period === 'annual') {
      originalPrice = Math.round((plan.priceAmount * 1.35) / 10000) * 10000;
    } else {
      originalPrice = Math.round((plan.priceAmount * 1.5) / 1000) * 1000;
    }
  }

  if (!discountPercent || discountPercent <= 0) {
    discountPercent = Math.max(10, Math.min(75, Math.round(((originalPrice - plan.priceAmount) / originalPrice) * 100)));
  }

  return {
    ...plan,
    originalPriceAmount: originalPrice,
    discountPercent,
    promoValidUntil,
  };
}

const FEATURE_LABELS: Record<LicenseFeatureKey, string> = {
  unlimitedBroadcast: 'Siaran Tanpa Batas',
  unlimitedContacts: 'Kontak Tanpa Batas',
  birthdayAutomation: 'Otomasi Ulang Tahun',
  liveChatCrm: 'Live Chat CRM (Inbox & Tiket)',
  multiSession: 'Multi-Sesi WhatsApp',
  multiAgent: 'Multi-Agen & Pembagian Tugas',
  customRoles: 'Peran & Hak Akses Kustom (RBAC)',
  omnichannel: 'Omnichannel (Instagram, Facebook, Threads, Telegram)',
  scheduledPosts: 'Konten & Story Terjadwal',
  autoReply: 'Aturan Auto-Reply',
  aiAgent: 'Agent AI Multi-Model & Buku Pengetahuan',
  mcpTools: 'Konektor MCP & Tools AI',
  exportReports: 'Ekspor Laporan & Analitik',
  wahaSync: 'Sinkronisasi Kontak WhatsApp',
  apiAccess: 'Akses API Eksternal',
};

export function buildLockedFeatures(): LicenseInfo['features'] {
  return {
    unlimitedBroadcast: false,
    maxBroadcastPerMonth: 0,
    unlimitedContacts: false,
    maxContacts: 0,
    birthdayAutomation: false,
    liveChatCrm: false,
    multiSession: false,
    maxSessions: 0,
    maxSessionIdentitySwitches: 0,
    maxTemplates: 0,
    maxUsers: 0,
    multiAgent: false,
    maxAgents: 0,
    customRoles: false,
    omnichannel: false,
    maxChannels: 0,
    scheduledPosts: false,
    autoReply: false,
    aiAgent: false,
    mcpTools: false,
    exportReports: false,
    wahaSync: false,
    apiAccess: false,
    supportPriority: 'standard',
    maxStorageMb: 0,
    maxAttachmentSizeMb: 0,
    allowedMenus: ['dashboard'],
  };
}

export function getResearchedDefaultPlans(): LicensePlanDefinition[] {
  const basePlans: LicensePlanDefinition[] = [
    {
      id: 1,
      catalogId: 'reneo-crm',
      slug: 'starter-monthly',
      name: 'Starter Bulanan',
      tagline: 'Paket dasar solopreneur: 1 Sesi WA, 1 CS, Live Chat CRM, 2.500 kontak, 2.500 siaran & auto-reply.',
      period: 'monthly',
      months: 1,
      trialDays: 7,
      priceAmount: 49000,
      highlighted: false,
      features: {
        unlimitedBroadcast: false,
        maxBroadcastPerMonth: 2500,
        unlimitedContacts: false,
        maxContacts: 2500,
        birthdayBot: true,
        liveChat: true,
        multiSession: false,
        maxSessions: 1,
        maxSessionIdentitySwitches: 2,
        multiAgent: false,
        maxAgents: 1,
        maxUsers: 1,
        maxTemplates: 15,
        customRoles: false,
        omnichannel: false,
        maxChannels: 0,
        scheduledPosts: false,
        autoReply: true,
        aiAgent: false,
        mcpTools: false,
        exportReports: false,
        wahaSync: true,
        apiAccess: false,
        supportPriority: 'standard',
        maxStorageMb: 500,
        maxAttachmentSizeMb: 10,
        allowedMenus: ['dashboard', 'conversations', 'contacts', 'broadcasts', 'birthday', 'media', 'automations', 'settings'],
      },
    },
    {
      id: 2,
      catalogId: 'reneo-crm',
      slug: 'pro-monthly',
      name: 'Growth Pro Bulanan',
      tagline: 'Untuk tim CS kecil: Multi-nomor 3 Sesi WA, 5 CS, 10.000 kontak, 25.000 siaran/bln, omnichannel sosial & CSAT.',
      period: 'monthly',
      months: 1,
      trialDays: 7,
      priceAmount: 99000,
      highlighted: true,
      features: {
        unlimitedBroadcast: false,
        maxBroadcastPerMonth: 25000,
        unlimitedContacts: false,
        maxContacts: 10000,
        birthdayBot: true,
        liveChat: true,
        multiSession: true,
        maxSessions: 3,
        maxSessionIdentitySwitches: 5,
        multiAgent: true,
        maxAgents: 5,
        maxUsers: 5,
        maxTemplates: 50,
        customRoles: true,
        omnichannel: true,
        maxChannels: 4,
        scheduledPosts: true,
        autoReply: true,
        aiAgent: false,
        mcpTools: false,
        exportReports: true,
        wahaSync: true,
        apiAccess: false,
        supportPriority: 'fast',
        maxStorageMb: 1536,
        maxAttachmentSizeMb: 15,
        allowedMenus: [
          'dashboard',
          'conversations',
          'comments',
          'feed',
          'contacts',
          'broadcasts',
          'birthday',
          'tracking',
          'posts',
          'ideas',
          'media',
          'automations',
          'settings',
        ],
      },
    },
    {
      id: 3,
      catalogId: 'reneo-crm',
      slug: 'pro-annual',
      name: 'Growth Pro Tahunan',
      tagline: 'Paket tahunan tim CS hemat 17% (gratis 2 bln): 3 Sesi WA, 5 CS, 10.000 kontak, 25.000 siaran/bln & omnichannel.',
      period: 'annual',
      months: 12,
      trialDays: 7,
      priceAmount: 990000,
      highlighted: false,
      features: {
        unlimitedBroadcast: false,
        maxBroadcastPerMonth: 25000,
        unlimitedContacts: false,
        maxContacts: 10000,
        birthdayBot: true,
        liveChat: true,
        multiSession: true,
        maxSessions: 3,
        maxSessionIdentitySwitches: 5,
        multiAgent: true,
        maxAgents: 5,
        maxUsers: 5,
        maxTemplates: 50,
        customRoles: true,
        omnichannel: true,
        maxChannels: 4,
        scheduledPosts: true,
        autoReply: true,
        aiAgent: false,
        mcpTools: false,
        exportReports: true,
        wahaSync: true,
        apiAccess: false,
        supportPriority: 'fast',
        maxStorageMb: 2048,
        maxAttachmentSizeMb: 15,
        allowedMenus: [
          'dashboard',
          'conversations',
          'comments',
          'feed',
          'contacts',
          'broadcasts',
          'birthday',
          'tracking',
          'posts',
          'ideas',
          'media',
          'automations',
          'settings',
        ],
      },
    },
    {
      id: 4,
      catalogId: 'reneo-crm',
      slug: 'business-monthly',
      name: 'Business AI Bulanan',
      tagline: 'Skala bisnis berkembang: 10 Sesi WA, 15 CS, 50.000 kontak, 100.000 siaran/bln, AI Agent, MCP Tools & API.',
      period: 'monthly',
      months: 1,
      trialDays: 7,
      priceAmount: 299000,
      highlighted: false,
      features: {
        unlimitedBroadcast: false,
        maxBroadcastPerMonth: 100000,
        unlimitedContacts: false,
        maxContacts: 50000,
        birthdayBot: true,
        liveChat: true,
        multiSession: true,
        maxSessions: 10,
        maxSessionIdentitySwitches: 15,
        multiAgent: true,
        maxAgents: 15,
        maxUsers: 15,
        maxTemplates: 0,
        customRoles: true,
        omnichannel: true,
        maxChannels: 12,
        scheduledPosts: true,
        autoReply: true,
        aiAgent: true,
        mcpTools: true,
        exportReports: true,
        wahaSync: true,
        apiAccess: true,
        supportPriority: 'priority',
        maxStorageMb: 6144,
        maxAttachmentSizeMb: 25,
        allowedMenus: [
          'dashboard',
          'conversations',
          'comments',
          'feed',
          'contacts',
          'broadcasts',
          'birthday',
          'tracking',
          'posts',
          'ideas',
          'media',
          'automations',
          'ai-agent',
          'settings',
        ],
      },
    },
    {
      id: 5,
      catalogId: 'reneo-crm',
      slug: 'business-annual',
      name: 'Business AI Tahunan',
      tagline: 'Paket tahunan bisnis hemat 17% (gratis 2 bln): 10 Sesi WA, 15 CS, 50.000 kontak, 100.000 siaran & AI Agent.',
      period: 'annual',
      months: 12,
      trialDays: 7,
      priceAmount: 2990000,
      highlighted: false,
      features: {
        unlimitedBroadcast: false,
        maxBroadcastPerMonth: 100000,
        unlimitedContacts: false,
        maxContacts: 50000,
        birthdayBot: true,
        liveChat: true,
        multiSession: true,
        maxSessions: 10,
        maxSessionIdentitySwitches: 15,
        multiAgent: true,
        maxAgents: 15,
        maxUsers: 15,
        maxTemplates: 0,
        customRoles: true,
        omnichannel: true,
        maxChannels: 12,
        scheduledPosts: true,
        autoReply: true,
        aiAgent: true,
        mcpTools: true,
        exportReports: true,
        wahaSync: true,
        apiAccess: true,
        supportPriority: 'priority',
        maxStorageMb: 10240,
        maxAttachmentSizeMb: 25,
        allowedMenus: [
          'dashboard',
          'conversations',
          'comments',
          'feed',
          'contacts',
          'broadcasts',
          'birthday',
          'tracking',
          'posts',
          'ideas',
          'media',
          'automations',
          'ai-agent',
          'settings',
        ],
      },
    },
    {
      id: 6,
      catalogId: 'reneo-crm',
      slug: 'enterprise-monthly',
      name: 'Enterprise AI Bulanan',
      tagline: 'Skala korporasi fleksibel: 25 Sesi WA Dedicated, 35 CS, 150.000 kontak, siaran tanpa batas, AI Agent & VIP.',
      period: 'monthly',
      months: 1,
      trialDays: 7,
      priceAmount: 599000,
      highlighted: false,
      features: {
        unlimitedBroadcast: true,
        maxBroadcastPerMonth: 0,
        unlimitedContacts: false,
        maxContacts: 150000,
        birthdayBot: true,
        liveChat: true,
        multiSession: true,
        maxSessions: 25,
        maxSessionIdentitySwitches: 30,
        multiAgent: true,
        maxAgents: 35,
        maxUsers: 35,
        maxTemplates: 0,
        customRoles: true,
        omnichannel: true,
        maxChannels: 0,
        scheduledPosts: true,
        autoReply: true,
        aiAgent: true,
        mcpTools: true,
        exportReports: true,
        wahaSync: true,
        apiAccess: true,
        supportPriority: 'vip',
        maxStorageMb: 25600,
        maxAttachmentSizeMb: 40,
        allowedMenus: [
          'dashboard',
          'conversations',
          'comments',
          'feed',
          'contacts',
          'broadcasts',
          'birthday',
          'tracking',
          'posts',
          'ideas',
          'media',
          'automations',
          'ai-agent',
          'settings',
        ],
      },
    },
    {
      id: 7,
      catalogId: 'reneo-crm',
      slug: 'enterprise-annual',
      name: 'Enterprise AI Tahunan',
      tagline: 'Paket korporasi hemat 17% (gratis 2 bln): 25 Sesi WA Dedicated, 35 CS, 200.000 kontak, siaran tanpa batas & VIP.',
      period: 'annual',
      months: 12,
      trialDays: 7,
      priceAmount: 5990000,
      highlighted: false,
      features: {
        unlimitedBroadcast: true,
        maxBroadcastPerMonth: 0,
        unlimitedContacts: false,
        maxContacts: 200000,
        birthdayBot: true,
        liveChat: true,
        multiSession: true,
        maxSessions: 25,
        maxSessionIdentitySwitches: 45,
        multiAgent: true,
        maxAgents: 35,
        maxUsers: 35,
        maxTemplates: 0,
        customRoles: true,
        omnichannel: true,
        maxChannels: 0,
        scheduledPosts: true,
        autoReply: true,
        aiAgent: true,
        mcpTools: true,
        exportReports: true,
        wahaSync: true,
        apiAccess: true,
        supportPriority: 'vip',
        maxStorageMb: 40960,
        maxAttachmentSizeMb: 50,
        allowedMenus: [
          'dashboard',
          'conversations',
          'comments',
          'feed',
          'contacts',
          'broadcasts',
          'birthday',
          'tracking',
          'posts',
          'ideas',
          'media',
          'automations',
          'ai-agent',
          'settings',
        ],
      },
    },
  ];
  return basePlans.map(enrichPlanWithDiscount);
}

export function resolveFeatures(raw: any, isExpired: boolean, planName?: string): LicenseInfo['features'] {
  if (isExpired) return buildLockedFeatures();

  const src = raw && typeof raw === 'object' ? raw : {};
  const lower = (planName || '').toLowerCase();
  const isStarter = lower.includes('starter');
  const isEnterprise = lower.includes('enterprise');
  const isBusiness = lower.includes('business');

  const unlimitedBroadcast =
    src.unlimitedBroadcast !== undefined
      ? Boolean(src.unlimitedBroadcast)
      : src.broadcast !== undefined
      ? Boolean(src.broadcast)
      : isEnterprise;

  const maxBroadcastPerMonth = unlimitedBroadcast
    ? 0
    : typeof src.maxBroadcastPerMonth === 'number' && src.maxBroadcastPerMonth >= 0
    ? src.maxBroadcastPerMonth
    : isStarter
    ? 2500
    : isBusiness
    ? 100000
    : 25000;

  const unlimitedContacts =
    src.unlimitedContacts !== undefined
      ? Boolean(src.unlimitedContacts)
      : false;

  const maxContacts = unlimitedContacts
    ? 0
    : typeof src.maxContacts === 'number' && src.maxContacts > 0
    ? src.maxContacts
    : typeof src.maxContacts === 'number' && src.maxContacts === 0 && src.unlimitedContacts === true
    ? 0
    : isStarter
    ? 2500
    : isBusiness
    ? 50000
    : isEnterprise
    ? 150000
    : 10000;

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
      : true;

  const multiSession =
    src.multiSession !== undefined ? Boolean(src.multiSession) : !isStarter;

  const maxSessions =
    typeof src.maxSessions === 'number' && src.maxSessions > 0
      ? src.maxSessions
      : multiSession
      ? isEnterprise
        ? 25
        : isBusiness
        ? 10
        : 3
      : 1;

  const maxSessionIdentitySwitches =
    typeof src.maxSessionIdentitySwitches === 'number' && src.maxSessionIdentitySwitches >= 0
      ? src.maxSessionIdentitySwitches
      : isStarter
      ? 2
      : isBusiness
      ? 15
      : isEnterprise
      ? 30
      : 5;

  const multiAgent =
    src.multiAgent !== undefined ? Boolean(src.multiAgent) : !isStarter;

  const maxAgents =
    typeof src.maxAgents === 'number' && src.maxAgents > 0
      ? src.maxAgents
      : typeof src.maxUsers === 'number' && src.maxUsers > 0
      ? src.maxUsers
      : multiAgent
      ? isEnterprise
        ? 35
        : isBusiness
        ? 15
        : 5
      : 1;

  const maxUsers = maxAgents;

  const maxTemplates =
    typeof src.maxTemplates === 'number' && src.maxTemplates >= 0
      ? src.maxTemplates
      : isStarter
      ? 10
      : isBusiness || isEnterprise
      ? 0
      : 50;

  const customRoles =
    src.customRoles !== undefined ? Boolean(src.customRoles) : !isStarter;

  const omnichannel =
    src.omnichannel !== undefined ? Boolean(src.omnichannel) : !isStarter;

  const maxChannels = !omnichannel
    ? 0
    : typeof src.maxChannels === 'number' && src.maxChannels >= 0
    ? src.maxChannels
    : isEnterprise
    ? 0
    : isBusiness
    ? 12
    : 4;

  const scheduledPosts =
    src.scheduledPosts !== undefined ? Boolean(src.scheduledPosts) : !isStarter;

  const autoReply =
    src.autoReply !== undefined ? Boolean(src.autoReply) : true;

  const aiAgent =
    src.aiAgent !== undefined ? Boolean(src.aiAgent) : isBusiness || isEnterprise;

  const mcpTools =
    src.mcpTools !== undefined ? Boolean(src.mcpTools) : isBusiness || isEnterprise;

  const exportReports =
    src.exportReports !== undefined ? Boolean(src.exportReports) : !isStarter;

  const wahaSync =
    src.wahaSync !== undefined ? Boolean(src.wahaSync) : true;

  const apiAccess =
    src.apiAccess !== undefined ? Boolean(src.apiAccess) : isBusiness || isEnterprise;

  const supportPriority =
    typeof src.supportPriority === 'string' && src.supportPriority
      ? src.supportPriority
      : isEnterprise
      ? 'vip'
      : isBusiness
      ? 'priority'
      : isStarter
      ? 'standard'
      : 'fast';

  const maxStorageMb =
    typeof src.maxStorageMb === 'number' && src.maxStorageMb > 0
      ? src.maxStorageMb
      : isEnterprise
      ? 35840
      : isBusiness
      ? 8192
      : isStarter
      ? 250
      : 1024;

  const maxAttachmentSizeMb =
    typeof src.maxAttachmentSizeMb === 'number' && src.maxAttachmentSizeMb > 0
      ? src.maxAttachmentSizeMb
      : isEnterprise
      ? 50
      : isBusiness
      ? 25
      : isStarter
      ? 5
      : 10;

  const allowedMenus: string[] = ['dashboard', 'contacts', 'broadcasts', 'media', 'settings'];
  if (liveChatCrm) allowedMenus.push('conversations');
  if (omnichannel) allowedMenus.push('comments', 'feed');
  if (birthdayAutomation) allowedMenus.push('birthday');
  if (scheduledPosts) allowedMenus.push('posts', 'ideas', 'tracking');
  if (autoReply) allowedMenus.push('automations');
  if (aiAgent) allowedMenus.push('ai-agent');

  return {
    unlimitedBroadcast,
    maxBroadcastPerMonth,
    unlimitedContacts,
    maxContacts,
    birthdayAutomation,
    liveChatCrm,
    multiSession,
    maxSessions,
    maxSessionIdentitySwitches,
    maxTemplates,
    maxUsers,
    multiAgent,
    maxAgents,
    customRoles,
    omnichannel,
    maxChannels,
    scheduledPosts,
    autoReply,
    aiAgent,
    mcpTools,
    exportReports,
    wahaSync,
    apiAccess,
    supportPriority,
    maxStorageMb,
    maxAttachmentSizeMb,
    allowedMenus,
  };
}

interface CompanyCacheEntry {
  license: LicenseInfo;
  checkedAt: number;
}

export class LicenseService {
  private static instance: LicenseService;
  private cacheByCompany = new Map<string, CompanyCacheEntry>();
  private cachedPublicUrls: string[] = [];
  private readonly CACHE_TTL_MS = 1000 * 60 * 15;

  private constructor() {}

  private getReneoUrl(): string {
    return (config.reneo.panelUrl || process.env.RENEO_PANEL_URL || 'http://host.docker.internal:8000').replace(
      /\/+$/,
      ''
    );
  }

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

  public invalidateCache(companyId?: string): void {
    if (companyId) {
      this.cacheByCompany.delete(companyId);
    } else {
      this.cacheByCompany.clear();
    }
  }

  public getCachedPublicUrls(): string[] {
    if (this.cachedPublicUrls.length > 0) return this.cachedPublicUrls;
    const def = this.cacheByCompany.get(DEFAULT_COMPANY_ID)?.license.publicUrls;
    return Array.isArray(def) ? def : [];
  }

  private async getCompanyRow(companyId?: string) {
    const cid = getActiveCompanyId(companyId);
    const [row] = await db.select().from(companies).where(eq(companies.id, cid)).limit(1);
    return row || null;
  }

  public async getLicenseUsage(companyId?: string): Promise<LicenseUsage> {
    const cid = getActiveCompanyId(companyId);
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));

    const [
      [contactRes],
      [agentRes],
      [templateRes],
      [channelRes],
      [broadcastRes],
      storageUsedBytes,
    ] = await Promise.all([
      db.select({ val: count() }).from(contacts).where(eq(contacts.companyId, cid)),
      db.select({ val: count() }).from(crmAgents).where(eq(crmAgents.companyId, cid)),
      db.select({ val: count() }).from(messageTemplates).where(eq(messageTemplates.companyId, cid)),
      db
        .select({ val: count() })
        .from(channelAccounts)
        .where(and(eq(channelAccounts.companyId, cid), eq(channelAccounts.isActive, true))),
      db
        .select({ val: count() })
        .from(campaignRecipients)
        .where(
          and(
            eq(campaignRecipients.companyId, cid),
            inArray(campaignRecipients.status, ['SENT', 'DELIVERED', 'READ']),
            or(gte(campaignRecipients.sentAt, monthStart), gte(campaignRecipients.createdAt, monthStart))
          )
        ),
      computeCompanyStorageUsageBytes(cid),
    ]);

    return {
      contacts: Number(contactRes?.val ?? 0),
      agents: Number(agentRes?.val ?? 0),
      templates: Number(templateRes?.val ?? 0),
      channels: Number(channelRes?.val ?? 0),
      broadcastsThisMonth: Number(broadcastRes?.val ?? 0),
      storageUsedBytes,
      storageUsedMb: Math.round((storageUsedBytes / (1024 * 1024)) * 10) / 10,
    };
  }

  private buildLicenseFromCompanyRow(company: typeof companies.$inferSelect, publicUrls?: string[]): LicenseInfo {
    const reneoUrl = this.getReneoUrl();
    const now = new Date();
    const isManaged = Boolean(company.isDefault);

    if (company.status === 'SUSPENDED' || company.licenseStatus === 'SUSPENDED') {
      return {
        status: 'SUSPENDED',
        plan: company.licensePlan || 'Disuspend',
        planSlug: company.licensePlanSlug,
        period: (company.licensePeriod as any) || 'monthly',
        expiresAt: (company.licenseExpiresAt || now).toISOString(),
        startedAt: company.licenseStartedAt?.toISOString(),
        priceAmount: company.licensePriceAmount || 0,
        daysLeft: 0,
        isExpired: true,
        managedByReneo: isManaged,
        reneoBillingUrl: `${reneoUrl}/hosting`,
        licenseKey: company.licenseKey || undefined,
        publicUrls,
        companyId: company.id,
        companyName: company.name,
        trialUsed: company.trialUsed,
        features: buildLockedFeatures(),
      };
    }

    if (!company.licenseKey || !company.licenseExpiresAt || company.licenseStatus === 'UNLICENSED') {
      return {
        status: 'UNLICENSED',
        plan: 'Belum Diaktivasi',
        planSlug: company.licensePlanSlug,
        period: 'monthly',
        expiresAt: now.toISOString(),
        daysLeft: 0,
        isExpired: true,
        managedByReneo: isManaged,
        reneoBillingUrl: `${reneoUrl}/hosting`,
        publicUrls,
        companyId: company.id,
        companyName: company.name,
        trialUsed: company.trialUsed,
        features: buildLockedFeatures(),
      };
    }

    const expiresAt = new Date(company.licenseExpiresAt);
    const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    const isExpired = expiresAt.getTime() < now.getTime();
    const plan = company.licensePlan || 'Lisensi Aktif';
    let parsedRawFeatures: any = null;
    if (company.licenseFeaturesJson) {
      try {
        parsedRawFeatures = JSON.parse(company.licenseFeaturesJson);
      } catch {
        parsedRawFeatures = null;
      }
    }

    const isTrial =
      company.licenseStatus === 'TRIAL' ||
      company.licensePeriod === 'trial' ||
      plan.toLowerCase().includes('trial');

    const periodRaw = String(company.licensePeriod || '').toLowerCase();
    const period: LicenseInfo['period'] =
      isTrial || periodRaw === 'trial'
        ? 'trial'
        : periodRaw === 'annual' || plan.toLowerCase().includes('tahun')
        ? 'annual'
        : periodRaw === 'quarterly'
        ? 'quarterly'
        : 'monthly';

    return {
      status: isExpired ? 'EXPIRED' : isTrial ? 'TRIAL' : 'ACTIVE',
      plan,
      planSlug: company.licensePlanSlug,
      period,
      startedAt: company.licenseStartedAt?.toISOString(),
      priceAmount: company.licensePriceAmount || 0,
      expiresAt: expiresAt.toISOString(),
      daysLeft,
      isExpired,
      managedByReneo: isManaged,
      reneoBillingUrl: `${reneoUrl}/hosting`,
      licenseKey: company.licenseKey,
      publicUrls,
      companyId: company.id,
      companyName: company.name,
      trialUsed: company.trialUsed,
      features: resolveFeatures(parsedRawFeatures, isExpired, plan),
    };
  }

  public async getLicense(companyId?: string, includeUsage = false): Promise<LicenseInfo> {
    const cid = getActiveCompanyId(companyId);
    const now = Date.now();
    const cached = this.cacheByCompany.get(cid);
    let lic: LicenseInfo;

    if (cached && now - cached.checkedAt < this.CACHE_TTL_MS) {
      lic = cached.license;
    } else {
      lic = await this.syncWithReneo(cid);
    }

    if (includeUsage) {
      const usage = await this.getLicenseUsage(cid);
      return { ...lic, usage };
    }
    return lic;
  }

  public async syncWithReneo(companyId?: string): Promise<LicenseInfo> {
    const cid = getActiveCompanyId(companyId);
    const reneoUrl = this.getReneoUrl();

    try {
      const company = await this.getCompanyRow(cid);
      if (!company) {
        return {
          status: 'UNLICENSED',
          plan: 'Perusahaan Tidak Ditemukan',
          period: 'monthly',
          expiresAt: new Date().toISOString(),
          daysLeft: 0,
          isExpired: true,
          managedByReneo: cid === DEFAULT_COMPANY_ID,
          reneoBillingUrl: `${reneoUrl}/hosting`,
          companyId: cid,
          features: buildLockedFeatures(),
        };
      }

      if (company.isDefault && reneoUrl) {
        try {
          const res = await axios.get(`${reneoUrl}/api/v1/app-catalog/license/reneo-crm`, {
            headers: this.getReneoHeaders(),
            timeout: 5000,
          });

          const publicUrls = Array.isArray(res.data?.publicUrls) ? res.data.publicUrls.map(String) : undefined;
          const allowedHosts = Array.isArray(res.data?.allowedHosts) ? res.data.allowedHosts.map(String) : undefined;
          const serverHostname = typeof res.data?.serverHostname === 'string' ? res.data.serverHostname : undefined;
          if (publicUrls && publicUrls.length > 0) {
            this.cachedPublicUrls = publicUrls;
          }
          if (res.data?.authenticated === true && res.data?.reneoVerified === true) {
            syncReneoEnvironmentHosts({
              allowedHosts,
              publicUrls,
              serverHostname,
              verified: true,
            });
          } else if (allowedHosts || publicUrls || serverHostname) {
            syncReneoEnvironmentHosts({
              allowedHosts,
              publicUrls,
              serverHostname,
            });
          }

          if (res.data && res.data.ok && res.data.status === 'UNLICENSED') {
            // Keep any standalone SAAS-issued local license if explicitly set, otherwise sync UNLICENSED from Reneo
            const isLocalSaasKey =
              company.licenseKey &&
              (company.licenseKey.startsWith('RN-SAAS-') || company.licenseKey.startsWith('RN-TRIAL-'));

            if (!isLocalSaasKey) {
              await db
                .update(companies)
                .set({
                  licenseKey: null,
                  licenseStatus: 'UNLICENSED',
                  licensePlan: 'Belum Diaktivasi',
                  licenseStartedAt: null,
                  licenseExpiresAt: null,
                  licenseFeaturesJson: null,
                  updatedAt: new Date(),
                })
                .where(eq(companies.id, company.id));

              const info: LicenseInfo = {
                status: 'UNLICENSED',
                plan: 'Belum Diaktivasi',
                period: 'monthly',
                expiresAt: new Date().toISOString(),
                daysLeft: 0,
                isExpired: true,
                managedByReneo: true,
                reneoBillingUrl: res.data.billingUrl || `${reneoUrl}/hosting`,
                publicUrls,
                companyId: company.id,
                companyName: company.name,
                trialUsed: company.trialUsed,
                features: buildLockedFeatures(),
              };
              this.cacheByCompany.set(company.id, { license: info, checkedAt: Date.now() });
              return info;
            }
          }

          if (res.data && res.data.ok && (res.data.status === 'SUSPENDED' || res.data.isSuspended)) {
            await db
              .update(companies)
              .set({
                licenseStatus: 'SUSPENDED',
                licensePlan: res.data.plan || 'Disuspend',
                licenseKey: res.data.licenseKey || company.licenseKey,
                updatedAt: new Date(),
              })
              .where(eq(companies.id, company.id));

            const info: LicenseInfo = {
              status: 'SUSPENDED',
              plan: res.data.plan || 'Disuspend',
              period: res.data.period || 'monthly',
              expiresAt: res.data.expiresAt || new Date().toISOString(),
              daysLeft: 0,
              isExpired: true,
              managedByReneo: true,
              reneoBillingUrl: res.data.billingUrl || `${reneoUrl}/hosting`,
              publicUrls,
              licenseKey: res.data.licenseKey || company.licenseKey || undefined,
              companyId: company.id,
              companyName: company.name,
              trialUsed: company.trialUsed,
              features: buildLockedFeatures(),
            };
            this.cacheByCompany.set(company.id, { license: info, checkedAt: Date.now() });
            return info;
          }

          if (
            res.data &&
            res.data.ok &&
            res.data.status !== 'UNLICENSED' &&
            res.data.status !== 'SUSPENDED' &&
            !res.data.isSuspended &&
            res.data.licenseKey &&
            res.data.licenseKey !== 'RN-CRM-DEMO-2026'
          ) {
            const data = res.data;
            const expDate = new Date(data.expiresAt);
            const now = new Date();
            const daysLeft = Math.max(0, Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
            const isExpired = expDate.getTime() < now.getTime();
            const planName = data.plan || 'Growth Pro Bulanan';
            const features = resolveFeatures(data.features, isExpired, planName);
            const status = isExpired ? 'EXPIRED' : data.status || 'ACTIVE';

            await db
              .update(companies)
              .set({
                licenseKey: String(data.licenseKey),
                licenseStatus: status,
                licensePlan: planName,
                licensePlanSlug: data.planSlug || company.licensePlanSlug,
                licensePeriod: data.period || 'monthly',
                licensePriceAmount:
                  typeof data.priceAmount === 'number' && data.priceAmount >= 0
                    ? data.priceAmount
                    : company.licensePriceAmount,
                licenseStartedAt: data.startedAt ? new Date(data.startedAt) : company.licenseStartedAt || now,
                licenseExpiresAt: expDate,
                licenseFeaturesJson: JSON.stringify(features),
                trialUsed: true,
                updatedAt: now,
              })
              .where(eq(companies.id, company.id));

            const info: LicenseInfo = {
              status,
              plan: planName,
              planSlug: data.planSlug || company.licensePlanSlug,
              period: data.period || 'monthly',
              startedAt: data.startedAt ? String(data.startedAt) : undefined,
              priceAmount:
                typeof data.priceAmount === 'number' && data.priceAmount >= 0 ? data.priceAmount : undefined,
              expiresAt: expDate.toISOString(),
              daysLeft,
              isExpired,
              managedByReneo: true,
              reneoBillingUrl: data.billingUrl || `${reneoUrl}/hosting`,
              publicUrls,
              licenseKey: String(data.licenseKey),
              companyId: company.id,
              companyName: company.name,
              trialUsed: true,
              features,
            };
            this.cacheByCompany.set(company.id, { license: info, checkedAt: Date.now() });
            return info;
          }
        } catch {
          // Fallback to DB row when Reneo Panel is offline
        }
      } else if (!company.isDefault && company.status !== 'SUSPENDED' && reneoUrl) {
        // Check if company owner email belongs to a Reneo Panel hosting superadmin (no license needed)
        if (company.ownerEmail) {
          try {
            const saRes = await axios.get(`${reneoUrl}/api/v1/app-catalog/license/reneo-crm`, {
              params: { email: company.ownerEmail.trim().toLowerCase() },
              headers: this.getReneoHeaders(),
              timeout: 4500,
            });
            if (saRes.data?.ok && saRes.data?.isSuperadminBypass === true) {
              const expDate = saRes.data.expiresAt
                ? new Date(saRes.data.expiresAt)
                : new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);
              const planName = saRes.data.plan || 'Superadmin Hosting';
              const features = resolveFeatures(saRes.data.features, false, planName);
              await db
                .update(companies)
                .set({
                  licenseKey: String(saRes.data.licenseKey || 'RN-SUPERADMIN-HOSTING'),
                  licenseStatus: 'ACTIVE',
                  licensePlan: planName,
                  licensePlanSlug: 'superadmin-unlimited',
                  licensePeriod: 'annual',
                  licensePriceAmount: 0,
                  licenseStartedAt: company.licenseStartedAt || new Date(),
                  licenseExpiresAt: expDate,
                  licenseFeaturesJson: JSON.stringify(features),
                  updatedAt: new Date(),
                })
                .where(eq(companies.id, company.id));
              const refreshed = await this.getCompanyRow(cid);
              if (refreshed) {
                const info = this.buildLicenseFromCompanyRow(refreshed, this.cachedPublicUrls);
                this.cacheByCompany.set(cid, { license: info, checkedAt: Date.now() });
                return info;
              }
            }
          } catch {
            // Continue to normal license verification
          }
        }

        if (
          company.licenseKey &&
          !company.licenseKey.startsWith('RN-TRIAL-') &&
          !company.licenseKey.startsWith('RN-SAAS-') &&
          company.licenseKey !== 'RN-SUPERADMIN-HOSTING'
        ) {
          try {
            const verifyRes = await axios.get(`${reneoUrl}/api/v1/app-licenses/verify`, {
              params: { key: company.licenseKey, catalogId: 'reneo-crm' },
              headers: this.getReneoHeaders(),
              timeout: 4500,
            });
            if (verifyRes.data && verifyRes.data.valid && verifyRes.data.expiresAt) {
              const expDate = new Date(verifyRes.data.expiresAt);
              const isExpired = expDate.getTime() < Date.now();
              const planName = verifyRes.data.planName || company.licensePlan || 'Growth Pro Bulanan';
              const features = resolveFeatures(verifyRes.data.features, isExpired, planName);
              await db
                .update(companies)
                .set({
                  licenseStatus: isExpired ? 'EXPIRED' : 'ACTIVE',
                  licensePlan: planName,
                  licenseExpiresAt: expDate,
                  licenseFeaturesJson: JSON.stringify(features),
                  updatedAt: new Date(),
                })
                .where(eq(companies.id, company.id));
              const refreshed = await this.getCompanyRow(cid);
              if (refreshed) {
                const info = this.buildLicenseFromCompanyRow(refreshed, this.cachedPublicUrls);
                this.cacheByCompany.set(cid, { license: info, checkedAt: Date.now() });
                return info;
              }
            }
          } catch {
            // Offline / standalone fallback
          }
        }
      }

      const info = this.buildLicenseFromCompanyRow(company, this.cachedPublicUrls);
      this.cacheByCompany.set(cid, { license: info, checkedAt: Date.now() });
      return info;
    } catch (err) {
      console.error('[LicenseService] Error resolving license:', err);
      return {
        status: 'UNLICENSED',
        plan: 'Belum Diaktivasi',
        period: 'monthly',
        expiresAt: new Date().toISOString(),
        daysLeft: 0,
        isExpired: true,
        managedByReneo: cid === DEFAULT_COMPANY_ID,
        reneoBillingUrl: `${reneoUrl}/hosting`,
        companyId: cid,
        features: buildLockedFeatures(),
      };
    }
  }

  public async assertLicenseActive(companyId?: string): Promise<LicenseInfo> {
    const cid = getActiveCompanyId(companyId);
    const lic = await this.getLicense(cid);
    if (lic.status === 'SUSPENDED') {
      const err: any = new Error(
        `Lisensi perusahaan "${lic.companyName || cid}" sedang disuspend (${lic.plan}). Hubungi administrator platform untuk mengaktifkan kembali.`
      );
      err.statusCode = 403;
      err.code = 'LICENSE_SUSPENDED';
      throw err;
    }
    if (lic.isExpired || lic.status === 'EXPIRED' || lic.status === 'UNLICENSED') {
      const err: any = new Error(
        lic.status === 'UNLICENSED'
          ? 'Lisensi CRM perusahaan belum diaktivasi. Pilih masa trial 7 hari atau aktivasi paket lisensi terlebih dahulu.'
          : `Lisensi CRM perusahaan telah berakhir (${lic.plan}). Silakan perpanjang paket untuk melanjutkan.`
      );
      err.statusCode = 403;
      err.code = lic.status === 'UNLICENSED' ? 'LICENSE_UNLICENSED' : 'LICENSE_EXPIRED';
      throw err;
    }
    return lic;
  }

  public async assertFeature(
    feature: LicenseFeatureKey,
    customMessage?: string,
    companyId?: string
  ): Promise<LicenseInfo> {
    const cid = getActiveCompanyId(companyId);
    const lic = await this.assertLicenseActive(cid);
    if (!lic.features[feature]) {
      const label = FEATURE_LABELS[feature] || feature;
      const err: any = new Error(
        customMessage ||
          `Fitur ${label} terkunci pada paket "${lic.plan}". Upgrade paket lisensi perusahaan untuk membukanya.`
      );
      err.statusCode = 403;
      err.code = 'FEATURE_LOCKED';
      err.feature = feature;
      throw err;
    }
    return lic;
  }

  public async canAddContacts(delta = 1, companyId?: string): Promise<boolean> {
    try {
      const cid = getActiveCompanyId(companyId);
      const lic = await this.getLicense(cid, false);
      if (lic.isExpired || lic.status === 'UNLICENSED' || lic.status === 'SUSPENDED') {
        return false;
      }
      if (lic.features.unlimitedContacts) return true;
      const max = lic.features.maxContacts;
      if (max <= 0) return false;
      const [row] = await db
        .select({ val: count() })
        .from(contacts)
        .where(eq(contacts.companyId, cid));
      const current = Number(row?.val ?? 0);
      return current + delta <= max;
    } catch {
      return false;
    }
  }

  public async assertQuota(
    metric: 'contacts' | 'agents' | 'templates' | 'channels' | 'broadcasts' | 'sessions' | 'storage',
    targetCountOrDelta = 1,
    companyId?: string
  ): Promise<LicenseInfo> {
    const cid = getActiveCompanyId(companyId);
    const lic = await this.assertLicenseActive(cid);

    if (metric === 'sessions') {
      if (targetCountOrDelta > 1 && !lic.features.multiSession) {
        return this.assertFeature('multiSession', undefined, cid);
      }
      if (lic.features.maxSessions > 0 && targetCountOrDelta > lic.features.maxSessions) {
        const err: any = new Error(
          `Batas maksimal sesi WhatsApp paket "${lic.plan}" adalah ${lic.features.maxSessions} sesi. Upgrade paket untuk menambah sesi.`
        );
        err.statusCode = 403;
        err.code = 'QUOTA_EXCEEDED';
        throw err;
      }
      return lic;
    }

    const usage = await this.getLicenseUsage(cid);

    if (metric === 'contacts') {
      if (lic.features.unlimitedContacts) return lic;
      const max = lic.features.maxContacts;
      if (max <= 0 || usage.contacts + targetCountOrDelta > max) {
        const err: any = new Error(
          `Kapasitas kontak paket "${lic.plan}" maksimal ${max.toLocaleString('id-ID')} kontak (terpakai ${usage.contacts.toLocaleString('id-ID')}). Upgrade paket untuk menambah kapasitas.`
        );
        err.statusCode = 403;
        err.code = 'QUOTA_EXCEEDED';
        throw err;
      }
      return lic;
    }

    if (metric === 'agents') {
      const nextCount = usage.agents + targetCountOrDelta;
      if (nextCount > 1 && !lic.features.multiAgent) {
        return this.assertFeature(
          'multiAgent',
          `Paket "${lic.plan}" hanya mendukung 1 pengguna admin. Upgrade ke Growth Pro atau lebih tinggi untuk menambah agen/tim.`,
          cid
        );
      }
      const max = lic.features.maxAgents || lic.features.maxUsers || 1;
      if (max > 0 && nextCount > max) {
        const err: any = new Error(
          `Kuota pengguna/agen paket "${lic.plan}" penuh (${usage.agents}/${max}). Upgrade paket untuk menambah tim CS.`
        );
        err.statusCode = 403;
        err.code = 'QUOTA_EXCEEDED';
        throw err;
      }
      return lic;
    }

    if (metric === 'templates') {
      const max = lic.features.maxTemplates;
      if (max > 0 && usage.templates + targetCountOrDelta > max) {
        const err: any = new Error(
          `Batas template pesan paket "${lic.plan}" adalah ${max} template (terpakai ${usage.templates}). Upgrade paket untuk template lebih banyak.`
        );
        err.statusCode = 403;
        err.code = 'QUOTA_EXCEEDED';
        throw err;
      }
      return lic;
    }

    if (metric === 'channels') {
      if (!lic.features.omnichannel) {
        return this.assertFeature('omnichannel', undefined, cid);
      }
      const max = lic.features.maxChannels;
      if (max > 0 && usage.channels + targetCountOrDelta > max) {
        const err: any = new Error(
          `Batas kanal omnichannel paket "${lic.plan}" adalah ${max} akun (terpakai ${usage.channels}). Upgrade paket untuk menambah kanal.`
        );
        err.statusCode = 403;
        err.code = 'QUOTA_EXCEEDED';
        throw err;
      }
      return lic;
    }

    if (metric === 'broadcasts') {
      if (lic.features.unlimitedBroadcast) return lic;
      const max = lic.features.maxBroadcastPerMonth;
      if (max > 0 && usage.broadcastsThisMonth + targetCountOrDelta > max) {
        const err: any = new Error(
          `Kuota siaran bulan ini pada paket "${lic.plan}" maksimal ${max.toLocaleString('id-ID')} pesan (terpakai ${usage.broadcastsThisMonth.toLocaleString('id-ID')}). Upgrade untuk siaran tanpa batas.`
        );
        err.statusCode = 403;
        err.code = 'QUOTA_EXCEEDED';
        throw err;
      }
      return lic;
    }

    if (metric === 'storage') {
      const maxStorageMb = lic.features.maxStorageMb || 500;
      const maxAttachmentSizeMb = lic.features.maxAttachmentSizeMb || 10;
      const fileSizeMb = targetCountOrDelta / (1024 * 1024);
      if (maxAttachmentSizeMb > 0 && fileSizeMb > maxAttachmentSizeMb) {
        const err: any = new Error(
          `Ukuran berkas (${fileSizeMb.toFixed(1)} MB) melebihi batas maksimal ${maxAttachmentSizeMb} MB per berkas pada paket "${lic.plan}".`
        );
        err.statusCode = 403;
        err.code = 'QUOTA_EXCEEDED';
        throw err;
      }
      const nextBytes = usage.storageUsedBytes + Math.max(0, targetCountOrDelta);
      const maxBytes = maxStorageMb * 1024 * 1024;
      if (maxStorageMb > 0 && nextBytes > maxBytes) {
        const err: any = new Error(
          `Kapasitas penyimpanan dokumen & media paket "${lic.plan}" penuh (${usage.storageUsedMb.toLocaleString('id-ID')} MB / ${maxStorageMb.toLocaleString('id-ID')} MB). Hapus berkas lama di Galeri atau upgrade paket lisensi.`
        );
        err.statusCode = 403;
        err.code = 'QUOTA_EXCEEDED';
        throw err;
      }
      return lic;
    }

    return lic;
  }

  public async updateLicense(
    data: {
      plan: string;
      expiresAt: string;
      licenseKey?: string;
      planSlug?: string;
      period?: string;
      priceAmount?: number;
      status?: string;
      features?: any;
    },
    companyId?: string
  ): Promise<LicenseInfo> {
    const cid = getActiveCompanyId(companyId);
    const now = new Date();
    const expDate = new Date(data.expiresAt);
    if (Number.isNaN(expDate.getTime())) {
      throw new Error('Format tanggal expiresAt tidak valid');
    }

    if (data.licenseKey) {
      const cleanKey = data.licenseKey.trim();
      const [conflict] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(and(eq(companies.licenseKey, cleanKey), ne(companies.id, cid)))
        .limit(1);
      if (conflict) {
        const err: any = new Error('Kunci lisensi sudah digunakan oleh perusahaan lain.');
        err.statusCode = 409;
        throw err;
      }
    }

    const isExpired = expDate.getTime() < now.getTime();
    const status = data.status || (isExpired ? 'EXPIRED' : 'ACTIVE');
    const resolvedFeatures = resolveFeatures(data.features, isExpired, data.plan);

    const existing = await this.getCompanyRow(cid);
    const finalKey = data.licenseKey?.trim() || existing?.licenseKey || `RN-SAAS-${cid.slice(-6).toUpperCase()}-${now.getTime().toString(36).toUpperCase()}`;

    await db
      .update(companies)
      .set({
        licensePlan: data.plan,
        licensePlanSlug: data.planSlug !== undefined ? data.planSlug : existing?.licensePlanSlug,
        licensePeriod: data.period || (data.plan.toLowerCase().includes('tahun') ? 'annual' : 'monthly'),
        licensePriceAmount:
          typeof data.priceAmount === 'number' && data.priceAmount >= 0
            ? data.priceAmount
            : existing?.licensePriceAmount ?? 0,
        licenseStatus: status,
        licenseStartedAt: existing?.licenseStartedAt || now,
        licenseExpiresAt: expDate,
        licenseKey: finalKey,
        licenseFeaturesJson: JSON.stringify(resolvedFeatures),
        trialUsed: true,
        updatedAt: now,
      })
      .where(eq(companies.id, cid));

    this.invalidateCache(cid);
    return await this.getLicense(cid, true);
  }

  public async assignCompanyPlan(
    companyId: string,
    payload: {
      planSlug?: string;
      planName?: string;
      status?: 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'SUSPENDED' | 'UNLICENSED';
      months?: number;
      days?: number;
      expiresAt?: string;
      licenseKey?: string;
      priceAmount?: number;
      features?: Record<string, any>;
    }
  ): Promise<LicenseInfo> {
    const company = await this.getCompanyRow(companyId);
    if (!company) {
      const err: any = new Error('Perusahaan/tenant tidak ditemukan');
      err.statusCode = 404;
      throw err;
    }

    const now = new Date();
    if (payload.status === 'UNLICENSED') {
      await db
        .update(companies)
        .set({
          licenseStatus: 'UNLICENSED',
          licenseKey: null,
          licensePlan: 'Belum Diaktivasi',
          licensePlanSlug: null,
          licenseExpiresAt: null,
          licenseFeaturesJson: null,
          updatedAt: now,
        })
        .where(eq(companies.id, companyId));
      this.invalidateCache(companyId);
      return await this.getLicense(companyId, true);
    }

    if (payload.status === 'SUSPENDED') {
      await db
        .update(companies)
        .set({
          licenseStatus: 'SUSPENDED',
          updatedAt: now,
        })
        .where(eq(companies.id, companyId));
      this.invalidateCache(companyId);
      return await this.getLicense(companyId, true);
    }

    const plans = await this.getPlans();
    const matchedPlan = payload.planSlug ? plans.find((p) => p.slug === payload.planSlug) : null;
    const planName = payload.planName?.trim() || matchedPlan?.name || company.licensePlan || 'Growth Pro Bulanan';
    const period = matchedPlan?.period || (planName.toLowerCase().includes('tahun') ? 'annual' : 'monthly');
    const priceAmount =
      typeof payload.priceAmount === 'number' && payload.priceAmount >= 0
        ? payload.priceAmount
        : matchedPlan?.priceAmount ?? company.licensePriceAmount ?? 179000;

    let expDate: Date;
    if (payload.expiresAt) {
      expDate = new Date(payload.expiresAt);
      if (Number.isNaN(expDate.getTime())) throw new Error('Format tanggal expiresAt tidak valid');
    } else if (typeof payload.days === 'number' && payload.days > 0) {
      expDate = new Date(now.getTime() + payload.days * 86400_000);
    } else {
      const months =
        typeof payload.months === 'number' && payload.months > 0
          ? payload.months
          : matchedPlan?.months || 1;
      const base =
        company.licenseExpiresAt && company.licenseExpiresAt.getTime() > now.getTime()
          ? new Date(company.licenseExpiresAt)
          : now;
      expDate = new Date(base);
      expDate.setMonth(expDate.getMonth() + months);
    }

    const mergedFeaturesRaw = payload.features || matchedPlan?.features || undefined;
    const isExpired = expDate.getTime() < now.getTime() || payload.status === 'EXPIRED';
    const finalStatus = payload.status || (isExpired ? 'EXPIRED' : 'ACTIVE');

    return await this.updateLicense(
      {
        plan: planName,
        planSlug: matchedPlan?.slug || payload.planSlug || company.licensePlanSlug || undefined,
        period: finalStatus === 'TRIAL' ? 'trial' : period,
        priceAmount,
        status: finalStatus,
        expiresAt: expDate.toISOString(),
        licenseKey: payload.licenseKey?.trim() || company.licenseKey || undefined,
        features: mergedFeaturesRaw,
      },
      companyId
    );
  }

  public async activateLicenseKey(licenseKey: string, companyId?: string): Promise<LicenseInfo> {
    const cid = getActiveCompanyId(companyId);
    const cleanKey = String(licenseKey || '').trim();
    if (!cleanKey || cleanKey.length < 8) {
      throw new Error('Kunci lisensi tidak valid (minimal 8 karakter).');
    }

    // Prevent the same license key from being activated on multiple tenants simultaneously
    const [existingHolder] = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(and(eq(companies.licenseKey, cleanKey), ne(companies.id, cid)))
      .limit(1);
    if (existingHolder) {
      const err: any = new Error(
        `Kunci lisensi ini sudah terikat aktif pada perusahaan "${existingHolder.name}". Satu kunci hanya berlaku untuk satu perusahaan.`
      );
      err.statusCode = 409;
      throw err;
    }

    const reneoUrl = this.getReneoUrl();
    try {
      const verifyRes = await axios.get(`${reneoUrl}/api/v1/app-licenses/verify`, {
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
      const expDate = new Date(verifyRes.data.expiresAt);
      const isExpired = Number.isNaN(expDate.getTime()) ? false : expDate.getTime() < now.getTime();
      const planName = verifyRes.data.planName || 'Lisensi Aktif (Reneo CRM)';
      const features = resolveFeatures(verifyRes.data.features, isExpired, planName);

      await db
        .update(companies)
        .set({
          licenseKey: cleanKey,
          licenseStatus: isExpired ? 'EXPIRED' : 'ACTIVE',
          licensePlan: planName,
          licensePlanSlug: verifyRes.data.planSlug || null,
          licensePeriod: verifyRes.data.period || (planName.toLowerCase().includes('tahun') ? 'annual' : 'monthly'),
          licensePriceAmount:
            typeof verifyRes.data.priceAmount === 'number' ? verifyRes.data.priceAmount : 0,
          licenseStartedAt: verifyRes.data.startedAt ? new Date(verifyRes.data.startedAt) : now,
          licenseExpiresAt: Number.isNaN(expDate.getTime()) ? new Date(now.getTime() + 30 * 86400_000) : expDate,
          licenseFeaturesJson: JSON.stringify(features),
          trialUsed: true,
          updatedAt: now,
        })
        .where(eq(companies.id, cid));

      this.invalidateCache(cid);
      return await this.getLicense(cid, true);
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

  public async getPlans(): Promise<LicensePlanDefinition[]> {
    const reneoUrl = this.getReneoUrl();
    try {
      const res = await axios.get(`${reneoUrl}/api/v1/app-catalog/plans/reneo-crm`, {
        timeout: 4500,
      });
      if (res.data && res.data.ok && Array.isArray(res.data.plans) && res.data.plans.length > 0) {
        return res.data.plans.map(enrichPlanWithDiscount);
      }
    } catch {
      // Fallback researched preset plans if Reneo is offline
    }

    return getResearchedDefaultPlans();
  }

  public async startTrial(planSlug: string, companyId?: string, buyerPhone?: string): Promise<LicenseInfo> {
    const cid = getActiveCompanyId(companyId);
    const reneoUrl = this.getReneoUrl();
    const slug = (planSlug || 'pro-monthly').trim();
    const cleanPhone = (buyerPhone || '').trim();

    const company = await this.getCompanyRow(cid);
    if (!company) {
      const e: any = new Error('Perusahaan tidak ditemukan.');
      e.statusCode = 404;
      throw e;
    }
    if (company.trialUsed || company.licenseKey) {
      const e: any = new Error('Perusahaan ini sudah pernah menggunakan sesi lisensi atau trial sebelumnya.');
      e.statusCode = 409;
      throw e;
    }

    // Default host workspace tries syncing official trial with Reneo Panel first
    if (company.isDefault) {
      try {
        const res = await axios.post(
          `${reneoUrl}/api/v1/app-catalog/trial`,
          { catalogId: 'reneo-crm', planSlug: slug, ...(cleanPhone ? { buyerPhone: cleanPhone } : {}) },
          { headers: this.getReneoHeaders(), timeout: 6000 }
        );
        if (res.data?.ok) {
          this.invalidateCache(cid);
          return await this.syncWithReneo(cid);
        }
      } catch (err: any) {
        if (err?.response?.status && err.response.status >= 400 && err.response.status < 500) {
          const msg = err.response.data?.error || 'Gagal mengaktifkan paket trial.';
          const e: any = new Error(msg);
          e.statusCode = err.response.status;
          throw e;
        }
      }
    }

    const plans = await this.getPlans();
    const target = plans.find((p) => p.slug === slug) || plans[1] || plans[0];
    const trialDays = typeof target?.trialDays === 'number' && target.trialDays > 0 ? target.trialDays : 7;
    const now = new Date();
    const expDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    const trialPlanName = `${target?.name || 'Growth Pro Bulanan'} (Trial ${trialDays} Hari)`;
    const trialKey = `RN-TRIAL-${slug.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)}-${Date.now().toString(36).toUpperCase()}`;
    const resolvedFeatures = resolveFeatures(target?.features, false, trialPlanName);

    await db
      .update(companies)
      .set({
        licenseKey: trialKey,
        licenseStatus: 'TRIAL',
        licensePlan: trialPlanName,
        licensePlanSlug: target?.slug || slug,
        licensePeriod: 'trial',
        licensePriceAmount: 0,
        licenseStartedAt: now,
        licenseExpiresAt: expDate,
        licenseFeaturesJson: JSON.stringify(resolvedFeatures),
        trialUsed: true,
        updatedAt: now,
      })
      .where(eq(companies.id, cid));

    this.invalidateCache(cid);
    return await this.getLicense(cid, true);
  }

  public async createOrder(
    payload: {
      planSlug: string;
      quantity?: number;
      buyerName?: string;
      buyerEmail?: string;
      buyerPhone?: string;
      paymentMethod?: string;
    },
    companyId?: string
  ) {
    const cid = getActiveCompanyId(companyId);
    const reneoUrl = this.getReneoUrl();
    const company = await this.getCompanyRow(cid);
    let buyerName = payload.buyerName || company?.ownerName || undefined;
    let buyerEmail = payload.buyerEmail || company?.ownerEmail || undefined;
    const buyerPhone = payload.buyerPhone || company?.ownerPhone || undefined;

    if (!buyerName || !buyerEmail) {
      const settingsMap = await getCompanySettingMap(cid);
      buyerName = buyerName || settingsMap['crm_admin_name'] || company?.name || 'Pelanggan CRM';
      buyerEmail = buyerEmail || settingsMap['crm_admin_email'] || undefined;
    }

    const rawQty = Number(payload.quantity ?? 1);
    const quantity = Number.isFinite(rawQty) ? Math.min(24, Math.max(1, Math.round(rawQty))) : 1;
    const res = await axios.post(
      `${reneoUrl}/api/v1/app-catalog/order`,
      {
        catalogId: 'reneo-crm',
        planSlug: payload.planSlug,
        quantity,
        buyerName,
        buyerEmail,
        buyerPhone,
        paymentMethod: payload.paymentMethod || 'transfer',
      },
      { headers: this.getReneoHeaders(), timeout: 6000 }
    );
    return res.data;
  }

  public async getOrder(publicId: string, companyId?: string) {
    const cid = getActiveCompanyId(companyId);
    const reneoUrl = this.getReneoUrl();
    const res = await axios.get(`${reneoUrl}/api/v1/app-catalog/orders/${publicId}`, {
      headers: this.getReneoHeaders(),
      timeout: 5000,
    });
    if (res.data?.order?.status === 'paid') {
      await this.applyPaidOrderToCompany(cid, res.data.order).catch(() => {});
    }
    return res.data;
  }

  public async payOrder(publicId: string, paymentMethod = 'saldo', companyId?: string) {
    const cid = getActiveCompanyId(companyId);
    const reneoUrl = this.getReneoUrl();
    const res = await axios.post(
      `${reneoUrl}/api/v1/app-catalog/orders/${publicId}/pay`,
      { paymentMethod },
      { headers: this.getReneoHeaders(), timeout: 6000 }
    );
    const issuedKey = res.data?.licenseKey || res.data?.order?.licenseKey;
    if (issuedKey && cid !== DEFAULT_COMPANY_ID) {
      await this.activateLicenseKey(String(issuedKey), cid).catch(() => {});
    } else if (res.data?.order) {
      await this.applyPaidOrderToCompany(cid, res.data.order).catch(() => {});
    } else {
      this.invalidateCache(cid);
      await this.syncWithReneo(cid);
    }
    return res.data;
  }

  private async applyPaidOrderToCompany(companyId: string, order: any): Promise<void> {
    const cid = getActiveCompanyId(companyId);
    if (cid === DEFAULT_COMPANY_ID) {
      this.invalidateCache(cid);
      await this.syncWithReneo(cid);
      return;
    }
    const company = await this.getCompanyRow(cid);
    if (!company) return;

    const orderKeyTag = `RN-SAAS-${String(order.invoiceNumber || order.publicId || order.id).toUpperCase()}`;
    if (company.licenseKey === orderKeyTag && company.licenseStatus === 'ACTIVE') {
      return;
    }
    const months = Math.max(1, Number(order.months || 1));
    await this.assignCompanyPlan(cid, {
      planSlug: order.planSlug || company.licensePlanSlug || 'pro-monthly',
      planName: order.planName || undefined,
      months,
      status: 'ACTIVE',
      licenseKey: orderKeyTag,
      priceAmount: typeof order.amountList === 'number' ? order.amountList : undefined,
    });
  }
}

export const licenseService = LicenseService.getInstance();
