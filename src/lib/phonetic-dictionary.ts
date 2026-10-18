/**
 * Phonetic Dictionary & Pronunciation Rules for Video Narration
 *
 * Provides accurate phonetic replacements for:
 * 1. Script characters, production cues and stage directions
 * 2. Scriptural, biblical and ancient names commonly mispronounced by TTS
 * 3. Theological terms, Hebrew/Greek names, and classical figures
 * 4. User-configurable custom phonetic dictionary (persisted in localStorage)
 */

export interface PhoneticEntry {
  id: string;
  word: string; // The original word or phrase to match (case-insensitive)
  spokenAs: string; // The phonetic text to speak instead
  category: "scriptural" | "theological" | "classical" | "script_cues" | "general" | "custom";
  description?: string;
}

/**
 * Built-in Phonetic Dictionary
 * Carefully curated phonetic respellings for difficult proper nouns and script terms
 */
export const BUILT_IN_PHONETIC_ENTRIES: PhoneticEntry[] = [
  // --- Scriptural & Biblical Names ---
  { id: "p-nebuchadnezzar", word: "Nebuchadnezzar", spokenAs: "Nebukad-nezzer", category: "scriptural", description: "King of Babylon" },
  { id: "p-melchizedek", word: "Melchizedek", spokenAs: "Mel-kiz-eh-dek", category: "scriptural", description: "King of Salem and Priest" },
  { id: "p-gethsemane", word: "Gethsemane", spokenAs: "Geth-sem-ah-nee", category: "scriptural", description: "Garden in Jerusalem" },
  { id: "p-golgotha", word: "Golgotha", spokenAs: "Gol-goth-ah", category: "scriptural", description: "Place of the skull" },
  { id: "p-ecclesiastes", word: "Ecclesiastes", spokenAs: "Ek-lee-zee-as-teez", category: "scriptural", description: "Old Testament book" },
  { id: "p-deuteronomy", word: "Deuteronomy", spokenAs: "Due-ter-on-oh-mee", category: "scriptural", description: "Fifth book of the Torah" },
  { id: "p-zephaniah", word: "Zephaniah", spokenAs: "Zef-uh-nye-ah", category: "scriptural", description: "Prophet and book" },
  { id: "p-habakkuk", word: "Habakkuk", spokenAs: "Huh-bak-uk", category: "scriptural", description: "Prophet and book" },
  { id: "p-mephibosheth", word: "Mephibosheth", spokenAs: "Meh-fib-oh-sheth", category: "scriptural", description: "Son of Jonathan" },
  { id: "p-caiaphas", word: "Caiaphas", spokenAs: "Kye-ah-fuss", category: "scriptural", description: "High priest of Jerusalem" },
  { id: "p-zacchaeus", word: "Zacchaeus", spokenAs: "Zak-kee-us", category: "scriptural", description: "Tax collector of Jericho" },
  { id: "p-bartimaeus", word: "Bartimaeus", spokenAs: "Bar-tih-may-us", category: "scriptural", description: "Blind beggar healed by Jesus" },
  { id: "p-philemon", word: "Philemon", spokenAs: "Fih-lee-mun", category: "scriptural", description: "Pauline Epistle" },
  { id: "p-onesimus", word: "Onesimus", spokenAs: "Oh-nes-ih-mus", category: "scriptural", description: "Subject of Philemon" },
  { id: "p-epaphras", word: "Epaphras", spokenAs: "Ep-uh-frass", category: "scriptural", description: "Colossian evangelist" },
  { id: "p-nicodemus", word: "Nicodemus", spokenAs: "Nik-uh-dee-mus", category: "scriptural", description: "Pharisee and ruler" },
  { id: "p-sennacherib", word: "Sennacherib", spokenAs: "Sen-ak-er-ib", category: "scriptural", description: "King of Assyria" },
  { id: "p-zerubbabel", word: "Zerubbabel", spokenAs: "Ze-roob-ah-bel", category: "scriptural", description: "Governor of Judea" },
  { id: "p-capernaum", word: "Capernaum", spokenAs: "Kah-per-nay-um", category: "scriptural", description: "Galilean town" },
  { id: "p-bethsaida", word: "Bethsaida", spokenAs: "Beth-say-ih-dah", category: "scriptural", description: "City near Sea of Galilee" },
  { id: "p-berea", word: "Berea", spokenAs: "Beh-ree-ah", category: "scriptural", description: "Macedonian city" },
  { id: "p-cyrene", word: "Cyrene", spokenAs: "Sigh-ree-nee", category: "scriptural", description: "Ancient Greek city" },
  { id: "p-patmos", word: "Patmos", spokenAs: "Pat-moss", category: "scriptural", description: "Island of Revelation" },
  { id: "p-hezekiah", word: "Hezekiah", spokenAs: "Hez-eh-kye-ah", category: "scriptural", description: "King of Judah" },
  { id: "p-jehoshaphat", word: "Jehoshaphat", spokenAs: "Jeh-hosh-ah-fat", category: "scriptural", description: "King of Judah" },

  // --- Divine Titles & Theological Terms ---
  { id: "p-yahweh", word: "Yahweh", spokenAs: "YAH-way", category: "theological", description: "The Divine Name" },
  { id: "p-elohim", word: "Elohim", spokenAs: "el-oh-HEEM", category: "theological", description: "Hebrew title for God" },
  { id: "p-adonai", word: "Adonai", spokenAs: "ah-doh-NYE", category: "theological", description: "Lord in Hebrew" },
  { id: "p-hallelujah", word: "Hallelujah", spokenAs: "hah-lay-LOO-yah", category: "theological", description: "Praise the Lord" },
  { id: "p-alleluia", word: "Alleluia", spokenAs: "al-lay-LOO-yah", category: "theological", description: "Latin liturgical form" },
  { id: "p-hosanna", word: "Hosanna", spokenAs: "hoh-ZAN-nuh", category: "theological", description: "Save, we pray" },
  { id: "p-maranatha", word: "Maranatha", spokenAs: "mah-rah-NAH-thah", category: "theological", description: "Our Lord comes" },
  { id: "p-shekinah", word: "Shekinah", spokenAs: "shuh-KYE-nuh", category: "theological", description: "The divine presence" },
  { id: "p-kyrie-eleison", word: "Kyrie eleison", spokenAs: "KEER-ee-ay ay-LAY-ee-son", category: "theological", description: "Lord have mercy" },

  // --- Classical, Historical & Philosophical Names ---
  { id: "p-socrates", word: "Socrates", spokenAs: "SOCK-ruh-teez", category: "classical", description: "Greek philosopher" },
  { id: "p-archimedes", word: "Archimedes", spokenAs: "ar-kih-MEE-deez", category: "classical", description: "Greek mathematician" },
  { id: "p-aristotle", word: "Aristotle", spokenAs: "AIR-ih-stot-ul", category: "classical", description: "Greek philosopher" },
  { id: "p-herodotus", word: "Herodotus", spokenAs: "heh-ROD-uh-tus", category: "classical", description: "Father of History" },
  { id: "p-thucydides", word: "Thucydides", spokenAs: "thoo-SID-ih-deez", category: "classical", description: "Greek historian" },
  { id: "p-pythagoras", word: "Pythagoras", spokenAs: "pih-THAG-uh-rus", category: "classical", description: "Greek philosopher" },
  { id: "p-caesar", word: "Caesar", spokenAs: "SEE-zer", category: "classical", description: "Roman title and ruler" },
  { id: "p-confucius", word: "Confucius", spokenAs: "kun-FYOO-shus", category: "classical", description: "Chinese philosopher" },
  { id: "p-genghis-khan", word: "Genghis Khan", spokenAs: "GENG-gis kahn", category: "classical", description: "Mongol founder" },
  { id: "p-ptolemy", word: "Ptolemy", spokenAs: "TOL-uh-mee", category: "classical", description: "Greco-Egyptian astronomer" },

  // --- Script Cues & Production Terminology ---
  { id: "p-vo", word: "V.O.", spokenAs: "voiceover", category: "script_cues", description: "Voiceover marker" },
  { id: "p-os", word: "O.S.", spokenAs: "off screen", category: "script_cues", description: "Off screen marker" },
  { id: "p-pov", word: "P.O.V.", spokenAs: "point of view", category: "script_cues", description: "Point of view camera" },
  { id: "p-sfx", word: "SFX", spokenAs: "sound effects", category: "script_cues", description: "Sound effects cue" },
  { id: "p-bgm", word: "BGM", spokenAs: "background music", category: "script_cues", description: "Background music cue" },
  { id: "p-cta", word: "CTA", spokenAs: "call to action", category: "script_cues", description: "Call to action prompt" },
];

