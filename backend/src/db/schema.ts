import { pgTable, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const contacts = pgTable('contacts', {
  id: text('id').primaryKey(),
  namaLengkap: text('nama_lengkap').notNull(),
  namaPanggilan: text('nama_panggilan'),
  tanggalLahir: timestamp('tanggal_lahir'),
  nomorWhatsapp: text('nomor_whatsapp').notNull().unique(),
  alamat: text('alamat'),
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
    .unique()
    .notNull(),
  lastMessage: text('last_message'),
  lastMessageAt: timestamp('last_message_at'),
  unreadCount: integer('unread_count').default(0).notNull(),
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
  body: text('body').notNull(),
  mediaUrl: text('media_url'),
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
  lastRunDate: text('last_run_date'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
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

