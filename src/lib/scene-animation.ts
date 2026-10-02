import type {
  Scene,
  SceneAnimationColorPalette,
  SceneAnimationConfig,
  SceneAnimationDirection,
  SceneAnimationEffect,
  SceneAnimationRegion,
  SceneMotionType,
} from "../types";
import { applyMotionIntensity, getMotionTransform } from "./render-effects";

export type SceneAnimationCategory =
  | "weather"
  | "sky"
  | "water"
  | "nature"
  | "particles"
  | "fire_smoke"
  | "steam"
  | "mystical"
  | "lighting";

export type SceneAnimationLayer =
  | "background"
  | "water"
  | "atmosphere"
  | "weather"
  | "nature"
  | "foreground"
  | "lighting";

export type SceneAnimationControl =
  | "intensity"
  | "speed"
  | "opacity"
  | "direction"
  | "size"
  | "density"
  | "amount"
  | "color"
  | "bloom"
  | "afterglow"
  | "trail"
  | "region"
  | "origin";

export interface SceneAnimationVariant {
  id: string;
  label: string;
}

export interface SceneAnimationEffectDefinition {
  type: string;
  label: string;
  icon: string;
  category: SceneAnimationCategory;
  layer: SceneAnimationLayer;
  description: string;
  variants?: SceneAnimationVariant[];
  controls: SceneAnimationControl[];
  defaults?: Partial<SceneAnimationEffect>;
}

export interface SceneAnimationPreset {
  id: string;
  label: string;
  description: string;
  icon: string;
  camera?: Partial<SceneAnimationConfig["camera"]>;
  effects: Array<Pick<SceneAnimationEffect, "type" | "variant"> & Partial<SceneAnimationEffect>>;
}

export interface SceneAnimationLibraryGroup {
  id: string;
  label: string;
  icon: string;
  description: string;
  effects: string[];
  /** Presets that start users inside this group without replacing manual editing. */
  presetIds?: string[];
}

export interface SceneAnimationLibrarySection {
  id: string;
  label: string;
  icon: string;
  description: string;
  groups: SceneAnimationLibraryGroup[];
}

export const DEFAULT_SCENE_ANIMATION_CAMERA = {
  motion: "none" as SceneMotionType,
  speed: 0.45,
  intensity: 0.55,
};

export const DEFAULT_SCENE_ANIMATION_REGION: SceneAnimationRegion = { x: 0, y: 0, w: 1, h: 1 };

export const SCENE_ANIMATION_CATEGORIES: Array<{
  id: SceneAnimationCategory;
  label: string;
  icon: string;
  hint: string;
}> = [
  { id: "weather", label: "Weather", icon: "🌧", hint: "Rain, snow, fog, lightning and wind." },
  { id: "sky", label: "Clouds & Sky", icon: "☁️", hint: "Cloud drift, stars, meteors, aurora and sky glows." },
  { id: "water", label: "Water", icon: "🌊", hint: "Ripples, shimmer, flow, waves and water mist." },
  { id: "nature", label: "Nature", icon: "🕊", hint: "Birds, insects, leaves, petals and organic motion." },
  { id: "particles", label: "Particles", icon: "✨", hint: "Dust, pollen, embers, haze and cinematic particles." },
  { id: "fire_smoke", label: "Fire & Smoke", icon: "🔥", hint: "Flame, smoke, sparks, embers and firelight." },
  { id: "steam", label: "Steam", icon: "♨️", hint: "Coffee, tea, food and general vapor." },
  { id: "mystical", label: "Mystical", icon: "🔮", hint: "Golden signs, runes, orbs, portals and reactive mid-air magic." },
  { id: "lighting", label: "Lighting", icon: "🔆", hint: "Rays, beams, flares, shadows and illumination." },
];

export const SCENE_ANIMATION_COLOR_PALETTES: Array<{
  id: SceneAnimationColorPalette;
  label: string;
  description: string;
  rgb: [number, number, number];
  glow: string;
  swatch: string;
  /** Gold/silver are rendered with extra banded reflections and sweeping highlights. */
  metallic?: boolean;
}> = [
  {
    id: "natural",
    label: "Original",
    description: "Keep the effect's designed colours.",
    rgb: [255, 255, 255],
    glow: "rgba(255,255,255,0.55)",
    swatch: "linear-gradient(135deg,#e5e7eb,#f59e0b)",
  },
  {
    id: "gold",
    label: "Chrome Gold",
    description: "Mirror-like metallic gold with bright reflection sweeps.",
    rgb: [255, 205, 84],
    glow: "rgba(255,205,84,0.78)",
    swatch: "linear-gradient(135deg,#2f1b05 0%,#fff7ad 18%,#f59e0b 38%,#7c2d12 52%,#ffe680 70%,#b45309 100%)",
    metallic: true,
  },
  {
    id: "silver",
    label: "Chrome Silver",
    description: "Mirror-like chrome silver with white specular streaks.",
    rgb: [218, 232, 255],
    glow: "rgba(218,232,255,0.74)",
    swatch: "linear-gradient(135deg,#111827 0%,#ffffff 16%,#94a3b8 34%,#0f172a 50%,#f8fafc 68%,#64748b 100%)",
    metallic: true,
  },
  {
    id: "neon_blue",
    label: "Neon Blue",
    description: "Electric blue glow for futuristic or energetic scenes.",
    rgb: [80, 170, 255],
    glow: "rgba(80,170,255,0.82)",
    swatch: "linear-gradient(135deg,#93c5fd,#2563eb,#0f172a)",
  },
  {
    id: "neon_cyan",
    label: "Neon Cyan",
    description: "Bright cyan for clean tech, space and water energy.",
    rgb: [80, 245, 255],
    glow: "rgba(80,245,255,0.8)",
    swatch: "linear-gradient(135deg,#a5f3fc,#06b6d4,#0f172a)",
  },
  {
    id: "neon_purple",
    label: "Neon Purple",
    description: "Violet neon for mystical and meditation visuals.",
    rgb: [185, 120, 255],
    glow: "rgba(185,120,255,0.82)",
    swatch: "linear-gradient(135deg,#e9d5ff,#8b5cf6,#1e1b4b)",
  },
  {
    id: "neon_pink",
    label: "Neon Pink",
    description: "Hot pink glow for bold sparkle and fantasy effects.",
    rgb: [255, 92, 190],
    glow: "rgba(255,92,190,0.82)",
    swatch: "linear-gradient(135deg,#fbcfe8,#ec4899,#500724)",
  },
  {
    id: "neon_green",
    label: "Neon Green",
    description: "Luminous green for energy, nature magic and sci-fi.",
    rgb: [120, 255, 135],
    glow: "rgba(120,255,135,0.8)",
    swatch: "linear-gradient(135deg,#bbf7d0,#22c55e,#052e16)",
  },
  {
    id: "neon_orange",
    label: "Neon Orange",
    description: "Hot orange for fire, power and dramatic motivation.",
    rgb: [255, 142, 60],
    glow: "rgba(255,142,60,0.8)",
    swatch: "linear-gradient(135deg,#fed7aa,#f97316,#431407)",
  },
];

export const SCENE_ANIMATION_CAMERA_OPTIONS: Array<{
  id: SceneMotionType;
  label: string;
  icon: string;
  description: string;
}> = [
  { id: "none", label: "None", icon: "⏹", description: "No camera movement for this scene." },
  { id: "slow_zoom", label: "Slow Zoom In", icon: "➕", description: "A gentle cinematic push toward the subject." },
  { id: "zoom_out", label: "Slow Zoom Out", icon: "➖", description: "A slow reveal that opens the scene outward." },
  { id: "pan_left", label: "Pan Left", icon: "←", description: "A steady lateral camera slide." },
  { id: "pan_right", label: "Pan Right", icon: "→", description: "A steady lateral camera slide." },
  { id: "pan_up", label: "Pan Up", icon: "↑", description: "A vertical move toward the top of the frame." },
  { id: "pan_down", label: "Pan Down", icon: "↓", description: "A vertical move toward the bottom of the frame." },
  { id: "zoom_pan", label: "Zoom + Pan", icon: "↗", description: "Pushes in while drifting across the image." },
  { id: "cinematic_drift", label: "Slow Cinematic Drift", icon: "〰", description: "Subtle floating camera movement with no hard stops." },
  { id: "ken_burns", label: "Ken Burns Classic", icon: "🎥", description: "The familiar documentary push-and-drift motion." },
];

const full: SceneAnimationRegion = { x: 0, y: 0, w: 1, h: 1 };
const sky: SceneAnimationRegion = { x: 0, y: 0, w: 1, h: 0.48 };
const lower: SceneAnimationRegion = { x: 0, y: 0.55, w: 1, h: 0.4 };
const horizon: SceneAnimationRegion = { x: 0, y: 0.42, w: 1, h: 0.35 };
const mid: SceneAnimationRegion = { x: 0, y: 0.18, w: 1, h: 0.64 };
const bottom: SceneAnimationRegion = { x: 0, y: 0.62, w: 1, h: 0.36 };
// A focused column above a cup/mug so vapor doesn't smear across the whole frame.
const cupSteamRegion: SceneAnimationRegion = { x: 0.26, y: 0.1, w: 0.48, h: 0.74 };

const v = (...labels: string[]): SceneAnimationVariant[] =>
  labels.map((label) => ({
    id: label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, ""),
    label,
  }));

const effect = (definition: SceneAnimationEffectDefinition): SceneAnimationEffectDefinition => definition;

