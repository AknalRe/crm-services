import React, { useCallback, useEffect, useState } from 'react';
import { Bot, Clock, Edit3, Trash2 } from 'lucide-react';
import api from '../services/api';
import { AutomationConfig, AutoReplyRule } from '../types';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { ConfirmModal } from './ui/ConfirmModal';
import { LoadingState, EmptyState, ErrorState } from './ui/StateBlocks';
import { useToast } from './ui/ToastProvider';

const WEEKDAYS = [
  { day: '1', label: 'Sen' },
  { day: '2', label: 'Sel' },
  { day: '3', label: 'Rab' },
  { day: '4', label: 'Kam' },
  { day: '5', label: 'Jum' },
  { day: '6', label: 'Sab' },
  { day: '0', label: 'Min' },
];

const DEFAULT_CONFIG: AutomationConfig = {
  autoAssignMode: 'NONE',
  welcomeEnabled: false,
  welcomeMessage:
    'Halo {nama_panggilan}, terima kasih telah menghubungi kami! Tim kami akan segera membalas pesan Anda.',
  offhoursEnabled: false,
  businessHoursStart: '08:00',
  businessHoursEnd: '17:00',
  businessDays: '1,2,3,4,5',
  offhoursMessage:
    'Halo {nama_panggilan}, saat ini kami sedang di luar jam operasional (08:00–17:00 WIB). Pesan Anda tetap kami catat dan akan dibalas saat jam kerja.',
  slaEscalationEnabled: true,
  slaAlertWebhookUrl: '',
};

const MATCH_TYPE_LABELS: Record<AutoReplyRule['matchType'], string> = {
  CONTAINS: 'Mengandung',
  EXACT: 'Sama Persis',
  STARTS_WITH: 'Diawali',
};

