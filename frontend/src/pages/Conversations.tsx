import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  MessageSquare,
  Search,
  Send,
  Phone,
  Check,
  CheckCheck,
  Calendar,
  MapPin,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import api from '../services/api';
import { subscribeLiveEvent } from '../services/liveEvents';
import { Conversation, ChatMessage, LicenseInfo, WahaSessionItem } from '../types';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/ToastProvider';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/StateBlocks';

interface ConversationsProps {
  licenseInfo?: LicenseInfo | null;
  onOpenPlans?: () => void;
}

export const Conversations: React.FC<ConversationsProps> = ({ licenseInfo, onOpenPlans }) => {
  const toast = useToast();
  const isLiveChatUnlocked = Boolean(
    licenseInfo && !licenseInfo.isExpired && licenseInfo.features?.liveChatCrm
  );
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [search, setSearch] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [sessions, setSessions] = useState<WahaSessionItem[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async () => {
    if (!isLiveChatUnlocked) return;
    try {
      const data = await api.getConversations();
      setConversations(data);
      setListError(null);
      setSelectedConversation((prev) => prev || (data.length > 0 ? data[0] : null));
    } catch (err: any) {
      setListError(err.response?.data?.error || err.message || 'Gagal memuat daftar percakapan');
    } finally {
      setLoadingList(false);
    }
  }, [isLiveChatUnlocked]);

  const fetchMessages = useCallback(async (convId: string) => {
    if (!isLiveChatUnlocked) return;
    setLoadingMessages(true);
    try {
      const data = await api.getConversationMessages(convId);
      setMessages(data);
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, [isLiveChatUnlocked]);

  useEffect(() => {
    if (!isLiveChatUnlocked) return;
    fetchConversations();
    const unsub = subscribeLiveEvent('conversations:update', () => {
      void fetchConversations();
    });
    return unsub;
  }, [fetchConversations, isLiveChatUnlocked]);

  useEffect(() => {
    if (!isLiveChatUnlocked) return;
    api
      .getWahaSessions()
      .then((res) => {
        setSessions(res.sessions || []);
        setSelectedSession(res.activeSession || '');
      })
      .catch(() => {});
  }, [isLiveChatUnlocked]);

  useEffect(() => {
    if (isLiveChatUnlocked && selectedConversation) {
      fetchMessages(selectedConversation.id);
      const unsub = subscribeLiveEvent('conversations:update', () => {
        void fetchMessages(selectedConversation.id);
      });
      return unsub;
    }
  }, [selectedConversation?.id, fetchMessages, isLiveChatUnlocked]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLiveChatUnlocked || !inputText.trim() || !selectedConversation || sending) return;

    const text = inputText.trim();
    setSending(true);

    try {
      const newMsg = await api.sendConversationMessage(
        selectedConversation.id,
        text,
        selectedSession || undefined
      );
      setInputText('');
      setMessages((prev) => [...prev, newMsg]);
      fetchConversations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengirim pesan WhatsApp');
    } finally {
      setSending(false);
    }
  };

  if (!isLiveChatUnlocked) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 max-w-xl mx-auto mt-8 text-center space-y-4">
        <div className="w-11 h-11 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
          <Lock className="w-5 h-5" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-base font-semibold text-gray-900">
            Menu Live Chat CRM Terkunci oleh Lisensi
          </h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            Paket Anda saat ini (<strong className="text-gray-800">{licenseInfo?.plan || 'Belum Diaktivasi'}</strong>) tidak menyertakan fitur percakapan langsung (Live Chat CRM). Upgrade ke paket <strong className="text-gray-800">Pro Bulanan</strong> atau <strong className="text-gray-800">Enterprise Tahunan</strong> untuk membuka percakapan pelanggan dan balasan multi-sesi.
          </p>
        </div>
        {onOpenPlans && (
          <div className="pt-2">
            <Button
              variant="primary"
              size="md"
              onClick={onOpenPlans}
              leftIcon={<ShieldCheck className="w-4 h-4" />}
            >
              Lihat &amp; Upgrade Paket Lisensi
            </Button>
          </div>
        )}
      </div>
    );
  }

  const filteredConversations = conversations.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.contact?.nama_lengkap?.toLowerCase().includes(q) ||
      c.contact?.nomor_whatsapp?.includes(q) ||
      c.lastMessage?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden h-[calc(100vh-132px)] flex flex-col md:flex-row">
      {/* Left List */}
      <div className="w-full md:w-80 border-r border-gray-200 flex flex-col shrink-0 bg-gray-50/50">
        <div className="p-3 border-b border-gray-200 bg-white">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari obrolan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 bg-gray-50 border border-gray-200 rounded-md text-xs placeholder-gray-400 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-200">
          {loadingList && conversations.length === 0 ? (
            <LoadingState message="Memuat percakapan..." />
          ) : listError && conversations.length === 0 ? (
            <ErrorState message={listError} onRetry={fetchConversations} />
          ) : filteredConversations.length === 0 ? (
            <EmptyState
              title="Belum ada percakapan"
              description="Riwayat obrolan muncul setelah Anda mengirim atau menerima pesan."
            />
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = selectedConversation?.id === conv.id;
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setSelectedConversation(conv)}
                  className={`w-full p-3 text-left flex items-start gap-2.5 transition-colors ${
                    isSelected
                      ? 'bg-indigo-50/70 border-l-2 border-indigo-600'
                      : 'hover:bg-gray-100/70 bg-white'
                  }`}
                >
                  <div className="w-8 h-8 rounded-md bg-indigo-600 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                    {conv.contact?.nama_lengkap?.slice(0, 2).toUpperCase() || 'WA'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-gray-900 text-xs truncate">
                        {conv.contact?.nama_lengkap || conv.contact?.nomor_whatsapp}
                      </span>
                      {conv.lastMessageAt && (
                        <span className="text-[10px] text-gray-400 font-mono tabular-nums shrink-0">
                          {new Date(conv.lastMessageAt).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-gray-500 truncate mt-0.5">
                      {conv.lastMessage || 'Tidak ada pesan terbaru'}
                    </p>
                  </div>

                  {conv.unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-600 text-white shrink-0 tabular-nums">
                      {conv.unreadCount}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Middle Chat Feed */}
      {selectedConversation ? (
        <div className="flex-1 flex flex-col bg-gray-50 min-w-0">
          <div className="h-14 bg-white border-b border-gray-200 px-4 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-md bg-indigo-600 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                {selectedConversation.contact?.nama_lengkap?.slice(0, 2).toUpperCase() || 'WA'}
              </div>
              <div className="min-w-0">
                <h4 className="font-semibold text-gray-900 text-xs truncate">
                  {selectedConversation.contact?.nama_lengkap}
                </h4>
                <a
                  href={`https://wa.me/${selectedConversation.contact?.nomor_whatsapp}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-indigo-600 font-mono hover:underline inline-flex items-center gap-1"
                >
                  <Phone className="w-2.5 h-2.5" />
                  <span>+{selectedConversation.contact?.nomor_whatsapp}</span>
                </a>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {licenseInfo?.features?.multiSession && sessions.length > 1 && (
                <select
                  value={selectedSession}
                  onChange={(e) => setSelectedSession(e.target.value)}
                  title="Pilih sesi WAHA pengirim"
                  className="h-7 px-2 bg-white border border-gray-200 rounded text-[11px] font-mono text-gray-700 focus:outline-none focus:border-indigo-500"
                >
                  {sessions.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name} ({s.status})
                    </option>
                  ))}
                </select>
              )}
              <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200 font-medium">
                {selectedConversation.contact?.tags || 'Pelanggan'}
              </span>
            </div>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-2.5">
            {loadingMessages && messages.length === 0 ? (
              <LoadingState message="Memuat pesan..." />
            ) : messages.length === 0 ? (
              <EmptyState title="Belum ada pesan" description="Kirim pesan pertama ke pelanggan ini." />
            ) : (
              messages.map((msg) => {
                const isOutbound = msg.direction === 'OUTBOUND';
                const isRead = msg.ackStatus >= 3;
                const isDelivered = msg.ackStatus === 2;

                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-lg px-3.5 py-2 text-xs border leading-relaxed ${
                        isOutbound
                          ? 'bg-indigo-50 border-indigo-200 text-gray-900'
                          : 'bg-white border-gray-200 text-gray-900'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{msg.body}</div>

                      <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-gray-500 font-mono tabular-nums">
                        <span>
                          {new Date(msg.createdAt).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>

                        {isOutbound && (
                          <span>
                            {isRead ? (
                              <CheckCheck className="w-3.5 h-3.5 text-blue-600 inline" />
                            ) : isDelivered ? (
                              <CheckCheck className="w-3.5 h-3.5 text-gray-400 inline" />
                            ) : (
                              <Check className="w-3 h-3 text-gray-400 inline" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={handleSendMessage}
            className="p-3 bg-white border-t border-gray-200 flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              placeholder="Ketik balasan WhatsApp..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 h-9 px-3 bg-gray-50 border border-gray-200 rounded-md text-[13px] placeholder-gray-400 focus:outline-none focus:border-indigo-500"
            />
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={sending}
              disabled={!inputText.trim()}
              leftIcon={<Send className="w-3.5 h-3.5" />}
            >
              Kirim
            </Button>
          </form>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50 text-gray-400">
          <MessageSquare className="w-10 h-10 text-gray-300 mb-2" />
          <p className="text-xs text-gray-500">
            Pilih percakapan dari daftar di sebelah kiri untuk melihat pesan.
          </p>
        </div>
      )}

      {/* Right Contact Profile */}
      {selectedConversation?.contact && (
        <div className="w-full md:w-72 border-l border-gray-200 bg-white p-5 flex flex-col shrink-0">
          <div className="text-center pb-4 border-b border-gray-200">
            <div className="w-12 h-12 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-base flex items-center justify-center mx-auto mb-2 border border-indigo-200">
              {selectedConversation.contact.nama_lengkap.slice(0, 2).toUpperCase()}
            </div>
            <h4 className="font-semibold text-gray-900 text-sm">
              {selectedConversation.contact.nama_lengkap}
            </h4>
            {selectedConversation.contact.nama_panggilan && (
              <span className="text-xs text-gray-500">
                Panggilan: {selectedConversation.contact.nama_panggilan}
              </span>
            )}
          </div>

          <div className="py-4 space-y-3 flex-1 text-xs text-gray-700">
            <div>
              <span className="block text-[11px] text-gray-400 font-medium mb-0.5">WhatsApp</span>
              <div className="font-mono text-gray-900 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-indigo-600" />
                <span>+{selectedConversation.contact.nomor_whatsapp}</span>
              </div>
            </div>

            {selectedConversation.contact.tanggal_lahir && (
              <div>
                <span className="block text-[11px] text-gray-400 font-medium mb-0.5">
                  Tanggal Lahir
                </span>
                <div className="flex items-center gap-1.5 text-gray-900">
                  <Calendar className="w-3.5 h-3.5 text-amber-600" />
                  <span>
                    {new Date(selectedConversation.contact.tanggal_lahir).toLocaleDateString(
                      'id-ID',
                      { day: 'numeric', month: 'long', year: 'numeric' }
                    )}
                  </span>
                </div>
              </div>
            )}

            {selectedConversation.contact.alamat && (
              <div>
                <span className="block text-[11px] text-gray-400 font-medium mb-0.5">Alamat</span>
                <div className="flex items-start gap-1.5 text-gray-900 leading-snug">
                  <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                  <span>{selectedConversation.contact.alamat}</span>
                </div>
              </div>
            )}

            {selectedConversation.contact.tags && (
              <div>
                <span className="block text-[11px] text-gray-400 font-medium mb-1">Tags</span>
                <div className="flex flex-wrap gap-1">
                  {selectedConversation.contact.tags.split(',').map((t, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700 border border-gray-200"
                    >
                      {t.trim()}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-gray-200 text-center">
            <a
              href={`https://wa.me/${selectedConversation.contact.nomor_whatsapp}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 w-full h-9 bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-200 font-medium rounded-md text-xs transition-colors"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Buka di WhatsApp Web</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default Conversations;
