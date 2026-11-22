import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../services/api';
import { getApiBaseUrl } from '../services/paths';
import { ChannelAccount, OmnichannelType } from '../types';
import { Button } from '../components/ui/Button';

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
    oauthConfig?: {
      reneoOAuthReady: boolean;
      directMetaReady: boolean;
      directThreadsReady: boolean;
    };
  } | null>(null);

  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [connectedAccount, setConnectedAccount] = useState<ChannelAccount | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);

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
          setShowManualForm(true);
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

  const allowedOAuthButtons = (() => {
    if (!linkMeta || linkMeta.channel === 'TELEGRAM') return [];
    const all = [
      {
        ch: 'META',
        label: 'Login Facebook & Instagram Sekaligus',
        sub: 'Otomatis menghubungkan Halaman Facebook dan akun Instagram Business Anda',
        primary: true,
      },
      {
        ch: 'FACEBOOK',
        label: 'Login Facebook Page',
        sub: 'Hubungkan satu atau banyak Halaman Facebook Bisnis',
        primary: false,
      },
      {
        ch: 'INSTAGRAM',
        label: 'Login Instagram Business',
        sub: 'Hubungkan akun Instagram Profesional / Bisnis',
        primary: false,
      },
      {
        ch: 'THREADS',
        label: 'Login Threads',
        sub: 'Hubungkan profil Threads untuk balasan & mention otomatis',
        primary: false,
      },
      {
        ch: 'WHATSAPP_CLOUD',
        label: 'Login WhatsApp Cloud API',
        sub: 'Hubungkan nomor WhatsApp Business resmi Meta',
        primary: false,
      },
    ];
    if (linkMeta.channel === 'META') {
      return all.slice(0, 4);
    }
    return all.filter((item) => item.ch === linkMeta.channel).map((item) => ({ ...item, primary: true }));
  })();

  return (
    <div className="min-h-screen supports-[height:100dvh]:min-h-dvh bg-gray-50 flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-lg bg-white rounded-lg border border-gray-200 p-4 sm:p-6 space-y-4 sm:space-y-5">
        <div className="border-b border-gray-200 pb-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h1 className="text-base font-semibold text-gray-900">
              Hubungkan Akun Media Sosial ke CRM
            </h1>
            {linkMeta?.label && (
              <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-medium">
                {linkMeta.label}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Cukup login ke akun resmi Anda. Mendukung banyak Halaman Facebook, Instagram Business, dan profil Threads sekaligus.
          </p>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-gray-500">Memeriksa tautan koneksi...</div>
        ) : error && !linkMeta ? (
          <div className="p-4 rounded-md bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : linkMeta?.isExpired ? (
          <div className="p-4 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              Tautan koneksi ini sudah kedaluwarsa. Minta admin CRM untuk membuat tautan baru.
            </span>
          </div>
        ) : linkMeta ? (
          <div className="space-y-4 text-xs">
            {oauthStatus === 'success' && (
              <div className="p-4 rounded-md bg-emerald-50 border border-emerald-200 space-y-1.5 text-xs text-emerald-900">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    {oauthCount ? `${oauthCount} Akun` : 'Akun'} {oauthChannel && oauthChannel !== 'META' ? oauthChannel : 'Omnichannel'} Berhasil Terhubung!
                  </span>
                </div>
                <p className="text-emerald-800 leading-relaxed">
                  Akun Anda sudah aktif di dashboard Live Chat CRM. Jika Anda memiliki akun atau Halaman lain yang ingin ditambahkan, cukup klik tombol Login di bawah lagi.
                </p>
              </div>
            )}

            {connectedAccount && (
              <div className="p-4 rounded-md bg-emerald-50 border border-emerald-200 space-y-2 text-xs text-emerald-900">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Akun {connectedAccount.channel} Berhasil Terhubung!</span>
                </div>
                <p>
                  Akun <strong>{connectedAccount.name}</strong> (<code className="font-mono">{connectedAccount.accountId}</code>) sekarang aktif di Live Chat CRM.
                </p>
              </div>
            )}

            {oauthStatus === 'error' && (
              <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{oauthMsg || 'Otorisasi OAuth gagal. Silakan coba klik tombol Login kembali.'}</span>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-700">
                {error}
              </div>
            )}

            {allowedOAuthButtons.length > 0 && (
              <div className="p-4 rounded-md bg-gray-50 border border-gray-200 space-y-3">
                <div>
                  <div className="font-semibold text-gray-900 text-xs">
                    Pilih Platform untuk Login 1-Klik
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Anda akan diarahkan ke halaman login resmi Meta / Threads untuk memilih akun yang diizinkan.
                  </p>
                </div>

                <div className="space-y-2">
                  {allowedOAuthButtons.map((btn) => (
                    <button
                      key={btn.ch}
                      type="button"
                      onClick={() => startClientOAuth(btn.ch)}
                      className={`w-full px-3.5 py-2.5 rounded-md text-left transition-colors flex items-center justify-between gap-3 ${
                        btn.primary
                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                          : 'bg-white hover:bg-gray-100 text-gray-900 border border-gray-300'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-xs">{btn.label}</div>
                        <div className={`text-[11px] mt-0.5 ${btn.primary ? 'text-indigo-100' : 'text-gray-500'}`}>
                          {btn.sub}
                        </div>
                      </div>
                      <span
                        className={`px-2 py-1 rounded text-[11px] font-medium shrink-0 ${
                          btn.primary
                            ? 'bg-indigo-700 text-white'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        Hubungkan
                      </span>
                    </button>
                  ))}
                </div>

                <div className="pt-2 border-t border-gray-200 text-[11px] text-gray-500 space-y-1">
                  <div className="font-medium text-gray-700">Tips Multi Akun:</div>
                  <div>• Saat login Facebook/Instagram, centang semua Halaman atau akun bisnis yang ingin dihubungkan.</div>
                  <div>• Anda dapat kembali ke tautan ini dan klik tombol Login lagi untuk menambah akun lainnya.</div>
                </div>
              </div>
            )}

            {linkMeta.channel !== 'META' && (
              <div className="pt-2 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowManualForm((v) => !v)}
                  className="w-full flex items-center justify-between text-[11px] font-medium text-gray-600 hover:text-gray-900 py-1"
                >
                  <span>
                    {linkMeta.channel === 'TELEGRAM'
                      ? 'Form Koneksi Bot Telegram'
                      : 'Opsi Lanjutan: Input ID Akun & Token API Manual'}
                  </span>
                  {showManualForm ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showManualForm && (
                  <form onSubmit={handleSubmit} className="space-y-3 pt-2.5">
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
                          ? 'Username Bot Telegram (tanpa @)'
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

                    <Button type="submit" variant="secondary" size="md" isLoading={submitting} className="w-full">
                      Simpan Token Manual
                    </Button>
                  </form>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default PublicChannelConnectPage;
