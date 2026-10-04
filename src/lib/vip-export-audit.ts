import {
  isPlanCaptionIncluded,
  isPlanCatalogItemIncluded,
  isPlanVoiceIncluded,
  PLAN_CONFIG,
  type FeatureKey,
  type PlanSlug,
} from "../config/plans";
import { isFreeCtaInsert } from "../data/cta-library";
import type { CaptionsConfig, TimelineInsert } from "../types";
import { getPreset, type VideoFilterConfig } from "../data/video-filters";
import { resolveVoiceEcho, voiceEchoIsActive, type VoiceEchoConfig } from "./voice-echo";

/**
 * What a final download is allowed to contain, and what happens to the rest.
 *
 * The product rule has always been: VIP creative tools are fully usable while
 * you work. You can add them, watch them in the preview, judge them — the line
 * is drawn at the final download, not at the toolbox. That is deliberate, and
 * it stays.
 *
 * What was missing is the other half of the sentence. The preview showed the
 * VIP effect, the render then either silently depended on a server refusal or
 * failed late with one feature name in an error box. Nobody was told, before
 * the long expensive job started, WHICH things in their video are VIP and what
 * was about to happen to them.
 *
 * This module is that answer, computed in one place so the warning on screen,
 * the dialog at the moment of pressing Render, and the render itself cannot
 * disagree with each other:
 *
 *   auditVipForExport  — everything in this project the plan does not cover.
 *   stripVipFromExport — the same project with those things taken out, which
 *                        is what the renderer is actually handed.
 *
 * Nothing here edits the project. The creator keeps every VIP choice they
 * made; it is the one downloaded file that goes without them.
 */

/** Timeline categories that are a whole paid feature rather than a catalogue item. */
export const INSERT_FEATURE: Partial<Record<TimelineInsert["category"], FeatureKey>> = {
  stickers: "stickers",
  content_cards: "text_templates",
  text_templates: "text_templates",
  lower_thirds: "lower_thirds",
  audio_visualizers: "sound_visualiser",
  speech_reactive: "sound_visualiser",
  background_music: "background_music",
  filters: "filters",
  sound_effects: "sound_effects",
  special_effects: "special_effects",
  meditation: "special_effects",
  intro: "full_video_studio",
  outro: "full_video_studio",
};

/** Human wording for a timeline category, for the warning list. */
const CATEGORY_LABEL: Record<string, string> = {
  stickers: "Sticker",
  content_cards: "Content card",
  text_templates: "Text template",
  lower_thirds: "Lower third",
  audio_visualizers: "Audio visualiser",
  speech_reactive: "Speech-reactive visualiser",
  background_music: "Music track",
  filters: "Filter",
  sound_effects: "Sound effect",
  special_effects: "Special effect",
  meditation: "Meditation effect",
  intro: "Intro",
  outro: "Outro",
  call_to_action: "Call-to-action button",
  logo: "Logo",
};

export interface VipFinding {
  /** Stable key for lists and tests. */
  id: string;
  /** What it is, in the creator's words: "Sticker · Neon Arrow". */
  label: string;
  /** Why the plan does not cover it. */
  detail: string;
  /** The paid feature it belongs to, when it is a feature rather than an item. */
  feature?: FeatureKey;
  /** The timeline insert responsible, when there is one. */
  insertId?: string;
  /**
   * True when leaving it out of the download is enough — overlays, filters,
   * effects and music are all simply not drawn or not mixed.
   *
   * False for the two things that are baked in earlier: the narration voice
   * and the caption style. Swapping either of those at render time would hand
   * back a video that does not sound or read like the one in the preview, so
   * those have to be changed by the creator, in their own step, on purpose.
   */
  leaveOut: boolean;
  /** Where to go to change it, for the findings that cannot be left out. */
  fixIn?: "voiceover" | "captions";
}

export interface VipExportInput {
  inserts?: TimelineInsert[];
  videoFilter?: VideoFilterConfig | null;
  sceneAnimationEnabled?: boolean;
  motionStyle?: string;
  captionsConfig?: CaptionsConfig | null;
  selectedVoice?: string;
  voiceEcho?: VoiceEchoConfig;
}

const FREE_MOTION_STYLES = ["dynamic", "static", "none"];

/**
 * Everything in this project that the plan does not include in a final
 * download, in the order a creator would look for it.
 */
