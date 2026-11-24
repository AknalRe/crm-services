import React, { useEffect, useRef } from 'react';
import { Check, CheckCheck, EyeOff, Image as ImageIcon, FileText, Mic, Video, X, MessageSquare } from 'lucide-react';
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

function renderMediaTag(msg: ChatMessage) {
  if (!msg.mediaType) return null;
  if (msg.mediaType === 'image') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-600 mb-0.5">
        <ImageIcon className="w-3 h-3" />
        <span>Gambar</span>
      </span>
    );
  }
  if (msg.mediaType === 'video') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-600 mb-0.5">
        <Video className="w-3 h-3" />
        <span>Video</span>
      </span>
    );
  }
  if (msg.mediaType === 'audio') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-600 mb-0.5">
        <Mic className="w-3 h-3" />
        <span>Audio</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-600 mb-0.5">
      <FileText className="w-3 h-3" />
      <span className="truncate max-w-[160px]">{msg.mediaName || 'Dokumen'}</span>
    </span>
  );
}

function parseMeta(raw?: string | null): Record<string, any> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function MiniChatMessages({
  messages,
  loading,
  isGroup,
  fallbackLastMessage,
  fallbackTime,
  maxItems,
}: {
  messages: ChatMessage[];
  loading: boolean;
  isGroup?: boolean;
  fallbackLastMessage?: string | null;
  fallbackTime?: string | null;
  maxItems: number;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const visible = messages
    .filter((m) => m.messageType !== 'ACTIVITY' && m.messageType !== 'NOTE')
    .slice(-maxItems);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
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
    <div ref={scrollRef} className="space-y-1.5 overflow-y-auto max-h-[46vh] pr-0.5">
      {visible.map((msg) => {
        const isOutbound = msg.direction === 'OUTBOUND';
        const meta = parseMeta(msg.metadataJson);
        const isRevoked = Boolean(meta?.revoked);
        const isEdited = Boolean(meta?.edited);
        const isRead = msg.ackStatus >= 3 || msg.status === 'READ';
        const isDelivered = msg.ackStatus === 2 || msg.status === 'DELIVERED';
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
              {renderMediaTag(msg)}
              <div className={`whitespace-pre-wrap break-words ${isRevoked ? 'line-through opacity-75' : ''}`}>
                {isRevoked ? 'Pesan ditarik' : msg.body}
              </div>
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
}: {
  conv: Conversation;
  title: string;
  anchorRect: { top: number; left: number; right: number; bottom: number };
  messages: ChatMessage[];
  loading: boolean;
}) {
  const cardWidth = 340;
  const maxCardHeight = 320;
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;

  let left = anchorRect.right + 10;
  if (left + cardWidth > viewportW - 16) {
    left = Math.max(12, anchorRect.left - cardWidth - 10);
  }
  const top = Math.min(Math.max(12, anchorRect.top - 8), Math.max(12, viewportH - maxCardHeight - 16));

  return (
    <div
      style={{ top, left, width: cardWidth }}
      className="fixed z-[70] pointer-events-none hidden md:block rounded-xl border border-gray-200/90 bg-slate-50 shadow-xl overflow-hidden animate-in fade-in duration-150"
      role="tooltip"
    >
      <div className="px-3 py-2 bg-white border-b border-gray-200 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-gray-900 truncate">{title}</div>
          <div className="text-[10px] text-gray-500 flex items-center gap-1">
            <EyeOff className="w-2.5 h-2.5 shrink-0" />
            <span>Pratinjau cepat (tidak menandai dibaca)</span>
          </div>
        </div>
        {conv.unreadCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white tabular-nums shrink-0">
            {conv.unreadCount}
          </span>
        )}
      </div>
      <div className="p-2.5 max-h-[260px] overflow-hidden">
        <MiniChatMessages
          messages={messages}
          loading={loading}
          isGroup={conv.isGroup}
          fallbackLastMessage={conv.lastMessage}
          fallbackTime={conv.lastMessageAt}
          maxItems={5}
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
  onOpenChat,
  onClose,
}: {
  conv: Conversation;
  title: string;
  messages: ChatMessage[];
  loading: boolean;
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
            {conv.contact?.profile_picture_url ? (
              <img
                src={conv.contact.profile_picture_url}
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
