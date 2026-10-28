/**
 * Provisional Piper model set used by the current Scenering profile bindings.
 * This catalogue does not itself certify each model's training-data rights,
 * license or attribution; those still need a model-by-model release audit.
 */
export interface PiperCandidateVoice {
  id: string;
  name: string;
  locale: "en_US" | "en_GB";
  quality: "medium" | "high";
  speakerId?: number;
}

export const PIPER_CANDIDATE_VOICES: readonly PiperCandidateVoice[] = [
  { id: "en_US-amy-medium", name: "Amy", locale: "en_US", quality: "medium" },
  { id: "en_US-arctic-medium", name: "Arctic", locale: "en_US", quality: "medium", speakerId: 0 },
  { id: "en_US-hfc_female-medium", name: "HFC Female", locale: "en_US", quality: "medium" },
  { id: "en_US-hfc_male-medium", name: "HFC Male", locale: "en_US", quality: "medium" },
  { id: "en_US-joe-medium", name: "Joe", locale: "en_US", quality: "medium" },
  { id: "en_US-kristin-medium", name: "Kristin", locale: "en_US", quality: "medium" },
  { id: "en_US-kusal-medium", name: "Kusal", locale: "en_US", quality: "medium" },
  { id: "en_US-l2arctic-medium", name: "L2 Arctic", locale: "en_US", quality: "medium", speakerId: 0 },
  { id: "en_US-lessac-high", name: "Lessac", locale: "en_US", quality: "high" },
  { id: "en_US-libritts_r-medium", name: "LibriTTS-R", locale: "en_US", quality: "medium", speakerId: 0 },
  { id: "en_US-ljspeech-high", name: "LJ Speech", locale: "en_US", quality: "high" },
  { id: "en_US-ryan-high", name: "Ryan", locale: "en_US", quality: "high" },
  { id: "en_GB-alan-medium", name: "Alan", locale: "en_GB", quality: "medium" },
  { id: "en_GB-alba-medium", name: "Alba", locale: "en_GB", quality: "medium" },
  { id: "en_GB-aru-medium", name: "Aru", locale: "en_GB", quality: "medium", speakerId: 0 },
  { id: "en_GB-cori-high", name: "Cori", locale: "en_GB", quality: "high" },
  { id: "en_GB-jenny_dioco-medium", name: "Jenny Dioco", locale: "en_GB", quality: "medium" },
  { id: "en_GB-northern_english_male-medium", name: "Northern English Male", locale: "en_GB", quality: "medium" },
  { id: "en_GB-semaine-medium", name: "Semaine", locale: "en_GB", quality: "medium", speakerId: 0 },
  { id: "en_GB-vctk-medium", name: "VCTK", locale: "en_GB", quality: "medium", speakerId: 0 },
] as const;

export const PIPER_CANDIDATE_REPOSITORY = "https://huggingface.co/rhasspy/piper-voices";
