import { useState, useRef, useEffect, useCallback } from "react";
import type { Project, Scene, TimelineInsert, CustomerLogoConfig, CaptionsConfig, AspectRatioType, EditorStep, ResolutionType, PacingModeType } from "../types";
import StepNav, { PROJECT_PHASES, type ProjectPhase } from "./StepNav";
import { EDGE_FUNCTION_BASE } from "../lib/supabase";
import { createProjectZip } from "../lib/zip-download";
import { drawSceneImage } from "../lib/scene-framing";
import { ClipPool, asDrawableClip, sceneHasClip } from "../lib/scene-clip";
import {
  getMotionTransform,
  renderTimelineInsert,
} from "../lib/render-effects";
import { renderCanvasCaptions, DEFAULT_CAPTIONS_CONFIG } from "../lib/render-captions";
import { AudioFrame, EMPTY_FRAME, makeBus } from "../lib/audio-reactive";
import { loadCaptionFonts } from "../data/caption-styles";
import { generateAttributionDocument, getBackgroundMusicTrack, AMBIENT_STYLE_TO_TRACK } from "../data/media-library";
import { calculateDynamicDuration } from "../lib/duration-utils";
import { getFilterCanvas, getPreset, type VideoFilterConfig } from "../data/video-filters";
import { paintVideoFilter } from "../lib/video-filter-render";
import { buildInsertAudioPlan, buildSectionAudioPlan, InsertAudioMixer } from "../lib/insert-audio";
import { renderSection } from "../lib/render-section";
import type { SectionConfig } from "../data/intro-outro";
import {
  MAX_VAULT_RENDERS,
  type VaultRender,
  saveBlobToDisk,
  saveRenderToVault,
  deleteVaultRender,
  listVaultRenders,
  subscribeVault,
  formatVaultSize,
  formatVaultTime,
} from "../lib/render-vault";
import {
  getRenderStatus,
  setRenderStatus,
  subscribeRenderStatus,
  type RenderJobStatus,
} from "../lib/render-status";

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
  /* Setup choices — shown read-only on this screen */
  sceneDuration?: number;
  motionStyle?: string;
  /** the single look applied across the whole video */
  videoFilter?: VideoFilterConfig | null;
  introSection?: SectionConfig | null;
  outroSection?: SectionConfig | null;
  onOpenSetup?: () => void;
  onNavigatePhase?: (phase: ProjectPhase) => void;
}

