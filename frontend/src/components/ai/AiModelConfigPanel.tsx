import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import {
  AiAgentConfig,
  AiFallbackTarget,
  AiModelOption,
  AiProviderCatalogEntry,
  AiProviderId,
  AiSlotVerifyResult,
  ExternalAiProviderId,
} from '../../types';
import { Button } from '../ui/Button';

interface SlotEditorProps {
  slotId: string;
  catalog: AiProviderCatalogEntry[];
  allowLocalKb?: boolean;
  provider: AiProviderId;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  hasApiKey?: boolean;
  apiKeyPreview?: string;
  clearApiKey?: boolean;
  canInheritPrimaryKey?: boolean;
  fetchedModels: AiModelOption[];
  isManualModel: boolean;
  isFetchingModels: boolean;
  isVerifying: boolean;
  verifyResult?: AiSlotVerifyResult | null;
  onChange: (patch: {
    provider?: AiProviderId;
    model?: string;
    baseUrl?: string;
    apiKey?: string;
    hasApiKey?: boolean;
    apiKeyPreview?: string;
    clearApiKey?: boolean;
  }) => void;
  onToggleManualModel: (manual: boolean) => void;
  onFetchModels: () => void;
  onVerifySlot: () => void;
}

const AiSlotFields: React.FC<SlotEditorProps> = ({
  catalog,
  allowLocalKb = false,
  provider,
  model,
  baseUrl = '',
  apiKey = '',
  hasApiKey = false,
  apiKeyPreview = '',
  clearApiKey = false,
  canInheritPrimaryKey = false,
  fetchedModels,
  isManualModel,
  isFetchingModels,
  isVerifying,
  verifyResult,
  onChange,
  onToggleManualModel,
  onFetchModels,
  onVerifySlot,
}) => {
  const [showCustomUrl, setShowCustomUrl] = useState(Boolean(baseUrl));

  useEffect(() => {
    if (baseUrl) setShowCustomUrl(true);
  }, [baseUrl]);

  const providerOptions = useMemo(
    () => (allowLocalKb ? catalog : catalog.filter((p) => p.id !== 'LOCAL_KB')),
    [allowLocalKb, catalog]
  );

  const meta = useMemo(
    () => catalog.find((p) => p.id === provider) || catalog[0],
    [catalog, provider]
  );

  const mergedModels = useMemo(() => {
    const seen = new Set<string>();
    const apiList: AiModelOption[] = [];
    for (const m of fetchedModels) {
      if (!m.id || seen.has(m.id)) continue;
      seen.add(m.id);
      apiList.push({ ...m, source: 'api' });
    }
    const recList: AiModelOption[] = [];
    for (const m of meta?.recommendedModels || []) {
      if (!m.id || seen.has(m.id)) continue;
      seen.add(m.id);
      recList.push({ ...m, source: 'recommended' });
    }
    return { apiList, recList, allIds: seen };
  }, [fetchedModels, meta]);

  const isLocal = provider === 'LOCAL_KB';
  const showManualInput = isManualModel || (Boolean(model) && !mergedModels.allIds.has(model));

  const handleProviderSelect = (nextProvider: AiProviderId) => {
    const nextMeta = catalog.find((p) => p.id === nextProvider);
    setShowCustomUrl(Boolean(nextMeta?.requiresBaseUrl));
    onToggleManualModel(false);
    onChange({
      provider: nextProvider,
      model: nextMeta?.defaultModel || '',
      baseUrl: '',
      apiKey: '',
      hasApiKey: false,
      apiKeyPreview: '',
      clearApiKey: false,
    });
  };

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Provider AI</label>
          <select
            value={provider}
            onChange={(e) => handleProviderSelect(e.target.value as AiProviderId)}
            className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs"
          >
            {providerOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-gray-700">Model</label>
            {!isLocal && (
              <button
                type="button"
                onClick={() => onToggleManualModel(!showManualInput)}
                className="text-[11px] text-indigo-600 hover:text-indigo-700 font-medium"
              >
                {showManualInput ? 'Pilih daftar' : 'Input manual'}
              </button>
            )}
          </div>

          {isLocal ? (
            <div className="h-9 px-2.5 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-600 font-mono flex items-center">
              local-kb-matcher
            </div>
          ) : showManualInput ? (
            <input
              type="text"
              value={model}
              placeholder={meta?.defaultModel || 'nama-model'}
              onChange={(e) => onChange({ model: e.target.value })}
              className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs font-mono"
            />
          ) : (
            <select
              value={model}
              onChange={(e) => {
                if (e.target.value === '__MANUAL__') {
                  onToggleManualModel(true);
                } else {
                  onChange({ model: e.target.value });
                }
              }}
              className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs font-mono"
            >
              {mergedModels.apiList.length > 0 && (
                <optgroup label={`Model dari API (${mergedModels.apiList.length})`}>
                  {mergedModels.apiList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
              )}
              {mergedModels.recList.length > 0 && (
                <optgroup label="Rekomendasi">
                  {mergedModels.recList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.id})
                    </option>
                  ))}
                </optgroup>
              )}
              <option value="__MANUAL__">+ Tulis ID model kustom...</option>
            </select>
          )}
        </div>
      </div>

      {!isLocal && (
        <>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label className="text-xs font-medium text-gray-700">
                API Key{' '}
                {hasApiKey && !clearApiKey && (
                  <span className="font-mono text-[11px] font-normal text-emerald-700">
                    (Tersimpan: {apiKeyPreview || '••••'})
                  </span>
                )}
                {clearApiKey && (
                  <span className="text-[11px] font-normal text-amber-700">
                    (Key akan dihapus saat disimpan)
                  </span>
                )}
                {!hasApiKey && !clearApiKey && canInheritPrimaryKey && (
                  <span className="text-[11px] font-normal text-gray-500">
                    (Opsional: mewarisi key Utama)
                  </span>
                )}
              </label>

              <div className="flex items-center gap-2.5">
                {hasApiKey && !clearApiKey && (
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        apiKey: '',
                        hasApiKey: false,
                        apiKeyPreview: '',
                        clearApiKey: true,
                      })
                    }
                    className="text-[11px] text-rose-600 hover:text-rose-700 font-medium"
                  >
                    Hapus key
                  </button>
                )}
                {!meta?.requiresBaseUrl && (
                  <button
                    type="button"
                    onClick={() => setShowCustomUrl((v) => !v)}
                    className="text-[11px] text-gray-500 hover:text-gray-800"
                  >
                    {showCustomUrl ? 'Sembunyikan Base URL' : 'Override Base URL'}
                  </button>
                )}
              </div>
            </div>

            <input
              type="password"
              autoComplete="off"
              placeholder={
                hasApiKey && !clearApiKey
                  ? 'Biarkan kosong untuk tetap pakai API Key tersimpan'
                  : canInheritPrimaryKey
                    ? 'Kosongkan untuk pakai key Utama, atau isi key cadangan'
                    : meta?.apiKeyPlaceholder || 'API Key...'
              }
              value={apiKey}
              onChange={(e) =>
                onChange({
                  apiKey: e.target.value,
                  clearApiKey: false,
                })
              }
              className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs font-mono"
            />
          </div>

          {(meta?.requiresBaseUrl || showCustomUrl) && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Base URL Endpoint {meta?.requiresBaseUrl ? '(Wajib)' : '(Opsional)'}
              </label>
              <input
                type="url"
                placeholder={meta?.baseUrlPlaceholder || 'https://...'}
                value={baseUrl}
                onChange={(e) => onChange({ baseUrl: e.target.value })}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs font-mono"
              />
              {meta?.id === 'CUSTOM_OPENAI' && (
                <p className="text-[11px] text-gray-500 mt-1">
                  Contoh untuk Ollama dari Docker:{' '}
                  <code className="font-mono">http://host.docker.internal:11434/v1</code>
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {meta?.supportsModelFetch && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                isLoading={isFetchingModels}
                onClick={onFetchModels}
              >
                Muat Model API
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isLoading={isVerifying}
              onClick={onVerifySlot}
            >
              Uji Koneksi
            </Button>
          </div>
        </>
      )}

      {verifyResult && (
        <div
          className={`px-3 py-2 rounded-md border text-[11px] leading-relaxed ${
            verifyResult.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span className="font-semibold">
            {verifyResult.ok ? 'Terhubung' : 'Koneksi gagal'}
          </span>{' '}
          • <span className="font-mono">{verifyResult.model}</span> ({verifyResult.durationMs}ms)
          {verifyResult.ok && verifyResult.replyPreview ? `: "${verifyResult.replyPreview}"` : ''}
          {!verifyResult.ok && verifyResult.error ? ` — ${verifyResult.error}` : ''}
        </div>
      )}
    </div>
  );
};

interface AiModelConfigPanelProps {
  config: AiAgentConfig;
  catalog: AiProviderCatalogEntry[];
  savingConfig: boolean;
  fetchedModelsMap: Record<string, AiModelOption[]>;
  manualModelSlots: Record<string, boolean>;
  fetchingSlotId: string | null;
  verifyingSlotId: string | null;
  verifyResults: Record<string, AiSlotVerifyResult | null>;
  onChangeConfig: (updater: (prev: AiAgentConfig) => AiAgentConfig) => void;
  onClearVerifyResult: (slotId: string) => void;
  onToggleManualModel: (slotId: string, manual: boolean) => void;
  onFetchModels: (slot: {
    slotId: string;
    provider: AiProviderId;
    baseUrl?: string;
    apiKey?: string;
    clearApiKey?: boolean;
    currentModel?: string;
    onSelectDefault?: (firstId: string) => void;
  }) => void;
  onVerifySlot: (slot: {
    slotId: string;
    provider: AiProviderId;
    model: string;
    baseUrl?: string;
    apiKey?: string;
    clearApiKey?: boolean;
  }) => void;
  onAddFallback: () => void;
  onSave: (e: React.FormEvent) => void;
}

export const AiModelConfigPanel: React.FC<AiModelConfigPanelProps> = ({
  config,
  catalog,
  savingConfig,
  fetchedModelsMap,
  manualModelSlots,
  fetchingSlotId,
  verifyingSlotId,
  verifyResults,
  onChangeConfig,
  onClearVerifyResult,
  onToggleManualModel,
  onFetchModels,
  onVerifySlot,
  onAddFallback,
  onSave,
}) => {
  const buildModelCacheKey = (slotId: string, provider: AiProviderId, baseUrl?: string) =>
    `${slotId}:${provider}:${(baseUrl || '').trim()}`;

  const effectiveSlotUrl = (provider: AiProviderId, baseUrl?: string) => {
    const clean = (baseUrl || '').trim().replace(/\/+$/, '');
    if (clean) return clean;
    return catalog.find((c) => c.id === provider)?.defaultBaseUrl || '';
  };

  const primaryHasInheritCandidate = Boolean(
    config.apiKey?.trim() || (config.hasApiKey && !config.clearApiKey)
  );

  const updateFallback = (id: string, patch: Partial<AiFallbackTarget>) => {
    onChangeConfig((prev) => ({
      ...prev,
      fallbacks: prev.fallbacks.map((fb) => (fb.id === id ? { ...fb, ...patch } : fb)),
    }));
  };

  const moveFallback = (index: number, delta: -1 | 1) => {
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= config.fallbacks.length) return;
    onChangeConfig((prev) => {
      const next = [...prev.fallbacks];
      const [item] = next.splice(index, 1);
      next.splice(targetIdx, 0, item);
      return { ...prev, fallbacks: next };
    });
  };

  const removeFallback = (id: string) => {
    onClearVerifyResult(id);
    onChangeConfig((prev) => ({
      ...prev,
      fallbacks: prev.fallbacks.filter((fb) => fb.id !== id),
    }));
  };

  return (
    <form onSubmit={onSave} className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
      <div className="pb-2.5 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Integrasi Model AI &amp; Fallback</h2>
        <p className="text-[11px] text-gray-500 mt-0.5">
          Jika provider atau model utama error, limit (429), atau timeout, sistem otomatis mencoba daftar fallback secara berurutan.
        </p>
      </div>

      <div className="rounded-md border border-gray-200 bg-gray-50/60 p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-gray-900">Model Utama (Primary)</span>
          <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-semibold">
            Prioritas 1
          </span>
        </div>

        <AiSlotFields
          slotId="primary"
          catalog={catalog}
          allowLocalKb
          provider={config.provider}
          model={config.model}
          baseUrl={config.baseUrl}
          apiKey={config.apiKey}
          hasApiKey={config.hasApiKey}
          apiKeyPreview={config.apiKeyPreview}
          clearApiKey={config.clearApiKey}
          fetchedModels={
            fetchedModelsMap[buildModelCacheKey('primary', config.provider, config.baseUrl)] || []
          }
          isManualModel={Boolean(manualModelSlots.primary)}
          isFetchingModels={fetchingSlotId === 'primary'}
          isVerifying={verifyingSlotId === 'primary'}
          verifyResult={verifyResults.primary}
          onChange={(patch) => {
            onClearVerifyResult('primary');
            onChangeConfig((prev) => ({ ...prev, ...patch }));
          }}
          onToggleManualModel={(manual) => onToggleManualModel('primary', manual)}
          onFetchModels={() =>
            onFetchModels({
              slotId: 'primary',
              provider: config.provider,
              baseUrl: config.baseUrl,
              apiKey: config.apiKey,
              clearApiKey: config.clearApiKey,
              currentModel: config.model,
              onSelectDefault: (firstId) =>
                onChangeConfig((prev) => ({ ...prev, model: firstId })),
            })
          }
          onVerifySlot={() =>
            onVerifySlot({
              slotId: 'primary',
              provider: config.provider,
              model: config.model,
              baseUrl: config.baseUrl,
              apiKey: config.apiKey,
              clearApiKey: config.clearApiKey,
            })
          }
        />
      </div>

      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-gray-900">
              Rantai Fallback ({config.fallbacks.length}/10)
            </h3>
            <p className="text-[11px] text-gray-500">
              Bisa memakai provider lain (misal OpenAI lalu Gemini/Groq) atau model cadangan di provider yang sama.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onAddFallback}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Tambah Fallback
          </Button>
        </div>

        {config.fallbacks.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-200 px-3.5 py-3 text-[11px] text-gray-500">
            Belum ada fallback API eksternal. Klik &ldquo;Tambah Fallback&rdquo; untuk menyiapkan provider atau model cadangan.
          </div>
        ) : (
          <div className="space-y-3">
            {config.fallbacks.map((fb, idx) => {
              const fbEffectiveUrl = effectiveSlotUrl(fb.provider, fb.baseUrl);
              const canInheritPrimary =
                fb.provider === config.provider &&
                fbEffectiveUrl === effectiveSlotUrl(config.provider, config.baseUrl) &&
                primaryHasInheritCandidate;
              const canInheritEarlier = config.fallbacks.slice(0, idx).some(
                (earlier) =>
                  earlier.enabled &&
                  earlier.provider === fb.provider &&
                  effectiveSlotUrl(earlier.provider, earlier.baseUrl) === fbEffectiveUrl &&
                  Boolean(earlier.apiKey?.trim() || (earlier.hasApiKey && !earlier.clearApiKey))
              );
              const canInherit = canInheritPrimary || canInheritEarlier;

              return (
                <div
                  key={fb.id}
                  className={`rounded-md border p-3.5 space-y-2.5 ${
                    fb.enabled ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-75'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-100">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-semibold text-gray-900">
                        Fallback #{idx + 1}
                      </span>
                      <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-700">
                        <input
                          type="checkbox"
                          checked={fb.enabled}
                          onChange={(e) => updateFallback(fb.id, { enabled: e.target.checked })}
                        />
                        Aktif
                      </label>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveFallback(idx, -1)}
                        title="Naikkan prioritas"
                        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === config.fallbacks.length - 1}
                        onClick={() => moveFallback(idx, 1)}
                        title="Turunkan prioritas"
                        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFallback(fb.id)}
                        title="Hapus fallback"
                        className="p-1 text-gray-400 hover:text-rose-600 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <AiSlotFields
                    slotId={fb.id}
                    catalog={catalog}
                    allowLocalKb={false}
                    provider={fb.provider}
                    model={fb.model}
                    baseUrl={fb.baseUrl}
                    apiKey={fb.apiKey}
                    hasApiKey={fb.hasApiKey}
                    apiKeyPreview={fb.apiKeyPreview}
                    clearApiKey={fb.clearApiKey}
                    canInheritPrimaryKey={canInherit}
                    fetchedModels={
                      fetchedModelsMap[buildModelCacheKey(fb.id, fb.provider, fb.baseUrl)] || []
                    }
                    isManualModel={Boolean(manualModelSlots[fb.id])}
                    isFetchingModels={fetchingSlotId === fb.id}
                    isVerifying={verifyingSlotId === fb.id}
                    verifyResult={verifyResults[fb.id]}
                    onChange={(patch) => {
                      onClearVerifyResult(fb.id);
                      updateFallback(fb.id, patch as Partial<AiFallbackTarget>);
                    }}
                    onToggleManualModel={(manual) => onToggleManualModel(fb.id, manual)}
                    onFetchModels={() =>
                      onFetchModels({
                        slotId: fb.id,
                        provider: fb.provider,
                        baseUrl: fb.baseUrl,
                        apiKey: fb.apiKey,
                        clearApiKey: fb.clearApiKey,
                        currentModel: fb.model,
                        onSelectDefault: (firstId) => updateFallback(fb.id, { model: firstId }),
                      })
                    }
                    onVerifySlot={() =>
                      onVerifySlot({
                        slotId: fb.id,
                        provider: fb.provider,
                        model: fb.model,
                        baseUrl: fb.baseUrl,
                        apiKey: fb.apiKey,
                        clearApiKey: fb.clearApiKey,
                      })
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {config.provider !== 'LOCAL_KB' && (
        <label className="flex items-start gap-2 text-xs text-gray-700 pt-1">
          <input
            type="checkbox"
            checked={config.fallbackToLocalKb}
            onChange={(e) =>
              onChangeConfig((c) => ({ ...c, fallbackToLocalKb: e.target.checked }))
            }
            className="mt-0.5"
          />
          <span>
            Fallback terakhir ke <strong>Knowledge Matcher (Lokal)</strong> jika semua provider API gagal merespons
          </span>
        </label>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-gray-100">
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1">Temperature</label>
          <input
            type="number"
            min={0}
            max={1.5}
            step={0.1}
            value={config.temperature}
            onChange={(e) =>
              onChangeConfig((c) => ({
                ...c,
                temperature: Number.isFinite(Number(e.target.value))
                  ? Number(e.target.value)
                  : 0.4,
              }))
            }
            className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs font-mono"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1">Max Tokens</label>
          <input
            type="number"
            min={64}
            max={4096}
            step={50}
            value={config.maxTokens}
            onChange={(e) =>
              onChangeConfig((c) => ({
                ...c,
                maxTokens: Number.isFinite(Number(e.target.value))
                  ? Number(e.target.value)
                  : 800,
              }))
            }
            className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs font-mono"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1">Timeout (dtk)</label>
          <input
            type="number"
            min={3}
            max={60}
            step={1}
            value={Math.round((config.timeoutMs || 15000) / 1000)}
            onChange={(e) => {
              const sec = Number(e.target.value);
              onChangeConfig((c) => ({
                ...c,
                timeoutMs: Number.isFinite(sec) ? Math.max(3, Math.min(60, sec)) * 1000 : 15000,
              }));
            }}
            className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs font-mono"
          />
        </div>
      </div>

      <div className="pt-1">
        <Button type="submit" variant="primary" size="sm" isLoading={savingConfig}>
          Simpan Konfigurasi Model
        </Button>
      </div>
    </form>
  );
};
