import { Suspense, lazy, useRef } from "react";
import { Section, SectionHead, Pill, ComingSoon, FigureNote } from "../components/primitives";
import { EFFECT_CATEGORIES, HONESTY } from "../product-facts";
import { useInView } from "../hooks";

/**
 * The gallery is the studio's own renderers running on this page, which makes
 * it the heaviest thing the website can load. It is a separate chunk, and it
 * is only fetched once somebody has scrolled far enough to see it.
 */
const RealEffectsGallery = lazy(() => import("../components/RealEffectsGallery"));

/**
 * The effects library, grouped the way a creator thinks about it: branding,
 * engagement, text, motion, visual, audio.
 *
 * This is an explanation of the product, not a wish list. Everything with a
 * count behind it is in the app and the count comes from the catalogue.
 * Anything not built yet is marked "Coming soon" — there is no third state
 * where a plan is quietly presented as a feature.
 */
export default function EffectsLibrary() {
  const galleryRef = useRef<HTMLElement>(null);
  const seen = useInView(galleryRef, { once: true, rootMargin: "400px 0px" });
  const live = EFFECT_CATEGORIES.flatMap((c) => c.items).filter((item) => item.status === "live").length;
  const soon = EFFECT_CATEGORIES.flatMap((c) => c.items).filter((item) => item.status === "soon").length;

  return (
    <Section id="effects" tone="white">
      <SectionHead
        id="effects"
        eyebrow="Effects library"
        title="Everything you can put on top of a scene."
        lead={`${live} kinds of effect are in the app today. ${soon} more are planned and marked as such — the website says which is which.`}
      />

      <figure className="mkt-figure" ref={galleryRef}>
        <div className="mkt-panel mkt-pad">
          <div className="mkt-real-intro">
            <Pill tone="live">
              <span className="mkt-dot" aria-hidden="true" />
              Rendered by the app, here on the page
            </Pill>
            <p className="mkt-small" style={{ marginTop: 8 }}>
              Nothing below is a picture of the product. Every grade, sticker, caption plate and badge on this
              panel is drawn by the same code that draws the finished video — so what you are looking at is what
              would be exported.
            </p>
          </div>
          <Suspense fallback={<div className="mkt-real-loading">Loading the real effects…</div>}>
            {seen && <RealEffectsGallery />}
          </Suspense>
        </div>
      </figure>

      <div className="mkt-grid cols-3" style={{ marginTop: 22 }}>
        {EFFECT_CATEGORIES.map((category) => (
          <div className="mkt-panel mkt-pad" key={category.id}>
            <div className="mkt-scene-top">
              <h3 className="mkt-h3">{category.name}</h3>
            </div>
            <p className="mkt-small" style={{ marginTop: 6 }}>
              {category.blurb}
            </p>

            <ul className="mkt-list" style={{ marginTop: 14 }}>
              {category.items.map((item) => (
                <li key={item.name}>
                  <span className={`mkt-tick${item.status === "soon" ? " is-lock" : ""}`} aria-hidden="true">
                    {item.status === "soon" ? "…" : "✓"}
                  </span>
                  <span>
                    <b>{item.name}</b>
                    {typeof item.count === "number" && (
                      <>
                        {" "}
                        <Pill tone="plain">{item.count}</Pill>
                      </>
                    )}
                    {item.status === "soon" && (
                      <>
                        {" "}
                        <ComingSoon />
                      </>
                    )}
                    <br />
                    <span className="mkt-small">{item.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <FigureNote>
        <Pill tone="live">
          <span className="mkt-dot" aria-hidden="true" />
          Counts read from the app’s catalogues
        </Pill>
        <span>{HONESTY.demoLabel} — the artwork on this page uses a fictional project.</span>
      </FigureNote>
    </Section>
  );
}
