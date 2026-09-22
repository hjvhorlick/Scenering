/**
 * Minimal assertion harness shared by the suites in this folder.
 *
 * These tests were previously written to /tmp and were lost twice when the
 * sandbox reset, taking thousands of checks with them. They now live in the
 * repository and run with `npm test`.
 *
 * There is no test runner dependency on purpose: the suites are plain scripts
 * run with tsx, so they work anywhere the app builds and add nothing to the
 * install.
 */

export interface Harness {
  ok(condition: boolean, message: string): void;
  eq(actual: unknown, expected: unknown, message: string): void;
  /** Assert a number is finite (catches NaN leaking into canvas maths). */
  finite(value: number, message: string): void;
  /** Assert `actual` is within `tolerance` of `expected`. */
  near(actual: number, expected: number, tolerance: number, message: string): void;
  done(label: string): void;
}

export function createHarness(): Harness {
  let pass = 0;
  let fail = 0;
  const failures: string[] = [];

  const ok = (condition: boolean, message: string) => {
    if (condition) {
      pass++;
    } else {
      fail++;
      // Only print the first 25 so a broad breakage stays readable.
      if (failures.length < 25) {
        failures.push(message);
        console.log("  FAIL:", message);
      }
    }
  };

  return {
    ok,
    eq: (actual, expected, message) =>
      ok(
        Object.is(actual, expected),
        `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`
      ),
    finite: (value, message) => ok(Number.isFinite(value), `${message} (got ${value})`),
    near: (actual, expected, tolerance, message) =>
      ok(
        Math.abs(actual - expected) <= tolerance,
        `${message} (expected ${expected} ±${tolerance}, got ${actual})`
      ),
    done: (label: string) => {
      if (fail > 0 && failures.length >= 25) {
        console.log(`  ...and ${fail - failures.length} more failures`);
      }
      console.log(`${fail === 0 ? "PASS" : "FAIL"} ${label}: ${pass} checks, ${fail} failed`);
      if (fail > 0) process.exitCode = 1;
    },
  };
}

/**
 * A Proxy-based stub 2D context that records the operations performed and
 * throws if any numeric argument is non-finite. Canvas is not installed in
 * this environment, so render code is exercised for correctness of its maths
 * rather than its pixels.
 */
export function createStubContext(width = 1920, height = 1080) {
  const ops: string[] = [];

  const gradient = {
    addColorStop: () => {},
  };

  const target: Record<string, unknown> = {
    canvas: { width, height },
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    filter: "none",
    font: "16px sans-serif",
    textAlign: "left",
    textBaseline: "alphabetic",
    shadowBlur: 0,
    shadowColor: "transparent",
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    lineCap: "butt",
    lineJoin: "miter",
    measureText: (text: string) => ({
      width: String(text).length * 8,
      actualBoundingBoxAscent: 12,
      actualBoundingBoxDescent: 4,
    }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    putImageData: () => {},
    createImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
  };

  const ctx = new Proxy(target, {
    get(obj, prop: string) {
      if (prop in obj) return obj[prop];
      // Any other property is treated as a drawing method.
      return (...args: unknown[]) => {
        for (const arg of args) {
          if (typeof arg === "number" && !Number.isFinite(arg)) {
            throw new Error(`ctx.${prop}() received a non-finite argument: ${args.join(", ")}`);
          }
        }
        ops.push(prop);
        return undefined;
      };
    },
    set(obj, prop: string, value) {
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw new Error(`ctx.${prop} was set to a non-finite value: ${value}`);
      }
      obj[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;

  return { ctx, ops };
}

/** A stand-in image with the shape of a real photo. */
export function stubImage(naturalWidth = 1600, naturalHeight = 900) {
  return { naturalWidth, naturalHeight, complete: true, width: naturalWidth, height: naturalHeight };
}
