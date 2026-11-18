import React, { useEffect, useState } from 'react';
import { Star, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../services/api';
import { CsatCriterion, CsatCriterionScoreDetail, CsatTextConfig } from '../types';
import { Button } from '../components/ui/Button';

const DEFAULT_SCALE_LABELS: Record<string, string> = {
  '1': 'Sangat Kurang',
  '2': 'Kurang Memuaskan',
  '3': 'Cukup Baik',
  '4': 'Memuaskan',
  '5': 'Sangat Memuaskan',
};

const DEFAULT_TEXTS: CsatTextConfig = {
  brandName: 'Survei Kepuasan',
  title: 'Penilaian Layanan',
  subtitle: 'Masukan Anda membantu kami menjaga kualitas layanan.',
  greetingText: 'Halo, bagaimana pengalaman Anda dengan layanan kami?',
  scaleLabels: DEFAULT_SCALE_LABELS,
  feedbackLabel: 'Saran atau Masukan (Opsional)',
  feedbackPlaceholder: 'Ceritakan pengalaman Anda...',
  requireFeedbackOnLow: false,
  submitButtonText: 'Kirim Penilaian',
  thankYouTitle: 'Terima kasih!',
  thankYouMessage: 'Penilaian Anda sangat membantu kami meningkatkan kualitas layanan.',
};

export const PublicCsatPage: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const token = (params.get('token') || '').trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [contactName, setContactName] = useState('Pelanggan');
  const [agentName, setAgentName] = useState<string | null>(null);
  const [texts, setTexts] = useState<CsatTextConfig>(DEFAULT_TEXTS);
  const [criteria, setCriteria] = useState<CsatCriterion[]>([]);
  const [criteriaScores, setCriteriaScores] = useState<Record<string, number>>({});
  const [hoverScores, setHoverScores] = useState<Record<string, number>>({});
  const [submittedOverall, setSubmittedOverall] = useState<number>(0);
  const [submittedDetails, setSubmittedDetails] = useState<CsatCriterionScoreDetail[]>([]);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Tautan penilaian tidak memiliki token yang valid.');
      setLoading(false);
      return;
    }

    api
      .getPublicCsat(token)
      .then((data) => {
        setContactName(data.contactName || 'Pelanggan');
        setAgentName(data.agentName || null);
        if (data.texts) {
          setTexts(data.texts);
          if (typeof document !== 'undefined') {
            document.title = data.texts.title || 'Penilaian Layanan';
          }
        }
        const crits = Array.isArray(data.criteria) && data.criteria.length > 0
          ? data.criteria
          : [
            {
              key: 'umum',
              label: 'Kepuasan Layanan',
              required: true,
              isActive: true,
            },
          ];
        setCriteria(crits);

        if (data.alreadyRated && data.rating) {
          setSubmittedOverall(data.overallScore ?? data.rating);
          if (data.criteriaScores) setCriteriaScores(data.criteriaScores);
          if (data.criteriaDetails) setSubmittedDetails(data.criteriaDetails);
          setFeedback(data.feedback || '');
          setSubmitted(true);
        }
        setError(null);
      })
      .catch((err: any) => {
        setError(
          err?.response?.data?.error || 'Tautan penilaian tidak ditemukan atau sudah kedaluwarsa.'
        );
      })
      .finally(() => setLoading(false));
  }, [token]);

  const filledValues = criteria
    .map((c) => criteriaScores[c.key])
    .filter((v): v is number => typeof v === 'number' && v >= 1 && v <= 5);
  const liveAverage =
    filledValues.length > 0
      ? Number((filledValues.reduce((a, b) => a + b, 0) / filledValues.length).toFixed(2))
      : 0;
  const missingRequired = criteria.some((c) => c.required && !criteriaScores[c.key]);
  const requiresComment = Boolean(texts.requireFeedbackOnLow && liveAverage > 0 && liveAverage <= 2);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || missingRequired || submitting) return;
    if (requiresComment && !feedback.trim()) {
      setSubmitError('Mohon tuliskan saran atau masukan untuk membantu kami memperbaiki layanan.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.submitPublicCsat(token, {
        criteriaScores,
        rating: liveAverage > 0 ? Math.round(liveAverage) : undefined,
        feedback: feedback.trim() || undefined,
      });
      const resultData = res?.data;
      setSubmittedOverall(resultData?.overallScore ?? liveAverage);
      setSubmittedDetails(
        Array.isArray(resultData?.criteriaDetails)
          ? resultData.criteriaDetails
          : criteria
            .filter((c) => criteriaScores[c.key])
            .map((c) => ({ key: c.key, label: c.label, score: criteriaScores[c.key] }))
      );
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err?.response?.data?.error || 'Gagal menyimpan penilaian.');
    } finally {
      setSubmitting(false);
    }
  };

  const scaleMap = texts.scaleLabels || DEFAULT_SCALE_LABELS;
  const brandNorm = String(texts.brandName || '').trim();
  const titleNorm = String(texts.title || '').trim();
  const showBrandKicker = Boolean(
    brandNorm && !titleNorm.toLowerCase().includes(brandNorm.toLowerCase())
  );
  const greetingMentionsContact = Boolean(
    contactName && String(texts.greetingText || '').toLowerCase().includes(contactName.toLowerCase())
  );

  return (
    <div className="w-full min-h-screen supports-[height:100dvh]:min-h-dvh bg-slate-50 flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-lg mx-auto bg-white border border-gray-200 rounded-xl shadow-sm p-4 sm:p-6 space-y-4 sm:space-y-5">
        <div className="pb-4 border-b border-gray-200">
          {showBrandKicker && (
            <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 mb-0.5">
              {brandNorm}
            </div>
          )}
          <h1 className="text-base font-semibold text-gray-900">{titleNorm || 'Penilaian Layanan'}</h1>
          {(texts.subtitle || agentName) && (
            <div className="flex flex-wrap items-center justify-between gap-2 mt-0.5">
              {texts.subtitle ? (
                <p className="text-xs text-gray-500">{texts.subtitle}</p>
              ) : (
                <span />
              )}
              {agentName && (
                <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[11px] font-medium border border-gray-200">
                  Dilayani oleh: {agentName}
                </span>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="py-10 text-center text-xs text-gray-500">Memuat formulir penilaian...</div>
        ) : error ? (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : submitted ? (
          <div className="py-4 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-gray-900">{texts.thankYouTitle}</h2>
              <p className="text-xs text-gray-500">{texts.thankYouMessage}</p>
            </div>

            <div className="p-3.5 rounded-lg bg-amber-50/70 border border-amber-200 space-y-2">
              <div className="text-[11px] text-amber-800 font-medium">Nilai Rata-rata Keseluruhan</div>
              <div className="flex items-center justify-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-6 h-6 ${star <= Math.round(submittedOverall)
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-gray-200'
                      }`}
                  />
                ))}
                <span className="ml-1.5 text-sm font-mono font-bold text-amber-900">
                  {submittedOverall.toFixed(1)} / 5.0
                </span>
              </div>
              {submittedDetails.length > 0 && (
                <div className="pt-2 border-t border-amber-200/80 space-y-1 text-left">
                  {submittedDetails.map((d) => (
                    <div key={d.key} className="flex items-center justify-between text-xs text-gray-700">
                      <span>{d.label}</span>
                      <span className="inline-flex items-center gap-1 font-mono font-semibold text-amber-900">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                        {d.score}/5
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {feedback && (
              <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-3">
                "{feedback}"
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-gray-800 leading-relaxed">{texts.greetingText}</p>

            <div className="space-y-3">
              {criteria.map((crit) => {
                const selected = criteriaScores[crit.key] || 0;
                const hovered = hoverScores[crit.key] || 0;
                const displayVal = hovered || selected;
                return (
                  <div
                    key={crit.key}
                    className="p-3.5 rounded-lg border border-gray-200 bg-gray-50/50 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-gray-900">
                          {crit.label}
                          {crit.required && <span className="text-red-500 ml-0.5">*</span>}
                        </div>
                        {crit.description && (
                          <p className="text-[11px] text-gray-500 mt-0.5">{crit.description}</p>
                        )}
                      </div>
                      {displayVal > 0 && (
                        <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-medium shrink-0">
                          {scaleMap[String(displayVal)] || `${displayVal}/5`}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 pt-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onMouseEnter={() =>
                            setHoverScores((prev) => ({ ...prev, [crit.key]: star }))
                          }
                          onMouseLeave={() =>
                            setHoverScores((prev) => ({ ...prev, [crit.key]: 0 }))
                          }
                          onClick={() =>
                            setCriteriaScores((prev) => ({ ...prev, [crit.key]: star }))
                          }
                          className="p-1 rounded-md hover:bg-amber-50 transition-colors focus:outline-none"
                          aria-label={`${crit.label}: ${star} bintang`}
                        >
                          <Star
                            className={`w-7 h-7 transition-colors ${star <= displayVal
                                ? 'text-amber-400 fill-amber-400'
                                : 'text-gray-300'
                              }`}
                          />
                        </button>
                      ))}
                      <span className="ml-auto text-[11px] font-mono text-gray-400">
                        {selected > 0 ? `${selected}/5` : '-'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {liveAverage > 0 && criteria.length > 1 && (
              <div className="px-3.5 py-2.5 rounded-lg bg-indigo-50/70 border border-indigo-200 flex items-center justify-between text-xs">
                <span className="font-medium text-indigo-900">Rata-rata Penilaian Anda</span>
                <span className="font-mono font-bold text-indigo-700">
                  {liveAverage.toFixed(2)} / 5.0
                </span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                {texts.feedbackLabel}
                {requiresComment && <span className="text-red-600 ml-1">(Wajib)</span>}
              </label>
              <textarea
                rows={3}
                required={requiresComment}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder={texts.feedbackPlaceholder}
                className="w-full p-3 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            {submitError && (
              <div className="p-2.5 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full justify-center"
              isLoading={submitting}
              disabled={missingRequired}
            >
              {texts.submitButtonText || 'Kirim Penilaian'}
            </Button>

            <div className="text-[11px] text-center text-gray-400">
              {!greetingMentionsContact && contactName ? `Kepada ${contactName} • ` : ''}
              Skala 1 (Terendah) hingga 5 (Terbaik)
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default PublicCsatPage;
