import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildForeignKeyStatements,
  buildSchemaSyncStatements,
  detectPublicSchemaTypeConflict,
  planWhatsAppConversationDedup,
} from './index';

test('buildSchemaSyncStatements creates all 30 tables on an empty schema', () => {
  const stmts = buildSchemaSyncStatements(new Map());
  assert.equal(stmts.length, 30);
  const companiesCreate = stmts.find((s) => s.label === 'create table companies');
  assert.ok(companiesCreate, 'companies create statement should exist');
  assert.ok(companiesCreate.sqlText.includes('"slug" text NOT NULL'), 'companies should include slug');
});

test('buildSchemaSyncStatements detects missing slug and columns on legacy companies and ai_skills tables', () => {
  const existing = new Map<string, Set<string>>();
  existing.set('companies', new Set(['id', 'name', 'created_at', 'updated_at']));
  existing.set('ai_skills', new Set(['id', 'company_id', 'name', 'instructions', 'created_at', 'updated_at']));

  const stmts = buildSchemaSyncStatements(existing);
  const slugStmt = stmts.find((s) => s.label === 'add column companies.slug');
  assert.ok(slugStmt, 'should detect missing companies.slug');
  assert.equal(
    slugStmt.sqlText,
    'ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "slug" text DEFAULT \'\' NOT NULL;'
  );

  const skillSlugStmt = stmts.find((s) => s.label === 'add column ai_skills.slug');
  assert.ok(skillSlugStmt, 'should detect missing ai_skills.slug');
  assert.equal(
    skillSlugStmt.sqlText,
    'ALTER TABLE "ai_skills" ADD COLUMN IF NOT EXISTS "slug" text DEFAULT \'\' NOT NULL;'
  );
});

test('detectPublicSchemaTypeConflict catches foreign companies table with bigint id', () => {
  const conflict = detectPublicSchemaTypeConflict([
    { tableName: 'companies', columnName: 'id', dataType: 'bigint' },
    { tableName: 'companies', columnName: 'name', dataType: 'character varying' },
  ]);
  assert.deepEqual(conflict, {
    table: 'companies',
    column: 'id',
    expected: 'text',
    actual: 'bigint',
  });

  const ok = detectPublicSchemaTypeConflict([
    { tableName: 'companies', columnName: 'id', dataType: 'text' },
    { tableName: 'companies', columnName: 'name', dataType: 'character varying' },
    { tableName: 'companies', columnName: 'is_default', dataType: 'boolean' },
    { tableName: 'companies', columnName: 'license_price_amount', dataType: 'integer' },
  ]);
  assert.equal(ok, null);
});

test('buildForeignKeyStatements generates schema-relative foreign key constraints', () => {
  const fks = buildForeignKeyStatements();
  assert.ok(fks.length > 0);
  const contactsCompanyFk = fks.find((f) => f.label.includes('contacts_company_id_companies_id_fk'));
  assert.ok(contactsCompanyFk, 'contacts -> companies FK should exist');
  assert.ok(contactsCompanyFk.sqlText.includes('REFERENCES "companies" ("id") ON DELETE CASCADE'));
});

test('planWhatsAppConversationDedup selects canonical conversation and merges labels/agent', () => {
  const plans = planWhatsAppConversationDedup([
    {
      id: 'dup-empty',
      companyId: 'c1',
      contactId: 'cnt1',
      normSession: 'hris_hr',
      assignedAgentId: 'agent-1',
      assignedAgentName: 'Budi',
      labels: 'VIP',
      msgCount: 0,
      updatedAt: new Date('2026-11-18T14:11:05Z'),
      createdAt: new Date('2026-11-18T14:11:05Z'),
    },
    {
      id: 'main-no-agent',
      companyId: 'c1',
      contactId: 'cnt1',
      normSession: 'hris_hr',
      assignedAgentId: null,
      assignedAgentName: null,
      labels: 'Prospek',
      msgCount: 5,
      updatedAt: new Date('2026-11-18T14:11:00Z'),
      createdAt: new Date('2026-11-18T14:10:00Z'),
    },
    {
      id: 'other-session',
      companyId: 'c1',
      contactId: 'cnt1',
      normSession: 'wa_test',
      assignedAgentId: null,
      assignedAgentName: null,
      labels: null,
      msgCount: 2,
      updatedAt: new Date('2026-11-18T14:00:00Z'),
      createdAt: new Date('2026-11-18T14:00:00Z'),
    },
  ]);

  assert.equal(plans.length, 1);
  // Row with existing message history stays canonical while inheriting agent & labels from duplicate
  assert.equal(plans[0].canonicalId, 'main-no-agent');
  assert.deepEqual(plans[0].dupIds, ['dup-empty']);
  assert.equal(plans[0].fallbackAgentId, 'agent-1');
  assert.equal(plans[0].fallbackAgentName, 'Budi');
  assert.equal(plans[0].mergedLabels, 'Prospek, VIP');
});
