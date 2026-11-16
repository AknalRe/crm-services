export interface ContactIdentityItem {
  id: string;
  channel: OmnichannelType | string;
  externalId: string;
  handle?: string | null;
}

export interface Contact {
  id: string;
  nama_lengkap: string;
  nama_panggilan?: string | null;
  tanggal_lahir?: string | null;
  nomor_whatsapp: string;
  alamat?: string | null;
  kategori?: string | null;
  tags?: string | null;
  notes?: string | null;
  identities?: ContactIdentityItem[];
  createdAt: string;
  updatedAt: string;
}

export interface Campaign {
  id: string;
  title: string;
  messageTemplate: string;
  type: 'IMMEDIATE' | 'SCHEDULED' | 'BIRTHDAY';
  channel?: OmnichannelType;
  channelAccountId?: string | null;
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

export type OmnichannelType = 'WHATSAPP' | 'WHATSAPP_CLOUD' | 'INSTAGRAM' | 'FACEBOOK' | 'THREADS' | 'TELEGRAM';

export interface ChannelAccount {
  id: string;
  channel: OmnichannelType;
  name: string;
  accountId: string;
  verifyToken?: string | null;
  hasToken: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChannelConnectLink {
  id: string;
  token: string;
  channel: OmnichannelType;
  label?: string | null;
  expiresAt: string;
  usedAt?: string | null;
  createdAt?: string;
}

export interface Conversation {
  id: string;
  contactId: string;
  channel?: OmnichannelType;
  channelAccountId?: string | null;
  externalThreadId?: string | null;
  contextTitle?: string | null;
  wahaSession?: string | null;
  status?: 'OPEN' | 'PENDING' | 'RESOLVED';
  labels?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  assignedAgentId?: string | null;
  assignedAgentName?: string | null;
  unreadCount: number;
  firstInboundAt?: string | null;
  firstResponseAt?: string | null;
  lastInboundAt?: string | null;
  resolvedAt?: string | null;
  csatToken?: string | null;
  csatRating?: number | null;
  csatFeedback?: string | null;
  csatSubmittedAt?: string | null;
  csatHistory?: CsatHistoryItem[];
  createdAt: string;
  updatedAt: string;
  contact: Contact;
}

export interface CsatHistoryItem {
  id: string;
  conversationId: string;
  wahaSession?: string | null;
  assignedAgentName?: string | null;
  token: string;
  triggerType: string;
  rating?: number | null;
  feedback?: string | null;
  sentAt: string;
  submittedAt?: string | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  contactId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  messageType?: 'TEXT' | 'MEDIA' | 'NOTE' | 'CSAT';
  wahaSession?: string | null;
  body: string;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'document' | 'audio' | 'video' | null;
  mediaName?: string | null;
  wahaMessageId?: string | null;
  status: string;
  ackStatus: number;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface ConversationAnalytics {
  totalConversations: number;
  openCount: number;
  pendingCount: number;
  resolvedCount: number;
  avgFirstResponseSeconds: number | null;
  avgResolutionSeconds: number | null;
  slaTargetSeconds: number;
  slaMeasuredCount: number;
  slaMetCount: number;
  slaBreachedCount: number;
  slaComplianceRate: number | null;
  csatCount: number;
  csatAverage: number | null;
  csatDistribution: Record<number, number>;
  recentCsat: Array<{
    conversationId: string;
    contactName: string;
    phone: string;
    wahaSession: string | null;
    rating: number;
    feedback: string | null;
    submittedAt: string | null;
  }>;
  bySession: Array<{
    session: string;
    count: number;
    resolvedCount: number;
    avgCsat: number | null;
  }>;
  byChannel?: Array<{
    channel: string;
    count: number;
    resolvedCount: number;
    avgCsat: number | null;
  }>;
  byAgent?: Array<{
    agentName: string;
    count: number;
    resolvedCount: number;
    slaRate: number | null;
    avgCsat: number | null;
  }>;
}

export interface CannedResponse {
  id: string;
  shortCode: string;
  title: string;
  category?: string;
  content: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type CrmLabelScope = 'CONVERSATION_LABEL' | 'CONTACT_CATEGORY';
export type CrmLabelColor = 'slate' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet';

export interface CrmLabelItem {
  id: string;
  scope: CrmLabelScope;
  name: string;
  color: CrmLabelColor;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface MessageTemplateItem {
  id: string;
  name: string;
  category: string;
  channel: 'ALL' | OmnichannelType;
  content: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
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
  conversationAnalytics?: ConversationAnalytics;
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
    externalConfig?: {
      baseUrl: string;
      apiKey?: string;
      hasApiKey?: boolean;
    };
    internalConfig?: {
      baseUrl: string;
      hasApiKey?: boolean;
    };
  };
}

export interface BirthdaySetting {
  id: string;
  isEnabled: boolean;
  sendTime: string;
  messageTemplate: string;
  delaySeconds: number;
  channel?: OmnichannelType;
  channelAccountId?: string | null;
  wahaSession?: string | null;
  lastRunDate?: string | null;
  multiSenders?: {
    mode: 'AUTO_MULTI' | 'SINGLE';
    wahaSessions: string[];
    channelAccountIds: string[];
  };
}

export interface AuthStatus {
  initialized: boolean;
  authenticated: boolean;
  user: {
    id?: string;
    name: string;
    email: string;
    role?: 'ADMIN' | 'AGENT';
    permissions?: string[];
  } | null;
}

export interface AgentItem {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'AGENT';
  permissions: string[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentQuota {
  multiAgent: boolean;
  maxAgents: number;
  currentCount: number;
  plan: string;
}

export interface CrmSlaCsatSettings {
  csatTemplate: string;
  csatAutoOnResolve: boolean;
  slaTargetMinutes: number;
  csatBaseUrl?: string;
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
  publicUrls?: string[];
  features: {
    unlimitedBroadcast: boolean;
    birthdayAutomation: boolean;
    liveChatCrm: boolean;
    multiSession: boolean;
    maxSessions: number;
    maxContacts: number;
    multiAgent?: boolean;
    maxAgents?: number;
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
  trialDays?: number;
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

export interface ProductItem {
  id: string;
  sku: string;
  name: string;
  category?: string | null;
  price: number;
  unit: string;
  description?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AutoReplyRule {
  id: string;
  keyword: string;
  matchType: 'CONTAINS' | 'EXACT' | 'STARTS_WITH';
  replyText: string;
  isActive: boolean;
  priority: number;
  createdAt?: string;
}

export interface AutomationConfig {
  autoAssignMode: 'NONE' | 'ROUND_ROBIN' | 'LEAST_BUSY';
  welcomeEnabled: boolean;
  welcomeMessage: string;
  offhoursEnabled: boolean;
  businessHoursStart: string;
  businessHoursEnd: string;
  businessDays: string;
  offhoursMessage: string;
  slaEscalationEnabled: boolean;
  slaAlertWebhookUrl: string;
}

export interface WebhookDeliveryItem {
  id: string;
  event: string;
  targetUrl: string;
  status: string;
  httpStatus?: number | null;
  errorMessage?: string | null;
  payloadSummary?: string | null;
  createdAt: string;
}

export type SettingsSection =
  | 'whatsapp'
  | 'omnichannel'
  | 'quick_replies'
  | 'products'
  | 'labels'
  | 'templates'
  | 'automation'
  | 'sla_csat'
  | 'agents';

export interface ScheduledPostItem {
  id: string;
  channel: 'INSTAGRAM' | 'FACEBOOK' | 'THREADS' | 'TELEGRAM';
  channelAccountId: string;
  accountName?: string | null;
  accountExternalId?: string | null;
  caption: string;
  mediaUrl?: string | null;
  targetChatId?: string | null;
  status: 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'CANCELLED';
  scheduledAt: string;
  publishedAt?: string | null;
  externalPostId?: string | null;
  errorMessage?: string | null;
  createdAt: string;
}

export interface MediaLibraryItem {
  filename: string;
  url: string;
  relativeUrl: string;
  mimeType: string;
  mediaKind: 'image' | 'video';
  sizeBytes: number;
  createdAt: string;
}

export interface ContentIdeaItem {
  id: string;
  title: string;
  notes?: string | null;
  channel: 'INSTAGRAM' | 'FACEBOOK' | 'THREADS' | 'TELEGRAM';
  stage: string;
  createdAt: string;
  updatedAt: string;
}

export interface IdeaColumn {
  id: string;
  label: string;
}

export interface SocialCommentItem {
  id: string;
  channel: 'INSTAGRAM' | 'FACEBOOK' | 'THREADS';
  channelAccountId: string;
  accountName?: string | null;
  postId?: string | null;
  postCaption?: string | null;
  externalCommentId?: string | null;
  authorName: string;
  authorHandle?: string | null;
  content: string;
  status: 'PENDING' | 'DONE';
  replyText?: string | null;
  repliedAt?: string | null;
  createdAt: string;
}

export interface FeedPostItem {
  id: string;
  text?: string;
  username?: string;
  permalink?: string;
  timestamp?: string;
}

export interface CommentAutomationItem {
  id: string;
  name: string;
  channel: 'ALL' | 'INSTAGRAM' | 'FACEBOOK' | 'THREADS';
  keyword: string;
  matchType: 'CONTAINS' | 'EXACT';
  replyComment?: string | null;
  sendDm: boolean;
  dmText?: string | null;
  isActive: boolean;
  triggerCount: number;
  createdAt: string;
  updatedAt: string;
}

export type AiProviderId =
  | 'OPENAI'
  | 'GEMINI'
  | 'ANTHROPIC'
  | 'OPENROUTER'
  | 'GROQ'
  | 'DEEPSEEK'
  | 'CUSTOM_OPENAI'
  | 'LOCAL_KB';

export type ExternalAiProviderId = Exclude<AiProviderId, 'LOCAL_KB'>;

export interface AiModelOption {
  id: string;
  label: string;
  source?: 'api' | 'recommended';
}

export interface AiProviderCatalogEntry {
  id: AiProviderId;
  label: string;
  protocol: 'openai' | 'gemini' | 'anthropic' | 'local';
  defaultBaseUrl: string;
  defaultModel: string;
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  supportsModelFetch: boolean;
  apiKeyPlaceholder: string;
  baseUrlPlaceholder: string;
  recommendedModels: AiModelOption[];
}

export interface AiFallbackTarget {
  id: string;
  enabled: boolean;
  provider: ExternalAiProviderId;
  model: string;
  baseUrl?: string;
  hasApiKey?: boolean;
  apiKeyPreview?: string;
  apiKey?: string;
  clearApiKey?: boolean;
}

export interface AiPersonalityProfile {
  roleTitle: string;
  tone: 'PROFESSIONAL' | 'FRIENDLY' | 'FORMAL' | 'CASUAL' | 'EMPATHETIC';
  language: 'INDONESIAN' | 'ENGLISH' | 'BILINGUAL' | 'MATCH_USER';
  responseLength: 'CONCISE' | 'BALANCED' | 'DETAILED';
  emojiUsage: 'NONE' | 'MINIMAL' | 'MODERATE';
  greetingStyle: string;
  closingStyle: string;
}

export interface AiAgentConfig {
  enabled: boolean;
  name: string;
  persona: string;
  personality: AiPersonalityProfile;
  positivePrompt: string;
  negativePrompt: string;
  enabledBuiltinTools: string[];
  autoReplyDm: boolean;
  autoReplyComment: boolean;
  provider: AiProviderId;
  model: string;
  baseUrl?: string;
  hasApiKey?: boolean;
  apiKeyPreview?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  fallbacks: AiFallbackTarget[];
  fallbackToLocalKb: boolean;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

export interface AiAttemptTrace {
  role: 'PRIMARY' | 'FALLBACK' | 'LOCAL_KB';
  slotId: string;
  slotLabel: string;
  provider: AiProviderId;
  providerLabel: string;
  model: string;
  ok: boolean;
  durationMs: number;
  error?: string;
}

export interface AiToolCallTrace {
  toolName: string;
  displayName: string;
  source: 'CRM' | 'MCP';
  serverName?: string;
  ok: boolean;
  durationMs: number;
  summary: string;
}

export interface AiTestResult {
  reply: string;
  source: AiProviderId;
  providerLabel: string;
  model: string;
  fallbackUsed: boolean;
  attempts: AiAttemptTrace[];
  toolCalls?: AiToolCallTrace[];
}

export interface AiSlotVerifyResult {
  ok: boolean;
  provider: AiProviderId;
  providerLabel: string;
  model: string;
  durationMs: number;
  replyPreview?: string;
  error?: string;
}

export interface AiKnowledgeBook {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  sourceType: 'MANUAL' | 'PRESET' | 'URL' | 'CATALOG_SYNC' | 'MARKDOWN';
  sourceUrl?: string | null;
  isActive: boolean;
  itemCount?: number;
  activeItemCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AiKnowledgeBookPreset {
  id: string;
  title: string;
  description: string;
  category: string;
  chapters: Array<{ title: string; category: string; content: string }>;
}

export interface AiKnowledgeItem {
  id: string;
  bookId?: string | null;
  title: string;
  category: 'FAQ' | 'CATALOG' | 'POLICY' | 'WEB';
  content: string;
  sourceUrl?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiSkill {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  category: 'CRM' | 'SALES' | 'SUPPORT' | 'OPERATIONS' | 'CUSTOM';
  triggerHint?: string | null;
  instructions: string;
  linkedTools: string[];
  sourceType: 'MANUAL' | 'PRESET' | 'URL' | 'MARKDOWN';
  sourceUrl?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiSkillPreset {
  slug: string;
  name: string;
  description: string;
  category: 'CRM' | 'SALES' | 'SUPPORT' | 'OPERATIONS' | 'CUSTOM';
  triggerHint: string;
  instructions: string;
  linkedTools: string[];
}

export interface BuiltinCrmTool {
  name: string;
  label: string;
  description: string;
}

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export interface AiMcpServer {
  id: string;
  name: string;
  description?: string | null;
  transport: string;
  endpointUrl: string;
  authType: 'NONE' | 'BEARER' | 'HEADER';
  authHeaderName: string;
  hasAuthToken?: boolean;
  authTokenPreview?: string;
  authToken?: string;
  clearAuthToken?: boolean;
  cachedTools: McpToolDescriptor[];
  disabledTools: string[];
  lastSyncedAt?: string | null;
  lastError?: string | null;
  isActive: boolean;
}


