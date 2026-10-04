/**
 * Your own photo, used as a scene's picture.
 *
 * Every scene can take an image from a search, from the nature library — or
 * straight off the creator's own disk. That last case has the same two rules
 * as the video uploads in `custom-video.ts`, and for the same reason:
 *
 * 1. **An upload has to survive a reload.** The file is kept as a Blob in
 *    IndexedDB. A bare `blob:` object URL dies with the page, so a project
 *    that stored one would open to an empty scene the next day.
 * 2. **The scene stores a stable address.** `scene.image_url` holds
 *    `custom-image:<id>`, and everything that draws a scene picture resolves
 *    it at the moment of use — `resolveImageUrl()` here, called from
 *    `scene-image-loader.ts` (the canvas/render path) and from the one
 *    direct `<img>` in the timeline.
 *
 * Its own IndexedDB database again, separate from the music and video
 * stores: two modules opening one database at different versions race each
 * other, and a failed upgrade would take the others down with it.
 */

const DB_NAME = "scenering-image";
const DB_VERSION = 1;
const STORE = "custom-image";

/** Address written into `scene.image_url`; resolved at draw time. */
export const CUSTOM_IMAGE_PREFIX = "custom-image:";

/**
 * A photo is decoded into memory for every frame it appears in. 40 MB is far
 * past any camera JPEG or screenshot and still small enough that a handful of
 * them will not take the tab down.
 */
export const MAX_CUSTOM_IMAGE_BYTES = 40 * 1024 * 1024; // 40 MB

export interface CustomImageAsset {
  id: string;
  name: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  addedAt: number;
}

interface CustomImageRecord extends CustomImageAsset {
  blob: Blob;
}

/** id -> live object URL for this page load. */
const objectUrls = new Map<string, string>();
let assets: CustomImageAsset[] = [];
let loaded = false;
let loadPromise: Promise<CustomImageAsset[]> | null = null;

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

function stripBlob(record: CustomImageRecord): CustomImageAsset {
  const { blob: _blob, ...rest } = record;
  return rest;
}

/**
 * Reads every stored upload and mints an object URL for each. Safe to call
 * repeatedly; the work happens once per page load. The app calls this on
 * start-up so a saved project's own photos are ready before the first paint.
 */
export async function loadCustomImages(): Promise<CustomImageAsset[]> {
  if (loaded) return [...assets];
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const db = await openDb();
    if (!db) {
      loaded = true;
      return [];
    }
    try {
      const tx = db.transaction(STORE, "readonly");
      const all = await idbRequest<CustomImageRecord[]>(
        tx.objectStore(STORE).getAll() as IDBRequest<CustomImageRecord[]>
      );
      assets = [];
      for (const record of all || []) {
        if (!record?.id || !record.blob) continue;
        try {
          objectUrls.set(record.id, URL.createObjectURL(record.blob));
          assets.push(stripBlob(record));
        } catch {
          /* one unreadable row must not hide the rest */
        }
      }
    } catch {
      assets = [];
    }
    loaded = true;
    return [...assets];
  })();

  return loadPromise;
}

export function isCustomImageUrl(url: string | undefined | null): boolean {
  return typeof url === "string" && url.startsWith(CUSTOM_IMAGE_PREFIX);
}

export function customImageId(url: string): string {
  return url.slice(CUSTOM_IMAGE_PREFIX.length);
}

/**
 * The one function every image consumer calls. A normal http(s), data: or
 * blob: URL passes straight through, so this is safe to put in front of all
 * drawing. Returns null only when an upload has been deleted or storage is
 * unavailable — the caller then falls back the same way it would for a photo
 * that failed to load.
 */
export function resolveImageUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  if (!isCustomImageUrl(url)) return url;
  return objectUrls.get(customImageId(url)) ?? null;
}

