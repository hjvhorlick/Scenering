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

import type { TimelineInsert } from "../types";
import { assertMediaFile, probeAudioFile } from "./media-file";

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
  /**
   * How the track is used, chosen by the creator when they import it:
   * `true` repeats it to fill the whole video, `false` plays it once at its
   * own length. Absent means "not asked yet" (an upload from before this
   * choice existed), which the library treats as looping — the behaviour it
   * always had.
   */
  loop?: boolean;
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

export const MUSIC_VIDEO_SOURCE_TYPE_PREFIX = "bgm_music_video_source_";

/** Distinguishes source audio from an ordinary bed added to a narrated project. */
export function isMusicVideoSourceInsert(insert: Pick<TimelineInsert, "category" | "type">): boolean {
  return insert.category === "background_music" &&
    typeof insert.type === "string" &&
    insert.type.startsWith(MUSIC_VIDEO_SOURCE_TYPE_PREFIX);
}

/**
 * Makes an uploaded track the soundtrack of a still-image music video.
 *
 * This is intentionally different from ordinary background music: the track is
 * the project's source material, so it plays once at its own length and starts
 * at frame zero. If the creator later makes the pictures run longer, the video
 * wins and the tail is silent — this helper never loops or stretches the song.
 */
export function createMusicVideoInsert(
  track: Pick<CustomMusicTrack, "id" | "name" | "duration">,
  volume = 1
): TimelineInsert {
  const duration = Math.max(1, Number(track.duration) || 0);
  const soundUrl = `${CUSTOM_MUSIC_PREFIX}${track.id}`;
  return {
    id: `bgm_setup_${track.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    category: "background_music",
    type: `${MUSIC_VIDEO_SOURCE_TYPE_PREFIX}${track.id}`,
    title: track.name,
    startTime: 0,
    duration,
    position: { x: 0.5, y: 0.5 },
    presetPosition: "bottom",
    size: 1,
    opacity: 1,
    intensity: 1,
    audioSource: "music",
    // Explicit scope keeps stretchFullVideoMedia from treating this play-once
    // source as a legacy looping bed when the creator later adds more scenes.
    scope: "this_scene",
    content: {
      primaryText: track.name,
      secondaryText: "Uploaded by you — you are responsible for its licence",
      label: "My music",
      soundUrl,
      soundVolume: Math.max(0, Math.min(1, volume)),
    },
    audioSettings: {
      soundUrl,
      soundName: track.name,
      volume: Math.max(0, Math.min(1, volume)),
      loop: false,
    },
  };
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
  // Shared classification (media-file.ts): MP3, WAV and M4A lead, and a
  // file whose OS reported no/generic MIME type is recognised by its
  // extension and re-typed so the browser will decode it.
  let classified;
  try {
    classified = assertMediaFile(file, ["audio"]);
  } catch (err: any) {
    throw new CustomMusicError(err?.message || "That file is not a supported audio file.");
  }
  const uploadFile = classified.file;
  if (file.size > MAX_CUSTOM_MUSIC_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024));
    throw new CustomMusicError(`"${file.name}" is ${mb} MB. Keep uploads under 60 MB.`);
  }

  const id = `cm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  let duration = 0;
  try {
    duration = (await probeAudioFile(uploadFile)).duration;
  } catch (err: any) {
    throw new CustomMusicError(err?.message || "That file could not be read as audio.");
  }
  if (duration <= 0) {
    throw new CustomMusicError("That file has no playable audio in it.");
  }

  const record: CustomMusicRecord = {
    id,
    name: prettyName(file.name),
    mime: classified.mimeType,
    size: file.size,
    duration,
    addedAt: Date.now(),
    blob: uploadFile,
  };

  const db = await openDb();
  if (!db) {
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
    throw new CustomMusicError("The upload could not be saved — browser storage may be full.");
  }

  objectUrls.set(id, URL.createObjectURL(uploadFile));
  tracks.push(stripBlob(record));
  loaded = true;
  notify();
  return stripBlob(record);
}

/**
 * Records the creator's answer to "loop it, or use the track's own length?".
 *
 * It is stored on the track, not on the timeline insert, because the question
 * belongs to the file: the same upload reused tomorrow should not have to be
 * asked again, and a saved project must come back with the choice intact.
 */
export async function setCustomMusicLoop(id: string, loop: boolean): Promise<void> {
  tracks = tracks.map((t) => (t.id === id ? { ...t, loop } : t));
  notify();

  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const existing = await idbRequest<CustomMusicRecord>(store.get(id) as IDBRequest<CustomMusicRecord>);
    if (existing) store.put({ ...existing, loop });
  } catch {
    /* the in-memory list is already correct */
  }
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

/**
 * What choosing "use the file's length" actually does to a video of
 * `videoSeconds`, said in one sentence before the creator commits to it.
 *
 * The video is never cut to fit a track — a one-scene project is always the
 * length of its footage — so a track shorter than the video leaves the tail of
 * the video with no music, and a track longer than the video simply is not all
 * heard. Both are legitimate choices; they just should not be a surprise in
 * the finished file. Returns "" when there is no video to compare against.
 */
export function playOnceConsequence(trackSeconds: number, videoSeconds: number): string {
  if (!(trackSeconds > 0) || !(videoSeconds > 0)) return "";
  const toTenth = (n: number) => Math.round(n * 10) / 10;
  const silenceAfterTrack = toTenth(Math.max(0, videoSeconds - trackSeconds));
  const unheardTail = toTenth(Math.max(0, trackSeconds - videoSeconds));
  const video = formatTrackLength(videoSeconds);
  // Under a second of difference is not worth interrupting the creator for.
  if (silenceAfterTrack >= 1) {
    return `Your video is ${video}, so the last ${formatTrackLength(
      silenceAfterTrack
    )} would play with no music.`;
  }
  if (unheardTail >= 1) {
    return `Your video is ${video}, so the last ${formatTrackLength(
      unheardTail
    )} of the track would not be heard.`;
  }
  return "It matches your video's length almost exactly.";
}
