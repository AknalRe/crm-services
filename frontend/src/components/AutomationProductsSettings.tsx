import React, { useEffect, useState } from 'react';
import { Bot, Package, Plus, Save, Trash2, BellRing } from 'lucide-react';
import api from '../services/api';
import { AutomationConfig, AutoReplyRule, ProductItem } from '../types';
import { Button } from './ui/Button';
import { useToast } from './ui/ToastProvider';

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

export const AutomationProductsSettings: React.FC = () => {
  const toast = useToast();
  const [config, setConfig] = useState<AutomationConfig>(DEFAULT_CONFIG);
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [savingAuto, setSavingAuto] = useState(false);

  const [newKeyword, setNewKeyword] = useState('');
  const [newMatchType, setNewMatchType] = useState<'CONTAINS' | 'EXACT' | 'STARTS_WITH'>('CONTAINS');
  const [newReplyText, setNewReplyText] = useState('');
  const [addingRule, setAddingRule] = useState(false);

  const [prodSku, setProdSku] = useState('');
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodUnit, setProdUnit] = useState('pcs');
  const [prodDesc, setProdDesc] = useState('');
  const [addingProd, setAddingProd] = useState(false);

  useEffect(() => {
    api
      .getAutomationSettings()
      .then((data) => {
        if (data?.config) setConfig(data.config);
        setRules(data?.rules || []);
      })
      .catch(() => {});
    api
      .getProducts(false)
      .then((list) => setProducts(list || []))
      .catch(() => {});
  }, []);

  const handleSaveAutomation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAuto(true);
    try {
      await api.saveAutomationSettings(config);
      toast.success('Pengaturan otomatisasi, routing & SLA disimpan');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan pengaturan otomatisasi');
    } finally {
      setSavingAuto(false);
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim() || !newReplyText.trim()) return;
    setAddingRule(true);
    try {
      const created = await api.createAutoReplyRule({
        keyword: newKeyword.trim(),
        matchType: newMatchType,
        replyText: newReplyText.trim(),
      });
      setRules((prev) => [...prev, created]);
      setNewKeyword('');
      setNewReplyText('');
      toast.success('Aturan kata kunci ditambahkan');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menambah aturan');
    } finally {
      setAddingRule(false);
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

  const handleDeleteRule = async (id: string) => {
    try {
      await api.deleteAutoReplyRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch {
      toast.error('Gagal menghapus aturan');
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim()) return;
    setAddingProd(true);
    try {
      const created = await api.createProduct({
        sku: prodSku.trim() || undefined,
        name: prodName.trim(),
        category: prodCategory.trim() || undefined,
        price: Number(prodPrice) || 0,
        unit: prodUnit.trim() || 'pcs',
        description: prodDesc.trim() || undefined,
      });
      setProducts((prev) => [...prev, created]);
      setProdSku('');
      setProdName('');
      setProdCategory('');
      setProdPrice('');
      setProdUnit('pcs');
      setProdDesc('');
      toast.success('Produk ditambahkan ke katalog');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menambahkan produk');
    } finally {
      setAddingProd(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      await api.deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch {
      toast.error('Gagal menghapus produk');
    }
  };

  return (
    <div className="space-y-6">
      {/* Automation, Routing & SLA Escalation */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-200">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Bot className="w-4 h-4 text-indigo-600" />
              Otomatisasi, Routing Agent &amp; Eskalasi SLA
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Atur pembagian chat otomatis ke agent, pesan selamat datang, balasan di luar jam kerja, dan alert SLA.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveAutomation} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-md border border-gray-200 bg-gray-50/70 space-y-2">
              <label className="block text-xs font-semibold text-gray-800">
                Routing Otomatis Chat Masuk (Auto-Assign)
              </label>
              <select
                value={config.autoAssignMode}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    autoAssignMode: e.target.value as AutomationConfig['autoAssignMode'],
                  }))
                }
                className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs text-gray-800 focus:outline-none focus:border-indigo-500"
              >
                <option value="NONE">Manual (Tidak otomatis)</option>
                <option value="ROUND_ROBIN">Round-Robin (Giliran merata)</option>
                <option value="LEAST_BUSY">Beban Terendah (Agent chat Open paling sedikit)</option>
              </select>
              <p className="text-[11px] text-gray-500">
                Hanya berlaku untuk percakapan baru atau yang belum ditugaskan ke agent.
              </p>
            </div>

            <div className="p-3.5 rounded-md border border-gray-200 bg-gray-50/70 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-gray-800 flex items-center gap-1.5">
                  <BellRing className="w-3.5 h-3.5 text-amber-600" />
                  Eskalasi SLA &amp; Alert CSAT Rendah
                </label>
                <input
                  type="checkbox"
                  checked={config.slaEscalationEnabled}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, slaEscalationEnabled: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                />
              </div>
              <input
                type="url"
                placeholder="Webhook Alert (opsional, mis. https://hooks.slack.com/...)"
                value={config.slaAlertWebhookUrl}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, slaAlertWebhookUrl: e.target.value }))
                }
                className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-gray-500">
                Menandai chat terlewat SLA di Live Chat dan mengirim alert jika ada rating CSAT ≤ 2.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-md border border-gray-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-800">Pesan Selamat Datang (Chat Baru)</span>
                <input
                  type="checkbox"
                  checked={config.welcomeEnabled}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, welcomeEnabled: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                />
              </div>
              <textarea
                rows={3}
                value={config.welcomeMessage}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, welcomeMessage: e.target.value }))
                }
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded text-xs focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[10px] text-gray-400">Variabel: {'{nama_panggilan}'}, {'{nama_lengkap}'}</p>
            </div>

            <div className="p-3.5 rounded-md border border-gray-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-800">Auto-Reply di Luar Jam Kerja</span>
                <input
                  type="checkbox"
                  checked={config.offhoursEnabled}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, offhoursEnabled: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500 block mb-0.5">Jam Buka (WIB)</label>
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
                  <label className="text-[10px] text-gray-500 block mb-0.5">Jam Tutup (WIB)</label>
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
              <textarea
                rows={2}
                value={config.offhoursMessage}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, offhoursMessage: e.target.value }))
                }
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="primary" size="md" isLoading={savingAuto} leftIcon={<Save className="w-4 h-4" />}>
              Simpan Pengaturan Otomatisasi
            </Button>
          </div>
        </form>

        {/* Keyword Auto-Reply Rules */}
        <div className="pt-4 border-t border-gray-200 space-y-3">
          <h3 className="text-xs font-semibold text-gray-900">Aturan Balasan Kata Kunci (Auto-Reply)</h3>
          <form onSubmit={handleAddRule} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <input
              type="text"
              required
              placeholder="Kata kunci (mis. harga)"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              className="sm:col-span-3 h-9 px-2.5 bg-gray-50 border border-gray-200 rounded-md text-xs font-mono"
            />
            <select
              value={newMatchType}
              onChange={(e) => setNewMatchType(e.target.value as any)}
              className="sm:col-span-2 h-9 px-2 bg-gray-50 border border-gray-200 rounded-md text-xs"
            >
              <option value="CONTAINS">Mengandung</option>
              <option value="EXACT">Sama Persis</option>
              <option value="STARTS_WITH">Diawali</option>
            </select>
            <input
              type="text"
              required
              placeholder="Isi balasan otomatis..."
              value={newReplyText}
              onChange={(e) => setNewReplyText(e.target.value)}
              className="sm:col-span-5 h-9 px-2.5 bg-gray-50 border border-gray-200 rounded-md text-xs"
            />
            <Button type="submit" variant="secondary" size="md" isLoading={addingRule} leftIcon={<Plus className="w-3.5 h-3.5" />} className="sm:col-span-2">
              Tambah
            </Button>
          </form>

          {rules.length > 0 && (
            <div className="border border-gray-200 rounded-md divide-y divide-gray-100">
              {rules.map((r) => (
                <div key={r.id} className="px-3 py-2 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono text-[10px]">
                        {r.keyword}
                      </span>
                      <span className="text-[10px] text-gray-400">{r.matchType}</span>
                    </div>
                    <p className="text-gray-600 truncate mt-0.5">{r.replyText}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleToggleRule(r)}
                      className={`h-6 px-2 rounded text-[10px] font-medium border ${
                        r.isActive
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-gray-50 text-gray-500 border-gray-200'
                      }`}
                    >
                      {r.isActive ? 'Aktif' : 'Nonaktif'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteRule(r.id)}
                      className="p-1 text-gray-400 hover:text-red-600"
                      title="Hapus Aturan"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Product Catalog Management */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <div className="pb-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Package className="w-4 h-4 text-indigo-600" />
            Katalog Produk &amp; Layanan (Quick Quote)
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Produk di sini dapat langsung disisipkan sebagai penawaran cepat oleh agent di Live Chat CRM.
          </p>
        </div>

        <form onSubmit={handleAddProduct} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <input
            type="text"
            placeholder="SKU"
            value={prodSku}
            onChange={(e) => setProdSku(e.target.value)}
            className="sm:col-span-2 h-9 px-2.5 bg-gray-50 border border-gray-200 rounded-md text-xs font-mono"
          />
          <input
            type="text"
            required
            placeholder="Nama produk / jasa"
            value={prodName}
            onChange={(e) => setProdName(e.target.value)}
            className="sm:col-span-3 h-9 px-2.5 bg-gray-50 border border-gray-200 rounded-md text-xs"
          />
          <input
            type="text"
            placeholder="Kategori"
            value={prodCategory}
            onChange={(e) => setProdCategory(e.target.value)}
            className="sm:col-span-2 h-9 px-2.5 bg-gray-50 border border-gray-200 rounded-md text-xs"
          />
          <input
            type="number"
            min={0}
            required
            placeholder="Harga (Rp)"
            value={prodPrice}
            onChange={(e) => setProdPrice(e.target.value)}
            className="sm:col-span-2 h-9 px-2.5 bg-gray-50 border border-gray-200 rounded-md text-xs font-mono"
          />
          <input
            type="text"
            placeholder="Satuan"
            value={prodUnit}
            onChange={(e) => setProdUnit(e.target.value)}
            className="sm:col-span-1 h-9 px-2 bg-gray-50 border border-gray-200 rounded-md text-xs"
          />
          <Button type="submit" variant="primary" size="md" isLoading={addingProd} leftIcon={<Plus className="w-3.5 h-3.5" />} className="sm:col-span-2">
            Tambah
          </Button>
          <input
            type="text"
            placeholder="Deskripsi singkat produk (opsional)..."
            value={prodDesc}
            onChange={(e) => setProdDesc(e.target.value)}
            className="sm:col-span-12 h-9 px-2.5 bg-gray-50 border border-gray-200 rounded-md text-xs"
          />
        </form>

        {products.length > 0 && (
          <div className="overflow-x-auto border border-gray-200 rounded-md">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase text-gray-500">
                  <th className="py-2 px-3">SKU</th>
                  <th className="py-2 px-3">Produk</th>
                  <th className="py-2 px-3">Kategori</th>
                  <th className="py-2 px-3">Harga</th>
                  <th className="py-2 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="py-2 px-3 font-mono text-[11px] text-gray-600">{p.sku}</td>
                    <td className="py-2 px-3 font-medium text-gray-900">
                      <div>{p.name}</div>
                      {p.description && <div className="text-[11px] text-gray-500 font-normal">{p.description}</div>}
                    </td>
                    <td className="py-2 px-3 text-gray-600">{p.category || '-'}</td>
                    <td className="py-2 px-3 font-mono text-gray-900 whitespace-nowrap">
                      Rp {new Intl.NumberFormat('id-ID').format(p.price || 0)} / {p.unit}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => void handleDeleteProduct(p.id)}
                        className="p-1 text-gray-400 hover:text-red-600"
                        title="Hapus Produk"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
