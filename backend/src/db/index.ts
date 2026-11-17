import { is, SQL } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { config } from '../config';

const connectionString = config.databaseUrl;

// Client for queries
export const queryClient = postgres(connectionString, { max: 10 });
export const db = drizzle(queryClient, { schema });

export function formatSqlDefault(col: {
  getSQLType: () => string;
  hasDefault: boolean;
  default: unknown;
  notNull: boolean;
  primary: boolean;
}): string {
  const sqlType = String(col.getSQLType() || 'text').toLowerCase();
  if (col.hasDefault) {
    if (typeof col.default === 'string') {
      return `DEFAULT '${col.default.replace(/'/g, "''")}'`;
    }
    if (typeof col.default === 'number' || typeof col.default === 'bigint') {
      return `DEFAULT ${col.default}`;
    }
    if (typeof col.default === 'boolean') {
      return `DEFAULT ${col.default ? 'TRUE' : 'FALSE'}`;
    }
    if (is(col.default as any, SQL)) {
      return 'DEFAULT NOW()';
    }
  }
  if (col.notNull && !col.primary) {
    if (sqlType === 'boolean') return 'DEFAULT FALSE';
    if (
      sqlType === 'integer' ||
      sqlType === 'double precision' ||
      sqlType === 'bigint' ||
      sqlType === 'numeric'
    ) {
      return 'DEFAULT 0';
    }
    if (sqlType.includes('timestamp')) return 'DEFAULT NOW()';
    return "DEFAULT ''";
  }
  return '';
}

export function buildSchemaSyncStatements(
  existingColumnsByTable: Map<string, Set<string>>
): Array<{ label: string; sqlText: string }> {
  const statements: Array<{ label: string; sqlText: string }> = [];
  const drizzleTables = Object.values(schema).filter((v: any) => is(v, PgTable)) as PgTable[];

  for (const table of drizzleTables) {
    const cfg = getTableConfig(table);
    const existingCols = existingColumnsByTable.get(cfg.name);
    if (!existingCols) {
      const colDefs = cfg.columns.map((c) => {
        const parts = [`"${c.name}"`, c.getSQLType()];
        if (c.primary) parts.push('PRIMARY KEY');
        if (c.hasDefault) {
          const def = formatSqlDefault(c);
          if (def) parts.push(def);
        }
        if (c.notNull && !c.primary) parts.push('NOT NULL');
        return parts.join(' ');
      });
      statements.push({
        label: `create table ${cfg.name}`,
        sqlText: `CREATE TABLE IF NOT EXISTS "${cfg.name}" (${colDefs.join(', ')});`,
      });
    } else {
      for (const c of cfg.columns) {
        if (!existingCols.has(c.name)) {
          const parts = [
            `ALTER TABLE "${cfg.name}" ADD COLUMN IF NOT EXISTS "${c.name}"`,
            c.getSQLType(),
          ];
          const def = formatSqlDefault(c);
          if (def) parts.push(def);
          if (c.notNull && !c.primary) parts.push('NOT NULL');
          statements.push({
            label: `add column ${cfg.name}.${c.name}`,
            sqlText: `${parts.join(' ')};`,
          });
        }
      }
    }
  }

  return statements;
}

