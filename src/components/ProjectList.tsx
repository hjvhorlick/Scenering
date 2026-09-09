import type { Project } from "../types";

interface ProjectListProps {
  projects: Project[];
  onSelect: (project: Project) => void;
  onDelete: (projectId: number) => void;
  selectedId?: number;
}

export default function ProjectList({
  projects,
  onSelect,
  onDelete,
  selectedId,
}: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <div className="text-3xl mb-2">📁</div>
        <p className="text-sm">No projects yet. Create your first one!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {projects.map((project) => (
        <div
          key={project.id}
          onClick={() => onSelect(project)}
          className={`p-3 rounded-lg cursor-pointer transition-all border ${
            selectedId === project.id
              ? "bg-indigo-900/40 border-indigo-500/50"
              : "bg-gray-800/30 border-gray-700/50 hover:bg-gray-800/60"
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm truncate">{project.title}</h3>
              <p className="text-xs text-gray-500 mt-1">
                {new Date(project.created_at).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(project.id);
              }}
              className="p-1 text-gray-600 hover:text-red-400 transition-colors ml-2"
              title="Delete project"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                project.status === "ready"
                  ? "bg-green-900/50 text-green-400"
                  : project.status === "processing"
                  ? "bg-yellow-900/50 text-yellow-400"
                  : "bg-gray-700 text-gray-400"
              }`}
            >
              {project.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
