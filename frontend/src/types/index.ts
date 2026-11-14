export interface Contact {
  id: string;
  nama_lengkap: string;
  nama_panggilan?: string | null;
  tanggal_lahir?: string | null;
  nomor_whatsapp: string;
  alamat?: string | null;
  tags?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Campaign {
  id: string;
  title: string;
  messageTemplate: string;
  type: 'IMMEDIATE' | 'SCHEDULED' | 'BIRTHDAY';
  status: 'DRAFT' | 'SCHEDULED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  scheduledAt?: string | null;
  delaySeconds: number;
  intervalSeconds: number;
  batchSize: number;
  filterTags?: string | null;
  totalCount: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignRecipient {
  id: string;
  campaignId: string;
  contactId: string;
  phone: string;
  personalizedMessage: string;
  wahaMessageId?: string | null;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  ackStatus: number;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  contact?: {
    id: string;
    nama_lengkap: string;
    nama_panggilan?: string | null;
    nomor_whatsapp: string;
  };
  campaign?: {
    id: string;
    title: string;
    type: string;
  };
}

export interface Conversation {
  id: string;
  contactId: string;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
  contact: Contact;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  contactId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  body: string;
  mediaUrl?: string | null;
  wahaMessageId?: string | null;
  status: string;
  ackStatus: number;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface DashboardStats {
  summary: {
    totalContacts: number;
    totalCampaigns: number;
    totalRecipients: number;
    pending: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    deliveryRate: number;
    readRate: number;
    birthdayTodayCount: number;
  };
  recentCampaigns: Campaign[];
  recentActivity: CampaignRecipient[];
}

export interface WahaSessionItem {
  name: string;
  status: string;
  me?: {
    id?: string;
    pushName?: string;
  } | null;
}

export interface WahaStatus {
  connected: boolean;
  sessionStatus: string;
  activeSession?: string;
  connectedSessions?: number;
  totalSessions?: number;
  sessions?: Array<{ name: string; status: string }>;
  details?: any;
  error?: string;
  webhookUrl?: string;
  config: {
    baseUrl: string;
    apiKey?: string;
    session: string;
    mode?: 'INTERNAL' | 'EXTERNAL';
    internalLocked?: boolean;
    hasApiKey?: boolean;
  };
}

export interface BirthdaySetting {
  id: string;
  isEnabled: boolean;
  sendTime: string;
  messageTemplate: string;
  delaySeconds: number;
  lastRunDate?: string | null;
}

export interface AuthStatus {
  initialized: boolean;
  authenticated: boolean;
  user: {
    name: string;
    email: string;
  } | null;
}

export interface LicenseInfo {
  status: 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'GRACE_PERIOD' | 'UNLICENSED';
  plan: string;
  period: 'monthly' | 'quarterly' | 'annual' | 'trial';
  expiresAt: string;
  daysLeft: number;
  isExpired: boolean;
  managedByReneo: boolean;
  reneoBillingUrl: string;
  licenseKey?: string;
  features: {
    unlimitedBroadcast: boolean;
    birthdayAutomation: boolean;
    liveChatCrm: boolean;
    multiSession: boolean;
    maxSessions: number;
    maxContacts: number;
  };
}

export interface LicensePlan {
  id: number;
  catalogId: string;
  slug: string;
  name: string;
  tagline: string;
  period: string;
  months: number;
  priceAmount: number;
  features: {
    unlimitedBroadcast?: boolean;
    maxContacts?: number;
    birthdayBot?: boolean;
    liveChat?: boolean;
    multiSession?: boolean;
    maxSessions?: number;
    wahaSync?: boolean;
    [key: string]: any;
  };
  highlighted: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface PaymentMethodItem {
  id: string;
  kind: string;
  name: string;
  account: string;
  holder: string;
  enabled: boolean;
}

export interface LicenseOrder {
  id: number;
  publicId: string;
  invoiceNumber: string;
  userId: number;
  catalogId: string;
  appName: string;
  planSlug: string;
  planName: string;
  period: string;
  months: number;
  amountList: number;
  uniqueCode: number;
  amountTotal: number;
  status: 'pending' | 'paid' | 'cancelled';
  paymentMethod: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  createdAt: string;
  expiresAt: string;
  paidAt?: string;
}


