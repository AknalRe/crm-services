import { pgTable, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
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
  wahaSession: text('waha_session'),
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
  resolvedAt: timestamp('resolved_at'),
  csatToken: text('csat_token').unique(),
  csatRating: integer('csat_rating'),
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
  messageType: text('message_type').default('TEXT').notNull(), // TEXT, MEDIA, NOTE, CSAT
  channel: text('channel').default('WHATSAPP').notNull(),
  externalMessageId: text('external_message_id'),
  wahaSession: text('waha_session'),
  body: text('body').notNull(),
  mediaUrl: text('media_url'),
  mediaType: text('media_type'), // image, document, audio, video
  mediaName: text('media_name'),
  wahaMessageId: text('waha_message_id').unique(),
  status: text('status').default('PENDING').notNull(),
  ackStatus: integer('ack_status').default(0).notNull(),
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

export const crmAgents = pgTable('crm_agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').default('AGENT').notNull(), // ADMIN | AGENT
  permissions: text('permissions').default('["dashboard","conversations","contacts"]').notNull(), // JSON array of tab keys
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const cannedResponses = pgTable('canned_responses', {
  id: text('id').primaryKey(),
  shortCode: text('short_code').notNull().unique(),
  title: text('title').notNull(),
  content: text('content').notNull(),
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
  rating: integer('rating'),
  feedback: text('feedback'),
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
  channel: text('channel').notNull(), // INSTAGRAM | FACEBOOK | THREADS | TELEGRAM
  channelAccountId: text('channel_account_id')
    .references(() => channelAccounts.id, { onDelete: 'cascade' })
    .notNull(),
  caption: text('caption').notNull(),
  mediaUrl: text('media_url'),
  targetChatId: text('target_chat_id'),
  status: text('status').default('SCHEDULED').notNull(), // SCHEDULED | PUBLISHING | PUBLISHED | FAILED | CANCELLED
  scheduledAt: timestamp('scheduled_at').notNull(),
  publishedAt: timestamp('published_at'),
  externalPostId: text('external_post_id'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
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

export const aiKnowledgeItems = pgTable('ai_knowledge_items', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  category: text('category').default('FAQ').notNull(), // FAQ | CATALOG | POLICY | WEB
  content: text('content').notNull(),
  sourceUrl: text('source_url'),
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

