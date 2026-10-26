/**
 * One membership, one workspace, every device.
 *
 * The studio is offline-first: every project, scene, choice and draft is
 * written to localStorage synchronously, exactly as before, so nothing about
 * editing becomes a network round trip. This module is the background
 * conversation that makes those same keys exist on the member's other
 * machines.
 *
 * How it behaves:
 *
 *  • Writes are noticed by wrapping `localStorage.setItem`/`removeItem` once.
 *    A touched key is marked dirty and a push is scheduled shortly after
 *    (debounced), so a burst of typing becomes one small request.
 *  • A push sends each dirty document with the revision it last saw. The
 *    server refuses a write that would overwrite someone else's newer one and
 *    hands back what it holds instead (a conflict).
 *  • A pull fetches the whole workspace and applies anything newer than this
 *    device has seen, through the *unpatched* setter, so applying remote work
 *    never marks it dirty again.
 *  • Collections (the project list and the scene list) are merged item by
 *    item on a conflict, so a project created on a laptop and a project
 *    created on a phone both survive. A single document (a script, settings)
 *    is last-writer-wins — the person edited it on the device in front of
 *    them, and that is the version they meant.
 *  • Deletions are tombstones on the server, so a device that was offline
 *    while something was deleted does not resurrect it.
 *
 * Nothing here is a security boundary. The server decides what a plan may do
 * and which devices may be signed in; this module only moves the member's own
 * work around.
 */
import {
  MAX_SYNC_DOCUMENT_BYTES,
  MERGED_COLLECTION_KEYS,
  isLocalOnlyKey,
  isSyncedWorkspaceKey,
} from "./workspace-keys";

const STATE_KEY = "scenering_sync_state_v1";
const OWNER_KEY = "scenering_sync_owner";
const PUSH_DELAY_MS = 1200;
// The poll only exists to notice changes made on ANOTHER device; this
// device's own edits already push within ~1 s (PUSH_DELAY_MS) and returning
// to the tab syncs immediately (focus/visibilitychange below). It used to
// run every 25 s, which cost ~144 Worker requests per hour for every open
// studio tab — idle tabs included. Five minutes keeps cross-device changes
// feeling prompt while cutting that idle traffic by ~95%.
const POLL_INTERVAL_MS = 300_000;
const UPDATE_EVENT = "scenering:workspace-updated";

type SyncState = {
  /** Last revision this device has seen per key. Absent means "never seen". */
  revisions: Record<string, number>;
  /** Keys with local changes not yet accepted by the server. */
  dirty: Record<string, true>;
  /** Keys deleted locally, waiting to be deleted on the server. */
  removed: Record<string, true>;
};

type RemoteDocument = { key: string; body: string; revision: number; updatedAt: string; deleted: boolean };

let installed = false;
let enabled = false;
let account: string | null = null;
let pushing: Promise<void> | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let nativeSetItem: ((key: string, value: string) => void) | null = null;
let nativeRemoveItem: ((key: string) => void) | null = null;
let lastError: string | null = null;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function stateKey(): string {
  return `${STATE_KEY}:${account || "anonymous"}`;
}

function readState(): SyncState {
  const store = storage();
  if (!store) return { revisions: {}, dirty: {}, removed: {} };
  try {
    const parsed = JSON.parse(store.getItem(stateKey()) || "{}");
    return {
      revisions: parsed && typeof parsed.revisions === "object" && parsed.revisions ? parsed.revisions : {},
      dirty: parsed && typeof parsed.dirty === "object" && parsed.dirty ? parsed.dirty : {},
      removed: parsed && typeof parsed.removed === "object" && parsed.removed ? parsed.removed : {},
    };
  } catch {
    return { revisions: {}, dirty: {}, removed: {} };
  }
}

function writeState(state: SyncState) {
  const store = storage();
  if (!store || !nativeSetItem) return;
  try {
    nativeSetItem.call(store, stateKey(), JSON.stringify(state));
  } catch {
    // Bookkeeping is disposable; the next sync rebuilds it from the server.
  }
}

