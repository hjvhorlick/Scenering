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
import {
  MAX_CONVERT_VIDEO_BYTES,
  describeCodec,
  unplayableVideoMessage,
} from "../src/lib/media-convert";
import { isStorageCapacityError } from "../src/lib/custom-video";
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
for (const ext of ["mkv", "mts", "m2ts", "ts"]) {
  h.ok(VIDEO_UPLOAD_ACCEPT.includes(`.${ext}`), `the video picker offers .${ext} (a container the upload re-wraps)`);
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
  ["download.mkv", "", "video/x-matroska"],
  ["download.mkv", "video/x-matroska", "video/x-matroska"],
  ["camera.mts", "video/mp2t", "video/mp2t"],
  ["camera.m2ts", "", "video/mp2t"],
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
/*
 * MKV and MPEG-TS used to be refused outright, and that was the bug: the
 * picture inside is ordinary H.264 often enough that asking the customer to
 * go and convert it was asking them to fix something the app can fix itself.
 * They are accepted now and re-wrapped as MP4 on the way into storage.
 */
h.ok(isSupportedMediaFile(file("movie.mkv", "video/x-matroska"), ["video"]), "MKV is accepted instead of refused");
h.ok(isSupportedMediaFile(file("camera.mts", "video/mp2t"), ["video"]), "a camera .mts is accepted instead of refused");
h.eq(classifyMediaFile(file("movie.mkv"), ["video"])?.mimeType, "video/x-matroska", "MKV is classified as Matroska");
h.eq(classifyMediaFile(file("clip.ts"), ["video"])?.mimeType, "video/mp2t", "MPEG-TS is classified from its extension");
h.ok(read("src/lib/media-mime.ts").includes('mkv: "video/x-matroska"'), "the Matroska MIME type is in the shared table");
h.ok(!/\bmkv:\s*"video"/.test(read("src/lib/media-file.ts")), "MKV is no longer on the browser-unfriendly refusal list");
h.ok(!/\bmts:\s*"video"/.test(read("src/lib/media-file.ts")), "MPEG-TS is no longer on the refusal list either");
h.ok(refusal("movie.avi", ["video"]).includes("cannot play AVI directly"), "AVI is still named as the problem (no demuxer for it)");
h.ok(refusal("movie.wmv", ["video"]).includes("cannot play WMV directly"), "WMV still gets a conversion instruction");
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

/* ----------------- the probe that decides playability -------------------- */

const mediaSource = read("src/lib/media-file.ts");

// A detached <video> is not loaded by Safari or by several mobile media
// pipelines — the exact quirk scene-clip.ts already works around. The probe
// used to create one, wait for metadata that never came, and refuse a good
// iPhone MP4 twenty seconds later.
h.ok(mediaSource.includes("document.body.appendChild"), "the decode probe mounts its element so Safari will load it");
h.ok(mediaSource.includes("detach()") || mediaSource.includes("element.remove()"), "the probe takes its element out of the document afterwards");
h.ok(mediaSource.includes('"loadeddata"'), "the probe waits for decoded data, because videoWidth is still 0 at loadedmetadata in some browsers");
h.ok(mediaSource.includes("MediaProbeError"), "a failed probe says WHY (unsupported, slow, empty) so the caller can convert instead of refuse");
h.ok(mediaSource.includes("inspectMediaBlob"), "a probe that merely ran out of time falls back to the container's own metadata");

/* --------------------- converting what cannot be played ------------------- */

const convertSource = read("src/lib/media-convert.ts");
h.ok(convertSource.includes('import("mediabunny")'), "the demuxer/converter is loaded on demand, so the main bundle does not pay for it");
h.ok(convertSource.includes("new mb.Mp4OutputFormat()"), "a playable file is written as MP4 first");
h.ok(convertSource.includes("new mb.WebMOutputFormat()"), "WebM is the fallback when this browser has no H.264 encoder");
h.ok(convertSource.includes("copy: {}"), "matching codecs are copied rather than re-encoded, so an MKV of H.264 is quick");
h.ok(convertSource.includes("canEncodeVideo") && convertSource.includes("canDecode"), "a conversion only runs when this browser can decode the source");
h.ok(
  MAX_CONVERT_VIDEO_BYTES > 100 * 1024 * 1024 && MAX_CONVERT_VIDEO_BYTES <= 500 * 1024 * 1024,
  "conversion is allowed up to a sensible size and never past the upload ceiling",
);

h.eq(describeCodec("hevc"), "HEVC (H.265)", "the refusal names HEVC the way customers see it");
h.eq(describeCodec("avc"), "H.264", "H.264 is named correctly");
h.eq(describeCodec("prores"), "Apple ProRes", "ProRes is named correctly");
h.eq(describeCodec("vp9"), "VP9", "VP9 is named correctly");
const hevcRefusal = unplayableVideoMessage({
  container: "MP4",
  mimeType: "video/mp4",
  duration: 12,
  width: 1920,
  height: 1080,
  videoCodec: "hevc",
  audioCodec: "aac",
  videoDecodable: false,
});
h.ok(hevcRefusal.includes("HEVC (H.265)"), "an unplayable MP4 is explained as HEVC, not as 'MP4 is unsupported'");
h.ok(hevcRefusal.includes("MP4 (H.264 + AAC)"), "and it names the export that does work");
h.ok(unplayableVideoMessage(null).includes("MP4 (H.264)"), "with no inspection the refusal still names the formats that work");
h.ok(
  unplayableVideoMessage({
    container: "MP4",
    mimeType: "video/mp4",
    duration: 3,
    width: 0,
    height: 0,
    videoCodec: null,
    audioCodec: "aac",
    videoDecodable: false,
  }).includes("no picture in it"),
  "an audio-only container is explained as audio, not as a broken format",
);

const videoStoreSource = read("src/lib/custom-video.ts");
h.ok(
  /probeVideoFile\(uploadFile\)[\s\S]{0,900}convertVideoForBrowser/.test(videoStoreSource) &&
    /convertVideoForBrowser[\s\S]{0,1200}probeVideoFile\(uploadFile\)/.test(videoStoreSource),
  "a video this browser cannot open is re-wrapped, then measured again before the upload is refused",
);
h.ok(videoStoreSource.includes("unplayableVideoMessage"), "when conversion is impossible the refusal names the codec");
h.ok(
  videoStoreSource.includes("record") && videoStoreSource.includes("uploadMime") && videoStoreSource.includes("size: uploadFile.size"),
  "the converted file, not the original, is what gets stored and described",
);
h.ok(
  read("src/components/SceneEditor.tsx").includes("Converting ${videoConversion}%") &&
    read("src/components/SceneClipPanel.tsx").includes("Converting ${conversionProgress}%"),
  "the scene upload buttons show conversion progress instead of appearing frozen",
);

/* ------------- the storage failure customers actually meet --------------- */

/*
 * Chrome refuses a large IndexedDB blob write with
 * `DOMException: Failed to write blobs (IOError)` — no "quota", no "space".
 * The upload used to treat that as an exotic write failure: it never cleared
 * unreferenced uploads, never retried, and refused the clip while claiming it
 * had been loaded for this tab.
 */
h.ok(
  isStorageCapacityError(new DOMException("Failed to write blobs (IOError)", "IOError")),
  "Chromium's blob-write IOError is recognised as a storage-capacity failure",
);
h.ok(
  isStorageCapacityError(new DOMException("The quota has been exceeded.", "QuotaExceededError")),
  "a QuotaExceededError is recognised",
);
h.ok(
  isStorageCapacityError(new DOMException("No space left on device", "UnknownError")),
  "a disk-full message is recognised whatever its DOMException name",
);
h.ok(
  !isStorageCapacityError(new DOMException("The database is closing.", "InvalidStateError")),
  "an unrelated database error is not mistaken for a full disk",
);
h.ok(!isStorageCapacityError(null), "no error is not a capacity failure");

const storeSource = read("src/lib/custom-video.ts");
h.ok(/failed to write blob/i.test(storeSource), "the capacity check names Chromium's 'Failed to write blobs' message");
h.ok(
  /const room = await storageRoom\(\)[\s\S]{0,200}pruneOrphanedVideos/.test(storeSource),
  "unreferenced uploads are cleared before the write when the allowance is already tight",
);
h.ok(
  /isStorageCapacityError\(result\.error\)[\s\S]{0,240}storeVideoRecord/.test(storeSource),
  "a capacity failure reclaims orphans and retries the write once",
);
h.ok(
  /arrayBuffer\(\)[\s\S]{0,200}blob: undefined, bytes/.test(storeSource) ||
    /blob: undefined, bytes[\s\S]{0,200}arrayBuffer/.test(storeSource),
  "a refused blob write is retried once with the bytes held inline, skipping Chromium's blob journal",
);
h.ok(
  storeSource.includes("MAX_INLINE_RETRY_BYTES") && storeSource.includes("recordBlob"),
  "the inline copy is size-limited and readable after a reload whichever shape was stored",
);
h.ok(
  read("src/lib/scene-clip-attach.ts").includes("allowSessionFallback: true"),
  "a scene keeps the clip for this tab when the browser cannot store it",
);
h.ok(
  read("src/components/SceneEditor.tsx").includes("onWarning: setStorageWarning") &&
    read("src/components/SceneClipPanel.tsx").includes("onWarning: setStorageWarning"),
  "the scene upload surfaces say when the clip is only available in this tab",
);
h.ok(
  read("src/components/SceneEditor.tsx").includes("storageWarning") &&
    read("src/components/SectionStudio.tsx").includes("storageWarning"),
  "the warning is shown on the surface that uploaded the file, not silently swallowed",
);

/* ------------- every upload surface routes through the module ------------- */

const surfaces: Record<string, string[]> = {
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
const videoStore = read("src/lib/custom-video.ts");
h.ok(!/mkv\|avi/.test(videoStore), "the video store no longer names MKV/AVI as acceptable");
h.ok(videoStore.includes("no picture in it"), "an audio-only container is refused as a video upload");
h.ok(
  videoStore.includes("replaceIds?: readonly string[]") &&
    videoStore.includes("for (const id of replaceIds)") &&
    videoStore.includes("store.delete(id)") &&
    videoStore.includes("store.put(record)"),
  "a replacement deletes the old Blob and writes the new one in the same rollback-safe transaction",
);
h.ok(
  videoStore.includes("pruneOrphanedVideos") &&
    videoStore.includes("referencedVideoIds") &&
    videoStore.includes("videoReferenceCounts") &&
    videoStore.includes("if (!referenced) return 0") &&
    videoStore.includes("createdThisSession") &&
    videoStore.includes("navigator.storage?.estimate?.()"),
  "a quota failure reclaims only unreferenced uploads, preserves shared footage and reports the real allowance",
);
const setupStore = read("src/components/SetupStudio.tsx");
h.ok(
  !setupStore.includes("VIDEO_UPLOAD_ACCEPT") &&
    read("src/lib/scene-clip-attach.ts").includes("replaceIds: replaceId ? [replaceId] : []") &&
    read("src/components/SectionStudio.tsx").includes("replaceIds: previousId ? [previousId] : []"),
  "Setup stays script-only, while scene clips and section backgrounds replace superseded videos",
);
h.ok(
  videoStore.includes("keepVideoForCurrentTab") &&
    videoStore.includes("persistent: false") &&
    videoStore.includes('window.addEventListener("beforeunload"') &&
    !setupStore.includes("Video loaded for this tab only."),
  "a full store fallback remains available to video tools, not in the script-only Setup screen",
);
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
