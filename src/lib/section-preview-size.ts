import type { AspectRatioType } from "../types";
import { frameSizeFor } from "./scene-framing";

/* ---------------------------------------------------------------------------
 * How big the intro/outro previews are drawn, for each project shape.
 *
 * This lives in its own module, away from the JSX, because the bug it exists
 * to prevent is a geometry bug and geometry can be checked by a test.
 *
 * The bug: the live stage was given `w-full` together with `max-h-[420px]`.
 * The width was pinned to the column (440px) while the height was clamped at
 * 420, so a 360x640 portrait canvas was painted into a 440x420 landscape box.
 * A canvas defaults to `object-fit: fill`, so nothing letterboxed - the
 * picture was simply squashed. 16:9 was the one shape with no clamp, which is
 * why it was the one shape that looked right.
 *
 * The rule here: cap the WIDTH, never the height. With `h-auto` the element
 * then keeps its real ratio and still honours the height budget, because the
 * cap is derived from that budget rather than applied on top of it.
 * ------------------------------------------------------------------------- */

/** Tallest the live stage may be, in CSS pixels. */
export const STAGE_MAX_H = 420;
/** Tallest a choice thumbnail may be, in CSS pixels. */
export const THUMB_MAX_H = 200;
/** Width of the column the live stage sits in, so a cap below it does nothing. */
export const STAGE_COLUMN_W = 440;
/** Roughly the width of a thumbnail cell in the choice grid. */
export const THUMB_CELL_W = 240;

export interface SectionPreviewShape {
  /** Backing-store size of the live stage canvas. */
  stage: { w: number; h: number };
  /** Backing-store size of a choice thumbnail canvas. */
  thumb: { w: number; h: number };
  /** Tailwind class capping the stage width; "" when the column already fits. */
  stageCls: string;
  /** Tailwind class capping the thumbnail width; "" when the cell already fits. */
  thumbCls: string;
}

/**
 * Widest a frame of this shape can be and still fit inside `maxH`.
 * Rounded down, so the budget is never exceeded by a rounding error.
 */
export function widthForHeight(ratio: AspectRatioType | undefined, maxH: number): number {
  const frame = frameSizeFor(ratio);
  return Math.floor((maxH * frame.w) / frame.h);
}

/**
 * The preview geometry for a project shape.
 *
 * The canvas backing stores are the real frame ratio scaled down - never a
 * fixed 16:9 - so a portrait project previews its intro in portrait, both on
 * the stage and on every choice card. A landscape thumbnail is a poor preview
 * of a portrait intro even when it is not technically distorted.
 */
export function sectionPreviewShape(ratio: AspectRatioType | undefined): SectionPreviewShape {
  switch (ratio) {
    case "9:16":
      return {
        stage: { w: 360, h: 640 },
        thumb: { w: 180, h: 320 },
        stageCls: "max-w-[236px]",
        thumbCls: "max-w-[108px]",
      };
    case "1:1":
      return {
        stage: { w: 480, h: 480 },
        thumb: { w: 240, h: 240 },
        stageCls: "max-w-[420px]",
        thumbCls: "max-w-[150px]",
      };
    case "4:3":
      // No cap: 4:3 at the column's full 440px is only 330px tall, already
      // inside the budget. A cap wider than the space available is dead
      // code that reads like a safeguard.
      return {
        stage: { w: 560, h: 420 },
        thumb: { w: 240, h: 180 },
        stageCls: "",
        thumbCls: "",
      };
    case "16:9":
    default:
      return {
        stage: { w: 640, h: 360 },
        thumb: { w: 240, h: 135 },
        stageCls: "",
        thumbCls: "",
      };
  }
}

/** The px value out of a `max-w-[Npx]` class, or null when uncapped. */
export function maxWidthFromClass(cls: string): number | null {
  const m = /max-w-\[(\d+)px\]/.exec(cls);
  return m ? Number(m[1]) : null;
}
