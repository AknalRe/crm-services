import React, { useCallback, useEffect, useState } from 'react';
import { Bot, BookOpen, Plus, Trash2, Send, Save } from 'lucide-react';
import api from '../services/api';
import { AiAgentConfig, AiKnowledgeItem } from '../types';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useToast } from '../components/ui/ToastProvider';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/StateBlocks';

export const AiAgent: React.FC = () => {
  const toast = useToast();
  const [config, setConfig] = useState<AiAgentConfig>({
    enabled: false,
    name: 'Asisten CRM',
    persona: '',
    autoReplyDm: false,
    autoReplyComment: false,
    provider: 'LOCAL_KB',
    model: 'gpt-4o-mini',
    apiKey: '',
  });
  const [knowledge, setKnowledge] = useState<AiKnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AiKnowledgeItem | null>(null);
  const [deletingKb, setDeletingKb] = useState(false);

  const [kbTitle, setKbTitle] = useState('');
  const [kbCategory, setKbCategory] = useState<'FAQ' | 'CATALOG' | 'POLICY' | 'WEB'>('FAQ');
  const [kbContent, setKbContent] = useState('');
  const [kbUrl, setKbUrl] = useState('');
  const [savingKb, setSavingKb] = useState(false);

  const [testMessage, setTestMessage] = useState('');
  const [testReply, setTestReply] = useState('');
  const [testing, setTesting] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, kb] = await Promise.all([api.getAiAgentConfig(), api.getAiKnowledge()]);
      setConfig(cfg);
      setKnowledge(kb || []);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal memuat Agent AI & Knowledge Base');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const saved = await api.saveAiAgentConfig(config);
      setConfig(saved);
      toast.success('Pengaturan Agent AI disimpan');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan konfigurasi');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleAddKb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kbTitle.trim() || !kbContent.trim()) return;
    setSavingKb(true);
    try {
      const created = await api.createAiKnowledge({
        title: kbTitle.trim(),
        category: kbCategory,
        content: kbContent.trim(),
        sourceUrl: kbUrl.trim() || null,
      });
      setKnowledge((prev) => [created, ...prev]);
      setKbTitle('');
      setKbContent('');
      setKbUrl('');
      toast.success('Knowledge Base ditambahkan');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menambahkan knowledge');
    } finally {
      setSavingKb(false);
    }
  };

  const handleDeleteKb = async (id: string) => {
    setDeletingKb(true);
    try {
      await api.deleteAiKnowledge(id);
      setKnowledge((prev) => prev.filter((k) => k.id !== id));
      setDeleteTarget(null);
      toast.success('Item Knowledge Base dihapus');
    } catch {
      toast.error('Gagal menghapus item knowledge');
    } finally {
      setDeletingKb(false);
    }
  };

  const handleTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testMessage.trim()) return;
    setTesting(true);
    try {
      const res = await api.testAiAgent(testMessage.trim());
      setTestReply(res.reply);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menguji balasan AI');
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <LoadingState message="Memuat Agent AI & Knowledge Base..." />;
  if (error) return <ErrorState message={error} onRetry={loadAll} />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Agent AI</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Agent AI membalas DM dan komentar pelanggan menggunakan Knowledge Base (FAQ, katalog produk, dan halaman web).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <form
          onSubmit={handleSaveConfig}
          className="lg:col-span-5 bg-white rounded-lg border border-gray-200 p-5 space-y-3.5 h-fit"
        >
          <div className="flex items-center justify-between pb-2.5 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Bot className="w-4 h-4 text-indigo-600" />
              <span>Konfigurasi Agent</span>
            </h2>
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig((c) => ({ ...c, enabled: e.target.checked }))}
                className="rounded border-gray-300"
              />
              Aktif
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nama Agent</label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => setConfig((c) => ({ ...c, name: e.target.value }))}
              className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Persona & Gaya Bahasa</label>
            <textarea
              rows={2}
              value={config.persona}
              onChange={(e) => setConfig((c) => ({ ...c, persona: e.target.value }))}
              className="w-full p-2.5 bg-white border border-gray-200 rounded-md text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Provider</label>
              <select
                value={config.provider}
                onChange={(e) => setConfig((c) => ({ ...c, provider: e.target.value as any }))}
                className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs"
              >
                <option value="LOCAL_KB">Knowledge Matcher (Lokal)</option>
                <option value="OPENAI">OpenAI API</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Model</label>
              <input
                type="text"
                value={config.model}
                onChange={(e) => setConfig((c) => ({ ...c, model: e.target.value }))}
                className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs font-mono"
              />
            </div>
          </div>

          {config.provider === 'OPENAI' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                API Key {config.hasApiKey ? '(Sudah tersimpan)' : ''}
              </label>
              <input
                type="password"
                placeholder="sk-..."
                value={config.apiKey || ''}
                onChange={(e) => setConfig((c) => ({ ...c, apiKey: e.target.value }))}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs font-mono"
              />
            </div>
          )}

          <div className="space-y-1.5 pt-1">
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={config.autoReplyDm}
                onChange={(e) => setConfig((c) => ({ ...c, autoReplyDm: e.target.checked }))}
              />
              <span>Balas DM masuk secara otomatis</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={config.autoReplyComment}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, autoReplyComment: e.target.checked }))
                }
              />
              <span>Balas komentar masuk secara otomatis</span>
            </label>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={savingConfig}
            leftIcon={<Save className="w-3.5 h-3.5" />}
          >
            Simpan Pengaturan
          </Button>
        </form>

        <div className="lg:col-span-7 space-y-5">
          <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3.5">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              <span>Knowledge Base ({knowledge.length})</span>
            </h2>

            <form onSubmit={handleAddKb} className="space-y-2.5 pb-3 border-b border-gray-100">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <input
                  type="text"
                  required
                  placeholder="Judul FAQ / Produk / Kebijakan..."
                  value={kbTitle}
                  onChange={(e) => setKbTitle(e.target.value)}
                  className="sm:col-span-8 h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
                />
                <select
                  value={kbCategory}
                  onChange={(e) => setKbCategory(e.target.value as any)}
                  className="sm:col-span-4 h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs"
                >
                  <option value="FAQ">FAQ</option>
                  <option value="CATALOG">Katalog Produk</option>
                  <option value="POLICY">Kebijakan</option>
                  <option value="WEB">Halaman Web</option>
                </select>
              </div>
              <textarea
                rows={2}
                required
                placeholder="Isi jawaban atau informasi produk..."
                value={kbContent}
                onChange={(e) => setKbContent(e.target.value)}
                className="w-full p-2.5 bg-white border border-gray-200 rounded-md text-xs"
              />
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  placeholder="URL Referensi (opsional)"
                  value={kbUrl}
                  onChange={(e) => setKbUrl(e.target.value)}
                  className="flex-1 h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={savingKb}
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                >
                  Tambah Knowledge
                </Button>
              </div>
            </form>

            {knowledge.length === 0 ? (
              <EmptyState
                title="Knowledge Base masih kosong"
                description="Tambahkan FAQ, katalog produk, atau informasi layanan agar Agent AI bisa menjawab dengan akurat."
              />
            ) : (
              <div className="divide-y divide-gray-200">
                {knowledge.map((k) => (
                  <div key={k.id} className="py-2.5 flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700">
                          {k.category}
                        </span>
                        <span className="text-xs font-semibold text-gray-900">{k.title}</span>
                      </div>
                      <p className="text-xs text-gray-600 whitespace-pre-wrap">{k.content}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(k)}
                      className="p-1 text-gray-400 hover:text-rose-600 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      title="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={handleTest}
            className="bg-white rounded-lg border border-gray-200 p-5 space-y-3"
          >
            <h3 className="text-xs font-semibold text-gray-900">Uji Balasan Agent</h3>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ketik contoh pertanyaan pelanggan..."
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                className="flex-1 h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
              />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                isLoading={testing}
                leftIcon={<Send className="w-3.5 h-3.5" />}
              >
                Uji
              </Button>
            </div>
            {testReply && (
              <div className="p-3 rounded bg-indigo-50/50 border border-indigo-100 text-xs text-gray-800 whitespace-pre-wrap">
                {testReply}
              </div>
            )}
          </form>
        </div>
      </div>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) void handleDeleteKb(deleteTarget.id);
        }}
        isLoading={deletingKb}
        title="Hapus Item Knowledge Base?"
        description={
          deleteTarget
            ? `Materi "${deleteTarget.title}" akan dihapus dan tidak lagi dipakai oleh Agent AI.`
            : ''
        }
        confirmLabel="Hapus"
        variant="danger"
      />
    </div>
  );
};

export default AiAgent;
