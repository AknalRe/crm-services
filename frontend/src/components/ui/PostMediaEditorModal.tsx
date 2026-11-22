import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Type,
  Brush,
  Move,
  Upload,
  Undo2,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ZoomIn,
  Check,
  RotateCcw,
  Image as ImageIcon,
} from 'lucide-react';
import api from '../../services/api';
import { resolveCrmMediaUrl } from './MediaLibraryPickerModal';
import { useToast } from './ToastProvider';

export type CanvasAspectPreset = '1:1' | '4:5' | '1.91:1' | '9:16';

interface AspectPresetMeta {
  id: CanvasAspectPreset;
  label: string;
  desc: string;
  width: number;
  height: number;
}

export const CANVAS_ASPECT_PRESETS: AspectPresetMeta[] = [
  { id: '4:5', label: '4:5', desc: 'IG Feed Potret', width: 1080, height: 1350 },
  { id: '1:1', label: '1:1', desc: 'Feed Persegi', width: 1080, height: 1080 },
  { id: '1.91:1', label: '1.91:1', desc: 'Feed Lanskap', width: 1080, height: 566 },
  { id: '9:16', label: '9:16', desc: 'IG / WA Story', width: 1080, height: 1920 },
];

type ImageFitMode = 'fit-blur' | 'cover' | 'contain';
type TextBgMode = 'none' | 'dark' | 'light' | 'accent';
type TextFontKey = 'sans-bold' | 'sans' | 'serif' | 'mono';

interface TextLayer {
  id: string;
  text: string;
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  fontSize: number; // in 1080px canvas coordinates
  font: TextFontKey;
  color: string;
  bgMode: TextBgMode;
  bgColor: string;
  align: 'left' | 'center' | 'right';
  rotation: number; // degrees
}

interface DrawStroke {
  color: string;
  size: number; // in 1080px canvas coordinates
  points: Array<{ x: number; y: number }>; // normalized 0..1
}

const COLOR_SWATCHES = [
  '#ffffff',
  '#111827',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#0ea5e9',
  '#4f46e5',
  '#a855f7',
  '#ec4899',
];

const BG_SWATCHES = [
  '#111827',
  '#1e293b',
  '#0f766e',
  '#1d4ed8',
  '#4f46e5',
  '#be123c',
  '#b45309',
  '#ffffff',
];

function getCanvasFont(font: TextFontKey, size: number): string {
  switch (font) {
    case 'sans-bold':
      return `700 ${size}px Inter, system-ui, -apple-system, sans-serif`;
    case 'serif':
      return `600 ${size}px Georgia, Cambria, serif`;
    case 'mono':
      return `600 ${size}px "JetBrains Mono", Consolas, monospace`;
    default:
      return `500 ${size}px Inter, system-ui, -apple-system, sans-serif`;
  }
}

export interface PostMediaEditorModalProps {
  open: boolean;
  initialImageUrl?: string;
  defaultPreset?: CanvasAspectPreset;
  onClose: () => void;
  onApply: (uploadedUrl: string, preset: CanvasAspectPreset) => void;
}

