import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import api from '../services/api';
import { AutomationConfig, LicenseInfo, WebhookDeliveryItem } from '../types';
import { Button } from './ui/Button';
import { LoadingState, ErrorState } from './ui/StateBlocks';
import { useToast } from './ui/ToastProvider';

interface SlaRoutingCsatSettingsProps {
  licenseInfo?: LicenseInfo | null;
}

export const SlaRoutingCsatSettings: React.FC<SlaRoutingCsatSettingsProps> = ({ licenseInfo }) => {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Routing, SLA & Webhook state
  const [autoAssignMode, setAutoAssignMode] = useState<AutomationConfig['autoAssignMode']>('NONE');
  const [slaTargetMinutes, setSlaTargetMinutes] = useState(15);
  const [slaEscalationEnabled, setSlaEscalationEnabled] = useState(true);
  const [slaAlertWebhookUrl, setSlaAlertWebhookUrl] = useState('');
  const [savingSla, setSavingSla] = useState(false);

  const [deliveries, setDeliveries] = useState<WebhookDeliveryItem[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);

  // CSAT Survey state
  const [csatTemplate, setCsatTemplate] = useState(
    'Halo {nama_panggilan}, terima kasih telah menghubungi kami. Mohon bantuannya untuk memberikan penilaian layanan kami melalui tautan berikut:\n{link_csat}'
  );
  const [csatAutoOnResolve, setCsatAutoOnResolve] = useState(false);
  const [csatBaseUrl, setCsatBaseUrl] = useState('');
  const [savingCsat, setSavingCsat] = useState(false);

  const loadDeliveries = useCallback(async () => {
    setLoadingDeliveries(true);
    try {
      const list = await api.getWebhookDeliveries();
      setDeliveries(list || []);
    } catch {
      // keep silent
    } finally {
      setLoadingDeliveries(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [crm, auto] = await Promise.all([api.getCrmSettings(), api.getAutomationSettings()]);
      if (crm) {
        setCsatTemplate(crm.csatTemplate);
        setCsatAutoOnResolve(Boolean(crm.csatAutoOnResolve));
        setSlaTargetMinutes(crm.slaTargetMinutes || 15);
        setCsatBaseUrl(crm.csatBaseUrl || '');
      }
      if (auto?.config) {
        setAutoAssignMode(auto.config.autoAssignMode || 'NONE');
        setSlaEscalationEnabled(auto.config.slaEscalationEnabled !== false);
        setSlaAlertWebhookUrl(auto.config.slaAlertWebhookUrl || '');
      }
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal memuat pengaturan SLA, Routing & CSAT');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadDeliveries();
  }, [loadSettings, loadDeliveries]);

  const handleSaveRoutingSla = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingSla) return;
    setSavingSla(true);
    try {
      await Promise.all([
        api.saveAutomationSettings({
          autoAssignMode,
          slaEscalationEnabled,
          slaAlertWebhookUrl: slaAlertWebhookUrl.trim(),
        }),
        api.updateCrmSettings({
          slaTargetMinutes,
        }),
      ]);
      toast.success('Pengaturan Routing Agent, Target SLA & Webhook Alert disimpan');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan pengaturan SLA & Routing');
    } finally {
      setSavingSla(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!slaAlertWebhookUrl.trim()) {
      toast.error('Isi URL Webhook Alert terlebih dahulu');
      return;
    }
    setTestingWebhook(true);
    try {
      await api.saveAutomationSettings({
        slaEscalationEnabled,
        slaAlertWebhookUrl: slaAlertWebhookUrl.trim(),
      });
      const res = await api.testAlertWebhook();
      if (res.delivered) {
        toast.success(`Test webhook terkirim (HTTP ${res.httpStatus || 200})`);
      } else {
        toast.error(`Test webhook gagal: ${res.error || `HTTP ${res.httpStatus || '-'}`}`);
      }
      void loadDeliveries();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengirim test webhook');
    } finally {
      setTestingWebhook(false);
    }
  };

  const handleSaveCsat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingCsat) return;
    setSavingCsat(true);
    try {
      const saved = await api.updateCrmSettings({
        csatTemplate,
        csatAutoOnResolve,
        csatBaseUrl,
      });
      setCsatTemplate(saved.csatTemplate);
      setCsatAutoOnResolve(saved.csatAutoOnResolve);
      setCsatBaseUrl(saved.csatBaseUrl || '');
      toast.success('Pengaturan Survei CSAT disimpan');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan pengaturan CSAT');
    } finally {
      setSavingCsat(false);
    }
  };

  if (loading) return <LoadingState message="Memuat pengaturan SLA, Routing & CSAT..." />;
  if (error) return <ErrorState message={error} onRetry={loadSettings} />;

  return (
    <div className="space-y-5">
      {/* Card 1: Routing Otomatis Agent, Target SLA & Eskalasi Webhook */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5 space-y-4">
        <div className="pb-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            Routing Agent, Target SLA &amp; Webhook Alert
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Atur pembagian chat masuk ke agent, batas waktu respon pertama (SLA), serta notifikasi eskalasi SLA / CSAT rendah.
          </p>
        </div>

        <form onSubmit={handleSaveRoutingSla} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-md border border-gray-200 bg-gray-50/70 space-y-2">
              <label className="block text-xs font-semibold text-gray-800">
                Routing Otomatis Chat Masuk (Auto-Assign)
              </label>
              <select
                value={autoAssignMode}
                onChange={(e) =>
                  setAutoAssignMode(e.target.value as AutomationConfig['autoAssignMode'])
                }
                className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs text-gray-800 focus:outline-none focus:border-indigo-500"
              >
                <option value="NONE">Manual (Agent mengambil sendiri)</option>
                <option value="ROUND_ROBIN">Round-Robin (Giliran merata)</option>
                <option value="LEAST_BUSY">Beban Terendah (Agent chat Open paling sedikit)</option>
              </select>
              <p className="text-[11px] text-gray-500">
                Berlaku otomatis untuk percakapan baru atau percakapan yang belum memiliki agent penanggung jawab.
              </p>
            </div>

            <div className="p-3.5 rounded-md border border-gray-200 bg-gray-50/70 space-y-2">
              <label className="block text-xs font-semibold text-gray-800">
                Target SLA Respon Pertama (Menit)
              </label>
              <input
                type="number"
                min={1}
                max={1440}
                value={slaTargetMinutes}
                onChange={(e) => setSlaTargetMinutes(Number(e.target.value) || 15)}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-gray-500">
                Menentukan kepatuhan SLA di Dashboard dan batas waktu sebelum eskalasi SLA dipicu (1–1440 menit).
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-md border border-gray-200 bg-gray-50/70 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-gray-800">
                Aktifkan Eskalasi SLA &amp; Alert CSAT Rendah (Skor &le; 2)
              </label>
              <input
                type="checkbox"
                checked={slaEscalationEnabled}
                onChange={(e) => setSlaEscalationEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600"
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <input
                type="url"
                placeholder="URL Webhook Alert (opsional, mis. https://hooks.slack.com/...)"
                value={slaAlertWebhookUrl}
                onChange={(e) => setSlaAlertWebhookUrl(e.target.value)}
                className="flex-1 min-w-0 h-9 px-3 bg-white border border-gray-200 rounded-md text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleTestWebhook}
                disabled={testingWebhook || !slaAlertWebhookUrl.trim()}
                className="h-9 shrink-0 whitespace-nowrap"
              >
                {testingWebhook ? 'Menguji...' : 'Test Webhook'}
              </Button>
            </div>

            <div className="pt-2 border-t border-gray-200/80 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-gray-700">
                  Riwayat Pengiriman Webhook
                </span>
                <button
                  type="button"
                  onClick={() => void loadDeliveries()}
                  disabled={loadingDeliveries}
                  className="inline-flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-700 font-medium whitespace-nowrap"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingDeliveries ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
              {deliveries.length === 0 ? (
                <p className="text-[11px] text-gray-400">Belum ada riwayat pengiriman webhook.</p>
              ) : (
                <div className="max-h-36 overflow-y-auto space-y-1 pr-0.5">
                  {deliveries.map((d) => (
                    <div
                      key={d.id}
                      className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 px-2 py-1 rounded bg-white border border-gray-200/80 text-[11px]"
                    >
                      <div className="min-w-0 flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold shrink-0 ${
                            d.status === 'SUCCESS'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {d.status === 'SUCCESS'
                            ? `OK ${d.httpStatus || 200}`
                            : `FAIL ${d.httpStatus || ''}`.trim()}
                        </span>
                        <span className="font-mono text-gray-700 truncate">{d.event}</span>
                        {d.errorMessage && (
                          <span className="text-rose-600 truncate" title={d.errorMessage}>
                            — {d.errorMessage}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-400 font-mono shrink-0">
                        {new Date(d.createdAt).toLocaleString('id-ID', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="primary" size="md" isLoading={savingSla}>
              Simpan SLA &amp; Routing
            </Button>
          </div>
        </form>
      </div>

      {/* Card 2: Pengaturan Survei CSAT */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5 space-y-4">
        <div className="pb-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">
            Survei Penilaian Pelanggan (CSAT)
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Atur naskah pesan ajakan rating dan domain publik halaman formulir CSAT pelanggan.
          </p>
        </div>

        <form onSubmit={handleSaveCsat} className="space-y-3.5">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label className="text-xs font-medium text-gray-700">Template Pesan CTA CSAT</label>
              <div className="flex flex-wrap gap-1.5">
                {['{nama_panggilan}', '{nama_lengkap}', '{link_csat}'].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() =>
                      setCsatTemplate((prev) => `${prev}${prev.endsWith(' ') || prev.endsWith('\n') ? '' : ' '}${chip}`)
                    }
                    className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-mono hover:bg-indigo-100"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              rows={4}
              value={csatTemplate}
              onChange={(e) => setCsatTemplate(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="Halo {nama_panggilan}, mohon isi penilaian layanan melalui {link_csat}"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={csatAutoOnResolve}
              onChange={(e) => setCsatAutoOnResolve(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Kirim link CSAT otomatis saat percakapan diakhiri (Resolved)</span>
          </label>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label className="text-xs font-medium text-gray-700">
                URL Publik CSAT (Domain / Cloudflare Tunnel)
              </label>
              <button
                type="button"
                onClick={() =>
                  setCsatBaseUrl(
                    `${window.location.origin}${window.location.pathname.replace(/\/+$/, '')}`
                  )
                }
                className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
              >
                Gunakan URL Saat Ini
              </button>
            </div>
            <input
              type="url"
              value={csatBaseUrl}
              onChange={(e) => setCsatBaseUrl(e.target.value)}
              placeholder="https://crm.domain.com atau https://panel.domain.com/app/reneo-crm"
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Contoh tautan yang dikirim ke pelanggan:{' '}
              <code className="font-mono text-gray-600 break-all">
                {(csatBaseUrl.trim().replace(/\/+$/, '') || `${window.location.origin}${window.location.pathname.replace(/\/+$/, '')}`).replace(/\/csat$/i, '')}/csat?token=...
              </code>
            </p>
            {licenseInfo?.publicUrls && licenseInfo.publicUrls.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <span className="text-[11px] text-gray-500">Tunnel terdeteksi:</span>
                {licenseInfo.publicUrls.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setCsatBaseUrl(u)}
                    className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-mono hover:bg-emerald-100"
                  >
                    {u}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-1">
            <Button type="submit" variant="primary" size="md" isLoading={savingCsat}>
              Simpan Pengaturan CSAT
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
