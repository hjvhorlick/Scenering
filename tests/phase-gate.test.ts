import { readFileSync } from "node:fs";
import { createHarness } from "./harness";
import {
  PROJECT_PHASES,
  commitLabel,
  commitStorageKey,
  getPhase,
  isPhaseLocked,
  nextPhase,
  parsePhaseCommits,
  phaseIndex,
  phaseToStep,
  previousPhase,
  recordPhaseCommit,
  sceneRowsForCommit,
  stepToPhase,
} from "../src/lib/phase-gate";

/**
 * The project sections and moving between them.
 *
 * The owner's rule (2026-10-16), replacing the ordered gate of 2026-10-08:
 * "the user can go forward and backward as they want and all sections will be
 * open. The only section closed is the start, and that will start a new
 * project or choose an old project."
 *
 * So the only lock left is the start: with no project open, every section but
 * Setup is closed. With a project open, nothing is — and leaving a section by
 * any route commits it.
 */

const h = createHarness();
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/* ---- the walk itself ---------------------------------------------------- */

h.eq(PROJECT_PHASES.length, 6, "there are six sections");
h.eq(
  PROJECT_PHASES.map((phase) => phase.id).join(" → "),
  "setup → scenes → voiceover → captions → studio → render",
  "they are walked in this order"
);
for (const phase of PROJECT_PHASES) {
  h.ok(Boolean(phase.tab && phase.phase && phase.purpose && phase.icon), `${phase.id}: fully described`);
}
h.eq(getPhase("render").tab, "Render", "getPhase finds a section");
h.eq(getPhase("nope" as never).id, "setup", "an unknown section falls back to the first instead of crashing");

h.eq(phaseIndex("setup"), 0, "Setup is first");
h.eq(phaseIndex("render"), 5, "Render is last");
h.eq(nextPhase("setup"), "scenes", "after Setup comes Scenes");
h.eq(nextPhase("render"), null, "nothing follows Render");
h.eq(previousPhase("scenes"), "setup", "before Scenes is Setup");
h.eq(previousPhase("setup"), null, "nothing precedes Setup");

/* ---- what is open, what is locked -------------------------------------- */

for (const phase of PROJECT_PHASES) {
  h.eq(isPhaseLocked(phase.id, true), false, `with a project open, ${phase.tab} is open`);
}
h.eq(isPhaseLocked("render", true), false, "the last section is open straight away — no walking in order");
h.eq(isPhaseLocked("voiceover", true), false, "the section after the current one is open without pressing Next");
h.eq(isPhaseLocked("setup", true), false, "Setup stays open with a project, to edit it or start another");
h.eq(isPhaseLocked("setup", false), false, "with no project, the start is open");
for (const phase of PROJECT_PHASES.filter((p) => p.id !== "setup")) {
  h.eq(isPhaseLocked(phase.id, false), true, `with no project, ${phase.tab} is closed until a project is created or chosen`);
}
h.eq(isPhaseLocked("nope" as never, true), true, "an unknown section is never opened");

/* ---- which phase a step belongs to ------------------------------------- */

h.eq(stepToPhase("scenes", true), "setup", "the scenes step with the setup frame up IS Project Setup");
h.eq(stepToPhase("scenes", false), "scenes", "…and without it is the Scenes section");
h.eq(stepToPhase("voiceover", false), "voiceover", "the voiceover step is the Voiceover section");
h.eq(stepToPhase("captions", false), "captions", "the captions step is the Captions section");
h.eq(stepToPhase("studio", false), "studio", "the studio step is the Studio section");
h.eq(stepToPhase("render", false), "render", "the render step is the Render section");
h.eq(phaseToStep("setup"), "scenes", "Setup and Scenes share the scenes editor step");
h.eq(phaseToStep("render"), "render", "Render keeps its own step");

/* ---- commit records ----------------------------------------------------- */

h.eq(commitStorageKey(42), "scenering_phase_commits_42", "commits are stored per project");
const empty = (value: unknown) => JSON.stringify(value);
h.eq(empty(parsePhaseCommits(null)), "{}", "nothing stored means nothing committed");
h.eq(empty(parsePhaseCommits("{")), "{}", "a corrupt store is ignored, not thrown");
h.eq(empty(parsePhaseCommits('["setup"]')), "{}", "an array is not a commit record");
h.eq(empty(parsePhaseCommits('{"setup":"not-a-date"}')), "{}", "a non-timestamp is not trusted");
h.eq(empty(parsePhaseCommits('{"nope":"2026-10-08T10:00:00.000Z"}')), "{}", "an unknown section is dropped");

const at = "2026-10-08T14:05:00.000Z";
const commits = recordPhaseCommit(recordPhaseCommit({}, "setup", at), "scenes", "2026-10-08T14:20:00.000Z");
h.eq(commits.setup, at, "a commit is recorded against its section");
h.eq(commits.scenes, "2026-10-08T14:20:00.000Z", "each section keeps its own stamp");
h.eq(parsePhaseCommits(JSON.stringify(commits)).scenes, commits.scenes, "the record round-trips through storage");
h.eq(commitLabel({}, "setup"), "Not committed yet", "an uncommitted section says so");
h.ok(commitLabel(commits, "setup").startsWith("Committed "), "a committed section reports when");

