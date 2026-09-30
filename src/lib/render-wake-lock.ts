export type RenderWakeLockState = "active" | "released" | "unsupported" | "blocked";

interface WakeLockSentinelLike {
  released?: boolean;
  release(): Promise<void>;
  addEventListener?(type: "release", listener: () => void): void;
}

interface WakeLockLike {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

/**
 * Keeps the screen/device awake during a long local render. Browsers may
 * release a wake lock when a tab becomes hidden; this controller reacquires it
 * when the user returns and stops cleanly at render completion.
 */
export async function holdRenderWakeLock(
  onState: (state: RenderWakeLockState) => void,
): Promise<() => Promise<void>> {
  const wakeLock = typeof navigator !== "undefined"
    ? (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock
    : undefined;
  if (!wakeLock || typeof wakeLock.request !== "function") {
    onState("unsupported");
    return async () => {};
  }

  let sentinel: WakeLockSentinelLike | null = null;
  let stopped = false;

  const request = async () => {
    if (stopped || (typeof document !== "undefined" && document.hidden)) return;
    try {
      sentinel = await wakeLock.request("screen");
      onState("active");
      sentinel.addEventListener?.("release", () => {
        if (!stopped) onState("released");
      });
    } catch {
      onState("blocked");
    }
  };

  const onVisibility = () => {
    if (!document.hidden && !stopped && (!sentinel || sentinel.released)) void request();
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
  await request();

  return async () => {
    stopped = true;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
    try {
      await sentinel?.release();
    } catch {}
    sentinel = null;
    onState("released");
  };
}
