/**
 * Where a render actually spent its time.
 *
 * Long renders are the ones that go wrong, and they are exactly the ones that
 * are impractical to sit and watch. A nine-minute video takes long enough
 * that "it felt slow" is the only report anyone can reasonably give, and that
 * is not enough to decide what to fix next.
 *
 * So the render times itself and prints a short table at the end. Two of the
 * columns matter more than the rest:
 *
 *  - The share taken by the audio pass. That stage stops and restarts the
 *    audio engine once per video frame to read the voice and music
 *    analysers, and whether that is worth redesigning depends entirely on
 *    what it costs on a slow machine, which is not something to guess at from
 *    a fast one.
 *
 *  - Time spent with the tab in the background. Renders used to crawl the
 *    moment you looked at something else, because the frame loop yielded
 *    through a timer and browsers clamp timers to a second in a hidden tab.
 *    Recording the hidden time next to the total is what makes that claim
 *    checkable rather than merely asserted.
 *
 * Nothing here is on the hot path: one timestamp per stage, and a visibility
 * listener that fires when you switch tabs.
 */

export interface StageTiming {
  name: string;
  ms: number;
  /** Share of the whole render, 0..100. */
  pct: number;
}

export interface RenderTimingSummary {
  totalMs: number;
  stages: StageTiming[];
  hiddenMs: number;
  notes: Record<string, string>;
}

export interface RenderTimerOptions {
  /** Injectable clock, so the report can be tested without real waiting. */
  now?: () => number;
  /** Injectable visibility source; omitted in Node, where there is no document. */
  isHidden?: () => boolean;
}

const defaultNow = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

/** Two significant figures for small numbers, none for large ones. */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms >= 60_000) {
    const mins = Math.floor(ms / 60_000);
    const secs = Math.round((ms % 60_000) / 1000);
    return secs === 60 ? `${mins + 1}m 0s` : `${mins}m ${secs}s`;
  }
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

export class RenderTimer {
  private readonly now: () => number;
  private readonly startedAt: number;
  private stageName: string | null = null;
  private stageStartedAt = 0;
  private readonly durations = new Map<string, number>();
  private readonly order: string[] = [];
  private readonly notes: Record<string, string> = {};
  private stoppedAt: number | null = null;

  /* hidden-tab accounting */
  private hiddenMs = 0;
  private hiddenSince: number | null = null;
  private detach: (() => void) | null = null;

  constructor(options: RenderTimerOptions = {}) {
    this.now = options.now ?? defaultNow;
    this.startedAt = this.now();
    this.watchVisibility(options.isHidden);
  }

  private watchVisibility(isHidden?: () => boolean) {
    const probe =
      isHidden ??
      (typeof document !== "undefined" ? () => document.hidden : null);
    if (!probe) return;

    if (probe()) this.hiddenSince = this.startedAt;

    if (typeof document === "undefined" || !document.addEventListener) return;
    const onChange = () => {
      if (probe()) {
        if (this.hiddenSince === null) this.hiddenSince = this.now();
      } else if (this.hiddenSince !== null) {
        this.hiddenMs += this.now() - this.hiddenSince;
        this.hiddenSince = null;
      }
    };
    document.addEventListener("visibilitychange", onChange);
    this.detach = () => document.removeEventListener("visibilitychange", onChange);
  }

  /** Close the running stage, if any, and open `name`. */
  stage(name: string): void {
    const at = this.now();
    this.closeStage(at);
    this.stageName = name;
    this.stageStartedAt = at;
    if (!this.durations.has(name)) {
      this.durations.set(name, 0);
      this.order.push(name);
    }
  }

  private closeStage(at: number) {
    if (this.stageName === null) return;
    const previous = this.durations.get(this.stageName) ?? 0;
    this.durations.set(this.stageName, previous + (at - this.stageStartedAt));
    this.stageName = null;
  }

  /** Attach a fact worth reading beside the timings — frame count, file size. */
  note(key: string, value: string | number): void {
    this.notes[key] = String(value);
  }

  /** Stop the clock. Safe to call twice; the second call is ignored. */
  stop(): void {
    if (this.stoppedAt !== null) return;
    const at = this.now();
    this.closeStage(at);
    if (this.hiddenSince !== null) {
      this.hiddenMs += at - this.hiddenSince;
      this.hiddenSince = null;
    }
    this.stoppedAt = at;
    this.detach?.();
    this.detach = null;
  }

  summary(): RenderTimingSummary {
    const end = this.stoppedAt ?? this.now();
    const totalMs = end - this.startedAt;
    const stages: StageTiming[] = this.order.map((name) => {
      const ms = this.durations.get(name) ?? 0;
      return { name, ms, pct: totalMs > 0 ? (ms / totalMs) * 100 : 0 };
    });
    return { totalMs, stages, hiddenMs: this.hiddenMs, notes: { ...this.notes } };
  }

  /** A block that can be copied out of the console and pasted somewhere useful. */
  format(): string {
    const { totalMs, stages, hiddenMs, notes } = this.summary();
    const nameWidth = Math.max(12, ...stages.map((s) => s.name.length));
    const lines: string[] = [];

    lines.push("Render timing");
    lines.push("=".repeat(nameWidth + 20));
    for (const s of stages) {
      const pct = `${s.pct.toFixed(1)}%`.padStart(6);
      lines.push(`${s.name.padEnd(nameWidth)}  ${formatMs(s.ms).padStart(8)}  ${pct}`);
    }
    lines.push("-".repeat(nameWidth + 20));
    lines.push(`${"TOTAL".padEnd(nameWidth)}  ${formatMs(totalMs).padStart(8)}`);

    if (hiddenMs > 0) {
      const share = totalMs > 0 ? (hiddenMs / totalMs) * 100 : 0;
      lines.push(
        `${"in background".padEnd(nameWidth)}  ${formatMs(hiddenMs).padStart(8)}  ${`${share.toFixed(1)}%`.padStart(6)}`
      );
    }

    const keys = Object.keys(notes);
    if (keys.length > 0) {
      lines.push("");
      for (const key of keys) lines.push(`${key}: ${notes[key]}`);
    }

    return lines.join("\n");
  }
}
