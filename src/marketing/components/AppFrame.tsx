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
 *
 * The tabs are not a likeness of the app's tabs — they are the app's tabs.
 * `t-tabbar opt-group` and `t-tab opt-btn` / `opt-btn-on` are the class names
 * src/App.tsx puts on that row, and they resolve through the shared
 * `src/shared/controls.css` that the studio also imports. A picture drawn
 * with its own buttons drifts away from the product the moment either side
 * is touched; this one cannot, because there is only one definition of the
 * button. The row stays `aria-hidden` and made of spans: it is an
 * illustration of the app, not a way into it.
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
          <span className="mkt-app-tabs t-tabbar opt-group" aria-hidden="true">
            {PROJECT_PHASES.map((entry, index) => {
              const isActive = index === activeIndex;
              const isNext = index === activeIndex + 1;
              return (
                <span
                  key={entry.id}
                  className={`mkt-app-tab t-tab opt-btn${
                    isActive ? " t-tab-active opt-btn-on" : isNext ? " t-tab-next" : ""
                  }`}
                >
                  <span className="mkt-app-tab-n">{index + 1}.</span>
                  <span className="mkt-app-tab-ico"><Icon glyph={entry.icon} /></span>
                  {entry.tab}
                  {isNext && <span className="t-next-cue" aria-hidden="true" />}
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
