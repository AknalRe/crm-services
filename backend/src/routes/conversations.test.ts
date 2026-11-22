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

import { BroadcastService } from '../services/broadcast.service';

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

test('BroadcastService.personalizeMessage substitutes contact variables and falls back cleanly', () => {
  const template = 'Halo {nama_panggilan}, nama lengkap: {nama_lengkap}, no: {nomor_whatsapp}, alamat: {alamat}';
  const personalized = BroadcastService.personalizeMessage(template, {
    namaLengkap: 'Budi Santoso',
    namaPanggilan: 'Budi',
    nomorWhatsapp: '6281234567890',
    alamat: 'Jl. Merdeka No. 1',
  });
  assert.equal(personalized, 'Halo Budi, nama lengkap: Budi Santoso, no: 6281234567890, alamat: Jl. Merdeka No. 1');

  const fallback = BroadcastService.personalizeMessage('Halo {nama_panggilan} ({nama_lengkap})', {
    namaLengkap: 'Siti Rahma',
  });
  assert.equal(fallback, 'Halo Siti (Siti Rahma)');

  const emptyFallback = BroadcastService.personalizeMessage('Halo {nama_panggilan}', {});
  assert.equal(emptyFallback, 'Halo Kak');
});