const STORAGE_KEY = "scenering_phonetic_dictionary";

/** File types the dictionary importer offers: JSON, CSV, TSV and plain text. */
export const PHONETIC_IMPORT_ACCEPT =
  ".json,.csv,.tsv,.txt,application/json,text/csv,text/tab-separated-values,text/plain";

const PHONETIC_CATEGORIES: readonly PhoneticEntry["category"][] = [
  "scriptural",
  "theological",
  "classical",
  "script_cues",
  "general",
  "custom",
];

function importEntry(raw: unknown, fallbackWord: unknown, index: number): PhoneticEntry | null {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const word = String(record.word ?? record.original ?? record.term ?? record.text ?? fallbackWord ?? "").trim();
  const spokenAs = String(
    typeof raw === "string"
      ? raw
      : record.spokenAs ?? record.spoken_as ?? record.pronunciation ?? record.phonetic ?? record.say ?? record.replacement ?? "",
  ).trim();
  if (!word || !spokenAs) return null;
  const category = PHONETIC_CATEGORIES.includes(record.category as PhoneticEntry["category"])
    ? (record.category as PhoneticEntry["category"])
    : "custom";
  const id = typeof record.id === "string" && record.id.trim()
    ? record.id.trim()
    : `custom-${word.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "word"}-${index}`;
  return {
    id,
    word,
    spokenAs,
    category,
    description: typeof record.description === "string" ? record.description : undefined,
  };
}

