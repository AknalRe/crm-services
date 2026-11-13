import React, { useEffect, useState, useRef } from 'react';
import {
  MessageSquare,
  Search,
  Send,
  Phone,
  Check,
  CheckCheck,
  Calendar,
  MapPin,
  Tag,
  User,
  Clock,
  RefreshCw,
} from 'lucide-react';
import api from '../services/api';
import { Conversation, ChatMessage, Contact } from '../types';

export const Conversations: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [search, setSearch] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = async () => {
    try {
      const data = await api.getConversations();
      setConversations(data);
      if (!selectedConversation && data.length > 0) {
        setSelectedConversation(data[0]);
      }
    } catch (err) {
      console.error('Error fetching conversations:', err);
    } finally {
      setLoadingList(false);
    }
  };

  const fetchMessages = async (convId: string) => {
    setLoadingMessages(true);
    try {
      const data = await api.getConversationMessages(convId);
      setMessages(data);
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);
      const msgInterval = setInterval(() => {
        fetchMessages(selectedConversation.id);
      }, 5000);
      return () => clearInterval(msgInterval);
    }
  }, [selectedConversation?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedConversation) return;

    const text = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      const newMsg = await api.sendConversationMessage(selectedConversation.id, text);
      setMessages((prev) => [...prev, newMsg]);
      fetchConversations(); // Update snippet
    } catch (err: any) {
      alert(err.response?.data?.error || 'Gagal mengirim pesan');
    } finally {
      setSending(false);
    }
  };

  const filteredConversations = conversations.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.contact?.nama_lengkap?.toLowerCase().includes(q) ||
      c.contact?.nomor_whatsapp?.includes(q) ||
      c.lastMessage?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-[calc(100vh-140px)] flex flex-col md:flex-row">
      {/* 1. Left List: Conversation Threads */}
      <div className="w-full md:w-80 border-r border-slate-200 flex flex-col shrink-0 bg-slate-50/50">
        {/* Search Header */}
        <div className="p-3 border-b border-slate-200 bg-white">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari obrolan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-100 border-none rounded-lg text-xs placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
        </div>

        {/* Thread List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {loadingList && conversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">Memuat percakapan...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              Belum ada riwayat percakapan. Mulai dengan mengirim broadcast!
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = selectedConversation?.id === conv.id;
              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv)}
                  className={`w-full p-3 text-left flex items-start gap-3 transition-colors ${
                    isSelected ? 'bg-emerald-50/70 border-l-4 border-emerald-600' : 'hover:bg-slate-100/70'
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-emerald-600 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                    {conv.contact?.nama_lengkap?.slice(0, 2).toUpperCase() || 'WA'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800 text-xs truncate">
                        {conv.contact?.nama_lengkap || conv.contact?.nomor_whatsapp}
                      </span>
                      {conv.lastMessageAt && (
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {new Date(conv.lastMessageAt).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {conv.lastMessage || 'Tidak ada pesan terbaru'}
                    </p>
                  </div>

                  {conv.unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white shrink-0">
                      {conv.unreadCount}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Middle: Active Chat Feed */}
      {selectedConversation ? (
        <div className="flex-1 flex flex-col bg-[#efeae2] relative">
          {/* Chat Header */}
          <div className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between shadow-sm z-10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">
                {selectedConversation.contact?.nama_lengkap?.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h4 className="font-bold text-slate-800 text-xs">
                  {selectedConversation.contact?.nama_lengkap}
                </h4>
                <a
                  href={`https://wa.me/${selectedConversation.contact?.nomor_whatsapp}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-emerald-600 font-mono hover:underline flex items-center gap-1"
                >
                  <Phone className="w-2.5 h-2.5" />
                  <span>+{selectedConversation.contact?.nomor_whatsapp}</span>
                </a>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                {selectedConversation.contact?.tags || 'Pelanggan'}
              </span>
            </div>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 p-4 overflow-y-auto space-y-2.5">
            {loadingMessages && messages.length === 0 ? (
              <div className="text-center text-xs text-slate-500 py-6">Memuat obrolan...</div>
            ) : messages.length === 0 ? (
              <div className="text-center text-xs text-slate-500 py-12">
                Belum ada pesan di percakapan ini.
              </div>
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
                      className={`max-w-[75%] rounded-xl px-3.5 py-2 text-xs shadow-sm relative leading-relaxed ${
                        isOutbound
                          ? 'bg-[#d9fdd3] text-slate-800 rounded-tr-none'
                          : 'bg-white text-slate-800 rounded-tl-none'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{msg.body}</div>

                      <div className="mt-1 flex items-center justify-end gap-1 text-[9px] text-slate-400">
                        <span>
                          {new Date(msg.createdAt).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>

                        {isOutbound && (
                          <span>
                            {isRead ? (
                              <CheckCheck className="w-3.5 h-3.5 text-blue-500 inline" />
                            ) : isDelivered ? (
                              <CheckCheck className="w-3.5 h-3.5 text-slate-400 inline" />
                            ) : (
                              <Check className="w-3 h-3 text-slate-400 inline" />
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

          {/* Chat Reply Input Bar */}
          <form
            onSubmit={handleSendMessage}
            className="p-3 bg-white border-t border-slate-200 flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Ketik balasan WhatsApp..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 px-4 py-2 bg-slate-100 border-none rounded-xl text-xs placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <button
              type="submit"
              disabled={sending || !inputText.trim()}
              className="p-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl transition-colors shadow-sm"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 text-slate-400">
          <MessageSquare className="w-12 h-12 text-slate-300 mb-2" />
          <p className="text-xs">Pilih percakapan dari daftar di sebelah kiri untuk melihat pesan.</p>
        </div>
      )}

      {/* 3. Right: Contact Profile CRM Card */}
      {selectedConversation?.contact && (
        <div className="w-full md:w-72 border-l border-slate-200 bg-white p-5 flex flex-col shrink-0">
          <div className="text-center pb-4 border-b border-slate-100">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 font-bold text-lg flex items-center justify-center mx-auto mb-2 border border-emerald-200">
              {selectedConversation.contact.nama_lengkap.slice(0, 2).toUpperCase()}
            </div>
            <h4 className="font-bold text-slate-800 text-sm">
              {selectedConversation.contact.nama_lengkap}
            </h4>
            {selectedConversation.contact.nama_panggilan && (
              <span className="text-xs text-slate-500">
                Panggilan: {selectedConversation.contact.nama_panggilan}
              </span>
            )}
          </div>

          <div className="py-4 space-y-3 flex-1 text-xs text-slate-600">
            <div>
              <span className="block text-[11px] text-slate-400 font-semibold mb-0.5">WhatsApp</span>
              <div className="font-mono text-slate-800 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                <span>+{selectedConversation.contact.nomor_whatsapp}</span>
              </div>
            </div>

            {selectedConversation.contact.tanggal_lahir && (
              <div>
                <span className="block text-[11px] text-slate-400 font-semibold mb-0.5">
                  Tanggal Lahir
                </span>
                <div className="flex items-center gap-1.5 text-slate-800">
                  <Calendar className="w-3.5 h-3.5 text-amber-500" />
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
                <span className="block text-[11px] text-slate-400 font-semibold mb-0.5">Alamat</span>
                <div className="flex items-start gap-1.5 text-slate-800 leading-snug">
                  <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                  <span>{selectedConversation.contact.alamat}</span>
                </div>
              </div>
            )}

            {selectedConversation.contact.tags && (
              <div>
                <span className="block text-[11px] text-slate-400 font-semibold mb-1">Tags</span>
                <div className="flex flex-wrap gap-1">
                  {selectedConversation.contact.tags.split(',').map((t, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border"
                    >
                      {t.trim()}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 text-center">
            <a
              href={`https://wa.me/${selectedConversation.contact.nomor_whatsapp}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium rounded-lg text-xs transition-colors"
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

