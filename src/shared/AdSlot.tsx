import { useEffect, useRef } from "react";
import { ADSENSE_SCRIPT_ID, adsenseClientId, adsenseSlotId, type AdsenseSlotKind } from "./ads";

/**
 * One Google AdSense unit. Renders NOTHING — no box, no gap, no script —
 * unless the publisher id and this placement's slot are configured at build
 * time (see ./ads.ts). Callers decide audience and placement; this component
 * only knows how to load Google's script once and fill one unit.
 *
 * The script loads lazily with the first mounted slot, straight from Google
 * to the visitor's browser: ads never touch the Scenering Worker. The
 * AdSense verification snippet pasted into index.html already loads the same
 * library — it carries no element id, as Google writes it — so before
 * injecting anything this checks the document for ANY adsbygoogle loader,
 * by id or by src: one loader per page, always.
 */

function ensureAdsenseScript(clientId: string): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(ADSENSE_SCRIPT_ID)) return;
  // The pasted verification snippet has no id, so the id check alone would
  // append a second loader next to it. Recognise the library by src too.
  if (document.querySelector('script[src*="adsbygoogle.js?client="]')) return;
  const script = document.createElement("script");
  script.id = ADSENSE_SCRIPT_ID;
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
  document.head.appendChild(script);
}

export default function AdSlot({
  kind,
  className = "",
  style,
  testId,
}: {
  kind: AdsenseSlotKind;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
}) {
  // Outside Vite (SSR smoke tests, plain tsx) import.meta.env is undefined:
  // advertising must quietly stay off there, never throw.
  const env = (import.meta.env ?? {}) as unknown as Record<string, string | undefined>;
  const clientId = adsenseClientId(env);
  const slot = adsenseSlotId(env, kind);
  const pushed = useRef(false);

  useEffect(() => {
    if (!clientId || !slot || pushed.current) return;
    pushed.current = true;
    ensureAdsenseScript(clientId);
    try {
      const queue = ((window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle ||= []);
      queue.push({});
    } catch {
      // An ad blocker or a refused script must never break the page.
    }
  }, [clientId, slot]);

  if (!clientId || !slot) return null;

  return (
    <div className={className} style={style} data-testid={testId} aria-label="Advertisement">
      <span
        aria-hidden="true"
        style={{ display: "block", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.55, marginBottom: 4, textAlign: "center" }}
      >
        Advertisement
      </span>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={clientId}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
