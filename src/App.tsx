import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import SceneEditor from "./components/SceneEditor";
import VideoPreview from "./components/VideoPreview";
import { loadCaptionFonts } from "./data/caption-styles";
import ProjectList from "./components/ProjectList";
import ApiKeysModal from "./components/ApiKeysModal";
import Timeline from "./components/Timeline";
import VideoStudio from "./components/VideoStudio";
import RenderView from "./components/RenderView";
import VoiceoverStudio, { STUDIO_VOICE_PRESETS } from "./components/VoiceoverStudio";
import CaptionsStudio from "./components/CaptionsStudio";
import SetupStudio from "./components/SetupStudio";
import StepNav, { PROJECT_PHASES, type ProjectPhase } from "./components/StepNav";
import { stretchFullVideoVisualisers } from "./lib/render-visualizers";
import InsertPropertiesModal from "./components/InsertPropertiesModal";
import sceneringLogo from "./assets/scenering-logo.png";
import { supabase, EDGE_FUNCTION_BASE } from "./lib/supabase";
import { getApiKeysHeaders, getApiKeysQueryParams, getStoredApiKeys } from "./lib/api-keys";
import {
  calculateDynamicDuration,
  calibrateTextToTargetDuration,
  fitDurationToText,
  getTargetWordCount,
} from "./lib/duration-utils";
import type { Project, Scene, TimelineInsert, SceneMotionType, EditorStep, CustomerLogoConfig, CaptionsConfig, AspectRatioType, ResolutionType, PacingModeType } from "./types";
import type { VideoFilterConfig } from "./data/video-filters";
import type { SectionConfig } from "./data/intro-outro";

type View = "create" | "editor";

export interface ProjectSettings {
  aspect_ratio: AspectRatioType;
  resolution: ResolutionType;
  pacing_mode: PacingModeType;
  scene_duration: number;
  motion_style: string;
  selected_voice: string;
  customer_logo: CustomerLogoConfig;
  captions_config: CaptionsConfig;
  /** ONE look applied to the entire video (every scene), like the music track */
  video_filter: VideoFilterConfig | null;
  /** the intro that plays before the script and the outro that plays after */
  intro_section: SectionConfig | null;
  outro_section: SectionConfig | null;
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  aspect_ratio: "16:9",
  resolution: "1080p",
  pacing_mode: "auto_speech",
  scene_duration: 20,
  motion_style: "dynamic",
  selected_voice: "guy",
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
    backgroundStyle: "blocked",
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
};

