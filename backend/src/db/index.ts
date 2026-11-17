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

  // Always ensure companies table and default company exist first
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        owner_name TEXT,
        owner_email TEXT,
        owner_phone TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        license_key TEXT,
        license_status TEXT NOT NULL DEFAULT 'UNLICENSED',
        license_plan TEXT NOT NULL DEFAULT 'Belum Diaktivasi',
        license_plan_slug TEXT,
        license_period TEXT NOT NULL DEFAULT 'monthly',
        license_price_amount INTEGER NOT NULL DEFAULT 0,
        license_started_at TIMESTAMP,
        license_expires_at TIMESTAMP,
        license_features_json TEXT,
        trial_used BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      INSERT INTO companies (id, name, slug, status, is_default, created_at, updated_at)
      VALUES ('company_default', 'Perusahaan Utama', 'default', 'ACTIVE', TRUE, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `;
  } catch (err: any) {
    console.warn('[DB Init] Notice creating default company:', err.message);
  }

  // Run official Drizzle migrations if migration folder is found (non-blocking fallback)
  try {
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    const fs = await import('fs');
    const path = await import('path');
    const candidates = [
      path.resolve(__dirname, '../../drizzle'),
      path.resolve(__dirname, '../drizzle'),
      path.resolve(__dirname, './drizzle'),
      path.resolve(process.cwd(), 'drizzle'),
      path.resolve(process.cwd(), 'backend/drizzle'),
    ];
    const found = candidates.find((p) => fs.existsSync(p));
    if (found) {
      console.log(`[Drizzle ORM] Applying migrations from ${found}...`);
      await migrate(db, { migrationsFolder: found });
      console.log('[Drizzle ORM] Migrations applied successfully.');
    }
  } catch (migErr: any) {
    console.warn('[Drizzle ORM] Migrator note (falling back to idempotent init):', migErr.message);
  }

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        owner_name TEXT,
        owner_email TEXT,
        owner_phone TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        license_key TEXT,
        license_status TEXT NOT NULL DEFAULT 'UNLICENSED',
        license_plan TEXT NOT NULL DEFAULT 'Belum Diaktivasi',
        license_plan_slug TEXT,
        license_period TEXT NOT NULL DEFAULT 'monthly',
        license_price_amount INTEGER NOT NULL DEFAULT 0,
        license_started_at TIMESTAMP,
        license_expires_at TIMESTAMP,
        license_features_json TEXT,
        trial_used BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      INSERT INTO companies (id, name, slug, status, is_default, created_at, updated_at)
      VALUES ('company_default', 'Perusahaan Utama', 'default', 'ACTIVE', TRUE, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS company_settings (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_company_settings_company_key ON company_settings (company_id, key);`;

    await sql`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL DEFAULT 'company_default',
        nama_lengkap TEXT NOT NULL,
        nama_panggilan TEXT,
        tanggal_lahir TIMESTAMP,
        nomor_whatsapp TEXT,
        alamat TEXT,
        kategori TEXT,
        tags TEXT,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS kategori TEXT;`;
    await sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS exclude_from_metrics BOOLEAN NOT NULL DEFAULT FALSE;`;
    await sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS exclude_reason TEXT;`;
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

    await sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'WHATSAPP';`;
    await sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS channel_account_id TEXT;`;

    await sql`
      CREATE TABLE IF NOT EXISTS campaign_recipients (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        phone TEXT NOT NULL,
        personalized_message TEXT NOT NULL,
        waha_message_id TEXT,
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
        contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
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
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMP;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMP;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS csat_token TEXT;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS csat_rating INTEGER;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS csat_overall_score DOUBLE PRECISION;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS csat_feedback TEXT;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS csat_submitted_at TIMESTAMP;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'WHATSAPP';`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel_account_id TEXT;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS external_thread_id TEXT;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS context_title TEXT;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS push_name TEXT;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel_display_name TEXT;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT FALSE;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS exclude_from_metrics BOOLEAN NOT NULL DEFAULT FALSE;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS exclude_reason TEXT;`;
    await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMP;`;
    await sql`ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_contact_id_key;`;
    await sql`ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_contact_id_unique;`;

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
        waha_message_id TEXT,
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
    await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS error_message TEXT;`;
    await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_message_id TEXT;`;
    await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_body TEXT;`;
    await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_sender TEXT;`;
    await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS metadata_json TEXT;`;
    await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sender_jid TEXT;`;
    await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sender_phone TEXT;`;
    await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sender_name TEXT;`;

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
      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id TEXT PRIMARY KEY,
        event TEXT NOT NULL,
        target_url TEXT NOT NULL,
        status TEXT NOT NULL,
        http_status INTEGER,
        error_message TEXT,
        payload_summary TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS birthday_settings (
        id TEXT PRIMARY KEY DEFAULT 'default',
        company_id TEXT NOT NULL DEFAULT 'company_default',
        is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        send_time TEXT NOT NULL DEFAULT '08:00',
        message_template TEXT NOT NULL DEFAULT 'Halo {nama_panggilan}! Selamat ulang tahun 🎉🎂 Semoga panjang umur, sehat selalu, berkah, dan sukses selalu!',
        delay_seconds INTEGER NOT NULL DEFAULT 5,
        channel TEXT NOT NULL DEFAULT 'WHATSAPP',
        channel_account_id TEXT,
        waha_session TEXT,
        last_run_date TEXT,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE birthday_settings ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'WHATSAPP';`;
    await sql`ALTER TABLE birthday_settings ADD COLUMN IF NOT EXISTS channel_account_id TEXT;`;
    await sql`ALTER TABLE birthday_settings ADD COLUMN IF NOT EXISTS waha_session TEXT;`;

    await sql`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS crm_roles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        permissions TEXT NOT NULL DEFAULT '[]',
        is_system BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
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
        role_id TEXT,
        permissions TEXT NOT NULL DEFAULT '["dashboard","conversations","contacts"]',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE crm_agents ADD COLUMN IF NOT EXISTS role_id TEXT;`;

    await sql`
      CREATE TABLE IF NOT EXISTS canned_responses (
        id TEXT PRIMARY KEY,
        short_code TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Umum',
        content TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE canned_responses ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Umum';`;
    await sql`ALTER TABLE canned_responses ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;`;

    await sql`
      CREATE TABLE IF NOT EXISTS crm_labels (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL DEFAULT 'CONVERSATION_LABEL',
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT 'slate',
        description TEXT,
        sort_order INTEGER NOT NULL DEFAULT 10,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS message_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Umum',
        channel TEXT NOT NULL DEFAULT 'ALL',
        content TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
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
        profile_id TEXT,
        profile_name TEXT,
        snapshot_json TEXT,
        criteria_scores_json TEXT,
        rating INTEGER,
        overall_score DOUBLE PRECISION,
        feedback TEXT,
        sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
        submitted_at TIMESTAMP
      );
    `;
    await sql`ALTER TABLE csat_responses ADD COLUMN IF NOT EXISTS profile_id TEXT;`;
    await sql`ALTER TABLE csat_responses ADD COLUMN IF NOT EXISTS profile_name TEXT;`;
    await sql`ALTER TABLE csat_responses ADD COLUMN IF NOT EXISTS snapshot_json TEXT;`;
    await sql`ALTER TABLE csat_responses ADD COLUMN IF NOT EXISTS criteria_scores_json TEXT;`;
    await sql`ALTER TABLE csat_responses ADD COLUMN IF NOT EXISTS overall_score DOUBLE PRECISION;`;
    await sql`ALTER TABLE csat_responses ADD COLUMN IF NOT EXISTS conversation_started_at TIMESTAMP;`;
    await sql`ALTER TABLE csat_responses ADD COLUMN IF NOT EXISTS conversation_resolved_at TIMESTAMP;`;

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

    await sql`
      CREATE TABLE IF NOT EXISTS scheduled_posts (
        id TEXT PRIMARY KEY,
        channel TEXT NOT NULL,
        channel_account_id TEXT REFERENCES channel_accounts(id) ON DELETE CASCADE,
        waha_session TEXT,
        post_type TEXT NOT NULL DEFAULT 'FEED',
        caption TEXT NOT NULL,
        media_url TEXT,
        target_chat_id TEXT,
        target_contacts_json TEXT,
        status_style_json TEXT,
        viewer_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'SCHEDULED',
        scheduled_at TIMESTAMP NOT NULL,
        published_at TIMESTAMP,
        external_post_id TEXT,
        error_message TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE scheduled_posts ALTER COLUMN channel_account_id DROP NOT NULL;`;
    await sql`ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS waha_session TEXT;`;
    await sql`ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL DEFAULT 'FEED';`;
    await sql`ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS target_contacts_json TEXT;`;
    await sql`ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS status_style_json TEXT;`;
    await sql`ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS viewer_count INTEGER NOT NULL DEFAULT 0;`;

    await sql`
      CREATE TABLE IF NOT EXISTS whatsapp_status_views (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL REFERENCES scheduled_posts(id) ON DELETE CASCADE,
        viewer_jid TEXT NOT NULL,
        viewer_phone TEXT,
        contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
        viewer_name TEXT,
        ack_status INTEGER NOT NULL DEFAULT 3,
        viewed_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_status_view_post_viewer ON whatsapp_status_views (post_id, viewer_jid);`;

    await sql`
      CREATE TABLE IF NOT EXISTS content_ideas (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        notes TEXT,
        channel TEXT NOT NULL DEFAULT 'INSTAGRAM',
        stage TEXT NOT NULL DEFAULT 'IDE',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS social_comments (
        id TEXT PRIMARY KEY,
        channel TEXT NOT NULL,
        channel_account_id TEXT NOT NULL REFERENCES channel_accounts(id) ON DELETE CASCADE,
        post_id TEXT,
        post_caption TEXT,
        external_comment_id TEXT,
        author_name TEXT NOT NULL,
        author_handle TEXT,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        reply_text TEXT,
        replied_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS comment_automations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'ALL',
        keyword TEXT NOT NULL,
        match_type TEXT NOT NULL DEFAULT 'CONTAINS',
        reply_comment TEXT,
        send_dm BOOLEAN NOT NULL DEFAULT FALSE,
        dm_text TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        trigger_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS ai_knowledge_books (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL DEFAULT 'GENERAL',
        source_type TEXT NOT NULL DEFAULT 'MANUAL',
        source_url TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS ai_knowledge_items (
        id TEXT PRIMARY KEY,
        book_id TEXT REFERENCES ai_knowledge_books(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'FAQ',
        content TEXT NOT NULL,
        source_url TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      ALTER TABLE ai_knowledge_items
      ADD COLUMN IF NOT EXISTS book_id TEXT REFERENCES ai_knowledge_books(id) ON DELETE CASCADE;
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS ai_skills (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL DEFAULT 'CUSTOM',
        trigger_hint TEXT,
        instructions TEXT NOT NULL,
        linked_tools TEXT NOT NULL DEFAULT '[]',
        source_type TEXT NOT NULL DEFAULT 'MANUAL',
        source_url TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS ai_mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        transport TEXT NOT NULL DEFAULT 'HTTP',
        endpoint_url TEXT NOT NULL,
        auth_type TEXT NOT NULL DEFAULT 'NONE',
        auth_header_name TEXT NOT NULL DEFAULT 'X-API-Key',
        auth_token TEXT,
        cached_tools TEXT NOT NULL DEFAULT '[]',
        disabled_tools TEXT NOT NULL DEFAULT '[]',
        last_synced_at TIMESTAMP,
        last_error TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    // Add company_id across all tenant-scoped tables and migrate global unique constraints to per-company indexes
    const tenantTables = [
      'contacts',
      'campaigns',
      'campaign_recipients',
      'conversations',
      'chat_messages',
      'birthday_settings',
      'crm_roles',
      'crm_agents',
      'canned_responses',
      'crm_labels',
      'message_templates',
      'csat_responses',
      'auto_reply_rules',
      'products',
      'channel_accounts',
      'contact_identities',
      'channel_connect_links',
      'webhook_deliveries',
      'scheduled_posts',
      'whatsapp_status_views',
      'content_ideas',
      'social_comments',
      'comment_automations',
      'ai_knowledge_books',
      'ai_knowledge_items',
      'ai_skills',
      'ai_mcp_servers',
    ];
    for (const tbl of tenantTables) {
      try {
        await sql.unsafe(
          `ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS company_id TEXT NOT NULL DEFAULT 'company_default';`
        );
      } catch (err: any) {
        console.warn(`[Drizzle ORM] Warn adding company_id to ${tbl}:`, err.message);
      }
    }
    try {
      await sql`ALTER TABLE crm_agents ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE;`;
    } catch (err: any) {
      console.warn('[Drizzle ORM] Warn adding is_platform_admin to crm_agents:', err.message);
    }

    // Ensure default birthday row exists after company_id column is guaranteed
    try {
      await sql`
        INSERT INTO birthday_settings (id, company_id, is_enabled, send_time, message_template, delay_seconds, updated_at)
        VALUES ('default', 'company_default', TRUE, '08:00', 'Halo {nama_panggilan}! Selamat ulang tahun 🎉🎂 Semoga panjang umur, sehat selalu, berkah, dan sukses selalu!', 5, NOW())
        ON CONFLICT (id) DO NOTHING;
      `;
    } catch (err: any) {
      console.warn('[Drizzle ORM] Warn inserting default birthday row:', err.message);
    }

    // Drop legacy global single-column unique constraints in favor of per-company compound uniqueness
    try {
      await sql`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_nomor_whatsapp_key;`;
      await sql`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_nomor_whatsapp_unique;`;
      await sql`ALTER TABLE campaign_recipients DROP CONSTRAINT IF EXISTS campaign_recipients_waha_message_id_key;`;
      await sql`ALTER TABLE campaign_recipients DROP CONSTRAINT IF EXISTS campaign_recipients_waha_message_id_unique;`;
      await sql`ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_waha_message_id_key;`;
      await sql`ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_waha_message_id_unique;`;
      await sql`ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_contact_id_key;`;
    await sql`ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_contact_id_unique;`;
      await sql`ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_contact_id_unique;`;
      await sql`ALTER TABLE crm_roles DROP CONSTRAINT IF EXISTS crm_roles_name_key;`;
      await sql`ALTER TABLE crm_roles DROP CONSTRAINT IF EXISTS crm_roles_name_unique;`;
      await sql`ALTER TABLE canned_responses DROP CONSTRAINT IF EXISTS canned_responses_short_code_key;`;
      await sql`ALTER TABLE canned_responses DROP CONSTRAINT IF EXISTS canned_responses_short_code_unique;`;
      await sql`ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_key;`;
      await sql`ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_unique;`;
      await sql`ALTER TABLE contact_identities DROP CONSTRAINT IF EXISTS contact_identities_channel_external_id_key;`;
      await sql`ALTER TABLE contact_identities DROP CONSTRAINT IF EXISTS contact_identities_channel_external_id_unique;`;
      await sql`ALTER TABLE ai_skills DROP CONSTRAINT IF EXISTS ai_skills_slug_key;`;
      await sql`ALTER TABLE ai_skills DROP CONSTRAINT IF EXISTS ai_skills_slug_unique;`;
    } catch (err: any) {
      console.warn('[Drizzle ORM] Warn dropping legacy constraints:', err.message);
    }

    try {
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_company_phone ON contacts (company_id, nomor_whatsapp) WHERE nomor_whatsapp IS NOT NULL;`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_rec_company_waha_msg ON campaign_recipients (company_id, waha_message_id) WHERE waha_message_id IS NOT NULL;`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_msg_company_waha_msg ON chat_messages (company_id, waha_message_id) WHERE waha_message_id IS NOT NULL;`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_roles_company_name ON crm_roles (company_id, LOWER(name));`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_canned_company_code ON canned_responses (company_id, LOWER(short_code));`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_products_company_sku ON products (company_id, LOWER(sku));`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_id_company_ch_ext ON contact_identities (company_id, channel, external_id);`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_skills_company_slug ON ai_skills (company_id, slug);`;
    } catch (err: any) {
      console.warn('[Drizzle ORM] Warn creating compound indexes:', err.message);
    }

    // Migrate legacy single-tenant settings and license into company_default once
    const migratedRows = await sql`
      SELECT value FROM system_settings WHERE key = 'migration_multi_tenant_v1' LIMIT 1;
    `;
    if (!migratedRows[0]) {
      const legacyCompanyKeys = [
        'waha_mode',
        'waha_base_url',
        'waha_api_key',
        'waha_session',
        'waha_webhook_url',
        'waha_detected_public_url',
        'csat_template',
        'csat_auto_on_resolve',
        'sla_target_minutes',
        'csat_base_url',
        'csat_survey_config',
        'ai_agent_config',
        'birthday_multi_senders',
        'idea_columns',
        'crm_sticker_pack_v1',
        'business_hours_enabled',
        'business_hours_start',
        'business_hours_end',
        'business_days',
        'off_hours_reply_text',
        'auto_reply_enabled',
        'sla_alert_webhook_url',
        'auto_assign_mode',
        'auto_assign_cursor',
        'license_plan',
        'license_expires_at',
        'license_key',
        'license_features',
      ];
      const sysRows = await sql`
        SELECT key, value, updated_at FROM system_settings WHERE key = ANY(${legacyCompanyKeys});
      `;
      const sysMap = new Map<string, string>();
      for (const r of sysRows) {
        sysMap.set(r.key, r.value);
        const settingId = `company_default::${r.key}`;
        await sql`
          INSERT INTO company_settings (id, company_id, key, value, updated_at)
          VALUES (${settingId}, 'company_default', ${r.key}, ${r.value}, ${r.updated_at || new Date()})
          ON CONFLICT (company_id, key) DO NOTHING;
        `;
      }

      const adminName = (await sql`SELECT value FROM system_settings WHERE key = 'crm_admin_name' LIMIT 1;`)[0]?.value || null;
      const adminEmail = (await sql`SELECT value FROM system_settings WHERE key = 'crm_admin_email' LIMIT 1;`)[0]?.value || null;
      const licPlan = sysMap.get('license_plan');
      const licExp = sysMap.get('license_expires_at');
      const parsedExpDate = licExp && !isNaN(Date.parse(licExp)) ? new Date(licExp) : null;
      const licKey = sysMap.get('license_key');
      const licFeats = sysMap.get('license_features');
      const hasLegacyLic = Boolean(licKey && parsedExpDate);
      await sql`
        UPDATE companies
        SET name = COALESCE(${adminName}, name),
            owner_name = COALESCE(${adminName}, owner_name),
            owner_email = COALESCE(${adminEmail}, owner_email),
            license_key = COALESCE(${licKey || null}, license_key),
            license_plan = COALESCE(${licPlan || null}, license_plan),
            license_expires_at = COALESCE(${parsedExpDate}, license_expires_at),
            license_features_json = COALESCE(${licFeats || null}, license_features_json),
            license_status = CASE WHEN ${hasLegacyLic} THEN 'ACTIVE' ELSE license_status END,
            updated_at = NOW()
        WHERE id = 'company_default';
      `;

      // Promote primary default admin to Platform Admin if none exists yet
      const platCount = await sql`SELECT COUNT(*)::int AS cnt FROM crm_agents WHERE is_platform_admin = TRUE;`;
      if ((platCount[0]?.cnt || 0) === 0) {
        await sql`
          UPDATE crm_agents
          SET is_platform_admin = TRUE
          WHERE id = (
            SELECT id FROM crm_agents WHERE company_id = 'company_default' AND role = 'ADMIN' ORDER BY created_at ASC LIMIT 1
          );
        `;
      }

      await sql`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ('migration_multi_tenant_v1', 'true', NOW())
        ON CONFLICT (key) DO NOTHING;
      `;
    }

    // One-time idempotent seed for Master Labels & Contact Categories
    const seededRows = await sql`
      SELECT value FROM system_settings WHERE key = 'master_labels_seeded' LIMIT 1;
    `;
    if (!seededRows[0]) {
      const existingLabels = await sql`SELECT COUNT(*)::int AS cnt FROM crm_labels;`;
      if ((existingLabels[0]?.cnt || 0) === 0) {
        const defaultLabels = [
          { id: 'lbl-conv-vip', scope: 'CONVERSATION_LABEL', name: 'VIP', color: 'amber', sort: 1 },
          { id: 'lbl-conv-followup', scope: 'CONVERSATION_LABEL', name: 'Follow Up', color: 'indigo', sort: 2 },
          { id: 'lbl-conv-komplain', scope: 'CONVERSATION_LABEL', name: 'Komplain', color: 'rose', sort: 3 },
          { id: 'lbl-conv-lunas', scope: 'CONVERSATION_LABEL', name: 'Lunas', color: 'emerald', sort: 4 },
          { id: 'lbl-conv-prospek', scope: 'CONVERSATION_LABEL', name: 'Prospek', color: 'sky', sort: 5 },
          { id: 'cat-cnt-umum', scope: 'CONTACT_CATEGORY', name: 'Umum', color: 'slate', sort: 1 },
          { id: 'cat-cnt-vip', scope: 'CONTACT_CATEGORY', name: 'VIP', color: 'amber', sort: 2 },
          { id: 'cat-cnt-prospek', scope: 'CONTACT_CATEGORY', name: 'Prospek', color: 'sky', sort: 3 },
          { id: 'cat-cnt-tetap', scope: 'CONTACT_CATEGORY', name: 'Pelanggan Tetap', color: 'emerald', sort: 4 },
          { id: 'cat-cnt-korporat', scope: 'CONTACT_CATEGORY', name: 'Korporat', color: 'indigo', sort: 5 },
          { id: 'cat-cnt-partner', scope: 'CONTACT_CATEGORY', name: 'Partner', color: 'violet', sort: 6 },
        ];
        for (const item of defaultLabels) {
          await sql`
            INSERT INTO crm_labels (id, scope, name, color, sort_order, is_active, created_at, updated_at)
            VALUES (${item.id}, ${item.scope}, ${item.name}, ${item.color}, ${item.sort}, TRUE, NOW(), NOW())
            ON CONFLICT (id) DO NOTHING;
          `;
        }
      }
      await sql`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ('master_labels_seeded', 'true', NOW())
        ON CONFLICT (key) DO NOTHING;
      `;
    }

    console.log('[Drizzle ORM] PostgreSQL Database schema initialized successfully.');
  } catch (err: any) {
    console.error('[Drizzle ORM] Failed to initialize DB tables:', err.message);
  }
}

export default db;

