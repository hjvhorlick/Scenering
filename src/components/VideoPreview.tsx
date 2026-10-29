import React, { useState, useRef, useCallback, useEffect } from "react";
import type { Scene, TimelineInsert, CustomerLogoConfig, CaptionsConfig, AspectRatioType, PacingModeType } from "../types";
import { STUDIO_VOICE_PRESETS } from "../data/voice-presets";
import {
  getInsertBounds,
  getPresetCoords,
  renderTimelineInsert,
} from "../lib/render-effects";
import {
  getRedactionFrame,
  getRedactionHandlePoints,
  hitTestRedactionHandle,
  moveRedactionRect,
  pointInRedactionFrame,
  resizeRedactionRect,
  resolveRedaction,
  type RedactionHandle,
  type RedactionRect,
} from "../lib/block-out";
import { getSceneCameraTransform, renderSceneAnimationEffects } from "../lib/scene-animation";
import { stopAllSoundPreviews } from "../data/media-library";
import {
  drawSceneImage,
  sceneHasVisual,
  sceneIsBlankColor,
  prewarmSceneFrame,
  sourceHasPixels,
  type SceneDrawable,
} from "../lib/scene-framing";
import { drawSceneTransition, getTransitionDuration } from "../lib/scene-transition";
import { ClipPool, asDrawableClip, sceneHasClip } from "../lib/scene-clip";
import { loadCustomVideos } from "../lib/custom-video";
import { narratableText, projectHasNarration, sceneCaptionWords } from "../lib/clip-transcript";
import { renderCanvasCaptions, DEFAULT_CAPTIONS_CONFIG } from "../lib/render-captions";
import { AudioFrame, EMPTY_FRAME, makeBus } from "../lib/audio-reactive";
import { isVisualizerFullWidth } from "../lib/render-visualizers";
import { requiredVisualizerFftSize } from "../lib/advanced-audio-visualizer";
import { loadCaptionFonts, ensureCaptionFont, getCaptionStyle } from "../data/caption-styles";
import { sceneTimelineDuration, narrationLeadIn } from "../lib/duration-utils";
import type { WordTiming } from "../lib/word-sync";
import { getFilterCanvas, type VideoFilterConfig } from "../data/video-filters";
import { paintVideoFilter } from "../lib/video-filter-render";
import { renderSection } from "../lib/render-section";
import type { SectionConfig } from "../data/intro-outro";
import { startVoiceSource, VOICE_NARRATION_GAIN, type VoiceSourceHandle } from "../lib/voice-fade";
import {
  VoiceEchoConfig,
  VoiceEchoGraph,
  createVoiceEchoGraph,
  voiceEchoIsActive,
  resolveVoiceEcho,
} from "../lib/voice-echo";
import {
  getCachedSceneAudio,
  resolveSceneAudioBuffer,
  replaceSceneNarration,
  fetchSceneAudioWithTimeline,
} from "../lib/tts-cache";
import { isPreparedVoiceoverId } from "../lib/voiceover-generation";
import { loadSceneImage } from "../lib/scene-image-loader";
import { buildInsertAudioPlan, buildSectionAudioPlan, InsertAudioMixer } from "../lib/insert-audio";
import { drawSceneringWatermark, planRequiresSceneringWatermark } from "../lib/scenering-watermark";
import { getInterfacePlan, useSession } from "../lib/session";
import Icon from "./icons/Icon";

/** Grips are drawn and grabbed with the same radius, so what you see is what you can pull. */
function redactionGripRadius(canvasW: number): number {
  // Sized in canvas pixels, so the grips stay finger-sized whether the frame is
  // a 1280px preview or a 4K export being inspected.
  return Math.max(6, Math.min(13, canvasW / 105));
}

/** How far from a grip a press still counts as that grip, in canvas pixels. */
function redactionGripTolerance(canvasW: number): number {
  // A press counts as a grip a little outside the drawn dot, so the edge never
  // has to be hit exactly.
  return Math.max(18, canvasW / 45);
}

/**
 * Selection chrome for a privacy block: the rectangle's own edges plus eight
 * grips (four corners, four edge midpoints). Unlike badges and cards there is
 * no offset frame — the thing you grab *is* the thing that is painted.
 */
function drawRedactionSelectionChrome(
  ctx: CanvasRenderingContext2D,
  insert: TimelineInsert,
  w: number,
  h: number
) {
  const frame = getRedactionFrame(insert, w, h);
  if (frame.w <= 0 || frame.h <= 0) return;
  ctx.save();
  ctx.setLineDash([7, 5]);
  ctx.strokeStyle = "rgba(99, 102, 241, 0.95)";
  ctx.lineWidth = Math.max(1.5, w / 900);
  ctx.strokeRect(frame.x, frame.y, frame.w, frame.h);
  ctx.setLineDash([]);

  const grip = redactionGripRadius(w);
  const points = getRedactionHandlePoints(frame);
  for (const key of Object.keys(points) as RedactionHandle[]) {
    const point = points[key];
    ctx.beginPath();
    ctx.arc(point.x, point.y, grip, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, w / 900);
    ctx.strokeStyle = "rgba(199, 210, 254, 0.95)";
    ctx.stroke();
  }
  ctx.restore();
}

interface VideoPreviewProps {
  scenes: Scene[];
  title: string;
  inserts?: TimelineInsert[];
  currentPlayheadTime?: number;
  captionsConfig?: CaptionsConfig;
  /** Project-wide narration switch. Off means nothing is synthesised or heard. */
  voiceoverEnabled?: boolean;
  /** One-scene project: the footage is the video, so nothing may shorten it. */
  singleScene?: boolean;
  onSeek?: (time: number) => void;
  onSelectInsert?: (insert: TimelineInsert) => void;
  onUpdateInsert?: (updated: TimelineInsert) => void;
  /** Id of the insert currently open in the properties modal (gets drag/resize chrome) */
  selectedInsertId?: string;
  onVoicesLoaded?: (voices: { id: string; name: string; gender?: "male" | "female"; accent?: string; locale?: string }[]) => void;
  customerLogo?: CustomerLogoConfig;
  onPlayStateChange?: (isPlaying: boolean, togglePlay: () => void) => void;
  selectedVoice?: string;
  aspectRatio?: AspectRatioType;
  pacingMode?: PacingModeType;
  /** Project-level toggle for per-scene animation/effect stacks. */
  sceneAnimationEnabled?: boolean;
  /** one look across the whole video (set in Video Studio → Filters) */
  videoFilter?: VideoFilterConfig | null;
  /** opening / closing sections built in Video Studio → Intro / Outro */
  introSection?: SectionConfig | null;
  outroSection?: SectionConfig | null;
  /** echo / ambience on the narration (Voiceover step) — the preview plays the voice exactly as the render will */
  voiceEcho?: VoiceEchoConfig;
}

/** Seconds of held first image before the first words, when the video opens
 *  directly on a scene (an intro section is its own opening). Must match the
 *  export exactly — see NARRATION_LEAD_IN_SECONDS in duration-utils. */
function sceneSpeechOffset(sceneIdx: number, hasIntro: boolean, voiceoverOn: boolean = true): number {
  return sceneIdx === 0 ? narrationLeadIn(hasIntro, voiceoverOn) : 0;
}

