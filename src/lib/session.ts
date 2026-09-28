import { useEffect, useState } from "react";

/**
 * The door in front of the studio.
 *
 * Be clear about what this is and is not. Scenering has no account server:
 * there is nothing to register with, no password to reset by email and no
 * identity to verify against. What this does is put a lock on the studio on
 * *this machine* — a name and a passphrase, kept in this browser, so the
 * editor is not simply there for anyone who opens the laptop.
 *
 * The passphrase is never stored. What is stored is a SHA-256 hash of it
 * with a random salt, which is enough to check a passphrase without keeping
 * it, and is the same thing a server would keep. That is honest security for
 * a local app and nothing more: anyone with access to this browser's storage
 * can clear it and start again, exactly like deleting the app's data.
 *
 * When real accounts arrive this module is the seam they replace — the rest
 * of the app only ever asks `isSignedIn()`.
 */

const PROFILE_KEY = "scenering_profile_v1";
const SESSION_KEY = "scenering_session_v1";
const CHANGE_EVENT = "scenering-session-changed";

export interface LocalProfile {
  /** What to call the person — shown in the studio, never sent anywhere. */
  name: string;
  /** Random per-profile salt, hex. */
  salt: string;
  /** SHA-256 of salt + passphrase, hex. */
  hash: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* storage                                                             */
/* ------------------------------------------------------------------ */

function readProfile(): LocalProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalProfile;
    if (!parsed?.name || !parsed?.salt || !parsed?.hash) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeProfile(profile: LocalProfile | null) {
  try {
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(PROFILE_KEY);
  } catch {
    /* storage disabled — the session simply will not persist */
  }
}

/** Is a local sign-in set up on this machine? */
export function hasProfile(): boolean {
  return readProfile() !== null;
}

/** The stored profile, without anything secret in it. */
export function getProfileName(): string | null {
  return readProfile()?.name ?? null;
}

/* ------------------------------------------------------------------ */
/* hashing                                                             */
/* ------------------------------------------------------------------ */

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return toHex(bytes.buffer);
}

/**
 * SHA-256 via the Web Crypto API. Browsers only expose `crypto.subtle` on a
 * secure origin, so over plain http on a LAN address there is a small
 * fallback — clearly weaker, and the sign-in screen says so rather than
 * pretending otherwise.
 */
async function hashPassphrase(salt: string, passphrase: string): Promise<string> {
  const material = `${salt}:${passphrase}`;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const data = new TextEncoder().encode(material);
    return toHex(await crypto.subtle.digest("SHA-256", data));
  }
  // Fallback: FNV-1a repeated. Not a cryptographic hash — see isStrongHashing().
  let hash = 2166136261;
  let out = "";
  for (let round = 0; round < 8; round++) {
    for (let i = 0; i < material.length; i++) {
      hash ^= material.charCodeAt(i) + round;
      hash = Math.imul(hash, 16777619);
    }
    out += (hash >>> 0).toString(16).padStart(8, "0");
  }
  return out;
}

/** True when the browser gives us real SHA-256 (a secure origin). */
export function isStrongHashing(): boolean {
  return typeof crypto !== "undefined" && !!crypto.subtle;
}

/* ------------------------------------------------------------------ */
/* the session                                                         */
/* ------------------------------------------------------------------ */

function announce() {
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* not in a browser */
  }
}

/** Signed in for this tab? Closing the tab ends the session by design. */
export function isSignedIn(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function openSession() {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
  announce();
}

/** Create the local sign-in the first time, and open the session. */
export async function createProfile(name: string, passphrase: string): Promise<void> {
  const salt = randomSalt();
  const hash = await hashPassphrase(salt, passphrase);
  writeProfile({ name: name.trim(), salt, hash, createdAt: new Date().toISOString() });
  openSession();
}

/** Check a passphrase against the stored profile. */
export async function signIn(passphrase: string): Promise<boolean> {
  const profile = readProfile();
  if (!profile) return false;
  const hash = await hashPassphrase(profile.salt, passphrase);
  if (hash !== profile.hash) return false;
  openSession();
  return true;
}

/** End the session. The profile and every project stay where they are. */
export function signOut() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  announce();
}

/**
 * Forget the local sign-in entirely — for someone who cannot remember the
 * passphrase. There is no recovery: nothing on this machine can decrypt it,
 * because nothing was encrypted with it. Projects are untouched, which the
 * screen says out loud before this runs.
 */
export function forgetProfile() {
  writeProfile(null);
  signOut();
}

/** Re-renders a component whenever the session or profile changes. */
export function useSession() {
  const [state, setState] = useState(() => ({
    signedIn: isSignedIn(),
    hasProfile: hasProfile(),
    name: getProfileName(),
  }));

  useEffect(() => {
    const sync = () =>
      setState({ signedIn: isSignedIn(), hasProfile: hasProfile(), name: getProfileName() });
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return state;
}
