import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from 'lucide-react';
import api from '../services/api';
import {
  AutomationConfig,
  CsatCriterion,
  CsatSurveyConfig,
  CsatTargetProfile,
  LicenseInfo,
  WahaSessionItem,
  WebhookDeliveryItem,
} from '../types';
import { Button } from './ui/Button';
import { LoadingState, ErrorState } from './ui/StateBlocks';
import { useToast } from './ui/ToastProvider';

interface SlaRoutingCsatSettingsProps {
  licenseInfo?: LicenseInfo | null;
  canEdit?: boolean;
}

const DEFAULT_CSAT_TEMPLATE =
  'Halo {nama_panggilan}, terima kasih telah menghubungi kami. Mohon bantuannya untuk memberikan penilaian layanan kami melalui tautan berikut:\n{link_csat}';

const DEFAULT_SCALE_LABELS: Record<string, string> = {
  '1': 'Sangat Kurang',
  '2': 'Kurang Memuaskan',
  '3': 'Cukup Baik',
  '4': 'Memuaskan',
  '5': 'Sangat Memuaskan',
};

const PRESET_CRITERIA: Array<{ key: string; label: string; description: string }> = [
  {
    key: 'keramahan',
    label: 'Keramahan & Sikap',
    description: 'Kesopanan, empati, dan sikap ramah tim saat melayani.',
  },
  {
    key: 'bahasa',
    label: 'Bahasa & Komunikasi',
    description: 'Kejelasan penyampaian dan tata bahasa yang mudah dipahami.',
  },
  {
    key: 'kecepatan',
    label: 'Kecepatan Respon',
    description: 'Kecepatan tanggapan dan waktu penyelesaian kendala.',
  },
  {
    key: 'solusi',
    label: 'Ketepatan Solusi',
    description: 'Seberapa membantu jawaban atau solusi yang diberikan.',
  },
  {
    key: 'informasi',
    label: 'Kelengkapan Informasi',
    description: 'Akurasi dan kelengkapan penjelasan produk atau layanan.',
  },
];

const CHANNEL_OPTIONS = ['WHATSAPP', 'WHATSAPP_CLOUD', 'INSTAGRAM', 'FACEBOOK', 'THREADS', 'TELEGRAM'];

function createEmptyTexts() {
  return {
    brandName: 'Layanan Pelanggan',
    title: 'Penilaian Layanan Pelanggan',
    subtitle: 'Customer Satisfaction (CSAT)',
    greetingText: 'Halo {nama_panggilan}, bagaimana pengalaman Anda dengan layanan kami?',
    scaleLabels: { ...DEFAULT_SCALE_LABELS },
    feedbackLabel: 'Saran atau Masukan (Opsional)',
    feedbackPlaceholder: 'Ceritakan pengalaman Anda...',
    requireFeedbackOnLow: false,
    submitButtonText: 'Kirim Penilaian',
    thankYouTitle: 'Terima kasih, {nama_panggilan}!',
    thankYouMessage: 'Penilaian Anda sangat membantu kami meningkatkan kualitas layanan.',
  };
}

function createDefaultSurveyConfig(): CsatSurveyConfig {
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
        texts: createEmptyTexts(),
        criteria: PRESET_CRITERIA.slice(0, 4).map((p) => ({
          ...p,
          required: true,
          isActive: true,
        })),
      },
    ],
  };
}

function slugifyKey(raw: string, idx: number): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return s || `aspek_${idx}`;
}