export function getCustomImage(url: string | undefined | null): CustomImageAsset | undefined {
  if (!isCustomImageUrl(url)) return undefined;
  const id = customImageId(url!);
  return assets.find((a) => a.id === id);
}

/** Measures the real pixel size; a file the browser cannot decode is rejected. */
function measureImageFile(objectUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const done = (fn: () => void) => {
      img.onload = null;
      img.onerror = null;
      fn();
    };
    img.onload = () =>
      done(() =>
        resolve({
          width: img.naturalWidth || 0,
          height: img.naturalHeight || 0,
        })
      );
    img.onerror = () =>
      done(() =>
        reject(new Error("That file could not be read as an image. Try JPG, PNG or WebP."))
      );
    img.src = objectUrl;
  });
}

function prettyName(filename: string): string {
  const base = filename.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  if (!base) return "My photo";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export class CustomImageError extends Error {}

/**
 * Stores one uploaded photo and returns both its stable address and its
 * measured size — the caller needs the size immediately, to crop the new
 * picture to the scene frame before it is ever shown.
 *
 * Throws CustomImageError with a sentence fit to put on screen.
 */
export async function addCustomImage(
  file: File
): Promise<{ url: string; asset: CustomImageAsset }> {
  if (!browserHasIdb()) {
    throw new CustomImageError("This browser cannot store uploads. Try a normal (non-private) window.");
  }
  const looksLikeImage =
    file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name);
  if (!looksLikeImage) {
    throw new CustomImageError(`"${file.name}" is not an image file. Use JPG, PNG or WebP.`);
  }
  // SVG draws fine but taints a canvas in some browsers, which would break
  // the render rather than this upload — refuse it here, where it can be
  // explained.
  if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) {
    throw new CustomImageError("SVG files cannot be used in a render. Export a PNG or JPG first.");
  }
  if (file.size > MAX_CUSTOM_IMAGE_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024));
    throw new CustomImageError(`"${file.name}" is ${mb} MB. Keep photos under 40 MB.`);
  }

  const id = `ci_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const objectUrl = URL.createObjectURL(file);

  let measured: { width: number; height: number };
  try {
    measured = await measureImageFile(objectUrl);
  } catch (err: any) {
    URL.revokeObjectURL(objectUrl);
    throw new CustomImageError(err?.message || "That file could not be read as an image.");
  }
  if (!measured.width || !measured.height) {
    URL.revokeObjectURL(objectUrl);
    throw new CustomImageError("That file has no picture in it.");
  }

  const record: CustomImageRecord = {
    id,
    name: prettyName(file.name),
    mime: file.type || "image/jpeg",
    size: file.size,
    width: measured.width,
    height: measured.height,
    addedAt: Date.now(),
    blob: file,
  };

  const db = await openDb();
  if (!db) {
    URL.revokeObjectURL(objectUrl);
    throw new CustomImageError("Storage is unavailable, so the upload could not be saved.");
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
    throw new CustomImageError("The upload could not be saved — browser storage may be full.");
  }

  objectUrls.set(id, objectUrl);
  const asset = stripBlob(record);
  assets.push(asset);
  loaded = true;
  return { url: `${CUSTOM_IMAGE_PREFIX}${id}`, asset };
}

export async function removeCustomImage(id: string): Promise<void> {
  const url = objectUrls.get(id);
  if (url) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* already revoked */
    }
    objectUrls.delete(id);
  }
  assets = assets.filter((a) => a.id !== id);

  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
  } catch {
    /* the in-memory list is already correct */
  }
}

/** "1920 × 1080 · 2 MB" for the upload card. */
export function describeImageAsset(asset: CustomImageAsset): string {
  const mb = asset.size / (1024 * 1024);
  const size = mb >= 1 ? `${Math.round(mb)} MB` : `${Math.max(1, Math.round(mb * 1024))} KB`;
  const frame = asset.width && asset.height ? `${asset.width} × ${asset.height} · ` : "";
  return `${frame}${size}`;
}
