import { useState, useRef, useEffect, useCallback } from "react";
import type { Project, Scene, TimelineInsert, CustomerLogoConfig, CaptionsConfig, AspectRatioType, EditorStep, ResolutionType, PacingModeType } from "../types";
import { EDGE_FUNCTION_BASE } from "../lib/supabase";
import { createProjectZip } from "../lib/zip-download";
import {
  applySceneFilter,
  getMotionTransform,
  renderTimelineInsert,
} from "../lib/render-effects";
import { renderCanvasCaptions, DEFAULT_CAPTIONS_CONFIG } from "../lib/render-captions";
import { generateAttributionDocument } from "../data/media-library";
import { calculateDynamicDuration } from "../lib/duration-utils";
import { getCanvasFilterString } from "../data/filters-library";

export interface RenderSettings {
  format: "mp4" | "webm";
  resolution: "720p" | "1080p" | "2k" | "4k" | "shorts_9_16" | "square_1_1" | "4:3";
  fps: 30 | 60;
  quality: "standard" | "high" | "ultra";
  includeWatermark: boolean;
  watermarkOpacity: number;
  watermarkScale: number;
  includeSubtitles: boolean;
  subtitleStyle: "karaoke" | "normal";
  backgroundMusic: "none" | "lofi" | "cinematic" | "ambient" | "energetic";
  musicVolume: number;
  normalizeAudio: boolean;
}

interface RenderViewProps {
  project: Project | null;
  scenes: Scene[];
  inserts: TimelineInsert[];
  selectedVoice?: string;
  availableVoices?: { id: string; name: string }[];
  aspectRatio?: AspectRatioType;
  resolution?: ResolutionType;
  pacingMode?: PacingModeType;
  onNavigateToStep?: (step: EditorStep) => void;
  onBack?: () => void;
  customerLogo?: CustomerLogoConfig;
  captionsConfig?: CaptionsConfig;
  onUpdateCaptionsConfig?: (config: CaptionsConfig) => void;
  renderedBlob?: Blob | null;
  renderedUrl?: string | null;
  onRenderSuccess?: (blob: Blob, url: string) => void;
}

export function generateSrtSubtitles(scenes: Scene[]): string {
  const pad = (n: number, z = 2) => String(Math.floor(n)).padStart(z, "0");
  const formatSrtTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
  };

  let acc = 0;
  return scenes
    .filter((s) => s.image_url)
    .map((s, i) => {
      const start = acc;
      const end = acc + s.duration;
      acc = end;
      return `${i + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${s.text.trim()}\n`;
    })
    .join("\n");
}

