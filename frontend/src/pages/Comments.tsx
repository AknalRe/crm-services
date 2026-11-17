import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquare, CheckCircle2, Trash2 } from 'lucide-react';
import api from '../services/api';
import { SocialCommentItem } from '../types';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useToast } from '../components/ui/ToastProvider';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/StateBlocks';

export const Comments: React.FC = () => {
  const toast = useToast();
  const [comments, setComments] = useState<SocialCommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [statusTab, setStatusTab] = useState<'PENDING' | 'DONE' | 'ALL'>('PENDING');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SocialCommentItem | null>(null);

  const loadComments = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getSocialComments({ status: statusTab });
      setComments(list || []);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal memuat daftar komentar');
    } finally {
      setLoading(false);
    }
  }, [statusTab]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await api.syncSocialComments();
      if (res.message) toast.success(res.message);
      if (res.errors && res.errors.length > 0) {
        toast.error(res.errors[0]);
      }
      await loadComments();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyinkronkan komentar');
    } finally {
      setSyncing(false);
    }
  };

  const handleReply = async (id: string) => {
    const text = (replyDrafts[id] || '').trim();
    if (!text) return;
    setBusyId(id);
    try {
      await api.replySocialComment(id, text);
      setReplyDrafts((prev) => ({ ...prev, [id]: '' }));
      toast.success('Balasan komentar terkirim');
      await loadComments();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengirim balasan');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleStatus = async (item: SocialCommentItem) => {
    setBusyId(item.id);
    try {
      await api.updateSocialCommentStatus(
        item.id,
        item.status === 'DONE' ? 'PENDING' : 'DONE'
      );
      await loadComments();
    } catch {
      toast.error('Gagal memperbarui status komentar');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      await api.deleteSocialComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
      setDeleteTarget(null);
      toast.success('Komentar dihapus');
    } catch {
      toast.error('Gagal menghapus komentar');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Comments</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Komentar dan balasan dari semua akun Instagram, Facebook, dan Threads di satu tempat.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          isLoading={syncing}
          onClick={handleSync}
        >
          Muat terbaru
        </Button>
      </div>

      <div className="flex items-center gap-4 border-b border-gray-200 overflow-x-auto">
        {(
          [
            { id: 'PENDING', label: 'Perlu dibalas' },
            { id: 'DONE', label: 'Selesai' },
            { id: 'ALL', label: 'Semua' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatusTab(tab.id)}
            className={`pb-2.5 text-xs font-medium border-b-2 whitespace-nowrap shrink-0 transition-colors ${
              statusTab === tab.id
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <LoadingState message="Memuat daftar komentar..." />
        ) : error ? (
          <ErrorState message={error} onRetry={loadComments} />
        ) : comments.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="w-5 h-5" />}
            title={
              statusTab === 'PENDING'
                ? 'Semua komentar sudah selesai'
                : 'Belum ada komentar tersimpan'
            }
            description='Komentar baru dari akun sosial media terhubung akan muncul di sini. Klik "Muat terbaru" untuk mengecek sekarang.'
          />
        ) : (
          <div className="divide-y divide-gray-200">
            {comments.map((c) => (
              <div key={c.id} className="p-3 sm:p-4 space-y-2 sm:space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {c.channel}
                    </span>
                    <span className="text-xs font-semibold text-gray-900">{c.authorName}</span>
                    {c.authorHandle && (
                      <span className="text-[11px] text-gray-400 font-mono">{c.authorHandle}</span>
                    )}
                    <span className="text-[11px] text-gray-400">
                      • {new Date(c.createdAt).toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => handleToggleStatus(c)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border ${
                        c.status === 'DONE'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      {c.status === 'DONE' ? 'Selesai' : 'Tandai selesai'}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => setDeleteTarget(c)}
                      className="p-1 text-gray-400 hover:text-rose-600 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      title="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {c.postCaption && (
                  <div className="text-[11px] text-gray-500 bg-gray-50 px-2.5 py-1.5 rounded border border-gray-100 truncate">
                    Post: {c.postCaption}
                  </div>
                )}

                <p className="text-xs text-gray-800 whitespace-pre-wrap">{c.content}</p>

                {c.replyText ? (
                  <div className="pl-3 border-l-2 border-indigo-300 text-xs text-gray-700 bg-indigo-50/40 py-1.5 px-2.5 rounded-r">
                    <span className="font-semibold text-indigo-700">Balasan Anda: </span>
                    {c.replyText}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="Tulis balasan komentar..."
                      value={replyDrafts[c.id] || ''}
                      onChange={(e) =>
                        setReplyDrafts((prev) => ({ ...prev, [c.id]: e.target.value }))
                      }
                      className="flex-1 min-w-0 h-8 px-2.5 bg-white border border-gray-200 rounded text-xs focus:outline-none focus:border-indigo-500"
                    />
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      isLoading={busyId === c.id}
                      onClick={() => handleReply(c.id)}
                    >
                      Balas
                    </Button>
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
        isLoading={Boolean(deleteTarget && busyId === deleteTarget.id)}
        title="Hapus Komentar?"
        description={
          deleteTarget
            ? `Komentar dari "${deleteTarget.authorName}" akan dihapus dari daftar CRM.`
            : ''
        }
        confirmLabel="Hapus"
        variant="danger"
      />
    </div>
  );
};

export default Comments;