export const SCENE_ANIMATION_EFFECTS: SceneAnimationEffectDefinition[] = [
  // Weather
  effect({
    type: "rain",
    label: "Rain",
    icon: "🌧",
    category: "weather",
    layer: "weather",
    description: "Layered rain streaks with natural variation and wind-aware direction.",
    variants: v("Light Rain", "Medium Rain", "Heavy Rain"),
    controls: ["intensity", "speed", "direction", "opacity", "density"],
    defaults: { variant: "light_rain", intensity: 0.38, speed: 0.58, opacity: 0.5, density: 0.45, direction: "down-right" },
  }),
  effect({
    type: "snow",
    label: "Snow",
    icon: "❄️",
    category: "weather",
    layer: "weather",
    description: "Soft falling flakes with size, speed and wind drift controls.",
    variants: v("Light Snow", "Normal Snow", "Heavy Snow", "Blizzard"),
    controls: ["amount", "speed", "direction", "size", "opacity", "density"],
    defaults: { variant: "light_snow", amount: 0.35, speed: 0.32, direction: "down-left", size: 0.45, opacity: 0.72, density: 0.42 },
  }),
  effect({
    type: "lightning",
    label: "Lightning",
    icon: "⚡",
    category: "weather",
    layer: "lighting",
    description: "Randomized bolts and environmental flashes rather than a static overlay.",
    variants: v("Occasional Lightning", "Frequent Lightning", "Distant Lightning"),
    controls: ["intensity", "speed", "opacity", "region"],
    defaults: { variant: "occasional_lightning", intensity: 0.5, speed: 0.35, opacity: 0.8, region: sky },
  }),
  effect({
    type: "fog",
    label: "Fog",
    icon: "🌫",
    category: "weather",
    layer: "atmosphere",
    description: "Soft volumetric fog bands drifting through the image.",
    variants: v("Light Fog", "Dense Fog", "Ground Fog"),
    controls: ["density", "speed", "direction", "opacity", "region"],
    defaults: { variant: "light_fog", density: 0.42, speed: 0.18, direction: "left", opacity: 0.36, region: mid },
  }),
  effect({
    type: "mist",
    label: "Mist",
    icon: "💨",
    category: "weather",
    layer: "atmosphere",
    description: "Low drifting mist for water, valleys and landscape scenes.",
    variants: v("Light Mist", "Lake Mist", "Ground Mist"),
    controls: ["density", "speed", "direction", "opacity", "region"],
    defaults: { variant: "light_mist", density: 0.36, speed: 0.16, direction: "right", opacity: 0.34, region: horizon },
  }),
  effect({
    type: "wind",
    label: "Wind",
    icon: "🍃",
    category: "weather",
    layer: "background",
    description: "Invisible force that bends rain, snow, mist, leaves and particles.",
    variants: v("Gentle Wind", "Breezy", "Strong Wind"),
    controls: ["intensity", "speed", "direction"],
    defaults: { variant: "gentle_wind", intensity: 0.35, speed: 0.35, direction: "right" },
  }),

  // Clouds and sky
  effect({
    type: "moving_clouds",
    label: "Slow Moving Clouds",
    icon: "☁️",
    category: "sky",
    layer: "background",
    description: "Soft cloud forms that slide subtly through the sky without replacing it.",
    variants: v("Slow Moving Clouds", "Fast Moving Clouds", "Thin Cloud Movement"),
    controls: ["intensity", "speed", "direction", "opacity", "region"],
    defaults: { variant: "slow_moving_clouds", intensity: 0.35, speed: 0.2, direction: "right", opacity: 0.32, region: sky },
  }),
  effect({
    type: "storm_clouds",
    label: "Storm Clouds",
    icon: "🌩",
    category: "sky",
    layer: "background",
    description: "Dark layered clouds with slow, heavy movement.",
    variants: v("Storm Clouds", "Distant Storm", "Rolling Storm"),
    controls: ["intensity", "speed", "direction", "opacity", "region"],
    defaults: { variant: "storm_clouds", intensity: 0.55, speed: 0.28, direction: "left", opacity: 0.42, region: sky },
  }),
  effect({
    type: "cloud_shadows",
    label: "Cloud Shadows",
    icon: "◐",
    category: "sky",
    layer: "lighting",
    description: "Slow shadow bands crossing the frame as clouds pass overhead.",
    variants: v("Cloud Shadows", "Soft Cloud Shadows"),
    controls: ["intensity", "speed", "direction", "opacity"],
    defaults: { intensity: 0.38, speed: 0.18, direction: "right", opacity: 0.28 },
  }),
  effect({
    type: "sunset_glow",
    label: "Sunset Glow",
    icon: "🌇",
    category: "sky",
    layer: "lighting",
    description: "Warm horizon glow that gently breathes over time.",
    variants: v("Sunset Glow", "Amber Horizon"),
    controls: ["intensity", "opacity", "origin"],
    defaults: { intensity: 0.42, opacity: 0.34, origin: { x: 0.5, y: 0.38 } },
  }),
  effect({
    type: "sunrise_glow",
    label: "Sunrise Glow",
    icon: "🌅",
    category: "sky",
    layer: "lighting",
    description: "Soft golden-pink morning light near the horizon.",
    variants: v("Sunrise Glow", "Soft Dawn"),
    controls: ["intensity", "opacity", "origin"],
    defaults: { intensity: 0.38, opacity: 0.32, origin: { x: 0.45, y: 0.36 } },
  }),
  effect({
    type: "stars",
    label: "Stars Appearing",
    icon: "⭐",
    category: "sky",
    layer: "background",
    description: "Tiny twinkling stars that fade in and out organically.",
    variants: v("Stars Appearing", "Subtle Stars", "Dense Stars"),
    controls: ["amount", "speed", "opacity", "size", "region"],
    defaults: { amount: 0.35, speed: 0.22, opacity: 0.65, size: 0.35, region: sky },
  }),
  effect({
    type: "shooting_star",
    label: "Shooting Star",
    icon: "☄️",
    category: "sky",
    layer: "lighting",
    description: "A rare streak with a fading trail across the sky.",
    variants: v("Shooting Star", "Rare Shooting Star"),
    controls: ["speed", "opacity", "direction", "region"],
    defaults: { speed: 0.48, opacity: 0.82, direction: "down-right", region: sky },
  }),
  effect({
    type: "meteor",
    label: "Meteor",
    icon: "☄",
    category: "sky",
    layer: "lighting",
    description: "A brighter atmospheric streak with a warm glowing tail.",
    variants: v("Meteor", "Bright Meteor"),
    controls: ["intensity", "speed", "opacity", "direction", "region"],
    defaults: { intensity: 0.55, speed: 0.62, opacity: 0.9, direction: "down-left", region: sky },
  }),
  effect({
    type: "aurora",
    label: "Aurora",
    icon: "🟢",
    category: "sky",
    layer: "lighting",
    description: "Slow translucent aurora ribbons for night and arctic scenes.",
    variants: v("Aurora", "Soft Aurora"),
    controls: ["intensity", "speed", "opacity", "region"],
    defaults: { intensity: 0.42, speed: 0.18, opacity: 0.38, region: { x: 0, y: 0.05, w: 1, h: 0.42 } },
  }),

  // Water
  effect({
    type: "water_ripples",
    label: "Gentle Lake Ripples",
    icon: "〰",
    category: "water",
    layer: "water",
    description: "Subtle surface ripple lines restricted to a water region by default.",
    variants: v("Gentle Lake Ripples", "Rain Ripples", "Wide Ripples"),
    controls: ["intensity", "speed", "direction", "opacity", "region"],
    defaults: { variant: "gentle_lake_ripples", intensity: 0.38, speed: 0.32, direction: "right", opacity: 0.38, region: lower },
  }),
  effect({
    type: "river_flow",
    label: "River Flow",
    icon: "🌊",
    category: "water",
    layer: "water",
    description: "Directional flow streaks that make rivers and streams feel alive.",
    variants: v("River Flow", "Fast River Flow"),
    controls: ["intensity", "speed", "direction", "opacity", "region"],
    defaults: { intensity: 0.42, speed: 0.5, direction: "right", opacity: 0.34, region: lower },
  }),
  effect({
    type: "ocean_waves",
    label: "Ocean Waves",
    icon: "🌊",
    category: "water",
    layer: "water",
    description: "Layered wave bands with breathing highlights.",
    variants: v("Ocean Waves", "Small Waves", "Sea Spray"),
    controls: ["intensity", "speed", "direction", "opacity", "region"],
    defaults: { intensity: 0.48, speed: 0.38, direction: "left", opacity: 0.38, region: lower },
  }),
  effect({
    type: "waterfall_movement",
    label: "Waterfall Movement",
    icon: "💧",
    category: "water",
    layer: "water",
    description: "Vertical shimmering streaks for falls and cascades.",
    variants: v("Waterfall Movement", "Soft Cascade"),
    controls: ["intensity", "speed", "opacity", "region"],
    defaults: { intensity: 0.48, speed: 0.58, opacity: 0.42, region: { x: 0.35, y: 0.18, w: 0.3, h: 0.62 } },
  }),
  effect({
    type: "water_shimmer",
    label: "Water Surface Shimmer",
    icon: "✨",
    category: "water",
    layer: "water",
    description: "Tiny moving highlights on reflective water surfaces.",
    variants: v("Water Surface Shimmer", "Reflection Shimmer", "Moving Reflection"),
    controls: ["intensity", "speed", "opacity", "region"],
    defaults: { intensity: 0.42, speed: 0.36, opacity: 0.42, region: lower },
  }),
  effect({
    type: "water_mist",
    label: "Water Mist",
    icon: "🌫",
    category: "water",
    layer: "atmosphere",
    description: "Low mist sitting over lakes, rivers and waterfalls.",
    variants: v("Water Mist", "Lake Mist", "Sea Spray Mist"),
    controls: ["density", "speed", "direction", "opacity", "region"],
    defaults: { density: 0.38, speed: 0.2, direction: "right", opacity: 0.36, region: horizon },
  }),
  effect({
    type: "floating_leaves",
    label: "Floating Leaves",
    icon: "🍂",
    category: "water",
    layer: "foreground",
    description: "Small leaves or floating objects drifting over water.",
    variants: v("Floating Leaves", "Floating Objects"),
    controls: ["amount", "speed", "direction", "size", "opacity", "region"],
    defaults: { amount: 0.3, speed: 0.25, direction: "right", size: 0.35, opacity: 0.56, region: lower },
  }),

  // Nature
  effect({
    type: "birds",
    label: "Birds",
    icon: "🕊",
    category: "nature",
    layer: "nature",
    description: "Distant bird silhouettes crossing the sky with varied flight paths.",
    variants: v("Birds", "Three Birds", "Distant Birds"),
    controls: ["amount", "speed", "direction", "size", "opacity", "region"],
    defaults: { variant: "three_birds", amount: 0.28, speed: 0.34, direction: "right", size: 0.34, opacity: 0.72, region: sky },
  }),
  effect({
    type: "bird_flock",
    label: "Flock of Birds",
    icon: "🐦",
    category: "nature",
    layer: "nature",
    description: "A looser group of birds with staggered positions and speeds.",
    variants: v("Flock of Birds", "Large Flock"),
    controls: ["amount", "speed", "direction", "size", "opacity", "region"],
    defaults: { amount: 0.48, speed: 0.32, direction: "left", size: 0.26, opacity: 0.64, region: sky },
  }),
  effect({
    type: "butterflies",
    label: "Butterflies",
    icon: "🦋",
    category: "nature",
    layer: "nature",
    description: "Small fluttering silhouettes with organic bobbing paths.",
    variants: v("Butterflies", "Dragonflies", "Bees"),
    controls: ["amount", "speed", "direction", "size", "opacity", "region"],
    defaults: { amount: 0.32, speed: 0.35, direction: "right", size: 0.38, opacity: 0.66, region: mid },
  }),
  effect({
    type: "fireflies",
    label: "Fireflies",
    icon: "🟡",
    category: "nature",
    layer: "foreground",
    description: "Tiny glowing insects pulsing in the foreground.",
    variants: v("Fireflies", "Sparse Fireflies", "Enchanted Fireflies"),
    controls: ["amount", "speed", "size", "opacity", "region"],
    defaults: { amount: 0.38, speed: 0.26, size: 0.42, opacity: 0.68, region: mid },
  }),
  effect({
    type: "falling_leaves",
    label: "Falling Leaves",
    icon: "🍁",
    category: "nature",
    layer: "foreground",
    description: "Leaves falling with wind-aware drift and size variation.",
    variants: v("Falling Leaves", "Autumn Leaves"),
    controls: ["amount", "speed", "direction", "size", "opacity", "region"],
    defaults: { amount: 0.36, speed: 0.3, direction: "down-right", size: 0.42, opacity: 0.72, region: full },
  }),
  effect({
    type: "falling_petals",
    label: "Falling Petals",
    icon: "🌸",
    category: "nature",
    layer: "foreground",
    description: "Soft petals drifting through the frame.",
    variants: v("Falling Petals", "Light Petals"),
    controls: ["amount", "speed", "direction", "size", "opacity", "region"],
    defaults: { amount: 0.32, speed: 0.24, direction: "down-left", size: 0.34, opacity: 0.66, region: full },
  }),
  effect({
    type: "pollen",
    label: "Floating Pollen",
    icon: "🌾",
    category: "nature",
    layer: "foreground",
    description: "Small pollen motes floating in sunlight.",
    variants: v("Floating Pollen", "Flying Seeds"),
    controls: ["amount", "speed", "direction", "size", "opacity", "region"],
    defaults: { amount: 0.36, speed: 0.2, direction: "up-right", size: 0.28, opacity: 0.42, region: full },
  }),
  effect({
    type: "grass_movement",
    label: "Grass Movement",
    icon: "🌾",
    category: "nature",
    layer: "foreground",
    description: "Subtle swaying strokes near the ground to imply wind through grass.",
    variants: v("Grass Movement", "Tree Movement", "Branch Movement"),
    controls: ["intensity", "speed", "direction", "opacity", "region"],
    defaults: { intensity: 0.32, speed: 0.26, direction: "right", opacity: 0.28, region: bottom },
  }),

  // Particles
  effect({
    type: "dust",
    label: "Dust",
    icon: "•",
    category: "particles",
    layer: "foreground",
    description: "Fine cinematic dust motes with depth variation.",
    variants: v("Dust", "Golden Dust", "Light Particles"),
    controls: ["amount", "speed", "direction", "size", "opacity", "region"],
    defaults: { amount: 0.32, speed: 0.16, direction: "up-right", size: 0.28, opacity: 0.38, region: full },
  }),
  effect({
    type: "glowing_particles",
    label: "Glowing Particles",
    icon: "✨",
    category: "particles",
    layer: "foreground",
    description: "Soft glowing particles, useful for magical or warm light scenes.",
    variants: v("Glowing Particles", "Mid-Air Glowing Particles", "Magical Particles", "Floating Particles", "Fairy Dust", "Golden Sparks", "Energy Motes"),
    controls: ["amount", "speed", "direction", "size", "opacity", "region"],
    defaults: { amount: 0.44, speed: 0.24, direction: "up", size: 0.46, opacity: 0.64, region: full },
  }),
  effect({
    type: "smoke",
    label: "Smoke",
    icon: "💨",
    category: "particles",
    layer: "atmosphere",
    description: "Soft translucent smoke plumes with rising turbulent movement.",
    variants: v("Smoke", "Haze"),
    controls: ["density", "speed", "direction", "opacity", "size", "origin", "region"],
    defaults: { density: 0.32, speed: 0.22, direction: "up-right", opacity: 0.34, size: 0.42, origin: { x: 0.5, y: 0.72 }, region: mid },
  }),
  effect({
    type: "embers",
    label: "Embers",
    icon: "🟠",
    category: "particles",
    layer: "foreground",
    description: "Warm embers rising and fading with slight flicker.",
    variants: v("Embers", "Sparks"),
    controls: ["amount", "speed", "direction", "size", "opacity", "origin", "region"],
    defaults: { amount: 0.34, speed: 0.34, direction: "up-right", size: 0.35, opacity: 0.66, origin: { x: 0.5, y: 0.72 }, region: bottom },
  }),

  // Fire and smoke
  effect({
    type: "fire",
    label: "Fire / Flame",
    icon: "🔥",
    category: "fire_smoke",
    layer: "foreground",
    description: "Procedural flickering flame with internal motion, not a static sticker.",
    variants: v("Campfire", "Fireplace", "Candle", "Torch", "Small Flame"),
    controls: ["intensity", "speed", "size", "opacity", "origin"],
    defaults: { variant: "campfire", intensity: 0.55, speed: 0.48, size: 0.42, opacity: 0.9, origin: { x: 0.5, y: 0.78 } },
  }),
  effect({
    type: "fire_smoke",
    label: "Fire Smoke",
    icon: "💨",
    category: "fire_smoke",
    layer: "atmosphere",
    description: "Smoke that rises from the selected flame origin.",
    variants: v("Smoke", "Dark Smoke"),
    controls: ["density", "speed", "direction", "opacity", "size", "origin", "region"],
    defaults: { density: 0.38, speed: 0.28, direction: "up-right", opacity: 0.34, size: 0.44, origin: { x: 0.5, y: 0.72 }, region: mid },
  }),
  effect({
    type: "sparks",
    label: "Sparks",
    icon: "✴",
    category: "fire_smoke",
    layer: "foreground",
    description: "Tiny sharp sparks rising from fire or metal.",
    variants: v("Sparks", "Small Sparks"),
    controls: ["amount", "speed", "direction", "size", "opacity", "origin", "region"],
    defaults: { amount: 0.32, speed: 0.5, direction: "up-right", size: 0.26, opacity: 0.72, origin: { x: 0.5, y: 0.72 }, region: bottom },
  }),
  effect({
    type: "firelight",
    label: "Flickering Firelight",
    icon: "🕯",
    category: "fire_smoke",
    layer: "lighting",
    description: "Warm flickering illumination around fire.",
    variants: v("Firelight", "Flickering Light"),
    controls: ["intensity", "speed", "opacity", "origin"],
    defaults: { intensity: 0.45, speed: 0.42, opacity: 0.35, origin: { x: 0.5, y: 0.72 } },
  }),

  // Steam
  effect({
    type: "steam",
    label: "Steam / Vapor",
    icon: "♨️",
    category: "steam",
    layer: "atmosphere",
    description: "Rising vapor for coffee, tea, hot food or general steam sources.",
    variants: v("Coffee Steam", "Strong Coffee Steam", "Cup Steam Plume", "Tea Steam", "Hot Food Steam", "General Steam", "Mystic Vapor"),
    controls: ["density", "speed", "direction", "opacity", "size", "origin", "region"],
    defaults: { variant: "cup_steam_plume", density: 0.7, speed: 0.28, direction: "up-right", opacity: 0.72, size: 0.6, origin: { x: 0.5, y: 0.6 }, region: cupSteamRegion },
  }),

  // Mystical / creative transparent overlays
  effect({
    type: "mystical_golden_signs",
    label: "Mystical Golden Signs",
    icon: "☥",
    category: "mystical",
    layer: "foreground",
    description: "Transparent floating golden glyphs, runes and sacred geometry in mid-air.",
    variants: v("Mystical Golden Signs", "Ancient Runes", "Floating Glyphs", "Sacred Geometry", "Golden Scripture"),
    controls: ["amount", "intensity", "speed", "direction", "size", "opacity", "origin", "region"],
    defaults: { variant: "mystical_golden_signs", amount: 0.5, intensity: 0.78, speed: 0.32, direction: "up", size: 0.5, opacity: 0.82, origin: { x: 0.5, y: 0.55 }, region: full },
  }),
  effect({
    type: "glowing_orbs",
    label: "Glowing Orbs",
    icon: "🟡",
    category: "mystical",
    layer: "foreground",
    description: "Bright transparent orbs and fairy lights floating through the air.",
    variants: v("Glowing Orbs", "Floating Energy Orbs", "Fairy Lights", "Spirit Lights", "Golden Orbs"),
    controls: ["amount", "speed", "direction", "size", "opacity", "region"],
    defaults: { variant: "glowing_orbs", amount: 0.44, speed: 0.28, direction: "up-right", size: 0.52, opacity: 0.72, region: full },
  }),
  effect({
    type: "energy_waves",
    label: "Energy Waves / Portal Rings",
    icon: "◎",
    category: "mystical",
    layer: "foreground",
    description: "Expanding transparent rings, portal pulses and mid-air ripple waves.",
    variants: v("Energy Waves", "Portal Rings", "Mid-Air Ripple", "Magic Pulse", "Light Shockwave"),
    controls: ["intensity", "speed", "size", "opacity", "origin", "region"],
    defaults: { variant: "energy_waves", intensity: 0.72, speed: 0.42, size: 0.52, opacity: 0.68, origin: { x: 0.5, y: 0.5 }, region: full },
  }),
  effect({
    type: "scene_reactive_glow",
    label: "Scene Reactive Glow",
    icon: "💓",
    category: "mystical",
    layer: "lighting",
    description: "Audio/scene-reactive transparent aura that pulses with narration or preview energy.",
    variants: v("Voice Reactive Pulse", "Beat Glow", "Reactive Aura", "Energy Breath"),
    controls: ["intensity", "speed", "size", "opacity", "origin", "region"],
    defaults: { variant: "voice_reactive_pulse", intensity: 0.7, speed: 0.5, size: 0.55, opacity: 0.58, origin: { x: 0.5, y: 0.5 }, region: full },
  }),
  effect({
    type: "enchanted_sigil",
    label: "Intricate Enchantment Sigil",
    icon: "✺",
    category: "mystical",
    layer: "foreground",
    description: "Detailed transparent magic circles with geometry, rings, dots and ornamental linework.",
    variants: v("Intricate Enchantment Sigil", "Arcane Circle", "Angel Seal", "Golden Geometry Wheel", "Protection Sign", "Floating Sigil Wheels"),
    controls: ["amount", "intensity", "speed", "size", "opacity", "origin", "region"],
    defaults: { variant: "intricate_enchantment_sigil", amount: 0.34, intensity: 0.82, speed: 0.26, size: 0.52, opacity: 0.82, origin: { x: 0.5, y: 0.5 }, region: full },
  }),
  effect({
    type: "mandala_bloom",
    label: "Meditation Mandala Bloom",
    icon: "✽",
    category: "mystical",
    layer: "foreground",
    description: "Breathing lotus/mandala shapes for meditation, healing and calm motivational scenes.",
    variants: v("Meditation Mandala Bloom", "Lotus Aura", "Chakra Wheel", "Sacred Bloom", "Breathing Mandala"),
    controls: ["intensity", "speed", "size", "opacity", "origin", "region"],
    defaults: { variant: "meditation_mandala_bloom", intensity: 0.68, speed: 0.28, size: 0.58, opacity: 0.66, origin: { x: 0.5, y: 0.5 }, region: full },
  }),
  effect({
    type: "celestial_twinkles",
    label: "Celestial Twinkles & Flashes",
    icon: "✦",
    category: "mystical",
    layer: "foreground",
    description: "Bright twinkling stars, flash sparkles and motivational glints in transparent mid-air.",
    variants: v("Twinkling Star Field", "Flash Stars", "Meditation Stars", "Motivational Sparkles", "Golden Star Rain", "Diamond Glints"),
    controls: ["amount", "intensity", "speed", "direction", "size", "opacity", "region"],
    defaults: { variant: "twinkling_star_field", amount: 0.55, intensity: 0.76, speed: 0.42, direction: "up", size: 0.46, opacity: 0.82, region: full },
  }),
  effect({
    type: "constellation_lines",
    label: "Constellation Lines",
    icon: "✧",
    category: "mystical",
    layer: "foreground",
    description: "Connected star maps and sacred constellation patterns that gently shimmer.",
    variants: v("Constellation Lines", "Sacred Star Map", "Guiding Path", "Meditation Constellation"),
    controls: ["amount", "intensity", "speed", "size", "opacity", "region"],
    defaults: { variant: "constellation_lines", amount: 0.42, intensity: 0.6, speed: 0.24, size: 0.38, opacity: 0.62, region: sky },
  }),
  effect({
    type: "meditation_aura",
    label: "Meditation Aura",
    icon: "🧘",
    category: "mystical",
    layer: "lighting",
    description: "Soft breathing aura rings and calm inner glow for meditation videos.",
    variants: v("Meditation Aura", "Calm Breath Aura", "Healing Glow", "Peaceful Pulse", "Inner Light"),
    controls: ["intensity", "speed", "size", "opacity", "origin", "region"],
    defaults: { variant: "meditation_aura", intensity: 0.62, speed: 0.24, size: 0.58, opacity: 0.5, origin: { x: 0.5, y: 0.52 }, region: full },
  }),
  effect({
    type: "motivational_starburst",
    label: "Motivational Starburst",
    icon: "🌟",
    category: "mystical",
    layer: "lighting",
    description: "Uplifting radiant bursts, upward glints and flash rays for motivational scenes.",
    variants: v("Motivational Starburst", "Hope Rays", "Victory Glints", "Ascension Sparkles", "Golden Flash"),
    controls: ["amount", "intensity", "speed", "direction", "size", "opacity", "origin", "region"],
    defaults: { variant: "motivational_starburst", amount: 0.45, intensity: 0.76, speed: 0.4, direction: "up", size: 0.54, opacity: 0.62, origin: { x: 0.5, y: 0.42 }, region: full },
  }),

  // Lighting
  effect({
    type: "sun_rays",
    label: "Sun Rays",
    icon: "🔆",
    category: "lighting",
    layer: "lighting",
    description: "Soft directional rays blended over the scene.",
    variants: v("Sun Rays", "God Rays", "Light Beams"),
    controls: ["intensity", "opacity", "direction", "origin"],
    defaults: { intensity: 0.42, opacity: 0.34, direction: "down-right", origin: { x: 0.18, y: 0.12 } },
  }),
  effect({
    type: "golden_light",
    label: "Golden Light",
    icon: "🟡",
    category: "lighting",
    layer: "lighting",
    description: "Warm cinematic wash with very subtle pulsing.",
    variants: v("Golden Light", "Soft Sunlight"),
    controls: ["intensity", "opacity", "origin"],
    defaults: { intensity: 0.38, opacity: 0.3, origin: { x: 0.22, y: 0.18 } },
  }),
  effect({
    type: "moonlight",
    label: "Moonlight",
    icon: "🌙",
    category: "lighting",
    layer: "lighting",
    description: "Cool blue light for night scenes.",
    variants: v("Moonlight", "Cool Moonlight"),
    controls: ["intensity", "opacity", "origin"],
    defaults: { intensity: 0.34, opacity: 0.28, origin: { x: 0.78, y: 0.16 } },
  }),
  effect({
    type: "lens_flare",
    label: "Lens Flare",
    icon: "◎",
    category: "lighting",
    layer: "lighting",
    description: "Subtle flare elements tied to an origin point.",
    variants: v("Lens Flare", "Light Leaks"),
    controls: ["intensity", "opacity", "origin"],
    defaults: { intensity: 0.32, opacity: 0.34, origin: { x: 0.2, y: 0.18 } },
  }),
  effect({
    type: "moving_shadows",
    label: "Moving Shadows",
    icon: "◒",
    category: "lighting",
    layer: "lighting",
    description: "Soft shadow motion for trees, clouds or window light.",
    variants: v("Moving Shadows", "Cloud Shadows"),
    controls: ["intensity", "speed", "direction", "opacity"],
    defaults: { intensity: 0.35, speed: 0.2, direction: "right", opacity: 0.3 },
  }),
  effect({
    type: "lightning_illumination",
    label: "Lightning Illumination",
    icon: "⚡",
    category: "lighting",
    layer: "lighting",
    description: "Scene-wide brightness pulses synced to storm lightning timing.",
    variants: v("Lightning Illumination", "Distant Illumination"),
    controls: ["intensity", "speed", "opacity"],
    defaults: { intensity: 0.42, speed: 0.35, opacity: 0.5 },
  }),
];

