import React, { useState, useRef, useCallback, useEffect } from "react";
import type { Scene, TimelineInsert, CustomerLogoConfig, CaptionsConfig, AspectRatioType, PacingModeType } from "../types";
import { EDGE_FUNCTION_BASE } from "../lib/supabase";
import {
  getInsertBounds,
  getMotionTransform,
  getPresetCoords,
  renderTimelineInsert,
} from "../lib/render-effects";
import { drawSceneImage } from "../lib/scene-framing";
import { drawSceneTransition, getTransitionDuration } from "../lib/scene-transition";
import { ClipPool, asDrawableClip, sceneHasClip } from "../lib/scene-clip";
import { renderCanvasCaptions, DEFAULT_CAPTIONS_CONFIG } from "../lib/render-captions";
import { AudioFrame, EMPTY_FRAME, makeBus } from "../lib/audio-reactive";
import { isVisualizerFullWidth } from "../lib/render-visualizers";
import { loadCaptionFonts } from "../data/caption-styles";
import { calculateDynamicDuration } from "../lib/duration-utils";
import { getFilterCanvas, type VideoFilterConfig } from "../data/video-filters";
import { paintVideoFilter } from "../lib/video-filter-render";
import { renderSection } from "../lib/render-section";
import type { SectionConfig } from "../data/intro-outro";
import {
  VoiceEchoConfig,
  VoiceEchoGraph,
  createVoiceEchoGraph,
  voiceEchoIsActive,
  resolveVoiceEcho,
} from "../lib/voice-echo";
import { getCachedSceneAudio, resolveSceneAudioBuffer, setCachedSceneAudio } from "../lib/tts-cache";
import { buildInsertAudioPlan, buildSectionAudioPlan, InsertAudioMixer } from "../lib/insert-audio";

interface VideoPreviewProps {
  scenes: Scene[];
  title: string;
  inserts?: TimelineInsert[];
  currentPlayheadTime?: number;
  captionsConfig?: CaptionsConfig;
  onSeek?: (time: number) => void;
  onSelectInsert?: (insert: TimelineInsert) => void;
  onUpdateInsert?: (updated: TimelineInsert) => void;
  /** Id of the insert currently open in the properties modal (gets drag/resize chrome) */
  selectedInsertId?: string;
  onVoicesLoaded?: (voices: { id: string; name: string }[]) => void;
  customerLogo?: CustomerLogoConfig;
  onPlayStateChange?: (isPlaying: boolean, togglePlay: () => void) => void;
  selectedVoice?: string;
  aspectRatio?: AspectRatioType;
  pacingMode?: PacingModeType;
  /** one look across the whole video (set in Video Studio → Filters) */
  videoFilter?: VideoFilterConfig | null;
  /** opening / closing sections built in Video Studio → Intro / Outro */
  introSection?: SectionConfig | null;
  outroSection?: SectionConfig | null;
  /** echo / ambience on the narration (Voiceover step) — the preview plays the voice exactly as the render will */
  voiceEcho?: VoiceEchoConfig;
}