export const AutomationSettings: React.FC<{ canEdit?: boolean }> = ({ canEdit = true }) => {
  const toast = useToast();
  const [config, setConfig] = useState<AutomationConfig>(DEFAULT_CONFIG);
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingAuto, setSavingAuto] = useState(false);

  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoReplyRule | null>(null);
  const [ruleKeyword, setRuleKeyword] = useState('');
  const [ruleMatchType, setRuleMatchType] = useState<AutoReplyRule['matchType']>('CONTAINS');
  const [rulePriority, setRulePriority] = useState('10');
  const [ruleReplyText, setRuleReplyText] = useState('');
  const [savingRule, setSavingRule] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AutoReplyRule | null>(null);
  const [deletingRule, setDeletingRule] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAutomationSettings();
      if (data?.config) setConfig(data.config);
      setRules(data?.rules || []);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal memuat pengaturan auto-reply');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeDays = new Set(
    (config.businessDays || '1,2,3,4,5')
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean)
  );

  const toggleBusinessDay = (day: string) => {
    const next = new Set(activeDays);
    if (next.has(day)) {
      if (next.size <= 1) return;
      next.delete(day);
    } else {
      next.add(day);
    }
    setConfig((prev) => ({
      ...prev,
      businessDays: Array.from(next).sort().join(','),
    }));
  };

  const handleSaveAutomation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingAuto) return;
    setSavingAuto(true);
    try {
      await api.saveAutomationSettings({
        welcomeEnabled: config.welcomeEnabled,
        welcomeMessage: config.welcomeMessage,
        offhoursEnabled: config.offhoursEnabled,
        businessHoursStart: config.businessHoursStart,
        businessHoursEnd: config.businessHoursEnd,
        businessDays: config.businessDays,
        offhoursMessage: config.offhoursMessage,
      });
      toast.success('Pengaturan Auto-Reply & Jam Operasional disimpan');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan pengaturan auto-reply');
    } finally {
      setSavingAuto(false);
    }
  };

  const openCreateRule = () => {
    setEditingRule(null);
    setRuleKeyword('');
    setRuleMatchType('CONTAINS');
    setRulePriority(String((rules.length + 1) * 10));
    setRuleReplyText('');
    setRuleModalOpen(true);
  };

  const openEditRule = (rule: AutoReplyRule) => {
    setEditingRule(rule);
    setRuleKeyword(rule.keyword);
    setRuleMatchType(rule.matchType);
    setRulePriority(String(rule.priority ?? 10));
    setRuleReplyText(rule.replyText);
    setRuleModalOpen(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleKeyword.trim() || !ruleReplyText.trim() || savingRule) return;
    setSavingRule(true);
    try {
      if (editingRule) {
        const updated = await api.updateAutoReplyRule(editingRule.id, {
          keyword: ruleKeyword.trim(),
          matchType: ruleMatchType,
          priority: Number(rulePriority) || 10,
          replyText: ruleReplyText.trim(),
        });
        setRules((prev) =>
          prev
            .map((r) => (r.id === editingRule.id ? updated : r))
            .sort((a, b) => (a.priority ?? 10) - (b.priority ?? 10))
        );
        toast.success('Aturan kata kunci diperbarui');
      } else {
        const created = await api.createAutoReplyRule({
          keyword: ruleKeyword.trim(),
          matchType: ruleMatchType,
          priority: Number(rulePriority) || 10,
          replyText: ruleReplyText.trim(),
        });
        setRules((prev) =>
          [...prev, created].sort((a, b) => (a.priority ?? 10) - (b.priority ?? 10))
        );
        toast.success('Aturan kata kunci ditambahkan');
      }
      setRuleModalOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan aturan kata kunci');
    } finally {
      setSavingRule(false);
    }
  };

  const handleToggleRule = async (rule: AutoReplyRule) => {
    try {
      const updated = await api.updateAutoReplyRule(rule.id, { isActive: !rule.isActive });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
    } catch {
      toast.error('Gagal memperbarui status aturan');
    }
  };

  const handleConfirmDeleteRule = async () => {
    if (!deleteTarget || deletingRule) return;
    setDeletingRule(true);
    try {
      await api.deleteAutoReplyRule(deleteTarget.id);
      setRules((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      toast.success(`Aturan "${deleteTarget.keyword}" dihapus`);
      setDeleteTarget(null);
    } catch {
      toast.error('Gagal menghapus aturan');
    } finally {
      setDeletingRule(false);
    }
  };

  if (loading) return <LoadingState message="Memuat pengaturan Auto-Reply & Jam Kerja..." />;
  if (error) return <ErrorState message={error} onRetry={loadData} />;

  return (
    <div className="space-y-5">
      {/* Card 1: Pesan Selamat Datang & Jam Operasional */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5 space-y-4">
        <div className="pb-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-600" />
            Auto-Reply Chat &amp; Jam Operasional
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Atur balasan otomatis saat chat baru masuk dan jadwal operasional WIB (di luar jam/hari kerja akan dibalas otomatis).
          </p>
        </div>

        <form onSubmit={handleSaveAutomation} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-3.5 rounded-md border border-gray-200 space-y-2.5 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-800">Pesan Selamat Datang (Chat Baru)</span>
                <label className="inline-flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.welcomeEnabled}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, welcomeEnabled: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                  />
                  <span>Aktif</span>
                </label>
              </div>
              <textarea
                rows={4}
                value={config.welcomeMessage}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, welcomeMessage: e.target.value }))
                }
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
            <p className="text-[11px] text-gray-400">Variabel: {'{nama_panggilan}'}, {'{nama_lengkap}'}</p>
          </div>

          <div className="p-3.5 rounded-md border border-gray-200 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-gray-800">Auto-Reply di Luar Jam Kerja</span>
              <label className="inline-flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.offhoursEnabled}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, offhoursEnabled: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                />
                <span>Aktif</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-gray-500 block mb-1">Jam Buka (WIB)</label>
                <input
                  type="time"
                  value={config.businessHoursStart}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, businessHoursStart: e.target.value }))
                  }
                  className="w-full h-8 px-2 bg-gray-50 border border-gray-200 rounded text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-gray-500 block mb-1">Jam Tutup (WIB)</label>
                <input
                  type="time"
                  value={config.businessHoursEnd}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, businessHoursEnd: e.target.value }))
                  }
                  className="w-full h-8 px-2 bg-gray-50 border border-gray-200 rounded text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] text-gray-500 block mb-1">Hari Operasional</label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((w) => {
                  const active = activeDays.has(w.day);
                  return (
                    <button
                      key={w.day}
                      type="button"
                      onClick={() => toggleBusinessDay(w.day)}
                      className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                        active
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <textarea
              rows={2}
              value={config.offhoursMessage}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, offhoursMessage: e.target.value }))
              }
              className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="lg:col-span-2 flex justify-end">
            <Button type="submit" variant="primary" size="md" isLoading={savingAuto} disabled={!canEdit}>
              Simpan Auto-Reply &amp; Jam Kerja
            </Button>
          </div>
        </form>
      </div>

      {/* Card 2: Aturan Kata Kunci Auto-Reply */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Master Aturan Kata Kunci (Keyword Auto-Reply)
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Balasan otomatis instan saat pesan masuk cocok dengan kata kunci (angka prioritas kecil diproses lebih dulu).
            </p>
          </div>
          {canEdit && (
            <Button type="button" variant="secondary" size="sm" onClick={openCreateRule}>
              Tambah Aturan
            </Button>
          )}
        </div>

        {rules.length === 0 ? (
          <EmptyState
            icon={<Bot className="w-6 h-6" />}
            title="Belum ada aturan kata kunci"
            description="Tambahkan kata kunci seperti 'harga', 'alamat', atau 'promo' agar dibalas otomatis tanpa menunggu agent."
          />
        ) : (
          <div className="border border-gray-200 rounded-md divide-y divide-gray-100">
            {rules.map((r) => (
              <div
                key={r.id}
                className="px-3.5 py-2.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-3 text-xs hover:bg-gray-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono text-[10px]">
                      #{r.priority ?? 10}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono text-[11px] font-semibold">
                      {r.keyword}
                    </span>
                    <span className="text-[11px] text-gray-500">
                      ({MATCH_TYPE_LABELS[r.matchType] || r.matchType})
                    </span>
                  </div>
                  <p className="text-gray-700 mt-1 line-clamp-2 whitespace-pre-wrap">{r.replyText}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => void handleToggleRule(r)}
                    className={`h-6 px-2 rounded text-[10px] font-semibold border cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                      r.isActive
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-gray-50 text-gray-500 border-gray-200'
                    }`}
                  >
                    {r.isActive ? 'Aktif' : 'Nonaktif'}
                  </button>
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        onClick={() => openEditRule(r)}
                        className="p-1 text-gray-400 hover:text-indigo-700"
                        title="Edit Aturan"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(r)}
                        className="p-1 text-gray-400 hover:text-red-600"
                        title="Hapus Aturan"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={ruleModalOpen}
        onClose={() => !savingRule && setRuleModalOpen(false)}
        title={editingRule ? `Edit Aturan "${editingRule.keyword}"` : 'Tambah Aturan Kata Kunci'}
        isLoading={savingRule}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setRuleModalOpen(false)} disabled={savingRule}>
              Batal
            </Button>
            <Button type="submit" form="autoreply-rule-form" variant="primary" isLoading={savingRule}>
              {editingRule ? 'Simpan Perubahan' : 'Simpan Aturan'}
            </Button>
          </>
        }
      >
        <form id="autoreply-rule-form" onSubmit={handleSaveRule} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-5">
              <label className="block text-xs font-medium text-gray-700 mb-1">Kata Kunci</label>
              <input
                type="text"
                required
                placeholder="mis. harga, ongkir, katalog"
                value={ruleKeyword}
                onChange={(e) => setRuleKeyword(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="sm:col-span-4">
              <label className="block text-xs font-medium text-gray-700 mb-1">Metode Cocok</label>
              <select
                value={ruleMatchType}
                onChange={(e) => setRuleMatchType(e.target.value as AutoReplyRule['matchType'])}
                className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="CONTAINS">Mengandung Kata</option>
                <option value="EXACT">Sama Persis</option>
                <option value="STARTS_WITH">Diawali Kata</option>
              </select>
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Prioritas</label>
              <input
                type="number"
                min={1}
                value={rulePriority}
                onChange={(e) => setRulePriority(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
              <label className="text-xs font-medium text-gray-700">Balasan Otomatis</label>
              <div className="flex flex-wrap gap-1">
                {['{nama_panggilan}', '{nama_lengkap}'].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() =>
                      setRuleReplyText((prev) => `${prev}${!prev || prev.endsWith(' ') || prev.endsWith('\n') ? '' : ' '}${chip}`)
                    }
                    className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-mono hover:bg-indigo-100"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              rows={4}
              required
              placeholder="Halo {nama_panggilan}, untuk daftar harga terbaru..."
              value={ruleReplyText}
              onChange={(e) => setRuleReplyText(e.target.value)}
              className="w-full p-2.5 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => !deletingRule && setDeleteTarget(null)}
        onConfirm={handleConfirmDeleteRule}
        isLoading={deletingRule}
        title={`Hapus Aturan "${deleteTarget?.keyword}"?`}
        description="Aturan kata kunci ini tidak akan membalas pesan masuk lagi."
        confirmLabel="Ya, Hapus"
        variant="danger"
      />
    </div>
  );
};
