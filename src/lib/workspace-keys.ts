/**
 * Which browser keys belong to the craft work — and therefore follow the
 * member from machine to machine — and which stay on the machine that made
 * them.
 *
 * This is a registry, not a pattern guess, because the two failure modes are
 * both serious:
 *
 *   • A project key left out of the synced set is silently stranded on one
 *     computer, which is the bug this whole feature exists to fix.
 *   • A secret key pulled into the synced set would be copied to the server
 *     and back down to every device. API keys belong to the person's browser
 *     (they are theirs, and Speechify/stock accounts are theirs too); the
 *     session token identifies the browser and must never be mirrored.
 *
 * `tests/workspace-sync.test.ts` reads every `scenering_*` literal in `src/`
 * and fails if a key is neither synced nor explicitly local-only, so a key
 * added tomorrow cannot quietly take the wrong path.
 */

/** Project and scene content, plus the choices that belong to it. */
export const SYNCED_KEY_PREFIXES = [
  "scenering_projects_v1",
  "scenering_scenes_v1",
  "scenering_project_",           // settings, script, title and older per-project keys
  "scenering_project_settings_",
  "scenering_project_script_",
  "scenering_project_title_",
  "scenering_inserts_",
  "scenering_scene_meta_",
  "scenering_phase_commits_",      // commit history per project (phase-gate.ts)
  "scenering_section_memory_",
  "scenering_setup_draft_",
  "scenering_phonetic_dictionary",
] as const;

/** Deliberately per-device, or a credential. Never leaves this browser. */
export const LOCAL_ONLY_KEY_PREFIXES = [
  "scenering_session",            // the session token, mirrored in session.ts
  "scenering_device_id",          // this browser's identity
  "scenering_device_label",       // …and its name
  "scenering_customer_api_keys",  // the member's own Speechify/stock keys
  "scenering_theme",              // screen preference, not craft work
  "scenering_timeline_expanded",  // the timeline's height, per browser
  "scenering_timeline_zoom",      // …and its zoom level
  "scenering_admin_plan_preview", // owner-only interface preview (sessionStorage)
  "scenering_analytics_queue_v1",
  "scenering_inbox_trusted_senders",
  "scenering_intended_checkout",
  "scenering_intended_access_code",
  "scenering_account_intent",
  "scenering_studio_reloaded",
  "scenering_resume",             // sessionStorage only
  "scenering_sync_state_v1",      // sync bookkeeping
  "scenering_sync_owner",         // which account this browser last synced
] as const;

/**
 * IndexedDB database names (`scenering_vault`, `scenering_voiceovers_store_v1`)
 * share the prefix but are not localStorage keys. They are listed so the
 * registry check recognises them rather than reporting them as unknown.
 */
export const NOT_LOCAL_STORAGE_NAMES = ["scenering_vault", "scenering_voiceovers_store_v1"] as const;

/** The largest document the workspace will carry. Renders and uploaded media
 *  live in IndexedDB/R2; a document bigger than this is a data URL that must
 *  stay on the device that made it. */
export const MAX_SYNC_DOCUMENT_BYTES = 900_000;

export function isSyncedWorkspaceKey(key: string): boolean {
  return SYNCED_KEY_PREFIXES.some((prefix) => key === prefix || key.startsWith(prefix));
}

export function isLocalOnlyKey(key: string): boolean {
  return LOCAL_ONLY_KEY_PREFIXES.some((prefix) => key === prefix || key.startsWith(prefix));
}

/** Keys that hold whole collections; these are merged item by item instead of
 *  overwriting one another, so two devices adding a project both survive. */
export const MERGED_COLLECTION_KEYS: Record<string, { idField: string; parentField?: string }> = {
  scenering_projects_v1: { idField: "id" },
  scenering_scenes_v1: { idField: "id", parentField: "project_id" },
};
