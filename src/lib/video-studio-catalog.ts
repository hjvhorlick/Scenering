import type { InsertCategory, InsertVisualOptions, InsertAudioSettings, AudioSourceType, SceneMotionType } from "../types";
import { BACKGROUND_MUSIC_TRACKS, SOUND_LIBRARY } from "../data/media-library";
import { CTA_PLATFORMS, CTA_GROUPS } from "../data/cta-library";
import { STICKER_LIBRARY, STICKER_GROUPS } from "./sticker-3d";
import { TEXT_TEMPLATES } from "../data/text-templates";
import { VIDEO_FILTERS, FILTER_GROUPS } from "../data/video-filters";

export interface CatalogItem {
  type: string;
  category: InsertCategory;
  name: string;
  icon: string;
  description: string;
  defaultDuration: number;
  defaultPosition: "top" | "bottom" | "center" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
  defaultSize: number;
  defaultAudioSource?: AudioSourceType;
  subCategory?: string;
  videoUrl?: string;
  /** Audio visualisers run for the whole video unless the user trims them */
  spansFullVideo?: boolean;
  defaultVisualOptions?: InsertVisualOptions;
  defaultAudioSettings?: InsertAudioSettings;
  defaultContent?: {
    primaryText?: string;
    secondaryText?: string;
    badgeText?: string;
    book?: string;
    chapter?: string;
    verse?: string;
    author?: string;
    number?: string;
    label?: string;
    items?: string[];
    includeLogo?: boolean;
    showLogo?: boolean;
    videoUrl?: string;
    imageUrl?: string;
    logoUrl?: string;
    logoScale?: number;
    logoPosition?: "center" | "top" | "side";
    tensionStyle?: "countdown" | "flash" | "pulse" | "glitch" | "aperture" | "shimmer" | "warp" | "flare";
    countdownSeconds?: number;
    soundUrl?: string;
    soundVolume?: number;
    reference?: string;
    scriptureText?: string;
    version?: string;
  };
}

// ---------------- 10 MAIN STUDIO CATEGORIES IN EXACT REQUIRED ORDER ----------------
// 1. Logo, 2. Intro, 3. Outro, 4. Call to Action, 5. Stickers, 6. Text Templates, 7. Audio Visualisers, 8. Background Music, 9. Filters, 10. Sound Effects
export interface StudioCategoryDef {
  id: InsertCategory;
  name: string;
  icon: string;
  description: string;
  subcategories?: { id: string; name: string; icon: string }[];
}

