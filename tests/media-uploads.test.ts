import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";
import {
  AUDIO_UPLOAD_ACCEPT,
  IMAGE_OR_VIDEO_UPLOAD_ACCEPT,
  IMAGE_UPLOAD_ACCEPT,
  LOGO_IMAGE_UPLOAD_ACCEPT,
  TOP_MEDIA_FORMATS,
  VIDEO_UPLOAD_ACCEPT,
  assertMediaFile,
  classifyMediaFile,
  isSupportedMediaFile,
} from "../src/lib/media-file";
import { canonicalAudioMimeType, canonicalMimeType } from "../src/lib/media-mime";
import { parsePhoneticDictionaryImport } from "../src/lib/phonetic-dictionary";

/**
 * Every customer file upload, one shared set of rules.
 *
 * The failure this suite guards: a customer picked an ordinary video and
 * was told it was unsupported. The causes were mundane and spread out —
 * an operating system that reported no MIME type for `.mov`/`.m4a`, a
 * WebM whose duration reads as Infinity until seeked, MKV/AVI named as
 * acceptable where browsers cannot play them, and several upload buttons
 * with no validation at all. The classification half is pure and checked
 * here directly; the decode probe needs a browser, so the wiring (every
 * surface routes through the shared module) is checked instead.
 */
const h = createHarness();
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");
const file = (name: string, type = "") => new File(["x"], name, { type });

/* ------------------------ the three common formats ------------------------ */

h.eq(TOP_MEDIA_FORMATS.video, "MP4, MOV or WebM", "video leads with MP4, MOV and WebM");
h.eq(TOP_MEDIA_FORMATS.audio, "MP3, WAV or M4A", "audio leads with MP3, WAV and M4A");
h.eq(TOP_MEDIA_FORMATS.image, "JPG, PNG or WebP", "images lead with JPG, PNG and WebP");

for (const ext of ["mp4", "mov", "webm"]) {
  h.ok(VIDEO_UPLOAD_ACCEPT.includes(`.${ext}`), `the video picker offers .${ext} even when the OS has no MIME type for it`);
  h.ok(IMAGE_OR_VIDEO_UPLOAD_ACCEPT.includes(`.${ext}`), `the intro/outro picker offers .${ext}`);
}
for (const ext of ["mp3", "wav", "m4a"]) {
  h.ok(AUDIO_UPLOAD_ACCEPT.includes(`.${ext}`), `the audio picker offers .${ext}`);
}
for (const ext of ["jpg", "png", "webp"]) {
  h.ok(IMAGE_UPLOAD_ACCEPT.includes(`.${ext}`), `the image picker offers .${ext}`);
  h.ok(LOGO_IMAGE_UPLOAD_ACCEPT.includes(`.${ext}`), `the logo picker offers .${ext}`);
}
h.ok(LOGO_IMAGE_UPLOAD_ACCEPT.includes(".svg"), "a logo may be SVG");

/* ------------- classification: the missing-MIME-type failure -------------- */

const videoCases: Array<[string, string, string]> = [
  ["clip.mp4", "", "video/mp4"],
  ["clip.MOV", "application/octet-stream", "video/quicktime"],
  ["clip.webm", "", "video/webm"],
  ["clip.m4v", "video/x-m4v", "video/mp4"],
  ["phone.3gp", "", "video/3gpp"],
];
for (const [name, type, mime] of videoCases) {
  const picked = file(name, type);
  const got = classifyMediaFile(picked, ["video"]);
  h.eq(got?.mimeType, mime, `${name} (${type || "no MIME type"}) is recognised as ${mime}`);
  h.eq(got?.file.type, mime, `${name} is re-typed canonically so the browser will decode it`);
  h.ok(isSupportedMediaFile(picked, ["video"]), `${name} is a supported video upload`);
}

const audioCases: Array<[string, string, string]> = [
  ["song.mp3", "audio/mp3", "audio/mpeg"],
  ["song.wav", "audio/x-wav", "audio/wav"],
  ["voice.m4a", "", "audio/mp4"],
  ["voice.m4a", "audio/x-m4a", "audio/mp4"],
  ["song.flac", "audio/x-flac", "audio/flac"],
  ["song.opus", "", "audio/ogg"],
];
for (const [name, type, mime] of audioCases) {
  const got = classifyMediaFile(file(name, type), ["audio"]);
  h.eq(got?.mimeType, mime, `${name} (${type || "no MIME type"}) is recognised as ${mime}`);
}

// A recorder file with no extension at all: the declared type decides,
// codec parameters and all.
h.eq(
  classifyMediaFile(file("take-01", "audio/webm;codecs=opus"), ["audio"])?.mimeType,
  "audio/webm",
  "an extension-less WebM recording is recognised from its declared type",
);
h.eq(canonicalMimeType(" Audio/X-M4A ; codecs=mp4a"), "audio/mp4", "MIME aliases and parameters collapse to the canonical type");

