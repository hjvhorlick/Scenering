import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { Project, Scene, TimelineInsert, CustomerLogoConfig, CaptionsConfig, AspectRatioType, EditorStep, ResolutionType, PacingModeType } from "../types";
import StepNav, { PROJECT_PHASES, type ProjectPhase } from "./StepNav";
import { EDGE_FUNCTION_BASE } from "../lib/supabase";
import { cancelFinalExport, completeFinalExport, getEntitlements, reserveFinalExport } from "../lib/entitlements";
import { CUSTOMISED_CTA_SUFFIX, isPlanVoiceIncluded, type FeatureKey } from "../config/plans";
import { getInterfacePlan, useSession } from "../lib/session";
import { openMembershipPlans } from "./VipFeatureBadge";
import {
  INSERT_FEATURE,
  auditVipForExport,
  blockingVipFindings,
  omittableVipFindings,
  stripVipFromExport,
  type VipFinding,
} from "../lib/vip-export-audit";
import { isCtaCustomised, isFreeCtaInsert } from "../data/cta-library";
import { startVoiceSource } from "../lib/voice-fade";
import { drawSceneImage, sceneHasVisual, sceneIsBlankColor, prewarmSceneFrame } from "../lib/scene-framing";
import { drawSceneTransition, getTransitionDuration } from "../lib/scene-transition";
import { ClipPool, asDrawableClip, sceneHasClip } from "../lib/scene-clip";
import {
  renderTimelineInsert,
} from "../lib/render-effects";
import { getSceneCameraTransform, renderSceneAnimationEffects } from "../lib/scene-animation";
import { renderCanvasCaptions, DEFAULT_CAPTIONS_CONFIG } from "../lib/render-captions";
import { AudioFrame, EMPTY_FRAME, makeBus } from "../lib/audio-reactive";
import { PackedAudioTelemetry, TELEMETRY_SAMPLE_STRIDE } from "../lib/audio-telemetry";
import { requiredVisualizerFftSize } from "../lib/advanced-audio-visualizer";
import { resolveSceneAudioBuffer, setCachedSceneAudio, fetchSceneAudioWithTimeline } from "../lib/tts-cache";
import type { WordTiming } from "../lib/word-sync";
import { createFrameTicker, type FrameTicker } from "../lib/frame-ticker";
import { loadSceneImage } from "../lib/scene-image-loader";
import { resolveLegacyLocalImage } from "../lib/nature-library-compat";
import { STICKER_LIBRARY } from "../lib/sticker-3d";
import {
  formatDuration,
  narrationLeadIn,
  sceneTimelineDuration,
} from "../lib/duration-utils";
import { loadCaptionFonts, ensureCaptionFont, getCaptionStyle } from "../data/caption-styles";
import { generateAttributionDocument, getBackgroundMusicTrack, AMBIENT_STYLE_TO_TRACK } from "../data/media-library";
import { calculateDynamicDuration } from "../lib/duration-utils";
import { getFilterCanvas, getPreset, type VideoFilterConfig } from "../data/video-filters";
import { paintVideoFilter } from "../lib/video-filter-render";
import { buildInsertAudioPlan, buildSectionAudioPlan, InsertAudioMixer } from "../lib/insert-audio";
import { renderSection } from "../lib/render-section";
import type { SectionConfig } from "../data/intro-outro";
import {
  VoiceEchoConfig,
  VoiceEchoGraph,
  createVoiceEchoGraph,
  resolveVoiceEcho,
  voiceEchoIsActive,
  describeVoiceEcho,
} from "../lib/voice-echo";
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
import {
  MASTER_RENDER_PROFILE,
  DEFAULT_RENDER_PROFILE_SETTINGS,
  resolveFrameRate,
  resolveRenderDimensions,
  resolveRenderPlan,
  computeVideoBitrateKbps,
  computeAudioBitrateKbps,
  estimateFileSizeMB,
  getQualityLevel,
  getPlatformProfile,
  buildRenderFilename,
  checkPlatformCompatibility,
  describeRenderFailure,
  buildCompatibilityFallback,
  resolutionToken,
  totalFrameCount,
  destinationLabel,
  destinationFileToken,
  type FrameRateChoice,
  type EncodingQuality,
  type MasteringMode,
  type RenderPlan,
  type RenderFailureReport,
} from "../lib/render-profile";
import type { RenderProfileSettings } from "../types";
import { createMasteringChain, type MasteringChain } from "../lib/audio-mastering";
import { OfflineExporter, supported as offlineExportSupported, type OfflineExportConfig } from "../lib/offline-export";
import { createFrameBudget } from "../lib/yield-to-browser";
import { RenderTimer, formatMs } from "../lib/render-timing";
import { holdRenderWakeLock, type RenderWakeLockState } from "../lib/render-wake-lock";
import { formatStorageBytes, type RenderOutputStorageMode } from "../lib/render-output-store";
import { getWatermarkLayout } from "../lib/watermark-layout";
import Icon, { iconify } from "./icons/Icon";

/**
 * The render screen's live settings. Every one of them is DECIDED in
 * Project Setup (the render screen only displays and executes them), and
 * the technical values behind them (bitrate ladder, codec, pixel format,
 * keyframe interval, audio spec…) come from the Master Render Profile in
 * src/lib/render-profile.ts — one source, no duplicated choices.
 */
export interface RenderSettings {
  format: "mp4" | "webm";
  resolution: "720p" | "1080p" | "2k" | "4k" | "shorts_9_16" | "square_1_1" | "4:3";
  fps: FrameRateChoice;
  quality: EncodingQuality;
  includeWatermark: boolean;
  watermarkOpacity: number;
  watermarkScale: number;
  includeSubtitles: boolean;
  subtitleStyle: "karaoke" | "normal";
  backgroundMusic: "none" | "lofi" | "cinematic" | "ambient" | "energetic";
  musicVolume: number;
  /** "automatic" = the optional mastering stage (no clipping, voice-priority
   *  music ducking). "manual" = the user's mix passes through untouched. */
  audioMastering: MasteringMode;
}

interface RenderHealthState {
  startedAt: number | null;
  elapsedMs: number;
  framesDone: number;
  totalFrames: number;
  outputBytes: number;
  queuedOutputBytes: number;
  outputStorage: RenderOutputStorageMode | "checking";
  outputStorageDetail: string;
  telemetryBytes: number;
  tabHidden: boolean;
  wakeLock: RenderWakeLockState;
}

const EMPTY_RENDER_HEALTH: RenderHealthState = {
  startedAt: null,
  elapsedMs: 0,
  framesDone: 0,
  totalFrames: 0,
  outputBytes: 0,
  queuedOutputBytes: 0,
  outputStorage: "checking",
  outputStorageDetail: "Checking protected browser storage…",
  telemetryBytes: 0,
  tabHidden: false,
  wakeLock: "released",
};

/* INSERT_FEATURE now lives in src/lib/vip-export-audit.ts, so the warning on
   screen, the dialog at the moment of pressing Render and the render itself
   all read one table instead of three copies that could drift. */

interface RenderViewProps {
  project: Project | null;
  scenes: Scene[];
  inserts: TimelineInsert[];
  selectedVoice?: string;
  availableVoices?: { id: string; name: string; gender?: "male" | "female"; accent?: string; locale?: string }[];
  aspectRatio?: AspectRatioType;
  resolution?: ResolutionType;
  pacingMode?: PacingModeType;
  onNavigateToStep?: (step: EditorStep) => void;
  onBack?: () => void;
  customerLogo?: CustomerLogoConfig;
  captionsConfig?: CaptionsConfig;
  /** Project-wide narration switch. Off renders a video with no spoken track. */
  voiceoverEnabled?: boolean;
  onUpdateCaptionsConfig?: (config: CaptionsConfig) => void;
  renderedBlob?: Blob | null;
  renderedUrl?: string | null;
  onRenderSuccess?: (blob: Blob, url: string) => void;
  /* Setup choices — shown read-only on this screen */
  sceneDuration?: number;
  motionStyle?: string;
  /** Project-level toggle for per-scene camera/effect stacks. */
  sceneAnimationEnabled?: boolean;
  /** the single look applied across the whole video */
  videoFilter?: VideoFilterConfig | null;
  introSection?: SectionConfig | null;
  outroSection?: SectionConfig | null;
  /** echo / ambience on the narration, set in the Voiceover step */
  voiceEcho?: VoiceEchoConfig;
  /** The render profile chosen in Project Setup — displayed and executed
   *  here, never edited here. */
  renderProfile?: RenderProfileSettings;
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
        <Icon glyph={icon} />
        {label}
      </span>
      <span className="text-[11px] font-medium text-white text-right break-words min-w-0">
        {value}
        {hint && <span className="block text-[10px] text-gray-500 font-normal">{hint}</span>}
      </span>
    </div>
  );
}

