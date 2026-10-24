import { useEffect, useRef, useState } from "react";
import type { AspectRatioType, TimelineInsert } from "../types";
import {
  DEFAULT_REDACTION_COLOR,
  DEFAULT_REDACTION_STRENGTH,
  MAX_REDACTION_RADIUS,
  MAX_REDACTION_STRENGTH,
  MIN_REDACTION_STRENGTH,
  REDACTION_METHODS,
  REDACTION_SHAPES,
  isHexColor,
  isRedactionMethod,
  paintRedaction,
  redactionLabel,
  shapeRect,
  type RedactionMethod,
  type RedactionRect,
} from "../lib/block-out";
import { numberBetween, useRememberedChoice } from "../lib/section-memory";
import Icon from "./icons/Icon";

/**
 * BLOCK OUT studio
 *
 * The controls only decide *how* a block hides something and what shape it
 * starts as. The block itself is then moved and resized by pulling its edges
 * on the video preview — this panel's job is to make the method obvious and
 * the colour reachable, not to replace that direct manipulation.
 *
 * The little monitor here is not an illustration: it paints a fake document
 * through renderTimelineInsert()'s own painter (paintRedaction), so the swatch
 * you pick is exactly what lands in the exported file.
 */

export interface BlockOutChoice {
  method: RedactionMethod;
  color: string;
  strength: number;
  radius: number;
  rect: RedactionRect;
}

export const DEFAULT_BLOCK_OUT_CHOICE: BlockOutChoice = {
  method: "blur",
  color: DEFAULT_REDACTION_COLOR,
  strength: DEFAULT_REDACTION_STRENGTH,
  radius: 0,
  rect: shapeRect("bar"),
};

const isBlockOutChoice = (value: unknown): value is BlockOutChoice => {
  if (!value || typeof value !== "object") return false;
  const choice = value as Record<string, unknown>;
  const rect = choice.rect as Record<string, unknown> | undefined;
  return (
    isRedactionMethod(choice.method) &&
    isHexColor(choice.color) &&
    numberBetween(MIN_REDACTION_STRENGTH, MAX_REDACTION_STRENGTH)(choice.strength) &&
    numberBetween(0, MAX_REDACTION_RADIUS)(choice.radius) &&
    Boolean(rect) &&
    numberBetween(0, 1)(rect?.x) &&
    numberBetween(0, 1)(rect?.y) &&
    numberBetween(0, 1)(rect?.w) &&
    numberBetween(0, 1)(rect?.h)
  );
};

const SWATCHES = [
  "#000000",
  "#FFFFFF",
  "#111827",
  "#374151",
  "#6B7280",
  "#D1D5DB",
  "#6366F1",
  "#0EA5E9",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
];

function previewSize(aspectRatio?: AspectRatioType) {
  switch (aspectRatio) {
    case "9:16":
      return { w: 288, h: 512 };
    case "1:1":
      return { w: 420, h: 420 };
    case "4:3":
      return { w: 520, h: 390 };
    default:
      return { w: 640, h: 360 };
  }
}

