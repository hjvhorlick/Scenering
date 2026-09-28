/**
 * Measures the real ink bounds of every icon symbol.
 *
 * An SVG <symbol> clips whatever falls outside its viewBox, so a shape that
 * runs past 32 units is silently cut off at the edge — which is how several
 * icons ended up with a flat side. There is no SVG rasteriser in this
 * environment, so rather than eyeball it, this parses the path data, samples
 * the curves and arcs, applies any element transform, and adds the stroke
 * overhang. tests/icons.test.ts imports it and fails the build if anything
 * stops fitting.
 */

/** Tokenises a path `d` into commands and numbers. */
const TOK = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;

function tokenize(d) {
  const out = [];
  for (const m of d.matchAll(TOK)) out.push(m[1] ?? Number(m[2]));
  return out;
}

function bezier(pts, t) {
  const n = pts.length - 1;
  let x = 0;
  let y = 0;
  for (let i = 0; i <= n; i++) {
    let c = 1;
    for (let k = 0; k < i; k++) c = (c * (n - k)) / (k + 1);
    const b = c * (1 - t) ** (n - i) * t ** i;
    x += b * pts[i][0];
    y += b * pts[i][1];
  }
  return [x, y];
}

/** Endpoint -> centre parameterisation, per the SVG spec's implementation notes. */
function arcPoints(x1, y1, rx, ry, rot, laf, sf, x2, y2) {
  const pts = [];
  if (!rx || !ry || (x1 === x2 && y1 === y2)) return [[x2, y2]];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (rot * Math.PI) / 180;
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = Math.cos(phi) * dx + Math.sin(phi) * dy;
  const y1p = -Math.sin(phi) * dx + Math.cos(phi) * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) {
    const k = Math.sqrt(lam);
    rx *= k;
    ry *= k;
  }
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const num = rx * rx * ry * ry - den;
  let co = den ? Math.sqrt(Math.max(0, num / den)) : 0;
  if (laf === sf) co = -co;
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const cx = Math.cos(phi) * cxp - Math.sin(phi) * cyp + (x1 + x2) / 2;
  const cy = Math.sin(phi) * cxp + Math.cos(phi) * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => {
    const d = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
    const a = Math.acos(Math.max(-1, Math.min(1, d)));
    return ux * vy - uy * vx < 0 ? -a : a;
  };
  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const th1 = ang(1, 0, ux, uy);
  let dth = ang(ux, uy, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sf && dth > 0) dth -= 2 * Math.PI;
  else if (sf && dth < 0) dth += 2 * Math.PI;
  for (let k = 1; k <= 24; k++) {
    const th = th1 + (dth * k) / 24;
    pts.push([
      Math.cos(phi) * rx * Math.cos(th) - Math.sin(phi) * ry * Math.sin(th) + cx,
      Math.sin(phi) * rx * Math.cos(th) + Math.cos(phi) * ry * Math.sin(th) + cy,
    ]);
  }
  return pts;
}

