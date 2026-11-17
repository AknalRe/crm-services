import { is, SQL } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { config } from '../config';

export const ISOLATED_CRM_SCHEMA = 'reneo_crm';

function stripSchemaParams(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.delete('schema');
    parsed.searchParams.delete('search_path');
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

const cleanConnectionString = stripSchemaParams(config.databaseUrl);

let _queryClient = postgres(cleanConnectionString, { max: 10 });
let _db = drizzle(_queryClient, { schema });

let _dbReadyResolve: (() => void) | null = null;
const _dbReadyPromise = new Promise<void>((resolve) => {
  _dbReadyResolve = resolve;
});

export function waitForDbInitialized(): Promise<void> {
  return _dbReadyPromise;
}

// Proxy wrappers allow initDb() to switch PostgreSQL search_path transparently for all imports
export const queryClient: ReturnType<typeof postgres> = new Proxy((() => {}) as any, {
  apply(_target, _thisArg, args) {
    return Reflect.apply(_queryClient as any, _queryClient, args);
  },
  get(_target, prop) {
    const val = (_queryClient as any)[prop];
    return typeof val === 'function' ? val.bind(_queryClient) : val;
  },
});

export const db: ReturnType<typeof drizzle<typeof schema>> = new Proxy({} as any, {
  get(_target, prop) {
    const val = (_db as any)[prop];
    return typeof val === 'function' ? val.bind(_db) : val;
  },
});

export interface ColumnMetaRow {
  tableName: string;
  columnName: string;
  dataType: string;
}

const INCOMPATIBLE_TEXT_TYPES = new Set([
  'bigint',
  'integer',
  'smallint',
  'numeric',
  'decimal',
  'real',
  'double precision',
  'boolean',
  'uuid',
  'bytea',
  'date',
  'timestamp without time zone',
  'timestamp with time zone',
]);

export function detectTableTypeConflict(
  table: PgTable,
  liveCols: Map<string, string>
): { table: string; column: string; expected: string; actual: string } | null {
  const cfg = getTableConfig(table);
  for (const c of cfg.columns) {
    const expectedType = String(c.getSQLType() || '').toLowerCase();
    const actualType = liveCols.get(c.name);
    if (!actualType) continue;

    if (expectedType === 'text' && INCOMPATIBLE_TEXT_TYPES.has(actualType)) {
      return { table: cfg.name, column: c.name, expected: expectedType, actual: actualType };
    }
    if (
      (expectedType === 'integer' || expectedType === 'double precision') &&
      ['text', 'character varying', 'boolean', 'uuid', 'timestamp without time zone'].includes(
        actualType
      )
    ) {
      return { table: cfg.name, column: c.name, expected: expectedType, actual: actualType };
    }
    if (expectedType === 'boolean' && actualType !== 'boolean') {
      return { table: cfg.name, column: c.name, expected: expectedType, actual: actualType };
    }
  }
  return null;
}

export function detectPublicSchemaTypeConflict(
  rows: ColumnMetaRow[]
): { table: string; column: string; expected: string; actual: string } | null {
  const byTable = new Map<string, Map<string, string>>();
  for (const r of rows) {
    let cols = byTable.get(r.tableName);
    if (!cols) {
      cols = new Map<string, string>();
      byTable.set(r.tableName, cols);
    }
    cols.set(r.columnName, r.dataType.toLowerCase());
  }

  const drizzleTables = Object.values(schema).filter((v: any) => is(v, PgTable)) as PgTable[];
  for (const table of drizzleTables) {
    const cfg = getTableConfig(table);
    const liveCols = byTable.get(cfg.name);
    if (!liveCols) continue;
    const conflict = detectTableTypeConflict(table, liveCols);
    if (conflict) return conflict;
  }
  return null;
}

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

export function buildForeignKeyStatements(): Array<{ label: string; sqlText: string }> {
  const statements: Array<{ label: string; sqlText: string }> = [];
  const drizzleTables = Object.values(schema).filter((v: any) => is(v, PgTable)) as PgTable[];

  for (const table of drizzleTables) {
    const cfg = getTableConfig(table);
    for (const fk of cfg.foreignKeys) {
      const ref = fk.reference();
      const localCols = ref.columns.map((c) => `"${c.name}"`).join(', ');
      const foreignTable = getTableConfig(ref.foreignTable).name;
      const foreignCols = ref.foreignColumns.map((c) => `"${c.name}"`).join(', ');
      const fkName = `${cfg.name}_${ref.columns.map((c) => c.name).join('_')}_${foreignTable}_${ref.foreignColumns.map((c) => c.name).join('_')}_fk`;
      const onDeleteClause = fk.onDelete ? ` ON DELETE ${fk.onDelete.toUpperCase()}` : '';
      const sqlText = `DO $$ BEGIN
  ALTER TABLE "${cfg.name}" ADD CONSTRAINT "${fkName}" FOREIGN KEY (${localCols}) REFERENCES "${foreignTable}" (${foreignCols})${onDeleteClause};
EXCEPTION
  WHEN duplicate_object OR foreign_key_violation THEN null;
END $$;`;
      statements.push({ label: `fk ${fkName}`, sqlText });
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

async function switchActiveSchema(targetSchema: string): Promise<void> {
  const oldClient = _queryClient;
  _queryClient = postgres(cleanConnectionString, {
    max: 10,
    connection: { search_path: targetSchema },
  });
  _db = drizzle(_queryClient, { schema });
  await oldClient.end({ timeout: 2 }).catch(() => {});
}

async function reconcileSchemaFromDrizzle(
  sql: ReturnType<typeof postgres>,
  safeExec: (label: string, fn: () => Promise<any>) => Promise<void>,
  includeForeignKeys = false
): Promise<void> {
  const colRows = await sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema();
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

  if (includeForeignKeys) {
    const fkStmts = buildForeignKeyStatements();
    for (const fkStmt of fkStmts) {
      await safeExec(`reconcile ${fkStmt.label}`, () => sql.unsafe(fkStmt.sqlText));
    }
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

async function migrateCompatibleCrmRowsFromPublic(
  sql: ReturnType<typeof postgres>,
  safeExec: (label: string, fn: () => Promise<any>) => Promise<void>
): Promise<void> {
  // Only attempt once when isolated schema has no agents/settings yet
  const targetAgents = await sql`SELECT COUNT(*)::int AS cnt FROM crm_agents;`.catch(() => [{ cnt: 0 }]);
  const targetSettings = await sql`SELECT COUNT(*)::int AS cnt FROM system_settings;`.catch(() => [{ cnt: 0 }]);
  if ((targetAgents[0]?.cnt || 0) > 0 || (targetSettings[0]?.cnt || 0) > 0) {
    return;
  }

  const pubColsRows = await sql`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public';
  `;
  const pubByTable = new Map<string, Map<string, string>>();
  for (const r of pubColsRows) {
    const t = String(r.table_name);
    let m = pubByTable.get(t);
    if (!m) {
      m = new Map<string, string>();
      pubByTable.set(t, m);
    }
    m.set(String(r.column_name), String(r.data_type).toLowerCase());
  }

  // Verify public actually held CRM data (crm_agents or system_settings with text PKs)
  const pubAgentsCols = pubByTable.get('crm_agents');
  const pubSysCols = pubByTable.get('system_settings');
  const hasPublicCrm =
    (pubAgentsCols && pubAgentsCols.get('id') === 'text') ||
    (pubSysCols && pubSysCols.get('key') === 'text');
  if (!hasPublicCrm) return;

  console.log('[DB Init] Migrating compatible CRM data from public schema into reneo_crm...');
  const drizzleTables = Object.values(schema).filter((v: any) => is(v, PgTable)) as PgTable[];
  for (const table of drizzleTables) {
    const cfg = getTableConfig(table);
    if (cfg.name === 'companies') continue; // Do not copy conflicting foreign companies table
    const liveCols = pubByTable.get(cfg.name);
    if (!liveCols) continue;
    if (detectTableTypeConflict(table, liveCols)) continue;

    const commonCols = cfg.columns
      .map((c) => c.name)
      .filter((colName) => liveCols.has(colName));
    if (commonCols.length === 0) continue;

    const colList = commonCols.map((c) => `"${c}"`).join(', ');
    await safeExec(`copy public.${cfg.name} to ${ISOLATED_CRM_SCHEMA}`, async () => {
      await sql.unsafe(
        `INSERT INTO "${ISOLATED_CRM_SCHEMA}"."${cfg.name}" (${colList}) SELECT ${colList} FROM "public"."${cfg.name}" ON CONFLICT DO NOTHING;`
      );
    });
  }
}

/**
 * Automatically create tables and migrate schema safely with 100% idempotent isolation
 */
export async function initDb() {
  const safeExec = async (label: string, fn: () => Promise<any>) => {
    try {
      await fn();
    } catch (e: any) {
      console.warn(`[DB Init] Warning on ${label}:`, e.message);
    }
  };

  await waitForPostgresReady(_queryClient);

  // 0. Check if isolated schema already exists OR if public schema has incompatible column types (e.g. another app's companies.id bigint)
  let activeSchema = 'public';
  const isolatedExistsRows = await _queryClient`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = ${ISOLATED_CRM_SCHEMA} AND table_name = 'companies'
    LIMIT 1;
  `.catch(() => []);

  if (isolatedExistsRows.length > 0) {
    activeSchema = ISOLATED_CRM_SCHEMA;
    await switchActiveSchema(ISOLATED_CRM_SCHEMA);
    console.log(`[DB Init] Using existing isolated PostgreSQL schema "${ISOLATED_CRM_SCHEMA}".`);
  } else {
    const publicMetaRows = await _queryClient`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public';
    `;
    const conflict = detectPublicSchemaTypeConflict(
      publicMetaRows.map((r: any) => ({
        tableName: String(r.table_name),
        columnName: String(r.column_name),
        dataType: String(r.data_type),
      }))
    );
    if (conflict) {
      console.warn(
        `[DB Init] Detected incompatible column type in public schema (${conflict.table}.${conflict.column} is ${conflict.actual}, expected ${conflict.expected}). Isolating CRM into schema "${ISOLATED_CRM_SCHEMA}".`
      );
      await _queryClient.unsafe(`CREATE SCHEMA IF NOT EXISTS "${ISOLATED_CRM_SCHEMA}";`);
      await switchActiveSchema(ISOLATED_CRM_SCHEMA);
      activeSchema = ISOLATED_CRM_SCHEMA;
    }
  }

  // 1. Reconcile ALL schema tables & columns against active schema BEFORE migrations or queries
  await safeExec('initial schema reconcile', () =>
    reconcileSchemaFromDrizzle(_queryClient, safeExec, activeSchema !== 'public')
  );

  // 2. Ensure default company row exists (companies table is guaranteed up to date)
  await safeExec('ensure default company', async () => {
    await _queryClient`
      INSERT INTO companies (id, name, slug, status, is_default, created_at, updated_at)
      VALUES ('company_default', 'Perusahaan Utama', 'default', 'ACTIVE', TRUE, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `;
  });

  // If we just isolated from public due to a conflicting foreign table, preserve any compatible CRM tables from public
  if (activeSchema === ISOLATED_CRM_SCHEMA) {
    await safeExec('migrate compatible CRM rows from public', () =>
      migrateCompatibleCrmRowsFromPublic(_queryClient, safeExec)
    );
  }

  // 3. Run official Drizzle migrations when operating in default public schema
  if (activeSchema === 'public') {
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
        await migrate(_db, { migrationsFolder: found });
        console.log('[Drizzle ORM] Migrations applied successfully.');
      }
    } catch (migErr: any) {
      console.warn('[Drizzle ORM] Migrator note (falling back to idempotent init):', migErr.message);
    }
  }

  // 4. Drop legacy single-tenant unique constraints & ensure nullable updates
  await safeExec('drop legacy constraints', async () => {
    await _queryClient`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_nomor_whatsapp_key;`;
    await _queryClient`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_nomor_whatsapp_unique;`;
    await _queryClient`ALTER TABLE contacts ALTER COLUMN nomor_whatsapp DROP NOT NULL;`;
    await _queryClient`ALTER TABLE campaigns ALTER COLUMN scheduled_at DROP NOT NULL;`;
    await _queryClient`ALTER TABLE scheduled_posts ALTER COLUMN channel_account_id DROP NOT NULL;`;
    await _queryClient`ALTER TABLE campaign_recipients DROP CONSTRAINT IF EXISTS campaign_recipients_waha_message_id_key;`;
    await _queryClient`ALTER TABLE campaign_recipients DROP CONSTRAINT IF EXISTS campaign_recipients_waha_message_id_unique;`;
    await _queryClient`ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_contact_id_key;`;
    await _queryClient`ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_contact_id_unique;`;
    await _queryClient`ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_waha_message_id_key;`;
    await _queryClient`ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_waha_message_id_unique;`;
    await _queryClient`ALTER TABLE contact_identities DROP CONSTRAINT IF EXISTS contact_identities_channel_external_id_key;`;
    await _queryClient`ALTER TABLE contact_identities DROP CONSTRAINT IF EXISTS contact_identities_channel_external_id_unique;`;
    await _queryClient`ALTER TABLE crm_roles DROP CONSTRAINT IF EXISTS crm_roles_name_key;`;
    await _queryClient`ALTER TABLE crm_roles DROP CONSTRAINT IF EXISTS crm_roles_name_unique;`;
    await _queryClient`ALTER TABLE canned_responses DROP CONSTRAINT IF EXISTS canned_responses_short_code_key;`;
    await _queryClient`ALTER TABLE canned_responses DROP CONSTRAINT IF EXISTS canned_responses_short_code_unique;`;
    await _queryClient`ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_key;`;
    await _queryClient`ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_unique;`;
    await _queryClient`ALTER TABLE ai_skills DROP CONSTRAINT IF EXISTS ai_skills_slug_key;`;
    await _queryClient`ALTER TABLE ai_skills DROP CONSTRAINT IF EXISTS ai_skills_slug_unique;`;
  });

  // 5. Re-verify schema sync after migrations
  await safeExec('post-migration schema reconcile', () =>
    reconcileSchemaFromDrizzle(_queryClient, safeExec, true)
  );

  // 6. Seed default birthday settings row
  await safeExec('seed birthday_settings', async () => {
    await _queryClient`
      INSERT INTO birthday_settings (id, company_id, is_enabled, send_time, message_template, delay_seconds, updated_at)
      VALUES ('default', 'company_default', TRUE, '08:00', 'Halo {nama_panggilan}! Selamat ulang tahun 🎉🎂 Semoga panjang umur, sehat selalu, berkah, dan sukses selalu!', 5, NOW())
      ON CONFLICT (id) DO NOTHING;
    `;
  });

  // 7. Create single-column and multi-tenant compound unique indexes defensively
  await safeExec('idx_company_settings_company_key', () => _queryClient`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_company_settings_company_key ON company_settings (company_id, key);
  `);
  await safeExec('idx_wa_status_view_post_viewer', () => _queryClient`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_status_view_post_viewer ON whatsapp_status_views (post_id, viewer_jid);
  `);
  await safeExec('crm_agents_email_unique', () => _queryClient`
    CREATE UNIQUE INDEX IF NOT EXISTS crm_agents_email_unique ON crm_agents (email);
  `);
  await safeExec('csat_responses_token_unique', () => _queryClient`
    CREATE UNIQUE INDEX IF NOT EXISTS csat_responses_token_unique ON csat_responses (token);
  `);
  await safeExec('channel_connect_links_token_unique', () => _queryClient`
    CREATE UNIQUE INDEX IF NOT EXISTS channel_connect_links_token_unique ON channel_connect_links (token);
  `);
  await safeExec('conversations_csat_token_unique', () => _queryClient`
    CREATE UNIQUE INDEX IF NOT EXISTS conversations_csat_token_unique ON conversations (csat_token) WHERE csat_token IS NOT NULL;
  `);
  await safeExec('idx_contacts_company_phone', () => _queryClient`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_company_phone ON contacts (company_id, nomor_whatsapp) WHERE nomor_whatsapp IS NOT NULL;
  `);
  await safeExec('idx_campaign_rec_company_waha_msg', () => _queryClient`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_rec_company_waha_msg ON campaign_recipients (company_id, waha_message_id) WHERE waha_message_id IS NOT NULL;
  `);
  await safeExec('idx_chat_msg_company_waha_msg', () => _queryClient`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_msg_company_waha_msg ON chat_messages (company_id, waha_message_id) WHERE waha_message_id IS NOT NULL;
  `);
  await safeExec('idx_crm_roles_company_name', () => _queryClient`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_roles_company_name ON crm_roles (company_id, LOWER(name));
  `);
  await safeExec('idx_canned_company_code', () => _queryClient`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_canned_company_code ON canned_responses (company_id, LOWER(short_code));
  `);
  await safeExec('idx_products_company_sku', () => _queryClient`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_products_company_sku ON products (company_id, LOWER(sku));
  `);
  await safeExec('idx_contact_id_company_ch_ext', () => _queryClient`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_id_company_ch_ext ON contact_identities (company_id, channel, external_id);
  `);
  await safeExec('idx_ai_skills_company_slug', () => _queryClient`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_skills_company_slug ON ai_skills (company_id, slug);
  `);

  // 8. Migrate legacy single-tenant settings and license into company_default once
  await safeExec('migration_multi_tenant_v1', async () => {
    const migratedRows = await _queryClient`
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
      const sysRows = await _queryClient`
        SELECT key, value, updated_at FROM system_settings WHERE key = ANY(${legacyCompanyKeys});
      `;
      const sysMap = new Map<string, string>();
      for (const r of sysRows) {
        sysMap.set(r.key, r.value);
        const settingId = `company_default::${r.key}`;
        await _queryClient`
          INSERT INTO company_settings (id, company_id, key, value, updated_at)
          VALUES (${settingId}, 'company_default', ${r.key}, ${r.value}, ${r.updated_at || new Date()})
          ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
        `;
      }

      const adminName = (await _queryClient`SELECT value FROM system_settings WHERE key = 'crm_admin_name' LIMIT 1;`)[0]?.value || null;
      const adminEmail = (await _queryClient`SELECT value FROM system_settings WHERE key = 'crm_admin_email' LIMIT 1;`)[0]?.value || null;
      const licPlan = sysMap.get('license_plan');
      const licExp = sysMap.get('license_expires_at');
      const parsedExpDate = licExp && !isNaN(Date.parse(licExp)) ? new Date(licExp) : null;
      const licKey = sysMap.get('license_key');
      const licFeats = sysMap.get('license_features');
      const hasLegacyLic = Boolean(licKey && parsedExpDate);
      await _queryClient`
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
      const platCount = await _queryClient`SELECT COUNT(*)::int AS cnt FROM crm_agents WHERE is_platform_admin = TRUE;`;
      if ((platCount[0]?.cnt || 0) === 0) {
        await _queryClient`
          UPDATE crm_agents
          SET is_platform_admin = TRUE
          WHERE id = (
            SELECT id FROM crm_agents WHERE company_id = 'company_default' AND UPPER(role) = 'ADMIN' ORDER BY created_at ASC LIMIT 1
          );
        `;
      }

      await _queryClient`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ('migration_multi_tenant_v1', 'true', NOW())
        ON CONFLICT (key) DO NOTHING;
      `;
    }
  });

  // 9. One-time idempotent seed for Master Labels & Contact Categories
  await safeExec('master_labels_seeded', async () => {
    const seededRows = await _queryClient`
      SELECT value FROM system_settings WHERE key = 'master_labels_seeded' LIMIT 1;
    `;
    if (!seededRows[0]) {
      const existingLabels = await _queryClient`SELECT COUNT(*)::int AS cnt FROM crm_labels;`;
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
          await _queryClient`
            INSERT INTO crm_labels (id, company_id, scope, name, color, sort_order, is_active, created_at, updated_at)
            VALUES (${item.id}, 'company_default', ${item.scope}, ${item.name}, ${item.color}, ${item.sort}, TRUE, NOW(), NOW())
            ON CONFLICT (id) DO NOTHING;
          `;
        }
      }
      await _queryClient`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ('master_labels_seeded', 'true', NOW())
        ON CONFLICT (key) DO NOTHING;
      `;
    }
  });

  if (_dbReadyResolve) {
    _dbReadyResolve();
    _dbReadyResolve = null;
  }

  console.log(`[Drizzle ORM] PostgreSQL Database schema initialized successfully (schema: ${activeSchema}).`);
}

export default db;