export const SlaRoutingCsatSettings: React.FC<SlaRoutingCsatSettingsProps> = ({
  licenseInfo,
  canEdit = true,
}) => {
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
  const [csatTemplate, setCsatTemplate] = useState(DEFAULT_CSAT_TEMPLATE);
  const [csatAutoOnResolve, setCsatAutoOnResolve] = useState(false);
  const [csatBaseUrl, setCsatBaseUrl] = useState('');
  const [surveyConfig, setSurveyConfig] = useState<CsatSurveyConfig>(createDefaultSurveyConfig);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('default');
  const [profileSubTab, setProfileSubTab] = useState<'criteria' | 'texts' | 'target' | 'preview'>('criteria');
  const [wahaSessions, setWahaSessions] = useState<WahaSessionItem[]>([]);
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
      const [crm, auto, sessRes] = await Promise.all([
        api.getCrmSettings(),
        api.getAutomationSettings(),
        api.getWahaSessions().catch(() => ({ sessions: [], activeSession: '' })),
      ]);
      if (crm) {
        setCsatTemplate(crm.csatTemplate);
        setCsatAutoOnResolve(Boolean(crm.csatAutoOnResolve));
        setSlaTargetMinutes(crm.slaTargetMinutes || 15);
        setCsatBaseUrl(crm.csatBaseUrl || '');
        if (crm.csatSurveyConfig?.profiles?.length) {
          setSurveyConfig(crm.csatSurveyConfig);
          setSelectedProfileId(crm.csatSurveyConfig.profiles[0].id);
        }
      }
      if (auto?.config) {
        setAutoAssignMode(auto.config.autoAssignMode || 'NONE');
        setSlaEscalationEnabled(auto.config.slaEscalationEnabled !== false);
        setSlaAlertWebhookUrl(auto.config.slaAlertWebhookUrl || '');
      }
      setWahaSessions(sessRes?.sessions || []);
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
    for (const p of surveyConfig.profiles) {
      if (!p.criteria.some((c) => c.isActive && c.label.trim())) {
        toast.error(`Target "${p.name}" harus memiliki minimal 1 aspek penilaian aktif`);
        return;
      }
    }
    setSavingCsat(true);
    try {
      const saved = await api.updateCrmSettings({
        csatTemplate,
        csatAutoOnResolve,
        csatBaseUrl,
        csatSurveyConfig: surveyConfig,
      });
      setCsatTemplate(saved.csatTemplate);
      setCsatAutoOnResolve(saved.csatAutoOnResolve);
      setCsatBaseUrl(saved.csatBaseUrl || '');
      if (saved.csatSurveyConfig?.profiles?.length) {
        setSurveyConfig(saved.csatSurveyConfig);
      }
      toast.success('Pengaturan Survei CSAT & Parameter Kriteria disimpan');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan pengaturan CSAT');
    } finally {
      setSavingCsat(false);
    }
  };

  const activeProfile: CsatTargetProfile =
    surveyConfig.profiles.find((p) => p.id === selectedProfileId) || surveyConfig.profiles[0];

  const updateActiveProfile = (updater: (p: CsatTargetProfile) => CsatTargetProfile) => {
    setSurveyConfig((prev) => ({
      profiles: prev.profiles.map((p) => (p.id === activeProfile.id ? updater(p) : p)),
    }));
  };

  const handleAddProfile = () => {
    const num = surveyConfig.profiles.length;
    const newId = `target_${Date.now().toString(36)}`;
    const newProfile: CsatTargetProfile = {
      id: newId,
      name: `Target Khusus ${num}`,
      isDefault: false,
      isActive: true,
      matchWahaSessions: [],
      matchChannels: [],
      matchLabels: [],
      ctaTemplate: '',
      texts: createEmptyTexts(),
      criteria: activeProfile.criteria.map((c) => ({ ...c })),
    };
    setSurveyConfig((prev) => ({ profiles: [...prev.profiles, newProfile] }));
    setSelectedProfileId(newId);
    setProfileSubTab('target');
  };

  const handleDeleteProfile = (id: string) => {
    const target = surveyConfig.profiles.find((p) => p.id === id);
    if (!target || target.isDefault) return;
    setSurveyConfig((prev) => ({
      profiles: prev.profiles.filter((p) => p.id !== id),
    }));
    if (selectedProfileId === id) {
      setSelectedProfileId('default');
    }
  };

  const handleAddCriterion = (preset?: { key: string; label: string; description: string }) => {
    updateActiveProfile((p) => {
      const idx = p.criteria.length + 1;
      const baseKey = preset?.key || `aspek_${idx}`;
      let key = baseKey;
      while (p.criteria.some((c) => c.key === key)) {
        key = `${baseKey}_${idx}_${Math.floor(Math.random() * 100)}`;
      }
      const next: CsatCriterion = {
        key,
        label: preset?.label || `Aspek Penilaian ${idx}`,
        description: preset?.description || '',
        required: true,
        isActive: true,
      };
      return { ...p, criteria: [...p.criteria, next] };
    });
  };

  const handleUpdateCriterion = (idx: number, patch: Partial<CsatCriterion>) => {
    updateActiveProfile((p) => ({
      ...p,
      criteria: p.criteria.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  };

  const handleMoveCriterion = (idx: number, dir: -1 | 1) => {
    updateActiveProfile((p) => {
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= p.criteria.length) return p;
      const list = [...p.criteria];
      const [item] = list.splice(idx, 1);
      list.splice(nextIdx, 0, item);
      return { ...p, criteria: list };
    });
  };

  const handleRemoveCriterion = (idx: number) => {
    if (activeProfile.criteria.length <= 1) {
      toast.error('Minimal harus ada 1 aspek penilaian.');
      return;
    }
    updateActiveProfile((p) => ({
      ...p,
      criteria: p.criteria.filter((_, i) => i !== idx),
    }));
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
                Aktifkan Eskalasi SLA &amp; Alert CSAT Rendah (Rata-rata &le; 2)
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
                className="w-full flex-none sm:flex-1 min-w-0 h-9 px-3 bg-white border border-gray-200 rounded-md text-xs font-mono focus:outline-none focus:border-indigo-500"
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
            <Button type="submit" variant="primary" size="md" isLoading={savingSla} disabled={!canEdit}>
              Simpan SLA &amp; Routing
            </Button>
          </div>
        </form>
      </div>

      {/* Card 2: Pengaturan Survei CSAT + Custom Multi-Kriteria, Multi-Target & Parameter Teks */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5 space-y-5">
        <div className="pb-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">
            Survei Penilaian Pelanggan (CSAT)
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Atur naskah pesan ajakan, domain publik, target survei khusus (per sesi WAHA / channel / label), aspek multi-kriteria (skala 1–5), dan parameter teks halaman publik.
          </p>
        </div>

        <form onSubmit={handleSaveCsat} className="space-y-5">
          {/* Global CTA & Domain settings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-medium text-gray-700">
                  Template Pesan CTA CSAT (Default Global)
                </label>
                <div className="flex flex-wrap gap-1">
                  {['{nama_panggilan}', '{nama_lengkap}', '{link_csat}'].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() =>
                        setCsatTemplate(
                          (prev) => `${prev}${prev.endsWith(' ') || prev.endsWith('\n') ? '' : ' '}${chip}`
                        )
                      }
                      className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-mono hover:bg-indigo-100"
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
              <label className="inline-flex items-center gap-2 text-xs text-gray-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={csatAutoOnResolve}
                  onChange={(e) => setCsatAutoOnResolve(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Kirim link CSAT otomatis saat percakapan diakhiri (Resolved)</span>
              </label>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
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
              <p className="text-[11px] text-gray-400">
                Contoh tautan yang dikirim ke pelanggan:{' '}
                <code className="font-mono text-gray-600 break-all">
                  {(csatBaseUrl.trim().replace(/\/+$/, '') ||
                    `${window.location.origin}${window.location.pathname.replace(/\/+$/, '')}`
                  ).replace(/\/csat$/i, '')}
                  /csat?token=...
                </code>
              </p>
              {licenseInfo?.publicUrls && licenseInfo.publicUrls.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
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
          </div>

          {/* Multi-Target & Multi-Criteria Designer */}
          <div className="rounded-lg border border-gray-200 bg-gray-50/60 overflow-hidden">
            <div className="px-4 py-3 bg-white border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-semibold text-gray-900">
                  Konfigurasi Target, Kriteria Multi-Aspek &amp; Parameter Teks CSAT
                </h4>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Skala 1–5 bintang per aspek; skor keseluruhan percakapan otomatis dihitung dari rata-rata semua aspek yang diisi.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAddProfile}
                className="shrink-0"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Tambah Target Khusus
              </Button>
            </div>

            {/* Profile Pills */}
            <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex flex-wrap items-center gap-2">
              {surveyConfig.profiles.map((prof) => {
                const isSelected = prof.id === activeProfile.id;
                const activeCritCount = prof.criteria.filter((c) => c.isActive).length;
                return (
                  <div key={prof.id} className="inline-flex items-center">
                    <button
                      type="button"
                      onClick={() => setSelectedProfileId(prof.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors inline-flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <span>{prof.name}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                          isSelected ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {activeCritCount} aspek
                      </span>
                      {!prof.isDefault && !prof.isActive && (
                        <span className="text-[10px] opacity-80">(Nonaktif)</span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Sub-tabs inside selected profile */}
            <div className="px-4 pt-3 border-b border-gray-200 bg-white flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    { id: 'criteria', label: 'Kriteria Penilaian (1–5)' },
                    { id: 'texts', label: 'Parameter Teks Formulir' },
                    { id: 'target', label: activeProfile.isDefault ? 'Info Profil Umum' : 'Aturan Target Spesifik' },
                    { id: 'preview', label: 'Preview Halaman Publik' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setProfileSubTab(tab.id)}
                    className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors inline-flex items-center gap-1 ${
                      profileSubTab === tab.id
                        ? 'border-indigo-600 text-indigo-700'
                        : 'border-transparent text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {tab.id === 'preview' && <Eye className="w-3.5 h-3.5" />}
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>

              {!activeProfile.isDefault && (
                <div className="flex items-center gap-2 pb-2">
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeProfile.isActive}
                      onChange={(e) =>
                        updateActiveProfile((p) => ({ ...p, isActive: e.target.checked }))
                      }
                      className="rounded border-gray-300 text-indigo-600"
                    />
                    <span>Target Aktif</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleDeleteProfile(activeProfile.id)}
                    className="px-2 py-1 rounded text-[11px] font-medium text-red-600 hover:bg-red-50 inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Hapus Target</span>
                  </button>
                </div>
              )}
            </div>

            {/* Sub-tab body */}
            <div className="p-4 bg-white space-y-4">
              {profileSubTab === 'criteria' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-medium text-gray-500">Sisipkan cepat:</span>
                      {PRESET_CRITERIA.map((preset) => (
                        <button
                          key={preset.key}
                          type="button"
                          onClick={() => handleAddCriterion(preset)}
                          className="px-2 py-0.5 rounded bg-gray-100 hover:bg-indigo-50 text-gray-700 hover:text-indigo-700 border border-gray-200 text-[11px] transition-colors"
                        >
                          + {preset.label}
                        </button>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleAddCriterion()}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Tambah Aspek Kustom
                    </Button>
                  </div>

                  <div className="space-y-2.5">
                    {activeProfile.criteria.map((crit, idx) => (
                      <div
                        key={`${crit.key}_${idx}`}
                        className={`p-3 rounded-md border space-y-2 ${
                          crit.isActive
                            ? 'bg-gray-50/70 border-gray-200'
                            : 'bg-gray-50/40 border-dashed border-gray-200 opacity-70'
                        }`}
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                          <div className="sm:col-span-5">
                            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                              Nama Aspek Penilaian
                            </label>
                            <input
                              type="text"
                              value={crit.label}
                              onChange={(e) => {
                                const val = e.target.value;
                                handleUpdateCriterion(idx, {
                                  label: val,
                                  key: crit.key || slugifyKey(val, idx + 1),
                                });
                              }}
                              placeholder="Mis. Keramahan & Sikap"
                              className="w-full h-8 px-2.5 bg-white border border-gray-200 rounded text-xs focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                              Key Statistik (Dashboard/CSV)
                            </label>
                            <input
                              type="text"
                              value={crit.key}
                              onChange={(e) =>
                                handleUpdateCriterion(idx, {
                                  key: slugifyKey(e.target.value, idx + 1),
                                })
                              }
                              className="w-full h-8 px-2.5 bg-white border border-gray-200 rounded text-[11px] font-mono text-gray-700 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div className="sm:col-span-4 flex flex-wrap items-center justify-between sm:justify-end gap-2 pt-3 sm:pt-4">
                            <label className="inline-flex items-center gap-1 text-[11px] text-gray-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={crit.required}
                                onChange={(e) =>
                                  handleUpdateCriterion(idx, { required: e.target.checked })
                                }
                                className="rounded border-gray-300 text-indigo-600"
                              />
                              <span>Wajib</span>
                            </label>
                            <label className="inline-flex items-center gap-1 text-[11px] text-gray-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={crit.isActive}
                                onChange={(e) =>
                                  handleUpdateCriterion(idx, { isActive: e.target.checked })
                                }
                                className="rounded border-gray-300 text-indigo-600"
                              />
                              <span>Aktif</span>
                            </label>
                            <div className="inline-flex items-center gap-0.5">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveCriterion(idx, -1)}
                                title="Pindah ke atas"
                                className="p-1 rounded text-gray-500 hover:bg-gray-200 disabled:opacity-30"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === activeProfile.criteria.length - 1}
                                onClick={() => handleMoveCriterion(idx, 1)}
                                title="Pindah ke bawah"
                                className="p-1 rounded text-gray-500 hover:bg-gray-200 disabled:opacity-30"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveCriterion(idx)}
                                title="Hapus aspek"
                                className="p-1 rounded text-red-500 hover:bg-red-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div>
                          <input
                            type="text"
                            value={crit.description || ''}
                            onChange={(e) =>
                              handleUpdateCriterion(idx, { description: e.target.value })
                            }
                            placeholder="Subteks keterangan untuk pelanggan (opsional)..."
                            className="w-full h-8 px-2.5 bg-white border border-gray-200 rounded text-[11px] text-gray-700 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {profileSubTab === 'texts' && (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 mb-1">
                        Nama Brand / Unit Layanan
                      </label>
                      <input
                        type="text"
                        value={activeProfile.texts.brandName}
                        onChange={(e) =>
                          updateActiveProfile((p) => ({
                            ...p,
                            texts: { ...p.texts, brandName: e.target.value },
                          }))
                        }
                        className="w-full h-8 px-2.5 bg-white border border-gray-200 rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 mb-1">
                        Judul Formulir CSAT
                      </label>
                      <input
                        type="text"
                        value={activeProfile.texts.title}
                        onChange={(e) =>
                          updateActiveProfile((p) => ({
                            ...p,
                            texts: { ...p.texts, title: e.target.value },
                          }))
                        }
                        className="w-full h-8 px-2.5 bg-white border border-gray-200 rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 mb-1">
                        Subjudul Formulir
                      </label>
                      <input
                        type="text"
                        value={activeProfile.texts.subtitle}
                        onChange={(e) =>
                          updateActiveProfile((p) => ({
                            ...p,
                            texts: { ...p.texts, subtitle: e.target.value },
                          }))
                        }
                        className="w-full h-8 px-2.5 bg-white border border-gray-200 rounded text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <label className="text-[11px] font-medium text-gray-700">
                        Kalimat Sapaan / Pertanyaan Pembuka
                      </label>
                      <div className="flex items-center gap-1">
                        {['{nama_panggilan}', '{nama_lengkap}'].map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() =>
                              updateActiveProfile((p) => ({
                                ...p,
                                texts: {
                                  ...p.texts,
                                  greetingText: `${p.texts.greetingText} ${chip}`.trim(),
                                },
                              }))
                            }
                            className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-mono"
                          >
                            + {chip}
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea
                      rows={2}
                      value={activeProfile.texts.greetingText}
                      onChange={(e) =>
                        updateActiveProfile((p) => ({
                          ...p,
                          texts: { ...p.texts, greetingText: e.target.value },
                        }))
                      }
                      className="w-full p-2.5 bg-white border border-gray-200 rounded text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-medium text-gray-700">
                      Label Skala Bintang 1 sampai 5
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                      {['1', '2', '3', '4', '5'].map((star) => (
                        <div key={star} className="space-y-1">
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-gray-500">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                            Bintang {star}
                          </span>
                          <input
                            type="text"
                            value={activeProfile.texts.scaleLabels[star] || ''}
                            onChange={(e) =>
                              updateActiveProfile((p) => ({
                                ...p,
                                texts: {
                                  ...p.texts,
                                  scaleLabels: { ...p.texts.scaleLabels, [star]: e.target.value },
                                },
                              }))
                            }
                            className="w-full h-8 px-2 bg-white border border-gray-200 rounded text-[11px]"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 mb-1">
                        Label Kolom Komentar
                      </label>
                      <input
                        type="text"
                        value={activeProfile.texts.feedbackLabel}
                        onChange={(e) =>
                          updateActiveProfile((p) => ({
                            ...p,
                            texts: { ...p.texts, feedbackLabel: e.target.value },
                          }))
                        }
                        className="w-full h-8 px-2.5 bg-white border border-gray-200 rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 mb-1">
                        Placeholder Kolom Komentar
                      </label>
                      <input
                        type="text"
                        value={activeProfile.texts.feedbackPlaceholder}
                        onChange={(e) =>
                          updateActiveProfile((p) => ({
                            ...p,
                            texts: { ...p.texts, feedbackPlaceholder: e.target.value },
                          }))
                        }
                        className="w-full h-8 px-2.5 bg-white border border-gray-200 rounded text-xs"
                      />
                    </div>
                  </div>

                  <label className="inline-flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeProfile.texts.requireFeedbackOnLow}
                      onChange={(e) =>
                        updateActiveProfile((p) => ({
                          ...p,
                          texts: { ...p.texts, requireFeedbackOnLow: e.target.checked },
                        }))
                      }
                      className="rounded border-gray-300 text-indigo-600"
                    />
                    <span>Wajibkan pelanggan mengisi komentar jika rata-rata penilaian &le; 2</span>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 mb-1">
                        Teks Tombol Kirim
                      </label>
                      <input
                        type="text"
                        value={activeProfile.texts.submitButtonText}
                        onChange={(e) =>
                          updateActiveProfile((p) => ({
                            ...p,
                            texts: { ...p.texts, submitButtonText: e.target.value },
                          }))
                        }
                        className="w-full h-8 px-2.5 bg-white border border-gray-200 rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 mb-1">
                        Judul Setelah Kirim ({'{nama_panggilan}'})
                      </label>
                      <input
                        type="text"
                        value={activeProfile.texts.thankYouTitle}
                        onChange={(e) =>
                          updateActiveProfile((p) => ({
                            ...p,
                            texts: { ...p.texts, thankYouTitle: e.target.value },
                          }))
                        }
                        className="w-full h-8 px-2.5 bg-white border border-gray-200 rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 mb-1">
                        Pesan Terima Kasih
                      </label>
                      <input
                        type="text"
                        value={activeProfile.texts.thankYouMessage}
                        onChange={(e) =>
                          updateActiveProfile((p) => ({
                            ...p,
                            texts: { ...p.texts, thankYouMessage: e.target.value },
                          }))
                        }
                        className="w-full h-8 px-2.5 bg-white border border-gray-200 rounded text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {profileSubTab === 'target' && (
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-700 mb-1">
                      Nama Target Survei
                    </label>
                    <input
                      type="text"
                      value={activeProfile.name}
                      onChange={(e) =>
                        updateActiveProfile((p) => ({ ...p, name: e.target.value }))
                      }
                      className="w-full h-8 px-2.5 bg-white border border-gray-200 rounded text-xs"
                    />
                  </div>

                  {activeProfile.isDefault ? (
                    <div className="p-3 rounded-md bg-gray-50 border border-gray-200 text-[11px] text-gray-600 leading-relaxed">
                      Profil <strong>{activeProfile.name}</strong> digunakan otomatis untuk semua percakapan yang tidak cocok dengan target khusus lain. Klik <strong>Tambah Target Khusus</strong> di atas untuk membuat survei berbeda berdasarkan Sesi WAHA, Channel, atau Label percakapan.
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
                          Cocokkan Sesi WAHA (kosongkan = semua sesi)
                        </label>
                        {wahaSessions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {wahaSessions.map((s) => {
                              const checked = activeProfile.matchWahaSessions.includes(s.name);
                              return (
                                <button
                                  key={s.name}
                                  type="button"
                                  onClick={() =>
                                    updateActiveProfile((p) => ({
                                      ...p,
                                      matchWahaSessions: checked
                                        ? p.matchWahaSessions.filter((x) => x !== s.name)
                                        : [...p.matchWahaSessions, s.name],
                                    }))
                                  }
                                  className={`px-2 py-1 rounded border font-mono text-[11px] transition-colors ${
                                    checked
                                      ? 'bg-emerald-600 text-white border-emerald-600'
                                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                                  }`}
                                >
                                  {s.name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <input
                          type="text"
                          value={activeProfile.matchWahaSessions.join(', ')}
                          onChange={(e) =>
                            updateActiveProfile((p) => ({
                              ...p,
                              matchWahaSessions: e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean),
                            }))
                          }
                          placeholder="Nama sesi dipisah koma (mis. HRIS_HR, CS_KLINIK)"
                          className="w-full h-8 px-2.5 bg-white border border-gray-200 rounded text-[11px] font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
                          Cocokkan Channel (kosongkan = semua channel)
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {CHANNEL_OPTIONS.map((ch) => {
                            const checked = activeProfile.matchChannels.includes(ch);
                            return (
                              <button
                                key={ch}
                                type="button"
                                onClick={() =>
                                  updateActiveProfile((p) => ({
                                    ...p,
                                    matchChannels: checked
                                      ? p.matchChannels.filter((x) => x !== ch)
                                      : [...p.matchChannels, ch],
                                  }))
                                }
                                className={`px-2 py-1 rounded border font-mono text-[11px] transition-colors ${
                                  checked
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                                }`}
                              >
                                {ch}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">
                          Cocokkan Label Percakapan (pisahkan dengan koma, opsional)
                        </label>
                        <input
                          type="text"
                          value={activeProfile.matchLabels.join(', ')}
                          onChange={(e) =>
                            updateActiveProfile((p) => ({
                              ...p,
                              matchLabels: e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean),
                            }))
                          }
                          placeholder="Mis. Komplain, VIP, Konsultasi"
                          className="w-full h-8 px-2.5 bg-white border border-gray-200 rounded text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">
                          Pesan CTA WhatsApp Khusus Target Ini (Opsional)
                        </label>
                        <textarea
                          rows={2}
                          value={activeProfile.ctaTemplate || ''}
                          onChange={(e) =>
                            updateActiveProfile((p) => ({ ...p, ctaTemplate: e.target.value }))
                          }
                          placeholder="Kosongkan untuk memakai Template Pesan CTA CSAT Global di atas..."
                          className="w-full p-2 bg-white border border-gray-200 rounded text-xs"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {profileSubTab === 'preview' && (
                <div className="max-w-md mx-auto bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4">
                  <div className="pb-3 border-b border-gray-200">
                    {activeProfile.texts.brandName && (
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600">
                        {activeProfile.texts.brandName}
                      </div>
                    )}
                    <div className="text-sm font-semibold text-gray-900">
                      {activeProfile.texts.title}
                    </div>
                    <div className="text-[11px] text-gray-500">{activeProfile.texts.subtitle}</div>
                  </div>
                  <p className="text-xs text-gray-800">
                    {activeProfile.texts.greetingText
                      .replace(/\{nama_panggilan\}/gi, 'Budi')
                      .replace(/\{nama_lengkap\}/gi, 'Budi Santoso')}
                  </p>
                  <div className="space-y-2">
                    {activeProfile.criteria
                      .filter((c) => c.isActive)
                      .map((c) => (
                        <div
                          key={c.key}
                          className="p-2.5 rounded-lg border border-gray-200 bg-gray-50/50 space-y-1.5"
                        >
                          <div className="text-xs font-semibold text-gray-900">
                            {c.label}
                            {c.required && <span className="text-red-500 ml-0.5">*</span>}
                          </div>
                          {c.description && (
                            <p className="text-[10px] text-gray-500">{c.description}</p>
                          )}
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star key={s} className="w-5 h-5 text-amber-400 fill-amber-400" />
                            ))}
                            <span className="ml-auto text-[10px] text-indigo-700 font-medium">
                              {activeProfile.texts.scaleLabels['5'] || '5/5'}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] font-medium text-gray-700">
                      {activeProfile.texts.feedbackLabel}
                    </div>
                    <div className="p-2 rounded border border-gray-200 bg-gray-50 text-[11px] text-gray-400">
                      {activeProfile.texts.feedbackPlaceholder}
                    </div>
                  </div>
                  <div className="py-2 rounded-md bg-indigo-600 text-white text-center text-xs font-medium">
                    {activeProfile.texts.submitButtonText}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <Button type="submit" variant="primary" size="md" isLoading={savingCsat} disabled={!canEdit}>
              Simpan Pengaturan &amp; Target CSAT
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
