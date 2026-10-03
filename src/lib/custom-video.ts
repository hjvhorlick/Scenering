/**
 * Your own video, used as the project's single scene.
 *
 * A one-scene project can start from a script, or it can start from footage
 * the creator already has — a music video, a filmed take, a screen recording.
 * That file has to behave exactly like a scene: it gets captions burned over
 * it, music under it and overlays on top of it, and it has to still be there
 * tomorrow morning.
 *
 * Same two rules as the music uploads in `custom-music.ts`:
 *
 * 1. **An upload has to survive a reload.** The file is kept as a Blob in
 *    IndexedDB. A `blob:` object URL dies with the page, so a project that
 *    stored one would open to a black scene the next day.
 * 2. **The scene stores a stable address.** `scene.video_url` holds
 *    `custom-video:<id>`, and the two places that actually feed a `<video>`
 *    element — `ClipPool` in scene-clip.ts and the clip panel in the scene
 *    editor — call `resolveVideoUrl()` at the moment of playback.
 *
 * This is a separate IndexedDB database from the music store on purpose: two
 * modules opening the same database at different versions race each other,
 * and a failed upgrade would take the music library down with it.
 */

const DB_NAME = "scenering-video";
const DB_VERSION = 1;
const STORE = "custom-video";

/** Address written into `scene.video_url`; resolved at playback time. */
export const CUSTOM_VIDEO_PREFIX = "custom-video:";

/**
 * Browsers hold the whole blob in memory while it plays. A feature film would
 * take the tab down, so the upload is refused with a sentence the user can
 * act on rather than a crash.
 */
export const MAX_CUSTOM_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB

export interface CustomVideoClip {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Seconds, measured from the decoded file rather than guessed. */
  duration: number;
  width: number;
  height: number;
  addedAt: number;
}

interface CustomVideoRecord extends CustomVideoClip {
  blob: Blob;
}

/** id -> live object URL for this page load. */
const objectUrls = new Map<string, string>();
let clips: CustomVideoClip[] = [];
let loaded = false;
let loadPromise: Promise<CustomVideoClip[]> | null = null;

function browserHasIdb(): boolean {
  return typeof indexedDB !== "undefined" && typeof Blob !== "undefined";
}

function openDb(): Promise<IDBDatabase | null> {
  if (!browserHasIdb()) return Promise.resolve(null);
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    // Private-mode browsers and blocked storage land here: the feature simply
    // reports itself as unavailable instead of throwing into the UI.
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function stripBlob(record: CustomVideoRecord): CustomVideoClip {
  const { blob: _blob, ...rest } = record;
  return rest;
}

/**
 * Reads every stored upload and mints an object URL for each. Safe to call
 * repeatedly; the work happens once per page load. The app calls this on
 * start-up so a saved project's footage is ready before the first paint.
 */
export async function loadCustomVideos(): Promise<CustomVideoClip[]> {
  if (loaded) return [...clips];
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const db = await openDb();
    if (!db) {
      loaded = true;
      return [];
    }
    try {
      const tx = db.transaction(STORE, "readonly");
      const all = await idbRequest<CustomVideoRecord[]>(
        tx.objectStore(STORE).getAll() as IDBRequest<CustomVideoRecord[]>
      );
      clips = [];
      for (const record of all || []) {
        if (!record?.id || !record.blob) continue;
        try {
          objectUrls.set(record.id, URL.createObjectURL(record.blob));
          clips.push(stripBlob(record));
        } catch {
          /* one unreadable row must not hide the rest */
        }
      }
    } catch {
      clips = [];
    }
    loaded = true;
    return [...clips];
  })();

  return loadPromise;
}

export function isCustomVideoUrl(url: string | undefined | null): boolean {
  return typeof url === "string" && url.startsWith(CUSTOM_VIDEO_PREFIX);
}

export function customVideoId(url: string): string {
  return url.slice(CUSTOM_VIDEO_PREFIX.length);
}

/**
 * The one function every video consumer calls. A normal http(s) or blob URL
 * passes straight through, so this is safe to put in front of all playback.
 * Returns null when an upload has been deleted or storage is unavailable.
 */