function parseList(raw: string | null): any[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Merge two collections of records by id. The same record on both sides is
 * resolved by its own `updated_at` when both carry one, otherwise the local
 * copy is kept — it is the one the person can see.
 */
export function mergeCollections(localRaw: string, remoteRaw: string, idField: string): string {
  const local = parseList(localRaw);
  const remote = parseList(remoteRaw);
  const byId = new Map<string, any>();
  for (const item of remote) {
    if (item && item[idField] != null) byId.set(String(item[idField]), item);
  }
  for (const item of local) {
    if (!item || item[idField] == null) continue;
    const id = String(item[idField]);
    const other = byId.get(id);
    if (!other) {
      byId.set(id, item);
      continue;
    }
    const localTime = String(item.updated_at || "");
    const remoteTime = String(other.updated_at || "");
    if (remoteTime && localTime && remoteTime > localTime) continue; // remote is newer
    byId.set(id, item);
  }
  return JSON.stringify([...byId.values()]);
}

function markDirty(key: string) {
  if (!enabled || !isSyncedWorkspaceKey(key)) return;
  const state = readState();
  state.dirty[key] = true;
  delete state.removed[key];
  writeState(state);
  schedulePush();
}

function markRemoved(key: string) {
  if (!enabled || !isSyncedWorkspaceKey(key)) return;
  const state = readState();
  state.removed[key] = true;
  delete state.dirty[key];
  writeState(state);
  schedulePush();
}

/** Wrap storage once, so any write anywhere in the studio is noticed. */
function installInterceptor() {
  if (installed || typeof window === "undefined") return;
  const proto = window.Storage && window.Storage.prototype;
  if (!proto) return;
  installed = true;
  nativeSetItem = proto.setItem;
  nativeRemoveItem = proto.removeItem;
  proto.setItem = function patchedSetItem(this: Storage, key: string, value: string) {
    nativeSetItem!.call(this, key, value);
    if (this === window.localStorage) markDirty(String(key));
  };
  proto.removeItem = function patchedRemoveItem(this: Storage, key: string) {
    nativeRemoveItem!.call(this, String(key));
    if (this === window.localStorage) markRemoved(String(key));
  };
  // Another tab on this machine editing the same keys should push too.
  window.addEventListener("storage", (event) => {
    const key = String(event.key || "");
    if (!key || !isSyncedWorkspaceKey(key)) return;
    markDirty(key);
  });
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void syncNow();
  }, PUSH_DELAY_MS);
}

async function api(path: string, init?: RequestInit): Promise<any> {
  const response = await fetch(path, { credentials: "same-origin", ...init });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}

/** Apply a document from the server without marking it dirty in return. */
function applyRemoteDocument(doc: RemoteDocument) {
  const store = storage();
  if (!store || !nativeSetItem || !nativeRemoveItem) return;
  try {
    if (doc.deleted) nativeRemoveItem.call(store, doc.key);
    else nativeSetItem.call(store, doc.key, doc.body);
  } catch {
    // Storage full: keep the server copy for the next pass.
    return;
  }
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: { key: doc.key } }));
}

async function pushDirty(): Promise<void> {
  const state = readState();
  const keys = [...new Set([...Object.keys(state.dirty), ...Object.keys(state.removed)])];
  if (keys.length === 0) return;
  const store = storage();
  if (!store) return;

  const documents: Array<{ key: string; body?: string; deleted?: boolean; baseRevision: number }> = [];
  const sentBodies = new Map<string, string>();
  for (const key of keys) {
    if (isLocalOnlyKey(key) || !isSyncedWorkspaceKey(key)) {
      delete state.dirty[key];
      delete state.removed[key];
      continue;
    }
    const baseRevision = state.revisions[key] ?? 0;
    if (state.removed[key]) {
      documents.push({ key, deleted: true, baseRevision });
      continue;
    }
    const body = store.getItem(key);
    if (body == null) {
      delete state.dirty[key];
      continue;
    }
    if (body.length > MAX_SYNC_DOCUMENT_BYTES) {
      // Too large to carry (an embedded image, say). It stays on this device;
      // dropping the dirty flag stops a retry loop that can never succeed.
      delete state.dirty[key];
      continue;
    }
    documents.push({ key, body, baseRevision });
    sentBodies.set(key, body);
  }
  writeState(state);
  if (documents.length === 0) return;

  const { ok, data } = await api("/api/workspace/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documents }),
  });
  if (!ok || !data) return;

  const next = readState();
  for (const accepted of (data.accepted || []) as Array<{ key: string; revision: number }>) {
    next.revisions[accepted.key] = accepted.revision;
    delete next.dirty[accepted.key];
    delete next.removed[accepted.key];
    // Typing continued while the request was in flight: that newer text is
    // still unsent, so keep the key dirty rather than lose the difference.
    const sent = sentBodies.get(accepted.key);
    if (sent !== undefined && storage()?.getItem(accepted.key) !== sent) next.dirty[accepted.key] = true;
  }
  // Conflicts: the server kept its copy. Merge collections so neither side
  // loses a project, and take the server's version of a single document only
  // when this device has nothing pending.
  for (const conflict of (data.conflicts || []) as Array<{ key: string; document: RemoteDocument | null }>) {
    const doc = conflict.document;
    if (!doc) continue;
    const merge = MERGED_COLLECTION_KEYS[conflict.key];
    if (merge) {
      const localRaw = storage()?.getItem(conflict.key) ?? "[]";
      const merged = mergeCollections(localRaw, doc.body, merge.idField);
      if (merged !== localRaw) {
        const store2 = storage();
        if (store2 && nativeSetItem) nativeSetItem.call(store2, conflict.key, merged);
        next.revisions[conflict.key] = doc.revision;
        next.dirty[conflict.key] = true;
        continue;
      }
    }
    next.revisions[conflict.key] = doc.revision;
    delete next.dirty[conflict.key];
    delete next.removed[conflict.key];
    applyRemoteDocument(doc);
  }
  writeState(next);
}

