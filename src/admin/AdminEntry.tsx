import { useSession } from "../lib/session";
import EmailCentre from "./EmailCentre";
import SiteCornerMenu from "../shared/SiteCornerMenu";
// The Email Centre travels with the studio's styling: Tailwind's build, the
// generated theme colour matrix and the hand-written theme layer — the same
// trio the studio chunk imports, so the admin surface reads as the product.
import "../index.css";
import "../themes.generated.css";
import "../themes.css";

/**
 * The authenticated, admin-only door to /admin/*.
 *
 * The Email Centre is an owner surface, not a studio feature: it gets its
 * own URL and its own lazy chunk (started only on /admin paths), but it is
 * gated exactly like the studio — session first — and then again on the
 * administrator role, which the server enforces independently on every
 * /api/admin/email/* request. A non-admin never receives template bodies,
 * recipient addresses or campaign data, with or without this gate.
 */
export default function AdminEntry() {
  const { signedIn, checking, account } = useSession();

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-300 flex items-center justify-center" role="status" aria-live="polite">
        <p style={{ fontSize: 14 }}>Checking your session…</p>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <SiteCornerMenu />
        <main className="max-w-xl mx-auto px-6 py-24 text-center">
          <span className="text-[11px] uppercase tracking-[.18em] text-indigo-300 font-bold">Scenering administration</span>
          <h1 className="text-2xl font-bold mt-2">Sign in required</h1>
          <p className="text-sm text-gray-400 mt-3">The Email Centre is available to the owner administrator account. Sign in to continue.</p>
          <div className="mt-6 flex justify-center gap-3">
            <a href="/login" className="rounded-lg bg-white text-blue-950 px-4 py-2 text-xs font-extrabold hover:bg-blue-50">Sign in</a>
            <a href="/" className="rounded-lg border border-hairline px-4 py-2 text-xs font-bold hover:bg-gray-800">Back to the website</a>
          </div>
        </main>
      </div>
    );
  }

  if (account?.user.role !== "admin") {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <SiteCornerMenu />
        <main className="max-w-xl mx-auto px-6 py-24 text-center">
          <span className="text-[11px] uppercase tracking-[.18em] text-amber-300 font-bold">Access restricted</span>
          <h1 className="text-2xl font-bold mt-2">Owner administrator access required</h1>
          <p className="text-sm text-gray-400 mt-3">This area of Scenering is limited to the owner administrator. Your account does not carry that role.</p>
          <div className="mt-6 flex justify-center gap-3">
            <a href="/app" className="rounded-lg bg-white text-blue-950 px-4 py-2 text-xs font-extrabold hover:bg-blue-50">Open the Studio</a>
            <a href="/" className="rounded-lg border border-hairline px-4 py-2 text-xs font-bold hover:bg-gray-800">Back to the website</a>
          </div>
        </main>
      </div>
    );
  }

  return <EmailCentre />;
}
