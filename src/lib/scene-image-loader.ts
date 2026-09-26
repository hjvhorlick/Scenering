/**
 * Scene image loading — ONE loader shared by the live preview and the export.
 *
 * The preview and the render used to carry two private loaders with opposite
 * failure behaviour: the preview's fell back to a "Scene N" gradient card on
 * any error (so the preview always showed imagery), while the render's
 * resolved null on error or after an 8s timeout (so the exported video drew
 * black frames for exactly the same scene). Whatever one showed, the other
 * contradicted — "images in the preview but not in the render".
 *
 * This loader is the single behaviour both now share:
 *
 *   1. same-origin paths (the bundled nature library), data: and blob: URLs
 *      load directly; external URLs are routed through the image proxy so the
 *      canvas is never tainted;
 *   2. a failed direct load is retried once through the proxy;
 *   3. a final failure falls back to a gradient "Scene N" card — the same
 *      card the preview has always shown — so a render can never come out
 *      with black scene frames. `usedFallback` reports it so the UI can say
 *      which scenes need their photo re-searched.
 */

import { proxyImageUrl } from "./image-search";
import { normalizeSceneImageUrl } from "./legacy-image-urls";

export interface SceneImageResult {
  img: HTMLImageElement;
  /** True when the real photo could not be loaded and the gradient card was used. */
  usedFallback: boolean;
}

export interface LoadSceneImageOptions {
  /** Overall timeout for the direct + retried attempts. Default 15s. */
  timeoutMs?: number;
  /**
   * "card" (default) resolves a gradient placeholder on failure;
   * "none" resolves null on failure (used for logos, where a placeholder
   * would be wrong — a missing watermark should simply not be drawn).
   */
  fallback?: "card" | "none";
}

const FALLBACK_W = 1280;
const FALLBACK_H = 720;

/** Same-origin / data / blob URLs pass through; everything else is proxied.
 *  Legacy nature-library URLs are healed to their bundled local file first,
 *  so a selection made before the library was bundled still renders as the
 *  photo the user picked — in the preview AND in the export. */
function safeSrc(url: string): string {
  const healed = normalizeSceneImageUrl(url);
  if (/^(data:|blob:)/.test(healed)) return healed;
  if (healed.startsWith("/") && !healed.startsWith("//")) return healed;
  return proxyImageUrl(healed);
}

function isProxied(url: string): boolean {
  return url.includes("/proxy-image?url=");
}

/** The gradient card the preview has always drawn for an unloadable photo. */
function buildFallbackCard(fallbackIndex: number): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const c = document.createElement("canvas");
    c.width = FALLBACK_W;
    c.height = FALLBACK_H;
    const ctx = c.getContext("2d");
    if (!ctx) {
      // No 2D context at all (should not happen in a browser): resolve an
      // empty image rather than hang — the caller treats naturalWidth 0 as
      // "nothing to draw".
      resolve(new Image());
      return;
    }
    const hue = (fallbackIndex * 60) % 360;
    const g = ctx.createLinearGradient(0, 0, FALLBACK_W, FALLBACK_H);
    g.addColorStop(0, `hsl(${hue},50%,25%)`);
    g.addColorStop(1, `hsl(${(hue + 60) % 360},50%,15%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FALLBACK_W, FALLBACK_H);
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Scene ${fallbackIndex + 1}`, FALLBACK_W / 2, FALLBACK_H / 2);
    const p = new Image();
    p.onload = () => resolve(p);
    p.onerror = () => resolve(new Image());
    p.src = c.toDataURL();
  });
}

/**
 * Loads a scene image with the preview's never-fail behaviour.
 * Resolves null only when `fallback: "none"` was requested and the load
 * failed — never rejects.
 */
export function loadSceneImage(
  url: string,
  fallbackIndex = 0,
  opts: LoadSceneImageOptions = {}
): Promise<SceneImageResult | null> {
  const timeoutMs = Math.max(1000, opts.timeoutMs ?? 15000);
  const wantFallback = (opts.fallback ?? "card") === "card";

  return new Promise((resolve) => {
    const giveUp = () => {
      if (wantFallback) {
        buildFallbackCard(fallbackIndex).then((img) => resolve({ img, usedFallback: true }));
      } else {
        resolve(null);
      }
    };

    if (!url) {
      giveUp();
      return;
    }

    const healed = normalizeSceneImageUrl(url);
    const attempt = (src: string, isRetry: boolean) => {
      const img = new Image();
      if (!/^(data:|blob:)/.test(src)) img.crossOrigin = "anonymous";
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (!isRetry && !isProxied(src)) attempt(proxyImageUrl(healed), true);
        else giveUp();
      }, timeoutMs);

      img.onload = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ img, usedFallback: false });
      };
      img.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!isRetry && !isProxied(src)) attempt(proxyImageUrl(healed), true);
        else giveUp();
      };

      img.src = src;
    };

    attempt(safeSrc(url), false);
  });
}
