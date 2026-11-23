import React, { useEffect, useState } from 'react';
import {
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  Plus,
  Link2,
  ChevronRight,
  ArrowLeft,
  X,
  Settings2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import api from '../services/api';
import { getApiBaseUrl, getAppRootPath } from '../services/paths';
import { ChannelAccount, ChannelConnectLink, OmnichannelType } from '../types';
import { Button } from './ui/Button';
import { ConfirmModal } from './ui/ConfirmModal';
import { useToast } from './ui/ToastProvider';

const CHANNEL_OPTIONS: Array<{ value: OmnichannelType; label: string; idHint: string }> = [
  { value: 'INSTAGRAM', label: 'Instagram DM & Komentar', idHint: 'IG Business Account ID' },
  { value: 'FACEBOOK', label: 'Facebook Messenger & Page', idHint: 'Facebook Page ID' },
  { value: 'THREADS', label: 'Threads (Replies & Mentions)', idHint: 'Threads User ID' },
  { value: 'TELEGRAM', label: 'Telegram Bot', idHint: 'Bot Username (tanpa @)' },
  { value: 'WHATSAPP_CLOUD', label: 'WhatsApp Business (Cloud API)', idHint: 'Phone Number ID (Meta)' },
];

const CHANNEL_LABEL_MAP: Record<string, string> = {
  META: 'Semua Kanal',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  THREADS: 'Threads',
  TELEGRAM: 'Telegram',
  WHATSAPP_CLOUD: 'WhatsApp Business',
};

const CHANNEL_SUBTITLE_MAP: Record<string, string> = {
  INSTAGRAM: 'Business atau Creator',
  THREADS: 'Profil',
  FACEBOOK: 'Halaman',
  TELEGRAM: 'Bot & Channel',
  WHATSAPP_CLOUD: 'Coexistence / Cloud API',
};

export const PlatformBrandIcon: React.FC<{ channel: string; size?: 'sm' | 'md' }> = ({
  channel,
  size = 'md',
}) => {
  const dimCls = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9';

  if (channel === 'INSTAGRAM') {
    const gradId = `ig-grad-${size}`;
    const glowId = `ig-glow-${size}`;
    return (
      <svg viewBox="0 0 48 48" className={`${dimCls} shrink-0`} aria-hidden="true">
        <defs>
          <radialGradient id={gradId} cx="30%" cy="107%" r="150%">
            <stop offset="0%" stopColor="#fdf497" />
            <stop offset="5%" stopColor="#fdf497" />
            <stop offset="45%" stopColor="#fd5949" />
            <stop offset="60%" stopColor="#d6249f" />
            <stop offset="90%" stopColor="#285AEB" />
          </radialGradient>
          <radialGradient id={glowId} cx="15%" cy="100%" r="110%">
            <stop offset="0%" stopColor="#ffdd55" />
            <stop offset="30%" stopColor="#ff543e" />
            <stop offset="65%" stopColor="#c837ab" />
            <stop offset="100%" stopColor="#5851db" />
          </radialGradient>
        </defs>
        <rect x="2" y="2" width="44" height="44" rx="11" fill={`url(#${gradId})`} />
        <rect x="2" y="2" width="44" height="44" rx="11" fill={`url(#${glowId})`} opacity="0.85" />
        <rect
          x="10.5"
          y="10.5"
          width="27"
          height="27"
          rx="7.5"
          fill="none"
          stroke="#ffffff"
          strokeWidth="3.2"
        />
        <circle cx="24" cy="24" r="6.6" fill="none" stroke="#ffffff" strokeWidth="3.2" />
        <circle cx="32.2" cy="15.8" r="2" fill="#ffffff" />
      </svg>
    );
  }
  if (channel === 'THREADS') {
    return (
      <svg viewBox="0 0 192 192" className={`${dimCls} shrink-0`} aria-hidden="true">
        <rect x="8" y="8" width="176" height="176" rx="44" fill="#000000" />
        <path
          fill="#ffffff"
          d="M129.5 89.2c-.6-.3-1.3-.6-1.9-.9-1.1-20.5-12.3-32.2-31.1-32.4h-.3c-11.2 0-20.5 4.8-26.2 13.5l10.3 7.1c4.3-6.5 10.9-8.1 15.9-8.1h.2c6.2 0 10.9 1.8 13.9 5.3 2.2 2.6 3.7 6.2 4.4 10.9-5.5-.9-11.4-1.2-17.8-.8-17.9 1-29.4 11.4-28.7 25.8.4 7.3 4 13.6 10.2 17.7 5.2 3.5 12 5.2 19.1 4.8 9.3-.5 16.6-4.1 21.7-10.6 3.9-4.9 6.3-11.3 7.4-19.3 4.4 2.7 7.7 6.2 9.5 10.4 3.1 7.2 3.3 19.1-6.4 28.8-8.5 8.5-18.8 12.2-34.3 12.3-17.2-.1-30.2-5.7-38.6-16.5-7.9-10.1-12-24.7-12.2-43.4.2-18.7 4.3-33.3 12.2-43.4 8.4-10.8 21.4-16.4 38.6-16.5 17.3.1 30.5 5.7 39.2 16.6 4.3 5.4 7.5 12.2 9.6 20.1l12.1-3.2c-2.5-9.6-6.5-17.9-11.9-24.7-11.1-14-27.6-21.2-49-21.3h-.1c-21.3.1-37.7 7.3-48.6 21.3C36.6 54.4 31.8 71.7 31.6 93.4v.2c.2 21.7 5 39 15.1 52 10.9 14 27.3 21.2 48.6 21.3h.1c19 0 32.4-5.1 43.4-16.1 14.4-14.4 13.9-32.4 9.2-43.4-3.4-7.9-9.9-14.3-18.5-18.2Zm-27.9 30.2c-7.8.4-15.9-3.1-16.3-10.6-.3-5.6 4-11.8 16.9-12.6 1.5-.1 3-.1 4.4-.1 4.7 0 9.1.5 13.1 1.4-1.5 18.6-10.2 21.5-18.1 21.9Z"
        />
      </svg>
    );
  }
  if (channel === 'FACEBOOK') {
    return (
      <svg viewBox="0 0 48 48" className={`${dimCls} shrink-0`} aria-hidden="true">
        <circle cx="24" cy="24" r="22" fill="#1877F2" />
        <path
          fill="#ffffff"
          d="M32.6 30.9l1.1-7h-6.7v-4.5c0-1.9.9-3.8 4-3.8h3.1v-6s-2.8-.5-5.5-.5c-5.6 0-9.3 3.4-9.3 9.6v5.2H13v7h6.3V46a22.4 22.4 0 0 0 7.7 0V30.9h5.6Z"
        />
      </svg>
    );
  }
  if (channel === 'TELEGRAM') {
    const tgGradId = `tg-grad-${size}`;
    return (
      <svg viewBox="0 0 48 48" className={`${dimCls} shrink-0`} aria-hidden="true">
        <defs>
          <linearGradient id={tgGradId} x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#2AABEE" />
            <stop offset="100%" stopColor="#229ED9" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="22" fill={`url(#${tgGradId})`} />
        <path
          fill="#ffffff"
          d="M11.6 23.6c6.9-3 11.5-5 13.8-6 6.6-2.7 7.9-3.2 8.8-3.2.2 0 .6 0 .9.3.2.2.3.5.3.7 0 .2 0 .6-.1.9-1.1 11.4-5.8 39.1-5.8 39.1s-.3 1.7-1.5 1.8c-.8.1-1.9-.5-2.1-.7-1.6-1.1-6.1-4-8.1-5.8-.6-.5-1.3-1.5.1-2.7 2.9-2.7 6.4-6 8.5-8.1 1-1 2-3.2-2.1-.5-5.7 3.9-11.3 7.6-11.3 7.6s-1.3.8-3.7.1c-2.4-.7-5.2-1.7-5.2-1.7s-1.9-1.2 1.3-2.5l5.2-2.3Z"
          transform="scale(0.75) translate(6.5, 6.5)"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" className={`${dimCls} shrink-0`} aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="#25D366" />
      <path
        fill="#ffffff"
        d="M24 11a12.9 12.9 0 0 0-11 19.7L11.5 36l5.5-1.4A12.9 12.9 0 1 0 24 11Zm7.5 18.2c-.3.9-1.8 1.7-2.5 1.8-.7.1-1.5.2-2.5-.1-.6-.2-1.4-.5-2.4-.9-4.2-1.8-6.9-6-7.1-6.3-.2-.3-1.7-2.3-1.7-4.3 0-2.1 1.1-3.1 1.5-3.5.4-.4.8-.5 1.1-.5h.8c.3 0 .6-.1.9.7.3.8 1.1 2.7 1.2 2.9.1.2.2.4 0 .7-.1.3-.2.4-.4.7-.2.2-.4.5-.6.7-.2.2-.4.4-.2.8.2.4 1.1 1.8 2.3 2.9 1.6 1.4 2.9 1.8 3.3 2 .4.2.6.2.9-.1.2-.3 1-1.2 1.3-1.6.3-.4.5-.3.9-.2.4.1 2.4 1.1 2.8 1.3.4.2.7.3.8.5.1.2.1 1-.2 1.9Z"
      />
    </svg>
  );
};

export const OmnichannelSettings: React.FC<{ canEdit?: boolean }> = ({ canEdit = true }) => {
  const toast = useToast();
  const [accounts, setAccounts] = useState<ChannelAccount[]>([]);
  const [connectLinks, setConnectLinks] = useState<ChannelConnectLink[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Connect Account Modal state ('closed' | 'picker' | 'telegram' | 'remote_link')
  const [modalView, setModalView] = useState<'closed' | 'picker' | 'telegram' | 'remote_link'>('closed');

  // Telegram Bot step inside modal
  const [tgName, setTgName] = useState('');
  const [tgUsername, setTgUsername] = useState('');
  const [tgToken, setTgToken] = useState('');
  const [savingTg, setSavingTg] = useState(false);

  // Remote / Client Link step inside modal
  const [linkLabel, setLinkLabel] = useState('');
  const [linkChannel, setLinkChannel] = useState<OmnichannelType | 'META'>('META');
  const [creatingLink, setCreatingLink] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<ChannelAccount | null>(null);
  const [deletingChannel, setDeletingChannel] = useState(false);
  const [channelCampaignCheck, setChannelCampaignCheck] = useState<{
    loading: boolean;
    hasCampaigns: boolean;
    totalCampaigns: number;
    activeCampaigns: number;
    campaignTitles: string[];
  } | null>(null);

  // Developer / Manual override (collapsed at bottom)
  const [showDeveloperPanel, setShowDeveloperPanel] = useState(false);
  const [channel, setChannel] = useState<OmnichannelType>('INSTAGRAM');
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [savingManual, setSavingManual] = useState(false);

  useEffect(() => {
    if (!deleteTarget) {
      setChannelCampaignCheck(null);
      return;
    }
    let isMounted = true;
    api
      .checkSessionCampaigns({
        channel: deleteTarget.channel,
        channelAccountId: deleteTarget.id,
      })
      .then((res) => {
        if (isMounted) {
          setChannelCampaignCheck({
            loading: false,
            hasCampaigns: res.hasCampaigns,
            totalCampaigns: res.totalCampaigns,
            activeCampaigns: res.activeCampaigns,
            campaignTitles: res.campaignTitles || [],
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setChannelCampaignCheck(null);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [deleteTarget]);

  useEffect(() => {
    api
      .getChannels()
      .then((list) => setAccounts(list || []))
      .catch(() => {});
    api
      .getChannelConnectLinks()
      .then((links) => setConnectLinks(links || []))
      .catch(() => {});

    if (typeof window !== 'undefined') {
      const hashQuery = window.location.hash.split('?')[1] || '';
      const params = new URLSearchParams(window.location.search || hashQuery);
      const oauthStatus = params.get('oauth');
      if (oauthStatus === 'success') {
        const count = params.get('count');
        toast.success(
          count ? `${count} akun berhasil dihubungkan.` : 'Akun berhasil dihubungkan.'
        );
        window.history.replaceState(null, '', window.location.pathname);
      } else if (oauthStatus === 'error') {
        toast.error(params.get('msg') || 'Gagal menghubungkan akun melalui login OAuth.');
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  }, [toast]);

  const appRootOrigin =
    typeof window !== 'undefined'
      ? `${window.location.origin}${getAppRootPath(window.location.pathname).replace(/\/+$/, '')}`
      : '';
  const apiBasePath =
    typeof window !== 'undefined' ? getApiBaseUrl(window.location.pathname).replace(/\/+$/, '') : '/api';

  const handleStartOAuth = (targetCh: string) => {
    if (!canEdit) return;
    window.location.href = `${apiBasePath}/channels/oauth/start?channel=${encodeURIComponent(targetCh)}`;
  };

  const handleConnectTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = tgUsername.trim().replace(/^@+/, '');
    if (!tgName.trim() || !cleanUser || !tgToken.trim()) return;
    setSavingTg(true);
    try {
      const created = await api.createChannel({
        channel: 'TELEGRAM',
        name: tgName.trim(),
        accountId: cleanUser,
        accessToken: tgToken.trim(),
      });
      setAccounts((prev) => [...prev, created]);
      setTgName('');
      setTgUsername('');
      setTgToken('');
      setModalView('closed');
      toast.success(`Bot Telegram "${created.name}" berhasil dihubungkan.`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menghubungkan Bot Telegram');
    } finally {
      setSavingTg(false);
    }
  };

  const handleCreateConnectLink = async () => {
    setCreatingLink(true);
    try {
      const created = await api.createChannelConnectLink({
        channel: linkChannel,
        label: linkLabel.trim() || undefined,
      });
      setConnectLinks((prev) => [created, ...prev]);
      setLinkLabel('');
      const url = `${appRootOrigin}/connect-channel?token=${created.token}`;
      navigator.clipboard?.writeText(url);
      toast.success('Link koneksi dibuat & disalin ke clipboard.');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal membuat link koneksi');
    } finally {
      setCreatingLink(false);
    }
  };

  const handleCopy = (val: string, key: string) => {
    navigator.clipboard?.writeText(val);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 1800);
    toast.success('Disalin ke clipboard');
  };

  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !accountId.trim()) return;
    setSavingManual(true);
    try {
      const created = await api.createChannel({
        channel,
        name: name.trim(),
        accountId: accountId.trim(),
        accessToken: accessToken.trim() || undefined,
      });
      setAccounts((prev) => [...prev, created]);
      setName('');
      setAccountId('');
      setAccessToken('');
      toast.success(`Akun ${created.name} berhasil ditambahkan`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menambahkan akun');
    } finally {
      setSavingManual(false);
    }
  };

  const handleToggle = async (acc: ChannelAccount) => {
    try {
      const updated = await api.updateChannel(acc.id, { isActive: !acc.isActive });
      setAccounts((prev) => prev.map((a) => (a.id === acc.id ? updated : a)));
    } catch {
      toast.error('Gagal memperbarui status akun');
    }
  };

  const handleConfirmDeleteChannel = async () => {
    if (!deleteTarget || deletingChannel) return;
    setDeletingChannel(true);
    try {
      await api.deleteChannel(deleteTarget.id);
      setAccounts((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      toast.success(`Akun "${deleteTarget.name}" berhasil dihapus.`);
      setDeleteTarget(null);
    } catch {
      toast.error('Gagal menghapus akun channel');
    } finally {
      setDeletingChannel(false);
    }
  };

  const activeCount = accounts.filter((a) => a.isActive).length;
  const selectedOpt = CHANNEL_OPTIONS.find((o) => o.value === channel) || CHANNEL_OPTIONS[0];
  const metaWebhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${apiBasePath}/channels/webhook/meta`
      : '/api/channels/webhook/meta';

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-5">
      {/* Main Header (Tebar-style clean layout in Reneo CRM theme) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">Accounts</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Akun yang bisa dipakai untuk posting, membalas pesan, dan komentar.
          </p>
          <div className="text-[11px] text-gray-500 mt-1.5">
            <span className="font-semibold text-gray-800">{activeCount}</span> dari{' '}
            <span className="font-semibold text-gray-800">{Math.max(accounts.length, activeCount)}</span> akun aktif
          </div>
        </div>
        {canEdit && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setModalView('picker')}
            className="shrink-0 inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Hubungkan akun</span>
          </Button>
        )}
      </div>

      {/* Accounts Table */}
      {accounts.length === 0 ? (
        <div className="py-12 px-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 text-center space-y-3">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-gray-900">Belum ada akun terhubung</div>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              Hubungkan akun WhatsApp Business (Coexistence / Cloud API), Instagram, Threads, Facebook Page, atau Telegram agar seluruh pesan dan komentar masuk ke CRM.
            </p>
          </div>
          {canEdit && (
            <div>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setModalView('picker')}
                className="inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Hubungkan akun baru</span>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/70 text-[11px] font-semibold text-gray-500">
                <th className="py-2.5 px-4">Akun</th>
                <th className="py-2.5 px-4">Platform</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <PlatformBrandIcon channel={acc.channel} size="sm" />
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate">{acc.name}</div>
                        <div className="text-[11px] text-gray-500 truncate font-mono">
                          {acc.accountId.startsWith('@') ? acc.accountId : `ID: ${acc.accountId}`}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-medium text-gray-800">
                      {CHANNEL_LABEL_MAP[acc.channel] || acc.channel}
                    </span>
                    <span className="block text-[11px] text-gray-400">
                      {CHANNEL_SUBTITLE_MAP[acc.channel] || ''}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => void handleToggle(acc)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                        acc.isActive
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100/70'
                          : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200/70'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          acc.isActive ? 'bg-emerald-500' : 'bg-gray-400'
                        }`}
                      />
                      <span>{acc.isActive ? 'Aktif' : 'Nonaktif'}</span>
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(acc)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Hapus akun"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Optional Developer / Manual Token Accordion (Collapsed at very bottom) */}
      <div className="pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={() => setShowDeveloperPanel((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 hover:text-gray-700 transition-colors"
        >
          <Settings2 className="w-3.5 h-3.5" />
          <span>Opsi Developer &amp; Input Token Manual</span>
          {showDeveloperPanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showDeveloperPanel && (
          <div className="mt-3 p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-gray-700">Webhook URL:</span>
              <div className="flex items-center gap-2">
                <code className="font-mono text-[11px] text-gray-600 bg-white px-2 py-0.5 rounded border border-gray-200">
                  {metaWebhookUrl}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopy(metaWebhookUrl, 'meta_url')}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-gray-200 text-[11px] font-medium text-gray-700 hover:bg-gray-100"
                >
                  {copiedId === 'meta_url' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>Salin</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleCreateManual} autoComplete="off" className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-2 border-t border-gray-200">
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as OmnichannelType)}
                className="sm:col-span-3 h-8 px-2 bg-white border border-gray-200 rounded-md text-xs"
              >
                {CHANNEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                required
                placeholder="Nama Tampilan (mis. @tokoresmi)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="sm:col-span-3 h-8 px-2.5 bg-white border border-gray-200 rounded-md text-xs"
              />
              <input
                type="text"
                required
                placeholder={selectedOpt.idHint}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="sm:col-span-2 h-8 px-2.5 bg-white border border-gray-200 rounded-md text-xs font-mono"
              />
              <input
                type="password"
                placeholder="Access Token"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                className="sm:col-span-2 h-8 px-2.5 bg-white border border-gray-200 rounded-md text-xs font-mono"
              />
              <Button type="submit" variant="secondary" size="sm" isLoading={savingManual} disabled={!canEdit} className="sm:col-span-2 h-8">
                Simpan Manual
              </Button>
            </form>
          </div>
        )}
      </div>

      {/* Modal "Hubungkan akun baru" (Tebar.app Reference Style in Reneo CRM Light Theme) */}
      {modalView !== 'closed' && (
        <div
          className="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={() => setModalView('closed')}
        >
          <div
            className="w-full max-w-xl bg-white rounded-2xl border border-gray-200 shadow-xl p-5 sm:p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="relative flex items-center justify-center">
              {modalView !== 'picker' && (
                <button
                  type="button"
                  onClick={() => setModalView('picker')}
                  className="absolute left-0 p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                  title="Kembali"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <h3 className="text-sm sm:text-base font-bold text-gray-900 text-center">
                {modalView === 'picker'
                  ? 'Hubungkan akun baru'
                  : modalView === 'telegram'
                  ? 'Hubungkan Bot Telegram'
                  : 'Kirim Link Koneksi Akun'}
              </h3>
              <button
                type="button"
                onClick={() => setModalView('closed')}
                className="absolute right-0 p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                title="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalView === 'picker' && (
              <>
                {/* Square Platform Tiles Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => handleStartOAuth('WHATSAPP_CLOUD')}
                    className="p-4 rounded-xl border border-gray-200 bg-gray-50/70 hover:bg-emerald-50/60 hover:border-emerald-300 transition-all flex flex-col items-center justify-center text-center gap-2.5 group"
                  >
                    <PlatformBrandIcon channel="WHATSAPP_CLOUD" />
                    <div>
                      <div className="text-xs font-bold text-gray-900 group-hover:text-emerald-700">
                        WhatsApp Business
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Coexistence / Cloud API
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStartOAuth('INSTAGRAM')}
                    className="p-4 rounded-xl border border-gray-200 bg-gray-50/70 hover:bg-indigo-50/50 hover:border-indigo-300 transition-all flex flex-col items-center justify-center text-center gap-2.5 group"
                  >
                    <PlatformBrandIcon channel="INSTAGRAM" />
                    <div>
                      <div className="text-xs font-bold text-gray-900 group-hover:text-indigo-700">
                        Instagram
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Business atau Creator
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStartOAuth('THREADS')}
                    className="p-4 rounded-xl border border-gray-200 bg-gray-50/70 hover:bg-indigo-50/50 hover:border-indigo-300 transition-all flex flex-col items-center justify-center text-center gap-2.5 group"
                  >
                    <PlatformBrandIcon channel="THREADS" />
                    <div>
                      <div className="text-xs font-bold text-gray-900 group-hover:text-indigo-700">
                        Threads
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Profil
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStartOAuth('FACEBOOK')}
                    className="p-4 rounded-xl border border-gray-200 bg-gray-50/70 hover:bg-indigo-50/50 hover:border-indigo-300 transition-all flex flex-col items-center justify-center text-center gap-2.5 group"
                  >
                    <PlatformBrandIcon channel="FACEBOOK" />
                    <div>
                      <div className="text-xs font-bold text-gray-900 group-hover:text-indigo-700">
                        Facebook
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Halaman
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalView('telegram')}
                    className="p-4 rounded-xl border border-gray-200 bg-gray-50/70 hover:bg-indigo-50/50 hover:border-indigo-300 transition-all flex flex-col items-center justify-center text-center gap-2.5 group"
                  >
                    <PlatformBrandIcon channel="TELEGRAM" />
                    <div>
                      <div className="text-xs font-bold text-gray-900 group-hover:text-indigo-700">
                        Telegram
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Bot &amp; Channel
                      </div>
                    </div>
                  </button>
                </div>

                {/* Bottom Callout Card: "Akunnya login di HP atau komputer lain?" */}
                <button
                  type="button"
                  onClick={() => setModalView('remote_link')}
                  className="w-full p-3.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100/80 transition-colors flex items-center justify-between gap-3 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0 text-gray-600">
                      <Link2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-gray-900">
                        Akunnya login di HP atau komputer lain?
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Kirim link ke perangkat itu, atau ke klienmu. Akun terhubung tanpa perlu login ke CRM di sana.
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                </button>
              </>
            )}

            {modalView === 'telegram' && (
              <form onSubmit={handleConnectTelegram} className="space-y-3 text-xs">
                <p className="text-gray-500 leading-relaxed">
                  Buat atau buka bot Anda di <span className="font-mono font-medium text-gray-800">@BotFather</span> Telegram, lalu masukkan nama tampilan, username, dan token bot di bawah ini.
                </p>
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Nama Tampilan Bot</label>
                  <input
                    type="text"
                    required
                    placeholder="Mis. CS Toko Resmi"
                    value={tgName}
                    onChange={(e) => setTgName(e.target.value)}
                    className="w-full h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Username Bot</label>
                  <input
                    type="text"
                    required
                    placeholder="Mis. tokoresmi_bot"
                    value={tgUsername}
                    onChange={(e) => setTgUsername(e.target.value)}
                    className="w-full h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Token HTTP API dari @BotFather</label>
                  <input
                    type="password"
                    required
                    placeholder="123456789:AAH..."
                    value={tgToken}
                    onChange={(e) => setTgToken(e.target.value)}
                    className="w-full h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="pt-2 flex items-center justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setModalView('picker')}>
                    Kembali
                  </Button>
                  <Button type="submit" variant="primary" size="sm" isLoading={savingTg}>
                    Hubungkan Telegram
                  </Button>
                </div>
              </form>
            )}

            {modalView === 'remote_link' && (
              <div className="space-y-4 text-xs">
                <p className="text-gray-500 leading-relaxed">
                  Buat tautan khusus untuk dibuka di HP lain atau dikirimkan ke klien. Mereka cukup memilih platform dan login akun tanpa perlu akses ke dashboard CRM Anda.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <select
                    value={linkChannel}
                    onChange={(e) => setLinkChannel(e.target.value as OmnichannelType | 'META')}
                    className="sm:col-span-5 h-9 px-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                  >
                    <option value="META">Semua Platform (IG, Threads, FB)</option>
                    <option value="INSTAGRAM">Khusus Instagram</option>
                    <option value="THREADS">Khusus Threads</option>
                    <option value="FACEBOOK">Khusus Facebook</option>
                    <option value="TELEGRAM">Khusus Telegram</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Label perangkat / nama klien (opsional)"
                    value={linkLabel}
                    onChange={(e) => setLinkLabel(e.target.value)}
                    className="sm:col-span-4 h-9 px-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    isLoading={creatingLink}
                    onClick={() => void handleCreateConnectLink()}
                    className="sm:col-span-3 h-9"
                  >
                    Buat &amp; Salin Link
                  </Button>
                </div>

                {connectLinks.length > 0 && (
                  <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-56 overflow-y-auto">
                    {connectLinks.slice(0, 5).map((lk) => {
                      const url =
                        typeof window !== 'undefined'
                          ? `${appRootOrigin}/connect-channel?token=${lk.token}`
                          : `/connect-channel?token=${lk.token}`;
                      const expired = new Date(lk.expiresAt).getTime() < Date.now();
                      return (
                        <div key={lk.id} className="p-3 flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold text-[10px]">
                                {CHANNEL_LABEL_MAP[lk.channel] || lk.channel}
                              </span>
                              <span className="font-medium text-gray-800 truncate">
                                {lk.label || 'Tautan Koneksi'}
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  expired
                                    ? 'bg-red-50 text-red-700'
                                    : 'bg-emerald-50 text-emerald-700'
                                }`}
                              >
                                {expired ? 'Kedaluwarsa' : 'Aktif'}
                              </span>
                            </div>
                            <div className="font-mono text-[10px] text-gray-500 truncate mt-0.5">{url}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopy(url, `lk_${lk.id}`)}
                            className="h-7 px-2.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-[11px] font-medium text-gray-700 inline-flex items-center gap-1 shrink-0"
                          >
                            {copiedId === `lk_${lk.id}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            <span>Salin</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDeleteChannel}
        isLoading={deletingChannel}
        title={`Hapus Akun "${deleteTarget?.name}"?`}
        confirmLabel="Ya, Hapus Akun"
        variant="danger"
      >
        <div className="space-y-3">
          <p className="text-[13px] text-gray-600 leading-relaxed">
            Akun <strong>{deleteTarget?.name}</strong> ({deleteTarget ? CHANNEL_LABEL_MAP[deleteTarget.channel] || deleteTarget.channel : ''}) akan diputuskan dari kotak masuk CRM.
          </p>

          <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Catatan Riwayat Percakapan &amp; Siaran</span>
            </div>
            <p className="leading-relaxed text-amber-800">
              Jika akun ini pernah dipakai untuk kampanye siaran{channelCampaignCheck?.totalCampaigns ? ` (${channelCampaignCheck.totalCampaigns} kampanye)` : ''}, laporan kampanye lama mungkin tidak lagi dapat menyinkronkan data terbaru setelah akun dihapus.
            </p>
            {Boolean(channelCampaignCheck?.activeCampaigns && channelCampaignCheck.activeCampaigns > 0) && (
              <div className="font-semibold text-red-700 bg-red-50 p-2 rounded border border-red-200 mt-1">
                Perhatian: Terdapat {channelCampaignCheck?.activeCampaigns} kampanye siaran yang sedang berjalan pada akun ini!
              </div>
            )}
          </div>
        </div>
      </ConfirmModal>
    </div>
  );
};
