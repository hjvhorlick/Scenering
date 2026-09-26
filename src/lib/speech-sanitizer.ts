/**
 * Speech Sanitizer & Text-Normalization Preprocessing Engine for Voiceover Narration
 *
 * Implements a multi-stage text normalization pipeline and phonetic dictionary lookup:
 *
 * 1. SCRIPT CHARACTERS & STAGE CUES:
 *    - Strips leading character names/speaker tags (e.g., "NARRATOR:", "SPEAKER 1:", "HOST:")
 *    - Converts bracketed stage directions (e.g., "[sighs]", "(pause)", "[chuckles]") into natural pauses
 *
 * 2. SCRIPTURAL CITATIONS & VERSES:
 *    - Replaces hyphens and dashes in verse/chapter citations with 'to' ("John 3:5-8" -> "John 3: 5 to 8")
 *    - Handles complex multi-verse lists ("verses 5-8", "Luke 1:5-10, 13-17")
 *    - Expands numbered books into ordinals ("1 John" -> "First John", "2 Cor." -> "Second Corinthians")
 *    - Expands standard Bible book abbreviations into their full spoken names
 *
 * 3. ROMAN NUMERALS:
 *    - Titles & rulers ("King Henry VIII" -> "King Henry the Eighth", "Pope John Paul II" -> "Pope John Paul the Second")
 *    - Sections & eras ("Chapter IV" -> "Chapter Four", "World War II" -> "World War Two")
 *
 * 4. NUMBERS, CURRENCIES, FRACTIONS & MEASUREMENTS:
 *    - "$100" -> "100 dollars", "£50" -> "50 pounds", "€25" -> "25 euros"
 *    - "95%" -> "95 percent", "1/2" -> "one half", "3/4" -> "three quarters"
 *    - "100km" -> "100 kilometers", "50mph" -> "50 miles per hour"
 *
 * 5. SYMBOLS STRIPPING:
 *    - Markdown (*, **, _, ~, `), hashtags (#), bullets, emojis, and unicode symbols are stripped
 *    - Quotes are stripped so TTS never vocalizes "quote"
 *    - Slashes and dashes converted to natural conversational connectors and pauses
 *
 * 6. PHONETIC DICTIONARY SUBSTITUTIONS:
 *    - Case-insensitive whole-word boundary substitution using built-in + custom dictionary
 */

import {
  applyPhoneticDictionary,
  type PhoneticEntry,
} from "./phonetic-dictionary";

