import React, { useRef, useState } from "react";
import type { CustomerLogoConfig, AspectRatioType } from "../types";

interface CustomerLogoSectionProps {
  config: CustomerLogoConfig;
  onChange: (updates: Partial<CustomerLogoConfig>) => void;
  aspectRatio?: AspectRatioType;
  sampleBackgroundImage?: string;
}

export default function CustomerLogoSection({
  config,
  onChange,
  aspectRatio = "16:9",
  sampleBackgroundImage,
}: CustomerLogoSectionProps) {
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
            Upload your transparent company or creator logo with full sizing flexibility for video overlays.
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
        {/* Left Column: Upload Dropzone & URL Input (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          {/* File Upload Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
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
            <div className="flex flex-col items-center justify-center gap-2.5">
              <span className="p-3 rounded-full bg-indigo-600/20 text-indigo-400 text-3xl">
                📤
              </span>
              <div className="text-sm font-semibold text-white">
                Upload Your Logo Image
              </div>
              <p className="text-xs text-gray-400 max-w-sm">
                Click or drag & drop your custom logo here. Recommended: Transparent PNG or SVG.
              </p>
              {config.url && (
                <div className="mt-2 px-3 py-1 bg-emerald-950/80 border border-emerald-600/60 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
                  <span>✓</span>
                  <span>Logo Loaded</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Action Links: URL modal & remove */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <button
              type="button"
              onClick={() => setShowUrlModal(!showUrlModal)}
              className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
            >
              <span>🔗</span> Or paste Direct Image URL
            </button>

            {config.url && (
              <button
                type="button"
                onClick={() => onChange({ url: null, enabled: false })}
                className="text-rose-400 hover:text-rose-300 font-medium flex items-center gap-1 hover:underline"
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
                placeholder="https://example.com/my-company-logo.png"
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

          {/* Info Card */}
          <div className="p-3 bg-gray-800/40 rounded-xl border border-gray-800 text-xs text-gray-400 space-y-1">
            <p className="font-semibold text-gray-300 flex items-center gap-1.5">
              <span>💡</span>
              <span>Placement & Transparency Tip:</span>
            </p>
            <p>
              Your logo renders in the top-right corner of the video. Increase the <strong>Logo Size</strong> slider to make it as large and bold as you want.
            </p>
          </div>
        </div>

        {/* Right Column: Live Placement Preview & Big Size Controls (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          {/* Exact 1:1 Video Frame Sample Display */}
          <div className="bg-gray-950 rounded-xl p-3.5 border border-gray-800 relative overflow-hidden shadow-xl">
            <div className="text-[11px] font-medium text-gray-400 mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-gray-200">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-semibold">Sample Video Display</span>
                <span className="text-gray-500 font-normal">· Exact size as top preview</span>
              </span>
              <span className="text-indigo-400 text-[10px] font-mono bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-800/60">
                1:1 Scale Synced
              </span>
            </div>

            {/* Video Frame Canvas Box with identical aspect ratio and scene background */}
            <div
              className={`w-full ${
                aspectRatio === "9:16"
                  ? "aspect-[9/16] max-h-72 mx-auto"
                  : aspectRatio === "1:1"
                  ? "aspect-square max-h-64 mx-auto"
                  : "aspect-video"
              } bg-black rounded-lg relative border border-gray-800/90 overflow-hidden select-none shadow-2xl flex items-start justify-end`}
            >
              {/* Scene background or cinematic backdrop */}
              {sampleBackgroundImage ? (
                <img
                  src={sampleBackgroundImage}
                  alt="Sample Scene Visual"
                  className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-950 to-indigo-950/40" />
              )}

              {/* Cinematic Vignette */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />

              {/* Grid guide markings */}
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

              {/* Watermark in Top-Left (Identical proportions: 180px / 1280px = 14.06%) */}
              <div
                style={{
                  width: "14.06%",
                  left: "1.875%",
                  top: "2.77%",
                }}
                className="absolute pointer-events-none select-none z-10"
              >
                <img
                  src="/scenering-logo.png"
                  alt="Scenering Logo Watermark"
                  className="w-full h-auto object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
                />
              </div>

              {/* Live Rendered Customer Logo in Top-Right with EXACT 1:1 mathematical percentage sizing */}
              {config.enabled && config.url ? (
                <div
                  style={{
                    width: `${((200 * (config.scale ?? 1.0)) / 1280) * 100}%`,
                    right: `${((config.margin ?? 20) / 1280) * 100}%`,
                    top: `${((config.margin ?? 20) / 720) * 100}%`,
                    opacity: Math.max(0.1, Math.min(1.0, config.opacity ?? 1.0)),
                  }}
                  className="absolute transition-all duration-150 pointer-events-none select-none z-10"
                >
                  <img
                    src={config.url}
                    alt="Customer Brand Logo"
                    className="w-full h-auto object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)]"
                  />
                </div>
              ) : (
                <div
                  style={{
                    right: `${((config.margin ?? 20) / 1280) * 100}%`,
                    top: `${((config.margin ?? 20) / 720) * 100}%`,
                  }}
                  className="absolute px-2.5 py-1 rounded border border-dashed border-gray-600 bg-black/70 text-gray-400 text-[10px] backdrop-blur-sm pointer-events-none z-10"
                >
                  No custom logo selected
                </div>
              )}

              {/* Sample 2-Line Captions at bottom to illustrate exact video layout */}
              <div className="absolute bottom-[8%] inset-x-[10%] flex flex-col items-center pointer-events-none z-10 space-y-1">
                <div className="bg-black/75 px-3 py-0.5 rounded text-[10px] sm:text-[11px] font-bold text-white shadow-lg tracking-wide border border-white/10">
                  <span className="text-yellow-400">MAX 2 LINES CAPTIONS</span> · SYNCS WITH VOICEOVER
                </div>
                <div className="bg-black/75 px-3 py-0.5 rounded text-[10px] sm:text-[11px] font-bold text-white/80 shadow-lg tracking-wide border border-white/10">
                  FITS PERFECTLY INSIDE VIDEO BORDERS
                </div>
              </div>
            </div>
          </div>

          {/* Sizing & Appearance Sliders with Higher Range */}
          <div className="bg-gray-800/40 border border-gray-800 rounded-xl p-4 space-y-4 text-xs">
            {/* Logo Scale / Size: 50% to 300% */}
            <div>
              <div className="flex justify-between items-center text-gray-300 mb-1.5">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <span>📐</span>
                  <span>Logo Size / Scale:</span>
                </span>
                <span className="text-indigo-400 font-bold font-mono text-sm">
                  {Math.round(config.scale * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.05"
                value={config.scale}
                onChange={(e) => onChange({ scale: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              {/* Size Quick Select Preset Buttons */}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {[
                  { label: "50%", val: 0.5 },
                  { label: "100% (Normal)", val: 1.0 },
                  { label: "150% (Medium)", val: 1.5 },
                  { label: "200% (Large)", val: 2.0 },
                  { label: "250% (XL)", val: 2.5 },
                  { label: "300% (Max)", val: 3.0 },
                ].map((p) => (
                  <button
                    key={p.val}
                    type="button"
                    onClick={() => onChange({ scale: p.val })}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                      Math.abs(config.scale - p.val) < 0.04
                        ? "bg-indigo-600 text-white border-indigo-400 shadow-sm"
                        : "bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700 hover:text-white"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Opacity */}
            <div>
              <div className="flex justify-between text-gray-300 mb-1">
                <span className="font-medium">Logo Transparency:</span>
                <span className="text-indigo-400 font-bold font-mono">{Math.round(config.opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="1.0"
                step="0.05"
                value={config.opacity}
                onChange={(e) => onChange({ opacity: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            {/* Margin from Corner */}
            <div>
              <div className="flex justify-between text-gray-300 mb-1">
                <span className="font-medium">Corner Margin (Padding):</span>
                <span className="text-indigo-400 font-bold font-mono">{config.margin}px</span>
              </div>
              <input
                type="range"
                min="10"
                max="60"
                step="2"
                value={config.margin}
                onChange={(e) => onChange({ margin: parseInt(e.target.value, 10) })}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
