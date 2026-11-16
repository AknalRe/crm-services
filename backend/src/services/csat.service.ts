import crypto from 'crypto';

export interface CsatCriterion {
  key: string;
  label: string;
  description?: string;
  required: boolean;
  isActive: boolean;
}

export interface CsatTextConfig {
  brandName: string;
  title: string;
  subtitle: string;
  greetingText: string;
  scaleLabels: Record<string, string>;
  feedbackLabel: string;
  feedbackPlaceholder: string;
  requireFeedbackOnLow: boolean;
  submitButtonText: string;
  thankYouTitle: string;
  thankYouMessage: string;
}

export interface CsatTargetProfile {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  matchWahaSessions: string[];
  matchChannels: string[];
  matchLabels: string[];
  ctaTemplate?: string;
  texts: CsatTextConfig;
  criteria: CsatCriterion[];
}

export interface CsatSurveyConfig {
  profiles: CsatTargetProfile[];
}

export interface CsatCriterionScoreDetail {
  key: string;
  label: string;
  score: number;
}

export interface CsatSnapshot {
  profileId: string;
  profileName: string;
  texts: CsatTextConfig;
  criteria: CsatCriterion[];
}

export const DEFAULT_CSAT_CTA_TEMPLATE =
  'Halo {nama_panggilan}, terima kasih telah menghubungi kami. Mohon bantuannya untuk memberikan penilaian layanan kami melalui tautan berikut:\n{link_csat}';

export function createDefaultCsatTexts(): CsatTextConfig {
  return {
    brandName: 'Layanan Pelanggan',
    title: 'Penilaian Layanan Pelanggan',
    subtitle: 'Customer Satisfaction (CSAT)',
    greetingText: 'Halo {nama_panggilan}, bagaimana pengalaman Anda dengan layanan kami?',
    scaleLabels: {
      '1': 'Sangat Kurang',
      '2': 'Kurang Memuaskan',
      '3': 'Cukup Baik',
      '4': 'Memuaskan',
      '5': 'Sangat Memuaskan',
    },
    feedbackLabel: 'Saran atau Masukan (Opsional)',
    feedbackPlaceholder: 'Ceritakan pengalaman Anda...',
    requireFeedbackOnLow: false,
    submitButtonText: 'Kirim Penilaian',
    thankYouTitle: 'Terima kasih, {nama_panggilan}!',
    thankYouMessage: 'Penilaian Anda sangat membantu kami meningkatkan kualitas layanan.',
  };
}

export function createDefaultCsatCriteria(): CsatCriterion[] {
  return [
    {
      key: 'keramahan',
      label: 'Keramahan & Sikap',
      description: 'Kesopanan, empati, dan sikap ramah tim saat melayani.',
      required: true,
      isActive: true,
    },
    {
      key: 'bahasa',
      label: 'Bahasa & Komunikasi',
      description: 'Kejelasan penyampaian dan tata bahasa yang mudah dipahami.',
      required: true,
      isActive: true,
    },
    {
      key: 'kecepatan',
      label: 'Kecepatan Respon',
      description: 'Kecepatan tanggapan dan waktu penyelesaian kendala.',
      required: true,
      isActive: true,
    },
    {
      key: 'solusi',
      label: 'Ketepatan Solusi',
      description: 'Seberapa membantu jawaban atau solusi yang diberikan.',
      required: true,
      isActive: true,
    },
  ];
}

export function createDefaultCsatSurveyConfig(): CsatSurveyConfig {
  return {
    profiles: [
      {
        id: 'default',
        name: 'Umum (Default)',
        isDefault: true,
        isActive: true,
        matchWahaSessions: [],
        matchChannels: [],
        matchLabels: [],
        ctaTemplate: '',
        texts: createDefaultCsatTexts(),
        criteria: createDefaultCsatCriteria(),
      },
    ],
  };
}

export function slugifyCriterionKey(raw: string, fallbackIdx = 1): string {
  const clean = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return clean || `aspek_${fallbackIdx}`;
}

function sanitizeStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return Array.from(
    new Set(
      val
        .map((v) => String(v || '').trim())
        .filter(Boolean)
    )
  );
}

