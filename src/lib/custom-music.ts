/**
 * Your own background music.
 *
 * The bundled library is thirty cleared tracks, but a creator who already has
 * a piece of music — their own composition, a track they have licensed, the
 * audio from a YouTube Audio Library download — needs to put *that* under the
 * video. This module is the store behind that.
 *
 * Two rules shape the design:
 *
 * 1. **An upload has to survive a reload.** The file is kept as a Blob in
 *    IndexedDB (not localStorage, which is a few megabytes of text only, and
 *    not the server, because Scenering runs entirely in the browser). On the
 *    next visit the blob is read back and a fresh object URL is minted.
 *
 * 2. **A saved project cannot store an object URL.** `blob:` URLs die with the
 *    page, so an insert that recorded one would silently fall silent the next
 *    morning. Inserts therefore store the stable address `custom-music:<id>`,
 *    and the two places that actually touch audio — the preview player in
 *    media-library.ts and `decodeInsertAudio()` in insert-audio.ts — call
 *    `resolveAudioUrl()` to swap it for the live object URL at the moment of
 *    playback.
 */

const DB_NAME = "scenering-media";
const DB_VERSION = 1;
const STORE = "custom-music";

/** Address written into timeline inserts; resolved at playback time. */
export const CUSTOM_MUSIC_PREFIX = "custom-music:";

/** Uploads above this never reach IndexedDB — the browser would choke first. */
export const MAX_CUSTOM_MUSIC_BYTES = 60 * 1024 * 1024; // 60 MB

export interface CustomMusicTrack {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Seconds, measured from the decoded file rather than guessed. */
  duration: number;
  addedAt: number;
}

interface CustomMusicRecord extends CustomMusicTrack {
  blob: Blob;
}

/** id -> live object URL for this page load. */
const objectUrls = new Map<string, string>();
let tracks: CustomMusicTrack[] = [];
let loaded = false;
let loadPromise: Promise<CustomMusicTrack[]> | null = null;

type Listener = (tracks: CustomMusicTrack[]) => void;
const listeners = new Set<Listener>();

function notify() {
  const snapshot = listTracks();
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch {
      /* a broken subscriber must never stop the others */
    }
  });
}

export function subscribeToCustomMusic(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

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

function stripBlob(record: CustomMusicRecord): CustomMusicTrack {
  const { blob: _blob, ...rest } = record;
  return rest;
}

/** Newest first — the track you just added is the one you are looking for. */
function listTracks(): CustomMusicTrack[] {
  return [...tracks].sort((a, b) => b.addedAt - a.addedAt);
}

/**
 * Reads every stored upload and mints an object URL for each. Safe to call
 * repeatedly; the work happens once per page load.
 */
export async function loadCustomMusic(): Promise<CustomMusicTrack[]> {
  if (loaded) return listTracks();
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const db = await openDb();
    if (!db) {
      loaded = true;
      return [];
    }
    try {
      const tx = db.transaction(STORE, "readonly");
      const all = await idbRequest<CustomMusicRecord[]>(
        tx.objectStore(STORE).getAll() as IDBRequest<CustomMusicRecord[]>
      );
      const records = all || [];
      tracks = [];
      for (const record of records) {
        if (!record?.id || !record.blob) continue;
        try {
          objectUrls.set(record.id, URL.createObjectURL(record.blob));
          tracks.push(stripBlob(record));
        } catch {
          /* a single unreadable row must not hide the rest of the library */
        }
      }
    } catch {
      tracks = [];
    }
    loaded = true;
    notify();
    return listTracks();
  })();

  return loadPromise;
}

export function getCustomMusicTracks(): CustomMusicTrack[] {
  return listTracks();
}

export function isCustomMusicUrl(url: string | undefined | null): boolean {
  return typeof url === "string" && url.startsWith(CUSTOM_MUSIC_PREFIX);
}

export function customMusicId(url: string): string {
  return url.slice(CUSTOM_MUSIC_PREFIX.length);
}

/**
 * The one function every audio consumer calls. A normal `/sounds/...` URL
 * passes straight through, so this is safe to put in front of all playback.
 * Returns null when an upload has been deleted or storage is unavailable.
 */
export function resolveAudioUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  if (!isCustomMusicUrl(url)) return url;
  return objectUrls.get(customMusicId(url)) ?? null;
}

export function getCustomMusicTrack(url: string | undefined | null): CustomMusicTrack | undefined {
  if (!isCustomMusicUrl(url)) return undefined;
  const id = customMusicId(url!);
  return tracks.find((t) => t.id === id);
}

/** Measures real playable length; a file the browser cannot decode is rejected. */
function measureDuration(objectUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const done = (fn: () => void) => {
      audio.onloadedmetadata = null;
      audio.onerror = null;
      fn();
    };
    audio.onloadedmetadata = () =>
      done(() => {
        const value = Number(audio.duration);
        resolve(Number.isFinite(value) && value > 0 ? value : 0);
      });
    audio.onerror = () =>
      done(() => reject(new Error("That file could not be read as audio. Try MP3, WAV, OGG or M4A.")));
    audio.preload = "metadata";
    audio.src = objectUrl;
  });
}

function prettyName(filename: string): string {
  const base = filename.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  if (!base) return "My track";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export class CustomMusicError extends Error {}

/**
 * Stores one uploaded file and returns the track the UI should show.
 * Throws CustomMusicError with a sentence fit to put on screen.
 */
export async function addCustomMusic(file: File): Promise<CustomMusicTrack> {
  if (!browserHasIdb()) {
    throw new CustomMusicError("This browser cannot store uploads. Try a normal (non-private) window.");
  }
  const looksLikeAudio = file.type.startsWith("audio/") || /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba)$/i.test(file.name);
  if (!looksLikeAudio) {
    throw new CustomMusicError(`"${file.name}" is not an audio file. Use MP3, WAV, OGG, M4A, AAC or FLAC.`);
  }
  if (file.size > MAX_CUSTOM_MUSIC_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024));
    throw new CustomMusicError(`"${file.name}" is ${mb} MB. Keep uploads under 60 MB.`);
  }

  const id = `cm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const objectUrl = URL.createObjectURL(file);

  let duration = 0;
  try {
    duration = await measureDuration(objectUrl);
  } catch (err: any) {
    URL.revokeObjectURL(objectUrl);
    throw new CustomMusicError(err?.message || "That file could not be read as audio.");
  }
  if (duration <= 0) {
    URL.revokeObjectURL(objectUrl);
    throw new CustomMusicError("That file has no playable audio in it.");
  }

  const record: CustomMusicRecord = {
    id,
    name: prettyName(file.name),
    mime: file.type || "audio/mpeg",
    size: file.size,
    duration,
    addedAt: Date.now(),
    blob: file,
  };

  const db = await openDb();
  if (!db) {
    URL.revokeObjectURL(objectUrl);
    throw new CustomMusicError("Storage is unavailable, so the upload could not be saved.");
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
    throw new CustomMusicError("The upload could not be saved — browser storage may be full.");
  }

  objectUrls.set(id, objectUrl);
  tracks.push(stripBlob(record));
  loaded = true;
  notify();
  return stripBlob(record);
}

export async function removeCustomMusic(id: string): Promise<void> {
  const url = objectUrls.get(id);
  if (url) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* already revoked */
    }
    objectUrls.delete(id);
  }
  tracks = tracks.filter((t) => t.id !== id);
  notify();

  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
  } catch {
    /* the in-memory list is already correct */
  }
}

/** Human-readable length for the card, e.g. 3:07. */
export function formatTrackLength(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}
