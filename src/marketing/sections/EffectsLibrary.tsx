import { Section, SectionHead, FigureNote, Pill, ComingSoon } from "../components/primitives";
import { Tiles, Note } from "../components/blocks";
import { EFFECT_CATEGORIES, HONESTY } from "../product-facts";

/**
 * The effects library — six small category cards, four items each.
 *
 * The live gallery that used to sit here drew the studio's own canvases: a
 * row of graded stills, eight stickers, three template cards and four badge
 * canvases. It was the heaviest thing on the site and it was the first thing
 * to overflow on a phone. Counts and names do the job in a fraction of the
 * space, on every screen.
 */
export default function EffectsLibrary() {
  const live = EFFECT_CATEGORIES.flatMap((category) => category.items).filter((item) => item.status === "live").length;
  const soon = EFFECT_CATEGORIES.flatMap((category) => category.items).filter((item) => item.status === "soon").length;

  return (
    <Section id="effects" tone="white">
      <SectionHead
        id="effects"
        eyebrow="Effects library"
        title="What you can put on a scene."
        lead={`${live} effect types in the app today; ${soon} more marked “coming soon”.`}
      />

      <Tiles min={200}>
        {EFFECT_CATEGORIES.map((category) => (
          <div className="mkt-tile is-plain" key={category.id}>
            <span className="mkt-tile-text">
              <b>{category.name}</b>
              <i>{category.blurb}</i>
              <span className="mkt-tile-list">
                {category.items.slice(0, 4).map((item) => (
                  <span key={item.name}>
                    {item.name}
                    {typeof item.count === "number" && <em> {item.count}</em>}
                    {item.status === "soon" && <ComingSoon />}
                  </span>
                ))}
              </span>
            </span>
          </div>
        ))}
      </Tiles>

      <Note>
        Everything above is drawn by the same renderer as the finished video, so a preview is the export.
      </Note>

      <FigureNote>
        <Pill>{HONESTY.demoLabel}</Pill>
        <span>Counts read from the app’s catalogues.</span>
      </FigureNote>
    </Section>
  );
}
