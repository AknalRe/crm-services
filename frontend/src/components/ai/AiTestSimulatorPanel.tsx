import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  CornerUpLeft,
  FileText,
  Image as ImageIcon,
  Paperclip,
  RotateCcw,
  Send,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { AiSimulatorChatTurn, AiTestResult } from '../../types';
import { Button } from '../ui/Button';

interface AiTestSimulatorPanelProps {
  testMessage: string;
  onTestMessageChange: (val: string) => void;
  testing: boolean;
  testResult: AiTestResult | null;
  testError: string | null;
  onSubmitTest: (e: React.FormEvent) => void;
  providerLabelFallback: string;
  agentName?: string;
  agentModel?: string;
  enabledToolsCount?: number;
  chatTurns?: AiSimulatorChatTurn[];
  onSendChatTurn?: (payload: {
    text: string;
    imageUrl?: string | null;
    mediaName?: string | null;
    replyToMessageId?: string | null;
    replyToPreview?: string | null;
    customerName: string;
  }) => Promise<void>;
  onClearChat?: () => void;
}

const SAMPLE_PROMPTS = [
  'Halo, produk apa saja yang tersedia dan berapa harganya?',
  'Bagaimana syarat dan kebijakan garansi atau retur?',
  'Bisa kirimkan foto produk atau brosur dari galeri?',
  'Tolong cek riwayat chat saya dan catat saya minat paket Pro.',
  'Tolong hubungkan saya dengan admin / CS manusia.',
];

