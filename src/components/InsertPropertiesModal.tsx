import { useState, useRef, useEffect } from "react";
import { TimelineInsert, AspectRatioType } from "../types";
import StickerPreviewCanvas from "./StickerPreviewCanvas";
import TemplatePreviewCanvas from "./TemplatePreviewCanvas";
import {
  TEXT_TEMPLATES,
  TEMPLATE_BY_ID,
  TEMPLATE_MOTIONS,
  STYLE_CONTROLS,
  BORDER_MODES,
  PLATE_SHAPES,
  resolveTemplateId,
  resolveTemplateStyle,
  type TextTemplateStyle,
} from "../data/text-templates";
import { CAPTION_FONTS } from "../data/caption-styles";
import { MOTION_PRESETS, MOTION_PRESETS_BY_ID } from "../lib/overlay-motion";
import { STICKER_LIBRARY } from "../lib/sticker-3d";
import {
  SOUND_LIBRARY,
  toggleSoundPreview,
  stopAllSoundPreviews,
  setSoundPreviewVolume,
  isSoundPreviewPlaying,
} from "../data/media-library";
import {
  CTA_PLATFORMS,
  CTA_GROUPS,
  resolveCtaPlatform,
  type CtaShape,
  type CtaStyle,
} from "../data/cta-library";
import CtaBadgePreview from "./CtaBadgePreview";

interface InsertPropertiesModalProps {
  insert: TimelineInsert | null;
  isOpen?: boolean;
  totalDuration?: number;
  onUpdate: (updated: TimelineInsert) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  /** Preview canvas shape, so the live CTA preview matches the finished video */
  aspectRatio?: AspectRatioType;
  /** Still from the scene the element sits on, used as the preview backdrop */
  backgroundImage?: string;
}

export default function InsertPropertiesModal({
  insert,
  isOpen = true,
  totalDuration = 60,
  onUpdate,
  onDelete,
  onClose,
  aspectRatio,
  backgroundImage,
}: InsertPropertiesModalProps) {
  if (!isOpen || !insert) return null;

  return (
    <InsertPropertiesContent
      key={insert.id}
      insert={insert}
      totalDuration={totalDuration}
      onUpdate={onUpdate}
      onDelete={onDelete}
      onClose={onClose}
      aspectRatio={aspectRatio}
      backgroundImage={backgroundImage}
    />
  );
}

const INTRO_PRESETS = [
  {
    id: "intro_cinematic_gold",
    name: "3D Golden Lens Flare Shockwave",
    videoUrl: "/videos/intros/intro_cinematic_gold.mp4",
    tensionStyle: "flare" as const,
    soundUrl: "/sounds/cinematic_boom.wav",
    icon: "👑",
    desc: "Epic golden burst with expanding shockwave ring and particle drift",
  },
  {
    id: "intro_action_countdown",
    name: "Action 3-2-1 Tension Countdown",
    videoUrl: "/videos/intros/intro_action_countdown.mp4",
    tensionStyle: "countdown" as const,
    soundUrl: "/sounds/dramatic_chord.ogg",
    icon: "⏱️",
    desc: "Mechanical precision tick countdown with high tension pacing",
  },
  {
    id: "intro_cyber_glitch",
    name: "Cyber Matrix & Digital Glitch",
    videoUrl: "/videos/intros/intro_cyber_glitch.mp4",
    tensionStyle: "glitch" as const,
    soundUrl: "/sounds/retro_fx.mp3",
    icon: "⚡",
    desc: "Futuristic neon scanlines with chromatic RGB pulse glitch",
  },
  {
    id: "intro_cosmic_warp",
    name: "Cosmic Nebula Warp Speed",
    videoUrl: "/videos/intros/intro_cosmic_warp.mp4",
    tensionStyle: "warp" as const,
    soundUrl: "/sounds/whoosh_appear.wav",
    icon: "🌌",
    desc: "Hyperspace deep cosmic particle acceleration tunnel",
  },
  {
    id: "intro_minimalist_aperture",
    name: "Studio Camera Aperture Blades",
    videoUrl: "/videos/intros/intro_minimalist_aperture.mp4",
    tensionStyle: "aperture" as const,
    soundUrl: "/sounds/shutter_click.ogg",
    icon: "📷",
    desc: "Geometric mechanical camera shutter opening to brand focus",
  },
];

const OUTRO_PRESETS = [
  {
    id: "outro_youtube_subscribe",
    name: "YouTube End-Screen & Subscribe Hub",
    videoUrl: "/videos/outros/outro_youtube_subscribe.mp4",
    soundUrl: "/sounds/achievement_bell.wav",
    icon: "📺",
    desc: "Interactive end-slate with 2 'Watch Next' boxes & Subscribe ring",
  },
  {
    id: "outro_cinematic_sunset",
    name: "Cinematic Sunset & Social Hub",
    videoUrl: "/videos/outros/outro_cinematic_sunset.mp4",
    soundUrl: "/sounds/gentle_reflection.mp3",
    icon: "🌅",
    desc: "Warm twilight bokeh background with social handles showcase",
  },
  {
    id: "outro_cyber_matrix",
    name: "Cyber Grid & Next Video Teaser",
    videoUrl: "/videos/outros/outro_cyber_matrix.mp4",
    soundUrl: "/sounds/retro_fx.mp3",
    icon: "⚡",
    desc: "Glowing sci-fi cyber matrix grid with video cards",
  },
  {
    id: "outro_gold_farewell",
    name: "Golden Shimmer & Thank You Card",
    videoUrl: "/videos/outros/outro_gold_farewell.mp4",
    soundUrl: "/sounds/achievement_bell.wav",
    icon: "👑",
    desc: "Opulent golden curtain with glittering farewell particles",
  },
  {
    id: "outro_minimal_clean",
    name: "Modern Minimal Slate & Brand Hub",
    videoUrl: "/videos/outros/outro_minimal_clean.mp4",
    soundUrl: "/sounds/whoosh_appear.wav",
    icon: "🎯",
    desc: "Sleek dark gradient slate with crisp logo & follow banner",
  },
];

