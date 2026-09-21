import { useState, useEffect, useRef } from "react";
import type { AspectRatioType, PacingModeType, Project, ResolutionType, Scene } from "../types";
import ProjectList from "./ProjectList";
import StepNav from "./StepNav";
import {
  readDraft,
  writeDraft,
  clearDraft,
  resolveSetupFields,
  shouldReloadFields,
} from "../lib/setup-draft";
import {
  DURATION_OPTIONS,
  type DurationOption,
  getTargetWordCount,
  countScenesFromScript,
  splitScriptIntoScenes,
  countWords,
} from "../lib/duration-utils";

interface SetupStudioProps {
  project: Project | null;
  /** All saved projects, shown in the first section of this single setup frame */
  projects: Project[];
  scenes: Scene[];
  aspectRatio: AspectRatioType;
  resolution: ResolutionType;
  pacingMode?: PacingModeType;
  sceneDuration?: number;
  motionStyle?: string;
  loading?: boolean;
  /** Project management (this frame is the only place projects are chosen) */
  onSelectProject: (project: Project) => void;
  onDeleteProject: (projectId: number) => void;
  onStartNewProject: () => void;
  /** Resolves true when the project was created and the app has navigated on */
  onCreateProject: (title: string, script: string, sceneDuration: number) => boolean | void | Promise<boolean | void>;
  /* Project setup values */
  onUpdateTitle: (title: string) => void;
  onUpdateScript: (script: string, regenerateScenes?: boolean, overrideDuration?: number) => void;
  onUpdateAspectRatio: (ratio: AspectRatioType) => void;
  onUpdateResolution: (resolution: ResolutionType) => void;
  onUpdatePacingMode?: (mode: PacingModeType) => void;
  onUpdateSceneDuration?: (duration: number) => void;
  onCalibrateScenesWordCount?: (targetSeconds: number) => void;
  onFitScenesToSpeech?: () => void;
  onUpdateMotionStyle?: (style: string) => void;
  onNavigateToStep: (step: "scenes") => void;
}

