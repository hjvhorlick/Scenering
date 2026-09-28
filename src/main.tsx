import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { initTheme } from "./lib/themes";
import { useRoute } from "./lib/route";

/**
 * Two front doors, one bundle.
 *
 *   /      the public website  (src/marketing)
 *   /app   the studio          (src/App)
 *
 * Both halves are lazy so neither pays for the other: a visitor reading the
 * website never downloads the renderer, and someone opening the studio never
 * downloads the marketing artwork.
 *
 * That includes CSS. The studio's stylesheets (Tailwind + the six themes,
 * ~300 kB) are imported by App.tsx, so they travel in the studio's chunk;
 * the website ships its own ~24 kB sheet and nothing else.
 */
const MarketingSite = lazy(() => import("./marketing/MarketingSite"));
const App = lazy(() => import("./App"));

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
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 13,
        color: "#94a3b8",
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
        <App />
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
