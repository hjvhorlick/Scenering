import { useSeededSeries } from "../hooks";

/**
 * Narration, drawn small.
 *
 * Two shapes, both standing in for the studio's real sound visualisers in
 * places that must stay light — the hero, the stepper and the transformation
 * strip all paint on first sight, and the real renderer carries the whole
 * effect catalogue with it.
 *
 * - `dots` (the default for voice) is the website's CSS echo of **Minimal
 *   Talking Dots**, the visualiser the Voiceover step now draws live: four
 *   glossy spheres in the renderer's own colours that stretch into pills while
 *   the voice speaks. The heavy, real version of exactly this is rendered
 *   further down the page by `RealVisualiser`.
 * - `bars` is the older silhouette, kept for the places that are showing a
 *   *clip* of audio rather than a visualiser.
 *
 * The shape is derived from the scene's own text, so the same scene always
 * draws the same silhouette — a waveform that reshuffles on every render reads
 * as decoration, and this one is standing in for real audio.
 */

/**
 * The four dot colours from `render-visualizers.ts` (`case "minimal_voice"`),
 * with the renderer's default primary. `tests/marketing.test.ts` checks they
 * still agree.
 */
export const TALKING_DOT_COLORS = ["#38bdf8", "#ef4444", "#f59e0b", "#10b981"];

export default function Waveform({
  seed,
  bars = 48,
  live = false,
  quiet = false,
  height = 30,
  label,
  variant = "bars",
}: {
  seed: string;
  bars?: number;
  /** Animate — only ever passed when the demonstration is "playing". */
  live?: boolean;
  /** Greyed out: a scene that has not been narrated yet. */
  quiet?: boolean;
  height?: number;
  /** Accessible description; omit inside an already-labelled figure. */
  label?: string;
  /** `dots` mirrors the app's Minimal Talking Dots visualiser. */
  variant?: "bars" | "dots";
}) {
  const series = useSeededSeries(seed, variant === "dots" ? TALKING_DOT_COLORS.length : bars, quiet ? 0.12 : 0.2, quiet ? 0.42 : 1);

  if (variant === "dots") {
    return (
      <div
        className={`mkt-dots${live ? " is-live" : ""}${quiet ? " is-quiet" : ""}`}
        style={{ height }}
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
      >
        {TALKING_DOT_COLORS.map((color, index) => (
          <span
            key={color}
            className="mkt-dot"
            style={{
              // the renderer stretches each sphere into a pill on its own beat
              height: `${Math.round(34 + series[index] * 62)}%`,
              background: `linear-gradient(150deg, ${color} 8%, ${color} 46%, rgb(0 0 0 / 0.36))`,
              animationDelay: live ? `${index * 0.13}s` : undefined,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`mkt-wave${live ? " is-live" : ""}${quiet ? " is-quiet" : ""}`}
      style={{ height }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {series.map((value, index) => (
        <span
          key={index}
          className="mkt-wave-bar"
          style={{
            height: `${Math.round(value * 100)}%`,
            animationDelay: live ? `${(index % 12) * 0.07}s` : undefined,
          }}
        />
      ))}
    </div>
  );
}
