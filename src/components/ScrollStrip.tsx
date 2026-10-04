import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A horizontal row that can be longer than the space it has.
 *
 * Rows of tabs and preset cards were already scrollable, but with the
 * scrollbar hidden and no edge treatment there was nothing on screen to say
 * so: the row simply ran off the side of the panel and the items past the
 * edge may as well not have existed. A trackpad user could flick it, everyone
 * else was stuck.
 *
 * This wraps such a row and adds the three things that make a strip
 * obviously draggable: arrow buttons that page it along, a fade at whichever
 * edge has more content behind it, and a slim visible scrollbar. All three
 * disappear when everything already fits, so a short row looks exactly as it
 * did before.
 *
 * The arrows are real buttons, so the row is reachable by keyboard and by
 * touch as well as by wheel.
 */
export default function ScrollStrip({
  children,
  className = "",
  label,
}: {
  children: ReactNode;
  /** Extra classes for the scrolling row itself (gap, padding, alignment). */
  className?: string;
  /** Describes the row for screen readers, e.g. "Quick presets". */
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const measure = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    // A pixel of slack: sub-pixel layout means scrollLeft rarely lands
    // exactly on the maximum, which would leave the arrow showing forever.
    const max = node.scrollWidth - node.clientWidth;
    setOverflowing(max > 2);
    setAtStart(node.scrollLeft <= 2);
    setAtEnd(node.scrollLeft >= max - 2);
  }, []);

  useEffect(() => {
    measure();
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    // Re-measure when the panel is resized or the row's contents change —
    // filtering a catalogue can turn a scrolling row into a short one.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    for (const child of Array.from(node.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [measure, children]);

  const page = (direction: 1 | -1) => {
    const node = ref.current;
    if (!node) return;
    node.scrollBy({ left: direction * Math.max(160, node.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={ref}
        onScroll={measure}
        role={label ? "group" : undefined}
        aria-label={label}
        className={`flex overflow-x-auto strip-scrollbar ${overflowing ? "pb-1.5" : "pb-1"} ${className}`}
      >
        {children}
      </div>

      {overflowing && !atStart && (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-gray-900 to-transparent rounded-l-lg" aria-hidden="true" />
          <button
            type="button"
            onClick={() => page(-1)}
            aria-label="Scroll left"
            className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-7 grid place-items-center rounded-full bg-gray-950/90 border border-hairline text-white text-sm shadow-lg hover:bg-indigo-600 hover:border-indigo-400 transition-colors"
          >
            ‹
          </button>
        </>
      )}

      {overflowing && !atEnd && (
        <>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-gray-900 to-transparent rounded-r-lg" aria-hidden="true" />
          <button
            type="button"
            onClick={() => page(1)}
            aria-label="Scroll right"
            className="absolute right-0 top-1/2 -translate-y-1/2 h-7 w-7 grid place-items-center rounded-full bg-gray-950/90 border border-hairline text-white text-sm shadow-lg hover:bg-indigo-600 hover:border-indigo-400 transition-colors"
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}