export const EFFECT_BY_TYPE = new Map(SCENE_ANIMATION_EFFECTS.map((effectDef) => [effectDef.type, effectDef]));

export const SCENE_ANIMATION_PRESETS: SceneAnimationPreset[] = [
  {
    id: "peaceful_morning",
    label: "Peaceful Morning",
    icon: "🌅",
    description: "Slow camera, gentle clouds, mist, ripples and soft sunlight.",
    camera: { motion: "slow_zoom", speed: 0.32, intensity: 0.48 },
    effects: [
      { type: "moving_clouds", variant: "slow_moving_clouds", opacity: 0.28, speed: 0.16 },
      { type: "mist", variant: "light_mist", opacity: 0.3, region: horizon },
      { type: "water_ripples", opacity: 0.34, region: lower },
      { type: "golden_light", opacity: 0.28 },
    ],
  },
  {
    id: "rainy_day",
    label: "Rainy Day",
    icon: "🌧",
    description: "Light rain, mist, drifting clouds and water ripples.",
    camera: { motion: "cinematic_drift", speed: 0.3, intensity: 0.45 },
    effects: [
      { type: "rain", variant: "light_rain", opacity: 0.44, density: 0.44 },
      { type: "mist", opacity: 0.28 },
      { type: "moving_clouds", opacity: 0.28 },
      { type: "water_ripples", variant: "rain_ripples", opacity: 0.3 },
    ],
  },
  {
    id: "thunderstorm",
    label: "Thunderstorm",
    icon: "⛈",
    description: "Storm clouds, heavy rain, wind, lightning and water movement.",
    camera: { motion: "zoom_pan", speed: 0.42, intensity: 0.52 },
    effects: [
      { type: "storm_clouds", opacity: 0.5, intensity: 0.58 },
      { type: "rain", variant: "heavy_rain", density: 0.75, opacity: 0.58, speed: 0.72 },
      { type: "wind", intensity: 0.62, direction: "right" },
      { type: "lightning", variant: "occasional_lightning" },
      { type: "water_shimmer", opacity: 0.34 },
    ],
  },
  {
    id: "winter",
    label: "Winter",
    icon: "❄️",
    description: "Falling snow, cold mist and wind drift.",
    camera: { motion: "slow_zoom", speed: 0.28, intensity: 0.44 },
    effects: [
      { type: "snow", variant: "normal_snow", amount: 0.52, opacity: 0.74 },
      { type: "mist", variant: "ground_mist", opacity: 0.24 },
      { type: "wind", intensity: 0.42, direction: "left" },
    ],
  },
  {
    id: "autumn",
    label: "Autumn",
    icon: "🍂",
    description: "Falling leaves, light wind and warm golden light.",
    camera: { motion: "cinematic_drift", speed: 0.28, intensity: 0.46 },
    effects: [
      { type: "falling_leaves", amount: 0.46, direction: "down-right" },
      { type: "wind", intensity: 0.38, direction: "right" },
      { type: "golden_light", opacity: 0.28 },
    ],
  },
  {
    id: "enchanted_forest",
    label: "Enchanted Forest",
    icon: "🧚",
    description: "Mist, fireflies, light rays and glowing particles.",
    camera: { motion: "slow_zoom", speed: 0.28, intensity: 0.48 },
    effects: [
      { type: "mist", opacity: 0.34 },
      { type: "fireflies", amount: 0.42, opacity: 0.72 },
      { type: "sun_rays", variant: "god_rays", opacity: 0.3 },
      { type: "glowing_particles", amount: 0.28, opacity: 0.38 },
    ],
  },
  {
    id: "campfire",
    label: "Campfire",
    icon: "🔥",
    description: "Animated flame, smoke, embers and flickering firelight.",
    camera: { motion: "cinematic_drift", speed: 0.24, intensity: 0.42 },
    effects: [
      { type: "fire", variant: "campfire" },
      { type: "fire_smoke", opacity: 0.3 },
      { type: "embers", amount: 0.42 },
      { type: "firelight", opacity: 0.36 },
    ],
  },
  {
    id: "coffee_morning",
    label: "Coffee Morning",
    icon: "☕",
    description: "Coffee steam, lake mist, water motion, clouds and golden light.",
    camera: { motion: "cinematic_drift", speed: 0.26, intensity: 0.44 },
    effects: [
      { type: "steam", variant: "coffee_steam", origin: { x: 0.5, y: 0.58 }, opacity: 0.62, density: 0.6 },
      { type: "mist", variant: "lake_mist", opacity: 0.3 },
      { type: "water_ripples", opacity: 0.3 },
      { type: "moving_clouds", opacity: 0.24 },
      { type: "golden_light", opacity: 0.3 },
    ],
  },
  {
    id: "ocean",
    label: "Ocean",
    icon: "🌊",
    description: "Waves, sea spray mist, clouds and birds.",
    camera: { motion: "zoom_pan", speed: 0.34, intensity: 0.5 },
    effects: [
      { type: "ocean_waves", variant: "ocean_waves", opacity: 0.42 },
      { type: "water_mist", variant: "sea_spray_mist", opacity: 0.32 },
      { type: "moving_clouds", opacity: 0.26 },
      { type: "birds", amount: 0.32 },
    ],
  },
  {
    id: "mystical_air",
    label: "Mystical Air",
    icon: "🔮",
    description: "Golden floating signs, glowing orbs, particles and a reactive aura with no background plate.",
    camera: { motion: "cinematic_drift", speed: 0.34, intensity: 0.54 },
    effects: [
      { type: "mystical_golden_signs", amount: 0.55, opacity: 0.82 },
      { type: "glowing_orbs", amount: 0.42, opacity: 0.74 },
      { type: "glowing_particles", variant: "mid_air_glowing_particles", amount: 0.46, opacity: 0.62 },
      { type: "scene_reactive_glow", opacity: 0.5 },
    ],
  },
  {
    id: "steam_cup_magic",
    label: "Steam Cup Magic",
    icon: "☕",
    description: "Dense, clearly-visible cup steam rising into golden signs and glowing particles.",
    camera: { motion: "slow_zoom", speed: 0.3, intensity: 0.48 },
    effects: [
      {
        type: "steam",
        variant: "cup_steam_plume",
        origin: { x: 0.5, y: 0.62 },
        opacity: 0.9,
        density: 0.9,
        size: 0.68,
        region: { x: 0.26, y: 0.1, w: 0.48, h: 0.74 },
        bloom: 0.3,
        afterglow: 0.18,
      },
      { type: "mystical_golden_signs", amount: 0.36, opacity: 0.72, region: { x: 0.18, y: 0.08, w: 0.64, h: 0.7 } },
      { type: "glowing_particles", variant: "golden_sparks", amount: 0.42, opacity: 0.62 },
      { type: "golden_light", opacity: 0.34 },
    ],
  },
  {
    id: "reactive_energy",
    label: "Reactive Energy",
    icon: "💓",
    description: "Scene-reactive glow, expanding energy rings and floating orbs for non-natural animations.",
    camera: { motion: "zoom_pan", speed: 0.4, intensity: 0.55 },
    effects: [
      { type: "scene_reactive_glow", opacity: 0.62, intensity: 0.78 },
      { type: "energy_waves", opacity: 0.7, speed: 0.48 },
      { type: "glowing_orbs", amount: 0.5, opacity: 0.72 },
    ],
  },
  {
    id: "enchanted_sigils",
    label: "Enchanted Sigils",
    icon: "✺",
    description: "Intricate golden signs, mandala geometry, twinkling stars and transparent enchantment symbols.",
    camera: { motion: "cinematic_drift", speed: 0.32, intensity: 0.52 },
    effects: [
      { type: "enchanted_sigil", variant: "arcane_circle", opacity: 0.84, intensity: 0.86 },
      { type: "mystical_golden_signs", variant: "sacred_geometry", amount: 0.42, opacity: 0.76 },
      { type: "celestial_twinkles", variant: "diamond_glints", amount: 0.46, opacity: 0.78 },
      { type: "constellation_lines", opacity: 0.5 },
    ],
  },
  {
    id: "deep_meditation",
    label: "Deep Meditation",
    icon: "🧘",
    description: "Breathing mandala, calm aura, meditation stars and soft floating particles.",
    camera: { motion: "slow_zoom", speed: 0.22, intensity: 0.42 },
    effects: [
      { type: "meditation_aura", variant: "calm_breath_aura", opacity: 0.5, speed: 0.2 },
      { type: "mandala_bloom", variant: "lotus_aura", opacity: 0.62, speed: 0.22 },
      { type: "celestial_twinkles", variant: "meditation_stars", amount: 0.36, opacity: 0.58, speed: 0.24 },
      { type: "glowing_particles", variant: "fairy_dust", amount: 0.32, opacity: 0.46 },
    ],
  },
  {
    id: "motivational_sparkle",
    label: "Motivational Sparkle",
    icon: "🌟",
    description: "Hope rays, radiant starbursts, flash stars and uplifting golden particles.",
    camera: { motion: "zoom_pan", speed: 0.4, intensity: 0.55 },
    effects: [
      { type: "motivational_starburst", variant: "hope_rays", opacity: 0.68, intensity: 0.82 },
      { type: "celestial_twinkles", variant: "motivational_sparkles", amount: 0.6, opacity: 0.86, speed: 0.5 },
      { type: "golden_light", opacity: 0.32, intensity: 0.48 },
      { type: "scene_reactive_glow", variant: "beat_glow", opacity: 0.46, intensity: 0.68 },
    ],
  },
  {
    id: "night",
    label: "Night",
    icon: "🌙",
    description: "Stars, thin clouds, moonlight and subtle particles.",
    camera: { motion: "slow_zoom", speed: 0.26, intensity: 0.42 },
    effects: [
      { type: "stars", amount: 0.44, opacity: 0.68 },
      { type: "moving_clouds", variant: "thin_cloud_movement", opacity: 0.18 },
      { type: "moonlight", opacity: 0.3 },
      { type: "dust", variant: "light_particles", amount: 0.22, opacity: 0.26 },
    ],
  },
  {
    id: "neon_energy_surge",
    label: "Neon Energy Surge",
    icon: "⚡",
    description: "Neon-coloured reactive glow, energy waves and glowing orbs with bloom and shine for electric, non-natural scenes.",
    camera: { motion: "zoom_pan", speed: 0.42, intensity: 0.58 },
    effects: [
      { type: "scene_reactive_glow", opacity: 0.68, intensity: 0.8, colorPalette: "neon_cyan", bloom: 0.6, afterglow: 0.4 },
      { type: "energy_waves", opacity: 0.72, speed: 0.5, colorPalette: "neon_pink", bloom: 0.55, trail: 0.4 },
      { type: "glowing_orbs", amount: 0.5, opacity: 0.74, colorPalette: "neon_purple", bloom: 0.5, shine: 0.6 },
    ],
  },
];

/**
 * Beginner-friendly front door to the effect library.
 *
 * The renderer still treats every effect as an independent layer; this is only
 * navigation. Users start from a creative goal (season, mystical, space,
 * motivation, meditation...) and then choose a smaller sub-section instead of
 * scanning one long technical list.
 */
export const SCENE_ANIMATION_LIBRARY_SECTIONS: SceneAnimationLibrarySection[] = [
  {
    id: "seasons",
    label: "Seasons",
    icon: "🍂",
    description: "Spring, summer, autumn and winter atmosphere.",
    groups: [
      {
        id: "spring",
        label: "Spring",
        icon: "🌸",
        description: "Petals, butterflies, pollen and soft sunlight.",
        effects: ["falling_petals", "butterflies", "pollen", "golden_light", "sun_rays"],
      },
      {
        id: "summer",
        label: "Summer",
        icon: "☀️",
        description: "Warm rays, shimmer, birds and floating dust.",
        effects: ["sun_rays", "golden_light", "water_shimmer", "birds", "dust"],
      },
      {
        id: "autumn",
        label: "Autumn",
        icon: "🍁",
        description: "Leaves, wind, golden light and forest haze.",
        effects: ["falling_leaves", "wind", "golden_light", "mist", "grass_movement"],
        presetIds: ["autumn"],
      },
      {
        id: "winter",
        label: "Winter",
        icon: "❄️",
        description: "Snow, cold mist, moonlight and wind.",
        effects: ["snow", "wind", "mist", "moonlight", "stars"],
        presetIds: ["winter"],
      },
    ],
  },
  {
    id: "mystical",
    label: "Mystical",
    icon: "🔮",
    description: "Magic signs, sigils, glowing orbs and energy overlays.",
    groups: [
      {
        id: "signs_sigils",
        label: "Signs & Sigils",
        icon: "✺",
        description: "Intricate enchantment marks, runes and sacred geometry.",
        effects: ["enchanted_sigil", "mystical_golden_signs", "energy_waves", "constellation_lines"],
        presetIds: ["enchanted_sigils", "mystical_air"],
      },
      {
        id: "floating_magic",
        label: "Floating Magic",
        icon: "✨",
        description: "Mid-air particles, orbs, fairy lights and glints.",
        effects: ["glowing_particles", "glowing_orbs", "celestial_twinkles", "fireflies", "scene_reactive_glow"],
        presetIds: ["mystical_air"],
      },
      {
        id: "energy_portals",
        label: "Energy & Portals",
        icon: "◎",
        description: "Portal rings, magic pulses, reactive aura and shockwaves.",
        effects: ["energy_waves", "scene_reactive_glow", "glowing_orbs", "motivational_starburst"],
        presetIds: ["reactive_energy"],
      },
    ],
  },
  {
    id: "energy",
    label: "Energy",
    icon: "⚡",
    description: "Reactive glow, portal energy waves and neon-styled power effects for non-natural, high-energy scenes.",
    groups: [
      {
        id: "reactive_energy",
        label: "Reactive Energy",
        icon: "💓",
        description: "Scene-reactive glow and pulsing light that responds to the mood of the scene.",
        effects: ["scene_reactive_glow", "glowing_orbs", "glowing_particles"],
        presetIds: ["reactive_energy"],
      },
      {
        id: "portals_power_waves",
        label: "Portals & Power Waves",
        icon: "◎",
        description: "Expanding energy rings, portal pulses and dramatic power waves.",
        effects: ["energy_waves", "enchanted_sigil", "constellation_lines", "lightning_illumination"],
        presetIds: ["reactive_energy"],
      },
      {
        id: "neon_energy",
        label: "Neon Energy",
        icon: "🌐",
        description: "Neon-coloured glow, waves and orbs with bloom, afterglow and shine for electric visuals.",
        effects: ["scene_reactive_glow", "energy_waves", "glowing_orbs", "glowing_particles"],
        presetIds: ["neon_energy_surge"],
      },
    ],
  },
  {
    id: "space",
    label: "Space",
    icon: "🌌",
    description: "Stars, constellations, aurora and cosmic skies.",
    groups: [
      {
        id: "stars",
        label: "Stars & Twinkles",
        icon: "⭐",
        description: "Stars appearing, flash stars and diamond glints.",
        effects: ["stars", "celestial_twinkles", "shooting_star", "meteor"],
        presetIds: ["night"],
      },
      {
        id: "constellations",
        label: "Constellations",
        icon: "✧",
        description: "Connected star maps and guiding celestial paths.",
        effects: ["constellation_lines", "celestial_twinkles", "moonlight", "aurora"],
      },
      {
        id: "cosmic_sky",
        label: "Cosmic Sky",
        icon: "🟢",
        description: "Aurora, moonlight, night clouds and distant cosmic motion.",
        effects: ["aurora", "moonlight", "moving_clouds", "storm_clouds", "shooting_star"],
      },
    ],
  },
  {
    id: "motivation",
    label: "Motivation",
    icon: "🌟",
    description: "Uplifting rays, hopeful starbursts and energetic pulses.",
    groups: [
      {
        id: "hope",
        label: "Hope & Rise",
        icon: "🌅",
        description: "Golden light, hope rays and upward sparkles.",
        effects: ["motivational_starburst", "golden_light", "sun_rays", "celestial_twinkles"],
        presetIds: ["motivational_sparkle"],
      },
      {
        id: "power",
        label: "Power Energy",
        icon: "⚡",
        description: "Reactive glow, waves, glints and dramatic flashes.",
        effects: ["scene_reactive_glow", "energy_waves", "lightning_illumination", "lens_flare", "glowing_particles"],
        presetIds: ["reactive_energy"],
      },
      {
        id: "clarity",
        label: "Clarity & Focus",
        icon: "🔆",
        description: "Clean light beams, subtle particles and guiding constellations.",
        effects: ["sun_rays", "lightning_illumination", "constellation_lines", "dust", "golden_light"],
      },
    ],
  },
  {
    id: "meditation",
    label: "Meditation",
    icon: "🧘",
    description: "Calm breathing auras, mandalas and soft star motion.",
    groups: [
      {
        id: "aura",
        label: "Aura & Breath",
        icon: "💫",
        description: "Breathing aura, inner light and calm pulses.",
        effects: ["meditation_aura", "scene_reactive_glow", "golden_light", "moonlight"],
        presetIds: ["deep_meditation"],
      },
      {
        id: "mandala",
        label: "Mandala & Lotus",
        icon: "✽",
        description: "Sacred bloom, chakra wheel and geometric meditation shapes.",
        effects: ["mandala_bloom", "enchanted_sigil", "celestial_twinkles", "glowing_particles"],
        presetIds: ["deep_meditation"],
      },
      {
        id: "calm_nature",
        label: "Calm Nature",
        icon: "🌫",
        description: "Mist, fireflies, floating particles and soft rays.",
        effects: ["mist", "fireflies", "dust", "sun_rays", "moving_clouds"],
        presetIds: ["enchanted_forest", "peaceful_morning"],
      },
    ],
  },
  {
    id: "nature_water",
    label: "Nature & Water",
    icon: "🌊",
    description: "Forest, lake, ocean, birds and water movement.",
    groups: [
      {
        id: "water",
        label: "Water",
        icon: "🌊",
        description: "Ripples, shimmer, river flow, waves and mist.",
        effects: ["water_ripples", "water_shimmer", "river_flow", "ocean_waves", "water_mist", "floating_leaves"],
        presetIds: ["peaceful_morning", "ocean"],
      },
      {
        id: "forest",
        label: "Forest",
        icon: "🌲",
        description: "Leaves, mist, rays, grass movement and insects.",
        effects: ["mist", "falling_leaves", "grass_movement", "sun_rays", "fireflies", "butterflies"],
        presetIds: ["enchanted_forest", "autumn"],
      },
      {
        id: "sky_life",
        label: "Birds & Sky Life",
        icon: "🕊",
        description: "Birds, flocks, insects and cloud movement.",
        effects: ["birds", "bird_flock", "butterflies", "moving_clouds", "cloud_shadows"],
      },
    ],
  },
  {
    id: "weather",
    label: "Weather",
    icon: "🌧",
    description: "Rain, storms, fog, snow and wind.",
    groups: [
      {
        id: "rain_storm",
        label: "Rain & Storm",
        icon: "⛈",
        description: "Rain, storm clouds, wind and lightning flashes.",
        effects: ["rain", "storm_clouds", "wind", "lightning", "lightning_illumination", "water_ripples"],
        presetIds: ["rainy_day", "thunderstorm"],
      },
      {
        id: "snow_fog",
        label: "Snow & Fog",
        icon: "❄️",
        description: "Snow, fog, mist and cold moonlight.",
        effects: ["snow", "fog", "mist", "wind", "moonlight"],
        presetIds: ["winter"],
      },
      {
        id: "clouds",
        label: "Clouds",
        icon: "☁️",
        description: "Moving clouds, storm clouds, shadows and sky glows.",
        effects: ["moving_clouds", "storm_clouds", "cloud_shadows", "sunset_glow", "sunrise_glow"],
      },
    ],
  },
  {
    id: "fire_steam",
    label: "Fire & Steam",
    icon: "🔥",
    description: "Steam from cups, smoke, flames, embers and warm light.",
    groups: [
      {
        id: "cup_steam",
        label: "Cup Steam",
        icon: "☕",
        description: "Coffee/tea vapor, mystic steam and golden particles.",
        effects: ["steam", "glowing_particles", "mystical_golden_signs", "golden_light"],
        presetIds: ["coffee_morning", "steam_cup_magic"],
      },
      {
        id: "flames",
        label: "Flames",
        icon: "🔥",
        description: "Campfire, sparks, smoke, embers and firelight.",
        effects: ["fire", "fire_smoke", "embers", "sparks", "firelight"],
        presetIds: ["campfire"],
      },
      {
        id: "smoke_haze",
        label: "Smoke & Haze",
        icon: "💨",
        description: "Smoke, haze, fog and atmospheric particles.",
        effects: ["smoke", "fog", "mist", "dust", "embers"],
      },
    ],
  },
  {
    id: "all",
    label: "All Effects",
    icon: "🧩",
    description: "Technical categories for advanced users.",
    groups: SCENE_ANIMATION_CATEGORIES.map((category) => ({
      id: category.id,
      label: category.label,
      icon: category.icon,
      description: category.hint,
      effects: SCENE_ANIMATION_EFFECTS.filter((effectDef) => effectDef.category === category.id).map((effectDef) => effectDef.type),
    })),
  },
];

