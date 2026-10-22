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

import { assertMediaFile, MediaProbeError, probeVideoFile } from "./media-file";
import { convertVideoForBrowser, inspectMediaBlob, unplayableVideoMessage } from "./media-convert";

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
  /** False only when storage failed and the selected File is usable in this tab. */
  persistent?: boolean;
  /** Actionable explanation shown beside a session-only upload. */
  storageWarning?: string;
}

interface CustomVideoRecord extends CustomVideoClip {
  /**
   * The uploaded file. Normally the Blob itself, which IndexedDB keeps in its
   * own file-backed blob store.
   *
   * Chromium writes that store through a journal that fails with
   * `Failed to write blobs (IOError)` on some machines even when the origin's
   * quota is fine, so a failed write is retried once with the same bytes held
   * inline (`bytes`) instead. One of the two is always present.
   */
  blob?: Blob;
  bytes?: ArrayBuffer;
}

/** The bytes of a stored upload, whichever shape this browser accepted. */
function recordBlob(record: CustomVideoRecord): Blob | null {
  if (record.blob) return record.blob;
  if (record.bytes && record.bytes.byteLength > 0) {
    return new Blob([record.bytes], { type: record.mime || "video/mp4" });
  }
  return null;
}

/**
 * Above this size the inline retry is skipped: it holds the whole file in
 * memory twice, which would take a phone tab down rather than save it.
 */
const MAX_INLINE_RETRY_BYTES = 200 * 1024 * 1024;

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
  /** Setup may continue in this tab when a reload-safe copy cannot be written. */
  allowSessionFallback?: boolean;
  /** 0–1 while an unsupported container is being re-wrapped for this browser. */
  onProgress?: (progress: number) => void;
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
  const {
    blob: _blob,
    bytes: _bytes,
    persistent: _persistent,
    storageWarning: _storageWarning,
    ...rest
  } = record;
  return { ...rest, persistent: true };
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

/**
 * Whether the browser refused the write because it has no room to keep the
 * bytes.
 *
 * THE REAL-WORLD FAILURE THIS MUST RECOGNISE: Chromium reports a full (or
 * otherwise unwritable) IndexedDB blob store as
 * `DOMException: Failed to write blobs (IOError)` — a message that contains
 * neither "quota" nor "space". The old check only looked for those words, so
 * the commonest storage failure of all skipped the reclaim-and-retry path and
 * went straight to "storage could not keep a copy", stranding the customer
 * with a message about a problem the app never tried to solve.
 */
export function isStorageCapacityError(error: Error | null): boolean {
  if (!error) return false;
  if (error.name === "QuotaExceededError") return true;
  const text = `${error.name} ${error.message}`;
  if (/quota|storage full|disk full|not enough storage|out of space|no space left/i.test(text)) return true;
  // Chromium, Edge and Android WebViews phrase a failed blob write this way.
  return /failed to write blob|failed to write the blob|ioerror|io error/i.test(text);
}

interface StorageRoom {
  usage: number;
  quota: number;
  free: number;
}

/** The origin's allowance, when the browser will say. */
async function storageRoom(): Promise<StorageRoom | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    const quota = Number(estimate?.quota) || 0;
    const usage = Number(estimate?.usage) || 0;
    if (quota <= 0) return null;
    return { usage, quota, free: Math.max(0, quota - usage) };
  } catch {
    return null;
  }
}

