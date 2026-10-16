/**
 * Scenering's 20 Speechify narrator styles (10 male and 10 female).
 *
 * These are Scenering style profiles, not provider voice names. Every style is
 * cast with one of the eight voices Speechify built for Simba 3.2 — its
 * clearest voices — so several styles share a speaker and differ by speaking
 * rate. Speechify serves every other catalogue voice on Simba 3.2 by zero-shot
 * imitation, which sounds duller; those are only a fallback if one of the
 * eight is ever missing from a customer's catalogue (see speechify.ts). The
 * first style in each gender group is the Free sample profile.
 */
export interface VoicePreset {
  /** Stable project ID; the browser resolves it to this customer's Speechify voice. */
  id: string;
  name: string;
  gender: "male" | "female";
  locale: string;
  accent: string;
  tone: string;
  recommendedFor: string;
  sampleText: string;
  /** Simba 3.x applies rate changes; pitch/volume are accepted but not applied. */
  speechifyRate?: string;
  /** The Simba 3.2 voice (one of SIMBA_32_VOICE_IDS) that speaks this style. */
  speechifyVoiceId?: string;
}

/**
 * The eight voices Speechify built for Simba 3.2. Since 2026-09-08 the model
 * also speaks the other ~950 catalogue voices, but through zero-shot training
 * rather than these voices' own (Speechify changelog, "simba-3.2 serves every
 * English voice"). Changing a style's voice means bumping SPEECHIFY_RENDITION.
 */
export const SIMBA_32_VOICE_IDS = [
  "wyatt_32",
  "dominic_32",
  "hugh_32",
  "edmund_32",
  "geffen_32",
  "harper_32",
  "beatrice_32",
  "imogen_32",
] as const;

export const FREE_SPEECHIFY_VOICE_IDS = [
  "speechify_male_01",
  "speechify_female_01",
] as const;

