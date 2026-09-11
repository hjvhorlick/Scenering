import React, { useState, useRef, useCallback, useEffect } from "react";
import type { Scene, TimelineInsert, CustomerLogoConfig } from "../types";
import { EDGE_FUNCTION_BASE } from "../lib/supabase";
import {
  applySceneFilter,
  getMotionTransform,
  getPresetCoords,
  renderTimelineInsert,
} from "../lib/render-effects";

interface VideoPreviewProps {
  scenes: Scene[];
  title: string;
  inserts?: TimelineInsert[];
  currentPlayheadTime?: number;
  onSeek?: (time: number) => void;
  onSelectInsert?: (insert: TimelineInsert) => void;
  onUpdateInsert?: (updated: TimelineInsert) => void;
  onVoicesLoaded?: (voices: { id: string; name: string }[]) => void;
  onNavigateToRender?: () => void;
  customerLogo?: CustomerLogoConfig;
}

interface SceneAudio {
  buffer: AudioBuffer;
  url: string;
}

function loadImage(
  src: string,
  fallbackIndex: number
): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => {
      const c = document.createElement("canvas");
      c.width = 1280;
      c.height = 720;
      const ctx = c.getContext("2d")!;
      const hue = (fallbackIndex * 60) % 360;
      const g = ctx.createLinearGradient(0, 0, 1280, 720);
      g.addColorStop(0, `hsl(${hue},50%,25%)`);
      g.addColorStop(1, `hsl(${(hue + 60) % 360},50%,15%)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.font = "bold 48px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Scene ${fallbackIndex + 1}`, 640, 360);
      const p = new Image();
      p.onload = () => resolve(p);
      p.src = c.toDataURL();
    };
    img.src = src;
  });
}

