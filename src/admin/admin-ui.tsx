import { useEffect } from "react";

/**
 * Small shared pieces for the Email Centre's Members, Gifts and Programs
 * tabs, matching the look of the Inbox and Plans tabs: hairline cards, the
 * `.opt-btn` option controls, dialogs that scroll with the page (the app
 * has no inner scroll panes) and the same notices.
 */

export const cardClass = "rounded-xl border border-hairline bg-gray-900/60";
export const inputClass = "w-full rounded-lg bg-gray-900 border border-hairline px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-400";
export const selectClass = "max-w-full rounded-lg bg-gray-900 border border-hairline px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-400";
/** Small upper-case heading over a group of fields. */
export const groupTitleClass = "text-[11px] uppercase tracking-[.14em] text-gray-400 font-bold";

export function Dialog({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 overflow-y-auto" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`w-full ${wide ? "max-w-4xl" : "max-w-2xl"} my-6 bg-gray-950 border border-hairline rounded-2xl shadow-2xl text-white`}>
        <header className="flex items-start justify-between gap-4 p-5 border-b border-hairline bg-gray-900/80">
          <h2 className="text-lg font-bold break-words min-w-0">{title}</h2>
          <button type="button" className="opt-btn" onClick={onClose}>Close</button>
        </header>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

export function Label({ text, hint, children }: { text: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={`block ${groupTitleClass} mb-1.5`}>{text}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-500 mt-1">{hint}</span>}
    </label>
  );
}

export function Notice({ tone, children }: { tone: "error" | "ok" | "warn"; children: React.ReactNode }) {
  const toneClass = tone === "error"
    ? "border-rose-500/40 bg-rose-950/30 text-rose-200"
    : tone === "warn" ? "border-amber-500/40 bg-amber-950/30 text-amber-200" : "border-emerald-500/40 bg-emerald-950/30 text-emerald-200";
  return <div className={`rounded-lg border ${toneClass} text-sm px-4 py-3`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}

/** A row of one-choice option buttons. */
export function Choices<T extends string | number>({ label, value, options, onChange }: {
  label: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (next: T) => void;
}) {
  return (
    <fieldset>
      <legend className={`${groupTitleClass} mb-1.5`}>{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button key={String(option.value)} type="button" className={`opt-btn ${value === option.value ? "opt-btn-on" : ""}`} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>
        ))}
      </div>
    </fieldset>
  );
}

/** One figure with its caption, for result rows. */
export function Figure({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="min-w-[5.5rem]">
      <div className="text-lg font-bold leading-tight">{value}</div>
      <div className="text-[11px] text-gray-400 leading-snug">{label}</div>
    </div>
  );
}
