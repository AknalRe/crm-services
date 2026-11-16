import React, { useEffect, useState } from 'react';
import { Star, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../services/api';
import { Button } from '../components/ui/Button';

const RATING_LABELS: Record<number, string> = {
  1: 'Sangat Kurang',
  2: 'Kurang Memuaskan',
  3: 'Cukup Baik',
  4: 'Memuaskan',
  5: 'Sangat Memuaskan',
};

export const PublicCsatPage: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const token = (params.get('token') || '').trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contactName, setContactName] = useState('Pelanggan');
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
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
        if (data.alreadyRated && data.rating) {
          setRating(data.rating);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || rating < 1 || rating > 5 || submitting) return;
    setSubmitting(true);
    try {
      await api.submitPublicCsat(token, { rating, feedback: feedback.trim() || undefined });
      setSubmitted(true);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Gagal menyimpan penilaian.');
    } finally {
      setSubmitting(false);
    }
  };

  const displayRating = hoverRating || rating;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-5">
        <div className="pb-4 border-b border-gray-200">
          <h1 className="text-base font-semibold text-gray-900">Penilaian Layanan Pelanggan</h1>
          <p className="text-xs text-gray-500">Customer Satisfaction (CSAT)</p>
        </div>

        {loading ? (
          <div className="py-10 text-center text-xs text-gray-500">Memuat formulir penilaian...</div>
        ) : error ? (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : submitted ? (
          <div className="py-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">
              Terima kasih, {contactName}!
            </h2>
            <p className="text-xs text-gray-500">
              Penilaian Anda sangat membantu kami meningkatkan kualitas layanan.
            </p>
            <div className="flex items-center justify-center gap-1 pt-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-6 h-6 ${
                    star <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'
                  }`}
                />
              ))}
            </div>
            {feedback && (
              <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-3 mt-2">
                "{feedback}"
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <p className="text-sm text-gray-800">
                Halo <strong>{contactName}</strong>, bagaimana pengalaman Anda dengan layanan kami?
              </p>
            </div>

            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(star)}
                    className="p-1.5 rounded-lg hover:bg-amber-50 transition-colors focus:outline-none"
                    aria-label={`Beri ${star} bintang`}
                  >
                    <Star
                      className={`w-8 h-8 transition-colors ${
                        star <= displayRating
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-gray-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
              <p className="text-xs font-medium text-indigo-700 min-h-[18px]">
                {displayRating > 0 ? RATING_LABELS[displayRating] : 'Pilih jumlah bintang (1 - 5)'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Saran atau Masukan (Opsional)
              </label>
              <textarea
                rows={3}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Ceritakan pengalaman Anda..."
                className="w-full p-3 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full justify-center"
              isLoading={submitting}
              disabled={rating < 1}
            >
              Kirim Penilaian
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default PublicCsatPage;