function cloneRegion(region?: SceneAnimationRegion): SceneAnimationRegion | undefined {
  return region ? { x: region.x, y: region.y, w: region.w, h: region.h } : undefined;
}

function cloneEffect(effectValue: SceneAnimationEffect): SceneAnimationEffect {
  return {
    ...effectValue,
    region: cloneRegion(effectValue.region),
    origin: effectValue.origin ? { ...effectValue.origin } : undefined,
  };
}

export function resolveSceneAnimation(input?: SceneAnimationConfig | null): SceneAnimationConfig {
  const camera = {
    ...DEFAULT_SCENE_ANIMATION_CAMERA,
    ...(input?.camera || {}),
  };
  return {
    enabled: input?.enabled !== false,
    camera,
    effects: Array.isArray(input?.effects) ? input.effects.map(cloneEffect) : [],
  };
}

export function effectDefaults(type: string): SceneAnimationEffect {
  const def = EFFECT_BY_TYPE.get(type);
  const defaults = def?.defaults || {};
  return {
    id: `${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    enabled: true,
    intensity: 0.45,
    speed: 0.35,
    opacity: 0.45,
    direction: "right",
    size: 0.35,
    density: 0.35,
    amount: 0.35,
    colorPalette: "natural",
    bloom: 0,
    afterglow: 0,
    trail: 0,
    ...(defaults as Partial<SceneAnimationEffect>),
    region: cloneRegion(defaults.region as SceneAnimationRegion | undefined),
    origin: defaults.origin ? { ...(defaults.origin as { x: number; y: number }) } : undefined,
  };
}

export function countEnabledSceneAnimationItems(animation?: SceneAnimationConfig | null): number {
  const cfg = resolveSceneAnimation(animation);
  if (cfg.enabled === false) return 0;
  const cameraCount = cfg.camera?.motion && cfg.camera.motion !== "none" ? 1 : 0;
  const effectCount = (cfg.effects || []).filter((effectValue) => effectValue.enabled !== false).length;
  return cameraCount + effectCount;
}

export function enabledSceneAnimationEffects(animation?: SceneAnimationConfig | null): SceneAnimationEffect[] {
  return resolveSceneAnimation(animation).effects?.filter((effectValue) => effectValue.enabled !== false) || [];
}

export function resolveSceneCameraMotion(scene: Pick<Scene, "motion_effect" | "animation">, sceneAnimationEnabled: boolean): SceneMotionType | undefined {
  if (!sceneAnimationEnabled) return scene.motion_effect;
  const cfg = resolveSceneAnimation(scene.animation);
  if (cfg.enabled === false) return "none";
  return cfg.camera?.motion || "none";
}

export function sceneCameraProgress(scene: Pick<Scene, "animation">, sceneAnimationEnabled: boolean, progress: number): number {
  const safe = clamp(progress, 0, 1);
  if (!sceneAnimationEnabled) return safe;
  const cfg = resolveSceneAnimation(scene.animation);
  const speed = clamp(cfg.camera?.speed ?? DEFAULT_SCENE_ANIMATION_CAMERA.speed, 0, 1);
  // Slow still completes most of the travel; fast gets there earlier. The scene
  // duration remains the authority, so motion never changes timing/captions.
  const factor = 0.72 + speed * 0.86;
  return clamp(safe * factor, 0, 1);
}

export function getSceneCameraTransform(
  scene: Pick<Scene, "motion_effect" | "animation">,
  sceneAnimationEnabled: boolean,
  progress: number,
  w: number,
  h: number,
  sceneIndex = 0
): { scale: number; dx: number; dy: number } {
  const motion = resolveSceneCameraMotion(scene, sceneAnimationEnabled);
  const p = sceneCameraProgress(scene, sceneAnimationEnabled, progress);
  const base = getMotionTransform(motion, p, w, h, sceneIndex);
  if (!sceneAnimationEnabled) return base;
  const cfg = resolveSceneAnimation(scene.animation);
  const intensity = clamp(cfg.camera?.intensity ?? DEFAULT_SCENE_ANIMATION_CAMERA.intensity, 0, 1);
  return applyMotionIntensity(base, w, h, 0.2 + intensity * 0.9);
}

export function applySceneAnimationPreset(input: SceneAnimationConfig | undefined | null, presetId: string): SceneAnimationConfig {
  const preset = SCENE_ANIMATION_PRESETS.find((p) => p.id === presetId);
  const cfg = resolveSceneAnimation(input);
  if (!preset) return cfg;

  const existingByType = new Map((cfg.effects || []).map((effectValue) => [effectValue.type, effectValue]));
  const nextEffects = [...(cfg.effects || []).map(cloneEffect)];

  for (const effectPatch of preset.effects) {
    const current = existingByType.get(effectPatch.type);
    const fresh = {
      ...effectDefaults(effectPatch.type),
      ...current,
      ...effectPatch,
      enabled: true,
      id: current?.id || effectDefaults(effectPatch.type).id,
      region: cloneRegion(effectPatch.region || current?.region || EFFECT_BY_TYPE.get(effectPatch.type)?.defaults?.region as SceneAnimationRegion | undefined),
      origin: effectPatch.origin
        ? { ...effectPatch.origin }
        : current?.origin
        ? { ...current.origin }
        : EFFECT_BY_TYPE.get(effectPatch.type)?.defaults?.origin
        ? { ...(EFFECT_BY_TYPE.get(effectPatch.type)?.defaults?.origin as { x: number; y: number }) }
        : undefined,
    } as SceneAnimationEffect;
    if (current) {
      const idx = nextEffects.findIndex((e) => e.id === current.id);
      if (idx >= 0) nextEffects[idx] = fresh;
    } else {
      nextEffects.push(fresh);
    }
    existingByType.set(effectPatch.type, fresh);
  }

  return {
    ...cfg,
    enabled: true,
    camera: {
      ...cfg.camera,
      ...(preset.camera || {}),
    } as SceneAnimationConfig["camera"],
    effects: nextEffects,
  };
}

export function getSmartSceneAnimationSuggestions(scene: Pick<Scene, "text" | "image_query">): string[] {
  const haystack = `${scene.text || ""} ${scene.image_query || ""}`.toLowerCase();
  const suggestions = new Set<string>();
  const has = (...words: string[]) => words.some((word) => haystack.includes(word));

  if (has("water", "lake", "river", "ocean", "sea", "waterfall", "shore", "beach", "stream", "pond")) {
    suggestions.add("water_ripples");
    suggestions.add("water_mist");
    suggestions.add("water_shimmer");
  }
  if (has("coffee", "tea", "cup", "mug", "hot drink", "breakfast")) {
    suggestions.add("steam");
    suggestions.add("golden_light");
    suggestions.add("glowing_particles");
  }
  if (has("fire", "campfire", "flame", "fireplace", "candle", "torch")) {
    suggestions.add("fire");
    suggestions.add("fire_smoke");
    suggestions.add("embers");
    suggestions.add("firelight");
  }
  if (has("forest", "woods", "tree", "trees", "jungle", "trail", "valley")) {
    suggestions.add("mist");
    suggestions.add("sun_rays");
    suggestions.add("falling_leaves");
    suggestions.add("dust");
  }
  if (has("snow", "winter", "ice", "frozen", "mountain", "alpine")) {
    suggestions.add("snow");
    suggestions.add("wind");
    suggestions.add("mist");
  }
  if (has("sky", "cloud", "sunset", "sunrise", "storm", "night", "stars")) {
    suggestions.add(has("storm") ? "storm_clouds" : "moving_clouds");
    if (has("night", "stars")) suggestions.add("stars");
    if (has("sunset")) suggestions.add("sunset_glow");
    if (has("sunrise", "morning")) suggestions.add("sunrise_glow");
  }
  if (has("rain", "storm", "thunder")) {
    suggestions.add("rain");
    if (has("thunder", "lightning", "storm")) suggestions.add("lightning");
  }
  if (has("garden", "flower", "meadow", "spring")) {
    suggestions.add("butterflies");
    suggestions.add("falling_petals");
    suggestions.add("pollen");
  }
  if (has("magic", "mystic", "mystical", "golden sign", "glyph", "rune", "symbol", "spiritual", "angel", "fantasy", "enchanted", "glow", "energy")) {
    suggestions.add("enchanted_sigil");
    suggestions.add("mystical_golden_signs");
    suggestions.add("glowing_orbs");
    suggestions.add("energy_waves");
    suggestions.add("scene_reactive_glow");
  }
  if (has("meditation", "meditate", "calm", "peace", "peaceful", "healing", "mindful", "breath", "breathe", "relax")) {
    suggestions.add("meditation_aura");
    suggestions.add("mandala_bloom");
    suggestions.add("celestial_twinkles");
    suggestions.add("glowing_particles");
  }
  if (has("motivation", "motivational", "inspire", "inspiration", "success", "victory", "hope", "dream", "future", "rise")) {
    suggestions.add("motivational_starburst");
    suggestions.add("celestial_twinkles");
    suggestions.add("golden_light");
    suggestions.add("scene_reactive_glow");
  }

  if (suggestions.size === 0) {
    suggestions.add("cinematic_drift");
    suggestions.add("glowing_particles");
    suggestions.add("golden_light");
    suggestions.add("scene_reactive_glow");
  }

  return Array.from(suggestions).slice(0, 6);
}

// ---------------------------------------------------------------- render engine

const LAYER_ORDER: SceneAnimationLayer[] = ["background", "water", "atmosphere", "weather", "nature", "foreground", "lighting"];

interface WindState {
  x: number;
  y: number;
  strength: number;
}

interface RenderOpts {
  /** Project-level Setup toggle. Passed explicitly to avoid changing legacy renders. */
  enabled?: boolean;
  /** Optional live audio/scene energy (0..1) for reactive animation layers. */
  audioLevel?: number;
}

export function renderSceneAnimationEffects(
  ctx: CanvasRenderingContext2D,
  scene: Pick<Scene, "id" | "animation">,
  w: number,
  h: number,
  elapsedSec: number,
  progress: number,
  opts: RenderOpts = {}
) {
  if (opts.enabled === false) return;
  const cfg = resolveSceneAnimation(scene.animation);
  if (cfg.enabled === false) return;
  const effects = (cfg.effects || []).filter((effectValue) => effectValue.enabled !== false);
  if (effects.length === 0) return;

  const wind = computeWind(effects);
  const sorted = effects.slice().sort((a, b) => {
    const la = LAYER_ORDER.indexOf(EFFECT_BY_TYPE.get(a.type)?.layer || "foreground");
    const lb = LAYER_ORDER.indexOf(EFFECT_BY_TYPE.get(b.type)?.layer || "foreground");
    return la - lb;
  });

  for (const effectValue of sorted) {
    const def = EFFECT_BY_TYPE.get(effectValue.type);
    const seed = numericSeed(`${scene.id || 0}:${effectValue.id}:${effectValue.type}`);
    const draw = (targetCtx: CanvasRenderingContext2D) => {
      targetCtx.save();
      try {
        drawSceneAnimationEffectLayer(targetCtx, effectValue, w, h, elapsedSec, seed, wind, opts.audioLevel, def);
      } finally {
        targetCtx.restore();
      }
    };
    renderStyledSceneAnimationLayer(ctx, effectValue, w, h, elapsedSec, seed, draw);
  }

}


function drawSceneAnimationEffectLayer(
  ctx: CanvasRenderingContext2D,
  effectValue: SceneAnimationEffect,
  w: number,
  h: number,
  elapsedSec: number,
  seed: number,
  wind: WindState,
  audioLevel?: number,
  def?: SceneAnimationEffectDefinition
) {
switch (effectValue.type) {
  case "rain":
    drawRain(ctx, effectValue, w, h, elapsedSec, seed, wind);
    break;
  case "snow":
    drawSnow(ctx, effectValue, w, h, elapsedSec, seed, wind);
    break;
  case "lightning":
    drawLightning(ctx, effectValue, w, h, elapsedSec, seed);
    break;
  case "fog":
  case "mist":
  case "water_mist":
    drawMist(ctx, effectValue, w, h, elapsedSec, seed, effectValue.type);
    break;
  case "moving_clouds":
  case "storm_clouds":
    drawClouds(ctx, effectValue, w, h, elapsedSec, seed, effectValue.type);
    break;
  case "cloud_shadows":
  case "moving_shadows":
    drawMovingShadows(ctx, effectValue, w, h, elapsedSec, seed);
    break;
  case "sunset_glow":
  case "sunrise_glow":
  case "golden_light":
  case "moonlight":
    drawGlow(ctx, effectValue, w, h, elapsedSec, seed, effectValue.type);
    break;
  case "stars":
    drawStars(ctx, effectValue, w, h, elapsedSec, seed);
    break;
  case "shooting_star":
  case "meteor":
    drawShootingStar(ctx, effectValue, w, h, elapsedSec, seed, effectValue.type);
    break;
  case "aurora":
    drawAurora(ctx, effectValue, w, h, elapsedSec, seed);
    break;
  case "water_ripples":
  case "river_flow":
  case "ocean_waves":
  case "waterfall_movement":
  case "water_shimmer":
    drawWater(ctx, effectValue, w, h, elapsedSec, seed, effectValue.type);
    break;
  case "floating_leaves":
    drawFloatingLeaves(ctx, effectValue, w, h, elapsedSec, seed, wind);
    break;
  case "birds":
  case "bird_flock":
    drawBirds(ctx, effectValue, w, h, elapsedSec, seed, effectValue.type);
    break;
  case "butterflies":
    drawFlutterers(ctx, effectValue, w, h, elapsedSec, seed);
    break;
  case "fireflies":
    drawFireflies(ctx, effectValue, w, h, elapsedSec, seed);
    break;
  case "falling_leaves":
  case "falling_petals":
  case "pollen":
    drawFallingNature(ctx, effectValue, w, h, elapsedSec, seed, wind, effectValue.type);
    break;
  case "grass_movement":
    drawGrassSway(ctx, effectValue, w, h, elapsedSec, seed);
    break;
  case "dust":
  case "glowing_particles":
    drawParticles(ctx, effectValue, w, h, elapsedSec, seed, effectValue.type);
    break;
  case "mystical_golden_signs":
    drawMysticalGoldenSigns(ctx, effectValue, w, h, elapsedSec, seed);
    break;
  case "glowing_orbs":
    drawGlowingOrbs(ctx, effectValue, w, h, elapsedSec, seed);
    break;
  case "energy_waves":
    drawEnergyWaves(ctx, effectValue, w, h, elapsedSec, seed);
    break;
  case "scene_reactive_glow":
    drawSceneReactiveGlow(ctx, effectValue, w, h, elapsedSec, seed, audioLevel);
    break;
  case "enchanted_sigil":
    drawEnchantedSigil(ctx, effectValue, w, h, elapsedSec, seed);
    break;
  case "mandala_bloom":
    drawMandalaBloom(ctx, effectValue, w, h, elapsedSec, seed);
    break;
  case "celestial_twinkles":
    drawCelestialTwinkles(ctx, effectValue, w, h, elapsedSec, seed);
    break;
  case "constellation_lines":
    drawConstellationLines(ctx, effectValue, w, h, elapsedSec, seed);
    break;
  case "meditation_aura":
    drawMeditationAura(ctx, effectValue, w, h, elapsedSec, seed);
    break;
  case "motivational_starburst":
    drawMotivationalStarburst(ctx, effectValue, w, h, elapsedSec, seed);
    break;
  case "smoke":
  case "fire_smoke":
  case "steam":
    drawSteamSmoke(ctx, effectValue, w, h, elapsedSec, seed, effectValue.type);
    break;
  case "embers":
  case "sparks":
    drawEmbers(ctx, effectValue, w, h, elapsedSec, seed, effectValue.type);
    break;
  case "fire":
    drawFire(ctx, effectValue, w, h, elapsedSec, seed);
    break;
  case "firelight":
    drawFirelight(ctx, effectValue, w, h, elapsedSec, seed);
    break;
  case "sun_rays":
    drawSunRays(ctx, effectValue, w, h, elapsedSec, seed);
    break;
  case "lens_flare":
    drawLensFlare(ctx, effectValue, w, h, elapsedSec, seed);
    break;
  case "lightning_illumination":
    drawLightningIllumination(ctx, effectValue, w, h, elapsedSec, seed);
    break;
  case "wind":
    // Wind is an invisible force that other particle effects read.
    break;
  default:
    if (def?.category === "particles") drawParticles(ctx, effectValue, w, h, elapsedSec, seed, "dust");
    break;
}
}

function renderStyledSceneAnimationLayer(
  ctx: CanvasRenderingContext2D,
  effectValue: SceneAnimationEffect,
  w: number,
  h: number,
  elapsedSec: number,
  seed: number,
  draw: (targetCtx: CanvasRenderingContext2D) => void
) {
  const palette = paletteFor(effectValue.colorPalette);
  const bloom = clamp(effectValue.bloom ?? 0);
  const afterglow = clamp(effectValue.afterglow ?? 0);
  const trail = clamp(effectValue.trail ?? 0);
  const shine = clamp(effectValue.shine ?? (palette.metallic ? 0.72 : 0));
  const recolour = palette.id !== "natural";
  const needsLayer = recolour || bloom > 0.01 || afterglow > 0.01 || trail > 0.01 || shine > 0.01;

  if (!needsLayer) {
    draw(ctx);
    return;
  }

  const layer = createEffectLayer(w, h);
  const layerCtx = layer?.getContext("2d");
  if (!layer || !layerCtx) {
    // Very old/non-browser canvas implementations still render the base effect
    // rather than failing the video export.
    draw(ctx);
    return;
  }

  draw(layerCtx);
  if (recolour) {
    if (palette.metallic) applyChromeMetalTint(layerCtx, w, h, palette.id, elapsedSec, seed, shine);
    else tintLayer(layerCtx, w, h, palette.rgb, 0.86);
  }
  if (shine > 0.01) applySpecularShine(layerCtx, w, h, palette.glow, elapsedSec, seed, shine, palette.metallic);

  const dir = directionVector(effectValue.direction || inferTrailDirection(effectValue.type, seed));
  const minSide = Math.min(w, h);

  if (trail > 0.01) {
    const copies = 3 + Math.round(trail * 4);
    const pulse = 0.85 + 0.15 * Math.sin(elapsedSec * 2.2 + rand(seed, 91) * Math.PI * 2);
    for (let i = copies; i >= 1; i--) {
      const pct = i / copies;
      const distance = minSide * (0.006 + trail * 0.032) * i;
      drawLayerImage(ctx, layer, {
        alpha: trail * (0.11 + 0.11 * pct) * pulse,
        blur: 1.5 + trail * 8 * pct,
        operation: "screen",
        offsetX: -dir.x * distance,
        offsetY: -dir.y * distance,
      });
    }
  }

  if (afterglow > 0.01) {
    drawLayerImage(ctx, layer, {
      alpha: afterglow * 0.36,
      blur: 10 + minSide * 0.028 * afterglow,
      operation: "screen",
      shadowColor: palette.glow,
      shadowBlur: 14 + minSide * 0.035 * afterglow,
    });
  }

  if (bloom > 0.01) {
    drawLayerImage(ctx, layer, {
      alpha: bloom * 0.34,
      blur: 3 + minSide * 0.018 * bloom,
      operation: "screen",
    });
    if (bloom > 0.45) {
      drawLayerImage(ctx, layer, {
        alpha: (bloom - 0.35) * 0.18,
        blur: 8 + minSide * 0.028 * bloom,
        operation: "screen",
      });
    }
  }

  drawLayerImage(ctx, layer, { alpha: 1, blur: 0, operation: "source-over" });
}

function createEffectLayer(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const layer = document.createElement("canvas");
  layer.width = Math.max(1, Math.round(w));
  layer.height = Math.max(1, Math.round(h));
  return layer;
}

function paletteFor(id?: SceneAnimationColorPalette) {
  return SCENE_ANIMATION_COLOR_PALETTES.find((palette) => palette.id === (id || "natural")) || SCENE_ANIMATION_COLOR_PALETTES[0];
}

function tintLayer(ctx: CanvasRenderingContext2D, w: number, h: number, rgb: [number, number, number], alpha: number) {
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function applyChromeMetalTint(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  paletteId: SceneAnimationColorPalette,
  elapsedSec: number,
  seed: number,
  shine: number
) {
  const gold = paletteId === "gold";
  const phase = (elapsedSec * (0.08 + shine * 0.12) + rand(seed, 76)) % 1;
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";

  // Chrome reads as alternating dark reflections, mid metal and sharp white
  // bands. The animated offset keeps it alive without needing texture assets.
  const g = ctx.createLinearGradient(-w * (0.35 + phase * 0.18), 0, w * (1.1 + phase * 0.18), h);
  if (gold) {
    g.addColorStop(0, "rgba(48,24,4,0.96)");
    g.addColorStop(0.14, "rgba(255,245,166,0.98)");
    g.addColorStop(0.27, "rgba(214,132,14,0.96)");
    g.addColorStop(0.42, "rgba(90,37,8,0.96)");
    g.addColorStop(0.56, "rgba(255,255,230,0.98)");
    g.addColorStop(0.71, "rgba(246,181,43,0.96)");
    g.addColorStop(0.86, "rgba(103,48,10,0.96)");
    g.addColorStop(1, "rgba(255,234,126,0.98)");
  } else {
    g.addColorStop(0, "rgba(18,24,38,0.96)");
    g.addColorStop(0.13, "rgba(255,255,255,0.98)");
    g.addColorStop(0.25, "rgba(136,154,178,0.96)");
    g.addColorStop(0.41, "rgba(12,18,32,0.96)");
    g.addColorStop(0.55, "rgba(255,255,255,0.98)");
    g.addColorStop(0.7, "rgba(176,194,219,0.96)");
    g.addColorStop(0.85, "rgba(40,51,71,0.96)");
    g.addColorStop(1, "rgba(245,250,255,0.98)");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // A thin bright reflection line sells the mirror/chrome finish on runes,
  // stars, sigils and particles, while source-atop keeps it inside the element.
  const sweepX = ((elapsedSec * (0.22 + shine * 0.42) + rand(seed, 77)) % 1.45 - 0.25) * w;
  const sweep = ctx.createLinearGradient(sweepX - w * 0.16, 0, sweepX + w * 0.16, h);
  sweep.addColorStop(0, "rgba(255,255,255,0)");
  sweep.addColorStop(0.42, `rgba(255,255,255,${0.08 + shine * 0.42})`);
  sweep.addColorStop(0.5, `rgba(255,255,255,${0.28 + shine * 0.55})`);
  sweep.addColorStop(0.58, `rgba(255,255,255,${0.08 + shine * 0.42})`);
  sweep.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function applySpecularShine(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  glow: string,
  elapsedSec: number,
  seed: number,
  shine: number,
  metallic = false
) {
  const minSide = Math.min(w, h);
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  const sweepX = ((elapsedSec * (0.16 + shine * 0.28) + rand(seed, 78)) % 1.5 - 0.25) * w;
  const sweep = ctx.createLinearGradient(sweepX - w * 0.12, h * -0.1, sweepX + w * 0.12, h * 1.1);
  sweep.addColorStop(0, "rgba(255,255,255,0)");
  sweep.addColorStop(0.46, `rgba(255,255,255,${(metallic ? 0.2 : 0.09) * shine})`);
  sweep.addColorStop(0.5, `rgba(255,255,255,${(metallic ? 0.68 : 0.35) * shine})`);
  sweep.addColorStop(0.54, `rgba(255,255,255,${(metallic ? 0.2 : 0.09) * shine})`);
  sweep.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = "source-atop";
  ctx.strokeStyle = `rgba(255,255,255,${0.35 + shine * 0.45})`;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 4 + minSide * 0.012 * shine;
  ctx.lineWidth = Math.max(1, minSide * 0.0018);
  const glints = metallic ? 8 : 4;
  for (let i = 0; i < glints; i++) {
    const flash = Math.sin(elapsedSec * (1.8 + shine * 2.4) + rand(seed, 120 + i) * Math.PI * 2);
    if (flash < 0.12) continue;
    const x = rand(seed, 130 + i) * w;
    const y = rand(seed, 150 + i) * h;
    const r = minSide * (0.006 + rand(seed, 170 + i) * 0.012) * (0.45 + shine * 0.9) * flash;
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r);
    ctx.lineTo(x, y + r);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLayerImage(
  ctx: CanvasRenderingContext2D,
  layer: HTMLCanvasElement,
  opts: {
    alpha: number;
    blur: number;
    operation: GlobalCompositeOperation;
    offsetX?: number;
    offsetY?: number;
    shadowColor?: string;
    shadowBlur?: number;
  }
) {
  ctx.save();
  ctx.globalAlpha = clamp(opts.alpha);
  ctx.globalCompositeOperation = opts.operation;
  if (opts.blur > 0.01) ctx.filter = `blur(${opts.blur.toFixed(1)}px)`;
  if (opts.shadowColor && opts.shadowBlur) {
    ctx.shadowColor = opts.shadowColor;
    ctx.shadowBlur = opts.shadowBlur;
  }
  ctx.drawImage(layer, opts.offsetX || 0, opts.offsetY || 0);
  ctx.restore();
}

function inferTrailDirection(type: string, seed: number): SceneAnimationDirection {
  if (type.includes("steam") || type.includes("smoke") || type.includes("fire")) return "up";
  if (type.includes("rain") || type.includes("snow") || type.includes("petal") || type.includes("leaf")) return "down-right";
  if (type.includes("shooting") || type.includes("meteor")) return "down-left";
  if (type.includes("starburst") || type.includes("aura") || type.includes("mandala")) return rand(seed, 53) > 0.5 ? "up" : "down";
  return rand(seed, 54) > 0.5 ? "right" : "left";
}

function clamp(n: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
}

function smoothstep(x: number) {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
}

function numericSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rand(seed: number, index = 0): number {
  const x = Math.sin((seed + index * 1013) * 12.9898) * 43758.5453123;
  return x - Math.floor(x);
}

function value(effectValue: SceneAnimationEffect, key: "intensity" | "speed" | "opacity" | "size" | "density" | "amount", fallback: number): number {
  const own = effectValue[key];
  const raw = typeof own === "number" ? own : fallback;
  // The scene-animation library should be plainly visible in the editor and in
  // exports. Keep user controls simple (0..1), then boost render strength so
  // subtle defaults do not disappear on busy photographs.
  const boost: Record<typeof key, number> = {
    intensity: 1.22,
    opacity: 1.34,
    amount: 1.24,
    density: 1.22,
    size: 1.08,
    speed: 1.06,
  };
  return clamp(raw * boost[key]);
}

function regionOf(effectValue: SceneAnimationEffect, fallback: SceneAnimationRegion = DEFAULT_SCENE_ANIMATION_REGION) {
  const r = effectValue.region || fallback;
  return {
    x: clamp(r.x) ,
    y: clamp(r.y),
    w: clamp(r.w, 0.02, 1),
    h: clamp(r.h, 0.02, 1),
  };
}

function originOf(effectValue: SceneAnimationEffect, fallback = { x: 0.5, y: 0.6 }) {
  const o = effectValue.origin || fallback;
  return { x: clamp(o.x), y: clamp(o.y) };
}

function directionVector(direction?: SceneAnimationDirection): { x: number; y: number } {
  switch (direction) {
    case "up": return { x: 0, y: -1 };
    case "left": return { x: -1, y: 0 };
    case "right": return { x: 1, y: 0 };
    case "up-left": return { x: -0.7, y: -0.7 };
    case "up-right": return { x: 0.7, y: -0.7 };
    case "down-left": return { x: -0.55, y: 1 };
    case "down-right": return { x: 0.55, y: 1 };
    case "down":
    default:
      return { x: 0, y: 1 };
  }
}

function computeWind(effects: SceneAnimationEffect[]): WindState {
  const wind = effects.find((e) => e.type === "wind" && e.enabled !== false);
  if (!wind) return { x: 0, y: 0, strength: 0 };
  const dir = directionVector(wind.direction || "right");
  const strength = value(wind, "intensity", 0.35);
  return { x: dir.x * strength, y: dir.y * strength * 0.35, strength };
}

function applyRegionClip(ctx: CanvasRenderingContext2D, r: SceneAnimationRegion, w: number, h: number, pad = 0) {
  ctx.beginPath();
  ctx.rect((r.x * w) - pad, (r.y * h) - pad, (r.w * w) + pad * 2, (r.h * h) + pad * 2);
  ctx.clip();
}

function setBlur(ctx: CanvasRenderingContext2D, px: number) {
  try {
    ctx.filter = `blur(${Math.max(0, px).toFixed(1)}px)`;
  } catch {}
}

function drawRain(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number, wind: WindState) {
  const density = value(e, "density", 0.45);
  const intensity = value(e, "intensity", 0.45);
  const speed = value(e, "speed", 0.55);
  const opacity = value(e, "opacity", 0.5);
  const variantBoost = e.variant === "heavy_rain" ? 1.55 : e.variant === "medium_rain" ? 1.15 : 0.8;
  const n = Math.round((70 + density * 210) * variantBoost);
  const dir = directionVector(e.direction || "down-right");
  const dx = (dir.x + wind.x * 0.9) * w * 0.035;
  const dy = Math.max(0.65, dir.y || 1) * h * 0.055 * (0.75 + intensity);
  ctx.lineWidth = Math.max(1, w / 900);
  ctx.strokeStyle = `rgba(205,225,255,${0.12 * opacity + 0.1 * intensity})`;
  ctx.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const rx = rand(seed, i * 7);
    const ry = rand(seed, i * 7 + 1);
    const rr = rand(seed, i * 7 + 2);
    const fall = (t * (0.5 + speed * 2.5) + ry) % 1;
    const x = ((rx * 1.25 - 0.12) * w + wind.x * fall * w * 0.08) % (w * 1.18);
    const y = (fall * 1.15 - 0.1) * h;
    const len = (0.55 + rr * 0.9) * (0.55 + intensity) ;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx * len, y + dy * len);
    ctx.stroke();
  }
}

function drawSnow(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number, wind: WindState) {
  const amount = value(e, "amount", 0.4);
  const speed = value(e, "speed", 0.3);
  const size = value(e, "size", 0.45);
  const opacity = value(e, "opacity", 0.72);
  const variantBoost = e.variant === "blizzard" ? 1.8 : e.variant === "heavy_snow" ? 1.35 : e.variant === "normal_snow" ? 1.0 : 0.65;
  const n = Math.round((45 + amount * 170) * variantBoost);
  const dir = directionVector(e.direction || "down-left");
  ctx.fillStyle = `rgba(245,250,255,${0.58 * opacity})`;
  for (let i = 0; i < n; i++) {
    const rx = rand(seed, i * 11);
    const ry = rand(seed, i * 11 + 1);
    const rs = rand(seed, i * 11 + 2);
    const phase = (t * (0.035 + speed * 0.24) * (0.45 + rs) + ry) % 1;
    const swirl = Math.sin((phase * 6 + rs * 7) * Math.PI) * w * (0.008 + size * 0.012);
    const x = (rx * w + (dir.x + wind.x) * phase * w * 0.24 + swirl + w) % w;
    const y = (phase * h * 1.15 - h * 0.08 + dir.y * phase * h * 0.08) % (h * 1.12);
    const r = Math.max(0.8, (1 + rs * 2.8) * (0.45 + size) * (w / 1280));
    ctx.globalAlpha = opacity * (0.35 + rs * 0.65);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function lightningPulse(t: number, seed: number, speed: number, variant?: string) {
  const freq = variant === "frequent_lightning" ? 0.42 : variant === "distant_lightning" ? 0.18 : 0.26;
  const phase = (t * (freq + speed * 0.3) + rand(seed, 2)) % 1;
  if (phase > 0.08) return 0;
  const flicker = rand(seed, Math.floor((t * (freq + speed * 0.3) + rand(seed, 2))));
  return Math.pow(1 - phase / 0.08, 2.5) * (0.55 + flicker * 0.45);
}

function drawLightning(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number) {
  const opacity = value(e, "opacity", 0.75);
  const intensity = value(e, "intensity", 0.5);
  const speed = value(e, "speed", 0.35);
  const pulse = lightningPulse(t, seed, speed, e.variant) * opacity;
  if (pulse <= 0.01) return;

  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = `rgba(185,210,255,${0.18 * pulse * (0.4 + intensity)})`;
  ctx.fillRect(0, 0, w, h);

  const startX = (0.15 + rand(seed, 10) * 0.7) * w;
  let x = startX;
  let y = 0;
  ctx.lineWidth = Math.max(1.2, w / 420) * (0.7 + intensity);
  ctx.strokeStyle = `rgba(235,245,255,${0.82 * pulse})`;
  ctx.shadowColor = "rgba(120,170,255,0.9)";
  ctx.shadowBlur = 18 * (w / 1280) * pulse;
  ctx.beginPath();
  ctx.moveTo(x, y);
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    x += (rand(seed, 20 + i) - 0.5) * w * 0.09;
    y = (i / steps) * h * (0.42 + rand(seed, 31) * 0.22);
    ctx.lineTo(x, y);
  }
  ctx.stroke();

  for (let b = 0; b < 2; b++) {
    ctx.beginPath();
    const bx = startX + (rand(seed, 70 + b) - 0.5) * w * 0.08;
    const by = h * (0.16 + rand(seed, 80 + b) * 0.18);
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + (rand(seed, 90 + b) - 0.5) * w * 0.2, by + h * (0.08 + rand(seed, 100 + b) * 0.12));
    ctx.stroke();
  }
}

function drawMist(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number, kind: string) {
  const density = value(e, "density", kind === "fog" ? 0.45 : 0.35);
  const speed = value(e, "speed", 0.18);
  const opacity = value(e, "opacity", 0.34);
  const r = regionOf(e, kind === "fog" ? mid : horizon);
  const dir = directionVector(e.direction || "right");
  applyRegionClip(ctx, r, w, h, h * 0.06);
  setBlur(ctx, Math.max(8, w * 0.012));
  const bands = Math.round(3 + density * 6);
  for (let i = 0; i < bands; i++) {
    const y = (r.y + (i + 0.5) / bands * r.h) * h + Math.sin(t * 0.4 + i) * h * 0.015;
    const phase = (t * (0.012 + speed * 0.04) * (dir.x || 1) + rand(seed, i)) % 1;
    const x = (r.x + 0.5) * w + (phase - 0.5) * w * 0.45;
    const bw = (0.45 + rand(seed, i + 10) * 0.45) * r.w * w;
    const bh = (0.18 + density * 0.22) * r.h * h;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, Math.max(bw, bh) * 0.55);
    grad.addColorStop(0, `rgba(235,240,245,${opacity * (0.12 + density * 0.16)})`);
    grad.addColorStop(1, "rgba(235,240,245,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(x, y, bw, bh, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawClouds(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number, kind: string) {
  const intensity = value(e, "intensity", kind === "storm_clouds" ? 0.55 : 0.35);
  const speed = value(e, "speed", 0.2);
  const opacity = value(e, "opacity", kind === "storm_clouds" ? 0.42 : 0.3);
  const r = regionOf(e, sky);
  const dir = directionVector(e.direction || (kind === "storm_clouds" ? "left" : "right"));
  applyRegionClip(ctx, r, w, h, h * 0.08);
  setBlur(ctx, Math.max(10, w * 0.01));
  ctx.globalCompositeOperation = kind === "storm_clouds" ? "multiply" : "screen";
  const clouds = Math.round(4 + intensity * 5);
  for (let c = 0; c < clouds; c++) {
    const cy = (r.y + rand(seed, c * 9 + 1) * r.h * 0.85 + r.h * 0.05) * h;
    const baseX = (r.x + rand(seed, c * 9) * r.w) * w;
    const drift = (t * (0.015 + speed * 0.07) * (dir.x || 1) * w + c * w * 0.08) % (w * 1.4);
    const cx = ((baseX + drift + w * 0.2) % (w * 1.4)) - w * 0.2;
    const cloudW = (0.16 + rand(seed, c * 9 + 2) * 0.22 + intensity * 0.08) * w;
    const cloudH = (0.05 + rand(seed, c * 9 + 3) * 0.08 + intensity * 0.04) * h;
    const col = kind === "storm_clouds" ? [40, 48, 64] : [230, 238, 250];
    for (let l = 0; l < 4; l++) {
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${opacity * (0.08 + intensity * 0.12)})`;
      ctx.beginPath();
      ctx.ellipse(
        cx + (rand(seed, c * 31 + l) - 0.5) * cloudW,
        cy + (rand(seed, c * 41 + l) - 0.5) * cloudH,
        cloudW * (0.32 + rand(seed, c * 51 + l) * 0.35),
        cloudH * (0.35 + rand(seed, c * 61 + l) * 0.5),
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }
}

function drawMovingShadows(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number) {
  const opacity = value(e, "opacity", 0.28);
  const intensity = value(e, "intensity", 0.35);
  const speed = value(e, "speed", 0.2);
  const dir = directionVector(e.direction || "right");
  ctx.globalCompositeOperation = "multiply";
  setBlur(ctx, w * 0.012);
  const phase = (t * (0.012 + speed * 0.055) * (dir.x || 1) + rand(seed, 4)) % 1;
  for (let i = 0; i < 3; i++) {
    const x = ((phase + i * 0.42) % 1) * w * 1.4 - w * 0.2;
    const grad = ctx.createLinearGradient(x - w * 0.18, 0, x + w * 0.22, h);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.48, `rgba(20,26,34,${opacity * (0.08 + intensity * 0.18)})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawGlow(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number, kind: string) {
  const opacity = value(e, "opacity", 0.3);
  const intensity = value(e, "intensity", 0.38);
  const o = originOf(e, kind === "moonlight" ? { x: 0.78, y: 0.16 } : { x: 0.35, y: 0.28 });
  const pulse = 0.85 + Math.sin(t * 0.7 + seed) * 0.15;
  const color = kind === "moonlight" ? [125, 170, 255] : kind === "sunrise_glow" ? [255, 172, 120] : [255, 191, 87];
  ctx.globalCompositeOperation = "screen";
  const radius = Math.max(w, h) * (0.45 + intensity * 0.35);
  const grad = ctx.createRadialGradient(o.x * w, o.y * h, 0, o.x * w, o.y * h, radius);
  grad.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},${opacity * intensity * 0.55 * pulse})`);
  grad.addColorStop(0.45, `rgba(${color[0]},${color[1]},${color[2]},${opacity * intensity * 0.18 * pulse})`);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function drawStars(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number) {
  const amount = value(e, "amount", 0.35);
  const opacity = value(e, "opacity", 0.65);
  const size = value(e, "size", 0.35);
  const speed = value(e, "speed", 0.22);
  const r = regionOf(e, sky);
  applyRegionClip(ctx, r, w, h);
  ctx.globalCompositeOperation = "screen";
  const n = Math.round(30 + amount * 150);
  for (let i = 0; i < n; i++) {
    const x = (r.x + rand(seed, i * 3) * r.w) * w;
    const y = (r.y + rand(seed, i * 3 + 1) * r.h) * h;
    const twinkle = 0.35 + 0.65 * Math.pow(Math.sin(t * (0.5 + speed * 3) + rand(seed, i * 3 + 2) * Math.PI * 2) * 0.5 + 0.5, 2);
    const rr = Math.max(0.6, (0.6 + rand(seed, i * 3 + 3) * 1.4) * (0.6 + size) * (w / 1280));
    ctx.fillStyle = `rgba(235,245,255,${opacity * twinkle})`;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawShootingStar(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number, kind: string) {
  const opacity = value(e, "opacity", 0.8);
  const speed = value(e, "speed", 0.5);
  const intensity = value(e, "intensity", kind === "meteor" ? 0.55 : 0.35);
  const r = regionOf(e, sky);
  const cycle = 5.5 - speed * 2.2;
  const p = ((t + rand(seed, 1) * cycle) % cycle) / cycle;
  if (p > 0.22) return;
  const local = p / 0.22;
  const dir = directionVector(e.direction || "down-right");
  const sx = (r.x + rand(seed, 7) * r.w * 0.8) * w;
  const sy = (r.y + rand(seed, 8) * r.h * 0.45) * h;
  const travel = w * 0.42 * smoothstep(local);
  const x = sx + dir.x * travel;
  const y = sy + Math.abs(dir.y || 0.5) * travel * 0.35;
  const len = w * (kind === "meteor" ? 0.16 : 0.11) * (0.8 + intensity);
  ctx.globalCompositeOperation = "screen";
  ctx.lineCap = "round";
  const a = Math.sin(local * Math.PI) * opacity;
  const grad = ctx.createLinearGradient(x, y, x - dir.x * len, y - Math.abs(dir.y || 0.5) * len * 0.35);
  grad.addColorStop(0, `rgba(255,255,245,${a})`);
  grad.addColorStop(1, "rgba(255,180,90,0)");
  ctx.strokeStyle = grad;
  ctx.lineWidth = Math.max(1.2, w / (kind === "meteor" ? 360 : 520));
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - dir.x * len, y - Math.abs(dir.y || 0.5) * len * 0.35);
  ctx.stroke();
}

function drawAurora(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number) {
  const opacity = value(e, "opacity", 0.38);
  const intensity = value(e, "intensity", 0.42);
  const speed = value(e, "speed", 0.18);
  const r = regionOf(e, { x: 0, y: 0.05, w: 1, h: 0.42 });
  applyRegionClip(ctx, r, w, h);
  ctx.globalCompositeOperation = "screen";
  setBlur(ctx, w * 0.006);
  for (let band = 0; band < 3; band++) {
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const x = (r.x + (i / 80) * r.w) * w;
      const y = (r.y + r.h * (0.25 + band * 0.17)) * h + Math.sin(i * 0.22 + t * (0.35 + speed) + band + seed) * h * (0.02 + intensity * 0.025);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineWidth = h * (0.035 + intensity * 0.035);
    ctx.strokeStyle = band === 1 ? `rgba(90,255,180,${opacity * 0.45})` : `rgba(90,150,255,${opacity * 0.28})`;
    ctx.stroke();
  }
}

function drawWater(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number, kind: string) {
  const opacity = value(e, "opacity", 0.38);
  const intensity = value(e, "intensity", 0.4);
  const speed = value(e, "speed", 0.35);
  const r = regionOf(e, lower);
  applyRegionClip(ctx, r, w, h);
  ctx.globalCompositeOperation = "screen";
  const rx = r.x * w;
  const ry = r.y * h;
  const rw = r.w * w;
  const rh = r.h * h;

  if (kind === "waterfall_movement") {
    ctx.lineWidth = Math.max(1, w / 900);
    for (let i = 0; i < 34 + intensity * 36; i++) {
      const x = rx + rand(seed, i) * rw;
      const phase = (t * (0.2 + speed) + rand(seed, i + 2)) % 1;
      const y = ry + phase * rh;
      ctx.strokeStyle = `rgba(210,235,255,${opacity * (0.12 + rand(seed, i + 5) * 0.18)})`;
      ctx.beginPath();
      ctx.moveTo(x, y - rh * 0.18);
      ctx.lineTo(x + (rand(seed, i + 9) - 0.5) * rw * 0.04, y + rh * 0.18);
      ctx.stroke();
    }
    return;
  }

  const lines = kind === "ocean_waves" ? 14 : 10;
  ctx.lineWidth = Math.max(1, w / 700) * (kind === "ocean_waves" ? 1.4 : 1);
  for (let j = 0; j < lines; j++) {
    const y = ry + (j + 0.5) / lines * rh;
    const amp = rh * (0.012 + intensity * 0.025) * (kind === "ocean_waves" ? 1.5 : 1);
    const phase = t * (0.6 + speed * 1.7) + j * 0.9 + seed * 0.001;
    ctx.strokeStyle = `rgba(200,230,255,${opacity * (0.08 + intensity * 0.18) * (1 - j / (lines * 1.6))})`;
    ctx.beginPath();
    for (let i = 0; i <= 90; i++) {
      const x = rx + (i / 90) * rw;
      const yy = y + Math.sin(i * 0.18 + phase) * amp + Math.sin(i * 0.05 + phase * 1.7) * amp * 0.7;
      if (i === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }

  if (kind === "water_shimmer" || kind === "river_flow") {
    for (let i = 0; i < 20 + intensity * 35; i++) {
      const p = (t * (0.03 + speed * 0.11) + rand(seed, i)) % 1;
      const x = rx + ((rand(seed, i + 1) + p) % 1) * rw;
      const y = ry + rand(seed, i + 2) * rh;
      const len = rw * (0.035 + rand(seed, i + 3) * 0.08);
      ctx.strokeStyle = `rgba(255,245,205,${opacity * (0.08 + rand(seed, i + 4) * 0.18)})`;
      ctx.lineWidth = Math.max(1, w / 1000);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y + Math.sin(p * Math.PI * 2) * rh * 0.015);
      ctx.stroke();
    }
  }
}

function drawFloatingLeaves(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number, wind: WindState) {
  const amount = value(e, "amount", 0.3);
  const speed = value(e, "speed", 0.25);
  const size = value(e, "size", 0.35);
  const opacity = value(e, "opacity", 0.56);
  const r = regionOf(e, lower);
  const dir = directionVector(e.direction || "right");
  applyRegionClip(ctx, r, w, h);
  const n = Math.round(8 + amount * 28);
  for (let i = 0; i < n; i++) {
    const p = (t * (0.012 + speed * 0.055) + rand(seed, i)) % 1;
    const x = (r.x + ((rand(seed, i + 4) + p * (dir.x + wind.x + 0.2)) % 1) * r.w) * w;
    const y = (r.y + rand(seed, i + 5) * r.h) * h + Math.sin(p * Math.PI * 2 + i) * h * 0.008;
    const s = (4 + rand(seed, i + 6) * 8) * (0.6 + size) * (w / 1280);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t + i) * 0.8);
    ctx.fillStyle = `rgba(180,110,45,${opacity * (0.45 + rand(seed, i + 7) * 0.45)})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, s, s * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawBirds(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number, kind: string) {
  const amount = value(e, "amount", kind === "bird_flock" ? 0.5 : 0.28);
  const speed = value(e, "speed", 0.34);
  const size = value(e, "size", 0.32);
  const opacity = value(e, "opacity", 0.7);
  const r = regionOf(e, sky);
  const dir = directionVector(e.direction || "right");
  const n = Math.round(kind === "bird_flock" ? 8 + amount * 22 : 2 + amount * 8);
  ctx.strokeStyle = `rgba(12,16,22,${opacity})`;
  ctx.lineWidth = Math.max(1.1, w / 820) * (0.5 + size);
  ctx.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const p = (t * (0.018 + speed * 0.075) + rand(seed, i * 3)) % 1;
    const baseX = dir.x >= 0 ? (r.x - 0.12 + p * (r.w + 0.24)) : (r.x + r.w + 0.12 - p * (r.w + 0.24));
    const x = baseX * w + (rand(seed, i * 3 + 1) - 0.5) * w * 0.08;
    const y = (r.y + 0.18 * r.h + rand(seed, i * 3 + 2) * r.h * 0.55) * h + Math.sin(p * Math.PI * 2 + i) * h * 0.018;
    const s = (6 + rand(seed, i + 20) * 10) * (0.45 + size) * (w / 1280);
    const wing = Math.sin(t * 7 + i) * s * 0.18;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - s * dir.x, y + s * 0.45 + wing);
    ctx.moveTo(x, y);
    ctx.lineTo(x + s * dir.x, y + s * 0.45 - wing);
    ctx.stroke();
  }
}

function drawFlutterers(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number) {
  const amount = value(e, "amount", 0.32);
  const speed = value(e, "speed", 0.35);
  const size = value(e, "size", 0.38);
  const opacity = value(e, "opacity", 0.66);
  const r = regionOf(e, mid);
  const n = Math.round(3 + amount * 15);
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < n; i++) {
    const p = (t * (0.018 + speed * 0.06) + rand(seed, i)) % 1;
    const x = (r.x + ((rand(seed, i + 2) + p * 0.7) % 1) * r.w) * w;
    const y = (r.y + rand(seed, i + 3) * r.h) * h + Math.sin(p * 8 + i) * h * 0.035;
    const s = (3 + rand(seed, i + 4) * 5) * (0.6 + size) * (w / 1280);
    const hue = e.variant === "dragonflies" ? [145, 220, 255] : e.variant === "bees" ? [255, 210, 80] : [255, 165, 210];
    ctx.fillStyle = `rgba(${hue[0]},${hue[1]},${hue[2]},${opacity * 0.55})`;
    ctx.beginPath();
    ctx.ellipse(x - s * 0.5, y, s, s * 0.55, Math.sin(t * 6 + i), 0, Math.PI * 2);
    ctx.ellipse(x + s * 0.5, y, s, s * 0.55, -Math.sin(t * 6 + i), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFireflies(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number) {
  const amount = value(e, "amount", 0.38);
  const speed = value(e, "speed", 0.26);
  const size = value(e, "size", 0.42);
  const opacity = value(e, "opacity", 0.68);
  const r = regionOf(e, mid);
  const n = Math.round(10 + amount * 42);
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < n; i++) {
    const baseX = (r.x + rand(seed, i) * r.w) * w;
    const baseY = (r.y + rand(seed, i + 1) * r.h) * h;
    const x = baseX + Math.sin(t * (0.5 + speed * 2) + i) * w * 0.018;
    const y = baseY + Math.cos(t * (0.4 + speed * 1.8) + i * 1.7) * h * 0.018;
    const blink = Math.pow(Math.sin(t * (1 + speed * 4) + rand(seed, i + 2) * 10) * 0.5 + 0.5, 2.4);
    const rr = (2 + rand(seed, i + 3) * 3) * (0.55 + size) * (w / 1280);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rr * 5);
    grad.addColorStop(0, `rgba(255,245,135,${opacity * blink})`);
    grad.addColorStop(1, "rgba(255,245,135,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, rr * 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFallingNature(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number, wind: WindState, kind: string) {
  const amount = value(e, "amount", 0.35);
  const speed = value(e, "speed", 0.28);
  const size = value(e, "size", 0.38);
  const opacity = value(e, "opacity", 0.66);
  const r = regionOf(e, full);
  const dir = directionVector(e.direction || "down-right");
  applyRegionClip(ctx, r, w, h);
  const n = Math.round(16 + amount * 70);
  for (let i = 0; i < n; i++) {
    const p = (t * (0.018 + speed * 0.09) * (0.6 + rand(seed, i)) + rand(seed, i + 1)) % 1;
    const x = (r.x + ((rand(seed, i + 2) + p * (dir.x * 0.32 + wind.x * 0.3) + 1) % 1) * r.w) * w;
    const y = (r.y + ((p * (dir.y >= 0 ? 1 : -0.5) + rand(seed, i + 3)) % 1) * r.h) * h;
    const s = (2.5 + rand(seed, i + 4) * 7) * (0.55 + size) * (w / 1280);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * (0.5 + speed * 2) + i);
    if (kind === "falling_petals") ctx.fillStyle = `rgba(255,170,205,${opacity * 0.65})`;
    else if (kind === "pollen") ctx.fillStyle = `rgba(245,215,125,${opacity * 0.45})`;
    else ctx.fillStyle = `rgba(190,105,42,${opacity * 0.65})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, s, s * (kind === "pollen" ? 0.35 : 0.55), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawGrassSway(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number) {
  const intensity = value(e, "intensity", 0.32);
  const speed = value(e, "speed", 0.26);
  const opacity = value(e, "opacity", 0.28);
  const r = regionOf(e, bottom);
  const dir = directionVector(e.direction || "right");
  applyRegionClip(ctx, r, w, h);
  ctx.strokeStyle = `rgba(150,205,130,${opacity})`;
  ctx.lineWidth = Math.max(1, w / 900);
  const blades = 45;
  for (let i = 0; i < blades; i++) {
    const x = (r.x + (i / blades) * r.w + (rand(seed, i) - 0.5) * 0.02) * w;
    const baseY = (r.y + r.h) * h;
    const len = r.h * h * (0.15 + rand(seed, i + 1) * 0.28);
    const sway = Math.sin(t * (0.7 + speed * 2.4) + i * 0.37) * intensity * w * 0.018 * (dir.x || 1);
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.quadraticCurveTo(x + sway * 0.45, baseY - len * 0.55, x + sway, baseY - len);
    ctx.stroke();
  }
}


function drawMysticalGoldenSigns(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number) {
  const amount = value(e, "amount", 0.5);
  const intensity = value(e, "intensity", 0.78);
  const speed = value(e, "speed", 0.32);
  const opacity = value(e, "opacity", 0.82);
  const size = value(e, "size", 0.5);
  const r = regionOf(e, full);
  const origin = originOf(e, { x: 0.5, y: 0.55 });
  const dir = directionVector(e.direction || "up");
  const glyphSets: Record<string, string[]> = {
    ancient_runes: ["ᚠ", "ᚱ", "ᛟ", "ᛞ", "ᚨ", "ᛉ", "ᛜ", "ᚷ"],
    floating_glyphs: ["✦", "✧", "✺", "✷", "✹", "◇", "△", "◌"],
    sacred_geometry: ["◎", "△", "◈", "⬡", "✦", "☉", "◇", "◌"],
    golden_scripture: ["✶", "✧", "☥", "☉", "✺", "✦", "◇", "△"],
  };
  const glyphs = glyphSets[e.variant || ""] || ["✦", "✧", "☥", "☉", "△", "◇", "◎", "✺", "✷"];
  applyRegionClip(ctx, r, w, h);
  ctx.globalCompositeOperation = "screen";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const n = Math.round(7 + amount * 25);
  for (let i = 0; i < n; i++) {
    const p = (t * (0.018 + speed * 0.075) * (0.75 + rand(seed, i)) + rand(seed, i + 11)) % 1;
    const drift = smoothstep(p);
    const baseX = (r.x + rand(seed, i * 5) * r.w) * w;
    const baseY = (r.y + rand(seed, i * 5 + 1) * r.h) * h;
    const x = baseX + (origin.x - 0.5) * w * 0.08 + dir.x * drift * w * 0.16 + Math.sin(t * 0.7 + i) * w * 0.018;
    const y = baseY + (origin.y - 0.5) * h * 0.08 + dir.y * drift * h * 0.18 + Math.cos(t * 0.6 + i * 1.3) * h * 0.015;
    const fontSize = (18 + rand(seed, i * 5 + 2) * 34) * (0.62 + size) * (w / 1280);
    const pulse = 0.45 + 0.55 * Math.sin(t * (0.9 + speed * 2.4) + rand(seed, i + 33) * 8) ** 2;
    const a = opacity * (0.22 + intensity * 0.52) * pulse;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rand(seed, i * 5 + 3) - 0.5) * 0.8 + Math.sin(t * 0.25 + i) * 0.18);
    ctx.font = `700 ${Math.max(8, fontSize)}px Georgia, 'Times New Roman', serif`;
    ctx.shadowColor = `rgba(255,190,64,${Math.min(1, a)})`;
    ctx.shadowBlur = Math.max(8, fontSize * 0.55);
    ctx.fillStyle = `rgba(255,213,94,${Math.min(1, a)})`;
    ctx.fillText(glyphs[i % glyphs.length], 0, 0);
    ctx.strokeStyle = `rgba(255,248,190,${Math.min(1, a * 0.55)})`;
    ctx.lineWidth = Math.max(0.7, fontSize * 0.035);
    ctx.strokeText(glyphs[i % glyphs.length], 0, 0);
    ctx.restore();
  }
}

function drawGlowingOrbs(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number) {
  const amount = value(e, "amount", 0.44);
  const speed = value(e, "speed", 0.28);
  const size = value(e, "size", 0.52);
  const opacity = value(e, "opacity", 0.72);
  const r = regionOf(e, full);
  const dir = directionVector(e.direction || "up-right");
  applyRegionClip(ctx, r, w, h);
  ctx.globalCompositeOperation = "screen";
  const n = Math.round(10 + amount * 38);
  const palette = e.variant === "spirit_lights" ? [150, 210, 255] : e.variant === "fairy_lights" ? [185, 255, 160] : [255, 210, 82];
  for (let i = 0; i < n; i++) {
    const p = (t * (0.012 + speed * 0.06) + rand(seed, i)) % 1;
    const x = (r.x + ((rand(seed, i + 1) + p * dir.x * 0.22 + 1) % 1) * r.w) * w + Math.sin(t * 0.9 + i) * w * 0.014;
    const y = (r.y + ((rand(seed, i + 2) + p * dir.y * 0.18 + 1) % 1) * r.h) * h + Math.cos(t * 0.7 + i) * h * 0.014;
    const rr = (7 + rand(seed, i + 3) * 18) * (0.45 + size) * (w / 1280);
    const pulse = 0.45 + 0.55 * Math.sin(t * (1 + speed * 3) + i * 1.7) ** 2;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rr * 4.8);
    grad.addColorStop(0, `rgba(255,255,230,${opacity * pulse})`);
    grad.addColorStop(0.22, `rgba(${palette[0]},${palette[1]},${palette[2]},${opacity * 0.72 * pulse})`);
    grad.addColorStop(1, `rgba(${palette[0]},${palette[1]},${palette[2]},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, rr * 4.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEnergyWaves(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number) {
  const intensity = value(e, "intensity", 0.72);
  const speed = value(e, "speed", 0.42);
  const size = value(e, "size", 0.52);
  const opacity = value(e, "opacity", 0.68);
  const origin = originOf(e, { x: 0.5, y: 0.5 });
  const r = regionOf(e, full);
  applyRegionClip(ctx, r, w, h);
  ctx.globalCompositeOperation = "screen";
  const cx = origin.x * w;
  const cy = origin.y * h;
  const maxR = Math.max(w, h) * (0.18 + size * 0.44);
  for (let i = 0; i < 5; i++) {
    const p = (t * (0.08 + speed * 0.22) + i / 5 + rand(seed, 2) * 0.2) % 1;
    const eased = smoothstep(p);
    const radius = maxR * eased;
    const a = opacity * intensity * Math.sin(p * Math.PI) * 0.72;
    ctx.strokeStyle = e.variant === "portal_rings" ? `rgba(120,220,255,${a})` : `rgba(255,205,80,${a})`;
    ctx.lineWidth = Math.max(1, (2 + intensity * 5) * (w / 1280) * (1 - p * 0.35));
    ctx.shadowColor = e.variant === "portal_rings" ? "rgba(90,200,255,0.9)" : "rgba(255,190,60,0.9)";
    ctx.shadowBlur = Math.max(8, w * 0.012) * a;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius * (1.05 + Math.sin(t * 0.5) * 0.04), radius * (0.45 + intensity * 0.25), Math.sin(t * 0.2 + i) * 0.18, 0, Math.PI * 2);
    ctx.stroke();
  }
  // A faint core keeps the ring source visible without drawing a background plate.
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.35);
  core.addColorStop(0, `rgba(255,225,110,${opacity * intensity * 0.22})`);
  core.addColorStop(1, "rgba(255,225,110,0)");
  ctx.fillStyle = core;
  ctx.fillRect(cx - maxR * 0.35, cy - maxR * 0.35, maxR * 0.7, maxR * 0.7);
}

function drawSceneReactiveGlow(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number, audioLevel?: number) {
  const intensity = value(e, "intensity", 0.7);
  const speed = value(e, "speed", 0.5);
  const size = value(e, "size", 0.55);
  const opacity = value(e, "opacity", 0.58);
  const origin = originOf(e, { x: 0.5, y: 0.5 });
  const r = regionOf(e, full);
  applyRegionClip(ctx, r, w, h);
  const synthetic = 0.35 + 0.65 * Math.sin(t * (1.2 + speed * 3.2) + seed) ** 2;
  const energy = clamp((audioLevel ?? synthetic) * 1.35, 0, 1);
  const pulse = 0.28 + energy * 0.72;
  const cx = origin.x * w;
  const cy = origin.y * h;
  const radius = Math.max(w, h) * (0.18 + size * 0.38) * (0.78 + pulse * 0.35);
  ctx.globalCompositeOperation = "screen";
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  grad.addColorStop(0, `rgba(255,230,120,${opacity * intensity * 0.5 * pulse})`);
  grad.addColorStop(0.38, `rgba(170,90,255,${opacity * intensity * 0.22 * pulse})`);
  grad.addColorStop(1, "rgba(170,90,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = `rgba(255,235,150,${opacity * intensity * 0.55 * pulse})`;
  ctx.lineWidth = Math.max(1, w / 640) * (0.7 + pulse);
  ctx.shadowColor = "rgba(255,205,95,0.9)";
  ctx.shadowBlur = Math.max(8, w * 0.011) * pulse;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.26 * (0.85 + pulse * 0.4), 0, Math.PI * 2);
  ctx.stroke();
}


function drawRegularPolygon(ctx: CanvasRenderingContext2D, sides: number, radius: number, rotation = 0) {
  ctx.beginPath();
  for (let i = 0; i <= sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

function drawStarGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number, color = "255,220,100") {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = `rgba(${color},${alpha})`;
  ctx.fillStyle = `rgba(${color},${alpha * 0.18})`;
  ctx.lineWidth = Math.max(0.8, r * 0.08);
  ctx.shadowColor = `rgba(${color},${Math.min(1, alpha)})`;
  ctx.shadowBlur = r * 1.5;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const len = i % 2 === 0 ? r : r * 0.48;
    ctx.moveTo(Math.cos(a) * r * 0.12, Math.sin(a) * r * 0.12);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSigilWheel(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, rotation: number, alpha: number, variant?: string) {
  const cool = variant === "angel_seal";
  const color = cool ? "170,215,255" : "255,210,82";
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = `rgba(${color},${alpha})`;
  ctx.fillStyle = `rgba(${color},${alpha * 0.18})`;
  ctx.lineWidth = Math.max(1, radius * 0.018);
  ctx.shadowColor = `rgba(${color},${Math.min(1, alpha)})`;
  ctx.shadowBlur = radius * 0.22;

  for (const mul of [1, 0.78, 0.48, 0.22]) {
    ctx.beginPath();
    ctx.arc(0, 0, radius * mul, 0, Math.PI * 2);
    ctx.stroke();
  }
  drawRegularPolygon(ctx, 3, radius * 0.72, Math.PI / 6);
  ctx.stroke();
  drawRegularPolygon(ctx, 6, radius * 0.58, 0);
  ctx.stroke();
  drawRegularPolygon(ctx, 8, radius * 0.35, Math.PI / 8);
  ctx.stroke();

  const nodes = variant === "floating_sigil_wheels" ? 10 : 12;
  for (let i = 0; i < nodes; i++) {
    const a = (i / nodes) * Math.PI * 2;
    const nx = Math.cos(a) * radius * 0.88;
    const ny = Math.sin(a) * radius * 0.88;
    ctx.beginPath();
    ctx.arc(nx, ny, radius * 0.035, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * radius * 0.48, Math.sin(a) * radius * 0.48);
    ctx.lineTo(nx, ny);
    ctx.stroke();
  }

  // Ornamental petal arcs around the middle ring.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(radius * 0.52, 0, radius * 0.11, radius * 0.034, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Central radiant star.
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const rr = i % 2 === 0 ? radius * 0.28 : radius * 0.12;
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawEnchantedSigil(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number) {
  const amount = value(e, "amount", 0.34);
  const intensity = value(e, "intensity", 0.82);
  const speed = value(e, "speed", 0.26);
  const size = value(e, "size", 0.52);
  const opacity = value(e, "opacity", 0.82);
  const origin = originOf(e, { x: 0.5, y: 0.5 });
  const r = regionOf(e, full);
  applyRegionClip(ctx, r, w, h);
  const central = e.variant !== "floating_sigil_wheels";
  const count = central ? 1 + Math.round(amount * 2) : 3 + Math.round(amount * 7);
  for (let i = 0; i < count; i++) {
    const rx = central ? origin.x : r.x + rand(seed, i * 8) * r.w;
    const ry = central ? origin.y : r.y + rand(seed, i * 8 + 1) * r.h;
    const radius = Math.min(w, h) * (central ? 0.11 + size * 0.18 : 0.045 + size * 0.09) * (0.78 + rand(seed, i * 8 + 2) * 0.55);
    const pulse = 0.72 + 0.28 * Math.sin(t * (0.55 + speed * 1.8) + i * 1.9);
    const rot = t * (0.08 + speed * 0.24) * (i % 2 ? -1 : 1) + rand(seed, i * 8 + 3) * Math.PI * 2;
    drawSigilWheel(ctx, rx * w, ry * h, radius, rot, opacity * intensity * pulse, e.variant);
  }
}

function drawMandalaBloom(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number) {
  const intensity = value(e, "intensity", 0.68);
  const speed = value(e, "speed", 0.28);
  const size = value(e, "size", 0.58);
  const opacity = value(e, "opacity", 0.66);
  const origin = originOf(e, { x: 0.5, y: 0.5 });
  const r = regionOf(e, full);
  applyRegionClip(ctx, r, w, h);
  const cx = origin.x * w;
  const cy = origin.y * h;
  const breath = 0.82 + 0.18 * Math.sin(t * (0.45 + speed * 1.5));
  const radius = Math.min(w, h) * (0.13 + size * 0.2) * breath;
  const color = e.variant === "chakra_wheel" ? "145,125,255" : e.variant === "healing_glow" ? "120,255,190" : "255,200,105";
  ctx.globalCompositeOperation = "screen";
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(t * (0.035 + speed * 0.12));
  ctx.strokeStyle = `rgba(${color},${opacity * intensity * 0.72})`;
  ctx.fillStyle = `rgba(${color},${opacity * intensity * 0.13})`;
  ctx.lineWidth = Math.max(1, radius * 0.012);
  ctx.shadowColor = `rgba(${color},0.9)`;
  ctx.shadowBlur = radius * 0.18;
  for (const petals of [8, 12, 24]) {
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(radius * 0.38, 0, radius * (0.16 + 0.04 * Math.sin(t + i)), radius * 0.045, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
  for (const mul of [0.25, 0.48, 0.72, 0.96]) {
    ctx.beginPath();
    ctx.arc(0, 0, radius * mul, 0, Math.PI * 2);
    ctx.stroke();
  }
  drawRegularPolygon(ctx, 6, radius * 0.62, Math.PI / 6);
  ctx.stroke();
  drawRegularPolygon(ctx, 3, radius * 0.42, -Math.PI / 2);
  ctx.stroke();
  ctx.restore();
}

function drawCelestialTwinkles(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number) {
  const amount = value(e, "amount", 0.55);
  const intensity = value(e, "intensity", 0.76);
  const speed = value(e, "speed", 0.42);
  const size = value(e, "size", 0.46);
  const opacity = value(e, "opacity", 0.82);
  const r = regionOf(e, full);
  const dir = directionVector(e.direction || "up");
  applyRegionClip(ctx, r, w, h);
  ctx.globalCompositeOperation = "screen";
  const n = Math.round(34 + amount * 130);
  const isGold = e.variant === "golden_star_rain" || e.variant === "motivational_sparkles";
  const color = isGold ? "255,220,100" : e.variant === "diamond_glints" ? "210,240,255" : "245,248,255";
  for (let i = 0; i < n; i++) {
    const drift = (t * (0.006 + speed * 0.035) + rand(seed, i * 3 + 7)) % 1;
    const x = (r.x + ((rand(seed, i * 3) + drift * dir.x * 0.18 + 1) % 1) * r.w) * w;
    const y = (r.y + ((rand(seed, i * 3 + 1) + drift * dir.y * 0.12 + 1) % 1) * r.h) * h;
    const flash = Math.pow(Math.sin(t * (1.3 + speed * 5.5) + rand(seed, i * 3 + 2) * Math.PI * 2) * 0.5 + 0.5, e.variant === "flash_stars" ? 7 : 3.2);
    const base = (2.2 + rand(seed, i + 100) * 7) * (0.55 + size) * (w / 1280);
    drawStarGlyph(ctx, x, y, base * (1 + flash * intensity * 1.6), opacity * (0.22 + flash * 0.78), color);
  }
}

function drawConstellationLines(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number) {
  const amount = value(e, "amount", 0.42);
  const intensity = value(e, "intensity", 0.6);
  const speed = value(e, "speed", 0.24);
  const size = value(e, "size", 0.38);
  const opacity = value(e, "opacity", 0.62);
  const r = regionOf(e, sky);
  applyRegionClip(ctx, r, w, h);
  ctx.globalCompositeOperation = "screen";
  const groups = Math.round(2 + amount * 5);
  for (let g = 0; g < groups; g++) {
    const points = 4 + Math.round(rand(seed, g) * 4);
    const coords: Array<[number, number]> = [];
    for (let i = 0; i < points; i++) {
      coords.push([
        (r.x + (rand(seed, g * 40 + i * 3) * 0.22 + (i / Math.max(1, points - 1)) * 0.7) * r.w) * w,
        (r.y + (0.15 + rand(seed, g * 40 + i * 3 + 1) * 0.7) * r.h) * h,
      ]);
    }
    ctx.strokeStyle = `rgba(190,220,255,${opacity * intensity * 0.34})`;
    ctx.lineWidth = Math.max(1, w / 1100);
    ctx.beginPath();
    coords.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
    for (let i = 0; i < coords.length; i++) {
      const [x, y] = coords[i];
      const tw = 0.45 + 0.55 * Math.sin(t * (0.7 + speed * 3) + i + g) ** 2;
      drawStarGlyph(ctx, x, y, (3 + size * 7) * (w / 1280), opacity * tw, "210,230,255");
    }
  }
}

function drawMeditationAura(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number) {
  const intensity = value(e, "intensity", 0.62);
  const speed = value(e, "speed", 0.24);
  const size = value(e, "size", 0.58);
  const opacity = value(e, "opacity", 0.5);
  const origin = originOf(e, { x: 0.5, y: 0.52 });
  const r = regionOf(e, full);
  applyRegionClip(ctx, r, w, h);
  const cx = origin.x * w;
  const cy = origin.y * h;
  const breath = 0.68 + 0.32 * Math.sin(t * (0.35 + speed * 1.2) + seed) ** 2;
  const maxR = Math.max(w, h) * (0.18 + size * 0.32) * (0.9 + breath * 0.2);
  const color = e.variant === "healing_glow" ? "115,255,190" : e.variant === "peaceful_pulse" ? "160,205,255" : "195,150,255";
  ctx.globalCompositeOperation = "screen";
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
  grad.addColorStop(0, `rgba(255,245,210,${opacity * intensity * 0.28 * breath})`);
  grad.addColorStop(0.42, `rgba(${color},${opacity * intensity * 0.2 * breath})`);
  grad.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = `rgba(${color},${opacity * intensity * 0.55 * breath})`;
  ctx.lineWidth = Math.max(1, w / 900);
  ctx.shadowColor = `rgba(${color},0.9)`;
  ctx.shadowBlur = Math.max(8, w * 0.01) * breath;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, maxR * (0.18 + i * 0.17) * (0.94 + breath * 0.1), 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawMotivationalStarburst(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number) {
  const amount = value(e, "amount", 0.45);
  const intensity = value(e, "intensity", 0.76);
  const speed = value(e, "speed", 0.4);
  const size = value(e, "size", 0.54);
  const opacity = value(e, "opacity", 0.62);
  const origin = originOf(e, { x: 0.5, y: 0.42 });
  const dir = directionVector(e.direction || "up");
  const r = regionOf(e, full);
  applyRegionClip(ctx, r, w, h);
  ctx.globalCompositeOperation = "screen";
  const cx = origin.x * w;
  const cy = origin.y * h;
  const rays = Math.round(10 + amount * 24);
  for (let i = 0; i < rays; i++) {
    const a = -Math.PI / 2 + (i / Math.max(1, rays - 1) - 0.5) * Math.PI * 1.25;
    const pulse = 0.35 + 0.65 * Math.sin(t * (0.8 + speed * 3) + i * 0.6) ** 2;
    const len = Math.max(w, h) * (0.18 + size * 0.38) * (0.7 + pulse * 0.5);
    const grad = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    grad.addColorStop(0, `rgba(255,230,120,${opacity * intensity * 0.4 * pulse})`);
    grad.addColorStop(1, "rgba(255,230,120,0)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = Math.max(1, w / 900) * (1 + intensity * 2.2);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    ctx.stroke();
  }
  const glints = Math.round(8 + amount * 35);
  for (let i = 0; i < glints; i++) {
    const p = (t * (0.018 + speed * 0.08) + rand(seed, i)) % 1;
    const x = (r.x + ((rand(seed, i + 2) + p * dir.x * 0.12 + 1) % 1) * r.w) * w;
    const y = (r.y + ((rand(seed, i + 3) + p * dir.y * 0.2 + 1) % 1) * r.h) * h;
    const flash = Math.sin(p * Math.PI);
    drawStarGlyph(ctx, x, y, (5 + rand(seed, i + 5) * 12) * (0.55 + size) * (w / 1280), opacity * flash, "255,225,95");
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number, kind: string) {
  const amount = value(e, "amount", 0.3);
  const speed = value(e, "speed", 0.16);
  const size = value(e, "size", 0.3);
  const opacity = value(e, "opacity", 0.38);
  const r = regionOf(e, full);
  const dir = directionVector(e.direction || "up-right");
  applyRegionClip(ctx, r, w, h);
  ctx.globalCompositeOperation = kind === "glowing_particles" ? "screen" : "source-over";
  const n = Math.round(25 + amount * 110);
  for (let i = 0; i < n; i++) {
    const p = (t * (0.008 + speed * 0.05) + rand(seed, i)) % 1;
    const x = (r.x + ((rand(seed, i + 1) + p * dir.x * 0.18 + 1) % 1) * r.w) * w;
    const y = (r.y + ((rand(seed, i + 2) + p * dir.y * 0.18 + 1) % 1) * r.h) * h;
    const rr = Math.max(0.6, (0.8 + rand(seed, i + 3) * 2.4) * (0.45 + size) * (w / 1280));
    const tw = 0.45 + 0.55 * Math.sin((p + rand(seed, i + 4)) * Math.PI);
    if (kind === "glowing_particles") {
      const grad = ctx.createRadialGradient(x, y, 0, x, y, rr * 4.5);
      grad.addColorStop(0, `rgba(255,222,135,${opacity * tw})`);
      grad.addColorStop(1, "rgba(255,222,135,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, rr * 4.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const golden = e.variant === "golden_dust" || e.variant === "light_particles";
      ctx.fillStyle = golden ? `rgba(255,218,140,${opacity * tw})` : `rgba(235,230,210,${opacity * 0.75 * tw})`;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawSteamSmoke(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number, kind: string) {
  const isSteam = kind === "steam";
  const density = value(e, "density", isSteam ? 0.68 : 0.38);
  const speed = value(e, "speed", 0.22);
  const opacity = value(e, "opacity", isSteam ? 0.72 : 0.32);
  const size = value(e, "size", isSteam ? 0.58 : 0.4);
  const origin = originOf(e, isSteam ? { x: 0.5, y: 0.6 } : { x: 0.5, y: 0.72 });
  const dir = directionVector(e.direction || "up-right");
  const r = regionOf(e, isSteam ? cupSteamRegion : mid);
  applyRegionClip(ctx, r, w, h, h * 0.08);
  setBlur(ctx, Math.max(6, w * 0.007));
  const plumes = Math.round(7 + density * 18);

  // A faint grey edge/shadow pass underneath the white highlight keeps the
  // plume readable even on light backgrounds — plain screen-blended white
  // disappears over bright skies or pale walls.
  if (isSteam) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    for (let i = 0; i < plumes; i++) {
      const p = (t * (0.025 + speed * 0.08) + rand(seed, i)) % 1;
      const lift = smoothstep(p);
      const x = origin.x * w + dir.x * lift * w * (0.035 + size * 0.06) + Math.sin(p * 8 + i) * w * 0.018;
      const y = origin.y * h - lift * h * (0.18 + size * 0.22) + dir.y * lift * h * 0.04;
      const rr = (22 + rand(seed, i + 3) * 42) * (0.45 + size) * (w / 1280) * (0.4 + lift);
      const edgeAlpha = opacity * (1 - lift) * 0.22;
      const edgeGrad = ctx.createRadialGradient(x, y, 0, x, y, rr * 1.2);
      edgeGrad.addColorStop(0, `rgba(90,92,96,${edgeAlpha})`);
      edgeGrad.addColorStop(1, "rgba(90,92,96,0)");
      ctx.fillStyle = edgeGrad;
      ctx.beginPath();
      ctx.ellipse(x, y, rr * (0.82 + lift), rr * (0.58 + lift * 0.7), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.globalCompositeOperation = isSteam ? "screen" : "source-over";
  for (let i = 0; i < plumes; i++) {
    const p = (t * (0.025 + speed * 0.08) + rand(seed, i)) % 1;
    const lift = smoothstep(p);
    const x = origin.x * w + dir.x * lift * w * (0.035 + size * 0.06) + Math.sin(p * 8 + i) * w * 0.018;
    const y = origin.y * h - lift * h * (0.18 + size * 0.22) + dir.y * lift * h * 0.04;
    const rr = (22 + rand(seed, i + 3) * 42) * (0.45 + size) * (w / 1280) * (0.4 + lift);
    const a = opacity * (1 - lift) * (isSteam ? 0.6 : 0.18);
    const color = kind === "fire_smoke" ? "170,160,145" : kind === "smoke" ? "205,205,198" : isSteam ? "255,255,255" : "235,240,235";
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rr);
    grad.addColorStop(0, `rgba(${color},${a})`);
    if (isSteam) grad.addColorStop(0.55, `rgba(${color},${a * 0.45})`);
    grad.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(x, y, rr * (0.75 + lift), rr * (0.5 + lift * 0.7), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Thin bright wisps/strokes read as real vapor threads, not just soft fog.
  if (isSteam) {
    const wisps = Math.round(3 + density * 6);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    for (let i = 0; i < wisps; i++) {
      const p = (t * (0.034 + speed * 0.07) + rand(seed, i + 150)) % 1;
      const baseX = origin.x * w + (rand(seed, i + 151) - 0.5) * w * 0.07;
      const topY = origin.y * h - h * (0.4 + size * 0.3);
      const botY = origin.y * h - h * 0.015;
      const midY = (topY + botY) / 2;
      const sway = Math.sin(p * Math.PI * 2 + rand(seed, i + 152) * 6) * w * (0.028 + size * 0.03);
      const wobble = w * (0.018 + size * 0.022) * Math.sin(p * Math.PI * 3 + i);
      const alpha = opacity * (0.65 - Math.abs(p - 0.5) * 0.7);
      if (alpha <= 0.01) continue;
      ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, alpha)})`;
      ctx.lineWidth = Math.max(1.3, w * 0.0024 * (0.6 + size));
      ctx.beginPath();
      ctx.moveTo(baseX, botY);
      ctx.bezierCurveTo(baseX + wobble, midY + (botY - midY) * 0.4, baseX - wobble + sway, midY - (midY - topY) * 0.4, baseX + sway, topY);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawEmbers(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number, kind: string) {
  const amount = value(e, "amount", 0.34);
  const speed = value(e, "speed", kind === "sparks" ? 0.5 : 0.34);
  const opacity = value(e, "opacity", 0.66);
  const size = value(e, "size", 0.35);
  const origin = originOf(e, { x: 0.5, y: 0.72 });
  const dir = directionVector(e.direction || "up-right");
  const n = Math.round(14 + amount * 70);
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < n; i++) {
    const p = (t * (0.04 + speed * 0.18) * (0.7 + rand(seed, i)) + rand(seed, i + 1)) % 1;
    const x = origin.x * w + (rand(seed, i + 2) - 0.5) * w * 0.08 + dir.x * p * w * 0.12;
    const y = origin.y * h - p * h * (0.22 + rand(seed, i + 3) * 0.2);
    const rr = (1.2 + rand(seed, i + 4) * 2.4) * (0.5 + size) * (w / 1280);
    const a = opacity * Math.sin(p * Math.PI) * (kind === "sparks" ? 0.9 : 0.65);
    ctx.fillStyle = kind === "sparks" ? `rgba(255,232,145,${a})` : `rgba(255,118,40,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFire(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number) {
  const intensity = value(e, "intensity", 0.55);
  const speed = value(e, "speed", 0.48);
  const size = value(e, "size", 0.42);
  const opacity = value(e, "opacity", 0.9);
  const origin = originOf(e, { x: 0.5, y: 0.78 });
  const base = Math.min(w, h) * (0.035 + size * 0.08) * (e.variant === "candle" ? 0.45 : e.variant === "small_flame" ? 0.65 : 1);
  ctx.globalCompositeOperation = "screen";
  const glow = ctx.createRadialGradient(origin.x * w, origin.y * h, 0, origin.x * w, origin.y * h, base * 4);
  glow.addColorStop(0, `rgba(255,120,35,${opacity * intensity * 0.24})`);
  glow.addColorStop(1, "rgba(255,120,35,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(origin.x * w, origin.y * h, base * 4, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < 7; i++) {
    const flick = 0.75 + rand(seed, i) * 0.3 + Math.sin(t * (4 + speed * 8) + i) * 0.18;
    const x = origin.x * w + (i - 3) * base * 0.28 + Math.sin(t * 3 + i) * base * 0.18;
    const y = origin.y * h;
    const flameH = base * (1.15 + intensity * 1.3) * flick * (1 - Math.abs(i - 3) * 0.06);
    const flameW = base * (0.45 + rand(seed, i + 20) * 0.35);
    const grad = ctx.createLinearGradient(x, y, x, y - flameH);
    grad.addColorStop(0, `rgba(255,68,22,${opacity * 0.84})`);
    grad.addColorStop(0.45, `rgba(255,170,42,${opacity * 0.76})`);
    grad.addColorStop(1, `rgba(255,245,170,${opacity * 0.08})`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x, y - flameH);
    ctx.bezierCurveTo(x - flameW, y - flameH * 0.55, x - flameW * 0.6, y - flameH * 0.15, x, y);
    ctx.bezierCurveTo(x + flameW * 0.6, y - flameH * 0.15, x + flameW, y - flameH * 0.55, x, y - flameH);
    ctx.fill();
  }
}

function drawFirelight(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number) {
  const opacity = value(e, "opacity", 0.35);
  const intensity = value(e, "intensity", 0.45);
  const speed = value(e, "speed", 0.42);
  const o = originOf(e, { x: 0.5, y: 0.72 });
  const flick = 0.78 + Math.sin(t * (4 + speed * 8) + seed) * 0.14 + rand(seed, Math.floor(t * 8)) * 0.1;
  ctx.globalCompositeOperation = "screen";
  const grad = ctx.createRadialGradient(o.x * w, o.y * h, 0, o.x * w, o.y * h, Math.max(w, h) * (0.25 + intensity * 0.25));
  grad.addColorStop(0, `rgba(255,122,44,${opacity * intensity * flick})`);
  grad.addColorStop(0.55, `rgba(255,122,44,${opacity * intensity * 0.16 * flick})`);
  grad.addColorStop(1, "rgba(255,122,44,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function drawSunRays(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number) {
  const opacity = value(e, "opacity", 0.34);
  const intensity = value(e, "intensity", 0.42);
  const o = originOf(e, { x: 0.18, y: 0.12 });
  const dir = directionVector(e.direction || "down-right");
  ctx.globalCompositeOperation = "screen";
  setBlur(ctx, Math.max(2, w * 0.003));
  const rays = 7;
  for (let i = 0; i < rays; i++) {
    const angle = Math.atan2(dir.y || 1, dir.x || 0.6) + (i - rays / 2) * 0.11 + Math.sin(t * 0.25 + i) * 0.02;
    const len = Math.max(w, h) * (0.9 + intensity * 0.5);
    const spread = 0.05 + intensity * 0.035;
    const x0 = o.x * w;
    const y0 = o.y * h;
    const x1 = x0 + Math.cos(angle - spread) * len;
    const y1 = y0 + Math.sin(angle - spread) * len;
    const x2 = x0 + Math.cos(angle + spread) * len;
    const y2 = y0 + Math.sin(angle + spread) * len;
    const grad = ctx.createRadialGradient(x0, y0, 0, x0, y0, len);
    grad.addColorStop(0, `rgba(255,235,170,${opacity * intensity * 0.22})`);
    grad.addColorStop(1, "rgba(255,235,170,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.fill();
  }
}

function drawLensFlare(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number) {
  const opacity = value(e, "opacity", 0.34);
  const intensity = value(e, "intensity", 0.32);
  const o = originOf(e, { x: 0.2, y: 0.18 });
  ctx.globalCompositeOperation = "screen";
  const pulse = 0.86 + Math.sin(t * 0.8 + seed) * 0.14;
  const grad = ctx.createRadialGradient(o.x * w, o.y * h, 0, o.x * w, o.y * h, Math.max(w, h) * 0.22);
  grad.addColorStop(0, `rgba(255,245,205,${opacity * intensity * 0.7 * pulse})`);
  grad.addColorStop(1, "rgba(255,245,205,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) {
    const p = (i + 1) / 5;
    const x = o.x * w + (0.5 * w - o.x * w) * p * 1.4;
    const y = o.y * h + (0.5 * h - o.y * h) * p * 1.4;
    const r = Math.max(w, h) * (0.012 + rand(seed, i) * 0.018) * (0.7 + intensity);
    ctx.strokeStyle = `rgba(255,220,160,${opacity * 0.22})`;
    ctx.lineWidth = Math.max(1, w / 900);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawLightningIllumination(ctx: CanvasRenderingContext2D, e: SceneAnimationEffect, w: number, h: number, t: number, seed: number) {
  const pulse = lightningPulse(t, seed + 888, value(e, "speed", 0.35), e.variant) * value(e, "opacity", 0.5);
  if (pulse <= 0.01) return;
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = `rgba(180,205,255,${pulse * value(e, "intensity", 0.42) * 0.35})`;
  ctx.fillRect(0, 0, w, h);
}
