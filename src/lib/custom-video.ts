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

import { assertMediaFile, probeVideoFile } from "./media-file";

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
/** New unsaved UI state is not visible in localStorage yet; never prune it. */
const createdThisSession = new Set<string>();
let clips: CustomVideoClip[] = [];
let loaded = false;
let loadPromise: Promise<CustomVideoClip[]> | null = null;

export interface AddCustomVideoOptions {
  /** Existing clips this upload replaces, deleted atomically with the new put. */
  replaceIds?: readonly string[];
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

function stripBlob(record: CustomVideoRecord): CustomVideoClip {
  const { blob: _blob, ...rest } = record;
  return rest;
}

function forgetInMemory(id: string): void {
  const url = objectUrls.get(id);
  if (url) {
    try { URL.revokeObjectURL(url); } catch {}
    objectUrls.delete(id);
  }
  createdThisSession.delete(id);
  clips = clips.filter((clip) => clip.id !== id);
}

function videoReferenceCounts(): Map<string, number> | null {
  const counts = new Map<string, number>();
  if (typeof localStorage === "undefined") return counts;
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      const value = localStorage.getItem(key);
      if (!value || !value.includes(CUSTOM_VIDEO_PREFIX)) continue;
      for (const match of value.matchAll(/custom-video:(cv_[a-z0-9_]+)/gi)) {
        if (match[1]) counts.set(match[1], (counts.get(match[1]) || 0) + 1);
      }
    }
    return counts;
  } catch {
    // Without a trustworthy reference scan, delete nothing.
    return null;
  }
}

function referencedVideoIds(): Set<string> | null {
  const counts = videoReferenceCounts();
  return counts ? new Set(counts.keys()) : null;
}

interface StoreResult {
  ok: boolean;
  error: Error | null;
}

/** Delete replacements and save their successor in one rollback-safe commit. */
function storeVideoRecord(
  db: IDBDatabase,
  record: CustomVideoRecord,
  replaceIds: readonly string[]
): Promise<StoreResult> {
  return new Promise((resolve) => {
    let settled = false;
    let failure: Error | null = null;
    const finish = (result: StoreResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const id of replaceIds) {
        if (id && id !== record.id) store.delete(id);
      }
      const put = store.put(record);
      put.onerror = () => {
        failure = put.error || new Error("The browser refused the video write.");
      };
      tx.oncomplete = () => finish({ ok: true, error: null });
      tx.onerror = () => {
        failure = tx.error || failure || new Error("The video storage transaction failed.");
      };
      tx.onabort = () => finish({
        ok: false,
        error: tx.error || failure || new Error("The video storage transaction was aborted."),
      });
    } catch (error) {
      finish({ ok: false, error: error instanceof Error ? error : new Error(String(error)) });
    }
  });
}

/**
 * Reclaim old uploads that no saved project references. This runs only after a
 * quota failure; normal uploads never scan or delete the customer's library.
 */
async function pruneOrphanedVideos(
  db: IDBDatabase,
  keepIds: ReadonlySet<string>
): Promise<number> {
  let keys: IDBValidKey[] = [];
  try {
    const tx = db.transaction(STORE, "readonly");
    keys = (await idbRequest<IDBValidKey[]>(tx.objectStore(STORE).getAllKeys())) || [];
  } catch {
    return 0;
  }

  const referenced = referencedVideoIds();
  // If project storage cannot be read, no upload can be proven orphaned.
  if (!referenced) return 0;
  const orphanIds = keys
    .map((key) => String(key))
    .filter((id) =>
      id.startsWith("cv_") &&
      !referenced.has(id) &&
      !createdThisSession.has(id) &&
      !keepIds.has(id)
    );
  if (orphanIds.length === 0) return 0;

  const deleted = await new Promise<boolean>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const id of orphanIds) store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
  if (!deleted) return 0;
  for (const id of orphanIds) forgetInMemory(id);
  return orphanIds.length;
}

function isQuotaError(error: Error | null): boolean {
  return Boolean(error && /quota|space|storage full|disk full|not enough storage/i.test(
    `${error.name} ${error.message}`
  ));
}

