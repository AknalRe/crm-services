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
  exclude_from_metrics?: boolean;
  exclude_reason?: string | null;
  profile_picture_url?: string | null;
  profile_about?: string | null;
  profile_synced_at?: string | null;
  is_verified?: boolean;
  verified_name?: string | null;
  verified_level?: string | null;
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

export interface WahaSessionPrivacyRule {
  autoReadOnOpen: boolean;
  sendOnlinePresence: boolean;
  readReceipts: boolean;
}

export interface WahaPrivacyConfig {
  general: WahaSessionPrivacyRule;
  sessions: Record<string, Partial<WahaSessionPrivacyRule>>;
}

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
  channelAccountName?: string | null;
  externalThreadId?: string | null;
  contextTitle?: string | null;
  wahaSession?: string | null;
  pushName?: string | null;
  channelDisplayName?: string | null;
  isGroup?: boolean;
  excludeFromMetrics?: boolean;
  excludeReason?: string | null;
  status?: 'OPEN' | 'PENDING' | 'RESOLVED';
  labels?: string | null;
  lastMessage?: string | null;
  lastMessageMentionedContacts?: ResolvedMentionItem[];
  lastMessageAt?: string | null;
  assignedAgentId?: string | null;
  assignedAgentName?: string | null;
  unreadCount: number;
  sessionStartedAt?: string | null;
  firstInboundAt?: string | null;
  firstResponseAt?: string | null;
  lastInboundAt?: string | null;
  resolvedAt?: string | null;
  csatToken?: string | null;
  csatRating?: number | null;
  csatOverallScore?: number | null;
  csatFeedback?: string | null;
  csatSubmittedAt?: string | null;
  csatHistory?: CsatHistoryItem[];
  createdAt: string;
  updatedAt: string;
  contact: Contact;
}

export interface CsatCriterionScoreDetail {
  key: string;
  label: string;
  score: number;
}

export interface CsatCriterionAggregate {
  key: string;
  label: string;
  average: number;
  count: number;
  distribution?: Record<number, number>;
}

export interface CsatCriterion {
  key: string;
  label: string;
  description?: string;
  required: boolean;
  isActive: boolean;
}


export interface CsatTextConfig {
  brandName: string;
  title: string;
  subtitle: string;
  greetingText: string;
  scaleLabels: Record<string, string>;
  feedbackLabel: string;
  feedbackPlaceholder: string;
  requireFeedbackOnLow: boolean;
  submitButtonText: string;
  thankYouTitle: string;
  thankYouMessage: string;
}

export interface CsatTargetProfile {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  matchWahaSessions: string[];
  matchChannels: string[];
  matchLabels: string[];
  ctaTemplate?: string;
  texts: CsatTextConfig;
  criteria: CsatCriterion[];
}

export interface CsatSurveyConfig {
  profiles: CsatTargetProfile[];
}

export interface CsatHistoryItem {
  id: string;
  conversationId: string;
  wahaSession?: string | null;
  assignedAgentName?: string | null;
  token: string;
  triggerType: string;
  profileName?: string | null;
  rating?: number | null;
  overallScore?: number | null;
  criteriaDetails?: CsatCriterionScoreDetail[];
  feedback?: string | null;
  conversationStartedAt?: string | null;
  conversationResolvedAt?: string | null;
  sentAt: string;
  submittedAt?: string | null;
}

export interface ConversationNavigationTarget {
  conversationId: string;
  csatToken?: string | null;
  csatStartedAt?: string | null;
  csatResolvedAt?: string | null;
}

export interface InteractiveButtonItem {
  type: 'reply' | 'url' | 'call' | 'copy';
  text: string;
  url?: string;
  phoneNumber?: string;
  copyCode?: string;
}

export interface SharedContactMetadataItem {
  fullName: string;
  phones: string[];
  waId?: string;
  organization?: string;
  email?: string;
  vcard?: string;
}

export interface LocationMessageMetadata {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  url?: string;
  isLive?: boolean;
  accuracyInMeters?: number;
}

export interface MessageReactionItem {
  emoji: string;
  actor: string;
  actorName?: string;
  isOutbound?: boolean;
}

export interface SavedStickerItem {
  id: string;
  name: string;
  mediaUrl: string;
  createdAt: string;
}

