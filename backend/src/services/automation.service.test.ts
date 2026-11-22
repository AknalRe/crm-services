import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldAutoResolveByLastDirection,
  shouldSendCsatOnAutoResolve,
} from './automation.service';

test('shouldAutoResolveByLastDirection only allows OUTBOUND last chat message', () => {
  assert.equal(shouldAutoResolveByLastDirection('OUTBOUND'), true);
  assert.equal(shouldAutoResolveByLastDirection('outbound'), true);
  assert.equal(shouldAutoResolveByLastDirection('INBOUND'), false);
  assert.equal(shouldAutoResolveByLastDirection('SYSTEM'), false);
  assert.equal(shouldAutoResolveByLastDirection(null), false);
  assert.equal(shouldAutoResolveByLastDirection(undefined), false);
});

test('shouldSendCsatOnAutoResolve prevents duplicate CSAT in the same conversation cycle', () => {
  assert.equal(
    shouldSendCsatOnAutoResolve({
      settingEnabled: false,
      csatSentAt: null,
      lastInboundAt: '2026-11-20T10:00:00Z',
    }),
    false
  );

  assert.equal(
    shouldSendCsatOnAutoResolve({
      settingEnabled: true,
      csatSentAt: null,
      lastInboundAt: '2026-11-20T10:00:00Z',
    }),
    true
  );

  // Already sent CSAT after customer's last message -> do not duplicate
  assert.equal(
    shouldSendCsatOnAutoResolve({
      settingEnabled: true,
      csatSentAt: '2026-11-20T12:00:00Z',
      lastInboundAt: '2026-11-20T10:00:00Z',
    }),
    false
  );

  // Customer reopened chat after previous CSAT -> allow new CSAT
  assert.equal(
    shouldSendCsatOnAutoResolve({
      settingEnabled: true,
      csatSentAt: '2026-11-20T10:00:00Z',
      lastInboundAt: '2026-11-21T09:00:00Z',
    }),
    true
  );
});
