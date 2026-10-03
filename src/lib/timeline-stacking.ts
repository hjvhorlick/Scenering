/* ------------------------------------------------------------------ *
 * Timeline stacking — two effects at the same moment must both stay
 * visible.
 *
 * Every block used to be drawn on its lane's centre line, so a sticker
 * that happened to sit under a full-length music bed was simply painted
 * over: the timeline said "one effect" when it actually held four.
 *
 * Blocks are packed into sub-rows instead. Anything that does not collide
 * keeps sharing a row, so a sparse timeline is exactly as tall as it was
 * before — only a genuine overlap costs height. Past a hard ceiling the
 * rows get thinner rather than the timeline getting taller, so a busy
 * project stays compact on screen and nothing is ever hidden.
 * ------------------------------------------------------------------ */

/** Vertical air between stacked rows, in px. */
export const ROW_GAP = 2;
/** Below this height a row is a colour chip: icon only, no label. */
export const ROW_LABEL_MIN_H = 17;
/** A row never gets thinner than this, however many are stacked. */
export const MIN_ROW_H = 10;
/** Comfortable row height when there is room for it. */
export const IDEAL_ROW_H_COMPACT = 22;
export const IDEAL_ROW_H_EXPANDED = 26;
/** Hard ceiling on a lane: past this, rows thin out instead. */
export const MAX_LANE_H_COMPACT = 74;
export const MAX_LANE_H_EXPANDED = 96;
/** Horizontal air so two neighbouring blocks never read as one long one. */
export const BLOCK_GUTTER_PX = 3;

export interface BlockGeometry {
  /** Left edge of the drawn block, in px. */
  left: number;
  /** Drawn width of the block, in px. */
  width: number;
}

export interface LanePacking {
  /** insert id → the sub-row it sits on (0 = top). */
  placement: Map<string, number>;
  /** How many sub-rows the lane needs. Always at least 1. */
  rows: number;
}

export interface LaneMetrics {
  /** Total lane height in px. */
  height: number;
  /** Height of one sub-row, gap included. */
  rowH: number;
}

/**
 * Greedy interval packing, measured in pixels rather than seconds.
 *
 * Seconds are the wrong unit here: a 0.2s effect is still drawn at the 26px
 * minimum width, so two effects that do not overlap in time can still overlap
 * on screen. Packing on the drawn geometry is what actually guarantees every
 * block stays readable — and it means zooming in, which spreads blocks apart,
 * naturally collapses the stack back down.
 */
export function packLane<T extends { id: string }>(
  items: T[],
  geometry: (item: T) => BlockGeometry
): LanePacking {
  const placement = new Map<string, number>();
  /** rowEnds[i] = x where row i becomes free again. */
  const rowEnds: number[] = [];

  const ordered = items
    .map((item) => ({ item, ...geometry(item) }))
    // left to right; on a tie the wider block takes the higher row so the
    // long beds settle at the top and short effects sit under them.
    .sort((a, b) => a.left - b.left || b.width - a.width);

  for (const { item, left, width } of ordered) {
    let row = rowEnds.findIndex((end) => left >= end);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(0);
    }
    rowEnds[row] = left + width + BLOCK_GUTTER_PX;
    placement.set(item.id, row);
  }

  return { placement, rows: Math.max(1, rowEnds.length) };
}

/**
 * Turn a row count into a lane height.
 *
 * One row keeps the lane at its original height, so nothing moves for the
 * common case. More rows grow the lane towards `maxLane`, then stop: beyond
 * that the rows share out whatever height exists, down to `MIN_ROW_H`. The
 * floor wins over the ceiling in the extreme case (a dozen stacked effects)
 * because rows must always physically fit — never hide a block.
 */
export function laneMetrics(
  rows: number,
  base: number,
  idealRow: number,
  maxLane: number
): LaneMetrics {
  if (rows <= 1) return { height: base, rowH: base };
  const wanted = rows * idealRow + ROW_GAP * 2;
  const minimum = rows * MIN_ROW_H + ROW_GAP * 2;
  const height = Math.max(base, minimum, Math.min(maxLane, wanted));
  return { height, rowH: (height - ROW_GAP * 2) / rows };
}
