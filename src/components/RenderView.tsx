import { useState, useRef, useEffect, useCallback } from "react";
import type { Project, Scene, TimelineInsert, CustomerLogoConfig } from "../types";
import { EDGE_FUNCTION_BASE } from "../lib/supabase";
import { createProjectZip } from "../lib/zip-download";
import {
  buildSceneTimeline,
  drawCompositionFrame,
  getTimelineDuration,
  type CompositionOptions,
  type SubtitleStyle,
} from "../lib/frame-renderer";
import {
  createAmbientMusicSource,
  createAudioLevelSampler,
  mixTimelineAudio,
  type MusicStyle,
} from "../lib/audio-mix";
import {
  probeMp4Support,
  describeMp4Support,
  renderMp4File,
  type Mp4SupportInfo,
} from "../lib/mp4-export";
import { generateAttributionDocument } from "../data/media-library";

export interface RenderSettings {
  format: "webm" | "mp4";
  resolution: "1080p" | "720p" | "shorts_9_16" | "square_1_1";
  fps: 30 | 60;
  quality: "standard" | "high" | "ultra";
  includeWatermark: boolean;
  watermarkOpacity: number;
  watermarkScale: number;
  includeSubtitles: boolean;
  subtitleStyle: "karaoke" | "banner" | "minimal" | "yellow";
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
  onNavigateToStep?: (step: "scenes" | "studio") => void;
  onBack?: () => void;
  customerLogo?: CustomerLogoConfig;
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

interface LoadedEffect {
  buffer: AudioBuffer;
  startTime: number;
  gain: number;
  loop: boolean;
}

/**
 * Fetches and decodes the sound effects attached to timeline inserts.
 * Each unique audio file is only downloaded once.
 */
async function loadInsertAudio(
  inserts: TimelineInsert[],
  ctx: BaseAudioContext
): Promise<LoadedEffect[]> {
  const wanted: { url: string; startTime: number; gain: number; loop: boolean }[] = [];

  for (const insert of inserts) {
    const audio = insert.audioSettings;
    if (!audio?.soundUrl || audio.muted) continue;
    wanted.push({
      url: audio.soundUrl,
      startTime: insert.startTime + (audio.delay ?? 0),
      gain: Math.max(0, Math.min(2, audio.volume ?? 0.8)),
      loop: Boolean(audio.loop),
    });
  }

  if (wanted.length === 0) return [];

  const decoded = new Map<string, AudioBuffer>();
  await Promise.all(
    [...new Set(wanted.map((w) => w.url))].map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
        decoded.set(url, buffer);
      } catch (err) {
        console.warn(`Could not load insert sound ${url}:`, err);
      }
    })
  );

  const effects: LoadedEffect[] = [];
  for (const item of wanted) {
    const buffer = decoded.get(item.url);
    if (buffer) effects.push({ buffer, ...item });
  }
  return effects;
}

