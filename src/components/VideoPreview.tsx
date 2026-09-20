import React, { useState, useRef, useCallback, useEffect } from "react";
import type { Scene, TimelineInsert, CustomerLogoConfig, CaptionsConfig, AspectRatioType, PacingModeType } from "../types";
import { EDGE_FUNCTION_BASE } from "../lib/supabase";
import {
  applySceneFilter,
  getMotionTransform,
  getPresetCoords,
  renderTimelineInsert,
} from "../lib/render-effects";
import { renderCanvasCaptions, DEFAULT_CAPTIONS_CONFIG } from "../lib/render-captions";
import { calculateDynamicDuration } from "../lib/duration-utils";
import { getCanvasFilterString } from "../data/filters-library";
import { getCachedSceneAudio } from "../lib/tts-cache";

interface VideoPreviewProps {
  scenes: Scene[];
  title: string;
  inserts?: TimelineInsert[];
  currentPlayheadTime?: number;
  captionsConfig?: CaptionsConfig;
  onSeek?: (time: number) => void;
  onSelectInsert?: (insert: TimelineInsert) => void;
  onUpdateInsert?: (updated: TimelineInsert) => void;
  onVoicesLoaded?: (voices: { id: string; name: string }[]) => void;
  onNavigateToRender?: () => void;
  customerLogo?: CustomerLogoConfig;
  onPlayStateChange?: (isPlaying: boolean, togglePlay: () => void) => void;
  selectedVoice?: string;
  aspectRatio?: AspectRatioType;
  pacingMode?: PacingModeType;
}

// Playback timing helper: respects scene.duration while ensuring audio is never cut short
function getSceneSpeechDuration(scene: Scene, audioBuf?: AudioBuffer): number {
  if (audioBuf && audioBuf.duration > 0.3) {
    const audioSec = Math.round((audioBuf.duration + 0.1) * 10) / 10;
    return scene.duration && scene.duration > audioSec ? scene.duration : audioSec;
  }
  if (scene.duration && scene.duration > 0) {
    return scene.duration;
  }
  return calculateDynamicDuration(scene.text, scene.audio_duration, 20);
}

interface SceneAudio {
  buffer: AudioBuffer;
  url: string;
  voiceKey?: string;
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
  captionsConfig,
  onSeek,
  onSelectInsert,
  onUpdateInsert,
  onVoicesLoaded,
  onNavigateToRender,
  customerLogo,
  onPlayStateChange,
  selectedVoice: propSelectedVoice,
  aspectRatio = "16:9",
  pacingMode = "auto_speech",
}: VideoPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [audioStatus, setAudioStatus] = useState("");
  const [selectedVoice, setSelectedVoice] = useState(propSelectedVoice || "en-US-ChristopherNeural");
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([]);
  const currentPlayheadTimeRef = useRef(currentPlayheadTime);

  const aspectConfig = {
    "16:9": { w: 1280, h: 720, cssClass: "w-full aspect-video" },
    "9:16": { w: 720, h: 1280, cssClass: "aspect-[9/16] max-h-[520px] mx-auto" },
    "1:1": { w: 1080, h: 1080, cssClass: "aspect-square max-h-[520px] mx-auto" },
    "4:3": { w: 960, h: 720, cssClass: "aspect-[4/3] max-h-[520px] mx-auto" },
  }[aspectRatio || "16:9"] || { w: 1280, h: 720, cssClass: "w-full aspect-video" };

  useEffect(() => {
    if (propSelectedVoice) {
      setSelectedVoice(propSelectedVoice);
    }
  }, [propSelectedVoice]);

  useEffect(() => {
    currentPlayheadTimeRef.current = currentPlayheadTime;
  }, [currentPlayheadTime]);

  const animFrameRef = useRef<number>(0);
  const playingRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioBuffersRef = useRef<Map<number, SceneAudio>>(new Map());
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const watermarkImgRef = useRef<HTMLImageElement | null>(null);
  const customerLogoImgRef = useRef<HTMLImageElement | null>(null);
  const [logoLoadedCounter, setLogoLoadedCounter] = useState<number>(0);

  // Preload Crisp Logo Watermark
  useEffect(() => {
    const img = new Image();
    img.src = "/scenering-logo.png";
    img.onload = () => {
      watermarkImgRef.current = img;
      setLogoLoadedCounter((c) => c + 1);
    };
  }, []);

  // Preload Customer Brand Logo (Top-Right)
  useEffect(() => {
    const logoUrl = customerLogo?.url;
    if (logoUrl) {
      const img = new Image();
      // Only set crossOrigin on non-data URLs to prevent canvas/browser security rejections
      if (!logoUrl.startsWith("data:")) {
        img.crossOrigin = "anonymous";
      }
      img.onload = () => {
        customerLogoImgRef.current = img;
        setLogoLoadedCounter((c) => c + 1);
      };
      img.onerror = () => {
        // Fallback retry without crossOrigin if remote server does not supply CORS headers
        if (img.crossOrigin) {
          const fallbackImg = new Image();
          fallbackImg.onload = () => {
            customerLogoImgRef.current = fallbackImg;
            setLogoLoadedCounter((c) => c + 1);
          };
          fallbackImg.src = logoUrl;
        }
      };
      img.src = logoUrl;
    } else {
      customerLogoImgRef.current = null;
      setLogoLoadedCounter((c) => c + 1);
    }
  }, [customerLogo?.url]);

  const scenesWithImages = scenes.filter((s) => s.image_url);

