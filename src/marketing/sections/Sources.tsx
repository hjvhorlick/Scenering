import { Section, SectionHead, Pill, FigureNote } from "../components/primitives";
import { HONESTY, SEARCH_POLICY, VISUAL_SOURCES } from "../product-facts";

/**
 * Where the visuals come from.
 *
 * Three rules this section follows:
 *
 *  1. Only sources the application really searches are listed, in the order
 *     it searches them. No logos — names only — because using a provider's
 *     mark is their decision, not ours.
 *
 *  2. No API lecture. A visitor is told "connect your visual sources in
 *     Setup", and Scenering handles the searching and the pacing of requests.
 *
 *  3. It searches first and downloads once. The page says so, because that
 *     is the architecture and it is a reason to trust the product.
 */
export default function Sources() {
  return (
    <Section id="sources" tone="tinted">
      <SectionHead
        id="sources"
        eyebrow="Visual sources"
        title="Where do the visuals come from?"
        lead="Scenering searches the visual sources you have connected and uses the most suitable result it finds. It is looking for existing photographs, not inventing one for every scene."
      />

      <div className="mkt-grid cols-2">
        <div className="mkt-panel mkt-pad">
          <h3 className="mkt-h3">Connected sources</h3>
          <p className="mkt-small" style={{ marginTop: 6 }}>
            Searched in this order. The first source that returns something suitable wins.
          </p>

          <div style={{ display: "grid", gap: 9, marginTop: 14 }}>
            {VISUAL_SOURCES.map((source, index) => (
              <div className="mkt-strip-row" key={source.id} style={{ gridTemplateColumns: "1fr auto" }}>
                <span className="mkt-strip-label">
                  <span className="mkt-opt-no">{String(index + 1).padStart(2, "0")}</span>
                  {source.name}
                  <span className="mkt-small" style={{ fontWeight: 500 }}>
                    · {source.role}
                  </span>
                </span>
                <Pill tone={source.access === "key" ? "plain" : "live"}>
                  {source.access === "key" ? "Needs a key" : source.access === "open" ? "No key needed" : "Built in"}
                </Pill>
              </div>
            ))}
          </div>

          <div className="mkt-panel-flat mkt-pad" style={{ marginTop: 14 }}>
            <b style={{ fontSize: 14 }}>Connect your visual sources in Setup.</b>
            <p className="mkt-small" style={{ marginTop: 6 }}>
              Paste a key, and Scenering handles the rest — building the query, pacing the requests and choosing
              what to keep. Without any keys it still works: Wikimedia Commons and the built-in library are always
              available.
            </p>
          </div>
        </div>

        <div className="mkt-panel mkt-pad">
          <h3 className="mkt-h3">Search first, download once</h3>
          <p className="mkt-small" style={{ marginTop: 6 }}>
            A project only pulls down the pictures it uses. Nothing is bulk-downloaded “just in case”, which keeps
            projects small and the sources happy.
          </p>

          <ol className="mkt-list" style={{ marginTop: 14 }}>
            {SEARCH_POLICY.map((step, index) => (
              <li key={step.step}>
                <span className="mkt-tick" aria-hidden="true">
                  {index + 1}
                </span>
                <span>
                  <b>{step.step}.</b> {step.detail}
                </span>
              </li>
            ))}
          </ol>

          <div className="mkt-panel-flat mkt-pad" style={{ marginTop: 14 }}>
            <b style={{ fontSize: 14 }}>Quality gate</b>
            <p className="mkt-small" style={{ marginTop: 6 }}>
              Every image that reaches a scene is photographic, 16:9 and at least 1920 × 1080 — checked before it is
              used, so a 1080p render never upscales its footage.
            </p>
          </div>
        </div>
      </div>

      <FigureNote>
        <Pill>Source list generated from the app’s configured providers</Pill>
        <span>{HONESTY.localNote}</span>
      </FigureNote>
    </Section>
  );
}