export function auditVipForExport(plan: PlanSlug, input: VipExportInput): VipFinding[] {
  const config = PLAN_CONFIG[plan];
  const findings: VipFinding[] = [];
  const covers = (feature: FeatureKey) => config.features[feature];

  for (const insert of input.inserts ?? []) {
    const feature = INSERT_FEATURE[insert.category];
    const name = `${CATEGORY_LABEL[insert.category] ?? insert.category.replace(/_/g, " ")} · ${insert.title || insert.type}`;

    // A whole category the plan does not have at all.
    if (feature && !covers(feature)) {
      findings.push({
        id: `insert:${insert.id}`,
        label: name,
        detail: `${featureWords(feature)} is not included in ${config.name} downloads`,
        feature,
        insertId: insert.id,
        leaveOut: true,
      });
      continue;
    }

    // A category the plan has, but this particular item is outside the
    // sample it is allowed — the two free visualisers, the two free tracks.
    if (!isPlanCatalogItemIncluded(plan, insert.category, insert.type)) {
      findings.push({
        id: `item:${insert.id}`,
        label: name,
        detail: `This choice is outside the ${config.name} selection`,
        feature,
        insertId: insert.id,
        leaveOut: true,
      });
      continue;
    }

    // The standard Subscribe button is free AS IT SHIPS. Restyled in the
    // button settings — new platform, wording, colours or logo — it is a
    // made-to-order button, which is VIP.
    if (insert.category === "call_to_action" && !isFreeCtaInsert(insert) && !covers("advanced_cta")) {
      findings.push({
        id: `cta:${insert.id}`,
        label: `${CATEGORY_LABEL.call_to_action} · ${insert.title || insert.type}`,
        detail: `${config.name} downloads include the standard Subscribe button as it ships; this one has been changed`,
        feature: "advanced_cta",
        insertId: insert.id,
        leaveOut: true,
      });
    }
  }

  if (input.videoFilter && !covers("filters")) {
    findings.push({
      id: "filter",
      label: `Filter · ${getPreset(input.videoFilter.id)?.name ?? input.videoFilter.id}`,
      detail: `Filters are not included in ${config.name} downloads`,
      feature: "filters",
      leaveOut: true,
    });
  }

  if (input.sceneAnimationEnabled && !covers("special_effects")) {
    findings.push({
      id: "scene-animation",
      label: "Scene effects · per-scene camera and effect stacks",
      detail: `Special effects are not included in ${config.name} downloads`,
      feature: "special_effects",
      leaveOut: true,
    });
  }

  if (input.motionStyle && !FREE_MOTION_STYLES.includes(input.motionStyle) && !covers("camera_movements")) {
    findings.push({
      id: "motion",
      label: `Camera movement · ${input.motionStyle}`,
      detail: `Camera movements are not included in ${config.name} downloads`,
      feature: "camera_movements",
      leaveOut: true,
    });
  }

  if (voiceEchoIsActive(resolveVoiceEcho(input.voiceEcho)) && !covers("voice_echo")) {
    findings.push({
      id: "voice-echo",
      label: "Narration space · echo and room ambience",
      detail: `Echo and ambience are written into the exported voice track, and are not included in ${config.name} downloads`,
      feature: "voice_echo",
      leaveOut: true,
    });
  }

  // The two that cannot simply be left out.
  const voice = input.selectedVoice || "guy";
  if (!isPlanVoiceIncluded(plan, voice)) {
    findings.push({
      id: "voice",
      label: `Narration voice · ${voice}`,
      detail: `This voice is outside the ${config.name} selection. Choose an included voice in the Voiceover step — the download cannot quietly swap the voice you heard.`,
      feature: "advanced_voice",
      leaveOut: false,
      fixIn: "voiceover",
    });
  }

  const captionsOn = input.captionsConfig?.enabled ?? false;
  const preset = input.captionsConfig?.preset || "newsroom_clean";
  if (captionsOn && !isPlanCaptionIncluded(plan, preset)) {
    findings.push({
      id: "caption-style",
      label: `Caption style · ${preset.replace(/_/g, " ")}`,
      detail: `This caption style is outside the ${config.name} selection. Pick an included style in the Captions step, or switch captions off.`,
      feature: "premium_captions",
      leaveOut: false,
      fixIn: "captions",
    });
  }

  return findings;
}

/** Findings that stop the download until the creator changes something. */
export function blockingVipFindings(findings: VipFinding[]): VipFinding[] {
  return findings.filter((finding) => !finding.leaveOut);
}

/** Findings the download can simply go without. */
export function omittableVipFindings(findings: VipFinding[]): VipFinding[] {
  return findings.filter((finding) => finding.leaveOut);
}

/**
 * The same project with every VIP thing taken out — this is what the final
 * render is handed, so a paid effect cannot reach the file even if a check
 * somewhere else is wrong, the plan changes mid-session, or the server call
 * is answered from a stale cache.
 *
 * The project itself is untouched: this is a copy made for one encode.
 */
export function stripVipFromExport(plan: PlanSlug, input: VipExportInput): Required<Pick<VipExportInput,
  "inserts" | "sceneAnimationEnabled">> & {
  videoFilter: VideoFilterConfig | null;
  motionStyle: string | undefined;
  voiceEcho: VoiceEchoConfig | undefined;
  removed: VipFinding[];
} {
  const findings = auditVipForExport(plan, input);
  const removed = omittableVipFindings(findings);
  const removedInsertIds = new Set(removed.map((finding) => finding.insertId).filter(Boolean) as string[]);
  const removedIds = new Set(removed.map((finding) => finding.id));

  return {
    inserts: (input.inserts ?? []).filter((insert) => !removedInsertIds.has(insert.id)),
    videoFilter: removedIds.has("filter") ? null : input.videoFilter ?? null,
    sceneAnimationEnabled: removedIds.has("scene-animation") ? false : Boolean(input.sceneAnimationEnabled),
    motionStyle: removedIds.has("motion") ? "dynamic" : input.motionStyle,
    voiceEcho: removedIds.has("voice-echo") ? undefined : input.voiceEcho,
    removed,
  };
}

/** One line for a status message or a log: "3 VIP effects left out". */
export function describeVipFindings(findings: VipFinding[]): string {
  if (findings.length === 0) return "";
  const count = findings.length;
  return `${count} VIP ${count === 1 ? "feature" : "features"}: ${findings.map((finding) => finding.label).join(", ")}`;
}

function featureWords(feature: FeatureKey): string {
  const words = feature.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