/** Splits one CSV/TSV line, honouring double-quoted fields. */
function splitDelimitedLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      fields.push(field.trim());
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field.trim());
  return fields;
}

/**
 * Turns an imported dictionary file into validated entries. Three everyday
 * shapes are understood: the exported JSON array (or a JSON word →
 * pronunciation map), CSV/TSV with word and pronunciation columns, and
 * plain text lines of `word = spoken as`. Anything else raises an error
 * naming the shapes that work, instead of saving entries the normaliser
 * would choke on — which the old array-or-nothing import could do.
 */
export function parsePhoneticDictionaryImport(text: string, filename = ""): PhoneticEntry[] {
  const source = String(text || "").replace(/^\uFEFF/, "").trim();
  const entries: PhoneticEntry[] = [];

  if (source.startsWith("[") || source.startsWith("{") || /\.json$/i.test(filename)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch {
      throw new Error("That file is not valid JSON. Import a JSON, CSV, TSV or plain-text dictionary.");
    }
    if (Array.isArray(parsed)) {
      parsed.forEach((item, index) => {
        const entry = importEntry(item, undefined, index);
        if (entry) entries.push(entry);
      });
    } else if (parsed && typeof parsed === "object") {
      Object.entries(parsed as Record<string, unknown>).forEach(([word, value], index) => {
        const entry = importEntry(value, word, index);
        if (entry) entries.push(entry);
      });
    }
  } else {
    source.split(/\r?\n/).forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) return;
      const delimiter = line.includes("\t") ? "\t" : line.includes(",") ? "," : line.includes(";") ? ";" : line.includes("|") ? "|" : "";
      let columns: string[];
      if (delimiter) {
        columns = splitDelimitedLine(line, delimiter);
      } else {
        // Equals/arrow first, so a citation containing a colon
        // ("John 3:16 = John chapter three…") is not split at the colon.
        const pair = /^(.+?)\s*(?:=>|->|=)\s*(.+)$/.exec(line) || /^(.+?)\s*:\s*(.+)$/.exec(line);
        columns = pair ? [pair[1], pair[2]] : [];
      }
      if (columns.length < 2) return;
      const [word, spokenAs, description] = columns;
      // A spreadsheet header row, not an entry.
      if (/^(word|original|term)$/i.test(word) && /(spoken|pronun|phonetic)/i.test(spokenAs)) return;
      const entry = importEntry({ word, spokenAs, description }, undefined, index);
      if (entry) entries.push(entry);
    });
  }

  // Last word wins, as in the editor itself.
  const byWord = new Map<string, PhoneticEntry>();
  for (const entry of entries) byWord.set(entry.word.toLowerCase(), entry);
  const result = [...byWord.values()];
  if (result.length === 0) {
    throw new Error(
      "No word/pronunciation pairs were found. Use the exported JSON, a CSV/TSV with word and pronunciation columns, or text lines like \"Gethsemane = Geth-sem-ah-nee\".",
    );
  }
  return result;
}

