/**
 * Shared animation driver for the many small preview canvases in the studio
 * (effect cards, filter previews, sticker previews…).
 *
 * Each of these used to run its own uncapped requestAnimationFrame loop. On
 * slower machines a screen full of card previews could saturate the main
 * thread and make even mouse-wheel scrolling lag. `startPreviewLoop` fixes
 * that in one place:
 *
 *   1. Paints at a capped frame rate (default 24fps — plenty for thumbnails).
 *   2. Completely stops painting while the canvas is scrolled off-screen
 *      (IntersectionObserver), so the section the user is NOT looking at
 *      costs zero CPU.
 *
 * Returns a cleanup function.
 */
export function startPreviewLoop(
  element: Element,
  draw: (now: number) => void,
  opts: { fps?: number } = {}
): () => void {
  const minInterval = 1000 / Math.max(1, opts.fps ?? 24);
  let raf = 0;
  let lastPaint = 0;
  let visible = true;
  let stopped = false;

  let observer: IntersectionObserver | null = null;
  try {
    observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
      },
      // start painting slightly before the card scrolls into view,
      // stop again shortly after it leaves
      { rootMargin: "80px" }
    );
    observer.observe(element);
  } catch {
    // no IntersectionObserver → just always animate
  }

  const tick = (now: number) => {
    if (stopped) return;
    raf = requestAnimationFrame(tick);
    if (!visible) return;
    if (now - lastPaint < minInterval) return;
    lastPaint = now;
    draw(now);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    observer?.disconnect();
  };
}
