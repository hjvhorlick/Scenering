import { STUDIO_VOICE_PRESETS, migrateLegacyVoiceId, type VoicePreset } from "../data/voice-presets";
import type { WordTiming } from "./word-sync";

export type SpeechifyVoiceGender = "male" | "female" | "not_specified";

/** Minimal shape returned by a direct, customer-key-authenticated GET to Speechify /v1/voices. */
export interface SpeechifyVoice {
  id: string;
  display_name: string;
  gender: SpeechifyVoiceGender;
  locale: string;
  type?: "shared" | "personal";
  models?: string[];
}

/** A Scenering style bound to one real voice from the customer's Speechify catalogue. */
export interface SpeechifyVoiceProfile extends VoicePreset {
  providerVoiceId: string;
  providerVoiceName: string;
  providerLocale: string;
}

/** Safely narrows the Speechify voice-list response to the fields Scenering uses. */
export function parseSpeechifyVoices(payload: unknown): SpeechifyVoice[] {
  if (!payload || typeof payload !== "object") return [];
  const rows = (payload as { voices?: unknown }).voices;
  if (!Array.isArray(rows)) return [];

  return rows.flatMap((row): SpeechifyVoice[] => {
    if (!row || typeof row !== "object") return [];
    const value = row as Record<string, unknown>;
    const id = typeof value.id === "string" ? value.id.trim() : "";
    if (!id) return [];

    const rawGender = typeof value.gender === "string" ? value.gender.toLowerCase() : "";
    const gender: SpeechifyVoiceGender =
      rawGender === "male" || rawGender === "female" ? rawGender : "not_specified";
    const displayName = typeof value.display_name === "string" ? value.display_name.trim() : "";
    const locale = typeof value.locale === "string" ? value.locale.trim() : "en";
    const type = value.type === "shared" || value.type === "personal" ? value.type : undefined;
    const models = Array.isArray(value.models)
      ? value.models.filter((model): model is string => typeof model === "string")
      : undefined;

    return [{
      id,
      display_name: displayName || id,
      gender,
      locale: locale || "en",
      ...(type ? { type } : {}),
      ...(models ? { models } : {}),
    }];
  });
}

function localeLabel(locale: string, fallback: string): string {
  const normalized = locale.toLowerCase();
  if (normalized.startsWith("en-gb")) return "British English";
  if (normalized.startsWith("en-au")) return "Australian English";
  if (normalized.startsWith("en-ie")) return "Irish English";
  if (normalized.startsWith("en-ca")) return "Canadian English";
  if (normalized.startsWith("en-us")) return "American English";
  return fallback || locale || "English";
}

/**
 * Bind the 20 Scenering style profiles to real, distinct Speechify voices.
 * The selection is deterministic per customer catalogue: each profile prefers
 * its declared locale, then the closest available English locale, then the
 * next unused voice of the same gender. The voice styles themselves stay
 * familiar while the provider voices and provider IDs come only from Speechify.
 */
export function buildSpeechifyVoiceProfiles(
  catalog: readonly SpeechifyVoice[],
  templates: readonly VoicePreset[] = STUDIO_VOICE_PRESETS
): SpeechifyVoiceProfile[] {
  const sortedCatalog = [...catalog].sort((a, b) =>
    a.locale.localeCompare(b.locale) ||
    a.display_name.localeCompare(b.display_name) ||
    a.id.localeCompare(b.id)
  );
  const usedByGender: Record<"male" | "female", Set<string>> = {
    male: new Set(),
    female: new Set(),
  };
  const slotByGender: Record<"male" | "female", number> = { male: 0, female: 0 };

  return templates.map((template) => {
    const gender = template.gender;
    const candidates = sortedCatalog.filter((voice) => voice.gender === gender);
    const unused = candidates.filter((voice) => !usedByGender[gender].has(voice.id));
    const preferredLocale = template.locale.toLowerCase();
    const language = preferredLocale.split("-")[0];

    const selected =
      unused.find((voice) => voice.locale.toLowerCase() === preferredLocale) ||
      unused.find((voice) => voice.locale.toLowerCase().startsWith(`${language}-`)) ||
      unused[0] ||
      candidates[slotByGender[gender] % Math.max(1, candidates.length)];

    slotByGender[gender] += 1;
    if (selected) usedByGender[gender].add(selected.id);

    return {
      ...template,
      // Keep the new style name, and also show the real Speechify catalogue
      // name so customers know which provider voice the profile uses.
      name: selected ? `${selected.display_name} · ${template.name}` : template.name,
      accent: selected ? localeLabel(selected.locale, template.accent) : template.accent,
      providerVoiceId: selected?.id || "",
      providerVoiceName: selected?.display_name || "",
      providerLocale: selected?.locale || "",
    };
  });
}

/** Return the assigned Speechify ID for a Scenering profile or direct voice ID. */
export function resolveSpeechifyVoiceId(
  requestedVoiceId: string,
  catalog: readonly SpeechifyVoice[],
  profiles: readonly SpeechifyVoiceProfile[] = buildSpeechifyVoiceProfiles(catalog)
): string {
  const rawRequested = (requestedVoiceId || "").trim();
  const requested = migrateLegacyVoiceId(rawRequested);
  const direct = catalog.find((voice) => voice.id.toLowerCase() === requested.toLowerCase());
  if (direct) return direct.id;
  const profile = profiles.find((voice) => voice.id.toLowerCase() === requested.toLowerCase());
  if (profile?.providerVoiceId) return profile.providerVoiceId;

  // Unknown explicit provider IDs are left intact so Speechify can return its
  // useful validation error; an empty selection resolves to the first voice.
  return requested || catalog[0]?.id || "";
}

/** Convert Speechify's word-level millisecond marks into Scenering's seconds. */
export function parseSpeechifySpeechMarks(payload: unknown): WordTiming[] {
  const marks = Array.isArray(payload) ? payload : [payload];
  const words: WordTiming[] = [];

  for (const mark of marks) {
    if (!mark || typeof mark !== "object") continue;
    const value = mark as Record<string, unknown>;
    const chunks = Array.isArray(value.chunks) && value.chunks.length > 0
      ? value.chunks
      : [value];

    for (const chunk of chunks) {
      if (!chunk || typeof chunk !== "object") continue;
      const word = chunk as Record<string, unknown>;
      const text = typeof word.value === "string" ? word.value.trim() : "";
      const startMs = Number(word.start_time);
      const endMs = Number(word.end_time);
      if (!text || !Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;

      const start = Math.max(0, startMs / 1000);
      const end = Math.max(start, endMs / 1000);
      words.push({ text, start, end });
    }
  }

  return words.sort((a, b) => a.start - b.start);
}
