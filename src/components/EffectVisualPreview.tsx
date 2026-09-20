import React, { useEffect, useRef } from "react";
import { CatalogItem } from "../lib/video-studio-catalog";
import { getPresetCoords, renderTimelineInsert } from "../lib/render-effects";
import type { TimelineInsert } from "../types";

interface EffectVisualPreviewProps {
  item: CatalogItem;
}

export default function EffectVisualPreview({ item }: EffectVisualPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number>(0);

  // Audio visualisers are drawn by the very same renderer the video preview and
  // the final render use, so the card can never show something the video won't.
  useEffect(() => {
    if (item.category !== "audio_visualizers") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // A throwaway timeline insert mirroring what gets added to the timeline
    // Catalogue cards sit the visualiser a little higher than its timeline
    // preset so the bars, their shadow and the floor glow are all visible.
    const preset = item.defaultPosition || "center";
    const cardY = 0.62;
    const previewInsert = {
      id: `preview-${item.type}`,
      category: item.category,
      type: item.type,
      title: item.name,
      startTime: 0,
      duration: 9999,
      position: { ...getPresetCoords(preset as any), y: cardY },
      presetPosition: undefined,
      size: item.defaultSize || 1,
      opacity: 1,
      audioSource: item.defaultAudioSource || "voice",
      content: {},
      visualOptions: item.defaultVisualOptions ? { ...item.defaultVisualOptions } : undefined,
      audioSettings: {},
    } as unknown as TimelineInsert;

    const startedAt = performance.now();
    let raf = 0;
    let lastPaint = 0;

    const renderLoop = (now: number) => {
      raf = requestAnimationFrame(renderLoop);
      // ~30fps is plenty for a thumbnail and keeps a grid of cards cheap
      if (now - lastPaint < 33) return;
      lastPaint = now;
      const elapsed = (now - startedAt) / 1000;
      const w = canvas.width;
      const h = canvas.height;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      // dark studio stage so the glass plate, bars and their shadow are readable
      const stage = ctx.createLinearGradient(0, 0, 0, h);
      stage.addColorStop(0, "#0b1020");
      stage.addColorStop(0.6, "#131a2e");
      stage.addColorStop(1, "#070a14");
      ctx.fillStyle = stage;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.55);
      ctx.lineTo(w, h * 0.55);
      ctx.stroke();

      // No analyser data here: the rhythm engine drives it, exactly like it does
      // whenever a project has no audio loaded yet.
      renderTimelineInsert(ctx, previewInsert, 0.4 + (elapsed % 12), w, h, 0, null, null);

      raf = raf; // keep the handle for cleanup
    };

    raf = requestAnimationFrame(renderLoop);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [item]);


  // If this is an audio visualizer, return the live animated canvas
  if (item.category === "audio_visualizers") {
    return (
      <div className="w-full h-24 rounded-lg bg-gray-950 border border-gray-800 overflow-hidden relative shadow-inner flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={512}
          height={176}
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-1 right-2 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">
            Live · same engine as render
          </span>
        </div>
      </div>
    );
  }

  // ---------------- CALL TO ACTION PREVIEWS (TRUE TO LIFE ON-VIDEO APPEARANCE) ----------------
  if (item.category === "call_to_action") {
    if (item.type === "subscribe_cta") {
      return (
        <div className="w-full h-24 rounded-lg bg-gradient-to-b from-gray-950 to-gray-900 border border-gray-800 p-2 flex items-center justify-center relative overflow-hidden group">
          {/* Subtle video background grid */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293710_1px,transparent_1px),linear-gradient(to_bottom,#1f293710_1px,transparent_1px)] bg-[size:16px_16px]" />
          
          {/* 3D Subscribe Pill */}
          <div className="relative z-10 flex items-center gap-2 bg-gradient-to-r from-red-600 via-red-500 to-red-600 text-white px-4 py-2 rounded-full shadow-[0_6px_16px_rgba(239,68,68,0.45),inset_0_1px_1px_rgba(255,255,255,0.4)] border border-red-400/40 transform transition-transform group-hover:scale-105">
            <span className="text-xs font-black tracking-wider drop-shadow">SUBSCRIBE</span>
            <div className="w-6 h-6 rounded-full bg-red-700/80 border border-red-300/40 flex items-center justify-center text-xs shadow-inner">
              🔔
            </div>
          </div>
          <div className="absolute bottom-1 right-2 text-[9px] text-gray-400 font-mono">Video Overlay</div>
        </div>
      );
    }

    if (item.type === "follow_cta") {
      return (
        <div className="w-full h-24 rounded-lg bg-gradient-to-b from-gray-950 to-gray-900 border border-gray-800 p-2 flex items-center justify-center relative overflow-hidden group">
          <div className="relative z-10 flex items-center gap-2 bg-gradient-to-r from-sky-600 to-blue-600 text-white px-3.5 py-1.5 rounded-full shadow-[0_4px_14px_rgba(2,132,199,0.4),inset_0_1px_1px_rgba(255,255,255,0.3)] border border-sky-400/40">
            <span className="text-xs">✨</span>
            <span className="text-xs font-bold tracking-wide">FOLLOW FOR MORE</span>
            <span className="w-4 h-4 rounded-full bg-white text-blue-600 font-bold text-[10px] flex items-center justify-center">✓</span>
          </div>
        </div>
      );
    }

    if (item.type === "like_share_cta") {
      return (
        <div className="w-full h-24 rounded-lg bg-gradient-to-b from-gray-950 to-gray-900 border border-gray-800 p-2 flex items-center justify-center relative overflow-hidden group">
          <div className="relative z-10 flex items-center gap-3 bg-indigo-950/80 backdrop-blur-md px-3.5 py-2 rounded-xl border border-indigo-500/40 shadow-lg">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-200">
              <span className="text-sm">👍</span>
              <span>LIKE</span>
            </div>
            <span className="text-gray-500">•</span>
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-200">
              <span className="text-sm">↗️</span>
              <span>SHARE</span>
            </div>
          </div>
        </div>
      );
    }

    if (item.type === "buy_now_cta") {
      return (
        <div className="w-full h-24 rounded-lg bg-gradient-to-b from-gray-950 to-gray-900 border border-gray-800 p-2 flex items-center justify-center relative overflow-hidden group">
          <div className="relative z-10 flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 py-2 rounded-full shadow-[0_5px_15px_rgba(16,185,129,0.35)] border border-emerald-400/30">
            <span>🛍️</span>
            <span className="text-xs font-black tracking-wide">SHOP NOW — 20% OFF</span>
          </div>
        </div>
      );
    }

    // Generic CTA
    return (
      <div className="w-full h-24 rounded-lg bg-gradient-to-b from-gray-950 to-gray-900 border border-gray-800 p-2 flex items-center justify-center relative overflow-hidden group">
        <div className="relative z-10 flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-1.5 rounded-lg shadow-md border border-indigo-400/30">
          <span className="text-sm">{item.icon}</span>
          <span className="text-xs font-bold uppercase tracking-wider">{item.defaultContent?.primaryText || item.name}</span>
        </div>
      </div>
    );
  }

  // ---------------- STICKERS PREVIEWS (3D RENDERED ON-VIDEO VISUALS) ----------------
  if (item.category === "stickers") {
    if (item.type === "trophy") {
      return (
        <div className="w-full h-24 rounded-lg bg-gradient-to-b from-gray-950 to-gray-900 border border-gray-800 p-2 flex items-center justify-center relative overflow-hidden group">
          <div className="relative z-10 flex flex-col items-center">
            <div className="text-3xl filter drop-shadow-[0_4px_10px_rgba(234,179,8,0.5)] transform group-hover:scale-110 group-hover:-rotate-3 transition-transform">
              🏆
            </div>
            <div className="w-10 h-1.5 bg-yellow-500/20 rounded-full filter blur-[1px] mt-1" />
            <span className="text-[10px] font-bold text-amber-300 mt-1 uppercase tracking-wider bg-amber-950/60 px-2 py-0.5 rounded border border-amber-600/30">
              Winner Trophy
            </span>
          </div>
        </div>
      );
    }

    if (item.type === "emoji_fire") {
      return (
        <div className="w-full h-24 rounded-lg bg-gradient-to-b from-gray-950 to-gray-900 border border-gray-800 p-2 flex items-center justify-center relative overflow-hidden group">
          <div className="relative z-10 flex flex-col items-center">
            <div className="text-3xl filter drop-shadow-[0_4px_12px_rgba(249,115,22,0.6)] transform group-hover:scale-110 transition-transform">
              🔥
            </div>
            <span className="text-[10px] font-bold text-orange-300 mt-1 uppercase tracking-wider bg-orange-950/60 px-2 py-0.5 rounded border border-orange-600/30">
              Volumetric Fire
            </span>
          </div>
        </div>
      );
    }

    if (item.type === "heart") {
      return (
        <div className="w-full h-24 rounded-lg bg-gradient-to-b from-gray-950 to-gray-900 border border-gray-800 p-2 flex items-center justify-center relative overflow-hidden group">
          <div className="relative z-10 flex flex-col items-center">
            <div className="text-3xl filter drop-shadow-[0_4px_12px_rgba(244,63,94,0.6)] transform group-hover:scale-110 transition-transform">
              ❤️
            </div>
            <span className="text-[10px] font-bold text-rose-300 mt-1 uppercase tracking-wider bg-rose-950/60 px-2 py-0.5 rounded border border-rose-600/30">
              3D Ruby Heart
            </span>
          </div>
        </div>
      );
    }

    if (item.type === "check") {
      return (
        <div className="w-full h-24 rounded-lg bg-gradient-to-b from-gray-950 to-gray-900 border border-gray-800 p-2 flex items-center justify-center relative overflow-hidden group">
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-sky-600 to-cyan-400 flex items-center justify-center text-white text-xl font-bold shadow-[0_4px_12px_rgba(6,182,212,0.45)] border-2 border-white/80">
              ✓
            </div>
            <span className="text-[10px] font-bold text-cyan-300 mt-1 uppercase tracking-wider bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-600/30">
              Verified Badge
            </span>
          </div>
        </div>
      );
    }

    // Other 3D Stickers
    return (
      <div className="w-full h-24 rounded-lg bg-gradient-to-b from-gray-950 to-gray-900 border border-gray-800 p-2 flex items-center justify-center relative overflow-hidden group">
        <div className="relative z-10 flex flex-col items-center">
          <div className="text-3xl filter drop-shadow-[0_4px_10px_rgba(255,255,255,0.25)] transform group-hover:scale-110 transition-transform">
            {item.icon}
          </div>
          <span className="text-[10px] font-bold text-gray-300 mt-1 uppercase tracking-wider bg-gray-800/80 px-2 py-0.5 rounded border border-gray-700">
            {item.name}
          </span>
        </div>
      </div>
    );
  }

  // ---------------- TEXT CONTENT & LOWER THIRDS (TRUE VIDEO ON-SCREEN CARDS) ----------------
  if (item.category === "content_cards") {
    if (item.type === "person") {
      return (
        <div className="w-full h-24 rounded-lg bg-gray-950 border border-gray-800 p-2.5 flex flex-col justify-end relative overflow-hidden group">
          {/* Broadcaster lower third ribbon */}
          <div className="relative z-10 bg-gradient-to-r from-gray-900/95 via-gray-900/80 to-transparent p-2 rounded-l border-l-4 border-amber-500 shadow-md">
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>Dr. Elizabeth Vance</span>
            </div>
            <div className="text-[10px] text-amber-300/90 font-medium">Lead Astrobiologist, NASA</div>
          </div>
          <div className="absolute top-1.5 right-2 text-[9px] text-gray-500 font-mono">Lower-Third</div>
        </div>
      );
    }

    if (item.type === "scripture") {
      return (
        <div className="w-full h-24 rounded-lg bg-gradient-to-b from-gray-950 to-amber-950/20 border border-amber-700/40 p-2.5 flex flex-col justify-center relative overflow-hidden group">
          <div className="relative z-10 text-center space-y-1">
            <div className="text-[10px] font-bold text-amber-400 tracking-widest uppercase flex items-center justify-center gap-1.5">
              <span>✦</span>
              <span>JOHN 3:16</span>
              <span>✦</span>
            </div>
            <div className="text-[11px] text-gray-200 italic font-serif line-clamp-2 px-2">
              &quot;For God so loved the world, that he gave his only begotten Son...&quot;
            </div>
          </div>
          <div className="absolute top-1.5 right-2 text-[9px] text-amber-500/70 font-mono">Holy Scripture</div>
        </div>
      );
    }

    if (item.type === "quote") {
      return (
        <div className="w-full h-24 rounded-lg bg-gray-950 border border-gray-800 p-2.5 flex flex-col justify-center relative overflow-hidden group">
          <div className="relative z-10 bg-gray-900/70 backdrop-blur-sm p-2 rounded-lg border border-gray-700/50">
            <div className="text-amber-400 text-base leading-none font-serif">&ldquo;</div>
            <div className="text-[10px] text-gray-200 italic line-clamp-1">
              The only limit to our realization of tomorrow is our doubts...
            </div>
            <div className="text-[9px] text-gray-400 font-medium text-right mt-0.5">— Franklin D. Roosevelt</div>
          </div>
        </div>
      );
    }

    if (item.type === "chapter") {
      return (
        <div className="w-full h-24 rounded-lg bg-gray-950 border border-gray-800 p-2.5 flex flex-col justify-center items-center relative overflow-hidden group">
          <div className="relative z-10 text-center space-y-0.5">
            <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">CHAPTER 2</div>
            <div className="text-xs font-black text-white tracking-wide">The Turning Point</div>
            <div className="w-16 h-0.5 bg-indigo-500 mx-auto mt-1" />
          </div>
        </div>
      );
    }

    if (item.type === "fact" || item.type === "key_point") {
      return (
        <div className="w-full h-24 rounded-lg bg-gray-950 border border-gray-800 p-2.5 flex flex-col justify-center relative overflow-hidden group">
          <div className="relative z-10 bg-indigo-950/40 p-2 rounded-lg border border-indigo-700/50">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs">💡</span>
              <span className="text-[9px] font-bold text-indigo-300 uppercase tracking-wider">
                {item.type === "fact" ? "DID YOU KNOW?" : "KEY TAKEAWAY"}
              </span>
            </div>
            <div className="text-[10px] text-gray-200 line-clamp-2 leading-tight">
              {item.defaultContent?.primaryText || "Consistency compounds faster than occasional intensity."}
            </div>
          </div>
        </div>
      );
    }

    // Generic Content Card
    return (
      <div className="w-full h-24 rounded-lg bg-gray-950 border border-gray-800 p-2.5 flex flex-col justify-center relative overflow-hidden group">
        <div className="relative z-10 bg-gray-900/80 p-2 rounded border border-gray-700">
          <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider">{item.name}</div>
          <div className="text-[10px] text-gray-200 mt-0.5 line-clamp-2 leading-tight">
            {item.defaultContent?.primaryText || item.description}
          </div>
        </div>
      </div>
    );
  }

  // ---------------- 2. INTRO PREVIEWS ----------------
  if (item.category === "intro") {
    if (item.type === "intro_cinematic_gold") {
      return (
        <div className="w-full h-24 rounded-lg bg-gradient-to-r from-amber-950 via-gray-950 to-amber-950 border border-amber-600/40 p-2 flex flex-col items-center justify-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.25)_0%,transparent_70%)] animate-pulse" />
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.8)] border border-yellow-200/60 mb-1">
              <span className="text-xs font-black text-gray-950">🏷️</span>
            </div>
            <span className="text-[10px] font-black text-amber-300 tracking-widest uppercase drop-shadow">YOUR BRAND</span>
            <span className="text-[8px] text-amber-200/80 font-serif italic">Presents An Original Story</span>
          </div>
          <div className="absolute top-1 left-2 text-[8px] font-mono text-amber-400/80 bg-amber-950/70 px-1.5 py-0.2 rounded border border-amber-700/40">
            🎬 Intro Video
          </div>
        </div>
      );
    }

    if (item.type === "intro_cyber_glitch") {
      return (
        <div className="w-full h-24 rounded-lg bg-gray-950 border border-cyan-500/40 p-2 flex flex-col items-center justify-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(6,182,212,0.1)_1px,transparent_1px)] bg-[size:100%_4px]" />
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-7 h-7 rounded bg-gray-900 border border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.6)] flex items-center justify-center mb-1">
              <span className="text-xs">⚡</span>
            </div>
            <span className="text-[10px] font-black text-cyan-300 tracking-wider font-mono">CYBERPUNK MEDIA</span>
            <span className="text-[8px] text-pink-400 font-mono">Next-Gen Visuals</span>
          </div>
          <div className="absolute top-1 left-2 text-[8px] font-mono text-cyan-400 bg-cyan-950/70 px-1.5 py-0.2 rounded border border-cyan-700/40">
            🎬 Tech Intro
          </div>
        </div>
      );
    }

    // Generic Intro
    return (
      <div className="w-full h-24 rounded-lg bg-gradient-to-r from-gray-950 via-indigo-950/60 to-gray-950 border border-indigo-500/40 p-2 flex flex-col items-center justify-center relative overflow-hidden group">
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-7 h-7 rounded-lg bg-indigo-600/80 border border-indigo-400 flex items-center justify-center mb-1 shadow-lg">
            <span className="text-xs">🎬</span>
          </div>
          <span className="text-[10px] font-bold text-white tracking-wider">{item.name}</span>
          <span className="text-[8px] text-indigo-300">With Logo Reveal</span>
        </div>
        <div className="absolute top-1 left-2 text-[8px] font-mono text-indigo-400 bg-indigo-950/70 px-1.5 py-0.2 rounded border border-indigo-700/40">
          🎬 Video Intro
        </div>
      </div>
    );
  }

  // ---------------- 3. OUTRO PREVIEWS ----------------
  if (item.category === "outro") {
    if (item.type === "outro_youtube_endscreen") {
      return (
        <div className="w-full h-24 rounded-lg bg-gray-950 border border-red-600/40 p-2 flex items-center justify-between relative overflow-hidden group">
          {/* Watch Next Box 1 */}
          <div className="w-16 h-14 bg-gray-900 border border-gray-700 rounded flex flex-col items-center justify-center text-[8px] text-gray-400 font-mono">
            <span>📺</span>
            <span>NEXT VIDEO</span>
          </div>

          {/* Center Subscribe Circle */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-full bg-red-600 border-2 border-white shadow-[0_0_12px_rgba(239,68,68,0.7)] flex items-center justify-center text-xs text-white">
              🏷️
            </div>
            <span className="text-[8px] font-black text-red-400 mt-1">SUBSCRIBE</span>
          </div>

          {/* Watch Next Box 2 */}
          <div className="w-16 h-14 bg-gray-900 border border-gray-700 rounded flex flex-col items-center justify-center text-[8px] text-gray-400 font-mono">
            <span>▶️</span>
            <span>PLAYLIST</span>
          </div>
          <div className="absolute top-1 left-2 text-[8px] font-mono text-red-400 bg-red-950/70 px-1.5 py-0.2 rounded border border-red-700/40">
            🏁 YouTube End-Slate
          </div>
        </div>
      );
    }

    if (item.type === "outro_social_showcase") {
      return (
        <div className="w-full h-24 rounded-lg bg-gray-950 border border-sky-500/40 p-2 flex flex-col items-center justify-center relative overflow-hidden group">
          <span className="text-[10px] font-bold text-sky-300 uppercase tracking-wider mb-1.5">CONNECT WITH US</span>
          <div className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full bg-red-900/60 border border-red-500/50 flex items-center justify-center text-[10px]">YT</span>
            <span className="w-6 h-6 rounded-full bg-pink-900/60 border border-pink-500/50 flex items-center justify-center text-[10px]">IG</span>
            <span className="w-6 h-6 rounded-full bg-gray-800 border border-gray-600 flex items-center justify-center text-[10px]">X</span>
            <span className="w-6 h-6 rounded-full bg-cyan-900/60 border border-cyan-500/50 flex items-center justify-center text-[10px]">TT</span>
          </div>
          <span className="text-[8px] text-gray-400 mt-1 font-mono">@sceneringstudio</span>
        </div>
      );
    }

    // Generic Outro
    return (
      <div className="w-full h-24 rounded-lg bg-gray-950 border border-indigo-500/40 p-2 flex flex-col items-center justify-center relative overflow-hidden group">
        <div className="relative z-10 flex flex-col items-center text-center">
          <span className="text-sm mb-0.5">🏁</span>
          <span className="text-[10px] font-bold text-white">{item.name}</span>
          <span className="text-[8px] text-gray-400 mt-0.5">End-Screen with Handles & Logo</span>
        </div>
      </div>
    );
  }

  // ---------------- 6. TEXT TEMPLATES PREVIEWS ----------------
  if (item.category === "text_templates") {
    if (item.type === "template_scripture") {
      return (
        <div className="w-full h-24 rounded-lg bg-gradient-to-r from-amber-950/80 via-gray-950 to-amber-950/80 border border-amber-500/60 p-2.5 flex flex-col justify-between relative overflow-hidden group shadow-md">
          <div className="flex items-center justify-between border-b border-amber-600/30 pb-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-amber-300">📖</span>
              <span className="text-[9px] font-black text-amber-300 tracking-wider">JOHN 3:16</span>
            </div>
            <span className="text-[8px] font-mono text-amber-200/70 bg-amber-950 px-1 rounded border border-amber-600/30">KJV</span>
          </div>
          <div className="text-[9px] text-amber-100 font-serif italic line-clamp-2 leading-relaxed my-auto">
            &ldquo;For God so loved the world, that he gave his only begotten Son...&rdquo;
          </div>
          <div className="text-[8px] text-amber-400/80 text-right font-medium">Holy Scripture Verse Card</div>
        </div>
      );
    }

    if (item.type === "template_quote") {
      return (
        <div className="w-full h-24 rounded-lg bg-gray-950 border border-sky-500/50 p-2.5 flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-center gap-1 text-sky-400 text-xs font-serif leading-none">
            <span>❝</span>
            <span className="text-[9px] font-sans font-bold text-sky-300 uppercase tracking-wider">INSPIRATION</span>
          </div>
          <div className="text-[9px] text-gray-200 italic line-clamp-2 my-auto font-serif">
            &ldquo;The only limit to our realization of tomorrow is our doubts of today.&rdquo;
          </div>
          <div className="text-[8px] text-sky-400 font-medium text-right">— Franklin D. Roosevelt</div>
        </div>
      );
    }

    if (item.type === "template_lower_third") {
      return (
        <div className="w-full h-24 rounded-lg bg-gray-950 border border-gray-800 p-2 flex items-end relative overflow-hidden group">
          <div className="w-full bg-gradient-to-r from-indigo-900/90 via-indigo-950/80 to-transparent p-2 rounded-lg border-l-4 border-l-indigo-500 border-t border-indigo-700/40">
            <div className="text-[10px] font-black text-white leading-tight">Dr. Elizabeth Vance</div>
            <div className="text-[8px] text-indigo-300 font-medium">Lead Astrobiologist & Research Fellow</div>
          </div>
        </div>
      );
    }

    // Generic Template
    return (
      <div className="w-full h-24 rounded-lg bg-gray-950 border border-gray-800 p-2.5 flex flex-col justify-center relative overflow-hidden group">
        <div className="bg-gray-900/80 p-2 rounded border border-gray-700">
          <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider">{item.name}</div>
          <div className="text-[10px] text-gray-200 mt-0.5 line-clamp-2 leading-tight">
            {item.defaultContent?.primaryText || item.description}
          </div>
        </div>
      </div>
    );
  }

  // ---------------- 8. BACKGROUND MUSIC PREVIEWS ----------------
  // Background Music: intentionally NO preview graphic — audio items stay
  // simple (name + description + Test) so users are not confused by a
  // visual effect that is not part of the video.
  if (item.category === "background_music") {
    return null;
  }

  // ---------------- 9. FILTERS PREVIEWS (REAL VISIBLE COLOR GRADES) ----------------
  if (item.category === "filters") {
    const filterId = item.type.replace("filter_", "");
    const primaryColor = item.defaultVisualOptions?.primaryColor || "#6366f1";
    const secondaryColor = item.defaultVisualOptions?.secondaryColor || "#1e1b4b";

    return (
      <div className="w-full h-24 rounded-lg border border-gray-800 p-2 flex flex-col justify-between relative overflow-hidden group shadow-inner">
        {/* Colorful real gradient background simulating scene image under filter */}
        <div
          className="absolute inset-0 transition-transform duration-300 group-hover:scale-105"
          style={{
            background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 60%, #030712 100%)`,
          }}
        />

        {/* Diagonal split badge */}
        <div className="relative z-10 flex items-center justify-between">
          <span className="text-[10px] font-bold text-white drop-shadow bg-black/60 px-2 py-0.5 rounded backdrop-blur-sm border border-white/10">
            {item.name}
          </span>
          <span className="text-[8px] font-mono text-gray-200 bg-black/60 px-1.5 py-0.5 rounded border border-white/10">
            {filterId}
          </span>
        </div>

        {/* Split comparison preview line */}
        <div className="relative z-10 flex items-center justify-between text-[8px] text-white/90 bg-black/50 px-2 py-1 rounded backdrop-blur-sm">
          <span>Preset Color Grade</span>
          <span className="text-amber-300 font-semibold">Live Preview</span>
        </div>
      </div>
    );
  }

  // Sound Effects: intentionally NO preview graphic (see note above).
  if (item.category === "sound_effects") {
    return null;
  }

  // ---------------- BRAND LOGO PREVIEW ----------------
  return (
    <div className="w-full h-24 rounded-lg bg-gray-950 border border-gray-800 p-2 flex items-center justify-center relative overflow-hidden group">
      <div className="relative z-10 flex items-center gap-2 bg-gray-900/90 px-3 py-1.5 rounded-lg border border-gray-700">
        <span className="text-base">🏷️</span>
        <span className="text-xs font-semibold text-gray-200">Official Brand Watermark</span>
      </div>
    </div>
  );
}