export default function VideoPreview({
  scenes,
  title,
  inserts = [],
  currentPlayheadTime = 0,
  onSeek,
  onSelectInsert,
  onUpdateInsert,
  onVoicesLoaded,
  onNavigateToRender,
  customerLogo,
}: VideoPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [audioStatus, setAudioStatus] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("en-US-ChristopherNeural");
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([]);

  const animFrameRef = useRef<number>(0);
  const playingRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioBuffersRef = useRef<Map<number, SceneAudio>>(new Map());
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const watermarkImgRef = useRef<HTMLImageElement | null>(null);
  const customerLogoImgRef = useRef<HTMLImageElement | null>(null);

  // Preload Crisp Logo Watermark
  useEffect(() => {
    const img = new Image();
    img.src = "/scenering-logo.png";
    img.onload = () => {
      watermarkImgRef.current = img;
    };
  }, []);

  // Preload Customer Brand Logo (Top-Right)
  useEffect(() => {
    if (customerLogo?.url) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        customerLogoImgRef.current = img;
      };
      img.src = customerLogo.url;
    } else {
      customerLogoImgRef.current = null;
    }
  }, [customerLogo?.url]);

  const scenesWithImages = scenes.filter((s) => s.image_url);

  // Load voice list on mount
  useEffect(() => {
    fetch(`${EDGE_FUNCTION_BASE}/tts`)
      .then((r) => r.json())
      .then((data) => {
        if (data.voices) {
          setVoices(data.voices);
          onVoicesLoaded?.(data.voices);
        }
      })
      .catch(() => {});
  }, [onVoicesLoaded]);

  // Synthesize audio for a single scene with per-scene voice support
  const synthesizeScene = useCallback(
    async (scene: Scene, audioCtx: AudioContext): Promise<SceneAudio | null> => {
      try {
        const voiceToUse = scene.voice_id || selectedVoice;
        const res = await fetch(`${EDGE_FUNCTION_BASE}/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: scene.text, voice: voiceToUse }),
        });
        if (!res.ok) return null;

        const arrayBuf = await res.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuf.slice(0));
        const blob = new Blob([arrayBuf], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);

        return { buffer: audioBuffer, url };
      } catch (err) {
        console.error("TTS synthesis failed for scene:", err);
        return null;
      }
    },
    [selectedVoice]
  );

  // Pre-generate all scene audio
  const generateAllAudio = useCallback(async () => {
    if (scenesWithImages.length === 0) return;

    setLoadingAudio(true);

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const newBuffers = new Map<number, SceneAudio>();

    for (let i = 0; i < scenesWithImages.length; i++) {
      const scene = scenesWithImages[i];
      setAudioStatus(`Generating voice for scene ${i + 1}/${scenesWithImages.length}...`);

      const audio = await synthesizeScene(scene, audioCtx);
      if (audio) {
        newBuffers.set(scene.id, audio);
      }
    }

    audioBuffersRef.current = newBuffers;
    setAudioStatus(`${newBuffers.size} scene(s) ready`);
    setLoadingAudio(false);
    return { audioCtx, buffers: newBuffers };
  }, [scenesWithImages, synthesizeScene]);

  // Unified Scene & Insert Drawing Function
  const drawScene = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      scene: Scene,
      sceneProgress: number,
      img: HTMLImageElement | null,
      absoluteTime: number = 0,
      audioLevel: number = 0.4
    ) => {
      const canvas = ctx.canvas;
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);

      // Image with Scene Framing (offset, zoom, fit) and Scene Motion Preset
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        const zoom = scene.image_zoom ?? 1.0;
        const userOffsetX = ((scene.image_offset_x ?? 0) / 100) * w;
        const userOffsetY = ((scene.image_offset_y ?? 0) / 100) * h;
        const fit = scene.image_fit || "cover";

        // Motion animation transform
        const { scale: motionScale, dx: motionDx, dy: motionDy } = getMotionTransform(scene.motion_effect, sceneProgress, w, h);

        const imgRatio = img.naturalWidth / img.naturalHeight;
        const canvasRatio = w / h;

        let renderW = w;
        let renderH = h;
        let baseDx = 0;
        let baseDy = 0;

        if (fit === "contain") {
          if (imgRatio > canvasRatio) {
            renderW = w;
            renderH = w / imgRatio;
            baseDy = (h - renderH) / 2;
          } else {
            renderH = h;
            renderW = h * imgRatio;
            baseDx = (w - renderW) / 2;
          }
        } else {
          // "cover"
          if (imgRatio > canvasRatio) {
            renderH = h;
            renderW = h * imgRatio;
            baseDx = (w - renderW) / 2;
          } else {
            renderW = w;
            renderH = w / imgRatio;
            baseDy = (h - renderH) / 2;
          }
        }

        const totalScale = zoom * motionScale;
        const scaledW = renderW * totalScale;
        const scaledH = renderH * totalScale;

        const finalX = baseDx + userOffsetX + motionDx - (scaledW - renderW) / 2;
        const finalY = baseDy + userOffsetY + motionDy - (scaledH - renderH) / 2;

        ctx.drawImage(img, finalX, finalY, scaledW, scaledH);
        ctx.restore();
      }

      // Apply Scene Cinematic Filter directly on canvas
      applySceneFilter(ctx, scene.filter, w, h);

      // Subtitle Background Gradient
      const grad = ctx.createLinearGradient(0, h * 0.5, 0, h);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(0.5, "rgba(0,0,0,0.4)");
      grad.addColorStop(1, "rgba(0,0,0,0.85)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, h * 0.5, w, h * 0.5);

      // Subtitle Text
      const textOpacity = Math.min(1, sceneProgress * 4);
      ctx.globalAlpha = textOpacity;
      ctx.fillStyle = "#fff";
      ctx.font = "bold 26px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";

      const words = scene.text.split(" ");
      const lines: string[] = [];
      let curLine = "";
      const maxW = w - 100;
      for (const word of words) {
        const test = curLine ? curLine + " " + word : word;
        if (ctx.measureText(test).width > maxW && curLine) {
          lines.push(curLine);
          curLine = word;
        } else {
          curLine = test;
        }
      }
      if (curLine) lines.push(curLine);

      const lh = 36;
      const startY = h - 50 - (lines.length - 1) * lh;

      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      lines.forEach((line, i) => ctx.fillText(line, w / 2, startY + i * lh));

      ctx.globalAlpha = 1;
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Crisp Scenering Logo Watermark in Top-Left Corner (Permanent & Stands Out)
      if (watermarkImgRef.current && watermarkImgRef.current.complete) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        const wmWidth = 190;
        const wmHeight = (wmWidth * watermarkImgRef.current.naturalHeight) / watermarkImgRef.current.naturalWidth;
        const wmX = 22;
        const wmY = 18;
        const padX = 10;
        const padY = 6;
        const pillW = wmWidth + padX * 2;
        const pillH = wmHeight + padY * 2;
        const rad = 10;

        // Protective contrast pill backdrop to guarantee crisp visibility on every scene
        ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = "rgba(10, 12, 22, 0.78)";
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(wmX - padX, wmY - padY, pillW, pillH, rad) : ctx.rect(wmX - padX, wmY - padY, pillW, pillH);
        ctx.fill();

        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw crisp watermark logo
        ctx.drawImage(watermarkImgRef.current, wmX, wmY, wmWidth, wmHeight);
        ctx.restore();
      }

      // Customer Brand Logo in Top-Right Corner (if enabled)
      let customerLogoHeight = 0;
      if (
        customerLogo?.enabled &&
        customerLogo.url &&
        customerLogoImgRef.current &&
        customerLogoImgRef.current.complete
      ) {
        ctx.save();
        ctx.globalAlpha = Math.max(0.1, Math.min(1.0, customerLogo.opacity ?? 1.0));
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        const scale = customerLogo.scale ?? 1.0;
        const margin = customerLogo.margin ?? 20;
        const cWidth = Math.round(150 * scale);
        const cHeight = (cWidth * customerLogoImgRef.current.naturalHeight) / customerLogoImgRef.current.naturalWidth;
        customerLogoHeight = cHeight;
        const cX = w - cWidth - margin;
        const cY = margin;
        const cPadX = 8;
        const cPadY = 6;

        // Protective pill for customer logo
        ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
        ctx.shadowBlur = 8;
        ctx.fillStyle = "rgba(10, 12, 22, 0.72)";
        ctx.beginPath();
        ctx.roundRect
          ? ctx.roundRect(cX - cPadX, cY - cPadY, cWidth + cPadX * 2, cHeight + cPadY * 2, 8)
          : ctx.rect(cX - cPadX, cY - cPadY, cWidth + cPadX * 2, cHeight + cPadY * 2);
        ctx.fill();

        ctx.shadowColor = "transparent";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.drawImage(customerLogoImgRef.current, cX, cY, cWidth, cHeight);
        ctx.restore();
      }

      // Scene & Speaker badge in Top-Right Corner (placed below customer logo if present)
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      const badgeW = scene.speaker_name ? 230 : 170;
      const badgeH = 32;
      const badgeX = w - badgeW - 20;
      const badgeY =
        customerLogo?.enabled && customerLogo?.url && customerLogoHeight > 0
          ? (customerLogo.margin ?? 20) + customerLogoHeight + 18
          : 16;
      const radius = 8;
      ctx.beginPath();
      ctx.moveTo(badgeX + radius, badgeY);
      ctx.lineTo(badgeX + badgeW - radius, badgeY);
      ctx.quadraticCurveTo(badgeX + badgeW, badgeY, badgeX + badgeW, badgeY + radius);
      ctx.lineTo(badgeX + badgeW, badgeY + badgeH - radius);
      ctx.quadraticCurveTo(badgeX + badgeW, badgeY + badgeH, badgeX + badgeW - radius, badgeY + badgeH);
      ctx.lineTo(badgeX + radius, badgeY + badgeH);
      ctx.quadraticCurveTo(badgeX, badgeY + badgeH, badgeX, badgeY + badgeH - radius);
      ctx.lineTo(badgeX, badgeY + radius);
      ctx.quadraticCurveTo(badgeX, badgeY, badgeX + radius, badgeY);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "13px system-ui, sans-serif";
      ctx.textAlign = "left";
      const badgeText = scene.speaker_name
        ? `Scene ${scene.order_index + 1} · 🗣️ ${scene.speaker_name}`
        : `Scene ${scene.order_index + 1} / ${scenesWithImages.length}`;
      ctx.fillText(badgeText, badgeX + 12, badgeY + 21);

      // Render Active Timeline Inserts (Stickers, Cards, Visualizers, Special FX)
      if (inserts && inserts.length > 0) {
        inserts.forEach((insert) => {
          renderTimelineInsert(ctx, insert, absoluteTime, w, h, audioLevel);
        });
      }

      // Progress bar along bottom
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(0, h - 4, w, 4);
      ctx.fillStyle = "#6366f1";
      ctx.fillRect(0, h - 4, w * sceneProgress, 4);
    },
    [scenesWithImages.length, inserts]
  );

  // Redraw when user scrubs playhead while paused
  useEffect(() => {
    if (isPlaying || scenesWithImages.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scrubTime = currentPlayheadTime;
    let acc = 0;
    let targetScene = scenesWithImages[0];
    let targetIdx = 0;
    let sceneProgress = 0;

    for (let i = 0; i < scenesWithImages.length; i++) {
      const s = scenesWithImages[i];
      if (scrubTime >= acc && scrubTime < acc + s.duration) {
        targetScene = s;
        targetIdx = i;
        sceneProgress = (scrubTime - acc) / Math.max(0.1, s.duration);
        break;
      }
      acc += s.duration;
      if (i === scenesWithImages.length - 1) {
        targetScene = s;
        targetIdx = i;
        sceneProgress = 1;
      }
    }

    loadImage(targetScene.image_url || "", targetIdx).then((img) => {
      if (!playingRef.current) {
        drawScene(ctx, targetScene, sceneProgress, img, scrubTime, 0.4);
      }
    });
  }, [currentPlayheadTime, isPlaying, scenesWithImages, drawScene]);

  // Interactive Drag-to-Position on Canvas
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !inserts || inserts.length === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;

    const currentTime = currentPlayheadTime;
    const activeInserts = inserts.filter(
      (ins) => currentTime >= ins.startTime && currentTime <= ins.startTime + ins.duration
    );
    if (activeInserts.length === 0) return;

    let nearest: TimelineInsert | null = null;
    let minDist = 0.25;
    activeInserts.forEach((ins) => {
      const pos = ins.presetPosition ? getPresetCoords(ins.presetPosition) : ins.position;
      const dist = Math.hypot(clickX - pos.x, clickY - pos.y);
      if (dist < minDist) {
        minDist = dist;
        nearest = ins;
      }
    });

    if (nearest && onSelectInsert) {
      const selectedItem: TimelineInsert = nearest;
      onSelectInsert(selectedItem);
      if (onUpdateInsert) {
        const onMove = (me: MouseEvent) => {
          const mx = Math.max(0.05, Math.min(0.95, (me.clientX - rect.left) / rect.width));
          const my = Math.max(0.05, Math.min(0.95, (me.clientY - rect.top) / rect.height));
          onUpdateInsert({
            ...selectedItem,
            position: { x: mx, y: my },
            presetPosition: undefined,
          });
        };
        const onUp = () => {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }
    }
  };

  // ------ PLAY PREVIEW ------
  const playPreview = useCallback(async () => {
    if (scenesWithImages.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsPlaying(true);
    setProgress(0);
    playingRef.current = true;

    const images = await Promise.all(
      scenesWithImages.map((s, i) => loadImage(s.image_url || "", i))
    );

    let audioCtx = audioCtxRef.current;
    let buffers = audioBuffersRef.current;

    if (buffers.size === 0) {
      setAudioStatus("Generating narration...");
      const result = await generateAllAudio();
      if (result) {
        audioCtx = result.audioCtx;
        buffers = result.buffers;
      }
    }

    if (!playingRef.current) return;

    if (audioCtx && audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    if (audioCtx && !analyserRef.current) {
      const an = audioCtx.createAnalyser();
      an.fftSize = 64;
      analyserRef.current = an;
      an.connect(audioCtx.destination);
    }

    let sceneIdx = 0;
    let sceneStartTime = performance.now();
    let currentAudioSource: AudioBufferSourceNode | null = null;

    const playSceneAudio = (idx: number) => {
      if (currentAudioSource) {
        try { currentAudioSource.stop(); } catch {}
      }
      if (!audioCtx) return;

      const scene = scenesWithImages[idx];
      const sceneAudio = buffers.get(scene.id);
      if (sceneAudio) {
        const source = audioCtx.createBufferSource();
        source.buffer = sceneAudio.buffer;
        if (analyserRef.current) {
          source.connect(analyserRef.current);
        } else {
          source.connect(audioCtx.destination);
        }
        source.start();
        currentAudioSource = source;
        currentSourceRef.current = source;
      }
    };

    playSceneAudio(0);

    const animate = () => {
      if (!playingRef.current) {
        if (currentAudioSource) try { currentAudioSource.stop(); } catch {}
        return;
      }

      const now = performance.now();
      const elapsed = (now - sceneStartTime) / 1000;
      const scene = scenesWithImages[sceneIdx];

      const sceneAudio = buffers.get(scene.id);
      const sceneDur = sceneAudio
        ? Math.max(sceneAudio.buffer.duration, scene.duration)
        : scene.duration;

      const sceneProgress = Math.min(1, elapsed / sceneDur);

      let totalElapsed = 0;
      for (let i = 0; i < sceneIdx; i++) {
        const sa = buffers.get(scenesWithImages[i].id);
        totalElapsed += sa
          ? Math.max(sa.buffer.duration, scenesWithImages[i].duration)
          : scenesWithImages[i].duration;
      }
      totalElapsed += elapsed;

      // Sample real-time audio amplitude for reactive visualizers
      let audioLevel = 0.4;
      if (analyserRef.current) {
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        audioLevel = sum / (data.length * 255);
      }

      drawScene(ctx, scene, sceneProgress, images[sceneIdx], totalElapsed, audioLevel);

      const totalDur = scenesWithImages.reduce((sum, s) => {
        const sa = buffers.get(s.id);
        return sum + (sa ? Math.max(sa.buffer.duration, s.duration) : s.duration);
      }, 0);
      setProgress(Math.min(1, totalElapsed / totalDur));
      setCurrentSceneIndex(sceneIdx);
      onSeek?.(totalElapsed);

      if (elapsed >= sceneDur) {
        sceneIdx++;
        if (sceneIdx >= scenesWithImages.length) {
          setIsPlaying(false);
          playingRef.current = false;
          setProgress(1);
          if (currentAudioSource) try { currentAudioSource.stop(); } catch {}
          drawScene(ctx, scenesWithImages[0], 0, images[0], 0, 0.4);
          onSeek?.(0);
          return;
        }
        sceneStartTime = performance.now();
        playSceneAudio(sceneIdx);
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
  }, [scenesWithImages, drawScene, generateAllAudio, onSeek]);

  const stopPreview = useCallback(() => {
    playingRef.current = false;
    setIsPlaying(false);
    cancelAnimationFrame(animFrameRef.current);
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch {}
    }
  }, []);

  useEffect(() => {
    return () => {
      playingRef.current = false;
      cancelAnimationFrame(animFrameRef.current);
      if (currentSourceRef.current) {
        try { currentSourceRef.current.stop(); } catch {}
      }
    };
  }, []);

  if (scenesWithImages.length === 0) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-8 text-center">
        <div className="text-4xl mb-3">🎬</div>
        <h3 className="text-lg font-semibold mb-1">No Images Yet</h3>
        <p className="text-gray-400 text-sm">
          Search and assign images to your scenes first.
        </p>
      </div>
    );
  }

  const anyAction = isPlaying || loadingAudio;

  return (
    <div className="space-y-4">
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden shadow-xl">
        {/* Canvas & Interactive Repositioning Layer */}
        <div className="relative group">
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            onMouseDown={handleCanvasMouseDown}
            className="w-full aspect-video bg-black cursor-crosshair"
            title="Click and drag active stickers or cards to reposition them"
          />

          {/* Hint Overlay when hovering canvas */}
          <div className="absolute bottom-2 right-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-black/75 backdrop-blur px-2.5 py-1 rounded-md text-[11px] text-gray-300 border border-gray-700">
            🖱️ Drag elements to reposition
          </div>

          {loadingAudio && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center">
              <svg className="animate-spin h-8 w-8 text-indigo-400 mb-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-white text-sm">{audioStatus}</p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="p-4 space-y-3">
          {/* Progress Bar */}
          <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-100 bg-indigo-500"
              style={{ width: `${progress * 100}%` }}
            />
          </div>

          {/* Status */}
          {audioStatus && (
            <div className="text-xs text-gray-400 text-center">
              {audioStatus}
            </div>
          )}

          {/* Action Buttons Row - Playback & Render Section */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-750">
            <div className="flex items-center gap-3">
              <button
                onClick={isPlaying ? stopPreview : playPreview}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-white font-medium text-xs flex items-center gap-2"
                title={isPlaying ? "Stop" : "Play Preview"}
              >
                {isPlaying ? (
                  <>
                    <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                    </svg>
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span>Play Preview</span>
                  </>
                )}
              </button>

              <span className="text-xs text-gray-400 font-mono">
                {scenesWithImages.length} scenes · {Math.round(progress * 100)}%
              </span>
            </div>

            {onNavigateToRender && (
              <button
                onClick={() => {
                  stopPreview();
                  onNavigateToRender();
                }}
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold rounded-lg shadow-lg hover:shadow-indigo-500/25 transition-all flex items-center gap-2 cursor-pointer"
                title="Open Final Render Studio to export video, audio, subtitles and project ZIP"
              >
                <span>🎬 Proceed to Render Section</span>
                <span className="text-sm font-bold">→</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
