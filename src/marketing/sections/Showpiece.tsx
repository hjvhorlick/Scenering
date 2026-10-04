import Icon from "../../components/icons/Icon";
import { MarketingImage } from "../components/primitives";

/**
 * The key art, at the top of the page.
 *
 * Everything else on this site is drawn from the application's own data — the
 * real catalogues, the real six phases, the real interface. This one piece is
 * different: it is the product as an object, the parts of a finished video
 * gathered into one picture. It sits above the hero on a dark band, so the
 * page opens on something saturated and then settles into the porcelain the
 * rest of the site is made of.
 *
 * The four steps under it are markup, not part of the picture. Text baked
 * into a bitmap cannot be read aloud, cannot be translated, does not reflow
 * on a phone and goes soft on a high-density screen. Drawn here they stay
 * sharp, they are in the accessibility tree, and each one says something the
 * application genuinely does.
 */

const STEPS = [
  { icon: "image", label: "Fetches images", note: "from your visual sources" },
  { icon: "mic", label: "Adds voice over", note: "one narrator or two" },
  { icon: "music", label: "Includes music", note: "beds and sound effects" },
  { icon: "clapper", label: "Creates full videos", note: "16:9 and 9:16" },
] as const;

export default function Showpiece() {
  return (
    <section className="mkt-showpiece" aria-labelledby="showpiece-title">
      <div className="mkt-container mkt-showpiece-inner">
        <div className="mkt-showpiece-art">
          <MarketingImage assetId="hero.workflow.generated" sizes="(min-width: 900px) 620px, 92vw" eager />
        </div>

        <div className="mkt-showpiece-copy">
          <h2 id="showpiece-title" className="mkt-showpiece-title">
            Every part of a video, in one place.
          </h2>
          <p className="mkt-showpiece-lede">
            The pictures, the narration, the music and the cut. Scenering puts them together on your
            own machine, and you keep hold of every one of them.
          </p>

          <ul className="mkt-showpiece-steps">
            {STEPS.map((step) => (
              <li key={step.label} className="mkt-showpiece-step">
                <Icon name={step.icon} size="lg" />
                <span className="mkt-showpiece-step-text">
                  <b>{step.label}</b>
                  <i>{step.note}</i>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
