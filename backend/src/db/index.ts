import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { config } from '../config';

const connectionString = config.databaseUrl;

// Client for queries
export const queryClient = postgres(connectionString, { max: 10 });
export const db = drizzle(queryClient, { schema });

/**
 * Automatically create tables if they do not exist
 */
export async function initDb() {
  const sql = queryClient;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        nama_lengkap TEXT NOT NULL,
        nama_panggilan TEXT,
        tanggal_lahir TIMESTAMP,
        nomor_whatsapp TEXT NOT NULL UNIQUE,
        alamat TEXT,
        kategori TEXT,
        tags TEXT,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS kategori TEXT;`;
    await sql`ALTER TABLE contacts ALTER COLUMN nomor_whatsapp DROP NOT NULL;`;

    await sql`
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        message_template TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'IMMEDIATE',
        status TEXT NOT NULL DEFAULT 'DRAFT',
        scheduled_at TIMESTAMP,
        delay_seconds INTEGER NOT NULL DEFAULT 5,
        interval_seconds INTEGER NOT NULL DEFAULT 30,
        batch_size INTEGER NOT NULL DEFAULT 10,
        filter_tags TEXT,
        total_count INTEGER NOT NULL DEFAULT 0,
        sent_count INTEGER NOT NULL DEFAULT 0,
        delivered_count INTEGER NOT NULL DEFAULT 0,
        read_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS campaign_recipients (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        phone TEXT NOT NULL,
        personalized_message TEXT NOT NULL,
        waha_message_id TEXT UNIQUE,
        status TEXT NOT NULL DEFAULT 'PENDING',
        ack_status INTEGER NOT NULL DEFAULT 0,
        sent_at TIMESTAMP,
        delivered_at TIMESTAMP,
        read_at TIMESTAMP,
        error_message TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        contact_id TEXT NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
        waha_session TEXT,
        status TEXT NOT NULL DEFAULT 'OPEN',
        labels TEXT,
        last_message TEXT,
        last_message_at TIMESTAMP,
        unread_count INTEGER NOT NULL DEFAULT 0,
        first_inbound_at TIMESTAMP,
        first_response_at TIMESTAMP,
        resolved_at TIMESTAMP,
        csat_token TEXT UNIQUE,
        csat_rating INTEGER,
        csat_feedback TEXT,
        csat_submitted_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS waha_session TEXT;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_agent_id TEXT;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_agent_name TEXT;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'OPEN';`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS labels TEXT;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS first_inbound_at TIMESTAMP;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMP;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS csat_token TEXT;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS csat_rating INTEGER;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS csat_feedback TEXT;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS csat_submitted_at TIMESTAMP;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'WHATSAPP';`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel_account_id TEXT;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS external_thread_id TEXT;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS context_title TEXT;`;
    await sql`ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_contact_id_key;`;

    await sql`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        direction TEXT NOT NULL,
        message_type TEXT NOT NULL DEFAULT 'TEXT',
        waha_session TEXT,
        body TEXT NOT NULL,
        media_url TEXT,
        media_type TEXT,
        media_name TEXT,
        waha_message_id TEXT UNIQUE,
        status TEXT NOT NULL DEFAULT 'PENDING',
        ack_status INTEGER NOT NULL DEFAULT 0,
        sent_at TIMESTAMP,
        delivered_at TIMESTAMP,
        read_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'TEXT';`;
    await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS waha_session TEXT;`;
    await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS media_type TEXT;`;
    await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS media_name TEXT;`;
    await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'WHATSAPP';`;
    await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS external_message_id TEXT;`;

    await sql`
      CREATE TABLE IF NOT EXISTS channel_accounts (
        id TEXT PRIMARY KEY,
        channel TEXT NOT NULL,
        name TEXT NOT NULL,
        account_id TEXT NOT NULL,
        access_token TEXT,
        verify_token TEXT,
        webhook_secret TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        metadata TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS contact_identities (
        id TEXT PRIMARY KEY,
        contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        channel TEXT NOT NULL,
        external_id TEXT NOT NULL,
        handle TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (channel, external_id)
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS channel_connect_links (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        channel TEXT NOT NULL,
        label TEXT,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        created_channel_account_id TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS birthday_settings (
        id TEXT PRIMARY KEY DEFAULT 'default',
        is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        send_time TEXT NOT NULL DEFAULT '08:00',
        message_template TEXT NOT NULL DEFAULT 'Halo {nama_panggilan}! Selamat ulang tahun 🎉🎂 Semoga panjang umur, sehat selalu, berkah, dan sukses selalu!',
        delay_seconds INTEGER NOT NULL DEFAULT 5,
        waha_session TEXT,
        last_run_date TEXT,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE birthday_settings ADD COLUMN IF NOT EXISTS waha_session TEXT;`;

    await sql`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS crm_agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'AGENT',
        permissions TEXT NOT NULL DEFAULT '["dashboard","conversations","contacts"]',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS canned_responses (
        id TEXT PRIMARY KEY,
        short_code TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS csat_responses (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        waha_session TEXT,
        assigned_agent_id TEXT,
        assigned_agent_name TEXT,
        token TEXT NOT NULL UNIQUE,
        trigger_type TEXT NOT NULL DEFAULT 'MANUAL',
        rating INTEGER,
        feedback TEXT,
        sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
        submitted_at TIMESTAMP
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS auto_reply_rules (
        id TEXT PRIMARY KEY,
        keyword TEXT NOT NULL,
        match_type TEXT NOT NULL DEFAULT 'CONTAINS',
        reply_text TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        priority INTEGER NOT NULL DEFAULT 10,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        sku TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        category TEXT,
        price INTEGER NOT NULL DEFAULT 0,
        unit TEXT NOT NULL DEFAULT 'pcs',
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    // Ensure default birthday row exists
    await sql`
      INSERT INTO birthday_settings (id, is_enabled, send_time, message_template, delay_seconds, updated_at)
      VALUES ('default', TRUE, '08:00', 'Halo {nama_panggilan}! Selamat ulang tahun 🎉🎂 Semoga panjang umur, sehat selalu, berkah, dan sukses selalu!', 5, NOW())
      ON CONFLICT (id) DO NOTHING;
    `;

    console.log('[Drizzle ORM] PostgreSQL Database schema initialized successfully.');
  } catch (err: any) {
    console.error('[Drizzle ORM] Failed to initialize DB tables:', err.message);
  }
}

export default db;

