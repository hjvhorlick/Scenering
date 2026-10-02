import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";
import type { Scene } from "../src/types";
import {
  EFFECT_BY_TYPE,
  SCENE_ANIMATION_COLOR_PALETTES,
  SCENE_ANIMATION_LIBRARY_SECTIONS,
  SCENE_ANIMATION_PRESETS,
  applySceneAnimationPreset,
  countEnabledSceneAnimationItems,
  effectDefaults,
  getSceneCameraTransform,
  getSmartSceneAnimationSuggestions,
  resolveSceneAnimation,
  resolveSceneCameraMotion,
} from "../src/lib/scene-animation";

const h = createHarness();

{
  h.ok(SCENE_ANIMATION_COLOR_PALETTES.some((palette) => palette.id === "gold" && palette.metallic && /Chrome/.test(palette.label)), "style palettes include chrome gold");
  h.ok(SCENE_ANIMATION_COLOR_PALETTES.some((palette) => palette.id === "silver" && palette.metallic && /Chrome/.test(palette.label)), "style palettes include chrome silver");
  h.ok(SCENE_ANIMATION_COLOR_PALETTES.some((palette) => palette.id.startsWith("neon_")), "style palettes include neon colours");
  const styled = resolveSceneAnimation({
    effects: [{ ...effectDefaults("celestial_twinkles"), colorPalette: "neon_purple", bloom: 0.7, afterglow: 0.55, trail: 0.45, shine: 0.8, opacity: 0.35 }],
  });
  h.eq(styled.effects?.[0]?.colorPalette, "neon_purple", "effect style colour survives animation resolution");
  h.eq(styled.effects?.[0]?.bloom, 0.7, "bloom setting survives animation resolution");
  h.eq(styled.effects?.[0]?.afterglow, 0.55, "afterglow setting survives animation resolution");
  h.eq(styled.effects?.[0]?.trail, 0.45, "tail setting survives animation resolution");
  h.eq(styled.effects?.[0]?.shine, 0.8, "chrome/shine setting survives animation resolution");

  // resolveSceneAnimation clones effects rather than returning the same
  // object references, so later edits to one scene's config can never leak
  // into another scene that was created from the same source.
  const source = { effects: [{ ...effectDefaults("glowing_orbs"), colorPalette: "gold" as const, bloom: 0.4 }] };
  const resolvedA = resolveSceneAnimation(source);
  const resolvedB = resolveSceneAnimation(source);
  h.ok(resolvedA.effects?.[0] !== source.effects[0], "resolveSceneAnimation clones effect objects, not references");
  h.ok(resolvedA.effects?.[0] !== resolvedB.effects?.[0], "two resolutions of the same source produce independent clones");
  h.eq(resolvedA.effects?.[0]?.colorPalette, "gold", "cloned effect keeps its colour palette");
  h.eq(resolvedA.effects?.[0]?.bloom, 0.4, "cloned effect keeps its bloom value");
}

{
  const expectedSections = [
    "seasons",
    "mystical",
    "energy",
    "space",
    "motivation",
    "meditation",
    "nature_water",
    "weather",
    "fire_steam",
    "all",
  ];
  for (const id of expectedSections) {
    h.ok(SCENE_ANIMATION_LIBRARY_SECTIONS.some((section) => section.id === id), `section browser includes ${id}`);
  }
  for (const section of SCENE_ANIMATION_LIBRARY_SECTIONS) {
    h.ok(section.groups.length > 0, `${section.id} has sub-sections`);
    for (const group of section.groups) {
      h.ok(group.effects.length > 0, `${section.id}/${group.id} has effects`);
      for (const type of group.effects) {
        h.ok(EFFECT_BY_TYPE.has(type), `${section.id}/${group.id} references real effect ${type}`);
      }
      for (const presetId of group.presetIds || []) {
        h.ok(SCENE_ANIMATION_PRESETS.some((preset) => preset.id === presetId), `${section.id}/${group.id} references real preset ${presetId}`);
      }
    }
  }
}