export default function RenderView({
  project,
  scenes,
  inserts,
  selectedVoice = "guy",
  availableVoices = [],
  aspectRatio = "16:9",
  resolution: propResolution = "1080p",
  pacingMode = "auto_speech",
  onNavigateToStep,
  onBack,
  customerLogo,
  captionsConfig,
  onUpdateCaptionsConfig,
  renderedBlob: propRenderedBlob,
  renderedUrl: propRenderedUrl,
  onRenderSuccess,
}: RenderViewProps) {
  const scenesWithImages = scenes.filter((s) => s.image_url);
  const getSceneDuration = (s: Scene) => s.duration || calculateDynamicDuration(s.text, s.audio_duration);
  const totalDuration = scenesWithImages.reduce((sum, s) => sum + getSceneDuration(s), 0);

  // Render settings state
  const [settings, setSettings] = useState<RenderSettings>({
    format: "mp4",
    resolution: propResolution || "1080p",
    fps: 30,
    quality: "high",
    includeWatermark: true,
    watermarkOpacity: 1.0,
    watermarkScale: 1.0,
    includeSubtitles: captionsConfig?.enabled ?? true,
    subtitleStyle: captionsConfig?.mode ?? "karaoke",
    backgroundMusic: "lofi",
    musicVolume: 0.16,
    normalizeAudio: true,
  });

  // Render execution state
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStage, setRenderStage] = useState("");
  const [renderedBlob, setRenderedBlob] = useState<Blob | null>(propRenderedBlob || null);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(propRenderedUrl || null);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Sync with prop when returning to render tab
  useEffect(() => {
    if (propRenderedBlob) setRenderedBlob(propRenderedBlob);
    if (propRenderedUrl) setRenderedUrl(propRenderedUrl);
  }, [propRenderedBlob, propRenderedUrl]);

  // ZIP export state
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);
  const [zipStatus, setZipStatus] = useState("");

  // Attribution state - default collapsed ("do not open it yet")
  const [copiedAttribution, setCopiedAttribution] = useState(false);
  const [showAttributionPreview, setShowAttributionPreview] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const watermarkImgRef = useRef<HTMLImageElement | null>(null);
  const customerLogoImgRef = useRef<HTMLImageElement | null>(null);
  const abortControllerRef = useRef<boolean>(false);

  // Pre-load watermark logo image
  useEffect(() => {
    const img = new Image();
    img.src = "/scenering-logo.png";
    img.onload = () => {
      watermarkImgRef.current = img;
    };
  }, []);

  // Pre-load customer logo image cleanly using safe proxy to prevent canvas tainting
  useEffect(() => {
    const logoUrl = customerLogo?.url;
    if (logoUrl) {
      loadImage(logoUrl, 6000).then((img) => {
        customerLogoImgRef.current = img;
      });
    } else {
      customerLogoImgRef.current = null;
    }
  }, [customerLogo?.url]);

  // Resolution dimensions helper supporting resolution settings and aspect ratio
  const getDimensions = (resOrRatio?: RenderSettings["resolution"] | AspectRatioType) => {
    const targetRes = (resOrRatio === "720p" || resOrRatio === "1080p" || resOrRatio === "2k" || resOrRatio === "4k")
      ? resOrRatio
      : (settings?.resolution === "720p" || settings?.resolution === "2k" || settings?.resolution === "4k" ? settings.resolution : (propResolution || "1080p"));
    const currentRatio = aspectRatio || "16:9";

    if (resOrRatio === "shorts_9_16" || resOrRatio === "9:16" || (!resOrRatio && currentRatio === "9:16") || currentRatio === "9:16") {
      if (targetRes === "720p") return { width: 720, height: 1280, label: "720 × 1280 (720p HD)", aspectClass: "aspect-[9/16] max-h-[520px]" };
      if (targetRes === "2k") return { width: 1440, height: 2560, label: "1440 × 2560 (2K QHD)", aspectClass: "aspect-[9/16] max-h-[520px]" };
      if (targetRes === "4k") return { width: 2160, height: 3840, label: "2160 × 3840 (4K UHD)", aspectClass: "aspect-[9/16] max-h-[520px]" };
      return { width: 1080, height: 1920, label: "1080 × 1920 (1080p Full HD)", aspectClass: "aspect-[9/16] max-h-[520px]" };
    }
    if (resOrRatio === "square_1_1" || resOrRatio === "1:1" || (!resOrRatio && currentRatio === "1:1") || currentRatio === "1:1") {
      if (targetRes === "720p") return { width: 720, height: 720, label: "720 × 720 (720p HD)", aspectClass: "aspect-square max-h-[520px]" };
      if (targetRes === "2k") return { width: 1440, height: 1440, label: "1440 × 1440 (2K QHD)", aspectClass: "aspect-square max-h-[520px]" };
      if (targetRes === "4k") return { width: 2160, height: 2160, label: "2160 × 2160 (4K UHD)", aspectClass: "aspect-square max-h-[520px]" };
      return { width: 1080, height: 1080, label: "1080 × 1080 (1080p Full HD)", aspectClass: "aspect-square max-h-[520px]" };
    }
    if (resOrRatio === "4:3" || (!resOrRatio && currentRatio === "4:3") || currentRatio === "4:3") {
      if (targetRes === "720p") return { width: 960, height: 720, label: "960 × 720 (720p HD)", aspectClass: "aspect-[4/3] max-h-[520px]" };
      if (targetRes === "2k") return { width: 1920, height: 1440, label: "1920 × 1440 (2K QHD)", aspectClass: "aspect-[4/3] max-h-[520px]" };
      if (targetRes === "4k") return { width: 2880, height: 2160, label: "2880 × 2160 (4K UHD)", aspectClass: "aspect-[4/3] max-h-[520px]" };
      return { width: 1440, height: 1080, label: "1440 × 1080 (1080p Full HD)", aspectClass: "aspect-[4/3] max-h-[520px]" };
    }

    // Default 16:9
    if (targetRes === "720p") return { width: 1280, height: 720, label: "1280 × 720 (720p HD)", aspectClass: "aspect-video" };
    if (targetRes === "2k") return { width: 2560, height: 1440, label: "2560 × 1440 (2K QHD)", aspectClass: "aspect-video" };
    if (targetRes === "4k") return { width: 3840, height: 2160, label: "3840 × 2160 (4K UHD)", aspectClass: "aspect-video" };
    return { width: 1920, height: 1080, label: "1920 × 1080 (1080p Full HD)", aspectClass: "aspect-video" };
  };

  // Safe image URL resolver - routes external images through server proxy to ensure clean CORS & prevent canvas tainting
  const getSafeImageUrl = (url: string): string => {
    if (!url) return "";
    if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("/")) {
      return url;
    }
    return `/api/proxy-image?url=${encodeURIComponent(url)}`;
  };

  // Image preloader helper with timeout and proxy fallback
  const loadImage = (url: string, timeoutMs: number = 8000): Promise<HTMLImageElement | null> => {
    return new Promise((resolve) => {
      if (!url) return resolve(null);
      const safeUrl = getSafeImageUrl(url);
      const img = new Image();
      if (!safeUrl.startsWith("data:") && !safeUrl.startsWith("blob:")) {
        img.crossOrigin = "anonymous";
      }
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }, timeoutMs);

      img.onload = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(img);
        }
      };

      img.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          // If safeUrl wasn't proxied yet, try proxy once
          if (!safeUrl.startsWith("/api/proxy-image") && !safeUrl.startsWith("data:") && !safeUrl.startsWith("blob:")) {
            const proxyImg = new Image();
            proxyImg.crossOrigin = "anonymous";
            proxyImg.onload = () => resolve(proxyImg);
            proxyImg.onerror = () => resolve(null);
            proxyImg.src = `/api/proxy-image?url=${encodeURIComponent(url)}`;
          } else {
            resolve(null);
          }
        }
      };

      img.src = safeUrl;
    });
  };

  // Synthesize ambient music loop using Web Audio API (fast 3-second seamless loop to avoid UI thread blocking)
  const createAmbientMusicNode = (
    ctx: AudioContext,
    style: RenderSettings["backgroundMusic"],
    _duration: number,
    volume: number
  ): AudioNode | null => {
    if (style === "none" || volume <= 0) return null;

    try {
      const sampleRate = ctx.sampleRate || 44100;
      const loopSec = 3.0; // 3 seconds loop is seamless and generates in under 5ms
      const buffer = ctx.createBuffer(2, Math.round(sampleRate * loopSec), sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      // Chords based on mood style
      let baseFreqs = [261.63, 329.63, 392.0, 523.25]; // C major
      if (style === "lofi") {
        baseFreqs = [220.0, 261.63, 329.63, 392.0]; // Am7
      } else if (style === "cinematic") {
        baseFreqs = [174.61, 220.0, 261.63, 349.23]; // Fmaj7 low
      } else if (style === "energetic") {
        baseFreqs = [293.66, 369.99, 440.0, 587.33]; // D major
      }

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        let sample = 0;
        for (let b = 0; b < baseFreqs.length; b++) {
          const freq = baseFreqs[b];
          const osc = Math.sin(2 * Math.PI * freq * t);
          const sub = Math.sin(Math.PI * (freq / 2) * t) * 0.4;
          const slowLfo = 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.33 * t + b);
          sample += (osc + sub) * 0.15 * slowLfo;
        }

        // Soft stereo spread
        left[i] = sample * (0.8 + 0.2 * Math.sin(t * 1.5));
        right[i] = sample * (0.8 + 0.2 * Math.cos(t * 1.5));
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const gain = ctx.createGain();
      gain.gain.value = volume;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = style === "lofi" ? 900 : style === "ambient" ? 1400 : 2500;

      source.connect(filter);
      filter.connect(gain);
      source.start();

      return gain;
    } catch {
      return null;
    }
  };

  // Helper to ensure scene duration matches speech narration with zero dead silence
  const getEffectiveSceneDuration = (scene: Scene, audioBufDuration?: number): number => {
    if (audioBufDuration && audioBufDuration > 0.3) {
      return Math.round((audioBufDuration + 0.1) * 10) / 10;
    }
    return calculateDynamicDuration(scene.text, scene.audio_duration);
  };

  // ------ RENDER VIDEO HANDLER ------
  const handleStartRender = async () => {
    if (scenesWithImages.length === 0 || isRendering) return;

    setIsRendering(true);
    setRenderProgress(0);
    setRenderError(null);
    abortControllerRef.current = false;

    const { width, height } = getDimensions(settings.resolution);
    const canvas = canvasRef.current;
    if (!canvas) {
      setRenderError("Canvas element not available");
      setIsRendering(false);
      return;
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setRenderError("2D Context unavailable");
      setIsRendering(false);
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      setRenderError("Your browser does not support in-browser video recording.");
      setIsRendering(false);
      return;
    }

    try {
      // 1. Synthesizing audio & sound effects
      setRenderStage("1/4: Synthesizing narration voices & sound effects...");
      setRenderProgress(0.08);

      const audioCtx = new AudioContext();
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      const audioBuffers = new Map<number, { buffer: AudioBuffer; duration: number }>();
      for (let i = 0; i < scenesWithImages.length; i++) {
        if (abortControllerRef.current) throw new Error("Render cancelled");
        const s = scenesWithImages[i];
        const sceneVoice = s.voice_id || selectedVoice;

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);
          const res = await fetch(`${EDGE_FUNCTION_BASE}/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: s.text, voice: sceneVoice }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (res.ok) {
            const arrayBuf = await res.arrayBuffer();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
            audioBuffers.set(s.id, { buffer: audioBuffer, duration: audioBuffer.duration });
          } else {
            throw new Error(`TTS status ${res.status}`);
          }
        } catch (e) {
          console.warn(`TTS generation fallback for scene ${i + 1}:`, e);
          const sampleRate = audioCtx.sampleRate || 44100;
          const fallbackDur = getEffectiveSceneDuration(s);
          const numSamples = Math.max(1, Math.floor(sampleRate * fallbackDur));
          const fallbackBuf = audioCtx.createBuffer(1, numSamples, sampleRate);
          audioBuffers.set(s.id, { buffer: fallbackBuf, duration: fallbackDur });
        }

        setRenderProgress(0.08 + (i / scenesWithImages.length) * 0.18);
      }

      // 2. Loading High-Resolution Visual Assets & Watermark
      setRenderStage("2/4: Loading high-resolution visuals & watermark...");
      setRenderProgress(0.28);

      const images = await Promise.all(
        scenesWithImages.map((s) => loadImage(s.image_url || ""))
      );

      // Watermark image
      if (!watermarkImgRef.current) {
        const wm = await loadImage("/scenering-logo.png");
        if (wm) watermarkImgRef.current = wm;
      }

      // Preload customer brand logo if enabled to ensure it is decoded and ready
      if (customerLogo?.enabled && customerLogo.url) {
        try {
          const cLogo = await loadImage(customerLogo.url);
          if (cLogo) {
            customerLogoImgRef.current = cLogo;
          }
        } catch (logoErr) {
          console.warn("Notice: Customer logo preload issue:", logoErr);
        }
      }

      // Ensure AudioContext is active and running
      if (audioCtx.state === "suspended") {
        try {
          await audioCtx.resume();
        } catch (resumeErr) {
          console.warn("AudioContext resume warning:", resumeErr);
        }
      }

      // Setup audio destination mixer
      const dest = audioCtx.createMediaStreamDestination();

      // Inaudible continuous carrier tone to guarantee AudioContext destination stream clock never stalls in Chrome/Safari
      try {
        const carrierOsc = audioCtx.createOscillator();
        const carrierGain = audioCtx.createGain();
        carrierGain.gain.value = 0.00001; // inaudible
        carrierOsc.connect(carrierGain);
        carrierGain.connect(dest);
        carrierOsc.start();
      } catch (carrierErr) {
        console.warn("Carrier oscillator warning:", carrierErr);
      }

      // Ambient background music node
      if (settings.backgroundMusic !== "none" && settings.musicVolume > 0) {
        const ambientGain = createAmbientMusicNode(
          audioCtx,
          settings.backgroundMusic,
          totalDuration + 5,
          settings.musicVolume
        );
        if (ambientGain) {
          ambientGain.connect(dest);
        }
      }

      // Paint initial background on canvas so captureStream receives valid dimensions & non-empty buffer immediately
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);

      // Video recording stream
      let videoStream: MediaStream;
      try {
        videoStream = canvas.captureStream(settings.fps);
      } catch {
        videoStream = (canvas as any).captureStream ? (canvas as any).captureStream() : (canvas as any).mozCaptureStream();
      }

      // Combine video and audio tracks safely
      const audioTracks = dest.stream.getAudioTracks();
      const videoTracks = videoStream.getVideoTracks();
      let combinedStream: MediaStream;
      if (audioTracks.length > 0 && videoTracks.length > 0) {
        combinedStream = new MediaStream([...videoTracks, ...audioTracks]);
      } else {
        combinedStream = videoStream;
      }

      // Select reliable recording MIME type: WebM VP9/VP8 with Opus audio is 100% stable
      // across all browsers with WebAudio streams, whereas native MP4 recorder in Chromium fails with Opus
      let mimeType = "";
      if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) {
        mimeType = "video/webm;codecs=vp9,opus";
      } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")) {
        mimeType = "video/webm;codecs=vp8,opus";
      } else if (MediaRecorder.isTypeSupported("video/webm")) {
        mimeType = "video/webm";
      } else if (MediaRecorder.isTypeSupported("video/mp4;codecs=avc1,mp4a.40.2")) {
        mimeType = "video/mp4;codecs=avc1,mp4a.40.2";
      } else if (MediaRecorder.isTypeSupported("video/mp4")) {
        mimeType = "video/mp4";
      }

      const bitrateMap = {
        standard: 4000000,
        high: 8000000,
        ultra: 12000000,
      };

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(combinedStream, {
          ...(mimeType ? { mimeType } : {}),
          videoBitsPerSecond: bitrateMap[settings.quality] || 8000000,
        });
      } catch (recErr) {
        console.warn("MediaRecorder creation with mimeType failed, falling back to default:", recErr);
        try {
          recorder = new MediaRecorder(combinedStream);
        } catch (streamErr) {
          console.warn("MediaRecorder with combinedStream failed, falling back to video-only stream:", streamErr);
          recorder = new MediaRecorder(videoStream);
        }
      }

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onerror = (e: any) => {
        console.error("MediaRecorder runtime error:", e);
      };

      // 3. Render frames & play audio in real time
      setRenderStage(`3/4: Rendering Scene 1 of ${scenesWithImages.length}...`);
      setRenderProgress(0.35);

      const videoPromise = new Promise<Blob>((resolve) => {
        let isResolved = false;
        const finalizeBlob = () => {
          if (isResolved) return;
          isResolved = true;
          const outputMime = recorder.mimeType || mimeType || "video/webm";
          const blob = new Blob(chunks, { type: outputMime });
          resolve(blob);
        };

        recorder.onstop = finalizeBlob;
        recorder.onerror = (e) => {
          console.error("MediaRecorder error event:", e);
          if (!isResolved) {
            finalizeBlob();
          }
        };

        // Safety fallback timer so videoPromise never hangs forever
        setTimeout(() => {
          if (!isResolved) {
            console.warn("Video render safety timer completed");
            finalizeBlob();
          }
        }, Math.max(15, totalDuration + 15) * 1000);
      });

      try {
        recorder.start(100);
      } catch (recStartErr) {
        console.warn("MediaRecorder start with timeslice failed, trying start():", recStartErr);
        try {
          recorder.start();
        } catch (recFatal) {
          console.error("MediaRecorder start error:", recFatal);
        }
      }

      let currentSceneIdx = 0;
      let sceneStartTime = performance.now();
      let activeAudioSource: AudioBufferSourceNode | null = null;
      let lastProgressUiUpdate = 0;
      let lastProgressVal = 0.35;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.connect(dest);
      // NOTE: Quiet rendering - deliberately DO NOT connect analyser to audioCtx.destination!

      const playSceneAudio = (idx: number) => {
        if (activeAudioSource) {
          try {
            activeAudioSource.stop();
          } catch {}
        }
        const sc = scenesWithImages[idx];
        if (!sc) return;
        const item = audioBuffers.get(sc.id);
        if (item) {
          try {
            const source = audioCtx.createBufferSource();
            source.buffer = item.buffer;
            source.connect(analyser);
            source.start();
            activeAudioSource = source;
          } catch (audioErr) {
            console.warn("Error playing scene audio:", audioErr);
          }
        }
      };

      const introInsert = inserts?.find((ins) => ins.category === "intro");
      const outroInsert = inserts?.find((ins) => ins.category === "outro");
      const introDuration = introInsert ? introInsert.duration : 0;
      const outroDuration = outroInsert ? outroInsert.duration : 0;

      const scriptTotalDuration = Math.max(1, scenesWithImages.reduce((sum, s) => {
        const aud = audioBuffers.get(s.id);
        return sum + Math.max(1, getEffectiveSceneDuration(s, aud?.duration));
      }, 0));

      const estimatedTotalDuration = Math.max(1, introDuration + scriptTotalDuration + outroDuration);

      let renderPhase: "intro" | "scenes" | "outro" = introInsert ? "intro" : "scenes";
      let phaseStartTime = performance.now();

      // Only start scene voiceover audio if we are starting directly in scenes phase
      if (renderPhase === "scenes") {
        playSceneAudio(0);
      }

      // Frame drawing loop with robust error boundaries and background tab resilience
      await new Promise<void>((resolveLoop) => {
        let isLoopFinished = false;
        let backgroundTimerId: any = null;

        const cleanupAndFinish = () => {
          if (isLoopFinished) return;
          isLoopFinished = true;
          if (backgroundTimerId) clearTimeout(backgroundTimerId);
          try {
            if (recorder && recorder.state !== "inactive") {
              recorder.stop();
            }
          } catch (e) {
            console.warn("Recorder stop notice:", e);
          }
          resolveLoop();
        };

        const scheduleNextFrame = () => {
          if (isLoopFinished) return;
          const animId = requestAnimationFrame(renderFrame);
          // Backup timer so if user switches tabs and requestAnimationFrame throttles, the render never freezes
          if (backgroundTimerId) clearTimeout(backgroundTimerId);
          backgroundTimerId = setTimeout(() => {
            cancelAnimationFrame(animId);
            renderFrame();
          }, 80);
        };

        const renderFrame = () => {
          if (isLoopFinished) return;
          if (backgroundTimerId) {
            clearTimeout(backgroundTimerId);
            backgroundTimerId = null;
          }

          if (abortControllerRef.current) {
            cleanupAndFinish();
            return;
          }

          try {
            const now = performance.now();

            // ==========================================
            // PHASE 1: INTRO SEGMENT (Full screen insert, NO captions, NO speech voice)
            // ==========================================
            if (renderPhase === "intro" && introInsert) {
              const elapsedInIntro = Math.max(0, (now - phaseStartTime) / 1000);
              const currentGlobalTime = elapsedInIntro;
              const progressInIntro = Math.min(1, elapsedInIntro / Math.max(0.1, introDuration));

              const rawProgress = 0.35 + (currentGlobalTime / estimatedTotalDuration) * 0.55;
              const clampedProgress = Math.min(0.92, Math.max(0.35, isNaN(rawProgress) ? 0.35 : rawProgress));

              if (now - lastProgressUiUpdate > 250 || Math.abs(clampedProgress - lastProgressVal) >= 0.01) {
                lastProgressUiUpdate = now;
                lastProgressVal = clampedProgress;
                setRenderProgress(clampedProgress);
                setRenderStage(
                  `3/4: Rendering Intro Scene (${Math.round(elapsedInIntro)}s / ${Math.round(introDuration)}s)`
                );
              }

              // Draw canvas background
              ctx.fillStyle = "#000";
              ctx.fillRect(0, 0, width, height);

              // Render Intro full screen (video or image with its own clip sound)
              try {
                renderTimelineInsert(ctx, introInsert, currentGlobalTime, width, height, 0.4, null);
              } catch (e) {
                console.warn("Intro insert render notice:", e);
              }

              // Render active overlay inserts in intro (excluding intro/outro cards)
              if (inserts && inserts.length > 0) {
                inserts
                  .filter((i) => i.category !== "intro" && i.category !== "outro")
                  .forEach((ins) => {
                    try {
                      renderTimelineInsert(ctx, ins, currentGlobalTime, width, height, 0.4, null);
                    } catch {}
                  });
              }

              // Strictly NO captions or speech voiceover in this section per user mandate

              if (progressInIntro >= 1) {
                renderPhase = "scenes";
                currentSceneIdx = 0;
                sceneStartTime = performance.now();
                playSceneAudio(0);
              }

              scheduleNextFrame();
              return;
            }

            // ==========================================
            // PHASE 3: OUTRO SEGMENT (Full screen insert, NO captions, NO speech voice)
            // ==========================================
            if (renderPhase === "outro" && outroInsert) {
              const elapsedInOutro = Math.max(0, (now - phaseStartTime) / 1000);
              const currentGlobalTime = introDuration + scriptTotalDuration + elapsedInOutro;
              const progressInOutro = Math.min(1, elapsedInOutro / Math.max(0.1, outroDuration));

              const rawProgress = 0.35 + (currentGlobalTime / estimatedTotalDuration) * 0.55;
              const clampedProgress = Math.min(0.92, Math.max(0.35, isNaN(rawProgress) ? 0.35 : rawProgress));

              if (now - lastProgressUiUpdate > 250 || Math.abs(clampedProgress - lastProgressVal) >= 0.01) {
                lastProgressUiUpdate = now;
                lastProgressVal = clampedProgress;
                setRenderProgress(clampedProgress);
                setRenderStage(
                  `3/4: Rendering Outro Scene (${Math.round(elapsedInOutro)}s / ${Math.round(outroDuration)}s)`
                );
              }

              // Draw canvas background
              ctx.fillStyle = "#000";
              ctx.fillRect(0, 0, width, height);

              // Render Outro full screen (video or image with its own clip sound)
              try {
                renderTimelineInsert(ctx, outroInsert, currentGlobalTime, width, height, 0.4, null);
              } catch (e) {
                console.warn("Outro insert render notice:", e);
              }

              // Render active overlay inserts in outro (excluding intro/outro cards)
              if (inserts && inserts.length > 0) {
                inserts
                  .filter((i) => i.category !== "intro" && i.category !== "outro")
                  .forEach((ins) => {
                    try {
                      renderTimelineInsert(ctx, ins, currentGlobalTime, width, height, 0.4, null);
                    } catch {}
                  });
              }

              // Strictly NO captions or speech voiceover in this section per user mandate

              if (progressInOutro >= 1) {
                cleanupAndFinish();
                return;
              }

              scheduleNextFrame();
              return;
            }

            // ==========================================
            // PHASE 2: SCRIPT SCENES
            // ==========================================
            const elapsedInScene = Math.max(0, (now - sceneStartTime) / 1000);
            const currentScene = scenesWithImages[currentSceneIdx];

            if (!currentScene) {
              if (outroInsert) {
                renderPhase = "outro";
                phaseStartTime = performance.now();
                if (activeAudioSource) {
                  try {
                    activeAudioSource.stop();
                  } catch {}
                  activeAudioSource = null;
                }
                scheduleNextFrame();
                return;
              }
              cleanupAndFinish();
              return;
            }

            const sceneAudio = audioBuffers.get(currentScene.id);
            const sceneDuration = Math.max(1, getEffectiveSceneDuration(currentScene, sceneAudio?.duration));

            const progressInScene = Math.min(1, elapsedInScene / sceneDuration);

            // Calculate overall progress based on voiceover speech pacing + intro duration
            const completedScenesDuration = scenesWithImages
              .slice(0, currentSceneIdx)
              .reduce((sum, s) => {
                const aud = audioBuffers.get(s.id);
                return sum + Math.max(1, getEffectiveSceneDuration(s, aud?.duration));
              }, 0);
            const currentGlobalTime = introDuration + completedScenesDuration + elapsedInScene;

            const rawProgress = 0.35 + (currentGlobalTime / estimatedTotalDuration) * 0.55;
            const clampedProgress = Math.min(0.92, Math.max(0.35, isNaN(rawProgress) ? 0.35 : rawProgress));

            // Throttle React UI updates to 4 times per second to prevent thread starvation
            if (now - lastProgressUiUpdate > 250 || Math.abs(clampedProgress - lastProgressVal) >= 0.01) {
              lastProgressUiUpdate = now;
              lastProgressVal = clampedProgress;
              setRenderProgress(clampedProgress);
              setRenderStage(
                `3/4: Rendering Scene ${currentSceneIdx + 1} of ${scenesWithImages.length} (${Math.round(currentGlobalTime)}s / ${Math.round(estimatedTotalDuration)}s)`
              );
            }

            // --- Draw background ---
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, width, height);

            // --- Draw image with Camera Motion ---
            const img = images[currentSceneIdx];
            if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
              const { scale, dx, dy } = getMotionTransform(
                currentScene.motion_effect,
                progressInScene,
                width,
                height
              );
              const safeScale = isNaN(scale) ? 1 : scale;
              const sw = width * safeScale;
              const sh = height * safeScale;
              const safeDx = isNaN(dx) ? 0 : dx;
              const safeDy = isNaN(dy) ? 0 : dy;

              // Apply authentic photographic color grade to frame canvas
              const canvasFilter = getCanvasFilterString(currentScene.filter);
              if (canvasFilter && canvasFilter !== "none") {
                try {
                  ctx.filter = canvasFilter;
                } catch {
                  ctx.filter = "none";
                }
              }

              try {
                ctx.drawImage(img, safeDx, safeDy, sw, sh);
              } catch (drawErr) {
                console.warn("Scene draw notice:", drawErr);
              }

              try {
                ctx.filter = "none";
              } catch {}
            }

            // --- Apply Visual Filter Overlays (scratches, dust bokeh, flares, CRT scanlines) ---
            try {
              applySceneFilter(ctx, currentScene.filter, width, height, elapsedInScene);
            } catch (filterErr) {
              console.warn("Scene filter notice:", filterErr);
            }

            // --- Crisp Logo Watermark in Top-Left Corner (Permanent & Stands Out) ---
            if (
              settings.includeWatermark &&
              watermarkImgRef.current &&
              watermarkImgRef.current.naturalWidth > 0 &&
              watermarkImgRef.current.naturalHeight > 0
            ) {
              ctx.save();
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = "high";

              const scaleRatio = width / 1280;
              const wmScale = Math.max(0.4, Math.min(2.0, settings.watermarkScale ?? 1.0));
              const wmOpacity = Math.max(0.1, Math.min(1.0, settings.watermarkOpacity ?? 1.0));
              ctx.globalAlpha = wmOpacity;

              const wmWidth = Math.max(20, Math.round(200 * wmScale * scaleRatio));
              const wmHeight = Math.max(10, Math.round((wmWidth * watermarkImgRef.current.naturalHeight) / Math.max(1, watermarkImgRef.current.naturalWidth)));
              const posX = Math.round(24 * scaleRatio);
              const posY = Math.round(20 * scaleRatio);
              const padX = Math.round(10 * scaleRatio);
              const padY = Math.round(6 * scaleRatio);
              const rad = Math.round(10 * scaleRatio);

              // Protective high-contrast backing pill
              ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
              ctx.shadowBlur = 10 * scaleRatio;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 2 * scaleRatio;
              ctx.fillStyle = "rgba(10, 12, 22, 0.78)";
              ctx.beginPath();
              if (typeof ctx.roundRect === "function") {
                ctx.roundRect(posX - padX, posY - padY, wmWidth + padX * 2, wmHeight + padY * 2, rad);
              } else {
                ctx.rect(posX - padX, posY - padY, wmWidth + padX * 2, wmHeight + padY * 2);
              }
              ctx.fill();

              ctx.shadowColor = "transparent";
              ctx.shadowBlur = 0;
              ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
              ctx.lineWidth = Math.max(1, 1 * scaleRatio);
              ctx.stroke();

              // Draw crisp watermark logo
              try {
                ctx.drawImage(watermarkImgRef.current, posX, posY, wmWidth, wmHeight);
              } catch (wmDrawErr) {
                console.warn("Watermark draw notice:", wmDrawErr);
              }
              ctx.restore();
            }

            // --- Customer Brand Logo in Top-Right Corner (if enabled) ---
            if (
              customerLogo?.enabled &&
              customerLogo.url &&
              customerLogoImgRef.current &&
              customerLogoImgRef.current.naturalWidth > 0 &&
              customerLogoImgRef.current.naturalHeight > 0
            ) {
              ctx.save();
              const logoOpacity = Math.max(0.1, Math.min(1.0, customerLogo.opacity ?? 1.0));
              ctx.globalAlpha = logoOpacity;
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = "high";

              const scaleRatio = width / 1280;
              const cScale = Math.max(0.2, Math.min(3.0, customerLogo.scale ?? 1.0));
              const cMarginX = (customerLogo.margin ?? 20) * scaleRatio;
              const cMarginY = (customerLogo.margin ?? 20) * (height / 720);
              // Base width 200 matches VideoPreview.tsx and CustomerLogoSection with 1:1 parity
              const cWidth = Math.max(20, Math.round(200 * cScale * scaleRatio));
              const cHeight = Math.max(10, Math.round((cWidth * customerLogoImgRef.current.naturalHeight) / Math.max(1, customerLogoImgRef.current.naturalWidth)));
              const cX = Math.max(0, width - cWidth - cMarginX);
              const cY = Math.max(0, cMarginY);

              // Transparent customer logo with soft drop shadow - NO bounding box or border
              ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
              ctx.shadowBlur = 8 * scaleRatio;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 2 * scaleRatio;

              try {
                ctx.drawImage(customerLogoImgRef.current, cX, cY, cWidth, cHeight);
              } catch (logoDrawErr) {
                console.warn("Logo draw notice:", logoDrawErr);
              }
              ctx.restore();
            }

            // --- Subtitle & Caption Rendering ---
            if (settings.includeSubtitles && currentScene.text) {
              try {
                const activeCaptionsConfig: CaptionsConfig = captionsConfig || {
                  enabled: true,
                  mode: settings.subtitleStyle === "normal" ? "normal" : "karaoke",
                  backgroundStyle: "blocked",
                  preset: "word_pop",
                  fontSize: "medium",
                  position: "bottom",
                  uppercase: true,
                  textColor: "#ffffff",
                  highlightColor: "#facc15",
                  bgColor: "rgba(0, 0, 0, 0.75)",
                };

                renderCanvasCaptions(
                  ctx,
                  currentScene.text,
                  progressInScene,
                  activeCaptionsConfig,
                  width,
                  height
                );
              } catch (capErr) {
                console.warn("Captions render notice:", capErr);
              }
            }

            // --- Timeline Inserts & Overlays ---
            if (inserts && inserts.length > 0) {
              try {
                let audioLevel = 0.4;
                let freqData: Uint8Array | null = null;
                if (analyser) {
                  const data = new Uint8Array(analyser.frequencyBinCount);
                  analyser.getByteFrequencyData(data);
                  let sum = 0;
                  for (let i = 0; i < data.length; i++) sum += data[i];
                  audioLevel = sum / (data.length * 255);
                  freqData = data;
                }

                inserts.forEach((insert) => {
                  try {
                    renderTimelineInsert(ctx, insert, currentGlobalTime, width, height, audioLevel, freqData);
                  } catch (insErr) {
                    console.warn("Insert notice:", insErr);
                  }
                });
              } catch (insertsErr) {
                console.warn("Timeline inserts notice:", insertsErr);
              }
            }

            // Check if current scene is finished
            if (progressInScene >= 1) {
              currentSceneIdx++;
              if (currentSceneIdx >= scenesWithImages.length) {
                if (outroInsert) {
                  renderPhase = "outro";
                  phaseStartTime = performance.now();
                  if (activeAudioSource) {
                    try {
                      activeAudioSource.stop();
                    } catch {}
                    activeAudioSource = null;
                  }
                } else {
                  cleanupAndFinish();
                  return;
                }
              } else {
                sceneStartTime = performance.now();
                playSceneAudio(currentSceneIdx);
              }
            }

            scheduleNextFrame();
          } catch (frameErr) {
            console.error("Frame render recoverable error:", frameErr);
            // Recover and keep loop alive so render never freezes at 35%
            scheduleNextFrame();
          }
        };

        scheduleNextFrame();
      });

      // 4. Encoding stream & packaging
      setRenderStage("4/4: Finalizing video stream & container...");
      setRenderProgress(0.95);

      const finalBlob = await videoPromise;
      if (activeAudioSource) {
        try {
          (activeAudioSource as any).stop();
        } catch {}
      }

      const url = URL.createObjectURL(finalBlob);
      setRenderedBlob(finalBlob);
      setRenderedUrl(url);
      setRenderProgress(1);
      setRenderStage("Render Complete! 🎉");
      onRenderSuccess?.(finalBlob, url);
    } catch (err: any) {
      console.error("Render failed:", err);
      setRenderError(err.message || "Failed to render video");
    } finally {
      setIsRendering(false);
    }
  };

  // ------ DOWNLOAD HANDLERS ------
  const downloadVideo = () => {
    if (!renderedBlob || !renderedUrl) return;
    const a = document.createElement("a");
    a.href = renderedUrl;
    const safeTitle = (project?.title || "scenering_video").replace(/[^a-zA-Z0-9]/g, "_");
    const ext = settings.format === "mp4" ? "mp4" : "webm";
    a.download = `${safeTitle}_${settings.resolution}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadSrtSubtitles = () => {
    const srtText = generateSrtSubtitles(scenes);
    const blob = new Blob([srtText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeTitle = (project?.title || "scenering").replace(/[^a-zA-Z0-9]/g, "_");
    a.download = `${safeTitle}_subtitles.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const getAttributionText = () => {
    const soundUrlsUsed = inserts
      .map((ins) => ins.audioSettings?.soundUrl)
      .filter((u): u is string => Boolean(u));

    const currentVoice = availableVoices?.find((v) => v.id === selectedVoice);
    const voiceDisplay = currentVoice ? currentVoice.name : (selectedVoice || "Studio AI Voice");
    const isBrowserVoice = selectedVoice?.startsWith("browser:");
    const isMale =
      (selectedVoice || "").toLowerCase().includes("guy") ||
      (selectedVoice || "").toLowerCase().includes("christopher") ||
      (selectedVoice || "").toLowerCase().includes("ryan") ||
      (selectedVoice || "").toLowerCase().includes("william") ||
      (selectedVoice || "").toLowerCase().includes("brian") ||
      (selectedVoice || "").toLowerCase().includes("david") ||
      (selectedVoice || "").toLowerCase().includes("mark") ||
      (selectedVoice || "").toLowerCase().includes("male");

    const isCustomImport = selectedVoice?.startsWith("custom:") || selectedVoice?.startsWith("import:");

    return generateAttributionDocument({
      projectTitle: project?.title || "My Video Project",
      soundsUsed: soundUrlsUsed,
      includeBackgroundMusic: settings.backgroundMusic !== "none",
      musicType: settings.backgroundMusic,
      imageSources: ["Pexels (CC0 / Free License)", "Pixabay (Content License)"],
      voiceName: voiceDisplay,
      voiceGender: isCustomImport ? "User Prepared Voice" : isMale ? "Male Narrator" : "Female Narrator",
      voiceAccent: isCustomImport
        ? "Custom Imported TTS Audio File"
        : isBrowserVoice
        ? "Browser / Web Speech Voice"
        : "Natural Neural Voice Profile",
      voiceEngine: isCustomImport
        ? "User-Prepared Custom TTS Audio File (Imported Track)"
        : isBrowserVoice
        ? "W3C Web Speech API Standards"
        : "Natural Human Neural Speech Engine (Free Attribution Cleared License)",
    });
  };

  const copyAttributionDoc = async () => {
    const text = getAttributionText();
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAttribution(true);
      setTimeout(() => setCopiedAttribution(false), 3000);
    } catch (err) {
      console.error("Clipboard copy error:", err);
    }
  };

  const downloadAttributionDoc = () => {
    const text = getAttributionText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeTitle = (project?.title || "video").replace(/[^a-zA-Z0-9]/g, "_");
    a.download = `${safeTitle}_attribution_credits.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const downloadFullPackageZip = async () => {
    if (isZipping || !project) return;
    setIsZipping(true);
    setZipProgress(0);
    setZipStatus("Preparing project package...");

    try {
      await createProjectZip({
        title: project.title || "Scenering Project",
        scenes,
        voice: selectedVoice,
        includeVideo: Boolean(renderedBlob),
        videoBlob: renderedBlob,
        onProgress: (status, pct) => {
          setZipStatus(status);
          setZipProgress(pct);
        },
      });
      setZipStatus("Package downloaded successfully!");
    } catch (err) {
      console.error("ZIP package export failed:", err);
      setZipStatus("Failed to create ZIP package");
    } finally {
      setIsZipping(false);
    }
  };

  const cancelRender = () => {
    abortControllerRef.current = true;
    setIsRendering(false);
    setRenderStage("Render cancelled");
  };

  const { width: renderW, height: renderH, label: resLabel, aspectClass } = getDimensions(settings.resolution);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-fade-in">
      {/* Top Banner & Summary */}
      <div className="bg-gray-800/60 border border-gray-700/80 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-950 text-indigo-300 border border-indigo-700">
                Step 3 of 3
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <span>🎬</span> Render & Export Video
              </h2>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Project: <span className="text-white font-medium">{project?.title || "Untitled Video"}</span> · {scenesWithImages.length} scenes · ~{totalDuration}s duration
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (onBack) onBack();
                else if (onNavigateToStep) onNavigateToStep("studio");
              }}
              className="px-3.5 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs text-gray-200 transition-colors flex items-center gap-1.5 font-medium"
            >
              <span>←</span> Timeline & Studio
            </button>
            <button
              onClick={() => {
                if (onNavigateToStep) onNavigateToStep("scenes");
                else if (onBack) onBack();
              }}
              className="px-3.5 py-1.5 bg-gray-750 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs text-gray-300 hover:text-white transition-colors flex items-center gap-1.5"
            >
              <span>📝</span> Scene Editor
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Options on Left, Render Engine / Preview on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Final Options */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-gray-700 pb-2">
              <span>⚙️</span> Video Format & Resolution
            </h3>

            {/* Resolution Selector */}
            <div className="space-y-1.5">
              <label className="text-xs text-gray-300 font-medium block">
                Target Resolution:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "720p", name: "720p HD", note: "Fastest render • lightweight" },
                  { id: "1080p", name: "1080p Full HD", note: "Standard • crisp quality" },
                  { id: "2k", name: "2K QHD", note: "High definition • pro grade" },
                  { id: "4k", name: "4K UHD", note: "Maximum ultra detail" },
                ].map((r) => {
                  const dims = getDimensions(r.id as any);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSettings((s) => ({ ...s, resolution: r.id as any }))}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        settings.resolution === r.id
                          ? "bg-indigo-950/80 border-indigo-500 text-white shadow-sm ring-1 ring-indigo-500"
                          : "bg-gray-700/50 border-gray-600 text-gray-400 hover:text-white"
                      }`}
                    >
                      <div className="text-xs font-semibold">{r.name}</div>
                      <div className="text-[10px] text-gray-400 font-mono mt-0.5">{dims.width} × {dims.height}</div>
                      <div className="text-[9px] text-gray-500 mt-0.5">{r.note}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Container Format & Framerate */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-xs text-gray-300 block mb-1 font-medium">
                  Format:
                </label>
                <select
                  value={settings.format}
                  onChange={(e) => setSettings((s) => ({ ...s, format: e.target.value as any }))}
                  className="w-full bg-gray-700 text-white text-xs rounded-lg px-2.5 py-2 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="webm">WebM (VP9/Opus - Best Quality)</option>
                  <option value="mp4">MP4 Video Container</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-300 block mb-1 font-medium">
                  Framerate:
                </label>
                <select
                  value={settings.fps}
                  onChange={(e) => setSettings((s) => ({ ...s, fps: Number(e.target.value) as any }))}
                  className="w-full bg-gray-700 text-white text-xs rounded-lg px-2.5 py-2 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value={30}>30 FPS (Standard)</option>
                  <option value={60}>60 FPS (Ultra Smooth)</option>
                </select>
              </div>
            </div>

            {/* Bitrate / Quality */}
            <div>
              <label className="text-xs text-gray-300 block mb-1 font-medium">
                Encoding Quality:
              </label>
              <div className="flex gap-2">
                {[
                  { id: "standard", name: "Standard (5 Mbps)" },
                  { id: "high", name: "High (10 Mbps)" },
                  { id: "ultra", name: "Ultra (16 Mbps)" },
                ].map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, quality: q.id as any }))}
                    className={`flex-1 py-1.5 px-2 rounded-lg border text-center text-xs transition-colors ${
                      settings.quality === q.id
                        ? "bg-indigo-600 border-indigo-500 text-white font-medium"
                        : "bg-gray-700/60 border-gray-600 text-gray-400 hover:text-white"
                    }`}
                  >
                    {q.name.split(" ")[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Branding & Watermarks Section */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center justify-between border-b border-gray-700 pb-2">
              <span className="flex items-center gap-2">
                <span>🛡️</span> Branding & Watermarks
              </span>
              <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/50 text-[10px] font-bold">
                Permanent App Watermark
              </span>
            </h3>

            {/* Official Watermark Display */}
            <div className="bg-gray-900/90 rounded-lg p-3 border border-gray-700/80 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <span>🔒</span> Scenering Official Watermark (Top-Left)
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5 max-w-xs">
                  Permanently embedded on all renders. Paid options to remove the watermark will be available in future releases.
                </div>
              </div>
              <img
                src="/scenering-logo.png"
                alt="Scenering"
                className="h-8 w-auto object-contain shrink-0 filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
              />
            </div>

            {/* Customer Logo Display */}
            <div className="bg-gray-900/90 rounded-lg p-3 border border-gray-700/80 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <span>🏷️</span> Customer Brand Logo (Top-Right)
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5 max-w-xs">
                  {customerLogo?.enabled && customerLogo?.url
                    ? "Custom logo enabled & rendered in top-right corner."
                    : "No custom brand logo configured. You can upload one in Video Studio."}
                </div>
              </div>
              {customerLogo?.enabled && customerLogo?.url ? (
                <img
                  src={customerLogo.url}
                  alt="Customer Logo"
                  className="h-7 w-auto object-contain shrink-0 drop-shadow"
                />
              ) : (
                <span className="text-[10px] text-gray-500 italic">None set</span>
              )}
            </div>
          </div>

          {/* Subtitles & Audio Enhancement */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center justify-between border-b border-gray-700 pb-2">
              <span className="flex items-center gap-2">
                <span>💬</span> Captions & Subtitles
              </span>
              <span className="text-[10px] text-indigo-400 font-medium">Burn-in on Video</span>
            </h3>

            {/* Subtitles Toggle */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-300 font-medium">
                  Burn-In Subtitles on Video
                </span>
                <input
                  type="checkbox"
                  checked={settings.includeSubtitles}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSettings((s) => ({ ...s, includeSubtitles: checked }));
                    if (onUpdateCaptionsConfig && captionsConfig) {
                      onUpdateCaptionsConfig({ ...captionsConfig, enabled: checked });
                    }
                  }}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                />
              </div>

              {settings.includeSubtitles && (
                <div className="space-y-3 pt-1">
                  {/* Mode: Karaoke vs Normal */}
                  <div>
                    <label className="text-[11px] text-gray-300 block mb-1.5 font-medium">
                      Caption Mode:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSettings((s) => ({ ...s, subtitleStyle: "karaoke" }));
                          if (onUpdateCaptionsConfig && captionsConfig) {
                            onUpdateCaptionsConfig({ ...captionsConfig, mode: "karaoke" });
                          }
                        }}
                        className={`p-2 rounded-lg border text-left text-xs transition-colors flex items-center gap-2 ${
                          (captionsConfig?.mode || settings.subtitleStyle) === "karaoke"
                            ? "bg-indigo-950 border-indigo-500 text-indigo-200 shadow-sm"
                            : "bg-gray-700/50 border-gray-600 text-gray-400 hover:text-white"
                        }`}
                      >
                        <span className="text-base">🎤</span>
                        <div>
                          <div className="font-semibold text-[11px]">Karaoke</div>
                          <div className="text-[9px] text-gray-400">Active word highlight</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSettings((s) => ({ ...s, subtitleStyle: "normal" }));
                          if (onUpdateCaptionsConfig && captionsConfig) {
                            onUpdateCaptionsConfig({ ...captionsConfig, mode: "normal" });
                          }
                        }}
                        className={`p-2 rounded-lg border text-left text-xs transition-colors flex items-center gap-2 ${
                          (captionsConfig?.mode || settings.subtitleStyle) === "normal"
                            ? "bg-indigo-950 border-indigo-500 text-indigo-200 shadow-sm"
                            : "bg-gray-700/50 border-gray-600 text-gray-400 hover:text-white"
                        }`}
                      >
                        <span className="text-base">📝</span>
                        <div>
                          <div className="font-semibold text-[11px]">Normal</div>
                          <div className="text-[9px] text-gray-400">Standard full subtitles</div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Background Style: Blocked vs Transparent */}
                  <div>
                    <label className="text-[11px] text-gray-300 block mb-1.5 font-medium">
                      Background Style:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (onUpdateCaptionsConfig && captionsConfig) {
                            onUpdateCaptionsConfig({ ...captionsConfig, backgroundStyle: "blocked" });
                          }
                        }}
                        className={`p-2 rounded-lg border text-left text-xs transition-colors flex items-center gap-2 ${
                          (captionsConfig?.backgroundStyle ?? "blocked") === "blocked"
                            ? "bg-indigo-950 border-indigo-500 text-indigo-200 shadow-sm"
                            : "bg-gray-700/50 border-gray-600 text-gray-400 hover:text-white"
                        }`}
                      >
                        <span className="text-base">⬛</span>
                        <div>
                          <div className="font-semibold text-[11px]">Blocked</div>
                          <div className="text-[9px] text-gray-400">High contrast backing</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (onUpdateCaptionsConfig && captionsConfig) {
                            onUpdateCaptionsConfig({ ...captionsConfig, backgroundStyle: "transparent" });
                          }
                        }}
                        className={`p-2 rounded-lg border text-left text-xs transition-colors flex items-center gap-2 ${
                          captionsConfig?.backgroundStyle === "transparent"
                            ? "bg-indigo-950 border-indigo-500 text-indigo-200 shadow-sm"
                            : "bg-gray-700/50 border-gray-600 text-gray-400 hover:text-white"
                        }`}
                      >
                        <span className="text-base">🔲</span>
                        <div>
                          <div className="font-semibold text-[11px]">Transparent</div>
                          <div className="text-[9px] text-gray-400">Soft drop shadow only</div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Ambient Background Music */}
            <div className="pt-2 border-t border-gray-700/60 space-y-2 text-xs">
              <label className="text-gray-300 block font-medium">
                Ambient Background Track:
              </label>
              <select
                value={settings.backgroundMusic}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, backgroundMusic: e.target.value as any }))
                }
                className="w-full bg-gray-700 text-white text-xs rounded-lg px-2.5 py-1.5 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="lofi">☕ Chill Lo-Fi Acoustic</option>
                <option value="cinematic">🎬 Cinematic Drama & Wonder</option>
                <option value="ambient">🌿 Relaxing Ambient Flow</option>
                <option value="energetic">⚡ Energetic Tech Pulse</option>
                <option value="none">🚫 None (Voice Narration Only)</option>
              </select>

              {settings.backgroundMusic !== "none" && (
                <div className="pt-1">
                  <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                    <span>Music Volume</span>
                    <span>{Math.round(settings.musicVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={0.4}
                    step={0.02}
                    value={settings.musicVolume}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, musicVolume: parseFloat(e.target.value) }))
                    }
                    className="w-full accent-indigo-500"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Render Canvas & Finished Video Player */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden shadow-2xl">
            {/* Viewport: Live Render Canvas OR Finished HTML5 Video Player */}
            <div className={`relative ${aspectClass || "aspect-video"} bg-black flex items-center justify-center overflow-hidden mx-auto`}>
              {renderedUrl && !isRendering ? (
                <video
                  src={renderedUrl}
                  controls
                  autoPlay={false}
                  preload="metadata"
                  className="w-full h-full object-contain"
                />
              ) : (
                <>
                  <canvas
                    ref={canvasRef}
                    className={`w-full h-full object-contain bg-black ${
                      isRendering ? "opacity-100" : "opacity-40"
                    }`}
                  />
                  {!isRendering && !renderedUrl && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-black/50 backdrop-blur-[2px]">
                      <div className="w-16 h-16 rounded-full bg-indigo-600/90 text-white flex items-center justify-center text-3xl shadow-lg mb-3">
                        ⚡
                      </div>
                      <h4 className="text-lg font-bold text-white mb-1">
                        Ready to Render
                      </h4>
                      <p className="text-xs text-gray-300 max-w-sm">
                        Click "Start Video Render" to compile audio narration, camera motion, cinematic filters, overlays, and crisp watermark into a polished video file.
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Rendering Overlay */}
              {isRendering && (
                <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                  <div className="relative mb-4">
                    <svg className="animate-spin h-14 w-14 text-indigo-500" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                      {Math.round(renderProgress * 100)}%
                    </span>
                  </div>

                  <h4 className="text-base font-semibold text-white mb-1">
                    Rendering Video in {resLabel}
                  </h4>
                  <p className="text-xs text-indigo-300 font-medium mb-3">{renderStage}</p>

                  <div className="w-64 bg-gray-800 rounded-full h-2 overflow-hidden border border-gray-700">
                    <div
                      className="bg-indigo-500 h-full rounded-full transition-all duration-150"
                      style={{ width: `${Math.round(renderProgress * 100)}%` }}
                    />
                  </div>

                  <button
                    onClick={cancelRender}
                    className="mt-5 px-3 py-1 bg-red-600/70 hover:bg-red-600 text-white text-xs rounded-lg transition-colors"
                  >
                    Cancel Render
                  </button>
                </div>
              )}
            </div>

            {/* Controls / Progress / Download Area */}
            <div className="p-4 space-y-4">
              {renderError && (
                <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-lg text-red-300 text-xs flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{renderError}</span>
                </div>
              )}

              {/* Primary Action Button: Render or Re-Render */}
              {!renderedUrl ? (
                <button
                  onClick={handleStartRender}
                  disabled={isRendering || scenesWithImages.length === 0}
                  className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg transition-all transform active:scale-[0.99] flex items-center justify-center gap-2 text-sm"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Start Video Render ({resLabel.split(" ")[0]})</span>
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-green-950/50 border border-green-800/80 rounded-xl text-green-300 text-xs flex items-center justify-between">
                    <span className="flex items-center gap-2 font-medium">
                      <span>✅</span> Video rendered successfully! Format: {settings.format.toUpperCase()} · {resLabel}
                    </span>
                    <button
                      onClick={handleStartRender}
                      className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs border border-gray-700 transition-colors"
                    >
                      🔄 Re-render
                    </button>
                  </div>

                  {/* Complete Download Suite */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Download Video */}
                    <button
                      onClick={downloadVideo}
                      className="px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download Video ({settings.format.toUpperCase()})
                    </button>

                    {/* Download Full Project ZIP */}
                    <button
                      onClick={downloadFullPackageZip}
                      disabled={isZipping}
                      className="px-4 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white text-xs font-bold rounded-xl transition-all shadow flex items-center justify-center gap-2"
                    >
                      {isZipping ? (
                        <>
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          <span>{zipStatus || "Zipping..."}</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                          <span>Full Project ZIP Package</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Secondary Downloads */}
                  <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                    <button
                      onClick={downloadSrtSubtitles}
                      className="py-2 px-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <span>📄</span> Download Subtitles (.srt)
                    </button>

                    <button
                      onClick={downloadFullPackageZip}
                      className="py-2 px-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <span>📦</span> Download Assets & Scripts
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Video Attribution & Credits Section */}
      <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800 pb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-lg text-sm">
                📜
              </span>
              <h3 className="text-base font-bold text-white">
                Video Description Attribution & License Credits
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 border border-emerald-700/60 text-emerald-300">
                Royalty-Free Compliant
              </span>
            </div>
            <p className="text-xs text-gray-400 max-w-2xl leading-relaxed">
              Copy or download this attribution document to paste into your YouTube, TikTok, Vimeo, or Instagram video description to credit the free audio sounds and 3D graphics.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAttributionPreview(!showAttributionPreview)}
              className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-semibold border border-gray-700 transition-colors flex items-center gap-1.5 shadow"
            >
              <span>👁️</span>
              <span>{showAttributionPreview ? "Hide Credits" : "View Credits"}</span>
            </button>

            <button
              type="button"
              onClick={downloadAttributionDoc}
              className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-semibold border border-gray-700 transition-colors flex items-center gap-1.5 shadow"
            >
              <span>⬇️</span>
              <span>Download (.txt)</span>
            </button>

            <button
              type="button"
              onClick={copyAttributionDoc}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow flex items-center gap-1.5 ${
                copiedAttribution
                  ? "bg-emerald-600 text-white animate-pulse"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white"
              }`}
            >
              <span>{copiedAttribution ? "✅" : "📋"}</span>
              <span>{copiedAttribution ? "Copied!" : "Copy"}</span>
            </button>
          </div>
        </div>

        {/* Live Document Preview Box */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="font-mono text-[11px] text-indigo-300">credits_attribution.txt</span>
            <button
              type="button"
              onClick={() => setShowAttributionPreview(!showAttributionPreview)}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
            >
              {showAttributionPreview ? "Collapse Document" : "Expand Document"}
            </button>
          </div>

          {showAttributionPreview && (
            <div className="relative">
              <pre className="w-full bg-black/80 border border-gray-800 rounded-xl p-4 text-xs font-mono text-gray-300 whitespace-pre-wrap overflow-x-auto max-h-64 scrollbar-thin select-all leading-relaxed">
                {getAttributionText()}
              </pre>
              <div className="absolute right-3 top-3">
                <button
                  type="button"
                  onClick={copyAttributionDoc}
                  className="px-2.5 py-1 rounded bg-gray-800/90 hover:bg-gray-700 border border-gray-700 text-gray-200 text-[10px] font-medium transition-colors"
                >
                  {copiedAttribution ? "✓ Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
