/**
 * Scenering's stable catalogue of 20 narrator styles (10 male and 10 female).
 * Profile IDs are application identifiers, not provider voice IDs. Existing
 * names, descriptions and sample text are retained while their synthesis
 * bindings are maintained separately by the Piper engine.
 */
export interface VoicePreset {
  /** Stable Scenering profile ID, retained on saved scenes and projects. */
  id: string;
  name: string;
  gender: "male" | "female";
  locale: string;
  accent: string;
  tone: string;
  recommendedFor: string;
  sampleText: string;
  /** Small speaking-rate variation applied to the mapped Piper voice. */
  rateAdjustment?: string;
}

export const FREE_SCENERING_VOICE_IDS = [
  "scenering_male_01",
  "scenering_female_01",
] as const;

export const STUDIO_VOICE_PRESETS: VoicePreset[] = [
  // Male voices — Warm Conversational is the Free male sample, pinned first.
  {
    id: "scenering_male_01",
    name: "Warm Conversational",
    gender: "male",
    locale: "en-US",
    accent: "American English",
    tone: "Warm, natural and conversational",
    recommendedFor: "Documentaries, explainers and engaging stories",
    sampleText: "Welcome. A good story makes room for curiosity, clarity and a human voice.",
  },
  {
    id: "scenering_male_02",
    name: "Deep Cinematic",
    gender: "male",
    locale: "en-US",
    accent: "American English",
    tone: "Authoritative, deep and cinematic",
    recommendedFor: "Dramatic trailers, film promos and motivation",
    sampleText: "Every choice leaves a mark. Every moment brings the next chapter closer.",
    rateAdjustment: "-8%",
  },
  {
    id: "scenering_male_03",
    name: "British Distinguished",
    gender: "male",
    locale: "en-GB",
    accent: "British English",
    tone: "Articulate, sophisticated and distinguished",
    recommendedFor: "History, luxury brands, architecture and academia",
    sampleText: "Across generations, ideas and craftsmanship shape the places we call home.",
    rateAdjustment: "-4%",
  },
  {
    id: "scenering_male_04",
    name: "Australian Charismatic",
    gender: "male",
    locale: "en-GB",
    accent: "British English",
    tone: "Crisp, charismatic and friendly",
    recommendedFor: "Travel, technology and casual entertainment",
    sampleText: "G'day. Let's take a closer look at what makes this place unforgettable.",
    rateAdjustment: "+3%",
  },
  {
    id: "scenering_male_05",
    name: "Documentary Professional",
    gender: "male",
    locale: "en-US",
    accent: "American English",
    tone: "Smooth, relatable and professional",
    recommendedFor: "Documentaries, guides and educational videos",
    sampleText: "The evidence is clear. Small changes can transform the way a community grows.",
    rateAdjustment: "-4%",
  },
  {
    id: "scenering_male_06",
    name: "Measured Naturalist",
    gender: "male",
    locale: "en-GB",
    accent: "British English",
    tone: "Measured, observant and quietly expressive",
    recommendedFor: "Nature, science and documentary films",
    sampleText: "At first light, the forest stirs, revealing a world that was hidden in the dark.",
    rateAdjustment: "-10%",
  },
  {
    id: "scenering_male_07",
    name: "Powerful Baritone",
    gender: "male",
    locale: "en-US",
    accent: "American English",
    tone: "Monumental, resonant and commanding",
    recommendedFor: "Cinematic openers, epics and moments of authority",
    sampleText: "A new horizon appears. The journey begins with one decisive step.",
    rateAdjustment: "-10%",
  },
  {
    id: "scenering_male_08",
    name: "Energetic Presenter",
    gender: "male",
    locale: "en-US",
    accent: "American English",
    tone: "Punchy, dynamic and assertive",
    recommendedFor: "Promos, social clips and high-energy explainers",
    sampleText: "Stay with us. The most surprising part is still just ahead.",
    rateAdjustment: "+6%",
  },
  {
    id: "scenering_male_09",
    name: "Irish Authority",
    gender: "male",
    locale: "en-GB",
    accent: "British English",
    tone: "Grounded, assured and distinctive",
    recommendedFor: "Thrillers, motivation and dramatic storytelling",
    sampleText: "Listen closely. The detail everyone missed changes the whole story.",
    rateAdjustment: "-8%",
  },
  {
    id: "scenering_male_10",
    name: "Warm Storyteller",
    gender: "male",
    locale: "en-US",
    accent: "American English",
    tone: "Deep, warm and unhurried",
    recommendedFor: "Brand films, long-form stories and reflective narration",
    sampleText: "Some stories begin quietly, then stay with us long after they are told.",
    rateAdjustment: "-12%",
  },

  // Female voices — Clear Conversational is the Free female sample, pinned first.
  {
    id: "scenering_female_01",
    name: "Clear Conversational",
    gender: "female",
    locale: "en-US",
    accent: "American English",
    tone: "Clear, friendly and engaging",
    recommendedFor: "Tutorials, reviews, guides and lifestyle videos",
    sampleText: "Hello there. Let's make this simple, useful and enjoyable from the very first step.",
  },
  {
    id: "scenering_female_02",
    name: "Bright Modern Presenter",
    gender: "female",
    locale: "en-US",
    accent: "American English",
    tone: "Crisp, dynamic, bright and modern",
    recommendedFor: "Short-form video, social highlights and technology",
    sampleText: "Here's the idea: clear choices, thoughtful design and a result you can use today.",
    rateAdjustment: "+5%",
  },
  {
    id: "scenering_female_03",
    name: "British Elegant Narrator",
    gender: "female",
    locale: "en-GB",
    accent: "British English",
    tone: "Polished, expressive and elegant",
    recommendedFor: "Audiobooks, podcasts, literature and storytelling",
    sampleText: "Welcome. Every detail has its place, and every moment has a story to tell.",
    rateAdjustment: "-5%",
  },
  {
    id: "scenering_female_04",
    name: "Australian Calm",
    gender: "female",
    locale: "en-GB",
    accent: "British English",
    tone: "Gentle, soothing and resonant",
    recommendedFor: "Wellness, nature films and relaxed narration",
    sampleText: "Take a slow breath. Let the sound of the waves carry you into the moment.",
    rateAdjustment: "-7%",
  },
  {
    id: "scenering_female_05",
    name: "Peaceful Guide",
    gender: "female",
    locale: "en-US",
    accent: "American English",
    tone: "Peaceful, balanced and melodic",
    recommendedFor: "Relaxation, reflection and ambient guides",
    sampleText: "There is no need to rush. Give yourself a moment to notice what matters.",
    rateAdjustment: "-8%",
  },
  {
    id: "scenering_female_06",
    name: "Warm Articulate",
    gender: "female",
    locale: "en-GB",
    accent: "British English",
    tone: "Witty, warm and articulate",
    recommendedFor: "Intelligent explainers, drama and audiobooks",
    sampleText: "A little patience and a fresh perspective can make an ordinary day remarkable.",
    rateAdjustment: "-5%",
  },
  {
    id: "scenering_female_07",
    name: "Stately Narrator",
    gender: "female",
    locale: "en-GB",
    accent: "British English",
    tone: "Poised, polished and quietly authoritative",
    recommendedFor: "Luxury brands, history and prestige storytelling",
    sampleText: "Elegance is not only what we see. It is also the care behind every choice.",
    rateAdjustment: "-7%",
  },
  {
    id: "scenering_female_08",
    name: "Velvet Sophisticate",
    gender: "female",
    locale: "en-GB",
    accent: "British English",
    tone: "Resonant, refined and contemplative",
    recommendedFor: "Art, culture and sophisticated narration",
    sampleText: "Every frame, every silence and every glance carries a meaning of its own.",
    rateAdjustment: "-6%",
  },
  {
    id: "scenering_female_09",
    name: "Documentary Authority",
    gender: "female",
    locale: "en-US",
    accent: "American English",
    tone: "Steady, grounded and assured",
    recommendedFor: "Documentaries, science and investigative stories",
    sampleText: "What we are about to see is real. The facts reveal a remarkable discovery.",
    rateAdjustment: "-6%",
  },
  {
    id: "scenering_female_10",
    name: "Radiant Storyteller",
    gender: "female",
    locale: "en-US",
    accent: "American English",
    tone: "Radiant, warm and conversational",
    recommendedFor: "Vlogs, lifestyle and friendly interviews",
    sampleText: "Come on in, get comfortable, and let me share a story with you.",
    rateAdjustment: "+2%",
  },
];

