import { useState, useEffect, useRef } from "react";
import type { Scene, AspectRatioType } from "../types";
import ImageSearchModal from "./ImageSearchModal";
import { stopAllSoundPreviews } from "../data/media-library";
import SceneFramePreview from "./SceneFramePreview";
import SceneClipPanel from "./SceneClipPanel";
import {
  FIT_MODES,
  BACKDROP_STYLES,
  resolveFraming,
  frameSizeFor,
  fitFrameInBox,
  suggestFit,
  DEFAULT_FRAMING,
  sceneIsBlankColor,
} from "../lib/scene-framing";
import { NATURE_FALLBACKS } from "../data/nature-fallbacks";
import { pickRandomSample } from "../lib/image-picker";
import ImageCandidateStrip from "./ImageCandidateStrip";
import {
  researchImages,
  replaceImage,
  proxyImageUrl,
  type ImageCandidate,
} from "../lib/image-search";
import { normalizeSceneImageUrl } from "../lib/legacy-image-urls";
import { getApiKeysHeaders, getApiKeysQueryParams } from "../lib/api-keys";
import { buildSceneImageQuery, describeSceneTopic } from "../lib/topic-extract";
import { useViewport } from "../lib/use-breakpoint";
import { sceneDurationForText, formatDuration } from "../lib/duration-utils";
import { getFilterCss, getPreset, type VideoFilterConfig } from "../data/video-filters";
import {
  countWords,
  getSpokenDurationFromWords,
  calibrateTextToTargetDuration,
  getTargetWordCount,
} from "../lib/duration-utils";

/**
 * Swatches offered for a plain-colour scene.
 *
 * A deliberate spread rather than a rainbow: near-blacks and deep tones for
 * title cards and outros, mid greys for neutral breathing room, a few brights
 * for branded cards. Any other colour is one click away via the wheel, so
 * this list only needs to cover the common cases well.
 */
export const BLANK_COLORS: { name: string; hex: string }[] = [
  { name: "Near black", hex: "#0A0A0B" },
  { name: "Charcoal", hex: "#1F2937" },
  { name: "Slate", hex: "#334155" },
  { name: "Mid grey", hex: "#6B7280" },
  { name: "Light grey", hex: "#D1D5DB" },
  { name: "Off white", hex: "#F8FAFC" },
  { name: "Pure white", hex: "#FFFFFF" },
  { name: "Deep navy", hex: "#0F172A" },
  { name: "Indigo", hex: "#4338CA" },
  { name: "Violet", hex: "#7C3AED" },
  { name: "Plum", hex: "#701A75" },
  { name: "Crimson", hex: "#9F1239" },
  { name: "Rust", hex: "#9A3412" },
  { name: "Amber", hex: "#B45309" },
  { name: "Forest", hex: "#166534" },
  { name: "Teal", hex: "#0F766E" },
  { name: "Sky", hex: "#0369A1" },
  { name: "Blush", hex: "#FBCFE8" },
  { name: "Sand", hex: "#E7D3B0" },
  { name: "Mint", hex: "#BBF7D0" },
];

interface SceneEditorProps {
  scene: Scene;
  index: number;
  totalScenes?: number;
  aspectRatio?: AspectRatioType;
  targetDuration?: number;
  onUpdateTargetDuration?: (duration: number) => void;
  onUpdate: (sceneId: number, updates: Partial<Scene>) => void;
  /** project-wide look (applied in Video Studio → Filters); shown here read-only */
  videoFilter?: VideoFilterConfig | null;
  onImageSearch: (sceneId: number, query: string) => Promise<{ imageUrl: string; allImages?: string[] } | undefined>;
  onDelete?: (sceneId: number) => void;
  /** copy this scene's framing to every scene in the project */
  onApplyFramingToAll?: (framing: Partial<Scene>) => void;
  /** insert a brand new scene at the given index in the running order */
  onInsertSceneAt?: (position: number) => void;
  /** nudge this scene earlier (-1) or later (+1) in the running order */
  onReorderScene?: (sceneId: number, direction: -1 | 1) => void;
}

