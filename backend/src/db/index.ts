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
    await _queryClient`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS media_url text;`;
    await _queryClient`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS media_type text;`;
    await _queryClient`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS media_name text;`;
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
  // Same WhatsApp message id may legitimately arrive on several sessions (e.g. one group joined by sessions A and B)
  await safeExec('drop legacy idx_chat_msg_company_waha_msg', () => _queryClient`
    DROP INDEX IF EXISTS idx_chat_msg_company_waha_msg;
  `);
  await safeExec('idx_chat_msg_company_session_waha_msg', () => _queryClient`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_msg_company_session_waha_msg ON chat_messages (company_id, COALESCE(waha_session, ''), waha_message_id) WHERE waha_message_id IS NOT NULL;
  `);
  // Merge any historical duplicate WHATSAPP conversations (same company, contact, and session) caused by concurrent message/message.any webhooks
  await safeExec('deduplicate_whatsapp_conversations', async () => {
    const dupRows = await _queryClient`
      SELECT
        c.id,
        c.company_id,
        c.contact_id,
        COALESCE(LOWER(TRIM(c.waha_session)), '') AS norm_session,
        c.assigned_agent_id,
        c.assigned_agent_name,
        c.labels,
        c.last_message,
        c.last_message_at,
        c.unread_count,
        c.created_at,
        c.updated_at,
        (SELECT COUNT(*)::int FROM chat_messages m WHERE m.conversation_id = c.id) AS msg_count
      FROM conversations c
      WHERE c.channel = 'WHATSAPP'
        AND (c.company_id, c.contact_id, COALESCE(LOWER(TRIM(c.waha_session)), '')) IN (
          SELECT company_id, contact_id, COALESCE(LOWER(TRIM(waha_session)), '')
          FROM conversations
          WHERE channel = 'WHATSAPP'
          GROUP BY 1, 2, 3
          HAVING COUNT(*) > 1
        )
      ORDER BY c.company_id, c.contact_id, norm_session;
    `;
    if (dupRows.length > 0) {
      const mergeGroups = planWhatsAppConversationDedup(
        dupRows.map((r: any) => ({
          id: String(r.id),
          companyId: String(r.company_id),
          contactId: String(r.contact_id),
          normSession: String(r.norm_session || ''),
          assignedAgentId: r.assigned_agent_id ? String(r.assigned_agent_id) : null,
          assignedAgentName: r.assigned_agent_name ? String(r.assigned_agent_name) : null,
          labels: r.labels ? String(r.labels) : null,
          msgCount: Number(r.msg_count || 0),
          updatedAt: r.updated_at ? new Date(r.updated_at) : new Date(0),
          createdAt: r.created_at ? new Date(r.created_at) : new Date(0),
        }))
      );
      for (const grp of mergeGroups) {
        for (const dupId of grp.dupIds) {
          await _queryClient`
            UPDATE chat_messages SET conversation_id = ${grp.canonicalId} WHERE conversation_id = ${dupId};
          `;
          await _queryClient`
            UPDATE csat_responses SET conversation_id = ${grp.canonicalId} WHERE conversation_id = ${dupId};
          `;
          await _queryClient`
            DELETE FROM conversations WHERE id = ${dupId};
          `;
        }
        if (grp.mergedLabels !== undefined || grp.fallbackAgentId) {
          await _queryClient`
            UPDATE conversations
            SET
              labels = COALESCE(${grp.mergedLabels ?? null}, labels),
              assigned_agent_id = COALESCE(assigned_agent_id, ${grp.fallbackAgentId ?? null}),
              assigned_agent_name = COALESCE(assigned_agent_name, ${grp.fallbackAgentName ?? null})
            WHERE id = ${grp.canonicalId};
          `;
        }
      }
      console.log(`[DB Init] Merged ${mergeGroups.length} duplicate WhatsApp conversation group(s)`);
    }
  });
  await safeExec('idx_conversations_wa_unique', () => _queryClient`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_wa_unique
    ON conversations (company_id, contact_id, COALESCE(LOWER(TRIM(waha_session)), ''))
    WHERE channel = 'WHATSAPP';
  `);
  await safeExec('deduplicate_waha_chat_messages', async () => {
    const stanzaRemoved = await _queryClient.unsafe(`
      WITH extracted AS (
        SELECT
          id,
          company_id,
          conversation_id,
          COALESCE(LOWER(TRIM(waha_session)), '') AS norm_session,
          direction,
          sender_name,
          sender_phone,
          media_url,
          ack_status,
          delivered_at,
          read_at,
          metadata_json,
          created_at,
          COALESCE(
            SUBSTRING(waha_message_id FROM '@(?:g\\.us|c\\.us|s\\.whatsapp\\.net|lid)_([^_@]+)'),
            REGEXP_REPLACE(waha_message_id, '^.*_', '')
          ) AS stanza_id
        FROM chat_messages
        WHERE channel = 'WHATSAPP'
          AND waha_message_id IS NOT NULL
          AND waha_message_id NOT LIKE '%status@broadcast%'
      ),
      ranked_stanza AS (
        SELECT
          id,
          ack_status,
          delivered_at,
          read_at,
          FIRST_VALUE(id) OVER (
            PARTITION BY company_id, conversation_id, norm_session, direction, stanza_id
            ORDER BY
              (CASE WHEN COALESCE(metadata_json, '') LIKE '%"sentVia":"CRM"%' THEN 1 ELSE 0 END) DESC,
              (CASE WHEN sender_name IS NOT NULL AND TRIM(sender_name) <> '' THEN 1 ELSE 0 END) DESC,
              (CASE WHEN sender_phone IS NOT NULL AND TRIM(sender_phone) <> '' THEN 1 ELSE 0 END) DESC,
              (CASE WHEN media_url IS NOT NULL THEN 1 ELSE 0 END) DESC,
              created_at ASC,
              id ASC
          ) AS keep_id,
          ROW_NUMBER() OVER (
            PARTITION BY company_id, conversation_id, norm_session, direction, stanza_id
            ORDER BY
              (CASE WHEN COALESCE(metadata_json, '') LIKE '%"sentVia":"CRM"%' THEN 1 ELSE 0 END) DESC,
              (CASE WHEN sender_name IS NOT NULL AND TRIM(sender_name) <> '' THEN 1 ELSE 0 END) DESC,
              (CASE WHEN sender_phone IS NOT NULL AND TRIM(sender_phone) <> '' THEN 1 ELSE 0 END) DESC,
              (CASE WHEN media_url IS NOT NULL THEN 1 ELSE 0 END) DESC,
              created_at ASC,
              id ASC
          ) AS rn
        FROM extracted
        WHERE LENGTH(stanza_id) >= 8 AND stanza_id NOT LIKE '%@%'
      ),
      dups AS (
        SELECT id, keep_id, ack_status, delivered_at, read_at FROM ranked_stanza WHERE rn > 1 AND id <> keep_id
      ),
      upgraded AS (
        UPDATE chat_messages m
        SET
          ack_status = GREATEST(COALESCE(m.ack_status, 0), agg.max_ack),
          status = CASE
            WHEN GREATEST(COALESCE(m.ack_status, 0), agg.max_ack) >= 3 THEN 'READ'
            WHEN GREATEST(COALESCE(m.ack_status, 0), agg.max_ack) = 2 THEN 'DELIVERED'
            ELSE m.status
          END,
          delivered_at = COALESCE(m.delivered_at, agg.max_delivered_at),
          read_at = COALESCE(m.read_at, agg.max_read_at)
        FROM (
          SELECT keep_id, MAX(COALESCE(ack_status, 0)) AS max_ack, MAX(delivered_at) AS max_delivered_at, MAX(read_at) AS max_read_at
          FROM dups
          GROUP BY keep_id
        ) agg
        WHERE m.id = agg.keep_id
      ),
      relinked AS (
        UPDATE chat_messages m
        SET reply_to_message_id = d.keep_id
        FROM dups d
        WHERE m.reply_to_message_id = d.id
      )
      DELETE FROM chat_messages
      WHERE id IN (SELECT id FROM dups)
      RETURNING id;
    `);
    const mediaRemoved = await _queryClient.unsafe(`
      WITH media_dups AS (
        SELECT DISTINCT ON (b.id)
          b.id AS dup_id,
          a.id AS keep_id
        FROM chat_messages a
        JOIN chat_messages b
          ON a.company_id = b.company_id
         AND a.conversation_id = b.conversation_id
         AND a.direction = b.direction
         AND COALESCE(a.media_type, '') = COALESCE(b.media_type, '')
         AND a.body = b.body
         AND a.id <> b.id
         AND ABS(EXTRACT(EPOCH FROM (b.created_at - a.created_at))) <= 15
        WHERE a.channel = 'WHATSAPP'
          AND a.media_type IS NOT NULL
          AND LENGTH(TRIM(a.body)) >= 20
          AND (
            (a.sender_name IS NOT NULL AND TRIM(a.sender_name) <> ''),
            (a.sender_phone IS NOT NULL AND TRIM(a.sender_phone) <> ''),
            (a.media_url IS NOT NULL),
            EXTRACT(EPOCH FROM b.created_at),
            b.id
          ) > (
            (b.sender_name IS NOT NULL AND TRIM(b.sender_name) <> ''),
            (b.sender_phone IS NOT NULL AND TRIM(b.sender_phone) <> ''),
            (b.media_url IS NOT NULL),
            EXTRACT(EPOCH FROM a.created_at),
            a.id
          )
        ORDER BY
          b.id,
          (a.sender_name IS NOT NULL AND TRIM(a.sender_name) <> '') DESC,
          (a.sender_phone IS NOT NULL AND TRIM(a.sender_phone) <> '') DESC,
          a.created_at ASC,
          a.id ASC
      ),
      relinked AS (
        UPDATE chat_messages m
        SET reply_to_message_id = d.keep_id
        FROM media_dups d
        WHERE m.reply_to_message_id = d.dup_id
      )
      DELETE FROM chat_messages
      WHERE id IN (SELECT dup_id FROM media_dups)
      RETURNING id;
    `);
    const outboundRaceRemoved = await _queryClient.unsafe(`
      WITH outbound_dups AS (
        SELECT DISTINCT ON (b.id)
          b.id AS dup_id,
          a.id AS keep_id,
          COALESCE(b.ack_status, 0) AS dup_ack,
          b.delivered_at AS dup_delivered_at,
          b.read_at AS dup_read_at,
          b.waha_message_id AS dup_waha_id
        FROM chat_messages a
        JOIN chat_messages b
          ON a.company_id = b.company_id
         AND a.conversation_id = b.conversation_id
         AND a.direction = 'OUTBOUND'
         AND b.direction = 'OUTBOUND'
         AND TRIM(REPLACE(a.body, E'\\r\\n', E'\\n')) = TRIM(REPLACE(b.body, E'\\r\\n', E'\\n'))
         AND a.id <> b.id
         AND ABS(EXTRACT(EPOCH FROM (b.created_at - a.created_at))) <= 120
        WHERE a.channel = 'WHATSAPP'
          AND b.channel = 'WHATSAPP'
          AND LENGTH(TRIM(a.body)) > 0
          AND COALESCE(a.metadata_json, '') LIKE '%"sentVia":"CRM"%'
          AND COALESCE(b.metadata_json, '') NOT LIKE '%"sentVia":"CRM"%'
        ORDER BY b.id, ABS(EXTRACT(EPOCH FROM (b.created_at - a.created_at))) ASC, a.created_at ASC
      ),
      upgraded AS (
        UPDATE chat_messages m
        SET
          ack_status = GREATEST(COALESCE(m.ack_status, 0), agg.max_ack),
          status = CASE
            WHEN GREATEST(COALESCE(m.ack_status, 0), agg.max_ack) >= 3 THEN 'READ'
            WHEN GREATEST(COALESCE(m.ack_status, 0), agg.max_ack) = 2 THEN 'DELIVERED'
            ELSE m.status
          END,
          delivered_at = COALESCE(m.delivered_at, agg.max_delivered_at),
          read_at = COALESCE(m.read_at, agg.max_read_at),
          waha_message_id = COALESCE(m.waha_message_id, agg.any_waha_id)
        FROM (
          SELECT
            keep_id,
            MAX(dup_ack) AS max_ack,
            MAX(dup_delivered_at) AS max_delivered_at,
            MAX(dup_read_at) AS max_read_at,
            MAX(dup_waha_id) AS any_waha_id
          FROM outbound_dups
          GROUP BY keep_id
        ) agg
        WHERE m.id = agg.keep_id
      ),
      relinked AS (
        UPDATE chat_messages m
        SET reply_to_message_id = d.keep_id
        FROM outbound_dups d
        WHERE m.reply_to_message_id = d.dup_id
      )
      DELETE FROM chat_messages
      WHERE id IN (SELECT dup_id FROM outbound_dups)
      RETURNING id;
    `);
    const totalRemoved =
      (stanzaRemoved?.length || 0) +
      (mediaRemoved?.length || 0) +
      (outboundRaceRemoved?.length || 0);
    if (totalRemoved > 0) {
      console.log(`[DB Init] Cleaned ${totalRemoved} duplicate WhatsApp message row(s)`);
    }
  });
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