// Standard Bible Book Abbreviations & Full Names
const BIBLE_BOOKS: [RegExp, string][] = [
  // Numbered Books (Old & New Testament)
  [/\b1\s*(?:st)?\s*Chron(?:icles)?(?:\.|\b)/gi, "First Chronicles"],
  [/\b2\s*(?:nd)?\s*Chron(?:icles)?(?:\.|\b)/gi, "Second Chronicles"],
  [/\b1\s*(?:st)?\s*Cor(?:inthians)?(?:\.|\b)/gi, "First Corinthians"],
  [/\b2\s*(?:nd)?\s*Cor(?:inthians)?(?:\.|\b)/gi, "Second Corinthians"],
  [/\b1\s*(?:st)?\s*John(?:\.|\b)/gi, "First John"],
  [/\b2\s*(?:nd)?\s*John(?:\.|\b)/gi, "Second John"],
  [/\b3\s*(?:rd)?\s*John(?:\.|\b)/gi, "Third John"],
  [/\b1\s*(?:st)?\s*Jn(?:\.|\b)/gi, "First John"],
  [/\b2\s*(?:nd)?\s*Jn(?:\.|\b)/gi, "Second John"],
  [/\b3\s*(?:rd)?\s*Jn(?:\.|\b)/gi, "Third John"],
  [/\b1\s*(?:st)?\s*Kgs?(?:\.|\b)/gi, "First Kings"],
  [/\b2\s*(?:nd)?\s*Kgs?(?:\.|\b)/gi, "Second Kings"],
  [/\b1\s*(?:st)?\s*Kings(?:\.|\b)/gi, "First Kings"],
  [/\b2\s*(?:nd)?\s*Kings(?:\.|\b)/gi, "Second Kings"],
  [/\b1\s*(?:st)?\s*Pet(?:er)?(?:\.|\b)/gi, "First Peter"],
  [/\b2\s*(?:nd)?\s*Pet(?:er)?(?:\.|\b)/gi, "Second Peter"],
  [/\b1\s*(?:st)?\s*Sam(?:uel)?(?:\.|\b)/gi, "First Samuel"],
  [/\b2\s*(?:nd)?\s*Sam(?:uel)?(?:\.|\b)/gi, "Second Samuel"],
  [/\b1\s*(?:st)?\s*Thess(?:alonians)?(?:\.|\b)/gi, "First Thessalonians"],
  [/\b2\s*(?:nd)?\s*Thess(?:alonians)?(?:\.|\b)/gi, "Second Thessalonians"],
  [/\b1\s*(?:st)?\s*Tim(?:othy)?(?:\.|\b)/gi, "First Timothy"],
  [/\b2\s*(?:nd)?\s*Tim(?:othy)?(?:\.|\b)/gi, "Second Timothy"],

  // Old Testament
  [/\bGen(?:\.|\b)/gi, "Genesis"],
  [/\bExod?(?:\.|\b)/gi, "Exodus"],
  [/\bLev(?:\.|\b)/gi, "Leviticus"],
  [/\bNum(?:\.|\b)/gi, "Numbers"],
  [/\bDeut(?:\.|\b)/gi, "Deuteronomy"],
  [/\bJosh(?:\.|\b)/gi, "Joshua"],
  [/\bJudg(?:\.|\b)/gi, "Judges"],
  [/\bNeh(?:\.|\b)/gi, "Nehemiah"],
  [/\bEsth(?:\.|\b)/gi, "Esther"],
  [/\bPss?(?:\.|\b)/gi, "Psalms"],
  [/\bProv(?:\.|\b)/gi, "Proverbs"],
  [/\bEccl(?:es)?(?:\.|\b)/gi, "Ecclesiastes"],
  [/\bSong of Sol(?:omon)?(?:\.|\b)/gi, "Song of Solomon"],
  [/\bIsa(?:\.|\b)/gi, "Isaiah"],
  [/\bJer(?:\.|\b)/gi, "Jeremiah"],
  [/\bLam(?:\.|\b)/gi, "Lamentations"],
  [/\bEzek(?:\.|\b)/gi, "Ezekiel"],
  [/\bDan(?:\.|\b)/gi, "Daniel"],
  [/\bHos(?:\.|\b)/gi, "Hosea"],
  [/\bObad(?:\.|\b)/gi, "Obadiah"],
  [/\bMic(?:\.|\b)/gi, "Micah"],
  [/\bNah(?:\.|\b)/gi, "Nahum"],
  [/\bHab(?:\.|\b)/gi, "Habakkuk"],
  [/\bZeph(?:\.|\b)/gi, "Zephaniah"],
  [/\bHag(?:\.|\b)/gi, "Haggai"],
  [/\bZech(?:\.|\b)/gi, "Zechariah"],
  [/\bMal(?:\.|\b)/gi, "Malachi"],

  // New Testament
  [/\bMatt?(?:\.|\b)/gi, "Matthew"],
  [/\bMt(?:\.|\b)/g, "Matthew"],
  [/\bMk(?:\.|\b)/g, "Mark"],
  [/\bLk(?:\.|\b)/g, "Luke"],
  [/\bJn(?:\.|\b)/g, "John"],
  [/\bRom(?:ans)?(?:\.|\b)/gi, "Romans"],
  [/\bGal(?:\.|\b)/gi, "Galatians"],
  [/\bEph(?:\.|\b)/gi, "Ephesians"],
  [/\bPhil(?:\.|\b)/gi, "Philippians"],
  [/\bCol(?:\.|\b)/gi, "Colossians"],
  [/\bTit(?:\.|\b)/gi, "Titus"],
  [/\bPhilem?(?:\.|\b)/gi, "Philemon"],
  [/\bHeb(?:\.|\b)/gi, "Hebrews"],
  [/\bJas(?:\.|\b)/gi, "James"],
  [/\bRev(?:\.|\b)/gi, "Revelation"],
];

