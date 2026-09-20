import React, { useEffect, useRef } from "react";
import { CatalogItem } from "../lib/video-studio-catalog";

interface EffectVisualPreviewProps {
  item: CatalogItem;
}

export default function EffectVisualPreview({ item }: EffectVisualPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    // Only audio visualizers need a dynamic canvas loop for smooth animation
    if (item.category !== "audio_visualizers") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let startTime = performance.now();

    const renderLoop = (time: number) => {
      const elapsed = (time - startTime) / 1000;
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // Dark studio backdrop with subtle grid
      ctx.fillStyle = "#070913";
      ctx.fillRect(0, 0, w, h);

      // Draw subtle grid line
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      const type = item.type;

      if (type === "oscilloscope") {
        // CRT Oscilloscope: Electronic phosphor green/cyan beam with realistic voice harmonics & CRT grid
        // Oscilloscope grid ticks
        ctx.strokeStyle = "rgba(16, 185, 129, 0.15)";
        ctx.lineWidth = 1;
        for (let gx = 20; gx < w; gx += 30) {
          ctx.beginPath();
          ctx.moveTo(gx, h / 2 - 25);
          ctx.lineTo(gx, h / 2 + 25);
          ctx.stroke();
        }

        // Phosphor halo (glow layer)
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
          const normX = x / w;
          const env = Math.sin(normX * Math.PI);
          // Glottal voice pitch + formant resonances F1 & F2
          const fundamental = Math.sin(normX * 16 - elapsed * 10);
          const formant1 = Math.sin(normX * 48 - elapsed * 18) * 0.45;
          const formant2 = Math.sin(normX * 96 + elapsed * 24) * 0.2;
          const y = h / 2 + (fundamental + formant1 + formant2) * 18 * env;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "rgba(52, 211, 153, 0.4)";
        ctx.lineWidth = 6;
        ctx.shadowColor = "#10b981";
        ctx.shadowBlur = 12;
        ctx.stroke();

        // Laser-sharp CRT core beam
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.8;
        ctx.shadowBlur = 4;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Secondary harmonic phase trace
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
          const normX = x / w;
          const env = Math.sin(normX * Math.PI);
          const y = h / 2 + Math.sin(normX * 24 + elapsed * 8) * 9 * env;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "rgba(6, 182, 212, 0.5)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else if (type === "waveform") {
        // Continuous smooth neon acoustic wave
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
          const normX = x / w;
          const env = Math.sin(normX * Math.PI); // envelope (0 at edges, 1 in center)
          const y =
            h / 2 +
            Math.sin(normX * 12 + elapsed * 4) * 16 * env +
            Math.cos(normX * 24 - elapsed * 6) * 8 * env;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "#06b6d4";
        ctx.lineWidth = 3;
        ctx.shadowColor = "#06b6d4";
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Secondary harmonic wave
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
          const normX = x / w;
          const env = Math.sin(normX * Math.PI);
          const y =
            h / 2 +
            Math.sin(normX * 8 - elapsed * 3) * 12 * env +
            Math.sin(normX * 18 + elapsed * 5) * 6 * env;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "#a855f7";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (type === "mirror_wave") {
        // Mirrored symmetrical dual oscillating wave
        const count = 36;
        const barW = (w - 40) / count;
        const startX = 20;

        for (let i = 0; i < count; i++) {
          const norm = i / count;
          const env = Math.sin(norm * Math.PI);
          const amp =
            (Math.sin(norm * 14 + elapsed * 5) * 0.5 + 0.5) *
            (Math.cos(norm * 20 - elapsed * 3) * 0.3 + 0.7) *
            22 *
            env;

          const x = startX + i * barW;
          const barHeight = Math.max(3, amp);

          // Top half
          const grad = ctx.createLinearGradient(0, h / 2 - barHeight, 0, h / 2 + barHeight);
          grad.addColorStop(0, "#38bdf8");
          grad.addColorStop(0.5, "#ec4899");
          grad.addColorStop(1, "#38bdf8");

          ctx.fillStyle = grad;
          ctx.fillRect(x, h / 2 - barHeight, barW - 1.5, barHeight * 2);
        }
      } else if (type === "equalizer_bars" || type === "spectrum" || type === "speech_spectrum") {
        // Multi-frequency studio spectrum bars
        const numBars = type === "spectrum" ? 28 : 20;
        const pad = 3;
        const totalW = w - 40;
        const barW = (totalW - (numBars - 1) * pad) / numBars;
        const startX = 20;

        for (let i = 0; i < numBars; i++) {
          const frac = i / numBars;
          const freqPulse =
            Math.sin(frac * 8 + elapsed * 6) * 0.35 +
            Math.cos(frac * 14 - elapsed * 4) * 0.35 +
            Math.sin(elapsed * 8 + i) * 0.3;
          const normHeight = Math.max(0.12, Math.min(0.95, (freqPulse + 1) / 2));
          const maxH = h - 24;
          const barH = normHeight * maxH;
          const x = startX + i * (barW + pad);
          const y = h - 12 - barH;

          // Spectrum gradient: green -> yellow -> crimson/cyan
          const grad = ctx.createLinearGradient(0, h - 12, 0, y);
          if (type === "spectrum") {
            grad.addColorStop(0, "#3b82f6");
            grad.addColorStop(0.5, "#10b981");
            grad.addColorStop(0.8, "#f59e0b");
            grad.addColorStop(1, "#ef4444");
          } else if (type === "speech_spectrum") {
            grad.addColorStop(0, "#4f46e5");
            grad.addColorStop(0.6, "#818cf8");
            grad.addColorStop(1, "#c084fc");
          } else {
            grad.addColorStop(0, "#059669");
            grad.addColorStop(0.6, "#10b981");
            grad.addColorStop(0.85, "#eab308");
            grad.addColorStop(1, "#ef4444");
          }

          ctx.fillStyle = grad;
          ctx.beginPath();
          if (typeof ctx.roundRect === "function") {
            ctx.roundRect(x, y, barW, Math.max(0, barH), [2, 2, 0, 0]);
          } else {
            ctx.rect(x, y, barW, Math.max(0, barH));
          }
          ctx.fill();

          // Peak dot
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(x, Math.max(8, y - 3), barW, 1.5);
        }
      } else if (type === "circular_wave") {
        // Circular frequency wave: Radial bars radiating outward all around the circle!
        const cx = w / 2;
        const cy = h / 2;
        const innerR = 18;
        const barCount = 36;

        // Inner glowing core
        ctx.beginPath();
        ctx.arc(cx, cy, innerR - 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(14, 165, 233, 0.15)";
        ctx.fill();
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 1.5;
        ctx.shadowColor = "#38bdf8";
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Radial outward bars all around 360 degrees
        for (let i = 0; i < barCount; i++) {
          const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
          const harmonic =
            Math.sin(angle * 3 + elapsed * 5) * 0.4 +
            Math.cos(angle * 6 - elapsed * 3) * 0.3 +
            0.5;
          const barLen = 5 + Math.max(2, harmonic * 18);

          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);

          const x1 = cx + cosA * innerR;
          const y1 = cy + sinA * innerR;
          const x2 = cx + cosA * (innerR + barLen);
          const y2 = cy + sinA * (innerR + barLen);

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = `hsl(${190 + (i / barCount) * 120}, 90%, 60%)`;
          ctx.lineWidth = 2.4;
          ctx.lineCap = "round";
          ctx.stroke();

          // Floating outer peak dot
          const px = cx + cosA * (innerR + barLen + 3);
          const py = cy + sinA * (innerR + barLen + 3);
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(px, py, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (type === "voice_pulse" || type === "energy_ring") {
        // Pulsating concentric circles & glowing radar arcs
        const cx = w / 2;
        const cy = h / 2;
        const maxR = Math.min(w, h) * 0.42;

        const pulse = (elapsed * 1.8) % 1;

        for (let ring = 0; ring < 3; ring++) {
          const ringProgress = (pulse + ring * 0.33) % 1;
          const r = Math.max(0.1, ringProgress * maxR);
          const alpha = Math.max(0, 1 - ringProgress);

          ctx.strokeStyle = type === "energy_ring" ? `rgba(236, 72, 153, ${alpha})` : `rgba(56, 189, 248, ${alpha})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Glowing center core
        const coreGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 14);
        coreGrad.addColorStop(0, "#ffffff");
        coreGrad.addColorStop(0.4, type === "energy_ring" ? "#f43f5e" : "#0ea5e9");
        coreGrad.addColorStop(1, "transparent");
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.fill();
      } else if (type === "minimal_voice") {
        // Minimal Talking Dots: 4 modern 3D AI assistant dots that bounce into pills during speech
        const cx = w / 2;
        const cy = h / 2;
        const dotColors = ["#3b82f6", "#ef4444", "#f59e0b", "#10b981"];
        const spacing = 18;
        const startX = cx - (dotColors.length - 1) * (spacing / 2);

        dotColors.forEach((color, i) => {
          const x = startX + i * spacing;
          // Dynamic vocal pulse bounce & stretch
          const bounce = Math.sin(elapsed * 10 + i * 1.4);
          const amp = Math.max(0.1, (bounce + 1) / 2);
          const pillHeight = Math.max(4, 8 + amp * 22);
          const y = cy - pillHeight / 2;

          // 3D Capsule Pill
          ctx.fillStyle = color;
          ctx.beginPath();
          if (typeof ctx.roundRect === "function") {
            ctx.roundRect(x - 4, y, 8, pillHeight, [4, 4, 4, 4]);
          } else {
            ctx.rect(x - 4, y, 8, pillHeight);
          }
          ctx.fill();

          // 3D Specular Highlight
          ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
          ctx.beginPath();
          ctx.arc(x, y + 3, 1.8, 0, Math.PI * 2);
          ctx.fill();
        });
      } else {
        // Default clean acoustic wave
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
          const normX = x / w;
          const y = h / 2 + Math.sin(normX * 8 + elapsed * 3) * 14;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "#10b981";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      animRef.current = requestAnimationFrame(renderLoop);
    };

    animRef.current = requestAnimationFrame(renderLoop);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [item]);

  // If this is an audio visualizer, return the live animated canvas
  if (item.category === "audio_visualizers") {
    return (
      <div className="w-full h-24 rounded-lg bg-gray-950 border border-gray-800 overflow-hidden relative shadow-inner flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={280}
          height={96}
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-1 right-2 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">Audio Reactive</span>
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
  if (item.category === "background_music") {
    return (
      <div className="w-full h-24 rounded-lg bg-gradient-to-br from-gray-950 via-indigo-950/40 to-gray-950 border border-indigo-600/30 p-2.5 flex flex-col justify-between relative overflow-hidden group">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full bg-indigo-600/30 border border-indigo-500/50 flex items-center justify-center text-xs text-indigo-300">
              🎵
            </div>
            <span className="text-[10px] font-bold text-white truncate max-w-[140px]">{item.name}</span>
          </div>
          <span className="text-[8px] font-mono text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/40">
            Relaxing
          </span>
        </div>

        {/* Animated Soundwave bars indicator */}
        <div className="flex items-center justify-center gap-1 py-1">
          {[12, 22, 16, 28, 14, 24, 18, 26, 10, 20, 15].map((h, i) => (
            <div
              key={i}
              style={{ height: `${h}px` }}
              className="w-1 bg-gradient-to-t from-indigo-500 to-purple-400 rounded-full opacity-80 group-hover:opacity-100 transition-opacity"
            />
          ))}
        </div>

        <div className="flex items-center justify-between text-[8px] text-gray-400 border-t border-gray-800/80 pt-1">
          <span className="truncate max-w-[150px]">{item.defaultContent?.secondaryText || "Royalty-free"}</span>
          <span className="text-indigo-300 font-medium">Auto Credits ✓</span>
        </div>
      </div>
    );
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

  // ---------------- 10. SOUND EFFECTS PREVIEWS ----------------
  if (item.category === "sound_effects") {
    return (
      <div className="w-full h-24 rounded-lg bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 border border-gray-800 p-2.5 flex flex-col justify-between relative overflow-hidden group">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-base">{item.icon}</span>
            <span className="text-[10px] font-bold text-white truncate max-w-[140px]">{item.name}</span>
          </div>
          <span className="text-[8px] font-mono text-amber-400 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-800/40 uppercase">
            {item.subCategory || "SFX"}
          </span>
        </div>

        <div className="flex items-center justify-center gap-1 py-1">
          <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shadow-sm group-hover:scale-110 transition-transform">
            🔊
          </div>
        </div>

        <div className="flex items-center justify-between text-[8px] text-gray-400 border-t border-gray-800/80 pt-1">
          <span>Timeline Insert</span>
          <span className="font-mono text-gray-300">{item.defaultDuration}s</span>
        </div>
      </div>
    );
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