export function sanitizeCsatTexts(raw: any): CsatTextConfig {
  const def = createDefaultCsatTexts();
  const src = raw && typeof raw === 'object' ? raw : {};
  const rawScale = src.scaleLabels && typeof src.scaleLabels === 'object' ? src.scaleLabels : {};
  const scaleLabels: Record<string, string> = {};
  for (const k of ['1', '2', '3', '4', '5']) {
    const val = String(rawScale[k] ?? '').trim();
    scaleLabels[k] = val || def.scaleLabels[k];
  }
  return {
    brandName: String(src.brandName ?? '').trim() || def.brandName,
    title: String(src.title ?? '').trim() || def.title,
    subtitle: String(src.subtitle ?? '').trim() || def.subtitle,
    greetingText: String(src.greetingText ?? '').trim() || def.greetingText,
    scaleLabels,
    feedbackLabel: String(src.feedbackLabel ?? '').trim() || def.feedbackLabel,
    feedbackPlaceholder: String(src.feedbackPlaceholder ?? '').trim() || def.feedbackPlaceholder,
    requireFeedbackOnLow: Boolean(src.requireFeedbackOnLow),
    submitButtonText: String(src.submitButtonText ?? '').trim() || def.submitButtonText,
    thankYouTitle: String(src.thankYouTitle ?? '').trim() || def.thankYouTitle,
    thankYouMessage: String(src.thankYouMessage ?? '').trim() || def.thankYouMessage,
  };
}

export function sanitizeCsatCriteria(raw: unknown): CsatCriterion[] {
  if (!Array.isArray(raw)) return createDefaultCsatCriteria();
  const seenKeys = new Set<string>();
  const out: CsatCriterion[] = [];

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== 'object') continue;
    const label = String((item as any).label ?? '').trim();
    if (!label) continue;
    let key = slugifyCriterionKey((item as any).key || label, i + 1);
    while (seenKeys.has(key)) {
      key = `${key}_${i + 1}`;
    }
    seenKeys.add(key);
    out.push({
      key,
      label: label.slice(0, 80),
      description: String((item as any).description ?? '').trim().slice(0, 200),
      required: (item as any).required !== false,
      isActive: (item as any).isActive !== false,
    });
  }

  return out.length > 0 ? out : createDefaultCsatCriteria();
}

export function sanitizeCsatSurveyConfig(raw: unknown): CsatSurveyConfig {
  const def = createDefaultCsatSurveyConfig();
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as any).profiles)) {
    return def;
  }

  const seenIds = new Set<string>();
  const profiles: CsatTargetProfile[] = [];
  let hasDefault = false;

  for (let i = 0; i < (raw as any).profiles.length; i++) {
    const item = (raw as any).profiles[i];
    if (!item || typeof item !== 'object') continue;
    const isDefault = Boolean(item.isDefault) && !hasDefault;
    if (isDefault) hasDefault = true;

    let id = isDefault
      ? 'default'
      : slugifyCriterionKey(item.id || item.name || `target_${i + 1}`, i + 1);
    if (!isDefault && id === 'default') id = `target_${i + 1}`;
    while (seenIds.has(id)) {
      id = `${id}_${crypto.randomBytes(2).toString('hex')}`;
    }
    seenIds.add(id);

    profiles.push({
      id,
      name: String(item.name ?? '').trim() || (isDefault ? 'Umum (Default)' : `Target ${i + 1}`),
      isDefault,
      isActive: isDefault ? true : item.isActive !== false,
      matchWahaSessions: isDefault ? [] : sanitizeStringArray(item.matchWahaSessions),
      matchChannels: isDefault
        ? []
        : sanitizeStringArray(item.matchChannels).map((c) => c.toUpperCase()),
      matchLabels: isDefault ? [] : sanitizeStringArray(item.matchLabels),
      ctaTemplate: String(item.ctaTemplate ?? '').trim(),
      texts: sanitizeCsatTexts(item.texts),
      criteria: sanitizeCsatCriteria(item.criteria),
    });
  }

  if (!hasDefault) {
    const defaultProfile = def.profiles[0];
    profiles.unshift(defaultProfile);
  }

  return { profiles };
}