// Roman Numerals Conversion for Titles, Rulers, Chapters, Parts
const ROMAN_ORDINAL_MAP: Record<string, string> = {
  I: "the First",
  II: "the Second",
  III: "the Third",
  IV: "the Fourth",
  V: "the Fifth",
  VI: "the Sixth",
  VII: "the Seventh",
  VIII: "the Eighth",
  IX: "the Ninth",
  X: "the Tenth",
  XI: "the Eleventh",
  XII: "the Twelfth",
  XIII: "the Thirteenth",
  XIV: "the Fourteenth",
  XV: "the Fifteenth",
  XVI: "the Sixteenth",
};

const ROMAN_CARDINAL_MAP: Record<string, string> = {
  I: "One",
  II: "Two",
  III: "Three",
  IV: "Four",
  V: "Five",
  VI: "Six",
  VII: "Seven",
  VIII: "Eight",
  IX: "Nine",
  X: "Ten",
  XI: "Eleven",
  XII: "Twelve",
};

// Common abbreviations expanded into natural prose for TTS
const ABBREVIATIONS: [RegExp, string][] = [
  [/\be\.g\.,?\s*/gi, "for example, "],
  [/\bi\.e\.,?\s*/gi, "that is, "],
  [/\betc\b\.?/gi, "etcetera"],
  [/\bvs\.?\b/gi, "versus"],
  [/\band\/or\b/gi, "and or"],
  [/\bw\/o\b/gi, "without"],
  [/\bw\//gi, "with "],
  [/\bapprox\.?\b/gi, "approximately"],
  [/\bdept\.?\b/gi, "department"],
  [/\bmin\.?\b(?=\s*\d)/gi, "minutes"],
  [/\bsec\.?\b(?=\s*\d)/gi, "seconds"],
  [/\bhr\.?\b(?=\s*\d)/gi, "hours"],
  [/\bDr\.\s+(?=[A-Z])/g, "Doctor "],
  [/\bMr\.\s+(?=[A-Z])/g, "Mister "],
  [/\bMrs\.\s+(?=[A-Z])/g, "Missus "],
  [/\bMs\.\s+(?=[A-Z])/g, "Ms "],
  [/\bSt\.\s+(?=[A-Z])/g, "Saint "],
  [/\bNo\.\s*(\d+)/gi, "Number $1"],
];

// Fractions
const FRACTIONS: [RegExp, string][] = [
  [/\b1\/2\b/g, "one half"],
  [/\b1\/3\b/g, "one third"],
  [/\b2\/3\b/g, "two thirds"],
  [/\b1\/4\b/g, "one quarter"],
  [/\b3\/4\b/g, "three quarters"],
  [/\b1\/5\b/g, "one fifth"],
];

export interface NormalizationStepLog {
  step: string;
  description: string;
  changed: boolean;
  text: string;
}

export interface NormalizationResult {
  spokenText: string;
  steps: NormalizationStepLog[];
}

export interface NormalizationOptions {
  customEntries?: PhoneticEntry[];
  stripSpeakerTags?: boolean;
}

/**
 * 1. Script Characters & Stage Directions Preprocessing
 * Strips leading dialogue speaker tags (e.g., "NARRATOR:", "SPEAKER 1:")
 * and softens stage cues like "[sighs]" or "(pause)" into natural pauses.
 */
export function normalizeScriptCharacters(text: string, stripSpeakerTags = true): string {
  let result = text;

  if (stripSpeakerTags) {
    // Strip leading speaker tags at line starts:
    // e.g. "NARRATOR: Welcome..." -> "Welcome..."
    // e.g. "SPEAKER 1: Indeed." -> "Indeed."
    // e.g. "HOST (V.O.): Here we are." -> "Here we are."
    // e.g. "CHARACTER: Behold." -> "Behold."
    result = result.replace(
      /(?:^|\n)\s*(?:NARRATOR|VOICEOVER|HOST|SPEAKER\s*\d+|CHARACTER|WOMAN|MAN|VOICE|INTERVIEWER)(?:\s*\([^)]*\))?\s*:\s*/gi,
      ""
    );
  }

  // Convert bracketed or parenthesized action/stage directions into natural pauses
  // e.g. "[sighs]" or "[laughs]" or "(pause)" or "(softly)"
  result = result.replace(/\[(?:sighs?|laughs?|chuckles?|pause|beat|music\s*swells?|applause)\]/gi, ", ");
  result = result.replace(/\((?:pause|beat|softly|whispering|shouting|clears\s*throat)\)/gi, ", ");

  return result;
}

