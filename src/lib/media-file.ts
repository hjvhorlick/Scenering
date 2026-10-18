/**
 * One definition of "a file the customer may upload", shared by every
 * upload button in the website and the studio.
 *
 * Before this module each upload surface invented its own checks — or
 * had none. The failures that produced were quiet and confusing:
 *
 *  - A perfectly playable `.mov` or `.m4a` whose operating system
 *    reported no MIME type (or `application/octet-stream`) could be
 *    refused by a `file.type.startsWith(...)` test, and an object URL
 *    minted from a mistyped blob made some browsers reject media they
 *    could actually decode.
 *  - WebM files (browser recordings especially) report an infinite
 *    duration until they are seeked. A probe that simply read
 *    `duration` on `loadedmetadata` therefore measured 0 seconds and
 *    called a good file empty.
 *  - MKV/AVI were named as acceptable in one store even though web
 *    browsers generally cannot play them, so they failed later with a
 *    vague message — or, on the surfaces with no validation at all,
 *    appeared to upload and then silently never played.
 *
 * The contract now: every media kind supports at least its three most
 * common formats — MP4/MOV/WebM video, MP3/WAV/M4A audio, JPG/PNG/WebP
 * images — plus the near neighbours listed below. Classification trusts
 * the file extension when the declared MIME type is missing or generic
 * and re-types the blob canonically; a real decode probe then decides
 * playability in *this* browser, because a container name alone cannot
 * promise that (an HEVC MP4 still will not play in a browser with no
 * HEVC decoder, and the refusal says so and names the conversion that
 * works).
 */

import {
  MIME_BY_EXTENSION,
  canonicalMimeType,
  fileExtension,
  type MediaKind,
} from "./media-mime";

export { canonicalAudioMimeType, canonicalMimeType, fileExtension } from "./media-mime";
export type { MediaKind } from "./media-mime";

export class MediaFileError extends Error {}

/** The three everyday formats per kind, named in help text and refusals. */
export const TOP_MEDIA_FORMATS: Record<MediaKind, string> = {
  video: "MP4, MOV or WebM",
  audio: "MP3, WAV or M4A",
  image: "JPG, PNG or WebP",
};

/**
 * `accept` attributes for file inputs. The wildcard keeps phone
 * galleries and desktop pickers offering the right library; the
 * extensions rescue files whose MIME type the OS does not know
 * (notably `.mov` and `.m4a` on Windows and some Android pickers).
 */
export const VIDEO_UPLOAD_ACCEPT = "video/*,.mp4,.mov,.webm,.m4v,.ogv,.3gp,.3g2,.mpg,.mpeg";
export const AUDIO_UPLOAD_ACCEPT = "audio/*,.mp3,.wav,.wave,.m4a,.aac,.ogg,.oga,.opus,.flac,.webm,.weba,.mp4,.aif,.aiff";
export const IMAGE_UPLOAD_ACCEPT = "image/*,.jpg,.jpeg,.png,.webp,.gif,.avif,.bmp";
/** Logos may be SVG — they are drawn as overlay images, where SVG is wanted. */
export const LOGO_IMAGE_UPLOAD_ACCEPT = "image/*,.png,.jpg,.jpeg,.webp,.svg,.gif,.avif";
export const IMAGE_OR_VIDEO_UPLOAD_ACCEPT =
  "video/*,image/*,.mp4,.mov,.webm,.m4v,.ogv,.3gp,.jpg,.jpeg,.png,.webp,.gif,.avif,.bmp";

/**
 * Formats customers reasonably try that a web browser cannot decode
 * directly. They get a specific "convert it" sentence instead of a
 * generic refusal (or worse, a silent black frame).
 */
const BROWSER_UNFRIENDLY: Record<string, MediaKind> = {
  mkv: "video",
  avi: "video",
  wmv: "video",
  flv: "video",
  rm: "video",
  rmvb: "video",
  ts: "video",
  m2ts: "video",
  mts: "video",
  vob: "video",
  wma: "audio",
  heic: "image",
  heif: "image",
  tif: "image",
  tiff: "image",
  cr2: "image",
  nef: "image",
  arw: "image",
  dng: "image",
};

function extensionForMime(kind: MediaKind, mime: string): string {
  for (const [extension, candidate] of Object.entries(MIME_BY_EXTENSION[kind])) {
    if (candidate === mime) return extension;
  }
  return "";
}

function formatLabel(extension: string, mimeType: string): string {
  if (extension === "jpeg") return "JPG";
  if (extension) return extension.toUpperCase();
  return (mimeType.split("/")[1] || "file").toUpperCase();
}

export interface ClassifiedMediaFile {
  kind: MediaKind;
  /** Display label such as "MP4" or "WAV". */
  format: string;
  extension: string;
  mimeType: string;
  /** The file, re-typed to the canonical MIME type when it helps decoding. */
  file: File;
}

