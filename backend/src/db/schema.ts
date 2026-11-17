import { pgTable, text, timestamp, integer, boolean, doublePrecision } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const contacts = pgTable('contacts', {
  id: text('id').primaryKey(),
  namaLengkap: text('nama_lengkap').notNull(),
  namaPanggilan: text('nama_panggilan'),
  tanggalLahir: timestamp('tanggal_lahir'),
  nomorWhatsapp: text('nomor_whatsapp').unique(),
  alamat: text('alamat'),
  kategori: text('kategori'),
  tags: text('tags'), // JSON string or comma-separated
  notes: text('notes'),
  excludeFromMetrics: boolean('exclude_from_metrics').default(false).notNull(),
  excludeReason: text('exclude_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  messageTemplate: text('message_template').notNull(),
  type: text('type').default('IMMEDIATE').notNull(), // IMMEDIATE, SCHEDULED, BIRTHDAY
  channel: text('channel').default('WHATSAPP').notNull(), // WHATSAPP, INSTAGRAM, FACEBOOK, THREADS, TELEGRAM
  channelAccountId: text('channel_account_id'),
  status: text('status').default('DRAFT').notNull(), // DRAFT, SCHEDULED, PROCESSING, COMPLETED, FAILED, CANCELLED
  scheduledAt: timestamp('scheduled_at'),
  delaySeconds: integer('delay_seconds').default(5).notNull(),
  intervalSeconds: integer('interval_seconds').default(30).notNull(),
  batchSize: integer('batch_size').default(10).notNull(),
  filterTags: text('filter_tags'),
  totalCount: integer('total_count').default(0).notNull(),
  sentCount: integer('sent_count').default(0).notNull(),
  deliveredCount: integer('delivered_count').default(0).notNull(),
  readCount: integer('read_count').default(0).notNull(),
  failedCount: integer('failed_count').default(0).notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const campaignRecipients = pgTable('campaign_recipients', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id')
    .references(() => campaigns.id, { onDelete: 'cascade' })
    .notNull(),
  contactId: text('contact_id')
    .references(() => contacts.id, { onDelete: 'cascade' })
    .notNull(),
  phone: text('phone').notNull(),
  personalizedMessage: text('personalized_message').notNull(),
  wahaMessageId: text('waha_message_id').unique(),
  status: text('status').default('PENDING').notNull(), // PENDING, SENT, DELIVERED, READ, FAILED
  ackStatus: integer('ack_status').default(0).notNull(), // 0=PENDING, 1=SENT, 2=DELIVERED, 3=READ, -1=FAILED
  sentAt: timestamp('sent_at'),
  deliveredAt: timestamp('delivered_at'),
  readAt: timestamp('read_at'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const conversations = pgTable('conversations', {
  id: text('id').primaryKey(),
  contactId: text('contact_id')
    .references(() => contacts.id, { onDelete: 'cascade' })
    .notNull(),
  channel: text('channel').default('WHATSAPP').notNull(), // WHATSAPP | INSTAGRAM | FACEBOOK | THREADS | TELEGRAM
  channelAccountId: text('channel_account_id'),
  externalThreadId: text('external_thread_id'),
  contextTitle: text('context_title'),
  pushName: text('push_name'),
  channelDisplayName: text('channel_display_name'),
  wahaSession: text('waha_session'),
  isGroup: boolean('is_group').default(false).notNull(),
  excludeFromMetrics: boolean('exclude_from_metrics').default(false).notNull(),
  excludeReason: text('exclude_reason'),
  assignedAgentId: text('assigned_agent_id'),
  assignedAgentName: text('assigned_agent_name'),
  status: text('status').default('OPEN').notNull(), // OPEN, PENDING, RESOLVED
  labels: text('labels'), // comma-separated labels
  lastMessage: text('last_message'),
  lastMessageAt: timestamp('last_message_at'),
  unreadCount: integer('unread_count').default(0).notNull(),
  firstInboundAt: timestamp('first_inbound_at'),
  lastInboundAt: timestamp('last_inbound_at'),
  firstResponseAt: timestamp('first_response_at'),
  sessionStartedAt: timestamp('session_started_at'),
  resolvedAt: timestamp('resolved_at'),
  csatToken: text('csat_token').unique(),
  csatRating: integer('csat_rating'),
  csatOverallScore: doublePrecision('csat_overall_score'),
  csatFeedback: text('csat_feedback'),
  csatSubmittedAt: timestamp('csat_submitted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const chatMessages = pgTable('chat_messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .references(() => conversations.id, { onDelete: 'cascade' })
    .notNull(),
  contactId: text('contact_id')
    .references(() => contacts.id, { onDelete: 'cascade' })
    .notNull(),
  direction: text('direction').notNull(), // INBOUND or OUTBOUND
  messageType: text('message_type').default('TEXT').notNull(), // TEXT, MEDIA, NOTE, CSAT, LINK, BUTTONS, POLL
  channel: text('channel').default('WHATSAPP').notNull(),
  externalMessageId: text('external_message_id'),
  wahaSession: text('waha_session'),
  senderJid: text('sender_jid'),
  senderPhone: text('sender_phone'),
  senderName: text('sender_name'),
  body: text('body').notNull(),
  mediaUrl: text('media_url'),
  mediaType: text('media_type'), // image, document, audio, video
  mediaName: text('media_name'),
  replyToMessageId: text('reply_to_message_id'),
  replyToBody: text('reply_to_body'),
  replyToSender: text('reply_to_sender'),
  metadataJson: text('metadata_json'),
  wahaMessageId: text('waha_message_id').unique(),
  status: text('status').default('PENDING').notNull(),
  ackStatus: integer('ack_status').default(0).notNull(),
  errorMessage: text('error_message'),
  sentAt: timestamp('sent_at'),
  deliveredAt: timestamp('delivered_at'),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const birthdaySettings = pgTable('birthday_settings', {
  id: text('id').primaryKey().default('default'),
  isEnabled: boolean('is_enabled').default(true).notNull(),
  sendTime: text('send_time').default('08:00').notNull(),
  messageTemplate: text('message_template')
    .default(
      'Halo {nama_panggilan}! Selamat ulang tahun 🎉🎂 Semoga panjang umur, sehat selalu, berkah, dan sukses selalu!'
    )
    .notNull(),
  delaySeconds: integer('delay_seconds').default(5).notNull(),
  channel: text('channel').default('WHATSAPP').notNull(),
  channelAccountId: text('channel_account_id'),
  wahaSession: text('waha_session'),
  lastRunDate: text('last_run_date'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const crmRoles = pgTable('crm_roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  permissions: text('permissions').notNull(), // JSON array of PermissionKey
  isSystem: boolean('is_system').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const crmAgents = pgTable('crm_agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').default('AGENT').notNull(), // ADMIN | AGENT
  roleId: text('role_id'),
  permissions: text('permissions').default('["dashboard","conversations","contacts"]').notNull(), // JSON array of tab/action keys
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const cannedResponses = pgTable('canned_responses', {
  id: text('id').primaryKey(),
  shortCode: text('short_code').notNull().unique(),
  title: text('title').notNull(),
  category: text('category').default('Umum').notNull(),
  content: text('content').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const csatResponses = pgTable('csat_responses', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .references(() => conversations.id, { onDelete: 'cascade' })
    .notNull(),
  contactId: text('contact_id')
    .references(() => contacts.id, { onDelete: 'cascade' })
    .notNull(),
  wahaSession: text('waha_session'),
  assignedAgentId: text('assigned_agent_id'),
  assignedAgentName: text('assigned_agent_name'),
  token: text('token').notNull().unique(),
  triggerType: text('trigger_type').default('MANUAL').notNull(), // MANUAL | AUTO_RESOLVE
  profileId: text('profile_id'),
  profileName: text('profile_name'),
  snapshotJson: text('snapshot_json'),
  criteriaScoresJson: text('criteria_scores_json'),
  rating: integer('rating'),
  overallScore: doublePrecision('overall_score'),
  feedback: text('feedback'),
  conversationStartedAt: timestamp('conversation_started_at'),
  conversationResolvedAt: timestamp('conversation_resolved_at'),
  sentAt: timestamp('sent_at').defaultNow().notNull(),
  submittedAt: timestamp('submitted_at'),
});

export const autoReplyRules = pgTable('auto_reply_rules', {
  id: text('id').primaryKey(),
  keyword: text('keyword').notNull(),
  matchType: text('match_type').default('CONTAINS').notNull(), // CONTAINS | EXACT | STARTS_WITH
  replyText: text('reply_text').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  priority: integer('priority').default(10).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  sku: text('sku').notNull().unique(),
  name: text('name').notNull(),
  category: text('category'),
  price: integer('price').default(0).notNull(),
  unit: text('unit').default('pcs').notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const channelAccounts = pgTable('channel_accounts', {
  id: text('id').primaryKey(),
  channel: text('channel').notNull(), // INSTAGRAM | FACEBOOK | THREADS | TELEGRAM | WHATSAPP
  name: text('name').notNull(),
  accountId: text('account_id').notNull(), // Page ID, IG User ID, Threads User ID, Bot Username
  accessToken: text('access_token'),
  verifyToken: text('verify_token'),
  webhookSecret: text('webhook_secret'),
  isActive: boolean('is_active').default(true).notNull(),
  metadata: text('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const contactIdentities = pgTable('contact_identities', {
  id: text('id').primaryKey(),
  contactId: text('contact_id')
    .references(() => contacts.id, { onDelete: 'cascade' })
    .notNull(),
  channel: text('channel').notNull(), // INSTAGRAM | FACEBOOK | THREADS | TELEGRAM | WHATSAPP
  externalId: text('external_id').notNull(),
  handle: text('handle'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const channelConnectLinks = pgTable('channel_connect_links', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(),
  channel: text('channel').notNull(), // INSTAGRAM | FACEBOOK | THREADS | TELEGRAM
  label: text('label'),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdChannelAccountId: text('created_channel_account_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: text('id').primaryKey(),
  event: text('event').notNull(),
  targetUrl: text('target_url').notNull(),
  status: text('status').notNull(), // SUCCESS | FAILED
  httpStatus: integer('http_status'),
  errorMessage: text('error_message'),
  payloadSummary: text('payload_summary'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const contactsRelations = relations(contacts, ({ many, one }) => ({
  recipients: many(campaignRecipients),
  conversation: one(conversations, {
    fields: [contacts.id],
    references: [conversations.contactId],
  }),
  messages: many(chatMessages),
}));

export const campaignsRelations = relations(campaigns, ({ many }) => ({
  recipients: many(campaignRecipients),
}));

export const campaignRecipientsRelations = relations(campaignRecipients, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [campaignRecipients.campaignId],
    references: [campaigns.id],
  }),
  contact: one(contacts, {
    fields: [campaignRecipients.contactId],
    references: [contacts.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  contact: one(contacts, {
    fields: [conversations.contactId],
    references: [contacts.id],
  }),
  messages: many(chatMessages),
}));

export const scheduledPosts = pgTable('scheduled_posts', {
  id: text('id').primaryKey(),
  channel: text('channel').notNull(), // INSTAGRAM | FACEBOOK | THREADS | TELEGRAM | WHATSAPP | WHATSAPP_STATUS
  channelAccountId: text('channel_account_id')
    .references(() => channelAccounts.id, { onDelete: 'cascade' }),
  wahaSession: text('waha_session'),
  postType: text('post_type').default('FEED').notNull(), // FEED | WA_POST | STATUS_TEXT | STATUS_IMAGE | STATUS_VIDEO | STATUS_VOICE
  caption: text('caption').notNull(),
  mediaUrl: text('media_url'),
  targetChatId: text('target_chat_id'),
  targetContactsJson: text('target_contacts_json'),
  statusStyleJson: text('status_style_json'),
  viewerCount: integer('viewer_count').default(0).notNull(),
  status: text('status').default('SCHEDULED').notNull(), // SCHEDULED | PUBLISHING | PUBLISHED | FAILED | CANCELLED
  scheduledAt: timestamp('scheduled_at').notNull(),
  publishedAt: timestamp('published_at'),
  externalPostId: text('external_post_id'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const whatsappStatusViews = pgTable('whatsapp_status_views', {
  id: text('id').primaryKey(),
  postId: text('post_id')
    .references(() => scheduledPosts.id, { onDelete: 'cascade' })
    .notNull(),
  viewerJid: text('viewer_jid').notNull(),
  viewerPhone: text('viewer_phone'),
  contactId: text('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  viewerName: text('viewer_name'),
  ackStatus: integer('ack_status').default(3).notNull(), // 2=DELIVERED, 3=READ/VIEWED, 4=PLAYED
  viewedAt: timestamp('viewed_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const contentIdeas = pgTable('content_ideas', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  notes: text('notes'),
  channel: text('channel').default('INSTAGRAM').notNull(),
  stage: text('stage').default('IDE').notNull(), // IDE | DIKERJAKAN | SIAP | custom
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const socialComments = pgTable('social_comments', {
  id: text('id').primaryKey(),
  channel: text('channel').notNull(), // INSTAGRAM | FACEBOOK | THREADS
  channelAccountId: text('channel_account_id')
    .references(() => channelAccounts.id, { onDelete: 'cascade' })
    .notNull(),
  postId: text('post_id'),
  postCaption: text('post_caption'),
  externalCommentId: text('external_comment_id'),
  authorName: text('author_name').notNull(),
  authorHandle: text('author_handle'),
  content: text('content').notNull(),
  status: text('status').default('PENDING').notNull(), // PENDING | DONE
  replyText: text('reply_text'),
  repliedAt: timestamp('replied_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const commentAutomations = pgTable('comment_automations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  channel: text('channel').default('ALL').notNull(), // ALL | INSTAGRAM | FACEBOOK | THREADS
  keyword: text('keyword').notNull(),
  matchType: text('match_type').default('CONTAINS').notNull(), // CONTAINS | EXACT
  replyComment: text('reply_comment'),
  sendDm: boolean('send_dm').default(false).notNull(),
  dmText: text('dm_text'),
  isActive: boolean('is_active').default(true).notNull(),
  triggerCount: integer('trigger_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const aiKnowledgeBooks = pgTable('ai_knowledge_books', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category').default('GENERAL').notNull(), // GENERAL | FAQ | CATALOG | POLICY | SOP | WEB
  sourceType: text('source_type').default('MANUAL').notNull(), // MANUAL | PRESET | URL | CATALOG_SYNC | MARKDOWN
  sourceUrl: text('source_url'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const aiKnowledgeItems = pgTable('ai_knowledge_items', {
  id: text('id').primaryKey(),
  bookId: text('book_id').references(() => aiKnowledgeBooks.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  category: text('category').default('FAQ').notNull(), // FAQ | CATALOG | POLICY | WEB
  content: text('content').notNull(),
  sourceUrl: text('source_url'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const aiSkills = pgTable('ai_skills', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category').default('CUSTOM').notNull(), // CRM | SALES | SUPPORT | OPERATIONS | CUSTOM
  triggerHint: text('trigger_hint'),
  instructions: text('instructions').notNull(),
  linkedTools: text('linked_tools').default('[]').notNull(),
  sourceType: text('source_type').default('MANUAL').notNull(), // MANUAL | PRESET | URL | MARKDOWN
  sourceUrl: text('source_url'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const aiMcpServers = pgTable('ai_mcp_servers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  transport: text('transport').default('HTTP').notNull(),
  endpointUrl: text('endpoint_url').notNull(),
  authType: text('auth_type').default('NONE').notNull(), // NONE | BEARER | HEADER
  authHeaderName: text('auth_header_name').default('X-API-Key').notNull(),
  authToken: text('auth_token'),
  cachedTools: text('cached_tools').default('[]').notNull(),
  disabledTools: text('disabled_tools').default('[]').notNull(),
  lastSyncedAt: timestamp('last_synced_at'),
  lastError: text('last_error'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const crmLabels = pgTable('crm_labels', {
  id: text('id').primaryKey(),
  scope: text('scope').default('CONVERSATION_LABEL').notNull(), // CONVERSATION_LABEL | CONTACT_CATEGORY
  name: text('name').notNull(),
  color: text('color').default('slate').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').default(10).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const messageTemplates = pgTable('message_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').default('Umum').notNull(),
  channel: text('channel').default('ALL').notNull(),
  content: text('content').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [chatMessages.conversationId],
    references: [conversations.id],
  }),
  contact: one(contacts, {
    fields: [chatMessages.contactId],
    references: [contacts.id],
  }),
}));