export default function RenderView({
  project,
  scenes,
  inserts,
  selectedVoice = "alloy",
  availableVoices = [],
  onNavigateToStep,
  onBack,
  customerLogo,
}: RenderViewProps) {
  const scenesWithImages = scenes.filter((s) => s.image_url);
  const totalDuration = scenesWithImages.reduce((sum, s) => sum + s.duration, 0);

  // Render settings state
  const [settings, setSettings] = useState<RenderSettings>({
    format: "webm",
    resolution: "1080p",
    fps: 30,
    quality: "high",
    includeWatermark: true,
    watermarkOpacity: 1.0,
    watermarkScale: 1.0,
    includeSubtitles: true,
    subtitleStyle: "karaoke",
    backgroundMusic: "lofi",
    musicVolume: 0.16,
    normalizeAudio: true,
  });

  // Render execution state
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStage, setRenderStage] = useState("");
  const [renderedBlob, setRenderedBlob] = useState<Blob | null>(null);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  /** Container the last render actually produced (can differ from the request). */
  const [renderedFormat, setRenderedFormat] = useState<"webm" | "mp4">("webm");
  /** Non-fatal message, e.g. "MP4 unavailable, fell back to WebM". */
  const [renderNotice, setRenderNotice] = useState<string | null>(null);
  const [mp4Support, setMp4Support] = useState<Mp4SupportInfo | null>(null);

  // ZIP export state
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);
  const [zipStatus, setZipStatus] = useState("");

  // Attribution state
  const [copiedAttribution, setCopiedAttribution] = useState(false);
  const [showAttributionPreview, setShowAttributionPreview] = useState(true);

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

  // Pre-load customer logo image
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

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (renderedUrl) {
        URL.revokeObjectURL(renderedUrl);
      }
    };
  }, [renderedUrl]);

  // Resolution dimensions helper
  const getDimensions = (res: RenderSettings["resolution"]) => {
    switch (res) {
      case "1080p":
        return { width: 1920, height: 1080, label: "1920 × 1080 (16:9 Full HD)" };
      case "720p":
        return { width: 1280, height: 720, label: "1280 × 720 (16:9 HD)" };
      case "shorts_9_16":
        return { width: 1080, height: 1920, label: "1080 × 1920 (9:16 Shorts/Reels)" };
      case "square_1_1":
        return { width: 1080, height: 1080, label: "1080 × 1080 (1:1 Square Feed)" };
      default:
        return { width: 1920, height: 1080, label: "1920 × 1080 (16:9 Full HD)" };
    }
  };

  // Image preloader helper
  const loadImage = (url: string): Promise<HTMLImageElement | null> => {
    return new Promise((resolve) => {
      if (!url) return resolve(null);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
    });
  };

  // ------ RENDER VIDEO HANDLER ------

  /** Publishes a finished render into the preview player. */
  const finishRender = useCallback((blob: Blob, format: "webm" | "mp4") => {
    const url = URL.createObjectURL(blob);
    setRenderedBlob(blob);
    setRenderedUrl(url);
    setRenderedFormat(format);
    setRenderProgress(1);
    setRenderStage("Render Complete! 🎉");
  }, []);

  // Check whether this browser can really produce an MP4 at the current size.
  useEffect(() => {
    let cancelled = false;
    const { width, height } = getDimensions(settings.resolution);
    probeMp4Support(width, height, settings.fps).then((info) => {
      if (!cancelled) setMp4Support(info);
    });
    return () => {
      cancelled = true;
    };
  }, [settings.resolution, settings.fps]);

  const handleStartRender = async () => {
    if (scenesWithImages.length === 0 || isRendering) return;

    setIsRendering(true);
    setRenderProgress(0);
    setRenderError(null);
    setRenderNotice(null);
    setRenderedBlob(null);
    setRenderedUrl(null);
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

    // Live audio nodes that have to be torn down if the render is cancelled.
    const liveSources: AudioScheduledSourceNode[] = [];
    let audioCtx: AudioContext | null = null;

    try {
      // ---- 1/4: Narration ----
      setRenderStage("1/4: Synthesizing narration voices...");
      setRenderProgress(0.04);

      audioCtx = new AudioContext();
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      const narrationBuffers = new Map<number, AudioBuffer>();
      for (let i = 0; i < scenesWithImages.length; i++) {
        if (abortControllerRef.current) throw new Error("Render cancelled");
        const sc = scenesWithImages[i];
        const sceneVoice = sc.voice_id || selectedVoice;

        try {
          const res = await fetch(`${EDGE_FUNCTION_BASE}/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: sc.text, voice: sceneVoice }),
          });

          if (res.ok) {
            const arrayBuf = await res.arrayBuffer();
            narrationBuffers.set(sc.id, await audioCtx.decodeAudioData(arrayBuf));
          }
        } catch (e) {
          console.warn(`TTS generation fallback for scene ${i + 1}:`, e);
        }

        setRenderProgress(0.04 + ((i + 1) / scenesWithImages.length) * 0.2);
      }

      // ---- 2/4: Visuals & insert sound effects ----
      setRenderStage("2/4: Loading high-resolution visuals & audio...");
      setRenderProgress(0.26);

      const images = await Promise.all(
        scenesWithImages.map((s) => loadImage(s.image_url || ""))
      );

      if (!watermarkImgRef.current) {
        const wm = await loadImage("/scenering-logo.png");
        if (wm) watermarkImgRef.current = wm;
      }

      const effects = await loadInsertAudio(inserts, audioCtx);

      // ---- Deterministic timeline shared by both engines ----
      const narrationDurations = new Map<number, number>();
      narrationBuffers.forEach((buffer, sceneId) =>
        narrationDurations.set(sceneId, buffer.duration)
      );
      const timeline = buildSceneTimeline(scenesWithImages, narrationDurations);
      const videoDuration = getTimelineDuration(timeline);

      const composition: CompositionOptions = {
        width,
        height,
        duration: videoDuration,
        timeline,
        images,
        inserts,
        watermark: watermarkImgRef.current,
        watermarkScale: settings.watermarkScale,
        watermarkOpacity: settings.watermarkOpacity,
        customerLogo,
        customerLogoImage: customerLogoImgRef.current,
        includeSubtitles: settings.includeSubtitles,
        subtitleStyle: settings.subtitleStyle,
      };

      const bitrateMap = { standard: 5_000_000, high: 10_000_000, ultra: 16_000_000 };
      const bitrate = bitrateMap[settings.quality] || 10_000_000;

      // ---- MP4: offline WebCodecs encode (H.264 + AAC) ----
      if (settings.format === "mp4") {
        const support = await probeMp4Support(width, height, settings.fps);
        setMp4Support(support);

        if (support.supported) {
          setRenderStage("3/4: Mixing narration, effects & music...");
          setRenderProgress(0.3);

          const mixed = await mixTimelineAudio({
            duration: videoDuration,
            narration: timeline
              .map((slot) => {
                const buffer = narrationBuffers.get(slot.scene.id);
                return buffer ? { buffer, startTime: slot.start, gain: 1 } : null;
              })
              .filter(
                (
                  clip
                ): clip is { buffer: AudioBuffer; startTime: number; gain: number } =>
                  clip !== null
              ),
            effects,
            music: { style: settings.backgroundMusic, volume: settings.musicVolume },
            normalize: settings.normalizeAudio,
          });

          // Audio-reactive inserts now respond to the real mixed soundtrack.
          composition.audioLevelAt = createAudioLevelSampler(mixed);

          setRenderStage("4/4: Encoding H.264 + AAC (MP4)...");
          const blob = await renderMp4File({
            canvas,
            composition,
            audio: mixed,
            fps: settings.fps,
            bitrate,
            onProgress: (p) => setRenderProgress(0.35 + p * 0.6),
            shouldAbort: () => abortControllerRef.current,
          });

          finishRender(blob, "mp4");
          return;
        }

        // No H.264/AAC encoder here — say so and fall through to WebM.
        setRenderNotice(describeMp4Support(support));
      }

      // ---- WebM: real-time MediaRecorder capture ----
      if (typeof MediaRecorder === "undefined") {
        setRenderError("Your browser does not support in-browser video recording.");
        setIsRendering(false);
        return;
      }

      const dest = audioCtx.createMediaStreamDestination();
      // Small lead-in so the recorder warms up; audio and frames share this origin.
      const leadIn = 0.25;
      const audioOrigin = audioCtx.currentTime + leadIn;
      const wallOrigin = performance.now() + leadIn * 1000;

      timeline.forEach((slot) => {
        const buffer = narrationBuffers.get(slot.scene.id);
        if (!buffer || !audioCtx) return;
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(dest);
        source.connect(audioCtx.destination);
        source.start(audioOrigin + slot.start);
        liveSources.push(source);
      });

      effects.forEach((fx) => {
        if (!audioCtx) return;
        const source = audioCtx.createBufferSource();
        source.buffer = fx.buffer;
        source.loop = fx.loop;
        const gain = audioCtx.createGain();
        gain.gain.value = fx.gain;
        source.connect(gain);
        gain.connect(dest);
        source.start(Math.max(audioOrigin, audioOrigin + fx.startTime));
        liveSources.push(source);
      });

      const musicNode = createAmbientMusicSource(
        audioCtx,
        settings.backgroundMusic,
        videoDuration + 1,
        settings.musicVolume
      );
      if (musicNode) musicNode.connect(dest);

      const videoStream = canvas.captureStream(settings.fps);
      const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : "video/webm";

      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: bitrate,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const recordingDone = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(";")[0] }));
      });

      setRenderStage("3/4: Rendering visual scenes, motion & effects...");
      setRenderProgress(0.3);
      recorder.start(100);

      await new Promise<void>((resolveLoop) => {
        const renderFrame = () => {
          if (abortControllerRef.current) {
            recorder.stop();
            resolveLoop();
            return;
          }

          const elapsed = (performance.now() - wallOrigin) / 1000;
          const t = Math.min(elapsed, videoDuration);
          drawCompositionFrame(ctx, composition, t);
          setRenderProgress(0.3 + (t / Math.max(0.1, videoDuration)) * 0.6);

          if (elapsed >= videoDuration) {
            recorder.stop();
            resolveLoop();
            return;
          }

          requestAnimationFrame(renderFrame);
        };

        requestAnimationFrame(renderFrame);
      });

      if (abortControllerRef.current) {
        setRenderStage("Render cancelled");
        return;
      }

      setRenderStage("4/4: Finalizing video stream & container...");
      setRenderProgress(0.95);

      const finalBlob = await recordingDone;
      finishRender(finalBlob, "webm");
    } catch (err: any) {
      console.error("Render failed:", err);
      if (err?.message === "Render cancelled") {
        setRenderStage("Render cancelled");
      } else {
        setRenderError(err.message || "Failed to render video");
      }
    } finally {
      liveSources.forEach((source) => {
        try {
          source.stop();
        } catch {
          /* already stopped or never started */
        }
      });
      if (audioCtx && audioCtx.state !== "closed") {
        audioCtx.close().catch(() => undefined);
      }
      setIsRendering(false);
    }
  };

  // ------ DOWNLOAD HANDLERS ------
  const downloadVideo = () => {
    if (!renderedBlob || !renderedUrl) return;
    const a = document.createElement("a");
    a.href = renderedUrl;
    const safeTitle = (project?.title || "scenering_video").replace(/[^a-zA-Z0-9]/g, "_");
    a.download = `${safeTitle}_${settings.resolution}.${renderedFormat}`;
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

    return generateAttributionDocument({
      projectTitle: project?.title || "My Video Project",
      soundsUsed: soundUrlsUsed,
      includeBackgroundMusic: settings.backgroundMusic !== "none",
      musicType: settings.backgroundMusic,
      imageSources: ["Pexels (CC0 / Free License)", "Pixabay (Content License)"],
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
        videoFormat: renderedFormat,
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

  const { width: renderW, height: renderH, label: resLabel } = getDimensions(settings.resolution);

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
              Project: <span className="text-white font-medium">{project?.title || "Untitled Video"}</span> · {scenesWithImages.length} ready scenes · ~{totalDuration}s duration · {inserts.length} overlays
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
                  { id: "1080p", name: "1080p Full HD", ratio: "16:9 Landscape" },
                  { id: "720p", name: "720p HD", ratio: "16:9 Fast" },
                  { id: "shorts_9_16", name: "Shorts / Reels", ratio: "9:16 Vertical" },
                  { id: "square_1_1", name: "Square Post", ratio: "1:1 Feed" },
                ].map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, resolution: r.id as any }))}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      settings.resolution === r.id
                        ? "bg-indigo-950/80 border-indigo-500 text-white shadow-sm"
                        : "bg-gray-700/50 border-gray-600 text-gray-400 hover:text-white"
                    }`}
                  >
                    <div className="text-xs font-semibold">{r.name}</div>
                    <div className="text-[10px] text-gray-400">{r.ratio}</div>
                  </button>
                ))}
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
                  <option value="webm">WebM (VP9/Opus - universal)</option>
                  <option value="mp4">MP4 (H.264/AAC - widest support)</option>
                </select>
              </div>

              {settings.format === "mp4" && (
                <p className="text-[10px] leading-relaxed -mt-1">
                  {mp4Support === null ? (
                    <span className="text-gray-400">Checking MP4 encoder support…</span>
                  ) : mp4Support.supported ? (
                    <span className="text-emerald-400">
                      ✓ Real MP4 ready ({mp4Support.videoCodec} + AAC). Rendered offline, not in
                      real time.
                    </span>
                  ) : (
                    <span className="text-amber-400">⚠ {describeMp4Support(mp4Support)}</span>
                  )}
                </p>
              )}

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
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-gray-700 pb-2">
              <span>🎵</span> Audio & Subtitle Styling
            </h3>

            {/* Subtitles */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-300 font-medium">
                  Burn-In Subtitles on Video
                </span>
                <input
                  type="checkbox"
                  checked={settings.includeSubtitles}
                  onChange={(e) => setSettings((s) => ({ ...s, includeSubtitles: e.target.checked }))}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                />
              </div>

              {settings.includeSubtitles && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {[
                    { id: "karaoke", name: "✨ Karaoke Pill" },
                    { id: "banner", name: "⬛ Dark Banner" },
                    { id: "yellow", name: "🟡 Bold Yellow" },
                    { id: "minimal", name: "⚪ Minimal Text" },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSettings((s) => ({ ...s, subtitleStyle: st.id as any }))}
                      className={`p-2 rounded-lg border text-left text-xs transition-colors ${
                        settings.subtitleStyle === st.id
                          ? "bg-indigo-950 border-indigo-500 text-indigo-200"
                          : "bg-gray-700/50 border-gray-600 text-gray-400 hover:text-white"
                      }`}
                    >
                      {st.name}
                    </button>
                  ))}
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
            <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
              {renderedUrl && !isRendering ? (
                <video
                  src={renderedUrl}
                  controls
                  autoPlay
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

              {renderNotice && !renderError && (
                <div className="p-3 bg-amber-950/50 border border-amber-800/70 rounded-lg text-amber-300 text-xs flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{renderNotice}</span>
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
                      <span>✅</span> Video rendered successfully! Format: {renderedFormat.toUpperCase()} · {resLabel}
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
                      Download Video ({renderedFormat.toUpperCase()})
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
              onClick={copyAttributionDoc}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow flex items-center gap-1.5 ${
                copiedAttribution
                  ? "bg-emerald-600 text-white animate-pulse"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white"
              }`}
            >
              <span>{copiedAttribution ? "✅" : "📋"}</span>
              <span>{copiedAttribution ? "Copied to Clipboard!" : "Copy Attribution"}</span>
            </button>

            <button
              type="button"
              onClick={downloadAttributionDoc}
              className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-semibold border border-gray-700 transition-colors flex items-center gap-1.5 shadow"
            >
              <span>⬇️</span>
              <span>Download (.txt)</span>
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
