import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { initTheme } from "./lib/themes";
import { routeForPath, useRoute } from "./lib/route";
import { preloadStudio } from "./studio/studio-loader";

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
const marketingModule = import("./marketing/MarketingSite");
const studioEntryModule = import("./studio/StudioEntry");
const MarketingSite = lazy(() => marketingModule);
const StudioEntry = lazy(() => studioEntryModule);

// Start the large application request in parallel with the front page. A
// transient preload failure is retried by StudioEntry when the user signs in.
void preloadStudio().catch(() => {});

// Apply the persisted theme before first paint (index.html also applies it
// with an inline bootstrap, so this is just a safety net for HMR).
initTheme();
// The studio stylesheet is arriving in parallel now. Claim the marketing
// surface before either stylesheet can paint, rather than waiting for the
// MarketingSite effect and risking one frame of studio-wide base styles.
if (typeof window !== "undefined" && routeForPath(window.location.pathname) === "site") {
  document.documentElement.setAttribute("data-mkt", "1");
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
