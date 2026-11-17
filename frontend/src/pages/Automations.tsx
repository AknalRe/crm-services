import React, { useCallback, useEffect, useState } from 'react';
import { Zap, Trash2, Power } from 'lucide-react';
import api from '../services/api';
import { AuthStatus, CommentAutomationItem } from '../types';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useToast } from '../components/ui/ToastProvider';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/StateBlocks';
import { hasPerm } from '../lib/permissions';

export const Automations: React.FC<{ currentUser?: AuthStatus['user'] | null }> = ({ currentUser }) => {
  const canEdit = hasPerm(currentUser, 'settings.edit');
  const toast = useToast();
  const [rules, setRules] = useState<CommentAutomationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CommentAutomationItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState('');
  const [channel, setChannel] = useState<'ALL' | 'INSTAGRAM' | 'FACEBOOK' | 'THREADS'>('INSTAGRAM');
  const [keyword, setKeyword] = useState('');
  const [matchType, setMatchType] = useState<'CONTAINS' | 'EXACT'>('CONTAINS');
  const [replyComment, setReplyComment] = useState('');
  const [sendDm, setSendDm] = useState(true);
  const [dmText, setDmText] = useState('');

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getCommentAutomations();
      setRules(list || []);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal memuat daftar otomasi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !keyword.trim()) return;
    setSaving(true);
    try {
      const created = await api.createCommentAutomation({
        name: name.trim(),
        channel,
        keyword: keyword.trim(),
        matchType,
        replyComment: replyComment.trim() || null,
        sendDm,
        dmText: sendDm ? dmText.trim() || null : null,
      });
      setRules((prev) => [created, ...prev]);
      setName('');
      setKeyword('');
      setReplyComment('');
      setDmText('');
      setShowForm(false);
      toast.success('Aturan otomasi komentar & DM dibuat');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal membuat otomasi');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rule: CommentAutomationItem) => {
    try {
      const updated = await api.updateCommentAutomation(rule.id, { isActive: !rule.isActive });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
    } catch {
      toast.error('Gagal mengubah status aturan');
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await api.deleteCommentAutomation(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      setDeleteTarget(null);
      toast.success('Aturan otomasi dihapus');
    } catch {
      toast.error('Gagal menghapus aturan');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Automations</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Balas komentar secara otomatis dan kirim DM ke pengguna yang berkomentar dengan kata kunci tertentu.
          </p>
        </div>
        {canEdit && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowForm((prev) => !prev)}
          >
            Buat Aturan
          </Button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-lg border border-gray-200 p-4 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <input
              type="text"
              required
              placeholder="Nama aturan (mis. Promo Katalog IG)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="sm:col-span-4 h-9 px-3 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
            />
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as any)}
              className="sm:col-span-3 h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs"
            >
              <option value="ALL">Semua Kanal</option>
              <option value="INSTAGRAM">Instagram</option>
              <option value="FACEBOOK">Facebook</option>
              <option value="THREADS">Threads</option>
            </select>
            <input
              type="text"
              required
              placeholder="Kata kunci komentar (mis. MAU, INFO)"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="sm:col-span-3 h-9 px-3 bg-white border border-gray-200 rounded-md text-xs font-mono focus:outline-none focus:border-indigo-500"
            />
            <select
              value={matchType}
              onChange={(e) => setMatchType(e.target.value as any)}
              className="sm:col-span-2 h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs"
            >
              <option value="CONTAINS">Mengandung</option>
              <option value="EXACT">Persis</option>
            </select>
          </div>

          <input
            type="text"
            placeholder="Balasan komentar publik otomatis (opsional, mis. Cek DM ya kak!)"
            value={replyComment}
            onChange={(e) => setReplyComment(e.target.value)}
            className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
          />

          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={sendDm}
              onChange={(e) => setSendDm(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span>Kirim DM otomatis ke pengomentar</span>
          </label>

          {sendDm && (
            <textarea
              rows={2}
              placeholder="Isi pesan DM otomatis (mis. Halo kak! Ini link katalog dan promonya...)"
              value={dmText}
              onChange={(e) => setDmText(e.target.value)}
              className="w-full p-2.5 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
            />
          )}

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setShowForm(false)}>
              Batal
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={saving}>
              Simpan Aturan
            </Button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <LoadingState message="Memuat daftar otomasi..." />
        ) : error ? (
          <ErrorState message={error} onRetry={loadRules} />
        ) : rules.length === 0 ? (
          <EmptyState
            icon={<Zap className="w-5 h-5" />}
            title="Belum ada aturan otomasi komentar"
            description="Buat aturan kata kunci untuk membalas komentar secara otomatis dan mengirimkan DM ke calon pelanggan."
          />
        ) : (
          <div className="divide-y divide-gray-200">
            {rules.map((r) => (
              <div key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-gray-900">{r.name}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {r.channel}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-gray-100 text-gray-700">
                      {r.matchType}: {r.keyword}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        r.isActive
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {r.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>
                  {r.replyComment && (
                    <p className="text-[11px] text-gray-600">
                      <span className="font-medium">Balas Komentar:</span> {r.replyComment}
                    </p>
                  )}
                  {r.sendDm && r.dmText && (
                    <p className="text-[11px] text-gray-600">
                      <span className="font-medium">Kirim DM:</span> {r.dmText}
                    </p>
                  )}
                </div>

                {canEdit && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggle(r)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50 text-xs text-gray-700"
                    >
                      <Power className="w-3.5 h-3.5" />
                      {r.isActive ? 'Matikan' : 'Aktifkan'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(r)}
                      className="p-1.5 text-gray-400 hover:text-rose-600 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      title="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) void handleDelete(deleteTarget.id);
        }}
        isLoading={deleting}
        title="Hapus Aturan Otomasi?"
        description={
          deleteTarget
            ? `Aturan "${deleteTarget.name}" (kata kunci: ${deleteTarget.keyword}) akan dihapus permanen.`
            : ''
        }
        confirmLabel="Hapus"
        variant="danger"
      />
    </div>
  );
};

export default Automations;