/** Small read-only row used by the "Your choices" panel */
function SummaryRow({
  icon,
  label,
  value,
  hint,
}: {
  icon: string;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[11px] text-gray-400 flex items-center gap-1.5 shrink-0">
        <span>{icon}</span>
        {label}
      </span>
      <span className="text-[11px] font-medium text-white text-right break-words min-w-0">
        {value}
        {hint && <span className="block text-[10px] text-gray-500 font-normal">{hint}</span>}
      </span>
    </div>
  );
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
    .filter((s) => s.image_url || s.video_url)
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
  sceneDuration = 20,
  motionStyle = "dynamic",
  videoFilter = null,
  introSection = null,
  outroSection = null,
  onOpenSetup,
  onNavigatePhase,
}: RenderViewProps) {
  // Scenes with a short video clip are renderable even without a still image.
  const scenesWithImages = scenes.filter((s) => s.image_url || s.video_url);
  const activeLook = getPreset(videoFilter?.id);
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
    includeSubtitles: captionsConfig?.enabled ?? false,
    subtitleStyle: captionsConfig?.mode ?? "karaoke",
    // Music is added in Video Studio as timeline inserts, so this page stays free of settings
    backgroundMusic: "none",
    musicVolume: 0.3,
    normalizeAudio: true,
  });

  // Keep the read-only summary and the render in sync with the setup choices
  useEffect(() => {
    setSettings((prev) => ({
      ...prev,
      resolution: propResolution || prev.resolution,
      includeSubtitles: captionsConfig?.enabled ?? prev.includeSubtitles,
      subtitleStyle: captionsConfig?.mode ?? prev.subtitleStyle,
    }));
  }, [propResolution, captionsConfig?.enabled, captionsConfig?.mode]);

  // Render execution state
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStage, setRenderStage] = useState("");
  const [renderedBlob, setRenderedBlob] = useState<Blob | null>(propRenderedBlob || null);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(propRenderedUrl || null);
  const [renderError, setRenderError] = useState<string | null>(null);

  // ---- The Vault: finished renders waiting to be downloaded -----------
  const [vaultRenders, setVaultRenders] = useState<VaultRender[]>([]);
  const [vaultMessage, setVaultMessage] = useState<string>("");
  const [vaultPreviewId, setVaultPreviewId] = useState<string | null>(null);
  const [vaultPreviewUrl, setVaultPreviewUrl] = useState<string | null>(null);
  const [vaultBusyId, setVaultBusyId] = useState<string | null>(null);
  /** Live job status, shared with the header so a background render stays visible. */
  const [job, setJob] = useState<RenderJobStatus>(() => getRenderStatus());

  const refreshVault = useCallback(async () => {
    try {
      setVaultRenders(await listVaultRenders());
    } catch {
      /* vault is best-effort */
    }
  }, []);

  useEffect(() => {
    void refreshVault();
    const offVault = subscribeVault(() => {
      void refreshVault();
    });
    const offJob = subscribeRenderStatus((status) => setJob(status));
    return () => {
      offVault();
      offJob();
    };
  }, [refreshVault]);

  /** Object URL for the row being previewed (one at a time, always revoked). */
  useEffect(() => {
    if (!vaultPreviewId) {
      setVaultPreviewUrl(null);
      return;
    }
    const row = vaultRenders.find((r) => r.id === vaultPreviewId);
    if (!row) {
      setVaultPreviewId(null);
      return;
    }
    const url = URL.createObjectURL(row.blob);
    setVaultPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [vaultPreviewId, vaultRenders]);

  /**
   * Progress/stage updates: the local render screen AND the app-wide job
   * status. The second half is what keeps the header pill alive when the
   * user walks away from this page mid-render.
   */
  const reportProgress = useCallback((p: number, stage?: string) => {
    setRenderProgress(p);
    setRenderStatus({ progress: p, ...(stage ? { stage } : {}) });
  }, []);
  const reportStage = useCallback((stage: string) => {
    setRenderStage(stage);
    setRenderStatus({ stage });
  }, []);

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
  /** Clip decoders in use by the current export, released when it ends. */
  const clipPoolRef = useRef<ClipPool | null>(null);
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
    reportProgress(0);
    setRenderError(null);
    abortControllerRef.current = false;
    // Publish the job so the header can follow it even if the user leaves
    // this screen — the render itself keeps running either way.
    setRenderStatus({
      active: true,
      progress: 0,
      stage: "1/4: Preparing narration, visuals and audio…",
      title: project?.title || "Untitled render",
      startedAt: Date.now(),
      finishedAt: null,
      error: null,
      lastVaultId: null,
    });

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

    // Make sure the caption faces are ready before the first frame is captured
    await loadCaptionFonts();

    if (typeof MediaRecorder === "undefined") {
      setRenderError("Your browser does not support in-browser video recording.");
      setIsRendering(false);
      return;
    }

    try {
      // 1. Synthesizing audio & sound effects
      reportStage("1/4: Synthesizing narration voices & sound effects...");
      reportProgress(0.08);

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

        reportProgress(0.08 + (i / scenesWithImages.length) * 0.18);
      }

      // 2. Loading High-Resolution Visual Assets & Watermark
      reportStage("2/4: Loading high-resolution visuals & watermark...");
      reportProgress(0.28);

      const images = await Promise.all(
        scenesWithImages.map((s) => loadImage(s.image_url || ""))
      );

      // Prepare any short video clips so their frames are decodable while the
      // canvas is being captured.
      const clipPool = new ClipPool();
      clipPoolRef.current = clipPool;
      await Promise.all(
        scenesWithImages.filter(sceneHasClip).map(
          (s) =>
            new Promise<void>((resolve) => {
              const el = clipPool.get(s);
              if (!el) return resolve();
              if (el.readyState >= 2) return resolve();
              const done = () => resolve();
              el.addEventListener("loadeddata", done, { once: true });
              el.addEventListener("error", done, { once: true });
              setTimeout(done, 8000);
            })
        )
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

      // Ambient background music: REAL instrumental recordings from the
      // library (no synthetic tones). Falls back to the old Web Audio loop
      // only if the file can't be fetched/decoded.
      let ambientGainNode: AudioNode | null = null;
      if (settings.backgroundMusic !== "none" && settings.musicVolume > 0) {
        const styleTrackId = AMBIENT_STYLE_TO_TRACK[settings.backgroundMusic];
        const track = styleTrackId ? getBackgroundMusicTrack(styleTrackId) : undefined;
        let ambientGain: AudioNode | null = null;
        if (track) {
          try {
            const res = await fetch(track.url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const musicBuf = await audioCtx.decodeAudioData(await res.arrayBuffer());
            const src = audioCtx.createBufferSource();
            src.buffer = musicBuf;
            src.loop = true; // real tracks loop to fill the whole video
            const g = audioCtx.createGain();
            g.gain.value = Math.max(0, Math.min(1, settings.musicVolume)) * 0.85;
            src.connect(g);
            g.connect(dest);
            src.start();
            ambientGain = g;
          } catch (musicErr) {
            console.warn("Real background track failed to load — synth fallback used:", musicErr);
          }
        }
        if (!ambientGain) {
          ambientGain = createAmbientMusicNode(
            audioCtx,
            settings.backgroundMusic,
            totalDuration + 5,
            settings.musicVolume
          );
          if (ambientGain) ambientGain.connect(dest);
        }
        ambientGainNode = ambientGain;
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
      reportStage(`3/4: Rendering Scene 1 of ${scenesWithImages.length}...`);
      reportProgress(0.35);

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
      // Filled with the audio-timeline clock once rendering starts.
      let sceneStartTime = 0;
      let lastProgressUiUpdate = 0;
      let lastProgressVal = 0.35;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      analyser.minDecibels = -92;
      analyser.maxDecibels = -12;
      analyser.connect(dest);

      // Music bus: the background track / SFX are analysed separately from the
      // voiceover so "moves with the music" visualisers are genuinely driven by
      // the soundtrack in the rendered file, exactly like in the preview.
      const musicAnalyser = audioCtx.createAnalyser();
      musicAnalyser.fftSize = 512;
      musicAnalyser.smoothingTimeConstant = 0.72;
      musicAnalyser.minDecibels = -92;
      musicAnalyser.maxDecibels = -12;
      musicAnalyser.connect(dest);
      // NOTE: Quiet rendering - deliberately DO NOT connect analysers to audioCtx.destination!

      // Route the ambient BGM through the MUSIC analyser (instead of straight
      // to the recorder) so "moves with the music" waves actually respond to
      // the background track in the rendered file. Re-route, don't double-feed:
      if (ambientGainNode) {
        try {
          ambientGainNode.disconnect();
        } catch {}
        ambientGainNode.connect(musicAnalyser);
      }

      const scheduledSources: AudioBufferSourceNode[] = [];
      /** Hard-stops every pre-scheduled narration buffer (cancel / finish). */
      const stopScheduledAudio = () => {
        for (const src of scheduledSources) {
          try {
            src.stop();
          } catch {}
        }
      };

      const introSec = introSection?.enabled ? introSection : null;
      const outroSec = outroSection?.enabled ? outroSection : null;
      const introDuration = introSec ? Math.max(0.5, introSec.duration) : 0;
      const outroDuration = outroSec ? Math.max(0.5, outroSec.duration) : 0;

      const scriptTotalDuration = Math.max(1, scenesWithImages.reduce((sum, s) => {
        const aud = audioBuffers.get(s.id);
        return sum + Math.max(1, getEffectiveSceneDuration(s, aud?.duration));
      }, 0));

      const estimatedTotalDuration = Math.max(1, introDuration + scriptTotalDuration + outroDuration);

      // Mix timeline insert audio (BGM, SFX, CTA jingles, intro/outro sounds) into the render
      let insertMixer: InsertAudioMixer | null = null;
      try {
        const insertPlans = [
          ...buildInsertAudioPlan(inserts, estimatedTotalDuration),
          ...buildSectionAudioPlan(introSec, outroSec, introDuration, estimatedTotalDuration),
        ];
        if (insertPlans.length > 0) {
          insertMixer = new InsertAudioMixer(audioCtx, musicAnalyser);
          const loaded = await insertMixer.load(insertPlans);
          if (loaded > 0) {
            insertMixer.startFrom(0);
            reportStage(`3/4: Audio ready (${loaded} track(s)) — rendering...`);
          }
        }
      } catch (err) {
        console.warn("Insert audio render setup warning:", err);
      }
      const renderStartTime = performance.now();

      // --- Timeline clock -------------------------------------------------
      // The audio MediaRecorder captures follows the AudioContext DEVICE
      // clock — never the (janky) wall clock. Driving all visual timing from
      // the same clock keeps voice, captions, waves and video in sync even on
      // slow machines where frame painting stutters. `timelineNow()` returns
      // the audio clock in the same units/scale as performance.now(), so the
      // frame math below is unchanged.
      const renderAudioT0 = audioCtx.currentTime + 0.15;
      const timelineNow = () =>
        renderStartTime + Math.max(0, audioCtx.currentTime - renderAudioT0) * 1000;
      let lastResumeAttempt = 0;

      // Pre-schedule EVERY scene's narration at its exact planned offset.
      // Web Audio plays these sample-accurately on the audio thread, so the
      // voice can never gap out or cut off because the main thread was busy
      // painting frames — this is what keeps the voice smooth and in sync
      // with the captions on slower computers.
      let narrationOffset = introDuration;
      scenesWithImages.forEach((sc) => {
        const item = audioBuffers.get(sc.id);
        const dur = Math.max(1, getEffectiveSceneDuration(sc, item?.duration));
        if (item) {
          try {
            const source = audioCtx.createBufferSource();
            source.buffer = item.buffer;
            // Voice feeds the voice analyser → speech-reactive waves respond
            source.connect(analyser);
            source.start(renderAudioT0 + narrationOffset);
            scheduledSources.push(source);
          } catch (audioErr) {
            console.warn("Error scheduling scene audio:", audioErr);
          }
        }
        narrationOffset += dur;
      });

      let renderPhase: "intro" | "scenes" | "outro" = introSec ? "intro" : "scenes";
      let phaseStartTime = timelineNow();
      sceneStartTime = timelineNow();

      // Frame drawing loop with robust error boundaries and background tab resilience
      await new Promise<void>((resolveLoop) => {
        let isLoopFinished = false;
        let backgroundTimerId: any = null;

        const cleanupAndFinish = () => {
          if (isLoopFinished) return;
          isLoopFinished = true;
          if (backgroundTimerId) clearTimeout(backgroundTimerId);
          try {
            insertMixer?.stop();
          } catch {}
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
            // Audio clock, not the wall clock (see timelineNow above).
            const now = timelineNow();

            // If a browser re-suspends the context mid-render, nudge it back —
            // otherwise the whole timeline clock (and the recording) freezes.
            if (audioCtx.state !== "running" && now - renderStartTime - lastResumeAttempt > 2000) {
              lastResumeAttempt = now - renderStartTime;
              audioCtx.resume().catch(() => {});
            }

            // Drive insert audio (BGM / SFX / CTA / intro-outro sounds)
            try {
              insertMixer?.tick(Math.max(0, (now - renderStartTime) / 1000));
            } catch {}

            // ==========================================
            // PHASE 1: INTRO SEGMENT (Full screen insert, NO captions, NO speech voice)
            // ==========================================
            if (renderPhase === "intro" && introSec) {
              const elapsedInIntro = Math.max(0, (now - phaseStartTime) / 1000);
              const currentGlobalTime = elapsedInIntro;
              const progressInIntro = Math.min(1, elapsedInIntro / Math.max(0.1, introDuration));

              const rawProgress = 0.35 + (currentGlobalTime / estimatedTotalDuration) * 0.55;
              const clampedProgress = Math.min(0.92, Math.max(0.35, isNaN(rawProgress) ? 0.35 : rawProgress));

              if (now - lastProgressUiUpdate > 250 || Math.abs(clampedProgress - lastProgressVal) >= 0.01) {
                lastProgressUiUpdate = now;
                lastProgressVal = clampedProgress;
                reportProgress(clampedProgress);
                reportStage(
                  `3/4: Rendering Intro Scene (${Math.round(elapsedInIntro)}s / ${Math.round(introDuration)}s)`
                );
              }

              // Draw canvas background
              ctx.fillStyle = "#000";
              ctx.fillRect(0, 0, width, height);

              // Render the intro section built in the Intro & Outro studio
              try {
                renderSection(ctx, introSec, width, height, currentGlobalTime, progressInIntro);
              } catch (e) {
                console.warn("Intro section render notice:", e);
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
                sceneStartTime = timelineNow();
              }

              scheduleNextFrame();
              return;
            }

            // ==========================================
            // PHASE 3: OUTRO SEGMENT (Full screen insert, NO captions, NO speech voice)
            // ==========================================
            if (renderPhase === "outro" && outroSec) {
              const elapsedInOutro = Math.max(0, (now - phaseStartTime) / 1000);
              const currentGlobalTime = introDuration + scriptTotalDuration + elapsedInOutro;
              const progressInOutro = Math.min(1, elapsedInOutro / Math.max(0.1, outroDuration));

              const rawProgress = 0.35 + (currentGlobalTime / estimatedTotalDuration) * 0.55;
              const clampedProgress = Math.min(0.92, Math.max(0.35, isNaN(rawProgress) ? 0.35 : rawProgress));

              if (now - lastProgressUiUpdate > 250 || Math.abs(clampedProgress - lastProgressVal) >= 0.01) {
                lastProgressUiUpdate = now;
                lastProgressVal = clampedProgress;
                reportProgress(clampedProgress);
                reportStage(
                  `3/4: Rendering Outro Scene (${Math.round(elapsedInOutro)}s / ${Math.round(outroDuration)}s)`
                );
              }

              // Draw canvas background
              ctx.fillStyle = "#000";
              ctx.fillRect(0, 0, width, height);

              // Render the outro section built in the Intro & Outro studio
              try {
                renderSection(ctx, outroSec, width, height, elapsedInOutro, progressInOutro);
              } catch (e) {
                console.warn("Outro section render notice:", e);
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
              if (outroSec) {
                renderPhase = "outro";
                phaseStartTime = timelineNow();
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
              reportProgress(clampedProgress);
              reportStage(
                `3/4: Rendering Scene ${currentSceneIdx + 1} of ${scenesWithImages.length} (${Math.round(currentGlobalTime)}s / ${Math.round(estimatedTotalDuration)}s)`
              );
            }

            // --- Draw background ---
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, width, height);

            // --- Draw image (or the scene's short video clip) with Camera Motion ---
            let img: (CanvasImageSource & { naturalWidth: number; naturalHeight: number }) | null =
              images[currentSceneIdx] as any;
            if (sceneHasClip(currentScene)) {
              // Park the clip on the exact frame this moment of the scene needs,
              // then draw it through the same framing engine as a still.
              const el = clipPool.get(currentScene);
              if (el) {
                clipPool.seekToProgress(currentScene, progressInScene, sceneDuration);
                if (el.readyState >= 2 && el.videoWidth > 0) {
                  img = asDrawableClip(el) as any;
                }
              }
            }
            if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
              const { scale, dx, dy } = getMotionTransform(
                currentScene.motion_effect,
                progressInScene,
                width,
                height
              );
              const safeScale = isNaN(scale) ? 1 : scale;
              const safeDx = isNaN(dx) ? 0 : dx;
              const safeDy = isNaN(dy) ? 0 : dy;

              // Framing goes through the shared engine (src/lib/scene-framing.ts)
              // so the exported video matches the preview exactly and the photo
              // keeps its own aspect ratio. Previously this drew the image at
              // the canvas width and height, which squashed every photo that
              // was not already the output shape.
              try {
                drawSceneImage(ctx, img, currentScene, width, height, {
                  motionScale: safeScale,
                  motionDx: safeDx + (width * safeScale - width) / 2,
                  motionDy: safeDy + (height * safeScale - height) / 2,
                  filter: getFilterCanvas(videoFilter, width),
                });
              } catch (drawErr) {
                console.warn("Scene draw notice:", drawErr);
              }

              try {
                ctx.filter = "none";
              } catch {}
            }

            // --- Animated atmosphere of the project-wide filter (grain, mist,
            //     dust, sun flare, VHS artefacts). Uses the GLOBAL timeline
            //     clock so the motion flows continuously across scene cuts. ---
            try {
              paintVideoFilter(ctx, videoFilter, width, height, currentGlobalTime);
            } catch (filterErr) {
              console.warn("Video filter notice:", filterErr);
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
                let audioFrame: AudioFrame = EMPTY_FRAME;
                if (analyser) {
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
                  const voiceBus = readBus(analyser);
                  const musicBus = readBus(musicAnalyser);
                  audioFrame = { voice: voiceBus, music: musicBus };
                  const loudest = voiceBus.level >= musicBus.level ? voiceBus : musicBus;
                  // Speech/music averages sit low (broad frequency spectrum),
                  // so scale the level up — otherwise reactive overlays look dead.
                  audioLevel = Math.min(1, 0.15 + loudest.level * 2.6);
                  freqData = (loudest.freq as Uint8Array) || null;
                }

                inserts.forEach((insert) => {
                  try {
                    renderTimelineInsert(ctx, insert, currentGlobalTime, width, height, audioLevel, freqData, audioFrame);
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
                if (outroSec) {
                  renderPhase = "outro";
                  phaseStartTime = timelineNow();
                } else {
                  cleanupAndFinish();
                  return;
                }
              } else {
                sceneStartTime = timelineNow();
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
      reportStage("4/4: Finalizing video stream & container...");
      reportProgress(0.95);

      const finalBlob = await videoPromise;
      stopScheduledAudio();

      const url = URL.createObjectURL(finalBlob);
      setRenderedBlob(finalBlob);
      setRenderedUrl(url);
      reportProgress(1);
      reportStage("Render Complete! 🎉");
      onRenderSuccess?.(finalBlob, url);

      // Park the finished video in the vault before anything else can go
      // wrong: it survives leaving this screen, switching phase or reloading.
      try {
        const entry = await saveRenderToVault({
          blob: finalBlob,
          title: project?.title || "Untitled render",
          mimeType: finalBlob.type || mimeType || "video/webm",
          durationSec: estimatedTotalDuration,
          width,
          height,
          label: `${settings.resolution} · ${settings.fps}fps · ${settings.format.toUpperCase()}`,
        });
        setVaultMessage(
          `Render finished — ${vaultRenders.length >= MAX_VAULT_RENDERS ? "oldest vault slot cleared, " : ""}waiting in the vault to download.`
        );
        setRenderStatus({
          active: false,
          progress: 1,
          stage: "Render finished — waiting in the vault",
          finishedAt: Date.now(),
          lastVaultId: entry.id,
        });
        void refreshVault();
      } catch (vaultErr) {
        console.warn("Vault save notice:", vaultErr);
        setRenderStatus({
          active: false,
          progress: 1,
          stage: "Render finished",
          finishedAt: Date.now(),
        });
      }
    } catch (err: any) {
      console.error("Render failed:", err);
      const message = err?.message || "Failed to render video";
      setRenderError(message);
      setRenderStatus({ active: false, error: message, stage: "Render failed" });
    } finally {
      setIsRendering(false);
      // Release every clip decoder used during the export.
      try {
        clipPoolRef.current?.dispose();
        clipPoolRef.current = null;
      } catch {}
    }
  };

  // ------ DOWNLOAD HANDLERS ------
  const renderFileName = (title: string, ext: string) => {
    const safeTitle = (title || "scenering_video").replace(/[^a-zA-Z0-9]/g, "_");
    return `${safeTitle}_${settings.resolution}.${ext}`;
  };

  /**
   * Saves a finished video to the user's computer.
   *
   * The File System Access API is tried first (a real "Save as…" dialog — the
   * only path that cannot be silently swallowed when the app runs inside an
   * iframe), then the classic download. On success the vault slot is freed,
   * which is exactly how the vault is meant to work: it only holds what has
   * not been downloaded yet.
   */
  const saveRenderBlob = async (blob: Blob, filename: string, vaultId: string | null) => {
    if (vaultId) setVaultBusyId(vaultId);
    setVaultMessage("Opening the save dialog…");
    const outcome = await saveBlobToDisk(blob, filename);
    if (vaultId) setVaultBusyId(null);

    if (outcome === "cancelled") {
      setVaultMessage("Save cancelled — the video is still safe in the vault.");
      return;
    }
    if (outcome === "failed") {
      setVaultMessage("The browser refused the download. Try the Download button again, or right-click the preview and pick Save video as…");
      return;
    }
    setVaultMessage(`Saved ${filename} — vault slot cleared.`);
    if (vaultId) await deleteVaultRender(vaultId);
    if (job.lastVaultId && job.lastVaultId === vaultId) setRenderStatus({ lastVaultId: null });
    void refreshVault();
  };

  const downloadVideo = async () => {
    const blob = renderedBlob;
    if (!blob) {
      setVaultMessage("Nothing rendered yet — press Start Video Render first.");
      return;
    }
    const ext = settings.format === "mp4" ? "mp4" : "webm";
    await saveRenderBlob(blob, renderFileName(project?.title || "", ext), job.lastVaultId);
  };

  /** Download a row that is waiting in the vault (frees the slot on success). */
  const downloadVaultRender = async (row: VaultRender) => {
    const ext = row.mimeType.includes("mp4") ? "mp4" : "webm";
    await saveRenderBlob(row.blob, renderFileName(row.title, ext), row.id);
  };

  const removeVaultRender = async (row: VaultRender) => {
    if (vaultPreviewId === row.id) setVaultPreviewId(null);
    await deleteVaultRender(row.id);
    setVaultMessage(`Removed “${row.title}” from the vault.`);
    void refreshVault();
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
      // report the REAL track used for the chosen style in the credits doc
      musicType: AMBIENT_STYLE_TO_TRACK[settings.backgroundMusic] || settings.backgroundMusic,
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
    reportStage("Render cancelled");
    setRenderStatus({ active: false, progress: 0, stage: "Render cancelled" });
  };

  const { width: renderW, height: renderH, label: resLabel, aspectClass } = getDimensions(settings.resolution);

  const getPhaseStep = (phase: ProjectPhase): EditorStep =>
    (PROJECT_PHASES.find((p) => p.id === phase)?.editorStep || "scenes") as EditorStep;

  // ---- Read-only summary values (the results of the setup choices) ----
  const MOTION_LABELS: Record<string, string> = {
    dynamic: "Dynamic Variety",
    ken_burns: "Gentle Ken Burns",
    zoom_in: "Cinematic Zoom In",
    zoom_out: "Dramatic Zoom Out",
    pan: "Smooth Camera Pan",
    shake: "Handheld Shake",
    none: "Static (no motion)",
  };
  const voiceDisplayName =
    availableVoices.find((v) => v.id === selectedVoice)?.name || selectedVoice || "Studio AI Voice";

  const insertHasSound = (ins: TimelineInsert) =>
    Boolean(ins.audioSettings?.soundUrl || ins.content?.soundUrl);

  const musicInserts = inserts.filter(
    (ins) => ins.category === "background_music" && insertHasSound(ins)
  );
  const musicSummary =
    musicInserts.length === 0
      ? {
          value: "None added",
          hint: "Add music in Video Studio → Background Music",
        }
      : {
          value: musicInserts.map((i) => i.title || i.audioSettings?.soundName || "Music track").join(", "),
          hint:
            musicInserts.length === 1
              ? `${Math.round((musicInserts[0].audioSettings?.volume ?? 0.5) * 100)}% volume${
                  musicInserts[0].audioSettings?.loop ? " · loops to the end" : ""
                }`
              : `${musicInserts.length} tracks`,
        };
  const soundEffectCount = inserts.filter(
    (ins) => ins.category === "sound_effects" && insertHasSound(ins)
  ).length;

  return (
    <div className="space-y-3 sm:space-y-6 max-w-5xl 2xl:max-w-7xl mx-auto pb-12 animate-fade-in px-1 sm:px-0">
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

        </div>

        {/* Single Previous control for the final phase (nothing here can be changed) */}
        <div className="mt-4">
          <StepNav
            current="render"
            onNavigate={(phase) => {
              if (onNavigatePhase) onNavigatePhase(phase);
              else if (phase === "studio" && onBack) onBack();
              else if (onNavigateToStep) onNavigateToStep(getPhaseStep(phase));
            }}
            note="read-only results — edit in earlier phases"
          />
        </div>
      </div>

      {/* Main Grid: read-only summary on the left, render engine / preview on the right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: READ-ONLY summary of the choices made on the Project Setup screen */}
        <div className="order-2 lg:order-1 lg:col-span-4 space-y-4">
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-gray-700 pb-2 gap-2">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>📋</span> Your Choices
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-900 border border-gray-700 text-gray-400 font-semibold shrink-0">
                Read-only
              </span>
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed">
              These are the results of your project setup. This screen only shows and renders them — nothing
              here can change your video.
            </p>

            <dl className="space-y-2.5 pt-1 border-t border-gray-700/70">
              <SummaryRow icon="🏷️" label="Project" value={project?.title || "Untitled Video"} />
              <SummaryRow
                icon="🎞️"
                label="Story"
                value={`${scenesWithImages.length} scene${scenesWithImages.length === 1 ? "" : "s"} · ~${Math.round(totalDuration)}s`}
                hint={`${sceneDuration}s target per scene`}
              />
              <SummaryRow
                icon="📐"
                label="Canvas"
                value={aspectRatio}
                hint={aspectRatio === "16:9" ? "Landscape" : aspectRatio === "9:16" ? "Vertical" : aspectRatio === "1:1" ? "Square" : "Classic"}
              />
              <SummaryRow
                icon="📺"
                label="Output"
                value={resLabel}
                hint={`${settings.format.toUpperCase()} · ${settings.fps} fps · ${settings.quality} quality`}
              />
              <SummaryRow
                icon="🎥"
                label="Camera motion"
                value={MOTION_LABELS[motionStyle] || motionStyle}
              />
              <SummaryRow
                icon="🎙️"
                label="Voiceover"
                value={voiceDisplayName}
                hint={selectedVoice?.startsWith("browser:") ? "Browser voice" : "Neural voice"}
              />
              <SummaryRow
                icon="💬"
                label="Captions"
                value={settings.includeSubtitles ? "Burned in" : "Off"}
                hint={
                  settings.includeSubtitles
                    ? `${(captionsConfig?.mode || settings.subtitleStyle) === "karaoke" ? "Karaoke word-pop" : "Normal"} · ${captionsConfig?.position || "bottom"}`
                    : "No subtitles in the video"
                }
              />
              <SummaryRow
                icon="🎨"
                label="Video look / filter"
                value={activeLook ? activeLook.name : "None"}
                hint={activeLook ? `${activeLook.tagline} · every scene` : "Pick one in Video Studio → Filters"}
              />
              <SummaryRow
                icon="🎵"
                label="Background music"
                value={musicSummary.value}
                hint={musicSummary.hint}
              />
              <SummaryRow
                icon="🔊"
                label="Sound effects"
                value={`${soundEffectCount} placed`}
                hint={soundEffectCount > 0 ? "Timeline inserts" : "None added in Studio"}
              />
              <SummaryRow icon="🛡️" label="Scenering watermark" value="On (top-left)" />
              <SummaryRow
                icon="🏷️"
                label="Brand logo"
                value={customerLogo?.enabled && customerLogo?.url ? "Custom logo on" : "Not set"}
                hint={customerLogo?.enabled && customerLogo?.url ? "Top-right corner" : "Upload in Video Studio"}
              />
            </dl>

            {onOpenSetup && (
              <button
                type="button"
                onClick={onOpenSetup}
                className="w-full mt-1 py-2 px-3 bg-gray-900 hover:bg-gray-750 border border-gray-700 rounded-xl text-[11px] font-semibold text-gray-200 hover:text-white transition-all flex items-center justify-center gap-1.5"
              >
                <span>⚙️</span>
                <span>Change these in Project Setup</span>
              </button>
            )}
          </div>

          <div className="bg-gray-800/30 border border-gray-700/60 rounded-xl p-3 flex items-start gap-2">
            <span className="text-sm">🔒</span>
            <p className="text-[10px] text-gray-400 leading-relaxed">
              The render screen does not allow any changes. Go back to Scenes, Voiceover, Captions or Studio
              to edit your video — then render again.
            </p>
          </div>
        </div>

        <div className="order-1 lg:order-2 lg:col-span-8 space-y-4">

          {/* ---------- THE VAULT -------------------------------------------
              Finished renders wait here until they are downloaded. The slot
              frees itself the moment a download lands, and only the newest
              few renders are kept, so this can never grow without bound. */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 shadow-lg">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span className="p-1.5 bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-lg text-sm shrink-0">
                  🗄️
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    The Vault
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-900 border border-gray-700 text-gray-300">
                      {vaultRenders.length}/{MAX_VAULT_RENDERS} slots
                    </span>
                  </h3>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    {vaultRenders.length === 0
                      ? `Finished videos wait here so nothing is lost. Download one and its slot clears itself (up to ${MAX_VAULT_RENDERS}).`
                      : "Download a video and it leaves the vault automatically. The oldest is dropped when all slots are full."}
                  </p>
                </div>
              </div>
              {job.active && (
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-950/90 text-indigo-200 border border-indigo-600/60">
                  ⏳ Rendering {Math.round(job.progress * 100)}%
                </span>
              )}
            </div>

            {job.active && !isRendering && (
              <p className="mt-2 text-[11px] text-indigo-300 leading-relaxed">
                A render is running in the background ({Math.round(job.progress * 100)}% · {job.stage}).
                Keep working — it will drop into the vault the moment it finishes.
              </p>
            )}
            {job.error && (
              <p className="mt-2 text-[11px] text-rose-300 leading-relaxed">Last render failed: {job.error}</p>
            )}
            {vaultMessage && (
              <p className="mt-2 text-[11px] text-emerald-300 leading-relaxed">{vaultMessage}</p>
            )}

            {vaultRenders.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {vaultRenders.map((row) => (
                  <li key={row.id} className="bg-gray-900/70 border border-gray-700/70 rounded-lg p-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-white truncate">{row.title}</p>
                        <p className="text-[10px] text-gray-400">
                          {row.label} · {formatVaultTime(row.durationSec)} · {formatVaultSize(row.sizeBytes)} ·{" "}
                          {new Date(row.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => setVaultPreviewId(vaultPreviewId === row.id ? null : row.id)}
                          className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 transition-colors"
                        >
                          {vaultPreviewId === row.id ? "▾ Hide" : "▶ Preview"}
                        </button>
                        <button
                          onClick={() => void downloadVaultRender(row)}
                          disabled={vaultBusyId === row.id}
                          className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 text-white transition-colors"
                        >
                          {vaultBusyId === row.id ? "Saving…" : "⬇ Download"}
                        </button>
                        <button
                          onClick={() => void removeVaultRender(row)}
                          title="Remove from the vault"
                          className="px-2 py-1.5 rounded-lg text-[10px] font-semibold bg-gray-800 hover:bg-rose-900/60 text-gray-400 hover:text-rose-200 border border-gray-700 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    {vaultPreviewId === row.id && vaultPreviewUrl && (
                      <video
                        src={vaultPreviewUrl}
                        controls
                        playsInline
                        className="mt-2 w-full rounded-lg bg-black max-h-[320px]"
                      />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[11px] text-gray-500">
                Empty for now. Every finished render lands here automatically.
              </p>
            )}
          </div>
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
                  className="t-btn-hero w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg transition-all transform active:scale-[0.99] flex items-center justify-center gap-2 text-sm"
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
