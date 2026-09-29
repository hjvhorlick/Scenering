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
  const { signedIn } = useSession();
  const [studio, setStudio] = useState<StudioComponent | null>(() => getPreloadedStudio());
  const LoadedStudio = studio ?? getPreloadedStudio();

  useEffect(() => {
    if (!signedIn || LoadedStudio) return;
    let active = true;
    preloadStudio()
      .then((component) => {
        if (active) setStudio(() => component);
      })
      .catch(() => {
        // preloadStudio resets its request after a failure, so returning to the
        // front page and trying again can make a fresh request.
      });
    return () => {
      active = false;
    };
  }, [signedIn, LoadedStudio]);

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
