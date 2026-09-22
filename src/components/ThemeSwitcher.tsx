import { useEffect, useRef, useState } from "react";
import { useTheme, getThemeDef } from "../lib/themes";

/**
 * Theme picker for the top-right corner of the app header.
 *
 * A compact button that opens a dropdown with all five themes. Each row shows
 * a palette preview, the theme name and what it feels like. The button itself
 * uses ordinary utility classes, so it automatically adopts whichever theme
 * is active.
 */
export default function ThemeSwitcher() {
  const { theme, setTheme, themes } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const active = getThemeDef(theme);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="t-theme-btn px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold border border-gray-700 bg-gray-800/80 text-gray-200 hover:bg-gray-750 hover:text-white transition-all flex items-center gap-1.5"
        title={`Theme: ${active.name} — click to change`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="t-ico">🎨</span>
        <span className="hidden sm:inline">Theme</span>
        {/* live palette dot preview of the active theme */}
        <span className="hidden sm:flex items-center -space-x-1">
          {active.swatches.map((c) => (
            <span
              key={c}
              className="w-2.5 h-2.5 rounded-full border border-gray-900"
              style={{ backgroundColor: c }}
            />
          ))}
        </span>
        <span className={`text-[9px] text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Choose a theme"
          className="t-theme-menu absolute right-0 top-full mt-2 w-72 max-w-[85vw] z-50 bg-gray-900/95 border border-gray-700 rounded-2xl shadow-2xl p-1.5 backdrop-blur-md animate-fade-in"
        >
          <div className="px-2.5 pt-1.5 pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
            <span className="t-ico">🖌️</span>
            <span>Choose your look &amp; feel</span>
          </div>
          {themes.map((t) => {
            const isActive = t.id === theme;
            return (
              <button
                key={t.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  setTheme(t.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-2.5 py-2 rounded-xl flex items-center gap-2.5 transition-colors ${
                  isActive
                    ? "bg-indigo-950/80 border border-indigo-500/50"
                    : "hover:bg-gray-800/80 border border-transparent"
                }`}
              >
                <span className="t-ico text-base w-6 text-center shrink-0">{t.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${isActive ? "text-white" : "text-gray-200"}`}>
                      {t.name}
                    </span>
                    {isActive && <span className="text-[10px] text-indigo-300 font-bold">✓ Active</span>}
                  </span>
                  <span className="block text-[10px] text-gray-400 leading-snug truncate" title={t.tagline}>
                    {t.tagline}
                  </span>
                </span>
                <span className="flex items-center -space-x-1 shrink-0">
                  {t.swatches.map((c) => (
                    <span
                      key={c}
                      className="w-3.5 h-3.5 rounded-full border border-gray-900 shadow"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
