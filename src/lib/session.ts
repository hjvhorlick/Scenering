import { useEffect, useState } from "react";
import { deviceHeaders } from "./device";
import { adoptWorkspace, startWorkspaceSync, stopWorkspaceSync } from "./workspace-sync";
import type { PlanSlug } from "../config/plans";

export interface AccountSession {
  user: { id: string; email: string; displayName: string; emailVerified: boolean; role: "user" | "admin" };
  membership: { plan_id: "free" | "sceneflow" | "sceneforge"; status: string };
  plan: unknown;
  subscription?: unknown;
  usage?: unknown;
  remaining?: unknown;
}

const CHANGE_EVENT = "scenering-session-changed";
/**
 * This exists only for an explicitly enabled embedded development preview.
 * Customer-facing sessions are HttpOnly cookies; never retain their bearer
 * value in browser-readable persistent storage.
 */
const PREVIEW_SESSION_TOKEN_KEY = "scenering_embedded_preview_session_token";
const LEGACY_SESSION_TOKEN_KEY = "scenering_session_token";
let current: AccountSession | null = null;
let checked = false;
let pending: Promise<AccountSession | null> | null = null;

function readStoredSessionToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(PREVIEW_SESSION_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function writeStoredSessionToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) window.sessionStorage.setItem(PREVIEW_SESSION_TOKEN_KEY, token);
    else window.sessionStorage.removeItem(PREVIEW_SESSION_TOKEN_KEY);
  } catch {
    // Storage unavailable in private/restricted contexts.
  }
}

// Remove bearer tokens written by versions that mirrored every production
// session into localStorage. The server no longer accepts that header there.
if (typeof window !== "undefined") {
  try { window.localStorage.removeItem(LEGACY_SESSION_TOKEN_KEY); } catch { /* Storage can be disabled. */ }
}

/* Embedded/sandbox previews (such as cross-origin HTTPS iframes) can block
   Set-Cookie even with SameSite adjustments. The server only returns a bridge
   token when DEV_EMBEDDED_PREVIEW=1 on a non-production environment; then and
   only then this module mirrors it into X-Scenering-Session for same-origin
   API calls. */
if (typeof window !== "undefined" && typeof window.fetch === "function" && !(window as any).__sceneringFetchPatched) {
  (window as any).__sceneringFetchPatched = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const token = readStoredSessionToken();
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const isSameOriginApi =
      urlStr.startsWith("/api/") ||
      urlStr.startsWith("/functions/v1/") ||
      urlStr.startsWith(`${window.location.origin}/api/`) ||
      urlStr.startsWith(`${window.location.origin}/functions/v1/`);
    if (isSameOriginApi) {
      // The device headers go on every same-origin API call, signed in or
      // not: the sign-in request itself is what binds a session to a machine,
      // so that a plan's device limit can be counted server-side.
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      for (const [name, value] of Object.entries(deviceHeaders())) {
        if (value && !headers.has(name)) headers.set(name, value);
      }
      if (token && !headers.has("X-Scenering-Session")) {
        headers.set("X-Scenering-Session", token);
      }
      return nativeFetch(input, { ...init, headers });
    }
    return nativeFetch(input, init);
  };
}

function announce() { if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT)); }
async function jsonRequest(url: string, options?: RequestInit) {
  const token = readStoredSessionToken();
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Scenering-Session": token } : {}),
      ...(options?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error || "Request failed"), {
      status: response.status,
      code: data.code,
      developmentVerificationUrl: data.developmentVerificationUrl,
      developmentResetUrl: data.developmentResetUrl,
    });
  }
  return data;
}

/**
 * A signed-in studio keeps its workspace in step with the member's other
 * devices. Signing out stops the conversation — and switching to a different
 * account on the same computer starts a fresh one for that account rather
 * than carrying the previous member's projects across.
 */
function beginWorkspaceSync(account: AccountSession | null) {
  const userId = account?.user?.id;
  if (!userId) { stopWorkspaceSync(); return; }
  void adoptWorkspace(userId).then(() => startWorkspaceSync());
}

export async function refreshSession(): Promise<AccountSession | null> {
  if (pending) return pending;
  pending = jsonRequest("/api/auth/session").then((data) => {
    current = data;
    beginWorkspaceSync(current);
    return current;
  }).catch((err: any) => {
    // 401 is the normal answer for an anonymous visitor; any other failure
    // (a 503 schema check, a 500, or a network error) must be logged so a
    // broken database never looks like "signed out".
    if (err?.status !== 401) {
      console.error("[session] refreshSession failed:", err?.code ? `${err.code}: ${err.message}` : err?.message || err);
    }
    current = null;
    beginWorkspaceSync(null);
    return null;
  }).finally(() => { checked = true; pending = null; announce(); });
  return pending;
}
export function isSignedIn() { return Boolean(current); }
export function getProfileName() { return current?.user.displayName || null; }
export function getSession() { return current; }

const ADMIN_PLAN_PREVIEW_KEY = "scenering_admin_plan_preview";
export function getInterfacePlan(account: AccountSession | null = current): PlanSlug {
  const authoritative = account?.membership?.plan_id || "free";
  if (account?.user.role !== "admin" || typeof window === "undefined") return authoritative;
  const preview = window.sessionStorage.getItem(ADMIN_PLAN_PREVIEW_KEY);
  return preview === "free" || preview === "sceneflow" || preview === "sceneforge" ? preview : authoritative;
}
export function setAdminPlanPreview(plan: PlanSlug | null) {
  if (current?.user.role !== "admin" || typeof window === "undefined") return;
  if (plan) window.sessionStorage.setItem(ADMIN_PLAN_PREVIEW_KEY, plan);
  else window.sessionStorage.removeItem(ADMIN_PLAN_PREVIEW_KEY);
  announce();
}
export async function signIn(email: string, password: string) {
  const data = await jsonRequest("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  if (typeof data?.sessionToken === "string" && data.sessionToken) {
    writeStoredSessionToken(data.sessionToken);
  }
  current = data;
  checked = true;
  beginWorkspaceSync(current);
  announce();
  return current;
}
export async function resendVerification(email: string) { return jsonRequest("/api/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) }); }
export async function registerAccount(displayName: string, email: string, password: string, marketingConsent = false) { return jsonRequest("/api/auth/register", { method: "POST", body: JSON.stringify({ displayName, email, password, marketingConsent }) }); }
export async function signOut() {
  await jsonRequest("/api/auth/logout", { method: "POST", body: "{}" }).catch(() => null);
  writeStoredSessionToken("signed-out");
  current = null;
  checked = true;
  stopWorkspaceSync();
  announce();
}

export function useSession() {
  const [state, setState] = useState(() => ({ signedIn: Boolean(current), checking: !checked, name: getProfileName(), account: current }));
  useEffect(() => {
    const sync = () => setState({ signedIn: Boolean(current), checking: !checked, name: getProfileName(), account: current });
    window.addEventListener(CHANGE_EVENT, sync); if (!checked) void refreshSession();
    return () => window.removeEventListener(CHANGE_EVENT, sync);
  }, []);
  return state;
}
