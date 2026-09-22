/**
 * Overlay Motion Engine
 * =====================
 * Shared, reusable motion for anything that sits on top of the video —
 * stickers today, call-to-action badges too, and any future overlay.
 *
 * Canvas 2D has no real 3D transform, so "3D" here is done the way motion
 * graphics have always faked it: a Y-axis spin is a horizontal squash driven by
 * cos(angle), an X-axis tumble is a vertical squash, and the lighting/specular
 * in sticker-3d.ts is re-evaluated against the same angle so highlights travel
 * across the surface as it turns. The result reads as a solid object rotating
 * in space rather than a flat picture being stretched.
 *
 * Every preset is time-based (not frame-based) so preview and export match.
 */

export type MotionPreset =
  | "none"
  | "spin_y"
  | "spin_x"
  | "tumble"
  | "rotate_flat"
  | "bounce"
  | "float"
  | "wobble"
  | "swing"
  | "pulse"
  | "heartbeat"
  | "orbit"
  | "jelly"
  | "shake"
  | "drift_in";

export interface MotionState {
  /** horizontal scale multiplier (Y-axis rotation foreshortening) */
  scaleX: number;
  /** vertical scale multiplier (X-axis rotation foreshortening) */
  scaleY: number;
  /** in-plane rotation, radians */
  rotate: number;
  /** offset in unscaled sticker units */
  offsetX: number;
  offsetY: number;
  /** overall scale on top of the user's size setting */
  scale: number;
  /** -1..1 — where the light should read from as the object turns.
   *  0 = facing us, ±1 = edge on. Drives the specular sweep in sticker-3d. */
  facing: number;
  /** true when the object has turned past 90° and we are seeing its back */
  backface: boolean;
  /** 0..1 extra shadow strength as the object rises off the video */
  lift: number;
}

export const NEUTRAL_MOTION: MotionState = {
  scaleX: 1,
  scaleY: 1,
  rotate: 0,
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  facing: 0,
  backface: false,
  lift: 0,
};

export interface MotionOptions {
  preset?: MotionPreset;
  /** 0.25 – 2.5, multiplies the cycle rate (default 1) */
  speed?: number;
  /** 0 – 2, multiplies the travel/angle of the motion (default 1) */
  amount?: number;
  /** entrance animation length in seconds (default 0.55) */
  entranceDuration?: number;
  /** play an entrance pop/settle at the start (default true) */
  entrance?: boolean;
}

export const MOTION_PRESETS: {
  id: MotionPreset;
  name: string;
  icon: string;
  blurb: string;
}[] = [
  { id: "none", name: "Static", icon: "⏸️", blurb: "No movement — just the entrance" },
  { id: "spin_y", name: "3D Spin", icon: "🔄", blurb: "Turns on its vertical axis like a coin" },
  { id: "spin_x", name: "Flip", icon: "🔃", blurb: "Tumbles forward over its horizontal axis" },
  { id: "tumble", name: "Tumble", icon: "🎲", blurb: "Slow roll on both axes at once" },
  { id: "rotate_flat", name: "Rotate", icon: "🌀", blurb: "Spins flat against the screen" },
  { id: "bounce", name: "Bounce", icon: "⛹️", blurb: "Drops and bounces with a squash on landing" },
  { id: "float", name: "Float", icon: "🎈", blurb: "Drifts gently up and down" },
  { id: "wobble", name: "Wobble", icon: "🫨", blurb: "Rocks side to side off its centre" },
  { id: "swing", name: "Swing", icon: "🔔", blurb: "Swings like a pendulum from the top" },
  { id: "pulse", name: "Pulse", icon: "💗", blurb: "Breathes larger and smaller" },
  { id: "heartbeat", name: "Heartbeat", icon: "❤️", blurb: "Double thump like a pulse" },
  { id: "orbit", name: "Orbit", icon: "🛸", blurb: "Traces a small circle in the air" },
  { id: "jelly", name: "Jelly", icon: "🍮", blurb: "Squashes and stretches like gelatin" },
  { id: "shake", name: "Shake", icon: "📳", blurb: "Fast attention-grabbing jitter" },
  { id: "drift_in", name: "Drift", icon: "🌬️", blurb: "Slow lazy drift with a slight lean" },
];