/**
 * 2. Scriptural Citations & Verses Preprocessing
 * Replaces '-' or '–' with 'to' for verse & chapter ranges, and expands abbreviations.
 */
export function normalizeScripturalCitations(text: string): string {
  let result = text;

  // Expand standard Bible book names & abbreviations first
  for (const [pattern, replacement] of BIBLE_BOOKS) {
    result = result.replace(pattern, replacement);
  }

  // Scripture verse ranges: "John 3:5-8", "3:5 - 8", "3:16–18" -> "John 3: 5 to 8"
  result = result.replace(/(\b\d+)[:.]\s*(\d+)\s*[-–—]\s*(\d+\b)/g, "$1: $2 to $3");

  // Scripture multiple verse list connectors: "John 3:16-18, 20-21" -> "John 3: 16 to 18, and 20 to 21"
  result = result.replace(/(\bto\s*\d+),\s*(\d+\s*to\s*\d+\b)/g, "$1, and $2");

  // Verse ranges: "verses 5-8", "verse 5-8", "vv. 5-8" -> "verses 5 to 8"
  result = result.replace(/\b(verses?|vv?\.?)\s*(\d+)\s*[-–—]\s*(\d+)\b/gi, "$1 $2 to $3");

  // Chapter ranges: "chapters 3-5", "chapter 3-5", "ch. 3-5" -> "chapters 3 to 5"
  result = result.replace(/\b(chapters?|ch\.?)\s*(\d+)\s*[-–—]\s*(\d+)\b/gi, "$1 $2 to $3");

  // General numeric ranges: "pages 10-15" or "5-8" -> "5 to 8"
  result = result.replace(/(\b\d+)\s*[-–—]\s*(\d+\b)/g, "$1 to $2");

  return result;
}

/**
 * 3. Roman Numerals Preprocessing
 * Translates Roman numerals in titles, chapters, parts, and historical events.
 */
export function normalizeRomanNumerals(text: string): string {
  let result = text;

  // Monarchs & Popes: "King Henry VIII" -> "King Henry the Eighth", "Pope John Paul II" -> "Pope John Paul the Second"
  result = result.replace(
    /\b(King|Queen|Emperor|Pope|Prince|Lord|Henry|Edward|George|Charles|Louis|John\s*Paul|Alexander|Napoleon)\s+([IVXLCDM]+)\b/gi,
    (match, title, numeral) => {
      const upper = numeral.toUpperCase();
      const spoken = ROMAN_ORDINAL_MAP[upper];
      return spoken ? `${title} ${spoken}` : match;
    }
  );

  // Sections / Chapters: "Chapter IV" -> "Chapter Four", "Part III" -> "Part Three"
  result = result.replace(
    /\b(Chapter|Part|Act|Scene|Volume|Vol\.|Book)\s+([IVXLCDM]+)\b/gi,
    (match, label, numeral) => {
      const upper = numeral.toUpperCase();
      const spoken = ROMAN_CARDINAL_MAP[upper];
      return spoken ? `${label} ${spoken}` : match;
    }
  );

  // Historical wars: "World War II" -> "World War Two", "World War I" -> "World War One"
  result = result.replace(/\bWorld\s*War\s*(I|II)\b/gi, (match, num) => {
    return num.toUpperCase() === "II" ? "World War Two" : "World War One";
  });

  return result;
}