// Split script into scenes and generate image search queries
// Strategy: the whole script is first flattened into ONE continuous string
// (all newlines, paragraph breaks and extra spaces are removed), then it is
// sliced into fixed word-count chunks so every scene has a consistent length:
// ~50 words per 20s scene (2.5 words/sec), ~25 per 10s, ~75 per 30s.
function parseScript(script: string, targetDuration: number = 20): { text: string; imageQuery: string }[] {
  const targetWords = getTargetWordCount(targetDuration);

  // 1) One continuous script — no line breaks, no blank paragraphs
  const continuous = script.replace(/\s+/g, " ").trim();
  if (!continuous) return [];

  const words = continuous.split(" ");

  // 2) Fixed-size chunks (e.g. 50 words each for the 20s default)
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += targetWords) {
    chunks.push(words.slice(i, i + targetWords).join(" "));
  }

  // 3) If only a few words are left over, fold them into the previous scene
  //    instead of creating a tiny stub scene (threshold: < 25% of a full chunk)
  const leftoverThreshold = Math.max(3, Math.floor(targetWords * 0.25));
  if (chunks.length > 1 && chunks[chunks.length - 1].split(" ").length < leftoverThreshold) {
    const leftovers = chunks.pop() as string;
    chunks[chunks.length - 1] += " " + leftovers;
  }

  return chunks.map((text) => {
    const queryWords = text
      .replace(/[^a-zA-Z\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const query = queryWords.slice(0, 5).join(" ");
    return { text, imageQuery: query || "abstract background" };
  });
}

// Quick image search via edge function — returns first match only (uses customer's API keys if provided)
async function quickImageSearch(query: string): Promise<string | null> {
  try {
    const headers = getApiKeysHeaders();
    const queryParams = getApiKeysQueryParams();
    const res = await fetch(
      `${EDGE_FUNCTION_BASE}/image-search?q=${encodeURIComponent(query)}&count=1${queryParams}`,
      { headers }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.images || data.images.length === 0) return null;
    return `${EDGE_FUNCTION_BASE}/proxy-image?url=${encodeURIComponent(data.images[0].url)}`;
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
  const [availableVoices, setAvailableVoices] = useState<{ id: string; name: string }[]>(() =>
    STUDIO_VOICE_PRESETS.map((v) => ({ id: v.id, name: `${v.name} (${v.gender === "male" ? "Male" : "Female"} • ${v.accent})` }))
  );
  const [loading, setLoading] = useState(false);
  const [fetchingImages, setFetchingImages] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [apiKeysModalOpen, setApiKeysModalOpen] = useState(false);
  const [hasCustomKeys, setHasCustomKeys] = useState(() => {
    const k = getStoredApiKeys();
    return Boolean(k.pexelsKey || k.pixabayKey);
  });

  const [customerLogo, setCustomerLogo] = useState<CustomerLogoConfig>(DEFAULT_PROJECT_SETTINGS.customer_logo);
  const [captionsConfig, setCaptionsConfig] = useState<CaptionsConfig>(DEFAULT_PROJECT_SETTINGS.captions_config);
  const [selectedVoice, setSelectedVoice] = useState<string>(DEFAULT_PROJECT_SETTINGS.selected_voice);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioType>(DEFAULT_PROJECT_SETTINGS.aspect_ratio);
  const [sceneDuration, setSceneDuration] = useState<number>(DEFAULT_PROJECT_SETTINGS.scene_duration);
  const [resolution, setResolution] = useState<ResolutionType>(DEFAULT_PROJECT_SETTINGS.resolution);
  const [pacingMode, setPacingMode] = useState<PacingModeType>(DEFAULT_PROJECT_SETTINGS.pacing_mode);
  const [motionStyle, setMotionStyle] = useState<string>(DEFAULT_PROJECT_SETTINGS.motion_style);
  const [videoFilter, setVideoFilter] = useState<VideoFilterConfig | null>(DEFAULT_PROJECT_SETTINGS.video_filter);
  const [introSection, setIntroSection] = useState<SectionConfig | null>(DEFAULT_PROJECT_SETTINGS.intro_section);
  const [outroSection, setOutroSection] = useState<SectionConfig | null>(DEFAULT_PROJECT_SETTINGS.outro_section);

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

  const [renderedBlob, setRenderedBlob] = useState<Blob | null>(null);
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

  const handleUpdatePacingMode = useCallback((mode: PacingModeType) => {
    setPacingMode(mode);
    saveCurrentProjectSettings({ pacing_mode: mode });
    setCurrentProject((prev) => (prev ? { ...prev, pacing_mode: mode } : null));
  }, [saveCurrentProjectSettings]);

  const handleUpdateMotionStyle = useCallback((style: string) => {
    setMotionStyle(style);
    saveCurrentProjectSettings({ motion_style: style });
    setCurrentProject((prev) => (prev ? { ...prev, motion_style: style } : null));

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

    if (style === "dynamic") {
      const dynamicList: SceneMotionType[] = ["ken_burns", "zoom_in", "zoom_out", "pan_left", "pan_right", "subtle_camera"];
      setScenes((prev) =>
        prev.map((s, idx) => ({
          ...s,
          motion_effect: dynamicList[idx % dynamicList.length],
        }))
      );
    } else {
      const targetEffect = motionMap[style] || "ken_burns";
      setScenes((prev) =>
        prev.map((s) => ({
          ...s,
          motion_effect: targetEffect,
        }))
      );
    }
  }, []);

  const handleUpdateSceneDuration = useCallback((dur: number) => {
    setSceneDuration(dur);
    saveCurrentProjectSettings({ scene_duration: dur });
    setCurrentProject((prev) => (prev ? { ...prev, default_duration: dur } : null));
    setScenes((prev) => {
      const updated = prev.map((s) => ({ ...s, duration: dur }));
      try {
        for (const s of updated) {
          supabase.from("scenes").update({ duration: dur }).eq("id", s.id).then();
          const existingMeta = localStorage.getItem(`scenering_scene_meta_${s.id}`);
          const parsed = existingMeta ? JSON.parse(existingMeta) : {};
          localStorage.setItem(`scenering_scene_meta_${s.id}`, JSON.stringify({ ...parsed, duration: dur }));
        }
      } catch {}
      return updated;
    });
  }, [saveCurrentProjectSettings]);

  const handleCalibrateScenesWordCount = useCallback((targetSeconds: number) => {
    setSceneDuration(targetSeconds);
    saveCurrentProjectSettings({ scene_duration: targetSeconds });
    setCurrentProject((prev) => (prev ? { ...prev, default_duration: targetSeconds } : null));
    setScenes((prev) =>
      prev.map((s) => {
        // Persist updated duration without mutating text
        try {
          supabase.from("scenes").update({ duration: targetSeconds }).eq("id", s.id).then();
          const existingMeta = localStorage.getItem(`scenering_scene_meta_${s.id}`);
          const parsed = existingMeta ? JSON.parse(existingMeta) : {};
          localStorage.setItem(
            `scenering_scene_meta_${s.id}`,
            JSON.stringify({ ...parsed, duration: targetSeconds })
          );
        } catch {}
        return {
          ...s,
          duration: targetSeconds,
        };
      })
    );
  }, [saveCurrentProjectSettings]);

  const handleFitAllScenesDurationToSpeech = useCallback(() => {
    setScenes((prev) =>
      prev.map((s) => {
        const fitDur = fitDurationToText(s.text);
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
  }, []);

  const handleUpdateProjectTitle = useCallback((title: string) => {
    setCurrentProject((prev) => (prev ? { ...prev, title } : null));
  }, []);

  const handleUpdateScript = useCallback(
    (newScript: string, regenerateScenes: boolean = false, overrideDuration?: number) => {
      setCurrentProject((prev) => (prev ? { ...prev, script: newScript } : null));
      const targetDur = overrideDuration || sceneDuration || 20;
      if (regenerateScenes) {
        const parsed = parseScript(newScript, targetDur);
        setScenes((prev) => {
          const newScenes: Scene[] = parsed.map((item, idx) => {
            const existing = prev[idx];
            const sceneText = item.text.trim();
            return {
              id: existing?.id || idx + 1,
              project_id: currentProject?.id || 1,
              order_index: idx,
              text: sceneText,
              image_url: existing?.image_url || null,
              image_query: item.imageQuery || existing?.image_query || "abstract background",
              duration: targetDur,
              created_at: existing?.created_at || new Date().toISOString(),
              motion_effect: existing?.motion_effect || "slow_zoom",
              audio_url: existing?.audio_url || null,
              audio_name: existing?.audio_name || null,
              voice_id: existing?.voice_id,
            };
          });

          // Persist each scene to Supabase & localStorage
          try {
            if (currentProject?.id) {
              supabase.from("projects").update({ script: newScript, default_duration: targetDur }).eq("id", currentProject.id).then();
            }
            for (const s of newScenes) {
              supabase.from("scenes").upsert(s).then();
              const existingMeta = localStorage.getItem(`scenering_scene_meta_${s.id}`);
              const parsedMeta = existingMeta ? JSON.parse(existingMeta) : {};
              localStorage.setItem(
                `scenering_scene_meta_${s.id}`,
                JSON.stringify({ ...parsedMeta, duration: targetDur, text: s.text })
              );
            }
          } catch {}

          return newScenes;
        });
      }
    },
    [currentProject?.id, sceneDuration]
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

  useEffect(() => {
    const checkKeys = () => {
      const k = getStoredApiKeys();
      setHasCustomKeys(Boolean(k.pexelsKey || k.pixabayKey));
    };
    window.addEventListener("scenering-api-keys-updated", checkKeys);
    return () => window.removeEventListener("scenering-api-keys-updated", checkKeys);
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setProjects(data as Project[]);
    } catch (err) {
      console.error("Failed to fetch projects:", err);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

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

  const handleCreateProject = async (title: string, script: string, targetDuration?: number) => {
    const chosenDuration = targetDuration || 20;
    // Keep the canvas choices made on the single setup frame (aspect ratio, resolution, motion)
    const chosenAspect = aspectRatio;
    const chosenResolution = resolution;
    const chosenMotion = motionStyle;
    setLoading(true);
    try {
      const { data: projectData, error: projectError } = await supabase
        .from("projects")
        .insert({ title, script, default_duration: chosenDuration })
        .select()
        .single();
      if (projectError) throw projectError;

      const project = projectData as Project;
      const parsedScenes = parseScript(script, chosenDuration);

      // Clean, isolated project setup with defaults
      const freshSettings: ProjectSettings = {
        ...DEFAULT_PROJECT_SETTINGS,
        scene_duration: chosenDuration,
        aspect_ratio: chosenAspect,
        resolution: chosenResolution,
        motion_style: chosenMotion,
      };

      try {
        localStorage.setItem(`scenering_project_settings_${project.id}`, JSON.stringify(freshSettings));
        localStorage.setItem(`scenering_inserts_${project.id}`, JSON.stringify([]));
      } catch {}

      // Create scenes from user's script segments
      const sceneRows = parsedScenes.map((s, i) => {
        const sceneText = s.text.trim();
        return {
          project_id: project.id,
          order_index: i,
          text: sceneText,
          image_query: s.imageQuery,
          duration: chosenDuration,
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
      setSelectedVoice(freshSettings.selected_voice);
      setAspectRatio(freshSettings.aspect_ratio);
      setResolution(freshSettings.resolution);
      setPacingMode(freshSettings.pacing_mode);
      setSceneDuration(chosenDuration);
      setMotionStyle(freshSettings.motion_style);

      setCurrentProject(project);
      setScenes(scenesData as Scene[]);
      setInserts([]);
      setCurrentPlayheadTime(0);
      setEditorStep("scenes");
      setView("editor");
      fetchProjects();
    } catch (err) {
      console.error("Failed to create project:", err);
    } finally {
      setLoading(false);
    }
  };

  /** Moves between project phases — used by every Previous / Next control */
  const navigateToPhase = (phase: ProjectPhase) => {
    if (phase === "setup") {
      setView("create");
      return;
    }
    setView("editor");
    setEditorStep(getPhaseDef(phase).editorStep);
  };

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
    setAspectRatio(DEFAULT_PROJECT_SETTINGS.aspect_ratio);
    setResolution(DEFAULT_PROJECT_SETTINGS.resolution);
    setPacingMode(DEFAULT_PROJECT_SETTINGS.pacing_mode);
    setSceneDuration(DEFAULT_PROJECT_SETTINGS.scene_duration);
    setMotionStyle(DEFAULT_PROJECT_SETTINGS.motion_style);
    setVideoFilter(DEFAULT_PROJECT_SETTINGS.video_filter);
    setIntroSection(DEFAULT_PROJECT_SETTINGS.intro_section);
    setOutroSection(DEFAULT_PROJECT_SETTINGS.outro_section);
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

      // Apply this project's setup and effects
      setCustomerLogo(projectSettings.customer_logo);
      setCaptionsConfig(projectSettings.captions_config);
      setSelectedVoice(projectSettings.selected_voice);
      setAspectRatio(projectSettings.aspect_ratio);
      setResolution(projectSettings.resolution);
      setPacingMode(projectSettings.pacing_mode);
      setSceneDuration(projectSettings.scene_duration);
      setMotionStyle(projectSettings.motion_style);
      setVideoFilter(projectSettings.video_filter ?? null);
      setIntroSection(projectSettings.intro_section ?? null);
      setOutroSection(projectSettings.outro_section ?? null);

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
                key.startsWith("scenering_project_settings_"))
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
      setAspectRatio(DEFAULT_PROJECT_SETTINGS.aspect_ratio);
      setResolution(DEFAULT_PROJECT_SETTINGS.resolution);
      setPacingMode(DEFAULT_PROJECT_SETTINGS.pacing_mode);
      setSceneDuration(DEFAULT_PROJECT_SETTINGS.scene_duration);
      setMotionStyle(DEFAULT_PROJECT_SETTINGS.motion_style);
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
        voice_id: updates.voice_id !== undefined ? updates.voice_id : parsed.voice_id,
        speaker_name: updates.speaker_name !== undefined ? updates.speaker_name : parsed.speaker_name,
        dialogue: updates.dialogue !== undefined ? updates.dialogue : parsed.dialogue,
        audio_url: updates.audio_url !== undefined ? updates.audio_url : parsed.audio_url,
        audio_name: updates.audio_name !== undefined ? updates.audio_name : parsed.audio_name,
      };
      // Image framing (crop, fit, blurred fill, zoom, rotation...) is persisted
      // here too, so a reloaded project renders exactly as it was framed.
      for (const key of FRAMING_KEYS) {
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

  const handleImageSearch = async (
    sceneId: number,
    query: string
  ): Promise<{ imageUrl: string; allImages?: string[] } | undefined> => {
    try {
      if (!currentProject) return undefined;
      const proxyUrl = await quickImageSearch(query);
      if (!proxyUrl) return undefined;

      await handleUpdateScene(sceneId, {
        image_url: proxyUrl,
        image_query: query,
      });

      return { imageUrl: proxyUrl };
    } catch (err) {
      console.error("Image search failed:", err);
      return undefined;
    }
  };

  const handleFetchAllImages = async () => {
    setFetchingImages(true);
    try {
      const scenesWithoutImages = scenes.filter((s) => !s.image_url);
      for (const scene of scenesWithoutImages) {
        await handleImageSearch(scene.id, scene.image_query);
      }
    } finally {
      setFetchingImages(false);
    }
  };

  const handleAddScene = async () => {
    if (!currentProject) return;
    const newOrderIndex = scenes.length;
    const initialDuration = sceneDuration || 20;
    const initialText = `Scene ${newOrderIndex + 1} narrative.`;
    const newSceneRow = {
      project_id: currentProject.id,
      order_index: newOrderIndex,
      text: initialText,
      image_query: "cinematic background",
      duration: initialDuration,
    };
    try {
      const { data, error } = await supabase
        .from("scenes")
        .insert(newSceneRow)
        .select()
        .single();
      if (error) throw error;
      if (data) {
        setScenes((prev) => [...prev, data as Scene]);
      }
    } catch {
      // Offline / fallback scene
      const localScene: Scene = {
        id: Date.now(),
        project_id: currentProject.id,
        order_index: newOrderIndex,
        text: initialText,
        image_query: "cinematic background",
        image_url: null,
        duration: initialDuration,
        created_at: new Date().toISOString(),
      };
      setScenes((prev) => [...prev, localScene]);
    }
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
    setInserts((prev) => {
      let filtered = prev;
      if (insert.category === "intro") {
        filtered = prev.filter((i) => i.category !== "intro");
      } else if (insert.category === "outro") {
        filtered = prev.filter((i) => i.category !== "outro");
      }
      return [...filtered, insert];
    });
    setSelectedInsert(insert);
  };

  /** Open the properties editor and park the playhead on the element being edited,
   *  so the video preview behind the dialog shows the edits as they are made. */
  const openInsertEditor = (ins: TimelineInsert) => {
    setEditingInsert(ins);
    setSelectedInsert(ins);
    const mid = ins.startTime + Math.min(ins.duration / 2, 1.5);
    setCurrentPlayheadTime(mid);
  };

  /** Intro + script + outro. Used to stretch whole-video visualisers and to fill
   *  the timeline readouts in the studio and the properties editor. */
  const estimatedTotalDuration = useMemo(() => {
    const intro = introSection?.enabled ? Math.max(0.5, introSection.duration) : 0;
    const outro = outroSection?.enabled ? Math.max(0.5, outroSection.duration) : 0;
    const script = scenes.reduce((sum, sc) => sum + Math.max(1, sc.duration || 0), 0);
    return Math.max(1, Math.round((intro + script + outro) * 10) / 10);
  }, [scenes, introSection, outroSection]);

  // Visualisers added with "runs for the entire video" stay pinned to the full
  // length, even after scenes are re-timed or the voiceover changes.
  useEffect(() => {
    setInserts((prev) => stretchFullVideoVisualisers(prev, estimatedTotalDuration));
  }, [estimatedTotalDuration]);

  const handleUpdateInsert = (updated: TimelineInsert) => {
    setInserts((prev) => prev.map((ins) => (ins.id === updated.id ? updated : ins)));
    if (selectedInsert?.id === updated.id) setSelectedInsert(updated);
    if (editingInsert?.id === updated.id) setEditingInsert(updated);
  };

  const handleDeleteInsert = (insertId: string) => {
    setInserts((prev) => prev.filter((ins) => ins.id !== insertId));
    if (selectedInsert?.id === insertId) setSelectedInsert(null);
    if (editingInsert?.id === insertId) setEditingInsert(null);
  };

  // Quick Preset Styles across all scenes
  const handleApplyVoiceToAll = (voiceId: string, _speed: number) => {
    handleSelectVoice(voiceId);
    scenes.forEach((sc) => {
      handleUpdateScene(sc.id, { voice_id: voiceId });
    });
  };

  const handleApplyCaptionStyleToAll = (burn: boolean) => {
    scenes.forEach((sc) => {
      handleUpdateScene(sc.id, { burn_caption: burn });
    });
  };

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden font-sans">
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar — app navigation lives here now that the side bar is gone */}
        <div className="min-h-14 border-b border-gray-800 flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 flex-shrink-0 bg-gray-900/50">
          {/* Logo */}
          <button
            onClick={() => setView("create")}
            className="flex items-center gap-2 shrink-0"
            title="Project setup & projects"
          >
            <img
              src={sceneringLogo}
              alt="Scenering"
              className="h-8 w-auto max-w-[120px] sm:max-w-[150px] object-contain filter drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]"
            />
          </button>

          <div className="h-6 w-px bg-gray-800 hidden sm:block shrink-0" />

          <h2 className="font-semibold text-xs sm:text-sm truncate max-w-[40vw] sm:max-w-[220px]">
            {currentProject ? currentProject.title : "Start a New Project"}
          </h2>

          {/* Phase tabs — Setup is phase 1 and opens the setup frame */}
          <div className="flex items-center bg-gray-800/80 border border-gray-700/80 rounded-lg p-0.5 ml-0 sm:ml-2 overflow-x-auto scrollbar-thin order-last w-full sm:order-none sm:w-auto">
            {PROJECT_PHASES.map((phase, i) => {
              const isActive =
                phase.id === "setup" ? view === "create" : view === "editor" && editorStep === phase.editorStep;
              return (
                <button
                  key={phase.id}
                  onClick={() => {
                    if (phase.id === "setup") {
                      setView("create");
                    } else {
                      setView("editor");
                      setEditorStep(phase.editorStep);
                    }
                  }}
                  title={phase.purpose}
                  className={`px-2.5 sm:px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 whitespace-nowrap ${
                    isActive
                      ? phase.id === "render"
                        ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow font-semibold"
                        : "bg-indigo-600 text-white shadow font-semibold"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  <span>
                    {i + 1}. {phase.icon} {phase.tab}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2 shrink-0">
            {view === "editor" && (
              <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-950/90 text-indigo-300 border border-indigo-700/60 shadow-sm hidden lg:flex items-center gap-1.5">
                <span>🎬</span>
                <span>
                  {scenes.length} {scenes.length === 1 ? "Scene" : "Scenes"}
                </span>
                <span className="text-gray-500">•</span>
                <span className="text-gray-400">{inserts.length} inserts</span>
              </span>
            )}

            <button
              onClick={() => setView("create")}
              className={`px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                view === "create"
                  ? "bg-indigo-600 border-indigo-500 text-white shadow"
                  : "bg-gray-800/80 border-gray-700 text-gray-200 hover:bg-gray-750 hover:text-white"
              }`}
              title="Projects & project setup"
            >
              <span>🗂️</span>
              <span className="hidden sm:inline">Projects</span>
            </button>

            <button
              onClick={() => setApiKeysModalOpen(true)}
              className="px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold border border-gray-700 bg-gray-800/80 text-gray-200 hover:bg-gray-750 hover:text-white transition-all flex items-center gap-1.5"
              title="Image search API keys (Pexels & Pixabay)"
            >
              <span>🔑</span>
              <span className="hidden sm:inline">API Keys</span>
              <span
                className={`w-2 h-2 rounded-full ${
                  hasCustomKeys ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto">
          {view === "create" ? (
            <div className="p-4 sm:p-6">
              <SetupStudio
                project={currentProject}
                projects={projects}
                scenes={scenes}
                aspectRatio={aspectRatio}
                resolution={resolution}
                pacingMode={pacingMode}
                sceneDuration={sceneDuration}
                motionStyle={motionStyle}
                loading={loading}
                onSelectProject={handleSelectProject}
                onDeleteProject={handleDeleteProject}
                onStartNewProject={handleStartNewProject}
                onCreateProject={handleCreateProject}
                onUpdateTitle={handleUpdateProjectTitle}
                onUpdateScript={handleUpdateScript}
                onUpdateAspectRatio={handleUpdateAspectRatio}
                onUpdateResolution={handleUpdateResolution}
                onUpdatePacingMode={handleUpdatePacingMode}
                onUpdateSceneDuration={handleUpdateSceneDuration}
                onCalibrateScenesWordCount={handleCalibrateScenesWordCount}
                onFitScenesToSpeech={handleFitAllScenesDurationToSpeech}
                onUpdateMotionStyle={handleUpdateMotionStyle}
                onNavigateToStep={(step) => {
                  setEditorStep(step);
                  setView("editor");
                }}
              />
            </div>
          ) : editorStep === "render" ? (
            /* Step 5: Final Render & Export View */
            <div className="p-4 sm:p-6 max-w-6xl mx-auto">
              <RenderView
                project={currentProject}
                scenes={scenes}
                inserts={inserts}
                selectedVoice={selectedVoice}
                availableVoices={availableVoices}
                aspectRatio={aspectRatio}
                resolution={resolution}
                pacingMode={pacingMode}
                renderedBlob={renderedBlob}
                renderedUrl={renderedUrl}
                onRenderSuccess={(blob, url) => {
                  setRenderedBlob(blob);
                  setRenderedUrl(url);
                }}
                customerLogo={customerLogo}
                captionsConfig={captionsConfig}
                onUpdateCaptionsConfig={handleUpdateCaptionsConfig}
                sceneDuration={sceneDuration}
                motionStyle={motionStyle}
                videoFilter={videoFilter}
                introSection={introSection}
                outroSection={outroSection}
                onOpenSetup={() => setView("create")}
                onBack={() => setEditorStep("studio")}
                onNavigateToStep={setEditorStep}
                onNavigatePhase={(phase) => navigateToPhase(phase)}
              />
            </div>
          ) : (
            <div className="p-4 sm:p-6 space-y-6">
              {/* Steps Workspace */}
              {editorStep === "scenes" ? (
                /* Step 1: Scene Editor View */
                <div className="max-w-4xl mx-auto w-full space-y-6">
                  <StepNav
                    current="scenes"
                    onNavigate={(phase) => navigateToPhase(phase)}
                    note={`${scenes.length} scene(s) · setup values are shown read-only here`}
                  />

                  {/* Top Controls & Presets Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-900/60 p-3 rounded-xl border border-gray-800">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleFetchAllImages}
                        disabled={fetchingImages}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 rounded-lg text-white text-xs font-medium transition-colors flex items-center gap-1.5 shadow"
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
                      <span>🎨 Video Look & Filters</span>
                      <span className="text-[10px] font-normal opacity-80">in Video Studio</span>
                    </button>
                  </div>

                  {/* Scene List */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h3 className="text-base font-semibold flex items-center gap-2">
                            <span>📝</span> Scene Editor
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
                          onClick={handleAddScene}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow transition-colors"
                        >
                          <span>➕ Add Scene</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {scenes.map((scene, index) => (
                        <SceneEditor
                          key={scene.id}
                          scene={scene}
                          index={index}
                          totalScenes={scenes.length}
                          aspectRatio={aspectRatio}
                          targetDuration={sceneDuration || 20}
                          onUpdateTargetDuration={handleUpdateSceneDuration}
                          onUpdate={handleUpdateScene}
                          onImageSearch={handleImageSearch}
                          onDelete={handleDeleteScene}
                          onApplyFramingToAll={handleApplyFramingToAll}
                          videoFilter={videoFilter}
                        />
                      ))}
                    </div>

                    {/* Bottom Action Bar */}
                    <div className="pt-4 flex items-center justify-between border-t border-gray-800">
                      <button
                        type="button"
                        onClick={handleAddScene}
                        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 font-semibold text-xs rounded-xl shadow transition-all flex items-center gap-2"
                      >
                        <span>➕ Add Another Scene</span>
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
                  scenes={scenes}
                  onUpdateScene={handleUpdateScene}
                  onApplyVoiceToAll={handleApplyVoiceToAll}
                  onNavigateToStep={setEditorStep}
                  selectedVoice={selectedVoice}
                  onSelectVoice={handleSelectVoice}
                />
              ) : editorStep === "captions" ? (
                /* Step 3: Captions & Subtitles Studio */
                <CaptionsStudio
                  scenes={scenes}
                  captionsConfig={captionsConfig}
                  onUpdateCaptionsConfig={handleUpdateCaptionsConfig}
                  onUpdateScene={handleUpdateScene}
                  onApplyStyleToAll={handleApplyCaptionStyleToAll}
                  onNavigateToStep={setEditorStep}
                />
              ) : (
                /* Step 4: Video Studio & Timeline View */
                <div className="max-w-5xl mx-auto w-full space-y-5">
                  <StepNav
                    current="studio"
                    onNavigate={(phase) => navigateToPhase(phase)}
                    note={`${inserts.length} timeline insert(s)`}
                  />
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-semibold flex items-center gap-2">
                        <span>🎬</span> Video Studio & Timeline
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
                    videoFilter={videoFilter}
                    introSection={introSection}
                    outroSection={outroSection}
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
                  />

                  {/* Video Studio Insert Catalog with Working Settings Button & Customer Brand Logo */}
                  <VideoStudio
                    currentPlayheadTime={currentPlayheadTime}
                    totalDuration={estimatedTotalDuration}
                    onInsertItem={handleAddInsert}
                    onConfigureItem={openInsertEditor}
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

      {/* Provider API Keys Configuration Modal */}
      <ApiKeysModal
        isOpen={apiKeysModalOpen}
        onClose={() => setApiKeysModalOpen(false)}
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
