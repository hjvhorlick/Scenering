/**
 * The Vault — temporary storage for finished renders.
 *
 * When a render finishes, the video is put in the vault so it is never lost
 * when the user walks away from the render screen, switches phase, or reloads
 * the page.
 *
 * TWO NUMBERS, ON PURPOSE:
 *
 *  - `MAX_VAULT_RENDERS = 3` is the DESIGNER'S RULE and the only number a
 *    customer ever sees. Three slots. The oldest render is dropped when a
 *    fourth arrives, and a render leaves the vault as soon as it has been
 *    downloaded (or deleted by hand).
 *  - `VAULT_CAPACITY_RENDERS = 5` is the capacity this module is ENGINEERED
 *    AND TESTED FOR, not an allowance. The design was proven at five before
 *    the rule was tightened to three, so every piece of machinery here is
 *    deliberately sized for five: deadlines that fit a fifteen-minute file,
 *    freeing a slot before the next write, and pruning that is correct even
 *    if a vault somehow already holds five (an older build, a restored
 *    browser profile, a tab from before an update). Nothing in this file may
 *    assume three; it may assume five.
 *
 * Either way the vault has to work for the longest video the engine was built
 * for — fifteen minutes — and two consequences follow:
 *
 *  - The oldest slot is freed BEFORE the new file is written, not after. The
 *    difference is the whole size of the new video: the disk never has to hold
 *    one render more than its capacity.
 *  - Every deadline scales with the file. Copying a 1–4 GB Blob into
 *    IndexedDB is a disk write, not an instant commit; a fixed timeout would
 *    abandon exactly the long renders this product promises to keep.
 *
 * Storage: IndexedDB (blobs are far too large for localStorage). If the
 * browser has no IndexedDB — or the page is running somewhere that blocks it —
 * the vault transparently falls back to memory for the current page life so
 * the feature still behaves the same way, minus the reload survival.
 */

/** The designer's rule: how many finished videos a customer may keep. */
export const MAX_VAULT_RENDERS = 3;

/**
 * The capacity this Vault is engineered and tested for — a safety envelope,
 * NOT a customer allowance. Written deliberately larger than the rule so a
 * vault holding more than the rule still behaves correctly (pruned, readable,
 * downloadable) rather than corrupting or losing rows.
 */
export const VAULT_CAPACITY_RENDERS = 5;

/**
 * The storage the Vault must be able to occupy at its engineered capacity,
 * given the largest video it is asked to hold.
 *
 * Used by the storage checks and the tests, never to refuse a render that the
 * three-slot rule would allow.
 */
export function vaultCapacityBytes(largestRenderBytes: number): number {
  const bytes = Math.max(0, Number(largestRenderBytes) || 0);
  return Math.round(bytes * VAULT_CAPACITY_RENDERS);
}

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
  /** Where this exact Blob was verified after save. */
  storageKind?: "indexeddb" | "memory";
  /** Provenance: which project produced this render, and the server's export
   *  reservation for it. A Vault download reports these so the server can
   *  count the duration and format it recorded when the render was
   *  authorised, rather than a number retyped by the browser later. */
  projectId?: string | number | null;
  reservationId?: string | null;
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

/**
 * How long a Vault database request may stay unanswered.
 *
 * IndexedDB is the one part of the Vault that lives entirely inside the
 * browser's own storage service. When that service is out of disk — or busy
 * because the finished render is still being read off OPFS — a `put` of a
 * several-hundred-megabyte Blob can simply never call its callbacks. Before
 * this deadline the render screen waited on it for ever at 99%: cancel did
 * nothing, no error was raised, and the finished video was never handed to
 * the creator. Timing out here turns that into "the Vault could not verify a
 * copy — download this video now", which the render screen already says.
 */
const DB_OPEN_TIMEOUT_MS = 15_000;
const DB_REQUEST_TIMEOUT_MS = 90_000;
/** Floor for a request whose cost does not depend on the size of a video. */
export const VAULT_BASE_REQUEST_TIMEOUT_MS = 60_000;
/**
 * Slowest write speed a Vault commit is expected to survive, in bytes/second
 * (8 MB/s). A fifteen-minute 4K render is roughly 3.8 GB, so the commit gets
 * about eight minutes — generous on purpose: the deadline exists to catch a
 * storage service that has stopped answering, never to abandon a slow disk
 * that is still working.
 */
export const VAULT_MIN_WRITE_BYTES_PER_SECOND = 8 * 1024 * 1024;
/** No single Vault request may wait longer than this, however large the file. */
export const VAULT_MAX_REQUEST_TIMEOUT_MS = 20 * 60 * 1000;

/**
 * How long a Vault request for a file of `bytes` may take before it is called
 * wedged. Scales with the file, because committing it is a disk write.
 */
export function vaultRequestTimeoutMs(bytes: number): number {
  const size = Math.max(0, Number(bytes) || 0);
  const writeMs = (size / VAULT_MIN_WRITE_BYTES_PER_SECOND) * 1000;
  const timeout = VAULT_BASE_REQUEST_TIMEOUT_MS + writeMs;
  return Math.round(Math.min(VAULT_MAX_REQUEST_TIMEOUT_MS, Math.max(DB_REQUEST_TIMEOUT_MS, timeout)));
}

function openDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let settled = false;
    const finish = (db: IDBDatabase | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(db);
    };
    const timer = setTimeout(() => {
      dbPromise = null; // let a later attempt try again
      finish(null);
    }, DB_OPEN_TIMEOUT_MS);
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // A newer deploy opening the database must not be blocked by a tab
        // that is sitting on an old connection: close ours and let the next
        // request re-open it.
        db.onversionchange = () => {
          try {
            db.close();
          } catch {}
          dbPromise = null;
        };
        finish(db);
      };
      req.onerror = () => finish(null);
      req.onblocked = () => finish(null);
    } catch {
      finish(null);
    }
  });
  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
  timeoutMs = DB_REQUEST_TIMEOUT_MS,
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
          let result: T | null = null;
          let settled = false;
          const timer = setTimeout(() => finish(null, true), Math.max(1, timeoutMs));
          const finish = (value: T | null, abort = false) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (abort) {
              // A transaction that never completed is rolled back rather than
              // left holding a write lock on the store for the page's life.
              try {
                t.abort();
              } catch {}
            }
            resolve(value);
          };
          // A write request can succeed before the transaction later aborts
          // (most importantly on quota exhaustion). Only transaction complete
          // means a long render is actually safe in the Vault.
          req.onsuccess = () => { result = req.result as T; };
          req.onerror = () => finish(null);
          t.oncomplete = () => finish(result);
          t.onerror = () => finish(null);
          t.onabort = () => finish(null);
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
  projectId?: string | number | null;
  reservationId?: string | null;
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
    projectId: input.projectId ?? null,
    reservationId: input.reservationId ?? null,
    blob: input.blob,
  };

  const db = await openDb();
  let saved = entry;
  if (db) {
    const commitTimeout = vaultRequestTimeoutMs(input.blob.size);
    entry.storageKind = "indexeddb";
    // Free the oldest slot FIRST. The finished file is still in the encoder's
    // staging file at this moment, so writing it into a vault that is already
    // full means the disk holds one video more than it has to — on five
    // fifteen-minute renders that is the difference between fitting and
    // failing with a quota error at 99%.
    await pruneVault({ reserve: 1 });
    const key = await tx<IDBValidKey>("readwrite", (store) => store.put(entry), commitTimeout);
    if (key === null) {
      throw new Error("The finished video could not be committed to the Vault (browser storage may be full).");
    }
    // Read it back after transaction completion. This returns the browser's
    // durable Blob clone rather than the OPFS staging File passed in by the
    // encoder, allowing that temporary file to be removed safely.
    const durable = await getVaultRender(entry.id, commitTimeout);
    if (!durable) throw new Error("The finished video could not be verified in the Vault.");
    saved = durable;
  } else {
    entry.storageKind = "memory";
    memoryVault.set(entry.id, entry);
  }

  await pruneVault();
  emit();
  return saved;
}

/** Everything in the vault, newest first. */
export async function listVaultRenders(): Promise<VaultRender[]> {
  const rows = await tx<VaultRender[]>("readonly", (store) => store.getAll() as IDBRequest<VaultRender[]>);
  const all = rows ? rows : Array.from(memoryVault.values());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getVaultRender(id: string, timeoutMs = DB_REQUEST_TIMEOUT_MS): Promise<VaultRender | null> {
  const row = await tx<VaultRender | undefined>(
    "readonly",
    (store) => store.get(id) as IDBRequest<VaultRender | undefined>,
    timeoutMs,
  );
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

/**
 * How many of the oldest rows must go for the vault to hold `reserve` more.
 *
 * Pure, so the arithmetic is pinned by tests without a browser: a vault that
 * somehow holds five is reduced by two (or by three when one of those slots is
 * about to be written), and a vault inside the rule is left alone.
 */
export function vaultSlotsToDrop(count: number, reserve = 0): number {
  const total = Math.max(0, Math.floor(Number(count) || 0));
  const keep = Math.max(0, MAX_VAULT_RENDERS - Math.max(0, Math.floor(reserve)));
  return Math.max(0, total - keep);
}

/**
 * Drops the oldest renders until the vault can hold `reserve` more.
 *
 * `reserve` is the slot the caller is about to write, so the vault is kept at
 * MAX_VAULT_RENDERS *including* the incoming video rather than one over it.
 *
 * It always prunes to the rule, never to the capacity envelope: a vault that
 * arrived holding five (an older build, a restored profile) is brought back to
 * three on its next save, and the newest rows are the ones kept.
 */
async function pruneVault(options: { reserve?: number } = {}): Promise<void> {
  const reserve = Math.max(0, Math.floor(options.reserve ?? 0));
  const rows = await listVaultRenders();
  const drop = vaultSlotsToDrop(rows.length, reserve);
  if (drop === 0) return;
  const stale = rows.slice(rows.length - drop);
  const db = await openDb();
  for (const row of stale) {
    if (db) await tx("readwrite", (store) => store.delete(row.id));
    memoryVault.delete(row.id);
  }
}

/**
 * Brings an over-full vault back to the rule without saving anything.
 *
 * Called when the Vault panel opens, so a customer never sees five finished
 * videos on a screen that promises three — the newest three are kept.
 */
export async function enforceVaultRule(): Promise<number> {
  const before = (await listVaultRenders()).length;
  await pruneVault();
  const after = (await listVaultRenders()).length;
  if (after !== before) emit();
  return Math.max(0, before - after);
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