export const STUDIO_CATEGORIES: StudioCategoryDef[] = [
  {
    id: "logo",
    name: "Logo",
    icon: "🏷️",
    description: "Upload and place your official brand logo watermark on the video",
  },
  {
    id: "intro",
    name: "Intro",
    icon: "🎬",
    description: "Build the opening moment of your video: a motion background (or your own clip), your title, your logo and an attention-grabbing sound",
  },
  {
    id: "outro",
    name: "Outro",
    icon: "🏁",
    description: "Build the closing moment of your video: a motion background (or your own clip), a sign-off line, your logo and a closing sound",
  },
  {
    id: "call_to_action",
    name: "Call to Action",
    icon: "📣",
    description: "Social-media call-to-action badges for every platform — subscribe, follow, like, message, listen, shop and more. Each badge can be re-worded, re-coloured, resized and dragged anywhere in the video.",
    subcategories: [
      { id: "all", name: "All CTA Badges", icon: "📣" },
      ...CTA_GROUPS.map((g) => ({ id: g.id, name: g.name, icon: g.icon })),
    ],
  },
  {
    id: "stickers",
    name: "Stickers",
    icon: "✨",
    description: "Shaded 3D stickers that spin, bounce and catch the light — reactions, social badges, commerce marks, alerts and objects",
    subcategories: [
      { id: "all", name: "All Stickers", icon: "✨" },
      ...STICKER_GROUPS.map((g) => ({ id: g.id, name: g.name, icon: g.icon })),
    ],
  },
  {
    id: "text_templates",
    name: "Text Templates",
    icon: "📜",
    description: "Scripture, quote and lesson cards — every one adjustable: background colour and transparency, removable border, font, text colour and slide-in motion",
    subcategories: [
      { id: "all", name: "All Templates", icon: "📜" },
      { id: "scripture", name: "Scripture", icon: "📖" },
      { id: "quotes", name: "Quotes", icon: "💬" },
      { id: "lessons", name: "Facts & Lessons", icon: "💡" },
    ],
  },
  {
    id: "lower_thirds",
    name: "Lower Thirds",
    icon: "👤",
    description: "Name and role bars that slide in from the left or right — fully adjustable background, border, font and transparency",
  },
  {
    id: "audio_visualizers",
    name: "Audio Visualisers",
    icon: "📊",
    description: "Waveforms, real-time oscilloscopes, frequency bars, and speech-reactive meters",
    subcategories: [
      { id: "all", name: "All Visualisers", icon: "📊" },
      { id: "waves", name: "Audio Waves & Bars", icon: "〰️" },
      { id: "speech", name: "Speech Reactive", icon: "🎙️" },
    ],
  },
  {
    id: "background_music",
    name: "Background Music",
    icon: "🎵",
    description: "12 royalty-free instrumental tracks — uplifting, joyful, cinematic, lo-fi and classical. No vocals. Selecting a track auto-adds credit to project",
    subcategories: [
      { id: "all", name: "All Tracks", icon: "🎵" },
      { id: "acoustic", name: "Acoustic & Piano", icon: "🎹" },
      { id: "electronic", name: "Beats & Electronic", icon: "⚡" },
      { id: "cinematic", name: "Cinematic & Ambient", icon: "🎬" },
    ],
  },
  {
    id: "filters",
    name: "Filters",
    icon: "🎨",
    description: `${VIDEO_FILTERS.length} cinematic video looks. One click grades the WHOLE video (every scene) with animated atmosphere — dust, mist, sun flare, grain — and full slider control`,
    subcategories: [
      { id: "all", name: `All Looks (${VIDEO_FILTERS.length})`, icon: "🎨" },
      ...FILTER_GROUPS.map((g) => ({ id: g.id, name: g.name, icon: g.icon })),
    ],
  },
  {
    id: "sound_effects",
    name: "Sound Effects",
    icon: "🔊",
    description: "Standalone sound effects and foley. Listen to preview and place directly on the timeline",
    subcategories: [
      { id: "all", name: "All Sounds", icon: "🔊" },
      { id: "ui", name: "Bells & UI Chimes", icon: "🔔" },
      { id: "impact", name: "Whooshes & Pops", icon: "💥" },
      { id: "foley", name: "Camera & Applause", icon: "👏" },
    ],
  },
];