export const AiTestSimulatorPanel: React.FC<AiTestSimulatorPanelProps> = ({
  testMessage,
  onTestMessageChange,
  testing,
  testResult,
  testError,
  onSubmitTest,
  providerLabelFallback,
  agentName = 'Asisten CRM',
  agentModel = 'local-kb-matcher',
  enabledToolsCount = 0,
  chatTurns = [],
  onSendChatTurn,
  onClearChat,
}) => {
  const [customerName, setCustomerName] = useState('Budi Santoso');
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedName, setAttachedName] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<{ id: string; preview: string; sender: string } | null>(
    null
  );
  const [expandedTraces, setExpandedTraces] = useState<Record<string, boolean>>({});
  const [previewLightboxUrl, setPreviewLightboxUrl] = useState<string | null>(null);

  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [chatTurns.length, testing]);

  const toggleTrace = (turnId: string) => {
    setExpandedTraces((prev) => ({ ...prev, [turnId]: !prev[turnId] }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAttachedImage(reader.result);
        setAttachedName(file.name);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            setAttachedImage(reader.result);
            setAttachedName(file.name || `screenshot-${Date.now()}.png`);
          }
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  };

  const triggerSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanText = testMessage.trim();
    if (!cleanText && !attachedImage) return;
    if (testing) return;

    if (onSendChatTurn) {
      const img = attachedImage;
      const name = attachedName;
      const quote = replyTarget;
      setAttachedImage(null);
      setAttachedName(null);
      setReplyTarget(null);
      onTestMessageChange('');
      await onSendChatTurn({
        text: cleanText || (name ? `[Melampirkan foto: ${name}]` : 'Mohon cek foto ini'),
        imageUrl: img,
        mediaName: name,
        replyToMessageId: quote?.id || null,
        replyToPreview: quote?.preview || null,
        customerName: customerName.trim() || 'Budi Santoso',
      });
    } else if (e) {
      onSubmitTest(e);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void triggerSend();
    }
  };

  // Fallback legacy view if parent doesn't pass chatTurns and only has single testResult
  const effectiveTurns: AiSimulatorChatTurn[] =
    chatTurns.length > 0
      ? chatTurns
      : testResult
        ? [
            {
              id: 'sim_msg_1',
              role: 'assistant',
              content: testResult.reply || '(Tidak ada balasan)',
              timestamp: new Date().toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
              }),
              replyToMessageId: testResult.replyToMessageId,
              replyToPreview: testResult.replyToPreview,
              resultMeta: {
                source: testResult.source,
                providerLabel: testResult.providerLabel,
                model: testResult.model,
                fallbackUsed: testResult.fallbackUsed,
                attempts: testResult.attempts || [],
                toolCalls: testResult.toolCalls || [],
                outboundMedia: testResult.outboundMedia || [],
              },
            },
          ]
        : [];

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col shadow-xs">
      {/* Inbox CRM Style Top Header */}
      <div className="px-3.5 py-2.5 bg-white border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-semibold text-xs shrink-0">
            {(customerName.trim()[0] || 'B').toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {editingCustomer ? (
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  onBlur={() => setEditingCustomer(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setEditingCustomer(false);
                  }}
                  autoFocus
                  className="h-6 px-1.5 text-xs font-semibold text-gray-900 border border-indigo-300 rounded bg-white"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingCustomer(true)}
                  title="Klik untuk ubah nama pelanggan simulasi"
                  className="text-xs font-semibold text-gray-900 hover:text-indigo-600 truncate"
                >
                  {customerName || 'Budi Santoso'}
                </button>
              )}
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                WA • Simulasi Inbox
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-gray-500 mt-0.5">
              <span className="font-mono">+6281234567890</span>
              <span>•</span>
              <span className="inline-flex items-center gap-1 text-gray-600 font-medium">
                <Bot className="w-3 h-3 text-indigo-600" />
                {agentName}
              </span>
              <span className="font-mono text-gray-400 truncate max-w-[160px]">
                ({agentModel || providerLabelFallback})
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {enabledToolsCount > 0 && (
            <span
              title="Jumlah Tool CRM & Skill yang siap dipanggil oleh AI"
              className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px] font-medium inline-flex items-center gap-1"
            >
              <Wrench className="w-3 h-3 text-gray-500" />
              {enabledToolsCount} Tool
            </span>
          )}
          {effectiveTurns.length > 0 && onClearChat && (
            <button
              type="button"
              onClick={() => {
                setReplyTarget(null);
                setAttachedImage(null);
                setAttachedName(null);
                onClearChat();
              }}
              title="Bersihkan dan mulai ulang simulasi percakapan"
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50 text-[11px] text-gray-600 hover:text-gray-900 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Chat</span>
            </button>
          )}
        </div>
      </div>

      {/* Inbox CRM Style Chat Thread Body */}
      <div className="bg-slate-50/80 px-3.5 py-3 space-y-3 min-h-[300px] max-h-[480px] overflow-y-auto">
        <div className="flex justify-center">
          <span className="px-2.5 py-0.5 rounded-full bg-white border border-gray-200 text-[10px] text-gray-500 shadow-2xs">
            Simulasi Chat Pelanggan ↔ {agentName}
          </span>
        </div>

        {effectiveTurns.length === 0 && !testing && (
          <div className="py-8 px-4 text-center space-y-2">
            <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
              <Bot className="w-4 h-4" />
            </div>
            <div className="text-xs font-medium text-gray-800">
              Mulai Simulasi Obrolan seperti di Inbox CRM
            </div>
            <p className="text-[11px] text-gray-500 max-w-md mx-auto leading-relaxed">
              Ketik pesan pelanggan, lampirkan foto untuk menguji analisis visual AI, atau klik salah satu skenario di bawah untuk menguji Personality, Prompt, Knowledge Book, dan Tool CRM.
            </p>
          </div>
        )}

        {effectiveTurns.map((turn, idx) => {
          const isCustomer = turn.role === 'user';
          const meta = turn.resultMeta;
          const hasTools = Boolean(meta?.toolCalls && meta.toolCalls.length > 0);
          const hasAttempts = Boolean(meta?.attempts && meta.attempts.length > 0);
          const isTraceOpen =
            expandedTraces[turn.id] !== undefined
              ? expandedTraces[turn.id]
              : Boolean(hasTools || meta?.error);
          const totalDuration =
            meta?.attempts?.reduce((acc, a) => acc + (a.durationMs || 0), 0) || 0;

          return (
            <div
              key={turn.id || idx}
              className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'}`}
            >
              <div
                className={`group relative max-w-[90%] sm:max-w-[85%] rounded-lg border px-3 py-2.5 shadow-2xs space-y-1.5 ${
                  isCustomer
                    ? 'bg-white border-gray-200 text-gray-900'
                    : meta?.error
                      ? 'bg-rose-50/80 border-rose-200 text-rose-900'
                      : 'bg-indigo-50/60 border-indigo-200/80 text-gray-900'
                }`}
              >
                {/* Bubble Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isCustomer ? (
                      <>
                        <span className="inline-flex items-center gap-1 font-semibold text-gray-800">
                          <User className="w-3 h-3 text-emerald-600" />
                          {customerName || 'Pelanggan'}
                        </span>
                        <span className="font-mono text-gray-400">#{turn.id}</span>
                      </>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-semibold">
                          <Bot className="w-3 h-3" />
                          Bot AI
                        </span>
                        {meta && (
                          <>
                            <span
                              className={`px-1.5 py-0.5 rounded font-semibold ${
                                meta.fallbackUsed
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {meta.fallbackUsed ? 'Fallback' : 'Utama'}
                            </span>
                            <span className="font-mono text-gray-600">{meta.model}</span>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setReplyTarget({
                          id: turn.id,
                          preview: turn.content.slice(0, 90),
                          sender: isCustomer ? customerName || 'Pelanggan' : agentName,
                        })
                      }
                      title="Kutip / Reply pesan ini"
                      className="opacity-70 hover:opacity-100 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-gray-200 bg-white text-gray-600 hover:text-indigo-600 text-[10px]"
                    >
                      <CornerUpLeft className="w-2.5 h-2.5" />
                      <span>Reply</span>
                    </button>
                  </div>
                </div>

                {/* Quoted Message Preview if replying */}
                {(turn.replyToPreview || turn.replyToMessageId) && (
                  <div className="pl-2.5 py-1 pr-2 rounded bg-gray-100/90 border-l-2 border-indigo-500 text-[11px] text-gray-600">
                    <div className="font-mono text-[10px] text-indigo-700 font-semibold">
                      Mengutip #{turn.replyToMessageId || 'pesan'}
                    </div>
                    <div className="truncate">{turn.replyToPreview || turn.replyToMessageId}</div>
                  </div>
                )}

                {/* Customer Attached Image */}
                {turn.imageUrl && (
                  <div className="pt-0.5">
                    <button
                      type="button"
                      onClick={() => setPreviewLightboxUrl(turn.imageUrl || null)}
                      className="block rounded-md overflow-hidden border border-gray-200 bg-gray-50 max-w-[220px]"
                    >
                      <img
                        src={turn.imageUrl}
                        alt={turn.mediaName || 'Lampiran'}
                        className="max-h-44 w-auto object-cover"
                      />
                    </button>
                    {turn.mediaName && (
                      <div className="text-[10px] font-mono text-gray-500 mt-0.5">
                        {turn.mediaName}
                      </div>
                    )}
                  </div>
                )}

                {/* Message Text Content */}
                <div className="text-xs leading-relaxed whitespace-pre-wrap break-words">
                  {turn.content}
                </div>

                {/* AI Outbound Media Sent via crm_send_media */}
                {meta?.outboundMedia && meta.outboundMedia.length > 0 && (
                  <div className="pt-1.5 space-y-1.5">
                    {meta.outboundMedia.map((media, mIdx) => (
                      <div
                        key={`${media.mediaUrl}-${mIdx}`}
                        className="rounded-md border border-indigo-200 bg-white p-2 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2 text-[10px] text-indigo-700 font-medium">
                          <span className="inline-flex items-center gap-1">
                            {media.mediaType === 'image' ? (
                              <ImageIcon className="w-3 h-3" />
                            ) : (
                              <FileText className="w-3 h-3" />
                            )}
                            Dikirim oleh AI: <span className="font-mono">{media.fileName}</span>
                          </span>
                          <a
                            href={media.mediaUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline hover:text-indigo-900"
                          >
                            Buka
                          </a>
                        </div>
                        {media.mediaType === 'image' && (
                          <button
                            type="button"
                            onClick={() => setPreviewLightboxUrl(media.mediaUrl)}
                            className="block rounded overflow-hidden border border-gray-200 max-w-[220px]"
                          >
                            <img
                              src={media.mediaUrl}
                              alt={media.fileName}
                              className="max-h-40 w-auto object-cover"
                            />
                          </button>
                        )}
                        {media.caption && (
                          <div className="text-[11px] text-gray-700">{media.caption}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Footer Timestamp & Diagnostic Trace Toggle */}
                <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-500">
                  <div className="flex items-center gap-2">
                    {(hasTools || hasAttempts) && (
                      <button
                        type="button"
                        onClick={() => toggleTrace(turn.id)}
                        className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-700 hover:text-indigo-900"
                      >
                        {isTraceOpen ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                        <span>
                          {hasTools ? `${meta?.toolCalls?.length} Tool Dipanggil` : 'Jejak Model'}
                        </span>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 font-mono">
                    {totalDuration > 0 && <span>{totalDuration}ms •</span>}
                    <span>{turn.timestamp}</span>
                    {!isCustomer && <span className="text-indigo-600">✓✓</span>}
                  </div>
                </div>

                {/* Expandable Tool Calls & Model Execution Trace */}
                {!isCustomer && isTraceOpen && (hasTools || hasAttempts) && (
                  <div className="mt-1.5 pt-2 border-t border-indigo-200/70 space-y-2 text-[11px]">
                    {hasTools && (
                      <div className="space-y-1">
                        <div className="text-[10px] font-semibold text-gray-700">
                          Tool Dipanggil ({meta?.toolCalls?.length})
                        </div>
                        {meta?.toolCalls?.map((tc, tIdx) => (
                          <div
                            key={`${tc.toolName}-${tIdx}`}
                            className="bg-white rounded border border-gray-200 px-2 py-1.5 space-y-0.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1">
                                <span
                                  className={`px-1 py-0.2 rounded text-[9px] font-semibold ${
                                    tc.source === 'MCP'
                                      ? 'bg-indigo-50 text-indigo-700'
                                      : 'bg-emerald-50 text-emerald-700'
                                  }`}
                                >
                                  {tc.source}
                                </span>
                                <span className="font-mono font-medium text-gray-900 text-[10px]">
                                  {tc.toolName}
                                </span>
                                {tc.serverName && (
                                  <span className="text-[10px] text-gray-500">
                                    ({tc.serverName})
                                  </span>
                                )}
                              </div>
                              <span className="font-mono text-[10px] text-gray-400">
                                {tc.durationMs}ms
                              </span>
                            </div>
                            <p className="text-[10px] text-gray-600 whitespace-pre-wrap break-words">
                              {tc.summary}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {hasAttempts && (
                      <div className="space-y-1">
                        <div className="text-[10px] font-semibold text-gray-700">
                          Jejak Eksekusi Model
                        </div>
                        {meta?.attempts.map((att, aIdx) => (
                          <div
                            key={`${att.slotId}-${aIdx}`}
                            className="flex flex-wrap items-baseline justify-between gap-2 text-[10px] bg-white/80 rounded border border-gray-200 px-2 py-1"
                          >
                            <div className="min-w-0">
                              <span
                                className={`font-semibold ${
                                  att.ok ? 'text-emerald-700' : 'text-rose-700'
                                }`}
                              >
                                {att.ok ? 'OK' : 'GAGAL'}
                              </span>{' '}
                              <span>{att.slotLabel}</span> •{' '}
                              <span className="font-medium">{att.providerLabel}</span> (
                              <span className="font-mono">{att.model}</span>)
                              {!att.ok && att.error ? (
                                <span className="text-rose-700"> — {att.error}</span>
                              ) : null}
                            </div>
                            <span className="font-mono text-gray-400 shrink-0">
                              {att.durationMs}ms
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {testing && (
          <div className="flex flex-col items-end">
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-800 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
              <span>{agentName} sedang menyusun balasan &amp; memeriksa tool...</span>
            </div>
          </div>
        )}

        {testError && effectiveTurns.length === 0 && (
          <div className="p-2.5 rounded border border-rose-200 bg-rose-50 text-xs text-rose-800 whitespace-pre-wrap">
            {testError}
          </div>
        )}

        <div ref={threadEndRef} />
      </div>

      {/* Quick Scenario Prompts Bar */}
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 flex items-center gap-1.5 overflow-x-auto">
        <span className="text-[10px] font-semibold text-gray-500 shrink-0">Skenario:</span>
        {SAMPLE_PROMPTS.map((sample) => (
          <button
            key={sample}
            type="button"
            onClick={() => onTestMessageChange(sample)}
            className="px-2 py-1 rounded border border-gray-200 bg-white hover:bg-indigo-50 hover:border-indigo-200 text-[11px] text-gray-700 whitespace-nowrap transition-colors shrink-0"
          >
            {sample}
          </button>
        ))}
      </div>

      {/* Inbox CRM Style Composer Footer */}
      <form onSubmit={(e) => void triggerSend(e)} className="p-3 bg-white border-t border-gray-200 space-y-2">
        {/* Quoted Reply Banner */}
        {replyTarget && (
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-indigo-50/70 border-l-2 border-indigo-600 text-[11px]">
            <div className="min-w-0">
              <div className="font-semibold text-indigo-800">
                Membalas {replyTarget.sender} <span className="font-mono">(#{replyTarget.id})</span>
              </div>
              <div className="text-gray-600 truncate">{replyTarget.preview}</div>
            </div>
            <button
              type="button"
              onClick={() => setReplyTarget(null)}
              className="p-1 text-gray-400 hover:text-gray-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Attached Photo Preview Banner */}
        {attachedImage && (
          <div className="flex items-center justify-between gap-2.5 px-2.5 py-1.5 rounded border border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2 min-w-0">
              <img
                src={attachedImage}
                alt={attachedName || 'Preview'}
                className="w-10 h-10 rounded object-cover border border-gray-200 shrink-0"
              />
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-800 truncate">
                  {attachedName || 'foto-pelanggan.jpg'}
                </div>
                <div className="text-[10px] text-emerald-700">
                  Siap dikirim untuk dianalisis oleh AI Vision / crm_inspect_customer_media
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setAttachedImage(null);
                setAttachedName(null);
              }}
              className="p-1 text-gray-400 hover:text-rose-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <textarea
          rows={2}
          placeholder="Balas sebagai pelanggan (tempel/lampirkan foto, Enter kirim, Shift+Enter baris baru)..."
          value={testMessage}
          onChange={(e) => onTestMessageChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className="w-full px-3 py-2 bg-gray-50/70 focus:bg-white border border-gray-200 rounded-md text-xs resize-none focus:outline-none focus:border-indigo-400"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Lampirkan foto / screenshot pelanggan untuk diuji"
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50 text-[11px] text-gray-700"
            >
              <Paperclip className="w-3.5 h-3.5 text-gray-500" />
              <span>Lampirkan Foto</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="hidden sm:inline text-[10px] text-gray-400">
              Enter kirim • Shift+Enter baris baru
            </span>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={testing}
              leftIcon={<Send className="w-3.5 h-3.5" />}
            >
              Kirim
            </Button>
          </div>
        </div>
      </form>

      {/* Lightbox Modal for Inspecting Customer / AI Images */}
      {previewLightboxUrl && (
        <div
          onClick={() => setPreviewLightboxUrl(null)}
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
        >
          <div className="relative max-w-3xl max-h-[85vh]">
            <button
              type="button"
              onClick={() => setPreviewLightboxUrl(null)}
              className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-white text-gray-900 shadow flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={previewLightboxUrl}
              alt="Preview Media"
              className="max-h-[80vh] max-w-full rounded-lg object-contain bg-white"
            />
          </div>
        </div>
      )}
    </div>
  );
};
