/**
 * Pure media-type tables and MIME normalisation, with no browser APIs —
 * split from media-file.ts so the Worker (which typechecks without the
 * DOM) can share exactly the same answers as every upload button.
 */

export type MediaKind = "video" | "audio" | "image";

/** Canonical MIME type per extension, per kind (mp4/webm can be either). */
export const MIME_BY_EXTENSION: Record<MediaKind, Record<string, string>> = {
  video: {
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    ogv: "video/ogg",
    ogg: "video/ogg",
    /* Matroska and MPEG-TS: browsers cannot open these containers, but the
       upload path re-wraps them as MP4 on the way in (media-convert.ts), so
       the customer is not asked to convert a file we can convert ourselves. */
    mkv: "video/x-matroska",
    ts: "video/mp2t",
    m2ts: "video/mp2t",
    mts: "video/mp2t",
    "3gp": "video/3gpp",
    "3g2": "video/3gpp2",
    mpg: "video/mpeg",
    mpeg: "video/mpeg",
  },
  audio: {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    wave: "audio/wav",
    m4a: "audio/mp4",
    mp4: "audio/mp4",
    aac: "audio/aac",
    ogg: "audio/ogg",
    oga: "audio/ogg",
    opus: "audio/ogg",
    flac: "audio/flac",
    webm: "audio/webm",
    weba: "audio/webm",
    aif: "audio/aiff",
    aiff: "audio/aiff",
  },
  image: {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    bmp: "image/bmp",
    svg: "image/svg+xml",
  },
};

/** MIME spellings operating systems and recorders actually produce. */
const MIME_ALIASES: Record<string, string> = {
  "audio/mp3": "audio/mpeg",
  "audio/mpeg3": "audio/mpeg",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/x-aac": "audio/aac",
  "audio/x-flac": "audio/flac",
  "audio/opus": "audio/ogg",
  "video/x-m4v": "video/mp4",
  "video/mkv": "video/x-matroska",
  "video/x-mkv": "video/x-matroska",
  "video/vnd.dlna.mpeg-tts": "video/mp2t",
  "video/m4v": "video/mp4",
  "video/x-quicktime": "video/quicktime",
  "image/jpg": "image/jpeg",
  "image/x-png": "image/png",
  "image/x-ms-bmp": "image/bmp",
};

export function fileExtension(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(String(name || "").trim());
  return match ? match[1].toLowerCase() : "";
}

/** Lower-cased, parameter-free, alias-resolved MIME type ("" if none). */
export function canonicalMimeType(mime: string | undefined | null): string {
  const base = String(mime || "").split(";")[0].trim().toLowerCase();
  return MIME_ALIASES[base] || base;
}

/**
 * The canonical audio MIME type for a server upload, accepting the alias
 * spellings and `;codecs=…` parameters browsers send and falling back to
 * the filename extension when the declared type is missing or generic.
 * Returns "" for anything outside the supported audio set.
 */
export function canonicalAudioMimeType(mimeType: string | undefined | null, filename = ""): string {
  const declared = canonicalMimeType(mimeType);
  if (Object.values(MIME_BY_EXTENSION.audio).includes(declared)) return declared;
  // A concrete non-audio declaration wins over an ambiguous extension:
  // a `video/mp4` is a video, whatever its filename says.
  if (declared.startsWith("video/") || declared.startsWith("image/")) return "";
  return MIME_BY_EXTENSION.audio[fileExtension(filename)] || "";
}

