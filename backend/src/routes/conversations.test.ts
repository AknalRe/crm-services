import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectMentionTokens,
  selectWhatsAppConversationForSession,
} from './conversations';

test('selectWhatsAppConversationForSession matches requested session case-insensitively', () => {
  const rows = [
    { id: 'c1', wahaSession: 'sales', isGroup: false, externalThreadId: null },
    { id: 'c2', wahaSession: 'CS-Utama', isGroup: false, externalThreadId: null },
  ];
  const matched = selectWhatsAppConversationForSession(rows, 'cs-utama');
  assert.equal(matched?.id, 'c2');
});

test('selectWhatsAppConversationForSession does not reuse conversation belonging to a different session', () => {
  const rows = [
    { id: 'c1', wahaSession: 'sales', isGroup: false, externalThreadId: null },
  ];
  const matched = selectWhatsAppConversationForSession(rows, 'cs');
  assert.equal(matched, undefined);
});

test('selectWhatsAppConversationForSession falls back to unassigned legacy conversation', () => {
  const rows = [
    { id: 'c1', wahaSession: 'sales', isGroup: false, externalThreadId: null },
    { id: 'c-legacy', wahaSession: null, isGroup: false, externalThreadId: null },
  ];
  const matched = selectWhatsAppConversationForSession(rows, 'cs');
  assert.equal(matched?.id, 'c-legacy');
});

test('selectWhatsAppConversationForSession ignores group conversations when direct chat exists', () => {
  const rows = [
    { id: 'g1', wahaSession: 'sales', isGroup: true, externalThreadId: '12345@g.us' },
    { id: 'c1', wahaSession: 'sales', isGroup: false, externalThreadId: null },
  ];
  assert.equal(selectWhatsAppConversationForSession(rows, 'sales')?.id, 'c1');
  assert.equal(selectWhatsAppConversationForSession(rows, null)?.id, 'c1');
});

test('collectMentionTokens extracts phone and @lid mentions from text and metadataJson', () => {
  const tokens = collectMentionTokens(
    'Halo @6281234567890, @+207386824446190 dan @99887766554433 tolong cek',
    JSON.stringify({ mentions: ['6281234567890@c.us', '99887766554433@lid'] }),
    'Kutipan untuk @6285155431301'
  );
  assert.equal(tokens.get('6281234567890'), '6281234567890@c.us');
  assert.equal(tokens.get('99887766554433'), '99887766554433@lid');
  assert.equal(tokens.has('207386824446190'), true);
  assert.equal(tokens.has('6285155431301'), true);
});