export interface WhatsAppConversationDedupCandidate {
  id: string;
  companyId: string;
  contactId: string;
  normSession: string;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  labels: string | null;
  msgCount: number;
  updatedAt: Date;
  createdAt: Date;
}

export interface WhatsAppConversationMergePlan {
  canonicalId: string;
  dupIds: string[];
  mergedLabels?: string | null;
  fallbackAgentId: string | null;
  fallbackAgentName: string | null;
}

export function planWhatsAppConversationDedup(
  rows: WhatsAppConversationDedupCandidate[]
): WhatsAppConversationMergePlan[] {
  const byKey = new Map<string, WhatsAppConversationDedupCandidate[]>();
  for (const row of rows) {
    const key = `${row.companyId}::${row.contactId}::${row.normSession}`;
    const list = byKey.get(key) || [];
    list.push(row);
    byKey.set(key, list);
  }

  const plans: WhatsAppConversationMergePlan[] = [];
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => {
      if (b.msgCount !== a.msgCount) return b.msgCount - a.msgCount;
      const agentDiff = (b.assignedAgentId ? 1 : 0) - (a.assignedAgentId ? 1 : 0);
      if (agentDiff !== 0) return agentDiff;
      const updDiff = b.updatedAt.getTime() - a.updatedAt.getTime();
      if (updDiff !== 0) return updDiff;
      const crtDiff = a.createdAt.getTime() - b.createdAt.getTime();
      if (crtDiff !== 0) return crtDiff;
      return a.id.localeCompare(b.id);
    });

    const canonical = sorted[0];
    const dups = sorted.slice(1);
    const labelSet = new Set<string>();
    for (const item of sorted) {
      for (const lbl of String(item.labels || '').split(',').map((s) => s.trim()).filter(Boolean)) {
        labelSet.add(lbl);
      }
    }
    const fallbackAgent = dups.find((d) => Boolean(d.assignedAgentId));
    plans.push({
      canonicalId: canonical.id,
      dupIds: dups.map((d) => d.id),
      mergedLabels: labelSet.size > 0 ? Array.from(labelSet).join(', ') : undefined,
      fallbackAgentId: !canonical.assignedAgentId ? fallbackAgent?.assignedAgentId || null : null,
      fallbackAgentName: !canonical.assignedAgentId ? fallbackAgent?.assignedAgentName || null : null,
    });
  }
  return plans;
}

export default db;
