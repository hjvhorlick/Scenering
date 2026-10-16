/**
 * How long a gift of SceneFlow or SceneForge lasts.
 *
 * Shared by the server (which works out the end date) and the Email Centre
 * (which offers the choices). The ids are what is stored in the `period`
 * column of complimentary_grants and gift_codes: "month" and "year" are the
 * values the app has always written, so every older gift keeps reading the
 * same way, and the others were added with gift codes.
 */
export const GIFT_LENGTHS = [
  { id: "week", label: "1 week" },
  { id: "month", label: "1 month" },
  { id: "3 months", label: "3 months" },
  { id: "6 months", label: "6 months" },
  { id: "year", label: "1 year" },
] as const;

export type GiftLength = (typeof GIFT_LENGTHS)[number]["id"];

export function isGiftLength(value: unknown): value is GiftLength {
  return GIFT_LENGTHS.some((entry) => entry.id === value);
}

/** "1 month", "3 months"… Unknown values are shown as they are. */
export function giftLengthLabel(value: string | null | undefined): string {
  return GIFT_LENGTHS.find((entry) => entry.id === value)?.label || String(value || "");
}

/**
 * When a gift that starts at `start` ends. Calendar months and years, the
 * way gifts have always been counted (a month from 16 October is
 * 16 November); a week is seven days.
 */
export function giftEndsAt(start: Date, length: GiftLength): Date {
  const end = new Date(start.getTime());
  if (length === "week") end.setUTCDate(end.getUTCDate() + 7);
  else if (length === "month") end.setUTCMonth(end.getUTCMonth() + 1);
  else if (length === "3 months") end.setUTCMonth(end.getUTCMonth() + 3);
  else if (length === "6 months") end.setUTCMonth(end.getUTCMonth() + 6);
  else end.setUTCFullYear(end.getUTCFullYear() + 1);
  return end;
}
