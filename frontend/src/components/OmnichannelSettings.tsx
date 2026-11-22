import React, { useEffect, useState } from 'react';
import { Globe2, Trash2, Copy, Check, AlertTriangle } from 'lucide-react';
import api from '../services/api';
import { getApiBaseUrl, getAppRootPath } from '../services/paths';
import { ChannelAccount, ChannelConnectLink, OmnichannelType } from '../types';
import { Button } from './ui/Button';
import { ConfirmModal } from './ui/ConfirmModal';
import { useToast } from './ui/ToastProvider';

const CHANNEL_OPTIONS: Array<{ value: OmnichannelType; label: string; idHint: string }> = [
  { value: 'WHATSAPP_CLOUD', label: 'WhatsApp Business (Cloud API)', idHint: 'Phone Number ID (Meta)' },
  { value: 'INSTAGRAM', label: 'Instagram DM & Komentar', idHint: 'IG Business Account ID' },
  { value: 'FACEBOOK', label: 'Facebook Messenger & Page', idHint: 'Facebook Page ID' },
  { value: 'THREADS', label: 'Threads (Replies & Mentions)', idHint: 'Threads User ID' },
  { value: 'TELEGRAM', label: 'Telegram Bot', idHint: 'Bot Username (tanpa @)' },
];

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

  useEffect(() => {
    if (!deleteTarget) {
      setChannelCampaignCheck(null);
      return;
    }
    let isMounted = true;
    api.checkSessionCampaigns({
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
  const [linkLabel, setLinkLabel] = useState('');
  const [creatingLink, setCreatingLink] = useState(false);
  const [oauthCfg, setOauthCfg] = useState<{
    reneoOAuthReady: boolean;
    directMetaReady: boolean;
    directThreadsReady: boolean;
  } | null>(null);

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
      .then((cfg) => setOauthCfg(cfg))
      .catch(() => {});

    if (typeof window !== 'undefined') {
      const hashQuery = window.location.hash.split('?')[1] || '';
      const params = new URLSearchParams(window.location.search || hashQuery);
      const oauthStatus = params.get('oauth');
      if (oauthStatus === 'success') {
        const count = params.get('count');
        toast.success(
          count ? `${count} akun omnichannel berhasil dihubungkan via OAuth.` : 'Akun omnichannel berhasil dihubungkan.'
        );
        window.history.replaceState(null, '', window.location.pathname);
      } else if (oauthStatus === 'error') {
        toast.error(params.get('msg') || 'Gagal menghubungkan akun melalui OAuth.');
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

  const handleCreateConnectLink = async () => {
    setCreatingLink(true);
    try {
      const created = await api.createChannelConnectLink({
        channel,
        label: linkLabel.trim() || undefined,
      });
      setConnectLinks((prev) => [created, ...prev]);
      setLinkLabel('');
      const url = `${appRootOrigin}/connect-channel?token=${created.token}`;
      navigator.clipboard?.writeText(url);
      toast.success('Connect Link dibuat & disalin ke clipboard');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal membuat Connect Link');
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
      toast.success(`Channel ${created.channel} berhasil ditambahkan`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menambahkan channel');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (acc: ChannelAccount) => {
    try {
      const updated = await api.updateChannel(acc.id, { isActive: !acc.isActive });
      setAccounts((prev) => prev.map((a) => (a.id === acc.id ? updated : a)));
    } catch {
      toast.error('Gagal memperbarui status channel');
    }
  };

  const handleConfirmDeleteChannel = async () => {
    if (!deleteTarget || deletingChannel) return;
    setDeletingChannel(true);
    try {
      await api.deleteChannel(deleteTarget.id);
      setAccounts((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      toast.success(`Akun channel "${deleteTarget.name}" berhasil dihapus.`);
      setDeleteTarget(null);
    } catch {
      toast.error('Gagal menghapus akun channel');
    } finally {
      setDeletingChannel(false);
    }
  };

  const selectedOpt = CHANNEL_OPTIONS.find((o) => o.value === channel) || CHANNEL_OPTIONS[0];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
      <div className="pb-3 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Globe2 className="w-4 h-4 text-indigo-600" />
            Integrasi Omnichannel (Instagram, Facebook, Threads, Telegram)
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Hubungkan akun media sosial &amp; bot agar seluruh DM, komentar, dan pesan masuk ke satu Live Chat CRM.
          </p>
        </div>
      </div>

      <div className="p-3.5 rounded-md bg-gray-50 border border-gray-200 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-gray-900">
              Login 1-Klik via Reneo OAuth (Multi Akun)
            </div>
            <div className="text-[11px] text-gray-500">
              {oauthCfg && !oauthCfg.reneoOAuthReady && !oauthCfg.directMetaReady && !oauthCfg.directThreadsReady
                ? 'Menunggu konfigurasi META_APP_ID / THREADS_APP_ID di server. Sementara gunakan form manual di bawah.'
                : 'Cukup login akun Facebook, Instagram, atau Threads. Klik lagi kapan saja untuk menambah akun lainnya.'}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 w-full sm:w-auto">
            {([
              { ch: 'META', label: 'FB + IG Sekaligus', ready: Boolean(oauthCfg?.reneoOAuthReady || oauthCfg?.directMetaReady), primary: true },
              { ch: 'FACEBOOK', label: 'Facebook', ready: Boolean(oauthCfg?.reneoOAuthReady || oauthCfg?.directMetaReady), primary: false },
              { ch: 'INSTAGRAM', label: 'Instagram', ready: Boolean(oauthCfg?.reneoOAuthReady || oauthCfg?.directMetaReady), primary: false },
              { ch: 'THREADS', label: 'Threads', ready: Boolean(oauthCfg?.reneoOAuthReady || oauthCfg?.directThreadsReady), primary: false },
              { ch: 'WHATSAPP_CLOUD', label: 'WA Business', ready: Boolean(oauthCfg?.reneoOAuthReady || oauthCfg?.directMetaReady), primary: false },
            ] as Array<{ ch: string; label: string; ready: boolean; primary: boolean }>).map((item) => (
              <button
                key={item.ch}
                type="button"
                disabled={!canEdit || !item.ready}
                onClick={() => {
                  window.location.href = `${apiBasePath}/channels/oauth/start?channel=${item.ch}`;
                }}
                className={`h-8 px-3 rounded-md text-xs font-medium whitespace-nowrap transition-colors disabled:bg-gray-200 disabled:text-gray-500 disabled:border-gray-200 disabled:cursor-not-allowed ${
                  item.primary
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-white text-gray-800 border border-gray-300 hover:bg-gray-100'
                }`}
              >
                Login {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-3 rounded-md bg-gray-50 border border-gray-200 text-xs space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-gray-700">Meta Webhook URL (Instagram, Facebook, Threads):</span>
          <button
            type="button"
            onClick={() => handleCopy(metaWebhookUrl, 'meta_url')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-gray-200 text-[11px] font-medium text-gray-700 hover:bg-gray-100"
          >
            {copiedId === 'meta_url' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            <span>Salin URL</span>
          </button>
        </div>
        <div className="font-mono text-[11px] text-gray-800 break-all select-all">{metaWebhookUrl}</div>
      </div>

      <form onSubmit={handleCreate} autoComplete="off" className="grid grid-cols-1 sm:grid-cols-12 gap-2">
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as OmnichannelType)}
          className="sm:col-span-3 h-9 px-2.5 bg-gray-50 border border-gray-200 rounded-md text-xs"
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
          className="sm:col-span-3 h-9 px-2.5 bg-gray-50 border border-gray-200 rounded-md text-xs"
        />
        <input
          type="text"
          name="channel_account_id"
          autoComplete="off"
          required
          placeholder={selectedOpt.idHint}
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="sm:col-span-2 h-9 px-2.5 bg-gray-50 border border-gray-200 rounded-md text-xs font-mono"
        />
        <input
          type="password"
          name="channel_access_token"
          autoComplete="new-password"
          placeholder="Access Token / Bot Token"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          className="sm:col-span-2 h-9 px-2.5 bg-gray-50 border border-gray-200 rounded-md text-xs font-mono"
        />
        <Button type="submit" variant="primary" size="md" isLoading={saving} disabled={!canEdit} className="sm:col-span-2">
          Hubungkan
        </Button>
      </form>

      {accounts.length > 0 && (
        <div className="border border-gray-200 rounded-md divide-y divide-gray-100">
          {accounts.map((acc) => (
            <div key={acc.id} className="p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold text-[10px]">
                    {acc.channel}
                  </span>
                  <span className="font-semibold text-gray-900">{acc.name}</span>
                  <span className="font-mono text-[11px] text-gray-500">ID: {acc.accountId}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                      acc.hasToken
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    {acc.hasToken ? 'Token Tersimpan' : 'Tanpa Token'}
                  </span>
                </div>
                {acc.channel === 'TELEGRAM' ? (
                  <div className="text-[11px] text-gray-500 font-mono truncate">
                    Webhook: /api/channels/webhook/telegram/{acc.id}
                  </div>
                ) : (
                  acc.verifyToken && (
                    <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
                      <span>Verify Token:</span>
                      <code className="font-mono text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">
                        {acc.verifyToken}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopy(acc.verifyToken || '', acc.id)}
                        className="text-indigo-600 hover:underline text-[10px]"
                      >
                        Salin
                      </button>
                    </div>
                  )
                )}
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
                    title="Hapus Channel"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Shareable Connect Link for Clients */}
      <div className="pt-3 border-t border-gray-200 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-gray-900">
              Connect Link Klien (Tanpa Login CRM)
            </h3>
            <p className="text-[11px] text-gray-500">
              Bagikan tautan aman sekali pakai agar klien bisa menghubungkan akun {channel} mereka sendiri.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 shrink-0 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Label klien (opsional)"
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
              Buat Link
            </Button>
          </div>
        </div>

        {connectLinks.length > 0 && (
          <div className="border border-gray-200 rounded-md divide-y divide-gray-100">
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
                        {lk.channel}
                      </span>
                      <span className="font-medium text-gray-800 truncate">{lk.label || 'Tautan Koneksi'}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          lk.usedAt
                            ? 'bg-emerald-50 text-emerald-700'
                            : expired
                            ? 'bg-red-50 text-red-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {lk.usedAt ? 'Sudah Digunakan' : expired ? 'Kedaluwarsa' : 'Aktif'}
                      </span>
                    </div>
                    <div className="font-mono text-[10px] text-gray-500 truncate mt-0.5">{url}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(url, `lk_${lk.id}`)}
                    className="h-7 px-2 rounded border border-gray-200 bg-white hover:bg-gray-50 text-[11px] font-medium text-gray-700 inline-flex items-center gap-1 shrink-0"
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

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDeleteChannel}
        isLoading={deletingChannel}
        title={`Hapus Akun Channel "${deleteTarget?.name}"?`}
        confirmLabel="Ya, Hapus Channel"
        variant="danger"
      >
        <div className="space-y-3">
          <p className="text-[13px] text-gray-600 leading-relaxed">
            Akun channel <strong>{deleteTarget?.name}</strong> ({deleteTarget?.channel}) akan diputuskan dan dihapus dari integrasi CRM.
          </p>

          <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Peringatan Data Riwayat &amp; Kampanye Siaran</span>
            </div>
            <p className="leading-relaxed text-amber-800">
              Sesi akun channel ini pernah digunakan untuk kampanye siaran (berdasarkan pencocokan riwayat channel &quot;{deleteTarget?.name}&quot; • {deleteTarget?.channel}{channelCampaignCheck?.totalCampaigns ? `, tercatat ${channelCampaignCheck.totalCampaigns} kampanye` : ''}{channelCampaignCheck?.campaignTitles?.length ? `: "${channelCampaignCheck.campaignTitles.join('", "')}"` : ''}).
            </p>
            <p className="leading-relaxed text-amber-900 font-medium">
              Data kampanye bisa saja tidak valid karena tidak bisa ambil data yang sesuai karena sesi telah berganti (nomor sesi atau identitas sesi).
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