// ---------------- COMPLETE CATALOG ITEMS ----------------
export const CATALOG_ITEMS: Record<string, CatalogItem[]> = {
  logo: [
    {
      type: "customer_logo",
      category: "logo",
      name: "Brand Logo Watermark",
      icon: "🏷️",
      description: "Display your official transparent PNG brand logo with adjustable scale and opacity",
      defaultDuration: 15,
      defaultPosition: "top-right",
      defaultSize: 1.0,
      defaultVisualOptions: { has3DLook: false },
    },
  ],

  // Intro & Outro are no longer catalog lists — they are built in the
  // dedicated Intro / Outro studio (see SectionStudio.tsx) and stored on the
  // project, not as timeline inserts.
  intro: [],
  outro: [],

  call_to_action: CTA_PLATFORMS.map((p) => ({
    type: `cta_${p.id}`,
    category: "call_to_action" as InsertCategory,
    subCategory: p.group,
    name: p.name,
    icon: p.icon,
    description: `${p.primaryText}${p.secondaryText ? " — " + p.secondaryText : ""}`,
    defaultDuration: 8,
    defaultPosition: "bottom" as const,
    defaultSize: 1.0,
    defaultContent: {
      primaryText: p.primaryText,
      secondaryText: p.secondaryText,
      label: p.icon,
      badgeText: p.action,
    },
    defaultVisualOptions: {
      has3DLook: true,
      platform: p.id,
      ctaShape: p.shape || "pill",
      ctaStyle: p.style || "gradient",
      primaryColor: p.primaryColor,
      secondaryColor: p.secondaryColor,
      elevation: 0.45,
      badgeScale: 1.0,
      textScale: 1.0,
      iconScale: 1.0,
      glowIntensity: 0.35,
      animationPreset: "pop_in",
      // A gentle default sway: enough to catch the eye without fighting the
      // narration. Users can switch to bounce/swing/shake in the properties.
      motionPreset: "float",
      motionSpeed: 0.8,
      motionAmount: 0.6,
      motionEntrance: true,
    },
    defaultAudioSettings: {
      soundUrl: p.soundUrl || "/sounds/ting.ogg",
      soundName: "Button Chime",
      volume: 0.9,
    },
  })),

  // Stickers are generated from the 3D sticker library so the catalog and the
  // renderer can never drift apart. Each one ships with the motion that suits
  // its shape; the user can change it in the sticker properties.
  stickers: STICKER_LIBRARY.map((st) => ({
    type: st.id,
    category: "stickers" as InsertCategory,
    subCategory: st.group,
    name: st.name,
    icon: st.icon,
    description: st.blurb,
    defaultDuration: 3.5,
    defaultPosition: "center" as const,
    defaultSize: 1.0,
    defaultVisualOptions: {
      has3DLook: true,
      stickerId: st.id,
      motionPreset: st.defaultMotion,
      motionSpeed: 1,
      motionAmount: 1,
      motionEntrance: true,
      stickerGlow: 0.35,
      shadowIntensity: 0.85,
    } as InsertVisualOptions,
  })),

  content_cards: [
    // Subcategory: lower_third
    {
      type: "person",
      category: "content_cards",
      subCategory: "lower_third",
      name: "Speaker Lower-Third",
      icon: "👤",
      description: "Clean presenter name and job title badge in lower corner",
      defaultDuration: 4.0,
      defaultPosition: "bottom-left",
      defaultSize: 1.0,
      defaultContent: { primaryText: "Dr. Elizabeth Vance", secondaryText: "Lead Astrobiologist, NASA" },
    },
    {
      type: "chapter",
      category: "content_cards",
      subCategory: "lower_third",
      name: "Chapter / Section Title Card",
      icon: "🔖",
      description: "Cinematic full-width title divider for introducing a new section",
      defaultDuration: 4.0,
      defaultPosition: "center",
      defaultSize: 1.0,
      defaultContent: { label: "CHAPTER 2", primaryText: "The Turning Point" },
    },
    {
      type: "location",
      category: "content_cards",
      subCategory: "lower_third",
      name: "Location Card",
      icon: "📍",
      description: "Geographical locator tag for city, country or place",
      defaultDuration: 3.5,
      defaultPosition: "bottom-left",
      defaultSize: 0.9,
      defaultContent: { label: "LOCATION", primaryText: "Kyoto, Japan" },
    },
    // Subcategory: quotes_scripture
    {
      type: "quote",
      category: "content_cards",
      subCategory: "quotes_scripture",
      name: "Quote Frame",
      icon: "💬",
      description: "Elegant typography frame for famous sayings or citations",
      defaultDuration: 5.0,
      defaultPosition: "center",
      defaultSize: 1.0,
      defaultContent: {
        primaryText: "The only limit to our realization of tomorrow is our doubts of today.",
        author: "Franklin D. Roosevelt",
      },
    },
    {
      type: "scripture",
      category: "content_cards",
      subCategory: "quotes_scripture",
      name: "Holy Scripture Frame",
      icon: "📖",
      description: "Dedicated spiritual scripture with book, chapter & verse in golden trim",
      defaultDuration: 6.0,
      defaultPosition: "center",
      defaultSize: 1.0,
      defaultContent: {
        primaryText: "For God so loved the world, that he gave his only begotten Son.",
        book: "John",
        chapter: "3",
        verse: "16",
      },
    },
    // Subcategory: info_cards
    {
      type: "key_point",
      category: "content_cards",
      subCategory: "info_cards",
      name: "Key Takeaway Frame",
      icon: "💡",
      description: "Highlights the central point or moral from narration",
      defaultDuration: 4.5,
      defaultPosition: "bottom",
      defaultSize: 1.0,
      defaultContent: {
        label: "KEY TAKEAWAY",
        primaryText: "Consistency compounds faster than occasional intensity.",
      },
    },
    {
      type: "fact",
      category: "content_cards",
      subCategory: "info_cards",
      name: "Did You Know? Fact Card",
      icon: "🧠",
      description: "Fascinating educational fact callout frame",
      defaultDuration: 5.0,
      defaultPosition: "top",
      defaultSize: 1.0,
      defaultContent: {
        label: "DID YOU KNOW?",
        primaryText: "Honey found in ancient Egyptian tombs is still perfectly edible after 3,000 years.",
      },
    },
    {
      type: "definition",
      category: "content_cards",
      subCategory: "info_cards",
      name: "Definition Frame",
      icon: "📚",
      description: "Explains an uncommon word, term or technical concept",
      defaultDuration: 5.0,
      defaultPosition: "center",
      defaultSize: 1.0,
      defaultContent: {
        label: "DEFINITION",
        primaryText: "Serendipity",
        secondaryText: "The occurrence of events by chance in a happy or beneficial way.",
      },
    },
    {
      type: "training",
      category: "content_cards",
      subCategory: "info_cards",
      name: "Training / Lesson Step",
      icon: "🎓",
      description: "Structured step-by-step instruction or lesson card",
      defaultDuration: 5.5,
      defaultPosition: "center",
      defaultSize: 1.0,
      defaultContent: {
        label: "STEP 1 OF 3",
        primaryText: "Calibrate your baseline and inspect all inputs thoroughly.",
      },
    },
    {
      type: "stats",
      category: "content_cards",
      subCategory: "info_cards",
      name: "Statistics Highlight",
      icon: "📈",
      description: "Large dynamic metric counter highlighting data",
      defaultDuration: 4.5,
      defaultPosition: "center",
      defaultSize: 1.0,
      defaultContent: { number: "84%", primaryText: "of users report higher satisfaction within 14 days" },
    },
  ],

  audio_visualizers: [
    // Subcategory: waves — every linear rack stretches edge to edge by default
    {
      type: "spectrum",
      category: "audio_visualizers",
      subCategory: "waves",
      name: "Prism Spectrum Bars",
      icon: "🌈",
      description: "Full-spectrum rainbow analyser. Long bars run the entire width of the frame and dance with every kick, note and syllable",
      defaultDuration: 8.0,
      defaultPosition: "bottom",
      defaultSize: 1.0,
      defaultAudioSource: "music",
      spansFullVideo: true,
      defaultVisualOptions: { fullWidth: true, barThickness: 13, glowIntensity: 0.9, has3DLook: true, floatShadow: true },
    },
    {
      type: "equalizer_bars",
      category: "audio_visualizers",
      subCategory: "waves",
      name: "Studio LED Equalizer",
      icon: "📶",
      description: "Broadcast-grade 3D level rack with glass plate, specular bars and white peak caps riding every transient",
      defaultDuration: 8.0,
      defaultPosition: "bottom",
      defaultSize: 1.0,
      defaultAudioSource: "music",
      spansFullVideo: true,
      defaultVisualOptions: { fullWidth: true, barThickness: 14, glowIntensity: 0.8, has3DLook: true, primaryColor: "#22d3ee", secondaryColor: "#a855f7", floatShadow: true },
    },
    {
      type: "led_meter_wall",
      category: "audio_visualizers",
      subCategory: "waves",
      name: "LED Meter Wall",
      icon: "🎚️",
      description: "Studio LED wall of segmented meters across the whole frame — each segment lights up as the music builds",
      defaultDuration: 8.0,
      defaultPosition: "bottom",
      defaultSize: 1.0,
      defaultAudioSource: "music",
      spansFullVideo: true,
      defaultVisualOptions: { fullWidth: true, barThickness: 16, glowIntensity: 0.8, has3DLook: true, primaryColor: "#22c55e", secondaryColor: "#facc15", floatShadow: true },
    },
    {
      type: "neon_ribbon",
      category: "audio_visualizers",
      subCategory: "waves",
      name: "Neon Ribbon Wave",
      icon: "🎗️",
      description: "Smooth glowing ribbon that ripples wall to wall with a mirrored ghost trace and soft bloom — the modern audio waveform",
      defaultDuration: 8.0,
      defaultPosition: "bottom",
      defaultSize: 1.0,
      defaultAudioSource: "voice",
      spansFullVideo: true,
      defaultVisualOptions: { fullWidth: true, barThickness: 11, glowIntensity: 0.9, has3DLook: true, primaryColor: "#38bdf8", secondaryColor: "#c084fc", floatShadow: true },
    },
    {
      type: "waveform",
      category: "audio_visualizers",
      subCategory: "waves",
      name: "Acoustic Waveform",
      icon: "〰️",
      description: "Continuous acoustic wave spanning the scene, drawn from the real voice trace with a hot white core and neon bloom",
      defaultDuration: 8.0,
      defaultPosition: "bottom",
      defaultSize: 1.0,
      defaultAudioSource: "voice",
      spansFullVideo: true,
      defaultVisualOptions: { fullWidth: true, barThickness: 9, glowIntensity: 0.85, has3DLook: true, primaryColor: "#38bdf8", secondaryColor: "#22d3ee", floatShadow: true },
    },
    {
      type: "mirror_wave",
      category: "audio_visualizers",
      subCategory: "waves",
      name: "Mirror Bar Wave",
      icon: "🪞",
      description: "Symmetrical dual wave mirrored around a glowing spine, filling the full width with gradient 3D bars",
      defaultDuration: 8.0,
      defaultPosition: "bottom",
      defaultSize: 1.0,
      defaultAudioSource: "music",
      spansFullVideo: true,
      defaultVisualOptions: { fullWidth: true, barThickness: 12, glowIntensity: 0.8, has3DLook: true, primaryColor: "#06b6d4", secondaryColor: "#f43f5e", floatShadow: true },
    },
    {
      type: "dot_matrix_eq",
      category: "audio_visualizers",
      subCategory: "waves",
      name: "Dot Matrix Equalizer",
      icon: "🔵",
      description: "Retro-modern dot grid where each column lights dot by dot as the frequencies rise — crisp, fun and very reactive",
      defaultDuration: 8.0,
      defaultPosition: "bottom",
      defaultSize: 1.0,
      defaultAudioSource: "music",
      spansFullVideo: true,
      defaultVisualOptions: { fullWidth: true, barThickness: 12, glowIntensity: 0.8, has3DLook: true, primaryColor: "#22d3ee", secondaryColor: "#e879f9", floatShadow: true },
    },
    {
      type: "oscilloscope",
      category: "audio_visualizers",
      subCategory: "waves",
      name: "CRT Oscilloscope",
      icon: "⚡",
      description: "True oscilloscope screen showing the live voice trace with phosphor bloom, graticule and a travelling sweep bar",
      defaultDuration: 8.0,
      defaultPosition: "bottom",
      defaultSize: 1.0,
      defaultAudioSource: "voice",
      spansFullVideo: true,
      defaultVisualOptions: { fullWidth: true, barThickness: 9, glowIntensity: 0.85, has3DLook: true, primaryColor: "#10b981", secondaryColor: "#34d399", floatShadow: true },
    },
    {
      type: "circular_wave",
      category: "audio_visualizers",
      subCategory: "waves",
      name: "Circular Frequency Wave",
      icon: "⭕",
      description: "Orbital analyser with 64 radial bars, a glowing hub and a rotating sweep that throbs on the beat",
      defaultDuration: 8.0,
      defaultPosition: "center",
      defaultSize: 1.0,
      defaultAudioSource: "music",
      spansFullVideo: true,
      defaultVisualOptions: { fullWidth: false, glowIntensity: 0.9, has3DLook: true, primaryColor: "#38bdf8", secondaryColor: "#f43f5e", floatShadow: true },
    },
    // Subcategory: speech
    {
      type: "speech_spectrum",
      category: "audio_visualizers",
      subCategory: "speech",
      name: "Speech Formant Spectrum",
      icon: "🎙️",
      description: "Formant-focused bars across the full width that rise on syllables and settle in the pauses",
      defaultDuration: 8.0,
      defaultPosition: "bottom",
      defaultSize: 0.9,
      defaultAudioSource: "voice",
      spansFullVideo: true,
      defaultVisualOptions: { fullWidth: true, barThickness: 13, glowIntensity: 0.8, has3DLook: true, primaryColor: "#8b5cf6", secondaryColor: "#ec4899", floatShadow: true },
    },
    {
      type: "voice_pulse",
      category: "audio_visualizers",
      subCategory: "speech",
      name: "Voice Dialogue Pulse",
      icon: "🔊",
      description: "Concentric 3D rings that expand with each spoken syllable and flare brighter as the voice lifts",
      defaultDuration: 6.0,
      defaultPosition: "center",
      defaultSize: 1.0,
      defaultAudioSource: "voice",
      spansFullVideo: true,
      defaultVisualOptions: { fullWidth: false, glowIntensity: 0.9, has3DLook: true, primaryColor: "#38bdf8", secondaryColor: "#f43f5e", floatShadow: true },
    },
    {
      type: "energy_ring",
      category: "audio_visualizers",
      subCategory: "speech",
      name: "Energy Speech Ring",
      icon: "💍",
      description: "Luminous ring that breathes with the narration, radiating expanding halos with a pulsing core",
      defaultDuration: 6.0,
      defaultPosition: "center",
      defaultSize: 1.0,
      defaultAudioSource: "voice",
      spansFullVideo: true,
      defaultVisualOptions: { fullWidth: false, glowIntensity: 0.95, has3DLook: true, primaryColor: "#f43f5e", secondaryColor: "#fb923c", floatShadow: true },
    },
    {
      type: "minimal_voice",
      category: "audio_visualizers",
      subCategory: "speech",
      name: "Minimal Talking Dots",
      icon: "🗣️",
      description: "Four modern AI talking dots — glossy 3D spheres that bounce and stretch into pills while the voice speaks",
      defaultDuration: 6.0,
      defaultPosition: "bottom-right",
      defaultSize: 0.8,
      defaultAudioSource: "voice",
      spansFullVideo: true,
      defaultVisualOptions: { fullWidth: false, glowIntensity: 0.7, has3DLook: true, floatShadow: true },
    },
  ],

  // Text templates are generated from the template library so the catalog,
  // the renderer and the properties panel can never drift apart. Lower thirds
  // are their own category (see below).
  text_templates: TEXT_TEMPLATES.filter((t) => t.section !== "lower_thirds").map((t) => ({
    type: t.id,
    category: "text_templates" as InsertCategory,
    subCategory: t.section,
    name: t.name,
    icon: t.icon,
    description: t.blurb,
    defaultDuration: t.defaultDuration,
    defaultPosition: t.defaultPosition,
    defaultSize: 1.0,
    defaultContent: { ...t.content },
    defaultVisualOptions: {
      templateId: t.id,
      primaryColor: t.style.accentColor,
      secondaryColor: t.style.bgColor,
    } as InsertVisualOptions,
  })),

  // Lower Thirds: their own section, all with slide-in motion
  lower_thirds: TEXT_TEMPLATES.filter((t) => t.section === "lower_thirds").map((t) => ({
    type: t.id,
    category: "lower_thirds" as InsertCategory,
    subCategory: "lower_thirds",
    name: t.name,
    icon: t.icon,
    description: t.blurb,
    defaultDuration: t.defaultDuration,
    defaultPosition: t.defaultPosition,
    defaultSize: 1.0,
    defaultContent: { ...t.content },
    defaultVisualOptions: {
      templateId: t.id,
      primaryColor: t.style.accentColor,
      secondaryColor: t.style.bgColor,
    } as InsertVisualOptions,
  })),

  // Background Music tracks (soft relaxing instrumental tracks, no singing, auto credit)
  background_music: BACKGROUND_MUSIC_TRACKS.map((t) => ({
    type: `bgm_${t.id}`,
    category: "background_music" as InsertCategory,
    subCategory: t.mood || "acoustic",
    name: t.name,
    icon: "🎵",
    description: `${t.genre} • ${Math.floor(t.duration / 60)}:${String(t.duration % 60).padStart(2, "0")} • License: Free / ${t.license}`,
    defaultDuration: t.duration,
    defaultPosition: "bottom" as const,
    defaultSize: 1.0,
    defaultAudioSettings: {
      soundUrl: t.url,
      soundName: t.name,
      volume: 0.5,
      loop: true,
    },
    defaultContent: {
      primaryText: t.name,
      secondaryText: `${t.author} — ${t.creditText}`,
      label: t.genre,
    },
  })),

  // Filters are NOT timeline inserts any more — they are a single project-wide
  // look configured in the Video Studio "Filters" tab (see FiltersStudio.tsx).
  filters: [],

  // Standalone Sound Effects
  sound_effects: SOUND_LIBRARY.map((s) => ({
    type: `sfx_${s.id}`,
    category: "sound_effects" as InsertCategory,
    subCategory: s.category === "bell" ? "ui" : s.category === "cinematic" ? "impact" : "foley",
    name: s.name,
    icon: s.category === "bell" ? "🔔" : s.category === "cinematic" ? "💥" : s.category === "ui" ? "✨" : "🔊",
    description: `${s.category.toUpperCase()} • ${s.duration}s duration • Crisp royalty-free studio sound effect`,
    defaultDuration: s.duration,
    defaultPosition: "bottom" as const,
    defaultSize: 1.0,
    defaultAudioSettings: {
      soundUrl: s.url,
      soundName: s.name,
      volume: 0.9,
      loop: false,
    },
    defaultContent: {
      primaryText: s.name,
      label: s.category,
    },
  })),
};

// Aliases for backwards compatibility with any existing items
CATALOG_ITEMS.speech_reactive = CATALOG_ITEMS.audio_visualizers;
CATALOG_ITEMS.meditation = CATALOG_ITEMS.audio_visualizers;
CATALOG_ITEMS.content_cards = CATALOG_ITEMS.text_templates;
CATALOG_ITEMS.other_cards = CATALOG_ITEMS.text_templates;
CATALOG_ITEMS.branding = CATALOG_ITEMS.logo;

export const SCENE_MOTIONS: { id: SceneMotionType; name: string; desc: string }[] = [
  { id: "none", name: "Static (No Motion)", desc: "Fixed still frame without movement" },
  { id: "slow_zoom", name: "Slow Zoom In", desc: "Gentle cinematic push towards subject" },
  { id: "pan_left", name: "Pan Left", desc: "Smooth horizontal glide across the frame" },
  { id: "pan_right", name: "Pan Right", desc: "Smooth horizontal sweep to the right" },
  { id: "ken_burns", name: "Ken Burns Classic", desc: "Subtle diagonal pan & zoom documentary motion" },
];