/**
 * Import migration only. These historical project values are never presented
 * as catalogue choices or sent to a speech provider as voice bindings.
 */
export const LEGACY_VOICE_IDS: Record<string, string> = {
  guy: "scenering_male_01",
  christopher: "scenering_male_02",
  ryan: "scenering_male_03",
  william: "scenering_male_04",
  brian: "scenering_male_05",
  storyteller: "scenering_male_10",
  freeman: "scenering_male_10",
  naturalist: "scenering_male_06",
  attenborough: "scenering_male_06",
  titan: "scenering_male_07",
  jones: "scenering_male_07",
  firebrand: "scenering_male_08",
  jackson: "scenering_male_08",
  sentinel: "scenering_male_09",
  neeson: "scenering_male_09",
  jenny: "scenering_female_01",
  aria: "scenering_female_02",
  sonia: "scenering_female_03",
  natasha: "scenering_female_04",
  ava: "scenering_female_05",
  raconteur: "scenering_female_06",
  thompson: "scenering_female_06",
  sovereign: "scenering_female_07",
  mirren: "scenering_female_07",
  enigma: "scenering_female_08",
  blanchett: "scenering_female_08",
  investigator: "scenering_female_09",
  weaver: "scenering_female_09",
  confidante: "scenering_female_10",
  roberts: "scenering_female_10",
  "en-us-guyneural": "scenering_male_01",
  "en-us-christopherneural": "scenering_male_02",
  "en-gb-ryanneural": "scenering_male_03",
  "en-au-williammultilingualneural": "scenering_male_04",
  "en-us-brianneural": "scenering_male_05",
  "en-gb-thomasneural": "scenering_male_06",
  "en-us-ericneural": "scenering_male_08",
  "en-ie-connorneural": "scenering_male_09",
  "en-us-jennyneural": "scenering_female_01",
  "en-us-arianeural": "scenering_female_02",
  "en-gb-sonianeural": "scenering_female_03",
  "en-au-natashaneural": "scenering_female_04",
  "en-us-avaneural": "scenering_female_05",
  "en-gb-libbynural": "scenering_female_06",
  "en-us-michelleneural": "scenering_female_09",
  "en-us-emmamultilingualneural": "scenering_female_10",
};

// IDs from old Speechify-backed projects are migrated in-place on load. The
// Scenering profile IDs remain stable after this one-way migration.
for (const gender of ["male", "female"] as const) {
  for (let number = 1; number <= 10; number++) {
    const suffix = String(number).padStart(2, "0");
    LEGACY_VOICE_IDS[`speechify_${gender}_${suffix}`] = `scenering_${gender}_${suffix}`;
  }
}

/** Convert a historical voice identifier to its new Scenering profile ID. */
export function migrateLegacyVoiceId(id: string | null | undefined): string {
  const original = (id || "").trim();
  const normalized = original.toLowerCase().replace(/^(browser:|web:)/, "");
  // Preserve unknown IDs; only known profile migrations are rewritten.
  return LEGACY_VOICE_IDS[normalized] || original;
}

/** Resolve a saved id to its Scenering voice profile, including project migrations. */
export function resolveVoicePreset(id: string | null | undefined): VoicePreset | undefined {
  if (!id) return undefined;
  const migrated = migrateLegacyVoiceId(id).toLowerCase();
  return STUDIO_VOICE_PRESETS.find((voice) => voice.id === migrated);
}
