import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react';
import api from '../services/api';
import { getApiBaseUrl } from '../services/paths';
import { ChannelAccount, OmnichannelType } from '../types';
import { Button } from '../components/ui/Button';
import { PlatformBrandIcon } from '../components/OmnichannelSettings';

export const PublicChannelConnectPage: React.FC = () => {
  const searchParams =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const token = searchParams?.get('token') || '';
  const oauthStatus = searchParams?.get('oauth') || '';
  const oauthMsg = searchParams?.get('msg') || '';
  const oauthCount = searchParams?.get('count') || '';
  const oauthChannel = searchParams?.get('channel') || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkMeta, setLinkMeta] = useState<{
    channel: OmnichannelType | 'META';
    label?: string | null;
    expiresAt: string;
    usedAt?: string | null;
    isExpired: boolean;
  } | null>(null);

  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [connectedAccount, setConnectedAccount] = useState<ChannelAccount | null>(null);
  const [showTelegramStep, setShowTelegramStep] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Token koneksi channel tidak ditemukan di URL.');
      setLoading(false);
      return;
    }
    api
      .getPublicConnectLink(token)
      .then((data) => {
        setLinkMeta(data);
        if (data.label) setName(data.label);
        if (data.channel === 'TELEGRAM') {
          setShowTelegramStep(true);
        }
      })
      .catch((err: any) => {
        setError(err.response?.data?.error || 'Tautan koneksi tidak valid atau sudah kedaluwarsa.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  const startClientOAuth = (targetChannel: string) => {
    const apiBase = getApiBaseUrl(window.location.pathname).replace(/\/+$/, '');
    window.location.href = `${apiBase}/channels/oauth/start?channel=${encodeURIComponent(targetChannel)}&connectToken=${encodeURIComponent(token)}`;
  };

  const handleSubmitTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !accountId.trim() || !accessToken.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.submitPublicConnectLink(token, {
        name: name.trim(),
        accountId: accountId.trim().replace(/^@+/, ''),
        accessToken: accessToken.trim(),
      });
      setConnectedAccount(created);
      setShowTelegramStep(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal menghubungkan akun channel.');
    } finally {
      setSubmitting(false);
    }
  };

  const tiles = [
    { ch: 'INSTAGRAM', title: 'Instagram', sub: 'Business atau Creator', mode: 'oauth' as const },
    { ch: 'THREADS', title: 'Threads', sub: 'Profil', mode: 'oauth' as const },
    { ch: 'FACEBOOK', title: 'Facebook', sub: 'Halaman', mode: 'oauth' as const },
    { ch: 'TELEGRAM', title: 'Telegram', sub: 'Bot & Channel', mode: 'telegram' as const },
  ].filter((t) => !linkMeta || linkMeta.channel === 'META' || linkMeta.channel === t.ch);

  return (
    <div className="min-h-screen supports-[height:100dvh]:min-h-dvh bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6 space-y-5">
        <div className="relative flex items-center justify-center">
          {showTelegramStep && linkMeta?.channel === 'META' && (
            <button
              type="button"
              onClick={() => setShowTelegramStep(false)}
              className="absolute left-0 p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="text-center">
            <h1 className="text-base font-bold text-gray-900">
              {showTelegramStep ? 'Hubungkan Bot Telegram' : 'Hubungkan akun baru'}
            </h1>
            {linkMeta?.label && (
              <div className="text-[11px] text-indigo-600 font-medium mt-0.5">{linkMeta.label}</div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-xs text-gray-500">Memeriksa tautan koneksi...</div>
        ) : error && !linkMeta ? (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : linkMeta?.isExpired ? (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              Tautan koneksi ini sudah kedaluwarsa. Minta admin CRM untuk membuat tautan baru.
            </span>
          </div>
        ) : linkMeta ? (
          <div className="space-y-4 text-xs">
            {oauthStatus === 'success' && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1 text-emerald-900">
                <div className="flex items-center gap-2 font-semibold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    {oauthCount ? `${oauthCount} Akun` : 'Akun'} {oauthChannel && oauthChannel !== 'META' ? oauthChannel : ''} Berhasil Terhubung!
                  </span>
                </div>
                <p className="text-[11px] text-emerald-800">
                  Akun Anda sudah aktif di CRM. Klik salah satu platform di bawah jika ingin menambah akun lainnya.
                </p>
              </div>
            )}

            {connectedAccount && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1 text-emerald-900">
                <div className="flex items-center gap-2 font-semibold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Akun {connectedAccount.name} Berhasil Terhubung!</span>
                </div>
              </div>
            )}

            {oauthStatus === 'error' && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{oauthMsg || 'Otorisasi gagal. Silakan pilih platform dan login kembali.'}</span>
              </div>
            )}

            {error && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700">
                {error}
              </div>
            )}

            {!showTelegramStep ? (
              <div
                className={`grid gap-3 ${
                  tiles.length === 1 ? 'grid-cols-1 max-w-xs mx-auto' : 'grid-cols-2 sm:grid-cols-4'
                }`}
              >
                {tiles.map((t) => (
                  <button
                    key={t.ch}
                    type="button"
                    onClick={() => {
                      if (t.mode === 'telegram') {
                        setShowTelegramStep(true);
                      } else {
                        startClientOAuth(t.ch);
                      }
                    }}
                    className="p-4 rounded-xl border border-gray-200 bg-gray-50/70 hover:bg-indigo-50/50 hover:border-indigo-300 transition-all flex flex-col items-center justify-center text-center gap-2.5 group"
                  >
                    <PlatformBrandIcon channel={t.ch} />
                    <div>
                      <div className="text-xs font-bold text-gray-900 group-hover:text-indigo-700">
                        {t.title}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">{t.sub}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <form onSubmit={handleSubmitTelegram} className="space-y-3">
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Nama Tampilan Bot</label>
                  <input
                    type="text"
                    required
                    placeholder="Mis. CS Toko Resmi"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Username Bot Telegram</label>
                  <input
                    type="text"
                    required
                    placeholder="Mis. tokoresmi_bot"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Token Bot dari @BotFather</label>
                  <input
                    type="password"
                    required
                    placeholder="Tempel token bot..."
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    className="w-full h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <Button type="submit" variant="primary" size="md" isLoading={submitting} className="w-full">
                  Hubungkan Telegram
                </Button>
              </form>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default PublicChannelConnectPage;