/**
 * 4. Numbers, Currencies, Fractions, Units & Symbols Preprocessing
 */
export function normalizeNumbersAndSymbols(text: string): string {
  let result = text;

  // Currency symbols
  result = result.replace(/\$(\d+(?:\.\d+)?)\s*(?:million|m\b)/gi, "$1 million dollars");
  result = result.replace(/\$(\d+(?:\.\d+)?)\s*(?:billion|b\b)/gi, "$1 billion dollars");
  result = result.replace(/\$(\d+(?:\.\d+)?)/g, "$1 dollars");
  result = result.replace(/£(\d+(?:\.\d+)?)/g, "$1 pounds");
  result = result.replace(/€(\d+(?:\.\d+)?)/g, "$1 euros");

  // Percentages
  result = result.replace(/(\d+(?:\.\d+)?)\s*%/g, "$1 percent");

  // Fractions
  for (const [pattern, spoken] of FRACTIONS) {
    result = result.replace(pattern, spoken);
  }

  // Units of measurement
  result = result.replace(/(\b\d+)\s*km\/h\b/gi, "$1 kilometers per hour");
  result = result.replace(/(\b\d+)\s*mph\b/gi, "$1 miles per hour");
  result = result.replace(/(\b\d+)\s*km\b/gi, "$1 kilometers");
  result = result.replace(/(\b\d+)\s*ft\b/gi, "$1 feet");
  result = result.replace(/(\b\d+)\s*in\b/gi, "$1 inches");
  result = result.replace(/(\b\d+)\s*m\b(?!\w)/gi, "$1 meters");

  // Abbreviations
  for (const [pattern, replacement] of ABBREVIATIONS) {
    result = result.replace(pattern, replacement);
  }

  // Common idioms
  result = result.replace(/\b24\/7\b/g, "twenty four seven");

  // Single alphabet letter list markers: "A. Point" -> "Point A, Point"
  result = result.replace(/(?:^|(?<=[.!?\n]))\s*([A-Za-z])[\.)]\s+/g, "Point $1, ");

  // Strip emojis and unicode pictographs completely so TTS doesn't speak their names
  result = result.replace(
    /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu,
    " "
  );

  // Markdown formatting removal
  result = result.replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1");
  result = result.replace(/\*/g, " ");

  // Hashtags: #faith -> faith (never vocalize "hashtag")
  result = result.replace(/#(\w+)/g, "$1");
  result = result.replace(/#/g, " ");

  // Underscores
  result = result.replace(/_{1,3}([^_]+)_{1,3}/g, "$1");
  result = result.replace(/_/g, " ");

  // Backticks & tildes
  result = result.replace(/`([^`]+)`/g, "$1");
  result = result.replace(/`/g, " ");
  result = result.replace(/~{1,2}([^~]+)~{1,2}/g, "$1");
  result = result.replace(/~/g, " ");

  // Slashes -> space or conversational connector
  result = result.replace(/\\/g, " ");
  result = result.replace(/\s*\/\s*/g, " or ");

  // Bullets and ornamental symbols
  result = result.replace(/[•·▪▫◦■□►▸✔✓❌›»]/g, " ");
  result = result.replace(/(?:^|\n)\s*[-–—+]\s+/g, "\n");

  // Quotes: remove so TTS doesn't say "quote" or "unquote"
  result = result.replace(/["'“”‘’«»]/g, "");

  // Parentheses & Brackets -> natural comma pauses
  result = result.replace(/[\(\[\{]/g, ", ");
  result = result.replace(/[\)\]\}]/g, ", ");

  // Special math & symbol characters
  result = result.replace(/&/g, " and ");
  result = result.replace(/@(\w+)/g, "$1");
  result = result.replace(/@/g, " at ");
  result = result.replace(/(\d+)\s*\+\s*(\d+)/g, "$1 plus $2");
  result = result.replace(/(\d+)\s*=\s*(\d+)/g, "$1 equals $2");
  result = result.replace(/[<>=^|]/g, " ");

  // Dashes between words -> soft breathing pauses
  result = result.replace(/\s+[-–—]+\s+/g, ", ");
  result = result.replace(/[-–—]{2,}/g, ", ");

  // Multiple punctuation cleanup: ellipses (...) -> period
  result = result.replace(/\.{2,}/g, ".");
  result = result.replace(/…/g, ".");
  result = result.replace(/[,;]{2,}/g, ",");
  result = result.replace(/[!?]{2,}/g, "!");

  // Clean comma spacing
  result = result.replace(/,\s*,+/g, ",");
  result = result.replace(/\s+,/g, ",");
  result = result.replace(/,\s*\./g, ".");

  return result;
}

/**
 * Detailed multi-stage normalization runner that returns both the normalized
 * text and a step-by-step diagnostic trace.
 */
export function normalizeNarrationScript(
  text: string,
  options?: NormalizationOptions
): NormalizationResult {
  if (!text || typeof text !== "string") {
    return { spokenText: "", steps: [] };
  }

  const steps: NormalizationStepLog[] = [];
  let current = text;

  // Step 1: Script Characters & Cues
  const s1 = normalizeScriptCharacters(current, options?.stripSpeakerTags ?? true);
  steps.push({
    step: "Script Characters & Stage Directions",
    description: "Strips speaker tags (e.g. NARRATOR:) and softens stage directions",
    changed: s1 !== current,
    text: s1,
  });
  current = s1;

  // Step 2: Scriptural Citations & Verses
  const s2 = normalizeScripturalCitations(current);
  steps.push({
    step: "Scriptural Citations",
    description: "Replaces '-' with 'to' for verse/chapter ranges and expands Bible book names",
    changed: s2 !== current,
    text: s2,
  });
  current = s2;

  // Step 3: Roman Numerals
  const s3 = normalizeRomanNumerals(current);
  steps.push({
    step: "Roman Numerals",
    description: "Expands Roman numerals in monarchs, chapters, parts, and historical eras",
    changed: s3 !== current,
    text: s3,
  });
  current = s3;

  // Step 4: Numbers, Currencies & Symbols
  const s4 = normalizeNumbersAndSymbols(current);
  steps.push({
    step: "Numbers, Units & Symbols",
    description: "Normalizes currencies ($100 -> 100 dollars), units, markdown, and strips symbols",
    changed: s4 !== current,
    text: s4,
  });
  current = s4;

  // Step 5: Phonetic Dictionary Substitutions
  const s5 = applyPhoneticDictionary(current, options?.customEntries);
  steps.push({
    step: "Phonetic Dictionary",
    description: "Applies pronunciation respellings for difficult proper nouns and ancient names",
    changed: s5 !== current,
    text: s5,
  });
  current = s5;

  // Step 6: Cadence & Whitespace Polish
  const s6 = current.replace(/\s+/g, " ").trim();
  steps.push({
    step: "Pacing & Cadence Polish",
    description: "Eliminates duplicate whitespace and formats breathing pauses",
    changed: s6 !== current,
    text: s6,
  });
  current = s6;

  return {
    spokenText: current,
    steps,
  };
}

/**
 * Standard fast text sanitization and normalization entry point
 * Used across server synthesis and client audio playback.
 */
export function sanitizeTextForSpeech(
  rawText: string,
  customEntries?: PhoneticEntry[]
): string {
  if (!rawText || typeof rawText !== "string") return "";
  const result = normalizeNarrationScript(rawText, { customEntries });
  return result.spokenText;
}
