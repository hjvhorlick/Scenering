/**
 * The owner's social profiles in the page's structured data.
 *
 * Every public page carries one JSON-LD block (written at build time by
 * src/marketing/seo-head.ts) describing Scenering as an Organization. Search
 * engines use an Organization's `sameAs` list to learn which profiles on other
 * sites belong to it — the YouTube channel and the Facebook page are how a
 * brand-new name gets tied to its website. Those links are not typed into the
 * code: the owner saves them in the administration panel, and the social strip
 * (src/shared/SocialLinks.tsx) fetches them on every page. When it has them it
 * hands them to `applyOrganizationProfiles`, which writes them into the block,
 * so the structured data always names the same profiles the page links to.
 *
 * Google reads structured data from the rendered page, so a value set here is
 * one it sees — provided it may fetch /api/social-links, which robots.txt
 * explicitly allows (server/platform.ts).
 */

/** The id of the page's JSON-LD script element. */
export const STRUCTURED_DATA_ID = "seo-ld";

type JsonNode = Record<string, unknown>;

/**
 * The JSON-LD text with the given profile URLs set as the Organization's
 * `sameAs`. Only absolute https:// links are kept, each once; an empty list
 * removes `sameAs`. Returns null when the text is not a JSON-LD graph with an
 * Organization in it, so a caller never writes back something it did not
 * understand.
 */
export function withOrganizationProfiles(jsonLd: string, urls: readonly string[]): string | null {
  let data: unknown;
  try {
    data = JSON.parse(jsonLd);
  } catch {
    return null;
  }
  const graph = (data as { "@graph"?: unknown })?.["@graph"];
  if (!Array.isArray(graph)) return null;
  const organization = graph.find((node): node is JsonNode => Boolean(node) && (node as JsonNode)["@type"] === "Organization");
  if (!organization) return null;
  const profiles = [...new Set(urls.map((url) => String(url || "").trim()).filter((url) => /^https:\/\/\S+$/i.test(url)))];
  if (profiles.length) organization.sameAs = profiles;
  else delete organization.sameAs;
  return JSON.stringify(data, null, 2);
}

/** Writes the profiles into the page's JSON-LD block, when the page has one. */
export function applyOrganizationProfiles(urls: readonly string[]): void {
  if (typeof document === "undefined") return;
  const script = document.getElementById(STRUCTURED_DATA_ID);
  const current = script?.textContent;
  if (!script || !current) return;
  const next = withOrganizationProfiles(current, urls);
  if (next !== null && next !== current) script.textContent = next;
}
