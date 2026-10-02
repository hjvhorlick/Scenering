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
}

{
  const expectedSections = ["seasons", "mystical", "space", "motivation", "meditation"];
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

h.done("scene-animation");
