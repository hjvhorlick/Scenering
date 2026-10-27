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
 *   /admin the owner-only Email Centre (src/admin)
 *
 * The surfaces remain separate chunks, but their requests start together.
 * While somebody reads the landing page or types a passphrase, the browser is
 * already downloading and parsing the sign-in door, the editor, the renderer
 * and the studio CSS. Authentication still controls whether the studio is
 * mounted; it no longer controls when the application starts loading.
 */
const MarketingSite = lazy(() => import("./marketing/MarketingSite"));
const StudioEntry = lazy(() => import("./studio/StudioEntry"));
const AdminEntry = lazy(() => import("./admin/AdminEntry"));

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
  /* The canonical URL is NOT set here. Each page's HTML already carries its
     own, written at build time (src/marketing/seo-head.ts), and applyPageSeo
     keeps it when the visitor moves between pages. Building it from
     window.location named www.scenering.com or the workers.dev address as
     the real page whenever a visitor arrived through one of them. */
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

  if (route === "admin") {
    return (
      <Suspense fallback={<Loading label="Opening the Email Centre…" />}>
        <AdminEntry />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<Loading label="Loading…" />}>
      <MarketingSite />
    </Suspense>
  );
}

/**
 * Last line of defence: a page that throws must never be a white screen.
 *
 * Every standalone page is its own HTML document naming a hashed bundle. When
 * a deployment replaces that bundle while a browser still holds an older
 * document, the script 404s and React unmounts the tree, which is what "the
 * page is not opening" looks like to a visitor — an empty page with nothing to
 * read. This catches that (and any render error) and offers the one action
 * that fixes it, instead of silence.
 */
class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean; reason: string }> {
  state = { failed: false, reason: "" };

  static getDerivedStateFromError(error: unknown) {
    return { failed: true, reason: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown) {
    console.error("[app] a page failed to render:", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          minHeight: "60vh",
          display: "grid",
          placeContent: "center",
          gap: 12,
          padding: "32px 20px",
          textAlign: "center",
          fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
          color: "#31343c",
        }}
      >
        <h1 style={{ fontSize: 20, margin: 0 }}>This page could not load.</h1>
        <p style={{ fontSize: 14, margin: 0, color: "#5b6270", maxWidth: "46ch" }}>
          A file it needs has changed since this tab was opened. Reloading fetches the current one.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ justifySelf: "center", padding: "10px 18px", borderRadius: 8, border: "1px solid #c9ced8", background: "#fff", fontSize: 14, cursor: "pointer" }}
        >
          Reload the page
        </button>
        <small style={{ fontSize: 12, color: "#8a919e" }}>{this.state.reason}</small>
      </div>
    );
  }
}

// Vite tells us when a lazily imported chunk no longer exists — the same
// stale-document case, one layer deeper. One reload picks up the new one;
// asking twice would loop, so it only fires once per document.
if (typeof window !== "undefined") {
  const key = "scenering:chunk-reload";
  window.addEventListener("vite:preloadError", () => {
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // storage blocked — reload once anyway
    }
    window.location.reload();
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <Root />
    </AppErrorBoundary>
  </React.StrictMode>
);
