import type { ReactNode } from "react";
import { getAsset, assetSrc, assetSrcSet, type MarketingAsset } from "../assets";

/**
 * The website's shared furniture: sections, headings, labels and the one
 * image component every visual goes through.
 */

/* ------------------------------------------------------------- sections */

export function Section({
  id,
  tone = "plain",
  children,
}: {
  id: string;
  tone?: "plain" | "tinted" | "white";
  children: ReactNode;
}) {
  const toneClass = tone === "tinted" ? " is-tinted" : tone === "white" ? " is-white" : "";
  return (
    <section id={id} className={`mkt-section${toneClass}`} aria-labelledby={`${id}-title`}>
      <div className="mkt-container">{children}</div>
    </section>
  );
}

export function SectionHead({
  id,
  eyebrow,
  title,
  lead,
  center,
  aside,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  lead?: ReactNode;
  center?: boolean;
  aside?: ReactNode;
}) {
  return (
    <div className={`mkt-head${center ? " is-center" : ""}`}>
      {eyebrow && <div className="mkt-eyebrow">{eyebrow}</div>}
      <h2 className="mkt-h2" id={`${id}-title`}>
        {title}
      </h2>
      {lead && <p className="mkt-lead">{lead}</p>}
      {aside}
    </div>
  );
}

/* --------------------------------------------------------------- labels */

export function Pill({
  tone = "plain",
  children,
}: {
  tone?: "plain" | "live" | "soon" | "accent";
  children: ReactNode;
}) {
  return <span className={`mkt-pill is-${tone}`}>{children}</span>;
}

/** "Coming soon" is a promise about the product, so it has one component. */
export function ComingSoon({ label = "Coming soon" }: { label?: string }) {
  return <Pill tone="soon">{label}</Pill>;
}

export function InApp({ label = "In the app today" }: { label?: string }) {
  return (
    <Pill tone="live">
      <span className="mkt-dot" aria-hidden="true" />
      {label}
    </Pill>
  );
}

/**
 * The line under a demonstration that says what the visitor is looking at.
 * Every conceptual visual on the site carries one.
 */
export function FigureNote({ children }: { children: ReactNode }) {
  return <p className="mkt-figcap">{children}</p>;
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="mkt-stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- image */

/**
 * Every photograph on the site goes through the asset registry.
 *
 *  - `srcset` + `sizes` so a phone downloads the 640px file
 *  - `loading="lazy"` and `decoding="async"` everywhere except the hero
 *  - width/height from the registry, so nothing shifts as images arrive
 *  - alt text from the registry, so it can never be forgotten
 *  - registered-but-missing artwork renders a labelled placeholder rather
 *    than a broken image
 */
export function MarketingImage({
  assetId,
  sizes = "(min-width: 900px) 420px, 92vw",
  eager = false,
  className,
  vertical = false,
  children,
}: {
  assetId: string;
  sizes?: string;
  eager?: boolean;
  className?: string;
  vertical?: boolean;
  children?: ReactNode;
}) {
  const asset = getAsset(assetId);
  const shape = vertical ? " is-vertical" : "";

  if (!asset) {
    return (
      <span className={`mkt-thumb is-pending${shape} ${className ?? ""}`} role="img" aria-label="Artwork missing">
        Unknown asset
      </span>
    );
  }

  if (!asset.file) {
    return (
      <span
        className={`mkt-thumb is-pending${shape} ${className ?? ""}`}
        role="img"
        aria-label={asset.alt}
        title={asset.alt}
      >
        {asset.note ?? "Artwork in production"}
        {children}
      </span>
    );
  }

  return (
    <span className={`mkt-thumb${shape} ${className ?? ""}`}>
      <img
        src={assetSrc(asset, 640)}
        srcSet={assetSrcSet(asset)}
        sizes={sizes}
        width={asset.width}
        height={asset.height}
        alt={asset.alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        // @ts-expect-error fetchpriority is valid HTML, typed only in newer React
        fetchpriority={eager ? "high" : undefined}
      />
      {children}
    </span>
  );
}

/**
 * The wordmark. A 470 KB PNG ships with the studio; the website has no
 * business downloading it, so the registry carries a small WebP pair.
 */
export function BrandMark({ height = 26, className }: { height?: number; className?: string }) {
  const asset = getAsset("brand.mark");
  if (!asset?.file) return <span className={className}>Scenering</span>;
  const width = Math.round((asset.width / asset.height) * height);
  return (
    <img
      className={className}
      src={assetSrc(asset, 120)}
      srcSet={assetSrcSet(asset)}
      sizes={`${width}px`}
      width={width}
      height={height}
      alt={asset.alt}
      decoding="async"
      style={{ display: "block", height, width: "auto" }}
    />
  );
}

/** Registry lookup helper for places that need the record, not the element. */
export function useAsset(assetId: string): MarketingAsset | undefined {
  return getAsset(assetId);
}