export interface PollVoteMetadataItem {
  voterId: string;
  voterName?: string | null;
  voterPhone?: string | null;
  selectedOptions: string[];
  updatedAt: string;
  fromMe?: boolean;
  voteFailed?: boolean;
}

export interface ChatMessageMetadata {
  kind?:
  | 'LINK'
  | 'BUTTONS'
  | 'POLL'
  | 'POLL_VOTE'
  | 'CONTACT'
  | 'LOCATION'
  | 'STICKER'
  | 'ORDER'
  | 'PRODUCT'
  | 'GROUP_INVITE'
  | 'ACTIVITY';
  action?: string;
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  detail?: Record<string, any> | null;
  usedFallbackText?: boolean;
  fallbackReason?: string;
  revoked?: boolean;
  revokedAt?: string;
  revokedBy?: string;
  revokedBySender?: boolean;
  revokeScope?: 'ME' | 'EVERYONE';
  isPinned?: boolean;
  pinnedAt?: string | null;
  pinnedBy?: string | null;
  pinDuration?: number | null;
  pinExpiresAt?: string | null;
  asDocument?: boolean;
  isHd?: boolean;
  sentVia?: 'CRM' | 'AI_BOT' | 'BROADCAST' | 'WHATSAPP_WEB' | 'WHATSAPP_PHONE' | 'WHATSAPP_DEVICE' | 'WHATSAPP_API' | string;
  sentViaLabel?: string;
  sentDeviceType?: string;
  isStarred?: boolean;
  starredAt?: string | null;
  forwarded?: boolean;
  forwardingScore?: number;
  forwardedFromSender?: string;
  forwardedFromChannel?: string;
  mentions?: string[];
  reactions?: MessageReactionItem[];
  linkPreview?: {
    url: string;
    title?: string;
    description?: string;
    caption?: string;
    imageUrl?: string;
  };
  interactiveButtons?: {
    header?: string;
    body: string;
    footer?: string;
    fallbackTextOnUnsupported?: boolean;
    buttons: InteractiveButtonItem[];
  };
  poll?: {
    question: string;
    options: string[];
    multipleAnswers?: boolean;
    votes?: PollVoteMetadataItem[];
  };
  pollVote?: {
    pollMessageId?: string | null;
    pollWahaMessageId?: string | null;
    question?: string | null;
    options?: string[];
    selectedOptions: string[];
    voterId?: string | null;
    voterName?: string | null;
    voterPhone?: string | null;
    voteFailed?: boolean;
  };
  sharedContacts?: SharedContactMetadataItem[];
  location?: LocationMessageMetadata;
  sticker?: {
    isAnimated?: boolean;
  };
  order?: {
    orderId?: string;
    title?: string;
    itemCount?: number;
    totalAmount?: number;
    currency?: string;
  };
  product?: {
    productId?: string;
    title?: string;
    description?: string;
    price?: number;
    currency?: string;
  };
  groupInvite?: {
    groupJid?: string;
    groupName?: string;
    inviteCode?: string;
    caption?: string;
  };
}