export interface ClassifyOptions {
  /** Scene photos refuse SVG (it can taint a render canvas); logos allow it. */
  allowSvg?: boolean;
}

function retyped(file: File, mimeType: string): File {
  // The exact canonical spelling is kept; an alias (`video/x-m4v`,
  // `audio/x-wav`) is rewritten, because the stored blob's type is what
  // later object URLs are served as.
  if (String(file.type || "").split(";")[0].trim().toLowerCase() === mimeType) return file;
  try {
    return new File([file], file.name, { type: mimeType, lastModified: file.lastModified });
  } catch {
    return file;
  }
}

/**
 * Works out what a chosen file is and whether this surface may take it.
 * The extension wins when the declared MIME type is missing, generic or
 * a known alias — the combination that made good `.mov`/`.m4a` files
 * "unsupported" — and the returned file carries the canonical MIME type
 * so the media element and IndexedDB both see a type browsers key on.
 */
export function classifyMediaFile(
  file: File,
  allowedKinds: readonly MediaKind[],
  options: ClassifyOptions = {},
): ClassifiedMediaFile | null {
  if (!file) return null;
  const extension = fileExtension(file.name);
  const declared = canonicalMimeType(file.type);
  const declaredKind = (["video", "audio", "image"] as const).find((kind) => declared.startsWith(`${kind}/`));

  for (const kind of allowedKinds) {
    const mimeType = MIME_BY_EXTENSION[kind][extension];
    if (mimeType) {
      // A concrete declared kind still wins for an ambiguous extension:
      // an audio-only .ogg/.mp4 must not become a "video" just because
      // those containers can also hold pictures.
      if (declaredKind && declaredKind !== kind && MIME_BY_EXTENSION[declaredKind][extension]) continue;
      if (extension === "svg" && !options.allowSvg) return null;
      return { kind, format: formatLabel(extension, mimeType), extension, mimeType, file: retyped(file, mimeType) };
    }
  }

  // No (or an unknown) extension: trust a concrete declared MIME type.
  for (const kind of allowedKinds) {
    if (!declared.startsWith(`${kind}/`)) continue;
    if (declared === "image/svg+xml" && !options.allowSvg) return null;
    const derivedExtension = extensionForMime(kind, declared);
    if (derivedExtension) {
      return {
        kind,
        format: formatLabel(derivedExtension, declared),
        extension: derivedExtension,
        mimeType: declared,
        file: retyped(file, declared),
      };
    }
  }
  return null;
}

/** True when this surface may take the file (classification only, no decode). */
export function isSupportedMediaFile(
  file: File,
  allowedKinds: readonly MediaKind[],
  options: ClassifyOptions = {},
): boolean {
  return classifyMediaFile(file, allowedKinds, options) !== null;
}

/**
 * classifyMediaFile, or a MediaFileError whose sentence is fit to put on
 * screen: it names the file, the formats that do work, and — for the
 * MKV/HEIC-style formats browsers cannot read — the conversion to make.
 */
export function assertMediaFile(
  file: File,
  allowedKinds: readonly MediaKind[],
  options: ClassifyOptions = {},
): ClassifiedMediaFile {
  const extension = fileExtension(file?.name || "");
  if ((extension === "svg" || canonicalMimeType(file?.type) === "image/svg+xml") && allowedKinds.includes("image") && !options.allowSvg) {
    throw new MediaFileError("SVG files cannot be used in a render. Export the picture as PNG or JPG first.");
  }
  const classified = classifyMediaFile(file, allowedKinds, options);
  if (classified) return classified;

  const wanted = allowedKinds.map((kind) => TOP_MEDIA_FORMATS[kind]).join(" · ");
  const friendlyKind = BROWSER_UNFRIENDLY[extension];
  if (extension && friendlyKind && allowedKinds.includes(friendlyKind)) {
    throw new MediaFileError(
      `"${file.name}" is a ${extension.toUpperCase()} file, and web browsers cannot play ${extension.toUpperCase()} directly. Convert it to ${TOP_MEDIA_FORMATS[friendlyKind]} and upload it again.`,
    );
  }
  const kindWords = allowedKinds.map((kind) => `${kind} file`).join(" or ");
  throw new MediaFileError(`"${file?.name || "That file"}" is not a supported ${kindWords}. Use ${wanted}.`);
}

/* ------------------------------ decode probes ------------------------------ */

const PROBE_TIMEOUT_MS = 20_000;

/**
 * Reads a media element's duration, including the WebM case where the
 * duration only appears after a seek to the end. Rejects with a plain
 * sentence when the browser cannot decode the file at all.
 */
