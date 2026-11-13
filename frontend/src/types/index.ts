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

export interface WahaStatus {
  connected: boolean;
  sessionStatus: string;
  details?: any;
  error?: string;
  config: {
    baseUrl: string;
    apiKey?: string;
    session: string;
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

export interface LicenseInfo {
  status: 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'GRACE_PERIOD';
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
    maxContacts: number;
  };
}