async function storageFailureMessage(
  fileSize: number,
  reclaimed: number,
  sessionOnly: boolean,
  inlineTried = false,
): Promise<string> {
  let capacity = "";
  const room = await storageRoom();
  if (room) {
    const usedMb = Math.round(room.usage / (1024 * 1024));
    const quotaMb = Math.round(room.quota / (1024 * 1024));
    const freeMb = Math.round(room.free / (1024 * 1024));
    const fileMb = Math.max(1, Math.round(fileSize / (1024 * 1024)));
    capacity = ` This site is using about ${usedMb} MB of its ${quotaMb} MB allowance (${freeMb} MB free); this video needs ${fileMb} MB.`;
  }
  const reclaimedText = reclaimed > 0
    ? ` ${reclaimed} unused saved video${reclaimed === 1 ? " was" : "s were"} cleared automatically, but there is still not enough room.`
    : "";
  const attempts = inlineTried
    ? " The browser refused the file both as a blob and as in-line data, so this is space rather than a browser quirk."
    : "";
  const advice = sessionOnly
    ? " The video is loaded for this tab, so you can continue now, but keep this tab open and download your finished work before closing it. To keep the upload after a refresh, free some space or choose a smaller file and upload it again."
    : " Free some space, or choose a smaller file and upload it again.";
  const remedies =
    " Space is shared by finished renders in the Vault, earlier uploads and the site's other data;" +
    " if the allowance above still looks generous, the device itself may be low on disk space." +
    " A private window has a much smaller allowance, so a normal window may also help.";
  return `Browser storage could not keep a reload-safe copy of this video.${reclaimedText}${capacity}${attempts}${advice}${remedies}`;
}

let sessionWarningInstalled = false;

