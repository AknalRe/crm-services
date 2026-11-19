import React, { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo } from 'react';
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
  Monitor,
  CheckCircle2,
  RotateCcw,
  UserCheck,
  Zap,
  Trash2,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
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
  SlidersHorizontal,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Send,
  Info,
  Sticker,
  ShoppingBag,
  SmilePlus,
  Compass,
  User,
  UserPlus,
  AtSign,
  Forward,
  Pin,
  PinOff,
  Shield,
  Image as ImageIcon,
  Sparkles,
  FolderOpen,
  BookmarkPlus,
  Play,
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
  MediaLibraryItem,
  OmnichannelType,
  ProductItem,
  ResolvedMentionItem,
  SavedStickerItem,
  SharedContactMetadataItem,
  WahaPrivacyConfig,
  WahaSessionItem,
} from '../types';
import {
  EMOJI_CATEGORIES,
  PRESET_STICKER_TEMPLATES,
  PresetStickerTemplate,
  QUICK_REACTION_EMOJIS,
  convertImageFileToStickerWebp,
  getRecentEmojis,
  pushRecentEmoji,
  renderPresetStickerToWebp,
} from '../lib/emojiStickers';
import { LABEL_COLOR_MAP } from '../components/MasterDataSettings';
import { VerifiedMetaBadge } from '../components/VerifiedMetaBadge';
import { hasPerm } from '../lib/permissions';

const CHANNEL_META: Record<OmnichannelType, { label: string; short: string; cls: string; dot: string }> = {
  WHATSAPP: { label: 'WhatsApp', short: 'WA', cls: 'bg-slate-50 text-slate-700 border-slate-200', dot: 'bg-emerald-500' },
  WHATSAPP_CLOUD: { label: 'WA Business Cloud', short: 'WA Cloud', cls: 'bg-slate-50 text-slate-700 border-slate-200', dot: 'bg-teal-500' },
  INSTAGRAM: { label: 'Instagram', short: 'IG', cls: 'bg-slate-50 text-slate-700 border-slate-200', dot: 'bg-rose-400' },
  FACEBOOK: { label: 'Facebook', short: 'FB', cls: 'bg-slate-50 text-slate-700 border-slate-200', dot: 'bg-blue-500' },
  THREADS: { label: 'Threads', short: 'Threads', cls: 'bg-slate-50 text-slate-700 border-slate-200', dot: 'bg-slate-500' },
  TELEGRAM: { label: 'Telegram', short: 'TG', cls: 'bg-slate-50 text-slate-700 border-slate-200', dot: 'bg-sky-500' },
};

const WAHA_SESSION_DOT_PALETTE = [
  'bg-emerald-500',
  'bg-sky-500',
  'bg-indigo-500',
  'bg-slate-500',
  'bg-amber-500',
  'bg-rose-500',
];

function getWahaSessionBadgeClass(
  _sessionName: string | null | undefined,
  _sessionList: Array<{ name: string }>,
  fallbackCls: string
): string {
  return fallbackCls;
}

function getWahaSessionDotClass(
  sessionName: string | null | undefined,
  sessionList: Array<{ name: string }>,
  fallbackDot: string
): string {
  const clean = String(sessionName || '').trim();
  if (!clean) return fallbackDot;
  const idx = sessionList.findIndex((s) => s.name.toLowerCase() === clean.toLowerCase());
  if (idx >= 0) {
    return WAHA_SESSION_DOT_PALETTE[idx % WAHA_SESSION_DOT_PALETTE.length];
  }
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) % WAHA_SESSION_DOT_PALETTE.length;
  }
  return WAHA_SESSION_DOT_PALETTE[Math.abs(hash)];
}
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import {
  MediaLibraryPickerModal,
  resolveCrmMediaUrl,
} from '../components/ui/MediaLibraryPickerModal';
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

interface PendingAttachmentItem {
  id: string;
  file?: File;
  base64?: string;
  originalBase64?: string;
  mediaUrl?: string;
  previewUrl?: string;
  mimetype: string;
  name: string;
  size: number;
  kind: 'image' | 'video' | 'audio' | 'document';
  asDocument?: boolean;
}

async function processImageAttachment(
  file: File,
  isHd: boolean,
  fallbackBase64?: string
): Promise<{ base64: string; size: number }> {
  return new Promise((resolve) => {
    const doProcess = (dataUri: string) => {
      if (!dataUri) {
        resolve({ base64: '', size: 0 });
        return;
      }
      if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
        resolve({ base64: dataUri, size: file.size });
        return;
      }
      const img = new window.Image();
      img.onerror = () => resolve({ base64: dataUri, size: file.size });
      img.onload = () => {
        try {
          const { width, height } = img;
          const maxDim = isHd ? 4096 : 1600;
          const quality = isHd ? 0.95 : 0.82;

          let targetW = width;
          let targetH = height;
          if (width > maxDim || height > maxDim) {
            if (width >= height) {
              targetW = maxDim;
              targetH = Math.round((height * maxDim) / width);
            } else {
              targetH = maxDim;
              targetW = Math.round((width * maxDim) / height);
            }
          } else if (isHd) {
            resolve({ base64: dataUri, size: file.size });
            return;
          }

          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({ base64: dataUri, size: file.size });
            return;
          }
          ctx.drawImage(img, 0, 0, targetW, targetH);
          const outMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          const compressed = canvas.toDataURL(outMime, quality);
          const estSize = Math.round((compressed.length * 3) / 4);
          resolve({ base64: compressed, size: estSize });
        } catch {
          resolve({ base64: dataUri, size: file.size });
        }
      };
      img.src = dataUri;
    };

    if (fallbackBase64) {
      doProcess(fallbackBase64);
    } else {
      const reader = new FileReader();
      reader.onload = () => doProcess(String(reader.result || ''));
      reader.onerror = () => resolve({ base64: '', size: 0 });
      reader.readAsDataURL(file);
    }
  });
}

function parseChatMessageMeta(msg: ChatMessage): ChatMessageMetadata | null {
  if (!msg.metadataJson) return null;
  try {
    return JSON.parse(msg.metadataJson) as ChatMessageMetadata;
  } catch {
    return null;
  }
}

interface ParticipantLookupEntry {
  name: string;
  phone?: string | null;
  contactId?: string | null;
  jid?: string | null;
  role?: string | null;
  avatarUrl?: string | null;
}

interface ClickableMentionTarget {
  contactId?: string | null;
  phone?: string | null;
  name?: string | null;
  jid?: string | null;
  role?: string | null;
  avatarUrl?: string | null;
}

