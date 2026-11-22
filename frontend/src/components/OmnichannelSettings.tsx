import React, { useEffect, useState } from 'react';
import {
  Globe2,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Plus,
  CheckCircle2,
  Link2,
  Settings2,
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

const PLATFORM_CARDS: Array<{
  channel: OmnichannelType;
  title: string;
  badge: string;
  description: string;
  actionLabel: string;
  mode: 'oauth' | 'telegram';
}> = [
  {
    channel: 'INSTAGRAM',
    title: 'Instagram Bisnis',
    badge: 'Login Akun',
    description: 'Terima dan balas DM serta komentar postingan/Reels langsung dari kotak masuk CRM.',
    actionLabel: 'Hubungkan Instagram',
    mode: 'oauth',
  },
  {
    channel: 'FACEBOOK',
    title: 'Facebook Page',
    badge: 'Login Akun',
    description: 'Kelola pesan Messenger dan komentar dari satu atau banyak Halaman Facebook sekaligus.',
    actionLabel: 'Hubungkan Facebook',
    mode: 'oauth',
  },
  {
    channel: 'THREADS',
    title: 'Threads',
    badge: 'Login Akun',
    description: 'Balas komentar utas, pantau mention, dan jadwalkan publikasi konten profil Threads.',
    actionLabel: 'Hubungkan Threads',
    mode: 'oauth',
  },
  {
    channel: 'TELEGRAM',
    title: 'Telegram Bot',
    badge: 'Token Bot',
    description: 'Hubungkan Bot Telegram resmi toko atau instansi untuk melayani chat pelanggan.',
    actionLabel: 'Hubungkan Telegram',
    mode: 'telegram',
  },
];

const CHANNEL_LABEL_MAP: Record<string, string> = {
  META: 'Semua Kanal (FB, IG & Threads)',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook Page',
  THREADS: 'Threads',
  TELEGRAM: 'Telegram Bot',
  WHATSAPP_CLOUD: 'WhatsApp Cloud',
};

export const OmnichannelSettings: React.FC<{ canEdit?: boolean }> = ({ canEdit = true }) => {
  const toast = useToast();
  const [accounts, setAccounts] = useState<ChannelAccount[]>([]);
  const [channel, setChannel] = useState<OmnichannelType>('INSTAGRAM');
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [connectLinks, setConnectLinks] = useState<ChannelConnectLink[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ChannelAccount | null>(null);
  const [deletingChannel, setDeletingChannel] = useState(false);
  const [channelCampaignCheck, setChannelCampaignCheck] = useState<{
    loading: boolean;
    hasCampaigns: boolean;
    totalCampaigns: number;
    activeCampaigns: number;
    campaignTitles: string[];
  } | null>(null);

  // Friendly Telegram quick-connect state
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  const [tgName, setTgName] = useState('');
  const [tgUsername, setTgUsername] = useState('');
  const [tgToken, setTgToken] = useState('');
  const [savingTg, setSavingTg] = useState(false);

  // Advanced / Technical collapsible state (closed by default for non-IT users)
  const [showAdvancedTech, setShowAdvancedTech] = useState(false);
  const [pendingOauthChannel, setPendingOauthChannel] = useState<string | null>(null);

  const [linkLabel, setLinkLabel] = useState('');
  const [linkChannel, setLinkChannel] = useState<OmnichannelType | 'META'>('META');
  const [creatingLink, setCreatingLink] = useState(false);
  const [oauthCfg, setOauthCfg] = useState<{
    reneoOAuthReady: boolean;
    directMetaReady: boolean;
    directThreadsReady: boolean;
    metaAppId?: string;
    hasMetaAppSecret?: boolean;
    threadsAppId?: string;
    hasThreadsAppSecret?: boolean;
    webhookVerifyToken?: string;
  } | null>(null);
  const [metaAppIdInput, setMetaAppIdInput] = useState('2455041348580254');
  const [metaAppSecretInput, setMetaAppSecretInput] = useState('');
  const [threadsAppIdInput, setThreadsAppIdInput] = useState('1742677016843989');
  const [threadsAppSecretInput, setThreadsAppSecretInput] = useState('');
  const [savingOauthCfg, setSavingOauthCfg] = useState(false);

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
    api
      .getOAuthConfig()
      .then((cfg) => {
        setOauthCfg(cfg);
        if (cfg.metaAppId) setMetaAppIdInput(cfg.metaAppId);
        if (cfg.threadsAppId) setThreadsAppIdInput(cfg.threadsAppId);
      })
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

  const isChannelOAuthReady = (targetCh: string) => {
    if (!oauthCfg) return false;
    if (oauthCfg.reneoOAuthReady) return true;
    if (targetCh === 'THREADS') return Boolean(oauthCfg.directThreadsReady);
    return Boolean(oauthCfg.directMetaReady);
  };

  const handleStartOAuth = (targetCh: string) => {
    if (!canEdit) return;
    if (isChannelOAuthReady(targetCh)) {
      window.location.href = `${apiBasePath}/channels/oauth/start?channel=${encodeURIComponent(targetCh)}`;
      return;
    }
    setPendingOauthChannel(targetCh);
  };

  const handleSaveOauthCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingOauthCfg(true);
    try {
      const updated = await api.saveOAuthConfig({
        metaAppId: metaAppIdInput.trim() || '2455041348580254',
        metaAppSecret: metaAppSecretInput.trim() || undefined,
        threadsAppId: threadsAppIdInput.trim() || '1742677016843989',
        threadsAppSecret: threadsAppSecretInput.trim() || undefined,
      });
      setOauthCfg(updated);
      setMetaAppSecretInput('');
      setThreadsAppSecretInput('');
      toast.success('Kredensial OAuth disimpan.');
      if (pendingOauthChannel) {
        const readyNow =
          updated.reneoOAuthReady ||
          (pendingOauthChannel === 'THREADS' ? updated.directThreadsReady : updated.directMetaReady);
        if (readyNow) {
          const target = pendingOauthChannel;
          setPendingOauthChannel(null);
          window.location.href = `${apiBasePath}/channels/oauth/start?channel=${encodeURIComponent(target)}`;
          return;
        }
      }
      setPendingOauthChannel(null);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan kredensial OAuth');
    } finally {
      setSavingOauthCfg(false);
    }
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
      setShowTelegramModal(false);
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
      toast.success('Link login klien berhasil dibuat & disalin.');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal membuat link login klien');
    } finally {
      setCreatingLink(false);
    }
  };

  const metaWebhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${apiBasePath}/channels/webhook/meta`
      : '/api/channels/webhook/meta';

  const handleCopy = (val: string, key: string) => {
    navigator.clipboard?.writeText(val);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 1800);
    toast.success('Disalin ke clipboard');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !accountId.trim()) return;
    setSaving(true);
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
      setSaving(false);
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

  const selectedOpt = CHANNEL_OPTIONS.find((o) => o.value === channel) || CHANNEL_OPTIONS[0];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-6">
      {/* Header + 1-Click Combined FB & IG Shortcut */}
      <div className="pb-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Globe2 className="w-4 h-4 text-indigo-600" />
            Pilih &amp; Hubungkan Akun Media Sosial
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Cukup pilih platform di bawah lalu login dengan akun Anda. Bisa menghubungkan lebih dari satu akun per platform.
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={!canEdit}
          onClick={() => handleStartOAuth('META')}
          className="shrink-0"
        >
          Login Facebook + Instagram Sekaligus
        </Button>
      </div>

      {/* Step 1: Visual Platform Picker Cards for Non-IT End Users */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {PLATFORM_CARDS.map((card) => {
          const connectedForChannel = accounts.filter((a) => a.channel === card.channel);
          const count = connectedForChannel.length;
          return (
            <div
              key={card.channel}
              className="rounded-lg border border-gray-200 bg-gray-50/60 p-3.5 flex flex-col justify-between gap-3 hover:border-gray-300 transition-colors"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-900">{card.title}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                      count > 0
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-white text-gray-600 border-gray-200'
                    }`}
                  >
                    {count > 0 ? `${count} Terhubung` : card.badge}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">{card.description}</p>
              </div>

              <button
                type="button"
                disabled={!canEdit}
                onClick={() => {
                  if (card.mode === 'telegram') {
                    setShowTelegramModal((v) => !v);
                  } else {
                    handleStartOAuth(card.channel);
                  }
                }}
                className="w-full h-8 px-3 rounded-md text-xs font-medium bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5 text-indigo-600" />
                <span>{count > 0 ? `Tambah ${card.title}` : card.actionLabel}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Inline Setup Prompt ONLY when admin clicks OAuth before App Secret is saved */}
      {pendingOauthChannel && canEdit && (
        <form
          onSubmit={handleSaveOauthCredentials}
          className="p-4 rounded-lg bg-amber-50/70 border border-amber-200 space-y-3 text-xs"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-amber-950">
                Aktifkan Login OAuth {CHANNEL_LABEL_MAP[pendingOauthChannel] || pendingOauthChannel} (Sekali Saja)
              </div>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Tempel Kunci Rahasia Aplikasi (App Secret) dari dashboard Meta Developer Anda. Setelah disimpan, Anda dan seluruh klien bisa langsung login tanpa perlu mengisi ini lagi.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPendingOauthChannel(null)}
              className="text-[11px] text-amber-800 hover:underline shrink-0"
            >
              Tutup
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <div className="sm:col-span-5">
              <label className="block text-[11px] font-medium text-amber-950 mb-1">
                Meta App Secret (untuk Facebook &amp; Instagram)
              </label>
              <input
                type="password"
                value={metaAppSecretInput}
                onChange={(e) => setMetaAppSecretInput(e.target.value)}
                placeholder={oauthCfg?.hasMetaAppSecret ? 'Sudah tersimpan (kosongkan jika tetap)' : 'Tempel Kunci Rahasia Aplikasi Meta...'}
                className="w-full h-8 px-2.5 bg-white border border-amber-300 rounded-md font-mono text-xs"
              />
            </div>
            <div className="sm:col-span-5">
              <label className="block text-[11px] font-medium text-amber-950 mb-1">
                Threads App Secret (untuk Threads)
              </label>
              <input
                type="password"
                value={threadsAppSecretInput}
                onChange={(e) => setThreadsAppSecretInput(e.target.value)}
                placeholder={oauthCfg?.hasThreadsAppSecret ? 'Sudah tersimpan (kosongkan jika tetap)' : 'Tempel Rahasia Aplikasi Threads...'}
                className="w-full h-8 px-2.5 bg-white border border-amber-300 rounded-md font-mono text-xs"
              />
            </div>
            <div className="sm:col-span-2 flex items-end">
              <Button type="submit" variant="secondary" size="sm" isLoading={savingOauthCfg} className="w-full h-8">
                Simpan &amp; Lanjut
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* Simple Telegram Bot Connection Form (Only shown when user clicks "Hubungkan Telegram") */}
      {showTelegramModal && (
        <form
          onSubmit={handleConnectTelegram}
          className="p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-3 text-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-semibold text-gray-900">Hubungkan Bot Telegram</div>
              <p className="text-[11px] text-gray-500">
                Buka <span className="font-mono text-gray-700">@BotFather</span> di Telegram, ketik <span className="font-mono text-gray-700">/newbot</span>, lalu tempel username dan token bot Anda di bawah.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTelegramModal(false)}
              className="text-[11px] text-gray-500 hover:text-gray-800"
            >
              Tutup
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <input
              type="text"
              required
              placeholder="Nama Bot (mis. CS Toko Resmi)"
              value={tgName}
              onChange={(e) => setTgName(e.target.value)}
              className="sm:col-span-4 h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs"
            />
            <input
              type="text"
              required
              placeholder="Username Bot (mis. tokoresmi_bot)"
              value={tgUsername}
              onChange={(e) => setTgUsername(e.target.value)}
              className="sm:col-span-3 h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs font-mono"
            />
            <input
              type="password"
              required
              placeholder="Token Bot dari @BotFather"
              value={tgToken}
              onChange={(e) => setTgToken(e.target.value)}
              className="sm:col-span-3 h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs font-mono"
            />
            <Button type="submit" variant="secondary" size="md" isLoading={savingTg} className="sm:col-span-2">
              Simpan Bot
            </Button>
          </div>
        </form>
      )}

      {/* Step 2: Connected Accounts List (Clean & Non-Technical) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-900">
            Daftar Akun Terhubung ({accounts.length})
          </h3>
        </div>

        {accounts.length === 0 ? (
          <div className="p-6 rounded-lg border border-dashed border-gray-200 text-center space-y-1">
            <div className="text-xs font-medium text-gray-700">Belum ada akun media sosial yang terhubung</div>
            <p className="text-[11px] text-gray-500">
              Klik salah satu platform di atas (Instagram, Facebook, Threads, atau Telegram) untuk mulai menghubungkan akun.
            </p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
            {accounts.map((acc) => (
              <div key={acc.id} className="p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="min-w-0 flex-1 flex items-center gap-2.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold text-[11px]">
                    {CHANNEL_LABEL_MAP[acc.channel] || acc.channel}
                  </span>
                  <span className="font-semibold text-gray-900">{acc.name}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>Terhubung</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => void handleToggle(acc)}
                    className={`h-7 px-2.5 rounded text-[11px] font-medium border disabled:opacity-60 disabled:cursor-not-allowed ${
                      acc.isActive
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-gray-50 text-gray-500 border-gray-200'
                    }`}
                  >
                    {acc.isActive ? 'Aktif' : 'Nonaktif'}
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(acc)}
                      className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                      title="Putuskan & Hapus Akun"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Step 3: Shareable 1-Click Login Link for Clients / Store Owners */}
      <div className="pt-4 border-t border-gray-200 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-indigo-600" />
              <span>Minta Klien / Pemilik Akun Login Sendiri</span>
            </h3>
            <p className="text-[11px] text-gray-500">
              Buat link khusus untuk dikirim ke klien agar mereka cukup login Facebook, Instagram, atau Threads mereka sendiri tanpa masuk ke dashboard CRM.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 shrink-0 w-full sm:w-auto">
            <select
              value={linkChannel}
              onChange={(e) => setLinkChannel(e.target.value as OmnichannelType | 'META')}
              className="h-8 px-2 bg-gray-50 border border-gray-200 rounded-md text-xs"
            >
              <option value="META">Semua Kanal (FB, IG &amp; Threads)</option>
              <option value="INSTAGRAM">Khusus Instagram</option>
              <option value="FACEBOOK">Khusus Facebook</option>
              <option value="THREADS">Khusus Threads</option>
              <option value="TELEGRAM">Khusus Telegram Bot</option>
            </select>
            <input
              type="text"
              placeholder="Nama klien / cabang (opsional)"
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              className="h-8 px-2.5 bg-gray-50 border border-gray-200 rounded-md text-xs w-full sm:w-44"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isLoading={creatingLink}
              disabled={!canEdit}
              onClick={() => void handleCreateConnectLink()}
            >
              Buat &amp; Salin Link
            </Button>
          </div>
        </div>

        {connectLinks.length > 0 && (
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
            {connectLinks.slice(0, 5).map((lk) => {
              const url =
                typeof window !== 'undefined'
                  ? `${appRootOrigin}/connect-channel?token=${lk.token}`
                  : `/connect-channel?token=${lk.token}`;
              const expired = new Date(lk.expiresAt).getTime() < Date.now();
              return (
                <div key={lk.id} className="px-3 py-2 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold text-[10px]">
                        {CHANNEL_LABEL_MAP[lk.channel] || lk.channel}
                      </span>
                      <span className="font-medium text-gray-800 truncate">{lk.label || 'Link Login Klien'}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          expired
                            ? 'bg-red-50 text-red-700'
                            : lk.usedAt
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {expired ? 'Kedaluwarsa' : lk.usedAt ? 'Aktif • Sudah Dipakai' : 'Siap Dibagikan'}
                      </span>
                    </div>
                    <div className="font-mono text-[10px] text-gray-500 truncate mt-0.5">{url}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(url, `lk_${lk.id}`)}
                    className="h-7 px-2.5 rounded border border-gray-200 bg-white hover:bg-gray-50 text-[11px] font-medium text-gray-700 inline-flex items-center gap-1 shrink-0"
                  >
                    {copiedId === `lk_${lk.id}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>Salin Link</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Step 4: Advanced Technical Settings (Hidden by Default for Non-IT End Users) */}
      <div className="pt-3 border-t border-gray-200">
        <button
          type="button"
          onClick={() => setShowAdvancedTech((v) => !v)}
          className="w-full flex items-center justify-between text-xs font-medium text-gray-500 hover:text-gray-800 py-1"
        >
          <span className="inline-flex items-center gap-1.5">
            <Settings2 className="w-3.5 h-3.5" />
            <span>Pengaturan Teknis &amp; Input Token Manual (Khusus Admin / Developer)</span>
          </span>
          {showAdvancedTech ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showAdvancedTech && (
          <div className="mt-3 p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-4 text-xs">
            {canEdit && (
              <form onSubmit={handleSaveOauthCredentials} className="space-y-2">
                <div className="font-semibold text-gray-800">Kredensial Aplikasi Meta &amp; Threads Developer</div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] text-gray-600 mb-1">Meta App ID</label>
                    <input
                      type="text"
                      value={metaAppIdInput}
                      onChange={(e) => setMetaAppIdInput(e.target.value)}
                      className="w-full h-8 px-2.5 bg-white border border-gray-200 rounded-md font-mono text-xs"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] text-gray-600 mb-1">
                      Meta App Secret {oauthCfg?.hasMetaAppSecret && <span className="text-emerald-600 font-semibold">(Tersimpan)</span>}
                    </label>
                    <input
                      type="password"
                      value={metaAppSecretInput}
                      onChange={(e) => setMetaAppSecretInput(e.target.value)}
                      placeholder={oauthCfg?.hasMetaAppSecret ? '••••••••' : 'Kunci Rahasia Aplikasi'}
                      className="w-full h-8 px-2.5 bg-white border border-gray-200 rounded-md font-mono text-xs"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-gray-600 mb-1">Threads App ID</label>
                    <input
                      type="text"
                      value={threadsAppIdInput}
                      onChange={(e) => setThreadsAppIdInput(e.target.value)}
                      className="w-full h-8 px-2.5 bg-white border border-gray-200 rounded-md font-mono text-xs"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-gray-600 mb-1">
                      Threads Secret {oauthCfg?.hasThreadsAppSecret && <span className="text-emerald-600 font-semibold">(Tersimpan)</span>}
                    </label>
                    <input
                      type="password"
                      value={threadsAppSecretInput}
                      onChange={(e) => setThreadsAppSecretInput(e.target.value)}
                      placeholder={oauthCfg?.hasThreadsAppSecret ? '••••••••' : 'Rahasia Threads'}
                      className="w-full h-8 px-2.5 bg-white border border-gray-200 rounded-md font-mono text-xs"
                    />
                  </div>
                  <div className="sm:col-span-2 flex items-end">
                    <Button type="submit" variant="secondary" size="sm" isLoading={savingOauthCfg} className="w-full h-8">
                      Simpan Secret
                    </Button>
                  </div>
                </div>
              </form>
            )}

            <div className="pt-3 border-t border-gray-200 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-gray-800">Meta Webhook Callback URL:</span>
                <button
                  type="button"
                  onClick={() => handleCopy(metaWebhookUrl, 'meta_url')}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-gray-200 text-[11px] font-medium text-gray-700 hover:bg-gray-100"
                >
                  {copiedId === 'meta_url' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>Salin Webhook URL</span>
                </button>
              </div>
              <div className="font-mono text-[11px] text-gray-700 break-all select-all">{metaWebhookUrl}</div>
            </div>

            <div className="pt-3 border-t border-gray-200 space-y-2">
              <div className="font-semibold text-gray-800">Input Token API Manual</div>
              <form onSubmit={handleCreate} autoComplete="off" className="grid grid-cols-1 sm:grid-cols-12 gap-2">
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
                  name="channel_display_name"
                  autoComplete="off"
                  required
                  placeholder="Nama Tampilan (mis. @tokoresmi)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="sm:col-span-3 h-8 px-2.5 bg-white border border-gray-200 rounded-md text-xs"
                />
                <input
                  type="text"
                  name="channel_account_id"
                  autoComplete="off"
                  required
                  placeholder={selectedOpt.idHint}
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="sm:col-span-2 h-8 px-2.5 bg-white border border-gray-200 rounded-md text-xs font-mono"
                />
                <input
                  type="password"
                  name="channel_access_token"
                  autoComplete="new-password"
                  placeholder="Access Token / Bot Token"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  className="sm:col-span-2 h-8 px-2.5 bg-white border border-gray-200 rounded-md text-xs font-mono"
                />
                <Button type="submit" variant="secondary" size="sm" isLoading={saving} disabled={!canEdit} className="sm:col-span-2 h-8">
                  Tambah Manual
                </Button>
              </form>
            </div>
          </div>
        )}
      </div>

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
