import { useState, useEffect, useCallback } from "react";
import ScriptInput from "./components/ScriptInput";
import SceneEditor from "./components/SceneEditor";
import VideoPreview from "./components/VideoPreview";
import ProjectList from "./components/ProjectList";
import ApiKeysModal from "./components/ApiKeysModal";
import Timeline from "./components/Timeline";
import VideoStudio from "./components/VideoStudio";
import RenderView from "./components/RenderView";
import VoiceoverStudio from "./components/VoiceoverStudio";
import CaptionsStudio from "./components/CaptionsStudio";
import InsertPropertiesModal from "./components/InsertPropertiesModal";
import sceneringLogo from "./assets/scenering-logo.png";
import { supabase, EDGE_FUNCTION_BASE } from "./lib/supabase";
import { getApiKeysHeaders, getApiKeysQueryParams, getStoredApiKeys } from "./lib/api-keys";
import type { Project, Scene, TimelineInsert, SceneFilterType, SceneMotionType, EditorStep, CustomerLogoConfig } from "./types";

type View = "create" | "editor";

// Split script into scenes and generate image search queries
function parseScript(script: string): { text: string; imageQuery: string }[] {
  const segments = script
    .split(/\n\n+|\n(?=\d+[\.\)]\s)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let finalSegments = segments;
  if (segments.length <= 1 && script.length > 100) {
    const sentences = script.match(/[^.!?]+[.!?]+/g) || [script];
    finalSegments = [];
    for (let i = 0; i < sentences.length; i += 2) {
      const chunk = sentences.slice(i, i + 2).join(" ").trim();
      if (chunk) finalSegments.push(chunk);
    }
  }

  const limited = finalSegments.slice(0, 10);

  return limited.map((text) => {
    const words = text
      .replace(/[^a-zA-Z\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const query = words.slice(0, 5).join(" ");
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
  const [availableVoices, setAvailableVoices] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingImages, setFetchingImages] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [apiKeysModalOpen, setApiKeysModalOpen] = useState(false);
  const [hasCustomKeys, setHasCustomKeys] = useState(() => {
    const k = getStoredApiKeys();
    return Boolean(k.pexelsKey || k.pixabayKey);
  });

  const [customerLogo, setCustomerLogo] = useState<CustomerLogoConfig>(() => {
    try {
      const saved = localStorage.getItem("scenering_customer_logo");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return {
      enabled: false,
      url: "",
      scale: 1.0,
      opacity: 1.0,
      margin: 20,
    };
  });

  const handleUpdateCustomerLogo = (updates: Partial<CustomerLogoConfig>) => {
    setCustomerLogo((prev) => {
      const updated = { ...prev, ...updates };
      try {
        localStorage.setItem("scenering_customer_logo", JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  };

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

  const handleCreateProject = async (title: string, script: string) => {
    setLoading(true);
    try {
      const { data: projectData, error: projectError } = await supabase
        .from("projects")
        .insert({ title, script })
        .select()
        .single();
      if (projectError) throw projectError;

      const project = projectData as Project;
      const parsedScenes = parseScript(script);

      const sceneRows = parsedScenes.map((s, i) => ({
        project_id: project.id,
        order_index: i,
        text: s.text,
        image_query: s.imageQuery,
        duration: 4,
      }));

      const { data: scenesData, error: scenesError } = await supabase
        .from("scenes")
        .insert(sceneRows)
        .select()
        .order("order_index", { ascending: true });
      if (scenesError) throw scenesError;

      setCurrentProject(project);
      setScenes(scenesData as Scene[]);
      setInserts([]);
      setCurrentPlayheadTime(0);
      setView("editor");
      fetchProjects();
    } catch (err) {
      console.error("Failed to create project:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProject = async (project: Project) => {
    try {
      const { data, error } = await supabase
        .from("scenes")
        .select("*")
        .eq("project_id", project.id)
        .order("order_index", { ascending: true });
      if (error) throw error;

      // Load any stored metadata for scenes
      const loadedScenes = (data as Scene[]).map((sc) => {
        try {
          const stored = localStorage.getItem(`scenering_scene_meta_${sc.id}`);
          if (stored) {
            const meta = JSON.parse(stored);
            return { ...sc, ...meta };
          }
        } catch {}
        return sc;
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
      setView("editor");
    } catch (err) {
      console.error("Failed to load project:", err);
    }
  };

  const handleDeleteProject = async (projectId: number) => {
    if (!confirm("Are you sure you want to delete this project?")) return;
    try {
      const { error } = await supabase.from("projects").delete().eq("id", projectId);
      if (error) throw error;
      fetchProjects();
      if (currentProject?.id === projectId) {
        setCurrentProject(null);
        setScenes([]);
        setInserts([]);
        setView("create");
      }
    } catch (err) {
      console.error("Failed to delete project:", err);
    }
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
        filter: updates.filter !== undefined ? updates.filter : parsed.filter,
        motion_effect: updates.motion_effect !== undefined ? updates.motion_effect : parsed.motion_effect,
        voice_id: updates.voice_id !== undefined ? updates.voice_id : parsed.voice_id,
        speaker_name: updates.speaker_name !== undefined ? updates.speaker_name : parsed.speaker_name,
        dialogue: updates.dialogue !== undefined ? updates.dialogue : parsed.dialogue,
      };
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

  // Timeline & Insert Actions
  const handleAddInsert = (insert: TimelineInsert) => {
    setInserts((prev) => [...prev, insert]);
    setSelectedInsert(insert);
  };

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
  const applyPresetToAllScenes = (filter: SceneFilterType, motion: SceneMotionType) => {
    scenes.forEach((sc) => {
      handleUpdateScene(sc.id, { filter, motion_effect: motion });
    });
  };

  const handleApplyVoiceToAll = (voiceId: string, _speed: number) => {
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
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "w-64" : "w-0"
        } transition-all duration-200 ease-in-out flex-shrink-0 overflow-hidden border-r border-gray-800 bg-gray-900/50 flex flex-col z-20`}
      >
        <div className="w-64 flex flex-col h-full">
          {/* Logo (Top-Left area without redundant text since name is inside logo) */}
          <div className="h-16 border-b border-gray-800 flex items-center justify-center px-4 flex-shrink-0 bg-gray-950/40">
            <img
              src={sceneringLogo}
              alt="Scenering"
              className="h-10 w-auto max-w-[190px] object-contain shrink-0 filter drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]"
            />
          </div>

          {/* New Project Button */}
          <div className="p-3">
            <button
              onClick={() => {
                setView("create");
                setCurrentProject(null);
                setScenes([]);
                setInserts([]);
                setEditorStep("scenes");
              }}
              className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Project
            </button>
          </div>

          {/* Project List */}
          <div className="flex-1 overflow-y-auto p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Projects
            </h2>
            <ProjectList
              projects={projects}
              onSelect={handleSelectProject}
              onDelete={handleDeleteProject}
              selectedId={currentProject?.id}
            />
          </div>

          {/* Customer API Keys Settings in Sidebar */}
          <div className="p-3 border-t border-gray-800 bg-gray-900/90">
            <button
              onClick={() => setApiKeysModalOpen(true)}
              className="w-full py-2.5 px-3 bg-gray-800/80 hover:bg-gray-750 border border-gray-700/80 rounded-xl text-xs text-gray-300 hover:text-white transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base group-hover:scale-110 transition-transform">🔑</span>
                <div className="text-left">
                  <p className="font-semibold text-xs text-gray-200 group-hover:text-white">API Keys</p>
                  <p className="text-[10px] text-gray-500">Pexels & Pixabay</p>
                </div>
              </div>
              <span
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  hasCustomKeys
                    ? "bg-emerald-950 text-emerald-300 border border-emerald-700/50"
                    : "bg-gray-800 text-amber-400 border border-amber-500/30"
                }`}
              >
                {hasCustomKeys ? "Active" : "Insert Keys"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="h-14 border-b border-gray-800 flex items-center px-4 gap-3 flex-shrink-0 bg-gray-900/50">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <h2 className="font-semibold text-sm">
            {currentProject ? currentProject.title : "Create New Project"}
          </h2>

          {view === "editor" && (
            <div className="flex items-center bg-gray-800/80 border border-gray-700/80 rounded-lg p-0.5 ml-2 sm:ml-4 overflow-x-auto scrollbar-thin">
              <button
                onClick={() => setEditorStep("scenes")}
                className={`px-2.5 sm:px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 whitespace-nowrap ${
                  editorStep === "scenes"
                    ? "bg-indigo-600 text-white shadow font-semibold"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <span>1. 📝 Scenes</span>
              </button>
              <button
                onClick={() => setEditorStep("voiceover")}
                className={`px-2.5 sm:px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 whitespace-nowrap ${
                  editorStep === "voiceover"
                    ? "bg-indigo-600 text-white shadow font-semibold"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <span>2. 🎙️ Voiceover</span>
              </button>
              <button
                onClick={() => setEditorStep("captions")}
                className={`px-2.5 sm:px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 whitespace-nowrap ${
                  editorStep === "captions"
                    ? "bg-purple-600 text-white shadow font-semibold"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <span>3. 💬 Captions</span>
              </button>
              <button
                onClick={() => setEditorStep("studio")}
                className={`px-2.5 sm:px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 whitespace-nowrap ${
                  editorStep === "studio"
                    ? "bg-indigo-600 text-white shadow font-semibold"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <span>4. 🎬 Studio</span>
              </button>
              <button
                onClick={() => setEditorStep("render")}
                className={`px-2.5 sm:px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 whitespace-nowrap ${
                  editorStep === "render"
                    ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow font-semibold"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <span>5. 🚀 Render</span>
              </button>
            </div>
          )}

          <div className="ml-auto flex items-center gap-3">
            {view === "editor" && (
              <span className="text-xs text-gray-500 hidden md:inline">
                {scenes.length} scenes • {inserts.length} inserts
              </span>
            )}
            <button
              onClick={() => setApiKeysModalOpen(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-2 transition-colors ${
                hasCustomKeys
                  ? "bg-indigo-950/60 border-indigo-500/40 text-indigo-300 hover:bg-indigo-900/60"
                  : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
              }`}
              title="Configure personal Pexels & Pixabay API keys"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  hasCustomKeys ? "bg-emerald-400 animate-pulse-slow" : "bg-amber-400"
                }`}
              />
              <span className="flex items-center gap-1">
                <span>🔑</span> API Keys
              </span>
              <span className="text-[10px] text-gray-400 hidden sm:inline">
                ({hasCustomKeys ? "Ready" : "Insert Keys"})
              </span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto">
          {view === "create" ? (
            <div className="max-w-3xl mx-auto p-6">
              <ScriptInput
                onSubmit={handleCreateProject}
                loading={loading}
                onOpenApiKeys={() => setApiKeysModalOpen(true)}
              />
            </div>
          ) : editorStep === "render" ? (
            /* Step 3: Final Render & Export View */
            <div className="p-4 sm:p-6 max-w-6xl mx-auto">
              <RenderView
                project={currentProject}
                scenes={scenes}
                inserts={inserts}
                customerLogo={customerLogo}
                onBack={() => setEditorStep("studio")}
                onNavigateToStep={setEditorStep}
              />
            </div>
          ) : (
            <div className="p-4 sm:p-6 space-y-6">
              {/* Steps Workspace */}
              {editorStep === "scenes" ? (
                /* Step 1: Scene Editor View */
                <div className="max-w-4xl mx-auto w-full space-y-6">
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

                    {/* Quick Presets Dropdown / Buttons */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-gray-400 font-medium mr-1">
                        ✨ Style Presets:
                      </span>
                      <button
                        onClick={() => applyPresetToAllScenes("cinematic", "slow_zoom")}
                        className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-[11px] text-gray-200 border border-gray-700"
                        title="Apply Cinematic Filter & Slow Zoom to all scenes"
                      >
                        🎬 Cinematic
                      </button>
                      <button
                        onClick={() => applyPresetToAllScenes("vintage", "subtle_camera")}
                        className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-[11px] text-gray-200 border border-gray-700"
                        title="Apply 1970s Vintage Film to all scenes"
                      >
                        📼 Vintage
                      </button>
                      <button
                        onClick={() => applyPresetToAllScenes("golden_hour", "pan_right")}
                        className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-[11px] text-gray-200 border border-gray-700"
                        title="Apply Warm Golden Hour to all scenes"
                      >
                        🌅 Golden Hour
                      </button>
                      <button
                        onClick={() => applyPresetToAllScenes("color_boost", "floating")}
                        className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-[11px] text-gray-200 border border-gray-700"
                        title="Apply Zen Relaxation to all scenes"
                      >
                        🌿 Zen Nature
                      </button>
                      <button
                        onClick={() => applyPresetToAllScenes("none", "ken_burns")}
                        className="px-2 py-1 rounded bg-gray-900 hover:bg-gray-800 text-[10px] text-gray-400 border border-gray-800"
                        title="Reset to default clean style"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  {/* Scene List */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-semibold flex items-center gap-2">
                          <span>📝</span> Scene Editor
                        </h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Configure image visuals, voice & dialogue, filters, motion camera effects, and burn caption overlays for each scene.
                        </p>
                      </div>
                      <button
                        onClick={() => setEditorStep("voiceover")}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow"
                      >
                        <span>Next: Voiceover Studio</span>
                        <span>→</span>
                      </button>
                    </div>

                    <div className="space-y-4">
                      {scenes.map((scene, index) => (
                        <SceneEditor
                          key={scene.id}
                          scene={scene}
                          index={index}
                          onUpdate={handleUpdateScene}
                          onImageSearch={handleImageSearch}
                        />
                      ))}
                    </div>

                    {/* Bottom Navigation to Next Step */}
                    <div className="pt-4 flex items-center justify-end border-t border-gray-800">
                      <button
                        onClick={() => setEditorStep("voiceover")}
                        className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-sm rounded-xl shadow-lg hover:shadow-indigo-500/20 transition-all flex items-center gap-2"
                      >
                        <span>Proceed to Voiceover Studio</span>
                        <span>→</span>
                      </button>
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
                />
              ) : editorStep === "captions" ? (
                /* Step 3: Captions & Subtitles Studio */
                <CaptionsStudio
                  scenes={scenes}
                  onUpdateScene={handleUpdateScene}
                  onApplyStyleToAll={handleApplyCaptionStyleToAll}
                  onNavigateToStep={setEditorStep}
                />
              ) : (
                /* Step 4: Video Studio & Timeline View */
                <div className="max-w-5xl mx-auto w-full space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-semibold flex items-center gap-2">
                        <span>🎬</span> Video Studio & Timeline
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Preview video with 3D graphics & audio FX, scrub timeline, and insert dynamic studio items with customizable visual/audio settings.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditorStep("captions")}
                        className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium transition-colors"
                      >
                        ← Back to Captions
                      </button>
                      <button
                        onClick={() => setEditorStep("render")}
                        className="px-4 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-xs rounded-lg shadow transition-all flex items-center gap-1.5"
                      >
                        <span>Go to Render Section</span>
                        <span>→</span>
                      </button>
                    </div>
                  </div>

                  {/* Video Preview Canvas with crisp watermark & customer logo */}
                  <VideoPreview
                    scenes={scenes}
                    title={currentProject?.title || "video"}
                    inserts={inserts}
                    customerLogo={customerLogo}
                    currentPlayheadTime={currentPlayheadTime}
                    onSeek={setCurrentPlayheadTime}
                    onSelectInsert={(ins) => setSelectedInsert(ins)}
                    onUpdateInsert={handleUpdateInsert}
                    onVoicesLoaded={setAvailableVoices}
                    onNavigateToRender={() => setEditorStep("render")}
                  />

                  {/* Timeline with Playhead & Inserts */}
                  <Timeline
                    scenes={scenes}
                    inserts={inserts}
                    currentTime={currentPlayheadTime}
                    selectedInsertId={selectedInsert?.id}
                    onSeek={setCurrentPlayheadTime}
                    onSelectInsert={setSelectedInsert}
                    onUpdateInsert={handleUpdateInsert}
                    onDeleteInsert={handleDeleteInsert}
                    onEditInsertDetails={setEditingInsert}
                  />

                  {/* Video Studio Insert Catalog with Working Settings Button & Customer Brand Logo */}
                  <VideoStudio
                    currentPlayheadTime={currentPlayheadTime}
                    onInsertItem={handleAddInsert}
                    onConfigureItem={(ins) => setEditingInsert(ins)}
                    customerLogo={customerLogo}
                    onUpdateCustomerLogo={handleUpdateCustomerLogo}
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
        onUpdate={handleUpdateInsert}
        onDelete={handleDeleteInsert}
      />
    </div>
  );
}