function probeDuration(element: HTMLMediaElement, url: string, kind: MediaKind): Promise<number> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      finish(() => reject(new MediaFileError(`That ${kind} took too long to read. Try ${TOP_MEDIA_FORMATS[kind]}.`)));
    }, PROBE_TIMEOUT_MS);
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      element.onloadedmetadata = null;
      element.ondurationchange = null;
      element.onseeked = null;
      element.onerror = null;
      settle();
    };
    const check = () => {
      const duration = Number(element.duration);
      if (Number.isFinite(duration) && duration > 0) {
        finish(() => resolve(duration));
        return true;
      }
      return false;
    };
    element.onloadedmetadata = () => {
      if (check()) return;
      // Duration is Infinity/NaN (typical of recorder WebM): seeking to
      // the end forces the browser to work out the real length.
      try {
        element.currentTime = Number.MAX_SAFE_INTEGER;
      } catch {
        /* some browsers refuse before metadata settles; durationchange may still arrive */
      }
    };
    element.ondurationchange = () => {
      check();
    };
    element.onseeked = () => {
      if (check()) return;
      const reached = Number(element.currentTime);
      if (Number.isFinite(reached) && reached > 0) finish(() => resolve(reached));
    };
    element.onerror = () => {
      finish(() =>
        reject(
          new MediaFileError(
            kind === "video"
              ? "That video could not be played by this browser. MP4 (H.264), MOV and WebM are supported — an MP4/MOV recorded in HEVC/H.265 may need converting to MP4 (H.264 + AAC) first."
              : `That file could not be read as audio by this browser. Try ${TOP_MEDIA_FORMATS.audio}, or OGG.`,
          ),
        ),
      );
    };
    element.preload = "auto";
    element.muted = true;
    element.src = url;
    try {
      element.load();
    } catch {
      /* setting src already started the load */
    }
  });
}

function temporaryObjectUrl(source: Blob | string): { url: string; revoke: () => void } {
  if (typeof source === "string") return { url: source, revoke: () => {} };
  const url = URL.createObjectURL(source);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}

/** Real duration and frame size, measured by decoding — never guessed. */
export async function probeVideoFile(
  source: Blob | string,
): Promise<{ duration: number; width: number; height: number }> {
  const video = document.createElement("video");
  video.playsInline = true;
  const { url, revoke } = temporaryObjectUrl(source);
  try {
    const duration = await probeDuration(video, url, "video");
    return { duration, width: video.videoWidth || 0, height: video.videoHeight || 0 };
  } finally {
    revoke();
  }
}

/** Real playable length in seconds, measured by decoding. */
export async function probeAudioFile(source: Blob | string): Promise<{ duration: number }> {
  const audio = new Audio();
  const { url, revoke } = temporaryObjectUrl(source);
  try {
    const duration = await probeDuration(audio, url, "audio");
    return { duration };
  } finally {
    revoke();
  }
}

/** Real pixel size, measured by decoding. SVG without a size reports 0×0. */
export function probeImageFile(source: Blob | string): Promise<{ width: number; height: number }> {
  const { url, revoke } = temporaryObjectUrl(source);
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = window.setTimeout(() => {
      revoke();
      reject(new MediaFileError(`That image took too long to read. Try ${TOP_MEDIA_FORMATS.image}.`));
    }, PROBE_TIMEOUT_MS);
    img.onload = () => {
      window.clearTimeout(timer);
      const measured = { width: img.naturalWidth || 0, height: img.naturalHeight || 0 };
      revoke();
      resolve(measured);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      revoke();
      reject(new MediaFileError(`That file could not be read as an image. Try ${TOP_MEDIA_FORMATS.image}.`));
    };
    img.src = url;
  });
}

/** Default logo cap: a data URL lives in the saved project, so keep it sane. */
export const MAX_LOGO_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Reads a logo file to a data URL, after the same classification and a
 * real decode probe — the logo buttons used to take any file at all
 * and let the render discover the problem.
 */
export async function readImageFileAsDataUrl(
  file: File,
  options: ClassifyOptions & { maxBytes?: number } = {},
): Promise<string> {
  const classified = assertMediaFile(file, ["image"], { allowSvg: true, ...options });
  const maxBytes = options.maxBytes ?? MAX_LOGO_IMAGE_BYTES;
  if (classified.file.size > maxBytes) {
    const mb = Math.round(classified.file.size / (1024 * 1024));
    throw new MediaFileError(`"${file.name}" is ${mb} MB. Keep logo images under ${Math.round(maxBytes / (1024 * 1024))} MB.`);
  }
  await probeImageFile(classified.file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new MediaFileError("That image could not be read."));
    };
    reader.onerror = () => reject(new MediaFileError("That image could not be read."));
    reader.readAsDataURL(classified.file);
  });
}
