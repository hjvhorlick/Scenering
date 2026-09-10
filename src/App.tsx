import { useState, useEffect, useCallback } from "react";
import ScriptInput from "./components/ScriptInput";
import SceneEditor from "./components/SceneEditor";
import VideoPreview from "./components/VideoPreview";
import ProjectList from "./components/ProjectList";
import { supabase, EDGE_FUNCTION_BASE } from "./lib/supabase";
import type { Project, Scene } from "./types";

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

// Quick image search via edge function — returns first match only
async function quickImageSearch(query: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${EDGE_FUNCTION_BASE}/image-search?q=${encodeURIComponent(query)}&count=1`
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingImages, setFetchingImages] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

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

  const handleCreateProject = async (title: string, script: string) => {
    setLoading(true);
    try {
      const { data: projectData, error: projectError } = await supabase
        .from("projects")
        .insert({ title, script, status: "draft" })
        .select()
        .single();
      if (projectError) throw projectError;

      const project = projectData as Project;
      const parsedScenes = parseScript(script);
      const sceneValues = parsedScenes.map((scene, index) => ({
        project_id: project.id,
        order_index: index,
        text: scene.text,
        image_query: scene.imageQuery,
        duration: 4,
      }));

      const { data: sceneData, error: sceneError } = await supabase
        .from("scenes")
        .insert(sceneValues)
        .select();
      if (sceneError) throw sceneError;

      setCurrentProject(project);
      setScenes(sceneData as Scene[]);
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
      setCurrentProject(project);
      setScenes(data as Scene[]);
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
        setView("create");
      }
    } catch (err) {
      console.error("Failed to delete project:", err);
    }
  };

  const handleUpdateScene = async (sceneId: number, updates: Partial<Scene>) => {
    try {
      const updateData: Record<string, unknown> = {};
      if (updates.text !== undefined) updateData.text = updates.text;
      if (updates.image_query !== undefined) updateData.image_query = updates.image_query;
      if (updates.image_url !== undefined) updateData.image_url = updates.image_url;
      if (updates.duration !== undefined) updateData.duration = updates.duration;

      const { data, error } = await supabase
        .from("scenes")
        .update(updateData)
        .eq("id", sceneId)
        .select()
        .single();
      if (error) throw error;

      const updated = data as Scene;
      setScenes((prev) => prev.map((s) => (s.id === sceneId ? { ...s, ...updated } : s)));
    } catch (err) {
      console.error("Failed to update scene:", err);
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

      const { error } = await supabase
        .from("scenes")
        .update({ image_url: proxyUrl, image_query: query })
        .eq("id", sceneId);
      if (error) throw error;

      setScenes((prev) =>
        prev.map((s) =>
          s.id === sceneId ? { ...s, image_url: proxyUrl, image_query: query } : s
        )
      );

      return { imageUrl: proxyUrl };
    } catch (err) {
      console.error("Failed to search images:", err);
    }
    return undefined;
  };

  const handleFetchAllImages = async () => {
    if (!currentProject) return;
    setFetchingImages(true);
    try {
      for (const scene of scenes) {
        if (!scene.image_url) {
          await handleImageSearch(scene.id, scene.image_query);
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    } finally {
      setFetchingImages(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950 text-gray-100 antialiased">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "w-72" : "w-0"
        } flex-shrink-0 bg-gray-900 border-r border-gray-800 transition-all duration-300 overflow-hidden`}
      >
        <div className="w-72 h-full flex flex-col">
          {/* Logo */}
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                <span className="text-lg">🎬</span>
              </div>
              <div>
                <h1 className="font-bold text-sm">Script to Video</h1>
                <p className="text-xs text-gray-500">AI Video Maker</p>
              </div>
            </div>
          </div>

          {/* New Project Button */}
          <div className="p-3">
            <button
              onClick={() => {
                setView("create");
                setCurrentProject(null);
                setScenes([]);
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
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-gray-500">
                {scenes.length} scenes • {scenes.filter((s) => s.image_url).length} with images
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {view === "create" ? (
            <div className="max-w-3xl mx-auto p-6">
              <ScriptInput onSubmit={handleCreateProject} loading={loading} />
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Action Bar */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleFetchAllImages}
                  disabled={fetchingImages}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 rounded-lg text-white text-sm font-medium transition-colors flex items-center gap-2"
                >
                  {fetchingImages ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Fetching Images...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Fetch All Images
                    </>
                  )}
                </button>

                <span className="text-xs text-gray-500">
                  Click to automatically find images for all scenes without images
                </span>
              </div>

              {/* Two Column Layout */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Scenes Column */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    Scenes
                  </h3>
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

                {/* Preview Column */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2 sticky top-0 bg-gray-950 py-2 z-10">
                    <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Video Preview & Export
                  </h3>
                  <div className="sticky top-12">
                    <VideoPreview
                      scenes={scenes}
                      title={currentProject?.title || "video"}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