async function pull(): Promise<void> {
  const { ok, status, data } = await api("/api/workspace");
  if (!ok || !data) {
    if (status === 401) stopWorkspaceSync();
    lastError = status === 401 ? null : "sync-unavailable";
    return;
  }
  lastError = null;
  const state = readState();
  for (const doc of (data.documents || []) as RemoteDocument[]) {
    if (!isSyncedWorkspaceKey(doc.key) || isLocalOnlyKey(doc.key)) continue;
    const seen = state.revisions[doc.key];
    if (seen !== undefined && seen >= doc.revision) continue;
    const local = storage()?.getItem(doc.key) ?? null;
    if (state.dirty[doc.key] || state.removed[doc.key]) {
      // Local work is ahead of what we have sent. Leave it for the push.
      continue;
    }
    if (doc.deleted) {
      if (local != null) applyRemoteDocument(doc);
    } else if (local !== doc.body) {
      applyRemoteDocument(doc);
    }
    state.revisions[doc.key] = doc.revision;
  }
  writeState(state);
}

/** Push local changes, then take anything new from the other devices. */
export async function syncNow(): Promise<void> {
  if (!enabled || pushing) return pushing ?? undefined;
  pushing = (async () => {
    try {
      await pushDirty();
      await pull();
    } catch {
      lastError = "sync-unavailable";
    } finally {
      pushing = null;
    }
  })();
  return pushing;
}

export function workspaceSyncStatus() {
  const state = readState();
  return { enabled, pending: Object.keys(state.dirty).length + Object.keys(state.removed).length, error: lastError };
}

/**
 * Point sync at an account. Switching accounts on one computer must not carry
 * the previous member's projects across, so the shared workspace keys are
 * cleared first: the old account's work lives on the server and comes back
 * when they sign in on any device.
 */
function adoptAccount(userId: string) {
  installInterceptor();
  if (!userId) return false;
  const store = storage();
  if (!store) return false;
  const previous = store.getItem(OWNER_KEY) || "";
  const changedAccount = Boolean(previous) && previous !== userId;
  account = userId;
  if (!previous) {
    try { nativeSetItem?.call(store, OWNER_KEY, userId); } catch { /* ignore */ }
    return false;
  }
  if (!changedAccount) return false;
  for (let index = store.length - 1; index >= 0; index -= 1) {
    const key = store.key(index);
    if (!key || !isSyncedWorkspaceKey(key) || isLocalOnlyKey(key)) continue;
    try { nativeRemoveItem?.call(store, key); } catch { /* ignore */ }
  }
  try { nativeSetItem?.call(store, OWNER_KEY, userId); } catch { /* ignore */ }
  return true;
}

/** Start the conversation. Safe to call repeatedly. */
export function startWorkspaceSync(userId?: string) {
  installInterceptor();
  if (typeof window === "undefined") return;
  if (userId) adoptAccount(userId);
  enabled = true;
  void syncNow();
  if (!pollTimer) pollTimer = setInterval(() => {
    // A hidden tab has nobody to show another device's changes to, and the
    // visibilitychange wake below syncs the moment it comes back.
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    void syncNow();
  }, POLL_INTERVAL_MS);
  if (!(window as any).__sceneringWorkspaceListeners) {
    (window as any).__sceneringWorkspaceListeners = true;
    const wake = () => { if (document.visibilityState !== "hidden") void syncNow(); };
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
  }
}

export function stopWorkspaceSync() {
  enabled = false;
  account = null;
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
}

export const WORKSPACE_UPDATED_EVENT = UPDATE_EVENT;

/**
 * Adopt whatever the server holds for this account, keeping this device's own
 * work. Used at sign-in: the first device to sync uploads the projects it
 * already had, and a new device immediately receives them.
 */
export async function adoptWorkspace(userId?: string): Promise<void> {
  installInterceptor();
  if (userId) adoptAccount(userId);
  enabled = true;
  // Everything currently in the browser counts as local work worth keeping,
  // so push it once before pulling — an existing account's projects must not
  // be invisible just because they predate the repository.
  const store = storage();
  if (store) {
    const state = readState();
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (!key || !isSyncedWorkspaceKey(key) || isLocalOnlyKey(key)) continue;
      if (state.revisions[key] !== undefined) continue;
      state.dirty[key] = true;
    }
    writeState(state);
  }
  await syncNow();
}