export const STUDIO_VOICE_PRESETS: VoicePreset[] = [
  // Male voices — Warm Conversational is the Free male sample, pinned first.
  {
    id: "speechify_male_01",
    name: "Warm Conversational",
    gender: "male",
    locale: "en-US",
    accent: "American English",
    tone: "Warm, natural and conversational",
    recommendedFor: "Documentaries, explainers and engaging stories",
    sampleText: "Welcome. A good story makes room for curiosity, clarity and a human voice.",
    speechifyVoiceId: "wyatt_32",
  },
  {
    id: "speechify_male_02",
    name: "Deep Cinematic",
    gender: "male",
    locale: "en-US",
    accent: "American English",
    tone: "Authoritative, deep and cinematic",
    recommendedFor: "Dramatic trailers, film promos and motivation",
    sampleText: "Every choice leaves a mark. Every moment brings the next chapter closer.",
    speechifyRate: "-8%",
    speechifyVoiceId: "wyatt_32",
  },
  {
    id: "speechify_male_03",
    name: "British Distinguished",
    gender: "male",
    locale: "en-GB",
    accent: "British English",
    tone: "Articulate, sophisticated and distinguished",
    recommendedFor: "History, luxury brands, architecture and academia",
    sampleText: "Across generations, ideas and craftsmanship shape the places we call home.",
    speechifyRate: "-4%",
    speechifyVoiceId: "hugh_32",
  },
  {
    id: "speechify_male_04",
    name: "Australian Charismatic",
    gender: "male",
    locale: "en-GB",
    accent: "British English",
    tone: "Crisp, charismatic and friendly",
    recommendedFor: "Travel, technology and casual entertainment",
    sampleText: "G'day. Let's take a closer look at what makes this place unforgettable.",
    speechifyRate: "+3%",
    speechifyVoiceId: "edmund_32",
  },
  {
    id: "speechify_male_05",
    name: "Documentary Professional",
    gender: "male",
    locale: "en-US",
    accent: "American English",
    tone: "Smooth, relatable and professional",
    recommendedFor: "Documentaries, guides and educational videos",
    sampleText: "The evidence is clear. Small changes can transform the way a community grows.",
    speechifyRate: "-4%",
    speechifyVoiceId: "dominic_32",
  },
  {
    id: "speechify_male_06",
    name: "Measured Naturalist",
    gender: "male",
    locale: "en-GB",
    accent: "British English",
    tone: "Measured, observant and quietly expressive",
    recommendedFor: "Nature, science and documentary films",
    sampleText: "At first light, the forest stirs, revealing a world that was hidden in the dark.",
    speechifyRate: "-10%",
    speechifyVoiceId: "edmund_32",
  },
  {
    id: "speechify_male_07",
    name: "Powerful Baritone",
    gender: "male",
    locale: "en-US",
    accent: "American English",
    tone: "Monumental, resonant and commanding",
    recommendedFor: "Cinematic openers, epics and moments of authority",
    sampleText: "A new horizon appears. The journey begins with one decisive step.",
    speechifyRate: "-10%",
    speechifyVoiceId: "dominic_32",
  },
  {
    id: "speechify_male_08",
    name: "Energetic Presenter",
    gender: "male",
    locale: "en-US",
    accent: "American English",
    tone: "Punchy, dynamic and assertive",
    recommendedFor: "Promos, social clips and high-energy explainers",
    sampleText: "Stay with us. The most surprising part is still just ahead.",
    speechifyRate: "+6%",
    speechifyVoiceId: "dominic_32",
  },
  {
    id: "speechify_male_09",
    name: "Irish Authority",
    gender: "male",
    locale: "en-GB",
    accent: "British English",
    tone: "Grounded, assured and distinctive",
    recommendedFor: "Thrillers, motivation and dramatic storytelling",
    sampleText: "Listen closely. The detail everyone missed changes the whole story.",
    speechifyRate: "-8%",
    speechifyVoiceId: "hugh_32",
  },
  {
    id: "speechify_male_10",
    name: "Warm Storyteller",
    gender: "male",
    locale: "en-US",
    accent: "American English",
    tone: "Deep, warm and unhurried",
    recommendedFor: "Brand films, long-form stories and reflective narration",
    sampleText: "Some stories begin quietly, then stay with us long after they are told.",
    speechifyRate: "-12%",
    speechifyVoiceId: "wyatt_32",
  },

  // Female voices — Clear Conversational is the Free female sample, pinned first.
  {
    id: "speechify_female_01",
    name: "Clear Conversational",
    gender: "female",
    locale: "en-US",
    accent: "American English",
    tone: "Clear, friendly and engaging",
    recommendedFor: "Tutorials, reviews, guides and lifestyle videos",
    sampleText: "Hello there. Let's make this simple, useful and enjoyable from the very first step.",
    speechifyVoiceId: "geffen_32",
  },
  {
    id: "speechify_female_02",
    name: "Bright Modern Presenter",
    gender: "female",
    locale: "en-US",
    accent: "American English",
    tone: "Crisp, dynamic, bright and modern",
    recommendedFor: "Short-form video, social highlights and technology",
    sampleText: "Here's the idea: clear choices, thoughtful design and a result you can use today.",
    speechifyRate: "+5%",
    speechifyVoiceId: "geffen_32",
  },
  {
    id: "speechify_female_03",
    name: "British Elegant Narrator",
    gender: "female",
    locale: "en-GB",
    accent: "British English",
    tone: "Polished, expressive and elegant",
    recommendedFor: "Audiobooks, podcasts, literature and storytelling",
    sampleText: "Welcome. Every detail has its place, and every moment has a story to tell.",
    speechifyRate: "-5%",
    speechifyVoiceId: "imogen_32",
  },
  {
    id: "speechify_female_04",
    name: "Australian Calm",
    gender: "female",
    locale: "en-GB",
    accent: "British English",
    tone: "Gentle, soothing and resonant",
    recommendedFor: "Wellness, nature films and relaxed narration",
    sampleText: "Take a slow breath. Let the sound of the waves carry you into the moment.",
    speechifyRate: "-7%",
    speechifyVoiceId: "beatrice_32",
  },
  {
    id: "speechify_female_05",
    name: "Peaceful Guide",
    gender: "female",
    locale: "en-US",
    accent: "American English",
    tone: "Peaceful, balanced and melodic",
    recommendedFor: "Relaxation, reflection and ambient guides",
    sampleText: "There is no need to rush. Give yourself a moment to notice what matters.",
    speechifyRate: "-8%",
    speechifyVoiceId: "harper_32",
  },
  {
    id: "speechify_female_06",
    name: "Warm Articulate",
    gender: "female",
    locale: "en-GB",
    accent: "British English",
    tone: "Witty, warm and articulate",
    recommendedFor: "Intelligent explainers, drama and audiobooks",
    sampleText: "A little patience and a fresh perspective can make an ordinary day remarkable.",
    speechifyRate: "-5%",
    speechifyVoiceId: "beatrice_32",
  },
  {
    id: "speechify_female_07",
    name: "Stately Narrator",
    gender: "female",
    locale: "en-GB",
    accent: "British English",
    tone: "Poised, polished and quietly authoritative",
    recommendedFor: "Luxury brands, history and prestige storytelling",
    sampleText: "Elegance is not only what we see. It is also the care behind every choice.",
    speechifyRate: "-7%",
    speechifyVoiceId: "imogen_32",
  },
  {
    id: "speechify_female_08",
    name: "Velvet Sophisticate",
    gender: "female",
    locale: "en-GB",
    accent: "British English",
    tone: "Resonant, refined and contemplative",
    recommendedFor: "Art, culture and sophisticated narration",
    sampleText: "Every frame, every silence and every glance carries a meaning of its own.",
    speechifyRate: "-6%",
    speechifyVoiceId: "imogen_32",
  },
  {
    id: "speechify_female_09",
    name: "Documentary Authority",
    gender: "female",
    locale: "en-US",
    accent: "American English",
    tone: "Steady, grounded and assured",
    recommendedFor: "Documentaries, science and investigative stories",
    sampleText: "What we are about to see is real. The facts reveal a remarkable discovery.",
    speechifyRate: "-6%",
    speechifyVoiceId: "geffen_32",
  },
  {
    id: "speechify_female_10",
    name: "Radiant Storyteller",
    gender: "female",
    locale: "en-US",
    accent: "American English",
    tone: "Radiant, warm and conversational",
    recommendedFor: "Vlogs, lifestyle and friendly interviews",
    sampleText: "Come on in, get comfortable, and let me share a story with you.",
    speechifyRate: "+2%",
    speechifyVoiceId: "harper_32",
  },
];