/** A scene's window on the timeline: its speech length plus any lead-in. */
function sceneWindowDuration(
  scene: Scene,
  audioBuf: AudioBuffer | undefined,
  sceneIdx: number,
  hasIntro: boolean,
  voiceoverOn: boolean = true,
  singleScene: boolean = false
): number {
  return (
    getSceneSpeechDuration(scene, audioBuf, singleScene) + sceneSpeechOffset(sceneIdx, hasIntro, voiceoverOn)
  );
}

// Playback timing helper: respects scene.duration while ensuring audio is never cut short.
// The formula itself lives in duration-utils and is shared with the render
// pipeline, so the preview and the export agree on every scene boundary.
function getSceneSpeechDuration(
  scene: Scene,
  audioBuf?: AudioBuffer,
  singleScene: boolean = false
): number {
  // The decoded narration is the authority on how long the scene runs, so the
  // video never sits on a still frame in silence. Previously a longer
  // configured `scene.duration` won, which is exactly what produced the quiet
  // stretches at the end of scenes.
  return sceneTimelineDuration(scene, audioBuf?.duration, { singleScene });
}

interface SceneAudio {
  buffer: AudioBuffer;
  url: string;
  voiceKey?: string;
  /** Per-word spoken timings — the preview captions lock onto these exactly
   *  like the exported video does, so what you preview is what you render. */
  words?: WordTiming[];
}

// Scene images load through the ONE shared loader (src/lib/scene-image-loader.ts)
// so the preview and the exported video can never disagree about what a scene
// looks like: same proxy routing, same retry, same gradient fallback card.
function loadImage(
  src: string,
  fallbackIndex: number
): Promise<HTMLImageElement> {
  return loadSceneImage(src, fallbackIndex).then((r) => r?.img ?? new Image());
}

