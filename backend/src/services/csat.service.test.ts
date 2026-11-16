import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCsatSnapshot,
  computeCsatSubmission,
  createDefaultCsatSurveyConfig,
  extractCsatCriteriaDetails,
  resolveCsatProfileForConversation,
  sanitizeCsatSurveyConfig,
} from './csat.service';

test('resolveCsatProfileForConversation picks most specific active target or falls back to default', () => {
  const cfg = sanitizeCsatSurveyConfig({
    profiles: [
      ...createDefaultCsatSurveyConfig().profiles,
      {
        id: 'hris_hr',
        name: 'Target HRIS',
        isDefault: false,
        isActive: true,
        matchWahaSessions: ['HRIS_HR'],
        matchChannels: ['WHATSAPP'],
        matchLabels: [],
        criteria: [{ key: 'respon_hr', label: 'Respon Tim HR', required: true, isActive: true }],
      },
      {
        id: 'komplain_label',
        name: 'Penanganan Komplain',
        isDefault: false,
        isActive: true,
        matchWahaSessions: [],
        matchChannels: [],
        matchLabels: ['Komplain'],
        criteria: [{ key: 'solusi', label: 'Ketuntasan Solusi', required: true, isActive: true }],
      },
    ],
  });

  const matchedHr = resolveCsatProfileForConversation(cfg, {
    channel: 'WHATSAPP',
    wahaSession: 'HRIS_HR',
    labels: 'Komplain',
  });
  assert.equal(matchedHr.id, 'hris_hr');

  const matchedLabel = resolveCsatProfileForConversation(cfg, {
    channel: 'WHATSAPP',
    wahaSession: 'LAINNYA',
    labels: 'VIP, Komplain',
  });
  assert.equal(matchedLabel.id, 'komplain_label');

  const fallbackDefault = resolveCsatProfileForConversation(cfg, {
    channel: 'WHATSAPP',
    wahaSession: 'WA_SALES',
    labels: 'Umum',
  });
  assert.equal(fallbackDefault.id, 'default');
});

test('computeCsatSubmission computes accurate average across 1-5 criteria and enforces required rules', () => {
  const cfg = createDefaultCsatSurveyConfig();
  const profile = cfg.profiles[0];
  profile.texts.requireFeedbackOnLow = true;
  const snapshot = buildCsatSnapshot(profile);

  const ok = computeCsatSubmission({
    snapshot,
    criteriaScores: {
      keramahan: 5,
      bahasa: 4,
      kecepatan: 5,
      solusi: 4,
    },
    feedback: 'Pelayanan sangat sopan dan jelas',
  });

  assert.equal(ok.overallScore, 4.5);
  assert.equal(ok.rating, 5);
  assert.equal(ok.details.length, 4);
  assert.deepEqual(ok.normalizedScores, {
    keramahan: 5,
    bahasa: 4,
    kecepatan: 5,
    solusi: 4,
  });

  assert.throws(
    () =>
      computeCsatSubmission({
        snapshot,
        criteriaScores: {
          keramahan: 5,
          bahasa: 4,
          kecepatan: 4,
        },
      }),
    /wajib diisi/
  );

  assert.throws(
    () =>
      computeCsatSubmission({
        snapshot,
        criteriaScores: {
          keramahan: 1,
          bahasa: 2,
          kecepatan: 2,
          solusi: 2,
        },
        feedback: '',
      }),
    /tuliskan saran/i
  );

  const legacy = computeCsatSubmission({
    snapshot,
    fallbackRating: 4,
    feedback: '',
  });
  assert.equal(legacy.overallScore, 4);
  assert.equal(legacy.rating, 4);
});

test('extractCsatCriteriaDetails preserves snapshot labels for historical reporting', () => {
  const snapshot = buildCsatSnapshot(createDefaultCsatSurveyConfig().profiles[0]);
  const details = extractCsatCriteriaDetails({
    snapshotJson: JSON.stringify(snapshot),
    criteriaScoresJson: JSON.stringify({
      keramahan: 5,
      bahasa: 4,
    }),
  });

  assert.deepEqual(details, [
    { key: 'keramahan', label: 'Keramahan & Sikap', score: 5 },
    { key: 'bahasa', label: 'Bahasa & Komunikasi', score: 4 },
  ]);
});