function createFallbackSceneAudio(audioCtx: AudioContext, durationSeconds: number): SceneAudio {
  const sampleRate = audioCtx.sampleRate || 44100;
  const numSamples = Math.max(1, Math.floor(sampleRate * Math.max(1, durationSeconds)));
  const buffer = audioCtx.createBuffer(1, numSamples, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    data[i] = Math.sin(2 * Math.PI * 220 * t) * 0.02 * (Math.sin(2 * Math.PI * 3.5 * t) > 0 ? 1 : 0.2);
  }
  return { buffer, url: "" };
}

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

  // Invalidate any cached scene audio whose voice_id or text has changed
  useEffect(() => {
    const activeVoice = propSelectedVoice || selectedVoice;
    scenes.forEach((scene) => {
      const existing = audioBuffersRef.current.get(scene.id);
      if (existing && existing.voiceKey) {
        const expectedKey = scene.audio_url
          ? `imported_${scene.audio_url}`
          : `${scene.voice_id || activeVoice}_${(scene.text || "").trim()}`;
        if (existing.voiceKey !== expectedKey) {
          audioBuffersRef.current.delete(scene.id);
        }
      }
    });
  }, [scenes, propSelectedVoice, selectedVoice]);

  // Synthesize audio for a single scene with per-scene voice support
  const synthesizeScene = useCallback(
    async (scene: Scene, audioCtx: AudioContext): Promise<SceneAudio> => {
      const activeVoice = propSelectedVoice || selectedVoice;
      const voiceToUse = scene.voice_id || activeVoice;
      const text = (scene.text || "").trim();

      // 0. Check pre-generated/saved audio from Voiceover Studio cache
      const cached = getCachedSceneAudio(scene.id, voiceToUse, text);
      if (cached) {
        return {
          buffer: cached.audioBuffer,
          url: cached.blobUrl,
          voiceKey: scene.audio_url ? `imported_${scene.audio_url}` : `${voiceToUse}_${text}`,
        };
      }

      // 1. If scene has an imported real voice audio track, use it directly!
      if (scene.audio_url) {
        const voiceKey = `imported_${scene.audio_url}`;
        try {
          const res = await fetch(scene.audio_url);
          if (res.ok) {
            const arrayBuf = await res.arrayBuffer();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuf.slice(0));
            return { buffer: audioBuffer, url: scene.audio_url, voiceKey };
          }
        } catch (err) {
          console.warn("Failed to load imported audio for scene:", scene.id, err);
        }
      }

      const voiceKey = `${voiceToUse}_${text}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const res = await fetch(`${EDGE_FUNCTION_BASE}/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: scene.text, voice: voiceToUse }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const arrayBuf = await res.arrayBuffer();
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuf.slice(0));
          const blob = new Blob([arrayBuf], { type: "audio/mpeg" });
          const url = URL.createObjectURL(blob);
          return { buffer: audioBuffer, url, voiceKey };
        }
      } catch (err) {
        clearTimeout(timeoutId);
        console.warn("TTS synthesis fallback for scene:", scene.id, err);
      }

      // Safe fallback audio buffer matching scene timing so preview & visualizer continue seamlessly
      const fallback = createFallbackSceneAudio(audioCtx, scene.duration || 4);
      return { ...fallback, voiceKey };
    },
    [selectedVoice, propSelectedVoice]
  );

  // Pre-generate all scene audio in parallel with live status
  const generateAllAudio = useCallback(async () => {
    if (scenesWithImages.length === 0) return;

    setLoadingAudio(true);

    const audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") {
      try {
        await audioCtx.resume();
      } catch {}
    }
    audioCtxRef.current = audioCtx;
    const newBuffers = new Map<number, SceneAudio>();

    let completedCount = 0;
    setAudioStatus(`Preparing narration: 0/${scenesWithImages.length} ready...`);

    // Concurrent synthesis across all scenes for instant readiness
    await Promise.all(
      scenesWithImages.map(async (scene) => {
        const activeVoice = propSelectedVoice || selectedVoice;
        const expectedKey = scene.audio_url
          ? `imported_${scene.audio_url}`
          : `${scene.voice_id || activeVoice}_${(scene.text || "").trim()}`;
        const existing = audioBuffersRef.current.get(scene.id);
        if (existing && existing.voiceKey === expectedKey) {
          newBuffers.set(scene.id, existing);
          completedCount++;
          return;
        }

        const audio = await synthesizeScene(scene, audioCtx);
        newBuffers.set(scene.id, audio);
        completedCount++;
        setAudioStatus(`Generating voice: ${completedCount}/${scenesWithImages.length} ready...`);
      })
    );

    audioBuffersRef.current = newBuffers;
    setAudioStatus(`${newBuffers.size} scene(s) ready`);
    setLoadingAudio(false);
    return { audioCtx, buffers: newBuffers };
  }, [scenesWithImages, synthesizeScene, propSelectedVoice, selectedVoice]);

  // Unified Scene & Insert Drawing Function
  const drawScene = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      scene: Scene,
      sceneProgress: number,
      img: HTMLImageElement | null,
      absoluteTime: number = 0,
      audioLevel: number = 0.4,
      freqData?: Uint8Array | null
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

        // Apply real photographic color grade to image canvas pixels
        const canvasFilter = getCanvasFilterString(scene.filter);
        if (canvasFilter && canvasFilter !== "none") {
          ctx.filter = canvasFilter;
        }

        ctx.drawImage(img, finalX, finalY, scaledW, scaledH);
        ctx.filter = "none";
        ctx.restore();
      }

      // Apply Scene Visual Filter overlays (film scratches, dust motes, VHS scanlines, sun flares, vignettes)
      applySceneFilter(ctx, scene.filter, w, h, absoluteTime);

      // Check if we are currently inside an Intro or Outro segment
      const introInsert = inserts?.find((ins) => ins.category === "intro");
      const outroInsert = inserts?.find((ins) => ins.category === "outro");
      const introDur = introInsert ? introInsert.duration : 0;
      const outroDur = outroInsert ? outroInsert.duration : 0;
      const scriptDur = scenesWithImages.reduce((sum, s) => {
        const sa = audioBuffersRef.current.get(s.id);
        return sum + getSceneSpeechDuration(s, sa?.buffer);
      }, 0);

      const isIntroSegment = Boolean(introInsert && absoluteTime < introDur);
      const isOutroSegment = Boolean(outroInsert && absoluteTime >= introDur + scriptDur);
      const isIntroOrOutro = isIntroSegment || isOutroSegment;

      // Render Subtitles / Captions (Strictly disabled for Intro and Outro segments per user instruction)
      if (!isIntroOrOutro && captionsConfig?.enabled !== false && scene.text) {
        const activeCaptions = captionsConfig || DEFAULT_CAPTIONS_CONFIG;
        renderCanvasCaptions(ctx, scene.text, sceneProgress, activeCaptions, w, h);
      }

      // Crisp Scenering Logo Watermark in Top-Left Corner (Transparent background, no borders)
      if (watermarkImgRef.current && (watermarkImgRef.current.complete || watermarkImgRef.current.naturalWidth > 0)) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        const wmWidth = 180;
        const wmHeight = (wmWidth * watermarkImgRef.current.naturalHeight) / watermarkImgRef.current.naturalWidth;
        const wmX = 24;
        const wmY = 20;

        // Subtle soft shadow so transparent logo stands out cleanly on any video scene
        ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;

        ctx.drawImage(watermarkImgRef.current, wmX, wmY, wmWidth, wmHeight);
        ctx.restore();
      }

      // Customer Brand Logo in Top-Right Corner (Transparent background, no borders)
      let customerLogoHeight = 0;
      if (
        customerLogo?.enabled &&
        customerLogo.url &&
        customerLogoImgRef.current &&
        (customerLogoImgRef.current.complete || customerLogoImgRef.current.naturalWidth > 0)
      ) {
        ctx.save();
        ctx.globalAlpha = Math.max(0.1, Math.min(1.0, customerLogo.opacity ?? 1.0));
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        const scaleRatio = w / 1280;
        const scale = customerLogo.scale ?? 1.0;
        const marginX = (customerLogo.margin ?? 20) * scaleRatio;
        const marginY = (customerLogo.margin ?? 20) * (h / 720);
        // Base width 200 matches sample display and RenderView exactly
        const cWidth = Math.round(200 * scale * scaleRatio);
        const cHeight = (cWidth * customerLogoImgRef.current.naturalHeight) / customerLogoImgRef.current.naturalWidth;
        customerLogoHeight = cHeight;
        const cX = w - cWidth - marginX;
        const cY = marginY;

        // Soft shadow so transparent logo is crisp and legible on any scene
        ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
        ctx.shadowBlur = 8 * scaleRatio;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2 * scaleRatio;

        ctx.drawImage(customerLogoImgRef.current, cX, cY, cWidth, cHeight);
        ctx.restore();
      }

      // Scene & Speaker badge in Top-Right Corner (Only shown during script scenes)
      if (!isIntroOrOutro) {
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        const badgeW = scene.speaker_name ? 260 : 180;
        const badgeH = 32;
        const badgeX = w - badgeW - 20;
        const badgeY =
          customerLogo?.enabled && customerLogo?.url && customerLogoHeight > 0
            ? (customerLogo.margin ?? 20) * (h / 720) + customerLogoHeight + 14
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
        const totalScenesCount = scenesWithImages.length || 1;
        const badgeText = scene.speaker_name
          ? `Scene ${scene.order_index + 1} of ${totalScenesCount} · 🗣️ ${scene.speaker_name}`
          : `Scene ${scene.order_index + 1} of ${totalScenesCount}`;
        ctx.fillText(badgeText, badgeX + 12, badgeY + 21);
      }

      // Render Active Timeline Inserts (Stickers, Cards, Visualizers, Special FX)
      if (inserts && inserts.length > 0) {
        inserts.forEach((insert) => {
          renderTimelineInsert(ctx, insert, absoluteTime, w, h, audioLevel, freqData);
        });
      }

      // Progress bar along bottom
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(0, h - 4, w, 4);
      ctx.fillStyle = "#6366f1";
      ctx.fillRect(0, h - 4, w * sceneProgress, 4);
    },
    [scenesWithImages.length, inserts, customerLogo, captionsConfig]
  );

  // Redraw when user scrubs playhead while paused OR when logo/captions/scene changes
  useEffect(() => {
    if (isPlaying || scenesWithImages.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scrubTime = currentPlayheadTime;
    const introInsert = inserts?.find((ins) => ins.category === "intro");
    const outroInsert = inserts?.find((ins) => ins.category === "outro");
    const introDur = introInsert ? introInsert.duration : 0;
    const outroDur = outroInsert ? outroInsert.duration : 0;
    const scriptDur = scenesWithImages.reduce((sum, s) => {
      const sa = audioBuffersRef.current.get(s.id);
      return sum + getSceneSpeechDuration(s, sa?.buffer);
    }, 0);

    let targetScene = scenesWithImages[0];
    let targetIdx = 0;
    let sceneProgress = 0;

    if (introInsert && scrubTime < introDur) {
      targetScene = scenesWithImages[0];
      targetIdx = 0;
      sceneProgress = scrubTime / Math.max(0.1, introDur);
    } else if (outroInsert && scrubTime >= introDur + scriptDur) {
      const lastIdx = scenesWithImages.length - 1;
      targetScene = scenesWithImages[lastIdx];
      targetIdx = lastIdx;
      sceneProgress = (scrubTime - introDur - scriptDur) / Math.max(0.1, outroDur);
    } else {
      const scriptTime = Math.max(0, scrubTime - introDur);
      let acc = 0;
      for (let i = 0; i < scenesWithImages.length; i++) {
        const s = scenesWithImages[i];
        const sa = audioBuffersRef.current.get(s.id);
        const sDur = getSceneSpeechDuration(s, sa?.buffer);
        if (scriptTime >= acc && scriptTime < acc + sDur) {
          targetScene = s;
          targetIdx = i;
          sceneProgress = (scriptTime - acc) / Math.max(0.1, sDur);
          break;
        }
        acc += sDur;
        if (i === scenesWithImages.length - 1) {
          targetScene = s;
          targetIdx = i;
          sceneProgress = 1;
        }
      }
    }

    loadImage(targetScene.image_url || "", targetIdx).then((img) => {
      if (!playingRef.current) {
        drawScene(ctx, targetScene, sceneProgress, img, scrubTime, 0.4);
      }
    });
  }, [
    currentPlayheadTime,
    isPlaying,
    scenesWithImages,
    drawScene,
    customerLogo,
    logoLoadedCounter,
    captionsConfig,
  ]);

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
  const playPreview = useCallback(async (seekTime?: number) => {
    if (scenesWithImages.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const images = await Promise.all(
      scenesWithImages.map((s, i) => loadImage(s.image_url || "", i))
    );

    let audioCtx = audioCtxRef.current;
    let buffers = audioBuffersRef.current;

    const activeVoice = propSelectedVoice || selectedVoice;
    const needsRegen = scenesWithImages.some((s) => {
      const existing = buffers.get(s.id);
      const expectedKey = s.audio_url
        ? `imported_${s.audio_url}`
        : `${s.voice_id || activeVoice}_${(s.text || "").trim()}`;
      return !existing || existing.voiceKey !== expectedKey;
    });

    if (needsRegen || buffers.size === 0) {
      setAudioStatus("Syncing voice dialogue...");
      const result = await generateAllAudio();
      if (result) {
        audioCtx = result.audioCtx;
        buffers = result.buffers;
      }
    }

    if (audioCtx && audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    if (audioCtx && !analyserRef.current) {
      const an = audioCtx.createAnalyser();
      an.fftSize = 64;
      analyserRef.current = an;
      an.connect(audioCtx.destination);
    }

    const introInsert = inserts?.find((ins) => ins.category === "intro");
    const outroInsert = inserts?.find((ins) => ins.category === "outro");
    const introDur = introInsert ? introInsert.duration : 0;
    const outroDur = outroInsert ? outroInsert.duration : 0;

    const scriptDur = scenesWithImages.reduce((sum, s) => {
      const sa = buffers.get(s.id);
      return sum + getSceneSpeechDuration(s, sa?.buffer);
    }, 0);

    const totalDur = introDur + scriptDur + outroDur;

    const startTime = typeof seekTime === "number" ? seekTime : (currentPlayheadTimeRef.current || 0);
    // If playhead was at or beyond the very end, restart from beginning
    const safeStartTime = (startTime >= totalDur - 0.1) ? 0 : Math.max(0, startTime);

    setIsPlaying(true);
    setProgress(totalDur > 0 ? safeStartTime / totalDur : 0);
    playingRef.current = true;

    let currentAudioSource: AudioBufferSourceNode | null = null;

    const playSceneAudio = (idx: number, offset: number = 0) => {
      if (currentAudioSource) {
        try { currentAudioSource.stop(); } catch {}
      }
      if (!audioCtx) return;

      const scene = scenesWithImages[idx];
      if (!scene) return;
      const sceneAudio = buffers.get(scene.id);
      if (sceneAudio) {
        const source = audioCtx.createBufferSource();
        source.buffer = sceneAudio.buffer;
        if (analyserRef.current) {
          source.connect(analyserRef.current);
        } else {
          source.connect(audioCtx.destination);
        }
        const safeOffset = Math.max(0, Math.min(sceneAudio.buffer.duration - 0.05, offset));
        source.start(0, safeOffset);
        currentAudioSource = source;
        currentSourceRef.current = source;
      }
    };

    let currentPlayingSceneIdx = -999;
    const playStartWallTime = performance.now();

    // If starting inside script scenes, begin playing scene audio immediately
    if (safeStartTime >= introDur && safeStartTime < introDur + scriptDur) {
      const initialScriptTime = safeStartTime - introDur;
      let acc = 0;
      for (let i = 0; i < scenesWithImages.length; i++) {
        const s = scenesWithImages[i];
        const sa = buffers.get(s.id);
        const sDur = getSceneSpeechDuration(s, sa?.buffer);
        if (initialScriptTime >= acc && initialScriptTime < acc + sDur) {
          currentPlayingSceneIdx = i;
          setCurrentSceneIndex(i);
          playSceneAudio(i, initialScriptTime - acc);
          break;
        }
        acc += sDur;
        if (i === scenesWithImages.length - 1) {
          currentPlayingSceneIdx = i;
          setCurrentSceneIndex(i);
          playSceneAudio(i, Math.max(0, initialScriptTime - acc));
        }
      }
    }

    const animate = () => {
      if (!playingRef.current) {
        if (currentAudioSource) try { currentAudioSource.stop(); } catch {}
        return;
      }

      const now = performance.now();
      const totalElapsed = (now - playStartWallTime) / 1000 + safeStartTime;

      if (totalElapsed >= totalDur) {
        if (currentAudioSource) try { currentAudioSource.stop(); } catch {}
        setIsPlaying(false);
        playingRef.current = false;
        setProgress(1);
        drawScene(ctx, scenesWithImages[0], 0, images[0], 0, 0.4);
        onSeek?.(0);
        return;
      }

      // Sample real-time audio amplitude for reactive visualizers
      let audioLevel = 0.4;
      let freqData: Uint8Array | null = null;
      if (analyserRef.current) {
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        audioLevel = sum / (data.length * 255);
        freqData = data;
      }

      // 1. INTRO SEGMENT: Full screen insert, NO captions, NO speech voiceover
      if (introInsert && totalElapsed < introDur) {
        const introProgress = totalElapsed / Math.max(0.1, introDur);
        drawScene(ctx, scenesWithImages[0], introProgress, images[0], totalElapsed, audioLevel, freqData);
        setProgress(totalDur > 0 ? totalElapsed / totalDur : 0);
        onSeek?.(totalElapsed);
        animFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      // 2. OUTRO SEGMENT: Full screen insert, NO captions, NO speech voiceover
      if (outroInsert && totalElapsed >= introDur + scriptDur) {
        if (currentAudioSource) {
          try { currentAudioSource.stop(); } catch {}
          currentAudioSource = null;
        }
        const lastIdx = scenesWithImages.length - 1;
        const outroProgress = (totalElapsed - introDur - scriptDur) / Math.max(0.1, outroDur);
        drawScene(ctx, scenesWithImages[lastIdx], outroProgress, images[lastIdx], totalElapsed, audioLevel, freqData);
        setProgress(totalDur > 0 ? totalElapsed / totalDur : 0);
        onSeek?.(totalElapsed);
        animFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      // 3. SCRIPT SCENES: Voiceover narration + captions + camera motion
      const scriptTime = Math.max(0, totalElapsed - introDur);
      let accum = 0;
      let activeIdx = 0;
      let activeOffset = 0;
      let activeSceneDur = 20;

      for (let i = 0; i < scenesWithImages.length; i++) {
        const s = scenesWithImages[i];
        const sa = buffers.get(s.id);
        const sDur = getSceneSpeechDuration(s, sa?.buffer);
        if (scriptTime >= accum && scriptTime < accum + sDur) {
          activeIdx = i;
          activeOffset = scriptTime - accum;
          activeSceneDur = sDur;
          break;
        }
        accum += sDur;
        if (i === scenesWithImages.length - 1) {
          activeIdx = i;
          activeOffset = Math.max(0, scriptTime - accum);
          activeSceneDur = sDur;
        }
      }

      if (activeIdx !== currentPlayingSceneIdx) {
        currentPlayingSceneIdx = activeIdx;
        setCurrentSceneIndex(activeIdx);
        playSceneAudio(activeIdx, activeOffset);
      }

      const activeScene = scenesWithImages[activeIdx];
      const sceneProgress = Math.min(1, activeOffset / Math.max(0.1, activeSceneDur));
      drawScene(ctx, activeScene, sceneProgress, images[activeIdx], totalElapsed, audioLevel, freqData);
      setProgress(totalDur > 0 ? totalElapsed / totalDur : 0);
      onSeek?.(totalElapsed);

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
  }, [scenesWithImages, drawScene, generateAllAudio, onSeek, pacingMode]);

  const stopPreview = useCallback(() => {
    playingRef.current = false;
    setIsPlaying(false);
    cancelAnimationFrame(animFrameRef.current);
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch {}
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (playingRef.current) {
      stopPreview();
    } else {
      playPreview();
    }
  }, [stopPreview, playPreview]);

  useEffect(() => {
    onPlayStateChange?.(isPlaying, togglePlay);
  }, [isPlaying, togglePlay, onPlayStateChange]);

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
        <div className="relative group flex justify-center items-center bg-black/40">
          <canvas
            ref={canvasRef}
            width={aspectConfig.w}
            height={aspectConfig.h}
            onMouseDown={handleCanvasMouseDown}
            className={`${aspectConfig.cssClass} bg-black cursor-crosshair`}
            title="Click and drag active stickers or cards to reposition them"
          />

          {/* Hint Overlay when hovering canvas */}
          <div className="absolute bottom-2 right-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-black/75 backdrop-blur px-2.5 py-1 rounded-md text-[11px] text-gray-300 border border-gray-700">
            🖱️ Drag elements to reposition
          </div>

          {loadingAudio && (
            <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center p-4 z-20">
              <svg className="animate-spin h-8 w-8 text-indigo-400 mb-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-white text-sm font-medium">{audioStatus}</p>
              <button
                onClick={() => {
                  setLoadingAudio(false);
                  setAudioStatus("Narration ready");
                }}
                className="mt-3 px-3 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-xs text-gray-200 rounded-md transition-colors cursor-pointer"
              >
                Skip & Play Video
              </button>
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
                onClick={togglePlay}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-white font-medium text-xs flex items-center gap-2 cursor-pointer"
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

              <span className="text-xs text-indigo-300 font-mono font-semibold bg-indigo-950/80 px-2.5 py-1 rounded-md border border-indigo-700/60 flex items-center gap-1.5">
                <span>🎬</span>
                <span>Total: {scenes.length} {scenes.length === 1 ? "Scene" : "Scenes"}</span>
                <span className="text-gray-500">·</span>
                <span>{Math.round(progress * 100)}%</span>
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
