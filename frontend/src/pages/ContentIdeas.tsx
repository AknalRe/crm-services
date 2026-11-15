import React, { useCallback, useEffect, useState } from 'react';
import { Lightbulb, Plus, Trash2, ArrowRight, ArrowLeft, Send, X } from 'lucide-react';
import api from '../services/api';
import { ContentIdeaItem, IdeaColumn } from '../types';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/ToastProvider';
import { LoadingState } from '../components/ui/StateBlocks';

interface ContentIdeasProps {
  onConvertToPost?: (prefill: {
    channel: 'INSTAGRAM' | 'FACEBOOK' | 'THREADS' | 'TELEGRAM';
    caption: string;
  }) => void;
}

const DEFAULT_COLUMNS: IdeaColumn[] = [
  { id: 'IDE', label: 'Ide' },
  { id: 'DIKERJAKAN', label: 'Dikerjakan' },
  { id: 'SIAP', label: 'Siap' },
];

export const ContentIdeas: React.FC<ContentIdeasProps> = ({ onConvertToPost }) => {
  const toast = useToast();
  const [ideas, setIdeas] = useState<ContentIdeaItem[]>([]);
  const [columns, setColumns] = useState<IdeaColumn[]>(DEFAULT_COLUMNS);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showAddCol, setShowAddCol] = useState(false);
  const [newColLabel, setNewColLabel] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [channel, setChannel] = useState<ContentIdeaItem['channel']>('INSTAGRAM');
  const [stage, setStage] = useState<string>('IDE');
  const [saving, setSaving] = useState(false);

  const loadIdeas = useCallback(async () => {
    try {
      const [list, cols] = await Promise.all([api.getContentIdeas(), api.getIdeaColumns()]);
      setIdeas(list || []);
      if (cols && cols.length > 0) setColumns(cols);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIdeas();
  }, [loadIdeas]);

  const handleAddColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = newColLabel.trim();
    if (!label) return;
    const id = label
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!id || columns.some((c) => c.id === id)) {
      toast.error('Nama kolom sudah ada atau tidak valid');
      return;
    }
    const nextCols = [...columns, { id, label }];
    try {
      const saved = await api.saveIdeaColumns(nextCols);
      setColumns(saved);
      setNewColLabel('');
      setShowAddCol(false);
      toast.success(`Kolom "${label}" ditambahkan`);
    } catch {
      toast.error('Gagal menambah kolom');
    }
  };

  const handleRemoveColumn = async (colId: string) => {
    if (columns.length <= 1) return;
    const hasItems = ideas.some((i) => i.stage === colId);
    if (hasItems) {
      toast.error('Pindahkan atau hapus ide di kolom ini sebelum menghapus kolom');
      return;
    }
    const nextCols = columns.filter((c) => c.id !== colId);
    try {
      const saved = await api.saveIdeaColumns(nextCols);
      setColumns(saved);
    } catch {
      toast.error('Gagal menghapus kolom');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const created = await api.createContentIdea({
        title: title.trim(),
        notes: notes.trim() || null,
        channel,
        stage,
      });
      setIdeas((prev) => [created, ...prev]);
      setTitle('');
      setNotes('');
      setShowForm(false);
      toast.success('Ide konten dicatat');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mencatat ide');
    } finally {
      setSaving(false);
    }
  };

  const handleMoveStage = async (item: ContentIdeaItem, nextStage: ContentIdeaItem['stage']) => {
    try {
      const updated = await api.updateContentIdea(item.id, { stage: nextStage });
      setIdeas((prev) => prev.map((x) => (x.id === item.id ? updated : x)));
    } catch {
      toast.error('Gagal memindahkan kolom ide');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteContentIdea(id);
      setIdeas((prev) => prev.filter((x) => x.id !== id));
    } catch {
      toast.error('Gagal menghapus ide');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Ide Konten</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Catat ide konten, atur per kolom (Ide, Dikerjakan, Siap), lalu jadikan postingan terjadwal saat siap.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setStage('IDE');
            setShowForm((prev) => !prev);
          }}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          Catat Ide
        </Button>
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
              placeholder="Judul atau topik ide konten (mis. Tips merawat produk...)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="sm:col-span-6 h-9 px-3 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
            />
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as any)}
              className="sm:col-span-3 h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs"
            >
              <option value="INSTAGRAM">Instagram</option>
              <option value="FACEBOOK">Facebook</option>
              <option value="THREADS">Threads</option>
              <option value="TELEGRAM">Telegram</option>
            </select>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as any)}
              className="sm:col-span-3 h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs"
            >
              {columns.map((s) => (
                <option key={s.id} value={s.id}>
                  Kolom: {s.label}
                </option>
              ))}
            </select>
          </div>
          <textarea
            rows={2}
            placeholder="Catatan atau draf caption awal (opsional)..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full p-2.5 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
          />
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setShowForm(false)}>
              Batal
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={saving}>
              Simpan Ide
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <LoadingState message="Memuat papan ide konten..." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4 items-start">
          {columns.map((col, colIdx) => {
            const colItems = ideas.filter((i) => i.stage === col.id);
            const isDefaultCol = ['IDE', 'DIKERJAKAN', 'SIAP'].includes(col.id);
            return (
              <div
                key={col.id}
                className="bg-white rounded-lg border border-gray-200 p-3.5 space-y-3 min-h-[280px] flex flex-col"
              >
                <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-800">{col.label}</span>
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-mono font-semibold text-gray-600">
                      {colItems.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setStage(col.id);
                        setShowForm(true);
                      }}
                      className="p-1 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
                      title={`Tambah ide ke ${col.label}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    {!isDefaultCol && (
                      <button
                        type="button"
                        onClick={() => handleRemoveColumn(col.id)}
                        className="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50"
                        title={`Hapus kolom ${col.label}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {colItems.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4 border border-dashed border-gray-200 rounded-md text-gray-400 text-[11px] gap-1">
                    <Lightbulb className="w-4 h-4 text-gray-300" />
                    <span>Belum ada ide di kolom {col.label}</span>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {colItems.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-md border border-gray-200 bg-gray-50/60 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {item.channel}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            className="text-gray-400 hover:text-rose-600"
                            title="Hapus ide"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="text-xs font-semibold text-gray-900">{item.title}</div>
                        {item.notes && (
                          <p className="text-[11px] text-gray-600 whitespace-pre-wrap line-clamp-3">
                            {item.notes}
                          </p>
                        )}

                        <div className="flex items-center justify-between pt-1.5 border-t border-gray-200/70 gap-1">
                          <div className="flex items-center gap-1">
                            {colIdx > 0 && (
                              <button
                                type="button"
                                onClick={() => handleMoveStage(item, columns[colIdx - 1].id)}
                                className="p-1 rounded bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
                                title={`Pindah ke ${columns[colIdx - 1].label}`}
                              >
                                <ArrowLeft className="w-3 h-3" />
                              </button>
                            )}
                            {colIdx < columns.length - 1 && (
                              <button
                                type="button"
                                onClick={() => handleMoveStage(item, columns[colIdx + 1].id)}
                                className="p-1 rounded bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
                                title={`Pindah ke ${columns[colIdx + 1].label}`}
                              >
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          {onConvertToPost && (
                            <button
                              type="button"
                              onClick={() =>
                                onConvertToPost({
                                  channel: item.channel,
                                  caption: item.notes ? `${item.title}\n\n${item.notes}` : item.title,
                                })
                              }
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-medium whitespace-nowrap"
                            >
                              <Send className="w-2.5 h-2.5" />
                              Jadikan Post
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div className="bg-gray-50/70 rounded-lg border border-dashed border-gray-300 p-3.5">
            {showAddCol ? (
              <form onSubmit={handleAddColumn} className="space-y-2">
                <input
                  type="text"
                  autoFocus
                  placeholder="Nama kolom baru (mis. Revisi)..."
                  value={newColLabel}
                  onChange={(e) => setNewColLabel(e.target.value)}
                  className="w-full h-8 px-2.5 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
                />
                <div className="flex items-center justify-end gap-1.5">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowAddCol(false);
                      setNewColLabel('');
                    }}
                  >
                    Batal
                  </Button>
                  <Button type="submit" variant="primary" size="sm">
                    Tambah
                  </Button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddCol(true)}
                className="w-full py-2 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-gray-600 hover:text-indigo-700"
              >
                <Plus className="w-3.5 h-3.5" />
                Kolom
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ContentIdeas;