export default function SceneEditor({
  scene,
  index,
  totalScenes = 1,
  aspectRatio = "16:9",
  targetDuration = 20,
  onUpdateTargetDuration,
  onUpdate,
  videoFilter = null,
  onImageSearch,
  onDelete,
  onApplyFramingToAll,
  onInsertSceneAt,
  onReorderScene,
}: SceneEditorProps) {
  const [textValue, setTextValue] = useState(scene.text);
  /**
   * Image search topic. There is no separate box for this any more — it is
   * derived from the scene script (the single editable text field).
   *
   * The topic is extracted by ranking the WHOLE scene with names and places
   * weighted highest (see src/lib/topic-extract.ts), rather than by taking the
   * opening words, which are usually connectives and returned the wrong photo.
   */
  const deriveImageQuery = (text: string, stored?: string): string =>
    buildSceneImageQuery(text, { stored, fallback: "abstract background" });
  const [searching, setSearching] = useState(false);
  /** Photos from the last research, shown in the block above the scene card. */
  const [candidates, setCandidates] = useState<ImageCandidate[]>([]);
  const [researching, setResearching] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  /** True when this scene shows a flat colour and no photo or clip. */
  const isBlank = sceneIsBlankColor(scene);
  const [isPlayingAttachedAudio, setIsPlayingAttachedAudio] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showNatureMenu, setShowNatureMenu] = useState(false);
  // Shuffle the curated deck on every open so the fallback gallery doesn't
  // look like the same frozen nine images each time it is opened.
  const [natureDeck, setNatureDeck] = useState(() => [...NATURE_FALLBACKS]);
  const openNatureMenu = () => {
    setNatureDeck(pickRandomSample(NATURE_FALLBACKS, NATURE_FALLBACKS.length));
    setShowNatureMenu(true);
  };
  const [showCropTools, setShowCropTools] = useState(false);
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [showGuides, setShowGuides] = useState(false);
  const [cropMode, setCropMode] = useState(false);

  /**
   * The preview is sized from the real frame shape so the card is never taller
   * or wider than the video it shows. Portrait gets a narrower column and a
   * shorter cap, because a 9:16 preview at the landscape width would make a
   * single scene card taller than the whole workspace.
   */
  const viewport = useViewport();

  /**
   * On a phone the card stacks, so the preview spans the card width instead of
   * sitting in a narrow side column — a 132px thumbnail on a 360px screen
   * wastes the width and is too small to judge framing on. Wide screens get a
   * slightly larger preview because the space is there.
   */
  const previewBox = viewport.isPhone
    ? fitFrameInBox(
        aspectRatio,
        // Card width less its padding; capped so portrait does not fill the screen.
        Math.min(viewport.width - 56, 420),
        aspectRatio === "9:16" ? 300 : 240
      )
    : fitFrameInBox(
        aspectRatio,
        aspectRatio === "9:16"
          ? viewport.isWide ? 150 : 132
          : aspectRatio === "1:1"
          ? viewport.isWide ? 200 : 176
          : viewport.isWide ? 268 : 232,
        aspectRatio === "9:16" ? (viewport.isWide ? 250 : 220) : viewport.isWide ? 200 : 176
      );

  /**
   * The interactive crop surface stays as large as the screen allows, because
   * that is where precise framing happens — but a fixed 250px surface plus the
   * panel's padding overflowed a 320px phone, so it is measured against the
   * viewport.
   */
  const cropSurface = fitFrameInBox(
    aspectRatio,
    viewport.isPhone
      ? Math.max(120, Math.min(viewport.width - 96, 320))
      : aspectRatio === "9:16"
      ? 150
      : viewport.isWide
      ? 300
      : 250,
    viewport.isPhone ? 320 : aspectRatio === "9:16" ? 270 : 240
  );

  const activeLook = getPreset(videoFilter?.id);
  const lookCss = getFilterCss(videoFilter);

  useEffect(() => {
    setTextValue(scene.text);
  }, [scene.text]);

  const currentSceneDuration = scene.duration || targetDuration;
  const targetWordCount = getTargetWordCount(currentSceneDuration);
  const wordsCount = countWords(textValue);
  const spokenSeconds = getSpokenDurationFromWords(textValue);

  // Set default duration if completely unset or legacy 4s
  useEffect(() => {
    if (!scene.duration || scene.duration === 4) {
      onUpdate(scene.id, { duration: targetDuration });
    }
  }, [scene.id, scene.duration, targetDuration, onUpdate]);

  const handleScriptChange = (newVal: string) => {
    setTextValue(newVal);
    onUpdate(scene.id, { text: newVal });
  };

  // Framing values — resolved through the shared engine so the editor and the
  // renderer always agree on what every setting means.
  const framing = resolveFraming(scene);
  const offsetX = framing.offsetX;
  const offsetY = framing.offsetY;
  const zoom = framing.zoom;
  const fitMode = framing.fit;
  const crop = framing.crop;
  const rotate = framing.rotate;
  const flipH = framing.flipH;
  const flipV = framing.flipV;
  const backdrop = framing.backdrop;
  const backdropBlur = framing.backdropBlur;
  const backdropZoom = framing.backdropZoom;
  const backdropDim = framing.backdropDim;
  const backdropColor = framing.backdropColor;

  /** Crop presets offered as one-click buttons */
  const CROP_SHAPES = [
    { label: "16:9", ratio: 16 / 9 },
    { label: "9:16", ratio: 9 / 16 },
    { label: "1:1", ratio: 1 },
    { label: "4:3", ratio: 4 / 3 },
    { label: "3:2", ratio: 3 / 2 },
  ];

  const normaliseAngle = (a: number) => {
    let v = Math.round(a);
    while (v > 180) v -= 360;
    while (v < -180) v += 360;
    return v;
  };

  const updateCrop = (key: "x" | "y" | "w" | "h", value: number) => {
    const next = { ...crop, [key]: value };
    // keep the window inside the photo
    next.w = Math.max(0.05, Math.min(1, next.w));
    next.h = Math.max(0.05, Math.min(1, next.h));
    next.x = Math.max(0, Math.min(1 - next.w, next.x));
    next.y = Math.max(0, Math.min(1 - next.h, next.y));
    onUpdate(scene.id, { image_crop: next });
  };

  /**
   * Crops the source photo to a target shape, keeping it centred. Works off
   * the photo's real pixel dimensions so the result is a true 16:9 (or
   * whatever) slice rather than a stretched one.
   */
  const cropToRatio = (ratio: number) => {
    const el = new Image();
    el.src = normalizeSceneImageUrl(scene.image_url || "");
    const apply = (nw: number, nh: number) => {
      const srcRatio = nw / nh;
      let w = 1;
      let h = 1;
      if (srcRatio > ratio) {
        w = ratio / srcRatio;
      } else {
        h = srcRatio / ratio;
      }
      onUpdate(scene.id, {
        image_crop: { x: (1 - w) / 2, y: (1 - h) / 2, w, h },
      });
    };
    if (el.complete && el.naturalWidth) apply(el.naturalWidth, el.naturalHeight);
    else el.onload = () => apply(el.naturalWidth, el.naturalHeight);
  };

  /** Copies this scene's framing onto every other scene in the project */
  const applyFramingToAll = () => {
    if (!onApplyFramingToAll) return;
    onApplyFramingToAll({
      image_fit: fitMode,
      image_offset_x: offsetX,
      image_offset_y: offsetY,
      image_zoom: zoom,
      image_rotate: rotate,
      image_flip_h: flipH,
      image_flip_v: flipV,
      image_backdrop: backdrop,
      image_backdrop_blur: backdropBlur,
      image_backdrop_zoom: backdropZoom,
      image_backdrop_dim: backdropDim,
      image_backdrop_color: backdropColor,
    });
  };

  // Research & Replace
  /**
   * The customer's own Pexels/Pixabay keys travel as headers plus query
   * params; both are needed because the server accepts either.
   */
  const searchOptions = () => ({
    headers: getApiKeysHeaders(),
    queryParams: getApiKeysQueryParams(),
  });

  /**
   * Replace: hand this scene a photo it has not shown before.
   *
   * This used to re-run the search and re-pick from the same pool, so it
   * could hand back the very image already on screen and look broken. Now it
   * asks for the full candidate pool and skips anything already shown.
   */
  const handleReplace = async () => {
    setSearching(true);
    setImgError(false);
    const query = deriveImageQuery(textValue, scene.image_query);
    try {
      const fresh = await replaceImage(query, searchOptions());
      if (fresh) {
        adoptImage(proxyImageUrl(fresh.url));
        onUpdate(scene.id, { image_query: query });
        // Keep an open research block in step with what the scene shows now.
        if (showCandidates) void loadCandidates(query);
        return;
      }
      // Nothing unseen came back — fall back to the standard search path.
      await onImageSearch(scene.id, query);
    } catch {
      await onImageSearch(scene.id, query);
    } finally {
      setSearching(false);
    }
  };

  /**
   * Research: fill the block above the scene card with a dozen photos.
   * Pressing it again searches again, so two presses give two different sets.
   */
  const loadCandidates = async (query?: string) => {
    setResearching(true);
    setShowCandidates(true);
    try {
      const found = await researchImages(
        query ?? deriveImageQuery(textValue, scene.image_query),
        searchOptions()
      );
      if (found.length > 0) setCandidates(found);
    } catch {
      // Keep whatever set is already on screen rather than blanking it.
    } finally {
      setResearching(false);
    }
  };

  const handleResearch = () => void loadCandidates();

  /**
   * Give this scene a plain colour instead of a photo.
   *
   * The image and clip are cleared rather than left in place: a colour that
   * only shows when the image happens to fail would be unpredictable, and the
   * renderer treats "has an image" as the priority. Choosing a photo later
   * clears the colour again (see adoptImage).
   */
  const handleChooseBlankColor = (hex: string) => {
    onUpdate(scene.id, {
      blank_color: hex,
      image_url: null,
      video_url: null,
      image_query: "",
    } as Partial<Scene>);
    setImgError(false);
  };

  const handleSelectCandidate = (candidate: ImageCandidate) => {
    adoptImage(proxyImageUrl(candidate.url));
    onUpdate(scene.id, { image_query: deriveImageQuery(textValue, scene.image_query) });
    setImgError(false);
  };

  /**
   * A freshly chosen photo starts unframed. If its shape is a long way from
   * the video frame's, the blurred fill is picked automatically so the user
   * never gets a badly cropped subject by default.
   */
  const adoptImage = (url: string) => {
    const frame = frameSizeFor(aspectRatio);
    const base: Partial<Scene> = {
      image_url: url,
      // Choosing a photo supersedes a plain colour — otherwise the two would
      // fight and the colour would silently win in the renderer.
      blank_color: null,
      image_offset_x: 0,
      image_offset_y: 0,
      image_zoom: 1.0,
      image_crop: { x: 0, y: 0, w: 1, h: 1 },
      image_rotate: 0,
      image_flip_h: false,
      image_flip_v: false,
    };
    onUpdate(scene.id, base);
    setShowColorPicker(false);
    const probe = new Image();
    probe.onload = () => {
      onUpdate(scene.id, { image_fit: suggestFit(probe, frame.w, frame.h) });
    };
    probe.src = url;
  };

  const handleSelectFromModal = (url: string) => {
    adoptImage(url);
    setShowSearchModal(false);
    setImgError(false);
  };

  const handleSelectNatureFallback = (url: string) => {
    adoptImage(url);
    setShowNatureMenu(false);
    setImgError(false);
  };

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleToggleAttachedAudio = () => {
    if (!scene.audio_url) return;
    if (isPlayingAttachedAudio) {
      // Actually stop the element — clearing the flag alone left the audio
      // playing with no way to stop it.
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        } catch {}
        audioRef.current = null;
      }
      setIsPlayingAttachedAudio(false);
      return;
    }

    // Silence any other preview so two clips never talk over each other.
    stopAllSoundPreviews();

    try {
      const audio = new Audio(scene.audio_url);
      audio.loop = false;
      audioRef.current = audio;
      setIsPlayingAttachedAudio(true);
      audio.play().catch(() => {
        setIsPlayingAttachedAudio(false);
        audioRef.current = null;
      });
      audio.onended = () => {
        setIsPlayingAttachedAudio(false);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setIsPlayingAttachedAudio(false);
        audioRef.current = null;
      };
    } catch {
      setIsPlayingAttachedAudio(false);
      audioRef.current = null;
    }
  };

  // Stop playback if the card unmounts mid-preview.
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch {}
      }
    };
  }, []);

  const setPresetPosition = (x: number, y: number) => {
    onUpdate(scene.id, { image_offset_x: x, image_offset_y: y });
  };

  const handleResetFraming = () => {
    onUpdate(scene.id, {
      image_offset_x: 0,
      image_offset_y: 0,
      image_zoom: 1.0,
      image_fit: "cover",
      image_crop: { x: 0, y: 0, w: 1, h: 1 },
      image_rotate: 0,
      image_flip_h: false,
      image_flip_v: false,
      image_backdrop: DEFAULT_FRAMING.backdrop,
      image_backdrop_blur: DEFAULT_FRAMING.backdropBlur,
      image_backdrop_zoom: DEFAULT_FRAMING.backdropZoom,
      image_backdrop_dim: DEFAULT_FRAMING.backdropDim,
    });
  };

  return (
    <div
      className="animate-slide-in bg-gray-800/60 border border-hairline rounded-xl overflow-hidden shadow-sm hover:border-hairline transition-colors"
      style={{ animationDelay: `${index * 80}ms` }}
    >

      <div className="flex flex-col lg:flex-row">
        {/* Visual Preview with Interactive Framing & Crop (reflects Aspect Ratio from Setup) */}
        <div
          className="flex-shrink-0 relative group bg-gray-950 flex flex-col items-center justify-center overflow-hidden p-1.5 w-full lg:w-auto"
          style={viewport.isPhone ? undefined : { width: previewBox.w + 12 }}
        >
          {/* Active Aspect Ratio Indicator */}
          <div className="absolute top-1 left-1 z-10 px-1.5 py-0.5 bg-gray-900/80 backdrop-blur border border-hairline rounded text-[9px] font-mono text-gray-300 pointer-events-none flex items-center gap-1">
            <span>📐</span>
            <span>{aspectRatio}</span>
          </div>

          {/* A scene showing a flat colour has no image_url, but must still get
              the real preview canvas — otherwise it fell into the "no image
              yet" empty state and the colour never appeared in any preview. */}
          {(scene.image_url && !imgError) || isBlank ? (
            <div
              className="relative overflow-hidden bg-black flex items-center justify-center rounded-md"
              style={{ width: previewBox.w, height: previewBox.h }}
            >
              {/* True-to-render thumbnail. This used to be an <img> with CSS
                  object-cover, which did not match the exported frame — the
                  canvas preview below is drawn by the render engine itself. */}
              <SceneFramePreview
                scene={scene}
                aspectRatio={aspectRatio}
                width={previewBox.w}
                videoFilter={compareOriginal ? null : videoFilter}
              />

              {/* Project-wide look badge (configured in Video Studio → Filters) */}
              {activeLook && (
                <div
                  className="absolute bottom-1 left-1 z-10 px-1.5 py-0.5 bg-gray-950/85 backdrop-blur border rounded text-[9px] font-semibold flex items-center gap-1 shadow-md max-w-[70%] truncate"
                  style={{ borderColor: `${activeLook.accent}cc`, color: activeLook.accent }}
                  title={`${activeLook.name} — applied to the whole video from Video Studio → Filters`}
                >
                  <span>{activeLook.icon}</span>
                  <span>{activeLook.name}</span>
                </div>
              )}

              {/* Quick Compare Button (Hold to see original) */}
              {activeLook && (
                <button
                  type="button"
                  onMouseDown={() => setCompareOriginal(true)}
                  onMouseUp={() => setCompareOriginal(false)}
                  onMouseLeave={() => setCompareOriginal(false)}
                  onTouchStart={() => setCompareOriginal(true)}
                  onTouchEnd={() => setCompareOriginal(false)}
                  className="absolute bottom-1 right-1 z-10 px-1.5 py-0.5 bg-gray-900/90 hover:bg-gray-800 text-gray-300 border border-hairline rounded text-[9px] font-medium transition-colors shadow-sm select-none"
                  title="Hold to see original unfiltered image"
                >
                  {compareOriginal ? "Showing Original" : "Hold: Original"}
                </button>
              )}

              {/* Hover quick action overlay */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 z-[2]">
                <button
                  type="button"
                  onClick={() => setShowCropTools((prev) => !prev)}
                  className="px-2 py-1 bg-white/20 hover:bg-white/30 backdrop-blur rounded-lg text-white text-[11px] transition-colors flex items-center gap-1"
                  title="Crop and reposition image"
                >
                  ✂️ Crop & Fit
                </button>
                <button
                  type="button"
                  onClick={handleResearch}
                  className="px-2 py-1 bg-indigo-600/80 hover:bg-indigo-600 backdrop-blur rounded-lg text-white text-[11px] transition-colors flex items-center gap-1"
                  title="Show photos for this scene to choose from"
                >
                  🔍 Research
                </button>
              </div>
            </div>
          ) : (
            <div
              className="bg-gray-900/90 flex flex-col items-center justify-center rounded-md p-2 text-center gap-1.5"
              style={{ width: previewBox.w, height: previewBox.h }}
            >
              {imgError && <p className="text-xs text-red-400">Image failed to load</p>}
              <button
                type="button"
                onClick={handleReplace}
                disabled={searching}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 rounded-lg text-white text-xs font-medium transition-colors flex items-center gap-2"
              >
                {searching ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Searching...
                  </>
                ) : (
                  <>🔍 Find Image</>
                )}
              </button>

              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleResearch}
                  className="text-indigo-400 hover:text-indigo-300 underline"
                >
                  Research (12)
                </button>
                <span className="text-gray-600">•</span>
                <button
                  type="button"
                  onClick={openNatureMenu}
                  className="text-emerald-400 hover:text-emerald-300 underline"
                >
                  Nature Fallback
                </button>
                {/* A blank-colour scene is precisely the "no image" case, so the
                    option has to be reachable from the empty state too — it was
                    previously only in the toolbar shown once an image exists. */}
                <span className="text-gray-600">•</span>
                <button
                  type="button"
                  onClick={() => setShowColorPicker(true)}
                  className="text-sky-400 hover:text-sky-300 underline"
                >
                  Plain colour
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Content & Dedicated Scene / Image Settings Section */}
        <div className="flex-1 min-w-0 p-2.5 space-y-2">
          {/* Header Row: Scene Number + Dialogue Voice + Duration + Delete */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-hairline pb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                <span>Scene {index + 1}</span>
                {totalScenes !== undefined && (
                  <>
                    <span className="text-gray-500 font-normal lowercase text-[11px]">of</span>
                    <span className="px-1.5 py-0.2 rounded bg-indigo-950/90 border border-indigo-700/60 text-indigo-300 font-mono text-[11px] normal-case">
                      {totalScenes} {totalScenes === 1 ? "scene" : "scenes"}
                    </span>
                  </>
                )}
              </span>
              {scene.is_inserted && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-700/60 font-medium">
                  Inserted
                </span>
              )}
              {scene.speaker_name && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 font-medium">
                  {scene.speaker_name}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Attached Voice Track Badge (From Voiceover Studio) */}
              {scene.audio_url && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/90 border border-emerald-600/80 text-emerald-300 text-xs font-medium animate-fade-in shadow-sm">
                  <span>🎙️</span>
                  <span className="truncate max-w-[140px]" title={scene.audio_name || "Saved Voiceover"}>
                    {scene.audio_name || "Voiceover Saved"}
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleAttachedAudio}
                    className="hover:text-white px-1 font-bold text-xs"
                    title="Play attached audio track"
                  >
                    {isPlayingAttachedAudio ? "⏹" : "▶"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdate(scene.id, { audio_url: null, audio_name: null })}
                    className="text-gray-400 hover:text-red-400 px-0.5 text-xs font-bold"
                    title="Clear saved audio track"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Scene Duration Badge (configured in Setup) */}
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-950/80 border border-indigo-700/80 rounded-lg text-xs"
                title={`Scene duration: ${currentSceneDuration}s`}
              >
                <span className="text-indigo-400">⏱️</span>
                <span className="text-white font-mono font-bold">
                  {currentSceneDuration}s
                </span>
              </div>

              {/* Move this scene earlier / later in the running order */}
              {onReorderScene && totalScenes > 1 && (
                <div className="flex items-center rounded-lg border border-hairline overflow-hidden">
                  <button
                    type="button"
                    onClick={() => onReorderScene(scene.id, -1)}
                    disabled={index === 0}
                    className="px-1.5 py-1 text-xs text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    title="Move this scene earlier"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => onReorderScene(scene.id, 1)}
                    disabled={index === totalScenes - 1}
                    className="px-1.5 py-1 text-xs text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors border-l border-hairline"
                    title="Move this scene later"
                  >
                    ↓
                  </button>
                </div>
              )}

              {/* Delete Scene Button */}
              {onDelete && totalScenes > 1 && (
                <button
                  type="button"
                  onClick={() => onDelete(scene.id)}
                  className="p-1 text-gray-400 hover:text-red-400 hover:bg-red-950/40 rounded transition-colors"
                  title={`Delete scene ${index + 1}`}
                >
                  🗑️
                </button>
              )}
            </div>
          </div>

          {/* Typable Scene Script Section */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor={`scene-script-${scene.id}`} className="font-semibold text-gray-200 flex items-center gap-1.5">
                <span>📝</span>
                <span>Scene Script & Narration</span>
              </label>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-mono ${wordsCount < Math.floor(targetWordCount * 0.88) ? "text-amber-400 font-semibold" : "text-gray-400"}`}>
                  {wordsCount} words • ~{formatDuration(spokenSeconds)} read
                </span>
                {wordsCount < Math.floor(targetWordCount * 0.88) && (
                  <button
                    type="button"
                    onClick={() => {
                      const expanded = calibrateTextToTargetDuration(textValue, currentSceneDuration);
                      setTextValue(expanded);
                      handleScriptChange(expanded);
                    }}
                    className="px-2 py-0.5 bg-amber-950/90 hover:bg-amber-900 border border-amber-500/70 text-amber-200 rounded text-[10px] font-medium transition-colors flex items-center gap-1 shadow-sm"
                    title={`Expand scene to ~${targetWordCount} words to fit ${formatDuration(currentSceneDuration)} duration`}
                  >
                    <span>⚡ Calibrate to {formatDuration(currentSceneDuration)} (~{targetWordCount}w)</span>
                  </button>
                )}
              </div>
            </div>

            <textarea
              id={`scene-script-${scene.id}`}
              value={textValue}
              onChange={(e) => handleScriptChange(e.target.value)}
              rows={2}
              placeholder="Enter the narration script for this scene..."
              className="w-full px-3 py-2 bg-gray-900/90 border border-hairline hover:border-hairline focus:border-indigo-500 rounded-xl text-white text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y transition-colors font-sans shadow-inner"
            />
          </div>

          {/* Short video clip for this scene (optional, replaces the still) */}
          <SceneClipPanel
            scene={scene}
            narrationDuration={sceneDurationForText(textValue, targetDuration)}
            onUpdate={onUpdate}
          />

          {/* Image Settings Toolbar: Researching, Nature Fallback, Crop & Fit, Filters */}
        </div>
      </div>
      {/* Per-scene controls.
          These used to live inside the right-hand column, so every button
          started at the script's left edge and the row stopped a third of
          the way across the card. They now form one bar spanning the full
          card width, which is what "all the buttons at the bottom" should
          look like, and gives the row room so nothing wraps on a laptop. */}
      <div className="border-t border-hairline px-2.5 pb-2.5 pt-2.5">
      <div className="space-y-1.5">
        {/* The small image-topic box was removed: the scene script above is
            the one place text is edited, and the image search now derives
            its topic from that script automatically. */}
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          {/* Research Action Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={handleReplace}
              disabled={searching}
              className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 rounded-lg text-white text-xs font-medium transition-colors whitespace-nowrap"
              title="Replace with another photo — never the one already shown"
            >
              {searching ? "…" : "🔁 Replace"}
            </button>

            {/* Research toggles its drawer open and shut, with the same ▼ cue
                and behaviour as Nature Fallback beside it. */}
            <button
              type="button"
              onClick={() => (showCandidates ? setShowCandidates(false) : handleResearch())}
              disabled={researching && !showCandidates}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap flex items-center gap-1 ${
                showCandidates
                  ? "bg-indigo-950/70 border-indigo-600 text-indigo-200"
                  : "bg-gray-700 hover:bg-gray-600 border-hairline text-white"
              }`}
              title="Show photos for this scene to choose from"
            >
              <span>🖼️ Research</span>
              <span className="text-[10px]">{showCandidates ? "▲" : "▼"}</span>
            </button>

            {/* Nature Fallback Button */}
            <button
              type="button"
              onClick={() => (showNatureMenu ? setShowNatureMenu(false) : openNatureMenu())}
              className="px-2.5 py-1.5 bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1"
              title="Select high-definition verified nature fallback background — reshuffled on every open"
            >
              <span>🌿 Nature Fallback</span>
              <span className="text-[10px]">{showNatureMenu ? "▲" : "▼"}</span>
            </button>

            {/* Image Edit & Crop Toggle */}
            <button
              type="button"
              onClick={() => setShowCropTools((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap flex items-center gap-1 ${
                showCropTools || (offsetX !== 0 || offsetY !== 0 || zoom !== 1.0)
                  ? "bg-amber-950/70 border-amber-600 text-amber-300"
                  : "bg-gray-700 hover:bg-gray-600 border-hairline text-gray-200"
              }`}
              title="Crop, pan, and move around until it fits"
            >
              <span>✂️ Crop & Move</span>
              <span className="text-[10px]">{showCropTools ? "▲" : "▼"}</span>
            </button>

            {/* Blank colour backdrop — the last option, for a scene that
                wants no photo or clip at all. */}
            <button
              type="button"
              onClick={() => setShowColorPicker((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap flex items-center gap-1 ${
                isBlank
                  ? "bg-sky-950/70 border-sky-500 text-sky-200"
                  : "bg-gray-700 hover:bg-gray-600 border-hairline text-gray-200"
              }`}
              title="Use a plain colour behind this scene instead of a photo"
            >
              <span
                className="w-3 h-3 rounded-sm border border-white/30 shrink-0"
                style={{ background: isBlank ? scene.blank_color || "#101828" : "transparent" }}
              />
              <span>Colour</span>
              <span className="text-[10px]">{showColorPicker ? "▲" : "▼"}</span>
            </button>
          </div>
        </div>

        {/* BLANK COLOUR PICKER */}
        {showColorPicker && (
          <div className="bg-gray-900/90 border border-sky-800/60 rounded-xl p-3 space-y-2.5 animate-fade-in text-xs">
            <div className="flex items-center justify-between border-b border-sky-900/60 pb-1.5">
              <span className="font-semibold text-sky-300 flex items-center gap-1.5">
                <span>🎨</span>
                <span>Plain colour backdrop</span>
              </span>
              {isBlank && (
                <button
                  type="button"
                  onClick={() => {
                    onUpdate(scene.id, { blank_color: null });
                    setShowColorPicker(false);
                  }}
                  className="text-[11px] text-rose-300 hover:text-rose-200 underline"
                >
                  Remove colour
                </button>
              )}
            </div>

            <div className="grid grid-cols-6 xs:grid-cols-8 sm:grid-cols-10 gap-1.5">
              {BLANK_COLORS.map((c) => {
                const active = (scene.blank_color || "").toLowerCase() === c.hex.toLowerCase();
                return (
                  <button
                    key={c.hex}
                    type="button"
                    title={c.name}
                    onClick={() => handleChooseBlankColor(c.hex)}
                    style={{ background: c.hex }}
                    className={`aspect-square rounded-md border transition-transform hover:scale-110 ${
                      active ? "border-sky-400 ring-2 ring-sky-500" : "border-white/20"
                    }`}
                  />
                );
              })}
            </div>

            <label className="flex items-center gap-2 pt-1">
              <span className="text-gray-400 shrink-0">Custom colour</span>
              <input
                type="color"
                value={scene.blank_color || "#101828"}
                onChange={(e) => handleChooseBlankColor(e.target.value)}
                className="w-10 h-7 rounded cursor-pointer bg-transparent border border-hairline"
              />
              <span className="text-gray-500 font-mono text-[11px]">
                {(scene.blank_color || "#101828").toUpperCase()}
              </span>
            </label>

            <p className="text-[11px] text-gray-500">
              Replaces this scene's photo and clip. The colour is rendered into
              the exported video exactly as shown.
            </p>
          </div>
        )}

        {/* NATURE FALLBACK QUICK SELECTION DRAWER */}
        {showNatureMenu && (
          <div className="bg-gray-900/90 border border-emerald-800/60 rounded-xl p-3 space-y-2 animate-fade-in text-xs">
            <div className="flex items-center justify-between border-b border-emerald-900/60 pb-1.5">
              <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                <span>🌿</span>
                <span>High Definition Nature Fallback Library</span>
              </span>
              <button
                type="button"
                onClick={() => setShowNatureMenu(false)}
                className="text-gray-400 hover:text-white text-xs px-1"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {natureDeck.map((bg) => (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => handleSelectNatureFallback(bg.url)}
                  className="group relative rounded-lg overflow-hidden border border-hairline hover:border-emerald-500 transition-all text-left aspect-video"
                >
                  <img
                    src={bg.thumb}
                    alt={bg.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-1.5">
                    <span className="text-[10px] text-white font-medium truncate">
                      {bg.name}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* IMAGE EDITING: CROP, MOVE, SIZE, ROTATE, FIT — all in one place.
            The preview here is drawn by the same engine as the exported
            video, so nothing is ever squashed and the blurred fill shows
            exactly as it will render. */}
        {showCropTools && (
          <div className="bg-gray-900/95 border border-amber-800/50 rounded-xl p-3 space-y-3 animate-fade-in text-xs">
            <div className="flex items-center justify-between border-b border-hairline pb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-amber-400 font-semibold">✂️ Crop, Move & Fit</span>
                <span className="text-[11px] text-gray-400">
                  Drag the preview to move, scroll to zoom — the image keeps its shape
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowGuides((g) => !g)}
                  className={`text-[11px] px-2 py-0.5 rounded border ${
                    showGuides
                      ? "bg-indigo-950 border-indigo-600 text-indigo-300"
                      : "bg-gray-800 border-hairline text-gray-400"
                  }`}
                  title="Rule-of-thirds grid and safe area"
                >
                  # Guides
                </button>
                <button
                  type="button"
                  onClick={handleResetFraming}
                  className="text-[11px] text-gray-400 hover:text-white underline"
                >
                  Reset Frame
                </button>
                <button
                  type="button"
                  onClick={() => setShowCropTools(false)}
                  className="text-gray-400 hover:text-white px-1"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-3">
              {/* Live, true-to-render preview */}
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <SceneFramePreview
                  scene={scene}
                  aspectRatio={aspectRatio}
                  width={cropSurface.w}
                  videoFilter={videoFilter}
                  interactive
                  cropMode={cropMode}
                  showGuides={showGuides}
                  onChange={(u) => onUpdate(scene.id, u)}
                />
                <span
                  className="text-[10px] text-gray-500 text-center"
                  style={{ maxWidth: cropSurface.w }}
                >
                  Exactly how this scene will render at {aspectRatio}
                </span>
              </div>

              <div className="flex-1 space-y-3">
                {/* ---- Fit mode: the fix for squashed / cut-off images ---- */}
                <div className="space-y-1.5">
                  <span className="text-gray-400 text-[11px]">How the image fills the frame:</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {FIT_MODES.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        title={m.blurb}
                        onClick={() =>
                          onUpdate(scene.id, {
                            image_fit: m.id,
                            // "Blurred Fill" promises blurred bars, so it carries its own backdrop
                            ...(m.id === "blur_fill" ? { image_backdrop: "blur" as const } : {}),
                          })
                        }
                        className={`px-2 py-1.5 rounded-lg border text-[11px] font-medium transition-colors flex flex-col items-center gap-0.5 ${
                          fitMode === m.id
                            ? "bg-amber-950 border-amber-600 text-amber-300"
                            : "bg-gray-800 border-hairline text-gray-400 hover:border-hairline"
                        }`}
                      >
                        <span className="text-sm leading-none">{m.icon}</span>
                        <span>{m.name}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-500 leading-snug">
                    {FIT_MODES.find((m) => m.id === fitMode)?.blurb}
                  </p>
                </div>

                {/* ---- Blurred / letterbox backdrop settings ---- */}
                {fitMode !== "cover" && (
                  <div className="bg-gray-950/60 border border-hairline rounded-lg p-2.5 space-y-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-gray-400 text-[11px]">Bars filled with:</span>
                      {BACKDROP_STYLES.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => onUpdate(scene.id, { image_backdrop: b.id })}
                          className={`px-2 py-1 rounded text-[11px] font-medium border ${
                            backdrop === b.id
                              ? "bg-amber-950 border-amber-600 text-amber-300"
                              : "bg-gray-800 border-hairline text-gray-400"
                          }`}
                        >
                          {b.icon} {b.name}
                        </button>
                      ))}
                      {backdrop === "transparent" && (
                        <span className="text-[10px] text-gray-500 basis-full leading-snug">
                          The bars stay clear — whatever sits behind the photo shows through instead of a fill.
                        </span>
                      )}
                      {backdrop === "colour" && (
                        <input
                          type="color"
                          value={backdropColor}
                          onChange={(e) => onUpdate(scene.id, { image_backdrop_color: e.target.value })}
                          className="w-8 h-6 rounded border border-hairline bg-transparent cursor-pointer"
                        />
                      )}
                    </div>

                    {backdrop === "blur" && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <div className="flex justify-between text-gray-300 mb-0.5">
                            <span>Blur amount:</span>
                            <span className="font-mono text-amber-300">{Math.round(backdropBlur)}px</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={120}
                            step={2}
                            value={backdropBlur}
                            onChange={(e) => onUpdate(scene.id, { image_backdrop_blur: parseInt(e.target.value) })}
                            className="w-full accent-amber-500 cursor-pointer"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-gray-300 mb-0.5">
                            <span>Backdrop zoom:</span>
                            <span className="font-mono text-amber-300">{backdropZoom.toFixed(2)}x</span>
                          </div>
                          <input
                            type="range"
                            min={1}
                            max={2.5}
                            step={0.05}
                            value={backdropZoom}
                            onChange={(e) => onUpdate(scene.id, { image_backdrop_zoom: parseFloat(e.target.value) })}
                            className="w-full accent-amber-500 cursor-pointer"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-gray-300 mb-0.5">
                            <span>Darken backdrop:</span>
                            <span className="font-mono text-amber-300">{Math.round(backdropDim * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={0.9}
                            step={0.05}
                            value={backdropDim}
                            onChange={(e) => onUpdate(scene.id, { image_backdrop_dim: parseFloat(e.target.value) })}
                            className="w-full accent-amber-500 cursor-pointer"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ---- Move & size ---- */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <div className="flex justify-between text-gray-300 mb-1">
                      <span>Move left / right:</span>
                      <span className="font-mono text-amber-300">{offsetX}%</span>
                    </div>
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      step={1}
                      value={offsetX}
                      onChange={(e) => onUpdate(scene.id, { image_offset_x: parseInt(e.target.value) })}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-gray-300 mb-1">
                      <span>Move up / down:</span>
                      <span className="font-mono text-amber-300">{offsetY}%</span>
                    </div>
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      step={1}
                      value={offsetY}
                      onChange={(e) => onUpdate(scene.id, { image_offset_y: parseInt(e.target.value) })}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-gray-300 mb-1">
                      <span>Size / zoom:</span>
                      <span className="font-mono text-amber-300">{zoom.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.25}
                      max={4}
                      step={0.05}
                      value={zoom}
                      onChange={(e) => onUpdate(scene.id, { image_zoom: parseFloat(e.target.value) })}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* ---- Crop rectangle ---- */}
                <div className="bg-gray-950/60 border border-hairline rounded-lg p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-[11px]">
                      Crop — trim the edges off the source photo
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCropMode((c) => !c)}
                        className={`px-2 py-0.5 rounded text-[11px] border ${
                          cropMode
                            ? "bg-amber-950 border-amber-600 text-amber-300"
                            : "bg-gray-800 border-hairline text-gray-400"
                        }`}
                        title="Drag the preview to move the crop window instead of the image"
                      >
                        {cropMode ? "Dragging crop" : "Drag crop"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdate(scene.id, { image_crop: { x: 0, y: 0, w: 1, h: 1 } })}
                        className="text-[11px] text-gray-400 hover:text-white underline"
                      >
                        Clear crop
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {([
                      ["w", "Width", crop.w],
                      ["h", "Height", crop.h],
                      ["x", "Left edge", crop.x],
                      ["y", "Top edge", crop.y],
                    ] as const).map(([key, label, val]) => (
                      <div key={key}>
                        <div className="flex justify-between text-gray-300 mb-0.5">
                          <span>{label}:</span>
                          <span className="font-mono text-amber-300">{Math.round(val * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={key === "w" || key === "h" ? 0.05 : 0}
                          max={1}
                          step={0.01}
                          value={val}
                          onChange={(e) => updateCrop(key, parseFloat(e.target.value))}
                          className="w-full accent-amber-500 cursor-pointer"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-gray-400 text-[11px]">Crop to shape:</span>
                    {CROP_SHAPES.map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        onClick={() => cropToRatio(c.ratio)}
                        className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 rounded border border-hairline text-gray-300 text-[11px]"
                        title={`Crop the photo to ${c.label}`}
                      >
                        {c.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => cropToRatio(frameSizeFor(aspectRatio).w / frameSizeFor(aspectRatio).h)}
                      className="px-2 py-0.5 bg-indigo-950 hover:bg-indigo-900 rounded border border-indigo-700 text-indigo-300 text-[11px]"
                    >
                      Match frame ({aspectRatio})
                    </button>
                  </div>
                </div>

                {/* ---- Rotate, flip, alignment ---- */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-hairline">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-gray-400 text-[11px]">Align:</span>
                    {([
                      ["⬆ Top", 0, -25],
                      ["⏺ Centre", 0, 0],
                      ["⬇ Bottom", 0, 25],
                      ["⬅ Left", -25, 0],
                      ["➡ Right", 25, 0],
                    ] as const).map(([label, px, py]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setPresetPosition(px, py)}
                        className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded border border-hairline text-gray-300 text-[11px]"
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-gray-400 text-[11px]">Rotate:</span>
                    <button
                      type="button"
                      onClick={() => onUpdate(scene.id, { image_rotate: normaliseAngle(rotate - 90) })}
                      className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded border border-hairline text-gray-300 text-[11px]"
                    >
                      ↺ 90°
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdate(scene.id, { image_rotate: normaliseAngle(rotate + 90) })}
                      className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded border border-hairline text-gray-300 text-[11px]"
                    >
                      ↻ 90°
                    </button>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      step={1}
                      value={rotate}
                      onChange={(e) => onUpdate(scene.id, { image_rotate: parseInt(e.target.value) })}
                      className="w-24 accent-amber-500 cursor-pointer"
                      title="Fine rotation"
                    />
                    <span className="font-mono text-amber-300 w-10 text-right">{rotate}°</span>
                    <button
                      type="button"
                      onClick={() => onUpdate(scene.id, { image_flip_h: !flipH })}
                      className={`px-2 py-1 rounded border text-[11px] ${
                        flipH ? "bg-amber-950 border-amber-600 text-amber-300" : "bg-gray-800 border-hairline text-gray-300"
                      }`}
                    >
                      ⇋ Flip
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdate(scene.id, { image_flip_v: !flipV })}
                      className={`px-2 py-1 rounded border text-[11px] ${
                        flipV ? "bg-amber-950 border-amber-600 text-amber-300" : "bg-gray-800 border-hairline text-gray-300"
                      }`}
                    >
                      ⇅ Flip
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={applyFramingToAll}
                  className="w-full px-2 py-1.5 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/70 rounded-lg text-indigo-200 text-[11px] font-medium transition-colors"
                  title="Copy this scene's fit, backdrop, zoom and position to every other scene"
                >
                  Apply this framing to all scenes
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Research results open at the BOTTOM of the scene block, matching the
            Nature Fallback drawer: the button toggles them with the same ▼ cue,
            and they appear below the scene rather than pushing the card down
            from above. */}
        {showCandidates && (
          <div className="mt-2.5">
            <ImageCandidateStrip
              candidates={candidates}
              loading={researching}
              currentUrl={scene.image_url ?? undefined}
              onSelect={handleSelectCandidate}
              onMore={() => void loadCandidates()}
              onClose={() => setShowCandidates(false)}
            />
          </div>
        )}
      </div>
      </div>

      {/* Insert a brand new scene directly after this one. Placing a scene at a
          chosen position is what the top "Add Scene" button could not do. */}
      {onInsertSceneAt && (
        <div className="group/ins relative h-2.5 hover:h-7 transition-all duration-150">
          <button
            type="button"
            onClick={() => onInsertSceneAt(index + 1)}
            className="absolute inset-x-2 inset-y-0 flex items-center justify-center rounded opacity-0 group-hover/ins:opacity-100 transition-opacity text-[10px] text-emerald-300 hover:bg-emerald-950/40 border border-dashed border-transparent hover:border-emerald-700"
            title={`Insert a new scene after scene ${index + 1}`}
          >
            ➕ Insert a scene here
          </button>
        </div>
      )}

      {/* 10-result Research Modal */}
      {showSearchModal && (
        <ImageSearchModal
          initialQuery={deriveImageQuery(textValue, scene.image_query)}
          onSelect={handleSelectFromModal}
          onClose={() => setShowSearchModal(false)}
        />
      )}
    </div>
  );
}
