import { useState, useEffect, useCallback, useRef, useMemo } from "react";
// The studio owns its styling: Tailwind's build, the generated theme colour
// matrix and the hand-written theme layer. They travel with the studio chunk,
// which the public front page now prepares in the background (see main.tsx) so
// signing in does not start a second, slow application load.
import "./index.css";
import "./themes.generated.css";
import "./themes.css";
import SceneEditor from "./components/SceneEditor";
import VideoPreview from "./components/VideoPreview";
import { loadCaptionFonts } from "./data/caption-styles";
import ProjectList from "./components/ProjectList";
import Timeline from "./components/Timeline";
import VideoStudio from "./components/VideoStudio";
import { pickRandomImageUrl, rawImageUrl } from "./lib/image-picker";
import { searchImagePool, proxyImageUrl } from "./lib/image-search";
import { sceneHasVisual } from "./lib/scene-framing";
import RenderView from "./components/RenderView";
import { getRenderStatus, subscribeRenderStatus, type RenderJobStatus } from "./lib/render-status";
import { listVaultRenders, subscribeVault } from "./lib/render-vault";
import VoiceoverStudio, { STUDIO_VOICE_PRESETS } from "./components/VoiceoverStudio";
import { migrateLegacyVoiceId } from "./data/voice-presets";
import CaptionsStudio from "./components/CaptionsStudio";
import SetupStudio from "./components/SetupStudio";
import StepNav, { PROJECT_PHASES, type ProjectPhase } from "./components/StepNav";
import {
  commitLabel,
  commitStorageKey,
  getPhase,
  isPhaseLocked,
  nextPhase,
  parsePhaseCommits,
  phaseIndex,
  phaseToStep,
  recordPhaseCommit,
  sceneRowsForCommit,
  stepToPhase,
  type PhaseCommits,
} from "./lib/phase-gate";
import { readDraft } from "./lib/setup-draft";
import { rebuildScenesFromScript, setupNeedsRebuild, type SetupInputs } from "./lib/scene-rebuild";
import { SECTION_MEMORY_PREFIX, forgetSectionMemory } from "./lib/section-memory";
import ThemeSwitcher from "./components/ThemeSwitcher";
import AccountMembershipModal from "./components/AccountMembershipModal";
import { redeemComplimentaryCode } from "./lib/entitlements";
import { stretchFullVideoMedia } from "./lib/render-visualizers";
import InsertPropertiesModal from "./components/InsertPropertiesModal";
import sceneringLogo from "./assets/scenering-logo.png";
import { supabase, EDGE_FUNCTION_BASE } from "./lib/supabase";

import { loadCustomVideos } from "./lib/custom-video";
import { TRANSCRIPT_KEYS, projectHasNarration } from "./lib/clip-transcript";
import { projectMusicBed } from "./lib/insert-audio";
import { loadCustomImages } from "./lib/custom-image";
import {
  createMusicVideoInsert,
  isMusicVideoSourceInsert,
  loadCustomMusic,
  type CustomMusicTrack,
} from "./lib/custom-music";
import { getSession } from "./lib/session";
import { getApiKeysHeaders, getApiKeysQueryParams } from "./lib/api-keys";
import {
  calculateDynamicDuration,
  calibrateTextToTargetDuration,
  fitSceneDurationForScene,
  narrationLeadIn,
  sceneClipSeconds,
  sceneDurationForScene,
  sceneDurationForText,
  singleSceneDuration,
  splitScriptIntoScenes,
} from "./lib/duration-utils";
import { TRANSITION_GROUPS, transitionsInGroup } from "./lib/scene-transition";
import type { Project, Scene, TimelineInsert, SceneMotionType, SceneTransitionType, EditorStep, CustomerLogoConfig, CaptionsConfig, AspectRatioType, ResolutionType, PacingModeType, RenderProfileSettings } from "./types";
import { DEFAULT_RENDER_PROFILE_SETTINGS, resolveRenderProfileSettings } from "./lib/render-profile";
import type { VideoFilterConfig } from "./data/video-filters";
import type { SectionConfig } from "./data/intro-outro";
import { VoiceEchoConfig, DEFAULT_VOICE_ECHO, resolveVoiceEcho } from "./lib/voice-echo";
import IconSprite from "./components/icons/IconSprite";
import Icon, { iconify } from "./components/icons/Icon";
import SiteCornerMenu from "./shared/SiteCornerMenu";
import SocialLinksRow from "./shared/SocialLinks";

type View = "create" | "editor";

/** Extra choices the Setup screen can make when a project is created. */
export interface NewProjectOptions {
  /** The whole script is one scene and the video is one continuous shot. */
  singleScene?: boolean;
  /** Narration on or off for the project from the very first frame. */
  voiceoverEnabled?: boolean;
  /** Footage uploaded in Setup, used as the single scene's picture. */
  clip?: {
    /** Stable `custom-video:<id>` address, resolved at playback time. */
    url: string;
    name: string;
    duration: number;
    /**
     * True when the creator chose to take the original sound out of the final
     * render. Captions are still transcribed from it first — see
     * `src/lib/speech-to-text.ts`.
     */
    mute?: boolean;
    /**
     * A transcript made in Setup before the project existed, installed on the
     * first scene as it is created.
     */
    transcript?: Partial<Scene>;
  };
  /** An uploaded song plus the first still for a voiceover-free music video. */
  audio?: {
    track: CustomMusicTrack;
    image: { url: string; name: string };
  };
}

export interface ProjectSettings {
  aspect_ratio: AspectRatioType;
  resolution: ResolutionType;
  pacing_mode: PacingModeType;
  scene_duration: number;
  motion_style: string;
  /** Enables the optional per-scene animation/effect stack. Defaults OFF for backward compatibility. */
  scene_animation_enabled: boolean;
  /**
   * One-scene project: the whole script is a single scene and a single shot,
   * rather than being chopped into 10/20/30-second scenes. This is the shape
   * a music video or a self-filmed take needs.
   */
  single_scene: boolean;
  /**
   * Project-wide narration switch. Off means no spoken track is synthesised,
   * previewed or rendered — for footage that carries its own sound.
   */
  voiceover_enabled: boolean;
  selected_voice: string;
  customer_logo: CustomerLogoConfig;
  captions_config: CaptionsConfig;
  /** ONE look applied to the entire video (every scene), like the music track */
  video_filter: VideoFilterConfig | null;
  /** the intro that plays before the script and the outro that plays after */
  intro_section: SectionConfig | null;
  outro_section: SectionConfig | null;
  /** echo / ambience on the narration — heard in the preview and rendered in */
  voice_echo: VoiceEchoConfig;
  /** transition effect applied between scenes across the entire video */
  transition: SceneTransitionType;
  /** the render profile chosen in Project Setup (destination, quality, fps…)
   *  — the render screen only displays these, it never edits them */
  render_profile: RenderProfileSettings;
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  aspect_ratio: "16:9",
  resolution: "1080p",
  pacing_mode: "auto_speech",
  scene_duration: 20,
  motion_style: "dynamic",
  scene_animation_enabled: false,
  single_scene: false,
  voiceover_enabled: true,
  selected_voice: "speechify_male_01",
  transition: "crossfade",
  customer_logo: {
    enabled: false,
    url: "",
    scale: 1.0,
    opacity: 1.0,
    margin: 20,
  },
  captions_config: {
    enabled: true,
    mode: "karaoke",
    /** Transparent unless the user asks for a solid box — matches
     *  DEFAULT_CAPTIONS_CONFIG in lib/render-captions. */
    backgroundStyle: "transparent",
    preset: "word_pop",
    fontSize: "medium",
    position: "bottom",
    uppercase: true,
    textColor: "#ffffff",
    highlightColor: "#facc15",
    bgColor: "rgba(0, 0, 0, 0.75)",
  },
  video_filter: null,
  intro_section: null,
  outro_section: null,
  voice_echo: DEFAULT_VOICE_ECHO,
  render_profile: DEFAULT_RENDER_PROFILE_SETTINGS,
};

