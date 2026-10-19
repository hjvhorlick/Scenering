import { useEffect, useState } from "react";
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
const SESSION_TOKEN_KEY = "scenering_session_token";
let current: AccountSession | null = null;
let checked = false;
let pending: Promise<AccountSession | null> | null = null;

function readStoredSessionToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(SESSION_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function writeStoredSessionToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(SESSION_TOKEN_KEY, token);
    else window.localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // Storage unavailable in private/restricted contexts.
  }
}

/* Embedded/sandbox previews (such as cross-origin HTTPS iframes) often block
   Set-Cookie even with SameSite adjustments. Mirroring the active session
   token into X-Scenering-Session on same-origin /api/* and /functions/v1/*
   requests ensures sign-in, account switching, and /admin navigation work
   reliably in every browser and preview environment. */
if (typeof window !== "undefined" && typeof window.fetch === "function" && !(window as any).__sceneringFetchPatched) {
  (window as any).__sceneringFetchPatched = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const token = readStoredSessionToken();
    if (token) {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const isSameOriginApi =
        urlStr.startsWith("/api/") ||
        urlStr.startsWith("/functions/v1/") ||
        urlStr.startsWith(`${window.location.origin}/api/`) ||
        urlStr.startsWith(`${window.location.origin}/functions/v1/`);
      if (isSameOriginApi) {
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        if (!headers.has("X-Scenering-Session")) {
          headers.set("X-Scenering-Session", token);
        }
        return nativeFetch(input, { ...init, headers });
      }
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

export async function refreshSession(): Promise<AccountSession | null> {
  if (pending) return pending;
  pending = jsonRequest("/api/auth/session").then((data) => { current = data; return current; }).catch(() => { current = null; return null; }).finally(() => { checked = true; pending = null; announce(); });
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
