import React, { useEffect, useRef } from 'react';
import {
  Check,
  CheckCheck,
  EyeOff,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  Mic,
  Video,
  X,
} from 'lucide-react';
import { ChatMessage, Conversation } from '../types';

interface PeekCacheEntry {
  items: ChatMessage[];
  fetchedAt: number;
}

export type PeekCacheMap = Map<string, PeekCacheEntry>;

function formatBubbleTime(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function parseMeta(raw?: string | null): Record<string, any> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isMediaFallbackOnlyBody(body: string): boolean {
  const t = body.trim();
  return (
    t === '[Gambar]' ||
    t === '[Video]' ||
    t === '[Audio]' ||
    t === '[Stiker]' ||
    t === '[Dokumen]' ||
    t === '[Media]' ||
    t === '[Lampiran Media]' ||
    /^\[Dokumen:.*\]$/.test(t)
  );
}

function PeekMediaBlock({
  msg,
  meta,
  resolveMediaUrl,
  onMediaLoad,
}: {
  msg: ChatMessage;
  meta: Record<string, any> | null;
  resolveMediaUrl: (url?: string | null) => string;
  onMediaLoad?: () => void;
}) {
  if (!msg.mediaType && !msg.mediaUrl) return null;
  const resolved = msg.mediaUrl ? resolveMediaUrl(msg.mediaUrl) : '';
  const isSticker = Boolean(
    meta?.kind === 'STICKER' ||
      (msg.mediaUrl && msg.mediaType === 'image' && msg.body.trim() === '[Stiker]')
  );

  if (msg.mediaType === 'image') {
    if (resolved) {
      return (
        <div className="mb-1">
          <img
            src={resolved}
            alt={msg.mediaName || (isSticker ? 'Stiker' : 'Gambar')}
            loading="eager"
            onLoad={onMediaLoad}
            className={
              isSticker
                ? 'w-20 h-20 object-contain'
                : 'max-h-44 w-full rounded-md object-cover border border-gray-200/80 bg-gray-100'
            }
          />
        </div>
      );
    }
    return (
      <div className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-600 mb-0.5">
        <ImageIcon className="w-3 h-3" />
        <span>{isSticker ? 'Stiker' : 'Gambar'}</span>
      </div>
    );
  }

  if (msg.mediaType === 'video') {
    if (resolved) {
      return (
        <div className="relative mb-1 rounded-md overflow-hidden bg-slate-900 border border-gray-200/80">
          <video
            src={resolved}
            muted
            playsInline
            preload="metadata"
            onLoadedData={onMediaLoad}
            className="max-h-44 w-full object-cover"
          />
          <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/65 text-white text-[10px] font-medium">
            <Video className="w-3 h-3" />
            <span>Video</span>
          </span>
        </div>
      );
    }
    return (
      <div className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-600 mb-0.5">
        <Video className="w-3 h-3" />
        <span>Video</span>
      </div>
    );
  }

  if (msg.mediaType === 'audio') {
    return (
      <div className="mb-1 flex items-center gap-2 rounded-md border border-gray-200 bg-slate-50 px-2 py-1.5">
        <Mic className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
        {resolved ? (
          <audio controls preload="metadata" src={resolved} className="h-7 w-full max-w-[220px]" />
        ) : (
          <span className="text-[11px] font-medium text-gray-700">Pesan Suara / Audio</span>
        )}
      </div>
    );
  }

  return (
    <div className="mb-1 flex items-center gap-2 rounded-md border border-gray-200 bg-slate-50 px-2.5 py-1.5">
      <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
      <span className="text-[11px] font-medium text-gray-800 truncate">
        {msg.mediaName || 'Dokumen'}
      </span>
    </div>
  );
}

function MiniChatMessages({
  messages,
  loading,
  isGroup,
  fallbackLastMessage,
  fallbackTime,
  maxItems,
  maxHeightClass,
  resolveMediaUrl,
}: {
  messages: ChatMessage[];
  loading: boolean;
  isGroup?: boolean;
  fallbackLastMessage?: string | null;
  fallbackTime?: string | null;
  maxItems: number;
  maxHeightClass: string;
  resolveMediaUrl: (url?: string | null) => string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const visible = messages
    .filter((m) => m.messageType !== 'ACTIVITY' && m.messageType !== 'NOTE')
    .slice(-maxItems);

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    scrollToBottom();
    const raf = window.requestAnimationFrame(scrollToBottom);
    return () => window.cancelAnimationFrame(raf);
  }, [visible.length, loading]);

  if (loading && visible.length === 0) {
    return (
      <div className="space-y-2 py-2">
        {fallbackLastMessage ? (
          <div className="rounded-lg bg-white border border-gray-200 px-2.5 py-2 text-xs text-gray-800 whitespace-pre-wrap break-words shadow-2xs">
            <p>{fallbackLastMessage}</p>
            {fallbackTime && (
              <div className="mt-1 text-right text-[10px] font-mono text-gray-400">
                {formatBubbleTime(fallbackTime)}
              </div>
            )}
          </div>
        ) : null}
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 px-1">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-pulse" />
          <span>Memuat pesan terakhir...</span>
        </div>
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="rounded-lg bg-white border border-gray-200 px-3 py-2.5 text-xs text-gray-700 whitespace-pre-wrap break-words">
        {fallbackLastMessage || 'Belum ada pesan pada percakapan ini.'}
      </div>
    );
  }

  return (
    <div ref={scrollRef} className={`space-y-1.5 overflow-y-auto ${maxHeightClass} pr-1`}>
      {visible.map((msg) => {
        const isOutbound = msg.direction === 'OUTBOUND';
        const meta = parseMeta(msg.metadataJson);
        const isRevoked = Boolean(meta?.revoked);
        const isEdited = Boolean(meta?.edited);
        const isRead = msg.ackStatus >= 3 || msg.status === 'READ';
        const isDelivered = msg.ackStatus === 2 || msg.status === 'DELIVERED';
        const hasResolvedMedia = Boolean(msg.mediaUrl);
        const hideFallbackText = !isRevoked && hasResolvedMedia && isMediaFallbackOnlyBody(msg.body || '');

        return (
          <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[88%] rounded-lg px-2.5 py-1.5 text-xs leading-snug border shadow-2xs ${
                isRevoked
                  ? 'bg-rose-50 border-rose-200 text-rose-800 italic'
                  : isOutbound
                  ? 'bg-slate-100 border-slate-200 text-gray-900'
                  : 'bg-white border-gray-200 text-gray-900'
              }`}
            >
              {isGroup && !isOutbound && msg.senderName && (
                <div className="text-[10px] font-semibold text-indigo-700 mb-0.5 truncate">
                  {msg.senderName}
                </div>
              )}
              {(msg.replyToBody || msg.replyToMessageId) && (
                <div className="mb-1 pl-2 border-l-2 border-indigo-400 bg-black/[0.03] rounded-r px-1.5 py-0.5 text-[10px] text-gray-600">
                  {msg.replyToSender && (
                    <div className="font-semibold text-indigo-700 truncate">{msg.replyToSender}</div>
                  )}
                  <div className="truncate">{msg.replyToBody || 'Pesan dikutip'}</div>
                </div>
              )}
              {!isRevoked && (
                <PeekMediaBlock
                  msg={msg}
                  meta={meta}
                  resolveMediaUrl={resolveMediaUrl}
                  onMediaLoad={scrollToBottom}
                />
              )}
              {!hideFallbackText && (
                <div className={`whitespace-pre-wrap break-words ${isRevoked ? 'line-through opacity-75' : ''}`}>
                  {isRevoked ? 'Pesan ditarik' : msg.body}
                </div>
              )}
              <div className="mt-0.5 flex items-center justify-end gap-1 text-[9px] text-gray-400 font-mono tabular-nums">
                {isEdited && <span className="italic font-sans">Diubah</span>}
                <span>{formatBubbleTime(msg.createdAt)}</span>
                {isOutbound && !isRevoked && (
                  isRead ? (
                    <CheckCheck className="w-3 h-3 text-blue-600" />
                  ) : isDelivered ? (
                    <CheckCheck className="w-3 h-3 text-gray-400" />
                  ) : (
                    <Check className="w-2.5 h-2.5 text-gray-400" />
                  )
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DesktopConversationHoverCard({
  conv,
  title,
  anchorRect,
  messages,
  loading,
  resolveMediaUrl,
  onMouseEnter,
  onMouseLeave,
  onOpenChat,
}: {
  conv: Conversation;
  title: string;
  anchorRect: { top: number; left: number; right: number; bottom: number };
  messages: ChatMessage[];
  loading: boolean;
  resolveMediaUrl: (url?: string | null) => string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onOpenChat: () => void;
}) {
  const cardWidth = 400;
  const estCardHeight = 420;
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;

  let left = anchorRect.right + 10;
  if (left + cardWidth > viewportW - 16) {
    left = Math.max(12, anchorRect.left - cardWidth - 10);
  }
  const top = Math.min(Math.max(12, anchorRect.top - 24), Math.max(12, viewportH - estCardHeight - 16));

  return (
    <div
      style={{ top, left, width: cardWidth }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed z-[70] hidden md:flex flex-col rounded-xl border border-gray-200 bg-slate-50 shadow-2xl overflow-hidden"
      role="dialog"
      aria-label={`Pratinjau cepat ${title}`}
    >
      <div className="px-3.5 py-2.5 bg-white border-b border-gray-200 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-gray-900 truncate">{title}</div>
          <div className="text-[10px] text-gray-500 flex items-center gap-1">
            <EyeOff className="w-2.5 h-2.5 shrink-0" />
            <span>Pratinjau cepat (tidak menandai dibaca)</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {conv.unreadCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white tabular-nums">
              {conv.unreadCount}
            </span>
          )}
          <button
            type="button"
            onClick={onOpenChat}
            className="px-2 py-1 rounded-md border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-[11px] font-semibold text-indigo-700 transition-colors"
          >
            Buka
          </button>
        </div>
      </div>
      <div className="p-2.5 bg-slate-100/70">
        <MiniChatMessages
          messages={messages}
          loading={loading}
          isGroup={conv.isGroup}
          fallbackLastMessage={conv.lastMessage}
          fallbackTime={conv.lastMessageAt}
          maxItems={8}
          maxHeightClass="max-h-[340px]"
          resolveMediaUrl={resolveMediaUrl}
        />
      </div>
    </div>
  );
}

export function MobileConversationPeekModal({
  conv,
  title,
  messages,
  loading,
  resolveMediaUrl,
  onOpenChat,
  onClose,
}: {
  conv: Conversation;
  title: string;
  messages: ChatMessage[];
  loading: boolean;
  resolveMediaUrl: (url?: string | null) => string;
  onOpenChat: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const initial = (title || '?').trim().charAt(0).toUpperCase();
  const avatarSrc = conv.contact?.profile_picture_url ? resolveMediaUrl(conv.contact.profile_picture_url) : '';

  return (
    <div
      className="fixed inset-0 z-[80] bg-slate-950/55 backdrop-blur-sm flex flex-col items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Pratinjau chat ${title}`}
    >
      <div
        className="w-full max-w-sm flex flex-col gap-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-2xl border border-gray-200/80 bg-slate-50 shadow-2xl overflow-hidden flex flex-col">
          <div className="px-3.5 py-2.5 bg-white border-b border-gray-200 flex items-center gap-2.5">
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt={title}
                className="w-9 h-9 rounded-full object-cover border border-gray-200 shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-slate-700 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                {initial}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-gray-900 truncate">{title}</div>
              <div className="text-[11px] text-gray-500 flex items-center gap-1">
                <EyeOff className="w-3 h-3 shrink-0" />
                <span>Pratinjau pesan terakhir</span>
              </div>
            </div>
            {conv.unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-600 text-white tabular-nums shrink-0">
                {conv.unreadCount}
              </span>
            )}
          </div>

          <div className="p-3 bg-slate-100/70">
            <MiniChatMessages
              messages={messages}
              loading={loading}
              isGroup={conv.isGroup}
              fallbackLastMessage={conv.lastMessage}
              fallbackTime={conv.lastMessageAt}
              maxItems={8}
              maxHeightClass="max-h-[52vh]"
              resolveMediaUrl={resolveMediaUrl}
            />
          </div>
        </div>

        <div className="rounded-xl bg-white/95 border border-gray-200 shadow-lg overflow-hidden divide-y divide-gray-100">
          <button
            type="button"
            onClick={onOpenChat}
            className="w-full px-4 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50/70 flex items-center justify-between transition-colors"
          >
            <span>Buka Percakapan</span>
            <MessageSquare className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-between transition-colors"
          >
            <span>Tutup</span>
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>
    </div>
  );
}