export function pathPoints(d) {
  const t = tokenize(d);
  const pts = [];
  let i = 0;
  let cmd = null;
  let cur = [0, 0];
  let start = [0, 0];
  let prevC = null;
  let prevQ = null;
  while (i < t.length) {
    if (typeof t[i] === "string") {
      cmd = t[i];
      i++;
      if (cmd.toUpperCase() === "Z") {
        cur = start.slice();
        pts.push(cur.slice());
        prevC = prevQ = null;
      }
      continue;
    }
    if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const rp = (x, y) => (rel ? [cur[0] + x, cur[1] + y] : [x, y]);
    if (C === "M") {
      cur = rp(t[i], t[i + 1]);
      i += 2;
      start = cur.slice();
      pts.push(cur.slice());
      cmd = rel ? "l" : "L";
      prevC = prevQ = null;
    } else if (C === "L") {
      cur = rp(t[i], t[i + 1]);
      i += 2;
      pts.push(cur.slice());
      prevC = prevQ = null;
    } else if (C === "H") {
      cur = [rel ? cur[0] + t[i] : t[i], cur[1]];
      i += 1;
      pts.push(cur.slice());
      prevC = prevQ = null;
    } else if (C === "V") {
      cur = [cur[0], rel ? cur[1] + t[i] : t[i]];
      i += 1;
      pts.push(cur.slice());
      prevC = prevQ = null;
    } else if (C === "C" || C === "S") {
      let c1;
      let c2;
      let end;
      if (C === "C") {
        c1 = rp(t[i], t[i + 1]);
        c2 = rp(t[i + 2], t[i + 3]);
        end = rp(t[i + 4], t[i + 5]);
        i += 6;
      } else {
        c1 = prevC ? [2 * cur[0] - prevC[0], 2 * cur[1] - prevC[1]] : cur.slice();
        c2 = rp(t[i], t[i + 1]);
        end = rp(t[i + 2], t[i + 3]);
        i += 4;
      }
      for (let k = 1; k <= 16; k++) pts.push(bezier([cur, c1, c2, end], k / 16));
      prevC = c2;
      prevQ = null;
      cur = end;
    } else if (C === "Q" || C === "T") {
      let c1;
      let end;
      if (C === "Q") {
        c1 = rp(t[i], t[i + 1]);
        end = rp(t[i + 2], t[i + 3]);
        i += 4;
      } else {
        c1 = prevQ ? [2 * cur[0] - prevQ[0], 2 * cur[1] - prevQ[1]] : cur.slice();
        end = rp(t[i], t[i + 1]);
        i += 2;
      }
      for (let k = 1; k <= 16; k++) pts.push(bezier([cur, c1, end], k / 16));
      prevQ = c1;
      prevC = null;
      cur = end;
    } else if (C === "A") {
      const [rx, ry, rot, laf, sf] = t.slice(i, i + 5);
      const end = rp(t[i + 5], t[i + 6]);
      i += 7;
      for (const p of arcPoints(cur[0], cur[1], rx, ry, rot, laf, sf, end[0], end[1])) pts.push(p);
      cur = end;
      prevC = prevQ = null;
    } else {
      i++;
    }
  }
  return pts;
}

/** Applies an SVG `transform` string (translate/scale/rotate/matrix) to a point. */
/** The uniform scale a transform string applies, so stroke width can follow it. */
export function transformScale(transform) {
  if (!transform) return 1;
  let s = 1;
  for (const op of transform.matchAll(/scale\s*\(([^)]*)\)/g)) {
    const n = op[1].split(/[\s,]+/).filter(Boolean).map(Number);
    s *= Math.abs(n[0] ?? 1);
  }
  return s;
}

export function applyTransform(transform, pts) {
  if (!transform) return pts;
  const ops = [...transform.matchAll(/(translate|scale|rotate|matrix)\s*\(([^)]*)\)/g)];
  let out = pts;
  for (const op of ops.reverse()) {
    const n = op[2].split(/[\s,]+/).filter(Boolean).map(Number);
    const kind = op[1];
    out = out.map(([x, y]) => {
      if (kind === "translate") return [x + (n[0] || 0), y + (n[1] || 0)];
      if (kind === "scale") return [x * (n[0] ?? 1), y * (n[1] ?? n[0] ?? 1)];
      if (kind === "rotate") {
        const a = ((n[0] || 0) * Math.PI) / 180;
        const cx = n[1] || 0;
        const cy = n[2] || 0;
        const dx = x - cx;
        const dy = y - cy;
        return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
      }
      return [n[0] * x + n[2] * y + n[4], n[1] * x + n[3] * y + n[5]];
    });
  }
  return out;
}

const STROKE_PRESET = { GOLDLINE: 4, BLUE: 1.3, GOLD: 1.3, STEEL: 1.3 };