function InsertPropertiesContent({
  insert,
  totalDuration,
  onUpdate,
  onDelete,
  onClose,
  aspectRatio,
  backgroundImage,
}: {
  insert: TimelineInsert;
  totalDuration: number;
  onUpdate: (updated: TimelineInsert) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  aspectRatio?: AspectRatioType;
  backgroundImage?: string;
}) {
  const isIntroOutro = insert.category === "intro" || insert.category === "outro";
  const isAudioVisualizer =
    insert.category === "audio_visualizers" ||
    insert.category === "speech_reactive" ||
    insert.category === "meditation" ||
    insert.type.includes("wave") ||
    insert.type.includes("bars") ||
    insert.type.includes("spectrum");

  const isSoundEffect = insert.category === "sound_effects" || insert.category === "background_music";
  const isBackgroundMusic = insert.category === "background_music";
  const isContentCard =
    insert.category === "content_cards" ||
    insert.category === "other_cards" ||
    insert.category === "text_templates" ||
    insert.category === "lower_thirds";
  const isCallToAction = insert.category === "call_to_action";
  const isSticker = insert.category === "stickers";
  const isScriptureTemplate = insert.type === "template_scripture" || insert.type.includes("scripture");

  // Initial tab selection based on element type
  const defaultTab = isIntroOutro
    ? "intro_fx"
    : isCallToAction
    ? "cta_platform"
    : isSoundEffect
    ? "audio"
    : isAudioVisualizer
    ? "visuals"
    : isContentCard
    ? "content"
    : "visuals";

  const logoFileInputRef = useRef<HTMLInputElement | null>(null);

  const formatTime = (secs: number) => {
    const s = Math.max(0, Math.round(secs || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  const [data, setData] = useState<TimelineInsert>({
    ...insert,
    audioSource: insert.audioSource || (isAudioVisualizer ? "voice" : "all"),
    visualOptions: {
      has3DLook: insert.visualOptions?.has3DLook ?? true,
      primaryColor: insert.visualOptions?.primaryColor || "#38BDF8",
      secondaryColor: insert.visualOptions?.secondaryColor || "#F43F5E",
      shadowIntensity: insert.visualOptions?.shadowIntensity ?? 0.8,
      rotation: insert.visualOptions?.rotation ?? 0,
      ...insert.visualOptions,
    },
    audioSettings: {
      soundUrl: insert.audioSettings?.soundUrl,
      soundName: insert.audioSettings?.soundName,
      volume: insert.audioSettings?.volume ?? 0.8,
      muted: insert.audioSettings?.muted ?? false,
      // Background music loops through the whole video by default
      loop: insert.audioSettings?.loop ?? insert.category === "background_music",
      delay: insert.audioSettings?.delay ?? 0,
      ...insert.audioSettings,
    },
    content: insert.content ? { ...insert.content } : {},
  });

  const originalRef = useRef<TimelineInsert | null>(null);
  if (originalRef.current === null) originalRef.current = insert;

  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [ctaGroup, setCtaGroup] = useState<string>("all");
  const [ctaSearch, setCtaSearch] = useState("");

  const activePlatform = resolveCtaPlatform(data.type, data.visualOptions?.platform);

  const updateVisual = (patch: Record<string, any>) => {
    setData((prev) => ({
      ...prev,
      visualOptions: { ...prev.visualOptions, ...patch },
    }));
  };

  /** Apply a whole platform badge (colours, wording, mark, sound) in one click */
  const applyPlatform = (platformId: string) => {
    const platform = CTA_PLATFORMS.find((p) => p.id === platformId);
    if (!platform) return;
    setData((prev) => ({
      ...prev,
      type: `cta_${platform.id}`,
      title: platform.name,
      visualOptions: {
        ...prev.visualOptions,
        platform: platform.id,
        primaryColor: platform.primaryColor,
        secondaryColor: platform.secondaryColor,
        ctaShape: platform.shape || prev.visualOptions?.ctaShape || "pill",
        ctaStyle: platform.style || prev.visualOptions?.ctaStyle || "gradient",
        has3DLook: true,
        elevation: prev.visualOptions?.elevation ?? 0.45,
        // a new platform brings its own logo back
        customMark: undefined,
      },
      content: {
        ...prev.content,
        primaryText: platform.primaryText,
        secondaryText: platform.secondaryText,
        label: platform.icon,
        badgeText: platform.action,
      },
      audioSettings: {
        ...prev.audioSettings,
        soundUrl: prev.audioSettings?.soundUrl || platform.soundUrl,
        soundName: prev.audioSettings?.soundName || "Button Chime",
        volume: prev.audioSettings?.volume ?? 0.9,
      },
    }));
  };

  const CTA_SHAPES: { id: CtaShape; name: string; icon: string; desc: string }[] = [
    { id: "pill", name: "Pill", icon: "⬭", desc: "Rounded button — the classic CTA bar" },
    { id: "round", name: "Round Icon", icon: "⬤", desc: "Circular icon-only social badge" },
    { id: "square", name: "Square", icon: "▢", desc: "Compact card with soft corners" },
    { id: "banner", name: "Wide Banner", icon: "▬", desc: "Full-width strip for lower thirds" },
  ];

  const CTA_STYLES: { id: CtaStyle; name: string; desc: string }[] = [
    { id: "gradient", name: "Brand Gradient", desc: "Brand colour fading into its shadow tone" },
    { id: "solid", name: "Flat Solid", desc: "Single flat brand colour" },
    { id: "outline", name: "Outline", desc: "Transparent face with a brand-coloured border" },
    { id: "glass", name: "Frosted Glass", desc: "Translucent panel that works on any footage" },
  ];

  const COLOR_PRESETS: { name: string; c1: string; c2: string }[] = [
    { name: "YouTube Red", c1: "#FF0000", c2: "#B00000" },
    { name: "Instagram Sunset", c1: "#F58529", c2: "#8134AF" },
    { name: "TikTok Cyan", c1: "#25F4EE", c2: "#FE2C55" },
    { name: "Facebook Blue", c1: "#1877F2", c2: "#0B5FCC" },
    { name: "Spotify Green", c1: "#1DB954", c2: "#14833B" },
    { name: "WhatsApp Green", c1: "#25D366", c2: "#128C7E" },
    { name: "Twitch Purple", c1: "#9146FF", c2: "#6441A5" },
    { name: "Snapchat Yellow", c1: "#FFFC00", c2: "#F2E600" },
    { name: "Midnight Ink", c1: "#111827", c2: "#000000" },
    { name: "Signal Orange", c1: "#FF4500", c2: "#C0341D" },
    { name: "Royal Indigo", c1: "#6366F1", c2: "#4F46E5" },
    { name: "Emerald Shop", c1: "#10B981", c2: "#047857" },
  ];

  const CTA_POSITIONS: { id: NonNullable<TimelineInsert["presetPosition"]>; label: string }[] = [
    { id: "top-left", label: "Top Left" },
    { id: "top", label: "Top" },
    { id: "top-right", label: "Top Right" },
    { id: "left", label: "Left" },
    { id: "center", label: "Center" },
    { id: "right", label: "Right" },
    { id: "bottom-left", label: "Bottom Left" },
    { id: "bottom", label: "Bottom" },
    { id: "bottom-right", label: "Bottom Right" },
  ];
  const [isPlayingTestSound, setIsPlayingTestSound] = useState(false);
  const [isTestingClipAudio, setIsTestingClipAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clipAudioTestRef = useRef<HTMLVideoElement | null>(null);
  const clipAudioStopTimerRef = useRef<number | null>(null);

  // Test-play the first ~2 seconds of a video clip's original audio (toggle: plays -> off)
  const handleTestClipAudio = () => {
    const stopClipTest = () => {
      const v = clipAudioTestRef.current;
      if (v) {
        v.pause();
        v.removeAttribute("src");
        try { v.load(); } catch {}
        clipAudioTestRef.current = null;
      }
      if (clipAudioStopTimerRef.current) {
        clearTimeout(clipAudioStopTimerRef.current);
        clipAudioStopTimerRef.current = null;
      }
      setIsTestingClipAudio(false);
    };

    // Toggle OFF
    if (isTestingClipAudio) {
      stopClipTest();
      return;
    }

    const videoUrl = data.videoUrl || data.content?.videoUrl;
    if (!videoUrl || !videoUrl.toLowerCase().endsWith(".mp4") && !videoUrl.toLowerCase().endsWith(".webm")) {
      return;
    }

    const vol = data.audioSettings?.muted ? 0 : Math.max(0, Math.min(1, data.audioSettings?.volume ?? 0.8));
    const v = document.createElement("video");
    v.preload = "auto";
    v.volume = vol;
    v.muted = false;
    v.src = videoUrl;
    clipAudioTestRef.current = v;

    v.onended = () => stopClipTest();
    v.onerror = () => {
      console.warn("Video clip audio test failed");
      stopClipTest();
    };

    const p = v.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => stopClipTest());
    }
    // Auto stop after a 2 second sample
    clipAudioStopTimerRef.current = window.setTimeout(stopClipTest, 2000);
    setIsTestingClipAudio(true);
  };

  const handleSave = () => {
    if (audioRef.current) audioRef.current.pause();
    if (clipAudioTestRef.current) {
      clipAudioTestRef.current.pause();
      clipAudioTestRef.current = null;
      setIsTestingClipAudio(false);
    }
    onUpdate(data);
    onClose();
  };

  /** Patch one field of the template's look, keeping the rest of the overrides */
  const updateTemplateStyle = (field: string, value: unknown) => {
    setData((prev) => ({
      ...prev,
      visualOptions: {
        ...prev.visualOptions,
        templateStyle: {
          ...((prev.visualOptions?.templateStyle as Record<string, unknown>) || {}),
          [field]: value,
        },
      },
    }));
  };

  /** Drop all overrides and go back to the template's designed look */
  const resetTemplateStyle = () => {
    setData((prev) => ({
      ...prev,
      visualOptions: { ...prev.visualOptions, templateStyle: undefined },
    }));
  };

  const updateVisualOptions = (field: string, value: any) => {
    setData((prev) => ({
      ...prev,
      visualOptions: {
        ...prev.visualOptions,
        [field]: value,
      },
    }));
  };

  const updateAudioSettings = (field: string, value: any) => {
    setData((prev) => ({
      ...prev,
      audioSettings: {
        ...prev.audioSettings,
        [field]: value,
      },
    }));
  };

  const updateContent = (field: string, value: any) => {
    setData((prev) => ({
      ...prev,
      content: {
        ...prev.content,
        [field]: value,
      },
    }));
  };

  // Every change is pushed to the timeline as it is made, so the video preview
  // and the render always show exactly what the editor shows. Debounced so that
  // dragging a slider does not flood the parent with updates.
  const firstSyncRef = useRef(true);
  useEffect(() => {
    if (firstSyncRef.current) {
      firstSyncRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => onUpdate(data), 120);
    return () => window.clearTimeout(timer);
  }, [data]);

  useEffect(() => {
    return () => {
      stopAllSoundPreviews();
    };
  }, []);

  const handleTestSound = (url?: string) => {
    const soundUrl = url || data.audioSettings?.soundUrl;
    if (!soundUrl) return;

    const vol = data.audioSettings?.volume ?? 0.8;
    const isNowPlaying = toggleSoundPreview(soundUrl, vol, (active) => {
      setIsPlayingTestSound(active);
    });
    setIsPlayingTestSound(isNowPlaying);
  };

  const handleVolumeChange = (newVol: number) => {
    updateAudioSettings("volume", newVol);
    setSoundPreviewVolume(newVol);
  };

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === "string") {
        updateContent("logoUrl", event.target.result);
        updateContent("showLogo", true);
        updateContent("includeLogo", true);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        className={`bg-gray-900 border border-gray-700 rounded-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden ${
          isCallToAction && !isIntroOutro ? "max-w-3xl" : "max-w-xl"
        }`}
      >
        {/* Modal Header */}
        <div className="shrink-0 px-6 py-4 border-b border-gray-800 flex items-center justify-between bg-gray-950/60">
          <div className="flex items-center gap-3">
            <span className="text-2xl p-2 bg-gray-800 rounded-xl border border-gray-700">
              {insert.category === "intro"
                ? "🎬"
                : insert.category === "outro"
                ? "🏁"
                : isAudioVisualizer
                ? "📊"
                : isSoundEffect
                ? "🔊"
                : isCallToAction
                ? "📣"
                : "✨"}
            </span>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>{data.title}</span>
                <span className="text-[10px] font-mono uppercase bg-indigo-950 text-indigo-300 border border-indigo-800/80 px-2 py-0.5 rounded-full">
                  {insert.category === "intro"
                    ? "Cinematic Intro (Before Script)"
                    : insert.category === "outro"
                    ? "Broadcast Outro (After Script)"
                    : isAudioVisualizer
                    ? "Wave Effect"
                    : isSoundEffect
                    ? "Sound Effect"
                    : isCallToAction
                    ? "Call to Action"
                    : "Studio Overlay"}
                </span>
              </h3>
              <p className="text-xs text-gray-400">
                {insert.category === "intro"
                  ? "High-tension video opener with countdown, glitch or flare, custom text & logo reveal"
                  : insert.category === "outro"
                  ? "Professional end-slate video with social hub, subscribe button, text & logo"
                  : isAudioVisualizer
                  ? "Adjust size, screen placement, and voiceover reactivity"
                  : isSoundEffect
                  ? "Configure playback volume, loop, and timing"
                  : "Customize appearance, size, position, and optional sound"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Live call-to-action preview — sits above the tabs, always visible while editing */}
        {isCallToAction && !isIntroOutro && (
          <div className="shrink-0 px-6 pt-4">
            <CtaBadgePreview item={data} aspectRatio={aspectRatio} backgroundImage={backgroundImage} />
          </div>
        )}

        {/* Dynamic Contextual Navigation Tabs */}
        <div className="shrink-0 min-h-[46px] px-6 border-b border-gray-800 flex items-center gap-2 bg-gray-950/40 overflow-x-auto">
          {/* INTRO / OUTRO TABS */}
          {isIntroOutro && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab("intro_fx")}
                className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === "intro_fx"
                    ? "border-amber-500 text-amber-400"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                <span>🎬</span>
                <span>Tension FX & Video</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("content")}
                className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === "content"
                    ? "border-amber-500 text-amber-400"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                <span>📝</span>
                <span>Text & Titles</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("brand")}
                className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === "brand"
                    ? "border-amber-500 text-amber-400"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                <span>🏷️</span>
                <span>Brand Logo</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("attached_audio")}
                className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === "attached_audio"
                    ? "border-amber-500 text-amber-400"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                <span>🔔</span>
                <span>Sound FX</span>
              </button>
            </>
          )}

          {/* CALL TO ACTION TABS: Platform, Text, Colours, Size & Position */}
          {isCallToAction && !isIntroOutro && (
            <>
              {[
                { id: "cta_platform", icon: "🌐", label: "Platform" },
                { id: "cta_text", icon: "✏️", label: "Text & Icon" },
                { id: "cta_style", icon: "🎨", label: "Colours" },
                { id: "cta_layout", icon: "📐", label: "Size & Position" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                    activeTab === t.id
                      ? "border-indigo-500 text-indigo-400"
                      : "border-transparent text-gray-400 hover:text-gray-200"
                  }`}
                >
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </>
          )}

          {/* Visual Placement & Sizing (for all visual elements including waves, non-intro/outro) */}
          {!isSoundEffect && !isIntroOutro && !isCallToAction && (
            <button
              type="button"
              onClick={() => setActiveTab("visuals")}
              className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "visuals"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              <span>📐</span>
              <span>Position & Size</span>
            </button>
          )}

          {/* Audio Reactivity (Strictly for Wave & Visualizer Effects) */}
          {isAudioVisualizer && (
            <button
              type="button"
              onClick={() => setActiveTab("reactivity")}
              className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "reactivity"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              <span>🎙️</span>
              <span>Audio Reactivity</span>
            </button>
          )}

          {/* Sound Settings (Strictly for Sound FX) */}
          {isSoundEffect && (
            <button
              type="button"
              onClick={() => setActiveTab("audio")}
              className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "audio"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              <span>🔊</span>
              <span>Sound & Volume</span>
            </button>
          )}

          {/* Content Card Text (for Content / CTA cards, non-intro/outro) */}
          {!isIntroOutro && isContentCard && (
            <button
              type="button"
              onClick={() => setActiveTab("content")}
              className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "content"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              <span>📝</span>
              <span>Text Content</span>
            </button>
          )}

          {/* Design tab: plate, border, fonts, colours, transparency, motion */}
          {!isIntroOutro && isContentCard && (
            <button
              type="button"
              onClick={() => setActiveTab("design")}
              className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "design"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              <span>🎨</span>
              <span>Design</span>
            </button>
          )}

          {/* Optional Attached Sound (for Stickers & CTAs, non-intro/outro) */}
          {!isIntroOutro && isSticker && (
            <button
              type="button"
              onClick={() => setActiveTab("attached_audio")}
              className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "attached_audio"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              <span>🔔</span>
              <span>Sound FX</span>
            </button>
          )}

          {/* Timing & Timeline Window */}
          <button
            type="button"
            onClick={() => setActiveTab("timing")}
            className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "timing"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            <span>⏱️</span>
            <span>Timing</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 flex-1 min-h-0 overflow-y-auto space-y-5 text-sm">
          {/* Quick Intro / Outro Alignment Banner */}
          {isIntroOutro && (
            <div
              className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
                insert.category === "intro"
                  ? "bg-amber-950/40 border-amber-500/50 text-amber-200"
                  : "bg-rose-950/40 border-rose-500/50 text-rose-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm">
                  {insert.category === "intro" ? "🎬 Intro Placement:" : "🏁 Outro Placement:"}
                </span>
                <span className="font-mono text-white bg-black/60 px-2 py-0.5 rounded border border-gray-700">
                  {data.startTime.toFixed(1)}s (duration {data.duration}s)
                </span>
                {insert.category === "intro" && data.startTime === 0 && (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    ✓ Before Script (0.0s)
                  </span>
                )}
                {insert.category === "outro" &&
                  Math.abs(data.startTime - Math.max(0, totalDuration - data.duration)) < 0.2 && (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      ✓ After Script (End)
                    </span>
                  )}
              </div>

              {insert.category === "intro" ? (
                <button
                  type="button"
                  onClick={() => setData((prev) => ({ ...prev, startTime: 0 }))}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                >
                  <span>⚡ Align Before Script (0.0s)</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setData((prev) => ({
                      ...prev,
                      startTime: Math.max(0, totalDuration - prev.duration),
                    }))
                  }
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                >
                  <span>
                    ⚡ Align After Script ({Math.max(0, totalDuration - data.duration).toFixed(1)}s)
                  </span>
                </button>
              )}
            </div>
          )}

          {/* TAB: INTRO / OUTRO TENSION FX & VIDEO */}
          {isIntroOutro && activeTab === "intro_fx" && (
            <div className="space-y-4">
              {/* Tension Getter Selector */}
              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                <label className="text-xs font-semibold text-white block">
                  ⚡ Tension Getter Motion Style:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: "countdown", name: "3-2-1 Countdown", icon: "⏱️", desc: "Mechanical tension tick" },
                    { id: "glitch", name: "Cyber Glitch", icon: "⚡", desc: "RGB matrix digital glitch" },
                    { id: "warp", name: "Cosmic Warp", icon: "🌌", desc: "Hyperspace tunnel burst" },
                    { id: "aperture", name: "Studio Aperture", icon: "📷", desc: "Camera shutter opening" },
                    { id: "flare", name: "Golden Flare", icon: "✨", desc: "Anamorphic flare shockwave" },
                    { id: "pulse", name: "Tension Pulse", icon: "💓", desc: "Shockwave heartbeat glow" },
                  ].map((style) => {
                    const isSelected =
                      (data.content?.tensionStyle || data.tensionStyle || "flare") === style.id;
                    return (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => {
                          const tStyle = style.id as NonNullable<TimelineInsert["tensionStyle"]>;
                          setData((prev) => ({
                            ...prev,
                            tensionStyle: tStyle,
                            content: { ...prev.content, tensionStyle: tStyle },
                          }));
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? "bg-amber-950/80 border-amber-500 text-white ring-1 ring-amber-500/50"
                            : "bg-gray-900/70 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-bold text-xs text-white">
                          <span>{style.icon}</span>
                          <span>{style.name}</span>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1 line-clamp-1">{style.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Video Background Presets */}
              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-white">
                    🎬 HD Video Background (
                    {insert.category === "intro" ? "5 Tension Openers" : "5 Professional End-Slates"}):
                  </label>
                  <span className="text-[10px] text-amber-400 font-mono">1080p MP4 Ready</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(insert.category === "intro" ? INTRO_PRESETS : OUTRO_PRESETS).map((preset) => {
                    const isSelected =
                      (data.videoUrl || data.content?.videoUrl) === preset.videoUrl;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setData((prev) => ({
                            ...prev,
                            videoUrl: preset.videoUrl,
                            tensionStyle: (preset as any).tensionStyle || prev.tensionStyle,
                            content: {
                              ...prev.content,
                              videoUrl: preset.videoUrl,
                              tensionStyle:
                                (preset as any).tensionStyle || prev.content?.tensionStyle,
                            },
                            audioSettings: {
                              ...prev.audioSettings,
                              soundUrl: preset.soundUrl || prev.audioSettings?.soundUrl,
                            },
                          }));
                        }}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? "bg-amber-950/80 border-amber-500 text-white ring-2 ring-amber-500/40"
                            : "bg-gray-900/80 border-gray-750 text-gray-300 hover:border-gray-600"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs flex items-center gap-1.5 text-white">
                            <span>{preset.icon}</span>
                            <span>{preset.name}</span>
                          </span>
                          {isSelected && (
                            <span className="text-[10px] bg-amber-500 text-black font-extrabold px-1.5 py-0.5 rounded">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1">{preset.desc}</p>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Video or Image URL Input */}
                <div className="pt-3 border-t border-gray-700 space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-gray-200">
                        Custom Full-Screen Video or Image URL:
                      </label>
                      <span className="text-[10px] text-amber-400">MP4, WebM, PNG, JPG</span>
                    </div>
                    <input
                      type="text"
                      value={data.videoUrl || data.content?.videoUrl || data.content?.imageUrl || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        const isImg = val.match(/\.(jpeg|jpg|gif|png|webp|svg)($|\?)/i);
                        setData((prev) => ({
                          ...prev,
                          videoUrl: isImg ? undefined : val,
                          content: {
                            ...prev.content,
                            videoUrl: isImg ? undefined : val,
                            imageUrl: isImg ? val : undefined,
                          },
                        }));
                      }}
                      placeholder="https://...mp4 or https://...png or custom asset"
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500 font-mono"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">
                      Supports direct full-screen video clips or full-screen static branding graphics.
                    </p>
                  </div>

                  {/* Customer Video Clip Audio Controls */}
                  <div className="bg-gray-900/90 border border-amber-500/30 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-amber-300 block">
                          🔊 Video Clip Audio Volume
                        </span>
                        <span className="text-[10px] text-gray-400">
                          Preserves original sound in your video clips (dialogue, jingle, sound effects)
                        </span>
                      </div>
                      <span className="font-mono text-xs text-amber-400 font-bold">
                        {data.audioSettings?.muted ? "MUTED" : `${Math.round((data.audioSettings?.volume ?? 0.8) * 100)}%`}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        disabled={data.audioSettings?.muted ?? false}
                        value={data.audioSettings?.volume ?? 0.8}
                        onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                        className="flex-1 accent-amber-500 cursor-pointer disabled:opacity-40"
                      />

                      <label className="text-xs text-gray-300 flex items-center gap-1.5 cursor-pointer flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={data.audioSettings?.muted ?? false}
                          onChange={(e) => updateAudioSettings("muted", e.target.checked)}
                          className="w-4 h-4 accent-red-500 rounded"
                        />
                        <span className="text-[11px]">Mute Audio</span>
                      </label>

                      {(data.videoUrl || data.content?.videoUrl) && (
                        <button
                          type="button"
                          onClick={handleTestClipAudio}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors flex-shrink-0 ${
                            isTestingClipAudio
                              ? "bg-rose-600 hover:bg-rose-500 text-white ring-2 ring-rose-400"
                              : "bg-amber-600 hover:bg-amber-500 text-white"
                          }`}
                          title="Play a 2-second sample of the clip's original audio"
                        >
                          <span>{isTestingClipAudio ? "⏹️" : "▶️"}</span>
                          <span>{isTestingClipAudio ? "Stop (Off)" : "Test Clip Audio"}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: INTRO / OUTRO BRAND LOGO */}
          {isIntroOutro && activeTab === "brand" && (
            <div className="space-y-4">
              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-4">
                {/* Show Logo Toggle */}
                <div className="flex items-center justify-between pb-3 border-b border-gray-700">
                  <div>
                    <span className="text-xs font-semibold text-white block">
                      Show Brand Logo Image
                    </span>
                    <span className="text-[10px] text-gray-400">
                      Renders an animated logo emblem with glowing backlight and entrance reveal
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(data.content?.showLogo ?? data.content?.includeLogo ?? true)}
                    onChange={(e) => {
                      updateContent("showLogo", e.target.checked);
                      updateContent("includeLogo", e.target.checked);
                    }}
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                  />
                </div>

                {/* Logo URL and Upload */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white block">
                    Logo Image File or URL:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={data.content?.logoUrl || ""}
                      onChange={(e) => {
                        updateContent("logoUrl", e.target.value);
                        updateContent("showLogo", true);
                      }}
                      placeholder="Image URL or upload a file..."
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => logoFileInputRef.current?.click()}
                      className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <span>📁 Upload</span>
                    </button>
                    <input
                      ref={logoFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoFileUpload}
                    />
                  </div>
                </div>

                {/* Logo Position */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="text-xs font-semibold text-white block mb-1">
                      Logo Position:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: "center", label: "Center Stage" },
                        { id: "top", label: "Top Header" },
                      ].map((pos) => (
                        <button
                          key={pos.id}
                          type="button"
                          onClick={() => updateContent("logoPosition", pos.id)}
                          className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all ${
                            (data.content?.logoPosition || "center") === pos.id
                              ? "bg-amber-950 border-amber-500 text-white"
                              : "bg-gray-900 border-gray-700 text-gray-400 hover:text-white"
                          }`}
                        >
                          {pos.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Logo Scale */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-300 mb-1">
                      <label className="font-semibold text-white">Logo Scale:</label>
                      <span className="font-mono text-amber-400">
                        {(data.content?.logoScale || 1.2).toFixed(1)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={2.5}
                      step={0.1}
                      value={data.content?.logoScale || 1.2}
                      onChange={(e) => updateContent("logoScale", parseFloat(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer mt-1"
                    />
                  </div>
                </div>

                {/* Logo Preview Box */}
                {data.content?.logoUrl && (
                  <div className="p-3 bg-black/60 border border-gray-800 rounded-xl flex items-center justify-center gap-4">
                    <img
                      src={data.content.logoUrl}
                      alt="Brand Logo Preview"
                      referrerPolicy="no-referrer"
                      className="max-h-16 max-w-[120px] object-contain drop-shadow-[0_0_12px_rgba(251,191,36,0.5)]"
                    />
                    <div className="text-xs text-gray-400">
                      <span className="text-emerald-400 font-semibold block">✓ Brand Logo Ready</span>
                      <span>Will be displayed during the reveal animation</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: VISUAL POSITION & SIZE */}
          {activeTab === "visuals" && !isSoundEffect && !isIntroOutro && (
            <div className="space-y-4">
              {/* Note for wave effects */}
              {isAudioVisualizer && (
                <div className="bg-indigo-950/50 border border-indigo-800/60 rounded-xl p-3 text-xs text-indigo-200 flex items-start gap-2.5">
                  <span className="text-base">🌊</span>
                  <div>
                    <span className="font-semibold text-white">Audio Reactive Visualizer:</span>
                    <p className="mt-0.5 text-indigo-300/90 leading-relaxed">
                      This 3D visualizer renders dynamically to speech and music. Linear waves stretch across the entire scene width by default, while circular and dot visualizers can be scaled and positioned anywhere.
                    </p>
                  </div>
                </div>
              )}

              {/* Size / Scale Slider */}
              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-xs text-gray-300">
                  <span className="font-medium text-white flex items-center gap-1.5">
                    <span>🔍</span>
                    <span>Visual Scale / Height</span>
                  </span>
                  <span className="font-mono text-indigo-400 font-bold">
                    {data.size.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={isAudioVisualizer ? 0.4 : 0.5}
                  max={isAudioVisualizer ? 3.0 : 2.5}
                  step={0.05}
                  value={data.size}
                  onChange={(e) => setData({ ...data, size: parseFloat(e.target.value) })}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-gray-500">
                  <span>Small ({isAudioVisualizer ? "0.4x" : "0.5x"})</span>
                  <span>Normal (1.0x)</span>
                  <span>Large ({isAudioVisualizer ? "3.0x" : "2.5x"})</span>
                </div>
              </div>

              {/* Visualizer Dimensions, Full-Width & Thickness */}
              {isAudioVisualizer && (
                <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                  {/* Headline choice, kept on the tab users land on: what drives the motion */}
                  <div className="space-y-2 pb-3 border-b border-gray-750">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-white">Moves With:</span>
                      <span className="text-[11px] text-gray-400">
                        Drives the animation in the preview and the render
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setData({ ...data, audioSource: "voice" })}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                          data.audioSource !== "music"
                            ? "bg-indigo-600 border-indigo-500 text-white shadow-sm"
                            : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-750"
                        }`}
                      >
                        <span>🎙️</span>
                        <span>Moves With Voiceover</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setData({ ...data, audioSource: "music" })}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                          data.audioSource === "music"
                            ? "bg-indigo-600 border-indigo-500 text-white shadow-sm"
                            : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-750"
                        }`}
                      >
                        <span>🎵</span>
                        <span>Moves With Music</span>
                      </button>
                    </div>
                  </div>

                  {/* Full scene width toggle for linear visualizers */}
                  {data.type !== "circular_wave" &&
                    data.type !== "voice_pulse" &&
                    data.type !== "energy_ring" &&
                    data.type !== "minimal_voice" &&
                    data.type !== "pulse_circle" && (
                      <div className="flex items-center justify-between pb-3 border-b border-gray-750">
                        <div>
                          <span className="text-xs font-medium text-white block">
                            Stretch Across Entire Scene (Full Width)
                          </span>
                          <span className="text-[11px] text-gray-400">
                            Spans seamlessly from the left edge to the right edge of the video
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={data.visualOptions?.fullWidth !== false}
                          onChange={(e) => updateVisualOptions("fullWidth", e.target.checked)}
                          className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                        />
                      </div>
                    )}

                  {/* Wave & Bar Thickness */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-gray-300">
                      <span className="text-xs font-medium text-white">Wave & Bar Thickness:</span>
                      <span className="font-mono text-indigo-400 font-semibold">
                        {data.visualOptions?.barThickness ?? 8}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={24}
                      step={1}
                      value={data.visualOptions?.barThickness ?? 8}
                      onChange={(e) => updateVisualOptions("barThickness", parseInt(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  {/* Reaction Strength */}
                  <div className="space-y-1.5 pt-2 border-t border-gray-750">
                    <div className="flex justify-between text-xs text-gray-300">
                      <span className="text-xs font-medium text-white">Reaction Strength:</span>
                      <span className="font-mono text-indigo-400 font-semibold">
                        {Math.round((data.visualOptions?.reactivity ?? 1) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={2.4}
                      step={0.05}
                      value={data.visualOptions?.reactivity ?? 1}
                      onChange={(e) => updateVisualOptions("reactivity", parseFloat(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                    <p className="text-[11px] text-gray-400">
                      How hard the elements hit on loud moments. Higher = the bars leap further and
                      the pulses thump harder.
                    </p>
                  </div>

                  {/* Whole-video span */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-750">
                    <div>
                      <span className="text-xs font-medium text-white block">
                        Run Through the Entire Video
                      </span>
                      <span className="text-[11px] text-gray-400">
                        Keeps the visualiser on screen from the first frame to the last, even when the
                        video gets longer
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={data.visualOptions?.spanFullVideo !== false}
                      onChange={(e) => {
                        const on = e.target.checked;
                        updateVisualOptions("spanFullVideo", on);
                        if (on) {
                          setData((prev) => ({
                            ...prev,
                            startTime: 0,
                            duration: Math.max(1, totalDuration),
                            visualOptions: { ...(prev.visualOptions || {}), spanFullVideo: true },
                          }));
                        }
                      }}
                      className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                    />
                  </div>

                  {/* Glow & Bloom Intensity */}
                  <div className="space-y-1.5 pt-2 border-t border-gray-750">
                    <div className="flex justify-between text-xs text-gray-300">
                      <span className="text-xs font-medium text-white">Glow & Bloom Intensity:</span>
                      <span className="font-mono text-indigo-400 font-semibold">
                        {Math.round((data.visualOptions?.glowIntensity ?? 0.85) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={data.visualOptions?.glowIntensity ?? 0.85}
                      onChange={(e) => updateVisualOptions("glowIntensity", parseFloat(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  {/* 3D Extruded Depth Toggle */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-750">
                    <div>
                      <span className="text-xs font-medium text-white block">
                        3D Extruded Depth & Highlights
                      </span>
                      <span className="text-[11px] text-gray-400">
                        Adds specular highlights, bevel facets, and floor reflections
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={data.visualOptions?.has3DLook ?? true}
                      onChange={(e) => updateVisualOptions("has3DLook", e.target.checked)}
                      className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* Position Presets */}
              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-2.5">
                <label className="text-xs font-medium text-white block">
                  Screen Position Placement:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "top", label: "Top Center" },
                    { id: "center", label: "Center" },
                    { id: "bottom", label: "Bottom Center" },
                    { id: "top-left", label: "Top Left" },
                    { id: "top-right", label: "Top Right" },
                    { id: "bottom-left", label: "Bottom Left" },
                    { id: "bottom-right", label: "Bottom Right" },
                    { id: "left", label: "Left Edge" },
                    { id: "right", label: "Right Edge" },
                  ].map((pos) => (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() => setData({ ...data, presetPosition: pos.id as any })}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        data.presetPosition === pos.id
                          ? "bg-indigo-600 border-indigo-500 text-white shadow-sm"
                          : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-750 hover:text-white"
                      }`}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Motion — shared by stickers and CTA badges. This is what puts
                  movement in the video and pulls the viewer's eye. */}
              {(isSticker || isCallToAction) && (
                <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-4">
                  <div>
                    <span className="text-xs font-semibold text-white block">🎞️ Motion</span>
                    <span className="text-[11px] text-gray-400">
                      How this element moves while it is on screen
                    </span>
                  </div>

                  {/* Live preview of the current settings (stickers only) */}
                  {isSticker && (
                    <div className="flex items-center gap-4 bg-gray-950/60 border border-gray-800 rounded-lg p-3">
                      <StickerPreviewCanvas
                        stickerId={data.visualOptions?.stickerId || insert.type}
                        motionPreset={data.visualOptions?.motionPreset}
                        motionSpeed={data.visualOptions?.motionSpeed}
                        motionAmount={data.visualOptions?.motionAmount}
                        tint={data.visualOptions?.stickerTint ?? null}
                        glow={data.visualOptions?.stickerGlow}
                        shadow={data.visualOptions?.shadowIntensity}
                        size={104}
                        backdrop="checker"
                      />
                      <div className="text-[11px] text-gray-400 leading-relaxed">
                        <span className="text-gray-200 font-semibold block mb-0.5">
                          {MOTION_PRESETS_BY_ID[data.visualOptions?.motionPreset || ""]?.name || "Static"}
                        </span>
                        {MOTION_PRESETS_BY_ID[data.visualOptions?.motionPreset || ""]?.blurb ||
                          "Pick a motion below to bring it to life."}
                      </div>
                    </div>
                  )}

                  {/* Motion preset grid */}
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                    {MOTION_PRESETS.map((m) => {
                      const active = (data.visualOptions?.motionPreset || "none") === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => updateVisualOptions("motionPreset", m.id)}
                          title={m.blurb}
                          className={`px-1.5 py-2 rounded-lg border text-[10px] font-semibold transition-colors flex flex-col items-center gap-0.5 cursor-pointer ${
                            active
                              ? "bg-indigo-600 border-indigo-400 text-white"
                              : "bg-gray-900/70 border-gray-700 text-gray-300 hover:border-gray-500"
                          }`}
                        >
                          <span className="text-base leading-none">{m.icon}</span>
                          <span className="leading-tight text-center">{m.name}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Speed & amount */}
                  <div className="space-y-2.5 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-300">Speed:</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0.25}
                          max={2.5}
                          step={0.05}
                          value={data.visualOptions?.motionSpeed ?? 1}
                          onChange={(e) => updateVisualOptions("motionSpeed", parseFloat(e.target.value))}
                          className="w-32 accent-indigo-500 cursor-pointer"
                        />
                        <span className="font-mono text-xs text-gray-300 w-10 text-right">
                          {(data.visualOptions?.motionSpeed ?? 1).toFixed(2)}×
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-300">Intensity:</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={2}
                          step={0.05}
                          value={data.visualOptions?.motionAmount ?? 1}
                          onChange={(e) => updateVisualOptions("motionAmount", parseFloat(e.target.value))}
                          className="w-32 accent-indigo-500 cursor-pointer"
                        />
                        <span className="font-mono text-xs text-gray-300 w-10 text-right">
                          {Math.round((data.visualOptions?.motionAmount ?? 1) * 100)}%
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div>
                        <span className="text-xs text-gray-300 block">Pop in on appear</span>
                        <span className="text-[10px] text-gray-500">Overshooting entrance when it first shows</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={data.visualOptions?.motionEntrance ?? true}
                        onChange={(e) => updateVisualOptions("motionEntrance", e.target.checked)}
                        className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 3D look controls specific to stickers */}
              {isSticker && (
                <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                  <div>
                    <span className="text-xs font-semibold text-white block">✨ 3D Look</span>
                    <span className="text-[11px] text-gray-400">
                      Depth shadow, ambient glow and colour
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-300">Drop shadow:</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={data.visualOptions?.shadowIntensity ?? 0.85}
                        onChange={(e) => updateVisualOptions("shadowIntensity", parseFloat(e.target.value))}
                        className="w-32 accent-indigo-500 cursor-pointer"
                      />
                      <span className="font-mono text-xs text-gray-300 w-10 text-right">
                        {Math.round((data.visualOptions?.shadowIntensity ?? 0.85) * 100)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-300">Ambient glow:</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={data.visualOptions?.stickerGlow ?? 0.35}
                        onChange={(e) => updateVisualOptions("stickerGlow", parseFloat(e.target.value))}
                        className="w-32 accent-indigo-500 cursor-pointer"
                      />
                      <span className="font-mono text-xs text-gray-300 w-10 text-right">
                        {Math.round((data.visualOptions?.stickerGlow ?? 0.35) * 100)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-750">
                    <div>
                      <span className="text-xs text-gray-300 block">Recolour</span>
                      <span className="text-[10px] text-gray-500">Off = the sticker's own materials</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={data.visualOptions?.stickerTint || "#FFC400"}
                        onChange={(e) => updateVisualOptions("stickerTint", e.target.value)}
                        className="w-7 h-7 rounded cursor-pointer border border-gray-600 bg-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => updateVisualOptions("stickerTint", null)}
                        className={`px-2 py-1 rounded text-[10px] font-semibold border transition-colors cursor-pointer ${
                          data.visualOptions?.stickerTint
                            ? "bg-gray-900 border-gray-600 text-gray-300 hover:border-gray-400"
                            : "bg-indigo-600 border-indigo-400 text-white"
                        }`}
                      >
                        Original
                      </button>
                    </div>
                  </div>

                  {/* Swap the sticker without deleting and re-adding it */}
                  <div className="pt-2 border-t border-gray-750 space-y-2">
                    <span className="text-xs text-gray-300 block">Swap sticker:</span>
                    <div className="grid grid-cols-8 gap-1 max-h-32 overflow-y-auto pr-1">
                      {STICKER_LIBRARY.map((st) => {
                        const active = (data.visualOptions?.stickerId || insert.type) === st.id;
                        return (
                          <button
                            key={st.id}
                            type="button"
                            title={`${st.name} — ${st.blurb}`}
                            onClick={() => updateVisualOptions("stickerId", st.id)}
                            className={`aspect-square rounded-md border flex items-center justify-center text-base transition-colors cursor-pointer ${
                              active
                                ? "bg-indigo-600 border-indigo-400"
                                : "bg-gray-900/70 border-gray-700 hover:border-gray-500"
                            }`}
                          >
                            {st.icon}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Visual 3D Styling (for stickers & CTAs) */}
              {(isSticker || isCallToAction) && (
                <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium text-white block">3D Extruded Depth & Highlights</span>
                      <span className="text-[11px] text-gray-400">Glossy highlights, bevel facets, and ambient depth</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={data.visualOptions?.has3DLook ?? true}
                      onChange={(e) => updateVisualOptions("has3DLook", e.target.checked)}
                      className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                    />
                  </div>

                  <div className="pt-2 border-t border-gray-750 flex items-center justify-between">
                    <span className="text-xs text-gray-300">Opacity:</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0.2}
                        max={1.0}
                        step={0.05}
                        value={data.opacity ?? 1.0}
                        onChange={(e) => setData({ ...data, opacity: parseFloat(e.target.value) })}
                        className="w-32 accent-indigo-500 cursor-pointer"
                      />
                      <span className="font-mono text-xs text-gray-300 w-10 text-right">
                        {Math.round((data.opacity ?? 1.0) * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Color Customization for Audio Visualizers */}
              {isAudioVisualizer && (
                <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                  <label className="text-xs font-semibold text-white block">
                    🎨 Visualizer Colors & 3D Lighting:
                  </label>

                  {/* Primary Color */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-300 font-medium">Primary Accent Color:</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={data.visualOptions?.primaryColor || "#38bdf8"}
                          onChange={(e) => updateVisualOptions("primaryColor", e.target.value)}
                          className="w-6 h-6 rounded cursor-pointer border border-gray-600 bg-transparent"
                        />
                        <span className="font-mono text-[11px] text-gray-400">
                          {data.visualOptions?.primaryColor || "#38bdf8"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {[
                        { color: "#38bdf8", name: "Neon Cyan" },
                        { color: "#10b981", name: "CRT Green" },
                        { color: "#a855f7", name: "Cyber Purple" },
                        { color: "#ec4899", name: "Hot Pink" },
                        { color: "#f59e0b", name: "Sunset Amber" },
                        { color: "#ffffff", name: "Studio White" },
                        { color: "#3b82f6", name: "Laser Blue" },
                        { color: "#ef4444", name: "Crimson Red" },
                      ].map(({ color, name }) => (
                        <button
                          key={color}
                          type="button"
                          title={name}
                          onClick={() => updateVisualOptions("primaryColor", color)}
                          className={`w-7 h-7 rounded-full border-2 transition-transform ${
                            (data.visualOptions?.primaryColor || "#38bdf8").toLowerCase() === color.toLowerCase()
                              ? "scale-110 border-white shadow-lg ring-2 ring-indigo-400"
                              : "border-transparent hover:scale-105"
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Secondary Gradient Color */}
                  <div className="space-y-2 pt-2 border-t border-gray-750">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-300 font-medium">Secondary / Crest Color:</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={data.visualOptions?.secondaryColor || "#f43f5e"}
                          onChange={(e) => updateVisualOptions("secondaryColor", e.target.value)}
                          className="w-6 h-6 rounded cursor-pointer border border-gray-600 bg-transparent"
                        />
                        <span className="font-mono text-[11px] text-gray-400">
                          {data.visualOptions?.secondaryColor || "#f43f5e"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {[
                        { color: "#f43f5e", name: "Rose Crimson" },
                        { color: "#ec4899", name: "Hot Pink" },
                        { color: "#8b5cf6", name: "Royal Purple" },
                        { color: "#06b6d4", name: "Electric Cyan" },
                        { color: "#34d399", name: "Emerald Bright" },
                        { color: "#fbbf24", name: "Gold Glow" },
                        { color: "#ffffff", name: "White Flash" },
                      ].map(({ color, name }) => (
                        <button
                          key={color}
                          type="button"
                          title={name}
                          onClick={() => updateVisualOptions("secondaryColor", color)}
                          className={`w-7 h-7 rounded-full border-2 transition-transform ${
                            (data.visualOptions?.secondaryColor || "#f43f5e").toLowerCase() === color.toLowerCase()
                              ? "scale-110 border-white shadow-lg ring-2 ring-indigo-400"
                              : "border-transparent hover:scale-105"
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Quick 3D Theme Presets */}
                  <div className="space-y-1.5 pt-2 border-t border-gray-750">
                    <span className="text-[11px] text-gray-400 font-medium block">Quick 3D Color Themes:</span>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { name: "Rainbow 3D", c1: "#2563eb", c2: "#ef4444" },
                        { name: "Cyber Neon", c1: "#06b6d4", c2: "#ec4899" },
                        { name: "CRT Phosphor", c1: "#10b981", c2: "#34d399" },
                        { name: "Deep Violet", c1: "#8b5cf6", c2: "#ec4899" },
                        { name: "Sunset Amber", c1: "#f59e0b", c2: "#ef4444" },
                        { name: "Studio Ice", c1: "#ffffff", c2: "#94a3b8" },
                      ].map((th) => (
                        <button
                          key={th.name}
                          type="button"
                          onClick={() => {
                            updateVisualOptions("primaryColor", th.c1);
                            updateVisualOptions("secondaryColor", th.c2);
                          }}
                          className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-white border border-gray-700 hover:border-gray-500 transition-all flex items-center justify-between"
                          style={{ background: `linear-gradient(90deg, ${th.c1}33, ${th.c2}33)` }}
                        >
                          <span>{th.name}</span>
                          <span className="flex gap-1">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: th.c1 }} />
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: th.c2 }} />
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: AUDIO REACTIVITY (WAVE EFFECTS) */}
          {activeTab === "reactivity" && isAudioVisualizer && (
            <div className="space-y-4">
              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                <label className="text-xs font-semibold text-white block">
                  🎧 What should it move with?
                </label>
                <p className="text-xs text-gray-400">
                  Pick the track that drives the movement. This applies to the live preview and to
                  the rendered video, which read the same two audio buses.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setData({ ...data, audioSource: "voice" })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      data.audioSource === "voice"
                        ? "bg-indigo-950/80 border-indigo-500 shadow-sm"
                        : "bg-gray-800/60 border-gray-700 hover:bg-gray-800 text-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">🎙️</span>
                      <span className="text-xs font-bold text-white">Moves with the Voiceover</span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      The visualiser breathes with the narration — it rises on every syllable and
                      settles in the pauses.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setData({ ...data, audioSource: "music" })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      data.audioSource === "music"
                        ? "bg-indigo-950/80 border-indigo-500 shadow-sm"
                        : "bg-gray-800/60 border-gray-700 hover:bg-gray-800 text-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">🎵</span>
                      <span className="text-xs font-bold text-white">Moves with the Music</span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      Driven by the background track alone: it kicks on the beat and rides the
                      bass line, for music-led videos.
                    </p>
                  </button>
                </div>
              </div>

              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-xs text-gray-300">
                  <span className="font-medium text-white">Reactivity Sensitivity:</span>
                  <span className="font-mono text-indigo-400">
                    {Math.round((data.intensity ?? 1.0) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.4}
                  max={1.8}
                  step={0.1}
                  value={data.intensity ?? 1.0}
                  onChange={(e) => setData({ ...data, intensity: parseFloat(e.target.value) })}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* ================= TAB: CTA PLATFORM ================= */}
          {activeTab === "cta_platform" && isCallToAction && (
            <div className="space-y-4">
              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-semibold text-white block">
                      🌐 Call-to-Action Platform:
                    </span>
                    <span className="text-[11px] text-gray-400">
                      36 ready-made social badges. Pick one to load its wording, brand colours, mark and sound.
                    </span>
                  </div>
                  {activePlatform && (
                    <span
                      className="text-[10px] font-bold px-2.5 py-1 rounded-lg self-start sm:self-auto shrink-0"
                      style={{ background: activePlatform.primaryColor, color: "#fff" }}
                    >
                      {activePlatform.name}
                    </span>
                  )}
                </div>

                {/* Group filter + search */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCtaGroup("all")}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                      ctaGroup === "all"
                        ? "bg-indigo-600 border-indigo-500 text-white"
                        : "bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-800"
                    }`}
                  >
                    All ({CTA_PLATFORMS.length})
                  </button>
                  {CTA_GROUPS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setCtaGroup(g.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                        ctaGroup === g.id
                          ? "bg-indigo-600 border-indigo-500 text-white"
                          : "bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-800"
                      }`}
                    >
                      {g.icon} {g.name}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  value={ctaSearch}
                  onChange={(e) => setCtaSearch(e.target.value)}
                  placeholder="Search platforms (instagram, spotify, shop...)"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                />

                {/* Platform grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-80 overflow-y-auto pr-1">
                  {CTA_PLATFORMS.filter(
                    (pf) =>
                      (ctaGroup === "all" || pf.group === ctaGroup) &&
                      (ctaSearch.trim() === "" ||
                        `${pf.name} ${pf.action} ${pf.primaryText}`
                          .toLowerCase()
                          .includes(ctaSearch.trim().toLowerCase()))
                  ).map((pf) => {
                    const isActive = data.visualOptions?.platform === pf.id;
                    return (
                      <button
                        key={pf.id}
                        type="button"
                        onClick={() => applyPlatform(pf.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2 ${
                          isActive
                            ? "bg-indigo-950/80 border-indigo-500 ring-1 ring-indigo-400"
                            : "bg-gray-900 border-gray-700 hover:bg-gray-800 hover:border-indigo-500/50"
                        }`}
                      >
                        <span
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[13px] shrink-0 shadow-sm"
                          style={{
                            background: `linear-gradient(180deg, ${pf.primaryColor}, ${pf.secondaryColor})`,
                            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), 0 1px 3px rgba(0,0,0,0.5)",
                          }}
                        >
                          {pf.icon}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[11px] font-semibold text-white truncate">
                            {pf.name.split(" — ")[0]}
                          </span>
                          <span className="block text-[10px] text-gray-400 truncate">{pf.action}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB: CTA TEXT & ICON ================= */}
          {activeTab === "cta_text" && isCallToAction && (
            <div className="space-y-4">
              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                <span className="text-xs font-semibold text-white block">✏️ Button Wording:</span>

                <div>
                  <span className="text-[11px] text-gray-300 block mb-1">Primary Button Text:</span>
                  <input
                    type="text"
                    value={data.content?.primaryText || ""}
                    onChange={(e) => updateContent("primaryText", e.target.value)}
                    placeholder="SUBSCRIBE NOW"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {["SUBSCRIBE", "FOLLOW US", "LIKE & SHARE", "WATCH NOW", "SHOP NOW", "LEARN MORE", "JOIN FREE"].map(
                      (preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => updateContent("primaryText", preset)}
                          className="px-2 py-0.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-md text-[10px] text-gray-300"
                        >
                          {preset}
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] text-gray-300 block mb-1">Subtext / Offer Line:</span>
                  <input
                    type="text"
                    value={data.content?.secondaryText || ""}
                    onChange={(e) => updateContent("secondaryText", e.target.value)}
                    placeholder="Link in bio · New videos every week"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="bg-gray-900/70 border border-gray-700 rounded-xl p-3 space-y-2">
                    <div className="flex justify-between text-[11px] text-gray-300">
                      <span className="font-medium text-white">Text size</span>
                      <span className="font-mono text-indigo-400">{Math.round((data.visualOptions?.textScale ?? 1) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.7}
                      max={1.4}
                      step={0.05}
                      value={data.visualOptions?.textScale ?? 1}
                      onChange={(e) => updateVisual({ textScale: parseFloat(e.target.value) })}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>
                  <div className="bg-gray-900/70 border border-gray-700 rounded-xl p-3 space-y-2">
                    <div className="flex justify-between text-[11px] text-gray-300">
                      <span className="font-medium text-white">Brand mark size</span>
                      <span className="font-mono text-indigo-400">{Math.round((data.visualOptions?.iconScale ?? 1) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.6}
                      max={1.6}
                      step={0.05}
                      value={data.visualOptions?.iconScale ?? 1}
                      onChange={(e) => updateVisual({ iconScale: parseFloat(e.target.value) })}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[11px] text-gray-300">Badge Icon:</span>
                    <button
                      type="button"
                      onClick={() => updateVisual({ customMark: undefined })}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors ${
                        data.visualOptions?.customMark
                          ? "bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-800"
                          : "bg-indigo-600 border-indigo-400 text-white"
                      }`}
                    >
                      {activePlatform ? `Brand logo (${activePlatform.icon} ${activePlatform.name.split(" — ")[0]})` : "Brand logo"}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {["🔔", "👍", "✨", "🛍️", "🔗", "📱", "💬", "🔖", "⭐", "🚀", "🔥", "🎁", "👇", "❤️", "▶️", "🎧", "☕", "📅"].map(
                      (ico) => (
                        <button
                          key={ico}
                          type="button"
                          onClick={() =>
                            updateVisual({
                              // tap the same icon again to go back to the brand logo
                              customMark: data.visualOptions?.customMark === ico ? undefined : ico,
                            })
                          }
                          className={`w-8 h-8 rounded-lg text-sm flex items-center justify-center border transition-all ${
                            data.visualOptions?.customMark === ico
                              ? "bg-indigo-600 border-indigo-400 scale-110 shadow"
                              : "bg-gray-900 border-gray-700 hover:bg-gray-800"
                          }`}
                        >
                          {ico}
                        </button>
                      )
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1.5">
                    {data.visualOptions?.customMark
                      ? "Showing your chosen icon — tap it again (or the Brand logo chip) to go back to the platform logo."
                      : "Tap an icon to use it instead of the platform logo."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB: CTA COLOURS & STYLE ================= */}
          {activeTab === "cta_style" && isCallToAction && (
            <div className="space-y-4">
              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                <span className="text-xs font-semibold text-white block">🎨 Badge Shape:</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CTA_SHAPES.map((sh) => {
                    const isActive = (data.visualOptions?.ctaShape || "pill") === sh.id;
                    return (
                      <button
                        key={sh.id}
                        type="button"
                        onClick={() => updateVisual({ ctaShape: sh.id })}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          isActive
                            ? "bg-indigo-950/80 border-indigo-500 ring-1 ring-indigo-400"
                            : "bg-gray-900 border-gray-700 hover:bg-gray-800"
                        }`}
                      >
                        <div className="text-base mb-0.5">{sh.icon}</div>
                        <div className="text-[11px] font-semibold text-white">{sh.name}</div>
                        <div className="text-[9px] text-gray-400 leading-tight">{sh.desc}</div>
                      </button>
                    );
                  })}
                </div>

                <span className="text-xs font-semibold text-white block pt-2 border-t border-gray-700/80">
                  Badge Finish:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {CTA_STYLES.map((st) => {
                    const isActive = (data.visualOptions?.ctaStyle || "gradient") === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => updateVisual({ ctaStyle: st.id })}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          isActive
                            ? "bg-indigo-950/80 border-indigo-500 ring-1 ring-indigo-400"
                            : "bg-gray-900 border-gray-700 hover:bg-gray-800"
                        }`}
                      >
                        <div className="text-[11px] font-semibold text-white">{st.name}</div>
                        <div className="text-[9px] text-gray-400 leading-tight">{st.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                <span className="text-xs font-semibold text-white block">🎨 Brand Colour Themes:</span>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {COLOR_PRESETS.map((cp) => {
                    const isActive =
                      (data.visualOptions?.primaryColor || "").toLowerCase() === cp.c1.toLowerCase();
                    return (
                      <button
                        key={cp.name}
                        type="button"
                        onClick={() => updateVisual({ primaryColor: cp.c1, secondaryColor: cp.c2 })}
                        className={`p-2 rounded-xl border transition-all ${
                          isActive ? "border-indigo-400 ring-1 ring-indigo-400" : "border-gray-700 hover:border-gray-500"
                        }`}
                        title={cp.name}
                      >
                        <div
                          className="h-6 w-full rounded-md mb-1 shadow-sm"
                          style={{ background: `linear-gradient(180deg, ${cp.c1}, ${cp.c2})` }}
                        />
                        <div className="text-[9px] text-gray-300 truncate">{cp.name}</div>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-700/80">
                  <div>
                    <span className="text-[10px] text-gray-400 block mb-1">Top colour</span>
                    <input
                      type="color"
                      value={data.visualOptions?.primaryColor || "#6366F1"}
                      onChange={(e) => updateVisual({ primaryColor: e.target.value })}
                      className="w-full h-8 rounded-lg bg-gray-900 border border-gray-700 cursor-pointer"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block mb-1">Bottom colour</span>
                    <input
                      type="color"
                      value={data.visualOptions?.secondaryColor || "#4F46E5"}
                      onChange={(e) => updateVisual({ secondaryColor: e.target.value })}
                      className="w-full h-8 rounded-lg bg-gray-900 border border-gray-700 cursor-pointer"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block mb-1">Text colour</span>
                    <input
                      type="color"
                      value={data.visualOptions?.textColor || "#FFFFFF"}
                      onChange={(e) => updateVisual({ textColor: e.target.value })}
                      className="w-full h-8 rounded-lg bg-gray-900 border border-gray-700 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-4">
                <span className="text-xs font-semibold text-white block">🪄 Raised 2D Badge Look:</span>

                <div>
                  <div className="flex justify-between text-[11px] text-gray-300 mb-1.5">
                    <span className="font-medium text-white">Raised height (lift off the video)</span>
                    <span className="font-mono text-indigo-400">
                      {Math.round((data.visualOptions?.elevation ?? 0.45) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={data.visualOptions?.elevation ?? 0.45}
                    onChange={(e) => updateVisual({ elevation: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">
                    Adds a soft plate shadow with a light top edge and a darker bottom edge — a clean, slightly
                    raised 2D look.
                  </p>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-gray-300 mb-1.5">
                    <span className="font-medium text-white">Outline thickness</span>
                    <span className="font-mono text-indigo-400">
                      {(data.visualOptions?.borderWidth ?? 2.5).toFixed(1)} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={6}
                    step={0.5}
                    value={data.visualOptions?.borderWidth ?? 2.5}
                    onChange={(e) => updateVisual({ borderWidth: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>

                <label className="flex items-center justify-between gap-3 pt-2 border-t border-gray-700/80 cursor-pointer">
                  <span className="text-[11px] text-gray-300">
                    <span className="block font-semibold text-white">Glow behind the badge</span>
                    <span className="block text-[10px] text-gray-500">
                      Soft brand-coloured halo to separate it from busy footage
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={data.visualOptions?.has3DLook ?? true}
                    onChange={(e) => updateVisual({ has3DLook: e.target.checked })}
                    className="w-4 h-4 accent-indigo-500 rounded shrink-0"
                  />
                </label>
              </div>
            </div>
          )}

          {/* ================= TAB: CTA SIZE & POSITION ================= */}
          {activeTab === "cta_layout" && isCallToAction && (
            <div className="space-y-4">
              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-4">
                <div>
                  <div className="flex justify-between text-[11px] text-gray-300 mb-1.5">
                    <span className="font-semibold text-white">Badge Size</span>
                    <span className="font-mono text-indigo-400">{Math.round((data.size ?? 1) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.4}
                    max={2.4}
                    step={0.05}
                    value={data.size ?? 1}
                    onChange={(e) => setData({ ...data, size: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">
                    You can also drag the corner handle of the selected badge directly on the video preview.
                  </p>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-gray-300 mb-1.5">
                    <span className="font-medium text-white">Badge width</span>
                    <span className="font-mono text-indigo-400">
                      {Math.round((data.visualOptions?.badgeScale ?? 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.6}
                    max={1.8}
                    step={0.05}
                    value={data.visualOptions?.badgeScale ?? 1}
                    onChange={(e) => updateVisual({ badgeScale: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-gray-300 mb-1.5">
                    <span className="font-medium text-white">Rotation</span>
                    <span className="font-mono text-indigo-400">{data.visualOptions?.rotation ?? 0}°</span>
                  </div>
                  <input
                    type="range"
                    min={-25}
                    max={25}
                    step={1}
                    value={data.visualOptions?.rotation ?? 0}
                    onChange={(e) => updateVisual({ rotation: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-gray-300 mb-1.5">
                    <span className="font-medium text-white">Opacity</span>
                    <span className="font-mono text-indigo-400">
                      {Math.round((data.opacity ?? 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={data.opacity ?? 1}
                    onChange={(e) => setData({ ...data, opacity: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>
              </div>

              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                <span className="text-xs font-semibold text-white block">📍 Screen Position:</span>
                <div className="grid grid-cols-3 gap-2 max-w-xs">
                  {CTA_POSITIONS.map((pp) => {
                    const isActive = data.presetPosition === pp.id;
                    return (
                      <button
                        key={pp.id}
                        type="button"
                        onClick={() => {
                          const coords: Record<string, { x: number; y: number }> = {
                            "top-left": { x: 0.22, y: 0.15 },
                            top: { x: 0.5, y: 0.13 },
                            "top-right": { x: 0.78, y: 0.15 },
                            left: { x: 0.24, y: 0.5 },
                            center: { x: 0.5, y: 0.5 },
                            right: { x: 0.76, y: 0.5 },
                            "bottom-left": { x: 0.22, y: 0.85 },
                            bottom: { x: 0.5, y: 0.85 },
                            "bottom-right": { x: 0.78, y: 0.85 },
                          };
                          setData({
                            ...data,
                            presetPosition: pp.id,
                            position: coords[pp.id],
                          });
                        }}
                        className={`h-9 rounded-lg border text-[10px] font-semibold transition-all ${
                          isActive
                            ? "bg-indigo-600 border-indigo-400 text-white"
                            : "bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-800"
                        }`}
                        title={pp.label}
                      >
                        <span className="leading-tight">{pp.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                      <span>Horizontal</span>
                      <span className="font-mono text-indigo-400">{Math.round((data.position?.x ?? 0.5) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.05}
                      max={0.95}
                      step={0.01}
                      value={data.position?.x ?? 0.5}
                      onChange={(e) =>
                        setData({
                          ...data,
                          presetPosition: undefined,
                          position: { x: parseFloat(e.target.value), y: data.position?.y ?? 0.5 },
                        })
                      }
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                      <span>Vertical</span>
                      <span className="font-mono text-indigo-400">{Math.round((data.position?.y ?? 0.85) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.05}
                      max={0.95}
                      step={0.01}
                      value={data.position?.y ?? 0.85}
                      onChange={(e) =>
                        setData({
                          ...data,
                          presetPosition: undefined,
                          position: { x: data.position?.x ?? 0.5, y: parseFloat(e.target.value) },
                        })
                      }
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onClose()}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors"
                >
                  🖱️ Move &amp; resize it on the video preview
                </button>
                <p className="text-[10px] text-gray-500">
                  Closes this panel, keeps the badge selected — then drag the badge to move it and drag its
                  corner handle to resize. Position snaps to the nearest safe-area margin.
                </p>
              </div>
            </div>
          )}

          {/* TAB: SOUND CONTROLS (MUSIC & SOUND FX) */}
          {activeTab === "audio" && isSoundEffect && (
            <div className="space-y-4">
              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-white block">
                      {isBackgroundMusic ? "Music Volume:" : "Sound Volume:"}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {isBackgroundMusic
                        ? "Adjust background music gain under the voiceover"
                        : "Adjust sound effect audio gain"}
                    </span>
                  </div>
                  <span className="font-mono text-indigo-400 font-bold">
                    {Math.round((data.audioSettings?.volume ?? 0.8) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={data.audioSettings?.volume ?? 0.8}
                  onChange={(e) => updateAudioSettings("volume", parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />

                {isBackgroundMusic && (
                  <div
                    className={`rounded-xl border p-3 transition-colors ${
                      data.audioSettings?.loop
                        ? "bg-indigo-950/50 border-indigo-500/70"
                        : "bg-gray-900/60 border-gray-700"
                    }`}
                  >
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={data.audioSettings?.loop ?? false}
                        onChange={(e) => {
                          const on_ = e.target.checked;
                          // looped music fills the rest of the video; un-looped music
                          // just plays once for the clip length
                          setData((prev) => ({
                            ...prev,
                            scope: on_ ? "from_here" : "this_scene",
                            audioSettings: { ...prev.audioSettings, loop: on_ },
                          }));
                        }}
                        className="mt-0.5 w-4 h-4 accent-indigo-500 rounded"
                      />
                      <div>
                        <span className="text-xs font-bold text-white block">
                          🔁 Loop to repeat through the complete video
                        </span>
                        <span className="text-[11px] text-gray-400 block leading-relaxed">
                          {data.audioSettings?.loop
                            ? "The track repeats automatically from where it is placed until the end of the video."
                            : "The track plays once only, for the clip length below."}
                        </span>
                      </div>
                    </label>

                    <p className="mt-2 pt-2 border-t border-gray-700/70 text-[11px] font-mono text-indigo-300">
                      {data.audioSettings?.loop
                        ? `▶ plays ${formatTime(data.startTime)} → end of video (${formatTime(totalDuration)}) on repeat`
                        : `▶ plays once at ${formatTime(data.startTime)} for ${Math.round(data.duration)}s`}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-gray-750">
                  {!isBackgroundMusic && (
                    <label className="text-xs text-gray-300 flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={data.audioSettings?.loop ?? false}
                        onChange={(e) => updateAudioSettings("loop", e.target.checked)}
                        className="w-4 h-4 accent-indigo-500 rounded"
                      />
                      <span>Loop Audio continuously</span>
                    </label>
                  )}

                  <label className="text-xs text-gray-300 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={data.audioSettings?.muted ?? false}
                      onChange={(e) => updateAudioSettings("muted", e.target.checked)}
                      className="w-4 h-4 accent-red-500 rounded"
                    />
                    <span>Mute Sound</span>
                  </label>
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleTestSound()}
                    className={`px-3.5 py-1.5 rounded-lg text-white text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                      isPlayingTestSound
                        ? "bg-rose-600 hover:bg-rose-500 ring-2 ring-rose-400 animate-pulse"
                        : "bg-indigo-600 hover:bg-indigo-500"
                    }`}
                  >
                    <span>{isPlayingTestSound ? "⏹️" : "▶️"}</span>
                    <span>{isPlayingTestSound ? "Stop Sound (Turn Off)" : "Test Play Sound"}</span>
                  </button>
                  <span className="text-[11px] text-gray-400">
                    {isPlayingTestSound ? "Playing preview audio..." : "Click to test playback"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB: ATTACHED SOUND FX (FOR INTROS, OUTROS, STICKERS, CTAs & OVERLAYS) */}
          {activeTab === "attached_audio" && (
            <div className="space-y-4">
              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-white block">
                      Attached Sound Effect or Jingle:
                    </label>
                    <p className="text-[11px] text-gray-400">
                      Choose an audio effect to play synchronously when this element appears on screen:
                    </p>
                  </div>
                  {data.audioSettings?.soundUrl && (
                    <button
                      type="button"
                      onClick={() => handleTestSound()}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                        isPlayingTestSound
                          ? "bg-rose-600 text-white ring-2 ring-rose-400 animate-pulse"
                          : "bg-emerald-600 hover:bg-emerald-500 text-white"
                      }`}
                    >
                      <span>{isPlayingTestSound ? "⏹️" : "▶️"}</span>
                      <span>{isPlayingTestSound ? "Stop (Off)" : "Test Sound"}</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (isPlayingTestSound) handleTestSound();
                      updateAudioSettings("soundUrl", undefined);
                    }}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border text-left ${
                      !data.audioSettings?.soundUrl
                        ? "bg-indigo-600 text-white border-indigo-500"
                        : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-750"
                    }`}
                  >
                    🚫 None (Silent)
                  </button>

                  {SOUND_LIBRARY.slice(0, 10).map((sound) => (
                    <button
                      key={sound.url}
                      type="button"
                      onClick={() => {
                        updateAudioSettings("soundUrl", sound.url);
                        updateAudioSettings("soundName", sound.name);
                        handleTestSound(sound.url);
                      }}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border text-left flex items-center justify-between ${
                        data.audioSettings?.soundUrl === sound.url
                          ? "bg-indigo-600 text-white border-indigo-500"
                          : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-750"
                      }`}
                    >
                      <span className="truncate">{sound.name}</span>
                      <span className="text-[10px] opacity-70">
                        {isPlayingTestSound && data.audioSettings?.soundUrl === sound.url ? "⏹️ Off" : "🔊"}
                      </span>
                    </button>
                  ))}
                </div>

                {data.audioSettings?.soundUrl && (
                  <div className="pt-3 border-t border-gray-750 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-300">Sound Volume:</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={data.audioSettings?.volume ?? 0.8}
                        onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                        className="w-36 accent-indigo-500 cursor-pointer"
                      />
                      <span className="font-mono text-xs text-indigo-400 font-bold w-12 text-right">
                        {Math.round((data.audioSettings?.volume ?? 0.8) * 100)}%
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleTestSound()}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                        isPlayingTestSound
                          ? "bg-rose-600 text-white ring-2 ring-rose-400"
                          : "bg-gray-700 hover:bg-gray-600 text-white border border-gray-600"
                      }`}
                    >
                      <span>{isPlayingTestSound ? "⏹️" : "▶️"}</span>
                      <span>{isPlayingTestSound ? "Stop (Off)" : "Test Attached Audio"}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: INTRO / OUTRO TEXT CONTENT */}
          {activeTab === "content" && isIntroOutro && (
            <div className="space-y-4">
              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-gray-700">
                  <div className="flex items-center gap-2">
                    <span className="text-base text-amber-400">
                      {insert.category === "intro" ? "🎬" : "🏁"}
                    </span>
                    <div>
                      <span className="text-xs font-bold text-white block">
                        {insert.category === "intro"
                          ? "Intro Title & Headline Settings"
                          : "Outro Credits & End-Slate Text"}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        Rendered with cinematic shadows, glowing outlines, and synchronized entrance
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick One-Click Headline Presets */}
                <div>
                  <label className="text-[11px] font-medium text-gray-300 block mb-1.5">
                    Quick Headline Presets:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(insert.category === "intro"
                      ? [
                          { title: "THE UNTOLD TRUTH", sub: "EPISODE 01 • DOCUMENTARY", label: "OFFICIAL PREMIERE" },
                          { title: "BREAKING REVELATION", sub: "WATCH TILL THE VERY END", label: "SPECIAL REPORT" },
                          { title: "THE NEXT EVOLUTION", sub: "NEW ERA OF CREATION", label: "MASTERCLASS" },
                          { title: "WELCOME TO THE FUTURE", sub: "PREPARE TO BE AMAZED", label: "PRODUCER CUT" },
                        ]
                      : [
                          { title: "THANKS FOR WATCHING", sub: "LIKE, SHARE & SUBSCRIBE!", label: "THE END" },
                          { title: "SEE YOU IN THE NEXT ONE", sub: "NEW EPISODES EVERY WEEK", label: "STAY TUNED" },
                          { title: "DON'T MISS WHAT'S NEXT", sub: "CLICK LINKS IN DESCRIPTION", label: "EPISODE RECAP" },
                          { title: "JOIN OUR COMMUNITY", sub: "SUBSCRIBE & RING THE BELL", label: "COMMUNITY HUB" },
                        ]
                    ).map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          updateContent("primaryText", preset.title);
                          updateContent("secondaryText", preset.sub);
                          updateContent("label", preset.label);
                        }}
                        className="p-2 bg-gray-900/80 hover:bg-gray-800 border border-gray-700/80 hover:border-amber-500/60 rounded-xl text-left transition-all group"
                      >
                        <span className="text-[9px] font-mono text-amber-400 block uppercase font-bold">
                          {preset.label}
                        </span>
                        <div className="text-xs font-bold text-white group-hover:text-amber-300 truncate">
                          {preset.title}
                        </div>
                        <div className="text-[10px] text-gray-400 truncate">{preset.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Primary Headline */}
                <div>
                  <label className="text-xs font-semibold text-white block mb-1">
                    {insert.category === "intro" ? "Main Intro Title:" : "Main Outro Headline:"}
                  </label>
                  <input
                    type="text"
                    value={data.content?.primaryText || ""}
                    onChange={(e) => updateContent("primaryText", e.target.value)}
                    placeholder={
                      insert.category === "intro"
                        ? "e.g. THE FUTURE OF INTELLIGENCE"
                        : "e.g. THANKS FOR WATCHING"
                    }
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500 font-bold tracking-wide"
                  />
                </div>

                {/* Secondary Subtitle */}
                <div>
                  <label className="text-xs font-semibold text-white block mb-1">
                    Subtitle / Catchphrase:
                  </label>
                  <input
                    type="text"
                    value={data.content?.secondaryText || ""}
                    onChange={(e) => updateContent("secondaryText", e.target.value)}
                    placeholder="e.g. EPISODE 01 • Like & Subscribe for more"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Category / Badge Tag */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-white block mb-1">
                      Header Badge / Tag:
                    </label>
                    <input
                      type="text"
                      value={data.content?.label || ""}
                      onChange={(e) => updateContent("label", e.target.value)}
                      placeholder="e.g. PREMIERE, THE END..."
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500 font-mono text-[11px]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-white block mb-1">
                      Author / Presenter:
                    </label>
                    <input
                      type="text"
                      value={data.content?.author || ""}
                      onChange={(e) => updateContent("author", e.target.value)}
                      placeholder="e.g. Produced by Studio"
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: TEXT CONTENT & COMPLETED CTA TEMPLATES */}
          {/* ============ DESIGN TAB: the full adjustable look ============ */}
          {activeTab === "design" && !isIntroOutro && isContentCard && (() => {
            const tplId = resolveTemplateId(
              (data.visualOptions?.templateId as string) || insert.type
            );
            const overrides = (data.visualOptions?.templateStyle || {}) as Partial<TextTemplateStyle>;
            const st = resolveTemplateStyle(tplId, overrides);
            const tplDef = TEMPLATE_BY_ID[tplId];
            const section = tplDef?.section;
            const siblings = TEXT_TEMPLATES.filter((t) => t.section === section);
            const fmt = (v: number, suffix?: string) =>
              suffix === "percent" ? `${Math.round(v * 100)}%`
              : suffix === "px" ? `${v}px`
              : suffix === "x" ? `${v.toFixed(2)}×`
              : v.toFixed(2);

            return (
              <div className="space-y-5">
                {/* Live preview of exactly what will be drawn */}
                <div className="bg-gray-950/70 border border-gray-800 rounded-xl p-3 flex flex-col items-center gap-2">
                  <TemplatePreviewCanvas
                    templateId={tplId}
                    content={data.content as Record<string, string>}
                    styleOverrides={overrides}
                    width={420}
                  />
                  <span className="text-[10px] text-gray-500">
                    Live preview — background, border, font and motion as they will render
                  </span>
                </div>

                {/* Swap to another template in the same section */}
                <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">Template</span>
                    <button
                      type="button"
                      onClick={resetTemplateStyle}
                      className="text-[10px] px-2 py-1 rounded border border-gray-600 text-gray-300 hover:border-gray-400 transition-colors cursor-pointer"
                    >
                      Reset design
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {siblings.map((t) => {
                      const active = t.id === tplId;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          title={t.blurb}
                          onClick={() => updateVisualOptions("templateId", t.id)}
                          className={`px-2 py-2 rounded-lg border text-[10px] font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                            active
                              ? "bg-indigo-600 border-indigo-400 text-white"
                              : "bg-gray-900/70 border-gray-700 text-gray-300 hover:border-gray-500"
                          }`}
                        >
                          <span className="text-sm">{t.icon}</span>
                          <span className="truncate text-left">{t.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ---- Background ---- */}
                <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                  <span className="text-xs font-semibold text-white block">🎨 Background</span>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-300">Colour:</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={st.bgColor}
                        onChange={(e) => updateTemplateStyle("bgColor", e.target.value)}
                        className="w-7 h-7 rounded cursor-pointer border border-gray-600 bg-transparent"
                      />
                      <input
                        type="color"
                        value={st.bgColor2 || st.bgColor}
                        onChange={(e) => updateTemplateStyle("bgColor2", e.target.value)}
                        className="w-7 h-7 rounded cursor-pointer border border-gray-600 bg-transparent"
                        title="Second colour (gradient)"
                      />
                      <button
                        type="button"
                        onClick={() => updateTemplateStyle("bgColor2", st.bgColor2 ? null : "#1E293B")}
                        className={`px-2 py-1 rounded text-[10px] font-semibold border transition-colors cursor-pointer ${
                          st.bgColor2
                            ? "bg-indigo-600 border-indigo-400 text-white"
                            : "bg-gray-900 border-gray-600 text-gray-300"
                        }`}
                      >
                        Gradient
                      </button>
                    </div>
                  </div>

                  {STYLE_CONTROLS.filter((c) => c.group === "background").map((c) => (
                    <div key={c.key} className="flex items-center justify-between">
                      <span className="text-xs text-gray-300">{c.label}:</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={c.min}
                          max={c.max}
                          step={c.step}
                          value={st[c.key] as number}
                          onChange={(e) => updateTemplateStyle(c.key, parseFloat(e.target.value))}
                          className="w-32 accent-indigo-500 cursor-pointer"
                        />
                        <span className="font-mono text-xs text-gray-300 w-12 text-right">
                          {fmt(st[c.key] as number, c.suffix)}
                        </span>
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-gray-300">Plate shape:</span>
                    <div className="flex gap-1">
                      {PLATE_SHAPES.map((sh) => (
                        <button
                          key={sh.id}
                          type="button"
                          onClick={() => updateTemplateStyle("plateShape", sh.id)}
                          className={`px-2 py-1 rounded text-[10px] font-semibold border transition-colors cursor-pointer ${
                            st.plateShape === sh.id
                              ? "bg-indigo-600 border-indigo-400 text-white"
                              : "bg-gray-900 border-gray-600 text-gray-300 hover:border-gray-400"
                          }`}
                        >
                          {sh.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => updateTemplateStyle("bgOpacity", st.bgOpacity > 0.02 ? 0 : 0.88)}
                    className={`w-full py-2 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                      st.bgOpacity <= 0.02
                        ? "bg-indigo-600 border-indigo-400 text-white"
                        : "bg-gray-900 border-gray-600 text-gray-300 hover:border-gray-400"
                    }`}
                  >
                    {st.bgOpacity <= 0.02 ? "✓ No background (text floats on video)" : "Remove background entirely"}
                  </button>
                </div>

                {/* ---- Border ---- */}
                <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                  <span className="text-xs font-semibold text-white block">▢ Border</span>

                  <div className="grid grid-cols-3 gap-1.5">
                    {BORDER_MODES.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => updateTemplateStyle("borderMode", b.id)}
                        className={`px-2 py-2 rounded-lg border text-[10px] font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                          st.borderMode === b.id
                            ? "bg-indigo-600 border-indigo-400 text-white"
                            : "bg-gray-900/70 border-gray-700 text-gray-300 hover:border-gray-500"
                        }`}
                      >
                        <span className="font-mono">{b.icon}</span>
                        <span className="truncate">{b.name}</span>
                      </button>
                    ))}
                  </div>

                  {st.borderMode !== "none" && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-300">Border colour:</span>
                        <input
                          type="color"
                          value={st.borderColor}
                          onChange={(e) => updateTemplateStyle("borderColor", e.target.value)}
                          className="w-7 h-7 rounded cursor-pointer border border-gray-600 bg-transparent"
                        />
                      </div>
                      {STYLE_CONTROLS.filter((c) => c.group === "border").map((c) => (
                        <div key={c.key} className="flex items-center justify-between">
                          <span className="text-xs text-gray-300">{c.label}:</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min={c.min}
                              max={c.max}
                              step={c.step}
                              value={st[c.key] as number}
                              onChange={(e) => updateTemplateStyle(c.key, parseFloat(e.target.value))}
                              className="w-32 accent-indigo-500 cursor-pointer"
                            />
                            <span className="font-mono text-xs text-gray-300 w-12 text-right">
                              {fmt(st[c.key] as number, c.suffix)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                {/* ---- Text & font ---- */}
                <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                  <span className="text-xs font-semibold text-white block">🔤 Text & Font</span>

                  <div className="space-y-1.5">
                    <span className="text-xs text-gray-300">Font:</span>
                    <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
                      {CAPTION_FONTS.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => updateTemplateStyle("fontId", f.id)}
                          style={{ fontFamily: `"${f.family}", ${f.fallback}` }}
                          className={`px-2 py-2 rounded-lg border text-xs transition-colors text-left cursor-pointer ${
                            st.fontId === f.id
                              ? "bg-indigo-600 border-indigo-400 text-white"
                              : "bg-gray-900/70 border-gray-700 text-gray-200 hover:border-gray-500"
                          }`}
                        >
                          {f.family}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-gray-300">Colours:</span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1 text-[10px] text-gray-400">
                        Title
                        <input
                          type="color"
                          value={st.titleColor}
                          onChange={(e) => updateTemplateStyle("titleColor", e.target.value)}
                          className="w-6 h-6 rounded cursor-pointer border border-gray-600 bg-transparent"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[10px] text-gray-400">
                        Body
                        <input
                          type="color"
                          value={st.bodyColor}
                          onChange={(e) => updateTemplateStyle("bodyColor", e.target.value)}
                          className="w-6 h-6 rounded cursor-pointer border border-gray-600 bg-transparent"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[10px] text-gray-400">
                        Accent
                        <input
                          type="color"
                          value={st.accentColor}
                          onChange={(e) => updateTemplateStyle("accentColor", e.target.value)}
                          className="w-6 h-6 rounded cursor-pointer border border-gray-600 bg-transparent"
                        />
                      </label>
                    </div>
                  </div>

                  {STYLE_CONTROLS.filter((c) => c.group === "text").map((c) => (
                    <div key={c.key} className="flex items-center justify-between">
                      <span className="text-xs text-gray-300">{c.label}:</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={c.min}
                          max={c.max}
                          step={c.step}
                          value={st[c.key] as number}
                          onChange={(e) => updateTemplateStyle(c.key, parseFloat(e.target.value))}
                          className="w-32 accent-indigo-500 cursor-pointer"
                        />
                        <span className="font-mono text-xs text-gray-300 w-12 text-right">
                          {fmt(st[c.key] as number, c.suffix)}
                        </span>
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-gray-300">Align:</span>
                    <div className="flex gap-1">
                      {(["left", "center", "right"] as const).map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => updateTemplateStyle("textAlign", a)}
                          className={`px-2.5 py-1 rounded text-[10px] font-semibold border capitalize transition-colors cursor-pointer ${
                            st.textAlign === a
                              ? "bg-indigo-600 border-indigo-400 text-white"
                              : "bg-gray-900 border-gray-600 text-gray-300 hover:border-gray-400"
                          }`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-300">Uppercase labels</span>
                    <input
                      type="checkbox"
                      checked={st.uppercaseLabel}
                      onChange={(e) => updateTemplateStyle("uppercaseLabel", e.target.checked)}
                      className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* ---- Motion & depth ---- */}
                <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                  <span className="text-xs font-semibold text-white block">🎞️ Entrance & Depth</span>

                  <div className="grid grid-cols-3 gap-1.5">
                    {TEMPLATE_MOTIONS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        title={m.blurb}
                        onClick={() => updateTemplateStyle("motion", m.id)}
                        className={`px-1.5 py-2 rounded-lg border text-[10px] font-semibold transition-colors flex flex-col items-center gap-0.5 cursor-pointer ${
                          st.motion === m.id
                            ? "bg-indigo-600 border-indigo-400 text-white"
                            : "bg-gray-900/70 border-gray-700 text-gray-300 hover:border-gray-500"
                        }`}
                      >
                        <span className="text-base leading-none">{m.icon}</span>
                        <span className="leading-tight text-center">{m.name}</span>
                      </button>
                    ))}
                  </div>

                  {STYLE_CONTROLS.filter((c) => c.group === "depth").map((c) => (
                    <div key={c.key} className="flex items-center justify-between">
                      <span className="text-xs text-gray-300">{c.label}:</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={c.min}
                          max={c.max}
                          step={c.step}
                          value={st[c.key] as number}
                          onChange={(e) => updateTemplateStyle(c.key, parseFloat(e.target.value))}
                          className="w-32 accent-indigo-500 cursor-pointer"
                        />
                        <span className="font-mono text-xs text-gray-300 w-12 text-right">
                          {fmt(st[c.key] as number, c.suffix)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {activeTab === "content" && !isIntroOutro && (isContentCard || isCallToAction) && (
            <div className="space-y-4">
              {isCallToAction ? (
                <>
                  {/* Completed CTA Templates Selector */}
                  <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-white block">
                        🎯 Choose Completed CTA Template:
                      </label>
                      <span className="text-[10px] text-indigo-400 font-medium">1-Click Apply</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { id: "subscribe", name: "Subscribe & Bell", icon: "🔔", text: "SUBSCRIBE", sub: "Hit the bell for updates", col1: "#ef4444", col2: "#b91c1c", sound: "/sounds/ting.ogg" },
                        { id: "follow", name: "Follow Badge", icon: "✨", text: "FOLLOW FOR MORE", sub: "Daily creative tips & tricks", col1: "#0284c7", col2: "#0369a1", sound: "/sounds/jump_pop.wav" },
                        { id: "like", name: "Like & Share", icon: "👍", text: "LIKE & SHARE", sub: "Share with a friend who needs this", col1: "#6366f1", col2: "#4f46e5", sound: "/sounds/jump_pop.wav" },
                        { id: "shop", name: "Shop Now (Sale)", icon: "🛍️", text: "SHOP NOW — 20% OFF", sub: "Limited time seasonal deal", col1: "#10b981", col2: "#047857", sound: "/sounds/ting.ogg" },
                        { id: "link", name: "Bio / Web Link", icon: "🔗", text: "LINK IN DESCRIPTION", sub: "Click below for full details", col1: "#38bdf8", col2: "#0284c7", sound: "/sounds/ting.ogg" },
                        { id: "app", name: "Get Mobile App", icon: "📱", text: "DOWNLOAD FREE APP", sub: "Available on iOS & Android", col1: "#8b5cf6", col2: "#6d28d9", sound: "/sounds/ting.ogg" },
                        { id: "comment", name: "Comment Below", icon: "💬", text: "DROP YOUR THOUGHTS", sub: "What do you think? Comment below!", col1: "#f59e0b", col2: "#d97706", sound: "/sounds/jump_pop.wav" },
                        { id: "save", name: "Save / Bookmark", icon: "🔖", text: "SAVE FOR LATER", sub: "Bookmark so you don't lose it", col1: "#ec4899", col2: "#be185d", sound: "/sounds/jump_pop.wav" },
                        { id: "community", name: "Join VIP Group", icon: "⭐", text: "JOIN OUR COMMUNITY", sub: "Exclusive perks & updates", col1: "#eab308", col2: "#ca8a04", sound: "/sounds/ting.ogg" },
                        { id: "start", name: "Get Started Now", icon: "🚀", text: "GET STARTED TODAY", sub: "Try it free for 14 days", col1: "#4f46e5", col2: "#3730a3", sound: "/sounds/jump_pop.wav" },
                      ].map((tmpl) => (
                        <button
                          key={tmpl.id}
                          type="button"
                          onClick={() => {
                            setData({
                              ...data,
                              content: {
                                ...data.content,
                                primaryText: tmpl.text,
                                secondaryText: tmpl.sub,
                                label: tmpl.icon,
                              },
                              visualOptions: {
                                ...data.visualOptions,
                                primaryColor: tmpl.col1,
                                secondaryColor: tmpl.col2,
                                has3DLook: true,
                              },
                              audioSettings: {
                                ...data.audioSettings,
                                soundUrl: tmpl.sound,
                                volume: 0.8,
                              },
                            });
                          }}
                          className="px-2.5 py-2 bg-gray-850 hover:bg-gray-750 border border-gray-700 hover:border-indigo-500/60 rounded-xl text-left transition-all flex items-center gap-2 group"
                        >
                          <span className="text-base group-hover:scale-110 transition-transform">{tmpl.icon}</span>
                          <div className="truncate">
                            <div className="text-[11px] font-semibold text-white truncate">{tmpl.name}</div>
                            <div className="text-[9px] text-gray-400 truncate">{tmpl.text}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Customizable Options */}
                  <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                    <label className="text-xs font-semibold text-white block">
                      ✏️ Edit Call to Action Options:
                    </label>

                    <div>
                      <span className="text-[11px] text-gray-300 block mb-1">Primary Button Text:</span>
                      <input
                        type="text"
                        value={data.content?.primaryText || ""}
                        onChange={(e) => updateContent("primaryText", e.target.value)}
                        placeholder="e.g. SUBSCRIBE NOW, GET 20% OFF..."
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500 font-semibold"
                      />
                    </div>

                    <div>
                      <span className="text-[11px] text-gray-300 block mb-1">Secondary Subtext / Offer Line:</span>
                      <input
                        type="text"
                        value={data.content?.secondaryText || ""}
                        onChange={(e) => updateContent("secondaryText", e.target.value)}
                        placeholder="e.g. Hit the bell for notifications, Link in bio..."
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* Emoji / Icon Selector */}
                    <div>
                      <span className="text-[11px] text-gray-300 block mb-1.5">Button Icon / Emoji:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {["🔔", "👍", "✨", "🛍️", "🔗", "📱", "💬", "🔖", "⭐", "🚀", "🔥", "🎁", "👇", "❤️"].map((ico) => (
                          <button
                            key={ico}
                            type="button"
                            onClick={() => updateContent("label", ico)}
                            className={`w-8 h-8 rounded-lg text-sm flex items-center justify-center border transition-all ${
                              (data.content?.label || "🔔") === ico
                                ? "bg-indigo-600 border-indigo-400 scale-110 shadow"
                                : "bg-gray-900 border-gray-700 hover:bg-gray-800"
                            }`}
                          >
                            {ico}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Button Color Palette */}
                    <div>
                      <span className="text-[11px] text-gray-300 block mb-1.5">Button Gradient Theme:</span>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { name: "YouTube Crimson", c1: "#ef4444", c2: "#b91c1c" },
                          { name: "Azure Blue", c1: "#0284c7", c2: "#0369a1" },
                          { name: "Electric Indigo", c1: "#6366f1", c2: "#4f46e5" },
                          { name: "Emerald Shop", c1: "#10b981", c2: "#047857" },
                          { name: "Royal Violet", c1: "#8b5cf6", c2: "#6d28d9" },
                          { name: "Amber Sunset", c1: "#f59e0b", c2: "#d97706" },
                          { name: "Hot Pink", c1: "#ec4899", c2: "#be185d" },
                          { name: "Dark Obsidian", c1: "#27272a", c2: "#18181b" },
                        ].map((pal) => (
                          <button
                            key={pal.name}
                            type="button"
                            title={pal.name}
                            onClick={() => {
                              updateVisualOptions("primaryColor", pal.c1);
                              updateVisualOptions("secondaryColor", pal.c2);
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-white border transition-all flex items-center gap-1.5 ${
                              data.visualOptions?.primaryColor === pal.c1
                                ? "border-white scale-105 shadow-md ring-2 ring-indigo-400"
                                : "border-transparent opacity-85 hover:opacity-100"
                            }`}
                            style={{ background: `linear-gradient(135deg, ${pal.c1}, ${pal.c2})` }}
                          >
                            <span>●</span>
                            <span>{pal.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : isScriptureTemplate ? (
                /* Dedicated Scripture Verse Fields */
                <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-gray-700">
                    <span className="text-base text-amber-400">📖</span>
                    <div>
                      <span className="text-xs font-bold text-white block">Holy Scripture Verse Settings</span>
                      <span className="text-[10px] text-gray-400">Customize biblical citation, translation, and passage text</span>
                    </div>
                  </div>

                  {/* Reference Fields: Book, Chapter, Verse */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[11px] text-gray-300 block mb-1">Book Name:</label>
                      <input
                        type="text"
                        value={data.content?.book || "John"}
                        onChange={(e) => updateContent("book", e.target.value)}
                        placeholder="e.g. John, Psalms"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-amber-500 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-300 block mb-1">Chapter:</label>
                      <input
                        type="text"
                        value={data.content?.chapter || "3"}
                        onChange={(e) => updateContent("chapter", e.target.value)}
                        placeholder="e.g. 3, 23"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-amber-500 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-300 block mb-1">Verse(s):</label>
                      <input
                        type="text"
                        value={data.content?.verse || "16"}
                        onChange={(e) => updateContent("verse", e.target.value)}
                        placeholder="e.g. 16, 1-4"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-amber-500 font-semibold"
                      />
                    </div>
                  </div>

                  {/* Translation Version */}
                  <div>
                    <label className="text-[11px] text-gray-300 block mb-1">Bible Translation / Version:</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={data.content?.secondaryText || "King James Version (KJV)"}
                        onChange={(e) => updateContent("secondaryText", e.target.value)}
                        placeholder="e.g. King James Version (KJV)"
                        className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {["KJV", "NIV", "ESV", "NKJV", "NLT", "NASB"].map((ver) => (
                        <button
                          key={ver}
                          type="button"
                          onClick={() => updateContent("secondaryText", `${ver} Translation`)}
                          className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-[10px] text-gray-300 rounded border border-gray-700 font-mono"
                        >
                          {ver}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Scripture Verse Text (Multiline) */}
                  <div>
                    <label className="text-[11px] text-gray-300 block mb-1">Scripture Verse Text:</label>
                    <textarea
                      rows={3}
                      value={data.content?.primaryText || ""}
                      onChange={(e) => updateContent("primaryText", e.target.value)}
                      placeholder="Paste or type scripture verse passage here..."
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500 leading-relaxed font-serif"
                    />
                  </div>

                  {/* Header Tag / Label */}
                  <div>
                    <label className="text-[11px] text-gray-300 block mb-1">Header Label / Banner:</label>
                    <input
                      type="text"
                      value={data.content?.label || "HOLY SCRIPTURE"}
                      onChange={(e) => updateContent("label", e.target.value)}
                      placeholder="e.g. HOLY SCRIPTURE, DAILY VERSE, SCRIPTURE OF HOPE"
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-amber-500 uppercase font-mono text-[11px]"
                    />
                  </div>
                </div>
              ) : (
                (() => {
                  // The editor follows the template: only the fields this
                  // layout actually draws are shown, labelled for that layout.
                  const tplId = resolveTemplateId(
                    (data.visualOptions?.templateId as string) || insert.type
                  );
                  const tplDef = TEMPLATE_BY_ID[tplId];
                  const keys = tplDef ? Object.keys(tplDef.content) : ["label", "primaryText", "secondaryText"];
                  const LABELS: Record<string, string> = {
                    label: "Header / category label",
                    primaryText: tplDef?.section === "scripture" ? "Verse text"
                      : tplDef?.section === "quotes" ? "Quote text"
                      : tplDef?.section === "lower_thirds" ? "Name"
                      : "Main text",
                    secondaryText: tplDef?.section === "scripture" ? "Translation / version"
                      : tplDef?.section === "lower_thirds" ? "Role / title / handle"
                      : "Secondary line",
                    author: "Author",
                    book: "Book",
                    chapter: "Chapter",
                    verse: "Verse",
                    number: "Number / figure",
                    item1: "Point 1",
                    item2: "Point 2",
                    item3: "Point 3",
                    item4: "Point 4",
                  };
                  const LONG = new Set(["primaryText"]);
                  const SHORT_ROW = ["book", "chapter", "verse"];
                  const rowKeys = keys.filter((k) => SHORT_ROW.includes(k));
                  const restKeys = keys.filter((k) => !SHORT_ROW.includes(k));

                  return (
                    <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                      {rowKeys.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                          {rowKeys.map((k) => (
                            <div key={k}>
                              <label className="text-xs font-semibold text-white block mb-1">
                                {LABELS[k] || k}:
                              </label>
                              <input
                                type="text"
                                value={(data.content as Record<string, string>)?.[k] || ""}
                                onChange={(e) => updateContent(k, e.target.value)}
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {restKeys.map((k) => (
                        <div key={k}>
                          <label className="text-xs font-semibold text-white block mb-1">
                            {LABELS[k] || k}:
                          </label>
                          {LONG.has(k) ? (
                            <textarea
                              rows={3}
                              value={(data.content as Record<string, string>)?.[k] || ""}
                              onChange={(e) => updateContent(k, e.target.value)}
                              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                            />
                          ) : (
                            <input
                              type="text"
                              value={(data.content as Record<string, string>)?.[k] || ""}
                              onChange={(e) => updateContent(k, e.target.value)}
                              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                            />
                          )}
                        </div>
                      ))}

                      <p className="text-[10px] text-gray-500 pt-1">
                        Colours, fonts, background transparency, border and slide-in motion live in the
                        <span className="text-gray-300 font-semibold"> Design </span> tab.
                      </p>
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {/* TAB: TIMING & TIME WINDOW */}
          {activeTab === "timing" && (
            <div className="space-y-4">
              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-white block mb-1">
                      Start Time (seconds):
                    </label>
                    <input
                      type="number"
                      step={0.5}
                      min={0}
                      max={totalDuration}
                      value={data.startTime}
                      onChange={(e) => setData({ ...data, startTime: Math.max(0, parseFloat(e.target.value) || 0) })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-white block mb-1">
                      Duration (seconds):
                    </label>
                    <input
                      type="number"
                      step={0.5}
                      min={0.5}
                      max={60}
                      value={data.duration}
                      onChange={(e) => setData({ ...data, duration: Math.max(0.5, parseFloat(e.target.value) || 1) })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="pt-2 text-xs text-gray-400 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>Display Window:</span>
                    <span className="font-mono text-indigo-300 font-bold">
                      {data.startTime.toFixed(1)}s — {(data.startTime + data.duration).toFixed(1)}s
                    </span>
                  </div>
                  {isIntroOutro && (
                    <span className="text-[10px] text-amber-400 font-medium">
                      {insert.category === "intro" ? "🎬 Intro Segment" : "🏁 Outro Segment"}
                    </span>
                  )}
                </div>

                {isIntroOutro && (
                  <div className="pt-2 border-t border-gray-700/80">
                    {insert.category === "intro" ? (
                      <button
                        type="button"
                        onClick={() => setData((prev) => ({ ...prev, startTime: 0 }))}
                        className="w-full py-2 px-3 bg-amber-950/70 hover:bg-amber-900 text-amber-200 border border-amber-500/50 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                      >
                        <span>⚡ Snap to Timeline Start (0.0s Before Script)</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setData((prev) => ({
                            ...prev,
                            startTime: Math.max(0, totalDuration - prev.duration),
                          }))
                        }
                        className="w-full py-2 px-3 bg-rose-950/70 hover:bg-rose-900 text-rose-200 border border-rose-500/50 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                      >
                        <span>
                          ⚡ Snap to Timeline End (
                          {Math.max(0, totalDuration - data.duration).toFixed(1)}s After Script)
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-gray-800 flex items-center justify-between bg-gray-950/70">
          <button
            type="button"
            onClick={() => {
              onDelete(data.id);
              onClose();
            }}
            className="px-3.5 py-2 bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/60 rounded-xl text-xs font-medium transition-colors"
          >
            🗑️ Delete Element
          </button>
          <span className="hidden sm:inline text-[10px] text-emerald-400/80 font-medium">
            ● Changes show on the video preview as you edit
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                // edits were applied live — put the element back the way it was
                if (originalRef.current) onUpdate(originalRef.current);
                onClose();
              }}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
