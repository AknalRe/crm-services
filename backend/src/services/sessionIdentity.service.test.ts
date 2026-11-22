import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionIdentityService } from './sessionIdentity.service';

test('SessionIdentityService enforces switch limits and allows restoring last identity', async () => {
  const companyId = 'test_co_' + Date.now();
  const session = 'cs_sales';
  const limit = 2; // Maksimal 2x ganti nomor

  // 1. Initial registration
  const res1 = await SessionIdentityService.evaluateSessionIdentity(
    companyId,
    session,
    '62811111111',
    limit
  );
  assert.equal(res1.allowed, true);
  assert.equal(res1.switchCount, 0);
  assert.equal(res1.lastIdentity, '62811111111');
  assert.equal(res1.isSwitch, false);

  // 2. Reconnect same number -> no switch increment
  const res2 = await SessionIdentityService.evaluateSessionIdentity(
    companyId,
    session,
    '+62 811-1111-11',
    limit
  );
  assert.equal(res2.allowed, true);
  assert.equal(res2.switchCount, 0);

  // 3. Logout
  await SessionIdentityService.recordSessionLogout(companyId, session);
  const infoAfterLogout = await SessionIdentityService.getIdentityInfo(companyId, session, limit);
  assert.equal(infoAfterLogout.currentIdentity, null);
  assert.equal(infoAfterLogout.lastIdentity, '62811111111');

  // 4. First switch: login with 62822222222 (switch 1 of 2)
  const res3 = await SessionIdentityService.evaluateSessionIdentity(
    companyId,
    session,
    '62822222222',
    limit
  );
  assert.equal(res3.allowed, true);
  assert.equal(res3.isSwitch, true);
  assert.equal(res3.switchCount, 1);
  assert.equal(res3.lastIdentity, '62822222222');

  // 5. Second switch: login with 62833333333 (switch 2 of 2, limit reached!)
  const res4 = await SessionIdentityService.simulateSwitchIdentity(
    companyId,
    session,
    '62833333333',
    limit
  );
  assert.equal(res4.allowed, true);
  assert.equal(res4.isSwitch, true);
  assert.equal(res4.switchCount, 2);
  assert.equal(res4.lastIdentity, '62833333333');

  // 6. Third switch attempt: login with 62844444444 -> EXCEEDED LIMIT, MUST BE BLOCKED!
  const res5 = await SessionIdentityService.simulateSwitchIdentity(
    companyId,
    session,
    '62844444444',
    limit
  );
  assert.equal(res5.allowed, false);
  assert.equal(res5.switchCount, 2);
  assert.equal(res5.lastIdentity, '62833333333');
  assert.match(res5.error || '', /Batas maksimal penggantian identitas sesi \(2x\) telah tercapai/);

  // 7. Restore to last identity (62833333333) -> MUST BE ALLOWED!
  const res6 = await SessionIdentityService.evaluateSessionIdentity(
    companyId,
    session,
    '62833333333',
    limit
  );
  assert.equal(res6.allowed, true);
  assert.equal(res6.isRestored, true);
  assert.equal(res6.switchCount, 2); // switch count does not increment on restore
  assert.equal(res6.currentIdentity, '62833333333');

  // 8. simulateRestoreLastIdentity helper also succeeds
  const res7 = await SessionIdentityService.simulateRestoreLastIdentity(companyId, session);
  assert.equal(res7.allowed, true);
  assert.equal(res7.currentIdentity, '62833333333');

  // Clean up
  await SessionIdentityService.resetIdentityHistory(companyId, session);
  const infoAfterReset = await SessionIdentityService.getIdentityInfo(companyId, session, limit);
  assert.equal(infoAfterReset.switchCount, 0);
  assert.equal(infoAfterReset.lastIdentity, null);
});