async function waitForPostgresReady(
  sql: ReturnType<typeof postgres>,
  maxAttempts = 20,
  delayMs = 1500
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await sql`SELECT 1`;
      return;
    } catch (err: any) {
      if (attempt === maxAttempts) {
        throw err;
      }
      console.warn(
        `[DB Init] Waiting for PostgreSQL connection (${attempt}/${maxAttempts}): ${err.message}`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function reconcileSchemaFromDrizzle(
  sql: ReturnType<typeof postgres>,
  safeExec: (label: string, fn: () => Promise<any>) => Promise<void>
): Promise<void> {
  const colRows = await sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public';
  `;
  const existingColumnsByTable = new Map<string, Set<string>>();
  for (const r of colRows) {
    const tName = String(r.table_name);
    const cName = String(r.column_name);
    let set = existingColumnsByTable.get(tName);
    if (!set) {
      set = new Set<string>();
      existingColumnsByTable.set(tName, set);
    }
    set.add(cName);
  }

  const syncStmts = buildSchemaSyncStatements(existingColumnsByTable);
  for (const stmt of syncStmts) {
    if (stmt.label.startsWith('add column')) {
      console.log(`[DB Reconcile] ${stmt.label}`);
    }
    await safeExec(`reconcile ${stmt.label}`, () => sql.unsafe(stmt.sqlText));
  }

  // Ensure slug columns have valid unique values for any legacy rows
  await safeExec('backfill companies.slug', async () => {
    await sql`
      UPDATE companies
      SET slug = CASE
        WHEN id = 'company_default' THEN 'default'
        ELSE regexp_replace(lower(COALESCE(NULLIF(name, ''), id)), '[^a-z0-9]+', '-', 'g') || '-' || substr(md5(id), 1, 6)
      END
      WHERE slug IS NULL OR slug = '';
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS companies_slug_unique ON companies (slug);`;
  });

  await safeExec('backfill ai_skills.slug', async () => {
    await sql`
      UPDATE ai_skills
      SET slug = regexp_replace(lower(COALESCE(NULLIF(name, ''), id)), '[^a-z0-9]+', '-', 'g') || '-' || substr(md5(id), 1, 6)
      WHERE slug IS NULL OR slug = '';
    `;
  });
}

/**
 * Automatically create tables and migrate schema safely with 100% idempotent isolation
 */
export async function initDb() {
  const sql = queryClient;

  const safeExec = async (label: string, fn: () => Promise<any>) => {
    try {
      await fn();
    } catch (e: any) {
      console.warn(`[DB Init] Warning on ${label}:`, e.message);
    }
  };

  await waitForPostgresReady(sql);

  // 1. Reconcile ALL schema tables & columns against PostgreSQL BEFORE migrations or queries
  await safeExec('initial schema reconcile', () => reconcileSchemaFromDrizzle(sql, safeExec));

  // 2. Ensure default company row exists (companies table is guaranteed up to date)
  await safeExec('ensure default company', async () => {
    await sql`
      INSERT INTO companies (id, name, slug, status, is_default, created_at, updated_at)
      VALUES ('company_default', 'Perusahaan Utama', 'default', 'ACTIVE', TRUE, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `;
  });

  // 3. Run official Drizzle migrations if migration folder is found (non-blocking fallback)
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

  // 4. Drop legacy single-tenant unique constraints & ensure nullable updates
  await safeExec('drop legacy constraints', async () => {
    await sql`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_nomor_whatsapp_key;`;
    await sql`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_nomor_whatsapp_unique;`;
    await sql`ALTER TABLE contacts ALTER COLUMN nomor_whatsapp DROP NOT NULL;`;
    await sql`ALTER TABLE campaigns ALTER COLUMN scheduled_at DROP NOT NULL;`;
    await sql`ALTER TABLE scheduled_posts ALTER COLUMN channel_account_id DROP NOT NULL;`;
    await sql`ALTER TABLE campaign_recipients DROP CONSTRAINT IF EXISTS campaign_recipients_waha_message_id_key;`;
    await sql`ALTER TABLE campaign_recipients DROP CONSTRAINT IF EXISTS campaign_recipients_waha_message_id_unique;`;
    await sql`ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_contact_id_key;`;
    await sql`ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_contact_id_unique;`;
    await sql`ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_waha_message_id_key;`;
    await sql`ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_waha_message_id_unique;`;
    await sql`ALTER TABLE contact_identities DROP CONSTRAINT IF EXISTS contact_identities_channel_external_id_key;`;
    await sql`ALTER TABLE contact_identities DROP CONSTRAINT IF EXISTS contact_identities_channel_external_id_unique;`;
    await sql`ALTER TABLE crm_roles DROP CONSTRAINT IF EXISTS crm_roles_name_key;`;
    await sql`ALTER TABLE crm_roles DROP CONSTRAINT IF EXISTS crm_roles_name_unique;`;
    await sql`ALTER TABLE canned_responses DROP CONSTRAINT IF EXISTS canned_responses_short_code_key;`;
    await sql`ALTER TABLE canned_responses DROP CONSTRAINT IF EXISTS canned_responses_short_code_unique;`;
    await sql`ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_key;`;
    await sql`ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_unique;`;
    await sql`ALTER TABLE ai_skills DROP CONSTRAINT IF EXISTS ai_skills_slug_key;`;
    await sql`ALTER TABLE ai_skills DROP CONSTRAINT IF EXISTS ai_skills_slug_unique;`;
  });

  // 5. Re-verify schema sync after migrations in case any legacy migration altered anything
  await safeExec('post-migration schema reconcile', () => reconcileSchemaFromDrizzle(sql, safeExec));

  // 6. Seed default birthday settings row
  await safeExec('seed birthday_settings', async () => {
    await sql`
      INSERT INTO birthday_settings (id, company_id, is_enabled, send_time, message_template, delay_seconds, updated_at)
      VALUES ('default', 'company_default', TRUE, '08:00', 'Halo {nama_panggilan}! Selamat ulang tahun 🎉🎂 Semoga panjang umur, sehat selalu, berkah, dan sukses selalu!', 5, NOW())
      ON CONFLICT (id) DO NOTHING;
    `;
  });

  // 7. Create single-column and multi-tenant compound unique indexes defensively
  await safeExec('idx_company_settings_company_key', () => sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_company_settings_company_key ON company_settings (company_id, key);
  `);
  await safeExec('idx_wa_status_view_post_viewer', () => sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_status_view_post_viewer ON whatsapp_status_views (post_id, viewer_jid);
  `);
  await safeExec('crm_agents_email_unique', () => sql`
    CREATE UNIQUE INDEX IF NOT EXISTS crm_agents_email_unique ON crm_agents (email);
  `);
  await safeExec('csat_responses_token_unique', () => sql`
    CREATE UNIQUE INDEX IF NOT EXISTS csat_responses_token_unique ON csat_responses (token);
  `);
  await safeExec('channel_connect_links_token_unique', () => sql`
    CREATE UNIQUE INDEX IF NOT EXISTS channel_connect_links_token_unique ON channel_connect_links (token);
  `);
  await safeExec('conversations_csat_token_unique', () => sql`
    CREATE UNIQUE INDEX IF NOT EXISTS conversations_csat_token_unique ON conversations (csat_token) WHERE csat_token IS NOT NULL;
  `);
  await safeExec('idx_contacts_company_phone', () => sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_company_phone ON contacts (company_id, nomor_whatsapp) WHERE nomor_whatsapp IS NOT NULL;
  `);
  await safeExec('idx_campaign_rec_company_waha_msg', () => sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_rec_company_waha_msg ON campaign_recipients (company_id, waha_message_id) WHERE waha_message_id IS NOT NULL;
  `);
  await safeExec('idx_chat_msg_company_waha_msg', () => sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_msg_company_waha_msg ON chat_messages (company_id, waha_message_id) WHERE waha_message_id IS NOT NULL;
  `);
  await safeExec('idx_crm_roles_company_name', () => sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_roles_company_name ON crm_roles (company_id, LOWER(name));
  `);
  await safeExec('idx_canned_company_code', () => sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_canned_company_code ON canned_responses (company_id, LOWER(short_code));
  `);
  await safeExec('idx_products_company_sku', () => sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_products_company_sku ON products (company_id, LOWER(sku));
  `);
  await safeExec('idx_contact_id_company_ch_ext', () => sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_id_company_ch_ext ON contact_identities (company_id, channel, external_id);
  `);
  await safeExec('idx_ai_skills_company_slug', () => sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_skills_company_slug ON ai_skills (company_id, slug);
  `);

  // 8. Migrate legacy single-tenant settings and license into company_default once
  await safeExec('migration_multi_tenant_v1', async () => {
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
          ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
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
            SELECT id FROM crm_agents WHERE company_id = 'company_default' AND UPPER(role) = 'ADMIN' ORDER BY created_at ASC LIMIT 1
          );
        `;
      }

      await sql`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ('migration_multi_tenant_v1', 'true', NOW())
        ON CONFLICT (key) DO NOTHING;
      `;
    }
  });

  // 9. One-time idempotent seed for Master Labels & Contact Categories
  await safeExec('master_labels_seeded', async () => {
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
            INSERT INTO crm_labels (id, company_id, scope, name, color, sort_order, is_active, created_at, updated_at)
            VALUES (${item.id}, 'company_default', ${item.scope}, ${item.name}, ${item.color}, ${item.sort}, TRUE, NOW(), NOW())
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
  });

  console.log('[Drizzle ORM] PostgreSQL Database schema initialized successfully.');
}

export default db;
