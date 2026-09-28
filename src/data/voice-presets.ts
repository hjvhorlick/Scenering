/**
 * Narrator catalogue — 20 natural speaking voices (10 male, 10 female):
 * 10 studio voices plus 10 style-inspired narrator personas.
 *
 * This lives in `src/data/` with the other catalogues (caption styles,
 * filters, templates…) so anything that needs the list — the Voiceover
 * studio, the per-scene voice import modal and the public website — reads the
 * same source of truth. `components/VoiceoverStudio.tsx` re-exports it for
 * backwards compatibility.
 */

export interface VoicePreset {
  id: string;
  name: string;
  gender: "male" | "female";
  accent: string;
  tone: string;
  recommendedFor: string;
  sampleText: string;
}

// 20 High-Quality Natural Speaking Voices (10 Male and 10 Female) —
// 10 studio voices plus 10 style-inspired narrator personas.
export const STUDIO_VOICE_PRESETS: VoicePreset[] = [
  // 5 Male Natural Voices (Authentic Human Tone)
  {
    id: "guy",
    name: "Guy",
    gender: "male",
    accent: "American (US)",
    tone: "Warm, Natural & Conversational",
    recommendedFor: "Documentaries, Explainers & Engaging Stories",
    sampleText: "Hello! I am Guy, a warm and conversational American male narrator with natural pacing.",
  },
  {
    id: "christopher",
    name: "Christopher",
    gender: "male",
    accent: "American (US)",
    tone: "Authoritative, Deep & Cinematic",
    recommendedFor: "Dramatic Trailers, Movie Promos & Motivation",
    sampleText: "In a world of infinite possibilities, every second shapes destiny. Christopher speaking.",
  },
  {
    id: "ryan",
    name: "Ryan",
    gender: "male",
    accent: "British RP (UK)",
    tone: "Articulate, Sophisticated & Distinguished",
    recommendedFor: "History, Luxury Brands, Architecture & Academia",
    sampleText: "Good day. I am Ryan, offering a refined British voice for sophisticated storytelling.",
  },
  {
    id: "william",
    name: "William",
    gender: "male",
    accent: "Australian (AU)",
    tone: "Crisp, Charismatic & Friendly",
    recommendedFor: "Travel Vlogs, Tech Reviews & Casual Entertainment",
    sampleText: "G'day! William here, bringing an upbeat and charismatic Australian narration to your video.",
  },
  {
    id: "brian",
    name: "Brian",
    gender: "male",
    accent: "American (US)",
    tone: "Smooth, Relatable & Professional",
    recommendedFor: "Educational Guides, How-Tos, Podcasts & Explanations",
    sampleText: "Hi there! I am Brian, providing smooth, trustworthy professional narration for your project.",
  },

  // 5 Female Natural Voices (Authentic Human Tone)
  {
    id: "jenny",
    name: "Jenny",
    gender: "female",
    accent: "American (US)",
    tone: "Clear, Friendly & Engaging",
    recommendedFor: "Tutorials, Product Reviews, Guides & Lifestyle",
    sampleText: "Hello there! I am Jenny, a clear and friendly American female voice for your videos.",
  },
  {
    id: "aria",
    name: "Aria",
    gender: "female",
    accent: "American (US)",
    tone: "Crisp, Dynamic, Bright & Modern",
    recommendedFor: "Viral Shorts, Reels, TikTok Highlights & Tech",
    sampleText: "Hey everyone! Aria here with high-energy, vibrant narration to keep your viewers hooked.",
  },
  {
    id: "sonia",
    name: "Sonia",
    gender: "female",
    accent: "British RP (UK)",
    tone: "Polished, Elegant & Expressive",
    recommendedFor: "Audiobooks, Podcasts, Storytelling & Literature",
    sampleText: "Welcome. I am Sonia, delivering an elegant and expressive British narration with emotional depth.",
  },
  {
    id: "natasha",
    name: "Natasha",
    gender: "female",
    accent: "Australian (AU)",
    tone: "Calm, Soothing & Resonant",
    recommendedFor: "Meditation, Nature Docs, Wellness & Bedtime Stories",
    sampleText: "Take a gentle breath and relax. Natasha here, sharing a calm and soothing Australian voice.",
  },
  {
    id: "ava",
    name: "Ava",
    gender: "female",
    accent: "American (US)",
    tone: "Peaceful, Balanced & Melodic",
    recommendedFor: "Wellness, Relaxation, Ambient Guides & Reflection",
    sampleText: "Hello. I am Ava, offering a gentle, peaceful voice designed to bring balance and clarity.",
  },

  // 5 Male Persona Narrator Presets (style-inspired — real neural voices
  // tuned to evoke each narrator's delivery; not the named actors)
  {
    id: "freeman",
    name: "Morgan Freeman Style",
    gender: "male",
    accent: "American (US)",
    tone: "Deep, Resonant, Warm Storyteller",
    recommendedFor: "Documentaries, Storytelling & Brand Films",
    sampleText: "Some stories begin quietly, and slowly, they change everything. Let me tell you one.",
  },
  {
    id: "attenborough",
    name: "David Attenborough Style",
    gender: "male",
    accent: "British (UK)",
    tone: "Breathy, Hushed Awe Nature Documentary",
    recommendedFor: "Nature, Science & Documentary Films",
    sampleText: "Here, in the remote corners of our planet, extraordinary things are waiting to be discovered.",
  },
  {
    id: "jones",
    name: "James Earl Jones Style",
    gender: "male",
    accent: "American (US)",
    tone: "Booming, Monumental Deep Bass",
    recommendedFor: "Cinematic Openers, Epics & Authority",
    sampleText: "In the beginning, there was a voice. And that voice carried the weight of kingdoms.",
  },
  {
    id: "neeson",
    name: "Liam Neeson Style",
    gender: "male",
    accent: "Irish (IE)",
    tone: "Authoritative Irish Baritone & Gritty Gravitas",
    recommendedFor: "Thrillers, Motivation & Dramatic Reads",
    sampleText: "I have a particular set of skills. Listen carefully, because what you are about to hear will not soon be forgotten.",
  },
  {
    id: "jackson",
    name: "Samuel L. Jackson Style",
    gender: "male",
    accent: "American (US)",
    tone: "Punchy, Dynamic, Assertive Attitude",
    recommendedFor: "High-Energy Promos, Reactions & Entertainment",
    sampleText: "Hold on to your seats, because this story does not slow down for anybody.",
  },

  // 5 Female Persona Narrator Presets (style-inspired — real neural voices
  // tuned to evoke each narrator's delivery; not the named actors)
  {
    id: "thompson",
    name: "Emma Thompson Style",
    gender: "female",
    accent: "British (UK)",
    tone: "Witty, Warm & Articulate British Charm",
    recommendedFor: "Intelligent Explainers, Drama & Audiobooks",
    sampleText: "Intelligence and warmth are not opposites — allow me to demonstrate, one story at a time.",
  },
  {
    id: "mirren",
    name: "Helen Mirren Style",
    gender: "female",
    accent: "British (UK)",
    tone: "Stately, Regal & Poised British Dame",
    recommendedFor: "Luxury Brands, History & Prestige",
    sampleText: "Elegance is not about what you say. It is about how you say it.",
  },
  {
    id: "blanchett",
    name: "Cate Blanchett Style",
    gender: "female",
    accent: "Australian (AU)",
    tone: "Ethereal, Velvety & Hypnotic Sophistication",
    recommendedFor: "Art, Culture & Sophisticated Narration",
    sampleText: "Every frame, every silence, every glance carries meaning. Let us begin.",
  },
  {
    id: "weaver",
    name: "Sigourney Weaver Style",
    gender: "female",
    accent: "American (US)",
    tone: "Smoky, Grounded & Cool Documentary Authority",
    recommendedFor: "Documentaries, Science & Investigative",
    sampleText: "What we are about to witness is real, and it is extraordinary. Observe closely.",
  },
  {
    id: "roberts",
    name: "Julia Roberts Style",
    gender: "female",
    accent: "American (US)",
    tone: "Radiant, Smiling & Warm Conversational Lilt",
    recommendedFor: "Conversational Vlogs, Lifestyle & Interviews",
    sampleText: "Hey, come on in — grab a coffee and let me tell you a little story.",
  },
];
