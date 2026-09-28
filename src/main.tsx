import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { initTheme } from "./lib/themes";
import { useRoute } from "./lib/route";

/**
 * Two front doors, one bundle.
 *
 *   /      the public website  (src/marketing)
 *   /app   the studio, behind its sign-in  (src/studio → src/App)
 *
 * Three lazy layers, so nobody downloads something they cannot use: the
 * website, the sign-in screen, and — only once somebody is signed in — the
 * studio itself. That includes CSS. The studio's stylesheets (Tailwind plus
 * the six themes, ~300 kB) are imported by App.tsx and travel in its chunk;
 * the website and the sign-in screen bring their own, built from the shared
 * Porcelain tokens so all three look like one product.
 */
const MarketingSite = lazy(() => import("./marketing/MarketingSite"));
const StudioEntry = lazy(() => import("./studio/StudioEntry"));

// Apply the persisted theme before first paint (index.html also applies it
// with an inline bootstrap, so this is just a safety net for HMR).
initTheme();

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
