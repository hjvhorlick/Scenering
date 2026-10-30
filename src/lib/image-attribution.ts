/** Source information kept with a scene, never passed to the video encoder. */
export interface ImageAttribution {
  imageUrl: string;
  provider: string;
  creator?: string;
  title?: string;
  sourceUrl?: string;
  license?: string;
  licenseUrl?: string;
  credit?: string;
}

/** Provider descriptions may contain HTML. Credits are plain text, not markup. */
export function attributionText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/<[^>]*>/g, " ")
    .replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity: string) => {
      const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
      if (entity[0] !== "#") return named[entity.toLowerCase()] ?? match;
      const n = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "";
    }).replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 1000) : undefined;
}

export function attributionUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const u = new URL(value);
    return (u.protocol === "https:" || u.protocol === "http:") && !u.username && !u.password ? u.href : undefined;
  } catch { return undefined; }
}

/** Only use a credit record when it belongs to the image currently selected. */
export function formatImageAttribution(
  index: number,
  imageUrl: string | null,
  resolvedUrl: string,
  credit?: ImageAttribution | null,
): string {
  if (!credit || credit.imageUrl !== imageUrl) {
    const asset = /^https?:/i.test(resolvedUrl) ? resolvedUrl : "Uploaded or bundled image";
    return `Scene ${index}: ${asset} — identify the individual creator, source and license`;
  }
  return [
    `Scene ${index}: ${credit.provider}`,
    `  Creator: ${credit.creator || "Not provided — identify before publishing"}`,
    ...(credit.title ? [`  Title: ${credit.title}`] : []),
    `  Source: ${credit.sourceUrl || "Not provided — find original asset page"}`,
    `  License: ${credit.license || "Check the individual asset terms"}`,
    ...(credit.licenseUrl ? [`  License URL: ${credit.licenseUrl}`] : []),
    ...(credit.credit ? [`  Source credit: ${credit.credit}`] : []),
  ].join("\n");
}
