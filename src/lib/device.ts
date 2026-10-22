/**
 * Who this browser is, for the account system.
 *
 * A membership is per person, but a plan's device benefit counts machines.
 * The server cannot see through the network to tell "the same laptop on a
 * different Wi-Fi" from "a second laptop", and IP addresses are shared by
 * whole offices and mobile networks, so the browser is asked for a stable,
 * random identifier it keeps for itself. It carries nothing personal: a
 * fresh UUID, generated once, stored in localStorage, sent as a header on
 * same-origin API calls.
 *
 * The label is derived from the user agent only so the account panel can say
 * "Chrome on Windows" instead of "device 4f2c…". A phone is not a special
 * case — it is one device like any other.
 */

const DEVICE_ID_KEY = "scenering_device_id";
const DEVICE_LABEL_KEY = "scenering_device_label";

export type DevicePlatform = "mobile" | "tablet" | "desktop";

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    // Fall through to the timestamp form below.
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function read(key: string): string {
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

/** Stable per-browser device id. Created on first use. */
export function deviceId(): string {
  if (typeof window === "undefined") return "";
  const existing = read(DEVICE_ID_KEY);
  if (existing && /^[A-Za-z0-9_-]{8,80}$/.test(existing)) return existing;
  const fresh = randomId();
  try {
    window.localStorage.setItem(DEVICE_ID_KEY, fresh);
  } catch {
    // Restricted storage: the id is still usable for this page's lifetime.
  }
  return fresh;
}

/** "mobile" | "tablet" | "desktop" — a phone counts as a device. */
export function devicePlatform(userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent): DevicePlatform {
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(ua)) return "tablet";
  if (/iphone|ipod|android|blackberry|iemobile|opera mini|mobile/.test(ua)) return "mobile";
  return "desktop";
}

/** "iPhone · Safari" — what the account panel shows for a signed-in device. */
export function deviceLabel(userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent): string {
  const ua = userAgent || "";
  const platform = devicePlatform(ua);
  const hardware = /iphone/i.test(ua) ? "iPhone"
    : /ipad/i.test(ua) ? "iPad"
    : /android/i.test(ua) ? (platform === "tablet" ? "Android tablet" : "Android phone")
    : /macintosh|mac os x/i.test(ua) ? "Mac"
    : /windows/i.test(ua) ? "Windows PC"
    : /cros/i.test(ua) ? "Chromebook"
    : /linux/i.test(ua) ? "Linux PC"
    : "This device";
  // Order matters: Edge and Opera both claim Chrome in their user agent.
  const browser = /edg\//i.test(ua) ? "Edge"
    : /opr\/|opera/i.test(ua) ? "Opera"
    : /firefox/i.test(ua) ? "Firefox"
    : /chrome|crios/i.test(ua) ? "Chrome"
    : /safari/i.test(ua) ? "Safari"
    : "browser";
  return `${hardware} · ${browser}`;
}

/** Remembered label for this browser, so a rename by the owner is not lost. */
export function rememberedDeviceLabel(): string {
  if (typeof window === "undefined") return "";
  return read(DEVICE_LABEL_KEY) || deviceLabel();
}

export function rememberDeviceLabel(label: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEVICE_LABEL_KEY, label.slice(0, 80));
  } catch {
    // ignore
  }
}

/** Headers the account API reads to bind a session to this device. */
export function deviceHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  return {
    "X-Scenering-Device": deviceId(),
    "X-Scenering-Device-Label": rememberedDeviceLabel(),
    "X-Scenering-Platform": devicePlatform(),
  };
}