/**
 * Import migration only. These historical project values are never presented
 * as catalogue choices or sent to a speech provider as voice bindings.
 */
export const LEGACY_VOICE_IDS: Record<string, string> = {
  guy: "speechify_male_01",
  christopher: "speechify_male_02",
  ryan: "speechify_male_03",
  william: "speechify_male_04",
  brian: "speechify_male_05",
  storyteller: "speechify_male_10",
  freeman: "speechify_male_10",
  naturalist: "speechify_male_06",
  attenborough: "speechify_male_06",
  titan: "speechify_male_07",
  jones: "speechify_male_07",
  firebrand: "speechify_male_08",
  jackson: "speechify_male_08",
  sentinel: "speechify_male_09",
  neeson: "speechify_male_09",
  jenny: "speechify_female_01",
  aria: "speechify_female_02",
  sonia: "speechify_female_03",
  natasha: "speechify_female_04",
  ava: "speechify_female_05",
  raconteur: "speechify_female_06",
  thompson: "speechify_female_06",
  sovereign: "speechify_female_07",
  mirren: "speechify_female_07",
  enigma: "speechify_female_08",
  blanchett: "speechify_female_08",
  investigator: "speechify_female_09",
  weaver: "speechify_female_09",
  confidante: "speechify_female_10",
  roberts: "speechify_female_10",
  "en-us-guyneural": "speechify_male_01",
  "en-us-christopherneural": "speechify_male_02",
  "en-gb-ryanneural": "speechify_male_03",
  "en-au-williammultilingualneural": "speechify_male_04",
  "en-us-brianneural": "speechify_male_05",
  "en-gb-thomasneural": "speechify_male_06",
  "en-us-ericneural": "speechify_male_08",
  "en-ie-connorneural": "speechify_male_09",
  "en-us-jennyneural": "speechify_female_01",
  "en-us-arianeural": "speechify_female_02",
  "en-gb-sonianeural": "speechify_female_03",
  "en-au-natashaneural": "speechify_female_04",
  "en-us-avaneural": "speechify_female_05",
  "en-gb-libbynural": "speechify_female_06",
  "en-us-michelleneural": "speechify_female_09",
  "en-us-emmamultilingualneural": "speechify_female_10",
};

/** Convert a historical voice identifier to its new Scenering profile ID. */
export function migrateLegacyVoiceId(id: string | null | undefined): string {
  const original = (id || "").trim();
  const normalized = original.toLowerCase().replace(/^(browser:|web:)/, "");
  // Preserve case for direct customer-owned Speechify IDs: provider IDs are
  // opaque and may be case-sensitive. Only known historical IDs are rewritten.
  return LEGACY_VOICE_IDS[normalized] || original;
}

/** Resolve a saved id to its Scenering Speechify style, including project migrations. */
export function resolveVoicePreset(id: string | null | undefined): VoicePreset | undefined {
  if (!id) return undefined;
  const migrated = migrateLegacyVoiceId(id).toLowerCase();
  return STUDIO_VOICE_PRESETS.find((voice) => voice.id === migrated);
}

/**
 * True when two selections are spoken by the same Speechify voice: the same
 * style, two styles cast with one voice, or a style and that voice picked
 * directly from the directory. Two-voice rotation needs two speakers.
 */
export function sameSpeechifySpeaker(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const speaker = (id: string) => (resolveVoicePreset(id)?.speechifyVoiceId || migrateLegacyVoiceId(id)).toLowerCase();
  return speaker(a) === speaker(b);
}