const ContactAvatar: React.FC<{
  url?: string | null;
  label: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
}> = ({ url, label, className = '', onClick, title }) => {
  const [failed, setFailed] = useState(false);
  const resolved = url ? resolveMediaUrl(url) : '';
  useEffect(() => {
    setFailed(false);
  }, [resolved]);

  if (resolved && !failed) {
    return (
      <img
        src={resolved}
        alt={label}
        title={title}
        onClick={onClick}
        onError={() => setFailed(true)}
        className={`object-cover shrink-0 ${onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''} ${className}`}
      />
    );
  }
  return (
    <div
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center shrink-0 ${onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''} ${className}`}
    >
      {(label || 'WA').slice(0, 2).toUpperCase()}
    </div>
  );
};

function buildMentionLookupMap(mentionedContacts?: ResolvedMentionItem[]): Map<string, ResolvedMentionItem> {
  const mentionByToken = new Map<string, ResolvedMentionItem>();
  if (Array.isArray(mentionedContacts)) {
    for (const mc of mentionedContacts) {
      if (mc?.token) mentionByToken.set(mc.token.toLowerCase(), mc);
      if (mc?.phone) mentionByToken.set(mc.phone.replace(/\D/g, ''), mc);
      if (mc?.jid) mentionByToken.set(mc.jid.replace(/@.*$/, '').toLowerCase(), mc);
    }
  }
  return mentionByToken;
}

function formatMentionPlainText(
  text: string,
  mySessionPhones?: Set<string>,
  contactsByPhone?: Map<string, string>,
  participantsLookup?: Map<string, ParticipantLookupEntry>,
  mentionedContacts?: ResolvedMentionItem[]
): string {
  if (!text) return '';
  const mentionByToken = buildMentionLookupMap(mentionedContacts);

  return text.replace(/@(\+?\d{6,20}|[a-zA-Z0-9](?:[a-zA-Z0-9_.-]*[a-zA-Z0-9])?)/g, (match, rawTarget) => {
    const cleanTarget = rawTarget.replace(/^\+/, '');
    const cleanDigits = cleanTarget.replace(/\D/g, '');
    if (cleanDigits && mySessionPhones?.has(cleanDigits)) {
      return '@Anda';
    }
    const fromMsg =
      mentionByToken.get(cleanTarget.toLowerCase()) ||
      (cleanDigits ? mentionByToken.get(cleanDigits) : undefined);
    if (fromMsg?.name) {
      return `@${fromMsg.name}`;
    }
    const fromPart = cleanDigits ? participantsLookup?.get(cleanDigits) : participantsLookup?.get(cleanTarget.toLowerCase());
    if (fromPart?.name) {
      return `@${fromPart.name}`;
    }
    if (cleanDigits && contactsByPhone?.has(cleanDigits)) {
      return `@${contactsByPhone.get(cleanDigits)}`;
    }
    if (fromMsg?.phone) {
      return `@+${fromMsg.phone}`;
    }
    if (cleanDigits && cleanDigits.length >= 7 && cleanDigits.length <= 13) {
      return `@+${cleanDigits}`;
    }
    if (cleanDigits && cleanDigits.length >= 14) {
      return `@${cleanDigits}`;
    }
    return match;
  });
}

function formatConversationPreview(
  text: string | null | undefined,
  mySessionPhones: Set<string>,
  contactsByPhone: Map<string, string>,
  participantsLookup?: Map<string, ParticipantLookupEntry>,
  mentionedContacts?: ResolvedMentionItem[]
): { previewText: string; isMentionedMe: boolean } {
  if (!text) return { previewText: 'Tidak ada pesan terbaru', isMentionedMe: false };
  let isMentionedMe = false;
  const mentionByToken = buildMentionLookupMap(mentionedContacts);
  const previewText = text.replace(/@(\+?\d{6,20}|[a-zA-Z0-9](?:[a-zA-Z0-9_.-]*[a-zA-Z0-9])?)/g, (match, rawTarget) => {
    const cleanTarget = rawTarget.replace(/^\+/, '');
    const cleanDigits = cleanTarget.replace(/\D/g, '');
    if (cleanDigits && mySessionPhones.has(cleanDigits)) {
      isMentionedMe = true;
      return '@Anda';
    }
    const fromMsg =
      mentionByToken.get(cleanTarget.toLowerCase()) ||
      (cleanDigits ? mentionByToken.get(cleanDigits) : undefined);
    if (fromMsg?.name) {
      return `@${fromMsg.name}`;
    }
    const fromPart = cleanDigits
      ? participantsLookup?.get(cleanDigits)
      : participantsLookup?.get(cleanTarget.toLowerCase());
    if (fromPart?.name) {
      return `@${fromPart.name}`;
    }
    if (cleanDigits && contactsByPhone.has(cleanDigits)) {
      return `@${contactsByPhone.get(cleanDigits)}`;
    }
    if (fromMsg?.phone) {
      return `@+${fromMsg.phone}`;
    }
    if (cleanDigits && cleanDigits.length >= 7 && cleanDigits.length <= 13) {
      return `@+${cleanDigits}`;
    }
    if (cleanDigits && cleanDigits.length >= 14) {
      return `@${cleanDigits}`;
    }
    return match;
  });
  return { previewText, isMentionedMe };
}

function renderTextWithClickableLinks(
  text: string,
  participantsLookup?: Map<string, ParticipantLookupEntry>,
  mentionedContacts?: ResolvedMentionItem[],
  onMentionClick?: (target: ClickableMentionTarget) => void,
  contactsByPhone?: Map<string, string>,
  mySessionPhones?: Set<string>
): React.ReactNode {
  if (!text) return null;
  const mentionByToken = buildMentionLookupMap(mentionedContacts);
  const protectedNodes: React.ReactNode[] = [];
  let keyCounter = 0;

  const pushProtected = (node: React.ReactNode) => {
    const idx = protectedNodes.length;
    protectedNodes.push(node);
    return `\uE000${idx}\uE001`;
  };

  // 1. Extract fenced code blocks (```...```) first so contents are rendered verbatim
  const withBlocksReplaced = text.replace(/```([\s\S]*?)```/g, (_m, codeBody) => {
    const trimmed = String(codeBody).replace(/^\n|\n$/g, '');
    return pushProtected(
      <code
        key={`cb-${keyCounter++}`}
        className="block my-1 px-2.5 py-1.5 rounded bg-gray-100/95 border border-gray-200 font-mono text-[12px] text-gray-900 whitespace-pre-wrap break-all"
      >
        {trimmed}
      </code>
    );
  });

  // 2. Extract inline monospace (`...`)
  const withInlineCodeReplaced = withBlocksReplaced.replace(/`([^`\n]+)`/g, (_m, codeSpan) =>
    pushProtected(
      <code
        key={`ic-${keyCounter++}`}
        className="px-1 py-[1px] rounded bg-gray-100 border border-gray-200/80 font-mono text-[12px] text-rose-700 break-all"
      >
        {codeSpan}
      </code>
    )
  );

  // 3. Extract URLs and @mentions BEFORE italic/bold/strike so URLs with _ or * are never split
  const tokenized = withInlineCodeReplaced.replace(
    /(https?:\/\/[^\s<>\uE000\uE001]+|@(?:\+?\d{6,20}|[a-zA-Z0-9](?:[a-zA-Z0-9_.-]*[a-zA-Z0-9])?))/gi,
    (part) => {
      if (/^https?:\/\//i.test(part)) {
        const clean = part.replace(/[.,);!?*_~]+$/, '');
        const trailing = part.slice(clean.length);
        return (
          pushProtected(
            <a
              key={`url-${keyCounter++}`}
              href={clean}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-indigo-700 hover:text-indigo-900 break-all font-medium"
            >
              {clean}
            </a>
          ) + trailing
        );
      }

      const rawTarget = part.slice(1);
      const cleanTarget = rawTarget.replace(/^\+/, '');
      const cleanPhone = cleanTarget.replace(/\D/g, '');
      const isMe = Boolean(cleanPhone && mySessionPhones?.has(cleanPhone));
      const fromMsg =
        mentionByToken.get(cleanTarget.toLowerCase()) ||
        (cleanPhone ? mentionByToken.get(cleanPhone) : undefined);
      const fromPart =
        (cleanPhone ? participantsLookup?.get(cleanPhone) : undefined) ||
        participantsLookup?.get(cleanTarget.toLowerCase());
      const fromContact = cleanPhone && contactsByPhone ? contactsByPhone.get(cleanPhone) : undefined;

      const matchedName =
        (isMe ? 'Anda' : '') ||
        fromMsg?.name ||
        fromPart?.name ||
        fromContact ||
        (fromMsg?.phone ? `+${fromMsg.phone}` : '') ||
        (cleanPhone ? (cleanPhone.length <= 13 ? `+${cleanPhone}` : cleanPhone) : cleanTarget);
      const resolvedPhone =
        fromMsg?.phone ||
        fromPart?.phone ||
        (cleanPhone && cleanPhone.length <= 13 ? cleanPhone : null);
      const resolvedContactId = fromMsg?.contactId || fromPart?.contactId || null;
      const canOpen = Boolean(onMentionClick && (resolvedContactId || resolvedPhone || matchedName));

      const pillCls =
        'inline font-semibold text-indigo-700 bg-indigo-50/95 border border-indigo-200/80 rounded px-1 py-[1px] hover:bg-indigo-100 hover:text-indigo-800 transition-colors';

      if (canOpen) {
        return pushProtected(
          <button
            key={`m-${keyCounter++}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMentionClick?.({
                contactId: resolvedContactId,
                phone: resolvedPhone,
                name: matchedName,
                jid: fromPart?.jid || fromMsg?.jid,
                role: fromPart?.role,
              });
            }}
            className={`${pillCls} cursor-pointer`}
            title={`Klik untuk melihat detail kontak: ${matchedName}${resolvedPhone ? ` (+${resolvedPhone})` : ''}`}
          >
            @{matchedName}
          </button>
        );
      }

      return pushProtected(
        <span
          key={`m-${keyCounter++}`}
          className={pillCls}
          title={`Mention: @${cleanTarget}${matchedName !== cleanTarget ? ` (${matchedName})` : ''}`}
        >
          @{matchedName}
        </span>
      );
    }
  );

  // Expand placeholders \uE000idx\uE001 inside a leaf string
  const expandPlaceholders = (segment: string): React.ReactNode => {
    const segParts = segment.split(/(\uE000\d+\uE001)/g);
    return segParts.map((sp, i) => {
      const m = /^\uE000(\d+)\uE001$/.exec(sp);
      if (m) {
        return <React.Fragment key={`p-${i}-${m[1]}`}>{protectedNodes[Number(m[1])]}</React.Fragment>;
      }
      return sp ? <React.Fragment key={`t-${i}`}>{sp}</React.Fragment> : null;
    });
  };

  // Recursive WhatsApp inline formatter (*bold*, _italic_, ~strikethrough~)
  const formatInlineWa = (segment: string, depth = 0): React.ReactNode => {
    if (!segment || depth > 4) return expandPlaceholders(segment);

    const patterns: Array<{
      type: 'bold' | 'italic' | 'strike';
      regex: RegExp;
    }> = [
      {
        type: 'bold',
        regex: /(^|[\s([>~_])\*([^\s*](?:[^*\n]*[^\s*])?)\*(?=$|[\s.,!?;:)\]<~_])/,
      },
      {
        type: 'italic',
        regex: /(^|[\s([>*~])_([^\s_](?:[^_\n]*[^\s_])?)_(?=$|[\s.,!?;:)\]<*~])/,
      },
      {
        type: 'strike',
        regex: /(^|[\s([>*_])~([^\s~](?:[^~\n]*[^\s~])?)~(?=$|[\s.,!?;:)\]<*_])/,
      },
    ];

    let bestMatch: {
      type: 'bold' | 'italic' | 'strike';
      index: number;
      prefix: string;
      inner: string;
      fullLength: number;
    } | null = null;

    for (const p of patterns) {
      const m = p.regex.exec(segment);
      if (m && m[2]) {
        const idx = m.index;
        if (!bestMatch || idx < bestMatch.index) {
          bestMatch = {
            type: p.type,
            index: idx,
            prefix: m[1],
            inner: m[2],
            fullLength: m[0].length,
          };
        }
      }
    }

    if (!bestMatch) return expandPlaceholders(segment);

    const before = segment.slice(0, bestMatch.index) + bestMatch.prefix;
    const after = segment.slice(bestMatch.index + bestMatch.fullLength);
    const innerNode = formatInlineWa(bestMatch.inner, depth + 1);

    const wrapped =
      bestMatch.type === 'bold' ? (
        <strong key={`wa-${keyCounter++}`} className="font-semibold">
          {innerNode}
        </strong>
      ) : bestMatch.type === 'italic' ? (
        <em key={`wa-${keyCounter++}`} className="italic">
          {innerNode}
        </em>
      ) : (
        <del key={`wa-${keyCounter++}`} className="line-through text-gray-500">
          {innerNode}
        </del>
      );

    return (
      <>
        {before ? expandPlaceholders(before) : null}
        {wrapped}
        {after ? formatInlineWa(after, depth) : null}
      </>
    );
  };

  // Line-level handling (> blockquote lines preserved cleanly alongside normal lines)
  const lines = tokenized.split('\n');
  if (lines.length === 1) {
    const qm = /^>\s?(.*)$/.exec(lines[0]);
    if (qm) {
      return (
        <div className="border-l-2 border-indigo-400/75 pl-2 text-gray-700/90 italic">
          {formatInlineWa(qm[1])}
        </div>
      );
    }
    return formatInlineWa(lines[0]);
  }

  return lines.map((line, lIdx) => {
    const qm = /^>\s?(.*)$/.exec(line);
    if (qm) {
      return (
        <div
          key={`ln-${lIdx}`}
          className="border-l-2 border-indigo-400/75 pl-2 my-0.5 text-gray-700/90 italic"
        >
          {formatInlineWa(qm[1])}
        </div>
      );
    }
    return (
      <React.Fragment key={`ln-${lIdx}`}>
        {lIdx > 0 && !/^>\s?/.test(lines[lIdx - 1]) ? '\n' : null}
        {formatInlineWa(line)}
      </React.Fragment>
    );
  });
}

function shouldRenderMediaCaption(body?: string | null, mediaName?: string | null, _mediaType?: string | null): boolean {
  if (!body) return false;
  const trimmed = body.trim();
  if (!trimmed) return false;

  // Auto-generated synthetic fallback labels: e.g. [Dokumen: file.pdf], [Dokumen], [Lampiran: file.pdf], [Lampiran Media], [Gambar], [Video], [Audio], [Stiker]
  if (/^\[(Dokumen|Lampiran|Gambar|Video|Audio|Stiker|Lampiran Media)(:\s*.*)?\]$/i.test(trimmed)) {
    return false;
  }

  // If body is identical to mediaName or clean filename
  if (mediaName) {
    const cleanName = mediaName.trim().toLowerCase();
    const lowerBody = trimmed.toLowerCase();
    if (
      lowerBody === cleanName ||
      lowerBody === `[dokumen: ${cleanName}]` ||
      lowerBody === `[lampiran: ${cleanName}]`
    ) {
      return false;
    }
  }

  return true;
}

function getChatDateKey(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatChatDateLabel(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const todayKey = getChatDateKey(now.toISOString());
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  const yesterdayKey = getChatDateKey(yest.toISOString());
  const key = getChatDateKey(iso);
  if (key === todayKey) return 'Hari ini';
  if (key === yesterdayKey) return 'Kemarin';
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatPinExpiry(iso?: string | null): string {
  if (!iso) return '';
  const exp = new Date(iso).getTime();
  if (isNaN(exp)) return '';
  const diffMs = exp - Date.now();
  if (diffMs <= 0) return 'Kedaluwarsa';
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) return `Sisa ${diffHours} jam`;
  const diffDays = Math.ceil(diffHours / 24);
  return `Sisa ${diffDays} hari`;
}

function isGenericReplySenderName(name?: string | null): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (
    /^(pelanggan|anggota grup|tim cs|whatsapp langsung|kontak baru|peserta|pesan sebelumnya|anda)$/i.test(
      trimmed
    )
  ) {
    return true;
  }
  if (/^kontak\s+\d{3,6}$/i.test(trimmed)) return true;
  if (/@(lid|c\.us|s\.whatsapp\.net|g\.us)$/i.test(trimmed)) return true;
  if (/^\+?\d{6,16}$/.test(trimmed.replace(/[\s-]/g, ''))) return true;
  return false;
}

function pickBestReplyDisplayName(
  contactName?: string | null,
  pushName?: string | null,
  fallbackPhone?: string | null
): string | null {
  const c = contactName?.trim() || '';
  const p = pushName?.trim() || '';
  if (c && !isGenericReplySenderName(c)) return c;
  if (p && !isGenericReplySenderName(p)) return p;
  if (c) return c;
  if (p) return p;
  const digits = String(fallbackPhone || '').replace(/\D/g, '');
  return digits ? `+${digits}` : null;
}

function getConversationDisplayTitle(conv?: Conversation | null): string {
  if (!conv) return 'WhatsApp';
  return (
    conv.channelDisplayName?.trim() ||
    conv.contextTitle?.trim() ||
    conv.contact?.verified_name?.trim() ||
    conv.pushName?.trim() ||
    conv.contact?.nama_lengkap?.trim() ||
    conv.contact?.nomor_whatsapp?.trim() ||
    conv.externalThreadId ||
    'WhatsApp'
  );
}

const PARTICIPANT_TEXT_COLORS = [
  'text-slate-800',
  'text-slate-700',
  'text-indigo-800/80',
  'text-zinc-800',
  'text-slate-900',
];

function getParticipantColorClass(key?: string | null): string {
  if (!key) return PARTICIPANT_TEXT_COLORS[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return PARTICIPANT_TEXT_COLORS[hash % PARTICIPANT_TEXT_COLORS.length];
}

const PARTICIPANT_AVATAR_BG_COLORS = [
  'bg-slate-600',
  'bg-slate-700',
  'bg-zinc-600',
  'bg-slate-500',
  'bg-indigo-600/80',
];

function getParticipantAvatarBgClass(key?: string | null): string {
  if (!key) return PARTICIPANT_AVATAR_BG_COLORS[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return PARTICIPANT_AVATAR_BG_COLORS[hash % PARTICIPANT_AVATAR_BG_COLORS.length];
}

function getMessageSenderGroupKey(m: ChatMessage | null): string {
  if (!m) return '';
  if (m.direction === 'OUTBOUND') return 'OUTBOUND';
  const phoneDigits = m.senderPhone ? m.senderPhone.replace(/\D/g, '') : '';
  if (phoneDigits) return `p:${phoneDigits}`;
  const cleanJid = m.senderJid ? m.senderJid.trim().toLowerCase() : '';
  if (cleanJid) return `j:${cleanJid}`;
  return `n:${String(m.senderName || '').trim().toLowerCase()}`;
}

interface ConversationsProps {
  licenseInfo?: LicenseInfo | null;
  currentUser?: AuthStatus['user'] | null;
  targetConversation?: ConversationNavigationTarget | null;
  onTargetHandled?: () => void;
  onOpenContact?: (target: ClickableMentionTarget) => void;
  onOpenPlans?: () => void;
  onOpenSettings?: (section: 'quick_replies' | 'products' | 'labels') => void;
}

const CONTACT_PANEL_KEY = 'crm_livechat_contact_panel';
const PRESET_LABELS = ['VIP', 'Follow Up', 'Komplain', 'Lunas', 'Prospek'];

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
    return localStorage.getItem(CONTACT_PANEL_KEY) === 'open';
  } catch {
    return false;
  }
}

export const Conversations: React.FC<ConversationsProps> = ({
  licenseInfo,
  currentUser,
  targetConversation,
  onTargetHandled,
  onOpenContact,
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
  const isCurrentConversationGroup = Boolean(
    selectedConversation?.isGroup ||
      selectedConversation?.externalThreadId?.toLowerCase().endsWith('@g.us')
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'PENDING' | 'RESOLVED'>('ALL');
  const [chatTypeFilter, setChatTypeFilter] = useState<'ALL' | 'PERSONAL' | 'GROUP' | 'UNREAD'>('ALL');
  const [metricFilter, setMetricFilter] = useState<'ALL' | 'ASSESSED' | 'EXCLUDED' | 'GROUPS' | 'SLA_BREACH'>('ALL');
  const [channelFilter, setChannelFilter] = useState<'ALL' | OmnichannelType>('ALL');
  const [channelAccounts, setChannelAccounts] = useState<ChannelAccount[]>([]);
  const [accountFilter, setAccountFilter] = useState<'ALL' | string>('ALL');
  const [labelFilter, setLabelFilter] = useState<'ALL' | string>('ALL');
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [showResolveConfirmModal, setShowResolveConfirmModal] = useState(false);
  const [resolvingStatus, setResolvingStatus] = useState(false);

  const [sessions, setSessions] = useState<WahaSessionItem[]>([]);
  const [defaultWahaSession, setDefaultWahaSession] = useState<string>('');
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [wahaPrivacy, setWahaPrivacy] = useState<WahaPrivacyConfig | null>(null);
  const [retryingMessageId, setRetryingMessageId] = useState<string | null>(null);
  const [showContactPanel, setShowContactPanel] = useState<boolean>(readContactPanelPref);
  const [showListFilters, setShowListFilters] = useState(false);
  const [showMobileChatActions, setShowMobileChatActions] = useState(false);
  const [showComposerTools, setShowComposerTools] = useState(false);

  // Group Admin Modal & Profile About toggle states
  const [expandProfileAbout, setExpandProfileAbout] = useState(false);
  const [showGroupManageModal, setShowGroupManageModal] = useState(false);
  const [groupManageTab, setGroupManageTab] = useState<'INFO' | 'INVITE' | 'ADD_MEMBER'>('INFO');
  const [groupSubjectDraft, setGroupSubjectDraft] = useState('');
  const [groupDescDraft, setGroupDescDraft] = useState('');
  const [savingGroupInfo, setSavingGroupInfo] = useState(false);
  const [groupInviteCode, setGroupInviteCode] = useState('');
  const [groupInviteLink, setGroupInviteLink] = useState('');
  const [groupInviteError, setGroupInviteError] = useState<string | null>(null);
  const [loadingGroupInvite, setLoadingGroupInvite] = useState(false);
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [quickMemberSearch, setQuickMemberSearch] = useState('');
  const [quickMemberContacts, setQuickMemberContacts] = useState<Contact[]>([]);
  const [quickMemberPage, setQuickMemberPage] = useState(1);
  const [quickMemberLimit, setQuickMemberLimit] = useState(25);
  const [quickMemberTotal, setQuickMemberTotal] = useState(0);
  const [quickMemberTotalPages, setQuickMemberTotalPages] = useState(1);
  const [loadingQuickMemberContacts, setLoadingQuickMemberContacts] = useState(false);
  const [openProfileSections, setOpenProfileSections] = useState<Record<string, boolean>>({});

  const toggleProfileSection = (key: string) => {
    setOpenProfileSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Composer enhancements: Internal note mode, Emoji picker, Product Quick Quote, Link & Interactive, File attachment
  const [composerMode, setComposerMode] = useState<'REPLY' | 'NOTE'>(() =>
    hasPerm(currentUser, 'conversations.reply')
      ? 'REPLY'
      : hasPerm(currentUser, 'conversations.manage')
      ? 'NOTE'
      : 'REPLY'
  );
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPickerTab, setEmojiPickerTab] = useState<'EMOJI' | 'STICKER'>('EMOJI');
  const [emojiCategoryId, setEmojiCategoryId] = useState<string>('smileys');
  const [emojiSearch, setEmojiSearch] = useState('');
  const [recentEmojis, setRecentEmojis] = useState<string[]>(getRecentEmojis);
  const [savedStickers, setSavedStickers] = useState<SavedStickerItem[]>([]);
  const [whatsappStickers, setWhatsappStickers] = useState<
    Array<SavedStickerItem & { wahaSession?: string | null; senderName?: string | null }>
  >([]);
  const [stickerSubTab, setStickerSubTab] = useState<'all' | 'whatsapp' | 'saved' | 'preset'>('all');
  const [savingSticker, setSavingSticker] = useState(false);
  const [savingMsgStickerId, setSavingMsgStickerId] = useState<string | null>(null);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const [reactingMsgId, setReactingMsgId] = useState<string | null>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);

  const [mediaPickerMode, setMediaPickerMode] = useState<
    'CHAT_ATTACHMENT' | 'STICKER' | 'LINK_THUMBNAIL' | 'GROUP_AVATAR' | null
  >(null);

  const [showLocationComposer, setShowLocationComposer] = useState(false);
  const [locLat, setLocLat] = useState('');
  const [locLng, setLocLng] = useState('');
  const [locName, setLocName] = useState('');
  const [locAddress, setLocAddress] = useState('');
  const [locMapUrlInput, setLocMapUrlInput] = useState('');
  const [loadingGeo, setLoadingGeo] = useState(false);

  const [showContactSharePicker, setShowContactSharePicker] = useState(false);
  const [contactShareSearch, setContactShareSearch] = useState('');
  const [contactShareList, setContactShareList] = useState<Contact[]>([]);
  const [loadingContactShareList, setLoadingContactShareList] = useState(false);
  const [savingSharedContactKey, setSavingSharedContactKey] = useState<string | null>(null);
  const [savedSharedPhones, setSavedSharedPhones] = useState<Record<string, boolean>>({});

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
  const [lightboxMedia, setLightboxMedia] = useState<{ url: string; name?: string | null } | null>(null);
  const [presenceByConvId, setPresenceByConvId] = useState<
    Record<string, { status: 'typing' | 'recording' | 'online' | 'paused'; expiresAt: number }>
  >({});
  const [groupPresenceByConvId, setGroupPresenceByConvId] = useState<
    Record<
      string,
      Record<
        string,
        { status: 'typing' | 'recording' | 'online'; name: string; avatarUrl?: string | null; expiresAt: number }
      >
    >
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
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachmentItem[]>([]);
  const [isHdMode, setIsHdMode] = useState<boolean>(false);
  const [sendingProgress, setSendingProgress] = useState<{ current: number; total: number } | null>(null);
  const [replyingToMessage, setReplyingToMessage] = useState<ChatMessage | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = replyInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = 180;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [inputText, selectedConversation?.id, composerMode]);

  // Right panel: Labels & Contact Notes
  const [newLabel, setNewLabel] = useState('');
  const [contactNotesDraft, setContactNotesDraft] = useState('');
  const [channelDisplayNameDraft, setChannelDisplayNameDraft] = useState('');
  const [excludeReasonDraft, setExcludeReasonDraft] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [savingChannelName, setSavingChannelName] = useState(false);
  const [savingExclude, setSavingExclude] = useState(false);
  const [syncingProfile, setSyncingProfile] = useState(false);
  const [participantsData, setParticipantsData] = useState<ConversationParticipantsResponse | null>(null);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [expandedCsatId, setExpandedCsatId] = useState<string | null>(null);
  const [highlightedCsatWindow, setHighlightedCsatWindow] = useState<{
    token?: string | null;
    startedAt?: string | null;
    resolvedAt?: string | null;
  } | null>(null);

  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionAnchorIndex, setMentionAnchorIndex] = useState<number | null>(null);
  const [floatingDateLabel, setFloatingDateLabel] = useState<string>('');
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);
  const [forwardTargetConvId, setForwardTargetConvId] = useState<string>('');
  const [forwardSearch, setForwardSearch] = useState<string>('');
  const [forwardingSending, setForwardingSending] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const msgElementRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeConvIdRef = useRef<string>('');
  activeConvIdRef.current = selectedConversation?.id || '';
  const loadedMsgsConvIdRef = useRef<string>('');
  const isAtBottomRef = useRef<boolean>(true);
  const [isAtChatBottom, setIsAtChatBottom] = useState<boolean>(true);
  const pendingInitialScrollRef = useRef<boolean>(false);
  const [pendingNewMsgCount, setPendingNewMsgCount] = useState<number>(0);
  const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState<boolean>(false);
  const [wahaHistoryExhausted, setWahaHistoryExhausted] = useState<boolean>(false);
  const loadingOlderMessagesRef = useRef<boolean>(false);
  const wahaHistoryOffsetRef = useRef<number>(0);
  const wahaHistoryExhaustedRef = useRef<boolean>(false);
  const prependScrollAnchorRef = useRef<{ top: number; height: number } | null>(null);
  const lastAutoScrollRef = useRef<{ convId: string; lastMsgId: string | null }>({
    convId: '',
    lastMsgId: null,
  });

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = messagesContainerRef.current;
    if (container) {
      if (behavior === 'smooth') {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      } else {
        container.scrollTop = container.scrollHeight;
      }
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }
    isAtBottomRef.current = true;
    setIsAtChatBottom(true);
    setPendingNewMsgCount(0);
  }, []);

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

  const convListContainerRef = useRef<HTMLDivElement>(null);
  const convListAnchorRef = useRef<{ top: number; height: number } | null>(null);
  const [pendingNewConvIds, setPendingNewConvIds] = useState<string[]>([]);
  const prevConvSnapshotRef = useRef<{
    initialized: boolean;
    ids: Set<string>;
    activityAt: Map<string, string>;
  }>({
    initialized: false,
    ids: new Set(),
    activityAt: new Map(),
  });

  const scrollConvListToTop = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = convListContainerRef.current;
    if (el) {
      if (behavior === 'smooth') {
        el.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        el.scrollTop = 0;
      }
    }
    setPendingNewConvIds([]);
  }, []);

  const handleConvListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop <= 32) {
      setPendingNewConvIds((prev) => (prev.length > 0 ? [] : prev));
    }
  }, []);

  const fetchConversations = useCallback(async () => {
    if (!isLiveChatUnlocked) return;
    try {
      const rawData = await api.getConversations();
      const data = Array.from(new Map(rawData.map((c) => [c.id, c])).values());

      const listEl = convListContainerRef.current;
      const isScrolledDown = Boolean(listEl && listEl.scrollTop > 48);
      if (listEl && isScrolledDown) {
        convListAnchorRef.current = { top: listEl.scrollTop, height: listEl.scrollHeight };
      } else {
        convListAnchorRef.current = null;
      }

      const snap = prevConvSnapshotRef.current;
      const newlyDetectedIds: string[] = [];
      const nextIds = new Set<string>();
      const nextActivity = new Map<string, string>();
      for (const c of data) {
        nextIds.add(c.id);
        const actTs = String(c.lastMessageAt || c.updatedAt || c.createdAt || '');
        nextActivity.set(c.id, actTs);
        if (snap.initialized) {
          const isBrandNew = !snap.ids.has(c.id);
          const prevAct = snap.activityAt.get(c.id) || '';
          const hasFreshActivity = Boolean(
            actTs &&
              prevAct &&
              actTs > prevAct &&
              (c.unreadCount || 0) > 0 &&
              c.id !== activeConvIdRef.current
          );
          if (isBrandNew || hasFreshActivity) {
            newlyDetectedIds.push(c.id);
          }
        }
      }
      prevConvSnapshotRef.current = {
        initialized: true,
        ids: nextIds,
        activityAt: nextActivity,
      };

      if (isScrolledDown && newlyDetectedIds.length > 0) {
        setPendingNewConvIds((prev) => Array.from(new Set([...prev, ...newlyDetectedIds])));
      } else if (!isScrolledDown) {
        setPendingNewConvIds((prev) => (prev.length > 0 ? [] : prev));
      }

      setConversations(data);
      setListError(null);
      setSelectedConversation((prev) => {
        if (targetConvIdRef.current) {
          const targeted = data.find((c) => c.id === targetConvIdRef.current);
          if (targeted) return targeted;
        }
        if (!prev) return null;
        return data.find((c) => c.id === prev.id) || null;
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
      wahaHistoryOffsetRef.current = 0;
      wahaHistoryExhaustedRef.current = false;
      setWahaHistoryExhausted(false);
    }
    try {
      const isVisible = typeof document === 'undefined' || document.visibilityState === 'visible';
      const page = await api.getConversationMessagesPage(convId, { markRead: isVisible, limit: 80 });
      if (activeConvIdRef.current !== convId) return;
      loadedMsgsConvIdRef.current = convId;
      if (!silent) {
        setMessages(page.items);
        setHasMoreMessages(page.hasMore);
      } else {
        setMessages((prev) => {
          const incomingIds = new Set(page.items.map((m) => m.id));
          const olderPreserved = prev.filter((m) => !incomingIds.has(m.id));
          const merged = [...olderPreserved, ...page.items];
          merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          return merged;
        });
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      if (!silent) {
        setLoadingMessages(false);
      }
    }
  }, [isLiveChatUnlocked]);

  const loadOlderMessages = useCallback(async () => {
    const convId = activeConvIdRef.current;
    if (!convId || loadingOlderMessagesRef.current) return;
    const isWhatsApp = (selectedConversation?.channel || 'WHATSAPP') === 'WHATSAPP';
    if (!hasMoreMessages && (!isWhatsApp || wahaHistoryExhaustedRef.current)) return;

    loadingOlderMessagesRef.current = true;
    setLoadingOlderMessages(true);
    const container = messagesContainerRef.current;
    if (container) {
      prependScrollAnchorRef.current = { top: container.scrollTop, height: container.scrollHeight };
    }

    try {
      const oldestCreatedAt = messages[0]?.createdAt;
      if (hasMoreMessages && oldestCreatedAt) {
        const page = await api.getConversationMessagesPage(convId, {
          markRead: false,
          limit: 50,
          before: oldestCreatedAt,
        });
        if (activeConvIdRef.current !== convId) return;
        setHasMoreMessages(page.hasMore);
        if (page.items.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const uniqueOlder = page.items.filter((m) => !existingIds.has(m.id));
            return uniqueOlder.length > 0 ? [...uniqueOlder, ...prev] : prev;
          });
        }
      } else if (isWhatsApp && !wahaHistoryExhaustedRef.current) {
        const offset = wahaHistoryOffsetRef.current;
        const syncRes = await api.syncConversationHistory(convId, { offset, limit: 50 });
        if (activeConvIdRef.current !== convId) return;
        wahaHistoryOffsetRef.current = offset + 50;
        if (!syncRes.hasMoreOnWaha) {
          wahaHistoryExhaustedRef.current = true;
          setWahaHistoryExhausted(true);
        }
        if (syncRes.inserted > 0) {
          const page = oldestCreatedAt
            ? await api.getConversationMessagesPage(convId, {
                markRead: false,
                limit: 50,
                before: oldestCreatedAt,
              })
            : await api.getConversationMessagesPage(convId, { markRead: false, limit: 80 });
          if (activeConvIdRef.current !== convId) return;
          if (page.items.length > 0) {
            setMessages((prev) => {
              const existingIds = new Set(prev.map((m) => m.id));
              const uniqueOlder = page.items.filter((m) => !existingIds.has(m.id));
              const merged = [...uniqueOlder, ...prev];
              merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
              return merged;
            });
          }
        }
      }
    } catch (err) {
      console.error('Error loading older messages:', err);
      prependScrollAnchorRef.current = null;
    } finally {
      loadingOlderMessagesRef.current = false;
      setLoadingOlderMessages(false);
    }
  }, [hasMoreMessages, messages, selectedConversation?.channel]);

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
      const isGroup = Boolean(d?.isGroup);
      const participantKey = String(d?.participantKey || '').trim();
      const participantName = String(d?.participantName || '').trim() || 'Anggota Grup';
      const participantAvatarUrl = d?.participantAvatarUrl ? String(d.participantAvatarUrl) : null;
      if (!convId) return;
      if (status === 'paused' || status === 'unavailable' || status === 'offline') {
        if (isGroup && participantKey) {
          setGroupPresenceByConvId((prev) => {
            const groupMap = prev[convId];
            if (!groupMap || !groupMap[participantKey]) return prev;
            const nextGroup = { ...groupMap };
            delete nextGroup[participantKey];
            const next = { ...prev };
            if (Object.keys(nextGroup).length === 0) {
              delete next[convId];
            } else {
              next[convId] = nextGroup;
            }
            return next;
          });
          return;
        }
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
        const expiresAt = Date.now() + ttlMs;
        if (isGroup && participantKey) {
          if (status === 'typing' || status === 'recording') {
            setGroupPresenceByConvId((prev) => ({
              ...prev,
              [convId]: {
                ...(prev[convId] || {}),
                [participantKey]: {
                  status,
                  name: participantName,
                  avatarUrl: participantAvatarUrl,
                  expiresAt,
                },
              },
            }));
          }
          return;
        }
        setPresenceByConvId((prev) => ({
          ...prev,
          [convId]: { status, expiresAt },
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
      setGroupPresenceByConvId((prev) => {
        const convKeys = Object.keys(prev);
        if (convKeys.length === 0) return prev;
        let changed = false;
        const next: typeof prev = {};
        for (const cId of convKeys) {
          const inner = prev[cId];
          const innerNext: (typeof prev)[string] = {};
          for (const pKey of Object.keys(inner)) {
            if (inner[pKey].expiresAt > now) {
              innerNext[pKey] = inner[pKey];
            } else {
              changed = true;
            }
          }
          if (Object.keys(innerNext).length > 0) {
            next[cId] = innerNext;
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
    api
      .getWahaPrivacy()
      .then((priv) => setWahaPrivacy(priv || null))
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
      setMessages([]);
      loadedMsgsConvIdRef.current = '';
      lastAutoScrollRef.current = { convId: '', lastMsgId: null };
      pendingInitialScrollRef.current = true;
      isAtBottomRef.current = true;
      setPendingNewMsgCount(0);
      setGroupInviteCode('');
      setGroupInviteLink('');
      setGroupInviteError(null);
      fetchMessages(selectedConversation.id, false);
      setContactNotesDraft(selectedConversation.contact?.notes || '');
      setChannelDisplayNameDraft(selectedConversation.channelDisplayName || '');
      setExcludeReasonDraft(selectedConversation.excludeReason || 'Bukan Customer');
      if (selectedConversation.isGroup || selectedConversation.externalThreadId?.endsWith('@g.us')) {
        void fetchParticipants(selectedConversation.id, true);
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
    setLabelFilter('ALL');
    setAssigneeFilter('ALL');
    setMetricFilter('ALL');
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
    if (!convId || loadedMsgsConvIdRef.current !== convId) return;

    if (highlightedCsatWindow && messages.length > 0) {
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
        pendingInitialScrollRef.current = false;
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

    if (pendingInitialScrollRef.current || prev.convId !== convId) {
      pendingInitialScrollRef.current = false;
      lastAutoScrollRef.current = { convId, lastMsgId };
      if (messages.length > 0) {
        scrollToBottom('auto');
        requestAnimationFrame(() => scrollToBottom('auto'));
        window.setTimeout(() => {
          if (activeConvIdRef.current === convId && isAtBottomRef.current) {
            scrollToBottom('auto');
          }
        }, 90);
      }
      return;
    }

    if (lastMsgId && prev.lastMsgId !== lastMsgId) {
      const prevIdx = prev.lastMsgId ? messages.findIndex((m) => m.id === prev.lastMsgId) : -1;
      const newMsgs =
        prevIdx >= 0 && prevIdx < messages.length - 1
          ? messages.slice(prevIdx + 1)
          : [messages[messages.length - 1]];
      lastAutoScrollRef.current = { convId, lastMsgId };

      const hasOutbound = newMsgs.some((m) => m.direction === 'OUTBOUND');
      if (hasOutbound || isAtBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom('smooth'));
      } else {
        setPendingNewMsgCount((c) => c + newMsgs.length);
      }
    }
  }, [messages, selectedConversation?.id, highlightedCsatWindow, scrollToBottom]);

  const updateFloatingDateLabel = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container || messages.length === 0) {
      setFloatingDateLabel('');
      return;
    }
    const containerTop = container.getBoundingClientRect().top;
    const nodes = container.querySelectorAll<HTMLElement>('[data-chat-date]');
    let detected = '';
    for (let i = 0; i < nodes.length; i++) {
      const rect = nodes[i].getBoundingClientRect();
      if (rect.bottom > containerTop + 12) {
        detected = nodes[i].getAttribute('data-chat-date') || '';
        break;
      }
    }
    if (!detected && messages.length > 0) {
      detected = formatChatDateLabel(messages[messages.length - 1].createdAt);
    }
    setFloatingDateLabel(detected);
  }, [messages]);

  useLayoutEffect(() => {
    const anchor = prependScrollAnchorRef.current;
    const container = messagesContainerRef.current;
    if (!anchor || !container) return;
    prependScrollAnchorRef.current = null;
    const delta = container.scrollHeight - anchor.height;
    container.scrollTop = delta > 0 ? anchor.top + delta : anchor.top;
  }, [messages]);

  const handleMessagesScroll = useCallback(() => {
    updateFloatingDateLabel();
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distanceFromBottom <= 100;
    isAtBottomRef.current = nearBottom;
    setIsAtChatBottom(nearBottom);
    if (nearBottom) {
      setPendingNewMsgCount(0);
    }
    if (container.scrollTop <= 60 && !loadingOlderMessagesRef.current) {
      const isWhatsApp = (selectedConversation?.channel || 'WHATSAPP') === 'WHATSAPP';
      if (hasMoreMessages || (isWhatsApp && !wahaHistoryExhaustedRef.current)) {
        void loadOlderMessages();
      }
    }
  }, [hasMoreMessages, loadOlderMessages, selectedConversation?.channel, updateFloatingDateLabel]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => updateFloatingDateLabel());
    return () => cancelAnimationFrame(raf);
  }, [updateFloatingDateLabel, selectedConversation?.id, messages.length]);

  const handleAttachmentPick = async (
    e: React.ChangeEvent<HTMLInputElement>,
    asDocument: boolean
  ) => {
    const fileList = Array.from(e.target.files || []);
    e.target.value = '';
    if (fileList.length === 0) return;

    const oversized = fileList.filter((f) => f.size > 10 * 1024 * 1024);
    if (oversized.length > 0) {
      toast.error(`Beberapa berkas melebihi batas 10 MB (${oversized.map((f) => f.name).join(', ')})`);
    }
    const validFiles = fileList.filter((f) => f.size <= 10 * 1024 * 1024);
    if (validFiles.length === 0) return;

    const newItems: PendingAttachmentItem[] = [];
    for (const file of validFiles) {
      const mime = inferAttachmentMime(file);
      const isImg = mime.startsWith('image/');
      const kind: 'image' | 'video' | 'audio' | 'document' = asDocument
        ? 'document'
        : isImg
        ? 'image'
        : mime.startsWith('video/')
        ? 'video'
        : mime.startsWith('audio/')
        ? 'audio'
        : 'document';

      if (!asDocument && isImg) {
        const { base64, size } = await processImageAttachment(file, isHdMode);
        newItems.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          file,
          base64,
          originalBase64: base64,
          mimetype: mime,
          name: file.name,
          size,
          kind: 'image',
          asDocument: false,
        });
      } else {
        const dataUri = await new Promise<string>((res) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result || ''));
          r.onerror = () => res('');
          r.readAsDataURL(file);
        });
        if (dataUri) {
          newItems.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            file,
            base64: dataUri,
            originalBase64: dataUri,
            mimetype: mime,
            name: file.name,
            size: file.size,
            kind,
            asDocument,
          });
        }
      }
    }

    if (newItems.length > 0) {
      setPendingAttachments((prev) => [...prev, ...newItems]);
      setComposerMode('REPLY');
    }
  };

  const handleToggleHdMode = async () => {
    const nextHd = !isHdMode;
    setIsHdMode(nextHd);
    if (pendingAttachments.some((item) => item.kind === 'image' && !item.asDocument && item.file)) {
      const updated = await Promise.all(
        pendingAttachments.map(async (item) => {
          if (item.kind === 'image' && !item.asDocument && item.file) {
            const { base64, size } = await processImageAttachment(item.file, nextHd);
            return { ...item, base64, size };
          }
          return item;
        })
      );
      setPendingAttachments(updated);
    }
    toast.info(
      nextHd
        ? 'Mode HD Aktif: Foto dikirim dalam kualitas tinggi resolusi asli'
        : 'Mode Standar Aktif: Foto dikompresi agar hemat kuota'
    );
  };

  const handleOpenMediaLibraryModal = (
    mode: 'CHAT_ATTACHMENT' | 'STICKER' | 'LINK_THUMBNAIL' | 'GROUP_AVATAR' = 'CHAT_ATTACHMENT'
  ) => {
    setShowComposerTools(false);
    setMediaPickerMode(mode);
  };

  const handleConfirmMediaPicker = async (
    picked: MediaLibraryItem[],
    options: { asDocument: boolean }
  ) => {
    if (picked.length === 0) return;
    const mode = mediaPickerMode;
    if (mode === 'STICKER') {
      const asset = picked[0];
      setSavingSticker(true);
      try {
        const { sticker, alreadyExists } = await api.saveSticker({
          name: (asset.originalFileName || asset.filename).replace(/\.[^.]+$/, '') || 'Stiker',
          mediaUrl: asset.relativeUrl,
        });
        setSavedStickers((prev) => [sticker, ...prev.filter((s) => s.id !== sticker.id)]);
        toast.success(
          alreadyExists ? 'Stiker sudah ada di koleksi Anda' : 'Stiker ditambahkan dari Galeri'
        );
      } catch (err: any) {
        toast.error(err?.response?.data?.error || 'Gagal menyimpan stiker dari Galeri');
      } finally {
        setSavingSticker(false);
      }
      return;
    }

    if (mode === 'LINK_THUMBNAIL') {
      const asset = picked[0];
      setLinkImageUrl(asset.url || asset.relativeUrl);
      toast.info(`Thumbnail dipilih: ${asset.originalFileName || asset.filename}`);
      return;
    }

    if (mode === 'GROUP_AVATAR') {
      if (!selectedConversation) return;
      const asset = picked[0];
      setSavingGroupInfo(true);
      try {
        const resp = await fetch(resolveCrmMediaUrl(asset.relativeUrl), { credentials: 'include' });
        if (!resp.ok) throw new Error('Gagal mengunduh berkas dari Galeri');
        const blob = await resp.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('Gagal membaca gambar dari Galeri'));
          reader.readAsDataURL(blob);
        });
        await api.updateGroupPicture(
          selectedConversation.id,
          base64,
          selectedSession || selectedConversation.wahaSession || undefined
        );
        toast.success('Foto profil grup berhasil diperbarui dari Galeri');
        void handleSyncConversationProfile();
      } catch (err: any) {
        toast.error(err?.response?.data?.error || err?.message || 'Gagal mengubah foto profil grup');
      } finally {
        setSavingGroupInfo(false);
      }
      return;
    }

    const nextItems: PendingAttachmentItem[] = picked.map((m) => ({
      id: `lib-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      mediaUrl: m.relativeUrl,
      previewUrl: m.mediaKind === 'image' ? resolveMediaUrl(m.relativeUrl) : undefined,
      mimetype: m.mimeType || 'application/octet-stream',
      name: m.originalFileName || m.filename,
      size: m.sizeBytes || 0,
      kind: m.mediaKind,
      asDocument: options.asDocument || m.mediaKind === 'document',
    }));
    if (nextItems.length > 0) {
      setPendingAttachments((prev) => [...prev, ...nextItems]);
      setComposerMode('REPLY');
    }
  };

  const openComposerPicker = (
    target:
      | 'EMOJI'
      | 'STICKER'
      | 'CANNED'
      | 'PRODUCT'
      | 'LINK'
      | 'INTERACTIVE'
      | 'LOCATION'
      | 'CONTACT'
      | 'MENTION'
      | null
  ) => {
    if (target === 'EMOJI') {
      setShowEmojiPicker((v) => !(v && emojiPickerTab === 'EMOJI'));
      setEmojiPickerTab('EMOJI');
    } else if (target === 'STICKER') {
      setShowEmojiPicker((v) => !(v && emojiPickerTab === 'STICKER'));
      setEmojiPickerTab('STICKER');
    } else {
      setShowEmojiPicker(false);
    }
    setShowCannedPicker((v) => (target === 'CANNED' ? !v : false));
    setShowProductPicker((v) => (target === 'PRODUCT' ? !v : false));
    setShowLinkComposer((v) => (target === 'LINK' ? !v : false));
    setShowInteractiveComposer((v) => (target === 'INTERACTIVE' ? !v : false));
    setShowLocationComposer((v) => (target === 'LOCATION' ? !v : false));
    setShowContactSharePicker((v) => (target === 'CONTACT' ? !v : false));
    setShowMentionPicker((v) => {
      if (target === 'MENTION' && !isCurrentConversationGroup) return false;
      const nextOpen = target === 'MENTION' ? !v : false;
      if (
        nextOpen &&
        isCurrentConversationGroup &&
        selectedConversation &&
        (!participantsData || participantsData.participants.length === 0 || participantsData.syncError)
      ) {
        void fetchParticipants(selectedConversation.id, true);
      }
      return nextOpen;
    });
    if (target === 'MENTION') {
      if (!isCurrentConversationGroup) return;
      setMentionFilter('');
      setMentionAnchorIndex(inputText.length);
    }
    if (target) setShowComposerTools(false);
  };

  const handleJumpToMessage = (replyToId?: string | null, replyToBody?: string | null) => {
    if (!replyToId && !replyToBody) return;
    const cleanBody = replyToBody?.trim();
    const target = messages.find(
      (m) =>
        (replyToId && (m.id === replyToId || m.wahaMessageId === replyToId)) ||
        (cleanBody && m.body && m.body.trim() === cleanBody)
    );
    const targetId = target ? target.id : replyToId;
    if (!targetId) return;

    const element = msgElementRefs.current[targetId];
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(targetId);
      setTimeout(() => {
        setHighlightedMessageId((curr) => (curr === targetId ? null : curr));
      }, 2000);
    } else {
      toast.info('Pesan yang dikutip belum termuat atau berada di luar riwayat');
    }
  };

  const participantsLookup = useMemo(() => {
    const map = new Map<string, ParticipantLookupEntry>();
    if (selectedConversation?.contact?.nomor_whatsapp) {
      const p = selectedConversation.contact.nomor_whatsapp.replace(/\D/g, '');
      if (p) {
        map.set(p, {
          name: selectedConversation.contact.nama_lengkap || `+${p}`,
          phone: p,
          contactId: selectedConversation.contact.id,
        });
      }
    }
    if (participantsData?.participants) {
      for (const part of participantsData.participants) {
        const p = part.phone ? part.phone.replace(/\D/g, '') : '';
        const entry: ParticipantLookupEntry = {
          name: part.contactName || part.name || (p ? `+${p}` : part.jid),
          phone: p || null,
          contactId: part.contactId || null,
          jid: part.jid || null,
          role: part.role || null,
          avatarUrl: part.avatarUrl || null,
        };
        if (p) {
          map.set(p, entry);
        }
        const jidToken = part.jid ? part.jid.replace(/@.*$/, '').toLowerCase() : '';
        if (jidToken && !map.has(jidToken)) {
          map.set(jidToken, entry);
        }
        if (part.name) {
          map.set(part.name.toLowerCase(), entry);
        }
      }
    }
    for (const m of messages) {
      const p = m.senderPhone ? m.senderPhone.replace(/\D/g, '') : '';
      const jidToken = m.senderJid ? m.senderJid.replace(/@.*$/, '').toLowerCase() : '';
      const fallbackEntry: ParticipantLookupEntry = {
        name: m.senderName || (p ? `+${p}` : jidToken),
        phone: p || null,
        jid: m.senderJid || null,
        avatarUrl: m.senderAvatarUrl || null,
      };
      if (p && !map.has(p)) {
        map.set(p, fallbackEntry);
      } else if (p && m.senderAvatarUrl && !map.get(p)?.avatarUrl) {
        const cur = map.get(p)!;
        map.set(p, { ...cur, avatarUrl: m.senderAvatarUrl });
      }
      if (jidToken && !map.has(jidToken)) {
        map.set(jidToken, fallbackEntry);
      }
    }
    return map;
  }, [selectedConversation, participantsData, messages]);

  // Contact Detail Modal (popup for mentions and group participants)
  const [selectedContactModalTarget, setSelectedContactModalTarget] = useState<ClickableMentionTarget | null>(null);
  const [modalContactData, setModalContactData] = useState<Contact | null>(null);
  const [loadingContactModal, setLoadingContactModal] = useState<boolean>(false);
  const [syncingModalContact, setSyncingModalContact] = useState<boolean>(false);
  const [savingModalContact, setSavingModalContact] = useState<boolean>(false);

  const handleOpenMentionContact = useCallback(
    (target: ClickableMentionTarget) => {
      setSelectedContactModalTarget(target);
    },
    []
  );

  useEffect(() => {
    if (!selectedContactModalTarget) {
      setModalContactData(null);
      return;
    }
    let active = true;
    setLoadingContactModal(true);

    const loadTargetContact = async () => {
      try {
        if (selectedContactModalTarget.contactId) {
          const c = await api.getContact(selectedContactModalTarget.contactId);
          if (active) {
            setModalContactData(c);
          }
          return;
        }

        const cleanPhone = selectedContactModalTarget.phone?.replace(/\D/g, '');
        if (cleanPhone && cleanPhone.length >= 6) {
          const res = await api.getContacts({ search: cleanPhone, limit: 10 });
          const list: Contact[] = res?.data || [];
          const exact = list.find((item: Contact) => item.nomor_whatsapp?.replace(/\D/g, '') === cleanPhone);
          if (active) {
            if (exact) {
              setModalContactData(exact);
            } else {
              setModalContactData({
                id: '',
                nama_lengkap: selectedContactModalTarget.name || `+${cleanPhone}`,
                nomor_whatsapp: cleanPhone,
                profile_picture_url: selectedContactModalTarget.avatarUrl || null,
                createdAt: '',
                updatedAt: '',
              });
            }
          }
          return;
        }

        if (active) {
          setModalContactData({
            id: '',
            nama_lengkap: selectedContactModalTarget.name || 'Kontak WhatsApp',
            nomor_whatsapp: selectedContactModalTarget.phone || '',
            profile_picture_url: selectedContactModalTarget.avatarUrl || null,
            createdAt: '',
            updatedAt: '',
          });
        }
      } catch (err) {
        console.error('Failed to load contact for modal:', err);
        if (active) {
          setModalContactData({
            id: selectedContactModalTarget.contactId || '',
            nama_lengkap: selectedContactModalTarget.name || 'Kontak WhatsApp',
            nomor_whatsapp: selectedContactModalTarget.phone || '',
            profile_picture_url: selectedContactModalTarget.avatarUrl || null,
            createdAt: '',
            updatedAt: '',
          });
        }
      } finally {
        if (active) {
          setLoadingContactModal(false);
        }
      }
    };

    void loadTargetContact();
    return () => {
      active = false;
    };
  }, [selectedContactModalTarget]);

  const handleStartDirectChatFromModal = async () => {
    if (!modalContactData && !selectedContactModalTarget) return;
    const contactId = modalContactData?.id || selectedContactModalTarget?.contactId || undefined;
    const phone = modalContactData?.nomor_whatsapp || selectedContactModalTarget?.phone || undefined;
    const name = modalContactData?.nama_lengkap || selectedContactModalTarget?.name || undefined;

    const chosenSession = (
      newChatSession.trim() ||
      selectedSession ||
      defaultWahaSession ||
      sessions.find((s) => s.status === 'WORKING')?.name ||
      sessions[0]?.name ||
      ''
    ).trim() || undefined;

    setOpeningContactId('modal_contact');
    try {
      let opened: Conversation;
      if (contactId) {
        opened = await api.openConversation(contactId, chosenSession);
      } else if (phone) {
        opened = await api.openConversation(undefined, chosenSession, phone, name);
      } else {
        toast.error('Tidak ada ID kontak atau nomor WhatsApp untuk membuka percakapan');
        return;
      }
      setSelectedContactModalTarget(null);
      setModalContactData(null);
      if (
        chosenSession &&
        accountFilter.startsWith('WA:') &&
        accountFilter.slice(3).toLowerCase() !== chosenSession.toLowerCase()
      ) {
        setAccountFilter('ALL');
      }
      const updated = await api.getConversations();
      setConversations(updated);
      const target = updated.find((c) => c.id === opened.id) || opened;
      setSelectedConversation(target);
      setSelectedSession(target.wahaSession || chosenSession || defaultWahaSession || '');
      toast.success(chosenSession ? `Percakapan dibuka via sesi ${chosenSession}` : 'Percakapan langsung dibuka');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal membuka percakapan langsung');
    } finally {
      setOpeningContactId(null);
    }
  };

  const handleSaveContactFromModal = async () => {
    const rawPhone = modalContactData?.nomor_whatsapp || selectedContactModalTarget?.phone || '';
    const cleanPhone = rawPhone.replace(/\D/g, '');
    const name =
      (modalContactData?.nama_lengkap || selectedContactModalTarget?.name || '').trim() ||
      (cleanPhone ? `Kontak +${cleanPhone}` : 'Kontak Baru');

    if (!cleanPhone) {
      toast.error('Nomor WhatsApp tidak valid untuk disimpan ke CRM');
      return;
    }
    setSavingModalContact(true);
    try {
      const created = await api.createContact({
        nama_lengkap: name,
        nomor_whatsapp: cleanPhone,
      });
      setModalContactData(created);
      toast.success(`Kontak "${created.nama_lengkap}" berhasil disimpan ke CRM`);

      const sessionToUse = selectedSession || defaultWahaSession || undefined;
      if (sessionToUse) {
        try {
          const syncRes = await api.syncContactProfile(created.id, sessionToUse);
          if (syncRes.contact) {
            setModalContactData(syncRes.contact);
          }
        } catch {
          // ignore profile sync error
        }
      }
      void fetchConversations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan kontak ke CRM');
    } finally {
      setSavingModalContact(false);
    }
  };

  const handleSyncModalContactProfile = async () => {
    if (!modalContactData?.id || syncingModalContact) return;
    setSyncingModalContact(true);
    try {
      const sessionToUse = selectedSession || defaultWahaSession || undefined;
      const res = await api.syncContactProfile(modalContactData.id, sessionToUse);
      if (res.contact) {
        setModalContactData(res.contact);
        toast.success('Profil WhatsApp kontak berhasil disinkronkan');
        void fetchConversations();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyinkronkan profil kontak dari WhatsApp');
    } finally {
      setSyncingModalContact(false);
    }
  };

  const handleCopyContactPhone = (num?: string | null) => {
    if (!num) return;
    const clean = num.replace(/\D/g, '');
    const textToCopy = clean ? `+${clean}` : num;
    navigator.clipboard.writeText(textToCopy);
    toast.success(`Nomor ${textToCopy} disalin ke clipboard`);
  };

  const handleOpenInContactsTab = () => {
    if (!onOpenContact) return;
    const payload = {
      contactId: modalContactData?.id || selectedContactModalTarget?.contactId,
      phone: modalContactData?.nomor_whatsapp || selectedContactModalTarget?.phone,
      name: modalContactData?.nama_lengkap || selectedContactModalTarget?.name,
    };
    setSelectedContactModalTarget(null);
    setModalContactData(null);
    onOpenContact(payload);
  };

  const handleSyncConversationProfile = async () => {
    if (!selectedConversation || syncingProfile) return;
    setSyncingProfile(true);
    try {
      const res = await api.syncConversationProfile(
        selectedConversation.id,
        selectedSession || undefined
      );
      const updatedList = await api.getConversations().catch(() => []);
      if (updatedList.length > 0) {
        setConversations(updatedList);
        const refreshed = updatedList.find((c) => c.id === selectedConversation.id);
        if (refreshed) setSelectedConversation(refreshed);
      } else {
        setSelectedConversation((prev) =>
          prev
            ? {
                ...prev,
                contact: {
                  ...prev.contact,
                  nama_lengkap: res.name || prev.contact.nama_lengkap,
                  profile_picture_url: res.profile_picture_url ?? prev.contact.profile_picture_url,
                  profile_about: res.profile_about ?? prev.contact.profile_about,
                },
              }
            : null
        );
      }
      toast.success(
        res.updated
          ? 'Profil WhatsApp berhasil diperbarui'
          : 'Profil WhatsApp sudah sesuai dengan data terbaru'
      );
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal menyinkronkan profil WhatsApp');
    } finally {
      setSyncingProfile(false);
    }
  };

  const resolveMessageSenderName = useCallback(
    (msg?: ChatMessage | null): string => {
      if (!msg) return 'Pesan sebelumnya';
      if (msg.direction === 'OUTBOUND') {
        return msg.senderName?.trim() || 'Tim CS';
      }
      const cleanPhone = msg.senderPhone ? msg.senderPhone.replace(/\D/g, '') : '';
      const jidPhone =
        msg.senderJid && !msg.senderJid.toLowerCase().endsWith('@lid')
          ? msg.senderJid.replace(/@.*$/, '').replace(/\D/g, '')
          : '';
      const lookupPhone = cleanPhone || jidPhone;
      const fromLookup = lookupPhone ? participantsLookup.get(lookupPhone)?.name : undefined;

      if (selectedConversation?.isGroup) {
        return (
          pickBestReplyDisplayName(
            fromLookup,
            msg.senderName,
            lookupPhone
          ) || 'Anggota Grup'
        );
      }

      return (
        pickBestReplyDisplayName(
          selectedConversation?.contact?.nama_lengkap,
          selectedConversation?.pushName || fromLookup || msg.senderName,
          lookupPhone || selectedConversation?.contact?.nomor_whatsapp
        ) || 'Pelanggan'
      );
    },
    [participantsLookup, selectedConversation]
  );

  const resolveReplySenderLabel = useCallback(
    (msg: ChatMessage): string => {
      if (msg.replyToSender && !isGenericReplySenderName(msg.replyToSender)) {
        return msg.replyToSender;
      }
      if (msg.replyToMessageId) {
        const quotedMsg = messages.find((m) => m.id === msg.replyToMessageId);
        if (quotedMsg) {
          return resolveMessageSenderName(quotedMsg);
        }
      }
      // If replyToSender is numeric or phone, try resolving against participantsLookup (contactName/pushName)
      if (msg.replyToSender) {
        const digits = msg.replyToSender.replace(/\D/g, '');
        const matchedPart = digits ? participantsLookup.get(digits) : undefined;
        if (matchedPart?.name) {
          return matchedPart.name;
        }
      }
      if (!selectedConversation?.isGroup) {
        const best = pickBestReplyDisplayName(
          selectedConversation?.contact?.nama_lengkap,
          selectedConversation?.pushName,
          selectedConversation?.contact?.nomor_whatsapp
        );
        if (best && !isGenericReplySenderName(best) && msg.replyToSender !== 'Tim CS') {
          return best;
        }
      }
      return msg.replyToSender || 'Pesan sebelumnya';
    },
    [messages, participantsLookup, resolveMessageSenderName, selectedConversation]
  );

  const handleConfirmForwardMessage = async () => {
    if (!forwardingMessage || !forwardTargetConvId || forwardingSending) return;
    const targetConv = conversations.find((c) => c.id === forwardTargetConvId);
    if (!targetConv) return;
    setForwardingSending(true);
    try {
      let sent: ChatMessage;
      try {
        // Native WAHA forward via backend endpoint
        sent = await api.forwardConversationMessage(targetConv.id, {
          sourceMessageId: forwardingMessage.id,
          targetConversationId: targetConv.id,
          session: selectedSession || targetConv.wahaSession || undefined,
        });
      } catch (nativeErr) {
        // Fallback to sending copy with forwarded metadata
        const fwdMeta = parseChatMessageMeta(forwardingMessage);
        const fromSenderLabel =
          fwdMeta?.forwardedFromSender || resolveMessageSenderName(forwardingMessage);
        const fallbackMentions = Array.from(
          new Set([
            ...(Array.isArray(fwdMeta?.mentions) ? fwdMeta.mentions : []),
            ...(Array.isArray(forwardingMessage.mentionedContacts)
              ? forwardingMessage.mentionedContacts
                  .map((mc) => mc.jid || (mc.phone ? `${mc.phone}@c.us` : ''))
                  .filter(Boolean)
              : []),
          ])
        );
        const payload: Parameters<typeof api.sendConversationMessage>[1] = {
          body: forwardingMessage.body || undefined,
          session: selectedSession || targetConv.wahaSession || undefined,
          isForwarded: true,
          forwardedFromSender: fromSenderLabel,
          forwardedFromChannel: fwdMeta?.forwardedFromChannel,
          ...(fallbackMentions.length > 0 ? { mentions: fallbackMentions } : {}),
        };
        if (forwardingMessage.mediaUrl) {
          payload.mediaUrl = forwardingMessage.mediaUrl;
          payload.mediaName = forwardingMessage.mediaName || undefined;
        }
        if (fwdMeta?.kind === 'LOCATION' && fwdMeta.location) {
          payload.messageKind = 'LOCATION';
          payload.location = fwdMeta.location;
        } else if (fwdMeta?.kind === 'CONTACT' && fwdMeta.sharedContacts?.length) {
          const mappedContacts = fwdMeta.sharedContacts
            .map((c) => ({
              fullName: c.fullName,
              phoneNumber: c.phones?.[0] || c.waId || '',
              organization: c.organization,
              email: c.email,
            }))
            .filter((c) => Boolean(c.phoneNumber));
          if (mappedContacts.length > 0) {
            payload.messageKind = 'CONTACT';
            payload.sharedContacts = mappedContacts;
          }
        } else if (fwdMeta?.kind === 'STICKER' && forwardingMessage.mediaUrl) {
          payload.messageKind = 'STICKER';
        }

        sent = await api.sendConversationMessage(targetConv.id, payload);
      }

      if (selectedConversation?.id === targetConv.id) {
        setMessages((prev) => [...prev, sent]);
      }
      toast.success(`Pesan diteruskan ke ${getConversationDisplayTitle(targetConv)}`);
      setForwardingMessage(null);
      setForwardTargetConvId('');
      void fetchConversations();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal meneruskan pesan');
    } finally {
      setForwardingSending(false);
    }
  };

  const availableMentionCandidates = useMemo(() => {
    const list: Array<{
      jid: string;
      phone: string;
      name: string;
      contactName?: string | null;
      role?: string;
    }> = [];
    const seen = new Set<string>();

    if (participantsData?.participants) {
      for (const p of participantsData.participants) {
        const key = p.phone || p.jid;
        if (key && !seen.has(key)) {
          seen.add(key);
          list.push({
            jid: p.jid,
            phone: p.phone || '',
            name: p.contactName || p.name || (p.phone ? `+${p.phone}` : 'Anggota'),
            contactName: p.contactName,
            role: p.role,
          });
        }
      }
    }

    for (const m of messages) {
      if (m.senderPhone || m.senderJid) {
        const key = m.senderPhone || m.senderJid || '';
        if (key && !seen.has(key)) {
          seen.add(key);
          list.push({
            jid: m.senderJid || `${m.senderPhone}@c.us`,
            phone: m.senderPhone || '',
            name: m.senderName || (m.senderPhone ? `+${m.senderPhone}` : 'Partisipan'),
          });
        }
      }
    }

    if (selectedConversation?.contact?.nomor_whatsapp) {
      const p = selectedConversation.contact.nomor_whatsapp.replace(/\D/g, '');
      if (p && !seen.has(p)) {
        seen.add(p);
        list.push({
          jid: `${p}@c.us`,
          phone: p,
          name: selectedConversation.contact.nama_lengkap || `+${p}`,
          contactName: selectedConversation.contact.nama_lengkap,
        });
      }
    }

    if (!mentionFilter) return list;
    const q = mentionFilter.toLowerCase();
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.contactName && c.contactName.toLowerCase().includes(q))
    );
  }, [participantsData, messages, selectedConversation, mentionFilter]);

  const handleSelectMention = (candidate: { phone?: string; name?: string; jid?: string }) => {
    const cleanPhone = candidate.phone ? candidate.phone.replace(/\D/g, '') : '';
    const lidDigits =
      !cleanPhone && candidate.jid && candidate.jid.toLowerCase().endsWith('@lid')
        ? candidate.jid.replace(/@.*$/, '').replace(/\D/g, '')
        : '';
    const token = cleanPhone
      ? `@${cleanPhone} `
      : lidDigits
      ? `@${lidDigits} `
      : candidate.name
      ? `@${candidate.name.replace(/\s+/g, '_')} `
      : '';
    if (!token) return;

    const cursorPos = replyInputRef.current?.selectionStart ?? inputText.length;
    const anchor = mentionAnchorIndex !== null && mentionAnchorIndex !== -1 ? mentionAnchorIndex : inputText.lastIndexOf('@');
    let nextText: string;
    if (anchor !== -1 && anchor <= cursorPos) {
      nextText = inputText.slice(0, anchor) + token + inputText.slice(cursorPos);
    } else {
      nextText = inputText + (inputText && !inputText.endsWith(' ') ? ' ' : '') + token;
    }
    setInputText(nextText);
    setShowMentionPicker(false);
    setMentionFilter('');
    setMentionAnchorIndex(null);

    setTimeout(() => {
      replyInputRef.current?.focus();
    }, 50);
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

    // Detect @ mention trigger while typing (group chats only)
    if (isCurrentConversationGroup) {
      const cursorPos = replyInputRef.current?.selectionStart ?? nextVal.length;
      const textBeforeCursor = nextVal.slice(0, cursorPos);
      const lastAt = textBeforeCursor.lastIndexOf('@');
      if (lastAt !== -1 && (lastAt === 0 || /\s/.test(textBeforeCursor[lastAt - 1]))) {
        const query = textBeforeCursor.slice(lastAt + 1);
        if (!/\s/.test(query) && query.length <= 25) {
          setMentionFilter(query.toLowerCase());
          setMentionAnchorIndex(lastAt);
          if (
            !showMentionPicker &&
            selectedConversation &&
            (!participantsData || participantsData.participants.length === 0 || participantsData.syncError)
          ) {
            void fetchParticipants(selectedConversation.id, true);
          }
          setShowMentionPicker(true);
        } else {
          setShowMentionPicker(false);
        }
      } else if (showMentionPicker && !mentionFilter) {
        // Keep open if opened explicitly via toolbar button
      } else {
        setShowMentionPicker(false);
      }
    } else {
      setShowMentionPicker(false);
    }

    if (
      !selectedConversation ||
      composerMode !== 'REPLY' ||
      ((selectedConversation.channel || 'WHATSAPP').toUpperCase() !== 'WHATSAPP')
    ) {
      return;
    }
    const activePrivacySession = selectedSession || selectedConversation.wahaSession || '';
    const sessionPrivacyOverride = activePrivacySession ? wahaPrivacy?.sessions?.[activePrivacySession] : undefined;
    const allowOnlinePresence =
      typeof sessionPrivacyOverride?.sendOnlinePresence === 'boolean'
        ? sessionPrivacyOverride.sendOnlinePresence
        : wahaPrivacy?.general?.sendOnlinePresence ?? true;
    if (!allowOnlinePresence) {
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

    if (!text && pendingAttachments.length === 0) return;
    stopOutboundTyping(selectedConversation.id);
    setSending(true);
    try {
      const textMentions = Array.from(text.matchAll(/@\+?(\d{6,20})/g)).map((m) => {
        const d = m[1];
        const part = participantsLookup.get(d);
        if (part?.jid) return part.jid;
        return d.length >= 14 ? `${d}@lid` : `${d}@c.us`;
      });

      if (pendingAttachments.length === 0) {
        const newMsg = await api.sendConversationMessage(selectedConversation.id, {
          body: text,
          session: selectedSession || undefined,
          replyToMessageId: replyingToMessage?.id,
          mentions: textMentions.length > 0 ? textMentions : undefined,
        });
        setMessages((prev) => [...prev, newMsg]);
        if (newMsg.status === 'FAILED' || newMsg.ackStatus < 0) {
          toast.error(newMsg.errorMessage || 'Gagal mengirim pesan WhatsApp');
        }
      } else {
        const total = pendingAttachments.length;
        const sentList: ChatMessage[] = [];
        for (let idx = 0; idx < total; idx++) {
          const item = pendingAttachments[idx];
          const isFirst = idx === 0;
          const msgCaption = isFirst ? text : '';
          setSendingProgress({ current: idx + 1, total });
          const newMsg = await api.sendConversationMessage(selectedConversation.id, {
            body: msgCaption,
            session: selectedSession || undefined,
            mediaBase64: item.base64,
            mediaUrl: !item.base64 ? item.mediaUrl : undefined,
            mediaMimetype: item.mimetype,
            mediaName: item.name,
            replyToMessageId: isFirst ? replyingToMessage?.id : undefined,
            mentions: isFirst && textMentions.length > 0 ? textMentions : undefined,
            asDocument: item.asDocument,
            isHd: !item.asDocument && item.kind === 'image' && isHdMode,
          });
          sentList.push(newMsg);
          if (newMsg.status === 'FAILED' || newMsg.ackStatus < 0) {
            toast.error(newMsg.errorMessage || `Gagal mengirim ${item.name}`);
          }
        }
        setMessages((prev) => [...prev, ...sentList]);
      }

      setInputText('');
      setPendingAttachments([]);
      setSendingProgress(null);
      setReplyingToMessage(null);
      setShowEmojiPicker(false);
      setShowMentionPicker(false);
      setMentionFilter('');
      setMentionAnchorIndex(null);
      void fetchConversations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengirim pesan WhatsApp');
    } finally {
      setSending(false);
      setSendingProgress(null);
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

  const [deleteMessageTarget, setDeleteMessageTarget] = useState<ChatMessage | null>(null);
  const [deletingMessageScope, setDeletingMessageScope] = useState<'ME' | 'EVERYONE' | null>(null);

  const handleDeleteConversationMessage = async (scope: 'ME' | 'EVERYONE') => {
    if (!selectedConversation || !deleteMessageTarget || deletingMessageScope) return;
    setDeletingMessageScope(scope);
    try {
      await api.deleteConversationMessage(
        selectedConversation.id,
        deleteMessageTarget.id,
        scope,
        selectedSession || undefined
      );
      const targetId = deleteMessageTarget.id;
      const nowIso = new Date().toISOString();
      const currentActorName = currentUser?.name || 'CS';

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== targetId) return m;
          const prevMeta = parseChatMessageMeta(m) || {};
          return {
            ...m,
            metadataJson: JSON.stringify({
              ...prevMeta,
              revoked: true,
              revokeScope: scope,
              revokedAt: nowIso,
              revokedBy: currentActorName,
            }),
          };
        })
      );
      if (replyingToMessage?.id === targetId) {
        setReplyingToMessage(null);
      }
      setDeleteMessageTarget(null);
      toast.success(
        scope === 'EVERYONE'
          ? 'Pesan berhasil ditarik dari WhatsApp dan ditandai ditarik di CRM'
          : 'Pesan ditandai dihapus pada riwayat CRM'
      );
      void fetchConversations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menghapus pesan');
    } finally {
      setDeletingMessageScope(null);
    }
  };

  const handleInsertEmoji = (char: string) => {
    setRecentEmojis(pushRecentEmoji(char));
    setInputText((prev) => prev + char);
  };

  const handleReactMessage = async (msgId: string, emoji: string) => {
    if (!selectedConversation || reactingMsgId) return;
    setReactingMsgId(msgId);
    try {
      const updated = await api.reactToConversationMessage(
        selectedConversation.id,
        msgId,
        emoji,
        selectedSession || undefined
      );
      setMessages((prev) => prev.map((m) => (m.id === msgId ? updated : m)));
      setActiveReactionMsgId(null);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengirim reaksi emoji');
    } finally {
      setReactingMsgId(null);
    }
  };

  const handleSendPresetSticker = async (tpl: PresetStickerTemplate) => {
    if (!isLiveChatUnlocked || !selectedConversation || sending) return;
    setSending(true);
    try {
      const webpData = await renderPresetStickerToWebp(tpl);
      const newMsg = await api.sendConversationMessage(selectedConversation.id, {
        messageKind: 'STICKER',
        mediaBase64: webpData,
        mediaMimetype: webpData.startsWith('data:image/webp') ? 'image/webp' : 'image/png',
        mediaName: `${tpl.id}.webp`,
        session: selectedSession || undefined,
        replyToMessageId: replyingToMessage?.id,
      });
      setReplyingToMessage(null);
      setShowEmojiPicker(false);
      setMessages((prev) => [...prev, newMsg]);
      if (newMsg.status === 'FAILED' || newMsg.ackStatus < 0) {
        toast.error(newMsg.errorMessage || 'Gagal mengirim stiker');
      }
      void fetchConversations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengirim stiker');
    } finally {
      setSending(false);
    }
  };

  const handleSendSavedSticker = async (sticker: SavedStickerItem) => {
    if (!isLiveChatUnlocked || !selectedConversation || sending) return;
    setSending(true);
    try {
      const newMsg = await api.sendConversationMessage(selectedConversation.id, {
        messageKind: 'STICKER',
        mediaUrl: sticker.mediaUrl,
        mediaName: `${sticker.name || 'sticker'}.webp`,
        session: selectedSession || undefined,
        replyToMessageId: replyingToMessage?.id,
      });
      setReplyingToMessage(null);
      setShowEmojiPicker(false);
      setMessages((prev) => [...prev, newMsg]);
      if (newMsg.status === 'FAILED' || newMsg.ackStatus < 0) {
        toast.error(newMsg.errorMessage || 'Gagal mengirim stiker');
      }
      void fetchConversations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengirim stiker');
    } finally {
      setSending(false);
    }
  };

  const handleUploadNewSticker = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || savingSticker) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran file stiker maksimal 5 MB');
      return;
    }
    setSavingSticker(true);
    try {
      const { dataUri, mimetype } = await convertImageFileToStickerWebp(file);
      const { sticker } = await api.saveSticker({
        name: file.name.replace(/\.[^.]+$/, '') || 'Stiker',
        mediaBase64: dataUri,
        mimetype,
      });
      setSavedStickers((prev) => [sticker, ...prev.filter((s) => s.id !== sticker.id)]);
      toast.success('Stiker ditambahkan ke koleksi dan siap dikirim');
    } catch (err: any) {
      toast.error(err.response?.data?.error || err?.message || 'Gagal mengunggah stiker');
    } finally {
      setSavingSticker(false);
    }
  };

  const handleSaveInboundSticker = async (msg: ChatMessage) => {
    if (!msg.mediaUrl || savingMsgStickerId) return;
    setSavingMsgStickerId(msg.id);
    try {
      const { sticker, alreadyExists } = await api.saveSticker({
        name: msg.mediaName?.replace(/\.[^.]+$/, '') || `Stiker ${savedStickers.length + 1}`,
        mediaUrl: msg.mediaUrl,
      });
      setSavedStickers((prev) => [sticker, ...prev.filter((s) => s.id !== sticker.id)]);
      toast.success(alreadyExists ? 'Stiker sudah ada di koleksi Anda' : 'Stiker disimpan ke koleksi');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan stiker');
    } finally {
      setSavingMsgStickerId(null);
    }
  };

  const handleDeleteSavedSticker = async (stickerId: string) => {
    try {
      await api.deleteSticker(stickerId);
      setSavedStickers((prev) => prev.filter((s) => s.id !== stickerId));
      toast.info('Stiker dihapus dari koleksi');
    } catch {
      toast.error('Gagal menghapus stiker');
    }
  };

  const handleSaveOrChatSharedContact = async (
    sc: SharedContactMetadataItem,
    openChat: boolean
  ) => {
    const rawPhone = sc.phones?.[0] || sc.waId || '';
    if (!rawPhone) {
      toast.error('Nomor telepon tidak tersedia pada kartu kontak ini');
      return;
    }
    const key = `${openChat ? 'chat' : 'save'}:${rawPhone}`;
    setSavingSharedContactKey(key);
    try {
      const res = await api.saveSharedContact({
        fullName: sc.fullName,
        phoneNumber: rawPhone,
        organization: sc.organization,
        openConversation: openChat,
        session: selectedSession || undefined,
      });
      setSavedSharedPhones((prev) => ({ ...prev, [rawPhone]: true }));
      if (openChat && res.conversation) {
        const list = await api.getConversations().catch(() => []);
        const target = list.find((c) => c.id === res.conversation?.id) || null;
        if (list.length > 0) setConversations(list);
        if (target) {
          setSelectedConversation(target);
        }
        toast.success(`Membuka percakapan dengan ${res.contact.nama_lengkap}`);
      } else {
        toast.success(
          res.createdNew
            ? `Kontak "${res.contact.nama_lengkap}" disimpan ke CRM`
            : `Kontak "${res.contact.nama_lengkap}" sudah terdaftar di CRM`
        );
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal memproses kontak yang dibagikan');
    } finally {
      setSavingSharedContactKey(null);
    }
  };

  const parseMapsUrlInput = (raw: string) => {
    setLocMapUrlInput(raw);
    const match =
      raw.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/) ||
      raw.match(/[?&](?:q|ll)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (match) {
      setLocLat(match[1]);
      setLocLng(match[2]);
    }
  };

  const handleDetectCurrentGeo = () => {
    if (!navigator?.geolocation) {
      toast.error('Browser tidak mendukung deteksi GPS lokasi');
      return;
    }
    setLoadingGeo(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocLat(pos.coords.latitude.toFixed(6));
        setLocLng(pos.coords.longitude.toFixed(6));
        setLoadingGeo(false);
        toast.success('Koordinat GPS saat ini berhasil diambil');
      },
      (geoErr) => {
        setLoadingGeo(false);
        toast.error(geoErr?.message || 'Gagal mengambil koordinat lokasi dari browser');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSendLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLiveChatUnlocked || !selectedConversation || sending) return;
    const lat = Number(locLat);
    const lng = Number(locLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error('Koordinat latitude & longitude tidak valid');
      return;
    }
    setSending(true);
    try {
      const newMsg = await api.sendConversationMessage(selectedConversation.id, {
        messageKind: 'LOCATION',
        session: selectedSession || undefined,
        replyToMessageId: replyingToMessage?.id,
        location: {
          latitude: lat,
          longitude: lng,
          name: locName.trim() || undefined,
          address: locAddress.trim() || undefined,
        },
      });
      setMessages((prev) => [...prev, newMsg]);
      setShowLocationComposer(false);
      setLocName('');
      setLocAddress('');
      setLocMapUrlInput('');
      setReplyingToMessage(null);
      if (newMsg.status === 'FAILED' || newMsg.ackStatus < 0) {
        toast.error(newMsg.errorMessage || 'Gagal mengirim lokasi');
      }
      void fetchConversations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengirim lokasi');
    } finally {
      setSending(false);
    }
  };

  const loadShareableContacts = useCallback(async (q: string) => {
    setLoadingContactShareList(true);
    try {
      const res = await api.getContacts({ search: q.trim() || undefined, limit: 30 });
      setContactShareList((res.data || []).filter((c) => Boolean(c.nomor_whatsapp)));
    } catch {
      setContactShareList([]);
    } finally {
      setLoadingContactShareList(false);
    }
  }, []);

  useEffect(() => {
    if (!showContactSharePicker) return;
    const t = setTimeout(() => {
      void loadShareableContacts(contactShareSearch);
    }, 200);
    return () => clearTimeout(t);
  }, [showContactSharePicker, contactShareSearch, loadShareableContacts]);

  const handleSendSharedContact = async (c: Contact) => {
    if (!isLiveChatUnlocked || !selectedConversation || sending || !c.nomor_whatsapp) return;
    setSending(true);
    try {
      const newMsg = await api.sendConversationMessage(selectedConversation.id, {
        messageKind: 'CONTACT',
        session: selectedSession || undefined,
        replyToMessageId: replyingToMessage?.id,
        sharedContacts: [
          {
            fullName: c.nama_lengkap,
            phoneNumber: c.nomor_whatsapp,
            organization: c.kategori || undefined,
          },
        ],
      });
      setMessages((prev) => [...prev, newMsg]);
      setShowContactSharePicker(false);
      setReplyingToMessage(null);
      if (newMsg.status === 'FAILED' || newMsg.ackStatus < 0) {
        toast.error(newMsg.errorMessage || 'Gagal membagikan kontak');
      }
      void fetchConversations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal membagikan kontak');
    } finally {
      setSending(false);
    }
  };

  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatSession, setNewChatSession] = useState<string>('');
  const [loadingNewChatSessions, setLoadingNewChatSessions] = useState(false);
  const [contactsList, setContactsList] = useState<Contact[]>([]);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [contactSearch, setContactSearch] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [openingContactId, setOpeningContactId] = useState<string | null>(null);
  const [convDisplayLimit, setConvDisplayLimit] = useState(100);

  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSearch, setMergeSearch] = useState('');
  const [mergingContactId, setMergingContactId] = useState<string | null>(null);

  const mySessionPhones = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) {
      if (s.me?.id) {
        const p = s.me.id.replace(/@.*$/, '').replace(/:\d+$/, '').replace(/\D/g, '');
        if (p) set.add(p);
      }
    }
    return set;
  }, [sessions]);

  const contactsByPhone = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of conversations) {
      if (c.contact?.nomor_whatsapp) {
        const p = c.contact.nomor_whatsapp.replace(/\D/g, '');
        if (p) map.set(p, c.contact.nama_lengkap || c.contact.nama_panggilan || p);
      }
    }
    for (const c of contactsList) {
      if (c.nomor_whatsapp) {
        const p = c.nomor_whatsapp.replace(/\D/g, '');
        if (p && !map.has(p)) map.set(p, c.nama_lengkap || c.nama_panggilan || p);
      }
    }
    return map;
  }, [conversations, contactsList]);

  const [activePinIndex, setActivePinIndex] = useState<number>(0);
  const [showPinAllDropdown, setShowPinAllDropdown] = useState<boolean>(false);
  const [pinningMessageTarget, setPinningMessageTarget] = useState<ChatMessage | null>(null);
  const [pinDurationSeconds, setPinDurationSeconds] = useState<number>(604800); // 7 days default
  const [submittingPin, setSubmittingPin] = useState<boolean>(false);

  const pinnedMessages = useMemo(() => {
    const now = Date.now();
    return messages.filter((m) => {
      const meta = parseChatMessageMeta(m);
      if (!meta?.isPinned) return false;
      if (meta.pinExpiresAt) {
        const exp = new Date(meta.pinExpiresAt).getTime();
        if (!isNaN(exp) && exp < now) return false;
      }
      return true;
    });
  }, [messages]);

  useEffect(() => {
    if (activePinIndex >= pinnedMessages.length && pinnedMessages.length > 0) {
      setActivePinIndex(pinnedMessages.length - 1);
    }
  }, [pinnedMessages.length, activePinIndex]);

  const handleOpenAvatarLightbox = (picUrl?: string | null, name?: string) => {
    if (!picUrl) return;
    setLightboxMedia({
      url: resolveMediaUrl(picUrl),
      name: name ? `Foto Profil - ${name}` : 'Foto Profil',
    });
  };

  const handleStartPinMessage = (msg: ChatMessage) => {
    const meta = parseChatMessageMeta(msg);
    if (meta?.isPinned) {
      void handleUnpinMessage(msg);
    } else {
      setPinningMessageTarget(msg);
      setPinDurationSeconds(604800);
    }
  };

  const handleUnpinMessage = async (msg: ChatMessage) => {
    if (!selectedConversation) return;
    try {
      const res = await api.pinConversationMessage(selectedConversation.id, msg.id, { unpin: true });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? {
                ...m,
                ...res.data,
                mentionedContacts:
                  res.data.mentionedContacts && res.data.mentionedContacts.length > 0
                    ? res.data.mentionedContacts
                    : m.mentionedContacts,
              }
            : m
        )
      );
      if (res.warning) {
        toast.info(res.warning);
      } else {
        toast.success('Sematan pesan dilepas');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal melepas sematan pesan');
    }
  };

  const handleConfirmPinMessage = async () => {
    if (!selectedConversation || !pinningMessageTarget || submittingPin) return;
    setSubmittingPin(true);
    try {
      const res = await api.pinConversationMessage(selectedConversation.id, pinningMessageTarget.id, {
        duration: pinDurationSeconds,
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pinningMessageTarget.id
            ? {
                ...m,
                ...res.data,
                mentionedContacts:
                  res.data.mentionedContacts && res.data.mentionedContacts.length > 0
                    ? res.data.mentionedContacts
                    : m.mentionedContacts,
              }
            : m
        )
      );
      if (res.warning) {
        toast.info(res.warning);
      } else {
        toast.success('Pesan berhasil disematkan');
      }
      setPinningMessageTarget(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal menyematkan pesan');
    } finally {
      setSubmittingPin(false);
    }
  };

  const handleTogglePinMessage = async (msg: ChatMessage) => {
    handleStartPinMessage(msg);
  };

  const handleToggleStarMessage = async (msg: ChatMessage) => {
    if (!selectedConversation) return;
    try {
      const res = await api.starConversationMessage(selectedConversation.id, msg.id);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? {
                ...m,
                ...res.data,
                mentionedContacts:
                  res.data.mentionedContacts && res.data.mentionedContacts.length > 0
                    ? res.data.mentionedContacts
                    : m.mentionedContacts,
              }
            : m
        )
      );
      if (res.warning) {
        toast.info(res.warning);
      } else {
        toast.success(res.isStarred ? 'Pesan dibintangi' : 'Bintang pesan dihapus');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal mengubah bintang pesan');
    }
  };

  const loadQuickMemberContacts = useCallback(
    async (opts?: { search?: string; page?: number; limit?: number }) => {
      const targetPage = opts?.page ?? quickMemberPage;
      const targetLimit = opts?.limit ?? quickMemberLimit;
      const targetSearch = opts?.search ?? quickMemberSearch;
      setLoadingQuickMemberContacts(true);
      try {
        const res = await api.getContacts({
          search: targetSearch.trim() || undefined,
          hasWhatsapp: true,
          page: targetPage,
          limit: targetLimit,
        });
        const list = (Array.isArray(res) ? res : res?.data || []).filter((c) => Boolean(c.nomor_whatsapp));
        const pagination = !Array.isArray(res) ? res?.pagination : undefined;
        setQuickMemberContacts(list);
        setQuickMemberTotal(pagination?.total ?? list.length);
        setQuickMemberTotalPages(Math.max(1, pagination?.totalPages ?? 1));
      } catch {
        toast.error('Gagal memuat daftar kontak CRM');
      } finally {
        setLoadingQuickMemberContacts(false);
      }
    },
    [quickMemberPage, quickMemberLimit, quickMemberSearch, toast]
  );

  useEffect(() => {
    if (!showGroupManageModal || groupManageTab !== 'ADD_MEMBER') return;
    const delay = quickMemberSearch.trim() ? 250 : 0;
    const timer = window.setTimeout(() => {
      void loadQuickMemberContacts({
        search: quickMemberSearch,
        page: quickMemberPage,
        limit: quickMemberLimit,
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    showGroupManageModal,
    groupManageTab,
    quickMemberSearch,
    quickMemberPage,
    quickMemberLimit,
    loadQuickMemberContacts,
  ]);

  const handleOpenGroupManageModal = (initialTab: 'INFO' | 'INVITE' | 'ADD_MEMBER' = 'INFO') => {
    if (!selectedConversation || !selectedConversation.isGroup) return;
    setGroupManageTab(initialTab);
    setGroupSubjectDraft(selectedConversation.contact?.nama_lengkap || '');
    setGroupDescDraft(selectedConversation.contact?.profile_about || '');
    setGroupInviteError(null);
    setQuickMemberSearch('');
    setQuickMemberPage(1);
    setShowGroupManageModal(true);
    if (initialTab === 'INVITE') {
      void fetchGroupInvite();
    }
  };

  const fetchGroupInvite = async () => {
    if (!selectedConversation) return;
    setLoadingGroupInvite(true);
    setGroupInviteError(null);
    try {
      const res = await api.getGroupInviteCode(
        selectedConversation.id,
        selectedSession || selectedConversation.wahaSession || undefined
      );
      setGroupInviteCode(res.code || '');
      setGroupInviteLink(res.link || (res.code ? `https://chat.whatsapp.com/${res.code}` : ''));
    } catch (err: any) {
      const errMsg = err?.response?.data?.error || 'Gagal mengambil tautan undangan grup';
      setGroupInviteError(errMsg);
      toast.error(errMsg);
    } finally {
      setLoadingGroupInvite(false);
    }
  };

  const handleRevokeGroupInvite = async () => {
    if (!selectedConversation) return;
    setLoadingGroupInvite(true);
    setGroupInviteError(null);
    try {
      const res = await api.revokeGroupInviteCode(
        selectedConversation.id,
        selectedSession || selectedConversation.wahaSession || undefined
      );
      setGroupInviteCode(res.code || '');
      setGroupInviteLink(res.link || (res.code ? `https://chat.whatsapp.com/${res.code}` : ''));
      toast.success('Tautan undangan lama ditarik dan tautan baru dibuat');
    } catch (err: any) {
      const errMsg = err?.response?.data?.error || 'Gagal memperbarui tautan undangan';
      setGroupInviteError(errMsg);
      toast.error(errMsg);
    } finally {
      setLoadingGroupInvite(false);
    }
  };

  const handleSaveGroupInfo = async () => {
    if (!selectedConversation || savingGroupInfo) return;
    const nextSubject = groupSubjectDraft.trim();
    const nextDesc = groupDescDraft.trim();
    const prevSubject = (selectedConversation.contact?.nama_lengkap || '').trim();
    const prevDesc = (selectedConversation.contact?.profile_about || '').trim();

    if (!nextSubject) {
      toast.error('Nama grup tidak boleh kosong');
      return;
    }

    const subjectChanged = nextSubject !== prevSubject;
    const descChanged = nextDesc !== prevDesc;
    if (!subjectChanged && !descChanged) {
      toast.info('Tidak ada perubahan nama atau deskripsi grup');
      return;
    }

    const session = selectedSession || selectedConversation.wahaSession || undefined;
    setSavingGroupInfo(true);
    try {
      if (subjectChanged) {
        await api.updateGroupSubject(selectedConversation.id, nextSubject, session);
      }
      if (descChanged) {
        await api.updateGroupDescription(selectedConversation.id, nextDesc, session);
      }
      setSelectedConversation((prev) =>
        prev
          ? {
              ...prev,
              contextTitle: subjectChanged ? nextSubject : prev.contextTitle,
              contact: {
                ...prev.contact,
                nama_lengkap: subjectChanged ? nextSubject : prev.contact.nama_lengkap,
                profile_about: descChanged ? nextDesc : prev.contact.profile_about,
              },
            }
          : null
      );
      toast.success('Informasi grup berhasil diperbarui');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal memperbarui informasi grup');
    } finally {
      setSavingGroupInfo(false);
    }
  };

  const handleAddGroupMember = async () => {
    if (!selectedConversation || !newMemberPhone.trim() || addingMember) return;
    const clean = newMemberPhone.replace(/\D/g, '');
    if (!clean || clean.length < 7) {
      toast.error('Masukkan nomor WhatsApp yang valid (contoh: 628123456789)');
      return;
    }
    setAddingMember(true);
    try {
      await api.addGroupParticipants(
        selectedConversation.id,
        [clean],
        selectedSession || selectedConversation.wahaSession || undefined
      );
      toast.success(`Anggota +${clean} berhasil ditambahkan`);
      setNewMemberPhone('');
      void fetchParticipants(selectedConversation.id, true);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal menambahkan anggota ke grup');
    } finally {
      setAddingMember(false);
    }
  };

  // Agent assignment & Canned responses
  const [assignableAgents, setAssignableAgents] = useState<
    Array<{ id: string; name: string; email: string; role: string }>
  >([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string>('ALL');
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
      const [agentsData, cannedData, labelsData, stickerCatalog] = await Promise.all([
        api.getAssignableAgents().catch(() => []),
        api.getCannedResponses(true).catch(() => []),
        api.getMasterLabels('CONVERSATION_LABEL', true).catch(() => []),
        api.getStickerCatalog().catch(() => ({ saved: [], whatsappStickers: [] })),
      ]);
      setAssignableAgents(agentsData || []);
      setCannedList(cannedData || []);
      setMasterLabels(labelsData || []);
      setSavedStickers(stickerCatalog.saved || []);
      setWhatsappStickers(stickerCatalog.whatsappStickers || []);
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

  const loadModalContacts = useCallback(
    async (query?: string) => {
      setLoadingContacts(true);
      try {
        const res = await api.getContacts({
          search: query?.trim() || undefined,
          limit: 200,
        });
        const list = Array.isArray(res) ? res : res?.data || [];
        setContactsList(list);
        setContactsTotal(
          Array.isArray(res) ? list.length : (res?.pagination?.total ?? list.length)
        );
      } catch {
        toast.error('Gagal memuat daftar kontak');
      } finally {
        setLoadingContacts(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    if (!showNewChatModal) return;
    const delay = contactSearch.trim() ? 250 : 0;
    const timer = window.setTimeout(() => {
      void loadModalContacts(contactSearch);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [showNewChatModal, contactSearch, loadModalContacts]);

  useEffect(() => {
    if (!showMergeModal) return;
    const delay = mergeSearch.trim() ? 250 : 0;
    const timer = window.setTimeout(() => {
      void loadModalContacts(mergeSearch);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [showMergeModal, mergeSearch, loadModalContacts]);

  useEffect(() => {
    setConvDisplayLimit(100);
  }, [search, statusFilter, chatTypeFilter, metricFilter, channelFilter, accountFilter, assigneeFilter, labelFilter]);

  const handleOpenNewChatModal = async () => {
    setContactSearch('');
    const filterSession = accountFilter.startsWith('WA:') ? accountFilter.slice(3).trim() : '';
    const pickInitialSession = (list: WahaSessionItem[]) => {
      if (filterSession && list.some((s) => s.name === filterSession)) return filterSession;
      if (list.length === 1) return list[0].name;
      return '';
    };
    setNewChatSession(pickInitialSession(sessions));
    setShowNewChatModal(true);
    setLoadingNewChatSessions(true);
    try {
      const res = await api.getWahaSessions();
      const freshList = res.sessions || [];
      setSessions(freshList);
      setNewChatSession((prev) => {
        if (prev && freshList.some((s) => s.name === prev)) return prev;
        return pickInitialSession(freshList);
      });
    } catch {
      // keep existing session list if refresh fails
    } finally {
      setLoadingNewChatSessions(false);
    }
  };

  const handleOpenMergeModal = () => {
    setMergeSearch('');
    setShowMergeModal(true);
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
    if (sessions.length > 0 && !newChatSession.trim()) {
      toast.error('Pilih sesi WhatsApp pengirim terlebih dahulu');
      return;
    }
    setOpeningContactId(contactId);
    try {
      const chosenSession = newChatSession.trim() || undefined;
      const opened = await api.openConversation(contactId, chosenSession);
      setShowNewChatModal(false);
      if (
        chosenSession &&
        accountFilter.startsWith('WA:') &&
        accountFilter.slice(3).toLowerCase() !== chosenSession.toLowerCase()
      ) {
        setAccountFilter('ALL');
      }
      const updated = await api.getConversations();
      setConversations(updated);
      const target = updated.find((c) => c.id === opened.id) || opened;
      setSelectedConversation(target);
      setSelectedSession(target.wahaSession || chosenSession || defaultWahaSession || '');
      toast.success(chosenSession ? `Percakapan dibuka via sesi ${chosenSession}` : 'Percakapan dibuka');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal membuka percakapan');
    } finally {
      setOpeningContactId(null);
    }
  };

  const handleStartConversationWithPhone = async (phone: string) => {
    if (sessions.length > 0 && !newChatSession.trim()) {
      toast.error('Pilih sesi WhatsApp pengirim terlebih dahulu');
      return;
    }
    setOpeningContactId('new_phone');
    try {
      const chosenSession = newChatSession.trim() || undefined;
      const opened = await api.openConversation(undefined, chosenSession, phone);
      setShowNewChatModal(false);
      if (
        chosenSession &&
        accountFilter.startsWith('WA:') &&
        accountFilter.slice(3).toLowerCase() !== chosenSession.toLowerCase()
      ) {
        setAccountFilter('ALL');
      }
      const updated = await api.getConversations();
      setConversations(updated);
      const target = updated.find((c) => c.id === opened.id) || opened;
      setSelectedConversation(target);
      setSelectedSession(target.wahaSession || chosenSession || defaultWahaSession || '');
      toast.success(chosenSession ? `Percakapan baru dibuka via sesi ${chosenSession}` : 'Percakapan baru dibuka');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal membuka percakapan dengan nomor baru');
    } finally {
      setOpeningContactId(null);
    }
  };

  const handleStatusChange = async (
    nextStatus: 'OPEN' | 'PENDING' | 'RESOLVED',
    sendCsat?: boolean
  ) => {
    if (!selectedConversation || resolvingStatus) return;
    setResolvingStatus(true);
    try {
      const res = await api.updateConversation(selectedConversation.id, {
        status: nextStatus,
        sendCsat,
        baseUrl: getAppBaseUrl(),
      });
      setShowResolveConfirmModal(false);
      if (res?.csatSent) {
        toast.success('Percakapan diselesaikan & tautan CSAT dikirim');
      } else {
        toast.success(
          nextStatus === 'RESOLVED'
            ? sendCsat === false
              ? 'Percakapan diselesaikan tanpa mengirim CSAT'
              : 'Percakapan diselesaikan (Resolved)'
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
    } finally {
      setResolvingStatus(false);
    }
  };

  const handleSelectConversationStatus = (nextStatus: 'OPEN' | 'PENDING' | 'RESOLVED') => {
    if (!selectedConversation || resolvingStatus) return;
    if (
      nextStatus === 'RESOLVED' &&
      selectedConversation.status !== 'RESOLVED' &&
      !selectedConversation.excludeFromMetrics &&
      canSendCsat
    ) {
      setShowResolveConfirmModal(true);
      return;
    }
    void handleStatusChange(nextStatus, nextStatus === 'RESOLVED' ? false : undefined);
  };

  const getLabelList = (conv: Conversation | null): string[] => {
    if (!conv?.labels) return [];
    return conv.labels
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const getLabelStyle = useCallback(
    (labelName: string) => {
      const clean = labelName.trim().toLowerCase();
      const matched = masterLabels.find((m) => m.name.toLowerCase() === clean);
      if (matched && matched.color && LABEL_COLOR_MAP[matched.color]) {
        return {
          ...LABEL_COLOR_MAP[matched.color],
          colorKey: matched.color,
        };
      }
      const colorKeys: (keyof typeof LABEL_COLOR_MAP)[] = [
        'indigo',
        'emerald',
        'amber',
        'rose',
        'sky',
        'violet',
        'slate',
      ];
      let hash = 0;
      for (let i = 0; i < clean.length; i++) {
        hash = (hash * 31 + clean.charCodeAt(i)) % colorKeys.length;
      }
      const fallbackColor = colorKeys[Math.abs(hash)];
      return {
        ...LABEL_COLOR_MAP[fallbackColor],
        colorKey: fallbackColor,
      };
    },
    [masterLabels]
  );

  const availableFilterLabels = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();

    for (const ml of masterLabels) {
      if (ml.name) {
        const key = ml.name.trim().toLowerCase();
        if (!map.has(key)) {
          map.set(key, { name: ml.name.trim(), count: 0 });
        }
      }
    }

    for (const pl of PRESET_LABELS) {
      const key = pl.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { name: pl, count: 0 });
      }
    }

    for (const c of conversations) {
      const list = getLabelList(c);
      for (const l of list) {
        const key = l.toLowerCase();
        const existing = map.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(key, { name: l, count: 1 });
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });
  }, [masterLabels, conversations]);

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
        applyToContact: false,
      });
      setExcludeReasonDraft(cleanedReason || 'Bukan Customer');
      setSelectedConversation((prev) =>
        prev && prev.id === selectedConversation.id
          ? {
              ...prev,
              excludeFromMetrics: nextExclude,
              excludeReason: cleanedReason,
              ...(nextExclude ? { assignedAgentId: null, assignedAgentName: null } : {}),
            }
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

  const unifiedSessionOptions = useMemo(() => {
    const options: Array<{
      value: string;
      label: string;
      channel: OmnichannelType;
    }> = [];
    const seen = new Set<string>();

    for (const s of sessions) {
      if (!s.name) continue;
      const val = `WA:${s.name}`;
      if (seen.has(val)) continue;
      seen.add(val);
      const mePhone = s.me?.id ? s.me.id.split('@')[0] : '';
      const suffix = s.me?.pushName || mePhone;
      options.push({
        value: val,
        label: `WA • ${s.name}${suffix ? ` (${suffix})` : ''}`,
        channel: 'WHATSAPP',
      });
    }

    for (const c of conversations) {
      const ch = ((c.channel || 'WHATSAPP').toUpperCase()) as OmnichannelType;
      if (ch === 'WHATSAPP' && c.wahaSession) {
        const val = `WA:${c.wahaSession.trim()}`;
        if (!seen.has(val)) {
          seen.add(val);
          options.push({
            value: val,
            label: `WA • ${c.wahaSession.trim()}`,
            channel: 'WHATSAPP',
          });
        }
      }
      if (c.channelAccountId && !seen.has(`ACC:${c.channelAccountId}`)) {
        seen.add(`ACC:${c.channelAccountId}`);
        const accLabel = c.channelAccountName || c.channelAccountId;
        options.push({
          value: `ACC:${c.channelAccountId}`,
          label: `${CHANNEL_META[ch]?.short || ch} • ${accLabel}`,
          channel: ch,
        });
      }
    }

    for (const acc of channelAccounts) {
      const val = `ACC:${acc.id}`;
      if (seen.has(val)) continue;
      seen.add(val);
      options.push({
        value: val,
        label: `${CHANNEL_META[acc.channel]?.short || acc.channel} • ${acc.name}`,
        channel: acc.channel,
      });
    }

    return options;
  }, [sessions, conversations, channelAccounts]);

  const filteredUnifiedSessionOptions = useMemo(
    () => unifiedSessionOptions.filter((opt) => channelFilter === 'ALL' || opt.channel === channelFilter),
    [unifiedSessionOptions, channelFilter]
  );

  useLayoutEffect(() => {
    const anchor = convListAnchorRef.current;
    convListAnchorRef.current = null;
    const el = convListContainerRef.current;
    if (!anchor || !el) return;
    const delta = el.scrollHeight - anchor.height;
    el.scrollTop = delta > 0 ? anchor.top + delta : anchor.top;
  }, [conversations]);

  if (!licenseInfo) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 max-w-xl mx-auto mt-8 text-center space-y-2">
        <div className="text-xs font-medium text-gray-500">
          Memeriksa status lisensi Live Chat CRM...
        </div>
      </div>
    );
  }

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
    if (chatTypeFilter === 'PERSONAL' && c.isGroup) return false;
    if (chatTypeFilter === 'GROUP' && !c.isGroup) return false;
    if (chatTypeFilter === 'UNREAD' && !(c.unreadCount && c.unreadCount > 0)) return false;
    if (metricFilter === 'ASSESSED' && (c.excludeFromMetrics || c.isGroup)) return false;
    if (metricFilter === 'EXCLUDED' && !c.excludeFromMetrics && !c.isGroup) return false;
    if (metricFilter === 'GROUPS' && !c.isGroup) return false;
    if (metricFilter === 'SLA_BREACH') {
      const isBreached =
        !c.excludeFromMetrics &&
        !c.isGroup &&
        convStatus === 'OPEN' &&
        !c.firstResponseAt &&
        c.firstInboundAt &&
        Date.now() - new Date(c.firstInboundAt).getTime() > slaTargetMinutes * 60_000;
      if (!isBreached) return false;
    }
    if (channelFilter !== 'ALL' && convChannel !== channelFilter) return false;
    if (accountFilter !== 'ALL') {
      if (accountFilter.startsWith('WA:')) {
        const targetSess = accountFilter.slice(3).toLowerCase();
        if (convChannel !== 'WHATSAPP' || (c.wahaSession || '').trim().toLowerCase() !== targetSess) {
          return false;
        }
      } else if (accountFilter.startsWith('ACC:')) {
        if (c.channelAccountId !== accountFilter.slice(4)) return false;
      } else if (c.channelAccountId !== accountFilter) {
        return false;
      }
    }
    if (assigneeFilter === 'MINE' && (!currentUser?.id || c.assignedAgentId !== currentUser.id)) {
      return false;
    }
    if (assigneeFilter === 'UNASSIGNED' && c.assignedAgentId) {
      return false;
    }
    if (assigneeFilter.startsWith('AGENT:')) {
      const targetAgentId = assigneeFilter.slice(6);
      if (c.assignedAgentId !== targetAgentId) return false;
    }
    if (labelFilter !== 'ALL') {
      const convLabels = getLabelList(c);
      if (labelFilter === '__NO_LABEL__') {
        if (convLabels.length > 0) return false;
      } else {
        const target = labelFilter.toLowerCase();
        if (!convLabels.some((l) => l.toLowerCase() === target)) {
          return false;
        }
      }
    }
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const cleanQ = q.startsWith('#') ? q.slice(1).trim() : q;
    return (
      c.channelDisplayName?.toLowerCase().includes(q) ||
      c.pushName?.toLowerCase().includes(q) ||
      c.channelAccountName?.toLowerCase().includes(q) ||
      c.contact?.nama_lengkap?.toLowerCase().includes(q) ||
      c.contact?.nomor_whatsapp?.includes(q) ||
      c.lastMessage?.toLowerCase().includes(q) ||
      c.labels?.toLowerCase().includes(cleanQ) ||
      c.wahaSession?.toLowerCase().includes(q) ||
      c.assignedAgentName?.toLowerCase().includes(q)
    );
  });

  const activeLabels = getLabelList(selectedConversation);
  const activeAdvancedFilterCount =
    (metricFilter !== 'ALL' ? 1 : 0) +
    (channelFilter !== 'ALL' ? 1 : 0) +
    (assigneeFilter !== 'ALL' ? 1 : 0) +
    (labelFilter !== 'ALL' ? 1 : 0);

  return (
    <div className="relative bg-white rounded-none border-t border-gray-200 sm:rounded-lg sm:border overflow-hidden flex-1 min-h-0 h-full flex flex-col md:flex-row">
      {/* Left List */}
      <div
        className={`w-full md:w-64 lg:w-72 xl:w-80 border-b md:border-b-0 md:border-r border-gray-200 flex-col shrink-0 bg-gray-50/50 ${
          selectedConversation ? 'hidden md:flex' : 'flex flex-1 md:flex-none min-h-0'
        }`}
      >
        <div className="p-2 sm:p-2.5 border-b border-gray-200 bg-white space-y-1.5">
          {/* Row 1: Search + Filter Drawer Toggle + New Chat */}
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Cari obrolan, kontak, atau sesi..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-8 pl-8 pr-7 bg-gray-50 border border-gray-200 rounded-md text-xs placeholder-gray-400 focus:outline-none focus:bg-white focus:border-indigo-500 transition-colors"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  title="Bersihkan pencarian"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowListFilters((v) => !v)}
              title="Filter lanjutan (Penilaian, Channel, Agent, Label)"
              className={`h-8 px-2 rounded-md border text-xs font-medium inline-flex items-center gap-1 shrink-0 transition-colors cursor-pointer ${
                showListFilters || activeAdvancedFilterCount > 0
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-600'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {activeAdvancedFilterCount > 0 && (
                <span className="px-1 min-w-[16px] h-4 rounded-full bg-indigo-600 text-white text-[10px] font-bold inline-flex items-center justify-center tabular-nums">
                  {activeAdvancedFilterCount}
                </span>
              )}
            </button>
            {canManageConversation && (
              <button
                type="button"
                onClick={() => void handleOpenNewChatModal()}
                title="Buka Percakapan Baru"
                className="h-8 px-2.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium inline-flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Baru</span>
              </button>
            )}
          </div>

          {/* Row 2: Compact Status Tabs */}
          <div className="bg-gray-100/90 p-0.5 rounded-md grid grid-cols-4 gap-0.5 text-[11px]">
            {(['ALL', 'OPEN', 'PENDING', 'RESOLVED'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`py-1 rounded font-medium transition-colors cursor-pointer ${
                  statusFilter === st
                    ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {st === 'ALL' ? 'Semua' : st === 'OPEN' ? 'Open' : st === 'PENDING' ? 'Pending' : 'Selesai'}
              </button>
            ))}
          </div>

          {/* Row 3: Compact Tipe & Sesi/Akun Bar */}
          {unifiedSessionOptions.length > 0 ? (
            <div className="grid grid-cols-2 gap-1.5">
              <select
                value={chatTypeFilter}
                onChange={(e) => setChatTypeFilter(e.target.value as any)}
                aria-label="Filter Tipe Obrolan"
                className={`w-full h-7 px-2 border rounded-md text-[11px] font-medium focus:outline-none focus:border-indigo-500 transition-colors ${
                  chatTypeFilter !== 'ALL'
                    ? 'bg-indigo-50/70 border-indigo-200 text-indigo-800'
                    : 'bg-gray-50/80 border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <option value="ALL">Semua Tipe</option>
                <option value="PERSONAL">Chat Pribadi</option>
                <option value="GROUP">Grup WA</option>
                <option value="UNREAD">Belum Dibaca</option>
              </select>

              <select
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                aria-label="Filter Sesi atau Akun Kanal"
                className={`w-full h-7 px-2 border rounded-md text-[11px] font-medium focus:outline-none focus:border-indigo-500 transition-colors ${
                  accountFilter !== 'ALL'
                    ? 'bg-indigo-50/70 border-indigo-200 text-indigo-800'
                    : 'bg-gray-50/80 border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <option value="ALL">
                  Semua Sesi ({filteredUnifiedSessionOptions.length})
                </option>
                {filteredUnifiedSessionOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="bg-gray-100/90 p-0.5 rounded-md grid grid-cols-4 gap-0.5 text-[11px]">
              {(
                [
                  { id: 'ALL', label: 'Semua' },
                  { id: 'PERSONAL', label: 'Pribadi' },
                  { id: 'GROUP', label: 'Grup' },
                  { id: 'UNREAD', label: 'Belum Dibaca' },
                ] as const
              ).map((ct) => (
                <button
                  key={ct.id}
                  type="button"
                  onClick={() => setChatTypeFilter(ct.id)}
                  className={`py-1 rounded font-medium transition-colors truncate px-0.5 cursor-pointer ${
                    chatTypeFilter === ct.id
                      ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {ct.label}
                </button>
              ))}
            </div>
          )}

          {/* Collapsed Active Filter Summary (single slim bar) */}
          {!showListFilters &&
            (metricFilter !== 'ALL' ||
              channelFilter !== 'ALL' ||
              assigneeFilter !== 'ALL' ||
              accountFilter !== 'ALL' ||
              labelFilter !== 'ALL') && (
              <div className="flex items-center justify-between gap-2 px-2 py-1 rounded-md bg-indigo-50/80 border border-indigo-100 text-[10.5px] text-indigo-900">
                <span className="truncate font-medium">
                  {[
                    metricFilter !== 'ALL'
                      ? metricFilter === 'ASSESSED'
                        ? 'Dinilai'
                        : metricFilter === 'EXCLUDED'
                        ? 'Non-Nilai'
                        : 'Lewat SLA'
                      : null,
                    channelFilter !== 'ALL' ? CHANNEL_META[channelFilter]?.short || channelFilter : null,
                    assigneeFilter !== 'ALL'
                      ? assigneeFilter === 'MINE'
                        ? 'Milik Saya'
                        : assigneeFilter === 'UNASSIGNED'
                        ? 'Belum Ditugaskan'
                        : assignableAgents.find((a) => `AGENT:${a.id}` === assigneeFilter)?.name || 'Agent'
                      : null,
                    accountFilter !== 'ALL'
                      ? unifiedSessionOptions.find((o) => o.value === accountFilter)?.label || 'Sesi Khusus'
                      : null,
                    labelFilter !== 'ALL'
                      ? labelFilter === '__NO_LABEL__'
                        ? 'Tanpa Label'
                        : `#${labelFilter}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setMetricFilter('ALL');
                    setChannelFilter('ALL');
                    setAssigneeFilter('ALL');
                    setAccountFilter('ALL');
                    setLabelFilter('ALL');
                  }}
                  className="font-semibold text-indigo-700 hover:text-indigo-900 hover:underline shrink-0 cursor-pointer"
                >
                  Reset
                </button>
              </div>
            )}

          {/* Compact Expandable Advanced Filter Card */}
          {showListFilters && (
            <div className="p-2 rounded-lg bg-slate-50/90 border border-slate-200/90 space-y-1.5">
              {/* Penilaian & SLA Tabs */}
              <div className="bg-white border border-gray-200/80 p-0.5 rounded-md grid grid-cols-4 gap-0.5 text-[10.5px]">
                {(
                  [
                    { id: 'ALL', label: 'Semua' },
                    { id: 'ASSESSED', label: 'Dinilai' },
                    { id: 'EXCLUDED', label: 'Non-Nilai' },
                    { id: 'SLA_BREACH', label: 'Lewat SLA' },
                  ] as const
                ).map((mf) => (
                  <button
                    key={mf.id}
                    type="button"
                    onClick={() => setMetricFilter(mf.id)}
                    className={`py-1 rounded font-medium transition-colors truncate px-0.5 text-center cursor-pointer ${
                      metricFilter === mf.id
                        ? 'bg-indigo-600 text-white font-semibold'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    {mf.label}
                  </button>
                ))}
              </div>

              {/* Channel & Agent Dropdowns */}
              <div className={`grid gap-1.5 ${assignableAgents.length > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <select
                  value={channelFilter}
                  onChange={(e) => {
                    setChannelFilter(e.target.value as any);
                    setAccountFilter('ALL');
                  }}
                  aria-label="Filter Channel"
                  className="w-full h-7 px-2 bg-white hover:bg-gray-50 border border-gray-200 rounded-md text-[11px] font-medium text-gray-700 focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="ALL">Semua Channel</option>
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="WHATSAPP_CLOUD">WA Cloud</option>
                  <option value="INSTAGRAM">Instagram</option>
                  <option value="FACEBOOK">Facebook</option>
                  <option value="THREADS">Threads</option>
                  <option value="TELEGRAM">Telegram</option>
                </select>

                {assignableAgents.length > 0 && (
                  <select
                    value={assigneeFilter}
                    onChange={(e) => setAssigneeFilter(e.target.value)}
                    aria-label="Filter Agent"
                    className="w-full h-7 px-2 bg-white hover:bg-gray-50 border border-gray-200 rounded-md text-[11px] font-medium text-gray-700 focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option value="ALL">
                      {canViewAllConversations ? 'Semua Agent' : 'Akses Saya'}
                    </option>
                    <option value="MINE">Milik Saya</option>
                    <option value="UNASSIGNED">Belum Ditugaskan</option>
                    <optgroup label="Spesifik Agent">
                      {assignableAgents.map((ag) => (
                        <option key={ag.id} value={`AGENT:${ag.id}`}>
                          {ag.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                )}
              </div>

              {/* Single Unified Label Chip Strip (no redundant select dropdown) */}
              <div className="flex flex-wrap items-center gap-1 max-h-20 overflow-y-auto pt-0.5">
                <button
                  type="button"
                  onClick={() => setLabelFilter(labelFilter === '__NO_LABEL__' ? 'ALL' : '__NO_LABEL__')}
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors cursor-pointer ${
                    labelFilter === '__NO_LABEL__'
                      ? 'bg-indigo-600 text-white border-indigo-600 font-semibold'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  Tanpa Label
                </button>
                {availableFilterLabels.map((item) => {
                  const style = getLabelStyle(item.name);
                  const isSelected = labelFilter.toLowerCase() === item.name.toLowerCase();
                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => setLabelFilter(isSelected ? 'ALL' : item.name)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all cursor-pointer ${
                        isSelected
                          ? `ring-1 ring-indigo-500 font-semibold ${style.badge}`
                          : `bg-white hover:opacity-95 ${style.badge}`
                      }`}
                      title={`Filter #${item.name}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                      <span>#{item.name}</span>
                      {item.count > 0 && (
                        <span className="text-[9px] opacity-75 font-mono">{item.count}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Compact Footer */}
              <div className="flex items-center justify-between text-[10.5px] pt-1 border-t border-slate-200/80">
                <span className="text-slate-500 font-mono">
                  {filteredConversations.length} obrolan
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setChatTypeFilter('ALL');
                      setStatusFilter('ALL');
                      setMetricFilter('ALL');
                      setChannelFilter('ALL');
                      setAssigneeFilter('ALL');
                      setAccountFilter('ALL');
                      setLabelFilter('ALL');
                    }}
                    className="text-slate-600 hover:text-rose-600 transition-colors font-medium cursor-pointer"
                  >
                    Reset Semua
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowListFilters(false)}
                    className="font-semibold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="relative flex-1 min-h-0 flex flex-col">
        {pendingNewConvIds.length > 0 && (
          <button
            type="button"
            onClick={() => scrollConvListToTop('smooth')}
            className="absolute top-2.5 left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md border border-indigo-500 transition-all cursor-pointer"
          >
            <ChevronUp className="w-3.5 h-3.5 shrink-0" />
            <span>
              {pendingNewConvIds.length > 1
                ? `${pendingNewConvIds.length} obrolan baru`
                : 'Obrolan baru'}
            </span>
          </button>
        )}
        <div
          ref={convListContainerRef}
          onScroll={handleConvListScroll}
          className="flex-1 overflow-y-auto divide-y divide-gray-200"
        >
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
            <>
              {filteredConversations.slice(0, convDisplayLimit).map((conv) => {
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
                      setShowMobileChatActions(false);
                      setShowComposerTools(false);
                      setActiveReactionMsgId(null);
                      setOpenProfileSections({});
                    }
                    setSelectedConversation(conv);
                  }}
                  className={`w-full px-3 py-2.5 text-left flex items-start gap-2.5 transition-colors ${
                    isSelected
                      ? 'bg-indigo-50/70 border-l-2 border-indigo-600'
                      : 'hover:bg-gray-100/70 bg-white'
                  }`}
                >
                  <ContactAvatar
                    url={conv.contact?.profile_picture_url}
                    label={getConversationDisplayTitle(conv)}
                    className="w-8 h-8 rounded-md bg-slate-700 text-white font-semibold text-xs mt-0.5"
                    onClick={(e) => {
                      if (conv.contact?.profile_picture_url) {
                        e.stopPropagation();
                        handleOpenAvatarLightbox(conv.contact.profile_picture_url, getConversationDisplayTitle(conv));
                      }
                    }}
                    title={conv.contact?.profile_picture_url ? "Klik untuk melihat foto profil" : undefined}
                  />

                  <div className="flex-1 min-w-0">
                    {(() => {
                      const { previewText, isMentionedMe } = formatConversationPreview(
                        conv.lastMessage,
                        mySessionPhones,
                        contactsByPhone,
                        selectedConversation?.id === conv.id ? participantsLookup : undefined,
                        conv.lastMessageMentionedContacts
                      );
                      return (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-gray-900 text-xs truncate inline-flex items-center gap-1 min-w-0">
                              <span className="truncate">{getConversationDisplayTitle(conv)}</span>
                              {!conv.isGroup && <VerifiedMetaBadge contact={conv.contact} />}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isMentionedMe && (
                                <span
                                  title="Anda disebut dalam percakapan ini"
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-300 text-[9px] shrink-0"
                                >
                                  <AtSign className="w-2.5 h-2.5 text-amber-600" />
                                  <span>Disebut</span>
                                </span>
                              )}
                              {conv.unreadCount > 0 && (
                                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-600 text-white tabular-nums">
                                  {conv.unreadCount}
                                </span>
                              )}
                              {conv.lastMessageAt && (
                                <span className="text-[10px] text-gray-400 font-mono tabular-nums">
                                  {new Date(conv.lastMessageAt).toLocaleTimeString('id-ID', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              )}
                            </div>
                          </div>

                          <p className="text-[11px] text-gray-500 truncate mt-0.5">
                            {(() => {
                              const gTypers = Object.values(groupPresenceByConvId[conv.id] || {});
                              if (gTypers.length > 0) {
                                const hasRec = gTypers.some((t) => t.status === 'recording');
                                const names =
                                  gTypers.length === 1
                                    ? gTypers[0].name
                                    : gTypers.length === 2
                                    ? `${gTypers[0].name}, ${gTypers[1].name}`
                                    : `${gTypers[0].name}, +${gTypers.length - 1}`;
                                return (
                                  <span className="text-emerald-600 font-medium italic">
                                    {names} {hasRec ? 'merekam audio...' : 'sedang mengetik...'}
                                  </span>
                                );
                              }
                              if (presenceByConvId[conv.id]?.status === 'typing') {
                                return (
                                  <span className="text-emerald-600 font-medium italic">
                                    Sedang mengetik...
                                  </span>
                                );
                              }
                              if (presenceByConvId[conv.id]?.status === 'recording') {
                                return (
                                  <span className="text-emerald-600 font-medium italic">
                                    Merekam pesan suara...
                                  </span>
                                );
                              }
                              return previewText;
                            })()}
                          </p>
                        </>
                      );
                    })()}

                    <div className="flex flex-wrap items-center gap-1 mt-1 text-[10px]">
                      {(() => {
                        const ch = ((conv.channel || 'WHATSAPP').toUpperCase()) as OmnichannelType;
                        const meta = CHANNEL_META[ch] || CHANNEL_META.WHATSAPP;
                        const badgeCls =
                          ch === 'WHATSAPP' && conv.wahaSession
                            ? getWahaSessionBadgeClass(conv.wahaSession, sessions, meta.cls)
                            : meta.cls;
                        const dotCls =
                          ch === 'WHATSAPP' && conv.wahaSession
                            ? getWahaSessionDotClass(conv.wahaSession, sessions, meta.dot)
                            : meta.dot;
                        return (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium border shrink-0 ${badgeCls}`}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotCls}`} />
                            <span>
                              {meta.short}
                              {conv.wahaSession ? ` • ${conv.wahaSession}` : ''}
                            </span>
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
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-semibold bg-rose-50 text-rose-700 border border-rose-200 shrink-0"
                          >
                            <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                            SLA
                          </span>
                        )}
                      {conv.isGroup ? (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-medium bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                          Grup
                        </span>
                      ) : conv.excludeFromMetrics ? (
                        <span
                          title={`Tidak masuk penilaian (${conv.excludeReason || 'Non-Customer'})`}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium bg-white text-slate-500 border border-slate-200 shrink-0"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                          Non-Nilai
                        </span>
                      ) : (
                        <>
                          <span
                            title="Percakapan pada sesi ini masuk penilaian SLA & CSAT"
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium bg-white text-slate-700 border border-slate-200 shrink-0"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                            Dinilai
                          </span>
                          {conv.assignedAgentName && (
                            <span
                              title={`Ditugaskan ke: ${conv.assignedAgentName}`}
                              className="inline-flex items-center px-1.5 py-0.5 rounded font-medium bg-slate-50 text-slate-600 border border-slate-200 shrink-0 truncate max-w-[90px]"
                            >
                              • {conv.assignedAgentName}
                            </span>
                          )}
                        </>
                      )}

                      {/* Clear, Beautiful Label Badges with Colors from Master Data */}
                      {convLabels.map((lbl, idx) => {
                        if (idx >= 2) return null;
                        const style = getLabelStyle(lbl);
                        const isFiltered = labelFilter.toLowerCase() === lbl.toLowerCase();
                        return (
                          <span
                            key={lbl}
                            onClick={(e) => {
                              e.stopPropagation();
                              setLabelFilter((prev) => (prev.toLowerCase() === lbl.toLowerCase() ? 'ALL' : lbl));
                            }}
                            title={`Label: #${lbl} (Klik untuk ${isFiltered ? 'lepas filter' : 'filter obrolan ini'})`}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 transition-all hover:scale-102 cursor-pointer shadow-2xs ${
                              style.badge
                            } ${isFiltered ? 'ring-1.5 ring-indigo-500 font-bold' : ''}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                            <span className="truncate max-w-[85px]">#{lbl}</span>
                          </span>
                        );
                      })}
                      {convLabels.length > 2 && (
                        <span
                          title={`Label lainnya: ${convLabels.slice(2).map((l) => `#${l}`).join(', ')}`}
                          className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold bg-gray-100 text-gray-700 border border-gray-200 shrink-0"
                        >
                          +{convLabels.length - 2}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
              })}
              {filteredConversations.length > convDisplayLimit && (
                <div className="p-3 bg-white text-center">
                  <button
                    type="button"
                    onClick={() => setConvDisplayLimit((prev) => prev + 100)}
                    className="w-full py-2 px-3 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 text-xs font-medium text-indigo-700 transition-colors tabular-nums"
                  >
                    Tampilkan lebih banyak (+100) —{' '}
                    {Math.min(convDisplayLimit, filteredConversations.length)}/
                    {filteredConversations.length}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        </div>
      </div>

      {/* Middle Chat Feed */}
      {selectedConversation ? (
        <div className="flex flex-1 flex-col bg-gray-50 min-w-0 min-h-0">
          {(() => {
            const isExcludedConv = Boolean(
              selectedConversation.excludeFromMetrics || selectedConversation.isGroup
            );
            const ch = ((selectedConversation.channel || 'WHATSAPP').toUpperCase()) as OmnichannelType;
            const channelMeta = CHANNEL_META[ch] || CHANNEL_META.WHATSAPP;
            const activePresence = presenceByConvId[selectedConversation.id]?.status;

            return (
              <div className="relative min-h-[3.25rem] bg-white border-b border-gray-200 px-2.5 sm:px-4 py-2 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedConversation(null);
                      setShowMobileChatActions(false);
                    }}
                    title="Kembali ke Daftar Obrolan"
                    className="md:hidden p-1.5 -ml-1 rounded-md text-gray-600 hover:bg-gray-100 shrink-0"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleContactPanel(true)}
                    title="Klik untuk membuka Detail Kontak & Opsi Percakapan"
                    className="flex items-center gap-2 min-w-0 flex-1 text-left rounded-md hover:bg-gray-50/80 p-0.5 -m-0.5 transition-colors"
                  >
                    <ContactAvatar
                      url={selectedConversation.contact?.profile_picture_url}
                      label={getConversationDisplayTitle(selectedConversation)}
                      className="w-8 h-8 rounded-md bg-slate-700 text-white font-semibold text-xs"
                      onClick={(e) => {
                        if (selectedConversation.contact?.profile_picture_url) {
                          e.stopPropagation();
                          handleOpenAvatarLightbox(
                            selectedConversation.contact.profile_picture_url,
                            getConversationDisplayTitle(selectedConversation)
                          );
                        }
                      }}
                      title={selectedConversation.contact?.profile_picture_url ? "Klik untuk melihat foto profil lebih jelas" : undefined}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h4 className="font-semibold text-gray-900 text-xs sm:text-[13px] truncate">
                          {getConversationDisplayTitle(selectedConversation)}
                        </h4>
                        {!selectedConversation.isGroup && (
                          <VerifiedMetaBadge contact={selectedConversation.contact} />
                        )}
                        <span
                          className={`hidden sm:inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-medium border shrink-0 ${
                            ch === 'WHATSAPP' && selectedConversation.wahaSession
                              ? getWahaSessionBadgeClass(selectedConversation.wahaSession, sessions, channelMeta.cls)
                              : channelMeta.cls
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              ch === 'WHATSAPP' && selectedConversation.wahaSession
                                ? getWahaSessionDotClass(selectedConversation.wahaSession, sessions, channelMeta.dot)
                                : channelMeta.dot
                            }`}
                          />
                          <span>
                            {channelMeta.short}
                            {selectedConversation.wahaSession ? ` • ${selectedConversation.wahaSession}` : ''}
                          </span>
                        </span>
                        {selectedConversation.excludeFromMetrics ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-medium bg-slate-50 text-slate-600 border border-slate-200 shrink-0">
                            <EyeOff className="w-2.5 h-2.5 text-slate-400" />
                            <span className="hidden sm:inline">Non-Penilaian</span>
                          </span>
                        ) : !selectedConversation.isGroup ? (
                          <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-medium bg-white text-slate-700 border border-slate-200 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                            Dinilai
                          </span>
                        ) : null}
                        {/* Active Labels in Chat Header */}
                        {activeLabels.map((lbl, idx) => {
                          if (idx >= 3) return null;
                          const style = getLabelStyle(lbl);
                          return (
                            <span
                              key={lbl}
                              className={`hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 shadow-2xs ${style.badge}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                              #{lbl}
                            </span>
                          );
                        })}
                        {activeLabels.length > 3 && (
                          <span
                            title={activeLabels.slice(3).map((l) => `#${l}`).join(', ')}
                            className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-gray-100 text-gray-700 border border-gray-200 shrink-0"
                          >
                            +{activeLabels.length - 3}
                          </span>
                        )}
                        {(ch === 'INSTAGRAM' || ch === 'FACEBOOK') && (() => {
                          const latestInbound =
                            selectedConversation.lastInboundAt ||
                            [...messages].reverse().find((m) => m.direction === 'INBOUND')?.createdAt ||
                            selectedConversation.firstInboundAt;
                          if (!latestInbound) return null;
                          const remainingMs = new Date(latestInbound).getTime() + 24 * 3600_000 - Date.now();
                          if (remainingMs <= 0) {
                            return (
                              <span
                                title="Jendela balas 24 jam Meta telah berakhir."
                                className="hidden lg:inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 shrink-0 whitespace-nowrap"
                              >
                                <Clock className="w-2.5 h-2.5" />
                                Jendela 24j Berakhir
                              </span>
                            );
                          }
                          const hrs = Math.floor(remainingMs / 3600_000);
                          const mins = Math.floor((remainingMs % 3600_000) / 60_000);
                          return (
                            <span
                              title="Sisa waktu jendela balas 24 jam Meta"
                              className={`hidden lg:inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold border shrink-0 whitespace-nowrap ${
                                hrs < 4
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-sky-50 text-sky-700 border-sky-200'
                              }`}
                            >
                              <Clock className="w-2.5 h-2.5" />
                              {hrs}j {mins}m
                            </span>
                          );
                        })()}
                      </div>
                      <div className="text-[11px] text-gray-500 truncate flex items-center gap-1.5">
                        {activePresence ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-medium shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            {activePresence === 'typing'
                              ? 'Mengetik...'
                              : activePresence === 'recording'
                              ? 'Merekam audio...'
                              : 'Online'}
                          </span>
                        ) : (
                          <span className="font-mono truncate">
                            {selectedConversation.contact?.nomor_whatsapp
                              ? `+${selectedConversation.contact.nomor_whatsapp}`
                              : selectedConversation.isGroup
                              ? 'Grup WhatsApp'
                              : channelMeta.label}
                          </span>
                        )}
                        {selectedConversation.wahaSession && (
                          <span className="inline-flex items-center gap-1 text-slate-600 font-mono font-medium shrink-0">
                            <span aria-hidden="true">•</span>
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${getWahaSessionDotClass(
                                selectedConversation.wahaSession,
                                sessions,
                                channelMeta.dot
                              )}`}
                            />
                            <span>{selectedConversation.wahaSession}</span>
                          </span>
                        )}
                        {!activePresence && selectedConversation.assignedAgentName && !isExcludedConv && (
                          <span className="lg:hidden text-slate-600 font-medium truncate">
                            • {selectedConversation.assignedAgentName}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </div>

                {/* Compact Desktop Inline Controls (lg+) */}
                <div className="hidden lg:flex items-center gap-1.5 shrink-0">
                  {selectedConversation.isGroup && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowParticipantsModal(true);
                        void fetchParticipants(selectedConversation.id, true);
                      }}
                      title="Lihat daftar partisipan grup"
                      className="h-7 px-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-slate-700 text-[11px] font-medium inline-flex items-center gap-1 shrink-0 transition-colors"
                    >
                      <Users className="w-3 h-3 text-slate-500" />
                      <span>
                        Partisipan
                        {participantsData && participantsData.participants.length > 0
                          ? ` (${participantsData.participants.length})`
                          : ''}
                      </span>
                    </button>
                  )}

                  {!isExcludedConv && assignableAgents.length > 0 && (
                    <select
                      value={selectedConversation.assignedAgentId || ''}
                      disabled={!canManageConversation}
                      onChange={(e) => void handleAssignAgent(e.target.value || null)}
                      title={
                        canManageConversation
                          ? 'Tugaskan ke Agent'
                          : 'Role Anda tidak memiliki izin menugaskan CS'
                      }
                      className="h-7 px-2 bg-white border border-gray-200 rounded-md text-[11px] text-gray-700 focus:outline-none focus:border-indigo-500 max-w-[140px] disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <option value="">Belum Ditugaskan</option>
                      {assignableAgents.map((ag) => (
                        <option key={ag.id} value={ag.id}>
                          {ag.name}
                        </option>
                      ))}
                    </select>
                  )}

                  {!isExcludedConv && (
                    <select
                      value={selectedConversation.status || 'OPEN'}
                      disabled={!canManageConversation || resolvingStatus}
                      onChange={(e) =>
                        handleSelectConversationStatus(e.target.value as 'OPEN' | 'PENDING' | 'RESOLVED')
                      }
                      title={
                        canManageConversation
                          ? 'Status Percakapan'
                          : 'Role Anda tidak memiliki izin mengubah status percakapan'
                      }
                      className={`h-7 px-2 rounded-md text-[11px] font-medium border focus:outline-none shrink-0 disabled:opacity-70 disabled:cursor-not-allowed ${
                        selectedConversation.status === 'RESOLVED'
                          ? 'bg-white text-emerald-700 border-emerald-300'
                          : selectedConversation.status === 'PENDING'
                          ? 'bg-white text-amber-700 border-amber-300'
                          : 'bg-white text-slate-700 border-gray-200 focus:border-indigo-500'
                      }`}
                    >
                      <option value="OPEN">Open</option>
                      <option value="PENDING">Pending</option>
                      <option value="RESOLVED">Resolved</option>
                    </select>
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

                {/* Minimal Mobile & Tablet Header Controls (<lg) */}
                <div className="flex lg:hidden items-center gap-1 shrink-0">
                  {selectedConversation.isGroup && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowParticipantsModal(true);
                        void fetchParticipants(selectedConversation.id, true);
                      }}
                      title="Partisipan Grup"
                      className="h-8 px-2 rounded-md border border-teal-200 bg-teal-50 text-teal-800 text-[11px] font-semibold inline-flex items-center gap-1"
                    >
                      <Users className="w-3.5 h-3.5" />
                      {participantsData && participantsData.participants.length > 0 && (
                        <span className="tabular-nums">{participantsData.participants.length}</span>
                      )}
                    </button>
                  )}

                  {!isExcludedConv && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowMobileChatActions((v) => !v)}
                        title="Aksi Percakapan (Status, Agent)"
                        className={`h-8 px-2 rounded-md border text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
                          selectedConversation.status === 'RESOLVED'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : selectedConversation.status === 'PENDING'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        <span>
                          {selectedConversation.status === 'RESOLVED'
                            ? 'Resolved'
                            : selectedConversation.status === 'PENDING'
                            ? 'Pending'
                            : 'Open'}
                        </span>
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>

                      {showMobileChatActions && (
                        <>
                          <div
                            className="fixed inset-0 z-20"
                            onClick={() => setShowMobileChatActions(false)}
                          />
                          <div className="absolute right-0 mt-1.5 w-72 max-w-[calc(100vw-1.5rem)] rounded-lg bg-white border border-gray-200 shadow-xl p-3 z-30 space-y-2.5 text-xs">
                            <div className="flex items-center justify-between gap-2 pb-2 border-b border-gray-100">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${channelMeta.cls}`}>
                                {channelMeta.label}
                              </span>
                              {selectedConversation.contact?.nomor_whatsapp && (
                                <a
                                  href={`https://wa.me/${selectedConversation.contact.nomor_whatsapp}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[11px] font-mono text-indigo-600 hover:underline inline-flex items-center gap-1"
                                >
                                  <Phone className="w-3 h-3" />
                                  +{selectedConversation.contact.nomor_whatsapp}
                                </a>
                              )}
                            </div>

                            {(ch === 'INSTAGRAM' || ch === 'FACEBOOK') && (() => {
                              const latestInbound =
                                selectedConversation.lastInboundAt ||
                                [...messages].reverse().find((m) => m.direction === 'INBOUND')?.createdAt ||
                                selectedConversation.firstInboundAt;
                              if (!latestInbound) return null;
                              const remainingMs = new Date(latestInbound).getTime() + 24 * 3600_000 - Date.now();
                              const hrs = Math.max(0, Math.floor(remainingMs / 3600_000));
                              const mins = Math.max(0, Math.floor((remainingMs % 3600_000) / 60_000));
                              return (
                                <div
                                  className={`px-2 py-1 rounded border text-[10px] font-semibold flex items-center gap-1.5 ${
                                    remainingMs <= 0
                                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                                      : hrs < 4
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-sky-50 text-sky-700 border-sky-200'
                                  }`}
                                >
                                  <Clock className="w-3 h-3 shrink-0" />
                                  <span>
                                    {remainingMs <= 0
                                      ? 'Jendela balas 24 jam Meta berakhir'
                                      : `Jendela Meta tersisa: ${hrs}j ${mins}m`}
                                  </span>
                                </div>
                              );
                            })()}

                            {assignableAgents.length > 0 && (
                              <div className="space-y-1">
                                <span className="block text-[10px] font-medium text-gray-500">
                                  Tugaskan CS
                                </span>
                                <select
                                  value={selectedConversation.assignedAgentId || ''}
                                  disabled={!canManageConversation}
                                  onChange={(e) => {
                                    void handleAssignAgent(e.target.value || null);
                                    setShowMobileChatActions(false);
                                  }}
                                  className="w-full h-8 px-2 bg-gray-50 border border-gray-200 rounded text-[11px] text-gray-700 disabled:opacity-60"
                                >
                                  <option value="">Belum Ditugaskan</option>
                                  {assignableAgents.map((ag) => (
                                    <option key={ag.id} value={ag.id}>
                                      {ag.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            <div className="space-y-1">
                              <span className="block text-[10px] font-medium text-gray-500">
                                Status Percakapan
                              </span>
                              <div className="grid grid-cols-3 gap-1">
                                {(['OPEN', 'PENDING', 'RESOLVED'] as const).map((st) => (
                                  <button
                                    key={st}
                                    type="button"
                                    disabled={!canManageConversation || resolvingStatus}
                                    onClick={() => {
                                      setShowMobileChatActions(false);
                                      handleSelectConversationStatus(st);
                                    }}
                                    className={`h-7 rounded border text-[11px] font-medium transition-colors disabled:opacity-60 ${
                                      selectedConversation.status === st
                                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-semibold'
                                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                    }`}
                                  >
                                    {st === 'OPEN' ? 'Open' : st === 'PENDING' ? 'Pending' : 'Resolved'}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="pt-1 border-t border-gray-100 space-y-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowMobileChatActions(false);
                                  toggleContactPanel(true);
                                }}
                                className="w-full h-8 px-2.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 text-[11px] font-semibold flex items-center gap-2"
                              >
                                <Info className="w-3.5 h-3.5" />
                                <span>Lihat Detail Kontak</span>
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => toggleContactPanel()}
                    title={showContactPanel ? 'Tutup Detail Kontak' : 'Buka Detail Kontak'}
                    className={`h-8 w-8 rounded-md border inline-flex items-center justify-center shrink-0 transition-colors ${
                      showContactPanel
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-600'
                    }`}
                  >
                    <Info className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })()}

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

          {/* Pinned Messages Bar - fixed above scroll container so date labels (Kemarin / Hari ini) are never obscured */}
          {pinnedMessages.length > 0 && !loadingMessages && (() => {
            const safeIdx = Math.min(activePinIndex, pinnedMessages.length - 1);
            const curMsg = pinnedMessages[safeIdx] || pinnedMessages[0];
            const curMeta = parseChatMessageMeta(curMsg);
            const expiryText = curMeta?.pinExpiresAt ? formatPinExpiry(curMeta.pinExpiresAt) : '';

            return (
              <div className="shrink-0 px-3 py-1.5 bg-gradient-to-r from-indigo-50/95 via-sky-50/90 to-indigo-50/95 border-b border-indigo-200/90 shadow-2xs z-10 transition-all">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => handleJumpToMessage(curMsg.id, curMsg.body)}
                    className="min-w-0 flex-1 flex items-center gap-2 text-left hover:opacity-85 transition-opacity cursor-pointer"
                    title="Klik untuk melompat ke pesan yang disematkan"
                  >
                    {pinnedMessages.length > 1 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-indigo-200 text-indigo-800 text-[10px] font-mono font-semibold shrink-0">
                        {safeIdx + 1}/{pinnedMessages.length}
                      </span>
                    )}
                    <p className="text-xs sm:text-[13px] text-indigo-950 truncate font-medium flex-1">
                      {curMsg.body
                        ? formatMentionPlainText(
                            curMsg.body,
                            mySessionPhones,
                            contactsByPhone,
                            participantsLookup,
                            curMsg.mentionedContacts
                          )
                        : curMsg.mediaName || '[Media / Lampiran]'}
                    </p>
                    {expiryText && (
                      <span className="text-[10px] font-medium text-indigo-600/80 bg-white/80 px-1.5 py-0.5 rounded border border-indigo-100 shrink-0">
                        {expiryText}
                      </span>
                    )}
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    {pinnedMessages.length > 1 && (
                      <div className="flex items-center gap-0.5 mr-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActivePinIndex((prev) => (prev > 0 ? prev - 1 : pinnedMessages.length - 1));
                          }}
                          className="p-1 rounded text-indigo-600 hover:text-indigo-900 hover:bg-indigo-100/70 transition-colors cursor-pointer"
                          title="Sematan sebelumnya"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <div className="flex items-center gap-1 px-1">
                          {pinnedMessages.map((_, i) => (
                            <span
                              key={i}
                              onClick={(e) => {
                                e.stopPropagation();
                                setActivePinIndex(i);
                              }}
                              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                                i === safeIdx ? 'w-3 bg-indigo-600' : 'w-1.5 bg-indigo-300 hover:bg-indigo-400'
                              }`}
                              title={`Ke sematan ${i + 1}`}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActivePinIndex((prev) => (prev + 1 < pinnedMessages.length ? prev + 1 : 0));
                          }}
                          className="p-1 rounded text-indigo-600 hover:text-indigo-900 hover:bg-indigo-100/70 transition-colors cursor-pointer"
                          title="Sematan berikutnya"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    {pinnedMessages.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setShowPinAllDropdown((prev) => !prev)}
                        className="px-2 py-0.5 rounded text-[11px] font-medium text-indigo-700 bg-white/80 hover:bg-white border border-indigo-200/80 transition-colors cursor-pointer"
                        title="Tampilkan daftar semua pesan disematkan"
                      >
                        Semua ({pinnedMessages.length})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleUnpinMessage(curMsg)}
                      title="Lepas sematan pesan ini"
                      className="p-1 rounded text-indigo-600 hover:text-indigo-900 hover:bg-indigo-100/80 transition-colors cursor-pointer"
                    >
                      <PinOff className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Dropdown list of all pinned messages */}
                {showPinAllDropdown && pinnedMessages.length > 1 && (
                  <div className="mt-2 pt-2 border-t border-indigo-200/60 space-y-1 max-h-48 overflow-y-auto pr-0.5">
                    {pinnedMessages.map((pMsg, pIdx) => {
                      const pMeta = parseChatMessageMeta(pMsg);
                      const pExp = pMeta?.pinExpiresAt ? formatPinExpiry(pMeta.pinExpiresAt) : '';
                      const isCur = pIdx === safeIdx;
                      const pText = pMsg.body
                        ? formatMentionPlainText(
                            pMsg.body,
                            mySessionPhones,
                            contactsByPhone,
                            participantsLookup,
                            pMsg.mentionedContacts
                          )
                        : pMsg.mediaName || '[Media]';
                      return (
                        <div
                          key={pMsg.id}
                          className={`flex items-center justify-between gap-2 p-1.5 rounded text-xs transition-colors ${
                            isCur ? 'bg-indigo-100/80 text-indigo-900 font-medium' : 'bg-white/70 hover:bg-white text-gray-700'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActivePinIndex(pIdx);
                              handleJumpToMessage(pMsg.id, pMsg.body);
                            }}
                            className="min-w-0 flex-1 text-left flex items-center gap-1.5 cursor-pointer"
                          >
                            <span className="font-mono text-[10px] text-indigo-600">#{pIdx + 1}</span>
                            <span className="truncate flex-1">{pText}</span>
                            {pExp && (
                              <span className="text-[10px] text-gray-400 shrink-0">({pExp})</span>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleUnpinMessage(pMsg)}
                            title="Lepas pin pesan ini"
                            className="p-1 text-gray-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                          >
                            <PinOff className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="relative flex-1 min-h-0 flex flex-col">
            <div
              ref={messagesContainerRef}
              onScroll={handleMessagesScroll}
              className="relative flex-1 min-h-0 p-2.5 sm:p-4 overflow-y-auto space-y-1.5 bg-slate-50/70"
            >
            {floatingDateLabel && messages.length > 0 && !loadingMessages && (
              <div className="sticky top-1 z-20 w-full flex justify-center pointer-events-none pb-1">
                <span className="inline-flex items-center px-3 py-0.5 rounded-full bg-white/95 backdrop-blur-sm border border-gray-200 shadow-2xs text-[11px] font-medium text-gray-700">
                  {floatingDateLabel}
                </span>
              </div>
            )}
            {!loadingMessages &&
              messages.length > 0 &&
              (hasMoreMessages ||
                ((selectedConversation?.channel || 'WHATSAPP') === 'WHATSAPP' && !wahaHistoryExhausted)) && (
                <div className="flex justify-center py-1">
                  <button
                    type="button"
                    disabled={loadingOlderMessages}
                    onClick={() => void loadOlderMessages()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 hover:bg-white border border-gray-200 text-[11px] font-medium text-gray-600 hover:text-indigo-700 shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {loadingOlderMessages ? (
                      <>
                        <RotateCcw className="w-3 h-3 animate-spin" />
                        <span>Memuat histori pesan lama...</span>
                      </>
                    ) : (
                      <span>Muat &amp; sinkronkan pesan lebih lama</span>
                    )}
                  </button>
                </div>
              )}
            {loadingMessages && messages.length === 0 ? (
              <LoadingState message="Memuat pesan..." />
            ) : messages.length === 0 ? (
              <EmptyState title="Belum ada pesan" description="Kirim pesan pertama ke pelanggan ini." />
            ) : (() => {
              const isAssessedConv = !selectedConversation.excludeFromMetrics && !selectedConversation.isGroup;
              const orderedCsatSessions = isAssessedConv
                ? [...(selectedConversation.csatHistory || [])].sort(
                    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
                  )
                : [];

              const isTrailingClosingActivity = (msg: ChatMessage, closeMs: number) => {
                const msgMeta = parseChatMessageMeta(msg);
                const isAct = msg.messageType === 'ACTIVITY' || msgMeta?.kind === 'ACTIVITY';
                if (!isAct) return false;
                const diff = new Date(msg.createdAt).getTime() - closeMs;
                if (diff < -5000 || diff > 120_000) return false;
                const action = String(msgMeta?.action || '').toUpperCase();
                return (
                  action === 'CSAT_SENT' ||
                  (msg.body || '').toLowerCase().includes('survei csat')
                );
              };

              // Determine exact message index where each CSAT session closes (wrapping its trailing auto-CSAT activity log inside the closing session)
              const sessionEndIndexById = new Map<string, number>();
              if (isAssessedConv) {
                orderedCsatSessions.forEach((sess) => {
                  const tokenIdx = sess.token
                    ? messages.findIndex((m) => m.body && m.body.includes(sess.token))
                    : -1;
                  const endMs = new Date(sess.conversationResolvedAt || sess.sentAt).getTime();
                  let resolvedEndIdx = tokenIdx;
                  if (resolvedEndIdx < 0) {
                    messages.forEach((m, mIdx) => {
                      if (new Date(m.createdAt).getTime() <= endMs + 5000) {
                        resolvedEndIdx = mIdx;
                      }
                    });
                  }
                  if (resolvedEndIdx >= 0) {
                    const anchorMs = Math.max(endMs, new Date(messages[resolvedEndIdx].createdAt).getTime());
                    while (
                      resolvedEndIdx + 1 < messages.length &&
                      isTrailingClosingActivity(messages[resolvedEndIdx + 1], anchorMs)
                    ) {
                      resolvedEndIdx += 1;
                    }
                    sessionEndIndexById.set(sess.id, resolvedEndIdx);
                  }
                });
              }

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

              // Track Batas Mulai Sesi indices: Sesi #1 at idx 0 for all assessed conversations, plus each new session after a closing boundary
              const startBannerAtMsgIdx = new Map<
                number,
                {
                  number: number;
                  timestamp: string;
                  isActive?: boolean;
                  session?: typeof orderedCsatSessions[number];
                }
              >();
              let trailingStartBanner: {
                number: number;
                timestamp: string;
                isActive: boolean;
              } | null = null;

              if (isAssessedConv && messages.length > 0) {
                const firstSess = orderedCsatSessions[0];
                const firstStartTs =
                  firstSess?.conversationStartedAt ||
                  (orderedCsatSessions.length === 0
                    ? selectedConversation.sessionStartedAt ||
                      selectedConversation.firstInboundAt ||
                      selectedConversation.createdAt
                    : null) ||
                  messages[0].createdAt;
                startBannerAtMsgIdx.set(0, {
                  number: 1,
                  timestamp: firstStartTs,
                  isActive:
                    orderedCsatSessions.length === 0 &&
                    selectedConversation.status !== 'RESOLVED',
                  session: firstSess,
                });

                for (let sIdx = 0; sIdx < orderedCsatSessions.length; sIdx += 1) {
                  const sess = orderedCsatSessions[sIdx];
                  const endIdx = sessionEndIndexById.get(sess.id);
                  if (endIdx === undefined) continue;
                  const nextSess = orderedCsatSessions[sIdx + 1];
                  const isLastClosed = sIdx === orderedCsatSessions.length - 1;
                  const sessCloseMs = new Date(
                    sess.conversationResolvedAt || sess.sentAt
                  ).getTime();

                  if (endIdx + 1 < messages.length) {
                    const nextMsg = messages[endIdx + 1];
                    const convSessionMs = selectedConversation.sessionStartedAt
                      ? new Date(selectedConversation.sessionStartedAt).getTime()
                      : 0;
                    const activeStartTs =
                      isLastClosed && convSessionMs > sessCloseMs
                        ? selectedConversation.sessionStartedAt!
                        : nextMsg.createdAt;
                    startBannerAtMsgIdx.set(endIdx + 1, {
                      number: sIdx + 2,
                      timestamp: nextSess?.conversationStartedAt || activeStartTs,
                      isActive: !nextSess && selectedConversation.status !== 'RESOLVED',
                      session: nextSess,
                    });
                  } else if (
                    isLastClosed &&
                    selectedConversation.status !== 'RESOLVED'
                  ) {
                    const convSessionMs = selectedConversation.sessionStartedAt
                      ? new Date(selectedConversation.sessionStartedAt).getTime()
                      : 0;
                    const reopenTs =
                      convSessionMs > sessCloseMs
                        ? selectedConversation.sessionStartedAt!
                        : selectedConversation.updatedAt || sess.sentAt;
                    trailingStartBanner = {
                      number: sIdx + 2,
                      timestamp: reopenTs,
                      isActive: true,
                    };
                  }
                }
              }

              const formatDividerTime = (iso: string) =>
                new Date(iso).toLocaleString('id-ID', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                });

              const renderedItems = messages.map((msg, msgIndex) => {
                const msgMeta = parseChatMessageMeta(msg);
                const isActivity = msg.messageType === 'ACTIVITY' || msgMeta?.kind === 'ACTIVITY';
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
                const msgDateKey = getChatDateKey(msg.createdAt);
                const prevMsg = msgIndex > 0 ? messages[msgIndex - 1] : null;
                const prevDateKey = prevMsg ? getChatDateKey(prevMsg.createdAt) : '';
                const msgDateLabel = formatChatDateLabel(msg.createdAt);
                const showDateDivider = Boolean(msgDateLabel && msgIndex > 0 && msgDateKey !== prevDateKey);
                const isFirstInSenderRun = Boolean(
                  !prevMsg ||
                    showDateDivider ||
                    startBanner ||
                    prevMsg.messageType === 'ACTIVITY' ||
                    prevMsg.messageType === 'NOTE' ||
                    prevMsg.direction !== msg.direction ||
                    (selectedConversation.isGroup &&
                      getMessageSenderGroupKey(prevMsg) !== getMessageSenderGroupKey(msg))
                );
                const isSenderSwitch = Boolean(prevMsg && isFirstInSenderRun);
                const isGroupInbound = Boolean(selectedConversation.isGroup && !isOutbound && !isCsat);
                const dateDividerNode = showDateDivider ? (
                  <div className="flex justify-center py-1">
                    <span className="inline-flex items-center px-3 py-0.5 rounded-full bg-white/90 border border-gray-200 text-[11px] font-medium text-gray-600 shadow-2xs">
                      {msgDateLabel}
                    </span>
                  </div>
                ) : null;

                const startDividerNode = startBanner ? (
                  <div className="flex items-center gap-2 py-1.5">
                    <div className="flex-1 h-px bg-indigo-200" />
                    <button
                      type="button"
                      onClick={() => {
                        if (startBanner.session) {
                          const endTime =
                            startBanner.session.conversationResolvedAt ||
                            startBanner.session.sentAt;
                          setHighlightedCsatWindow({
                            token: startBanner.session.token,
                            startedAt:
                              startBanner.session.conversationStartedAt ||
                              startBanner.timestamp,
                            resolvedAt: endTime,
                          });
                        }
                      }}
                      title={
                        startBanner.session
                          ? 'Klik untuk menyorot pesan pada sesi ini'
                          : 'Batas dimulainya sesi percakapan'
                      }
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-[10px] font-medium text-indigo-800 transition-colors"
                    >
                      <Play className="w-2.5 h-2.5 fill-indigo-600 text-indigo-600 shrink-0" />
                      <span>
                        Batas Mulai Sesi #{startBanner.number} •{' '}
                        {formatDividerTime(startBanner.timestamp)}
                      </span>
                      {startBanner.isActive && (
                        <span className="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-900 font-semibold text-[9px]">
                          Sesi Berjalan
                        </span>
                      )}
                    </button>
                    <div className="flex-1 h-px bg-indigo-200" />
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

                if (isActivity) {
                  const actorLabel = msgMeta?.actorName || msg.senderName || 'Sistem';
                  const actTime = new Date(msg.createdAt).toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <React.Fragment key={msg.id}>
                      {dateDividerNode}
                      {startDividerNode}
                      <div
                        data-chat-date={msgDateLabel}
                        ref={(el) => {
                          msgElementRefs.current[msg.id] = el;
                        }}
                        className="flex justify-center py-0.5"
                      >
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 border border-gray-200/90 text-[11px] text-gray-600 shadow-2xs max-w-[92%]">
                          <Clock className="w-3 h-3 text-indigo-500 shrink-0" />
                          <span className="truncate">
                            <strong className="font-semibold text-gray-800">{actorLabel}</strong>{' '}
                            {msg.body}
                          </span>
                          <span className="text-[10px] font-mono text-gray-400 shrink-0">• {actTime}</span>
                        </div>
                      </div>
                      {endDividerNodes}
                    </React.Fragment>
                  );
                }

                if (isNote) {
                  return (
                    <React.Fragment key={msg.id}>
                      {dateDividerNode}
                      {startDividerNode}
                      <div
                        data-chat-date={msgDateLabel}
                        ref={(el) => {
                          msgElementRefs.current[msg.id] = el;
                        }}
                        className="flex justify-center py-0.5"
                      >
                        <div
                          className={`max-w-[92%] sm:max-w-[85%] rounded-lg px-3.5 py-2 text-xs border bg-amber-50 border-amber-200 text-amber-950 space-y-1 min-w-0 ${
                            isCsatHighlighted ? 'ring-2 ring-amber-400' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 text-[10px] font-semibold text-amber-800">
                            <span className="inline-flex items-center gap-1.5">
                              <StickyNote className="w-3 h-3 shrink-0" />
                              <span>
                                Catatan Internal
                                {msg.senderName ? ` • oleh ${msg.senderName}` : ' (Internal Tim)'}
                              </span>
                            </span>
                            {(canReplyConversation || canManageConversation) && (
                              <button
                                type="button"
                                onClick={() => setDeleteMessageTarget(msg)}
                                title="Hapus catatan"
                                className="inline-flex items-center gap-0.5 text-amber-700 hover:text-red-600 font-medium shrink-0"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Hapus</span>
                              </button>
                            )}
                          </div>
                          <div className="whitespace-pre-wrap break-words leading-relaxed">
                            {renderTextWithClickableLinks(
                              msg.body,
                              participantsLookup,
                              msg.mentionedContacts,
                              handleOpenMentionContact,
                              contactsByPhone,
                              mySessionPhones
                            )}
                          </div>
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

                const isRevoked = Boolean(msgMeta?.revoked);
                const isStickerMsg = Boolean(
                  msgMeta?.kind === 'STICKER' ||
                    (msg.mediaUrl && msg.mediaType === 'image' && msg.body.trim() === '[Stiker]')
                );
                const stickerAlreadySaved = Boolean(
                  msg.mediaUrl && savedStickers.some((s) => s.mediaUrl === msg.mediaUrl)
                );

                return (
                  <React.Fragment key={msg.id}>
                    {dateDividerNode}
                    {startDividerNode}
                    <div
                      data-chat-date={msgDateLabel}
                      ref={(el) => {
                        msgElementRefs.current[msg.id] = el;
                      }}
                      className={`group relative flex ${
                        isOutbound ? 'justify-end' : 'justify-start items-start'
                      } ${isGroupInbound ? 'gap-2' : ''} ${
                        isSenderSwitch ? 'mt-2.5' : ''
                      }`}
                    >
                      {isGroupInbound && (() => {
                        if (!isFirstInSenderRun) {
                          return <div className="w-7 shrink-0" aria-hidden="true" />;
                        }
                        const cleanPhone = msg.senderPhone ? msg.senderPhone.replace(/\D/g, '') : '';
                        const jidToken = msg.senderJid ? msg.senderJid.replace(/@.*$/, '').toLowerCase() : '';
                        const lookup =
                          (cleanPhone ? participantsLookup.get(cleanPhone) : undefined) ||
                          (jidToken ? participantsLookup.get(jidToken) : undefined);
                        const avatarUrl = msg.senderAvatarUrl || lookup?.avatarUrl || null;
                        const senderDisplayName = resolveMessageSenderName(msg);
                        const colorSeed = msg.senderJid || msg.senderPhone || msg.senderName || senderDisplayName;
                        return (
                          <div className="w-7 shrink-0 pt-0.5">
                            <ContactAvatar
                              url={avatarUrl}
                              label={senderDisplayName}
                              className={`w-7 h-7 rounded-full text-white font-semibold text-[10px] shadow-2xs ${getParticipantAvatarBgClass(
                                colorSeed
                              )}`}
                              title={`${senderDisplayName} (klik untuk info kontak)`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenMentionContact({
                                  name: senderDisplayName,
                                  phone: cleanPhone || null,
                                  jid: msg.senderJid || null,
                                  contactId: lookup?.contactId || null,
                                  role: lookup?.role,
                                  avatarUrl,
                                });
                              }}
                            />
                          </div>
                        );
                      })()}
                      <div
                        className={`relative flex flex-col ${isOutbound ? 'items-end' : 'items-start'} ${
                          isGroupInbound ? 'max-w-[calc(100%-2.5rem)]' : 'max-w-[90%]'
                        } sm:max-w-[80%] md:max-w-[540px] lg:max-w-[580px] xl:max-w-[620px] min-w-0 transition-all duration-300 ${
                          highlightedMessageId === msg.id
                            ? 'scale-[1.02] ring-2 ring-indigo-500 ring-offset-2 rounded-lg'
                            : ''
                        }`}
                      >
                        <div
                          className={`w-full min-w-0 rounded-lg px-3 py-2 text-[13px] sm:text-sm border leading-snug space-y-1 shadow-2xs ${
                            isCsatHighlighted ? 'ring-2 ring-amber-400' : ''
                          } ${
                            isRevoked
                              ? 'bg-rose-50/85 border-rose-300 text-rose-950'
                              : isStickerMsg && msg.mediaUrl
                              ? 'bg-transparent border-transparent px-1 py-1'
                              : isFailed
                              ? 'bg-red-50/70 border-red-200 text-gray-900'
                              : isCsat
                              ? 'bg-amber-50/60 border-amber-200 text-gray-900'
                              : isOutbound
                              ? 'bg-slate-100/90 border-slate-200 text-gray-950'
                              : 'bg-white border-gray-200/90 text-gray-950'
                          }`}
                        >
                        {isRevoked && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-100/90 border border-rose-300 text-[11px] font-semibold text-rose-900">
                            <Trash2 className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                            <span>
                              {msgMeta?.revokedBySender || (!isOutbound && msgMeta?.revokeScope !== 'ME')
                                ? 'Pesan ditarik oleh pengirim'
                                : msgMeta?.revokeScope === 'EVERYONE'
                                ? 'Pesan ditarik (WhatsApp & CRM)'
                                : msgMeta?.revokeScope === 'ME'
                                ? 'Pesan dihapus di CRM'
                                : 'Pesan ditarik oleh pengirim'}
                              {msgMeta?.revokedBy &&
                                msgMeta.revokedBy !== 'Pengirim' && (
                                  <span className="font-normal"> • oleh {msgMeta.revokedBy}</span>
                                )}
                              {msgMeta?.revokedAt && (
                                <span className="ml-1 text-[10px] font-mono font-normal opacity-80">
                                  ({new Date(msgMeta.revokedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                        {!isOutbound &&
                          !isCsat &&
                          selectedConversation.isGroup &&
                          isFirstInSenderRun && (() => {
                            const senderDisplayName = resolveMessageSenderName(msg);
                            const cleanPhone = msg.senderPhone ? msg.senderPhone.replace(/\D/g, '') : '';
                            const jidToken = msg.senderJid ? msg.senderJid.replace(/@.*$/, '').toLowerCase() : '';
                            const lookup =
                              (cleanPhone ? participantsLookup.get(cleanPhone) : undefined) ||
                              (jidToken ? participantsLookup.get(jidToken) : undefined);
                            const avatarUrl = msg.senderAvatarUrl || lookup?.avatarUrl || null;
                            const targetContactId = lookup?.contactId || null;
                            return (
                              <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenMentionContact({
                                      name: senderDisplayName,
                                      phone: cleanPhone || null,
                                      jid: msg.senderJid || null,
                                      contactId: targetContactId,
                                      role: lookup?.role,
                                      avatarUrl,
                                    });
                                  }}
                                  title={`Klik untuk info kontak ${senderDisplayName}`}
                                  className="inline-flex items-center gap-2 min-w-0 max-w-full text-left group/sender cursor-pointer hover:opacity-85"
                                >
                                  <span
                                    className={`text-xs sm:text-[13px] font-semibold truncate group-hover/sender:underline ${getParticipantColorClass(
                                      msg.senderJid || msg.senderPhone || msg.senderName
                                    )}`}
                                  >
                                    {senderDisplayName}
                                  </span>
                                  {msg.senderPhone &&
                                    senderDisplayName !== `+${msg.senderPhone}` && (
                                      <span className="text-[10px] sm:text-[11px] font-mono text-gray-400 group-hover/sender:text-indigo-600 shrink-0">
                                        +{msg.senderPhone}
                                      </span>
                                    )}
                                </button>
                              </div>
                            );
                          })()}

                        {isOutbound && !isCsat && (() => {
                          const sentVia = msgMeta?.sentVia;
                          const isExternalDevice =
                            sentVia === 'WHATSAPP_WEB' ||
                            sentVia === 'WHATSAPP_PHONE' ||
                            sentVia === 'WHATSAPP_DEVICE' ||
                            sentVia === 'WHATSAPP_API' ||
                            msg.senderName === 'WhatsApp Langsung';
                          const isAiBot = sentVia === 'AI_BOT';
                          const isBroadcast = sentVia === 'BROADCAST';

                          if (isExternalDevice) {
                            const originLabel =
                              msgMeta?.sentViaLabel ||
                              (sentVia === 'WHATSAPP_WEB'
                                ? 'WhatsApp Web'
                                : sentVia === 'WHATSAPP_PHONE'
                                ? 'WhatsApp HP'
                                : 'WhatsApp HP / Web');
                            return (
                              <div className="flex items-center justify-end gap-1 pb-1 border-b border-slate-200/70">
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600 text-[10px] font-medium"
                                  title="Pesan dikirim langsung dari perangkat/sesi WhatsApp di luar CRM"
                                >
                                  {sentVia === 'WHATSAPP_WEB' ? (
                                    <Monitor className="w-2.5 h-2.5 shrink-0 text-slate-500" />
                                  ) : (
                                    <Smartphone className="w-2.5 h-2.5 shrink-0 text-slate-500" />
                                  )}
                                  <span>{originLabel}</span>
                                </span>
                              </div>
                            );
                          }

                          if (isAiBot) {
                            return (
                              <div className="flex items-center justify-end gap-1 pb-1 border-b border-slate-200/70">
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-700">
                                  <Sparkles className="w-2.5 h-2.5 shrink-0" />
                                  <span>{msgMeta?.sentViaLabel || msg.senderName || 'Bot AI'}</span>
                                </span>
                              </div>
                            );
                          }

                          if (isBroadcast) {
                            return (
                              <div className="flex items-center justify-end gap-1 pb-1 border-b border-slate-200/70">
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600">
                                  <Send className="w-2.5 h-2.5 shrink-0" />
                                  <span>{msgMeta?.sentViaLabel || msg.senderName || 'Siaran Terjadwal'}</span>
                                </span>
                              </div>
                            );
                          }

                          if (sentVia === 'CRM' || msg.senderName) {
                            return (
                              <div className="flex items-center justify-end gap-1.5 pb-1 border-b border-slate-200/70 text-[10px] text-slate-600">
                                <span className="font-semibold text-slate-800 truncate max-w-[180px]">
                                  {msg.senderName || msgMeta?.actorName || 'Tim CS'}
                                </span>
                                <span className="px-1 py-0.2 rounded bg-white border border-slate-200 text-[9px] font-mono text-slate-600 shrink-0">
                                  CRM
                                </span>
                              </div>
                            );
                          }

                          return null;
                        })()}

                        {(msgMeta?.forwarded ||
                          (msgMeta?.forwardingScore && msgMeta.forwardingScore > 0) ||
                          msgMeta?.forwardedFromChannel ||
                          msgMeta?.forwardedFromSender) && (
                          <div className="flex items-center gap-1 text-[10px] italic text-gray-500 pb-0.5">
                            <Forward className="w-3 h-3 shrink-0" />
                            <span className="truncate">
                              {Number(msgMeta?.forwardingScore || 1) >= 5
                                ? 'Diteruskan berkali-kali'
                                : 'Diteruskan'}
                              {msgMeta?.forwardedFromChannel
                                ? ` • dari Saluran ${msgMeta.forwardedFromChannel}`
                                : msgMeta?.forwardedFromSender
                                ? ` • dari ${msgMeta.forwardedFromSender}`
                                : ''}
                            </span>
                          </div>
                        )}

                        {(msg.replyToBody || msg.replyToMessageId) && (
                          <button
                            type="button"
                            onClick={() => handleJumpToMessage(msg.replyToMessageId, msg.replyToBody)}
                            className="w-full text-left px-2.5 py-1.5 rounded-md bg-slate-100/80 hover:bg-slate-200/70 border-l-[3px] border-indigo-600 text-xs space-y-0.5 transition-colors cursor-pointer group"
                            title="Klik untuk melompat ke pesan yang dikutip"
                          >
                            <div className="font-semibold text-indigo-700 truncate flex items-center gap-1 text-[11px] sm:text-xs">
                              <Reply className="w-3 h-3 shrink-0 inline text-indigo-600" />
                              <span>{resolveReplySenderLabel(msg)}</span>
                            </div>
                            <div className="text-gray-800 truncate text-[11px] sm:text-xs font-normal">
                              {formatMentionPlainText(
                                msg.replyToBody || 'Pesan dikutip',
                                mySessionPhones,
                                contactsByPhone,
                                participantsLookup,
                                msg.mentionedContacts
                              )}
                            </div>
                          </button>
                        )}

                        {isCsat && (
                          <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                            <span>Permintaan Rating CSAT</span>
                          </div>
                        )}

                        {msg.mediaUrl && msg.mediaType === 'image' && isStickerMsg && (
                          <div className="space-y-1 inline-flex flex-col items-start">
                            <button
                              type="button"
                              onClick={() =>
                                setLightboxMedia({
                                  url: resolveMediaUrl(msg.mediaUrl),
                                  name: msg.mediaName || 'Stiker',
                                })
                              }
                              title="Klik untuk memperbesar stiker"
                              className="block rounded-lg overflow-hidden hover:scale-[1.02] transition-transform"
                            >
                              <img
                                src={resolveMediaUrl(msg.mediaUrl)}
                                alt={msg.mediaName || 'Stiker WhatsApp'}
                                loading="lazy"
                                className="w-28 h-28 sm:w-36 sm:h-36 object-contain drop-shadow-xs"
                              />
                            </button>
                            <button
                              type="button"
                              disabled={savingMsgStickerId === msg.id || stickerAlreadySaved}
                              onClick={() => void handleSaveInboundSticker(msg)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/90 border border-gray-200 text-[10px] font-medium text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-60"
                            >
                              <Sticker className="w-2.5 h-2.5" />
                              <span>
                                {stickerAlreadySaved
                                  ? 'Tersimpan'
                                  : savingMsgStickerId === msg.id
                                  ? 'Menyimpan...'
                                  : 'Simpan Stiker'}
                              </span>
                            </button>
                          </div>
                        )}

                        {msg.mediaUrl && msg.mediaType === 'image' && !isStickerMsg && (
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
                              className="block relative max-w-full rounded border border-gray-200 bg-white overflow-hidden hover:opacity-95 transition-opacity"
                            >
                              <img
                                src={resolveMediaUrl(msg.mediaUrl)}
                                alt={msg.mediaName || 'Lampiran gambar'}
                                loading="lazy"
                                className="max-w-full max-h-60 object-contain"
                              />
                              {msgMeta?.isHd && (
                                <span
                                  title="Foto Kualitas Tinggi (HD)"
                                  className="absolute top-1.5 left-1.5 px-1 py-0.2 rounded bg-black/60 text-white font-bold text-[9px] tracking-wider uppercase pointer-events-none"
                                >
                                  HD
                                </span>
                              )}
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
                                    {renderTextWithClickableLinks(
                                      meta.linkPreview.caption,
                                      participantsLookup,
                                      msg.mentionedContacts,
                                      handleOpenMentionContact,
                                      contactsByPhone,
                                      mySessionPhones
                                    )}
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
                                  {renderTextWithClickableLinks(
                                    meta.interactiveButtons.body,
                                    participantsLookup,
                                    msg.mentionedContacts,
                                    handleOpenMentionContact,
                                    contactsByPhone,
                                    mySessionPhones
                                  )}
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
                          if (meta?.kind === 'LOCATION' && meta.location) {
                            const loc = meta.location;
                            const mapsUrl =
                              loc.url || `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`;
                            return (
                              <div className="rounded-md border border-emerald-200/80 bg-white/95 p-2.5 space-y-1.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800">
                                    <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    <span>{loc.isLive ? 'Live Lokasi Dibagikan' : 'Lokasi Dibagikan'}</span>
                                  </div>
                                  {loc.isLive && (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-semibold uppercase">
                                      Live
                                    </span>
                                  )}
                                </div>
                                {loc.name && (
                                  <div className="font-semibold text-gray-900 text-xs">{loc.name}</div>
                                )}
                                {loc.address && (
                                  <div className="text-[11px] text-gray-600 break-words">{loc.address}</div>
                                )}
                                <div className="text-[10px] font-mono text-gray-500">
                                  {loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)}
                                </div>
                                <a
                                  href={mapsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium transition-colors"
                                >
                                  <Compass className="w-3 h-3" />
                                  <span>Buka Google Maps</span>
                                  <ExternalLink className="w-2.5 h-2.5 opacity-80" />
                                </a>
                              </div>
                            );
                          }
                          const parsedVcardContacts =
                            meta?.kind !== 'CONTACT' && /BEGIN:VCARD/i.test(msg.body || '')
                              ? (msg.body || '')
                                  .split(/END:VCARD/i)
                                  .map((chunk) => chunk.trim())
                                  .filter((chunk) => /BEGIN:VCARD/i.test(chunk))
                                  .map((chunk) => {
                                    const lines = chunk.split(/\r?\n/);
                                    let fullName = '';
                                    let organization = '';
                                    let email = '';
                                    let waId = '';
                                    const phones: string[] = [];
                                    for (const line of lines) {
                                      const upper = line.toUpperCase();
                                      if (upper.startsWith('FN:')) {
                                        fullName = line.slice(3).trim();
                                      } else if (upper.startsWith('ORG:')) {
                                        organization = line.slice(4).replace(/;+$/, '').trim();
                                      } else if (upper.startsWith('EMAIL')) {
                                        const idx = line.indexOf(':');
                                        if (idx >= 0) email = line.slice(idx + 1).trim();
                                      } else if (upper.startsWith('TEL')) {
                                        const idx = line.indexOf(':');
                                        const rawTel = idx >= 0 ? line.slice(idx + 1).trim() : '';
                                        const digits = rawTel.replace(/[^\d]/g, '');
                                        if (digits) {
                                          phones.push(digits);
                                          if (!waId) waId = digits;
                                        }
                                        const waMatch = line.match(/waid=(\d+)/i);
                                        if (waMatch?.[1]) waId = waMatch[1];
                                      }
                                    }
                                    return {
                                      fullName: fullName || (waId ? `+${waId}` : 'Kontak WhatsApp'),
                                      organization: organization || undefined,
                                      email: email || undefined,
                                      waId: waId || undefined,
                                      phones,
                                    };
                                  })
                              : [];
                          const effectiveSharedContacts =
                            meta?.kind === 'CONTACT' && Array.isArray(meta.sharedContacts) && meta.sharedContacts.length > 0
                              ? meta.sharedContacts
                              : parsedVcardContacts;
                          if (effectiveSharedContacts.length > 0) {
                            return (
                              <div className="space-y-1.5">
                                <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700">
                                  <Users className="w-3 h-3" />
                                  <span>
                                    Kartu Kontak Dibagikan ({effectiveSharedContacts.length})
                                  </span>
                                </div>
                                {effectiveSharedContacts.map((sc, scIdx) => {
                                  const primaryPhone = sc.phones?.[0] || sc.waId || '';
                                  const isSavedLocal = Boolean(primaryPhone && savedSharedPhones[primaryPhone]);
                                  return (
                                    <div
                                      key={`${sc.fullName}-${scIdx}`}
                                      className="p-2.5 rounded-md border border-indigo-200/80 bg-white/95 space-y-2"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0">
                                          {sc.fullName.slice(0, 2).toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="font-semibold text-gray-900 text-xs truncate">
                                            {sc.fullName}
                                          </div>
                                          {sc.organization && (
                                            <div className="text-[10px] text-gray-500 truncate">
                                              {sc.organization}
                                            </div>
                                          )}
                                          {primaryPhone && (
                                            <div className="text-[11px] font-mono text-gray-700 mt-0.5">
                                              +{primaryPhone.replace(/^\+/, '')}
                                            </div>
                                          )}
                                          {sc.email && (
                                            <div className="text-[10px] text-gray-500 truncate">
                                              {sc.email}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      {primaryPhone && (
                                        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-gray-100">
                                          <button
                                            type="button"
                                            disabled={savingSharedContactKey === `save:${primaryPhone}`}
                                            onClick={() => void handleSaveOrChatSharedContact(sc, false)}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-medium disabled:opacity-50"
                                          >
                                            <UserPlus className="w-3 h-3" />
                                            <span>
                                              {isSavedLocal
                                                ? 'Tersimpan di CRM'
                                                : savingSharedContactKey === `save:${primaryPhone}`
                                                ? 'Menyimpan...'
                                                : 'Simpan Kontak'}
                                            </span>
                                          </button>
                                          <button
                                            type="button"
                                            disabled={savingSharedContactKey === `chat:${primaryPhone}`}
                                            onClick={() => void handleSaveOrChatSharedContact(sc, true)}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-medium disabled:opacity-50"
                                          >
                                            <MessageSquare className="w-3 h-3" />
                                            <span>
                                              {savingSharedContactKey === `chat:${primaryPhone}`
                                                ? 'Membuka...'
                                                : 'Chat WA'}
                                            </span>
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          }
                          if (meta?.kind === 'ORDER' && meta.order) {
                            return (
                              <div className="p-2.5 rounded-md border border-amber-200 bg-amber-50/70 space-y-1">
                                <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800">
                                  <ShoppingBag className="w-3 h-3" />
                                  <span>Pesanan WhatsApp</span>
                                </div>
                                <div className="font-semibold text-gray-900">{meta.order.title || 'Pesanan'}</div>
                                <div className="text-[11px] text-gray-600">
                                  {meta.order.itemCount ? `${meta.order.itemCount} item` : ''}
                                  {meta.order.totalAmount
                                    ? ` • ${meta.order.currency || 'Rp'} ${new Intl.NumberFormat('id-ID').format(meta.order.totalAmount)}`
                                    : ''}
                                </div>
                              </div>
                            );
                          }
                          if (meta?.kind === 'PRODUCT' && meta.product) {
                            return (
                              <div className="p-2.5 rounded-md border border-indigo-200 bg-white/95 space-y-1">
                                <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700">
                                  <Package className="w-3 h-3" />
                                  <span>Produk Katalog WhatsApp</span>
                                </div>
                                <div className="font-semibold text-gray-900">{meta.product.title}</div>
                                {meta.product.description && (
                                  <p className="text-[11px] text-gray-600 line-clamp-2">{meta.product.description}</p>
                                )}
                                {meta.product.price !== undefined && (
                                  <div className="text-xs font-mono font-semibold text-indigo-700">
                                    {meta.product.currency || 'Rp'} {new Intl.NumberFormat('id-ID').format(meta.product.price)}
                                  </div>
                                )}
                              </div>
                            );
                          }
                          if (meta?.kind === 'GROUP_INVITE' && meta.groupInvite) {
                            return (
                              <div className="p-2.5 rounded-md border border-slate-200 bg-white space-y-1">
                                <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-700">
                                  <Users className="w-3 h-3 text-slate-500" />
                                  <span>Undangan Grup WhatsApp</span>
                                </div>
                                <div className="font-semibold text-gray-900">{meta.groupInvite.groupName}</div>
                                {meta.groupInvite.caption && (
                                  <p className="text-[11px] text-gray-600">{meta.groupInvite.caption}</p>
                                )}
                              </div>
                            );
                          }
                          if (isStickerMsg && msg.mediaUrl) {
                            return null;
                          }
                          if (meta?.kind === 'POLL_VOTE' && meta?.pollVote) {
                            const pv = meta.pollVote;
                            return (
                              <div className="space-y-1.5">
                                <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                                  <BarChart2 className="w-3 h-3" />
                                  <span>Respon Polling</span>
                                </div>
                                {pv.voteFailed ? (
                                  <div className="px-2 py-1.5 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                                    Pelanggan memilih opsi polling, namun isi suara tidak dapat didekripsi oleh WAHA (sesi sempat restart).
                                  </div>
                                ) : pv.selectedOptions.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {pv.selectedOptions.map((opt, oIdx) => (
                                      <span
                                        key={oIdx}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[11px] font-medium text-emerald-800"
                                      >
                                        <Check className="w-3 h-3 shrink-0" />
                                        <span>{opt}</span>
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-[11px] italic text-gray-500">
                                    Membatalkan pilihan polling
                                  </div>
                                )}
                              </div>
                            );
                          }
                          if (meta?.poll) {
                            const votes = Array.isArray(meta.poll.votes) ? meta.poll.votes : [];
                            const totalVoters = votes.filter((v) => Array.isArray(v.selectedOptions) && v.selectedOptions.length > 0).length;
                            const totalSelections = votes.reduce(
                              (sum, v) => sum + (Array.isArray(v.selectedOptions) ? v.selectedOptions.length : 0),
                              0
                            );
                            const failedVotes = votes.filter((v) => v.voteFailed && (!v.selectedOptions || v.selectedOptions.length === 0));
                            return (
                              <div className="space-y-1.5 min-w-[210px]">
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
                                  {meta.poll.options.map((opt, oIdx) => {
                                    const votersForOption = votes.filter(
                                      (v) => Array.isArray(v.selectedOptions) && v.selectedOptions.some((so) => so.trim() === opt.trim())
                                    );
                                    const optCount = votersForOption.length;
                                    const pct = totalSelections > 0 ? Math.round((optCount / Math.max(totalVoters, 1)) * 100) : 0;
                                    return (
                                      <div
                                        key={oIdx}
                                        className={`relative overflow-hidden px-2 py-1.5 rounded border text-[11px] ${
                                          optCount > 0
                                            ? 'bg-emerald-50/50 border-emerald-300 text-gray-900'
                                            : 'bg-white/90 border-gray-200 text-gray-700'
                                        }`}
                                      >
                                        {optCount > 0 && (
                                          <div
                                            className="absolute inset-y-0 left-0 bg-emerald-200/40 pointer-events-none"
                                            style={{ width: `${Math.min(100, Math.max(8, pct))}%` }}
                                          />
                                        )}
                                        <div className="relative flex items-center justify-between gap-2">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <span
                                              className={`w-4 h-4 rounded-full border text-[9px] font-mono flex items-center justify-center shrink-0 ${
                                                optCount > 0
                                                  ? 'border-emerald-500 bg-emerald-600 text-white'
                                                  : 'border-indigo-300 text-indigo-700'
                                              }`}
                                            >
                                              {optCount > 0 ? <Check className="w-2.5 h-2.5" /> : oIdx + 1}
                                            </span>
                                            <span className="truncate font-medium">{opt}</span>
                                          </div>
                                          <span className="text-[10px] font-mono font-semibold text-gray-600 shrink-0 tabular-nums">
                                            {optCount} suara
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                {votes.length > 0 && (
                                  <details className="pt-1 border-t border-gray-200/70 text-[10px] text-gray-600">
                                    <summary className="cursor-pointer select-none font-medium text-indigo-700 hover:underline">
                                      {totalVoters > 0
                                        ? `${totalVoters} pemilih merespons (${votes.length} tercatat)`
                                        : `${failedVotes.length} suara belum terdekripsi`}
                                    </summary>
                                    <div className="mt-1 space-y-1">
                                      {votes.map((v, vIdx) => (
                                        <div
                                          key={`${v.voterId}-${vIdx}`}
                                          className="flex items-start justify-between gap-2 bg-white/80 rounded px-1.5 py-1 border border-gray-200/70"
                                        >
                                          <span className="font-semibold text-gray-800 truncate">
                                            {v.voterName || v.voterPhone || v.voterId}
                                          </span>
                                          <span className="text-right text-gray-600 shrink-0">
                                            {v.selectedOptions.length > 0
                                              ? v.selectedOptions.join(', ')
                                              : v.voteFailed
                                              ? 'Gagal dekripsi'
                                              : 'Batal pilih'}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </details>
                                )}
                              </div>
                            );
                          }
                          if ((msg.mediaType || msg.mediaUrl) && !shouldRenderMediaCaption(msg.body, msg.mediaName, msg.mediaType)) {
                            return null;
                          }
                          return (
                            <div
                              className={`whitespace-pre-wrap break-words text-[13px] sm:text-sm font-normal leading-relaxed ${
                                isRevoked ? 'line-through opacity-70 text-rose-900/80' : 'text-gray-950'
                              }`}
                            >
                              {renderTextWithClickableLinks(
                                msg.body,
                                participantsLookup,
                                msg.mentionedContacts,
                                handleOpenMentionContact,
                                contactsByPhone,
                                mySessionPhones
                              )}
                            </div>
                          );
                        })()}

                        {Array.isArray(msgMeta?.reactions) && msgMeta.reactions.length > 0 && (() => {
                          const grouped = new Map<string, { count: number; byMe: boolean }>();
                          for (const r of msgMeta.reactions) {
                            if (!r?.emoji) continue;
                            const cur = grouped.get(r.emoji) || { count: 0, byMe: false };
                            grouped.set(r.emoji, {
                              count: cur.count + 1,
                              byMe: cur.byMe || Boolean(r.isOutbound && r.actor === 'CS'),
                            });
                          }
                          if (grouped.size === 0) return null;
                          return (
                            <div className="flex flex-wrap items-center gap-1 pt-0.5">
                              {Array.from(grouped.entries()).map(([em, info]) => (
                                <button
                                  key={em}
                                  type="button"
                                  disabled={!canReplyConversation || reactingMsgId === msg.id}
                                  onClick={() => canReplyConversation && void handleReactMessage(msg.id, em)}
                                  title={info.byMe ? 'Klik untuk menghapus reaksi Anda' : 'Klik untuk ikut bereaksi'}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[11px] leading-none transition-colors ${
                                    info.byMe
                                      ? 'bg-indigo-100 border-indigo-300 text-indigo-800 font-semibold'
                                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                  }`}
                                >
                                  <span>{em}</span>
                                  {info.count > 1 && <span className="text-[10px] font-mono">{info.count}</span>}
                                </button>
                              ))}
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
                          {msgMeta?.isPinned && (
                            <span title="Pesan disematkan" className="inline-flex">
                              <Pin className="w-3 h-3 text-indigo-500 fill-indigo-400 rotate-45 shrink-0" />
                            </span>
                          )}
                          {msgMeta?.isStarred && (
                            <span title="Pesan berbintang" className="inline-flex">
                              <Star className="w-3 h-3 text-amber-500 fill-amber-400 shrink-0" />
                            </span>
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

                        {/* Message Actions (Balas, Teruskan, Pin, Bintang, Reaksi, Hapus) — muncul di bawah bubble dengan membuka ruang tanpa menimpa pesan lain */}
                        {!isRevoked && (canReplyConversation || canManageConversation) && (
                          <div
                            className={`w-full grid transition-[grid-template-rows,opacity,margin] duration-150 ease-out ${
                              activeReactionMsgId === msg.id
                                ? 'grid-rows-[1fr] opacity-100 mt-1.5'
                                : 'grid-rows-[1fr] opacity-100 mt-1 md:grid-rows-[0fr] md:opacity-0 md:mt-0 md:pointer-events-none md:group-hover:grid-rows-[1fr] md:group-hover:opacity-100 md:group-hover:mt-1.5 md:group-hover:pointer-events-auto md:group-focus-within:grid-rows-[1fr] md:group-focus-within:opacity-100 md:group-focus-within:mt-1.5 md:group-focus-within:pointer-events-auto'
                            }`}
                          >
                            <div className="overflow-hidden min-h-0">
                              <div
                                className={`flex flex-wrap items-center gap-1 px-0.5 py-0.5 text-[10px] ${
                                  isOutbound ? 'justify-end' : 'justify-start'
                                }`}
                              >
                            {canReplyConversation && (
                              <button
                                type="button"
                                onClick={() => {
                                  setReplyingToMessage(msg);
                                  setComposerMode('REPLY');
                                  replyInputRef.current?.focus();
                                }}
                                title="Balas pesan ini"
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-gray-200 bg-white hover:bg-indigo-50 hover:border-indigo-200 text-indigo-700 font-medium shadow-2xs transition-colors"
                              >
                                <Reply className="w-2.5 h-2.5" />
                                <span>Balas</span>
                              </button>
                            )}
                            {canReplyConversation && !isCsat && (
                              <button
                                type="button"
                                onClick={() => {
                                  setForwardingMessage(msg);
                                  setForwardSearch('');
                                  setForwardTargetConvId('');
                                }}
                                title="Teruskan pesan ke chat lain"
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-gray-200 bg-white hover:bg-emerald-50 hover:border-emerald-200 text-gray-700 hover:text-emerald-700 font-medium shadow-2xs transition-colors"
                              >
                                <Forward className="w-2.5 h-2.5" />
                                <span>Teruskan</span>
                              </button>
                            )}
                            {canReplyConversation && (
                              <button
                                type="button"
                                onClick={() => void handleStartPinMessage(msg)}
                                title={msgMeta?.isPinned ? 'Lepas sematan' : 'Sematkan pesan'}
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-medium shadow-2xs transition-colors ${
                                  msgMeta?.isPinned
                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                    : 'border-gray-200 bg-white hover:bg-indigo-50 text-gray-600 hover:text-indigo-700'
                                }`}
                              >
                                {msgMeta?.isPinned ? <PinOff className="w-2.5 h-2.5" /> : <Pin className="w-2.5 h-2.5" />}
                                <span>{msgMeta?.isPinned ? 'Lepas Pin' : 'Pin'}</span>
                              </button>
                            )}
                            {canReplyConversation && (
                              <button
                                type="button"
                                onClick={() => void handleToggleStarMessage(msg)}
                                title={msgMeta?.isStarred ? 'Hapus bintang' : 'Beri bintang'}
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-medium shadow-2xs transition-colors ${
                                  msgMeta?.isStarred
                                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                                    : 'border-gray-200 bg-white hover:bg-amber-50 text-gray-600 hover:text-amber-700'
                                }`}
                              >
                                <Star className={`w-2.5 h-2.5 ${msgMeta?.isStarred ? 'fill-amber-400 text-amber-500' : ''}`} />
                                <span>{msgMeta?.isStarred ? 'Favorit' : 'Bintang'}</span>
                              </button>
                            )}
                            {canReplyConversation && (
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveReactionMsgId((prev) => (prev === msg.id ? null : msg.id))
                                }
                                title="Beri reaksi emoji"
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-medium shadow-2xs transition-colors ${
                                  activeReactionMsgId === msg.id
                                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                                    : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-600'
                                }`}
                              >
                                <SmilePlus className="w-2.5 h-2.5" />
                                <span>Reaksi</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setDeleteMessageTarget(msg)}
                              title="Hapus Pesan (Tarik / Hapus Pribadi)"
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-gray-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-gray-600 hover:text-rose-600 font-medium shadow-2xs transition-colors"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                              <span>Hapus</span>
                            </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {!isRevoked && activeReactionMsgId === msg.id && (
                          <div className="mt-1 p-1 rounded-full bg-white border border-gray-200 shadow-sm inline-flex items-center gap-0.5 flex-wrap">
                            {QUICK_REACTION_EMOJIS.map((em) => (
                              <button
                                key={em}
                                type="button"
                                disabled={reactingMsgId === msg.id}
                                onClick={() => void handleReactMessage(msg.id, em)}
                                className="h-7 w-7 rounded-full hover:bg-indigo-50 text-sm flex items-center justify-center transition-transform hover:scale-110 disabled:opacity-50"
                              >
                                {em}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setActiveReactionMsgId(null)}
                              className="h-6 w-6 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 inline-flex items-center justify-center"
                              aria-label="Tutup pilihan reaksi"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {endDividerNodes}
                  </React.Fragment>
                );
              });
              const trailingStartNode = trailingStartBanner ? (
                <div className="flex items-center gap-2 py-1.5">
                  <div className="flex-1 h-px bg-indigo-200" />
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-[10px] font-medium text-indigo-800">
                    <Play className="w-2.5 h-2.5 fill-indigo-600 text-indigo-600 shrink-0" />
                    <span>
                      Batas Mulai Sesi #{trailingStartBanner.number} •{' '}
                      {formatDividerTime(trailingStartBanner.timestamp)}
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-900 font-semibold text-[9px]">
                      Sesi Berjalan
                    </span>
                  </span>
                  <div className="flex-1 h-px bg-indigo-200" />
                </div>
              ) : null;
              return (
                <>
                  {renderedItems}
                  {trailingStartNode}
                </>
              );
            })()}
            {(() => {
              const groupTypers = Object.values(
                groupPresenceByConvId[selectedConversation.id] || {}
              );
              const singleStatus = presenceByConvId[selectedConversation.id]?.status;
              const isSingleActive = singleStatus === 'typing' || singleStatus === 'recording';
              if (groupTypers.length === 0 && !isSingleActive) return null;

              const isRecording =
                groupTypers.length > 0
                  ? groupTypers.every((t) => t.status === 'recording')
                  : singleStatus === 'recording';
              const labelText =
                groupTypers.length > 0
                  ? groupTypers.length === 1
                    ? `${groupTypers[0].name} ${isRecording ? 'sedang merekam audio...' : 'sedang mengetik...'}`
                    : groupTypers.length === 2
                    ? `${groupTypers[0].name} & ${groupTypers[1].name} ${isRecording ? 'sedang merekam audio...' : 'sedang mengetik...'}`
                    : `${groupTypers[0].name}, ${groupTypers[1].name}, +${groupTypers.length - 2} ${isRecording ? 'sedang merekam audio...' : 'sedang mengetik...'}`
                  : isRecording
                  ? 'Sedang merekam audio...'
                  : 'Sedang mengetik...';

              const avatars =
                groupTypers.length > 0
                  ? groupTypers.slice(0, 4).map((t, idx) => ({
                      key: `${t.name}-${idx}`,
                      name: t.name,
                      url: t.avatarUrl || undefined,
                    }))
                  : [
                      {
                        key: selectedConversation.id,
                        name: getConversationDisplayTitle(selectedConversation),
                        url: selectedConversation.contact?.profile_picture_url || undefined,
                      },
                    ];

              return (
                <>
                  <div className="flex justify-start my-1">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg rounded-tl-xs bg-white border border-gray-200 text-xs text-gray-600 shadow-2xs">
                      <div className="flex items-center -space-x-1.5 shrink-0">
                        {avatars.map((av) => (
                          <ContactAvatar
                            key={av.key}
                            url={av.url}
                            label={av.name}
                            className="w-5 h-5 rounded-full ring-2 ring-white bg-slate-600 text-white text-[9px] font-semibold"
                          />
                        ))}
                      </div>
                      <span className="inline-flex items-center gap-0.5 shrink-0" aria-hidden="true">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.2s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.1s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" />
                      </span>
                      <span className="font-medium text-emerald-700">{labelText}</span>
                    </div>
                  </div>
                </>
              );
            })()}
            <div ref={messagesEndRef} />
            </div>
            {(() => {
              const groupTypers = Object.values(
                groupPresenceByConvId[selectedConversation.id] || {}
              );
              const activeChatPresence = presenceByConvId[selectedConversation.id]?.status;
              const isSingleActive =
                activeChatPresence === 'typing' || activeChatPresence === 'recording';
              const showFloatingPresence =
                !isAtChatBottom && (groupTypers.length > 0 || isSingleActive);
              if (!showFloatingPresence && pendingNewMsgCount <= 0) return null;

              const isRecording =
                groupTypers.length > 0
                  ? groupTypers.every((t) => t.status === 'recording')
                  : activeChatPresence === 'recording';
              const floatingLabel =
                groupTypers.length > 0
                  ? groupTypers.length === 1
                    ? `${groupTypers[0].name} ${isRecording ? 'sedang merekam audio...' : 'sedang mengetik...'}`
                    : groupTypers.length === 2
                    ? `${groupTypers[0].name} & ${groupTypers[1].name} ${isRecording ? 'sedang merekam audio...' : 'sedang mengetik...'}`
                    : `${groupTypers[0].name}, ${groupTypers[1].name}, +${groupTypers.length - 2} ${isRecording ? 'sedang merekam audio...' : 'sedang mengetik...'}`
                  : isRecording
                  ? 'Sedang merekam audio...'
                  : 'Sedang mengetik...';

              const avatars =
                groupTypers.length > 0
                  ? groupTypers.slice(0, 4).map((t, idx) => ({
                      key: `${t.name}-${idx}`,
                      name: t.name,
                      url: t.avatarUrl || undefined,
                    }))
                  : [
                      {
                        key: selectedConversation.id,
                        name: getConversationDisplayTitle(selectedConversation),
                        url: selectedConversation.contact?.profile_picture_url || undefined,
                      },
                    ];

              return (
                <>
                  {showFloatingPresence && (
                    <button
                      type="button"
                      onClick={() => scrollToBottom('smooth')}
                      className="absolute bottom-3 left-4 z-20 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/95 hover:bg-white text-emerald-700 text-xs font-semibold shadow-md border border-emerald-200 backdrop-blur-xs transition-all cursor-pointer max-w-[calc(100%-2rem)]"
                    >
                      <div className="flex items-center -space-x-1.5 shrink-0">
                        {avatars.map((av) => (
                          <ContactAvatar
                            key={av.key}
                            url={av.url}
                            label={av.name}
                            className="w-5 h-5 rounded-full ring-2 ring-white bg-slate-600 text-white text-[9px] font-semibold"
                          />
                        ))}
                      </div>
                      <span className="inline-flex items-center gap-0.5 shrink-0" aria-hidden="true">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.2s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.1s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" />
                      </span>
                      <span className="truncate">{floatingLabel}</span>
                    </button>
                  )}
                  {pendingNewMsgCount > 0 && (
                    <button
                      type="button"
                      onClick={() => scrollToBottom('smooth')}
                      className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md border border-indigo-500 transition-all cursor-pointer"
                    >
                      <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {pendingNewMsgCount > 1 ? `${pendingNewMsgCount} pesan baru` : 'Pesan baru'}
                      </span>
                    </button>
                  )}
                </>
              );
            })()}
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
          <div className="bg-white border-t border-gray-200 p-2 sm:p-2.5 space-y-1.5 shrink-0">

            {composerMode === 'NOTE' && (
              <div className="sm:hidden flex items-center justify-between gap-2 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                <span className="inline-flex items-center gap-1 font-medium truncate">
                  <StickyNote className="w-3 h-3 text-amber-600 shrink-0" />
                  Mode Catatan Internal (Tim)
                </span>
                {canReplyConversation && (
                  <button
                    type="button"
                    onClick={() => setComposerMode('REPLY')}
                    className="font-semibold text-indigo-700 hover:underline shrink-0"
                  >
                    Mode Balas
                  </button>
                )}
              </div>
            )}

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
                      Membalas {resolveMessageSenderName(replyingToMessage)}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 truncate">
                    {formatMentionPlainText(
                      replyingToMessage.body || '',
                      mySessionPhones,
                      contactsByPhone,
                      participantsLookup
                    )}
                  </p>
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

            {pendingAttachments.length > 0 && (
              <div className="space-y-1.5 p-2 rounded-lg bg-indigo-50/70 border border-indigo-200 text-xs">
                <div className="flex items-center justify-between gap-2 pb-1 border-b border-indigo-100">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-indigo-950 text-[11px]">
                      {pendingAttachments.length} Lampiran Dipilih
                    </span>
                    {pendingAttachments.some((a) => a.kind === 'image' && !a.asDocument) && (
                      <button
                        type="button"
                        onClick={() => void handleToggleHdMode()}
                        title={
                          isHdMode
                            ? 'Mode HD Aktif: Foto dikirim resolusi tinggi asli'
                            : 'Mode Standar Aktif: Foto dikompresi WhatsApp (hemat kuota)'
                        }
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                          isHdMode
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                        }`}
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>HD</span>
                        <span className="text-[9px] font-normal opacity-90">
                          {isHdMode ? 'Aktif' : 'Standar'}
                        </span>
                      </button>
                    )}
                    {pendingAttachments.some((a) => a.asDocument) && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-100 text-gray-600 border border-gray-200">
                        Mode Berkas Dokumen (Tanpa Pratinjau Foto)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      title="Tambah Foto atau Video dari Perangkat"
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 transition-colors inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Foto</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => docInputRef.current?.click()}
                      title="Tambah Dokumen / Berkas dari Perangkat"
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Berkas</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenMediaLibraryModal('CHAT_ATTACHMENT')}
                      title="Pilih Foto atau Dokumen dari Galeri"
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium text-emerald-700 bg-white border border-emerald-200 hover:bg-emerald-50 transition-colors inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      <FolderOpen className="w-3 h-3" />
                      <span>Galeri</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingAttachments([])}
                      title="Batalkan Semua Lampiran"
                      className="p-1 rounded text-gray-400 hover:text-red-600 transition-colors"
                      aria-label="Batalkan semua lampiran"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto py-1">
                  {pendingAttachments.map((item, idx) => (
                    <div
                      key={item.id}
                      className="relative shrink-0 flex items-center gap-2 p-1.5 rounded-md bg-white border border-indigo-200/90 shadow-2xs max-w-[210px]"
                    >
                      {item.kind === 'image' && !item.asDocument && (item.base64 || item.previewUrl) ? (
                        <div className="relative w-10 h-10 rounded overflow-hidden border border-gray-200 shrink-0">
                          <img
                            src={item.base64 || item.previewUrl}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                          {isHdMode && (
                            <span className="absolute bottom-0 right-0 bg-emerald-600 text-white text-[8px] font-bold px-0.5 rounded-tl">
                              HD
                            </span>
                          )}
                        </div>
                      ) : item.kind === 'video' ? (
                        <div className="w-10 h-10 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                          <Video className="w-4 h-4" />
                        </div>
                      ) : item.kind === 'audio' ? (
                        <div className="w-10 h-10 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                          <Music className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded bg-gray-100 text-gray-700 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1 pr-4">
                        <div className="font-mono text-[11px] truncate text-gray-900" title={item.name}>
                          {item.name}
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono">
                          {item.mediaUrl ? 'GALERI • ' : ''}
                          {item.asDocument ? 'DOKUMEN' : item.kind.toUpperCase()} •{' '}
                          {item.size >= 1024 * 1024
                            ? `${(item.size / (1024 * 1024)).toFixed(1)} MB`
                            : `${Math.max(1, Math.round(item.size / 1024))} KB`}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))
                        }
                        title={`Hapus ${item.name}`}
                        className="absolute top-1 right-1 p-0.5 rounded text-gray-400 hover:text-red-600 hover:bg-gray-100 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="relative">
              {showEmojiPicker && (
                <div className="absolute bottom-full left-0 mb-2 z-30 bg-white border border-gray-200 rounded-xl shadow-xl p-3 w-[340px] sm:w-[410px] max-w-[calc(100vw-1.5rem)] space-y-2.5">
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-gray-100">
                    <div className="inline-flex rounded-md border border-gray-200 p-0.5 bg-gray-50 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setEmojiPickerTab('EMOJI')}
                        className={`px-2.5 py-1 rounded font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                          emojiPickerTab === 'EMOJI'
                            ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <Smile className="w-3.5 h-3.5" />
                        <span>Emotikon</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmojiPickerTab('STICKER')}
                        className={`px-2.5 py-1 rounded font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                          emojiPickerTab === 'STICKER'
                            ? 'bg-white text-violet-700 shadow-2xs font-semibold'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>
                          Stiker ({whatsappStickers.length + savedStickers.length + PRESET_STICKER_TEMPLATES.length})
                        </span>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowEmojiPicker(false)}
                      title="Tutup panel emotikon & stiker"
                      className="h-6 w-6 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 inline-flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {emojiPickerTab === 'EMOJI' ? (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Cari emotikon (mis. senyum, paket, ok, love)..."
                          value={emojiSearch}
                          onChange={(e) => setEmojiSearch(e.target.value)}
                          className="w-full h-8 pl-7 pr-6 bg-gray-50 border border-gray-200 rounded-md text-[11px] focus:outline-none focus:bg-white focus:border-indigo-500"
                        />
                        {emojiSearch && (
                          <button
                            type="button"
                            onClick={() => setEmojiSearch('')}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {!emojiSearch.trim() && recentEmojis.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                            Sering Dipakai
                          </span>
                          <div className="grid grid-cols-8 gap-1">
                            {recentEmojis.slice(0, 8).map((em) => (
                              <button
                                key={`rec-${em}`}
                                type="button"
                                onClick={() => handleInsertEmoji(em)}
                                className="h-8 rounded hover:bg-indigo-50 text-lg flex items-center justify-center transition-transform hover:scale-110 cursor-pointer"
                              >
                                {em}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {!emojiSearch.trim() && (
                        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                          {EMOJI_CATEGORIES.map((cat) => (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => setEmojiCategoryId(cat.id)}
                              className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap shrink-0 inline-flex items-center gap-1 border cursor-pointer ${
                                emojiCategoryId === cat.id
                                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              <span>{cat.icon}</span>
                              <span>{cat.label}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="max-h-52 overflow-y-auto pb-1">
                        {(() => {
                          const q = emojiSearch.trim().toLowerCase();
                          const list = q
                            ? EMOJI_CATEGORIES.flatMap((c) => c.items).filter(
                                (item) => item.keywords.includes(q) || item.char === q
                              )
                            : EMOJI_CATEGORIES.find((c) => c.id === emojiCategoryId)?.items || [];
                          if (list.length === 0) {
                            return (
                              <div className="py-5 text-center text-[11px] text-gray-400">
                                Tidak ada emotikon cocok dengan "{emojiSearch}".
                              </div>
                            );
                          }
                          return (
                            <div className="grid grid-cols-8 gap-1">
                              {list.map((item) => (
                                <button
                                  key={`${emojiCategoryId}-${item.char}`}
                                  type="button"
                                  onClick={() => handleInsertEmoji(item.char)}
                                  title={item.keywords}
                                  className="h-8 rounded hover:bg-indigo-50 text-lg flex items-center justify-center transition-transform hover:scale-110 cursor-pointer"
                                >
                                  {item.char}
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <input
                        ref={stickerInputRef}
                        type="file"
                        accept="image/webp,image/png,image/jpeg,image/gif"
                        onChange={(e) => void handleUploadNewSticker(e)}
                        className="hidden"
                      />

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 overflow-x-auto text-[10px]">
                          {(
                            [
                              { id: 'all', label: 'Semua' },
                              { id: 'whatsapp', label: `Chat WA (${whatsappStickers.length})` },
                              { id: 'saved', label: `Favorit (${savedStickers.length})` },
                              { id: 'preset', label: `CS (${PRESET_STICKER_TEMPLATES.length})` },
                            ] as const
                          ).map((stTab) => (
                            <button
                              key={stTab.id}
                              type="button"
                              onClick={() => setStickerSubTab(stTab.id)}
                              className={`px-2 py-1 rounded font-medium whitespace-nowrap border cursor-pointer transition-colors ${
                                stickerSubTab === stTab.id
                                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-semibold'
                                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              {stTab.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={savingSticker}
                            onClick={() => handleOpenMediaLibraryModal('STICKER')}
                            title="Pilih gambar dari Galeri menjadi Stiker"
                          >
                            <FolderOpen className="w-3 h-3" />
                            <span>Galeri</span>
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            isLoading={savingSticker}
                            onClick={() => stickerInputRef.current?.click()}
                          >
                            <Plus className="w-3 h-3" />
                            <span>Unggah</span>
                          </Button>
                        </div>
                      </div>

                      <div className="max-h-72 overflow-y-auto pr-0.5 pb-1.5 space-y-3">
                        {(stickerSubTab === 'all' || stickerSubTab === 'whatsapp') && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                                Stiker dari Chat WhatsApp ({whatsappStickers.length})
                              </span>
                            </div>
                            {whatsappStickers.length > 0 ? (
                              <div className="grid grid-cols-4 gap-2">
                                {whatsappStickers.map((st) => (
                                  <div
                                    key={st.id}
                                    className="relative group rounded-lg border border-gray-200 bg-gray-50/70 p-1.5 flex flex-col items-center hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors"
                                  >
                                    <button
                                      type="button"
                                      disabled={sending}
                                      onClick={() => void handleSendSavedSticker(st)}
                                      title={`Kirim stiker WA: ${st.name}`}
                                      className="w-full aspect-square flex items-center justify-center disabled:opacity-50 cursor-pointer"
                                    >
                                      <img
                                        src={resolveMediaUrl(st.mediaUrl)}
                                        alt={st.name}
                                        loading="lazy"
                                        className="max-w-full max-h-full object-contain"
                                      />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async (ev) => {
                                        ev.stopPropagation();
                                        try {
                                          const { sticker } = await api.saveSticker({
                                            name: st.name,
                                            mediaUrl: st.mediaUrl,
                                          });
                                          setSavedStickers((prev) => [
                                            sticker,
                                            ...prev.filter((s) => s.id !== sticker.id),
                                          ]);
                                          setWhatsappStickers((prev) =>
                                            prev.filter((s) => s.mediaUrl !== st.mediaUrl)
                                          );
                                          toast.success('Stiker difavoritkan ke koleksi');
                                        } catch {
                                          toast.error('Gagal menyimpan stiker');
                                        }
                                      }}
                                      title="Favoritkan ke Koleksi Stiker"
                                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-white border border-gray-200 text-gray-500 hover:text-indigo-600 shadow-xs inline-flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                                    >
                                      <BookmarkPlus className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="px-3 py-2 rounded-md bg-gray-50 border border-dashed border-gray-200 text-[10px] text-gray-500 text-center">
                                Belum ada stiker WebP dari riwayat chat WhatsApp. Stiker yang dikirim atau diterima di chat akan muncul otomatis di sini.
                              </div>
                            )}
                          </div>
                        )}

                        {(stickerSubTab === 'all' || stickerSubTab === 'saved') && (
                          <div className="space-y-1.5 pt-1 border-t border-gray-100">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 block">
                              Koleksi Stiker Favorit ({savedStickers.length})
                            </span>
                            {savedStickers.length > 0 ? (
                              <div className="grid grid-cols-4 gap-2">
                                {savedStickers.map((st) => (
                                  <div
                                    key={st.id}
                                    className="relative group rounded-lg border border-gray-200 bg-gray-50/70 p-1.5 flex flex-col items-center hover:border-indigo-300 transition-colors"
                                  >
                                    <button
                                      type="button"
                                      disabled={sending}
                                      onClick={() => void handleSendSavedSticker(st)}
                                      title={`Kirim stiker: ${st.name}`}
                                      className="w-full aspect-square flex items-center justify-center disabled:opacity-50 cursor-pointer"
                                    >
                                      <img
                                        src={resolveMediaUrl(st.mediaUrl)}
                                        alt={st.name}
                                        loading="lazy"
                                        className="max-w-full max-h-full object-contain"
                                      />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteSavedSticker(st.id)}
                                      title="Hapus stiker dari favorit"
                                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-600 shadow-xs inline-flex items-center justify-center cursor-pointer"
                                    >
                                      <X className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="px-3 py-2 rounded-md bg-gray-50 border border-dashed border-gray-200 text-[10px] text-gray-500 text-center">
                                Unggah gambar/WebP atau klik ikon simpan pada stiker dari chat WA untuk menyimpannya di sini.
                              </div>
                            )}
                          </div>
                        )}

                        {(stickerSubTab === 'all' || stickerSubTab === 'preset') && (
                          <div className="space-y-1.5 pt-1 border-t border-gray-100">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 block">
                              Stiker Cepat Layanan CS (1-Klik Kirim)
                            </span>
                            <div className="grid grid-cols-3 gap-1.5">
                              {PRESET_STICKER_TEMPLATES.map((tpl) => (
                                <button
                                  key={tpl.id}
                                  type="button"
                                  disabled={sending}
                                  onClick={() => void handleSendPresetSticker(tpl)}
                                  style={{ backgroundColor: tpl.bgHex, borderColor: tpl.accentHex }}
                                  className="p-2 rounded-lg border text-center hover:opacity-90 transition-opacity disabled:opacity-50 flex flex-col items-center justify-center gap-0.5 cursor-pointer"
                                >
                                  <div className="text-lg leading-none">{tpl.emoji}</div>
                                  <div
                                    style={{ color: tpl.accentHex }}
                                    className="text-[10px] font-bold leading-tight truncate w-full"
                                  >
                                    {tpl.topText}
                                  </div>
                                  <div
                                    style={{ color: tpl.textHex }}
                                    className="text-[9px] leading-tight truncate w-full opacity-85"
                                  >
                                    {tpl.bottomText}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {showLocationComposer && (
                <form
                  onSubmit={handleSendLocation}
                  className="absolute bottom-full left-0 mb-2 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-80 sm:w-96 max-w-[calc(100vw-2rem)] space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-gray-100">
                    <span className="text-xs font-semibold text-gray-900 inline-flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Bagikan Lokasi (Pin Maps)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowLocationComposer(false)}
                      title="Tutup Form Lokasi"
                      className="h-6 w-6 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 inline-flex items-center justify-center shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        placeholder="Tempel link Google Maps (otomatis deteksi lat,lng)..."
                        value={locMapUrlInput}
                        onChange={(e) => parseMapsUrlInput(e.target.value)}
                        className="flex-1 min-w-0 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded text-[11px] font-mono focus:outline-none focus:border-emerald-500"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        isLoading={loadingGeo}
                        onClick={handleDetectCurrentGeo}
                        title="Ambil Koordinat GPS Browser"
                      >
                        <Compass className="w-3.5 h-3.5" />
                        <span>GPS</span>
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="number"
                        step="any"
                        required
                        placeholder="Latitude (mis. -6.200000)"
                        value={locLat}
                        onChange={(e) => setLocLat(e.target.value)}
                        className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded text-[11px] font-mono focus:outline-none focus:border-emerald-500"
                      />
                      <input
                        type="number"
                        step="any"
                        required
                        placeholder="Longitude (mis. 106.816666)"
                        value={locLng}
                        onChange={(e) => setLocLng(e.target.value)}
                        className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded text-[11px] font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="Nama tempat / cabang / toko (opsional)"
                      value={locName}
                      onChange={(e) => setLocName(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded text-[11px] focus:outline-none focus:border-emerald-500"
                    />
                    <input
                      type="text"
                      placeholder="Alamat lengkap / patokan (opsional)"
                      value={locAddress}
                      onChange={(e) => setLocAddress(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded text-[11px] focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-1.5 pt-1">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowLocationComposer(false)}
                    >
                      Batal
                    </Button>
                    <Button type="submit" variant="primary" size="sm" isLoading={sending}>
                      Kirim Lokasi
                    </Button>
                  </div>
                </form>
              )}

              {showContactSharePicker && (
                <div className="absolute bottom-full left-0 mb-2 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-80 sm:w-96 max-w-[calc(100vw-2rem)] space-y-2.5">
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-gray-100">
                    <span className="text-xs font-semibold text-gray-900 inline-flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>Bagikan Kontak (vCard WhatsApp)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowContactSharePicker(false)}
                      title="Tutup Pemilih Kontak"
                      className="h-6 w-6 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 inline-flex items-center justify-center shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <input
                    type="text"
                    placeholder="Cari nama atau nomor kontak CRM..."
                    value={contactShareSearch}
                    onChange={(e) => setContactShareSearch(e.target.value)}
                    className="w-full h-8 px-2.5 bg-gray-50 border border-gray-200 rounded text-[11px] focus:outline-none focus:border-indigo-500"
                  />

                  <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                    {loadingContactShareList ? (
                      <div className="py-4 text-center text-[11px] text-gray-500">Memuat kontak...</div>
                    ) : contactShareList.length === 0 ? (
                      <div className="py-4 text-center text-[11px] text-gray-500">
                        Tidak ada kontak bernomor WhatsApp yang cocok.
                      </div>
                    ) : (
                      contactShareList.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          disabled={sending}
                          onClick={() => void handleSendSharedContact(c)}
                          className="w-full text-left py-2 px-1.5 hover:bg-indigo-50/70 rounded flex items-center justify-between gap-2 disabled:opacity-50"
                        >
                          <div className="min-w-0">
                            <div className="text-[11px] font-semibold text-gray-900 truncate">
                              {c.nama_lengkap}
                            </div>
                            <div className="text-[10px] font-mono text-gray-500 truncate">
                              +{c.nomor_whatsapp}
                              {c.kategori ? ` • ${c.kategori}` : ''}
                            </div>
                          </div>
                          <span className="text-[10px] font-medium text-indigo-700 shrink-0">
                            Kirim
                          </span>
                        </button>
                      ))
                    )}
                  </div>
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
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        placeholder="URL gambar thumbnail preview (opsional)"
                        value={linkImageUrl}
                        onChange={(e) => setLinkImageUrl(e.target.value)}
                        className="flex-1 min-w-0 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded text-[11px] font-mono focus:outline-none focus:border-indigo-500"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenMediaLibraryModal('LINK_THUMBNAIL')}
                        title="Pilih gambar dari Galeri"
                        className="shrink-0"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>Galeri</span>
                      </Button>
                    </div>
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

              {showComposerTools && (
                <div className="mb-2 sm:mb-0 sm:absolute sm:bottom-full sm:left-0 sm:mb-2 sm:w-80 sm:bg-white sm:shadow-lg sm:z-30 p-2 rounded-lg bg-gray-50 border border-gray-200 grid grid-cols-4 gap-1.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => openComposerPicker('EMOJI')}
                    className="flex flex-col items-center justify-center gap-1 p-1.5 rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 cursor-pointer"
                  >
                    <Smile className="w-4 h-4 text-gray-600" />
                    <span>Emotikon</span>
                  </button>
                  {composerMode === 'REPLY' && (
                    <button
                      type="button"
                      onClick={() => openComposerPicker('STICKER')}
                      className="flex flex-col items-center justify-center gap-1 p-1.5 rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4 text-violet-600" />
                      <span>Stiker</span>
                    </button>
                  )}
                  {canManageConversation && (
                    <button
                      type="button"
                      onClick={() => {
                        if (composerMode === 'NOTE') {
                          setComposerMode('REPLY');
                        } else {
                          setComposerMode('NOTE');
                          setPendingAttachments([]);
                          openComposerPicker(null);
                          stopOutboundTyping(selectedConversation.id);
                        }
                        setShowComposerTools(false);
                      }}
                      className={`flex flex-col items-center justify-center gap-1 p-1.5 rounded-md border cursor-pointer ${
                        composerMode === 'NOTE'
                          ? 'bg-amber-50 border-amber-300 text-amber-900 font-semibold'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <StickyNote className="w-4 h-4 text-amber-600" />
                      <span>{composerMode === 'NOTE' ? 'Mode Balas' : 'Catatan'}</span>
                    </button>
                  )}
                  {composerMode === 'REPLY' && (
                    <>
                      <button
                        type="button"
                        onClick={() => openComposerPicker('CANNED')}
                        className="flex flex-col items-center justify-center gap-1 p-1.5 rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 cursor-pointer"
                      >
                        <Zap className="w-4 h-4 text-amber-600" />
                        <span>Template</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openComposerPicker('PRODUCT')}
                        className="flex flex-col items-center justify-center gap-1 p-1.5 rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 cursor-pointer"
                      >
                        <Package className="w-4 h-4 text-indigo-600" />
                        <span>Produk</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openComposerPicker('LOCATION')}
                        className="flex flex-col items-center justify-center gap-1 p-1.5 rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 cursor-pointer"
                      >
                        <MapPin className="w-4 h-4 text-emerald-600" />
                        <span>Lokasi</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openComposerPicker('CONTACT')}
                        className="flex flex-col items-center justify-center gap-1 p-1.5 rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 cursor-pointer"
                      >
                        <Users className="w-4 h-4 text-indigo-600" />
                        <span>Kontak</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openComposerPicker('LINK')}
                        className="flex flex-col items-center justify-center gap-1 p-1.5 rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 cursor-pointer"
                      >
                        <Link2 className="w-4 h-4 text-sky-600" />
                        <span>Tautan</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openComposerPicker('INTERACTIVE')}
                        className="flex flex-col items-center justify-center gap-1 p-1.5 rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 cursor-pointer"
                      >
                        <ListChecks className="w-4 h-4 text-emerald-600" />
                        <span>Tombol</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowComposerTools(false);
                          imageInputRef.current?.click();
                        }}
                        className="flex flex-col items-center justify-center gap-1 p-1.5 rounded-md bg-white border border-gray-200 text-indigo-700 hover:bg-gray-100 cursor-pointer"
                      >
                        <ImageIcon className="w-4 h-4 text-indigo-600" />
                        <span>Foto/Video</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowComposerTools(false);
                          docInputRef.current?.click();
                        }}
                        className="flex flex-col items-center justify-center gap-1 p-1.5 rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 cursor-pointer"
                      >
                        <FileText className="w-4 h-4 text-gray-600" />
                        <span>Dokumen</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowComposerTools(false);
                          handleOpenMediaLibraryModal('CHAT_ATTACHMENT');
                        }}
                        className="flex flex-col items-center justify-center gap-1 p-1.5 rounded-md bg-white border border-gray-200 text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                      >
                        <FolderOpen className="w-4 h-4 text-emerald-600" />
                        <span>Galeri</span>
                      </button>
                      {isCurrentConversationGroup && (
                        <button
                          type="button"
                          onClick={() => openComposerPicker('MENTION')}
                          className="flex flex-col items-center justify-center gap-1 p-1.5 rounded-md bg-white border border-gray-200 text-indigo-700 hover:bg-gray-100 cursor-pointer"
                        >
                          <AtSign className="w-4 h-4 text-indigo-600" />
                          <span>Mention</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {showMentionPicker && (
                <div className="absolute bottom-full left-0 mb-2 z-30 bg-white border border-gray-200 rounded-lg shadow-lg p-2.5 w-80 sm:w-96 max-w-[calc(100vw-2.5rem)] space-y-2">
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-gray-100">
                    <span className="text-xs font-semibold text-gray-900 inline-flex items-center gap-1.5 whitespace-nowrap truncate">
                      <AtSign className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>Sebut / Mention Partisipan</span>
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {(selectedConversation.isGroup || selectedConversation.externalThreadId?.endsWith('@g.us')) && (
                        <button
                          type="button"
                          disabled={loadingParticipants}
                          onClick={() => void fetchParticipants(selectedConversation.id, true)}
                          title="Muat ulang daftar partisipan dari WAHA"
                          className="h-6 px-1.5 rounded text-[10px] font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3 h-3 ${loadingParticipants ? 'animate-spin' : ''}`} />
                          <span>Sync WAHA</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowMentionPicker(false)}
                        title="Tutup Menu Mention"
                        className="h-6 w-6 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 inline-flex items-center justify-center shrink-0 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    placeholder="Cari nama atau nomor partisipan..."
                    value={mentionFilter}
                    onChange={(e) => setMentionFilter(e.target.value)}
                    className="w-full h-8 px-2.5 bg-gray-50 border border-gray-200 rounded text-[11px] focus:outline-none focus:border-indigo-500"
                  />

                  <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                    {loadingParticipants && availableMentionCandidates.length === 0 ? (
                      <div className="py-4 text-center text-[11px] text-indigo-600">
                        Mengambil daftar partisipan dari WAHA...
                      </div>
                    ) : availableMentionCandidates.length === 0 ? (
                      <div className="py-4 text-center text-[11px] text-gray-500">
                        {mentionFilter
                          ? `Tidak ada partisipan cocok dengan "${mentionFilter}"`
                          : 'Tidak ada partisipan terdeteksi di obrolan ini'}
                      </div>
                    ) : (
                      availableMentionCandidates.slice(0, 20).map((cand: any, idx: number) => (
                        <button
                          key={cand.jid || cand.phone || idx}
                          type="button"
                          onClick={() => handleSelectMention(cand)}
                          className="w-full text-left py-2 px-2 hover:bg-indigo-50/80 rounded flex items-center justify-between gap-2 transition-colors cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="text-[11px] font-semibold text-gray-900 truncate">
                              {cand.name}
                            </div>
                            {cand.phone && (
                              <div className="text-[10px] font-mono text-gray-500 truncate">
                                +{cand.phone}
                              </div>
                            )}
                          </div>
                          {cand.role && cand.role !== 'member' && (
                            <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 shrink-0">
                              {cand.role}
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              <form
                onSubmit={handleSendMessage}
                className={`rounded-lg border transition-colors min-w-0 flex flex-col overflow-hidden ${
                  composerMode === 'NOTE'
                    ? 'bg-amber-50/50 border-amber-300 focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500/20'
                    : 'bg-white border-gray-200 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/20'
                }`}
              >
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={(e) => void handleAttachmentPick(e, false)}
                  className="hidden"
                />
                <input
                  ref={docInputRef}
                  type="file"
                  accept="*/*"
                  multiple
                  onChange={(e) => void handleAttachmentPick(e, true)}
                  className="hidden"
                />
                <textarea
                  ref={replyInputRef}
                  rows={3}
                  placeholder={
                    composerMode === 'NOTE'
                      ? 'Tulis catatan internal tim... (Enter simpan, Shift+Enter baris baru)'
                      : `Balas ${
                          CHANNEL_META[
                            ((selectedConversation.channel || 'WHATSAPP').toUpperCase()) as OmnichannelType
                          ]?.short || 'WA'
                        } (/ template${isCurrentConversationGroup ? ', @ mention' : ''}, Shift+Enter baris baru)...`
                  }
                  value={inputText}
                  onChange={(e) => handleReplyTextChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  onBlur={() => stopOutboundTyping(selectedConversation.id)}
                  className={`w-full min-w-0 min-h-[66px] sm:min-h-[76px] max-h-[180px] px-3 py-2 text-[13px] leading-5 placeholder-gray-400 focus:outline-none resize-none bg-transparent ${
                    composerMode === 'NOTE' ? 'text-amber-950' : 'text-gray-900'
                  }`}
                />
                <div
                  className={`flex items-center justify-between gap-2 px-2 py-1.5 border-t ${
                    composerMode === 'NOTE'
                      ? 'border-amber-200/80 bg-amber-50/80'
                      : 'border-gray-100 bg-gray-50/70'
                  }`}
                >
                  <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => setShowComposerTools((v) => !v)}
                      title="Buka Pintasan Alat Pesan (Emotikon, Stiker, Template, Produk, Lokasi, Kontak, Tautan, Tombol)"
                      className={`h-8 w-8 rounded-md border inline-flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                        showComposerTools || composerMode === 'NOTE'
                          ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                          : 'border-gray-200 bg-white hover:bg-gray-100 text-gray-600'
                      }`}
                    >
                      {showComposerTools ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    </button>
                    {composerMode === 'REPLY' && (
                      <>
                        <button
                          type="button"
                          onClick={() => imageInputRef.current?.click()}
                          title="Kirim Foto / Video (Mendukung HD & Multi-Foto)"
                          className="hidden sm:inline-flex h-8 w-8 rounded-md border border-gray-200 bg-white hover:bg-gray-100 text-slate-600 items-center justify-center shrink-0 transition-colors cursor-pointer"
                        >
                          <ImageIcon className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => docInputRef.current?.click()}
                          title="Kirim Dokumen / Berkas (Tanpa Pratinjau Foto Langsung)"
                          className="hidden sm:inline-flex h-8 w-8 rounded-md border border-gray-200 bg-white hover:bg-gray-100 text-slate-600 items-center justify-center shrink-0 transition-colors cursor-pointer"
                        >
                          <Paperclip className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenMediaLibraryModal('CHAT_ATTACHMENT')}
                          title="Pilih Foto, Video, atau Dokumen dari Galeri"
                          className="hidden sm:inline-flex h-8 w-8 rounded-md border border-gray-200 bg-white hover:bg-gray-100 text-slate-600 items-center justify-center shrink-0 transition-colors cursor-pointer"
                        >
                          <FolderOpen className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {canReplyConversation && canManageConversation && (
                      <>
                        <div className="h-4 w-px bg-gray-200 mx-0.5 shrink-0" />
                        <div className="inline-flex rounded-md border border-gray-200 p-0.5 bg-white text-[11px] shrink-0">
                          <button
                            type="button"
                            onClick={() => setComposerMode('REPLY')}
                            className={`h-6 px-2 rounded font-medium inline-flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer ${
                              composerMode === 'REPLY'
                                ? 'bg-indigo-50 text-indigo-700'
                                : 'text-gray-600 hover:text-gray-900'
                            }`}
                          >
                            <MessageSquare className="w-3 h-3 shrink-0" />
                            <span className="sm:hidden">Balas</span>
                            <span className="hidden sm:inline">Balas WA</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setComposerMode('NOTE');
                              setPendingAttachments([]);
                              openComposerPicker(null);
                              stopOutboundTyping(selectedConversation.id);
                            }}
                            className={`h-6 px-2 rounded font-medium inline-flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer ${
                              composerMode === 'NOTE'
                                ? 'bg-amber-100 text-amber-900'
                                : 'text-gray-600 hover:text-gray-900'
                            }`}
                          >
                            <StickyNote className="w-3 h-3 shrink-0" />
                            <span>Catatan</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="hidden lg:inline text-[11px] text-gray-400 select-none">
                      Enter kirim • Shift+Enter baris baru
                    </span>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      isLoading={sending}
                      disabled={!inputText.trim() && pendingAttachments.length === 0}
                      className="shrink-0 h-8 px-3 sm:px-3.5"
                    >
                      <Send className="w-3.5 h-3.5 sm:hidden" />
                      <span>
                        {sending && sendingProgress
                          ? `${sendingProgress.current}/${sendingProgress.total}`
                          : composerMode === 'NOTE'
                          ? 'Simpan'
                          : 'Kirim'}
                      </span>
                    </Button>
                  </div>
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
            <ContactAvatar
              url={selectedConversation.contact?.profile_picture_url}
              label={getConversationDisplayTitle(selectedConversation)}
              className="w-12 h-12 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-base mx-auto mb-2 border border-indigo-200"
              onClick={(e) => {
                if (selectedConversation.contact?.profile_picture_url) {
                  e.stopPropagation();
                  handleOpenAvatarLightbox(
                    selectedConversation.contact.profile_picture_url,
                    getConversationDisplayTitle(selectedConversation)
                  );
                }
              }}
              title={selectedConversation.contact?.profile_picture_url ? "Klik untuk melihat foto profil penuh" : undefined}
            />
            <h4 className="font-semibold text-gray-900 text-sm break-words inline-flex flex-wrap items-center justify-center gap-1.5">
              <span>{getConversationDisplayTitle(selectedConversation)}</span>
              {!selectedConversation.isGroup && (
                <VerifiedMetaBadge contact={selectedConversation.contact} showLabel />
              )}
            </h4>
            {!selectedConversation.isGroup &&
              selectedConversation.contact?.verified_name &&
              selectedConversation.contact.verified_name.trim().toLowerCase() !==
                getConversationDisplayTitle(selectedConversation).trim().toLowerCase() && (
                <span className="text-[11px] text-sky-700 font-medium block mt-0.5">
                  Nama Verified Meta: {selectedConversation.contact.verified_name}
                </span>
              )}
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
            {selectedConversation.contact?.profile_about && (
              <div className="mt-1 px-2 text-left bg-gray-50/70 p-2 rounded border border-gray-100">
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">
                  {selectedConversation.isGroup ? 'Deskripsi Grup' : 'Info Profil / Bio'}
                </div>
                <p className={`text-[11px] text-gray-600 whitespace-pre-wrap break-words leading-relaxed ${expandProfileAbout ? '' : 'line-clamp-2'}`}>
                  {selectedConversation.contact.profile_about}
                </p>
                {selectedConversation.contact.profile_about.length > 60 && (
                  <button
                    type="button"
                    onClick={() => setExpandProfileAbout((v) => !v)}
                    className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline mt-1 inline-block cursor-pointer"
                  >
                    {expandProfileAbout ? 'Sembunyikan' : 'Lihat selengkapnya'}
                  </button>
                )}
              </div>
            )}
            <div className="mt-1.5 flex items-center justify-center flex-wrap gap-1">
              {selectedConversation.wahaSession && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-slate-50 text-slate-700 border border-slate-200 max-w-full truncate">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getWahaSessionDotClass(selectedConversation.wahaSession, sessions, 'bg-emerald-500')}`} />
                  <span className="truncate">Sesi: {selectedConversation.wahaSession}</span>
                </span>
              )}
              {selectedConversation.channelAccountName && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200 max-w-full truncate">
                  <span className="truncate">Kanal: {selectedConversation.channelAccountName}</span>
                </span>
              )}
              {selectedConversation.contextTitle &&
                selectedConversation.contextTitle.trim().toLowerCase() !==
                  getConversationDisplayTitle(selectedConversation).trim().toLowerCase() && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-700 border border-gray-200 max-w-full truncate">
                  {selectedConversation.contextTitle}
                </span>
              )}
            </div>

            {selectedConversation.isGroup && (
              <div className="mt-2.5 flex items-center justify-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => void handleOpenGroupManageModal('INFO')}
                  className="px-2.5 py-1 rounded bg-white hover:bg-gray-50 text-slate-700 border border-gray-200 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                >
                  <Shield className="w-3.5 h-3.5 text-slate-500" />
                  <span>Kelola Grup</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowParticipantsModal(true);
                    void fetchParticipants(selectedConversation.id, true);
                  }}
                  className="px-2.5 py-1 rounded bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                >
                  <Users className="w-3.5 h-3.5 text-gray-500" />
                  <span>
                    Anggota
                    {participantsData && participantsData.participants.length > 0
                      ? ` (${participantsData.participants.length})`
                      : ''}
                  </span>
                </button>
              </div>
            )}

            {(selectedConversation.channel || 'WHATSAPP').toUpperCase() === 'WHATSAPP' && (
              <div className="mt-2 flex items-center justify-center gap-1.5">
                <button
                  type="button"
                  disabled={syncingProfile}
                  onClick={() => void handleSyncConversationProfile()}
                  className="px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50 text-[10px] font-medium text-gray-700 inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${syncingProfile ? 'animate-spin' : ''}`} />
                  <span>{syncingProfile ? 'Menyinkronkan...' : 'Sync Profil WA'}</span>
                </button>
                {onOpenContact && !selectedConversation.isGroup && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenContact({
                        contactId: selectedConversation.contact?.id,
                        phone: selectedConversation.contact?.nomor_whatsapp,
                        name: selectedConversation.contact?.nama_lengkap,
                      })
                    }
                    className="px-2 py-1 rounded border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-[10px] font-medium text-indigo-700 inline-flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Buka Kontak</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="py-3 space-y-2 flex-1 text-xs text-gray-700">
            {/* 1. Nama di Kanal / Sesi */}
            <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => toggleProfileSection('channelName')}
                className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="text-[11px] font-semibold text-gray-700 truncate">
                  Nama Kanal / Push Name
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] text-gray-500 truncate max-w-[110px]">
                    {selectedConversation.channelDisplayName ||
                      selectedConversation.pushName ||
                      'Default'}
                  </span>
                  {openProfileSections.channelName ? (
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                  )}
                </div>
              </button>
              {openProfileSections.channelName && (
                <div className="px-3 pb-3 pt-2 border-t border-gray-100 bg-gray-50/60 space-y-1.5">
                  {selectedConversation.pushName && (
                    <div className="text-[10px] text-gray-500">
                      Push name WA: <strong className="text-gray-800">{selectedConversation.pushName}</strong>
                    </div>
                  )}
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
              )}
            </div>

            {/* 2. Penilaian & Kategori SLA/CSAT */}
            <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => toggleProfileSection('metrics')}
                className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="text-[11px] font-semibold text-gray-700 flex items-center gap-1.5 truncate">
                  <EyeOff className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span>Penilaian SLA &amp; CSAT</span>
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                      selectedConversation.excludeFromMetrics
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}
                  >
                    {selectedConversation.excludeFromMetrics ? 'Non-Penilaian' : 'Dinilai'}
                  </span>
                  {openProfileSections.metrics ? (
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                  )}
                </div>
              </button>
              {openProfileSections.metrics && (
                <div className="px-3 pb-3 pt-2 border-t border-gray-100 bg-gray-50/60 space-y-2">
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
                  <p className="text-[10px] text-gray-500 leading-snug">
                    Berlaku khusus pada percakapan sesi ini (tidak mengubah status penilaian kontak pada sesi WhatsApp lainnya).
                  </p>

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
                    Disimpan ke profil kontak dan otomatis berlaku untuk obrolan aktif maupun pesan masuk berikutnya.
                  </p>
                </div>
              )}
            </div>

            {/* 3. Partisipan Grup */}
            {selectedConversation.isGroup && (
              <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleProfileSection('participants')}
                  className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="text-[11px] font-semibold text-gray-900 flex items-center gap-1.5 truncate">
                    <Users className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                    <span>Partisipan Grup</span>
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-mono font-semibold text-gray-600">
                      {participantsData?.participants.length || 0}
                    </span>
                    {openProfileSections.participants ? (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                    )}
                  </div>
                </button>
                {openProfileSections.participants && (
                  <div className="px-3 pb-3 pt-2 border-t border-gray-100 bg-gray-50/60 space-y-2">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={loadingParticipants}
                        onClick={() => void fetchParticipants(selectedConversation.id, true)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-gray-200 text-[10px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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
                        className="text-[10px] font-semibold text-indigo-600 hover:underline"
                      >
                        Lihat Semua Modal
                      </button>
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
                            onClick={() => {
                              if (part.contactId || part.phone || part.jid) {
                                handleOpenMentionContact({
                                  contactId: part.contactId,
                                  phone: part.phone,
                                  name: part.contactName || part.name,
                                  jid: part.jid,
                                  role: part.role,
                                  avatarUrl: part.avatarUrl || null,
                                });
                              }
                            }}
                            className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-white border border-gray-200 text-[11px] ${
                              part.contactId || part.phone || part.jid
                                ? 'cursor-pointer hover:bg-gray-50'
                                : ''
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <ContactAvatar
                                url={part.avatarUrl}
                                label={part.contactName || part.name || part.phone || 'Anggota'}
                                className={`w-6 h-6 rounded-full text-white font-semibold text-[9px] shrink-0 ${getParticipantAvatarBgClass(
                                  part.jid || part.phone || part.name
                                )}`}
                              />
                              <div className="min-w-0">
                                <div className="font-medium text-gray-900 truncate flex items-center gap-1">
                                  <span className="truncate">{part.contactName || part.name || (part.phone ? `+${part.phone}` : part.jid)}</span>
                                  {part.role !== 'member' && (
                                    <span className="px-1 py-0.2 rounded text-[9px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
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
                            </div>
                            {part.messageCount > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] shrink-0">
                                {part.messageCount} chat
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 4. Info Profil & Alamat (disembunyikan untuk Grup WA) */}
            {!selectedConversation.isGroup && (
            <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => toggleProfileSection('contactInfo')}
                className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="text-[11px] font-semibold text-gray-700 truncate">
                  Info Nomor, TTL &amp; Alamat
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-mono text-gray-500 truncate max-w-[115px]">
                    {selectedConversation.contact.nomor_whatsapp
                      ? `+${selectedConversation.contact.nomor_whatsapp}`
                      : 'Detail'}
                  </span>
                  {openProfileSections.contactInfo ? (
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                  )}
                </div>
              </button>
              {openProfileSections.contactInfo && (
                <div className="px-3 pb-3 pt-2 border-t border-gray-100 bg-gray-50/60 space-y-2.5">
                  <div>
                    <span className="block text-[10px] text-gray-400 font-medium mb-0.5">WhatsApp / ID</span>
                    {selectedConversation.contact.nomor_whatsapp ? (
                      <div className="font-mono text-gray-900 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-indigo-600" />
                        <span>+{selectedConversation.contact.nomor_whatsapp}</span>
                      </div>
                    ) : (
                      <div className="text-gray-600 text-[11px] font-mono break-all">
                        {(selectedConversation.channel || 'WHATSAPP') === 'WHATSAPP'
                          ? 'WhatsApp Privacy ID (@lid)'
                          : 'Akun Omnichannel'}
                      </div>
                    )}
                  </div>

                  {selectedConversation.contact.tanggal_lahir && (
                    <div>
                      <span className="block text-[10px] text-gray-400 font-medium mb-0.5">
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
                      <span className="block text-[10px] text-gray-400 font-medium mb-0.5">Alamat</span>
                      <div className="flex items-start gap-1.5 text-gray-900 leading-snug">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                        <span>{selectedConversation.contact.alamat}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            )}

            {/* 5. Label Percakapan */}
            <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => toggleProfileSection('labels')}
                className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="text-[11px] font-semibold text-gray-700 flex items-center gap-1.5 truncate">
                  <Tag className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span>Label Percakapan</span>
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-medium text-indigo-700">
                    {activeLabels.length > 0 ? `${activeLabels.length} aktif` : 'Kosong'}
                  </span>
                  {openProfileSections.labels ? (
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                  )}
                </div>
              </button>
              {openProfileSections.labels && (
                <div className="px-3 pb-3 pt-2 border-t border-gray-100 bg-gray-50/60 space-y-2">
                  {canManageMaster && onOpenSettings && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => onOpenSettings('labels')}
                        className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 whitespace-nowrap"
                      >
                        Kelola Master Label
                      </button>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {activeLabels.map((lbl) => {
                      const style = getLabelStyle(lbl);
                      return (
                        <span
                          key={lbl}
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium border shadow-2xs ${style.badge}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                          #{lbl}
                          {canManageConversation && (
                            <button
                              type="button"
                              onClick={() => handleToggleLabel(lbl)}
                              className="opacity-70 hover:opacity-100 hover:text-rose-600 transition-colors ml-0.5"
                              title={`Hapus label #${lbl}`}
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
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-white hover:bg-gray-100 text-gray-600 border border-dashed border-gray-300"
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
                        className="flex-1 min-w-0 h-8 sm:h-7 px-2 bg-white border border-gray-200 rounded text-[11px] focus:outline-none focus:border-indigo-500"
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
              )}
            </div>

            {/* 6. Catatan Kontak */}
            <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => toggleProfileSection('notes')}
                className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="text-[11px] font-semibold text-gray-700 truncate">
                  Catatan Kontak
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] text-gray-500">
                    {contactNotesDraft.trim() ? 'Terisi' : 'Kosong'}
                  </span>
                  {openProfileSections.notes ? (
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                  )}
                </div>
              </button>
              {openProfileSections.notes && (
                <div className="px-3 pb-3 pt-2 border-t border-gray-100 bg-gray-50/60 space-y-1.5">
                  <textarea
                    rows={3}
                    disabled={!canManageConversation}
                    value={contactNotesDraft}
                    onChange={(e) => setContactNotesDraft(e.target.value)}
                    placeholder="Tambahkan catatan permanen untuk kontak ini..."
                    className="w-full p-2 bg-white border border-gray-200 rounded text-[11px] focus:outline-none focus:border-indigo-500 disabled:opacity-70"
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
              )}
            </div>

            {/* 7. Riwayat Penilaian CSAT (disembunyikan untuk Grup WA) */}
            {!selectedConversation.isGroup && (
            <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => toggleProfileSection('csat')}
                className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="text-[11px] font-semibold text-gray-700 flex items-center gap-1.5 truncate">
                  <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>Riwayat Penilaian CSAT</span>
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-mono text-gray-500">
                    {selectedConversation.csatHistory?.length || (selectedConversation.csatRating ? 1 : 0)} sesi
                  </span>
                  {openProfileSections.csat ? (
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                  )}
                </div>
              </button>
              {openProfileSections.csat && (
                <div className="px-3 pb-3 pt-2 border-t border-gray-100 bg-gray-50/60">
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
                                : 'bg-white border-gray-200'
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
                      {selectedConversation.excludeFromMetrics || selectedConversation.isGroup
                        ? 'Obrolan ini bertanda Non-Penilaian (tidak menggunakan Status, Penugasan CS, atau survei CSAT).'
                        : 'Belum ada penilaian. Ubah status percakapan ke Resolved lalu pilih kirim tautan CSAT.'}
                    </p>
                  )}
                </div>
              )}
            </div>
            )}

            {/* 8. Linimasa Aktivitas Percakapan */}
            {(() => {
              const activityTimeline = messages
                .filter((m) => {
                  const mm = parseChatMessageMeta(m);
                  return (
                    m.messageType === 'ACTIVITY' ||
                    mm?.kind === 'ACTIVITY' ||
                    m.messageType === 'NOTE' ||
                    m.messageType === 'CSAT'
                  );
                })
                .slice()
                .reverse();
              return (
                <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleProfileSection('activity')}
                    className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-[11px] font-semibold text-gray-700 flex items-center gap-1.5 truncate">
                      <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>Linimasa Aktivitas</span>
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-mono text-gray-500">
                        {activityTimeline.length} aksi
                      </span>
                      {openProfileSections.activity ? (
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                      )}
                    </div>
                  </button>
                  {openProfileSections.activity && (
                    <div className="px-3 pb-3 pt-2 border-t border-gray-100 bg-gray-50/60">
                      {activityTimeline.length === 0 ? (
                        <p className="text-[11px] text-gray-400">
                          Belum ada aktivitas tercatat (ubah status, penugasan agent, label, sematan, atau CSAT).
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                          {activityTimeline.map((act) => {
                            const actMeta = parseChatMessageMeta(act);
                            const actor =
                              actMeta?.actorName ||
                              act.senderName ||
                              (act.messageType === 'CSAT' ? 'Sistem CSAT' : 'Agent');
                            const summaryText =
                              act.messageType === 'NOTE'
                                ? `menulis catatan internal: "${act.body}"`
                                : act.messageType === 'CSAT'
                                ? 'mengirim tautan survei CSAT'
                                : act.body;
                            return (
                              <button
                                key={act.id}
                                type="button"
                                onClick={() => handleJumpToMessage(act.id)}
                                className="w-full text-left p-2 rounded-md border border-gray-200 bg-white hover:bg-indigo-50/50 transition-colors space-y-0.5 cursor-pointer"
                              >
                                <div className="flex items-center justify-between gap-2 text-[10px]">
                                  <span className="font-semibold text-indigo-700 truncate">
                                    {actor}
                                  </span>
                                  <span className="font-mono text-gray-400 shrink-0">
                                    {new Date(act.createdAt).toLocaleString('id-ID', {
                                      day: '2-digit',
                                      month: 'short',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                                <p className="text-[11px] text-gray-700 leading-snug break-words">
                                  {summaryText}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
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
              ) : contactsList.filter((c) => c.id !== selectedConversation.contact.id).length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-500">
                  Tidak ada kontak tujuan yang cocok.
                </div>
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
                  .slice(0, 100)
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
            {contactsTotal > contactsList.length && (
              <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-500 tabular-nums">
                Menampilkan {contactsList.length} dari {contactsTotal.toLocaleString('id-ID')} kontak.
                Ketik di kolom pencarian untuk mencari lebih spesifik.
              </div>
            )}
          </div>
        </div>
      )}

      {showNewChatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg border border-gray-200 shadow-lg w-full max-w-md overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Buka Percakapan Baru</h3>
                <p className="text-[11px] text-gray-500">
                  Pilih sesi WhatsApp pengirim terlebih dahulu, lalu pilih kontak tujuan
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewChatModal(false)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step 1: Select WhatsApp Session */}
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/80 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                  1. Pilih Sesi WhatsApp
                </span>
                {loadingNewChatSessions && (
                  <span className="text-[11px] text-gray-500 inline-flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Memuat...
                  </span>
                )}
              </div>

              {sessions.length === 0 ? (
                <div className="px-2.5 py-2 rounded-md border border-amber-200 bg-amber-50 text-[11px] text-amber-800">
                  Belum ada sesi WhatsApp tersambung di WAHA. Anda tetap dapat membuka ruang percakapan.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
                    {sessions.map((s) => {
                      const isSelected = newChatSession === s.name;
                      const isWorking = s.status === 'WORKING';
                      const waNum = s.me?.id ? String(s.me.id).split('@')[0].replace(/\D/g, '') : '';
                      return (
                        <button
                          key={s.name}
                          type="button"
                          onClick={() => setNewChatSession(s.name)}
                          className={`text-left px-2.5 py-2 rounded-md border transition-colors ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                              : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="inline-flex items-center gap-1 min-w-0">
                              <Smartphone
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  isSelected ? 'text-indigo-600' : 'text-gray-400'
                                }`}
                              />
                              <span className="text-xs font-mono font-semibold text-gray-900 truncate">
                                {s.name}
                              </span>
                            </span>
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                                isWorking
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {isWorking ? 'Aktif' : s.status}
                            </span>
                          </div>
                          {(s.me?.pushName || waNum) && (
                            <div className="mt-0.5 text-[10px] text-gray-500 truncate pl-4">
                              {[s.me?.pushName, waNum ? `+${waNum}` : ''].filter(Boolean).join(' • ')}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {(() => {
                    const picked = sessions.find((s) => s.name === newChatSession);
                    if (picked && picked.status !== 'WORKING') {
                      return (
                        <div className="px-2.5 py-1.5 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                          Sesi <span className="font-mono font-semibold">{picked.name}</span> berstatus{' '}
                          <span className="font-mono">{picked.status}</span>. Pesan baru dapat dikirim setelah
                          sesi aktif.
                        </div>
                      );
                    }
                    return null;
                  })()}
                </>
              )}
            </div>

            {sessions.length > 0 && !newChatSession ? (
              <div className="p-6 text-center space-y-1.5">
                <div className="text-xs font-semibold text-gray-800">
                  Pilih Sesi WhatsApp Terlebih Dahulu
                </div>
                <p className="text-[11px] text-gray-500">
                  Klik salah satu sesi WhatsApp di atas untuk memilih nomor pengirim sebelum memilih kontak
                  atau memulai chat baru.
                </p>
              </div>
            ) : (
              <>
                <div className="px-3 pt-2.5 pb-3 border-b border-gray-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                      2. Pilih Kontak / Nomor Tujuan
                    </span>
                    {newChatSession && (
                      <span className="text-[10px] font-mono font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                        via {newChatSession}
                      </span>
                    )}
                  </div>
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
                  {(() => {
                    const searchDigits = contactSearch.replace(/\D/g, '');
                    if (searchDigits.length >= 7) {
                      const normalizedSearch = searchDigits.startsWith('0')
                        ? `62${searchDigits.slice(1)}`
                        : searchDigits;
                      return (
                        <button
                          type="button"
                          disabled={openingContactId === 'new_phone'}
                          onClick={() => void handleStartConversationWithPhone(normalizedSearch)}
                          className="w-full px-4 py-2.5 text-left bg-indigo-50/70 hover:bg-indigo-100/80 border-b border-indigo-100 flex items-center justify-between gap-3 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                              <MessageSquare className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-indigo-950 truncate">
                                Mulai Chat ke Nomor Baru
                              </div>
                              <div className="text-[11px] text-indigo-700 font-mono">
                                +{normalizedSearch}
                              </div>
                            </div>
                          </div>
                          <span className="text-[11px] font-semibold text-indigo-700 bg-white px-2 py-1 rounded border border-indigo-200 shrink-0">
                            {openingContactId === 'new_phone' ? 'Membuka...' : 'Mulai Chat'}
                          </span>
                        </button>
                      );
                    }
                    return null;
                  })()}

                  {loadingContacts ? (
                    <div className="p-6 text-center text-xs text-gray-500">Memuat kontak...</div>
                  ) : contactsList.length === 0 ? (
                    <div className="p-6 text-center text-xs text-gray-500">
                      Tidak ada kontak yang cocok dengan pencarian.
                    </div>
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
                {contactsTotal > contactsList.length && (
                  <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-500 tabular-nums">
                    Menampilkan {contactsList.length} dari {contactsTotal.toLocaleString('id-ID')} kontak.
                    Ketik di kolom pencarian untuk mencari lebih spesifik.
                  </div>
                )}
              </>
            )}
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
                  onClick={() => {
                    setShowParticipantsModal(false);
                    handleOpenGroupManageModal('INFO');
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 bg-white text-xs text-slate-700 hover:bg-gray-50 font-medium"
                >
                  <Shield className="w-3 h-3 text-slate-500" />
                  <span>Kelola Grup</span>
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
                        onClick={() => {
                          if (part.contactId || part.phone || part.jid) {
                            setShowParticipantsModal(false);
                            handleOpenMentionContact({
                              contactId: part.contactId,
                              phone: part.phone,
                              name: part.contactName || part.name,
                              jid: part.jid,
                              role: part.role,
                              avatarUrl: part.avatarUrl || null,
                            });
                          }
                        }}
                        className={`px-3 py-2 flex items-center justify-between gap-2.5 text-xs ${
                          part.contactId || part.phone || part.jid
                            ? 'cursor-pointer hover:bg-gray-50'
                            : ''
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <ContactAvatar
                            url={part.avatarUrl}
                            label={part.contactName || part.name || part.phone || 'Anggota'}
                            className={`w-9 h-9 rounded-full text-white font-semibold text-xs shrink-0 ${getParticipantAvatarBgClass(
                              part.jid || part.phone || part.name
                            )}`}
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 truncate flex items-center gap-1.5">
                            <span>{part.contactName || part.name || (part.phone ? `+${part.phone}` : part.jid)}</span>
                            {part.role !== 'member' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                {part.role === 'superadmin' ? 'Owner Grup' : 'Admin Grup'}
                              </span>
                            )}
                            {part.contactId && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-white text-slate-700 border border-slate-200 inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Di Kontak CRM
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-gray-500 truncate mt-0.5">
                            {part.phone ? `+${part.phone}` : part.jid}
                          </div>
                        </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px] font-semibold">
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

      {showGroupManageModal && selectedConversation && selectedConversation.isGroup && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4"
          onClick={() => !savingGroupInfo && !loadingGroupInvite && !addingMember && setShowGroupManageModal(false)}
        >
          <div
            className="bg-white rounded-lg border border-gray-200 shadow-xl max-w-md w-full max-h-[88dvh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-md bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">Kelola Grup WhatsApp</h3>
                  <p className="text-[10px] text-gray-500 truncate">
                    {getConversationDisplayTitle(selectedConversation)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={savingGroupInfo || loadingGroupInvite || addingMember}
                onClick={() => setShowGroupManageModal(false)}
                className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 bg-white px-4 flex gap-4 text-xs font-medium">
              <button
                type="button"
                onClick={() => setGroupManageTab('INFO')}
                className={`py-2.5 border-b-2 transition-colors ${
                  groupManageTab === 'INFO'
                    ? 'border-indigo-600 text-indigo-700 font-semibold'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                Info &amp; Profil
              </button>
              <button
                type="button"
                onClick={() => {
                  setGroupManageTab('INVITE');
                  if (!groupInviteLink) void fetchGroupInvite();
                }}
                className={`py-2.5 border-b-2 transition-colors ${
                  groupManageTab === 'INVITE'
                    ? 'border-indigo-600 text-indigo-700 font-semibold'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                Tautan Undangan
              </button>
              <button
                type="button"
                onClick={() => setGroupManageTab('ADD_MEMBER')}
                className={`py-2.5 border-b-2 transition-colors ${
                  groupManageTab === 'ADD_MEMBER'
                    ? 'border-indigo-600 text-indigo-700 font-semibold'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                Undang Anggota
              </button>
            </div>

            {/* Tab Content */}
            <div className="p-4 overflow-y-auto flex-1 space-y-4 text-xs">
              {groupManageTab === 'INFO' && (
                <div className="space-y-3.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      Nama / Subjek Grup
                    </label>
                    <input
                      type="text"
                      value={groupSubjectDraft}
                      onChange={(e) => setGroupSubjectDraft(e.target.value)}
                      placeholder="Masukkan nama grup..."
                      className="w-full h-8 px-2.5 border border-gray-300 rounded text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      Deskripsi Grup
                    </label>
                    <textarea
                      rows={3}
                      value={groupDescDraft}
                      onChange={(e) => setGroupDescDraft(e.target.value)}
                      placeholder="Masukkan deskripsi grup..."
                      className="w-full p-2 border border-gray-300 rounded text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={savingGroupInfo || !groupSubjectDraft.trim()}
                      isLoading={savingGroupInfo}
                      onClick={() => void handleSaveGroupInfo()}
                    >
                      Simpan
                    </Button>
                  </div>

                  <div className="pt-2 border-t border-gray-100">
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      Ganti Foto Profil Grup
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={savingGroupInfo}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !selectedConversation) return;
                        setSavingGroupInfo(true);
                        try {
                          const reader = new FileReader();
                          reader.onload = async () => {
                            try {
                              const base64 = reader.result as string;
                              await api.updateGroupPicture(
                                selectedConversation.id,
                                base64,
                                selectedSession || selectedConversation.wahaSession || undefined
                              );
                              toast.success('Foto profil grup berhasil diperbarui');
                              void handleSyncConversationProfile();
                            } catch (err: any) {
                              toast.error(err?.response?.data?.error || 'Gagal mengubah foto profil grup');
                            } finally {
                              setSavingGroupInfo(false);
                            }
                          };
                          reader.readAsDataURL(file);
                        } catch {
                          setSavingGroupInfo(false);
                        }
                      }}
                      className="block w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border file:border-gray-200 file:text-xs file:font-medium file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100 cursor-pointer"
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-[10px] text-gray-400">
                        Unggah berkas JPEG/PNG atau pilih dari Galeri.
                      </p>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={savingGroupInfo}
                        onClick={() => handleOpenMediaLibraryModal('GROUP_AVATAR')}
                        className="shrink-0"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>Pilih dari Galeri</span>
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {groupManageTab === 'INVITE' && (
                <div className="space-y-3">
                  <p className="text-[11px] text-gray-600">
                    Siapa pun yang memiliki tautan ini dapat bergabung ke grup WhatsApp ini.
                  </p>

                  {loadingGroupInvite ? (
                    <LoadingState message="Mengambil tautan undangan grup..." />
                  ) : (
                    <>
                      {groupInviteError && (
                        <div className="p-2.5 rounded-md bg-rose-50 border border-rose-200 text-[11px] text-rose-800 flex items-start justify-between gap-2">
                          <span>{groupInviteError}</span>
                          <button
                            type="button"
                            onClick={() => void fetchGroupInvite()}
                            className="font-semibold text-rose-900 underline shrink-0"
                          >
                            Coba Lagi
                          </button>
                        </div>
                      )}
                      <div className="p-2.5 bg-gray-50 rounded border border-gray-200 space-y-1.5 font-mono text-xs">
                        <div className="text-[10px] uppercase font-bold text-gray-500 font-sans">
                          Tautan Undangan Aktif
                        </div>
                        <div className="break-all text-indigo-700 select-all font-semibold">
                          {groupInviteLink || 'Tautan belum dibuat atau tidak tersedia'}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={!groupInviteLink}
                          onClick={() => {
                            if (groupInviteLink) {
                              void navigator.clipboard.writeText(groupInviteLink);
                              toast.success('Tautan undangan disalin ke clipboard');
                            }
                          }}
                          className="flex-1 inline-flex items-center justify-center gap-1"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin Tautan</span>
                        </Button>

                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          disabled={loadingGroupInvite}
                          isLoading={loadingGroupInvite}
                          onClick={() => void handleRevokeGroupInvite()}
                          title="Tarik tautan lama dan buat tautan undangan baru"
                        >
                          Reset / Tarik Tautan
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {groupManageTab === 'ADD_MEMBER' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      Nomor WhatsApp Anggota Baru
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newMemberPhone}
                        onChange={(e) => setNewMemberPhone(e.target.value)}
                        placeholder="Contoh: 628123456789"
                        className="flex-1 h-8 px-2.5 border border-gray-300 rounded text-xs focus:outline-none focus:border-indigo-500"
                      />
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={addingMember || !newMemberPhone.trim()}
                        isLoading={addingMember}
                        onClick={() => void handleAddGroupMember()}
                      >
                        Tambahkan
                      </Button>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Format internasional tanpa tanda plus atau spasi, contoh: 628123456789.
                    </p>
                  </div>

                  <div className="pt-2 border-t border-gray-100 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold text-gray-700">
                        Pilih Cepat dari Kontak CRM
                      </div>
                      <label className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                        <span>Tampil</span>
                        <select
                          value={quickMemberLimit}
                          onChange={(e) => {
                            setQuickMemberLimit(Number(e.target.value) || 25);
                            setQuickMemberPage(1);
                          }}
                          className="h-6 px-1.5 border border-gray-200 rounded bg-white text-[11px] text-gray-700 focus:outline-none focus:border-indigo-500"
                        >
                          <option value={15}>15</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </label>
                    </div>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={quickMemberSearch}
                        onChange={(e) => {
                          setQuickMemberSearch(e.target.value);
                          setQuickMemberPage(1);
                        }}
                        placeholder="Cari nama atau nomor WA kontak..."
                        className="w-full h-8 pl-8 pr-2.5 border border-gray-200 rounded text-[11px] bg-gray-50 focus:bg-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="max-h-52 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded">
                      {loadingQuickMemberContacts && quickMemberContacts.length === 0 ? (
                        <div className="p-3 text-center text-[11px] text-gray-500">Memuat kontak CRM...</div>
                      ) : quickMemberContacts.length === 0 ? (
                        <div className="p-3 text-center text-[11px] text-gray-400">
                          {quickMemberSearch.trim()
                            ? 'Tidak ada kontak dengan nomor WhatsApp yang cocok.'
                            : 'Belum ada kontak dengan nomor WhatsApp tersimpan.'}
                        </div>
                      ) : (
                        quickMemberContacts.map((c) => {
                          const isChosen = newMemberPhone.replace(/\D/g, '') === (c.nomor_whatsapp || '').replace(/\D/g, '');
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setNewMemberPhone(c.nomor_whatsapp || '')}
                              className={`w-full px-2.5 py-1.5 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                                isChosen ? 'bg-indigo-50/70' : 'hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <ContactAvatar
                                  url={c.profile_picture_url}
                                  label={c.nama_lengkap}
                                  className="w-6 h-6 rounded-full bg-slate-600 text-white font-semibold text-[9px] shrink-0"
                                />
                                <span className="font-medium text-gray-800 truncate">{c.nama_lengkap}</span>
                              </div>
                              <span className="text-[10px] font-mono text-gray-500 shrink-0">
                                +{c.nomor_whatsapp}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-0.5 text-[10px] text-gray-500 tabular-nums">
                      <span>
                        {quickMemberTotal > 0
                          ? `${(quickMemberPage - 1) * quickMemberLimit + 1}-${Math.min(
                              quickMemberPage * quickMemberLimit,
                              quickMemberTotal
                            )} dari ${quickMemberTotal.toLocaleString('id-ID')} kontak`
                          : '0 kontak'}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={loadingQuickMemberContacts || quickMemberPage <= 1}
                          onClick={() => setQuickMemberPage((p) => Math.max(1, p - 1))}
                          className="px-2 py-0.5 rounded border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-gray-700"
                        >
                          Sebelumnya
                        </button>
                        <span className="px-1.5 font-mono text-gray-700">
                          Hal {quickMemberPage}/{quickMemberTotalPages}
                        </span>
                        <button
                          type="button"
                          disabled={loadingQuickMemberContacts || quickMemberPage >= quickMemberTotalPages}
                          onClick={() => setQuickMemberPage((p) => Math.min(quickMemberTotalPages, p + 1))}
                          className="px-2 py-0.5 rounded border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-gray-700"
                        >
                          Berikutnya
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteMessageTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4"
          onClick={() => !deletingMessageScope && setDeleteMessageTarget(null)}
        >
          <div
            className="bg-white rounded-lg border border-gray-200 shadow-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-red-50 border border-red-200 text-red-600 flex items-center justify-center shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Hapus Pesan</h3>
                  <p className="text-[11px] text-gray-500">
                    Pilih tarik dari WhatsApp pelanggan atau hapus di sisi CRM saja.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={deletingMessageScope !== null}
                onClick={() => setDeleteMessageTarget(null)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div className="p-2.5 rounded-md bg-gray-50 border border-gray-200 text-gray-700 line-clamp-3 break-words">
                {deleteMessageTarget.body || `[${deleteMessageTarget.messageType || 'Media'}]`}
              </div>

              {(() => {
                const convChannel = (
                  selectedConversation?.channel ||
                  'WHATSAPP'
                ).toUpperCase();
                const isGroupChat = Boolean(
                  selectedConversation?.isGroup ||
                    selectedConversation?.externalThreadId?.toLowerCase().endsWith('@g.us')
                );
                const canPullEverywhere =
                  deleteMessageTarget.messageType !== 'NOTE' &&
                  convChannel === 'WHATSAPP' &&
                  Boolean(deleteMessageTarget.wahaMessageId) &&
                  (deleteMessageTarget.direction === 'OUTBOUND' || isGroupChat);
                const pullDisabledReason =
                  deleteMessageTarget.messageType === 'NOTE'
                    ? 'Catatan internal hanya tersimpan di CRM.'
                    : convChannel !== 'WHATSAPP'
                    ? `Tarik pesan untuk semua saat ini hanya didukung di WhatsApp.`
                    : !deleteMessageTarget.wahaMessageId
                    ? 'Pesan ini belum terkirim ke WhatsApp (tidak ada ID pesan WAHA).'
                    : deleteMessageTarget.direction !== 'OUTBOUND' && !isGroupChat
                    ? 'Di obrolan pribadi, hanya pesan keluar Anda yang dapat ditarik untuk semua.'
                    : null;

                return (
                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled={!canPullEverywhere || deletingMessageScope !== null}
                      onClick={() => void handleDeleteConversationMessage('EVERYONE')}
                      className="w-full text-left p-3 rounded-md border border-red-200 bg-red-50/70 hover:bg-red-100/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors space-y-0.5"
                    >
                      <div className="font-semibold text-red-800 flex items-center justify-between gap-2">
                        <span>
                          {deletingMessageScope === 'EVERYONE'
                            ? 'Menarik pesan dari WhatsApp...'
                            : 'Tarik Pesan (Untuk Semua Orang)'}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/80 border border-red-200 text-red-700">
                          WA + CRM
                        </span>
                      </div>
                      <p className="text-[11px] text-red-700/90 leading-snug">
                        {pullDisabledReason ||
                          'Menarik pesan agar terhapus di WhatsApp pelanggan/grup. Di CRM pesan tetap tersimpan untuk audit dengan tanda merah ditarik.'}
                      </p>
                    </button>

                    <button
                      type="button"
                      disabled={deletingMessageScope !== null}
                      onClick={() => void handleDeleteConversationMessage('ME')}
                      className="w-full text-left p-3 rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors space-y-0.5"
                    >
                      <div className="font-semibold text-gray-900 flex items-center justify-between gap-2">
                        <span>
                          {deletingMessageScope === 'ME'
                            ? 'Menandai pesan dihapus...'
                            : 'Hapus Pribadi (Hanya di CRM)'}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-600">
                          CRM Saja
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-600 leading-snug">
                        Menandai pesan sebagai dihapus pada riwayat CRM dengan label merah untuk audit, tanpa menarik pesan di WhatsApp pelanggan.
                      </p>
                    </button>
                  </div>
                );
              })()}
            </div>

            <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-200 flex justify-end">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={deletingMessageScope !== null}
                onClick={() => setDeleteMessageTarget(null)}
              >
                Batal
              </Button>
            </div>
          </div>
        </div>
      )}

      {forwardingMessage && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => !forwardingSending && setForwardingMessage(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-lg border border-gray-200 shadow-xl overflow-hidden flex flex-col max-h-[82vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Forward className="w-4 h-4 text-emerald-600 shrink-0" />
                <h3 className="text-sm font-semibold text-gray-900 truncate">Teruskan Pesan</h3>
              </div>
              <button
                type="button"
                disabled={forwardingSending}
                onClick={() => setForwardingMessage(null)}
                className="p-1 rounded text-gray-400 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <div className="p-2.5 rounded bg-gray-50 border border-gray-200 text-xs space-y-1">
                <div className="text-[10px] font-semibold text-gray-500">
                  Sumber: {resolveMessageSenderName(forwardingMessage)}
                </div>
                <div className="text-gray-800 line-clamp-3 whitespace-pre-wrap break-words">
                  {forwardingMessage.body
                    ? formatMentionPlainText(
                        forwardingMessage.body,
                        mySessionPhones,
                        contactsByPhone,
                        participantsLookup,
                        forwardingMessage.mentionedContacts
                      )
                    : forwardingMessage.mediaName || '[Media]'}
                </div>
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Cari kontak atau grup tujuan..."
                  value={forwardSearch}
                  onChange={(e) => setForwardSearch(e.target.value)}
                  className="w-full h-8 px-2.5 bg-white border border-gray-200 rounded text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-56 overflow-y-auto">
                {conversations
                  .filter((c) => {
                    const q = forwardSearch.trim().toLowerCase();
                    if (!q) return true;
                    const title = getConversationDisplayTitle(c).toLowerCase();
                    const phone = (c.contact?.nomor_whatsapp || '').toLowerCase();
                    return title.includes(q) || phone.includes(q);
                  })
                  .slice(0, 40)
                  .map((c) => {
                    const selected = forwardTargetConvId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setForwardTargetConvId(c.id)}
                        className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                          selected ? 'bg-indigo-50 text-indigo-900' : 'hover:bg-gray-50 text-gray-800'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{getConversationDisplayTitle(c)}</div>
                          <div className="text-[10px] font-mono text-gray-500 truncate">
                            {c.contact?.nomor_whatsapp || c.channel || 'WHATSAPP'}
                          </div>
                        </div>
                        {selected && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                      </button>
                    );
                  })}
              </div>
            </div>
            <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={forwardingSending}
                onClick={() => setForwardingMessage(null)}
              >
                Batal
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={!forwardTargetConvId || forwardingSending}
                isLoading={forwardingSending}
                onClick={() => void handleConfirmForwardMessage()}
              >
                Teruskan Pesan
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pilihan Durasi Pin Pesan */}
      <Modal
        isOpen={Boolean(pinningMessageTarget)}
        onClose={() => setPinningMessageTarget(null)}
        title="Sematkan Pesan"
        subtitle="Pilih durasi sematan pesan di obrolan CRM dan WhatsApp"
        maxWidthClass="max-w-md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              type="button"
              onClick={() => setPinningMessageTarget(null)}
              className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-medium cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={submittingPin}
              onClick={() => void handleConfirmPinMessage()}
              className="px-3.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Pin className="w-3.5 h-3.5" />
              <span>{submittingPin ? 'Menyematkan...' : 'Sematkan Pesan'}</span>
            </button>
          </div>
        }
      >
        <div className="space-y-3.5 py-1">
          {pinningMessageTarget && (
            <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-700 space-y-1">
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Pratinjau Pesan
              </div>
              <p className="line-clamp-3 italic text-gray-800">
                "{pinningMessageTarget.body || pinningMessageTarget.mediaName || '[Pesan Media]'}"
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-800 mb-2">
              Pilih Durasi Sematan
            </label>
            <div className="space-y-2">
              {[
                {
                  seconds: 86400,
                  label: '24 Jam',
                  desc: 'Pesan akan disematkan selama 1 hari',
                },
                {
                  seconds: 604800,
                  label: '7 Hari',
                  desc: 'Standar rekomendasi WhatsApp (1 minggu)',
                },
                {
                  seconds: 2592000,
                  label: '30 Hari',
                  desc: 'Pesan disematkan selama 1 bulan penuh',
                },
              ].map((opt) => (
                <label
                  key={opt.seconds}
                  onClick={() => setPinDurationSeconds(opt.seconds)}
                  className={`flex items-start gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${
                    pinDurationSeconds === opt.seconds
                      ? 'border-indigo-500 bg-indigo-50/70 shadow-2xs'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="pinDuration"
                    value={opt.seconds}
                    checked={pinDurationSeconds === opt.seconds}
                    onChange={() => setPinDurationSeconds(opt.seconds)}
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-900">{opt.label}</span>
                      {opt.seconds === 604800 && (
                        <span className="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700 text-[9px] font-medium">
                          Rekomendasi
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Contact Detail Modal (Mention & Group Participant Popup) */}
      <Modal
        isOpen={Boolean(selectedContactModalTarget)}
        onClose={() => {
          setSelectedContactModalTarget(null);
          setModalContactData(null);
        }}
        title="Detail Kontak"
        subtitle={
          selectedConversation?.isGroup
            ? `Informasi anggota grup ${getConversationDisplayTitle(selectedConversation)}`
            : 'Informasi kontak WhatsApp'
        }
        maxWidthClass="max-w-md"
        footer={
          <div className="w-full flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 order-2 sm:order-1">
              {onOpenContact && (
                <button
                  type="button"
                  onClick={handleOpenInContactsTab}
                  className="px-2.5 py-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Buka data kontak di menu master kontak"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                  <span>Menu Kontak</span>
                </button>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 order-1 sm:order-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedContactModalTarget(null);
                  setModalContactData(null);
                }}
                className="px-3 py-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 transition-colors cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={openingContactId === 'modal_contact'}
                onClick={() => void handleStartDirectChatFromModal()}
                className="px-3.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>
                  {openingContactId === 'modal_contact' ? 'Membuka...' : 'Mulai Chat Pribadi'}
                </span>
              </button>
            </div>
          </div>
        }
      >
        {loadingContactModal && !modalContactData ? (
          <LoadingState message="Memuat detail kontak..." />
        ) : (
          <div className="space-y-4">
            {/* Top Profile Card */}
            <div className="text-center pb-3 border-b border-gray-200">
              <ContactAvatar
                url={modalContactData?.profile_picture_url || selectedContactModalTarget?.avatarUrl}
                label={modalContactData?.nama_lengkap || selectedContactModalTarget?.name || 'Kontak'}
                className="w-14 h-14 rounded-full bg-indigo-50 text-indigo-700 font-bold text-lg mx-auto mb-2 border-2 border-indigo-200 shadow-2xs"
                onClick={(e) => {
                  const pic = modalContactData?.profile_picture_url || selectedContactModalTarget?.avatarUrl;
                  if (pic) {
                    e.stopPropagation();
                    handleOpenAvatarLightbox(
                      pic,
                      modalContactData?.nama_lengkap || selectedContactModalTarget?.name || 'Foto Profil'
                    );
                  }
                }}
                title={
                  (modalContactData?.profile_picture_url || selectedContactModalTarget?.avatarUrl)
                    ? 'Klik untuk melihat foto profil penuh'
                    : undefined
                }
              />
              <h4 className="font-semibold text-gray-900 text-sm break-words">
                {modalContactData?.nama_lengkap || selectedContactModalTarget?.name || 'Kontak WhatsApp'}
              </h4>
              {modalContactData?.nama_panggilan && (
                <div className="text-xs text-gray-500 mt-0.5">
                  Panggilan: {modalContactData.nama_panggilan}
                </div>
              )}

              {/* Badges */}
              <div className="mt-2 flex items-center justify-center flex-wrap gap-1.5">
                {selectedContactModalTarget?.role && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      selectedContactModalTarget.role === 'superadmin'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : selectedContactModalTarget.role === 'admin'
                        ? 'bg-slate-100 text-slate-700 border-slate-200'
                        : 'bg-gray-100 text-gray-700 border-gray-200'
                    }`}
                  >
                    <Shield className="w-3 h-3" />
                    <span>
                      {selectedContactModalTarget.role === 'superadmin'
                        ? 'Owner Grup'
                        : selectedContactModalTarget.role === 'admin'
                        ? 'Admin Grup'
                        : 'Anggota Grup'}
                    </span>
                  </span>
                )}

                {modalContactData?.id ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <UserCheck className="w-3 h-3" />
                    <span>Terdaftar di CRM</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                    <User className="w-3 h-3" />
                    <span>Belum Terdaftar di CRM</span>
                  </span>
                )}
              </div>

              {/* Save to CRM or Sync WA actions */}
              <div className="mt-2.5 flex items-center justify-center gap-2 flex-wrap">
                {!modalContactData?.id && (modalContactData?.nomor_whatsapp || selectedContactModalTarget?.phone) && (
                  <button
                    type="button"
                    disabled={savingModalContact}
                    onClick={() => void handleSaveContactFromModal()}
                    className="px-2.5 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{savingModalContact ? 'Menyimpan...' : 'Simpan ke CRM'}</span>
                  </button>
                )}

                {modalContactData?.id && (
                  <button
                    type="button"
                    disabled={syncingModalContact}
                    onClick={() => void handleSyncModalContactProfile()}
                    className="px-2.5 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50 text-[11px] font-medium text-gray-700 inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${syncingModalContact ? 'animate-spin' : ''}`} />
                    <span>{syncingModalContact ? 'Menyinkronkan...' : 'Sync Profil WA'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Contact Details List */}
            <div className="space-y-2.5 text-xs">
              {/* WhatsApp Number */}
              <div className="p-2.5 rounded-lg border border-gray-200 bg-gray-50/70 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-0.5">
                    Nomor WhatsApp
                  </span>
                  <div className="font-mono text-gray-900 font-semibold text-xs sm:text-[13px] flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span className="truncate">
                      {(modalContactData?.nomor_whatsapp || selectedContactModalTarget?.phone)
                        ? `+${(modalContactData?.nomor_whatsapp || selectedContactModalTarget?.phone)?.replace(/\D/g, '')}`
                        : 'Tidak tersedia'}
                    </span>
                  </div>
                </div>
                {(modalContactData?.nomor_whatsapp || selectedContactModalTarget?.phone) && (
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyContactPhone(
                        modalContactData?.nomor_whatsapp || selectedContactModalTarget?.phone
                      )
                    }
                    className="p-1.5 rounded hover:bg-gray-200/70 text-gray-500 hover:text-gray-800 transition-colors shrink-0 cursor-pointer"
                    title="Salin nomor WhatsApp"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* JID if available */}
              {selectedContactModalTarget?.jid && (
                <div className="p-2 rounded-lg border border-gray-200 bg-white text-[11px]">
                  <span className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
                    WhatsApp JID / ID Teknis
                  </span>
                  <div className="font-mono text-gray-700 break-all select-all">
                    {selectedContactModalTarget.jid}
                  </div>
                </div>
              )}

              {/* Bio / Profile About */}
              {modalContactData?.profile_about && (
                <div className="p-2.5 rounded-lg border border-gray-200 bg-white">
                  <span className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Info className="w-3 h-3 text-indigo-500" />
                    <span>Info Profil / Bio</span>
                  </span>
                  <p className="text-[11px] text-gray-700 whitespace-pre-wrap break-words leading-relaxed">
                    {modalContactData.profile_about}
                  </p>
                </div>
              )}

              {/* Birthday and Address if available */}
              {(modalContactData?.tanggal_lahir || modalContactData?.alamat) && (
                <div className="p-2.5 rounded-lg border border-gray-200 bg-white space-y-2">
                  {modalContactData.tanggal_lahir && (
                    <div>
                      <span className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
                        Tanggal Lahir
                      </span>
                      <div className="flex items-center gap-1.5 text-gray-800">
                        <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>
                          {new Date(modalContactData.tanggal_lahir).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                  )}
                  {modalContactData.alamat && (
                    <div>
                      <span className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
                        Alamat
                      </span>
                      <div className="flex items-start gap-1.5 text-gray-800">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">{modalContactData.alamat}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Category, Tags, or Notes */}
              {(modalContactData?.kategori || modalContactData?.tags || modalContactData?.notes) && (
                <div className="p-2.5 rounded-lg border border-gray-200 bg-white space-y-1.5">
                  {modalContactData.kategori && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        Kategori:
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        {modalContactData.kategori}
                      </span>
                    </div>
                  )}
                  {modalContactData.tags && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mr-1">
                        Label:
                      </span>
                      {modalContactData.tags
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean)
                        .map((tag, tIdx) => (
                          <span
                            key={tIdx}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700 border border-gray-200"
                          >
                            <Tag className="w-2.5 h-2.5 text-gray-400" />
                            <span>{tag}</span>
                          </span>
                        ))}
                    </div>
                  )}
                  {modalContactData.notes && (
                    <div className="pt-1">
                      <span className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
                        Catatan Internal:
                      </span>
                      <p className="text-[11px] text-gray-600 italic bg-gray-50 p-1.5 rounded border border-gray-100">
                        {modalContactData.notes}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Omnichannel Identities */}
              {Array.isArray(modalContactData?.identities) && modalContactData.identities.length > 0 && (
                <div className="p-2.5 rounded-lg border border-gray-200 bg-white">
                  <span className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                    Kanal Omnichannel
                  </span>
                  <div className="space-y-1">
                    {modalContactData.identities.map((idItem, iIdx) => (
                      <div
                        key={iIdx}
                        className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-gray-50 border border-gray-100"
                      >
                        <span className="font-semibold text-gray-700">{idItem.channel}</span>
                        <span className="font-mono text-gray-600">{idItem.externalId}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={showResolveConfirmModal}
        onClose={() => !resolvingStatus && setShowResolveConfirmModal(false)}
        title="Selesaikan Percakapan (Resolved)"
        subtitle="Pilih apakah tautan survei kepuasan (CSAT) dikirim ke pelanggan atau tidak."
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-950 leading-relaxed">
            Status percakapan dengan{' '}
            <span className="font-semibold">
              {selectedConversation?.contact?.nama_lengkap || selectedConversation?.pushName || 'pelanggan'}
            </span>{' '}
            akan diubah menjadi <span className="font-semibold">Resolved</span>. Apakah ingin sekalian mengirim tautan penilaian CSAT?
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={resolvingStatus}
              onClick={() => setShowResolveConfirmModal(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isLoading={resolvingStatus}
              onClick={() => void handleStatusChange('RESOLVED', false)}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Selesaikan Tanpa CSAT</span>
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              isLoading={resolvingStatus}
              onClick={() => void handleStatusChange('RESOLVED', true)}
            >
              <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-200" />
              <span>Selesaikan &amp; Kirim CSAT</span>
            </Button>
          </div>
        </div>
      </Modal>

      <MediaLibraryPickerModal
        isOpen={mediaPickerMode !== null}
        onClose={() => setMediaPickerMode(null)}
        title={
          mediaPickerMode === 'STICKER'
            ? 'Pilih Gambar untuk Stiker'
            : mediaPickerMode === 'LINK_THUMBNAIL'
            ? 'Pilih Thumbnail Tautan'
            : mediaPickerMode === 'GROUP_AVATAR'
            ? 'Pilih Foto Profil Grup'
            : 'Pilih Berkas dari Galeri'
        }
        multiple={mediaPickerMode === 'CHAT_ATTACHMENT'}
        allowedKinds={
          mediaPickerMode === 'STICKER' ||
          mediaPickerMode === 'LINK_THUMBNAIL' ||
          mediaPickerMode === 'GROUP_AVATAR'
            ? ['image']
            : undefined
        }
        defaultKind={
          mediaPickerMode === 'STICKER' ||
          mediaPickerMode === 'LINK_THUMBNAIL' ||
          mediaPickerMode === 'GROUP_AVATAR'
            ? 'image'
            : 'all'
        }
        showAsDocumentOption={mediaPickerMode === 'CHAT_ATTACHMENT'}
        onConfirm={handleConfirmMediaPicker}
      />

      {lightboxMedia && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
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
