import React, { useRef, useState } from "react";
import type { CustomerLogoConfig } from "../types";

interface CustomerLogoSectionProps {
  config: CustomerLogoConfig;
  onChange: (updates: Partial<CustomerLogoConfig>) => void;
}

// Preset vector badges for instant testing if the user has no image file
const PRESET_BADGES = [
  {
    id: "creator",
    name: "Creator Badge",
    dataUrl:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" viewBox="0 0 240 80"><rect width="240" height="80" rx="20" fill="#0f172a" stroke="#6366f1" stroke-width="3"/><circle cx="42" cy="40" r="22" fill="#6366f1"/><path d="M36 30 L52 40 L36 50 Z" fill="#ffffff"/><text x="76" y="47" fill="#ffffff" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" letter-spacing="1">CREATOR</text></svg>`
      ),
  },
  {
    id: "pro_studio",
    name: "Pro Studio",
    dataUrl:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" viewBox="0 0 240 80"><rect width="240" height="80" rx="20" fill="#18181b" stroke="#3b82f6" stroke-width="3"/><rect x="22" y="22" width="36" height="36" rx="8" fill="#3b82f6"/><text x="32" y="48" fill="#ffffff" font-family="system-ui, sans-serif" font-size="22" font-weight="900">P</text><text x="72" y="48" fill="#ffffff" font-family="system-ui, sans-serif" font-size="20" font-weight="800" letter-spacing="2">STUDIO</text></svg>`
      ),
  },
  {
    id: "tech_media",
    name: "Tech Pulse",
    dataUrl:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" viewBox="0 0 240 80"><rect width="240" height="80" rx="20" fill="#022c22" stroke="#10b981" stroke-width="3"/><circle cx="40" cy="40" r="18" fill="#10b981"/><path d="M30 40 L37 33 L43 47 L50 40" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><text x="72" y="47" fill="#ecfdf5" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" letter-spacing="1">MEDIA</text></svg>`
      ),
  },
  {
    id: "gold_luxe",
    name: "Golden Brand",
    dataUrl:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" viewBox="0 0 240 80"><rect width="240" height="80" rx="20" fill="#1c1917" stroke="#eab308" stroke-width="3"/><polygon points="40,24 47,38 62,39 50,49 54,63 40,54 26,63 30,49 18,39 33,38" fill="#eab308"/><text x="74" y="47" fill="#fef08a" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" letter-spacing="1">BRAND</text></svg>`
      ),
  },
];

