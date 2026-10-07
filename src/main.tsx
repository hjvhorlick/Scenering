import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { initTheme } from "./lib/themes";
import { routeForPath, useRoute } from "./lib/route";
import { preloadStudio } from "./studio/studio-loader";
import { initAnalytics } from "./lib/analytics";

/**
 * One product with the website as its front page.
 *
 *   /      the public front page (src/marketing)
 *   /app   the studio, behind its sign-in (src/studio → src/App)
 *
 * The surfaces remain separate chunks, but their requests start together.
 * While somebody reads the landing page or types a passphrase, the browser is
 * already downloading and parsing the sign-in door, the editor, the renderer
 * and the studio CSS. Authentication still controls whether the studio is
 * mounted; it no longer controls when the application starts loading.
 */
const MarketingSite = lazy(() => import("./marketing/MarketingSite"));
const StudioEntry = lazy(() => import("./studio/StudioEntry"));

// Keep the public website lightweight. The large editor/renderer bundle starts
// only at an account or studio route; marketing visuals are their own lazy assets.
if (typeof window !== "undefined" && routeForPath(window.location.pathname) === "studio") {
  void preloadStudio().catch(() => {});
}

// Apply the persisted theme before first paint (index.html also applies it
// with an inline bootstrap, so this is just a safety net for HMR).
initTheme();
if (typeof window !== "undefined") initAnalytics();
// The studio stylesheet is arriving in parallel now. Claim the marketing
// surface before either stylesheet can paint, rather than waiting for the
// MarketingSite effect and risking one frame of studio-wide base styles.
if (typeof window !== "undefined" && routeForPath(window.location.pathname) === "site") {
  document.documentElement.setAttribute("data-mkt", "1");
  const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]') || document.createElement("link");
  canonical.rel = "canonical";
  canonical.href = new URL(window.location.pathname, window.location.origin).toString();
  if (!canonical.isConnected) document.head.appendChild(canonical);
} else if (typeof document !== "undefined") {
  const robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]') || document.createElement("meta");
  robots.name = "robots";
  robots.content = "noindex,nofollow";
  if (!robots.isConnected) document.head.appendChild(robots);
}

/** Quiet placeholder — one paint at most, so it must not flash anything loud. */
function Loading({ label }: { label: string }) {
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
        fontSize: 13,
        color: "#867f74",
      }}
      role="status"
      aria-live="polite"
    >
      {label}
    </div>
  );
}

function Root() {
  const { route } = useRoute();

  if (route === "studio") {
    return (
      <Suspense fallback={<Loading label="Opening the studio…" />}>
        <StudioEntry />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<Loading label="Loading…" />}>
      <MarketingSite />
    </Suspense>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
