import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '../services/api';
import { ChannelAccount, OmnichannelType } from '../types';
import { Button } from '../components/ui/Button';

export const PublicChannelConnectPage: React.FC = () => {
  const searchParams =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const token = searchParams?.get('token') || '';
  const oauthStatus = searchParams?.get('oauth') || '';
  const oauthMsg = searchParams?.get('msg') || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkMeta, setLinkMeta] = useState<{
    channel: OmnichannelType;
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
      })
      .catch((err: any) => {
        setError(err.response?.data?.error || 'Tautan koneksi tidak valid atau sudah kedaluwarsa.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !accountId.trim() || !accessToken.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.submitPublicConnectLink(token, {
        name: name.trim(),
        accountId: accountId.trim(),
        accessToken: accessToken.trim(),
      });
      setConnectedAccount(created);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal menghubungkan akun channel.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen supports-[height:100dvh]:min-h-dvh bg-gray-50 flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-lg bg-white rounded-lg border border-gray-200 p-4 sm:p-6 space-y-4 sm:space-y-5">
        <div className="border-b border-gray-200 pb-4">
          <h1 className="text-base font-semibold text-gray-900">
            Hubungkan Akun Omnichannel CRM
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Tautkan akun media sosial atau bot Anda tanpa perlu membagikan kata sandi akun CRM.
          </p>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-gray-500">Memeriksa tautan koneksi...</div>
        ) : oauthStatus === 'success' ? (
          <div className="p-4 rounded-md bg-emerald-50 border border-emerald-200 space-y-2 text-xs text-emerald-900">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Akun {linkMeta?.channel || 'Omnichannel'} Berhasil Terhubung via OAuth!</span>
            </div>
            <p>
              Integrasi selesai dan akun Anda sudah aktif di dashboard Live Chat CRM. Anda dapat menutup halaman ini.
            </p>
          </div>
        ) : connectedAccount ? (
          <div className="p-4 rounded-md bg-emerald-50 border border-emerald-200 space-y-2 text-xs text-emerald-900">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Akun {connectedAccount.channel} Berhasil Terhubung!</span>
            </div>
            <p>
              Akun <strong>{connectedAccount.name}</strong> (<code className="font-mono">{connectedAccount.accountId}</code>) sekarang aktif di Live Chat CRM.
            </p>
            {connectedAccount.verifyToken && (
              <div className="pt-1">
                <span className="block text-[11px] text-emerald-800">Verify Token Webhook:</span>
                <code className="block mt-0.5 p-2 rounded bg-white border border-emerald-200 font-mono text-[11px] select-all">
                  {connectedAccount.verifyToken}
                </code>
              </div>
            )}
          </div>
        ) : error && !linkMeta ? (
          <div className="p-4 rounded-md bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : linkMeta?.usedAt || linkMeta?.isExpired ? (
          <div className="p-4 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              {linkMeta.usedAt
                ? 'Tautan koneksi ini sudah digunakan untuk menghubungkan akun.'
                : 'Tautan koneksi ini sudah kedaluwarsa. Minta admin CRM untuk membuat tautan baru.'}
            </span>
          </div>
        ) : linkMeta ? (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div className="p-3 rounded-md bg-indigo-50/70 border border-indigo-200 flex flex-wrap items-center justify-between gap-2">
              <span className="text-indigo-900 font-medium">
                Channel: <strong>{linkMeta.channel}</strong>
              </span>
              <div className="flex items-center gap-2">
                {linkMeta.label && <span className="text-indigo-700">{linkMeta.label}</span>}
                {['WHATSAPP_CLOUD', 'INSTAGRAM', 'FACEBOOK', 'THREADS'].includes(linkMeta.channel) && (
                  <button
                    type="button"
                    onClick={() => {
                      const base = window.location.pathname
                        .replace(/\/connect-channel\/?$/i, '')
                        .replace(/\/+$/, '');
                      window.location.href = `${base}/api/channels/oauth/start?channel=${linkMeta.channel}&connectToken=${encodeURIComponent(token)}`;
                    }}
                    className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-medium whitespace-nowrap"
                  >
                    Login 1-Klik {linkMeta.channel}
                  </button>
                )}
              </div>
            </div>

            {oauthStatus === 'error' && (
              <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-700">
                {oauthMsg || 'Otorisasi OAuth gagal. Silakan coba lagi atau isi form manual.'}
              </div>
            )}

            {error && (
              <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-700">
                {error}
              </div>
            )}

            <div>
              <label className="block font-medium text-gray-700 mb-1">Nama Tampilan Akun</label>
              <input
                type="text"
                required
                placeholder="Mis. @tokoresmi"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-9 px-3 bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-medium text-gray-700 mb-1">
                {linkMeta.channel === 'TELEGRAM'
                  ? 'Username Bot Telegram'
                  : linkMeta.channel === 'FACEBOOK'
                  ? 'Facebook Page ID'
                  : linkMeta.channel === 'THREADS'
                  ? 'Threads User ID'
                  : 'Instagram Business Account ID'}
              </label>
              <input
                type="text"
                required
                placeholder="Masukkan ID Akun / Page ID..."
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full h-9 px-3 bg-gray-50 border border-gray-200 rounded-md font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-medium text-gray-700 mb-1">Access Token / Bot Token</label>
              <input
                type="password"
                required
                placeholder="Tempel token akses API..."
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                className="w-full h-9 px-3 bg-gray-50 border border-gray-200 rounded-md font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <Button type="submit" variant="primary" size="md" isLoading={submitting} className="w-full">
              Hubungkan Akun {linkMeta.channel}
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
};

export default PublicChannelConnectPage;