export default function VideoPreview({
  scenes,
  title,
  inserts = [],
  currentPlayheadTime = 0,
  captionsConfig,
  voiceoverEnabled = true,
  singleScene = false,
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
  sceneAnimationEnabled = false,
  videoFilter = null,
  introSection = null,
  outroSection = null,
  voiceEcho,
}: VideoPreviewProps) {
  const { account } = useSession();
  /** Product branding follows the account plan and has no project/user switch. */
  const showPlanWatermark = planRequiresSceneringWatermark(getInterfacePlan(account));
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
  /** Fires when playback reaches the end of the project. */
  const onPlaybackEndRef = useRef<(() => void) | null>(null);

 const [isPlaying, setIsPlaying] = useState(false);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [audioStatus, setAudioStatus] = useState("");
  const [selectedVoice, setSelectedVoice] = useState(propSelectedVoice || "scenering_male_01");

  const currentPlayheadTimeRef = useRef(currentPlayheadTime);

  const aspectConfig = {
    "16:9": { w: 1920, h: 1080, cssClass: "w-full aspect-video" },
    "9:16": { w: 1080, h: 1920, cssClass: "aspect-[9/16] max-h-[520px] mx-auto" },
    "1:1": { w: 1080, h: 1080, cssClass: "aspect-square max-h-[520px] mx-auto" },
    "4:3": { w: 1440, h: 1080, cssClass: "aspect-[4/3] max-h-[520px] mx-auto" },
  }[aspectRatio || "16:9"] || { w: 1920, h: 1080, cssClass: "w-full aspect-video" };

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
  /**
   * Playback generation token.
   *
   * playPreview() awaits several slow things (image decode, narration
   * synthesis, music decode) before it starts anything. Stopping — or
   * pressing play twice — during that window used to leave the finished
   * async run free to start a music bed that nothing was tracking any more,
   * so the soundtrack kept playing after pause. Every start claims the next
   * epoch; a run whose epoch is stale cleans up and returns instead.
   */
  const playEpochRef = useRef(0);
  /** True once playPreview() has begun preparing, before playingRef is set. */
  const startingRef = useRef(false);
  /** Hidden media decode events must repaint a paused canvas when a frame arrives. */
  const clipSourceKey = scenes.map((scene) => scene.video_url || "").join("|");
  const [clipFrameRevision, setClipFrameRevision] = useState(0);
  const [clipPreviewError, setClipPreviewError] = useState<string | null>(null);
  const [videoStoreReady, setVideoStoreReady] = useState(false);
  const [clipPreviewLoading, setClipPreviewLoading] = useState(
    () => scenes.some((scene) => sceneHasClip(scene))
  );
  const clipDrawErrorRef = useRef(false);
  /** Hidden media elements for scenes that use a clip instead of a still. */
  const [clipPool] = useState(
    () => new ClipPool((_sceneId, status, message) => {
      if (status === "error") {
        setClipPreviewLoading(false);
        setClipPreviewError(message || "This browser could not decode the uploaded video for preview.");
        return;
      }
      setClipPreviewLoading(false);
      if (!clipDrawErrorRef.current) setClipPreviewError(null);
      if (!playingRef.current) setClipFrameRevision((revision) => revision + 1);
    })
  );
  const clipPoolRef = useRef<ClipPool>(clipPool);
  useEffect(() => {
    clipDrawErrorRef.current = false;
    setClipPreviewError(null);
    setClipPreviewLoading(clipSourceKey.split("|").some(Boolean));
  }, [clipSourceKey]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  // Voice and background-music are analysed on separate buses so a visualiser
  // set to "moves with the music" reacts to the music, not to the narration.
  const analyserRef = useRef<AnalyserNode | null>(null);
  const musicAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioBuffersRef = useRef<Map<number, SceneAudio>>(new Map());
  /** The narration line currently sounding, with its click-free gain. */
  const currentSourceRef = useRef<VoiceSourceHandle | null>(null);
  // The narration's echo chain for the current playback session. It is kept
  // alive between scenes so the tail rings on instead of being chopped off.
  const echoGraphRef = useRef<{ ctx: AudioContext; graph: VoiceEchoGraph } | null>(null);
  const insertMixerRef = useRef<InsertAudioMixer | null>(null);
  const watermarkImgRef = useRef<HTMLImageElement | null>(null);
  const customerLogoImgRef = useRef<HTMLImageElement | null>(null);
  const [logoLoadedCounter, setLogoLoadedCounter] = useState<number>(0);
  // Repaint the canvas once the caption typefaces arrive
  const [fontsLoadedCounter, setFontsLoadedCounter] = useState<number>(0);

  // Load product branding only when the active plan requires it. The final
  // render independently waits for this asset before exporting a Free file.
  useEffect(() => {
    if (!showPlanWatermark) {
      watermarkImgRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      watermarkImgRef.current = img;
      setLogoLoadedCounter((c) => c + 1);
    };
    img.src = "/scenering-logo.png";
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [showPlanWatermark]);

  /** Keep the Free-plan product mark above all creator-owned preview layers. */
  const drawPlanWatermark = useCallback((ctx: CanvasRenderingContext2D) => {
    if (!showPlanWatermark) return;
    drawSceneringWatermark(ctx, watermarkImgRef.current, ctx.canvas.width, ctx.canvas.height);
  }, [showPlanWatermark]);

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
  const scenesWithImages = scenes.filter(sceneHasVisual);

  /* Whether anything in this project will actually be spoken. The voiceover switch
     alone is not the answer: a scene whose text is a transcript of its own
     soundtrack is never read aloud, so there are no first words to wait for
     and the picture starts at zero. Same rule, same input as RenderView, so
     the preview and the export open on the same frame. */
  const speaks = voiceoverEnabled && projectHasNarration(scenesWithImages);


  // Piper uses Scenering's built-in profile catalogue; it needs no provider
  // account or remote voice-directory request.
  useEffect(() => {
    onVoicesLoaded?.(STUDIO_VOICE_PRESETS.map((voice) => ({
      id: voice.id,
      name: voice.name,
      gender: voice.gender,
      accent: voice.accent,
      locale: voice.locale,
    })));
  }, [onVoicesLoaded]);

  // Invalidate any cached scene audio whose voice_id or text has changed
  useEffect(() => {
    const activeVoice = propSelectedVoice || selectedVoice;
    scenes.forEach((scene) => {
      const spokenText = narratableText(scene);
      // A transcript can inherit audio_url/a memory buffer from an earlier
      // script. Drop it as soon as the scene becomes caption-only so hydration
      // and playback cannot resurrect narration over the source soundtrack.
      if (scene.caption_source === "transcript") {
        audioBuffersRef.current.delete(scene.id);
        return;
      }
      const existing = audioBuffersRef.current.get(scene.id);
      if (existing && existing.voiceKey) {
        const expectedKey = scene.audio_url
          ? `imported_${scene.audio_url}`
          : `${scene.voice_id || activeVoice}_${spokenText}`;
        if (existing.voiceKey !== expectedKey) {
          audioBuffersRef.current.delete(scene.id);
        }
      }
    });
  }, [scenes, propSelectedVoice, selectedVoice]);

  // Eagerly hydrate existing saved voiceovers into memory so play starts immediately with zero delay
  useEffect(() => {
    // With narration switched off there is nothing to hydrate, and anything
    // already in memory has to go or it would still be heard on play.
    if (!voiceoverEnabled) {
      audioBuffersRef.current.clear();
      return;
    }
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
        const spokenText = narratableText(scene);
        // Do not even resolve a stale saved voiceover for words that came from
        // the picture. They remain in scene.text only because captions draw it.
        if (scene.caption_source === "transcript") {
          audioBuffersRef.current.delete(scene.id);
          continue;
        }
        // Nothing to say and not the creator's own recording: whatever file is
        // still attached belongs to an earlier script and is not narration.
        if (!spokenText && !isPreparedVoiceoverId(scene.voice_id)) {
          audioBuffersRef.current.delete(scene.id);
          continue;
        }
        if (!audioBuffersRef.current.has(scene.id)) {
          const resolved = await resolveSceneAudioBuffer(scene, audioCtx);
          if (resolved && !cancelled) {
            audioBuffersRef.current.set(scene.id, {
              buffer: resolved.buffer,
              url: resolved.url,
              voiceKey: scene.audio_url
                ? `imported_${scene.audio_url}`
                : `${scene.voice_id || activeVoice}_${spokenText}`,
            });
          }
        }
      }
    };
    hydrateAudio();
    return () => {
      cancelled = true;
    };
  }, [scenes, propSelectedVoice, selectedVoice, voiceoverEnabled]);

  // Synthesize audio for a single scene with per-scene voice support
  const synthesizeScene = useCallback(
    async (scene: Scene, audioCtx: AudioContext): Promise<SceneAudio | null> => {
      const activeVoice = propSelectedVoice || selectedVoice;
      const voiceToUse = scene.voice_id || activeVoice;
      const text = narratableText(scene);
      const voiceKey = scene.audio_url ? `imported_${scene.audio_url}` : `${voiceToUse}_${text}`;

      /* A transcript lives in scene.text because captions render that field, but
         it is audio that came OUT of the picture, never a script to read back.
         This guard must precede saved-audio resolution: captioning can leave an
         old audio_url behind, and resolving it would revive that earlier voice. */
      if (scene.caption_source === "transcript") return null;
      /* A scene with nothing to say has no narration of its own: any file
         still attached is what an earlier script left behind. A prepared
         track is the creator's own recording and is kept. */
      if (!text && !isPreparedVoiceoverId(scene.voice_id)) return null;

      // 0. Check pre-generated/saved audio from Voiceover Studio cache, memory or IndexedDB.
      const resolved = await resolveSceneAudioBuffer(scene, audioCtx);
      if (resolved) {
        return {
          buffer: resolved.buffer,
          url: resolved.url,
          voiceKey,
          words: resolved.words,
        };
      }
      // A prepared file is the creator's own recording and cannot be re-made;
      // an unreadable one is an error worth saying out loud. A generated line
      // whose saved file no longer belongs to this scene is simply generated
      // again, in the narrator and words the scene has now.
      if (scene.audio_url && isPreparedVoiceoverId(scene.voice_id)) {
        throw new Error(`The saved audio for scene ${(scene.order_index ?? 0) + 1} could not be loaded.`);
      }

      // Piper is the generated-speech provider. Surface failures rather than
      // substituting a browser voice, tone, or fabricated silence.
      try {
        const withTimeline = await fetchSceneAudioWithTimeline(text, voiceToUse, { timeoutMs: 15000 });
        if (!withTimeline) throw new Error("Piper returned no audio for this scene.");
        const audioBuffer = await audioCtx.decodeAudioData(withTimeline.rawBuffer.slice(0));
        const blob = new Blob([withTimeline.rawBuffer], { type: withTimeline.mimeType });
        const url = URL.createObjectURL(blob);
        // Replacement, not addition: an older narrator's file for this scene
        // is forgotten as this one is filed.
        await replaceSceneNarration(scene.id, voiceToUse, text, {
          audioBuffer,
          blobUrl: url,
          duration: audioBuffer.duration,
          voiceId: voiceToUse,
          text,
          rawBuffer: withTimeline.rawBuffer,
          blob,
          words: withTimeline.words,
        });
        return { buffer: audioBuffer, url, voiceKey, words: withTimeline.words };
      } catch (error) {
        console.warn(`Piper synthesis failed for scene ${scene.id}:`, error);
        throw error;
      }
    },
    [selectedVoice, propSelectedVoice]
  );

  // Pre-generate all scene audio in parallel with live status
  const generateAllAudio = useCallback(async () => {
    if (scenesWithImages.length === 0) return;
    // A project with the voiceover switched off never reaches the TTS
    // service: no synthesis, no waiting, no silent buffers to schedule.
    if (!voiceoverEnabled) {
      audioBuffersRef.current = new Map();
      setAudioStatus("Voiceover off");
      setLoadingAudio(false);
      const ctx = audioCtxRef.current || new AudioContext();
      audioCtxRef.current = ctx;
      return { audioCtx: ctx, buffers: audioBuffersRef.current };
    }

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

    /* Concurrent synthesis across all scenes for instant readiness. A provider
       failure belongs to that scene only: Promise.all used to reject the whole
       batch, discard every successful buffer and make preview look completely
       broken. allSettled keeps the usable voices and reports the missing ones. */
    const outcomes = await Promise.allSettled(
      scenesWithImages.map(async (scene) => {
        try {
          const activeVoice = propSelectedVoice || selectedVoice;
          const spokenText = narratableText(scene);
          const expectedKey = scene.audio_url
            ? `imported_${scene.audio_url}`
            : `${scene.voice_id || activeVoice}_${spokenText}`;
          const existing = audioBuffersRef.current.get(scene.id);
          if (existing && existing.voiceKey === expectedKey) {
            newBuffers.set(scene.id, existing);
            return;
          }

          const audio = await synthesizeScene(scene, audioCtx);
          if (audio) newBuffers.set(scene.id, audio);
        } finally {
          completedCount++;
          setAudioStatus(`Generating voice: ${completedCount}/${scenesWithImages.length} checked...`);
        }
      })
    );

    audioBuffersRef.current = newBuffers;
    const failedScenes = outcomes.flatMap((outcome, index) =>
      outcome.status === "rejected"
        ? [{ sceneNumber: (scenesWithImages[index].order_index ?? index) + 1, reason: outcome.reason }]
        : []
    );
    if (failedScenes.length > 0) {
      const sceneList = failedScenes.map((failure) => failure.sceneNumber).join(", ");
      const firstReason = failedScenes[0].reason;
      const detail = firstReason instanceof Error && firstReason.message
        ? ` ${firstReason.message}`
        : "";
      setAudioStatus(
        `Narration failed for scene${failedScenes.length === 1 ? "" : "s"} ${sceneList}. ` +
          `Preview continues without ${failedScenes.length === 1 ? "that voice" : "those voices"}.${detail}`
      );
    } else {
      setAudioStatus(`${newBuffers.size} scene(s) ready`);
    }
    setLoadingAudio(false);
    return { audioCtx, buffers: newBuffers };
  }, [scenesWithImages, synthesizeScene, propSelectedVoice, selectedVoice, voiceoverEnabled]);

  // Unified Scene & Insert Drawing Function
  useEffect(() => {
    let cancelled = false;
    // The stylesheet, then the specific face this project's captions use.
    // Canvas does not trigger a font download the way DOM text does, so
    // without the second call the preview draws the fallback typeface no
    // matter which style was chosen.
    loadCaptionFonts()
      .then(() => ensureCaptionFont(captionsConfig?.fontId || getCaptionStyle(captionsConfig?.preset).fontId))
      .then(() => {
        if (!cancelled) setFontsLoadedCounter((n) => n + 1);
      });
    return () => {
      cancelled = true;
    };
  }, [captionsConfig?.fontId, captionsConfig?.preset]);

  // Resolve saved `custom-video:<id>` addresses before asking the pool to
  // decode them. App also starts this at boot, but the preview must subscribe
  // to completion itself or an already-mounted black canvas never repaints.
  useEffect(() => {
    let active = true;
    void loadCustomVideos().then(() => {
      if (!active) return;
      setVideoStoreReady(true);
      if (!playingRef.current) {
        setClipFrameRevision((revision) => revision + 1);
      }
    });
    return () => { active = false; };
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
      let source: SceneDrawable | null = img as any;
      if (sceneHasClip(scene)) {
        const pool = clipPoolRef.current;
        const el = pool.get(scene);
        if (el) {
          if (!playingRef.current) {
            pool.seekToProgress(scene, sceneProgress, Math.max(0.1, scene.duration || 1));
          }
          if (el.readyState >= 2 && el.videoWidth > 0) {
            source = asDrawableClip(el);
          }
        }
      }

      // Plain-colour scene: fill the frame before anything else draws, so the
      // live preview shows the same flat colour the export will.
      if (sceneIsBlankColor(scene) && scene.blank_color) {
        ctx.save();
        try {
          ctx.filter = "none";
        } catch {}
        ctx.fillStyle = scene.blank_color;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      const reportClipDrawError = (error: unknown) => {
        if (!clipDrawErrorRef.current) {
          clipDrawErrorRef.current = true;
          setClipPreviewLoading(false);
          setClipPreviewError(
            `The video decoded, but the canvas could not draw its frame. (${(error as Error)?.message || "canvas draw failed"})`
          );
        }
      };
      let handledTransition = false;
      const sceneIdx = Math.max(0, scenesWithImages.findIndex((s) => s.id === scene.id));
      if (
        scene.transition &&
        scene.transition !== "none" &&
        elapsedInScene !== undefined
      ) {
        const transDur = getTransitionDuration(scene.duration || 20);
        if (elapsedInScene < transDur) {
          const { scale: motionScale, dx: motionDx, dy: motionDy } = getSceneCameraTransform(
            scene,
            sceneAnimationEnabled,
            sceneProgress,
            w,
            h,
            sceneIdx
          );
          let prevSource: SceneDrawable | null = prevImg as any;
          if (prevScene && sceneHasClip(prevScene)) {
            const el = clipPoolRef.current.get(prevScene);
            if (el && el.readyState >= 2 && el.videoWidth > 0) {
              prevSource = asDrawableClip(el);
            }
          }
          const { scale: prevScale, dx: prevDx, dy: prevDy } = prevScene
            ? getSceneCameraTransform(
                prevScene,
                sceneAnimationEnabled,
                1,
                w,
                h,
                Math.max(0, sceneIdx - 1)
              )
            : { scale: 1, dx: 0, dy: 0 };
          const safeScale = isNaN(motionScale) ? 1 : motionScale;
          const safeDx = isNaN(motionDx) ? 0 : motionDx;
          const safeDy = isNaN(motionDy) ? 0 : motionDy;
          const safePrevScale = isNaN(prevScale) ? 1 : prevScale;
          const safePrevDx = isNaN(prevDx) ? 0 : prevDx;
          const safePrevDy = isNaN(prevDy) ? 0 : prevDy;

          try {
            handledTransition = drawSceneTransition(
              ctx,
              scene,
              sourceHasPixels(source) ? source : null,
              prevScene || null,
              sourceHasPixels(prevSource) ? prevSource : null,
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
          } catch (error) {
            if (sceneHasClip(scene) || sceneHasClip(prevScene)) reportClipDrawError(error);
          }
        }
      }

      if (!handledTransition && sourceHasPixels(source)) {
        const img = source;
        const { scale: motionScale, dx: motionDx, dy: motionDy } = getSceneCameraTransform(
          scene,
          sceneAnimationEnabled,
          sceneProgress,
          w,
          h,
          sceneIdx
        );
        // getMotionTransform returns an offset that recentres a canvas-sized
        // draw; the framing engine centres the photo itself, so only the
        // leftover wobble is passed through.
        try {
          drawSceneImage(ctx, img, scene, w, h, {
            motionScale,
            motionDx: motionDx + (w * motionScale - w) / 2,
            motionDy: motionDy + (h * motionScale - h) / 2,
            filter: getFilterCanvas(videoFilterRef.current, w),
          });
        } catch (error) {
          if (sceneHasClip(scene)) reportClipDrawError(error);
        }
      }

      // Per-scene living-scene animation layers (weather, water, particles,
      // steam, fire, lighting...) are composited after the base image/camera
      // move and before project-wide video filters, captions and logos.
      if (sceneAnimationEnabled) {
        renderSceneAnimationEffects(
          ctx,
          scene,
          w,
          h,
          elapsedInScene ?? absoluteTime,
          sceneProgress,
          { enabled: true, audioLevel }
        );
      }

      // Animated atmosphere of the project-wide filter (grain, mist, dust,
      // sun flare, VHS artefacts...). Runs over every scene, whole video.
      paintVideoFilter(ctx, videoFilterRef.current, w, h, absoluteTime);

      // Check if we are currently inside an Intro or Outro segment
      const introSec = sectionsRef.current.intro;
      const outroSec = sectionsRef.current.outro;
      const introDur = introSec ? Math.max(0.5, introSec.duration) : 0;
      const outroDur = outroSec ? Math.max(0.5, outroSec.duration) : 0;
      const scriptDur = scenesWithImages.reduce((sum, s, i) => {
        const sa = audioBuffersRef.current.get(s.id);
        return sum + sceneWindowDuration(s, sa?.buffer, i, Boolean(introSec), speaks, singleScene);
      }, 0);

      const isIntroSegment = Boolean(introSec && absoluteTime < introDur);
      const isOutroSegment = Boolean(outroSec && absoluteTime >= introDur + scriptDur);
      const isIntroOrOutro = isIntroSegment || isOutroSegment;

      // Render Subtitles / Captions (Strictly disabled for Intro and Outro segments per user instruction).
      // The first scene's speech begins speechOffset seconds into its window
      // (the opening lead-in); captions are held back until then so they
      // appear exactly when the voice starts speaking — same as the export.
      const speechOffsetSec = sceneSpeechOffset(sceneIdx, Boolean(introSec), speaks);
      const speechElapsed =
        elapsedInScene !== undefined ? Math.max(0, elapsedInScene - speechOffsetSec) : undefined;
      const speechStarted = elapsedInScene === undefined || elapsedInScene >= speechOffsetSec;
      // Captions are drawn when the project switch is on AND this scene has not
      // been switched off on its own. Both halves are checked here, in the
      // renderer, so turning either one off is visible immediately rather than
      // only after some later "apply" step.
      const sceneCaptionsOn = scene.burn_caption ?? true;
      if (
        !isIntroOrOutro &&
        captionsConfig?.enabled !== false &&
        sceneCaptionsOn &&
        scene.text &&
        speechStarted
      ) {
        const activeCaptions = captionsConfig || DEFAULT_CAPTIONS_CONFIG;
        const sa = audioBuffersRef.current.get(scene.id);
        const speechDur = sa?.buffer.duration && sa.buffer.duration > 0.3 ? sa.buffer.duration : (scene.duration || 4);
        const speechProgress = speechElapsed !== undefined ? Math.min(1, Math.max(0, speechElapsed / Math.max(0.1, speechDur))) : sceneProgress;
        const footageWords = sa?.words ? null : sceneCaptionWords(scene);
        renderCanvasCaptions(ctx, scene.text, speechProgress, activeCaptions, w, h, {
          // Same real word timings the export uses — the preview highlights
          // each word at the moment the voice actually says it. Footage with no
          // narration has no voice to follow, so its captions lock onto the
          // transcript of its own soundtrack, which is what the export does too.
          wordTimings: sa?.words ?? footageWords,
          /* The footage's own clock starts with the scene, the voice's clock
             after the opening hold — the export makes the same distinction, so
             the preview cannot show a caption the file will not show. */
          audioTimeSec: footageWords ? Math.max(0, elapsedInScene ?? 0) : speechElapsed ?? 0,
        });
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

      // Product branding is composited after every creator-controlled layer.
      drawPlanWatermark(ctx);

      // Selection chrome: dashed frame + corner resize handle for the element
      // currently open in the properties modal, so it can be moved and resized in place.
      if (selectedInsertId && inserts) {
        const sel = inserts.find((i) => i.id === selectedInsertId);
        if (sel && absoluteTime >= sel.startTime - 0.01 && absoluteTime <= sel.startTime + sel.duration + 0.01) {
          // A privacy block carries eight grips on its own edges; everything
          // else keeps the familiar dashed frame and single corner handle.
          if (sel.category === "block_out") {
            drawRedactionSelectionChrome(ctx, sel, w, h);
          } else {
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
      }

      // Progress bar along bottom
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(0, h - 4, w, 4);
      ctx.fillStyle = "#6366f1";
      ctx.fillRect(0, h - 4, w * sceneProgress, 4);
    },
    [scenesWithImages.length, inserts, customerLogo, captionsConfig, selectedInsertId, fontsLoadedCounter, sceneAnimationEnabled, drawPlanWatermark]
  );

  // Redraw when user scrubs playhead while paused OR when logo/captions/scene changes
  useEffect(() => {
    if (!videoStoreReady || isPlaying || scenesWithImages.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false }) || canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const scrubTime = currentPlayheadTime;
    const introSec = activeIntro;
    const outroSec = activeOutro;
    const introDur = introDuration;
    const outroDur = outroDuration;
    const scriptDur = scenesWithImages.reduce((sum, s, i) => {
      const sa = audioBuffersRef.current.get(s.id);
      return sum + sceneWindowDuration(s, sa?.buffer, i, Boolean(introSec), speaks, singleScene);
    }, 0);

    let targetScene = scenesWithImages[0];
    let targetIdx = 0;
    let sceneProgress = 0;
    let sceneOffset = 0;

    if (introSec && scrubTime < introDur) {
      const p = scrubTime / Math.max(0.1, introDur);
      renderSection(ctx, introSec, canvas.width, canvas.height, scrubTime, p);
      drawPlanWatermark(ctx);
      return;
    } else if (outroSec && scrubTime >= introDur + scriptDur) {
      const oe = scrubTime - introDur - scriptDur;
      renderSection(ctx, outroSec, canvas.width, canvas.height, oe, oe / Math.max(0.1, outroDur));
      drawPlanWatermark(ctx);
      return;
    } else {
      const scriptTime = Math.max(0, scrubTime - introDur);
      let acc = 0;
      for (let i = 0; i < scenesWithImages.length; i++) {
        const s = scenesWithImages[i];
        const sa = audioBuffersRef.current.get(s.id);
        const sDur = sceneWindowDuration(s, sa?.buffer, i, Boolean(introSec), speaks, singleScene);
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
    videoStoreReady,
    clipFrameRevision,
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
    drawPlanWatermark,
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
    /** Privacy block taken from its stored rectangle at the start of the drag. */
    startRect?: RedactionRect;
    handle?: RedactionHandle;
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

    const selected = selectedInsertId ? inserts.find((i) => i.id === selectedInsertId) : undefined;

    /*
     * A privacy block is moved and resized by pulling on the preview itself.
     * The eight grips are tested first (they sit on the rectangle's edges, so
     * they would otherwise be swallowed by the block's own hit box), then any
     * press inside the block moves it. The block moves by whole-normalised
     * deltas, never snapped to the preset safe-area anchors: a redaction has to
     * land on the words, not on a designer's idea of where a badge looks good.
     */
    if (selected && selected.category === "block_out") {
      const canvas = canvasRef.current;
      const cw = canvas?.width || 0;
      const ch = canvas?.height || 0;
      const frame = getRedactionFrame(selected, cw, ch);
      const px = p.x * cw;
      const py = p.y * ch;
      const handle = hitTestRedactionHandle(frame, px, py, redactionGripTolerance(cw));
      if (handle) {
        dragStateRef.current = {
          id: selected.id,
          mode: "resize",
          startX: p.x,
          startY: p.y,
          startSize: selected.size || 1,
          insert: selected,
          startRect: resolveRedaction(selected).rect,
          handle,
        };
        target.setPointerCapture?.(e.pointerId);
        return;
      }
      if (pointInRedactionFrame(frame, px, py)) {
        dragStateRef.current = {
          id: selected.id,
          mode: "move",
          startX: p.x,
          startY: p.y,
          startSize: selected.size || 1,
          insert: selected,
          startRect: resolveRedaction(selected).rect,
        };
        target.setPointerCapture?.(e.pointerId);
        return;
      }
      // fall through: a press elsewhere may still pick up another element
    }

    // 1. corner handle of the already-selected insert => resize
    //    (a privacy block was fully handled above: its geometry is the rect,
    //    so the old "scale the whole element" grip must not apply to it)
    if (selected && selected.category !== "block_out") {
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
      /*
       * A block picked up for the first time behaves exactly like one that was
       * already selected: pressing a grip resizes it, pressing its body moves
       * it. Selecting and dragging are one gesture, never two.
       */
      const canvas = canvasRef.current;
      const isBlock = hit.category === "block_out" && Boolean(canvas);
      const hitFrame = isBlock ? getRedactionFrame(hit, canvas!.width, canvas!.height) : null;
      const hitHandle =
        hitFrame && canvas
          ? hitTestRedactionHandle(hitFrame, p.x * canvas.width, p.y * canvas.height, redactionGripTolerance(canvas.width))
          : null;
      dragStateRef.current = {
        id: hit.id,
        mode: hitHandle ? "resize" : "move",
        startX: p.x,
        startY: p.y,
        startSize: hit.size || 1,
        insert: hit,
        startRect: isBlock ? resolveRedaction(hit).rect : undefined,
        handle: hitHandle || undefined,
      };
      target.setPointerCapture?.(e.pointerId);
    }
  };

  /**
   * The cursor is the affordance: it says "this edge can be pulled" before the
   * creator presses anything. Hover state is free — it is computed from the
   * same rectangle that is painted, so it can never drift out of alignment.
   */
  const redactionCursorAt = (px: number, py: number): string => {
    const canvas = canvasRef.current;
    if (!canvas || !inserts) return "";
    const selected = selectedInsertId ? inserts.find((i) => i.id === selectedInsertId) : undefined;
    if (!selected || selected.category !== "block_out") return "";
    const frame = getRedactionFrame(selected, canvas.width, canvas.height);
    const x = px * canvas.width;
    const y = py * canvas.height;
    const handle = hitTestRedactionHandle(frame, x, y, redactionGripTolerance(canvas.width));
    if (handle) return getRedactionHandlePoints(frame)[handle].cursor;
    if (pointInRedactionFrame(frame, x, y)) return "move";
    return "";
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragStateRef.current;
    const p = getCanvasPoint(e);

    if (!drag) {
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = redactionCursorAt(p.x, p.y);
      return;
    }
    if (!onUpdateInsert) return;

    // ---- privacy block: drag inside to move, pull any grip to resize ----
    if (drag.insert.category === "block_out" && drag.startRect) {
      const canvas = canvasRef.current;
      const dx = p.x - drag.startX;
      const dy = p.y - drag.startY;
      const nextRect =
        drag.mode === "resize" && drag.handle
          ? resizeRedactionRect(drag.startRect, drag.handle, dx, dy)
          : moveRedactionRect(drag.startRect, dx, dy);
      onUpdateInsert({
        ...drag.insert,
        visualOptions: { ...drag.insert.visualOptions, redactionRect: nextRect },
      });
      if (canvas) {
        canvas.style.cursor =
          drag.mode === "resize" && drag.handle
            ? getRedactionHandlePoints(getRedactionFrame(drag.insert, canvas.width, canvas.height))[drag.handle]
                .cursor
            : "move";
      }
      return;
    }

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

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Preserve the grab offset, including when a preset/render clamp moved
    // the visible anchor away from the stored position. A wide selection must
    // not jump to put its centre underneath the pointer.
    const bounds = getInsertBounds(drag.insert, canvas.width, canvas.height, canvas.getContext("2d"));
    const clampedX = Math.max(0, Math.min(1, bounds.cx / canvas.width + p.x - drag.startX));
    const clampedY = Math.max(0, Math.min(1, bounds.cy / canvas.height + p.y - drag.startY));
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

  const handleCanvasPointerUp = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    dragStateRef.current = null;
    const canvas = canvasRef.current;
    if (canvas) {
      // fall back to the hover cursor for whichever grip is under the pointer
      const point = e ? getCanvasPoint(e) : null;
      canvas.style.cursor = point ? redactionCursorAt(point.x, point.y) : "";
    }
  };

  // ------ PLAY PREVIEW ------
  const playPreview = useCallback(async (seekTime?: number) => {
    if (scenesWithImages.length === 0) return;
    await loadCustomVideos();
    setVideoStoreReady(true);

    // Starting the video silences any library preview still playing, so the
    // play button always gives one soundtrack.
    stopAllSoundPreviews();

    // Claim this playback. Anything already running or still preparing is
    // superseded, so a second press cannot end up with two soundtracks.
    const epoch = ++playEpochRef.current;
    const stale = () => playEpochRef.current !== epoch;
    startingRef.current = true;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false }) || canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const images = await Promise.all(
      scenesWithImages.map((s, i) => loadImage(s.image_url || "", i))
    );
    if (stale()) return;

    // Pre-render each scene's expensive static layers (graded copy, blurred
    // backdrop) before playback — the same caches the export uses. Without
    // this the first frames of every scene paid for grade + blur + decode,
    // which is the visible "jump" at the start of each motion effect.
    try {
      const gradeForCache = getFilterCanvas(videoFilter, canvas.width);
      images.forEach((img, i) => {
        prewarmSceneFrame(img, scenesWithImages[i], canvas.width, canvas.height, gradeForCache);
      });
    } catch {}

    let audioCtx = audioCtxRef.current;
    if (!audioCtx) {
      audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
    }
    let buffers = audioBuffersRef.current;

    const activeVoice = propSelectedVoice || selectedVoice;

    // Check if any scene is missing from in-memory buffers. With narration
    // off, nothing is ever "missing" — there is simply no spoken track, and
    // pressing play must not start synthesising one.
    const missingScenes = voiceoverEnabled
      ? scenesWithImages.filter((s) => {
          const spokenText = narratableText(s);
          // Caption text imported for the footage is deliberately not a
          // missing voice, even if an obsolete saved narration URL remains.
          if (s.caption_source === "transcript") return false;
          if (!s.audio_url && !spokenText) return false;
          const existing = buffers.get(s.id);
          const expectedKey = s.audio_url
            ? `imported_${s.audio_url}`
            : `${s.voice_id || activeVoice}_${spokenText}`;
          return !existing || existing.voiceKey !== expectedKey;
        })
      : [];

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
              : `${s.voice_id || activeVoice}_${narratableText(s)}`,
          });
        } else {
          allResolvedLocally = false;
        }
      }

      // Only synthesize over the network if voiceover was never generated at all
      if (!allResolvedLocally) {
        setAudioStatus("Preparing Piper voice dialogue...");
        try {
          const result = await generateAllAudio();
          if (result) {
            audioCtx = result.audioCtx;
            buffers = result.buffers;
          }
        } catch (error: any) {
          if (!stale()) {
            setAudioStatus(error?.message || "Piper could not prepare the narration. Check the model download status and retry.");
            setLoadingAudio(false);
            setIsPlaying(false);
            playingRef.current = false;
            startingRef.current = false;
          }
          return;
        }
      }
    }

    if (audioCtx && audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
    if (stale()) return;

    const visualizerFftSize = requiredVisualizerFftSize(inserts);

    if (audioCtx && !analyserRef.current) {
      // Master limiter node: prevents digital clipping/crackling when voice + music + sfx sum together
      const masterLimiter = audioCtx.createDynamicsCompressor();
      masterLimiter.threshold.setValueAtTime(-1.5, audioCtx.currentTime);
      masterLimiter.knee.setValueAtTime(6.0, audioCtx.currentTime);
      masterLimiter.ratio.setValueAtTime(16.0, audioCtx.currentTime);
      masterLimiter.attack.setValueAtTime(0.003, audioCtx.currentTime);
      masterLimiter.release.setValueAtTime(0.15, audioCtx.currentTime);
      masterLimiter.connect(audioCtx.destination);

      const an = audioCtx.createAnalyser();
      // Advanced dense radial spectra can request finer FFT resolution; legacy
      // projects remain on the lightweight 512-sample analyser.
      an.fftSize = visualizerFftSize;
      an.smoothingTimeConstant = 0.72;
      an.minDecibels = -92;
      an.maxDecibels = -12;
      analyserRef.current = an;
      an.connect(masterLimiter);

      const music = audioCtx.createAnalyser();
      music.fftSize = visualizerFftSize;
      music.smoothingTimeConstant = 0.72;
      music.minDecibels = -92;
      music.maxDecibels = -12;
      musicAnalyserRef.current = music;
      music.connect(masterLimiter);

    } else if (audioCtx) {
      // If a dense visualiser was added after an earlier preview session, retune
      // the existing analysers before playback starts. Scratch buffers below
      // resize themselves from frequencyBinCount/fftSize.
      try {
        if (analyserRef.current && analyserRef.current.fftSize !== visualizerFftSize) analyserRef.current.fftSize = visualizerFftSize;
        if (musicAnalyserRef.current && musicAnalyserRef.current.fftSize !== visualizerFftSize) musicAnalyserRef.current.fftSize = visualizerFftSize;
      } catch {}
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

    const scriptDur = scenesWithImages.reduce((sum, s, i) => {
      const sa = buffers.get(s.id);
      return sum + sceneWindowDuration(s, sa?.buffer, i, Boolean(introSec), speaks, singleScene);
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
    // The decode above is the longest await in the whole function, and it is
    // the one that used to strand a music bed. If the user stopped while it
    // ran, throw the mixer away instead of handing it the timeline.
    if (stale()) {
      try { insertMixer?.dispose(); } catch {}
      return;
    }

    insertMixerRef.current = insertMixer;
    if (insertMixer) insertMixer.startFrom(safeStartTime);

    startingRef.current = false;
    setIsPlaying(true);
    setProgress(totalDur > 0 ? safeStartTime / totalDur : 0);
    playingRef.current = true;

    let currentAudioSource: VoiceSourceHandle | null = null;

    /**
     * Start one scene's narration — and close the previous line instead of
     * cutting it.
     *
     * Both halves matter. The old code called stop() on a source that was
     * mid-waveform and started the next one at full gain: two steps in the
     * signal per scene change, heard as crackling. Now the outgoing line fades
     * out over ~18ms (its hard stop is scheduled for the end of that fade, so
     * nothing overlaps) and the incoming line opens from silence over ~12ms.
     */
    const playSceneAudio = (idx: number, offset: number = 0) => {
      if (currentAudioSource) {
        currentAudioSource.stop();
        currentAudioSource = null;
      }
      if (!audioCtx) return;

      const scene = scenesWithImages[idx];
      if (!scene) return;
      const sceneAudio = buffers.get(scene.id);
      if (sceneAudio) {
        const echo = echoGraphRef.current;
        const destination = echo && echo.ctx === audioCtx && voiceEchoIsActive(echoRef.current)
          // Dry voice + echo tail, both landing on the voice bus
          ? echo.graph.input
          : analyserRef.current || audioCtx.destination;
        /* The line may only sound for the scene it narrates. A file left over
           from a longer voice used to be heard past its own scene — and, at
           the end of the video, past the last frame. */
        const windowDur = sceneWindowDuration(
          scene,
          sceneAudio.buffer,
          idx,
          Boolean(introSec),
          speaks,
          singleScene
        );
        const speechStartsAt = sceneSpeechOffset(idx, Boolean(introSec), speaks);
        const handle = startVoiceSource(audioCtx, sceneAudio.buffer, destination, {
          offsetSeconds: offset,
          durationSeconds: Math.max(0.05, windowDur - speechStartsAt - offset),
          gainScale: VOICE_NARRATION_GAIN,
        });
        currentAudioSource = handle;
        currentSourceRef.current = handle;
      }
    };

    let currentPlayingSceneIdx = -999;
    const playStartWallTime = performance.now();

    // A scene whose speech has not started yet (the opening lead-in) waits
    // for its offset before the narration begins.
    let pendingAudioSceneIdx = -999;

    // If starting inside script scenes, begin playing scene audio immediately
    if (safeStartTime >= introDur && safeStartTime < introDur + scriptDur) {
      const initialScriptTime = safeStartTime - introDur;
      let acc = 0;
      for (let i = 0; i < scenesWithImages.length; i++) {
        const s = scenesWithImages[i];
        const sa = buffers.get(s.id);
        const sDur = sceneWindowDuration(s, sa?.buffer, i, Boolean(introSec), speaks, singleScene);
        if (initialScriptTime >= acc && initialScriptTime < acc + sDur) {
          currentPlayingSceneIdx = i;
          setCurrentSceneIndex(i);
          const speechOffset = initialScriptTime - acc - sceneSpeechOffset(i, Boolean(introSec), speaks);
          if (speechOffset >= 0) playSceneAudio(i, speechOffset);
          else pendingAudioSceneIdx = i;
          break;
        }
        acc += sDur;
        if (i === scenesWithImages.length - 1) {
          currentPlayingSceneIdx = i;
          setCurrentSceneIndex(i);
          const speechOffset = Math.max(0, initialScriptTime - acc) - sceneSpeechOffset(i, Boolean(introSec), speaks);
          if (speechOffset >= 0) playSceneAudio(i, speechOffset);
          else pendingAudioSceneIdx = i;
        }
      }
    }

    /**
     * Scratch buffers for the analyser reads.
     *
     * Reading the two buses used to allocate four typed arrays per frame.
     * At 60fps that is ~240 short-lived allocations a second, and the
     * garbage collector pauses it caused on the main thread were long enough
     * to starve the Web Audio callback — heard as gritty, stuttering sound.
     * The analysers now read into buffers allocated once per playback.
     */
    type BusScratch = { freq: Uint8Array<ArrayBuffer>; wave: Uint8Array<ArrayBuffer> };
    const busScratch = new WeakMap<AnalyserNode, BusScratch>();
    const scratchFor = (node: AnalyserNode): BusScratch => {
      let s = busScratch.get(node);
      if (!s || s.freq.length !== node.frequencyBinCount || s.wave.length !== node.fftSize) {
        s = { freq: new Uint8Array(node.frequencyBinCount), wave: new Uint8Array(node.fftSize) };
        busScratch.set(node, s);
      }
      return s;
    };

    const animate = () => {
      // A superseded playback must not keep drawing or driving audio.
      if (!playingRef.current || stale()) {
        currentAudioSource?.stop();
        return;
      }

      const now = performance.now();
      const totalElapsed = (now - playStartWallTime) / 1000 + safeStartTime;

      // Drive insert audio (BGM / SFX / CTA / intro-outro sounds)
      try {
        insertMixerRef.current?.tick(totalElapsed);
      } catch {}

      if (totalElapsed >= totalDur) {
        currentAudioSource?.stop();
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
          const { freq, wave } = scratchFor(node);
          node.getByteFrequencyData(freq);
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
        drawPlanWatermark(ctx);
        setProgress(totalDur > 0 ? totalElapsed / totalDur : 0);
        onSeek?.(totalElapsed);
        animFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      // 2. OUTRO SEGMENT: Full screen insert, NO captions, NO speech voiceover
      if (outroSec && totalElapsed >= introDur + scriptDur) {
        if (currentAudioSource) {
          currentAudioSource.stop();
          currentAudioSource = null;
        }
        const outroElapsed = totalElapsed - introDur - scriptDur;
        const outroProgress = outroElapsed / Math.max(0.1, outroDur);
        renderSection(ctx, outroSec, canvas.width, canvas.height, outroElapsed, outroProgress);
        drawPlanWatermark(ctx);
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
        const sDur = sceneWindowDuration(s, sa?.buffer, i, Boolean(introSec), speaks, singleScene);
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
        // Narration starts at the scene's speech offset — during the opening
        // lead-in it waits, then begins exactly when the export's would.
        const speechOffset = activeOffset - sceneSpeechOffset(activeIdx, Boolean(introSec), speaks);
        if (speechOffset >= 0) playSceneAudio(activeIdx, speechOffset);
        else pendingAudioSceneIdx = activeIdx;

        // Hand over to the new scene's clip (if it has one) and silence the
        // one we just left, so two clips never overlap.
        const pool = clipPoolRef.current;
        pool.pauseAll();
        const entering = scenesWithImages[activeIdx];
        if (entering && sceneHasClip(entering)) {
          void pool.play(entering, activeOffset / Math.max(0.1, activeSceneDur), activeSceneDur);
        }
      }

      // The lead-in elapsed: start this scene's narration now.
      if (pendingAudioSceneIdx === activeIdx && activeIdx === currentPlayingSceneIdx) {
        const speechOffset = activeOffset - sceneSpeechOffset(activeIdx, Boolean(introSec), speaks);
        if (speechOffset >= 0) {
          playSceneAudio(activeIdx, speechOffset);
          pendingAudioSceneIdx = -999;
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
  }, [scenesWithImages, drawScene, generateAllAudio, onSeek, pacingMode, drawPlanWatermark]);

  const stopPreview = useCallback(() => {
    // Invalidate any playback still preparing in the background, so a decode
    // that finishes after this point cannot start the music.
    playEpochRef.current++;
    startingRef.current = false;
    playingRef.current = false;
    setIsPlaying(false);
    clipPoolRef.current.pauseAll();
    cancelAnimationFrame(animFrameRef.current);
    currentSourceRef.current?.stop();
    currentSourceRef.current = null;
    // dispose() stops every slot *and* unhooks the mixer's master gain from
    // the music bus, so nothing of this playback stays wired to the graph.
    try { insertMixerRef.current?.dispose(); } catch {}
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

  const togglePlayRef = useRef<() => void>(() => {});
  togglePlayRef.current = () => {
    if (playingRef.current || startingRef.current) {
      stopPreview();
    } else {
      playPreview();
    }
  };

  const togglePlay = useCallback(() => {
    togglePlayRef.current();
  }, []);

  const onPlayStateChangeRef = useRef(onPlayStateChange);
  onPlayStateChangeRef.current = onPlayStateChange;

  useEffect(() => {
    onPlayStateChangeRef.current?.(isPlaying, togglePlay);
  }, [isPlaying, togglePlay]);

  useEffect(() => {
    return () => {
      playingRef.current = false;
      cancelAnimationFrame(animFrameRef.current);
      currentSourceRef.current?.stop();
      currentSourceRef.current = null;
    };
  }, []);

  if (scenesWithImages.length === 0) {
    return (
      <div className="bg-gray-800/50 border border-hairline rounded-xl p-8 text-center">
        <div className="text-4xl mb-3"><Icon glyph="🎬" /></div>
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
            onPointerLeave={() => {
              // the canvas owns its cursor while a block is selected; hand it
              // back to the crosshair once the pointer leaves the frame
              if (canvasRef.current) canvasRef.current.style.cursor = "";
            }}
            className={`${aspectConfig.cssClass} bg-black cursor-crosshair`}
            style={{ touchAction: "none" }}
            title="Drag an overlay to move it — a Block Out can also be pulled from any edge or corner to resize it"
          />

          {clipPreviewLoading && !clipPreviewError && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center pointer-events-none z-10">
              <div className="rounded-lg border border-hairline bg-gray-950/85 px-3 py-2 text-xs text-gray-200 flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-400 animate-pulse" />
                Loading uploaded video frame…
              </div>
            </div>
          )}

          {/* Hint Overlay when hovering canvas */}
          <div className="absolute bottom-2 right-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-black/75 backdrop-blur px-2.5 py-1 rounded-md text-[11px] text-gray-300 border border-hairline">
            <Icon glyph="🖱" /> Drag elements to reposition
          </div>

          {loadingAudio && (
            <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center p-4 z-20">
              <svg className="animate-spin h-8 w-8 text-indigo-400 mb-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-white text-sm font-medium">{audioStatus}</p>
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
          {clipPreviewError && (
            <div
              className="text-xs text-amber-200 bg-amber-950/50 border border-amber-800/60 rounded-lg px-3 py-2 text-center"
              role="alert"
            >
              Video preview failed: {clipPreviewError}
            </div>
          )}
          {audioStatus && (
            <div className="text-xs text-gray-400 text-center" role="status" aria-live="polite">
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
                <Icon glyph="🎬" />
                <span>Total: {scenes.length} {scenes.length === 1 ? "Scene" : "Scenes"}</span>
                <span className="text-gray-500">·</span>
                <span>{Math.round(progress * 100)}%</span>
              </span>
            </div>

            {/* The preview is for watching. Downloading a video happens in
                Render & Export, which produces the frame-exact file at the
                chosen quality — a second, lower-quality "download the
                preview" path next to it only ever produced a file people
                then had to re-make properly. A still frame is still one
                click, because that is not a video. */}
            <div className="flex items-center gap-2 flex-wrap justify-end">
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

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
