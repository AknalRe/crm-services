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
  PanelRightClose,
  PanelRightOpen,
  X,
  Smile,
  Paperclip,
  StickyNote,
  Star,
  Tag,
  Plus,
  FileText,
  Smartphone,
  CheckCircle2,
  RotateCcw,
  UserCheck,
  Zap,
  Trash2,
} from 'lucide-react';
import api from '../services/api';
import { subscribeLiveEvent } from '../services/liveEvents';
import {
  AuthStatus,
  CannedResponse,
  Contact,
  Conversation,
  ChatMessage,
  LicenseInfo,
  WahaSessionItem,
} from '../types';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/ToastProvider';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/StateBlocks';

function resolveMediaUrl(url?: string | null): string {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/')) return url;
  if (/^https?:\/\//i.test(url)) {
    return `./api/conversations/media-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

interface ConversationsProps {
  licenseInfo?: LicenseInfo | null;
  currentUser?: AuthStatus['user'] | null;
  onOpenPlans?: () => void;
}

const CONTACT_PANEL_KEY = 'crm_livechat_contact_panel';
const PRESET_LABELS = ['VIP', 'Follow Up', 'Komplain', 'Lunas', 'Prospek'];
const QUICK_EMOJIS = [
  '😀', '😊', '🙏', '👍', '❤️', '🎉', '🔥', '✅',
  '👋', '🤝', '💡', '📦', '🚀', '⏰', '📞', '⭐',
  '😅', '😢', '🙌', '💯', '✨', '📌', '📝', '💬',
];

function getAppBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  const match = window.location.pathname.match(/^(\/app\/[^/]+)/);
  return `${window.location.origin}${match ? match[1] : ''}`;
}

function readContactPanelPref(): boolean {
  try {
    return localStorage.getItem(CONTACT_PANEL_KEY) !== 'closed';
  } catch {
    return true;
  }
}

export const Conversations: React.FC<ConversationsProps> = ({ licenseInfo, currentUser, onOpenPlans }) => {
  const toast = useToast();
  const isLiveChatUnlocked = Boolean(
    licenseInfo && !licenseInfo.isExpired && licenseInfo.features?.liveChatCrm
  );

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'PENDING' | 'RESOLVED'>('ALL');
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  const [sessions, setSessions] = useState<WahaSessionItem[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [showContactPanel, setShowContactPanel] = useState<boolean>(readContactPanelPref);

  // Composer enhancements: Internal note mode, Emoji picker, File attachment
  const [composerMode, setComposerMode] = useState<'REPLY' | 'NOTE'>('REPLY');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{
    base64: string;
    mimetype: string;
    name: string;
    isImage: boolean;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Right panel: Labels & Contact Notes
  const [newLabel, setNewLabel] = useState('');
  const [contactNotesDraft, setContactNotesDraft] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [sendingCsat, setSendingCsat] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const toggleContactPanel = (next?: boolean) => {
    setShowContactPanel((prev) => {
      const val = next !== undefined ? next : !prev;
      try {
        localStorage.setItem(CONTACT_PANEL_KEY, val ? 'open' : 'closed');
      } catch {
        // Ignore
      }
      return val;
    });
  };

  const fetchConversations = useCallback(async () => {
    if (!isLiveChatUnlocked) return;
    try {
      const data = await api.getConversations();
      setConversations(data);
      setListError(null);
      setSelectedConversation((prev) => {
        if (!prev) return data.length > 0 ? data[0] : null;
        return data.find((c) => c.id === prev.id) || (data.length > 0 ? data[0] : null);
      });
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
      if (selectedConversation.wahaSession) {
        setSelectedSession(selectedConversation.wahaSession);
      }
      setContactNotesDraft(selectedConversation.contact?.notes || '');
      const unsub = subscribeLiveEvent('conversations:update', () => {
        void fetchMessages(selectedConversation.id);
      });
      return unsub;
    }
  }, [selectedConversation?.id, fetchMessages, isLiveChatUnlocked]);

  useEffect(() => {
    if (selectedConversation) {
      setContactNotesDraft(selectedConversation.contact?.notes || '');
    }
  }, [selectedConversation?.contact?.notes, selectedConversation?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Ukuran berkas maksimal 8 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      setPendingAttachment({
        base64: result,
        mimetype: file.type || 'application/octet-stream',
        name: file.name,
        isImage: file.type.startsWith('image/'),
      });
      setComposerMode('REPLY');
    };
    reader.readAsDataURL(file);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLiveChatUnlocked || !selectedConversation || sending) return;
    const text = inputText.trim();

    if (composerMode === 'NOTE') {
      if (!text) return;
      setSending(true);
      try {
        const noteMsg = await api.addConversationNote(selectedConversation.id, text);
        setInputText('');
        setMessages((prev) => [...prev, noteMsg]);
        toast.success('Catatan internal disimpan');
      } catch (err: any) {
        toast.error(err.response?.data?.error || 'Gagal menyimpan catatan');
      } finally {
        setSending(false);
      }
      return;
    }

    if (!text && !pendingAttachment) return;
    setSending(true);
    try {
      const newMsg = await api.sendConversationMessage(selectedConversation.id, {
        body: text,
        session: selectedSession || undefined,
        mediaBase64: pendingAttachment?.base64,
        mediaMimetype: pendingAttachment?.mimetype,
        mediaName: pendingAttachment?.name,
      });
      setInputText('');
      setPendingAttachment(null);
      setShowEmojiPicker(false);
      setMessages((prev) => [...prev, newMsg]);
      void fetchConversations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengirim pesan WhatsApp');
    } finally {
      setSending(false);
    }
  };

  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [contactsList, setContactsList] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [openingContactId, setOpeningContactId] = useState<string | null>(null);

  // Agent assignment & Canned responses
  const [assignableAgents, setAssignableAgents] = useState<
    Array<{ id: string; name: string; email: string; role: string }>
  >([]);
  const [assigneeFilter, setAssigneeFilter] = useState<'ALL' | 'MINE' | 'UNASSIGNED'>('ALL');
  const [cannedList, setCannedList] = useState<CannedResponse[]>([]);
  const [showCannedPicker, setShowCannedPicker] = useState(false);
  const [showAddCanned, setShowAddCanned] = useState(false);
  const [newCannedShort, setNewCannedShort] = useState('');
  const [newCannedTitle, setNewCannedTitle] = useState('');
  const [newCannedContent, setNewCannedContent] = useState('');
  const [savingCanned, setSavingCanned] = useState(false);

  const fetchAgentsAndCanned = useCallback(async () => {
    if (!isLiveChatUnlocked) return;
    try {
      const [agentsData, cannedData] = await Promise.all([
        api.getAssignableAgents().catch(() => []),
        api.getCannedResponses().catch(() => []),
      ]);
      setAssignableAgents(agentsData || []);
      setCannedList(cannedData || []);
    } catch {
      // ignore
    }
  }, [isLiveChatUnlocked]);

  useEffect(() => {
    void fetchAgentsAndCanned();
  }, [fetchAgentsAndCanned]);

  const handleAssignAgent = async (agentId: string | null) => {
    if (!selectedConversation) return;
    try {
      await api.updateConversation(selectedConversation.id, { assignedAgentId: agentId });
      toast.success(agentId ? 'Percakapan ditugaskan ke agent' : 'Penugasan agent dihapus');
      void fetchConversations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menugaskan agent');
    }
  };

  const handleCreateCanned = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCannedShort.trim() || !newCannedTitle.trim() || !newCannedContent.trim()) return;
    setSavingCanned(true);
    try {
      const created = await api.createCannedResponse({
        shortCode: newCannedShort.trim(),
        title: newCannedTitle.trim(),
        content: newCannedContent.trim(),
      });
      setCannedList((prev) => [...prev, created]);
      setNewCannedShort('');
      setNewCannedTitle('');
      setNewCannedContent('');
      setShowAddCanned(false);
      toast.success('Template balasan cepat ditambahkan');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan template');
    } finally {
      setSavingCanned(false);
    }
  };

  const handleDeleteCanned = async (id: string) => {
    try {
      await api.deleteCannedResponse(id);
      setCannedList((prev) => prev.filter((item) => item.id !== id));
    } catch {
      toast.error('Gagal menghapus template');
    }
  };

  const handleOpenNewChatModal = async () => {
    setShowNewChatModal(true);
    setContactSearch('');
    setLoadingContacts(true);
    try {
      const list = await api.getContacts();
      setContactsList(list || []);
    } catch {
      toast.error('Gagal memuat daftar kontak');
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleStartConversationWithContact = async (contactId: string) => {
    setOpeningContactId(contactId);
    try {
      const opened = await api.openConversation(contactId, selectedSession || undefined);
      setShowNewChatModal(false);
      const updated = await api.getConversations();
      setConversations(updated);
      const target = updated.find((c) => c.id === opened.id);
      if (target) {
        setSelectedConversation(target);
      }
      toast.success('Percakapan dibuka');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal membuka percakapan');
    } finally {
      setOpeningContactId(null);
    }
  };

  const handleStatusChange = async (nextStatus: 'OPEN' | 'PENDING' | 'RESOLVED') => {
    if (!selectedConversation) return;
    try {
      const baseUrl = `${window.location.origin}${window.location.pathname.replace(/\/+$/, '')}`;
      const res = await api.updateConversation(selectedConversation.id, {
        status: nextStatus,
        baseUrl,
      });
      if (res?.csatSent) {
        toast.success('Percakapan diakhiri & tautan CSAT dikirim otomatis');
      } else {
        toast.success(
          nextStatus === 'RESOLVED'
            ? 'Percakapan diakhiri (Resolved)'
            : nextStatus === 'OPEN'
            ? 'Percakapan dibuka kembali (Open)'
            : 'Status percakapan diubah ke Pending'
        );
      }
      void fetchConversations();
      if (nextStatus === 'RESOLVED') {
        void fetchMessages(selectedConversation.id);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal memperbarui status');
    }
  };

  const getLabelList = (conv: Conversation | null): string[] => {
    if (!conv?.labels) return [];
    return conv.labels
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const handleToggleLabel = async (label: string) => {
    if (!selectedConversation) return;
    const current = getLabelList(selectedConversation);
    const exists = current.some((l) => l.toLowerCase() === label.toLowerCase());
    const next = exists
      ? current.filter((l) => l.toLowerCase() !== label.toLowerCase())
      : [...current, label];
    try {
      await api.updateConversation(selectedConversation.id, {
        labels: next.length > 0 ? next.join(', ') : null,
      });
      void fetchConversations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal memperbarui label');
    }
  };

  const handleAddCustomLabel = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newLabel.trim();
    if (!clean || !selectedConversation) return;
    setNewLabel('');
    const current = getLabelList(selectedConversation);
    if (current.some((l) => l.toLowerCase() === clean.toLowerCase())) return;
    await handleToggleLabel(clean);
  };

  const handleSaveContactNotes = async () => {
    if (!selectedConversation || savingMeta) return;
    setSavingMeta(true);
    try {
      await api.updateConversation(selectedConversation.id, {
        contactNotes: contactNotesDraft.trim() || null,
      });
      toast.success('Catatan kontak diperbarui');
      void fetchConversations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan catatan kontak');
    } finally {
      setSavingMeta(false);
    }
  };

  const handleSendCsatCta = async () => {
    if (!selectedConversation || sendingCsat) return;
    setSendingCsat(true);
    try {
      const res = await api.sendConversationCsatCta(selectedConversation.id, {
        session: selectedSession || undefined,
        baseUrl: getAppBaseUrl(),
      });
      setMessages((prev) => [...prev, res.message]);
      toast.success('Tautan rating CSAT berhasil dikirim ke pelanggan');
      void fetchConversations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengirim tautan CSAT');
    } finally {
      setSendingCsat(false);
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
    const convStatus = (c.status || 'OPEN').toUpperCase();
    if (statusFilter !== 'ALL' && convStatus !== statusFilter) return false;
    if (assigneeFilter === 'MINE' && (!currentUser?.id || c.assignedAgentId !== currentUser.id)) {
      return false;
    }
    if (assigneeFilter === 'UNASSIGNED' && c.assignedAgentId) {
      return false;
    }
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      c.contact?.nama_lengkap?.toLowerCase().includes(q) ||
      c.contact?.nomor_whatsapp?.includes(q) ||
      c.lastMessage?.toLowerCase().includes(q) ||
      c.labels?.toLowerCase().includes(q) ||
      c.wahaSession?.toLowerCase().includes(q) ||
      c.assignedAgentName?.toLowerCase().includes(q)
    );
  });

  const activeLabels = getLabelList(selectedConversation);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden h-[calc(100vh-132px)] flex flex-col md:flex-row">
      {/* Left List */}
      <div className="w-full md:w-80 border-r border-gray-200 flex flex-col shrink-0 bg-gray-50/50">
        <div className="p-3 border-b border-gray-200 bg-white space-y-2">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari obrolan, label, atau sesi..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 bg-gray-50 border border-gray-200 rounded-md text-xs placeholder-gray-400 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              type="button"
              onClick={() => void handleOpenNewChatModal()}
              title="Buka Percakapan Baru"
              className="h-9 px-2.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium inline-flex items-center gap-1 shrink-0 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Baru</span>
            </button>
          </div>
          <div className="flex items-center gap-1 text-[11px]">
            {(['ALL', 'OPEN', 'PENDING', 'RESOLVED'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`flex-1 py-1 rounded font-medium border transition-colors ${
                  statusFilter === st
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {st === 'ALL' ? 'Semua' : st === 'OPEN' ? 'Open' : st === 'PENDING' ? 'Pending' : 'Selesai'}
              </button>
            ))}
          </div>
          {assignableAgents.length > 0 && (
            <div className="flex items-center gap-1 text-[10px]">
              {([
                { key: 'ALL', label: 'Semua Agent' },
                { key: 'MINE', label: 'Milik Saya' },
                { key: 'UNASSIGNED', label: 'Belum Ditugaskan' },
              ] as const).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setAssigneeFilter(f.key)}
                  className={`flex-1 py-0.5 px-1 rounded border transition-colors truncate ${
                    assigneeFilter === f.key
                      ? 'bg-sky-50 text-sky-700 border-sky-200 font-medium'
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
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
              const convLabels = getLabelList(conv);
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

                    <div className="flex items-center flex-wrap gap-1 mt-1.5">
                      {conv.wahaSession && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {conv.wahaSession}
                        </span>
                      )}
                      {conv.assignedAgentName && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
                          <UserCheck className="w-2.5 h-2.5" />
                          {conv.assignedAgentName}
                        </span>
                      )}
                      {conv.csatRating && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-500" />
                          {conv.csatRating}
                        </span>
                      )}
                      {convLabels.slice(0, 2).map((lbl) => (
                        <span
                          key={lbl}
                          className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
                        >
                          {lbl}
                        </span>
                      ))}
                    </div>
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
          <div className="h-14 bg-white border-b border-gray-200 px-4 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-md bg-indigo-600 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                {selectedConversation.contact?.nama_lengkap?.slice(0, 2).toUpperCase() || 'WA'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="font-semibold text-gray-900 text-xs truncate">
                    {selectedConversation.contact?.nama_lengkap}
                  </h4>
                  {selectedConversation.wahaSession && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                      <Smartphone className="w-2.5 h-2.5" />
                      {selectedConversation.wahaSession}
                    </span>
                  )}
                </div>
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

            <div className="flex items-center gap-1.5 shrink-0">
              {sessions.length > 0 && (
                <select
                  value={selectedSession}
                  onChange={(e) => setSelectedSession(e.target.value)}
                  title="Pilih sesi WAHA pengirim"
                  className="h-7 px-2 bg-white border border-gray-200 rounded text-[11px] font-mono text-gray-700 focus:outline-none focus:border-indigo-500 max-w-[145px]"
                >
                  {sessions.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name} ({s.status})
                    </option>
                  ))}
                </select>
              )}

              {assignableAgents.length > 0 && (
                <select
                  value={selectedConversation.assignedAgentId || ''}
                  onChange={(e) => void handleAssignAgent(e.target.value || null)}
                  title="Tugaskan ke Agent"
                  className="h-7 px-2 bg-white border border-gray-200 rounded text-[11px] text-gray-700 focus:outline-none focus:border-indigo-500 max-w-[130px]"
                >
                  <option value="">Belum Ditugaskan</option>
                  {assignableAgents.map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.name}
                    </option>
                  ))}
                </select>
              )}

              <select
                value={selectedConversation.status || 'OPEN'}
                onChange={(e) =>
                  handleStatusChange(e.target.value as 'OPEN' | 'PENDING' | 'RESOLVED')
                }
                title="Status Percakapan"
                className={`h-7 px-2 rounded text-[11px] font-semibold border focus:outline-none ${
                  selectedConversation.status === 'RESOLVED'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : selectedConversation.status === 'PENDING'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                }`}
              >
                <option value="OPEN">Open</option>
                <option value="PENDING">Pending</option>
                <option value="RESOLVED">Resolved</option>
              </select>

              {selectedConversation.status === 'RESOLVED' ? (
                <button
                  type="button"
                  onClick={() => void handleStatusChange('OPEN')}
                  title="Buka kembali percakapan ini"
                  className="h-7 px-2.5 rounded border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-medium inline-flex items-center gap-1 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span className="hidden lg:inline">Buka Kembali</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleStatusChange('RESOLVED')}
                  title="Akhiri percakapan (tandai Resolved)"
                  className="h-7 px-2.5 rounded border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-medium inline-flex items-center gap-1 transition-colors"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span className="hidden lg:inline">Akhiri</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleSendCsatCta}
                disabled={sendingCsat}
                title="Kirim Tautan Rating CSAT ke Pelanggan"
                className="h-7 px-2 rounded border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-medium inline-flex items-center gap-1 transition-colors disabled:opacity-50"
              >
                <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                <span className="hidden lg:inline">Kirim CSAT</span>
              </button>

              <button
                type="button"
                onClick={() => toggleContactPanel()}
                title={showContactPanel ? 'Tutup Detail Kontak' : 'Buka Detail Kontak'}
                className="h-7 w-7 rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 inline-flex items-center justify-center"
              >
                {showContactPanel ? (
                  <PanelRightClose className="w-3.5 h-3.5" />
                ) : (
                  <PanelRightOpen className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-2.5">
            {loadingMessages && messages.length === 0 ? (
              <LoadingState message="Memuat pesan..." />
            ) : messages.length === 0 ? (
              <EmptyState title="Belum ada pesan" description="Kirim pesan pertama ke pelanggan ini." />
            ) : (
              messages.map((msg) => {
                const isNote = msg.messageType === 'NOTE';
                const isCsat = msg.messageType === 'CSAT';
                const isOutbound = msg.direction === 'OUTBOUND';
                const isRead = msg.ackStatus >= 3;
                const isDelivered = msg.ackStatus === 2;

                if (isNote) {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <div className="max-w-[85%] rounded-lg px-3.5 py-2 text-xs border bg-amber-50 border-amber-200 text-amber-950 space-y-1">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-800">
                          <StickyNote className="w-3 h-3" />
                          <span>Catatan Internal (Tidak terkirim ke WhatsApp)</span>
                        </div>
                        <div className="whitespace-pre-wrap leading-relaxed">{msg.body}</div>
                        <div className="text-[10px] text-amber-700/80 font-mono text-right">
                          {new Date(msg.createdAt).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-lg px-3.5 py-2 text-xs border leading-relaxed space-y-1.5 ${
                        isCsat
                          ? 'bg-amber-50/60 border-amber-200 text-gray-900'
                          : isOutbound
                          ? 'bg-indigo-50 border-indigo-200 text-gray-900'
                          : 'bg-white border-gray-200 text-gray-900'
                      }`}
                    >
                      {isCsat && (
                        <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                          <span>Permintaan Rating CSAT</span>
                        </div>
                      )}

                      {msg.mediaUrl && msg.mediaType === 'image' && (
                        <img
                          src={resolveMediaUrl(msg.mediaUrl)}
                          alt={msg.mediaName || 'Lampiran gambar'}
                          className="max-h-60 rounded border border-gray-200 object-contain bg-white"
                        />
                      )}

                      {msg.mediaUrl && msg.mediaType === 'video' && (
                        <video
                          src={resolveMediaUrl(msg.mediaUrl)}
                          controls
                          className="max-h-60 rounded border border-gray-200 bg-black"
                        />
                      )}

                      {msg.mediaUrl && msg.mediaType === 'audio' && (
                        <audio src={resolveMediaUrl(msg.mediaUrl)} controls className="w-full max-w-xs" />
                      )}

                      {msg.mediaType && !['image', 'video', 'audio'].includes(msg.mediaType) && (
                        <div className="flex items-center gap-2 p-2 rounded bg-white/80 border border-gray-200 text-[11px]">
                          <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                          <span className="font-mono truncate">{msg.mediaName || 'Dokumen'}</span>
                          {msg.mediaUrl && (
                            <a
                              href={resolveMediaUrl(msg.mediaUrl)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-600 hover:underline ml-auto shrink-0"
                            >
                              Buka
                            </a>
                          )}
                        </div>
                      )}

                      <div className="whitespace-pre-wrap break-words">{msg.body}</div>

                      <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-gray-500 font-mono tabular-nums">
                        {msg.wahaSession && (
                          <span className="text-[9px] text-gray-400">{msg.wahaSession}</span>
                        )}
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

          {/* Composer */}
          <div className="bg-white border-t border-gray-200 p-3 space-y-2 shrink-0 relative">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex rounded-md border border-gray-200 p-0.5 bg-gray-50 text-[11px] shrink-0">
                <button
                  type="button"
                  onClick={() => setComposerMode('REPLY')}
                  className={`px-2.5 py-1 rounded font-medium whitespace-nowrap transition-colors ${
                    composerMode === 'REPLY'
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Balas WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setComposerMode('NOTE');
                    setPendingAttachment(null);
                  }}
                  className={`px-2.5 py-1 rounded font-medium inline-flex items-center gap-1 whitespace-nowrap transition-colors ${
                    composerMode === 'NOTE'
                      ? 'bg-amber-100 text-amber-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <StickyNote className="w-3 h-3" />
                  Catatan Internal
                </button>
              </div>
            </div>

            {pendingAttachment && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-indigo-50 border border-indigo-200 text-xs">
                {pendingAttachment.isImage ? (
                  <img
                    src={pendingAttachment.base64}
                    alt={pendingAttachment.name}
                    className="w-10 h-10 rounded object-cover border border-indigo-200"
                  />
                ) : (
                  <FileText className="w-5 h-5 text-indigo-600 shrink-0" />
                )}
                <span className="font-mono text-[11px] truncate flex-1">
                  {pendingAttachment.name}
                </span>
                <button
                  type="button"
                  onClick={() => setPendingAttachment(null)}
                  className="p-1 text-gray-500 hover:text-gray-800"
                  aria-label="Hapus lampiran"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {showEmojiPicker && (
              <div className="absolute bottom-16 left-3 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-2.5 w-64 grid grid-cols-8 gap-1">
                {QUICK_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      setInputText((prev) => prev + em);
                      setShowEmojiPicker(false);
                    }}
                    className="h-7 w-7 rounded hover:bg-gray-100 text-base flex items-center justify-center"
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}

            {showCannedPicker && (
              <div className="absolute bottom-16 left-3 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-80 max-w-[90vw] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    Balasan Cepat (Canned Responses)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddCanned((v) => !v)}
                      className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      {showAddCanned ? 'Tutup' : '+ Tambah'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCannedPicker(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {showAddCanned && (
                  <form onSubmit={handleCreateCanned} className="p-2 rounded bg-gray-50 border border-gray-200 space-y-1.5">
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        required
                        placeholder="Kode (mis. sapa)"
                        value={newCannedShort}
                        onChange={(e) => setNewCannedShort(e.target.value)}
                        className="px-2 py-1 bg-white border border-gray-300 rounded text-[11px] font-mono"
                      />
                      <input
                        type="text"
                        required
                        placeholder="Judul singkat"
                        value={newCannedTitle}
                        onChange={(e) => setNewCannedTitle(e.target.value)}
                        className="px-2 py-1 bg-white border border-gray-300 rounded text-[11px]"
                      />
                    </div>
                    <textarea
                      rows={2}
                      required
                      placeholder="Isi template balasan..."
                      value={newCannedContent}
                      onChange={(e) => setNewCannedContent(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-gray-300 rounded text-[11px]"
                    />
                    <Button type="submit" size="sm" variant="primary" isLoading={savingCanned} className="w-full">
                      Simpan Template
                    </Button>
                  </form>
                )}

                <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                  {cannedList.length === 0 ? (
                    <div className="py-4 text-center text-[11px] text-gray-500">
                      Belum ada template balasan cepat.
                    </div>
                  ) : (
                    cannedList.map((item) => (
                      <div key={item.id} className="py-1.5 flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setInputText((prev) => (prev ? `${prev} ${item.content}` : item.content));
                            setShowCannedPicker(false);
                          }}
                          className="text-left flex-1 min-w-0 hover:bg-gray-50 rounded p-1"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono text-[10px]">
                              /{item.shortCode}
                            </span>
                            <span className="text-[11px] font-medium text-gray-800 truncate">
                              {item.title}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 line-clamp-2 mt-0.5">{item.content}</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteCanned(item.id)}
                          className="p-1 text-gray-400 hover:text-red-600 shrink-0"
                          title="Hapus Template"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {composerMode === 'REPLY' &&
              !showCannedPicker &&
              inputText.startsWith('/') &&
              !inputText.includes(' ') &&
              cannedList.some((c) =>
                c.shortCode.toLowerCase().includes(inputText.slice(1).toLowerCase()) ||
                c.title.toLowerCase().includes(inputText.slice(1).toLowerCase())
              ) && (
                <div className="absolute bottom-16 left-3 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-1.5 w-80 max-w-[90vw] max-h-48 overflow-y-auto divide-y divide-gray-100">
                  {cannedList
                    .filter((c) => {
                      const q = inputText.slice(1).toLowerCase();
                      return (
                        !q ||
                        c.shortCode.toLowerCase().includes(q) ||
                        c.title.toLowerCase().includes(q)
                      );
                    })
                    .slice(0, 6)
                    .map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setInputText(item.content)}
                        className="w-full text-left px-2 py-1.5 hover:bg-indigo-50 rounded transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono text-[10px]">
                            /{item.shortCode}
                          </span>
                          <span className="text-[11px] font-medium text-gray-800 truncate">
                            {item.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 truncate mt-0.5">{item.content}</p>
                      </button>
                    ))}
                </div>
              )}

            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                onChange={handleFilePick}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => {
                  setShowEmojiPicker((v) => !v);
                  setShowCannedPicker(false);
                }}
                title="Sisipkan Emotikon"
                className="h-9 w-9 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 inline-flex items-center justify-center shrink-0"
              >
                <Smile className="w-4 h-4" />
              </button>
              {composerMode === 'REPLY' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCannedPicker((v) => !v);
                      setShowEmojiPicker(false);
                    }}
                    title="Balasan Cepat (Canned Responses)"
                    className="h-9 w-9 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 text-amber-600 inline-flex items-center justify-center shrink-0"
                  >
                    <Zap className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Lampirkan Gambar atau Dokumen"
                    className="h-9 w-9 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 inline-flex items-center justify-center shrink-0"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                </>
              )}
              <input
                type="text"
                placeholder={
                  composerMode === 'NOTE'
                    ? 'Tulis catatan internal tim (tidak dikirim ke pelanggan)...'
                    : 'Ketik balasan WhatsApp...'
                }
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className={`flex-1 h-9 px-3 border rounded-md text-[13px] placeholder-gray-400 focus:outline-none ${
                  composerMode === 'NOTE'
                    ? 'bg-amber-50/70 border-amber-200 focus:border-amber-500'
                    : 'bg-gray-50 border-gray-200 focus:border-indigo-500'
                }`}
              />
              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={sending}
                disabled={!inputText.trim() && !pendingAttachment}
                leftIcon={
                  composerMode === 'NOTE' ? (
                    <StickyNote className="w-3.5 h-3.5" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )
                }
              >
                {composerMode === 'NOTE' ? 'Simpan' : 'Kirim'}
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50 text-gray-400">
          <MessageSquare className="w-10 h-10 text-gray-300 mb-2" />
          <p className="text-xs text-gray-500">
            Pilih percakapan dari daftar di sebelah kiri untuk melihat pesan.
          </p>
        </div>
      )}

      {/* Right Contact Profile (Collapsible) */}
      {showContactPanel && selectedConversation?.contact && (
        <div className="w-full md:w-72 lg:w-80 border-l border-gray-200 bg-white p-4 flex flex-col shrink-0 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Detail Kontak
            </span>
            <button
              type="button"
              onClick={() => toggleContactPanel(false)}
              title="Tutup Detail Kontak"
              className="p-1 rounded hover:bg-gray-100 text-gray-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="text-center pb-4 border-b border-gray-200">
            <div className="w-12 h-12 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-base flex items-center justify-center mx-auto mb-2 border border-indigo-200">
              {selectedConversation.contact.nama_lengkap.slice(0, 2).toUpperCase()}
            </div>
            <h4 className="font-semibold text-gray-900 text-sm">
              {selectedConversation.contact.nama_lengkap}
            </h4>
            {selectedConversation.contact.nama_panggilan && (
              <span className="text-xs text-gray-500 block">
                Panggilan: {selectedConversation.contact.nama_panggilan}
              </span>
            )}
            {selectedConversation.wahaSession && (
              <span className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Smartphone className="w-3 h-3" />
                Sesi: {selectedConversation.wahaSession}
              </span>
            )}
          </div>

          <div className="py-4 space-y-4 flex-1 text-xs text-gray-700">
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

            {/* Labels Editor */}
            <div className="pt-2 border-t border-gray-100 space-y-2">
              <span className="flex items-center gap-1 text-[11px] text-gray-500 font-medium">
                <Tag className="w-3 h-3" />
                Label Percakapan
              </span>
              <div className="flex flex-wrap gap-1">
                {activeLabels.map((lbl) => (
                  <span
                    key={lbl}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
                  >
                    {lbl}
                    <button
                      type="button"
                      onClick={() => handleToggleLabel(lbl)}
                      className="hover:text-indigo-900"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
                {PRESET_LABELS.filter(
                  (p) => !activeLabels.some((a) => a.toLowerCase() === p.toLowerCase())
                ).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleToggleLabel(preset)}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-gray-50 hover:bg-gray-100 text-gray-600 border border-dashed border-gray-300"
                  >
                    <Plus className="w-2.5 h-2.5" />
                    {preset}
                  </button>
                ))}
              </div>
              <form onSubmit={handleAddCustomLabel} className="flex gap-1.5">
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Tambah label..."
                  className="flex-1 h-7 px-2 bg-gray-50 border border-gray-200 rounded text-[11px] focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="h-7 px-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-[11px] font-medium"
                >
                  Tambah
                </button>
              </form>
            </div>

            {/* Contact Notes */}
            <div className="pt-2 border-t border-gray-100 space-y-1.5">
              <span className="block text-[11px] text-gray-500 font-medium">
                Catatan Kontak
              </span>
              <textarea
                rows={3}
                value={contactNotesDraft}
                onChange={(e) => setContactNotesDraft(e.target.value)}
                placeholder="Tambahkan catatan permanen untuk kontak ini..."
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded text-[11px] focus:outline-none focus:border-indigo-500"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                isLoading={savingMeta}
                onClick={handleSaveContactNotes}
                className="w-full justify-center"
              >
                Simpan Catatan Kontak
              </Button>
            </div>

            {/* CSAT Rating Result */}
            <div className="pt-2 border-t border-gray-100 space-y-1.5">
              <span className="block text-[11px] text-gray-500 font-medium">
                Hasil Penilaian CSAT
              </span>
              {selectedConversation.csatRating ? (
                <div className="p-2.5 rounded-md bg-amber-50 border border-amber-200 space-y-1">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-3.5 h-3.5 ${
                          s <= (selectedConversation.csatRating || 0)
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-gray-300'
                        }`}
                      />
                    ))}
                    <span className="text-[11px] font-semibold text-amber-900 ml-1">
                      {selectedConversation.csatRating}/5
                    </span>
                  </div>
                  {selectedConversation.csatFeedback && (
                    <p className="text-[11px] text-amber-900 italic">
                      "{selectedConversation.csatFeedback}"
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-gray-400">
                  Belum ada penilaian. Gunakan tombol "Kirim CSAT" di atas untuk meminta rating.
                </p>
              )}
            </div>
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

      {showNewChatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg border border-gray-200 shadow-lg w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Buka Percakapan Baru</h3>
                <p className="text-[11px] text-gray-500">Pilih kontak pelanggan untuk memulai obrolan</p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewChatModal(false)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 border-b border-gray-100">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder="Cari nama atau nomor WhatsApp..."
                  className="w-full h-9 pl-9 pr-3 bg-gray-50 border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {loadingContacts ? (
                <div className="p-6 text-center text-xs text-gray-500">Memuat kontak...</div>
              ) : (
                contactsList
                  .filter((c) => {
                    const q = contactSearch.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      c.nama_lengkap.toLowerCase().includes(q) ||
                      (c.nama_panggilan || '').toLowerCase().includes(q) ||
                      c.nomor_whatsapp.includes(q)
                    );
                  })
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={openingContactId === c.id}
                      onClick={() => void handleStartConversationWithContact(c.id)}
                      className="w-full px-4 py-2.5 text-left hover:bg-gray-50 flex items-center justify-between gap-3 transition-colors disabled:opacity-50"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-gray-900 truncate">
                          {c.nama_lengkap}
                        </div>
                        <div className="text-[11px] text-gray-500 font-mono">
                          +{c.nomor_whatsapp}
                        </div>
                      </div>
                      <span className="text-[11px] font-medium text-indigo-600 shrink-0">
                        {openingContactId === c.id ? 'Membuka...' : 'Buka Chat'}
                      </span>
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Conversations;
