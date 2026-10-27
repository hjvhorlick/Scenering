import type { ReactNode } from "react";
import { MarketingImage } from "./primitives";
import Icon from "../../components/icons/Icon";

/**
 * The website's small blocks.
 *
 * One rule, and it is the whole point of this file: there is exactly ONE
 * version of everything here, and it is small. No desktop workspace with a
 * phone-sized twin, no app frame beside a mobile glimpse, no timeline, no
 * player, no canvas. A tile is a picture the size of a thumbnail and two
 * short lines; a fact is a tick and one sentence.
 *
 * They are built to wrap: `repeat(auto-fit, minmax(min(100%, 140px), 1fr))`
 * gives one column on a 320px phone and four on a desktop from the same
 * markup, so nothing has to be written twice and nothing can overflow. That
 * is what makes the responsiveness easy — the element is small enough to fit
 * anywhere, and only the number of columns changes with the window.
 */

/* ---------------------------------------------------------------- tiles */

export function Tiles({ children, min = 140 }: { children: ReactNode; min?: number }) {
  return (
    <div className="mkt-tiles" style={{ ["--mkt-tile-min" as string]: `${min}px` }}>
      {children}
    </div>
  );
}

export function Tile({
  assetId,
  label,
  note,
  badge,
  vertical = false,
}: {
  assetId?: string;
  label: string;
  note?: string;
  badge?: string;
  vertical?: boolean;
}) {
  return (
    <div className="mkt-tile">
      {assetId && (
        <span className="mkt-tile-art">
          <MarketingImage
            assetId={assetId}
            sizes="(min-width: 700px) 180px, 45vw"
            vertical={vertical}
          />
          {badge && <span className="mkt-thumb-tag">{badge}</span>}
        </span>
      )}
      <span className="mkt-tile-text">
        <b>{label}</b>
        {note && <i>{note}</i>}
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- facts */

export type Fact = { term: string; text: string };

export function Facts({ items }: { items: readonly Fact[] }) {
  return (
    <ul className="mkt-facts">
      {items.map((item) => (
        <li key={item.term}>
          <span className="mkt-tick" aria-hidden="true">
            <Icon glyph="✓" />
          </span>
          <span>
            <b>{item.term}</b> {item.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- steps */

export function Steps({
  steps,
}: {
  steps: readonly { number?: string; title: string; text: string }[];
}) {
  return (
    <ol className="mkt-steps-mini">
      {steps.map((step, index) => (
        <li key={step.title}>
          <span className="mkt-steps-mini-no">{step.number ?? String(index + 1).padStart(2, "0")}</span>
          <span>
            <b>{step.title}</b>
            <i>{step.text}</i>
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------------- notes */

export function Note({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "accent" }) {
  return <p className={`mkt-note${tone === "accent" ? " is-accent" : ""}`}>{children}</p>;
}
