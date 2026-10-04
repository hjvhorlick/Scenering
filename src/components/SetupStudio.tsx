import { useState, useEffect, useRef } from "react";
import MotionPreviewCanvas from "./MotionPreviewCanvas";
import type {
  AspectRatioType,
  PacingModeType,
  Project,
  ResolutionType,
  Scene,
  SceneMotionType,
  RenderProfileSettings,
  PublishDestinationType,
} from "../types";
import {
  PLATFORM_PROFILES,
  QUALITY_LEVELS,
  FRAME_RATE_CHOICES,
  DEFAULT_RENDER_PROFILE_SETTINGS,
  destinationCanvas,
  resolveFrameRate,
  getQualityLevel,
} from "../lib/render-profile";
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
  SINGLE_SCENE_OPTION,
  type DurationOption,
  getTargetWordCount,
  countScenesFromScript,
  splitScriptIntoScenes,
  singleSceneDuration,
  countWords,
  formatDuration,
} from "../lib/duration-utils";
import {
  addCustomVideo,
  CustomVideoError,
  CUSTOM_VIDEO_PREFIX,
  describeClip,
  resolveVideoUrl,
  type CustomVideoClip,
} from "../lib/custom-video";
import VoiceoverSwitch from "./VoiceoverSwitch";
import type { NewProjectOptions } from "../App";
import Icon, { iconify } from "./icons/Icon";
import { PLAN_CONFIG, PLAN_ORDER, type BillingInterval, type PlanSlug } from "../config/plans";
import { getInterfacePlan, useSession } from "../lib/session";

/**
 * How much of a project title fits on the video banner.
 *
 * Derived from the title templates: at the banner's type size three wrapped
 * lines hold roughly 60 characters before the text starts running past the
 * safe area. Capping here keeps the title inside the frame, and the input
 * stops accepting characters once the block is full.
 */
export const TITLE_MAX_CHARS = 60;