const baseScene: Scene = {
  id: 1,
  project_id: 1,
  order_index: 0,
  text: "A cup of coffee overlooks a misty lake at sunrise.",
  image_query: "coffee lake sunrise",
  image_url: "/sample.jpg",
  duration: 8,
  motion_effect: "ken_burns",
};

{
  h.eq(resolveSceneCameraMotion(baseScene, false), "ken_burns", "legacy global Ken Burns is used while scene animation is OFF");
  h.eq(resolveSceneCameraMotion(baseScene, true), "none", "per-scene camera defaults to none while scene animation is ON");
}

{
  const animation = applySceneAnimationPreset(undefined, "coffee_morning");
  h.ok(countEnabledSceneAnimationItems(animation) >= 5, "coffee preset creates a stacked living-scene setup");
  h.eq(resolveSceneAnimation(animation).camera?.motion, "cinematic_drift", "preset sets per-scene camera motion");
  h.ok(resolveSceneAnimation(animation).effects?.some((effect) => effect.type === "steam"), "coffee preset adds steam");
  h.ok(resolveSceneAnimation(animation).effects?.some((effect) => effect.type === "water_ripples"), "coffee preset adds water movement");
}

{
  const scene = { ...baseScene, animation: { camera: { motion: "slow_zoom", speed: 0.5, intensity: 0.1 }, effects: [] } };
  const subtle = getSceneCameraTransform(scene, true, 1, 1280, 720, 0);
  const strong = getSceneCameraTransform({ ...scene, animation: { camera: { motion: "slow_zoom", speed: 0.5, intensity: 1 }, effects: [] } }, true, 1, 1280, 720, 0);
  h.ok(strong.scale > subtle.scale, "camera intensity strengthens per-scene camera movement");
}

{
  const suggestions = getSmartSceneAnimationSuggestions(baseScene);
  h.ok(suggestions.includes("steam"), "coffee scenes suggest steam");
  h.ok(suggestions.includes("water_ripples"), "water scenes suggest ripples");
  h.ok(suggestions.includes("water_mist"), "water scenes suggest mist");
}

{
  const meditation = getSmartSceneAnimationSuggestions({ text: "A calm meditation breath with peaceful healing light.", image_query: "meditation aura" });
  h.ok(meditation.includes("meditation_aura"), "meditation scenes suggest breathing aura");
  h.ok(meditation.includes("mandala_bloom"), "meditation scenes suggest mandalas");
  const motivation = getSmartSceneAnimationSuggestions({ text: "A motivational sunrise about hope, success and rising again.", image_query: "motivational hope" });
  h.ok(motivation.includes("motivational_starburst"), "motivational scenes suggest radiant starbursts");
  h.ok(motivation.includes("celestial_twinkles"), "motivational scenes suggest twinkling flash stars");
}

{
  const sigils = applySceneAnimationPreset(undefined, "enchanted_sigils");
  h.ok(resolveSceneAnimation(sigils).effects?.some((effect) => effect.type === "enchanted_sigil"), "enchanted preset adds intricate sigils");
  const deep = applySceneAnimationPreset(undefined, "deep_meditation");
  h.ok(resolveSceneAnimation(deep).effects?.some((effect) => effect.type === "mandala_bloom"), "deep meditation preset adds mandala bloom");
}

{
  const rain = effectDefaults("rain");
  const snow = effectDefaults("snow");
  const cfg = { camera: { motion: "none" as const, speed: 0.5, intensity: 0.5 }, effects: [rain, { ...snow, enabled: false }] };
  h.eq(countEnabledSceneAnimationItems(cfg), 1, "effect counter ignores disabled effects and counts active layers");
}