async function storageFailureMessage(fileSize: number, reclaimed: number): Promise<string> {
  let capacity = "";
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.quota && typeof estimate.usage === "number") {
      const usedMb = Math.round(estimate.usage / (1024 * 1024));
      const quotaMb = Math.round(estimate.quota / (1024 * 1024));
      const fileMb = Math.max(1, Math.round(fileSize / (1024 * 1024)));
      capacity = ` This site is using about ${usedMb} MB of its ${quotaMb} MB allowance; this video needs ${fileMb} MB.`;
    }
  } catch {}
  const reclaimedText = reclaimed > 0
    ? ` ${reclaimed} unused saved video${reclaimed === 1 ? " was" : "s were"} cleared automatically, but there is still not enough room.`
    : "";
  return `The upload could not be saved because browser storage is full.${reclaimedText}${capacity} Remove old projects/site data or choose a smaller file, then try again.`;
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
export async function addCustomVideo(
  file: File,
  options: AddCustomVideoOptions = {}
): Promise<CustomVideoClip> {
  if (!browserHasIdb()) {
    throw new CustomVideoError("This browser cannot store uploads. Try a normal (non-private) window.");
  }
  // Shared classification (media-file.ts): MP4, MOV and WebM lead, and a
  // file whose OS reported no/generic MIME type is recognised by its
  // extension and re-typed so the browser will decode it.
  let classified;
  try {
    classified = assertMediaFile(file, ["video"]);
  } catch (err: any) {
    throw new CustomVideoError(err?.message || "That file is not a supported video.");
  }
  const uploadFile = classified.file;
  if (file.size > MAX_CUSTOM_VIDEO_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024));
    throw new CustomVideoError(`"${file.name}" is ${mb} MB. Keep uploads under 500 MB.`);
  }

  const id = `cv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  let measured: { duration: number; width: number; height: number };
  try {
    measured = await probeVideoFile(uploadFile);
  } catch (err: any) {
    throw new CustomVideoError(err?.message || "That file could not be read as video.");
  }
  if (measured.duration <= 0) {
    throw new CustomVideoError("That file has no playable video in it.");
  }
  if (!measured.width || !measured.height) {
    throw new CustomVideoError("That file has no picture in it — it may be an audio-only file in a video container.");
  }

  const record: CustomVideoRecord = {
    id,
    name: prettyName(file.name),
    mime: classified.mimeType,
    size: file.size,
    duration: measured.duration,
    width: measured.width,
    height: measured.height,
    addedAt: Date.now(),
    blob: uploadFile,
  };

  const db = await openDb();
  if (!db) {
    throw new CustomVideoError("Storage is unavailable, so the upload could not be saved.");
  }

  const requestedReplaceIds = [...new Set(
    (options.replaceIds || []).filter((candidate) => candidate && candidate !== id)
  )];
  const referenceCounts = videoReferenceCounts();
  // A duplicated scene/project can legitimately share one stored Blob. Only
  // reclaim the predecessor when this is its sole saved reference (or when it
  // has not been persisted yet); otherwise the other project keeps its file.
  const replaceIds = referenceCounts
    ? requestedReplaceIds.filter((candidate) => (referenceCounts.get(candidate) || 0) <= 1)
    : [];
  let result = await storeVideoRecord(db, record, replaceIds);
  let reclaimed = 0;

  // Repeated previews can leave large, unreachable Blobs behind. On a real
  // quota failure, clear only uploads that no project references, then retry
  // exactly once. Replacements stay protected until the atomic retry commits,
  // so a failed new upload never destroys the currently attached footage.
  if (!result.ok && isQuotaError(result.error)) {
    reclaimed = await pruneOrphanedVideos(db, new Set(replaceIds));
    if (reclaimed > 0) result = await storeVideoRecord(db, record, replaceIds);
  }

  if (!result.ok) {
    if (isQuotaError(result.error)) {
      throw new CustomVideoError(await storageFailureMessage(file.size, reclaimed));
    }
    throw new CustomVideoError(
      `The upload could not be saved in browser storage. (${result.error?.message || "storage write failed"})`
    );
  }

  for (const replacedId of replaceIds) forgetInMemory(replacedId);
  objectUrls.set(id, URL.createObjectURL(uploadFile));
  createdThisSession.add(id);
  clips.push(stripBlob(record));
  loaded = true;
  return stripBlob(record);
}

export async function removeCustomVideo(id: string): Promise<void> {
  forgetInMemory(id);

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
