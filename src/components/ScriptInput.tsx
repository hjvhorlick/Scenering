import { useState } from "react";

interface ScriptInputProps {
  onSubmit: (title: string, script: string) => void;
  loading: boolean;
  onOpenApiKeys?: () => void;
}

const SAMPLE_SCRIPTS = [
  {
    title: "Nature Documentary",
    script: `The sun rises over the misty mountains, casting golden rays across the valley below.

A herd of wild horses gallops through the open meadow, their manes flowing in the wind.

Deep in the forest, a crystal-clear stream winds through moss-covered rocks and ancient trees.

An eagle soars high above the canyon, surveying the vast wilderness stretching to the horizon.

As night falls, millions of stars emerge, painting the sky with the light of distant galaxies.`,
  },
  {
    title: "City Life Story",
    script: `Morning rush hour fills the streets with bustling crowds and yellow taxis in downtown New York.

Skyscrapers reach toward the clouds, their glass facades reflecting the morning light.

In the park, joggers and dog walkers enjoy a moment of peace amidst the urban jungle.

Street food vendors set up their colorful carts, filling the air with delicious aromas.

The city transforms at sunset, as neon lights begin to glow and the nightlife awakens.`,
  },
  {
    title: "Ocean Adventure",
    script: `Turquoise waves crash against white sandy beaches under a tropical sun.

A colorful coral reef teems with exotic fish and graceful sea turtles.

A sailboat glides across calm waters, heading toward a distant island paradise.

Dolphins leap joyfully alongside the boat, playing in the warm ocean currents.

The horizon blazes with orange and pink as the sun sets over the endless sea.`,
  },
];

export default function ScriptInput({ onSubmit, loading, onOpenApiKeys }: ScriptInputProps) {
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() && script.trim()) {
      onSubmit(title.trim(), script.trim());
    }
  };

  const loadSample = (sample: (typeof SAMPLE_SCRIPTS)[number]) => {
    setTitle(sample.title);
    setScript(sample.script);
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Create New Video Project</h2>
        <p className="text-gray-400">
          Write or paste your script below. Each paragraph will become a separate
          scene with its own image.
        </p>
      </div>

      {/* Customer API Keys Notice */}
      {onOpenApiKeys && (
        <div className="mb-6 p-3.5 bg-gray-900 border border-gray-800 rounded-xl flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-xl">🔑</span>
            <div>
              <p className="text-xs font-semibold text-gray-200">Customer API Keys</p>
              <p className="text-[11px] text-gray-400">
                Insert your personal Pexels and Pixabay API keys to enable HD stock image searches.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenApiKeys}
            className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
          >
            Insert Keys
          </button>
        </div>
      )}

      {/* Sample Scripts */}
      <div className="mb-6">
        <p className="text-sm text-gray-500 mb-2">Try a sample script:</p>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_SCRIPTS.map((sample) => (
            <button
              key={sample.title}
              onClick={() => loadSample(sample)}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors border border-gray-700"
            >
              {sample.title}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-300 mb-1">
            Project Title
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My Amazing Video"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            required
          />
        </div>

        <div>
          <label htmlFor="script" className="block text-sm font-medium text-gray-300 mb-1">
            Script
            <span className="text-gray-500 font-normal ml-2">
              (Separate scenes with blank lines)
            </span>
          </label>
          <textarea
            id="script"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder={`Scene 1: The sun rises over the mountains...\n\nScene 2: A river flows through the valley...\n\nScene 3: Birds sing in the morning light...`}
            rows={12}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-y font-mono text-sm leading-relaxed"
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            {script.split(/\n\n+/).filter((s) => s.trim()).length} scene(s)
            detected
          </p>
        </div>

        <button
          type="submit"
          disabled={loading || !title.trim() || !script.trim()}
          className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Processing Script...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Generate Scenes
            </>
          )}
        </button>
      </form>
    </div>
  );
}