export const PostMediaEditorModal: React.FC<PostMediaEditorModalProps> = ({
  open,
  initialImageUrl,
  defaultPreset = '4:5',
  onClose,
  onApply,
}) => {
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgFileInputRef = useRef<HTMLInputElement | null>(null);

  const [preset, setPreset] = useState<CanvasAspectPreset>(defaultPreset);
  const [toolMode, setToolMode] = useState<'select' | 'draw'>('select');

  // Background state
  const [bgImageSrc, setBgImageSrc] = useState<string>('');
  const [bgImageEl, setBgImageEl] = useState<HTMLImageElement | null>(null);
  const [bgColor, setBgColor] = useState<string>('#111827');
  const [fitMode, setFitMode] = useState<ImageFitMode>('fit-blur');
  const [imgZoom, setImgZoom] = useState<number>(1);
  const [imgOffset, setImgOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Text layers
  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);

  // Brush / Drawing state
  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  const [brushColor, setBrushColor] = useState<string>('#ffffff');
  const [brushSize, setBrushSize] = useState<number>(14);

  // Dragging / Drawing refs
  const dragStateRef = useRef<
    | { type: 'none' }
    | { type: 'text'; id: string; startX: number; startY: number; origX: number; origY: number }
    | { type: 'bg'; startX: number; startY: number; origX: number; origY: number }
    | { type: 'draw'; strokeIndex: number }
  >({ type: 'none' });

  const [saving, setSaving] = useState(false);

  const presetMeta =
    CANVAS_ASPECT_PRESETS.find((p) => p.id === preset) || CANVAS_ASPECT_PRESETS[0];

  // Reset when modal opens
  useEffect(() => {
    if (!open) return;
    setPreset(defaultPreset);
    setToolMode('select');
    setImgZoom(1);
    setImgOffset({ x: 0, y: 0 });
    setFitMode('fit-blur');
    setTextLayers([]);
    setSelectedTextId(null);
    setStrokes([]);
    if (initialImageUrl && initialImageUrl.trim()) {
      setBgImageSrc(resolveCrmMediaUrl(initialImageUrl.trim()));
    } else {
      setBgImageSrc('');
      setBgImageEl(null);
    }
  }, [open, defaultPreset, initialImageUrl]);

  // Load background image element
  useEffect(() => {
    if (!bgImageSrc) {
      setBgImageEl(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!cancelled) setBgImageEl(img);
    };
    img.onerror = () => {
      if (!cancelled) {
        setBgImageEl(null);
        toast.error('Gambar latar gagal dimuat ke kanvas (CORS atau URL tidak valid)');
      }
    };
    img.src = bgImageSrc;
    return () => {
      cancelled = true;
    };
  }, [bgImageSrc, toast]);

  const drawComposition = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, showSelection: boolean) => {
      ctx.save();
      ctx.clearRect(0, 0, width, height);

      // 1. Solid background color
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);

      // 2. Background image
      if (bgImageEl && bgImageEl.naturalWidth > 0 && bgImageEl.naturalHeight > 0) {
        const iw = bgImageEl.naturalWidth;
        const ih = bgImageEl.naturalHeight;

        if (fitMode === 'fit-blur') {
          // Blurred full-bleed backdrop
          ctx.save();
          const coverScale = Math.max(width / iw, height / ih) * 1.08;
          const bw = iw * coverScale;
          const bh = ih * coverScale;
          ctx.filter = 'blur(32px) brightness(0.68)';
          ctx.drawImage(bgImageEl, (width - bw) / 2, (height - bh) / 2, bw, bh);
          ctx.restore();
        }

        const baseScale =
          fitMode === 'cover'
            ? Math.max(width / iw, height / ih)
            : Math.min(width / iw, height / ih);
        const finalScale = baseScale * imgZoom;
        const dw = iw * finalScale;
        const dh = ih * finalScale;
        const dx = (width - dw) / 2 + imgOffset.x * width;
        const dy = (height - dh) / 2 + imgOffset.y * height;
        ctx.drawImage(bgImageEl, dx, dy, dw, dh);
      }

      // 3. Freehand strokes
      for (const stroke of strokes) {
        if (stroke.points.length === 0) continue;
        ctx.save();
        ctx.strokeStyle = stroke.color;
        ctx.fillStyle = stroke.color;
        ctx.lineWidth = (stroke.size / 1080) * width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (stroke.points.length === 1) {
          const p = stroke.points[0];
          ctx.beginPath();
          ctx.arc(p.x * width, p.y * height, ctx.lineWidth / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(stroke.points[0].x * width, stroke.points[0].y * height);
          for (let i = 1; i < stroke.points.length; i += 1) {
            const prev = stroke.points[i - 1];
            const curr = stroke.points[i];
            const mx = ((prev.x + curr.x) / 2) * width;
            const my = ((prev.y + curr.y) / 2) * height;
            ctx.quadraticCurveTo(prev.x * width, prev.y * height, mx, my);
          }
          const last = stroke.points[stroke.points.length - 1];
          ctx.lineTo(last.x * width, last.y * height);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 4. Text layers
      for (const layer of textLayers) {
        const lines = (layer.text || 'Teks').split('\n');
        const pxSize = Math.round((layer.fontSize / 1080) * width);
        const lineHeight = pxSize * 1.24;
        ctx.save();
        ctx.font = getCanvasFont(layer.font, pxSize);
        ctx.textAlign = layer.align;
        ctx.textBaseline = 'middle';

        let maxLineW = 0;
        for (const line of lines) {
          const m = ctx.measureText(line || ' ');
          if (m.width > maxLineW) maxLineW = m.width;
        }
        const totalH = lines.length * lineHeight;
        const padX = pxSize * 0.48;
        const padY = pxSize * 0.28;
        const boxW = maxLineW + padX * 2;
        const boxH = totalH + padY * 2;

        const cx = layer.x * width;
        const cy = layer.y * height;
        ctx.translate(cx, cy);
        if (layer.rotation) {
          ctx.rotate((layer.rotation * Math.PI) / 180);
        }

        // Background pill
        if (layer.bgMode !== 'none') {
          ctx.save();
          if (layer.bgMode === 'dark') {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
          } else if (layer.bgMode === 'light') {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          } else {
            ctx.fillStyle = layer.bgColor || '#4f46e5';
          }
          const rx = -boxW / 2;
          const ry = -boxH / 2;
          const r = Math.min(20 * (width / 1080), boxH / 2);
          ctx.beginPath();
          ctx.moveTo(rx + r, ry);
          ctx.arcTo(rx + boxW, ry, rx + boxW, ry + boxH, r);
          ctx.arcTo(rx + boxW, ry + boxH, rx, ry + boxH, r);
          ctx.arcTo(rx, ry + boxH, rx, ry, r);
          ctx.arcTo(rx, ry, rx + boxW, ry, r);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        // Text lines
        ctx.fillStyle = layer.color;
        if (layer.bgMode === 'none') {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
          ctx.shadowBlur = Math.max(4, pxSize * 0.16);
          ctx.shadowOffsetY = Math.max(1, pxSize * 0.05);
        }
        const startY = -totalH / 2 + lineHeight / 2;
        const textX =
          layer.align === 'left'
            ? -maxLineW / 2
            : layer.align === 'right'
            ? maxLineW / 2
            : 0;
        lines.forEach((line, idx) => {
          ctx.fillText(line, textX, startY + idx * lineHeight);
        });

        // Selection dashed border (preview only)
        if (showSelection && layer.id === selectedTextId) {
          ctx.save();
          ctx.shadowColor = 'transparent';
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = Math.max(2, (3 / 1080) * width);
          ctx.setLineDash([10 * (width / 1080), 6 * (width / 1080)]);
          ctx.strokeRect(-boxW / 2 - 4, -boxH / 2 - 4, boxW + 8, boxH + 8);
          ctx.restore();
        }

        ctx.restore();
      }

      ctx.restore();
    },
    [bgColor, bgImageEl, fitMode, imgZoom, imgOffset, strokes, textLayers, selectedTextId]
  );

  // Redraw preview canvas whenever state changes
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawComposition(ctx, canvas.width, canvas.height, true);
  }, [open, presetMeta, drawComposition]);

  const getNormalizedPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0.5, y: 0.5 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const hitTestTextLayer = (nx: number, ny: number): TextLayer | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Check top-most first
    for (let i = textLayers.length - 1; i >= 0; i -= 1) {
      const layer = textLayers[i];
      const lines = (layer.text || 'Teks').split('\n');
      const pxSize = Math.round((layer.fontSize / 1080) * canvas.width);
      ctx.font = getCanvasFont(layer.font, pxSize);
      let maxW = 0;
      for (const line of lines) {
        const w = ctx.measureText(line || ' ').width;
        if (w > maxW) maxW = w;
      }
      const boxW = (maxW + pxSize) / canvas.width;
      const boxH = (lines.length * pxSize * 1.24 + pxSize * 0.6) / canvas.height;
      if (
        Math.abs(nx - layer.x) <= Math.max(boxW / 2, 0.08) &&
        Math.abs(ny - layer.y) <= Math.max(boxH / 2, 0.05)
      ) {
        return layer;
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getNormalizedPoint(e);

    if (toolMode === 'draw') {
      const newStroke: DrawStroke = {
        color: brushColor,
        size: brushSize,
        points: [pt],
      };
      setStrokes((prev) => {
        const next = [...prev, newStroke];
        dragStateRef.current = { type: 'draw', strokeIndex: next.length - 1 };
        return next;
      });
      return;
    }

    const hit = hitTestTextLayer(pt.x, pt.y);
    if (hit) {
      setSelectedTextId(hit.id);
      dragStateRef.current = {
        type: 'text',
        id: hit.id,
        startX: pt.x,
        startY: pt.y,
        origX: hit.x,
        origY: hit.y,
      };
    } else {
      setSelectedTextId(null);
      if (bgImageEl) {
        dragStateRef.current = {
          type: 'bg',
          startX: pt.x,
          startY: pt.y,
          origX: imgOffset.x,
          origY: imgOffset.y,
        };
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragStateRef.current;
    if (drag.type === 'none') return;
    const pt = getNormalizedPoint(e);

    if (drag.type === 'draw') {
      setStrokes((prev) =>
        prev.map((st, idx) =>
          idx === drag.strokeIndex ? { ...st, points: [...st.points, pt] } : st
        )
      );
      return;
    }

    if (drag.type === 'text') {
      let nextX = Math.max(0.05, Math.min(0.95, drag.origX + (pt.x - drag.startX)));
      let nextY = Math.max(0.05, Math.min(0.95, drag.origY + (pt.y - drag.startY)));
      // Subtle center snap
      if (Math.abs(nextX - 0.5) < 0.015) nextX = 0.5;
      if (Math.abs(nextY - 0.5) < 0.015) nextY = 0.5;
      setTextLayers((prev) =>
        prev.map((layer) =>
          layer.id === drag.id ? { ...layer, x: nextX, y: nextY } : layer
        )
      );
      return;
    }

    if (drag.type === 'bg') {
      setImgOffset({
        x: Math.max(-0.6, Math.min(0.6, drag.origX + (pt.x - drag.startX))),
        y: Math.max(-0.6, Math.min(0.6, drag.origY + (pt.y - drag.startY))),
      });
    }
  };

  const handlePointerUp = () => {
    dragStateRef.current = { type: 'none' };
  };

  const handleAddText = () => {
    const newId = `txt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newLayer: TextLayer = {
      id: newId,
      text: 'Tulis teks di sini',
      x: 0.5,
      y: Math.min(0.8, 0.35 + textLayers.length * 0.12),
      fontSize: 54,
      font: 'sans-bold',
      color: '#ffffff',
      bgMode: 'dark',
      bgColor: '#4f46e5',
      align: 'center',
      rotation: 0,
    };
    setTextLayers((prev) => [...prev, newLayer]);
    setSelectedTextId(newId);
    setToolMode('select');
  };

  const updateSelectedText = (patch: Partial<TextLayer>) => {
    if (!selectedTextId) return;
    setTextLayers((prev) =>
      prev.map((layer) => (layer.id === selectedTextId ? { ...layer, ...patch } : layer))
    );
  };

  const handleUploadLocalBg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setBgImageSrc(String(reader.result || ''));
      setImgZoom(1);
      setImgOffset({ x: 0, y: 0 });
    };
    reader.readAsDataURL(file);
  };

  const handleExportAndSave = async () => {
    setSaving(true);
    try {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = presetMeta.width;
      exportCanvas.height = presetMeta.height;
      const ctx = exportCanvas.getContext('2d');
      if (!ctx) throw new Error('Canvas tidak tersedia di browser');

      drawComposition(ctx, exportCanvas.width, exportCanvas.height, false);
      const dataUrl = exportCanvas.toDataURL('image/jpeg', 0.92);
      const safePreset = preset.replace(/[^0-9]/g, 'x');
      const uploaded = await api.uploadMedia({
        fileName: `post-studio-${safePreset}-${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
        base64: dataUrl,
      });
      toast.success(`Visual ${preset} (${presetMeta.width}×${presetMeta.height}) siap diposting`);
      onApply(uploaded.url, preset);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Gagal mengekspor desain visual');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const selectedLayer = textLayers.find((l) => l.id === selectedTextId) || null;
  const previewScale = presetMeta.height > presetMeta.width ? 540 / presetMeta.height : 540 / presetMeta.width;
  const previewW = Math.round(presetMeta.width * previewScale);
  const previewH = Math.round(presetMeta.height * previewScale);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-xl border border-slate-200 w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Studio Desain Postingan &amp; Story
            </h3>
            <p className="text-[11px] text-slate-500">
              Atur rasio aman Instagram/WhatsApp, geser posisi teks, dan gambar langsung di kanvas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={handleExportAndSave}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {saving ? 'Menyimpan...' : 'Simpan ke Postingan'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-500 hover:bg-slate-200"
              aria-label="Tutup studio"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Left: Interactive Canvas Workspace */}
          <div className="lg:col-span-7 bg-slate-900 flex flex-col items-center justify-between p-3 sm:p-4 overflow-auto">
            {/* Top Mode Toolbar */}
            <div className="w-full flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="inline-flex items-center bg-slate-800 rounded-lg p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setToolMode('select')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${
                    toolMode === 'select'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Move className="w-3.5 h-3.5" />
                  Pilih &amp; Geser
                </button>
                <button
                  type="button"
                  onClick={() => setToolMode('draw')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${
                    toolMode === 'draw'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Brush className="w-3.5 h-3.5" />
                  Kuas / Gambar
                </button>
                <button
                  type="button"
                  onClick={handleAddText}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-emerald-300 hover:bg-slate-700"
                >
                  <Type className="w-3.5 h-3.5" />
                  + Teks
                </button>
              </div>

              <span className="text-[11px] font-mono text-slate-400">
                {presetMeta.width}×{presetMeta.height} px ({preset})
              </span>
            </div>

            {/* Canvas Container */}
            <div className="flex-1 flex items-center justify-center w-full min-h-[280px]">
              <canvas
                ref={canvasRef}
                width={previewW}
                height={previewH}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                style={{
                  maxWidth: '100%',
                  maxHeight: '58vh',
                  aspectRatio: `${presetMeta.width} / ${presetMeta.height}`,
                  touchAction: 'none',
                }}
                className={`rounded-lg shadow-xl border border-slate-700 bg-slate-950 ${
                  toolMode === 'draw' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
                }`}
              />
            </div>

            <p className="mt-2 text-[11px] text-slate-400 text-center">
              {toolMode === 'draw'
                ? 'Tahan dan geser langsung di kanvas untuk menggambar bebas.'
                : 'Klik & geser teks untuk memindahkan posisi, atau geser gambar latar untuk mengatur framing.'}
            </p>
          </div>

          {/* Right: Inspector Controls */}
          <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-l border-slate-200 overflow-y-auto p-4 space-y-4 bg-white">
            {/* Aspect Ratio Presets */}
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                Rasio Kanvas (Aman Instagram &amp; WhatsApp)
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {CANVAS_ASPECT_PRESETS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPreset(item.id)}
                    className={`px-2.5 py-2 rounded-md border text-left transition-colors ${
                      preset === item.id
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold font-mono">{item.label}</span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {item.width}×{item.height}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Background Controls */}
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                  Latar Belakang &amp; Foto
                </span>
                <div className="flex items-center gap-2">
                  <input
                    ref={bgFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleUploadLocalBg}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => bgFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    <Upload className="w-3 h-3" />
                    {bgImageEl ? 'Ganti Foto' : 'Upload Foto'}
                  </button>
                  {bgImageEl && (
                    <button
                      type="button"
                      onClick={() => {
                        setBgImageSrc('');
                        setBgImageEl(null);
                      }}
                      className="text-[11px] font-medium text-rose-600 hover:text-rose-700"
                    >
                      Hapus Foto
                    </button>
                  )}
                </div>
              </div>

              {bgImageEl && (
                <>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        { id: 'fit-blur', label: 'Pas + Blur' },
                        { id: 'cover', label: 'Isi Penuh' },
                        { id: 'contain', label: 'Pas Polos' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setFitMode(m.id)}
                        className={`py-1 px-2 rounded border text-[11px] font-medium ${
                          fitMode === m.id
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <ZoomIn className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <input
                      type="range"
                      min={0.5}
                      max={2.5}
                      step={0.05}
                      value={imgZoom}
                      onChange={(e) => setImgZoom(Number(e.target.value))}
                      className="flex-1 accent-indigo-600"
                    />
                    <span className="text-[11px] font-mono text-slate-500 w-10 text-right">
                      {Math.round(imgZoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setImgZoom(1);
                        setImgOffset({ x: 0, y: 0 });
                      }}
                      className="p-1 rounded border border-slate-200 bg-white text-slate-500 hover:text-slate-700"
                      title="Reset zoom & posisi"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  </div>
                </>
              )}

              <div>
                <span className="block text-[11px] text-slate-500 mb-1">Warna Latar Kanvas</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {BG_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setBgColor(hex)}
                      style={{ backgroundColor: hex }}
                      className={`w-5 h-5 rounded-full border-2 ${
                        bgColor === hex ? 'border-indigo-600 scale-110' : 'border-slate-300'
                      }`}
                    />
                  ))}
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="w-6 h-5 p-0 border border-slate-300 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Brush Controls */}
            {toolMode === 'draw' && (
              <div className="p-3 rounded-lg bg-slate-50 border border-indigo-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <Brush className="w-3.5 h-3.5 text-indigo-600" />
                    Pengaturan Kuas Gambar
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={strokes.length === 0}
                      onClick={() => setStrokes((prev) => prev.slice(0, -1))}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 bg-white text-[11px] text-slate-700 disabled:opacity-40"
                    >
                      <Undo2 className="w-3 h-3" />
                      Undo
                    </button>
                    <button
                      type="button"
                      disabled={strokes.length === 0}
                      onClick={() => setStrokes([])}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 bg-white text-[11px] text-rose-600 disabled:opacity-40"
                    >
                      <Trash2 className="w-3 h-3" />
                      Hapus
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {COLOR_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setBrushColor(hex)}
                      style={{ backgroundColor: hex }}
                      className={`w-5 h-5 rounded-full border-2 ${
                        brushColor === hex ? 'border-indigo-600 scale-110' : 'border-slate-300'
                      }`}
                    />
                  ))}
                  <input
                    type="color"
                    value={brushColor}
                    onChange={(e) => setBrushColor(e.target.value)}
                    className="w-6 h-5 p-0 border border-slate-300 rounded cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-600">Tebal</span>
                  <input
                    type="range"
                    min={4}
                    max={40}
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="flex-1 accent-indigo-600"
                  />
                  <span className="text-[11px] font-mono text-slate-500 w-8 text-right">
                    {brushSize}px
                  </span>
                </div>
              </div>
            )}

            {/* Text Layer Inspector */}
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-slate-600" />
                  Lapisan Teks ({textLayers.length})
                </span>
                <button
                  type="button"
                  onClick={handleAddText}
                  className="px-2 py-1 rounded bg-indigo-600 text-white text-[11px] font-medium hover:bg-indigo-700"
                >
                  + Tambah Teks
                </button>
              </div>

              {selectedLayer ? (
                <div className="space-y-2.5 pt-1 border-t border-slate-200">
                  <textarea
                    rows={2}
                    value={selectedLayer.text}
                    onChange={(e) => updateSelectedText({ text: e.target.value })}
                    placeholder="Ketik teks yang ingin ditampilkan..."
                    className="w-full p-2 bg-white border border-slate-200 rounded-md text-xs focus:outline-none focus:border-indigo-500"
                  />

                  <div className="grid grid-cols-4 gap-1">
                    {(
                      [
                        { id: 'sans-bold', label: 'Tebal' },
                        { id: 'sans', label: 'Modern' },
                        { id: 'serif', label: 'Serif' },
                        { id: 'mono', label: 'Mono' },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => updateSelectedText({ font: f.id })}
                        className={`py-1 rounded border text-[11px] ${
                          selectedLayer.font === f.id
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-800 font-semibold'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-4 gap-1">
                    {(
                      [
                        { id: 'none', label: 'Polos' },
                        { id: 'dark', label: 'Kotak Gelap' },
                        { id: 'light', label: 'Kotak Putih' },
                        { id: 'accent', label: 'Kotak Biru' },
                      ] as const
                    ).map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => updateSelectedText({ bgMode: b.id })}
                        className={`py-1 px-1 rounded border text-[10px] ${
                          selectedLayer.bgMode === b.id
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-800 font-semibold'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 flex-wrap">
                      {COLOR_SWATCHES.slice(0, 7).map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => updateSelectedText({ color: hex })}
                          style={{ backgroundColor: hex }}
                          className={`w-4 h-4 rounded-full border ${
                            selectedLayer.color === hex
                              ? 'border-indigo-600 scale-125'
                              : 'border-slate-300'
                          }`}
                        />
                      ))}
                      <input
                        type="color"
                        value={selectedLayer.color}
                        onChange={(e) => updateSelectedText({ color: e.target.value })}
                        className="w-5 h-4 p-0 border border-slate-300 rounded cursor-pointer"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      {(
                        [
                          { id: 'left', icon: AlignLeft },
                          { id: 'center', icon: AlignCenter },
                          { id: 'right', icon: AlignRight },
                        ] as const
                      ).map((al) => {
                        const Icon = al.icon;
                        return (
                          <button
                            key={al.id}
                            type="button"
                            onClick={() => updateSelectedText({ align: al.id })}
                            className={`p-1 rounded border ${
                              selectedLayer.align === al.id
                                ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                : 'border-slate-200 bg-white text-slate-500'
                            }`}
                          >
                            <Icon className="w-3 h-3" />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-600 w-12">Ukuran</span>
                    <input
                      type="range"
                      min={24}
                      max={120}
                      value={selectedLayer.fontSize}
                      onChange={(e) => updateSelectedText({ fontSize: Number(e.target.value) })}
                      className="flex-1 accent-indigo-600"
                    />
                    <span className="text-[11px] font-mono text-slate-500 w-8 text-right">
                      {selectedLayer.fontSize}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-600 w-12">Miring</span>
                    <input
                      type="range"
                      min={-45}
                      max={45}
                      value={selectedLayer.rotation}
                      onChange={(e) => updateSelectedText({ rotation: Number(e.target.value) })}
                      className="flex-1 accent-indigo-600"
                    />
                    <span className="text-[11px] font-mono text-slate-500 w-8 text-right">
                      {selectedLayer.rotation}°
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setTextLayers((prev) => prev.filter((l) => l.id !== selectedLayer.id));
                      setSelectedTextId(null);
                    }}
                    className="w-full py-1.5 rounded border border-rose-200 bg-rose-50 text-rose-700 text-xs font-medium hover:bg-rose-100 flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus Lapisan Teks Ini
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">
                  Klik <strong>+ Tambah Teks</strong> atau klik teks di kanvas untuk mengedit warna, font, dan posisinya.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