h.ok(!isSupportedMediaFile(file("sound.ogg", "audio/ogg"), ["video"]), "an audio-only .ogg is not accepted as a video");
h.ok(!isSupportedMediaFile(file("sound.mp4", "audio/mp4"), ["video", "image"]), "an audio .mp4 is not accepted as background video");

// The same extension means different things on different buttons.
h.eq(classifyMediaFile(file("track.mp4"), ["audio"])?.kind, "audio", "an .mp4 on an audio button is audio");
h.eq(classifyMediaFile(file("track.mp4"), ["video", "image"])?.kind, "video", "an .mp4 on a media button is video");
h.eq(classifyMediaFile(file("photo.webp"), ["video", "image"])?.kind, "image", "a photo on a media button is an image");

for (const name of ["photo.jpg", "photo.jpeg", "photo.png", "photo.webp", "photo.gif", "photo.avif"]) {
  h.ok(isSupportedMediaFile(file(name), ["image"]), `${name} is a supported scene image`);
}
h.ok(!isSupportedMediaFile(file("logo.svg", "image/svg+xml"), ["image"]), "SVG is refused for a scene picture (it can taint a render canvas)");
h.ok(isSupportedMediaFile(file("logo.svg", "image/svg+xml"), ["image"], { allowSvg: true }), "SVG is welcome as a logo");

/* ---------------- refusals that tell the customer what to do -------------- */

const refusal = (name: string, kinds: Array<"video" | "audio" | "image">): string => {
  try {
    assertMediaFile(file(name), kinds);
    return "";
  } catch (err: any) {
    return String(err?.message || "");
  }
};
h.ok(refusal("movie.mkv", ["video"]).includes("Convert it to MP4, MOV or WebM"), "MKV gets a conversion instruction, not a vague refusal");
h.ok(refusal("movie.avi", ["video"]).includes("cannot play AVI directly"), "AVI is named as the problem");
h.ok(refusal("photo.heic", ["image"]).includes("Convert it to JPG, PNG or WebP"), "HEIC gets a conversion instruction");
h.ok(refusal("song.wma", ["audio"]).includes("MP3, WAV or M4A"), "WMA is pointed at the formats that work");
h.ok(refusal("notes.pdf", ["video"]).includes("MP4, MOV or WebM"), "a non-video is refused with the supported formats named");
h.ok(refusal("logo.svg", ["image"]).includes("PNG or JPG"), "scene SVG refusal names the export to make");

/* ------------------- the server's copy of the same rules ------------------ */

h.eq(canonicalAudioMimeType("audio/x-m4a", "voice.m4a"), "audio/mp4", "the server accepts the .m4a MIME alias");
h.eq(canonicalAudioMimeType("audio/webm;codecs=opus"), "audio/webm", "the server accepts a MIME type with codec parameters");
h.eq(canonicalAudioMimeType("", "voice.m4a"), "audio/mp4", "the server falls back to the filename when no type is declared");
h.eq(canonicalAudioMimeType("audio/mpeg", "song.mp3"), "audio/mpeg", "MP3 passes the server check");
h.eq(canonicalAudioMimeType("application/octet-stream", "song.wav"), "audio/wav", "WAV passes the server check from its extension");
h.eq(canonicalAudioMimeType("video/mp4", "clip.mp4"), "", "a video is not an audio upload on the server");
h.ok(read("server.ts").includes("canonicalAudioMimeType"), "/api/upload-audio uses the shared audio types");

/* ------------- every upload surface routes through the module ------------- */