export interface ResolvedMentionItem {
  token: string;
  jid: string | null;
  phone: string | null;
  name: string | null;
  contactId: string | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  contactId: string;
  direction: 'INBOUND' | 'OUTBOUND' | 'SYSTEM';
  messageType?: 'TEXT' | 'MEDIA' | 'NOTE' | 'CSAT' | 'LINK' | 'BUTTONS' | 'POLL' | 'CONTACT' | 'LOCATION' | 'ACTIVITY';
  wahaSession?: string | null;
  body: string;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'document' | 'audio' | 'video' | null;
  mediaName?: string | null;
  replyToMessageId?: string | null;
  replyToBody?: string | null;
  replyToSender?: string | null;
  metadataJson?: string | null;
  wahaMessageId?: string | null;
  senderJid?: string | null;
  senderPhone?: string | null;
  senderName?: string | null;
  senderAvatarUrl?: string | null;
  mentionedContacts?: ResolvedMentionItem[];
  status: string;
  ackStatus: number;
  errorMessage?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface ConversationParticipantItem {
  jid: string;
  phone: string | null;
  name: string | null;
  contactId: string | null;
  contactName: string | null;
  avatarUrl?: string | null;
  role: 'superadmin' | 'admin' | 'member';
  messageCount: number;
  lastMessageAt: string | null;
  inGroup: boolean;
}

export interface ConversationParticipantsResponse {
  isGroup: boolean;
  groupJid: string | null;
  groupName: string | null;
  participants: ConversationParticipantItem[];
  syncError?: string | null;
}

export interface ConversationAnalytics {
  totalConversations: number;
  allConversationsCount?: number;
  excludedCount?: number;
  groupCount?: number;
  openCount: number;
  pendingCount: number;
  resolvedCount: number;
  unansweredCount?: number;
  todayInboundCount?: number;
  todayOutboundCount?: number;
  avgFirstResponseSeconds: number | null;
  avgFirstResponseMinutes?: number | null;
  avgResolutionSeconds: number | null;
  avgResolutionMinutes?: number | null;
  slaTargetSeconds: number;
  slaMeasuredCount: number;
  slaMetCount: number;
  slaBreachedCount: number;
  slaComplianceRate: number | null;
  csatCount: number;
  csatAverage: number | null;
  csatDistribution: Record<number, number>;
  csatByCriterion?: CsatCriterionAggregate[];
  csatByProfile?: Array<{
    profileId: string;
    profileName: string;
    average: number;
    count: number;
    criteria: CsatCriterionAggregate[];
  }>;
  recentCsat: Array<{
    id?: string;
    conversationId: string;
    token?: string | null;
    contactName: string;
    phone: string;
    wahaSession: string | null;
    agentName?: string | null;
    profileName?: string | null;
    rating: number;
    overallScore?: number;
    criteriaDetails?: CsatCriterionScoreDetail[];
    feedback: string | null;
    conversationStartedAt?: string | null;
    conversationResolvedAt?: string | null;
    submittedAt: string | null;
  }>;
  bySession: Array<{
    session: string;
    count: number;
    openCount?: number;
    pendingCount?: number;
    resolvedCount: number;
    slaRate?: number | null;
    csatCount?: number;
    avgCsat: number | null;
    csatCriteria?: CsatCriterionAggregate[];
  }>;
  byChannel?: Array<{
    channel: string;
    count: number;
    openCount?: number;
    pendingCount?: number;
    resolvedCount: number;
    slaRate?: number | null;
    csatCount?: number;
    avgCsat: number | null;
    csatCriteria?: CsatCriterionAggregate[];
  }>;
  byAgent?: Array<{
    agentId?: string | null;
    agentName: string;
    count: number;
    openCount?: number;
    pendingCount?: number;
    resolvedCount: number;
    avgFrtSeconds?: number | null;
    avgResolutionSeconds?: number | null;
    slaRate: number | null;
    csatCount?: number;
    avgCsat: number | null;
    csatCriteria?: CsatCriterionAggregate[];
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
  filters?: {
    period: string;
    session: string;
    channel: string;
  };
  summary: {
    totalContacts: number;
    groupContactsCount?: number;
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
    contactCategories?: Array<{ category: string; count: number }>;
    activityTrend7d?: Array<{
      date: string;
      label: string;
      conversationsAssessed: number;
      conversationsExcluded: number;
      broadcastSent: number;
      broadcastRead: number;
    }>;
  };
  conversationAnalytics?: ConversationAnalytics;
  recentCampaigns: Campaign[];
  recentActivity: CampaignRecipient[];
}

export type DashboardDrilldownKind = 'contacts' | 'recipients' | 'conversations' | 'csat';

export interface DashboardDrilldownResponse {
  kind: DashboardDrilldownKind;
  totalMatched: number;
  items: any[];
}

export interface WahaSessionItem {
  name: string;
  status: string;
  me?: {
    id?: string;
    pushName?: string;
  } | null;
}

export interface WahaWebhookTelemetry {
  receivedAt: string;
  event: string;
  session?: string | null;
  from?: string | null;
  outcome: 'PROCESSED' | 'DEDUP' | 'IGNORED' | 'ERROR';
  note?: string;
}

export interface WahaStatus {
  connected: boolean;
  sessionStatus: string;
  engine?: string | null;
  engineSupported?: boolean;
  activeSession?: string;
  connectedSessions?: number;
  totalSessions?: number;
  sessions?: Array<{ name: string; status: string }>;
  details?: any;
  error?: string;
  webhookUrl?: string;
  webhookReachableForExternal?: boolean;
  lastWebhook?: WahaWebhookTelemetry | null;
  config: {
    baseUrl: string;
    apiKey?: string;
    session: string;
    mode?: 'INTERNAL' | 'EXTERNAL';
    internalLocked?: boolean;
    hasApiKey?: boolean;
    customWebhookUrl?: string;
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

export interface PermissionCatalogItem {
  id: string;
  group: string;
  label: string;
  description: string;
  kind: 'menu' | 'action';
}

export interface CrmRoleItem {
  id: string;
  name: string;
  description?: string | null;
  permissions: string[];
  isSystem?: boolean;
  agentCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthStatus {
  initialized: boolean;
  authenticated: boolean;
  user: {
    id?: string;
    name: string;
    email: string;
    role?: 'ADMIN' | 'AGENT';
    roleId?: string | null;
    roleName?: string | null;
    permissions?: string[];
  } | null;
}

export interface AgentItem {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'AGENT';
  roleId?: string | null;
  roleName?: string | null;
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
  csatSurveyConfig?: CsatSurveyConfig;
}

export interface LicenseInfo {
  status: 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'SUSPENDED' | 'GRACE_PERIOD' | 'UNLICENSED';
  plan: string;
  period: 'monthly' | 'quarterly' | 'annual' | 'trial';
  startedAt?: string;
  priceAmount?: number;
  expiresAt: string;
  daysLeft: number;
  isExpired: boolean;
  managedByReneo: boolean;
  reneoBillingUrl: string;
  licenseKey?: string;
  publicUrls?: string[];
  features: {
    unlimitedBroadcast: boolean;
    maxBroadcastPerMonth?: number;
    birthdayAutomation: boolean;
    liveChatCrm: boolean;
    multiSession: boolean;
    maxSessions: number;
    maxContacts: number;
    multiAgent?: boolean;
    maxAgents?: number;
    apiAccess?: boolean;
    supportPriority?: string;
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

export type ScheduledPostChannel =
  | 'INSTAGRAM'
  | 'FACEBOOK'
  | 'THREADS'
  | 'TELEGRAM'
  | 'WHATSAPP'
  | 'WHATSAPP_STATUS';

export type ScheduledPostType =
  | 'FEED'
  | 'WA_POST'
  | 'STATUS_TEXT'
  | 'STATUS_IMAGE'
  | 'STATUS_VIDEO'
  | 'STATUS_VOICE';

export interface PostTargetContact {
  contactId?: string | null;
  phone: string;
  name?: string | null;
}

export interface WhatsAppStatusStyle {
  backgroundColor?: string;
  font?: number;
}

export interface WhatsAppStatusViewerItem {
  id: string;
  postId: string;
  viewerJid: string;
  viewerPhone?: string | null;
  contactId?: string | null;
  viewerName?: string | null;
  ackStatus: number;
  viewedAt: string;
  updatedAt: string;
}

export interface ScheduledPostItem {
  id: string;
  channel: ScheduledPostChannel;
  channelAccountId?: string | null;
  accountName?: string | null;
  accountExternalId?: string | null;
  wahaSession?: string | null;
  postType?: ScheduledPostType;
  caption: string;
  mediaUrl?: string | null;
  targetChatId?: string | null;
  targetContacts?: PostTargetContact[];
  statusStyle?: WhatsAppStatusStyle | null;
  viewerCount?: number;
  status: 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'CANCELLED';
  scheduledAt: string;
  publishedAt?: string | null;
  externalPostId?: string | null;
  errorMessage?: string | null;
  createdAt: string;
}

export interface ScheduledPostViewersResponse {
  post: ScheduledPostItem;
  targets: PostTargetContact[];
  viewers: WhatsAppStatusViewerItem[];
  totalViewed: number;
  totalDelivered: number;
  syncError?: string | null;
}

export interface MediaLibraryItem {
  filename: string;
  url: string;
  relativeUrl: string;
  mimeType: string;
  mediaKind: 'image' | 'video' | 'audio' | 'document';
  sizeBytes: number;
  createdAt: string;
  channel?: string;
  sessionName?: string;
  senderName?: string;
  senderPhone?: string;
  source?: 'INBOUND' | 'OUTBOUND' | 'UPLOAD' | 'BROADCAST';
  label?: string;
  originalFileName?: string;
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

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  totalAll?: number;
}