/* ---- the rows a commit writes ------------------------------------------ */

const rows = sceneRowsForCommit([
  { id: 1, project_id: 9, order_index: 0, text: "Hello", image_query: "dawn", image_url: "u", duration: 4 },
  { id: 2, project_id: 9, order_index: 1 },
  { id: Number.NaN, project_id: 9, order_index: 2 },
] as never);
h.eq(rows.length, 2, "rows without a real id are dropped rather than sent");
h.eq(rows[0].text, "Hello", "the script travels with the commit");
h.eq(rows[1].text, "", "a missing script commits as empty, not undefined");
h.eq(rows[1].image_url, null, "a missing image commits as null");
h.eq(rows[1].duration, 0, "a missing duration commits as zero");
h.eq(Object.keys(rows[0]).sort().join(","), "duration,id,image_query,image_url,order_index,project_id,text", "exactly the database columns are written");

/* ---- and the app obeys the rules --------------------------------------- */

const app = read("src/App.tsx");
h.ok(app.includes("isPhaseLocked(phase.id, Boolean(currentProject))"), "the tab row is opened by the same rule");
h.ok(app.includes("isPhaseLocked(target, Boolean(currentProject))"), "navigation is opened by the same rule");
h.ok(!app.includes("unlocks the next section"), "the tab row no longer claims Next unlocks the next section");
h.ok(!app.includes("opens after you press Next"), "no section refuses to open until Next is pressed");
h.ok(!app.includes("to commit it and open this section"), "no tab tooltip describes the old lock");
h.ok(app.includes("const goToPhase = async"), "one navigation entry point");
h.ok(/const navigateToPhase = \(phase: ProjectPhase\) => \{\s+void goToPhaseRef\.current\(phase\);/.test(app), "tabs and Previous go through it");
h.ok(/const commitAndAdvance = useCallback\(async \(target: ProjectPhase\) => \{\s+await goToPhaseRef\.current\(target, \{ viaNext: true \}\);/.test(app), "Next goes through it");
h.ok(app.includes("void goToPhaseRef.current(target, { viaNext: phaseIndex(target) > phaseIndex(currentPhase) })"), "sections' own steps go through it");
h.ok(/if \(currentProject && from !== target\) \{[\s\S]*?const saved = await commitPhaseEffects\(from\);/.test(app), "leaving a section by any route commits it");
h.ok(app.includes('handleUpdateScript(pendingScript, "if-changed", sceneDuration, singleScene)'), "leaving Setup applies a script edited there, only if it changed");
h.ok(app.includes('const rows = phase === "setup" ? [] : sceneRowsForCommit(scenes);'), "leaving Setup never writes back the scene list from before a rebuild");
h.ok(/commitPhaseEffects/.test(app) && /scenes"\)\.upsert/.test(app), "committing writes the scene rows in one batch");
h.ok(app.includes("commitStorageKey(currentProject.id)"), "the commit stamp is written per project");
h.ok(app.includes("handleStepRequest"), "sections navigate through the app, not around it");
h.ok(!app.includes("onNavigateToStep={setEditorStep}"), "no section bypasses the app with a raw step change");
h.ok(app.includes("create or select a project to unlock steps 2–6"), "with no project, the tab row says how to open the other steps");
h.ok(/onNext=\{\(\) => \{ const target = nextPhase\("scenes"\);/.test(app), "the Scenes Next button saves and opens Voiceover");
h.ok(/onNext=\{\(\) => \{ const target = nextPhase\("studio"\);/.test(app), "the Studio Next button saves and opens Render");
h.ok(app.includes("busyLabel={committingPhase ==="), "the Next button reports the commit while it runs");
h.ok(app.includes("committed — "), "a successful Next is confirmed on screen");
h.ok(app.includes("could not be saved"), "a failed save is reported instead of moving on silently");

const stepNav = read("src/components/StepNav.tsx");
h.ok(stepNav.includes('from "../lib/phase-gate"'), "the control renders the one phase list");
h.ok(/export \{ PROJECT_PHASES, getPhase \}/.test(stepNav), "the phase list still has one home");

/* Every section's own Next is wired through the app's navigation. */
for (const [file, needle] of [
  ["src/components/SetupStudio.tsx", "onNext={handleStartProject}"],
  ["src/components/VoiceoverStudio.tsx", 'onNext={() => handleProceedNext("captions")}'],
  ["src/components/CaptionsStudio.tsx", "onNavigate={onNavigateToStep}"],
  ["src/components/RenderView.tsx", "onNavigatePhase(phase)"],
] as const) {
  h.ok(read(file).includes(needle), `${file}: its Next still goes through the app's navigation`);
}

h.done("phase gate");