export const MOTION_PRESETS_BY_ID: Record<string, (typeof MOTION_PRESETS)[number]> =
  Object.fromEntries(MOTION_PRESETS.map((m) => [m.id, m]));

/** Overshooting ease — the classic "pop" that makes an entrance feel physical */
function easeOutBack(t: number, overshoot = 1.7): number {
  const c1 = overshoot;
  const c3 = c1 + 1;
  const p = t - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Decaying bounce, used for landings */
function bounceDecay(t: number, bounces = 3, decay = 4): number {
  return Math.abs(Math.cos(t * Math.PI * bounces)) * Math.exp(-t * decay);
}

/**
 * Computes the full motion state for an overlay at a moment in time.
 *
 * @param elapsed  seconds since the overlay appeared
 * @param lifetime total seconds the overlay is on screen
 */
export function computeMotion(
  elapsed: number,
  lifetime: number,
  opts: MotionOptions = {}
): MotionState {
  const preset = opts.preset ?? "none";
  const speed = Math.max(0.15, Math.min(3, opts.speed ?? 1));
  const amount = Math.max(0, Math.min(2.5, opts.amount ?? 1));
  const entranceDur = Math.max(0.15, opts.entranceDuration ?? 0.55);
  const wantEntrance = opts.entrance !== false;

  const s: MotionState = { ...NEUTRAL_MOTION };
  // A non-finite elapsed time (a zero-length insert divides by zero upstream)
  // would otherwise spread NaN through every offset and rotation, and a NaN in
  // a canvas transform silently blanks the element instead of erroring.
  const safeElapsed = Number.isFinite(elapsed) ? elapsed : 0;
  const safeLifetime = Number.isFinite(lifetime) ? lifetime : 0;
  const t = Math.max(0, safeElapsed) * speed;

  // ---------------- continuous motion ----------------
  switch (preset) {
    case "spin_y": {
      const angle = t * 1.9;
      s.facing = Math.sin(angle);
      const c = Math.cos(angle);
      // never fully collapse — a paper-thin sticker still has a little body
      s.scaleX = Math.max(0.12, Math.abs(c));
      s.backface = c < 0;
      s.lift = 0.15 * amount;
      break;
    }
    case "spin_x": {
      const angle = t * 1.7;
      const c = Math.cos(angle);
      s.scaleY = Math.max(0.12, Math.abs(c));
      s.backface = c < 0;
      s.facing = Math.sin(angle) * 0.6;
      s.lift = 0.15 * amount;
      break;
    }
    case "tumble": {
      const ay = t * 1.35;
      const ax = t * 0.85;
      const cy = Math.cos(ay);
      const cx = Math.cos(ax);
      s.scaleX = Math.max(0.15, Math.abs(cy));
      s.scaleY = Math.max(0.3, 0.7 + Math.abs(cx) * 0.3);
      s.rotate = Math.sin(t * 0.6) * 0.18 * amount;
      s.facing = Math.sin(ay);
      s.backface = cy < 0;
      s.lift = 0.2 * amount;
      break;
    }
    case "rotate_flat": {
      s.rotate = t * 1.1 * amount;
      s.facing = Math.sin(t * 1.1) * 0.5;
      break;
    }
    case "bounce": {
      // gravity arc: fast fall, soft squash at the bottom, slow rise
      const cycle = (t * 1.15) % 1;
      const height = Math.abs(Math.sin(cycle * Math.PI));
      s.offsetY = -height * 34 * amount;
      // squash exactly when it touches down
      const squash = Math.pow(1 - height, 6);
      s.scaleY = 1 - squash * 0.22 * amount;
      s.scaleX = 1 + squash * 0.18 * amount;
      s.lift = height * 0.55 * amount;
      s.facing = Math.sin(t * 1.15 * Math.PI * 2) * 0.25;
      break;
    }
    case "float": {
      s.offsetY = Math.sin(t * 1.25) * 12 * amount;
      s.offsetX = Math.sin(t * 0.72) * 5 * amount;
      s.rotate = Math.sin(t * 0.9) * 0.05 * amount;
      s.facing = Math.sin(t * 0.9) * 0.35;
      s.lift = 0.35 + Math.sin(t * 1.25) * 0.2;
      break;
    }
    case "wobble": {
      s.rotate = Math.sin(t * 3.1) * 0.19 * amount;
      s.offsetX = Math.sin(t * 3.1) * 7 * amount;
      s.facing = Math.sin(t * 3.1) * 0.5;
      break;
    }
    case "swing": {
      // pendulum pivots above the object, so rotation induces sideways travel
      const a = Math.sin(t * 2.3) * 0.3 * amount;
      s.rotate = a;
      s.offsetX = Math.sin(a) * 40;
      s.offsetY = (1 - Math.cos(a)) * 40;
      s.facing = Math.sin(t * 2.3) * 0.45;
      break;
    }
    case "pulse": {
      s.scale = 1 + Math.sin(t * 3.4) * 0.09 * amount;
      s.facing = Math.sin(t * 3.4) * 0.2;
      break;
    }
    case "heartbeat": {
      const c = (t * 1.25) % 1;
      const thump =
        Math.exp(-Math.pow((c - 0.0) * 9, 2)) * 1.0 +
        Math.exp(-Math.pow((c - 0.19) * 9, 2)) * 0.65;
      s.scale = 1 + thump * 0.17 * amount;
      s.lift = thump * 0.4;
      break;
    }
    case "orbit": {
      s.offsetX = Math.cos(t * 1.5) * 16 * amount;
      s.offsetY = Math.sin(t * 1.5) * 10 * amount;
      s.rotate = Math.sin(t * 1.5) * 0.1 * amount;
      s.facing = Math.cos(t * 1.5) * 0.5;
      s.lift = 0.3;
      break;
    }
    case "jelly": {
      const w = Math.sin(t * 4.2) * 0.13 * amount;
      s.scaleX = 1 + w;
      s.scaleY = 1 - w * 0.85;
      s.offsetY = -w * 10;
      break;
    }
    case "shake": {
      // two detuned sines so it never looks like a clean loop
      s.offsetX = (Math.sin(t * 22) + Math.sin(t * 13.7) * 0.6) * 3.4 * amount;
      s.offsetY = Math.sin(t * 18.3) * 1.8 * amount;
      s.rotate = Math.sin(t * 20) * 0.045 * amount;
      break;
    }
    case "drift_in": {
      s.offsetX = Math.sin(t * 0.55) * 18 * amount;
      s.offsetY = Math.cos(t * 0.42) * 9 * amount;
      s.rotate = Math.sin(t * 0.48) * 0.09 * amount;
      s.facing = Math.sin(t * 0.55) * 0.4;
      s.lift = 0.3;
      break;
    }
    case "none":
    default:
      break;
  }

  // ---------------- entrance ----------------
  if (wantEntrance && safeElapsed < entranceDur) {
    const e = Math.max(0, Math.min(1, safeElapsed / entranceDur));
    const pop = easeOutBack(e, 2.1);
    s.scale *= pop;
    // a touch of spin on the way in reads as the sticker being "thrown" on
    if (preset === "spin_y" || preset === "tumble" || preset === "rotate_flat") {
      s.rotate += (1 - easeOutCubic(e)) * 0.9;
    }
    if (preset === "bounce") {
      s.offsetY -= (1 - easeOutCubic(e)) * 120;
      s.offsetY += bounceDecay(e, 2, 5) * 8;
    }
    s.lift = Math.max(s.lift, 1 - e);
  }

  // ---------------- exit ----------------
  const remaining = safeLifetime - safeElapsed;
  if (safeLifetime > 0 && remaining < 0.35) {
    const e = Math.max(0, remaining / 0.35);
    s.scale *= 0.7 + easeOutCubic(e) * 0.3;
  }

  return s;
}

/**
 * Applies a motion state to a context that is already translated to the
 * overlay's centre and scaled by the user's size setting.
 */
export function applyMotion(ctx: CanvasRenderingContext2D, m: MotionState) {
  ctx.translate(m.offsetX, m.offsetY);
  if (m.rotate) ctx.rotate(m.rotate);
  ctx.scale(m.scale * m.scaleX, m.scale * m.scaleY);
}