export default function CustomerLogoSection({ config, onChange }: CustomerLogoSectionProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [showUrlModal, setShowUrlModal] = useState(false);

  const handleFileUpload = (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please upload a valid image file (PNG, JPG, SVG, or WebP).");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        onChange({ url: result, enabled: true });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleApplyUrl = () => {
    const trimmed = urlInput.trim();
    if (trimmed) {
      onChange({ url: trimmed, enabled: true });
      setUrlInput("");
      setShowUrlModal(false);
    }
  };

  return (
    <div className="bg-gray-900/90 border border-indigo-900/50 rounded-2xl p-5 shadow-xl space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 text-lg">
              🏷️
            </span>
            <h3 className="text-base font-bold text-white">
              Customer Brand Logo (Top-Right Corner)
            </h3>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                config.enabled && config.url
                  ? "bg-emerald-950 text-emerald-300 border border-emerald-700/60"
                  : "bg-gray-800 text-gray-400 border border-gray-700"
              }`}
            >
              {config.enabled && config.url ? "Active on Video" : "Inactive / No Logo"}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Display your custom company or creator logo in the top-right corner of the video.
          </p>
        </div>

        {/* Master Toggle */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-300 font-medium cursor-pointer flex items-center gap-2">
            <span>Show on Video:</span>
            <button
              type="button"
              onClick={() => onChange({ enabled: !config.enabled })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                config.enabled ? "bg-indigo-600" : "bg-gray-700"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  config.enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Upload Dropzone & Preset Selectors (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* File Upload Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
              dragActive
                ? "border-indigo-500 bg-indigo-950/40"
                : "border-gray-700 hover:border-indigo-500/70 bg-gray-800/40 hover:bg-gray-800/70"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
              }}
              className="hidden"
            />
            <div className="flex flex-col items-center justify-center gap-2">
              <span className="p-2.5 rounded-full bg-indigo-600/20 text-indigo-400 text-2xl">
                📤
              </span>
              <div className="text-xs font-semibold text-white">
                Click or Drag & Drop your Logo here
              </div>
              <p className="text-[11px] text-gray-400 max-w-sm">
                Supports PNG (with transparency), SVG, JPG, or WebP. Optimal resolution: 400x120 or square.
              </p>
            </div>
          </div>

          {/* Quick Action Links: URL modal & presets */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <button
              type="button"
              onClick={() => setShowUrlModal(!showUrlModal)}
              className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
            >
              <span>🔗</span> Or enter Image URL
            </button>

            {config.url && (
              <button
                type="button"
                onClick={() => onChange({ url: null, enabled: false })}
                className="text-rose-400 hover:text-rose-300 font-medium flex items-center gap-1"
              >
                <span>🗑️</span> Remove Current Logo
              </button>
            )}
          </div>

          {showUrlModal && (
            <div className="p-3 bg-gray-800/80 rounded-xl border border-gray-700 flex gap-2 animate-fade-in">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/my-logo.png"
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={handleApplyUrl}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold"
              >
                Set URL
              </button>
            </div>
          )}

          {/* Sample Brand Badges for Instant Testing */}
          <div className="space-y-2 pt-2 border-t border-gray-800">
            <label className="text-xs text-gray-400 block">
              Or pick a sample brand badge for quick testing:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PRESET_BADGES.map((badge) => {
                const isActive = config.url === badge.dataUrl;
                return (
                  <button
                    key={badge.id}
                    type="button"
                    onClick={() => onChange({ url: badge.dataUrl, enabled: true })}
                    className={`p-2 rounded-xl border text-center transition-all ${
                      isActive
                        ? "bg-indigo-950/80 border-indigo-500 ring-1 ring-indigo-500"
                        : "bg-gray-800/50 hover:bg-gray-800 border-gray-700 text-gray-300"
                    }`}
                  >
                    <img
                      src={badge.dataUrl}
                      alt={badge.name}
                      className="h-6 w-auto mx-auto object-contain mb-1"
                    />
                    <span className="text-[10px] font-medium block truncate">{badge.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Controls & Live Placement Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Mock Video Canvas Corner Preview */}
          <div className="bg-gray-950 rounded-xl p-3 border border-gray-800 relative overflow-hidden shadow-inner">
            <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-2 flex items-center justify-between">
              <span>Top-Right Video Corner Preview</span>
              <span className="text-indigo-400">16:9 Canvas</span>
            </div>

            {/* Mock Canvas Surface */}
            <div className="w-full h-36 bg-gradient-to-br from-gray-900 via-gray-850 to-indigo-950/40 rounded-lg relative border border-gray-800/80 overflow-hidden flex items-start justify-end p-3">
              {/* Grid guide marks */}
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:12px_12px]" />

              {/* Watermark notice on top-left of preview */}
              <div className="absolute left-2.5 top-2.5 px-2 py-0.5 bg-black/60 rounded border border-white/10 text-[9px] text-gray-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
                <span>Watermark (Top-Left)</span>
              </div>

              {/* Live Rendered Customer Logo in Top-Right */}
              {config.enabled && config.url ? (
                <div
                  style={{
                    opacity: config.opacity,
                    transform: `scale(${config.scale})`,
                    transformOrigin: "top right",
                  }}
                  className="transition-all duration-150"
                >
                  <img
                    src={config.url}
                    alt="Customer Logo"
                    className="h-9 w-auto max-w-[130px] object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
                  />
                </div>
              ) : (
                <div className="border border-dashed border-gray-600 rounded-lg p-2 text-center text-gray-500 text-[10px] w-32">
                  No custom logo active
                </div>
              )}
            </div>
          </div>

          {/* Sizing & Appearance Sliders */}
          <div className="bg-gray-800/40 border border-gray-800 rounded-xl p-3.5 space-y-3 text-xs">
            {/* Logo Scale / Size */}
            <div>
              <div className="flex justify-between text-gray-300 mb-1">
                <span className="font-medium">Logo Size:</span>
                <span className="text-indigo-400 font-bold">{Math.round(config.scale * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.8"
                step="0.05"
                value={config.scale}
                onChange={(e) => onChange({ scale: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500"
              />
              <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
                <span>Small (50%)</span>
                <span>Default (100%)</span>
                <span>Large (180%)</span>
              </div>
            </div>

            {/* Opacity */}
            <div>
              <div className="flex justify-between text-gray-300 mb-1">
                <span className="font-medium">Logo Opacity:</span>
                <span className="text-indigo-400 font-bold">{Math.round(config.opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="1.0"
                step="0.05"
                value={config.opacity}
                onChange={(e) => onChange({ opacity: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500"
              />
            </div>

            {/* Margin from Corner */}
            <div>
              <div className="flex justify-between text-gray-300 mb-1">
                <span className="font-medium">Corner Margin:</span>
                <span className="text-indigo-400 font-bold">{config.margin}px</span>
              </div>
              <input
                type="range"
                min="12"
                max="48"
                step="2"
                value={config.margin}
                onChange={(e) => onChange({ margin: parseInt(e.target.value, 10) })}
                className="w-full accent-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