export function generateSrtSubtitles(scenes: Scene[], voiceoverEnabled: boolean = true): string {
  const pad = (n: number, z = 2) => String(Math.floor(n)).padStart(z, "0");
  const formatSrtTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
  };

  // The video opens with the first image held for the narration lead-in
  // before the first words are spoken, so the subtitle clock starts there.
  // With no narration there is no hold, and the first caption starts at zero.
  let acc = narrationLeadIn(false, voiceoverEnabled);
  return scenes
    .filter(sceneHasVisual)
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
  selectedVoice = "speechify_male_01",
  availableVoices = [],
  aspectRatio = "16:9",
  resolution: propResolution = "1080p",
  pacingMode = "auto_speech",
  onNavigateToStep,
  onBack,
  customerLogo,
  captionsConfig,
  voiceoverEnabled = true,
  onUpdateCaptionsConfig,
  renderedBlob: propRenderedBlob,
  renderedUrl: propRenderedUrl,
  onRenderSuccess,
  sceneDuration = 20,
  motionStyle = "dynamic",
  sceneAnimationEnabled = false,
  videoFilter = null,
  introSection = null,
  outroSection = null,
  voiceEcho,
  renderProfile = DEFAULT_RENDER_PROFILE_SETTINGS,
  onOpenSetup,
  onNavigatePhase,
}: RenderViewProps) {
  // Scenes with a short video clip are renderable even without a still image.
  const scenesWithImages = scenes.filter(sceneHasVisual);
  const sceneVoiceIds = useMemo(
    () => scenes.filter(sceneHasVisual).map((scene) => scene.voice_id).filter((voiceId): voiceId is string => Boolean(voiceId)),
    [scenes]
  );
  const activeLook = getPreset(videoFilter?.id);

  /* ---------------------------------------------------------------- VIP
     What this project contains that the membership does not include in a
     final download. Previewing it is free and stays free; this is only
     about the file that gets written. Recomputed as the project changes so
     the notice on screen is never stale. */
  const { account } = useSession();
  const currentPlan = getInterfacePlan(account);
  const vipFindings = useMemo(
    () =>
      auditVipForExport(currentPlan, {
        inserts,
        videoFilter,
        sceneAnimationEnabled,
        motionStyle,
        captionsConfig,
        selectedVoice,
        sceneVoices: sceneVoiceIds,
        voiceEcho,
      }),
    [currentPlan, inserts, videoFilter, sceneAnimationEnabled, motionStyle, captionsConfig, selectedVoice, sceneVoiceIds, voiceEcho]
  );
  const vipBlocking = useMemo(() => blockingVipFindings(vipFindings), [vipFindings]);
  const vipOmittable = useMemo(() => omittableVipFindings(vipFindings), [vipFindings]);
  /** Set when the creator presses Render and there is something to say first. */
  const [vipPrompt, setVipPrompt] = useState<null | { format?: "mp4" | "webm" | "mov"; plan?: RenderPlan & { label?: string } }>(null);
  /** What the last final render actually left out, reported after the fact. */
  const [vipOmittedLast, setVipOmittedLast] = useState<VipFinding[]>([]);
  const getSceneDuration = (s: Scene) => s.duration || calculateDynamicDuration(s.text, s.audio_duration);
  const totalDuration = scenesWithImages.reduce((sum, s) => sum + getSceneDuration(s), 0);

  // Render settings state — every value here was CHOSEN in Project Setup
  // (destination preset, quality, fps, format, mastering). This screen only
  // mirrors those choices and runs the render; there are no controls here.
  const [settings, setSettings] = useState<RenderSettings>({
    format: renderProfile.format,
    resolution: propResolution || "1080p",
    fps: renderProfile.fps,
    quality: renderProfile.quality,
    includeWatermark: true,
    watermarkOpacity: 1.0,
    watermarkScale: 1.0,
    includeSubtitles: captionsConfig?.enabled ?? false,
    subtitleStyle: captionsConfig?.mode ?? "karaoke",
    // Music is added in Video Studio as timeline inserts, so this page stays free of settings
    backgroundMusic: "none",
    musicVolume: 0.3,
    audioMastering: renderProfile.audio_mastering,
  });

  // Keep the read-only summary and the render in sync with the setup choices
  useEffect(() => {
    setSettings((prev) => ({
      ...prev,
      resolution: propResolution || prev.resolution,
      includeSubtitles: captionsConfig?.enabled ?? prev.includeSubtitles,
      subtitleStyle: captionsConfig?.mode ?? prev.subtitleStyle,
      format: renderProfile.format,
      fps: renderProfile.fps,
      quality: renderProfile.quality,
      audioMastering: renderProfile.audio_mastering,
    }));
  }, [
    propResolution,
    captionsConfig?.enabled,
    captionsConfig?.mode,
    renderProfile.format,
    renderProfile.fps,
    renderProfile.quality,
    renderProfile.audio_mastering,
  ]);

  // Render execution state
  const [isRendering, setIsRendering] = useState(false);
  const [isPreparingRender, setIsPreparingRender] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStage, setRenderStage] = useState("");
  /** Where the last render spent its time, shown on screen when it finishes. */
  const [renderTiming, setRenderTiming] = useState<string | null>(null);
  const [timingCopied, setTimingCopied] = useState(false);
  const [renderedBlob, setRenderedBlob] = useState<Blob | null>(propRenderedBlob || null);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(propRenderedUrl || null);
  /** The container the finished render was ACTUALLY recorded in. The download
   *  extension always matches this — a mislabelled file is what made the
   *  download "not work" before. */
  const [renderedContainer, setRenderedContainer] = useState<"mp4" | "webm">("webm");
  const [renderError, setRenderError] = useState<string | null>(null);
  /** Never hide which pipeline made the file. During diagnosis, frame-exact
   * is required by default so a silent MediaRecorder fallback cannot be
   * mistaken for a successful fix. */
  const [renderEngine, setRenderEngine] = useState<"checking" | "frame-exact" | "compatibility" | null>(null);
  const [offlineFailureReason, setOfflineFailureReason] = useState<string | null>(null);
  const [requireFrameExact, setRequireFrameExact] = useState(true);
  /** How many scene photos had to be replaced by placeholder cards in the
   *  last render — surfaced so a dead image URL is never silent again. */
  const [imageFallbackCount, setImageFallbackCount] = useState(0);
  /** Live safety/throughput facts for the stronger long-render dashboard. */
  const [renderHealth, setRenderHealth] = useState<RenderHealthState>(EMPTY_RENDER_HEALTH);

  // ---- Master Render Profile UI state ---------------------------------
  /** Technical details panel (read-only — normal users never need it). */
  const [showAdvanced, setShowAdvanced] = useState(false);
  /** Human-readable failure report; the raw log stays under Advanced Details. */
  const [failureReport, setFailureReport] = useState<RenderFailureReport | null>(null);
  const [showFailureDetail, setShowFailureDetail] = useState(false);
  /** What the automatic-fallback retry changed — never silent. */
  const [fallbackNotes, setFallbackNotes] = useState<string[]>([]);

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

  // Keep the dashboard clock alive, reflect background-tab state, and warn
  // before a reload/navigation destroys a local encoder that cannot survive a
  // document unload.
  useEffect(() => {
    if (!isRendering) return;
    const update = () => {
      setRenderHealth((health) => ({
        ...health,
        elapsedMs: health.startedAt ? Date.now() - health.startedAt : health.elapsedMs,
        tabHidden: typeof document !== "undefined" ? document.hidden : false,
      }));
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "A video render is still running.";
    };
    const timer = window.setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("beforeunload", beforeUnload);
    update();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [isRendering]);

  // Sync with prop when returning to render tab
  useEffect(() => {
    if (propRenderedBlob) setRenderedBlob(propRenderedBlob);
    if (propRenderedUrl) setRenderedUrl(propRenderedUrl);
  }, [propRenderedBlob, propRenderedUrl]);

  /**
   * Idle canvas painter — the render screen shows the project's own imagery.
   *
   * The canvas used to stay black until "Start Video Render" was pressed,
   * which read as "no images in the render". It now plays the first scene
   * with the same framing, motion, filter and caption engine the export uses
   * (all the shared modules), looping gently like the live preview. It stops
   * the moment a real render starts — the render loop owns the canvas then.
   */
  useEffect(() => {
    if (isRendering || renderedUrl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { width, height } = getDimensions(settings.resolution);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const first = scenesWithImages[0];
    if (!first) {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);
      return;
    }

    let cancelled = false;
    let rafId = 0;
    let startedAt = 0;
    const LOOP_SECONDS = 14;

    const paint = (progress: number) => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);

      if (sceneIsBlankColor(first) && first.blank_color) {
        ctx.save();
        try { ctx.filter = "none"; } catch {}
        ctx.fillStyle = first.blank_color;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      } else if (idleImgRef.current && idleImgRef.current.naturalWidth > 0) {
        const { scale, dx, dy } = getSceneCameraTransform(
          first,
          sceneAnimationEnabled,
          progress,
          width,
          height,
          0
        );
        const safeScale = isNaN(scale) ? 1 : scale;
        const safeDx = isNaN(dx) ? 0 : dx;
        const safeDy = isNaN(dy) ? 0 : dy;
        try {
          drawSceneImage(ctx, idleImgRef.current, first, width, height, {
            motionScale: safeScale,
            motionDx: safeDx + (width * safeScale - width) / 2,
            motionDy: safeDy + (height * safeScale - height) / 2,
            filter: getFilterCanvas(videoFilter, width),
          });
        } catch {}
        try { ctx.filter = "none"; } catch {}
      }

      if (sceneAnimationEnabled) {
        try {
          renderSceneAnimationEffects(ctx, first, width, height, progress * LOOP_SECONDS, progress, { enabled: true });
        } catch {}
      }

      try {
        paintVideoFilter(ctx, videoFilter, width, height, progress * LOOP_SECONDS);
      } catch {}

      // Watermark + brand logo, same placement as the export
      if (watermarkImgRef.current && watermarkImgRef.current.naturalWidth > 0) {
        ctx.save();
        const watermark = getWatermarkLayout(
          width,
          height,
          watermarkImgRef.current.naturalWidth,
          watermarkImgRef.current.naturalHeight
        );
        ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
        ctx.shadowBlur = watermark.shadowBlur;
        ctx.shadowOffsetY = watermark.shadowOffsetY;
        ctx.drawImage(watermarkImgRef.current, watermark.x, watermark.y, watermark.width, watermark.height);
        ctx.restore();
      }

      if (settings.includeSubtitles && (first.burn_caption ?? true) && first.text) {
        try {
          renderCanvasCaptions(
            ctx,
            first.text,
            progress,
            captionsConfig || DEFAULT_CAPTIONS_CONFIG,
            width,
            height
          );
        } catch {}
      }
    };

    const tick = (now: number) => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        rafId = requestAnimationFrame(tick);
        return;
      }
      if (!startedAt) startedAt = now;
      const progress = ((now - startedAt) / 1000 / LOOP_SECONDS) % 1;
      paint(progress);
      rafId = requestAnimationFrame(tick);
    };

    void loadCaptionFonts()
      .then(() =>
        ensureCaptionFont(captionsConfig?.fontId || getCaptionStyle(captionsConfig?.preset).fontId)
      )
      .then(() => {
      if (cancelled) return;
      // Load through the shared loader: a failed photo shows the gradient
      // card exactly like the preview, never a black canvas.
      loadSceneImage(first.image_url || "", 0).then((res) => {
        if (cancelled) return;
        idleImgRef.current = res ? res.img : null;
        paint(0.35);
        rafId = requestAnimationFrame(tick);
      });
    });

    return () => {
      cancelled = true;
      if (rafId && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRendering, renderedUrl, scenesWithImages, videoFilter, settings.resolution, settings.includeSubtitles, captionsConfig, aspectRatio, propResolution, sceneAnimationEnabled]);

  // Attribution state - default collapsed ("do not open it yet")
  const [copiedAttribution, setCopiedAttribution] = useState(false);
  const [showAttributionPreview, setShowAttributionPreview] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Clip decoders in use by the current export, released when it ends. */
  const clipPoolRef = useRef<ClipPool | null>(null);
  const watermarkImgRef = useRef<HTMLImageElement | null>(null);
  const customerLogoImgRef = useRef<HTMLImageElement | null>(null);
  /** Locks out a second click while async export authorization/render cleanup is in flight. */
  const renderStartPendingRef = useRef(false);
  const abortControllerRef = useRef<boolean>(false);
  /** Frame pacing for the export — vsync-locked, worker-driven when hidden. */
  const frameTickerRef = useRef<FrameTicker | null>(null);
  /** Image behind the idle render-canvas painter. */
  const idleImgRef = useRef<HTMLImageElement | null>(null);
  /** Why the last render failed — read synchronously by the platform queue
   *  so a failed row can say what went wrong (state updates are async). */
  const lastRenderErrorRef = useRef<string>("");

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
      loadImage(logoUrl).then((img) => {
        customerLogoImgRef.current = img;
      });
    } else {
      customerLogoImgRef.current = null;
    }
  }, [customerLogo?.url]);

  // Resolution dimensions helper supporting resolution settings and aspect
  // ratio. The actual table lives in the Master Render Profile
  // (src/lib/render-profile.ts) — this only resolves which row to ask for.
  const getDimensions = (resOrRatio?: RenderSettings["resolution"] | AspectRatioType) => {
    const targetRes: ResolutionType = (resOrRatio === "720p" || resOrRatio === "1080p" || resOrRatio === "2k" || resOrRatio === "4k")
      ? resOrRatio
      : (settings?.resolution === "720p" || settings?.resolution === "2k" || settings?.resolution === "4k" ? settings.resolution : (propResolution || "1080p"));
    const currentRatio = aspectRatio || "16:9";
    const aspect: AspectRatioType =
      resOrRatio === "shorts_9_16" || resOrRatio === "9:16" || currentRatio === "9:16"
        ? "9:16"
        : resOrRatio === "square_1_1" || resOrRatio === "1:1" || currentRatio === "1:1"
        ? "1:1"
        : resOrRatio === "4:3" || currentRatio === "4:3"
        ? "4:3"
        : "16:9";
    return resolveRenderDimensions(aspect, targetRes);
  };

  /** The frame rate the export really runs at ("auto" → Scenering picks 30). */
  const effectiveFps = resolveFrameRate(settings.fps);

  /**
   * Scene images and logos load through the ONE shared loader
   * (src/lib/scene-image-loader.ts) — the same loader the live preview uses.
   * A scene photo that cannot be loaded resolves the preview's gradient
   * "Scene N" card instead of null, so the exported video can never show a
   * black frame where the preview showed a picture. Logos opt out of the
   * fallback (a missing watermark should simply not be drawn).
   */
  const loadImage = (url: string): Promise<HTMLImageElement | null> =>
    loadSceneImage(url, 0, { fallback: "none" }).then((r) => r?.img ?? null);

  // Load real background music buffer from library track
  const loadRealAmbientTrackBuffer = async (
    ctx: BaseAudioContext,
    style: RenderSettings["backgroundMusic"]
  ): Promise<AudioBuffer | null> => {
    if (style === "none") return null;
    const trackId = AMBIENT_STYLE_TO_TRACK[style];
    const track = trackId ? getBackgroundMusicTrack(trackId) : undefined;
    if (!track?.url) return null;
    try {
      const res = await fetch(track.url);
      if (!res.ok) return null;
      return await ctx.decodeAudioData(await res.arrayBuffer());
    } catch (err) {
      console.warn("Failed loading real ambient music track:", err);
      return null;
    }
  };

  // Helper to ensure scene duration matches speech narration with clean breathing space
  const getEffectiveSceneDuration = (scene: Scene, audioBufDuration?: number): number => {
    if (audioBufDuration && audioBufDuration > 0.3) {
      return Math.round((audioBufDuration + 0.25) * 10) / 10;
    }
    if (scene.duration && scene.duration > 0) {
      return scene.duration;
    }
    return calculateDynamicDuration(scene.text, scene.audio_duration);
  };

  // ------ RENDER VIDEO HANDLER ------
  // targetFormat records into that container: "mp4" (H.264 + AAC — the social
  // standard), "webm" (VP9/VP8 + Opus), or "mov" (the same H.264/AAC stream
  // saved with the QuickTime .mov extension). Omitted → the configured format.
  //
  // `plan` (optional) is a fully-resolved Master Render Profile recipe — the
  // multi-platform queue passes one per master encode (a vertical TikTok
  // master can be produced from a landscape project this way). Without a
  // plan the current settings are resolved through the same profile module.
  //
  // Returns the finished encode so callers (the queue) can reuse it; null on
  // failure or cancellation.
  const handleStartRender = async (
    targetFormat?: "mp4" | "webm" | "mov",
    plan?: RenderPlan & { label?: string },
    /** Set once the creator has seen, and accepted, the VIP warning below. */
    vipAcknowledged = false
  ): Promise<{ blob: Blob; container: "mp4" | "webm" } | null> => {
    if (scenesWithImages.length === 0 || isRendering || renderStartPendingRef.current) return null;
    renderStartPendingRef.current = true;
    setIsPreparingRender(true);

    // Draft is an unmetered preview. Every other encode reserves allowance
    // atomically before expensive work starts, preventing parallel-tab races.
    const isFinalExport = Boolean(plan) || settings.quality !== "draft";

    /* ------------------------------------------------------------- VIP
       A draft is a preview and shows everything. A FINAL download is the
       file people keep, and it goes out with only what the membership
       includes. Two things happen here, in this order:

       1. Nobody is surprised. If there is anything VIP in the project the
          render does not start — the dialog opens first and says exactly
          what is in there and what is about to happen to it.
       2. The renderer is handed a cleaned copy either way. Everything
          below draws from `exportInserts` / `exportFilter` / … rather than
          the project's own values, so a paid effect cannot reach the file
          through a check that was missed, a plan that changed mid-session
          or a stale answer from the server. */
    if (isFinalExport && vipFindings.length > 0 && !vipAcknowledged) {
      setVipPrompt({ format: targetFormat, plan });
      renderStartPendingRef.current = false;
      setIsPreparingRender(false);
      return null;
    }
    /* Cleaned for EVERY render, draft included. A draft is a cheap, unmetered
       encode, but it is still a file: it lands in the Vault and it has a
       download button, so "the preview may show it" cannot stretch to cover
       it. Watching the project play on this page is the preview; anything
       that writes a video goes out with what the membership includes.
       (The two findings that cannot be left out — the narration voice and
       the caption style — only stop a FINAL download; a draft is allowed to
       keep them, because it exists to be looked at and then thrown away.) */
    const exportSafe = stripVipFromExport(currentPlan, {
      inserts,
      videoFilter,
      sceneAnimationEnabled,
      motionStyle,
      captionsConfig,
      selectedVoice,
      sceneVoices: sceneVoiceIds,
      voiceEcho,
    });
    const exportInserts = exportSafe.inserts;
    const exportFilter = exportSafe.videoFilter;
    const exportSceneAnimation = exportSafe.sceneAnimationEnabled;
    const exportMotionStyle = exportSafe.motionStyle;
    const exportVoiceEcho = exportSafe.voiceEcho;
    setVipOmittedLast(exportSafe.removed);

    let exportReservationId: string | null = null;
    let exportCompleted = false;
    if (isFinalExport) {
      const durationMinutes = Math.max(0.01, totalDuration / 60);
      try {
        // Everything here is measured on the cleaned render — what the file
        // will contain — not on the project, which may still hold VIP work
        // the creator wants to keep for when they upgrade.
        const required = new Set<FeatureKey>();
        const narrationVoices = [selectedVoice || "speechify_male_01", ...sceneVoiceIds];
        if (narrationVoices.some((voiceId) => !isPlanVoiceIncluded("free", voiceId))) required.add("advanced_voice");
        if (captionsConfig?.enabled && !["newsroom_clean", "cinema_classic"].includes(captionsConfig.preset || "newsroom_clean")) required.add("premium_captions");
        if (exportMotionStyle && !["dynamic", "static", "none"].includes(exportMotionStyle)) required.add("camera_movements");
        if (exportSceneAnimation) required.add("special_effects");
        // Echo and ambience are written into the exported voice track, so the
        // export is what they are charged against; previewing them stays free.
        if (voiceEchoIsActive(resolveVoiceEcho(exportVoiceEcho))) required.add("voice_echo");
        if (exportFilter) required.add("filters");
        for (const insert of exportInserts) {
          const feature = INSERT_FEATURE[insert.category];
          if (feature) required.add(feature);
          // Free includes ONE button: the standard Subscribe badge as it
          // ships. Any other platform — and any badge restyled in the button
          // settings, Subscribe included — is an advanced call to action.
          if (insert.category === "call_to_action" && !isFreeCtaInsert(insert)) required.add("advanced_cta");
        }
        const membership = await getEntitlements(true);
        const denied = [...required].find((feature) => !membership.entitlements.features[feature]);
        if (denied) throw new Error(`Your current membership does not include ${denied.replace(/_/g, " ")} in a Final Export. You can still preview it or change membership.`);
        const creativeManifest = {
          features: [...required],
          voice: sceneVoiceIds.find((voiceId) => !isPlanVoiceIncluded("free", voiceId)) || selectedVoice || "speechify_male_01",
          captionStyle: captionsConfig?.preset || "newsroom_clean",
          backgroundMusic: exportInserts.filter((insert) => insert.category === "background_music").map((insert) => insert.type),
          audioVisualisers: exportInserts.filter((insert) => insert.category === "audio_visualizers" || insert.category === "speech_reactive").map((insert) => insert.type),
          // A restyled badge is reported with the :custom suffix so the server
          // refuses it by the same route as an unlisted platform, instead of
          // seeing a type that looks like the free Subscribe button.
          callsToAction: exportInserts
            .filter((insert) => insert.category === "call_to_action")
            .map((insert) => (isCtaCustomised(insert) ? `${insert.type}${CUSTOMISED_CTA_SUFFIX}` : insert.type)),
        };
        exportReservationId = await reserveFinalExport(project?.id ?? "unknown", durationMinutes, durationMinutes <= 1 ? "short" : "long", creativeManifest);
      } catch (authorizationError: any) {
        const message = authorizationError?.message || "This final export could not be authorized.";
        setRenderError(message);
        setRenderStatus({ active: false, error: message, stage: "Export authorization required" });
        renderStartPendingRef.current = false;
        setIsPreparingRender(false);
        return null;
      }
    }

    setIsRendering(true);
    setIsPreparingRender(false);
    setIsCancelling(false);
    setRenderTiming(null);
    setTimingCopied(false);
    reportProgress(0);
    setRenderError(null);
    setFailureReport(null);
    setShowFailureDetail(false);
    setRenderEngine("checking");
    setOfflineFailureReason(null);
    abortControllerRef.current = false;
    const renderStartedAt = Date.now();
    setRenderHealth({
      ...EMPTY_RENDER_HEALTH,
      startedAt: renderStartedAt,
      tabHidden: typeof document !== "undefined" ? document.hidden : false,
    });
    // Publish the job so the header can follow it even if the user leaves
    // this screen — the render itself keeps running either way.
    setRenderStatus({
      active: true,
      progress: 0,
      stage: "1/4: Preparing narration, visuals and audio…",
      title: project?.title || "Untitled render",
      startedAt: renderStartedAt,
      finishedAt: null,
      error: null,
      lastVaultId: null,
    });

    // Preview vs final render (§18 of the profile spec): the Draft preset is
    // a fast preview — 720p-class dimensions and a light bitrate — while
    // every other preset is a full platform-quality final encode.
    const dims = plan
      ? { width: plan.width, height: plan.height }
      : settings.quality === "draft"
      ? getDimensions("720p")
      : getDimensions(settings.resolution);
    const { width, height } = dims;
    // Constant frame rate: the canvas is captured at exactly this rate and
    // the frame ticker paces the loop to match — total frames = duration × FPS.
    const fpsUsed = plan ? plan.fps : effectiveFps;
    const videoKbps = plan
      ? plan.videoBitrateKbps
      : computeVideoBitrateKbps(width, height, fpsUsed, settings.quality);
    const audioKbps = plan ? plan.audioBitrateKbps : computeAudioBitrateKbps(settings.quality);

    lastRenderErrorRef.current = "";
    const canvas = canvasRef.current;
    if (!canvas) {
      lastRenderErrorRef.current = "The render canvas is not on screen (try staying on this page while rendering)";
      setRenderError("Canvas element not available");
      setRenderStatus({ active: false, error: "Canvas element not available", stage: "Render failed" });
      setIsRendering(false);
      return null;
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      lastRenderErrorRef.current = "The browser refused a 2D drawing context";
      setRenderError("2D Context unavailable");
      setRenderStatus({ active: false, error: "2D Context unavailable", stage: "Render failed" });
      setIsRendering(false);
      return null;
    }

    let releaseWakeLock: () => Promise<void> = async () => {};
    let renderAudioContext: AudioContext | null = null;

    try {
      releaseWakeLock = await holdRenderWakeLock((wakeLock) => {
        setRenderHealth((health) => ({ ...health, wakeLock }));
      });
      // Make sure the caption faces are ready before the first frame is
      // captured. The specific face has to be requested by name: canvas text
      // does not pull a web font in the way DOM text does, so without this
      // the export would burn in the fallback typeface even though the
      // preview showed the real one.
      await loadCaptionFonts();
      await ensureCaptionFont(
        captionsConfig?.fontId || getCaptionStyle(captionsConfig?.preset).fontId
      );

      // 1. Synthesizing audio & sound effects
      reportStage("1/4: Synthesizing narration voices & sound effects...");
      reportProgress(0.08);

      const audioCtx = new AudioContext();
      renderAudioContext = audioCtx;
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      const audioBuffers = new Map<number, { buffer: AudioBuffer; duration: number; words?: WordTiming[] }>();
      // A project with the voiceover switched off has no spoken track to
      // resolve, synthesise or schedule. Leaving this map empty is what makes
      // every later stage — scene lengths, the audio graph, the caption
      // clock — fall back to the footage and the script instead of a voice.
      for (let i = 0; voiceoverEnabled && i < scenesWithImages.length; i++) {
        if (abortControllerRef.current) throw new Error("Render cancelled");
        const s = scenesWithImages[i];
        const sceneVoice = s.voice_id || selectedVoice;

        // 1. Resolve directly from the saved voiceover section (memory, IndexedDB, or audio_url)
        let resolved = await resolveSceneAudioBuffer(s, audioCtx);
        if (!resolved && voiceoverEnabled) {
          if (s.audio_url) {
            throw new Error(`The saved audio for scene ${i + 1} could not be loaded. Re-import or regenerate that track.`);
          }
          if ((s.text || "").trim()) {
            const withTimeline = await fetchSceneAudioWithTimeline(s.text || "", sceneVoice, { timeoutMs: 20000 });
            if (!withTimeline) throw new Error(`Speechify returned no audio for scene ${i + 1}.`);
            const audioBuffer = await audioCtx.decodeAudioData(withTimeline.rawBuffer.slice(0));
            const blob = new Blob([withTimeline.rawBuffer], { type: withTimeline.mimeType });
            const blobUrl = URL.createObjectURL(blob);
            setCachedSceneAudio(s.id, sceneVoice, (s.text || "").trim(), {
              audioBuffer,
              blobUrl,
              duration: audioBuffer.duration,
              voiceId: sceneVoice,
              text: (s.text || "").trim(),
              rawBuffer: withTimeline.rawBuffer,
              blob,
              words: withTimeline.words,
            });
            resolved = {
              buffer: audioBuffer,
              duration: audioBuffer.duration,
              url: blobUrl,
              words: withTimeline.words,
            };
          }
        }
        if (resolved) {
          audioBuffers.set(s.id, {
            buffer: resolved.buffer,
            duration: resolved.duration,
            words: resolved.words && resolved.words.length > 0 ? resolved.words : undefined,
          });
        } else if ((s.text || "").trim()) {
          throw new Error(`No narration audio is available for scene ${i + 1}.`);
        }

        reportProgress(0.08 + (i / scenesWithImages.length) * 0.18);
      }

      // Build the immutable timeline before constructing either audio graph. Both
      // the offline and real-time paths consume this exact schedule.
      const introSec = introSection?.enabled ? introSection : null;
      const outroSec = outroSection?.enabled ? outroSection : null;
      const introDuration = introSec ? Math.max(0.5, introSec.duration) : 0;
      const outroDuration = outroSec ? Math.max(0.5, outroSec.duration) : 0;

      // When the video opens directly on a scene (no intro section), the
      // first image holds for a short lead-in before the first words are
      // spoken — the narration used to begin ~0.1s in, too soon to take in
      // the opening. An enabled intro section is its own opening, so the
      // lead-in only applies without one.
      const leadIn = narrationLeadIn(Boolean(introSec), voiceoverEnabled);

      let timelineOffset = introDuration;
      const sceneSchedule = scenesWithImages.map((s, idx) => {
        const item = audioBuffers.get(s.id);
        const sceneLength = sceneTimelineDuration(s, item ? item.duration : undefined);
        const speechDur = !voiceoverEnabled
          ? // Nothing is spoken, so the "speech" simply spans the scene. Any
            // other value would drift the captions away from the picture.
            sceneLength
          : item && item.duration > 0.3
            ? item.duration
            : calculateDynamicDuration(s.text, s.audio_duration);
        // The exact same scene-length formula the live preview uses
        // (src/lib/duration-utils.ts → sceneTimelineDuration): one number for
        // both, so the cut, the audio start and the caption flip all land on
        // the same moment in the preview and in the exported file.
        const sceneDur = sceneLength;
        // The first scene's window includes the lead-in; its narration (and
        // captions) begin speechOffset seconds into that window.
        const speechOffset = idx === 0 ? leadIn : 0;
        const windowDur = sceneDur + speechOffset;
        const entry = {
          scene: s,
          index: idx,
          startTime: timelineOffset,
          duration: windowDur,
          endTime: timelineOffset + windowDur,
          speechDuration: speechDur,
          speechOffset,
        };
        timelineOffset += windowDur;
        return entry;
      });

      const scriptTotalDuration = timelineOffset - introDuration;
      const outroStartTime = timelineOffset;
      const estimatedTotalDuration = Math.max(1, timelineOffset + outroDuration);

      const finishSuccessfulExport = async (
        finalBlob: Blob,
        recordedContainer: "mp4" | "webm",
        fallbackMime: string
      ): Promise<{ blob: Blob; container: "mp4" | "webm"; durableVaultCopy: boolean }> => {
        // Do not expose a final Blob or Vault download until the server has
        // atomically completed the reservation. Draft previews never reserve.
        if (exportReservationId) {
          await completeFinalExport(exportReservationId);
          exportCompleted = true;
        }
        let finishedBlob = finalBlob;
        let durableVaultCopy = false;
        let lastVaultId: string | null = null;
        reportProgress(0.99);
        reportStage("4/4: Securing the finished video in the Vault…");
        try {
          const entry = await saveRenderToVault({
            blob: finalBlob,
            title: plan?.label
              ? `${project?.title || "Untitled render"} — ${plan.label}`
              : project?.title || "Untitled render",
            mimeType: finalBlob.type || fallbackMime,
            durationSec: estimatedTotalDuration,
            width,
            height,
            label: `${resolutionToken(width, height)} · ${fpsUsed}fps CFR · ${recordedContainer.toUpperCase()} · ${getQualityLevel(settings.quality).name}`,
          });
          // IndexedDB returns its verified clone. Use that Blob for preview,
          // download and App state, then the OPFS staging file may be removed.
          finishedBlob = entry.blob;
          durableVaultCopy = entry.storageKind === "indexeddb";
          lastVaultId = entry.id;
          setVaultMessage(
            `Render finished — ${vaultRenders.length >= MAX_VAULT_RENDERS ? "oldest vault slot cleared, " : ""}waiting in the vault to download.`
          );
          void refreshVault();
        } catch (vaultErr) {
          console.warn("Vault save notice:", vaultErr);
          setVaultMessage("Render finished, but the Vault could not verify a copy. Download this video before closing the tab.");
        }

        const url = URL.createObjectURL(finishedBlob);
        setRenderedBlob(finishedBlob);
        setRenderedUrl(url);
        setRenderedContainer(recordedContainer);
        setSettings((current) => ({ ...current, format: recordedContainer }));
        reportProgress(1);
        reportStage("Render Complete! 🎉");
        onRenderSuccess?.(finishedBlob, url);
        setRenderStatus({
          active: false,
          progress: 1,
          stage: durableVaultCopy ? "Render finished — verified in the Vault" : "Render finished — download before closing",
          finishedAt: Date.now(),
          lastVaultId,
        });
        return { blob: finishedBlob, container: recordedContainer, durableVaultCopy };
      };

      // 2. Loading High-Resolution Visual Assets & Watermark
      reportStage("2/4: Loading high-resolution visuals & watermark...");
      reportProgress(0.28);

      /**
       * Bounded visual window.
       *
       * The old preparation step decoded every scene photo, built every
       * full-size graded canvas and opened every video decoder at once. A long
       * project can easily turn that into several gigabytes before frame one.
       * Sequential export only needs previous/current/next (the previous one
       * is retained for transitions), so keep exactly that three-scene window.
       */
      type RenderImage = (CanvasImageSource & { naturalWidth: number; naturalHeight: number }) | null;
      const images: RenderImage[] = new Array(scenesWithImages.length).fill(null);
      const imageLoads = new Map<number, Promise<void>>();
      const fallbackScenes = new Set<number>();
      const gradeForCache = getFilterCanvas(exportFilter, width);
      const clipPool = new ClipPool();
      clipPoolRef.current = clipPool;

      const loadWindowImage = (index: number): Promise<void> => {
        if (index < 0 || index >= scenesWithImages.length || images[index]) return Promise.resolve();
        const inFlight = imageLoads.get(index);
        if (inFlight) return inFlight;
        const task = loadSceneImage(scenesWithImages[index].image_url || "", index)
          .then((result) => {
            if (!result) return;
            images[index] = result.img as RenderImage;
            if (result.usedFallback) fallbackScenes.add(index);
            setImageFallbackCount(fallbackScenes.size);
            try {
              prewarmSceneFrame(result.img, scenesWithImages[index], width, height, gradeForCache);
            } catch {}
          })
          .finally(() => imageLoads.delete(index));
        imageLoads.set(index, task);
        return task;
      };

      const loadWindowClip = async (index: number): Promise<void> => {
        const scene = scenesWithImages[index];
        if (!scene || !sceneHasClip(scene)) return;
        const el = clipPool.get(scene);
        if (!el || el.readyState >= 2) return;
        await new Promise<void>((resolve) => {
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            resolve();
          };
          el.addEventListener("loadeddata", done, { once: true });
          el.addEventListener("error", done, { once: true });
          setTimeout(done, 8000);
        });
      };

      let visualWindowCenter = -1;
      let visualWindowTask: Promise<void> = Promise.resolve();
      const ensureVisualWindow = (center: number): Promise<void> => {
        const safeCenter = Math.max(0, Math.min(scenesWithImages.length - 1, center));
        if (safeCenter === visualWindowCenter) return visualWindowTask;
        visualWindowCenter = safeCenter;
        visualWindowTask = (async () => {
          const keep = [safeCenter - 1, safeCenter, safeCenter + 1].filter(
            (index) => index >= 0 && index < scenesWithImages.length,
          );
          await Promise.all(keep.flatMap((index) => [loadWindowImage(index), loadWindowClip(index)]));

          // Do not release the old window until the new one is ready: a slow
          // network image can never create a black gap at a scene boundary.
          const keepSet = new Set(keep);
          for (let index = 0; index < images.length; index++) {
            if (keepSet.has(index) || !images[index]) continue;
            const old = images[index] as HTMLImageElement;
            images[index] = null;
            try {
              if ("src" in old) old.src = "";
            } catch {}
          }
          clipPool.retain(keep.map((index) => scenesWithImages[index].id));
        })();
        return visualWindowTask;
      };

      // Frame zero and the next scene are decoded and prewarmed before any
      // encoder starts. Later windows are prepared as the sequential loop
      // reaches them.
      await ensureVisualWindow(0);

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

      const sceneIndexAt = (time: number): number => {
        if (sceneSchedule.length === 0) return 0;
        for (const entry of sceneSchedule) {
          if (time < entry.endTime) return entry.index;
        }
        return sceneSchedule[sceneSchedule.length - 1].index;
      };

      // Pure canvas pass: timeline time and analyser telemetry are explicit
      // inputs, so this produces the same pixels in real time or frame-by-frame.
      const drawFrameAt = (currentGlobalTime: number, audioFrame: AudioFrame | null): void => {
        try {
          const frameTelemetry = audioFrame || EMPTY_FRAME;
          const loudestFrameBus = frameTelemetry.voice.level >= frameTelemetry.music.level
            ? frameTelemetry.voice
            : frameTelemetry.music;
          const frameAudioLevel = audioFrame ? Math.min(1, 0.15 + loudestFrameBus.level * 2.6) : 0.4;
          const frameFreqData = audioFrame ? (loudestFrameBus.freq as Uint8Array) || null : null;
        // ==========================================
        // PHASE 1: INTRO SEGMENT
        // ==========================================
        if (introSec && currentGlobalTime < introDuration) {
          const progressInIntro = Math.min(1, currentGlobalTime / Math.max(0.1, introDuration));
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, width, height);

          try {
            renderSection(ctx, introSec, width, height, currentGlobalTime, progressInIntro);
          } catch (e) {
            console.warn("Intro section render notice:", e);
          }

          if (exportInserts && exportInserts.length > 0) {
            exportInserts
              .filter((i) => i.category !== "intro" && i.category !== "outro")
              .forEach((ins) => {
                try {
                  renderTimelineInsert(ctx, ins, currentGlobalTime, width, height, frameAudioLevel, frameFreqData, frameTelemetry);
                } catch {}
              });
          }

          return;
        }

        // ==========================================
        // PHASE 3: OUTRO SEGMENT
        // ==========================================
        if (outroSec && currentGlobalTime >= outroStartTime) {
          const elapsedInOutro = currentGlobalTime - outroStartTime;
          const progressInOutro = Math.min(1, elapsedInOutro / Math.max(0.1, outroDuration));
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, width, height);

          try {
            renderSection(ctx, outroSec, width, height, elapsedInOutro, progressInOutro);
          } catch (e) {
            console.warn("Outro section render notice:", e);
          }

          if (exportInserts && exportInserts.length > 0) {
            exportInserts
              .filter((i) => i.category !== "intro" && i.category !== "outro")
              .forEach((ins) => {
                try {
                  renderTimelineInsert(ctx, ins, currentGlobalTime, width, height, frameAudioLevel, frameFreqData, frameTelemetry);
                } catch {}
              });
          }

          return;
        }

        // ==========================================
        // PHASE 2: SCRIPT SCENES (Exact Schedule Match)
        // ==========================================
        let activeEntry = sceneSchedule[sceneSchedule.length - 1];
        for (let i = 0; i < sceneSchedule.length; i++) {
          const entry = sceneSchedule[i];
          if (currentGlobalTime >= entry.startTime && currentGlobalTime < entry.endTime) {
            activeEntry = entry;
            break;
          }
          if (i === 0 && currentGlobalTime < entry.startTime) {
            activeEntry = entry;
            break;
          }
        }

        const currentScene = activeEntry.scene;
        const currentSceneIdx = activeEntry.index;
        const elapsedInScene = Math.max(0, currentGlobalTime - activeEntry.startTime);
        const progressInScene = Math.min(1, elapsedInScene / Math.max(0.1, activeEntry.duration));
        // speechProgress reaches 1.0 at the exact moment spoken narration
        // completes. The first scene's speech begins speechOffset seconds
        // in (the opening lead-in), so both the progress and the
        // word-locked timing are measured from that moment.
        const activeSpokenDuration = Math.max(0.4, activeEntry.speechDuration);
        const speechElapsed = Math.max(0, elapsedInScene - activeEntry.speechOffset);
        const speechProgress = Math.min(
          1,
          Math.max(0, speechElapsed / Math.max(0.1, activeSpokenDuration))
        );

        // --- Draw background ---
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);

        // --- Draw image (or video clip) ---
        let img: (CanvasImageSource & { naturalWidth: number; naturalHeight: number }) | null =
          images[currentSceneIdx] as any;
        if (sceneHasClip(currentScene)) {
          const el = clipPool.get(currentScene);
          if (el) {
            clipPool.seekToProgress(currentScene, progressInScene, activeEntry.duration);
            if (el.readyState >= 2 && el.videoWidth > 0) {
              img = asDrawableClip(el) as any;
            }
          }
        }

        const prevEntry = currentSceneIdx > 0 ? sceneSchedule[currentSceneIdx - 1] : null;
        const prevScene = prevEntry ? prevEntry.scene : null;
        let prevImg: (CanvasImageSource & { naturalWidth: number; naturalHeight: number }) | null =
          currentSceneIdx > 0 ? (images[currentSceneIdx - 1] as any) : null;
        if (prevScene && sceneHasClip(prevScene)) {
          const el = clipPool.get(prevScene);
          if (el && el.readyState >= 2 && el.videoWidth > 0) {
            prevImg = asDrawableClip(el) as any;
          }
        }

        const { scale, dx, dy } = getSceneCameraTransform(
          currentScene,
          exportSceneAnimation,
          progressInScene,
          width,
          height,
          currentSceneIdx
        );
        const safeScale = isNaN(scale) ? 1 : scale;
        const safeDx = isNaN(dx) ? 0 : dx;
        const safeDy = isNaN(dy) ? 0 : dy;

        /**
         * A scene using a plain colour has no image to draw, so fill the
         * frame first. Painting it here — before the transition and before
         * the project filter — means a fade still darkens into the colour
         * and the filter still tints it, exactly as it would a photo.
         */
        if (sceneIsBlankColor(currentScene) && currentScene.blank_color) {
          ctx.save();
          try {
            ctx.filter = "none";
          } catch {}
          ctx.fillStyle = currentScene.blank_color;
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
        }

        let handledTransition = false;
        if (
          currentScene.transition &&
          currentScene.transition !== "none"
        ) {
          const transDur = getTransitionDuration(activeEntry.duration);
          if (elapsedInScene < transDur) {
            const { scale: prevScale, dx: prevDx, dy: prevDy } = prevScene
              ? getSceneCameraTransform(
                  prevScene,
                  exportSceneAnimation,
                  1,
                  width,
                  height,
                  Math.max(0, currentSceneIdx - 1)
                )
              : { scale: 1, dx: 0, dy: 0 };
            const safePrevScale = isNaN(prevScale) ? 1 : prevScale;
            const safePrevDx = isNaN(prevDx) ? 0 : prevDx;
            const safePrevDy = isNaN(prevDy) ? 0 : prevDy;

            handledTransition = drawSceneTransition(
              ctx,
              currentScene,
              img && img.naturalWidth > 0 ? img : null,
              prevScene || null,
              prevImg && prevImg.naturalWidth > 0 ? prevImg : null,
              elapsedInScene,
              activeEntry.duration,
              width,
              height,
              {
                motionScale: safeScale,
                motionDx: safeDx + (width * safeScale - width) / 2,
                motionDy: safeDy + (height * safeScale - height) / 2,
                filter: getFilterCanvas(exportFilter, width),
              },
              prevScene ? {
                motionScale: safePrevScale,
                motionDx: safePrevDx + (width * safePrevScale - width) / 2,
                motionDy: safePrevDy + (height * safePrevScale - height) / 2,
                filter: getFilterCanvas(exportFilter, width),
              } : undefined
            );
          }
        }

        if (!handledTransition && img && img.naturalWidth > 0 && img.naturalHeight > 0) {
          try {
            drawSceneImage(ctx, img, currentScene, width, height, {
              motionScale: safeScale,
              motionDx: safeDx + (width * safeScale - width) / 2,
              motionDy: safeDy + (height * safeScale - height) / 2,
              filter: getFilterCanvas(exportFilter, width),
            });
          } catch (drawErr) {
            console.warn("Scene draw notice:", drawErr);
          }

          try {
            ctx.filter = "none";
          } catch {}
        }

        // --- Per-scene living-scene animation layers ---
        if (exportSceneAnimation) {
          try {
            renderSceneAnimationEffects(
              ctx,
              currentScene,
              width,
              height,
              elapsedInScene,
              progressInScene,
              { enabled: true, audioLevel: frameAudioLevel }
            );
          } catch (animationErr) {
            console.warn("Scene animation notice:", animationErr);
          }
        }

        // --- Animated atmosphere of the project-wide filter ---
        try {
          paintVideoFilter(ctx, exportFilter, width, height, currentGlobalTime);
        } catch (filterErr) {
          console.warn("Video filter notice:", filterErr);
        }

        // --- Crisp Logo Watermark in Top-Left Corner ---
        if (
          settings.includeWatermark &&
          watermarkImgRef.current &&
          watermarkImgRef.current.naturalWidth > 0 &&
          watermarkImgRef.current.naturalHeight > 0
        ) {
          ctx.save();
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";

          const wmOpacity = Math.max(0.1, Math.min(1.0, settings.watermarkOpacity ?? 1.0));
          ctx.globalAlpha = wmOpacity;
          const watermark = getWatermarkLayout(
            width,
            height,
            watermarkImgRef.current.naturalWidth,
            watermarkImgRef.current.naturalHeight,
            settings.watermarkScale ?? 1
          );

          // Subtle soft shadow so transparent logo stands out cleanly on any video scene (matches preview 1:1)
          ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
          ctx.shadowBlur = watermark.shadowBlur;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = watermark.shadowOffsetY;

          // Draw crisp transparent watermark logo
          try {
            ctx.drawImage(watermarkImgRef.current, watermark.x, watermark.y, watermark.width, watermark.height);
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
          const cWidth = Math.max(20, Math.round(200 * cScale * scaleRatio));
          const cHeight = Math.max(10, Math.round((cWidth * customerLogoImgRef.current.naturalHeight) / Math.max(1, customerLogoImgRef.current.naturalWidth)));
          const cX = Math.max(0, width - cWidth - cMarginX);
          const cY = Math.max(0, cMarginY);

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

        // --- Subtitle & Caption Rendering (Speech Synchronized) ---
        // Held back through the opening lead-in so the captions appear
        // exactly when the voice starts speaking.
        // A scene switched off in the Captions step is skipped here too, so the
        // exported file matches what the preview showed.
        if (
          settings.includeSubtitles &&
          (currentScene.burn_caption ?? true) &&
          currentScene.text &&
          elapsedInScene >= activeEntry.speechOffset
        ) {
          try {
            const activeCaptionsConfig: CaptionsConfig = captionsConfig || DEFAULT_CAPTIONS_CONFIG;

            renderCanvasCaptions(
              ctx,
              currentScene.text,
              speechProgress,
              activeCaptionsConfig,
              width,
              height,
              {
                // Real per-word spoken timings: the highlight follows the
                // voice itself, not an estimate of it.
                wordTimings: audioBuffers.get(currentScene.id)?.words,
                audioTimeSec: speechElapsed,
              }
            );
          } catch (capErr) {
            console.warn("Captions render notice:", capErr);
          }
        }

        // --- Timeline Inserts & Overlays ---
        if (exportInserts && exportInserts.length > 0) {
          try {
            let audioLevel = 0.4;
            let freqData: Uint8Array | null = null;
            const insertAudioFrame = audioFrame || EMPTY_FRAME;
            const loudest = insertAudioFrame.voice.level >= insertAudioFrame.music.level
              ? insertAudioFrame.voice
              : insertAudioFrame.music;
            if (audioFrame) {
              audioLevel = Math.min(1, 0.15 + loudest.level * 2.6);
              freqData = (loudest.freq as Uint8Array) || null;
            }

            exportInserts.forEach((insert) => {
              try {
                renderTimelineInsert(ctx, insert, currentGlobalTime, width, height, audioLevel, freqData, insertAudioFrame, {
                  logo: customerLogo?.enabled ? customerLogoImgRef.current : null,
                });
              } catch (insErr) {
                console.warn("Insert notice:", insErr);
              }
            });
          } catch (insertsErr) {
            console.warn("Timeline inserts notice:", insertsErr);
          }
        }
        } catch (frameErr) {
          console.error("Frame render recoverable error:", frameErr);
        }
      };

      // Prefer a deterministic two-pass export. Nothing here is paced by wall
      // time: Web Audio renders the mix sample-exactly, then WebCodecs receives
      // one canvas snapshot for every timestamp in the CFR timeline.
      const requestedContainer: "mp4" | "webm" =
        targetFormat === "webm" ? "webm" : targetFormat === "mp4" || targetFormat === "mov"
          ? "mp4"
          : (plan ? plan.container : settings.format) === "webm" ? "webm" : "mp4";
      let offlineContainer: "mp4" | "webm" = requestedContainer;
      let offlineConfig: OfflineExportConfig = {
        container: offlineContainer,
        width,
        height,
        fps: fpsUsed,
        videoKbps,
        audioKbps,
        sampleRate: 48_000,
        channels: 2,
        /**
         * Upper bounds on how many chunks each track will produce, so the
         * muxer can reserve room for the index at the front of the file
         * instead of keeping the whole video in memory and rearranging it at
         * the end. One chunk per frame for video; AAC works in 1024-sample
         * frames, so the audio count follows from the duration. Rounded up
         * generously — reserving slightly too much space costs a few unused
         * bytes, reserving too little would fail the export.
         */
        expectedVideoChunks: Math.ceil(estimatedTotalDuration * fpsUsed) + 2,
        expectedAudioChunks: Math.ceil((estimatedTotalDuration * 48_000) / 1024) + 8,
      };
      let offlineProbe = await offlineExportSupported(offlineConfig);

      // Many Chromium builds expose VP9/Opus WebCodecs but not AAC or H.264
      // (especially Linux and embedded preview browsers). Preserve the
      // frame-exact timeline by switching container rather than falling all
      // the way back to real-time MediaRecorder.
      if (!offlineProbe.supported && requestedContainer === "mp4") {
        const mp4Reason = offlineProbe.reason;
        const webmConfig: OfflineExportConfig = { ...offlineConfig, container: "webm" };
        const webmProbe = await offlineExportSupported(webmConfig);
        if (webmProbe.supported) {
          offlineContainer = "webm";
          offlineConfig = webmConfig;
          offlineProbe = webmProbe;
          reportStage("MP4 WebCodecs unavailable — using frame-exact VP9/Opus WebM…");
          console.info("MP4 frame-exact codecs unavailable; preserving offline rendering with WebM:", mp4Reason);
        } else {
          offlineProbe = {
            ...webmProbe,
            reason: `MP4 failed: ${mp4Reason || "unsupported"}. WebM failed: ${webmProbe.reason || "unsupported"}`,
          };
        }
      }

      if (offlineProbe.supported && typeof OfflineAudioContext !== "undefined") {
        let offlineEncoder: OfflineExporter | null = null;
        try {
          reportStage("3/4: Rendering sample-exact audio mix…");
          reportProgress(0.32);
          // Times itself, because the renders that go wrong are the long ones
          // and nobody can be asked to sit and watch a nine-minute export to
          // tell me which part was slow.
          const renderTimer = new RenderTimer();
          renderTimer.stage("encoder setup");
          const totalFrames = Math.ceil(estimatedTotalDuration * fpsUsed);
          setRenderHealth((health) => ({ ...health, totalFrames }));
          // Configure real encoder instances before spending time on the audio
          // pass. A driver/configuration rejection is reported immediately.
          offlineEncoder = await OfflineExporter.create(offlineConfig);
          setRenderHealth((health) => ({
            ...health,
            outputStorage: offlineEncoder!.outputStorage,
            outputStorageDetail: offlineEncoder!.outputStorageDetail,
          }));
          setRenderEngine("frame-exact");
          reportStage(`3/4: Frame-exact ${offlineProbe.videoCodec} + ${offlineProbe.audioCodec} — rendering audio…`);
          renderTimer.stage("audio graph");
          const offlineCtx = new OfflineAudioContext(2, Math.ceil(estimatedTotalDuration * 48_000), 48_000);
          const visualizerFftSize = requiredVisualizerFftSize(exportInserts);
          const offlineMastering = createMasteringChain(offlineCtx, settings.audioMastering);
          offlineMastering.output.connect(offlineCtx.destination);

          const voiceAnalyser = offlineCtx.createAnalyser();
          voiceAnalyser.fftSize = visualizerFftSize;
          voiceAnalyser.smoothingTimeConstant = 0.72;
          voiceAnalyser.minDecibels = -92;
          voiceAnalyser.maxDecibels = -12;
          voiceAnalyser.connect(offlineMastering.voiceInput);
          const offlineMusicAnalyser = offlineCtx.createAnalyser();
          offlineMusicAnalyser.fftSize = visualizerFftSize;
          offlineMusicAnalyser.smoothingTimeConstant = 0.72;
          offlineMusicAnalyser.minDecibels = -92;
          offlineMusicAnalyser.maxDecibels = -12;
          offlineMusicAnalyser.connect(offlineMastering.musicInput);

          let offlineEcho: VoiceEchoGraph | null = null;
          const offlineEchoConfig = resolveVoiceEcho(exportVoiceEcho);
          if (voiceEchoIsActive(offlineEchoConfig)) {
            offlineEcho = createVoiceEchoGraph(offlineCtx, offlineEchoConfig);
            offlineEcho.output.connect(voiceAnalyser);
          }
          for (const entry of sceneSchedule) {
            const item = audioBuffers.get(entry.scene.id);
            if (!item) continue;
            /* Each narration line opens from silence over ~12ms through its own
               gain, exactly as the preview does — so the exported soundtrack
               cannot carry the step-in of a buffer starting at full gain, and
               the preview and the file sound like the same performance. */
            startVoiceSource(offlineCtx, item.buffer, offlineEcho ? offlineEcho.input : voiceAnalyser, {
              whenSeconds: entry.startTime + entry.speechOffset,
            });
          }

          // Legacy render-page ambient bed (normally timeline inserts now).
          if (settings.backgroundMusic !== "none" && settings.musicVolume > 0) {
            const styleTrackId = AMBIENT_STYLE_TO_TRACK[settings.backgroundMusic];
            const track = styleTrackId ? getBackgroundMusicTrack(styleTrackId) : undefined;
            if (track) {
              try {
                const response = await fetch(track.url);
                if (response.ok) {
                  const source = offlineCtx.createBufferSource();
                  source.buffer = await offlineCtx.decodeAudioData(await response.arrayBuffer());
                  source.loop = true;
                  const gain = offlineCtx.createGain();
                  gain.gain.value = Math.max(0, Math.min(1, settings.musicVolume)) * 0.85;
                  source.connect(gain);
                  source.start(0);
                  gain.connect(offlineMusicAnalyser);
                }
              } catch (error) {
                console.warn("Offline ambient track decode failed:", error);
              }
            }
          }

          const insertPlans = [
            ...buildInsertAudioPlan(exportInserts, estimatedTotalDuration),
            ...buildSectionAudioPlan(introSec, outroSec, introDuration, estimatedTotalDuration),
          ];
          const offlineInsertMixer = new InsertAudioMixer(offlineCtx, offlineMusicAnalyser);
          await offlineInsertMixer.load(insertPlans);
          // Placed on the timeline up front, to the sample, so the render does
          // not have to stop once per frame to ask whether a sound is due.
          offlineInsertMixer.scheduleAll();

          // One packed allocation replaces tens of thousands of retained
          // AudioFrame objects/ArrayBuffers on a long render. Scratch arrays
          // are reused at every suspension point and copied into a fixed row.
          const telemetry = new PackedAudioTelemetry(
            totalFrames,
            voiceAnalyser.frequencyBinCount,
            voiceAnalyser.fftSize,
          );
          setRenderHealth((health) => ({ ...health, telemetryBytes: telemetry.byteLength }));
          const voiceFreq = new Uint8Array(voiceAnalyser.frequencyBinCount);
          const voiceWave = new Uint8Array(voiceAnalyser.fftSize);
          const musicFreq = new Uint8Array(offlineMusicAnalyser.frequencyBinCount);
          const musicWave = new Uint8Array(offlineMusicAnalyser.fftSize);
          const readLevel = (
            node: AnalyserNode,
            freq: Uint8Array<ArrayBuffer>,
            wave: Uint8Array<ArrayBuffer>,
          ) => {
            node.getByteFrequencyData(freq);
            node.getByteTimeDomainData(wave);
            let sum = 0;
            for (let n = 0; n < freq.length; n++) sum += freq[n];
            return sum / Math.max(1, freq.length * 255);
          };

          /**
           * Register a small look-ahead window of suspension points. A purely
           * sequential suspend can lose a race with the very fast offline
           * audio thread; registering all 27,000 points up front avoids that
           * race but retains 27,000 promises. At the last suspended frame of
           * each window the next window is registered *before* resume(), so
           * the renderer can never pass it and only a few seconds of promises
           * are live at once.
           */
          const captureTelemetry = () => new Promise<void>((resolve, reject) => {
            const WINDOW_FRAMES = Math.max(30, Math.round(fpsUsed * 4));
            const STRIDE = TELEMETRY_SAMPLE_STRIDE;
            let settled = false;
            const fail = (error: unknown) => {
              if (settled) return;
              settled = true;
              reject(error);
            };
            /** The last frame this window suspends at (every STRIDE-th frame). */
            const lastSampleIn = (start: number, end: number) =>
              start + Math.floor((end - 1 - start) / STRIDE) * STRIDE;
            const scheduleWindow = (start: number) => {
              const end = Math.min(totalFrames, start + WINDOW_FRAMES);
              const lastSample = lastSampleIn(start, end);
              for (let frame = start; frame <= lastSample; frame += STRIDE) {
                offlineCtx.suspend(frame / fpsUsed).then(async () => {
                  if (abortControllerRef.current) throw new Error("Render cancelled");
                  const voiceLevel = readLevel(voiceAnalyser, voiceFreq, voiceWave);
                  const musicLevel = readLevel(offlineMusicAnalyser, musicFreq, musicWave);
                  /* One sample covers the frames it stands for: three times
                     fewer suspend/resume round trips on the main thread, and
                     every frame still has its row. */
                  telemetry.setAnalyserSpan(
                    frame,
                    frame + STRIDE,
                    voiceLevel,
                    voiceFreq,
                    voiceWave,
                    musicLevel,
                    musicFreq,
                    musicWave,
                  );
                  offlineMastering.updateVoiceLevel(voiceLevel, offlineCtx.currentTime);

                  // Extend the runway while the context is safely suspended.
                  if (frame === lastSample && end < totalFrames) scheduleWindow(end);
                  await offlineCtx.resume();
                  if (end >= totalFrames && frame === lastSample && !settled) {
                    settled = true;
                    resolve();
                  }
                }).catch(fail);
              }
            };
            if (totalFrames <= 1) {
              settled = true;
              resolve();
            } else {
              scheduleWindow(1);
            }
          });
          // The first look-ahead window is registered synchronously before
          // startRendering begins.
          renderTimer.stage("audio render + telemetry");
          const telemetryCapture = captureTelemetry();
          const rendering = offlineCtx.startRendering();
          const [mixedAudio] = await Promise.all([rendering, telemetryCapture]);
          if (abortControllerRef.current) throw new Error("Render cancelled");

          renderTimer.stage("video frames");
          const encodeBudget = createFrameBudget();
          let assetScene = -1;
          let lastOfflineProgressAt = 0;
          for (let frame = 0; frame < totalFrames; frame++) {
            if (abortControllerRef.current) throw new Error("Render cancelled");
            const time = frame / fpsUsed;
            const nextAssetScene = sceneIndexAt(time);
            if (nextAssetScene !== assetScene) {
              await ensureVisualWindow(nextAssetScene);
              assetScene = nextAssetScene;
            }
            let active = sceneSchedule[sceneSchedule.length - 1];
            for (const entry of sceneSchedule) {
              if (time >= entry.startTime && time < entry.endTime) { active = entry; break; }
              if (time < entry.startTime) { active = entry; break; }
            }
            if (active && sceneHasClip(active.scene) && time >= active.startTime && time < active.endTime) {
              const elapsed = Math.max(0, time - active.startTime);
              await clipPool.seekExact(active.scene, Math.min(1, elapsed / Math.max(0.1, active.duration)), active.duration);
            }
            drawFrameAt(time, telemetry.frame(frame));
            await offlineEncoder.encodeCanvas(canvas, frame);
            const progressNow = performance.now();
            if (frame === totalFrames - 1 || progressNow - lastOfflineProgressAt >= 250) {
              lastOfflineProgressAt = progressNow;
              const progress = 0.35 + ((frame + 1) / totalFrames) * 0.5;
              reportProgress(Math.min(0.85, progress));
              reportStage(`3/4: Encoding frame ${frame + 1} of ${totalFrames} (frame-exact)…`);
              setRenderHealth((health) => ({
                ...health,
                framesDone: frame + 1,
                outputBytes: offlineEncoder!.bytesWritten,
                queuedOutputBytes: offlineEncoder!.queuedOutputBytes,
              }));
            }
            // Hand the browser a turn on a time budget rather than every
            // fourth frame, and through a message rather than a timer —
            // timers are clamped to a second once the tab is in the
            // background, which is what made a long render crawl the moment
            // you looked at something else.
            await encodeBudget.maybeYield();
          }

          /**
           * Everything past this point used to sit behind a single 94% and a
           * frozen window: the soundtrack was encoded in one unbroken loop,
           * then the container was assembled in another. On a nine-minute
           * video that is a long time to look at a bar that is not moving,
           * and long enough to look like a crash. Both now yield, and both
           * report where they are.
           */
          renderTimer.stage("audio encode");
          reportStage("4/4: Encoding sample-exact audio…");
          reportProgress(0.86);
          await offlineEncoder.encodeAudio(mixedAudio, 4_800, (fraction) => {
            reportProgress(0.86 + fraction * 0.08);
          });
          setRenderHealth((health) => ({
            ...health,
            outputBytes: offlineEncoder!.bytesWritten,
            queuedOutputBytes: offlineEncoder!.queuedOutputBytes,
          }));

          renderTimer.stage("finalise container");
          reportStage("4/4: Finalising the container…");
          reportProgress(0.95);
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          const offlineBlob = await offlineEncoder.finalize();
          setRenderHealth((health) => ({
            ...health,
            framesDone: totalFrames,
            outputBytes: offlineBlob.size,
            queuedOutputBytes: 0,
          }));
          renderTimer.stop();
          renderTimer.note(
            "video",
            `${Math.round(estimatedTotalDuration)}s at ${fpsUsed}fps (${totalFrames} frames), ${offlineConfig.width}x${offlineConfig.height}`
          );
          renderTimer.note(
            "file",
            `${(offlineBlob.size / 1_048_576).toFixed(0)} MB ${offlineContainer.toUpperCase()}`
          );
          renderTimer.note("output storage", offlineEncoder.outputStorageDetail);
          renderTimer.note("audio telemetry", `${(telemetry.byteLength / 1_048_576).toFixed(1)} MB packed`);
          renderTimer.note("visual assets", "bounded 3-scene decode window");
          const timingReport = renderTimer.format();
          console.log(timingReport);
          setRenderTiming(timingReport);
          reportProgress(0.98);
          offlineMastering.dispose();
          offlineEcho?.dispose();
          offlineInsertMixer.dispose();
          setRenderEngine("frame-exact");
          setOfflineFailureReason(null);
          const finished = await finishSuccessfulExport(offlineBlob, offlineContainer, offlineBlob.type);
          if (finished.durableVaultCopy) {
            await offlineEncoder.releaseOutputStorage();
          }
          return { blob: finished.blob, container: finished.container };
        } catch (offlineError) {
          offlineEncoder?.close();
          if (abortControllerRef.current) throw offlineError;
          const reason = offlineError instanceof Error
            ? `${offlineError.name}: ${offlineError.message}`
            : String(offlineError);
          setOfflineFailureReason(reason);
          console.error("Frame-exact offline export failed:", offlineError);
          if (requireFrameExact) {
            throw new Error(`Frame-exact export failed. ${reason}`);
          }
          setRenderEngine("compatibility");
          reportStage(`Compatibility fallback: ${reason}`);
          reportProgress(0.34);
        }
      } else {
        const reason = typeof OfflineAudioContext === "undefined"
          ? "OfflineAudioContext is unavailable in this browser"
          : offlineProbe.reason || "WebCodecs configuration is unsupported";
        setOfflineFailureReason(reason);
        console.error("Frame-exact offline export unsupported:", reason);
        if (requireFrameExact) {
          throw new Error(`Frame-exact export is required but unavailable. ${reason}`);
        }
        setRenderEngine("compatibility");
        reportStage(`Compatibility fallback: ${reason}`);
      }

      // Automatic compatibility fallback remains available only when the
      // user explicitly unticks "Require frame-exact rendering".
      setRenderEngine("compatibility");
      setRenderHealth((health) => ({
        ...health,
        outputStorage: "memory",
        outputStorageDetail: "Compatibility recorder chunks in memory",
      }));
      if (typeof MediaRecorder === "undefined") {
        throw new Error("This browser supports neither WebCodecs offline export nor MediaRecorder");
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

      // Optional audio mastering stage (Master Render Profile §12/§13):
      // Automatic (default) protects the final mix — no clipping, no runaway
      // loudness, and voice-priority ducking so music never buries speech.
      // Manual passes the user's own mix through completely untouched.
      const mastering: MasteringChain = createMasteringChain(audioCtx, settings.audioMastering);
      mastering.output.connect(dest);

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
      // library (no synthetic tones).
      let ambientGainNode: AudioNode | null = null;
      if (settings.backgroundMusic !== "none" && settings.musicVolume > 0) {
        const styleTrackId = AMBIENT_STYLE_TO_TRACK[settings.backgroundMusic];
        const track = styleTrackId ? getBackgroundMusicTrack(styleTrackId) : undefined;
        if (track) {
          try {
            const res = await fetch(track.url);
            if (res.ok) {
              const musicBuf = await audioCtx.decodeAudioData(await res.arrayBuffer());
              const src = audioCtx.createBufferSource();
              src.buffer = musicBuf;
              src.loop = true; // real tracks loop to fill the whole video
              const g = audioCtx.createGain();
              g.gain.value = Math.max(0, Math.min(1, settings.musicVolume)) * 0.85;
              src.connect(g);
              g.connect(mastering.musicInput || dest);
              src.start();
              ambientGainNode = g;
            }
          } catch (musicErr) {
            console.warn("Real background track failed to load:", musicErr);
          }
        }
      }

      // Paint initial background on canvas so captureStream receives valid dimensions & non-empty buffer immediately
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);

      // Video recording stream — captured at the profile's constant rate
      let videoStream: MediaStream;
      try {
        videoStream = canvas.captureStream(fpsUsed);
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

      // Recording container. The requested format is honoured when the browser
      // can record it, and the fallback is always HONEST: the download
      // extension matches whatever was actually recorded. (Before, the
      // recorder always produced WebM while the file was named .mp4 — the
      // mislabelled file is why the download "did not work" in players.)
      const MP4_MIMES = [
        "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
        "video/mp4;codecs=avc1,mp4a.40.2",
        "video/mp4",
      ];
      const WEBM_MIMES = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ];
      const wantedContainer: "mp4" | "webm" =
        targetFormat === "webm"
          ? "webm"
          : targetFormat === "mp4" || targetFormat === "mov"
          ? "mp4"
          : (plan ? plan.container : settings.format) === "webm"
          ? "webm"
          : "mp4";
      let mimeType = "";
      for (const candidate of wantedContainer === "mp4" ? MP4_MIMES : WEBM_MIMES) {
        if (MediaRecorder.isTypeSupported(candidate)) {
          mimeType = candidate;
          break;
        }
      }
      if (!mimeType) {
        // Browser cannot record the wanted container → use the other one and
        // say so through the file extension (never a mislabelled file).
        for (const candidate of wantedContainer === "mp4" ? WEBM_MIMES : MP4_MIMES) {
          if (MediaRecorder.isTypeSupported(candidate)) {
            mimeType = candidate;
            break;
          }
        }
      }

      // Bitrates come from the Master Render Profile's platform-aware ladder
      // (src/lib/render-profile.ts) — scaled to the real frame size and rate,
      // never one arbitrary number for every video.
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(combinedStream, {
          ...(mimeType ? { mimeType } : {}),
          videoBitsPerSecond: videoKbps * 1000,
          audioBitsPerSecond: audioKbps * 1000,
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

      const recordedContainer: "mp4" | "webm" = (recorder.mimeType || mimeType || "video/webm").includes("mp4")
        ? "mp4"
        : "webm";

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onerror = (e: any) => {
        console.error("MediaRecorder runtime error:", e);
      };

      // 3. Render frames & play audio in real time with exact timeline synchronization
      reportStage(`3/4: Preparing real-time compatibility timeline...`);
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
        }, Math.max(15, estimatedTotalDuration + 15) * 1000);
      });

      const visualizerFftSize = requiredVisualizerFftSize(exportInserts);

      // Voice bus → mastering voice input (never ducked, always intelligible)
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = visualizerFftSize;
      analyser.smoothingTimeConstant = 0.72;
      analyser.minDecibels = -92;
      analyser.maxDecibels = -12;
      analyser.connect(mastering.voiceInput);

      // Music bus: background track / SFX analysed separately, then through
      // the mastering stage's ducking path (music steps aside for speech)
      const musicAnalyser = audioCtx.createAnalyser();
      musicAnalyser.fftSize = visualizerFftSize;
      musicAnalyser.smoothingTimeConstant = 0.72;
      musicAnalyser.minDecibels = -92;
      musicAnalyser.maxDecibels = -12;
      musicAnalyser.connect(mastering.musicInput);

      if (ambientGainNode) {
        try {
          ambientGainNode.disconnect();
        } catch {}
        ambientGainNode.connect(musicAnalyser);
      }

      const echoCfg = resolveVoiceEcho(exportVoiceEcho);
      let voiceEchoGraph: VoiceEchoGraph | null = null;
      if (voiceEchoIsActive(echoCfg)) {
        try {
          voiceEchoGraph = createVoiceEchoGraph(audioCtx, echoCfg);
          voiceEchoGraph.output.connect(analyser);
        } catch (echoErr) {
          console.warn("Voice echo could not be created, rendering a dry voice:", echoErr);
          voiceEchoGraph = null;
        }
      }

      // Mix timeline insert audio (BGM, SFX, CTA jingles, intro/outro sounds)
      let insertMixer: InsertAudioMixer | null = null;
      try {
        const insertPlans = [
          ...buildInsertAudioPlan(exportInserts, estimatedTotalDuration),
          ...buildSectionAudioPlan(introSec, outroSec, introDuration, estimatedTotalDuration),
        ];
        if (insertPlans.length > 0) {
          insertMixer = new InsertAudioMixer(audioCtx, musicAnalyser);
          const loaded = await insertMixer.load(insertPlans);
          if (loaded > 0) {
            reportStage(`3/4: Audio ready (${loaded} track(s)) — rendering video...`);
          }
        }
      } catch (err) {
        console.warn("Insert audio render setup warning:", err);
      }

      // Pre-schedule EVERY scene's narration at its exact planned offset from renderAudioT0.
      const renderAudioT0 = audioCtx.currentTime + 0.12;
      const scheduledSources: AudioBufferSourceNode[] = [];
      const stopScheduledAudio = () => {
        for (const src of scheduledSources) {
          try {
            src.stop();
          } catch {}
        }
      };

      sceneSchedule.forEach((entry) => {
        const item = audioBuffers.get(entry.scene.id);
        if (item) {
          try {
            const source = audioCtx.createBufferSource();
            source.buffer = item.buffer;
            source.connect(voiceEchoGraph ? voiceEchoGraph.input : analyser);
            source.start(renderAudioT0 + entry.startTime + entry.speechOffset);
            scheduledSources.push(source);
          } catch (audioErr) {
            console.warn("Error scheduling scene audio:", audioErr);
          }
        }
      });

      if (insertMixer) {
        try {
          insertMixer.startFrom(0);
        } catch {}
      }

      // Synchronize exact start: wait until audioCtx reaches renderAudioT0
      await new Promise<void>((resolveWait) => {
        const waitLoop = () => {
          if (audioCtx.currentTime >= renderAudioT0 || abortControllerRef.current) {
            resolveWait();
          } else {
            requestAnimationFrame(waitLoop);
          }
        };
        waitLoop();
      });

      // Start recording at the exact moment audio playback begins
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

      const renderStartTime = performance.now();
      let smoothedGlobalTime = 0;
      let lastFrameWallTime = renderStartTime;
      let lastProgressUiUpdate = 0;
      let lastProgressVal = 0.35;
      let lastResumeAttempt = 0;
      let realTimeAssetScene = 0;

      // Frame drawing loop with robust error boundaries and background tab resilience.
      //
      // Pacing comes from the shared frame ticker: requestAnimationFrame while
      // the tab is visible (true vsync cadence — the exported motion glides),
      // a Web Worker timer while it is hidden (page timers would be throttled
      // to ~1Hz and the video would judder), and a watchdog if both stall.
      // The previous loop raced a 16ms setTimeout against every rAF, and the
      // resulting jitter was captured straight into the file: the Ken Burns
      // read as choppy, jumping frames instead of a camera move.
      await new Promise<void>((resolveLoop) => {
        let isLoopFinished = false;
        const ticker = createFrameTicker(() => renderFrame());
        frameTickerRef.current = ticker;

        const cleanupAndFinish = () => {
          if (isLoopFinished) return;
          isLoopFinished = true;
          ticker.stop();
          if (frameTickerRef.current === ticker) frameTickerRef.current = null;
          try {
            insertMixer?.stop();
          } catch {}
          try {
            voiceEchoGraph?.dispose();
          } catch {}
          try {
            mastering.dispose();
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

        const renderFrame = () => {
          if (isLoopFinished) return;

          if (abortControllerRef.current) {
            cleanupAndFinish();
            return;
          }

          try {
            const now = performance.now();
            const dt = Math.max(0, Math.min(0.1, (now - lastFrameWallTime) / 1000));
            lastFrameWallTime = now;

            // Direct phase-lock to Web Audio hardware clock: zero lag, zero drift
            const targetAudioTime = audioCtx.state === "running"
              ? Math.max(0, audioCtx.currentTime - renderAudioT0)
              : smoothedGlobalTime + dt;

            if (audioCtx.state === "running") {
              smoothedGlobalTime = targetAudioTime;
            } else {
              smoothedGlobalTime += dt;
            }
            const currentGlobalTime = smoothedGlobalTime;

            const nextAssetScene = sceneIndexAt(currentGlobalTime);
            if (nextAssetScene !== realTimeAssetScene) {
              realTimeAssetScene = nextAssetScene;
              // The previous scene preloaded this one; now prefetch one more.
              // Real-time fallback cannot pause its audio clock to await I/O.
              void ensureVisualWindow(nextAssetScene);
            }

            if (audioCtx.state !== "running" && now - renderStartTime - lastResumeAttempt > 2000) {
              lastResumeAttempt = now - renderStartTime;
              audioCtx.resume().catch(() => {});
            }

            try {
              insertMixer?.tick(currentGlobalTime);
            } catch {}

            // Check if render reached end
            if (currentGlobalTime >= estimatedTotalDuration) {
              cleanupAndFinish();
              return;
            }

            const rawProgress = 0.35 + (currentGlobalTime / estimatedTotalDuration) * 0.55;
            const clampedProgress = Math.min(0.92, Math.max(0.35, isNaN(rawProgress) ? 0.35 : rawProgress));

            if (now - lastProgressUiUpdate > 250 || Math.abs(clampedProgress - lastProgressVal) >= 0.01) {
              lastProgressUiUpdate = now;
              lastProgressVal = clampedProgress;
              reportProgress(clampedProgress);
              reportStage(
                `3/4: Compatibility render (${formatDuration(currentGlobalTime)} / ${formatDuration(estimatedTotalDuration)})`
              );
            }

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
            const audioFrame: AudioFrame = { voice: readBus(analyser), music: readBus(musicAnalyser) };
            try { mastering.updateVoiceLevel(audioFrame.voice.level, audioCtx.currentTime); } catch {}
            // Seeking is clock/mixer work, not canvas work; keep drawFrameAt pure.
            let clipEntry = sceneSchedule[sceneSchedule.length - 1];
            for (const entry of sceneSchedule) {
              if (currentGlobalTime >= entry.startTime && currentGlobalTime < entry.endTime) { clipEntry = entry; break; }
              if (currentGlobalTime < entry.startTime) { clipEntry = entry; break; }
            }
            if (clipEntry && sceneHasClip(clipEntry.scene)) {
              const elapsed = Math.max(0, currentGlobalTime - clipEntry.startTime);
              clipPool.seekToProgress(clipEntry.scene, Math.min(1, elapsed / Math.max(0.1, clipEntry.duration)), clipEntry.duration);
            }
            drawFrameAt(currentGlobalTime, audioFrame);
          } catch (frameErr) {
            console.error("Frame render recoverable error:", frameErr);
          }
        };

        ticker.start(fpsUsed);
      });

      // 4. Encoding stream & packaging
      reportStage("4/4: Finalizing video stream & container...");
      reportProgress(0.95);

      const finalBlob = await videoPromise;
      stopScheduledAudio();

      return await finishSuccessfulExport(finalBlob, recordedContainer, mimeType || "video/webm");
    } catch (err: any) {
      const message = err?.message || "Failed to render video";
      if (abortControllerRef.current || message === "Render cancelled") {
        setRenderError(null);
        setFailureReport(null);
        setRenderStatus({ active: false, progress: 0, stage: "Render cancelled", error: null });
        return null;
      }
      console.error("Render failed:", err);
      // Never show a bare "Rendering failed": translate the failure into a
      // human explanation, keep the raw log under Advanced Details, and
      // offer an automatic retry with a compatible profile.
      const report = describeRenderFailure(String(err?.stack || message));
      lastRenderErrorRef.current = report.title;
      setFailureReport(report);
      setRenderError(message);
      setRenderStatus({ active: false, error: message, stage: "Render failed" });
      return null;
    } finally {
      if (exportReservationId && !exportCompleted) {
        try { await cancelFinalExport(exportReservationId); }
        catch (cleanupError) { console.warn("Could not release the unused export reservation:", cleanupError); }
      }
      try { await releaseWakeLock(); } catch (cleanupError) { console.warn("Could not release the render wake lock:", cleanupError); }
      setRenderHealth((health) => ({
        ...health,
        elapsedMs: health.startedAt ? Date.now() - health.startedAt : health.elapsedMs,
        wakeLock: "released",
      }));
      // Belt and braces: the loop stops its own ticker on cleanup, but an
      // exception between start and cleanup must not leave it ticking.
      try {
        frameTickerRef.current?.stop();
        frameTickerRef.current = null;
      } catch {}
      // Release every clip decoder used during the export.
      try {
        clipPoolRef.current?.dispose();
        clipPoolRef.current = null;
      } catch {}
      try {
        if (renderAudioContext && renderAudioContext.state !== "closed") {
          await renderAudioContext.close();
        }
      } catch {}
      renderAudioContext = null;
      // Keep the cancel state and start lock until *all* asynchronous cleanup
      // has settled, so a second render cannot inherit old audio or wake-lock work.
      renderStartPendingRef.current = false;
      setIsPreparingRender(false);
      setIsRendering(false);
      setIsCancelling(false);
    }
  };

  // ------ DOWNLOAD HANDLERS ------
  // Automatic useful filenames from the Master Render Profile:
  // ProjectName_YouTube_1080p_30fps.mp4 — the middle token is the
  // destination chosen in Project Setup ("Master" for custom output).
  // No spaces or problem characters, ever.
  const renderFileName = (title: string, ext: string, targetLabel?: string) => {
    const d = getDimensions(settings.resolution);
    const token = targetLabel || destinationFileToken(renderProfile.destination);
    return buildRenderFilename(title || "Scenering_Video", token, d.width, d.height, effectiveFps, ext);
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
    // The extension ALWAYS matches the container that was really recorded —
    // the old code named every file by the configured format, so a WebM
    // recording downloaded as .mp4 and players rejected it.
    const ext = renderedContainer === "mp4" ? "mp4" : "webm";
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

  const getAttributionText = () => {
    const soundUrlsUsed = inserts
      .map((ins) => ins.audioSettings?.soundUrl)
      .filter((u): u is string => Boolean(u));

    const currentVoice = availableVoices?.find((v) => v.id === selectedVoice);
    const voiceDisplay = currentVoice ? currentVoice.name : (selectedVoice || "Speechify narrator");
    const isCustomImport = selectedVoice?.startsWith("custom:") || selectedVoice?.startsWith("import:");
    const isSpeechifyStyle = Boolean(currentVoice?.id.startsWith("speechify_"));
    const voiceGender = currentVoice?.gender === "male"
      ? "Male Narrator"
      : currentVoice?.gender === "female"
        ? "Female Narrator"
        : "Narrator";

    // Only the image sources this project's scenes actually use are credited;
    // anything unused stays out of the document.
    const usedImageSources = new Set<string>();
    for (const s of scenes) {
      const url = resolveLegacyLocalImage((s.image_url || "").trim());
      if (!url) continue;
      // `custom-image:` is an upload from this device, same as data:/blob:.
      if (/^data:|^blob:|^custom-image:/i.test(url)) usedImageSources.add("Creator's own uploaded imagery");
      else if (url.includes("images.unsplash.com")) usedImageSources.add("Unsplash (Unsplash License)");
      else if (url.includes("pexels.com")) usedImageSources.add("Pexels (CC0 / Free License)");
      else if (url.includes("pixabay")) usedImageSources.add("Pixabay (Content License)");
      else if (url.includes("wikimedia.org")) usedImageSources.add("Wikimedia Commons (Creative Commons)");
      else if (/^https?:/i.test(url)) usedImageSources.add("Third-party image URL (credited to its source)");
    }

    // Only the 3D stickers actually placed on the timeline are credited.
    const usedGraphics = new Set<string>();
    for (const ins of inserts) {
      if (ins.category !== "stickers") continue;
      const stickerId = ins.visualOptions?.stickerId || ins.type;
      usedGraphics.add(STICKER_LIBRARY.find((st) => st.id === stickerId)?.name || ins.title);
    }

    // The bed chosen in the Voiceover step is the music that is actually in
    // the finished file, so that is what the credits document has to name.
    // Most of the library is Creative Commons BY, where crediting the track is
    // a condition of the licence — leaving it out of the document would leave
    // the creator publishing without the attribution they owe.
    let timelineMusicUrl: string | undefined;
    for (const ins of inserts) {
      if (ins.category === "background_music" && ins.audioSettings?.soundUrl) {
        timelineMusicUrl = ins.audioSettings.soundUrl;
      }
    }

    return generateAttributionDocument({
      projectTitle: project?.title || "My Video Project",
      soundsUsed: soundUrlsUsed,
      includeBackgroundMusic: Boolean(timelineMusicUrl) || settings.backgroundMusic !== "none",
      // report the REAL track used for the chosen style in the credits doc
      musicType:
        timelineMusicUrl || AMBIENT_STYLE_TO_TRACK[settings.backgroundMusic] || settings.backgroundMusic,
      imageSources: [...usedImageSources],
      graphicsUsed: [...usedGraphics],
      voiceName: voiceDisplay,
      voiceGender: isCustomImport ? "User Prepared Voice" : voiceGender,
      voiceAccent: isCustomImport
        ? "Custom Imported Audio File"
        : currentVoice?.accent || currentVoice?.locale || (isSpeechifyStyle ? "Scenering style profile" : "Speechify voice"),
      voiceEngine: isCustomImport
        ? "User-Prepared Audio File (Imported Track)"
        : isSpeechifyStyle
          ? "Speechify text-to-speech — customer-provided API key, Scenering style profile"
          : "Speechify text-to-speech — customer-provided API key",
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

  /**
   * Puts the timing report on the clipboard. One button beats asking anyone
   * to open developer tools and copy a line out of a console.
   */
  const copyTimingReport = async () => {
    if (!renderTiming) return;
    try {
      await navigator.clipboard.writeText(renderTiming);
      setTimingCopied(true);
      window.setTimeout(() => setTimingCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; selecting the text by hand still works.
      setTimingCopied(false);
    }
  };

  const cancelRender = () => {
    if (!isRendering || isCancelling) return;
    abortControllerRef.current = true;
    setIsCancelling(true);
    reportStage("Stopping render…");
  };

  const toggleRender = () => {
    if (isRendering) cancelRender();
    else if (!isPreparingRender) void handleStartRender();
  };

  // ==================== MASTER RENDER PROFILE ==========================

  /** The 4-step resolution ladder value behind the current setting. */
  const ladderResolution: ResolutionType =
    settings.resolution === "720p" || settings.resolution === "2k" || settings.resolution === "4k"
      ? settings.resolution
      : "1080p";

  /** The Master Render Profile with this screen's live choices applied —
   *  the single source every encode (and every platform child) inherits. */
  const masterProfile = useMemo(
    () => ({
      ...MASTER_RENDER_PROFILE,
      container: settings.format,
      frameRate: settings.fps,
      // Platform exports are always final quality — Draft is only the
      // fast preview path of the main render button.
      quality: (settings.quality === "draft" ? "standard" : settings.quality) as EncodingQuality,
      audioMastering: settings.audioMastering,
    }),
    [settings.format, settings.fps, settings.quality, settings.audioMastering]
  );

  /** Advanced-panel numbers for the CURRENT single render. */
  const currentDims = getDimensions(settings.quality === "draft" ? "720p" : settings.resolution);
  const currentVideoKbps = computeVideoBitrateKbps(currentDims.width, currentDims.height, effectiveFps, settings.quality);
  const currentAudioKbps = computeAudioBitrateKbps(settings.quality);
  const estSizeMB = estimateFileSizeMB(currentVideoKbps, currentAudioKbps, totalDuration);
  const currentFrames = totalFrameCount(totalDuration, effectiveFps);
  /** Non-default choices that could reduce platform compatibility — the
   *  advanced panel warns before the user commits to them. */
  const compatibilityWarnings: string[] = [];
  if (settings.format === "webm") compatibilityWarnings.push("WebM (VP9/Opus) is not accepted natively by TikTok or Instagram — MP4 (H.264/AAC) is the platform standard.");
  if (effectiveFps > 30) compatibilityWarnings.push(`${effectiveFps} fps doubles the encode work for footage that is mostly still imagery — 30 fps is the recommended setting.`);
  if (effectiveFps === 24 || effectiveFps === 25) compatibilityWarnings.push(`${effectiveFps} fps is a film/broadcast rate; social platforms accept it, but 30 fps is their native cadence.`);

  /**
   * The compatibility report for the ONE destination chosen in Project
   * Setup ("custom" has no platform rules to check). Read-only — if the
   * user wants a different destination they go back to Setup, pick it, and
   * render again; the previous video stays in the Vault.
   */
  const destinationCheck = useMemo(() => {
    if (renderProfile.destination === "custom") return null;
    const platform = getPlatformProfile(renderProfile.destination);
    if (!platform) return null;
    return checkPlatformCompatibility(masterProfile, platform, aspectRatio || "16:9", totalDuration, ladderResolution);
  }, [renderProfile.destination, masterProfile, aspectRatio, totalDuration, ladderResolution]);

  /**
   * §23 Automatic fallback: identify what to relax, retry with a compatible
   * Scenering profile, preserve as much quality as possible — and report
   * exactly what changed. Never a silent downgrade.
   */
  const retryWithFallback = () => {
    if (isRendering) return;
    const fallback = buildCompatibilityFallback(
      {
        format: settings.format,
        fps: settings.fps,
        quality: settings.quality,
        resolution: ladderResolution,
      },
      failureReport || undefined
    );
    setFallbackNotes(fallback.changes);
    setFailureReport(null);
    setRenderError(null);
    setSettings((s) => ({
      ...s,
      format: fallback.patch.format,
      fps: fallback.patch.fps,
      quality: fallback.patch.quality,
      ...(fallback.patch.resolution ? { resolution: fallback.patch.resolution } : {}),
    }));
    // Run with an explicit plan so the retry uses the fallback values NOW —
    // not the pre-update settings still captured in this closure.
    const retryMaster = {
      ...masterProfile,
      container: fallback.patch.format,
      frameRate: fallback.patch.fps,
      quality: fallback.patch.quality,
    };
    const retryRes = fallback.patch.resolution || ladderResolution;
    const plan = resolveRenderPlan(retryMaster, aspectRatio || "16:9", retryRes);
    void handleStartRender(undefined, { ...plan, label: "Automatic retry" });
  };

  const { width: renderW, height: renderH, label: resLabel, aspectClass } = getDimensions(settings.resolution);

  const getPhaseStep = (phase: ProjectPhase): EditorStep =>
    (PROJECT_PHASES.find((p) => p.id === phase)?.editorStep || "scenes") as EditorStep;

  // ---- Read-only summary values (the results of the setup choices) ----
  const MOTION_LABELS: Record<string, string> = {
    dynamic: "Dynamic Variety",
    ken_burns: "Documentary Ken Burns",
    slow_zoom: "Slow Cinematic Zoom",
    zoom_in: "Cinematic Zoom In",
    zoom_out: "Dramatic Zoom Out",
    pan_left: "Smooth Camera Pan (left)",
    pan_right: "Smooth Camera Pan (right)",
    pan: "Smooth Camera Pan",
    subtle_camera: "Subtle Camera Drift",
    shake: "Handheld Shake",
    pulse: "Heartbeat Pulse",
    floating: "Weightless Float",
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
          hint: "Add music in Voiceover → Background Music (formerly in Video Studio)",
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
      <div className="bg-gray-800/60 border border-hairline rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-950 text-indigo-300 border border-indigo-700">
                Step 3 of 3
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <Icon glyph="🎬" /> Render & Export Video
              </h2>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Project: <span className="text-white font-medium">{project?.title || "Untitled Video"}</span> · {scenesWithImages.length} scenes · ~{formatDuration(totalDuration)} duration
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
          <div className="bg-gray-800/50 border border-hairline rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-hairline pb-2 gap-2">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Icon glyph="📋" /> Your Choices
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-900 border border-hairline text-gray-400 font-semibold shrink-0">
                Read-only
              </span>
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed">
              These are the results of your project setup. This screen only shows and renders them — nothing
              here can change your video.
            </p>

            <dl className="space-y-2.5 pt-1 border-t border-hairline">
              <SummaryRow icon="🏷️" label="Project" value={project?.title || "Untitled Video"} />
              <SummaryRow
                icon="🎞️"
                label="Story"
                value={`${scenesWithImages.length} scene${scenesWithImages.length === 1 ? "" : "s"} · ~${formatDuration(totalDuration)}`}
                hint={`${formatDuration(sceneDuration)} target per scene`}
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
                hint={`${renderedContainer.toUpperCase()} · ${effectiveFps} fps CFR · ${getQualityLevel(settings.quality).name} quality`}
              />
              <SummaryRow
                icon="⚡"
                label="Frame rate"
                value={`${effectiveFps} FPS · Constant`}
                hint={settings.fps === "auto" ? "Auto — Scenering chose 30" : "Change under Advanced Render Settings"}
              />
              <SummaryRow
                icon="🎥"
                label="Camera motion"
                value={sceneAnimationEnabled ? "Per-scene animation controls" : (MOTION_LABELS[motionStyle] || motionStyle)}
                hint={sceneAnimationEnabled ? "Scene Animation Effects ON" : undefined}
              />
              <SummaryRow
                icon="🎙️"
                label="Voiceover"
                value={voiceDisplayName}
                hint="Speechify voice"
              />
              <SummaryRow
                icon="🔊"
                label="Voice echo"
                value={describeVoiceEcho(voiceEcho)}
                hint={voiceEchoIsActive(voiceEcho) ? "Written into the video" : "Dry narration"}
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
                className="w-full mt-1 py-2 px-3 bg-gray-900 hover:bg-gray-750 border border-hairline rounded-xl text-[11px] font-semibold text-gray-200 hover:text-white transition-all flex items-center justify-center gap-1.5"
              >
                <Icon glyph="⚙" />
                <span>Change these in Project Setup</span>
              </button>
            )}
          </div>

          <div className="bg-gray-800/30 border border-hairline rounded-xl p-3 flex items-start gap-2">
            <span className="text-sm"><Icon glyph="🔒" /></span>
            <p className="text-[10px] text-gray-400 leading-relaxed">
              The render screen does not allow any changes. Go back to Scenes, Voiceover, Captions or Studio
              to edit your video — then render again.
            </p>
          </div>
        </div>

        <div className="order-1 lg:order-2 lg:col-span-8 space-y-4">

          {/* ---------- RENDER PROFILE (read-only) ---------------------------
              Every choice below was made in Project Setup — this screen only
              shows it and carries it out. No controls here on purpose: one
              render at a time; to render another version (say vertical for
              TikTok), go back to Setup, pick that destination, and render
              again. Finished videos wait in the Vault. */}
          <div className="bg-gray-800/50 border border-hairline rounded-xl p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Icon glyph="🎛" /> Render Profile
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-900 border border-hairline text-gray-400">
                  Read-only — set in Project Setup
                </span>
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 border border-emerald-700/60 text-emerald-300">
                <Icon glyph="✓" /> Optimized for social platforms
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Plain-English summary of what will be rendered */}
              <div className="bg-gray-900/70 border border-hairline rounded-lg p-3 space-y-1.5 text-[11px]">
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">Destination</span>
                  <span className="text-white font-medium text-right">
                    {renderProfile.destination === "custom"
                      ? "Custom output"
                      : `${getPlatformProfile(renderProfile.destination)?.icon || ""} ${destinationLabel(renderProfile.destination)}`}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">Video</span>
                  <span className="text-white font-medium text-right">
                    {currentDims.width} × {currentDims.height} · {effectiveFps} FPS
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">Quality</span>
                  <span className="text-white font-medium text-right">{getQualityLevel(settings.quality).name}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">Audio</span>
                  <span className="text-white font-medium text-right">
                    {settings.format === "webm" ? "Opus" : "AAC"} · 48 kHz · Stereo
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">Format</span>
                  <span className="text-white font-medium text-right">
                    {settings.format.toUpperCase()} {settings.format === "mp4" ? "· web optimized" : ""}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">Audio mastering</span>
                  <span className="text-white font-medium text-right">
                    {settings.audioMastering === "automatic" ? "Automatic" : "Manual"}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">Estimated size</span>
                  <span className="text-white font-medium text-right">
                    ~{estSizeMB < 1000 ? `${Math.max(1, Math.round(estSizeMB))} MB` : `${(estSizeMB / 1000).toFixed(1)} GB`}
                  </span>
                </div>
              </div>

              {/* Platform check for the chosen destination */}
              <div className="bg-gray-900/70 border border-hairline rounded-lg p-3">
                {destinationCheck ? (
                  <>
                    <p className="text-[11px] font-bold text-white mb-1.5">
                      Platform check — {destinationCheck.platform.icon} {destinationCheck.platform.name}{" "}
                      {destinationCheck.allOk ? (
                        <span className="text-emerald-400 font-semibold">· ready</span>
                      ) : (
                        <span className="text-amber-400 font-semibold">· needs attention</span>
                      )}
                    </p>
                    <ul className="space-y-0.5">
                      {destinationCheck.checks.map((c) => (
                        <li
                          key={c.id}
                          className={`text-[10px] leading-snug ${c.ok ? "text-gray-400" : "text-amber-300"}`}
                        >
                          {iconify(c.ok ? "✓" : "⚠")} <span className="font-medium">{c.label}</span> — {c.detail}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    <span className="font-bold text-white">Custom output</span> — no platform rules to check.
                    The video renders exactly as configured in Project Setup's Advanced overrides.
                  </p>
                )}
              </div>
            </div>

            {settings.quality === "draft" && (
              <p className="text-[10px] text-amber-300/90 leading-relaxed">
                <Icon glyph="⚡" /> Draft is a fast preview render at 720p — perfect while editing. Switch to High in Project
                Setup for the final platform-quality export.
              </p>
            )}
            {compatibilityWarnings.length > 0 && (
              <div className="p-2.5 bg-amber-950/50 border border-amber-800/70 rounded-lg space-y-1">
                {compatibilityWarnings.map((w, i) => (
                  <p key={i} className="text-[10px] text-amber-300 leading-relaxed"><Icon glyph="⚠" /> {w}</p>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              {onOpenSetup && (
                <button
                  type="button"
                  onClick={onOpenSetup}
                  className="px-3 py-2 bg-gray-900 hover:bg-gray-750 border border-hairline rounded-xl text-[11px] font-semibold text-gray-200 hover:text-white transition-all flex items-center gap-1.5"
                >
                  <Icon glyph="⚙" /> Change these in Project Setup
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="px-3 py-2 bg-gray-900 hover:bg-gray-750 border border-hairline rounded-xl text-[11px] font-semibold text-gray-300 hover:text-white transition-all flex items-center gap-1.5"
              >
                <Icon glyph="🔧" /> {showAdvanced ? "Hide" : "Show"} technical details
              </button>
            </div>

            {showAdvanced && (
              /* Read-only master values — one source of truth, shown honestly */
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-[10px] bg-gray-900/60 border border-hairline rounded-lg p-3">
                <div><dt className="text-gray-500">Codec</dt><dd className="text-gray-200 font-medium">{settings.format === "webm" ? "VP9" : "H.264 / AVC"}</dd></div>
                <div><dt className="text-gray-500">Profile</dt><dd className="text-gray-200 font-medium">{settings.format === "webm" ? "—" : "High"}</dd></div>
                <div><dt className="text-gray-500">Pixel format</dt><dd className="text-gray-200 font-medium">yuv420p · SDR (BT.709)</dd></div>
                <div><dt className="text-gray-500">Frame rate mode</dt><dd className="text-gray-200 font-medium">Constant (CFR)</dd></div>
                <div><dt className="text-gray-500">Video bitrate</dt><dd className="text-gray-200 font-medium">{(currentVideoKbps / 1000).toFixed(1)} Mbps (auto)</dd></div>
                <div><dt className="text-gray-500">Quality target</dt><dd className="text-gray-200 font-medium">≈ CRF {getQualityLevel(settings.quality).crfEquivalent}</dd></div>
                <div><dt className="text-gray-500">Keyframe interval</dt><dd className="text-gray-200 font-medium">{MASTER_RENDER_PROFILE.keyframeIntervalSeconds} s</dd></div>
                <div><dt className="text-gray-500">Audio codec</dt><dd className="text-gray-200 font-medium">{settings.format === "webm" ? "Opus" : "AAC"} · 48 kHz · stereo</dd></div>
                <div><dt className="text-gray-500">Audio bitrate</dt><dd className="text-gray-200 font-medium">{currentAudioKbps} kbps</dd></div>
                <div><dt className="text-gray-500">Total frames</dt><dd className="text-gray-200 font-medium">{currentFrames.toLocaleString()} ({Math.round(totalDuration)}s × {effectiveFps})</dd></div>
                <div><dt className="text-gray-500">Container</dt><dd className="text-gray-200 font-medium">{settings.format.toUpperCase()}{settings.format === "mp4" ? " · fast-start" : ""}</dd></div>
                <div><dt className="text-gray-500">Mastering</dt><dd className="text-gray-200 font-medium">{settings.audioMastering === "automatic" ? "Automatic" : "Manual"}</dd></div>
              </dl>
            )}
          </div>


          {/* ---------- THE VAULT -------------------------------------------
              Finished renders wait here until they are downloaded. The slot
              frees itself the moment a download lands, and only the newest
              few renders are kept, so this can never grow without bound. */}
          <div className="bg-gray-800/50 border border-hairline rounded-xl p-4 shadow-lg">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span className="p-1.5 bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-lg text-sm shrink-0" aria-hidden="true"><Icon glyph="🗄️" /></span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    The Vault
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-900 border border-hairline text-gray-300">
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
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-950/90 text-indigo-200">
                  <Icon glyph="⏳" /> Rendering {Math.round(job.progress * 100)}%
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
                  <li key={row.id} className="bg-gray-900/70 border border-hairline rounded-lg p-2.5">
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
                          className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-gray-800 hover:bg-gray-700 text-gray-200 border border-hairline transition-colors"
                        >
                          {iconify(vaultPreviewId === row.id ? "▾ Hide" : "▶ Preview")}
                        </button>
                        <button
                          onClick={() => void downloadVaultRender(row)}
                          disabled={vaultBusyId === row.id}
                          className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 text-white transition-colors"
                        >
                          {iconify(vaultBusyId === row.id ? "Saving…" : "⬇ Download")}
                        </button>
                        <button
                          onClick={() => void removeVaultRender(row)}
                          title="Remove from the vault"
                          className="px-2 py-1.5 rounded-lg text-[10px] font-semibold bg-gray-800 hover:bg-rose-900/60 text-gray-400 hover:text-rose-200 border border-hairline transition-colors"
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
          <div className="bg-gray-800/50 border border-hairline rounded-xl overflow-hidden shadow-2xl">
            {/* Viewport: Live Render Canvas, with the finished player overlaid.
                The canvas STAYS MOUNTED even while a finished video is being
                previewed — the multi-platform queue renders several masters
                back-to-back, and unmounting the canvas between them is what
                made every master after the first fail with "canvas not
                available". */}
            <div className={`relative ${aspectClass || "aspect-video"} bg-black flex items-center justify-center overflow-hidden mx-auto`}>
              <canvas
                ref={canvasRef}
                className={`w-full h-full object-contain bg-black ${
                  isRendering ? "opacity-100" : "opacity-40"
                } ${renderedUrl && !isRendering ? "invisible" : ""}`}
              />
              {renderedUrl && !isRendering && (
                <video
                  src={renderedUrl}
                  controls
                  autoPlay={false}
                  preload="metadata"
                  className="absolute inset-0 w-full h-full object-contain bg-black"
                />
              )}
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

                  <h4 className="text-base font-semibold text-white mb-2">
                    Rendering Video in {resLabel}
                  </h4>
                  <div className="mb-2 grid w-full max-w-md grid-cols-4 gap-1" aria-label="Render stages">
                    {[
                      { label: "Prepare", at: 0 },
                      { label: "Audio mix", at: 0.32 },
                      { label: "Frames", at: 0.35 },
                      { label: "Package", at: 0.86 },
                    ].map((stage, index) => {
                      const active = renderProgress >= stage.at;
                      const complete = index < 3 && renderProgress >= [0.32, 0.35, 0.86][index];
                      return (
                        <div
                          key={stage.label}
                          className={`rounded-md border px-1.5 py-1 text-[9px] font-bold ${
                            complete
                              ? "border-emerald-700/70 bg-emerald-950/70 text-emerald-300"
                              : active
                                ? "border-indigo-500/80 bg-indigo-950/80 text-indigo-200"
                                : "border-hairline bg-gray-900/80 text-gray-500"
                          }`}
                        >
                          {complete ? "✓ " : `${index + 1}. `}{stage.label}
                        </div>
                      );
                    })}
                  </div>
                  <div className={`mb-2 px-2.5 py-1 rounded-full border text-[10px] font-bold ${
                    renderEngine === "frame-exact"
                      ? "bg-emerald-950 border-emerald-600 text-emerald-300"
                      : renderEngine === "compatibility"
                      ? "bg-amber-950 border-amber-600 text-amber-300"
                      : "bg-indigo-950 border-indigo-600 text-indigo-300"
                  }`}>
                    {iconify(
                      renderEngine === "frame-exact"
                        ? "✓ FRAME-EXACT WEBCODECS"
                        : renderEngine === "compatibility"
                        ? "⚠ REAL-TIME COMPATIBILITY FALLBACK"
                        : "CHECKING FRAME-EXACT SUPPORT…",
                    )}
                  </div>
                  <p className="text-xs text-indigo-300 font-medium mb-3">{renderStage}</p>

                  <div className="w-full max-w-md bg-gray-800 rounded-full h-2 overflow-hidden border border-hairline">
                    <div
                      className="bg-indigo-500 h-full rounded-full transition-all duration-150"
                      style={{ width: `${Math.round(renderProgress * 100)}%` }}
                    />
                  </div>

                  {/* Long-render safety dashboard: visible proof of what the
                      engine is doing instead of one opaque percentage at 94%. */}
                  <div className="mt-4 w-full max-w-xl rounded-xl border border-hairline bg-gray-950/80 p-3 text-left shadow-2xl">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="rounded-lg bg-white/5 px-2.5 py-2">
                        <p className="text-[9px] uppercase tracking-wide text-gray-500">Elapsed</p>
                        <p className="text-[11px] font-bold text-white">{formatMs(renderHealth.elapsedMs)}</p>
                      </div>
                      <div className="rounded-lg bg-white/5 px-2.5 py-2">
                        <p className="text-[9px] uppercase tracking-wide text-gray-500">Approx. left</p>
                        <p className="text-[11px] font-bold text-white">
                          {renderProgress > 0.03 && renderProgress < 0.99
                            ? formatMs((renderHealth.elapsedMs / renderProgress) * (1 - renderProgress))
                            : "Calculating…"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white/5 px-2.5 py-2">
                        <p className="text-[9px] uppercase tracking-wide text-gray-500">Frames</p>
                        <p className="text-[11px] font-bold text-white">
                          {renderHealth.totalFrames > 0
                            ? `${renderHealth.framesDone.toLocaleString()} / ${renderHealth.totalFrames.toLocaleString()}`
                            : "Preparing…"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white/5 px-2.5 py-2">
                        <p className="text-[9px] uppercase tracking-wide text-gray-500">Output written</p>
                        <p className="text-[11px] font-bold text-white">{formatStorageBytes(renderHealth.outputBytes)}</p>
                      </div>
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <span
                        title={renderHealth.outputStorageDetail}
                        className={`rounded-full border px-2 py-1 text-[9px] font-bold ${
                          renderHealth.outputStorage === "disk"
                            ? "border-emerald-600/70 bg-emerald-950/80 text-emerald-200"
                            : renderHealth.outputStorage === "memory"
                              ? "border-amber-600/70 bg-amber-950/80 text-amber-200"
                              : "border-indigo-600/70 bg-indigo-950/80 text-indigo-200"
                        }`}
                      >
                        {renderHealth.outputStorage === "disk"
                          ? "✓ OUTPUT STREAMING TO DISK"
                          : renderHealth.outputStorage === "memory"
                            ? "⚠ MEMORY OUTPUT FALLBACK"
                            : "… CHECKING OUTPUT STORAGE"}
                      </span>
                      <span className="rounded-full border border-emerald-700/60 bg-emerald-950/60 px-2 py-1 text-[9px] font-bold text-emerald-200">
                        ✓ 3-SCENE ASSET WINDOW
                      </span>
                      <span className="rounded-full border border-emerald-700/60 bg-emerald-950/60 px-2 py-1 text-[9px] font-bold text-emerald-200">
                        ✓ PACKED AUDIO ANALYSIS
                      </span>
                      <span className={`rounded-full border px-2 py-1 text-[9px] font-bold ${
                        renderHealth.wakeLock === "active"
                          ? "border-emerald-700/60 bg-emerald-950/60 text-emerald-200"
                          : "border-hairline bg-gray-900 text-gray-400"
                      }`}>
                        {renderHealth.wakeLock === "active" ? "✓ DEVICE KEPT AWAKE" : "BROWSER MANAGES WAKE"}
                      </span>
                    </div>
                    <p className="mt-2 text-[9px] leading-relaxed text-gray-400">
                      {renderHealth.tabHidden
                        ? "This tab is in the background. Message-channel yielding keeps the encode moving without timer throttling."
                        : renderHealth.outputStorageDetail}
                      {renderHealth.queuedOutputBytes > 0
                        ? ` · ${formatStorageBytes(renderHealth.queuedOutputBytes)} waiting for disk`
                        : ""}
                    </p>
                  </div>

                </div>
              )}
            </div>

            {/* Controls / Progress / Download Area */}
            <div className="p-4 space-y-4">
              {renderError && failureReport ? (
                /* §22: never a bare "Rendering failed" — a human explanation,
                   an automatic retry, and the raw log under Advanced Details */
                <div className="p-3.5 bg-red-950/60 border border-red-800/80 rounded-xl space-y-2">
                  <p className="text-red-200 text-xs font-bold flex items-center gap-2">
                    <Icon glyph="⚠" /> {failureReport.title}
                  </p>
                  <p className="text-red-300/90 text-[11px] leading-relaxed">{failureReport.explanation}</p>
                  <p className="text-red-300/70 text-[11px] leading-relaxed">{failureReport.retryHint}</p>
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    {failureReport.canAutoRetry && (
                      <button
                        type="button"
                        onClick={retryWithFallback}
                        disabled={isRendering}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-colors"
                      >
                        <Icon glyph="🔄" /> Retry Automatically
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowFailureDetail((v) => !v)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-gray-800 hover:bg-gray-700 text-gray-200 border border-hairline transition-colors"
                    >
                      {showFailureDetail ? "Hide" : "Advanced"} Details
                    </button>
                  </div>
                  {showFailureDetail && (
                    <pre className="mt-1 p-2.5 bg-black/70 border border-hairline rounded-lg text-[10px] font-mono text-gray-400 whitespace-pre-wrap break-words">
                      {failureReport.technical}
                    </pre>
                  )}
                </div>
              ) : renderError ? (
                <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-lg text-red-300 text-xs flex items-center gap-2">
                  <Icon glyph="⚠" />
                  <span>{renderError}</span>
                </div>
              ) : null}

              {fallbackNotes.length > 0 && !renderError && (
                /* §23: an automatic fallback is never silent — what changed
                   is spelled out right here. */
                <div className="p-3 bg-indigo-950/50 border border-indigo-800/70 rounded-lg space-y-1">
                  <p className="text-indigo-200 text-[11px] font-bold">Automatic retry — what changed:</p>
                  {fallbackNotes.map((n, i) => (
                    <p key={i} className="text-indigo-300/90 text-[10px] leading-relaxed">• {n}</p>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFallbackNotes([])}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {imageFallbackCount > 0 && (
                <div className="p-3 bg-amber-950/60 border border-amber-800/80 rounded-lg text-amber-300 text-xs flex items-start gap-2">
                  <Icon glyph="🖼" />
                  <span>
                    {imageFallbackCount} scene image{imageFallbackCount === 1 ? "" : "s"} could not be loaded and rendered as
                    placeholder card{imageFallbackCount === 1 ? "" : "s"}. Re-search those scenes in the Scenes step to get
                    real photos into the export.
                  </span>
                </div>
              )}

              {/* During diagnosis, never silently accept the old real-time path. */}
              {!isRendering && !renderedUrl && (
                <label className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/70 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireFrameExact}
                    onChange={(event) => setRequireFrameExact(event.target.checked)}
                    className="mt-0.5 accent-emerald-500"
                  />
                  <span>
                    <span className="block text-[11px] font-bold text-emerald-200">Require frame-exact rendering</span>
                    <span className="block text-[10px] text-emerald-300/75 leading-relaxed">
                      Recommended. If WebCodecs fails, show the exact reason instead of silently creating a jittery real-time recording.
                    </span>
                  </span>
                </label>
              )}

              {offlineFailureReason && !isRendering && (
                <div className="p-3 rounded-lg bg-amber-950/50 border border-amber-800/70">
                  <p className="text-[11px] font-bold text-amber-200">Frame-exact diagnostic</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-amber-300 break-words">{offlineFailureReason}</p>
                </div>
              )}

              {/* What this download will go without.
                  Standing on the page BEFORE the button, not sprung at the
                  end of a ten-minute encode: a VIP effect stays in the
                  project and in the preview, and is simply not written into
                  the file. Saying which ones, by name, is the difference
                  between a limit and a trick. */}
              {vipFindings.length > 0 && !isRendering && (
                <div className="p-3 rounded-xl border border-amber-700/60 bg-amber-950/25 space-y-2">
                  <p className="flex items-center gap-2 text-[11px] font-bold text-amber-200">
                    <span className="vip-flame is-compact">
                      <span className="vip-flame-mark" aria-hidden="true">✦</span>VIP
                    </span>
                    <span>
                      {vipFindings.length} VIP {vipFindings.length === 1 ? "choice" : "choices"} in this video
                    </span>
                  </p>
                  <ul className="space-y-1">
                    {vipFindings.map((finding) => (
                      <li key={finding.id} className="text-[10px] leading-relaxed text-amber-100/85">
                        <span className="font-semibold">{finding.label}</span>
                        <span className="text-amber-300/70"> — {finding.detail}</span>
                        <span className={`ml-1 font-semibold ${finding.leaveOut ? "text-amber-300" : "text-rose-300"}`}>
                          {finding.leaveOut ? "Left out of the download." : "Must be changed first."}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-amber-300/70 leading-relaxed">
                    They stay in your project and in the preview. {vipBlocking.length === 0
                      ? "The downloaded file is rendered without them."
                      : "The download cannot start until the ones marked above are changed."}
                  </p>
                  <button
                    type="button"
                    onClick={openMembershipPlans}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-amber-50 text-[10px] font-bold transition-colors"
                  >
                    Include them — see VIP plans
                  </button>
                </div>
              )}

              {/* Primary Action Button: Render or Re-Render */}
              {!renderedUrl ? (
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={toggleRender}
                    disabled={isPreparingRender || isCancelling || (!isRendering && scenesWithImages.length === 0)}
                    aria-pressed={isRendering || isPreparingRender}
                    aria-label={isRendering ? (isCancelling ? "Cancelling video render" : "Cancel video render") : isPreparingRender ? "Preparing video render" : "Start video render"}
                    className={`t-btn-hero w-full py-3.5 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg transition-all transform active:scale-[0.99] flex items-center justify-center gap-2 text-sm ${
                      isRendering
                        ? "bg-rose-700 hover:bg-rose-600"
                        : isPreparingRender
                          ? "bg-amber-700"
                          : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500"
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      {isRendering ? (
                        <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />
                      ) : (
                        <>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </>
                      )}
                    </svg>
                    <span>
                      {isRendering
                        ? isCancelling ? "Cancelling Render…" : "Cancel Render"
                        : isPreparingRender
                          ? "Preparing Render…"
                          : settings.quality === "draft"
                            ? `Quick Preview Render (${getDimensions("720p").width} × ${getDimensions("720p").height})`
                            : `Start Video Render (${resLabel.split(" ")[0]})`}
                    </span>
                  </button>
                  <p className="text-[10px] text-gray-500 text-center leading-relaxed">
                    {getQualityLevel(settings.quality).name} quality · {effectiveFps} FPS constant · {settings.format === "webm" ? "VP9 WebM" : "H.264 · AAC · MP4 · web optimized"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-green-950/50 border border-green-800/80 rounded-xl text-green-300 text-xs flex items-center justify-between gap-2 flex-wrap">
                    <span className="flex items-center gap-2 font-medium">
                      <Icon glyph="✅" /> Video rendered successfully! Format: {renderedContainer.toUpperCase()} · {resLabel}
                      <span className={`ml-1 px-2 py-0.5 rounded-full border text-[9px] font-bold ${
                        renderEngine === "frame-exact"
                          ? "bg-emerald-900 border-emerald-600 text-emerald-100"
                          : "bg-amber-900 border-amber-600 text-amber-100"
                      }`}>
                        {renderEngine === "frame-exact" ? "FRAME-EXACT WEBCODECS" : "REAL-TIME FALLBACK"}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={toggleRender}
                      disabled={isPreparingRender || isCancelling}
                      aria-pressed={isRendering || isPreparingRender}
                      aria-label={isRendering ? (isCancelling ? "Cancelling video render" : "Cancel video render") : isPreparingRender ? "Preparing video render" : "Re-render video"}
                      className={`px-2.5 py-1.5 rounded text-xs border transition-colors ${
                        isRendering
                          ? "bg-rose-700 hover:bg-rose-600 border-rose-500 text-white"
                          : isPreparingRender
                            ? "bg-amber-700 border-amber-500 text-white"
                            : "bg-gray-800 hover:bg-gray-700 border-hairline text-gray-200"
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      <Icon glyph={isRendering ? "■" : isPreparingRender ? "…" : "🔄"} /> {isRendering ? (isCancelling ? "Cancelling…" : "Cancel Render") : isPreparingRender ? "Preparing Render…" : "Re-render"}
                    </button>
                  </div>

                  {/* Said once more after the fact, so the file in the Vault
                      is never a mystery: this is what is not in it. */}
                  {vipOmittedLast.length > 0 && (
                    <div className="p-3 rounded-xl border border-amber-700/60 bg-amber-950/25">
                      <p className="flex items-center gap-2 text-[11px] font-bold text-amber-200">
                        <span className="vip-flame is-compact">
                          <span className="vip-flame-mark" aria-hidden="true">✦</span>VIP
                        </span>
                        <span>Rendered without {vipOmittedLast.length} VIP {vipOmittedLast.length === 1 ? "choice" : "choices"}</span>
                      </p>
                      <p className="mt-1 text-[10px] text-amber-100/80 leading-relaxed">
                        {vipOmittedLast.map((finding) => finding.label).join(" · ")} — still in your project and in the
                        preview, and included in every download on SceneFlow and SceneForge.
                      </p>
                    </div>
                  )}

                  {/* One honest download of this render; every finished
                      render ALSO waits in the Vault above, where multiple
                      videos can be downloaded or deleted individually. */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() => void downloadVideo()}
                      disabled={isRendering}
                      className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all shadow flex items-center gap-2"
                    >
                      <Icon glyph="⬇" />
                      <span>Download video (.{renderedContainer})</span>
                    </button>
                    <p className="text-[10px] text-gray-400 leading-relaxed flex-1 min-w-[200px]">
                      <Icon glyph="🗄" /> This render is also parked in <span className="font-semibold text-gray-300">The Vault</span> above —
                      every finished video waits there until you download it, so nothing gets lost between renders.
                    </p>
                  </div>

                  {/* How long the render took, on screen rather than hidden
                      in the browser console. Nobody should need developer
                      tools to answer "why was that slow", and the one button
                      copies the whole thing for pasting into a bug report. */}
                  {renderTiming && (
                    <div className="p-3 bg-gray-900/70 border border-hairline rounded-xl space-y-2">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-[11px] font-bold text-gray-200">
                          <Icon glyph="⏱" /> How long this render took
                        </p>
                        <button
                          type="button"
                          onClick={() => void copyTimingReport()}
                          className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 text-[11px] border border-hairline transition-colors"
                        >
                          {timingCopied ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <pre className="text-[10px] leading-relaxed text-gray-300 font-mono whitespace-pre overflow-x-auto m-0">
{renderTiming}
                      </pre>
                      <p className="text-[10px] text-gray-500 leading-relaxed">
                        Each line is one part of the job and how much of the total it used.
                      </p>
                    </div>
                  )}

                  {/* One render at a time, by design: another platform =
                      back to Setup, pick that destination, render again. */}
                  <div className="p-3 bg-indigo-950/40 border border-indigo-800/60 rounded-xl text-[11px] text-indigo-200 leading-relaxed">
                    <span className="font-bold">Need this video for another platform?</span>{" "}
                    Go back to <span className="font-semibold">Project Setup</span>, pick the new destination
                    (say, TikTok for a vertical cut), and render again — this finished video stays safe in the
                    Vault while the next one renders.
                    {onOpenSetup && (
                      <button
                        type="button"
                        onClick={onOpenSetup}
                        className="ml-2 px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-semibold transition-colors"
                      >
                        Open Project Setup →
                      </button>
                    )}
                  </div>
                  {renderedContainer !== "mp4" && (
                    <p className="text-[10px] text-gray-500 leading-relaxed">
                      This browser records WebM instead of MP4 (Firefox is the usual case) — the file plays
                      everywhere and every platform and editor accepts or converts it.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Video Attribution & Credits Section */}
      <div className="bg-gray-900/90 border border-hairline rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline pb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-lg text-sm" aria-hidden="true"><Icon glyph="📜" /></span>
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
              className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-semibold border border-hairline transition-colors flex items-center gap-1.5 shadow"
            >
              <Icon glyph="👁" />
              <span>{showAttributionPreview ? "Hide Credits" : "View Credits"}</span>
            </button>

            <button
              type="button"
              onClick={downloadAttributionDoc}
              className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-semibold border border-hairline transition-colors flex items-center gap-1.5 shadow"
            >
              <Icon glyph="⬇" />
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
              <span>{iconify(copiedAttribution ? "✅" : "📋")}</span>
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
              <pre className="w-full bg-black/80 border border-hairline rounded-xl p-4 text-xs font-mono text-gray-300 whitespace-pre-wrap overflow-x-auto max-h-64 scrollbar-thin select-all leading-relaxed">
                {getAttributionText()}
              </pre>
              <div className="absolute right-3 top-3">
                <button
                  type="button"
                  onClick={copyAttributionDoc}
                  className="px-2.5 py-1 rounded bg-gray-800/90 hover:bg-gray-700 border border-hairline text-gray-200 text-[10px] font-medium transition-colors"
                >
                  {iconify(copiedAttribution ? "✓ Copied" : "Copy")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* The warning at the moment of pressing Render.
          A final download is minutes of work and a weekly allowance, so the
          last word before it starts belongs to the creator: here is what is
          VIP, here is what will happen, carry on or go and change it. */}
      {vipPrompt && (
        <div
          className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vip-render-warning-title"
        >
          <div className="w-full max-w-lg my-auto rounded-2xl border border-amber-700/70 bg-gray-950 shadow-2xl">
            <div className="p-5 border-b border-hairline flex items-start gap-3">
              <span className="vip-flame mt-0.5">
                <span className="vip-flame-mark" aria-hidden="true">✦</span>VIP
              </span>
              <div>
                <h3 id="vip-render-warning-title" className="text-base font-bold text-white">
                  {vipBlocking.length > 0
                    ? "This download needs a change first"
                    : "Your download will go without these"}
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Everything here works in the preview and stays in your project. It is the final file that
                  {" "}{vipBlocking.length > 0 ? "cannot carry it" : "goes without it"}.
                </p>
              </div>
            </div>

            {/* The overlay itself is the scrolling layer (one page per
                modal); this list flows inside it. */}
            <ul className="p-5 space-y-2.5">
              {vipFindings.map((finding) => (
                <li key={finding.id} className="rounded-xl border border-hairline bg-gray-900/70 p-3">
                  <p className="text-xs font-bold text-gray-100">{finding.label}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{finding.detail}</p>
                  <p className={`text-[10px] font-bold mt-1.5 ${finding.leaveOut ? "text-amber-300" : "text-rose-300"}`}>
                    {finding.leaveOut ? "Will not be rendered into the file." : "Change it before downloading."}
                  </p>
                  {finding.fixIn && onNavigateToStep && (
                    <button
                      type="button"
                      onClick={() => {
                        setVipPrompt(null);
                        onNavigateToStep(finding.fixIn === "voiceover" ? "voiceover" : "captions");
                      }}
                      className="mt-2 px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 border border-hairline text-gray-200 text-[10px] font-semibold transition-colors"
                    >
                      Go to the {finding.fixIn === "voiceover" ? "Voiceover" : "Captions"} step
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <div className="p-5 border-t border-hairline flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setVipPrompt(null)}
                className="px-3.5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-hairline text-gray-200 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={openMembershipPlans}
                className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-amber-50 text-xs font-bold transition-colors"
              >
                Include them — see VIP plans
              </button>
              {vipBlocking.length === 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const pending = vipPrompt;
                    setVipPrompt(null);
                    void handleStartRender(pending?.format, pending?.plan, true);
                  }}
                  className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors"
                >
                  Render without them
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
