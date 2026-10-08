import type { EditorStep } from "../types";

/**
 * The ordered gate between project sections.
 *
 * The owner's rule (session 01a0c8ed, restated 2026-10-08):
 *
 *   "Section Next must commit that section's effects; going back requires
 *    pressing Next again; later sections stay locked until then."
 *
 * So a project is walked in order. The section you are in is open, everything
 * before it is open (you may go back and adjust), and everything after it is
 * locked. The ONLY way forward is that section's own Next button, and pressing
 * it first commits the section: the project settings are written to their
 * per-project store, the scene rows are flushed to the database, and the
 * commit is recorded so the section can say when it was last committed.
 *
 * Going back is allowed and does not need a commit — but it retracts the gate.
 * Once you are back in Scenes, Voiceover is locked again and Next is the way
 * through, which is exactly what the rule asks for.
 *
 * This module is deliberately free of React and of the database: every rule
 * here is a pure function over the phase list, so it can be pinned by tests.
 */

/**
 * Single source of truth for the project phases.
 * Order matters — the header tabs, the Previous / Next controls and the gate
 * itself are all generated from this list.
 */
export type ProjectPhase = "setup" | "scenes" | "voiceover" | "captions" | "studio" | "render";

export interface ProjectPhaseDef {
  id: ProjectPhase;
  /** Short label used in the header tabs */
  tab: string;
  /** Full phase name used by the Previous / Next buttons */
  phase: string;
  icon: string;
  /** What the user does in this phase — shown as the Next button hint */
  purpose: string;
  /** Editor step to activate (setup is handled by the setup view) */
  editorStep: EditorStep;
}

export const PROJECT_PHASES: ProjectPhaseDef[] = [
  {
    id: "setup",
    tab: "Setup",
    phase: "Project Setup",
    icon: "⚙️",
    purpose: "Choose the project, write the script and set the format",
    editorStep: "scenes",
  },
  {
    id: "scenes",
    tab: "Scenes",
    phase: "Scenes",
    icon: "📝",
    purpose: "Configure each scene's image, filter, motion and caption overlay",
    editorStep: "scenes",
  },
  {
    id: "voiceover",
    tab: "Voiceover",
    phase: "Voiceover",
    icon: "🎙️",
    purpose: "Pick the narrator voice and generate narration audio",
    editorStep: "voiceover",
  },
  {
    id: "captions",
    tab: "Captions",
    phase: "Captions",
    icon: "💬",
    purpose: "Style the on-screen subtitles and burn-in captions",
    editorStep: "captions",
  },
  {
    id: "studio",
    tab: "Studio",
    phase: "Video Studio & Timeline",
    icon: "🎬",
    purpose: "Add intros, music, sound effects, stickers and overlays",
    editorStep: "studio",
  },
  {
    id: "render",
    tab: "Render",
    phase: "Render & Export",
    icon: "🚀",
    purpose: "Render the finished video and download it",
    editorStep: "render",
  },
];

export const getPhase = (id: ProjectPhase): ProjectPhaseDef =>
  PROJECT_PHASES.find((p) => p.id === id) || PROJECT_PHASES[0];

/** Position of a phase in the walk order, or -1 for an unknown id. */
export function phaseIndex(id: ProjectPhase): number {
  return PROJECT_PHASES.findIndex((p) => p.id === id);
}

/** The phase after this one, or null at the end of the walk. */
export function nextPhase(id: ProjectPhase): ProjectPhase | null {
  const index = phaseIndex(id);
  return index >= 0 && index < PROJECT_PHASES.length - 1 ? PROJECT_PHASES[index + 1].id : null;
}

/** The phase before this one, or null at the beginning. */
export function previousPhase(id: ProjectPhase): ProjectPhase | null {
  const index = phaseIndex(id);
  return index > 0 ? PROJECT_PHASES[index - 1].id : null;
}

/**
 * A section is locked while it lies beyond the section you are in.
 *
 * "Beyond" is what makes this a walk rather than a menu: the next section is
 * locked too, until that section's own Next commits the current one.
 */
export function isPhaseLocked(target: ProjectPhase, current: ProjectPhase): boolean {
  const from = phaseIndex(current);
  const to = phaseIndex(target);
  if (from < 0 || to < 0) return true;
  return to > from;
}

/** The editor step a phase lives in. Setup and Scenes share the scenes step. */
export function phaseToStep(id: ProjectPhase): EditorStep {
  return getPhase(id).editorStep;
}

/**
 * Which phase a raw editor step belongs to, given whether the setup frame is
 * open. The scenes step is shared: with the setup frame up it is Project Setup,
 * otherwise it is the Scenes section.
 */
export function stepToPhase(step: EditorStep, isSetupView: boolean): ProjectPhase {
  if (isSetupView) return "setup";
  if (step === "scenes") return "scenes";
  return (PROJECT_PHASES.find((p) => p.editorStep === step && p.id !== "setup")?.id || "scenes") as ProjectPhase;
}

/* ------------------------------------------------------------------ *
 * Commit records
 *
 * The commit itself is performed by the app (it owns the settings and the
 * database handle). These helpers are the durable half: what was committed,
 * and when — so a section can report its own state and a reload cannot claim
 * a section was committed when it was not.
 * ------------------------------------------------------------------ */

export type PhaseCommits = Partial<Record<ProjectPhase, string>>;

export function commitStorageKey(projectId: number | string): string {
  return `scenering_phase_commits_${projectId}`;
}

export function parsePhaseCommits(raw: string | null): PhaseCommits {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: PhaseCommits = {};
    for (const phase of PROJECT_PHASES) {
      const value = (parsed as Record<string, unknown>)[phase.id];
      // Only ISO timestamps count. Anything else (a hand-edited store, an
      // older format) is ignored rather than trusted.
      if (typeof value === "string" && !Number.isNaN(Date.parse(value))) out[phase.id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function recordPhaseCommit(commits: PhaseCommits, phase: ProjectPhase, at: string): PhaseCommits {
  return { ...commits, [phase]: at };
}

/** One line for the section header: "Committed 14:05" or what is missing. */
export function commitLabel(commits: PhaseCommits, phase: ProjectPhase): string {
  const at = commits[phase];
  if (!at) return "Not committed yet";
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return "Not committed yet";
  return `Committed ${when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * The rows a section commit writes for the scenes table.
 *
 * Only the core script/image/timing fields live in the database — the studio
 * metadata (motion, framing, voices, animation) belongs to the per-scene local
 * store, which is written as it changes. Keeping this list next to the gate
 * means the commit cannot quietly start dropping a column.
 */
export interface SceneRow {
  id: number;
  project_id: number;
  order_index: number;
  text: string;
  image_query: string;
  image_url: string | null;
  duration: number;
}

export function sceneRowsForCommit(
  scenes: Array<{
    id: number;
    project_id: number;
    order_index: number;
    text?: string | null;
    image_query?: string | null;
    image_url?: string | null;
    duration?: number | null;
  }>,
): SceneRow[] {
  return scenes
    .filter((scene) => Number.isFinite(scene.id) && Number.isFinite(scene.project_id))
    .map((scene) => ({
      id: scene.id,
      project_id: scene.project_id,
      order_index: scene.order_index,
      text: scene.text ?? "",
      image_query: scene.image_query ?? "",
      image_url: scene.image_url ?? null,
      duration: scene.duration ?? 0,
    }));
}