/**
 * Ranges covered by a `<g transform>` wrapper, so a child's points can be
 * taken through its group transform as well as its own. Several symbols are
 * wrapped in one to pull them back inside the frame.
 */
function groupRanges(body) {
  const groups = [];
  for (const g of body.matchAll(/<g transform="([^"]*)">([\s\S]*?)<\/g>/g)) {
    groups.push({ transform: g[1], from: g.index + g[0].indexOf(">") + 1, to: g.index + g[0].length });
  }
  return groups;
}

/** Ink bounds per symbol, from the sprite's TSX source. */
export function measureSprite(source) {
  const out = [];
  for (const m of source.matchAll(/<symbol id="ico-([a-z-]+)"[^>]*>([\s\S]*?)<\/symbol>/g)) {
    const [, name, body] = m;
    const groups = groupRanges(body);
    const parts = [];
    for (const e of body.matchAll(/<(path|circle|rect|ellipse|line|polygon|polyline|Sheen)\b([\s\S]*?)\/>/g)) {
      const tag = e[1];
      const attrs = e[2];
      const at = e.index;
      const str = (k) => (attrs.match(new RegExp(`${k}="([^"]*)"`)) || [])[1];
      const num = (k, d = 0) => {
        const v = (attrs.match(new RegExp(`${k}=\\{?"?(-?\\d*\\.?\\d+)`)) || [])[1];
        return v === undefined ? d : Number(v);
      };
      let sw = 0;
      for (const [key, val] of Object.entries(STROKE_PRESET)) if (attrs.includes(`...${key}`)) sw = val;
      const explicit = attrs.match(/strokeWidth=\{?"?(-?\d*\.?\d+)/);
      if (explicit) sw = Number(explicit[1]);
      if (attrs.includes('fill="none"') && !sw) sw = 1.3;
      let pts = [];
      if (tag === "path" || tag === "Sheen") pts = pathPoints(str("d") || "");
      else if (tag === "circle") {
        const r = num("r");
        pts = [
          [num("cx") - r, num("cy") - r],
          [num("cx") + r, num("cy") + r],
        ];
      } else if (tag === "ellipse")
        pts = [
          [num("cx") - num("rx"), num("cy") - num("ry")],
          [num("cx") + num("rx"), num("cy") + num("ry")],
        ];
      else if (tag === "rect")
        pts = [
          [num("x"), num("y")],
          [num("x") + num("width"), num("y") + num("height")],
        ];
      else if (tag === "line")
        pts = [
          [num("x1"), num("y1")],
          [num("x2"), num("y2")],
        ];
      else {
        const n = (str("points") || "").split(/[\s,]+/).filter(Boolean).map(Number);
        for (let k = 0; k + 1 < n.length; k += 2) pts.push([n[k], n[k + 1]]);
      }
      if (!pts.length) continue;
      sw *= transformScale(str("transform"));
      pts = applyTransform(str("transform"), pts);
      for (const g of groups) {
        if (at > g.from && at < g.to) {
          sw *= transformScale(g.transform);
          pts = applyTransform(g.transform, pts);
        }
      }
      // Stroke straddles the edge, so half of it sits outside the path itself.
      const o = sw / 2;
      parts.push({
        tag,
        x0: Math.min(...pts.map((p) => p[0])) - o,
        y0: Math.min(...pts.map((p) => p[1])) - o,
        x1: Math.max(...pts.map((p) => p[0])) + o,
        y1: Math.max(...pts.map((p) => p[1])) + o,
      });
    }
    if (!parts.length) {
      out.push({ name, empty: true });
      continue;
    }
    out.push({
      name,
      parts,
      x0: Math.min(...parts.map((p) => p.x0)),
      y0: Math.min(...parts.map((p) => p.y0)),
      x1: Math.max(...parts.map((p) => p.x1)),
      y1: Math.max(...parts.map((p) => p.y1)),
    });
  }
  return out;
}
