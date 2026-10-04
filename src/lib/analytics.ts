export type AnalyticsEvent = "page_view" | "pricing_view" | "cta_click" | "registration_started" | "plan_selected";
export interface AnalyticsRecord { event: AnalyticsEvent; path: string; label?: string; occurredAt: string }
const KEY = "scenering_analytics_queue_v1";

/**
 * Privacy-first analytics foundation. Events remain in this browser unless an
 * administrator later configures a consent-aware analytics adapter. No device
 * fingerprint, advertising identifier or cross-site data is collected.
 */
export function track(event: AnalyticsEvent, label?: string) {
  try { const records = JSON.parse(localStorage.getItem(KEY) || "[]") as AnalyticsRecord[]; records.push({ event, path: location.pathname, label, occurredAt: new Date().toISOString() }); localStorage.setItem(KEY, JSON.stringify(records.slice(-200))); } catch {}
}
export function initAnalytics() {
  track(location.pathname === "/pricing" ? "pricing_view" : "page_view");
  document.addEventListener("click", (event) => { const link = (event.target as Element | null)?.closest?.("a,button"); if (!link) return; const text = link.textContent?.trim().slice(0, 80); if (/start|get started|choose|sign up/i.test(text || "")) track("cta_click", text); });
}
