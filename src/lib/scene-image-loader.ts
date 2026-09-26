/**
 * Scene image loading — ONE loader shared by the live preview and the export.
 *
 * THE RENDER BUG THIS FIXES: the preview loaded scene photos directly in the
 * browser, while the export routed every external URL through the server-side
 * image proxy. Whenever the server cannot reach the internet (an offline or
 * network-restricted deployment), the proxy hands back a grey placeholder —
 * so the exact scene that showed a photo in the preview rendered as a
 * placeholder in the video. The user's browser, meanwhile, could load the
 * photo fine all along.
 *
 * Both now load through this loader, in this order:
 *
 *   1. DIRECTLY in the browser — exactly how the preview always worked.
 *      `crossOrigin="anonymous"` guarantees the image is either CORS-clean
 *      (safe to record from canvas.captureStream) or fails outright.
 *      Proxied URLs (`/api/proxy-image?url=…`, the form saved with a scene
 *      when a photo is picked) are unwrapped to their real address first.
 *   2. Through the server proxy — for hosts the browser cannot load
 *      cross-origin; works whenever the server does have internet.
 *   3. The gradient "Scene N" card — the same card the preview has always
 *      drawn as a last resort, so a render can never come out with black
 *      scene frames. `usedFallback` reports it so the UI can say which
 *      scenes need their photo re-searched.
 *
 * Local paths (`/…`), `data:` and `blob:` URLs load directly and never need
 * the proxy.
 */

import { proxyImageUrl } from "./image-search";
import { rawImageUrl } from "./image-picker";
import { resolveLegacyLocalImage } from "./nature-library-compat";

export interface SceneImageResult {
  img: HTMLImageElement;
  /** True when the real photo could not be loaded and the gradient card was used. */
  usedFallback: boolean;
}

export interface LoadSceneImageOptions {
  /** Timeout per attempt. Default 15s. */
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

/** Unwrap `/api/proxy-image?url=…` (or the Supabase form) to the real address. */
function unwrapProxied(url: string): string {
  return url.includes("proxy-image?url=") ? rawImageUrl(url) : url;
}

/** Local / data / blob URLs load directly and never need the proxy. */
function isDirectOnly(url: string): boolean {
  return /^(data:|blob:)/.test(url) || (url.startsWith("/") && !url.startsWith("//"));
}

/** The gradient card the preview has always drawn for an unloadable photo. */
function buildFallbackCard(fallbackIndex: number): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const c = document.createElement("canvas");
    c.width = FALLBACK_W;
    c.height = FALLBACK_H;
    const ctx = c.getContext("2d");
    if (!ctx) {
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
 * Loads a scene image the way the preview always did — directly in the
 * browser — with the proxy as backup and the gradient card as the last
 * resort. Resolves null only when `fallback: "none"` was requested and every
 * attempt failed. Never rejects.
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

    const raw = resolveLegacyLocalImage(String(url || "").trim());
    if (!raw) {
      giveUp();
      return;
    }

    // 1. the real address, loaded directly by the browser (preview behaviour)
    // 2. the server proxy, for cross-origin hosts the browser cannot load
    const direct = unwrapProxied(raw);
    const viaProxy = isDirectOnly(direct) ? direct : proxyImageUrl(direct);
    const attempts = viaProxy !== direct ? [direct, viaProxy] : [direct];

    const attempt = (i: number) => {
      if (i >= attempts.length) {
        giveUp();
        return;
      }
      const src = attempts[i];
      const img = new Image();
      if (!/^(data:|blob:)/.test(src)) img.crossOrigin = "anonymous";
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        attempt(i + 1);
      }, timeoutMs);

      img.onload = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!img.naturalWidth) {
          attempt(i + 1);
          return;
        }
        resolve({ img, usedFallback: false });
      };
      img.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        attempt(i + 1);
      };

      img.src = src;
    };

    attempt(0);
  });
}
