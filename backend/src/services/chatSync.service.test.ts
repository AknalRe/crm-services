import test from 'node:test';
import assert from 'node:assert/strict';
import { computeNextWahaSyncDelayMs, resolveConversationSyncBumpUpdate } from './chatSync.service';

test('resolveConversationSyncBumpUpdate bumps conversation when newer message is synced', () => {
  const prevAt = new Date('2026-11-19T08:00:00.000Z');
  const nextAt = new Date('2026-11-19T08:05:00.000Z');
  const now = new Date('2026-11-19T08:05:02.000Z');

  const res = resolveConversationSyncBumpUpdate({
    isHistoricalOffset: false,
    convLastMessageAt: prevAt,
    latestMsgBody: 'Halo baru',
    latestMsgAt: nextAt,
    inserted: 1,
    newestInsertedBody: 'Halo baru',
    newestInsertedAt: nextAt,
    now,
  });

  assert.deepEqual(res, {
    lastMessage: 'Halo baru',
    lastMessageAt: nextAt,
    updatedAt: now,
  });
});

test('resolveConversationSyncBumpUpdate bumps conversation on clock-skew or sub-second truncation when new message inserted', () => {
  const prevAt = new Date('2026-11-19T08:05:10.750Z');
  const wahaSecAt = new Date('2026-11-19T08:05:10.000Z');
  const now = new Date('2026-11-19T08:05:12.000Z');

  const res = resolveConversationSyncBumpUpdate({
    isHistoricalOffset: false,
    convLastMessageAt: prevAt,
    latestMsgBody: null,
    latestMsgAt: prevAt,
    inserted: 1,
    newestInsertedBody: 'Pesan dari HP',
    newestInsertedAt: wahaSecAt,
    now,
  });

  assert.deepEqual(res, {
    lastMessage: 'Pesan dari HP',
    lastMessageAt: prevAt,
    updatedAt: now,
  });
});

test('resolveConversationSyncBumpUpdate does not bump when loading historical offset', () => {
  const res = resolveConversationSyncBumpUpdate({
    isHistoricalOffset: true,
    convLastMessageAt: new Date('2026-11-19T08:05:10.000Z'),
    latestMsgBody: 'Pesan lama',
    latestMsgAt: new Date('2026-11-18T08:05:10.000Z'),
    inserted: 10,
    newestInsertedBody: 'Pesan lama',
    newestInsertedAt: new Date('2026-11-18T08:05:10.000Z'),
  });

  assert.equal(res, null);
});

test('resolveConversationSyncBumpUpdate does not bump when nothing was inserted', () => {
  const res = resolveConversationSyncBumpUpdate({
    isHistoricalOffset: false,
    convLastMessageAt: new Date('2026-11-19T08:05:10.000Z'),
    latestMsgBody: null,
    latestMsgAt: new Date('2026-11-19T08:05:10.000Z'),
    inserted: 0,
    newestInsertedBody: null,
    newestInsertedAt: null,
  });

  assert.equal(res, null);
});

test('computeNextWahaSyncDelayMs slows polling when webhooks are healthy and backs off on slow WAHA responses', () => {
  const healthy = computeNextWahaSyncDelayMs({
    hasRecentWebhook: true,
    durationMs: 250,
    failed: false,
    consecutiveSlowOrError: 2,
  });
  assert.deepEqual(healthy, { delayMs: 45_000, nextSlowStreak: 0 });

  const fallback = computeNextWahaSyncDelayMs({
    hasRecentWebhook: false,
    durationMs: 180,
    failed: false,
    consecutiveSlowOrError: 0,
  });
  assert.deepEqual(fallback, { delayMs: 25_000, nextSlowStreak: 0 });

  const slow1 = computeNextWahaSyncDelayMs({
    hasRecentWebhook: true,
    durationMs: 5_200,
    failed: false,
    consecutiveSlowOrError: 0,
  });
  assert.deepEqual(slow1, { delayMs: 60_000, nextSlowStreak: 1 });

  const slow2 = computeNextWahaSyncDelayMs({
    hasRecentWebhook: true,
    durationMs: 200,
    failed: true,
    consecutiveSlowOrError: 1,
  });
  assert.deepEqual(slow2, { delayMs: 120_000, nextSlowStreak: 2 });

  const capped = computeNextWahaSyncDelayMs({
    hasRecentWebhook: false,
    durationMs: 14_000,
    failed: true,
    consecutiveSlowOrError: 4,
  });
  assert.deepEqual(capped, { delayMs: 180_000, nextSlowStreak: 4 });
});
