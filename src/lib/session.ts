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
let current: AccountSession | null = null;
let checked = false;
let pending: Promise<AccountSession | null> | null = null;

function announce() { if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT)); }
async function jsonRequest(url: string, options?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json", ...(options?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || "Request failed"), { status: response.status, code: data.code });
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
export async function signIn(email: string, password: string) { current = await jsonRequest("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }); checked = true; announce(); return current; }
export async function resendVerification(email: string) { return jsonRequest("/api/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) }); }
export async function registerAccount(displayName: string, email: string, password: string, marketingConsent = false) { return jsonRequest("/api/auth/register", { method: "POST", body: JSON.stringify({ displayName, email, password, marketingConsent }) }); }
export async function signOut() { await jsonRequest("/api/auth/logout", { method: "POST", body: "{}" }).catch(() => null); current = null; checked = true; announce(); }

export function useSession() {
  const [state, setState] = useState(() => ({ signedIn: Boolean(current), checking: !checked, name: getProfileName(), account: current }));
  useEffect(() => {
    const sync = () => setState({ signedIn: Boolean(current), checking: !checked, name: getProfileName(), account: current });
    window.addEventListener(CHANGE_EVENT, sync); if (!checked) void refreshSession();
    return () => window.removeEventListener(CHANGE_EVENT, sync);
  }, []);
  return state;
}
