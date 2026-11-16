import React, { useEffect, useState } from 'react';
import { Search, Radio, ExternalLink } from 'lucide-react';
import api from '../services/api';
import { FeedPostItem } from '../types';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/ToastProvider';
import { LoadingState, EmptyState } from '../components/ui/StateBlocks';

export const SocialFeed: React.FC = () => {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [connected, setConnected] = useState<boolean | null>(null);
  const [accountName, setAccountName] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [items, setItems] = useState<FeedPostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const runSearch = async (q: string) => {
    setLoading(true);
    try {
      const res = await api.searchSocialFeed(q);
      setConnected(res.connected);
      setAccountName(res.accountName || '');
      setStatusMessage(res.message || '');
      setItems(res.items || []);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mencari post publik');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runSearch('');
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query.trim());
  };

  const handleSendReply = async (postId: string) => {
    if (!replyText.trim()) return;
    setSendingReply(true);
    try {
      await api.replySocialFeed(postId, replyText.trim());
      toast.success('Balasan berhasil dikirim ke Threads');
      setReplyTargetId(null);
      setReplyText('');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengirim balasan');
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Feed</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Cari post publik di Threads dengan kata kunci atau topik, lalu balas langsung dari sini.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col sm:flex-row gap-2.5"
      >
        <div className="relative w-full flex-none sm:flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari kata kunci atau topik publik di Threads..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-9 pl-8 pr-3 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
          />
        </div>
        <Button type="submit" variant="primary" size="sm" isLoading={loading}>
          Cari Post
        </Button>
      </form>

      {loading ? (
        <LoadingState message="Memuat feed Threads..." />
      ) : connected === false ? (
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-900">
            <Radio className="w-4 h-4 text-amber-500" />
            <span>Akun Threads Belum Terhubung</span>
          </div>
          <p className="text-xs text-gray-600">{statusMessage}</p>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Radio className="w-5 h-5" />}
          title={query ? 'Tidak ada post ditemukan' : `Terhubung sebagai ${accountName || 'Threads'}`}
          description={
            query
              ? 'Coba gunakan kata kunci lain untuk mencari percakapan publik.'
              : 'Masukkan kata kunci atau topik di kolom pencarian di atas untuk menemukan post publik.'
          }
        />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
          {items.map((item) => (
            <div key={item.id} className="p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                  <span className="text-xs font-semibold text-gray-900">
                    @{item.username || 'threads_user'}
                  </span>
                  {item.timestamp && (
                    <span className="text-[11px] text-gray-400">
                      {new Date(item.timestamp).toLocaleString('id-ID')}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                  {item.permalink && (
                    <a
                      href={item.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-indigo-600 hover:underline inline-flex items-center gap-1"
                    >
                      Buka <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setReplyTargetId(replyTargetId === item.id ? null : item.id)
                    }
                  >
                    Balas
                  </Button>
                </div>
              </div>
              <p className="text-xs text-gray-800 whitespace-pre-wrap">{item.text}</p>

              {replyTargetId === item.id && (
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="text"
                    placeholder="Tulis balasan Anda..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="flex-1 min-w-0 h-8 px-2.5 bg-white border border-gray-200 rounded text-xs focus:outline-none focus:border-indigo-500"
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    isLoading={sendingReply}
                    onClick={() => handleSendReply(item.id)}
                  >
                    Kirim
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SocialFeed;
