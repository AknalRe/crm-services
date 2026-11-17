import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  MessageSquare,
  Search,
  Phone,
  Check,
  CheckCheck,
  Calendar,
  MapPin,
  Lock,
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
  ArrowLeft,
  ChevronDown,
  Package,
  AlertTriangle,
  GitMerge,
  Clock,
  Reply,
  Video,
  Music,
  Download,
  Link2,
  ListChecks,
  ExternalLink,
  Copy,
  BarChart2,
  Users,
  EyeOff,
  RefreshCw,
} from 'lucide-react';
import api from '../services/api';
import { subscribeLiveEvent } from '../services/liveEvents';
import { getApiBaseUrl } from '../services/paths';
import {
  AuthStatus,
  CannedResponse,
  ChannelAccount,
  ChatMessage,
  ChatMessageMetadata,
  Contact,
  Conversation,
  ConversationNavigationTarget,
  ConversationParticipantsResponse,
  CrmLabelItem,
  InteractiveButtonItem,
  LicenseInfo,
  OmnichannelType,
  ProductItem,
  WahaSessionItem,
} from '../types';
import { LABEL_COLOR_MAP } from '../components/MasterDataSettings';
import { hasPerm } from '../lib/permissions';

const CHANNEL_META: Record<OmnichannelType, { label: string; short: string; cls: string }> = {
  WHATSAPP: { label: 'WhatsApp', short: 'WA', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  WHATSAPP_CLOUD: { label: 'WA Business Cloud', short: 'WA Cloud', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  INSTAGRAM: { label: 'Instagram', short: 'IG', cls: 'bg-pink-50 text-pink-700 border-pink-200' },
  FACEBOOK: { label: 'Facebook', short: 'FB', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  THREADS: { label: 'Threads', short: 'Threads', cls: 'bg-gray-100 text-gray-800 border-gray-300' },
  TELEGRAM: { label: 'Telegram', short: 'TG', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
};
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/ToastProvider';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/StateBlocks';

function resolveMediaUrl(url?: string | null): string {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  const apiBase =
    typeof window !== 'undefined' ? getApiBaseUrl(window.location.pathname) : './api';
  if (url.startsWith('/api/files/') || url.startsWith('/files/')) {
    return `${apiBase}/conversations/media-proxy?url=${encodeURIComponent(url)}`;
  }
  if (url.startsWith('/api/')) return `${apiBase}${url.slice('/api'.length)}`;
  if (url.startsWith('/')) return url;
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      if (
        parsed.pathname.startsWith('/api/files/') ||
        parsed.pathname.startsWith('/files/') ||
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0'
      ) {
        return `${apiBase}/conversations/media-proxy?url=${encodeURIComponent(url)}`;
      }
      return url;
    } catch {
      return `${apiBase}/conversations/media-proxy?url=${encodeURIComponent(url)}`;
    }
  }
  return url;
}

const FALLBACK_EXT_MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.3gp': 'video/3gpp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.zip': 'application/zip',
  '.rar': 'application/x-rar-compressed',
};

function inferAttachmentMime(file: File): string {
  if (file.type && file.type.trim()) return file.type.trim();
  const dotIdx = file.name.lastIndexOf('.');
  if (dotIdx >= 0) {
    const ext = file.name.slice(dotIdx).toLowerCase();
    if (FALLBACK_EXT_MIME[ext]) return FALLBACK_EXT_MIME[ext];
  }
  return 'application/octet-stream';
}

function parseChatMessageMeta(msg: ChatMessage): ChatMessageMetadata | null {
  if (!msg.metadataJson) return null;
  try {
    return JSON.parse(msg.metadataJson) as ChatMessageMetadata;
  } catch {
    return null;
  }
}

function renderTextWithClickableLinks(text: string): React.ReactNode {
  if (!text) return null;
  const parts = text.split(/(https?:\/\/[^\s<>]+)/gi);
  return parts.map((part, idx) => {
    if (/^https?:\/\/[^\s<>]+$/i.test(part)) {
      const clean = part.replace(/[.,);!?]+$/, '');
      const trailing = part.slice(clean.length);
      return (
        <React.Fragment key={idx}>
          <a
            href={clean}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-indigo-700 hover:text-indigo-900 break-all"
          >
            {clean}
          </a>
          {trailing}
        </React.Fragment>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function getConversationDisplayTitle(conv?: Conversation | null): string {
  if (!conv) return 'WhatsApp';
  return (
    conv.channelDisplayName?.trim() ||
    conv.contextTitle?.trim() ||
    conv.pushName?.trim() ||
    conv.contact?.nama_lengkap?.trim() ||
    conv.contact?.nomor_whatsapp?.trim() ||
    conv.externalThreadId ||
    'WhatsApp'
  );
}

const PARTICIPANT_TEXT_COLORS = [
  'text-indigo-700',
  'text-emerald-700',
  'text-amber-700',
  'text-rose-700',
  'text-sky-700',
  'text-violet-700',
  'text-teal-700',
];

function getParticipantColorClass(key?: string | null): string {
  if (!key) return PARTICIPANT_TEXT_COLORS[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return PARTICIPANT_TEXT_COLORS[hash % PARTICIPANT_TEXT_COLORS.length];
}

interface ConversationsProps {
  licenseInfo?: LicenseInfo | null;
  currentUser?: AuthStatus['user'] | null;
  targetConversation?: ConversationNavigationTarget | null;
  onTargetHandled?: () => void;
  onOpenPlans?: () => void;
  onOpenSettings?: (section: 'quick_replies' | 'products' | 'labels') => void;
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
  if (typeof window !== 'undefined' && window.innerWidth < 1280) {
    return false;
  }
  try {
    return localStorage.getItem(CONTACT_PANEL_KEY) !== 'closed';
  } catch {
    return true;
  }
}

export const Conversations: React.FC<ConversationsProps> = ({
  licenseInfo,
  currentUser,
  targetConversation,
  onTargetHandled,
  onOpenPlans,
  onOpenSettings,
}) => {
  const toast = useToast();
  const canManageMaster =
    hasPerm(currentUser, 'settings.edit') || hasPerm(currentUser, 'conversations.manage');
  const canViewAllConversations = hasPerm(currentUser, 'conversations.view_all');
  const canReplyConversation = hasPerm(currentUser, 'conversations.reply');
  const canManageConversation = hasPerm(currentUser, 'conversations.manage');
  const canSendCsat = hasPerm(currentUser, 'conversations.csat');
  const canEditContact = hasPerm(currentUser, 'contacts.edit');
  const isLiveChatUnlocked = Boolean(
    licenseInfo && !licenseInfo.isExpired && licenseInfo.features?.liveChatCrm
  );

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'PENDING' | 'RESOLVED'>('ALL');
  const [metricFilter, setMetricFilter] = useState<'ALL' | 'ASSESSED' | 'EXCLUDED' | 'GROUPS'>('ALL');
  const [channelFilter, setChannelFilter] = useState<'ALL' | OmnichannelType>('ALL');
  const [channelAccounts, setChannelAccounts] = useState<ChannelAccount[]>([]);
  const [accountFilter, setAccountFilter] = useState<'ALL' | string>('ALL');
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [showResolveMenu, setShowResolveMenu] = useState(false);

  const [sessions, setSessions] = useState<WahaSessionItem[]>([]);
  const [defaultWahaSession, setDefaultWahaSession] = useState<string>('');
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [retryingMessageId, setRetryingMessageId] = useState<string | null>(null);
  const [showContactPanel, setShowContactPanel] = useState<boolean>(readContactPanelPref);

  // Composer enhancements: Internal note mode, Emoji picker, Product Quick Quote, Link & Interactive, File attachment
  const [composerMode, setComposerMode] = useState<'REPLY' | 'NOTE'>(() =>
    hasPerm(currentUser, 'conversations.reply')
      ? 'REPLY'
      : hasPerm(currentUser, 'conversations.manage')
      ? 'NOTE'
      : 'REPLY'
  );
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showLinkComposer, setShowLinkComposer] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkDesc, setLinkDesc] = useState('');
  const [linkCaption, setLinkCaption] = useState('');
  const [linkImageUrl, setLinkImageUrl] = useState('');
  const [showInteractiveComposer, setShowInteractiveComposer] = useState(false);
  const [interactiveTab, setInteractiveTab] = useState<'BUTTONS' | 'POLL'>('BUTTONS');
  const [btnHeader, setBtnHeader] = useState('');
  const [btnBody, setBtnBody] = useState('');
  const [btnFooter, setBtnFooter] = useState('');
  const [btnFallbackText, setBtnFallbackText] = useState(true);
  const [btnItems, setBtnItems] = useState<InteractiveButtonItem[]>([
    { type: 'reply', text: 'Ya, Lanjut' },
    { type: 'reply', text: 'Tanya Admin' },
  ]);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['Pilihan 1', 'Pilihan 2']);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [lightboxMedia, setLightboxMedia] = useState<{ url: string; name?: string | null } | null>(null);
  const [presenceByConvId, setPresenceByConvId] = useState<
    Record<string, { status: 'typing' | 'recording' | 'online' | 'paused'; expiresAt: number }>
  >({});
  const outboundTypingRef = useRef<{
    convId: string;
    active: boolean;
    lastSentAt: number;
    stopTimer: number | null;
  }>({ convId: '', active: false, lastSentAt: 0, stopTimer: null });
  const [slaTargetMinutes, setSlaTargetMinutes] = useState<number>(15);
  const [productsList, setProductsList] = useState<ProductItem[]>([]);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProdSku, setNewProdSku] = useState('');
  const [newProdName, setNewProdName] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [newProdUnit, setNewProdUnit] = useState('pcs');
  const [savingProduct, setSavingProduct] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{
    base64: string;
    mimetype: string;
    name: string;
    size?: number;
    kind: 'image' | 'video' | 'audio' | 'document';
  } | null>(null);
  const [replyingToMessage, setReplyingToMessage] = useState<ChatMessage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);

  // Right panel: Labels & Contact Notes
  const [newLabel, setNewLabel] = useState('');
  const [contactNotesDraft, setContactNotesDraft] = useState('');
  const [channelDisplayNameDraft, setChannelDisplayNameDraft] = useState('');
  const [excludeReasonDraft, setExcludeReasonDraft] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [savingChannelName, setSavingChannelName] = useState(false);
  const [savingExclude, setSavingExclude] = useState(false);
  const [participantsData, setParticipantsData] = useState<ConversationParticipantsResponse | null>(null);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [sendingCsat, setSendingCsat] = useState(false);
  const [expandedCsatId, setExpandedCsatId] = useState<string | null>(null);
  const [highlightedCsatWindow, setHighlightedCsatWindow] = useState<{
    token?: string | null;
    startedAt?: string | null;
    resolvedAt?: string | null;
  } | null>(null);

  const msgElementRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastAutoScrollRef = useRef<{ convId: string; lastMsgId: string | null }>({
    convId: '',
    lastMsgId: null,
  });

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

  const targetConvIdRef = useRef<string | null>(targetConversation?.conversationId || null);
  targetConvIdRef.current = targetConversation?.conversationId || null;

  const fetchConversations = useCallback(async () => {
    if (!isLiveChatUnlocked) return;
    try {
      const data = await api.getConversations();
      setConversations(data);
      setListError(null);
      setSelectedConversation((prev) => {
        if (targetConvIdRef.current) {
          const targeted = data.find((c) => c.id === targetConvIdRef.current);
          if (targeted) return targeted;
        }
        if (!prev) return data.length > 0 ? data[0] : null;
        return data.find((c) => c.id === prev.id) || (data.length > 0 ? data[0] : null);
      });
    } catch (err: any) {
      setListError(err.response?.data?.error || err.message || 'Gagal memuat daftar percakapan');
    } finally {
      setLoadingList(false);
    }
  }, [isLiveChatUnlocked]);

  const fetchMessages = useCallback(async (convId: string, silent = false) => {
    if (!isLiveChatUnlocked) return;
    if (!silent) {
      setLoadingMessages(true);
    }
    try {
      const isVisible = typeof document === 'undefined' || document.visibilityState === 'visible';
      const data = await api.getConversationMessages(convId, { markRead: isVisible });
      setMessages(data);
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      if (!silent) {
        setLoadingMessages(false);
      }
    }
  }, [isLiveChatUnlocked]);

  useEffect(() => {
    if (!isLiveChatUnlocked) return;
    fetchConversations();
    const unsub = subscribeLiveEvent('conversations:update', () => {
      void fetchConversations();
    });
    const unsubPresence = subscribeLiveEvent('conversations:presence', (evt: any) => {
      const d = evt?.data || evt;
      const convId = String(d?.conversationId || '').trim();
      const status = String(d?.presence || '').toLowerCase();
      if (!convId) return;
      if (status === 'paused' || status === 'unavailable' || status === 'offline') {
        setPresenceByConvId((prev) => {
          if (!prev[convId]) return prev;
          const next = { ...prev };
          delete next[convId];
          return next;
        });
        return;
      }
      if (status === 'typing' || status === 'recording' || status === 'online') {
        const ttlMs = status === 'online' ? 12000 : 8500;
        setPresenceByConvId((prev) => ({
          ...prev,
          [convId]: { status, expiresAt: Date.now() + ttlMs },
        }));
      }
    });
    const presencePruner = window.setInterval(() => {
      const now = Date.now();
      setPresenceByConvId((prev) => {
        const keys = Object.keys(prev);
        if (keys.length === 0) return prev;
        let changed = false;
        const next: typeof prev = {};
        for (const k of keys) {
          if (prev[k].expiresAt > now) {
            next[k] = prev[k];
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 2000);
    // Fallback poll ensures inbound WAHA chats still appear promptly if SSE disconnects/buffers behind a proxy
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchConversations();
      }
    }, 12000);
    return () => {
      unsub();
      unsubPresence();
      window.clearInterval(presencePruner);
      window.clearInterval(timer);
    };
  }, [fetchConversations, isLiveChatUnlocked]);

  useEffect(() => {
    if (!isLiveChatUnlocked) return;
    api
      .getWahaSessions()
      .then((res) => {
        const list = res.sessions || [];
        setSessions(list);
        const preferred =
          (res.activeSession && list.some((s) => s.name === res.activeSession) ? res.activeSession : '') ||
          list.find((s) => s.status === 'WORKING')?.name ||
          list[0]?.name ||
          res.activeSession ||
          '';
        setDefaultWahaSession(preferred);
      })
      .catch(() => {});
    api
      .getCrmSettings()
      .then((res) => {
        if (res?.slaTargetMinutes) {
          setSlaTargetMinutes(res.slaTargetMinutes);
        }
      })
      .catch(() => {});
    api
      .getProducts(true)
      .then((items) => setProductsList(items || []))
      .catch(() => {});
    api
      .getChannels()
      .then((list) => setChannelAccounts(list || []))
      .catch(() => {});

    const unsubSla = subscribeLiveEvent('sla:breach', (data: any) => {
      toast.error(`SLA terlewat (${data?.waitingMinutes || '?'} mnt belum dibalas)`);
      void fetchConversations();
    });
    const unsubCsat = subscribeLiveEvent('csat:low', (data: any) => {
      toast.error(`Peringatan: Rating CSAT rendah (${data?.rating || '?'}/5)`);
    });
    return () => {
      unsubSla();
      unsubCsat();
    };
  }, [isLiveChatUnlocked]);

  useEffect(() => {
    if (!selectedConversation) return;
    const convSession = (selectedConversation.wahaSession || '').trim();
    if (sessions.length > 0) {
      const exactMatch = convSession ? sessions.find((s) => s.name === convSession) : undefined;
      if (exactMatch) {
        setSelectedSession(exactMatch.name);
      } else {
        const workingMatch =
          sessions.find((s) => s.name === defaultWahaSession && s.status === 'WORKING')?.name ||
          sessions.find((s) => s.status === 'WORKING')?.name ||
          (defaultWahaSession && sessions.some((s) => s.name === defaultWahaSession)
            ? defaultWahaSession
            : sessions[0]?.name || '');
        setSelectedSession(workingMatch);
      }
    } else {
      setSelectedSession(convSession || defaultWahaSession);
    }
  }, [selectedConversation?.id, selectedConversation?.wahaSession, sessions, defaultWahaSession]);

  const fetchParticipants = useCallback(async (convId: string, sync = true) => {
    setLoadingParticipants(true);
    try {
      const res = await api.getConversationParticipants(convId, sync);
      setParticipantsData(res);
    } catch {
      setParticipantsData(null);
    } finally {
      setLoadingParticipants(false);
    }
  }, []);

  useEffect(() => {
    if (isLiveChatUnlocked && selectedConversation) {
      fetchMessages(selectedConversation.id, false);
      setContactNotesDraft(selectedConversation.contact?.notes || '');
      setChannelDisplayNameDraft(selectedConversation.channelDisplayName || '');
      setExcludeReasonDraft(selectedConversation.excludeReason || 'Bukan Customer');
      if (selectedConversation.isGroup || selectedConversation.externalThreadId?.endsWith('@g.us')) {
        void fetchParticipants(selectedConversation.id, false);
      } else {
        setParticipantsData(null);
      }
      const convId = selectedConversation.id;
      const unsub = subscribeLiveEvent('conversations:update', () => {
        void fetchMessages(convId, true);
      });
      const onVis = () => {
        if (document.visibilityState === 'visible') {
          void fetchMessages(convId, true);
        }
      };
      document.addEventListener('visibilitychange', onVis);
      const timer = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          void fetchMessages(convId, true);
        }
      }, 12000);
      return () => {
        unsub();
        document.removeEventListener('visibilitychange', onVis);
        window.clearInterval(timer);
        const st = outboundTypingRef.current;
        if (st.stopTimer) {
          window.clearTimeout(st.stopTimer);
          st.stopTimer = null;
        }
        if (st.active && st.convId === convId) {
          st.active = false;
          void api.sendConversationTyping(convId, false, selectedSession || undefined).catch(() => {});
        }
      };
    }
  }, [selectedConversation?.id, fetchMessages, isLiveChatUnlocked]);

  useEffect(() => {
    if (selectedConversation) {
      setContactNotesDraft(selectedConversation.contact?.notes || '');
    }
  }, [selectedConversation?.contact?.notes, selectedConversation?.id]);

  useEffect(() => {
    if (!targetConversation?.conversationId || conversations.length === 0) return;
    const match = conversations.find((c) => c.id === targetConversation.conversationId);
    if (!match) return;
    setStatusFilter('ALL');
    setChannelFilter('ALL');
    setAccountFilter('ALL');
    setSearch('');
    setSelectedConversation(match);
    if (targetConversation.csatToken || targetConversation.csatStartedAt || targetConversation.csatResolvedAt) {
      setHighlightedCsatWindow({
        token: targetConversation.csatToken || null,
        startedAt: targetConversation.csatStartedAt || null,
        resolvedAt: targetConversation.csatResolvedAt || null,
      });
    } else {
      setHighlightedCsatWindow(null);
    }
    onTargetHandled?.();
  }, [targetConversation, conversations, onTargetHandled]);

  useEffect(() => {
    const convId = selectedConversation?.id || '';
    if (convId && highlightedCsatWindow && messages.length > 0) {
      const targetMsg =
        (highlightedCsatWindow.token
          ? messages.find((m) => m.body && m.body.includes(highlightedCsatWindow.token!))
          : undefined) ||
        (highlightedCsatWindow.resolvedAt
          ? messages.find(
              (m) =>
                m.messageType === 'CSAT' &&
                Math.abs(new Date(m.createdAt).getTime() - new Date(highlightedCsatWindow.resolvedAt!).getTime()) < 5 * 60 * 1000
            )
          : undefined);
      if (targetMsg && msgElementRefs.current[targetMsg.id]) {
        lastAutoScrollRef.current = {
          convId,
          lastMsgId: messages[messages.length - 1]?.id || null,
        };
        msgElementRefs.current[targetMsg.id]?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
        return;
      }
    }
    const lastMsgId = messages.length > 0 ? messages[messages.length - 1].id : null;
    const prev = lastAutoScrollRef.current;
    if (convId && (prev.convId !== convId || (lastMsgId && prev.lastMsgId !== lastMsgId))) {
      lastAutoScrollRef.current = { convId, lastMsgId };
      messagesEndRef.current?.scrollIntoView({ behavior: prev.convId === convId ? 'smooth' : 'auto' });
    }
  }, [messages, selectedConversation?.id, highlightedCsatWindow]);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Ukuran berkas maksimal 10 MB');
      return;
    }
    const mime = inferAttachmentMime(file);
    const kind: 'image' | 'video' | 'audio' | 'document' = mime.startsWith('image/')
      ? 'image'
      : mime.startsWith('video/')
      ? 'video'
      : mime.startsWith('audio/')
      ? 'audio'
      : 'document';
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      setPendingAttachment({
        base64: result,
        mimetype: mime,
        name: file.name,
        size: file.size,
        kind,
      });
      setComposerMode('REPLY');
    };
    reader.readAsDataURL(file);
  };

  const openComposerPicker = (
    target: 'EMOJI' | 'CANNED' | 'PRODUCT' | 'LINK' | 'INTERACTIVE' | null
  ) => {
    setShowEmojiPicker((v) => (target === 'EMOJI' ? !v : false));
    setShowCannedPicker((v) => (target === 'CANNED' ? !v : false));
    setShowProductPicker((v) => (target === 'PRODUCT' ? !v : false));
    setShowLinkComposer((v) => (target === 'LINK' ? !v : false));
    setShowInteractiveComposer((v) => (target === 'INTERACTIVE' ? !v : false));
  };

  const stopOutboundTyping = useCallback(
    (convId?: string) => {
      const targetId = convId || outboundTypingRef.current.convId;
      if (outboundTypingRef.current.stopTimer) {
        window.clearTimeout(outboundTypingRef.current.stopTimer);
        outboundTypingRef.current.stopTimer = null;
      }
      if (outboundTypingRef.current.active && targetId) {
        outboundTypingRef.current.active = false;
        void api
          .sendConversationTyping(targetId, false, selectedSession || undefined)
          .catch(() => {});
      }
    },
    [selectedSession]
  );

  const handleReplyTextChange = (nextVal: string) => {
    setInputText(nextVal);
    if (
      !selectedConversation ||
      composerMode !== 'REPLY' ||
      ((selectedConversation.channel || 'WHATSAPP').toUpperCase() !== 'WHATSAPP')
    ) {
      return;
    }
    const convId = selectedConversation.id;
    const trimmed = nextVal.trim();
    if (!trimmed) {
      stopOutboundTyping(convId);
      return;
    }
    const now = Date.now();
    const st = outboundTypingRef.current;
    st.convId = convId;
    if (!st.active || now - st.lastSentAt > 4000) {
      st.active = true;
      st.lastSentAt = now;
      void api.sendConversationTyping(convId, true, selectedSession || undefined).catch(() => {});
    }
    if (st.stopTimer) window.clearTimeout(st.stopTimer);
    st.stopTimer = window.setTimeout(() => {
      stopOutboundTyping(convId);
    }, 3000);
  };

  const handleMarkRead = async () => {
    if (!selectedConversation || markingRead) return;
    setMarkingRead(true);
    try {
      const res = await api.markConversationRead(selectedConversation.id);
      if ((selectedConversation.channel || 'WHATSAPP') === 'WHATSAPP') {
        if (res.seenSent) {
          toast.success('Pesan ditandai dibaca & tanda seen dikirim ke WhatsApp');
        } else if (res.error) {
          toast.error(`Unread CRM direset, namun WhatsApp seen gagal: ${res.error}`);
        } else {
          toast.success('Percakapan ditandai sudah dibaca');
        }
      } else {
        toast.success('Percakapan ditandai sudah dibaca');
      }
      void fetchConversations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menandai dibaca');
    } finally {
      setMarkingRead(false);
    }
  };

  const handleSendLinkMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLiveChatUnlocked || !selectedConversation || sending) return;
    const cleanUrl = linkUrl.trim();
    if (!/^https?:\/\/\S+$/i.test(cleanUrl)) {
      toast.error('URL wajib valid dan diawali http:// atau https://');
      return;
    }
    setSending(true);
    try {
      const newMsg = await api.sendConversationMessage(selectedConversation.id, {
        messageKind: 'LINK_PREVIEW',
        session: selectedSession || undefined,
        replyToMessageId: replyingToMessage?.id,
        linkPreview: {
          url: cleanUrl,
          title: linkTitle.trim() || undefined,
          description: linkDesc.trim() || undefined,
          caption: linkCaption.trim() || undefined,
          imageUrl: linkImageUrl.trim() || undefined,
          highQuality: true,
        },
      });
      setMessages((prev) => [...prev, newMsg]);
      setReplyingToMessage(null);
      setShowLinkComposer(false);
      setLinkUrl('');
      setLinkTitle('');
      setLinkDesc('');
      setLinkCaption('');
      setLinkImageUrl('');
      const meta = parseChatMessageMeta(newMsg);
      if (newMsg.status === 'FAILED' || newMsg.ackStatus < 0) {
        toast.error(newMsg.errorMessage || 'Gagal mengirim tautan');
      } else if (meta?.usedFallbackText) {
        toast.success('Tautan terkirim dengan preview URL standar WhatsApp');
      } else {
        toast.success('Tautan & preview terkirim');
      }
      void fetchConversations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengirim tautan');
    } finally {
      setSending(false);
    }
  };

  const handleSendInteractiveMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLiveChatUnlocked || !selectedConversation || sending) return;
    setSending(true);
    try {
      let newMsg: ChatMessage;
      if (interactiveTab === 'POLL') {
        const cleanQ = pollQuestion.trim();
        const cleanOpts = pollOptions.map((o) => o.trim()).filter(Boolean);
        if (!cleanQ || cleanOpts.length < 2) {
          toast.error('Isi pertanyaan dan minimal 2 pilihan polling');
          setSending(false);
          return;
        }
        newMsg = await api.sendConversationMessage(selectedConversation.id, {
          messageKind: 'POLL',
          session: selectedSession || undefined,
          replyToMessageId: replyingToMessage?.id,
          poll: {
            question: cleanQ,
            options: cleanOpts,
            multipleAnswers: pollMultiple,
          },
        });
      } else {
        const cleanBody = btnBody.trim();
        const validBtns = btnItems
          .filter((b) => b.text.trim())
          .map((b) => ({
            type: b.type,
            text: b.text.trim(),
            ...(b.type === 'url' ? { url: (b.url || '').trim() } : {}),
            ...(b.type === 'call' ? { phoneNumber: (b.phoneNumber || '').trim() } : {}),
            ...(b.type === 'copy' ? { copyCode: (b.copyCode || '').trim() } : {}),
          }));
        if (!cleanBody || validBtns.length === 0) {
          toast.error('Isi pesan dan minimal 1 tombol wajib diisi');
          setSending(false);
          return;
        }
        newMsg = await api.sendConversationMessage(selectedConversation.id, {
          messageKind: 'BUTTONS',
          session: selectedSession || undefined,
          replyToMessageId: replyingToMessage?.id,
          interactiveButtons: {
            header: btnHeader.trim() || undefined,
            body: cleanBody,
            footer: btnFooter.trim() || undefined,
            fallbackTextOnUnsupported: btnFallbackText,
            buttons: validBtns,
          },
        });
      }
      setMessages((prev) => [...prev, newMsg]);
      setReplyingToMessage(null);
      setShowInteractiveComposer(false);
      if (interactiveTab === 'POLL') {
        setPollQuestion('');
        setPollOptions(['Pilihan 1', 'Pilihan 2']);
      } else {
        setBtnHeader('');
        setBtnBody('');
        setBtnFooter('');
      }
      const meta = parseChatMessageMeta(newMsg);
      if (newMsg.status === 'FAILED' || newMsg.ackStatus < 0) {
        toast.error(newMsg.errorMessage || 'Gagal mengirim pesan interaktif');
      } else if (meta?.usedFallbackText) {
        toast.success('Terkirim sebagai pesan bernomor (tombol native dibatasi engine WAHA)');
      } else {
        toast.success(interactiveTab === 'POLL' ? 'Polling terkirim ke WhatsApp' : 'Tombol interaktif terkirim');
      }
      void fetchConversations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengirim pesan interaktif');
    } finally {
      setSending(false);
    }
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
    stopOutboundTyping(selectedConversation.id);
    setSending(true);
    try {
      const newMsg = await api.sendConversationMessage(selectedConversation.id, {
        body: text,
        session: selectedSession || undefined,
        mediaBase64: pendingAttachment?.base64,
        mediaMimetype: pendingAttachment?.mimetype,
        mediaName: pendingAttachment?.name,
        replyToMessageId: replyingToMessage?.id,
      });
      setInputText('');
      setPendingAttachment(null);
      setReplyingToMessage(null);
      setShowEmojiPicker(false);
      setMessages((prev) => [...prev, newMsg]);
      if (newMsg.status === 'FAILED' || newMsg.ackStatus < 0) {
        toast.error(newMsg.errorMessage || 'Gagal mengirim pesan WhatsApp');
      }
      void fetchConversations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengirim pesan WhatsApp');
    } finally {
      setSending(false);
    }
  };

  const handleRetryMessage = async (messageId: string) => {
    if (!selectedConversation || retryingMessageId) return;
    setRetryingMessageId(messageId);
    try {
      const res = await api.retryConversationMessage(
        selectedConversation.id,
        messageId,
        selectedSession || undefined
      );
      if (res?.data) {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? res.data : m)));
      }
      if (res?.success) {
        toast.success('Pesan berhasil dikirim ulang');
        void fetchConversations();
      } else {
        toast.error(res?.error || res?.data?.errorMessage || 'Gagal mengirim ulang pesan');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengirim ulang pesan');
    } finally {
      setRetryingMessageId(null);
    }
  };

  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [contactsList, setContactsList] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [openingContactId, setOpeningContactId] = useState<string | null>(null);

  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSearch, setMergeSearch] = useState('');
  const [mergingContactId, setMergingContactId] = useState<string | null>(null);

  // Agent assignment & Canned responses
  const [assignableAgents, setAssignableAgents] = useState<
    Array<{ id: string; name: string; email: string; role: string }>
  >([]);
  const [assigneeFilter, setAssigneeFilter] = useState<'ALL' | 'MINE' | 'UNASSIGNED'>('ALL');
  const [cannedList, setCannedList] = useState<CannedResponse[]>([]);
  const [masterLabels, setMasterLabels] = useState<CrmLabelItem[]>([]);
  const [showCannedPicker, setShowCannedPicker] = useState(false);
  const [showAddCanned, setShowAddCanned] = useState(false);
  const [newCannedShort, setNewCannedShort] = useState('');
  const [newCannedTitle, setNewCannedTitle] = useState('');
  const [newCannedContent, setNewCannedContent] = useState('');
  const [savingCanned, setSavingCanned] = useState(false);

  const applyCannedVariables = (raw: string): string => {
    const fullName = selectedConversation?.contact?.nama_lengkap || '';
    const nickName =
      selectedConversation?.contact?.nama_panggilan ||
      (fullName ? fullName.split(' ')[0] : '') ||
      'Kak';
    return raw
      .replace(/\{nama_panggilan\}/gi, nickName)
      .replace(/\{nama_lengkap\}/gi, fullName || nickName);
  };

  const fetchAgentsAndCanned = useCallback(async () => {
    if (!isLiveChatUnlocked) return;
    try {
      const [agentsData, cannedData, labelsData] = await Promise.all([
        api.getAssignableAgents().catch(() => []),
        api.getCannedResponses(true).catch(() => []),
        api.getMasterLabels('CONVERSATION_LABEL', true).catch(() => []),
      ]);
      setAssignableAgents(agentsData || []);
      setCannedList(cannedData || []);
      setMasterLabels(labelsData || []);
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

  const handleCreateQuickProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim()) return;
    setSavingProduct(true);
    try {
      const created = await api.createProduct({
        sku: newProdSku.trim() || undefined,
        name: newProdName.trim(),
        price: Number(newProdPrice) || 0,
        unit: newProdUnit.trim() || 'pcs',
      });
      setProductsList((prev) => [...prev, created]);
      setNewProdSku('');
      setNewProdName('');
      setNewProdPrice('');
      setNewProdUnit('pcs');
      setShowAddProduct(false);
      toast.success('Produk ditambahkan ke katalog');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menambahkan produk');
    } finally {
      setSavingProduct(false);
    }
  };

  const insertProductQuote = (prod: ProductItem) => {
    const formattedPrice = new Intl.NumberFormat('id-ID').format(prod.price || 0);
    const quote = [
      `*${prod.name}* (${prod.sku})`,
      `Harga: Rp ${formattedPrice} / ${prod.unit || 'pcs'}`,
      prod.description ? prod.description : '',
    ]
      .filter(Boolean)
      .join('\n');
    setInputText((prev) => (prev ? `${prev}\n${quote}` : quote));
    setShowProductPicker(false);
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

  const handleOpenMergeModal = async () => {
    setShowMergeModal(true);
    setMergeSearch('');
    if (contactsList.length === 0) {
      setLoadingContacts(true);
      try {
        const list = await api.getContacts();
        setContactsList(list || []);
      } catch {
        toast.error('Gagal memuat daftar kontak');
      } finally {
        setLoadingContacts(false);
      }
    }
  };

  const handleMergeIntoTarget = async (targetContactId: string) => {
    if (!selectedConversation?.contact?.id) return;
    setMergingContactId(targetContactId);
    try {
      await api.mergeContact(targetContactId, selectedConversation.contact.id);
      setShowMergeModal(false);
      toast.success('Kontak berhasil digabungkan ke kontak utama');
      await fetchConversations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menggabungkan kontak');
    } finally {
      setMergingContactId(null);
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

  const handleStatusChange = async (
    nextStatus: 'OPEN' | 'PENDING' | 'RESOLVED',
    sendCsat?: boolean
  ) => {
    if (!selectedConversation) return;
    setShowResolveMenu(false);
    try {
      const res = await api.updateConversation(selectedConversation.id, {
        status: nextStatus,
        sendCsat,
        baseUrl: getAppBaseUrl(),
      });
      if (res?.csatSent) {
        toast.success('Percakapan diakhiri & tautan CSAT dikirim');
      } else {
        toast.success(
          nextStatus === 'RESOLVED'
            ? sendCsat === false
              ? 'Percakapan diakhiri tanpa mengirim CSAT'
              : 'Percakapan diakhiri (Resolved)'
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

  const handleSaveChannelDisplayName = async (nextName: string | null) => {
    if (!selectedConversation || savingChannelName) return;
    setSavingChannelName(true);
    try {
      const cleaned = nextName ? nextName.trim() || null : null;
      await api.updateConversation(selectedConversation.id, {
        channelDisplayName: cleaned,
      });
      setChannelDisplayNameDraft(cleaned || '');
      setSelectedConversation((prev) =>
        prev && prev.id === selectedConversation.id ? { ...prev, channelDisplayName: cleaned } : prev
      );
      toast.success(cleaned ? 'Nama tampilan kanal disimpan' : 'Nama tampilan kanal direset ke default');
      void fetchConversations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal memperbarui nama tampilan kanal');
    } finally {
      setSavingChannelName(false);
    }
  };

  const handleUpdateMetricExclusion = async (nextExclude: boolean, reason?: string | null) => {
    if (!selectedConversation || savingExclude) return;
    setSavingExclude(true);
    try {
      const cleanedReason = nextExclude
        ? (reason?.trim() || (selectedConversation.isGroup ? 'Grup WhatsApp' : 'Bukan Customer'))
        : null;
      await api.updateConversation(selectedConversation.id, {
        excludeFromMetrics: nextExclude,
        excludeReason: cleanedReason,
      });
      setExcludeReasonDraft(cleanedReason || 'Bukan Customer');
      setSelectedConversation((prev) =>
        prev && prev.id === selectedConversation.id
          ? { ...prev, excludeFromMetrics: nextExclude, excludeReason: cleanedReason }
          : prev
      );
      toast.success(
        nextExclude
          ? `Ditandai Non-Penilaian (${cleanedReason})`
          : 'Dikembalikan ke daftar penilaian customer'
      );
      void fetchConversations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal memperbarui status penilaian');
    } finally {
      setSavingExclude(false);
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
    const convChannel = (c.channel || 'WHATSAPP').toUpperCase() as OmnichannelType;
    if (statusFilter !== 'ALL' && convStatus !== statusFilter) return false;
    if (metricFilter === 'ASSESSED' && (c.excludeFromMetrics || c.isGroup)) return false;
    if (metricFilter === 'EXCLUDED' && !c.excludeFromMetrics && !c.isGroup) return false;
    if (metricFilter === 'GROUPS' && !c.isGroup) return false;
    if (channelFilter !== 'ALL' && convChannel !== channelFilter) return false;
    if (accountFilter !== 'ALL' && c.channelAccountId !== accountFilter) return false;
    if (assigneeFilter === 'MINE' && (!currentUser?.id || c.assignedAgentId !== currentUser.id)) {
      return false;
    }
    if (assigneeFilter === 'UNASSIGNED' && c.assignedAgentId) {
      return false;
    }
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      c.channelDisplayName?.toLowerCase().includes(q) ||
      c.pushName?.toLowerCase().includes(q) ||
      c.channelAccountName?.toLowerCase().includes(q) ||
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
    <div className="relative bg-white rounded-lg border border-gray-200 overflow-hidden h-[calc(100vh-76px)] supports-[height:100dvh]:h-[calc(100dvh-76px)] sm:h-[calc(100vh-100px)] sm:supports-[height:100dvh]:h-[calc(100dvh-100px)] lg:h-[calc(100vh-108px)] lg:supports-[height:100dvh]:h-[calc(100dvh-108px)] flex flex-col md:flex-row">
      {/* Left List */}
      <div
        className={`w-full md:w-64 lg:w-72 xl:w-80 border-b md:border-b-0 md:border-r border-gray-200 flex-col shrink-0 bg-gray-50/50 ${
          selectedConversation ? 'hidden md:flex' : 'flex flex-1 md:flex-none min-h-0'
        }`}
      >
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
            {canManageConversation && (
              <button
                type="button"
                onClick={() => void handleOpenNewChatModal()}
                title="Buka Percakapan Baru"
                className="h-9 px-2.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium inline-flex items-center gap-1 shrink-0 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Baru</span>
              </button>
            )}
          </div>
          <div className="bg-gray-100 p-0.5 rounded-md grid grid-cols-4 gap-0.5 text-[11px]">
            {(['ALL', 'OPEN', 'PENDING', 'RESOLVED'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`py-1 rounded font-medium transition-colors ${
                  statusFilter === st
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {st === 'ALL' ? 'Semua' : st === 'OPEN' ? 'Open' : st === 'PENDING' ? 'Pending' : 'Selesai'}
              </button>
            ))}
          </div>

          <div className="bg-gray-100 p-0.5 rounded-md grid grid-cols-4 gap-0.5 text-[10px]">
            {(
              [
                { id: 'ALL', label: 'Semua' },
                { id: 'ASSESSED', label: 'Dinilai' },
                { id: 'EXCLUDED', label: 'Non-Nilai' },
                { id: 'GROUPS', label: 'Grup WA' },
              ] as const
            ).map((mf) => (
              <button
                key={mf.id}
                type="button"
                onClick={() => setMetricFilter(mf.id)}
                className={`py-1 rounded font-medium transition-colors truncate px-1 ${
                  metricFilter === mf.id
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {mf.label}
              </button>
            ))}
          </div>

          <div className={`grid gap-1.5 ${assignableAgents.length > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <select
              value={channelFilter}
              onChange={(e) => {
                setChannelFilter(e.target.value as any);
                setAccountFilter('ALL');
              }}
              aria-label="Filter Channel"
              className="w-full h-8 px-2 bg-white border border-gray-200 rounded-md text-[11px] text-gray-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">Semua Channel</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="WHATSAPP_CLOUD">WA Business Cloud</option>
              <option value="INSTAGRAM">Instagram</option>
              <option value="FACEBOOK">Facebook</option>
              <option value="THREADS">Threads</option>
              <option value="TELEGRAM">Telegram</option>
            </select>

            {assignableAgents.length > 0 && (
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value as any)}
                aria-label="Filter Agent"
                className="w-full h-8 px-2 bg-white border border-gray-200 rounded-md text-[11px] text-gray-700 focus:outline-none focus:border-indigo-500"
              >
                <option value="ALL">
                  {canViewAllConversations ? 'Semua Agent' : 'Akses Saya & Terbuka'}
                </option>
                <option value="MINE">Milik Saya</option>
                <option value="UNASSIGNED">Belum Ditugaskan</option>
              </select>
            )}
          </div>

          {channelAccounts.length > 0 && (
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              aria-label="Filter Akun Kanal"
              className="w-full h-8 px-2 bg-white border border-gray-200 rounded-md text-[11px] text-gray-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">Semua Akun Kanal ({channelAccounts.length})</option>
              {channelAccounts
                .filter((acc) => channelFilter === 'ALL' || acc.channel === channelFilter)
                .map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {CHANNEL_META[acc.channel]?.short || acc.channel} • {acc.name}
                  </option>
                ))}
            </select>
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
                  onClick={() => {
                    if (selectedConversation?.id !== conv.id) {
                      setHighlightedCsatWindow(null);
                      setReplyingToMessage(null);
                    }
                    setSelectedConversation(conv);
                  }}
                  className={`w-full p-3 text-left flex items-start gap-2.5 transition-colors ${
                    isSelected
                      ? 'bg-indigo-50/70 border-l-2 border-indigo-600'
                      : 'hover:bg-gray-100/70 bg-white'
                  }`}
                >
                  <div className="w-8 h-8 rounded-md bg-indigo-600 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                    {getConversationDisplayTitle(conv).slice(0, 2).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-gray-900 text-xs truncate">
                        {getConversationDisplayTitle(conv)}
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
                    {conv.contact?.nama_lengkap &&
                      getConversationDisplayTitle(conv).toLowerCase() !==
                        conv.contact.nama_lengkap.trim().toLowerCase() && (
                        <p className="text-[10px] text-indigo-600/80 truncate">
                          Kontak: {conv.contact.nama_lengkap}
                        </p>
                      )}

                    <p className="text-[11px] text-gray-500 truncate mt-0.5">
                      {presenceByConvId[conv.id]?.status === 'typing' ? (
                        <span className="text-emerald-600 font-medium italic">
                          Sedang mengetik...
                        </span>
                      ) : presenceByConvId[conv.id]?.status === 'recording' ? (
                        <span className="text-emerald-600 font-medium italic">
                          Merekam pesan suara...
                        </span>
                      ) : (
                        conv.lastMessage || 'Tidak ada pesan terbaru'
                      )}
                    </p>

                    <div className="flex items-center flex-wrap gap-1 mt-1.5">
                      {(() => {
                        const ch = ((conv.channel || 'WHATSAPP').toUpperCase()) as OmnichannelType;
                        const meta = CHANNEL_META[ch] || CHANNEL_META.WHATSAPP;
                        return (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border ${meta.cls}`}>
                            {meta.short}
                          </span>
                        );
                      })()}
                      {!conv.excludeFromMetrics &&
                        !conv.isGroup &&
                        conv.status === 'OPEN' &&
                        !conv.firstResponseAt &&
                        conv.firstInboundAt &&
                        Date.now() - new Date(conv.firstInboundAt).getTime() >
                          slaTargetMinutes * 60_000 && (
                          <span
                            title={`Belum dibalas melebihi target SLA ${slaTargetMinutes} menit`}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-50 text-red-700 border border-red-200"
                          >
                            <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                            SLA Terlewat
                          </span>
                        )}
                      {conv.isGroup && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                          <Users className="w-2.5 h-2.5" />
                          Grup WA
                        </span>
                      )}
                      {conv.excludeFromMetrics && (
                        <span
                          title={`Tidak masuk penilaian (${conv.excludeReason || 'Non-Customer'})`}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-gray-100 text-gray-600 border border-gray-300"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                          {conv.excludeReason || 'Non-Penilaian'}
                        </span>
                      )}
                      {conv.wahaSession && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {conv.wahaSession}
                        </span>
                      )}
                      {conv.channelAccountName && !conv.wahaSession && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-700 border border-slate-200 truncate max-w-[120px]">
                          {conv.channelAccountName}
                        </span>
                      )}
                      {conv.assignedAgentName && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
                          <UserCheck className="w-2.5 h-2.5" />
                          {conv.assignedAgentName}
                        </span>
                      )}
                      {(conv.csatOverallScore ?? conv.csatRating) && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-500" />
                          {Number(conv.csatOverallScore ?? conv.csatRating).toFixed(1).replace(/\.0$/, '')}
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
        <div className="flex flex-1 flex-col bg-gray-50 min-w-0 min-h-0">
          <div className="min-h-[3.5rem] bg-white border-b border-gray-200 px-3 sm:px-4 py-2 flex flex-col md:flex-row md:flex-wrap md:items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setSelectedConversation(null)}
                title="Kembali ke Daftar Obrolan"
                className="md:hidden p-1.5 -ml-1 rounded-md text-gray-600 hover:bg-gray-100 shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="w-8 h-8 rounded-md bg-indigo-600 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                {getConversationDisplayTitle(selectedConversation).slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h4 className="font-semibold text-gray-900 text-xs truncate">
                    {getConversationDisplayTitle(selectedConversation)}
                  </h4>
                  {selectedConversation.contact?.nama_lengkap &&
                    getConversationDisplayTitle(selectedConversation).toLowerCase() !==
                      selectedConversation.contact.nama_lengkap.trim().toLowerCase() && (
                      <span className="text-[10px] text-gray-500 truncate">
                        (Kontak: {selectedConversation.contact.nama_lengkap})
                      </span>
                    )}
                  {(() => {
                    const ch = ((selectedConversation.channel || 'WHATSAPP').toUpperCase()) as OmnichannelType;
                    const meta = CHANNEL_META[ch] || CHANNEL_META.WHATSAPP;
                    return (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border shrink-0 ${meta.cls}`}>
                        {meta.label}
                      </span>
                    );
                  })()}
                  {selectedConversation.wahaSession && (selectedConversation.channel || 'WHATSAPP') === 'WHATSAPP' && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                      <Smartphone className="w-2.5 h-2.5" />
                      {selectedConversation.wahaSession}
                    </span>
                  )}
                  {selectedConversation.channelAccountName && !selectedConversation.wahaSession && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                      {selectedConversation.channelAccountName}
                    </span>
                  )}
                  {selectedConversation.isGroup && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowParticipantsModal(true);
                        void fetchParticipants(selectedConversation.id, true);
                      }}
                      title="Lihat daftar partisipan & anggota yang mengirim pesan di grup ini"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100 shrink-0 transition-colors"
                    >
                      <Users className="w-3 h-3" />
                      <span>
                        Partisipan
                        {participantsData && participantsData.participants.length > 0
                          ? ` (${participantsData.participants.length})`
                          : ''}
                      </span>
                    </button>
                  )}
                  {selectedConversation.excludeFromMetrics && (
                    <button
                      type="button"
                      onClick={() => toggleContactPanel(true)}
                      title="Percakapan ini dikecualikan dari penilaian SLA/CSAT. Klik untuk ubah di Detail Kontak."
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200 shrink-0"
                    >
                      <EyeOff className="w-2.5 h-2.5" />
                      <span>Non-Penilaian: {selectedConversation.excludeReason || 'Bukan Customer'}</span>
                    </button>
                  )}
                  {presenceByConvId[selectedConversation.id]?.status && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {presenceByConvId[selectedConversation.id].status === 'typing'
                        ? 'Mengetik...'
                        : presenceByConvId[selectedConversation.id].status === 'recording'
                        ? 'Merekam audio...'
                        : 'Online'}
                    </span>
                  )}
                  {(selectedConversation.channel === 'INSTAGRAM' || selectedConversation.channel === 'FACEBOOK') && (() => {
                    const latestInbound =
                      selectedConversation.lastInboundAt ||
                      [...messages].reverse().find((m) => m.direction === 'INBOUND')?.createdAt ||
                      selectedConversation.firstInboundAt;
                    if (!latestInbound) return null;
                    const remainingMs = new Date(latestInbound).getTime() + 24 * 3600_000 - Date.now();
                    if (remainingMs <= 0) {
                      return (
                        <span
                          title="Jendela balas 24 jam Meta telah berakhir. Menunggu pesan masuk baru dari pelanggan."
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 shrink-0 whitespace-nowrap"
                        >
                          <Clock className="w-2.5 h-2.5" />
                          Jendela 24j Berakhir
                        </span>
                      );
                    }
                    const hrs = Math.floor(remainingMs / 3600_000);
                    const mins = Math.floor((remainingMs % 3600_000) / 60_000);
                    const isLow = hrs < 4;
                    return (
                      <span
                        title="Sisa waktu jendela balas 24 jam sesuai kebijakan Meta Messaging"
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border shrink-0 whitespace-nowrap ${
                          isLow
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-sky-50 text-sky-700 border-sky-200'
                        }`}
                      >
                        <Clock className="w-2.5 h-2.5" />
                        Jendela Meta: {hrs}j {mins}m
                      </span>
                    );
                  })()}
                  {selectedConversation.contextTitle && (
                    <span className="text-[10px] text-gray-500 truncate">
                      • {selectedConversation.contextTitle}
                    </span>
                  )}
                </div>
                {selectedConversation.contact?.nomor_whatsapp ? (
                  <a
                    href={`https://wa.me/${selectedConversation.contact.nomor_whatsapp}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-indigo-600 font-mono hover:underline inline-flex items-center gap-1"
                  >
                    <Phone className="w-2.5 h-2.5" />
                    <span>+{selectedConversation.contact.nomor_whatsapp}</span>
                  </a>
                ) : (
                  <span className="text-[11px] text-gray-500">
                    {selectedConversation.contact?.nama_panggilan ||
                      ((selectedConversation.channel || 'WHATSAPP') === 'WHATSAPP'
                        ? 'WhatsApp ID Tertaut'
                        : 'Kontak Omnichannel')}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-1.5 min-w-0 w-full md:w-auto justify-between md:justify-end">
              {sessions.length > 0 && (selectedConversation.channel || 'WHATSAPP') === 'WHATSAPP' && (
                <select
                  value={selectedSession}
                  onChange={(e) => setSelectedSession(e.target.value)}
                  title="Pilih sesi WAHA pengirim"
                  className="h-7 px-2 bg-white border border-gray-200 rounded-md text-[11px] font-mono text-gray-700 focus:outline-none focus:border-indigo-500 flex-1 sm:flex-none min-w-[100px] sm:max-w-[200px]"
                >
                  {sessions.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name} • {s.status === 'WORKING' ? 'Aktif' : s.status}
                    </option>
                  ))}
                </select>
              )}

              {assignableAgents.length > 0 && (
                <select
                  value={selectedConversation.assignedAgentId || ''}
                  disabled={!canManageConversation}
                  onChange={(e) => void handleAssignAgent(e.target.value || null)}
                  title={
                    canManageConversation
                      ? 'Tugaskan ke Agent'
                      : 'Role Anda tidak memiliki izin menugaskan CS'
                  }
                  className="h-7 px-2 bg-white border border-gray-200 rounded-md text-[11px] text-gray-700 focus:outline-none focus:border-indigo-500 flex-1 sm:flex-none min-w-[100px] sm:max-w-[140px] disabled:opacity-60 disabled:cursor-not-allowed"
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
                disabled={!canManageConversation}
                onChange={(e) =>
                  handleStatusChange(e.target.value as 'OPEN' | 'PENDING' | 'RESOLVED')
                }
                title={
                  canManageConversation
                    ? 'Status Percakapan'
                    : 'Role Anda tidak memiliki izin mengubah status percakapan'
                }
                className={`h-7 px-2 rounded-md text-[11px] font-semibold border focus:outline-none shrink-0 disabled:opacity-70 disabled:cursor-not-allowed ${
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

              <div className="flex items-center gap-1.5 shrink-0">
                {canManageConversation &&
                  (selectedConversation.status === 'RESOLVED' ? (
                    <button
                      type="button"
                      onClick={() => void handleStatusChange('OPEN')}
                      title="Buka kembali percakapan ini"
                      className="h-7 px-2 sm:px-2.5 rounded-md border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-medium inline-flex items-center gap-1 whitespace-nowrap transition-colors"
                    >
                      <RotateCcw className="w-3 h-3 shrink-0" />
                      <span>Buka Kembali</span>
                    </button>
                  ) : (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowResolveMenu((prev) => !prev)}
                        title="Akhiri percakapan (pilih dengan atau tanpa CSAT)"
                        className="h-7 px-2 sm:px-2.5 rounded-md border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-medium inline-flex items-center gap-1 whitespace-nowrap transition-colors"
                      >
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                        <span>Akhiri</span>
                        <ChevronDown className="w-3 h-3 opacity-70 shrink-0" />
                      </button>
                      {showResolveMenu && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setShowResolveMenu(false)}
                          />
                          <div className="absolute right-0 mt-1 w-48 rounded-md bg-white border border-gray-200 shadow-lg py-1 z-20">
                            {canSendCsat && (
                              <button
                                type="button"
                                onClick={() => void handleStatusChange('RESOLVED', true)}
                                className="w-full text-left px-3 py-1.5 text-[11px] text-gray-800 hover:bg-emerald-50 hover:text-emerald-800 flex items-center gap-1.5 whitespace-nowrap"
                              >
                                <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                <span>Akhiri &amp; Kirim CSAT</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleStatusChange('RESOLVED', false)}
                              className="w-full text-left px-3 py-1.5 text-[11px] text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>Akhiri Tanpa CSAT</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}

                <button
                  type="button"
                  onClick={handleMarkRead}
                  disabled={markingRead}
                  title="Tandai Dibaca & Kirim Centang Biru (Seen) ke WhatsApp"
                  className="h-7 px-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 hover:text-indigo-700 text-[11px] font-medium inline-flex items-center gap-1 shrink-0 transition-colors disabled:opacity-50"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span className="hidden lg:inline">Dibaca</span>
                </button>

                {canSendCsat && (
                  <button
                    type="button"
                    onClick={handleSendCsatCta}
                    disabled={sendingCsat}
                    title="Kirim Tautan Rating CSAT ke Pelanggan"
                    className="h-7 px-2.5 rounded-md border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-medium inline-flex items-center gap-1 whitespace-nowrap transition-colors disabled:opacity-50"
                  >
                    <Star className="w-3 h-3 fill-amber-400 text-amber-500 shrink-0" />
                    <span className="hidden sm:inline">Kirim CSAT</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => toggleContactPanel()}
                  title={showContactPanel ? 'Tutup Detail Kontak' : 'Buka Detail Kontak'}
                  className="h-7 w-7 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 inline-flex items-center justify-center shrink-0"
                >
                  {showContactPanel ? (
                    <PanelRightClose className="w-3.5 h-3.5" />
                  ) : (
                    <PanelRightOpen className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {highlightedCsatWindow && (
            <div className="px-4 py-1.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-2 text-[11px] text-amber-900">
              <div className="flex items-center gap-1.5 min-w-0">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500 shrink-0" />
                <span className="truncate font-medium">
                  Menyorot sesi percakapan CSAT
                  {highlightedCsatWindow.startedAt && (
                    <>
                      {' '}
                      (
                      {new Date(highlightedCsatWindow.startedAt).toLocaleString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {' → '}
                      {highlightedCsatWindow.resolvedAt
                        ? new Date(highlightedCsatWindow.resolvedAt).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Selesai'}
                      )
                    </>
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setHighlightedCsatWindow(null)}
                className="text-amber-800 hover:text-amber-950 font-semibold shrink-0"
              >
                Tutup sorotan
              </button>
            </div>
          )}

          <div className="flex-1 p-4 overflow-y-auto space-y-2.5">
            {loadingMessages && messages.length === 0 ? (
              <LoadingState message="Memuat pesan..." />
            ) : messages.length === 0 ? (
              <EmptyState title="Belum ada pesan" description="Kirim pesan pertama ke pelanggan ini." />
            ) : (() => {
              const orderedCsatSessions = [...(selectedConversation.csatHistory || [])].sort(
                (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
              );

              // Determine exact message index where each CSAT session closes (either its CSAT CTA bubble or last message before resolution)
              const sessionEndIndexById = new Map<string, number>();
              orderedCsatSessions.forEach((sess) => {
                const tokenIdx = sess.token
                  ? messages.findIndex((m) => m.body && m.body.includes(sess.token))
                  : -1;
                if (tokenIdx >= 0) {
                  sessionEndIndexById.set(sess.id, tokenIdx);
                  return;
                }
                const endMs = new Date(sess.conversationResolvedAt || sess.sentAt).getTime();
                let lastIdx = -1;
                messages.forEach((m, mIdx) => {
                  if (new Date(m.createdAt).getTime() <= endMs + 5000) {
                    lastIdx = mIdx;
                  }
                });
                if (lastIdx >= 0) {
                  sessionEndIndexById.set(sess.id, lastIdx);
                }
              });

              const closingSessionsAtMsgIdx = new Map<
                number,
                Array<{ session: typeof orderedCsatSessions[number]; number: number }>
              >();
              orderedCsatSessions.forEach((sess, sIdx) => {
                const endIdx = sessionEndIndexById.get(sess.id);
                if (endIdx !== undefined) {
                  const arr = closingSessionsAtMsgIdx.get(endIdx) || [];
                  arr.push({ session: sess, number: sIdx + 1 });
                  closingSessionsAtMsgIdx.set(endIdx, arr);
                }
              });

              // Track session start divider indices: Sesi #1 at idx 0 (when multi/CSAT exists), and each message right after a closing CSAT bubble
              const startBannerAtMsgIdx = new Map<
                number,
                { number: number; timestamp: string; label?: string }
              >();
              if (orderedCsatSessions.length > 0 && messages.length > 0) {
                startBannerAtMsgIdx.set(0, {
                  number: 1,
                  timestamp:
                    orderedCsatSessions[0].conversationStartedAt || messages[0].createdAt,
                });
                orderedCsatSessions.forEach((sess, sIdx) => {
                  const endIdx = sessionEndIndexById.get(sess.id);
                  if (endIdx !== undefined && endIdx + 1 < messages.length) {
                    const nextSess = orderedCsatSessions[sIdx + 1];
                    startBannerAtMsgIdx.set(endIdx + 1, {
                      number: sIdx + 2,
                      timestamp:
                        nextSess?.conversationStartedAt || messages[endIdx + 1].createdAt,
                      label: nextSess ? undefined : 'Sesi Berjalan',
                    });
                  }
                });
              }

              const formatDividerTime = (iso: string) =>
                new Date(iso).toLocaleString('id-ID', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                });

              return messages.map((msg, msgIndex) => {
                const isNote = msg.messageType === 'NOTE';
                const isCsat = msg.messageType === 'CSAT';
                const isOutbound = msg.direction === 'OUTBOUND';
                const isFailed = isOutbound && (msg.status === 'FAILED' || msg.ackStatus < 0);
                const isRead = msg.ackStatus >= 3;
                const isDelivered = msg.ackStatus === 2;
                const msgTs = new Date(msg.createdAt).getTime();
                const matchesHighlightedToken = Boolean(
                  highlightedCsatWindow?.token && msg.body?.includes(highlightedCsatWindow.token)
                );
                const matchesHighlightedWindow = Boolean(
                  highlightedCsatWindow?.startedAt &&
                    msgTs >= new Date(highlightedCsatWindow.startedAt).getTime() &&
                    (!highlightedCsatWindow.resolvedAt ||
                      msgTs <= new Date(highlightedCsatWindow.resolvedAt).getTime() + 60 * 1000)
                );
                const isCsatHighlighted = matchesHighlightedToken || matchesHighlightedWindow;
                const startBanner = startBannerAtMsgIdx.get(msgIndex);
                const closingSessions = closingSessionsAtMsgIdx.get(msgIndex) || [];

                const startDividerNode = startBanner ? (
                  <div className="flex items-center gap-2 py-1.5">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white border border-gray-200 text-[10px] font-medium text-gray-600 shadow-2xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                      <span>
                        Sesi #{startBanner.number} • Dibuka {formatDividerTime(startBanner.timestamp)}
                        {startBanner.label ? ` (${startBanner.label})` : ''}
                      </span>
                    </span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                ) : null;

                const endDividerNodes = closingSessions.map(({ session, number }) => {
                  const scoreVal = session.overallScore ?? session.rating;
                  const endTime = session.conversationResolvedAt || session.sentAt;
                  return (
                    <div key={`end-${session.id}`} className="flex items-center gap-2 py-1.5">
                      <div className="flex-1 h-px bg-emerald-200" />
                      <button
                        type="button"
                        onClick={() =>
                          setHighlightedCsatWindow({
                            token: session.token,
                            startedAt: session.conversationStartedAt || null,
                            resolvedAt: endTime,
                          })
                        }
                        title="Klik untuk menyorot pesan pada sesi CSAT ini"
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-[10px] font-medium text-emerald-800 transition-colors"
                      >
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span>
                          Batas Selesai Sesi #{number} • {formatDividerTime(endTime)}
                        </span>
                        {scoreVal ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-mono font-semibold">
                            <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-500" />
                            {Number(scoreVal).toFixed(1).replace(/\.0$/, '')}/5
                          </span>
                        ) : (
                          <span className="text-[9px] text-gray-500">(Menunggu CSAT)</span>
                        )}
                      </button>
                      <div className="flex-1 h-px bg-emerald-200" />
                    </div>
                  );
                });

                if (isNote) {
                  return (
                    <React.Fragment key={msg.id}>
                      {startDividerNode}
                      <div
                        ref={(el) => {
                          msgElementRefs.current[msg.id] = el;
                        }}
                        className="flex justify-center"
                      >
                        <div
                          className={`max-w-[92%] sm:max-w-[85%] rounded-lg px-3.5 py-2 text-xs border bg-amber-50 border-amber-200 text-amber-950 space-y-1 min-w-0 ${
                            isCsatHighlighted ? 'ring-2 ring-amber-400' : ''
                          }`}
                        >
                          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-800">
                            <StickyNote className="w-3 h-3" />
                            <span>Catatan Internal (Tidak terkirim ke WhatsApp)</span>
                          </div>
                          <div className="whitespace-pre-wrap break-words leading-relaxed">{msg.body}</div>
                          <div className="text-[10px] text-amber-700/80 font-mono text-right">
                            {new Date(msg.createdAt).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </div>
                      {endDividerNodes}
                    </React.Fragment>
                  );
                }

                return (
                  <React.Fragment key={msg.id}>
                    {startDividerNode}
                    <div
                      ref={(el) => {
                        msgElementRefs.current[msg.id] = el;
                      }}
                      className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`group max-w-[88%] sm:max-w-[75%] min-w-0 rounded-lg px-3.5 py-2 text-xs border leading-relaxed space-y-1.5 ${
                          isCsatHighlighted ? 'ring-2 ring-amber-400' : ''
                        } ${
                          isFailed
                            ? 'bg-red-50/70 border-red-200 text-gray-900'
                            : isCsat
                            ? 'bg-amber-50/60 border-amber-200 text-gray-900'
                            : isOutbound
                            ? 'bg-indigo-50 border-indigo-200 text-gray-900'
                            : 'bg-white border-gray-200 text-gray-900'
                        }`}
                      >
                        {!isOutbound &&
                          !isCsat &&
                          (selectedConversation.isGroup || msg.senderName || msg.senderPhone) && (
                            <div className="flex items-center justify-between gap-2 pb-0.5 border-b border-gray-100">
                              <span
                                className={`text-[11px] font-semibold truncate ${getParticipantColorClass(
                                  msg.senderJid || msg.senderPhone || msg.senderName
                                )}`}
                              >
                                {msg.senderName ||
                                  (msg.senderPhone ? `+${msg.senderPhone}` : msg.senderJid) ||
                                  'Anggota Grup'}
                              </span>
                              {msg.senderPhone && msg.senderName && msg.senderName !== `+${msg.senderPhone}` && (
                                <span className="text-[10px] font-mono text-gray-400 shrink-0">
                                  +{msg.senderPhone}
                                </span>
                              )}
                            </div>
                          )}

                        {(msg.replyToBody || msg.replyToMessageId) && (
                          <button
                            type="button"
                            onClick={() => {
                              if (msg.replyToMessageId && msgElementRefs.current[msg.replyToMessageId]) {
                                msgElementRefs.current[msg.replyToMessageId]?.scrollIntoView({
                                  behavior: 'smooth',
                                  block: 'center',
                                });
                              }
                            }}
                            className="w-full text-left px-2.5 py-1.5 rounded bg-black/5 hover:bg-black/10 border-l-2 border-indigo-500 text-[11px] space-y-0.5 transition-colors"
                          >
                            <div className="font-semibold text-indigo-700 truncate">
                              {msg.replyToSender || 'Pesan sebelumnya'}
                            </div>
                            <div className="text-gray-600 truncate">
                              {msg.replyToBody || 'Pesan dikutip'}
                            </div>
                          </button>
                        )}

                        {isCsat && (
                          <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                            <span>Permintaan Rating CSAT</span>
                          </div>
                        )}

                        {msg.mediaUrl && msg.mediaType === 'image' && (
                          <div className="space-y-1">
                            <button
                              type="button"
                              onClick={() =>
                                setLightboxMedia({
                                  url: resolveMediaUrl(msg.mediaUrl),
                                  name: msg.mediaName,
                                })
                              }
                              title="Klik untuk memperbesar gambar"
                              className="block max-w-full rounded border border-gray-200 bg-white overflow-hidden hover:opacity-95 transition-opacity"
                            >
                              <img
                                src={resolveMediaUrl(msg.mediaUrl)}
                                alt={msg.mediaName || 'Lampiran gambar'}
                                loading="lazy"
                                className="max-w-full max-h-60 object-contain"
                              />
                            </button>
                            <div className="flex items-center justify-end gap-2 text-[10px] text-gray-500">
                              <a
                                href={resolveMediaUrl(msg.mediaUrl)}
                                download={msg.mediaName || 'gambar'}
                                className="inline-flex items-center gap-0.5 hover:text-indigo-700"
                              >
                                <Download className="w-2.5 h-2.5" />
                                <span>Unduh</span>
                              </a>
                            </div>
                          </div>
                        )}

                        {msg.mediaUrl && msg.mediaType === 'video' && (
                          <div className="space-y-1">
                            <video
                              src={resolveMediaUrl(msg.mediaUrl)}
                              controls
                              playsInline
                              preload="metadata"
                              className="max-w-full max-h-60 rounded border border-gray-200 bg-black"
                            />
                            <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500">
                              <span className="font-mono truncate">{msg.mediaName || 'Video'}</span>
                              <a
                                href={resolveMediaUrl(msg.mediaUrl)}
                                download={msg.mediaName || 'video.mp4'}
                                className="inline-flex items-center gap-0.5 hover:text-indigo-700 shrink-0"
                              >
                                <Download className="w-2.5 h-2.5" />
                                <span>Unduh</span>
                              </a>
                            </div>
                          </div>
                        )}

                        {msg.mediaUrl && msg.mediaType === 'audio' && (
                          <div className="space-y-1">
                            <audio
                              src={resolveMediaUrl(msg.mediaUrl)}
                              controls
                              preload="metadata"
                              className="w-full max-w-xs"
                            />
                            <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500">
                              <span className="truncate">{msg.mediaName || 'Pesan Suara / Audio'}</span>
                              <a
                                href={resolveMediaUrl(msg.mediaUrl)}
                                download={msg.mediaName || 'audio.ogg'}
                                className="inline-flex items-center gap-0.5 hover:text-indigo-700 shrink-0"
                              >
                                <Download className="w-2.5 h-2.5" />
                                <span>Unduh</span>
                              </a>
                            </div>
                          </div>
                        )}

                        {!msg.mediaUrl && msg.messageType === 'MEDIA' && (
                          <div className="px-2.5 py-1.5 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                            File media ({msg.mediaType || 'lampiran'}) tidak tersedia di server WAHA.
                          </div>
                        )}

                        {msg.mediaType && !['image', 'video', 'audio'].includes(msg.mediaType) && (
                          <div className="flex items-center gap-2 p-2 rounded bg-white/80 border border-gray-200 text-[11px]">
                            <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                            <span className="font-mono truncate flex-1">{msg.mediaName || 'Dokumen'}</span>
                            {msg.mediaUrl && (
                              <div className="flex items-center gap-2 shrink-0">
                                <a
                                  href={resolveMediaUrl(msg.mediaUrl)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-indigo-600 hover:underline font-medium"
                                >
                                  Buka
                                </a>
                                <a
                                  href={resolveMediaUrl(msg.mediaUrl)}
                                  download={msg.mediaName || true}
                                  title="Unduh Dokumen"
                                  className="text-gray-600 hover:text-gray-900 inline-flex items-center gap-0.5"
                                >
                                  <Download className="w-3 h-3" />
                                </a>
                              </div>
                            )}
                          </div>
                        )}

                        {(() => {
                          const meta = parseChatMessageMeta(msg);
                          if (meta?.linkPreview?.url) {
                            return (
                              <div className="space-y-1.5">
                                {meta.linkPreview.caption && (
                                  <div className="whitespace-pre-wrap break-words">
                                    {renderTextWithClickableLinks(meta.linkPreview.caption)}
                                  </div>
                                )}
                                <a
                                  href={meta.linkPreview.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block rounded-md border border-indigo-200/80 bg-white/90 hover:bg-white p-2.5 transition-colors space-y-1"
                                >
                                  {meta.linkPreview.imageUrl && (
                                    <img
                                      src={meta.linkPreview.imageUrl}
                                      alt={meta.linkPreview.title || 'Preview tautan'}
                                      className="w-full max-h-36 object-cover rounded border border-gray-100 mb-1.5"
                                    />
                                  )}
                                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700">
                                    <Link2 className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate">
                                      {meta.linkPreview.title || meta.linkPreview.url}
                                    </span>
                                    <ExternalLink className="w-3 h-3 shrink-0 ml-auto opacity-70" />
                                  </div>
                                  {meta.linkPreview.description && (
                                    <p className="text-[11px] text-gray-600 line-clamp-2">
                                      {meta.linkPreview.description}
                                    </p>
                                  )}
                                  <div className="text-[10px] font-mono text-gray-500 truncate">
                                    {meta.linkPreview.url}
                                  </div>
                                </a>
                                {meta.usedFallbackText && (
                                  <div className="text-[10px] text-gray-500 italic">
                                    Terkirim dengan preview URL standar WhatsApp
                                  </div>
                                )}
                              </div>
                            );
                          }
                          if (meta?.interactiveButtons) {
                            return (
                              <div className="space-y-1.5">
                                {meta.interactiveButtons.header && (
                                  <div className="font-semibold text-gray-900">
                                    {meta.interactiveButtons.header}
                                  </div>
                                )}
                                <div className="whitespace-pre-wrap break-words">
                                  {renderTextWithClickableLinks(meta.interactiveButtons.body)}
                                </div>
                                {meta.interactiveButtons.footer && (
                                  <div className="text-[10px] text-gray-500">
                                    {meta.interactiveButtons.footer}
                                  </div>
                                )}
                                <div className="pt-1 border-t border-indigo-200/70 space-y-1">
                                  {meta.interactiveButtons.buttons.map((b, bIdx) => (
                                    <div
                                      key={bIdx}
                                      className="px-2 py-1 rounded bg-white/90 border border-indigo-200 text-[11px] font-medium text-indigo-700 flex items-center justify-between gap-2"
                                    >
                                      <span className="inline-flex items-center gap-1.5 truncate">
                                        {b.type === 'url' ? (
                                          <ExternalLink className="w-3 h-3 shrink-0" />
                                        ) : b.type === 'call' ? (
                                          <Phone className="w-3 h-3 shrink-0" />
                                        ) : b.type === 'copy' ? (
                                          <Copy className="w-3 h-3 shrink-0" />
                                        ) : (
                                          <Reply className="w-3 h-3 shrink-0" />
                                        )}
                                        <span className="truncate">{b.text}</span>
                                      </span>
                                      <span className="text-[9px] font-mono text-gray-500 truncate max-w-[140px]">
                                        {b.url || b.phoneNumber || b.copyCode || 'Balas'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                {meta.usedFallbackText && (
                                  <div className="text-[10px] text-amber-700 italic">
                                    Terkirim via fallback teks terformat (tombol native dibatasi engine WAHA)
                                  </div>
                                )}
                              </div>
                            );
                          }
                          if (meta?.poll) {
                            return (
                              <div className="space-y-1.5">
                                <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700">
                                  <BarChart2 className="w-3 h-3" />
                                  <span>
                                    Polling WhatsApp ({meta.poll.multipleAnswers ? 'Multi Pilihan' : '1 Pilihan'})
                                  </span>
                                </div>
                                <div className="font-semibold text-gray-900">
                                  {meta.poll.question}
                                </div>
                                <div className="space-y-1">
                                  {meta.poll.options.map((opt, oIdx) => (
                                    <div
                                      key={oIdx}
                                      className="px-2 py-1 rounded bg-white/90 border border-gray-200 text-[11px] text-gray-700 flex items-center gap-1.5"
                                    >
                                      <span className="w-4 h-4 rounded-full border border-indigo-300 text-[9px] font-mono flex items-center justify-center text-indigo-700 shrink-0">
                                        {oIdx + 1}
                                      </span>
                                      <span className="truncate">{opt}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div className="whitespace-pre-wrap break-words">
                              {renderTextWithClickableLinks(msg.body)}
                            </div>
                          );
                        })()}

                        {isFailed && (
                          <div className="pt-1 border-t border-red-200/70 flex flex-wrap items-center justify-between gap-2 text-[10px] text-red-700">
                            <span className="inline-flex items-center gap-1 font-medium">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span className="break-words">
                                {msg.errorMessage ? `Gagal: ${msg.errorMessage}` : 'Gagal mengirim pesan'}
                              </span>
                            </span>
                            {canReplyConversation && (
                              <button
                                type="button"
                                disabled={retryingMessageId === msg.id}
                                onClick={() => void handleRetryMessage(msg.id)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50 shrink-0"
                              >
                                <RotateCcw className="w-2.5 h-2.5" />
                                <span>{retryingMessageId === msg.id ? 'Mengirim...' : 'Kirim Ulang'}</span>
                              </button>
                            )}
                          </div>
                        )}

                        <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-gray-500 font-mono tabular-nums">
                          {canReplyConversation && (
                            <button
                              type="button"
                              onClick={() => {
                                setReplyingToMessage(msg);
                                setComposerMode('REPLY');
                                replyInputRef.current?.focus();
                              }}
                              title="Balas pesan ini"
                              className="mr-auto opacity-80 sm:opacity-0 group-hover:opacity-100 focus:opacity-100 inline-flex items-center gap-0.5 text-[10px] font-sans text-indigo-600 hover:text-indigo-800 transition-opacity"
                            >
                              <Reply className="w-3 h-3" />
                              <span>Balas</span>
                            </button>
                          )}
                          {msg.wahaSession && (
                            <span className="text-[9px] text-gray-400">{msg.wahaSession}</span>
                          )}
                          <span>
                            {new Date(msg.createdAt).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>

                          {isOutbound && !isFailed && (
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
                    {endDividerNodes}
                  </React.Fragment>
                );
              });
            })()}
            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          {!canReplyConversation && !canManageConversation ? (
            <div className="bg-amber-50 border-t border-amber-200 px-3.5 py-2.5 text-xs text-amber-900 flex items-center gap-2 shrink-0">
              <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>
                <strong>Mode Lihat Saja:</strong> Role <strong>{currentUser?.roleName || 'Agent'}</strong> dapat membaca riwayat obrolan tanpa izin mengirim balasan atau catatan.
              </span>
            </div>
          ) : (
          <div className="bg-white border-t border-gray-200 p-2.5 sm:p-3 space-y-2 shrink-0">
            <div className="flex items-center justify-between gap-2 overflow-x-auto">
              <div className="inline-flex rounded-md border border-gray-200 p-0.5 bg-gray-50 text-[11px] shrink-0">
                {canReplyConversation && (
                  <button
                    type="button"
                    onClick={() => setComposerMode('REPLY')}
                    className={`h-7 px-2.5 rounded font-medium inline-flex items-center gap-1 whitespace-nowrap transition-colors ${
                      composerMode === 'REPLY'
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <MessageSquare className="w-3 h-3 shrink-0" />
                    <span>Balas WhatsApp</span>
                  </button>
                )}
                {canManageConversation && (
                  <button
                    type="button"
                    onClick={() => {
                      setComposerMode('NOTE');
                      setPendingAttachment(null);
                      openComposerPicker(null);
                      stopOutboundTyping(selectedConversation.id);
                    }}
                    className={`h-7 px-2.5 rounded font-medium inline-flex items-center gap-1 whitespace-nowrap transition-colors ${
                      composerMode === 'NOTE'
                        ? 'bg-amber-100 text-amber-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <StickyNote className="w-3 h-3 shrink-0" />
                    <span>Catatan Internal</span>
                  </button>
                )}
              </div>
            </div>

            {composerMode === 'REPLY' &&
              (selectedConversation.channel || 'WHATSAPP') === 'WHATSAPP' &&
              sessions.length > 0 &&
              (() => {
                const activeItem = sessions.find((s) => s.name === selectedSession);
                if (!activeItem || activeItem.status === 'WORKING') return null;
                return (
                  <div className="px-2.5 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                    <span>
                      Sesi <strong className="font-mono">{activeItem.name}</strong> berstatus{' '}
                      <strong className="font-mono">{activeItem.status}</strong>. Pilih sesi yang aktif di header atau hidupkan sesi di Pengaturan WAHA sebelum mengirim balasan.
                    </span>
                  </div>
                );
              })()}

            {replyingToMessage && composerMode === 'REPLY' && (
              <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-gray-50 border border-gray-200 border-l-2 border-l-indigo-500 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-indigo-700 truncate flex items-center gap-1">
                    <Reply className="w-3 h-3 shrink-0" />
                    <span>
                      Membalas{' '}
                      {replyingToMessage.direction === 'OUTBOUND'
                        ? 'Tim CS'
                        : getConversationDisplayTitle(selectedConversation)}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 truncate">{replyingToMessage.body}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingToMessage(null)}
                  className="p-1 text-gray-400 hover:text-gray-700 shrink-0"
                  aria-label="Batal balas pesan"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {pendingAttachment && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-indigo-50 border border-indigo-200 text-xs">
                {pendingAttachment.kind === 'image' ? (
                  <img
                    src={pendingAttachment.base64}
                    alt={pendingAttachment.name}
                    className="w-10 h-10 rounded object-cover border border-indigo-200 shrink-0"
                  />
                ) : pendingAttachment.kind === 'video' ? (
                  <div className="w-9 h-9 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                    <Video className="w-4 h-4" />
                  </div>
                ) : pendingAttachment.kind === 'audio' ? (
                  <div className="w-9 h-9 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                    <Music className="w-4 h-4" />
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px] truncate text-gray-900">
                    {pendingAttachment.name}
                  </div>
                  {pendingAttachment.size !== undefined && (
                    <div className="text-[10px] text-gray-500 font-mono">
                      {pendingAttachment.kind.toUpperCase()} •{' '}
                      {pendingAttachment.size >= 1024 * 1024
                        ? `${(pendingAttachment.size / (1024 * 1024)).toFixed(2)} MB`
                        : `${Math.max(1, Math.round(pendingAttachment.size / 1024))} KB`}
                    </div>
                  )}
                </div>
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

            <div className="relative">
              {showEmojiPicker && (
                <div className="absolute bottom-full left-0 mb-2 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-2.5 w-64 max-w-[calc(100vw-2.5rem)] grid grid-cols-8 gap-1">
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
                <div className="absolute bottom-full left-0 mb-2 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-80 sm:w-96 max-w-[calc(100vw-2.5rem)] space-y-2.5">
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-gray-100">
                    <span className="text-xs font-semibold text-gray-900 inline-flex items-center gap-1.5 whitespace-nowrap truncate">
                      <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>Balasan Cepat</span>
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {canManageMaster && onOpenSettings && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowCannedPicker(false);
                            onOpenSettings('quick_replies');
                          }}
                          className="h-6 px-2 rounded border border-gray-200 bg-white hover:bg-gray-50 text-[11px] font-medium text-gray-600 inline-flex items-center whitespace-nowrap shrink-0 transition-colors"
                        >
                          Kelola
                        </button>
                      )}
                      {canManageMaster && (
                        <button
                          type="button"
                          onClick={() => setShowAddCanned((v) => !v)}
                          className="h-6 px-2 rounded border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-[11px] font-medium text-indigo-700 inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                        >
                          {!showAddCanned && <Plus className="w-3 h-3 shrink-0" />}
                          <span>{showAddCanned ? 'Tutup' : 'Tambah'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowCannedPicker(false)}
                        title="Tutup Balasan Cepat"
                        className="h-6 w-6 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 inline-flex items-center justify-center shrink-0"
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
                            const filled = applyCannedVariables(item.content);
                            setInputText((prev) => (prev ? `${prev} ${filled}` : filled));
                            setShowCannedPicker(false);
                          }}
                          className="text-left flex-1 min-w-0 hover:bg-gray-50 rounded p-1"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono text-[10px] shrink-0">
                              /{item.shortCode}
                            </span>
                            {item.category && (
                              <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] shrink-0">
                                {item.category}
                              </span>
                            )}
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
                  <div className="absolute bottom-full left-0 mb-2 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-1.5 w-80 sm:w-96 max-w-[calc(100vw-2.5rem)] max-h-48 overflow-y-auto divide-y divide-gray-100">
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
                        onClick={() => setInputText(applyCannedVariables(item.content))}
                        className="w-full text-left px-2 py-1.5 hover:bg-indigo-50 rounded transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono text-[10px] shrink-0">
                            /{item.shortCode}
                          </span>
                          {item.category && (
                            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] shrink-0">
                              {item.category}
                            </span>
                          )}
                          <span className="text-[11px] font-medium text-gray-800 truncate">
                            {item.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 truncate mt-0.5">{item.content}</p>
                      </button>
                    ))}
                </div>
              )}

              {showProductPicker && (
                <div className="absolute bottom-full left-0 mb-2 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-80 sm:w-96 max-w-[calc(100vw-2.5rem)] space-y-2.5">
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-gray-100">
                    <span className="text-xs font-semibold text-gray-900 inline-flex items-center gap-1.5 whitespace-nowrap truncate">
                      <Package className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>Katalog Produk (Quick Quote)</span>
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowAddProduct((v) => !v)}
                        className="h-6 px-2 rounded border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-[11px] font-medium text-indigo-700 inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                      >
                        {!showAddProduct && <Plus className="w-3 h-3 shrink-0" />}
                        <span>{showAddProduct ? 'Tutup' : 'Tambah'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowProductPicker(false)}
                        title="Tutup Katalog Produk"
                        className="h-6 w-6 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 inline-flex items-center justify-center shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {showAddProduct && (
                    <form onSubmit={handleCreateQuickProduct} className="p-2 rounded bg-gray-50 border border-gray-200 space-y-1.5">
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          type="text"
                          placeholder="SKU (opsional)"
                          value={newProdSku}
                          onChange={(e) => setNewProdSku(e.target.value)}
                          className="px-2 py-1 bg-white border border-gray-300 rounded text-[11px] font-mono"
                        />
                        <input
                          type="text"
                          required
                          placeholder="Nama produk"
                          value={newProdName}
                          onChange={(e) => setNewProdName(e.target.value)}
                          className="px-2 py-1 bg-white border border-gray-300 rounded text-[11px]"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          type="number"
                          min={0}
                          required
                          placeholder="Harga (Rp)"
                          value={newProdPrice}
                          onChange={(e) => setNewProdPrice(e.target.value)}
                          className="px-2 py-1 bg-white border border-gray-300 rounded text-[11px] font-mono"
                        />
                        <input
                          type="text"
                          placeholder="Satuan (pcs/paket)"
                          value={newProdUnit}
                          onChange={(e) => setNewProdUnit(e.target.value)}
                          className="px-2 py-1 bg-white border border-gray-300 rounded text-[11px]"
                        />
                      </div>
                      <Button type="submit" size="sm" variant="primary" isLoading={savingProduct} className="w-full">
                        Simpan Produk
                      </Button>
                    </form>
                  )}

                  <input
                    type="text"
                    placeholder="Cari nama atau SKU produk..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="w-full h-7 px-2.5 bg-gray-50 border border-gray-200 rounded text-[11px] focus:outline-none focus:border-indigo-500"
                  />

                  <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                    {productsList.filter((p) => {
                      const q = productSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        p.name.toLowerCase().includes(q) ||
                        p.sku.toLowerCase().includes(q) ||
                        (p.category || '').toLowerCase().includes(q)
                      );
                    }).length === 0 ? (
                      <div className="py-4 text-center text-[11px] text-gray-500">
                        Belum ada produk di katalog.
                      </div>
                    ) : (
                      productsList
                        .filter((p) => {
                          const q = productSearch.trim().toLowerCase();
                          if (!q) return true;
                          return (
                            p.name.toLowerCase().includes(q) ||
                            p.sku.toLowerCase().includes(q) ||
                            (p.category || '').toLowerCase().includes(q)
                          );
                        })
                        .map((prod) => (
                          <button
                            key={prod.id}
                            type="button"
                            onClick={() => insertProductQuote(prod)}
                            className="w-full text-left py-1.5 px-1.5 hover:bg-indigo-50/70 rounded transition-colors flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="px-1 py-0.5 rounded bg-gray-100 text-gray-600 font-mono text-[10px]">
                                  {prod.sku}
                                </span>
                                <span className="text-[11px] font-medium text-gray-900 truncate">
                                  {prod.name}
                                </span>
                              </div>
                              {prod.description && (
                                <p className="text-[10px] text-gray-500 truncate mt-0.5">{prod.description}</p>
                              )}
                            </div>
                            <span className="text-[11px] font-mono font-semibold text-indigo-700 whitespace-nowrap shrink-0">
                              Rp {new Intl.NumberFormat('id-ID').format(prod.price || 0)}
                            </span>
                          </button>
                        ))
                    )}
                  </div>
                </div>
              )}

              {showLinkComposer && (
                <form
                  onSubmit={handleSendLinkMessage}
                  className="absolute bottom-full left-0 mb-2 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-80 sm:w-96 max-w-[calc(100vw-2.5rem)] space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-gray-100">
                    <span className="text-xs font-semibold text-gray-900 inline-flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      <span>Kirim Tautan (Link Preview)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowLinkComposer(false)}
                      title="Tutup Form Tautan"
                      className="h-6 w-6 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 inline-flex items-center justify-center shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <input
                      type="url"
                      required
                      placeholder="https://contoh.com/promo (wajib)"
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded text-[11px] font-mono focus:outline-none focus:border-indigo-500"
                    />
                    <input
                      type="text"
                      placeholder="Judul kartu preview (opsional)"
                      value={linkTitle}
                      onChange={(e) => setLinkTitle(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded text-[11px] focus:outline-none focus:border-indigo-500"
                    />
                    <input
                      type="text"
                      placeholder="Pesan pengantar / deskripsi tautan (opsional)"
                      value={linkCaption}
                      onChange={(e) => setLinkCaption(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded text-[11px] focus:outline-none focus:border-indigo-500"
                    />
                    <input
                      type="text"
                      placeholder="Deskripsi singkat preview (opsional)"
                      value={linkDesc}
                      onChange={(e) => setLinkDesc(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded text-[11px] focus:outline-none focus:border-indigo-500"
                    />
                    <input
                      type="url"
                      placeholder="URL gambar thumbnail preview (opsional)"
                      value={linkImageUrl}
                      onChange={(e) => setLinkImageUrl(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded text-[11px] font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-1.5 pt-1">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowLinkComposer(false)}
                    >
                      Batal
                    </Button>
                    <Button type="submit" variant="primary" size="sm" isLoading={sending}>
                      Kirim Tautan
                    </Button>
                  </div>
                </form>
              )}

              {showInteractiveComposer && (
                <form
                  onSubmit={handleSendInteractiveMessage}
                  className="absolute bottom-full left-0 mb-2 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-80 sm:w-[26rem] max-w-[calc(100vw-2.5rem)] max-h-[70vh] overflow-y-auto space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-gray-100">
                    <div className="inline-flex rounded border border-gray-200 p-0.5 bg-gray-50 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setInteractiveTab('BUTTONS')}
                        className={`px-2 py-0.5 rounded font-medium ${
                          interactiveTab === 'BUTTONS'
                            ? 'bg-white text-indigo-700 shadow-2xs'
                            : 'text-gray-600'
                        }`}
                      >
                        Tombol Aksi
                      </button>
                      <button
                        type="button"
                        onClick={() => setInteractiveTab('POLL')}
                        className={`px-2 py-0.5 rounded font-medium ${
                          interactiveTab === 'POLL'
                            ? 'bg-white text-indigo-700 shadow-2xs'
                            : 'text-gray-600'
                        }`}
                      >
                        Polling WA
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowInteractiveComposer(false)}
                      title="Tutup Form Interaktif"
                      className="h-6 w-6 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 inline-flex items-center justify-center shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {(selectedConversation.channel || 'WHATSAPP') !== 'WHATSAPP' && (
                    <div className="px-2 py-1.5 rounded bg-amber-50 border border-amber-200 text-[10px] text-amber-800">
                      Tombol interaktif &amp; polling WAHA hanya tersedia untuk percakapan WhatsApp.
                    </div>
                  )}

                  {interactiveTab === 'BUTTONS' ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Header judul (opsional)"
                        value={btnHeader}
                        onChange={(e) => setBtnHeader(e.target.value)}
                        className="w-full px-2.5 py-1 bg-gray-50 border border-gray-200 rounded text-[11px]"
                      />
                      <textarea
                        rows={2}
                        required
                        placeholder="Isi pesan utama (wajib)..."
                        value={btnBody}
                        onChange={(e) => setBtnBody(e.target.value)}
                        className="w-full px-2.5 py-1 bg-gray-50 border border-gray-200 rounded text-[11px]"
                      />
                      <input
                        type="text"
                        placeholder="Footer catatan kecil (opsional)"
                        value={btnFooter}
                        onChange={(e) => setBtnFooter(e.target.value)}
                        className="w-full px-2.5 py-1 bg-gray-50 border border-gray-200 rounded text-[11px]"
                      />

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-gray-600 uppercase">
                            Daftar Tombol ({btnItems.length}/3)
                          </span>
                          {btnItems.length < 3 && (
                            <button
                              type="button"
                              onClick={() =>
                                setBtnItems((prev) => [...prev, { type: 'reply', text: '' }])
                              }
                              className="text-[10px] font-medium text-indigo-600 hover:underline inline-flex items-center gap-0.5"
                            >
                              <Plus className="w-3 h-3" />
                              Tambah Tombol
                            </button>
                          )}
                        </div>
                        {btnItems.map((b, idx) => (
                          <div key={idx} className="p-2 rounded bg-gray-50 border border-gray-200 space-y-1">
                            <div className="flex items-center gap-1">
                              <select
                                value={b.type}
                                onChange={(e) => {
                                  const nextType = e.target.value as InteractiveButtonItem['type'];
                                  setBtnItems((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, type: nextType } : item))
                                  );
                                }}
                                className="px-1.5 py-1 bg-white border border-gray-200 rounded text-[10px]"
                              >
                                <option value="reply">Balas Cepat</option>
                                <option value="url">Buka Tautan</option>
                                <option value="copy">Salin Kode</option>
                                <option value="call">Telepon</option>
                              </select>
                              <input
                                type="text"
                                required
                                placeholder="Label tombol"
                                value={b.text}
                                onChange={(e) =>
                                  setBtnItems((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, text: e.target.value } : item))
                                  )
                                }
                                className="flex-1 min-w-0 px-2 py-1 bg-white border border-gray-200 rounded text-[11px]"
                              />
                              {btnItems.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setBtnItems((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                  className="p-1 text-gray-400 hover:text-red-600"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            {b.type === 'url' && (
                              <input
                                type="url"
                                required
                                placeholder="https://..."
                                value={b.url || ''}
                                onChange={(e) =>
                                  setBtnItems((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, url: e.target.value } : item))
                                  )
                                }
                                className="w-full px-2 py-1 bg-white border border-gray-200 rounded text-[10px] font-mono"
                              />
                            )}
                            {b.type === 'copy' && (
                              <input
                                type="text"
                                required
                                placeholder="Kode promo / teks disalin"
                                value={b.copyCode || ''}
                                onChange={(e) =>
                                  setBtnItems((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, copyCode: e.target.value } : item))
                                  )
                                }
                                className="w-full px-2 py-1 bg-white border border-gray-200 rounded text-[10px] font-mono"
                              />
                            )}
                            {b.type === 'call' && (
                              <input
                                type="text"
                                required
                                placeholder="+62812..."
                                value={b.phoneNumber || ''}
                                onChange={(e) =>
                                  setBtnItems((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, phoneNumber: e.target.value } : item))
                                  )
                                }
                                className="w-full px-2 py-1 bg-white border border-gray-200 rounded text-[10px] font-mono"
                              />
                            )}
                          </div>
                        ))}
                      </div>

                      <label className="flex items-start gap-1.5 text-[10px] text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={btnFallbackText}
                          onChange={(e) => setBtnFallbackText(e.target.checked)}
                          className="mt-0.5 rounded border-gray-300 text-indigo-600"
                        />
                        <span>
                          Fallback otomatis ke teks bernomor bila engine WhatsApp (mis. WEBJS) menolak tombol native.
                        </span>
                      </label>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="text"
                        required
                        placeholder="Pertanyaan polling..."
                        value={pollQuestion}
                        onChange={(e) => setPollQuestion(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded text-[11px]"
                      />
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-gray-600 uppercase">
                            Pilihan ({pollOptions.length}/12)
                          </span>
                          {pollOptions.length < 12 && (
                            <button
                              type="button"
                              onClick={() => setPollOptions((prev) => [...prev, ''])}
                              className="text-[10px] font-medium text-indigo-600 hover:underline inline-flex items-center gap-0.5"
                            >
                              <Plus className="w-3 h-3" />
                              Tambah Opsi
                            </button>
                          )}
                        </div>
                        {pollOptions.map((opt, idx) => (
                          <div key={idx} className="flex items-center gap-1">
                            <input
                              type="text"
                              required
                              placeholder={`Pilihan ${idx + 1}`}
                              value={opt}
                              onChange={(e) =>
                                setPollOptions((prev) =>
                                  prev.map((v, i) => (i === idx ? e.target.value : v))
                                )
                              }
                              className="flex-1 min-w-0 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-[11px]"
                            />
                            {pollOptions.length > 2 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPollOptions((prev) => prev.filter((_, i) => i !== idx))
                                }
                                className="p-1 text-gray-400 hover:text-red-600"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <label className="flex items-center gap-1.5 text-[10px] text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pollMultiple}
                          onChange={(e) => setPollMultiple(e.target.checked)}
                          className="rounded border-gray-300 text-indigo-600"
                        />
                        <span>Izinkan pelanggan memilih lebih dari 1 opsi</span>
                      </label>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-1.5 pt-1">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowInteractiveComposer(false)}
                    >
                      Batal
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      isLoading={sending}
                      disabled={(selectedConversation.channel || 'WHATSAPP') !== 'WHATSAPP'}
                    >
                      {interactiveTab === 'POLL' ? 'Kirim Polling' : 'Kirim Tombol'}
                    </Button>
                  </div>
                </form>
              )}

              <form onSubmit={handleSendMessage} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 min-w-0">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.rar"
                onChange={handleFilePick}
                className="hidden"
              />
              <div className="flex items-center justify-between sm:justify-start gap-1.5 shrink-0">
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => openComposerPicker('EMOJI')}
                    title="Sisipkan Emotikon"
                    className="h-8 w-8 sm:h-9 sm:w-9 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 inline-flex items-center justify-center shrink-0"
                  >
                    <Smile className="w-4 h-4" />
                  </button>
                  {composerMode === 'REPLY' && (
                    <>
                      <button
                        type="button"
                        onClick={() => openComposerPicker('CANNED')}
                        title="Balasan Cepat (Canned Responses)"
                        className="h-8 w-8 sm:h-9 sm:w-9 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 text-amber-600 inline-flex items-center justify-center shrink-0"
                      >
                        <Zap className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openComposerPicker('PRODUCT')}
                        title="Sisipkan Katalog Produk (Quick Quote)"
                        className="h-8 w-8 sm:h-9 sm:w-9 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 text-indigo-600 inline-flex items-center justify-center shrink-0"
                      >
                        <Package className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openComposerPicker('LINK')}
                        title="Kirim Tautan (Send Link Preview)"
                        className="h-8 w-8 sm:h-9 sm:w-9 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 text-sky-600 inline-flex items-center justify-center shrink-0"
                      >
                        <Link2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openComposerPicker('INTERACTIVE')}
                        title="Kirim Tombol Interaktif / Polling WhatsApp"
                        className="h-8 w-8 sm:h-9 sm:w-9 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 text-emerald-600 inline-flex items-center justify-center shrink-0"
                      >
                        <ListChecks className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        title="Lampirkan Gambar, Video, Audio, atau Dokumen (maks. 10 MB)"
                        className="h-8 w-8 sm:h-9 sm:w-9 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 inline-flex items-center justify-center shrink-0"
                      >
                        <Paperclip className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
                {composerMode === 'REPLY' && (
                  <span className="sm:hidden text-[10px] text-gray-400 font-mono truncate">
                    Ketik / untuk template
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <input
                  ref={replyInputRef}
                  type="text"
                  placeholder={
                    composerMode === 'NOTE'
                      ? 'Tulis catatan internal tim (tidak dikirim ke pelanggan)...'
                      : `Ketik balasan ${
                          CHANNEL_META[
                            ((selectedConversation.channel || 'WHATSAPP').toUpperCase()) as OmnichannelType
                          ]?.label || 'WhatsApp'
                        }...`
                  }
                  value={inputText}
                  onChange={(e) => handleReplyTextChange(e.target.value)}
                  onBlur={() => stopOutboundTyping(selectedConversation.id)}
                  className={`flex-1 min-w-0 h-9 px-3 border rounded-md text-[13px] placeholder-gray-400 focus:outline-none ${
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
                  className="shrink-0"
                >
                  {composerMode === 'NOTE' ? 'Simpan' : 'Kirim'}
                </Button>
              </div>
            </form>
            </div>
          </div>
          )}
        </div>
      ) : (
        <div className="hidden md:flex flex-1 flex-col items-center justify-center p-8 bg-gray-50 text-gray-400">
          <MessageSquare className="w-10 h-10 text-gray-300 mb-2" />
          <p className="text-xs text-gray-500">
            Pilih percakapan dari daftar di sebelah kiri untuk melihat pesan.
          </p>
        </div>
      )}

      {/* Right Contact Profile (Collapsible: drawer on <xl, docked column on xl+) */}
      {showContactPanel && selectedConversation?.contact && (
        <>
          <div
            className="fixed inset-0 z-20 bg-black/20 xl:hidden"
            onClick={() => toggleContactPanel(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 right-0 z-30 w-full sm:w-80 xl:static xl:z-auto xl:w-80 border-l border-gray-200 bg-white px-4 pb-5 flex flex-col shrink-0 overflow-y-auto min-h-0 shadow-xl xl:shadow-none">
          <div className="sticky top-0 z-10 bg-white/95 backdrop-blur -mx-4 px-4 py-3 mb-3 border-b border-gray-100 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Detail Kontak
            </span>
            <button
              type="button"
              onClick={() => toggleContactPanel(false)}
              title="Tutup Detail Kontak"
              className="p-1.5 -mr-1 rounded-md hover:bg-gray-100 text-gray-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="text-center pb-4 border-b border-gray-200">
            <div className="w-12 h-12 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-base flex items-center justify-center mx-auto mb-2 border border-indigo-200">
              {getConversationDisplayTitle(selectedConversation).slice(0, 2).toUpperCase()}
            </div>
            <h4 className="font-semibold text-gray-900 text-sm break-words">
              {getConversationDisplayTitle(selectedConversation)}
            </h4>
            {getConversationDisplayTitle(selectedConversation).toLowerCase() !==
              selectedConversation.contact.nama_lengkap.trim().toLowerCase() && (
              <span className="text-[11px] text-indigo-600 font-medium block mt-0.5">
                Kontak Utama: {selectedConversation.contact.nama_lengkap}
              </span>
            )}
            {selectedConversation.contact.nama_panggilan && (
              <span className="text-xs text-gray-500 block">
                Panggilan: {selectedConversation.contact.nama_panggilan}
              </span>
            )}
            <div className="mt-1.5 flex items-center justify-center flex-wrap gap-1">
              {selectedConversation.wahaSession && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 max-w-full truncate">
                  <Smartphone className="w-3 h-3 shrink-0" />
                  <span className="truncate">Sesi: {selectedConversation.wahaSession}</span>
                </span>
              )}
              {selectedConversation.channelAccountName && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200 max-w-full truncate">
                  <span className="truncate">Kanal: {selectedConversation.channelAccountName}</span>
                </span>
              )}
            </div>
          </div>

          <div className="py-4 space-y-4 flex-1 text-xs text-gray-700">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-gray-600">
                  Nama di Kanal/Sesi Ini
                </span>
                {selectedConversation.pushName && (
                  <span
                    title="Push name yang diterima dari pengirim di kanal/sesi ini"
                    className="text-[10px] text-gray-500 truncate max-w-[140px]"
                  >
                    Push: <strong className="text-gray-700">{selectedConversation.pushName}</strong>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  disabled={!canManageConversation}
                  value={channelDisplayNameDraft}
                  onChange={(e) => setChannelDisplayNameDraft(e.target.value)}
                  placeholder={selectedConversation.pushName || selectedConversation.contact.nama_lengkap}
                  className="flex-1 min-w-0 px-2 py-1 text-xs bg-white border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100"
                />
                {canManageConversation && (
                  <>
                    <button
                      type="button"
                      disabled={savingChannelName}
                      onClick={() => void handleSaveChannelDisplayName(channelDisplayNameDraft)}
                      className="px-2 py-1 text-[11px] font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 shrink-0"
                    >
                      {savingChannelName ? '...' : 'Simpan'}
                    </button>
                    {selectedConversation.channelDisplayName && (
                      <button
                        type="button"
                        disabled={savingChannelName}
                        onClick={() => void handleSaveChannelDisplayName(null)}
                        title="Reset nama tampilan kanal ke Push Name / Kontak Utama"
                        className="px-1.5 py-1 text-[11px] font-medium rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50 shrink-0"
                      >
                        Reset
                      </button>
                    )}
                  </>
                )}
              </div>
              <p className="text-[10px] text-gray-400 leading-snug">
                Hanya mengubah tampilan percakapan ini, tanpa menimpa kontak utama atau kanal lain.
              </p>
            </div>

            {/* Penilaian & Kategori SLA/CSAT Toggle */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-gray-700 flex items-center gap-1">
                  <EyeOff className="w-3 h-3 text-gray-500" />
                  Status Penilaian (SLA &amp; CSAT)
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                    selectedConversation.excludeFromMetrics
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {selectedConversation.excludeFromMetrics ? 'Non-Penilaian' : 'Dinilai'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={savingExclude || !canManageConversation}
                  onClick={() => void handleUpdateMetricExclusion(false, null)}
                  className={`py-1 px-2 rounded border text-[11px] font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                    !selectedConversation.excludeFromMetrics
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Customer (Dinilai)
                </button>
                <button
                  type="button"
                  disabled={savingExclude || !canManageConversation}
                  onClick={() =>
                    void handleUpdateMetricExclusion(
                      true,
                      excludeReasonDraft || (selectedConversation.isGroup ? 'Grup WhatsApp' : 'Bukan Customer')
                    )
                  }
                  className={`py-1 px-2 rounded border text-[11px] font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                    selectedConversation.excludeFromMetrics
                      ? 'border-amber-600 bg-amber-50 text-amber-900'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Bukan Penilaian
                </button>
              </div>

              {selectedConversation.excludeFromMetrics && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex flex-wrap gap-1">
                    {['Bukan Customer', 'Internal / Tim', 'Grup WhatsApp', 'Spam / Bot', 'Lainnya'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        disabled={savingExclude || !canManageConversation}
                        onClick={() => {
                          setExcludeReasonDraft(preset);
                          void handleUpdateMetricExclusion(true, preset);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors disabled:opacity-60 ${
                          (selectedConversation.excludeReason || '') === preset
                            ? 'bg-amber-100 border-amber-400 text-amber-900 font-semibold'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      disabled={!canManageConversation}
                      value={excludeReasonDraft}
                      onChange={(e) => setExcludeReasonDraft(e.target.value)}
                      placeholder="Alasan / keterangan lain..."
                      className="flex-1 min-w-0 px-2 py-1 text-[11px] bg-white border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100"
                    />
                    {canManageConversation && (
                      <button
                        type="button"
                        disabled={savingExclude}
                        onClick={() => void handleUpdateMetricExclusion(true, excludeReasonDraft)}
                        className="px-2 py-1 text-[11px] font-medium rounded bg-gray-800 text-white hover:bg-gray-900 disabled:opacity-50 shrink-0"
                      >
                        Simpan
                      </button>
                    )}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-gray-400 leading-snug">
                Penanda Non-Penilaian disimpan ke profil kontak dan otomatis berlaku ke semua obrolan aktif serta percakapan baru berikutnya (dikecualikan dari analitik SLA, CSAT, peringatan telat balas, &amp; CSAT otomatis).
              </p>
            </div>

            {selectedConversation.isGroup && (
              <div className="bg-teal-50/50 border border-teal-200 rounded-lg p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-teal-900 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-teal-700" />
                    Partisipan Grup ({participantsData?.participants.length || 0})
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={loadingParticipants}
                      onClick={() => void fetchParticipants(selectedConversation.id, true)}
                      title="Sinkronkan daftar anggota grup dari WAHA"
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-teal-200 text-[10px] font-medium text-teal-800 hover:bg-teal-100 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${loadingParticipants ? 'animate-spin' : ''}`} />
                      Sync
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowParticipantsModal(true);
                        void fetchParticipants(selectedConversation.id, true);
                      }}
                      className="text-[10px] font-semibold text-indigo-700 hover:underline"
                    >
                      Semua
                    </button>
                  </div>
                </div>

                {loadingParticipants && !participantsData ? (
                  <p className="text-[11px] text-gray-500">Memuat partisipan grup...</p>
                ) : !participantsData || participantsData.participants.length === 0 ? (
                  <p className="text-[11px] text-gray-500">
                    Partisipan akan terisi saat anggota mengirim pesan atau klik Sync.
                  </p>
                ) : (
                  <div className="space-y-1 max-h-40 overflow-y-auto pr-0.5">
                    {participantsData.participants.slice(0, 8).map((part) => (
                      <div
                        key={part.jid}
                        className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-white border border-teal-100 text-[11px]"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate flex items-center gap-1">
                            <span>{part.contactName || part.name || (part.phone ? `+${part.phone}` : part.jid)}</span>
                            {part.role !== 'member' && (
                              <span className="px-1 py-0.2 rounded text-[9px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                {part.role === 'superadmin' ? 'Owner' : 'Admin'}
                              </span>
                            )}
                          </div>
                          {part.phone && (
                            <div className="text-[10px] font-mono text-gray-500 truncate">
                              +{part.phone}
                            </div>
                          )}
                        </div>
                        {part.messageCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono text-[10px] shrink-0">
                            {part.messageCount} chat
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <span className="block text-[11px] text-gray-400 font-medium mb-0.5">WhatsApp</span>
              {selectedConversation.contact.nomor_whatsapp ? (
                <div className="font-mono text-gray-900 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-indigo-600" />
                  <span>+{selectedConversation.contact.nomor_whatsapp}</span>
                </div>
              ) : (
                <div className="text-gray-600 text-[11px] font-mono break-all">
                  {selectedConversation.isGroup
                    ? `Grup WA (${selectedConversation.externalThreadId || '@g.us'})`
                    : (selectedConversation.channel || 'WHATSAPP') === 'WHATSAPP'
                    ? 'WhatsApp Privacy ID (@lid)'
                    : 'Akun Omnichannel'}
                </div>
              )}
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
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-[11px] text-gray-500 font-medium">
                  <Tag className="w-3 h-3" />
                  Label Percakapan
                </span>
                {canManageMaster && onOpenSettings && (
                  <button
                    type="button"
                    onClick={() => onOpenSettings('labels')}
                    className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 whitespace-nowrap"
                  >
                    Kelola
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {activeLabels.map((lbl) => {
                  const matched = masterLabels.find(
                    (m) => m.name.toLowerCase() === lbl.toLowerCase()
                  );
                  const badgeCls =
                    (matched && LABEL_COLOR_MAP[matched.color]?.badge) ||
                    'bg-indigo-50 text-indigo-700 border-indigo-200';
                  return (
                    <span
                      key={lbl}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${badgeCls}`}
                    >
                      {lbl}
                      {canManageConversation && (
                        <button
                          type="button"
                          onClick={() => handleToggleLabel(lbl)}
                          className="opacity-75 hover:opacity-100"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </span>
                  );
                })}
                {canManageConversation &&
                  (masterLabels.length > 0 ? masterLabels.map((m) => m.name) : PRESET_LABELS)
                    .filter((p) => !activeLabels.some((a) => a.toLowerCase() === p.toLowerCase()))
                    .map((preset) => (
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
              {canManageConversation && (
                <form onSubmit={handleAddCustomLabel} className="flex gap-1.5">
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Tambah label..."
                    className="flex-1 min-w-0 h-8 sm:h-7 px-2 bg-gray-50 border border-gray-200 rounded text-[11px] focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    className="h-8 sm:h-7 px-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-[11px] font-medium shrink-0"
                  >
                    Tambah
                  </button>
                </form>
              )}
            </div>

            {/* Contact Notes */}
            <div className="pt-2 border-t border-gray-100 space-y-1.5">
              <span className="block text-[11px] text-gray-500 font-medium">
                Catatan Kontak
              </span>
              <textarea
                rows={3}
                disabled={!canManageConversation}
                value={contactNotesDraft}
                onChange={(e) => setContactNotesDraft(e.target.value)}
                placeholder="Tambahkan catatan permanen untuk kontak ini..."
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded text-[11px] focus:outline-none focus:border-indigo-500 disabled:opacity-70"
              />
              {canManageConversation && (
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
              )}
            </div>

            {/* CSAT Rating History */}
            <div className="pt-2 border-t border-gray-100 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="block text-[11px] text-gray-500 font-medium">
                  Riwayat Penilaian CSAT
                </span>
                {selectedConversation.csatHistory && selectedConversation.csatHistory.length > 0 && (
                  <span className="text-[10px] font-medium text-gray-400">
                    {selectedConversation.csatHistory.length} sesi
                  </span>
                )}
              </div>
              {selectedConversation.csatHistory && selectedConversation.csatHistory.length > 0 ? (
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-0.5">
                  {selectedConversation.csatHistory.map((csat) => {
                    const scoreVal = csat.overallScore ?? csat.rating;
                    const hasDetails = Boolean(csat.criteriaDetails && csat.criteriaDetails.length > 0);
                    const isOpen = expandedCsatId === csat.id;
                    return (
                      <div
                        key={csat.id}
                        onClick={() => hasDetails && setExpandedCsatId(isOpen ? null : csat.id)}
                        className={`p-2 rounded-md border space-y-1 ${
                          scoreVal
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-gray-50 border-gray-200'
                        } ${hasDetails ? 'cursor-pointer hover:border-amber-300' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          {scoreVal ? (
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Star
                                  key={s}
                                  className={`w-3 h-3 ${
                                    s <= Math.round(scoreVal)
                                      ? 'text-amber-400 fill-amber-400'
                                      : 'text-gray-300'
                                  }`}
                                />
                              ))}
                              <span className="text-[11px] font-semibold font-mono text-amber-900 ml-1">
                                {Number(scoreVal).toFixed(2).replace(/\.?0+$/, '')}/5
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] font-medium text-gray-500">
                              Menunggu penilaian
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400 shrink-0">
                            {new Date(csat.submittedAt || csat.sentAt).toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                            })}
                          </span>
                        </div>
                        {csat.profileName && (
                          <div className="text-[10px] text-indigo-700 font-medium">
                            Target: {csat.profileName}
                          </div>
                        )}
                        {(csat.conversationStartedAt || csat.conversationResolvedAt) && (
                          <div className="text-[10px] text-gray-500 font-mono">
                            Sesi:{' '}
                            {csat.conversationStartedAt
                              ? new Date(csat.conversationStartedAt).toLocaleString('id-ID', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '-'}{' '}
                            →{' '}
                            {csat.conversationResolvedAt
                              ? new Date(csat.conversationResolvedAt).toLocaleTimeString('id-ID', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : new Date(csat.sentAt).toLocaleTimeString('id-ID', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                          </div>
                        )}
                        {csat.feedback && (
                          <p className="text-[11px] text-amber-900 italic break-words">
                            &ldquo;{csat.feedback}&rdquo;
                          </p>
                        )}
                        {hasDetails && isOpen && (
                          <div className="pt-1.5 mt-1 border-t border-amber-200/80 space-y-0.5 text-[10px]">
                            {csat.criteriaDetails!.map((cd) => (
                              <div key={cd.key} className="flex items-center justify-between text-gray-700">
                                <span className="truncate">{cd.label}</span>
                                <span className="font-mono font-semibold text-amber-900 shrink-0">
                                  {cd.score}/5
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="text-[10px] text-gray-400 flex items-center justify-between gap-1">
                          <span>
                            {csat.triggerType === 'AUTO_RESOLVE' ? 'Saat Akhiri' : 'Kirim Manual'}
                            {hasDetails ? (isOpen ? ' • Sembunyikan' : ' • Detail skor') : ''}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setHighlightedCsatWindow({
                                token: csat.token,
                                startedAt: csat.conversationStartedAt || null,
                                resolvedAt: csat.conversationResolvedAt || csat.sentAt || null,
                              });
                            }}
                            className="text-indigo-600 hover:underline font-medium shrink-0"
                          >
                            Sorot di chat
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : selectedConversation.csatRating ? (
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
                      &ldquo;{selectedConversation.csatFeedback}&rdquo;
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-gray-400">
                  Belum ada penilaian. Gunakan tombol &ldquo;Kirim CSAT&rdquo; atau pilih &ldquo;Akhiri &amp; Kirim CSAT&rdquo;.
                </p>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-gray-200 space-y-2 text-center">
            {selectedConversation.contact.nomor_whatsapp && (
              <a
                href={`https://wa.me/${selectedConversation.contact.nomor_whatsapp}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 w-full h-9 bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-200 font-medium rounded-md text-xs transition-colors"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Buka di WhatsApp Web</span>
              </a>
            )}
            {canManageConversation && canEditContact && (
              <button
                type="button"
                onClick={() => void handleOpenMergeModal()}
                className="inline-flex items-center justify-center gap-1.5 w-full h-9 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium rounded-md text-xs transition-colors"
              >
                <GitMerge className="w-3.5 h-3.5" />
                <span>Gabungkan ke Kontak Lain</span>
              </button>
            )}
          </div>
        </div>
        </>
      )}

      {showMergeModal && selectedConversation?.contact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg border border-gray-200 shadow-lg w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Gabungkan Kontak Lintas Channel</h3>
                <p className="text-[11px] text-gray-500">
                  Pindahkan seluruh chat &amp; identitas <strong>{selectedConversation.contact.nama_lengkap}</strong> ke kontak utama.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMergeModal(false)}
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
                  value={mergeSearch}
                  onChange={(e) => setMergeSearch(e.target.value)}
                  placeholder="Cari nama atau nomor WA kontak tujuan..."
                  className="w-full h-9 pl-9 pr-3 bg-gray-50 border border-gray-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100 p-2">
              {loadingContacts ? (
                <LoadingState message="Memuat daftar kontak..." />
              ) : (
                contactsList
                  .filter((c) => {
                    if (c.id === selectedConversation.contact.id) return false;
                    const q = mergeSearch.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      c.nama_lengkap.toLowerCase().includes(q) ||
                      (c.nomor_whatsapp || '').includes(q)
                    );
                  })
                  .slice(0, 30)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={mergingContactId === c.id}
                      onClick={() => void handleMergeIntoTarget(c.id)}
                      className="w-full px-3 py-2.5 text-left hover:bg-indigo-50/70 rounded-md flex items-center justify-between gap-2 transition-colors disabled:opacity-50"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-gray-900 truncate">{c.nama_lengkap}</div>
                        <div className="text-[11px] font-mono text-gray-500">
                          {c.nomor_whatsapp ? `+${c.nomor_whatsapp}` : 'Tanpa nomor WA'}
                        </div>
                      </div>
                      <span className="text-[11px] font-medium text-indigo-600 shrink-0">
                        {mergingContactId === c.id ? 'Menggabungkan...' : 'Pilih Target'}
                      </span>
                    </button>
                  ))
              )}
            </div>
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
                      (c.nomor_whatsapp || '').includes(q)
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
                          {c.nomor_whatsapp ? `+${c.nomor_whatsapp}` : 'Tanpa nomor WhatsApp'}
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

      {showParticipantsModal && selectedConversation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4"
          onClick={() => setShowParticipantsModal(false)}
        >
          <div
            className="bg-white rounded-lg border border-gray-200 shadow-xl max-w-lg w-full max-h-[88dvh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 truncate">
                  <Users className="w-4 h-4 text-teal-600 shrink-0" />
                  <span className="truncate">
                    Partisipan {participantsData?.groupName || getConversationDisplayTitle(selectedConversation)}
                  </span>
                </h4>
                {participantsData?.groupJid && (
                  <p className="text-[10px] font-mono text-gray-500 truncate mt-0.5">
                    {participantsData.groupJid}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={loadingParticipants}
                  onClick={() => void fetchParticipants(selectedConversation.id, true)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 bg-white text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingParticipants ? 'animate-spin' : ''}`} />
                  <span>Segarkan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowParticipantsModal(false)}
                  className="p-1 text-gray-500 hover:text-gray-800 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-2">
              {loadingParticipants && !participantsData ? (
                <LoadingState message="Mengambil daftar partisipan grup dari WhatsApp..." />
              ) : !participantsData || participantsData.participants.length === 0 ? (
                <EmptyState
                  title="Belum ada partisipan tercatat"
                  description="Anggota grup yang mengirim pesan atau terbaca dari WAHA akan tampil di sini."
                />
              ) : (
                <>
                  {participantsData.syncError && (
                    <div className="p-2 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                      {participantsData.syncError}
                    </div>
                  )}
                  <div className="divide-y divide-gray-100 border border-gray-200 rounded-md">
                    {participantsData.participants.map((part) => (
                      <div
                        key={part.jid}
                        className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 truncate flex items-center gap-1.5">
                            <span>{part.contactName || part.name || (part.phone ? `+${part.phone}` : part.jid)}</span>
                            {part.role !== 'member' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                {part.role === 'superadmin' ? 'Owner Grup' : 'Admin Grup'}
                              </span>
                            )}
                            {part.contactId && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Di Kontak CRM
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-gray-500 truncate mt-0.5">
                            {part.phone ? `+${part.phone}` : part.jid}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono text-[11px] font-semibold">
                            {part.messageCount} pesan
                          </span>
                          {part.lastMessageAt && (
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              {new Date(part.lastMessageAt).toLocaleString('id-ID', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {lightboxMedia && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxMedia(null)}
        >
          <div
            className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between text-white text-xs">
              <span className="font-mono truncate max-w-[70%]">
                {lightboxMedia.name || 'Pratinjau Gambar'}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={lightboxMedia.url}
                  download={lightboxMedia.name || 'gambar'}
                  className="px-2.5 py-1 rounded bg-white/15 hover:bg-white/25 text-white inline-flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh</span>
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxMedia(null)}
                  className="p-1.5 rounded bg-white/15 hover:bg-white/25 text-white"
                  title="Tutup"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <img
              src={lightboxMedia.url}
              alt={lightboxMedia.name || 'Pratinjau Gambar'}
              className="max-w-full max-h-[80vh] object-contain rounded shadow-2xl bg-black/40"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Conversations;
