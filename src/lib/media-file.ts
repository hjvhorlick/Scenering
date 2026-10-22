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
 *    called a good file empty. The same is true of fragmented MP4, and
 *    of `videoWidth`/`videoHeight`, which some browsers only fill in at
 *    `loadeddata`.
 *  - The probe read a `<video>` element that was never put in the
 *    document. Safari and several mobile pipelines do not load those, so
 *    an ordinary iPhone MP4 timed out and was reported as unplayable.
 *  - AVI/WMV/FLV and friends were named as acceptable in one store even
 *    though nothing can read them, so they failed later with a vague
 *    message. Matroska and MPEG-TS were refused on that same list even
 *    though the picture inside is usually ordinary H.264; they are now
 *    accepted and re-wrapped by `media-convert.ts` instead.
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
import { inspectMediaBlob } from "./media-convert";

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
export const VIDEO_UPLOAD_ACCEPT =
  "video/*,.mp4,.mov,.webm,.m4v,.mkv,.mts,.m2ts,.ts,.ogv,.3gp,.3g2,.mpg,.mpeg";
export const AUDIO_UPLOAD_ACCEPT = "audio/*,.mp3,.wav,.wave,.m4a,.aac,.ogg,.oga,.opus,.flac,.webm,.weba,.mp4,.aif,.aiff";
export const IMAGE_UPLOAD_ACCEPT = "image/*,.jpg,.jpeg,.png,.webp,.gif,.avif,.bmp";
/** Logos may be SVG — they are drawn as overlay images, where SVG is wanted. */
export const LOGO_IMAGE_UPLOAD_ACCEPT = "image/*,.png,.jpg,.jpeg,.webp,.svg,.gif,.avif";
export const IMAGE_OR_VIDEO_UPLOAD_ACCEPT =
  "video/*,image/*,.mp4,.mov,.webm,.m4v,.mkv,.mts,.m2ts,.ts,.ogv,.3gp,.jpg,.jpeg,.png,.webp,.gif,.avif,.bmp";

/**
 * Formats customers reasonably try that neither a web browser nor the
 * bundled demuxer can read. They get a specific "convert it" sentence instead
 * of a generic refusal (or worse, a silent black frame).
 *
 * Matroska (`.mkv`) and MPEG-TS (`.mts`/`.m2ts`) used to be on this list.
 * They are now accepted and re-wrapped as MP4 on upload — the picture inside
 * is ordinary H.264 often enough that refusing it was the real bug.
 */