const surfaces: Record<string, string[]> = {
  "src/components/SetupStudio.tsx": [
    "VIDEO_UPLOAD_ACCEPT",
    "AUDIO_UPLOAD_ACCEPT",
    "IMAGE_UPLOAD_ACCEPT",
    "addCustomVideo",
    "addCustomMusic",
    "addCustomImage",
  ],
  "src/components/SceneEditor.tsx": ["IMAGE_UPLOAD_ACCEPT", "VIDEO_UPLOAD_ACCEPT", "addCustomImage"],
  "src/components/SceneClipPanel.tsx": ["VIDEO_UPLOAD_ACCEPT", "sceneUpdatesForVideoFile"],
  "src/components/VoiceMediaLibrary.tsx": ["AUDIO_UPLOAD_ACCEPT", "addCustomMusic"],
  "src/components/VoiceImportModal.tsx": ["AUDIO_UPLOAD_ACCEPT", "assertMediaFile", "probeAudioFile"],
  "src/components/VoiceoverStudio.tsx": ["AUDIO_UPLOAD_ACCEPT", "assertMediaFile", "probeAudioFile"],
  "src/components/CustomerLogoSection.tsx": ["LOGO_IMAGE_UPLOAD_ACCEPT", "readImageFileAsDataUrl"],
  "src/components/InsertPropertiesModal.tsx": ["LOGO_IMAGE_UPLOAD_ACCEPT", "readImageFileAsDataUrl"],
  "src/components/SectionStudio.tsx": [
    "IMAGE_OR_VIDEO_UPLOAD_ACCEPT",
    "LOGO_IMAGE_UPLOAD_ACCEPT",
    "AUDIO_UPLOAD_ACCEPT",
    "addCustomVideo",
    "addCustomImage",
    "addCustomMusic",
    "readImageFileAsDataUrl",
  ],
  "src/components/PhoneticDictionaryTab.tsx": ["PHONETIC_IMPORT_ACCEPT", "parsePhoneticDictionaryImport"],
};
for (const [path, needles] of Object.entries(surfaces)) {
  const source = read(path);
  for (const needle of needles) {
    h.ok(source.includes(needle), `${path.split("/").pop()} uses ${needle}`);
  }
  h.ok(!/accept="/.test(source), `${path.split("/").pop()} has no hand-rolled accept list left`);
}

// The stores decode before they save, via the shared probes (which know
// about infinite-duration WebM), and no longer promise MKV/AVI.
for (const [path, probe] of [
  ["src/lib/custom-video.ts", "probeVideoFile"],
  ["src/lib/custom-image.ts", "probeImageFile"],
  ["src/lib/custom-music.ts", "probeAudioFile"],
] as const) {
  const source = read(path);
  h.ok(source.includes("assertMediaFile") && source.includes(probe), `${path.split("/").pop()} classifies and decodes through media-file.ts`);
}
h.ok(!/mkv\|avi/.test(read("src/lib/custom-video.ts")), "the video store no longer names MKV/AVI as acceptable");
h.ok(read("src/lib/custom-video.ts").includes("no picture in it"), "an audio-only container is refused as a video upload");
h.ok(read("src/lib/media-file.ts").includes("Number.MAX_SAFE_INTEGER"), "the probe seeks to the end so infinite-duration WebM measures its real length");
h.ok(!read("src/components/VoiceImportModal.tsx").includes("duration: 5"), "a voice import is never accepted with an invented 5-second length");
h.ok(read("src/App.tsx").includes("loadCustomMusic()"), "uploaded music and section sounds are re-opened on start-up, not only when the music library mounts");
h.ok(
  read("src/lib/render-section.ts").includes("resolveVideoUrl") && read("src/lib/render-section.ts").includes("resolveImageUrl"),
  "the intro/outro renderer resolves uploaded backgrounds in preview and export alike",
);

/* ------------------- the phonetic dictionary file import ------------------ */

const fromJson = parsePhoneticDictionaryImport(
  JSON.stringify([{ id: "x", word: "Gethsemane", spokenAs: "Geth-sem-ah-nee", category: "custom" }]),
  "dictionary.json",
);
h.eq(fromJson[0]?.spokenAs, "Geth-sem-ah-nee", "the exported JSON imports back unchanged");

const fromMap = parsePhoneticDictionaryImport('{"Yahweh": "YAH-way"}', "map.json");
h.ok(fromMap.length === 1 && fromMap[0].word === "Yahweh", "a JSON word-to-pronunciation map imports");

const fromCsv = parsePhoneticDictionaryImport(
  'word,spoken as,note\r\n"Sennacherib, king","Sen-ak-er-ib","Assyria"',
  "dictionary.csv",
);
h.ok(fromCsv.length === 1 && fromCsv[0].word === "Sennacherib, king", "CSV imports, header skipped and quoted commas kept");

h.eq(parsePhoneticDictionaryImport("Hosanna\thoh-ZAN-nuh", "dictionary.tsv")[0]?.spokenAs, "hoh-ZAN-nuh", "TSV imports");
h.eq(parsePhoneticDictionaryImport("Patmos = Pat-moss", "dictionary.txt")[0]?.spokenAs, "Pat-moss", "plain-text `word = spoken` lines import");
h.eq(
  parsePhoneticDictionaryImport("John 3:16 = John chapter three verse sixteen", "dictionary.txt")[0]?.word,
  "John 3:16",
  "a colon inside the word does not split a plain-text pair early",
);

const deduped = parsePhoneticDictionaryImport("Berea = wrong\nBerea = Beh-ree-ah", "dictionary.txt");
h.ok(deduped.length === 1 && deduped[0].spokenAs === "Beh-ree-ah", "a repeated word keeps its last pronunciation");

let badImport = "";
try {
  parsePhoneticDictionaryImport("just some prose with no pairs", "notes.txt");
} catch (err: any) {
  badImport = String(err?.message || "");
}
h.ok(badImport.includes("No word/pronunciation pairs"), "a file with no pairs is refused with the shapes that work");

h.done("media-uploads");