export function parseCsatSurveyConfig(rawJson?: string | null): CsatSurveyConfig {
  if (!rawJson || !rawJson.trim()) {
    return createDefaultCsatSurveyConfig();
  }
  try {
    return sanitizeCsatSurveyConfig(JSON.parse(rawJson));
  } catch {
    return createDefaultCsatSurveyConfig();
  }
}

/**
 * Pick the most specific active CSAT profile matching conversation session, channel, or labels.
 */
export function resolveCsatProfileForConversation(
  config: CsatSurveyConfig,
  conv: {
    channel?: string | null;
    wahaSession?: string | null;
    labels?: string | null;
  }
): CsatTargetProfile {
  const convChannel = String(conv.channel || 'WHATSAPP').trim().toUpperCase();
  const convSession = String(conv.wahaSession || '').trim().toLowerCase();
  const convLabels = String(conv.labels || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  let bestProfile: CsatTargetProfile | null = null;
  let bestScore = -1;

  for (const profile of config.profiles) {
    if (profile.isDefault || !profile.isActive) continue;
    const hasCriteria = profile.criteria.some((c) => c.isActive);
    if (!hasCriteria) continue;

    const hasTargetCondition =
      profile.matchWahaSessions.length > 0 ||
      profile.matchChannels.length > 0 ||
      profile.matchLabels.length > 0;
    if (!hasTargetCondition) continue;

    let specificity = 0;

    if (profile.matchWahaSessions.length > 0) {
      const ok =
        Boolean(convSession) &&
        profile.matchWahaSessions.some((s) => s.toLowerCase() === convSession);
      if (!ok) continue;
      specificity += 4;
    }

    if (profile.matchChannels.length > 0) {
      const ok = profile.matchChannels.some((ch) => ch.toUpperCase() === convChannel);
      if (!ok) continue;
      specificity += 2;
    }

    if (profile.matchLabels.length > 0) {
      const ok = profile.matchLabels.some((lbl) => convLabels.includes(lbl.toLowerCase()));
      if (!ok) continue;
      specificity += 3;
    }

    if (specificity > bestScore) {
      bestScore = specificity;
      bestProfile = profile;
    }
  }

  if (bestProfile) return bestProfile;

  const fallback = config.profiles.find((p) => p.isDefault) || createDefaultCsatSurveyConfig().profiles[0];
  return fallback;
}

export function buildCsatSnapshot(profile: CsatTargetProfile): CsatSnapshot {
  const activeCriteria = profile.criteria.filter((c) => c.isActive);
  return {
    profileId: profile.id,
    profileName: profile.name,
    texts: sanitizeCsatTexts(profile.texts),
    criteria: activeCriteria.length > 0 ? activeCriteria : createDefaultCsatCriteria(),
  };
}

export function parseCsatSnapshot(snapshotJson?: string | null, fallbackConfig?: CsatSurveyConfig): CsatSnapshot {
  if (snapshotJson && snapshotJson.trim()) {
    try {
      const parsed = JSON.parse(snapshotJson);
      if (parsed && typeof parsed === 'object') {
        return {
          profileId: String(parsed.profileId || 'default'),
          profileName: String(parsed.profileName || 'Umum (Default)'),
          texts: sanitizeCsatTexts(parsed.texts),
          criteria: sanitizeCsatCriteria(parsed.criteria),
        };
      }
    } catch {
      // fall through
    }
  }
  const base = fallbackConfig || createDefaultCsatSurveyConfig();
  const def = base.profiles.find((p) => p.isDefault) || base.profiles[0];
  return buildCsatSnapshot(def);
}

export function renderCsatTexts(
  texts: CsatTextConfig,
  contactName: string
): CsatTextConfig {
  const cleanName = (contactName || 'Pelanggan').trim() || 'Pelanggan';
  const replaceTokens = (s: string) =>
    s
      .replace(/\{nama_panggilan\}/gi, cleanName)
      .replace(/\{nama_lengkap\}/gi, cleanName);

  return {
    ...texts,
    greetingText: replaceTokens(texts.greetingText),
    thankYouTitle: replaceTokens(texts.thankYouTitle),
    thankYouMessage: replaceTokens(texts.thankYouMessage),
  };
}

/**
 * Validate submitted criteria scores (1-5) against snapshot criteria and compute average & rounded star rating.
 */
export function computeCsatSubmission(params: {
  snapshot: CsatSnapshot;
  criteriaScores?: Record<string, unknown>;
  fallbackRating?: unknown;
  feedback?: string | null;
}): {
  rating: number;
  overallScore: number;
  normalizedScores: Record<string, number>;
  details: CsatCriterionScoreDetail[];
} {
  const { snapshot, criteriaScores, fallbackRating, feedback } = params;
  const activeCriteria = snapshot.criteria.filter((c) => c.isActive !== false);

  const normalizedScores: Record<string, number> = {};
  const details: CsatCriterionScoreDetail[] = [];

  if (criteriaScores && typeof criteriaScores === 'object') {
    for (const crit of activeCriteria) {
      const raw = criteriaScores[crit.key];
      if (raw === undefined || raw === null || raw === '') {
        if (crit.required) {
          throw new Error(`Penilaian untuk aspek "${crit.label}" wajib diisi (1 - 5).`);
        }
        continue;
      }
      const num = Number(raw);
      if (!Number.isInteger(num) || num < 1 || num > 5) {
        throw new Error(`Nilai untuk aspek "${crit.label}" harus berupa angka 1 sampai 5.`);
      }
      normalizedScores[crit.key] = num;
      details.push({ key: crit.key, label: crit.label, score: num });
    }
  }

  let overallScore: number;
  let rating: number;

  if (details.length > 0) {
    const sum = details.reduce((acc, item) => acc + item.score, 0);
    overallScore = Number((sum / details.length).toFixed(2));
    rating = Math.max(1, Math.min(5, Math.round(overallScore)));
  } else {
    const single = Number(fallbackRating);
    if (!Number.isInteger(single) || single < 1 || single > 5) {
      throw new Error('Penilaian harus berupa angka 1 sampai 5');
    }
    overallScore = single;
    rating = single;
    if (activeCriteria.length === 1) {
      normalizedScores[activeCriteria[0].key] = single;
      details.push({
        key: activeCriteria[0].key,
        label: activeCriteria[0].label,
        score: single,
      });
    }
  }

  if (snapshot.texts.requireFeedbackOnLow && overallScore <= 2 && !(feedback || '').trim()) {
    throw new Error('Mohon tuliskan saran atau masukan agar kami dapat memperbaiki layanan.');
  }

  return {
    rating,
    overallScore,
    normalizedScores,
    details,
  };
}

export function extractCsatCriteriaDetails(row: {
  snapshotJson?: string | null;
  criteriaScoresJson?: string | null;
}): CsatCriterionScoreDetail[] {
  if (!row.criteriaScoresJson || !row.criteriaScoresJson.trim()) return [];
  let scores: Record<string, unknown>;
  try {
    scores = JSON.parse(row.criteriaScoresJson);
  } catch {
    return [];
  }
  if (!scores || typeof scores !== 'object') return [];

  const labelMap = new Map<string, string>();
  const orderedKeys: string[] = [];
  if (row.snapshotJson && row.snapshotJson.trim()) {
    try {
      const snap = JSON.parse(row.snapshotJson);
      if (Array.isArray(snap?.criteria)) {
        for (const c of snap.criteria) {
          if (c?.key) {
            labelMap.set(String(c.key), String(c.label || c.key));
            orderedKeys.push(String(c.key));
          }
        }
      }
    } catch {
      // ignore invalid snapshot json
    }
  }

  const out: CsatCriterionScoreDetail[] = [];
  const seen = new Set<string>();

  for (const key of orderedKeys) {
    const num = Number(scores[key]);
    if (Number.isFinite(num) && num >= 1 && num <= 5) {
      out.push({ key, label: labelMap.get(key) || key, score: num });
      seen.add(key);
    }
  }

  for (const [key, val] of Object.entries(scores)) {
    if (seen.has(key)) continue;
    const num = Number(val);
    if (Number.isFinite(num) && num >= 1 && num <= 5) {
      out.push({ key, label: labelMap.get(key) || key, score: num });
    }
  }

  return out;
}
