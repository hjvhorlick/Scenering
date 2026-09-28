import type { ReactNode } from "react";
import { PROJECT_PHASES, type ProjectPhase } from "../../components/StepNav";

/**
 * Application chrome.
 *
 * The tab row is generated from `PROJECT_PHASES` — the same list the studio
 * header renders — so the website can never show a phase the app does not
 * have, or miss one it gained.
 */
export default function AppFrame({
  title,
  phase,
  children,
  className,
  compact = false,
}: {
  title: string;
  phase: ProjectPhase;
  children: ReactNode;
  className?: string;
  /** Hide the tab row — used inside the small device frames. */
  compact?: boolean;
}) {
  return (
    <div className={`mkt-app ${className ?? ""}`}>
      <div className="mkt-app-bar">
        <span className="mkt-app-dots" aria-hidden="true">
          <span className="mkt-app-dot" />
          <span className="mkt-app-dot" />
          <span className="mkt-app-dot" />
        </span>
        <span className="mkt-app-title">{title}</span>
        {!compact && (
          <span className="mkt-app-tabs" aria-hidden="true">
            {PROJECT_PHASES.map((entry) => (
              <span key={entry.id} className={`mkt-app-tab${entry.id === phase ? " is-on" : ""}`}>
                {entry.tab}
              </span>
            ))}
          </span>
        )}
      </div>
      <div className="mkt-app-body">{children}</div>
    </div>
  );
}