const BROWSER_UNFRIENDLY: Record<string, MediaKind> = {
  avi: "video",
  wmv: "video",
  flv: "video",
  rm: "video",
  rmvb: "video",
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
 * AVI/HEIC-style formats nothing here can read — the conversion to make.
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

/**
 * How long a probe may take before the file is called *slow* rather than
 * *wrong*. The old 20-second limit turned a large phone clip on a cold disk
 * into "that video took too long to read", which customers read as a format
 * refusal — and then went looking for a converter they did not need.
 */
const PROBE_TIMEOUT_MS = 30_000;

/** Why a probe stopped, so the caller can convert, explain or carry on. */
export type MediaProbeReason = "unsupported" | "slow";

export class MediaProbeError extends MediaFileError {
  readonly reason: MediaProbeReason;
  /** `HTMLMediaElement.error.code`: 1 aborted, 2 network, 3 decode, 4 unsupported. */
  readonly code: number | null;

  constructor(message: string, reason: MediaProbeReason, code: number | null = null) {
    super(message);
    this.name = "MediaProbeError";
    this.reason = reason;
    this.code = code;
  }
}

function mediaErrorMessage(kind: MediaKind, code: number | null): string {
  if (kind === "audio") {
    return `That file could not be read as audio by this browser. Try ${TOP_MEDIA_FORMATS.audio}, or OGG.`;
  }
  if (code === 3) {
    return "That video's picture could not be decoded by this browser. MP4 (H.264), MOV and WebM are the formats that always work.";
  }
  return "That video is in a container this browser cannot open. MP4 (H.264), MOV and WebM are the formats that always work.";
}

/**
 * Keeps the element in the document, one pixel off-screen, while it is read.
 *
 * A detached `<video>` is not reliably loaded by Safari or by several mobile
 * media pipelines — the exact quirk this repository already works around for
 * clip playback in `scene-clip.ts`. A probe that created its element and never
 * mounted it therefore waited for `loadedmetadata` that could never arrive,
 * timed out, and refused a perfectly ordinary MP4 from an iPhone or iPad.
 */
function attachForProbe(element: HTMLMediaElement): () => void {
  if (typeof document === "undefined" || !document.body) return () => {};
  const holder = element as HTMLElement;
  holder.style.position = "fixed";
  holder.style.left = "-10000px";
  holder.style.top = "0px";
  holder.style.width = "2px";
  holder.style.height = "2px";
  holder.style.opacity = "0";
  holder.style.pointerEvents = "none";
  element.setAttribute("aria-hidden", "true");
  element.tabIndex = -1;
  document.body.appendChild(element);
  return () => {
    try {
      element.pause();
    } catch {
      /* a paused element may not expose pause() in tests */
    }
    element.removeAttribute("src");
    try {
      element.load();
    } catch {
      /* releasing the decoder is best-effort */
    }
    element.remove();
  };
}

interface ProbeMeasurement {
  duration: number;
  width: number;
  height: number;
}

/**
 * Reads duration and frame size from a media element, and keeps trying until
 * both are known.
 *
 * The previous version resolved on `loadedmetadata` alone. Three real files
 * broke on that:
 *  - a WebM from a recorder reports `duration === Infinity` until it is
 *    seeked (handled by seeking, as before);
 *  - a fragmented MP4 reports `Infinity` and only answers a seek once enough
 *    of the index has arrived, which is why the element is not abandoned
 *    after one attempt;
 *  - `videoWidth`/`videoHeight` are still 0 at `loadedmetadata` in some
 *    browsers and arrive with `loadeddata`, so reading them immediately made
 *    a good file look like it had "no picture in it".
 */
function probeMediaElement(
  element: HTMLMediaElement,
  url: string,
  kind: MediaKind,
): Promise<ProbeMeasurement> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let seeks = 0;
    let metadataSeen = false;
    let detach = () => {};
    let poll = 0;
    let timer = 0;

    const width = () => (kind === "video" ? (element as HTMLVideoElement).videoWidth || 0 : 0);
    const height = () => (kind === "video" ? (element as HTMLVideoElement).videoHeight || 0 : 0);

    const cleanup = () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
      element.removeEventListener("loadedmetadata", onMetadata);
      element.removeEventListener("loadeddata", onData);
      element.removeEventListener("canplay", onData);
      element.removeEventListener("canplaythrough", onData);
      element.removeEventListener("resize", onStateChange);
      element.removeEventListener("durationchange", onStateChange);
      element.removeEventListener("progress", onStateChange);
      element.removeEventListener("seeked", onSeeked);
      element.removeEventListener("error", onError);
      const release = detach;
      detach = () => {};
      release();
    };

    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      settle();
    };

    const succeed = (duration: number) => {
      // Measured BEFORE cleanup: detaching the element and clearing its src
      // resets `videoWidth`/`videoHeight` to 0 in some browsers, which would
      // put us straight back to "no picture in it" for a good file.
      const measuredWidth = width();
      const measuredHeight = height();
      finish(() => resolve({ duration, width: measuredWidth, height: measuredHeight }));
    };

    const seekToEnd = () => {
      // A stream that never resolves its duration would otherwise be seeked
      // forever; three attempts is plenty for the recorder-WebM/fMP4 cases.
      if (seeks >= 3 || settled) return;
      seeks += 1;
      // Duration is Infinity/NaN (recorder WebM, fragmented MP4): seeking to
      // the end forces the browser to work out the real length.
      try {
        element.currentTime = Number.MAX_SAFE_INTEGER;
      } catch {
        /* some browsers refuse before metadata settles; polling retries */
      }
    };

    /** True when the element has answered with everything the caller needs. */
    function check(): boolean {
      if (settled) return true;
      const duration = Number(element.duration);
      if (!Number.isFinite(duration) || duration <= 0) return false;
      if (kind === "video" && (!width() || !height())) return false;
      succeed(duration);
      return true;
    }

    function onMetadata() {
      metadataSeen = true;
      if (check()) return;
      seekToEnd();
    }

    function onData() {
      if (check()) return;
      if (metadataSeen) seekToEnd();
    }

    function onStateChange() {
      if (check()) return;
      if (metadataSeen) seekToEnd();
    }

    function onSeeked() {
      if (check()) return;
      // A browser that never produces a finite duration still knows where the
      // seek landed; that position is the length it can play.
      if (!Number.isFinite(Number(element.duration))) {
        const reached = Number(element.currentTime);
        if (Number.isFinite(reached) && reached > 0) {
          succeed(reached);
          return;
        }
      }
      seekToEnd();
    }

    function onError() {
      const code = element.error?.code ?? null;
      finish(() => reject(new MediaProbeError(mediaErrorMessage(kind, code), "unsupported", code)));
    }

    element.addEventListener("loadedmetadata", onMetadata);
    element.addEventListener("loadeddata", onData);
    element.addEventListener("canplay", onData);
    element.addEventListener("canplaythrough", onData);
    element.addEventListener("resize", onStateChange);
    element.addEventListener("durationchange", onStateChange);
    element.addEventListener("progress", onStateChange);
    element.addEventListener("seeked", onSeeked);
    element.addEventListener("error", onError);

    // Armed before the file is opened: a browser that answers synchronously
    // must not leave a timer running behind a finished probe.
    poll = window.setInterval(() => {
      if (check()) return;
      if (metadataSeen) seekToEnd();
    }, 250);
    timer = window.setTimeout(() => {
      finish(() =>
        reject(
          new MediaProbeError(
            kind === "video"
              ? "That video took too long to read. It is not necessarily the wrong format — try it again, or convert it to MP4 (H.264 + AAC)."
              : `That ${kind} took too long to read. Try ${TOP_MEDIA_FORMATS[kind]}.`,
            "slow",
          ),
        ),
      );
    }, PROBE_TIMEOUT_MS);

    detach = attachForProbe(element);
    element.muted = true;
    element.preload = "auto";
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