// -------- Shared small pieces (single column, responsive) --------
function SectionHeading({
  step,
  title,
  subtitle,
  badge,
}: {
  step: number;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="flex items-start gap-2.5 min-w-0">
        <span className="w-6 h-6 mt-0.5 rounded-lg bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 text-[11px] font-bold flex items-center justify-center shrink-0">
          {step}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white leading-tight">{title}</h3>
          {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {badge}
    </div>
  );
}

export default function SetupStudio({
  project,
  projects,
  scenes,
  aspectRatio,
  resolution = "1080p",
  pacingMode = "auto_speech",
  sceneDuration = 20,
  motionStyle = "dynamic",
  loading = false,
  onSelectProject,
  onDeleteProject,
  onStartNewProject,
  onCreateProject,
  onUpdateTitle,
  onUpdateScript,
  onUpdateAspectRatio,
  onUpdateResolution,
  onUpdateSceneDuration,
  onCalibrateScenesWordCount,
  onUpdateMotionStyle,
  onNavigateToStep,
}: SetupStudioProps) {
  /** Best-known title/script for a project, preferring anything unsaved. */
  const initialFor = (proj: Project | null | undefined, sc: Scene[]) =>
    resolveSetupFields(proj, sc, readDraft(proj?.id));

  const [title, setTitle] = useState(() => initialFor(project, scenes).title);
  const [script, setScript] = useState(() => initialFor(project, scenes).script);
  const [selectedDuration, setSelectedDuration] = useState<DurationOption>(
    () => (sceneDuration as DurationOption) || 20
  );
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    if (sceneDuration && [10, 20, 30].includes(sceneDuration)) {
      setSelectedDuration(sceneDuration as DurationOption);
    }
  }, [sceneDuration]);

  /**
   * Strict isolation: reload the fields ONLY when the user actually switches
   * to a different project.
   *
   * This used to also depend on project.title, project.script and the scenes
   * array. Changing the aspect ratio, resolution or motion style rewrites the
   * scenes array, which changed its identity, re-ran this effect and wiped
   * whatever the user had typed — the "my title and script disappear" bug.
   */
  const loadedProjectRef = useRef<number | string | null>(null);
  useEffect(() => {
    const key = project?.id ?? "new";
    if (!shouldReloadFields(loadedProjectRef.current, project?.id)) return;
    loadedProjectRef.current = key;
    const init = initialFor(project, scenes);
    setTitle(init.title);
    setScript(init.script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  /** Once the project exists, the anonymous "new" draft has served its purpose */
  useEffect(() => {
    if (project?.id) clearDraft(null);
  }, [project?.id]);

  /**
   * Keep an unsaved draft so nothing is ever lost, even if this component
   * unmounts (navigating away and back) or the page is reloaded.
   */
  useEffect(() => {
    try {
      writeDraft(project?.id, { title, script });
    } catch {}
  }, [title, script, project?.id]);

  /**
   * If the project's saved script arrives after mount (async load) and the box
   * is still empty with no draft, adopt it rather than leaving the user blank.
   */
  useEffect(() => {
    if (script.trim().length > 0) return;
    const draft = readDraft(project?.id);
    if (draft.script !== undefined && draft.script.trim().length > 0) return;
    if (project?.script && project.script.trim().length > 0) {
      setScript(project.script);
    } else if (scenes.length > 0 && scenes[0]?.project_id === project?.id) {
      setScript(scenes.map((s) => s.text).join("\n\n"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.script, scenes.length]);

  const activeDuration = selectedDuration;
  const targetWordsPerScene = getTargetWordCount(activeDuration);

  // Scene count comes from the SAME splitter the app uses to create scenes
  // (src/lib/duration-utils.ts), so the number shown here is always the number
  // the user actually gets. It used to count paragraphs, which disagreed with
  // the word-count based split.

  const wordsCount = countWords(script);
  const estimatedReadingSec = Math.round((wordsCount / 2.5) * 10) / 10;
  const detectedScenesCount = countScenesFromScript(script, activeDuration);
  const isExistingProject = Boolean(project?.id);
  const canStart = script.trim().length > 0;

  const showNotice = (msg: string) => {
    setAppliedNotice(msg);
    setTimeout(() => setAppliedNotice(null), 3500);
  };

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    onUpdateTitle(newTitle);
  };

  /**
   * Re-flows the script into evenly sized scenes for the chosen duration and
   * shows the result as one paragraph per scene, so what is on screen matches
   * what will be created.
   */
  const handleFormatScriptToTargetDuration = () => {
    const currentScriptText = script.trim() || scenes.map((s) => s.text).join("\n\n");
    if (!currentScriptText) return;

    const parts = splitScriptIntoScenes(currentScriptText, activeDuration);
    if (parts.length === 0) return;

    const cleanScript = parts.join("\n\n");
    setScript(cleanScript);
    onUpdateScript(cleanScript, true, activeDuration);

    const counts = parts.map((x) => countWords(x));
    const lo = Math.min(...counts);
    const hi = Math.max(...counts);
    showNotice(
      `Formatted into ${parts.length} even scene${parts.length === 1 ? "" : "s"} of ${
        lo === hi ? `${lo}` : `${lo}–${hi}`
      } words (~${activeDuration}s each).`
    );
  };

  const handleApplyScript = (regenerate: boolean) => {
    if (!script.trim()) return;
    onUpdateScript(script.trim(), regenerate, activeDuration);
    showNotice(
      regenerate ? `Re-generated ${detectedScenesCount} scenes from script!` : "Script updated successfully!"
    );
  };

  const handleSelectDuration = (seconds: DurationOption) => {
    setSelectedDuration(seconds);
    onUpdateSceneDuration?.(seconds);
    onCalibrateScenesWordCount?.(seconds);

    const currentScriptText = script.trim();
    if (isExistingProject && currentScriptText) {
      onUpdateScript(currentScriptText, true, seconds);
    }

    const words = getTargetWordCount(seconds);
    showNotice(`Scene duration set to ${seconds}s (~${words} target words/scene).`);
  };

  /**
   * Primary action: create the project (new) or save the setup (existing) and
   * continue to Scenes.
   *
   * This is guarded and always finishes. Previously a throw anywhere in the
   * save path (or a create that silently failed) left the user on the setup
   * screen with no feedback, which is why the button "did not always work".
   */
  const handleStartProject = async () => {
    if (starting) return;
    const durToApply = selectedDuration || 20;
    const scriptText = script.trim();

    if (!scriptText) {
      showNotice("Add a script in section 3 before continuing.");
      document.getElementById("screenplay-script")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setStarting(true);
    setStartError(null);
    try {
      if (!isExistingProject) {
        const ok = await onCreateProject(title.trim() || "Untitled Video", scriptText, durToApply);
        // A create that returns false failed; anything else is treated as
        // success because the app navigates itself on the happy path.
        if (ok === false) {
          setStartError("Could not create the project. Your title and script are still here — please try again.");
        }
        return;
      }

      if (title.trim()) onUpdateTitle(title.trim());
      onUpdateSceneDuration?.(durToApply);
      onUpdateScript(scriptText, true, durToApply);
      onNavigateToStep("scenes");
    } catch (err) {
      console.error("Setup save failed:", err);
      setStartError("Something went wrong saving the setup. Nothing was lost — please try again.");
    } finally {
      setStarting(false);
    }
  };

  const handleStartNewProject = () => {
    clearDraft(project?.id);
    clearDraft(null);
    loadedProjectRef.current = "new";
    onStartNewProject();
    setTitle("");
    setScript("");
    setStartError(null);
  };

  const aspectRatios: {
    id: AspectRatioType;
    label: string;
    sublabel: string;
    boxClass: string;
  }[] = [
    { id: "16:9", label: "16:9 Landscape", sublabel: "YouTube / Desktop / TV", boxClass: "w-9 h-5" },
    { id: "9:16", label: "9:16 Vertical", sublabel: "Shorts / TikTok / Reels", boxClass: "w-5 h-9" },
    { id: "1:1", label: "1:1 Square", sublabel: "Instagram / Feed Post", boxClass: "w-7 h-7" },
    { id: "4:3", label: "4:3 Classic", sublabel: "Standard / Presentation", boxClass: "w-8 h-6" },
  ];

  const getResolutionDimensions = (ratio: AspectRatioType, res: ResolutionType): string => {
    if (ratio === "16:9") {
      if (res === "720p") return "1280 × 720";
      if (res === "1080p") return "1920 × 1080";
      if (res === "2k") return "2560 × 1440";
      if (res === "4k") return "3840 × 2160";
    }
    if (ratio === "9:16") {
      if (res === "720p") return "720 × 1280";
      if (res === "1080p") return "1080 × 1920";
      if (res === "2k") return "1440 × 2560";
      if (res === "4k") return "2160 × 3840";
    }
    if (ratio === "1:1") {
      if (res === "720p") return "720 × 720";
      if (res === "1080p") return "1080 × 1080";
      if (res === "2k") return "1440 × 1440";
      if (res === "4k") return "2160 × 2160";
    }
    if (ratio === "4:3") {
      if (res === "720p") return "960 × 720";
      if (res === "1080p") return "1440 × 1080";
      if (res === "2k") return "1920 × 1440";
      if (res === "4k") return "2880 × 2160";
    }
    return "1920 × 1080";
  };

  const resolutions: {
    id: ResolutionType;
    name: string;
    badge: string;
    description: string;
  }[] = [
    { id: "720p", name: "720p HD", badge: "Fast & Light", description: "Quick renders, small files" },
    { id: "1080p", name: "1080p Full HD", badge: "Recommended", description: "Crisp YouTube & social standard" },
    { id: "2k", name: "2K QHD", badge: "Creator Pro", description: "Ultra-sharp for high-DPI screens" },
    { id: "4k", name: "4K Ultra HD", badge: "Cinema Master", description: "Maximum cinematic fidelity" },
  ];

  const motionOptions = [
    { id: "dynamic", label: "🔀 Dynamic Variety", desc: "Rotates Ken Burns, Zoom, Pan & Shake per scene" },
    { id: "ken_burns", label: "🔍 Gentle Ken Burns", desc: "Documentary slow drift and cinematic push" },
    { id: "zoom_in", label: "➕ Cinematic Zoom In", desc: "Slow immersive forward push" },
    { id: "zoom_out", label: "➖ Dramatic Zoom Out", desc: "Slow wide reveal effect" },
    { id: "pan", label: "↔️ Smooth Camera Pan", desc: "Horizontal sliding panoramic movement" },
    { id: "shake", label: "📳 Handheld Shake", desc: "Organic documentary subtle handheld tremor" },
    { id: "none", label: "⏹️ Static (No Motion)", desc: "Still frame without camera motion" },
  ];


  return (
    <div className="w-full max-w-4xl mx-auto space-y-5 sm:space-y-6 pb-12 animate-fade-in">
      {/* ---------------- Frame header ---------------- */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 sm:p-5 shadow-lg">
        <div className="min-w-0">
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="p-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl text-lg">
                🎬
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                {isExistingProject ? "Project Setup" : "Start a New Project"}
              </h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border hidden sm:inline ${
                  isExistingProject
                    ? "bg-emerald-950 border-emerald-700/60 text-emerald-300"
                    : "bg-indigo-950 border border-indigo-700/60 text-indigo-300"
                }`}
              >
                {isExistingProject ? "Editing" : "New"}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
              Everything needed to start a video is on this one screen — choose a project, then set the
              title, script, scene length, canvas format, resolution and camera motion. Nothing else in
              the app asks for these again; the Render screen simply shows the results.
            </p>
          </div>


        {/* The one navigation control for this phase */}
        <div className="mt-4">
          <StepNav
            current="setup"
            onNavigate={() => {}}
            onNext={handleStartProject}
            nextLabel={isExistingProject ? "Next: Scenes (save setup)" : "Next: Scenes (create project)"}
            /* The button stays clickable even without a script so it can say
               WHY it cannot continue, rather than appearing broken. */
            nextDisabled={false}
            busyLabel={starting || loading ? (isExistingProject ? "Saving setup…" : "Creating project…") : undefined}
            note={
              canStart
                ? isExistingProject
                  ? "saves title, script & format"
                  : "creates the project from your script"
                : "add a script in section 3 to continue"
            }
          />
        </div>
      </div>

      {startError && (
        <div className="p-3.5 bg-red-950/80 border border-red-700/80 rounded-xl text-red-200 text-xs flex items-center justify-between shadow-lg">
          <span className="flex items-center gap-2">
            <span>⚠️</span>
            <span className="font-medium">{startError}</span>
          </span>
          <button onClick={() => setStartError(null)} className="text-red-400 hover:text-white text-xs">
            ✕
          </button>
        </div>
      )}

      {appliedNotice && (
        <div className="p-3.5 bg-emerald-950/80 border border-emerald-700/80 rounded-xl text-emerald-200 text-xs flex items-center justify-between shadow-lg">
          <span className="flex items-center gap-2">
            <span>✅</span>
            <span className="font-medium">{appliedNotice}</span>
          </span>
          <button onClick={() => setAppliedNotice(null)} className="text-emerald-400 hover:text-white text-xs">
            ✕
          </button>
        </div>
      )}

      {/* ---------------- 1. Project ---------------- */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 sm:p-5 shadow-lg">
        <SectionHeading
          step={1}
          title="Choose or create a project"
          subtitle="Open a saved project to continue, or start a brand new one. This is the only place projects are listed."
          badge={
            <button
              type="button"
              onClick={handleStartNewProject}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1.5 shrink-0 shadow"
            >
              <span>＋</span>
              <span>New Project</span>
            </button>
          }
        />

        {isExistingProject && (
          <div className="mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-emerald-950/50 border border-emerald-800/60 rounded-xl px-3 py-2.5">
            <span className="text-[11px] text-emerald-200 flex items-center gap-2 min-w-0">
              <span>📂</span>
              <span className="truncate">
                Currently editing: <strong className="text-white">{project?.title || "Untitled"}</strong>
                {project?.script ? ` · ${countWords(project.script)} words` : ""}
              </span>
            </span>
            <button
              type="button"
              onClick={handleStartNewProject}
              className="text-[11px] text-emerald-300 hover:text-white underline decoration-dotted shrink-0 self-start sm:self-auto"
            >
              Clear & start fresh
            </button>
          </div>
        )}

        <div className="max-h-72 overflow-y-auto pr-1">
          <ProjectList
            projects={projects}
            onSelect={onSelectProject}
            onDelete={onDeleteProject}
            selectedId={project?.id}
          />
        </div>
      </div>

      {/* ---------------- 2. Title ---------------- */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 sm:p-5 shadow-lg">
        <SectionHeading
          step={2}
          title="Project title"
          subtitle="Used for the video banner, exported filenames and attribution documents."
          badge={<span className="text-[11px] text-gray-500 shrink-0">{title.length} chars</span>}
        />
        <input
          id="project-title"
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="e.g. Wonders of the Deep Ocean"
          className="w-full px-4 py-3 bg-gray-800/90 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-inner"
        />
      </div>

      {/* ---------------- 3. Script ---------------- */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
        <SectionHeading
          step={3}
          title="Screenplay script & narration"
          subtitle="Paste the full script. Each paragraph becomes a scene. There is no limit on the number of scenes."
          badge={
            <div className="hidden sm:flex items-center gap-2 bg-gray-800/80 px-3 py-1.5 rounded-lg border border-gray-700 text-[11px] shrink-0">
              <span className="text-indigo-300 font-semibold">{detectedScenesCount} Scenes</span>
              <span className="text-gray-500">•</span>
              <span className="text-gray-300">{wordsCount} Words</span>
              <span className="text-gray-500">•</span>
              <span className="text-amber-300 font-medium">~{estimatedReadingSec}s</span>
            </div>
          }
        />

        {/* Live stats on very small screens */}
        <div className="sm:hidden flex items-center justify-center gap-2 bg-gray-800/80 px-3 py-1.5 rounded-lg border border-gray-700 text-[11px]">
          <span className="text-indigo-300 font-semibold">{detectedScenesCount} Scenes</span>
          <span className="text-gray-500">•</span>
          <span className="text-gray-300">{wordsCount} Words</span>
          <span className="text-gray-500">•</span>
          <span className="text-amber-300 font-medium">~{estimatedReadingSec}s Speech</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span className="text-[11px] font-medium text-gray-400">
            Write or paste your own script below — each paragraph becomes one scene.
          </span>
          <button
            type="button"
            onClick={handleFormatScriptToTargetDuration}
            className="px-2.5 py-1 bg-indigo-950/80 hover:bg-indigo-900/90 text-indigo-300 border border-indigo-700/60 rounded-lg text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 shadow-sm shrink-0"
            title={`Calibrate each paragraph to ~${targetWordsPerScene} words so each scene lasts ${activeDuration}s`}
          >
            <span>✨</span>
            <span>Calibrate My Script to {activeDuration}s (~{targetWordsPerScene}w)</span>
          </button>
        </div>

        <textarea
          id="screenplay-script"
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={11}
          placeholder={`Scene 1: Type ~${targetWordsPerScene} words to last ${activeDuration} seconds when read aloud...\n\nScene 2: Type another ~${targetWordsPerScene} words for the second scene...\n\nScene 3: Each paragraph becomes a separate scene.`}
          className="w-full px-4 py-3.5 bg-gray-800/90 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-y font-mono text-xs leading-relaxed shadow-inner"
        />

        {isExistingProject && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
              <span>💡</span>
              <span>Each paragraph becomes a scene calibrated for {activeDuration}s (~{targetWordsPerScene} words).</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleApplyScript(false)}
                className="px-3.5 py-2 bg-gray-800 hover:bg-gray-750 text-gray-200 hover:text-white rounded-xl text-xs font-semibold border border-gray-700 transition-colors shadow"
              >
                Save Script Text
              </button>
              <button
                type="button"
                onClick={() => handleApplyScript(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                <span>⚡</span>
                <span>Re-Generate All Scenes</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---------------- 4. Scene duration ---------------- */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 sm:p-5 shadow-lg">
        <SectionHeading
          step={4}
          title="Scene duration"
          subtitle="Target spoken length for every scene — the script is chunked to match."
          badge={
            <span className="px-2.5 py-0.5 bg-indigo-950/90 text-indigo-300 border border-indigo-700/60 rounded-full text-[10px] font-bold shrink-0">
              {activeDuration}s Active
            </span>
          }
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {DURATION_OPTIONS.map((opt) => {
            const isSelected = activeDuration === opt.seconds;
            return (
              <button
                key={opt.seconds}
                type="button"
                onClick={() => handleSelectDuration(opt.seconds)}
                className={`p-3.5 rounded-xl border text-left transition-all flex items-start justify-between gap-3 ${
                  isSelected
                    ? "bg-indigo-950/80 border-indigo-500 text-white shadow-md ring-1 ring-indigo-400"
                    : "bg-gray-800/80 border-gray-700/80 text-gray-300 hover:bg-gray-750 hover:text-white"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-white">{opt.label}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        isSelected ? "bg-indigo-600 text-white" : "bg-gray-700 text-gray-300"
                      }`}
                    >
                      ~{opt.targetWords}w
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">{opt.description}</p>
                </div>
                <div
                  className={`w-4 h-4 mt-0.5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                    isSelected ? "border-indigo-400 bg-indigo-600" : "border-gray-600"
                  }`}
                >
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------------- 5. Aspect ratio ---------------- */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 sm:p-5 shadow-lg">
        <SectionHeading
          step={5}
          title="Aspect ratio"
          subtitle="Target display format & canvas orientation for every preview and render."
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {aspectRatios.map((r) => {
            const isActive = aspectRatio === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onUpdateAspectRatio(r.id);
                  showNotice(`Aspect ratio set to ${r.label}`);
                }}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between min-h-[82px] ${
                  isActive
                    ? "bg-indigo-950/80 border-indigo-500 text-white shadow-md ring-1 ring-indigo-400"
                    : "bg-gray-800/80 border-gray-700/80 text-gray-300 hover:bg-gray-750 hover:text-white"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div
                    className={`rounded border-2 ${
                      isActive ? "border-indigo-400 bg-indigo-600/30" : "border-gray-500 bg-gray-700/40"
                    } ${r.boxClass}`}
                  />
                  {isActive && <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm" />}
                </div>
                <div>
                  <div className="text-xs font-bold leading-tight">{r.label}</div>
                  <div className="text-[9px] text-indigo-400/90 truncate mt-0.5">{r.sublabel}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------------- 6. Resolution ---------------- */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 sm:p-5 shadow-lg">
        <SectionHeading
          step={6}
          title="Video resolution"
          subtitle="Output pixel density for the finished video."
          badge={
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-800 text-indigo-300 border border-gray-700 shrink-0">
              {getResolutionDimensions(aspectRatio, resolution)}
            </span>
          }
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {resolutions.map((res) => {
            const isActive = resolution === res.id;
            const dimension = getResolutionDimensions(aspectRatio, res.id);
            return (
              <button
                key={res.id}
                type="button"
                onClick={() => {
                  onUpdateResolution(res.id);
                  showNotice(`Resolution set to ${res.name} (${dimension})`);
                }}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  isActive
                    ? "bg-indigo-950/80 border-indigo-500 text-white shadow-md ring-1 ring-indigo-400"
                    : "bg-gray-800/80 border-gray-700/80 text-gray-300 hover:bg-gray-750 hover:text-white"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-white">{res.name}</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                      isActive ? "bg-indigo-500 text-white" : "bg-gray-700 text-gray-300"
                    }`}
                  >
                    {res.badge}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-indigo-300 mb-1">{dimension}</div>
                <div className="text-[9px] text-gray-400 leading-tight">{res.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------------- 7. Camera motion ---------------- */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 sm:p-5 shadow-lg">
        <SectionHeading
          step={7}
          title="Camera motion (Ken Burns)"
          subtitle="Default movement applied to scene images across the whole video."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {motionOptions.map((opt) => {
            const isSelected = motionStyle === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onUpdateMotionStyle?.(opt.id);
                  showNotice(`Global motion style set to ${opt.label}`);
                }}
                className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-2 ${
                  isSelected
                    ? "bg-indigo-950/80 border-indigo-500 text-white shadow-sm ring-1 ring-indigo-400"
                    : "bg-gray-800/60 border-gray-700/60 text-gray-300 hover:bg-gray-750 hover:text-white"
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold">{opt.label}</div>
                  <div className="text-[10px] text-gray-400">{opt.desc}</div>
                </div>
                {isSelected && <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shrink-0" />}
              </button>
            );
          })}
        </div>

        {onUpdateMotionStyle && (
          <button
            type="button"
            onClick={() => {
              onUpdateMotionStyle(motionStyle);
              showNotice(`Applied "${motionStyle}" motion to all ${scenes.length} scene(s)!`);
            }}
            className="w-full mt-3 py-2 px-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-xs font-semibold text-gray-200 hover:text-white transition-all flex items-center justify-center gap-1.5"
          >
            <span>🔄</span> Apply Motion Style to All Scenes
          </button>
        )}
      </div>

      {/* ---------------- Pricing plans ---------------- */}
      {/* Pricing Plans Filler Section (Non-functional as requested, clean and visually polished) */}
      <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="text-center max-w-xl mx-auto space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-950/80 border border-indigo-700/60 text-indigo-300">
            <span>💎</span> Pricing & Studio Plans
          </div>
          <h3 className="text-xl font-bold text-white tracking-tight">
            Flexible Plans for Every Video Creator
          </h3>
          <p className="text-xs text-gray-400">
            Create high-impact AI narrated videos with 3D audio-reactive visualizers, dynamic captions, and cinematic motion.
          </p>
        </div>

        {/* 3-Tier Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
          {/* Tier 1: Free Starter */}
          <div className="bg-gray-800/60 border border-gray-700/80 rounded-2xl p-5 flex flex-col justify-between hover:border-gray-600 transition-all shadow-md">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Free Starter</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 border border-emerald-700/60 text-emerald-300">
                  Current Plan
                </span>
              </div>

              <div>
                <div className="text-2xl font-extrabold text-white">$0</div>
                <div className="text-[11px] text-gray-400">Free forever • No credit card</div>
              </div>

              <ul className="space-y-2 text-xs text-gray-300 pt-2 border-t border-gray-700/60">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> Unlimited scenes & scripts
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> 1080p Full HD rendering
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> 10+ Neural voiceover actors
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> Full 3D audio visualizer suite
                </li>
                <li className="flex items-center gap-2 text-gray-400">
                  <span className="text-gray-500 font-bold">•</span> Standard Scenering watermark
                </li>
              </ul>
            </div>

            <div className="pt-6">
              <button
                type="button"
                disabled
                className="w-full py-2.5 px-4 rounded-xl bg-gray-700/60 text-gray-300 text-xs font-semibold cursor-default text-center border border-gray-600/60"
              >
                Active Workspace
              </button>
            </div>
          </div>

          {/* Tier 2: Creator Studio (Featured) */}
          <div className="bg-gradient-to-b from-indigo-950/60 to-purple-950/40 border-2 border-indigo-500 rounded-2xl p-5 flex flex-col justify-between relative shadow-xl transform md:-translate-y-1 transition-all">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-[10px] rounded-full shadow tracking-wide uppercase">
              Most Popular
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Creator Studio</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-900 border border-indigo-600/60 text-indigo-200">
                  Coming Soon
                </span>
              </div>

              <div>
                <div className="text-2xl font-extrabold text-white flex items-baseline gap-1">
                  <span>$19</span>
                  <span className="text-xs font-normal text-gray-400">/ month</span>
                </div>
                <div className="text-[11px] text-indigo-300">Ideal for YouTubers & content creators</div>
              </div>

              <ul className="space-y-2 text-xs text-gray-200 pt-2 border-t border-indigo-800/40">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> Watermark removal included
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> Custom customer brand logo embedding
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> High-speed priority cloud rendering
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> All 20+ multi-accent neural voices
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> Commercial monetization rights
                </li>
              </ul>
            </div>

            <div className="pt-6">
              <button
                type="button"
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-bold hover:from-indigo-500 hover:to-purple-500 transition-all shadow-md text-center"
              >
                Upgrade to Creator (Preview)
              </button>
            </div>
          </div>

          {/* Tier 3: Pro Agency */}
          <div className="bg-gray-800/60 border border-gray-700/80 rounded-2xl p-5 flex flex-col justify-between hover:border-gray-600 transition-all shadow-md">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Pro Agency</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950 border border-purple-700/60 text-purple-300">
                  Coming Soon
                </span>
              </div>

              <div>
                <div className="text-2xl font-extrabold text-white flex items-baseline gap-1">
                  <span>$49</span>
                  <span className="text-xs font-normal text-gray-400">/ month</span>
                </div>
                <div className="text-[11px] text-gray-400">For agencies & high-volume production</div>
              </div>

              <ul className="space-y-2 text-xs text-gray-300 pt-2 border-t border-gray-700/60">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> 4K Ultra-HD 60 FPS exporting
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> Multi-speaker dialogue auto-splitting
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> Unlimited custom audio SFX upload
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> Dedicated fast rendering queue
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> White-label video agency export
                </li>
              </ul>
            </div>

            <div className="pt-6">
              <button
                type="button"
                className="w-full py-2.5 px-4 rounded-xl bg-gray-800 hover:bg-gray-750 text-white text-xs font-bold transition-all border border-gray-700 shadow text-center"
              >
                Upgrade to Pro (Preview)
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-500">
          ℹ️ Billing is currently in preview mode. All studio tools, 3D visualizers, voice actors, and unlimited scenes are unlocked for testing.
        </p>
      </div>

      {/* Footer status (navigation lives in the top StepNav only) */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 sm:p-5 shadow-lg">
        <p className="text-xs text-gray-400">
          <span className="text-white font-semibold text-sm block mb-0.5">
            {isExistingProject ? "Setup ready" : canStart ? "Ready to build your video" : "Waiting for a script"}
          </span>
          {scenes.length} scene(s) configured
          {project?.title ? ` · ${project.title}` : ""} · {activeDuration}s scenes · {aspectRatio} · {resolution}
        </p>
        {!canStart && (
          <p className="text-[11px] text-amber-300 flex items-center gap-1.5 mt-2">
            <span>⚠️</span>
            <span>Add a script in section 3 — every scene is generated from it.</span>
          </p>
        )}
      </div>
    </div>
  );
}