/** The fake private document the block is demonstrated on. */
function drawPrivateDocument(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cardW = w * 0.66;
  const cardH = h * 0.52;
  const cardX = (w - cardW) / 2;
  const cardY = (h - cardH) / 2;
  const radius = Math.min(18, cardH * 0.06);

  ctx.save();
  ctx.shadowColor = "rgba(2, 6, 23, 0.45)";
  ctx.shadowBlur = h * 0.03;
  ctx.shadowOffsetY = h * 0.008;
  ctx.fillStyle = "rgba(248, 250, 252, 0.96)";
  ctx.beginPath();
  ctx.moveTo(cardX + radius, cardY);
  ctx.lineTo(cardX + cardW - radius, cardY);
  ctx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + radius);
  ctx.lineTo(cardX + cardW, cardY + cardH - radius);
  ctx.quadraticCurveTo(cardX + cardW, cardY + cardH, cardX + cardW - radius, cardY + cardH);
  ctx.lineTo(cardX + radius, cardY + cardH);
  ctx.quadraticCurveTo(cardX, cardY + cardH, cardX, cardY + cardH - radius);
  ctx.lineTo(cardX, cardY + radius);
  ctx.quadraticCurveTo(cardX, cardY, cardX + radius, cardY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const padX = cardW * 0.09;
  const left = cardX + padX;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#334155";
  ctx.font = `700 ${Math.round(cardH * 0.075)}px system-ui, -apple-system, sans-serif`;
  ctx.fillText("CONFIDENTIAL — CUSTOMER FILE", left, cardY + cardH * 0.16);

  ctx.fillStyle = "#0f172a";
  ctx.font = `600 ${Math.round(cardH * 0.1)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const lines = ["Name: A. Mokoena", "ID: 880412 5567 081", "Account: 4471 0932 8853"];
  lines.forEach((line, index) => {
    ctx.fillText(line, left, cardY + cardH * (0.4 + index * 0.19));
  });

  ctx.fillStyle = "#64748b";
  ctx.font = `500 ${Math.round(cardH * 0.06)}px system-ui, -apple-system, sans-serif`;
  ctx.fillText("This is sample footage — your own video sits here.", left, cardY + cardH * 0.94);
  // the right-hand side is deliberately blank: that is where the block starts
}

interface BlockOutStudioProps {
  projectId?: number | null;
  playheadLabel: string;
  aspectRatio?: AspectRatioType;
  /** a real frame from the project, so the sample is the creator's own footage */
  sampleBackgroundImage?: string;
  onCreate: (choice: BlockOutChoice) => void;
}

export default function BlockOutStudio({
  projectId = null,
  playheadLabel,
  aspectRatio,
  sampleBackgroundImage,
  onCreate,
}: BlockOutStudioProps) {
  const [choice, setChoice] = useRememberedChoice<BlockOutChoice>(
    projectId,
    "studio",
    "blockOut",
    DEFAULT_BLOCK_OUT_CHOICE,
    isBlockOutChoice
  );
  const [hexDraft, setHexDraft] = useState(choice.color);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setHexDraft(choice.color);
  }, [choice.color]);

  const { w: previewW, h: previewH } = previewSize(aspectRatio);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== previewW || canvas.height !== previewH) {
      canvas.width = previewW;
      canvas.height = previewH;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    const previewInsert: TimelineInsert = {
      id: "block-out-preview",
      category: "block_out",
      type: "block_blur",
      title: redactionLabel(choice.method, choice.color),
      startTime: 0,
      duration: 10,
      position: { x: 0.5, y: 0.5 },
      size: 1,
      opacity: 1,
      visualOptions: {
        redactionMethod: choice.method,
        redactionColor: choice.color,
        redactionStrength: choice.strength,
        redactionRadius: choice.radius,
        redactionRect: choice.rect,
      },
    };

    const draw = (background: HTMLImageElement | null) => {
      if (cancelled) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, previewW, previewH);

      if (background && background.naturalWidth > 0) {
        const scale = Math.max(previewW / background.naturalWidth, previewH / background.naturalHeight);
        const dw = background.naturalWidth * scale;
        const dh = background.naturalHeight * scale;
        ctx.drawImage(background, (previewW - dw) / 2, (previewH - dh) / 2, dw, dh);
        ctx.fillStyle = "rgba(2, 6, 23, 0.35)";
        ctx.fillRect(0, 0, previewW, previewH);
      } else {
        const stage = ctx.createLinearGradient(0, 0, previewW * 0.5, previewH);
        stage.addColorStop(0, "#334155");
        stage.addColorStop(0.55, "#1e293b");
        stage.addColorStop(1, "#0b1120");
        ctx.fillStyle = stage;
        ctx.fillRect(0, 0, previewW, previewH);
      }

      drawPrivateDocument(ctx, previewW, previewH);
      // The production painter, on the production geometry.
      paintRedaction(ctx, previewInsert, previewW, previewH);

      // A hairline so the block's edges are legible on dark footage.
      const frameX = choice.rect.x * previewW;
      const frameY = choice.rect.y * previewH;
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
      ctx.lineWidth = 1;
      ctx.strokeRect(frameX + 0.5, frameY + 0.5, choice.rect.w * previewW - 1, choice.rect.h * previewH - 1);
      ctx.restore();
    };

    draw(null);
    if (sampleBackgroundImage) {
      const image = new Image();
      if (!sampleBackgroundImage.startsWith("data:")) image.crossOrigin = "anonymous";
      image.onload = () => draw(image);
      image.onerror = () => draw(null);
      image.src = sampleBackgroundImage;
    }

    return () => {
      cancelled = true;
    };
  }, [choice, previewW, previewH, sampleBackgroundImage]);

  const update = (patch: Partial<BlockOutChoice>) => setChoice((previous) => ({ ...previous, ...patch }));
  const isSolid = choice.method === "solid";

  const commitHex = (value: string) => {
    setHexDraft(value);
    const normalized = value.trim().startsWith("#") ? value.trim() : `#${value.trim()}`;
    if (isHexColor(normalized)) update({ color: normalized.toUpperCase() });
  };

  return (
    <div className="max-w-5xl 2xl:max-w-6xl mx-auto space-y-4">
      {/* ---------------- Banner ---------------- */}
      <div className="bg-gradient-to-r from-slate-900 via-gray-900 to-indigo-950/80 border border-indigo-500/40 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <span className="text-2xl p-2 bg-slate-800/80 border border-indigo-500/40 rounded-lg text-indigo-200" aria-hidden="true">
            <Icon glyph="🕶️" />
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-indigo-100">Block Out — hide words and sections</h3>
              <span className="text-[10px] bg-indigo-950 border border-indigo-600/50 text-indigo-200 px-2 py-0.5 rounded-full font-mono font-semibold">
                Privacy
              </span>
            </div>
            <p className="text-xs text-gray-300 mt-0.5">
              Add a block, then drag it on the video preview to place it and pull any edge or corner to resize it.
              Everything under the block is gone from the finished file.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onCreate(choice)}
          className="shrink-0 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm flex items-center gap-1.5"
          title="Add this block at the playhead"
        >
          <Icon glyph="➕" />
          <span>Add block at {playheadLabel}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
        {/* ---------------- Live sample ---------------- */}
        <div className="bg-gray-900/70 border border-hairline rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-200 flex items-center gap-1.5">
              <Icon glyph="👁" /> What the block does
            </span>
            <span className="text-[10px] text-gray-500">same painter as the export</span>
          </div>
          <div className="rounded-lg overflow-hidden border border-hairline bg-black flex items-center justify-center">
            <canvas ref={canvasRef} className="block w-full h-auto max-h-[320px] object-contain" />
          </div>
          <p className="text-[11px] text-gray-400 leading-relaxed">
            <span className="text-gray-200 font-semibold">Move &amp; resize on the preview:</span> the block appears on the
            video preview with eight grips. Drag inside it to move it; pull a corner to resize both sides, or an edge
            to grow it one way.
          </p>
        </div>

        {/* ---------------- Method & look ---------------- */}
        <div className="space-y-3">
          <div className="bg-gray-900/70 border border-hairline rounded-xl p-3 space-y-2">
            <span className="text-[11px] font-semibold text-gray-200">Method</span>
            <div className="grid grid-cols-3 gap-2">
              {REDACTION_METHODS.map((method) => {
                const active = choice.method === method.id;
                return (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => update({ method: method.id })}
                    title={method.hint}
                    className={`px-2 py-2 rounded-lg border text-[11px] font-semibold flex flex-col items-center gap-1 transition-colors ${
                      active
                        ? "bg-indigo-600 border-indigo-400 text-white shadow-sm"
                        : "bg-gray-800/70 border-hairline text-gray-300 hover:bg-gray-700/70 hover:text-white"
                    }`}
                  >
                    <span className="text-base leading-none">
                      <Icon glyph={method.icon} />
                    </span>
                    <span>{method.name}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-400 leading-relaxed">
              {REDACTION_METHODS.find((method) => method.id === choice.method)?.hint}
            </p>
          </div>

          {isSolid ? (
            <div className="bg-gray-900/70 border border-hairline rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-200">Colour</span>
                <span className="font-mono text-[10px] text-indigo-300">{choice.color.toUpperCase()}</span>
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => update({ color: swatch })}
                    title={swatch}
                    aria-label={`Use ${swatch}`}
                    className={`h-7 rounded-md border transition-transform hover:scale-105 ${
                      choice.color.toLowerCase() === swatch.toLowerCase()
                        ? "border-indigo-400 ring-2 ring-indigo-500/40"
                        : "border-white/15"
                    }`}
                    style={{ backgroundColor: swatch }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={choice.color}
                  onChange={(event) => update({ color: event.target.value.toUpperCase() })}
                  className="h-8 w-10 rounded border border-hairline bg-gray-800 p-0.5 cursor-pointer"
                  title="Pick any colour"
                  aria-label="Pick any colour"
                />
                <input
                  type="text"
                  value={hexDraft}
                  onChange={(event) => commitHex(event.target.value)}
                  placeholder="#000000"
                  className="flex-1 bg-gray-800 border border-hairline rounded-lg px-2 py-1.5 text-xs font-mono text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  aria-label="Hex colour"
                />
              </div>
            </div>
          ) : (
            <div className="bg-gray-900/70 border border-hairline rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-gray-300">
                <span className="font-semibold text-gray-200">
                  {choice.method === "blur" ? "Blur strength" : "Pixel size"}
                </span>
                <span className="font-mono text-indigo-300">{choice.strength.toFixed(2)}×</span>
              </div>
              <input
                type="range"
                min={MIN_REDACTION_STRENGTH}
                max={MAX_REDACTION_STRENGTH}
                step={0.05}
                value={choice.strength}
                onChange={(event) => update({ strength: parseFloat(event.target.value) })}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-500">
                <span>Subtle</span>
                <span>Unreadable</span>
                <span>Gone</span>
              </div>
            </div>
          )}

          <div className="bg-gray-900/70 border border-hairline rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-gray-300">
              <span className="font-semibold text-gray-200">Corner rounding</span>
              <span className="font-mono text-indigo-300">{Math.round(choice.radius * 200)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={MAX_REDACTION_RADIUS}
              step={0.02}
              value={choice.radius}
              onChange={(event) => update({ radius: parseFloat(event.target.value) })}
              className="w-full accent-indigo-500 cursor-pointer"
            />
          </div>

          <div className="bg-gray-900/70 border border-hairline rounded-xl p-3 space-y-2">
            <span className="text-[11px] font-semibold text-gray-200">Starting shape</span>
            <div className="grid grid-cols-2 gap-2">
              {REDACTION_SHAPES.map((shape) => {
                const active =
                  Math.abs(choice.rect.w - shape.rect.w) < 0.0001 &&
                  Math.abs(choice.rect.h - shape.rect.h) < 0.0001 &&
                  Math.abs(choice.rect.x - shape.rect.x) < 0.0001 &&
                  Math.abs(choice.rect.y - shape.rect.y) < 0.0001;
                return (
                  <button
                    key={shape.id}
                    type="button"
                    onClick={() => update({ rect: shapeRect(shape.id) })}
                    className={`px-2 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${
                      active
                        ? "bg-indigo-950 border-indigo-500 text-indigo-100"
                        : "bg-gray-800/70 border-hairline text-gray-300 hover:bg-gray-700/70"
                    }`}
                  >
                    <Icon glyph={shape.icon} />
                    <span>{shape.name}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-500">
              Only a starting point — pull the block on the preview to make it fit the words exactly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
