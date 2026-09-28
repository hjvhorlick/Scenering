import { Suspense, lazy } from "react";
import { useSession } from "../lib/session";
import SignIn from "./SignIn";
import "./sign-in.css";

/**
 * Everything behind /app.
 *
 * The door is loaded first and on its own: it is a few kilobytes of CSS and
 * one form, so it paints immediately. The studio itself — the editor, the
 * renderer, Tailwind and the six themes, about a megabyte of it — is only
 * fetched once somebody is actually signed in. Nobody downloads an editor
 * they cannot open.
 */
const Studio = lazy(() => import("../App"));

export default function StudioEntry() {
  const { signedIn } = useSession();

  if (!signedIn) return <SignIn />;

  return (
    <Suspense fallback={<StudioLoading />}>
      <Studio />
    </Suspense>
  );
}

function StudioLoading() {
  return (
    <div className="si-page">
      <span />
      <div className="si-center">
        <p style={{ color: "var(--pc-ink-4)", fontSize: 14 }}>Opening the studio…</p>
      </div>
      <span />
    </div>
  );
}
