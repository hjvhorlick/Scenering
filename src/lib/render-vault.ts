/**
 * The Vault — temporary storage for finished renders.
 *
 * When a render finishes, the video is put in the vault so it is never lost
 * when the user walks away from the render screen, switches phase, or reloads
 * the page. The vault holds only a few videos at a time (slots, see
 * MAX_VAULT_RENDERS); the oldest render is dropped automatically when a new
 * one arrives, and a render leaves the vault as soon as it has been
 * downloaded (or deleted by hand).
 *
 * Storage: IndexedDB (blobs are far too large for localStorage). If the
 * browser has no IndexedDB — or the page is running somewhere that blocks it —
 * the vault transparently falls back to memory for the current page life so
 * the feature still behaves the same way, minus the reload survival.
 */

export const MAX_VAULT_RENDERS = 3;

const DB_NAME = "scenering_vault";
const DB_VERSION = 1;
const STORE = "renders";

export interface VaultRender {
  id: string;
  title: string;
  createdAt: number;
  sizeBytes: number;
  mimeType: string;
  durationSec: number;
  width: number;
  height: number;
  /** human label such as "1080p · 30fps · MP4" */
  label: string;
  blob: Blob;
}

export type VaultListener = () => void;

const listeners = new Set<VaultListener>();

/** Notifies every subscriber that the vault contents changed. */
function emit() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a listener must never break a save */
    }
  });
}

export function subscribeVault(fn: VaultListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ------------------------------------------------------------------ */
/* IndexedDB plumbing (with an in-memory fallback)                     */
/* ------------------------------------------------------------------ */

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memoryVault = new Map<string, VaultRender>();

function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        try {
          const t = db.transaction(STORE, mode);
          const req = run(t.objectStore(STORE));
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => resolve(null);
          t.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );
}

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {}
  return `render_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function formatVaultSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function formatVaultTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export interface SaveRenderInput {
  blob: Blob;
  title: string;
  mimeType: string;
  durationSec: number;
  width: number;
  height: number;
  label: string;
}

/**
 * Stores a finished render and keeps the vault inside its slot limit
 * (oldest render is dropped when the vault is full).
 */
export async function saveRenderToVault(input: SaveRenderInput): Promise<VaultRender> {
  const entry: VaultRender = {
    id: newId(),
    createdAt: Date.now(),
    title: input.title || "Untitled render",
    sizeBytes: input.blob.size,
    mimeType: input.mimeType,
    durationSec: input.durationSec,
    width: input.width,
    height: input.height,
    label: input.label,
    blob: input.blob,
  };

  const db = await openDb();
  if (db) {
    await tx("readwrite", (store) => store.put(entry));
  } else {
    memoryVault.set(entry.id, entry);
  }

  await pruneVault();
  emit();
  return entry;
}

/** Everything in the vault, newest first. */
export async function listVaultRenders(): Promise<VaultRender[]> {
  const rows = await tx<VaultRender[]>("readonly", (store) => store.getAll() as IDBRequest<VaultRender[]>);
  const all = rows ? rows : Array.from(memoryVault.values());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getVaultRender(id: string): Promise<VaultRender | null> {
  const row = await tx<VaultRender | undefined>("readonly", (store) => store.get(id) as IDBRequest<VaultRender | undefined>);
  if (row) return row;
  return memoryVault.get(id) || null;
}

export async function deleteVaultRender(id: string): Promise<void> {
  const db = await openDb();
  if (db) await tx("readwrite", (store) => store.delete(id));
  memoryVault.delete(id);
  emit();
}

export async function clearVault(): Promise<void> {
  const db = await openDb();
  if (db) await tx("readwrite", (store) => store.clear());
  memoryVault.clear();
  emit();
}

export async function vaultCount(): Promise<number> {
  const rows = await listVaultRenders();
  return rows.length;
}

export async function vaultBytes(): Promise<number> {
  const rows = await listVaultRenders();
  return rows.reduce((sum, r) => sum + (r.sizeBytes || 0), 0);
}

/** Drops the oldest renders until only MAX_VAULT_RENDERS remain. */
async function pruneVault(): Promise<void> {
  const rows = await listVaultRenders();
  if (rows.length <= MAX_VAULT_RENDERS) return;
  const stale = rows.slice(MAX_VAULT_RENDERS);
  const db = await openDb();
  for (const row of stale) {
    if (db) await tx("readwrite", (store) => store.delete(row.id));
    memoryVault.delete(row.id);
  }
}

/* ------------------------------------------------------------------ */
/* Saving a blob to the user's disk                                    */
/* ------------------------------------------------------------------ */

export type SaveOutcome = "saved" | "downloaded" | "cancelled" | "failed";

/**
 * Writes a blob to the user's machine.
 *
 * Order matters: the File System Access API (real "Save as…" dialog, and the
 * only path that cannot be silently swallowed when the app runs inside an
 * iframe) is tried first; the classic anchor download is the fallback. The
 * caller decides what to do about the vault based on the outcome.
 */
export async function saveBlobToDisk(blob: Blob, filename: string): Promise<SaveOutcome> {
  const picker = (window as unknown as {
    showSaveFilePicker?: (opts: unknown) => Promise<{
      createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }>;
    }>;
  }).showSaveFilePicker;

  if (typeof picker === "function") {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [
          {
            description: "Video",
            accept: { [blob.type || "video/webm"]: filename.endsWith(".mp4") ? [".mp4"] : [".webm", ".mp4"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name;
      if (name === "AbortError") return "cancelled";
      // SecurityError / NotAllowedError inside a sandboxed iframe → fall through
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke late: some browsers still need the URL while the save is starting.
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }, 60000);
    return "downloaded";
  } catch {
    return "failed";
  }
}