/**
 * Loads custom phonetic entries saved by the user in localStorage
 */
export function getCustomPhoneticDictionary(): PhoneticEntry[] {
  if (typeof globalThis === "undefined" || !(globalThis as any).window || !(globalThis as any).localStorage) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("Failed to load custom phonetic dictionary:", e);
    return [];
  }
}

/**
 * Persists custom phonetic entries to localStorage
 */
export function saveCustomPhoneticDictionary(entries: PhoneticEntry[]): void {
  if (typeof globalThis === "undefined" || !(globalThis as any).window || !(globalThis as any).localStorage) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    // Dispatch custom event so all components react immediately
    (globalThis as any).window.dispatchEvent(new CustomEvent("scenering-phonetic-dictionary-updated"));
  } catch (e) {
    console.error("Failed to save custom phonetic dictionary:", e);
  }
}

/**
 * Returns all active phonetic entries (custom entries take precedence over built-ins)
 */
export function getAllActivePhoneticEntries(runtimeCustomEntries?: PhoneticEntry[]): PhoneticEntry[] {
  const custom = runtimeCustomEntries ?? getCustomPhoneticDictionary();
  const customWordMap = new Set(custom.map((c) => c.word.toLowerCase().trim()));

  // Keep built-ins that have not been overridden by a custom entry
  const filteredBuiltIns = BUILT_IN_PHONETIC_ENTRIES.filter(
    (b) => !customWordMap.has(b.word.toLowerCase().trim())
  );

  return [...custom, ...filteredBuiltIns];
}

/**
 * Adds or updates a word in the custom phonetic dictionary
 */
export function setCustomPhoneticWord(word: string, spokenAs: string, description?: string): PhoneticEntry {
  const cleanWord = word.trim();
  const cleanSpoken = spokenAs.trim();
  if (!cleanWord || !cleanSpoken) {
    throw new Error("Both original word and phonetic spoken text are required.");
  }

  const existing = getCustomPhoneticDictionary();
  const id = `custom-${cleanWord.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
  const newEntry: PhoneticEntry = {
    id,
    word: cleanWord,
    spokenAs: cleanSpoken,
    category: "custom",
    description: description?.trim() || undefined,
  };

  const filtered = existing.filter((e) => e.word.toLowerCase() !== cleanWord.toLowerCase());
  const updated = [newEntry, ...filtered];
  saveCustomPhoneticDictionary(updated);
  return newEntry;
}

/**
 * Removes a custom phonetic entry by ID
 */
export function removeCustomPhoneticWord(id: string): void {
  const existing = getCustomPhoneticDictionary();
  const updated = existing.filter((e) => e.id !== id);
  saveCustomPhoneticDictionary(updated);
}

/**
 * Clears all custom entries
 */
export function resetCustomPhoneticDictionary(): void {
  if (typeof globalThis === "undefined" || !(globalThis as any).window || !(globalThis as any).localStorage) return;
  localStorage.removeItem(STORAGE_KEY);
  (globalThis as any).window.dispatchEvent(new CustomEvent("scenering-phonetic-dictionary-updated"));
}

/**
 * Applies phonetic substitutions to text using whole-word boundary matching
 */
export function applyPhoneticDictionary(
  text: string,
  runtimeCustomEntries?: PhoneticEntry[]
): string {
  if (!text || typeof text !== "string") return "";

  const entries = getAllActivePhoneticEntries(runtimeCustomEntries);
  let result = text;

  // Sort entries by length descending so multi-word phrases match before single words
  const sorted = [...entries].sort((a, b) => b.word.length - a.word.length);

  for (const entry of sorted) {
    if (!entry.word || !entry.spokenAs) continue;
    // Escape regex special chars in word
    const escaped = entry.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Match with word boundaries, accounting for possible trailing apostrophes/punctuation
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    if (regex.test(result)) {
      result = result.replace(regex, entry.spokenAs);
    }
  }

  return result;
}
