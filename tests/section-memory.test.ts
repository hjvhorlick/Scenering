import { readFileSync } from "node:fs";
import { createHarness } from "./harness";

/**
 * "The application must remember the last choice made in any section"
 * (owner's rule, 2026-10-16). The store is pinned here; the screens using it
 * are checked at the bottom.
 */
const h = createHarness();
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
  setItem: (key: string, value: string) => void store.set(key, String(value)),
  removeItem: (key: string) => void store.delete(key),
  key: (index: number) => [...store.keys()][index] ?? null,
  get length() { return store.size; },
};

const {
  SECTION_MEMORY_PREFIX,
  forgetSectionMemory,
  isBoolean,
  numberBetween,
  oneOf,
  recallChoice,
  rememberChoice,
  sectionMemoryKey,
} = await import("../src/lib/section-memory");

const tabs = oneOf(["natural_voices", "import_tts", "phonetic_dictionary"] as const);
const speed = numberBetween(0.75, 1.5);

h.eq(sectionMemoryKey(42), `${SECTION_MEMORY_PREFIX}42`, "memory is stored per project");
h.eq(recallChoice(42, "voiceover", "rotateVoices", false, isBoolean), false, "nothing remembered yet gives the default");

rememberChoice(42, "voiceover", "rotateVoices", true);
rememberChoice(42, "voiceover", "tab", "import_tts");
rememberChoice(42, "voiceover", "sampleSpeed", 1.25);
rememberChoice(42, "captions", "previewZoom", 6);
h.eq(recallChoice(42, "voiceover", "rotateVoices", false, isBoolean), true, "a choice comes back as it was left");
h.eq(recallChoice(42, "voiceover", "tab", "natural_voices", tabs), "import_tts", "the open tab comes back");
h.eq(recallChoice(42, "voiceover", "sampleSpeed", 1, speed), 1.25, "a slider comes back where it was left");
h.eq(recallChoice(42, "captions", "previewZoom", 3, oneOf<number>([2, 3, 4, 6])), 6, "each section keeps its own choices");
h.eq(recallChoice(43, "voiceover", "rotateVoices", false, isBoolean), false, "another project keeps its own choices");
h.eq(recallChoice(42, "studio", "rotateVoices", false, isBoolean), false, "a field is remembered only in its own section");

rememberChoice(null, "voiceover", "rotateVoices", true);
rememberChoice(undefined, "voiceover", "rotateVoices", true);
h.eq(recallChoice(null, "voiceover", "rotateVoices", false, isBoolean), false, "without a project nothing is remembered");
h.ok(![...store.keys()].some((key) => /null|undefined/.test(key)), "nothing is stored under a missing project");

// Stale or damaged memory must never break a screen.
rememberChoice(42, "voiceover", "tab", "a_tab_that_was_removed");
h.eq(recallChoice(42, "voiceover", "tab", "natural_voices", tabs), "natural_voices", "a choice that no longer exists falls back to the default");
rememberChoice(42, "voiceover", "sampleSpeed", 9);
h.eq(recallChoice(42, "voiceover", "sampleSpeed", 1, speed), 1, "an out-of-range value falls back");
rememberChoice(42, "voiceover", "rotateVoices", "yes");
h.eq(recallChoice(42, "voiceover", "rotateVoices", false, isBoolean), false, "a value of the wrong kind falls back");
h.ok(!speed(Number.NaN) && !speed(Number.POSITIVE_INFINITY) && !speed("1.2"), "not-a-number values are rejected");
store.set(sectionMemoryKey(44), "{not json");
h.eq(recallChoice(44, "voiceover", "rotateVoices", false, isBoolean), false, "corrupt storage gives the default instead of throwing");
store.set(sectionMemoryKey(45), "[1,2,3]");
h.eq(recallChoice(45, "voiceover", "rotateVoices", false, isBoolean), false, "a stored array is not memory");
rememberChoice(44, "voiceover", "rotateVoices", true);
h.eq(recallChoice(44, "voiceover", "rotateVoices", false, isBoolean), true, "corrupt storage is replaced by the next choice");

forgetSectionMemory(42);
h.eq(store.has(sectionMemoryKey(42)), false, "a deleted project's memory is removed");
h.eq(recallChoice(43, "voiceover", "rotateVoices", false, isBoolean), false, "…and only that project's");

/* ---- the screens remember their choices ----------------------------------- */

const uses = (file: string, ...fields: string[]) => {
  const source = read(file);
  for (const field of fields) {
    h.ok(new RegExp(`useRememberedChoice(<[^(]*>)?\\(\\s*(projectId|project\\?\\.id),\\s*"[a-z]+",\\s*"${field}"`).test(source), `${file}: remembers ${field}`);
  }
};
uses("src/components/VoiceoverStudio.tsx", "rotateVoices", "secondVoice", "sampleSpeed", "tab", "genderFilter");
uses("src/components/VideoStudio.tsx", "library", "defaultVolume", "itemVolumes");
uses("src/components/CaptionsStudio.tsx", "previewZoom", "styleShelf");
uses("src/components/SetupStudio.tsx", "outputAdvancedOpen");
uses("src/components/RenderView.tsx", "advancedOpen");

const voiceover = read("src/components/VoiceoverStudio.tsx");
h.ok(voiceover.includes("STUDIO_VOICE_PRESETS.some((preset) => preset.id === value)"), "Voice B is restored only if it is still a listed style");
h.ok(read("src/components/VideoStudio.tsx").includes("VIDEO_STUDIO_CATEGORIES.find((cat) => cat.id === category)"), "a Studio shelf is restored only if it still exists");

const app = read("src/App.tsx");
h.eq((app.match(/projectId=\{currentProject\?\.id \?\? null\}/g) || []).length, 3, "Voiceover, Captions and Studio know which project they remember for");
h.ok(app.includes("forgetSectionMemory(projectId);"), "deleting a project forgets its choices");
h.ok(app.includes("key.startsWith(SECTION_MEMORY_PREFIX)"), "deleting the last project clears every project's memory");

h.done("section memory");