export function resolveVideoUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  if (!isCustomVideoUrl(url)) return url;
  return objectUrls.get(customVideoId(url)) ?? null;
}

export function getCustomVideo(url: string | undefined | null): CustomVideoClip | undefined {
  if (!isCustomVideoUrl(url)) return undefined;
  const id = customVideoId(url!);
  return clips.find((c) => c.id === id);
}

/** Measures real playable length and frame size; an undecodable file is rejected. */
function measureVideo(objectUrl: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const done = (fn: () => void) => {
      video.onloadedmetadata = null;
      video.onerror = null;
      fn();
    };
    video.onloadedmetadata = () =>
      done(() => {
        const duration = Number(video.duration);
        resolve({
          duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
          width: video.videoWidth || 0,
          height: video.videoHeight || 0,
        });
      });
    video.onerror = () =>
      done(() =>
        reject(new Error("That file could not be played as video. Try MP4 (H.264), WebM or MOV."))
      );
    video.preload = "metadata";
    video.muted = true;
    video.src = objectUrl;
  });
}

function prettyName(filename: string): string {
  const base = filename.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  if (!base) return "My video";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export class CustomVideoError extends Error {}

/**
 * Stores one uploaded file and returns the clip the UI should show.
 * Throws CustomVideoError with a sentence fit to put on screen.
 */
export async function addCustomVideo(file: File): Promise<CustomVideoClip> {
  if (!browserHasIdb()) {
    throw new CustomVideoError("This browser cannot store uploads. Try a normal (non-private) window.");
  }
  const looksLikeVideo =
    file.type.startsWith("video/") || /\.(mp4|m4v|mov|webm|ogv|mkv|avi)$/i.test(file.name);
  if (!looksLikeVideo) {
    throw new CustomVideoError(`"${file.name}" is not a video file. Use MP4, MOV, WebM or M4V.`);
  }
  if (file.size > MAX_CUSTOM_VIDEO_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024));
    throw new CustomVideoError(`"${file.name}" is ${mb} MB. Keep uploads under 500 MB.`);
  }

  const id = `cv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const objectUrl = URL.createObjectURL(file);

  let measured: { duration: number; width: number; height: number };
  try {
    measured = await measureVideo(objectUrl);
  } catch (err: any) {
    URL.revokeObjectURL(objectUrl);
    throw new CustomVideoError(err?.message || "That file could not be read as video.");
  }
  if (measured.duration <= 0) {
    URL.revokeObjectURL(objectUrl);
    throw new CustomVideoError("That file has no playable video in it.");
  }

  const record: CustomVideoRecord = {
    id,
    name: prettyName(file.name),
    mime: file.type || "video/mp4",
    size: file.size,
    duration: measured.duration,
    width: measured.width,
    height: measured.height,
    addedAt: Date.now(),
    blob: file,
  };

  const db = await openDb();
  if (!db) {
    URL.revokeObjectURL(objectUrl);
    throw new CustomVideoError("Storage is unavailable, so the upload could not be saved.");
  }

  const saved = await new Promise<boolean>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });

  if (!saved) {
    URL.revokeObjectURL(objectUrl);
    throw new CustomVideoError("The upload could not be saved — browser storage may be full.");
  }

  objectUrls.set(id, objectUrl);
  clips.push(stripBlob(record));
  loaded = true;
  return stripBlob(record);
}

export async function removeCustomVideo(id: string): Promise<void> {
  const url = objectUrls.get(id);
  if (url) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* already revoked */
    }
    objectUrls.delete(id);
  }
  clips = clips.filter((c) => c.id !== id);

  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
  } catch {
    /* the in-memory list is already correct */
  }
}

/** "1920 × 1080 · 3:07 · 42 MB" for the upload card. */
export function describeClip(clip: CustomVideoClip): string {
  const total = Math.max(0, Math.round(clip.duration));
  const length = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  const mb = clip.size / (1024 * 1024);
  const size = mb >= 1 ? `${Math.round(mb)} MB` : `${Math.max(1, Math.round(mb * 1024))} KB`;
  const frame = clip.width && clip.height ? `${clip.width} × ${clip.height} · ` : "";
  return `${frame}${length} · ${size}`;
}
