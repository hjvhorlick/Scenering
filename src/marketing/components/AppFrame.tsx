import type { ReactNode } from "react";
import { PROJECT_PHASES, type ProjectPhase } from "../../components/StepNav";
import { BrandMark } from "./primitives";
import Icon from "../../components/icons/Icon";

/**
 * Application chrome — the studio's own header, rebuilt at website scale.
 *
 * The real top bar (src/App.tsx) is: the wordmark, a hairline divider, the
 * project title, then a rail of numbered phase tabs where the current phase
 * is a cobalt pill that sits slightly proud of the rest and the next one is
 * tinted to invite the click. This renders the same thing from the same
 * `PROJECT_PHASES` list, so the website cannot show a phase the app does not
 * have, or miss one it gains.
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
  /** Hide the tab rail — used inside the small device frames. */
  compact?: boolean;
}) {
  const activeIndex = PROJECT_PHASES.findIndex((entry) => entry.id === phase);

  return (
    <div className={`mkt-app ${className ?? ""}`}>
      <div className="mkt-app-bar">
        <BrandMark height={18} className="mkt-app-mark" />
        <span className="mkt-app-divider" aria-hidden="true" />
        <span className="mkt-app-title">{title}</span>
        {!compact && (
          <span className="mkt-app-tabs" aria-hidden="true">
            {PROJECT_PHASES.map((entry, index) => {
              const state =
                index === activeIndex ? " is-on" : index === activeIndex + 1 ? " is-next" : "";
              return (
                <span key={entry.id} className={`mkt-app-tab${state}`}>
                  <span className="mkt-app-tab-n">{index + 1}.</span>
                  <span className="mkt-app-tab-ico"><Icon glyph={entry.icon} /></span>
                  {entry.tab}
                </span>
              );
            })}
          </span>
        )}
      </div>
      <div className="mkt-app-body">{children}</div>
    </div>
  );
}