interface SetupStudioProps {
  project: Project | null;
  /** All saved projects, shown in the first section of this single setup frame */
  projects: Project[];
  scenes: Scene[];
  aspectRatio: AspectRatioType;
  resolution: ResolutionType;
  pacingMode?: PacingModeType;
  sceneDuration?: number;
  /** One-scene project: the whole script is a single scene and a single shot. */
  singleScene?: boolean;
  /** Project-wide narration switch, set here as well as in the Voiceover step. */
  voiceoverEnabled?: boolean;
  motionStyle?: string;
  sceneAnimationEnabled?: boolean;
  loading?: boolean;
  /** Project management (this frame is the only place projects are chosen) */
  onSelectProject: (project: Project) => void;
  onDeleteProject: (projectId: number) => void;
  onStartNewProject: () => void;
  /** Resolves true when the project was created and the app has navigated on */
  onCreateProject: (
    title: string,
    script: string,
    sceneDuration: number,
    options?: NewProjectOptions
  ) => boolean | void | Promise<boolean | void>;
  /* Project setup values */
  onUpdateTitle: (title: string) => void;
  onUpdateScript: (
    script: string,
    regenerateScenes?: boolean,
    overrideDuration?: number,
    overrideSingleScene?: boolean
  ) => void;
  onUpdateAspectRatio: (ratio: AspectRatioType) => void;
  onUpdateResolution: (resolution: ResolutionType) => void;
  /** The render profile chosen here in setup — the render screen only reads it */
  renderProfile?: RenderProfileSettings;
  onUpdateRenderProfile?: (patch: Partial<RenderProfileSettings>) => void;
  onUpdatePacingMode?: (mode: PacingModeType) => void;
  onUpdateSceneDuration?: (duration: number) => void;
  onUpdateSingleScene?: (enabled: boolean) => void;
  onUpdateVoiceoverEnabled?: (enabled: boolean) => void;
  /** Attaches footage uploaded here to the single scene of an existing project. */
  onAttachSingleSceneClip?: (clip: { url: string; name: string; duration: number }) => void;
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

function setupPlanHighlights(slug: PlanSlug): string[] {
  const plan = PLAN_CONFIG[slug];
  const limits = plan.limits;
  const capacity = limits.visualResearchCapacity === "high" ? "High-capacity visual research" : limits.visualResearchCapacity === "expanded" ? "Expanded visual research" : "Standard visual research";
  const allowance = plan.id === "free"
    ? `${limits.shortExportsPerWeek} Shorts plus ${limits.longExportsPerWeek} long-video download each week`
    : limits.finalExportsPerWeek == null
      ? "Unlimited final downloads, subject to fetched/upstream API service limits"
      : `${limits.finalExportsPerWeek} final video downloads each week`;
  return [
    allowance,
    capacity,
    plan.features.full_video_studio ? "All Video Studio creative tools" : "Sample visualisers, animated Subscribe CTA and 2 music tracks",
    plan.features.premium_captions ? "All available voice and caption options" : "2 voice presets and 2 caption styles",
    plan.features.bulk_workflow ? "Bulk workflow capability" : "Horizontal and vertical final export",
  ];
}

export default function SetupStudio({
  project,
  projects,
  scenes,
  aspectRatio,
  resolution = "1080p",
  pacingMode = "auto_speech",
  sceneDuration = 20,
  singleScene = false,
  voiceoverEnabled = true,
  motionStyle = "dynamic",
  sceneAnimationEnabled = false,
  loading = false,
  onSelectProject,
  onDeleteProject,
  onStartNewProject,
  onCreateProject,
  onUpdateTitle,
  onUpdateScript,
  onUpdateAspectRatio,
  onUpdateResolution,
  renderProfile = DEFAULT_RENDER_PROFILE_SETTINGS,
  onUpdateRenderProfile,
  onUpdateSceneDuration,
  onUpdateSingleScene,
  onUpdateVoiceoverEnabled,
  onAttachSingleSceneClip,
  onCalibrateScenesWordCount,
  onUpdateMotionStyle,
  onNavigateToStep,
}: SetupStudioProps) {
  const { account } = useSession();
  const currentPlan = getInterfacePlan(account);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");
  const openMembership = () => window.dispatchEvent(new Event("scenering-open-account"));

  /** Best-known title/script for a project, preferring anything unsaved. */
  const initialFor = (proj: Project | null | undefined, sc: Scene[]) =>
    resolveSetupFields(proj, sc, readDraft(proj?.id));

  const [title, setTitle] = useState(() => initialFor(project, scenes).title);
  const [script, setScript] = useState(() => initialFor(project, scenes).script);
  const [selectedDuration, setSelectedDuration] = useState<DurationOption>(
    () => (sceneDuration as DurationOption) || 20
  );
  /**
   * One-scene mode, mirrored locally so a brand-new project (which has no
   * saved settings yet) can be set up before it exists.
   */
  const [oneScene, setOneScene] = useState<boolean>(singleScene);
  /** Where the single scene's picture comes from. */
  const [singleSource, setSingleSource] = useState<"script" | "upload">("script");
  const [uploadedClip, setUploadedClip] = useState<CustomVideoClip | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const clipInputRef = useRef<HTMLInputElement | null>(null);
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  /** Advanced output overrides (aspect, resolution, FPS, format, mastering)
   *  stay collapsed — the destination presets cover the normal user. */
  const [showOutputAdvanced, setShowOutputAdvanced] = useState(false);

  /**
   * Pick where the video is going and Scenering makes the technical choices:
   * canvas orientation, resolution, frame rate and container all follow the
   * Master Render Profile for that platform. "Custom" hands the wheel to the
   * Advanced overrides below.
   */
  const pickDestination = (id: PublishDestinationType) => {
    onUpdateRenderProfile?.({ destination: id });
    const canvas = destinationCanvas(id);
    if (canvas) {
      onUpdateAspectRatio(canvas.aspect);
      onUpdateResolution(canvas.resolution);
      const platform = PLATFORM_PROFILES.find((p) => p.id === id);
      showNotice(
        `${platform?.name || id} selected — ${getResolutionDimensions(canvas.aspect, canvas.resolution)} · 30 FPS · MP4, all set automatically`
      );
    } else {
      setShowOutputAdvanced(true);
      showNotice("Custom output — choose your own canvas and encoding below");
    }
  };

  /** Manual aspect override: if it no longer matches the chosen platform's
   *  orientation, the destination honestly becomes "Custom". */
  const overrideAspect = (ratio: AspectRatioType) => {
    onUpdateAspectRatio(ratio);
    const canvas = destinationCanvas(renderProfile.destination);
    if (canvas && canvas.aspect !== ratio) {
      onUpdateRenderProfile?.({ destination: "custom" });
    }
  };

  useEffect(() => {
    if (sceneDuration && [10, 20, 30].includes(sceneDuration)) {
      setSelectedDuration(sceneDuration as DurationOption);
    }
  }, [sceneDuration]);

  useEffect(() => {
    setOneScene(singleScene);
  }, [singleScene]);

  /** An existing one-scene project that already has footage shows it here. */
  useEffect(() => {
    const clipScene = scenes.find((sc) => sc.video_url);
    if (clipScene?.video_url) setSingleSource("upload");
  }, [scenes]);

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
  const detectedScenesCount = countScenesFromScript(script, activeDuration, oneScene);
  const isExistingProject = Boolean(project?.id);
  /** Footage already attached to this project, or just uploaded here. */
  const existingClipScene = scenes.find((sc) => sc.video_url) || null;
  const hasFootage = Boolean(uploadedClip || existingClipScene);
  const footageName = uploadedClip?.name || existingClipScene?.video_name || "Your video";
  const footageSeconds = uploadedClip?.duration || existingClipScene?.video_duration || 0;
  const footagePreviewUrl = uploadedClip
    ? resolveVideoUrl(`${CUSTOM_VIDEO_PREFIX}${uploadedClip.id}`)
    : resolveVideoUrl(existingClipScene?.video_url);
  /** A one-scene project can be started from footage alone — no script needed. */
  const canStart = script.trim().length > 0 || (oneScene && hasFootage);

  const showNotice = (msg: string) => {
    setAppliedNotice(msg);
    setTimeout(() => setAppliedNotice(null), 3500);
  };

  const handleTitleChange = (newTitle: string) => {
    // Hard cap: a title longer than the banner can hold wraps onto a third
    // line and runs past the frame edge, so the input stops accepting
    // characters past the limit rather than letting the user type a title
    // that cannot be rendered. Truncating here as well as with `maxLength`
    // covers paste, which maxLength alone does not always block.
    const capped = newTitle.slice(0, TITLE_MAX_CHARS);
    setTitle(capped);
    onUpdateTitle(capped);
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
      } words (~${formatDuration(activeDuration)} each).`
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
    setOneScene(false);
    onUpdateSingleScene?.(false);
    onUpdateSceneDuration?.(seconds);
    onCalibrateScenesWordCount?.(seconds);

    const currentScriptText = script.trim();
    if (isExistingProject && currentScriptText) {
      // `false` is passed explicitly: the one-scene state above has not
      // reached the parent yet, and the split must use the new choice.
      onUpdateScript(currentScriptText, true, seconds, false);
    }

    const words = getTargetWordCount(seconds);
    showNotice(`Scene duration set to ${formatDuration(seconds)} (~${words} target words/scene).`);
  };

  /**
   * One scene for the whole project.
   *
   * On an existing project this immediately merges the scenes back into one —
   * the script is re-split with the one-scene rule, which simply returns the
   * whole thing. Nothing the user wrote is rewritten.
   */
  const handleSelectSingleScene = () => {
    setOneScene(true);
    onUpdateSingleScene?.(true);

    const currentScriptText = script.trim();
    if (isExistingProject && currentScriptText) {
      onUpdateScript(currentScriptText, true, activeDuration, true);
    }
    showNotice(
      hasFootage
        ? "One-scene project — your uploaded video is the whole video."
        : "One-scene project — the whole script becomes a single scene and a single shot."
    );
  };

  /**
   * Upload footage to use as the single scene.
   *
   * The file is kept in the browser's own storage and the scene records the
   * stable address for it, so the project still plays the clip after a
   * reload. Uploading also switches the voiceover off: someone bringing their
   * own footage has no script to read, and the switch is right there to turn
   * narration back on if they do want it.
   */
  const handleUploadClip = async (file: File | null | undefined) => {
    if (!file || uploading) return;
    setUploading(true);
    setUploadError(null);
    try {
      const clip = await addCustomVideo(file);
      setUploadedClip(clip);
      setSingleSource("upload");
      if (!oneScene) {
        setOneScene(true);
        onUpdateSingleScene?.(true);
      }
      onAttachSingleSceneClip?.({
        url: `${CUSTOM_VIDEO_PREFIX}${clip.id}`,
        name: clip.name,
        duration: clip.duration,
      });
      if (voiceoverEnabled) onUpdateVoiceoverEnabled?.(false);
      showNotice(
        `"${clip.name}" is now the whole video (${describeClip(clip)}). Voiceover switched off — turn it back on below if you want narration over it.`
      );
    } catch (err) {
      setUploadError(
        err instanceof CustomVideoError ? err.message : "That video could not be loaded."
      );
    } finally {
      setUploading(false);
      if (clipInputRef.current) clipInputRef.current.value = "";
    }
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

    // A one-scene project built from uploaded footage needs no script at all —
    // a music video has no words to read.
    if (!scriptText && !(oneScene && hasFootage)) {
      showNotice(
        oneScene
          ? "Add a script in section 3, or upload your video in section 4, before continuing."
          : "Add a script in section 3 before continuing."
      );
      document.getElementById("screenplay-script")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setStarting(true);
    setStartError(null);
    try {
      if (!isExistingProject) {
        const ok = await onCreateProject(title.trim() || "Untitled Video", scriptText, durToApply, {
          singleScene: oneScene,
          voiceoverEnabled,
          clip:
            oneScene && uploadedClip
              ? {
                  url: `${CUSTOM_VIDEO_PREFIX}${uploadedClip.id}`,
                  name: uploadedClip.name,
                  duration: uploadedClip.duration,
                }
              : undefined,
        });
        // A create that returns false failed; anything else is treated as
        // success because the app navigates itself on the happy path.
        if (ok === false) {
          setStartError("Could not create the project. Your title and script are still here — please try again.");
        }
        return;
      }

      if (title.trim()) onUpdateTitle(title.trim());
      onUpdateSceneDuration?.(durToApply);
      if (scriptText) onUpdateScript(scriptText, true, durToApply, oneScene);
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

  /** The destination presets — the 7 platform profiles plus "Custom".
   *  Picking one is the ONLY output decision a normal user ever makes. */
  const destinationOptions: {
    id: PublishDestinationType;
    icon: string;
    name: string;
    tag: string;
  }[] = [
    ...PLATFORM_PROFILES.map((p) => ({
      id: p.id as PublishDestinationType,
      icon: p.icon,
      name: p.name,
      tag: p.aspect === "9:16" ? "Vertical 9:16" : p.aspect === "1:1" ? "Square 1:1" : "Landscape 16:9",
    })),
    { id: "custom" as PublishDestinationType, icon: "⚙️", name: "Custom", tag: "Your own setup" },
  ];

  /**
   * Each option carries the actual SceneMotionType it applies, so the little
   * preview beside it animates the very same transform the renderer will use.
   */
  const motionOptions: {
    id: string;
    label: string;
    desc: string;
    preview: SceneMotionType;
  }[] = [
    { id: "dynamic", label: "🔀 Dynamic Variety", desc: "Rotates Ken Burns, zoom, pan & drift per scene", preview: "ken_burns" },
    { id: "ken_burns", label: "🔍 Gentle Ken Burns", desc: "Steady push with a visible diagonal drift", preview: "ken_burns" },
    { id: "zoom_in", label: "➕ Cinematic Zoom In", desc: "Immersive forward push", preview: "zoom_in" },
    { id: "zoom_out", label: "➖ Dramatic Zoom Out", desc: "Wide reveal, pulling back", preview: "zoom_out" },
    { id: "pan", label: "↔️ Smooth Camera Pan", desc: "Horizontal panoramic travel", preview: "pan_left" },
    { id: "shake", label: "📳 Handheld Shake", desc: "Organic handheld tremor that settles", preview: "shake" },
    { id: "floating", label: "🎈 Floating Drift", desc: "Weightless figure-of-eight drift", preview: "floating" },
    { id: "none", label: "⏹️ Static (No Motion)", desc: "Still frame, no camera movement", preview: "none" },
  ];

  /** A real scene image makes the preview concrete; otherwise a stand-in is drawn. */
  const motionPreviewImage = scenes.find((sc) => sc.image_url)?.image_url || null;


  return (
    <div className="w-full max-w-4xl 2xl:max-w-6xl mx-auto space-y-3 sm:space-y-5 lg:space-y-6 pb-12 animate-fade-in px-1 sm:px-0">
      {/* ---------------- Frame header ---------------- */}
      <div className="bg-gray-900/80 border border-hairline rounded-2xl p-4 sm:p-5 shadow-lg">
        <div className="min-w-0">
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="p-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl text-lg" aria-hidden="true"><Icon glyph="🎬" /></span>
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
            <Icon glyph="⚠" />
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
            <Icon glyph="✅" />
            <span className="font-medium">{appliedNotice}</span>
          </span>
          <button onClick={() => setAppliedNotice(null)} className="text-emerald-400 hover:text-white text-xs">
            ✕
          </button>
        </div>
      )}

      {/* ---------------- 1. Project ---------------- */}
      <div className="bg-gray-900/80 border border-hairline rounded-2xl p-4 sm:p-5 shadow-lg">
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
              <Icon glyph="📂" />
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

        <div>
          <ProjectList
            projects={projects}
            onSelect={onSelectProject}
            onDelete={onDeleteProject}
            selectedId={project?.id}
          />
        </div>
      </div>

      {/* ---------------- 2. Title ---------------- */}
      <div className="bg-gray-900/80 border border-hairline rounded-2xl p-4 sm:p-5 shadow-lg">
        <SectionHeading
          step={2}
          title="Project title"
          subtitle="Used for the video banner, exported filenames and attribution documents."
          badge={
            <span
              className={`text-[11px] shrink-0 ${title.length >= TITLE_MAX_CHARS ? "text-amber-400 font-semibold" : "text-gray-500"}`}
            >
              {title.length >= TITLE_MAX_CHARS
                ? "Block is full"
                : `${title.length} / ${TITLE_MAX_CHARS} chars`}
            </span>
          }
        />
        <input
          id="project-title"
          type="text"
          value={title}
          maxLength={TITLE_MAX_CHARS}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="e.g. Wonders of the Deep Ocean"
          className="w-full px-4 py-3 bg-gray-800/90 border border-hairline rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-inner"
        />
      </div>

      {/* ---------------- 3. Script ---------------- */}
      <div className="bg-gray-900/80 border border-hairline rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
        <SectionHeading
          step={3}
          title="Screenplay script & narration"
          subtitle={
            oneScene
              ? "Paste the full script. It stays as one scene — or leave it empty if your uploaded video says it all."
              : "Paste the full script. Each paragraph becomes a scene. There is no limit on the number of scenes."
          }
          badge={
            <div className="hidden sm:flex items-center gap-2 bg-gray-800/80 px-3 py-1.5 rounded-lg border border-hairline text-[11px] shrink-0">
              <span className="text-indigo-300 font-semibold">{detectedScenesCount} Scenes</span>
              <span className="text-gray-500">•</span>
              <span className="text-gray-300">{wordsCount} Words</span>
              <span className="text-gray-500">•</span>
              <span className="text-amber-300 font-medium">~{formatDuration(estimatedReadingSec)}</span>
            </div>
          }
        />

        {/* Live stats on very small screens */}
        <div className="sm:hidden flex items-center justify-center gap-2 bg-gray-800/80 px-3 py-1.5 rounded-lg border border-hairline text-[11px]">
          <span className="text-indigo-300 font-semibold">{detectedScenesCount} Scenes</span>
          <span className="text-gray-500">•</span>
          <span className="text-gray-300">{wordsCount} Words</span>
          <span className="text-gray-500">•</span>
          <span className="text-amber-300 font-medium">~{estimatedReadingSec}s Speech</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span className="text-[11px] font-medium text-gray-400">
            {oneScene
              ? "Write or paste your script below — all of it stays in one scene."
              : "Write or paste your own script below — each paragraph becomes one scene."}
          </span>
          {!oneScene && (
          <button
            type="button"
            onClick={handleFormatScriptToTargetDuration}
            className="px-2.5 py-1 bg-indigo-950/80 hover:bg-indigo-900/90 text-indigo-300 border border-indigo-700/60 rounded-lg text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 shadow-sm shrink-0"
            title={`Calibrate each paragraph to ~${targetWordsPerScene} words so each scene lasts ${activeDuration}s`}
          >
            <Icon glyph="✨" />
            <span>Calibrate My Script to {activeDuration}s (~{targetWordsPerScene}w)</span>
          </button>
          )}
        </div>

        <textarea
          id="screenplay-script"
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={11}
          placeholder={
            oneScene
              ? "Write the whole thing here — it all stays in one scene.\n\nMaking a music video? Leave this empty, upload your video in section 4, and add captions, overlays and extra music in the steps that follow."
              : `Scene 1: Type ~${targetWordsPerScene} words to last ${activeDuration} seconds when read aloud...\n\nScene 2: Type another ~${targetWordsPerScene} words for the second scene...\n\nScene 3: Each paragraph becomes a separate scene.`
          }
          className="w-full px-4 py-3.5 bg-gray-800/90 border border-hairline rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-y font-mono text-xs leading-relaxed shadow-inner"
        />

        {isExistingProject && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
              <Icon glyph="💡" />
              <span>
                {oneScene
                  ? `The whole script stays as one scene (~${formatDuration(singleSceneDuration(script))}).`
                  : `Each paragraph becomes a scene calibrated for ${activeDuration}s (~${targetWordsPerScene} words).`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleApplyScript(false)}
                className="px-3.5 py-2 bg-gray-800 hover:bg-gray-750 text-gray-200 hover:text-white rounded-xl text-xs font-semibold border border-hairline transition-colors shadow"
              >
                Save Script Text
              </button>
              <button
                type="button"
                onClick={() => handleApplyScript(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                <Icon glyph="⚡" />
                <span>Re-Generate All Scenes</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---------------- 4. Scene duration ---------------- */}
      <div className="bg-gray-900/80 border border-hairline rounded-2xl p-4 sm:p-5 shadow-lg">
        <SectionHeading
          step={4}
          title="Scene length"
          subtitle="Target spoken length for every scene — the script is chunked to match. Or keep the whole thing as one scene."
          badge={
            <span className="px-2.5 py-0.5 bg-indigo-950/90 text-indigo-300 border border-indigo-700/60 rounded-full text-[10px] font-bold shrink-0">
              {oneScene ? "1 Scene" : `${activeDuration}s Active`}
            </span>
          }
        />
        <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5">
          {DURATION_OPTIONS.map((opt) => {
            const isSelected = !oneScene && activeDuration === opt.seconds;
            return (
              <button
                key={opt.seconds}
                type="button"
                onClick={() => handleSelectDuration(opt.seconds)}
                className={`p-3.5 rounded-xl border text-left transition-all flex items-start justify-between gap-3 ${
                  isSelected
                    ? "bg-indigo-950/80 border-indigo-500 text-white shadow-md ring-1 ring-indigo-400"
                    : "bg-gray-800/80 border-hairline text-gray-300 hover:bg-gray-750 hover:text-white"
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
                  className={`w-4 h-4 mt-0.5 rounded-full border shrink-0 flex items-center justify-center ${
                    isSelected ? "border-indigo-400 bg-indigo-600" : "border-hairline"
                  }`}
                >
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </button>
            );
          })}

          {/* The fourth choice: do not split at all. */}
          <button
            type="button"
            onClick={handleSelectSingleScene}
            className={`p-3.5 rounded-xl border text-left transition-all flex items-start justify-between gap-3 ${
              oneScene
                ? "bg-indigo-950/80 border-indigo-500 text-white shadow-md ring-1 ring-indigo-400"
                : "bg-gray-800/80 border-hairline text-gray-300 hover:bg-gray-750 hover:text-white"
            }`}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-white">{SINGLE_SCENE_OPTION.label}</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    oneScene ? "bg-indigo-600 text-white" : "bg-gray-700 text-gray-300"
                  }`}
                >
                  1 scene
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">{SINGLE_SCENE_OPTION.description}</p>
            </div>
            <div
              className={`w-4 h-4 mt-0.5 rounded-full border shrink-0 flex items-center justify-center ${
                oneScene ? "border-indigo-400 bg-indigo-600" : "border-hairline"
              }`}
            >
              {oneScene && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
          </button>
        </div>

        {/* ---- One-scene project: where does the single scene come from? ---- */}
        {oneScene && (
          <div className="mt-4 space-y-3 rounded-xl border border-indigo-800/50 bg-indigo-950/20 p-3.5">
            <div className="flex items-start gap-2">
              <span className="text-indigo-300 mt-0.5"><Icon glyph="🎬" /></span>
              <p className="text-[11px] text-gray-300 leading-relaxed">
                <span className="text-white font-semibold">One scene, one video.</span> Captions, music,
                stickers and everything else in the Studio work exactly as they do on a multi-scene
                project — there is simply one scene to hang them on.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
              <button
                type="button"
                onClick={() => setSingleSource("script")}
                className={`p-3 rounded-xl border text-left transition-all ${
                  singleSource === "script"
                    ? "bg-indigo-950/80 border-indigo-500 text-white ring-1 ring-indigo-400"
                    : "bg-gray-800/80 border-hairline text-gray-300 hover:bg-gray-750 hover:text-white"
                }`}
              >
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <Icon glyph="📝" /> Make the video from my script
                </div>
                <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">
                  Scenering finds the picture, narrates the words and times the scene to the voice.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSingleSource("upload")}
                className={`p-3 rounded-xl border text-left transition-all ${
                  singleSource === "upload"
                    ? "bg-indigo-950/80 border-indigo-500 text-white ring-1 ring-indigo-400"
                    : "bg-gray-800/80 border-hairline text-gray-300 hover:bg-gray-750 hover:text-white"
                }`}
              >
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <Icon glyph="⬆️" /> Upload my own video
                </div>
                <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">
                  Your footage becomes the scene — a music video, a filmed take, a screen recording.
                </p>
              </button>
            </div>

            {singleSource === "upload" && (
              <div className="space-y-2.5">
                <input
                  ref={clipInputRef}
                  type="file"
                  accept="video/*,.mp4,.mov,.webm,.m4v"
                  className="hidden"
                  onChange={(e) => handleUploadClip(e.target.files?.[0])}
                />

                {hasFootage ? (
                  <div className="flex flex-col sm:flex-row gap-3 rounded-xl border border-hairline bg-gray-900/70 p-3">
                    {footagePreviewUrl ? (
                      <video
                        src={footagePreviewUrl}
                        muted
                        playsInline
                        controls
                        className="w-full sm:w-44 rounded-lg border border-hairline bg-black"
                      />
                    ) : (
                      <div className="w-full sm:w-44 h-24 rounded-lg border border-hairline bg-black/60 flex items-center justify-center text-[10px] text-gray-500 text-center px-2">
                        Upload stored — preview unavailable in this browser
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                        <Icon glyph="✓" /> {footageName}
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {uploadedClip
                          ? describeClip(uploadedClip)
                          : `${formatDuration(footageSeconds)} of footage`}
                        {" · "}
                        the whole video is {formatDuration(footageSeconds)} long
                      </p>
                      <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                        Trim it, mute its own sound or swap it later in the Scenes step. Add music and
                        overlays in the Studio exactly as usual.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => clipInputRef.current?.click()}
                          disabled={uploading}
                          className="px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-[11px] font-semibold border border-hairline transition-colors disabled:opacity-50"
                        >
                          {uploading ? "Reading video…" : "Replace video"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => clipInputRef.current?.click()}
                    disabled={uploading}
                    className="w-full rounded-xl border border-dashed border-indigo-700/60 bg-gray-900/50 hover:bg-gray-900/80 px-4 py-6 text-center transition-colors disabled:opacity-60"
                  >
                    <div className="text-sm font-bold text-white flex items-center justify-center gap-2">
                      <Icon glyph="⬆️" />
                      {uploading ? "Reading your video…" : "Choose a video file"}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      MP4, MOV, WebM or M4V · up to 500 MB · kept in this browser, never uploaded anywhere
                    </p>
                  </button>
                )}

                {uploadError && (
                  <p className="text-[11px] text-red-300 bg-red-950/50 border border-red-800/60 rounded-lg px-3 py-2">
                    {uploadError}
                  </p>
                )}
              </div>
            )}

            {/* Narration on or off — the same switch as the Voiceover step. */}
            {onUpdateVoiceoverEnabled && (
              <VoiceoverSwitch
                enabled={voiceoverEnabled}
                onChange={onUpdateVoiceoverEnabled}
                sceneCount={oneScene ? 1 : scenes.length}
              />
            )}
          </div>
        )}
      </div>

      {/* ---------------- 5. Output & destination ----------------
          ONE home for every output decision (they used to be split between
          here and the render screen). The user picks WHERE the video is
          going; Scenering chooses the canvas, resolution, frame rate and
          encoding from the Master Render Profile. Advanced users can
          override everything — collapsed so the section stays simple. */}
      <div className="bg-gray-900/80 border border-hairline rounded-2xl p-4 sm:p-5 shadow-lg">
        <SectionHeading
          step={5}
          title="Where is this video going?"
          subtitle="Pick a destination and Scenering sets the canvas, resolution and encoding for you. Rendering is one video at a time — come back here, pick another destination, and render the same script again. Finished videos wait in the Vault."
          badge={
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-800 text-indigo-300 border border-hairline shrink-0">
              {getResolutionDimensions(aspectRatio, resolution)}
            </span>
          }
        />

        {/* A. Destination presets — the simple path */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
          {destinationOptions.map((d) => {
            const isActive = renderProfile.destination === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => pickDestination(d.id)}
                className={`p-3 rounded-xl border text-left transition-all min-h-[72px] ${
                  isActive
                    ? "bg-indigo-950/80 border-indigo-500 text-white shadow-md ring-1 ring-indigo-400"
                    : "bg-gray-800/80 border-hairline text-gray-300 hover:bg-gray-750 hover:text-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-base leading-none"><Icon glyph={d.icon} /></span>
                  {isActive && <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm" />}
                </div>
                <div className="text-xs font-bold leading-tight mt-1.5">{d.name}</div>
                <div className="text-[9px] text-indigo-400/90 mt-0.5">{d.tag}</div>
              </button>
            );
          })}
        </div>

        {/* What Scenering will deliver — plain words, no jargon needed */}
        <div className="mt-3 p-3 bg-gray-800/60 border border-hairline rounded-xl text-[11px] leading-relaxed">
          <span className="text-emerald-300 font-semibold"><Icon glyph="✓" /> Scenering will deliver: </span>
          <span className="text-white font-medium">
            {getResolutionDimensions(aspectRatio, resolution)} · {resolveFrameRate(renderProfile.fps)} FPS ·{" "}
            {getQualityLevel(renderProfile.quality).name} quality ·{" "}
            {renderProfile.format === "webm" ? "VP9 WebM" : "H.264 · AAC · MP4"}
          </span>
          <span className="text-gray-500"> — encoded for social platforms automatically.</span>
        </div>

        {/* B. Render quality — four presets, High recommended */}
        <div className="mt-4">
          <div className="text-xs font-semibold text-gray-300 mb-2">Render quality</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5">
            {QUALITY_LEVELS.map((q) => {
              const isActive = renderProfile.quality === q.id;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => {
                    onUpdateRenderProfile?.({ quality: q.id });
                    showNotice(`Render quality set to ${q.name}`);
                  }}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isActive
                      ? "bg-indigo-950/80 border-indigo-500 text-white shadow-md ring-1 ring-indigo-400"
                      : "bg-gray-800/80 border-hairline text-gray-300 hover:bg-gray-750 hover:text-white"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-white">{q.name}</span>
                    {q.id === "high" && (
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                          isActive ? "bg-indigo-500 text-white" : "bg-gray-700 text-gray-300"
                        }`}
                      >
                        Recommended
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] text-gray-400 leading-tight">{q.blurb}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* C. Advanced overrides — collapsed; the presets cover normal use */}
        <div className="mt-4 border-t border-hairline pt-3">
          <button
            type="button"
            onClick={() => setShowOutputAdvanced((v) => !v)}
            className="w-full flex items-center justify-between text-xs font-semibold text-gray-300 hover:text-white transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Icon glyph="🔧" /> Advanced overrides
              <span className="text-[10px] font-normal text-gray-500">— aspect ratio, resolution, FPS, format</span>
            </span>
            <span>{iconify(showOutputAdvanced ? "▾ Hide" : "▸ Show")}</span>
          </button>

          {showOutputAdvanced && (
            <div className="mt-3 space-y-4">
              <p className="text-[10px] text-gray-500 leading-relaxed">
                The destination presets above already make the right technical choices. Override them only
                if you need something specific — the render screen will warn you when a choice reduces
                platform compatibility.
              </p>

              {/* Aspect ratio override */}
              <div>
                <div className="text-[11px] font-semibold text-gray-300 mb-2">Aspect ratio</div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5">
                  {aspectRatios.map((r) => {
                    const isActive = aspectRatio === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          overrideAspect(r.id);
                          showNotice(`Aspect ratio set to ${r.label}`);
                        }}
                        className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between min-h-[82px] ${
                          isActive
                            ? "bg-indigo-950/80 border-indigo-500 text-white shadow-md ring-1 ring-indigo-400"
                            : "bg-gray-800/80 border-hairline text-gray-300 hover:bg-gray-750 hover:text-white"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div
                            className={`rounded border ${
                              isActive ? "border-indigo-400 bg-indigo-600/30" : "border-hairline bg-gray-700/40"
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

              {/* Resolution override */}
              <div>
                <div className="text-[11px] font-semibold text-gray-300 mb-2 flex items-center justify-between gap-2">
                  <span>Resolution</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-800 text-indigo-300 border border-hairline">
                    {getResolutionDimensions(aspectRatio, resolution)}
                  </span>
                </div>
                <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5">
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
                            : "bg-gray-800/80 border-hairline text-gray-300 hover:bg-gray-750 hover:text-white"
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

              {/* Frame rate / format / mastering */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div className="text-[11px] font-semibold text-gray-300 mb-1.5">Frame rate</div>
                  <div className="flex flex-wrap gap-1.5">
                    {FRAME_RATE_CHOICES.map((choice) => (
                      <button
                        key={String(choice)}
                        type="button"
                        onClick={() => onUpdateRenderProfile?.({ fps: choice })}
                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                          renderProfile.fps === choice
                            ? "bg-indigo-600 border-indigo-500 text-white shadow"
                            : "bg-gray-800 border-hairline text-gray-300 hover:text-white"
                        }`}
                      >
                        {choice === "auto" ? "Auto" : `${choice} FPS`}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-gray-500 mt-1.5 leading-relaxed">30 FPS is recommended for every social platform.</p>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-gray-300 mb-1.5">Format</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(["mp4", "webm"] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => onUpdateRenderProfile?.({ format: f })}
                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                          renderProfile.format === f
                            ? "bg-indigo-600 border-indigo-500 text-white shadow"
                            : "bg-gray-800 border-hairline text-gray-300 hover:text-white"
                        }`}
                      >
                        {f === "mp4" ? "MP4 · H.264" : "WebM · VP9"}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-gray-500 mt-1.5 leading-relaxed">MP4 is the standard every platform accepts.</p>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-gray-300 mb-1.5">Audio mastering</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(["automatic", "manual"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => onUpdateRenderProfile?.({ audio_mastering: m })}
                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                          renderProfile.audio_mastering === m
                            ? "bg-indigo-600 border-indigo-500 text-white shadow"
                            : "bg-gray-800 border-hairline text-gray-300 hover:text-white"
                        }`}
                      >
                        {m === "automatic" ? "Automatic" : "Manual"}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-gray-500 mt-1.5 leading-relaxed">Automatic keeps narration in front of the music and prevents clipping.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>


      {/* ---------------- 6. Camera motion ---------------- */}
      <div className="bg-gray-900/80 border border-hairline rounded-2xl p-4 sm:p-5 shadow-lg">
        <SectionHeading
          step={6}
          title="Camera motion (Ken Burns)"
          subtitle={
            sceneAnimationEnabled
              ? "Scene Animation Effects is ON, so camera movement is controlled individually inside each scene."
              : "Applies to every scene in the whole video. Previews below are live."
          }
        />

        {sceneAnimationEnabled && (
          <div className="mb-3 rounded-xl border border-indigo-700/70 bg-indigo-950/50 p-3 text-[11px] text-indigo-200 flex items-start gap-2">
            <Icon glyph="ℹ" />
            <span>
              Scene Animation Effects is enabled in the Scene Editor above, so global Ken Burns camera motion is disabled here. Camera movement is now controlled individually for each scene — open <strong>🎬 Animate Scene</strong> on any scene to set it.
            </span>
          </div>
        )}

        <p className="text-[11px] text-gray-500 mb-2.5">
          {sceneAnimationEnabled
            ? "The global Ken Burns setting is preserved for compatibility, but it will not overwrite scenes while Scene Animation Effects is ON. Use the Animate Scene panel on each scene instead."
            : "Every tile below is live — the movement you see is the exact transform the rendered video uses."}
        </p>
        <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2 sm:gap-2.5">
          {motionOptions.map((opt) => {
            const isSelected = motionStyle === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={sceneAnimationEnabled}
                onClick={() => {
                  if (sceneAnimationEnabled) {
                    showNotice("Scene Animation Effects is ON — set camera motion inside each scene instead.");
                    return;
                  }
                  onUpdateMotionStyle?.(opt.id);
                  showNotice(`Global motion style set to ${opt.label}`);
                }}
                className={`w-full p-2 rounded-xl border text-left transition-all ${
                  sceneAnimationEnabled
                    ? "bg-gray-900/60 border-hairline text-gray-500 opacity-70 cursor-not-allowed"
                    : isSelected
                    ? "bg-indigo-950/80 border-indigo-500 text-white shadow-sm ring-1 ring-indigo-400"
                    : "bg-gray-800/60 border-hairline text-gray-300 hover:bg-gray-750 hover:text-white"
                }`}
                title={sceneAnimationEnabled ? "Use Animate Scene on each scene for camera movement" : opt.desc}
              >
                <div className="relative overflow-hidden rounded-lg mb-2">
                  <MotionPreviewCanvas
                    motion={opt.preview}
                    imageUrl={motionPreviewImage}
                    width={300}
                    height={150}
                    responsive
                    cycleSeconds={opt.id === "shake" || opt.id === "floating" ? 4 : 6}
                  />
                  {isSelected && (
                    <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-bold shadow">
                      ACTIVE
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{iconify(opt.label)}</div>
                    <div className="text-[10px] text-gray-400 leading-tight">{opt.desc}</div>
                  </div>
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shrink-0" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {onUpdateMotionStyle && !sceneAnimationEnabled && (
          <button
            type="button"
            onClick={() => {
              onUpdateMotionStyle(motionStyle);
              showNotice(`Applied "${motionStyle}" motion to all ${scenes.length} scene(s)!`);
            }}
            className="w-full mt-3 py-2 px-3 bg-gray-800 hover:bg-gray-700 border border-hairline rounded-xl text-xs font-semibold text-gray-200 hover:text-white transition-all flex items-center justify-center gap-1.5"
          >
            <Icon glyph="🔄" /> Apply Motion Style to All Scenes
          </button>
        )}
      </div>

      {/* ---------------- Membership plans ---------------- */}
      <section className="bg-gray-900/90 border border-hairline rounded-2xl p-4 sm:p-6 shadow-xl space-y-5" aria-labelledby="setup-membership-title">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-950/80 border border-blue-700/60 text-blue-200">
              <Icon glyph="💎" /> Membership & production capacity
            </div>
            <h3 id="setup-membership-title" className="text-xl font-bold text-white tracking-tight">
              Free, SceneFlow and SceneForge
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Preview and correct your project freely. Plan usage applies only to meaningful Final Export, and changing membership never automatically deletes saved projects.
            </p>
          </div>
          <div className="inline-flex self-start rounded-xl border border-hairline bg-gray-950/70 p-1" role="group" aria-label="Plan billing interval">
            {(["monthly", "yearly"] as BillingInterval[]).map((interval) => (
              <button
                key={interval}
                type="button"
                onClick={() => setBillingInterval(interval)}
                className={`px-3 py-2 rounded-lg text-[11px] font-bold transition-all ${billingInterval === interval ? "bg-blue-600 text-white shadow-md" : "text-gray-400 hover:text-white hover:bg-gray-800"}`}
              >
                {interval === "monthly" ? "Monthly" : "Yearly · save more"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-5 pt-1">
          {PLAN_ORDER.map((slug) => {
            const plan = PLAN_CONFIG[slug];
            const price = plan.prices[billingInterval];
            const isCurrent = currentPlan === slug;
            const isFeatured = slug === "sceneflow";
            return (
              <article
                key={slug}
                className={`relative rounded-2xl p-5 flex flex-col justify-between border transition-all ${isFeatured ? "bg-blue-950/55 border-blue-500 shadow-xl md:-translate-y-1" : "bg-gray-800/60 border-hairline shadow-md"}`}
              >
                {isFeatured && <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-blue-600 text-white text-[9px] font-bold uppercase tracking-wider shadow-md">Regular creators</span>}
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div><h4 className="text-base font-bold text-white">{plan.name}</h4><p className="text-[11px] text-gray-400 mt-1 min-h-8">{plan.description}</p></div>
                    {isCurrent && <span className="shrink-0 px-2 py-1 rounded-full bg-white text-blue-950 text-[9px] font-extrabold uppercase tracking-wide shadow">Current</span>}
                  </div>
                  <div className="mt-4 flex items-baseline gap-1">
                    <strong className="text-3xl text-white">${price}</strong>
                    <span className="text-[11px] text-gray-400">{price === 0 ? "forever" : `/${billingInterval === "monthly" ? "month" : "year"}`}</span>
                  </div>
                  {billingInterval === "yearly" && price > 0 && <p className="text-[10px] text-blue-200 mt-1">${plan.annualMonthlyEquivalent}/month equivalent · save ${plan.annualSaving}/year</p>}
                  <ul className="mt-4 pt-4 border-t border-white/10 space-y-2 text-xs text-gray-300">
                    {setupPlanHighlights(slug).map((line) => <li key={line} className="flex gap-2"><span className="text-blue-300 font-bold">✓</span><span>{line}</span></li>)}
                  </ul>
                </div>
                <button
                  type="button"
                  disabled={isCurrent}
                  onClick={openMembership}
                  className={`w-full mt-6 py-2.5 px-4 rounded-xl text-xs font-bold transition-all border ${isCurrent ? "bg-gray-700/60 border-hairline text-gray-300 cursor-default" : "bg-white border-white text-blue-950 hover:bg-blue-50 shadow-md"}`}
                >
                  {isCurrent ? "Current membership" : `Choose ${plan.name}`}
                </button>
              </article>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1 text-[11px] text-gray-400">
          <p>Paid checkout is available only when Lemon Squeezy has been configured. Paid access begins after verified subscription confirmation.</p>
          <button type="button" onClick={() => { window.location.href = "/pricing"; }} className="shrink-0 text-blue-300 hover:text-white font-bold underline underline-offset-4">Open complete plan comparison</button>
        </div>
      </section>

      {/* Footer status (navigation lives in the top StepNav only) */}
      <div className="bg-gray-900/80 border border-hairline rounded-2xl p-4 sm:p-5 shadow-lg">
        <p className="text-xs text-gray-400">
          <span className="text-white font-semibold text-sm block mb-0.5">
            {isExistingProject ? "Setup ready" : canStart ? "Ready to build your video" : "Waiting for a script"}
          </span>
          {scenes.length} scene(s) configured
          {project?.title ? ` · ${project.title}` : ""} · {activeDuration}s scenes · {aspectRatio} · {resolution}
        </p>
        {!canStart && (
          <p className="text-[11px] text-amber-300 flex items-center gap-1.5 mt-2">
            <Icon glyph="⚠" />
            <span>Add a script in section 3 — every scene is generated from it.</span>
          </p>
        )}
      </div>
    </div>
  );
}
