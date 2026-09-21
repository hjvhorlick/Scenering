/**
 * Unsaved setup drafts.
 *
 * The setup screen holds the project title and script in local component
 * state. Anything the user types is mirrored here so it survives a re-render,
 * a navigation away and back, or a page reload — the title and script can
 * never silently disappear again.
 *
 * Drafts are keyed per project, with "new" used before a project exists.
 */

export interface SetupDraft {
  title?: string;
  script?: string;
}

export const draftKey = (id?: number | string | null): string =>
  `scenering_setup_draft_${id ?? "new"}`;

export function readDraft(id?: number | string | null): SetupDraft {
  try {
    const raw = localStorage.getItem(draftKey(id));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: SetupDraft = {};
    if (typeof parsed.title === "string") out.title = parsed.title;
    if (typeof parsed.script === "string") out.script = parsed.script;
    return out;
  } catch {
    return {};
  }
}

export function writeDraft(id: number | string | null | undefined, draft: SetupDraft): void {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify(draft));
  } catch {
    // storage full or unavailable — the in-memory state is still correct
  }
}

export function clearDraft(id?: number | string | null): void {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {}
}

/**
 * Works out what the title and script boxes should show.
 *
 * Precedence: an unsaved draft always wins, then the project's saved values,
 * then the scene texts joined back into a script. A draft of "" is a
 * deliberate clear by the user and is respected — only `undefined` means
 * "no draft".
 */
export function resolveSetupFields(
  project: { id?: number; title?: string; script?: string } | null | undefined,
  scenes: { project_id?: number; text: string }[],
  draft: SetupDraft
): { title: string; script: string } {
  const title = draft.title !== undefined ? draft.title : project?.title || "";

  let script: string;
  if (draft.script !== undefined) {
    script = draft.script;
  } else if (project?.script && project.script.trim().length > 0) {
    script = project.script;
  } else if (scenes.length > 0 && scenes[0]?.project_id === project?.id) {
    script = scenes.map((s) => s.text).join("\n\n");
  } else {
    script = "";
  }

  return { title, script };
}

/**
 * Should the setup screen reload its fields from the project?
 * Only when the user has actually switched project — never merely because the
 * scenes array or the project object was rewritten by a settings change.
 */
export function shouldReloadFields(
  loadedKey: number | string | null,
  projectId: number | undefined | null
): boolean {
  return loadedKey !== (projectId ?? "new");
}
