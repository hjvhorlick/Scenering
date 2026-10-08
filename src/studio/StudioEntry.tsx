import { useEffect, useState } from "react";
import { useSession } from "../lib/session";
import SignIn from "./SignIn";
import { getPreloadedStudio, preloadStudio, type StudioComponent } from "./studio-loader";
import "./sign-in.css";

/**
 * The authenticated door to the studio.
 *
 * main.tsx starts the editor download beside the public front page. This
 * component still decides whether the editor may be mounted, but a successful
 * sign-in can synchronously take the already-prepared component instead of
 * beginning a megabyte-sized download at that moment.
 */
export default function StudioEntry() {
  const { signedIn, checking } = useSession();
  const [studio, setStudio] = useState<StudioComponent | null>(() => getPreloadedStudio());
  const LoadedStudio = studio ?? getPreloadedStudio();

  useEffect(() => {
    if (!signedIn || LoadedStudio) return;
    let active = true;
    let attempt = 0;
    const load = () => {
      preloadStudio()
        .then((component) => {
          if (active) setStudio(() => component);
          try { window.sessionStorage.removeItem("scenering_studio_reloaded"); } catch { /* ignore */ }
        })
        .catch(() => {
          // A dropped connection — or a chunk whose hashed filename changed
          // after a redeploy — used to fail ONCE and leave this door dead:
          // "Opening the studio…" forever, and the corner menu's account
          // buttons appearing to do nothing. Retry briefly, then reload once
          // to pick up fresh asset names (guarded so a truly offline client
          // does not reload in a loop).
          if (!active) return;
          attempt += 1;
          if (attempt < 3) { window.setTimeout(load, 700 * attempt); return; }
          try {
            if (!window.sessionStorage.getItem("scenering_studio_reloaded")) {
              window.sessionStorage.setItem("scenering_studio_reloaded", "1");
              window.location.reload();
            }
          } catch { /* storage unavailable — stay on the loading screen */ }
        });
    };
    load();
    return () => {
      active = false;
    };
  }, [signedIn, LoadedStudio]);

  if (checking) return <StudioLoading />;
  if (!signedIn) return <SignIn />;
  if (!LoadedStudio) return <StudioLoading />;

  return <LoadedStudio />;
}

function StudioLoading() {
  return (
    <div className="si-page">
      <span />
      <div className="si-center">
        <p style={{ color: "var(--pc-ink-4)", fontSize: 14 }}>Opening the studio — finishing preparation…</p>
      </div>
      <span />
    </div>
  );
}