// Playback timing helper: respects scene.duration while ensuring audio is never cut short
function getSceneSpeechDuration(scene: Scene, audioBuf?: AudioBuffer): number {
  // The decoded narration is the authority on how long the scene runs, so the
  // video never sits on a still frame in silence. Previously a longer
  // configured `scene.duration` won, which is exactly what produced the quiet
  // stretches at the end of scenes.
  if (audioBuf && audioBuf.duration > 0.3) {
    return Math.round((audioBuf.duration + 0.35) * 10) / 10;
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
  selectedInsertId,
  onVoicesLoaded,
  customerLogo,
  onPlayStateChange,
  selectedVoice: propSelectedVoice,
  aspectRatio = "16:9",
  pacingMode = "auto_speech",
  videoFilter = null,
  introSection = null,
  outroSection = null,
  voiceEcho,
}: VideoPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // kept in a ref so the draw loop always grades with the latest settings
  // without having to rebuild every callback while the sliders are dragged
  const videoFilterRef = useRef<VideoFilterConfig | null>(videoFilter);
  videoFilterRef.current = videoFilter;

  // live echo setting — a change made in the Voiceover step is heard the next
  // time the preview plays, and while playing the graph is retuned in place
  const echoRef = useRef<VoiceEchoConfig | undefined>(voiceEcho);
  echoRef.current = voiceEcho;
  useEffect(() => {
    const existing = echoGraphRef.current;
    if (!existing) return;
    try {
      existing.graph.update(resolveVoiceEcho(voiceEcho));
    } catch {}
  }, [voiceEcho]);

  // Intro / outro sections (built in the studio, stored on the project — they
  // are NOT timeline inserts any more).
  const activeIntro = introSection?.enabled ? introSection : null;
  const activeOutro = outroSection?.enabled ? outroSection : null;
  const introDuration = activeIntro ? Math.max(0.5, activeIntro.duration) : 0;
  const outroDuration = activeOutro ? Math.max(0.5, activeOutro.duration) : 0;
  const sectionsRef = useRef({ intro: activeIntro, outro: activeOutro });
  sectionsRef.current = { intro: activeIntro, outro: activeOutro };

  // ---- Download the preview ----
  // A silent MediaStreamDestination that sits next to the speakers, so a
  // recording of the preview carries the same narration, music and stingers
  // the user just heard.
  const recordDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const onPlaybackEndRef = useRef<(() => void) | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("preview.webm");
  const [downloadSize, setDownloadSize] = useState(0);

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
  /** Hidden <video> elements for scenes that use a short clip instead of a still. */
  const clipPoolRef = useRef<ClipPool>(new ClipPool());
  const audioCtxRef = useRef<AudioContext | null>(null);
  // Voice and background-music are analysed on separate buses so a visualiser
  // set to "moves with the music" reacts to the music, not to the narration.
  const analyserRef = useRef<AnalyserNode | null>(null);
  const musicAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioBuffersRef = useRef<Map<number, SceneAudio>>(new Map());
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  // The narration's echo chain for the current playback session. It is kept
  // alive between scenes so the tail rings on instead of being chopped off.
  const echoGraphRef = useRef<{ ctx: AudioContext; graph: VoiceEchoGraph } | null>(null);
  const insertMixerRef = useRef<InsertAudioMixer | null>(null);
  const watermarkImgRef = useRef<HTMLImageElement | null>(null);
  const customerLogoImgRef = useRef<HTMLImageElement | null>(null);
  const [logoLoadedCounter, setLogoLoadedCounter] = useState<number>(0);
  // Repaint the canvas once the caption typefaces arrive
  const [fontsLoadedCounter, setFontsLoadedCounter] = useState<number>(0);

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

  // A scene counts as renderable if it has a still OR a short video clip.
  const scenesWithImages = scenes.filter((s) => s.image_url || s.video_url);

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

  // Eagerly hydrate existing saved voiceovers into memory so play starts immediately with zero delay
  useEffect(() => {
    let cancelled = false;
    const hydrateAudio = async () => {
      let audioCtx = audioCtxRef.current;
      if (!audioCtx) {
        audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
      }
      const activeVoice = propSelectedVoice || selectedVoice;
      for (const scene of scenes) {
        if (cancelled) break;
        if (!audioBuffersRef.current.has(scene.id)) {
          const resolved = await resolveSceneAudioBuffer(scene, audioCtx);
          if (resolved && !cancelled) {
            audioBuffersRef.current.set(scene.id, {
              buffer: resolved.buffer,
              url: resolved.url,
              voiceKey: scene.audio_url
                ? `imported_${scene.audio_url}`
                : `${scene.voice_id || activeVoice}_${(scene.text || "").trim()}`,
            });
          }
        }
      }
    };
    hydrateAudio();
    return () => {
      cancelled = true;
    };
  }, [scenes, propSelectedVoice, selectedVoice]);

  // Synthesize audio for a single scene with per-scene voice support
  const synthesizeScene = useCallback(
    async (scene: Scene, audioCtx: AudioContext): Promise<SceneAudio> => {
      const activeVoice = propSelectedVoice || selectedVoice;
      const voiceToUse = scene.voice_id || activeVoice;
      const text = (scene.text || "").trim();
      const voiceKey = scene.audio_url ? `imported_${scene.audio_url}` : `${voiceToUse}_${text}`;

      // 0. Check pre-generated/saved audio from Voiceover Studio cache, memory or IndexedDB
      const resolved = await resolveSceneAudioBuffer(scene, audioCtx);
      if (resolved) {
        return {
          buffer: resolved.buffer,
          url: resolved.url,
          voiceKey,
        };
      }

      // 1. Synthesize only if audio was never generated before
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const res = await fetch("/api/tts", {
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
          setCachedSceneAudio(scene.id, voiceToUse, text, {
            audioBuffer,
            blobUrl: url,
            duration: audioBuffer.duration,
            voiceId: voiceToUse,
            text,
            rawBuffer: arrayBuf,
            blob,
          });
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
  useEffect(() => {
    let cancelled = false;
    loadCaptionFonts().then(() => {
      if (!cancelled) setFontsLoadedCounter((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Release clip decoders when the preview goes away.
  useEffect(() => {
    const pool = clipPoolRef.current;
    return () => pool.dispose();
  }, []);

  const drawScene = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      scene: Scene,
      sceneProgress: number,
      img: HTMLImageElement | null,
      absoluteTime: number = 0,
      audioLevel: number = 0.4,
      freqData?: Uint8Array | null,
      audioFrame?: AudioFrame | null,
      prevScene?: Scene | null,
      prevImg?: HTMLImageElement | null,
      elapsedInScene?: number
    ) => {
      const canvas = ctx.canvas;
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);

      // Image with Scene Framing (crop, offset, zoom, rotate, fit) and Scene
      // Motion Preset. All framing maths lives in src/lib/scene-framing.ts so
      // the preview and the exported video place the photo identically — and
      // no photo is ever stretched out of its own aspect ratio.
      // A scene with a short clip draws the clip's current frame instead of the
      // still. It goes through the same framing engine, so crop, blur-fill and
      // aspect handling are identical and the clip is never squashed.
      let source: (CanvasImageSource & { naturalWidth: number; naturalHeight: number; complete?: boolean }) | null =
        img as any;
      if (sceneHasClip(scene)) {
        const pool = clipPoolRef.current;
        const el = pool.get(scene);
        if (el) {
          if (!playingRef.current) {
            pool.seekToProgress(scene, sceneProgress, Math.max(0.1, scene.duration || 1));
          }
          if (el.readyState >= 2 && el.videoWidth > 0) {
            source = asDrawableClip(el) as any;
          }
        }
      }

      let handledTransition = false;
      if (
        scene.transition &&
        scene.transition !== "none" &&
        elapsedInScene !== undefined
      ) {
        const transDur = getTransitionDuration(scene.duration || 20);
        if (elapsedInScene < transDur) {
          const { scale: motionScale, dx: motionDx, dy: motionDy } = getMotionTransform(
            scene.motion_effect,
            sceneProgress,
            w,
            h
          );
          let prevSource: (CanvasImageSource & { naturalWidth: number; naturalHeight: number }) | null =
            prevImg as any;
          if (prevScene && sceneHasClip(prevScene)) {
            const el = clipPoolRef.current.get(prevScene);
            if (el && el.readyState >= 2 && el.videoWidth > 0) {
              prevSource = asDrawableClip(el) as any;
            }
          }
          const { scale: prevScale, dx: prevDx, dy: prevDy } = getMotionTransform(
            prevScene?.motion_effect,
            1,
            w,
            h
          );
          const safeScale = isNaN(motionScale) ? 1 : motionScale;
          const safeDx = isNaN(motionDx) ? 0 : motionDx;
          const safeDy = isNaN(motionDy) ? 0 : motionDy;
          const safePrevScale = isNaN(prevScale) ? 1 : prevScale;
          const safePrevDx = isNaN(prevDx) ? 0 : prevDx;
          const safePrevDy = isNaN(prevDy) ? 0 : prevDy;

          handledTransition = drawSceneTransition(
            ctx,
            scene,
            source && (!("complete" in source) || (source as any).complete) && source.naturalWidth > 0 ? source : null,
            prevScene || null,
            prevSource && (!("complete" in prevSource) || (prevSource as any).complete) && prevSource.naturalWidth > 0 ? prevSource : null,
            elapsedInScene,
            scene.duration || 20,
            w,
            h,
            {
              motionScale: safeScale,
              motionDx: safeDx + (w * safeScale - w) / 2,
              motionDy: safeDy + (h * safeScale - h) / 2,
              filter: getFilterCanvas(videoFilterRef.current, w),
            },
            prevScene ? {
              motionScale: safePrevScale,
              motionDx: safePrevDx + (w * safePrevScale - w) / 2,
              motionDy: safePrevDy + (h * safePrevScale - h) / 2,
              filter: getFilterCanvas(videoFilterRef.current, w),
            } : undefined
          );
        }
      }

      if (!handledTransition && source && (source.complete ?? true) && source.naturalWidth > 0) {
        const img = source;
        const { scale: motionScale, dx: motionDx, dy: motionDy } = getMotionTransform(
          scene.motion_effect,
          sceneProgress,
          w,
          h
        );
        // getMotionTransform returns an offset that recentres a canvas-sized
        // draw; the framing engine centres the photo itself, so only the
        // leftover wobble is passed through.
        drawSceneImage(ctx, img, scene, w, h, {
          motionScale,
          motionDx: motionDx + (w * motionScale - w) / 2,
          motionDy: motionDy + (h * motionScale - h) / 2,
          filter: getFilterCanvas(videoFilterRef.current, w),
        });
      }

      // Animated atmosphere of the project-wide filter (grain, mist, dust,
      // sun flare, VHS artefacts...). Runs over every scene, whole video.
      paintVideoFilter(ctx, videoFilterRef.current, w, h, absoluteTime);

      // Check if we are currently inside an Intro or Outro segment
      const introSec = sectionsRef.current.intro;
      const outroSec = sectionsRef.current.outro;
      const introDur = introSec ? Math.max(0.5, introSec.duration) : 0;
      const outroDur = outroSec ? Math.max(0.5, outroSec.duration) : 0;
      const scriptDur = scenesWithImages.reduce((sum, s) => {
        const sa = audioBuffersRef.current.get(s.id);
        return sum + getSceneSpeechDuration(s, sa?.buffer);
      }, 0);

      const isIntroSegment = Boolean(introSec && absoluteTime < introDur);
      const isOutroSegment = Boolean(outroSec && absoluteTime >= introDur + scriptDur);
      const isIntroOrOutro = isIntroSegment || isOutroSegment;

      // Render Subtitles / Captions (Strictly disabled for Intro and Outro segments per user instruction)
      if (!isIntroOrOutro && captionsConfig?.enabled !== false && scene.text) {
        const activeCaptions = captionsConfig || DEFAULT_CAPTIONS_CONFIG;
        const sa = audioBuffersRef.current.get(scene.id);
        const speechDur = sa?.buffer.duration && sa.buffer.duration > 0.3 ? sa.buffer.duration : (scene.duration || 4);
        const speechProgress = elapsedInScene !== undefined ? Math.min(1, Math.max(0, elapsedInScene / Math.max(0.1, speechDur))) : sceneProgress;
        renderCanvasCaptions(ctx, scene.text, speechProgress, activeCaptions, w, h);
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
          renderTimelineInsert(ctx, insert, absoluteTime, w, h, audioLevel, freqData, audioFrame, {
            // the project's own logo, so a centre visualiser can show it in
            // the middle of the live preview exactly as the render will
            logo: customerLogo?.enabled ? customerLogoImgRef.current : null,
          });
        });
      }

      // Selection chrome: dashed frame + corner resize handle for the element
      // currently open in the properties modal, so it can be moved and resized in place.
      if (selectedInsertId && inserts) {
        const sel = inserts.find((i) => i.id === selectedInsertId);
        if (sel && absoluteTime >= sel.startTime - 0.01 && absoluteTime <= sel.startTime + sel.duration + 0.01) {
          const b = getInsertBounds(sel, w, h, ctx);
          ctx.save();
          ctx.setLineDash([7, 5]);
          ctx.strokeStyle = "rgba(99, 102, 241, 0.95)";
          ctx.lineWidth = Math.max(1.5, w / 900);
          ctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
          ctx.setLineDash([]);

          const hx = b.x + b.w + 6;
          const hy = b.y + b.h + 6;
          const hr = Math.max(7, w / 110);
          ctx.beginPath();
          ctx.arc(hx, hy, hr, 0, Math.PI * 2);
          ctx.fillStyle = "#6366f1";
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.95)";
          ctx.lineWidth = Math.max(1.5, w / 800);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(hx - hr * 0.35, hy + hr * 0.35);
          ctx.lineTo(hx + hr * 0.35, hy - hr * 0.35);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Progress bar along bottom
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(0, h - 4, w, 4);
      ctx.fillStyle = "#6366f1";
      ctx.fillRect(0, h - 4, w * sceneProgress, 4);
    },
    [scenesWithImages.length, inserts, customerLogo, captionsConfig, selectedInsertId, fontsLoadedCounter]
  );

  // Redraw when user scrubs playhead while paused OR when logo/captions/scene changes
  useEffect(() => {
    if (isPlaying || scenesWithImages.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scrubTime = currentPlayheadTime;
    const introSec = activeIntro;
    const outroSec = activeOutro;
    const introDur = introDuration;
    const outroDur = outroDuration;
    const scriptDur = scenesWithImages.reduce((sum, s) => {
      const sa = audioBuffersRef.current.get(s.id);
      return sum + getSceneSpeechDuration(s, sa?.buffer);
    }, 0);

    let targetScene = scenesWithImages[0];
    let targetIdx = 0;
    let sceneProgress = 0;
    let sceneOffset = 0;

    if (introSec && scrubTime < introDur) {
      const p = scrubTime / Math.max(0.1, introDur);
      renderSection(ctx, introSec, canvas.width, canvas.height, scrubTime, p);
      return;
    } else if (outroSec && scrubTime >= introDur + scriptDur) {
      const oe = scrubTime - introDur - scriptDur;
      renderSection(ctx, outroSec, canvas.width, canvas.height, oe, oe / Math.max(0.1, outroDur));
      return;
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
          sceneOffset = scriptTime - acc;
          sceneProgress = sceneOffset / Math.max(0.1, sDur);
          break;
        }
        acc += sDur;
        if (i === scenesWithImages.length - 1) {
          targetScene = s;
          targetIdx = i;
          sceneOffset = Math.max(0, scriptTime - acc);
          sceneProgress = 1;
        }
      }
    }

    const prevScene = targetIdx > 0 ? scenesWithImages[targetIdx - 1] : null;
    loadImage(targetScene.image_url || "", targetIdx).then((img) => {
      if (!playingRef.current) {
        if (prevScene) {
          loadImage(prevScene.image_url || "", targetIdx - 1).then((prevImg) => {
            if (!playingRef.current) {
              drawScene(ctx, targetScene, sceneProgress, img, scrubTime, 0.4, null, null, prevScene, prevImg, sceneOffset);
            }
          });
        } else {
          drawScene(ctx, targetScene, sceneProgress, img, scrubTime, 0.4, null, null, null, null, sceneOffset);
        }
      }
    });
  }, [
    currentPlayheadTime,
    isPlaying,
    scenesWithImages,
    drawScene,
    customerLogo,
    logoLoadedCounter,
    fontsLoadedCounter,
    captionsConfig,
    videoFilter,
    activeIntro,
    activeOutro,
    introDuration,
    outroDuration,
  ]);

  /** Snap a normalized position to safe-area margins / centre lines */
  const snapPosition = (x: number, y: number) => {
    const snap = (v: number, anchors: number[]) => {
      for (const a of anchors) if (Math.abs(v - a) <= 0.035) return a;
      return v;
    };
    return { x: snap(x, [0.08, 0.22, 0.5, 0.78, 0.92]), y: snap(y, [0.1, 0.15, 0.5, 0.82, 0.9]) };
  };

  const dragStateRef = useRef<{
    id: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    startSize: number;
    insert: TimelineInsert;
  } | null>(null);

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  /** Find the insert under the pointer (smallest hit box wins) */
  const hitTestInsert = (px: number, py: number): TimelineInsert | null => {
    if (!inserts || inserts.length === 0) return null;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const time = currentPlayheadTimeRef.current ?? 0;
    let best: TimelineInsert | null = null;
    let bestArea = Number.POSITIVE_INFINITY;
    for (const ins of inserts) {
      if (time < ins.startTime - 0.01 || time > ins.startTime + ins.duration + 0.01) continue;
      const b = getInsertBounds(ins, w, h, ctx);
      const pad = 6;
      if (px * w >= b.x - pad && px * w <= b.x + b.w + pad && py * h >= b.y - pad && py * h <= b.y + b.h + pad) {
        const area = b.w * b.h;
        if (area < bestArea) {
          bestArea = area;
          best = ins;
        }
      }
    }
    return best;
  };

  /** Bottom-right resize handle of the selected badge, in normalized coords */
  const getResizeHandlePoint = (ins: TimelineInsert) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    const b = getInsertBounds(ins, canvas.width, canvas.height, ctx);
    return { x: (b.x + b.w + 6) / canvas.width, y: (b.y + b.h + 6) / canvas.height };
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !inserts || inserts.length === 0) return;
    const p = getCanvasPoint(e);
    const target = e.target as HTMLElement;

    // 1. corner handle of the already-selected insert => resize
    const selected = selectedInsertId ? inserts.find((i) => i.id === selectedInsertId) : undefined;
    if (selected) {
      const handle = getResizeHandlePoint(selected);
      if (handle && Math.hypot(p.x - handle.x, p.y - handle.y) < 0.04) {
        dragStateRef.current = {
          id: selected.id,
          mode: "resize",
          startX: p.x,
          startY: p.y,
          startSize: selected.size || 1,
          insert: selected,
        };
        target.setPointerCapture?.(e.pointerId);
        return;
      }
    }

    // 2. grab the element under the pointer => move
    const hit = hitTestInsert(p.x, p.y);
    if (hit && onSelectInsert) {
      onSelectInsert(hit);
      dragStateRef.current = {
        id: hit.id,
        mode: "move",
        startX: p.x,
        startY: p.y,
        startSize: hit.size || 1,
        insert: hit,
      };
      target.setPointerCapture?.(e.pointerId);
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragStateRef.current;
    if (!drag || !onUpdateInsert) return;
    const p = getCanvasPoint(e);

    if (drag.mode === "resize") {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const b = getInsertBounds(drag.insert, canvas.width, canvas.height, ctx);
      const cxN = b.cx / canvas.width;
      const cyN = b.cy / canvas.height;
      const startDist = Math.hypot(drag.startX - cxN, drag.startY - cyN);
      const nowDist = Math.hypot(p.x - cxN, p.y - cyN);
      const ratio = startDist > 0.001 ? nowDist / startDist : 1;
      const nextSize = Math.max(0.3, Math.min(3.2, drag.startSize * ratio));
      onUpdateInsert({ ...drag.insert, size: Math.round(nextSize * 100) / 100 });
      return;
    }

    const clampedX = Math.max(0.03, Math.min(0.97, p.x));
    const clampedY = Math.max(0.03, Math.min(0.97, p.y));
    const snapped = snapPosition(clampedX, clampedY);

    // A bar rack that stretches across the entire frame can only be moved up and
    // down — horizontal position is meaningless when it spans edge to edge.
    const yOnly = isVisualizerFullWidth(drag.insert);
    onUpdateInsert({
      ...drag.insert,
      position: yOnly ? { x: drag.insert.position.x, y: snapped.y } : snapped,
      presetPosition: undefined,
    });
  };

  const handleCanvasPointerUp = () => {
    dragStateRef.current = null;
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
    if (!audioCtx) {
      audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
    }
    let buffers = audioBuffersRef.current;

    const activeVoice = propSelectedVoice || selectedVoice;

    // Check if any scene is missing from in-memory buffers
    const missingScenes = scenesWithImages.filter((s) => {
      const existing = buffers.get(s.id);
      const expectedKey = s.audio_url
        ? `imported_${s.audio_url}`
        : `${s.voice_id || activeVoice}_${(s.text || "").trim()}`;
      return !existing || existing.voiceKey !== expectedKey;
    });

    if (missingScenes.length > 0) {
      // First attempt instantaneous local resolution from the voiceover section
      let allResolvedLocally = true;
      for (const s of missingScenes) {
        const resolved = await resolveSceneAudioBuffer(s, audioCtx);
        if (resolved) {
          buffers.set(s.id, {
            buffer: resolved.buffer,
            url: resolved.url,
            voiceKey: s.audio_url
              ? `imported_${s.audio_url}`
              : `${s.voice_id || activeVoice}_${(s.text || "").trim()}`,
          });
        } else {
          allResolvedLocally = false;
        }
      }

      // Only synthesize over the network if voiceover was never generated at all
      if (!allResolvedLocally) {
        setAudioStatus("Syncing voice dialogue...");
        const result = await generateAllAudio();
        if (result) {
          audioCtx = result.audioCtx;
          buffers = result.buffers;
        }
      }
    }

    if (audioCtx && audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    if (audioCtx && !analyserRef.current) {
      const an = audioCtx.createAnalyser();
      // 512 samples => 256 frequency bins: enough resolution for a full-width
      // rack without adjacent bars mirroring each other.
      an.fftSize = 512;
      an.smoothingTimeConstant = 0.72;
      an.minDecibels = -92;
      an.maxDecibels = -12;
      analyserRef.current = an;
      an.connect(audioCtx.destination);
      if (!recordDestRef.current) {
        try { recordDestRef.current = audioCtx.createMediaStreamDestination(); } catch {}
      }
      if (recordDestRef.current) an.connect(recordDestRef.current);

      const music = audioCtx.createAnalyser();
      music.fftSize = 512;
      music.smoothingTimeConstant = 0.72;
      music.minDecibels = -92;
      music.maxDecibels = -12;
      musicAnalyserRef.current = music;
      music.connect(audioCtx.destination);
      if (recordDestRef.current) music.connect(recordDestRef.current);
    }

    // ---- Narration echo (set in the Voiceover step) ---------------------
    // Built fresh for this playback session, on the same AudioContext the
    // narration plays on, and fed into the voice bus so the visualisers react
    // to the voice exactly as it sounds.
    if (audioCtx) {
      const echoCfg = resolveVoiceEcho(echoRef.current);
      const target = analyserRef.current || audioCtx.destination;
      const existing = echoGraphRef.current;
      if (existing && existing.ctx !== audioCtx) {
        try { existing.graph.dispose(); } catch {}
        echoGraphRef.current = null;
      }
      if (!echoGraphRef.current) {
        const graph = createVoiceEchoGraph(audioCtx, echoCfg);
        try { graph.output.connect(target); } catch {}
        echoGraphRef.current = { ctx: audioCtx, graph };
      } else {
        echoGraphRef.current.graph.update(echoCfg);
      }
    }

    const introSec = activeIntro;
    const outroSec = activeOutro;
    const introDur = introDuration;
    const outroDur = outroDuration;

    const scriptDur = scenesWithImages.reduce((sum, s) => {
      const sa = buffers.get(s.id);
      return sum + getSceneSpeechDuration(s, sa?.buffer);
    }, 0);

    const totalDur = introDur + scriptDur + outroDur;

    const startTime = typeof seekTime === "number" ? seekTime : (currentPlayheadTimeRef.current || 0);
    // If playhead was at or beyond the very end, restart from beginning
    const safeStartTime = (startTime >= totalDur - 0.1) ? 0 : Math.max(0, startTime);

    // Build & pre-load the insert audio plan (BGM, SFX, CTA jingles, intro/outro sounds)
    let insertMixer: InsertAudioMixer | null = null;
    if (audioCtx && totalDur > 0) {
      try {
        const plans = [
          ...buildInsertAudioPlan(inserts, totalDur),
          // the intro / outro stingers ride the same mixer, so they are heard
          // in preview AND captured when the preview is downloaded
          ...buildSectionAudioPlan(introSec, outroSec, introDur, totalDur),
        ];
        if (plans.length > 0) {
          // Music & SFX feed the music bus so "moves with the music" items
          // follow the soundtrack instead of the narration.
          insertMixer = new InsertAudioMixer(
            audioCtx,
            musicAnalyserRef.current || analyserRef.current || audioCtx.destination
          );
          await insertMixer.load(plans);
        }
      } catch (err) {
        console.warn("Insert audio setup warning:", err);
      }
    }
    insertMixerRef.current = insertMixer;
    if (insertMixer) insertMixer.startFrom(safeStartTime);

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
        const echo = echoGraphRef.current;
        if (echo && echo.ctx === audioCtx && voiceEchoIsActive(echoRef.current)) {
          // Dry voice + echo tail, both landing on the voice bus
          source.connect(echo.graph.input);
        } else if (analyserRef.current) {
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

      // Drive insert audio (BGM / SFX / CTA / intro-outro sounds)
      try {
        insertMixerRef.current?.tick(totalElapsed);
      } catch {}

      if (totalElapsed >= totalDur) {
        if (currentAudioSource) try { currentAudioSource.stop(); } catch {}
        insertMixerRef.current?.stop();
        insertMixerRef.current = null;
        setIsPlaying(false);
        playingRef.current = false;
        setProgress(1);
        drawScene(ctx, scenesWithImages[0], 0, images[0], 0, 0.4);
        onSeek?.(0);
        onPlaybackEndRef.current?.();
        return;
      }

      // Sample real-time audio amplitude for reactive visualizers. Voice and
      // music are read from their own analysers so the "moves with" choice in
      // the visualiser settings is a genuine difference in behaviour.
      let audioLevel = 0.4;
      let freqData: Uint8Array | null = null;
      let audioFrame: AudioFrame = EMPTY_FRAME;
      if (analyserRef.current) {
        const readBus = (node: AnalyserNode | null) => {
          if (!node) return makeBus(0, null, null);
          const freq = new Uint8Array(node.frequencyBinCount);
          node.getByteFrequencyData(freq);
          const wave = new Uint8Array(node.fftSize);
          node.getByteTimeDomainData(wave);
          let sum = 0;
          for (let i = 0; i < freq.length; i++) sum += freq[i];
          return makeBus(sum / (freq.length * 255), freq, wave);
        };
        const voiceBus = readBus(analyserRef.current);
        const musicBus = readBus(musicAnalyserRef.current);
        audioFrame = { voice: voiceBus, music: musicBus };
        // legacy scalar path: whichever bus is loudest drives non-visualiser effects
        const loudest = voiceBus.level >= musicBus.level ? voiceBus : musicBus;
        audioLevel = Math.max(0.15, loudest.level);
        freqData = (loudest.freq as Uint8Array) || null;
      }

      // 1. INTRO SEGMENT: the built section, NO captions, NO speech voiceover
      if (introSec && totalElapsed < introDur) {
        const introProgress = totalElapsed / Math.max(0.1, introDur);
        renderSection(ctx, introSec, canvas.width, canvas.height, totalElapsed, introProgress);
        setProgress(totalDur > 0 ? totalElapsed / totalDur : 0);
        onSeek?.(totalElapsed);
        animFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      // 2. OUTRO SEGMENT: Full screen insert, NO captions, NO speech voiceover
      if (outroSec && totalElapsed >= introDur + scriptDur) {
        if (currentAudioSource) {
          try { currentAudioSource.stop(); } catch {}
          currentAudioSource = null;
        }
        const outroElapsed = totalElapsed - introDur - scriptDur;
        const outroProgress = outroElapsed / Math.max(0.1, outroDur);
        renderSection(ctx, outroSec, canvas.width, canvas.height, outroElapsed, outroProgress);
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

        // Hand over to the new scene's clip (if it has one) and silence the
        // one we just left, so two clips never overlap.
        const pool = clipPoolRef.current;
        pool.pauseAll();
        const entering = scenesWithImages[activeIdx];
        if (entering && sceneHasClip(entering)) {
          void pool.play(entering, activeOffset / Math.max(0.1, activeSceneDur), activeSceneDur);
        }
      }

      const activeScene = scenesWithImages[activeIdx];
      const sceneProgress = Math.min(1, activeOffset / Math.max(0.1, activeSceneDur));
      const prevScene = activeIdx > 0 ? scenesWithImages[activeIdx - 1] : null;
      const prevImg = activeIdx > 0 ? images[activeIdx - 1] : null;
      drawScene(
        ctx,
        activeScene,
        sceneProgress,
        images[activeIdx],
        totalElapsed,
        audioLevel,
        freqData,
        audioFrame,
        prevScene,
        prevImg,
        activeOffset
      );
      setProgress(totalDur > 0 ? totalElapsed / totalDur : 0);
      onSeek?.(totalElapsed);

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
  }, [scenesWithImages, drawScene, generateAllAudio, onSeek, pacingMode]);

  const stopPreview = useCallback(() => {
    playingRef.current = false;
    setIsPlaying(false);
    clipPoolRef.current.pauseAll();
    cancelAnimationFrame(animFrameRef.current);
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch {}
    }
    insertMixerRef.current?.stop();
    insertMixerRef.current = null;
  }, []);

  // ---------- DOWNLOAD THE PREVIEW ----------

  /** Filename stem from the project title */
  const fileStem = useCallback(() => {
    const base = (title || "scenering-preview")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    return base || "scenering-preview";
  }, [title]);

  const triggerDownload = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  /** Save the frame currently on the canvas as a PNG */
  const downloadFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `${fileStem()}-frame.png`);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }, "image/png");
  }, [fileStem]);

  /**
   * Record the preview exactly as it plays — the canvas is captured frame by
   * frame while the narration, music and intro/outro stingers are tapped off
   * the audio graph, so what you download is what you just watched.
   */
  const downloadPreviewVideo = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || isRecording) return;

    if (typeof MediaRecorder === "undefined") {
      setAudioStatus("Your browser cannot record the preview — use Render & Export instead");
      return;
    }

    // clear any previous capture
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    if (playingRef.current) stopPreview();

    // Start playback from the top; this also builds the audio graph, which is
    // what creates the recording destination node.
    await playPreview(0);

    const videoStream = canvas.captureStream(30);
    const tracks = [...videoStream.getVideoTracks()];
    const audioTracks = recordDestRef.current?.stream.getAudioTracks() ?? [];
    tracks.push(...audioTracks);
    const combined = new MediaStream(tracks);

    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    const mimeType = candidates.find((m) => MediaRecorder.isTypeSupported(m)) || "";

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(combined, mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : undefined);
    } catch {
      recorder = new MediaRecorder(combined);
    }

    recordedChunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(recordedChunksRef.current, { type });
      recordedChunksRef.current = [];
      const ext = type.includes("mp4") ? "mp4" : "webm";
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setDownloadName(`${fileStem()}.${ext}`);
      setDownloadSize(blob.size);
      setIsRecording(false);
      setAudioStatus("Preview captured — click Save Video to download");
      // hand it straight to the browser so one click is enough
      triggerDownload(url, `${fileStem()}.${ext}`);
    };

    // Playback reaching the end (or the user pressing stop) finishes the file
    onPlaybackEndRef.current = () => {
      onPlaybackEndRef.current = null;
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try { recorderRef.current.stop(); } catch {}
      }
    };

    recorderRef.current = recorder;
    setIsRecording(true);
    setAudioStatus("Recording the preview… it will download when playback finishes");
    try {
      recorder.start(1000);
    } catch {
      recorder.start();
    }
  }, [isRecording, downloadUrl, stopPreview, playPreview, fileStem]);

  /** Stop a capture early and keep whatever has been recorded so far */
  const finishRecordingEarly = useCallback(() => {
    onPlaybackEndRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch {}
    }
    stopPreview();
  }, [stopPreview]);

  const togglePlay = useCallback(() => {
    if (playingRef.current) {
      // stopping mid-capture still yields a usable file
      if (isRecording) finishRecordingEarly();
      else stopPreview();
    } else {
      playPreview();
    }
  }, [stopPreview, playPreview, isRecording, finishRecordingEarly]);

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
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try { recorderRef.current.stop(); } catch {}
      }
    };
  }, []);

  // release the captured file when it is replaced or the preview goes away
  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  if (scenesWithImages.length === 0) {
    return (
      <div className="bg-gray-800/50 border border-hairline rounded-xl p-8 text-center">
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
      <div className="bg-gray-800/50 border border-hairline rounded-xl overflow-hidden shadow-xl">
        {/* Canvas & Interactive Repositioning Layer */}
        <div className="relative group flex justify-center items-center bg-black/40">
          <canvas
            ref={canvasRef}
            width={aspectConfig.w}
            height={aspectConfig.h}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerCancel={handleCanvasPointerUp}
            className={`${aspectConfig.cssClass} bg-black cursor-crosshair`}
            style={{ touchAction: "none" }}
            title="Drag a badge to move it, or drag the corner handle to resize it"
          />

          {/* Hint Overlay when hovering canvas */}
          <div className="absolute bottom-2 right-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-black/75 backdrop-blur px-2.5 py-1 rounded-md text-[11px] text-gray-300 border border-hairline">
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
                className="mt-3 px-3 py-1 bg-gray-800 hover:bg-gray-700 border border-hairline text-xs text-gray-200 rounded-md transition-colors cursor-pointer"
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
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-hairline">
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

            {/* Download the preview: full capture, a still frame, or re-save */}
            <div className="flex items-center gap-2">
              {isRecording ? (
                <button
                  onClick={finishRecordingEarly}
                  className="px-3 py-2 bg-red-600 hover:bg-red-500 rounded-lg transition-colors text-white font-medium text-xs flex items-center gap-2 cursor-pointer"
                  title="Stop recording and download what has been captured so far"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                  <span>Stop & Save</span>
                </button>
              ) : (
                <button
                  onClick={downloadPreviewVideo}
                  disabled={anyAction || scenesWithImages.length === 0}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg transition-colors text-white font-medium text-xs flex items-center gap-2 cursor-pointer"
                  title="Play the preview through once and download it as a video file"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  <span>Download Preview</span>
                </button>
              )}

              <button
                onClick={downloadFrame}
                disabled={scenesWithImages.length === 0}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors text-gray-100 font-medium text-xs flex items-center gap-2 cursor-pointer"
                title="Save the frame currently showing as a PNG image"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16l5-5 4 4 3-3 6 6" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                </svg>
                <span>Save Frame</span>
              </button>

              {downloadUrl && !isRecording && (
                <a
                  href={downloadUrl}
                  download={downloadName}
                  className="px-3 py-2 bg-emerald-950/70 hover:bg-emerald-900/70 border border-emerald-700/60 rounded-lg transition-colors text-emerald-200 font-medium text-xs flex items-center gap-2 cursor-pointer"
                  title={`Download ${downloadName} again`}
                >
                  <span>💾</span>
                  <span>
                    Save Video
                    {downloadSize > 0 && (
                      <span className="text-emerald-400/70 font-mono ml-1">
                        ({(downloadSize / 1048576).toFixed(1)} MB)
                      </span>
                    )}
                  </span>
                </a>
              )}
            </div>
          </div>

          {isRecording && (
            <p className="text-[11px] text-emerald-300/80 text-center">
              Recording the preview in real time — keep this tab visible until playback finishes.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
