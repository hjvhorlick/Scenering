import {
  RealCta,
  RealFilter,
  RealSticker,
  RealTemplate,
  ctaName,
  filterName,
  stickerName,
  templateName,
} from "./RealEffects";
import { DEMO_PROJECT } from "../demo-project";

/**
 * "This is the actual thing" — a gallery drawn by the studio's own renderers.
 *
 * The grades are painted onto a still from the demonstration project by the
 * same canvas the Filters studio uses; the stickers are the real 3D draw; the
 * lower third and the quote card come out of the template renderer; the
 * badges are painted by the call-to-action renderer. Names are read from the
 * catalogues, so nothing here can be renamed behind the website's back.
 */

const GRADES = ["golden_hour", "teal_orange", "silver_noir", "pastel_dream"];
const STICKERS = ["star", "verified", "bell", "arrow", "trophy", "fire", "hundred", "play"];
const BADGES = ["youtube_subscribe", "instagram_follow", "spotify_listen", "website_visit"];

export default function RealEffectsGallery() {
  return (
    <div className="mkt-real">
      {/* ---------------------------------------------------- grades */}
      <div className="mkt-real-block">
        <div className="mkt-real-head">
          <b>Filters</b>
          <span className="mkt-small">
            Graded live on scene 02 of “{DEMO_PROJECT.title}” — the same canvas the studio grades with.
          </span>
        </div>
        <div className="mkt-real-row is-wide">
          <figure className="mkt-real-item">
            <RealFilter filterId="golden_hour" original width={210} />
            <figcaption>No filter</figcaption>
          </figure>
          {GRADES.map((id) => (
            <figure className="mkt-real-item" key={id}>
              <RealFilter filterId={id} width={210} />
              <figcaption>{filterName(id)}</figcaption>
            </figure>
          ))}
        </div>
      </div>

      {/* -------------------------------------------------- stickers */}
      <div className="mkt-real-block">
        <div className="mkt-real-head">
          <b>Stickers</b>
          <span className="mkt-small">Shaded, lit and moving, exactly as they land in the video.</span>
        </div>
        <div className="mkt-real-row">
          {STICKERS.map((id) => (
            <figure className="mkt-real-item is-tight" key={id}>
              <RealSticker stickerId={id} size={72} />
              <figcaption>{stickerName(id)}</figcaption>
            </figure>
          ))}
        </div>
      </div>

      {/* ------------------------------------------- text & lower thirds */}
      <div className="mkt-real-block">
        <div className="mkt-real-head">
          <b>Text and lower thirds</b>
          <span className="mkt-small">Drawn by the template renderer, over a stand-in frame.</span>
        </div>
        <div className="mkt-real-row is-wide">
          <figure className="mkt-real-item">
            <RealTemplate
              templateId="lt_broadcast_bar"
              content={{ primaryText: DEMO_PROJECT.title, secondaryText: "Episode 1 · Water and cities" }}
              width={250}
            />
            <figcaption>{templateName("lt_broadcast_bar")}</figcaption>
          </figure>
          <figure className="mkt-real-item">
            <RealTemplate
              templateId="lesson_stat"
              content={{ number: "4,000", label: "years of cities built beside water" }}
              width={250}
            />
            <figcaption>{templateName("lesson_stat")}</figcaption>
          </figure>
          <figure className="mkt-real-item">
            <RealTemplate
              templateId="quote_editorial"
              content={{
                primaryText: "A map of the oldest cities is a map of water.",
                author: "Narration, scene 05",
              }}
              width={250}
            />
            <figcaption>{templateName("quote_editorial")}</figcaption>
          </figure>
        </div>
      </div>

      {/* -------------------------------------------------- cta badges */}
      <div className="mkt-real-block">
        <div className="mkt-real-head">
          <b>Calls to action</b>
          <span className="mkt-small">
            Real badges, painted at render resolution — re-worded, re-coloured and dragged anywhere in the studio.
          </span>
        </div>
        <div className="mkt-real-row">
          {BADGES.map((id) => (
            <figure className="mkt-real-item is-badge" key={id}>
              <RealCta platformId={id} width={168} height={62} />
              <figcaption>{ctaName(id)}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