/** Keep work moving when persistence is unavailable without pretending it survived. */
function keepVideoForCurrentTab(
  record: CustomVideoRecord,
  warning: string,
  replaceIds: readonly string[] = []
): CustomVideoClip {
  // Replacing one session-only choice is safe and prevents retries from
  // retaining every rejected large File in memory. Persisted predecessors stay.
  for (const id of replaceIds) {
    if (clips.find((candidate) => candidate.id === id)?.persistent === false) {
      forgetInMemory(id);
    }
  }
  const clip: CustomVideoClip = {
    ...stripBlob(record),
    persistent: false,
    storageWarning: warning,
  };
  const kept = recordBlob(record);
  if (kept) objectUrls.set(record.id, URL.createObjectURL(kept));
  createdThisSession.add(record.id);
  clips.push(clip);
  loaded = true;

  if (!sessionWarningInstalled && typeof window !== "undefined") {
    sessionWarningInstalled = true;
    window.addEventListener("beforeunload", (event) => {
      if (!clips.some((candidate) => candidate.persistent === false)) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }
  return clip;
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
      const currentTabClips = clips.filter((clip) => createdThisSession.has(clip.id));
      clips = currentTabClips;
      for (const record of all || []) {
        if (!record?.id || !record.blob || createdThisSession.has(record.id)) continue;
        try {
          const kept = recordBlob(record);
  if (kept) objectUrls.set(record.id, URL.createObjectURL(kept));
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
  // Shared classification (media-file.ts): MP4, MOV and WebM lead, and a
  // file whose OS reported no/generic MIME type is recognised by its
  // extension and re-typed so the browser will decode it. Matroska and
  // MPEG-TS are on that list too — they are re-wrapped below.
  let classified;
  try {
    classified = assertMediaFile(file, ["video"]);
  } catch (err: any) {
    throw new CustomVideoError(err?.message || "That file is not a supported video.");
  }
  if (file.size > MAX_CUSTOM_VIDEO_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024));
    throw new CustomVideoError(`"${file.name}" is ${mb} MB. Keep uploads under 500 MB.`);
  }

  const id = `cv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  /**
   * The file that actually gets stored.
   *
   * A container the `<video>` element cannot open (Matroska, MPEG-TS) or a
   * codec it cannot find a decoder for is not automatically the customer's
   * problem: if this browser can decode the picture, mediabunny re-wraps it
   * as MP4 (or WebM) and the upload proceeds. Only when that is impossible
   * here does the refusal stand — and then it names the codec instead of
   * pretending the whole format is unsupported.
   */
  let uploadFile: File = classified.file;
  let uploadMime = classified.mimeType;
  let measured: { duration: number; width: number; height: number };
  try {
    measured = await probeVideoFile(uploadFile);
  } catch (err: any) {
    const unsupported = err instanceof MediaProbeError && err.reason === "unsupported";
    const converted = unsupported
      ? await convertVideoForBrowser(uploadFile, file.name, { onProgress: options.onProgress })
      : null;
    if (!converted) {
      if (unsupported) {
        const inspection = await inspectMediaBlob(uploadFile).catch(() => null);
        throw new CustomVideoError(inspection ? unplayableVideoMessage(inspection) : err?.message || "That file could not be read as video.");
      }
      throw new CustomVideoError(err?.message || "That file could not be read as video.");
    }
    uploadFile = converted;
    uploadMime = converted.type || "video/mp4";
    try {
      measured = await probeVideoFile(uploadFile);
    } catch (again: any) {
      throw new CustomVideoError(again?.message || "That video could not be read after converting it.");
    }
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
    mime: uploadMime,
    size: uploadFile.size,
    duration: measured.duration,
    width: measured.width,
    height: measured.height,
    addedAt: Date.now(),
    blob: uploadFile,
  };

  const db = await openDb();
  if (!db) {
    const warning = `Video storage recovery: ${await storageFailureMessage(uploadFile.size, 0, Boolean(options.allowSessionFallback))}`;
    if (options.allowSessionFallback) {
      return keepVideoForCurrentTab(record, warning, options.replaceIds || []);
    }
    throw new CustomVideoError(warning);
  }

  const requestedReplaceIds = [...new Set(
    (options.replaceIds || []).filter((candidate) => candidate && candidate !== id)
  )];
  const referenceCounts = videoReferenceCounts();
  // A duplicated scene/project can legitimately share one stored Blob. Only
  // reclaim the predecessor when this is its sole saved reference (or when
  // it has not been persisted yet); otherwise the other project keeps its file.
  const replaceIds = referenceCounts
    ? requestedReplaceIds.filter((candidate) => (referenceCounts.get(candidate) || 0) <= 1)
    : [];
  let reclaimed = 0;

  // Repeated previews and replaced clips leave large, unreachable Blobs
  // behind. When the browser already says the allowance is tight, clear the
  // ones no project references BEFORE attempting the write: recovering from a
  // failed write is slower, and Chromium reports it as
  // "Failed to write blobs (IOError)" with no mention of quota at all.
  const room = await storageRoom();
  if (room && room.free < uploadFile.size * 1.05) {
    reclaimed = await pruneOrphanedVideos(db, new Set(replaceIds));
  }

  let result = await storeVideoRecord(db, record, replaceIds);

  // Clear only uploads that no project references, then retry exactly once.
  // Replacements stay protected until the atomic retry commits, so a failed
  // new upload never destroys the currently attached footage.
  if (!result.ok && isStorageCapacityError(result.error)) {
    reclaimed += await pruneOrphanedVideos(db, new Set(replaceIds));
    result = await storeVideoRecord(db, record, replaceIds);
  }

  // Still refused, with room apparently available: this is Chromium's
  // blob-store journal failing (`Failed to write blobs (IOError)`) rather than
  // the origin's allowance running out. The same bytes go in inline instead,
  // which skips the blob journal entirely — so a clip that would otherwise be
  // lost to a browser quirk is still here tomorrow.
  let inlineTried = false;
  if (
    !result.ok &&
    isStorageCapacityError(result.error) &&
    uploadFile.size > 0 &&
    uploadFile.size <= MAX_INLINE_RETRY_BYTES
  ) {
    inlineTried = true;
    try {
      const bytes = await uploadFile.arrayBuffer();
      result = await storeVideoRecord(db, { ...record, blob: undefined, bytes }, replaceIds);
    } catch {
      /* out of memory for the copy; the Blob attempt's failure stands */
    }
  }

  if (!result.ok) {
    // The sentence depends on whether the caller will actually keep the file
    // for this tab. The old text promised that fallback unconditionally, and
    // then threw when the caller had not asked for it — telling the customer
    // the video was loaded when it was not.
    const warning =
      (isStorageCapacityError(result.error)
        ? await storageFailureMessage(uploadFile.size, reclaimed, Boolean(options.allowSessionFallback), inlineTried)
        : `Browser storage could not keep a reload-safe copy of this video (${result.error?.message || "storage write failed"}).`) +
      (options.allowSessionFallback
        ? " The video is loaded for this tab, so you can continue now, but keep this tab open and download your finished work before closing it."
        : " Try again, or choose a smaller file.");
    const identifiedWarning = `Video storage recovery: ${warning}`;
    if (options.allowSessionFallback) {
      return keepVideoForCurrentTab(record, identifiedWarning, requestedReplaceIds);
    }
    throw new CustomVideoError(identifiedWarning);
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