// -------- Steam cup effect must be visibly stronger --------
{
  const steamDefaults = effectDefaults("steam");
  h.ok((steamDefaults.opacity ?? 0) >= 0.6, "Steam / Vapor defaults favor visible cup steam (opacity)");
  h.ok((steamDefaults.density ?? 0) >= 0.6, "Steam / Vapor defaults favor visible cup steam (density)");

  const cupMagicPreset = SCENE_ANIMATION_PRESETS.find((preset) => preset.id === "steam_cup_magic");
  h.ok(!!cupMagicPreset, "steam_cup_magic preset exists");
  const cupSteam = cupMagicPreset?.effects.find((effect) => effect.type === "steam");
  h.ok(!!cupSteam, "steam_cup_magic includes a steam layer");
  h.ok((cupSteam?.opacity ?? 0) >= 0.85, "steam_cup_magic steam has high opacity (>= 0.85)");
  h.ok((cupSteam?.density ?? 0) >= 0.85, "steam_cup_magic steam has high density (>= 0.85)");
  h.ok((cupSteam?.size ?? 0) >= 0.62 && (cupSteam?.size ?? 0) <= 0.72, "steam_cup_magic steam uses a strong, readable size");
  const cupRegion = cupSteam?.region;
  h.ok(!!cupRegion, "steam_cup_magic steam has a focused region above the cup");
  if (cupRegion) {
    h.ok(cupRegion.x >= 0.2 && cupRegion.x <= 0.3, "steam_cup_magic region x is centered above the cup");
    h.ok(cupRegion.y >= 0.06 && cupRegion.y <= 0.14, "steam_cup_magic region y starts near the cup rim");
    h.ok(cupRegion.w >= 0.4 && cupRegion.w <= 0.55, "steam_cup_magic region width is focused, not full-frame");
    h.ok(cupRegion.h >= 0.68 && cupRegion.h <= 0.8, "steam_cup_magic region height covers the rising plume");
  }

  const animation = resolveSceneAnimation({ effects: cupMagicPreset?.effects as any });
  const resolvedSteam = animation.effects?.find((effect) => effect.type === "steam");
  h.eq(resolvedSteam?.opacity, cupSteam?.opacity, "resolved steam_cup_magic keeps its strong opacity");
  h.eq(resolvedSteam?.density, cupSteam?.density, "resolved steam_cup_magic keeps its strong density");
}

// -------- Energy section (top-level) --------
{
  const energy = SCENE_ANIMATION_LIBRARY_SECTIONS.find((section) => section.id === "energy");
  h.ok(!!energy, "top-level Energy section exists");
  const expectedGroups = ["reactive_energy", "portals_power_waves", "neon_energy"];
  for (const id of expectedGroups) {
    h.ok(energy?.groups.some((group) => group.id === id), `Energy section includes ${id} group`);
  }
  const neonGroup = energy?.groups.find((group) => group.id === "neon_energy");
  h.ok(!!neonGroup?.presetIds?.length, "Neon Energy group references a real preset");
  for (const presetId of neonGroup?.presetIds || []) {
    h.ok(SCENE_ANIMATION_PRESETS.some((preset) => preset.id === presetId), `Neon Energy preset ${presetId} exists`);
  }
}

// -------- Scene Animation ON/OFF must live in the Scene Editor, not Setup --------
{
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const setupSource = readFileSync(join(repoRoot, "src/components/SetupStudio.tsx"), "utf8");
  const appSource = readFileSync(join(repoRoot, "src/App.tsx"), "utf8");

  h.ok(!/onUpdateSceneAnimationEnabled/.test(setupSource), "SetupStudio no longer accepts onUpdateSceneAnimationEnabled");
  h.ok(!/\{enabled \? "ON" : "OFF"\}/.test(setupSource), "SetupStudio no longer renders its own Scene Animation ON/OFF buttons");
  h.ok(!/onUpdateSceneAnimationEnabled=\{handleUpdateSceneAnimationEnabled\}/.test(appSource), "App no longer passes onUpdateSceneAnimationEnabled into SetupStudio");
  h.ok(/Scene Animation Effects/.test(appSource) && /<SceneEditor/.test(appSource), "App.tsx renders a Scene Animation Effects banner near the Scene Editor");

  // The banner must come before the first scene card is mapped, i.e. above
  // the scene boxes rather than below or inside Setup.
  const bannerIndex = appSource.indexOf("Scene Animation Effects");
  const firstSceneEditorIndex = appSource.indexOf("<SceneEditor");
  h.ok(bannerIndex > -1 && firstSceneEditorIndex > -1 && bannerIndex < firstSceneEditorIndex, "Scene Animation Effects banner appears above the first scene card in App.tsx");
}

h.done("scene-animation");
