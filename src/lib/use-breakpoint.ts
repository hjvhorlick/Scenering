import { useEffect, useState } from "react";

/**
 * Viewport breakpoints for the app.
 *
 * These deliberately match Tailwind's defaults so a value read in JavaScript
 * and a `sm:`/`lg:` class in the markup always agree. Sizing that must be
 * computed (a canvas needs real pixels, not a CSS class) reads from here.
 */
export const BREAKPOINTS = {
  /** Base: the smallest phones, below the xs class breakpoint. */
  base: 0,
  /** Matches the custom `xs:` screen registered in tailwind.config.js. */
  xs: 420,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

export type BreakpointName = keyof typeof BREAKPOINTS;

const ORDER: BreakpointName[] = ["base", "xs", "sm", "md", "lg", "xl", "2xl"];

/** The largest breakpoint whose minimum width the viewport has reached. */
export function breakpointForWidth(width: number): BreakpointName {
  let current: BreakpointName = "base";
  for (const name of ORDER) {
    if (width >= BREAKPOINTS[name]) current = name;
  }
  return current;
}

/** True when `width` is at or above the named breakpoint. */
export function isAtLeast(width: number, name: BreakpointName): boolean {
  return width >= BREAKPOINTS[name];
}

export interface Viewport {
  width: number;
  height: number;
  breakpoint: BreakpointName;
  /** Phone-sized: single column, compact controls, full-screen dialogs. */
  isPhone: boolean;
  /** Tablet-sized: two columns where it helps, but not the full desktop layout. */
  isTablet: boolean;
  isDesktop: boolean;
  /** Very wide: sections can sit side by side to fill the screen. */
  isWide: boolean;
  /** Coarse pointer (finger) — hover affordances cannot be relied upon. */
  isTouch: boolean;
}

function readViewport(): Viewport {
  // Guard for non-browser environments (tests, SSR) so importing this module
  // never throws.
  if (typeof window === "undefined") {
    return {
      width: 1280,
      height: 800,
      breakpoint: "xl",
      isPhone: false,
      isTablet: false,
      isDesktop: true,
      isWide: false,
      isTouch: false,
    };
  }
  const width = window.innerWidth;
  const height = window.innerHeight;
  const breakpoint = breakpointForWidth(width);
  return {
    width,
    height,
    breakpoint,
    isPhone: width < BREAKPOINTS.sm,
    isTablet: width >= BREAKPOINTS.sm && width < BREAKPOINTS.lg,
    isDesktop: width >= BREAKPOINTS.lg,
    isWide: width >= BREAKPOINTS.xl,
    isTouch:
      typeof window.matchMedia === "function"
        ? window.matchMedia("(pointer: coarse)").matches
        : false,
  };
}

/**
 * Track the viewport so layout that cannot be expressed in CSS (canvas pixel
 * sizes, how many preview tiles to mount) adapts with the window.
 *
 * Prefer Tailwind responsive classes wherever the markup can express it; use
 * this only when a real number is needed.
 */
export function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>(readViewport);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      // Coalesce bursts of resize events into one state update per frame.
      frame = requestAnimationFrame(() => setViewport(readViewport()));
    };
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return viewport;
}
