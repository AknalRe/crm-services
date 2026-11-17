import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_PERMISSIONS,
  DEFAULT_STARTER_ROLES,
  PERMISSION_CATALOG,
  expandPermissionsList,
  hasUserPermission,
  parseAgentPermissions,
} from './auth';

test('PERMISSION_CATALOG stays in sync with ALL_PERMISSIONS', () => {
  assert.equal(ALL_PERMISSIONS.length, 18);
  assert.equal(PERMISSION_CATALOG.length, ALL_PERMISSIONS.length);
  const catalogKeys = new Set(PERMISSION_CATALOG.map((item) => item.id));
  for (const key of ALL_PERMISSIONS) {
    assert.ok(catalogKeys.has(key), `Missing ${key} in PERMISSION_CATALOG`);
  }
});

test('expandPermissionsList enforces strict granular mode when requested', () => {
  const expanded = expandPermissionsList(['conversations', 'conversations.reply', 'contacts'], 'AGENT', true);
  assert.deepEqual(expanded.sort(), ['contacts', 'conversations', 'conversations.reply'].sort());
  assert.equal(expanded.includes('conversations.manage'), false);
  assert.equal(expanded.includes('conversations.view_all'), false);
  assert.equal(expanded.includes('contacts.delete'), false);
});

test('expandPermissionsList preserves backward compatibility for legacy coarse permissions', () => {
  const expanded = expandPermissionsList(['contacts', 'dashboard'], 'AGENT', false);
  assert.ok(expanded.includes('contacts'));
  assert.ok(expanded.includes('contacts.create'));
  assert.ok(expanded.includes('contacts.edit'));
  assert.equal(expanded.includes('contacts.delete'), false);
  assert.ok(expanded.includes('dashboard'));
  assert.ok(expanded.includes('dashboard.export'));
  assert.equal(expanded.includes('settings.edit'), false);
});

test('expandPermissionsList gives ADMIN all permissions', () => {
  const expanded = expandPermissionsList(['conversations'], 'ADMIN', true);
  assert.equal(expanded.length, ALL_PERMISSIONS.length);
});

test('parseAgentPermissions handles JSON string and dotted-key auto strict detection', () => {
  const parsed = parseAgentPermissions(JSON.stringify(['conversations', 'conversations.reply']), 'AGENT', false);
  assert.deepEqual(parsed.sort(), ['conversations', 'conversations.reply'].sort());
  assert.equal(parsed.includes('conversations.csat'), false);
});

test('hasUserPermission enforces role and granular permissions accurately', () => {
  assert.equal(
    hasUserPermission(
      {
        id: 'a1',
        name: 'Admin',
        email: 'admin@crm.local',
        role: 'ADMIN',
        permissions: [],
      },
      'settings.agents'
    ),
    true
  );

  const csUser = {
    id: 'u1',
    name: 'CS 1',
    email: 'cs1@crm.local',
    role: 'AGENT' as const,
    permissions: ['conversations', 'conversations.reply', 'contacts'] as any,
  };
  assert.equal(hasUserPermission(csUser, 'conversations.reply'), true);
  assert.equal(hasUserPermission(csUser, 'conversations.view_all'), false);
  assert.equal(hasUserPermission(csUser, 'contacts.delete'), false);
  assert.equal(hasUserPermission(null, 'dashboard'), false);
});

test('DEFAULT_STARTER_ROLES defines starter roles cleanly', () => {
  const ids = DEFAULT_STARTER_ROLES.map((r) => r.id);
  assert.deepEqual(ids, ['role_admin', 'role_supervisor', 'role_cs', 'role_content', 'role_auditor']);

  const adminRole = DEFAULT_STARTER_ROLES.find((r) => r.id === 'role_admin');
  assert.ok(adminRole);
  assert.equal(adminRole.permissions.length, ALL_PERMISSIONS.length);

  const auditorRole = DEFAULT_STARTER_ROLES.find((r) => r.id === 'role_auditor');
  assert.ok(auditorRole);
  assert.ok(auditorRole.permissions.includes('dashboard'));
  assert.equal(auditorRole.permissions.includes('contacts.delete'), false);
  assert.equal(auditorRole.permissions.includes('broadcasts.send'), false);
  assert.equal(auditorRole.permissions.includes('settings.edit'), false);
});