// Split script into scenes and generate image search queries.
//
// The split itself lives in src/lib/duration-utils.ts so the count shown on
// the Setup screen and the scenes actually created can never disagree. Scenes
// come out EVEN — the old fixed-chunk slicing left a short final scene (e.g.
// 34 words in a 20-second slot, which played with ~6 seconds of silence).
function parseScript(
  script: string,
  targetDuration: number = 20,
  singleScene: boolean = false
): { text: string; imageQuery: string }[] {
  return splitScriptIntoScenes(script, targetDuration, singleScene).map((text) => {
    const queryWords = text
      .replace(/[^a-zA-Z\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const query = queryWords.slice(0, 5).join(" ");
    return { text, imageQuery: query || "abstract background" };
  });
}

/**
 * Image search via edge function.
 *
 * Asks for the top ~100 ranked candidates, keeps only the ones that verify as
 * real photographs (the server has already enforced 16:9 and ≥1920×1080),
 * and picks ONE at random (see lib/image-picker), so every search/re-search
 * produces a different photo instead of always serving the identical
 * first-ranked hit. URLs already used by other scenes are excluded via
 * fetchAll images runs so a whole project never ends up with duplicate photos.
 *
 * Returns the proxied url plus the raw upstream url (for dedup tracking).
 */
async function quickImageSearch(
  query: string,
  usedUrls?: ReadonlySet<string>
): Promise<{ proxyUrl: string; rawUrl: string } | null> {
  try {
    const headers = getApiKeysHeaders();
    const queryParams = getApiKeysQueryParams();
    const pool = await searchImagePool(query, { headers, queryParams });
    const chosen = pickRandomImageUrl(pool.map((c) => c.url), usedUrls);
    if (!chosen) return null;
    return {
      proxyUrl: proxyImageUrl(chosen),
      rawUrl: chosen,
    };
  } catch {
    return null;
  }
}

export default function App() {
  const [view, setView] = useState<View>("create");
  const [editorStep, setEditorStep] = useState<EditorStep>("scenes");
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [inserts, setInserts] = useState<TimelineInsert[]>([]);
  const [currentPlayheadTime, setCurrentPlayheadTime] = useState<number>(0);
  const [selectedInsert, setSelectedInsert] = useState<TimelineInsert | null>(null);
  const [editingInsert, setEditingInsert] = useState<TimelineInsert | null>(null);
  const [availableVoices, setAvailableVoices] = useState<{ id: string; name: string; gender?: "male" | "female"; accent?: string; locale?: string }[]>(() =>
    STUDIO_VOICE_PRESETS.map((v) => ({
      id: v.id,
      name: `${v.name} (${v.gender === "male" ? "Male" : "Female"} • ${v.accent})`,
      gender: v.gender,
      accent: v.accent,
      locale: v.locale,
    }))
  );
  const [loading, setLoading] = useState(false);
  /** Explains why a phase change was refused (e.g. no project yet) */
  const [navNotice, setNavNotice] = useState<string | null>(null);

  /**
   * The section the view is in. Setup and Scenes share the scenes editor step,
   * so the step alone is not enough to tell them apart — the setup frame is
   * what makes it Project Setup.
   */
  const currentPhase = stepToPhase(editorStep, view === "create");
  const currentPhaseIndex = phaseIndex(currentPhase);
  const [fetchingImages, setFetchingImages] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountModalFocusPlans, setAccountModalFocusPlans] = useState(false);
  const [accountModalFocusAdmin, setAccountModalFocusAdmin] = useState(false);
  useEffect(() => {
    const accessCode = new URLSearchParams(window.location.search).get("code");
    if (!accessCode) return;
    void redeemComplimentaryCode(accessCode).then(() => { setNavNotice("Complimentary membership activated. Your plan access is now available."); history.replaceState({}, "", "/app"); window.location.reload(); }).catch((error) => { setNavNotice(error.message || "The complimentary access code could not be redeemed."); history.replaceState({}, "", "/app"); });
  }, []);
  useEffect(() => {
    /**
     * One-click guarantee for the corner menu's account buttons. The menu
     * records the intent in sessionStorage before dispatching its event or
     * navigating, so a click that lands while the studio chunk is mounting
     * is still honoured when this listener registers.
     */
    const consumeIntent = (): string | null => {
      try {
        const intent = window.sessionStorage.getItem("scenering_account_intent");
        if (intent) window.sessionStorage.removeItem("scenering_account_intent");
        return intent;
      } catch { return null; }
    };
    const openAccount = (event: Event) => {
      const intent = consumeIntent();
      const focus = event instanceof CustomEvent ? event.detail?.focus : undefined;
      setAccountModalFocusPlans(focus === "plans");
      setAccountModalFocusAdmin(focus === "admin" || (!focus && intent === "admin"));
      setAccountModalOpen(true);
    };
    window.addEventListener("scenering-open-account", openAccount);
    const openFromNavigation = () => {
      const intent = consumeIntent();
      if (intent || new URLSearchParams(window.location.search).get("account") === "1") {
        setAccountModalFocusAdmin(intent === "admin");
        setAccountModalOpen(true);
      }
    };
    openFromNavigation();
    window.addEventListener("popstate", openFromNavigation);
    return () => {
      window.removeEventListener("scenering-open-account", openAccount);
      window.removeEventListener("popstate", openFromNavigation);
    };
  }, []);
  /** Scene jumped-to from the timeline — briefly highlighted in Scene Editor */
  const [focusedSceneId, setFocusedSceneId] = useState<number | null>(null);

  const [customerLogo, setCustomerLogo] = useState<CustomerLogoConfig>(DEFAULT_PROJECT_SETTINGS.customer_logo);
  const [captionsConfig, setCaptionsConfig] = useState<CaptionsConfig>(DEFAULT_PROJECT_SETTINGS.captions_config);
  const [selectedVoice, setSelectedVoice] = useState<string>(DEFAULT_PROJECT_SETTINGS.selected_voice);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioType>(DEFAULT_PROJECT_SETTINGS.aspect_ratio);
  const [sceneDuration, setSceneDuration] = useState<number>(DEFAULT_PROJECT_SETTINGS.scene_duration);
  const [resolution, setResolution] = useState<ResolutionType>(DEFAULT_PROJECT_SETTINGS.resolution);
  const [pacingMode, setPacingMode] = useState<PacingModeType>(DEFAULT_PROJECT_SETTINGS.pacing_mode);
  const [motionStyle, setMotionStyle] = useState<string>(DEFAULT_PROJECT_SETTINGS.motion_style);
  const [sceneAnimationEnabled, setSceneAnimationEnabled] = useState<boolean>(DEFAULT_PROJECT_SETTINGS.scene_animation_enabled);
  const [singleScene, setSingleScene] = useState<boolean>(DEFAULT_PROJECT_SETTINGS.single_scene);
  const [voiceoverEnabled, setVoiceoverEnabled] = useState<boolean>(DEFAULT_PROJECT_SETTINGS.voiceover_enabled);
  const [videoFilter, setVideoFilter] = useState<VideoFilterConfig | null>(DEFAULT_PROJECT_SETTINGS.video_filter);
  const [introSection, setIntroSection] = useState<SectionConfig | null>(DEFAULT_PROJECT_SETTINGS.intro_section);
  const [outroSection, setOutroSection] = useState<SectionConfig | null>(DEFAULT_PROJECT_SETTINGS.outro_section);
  const [voiceEcho, setVoiceEcho] = useState<VoiceEchoConfig>(DEFAULT_PROJECT_SETTINGS.voice_echo);
  const [videoTransition, setVideoTransition] = useState<SceneTransitionType>(DEFAULT_PROJECT_SETTINGS.transition);
  const [renderProfile, setRenderProfile] = useState<RenderProfileSettings>(DEFAULT_PROJECT_SETTINGS.render_profile);

  // Helper to save per-project settings so each project maintains isolated configuration
  const saveCurrentProjectSettings = useCallback((partial: Partial<ProjectSettings>) => {
    if (!currentProject) return;
    try {
      const stored = localStorage.getItem(`scenering_project_settings_${currentProject.id}`);
      const current = stored ? JSON.parse(stored) : { ...DEFAULT_PROJECT_SETTINGS, scene_duration: sceneDuration };
      const updated = { ...current, ...partial };
      localStorage.setItem(`scenering_project_settings_${currentProject.id}`, JSON.stringify(updated));
    } catch {}
  }, [currentProject, sceneDuration]);

  const handleUpdateCaptionsConfig = useCallback((cfg: CaptionsConfig) => {
    setCaptionsConfig(cfg);
    saveCurrentProjectSettings({ captions_config: cfg });
  }, [saveCurrentProjectSettings]);

  const handleUpdateVideoFilter = useCallback((cfg: VideoFilterConfig | null) => {
    setVideoFilter(cfg);
    saveCurrentProjectSettings({ video_filter: cfg });
  }, [saveCurrentProjectSettings]);

  const handleUpdateIntroSection = useCallback((cfg: SectionConfig | null) => {
    setIntroSection(cfg);
    saveCurrentProjectSettings({ intro_section: cfg });
  }, [saveCurrentProjectSettings]);

  const handleUpdateOutroSection = useCallback((cfg: SectionConfig | null) => {
    setOutroSection(cfg);
    saveCurrentProjectSettings({ outro_section: cfg });
  }, [saveCurrentProjectSettings]);

  const handleSelectVoice = useCallback((voiceId: string) => {
    setSelectedVoice(voiceId);
    saveCurrentProjectSettings({ selected_voice: voiceId });
  }, [saveCurrentProjectSettings]);

  const handleUpdateVoiceEcho = useCallback((cfg: VoiceEchoConfig) => {
    const resolved = resolveVoiceEcho(cfg);
    setVoiceEcho(resolved);
    saveCurrentProjectSettings({ voice_echo: resolved });
  }, [saveCurrentProjectSettings]);

  const [renderedBlob, setRenderedBlob] = useState<Blob | null>(null);
  /** Live render job + vault count, so the header can follow a render
      even while the user is working in another phase. */
  const [renderJob, setRenderJob] = useState<RenderJobStatus>(() => getRenderStatus());
  const [vaultReady, setVaultReady] = useState(0);

  useEffect(() => {
    const offJob = subscribeRenderStatus((status) => setRenderJob(status));
    const refresh = () => {
      listVaultRenders()
        .then((rows) => setVaultReady(rows.length))
        .catch(() => setVaultReady(0));
    };
    refresh();
    const offVault = subscribeVault(refresh);
    return () => {
      offJob();
      offVault();
    };
  }, []);

  /** True while a render is in flight — the render screen stays mounted (hidden)
      so the canvas keeps painting and the video keeps encoding. */
  const renderInFlight = renderJob.active;
  /** The render screen is being looked at right now. */
  const showRenderPage = view === "editor" && editorStep === "render";
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);

  const handleUpdateAspectRatio = useCallback((ratio: AspectRatioType) => {
    setAspectRatio(ratio);
    saveCurrentProjectSettings({ aspect_ratio: ratio });
    setCurrentProject((prev) => (prev ? { ...prev, aspect_ratio: ratio } : null));
  }, [saveCurrentProjectSettings]);

  const handleUpdateResolution = useCallback((res: ResolutionType) => {
    setResolution(res);
    saveCurrentProjectSettings({ resolution: res });
    setCurrentProject((prev) => (prev ? { ...prev, resolution: res } : null));
  }, [saveCurrentProjectSettings]);

  const handleUpdateRenderProfile = useCallback((patch: Partial<RenderProfileSettings>) => {
    setRenderProfile((prev) => {
      const next = { ...prev, ...patch };
      saveCurrentProjectSettings({ render_profile: next });
      return next;
    });
  }, [saveCurrentProjectSettings]);

  const handleUpdatePacingMode = useCallback((mode: PacingModeType) => {
    setPacingMode(mode);
    saveCurrentProjectSettings({ pacing_mode: mode });
    setCurrentProject((prev) => (prev ? { ...prev, pacing_mode: mode } : null));
  }, [saveCurrentProjectSettings]);

  const handleUpdateMotionStyle = useCallback((style: string) => {
    setMotionStyle(style);
    saveCurrentProjectSettings({ motion_style: style });
    setCurrentProject((prev) => (prev ? { ...prev, motion_style: style } : null));

    // When the new Scene Animation Effects system is ON, Setup no longer
    // pushes camera movement onto every scene. The selected global Ken Burns
    // value is preserved for backwards compatibility and for users who turn
    // Scene Animation Effects back OFF, but live camera movement is controlled
    // inside each scene's animation panel.
    if (sceneAnimationEnabled) return;

    const motionMap: Record<string, SceneMotionType> = {
      dynamic: "ken_burns",
      ken_burns: "ken_burns",
      zoom_in: "zoom_in",
      zoom_out: "zoom_out",
      pan: "pan_left",
      shake: "shake",
      floating: "floating",
      none: "none",
    };

    /**
     * Persist each scene's motion to its stored meta. Without this the choice
     * lived only in React state and was lost on reload, so the setting looked
     * like it had not applied.
     */
    const persistMotion = (sceneId: number, effect: SceneMotionType) => {
      try {
        const existing = localStorage.getItem(`scenering_scene_meta_${sceneId}`);
        const parsed = existing ? JSON.parse(existing) : {};
        localStorage.setItem(
          `scenering_scene_meta_${sceneId}`,
          JSON.stringify({ ...parsed, motion_effect: effect })
        );
      } catch {}
    };

    if (style === "dynamic") {
      const dynamicList: SceneMotionType[] = [
        "ken_burns",
        "zoom_in",
        "pan_left",
        "zoom_out",
        "pan_right",
        "floating",
      ];
      setScenes((prev) =>
        prev.map((s, idx) => {
          const effect = dynamicList[idx % dynamicList.length];
          persistMotion(s.id, effect);
          return { ...s, motion_effect: effect };
        })
      );
    } else {
      const targetEffect = motionMap[style] || "ken_burns";
      setScenes((prev) =>
        prev.map((s) => {
          persistMotion(s.id, targetEffect);
          return { ...s, motion_effect: targetEffect };
        })
      );
    }
  }, [saveCurrentProjectSettings, sceneAnimationEnabled]);

  const handleUpdateSceneAnimationEnabled = useCallback((enabled: boolean) => {
    setSceneAnimationEnabled(enabled);
    saveCurrentProjectSettings({ scene_animation_enabled: enabled });
  }, [saveCurrentProjectSettings]);

  /** Source-media projects keep their own soundtrack; narration never overlays it. */
  const mediaSourceVoiceoverLocked = singleScene && (
    scenes.some((scene) => scene.source_media_kind === "uploaded_video" && Boolean(scene.video_url)) ||
    inserts.some(isMusicVideoSourceInsert)
  );

  // Repair stale settings from projects created before source modes enforced
  // this invariant. Keeping it in App protects preview and export, not only UI.
  useEffect(() => {
    if (!mediaSourceVoiceoverLocked || !voiceoverEnabled) return;
    setVoiceoverEnabled(false);
    saveCurrentProjectSettings({ voiceover_enabled: false });
  }, [mediaSourceVoiceoverLocked, voiceoverEnabled, saveCurrentProjectSettings]);

  /**
   * Narration on or off for the whole project.
   *
   * The preview and the renderer both read this before they synthesise a
   * single word, so flipping it is heard immediately — nothing has to be
   * regenerated or re-applied afterwards.
   */
  const handleUpdateVoiceoverEnabled = useCallback((enabled: boolean) => {
    const next = mediaSourceVoiceoverLocked ? false : enabled;
    setVoiceoverEnabled(next);
    saveCurrentProjectSettings({ voiceover_enabled: next });
  }, [mediaSourceVoiceoverLocked, saveCurrentProjectSettings]);

  /**
   * Switch an existing project between split scenes and one single scene.
   *
   * Turning it ON merges the scenes back into one (the script is rejoined in
   * order); turning it OFF re-splits at the project's scene duration. Either
   * way the script itself is never rewritten — only how it is cut up.
   */
  /**
   * Attach footage uploaded in Setup to the project's single scene.
   *
   * Only reached for a project that already exists — a brand-new one carries
   * the clip through `handleCreateProject` instead. The clip's own length
   * becomes the scene's length, because the footage is the video now.
   */
  const handleAttachSingleSceneClip = useCallback(
    (clip: { url: string; name: string; duration: number; /** false silences the clip's own soundtrack in the render. */ mute?: boolean }) => {
      // Uploaded-video sound and a separate music insert are mutually
      // exclusive source modes; never leave a background track over footage.
      setInserts((prev) => prev.filter((insert) => insert.category !== "background_music"));
      setScenes((prev) => {
        if (prev.length === 0) return prev;
        const transcriptReset: Partial<Scene> = prev[0].caption_source === "transcript"
          ? { text: "", caption_words: [], caption_source: "manual", caption_audio_duration: 0 }
          : {};
        const clipFields: Partial<Scene> = {
          source_media_kind: "uploaded_video",
          video_url: clip.url,
          video_name: clip.name,
          video_duration: clip.duration,
          video_trim_start: 0,
          // The whole file, start to finish: a one-scene project is the
          // footage, so nothing is trimmed away.
          video_trim_end: clip.duration,
          video_mute: clip.mute ?? false,
          video_volume: 1,
          video_fit_mode: "trim",
          // A transcript belongs to the source it was heard from. Replacing
          // source audio must not leave the old song's words on new footage.
          ...transcriptReset,
        };
        const duration = singleSceneDuration(prev[0].text || "", clip.duration);
        const updated = prev.map((sc, i) => (i === 0 ? { ...sc, ...clipFields, duration } : sc));
        try {
          const first = updated[0];
          supabase
            .from("scenes")
            .update({
              duration,
              ...(transcriptReset.text !== undefined ? { text: transcriptReset.text } : {}),
            })
            .eq("id", first.id)
            .then();
          const existingMeta = localStorage.getItem(`scenering_scene_meta_${first.id}`);
          const parsedMeta = existingMeta ? JSON.parse(existingMeta) : {};
          localStorage.setItem(
            `scenering_scene_meta_${first.id}`,
            JSON.stringify({ ...parsedMeta, ...clipFields, duration })
          );
        } catch {}
        return updated;
      });
      /* The footage is the project's length now, so the project's own duration
         reads as the video's length rather than the 10/20/30 target the
         project was created with. Everything that reports "how long is this
         video" (Setup, the timeline, the render summary) reads this. */
      const clipDuration = Math.round(clip.duration * 10) / 10;
      setSceneDuration(clipDuration);
      saveCurrentProjectSettings({ scene_duration: clipDuration });
      setCurrentProject((prev) => (prev ? { ...prev, default_duration: clipDuration } : null));
      try {
        if (currentProject?.id) {
          supabase.from("projects").update({ default_duration: clipDuration }).eq("id", currentProject.id).then();
        }
      } catch {}
    },
    [currentProject?.id, saveCurrentProjectSettings]
  );

  const handleUpdateSingleScene = useCallback((enabled: boolean) => {
    setSingleScene(enabled);
    saveCurrentProjectSettings({ single_scene: enabled });
  }, [saveCurrentProjectSettings]);

  /**
   * Re-times every scene for a chosen target length.
   *
   * `overrideSingleScene` exists for the same reason `handleUpdateScript` has
   * one: Setup flips the one-scene switch in the same click, and that state
   * update has not landed yet. Without it, picking "20 Seconds" on a one-scene
   * project would still be answered by the footage rule.
   *
   * A one-scene project's footage is never re-timed — that is the cut this
   * handler used to make. See `sceneDurationForScene`.
   */
  const handleUpdateSceneDuration = useCallback((dur: number, overrideSingleScene?: boolean) => {
    const oneScene = overrideSingleScene ?? singleScene;
    /* The project's own length follows the footage in a one-scene project, so
       "20 seconds" chosen on the setup frame cannot quietly shorten the video
       the creator uploaded. Read here, from the scenes in scope, rather than
       from inside the state updater below: an updater must be pure, and React
       runs it twice under StrictMode. */
    const footage = oneScene ? sceneClipSeconds(scenes[0]) : 0;
    const projectDuration = footage > 0 ? Math.round(footage * 10) / 10 : dur;
    setSceneDuration(projectDuration);
    saveCurrentProjectSettings({ scene_duration: projectDuration });
    setCurrentProject((current) => (current ? { ...current, default_duration: projectDuration } : null));
    setScenes((prev) =>
      prev.map((s) => {
        // Fit each scene to its own narration rather than stamping them all —
        // unless the scene IS footage, which keeps its own length.
        const duration = sceneDurationForScene(s, { singleScene: oneScene, targetDuration: dur });
        try {
          supabase.from("scenes").update({ duration }).eq("id", s.id).then();
          const existingMeta = localStorage.getItem(`scenering_scene_meta_${s.id}`);
          const parsed = existingMeta ? JSON.parse(existingMeta) : {};
          localStorage.setItem(`scenering_scene_meta_${s.id}`, JSON.stringify({ ...parsed, duration }));
        } catch {}
        return { ...s, duration };
      })
    );
  }, [saveCurrentProjectSettings, singleScene, scenes]);

  const handleCalibrateScenesWordCount = useCallback((targetSeconds: number, overrideSingleScene?: boolean) => {
    const oneScene = overrideSingleScene ?? singleScene;
    const footage = oneScene ? sceneClipSeconds(scenes[0]) : 0;
    const projectDuration = footage > 0 ? Math.round(footage * 10) / 10 : targetSeconds;
    setSceneDuration(projectDuration);
    saveCurrentProjectSettings({ scene_duration: projectDuration });
    setCurrentProject((current) => (current ? { ...current, default_duration: projectDuration } : null));
    setScenes((prev) =>
      prev.map((s) => {
        // Each scene is timed to its own narration, bounded by the target —
        // unless the scene IS footage, which keeps its own length.
        const fitted = sceneDurationForScene(s, { singleScene: oneScene, targetDuration: targetSeconds });
        // Persist updated duration without mutating text
        try {
          supabase.from("scenes").update({ duration: fitted }).eq("id", s.id).then();
          const existingMeta = localStorage.getItem(`scenering_scene_meta_${s.id}`);
          const parsed = existingMeta ? JSON.parse(existingMeta) : {};
          localStorage.setItem(
            `scenering_scene_meta_${s.id}`,
            JSON.stringify({ ...parsed, duration: fitted })
          );
        } catch {}
        return {
          ...s,
          duration: fitted,
        };
      })
    );
  }, [saveCurrentProjectSettings, singleScene, scenes]);

  const handleFitAllScenesDurationToSpeech = useCallback(() => {
    setScenes((prev) =>
      prev.map((s) => {
        const fitDur = fitSceneDurationForScene(s, { singleScene });
        try {
          supabase.from("scenes").update({ duration: fitDur }).eq("id", s.id).then();
          const existingMeta = localStorage.getItem(`scenering_scene_meta_${s.id}`);
          const parsed = existingMeta ? JSON.parse(existingMeta) : {};
          localStorage.setItem(
            `scenering_scene_meta_${s.id}`,
            JSON.stringify({ ...parsed, duration: fitDur })
          );
        } catch {}
        return {
          ...s,
          duration: fitDur,
        };
      })
    );
  }, [singleScene]);

  /**
   * Persists the title as well as holding it in state. Previously this only
   * updated React state, so the title was lost the moment the project was
   * reloaded or reselected.
   */
  const handleUpdateProjectTitle = useCallback((title: string) => {
    setCurrentProject((prev) => {
      if (!prev) return null;
      try {
        supabase.from("projects").update({ title }).eq("id", prev.id).then();
      } catch {}
      return { ...prev, title };
    });
    setProjects((prev) => prev.map((p) => (p.id === currentProject?.id ? { ...p, title } : p)));
  }, [currentProject?.id]);

  /**
   * What Setup last saved for the current project: the script, scene length
   * and one-scene choice. Setup's Next — and leaving Setup by a tab — only
   * rebuild the scenes when the Setup box differs from it, so going back to
   * Setup and on again changes nothing that was not edited there, and "Save
   * Script Text" stays a deliberate save without a rebuild. Updated
   * synchronously, so a second check in the same click sees the first save.
   */
  const savedSetupRef = useRef<(SetupInputs & { projectId: number }) | null>(null);

  const handleUpdateScript = useCallback(
    (
      newScript: string,
      /** true rebuilds the scenes; "if-changed" only when the script, scene
       *  length or one-scene choice differs from what Setup last saved. */
      regenerateScenes: boolean | "if-changed" = false,
      overrideDuration?: number,
      /** Setup passes this when the user flips the one-scene switch in the
       *  same click, because the state update has not landed yet. */
      overrideSingleScene?: boolean
    ) => {
      const targetDur = overrideDuration || sceneDuration || 20;
      const oneScene = overrideSingleScene ?? singleScene;
      const projectId = currentProject?.id;
      const saved: SetupInputs =
        savedSetupRef.current && savedSetupRef.current.projectId === projectId
          ? savedSetupRef.current
          : {
              script: currentProject?.script?.trim() || scenes.map((s) => s.text).join("\n\n"),
              duration: sceneDuration || 20,
              oneScene: singleScene,
            };
      const submitted: SetupInputs = { script: newScript, duration: targetDur, oneScene };
      if (regenerateScenes === "if-changed" && !setupNeedsRebuild(submitted, saved)) {
        // Nothing was changed in Setup: every scene, and everything set on
        // it in the other sections, stays exactly as it is.
        return;
      }
      if (projectId) savedSetupRef.current = { projectId, ...submitted };

      setCurrentProject((prev) => (prev ? { ...prev, script: newScript } : null));

      // Always persist the script text itself. It used to be written only on
      // the regenerate path, so a plain "save" left the stored script stale
      // and the setup screen showed the old text after a reload.
      try {
        if (currentProject?.id) {
          supabase.from("projects").update({ script: newScript }).eq("id", currentProject.id).then();
        }
      } catch {}

      if (regenerateScenes) {
        const parsed = parseScript(newScript, targetDur, oneScene);
        // A new target length or a one-scene switch re-times every scene;
        // otherwise only scenes whose words changed get a new length.
        const retimeAll = targetDur !== saved.duration || oneScene !== saved.oneScene;
        setScenes((prev) => {
          // Each scene keeps every setting it had — see src/lib/scene-rebuild.ts.
          // A one-scene project has no per-scene target to be bounded by, and
          // when footage is attached, the footage decides its length.
          const { scenes: newScenes, removed } = rebuildScenesFromScript(prev, parsed, {
            projectId: currentProject?.id || 1,
            retimeAll,
            durationFor: (text, existing) =>
              oneScene ? singleSceneDuration(text, existing?.video_duration) : sceneDurationForText(text, targetDur),
          });

          /* What the project row should say its length is. For a split-scene
             project that is the per-scene target, as it has always been. In a
             one-scene project the target means nothing — the scene's own
             length is the project's, so writing the target here left the row
             claiming twenty seconds for a project whose only scene was three
             minutes long, and the next reload read the claim back. */
          const projectDuration = oneScene && newScenes.length > 0 ? newScenes[0].duration : targetDur;

          // Persist each scene to Supabase & localStorage
          try {
            if (currentProject?.id) {
              supabase.from("projects").update({ script: newScript, default_duration: projectDuration }).eq("id", currentProject.id).then();
            }
            // Re-splitting can produce FEWER scenes than before — most
            // dramatically when switching to a one-scene project, where a
            // dozen become one. The rows left behind used to survive in
            // storage and reappear on the next reload, so the project the
            // user saved was not the project they got back.
            for (const stale of removed) {
              supabase.from("scenes").delete().eq("id", stale.id).then();
              localStorage.removeItem(`scenering_scene_meta_${stale.id}`);
            }
            for (const s of newScenes) {
              // The Supabase scenes table intentionally stores only the core
              // script/image/timing fields; studio-only metadata such as
              // motion, animation stacks, framing and voices live in local
              // scene meta so older deployments keep working.
              supabase.from("scenes").upsert({
                id: s.id,
                project_id: s.project_id,
                order_index: s.order_index,
                text: s.text,
                image_query: s.image_query,
                image_url: s.image_url,
                duration: s.duration,
              }).then();
              const existingMeta = localStorage.getItem(`scenering_scene_meta_${s.id}`);
              const parsedMeta = existingMeta ? JSON.parse(existingMeta) : {};
              localStorage.setItem(
                `scenering_scene_meta_${s.id}`,
                JSON.stringify({
                  ...parsedMeta,
                  duration: s.duration,
                  text: s.text,
                  motion_effect: s.motion_effect,
                  animation: s.animation,
                })
              );
            }
          } catch {}

          return newScenes;
        });
      }
    },
    [currentProject?.id, currentProject?.script, sceneDuration, singleScene, scenes]
  );

  // Timeline & Video Preview playback synchronization
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const togglePreviewPlayRef = useRef<() => void>(() => {});

  const handlePlayStateChange = useCallback((isPlaying: boolean, togglePlay: () => void) => {
    setIsPlayingPreview(isPlaying);
    togglePreviewPlayRef.current = togglePlay;
  }, []);

  const handleUpdateCustomerLogo = (updates: Partial<CustomerLogoConfig>) => {
    setCustomerLogo((prev) => {
      const updated = { ...prev, ...updates };
      saveCurrentProjectSettings({ customer_logo: updated });
      return updated;
    });
  };

  // Caption typefaces (classical → formal → artsy → fun) are fetched once so the
  // live preview and the final render paint the real faces rather than fallbacks.
  useEffect(() => {
    loadCaptionFonts();
  }, []);

  /**
   * Re-open any uploaded footage before the first project loads.
   *
   * Scenes store the stable address `custom-video:<id>`; the object URL it
   * resolves to only exists for this page load, so the store has to be read
   * back from IndexedDB or a saved one-scene project opens to a black frame.
   */
  useEffect(() => {
    loadCustomVideos().catch(() => {});
    // Same story for uploaded photos: `custom-image:<id>` only resolves once
    // the store has been read back from IndexedDB.
    loadCustomImages().catch(() => {});
    // And for uploaded music/section sounds (`custom-music:<id>`): loading
    // only happened when the music library mounted, so a saved project
    // previewed or exported before that step was visited played silence.
    loadCustomMusic().catch(() => {});
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ownerId = getSession()?.user.id;
      // Legacy browser projects have no owner field; keep them visible and
      // adopt them into the first authenticated account rather than deleting
      // work during the account-system migration.
      const owned = (data as (Project & { user_id?: string | null })[]).filter((project) => !project.user_id || project.user_id === ownerId);
      setProjects(owned as Project[]);
      if (ownerId) for (const project of owned) if (!project.user_id) void supabase.from("projects").update({ user_id: ownerId }).eq("id", project.id).then();
    } catch (err) {
      console.error("Failed to fetch projects:", err);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  /**
   * Where the user is working, per browser tab. If the studio reloads, reopen
   * the same project and editor phase rather than dropping them at Setup.
   */
  useEffect(() => {
    try {
      if (view === "editor" && currentProject) {
        window.sessionStorage.setItem("scenering_resume", JSON.stringify({ projectId: currentProject.id, step: editorStep }));
      } else if (view === "create") {
        window.sessionStorage.removeItem("scenering_resume");
      }
    } catch { /* storage unavailable */ }
  }, [view, editorStep, currentProject]);

  /** Read the saved position before the persistence effect can clear it. */
  const resumeStateRef = useRef<{ projectId?: number; step?: EditorStep } | null | "unread">("unread");
  if (resumeStateRef.current === "unread") {
    try { resumeStateRef.current = JSON.parse(window.sessionStorage.getItem("scenering_resume") || "null"); }
    catch { resumeStateRef.current = null; }
  }
  const resumeAttemptedRef = useRef(false);
  useEffect(() => {
    if (resumeAttemptedRef.current || projects.length === 0) return;
    resumeAttemptedRef.current = true;
    if (view !== "create" || currentProject) return;
    const saved = resumeStateRef.current;
    if (saved === "unread" || !saved?.projectId) return;
    const project = projects.find((item) => item.id === saved.projectId);
    if (!project) return;
    const step = saved.step;
    void handleSelectProject(project).then(() => {
      if (step && ["scenes", "voiceover", "captions", "studio", "render"].includes(step)) setEditorStep(step);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  // Save inserts to localStorage whenever they change
  useEffect(() => {
    if (!currentProject) return;
    try {
      localStorage.setItem(
        `scenering_inserts_${currentProject.id}`,
        JSON.stringify(inserts)
      );
    } catch (e) {
      console.error("Failed to persist inserts:", e);
    }
  }, [inserts, currentProject]);

  const handleCreateProject = async (
    title: string,
    script: string,
    targetDuration?: number,
    /**
     * One-scene projects, and the footage a one-scene project may start from.
     * Everything here is optional so the normal split-scene path is unchanged.
     */
    options?: NewProjectOptions
  ): Promise<boolean> => {
    const chosenDuration = targetDuration || 20;
    const oneScene = options?.singleScene ?? false;
    const clip = oneScene ? options?.clip : undefined;
    const audio = oneScene ? options?.audio : undefined;
    // Source media keeps its own soundtrack; neither route synthesises a
    // second voice over the uploaded video or song.
    const narration = audio || clip ? false : options?.voiceoverEnabled ?? true;
    /* Footage decides the length when there is footage; otherwise an uploaded
       song decides it. Both are source media, so neither is cut back to the
       10/20/30 spoken-scene target. */
    const footageDuration = clip && clip.duration > 0 ? Math.round(clip.duration * 10) / 10 : 0;
    const audioDuration = audio && audio.track.duration > 0
      ? Math.round(audio.track.duration * 10) / 10
      : 0;
    const projectDuration = footageDuration > 0
      ? footageDuration
      : audioDuration > 0
        ? audioDuration
        : chosenDuration;
    // Keep the canvas choices made on the single setup frame (aspect ratio, resolution, motion)
    const chosenAspect = aspectRatio;
    const chosenResolution = resolution;
    const chosenMotion = motionStyle;
    setLoading(true);
    try {
      const { data: projectData, error: projectError } = await supabase
        .from("projects")
        .insert({ title, script, default_duration: projectDuration, user_id: getSession()?.user.id ?? null })
        .select()
        .single();
      if (projectError) throw projectError;

      const project = projectData as Project;
      const parsedScenes = parseScript(script, chosenDuration, oneScene);
      const initialInserts = audio ? [createMusicVideoInsert(audio.track)] : [];

      // Clean, isolated project setup with defaults
      const freshSettings: ProjectSettings = {
        ...DEFAULT_PROJECT_SETTINGS,
        scene_duration: projectDuration,
        aspect_ratio: chosenAspect,
        resolution: chosenResolution,
        motion_style: chosenMotion,
        scene_animation_enabled: sceneAnimationEnabled,
        single_scene: oneScene,
        voiceover_enabled: narration,
      };

      try {
        localStorage.setItem(`scenering_project_settings_${project.id}`, JSON.stringify(freshSettings));
        localStorage.setItem(`scenering_inserts_${project.id}`, JSON.stringify(initialInserts));
      } catch {}

      // Create scenes from user's script segments.
      //
      // A one-scene project always has exactly one scene, even with no script
      // at all: someone uploading a music video has footage and no words, and
      // the rest of the app (captions, music, the studio, the timeline) is
      // built around there being a scene to hang them on.
      const sceneSources = oneScene && parsedScenes.length === 0
        ? [{ text: "", imageQuery: clip ? "" : (audio?.image.name || "abstract background") }]
        : parsedScenes;

      const sceneRows = sceneSources.map((s, i) => {
        const sceneText = s.text.trim();
        return {
          project_id: project.id,
          order_index: i,
          text: sceneText,
          image_query: s.imageQuery,
          image_url: audio && i === 0 ? audio.image.url : null,
          duration: oneScene
            ? singleSceneDuration(sceneText, clip?.duration || audio?.track.duration)
            : sceneDurationForText(sceneText, chosenDuration),
        };
      });

      const { data: scenesData, error: scenesError } = await supabase
        .from("scenes")
        .insert(sceneRows)
        .select()
        .order("order_index", { ascending: true });
      if (scenesError) throw scenesError;

      // Apply clean settings to state
      setCustomerLogo(freshSettings.customer_logo);
      setCaptionsConfig(freshSettings.captions_config);
      setSelectedVoice(migrateLegacyVoiceId(freshSettings.selected_voice) || DEFAULT_PROJECT_SETTINGS.selected_voice);
      setVoiceEcho(resolveVoiceEcho(freshSettings.voice_echo));
      setAspectRatio(freshSettings.aspect_ratio);
      setResolution(freshSettings.resolution);
      setPacingMode(freshSettings.pacing_mode);
      setSceneDuration(projectDuration);
      setMotionStyle(freshSettings.motion_style);
      setSceneAnimationEnabled(freshSettings.scene_animation_enabled);
      setVideoTransition(freshSettings.transition);
      setRenderProfile(resolveRenderProfileSettings(freshSettings.render_profile));

      setSingleScene(oneScene);
      setVoiceoverEnabled(narration);

      // The uploaded video becomes the single scene's picture. It is stored
      // under the scene's own meta key, which is the same place the scene
      // editor's clip panel writes to — so the footage is still attached
      // after a reload, and can be trimmed or muted there like any clip.
      let createdScenes = (scenesData as Scene[]).map((sc) => ({ ...sc, transition: freshSettings.transition }));
      if (clip && createdScenes.length > 0) {
        const clipFields: Partial<Scene> = {
          source_media_kind: "uploaded_video",
          video_url: clip.url,
          video_name: clip.name,
          video_duration: clip.duration,
          video_trim_start: 0,
          video_trim_end: clip.duration,
          // It is their own footage: its soundtrack plays unless they chose to
          // take it out in Setup (or mute it later in the scene editor). This
          // is the whole point of a music video.
          video_mute: clip.mute ?? false,
          video_volume: 1,
          video_fit_mode: "trim",
          /* A transcript made in Setup rides along, so the first scene is born
             with its captions already on it — words in `text`, timings in
             `caption_words`, which is exactly what the Captions step and the
             renderer read. */
          ...(clip.transcript || {}),
        };
        createdScenes = createdScenes.map((sc, i) => (i === 0 ? { ...sc, ...clipFields } : sc));
        try {
          const first = createdScenes[0];
          const existingMeta = localStorage.getItem(`scenering_scene_meta_${first.id}`);
          const parsedMeta = existingMeta ? JSON.parse(existingMeta) : {};
          localStorage.setItem(
            `scenering_scene_meta_${first.id}`,
            JSON.stringify({ ...parsedMeta, ...clipFields, duration: first.duration })
          );
        } catch {}
      }

      // `addCustomImage` supplied a stable custom-image address in Setup. Pin
      // it exactly as SceneEditor's upload path does, so a later script edit or
      // image search cannot silently replace the creator's chosen artwork.
      if (audio && createdScenes.length > 0) {
        const imageFields: Partial<Scene> = {
          source_media_kind: "audio_image",
          image_url: audio.image.url,
          image_query: audio.image.name,
          image_query_locked: true,
          blank_color: null,
        };
        createdScenes = createdScenes.map((sc, i) => (i === 0 ? { ...sc, ...imageFields } : sc));
        try {
          const first = createdScenes[0];
          const existingMeta = localStorage.getItem(`scenering_scene_meta_${first.id}`);
          const parsedMeta = existingMeta ? JSON.parse(existingMeta) : {};
          localStorage.setItem(
            `scenering_scene_meta_${first.id}`,
            JSON.stringify({ ...parsedMeta, ...imageFields, duration: first.duration })
          );
        } catch {}
      }

      setNavNotice(null);
      setCurrentProject(project);
      setScenes(createdScenes);
      setInserts(initialInserts);
      setCurrentPlayheadTime(0);
      setEditorStep("scenes");
      setView("editor");
      fetchProjects();
      return true;
    } catch (err) {
      console.error("Failed to create project:", err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  /* ------------------------------------------------------------------ *
   * Moving between sections — see src/lib/phase-gate.ts for the rule.
   *
   * With a project open every section is open: the tab row, Previous, Next
   * and the sections' own links all go straight where they point. Leaving a
   * section by any of them commits it — the per-project settings snapshot,
   * the scene rows in one batch, and a commit stamp the section can report —
   * and leaving Setup first applies a script edited there. With no project
   * open, only Setup (the start) opens.
   * ------------------------------------------------------------------ */
  const [committingPhase, setCommittingPhase] = useState<ProjectPhase | null>(null);
  const [phaseCommits, setPhaseCommits] = useState<PhaseCommits>({});

  useEffect(() => {
    if (!currentProject) {
      setPhaseCommits({});
      return;
    }
    try {
      setPhaseCommits(parsePhaseCommits(localStorage.getItem(commitStorageKey(currentProject.id))));
    } catch {
      setPhaseCommits({});
    }
  }, [currentProject]);

  /** Writes this section's work down, and says whether it landed. */
  const commitPhaseEffects = useCallback(async (phase: ProjectPhase): Promise<boolean> => {
    if (!currentProject) return true;
    /* 1. The settings snapshot — everything a section can change about the
       project. Written on change too, but the commit is what makes the
       section's state authoritative before the next one opens. */
    saveCurrentProjectSettings({
      scene_duration: sceneDuration,
      resolution,
      aspect_ratio: aspectRatio,
      pacing_mode: pacingMode,
      motion_style: motionStyle,
      scene_animation_enabled: sceneAnimationEnabled,
      single_scene: singleScene,
      voiceover_enabled: voiceoverEnabled,
      selected_voice: selectedVoice,
      captions_config: captionsConfig,
      video_filter: videoFilter,
      intro_section: introSection,
      outro_section: outroSection,
      voice_echo: voiceEcho,
      transition: videoTransition,
      render_profile: renderProfile,
    });
    /* 2. The scene rows, one batch. Only the core script/image/timing fields
       live in the database; the studio metadata is written as it changes.
       Setup writes its own scene rows: a script change rebuilds and saves the
       scenes in the same click, so the list captured here would still be the
       old one, and flushing it would put the old rows back. */
    const rows = phase === "setup" ? [] : sceneRowsForCommit(scenes);
    let saved = true;
    if (rows.length) {
      try {
        const { error } = await supabase.from("scenes").upsert(rows);
        if (error) throw error;
      } catch (err) {
        saved = false;
        console.error("Section commit could not write the scenes:", err);
      }
    }
    /* 3. The stamp, so the section can report its own state after a reload. */
    if (saved) {
      const at = new Date().toISOString();
      setPhaseCommits((prev) => {
        const updated = recordPhaseCommit(prev, phase, at);
        try { localStorage.setItem(commitStorageKey(currentProject.id), JSON.stringify(updated)); } catch { /* storage unavailable */ }
        return updated;
      });
    }
    return saved;
  }, [
    currentProject, saveCurrentProjectSettings, sceneDuration, resolution, aspectRatio, pacingMode,
    motionStyle, sceneAnimationEnabled, singleScene, voiceoverEnabled, selectedVoice, captionsConfig,
    videoFilter, introSection, outroSection, voiceEcho, videoTransition, renderProfile, scenes,
  ]);

  /** The one navigation entry point for phase changes. */
  const goToPhase = async (target: ProjectPhase, options: { viaNext?: boolean } = {}) => {
    if (committingPhase) return;
    /* Every phase after Setup needs a project to work on. Without this guard
       the tabs and Next buttons would switch to an empty editor, which looked
       like the button "did nothing". */
    if (isPhaseLocked(target, Boolean(currentProject))) {
      setView("create");
      setNavNotice("Create a project on this screen first — then the other phases open up.");
      return;
    }
    const from = currentPhase;
    if (currentProject && from !== target) {
      // A script edited in Setup applies however Setup is left — Next, a tab
      // or a link — and only rebuilds the scenes if it really changed.
      if (from === "setup") {
        const pendingScript = readDraft(currentProject.id).script?.trim();
        if (pendingScript) handleUpdateScript(pendingScript, "if-changed", sceneDuration, singleScene);
      }
      setCommittingPhase(from);
      const saved = await commitPhaseEffects(from);
      setCommittingPhase(null);
      if (!saved) {
        setNavNotice(`${getPhase(from).phase} could not be saved. Check your connection, then press Next again.`);
      } else if (options.viaNext) {
        setNavNotice(`${getPhase(from).phase} committed — ${getPhase(target).phase} is open.`);
      }
    }
    if (target === "setup") {
      setView("create");
    } else {
      setView("editor");
      setEditorStep(phaseToStep(target));
    }
  };
  const goToPhaseRef = useRef(goToPhase);
  goToPhaseRef.current = goToPhase;

  /** The tab row, Previous, and the sections' own phase links. */
  const navigateToPhase = (phase: ProjectPhase) => {
    void goToPhaseRef.current(phase);
  };

  /** A section's own Next button: commit the section, then open the next. */
  const commitAndAdvance = useCallback(async (target: ProjectPhase) => {
    await goToPhaseRef.current(target, { viaNext: true });
  }, []);

  /**
   * A section's own Next / "save and continue", and links such as "fix this
   * in Captions". A forward request is a Next press and confirms the save.
   */
  const handleStepRequest = useCallback((step: EditorStep) => {
    const target = stepToPhase(step, false);
    void goToPhaseRef.current(target, { viaNext: phaseIndex(target) > phaseIndex(currentPhase) });
  }, [currentPhase]);

  /** Clears the editor so the setup frame starts a brand new project */
  const getPhaseDef = (phase: ProjectPhase) =>
    PROJECT_PHASES.find((p) => p.id === phase) || PROJECT_PHASES[0];

  const handleStartNewProject = () => {
    setCurrentProject(null);
    setScenes([]);
    setInserts([]);
    setSelectedInsert(null);
    setEditingInsert(null);
    setRenderedBlob(null);
    setRenderedUrl(null);
    setCustomerLogo(DEFAULT_PROJECT_SETTINGS.customer_logo);
    setCaptionsConfig(DEFAULT_PROJECT_SETTINGS.captions_config);
    setSelectedVoice(DEFAULT_PROJECT_SETTINGS.selected_voice);
    setVoiceEcho(DEFAULT_PROJECT_SETTINGS.voice_echo);
    setAspectRatio(DEFAULT_PROJECT_SETTINGS.aspect_ratio);
    setResolution(DEFAULT_PROJECT_SETTINGS.resolution);
    setPacingMode(DEFAULT_PROJECT_SETTINGS.pacing_mode);
    setSceneDuration(DEFAULT_PROJECT_SETTINGS.scene_duration);
    setMotionStyle(DEFAULT_PROJECT_SETTINGS.motion_style);
    setSceneAnimationEnabled(DEFAULT_PROJECT_SETTINGS.scene_animation_enabled);
    setSingleScene(DEFAULT_PROJECT_SETTINGS.single_scene);
    setVoiceoverEnabled(DEFAULT_PROJECT_SETTINGS.voiceover_enabled);
    setVideoFilter(DEFAULT_PROJECT_SETTINGS.video_filter);
    setIntroSection(DEFAULT_PROJECT_SETTINGS.intro_section);
    setOutroSection(DEFAULT_PROJECT_SETTINGS.outro_section);
    setVideoTransition(DEFAULT_PROJECT_SETTINGS.transition);
    setRenderProfile(DEFAULT_PROJECT_SETTINGS.render_profile);
    setView("create");
  };

  const handleSelectProject = async (project: Project) => {
    try {
      const targetDur = project.default_duration || 20;

      // Load this project's isolated settings
      let projectSettings: ProjectSettings = {
        ...DEFAULT_PROJECT_SETTINGS,
        scene_duration: targetDur,
      };
      try {
        const storedSettings = localStorage.getItem(`scenering_project_settings_${project.id}`);
        if (storedSettings) {
          projectSettings = { ...projectSettings, ...JSON.parse(storedSettings) };
        }
      } catch {}
      projectSettings.selected_voice = migrateLegacyVoiceId(projectSettings.selected_voice) || DEFAULT_PROJECT_SETTINGS.selected_voice;

      // Apply this project's setup and effects
      setNavNotice(null);
      setCustomerLogo(projectSettings.customer_logo);
      setCaptionsConfig(projectSettings.captions_config);
      setSelectedVoice(projectSettings.selected_voice);
      setVoiceEcho(resolveVoiceEcho(projectSettings.voice_echo));
      setAspectRatio(projectSettings.aspect_ratio);
      setResolution(projectSettings.resolution);
      setPacingMode(projectSettings.pacing_mode);
      setSceneDuration(projectSettings.scene_duration);
      setMotionStyle(projectSettings.motion_style);
      setSceneAnimationEnabled(projectSettings.scene_animation_enabled ?? false);
      // Older projects pre-date both switches: they were all split-scene and
      // all narrated, which is exactly what these defaults restore.
      setSingleScene(projectSettings.single_scene ?? false);
      setVoiceoverEnabled(projectSettings.voiceover_enabled ?? true);
      setVideoFilter(projectSettings.video_filter ?? null);
      setIntroSection(projectSettings.intro_section ?? null);
      setOutroSection(projectSettings.outro_section ?? null);
      const projTransition = (projectSettings.transition as SceneTransitionType) || "crossfade";
      setVideoTransition(projTransition);
      setRenderProfile(resolveRenderProfileSettings(projectSettings.render_profile));

      const { data, error } = await supabase
        .from("scenes")
        .select("*")
        .eq("project_id", project.id)
        .order("order_index", { ascending: true });
      if (error) throw error;

      // Load any stored metadata for scenes and compute durations
      const loadedScenes = (data as Scene[]).map((sc) => {
        let meta = {};
        try {
          const stored = localStorage.getItem(`scenering_scene_meta_${sc.id}`);
          if (stored) {
            meta = JSON.parse(stored);
          }
        } catch {}
        const merged = { ...sc, ...meta };
        const finalDur = (merged.duration && merged.duration !== 4) ? merged.duration : projectSettings.scene_duration;
        return {
          ...merged,
          voice_id: merged.voice_id ? migrateLegacyVoiceId(merged.voice_id) : merged.voice_id,
          transition: (merged.transition as SceneTransitionType) || projTransition,
          duration: finalDur,
        };
      });

      // Load stored inserts for this project
      let loadedInserts: TimelineInsert[] = [];
      try {
        const storedInserts = localStorage.getItem(`scenering_inserts_${project.id}`);
        if (storedInserts) {
          loadedInserts = JSON.parse(storedInserts);
        }
      } catch {}

      // Older projects may contain several music inserts from repeated picks.
      // Keep only the most recently selected bed so loading a project can
      // never restore overlapping copies of the same/previous music.
      let foundMusic = false;
      loadedInserts = [...loadedInserts].reverse().filter((insert) => {
        if (insert.category !== "background_music") return true;
        if (foundMusic) return false;
        foundMusic = true;
        return true;
      }).reverse();

      setCurrentProject(project);
      setScenes(loadedScenes);
      setInserts(loadedInserts);
      setCurrentPlayheadTime(0);
      setEditorStep("scenes");
      setView("editor");
    } catch (err) {
      console.error("Failed to load project:", err);
    }
  };

  const handleDeleteProject = async (projectId: number) => {
    // 1. Clean up localStorage keys specifically for this project
    try {
      localStorage.removeItem(`scenering_project_settings_${projectId}`);
      localStorage.removeItem(`scenering_inserts_${projectId}`);
    } catch {}
    forgetSectionMemory(projectId);

    // Find and clean up scene metadata for scenes belonging to this project
    try {
      const { data: projectScenes } = await supabase
        .from("scenes")
        .select("id")
        .eq("project_id", projectId);
      if (projectScenes && Array.isArray(projectScenes)) {
        for (const s of projectScenes) {
          localStorage.removeItem(`scenering_scene_meta_${s.id}`);
        }
      }
    } catch {}

    // 2. Remove project and child scenes from database
    try {
      await supabase.from("scenes").delete().eq("project_id", projectId);
      await supabase.from("projects").delete().eq("id", projectId);
    } catch (err) {
      console.error("Failed to delete project in db:", err);
    }

    // 3. Update local state
    setProjects((prev) => {
      const remaining = prev.filter((p) => p.id !== projectId);
      // If all projects are deleted, perform a deep purge of any lingering scene metadata or orphaned keys
      if (remaining.length === 0) {
        try {
          const keysToRemove: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (
              key &&
              (key.startsWith("scenering_scene_meta_") ||
                key.startsWith("scenering_inserts_") ||
                key.startsWith("scenering_project_settings_") ||
                key.startsWith(SECTION_MEMORY_PREFIX))
            ) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach((k) => localStorage.removeItem(k));
        } catch {}
      }
      return remaining;
    });

    if (currentProject?.id === projectId) {
      setCurrentProject(null);
      setScenes([]);
      setInserts([]);
      // Reset all setup and effects to clean defaults
      setCustomerLogo(DEFAULT_PROJECT_SETTINGS.customer_logo);
      setCaptionsConfig(DEFAULT_PROJECT_SETTINGS.captions_config);
      setSelectedVoice(DEFAULT_PROJECT_SETTINGS.selected_voice);
      setVoiceEcho(DEFAULT_PROJECT_SETTINGS.voice_echo);
      setAspectRatio(DEFAULT_PROJECT_SETTINGS.aspect_ratio);
      setResolution(DEFAULT_PROJECT_SETTINGS.resolution);
      setPacingMode(DEFAULT_PROJECT_SETTINGS.pacing_mode);
      setSceneDuration(DEFAULT_PROJECT_SETTINGS.scene_duration);
      setMotionStyle(DEFAULT_PROJECT_SETTINGS.motion_style);
      setSceneAnimationEnabled(DEFAULT_PROJECT_SETTINGS.scene_animation_enabled);
      setSingleScene(DEFAULT_PROJECT_SETTINGS.single_scene);
      setVoiceoverEnabled(DEFAULT_PROJECT_SETTINGS.voiceover_enabled);
      setVideoTransition(DEFAULT_PROJECT_SETTINGS.transition);
      setRenderProfile(DEFAULT_PROJECT_SETTINGS.render_profile);
      setView("create");
    }

    fetchProjects();
  };

  /** Scene fields that describe image framing, persisted with the scene meta */
  const FRAMING_KEYS = [
    "image_offset_x",
    "image_offset_y",
    "image_zoom",
    "image_fit",
    "image_crop",
    "image_rotate",
    "image_flip_h",
    "image_flip_v",
    "image_backdrop",
    "image_backdrop_blur",
    "image_backdrop_zoom",
    "image_backdrop_dim",
    "image_backdrop_color",
    // A plain colour replacing the photo entirely. Belongs with the framing
    // keys because it describes how the frame is filled, and because this
    // list is what gets persisted — a field missing from it updates the live
    // scene but is silently dropped on reload.
    "blank_color",
  ] as const;

  /** Short-video-clip fields, persisted with the scene like the framing keys. */
  const CLIP_KEYS = [
    "source_media_kind",
    "video_url",
    "video_name",
    "video_duration",
    "video_trim_start",
    "video_trim_end",
    "video_mute",
    "video_volume",
    "video_fit_mode",
    "is_inserted",
  ] as const;

  /** Copies one scene's framing onto every scene in the project */
  const handleApplyFramingToAll = (framing: Partial<Scene>) => {
    setScenes((prev) => prev.map((s) => ({ ...s, ...framing })));
    try {
      for (const s of scenes) {
        const existing = localStorage.getItem(`scenering_scene_meta_${s.id}`);
        const parsed = existing ? JSON.parse(existing) : {};
        localStorage.setItem(
          `scenering_scene_meta_${s.id}`,
          JSON.stringify({ ...parsed, ...framing })
        );
      }
    } catch {}
  };

  /** Sets transition effect across the entire video (all scenes + project settings) */
  const handleUpdateVideoTransition = (transition: SceneTransitionType) => {
    setVideoTransition(transition);
    saveCurrentProjectSettings({ transition });
    setScenes((prev) => prev.map((s) => ({ ...s, transition })));
    try {
      for (const s of scenes) {
        const existing = localStorage.getItem(`scenering_scene_meta_${s.id}`);
        const parsed = existing ? JSON.parse(existing) : {};
        localStorage.setItem(
          `scenering_scene_meta_${s.id}`,
          JSON.stringify({ ...parsed, transition })
        );
      }
    } catch {}
  };

  const handleUpdateScene = async (sceneId: number, updates: Partial<Scene>) => {
    // 1. Immediately update local state
    setScenes((prev) =>
      prev.map((s) => (s.id === sceneId ? { ...s, ...updates } : s))
    );

    // 2. Persist custom studio properties to local storage
    try {
      const existing = localStorage.getItem(`scenering_scene_meta_${sceneId}`);
      const parsed = existing ? JSON.parse(existing) : {};
      const newMeta = {
        ...parsed,
        motion_effect: updates.motion_effect !== undefined ? updates.motion_effect : parsed.motion_effect,
        transition: updates.transition !== undefined ? updates.transition : parsed.transition,
        voice_id: updates.voice_id !== undefined ? updates.voice_id : parsed.voice_id,
        speaker_name: updates.speaker_name !== undefined ? updates.speaker_name : parsed.speaker_name,
        dialogue: updates.dialogue !== undefined ? updates.dialogue : parsed.dialogue,
        audio_url: updates.audio_url !== undefined ? updates.audio_url : parsed.audio_url,
        audio_name: updates.audio_name !== undefined ? updates.audio_name : parsed.audio_name,
        animation: updates.animation !== undefined ? updates.animation : parsed.animation,
        // The scene's own captions on/off, chosen in Captions — without this
        // it reverted to "on" whenever the project was reloaded or reopened.
        burn_caption: updates.burn_caption !== undefined ? updates.burn_caption : parsed.burn_caption,
        // A hand-picked search term and its lock live here too. Supabase is
        // optional in this app, so without the local copy a reload dropped
        // the lock and the next edit re-derived the query from the script.
        image_query: updates.image_query !== undefined ? updates.image_query : parsed.image_query,
        image_query_locked:
          updates.image_query_locked !== undefined
            ? updates.image_query_locked
            : parsed.image_query_locked,
      };
      // Image framing (crop, fit, blurred fill, zoom, rotation...) is persisted
      // here too, so a reloaded project renders exactly as it was framed — and
      // with them the transcript of a clip's own audio, whose word timings are
      // what the captions of an uploaded video are locked to.
      for (const key of [...FRAMING_KEYS, ...CLIP_KEYS, ...TRANSCRIPT_KEYS]) {
        const v = (updates as Record<string, unknown>)[key];
        if (v !== undefined) newMeta[key] = v;
        else if (parsed[key] !== undefined) newMeta[key] = parsed[key];
      }
      localStorage.setItem(`scenering_scene_meta_${sceneId}`, JSON.stringify(newMeta));
    } catch {}

    // 3. Persist standard fields to Supabase
    try {
      const updateData: Record<string, unknown> = {};
      if (updates.text !== undefined) updateData.text = updates.text;
      if (updates.image_query !== undefined) updateData.image_query = updates.image_query;
      if (updates.image_url !== undefined) updateData.image_url = updates.image_url;
      if (updates.duration !== undefined) updateData.duration = updates.duration;

      if (Object.keys(updateData).length > 0) {
        await supabase
          .from("scenes")
          .update(updateData)
          .eq("id", sceneId);
      }
    } catch (err) {
      console.error("Supabase update error (non-fatal):", err);
    }
  };

  /**
   * Keeps or removes the soundtrack inside the project's footage.
   *
   * Setup holds the choice next to the upload; the scene holds the truth, in
   * the same `video_mute` field the clip panel uses, so the two can never
   * disagree — and it is the field the renderer reads (`src/lib/clip-audio.ts`).
   */
  const handleUpdateSingleSceneAudio = (keepOriginalAudio: boolean) => {
    const target = scenes.find((scene) => scene.video_url);
    if (!target) return;
    void handleUpdateScene(target.id, { video_mute: !keepOriginalAudio });
  };

  /**
   * Installs a transcript on the project's scene: the words become the scene's
   * caption text, and their timings are what the karaoke highlight follows.
   *
   * From here it is the ordinary caption path — the Captions step styles it,
   * the scene text editor corrects it, the renderer burns it in.
   */
  const handleApplySingleSceneCaptions = (updates: Partial<Scene>) => {
    const target = scenes.find((scene) => scene.video_url) || scenes[0];
    if (!target) return;
    // "Generate captions" is an affirmative request to show them. Do not
    // install valid words behind either a scene-level or project-level switch
    // that happened to be off from an earlier edit.
    void handleUpdateScene(target.id, { ...updates, burn_caption: true });
    if (captionsConfig.enabled === false) {
      handleUpdateCaptionsConfig({ ...captionsConfig, enabled: true });
    }
  };

  const handleImageSearch = async (
    sceneId: number,
    query: string,
    /** URLs already handed out to other scenes — never re-picked. */
    usedUrls?: Set<string>
  ): Promise<{ imageUrl: string; allImages?: string[] } | undefined> => {
    try {
      if (!currentProject) return undefined;

      // Never offer the photo this scene (or a sibling scene) already has.
      const excluded = usedUrls ?? new Set<string>();
      for (const scene of scenes) {
        if (scene.id !== sceneId && scene.image_url) {
          excluded.add(rawImageUrl(scene.image_url));
        }
      }

      const hit = await quickImageSearch(query, excluded);
      if (!hit) return undefined;
      usedUrls?.add(hit.rawUrl);

      await handleUpdateScene(sceneId, {
        image_url: hit.proxyUrl,
        image_query: query,
      });

      return { imageUrl: hit.proxyUrl };
    } catch (err) {
      console.error("Image search failed:", err);
      return undefined;
    }
  };

  const handleFetchAllImages = async () => {
    setFetchingImages(true);
    try {
      // Seed the dedup set with every photo already placed on a scene so a
      // batch run can't hand out an image the project is already showing.
      const used = new Set(
        scenes.filter((s) => s.image_url).map((s) => rawImageUrl(s.image_url as string))
      );
      // Scenes already carrying a video clip do not need a stock photo.
      const scenesWithoutImages = scenes.filter((s) => !sceneHasVisual(s));
      // Searches ran strictly one after another before, which made a full
      // project wait on a chain of round-trips. They are independent — run
      // them in parallel and the batch is as fast as the slowest search.
      await Promise.all(
        scenesWithoutImages.map((scene) => handleImageSearch(scene.id, scene.image_query, used))
      );
    } finally {
      setFetchingImages(false);
    }
  };

  /**
   * Timeline scene click → open the Scenes phase with that scene's frame in
   * view and briefly highlighted, so the user lands exactly where they edit
   * the frame, narration and options of that scene.
   */
  const handleEditSceneFromTimeline = useCallback((scene: Scene) => {
    setNavNotice(null);
    setView("editor");
    setEditorStep("scenes");
    setFocusedSceneId(scene.id);
    // Wait for the scenes list to mount, then bring the card into view
    window.setTimeout(() => {
      document
        .getElementById(`scene-card-${scene.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    window.setTimeout(() => setFocusedSceneId((cur) => (cur === scene.id ? null : cur)), 4200);
  }, []);

  /**
   * Insert a scene at a chosen position.
   *
   * The old version always appended and, critically, never rewrote
   * `order_index` on the other scenes — so the new row shared an index with an
   * existing one, the ordered reload put it in an arbitrary place, and to the
   * user the "insert a scene" button looked like it did nothing at all.
   *
   * `position` is the index the new scene should occupy. Passing
   * `scenes.length` (or omitting it) appends.
   */
  const handleAddScene = async (position?: number) => {
    if (!currentProject) return;

    const insertAt = Math.max(
      0,
      Math.min(typeof position === "number" ? position : scenes.length, scenes.length)
    );
    const initialText = "New scene — replace this with your narration.";
    const initialDuration = sceneDurationForText(initialText, sceneDuration || 20);

    const newSceneRow = {
      project_id: currentProject.id,
      order_index: insertAt,
      text: initialText,
      image_query: "cinematic background",
      duration: initialDuration,
      transition: videoTransition,
    };

    let created: Scene | null = null;
    try {
      const { data, error } = await supabase
        .from("scenes")
        .insert(newSceneRow)
        .select()
        .single();
      if (error) throw error;
      if (data) created = data as Scene;
    } catch {
      created = null;
    }

    if (!created) {
      created = {
        id: Date.now(),
        project_id: currentProject.id,
        order_index: insertAt,
        text: initialText,
        image_query: "cinematic background",
        image_url: null,
        duration: initialDuration,
        transition: videoTransition,
        created_at: new Date().toISOString(),
      };
    }

    // An inserted scene keeps its own clip audio rather than being overridden
    // by script narration — that is what makes it "inserted" rather than a
    // regular script scene.
    created.is_inserted = true;

    setScenes((prev) => {
      const next = [...prev];
      next.splice(insertAt, 0, created as Scene);
      // Renumber every scene so the stored order matches what is on screen.
      const renumbered = next.map((sc, idx) => ({ ...sc, order_index: idx }));
      try {
        for (const sc of renumbered) {
          supabase.from("scenes").update({ order_index: sc.order_index }).eq("id", sc.id).then();
        }
        const meta = localStorage.getItem(`scenering_scene_meta_${(created as Scene).id}`);
        const parsed = meta ? JSON.parse(meta) : {};
        localStorage.setItem(
          `scenering_scene_meta_${(created as Scene).id}`,
          JSON.stringify({ ...parsed, is_inserted: true, duration: initialDuration })
        );
      } catch {}
      return renumbered;
    });
  };

  /** Move a scene up or down the running order. */
  const handleReorderScene = (sceneId: number, direction: -1 | 1) => {
    setScenes((prev) => {
      const from = prev.findIndex((s) => s.id === sceneId);
      if (from < 0) return prev;
      const to = from + direction;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      const renumbered = next.map((sc, idx) => ({ ...sc, order_index: idx }));
      try {
        for (const sc of renumbered) {
          supabase.from("scenes").update({ order_index: sc.order_index }).eq("id", sc.id).then();
        }
      } catch {}
      return renumbered;
    });
  };

  const handleDeleteScene = async (sceneId: number) => {
    if (scenes.length <= 1) return;
    try {
      await supabase.from("scenes").delete().eq("id", sceneId);
    } catch {}
    setScenes((prev) => prev.filter((s) => s.id !== sceneId));
  };

  // Timeline & Insert Actions
  const handleAddInsert = (insert: TimelineInsert) => {
    if (
      mediaSourceVoiceoverLocked &&
      insert.category === "background_music" &&
      !isMusicVideoSourceInsert(insert)
    ) {
      setNavNotice("This video's uploaded source is already its soundtrack. Replace that source in Setup instead of layering another music track over it.");
      return;
    }
    setInserts((prev) => {
      let filtered = prev;
      if (insert.category === "intro") {
        filtered = prev.filter((i) => i.category !== "intro");
      } else if (insert.category === "outro") {
        filtered = prev.filter((i) => i.category !== "outro");
      } else if (insert.category === "background_music") {
        // Selecting another music bed is a replacement, never an additional
        // layer. This also removes legacy duplicates immediately.
        filtered = prev.filter((i) => i.category !== "background_music");
      }
      return [...filtered, insert];
    });
    setSelectedInsert(insert);
  };

  /** Attach Setup's audio + image source to an already-created project. */
  const handleAttachAudioSource = (
    source: NonNullable<NewProjectOptions["audio"]>,
    changed: { audio: boolean; image: boolean }
  ) => {
    const target = scenes[0];
    if (!target) return;
    const transcriptReset: Partial<Scene> = changed.audio && target.caption_source === "transcript"
      ? { text: "", caption_words: [], caption_source: "manual", caption_audio_duration: 0 }
      : {};
    void handleUpdateScene(target.id, {
      // Source modes are alternatives. Removing the clip here prevents the
      // uploaded song from ever being layered over an uploaded-video soundtrack.
      source_media_kind: "audio_image",
      video_url: null,
      video_name: null,
      image_url: source.image.url,
      image_query: source.image.name,
      image_query_locked: true,
      blank_color: null,
      ...(changed.audio ? { duration: Math.max(1, source.track.duration) } : {}),
      ...transcriptReset,
    });
    // Replacing only the picture must not mint a second id for the same song.
    // This explicit replacement also permits switching from uploaded video to
    // audio source while the old source lock is still true in this render.
    if (changed.audio) {
      const sourceInsert = createMusicVideoInsert(source.track);
      setInserts((prev) => [
        ...prev.filter((insert) => insert.category !== "background_music"),
        sourceInsert,
      ]);
      setSelectedInsert(sourceInsert);
    }
  };

  /** Open the properties editor and park the playhead on the element being edited,
   *  so the video preview behind the dialog shows the edits as they are made. */
  const openInsertEditor = (ins: TimelineInsert) => {
    setEditingInsert(ins);
    setSelectedInsert(ins);
    const mid = ins.startTime + Math.min(ins.duration / 2, 1.5);
    setCurrentPlayheadTime(mid);
  };

  /** Intro + script + outro. Used to stretch whole-video visualisers and music,
   *  and to fill the timeline readouts in the studio and properties editor. */
  const estimatedTotalDuration = useMemo(() => {
    const intro = introSection?.enabled ? Math.max(0.5, introSection.duration) : 0;
    const outro = outroSection?.enabled ? Math.max(0.5, outroSection.duration) : 0;
    const script = scenes.reduce((sum, sc) => sum + Math.max(1, sc.duration || 0), 0);
    /* The render holds the first frame for the narration lead-in before the
       first words, so the exported file really is this much longer. Leaving it
       out here made the timeline read two seconds short, and because
       whole-video media is stretched to THIS number it also made a full-video
       visualiser disappear two seconds before the end of its own video —
       `renderTimelineInsert` stops drawing once time passes startTime +
       duration. Same rule, same arguments as RenderView, so the two agree. */
    /* The hold only happens when there are first words to wait for. A scene
       whose text is a transcript of its own soundtrack has nothing spoken over
       it, so the render starts straight away — same rule as RenderView. */
    const speaks = voiceoverEnabled && projectHasNarration(scenes);
    const leadIn = narrationLeadIn(intro > 0, speaks);
    return Math.max(1, Math.round((intro + leadIn + script + outro) * 10) / 10);
  }, [scenes, introSection, outroSection, voiceoverEnabled]);

  /* A music video built from stills has no footage soundtrack, so the music
     track is the only thing its captions can be transcribed from. Derived from
     the same insert list the renderer plays, so the words always come from the
     audio the finished video actually uses. */
  const captionsMusicBed = useMemo(() => projectMusicBed(inserts), [inserts]);

  // Visualisers and music added for the entire video stay pinned to its full
  // length, even after scenes are re-timed or the voiceover changes.
  useEffect(() => {
    setInserts((prev) => stretchFullVideoMedia(prev, estimatedTotalDuration));
  }, [estimatedTotalDuration]);

  /**
   * Start every phase at the top of the page.
   *
   * The scroll position used to carry over between tabs, so clicking
   * "Voiceover" while scrolled down a long Scenes list dropped you into the
   * middle of the new screen with its heading off the top of the window.
   * `behavior: "auto"` overrides the app-wide `scroll-behavior: smooth` —
   * a tab switch should be instant, not a slow animated glide.
   */
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [view, editorStep]);

  /**
   * The open project's name, in the browser tab.
   *
   * The header no longer spends a row on the project title (see the note where
   * that row used to be), but somebody working across two or three projects
   * still has to tell those browser tabs apart without clicking into them — and
   * the tab costs no working area at all. `| Scenering` is the website's own
   * title format (src/marketing/seo.ts).
   */
  useEffect(() => {
    if (typeof document === "undefined") return;
    const name = currentProject?.title?.trim();
    document.title = name ? `${name} | Scenering` : "Studio | Scenering";
  }, [currentProject?.title]);

  const handleUpdateInsert = (updated: TimelineInsert) => {
    // A source soundtrack is not an ordinary editable music bed. Timeline and
    // properties edits may change volume, but never turn it into a loop or move
    // it away from frame zero.
    const safeUpdated = isMusicVideoSourceInsert(updated)
      ? {
          ...updated,
          startTime: 0,
          scope: "this_scene" as const,
          audioSettings: updated.audioSettings
            ? { ...updated.audioSettings, loop: false }
            : updated.audioSettings,
        }
      : updated;
    setInserts((prev) => {
      const withoutOtherMusic = safeUpdated.category === "background_music"
        ? prev.filter((ins) => ins.id === safeUpdated.id || ins.category !== "background_music")
        : prev;
      return withoutOtherMusic.map((ins) => (ins.id === safeUpdated.id ? safeUpdated : ins));
    });
    if (selectedInsert?.id === safeUpdated.id) setSelectedInsert(safeUpdated);
    if (editingInsert?.id === safeUpdated.id) setEditingInsert(safeUpdated);
  };

  const handleDeleteInsert = (insertId: string) => {
    setInserts((prev) => prev.filter((ins) => ins.id !== insertId));
    if (selectedInsert?.id === insertId) setSelectedInsert(null);
    if (editingInsert?.id === insertId) setEditingInsert(null);
  };

  const handleApplyCaptionStyleToAll = (burn: boolean) => {
    scenes.forEach((sc) => {
      handleUpdateScene(sc.id, { burn_caption: burn });
    });
  };

  return (
    <div className="flex min-h-screen bg-gray-950 text-white font-sans">
      <IconSprite />
      <SiteCornerMenu />
      {/* Main Content */}
      {/* min-w-0 is load-bearing: without it this flex child keeps its
          content's intrinsic width and drags the whole app wider than the
          window whenever a row inside is too wide to fit. */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar — app navigation lives here now that the side bar is gone.
            The right padding is the fixed corner menu's reserved slot
            (--sc-corner-reserve, see src/shared/site-corner-menu.css), and it
            has to hold at every width. Do not add a breakpointed `px-*`
            shorthand here: an arbitrary `pr-[…]` compiles into the base
            utilities, so a `sm:px-*` lands after it in the sheet and silently
            resets padding-right — which is how the theme picker ended up
            underneath the menu button on every desktop width. */}
        <div className="t-app-hdr relative z-40 min-h-14 min-w-0 border-b border-hairline flex flex-col items-stretch gap-1.5 sm:gap-2 px-2 sm:pl-4 pr-[var(--sc-corner-reserve)] py-1.5 sm:py-2 flex-shrink-0 bg-gray-900/50">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 min-w-0">
            {/* Logo */}
            <button
              onClick={() => setView("create")}
              className="flex items-center gap-2 shrink-0"
              title="Project setup & projects"
            >
              <img
                src={sceneringLogo}
                alt="Scenering"
                className="h-9 w-auto max-w-[130px] sm:max-w-[160px] object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)] select-none"
              />
            </button>

            {/* The owner's configured social profiles — the same strip as the
                website, immediately right of the wordmark so the brand cluster
                reads logo then social marks on every surface.

                Wide displays only. The smaller marks leave room for the three
                additional profiles planned for this strip, while the six phase
                tabs now have their own second row. At narrower widths the same
                icons remain available in the corner menu, sign-in page and
                website footers. */}
            <SocialLinksRow size={18} className="hidden 2xl:flex shrink-0" />

            {/* Website navigation, account, membership and sign-out now live in
                the same fixed corner menu used on every public page. */}
            <div className="h-6 w-px bg-gray-800 hidden sm:block shrink-0" />

            <div className="ml-auto flex items-center gap-2 shrink-0">
              {/* Scene and insert counts. Wide displays only: the same two
                  numbers are already on the screens they describe — the Scenes
                  list and the Video Studio's insert catalogue. */}
              {view === "editor" && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-950/90 text-indigo-300 border border-indigo-700/60 shadow-sm hidden 2xl:flex items-center gap-1.5">
                  <Icon glyph="🎬" />
                  <span>
                    {scenes.length} {scenes.length === 1 ? "Scene" : "Scenes"}
                  </span>
                  <span className="text-gray-500">•</span>
                  <span className="text-gray-400">{inserts.length} inserts</span>
                </span>
              )}

              {/* The "Projects" button was removed: the logo and the "1. Setup"
                  phase tab already open this same view, so it was a third way to
                  reach one screen and cost space in the top bar on small
                  displays. */}

              {/* Render status: follows a render that is running while the user
                  works somewhere else. Click it to jump back to the render page. */}
              {(renderJob.active || renderJob.error || (vaultReady > 0 && view === "editor")) && (
                <button
                  onClick={() => {
                    setView("editor");
                    setEditorStep("render");
                  }}
                  title={renderJob.active ? `${renderJob.stage} — open the render dashboard` : "Open the render page"}
                  className={`px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                    renderJob.active
                      ? "bg-indigo-950/90 text-indigo-200 border-indigo-600/70 hover:bg-indigo-900"
                      : renderJob.error
                        ? "bg-rose-950/80 text-rose-200 border-rose-700/70 hover:bg-rose-900"
                        : "bg-emerald-950/80 text-emerald-200 border-emerald-700/70 hover:bg-emerald-900"
                  }`}
                >
                  <Icon glyph={renderJob.active ? "⏳" : renderJob.error ? "⚠️" : "🗄️"} />
                  <span className="hidden sm:inline">
                    {renderJob.active
                      ? `Rendering ${Math.round(renderJob.progress * 100)}%`
                      : renderJob.error
                        ? "Render failed"
                        : `Vault: ${vaultReady}`}
                  </span>
                </button>
              )}

              {/* Theme picker — held clear of the right edge. The corner menu
                  button floats over this corner at every width, and the header
                  reserves its footprint; this extra margin is the deliberate
                  gap between the picker and the button, doubled from 24px to
                  48px after the picker was still touching the button and only
                  its left end showed. */}
              <div className="mr-12 shrink-0">
                <ThemeSwitcher />
              </div>
              {/* The provider-key button that used to sit here now lives in the
                  corner menu and the account & membership panel — see
                  src/shared/SiteCornerMenu.tsx. It was a permanent button for a
                  setting most people touch once, and the studio header has more
                  useful things to do with the width. */}
            </div>
          </div>

          {/* Setup is phase one. All six main project phases get this dedicated
              second row, which keeps every destination easy to scan without
              squeezing the wordmark or utility controls. The strip scrolls
              inside its width on narrow screens; the header reserves the
              corner menu's footprint so no tab sits behind its button. */}
          <div className="t-tabbar opt-group flex items-center min-w-0 w-full bg-gray-800/80 border border-hairline rounded-lg p-0.5 overflow-x-auto no-scrollbar" role="tablist" aria-label="Project phases">
            {(() => {
              const activeIdx = PROJECT_PHASES.findIndex((phase) =>
                phase.id === "setup" ? view === "create" : view === "editor" && editorStep === phase.editorStep
              );
              return PROJECT_PHASES.map((phase, i) => {
                const isActive = i === activeIdx;
                const isNext = activeIdx >= 0 && i === activeIdx + 1;
                /* The only closed steps: everything but Setup while no project
                   is open. With a project open, every step is open. */
                const isLocked = isPhaseLocked(phase.id, Boolean(currentProject));
                return (
                  <button
                    key={phase.id}
                    onClick={() => navigateToPhase(phase.id)}
                    aria-disabled={isLocked || undefined}
                    title={isLocked ? "Create a project on the Setup screen first" : phase.purpose}
                    className={`t-tab opt-btn ${isActive
                        ? `t-tab-active opt-btn-on ${
                            phase.id === "render"
                              ? "bg-gradient-to-r from-purple-600 to-indigo-600"
                              : "bg-indigo-600"
                          } text-white shadow font-bold`
                        : isNext && !isLocked
                        ? "t-tab-next text-gray-200"
                        : isLocked
                        ? "opacity-40 cursor-not-allowed"
                        : ""
                    }`}
                  >
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      {isLocked && <span className="text-[9px] opacity-90"><Icon glyph="🔒" /></span>}
                      <span className={isActive ? "" : "text-indigo-300/80"}>{i + 1}.</span>
                      <Icon glyph={phase.icon} />
                      {/* The word is dropped on phones; the number and icon still
                          identify the step and the row stops overflowing. */}
                      <span className="hidden xs:inline sm:inline">{phase.tab}</span>
                      {isNext && <span className="t-next-cue" aria-hidden="true" />}
                    </span>
                  </button>
                );
              });
            })()}
            {/* The trailing unlock instruction is omitted; the dimmed,
                disabled tabs already explain their status in the tooltips. */}
          </div>

          {/* The project title no longer has a row in this header.

              It used to sit on a full-width line of its own under the wordmark
              and phase tabs, making a three-row header. The phase tabs now
              intentionally occupy row two, and the project name remains in
              the browser tab rather than taking a third row for a name the
              creator has just typed. The title is still where it is edited and
              read: the Setup screen's title field, the Setup summary line,
              and — for a browser tab that has to be identified at a glance —
              the document title, set by the effect beside the other header
              effects. */}
        </div>

        {/* Content Body */}
        <div className="flex-1">
          {view === "create" && (
            <div className="p-4 sm:p-6">
              {navNotice && (
                <div className="max-w-4xl mx-auto mb-4 p-3.5 bg-amber-950/80 border border-amber-700/80 rounded-xl text-amber-200 text-xs flex items-center justify-between shadow-lg">
                  <span className="flex items-center gap-2">
                    <Icon glyph="ℹ" />
                    <span className="font-medium">{navNotice}</span>
                  </span>
                  <button onClick={() => setNavNotice(null)} className="text-amber-400 hover:text-white text-xs">
                    ✕
                  </button>
                </div>
              )}
              <SetupStudio
                project={currentProject}
                projects={projects}
                scenes={scenes}
                inserts={inserts}
                aspectRatio={aspectRatio}
                resolution={resolution}
                pacingMode={pacingMode}
                sceneDuration={sceneDuration}
                singleScene={singleScene}
                voiceoverEnabled={voiceoverEnabled}
                motionStyle={motionStyle}
                sceneAnimationEnabled={sceneAnimationEnabled}
                loading={loading}
                onSelectProject={handleSelectProject}
                onDeleteProject={handleDeleteProject}
                onStartNewProject={handleStartNewProject}
                onCreateProject={handleCreateProject}
                onUpdateTitle={handleUpdateProjectTitle}
                onUpdateScript={handleUpdateScript}
                onUpdateAspectRatio={handleUpdateAspectRatio}
                onUpdateResolution={handleUpdateResolution}
                renderProfile={renderProfile}
                onUpdateRenderProfile={handleUpdateRenderProfile}
                onUpdatePacingMode={handleUpdatePacingMode}
                onUpdateSceneDuration={handleUpdateSceneDuration}
                onUpdateSingleScene={handleUpdateSingleScene}
                onUpdateVoiceoverEnabled={handleUpdateVoiceoverEnabled}
                onAttachSingleSceneClip={handleAttachSingleSceneClip}
                onUpdateSingleSceneAudio={handleUpdateSingleSceneAudio}
                onUpdateSingleSceneCaptions={handleApplySingleSceneCaptions}
                onAttachAudioSource={handleAttachAudioSource}
                onCalibrateScenesWordCount={handleCalibrateScenesWordCount}
                onFitScenesToSpeech={handleFitAllScenesDurationToSpeech}
                onUpdateMotionStyle={handleUpdateMotionStyle}
                onNavigateToStep={handleStepRequest}
              />
            </div>
          )}

          {/* Step 6: Final Render & Export — plus the Vault.
              While a render is running this screen stays MOUNTED even after the
              user walks away (moved off-screen instead of unmounted), so the
              canvas keeps painting and the video keeps encoding in the
              background. Come back and the same job is still there. */}
          {(showRenderPage || renderInFlight) && (
            <div
              aria-hidden={!showRenderPage}
              className={
                showRenderPage
                  ? "p-2 sm:p-4 lg:p-6 max-w-6xl 2xl:max-w-[1600px] mx-auto"
                  : "fixed top-0 left-[-300vw] w-[1280px] h-[720px] overflow-hidden opacity-0 pointer-events-none"
              }
            >
              <RenderView
                project={currentProject}
                scenes={scenes}
                inserts={inserts}
                selectedVoice={selectedVoice}
                availableVoices={availableVoices}
                aspectRatio={aspectRatio}
                resolution={resolution}
                pacingMode={pacingMode}
                renderProfile={renderProfile}
                renderedBlob={renderedBlob}
                renderedUrl={renderedUrl}
                onRenderSuccess={(blob, url) => {
                  setRenderedBlob(blob);
                  setRenderedUrl(url);
                  // Only for the on-screen preview. Rendering is free; the
                  // one download path is RenderView's Vault, where every
                  // download is counted by the server before it is saved.
                }}
                customerLogo={customerLogo}
                captionsConfig={captionsConfig}
                onUpdateCaptionsConfig={handleUpdateCaptionsConfig}
                voiceoverEnabled={voiceoverEnabled}
                singleScene={singleScene}
                sceneDuration={sceneDuration}
                motionStyle={motionStyle}
                sceneAnimationEnabled={sceneAnimationEnabled}
                videoFilter={videoFilter}
                introSection={introSection}
                outroSection={outroSection}
                voiceEcho={voiceEcho}
                onOpenSetup={() => setView("create")}
                onBack={() => setEditorStep("studio")}
                onNavigateToStep={handleStepRequest}
                onNavigatePhase={(phase) => navigateToPhase(phase)}
              />
            </div>
          )}

          {view !== "create" && editorStep !== "render" && (
            <div className="p-2 sm:p-4 lg:p-6 space-y-3 sm:space-y-6">
              {/* Steps Workspace */}
              {editorStep === "scenes" ? (
                /* Step 1: Scene Editor View */
                <div className="max-w-4xl 2xl:max-w-6xl mx-auto w-full space-y-3 sm:space-y-6">
                  <StepNav
                    current="scenes"
                    onNavigate={(phase) => navigateToPhase(phase)}
                    /* Next is the gate: it commits this section, then opens the
                       next one. The Previous button above stays plain. */
                    onNext={() => { const target = nextPhase("scenes"); if (target) void commitAndAdvance(target); }}
                    busyLabel={committingPhase === "scenes" ? "Committing this section…" : undefined}
                    note={`${scenes.length} scene(s) · setup values are shown read-only here · ${commitLabel(phaseCommits, "scenes")}`}
                  />

                  {/* Top Controls & Presets Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-900/60 p-3 rounded-xl border border-hairline">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleFetchAllImages}
                        disabled={fetchingImages}
                        className="t-btn-hero px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 rounded-lg text-white text-xs font-medium transition-colors flex items-center gap-1.5 shadow"
                      >
                        {fetchingImages ? (
                          <>
                            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Fetching Images...
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Auto-Find All Images
                          </>
                        )}
                      </button>

                      <span className="text-[11px] text-gray-500 hidden sm:inline">
                        Auto-assigns images to all scenes
                      </span>
                    </div>

                    {/* Filters now live in ONE place: Video Studio → Filters tab.
                        (The old per-scene "Style Presets" bar was removed on purpose.) */}
                    <button
                      type="button"
                      onClick={() => setEditorStep("studio")}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white text-[11px] font-semibold border border-fuchsia-400/40 shadow flex items-center gap-1.5"
                      title="Filters & video looks are applied to the whole video in the Video Studio"
                    >
                      <span><Icon glyph="🎨" /> Video Look & Filters</span>
                      <span className="text-[10px] font-normal opacity-80">in Video Studio</span>
                    </button>
                  </div>

                  {/* Global Video Transition Selector: applies to the complete video */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-900/80 p-3 sm:px-4 sm:py-3 rounded-xl border border-hairline shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-950/80 border border-indigo-700/60 flex items-center justify-center text-sm shadow-inner">
                        🔀
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-200">Video Transitions</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60 font-medium">
                            Applies to entire video
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400">
                          Choose the transition effect between scenes across your entire video
                        </p>
                      </div>
                    </div>

                    {/* Grouped by family (dissolves, pushes, covers, wipes,
                        reveals, dynamics). A flat row of twenty-one chips was
                        unreadable; the family labels make the one you want
                        findable at a glance. */}
                    <div className="flex flex-col gap-2 w-full sm:w-auto">
                      {TRANSITION_GROUPS.map((group) => {
                        const options = transitionsInGroup(group);
                        if (options.length === 0) return null;
                        return (
                          <div key={group} className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] uppercase tracking-wide text-gray-500 w-16 flex-shrink-0">
                              {group}
                            </span>
                            {options.map((opt) => {
                              const isSelected = videoTransition === opt.id;
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => handleUpdateVideoTransition(opt.id)}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all flex items-center gap-1.5 ${
                                    isSelected
                                      ? "bg-indigo-600 border-indigo-400 text-white shadow-md font-semibold ring-1 ring-indigo-400/50"
                                      : "bg-gray-800/90 hover:bg-gray-700/90 border-hairline text-gray-300"
                                  }`}
                                  title={opt.description}
                                >
                                  <span><Icon glyph={opt.icon} /></span>
                                  <span>{opt.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Scene List */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h3 className="text-base font-semibold flex items-center gap-2">
                            <Icon glyph="📝" /> Scene Editor
                          </h3>
                          <span className="px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-700/60 font-mono text-xs font-semibold">
                            Total: {scenes.length} {scenes.length === 1 ? "Scene" : "Scenes"}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Configure image visuals, voice & dialogue, filters, motion camera effects, and burn caption overlays for each scene.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleAddScene(scenes.length)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow transition-colors"
                        >
                          <span><Icon glyph="➕" /> Add Scene</span>
                        </button>
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-purple-950/60 via-indigo-950/45 to-gray-900/70 border border-purple-800/60 rounded-xl p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/50 flex items-center justify-center shrink-0">
                            <Icon glyph="🎬" />
                          </span>
                          <div>
                            <h4 className="text-sm font-bold text-white flex items-center gap-2">
                              Scene Animation Effects
                              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${
                                sceneAnimationEnabled
                                  ? "bg-emerald-950/80 border-emerald-600 text-emerald-300"
                                  : "bg-gray-900/80 border-hairline text-gray-400"
                              }`}>
                                {sceneAnimationEnabled ? "ON" : "OFF"}
                              </span>
                            </h4>
                            <p className="text-[11px] text-gray-400 leading-relaxed">
                              Turn still images into living scenes. Enable here, then open <span className="text-purple-200 font-semibold">🎬 Animate Scene</span> on any scene for Seasons, Mystical, Space, Motivation, Meditation and more.
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {sceneAnimationEnabled && (
                          <span className="text-[10px] text-indigo-200 bg-indigo-950/60 border border-indigo-700/60 rounded-lg px-2 py-1">
                            Per-scene controls active
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleUpdateSceneAnimationEnabled(!sceneAnimationEnabled)}
                          className={`px-3 py-2 rounded-xl border text-xs font-bold transition-colors flex items-center gap-2 ${
                            sceneAnimationEnabled
                              ? "bg-emerald-600 hover:bg-emerald-500 border-emerald-400 text-white"
                              : "bg-purple-600 hover:bg-purple-500 border-purple-400 text-white shadow-sm shadow-purple-950/40"
                          }`}
                          aria-pressed={sceneAnimationEnabled}
                          title={sceneAnimationEnabled ? "Turn Scene Animation Effects off for this project" : "Turn Scene Animation Effects on for this project"}
                        >
                          <Icon glyph={sceneAnimationEnabled ? "✓" : "✨"} />
                          {sceneAnimationEnabled ? "Enabled" : "Enable animations"}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {scenes.map((scene, index) => (
                        <div
                          key={scene.id}
                          id={`scene-card-${scene.id}`}
                          className={`rounded-xl transition-all duration-500 ${
                            focusedSceneId === scene.id
                              ? "ring-2 ring-indigo-400 shadow-xl shadow-indigo-950/50 scale-[1.01]"
                              : ""
                          }`}
                        >
                          <SceneEditor
                            scene={scene}
                            index={index}
                            totalScenes={scenes.length}
                            aspectRatio={aspectRatio}
                            targetDuration={sceneDuration || 20}
                            singleScene={singleScene}
                            onUpdateTargetDuration={handleUpdateSceneDuration}
                            onUpdate={handleUpdateScene}
                            onImageSearch={handleImageSearch}
                            onDelete={handleDeleteScene}
                            onApplyFramingToAll={handleApplyFramingToAll}
                            videoFilter={videoFilter}
                            sceneAnimationEnabled={sceneAnimationEnabled}
                            onEnableSceneAnimation={() => handleUpdateSceneAnimationEnabled(true)}
                            onInsertSceneAt={handleAddScene}
                            onReorderScene={handleReorderScene}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Bottom Action Bar */}
                    <div className="pt-4 flex items-center justify-between border-t border-hairline">
                      <button
                        type="button"
                        onClick={() => handleAddScene(scenes.length)}
                        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-hairline font-semibold text-xs rounded-xl shadow transition-all flex items-center gap-2"
                      >
                        <span><Icon glyph="➕" /> Add Another Scene</span>
                      </button>
                      <span className="text-[11px] text-gray-500">
                        Continue to Voiceover with the button at the top of this page
                      </span>
                    </div>
                  </div>
                </div>
              ) : editorStep === "voiceover" ? (
                /* Step 2: Voiceover & Narration Studio */
                <VoiceoverStudio
                  projectId={currentProject?.id ?? null}
                  scenes={scenes}
                  onUpdateScene={handleUpdateScene}
                  onNavigateToStep={handleStepRequest}
                  selectedVoice={selectedVoice}
                  onSelectVoice={handleSelectVoice}
                  voiceEcho={voiceEcho}
                  onUpdateVoiceEcho={handleUpdateVoiceEcho}
                  inserts={inserts}
                  totalDuration={estimatedTotalDuration}
                  customerLogo={customerLogo}
                  onInsertItem={handleAddInsert}
                  onConfigureItem={openInsertEditor}
                  voiceoverEnabled={voiceoverEnabled}
                  voiceoverLockedOff={mediaSourceVoiceoverLocked}
                  onUpdateVoiceoverEnabled={handleUpdateVoiceoverEnabled}
                />
              ) : editorStep === "captions" ? (
                /* Step 3: Captions & Subtitles Studio */
                <CaptionsStudio
                  projectId={currentProject?.id ?? null}
                  scenes={scenes}
                  captionsConfig={captionsConfig}
                  onUpdateCaptionsConfig={handleUpdateCaptionsConfig}
                  onUpdateScene={handleUpdateScene}
                  onApplyStyleToAll={handleApplyCaptionStyleToAll}
                  onNavigateToStep={handleStepRequest}
                  musicBed={captionsMusicBed}
                />
              ) : (
                /* Step 4: Video Studio & Timeline View */
                <div className="max-w-5xl 2xl:max-w-7xl mx-auto w-full space-y-3 sm:space-y-5">
                  <StepNav
                    current="studio"
                    onNavigate={(phase) => navigateToPhase(phase)}
                    onNext={() => { const target = nextPhase("studio"); if (target) void commitAndAdvance(target); }}
                    busyLabel={committingPhase === "studio" ? "Committing this section…" : undefined}
                    note={`${inserts.length} timeline insert(s) · ${commitLabel(phaseCommits, "studio")}`}
                  />
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-semibold flex items-center gap-2">
                        <Icon glyph="🎬" /> Video Studio & Timeline
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Preview video with 3D graphics & audio FX, scrub timeline, and insert dynamic studio items with customizable visual/audio settings.
                      </p>
                    </div>

                    <span className="text-[11px] text-gray-500 hidden sm:inline">
                      Add music, sound effects, intros and overlays here
                    </span>
                  </div>

                  {/* Video Preview Canvas with crisp watermark & customer logo */}
                  <VideoPreview
                    scenes={scenes}
                    title={currentProject?.title || "video"}
                    inserts={inserts}
                    customerLogo={customerLogo}
                    captionsConfig={captionsConfig}
                    voiceoverEnabled={voiceoverEnabled}
                    singleScene={singleScene}
                    currentPlayheadTime={currentPlayheadTime}
                    onSeek={setCurrentPlayheadTime}
                    onSelectInsert={(ins) => setSelectedInsert(ins)}
                    onUpdateInsert={handleUpdateInsert}
                    selectedInsertId={selectedInsert?.id}
                    onVoicesLoaded={setAvailableVoices}
                    onPlayStateChange={handlePlayStateChange}
                    selectedVoice={selectedVoice}
                    aspectRatio={aspectRatio}
                    pacingMode={pacingMode}
                    sceneAnimationEnabled={sceneAnimationEnabled}
                    videoFilter={videoFilter}
                    introSection={introSection}
                    outroSection={outroSection}
                    voiceEcho={voiceEcho}
                  />

                  {/* Timeline with Playhead & Inserts */}
                  <Timeline
                    scenes={scenes}
                    inserts={inserts}
                    currentTime={currentPlayheadTime}
                    isPlaying={isPlayingPreview}
                    onTogglePlay={() => togglePreviewPlayRef.current?.()}
                    selectedInsertId={selectedInsert?.id}
                    onSeek={setCurrentPlayheadTime}
                    onSelectInsert={setSelectedInsert}
                    onUpdateInsert={handleUpdateInsert}
                    onDeleteInsert={handleDeleteInsert}
                    onEditInsertDetails={openInsertEditor}
                    onEditScene={handleEditSceneFromTimeline}
                  />

                  {/* Video Studio Insert Catalog — add here, then edit the block on the timeline */}
                  <VideoStudio
                    projectId={currentProject?.id ?? null}
                    currentPlayheadTime={currentPlayheadTime}
                    totalDuration={estimatedTotalDuration}
                    onInsertItem={handleAddInsert}
                    customerLogo={customerLogo}
                    onUpdateCustomerLogo={handleUpdateCustomerLogo}
                    aspectRatio={aspectRatio}
                    sampleBackgroundImage={scenes.find((s) => s.image_url)?.image_url || undefined}
                    videoFilter={videoFilter}
                    onUpdateVideoFilter={handleUpdateVideoFilter}
                    introSection={introSection}
                    outroSection={outroSection}
                    onUpdateIntroSection={handleUpdateIntroSection}
                    onUpdateOutroSection={handleUpdateOutroSection}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <AccountMembershipModal
        isOpen={accountModalOpen}
        focusPlans={accountModalFocusPlans}
        focusAdmin={accountModalFocusAdmin}
        onClose={() => { setAccountModalOpen(false); setAccountModalFocusPlans(false); setAccountModalFocusAdmin(false); }}
      />

      {/* Insert Properties & Content Modal */}
      <InsertPropertiesModal
        insert={editingInsert}
        isOpen={Boolean(editingInsert)}
        onClose={() => setEditingInsert(null)}
        totalDuration={estimatedTotalDuration}
        onUpdate={handleUpdateInsert}
        onDelete={handleDeleteInsert}
        aspectRatio={aspectRatio}
        backgroundImage={scenes.find((s) => s.image_url)?.image_url || undefined}
      />
    </div>
  );
}
