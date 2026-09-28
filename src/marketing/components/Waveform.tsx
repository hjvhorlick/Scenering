import { useSeededSeries } from "../hooks";

/**
 * Narration waveform.
 *
 * The shape is derived from the scene's own text, so the same scene always
 * draws the same silhouette — a waveform that reshuffles on every render
 * reads as decoration, and this one is standing in for real audio.
 */
export default function Waveform({
  seed,
  bars = 48,
  live = false,
  quiet = false,
  height = 30,
  label,
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
}) {
  const series = useSeededSeries(seed, bars, quiet ? 0.12 : 0.2, quiet ? 0.42 : 1);

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