/**
 * Real duration and frame size, measured by decoding — never guessed.
 *
 * A file that decodes but will not state its duration (or whose metadata is
 * still in flight when the probe gives up) is measured from its container
 * instead of being refused: the demuxer can read the length without a
 * decoder, and refusing a file the app can play is the bug this guards.
 */
export async function probeVideoFile(
  source: Blob | string,
): Promise<{ duration: number; width: number; height: number }> {
  const video = document.createElement("video");
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  const { url, revoke } = temporaryObjectUrl(source);
  try {
    return await probeMediaElement(video, url, "video");
  } catch (error) {
    if (error instanceof MediaProbeError && error.reason === "slow" && typeof source !== "string") {
      // The element never finished, but the container may still know its
      // shape. Trust the file rather than the clock.
      const measured = await inspectMediaBlob(source).catch(() => null);
      // Trust the container only when this browser has a decoder for what is
      // inside it. A file whose codec nothing can decode has already failed
      // with an error, not a timeout — this guard is for slow, valid files.
      const decodable = !measured?.videoCodec || measured.videoDecodable;
      if (measured && measured.duration > 0 && decodable) {
        // A container with no video track comes back with 0x0 on purpose:
        // the caller already has the sentence for "audio-only file".
        return { duration: measured.duration, width: measured.width, height: measured.height };
      }
    }
    throw error;
  } finally {
    revoke();
  }
}

/** Real playable length in seconds, measured by decoding. */
export async function probeAudioFile(source: Blob | string): Promise<{ duration: number }> {
  const audio = document.createElement("audio");
  const { url, revoke } = temporaryObjectUrl(source);
  try {
    return await probeMediaElement(audio, url, "audio");
  } catch (error) {
    if (error instanceof MediaProbeError && error.reason === "slow" && typeof source !== "string") {
      const measured = await inspectMediaBlob(source).catch(() => null);
      if (measured && measured.duration > 0) return { duration: measured.duration };
    }
    throw error;
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
