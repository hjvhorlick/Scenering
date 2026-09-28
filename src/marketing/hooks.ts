import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * The small amount of behaviour the website needs.
 *
 * Rules that apply to everything here:
 *  - reduced motion wins. Every animated demonstration has a finished state,
 *    and that is what a visitor with `prefers-reduced-motion: reduce` sees
 *    immediately, with no timers started at all.
 *  - nothing animates off-screen. Timers only run while the element is in
 *    view, so scrolling past a section costs nothing.
 *  - every interactive demonstration is operable from the keyboard.
 */

/** True when the visitor asked for reduced motion. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);

  return reduced;
}

/** True once (and while) the element is on screen. */
export function useInView<T extends Element>(
  ref: React.RefObject<T>,
  options?: { once?: boolean; rootMargin?: string }
): boolean {
  const [inView, setInView] = useState(false);
  const once = options?.once ?? false;
  const rootMargin = options?.rootMargin ?? "0px 0px -12% 0px";

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin, threshold: 0.12 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, once, rootMargin]);

  return inView;
}

export interface StageSequence {
  /** Index of the stage currently shown. */
  stage: number;
  /** Jump to a stage (also stops the automatic sequence). */
  goTo: (index: number) => void;
  /** Whether the sequence is advancing on its own. */
  playing: boolean;
  setPlaying: (value: boolean) => void;
  /** True when a stage index has been reached. */
  reached: (index: number) => boolean;
}

/**
 * Advance through `count` stages while visible.
 *
 * With reduced motion the sequence is not started: the last stage — the
 * finished composition — is shown straight away, which is the honest end
 * state of every demonstration on the site.
 */
export function useStageSequence(
  count: number,
  options: { intervalMs?: number; active?: boolean; loop?: boolean } = {}
): StageSequence {
  const { intervalMs = 1500, active = true, loop = true } = options;
  const reduced = usePrefersReducedMotion();
  const [stage, setStage] = useState(() => (reduced ? count - 1 : 0));
  const [playing, setPlaying] = useState(!reduced);

  // Honour a change of preference mid-session.
  useEffect(() => {
    if (reduced) {
      setPlaying(false);
      setStage(count - 1);
    }
  }, [reduced, count]);

  useEffect(() => {
    if (!playing || !active || reduced) return;
    const id = window.setInterval(() => {
      setStage((current) => {
        if (current + 1 < count) return current + 1;
        return loop ? 0 : current;
      });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [playing, active, reduced, count, intervalMs, loop]);

  const goTo = useCallback((index: number) => {
    setPlaying(false);
    setStage(Math.max(0, Math.min(count - 1, index)));
  }, [count]);

  const reached = useCallback((index: number) => stage >= index, [stage]);

  return { stage, goTo, playing, setPlaying, reached };
}

/**
 * Arrow-key navigation for a tablist, as the WAI-ARIA authoring practices
 * describe it: one tab stop for the whole row, arrows move the selection.
 */
export function useRovingTabs(count: number, selected: number, onSelect: (index: number) => void) {
  const refs = useRef<(HTMLElement | null)[]>([]);

  const setRef = useCallback(
    (index: number) => (node: HTMLElement | null) => {
      refs.current[index] = node;
    },
    []
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const keys: Record<string, number> = {
        ArrowRight: 1,
        ArrowDown: 1,
        ArrowLeft: -1,
        ArrowUp: -1,
      };
      if (event.key === "Home") {
        event.preventDefault();
        onSelect(0);
        refs.current[0]?.focus();
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        onSelect(count - 1);
        refs.current[count - 1]?.focus();
        return;
      }
      const delta = keys[event.key];
      if (!delta) return;
      event.preventDefault();
      const next = (selected + delta + count) % count;
      onSelect(next);
      refs.current[next]?.focus();
    },
    [count, selected, onSelect]
  );

  return { setRef, onKeyDown };
}

/**
 * A stable pseudo-random series — used for waveform bars so a given scene
 * always draws the same shape (server, client and re-render agree) instead of
 * flickering a new random silhouette on every paint.
 */
export function useSeededSeries(seed: string, length: number, min = 0.18, max = 1): number[] {
  return useMemo(() => {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const out: number[] = [];
    for (let i = 0; i < length; i++) {
      hash ^= hash << 13;
      hash ^= hash >>> 17;
      hash ^= hash << 5;
      const unit = ((hash >>> 0) % 1000) / 1000;
      out.push(min + unit * (max - min));
    }
    return out;
  }, [seed, length, min, max]);
}
