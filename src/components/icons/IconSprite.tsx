/**
 * The icon sprite.
 *
 * One hidden <svg> mounted once per surface, holding every icon as a
 * <symbol> plus the gradients they share. Icons are then a ~60-byte <use>
 * rather than repeated path data, which matters on a screen like the Studio
 * that shows forty at once.
 *
 * HOUSE STYLE
 * -----------
 * Taken from the Scenering key art: a blue body, a gold accent carrying the
 * meaning, a white specular highlight, and a dark blue outline so the shape
 * survives on a light porcelain panel. Shadows are applied in CSS.
 *
 * THE SILHOUETTE IS THE ICON
 * --------------------------
 * An earlier version sat every verb on a blue disc. At 22px that reads as a
 * blue dot — a dropdown caret stopped looking like an arrow at all. So there
 * is no backing plate here. Each icon is its own bold shape filling the
 * frame, because the outline is what a reader recognises before they see any
 * colour or detail.
 *
 * Drawn on a 32x32 grid. Shapes run corner to corner of a 28x28 live area and
 * no limb is thinner than about 3 units, so nothing thins out at small sizes.
 */

const BLUE = { fill: "url(#icoBlue)", stroke: "#0e3374", strokeWidth: 1.3, strokeLinejoin: "round" as const };
const GOLD = { fill: "url(#icoGold)", stroke: "#8a5609", strokeWidth: 1.3, strokeLinejoin: "round" as const };
const STEEL = { fill: "url(#icoSteel)", stroke: "#0e3374", strokeWidth: 1.3, strokeLinejoin: "round" as const };
/** Gold strokes for things drawn as lines rather than filled shapes. */
const GOLDLINE = {
  fill: "none",
  stroke: "url(#icoGold)",
  strokeWidth: 4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** A white sheen across the upper third, which is what reads as "raised". */
const Sheen = ({ d, o = 0.38 }: { d: string; o?: number }) => <path d={d} fill="#fff" opacity={o} />;

export default function IconSprite() {
  return (
    <svg aria-hidden="true" focusable="false" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
      <defs>
        <linearGradient id="icoBlue" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7fbaff" />
          <stop offset="0.45" stopColor="#2f6fe4" />
          <stop offset="1" stopColor="#12409f" />
        </linearGradient>
        <linearGradient id="icoGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffeaa7" />
          <stop offset="0.45" stopColor="#ffc43c" />
          <stop offset="1" stopColor="#e08c0c" />
        </linearGradient>
        <linearGradient id="icoSteel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#dce7f7" />
          <stop offset="1" stopColor="#9db3d4" />
        </linearGradient>
      </defs>

      {/* ------------------------------------------------------- transport */}

      <symbol id="ico-play" viewBox="0 0 32 32">
        <path d="M7 3.8 28 16 7 28.2Z" {...GOLD} />
        <Sheen d="M7 3.8 28 16l-4 2.3L7 8.4Z" />
      </symbol>

      <symbol id="ico-stop" viewBox="0 0 32 32">
        <rect x="4.4" y="4.4" width="23.2" height="23.2" rx="4.4" {...GOLD} />
        <Sheen d="M8.8 4.4h14.4a4.4 4.4 0 0 1 4.4 4.4v3.4H4.4V8.8a4.4 4.4 0 0 1 4.4-4.4Z" o={0.32} />
      </symbol>

      <symbol id="ico-pause" viewBox="0 0 32 32">
        <rect x="5" y="4" width="8.6" height="24" rx="3" {...GOLD} />
        <rect x="18.4" y="4" width="8.6" height="24" rx="3" {...GOLD} />
        <Sheen d="M8 4h2.6a3 3 0 0 1 3 3v3H5V7a3 3 0 0 1 3-3Zm13.4 0H24a3 3 0 0 1 3 3v3h-8.6V7a3 3 0 0 1 3-3Z" o={0.3} />
      </symbol>

      <symbol id="ico-record" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="12.4" {...GOLD} />
        <Sheen d="M16 3.6a12.4 12.4 0 0 1 11 6.7c-2.4-3-6.4-4.9-11-4.9S7.4 7.3 5 10.3A12.4 12.4 0 0 1 16 3.6Z" />
      </symbol>

      <symbol id="ico-replay" viewBox="0 0 32 32">
        <path d="M28 16A12 12 0 1 1 22.6 6" {...GOLDLINE} strokeWidth="5" />
        <path d="M24.6 2.2v9.6h-9.6Z" {...GOLD} />
      </symbol>

      <symbol id="ico-loop" viewBox="0 0 32 32">
        <path d="M8 11.4h13.4a5.2 5.2 0 0 1 0 10.4H9.4" {...GOLDLINE} strokeWidth="4.6" />
        <path d="M12.6 4.6 5.2 11.4l7.4 6.8Z" {...GOLD} />
      </symbol>

      {/* --------------------------------------------------------- answers */}

      <symbol id="ico-check" viewBox="0 0 32 32">
        <path d="m4.4 16.6 8 8L27.6 7.6" {...GOLDLINE} strokeWidth="6.4" />
      </symbol>

      <symbol id="ico-close" viewBox="0 0 32 32">
        <path d="m5.6 5.6 20.8 20.8m0-20.8L5.6 26.4" {...GOLDLINE} strokeWidth="6.2" />
      </symbol>

      <symbol id="ico-plus" viewBox="0 0 32 32">
        <path d="M16 4.2v23.6M4.2 16h23.6" {...GOLDLINE} strokeWidth="6.4" />
      </symbol>

      <symbol id="ico-minus" viewBox="0 0 32 32">
        <path d="M4.2 16h23.6" {...GOLDLINE} strokeWidth="6.4" />
      </symbol>

      <symbol id="ico-ban" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="12" fill="none" stroke="url(#icoGold)" strokeWidth="5" />
        <path d="m7.5 7.5 17 17" stroke="url(#icoGold)" strokeWidth="5" strokeLinecap="round" />
      </symbol>

      <symbol id="ico-warning" viewBox="0 0 32 32">
        <path d="M16 2.6 30.6 28.4H1.4Z" {...GOLD} />
        <Sheen d="M16 6 27 25.6h-4.6L16 13.4Z" o={0.3} />
        <path d="M16 11.6v7.6" stroke="#6b3d05" strokeWidth="3.4" strokeLinecap="round" />
        <circle cx="16" cy="23.4" r="2" fill="#6b3d05" />
      </symbol>

      {/* ---------------------------------------------------------- arrows */}
      {/* Chunky solid arrows and big triangles. A dropdown indicator has to
          read as an arrow at 22px with no colour and no detail. */}

      <symbol id="ico-up" viewBox="0 0 32 32">
        <path d="M16 2.4 29 16h-7.4v13.6h-11.2V16H3Z" {...GOLD} />
        <Sheen d="M16 2.4 29 16h-4L16 7Z" o={0.34} />
      </symbol>

      <symbol id="ico-down" viewBox="0 0 32 32">
        <path d="M16 29.6 3 16h7.4V2.4h11.2V16H29Z" {...GOLD} />
        <Sheen d="M10.4 2.4h11.2v4H10.4Z" o={0.32} />
      </symbol>

      <symbol id="ico-left" viewBox="0 0 32 32">
        <path d="M2.4 16 16 3v7.4h13.6v11.2H16V29Z" {...GOLD} />
        <Sheen d="M2.4 16 16 3v4L7 16Z" o={0.34} />
      </symbol>

      <symbol id="ico-right" viewBox="0 0 32 32">
        <path d="M29.6 16 16 29v-7.4H2.4V10.4H16V3Z" {...GOLD} />
        <Sheen d="M16 3v7.4H2.4v-4H12Z" o={0.3} />
      </symbol>

      <symbol id="ico-caret-up" viewBox="0 0 32 32">
        <path d="M16 6.6 29.4 24.6H2.6Z" {...GOLD} />
        <Sheen d="M16 6.6 24 17.4H8Z" o={0.3} />
      </symbol>

      <symbol id="ico-caret-down" viewBox="0 0 32 32">
        <path d="M16 25.4 2.6 7.4h26.8Z" {...GOLD} />
        <Sheen d="M2.6 7.4h26.8l-3 4H5.6Z" o={0.32} />
      </symbol>

      <symbol id="ico-pan-h" viewBox="0 0 32 32">
        <path d="M1.6 16 10 7.6v5H22v-5L30.4 16 22 24.4v-5H10v5Z" {...GOLD} />
        <Sheen d="M10 7.6v5h12v-5l3.4 3.4H6.6Z" o={0.26} />
      </symbol>

      <symbol id="ico-pan-v" viewBox="0 0 32 32">
        <path d="M16 1.6 24.4 10h-5v12h5L16 30.4 7.6 22h5V10h-5Z" {...GOLD} />
        <Sheen d="M16 1.6 24.4 10h-5v2h-7v-2h-5Z" o={0.26} />
      </symbol>

      {/* ------------------------------------------------------- the craft */}

      <symbol id="ico-gear" viewBox="0 0 32 32">
        <path
          d="M13.4 1.4h5.2l.7 3.6 2.9 1.2 3-2 3.6 3.6-2 3 1.2 2.9 3.6.7v5.2l-3.6.7-1.2 2.9 2 3-3.6 3.6-3-2-2.9 1.2-.7 3.6h-5.2l-.7-3.6-2.9-1.2-3 2L2.8 25.6l2-3-1.2-2.9L0 19v-5.2l3.6-.7 1.2-2.9-2-3 3.6-3.6 3 2 2.9-1.2Z"
          transform="translate(.9 .3) scale(.94)"
          {...BLUE}
        />
        <circle cx="16" cy="16" r="5.6" {...GOLD} />
        <circle cx="16" cy="16" r="2.3" fill="#12409f" opacity=".6" />
        <Sheen d="M16 3.4c4.6 0 8.6 2.3 10.6 5.6-2.6-2.4-6.3-3.8-10.6-3.8S8 6.6 5.4 9C7.4 5.7 11.4 3.4 16 3.4Z" o={0.3} />
      </symbol>

      {/* Scenes: a page with a pen on it. */}
      <symbol id="ico-script" viewBox="0 0 32 32">
        <path d="M4.4 2.8h13.4l7.8 7.8v18.6H4.4Z" {...STEEL} />
        <path d="M17.8 2.8 25.6 10.6h-7.8Z" fill="#9db3d4" stroke="#0e3374" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M7.8 14.4h9.4M7.8 19h11.4" stroke="url(#icoBlue)" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M24.4 13.4 29.6 18.6 19.2 29H14v-5.2Z" {...GOLD} />
        <path d="m24.4 13.4 5.2 5.2-2.6 2.6-5.2-5.2Z" fill="#fff8e2" stroke="#8a5609" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M14 29v-5.2l5.2 5.2Z" fill="#12409f" stroke="#0e3374" strokeWidth="1.2" strokeLinejoin="round" />
      </symbol>

      {/* Voice over: the old broadcast microphone from the key art. */}
      <symbol id="ico-mic" viewBox="0 0 32 32">
        <path d="M13.4 22.6h5.2v4.2h-5.2Z" fill="#9db3d4" stroke="#0e3374" strokeWidth="1.2" />
        <path d="M6.4 29.6c0-1.6 1.4-2.8 3.2-2.8h12.8c1.8 0 3.2 1.2 3.2 2.8Z" {...STEEL} />
        <rect x="6.6" y="2" width="18.8" height="21.4" rx="9.4" {...BLUE} />
        <rect x="9.4" y="4.8" width="13.2" height="15.8" rx="6.6" fill="#0b2a63" opacity=".45" />
        <path d="M9.8 8.2h12.4M9.8 12h12.4M9.8 15.8h12.4" stroke="url(#icoGold)" strokeWidth="2" strokeLinecap="round" />
        <path d="M4.2 14.8h2.4v3.2H4.2Zm21.2 0h2.4v3.2h-2.4Z" {...GOLD} />
        <Sheen d="M16 2a9.4 9.4 0 0 1 8.2 4.8c-1.8-2-4.8-3.2-8.2-3.2S9.6 4.8 7.8 6.8A9.4 9.4 0 0 1 16 2Z" o={0.34} />
      </symbol>

      <symbol id="ico-captions" viewBox="0 0 32 32">
        <path d="M2.6 5.4a2.8 2.8 0 0 1 2.8-2.8h21.2a2.8 2.8 0 0 1 2.8 2.8v14.8a2.8 2.8 0 0 1-2.8 2.8H13.8l-7.4 6.4v-6.4H5.4a2.8 2.8 0 0 1-2.8-2.8Z" {...BLUE} />
        <path d="M7.4 11h11M7.4 16.6h17" {...GOLDLINE} strokeWidth="3.4" />
        <Sheen d="M5.4 2.6h21.2a2.8 2.8 0 0 1 2.8 2.8v1.8H2.6V5.4a2.8 2.8 0 0 1 2.8-2.8Z" o={0.3} />
      </symbol>

      <symbol id="ico-clapper" viewBox="0 0 32 32">
        <rect x="2" y="11.6" width="28" height="17.4" rx="2.8" {...BLUE} />
        <path d="m1.8 6.6 26.6-5.4 1.8 6.6-26.6 5.4Z" fill="#12409f" stroke="#0e3374" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="m8.4 5.3 3.4 6-4.2.9-3.4-6Zm9 -1.8 3.4 6-4.2.8-3.4-6Zm9-1.9 3 5.4-4.2.9-3.4-6Z" fill="url(#icoSteel)" />
        <path d="M13.2 16.8 23 22.4l-9.8 5.6Z" {...GOLD} />
        <Sheen d="M4.8 12.6h22.4a1.6 1.6 0 0 1 1.6 1.6v1.4H3.2v-1.4a1.6 1.6 0 0 1 1.6-1.6Z" o={0.24} />
      </symbol>

      <symbol id="ico-film" viewBox="0 0 32 32">
        <rect x="1.6" y="5.4" width="28.8" height="21.2" rx="2.8" {...BLUE} />
        <rect x="8.6" y="9.6" width="14.8" height="12.8" rx="1.6" fill="url(#icoSteel)" />
        <g fill="url(#icoGold)">
          <rect x="3.4" y="8.4" width="3.4" height="3.4" rx="1" />
          <rect x="3.4" y="14.3" width="3.4" height="3.4" rx="1" />
          <rect x="3.4" y="20.2" width="3.4" height="3.4" rx="1" />
          <rect x="25.2" y="8.4" width="3.4" height="3.4" rx="1" />
          <rect x="25.2" y="14.3" width="3.4" height="3.4" rx="1" />
          <rect x="25.2" y="20.2" width="3.4" height="3.4" rx="1" />
        </g>
      </symbol>

      <symbol id="ico-image" viewBox="0 0 32 32">
        <rect x="1.8" y="4.4" width="28.4" height="23.2" rx="3.2" {...BLUE} />
        <circle cx="10.4" cy="12" r="3.4" {...GOLD} />
        <path d="M3.6 26 13 15.4l5.2 5.6 4-3.6 6.6 8.6Z" fill="url(#icoSteel)" stroke="#0e3374" strokeWidth="1.1" strokeLinejoin="round" />
        <Sheen d="M5 5.4h22a1.6 1.6 0 0 1 1.6 1.6v1.4H3.4V7A1.6 1.6 0 0 1 5 5.4Z" o={0.24} />
      </symbol>

      <symbol id="ico-search" viewBox="0 0 32 32">
        <path d="m19.6 19.6 9 9" stroke="url(#icoGold)" strokeWidth="6.4" strokeLinecap="round" />
        <circle cx="13.4" cy="13.4" r="11" {...BLUE} />
        <circle cx="13.4" cy="13.4" r="6.6" fill="#d9e8ff" opacity=".65" />
        <Sheen d="M13.4 2.4a11 11 0 0 1 9.6 5.6c-2.2-2.4-5.6-3.8-9.6-3.8S6 5.6 3.8 8a11 11 0 0 1 9.6-5.6Z" />
      </symbol>

      <symbol id="ico-palette" viewBox="0 0 32 32">
        <path d="M16 2.2c8 0 14.4 5.6 14.4 12.4 0 4.2-3.4 6-6.4 6h-2.4c-1.7 0-3 1.3-3 2.9 0 .9.4 1.5.4 2.4 0 1.7-1.4 3.3-3.2 3.3-8 0-14.4-6.3-14.4-14S8 2.2 16 2.2Z" {...BLUE} />
        <circle cx="9.4" cy="12.4" r="2.9" {...GOLD} />
        <circle cx="15.6" cy="7.8" r="2.9" fill="#fff" opacity=".9" />
        <circle cx="22.2" cy="11.2" r="2.9" {...GOLD} />
        <circle cx="9.6" cy="20.6" r="2.9" fill="#fff" opacity=".72" />
      </symbol>

      <symbol id="ico-bolt" viewBox="0 0 32 32">
        <path d="M19.4 1.4 5.6 19.2h7.8L11.8 30.6 26.8 12h-8.4Z" {...GOLD} />
        <Sheen d="M19.4 1.4 8.8 17.2h4.6Z" o={0.4} />
      </symbol>

      <symbol id="ico-sparkle" viewBox="0 0 32 32">
        <path d="M13.4 1.4c1 6.2 3.8 10 10 11.5-6.2 1.5-9 5.3-10 11.5-1-6.2-3.8-10-10-11.5 6.2-1.5 9-5.3 10-11.5Z" {...GOLD} />
        <path d="M24.8 18.4c.5 3.2 2 5 5.2 5.8-3.2.8-4.7 2.6-5.2 5.8-.5-3.2-2-5-5.2-5.8 3.2-.8 4.7-2.6 5.2-5.8Z" {...BLUE} />
      </symbol>

      <symbol id="ico-eye" viewBox="0 0 32 32">
        <path d="M16 4.6c8 0 14.4 5.4 16 11.4-1.6 6-8 11.4-16 11.4S1.6 22 0 16C1.6 10 8 4.6 16 4.6Z" {...STEEL} />
        <circle cx="16" cy="16" r="7.4" fill="url(#icoBlue)" stroke="url(#icoGold)" strokeWidth="2" />
        <circle cx="16" cy="16" r="3.2" fill="#071c47" />
        <circle cx="13.4" cy="13.2" r="1.8" fill="#fff" opacity=".85" />
      </symbol>

      <symbol id="ico-flag" viewBox="0 0 32 32">
        <path d="M5.8 2.2v28.2" stroke="url(#icoSteel)" strokeWidth="4" strokeLinecap="round" />
        <path d="M8.6 3.4h20.8v14.4H8.6Z" {...GOLD} />
        <g fill="#12409f">
          <rect x="8.6" y="3.4" width="5.2" height="4.8" />
          <rect x="19" y="3.4" width="5.2" height="4.8" />
          <rect x="13.8" y="8.2" width="5.2" height="4.8" />
          <rect x="24.2" y="8.2" width="5.2" height="4.8" />
          <rect x="8.6" y="13" width="5.2" height="4.8" />
          <rect x="19" y="13" width="5.2" height="4.8" />
        </g>
      </symbol>

      <symbol id="ico-scissors" viewBox="0 0 32 32">
        <path d="M8.6 3 23.4 22.2M23.4 3 8.6 22.2" stroke="url(#icoSteel)" strokeWidth="4" strokeLinecap="round" />
        <circle cx="7.6" cy="25.6" r="5" {...GOLD} />
        <circle cx="24.4" cy="25.6" r="5" {...GOLD} />
        <circle cx="7.6" cy="25.6" r="1.9" fill="#12409f" />
        <circle cx="24.4" cy="25.6" r="1.9" fill="#12409f" />
      </symbol>

      <symbol id="ico-pencil" viewBox="0 0 32 32">
        <path d="M22.4 1.6 30.4 9.6 11.6 28.4 1.8 30.8l2.4-9.8Z" {...BLUE} />
        <path d="M22.4 1.6 30.4 9.6l-4 4-8-8Z" {...GOLD} />
        <path d="m1.8 30.8 2.4-9.8 3.2 3.2Z" {...STEEL} />
        <Sheen d="m19.6 6.4 5.4 5.4L11 25.8l-2-2Z" o={0.26} />
      </symbol>

      <symbol id="ico-trash" viewBox="0 0 32 32">
        <path d="M5 8.6h22l-2 20.4a2.6 2.6 0 0 1-2.6 2.2H9.6A2.6 2.6 0 0 1 7 29Z" {...BLUE} />
        <path d="M12 14.4v11M16 14.4v11M20 14.4v11" stroke="#0b2a63" strokeWidth="2.2" strokeLinecap="round" opacity=".5" />
        <rect x="2.4" y="5" width="27.2" height="4.4" rx="2.2" {...GOLD} />
        <path d="M11.6 0.8h8.8v4.2h-8.8Z" {...GOLD} />
      </symbol>

      <symbol id="ico-lock" viewBox="0 0 32 32">
        <path d="M8.6 13.4V9.2a7.4 7.4 0 0 1 14.8 0v4.2" fill="none" stroke="url(#icoSteel)" strokeWidth="4.2" strokeLinecap="round" />
        <rect x="3.8" y="12.8" width="24.4" height="18.4" rx="3.4" {...GOLD} />
        <circle cx="16" cy="20.4" r="3.2" fill="#12409f" />
        <path d="M16 22.8v4" stroke="#12409f" strokeWidth="2.8" strokeLinecap="round" />
        <Sheen d="M7.2 14h17.6a1.6 1.6 0 0 1 1.6 1.6v1.2H5.6v-1.2A1.6 1.6 0 0 1 7.2 14Z" o={0.34} />
      </symbol>

      <symbol id="ico-speaker" viewBox="0 0 32 32">
        <path d="M1.8 11.4h6.4l8.4-7.2v23.6l-8.4-7.2H1.8Z" {...BLUE} />
        <path d="M21 11a7.4 7.4 0 0 1 0 10M25.6 6.4a14 14 0 0 1 0 19.2" fill="none" stroke="url(#icoGold)" strokeWidth="3.6" strokeLinecap="round" />
      </symbol>

      <symbol id="ico-music" viewBox="0 0 32 32">
        <path d="M11.4 23V5.4l17-3.6v17.4" fill="none" stroke="url(#icoGold)" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M11.4 11 28.4 7.4" stroke="url(#icoGold)" strokeWidth="4" strokeLinecap="round" />
        <ellipse cx="7" cy="24.4" rx="6" ry="5" {...BLUE} />
        <ellipse cx="24.4" cy="20.4" rx="5.6" ry="4.8" {...BLUE} />
      </symbol>

      <symbol id="ico-headphones" viewBox="0 0 32 32">
        <path d="M3.6 21V15.6a12.4 12.4 0 0 1 24.8 0V21" fill="none" stroke="url(#icoBlue)" strokeWidth="4.4" strokeLinecap="round" />
        <rect x="1" y="17.4" width="8.8" height="13.2" rx="4" {...GOLD} />
        <rect x="22.2" y="17.4" width="8.8" height="13.2" rx="4" {...GOLD} />
      </symbol>

      <symbol id="ico-visualiser" viewBox="0 0 32 32">
        <rect x="1.4" y="4.6" width="29.2" height="22.8" rx="3.2" {...BLUE} />
        <g fill="url(#icoGold)">
          <rect x="5.6" y="16.4" width="3.4" height="7" rx="1.7" />
          <rect x="10.8" y="11.4" width="3.4" height="12" rx="1.7" />
          <rect x="16" y="8" width="3.4" height="15.4" rx="1.7" />
          <rect x="21.2" y="12.8" width="3.4" height="10.6" rx="1.7" />
          <rect x="26" y="17.4" width="3.4" height="6" rx="1.7" />
        </g>
        <Sheen d="M4.6 5.6h22.8a1.6 1.6 0 0 1 1.6 1.6v1.2H3V7.2a1.6 1.6 0 0 1 1.6-1.6Z" o={0.22} />
      </symbol>

      <symbol id="ico-rocket" viewBox="0 0 32 32">
        <path d="M16 .8c5.6 4.4 8.4 10.2 8.4 16.4L21.2 25h-10.4L7.6 17.2C7.6 11 10.4 5.2 16 .8Z" {...STEEL} />
        <circle cx="16" cy="12.6" r="4.2" {...BLUE} />
        <path d="M7.8 16.6 2.8 23.4l5.4-.8Zm16.4 0 5 6.8-5.4-.8Z" {...BLUE} />
        <path d="M16 31.6c-2.2-2.8-3.4-5.2-3.4-7.6h6.8c0 2.4-1.2 4.8-3.4 7.6Z" {...GOLD} />
        <Sheen d="M14.2 3.2c-2.8 3.6-4.4 7.6-4.6 12l2.4-.8c.2-4 1.1-7.8 2.2-11.2Z" o={0.5} />
      </symbol>

      <symbol id="ico-target" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="13.4" {...BLUE} />
        <circle cx="16" cy="16" r="8.8" fill="none" stroke="url(#icoGold)" strokeWidth="3.2" />
        <circle cx="16" cy="16" r="3.6" {...GOLD} />
        <Sheen d="M16 2.6a13.4 13.4 0 0 1 11.6 6.6C25 6.4 20.8 4.6 16 4.6S7 6.4 4.4 9.2A13.4 13.4 0 0 1 16 2.6Z" o={0.3} />
      </symbol>

      <symbol id="ico-folder" viewBox="0 0 32 32">
        <path d="M1.6 6.4a2.8 2.8 0 0 1 2.8-2.8h7.4l3.4 4h13.4a2.8 2.8 0 0 1 2.8 2.8v16.4a2.8 2.8 0 0 1-2.8 2.8H4.4a2.8 2.8 0 0 1-2.8-2.8Z" {...BLUE} />
        <path d="M2 13.4h28v13.4a2.8 2.8 0 0 1-2.8 2.8H4.8A2.8 2.8 0 0 1 2 26.8Z" {...GOLD} />
        <Sheen d="M4.6 14.4h22.8a1.6 1.6 0 0 1 1.6 1.6v1.2H3V16a1.6 1.6 0 0 1 1.6-1.6Z" o={0.4} />
      </symbol>

      <symbol id="ico-globe" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="13.4" {...BLUE} />
        <path d="M2.6 16h26.8M16 2.6c3.6 3.8 5.4 8.4 5.4 13.4S19.6 25.6 16 29.4c-3.6-3.8-5.4-8.4-5.4-13.4S12.4 6.4 16 2.6Z" fill="none" stroke="url(#icoGold)" strokeWidth="2.2" />
        <path d="M5.4 8.4c3 1.8 6.8 2.8 10.6 2.8s7.6-1 10.6-2.8M5.4 23.6c3-1.8 6.8-2.8 10.6-2.8s7.6 1 10.6 2.8" fill="none" stroke="url(#icoGold)" strokeWidth="2" strokeLinecap="round" />
      </symbol>

      <symbol id="ico-bell" viewBox="0 0 32 32">
        <path d="M16 1.4a2.6 2.6 0 0 1 2.6 2.6v1.2a10.2 10.2 0 0 1 7.6 9.8v5.8l3.4 5.2H2.4l3.4-5.2V15a10.2 10.2 0 0 1 7.6-9.8V4A2.6 2.6 0 0 1 16 1.4Z" {...GOLD} />
        <path d="M11.8 27.4h8.4a4.2 4.2 0 0 1-8.4 0Z" {...BLUE} />
        <Sheen d="M12.6 6.8C9.8 8.4 8.2 11.2 8.2 14.4v5l-1.2 2v-7c0-3.4 2.2-6.4 5.6-7.6Z" o={0.48} />
      </symbol>

      <symbol id="ico-bulb" viewBox="0 0 32 32">
        <path d="M16 1.2a11 11 0 0 1 6.6 19.8c-1.2 1-1.8 2.1-1.8 3.4v1.4h-9.6v-1.4c0-1.3-.6-2.4-1.8-3.4A11 11 0 0 1 16 1.2Z" {...GOLD} />
        <path d="M11.2 26.8h9.6v2.2a2.6 2.6 0 0 1-2.6 2.6h-4.4a2.6 2.6 0 0 1-2.6-2.6Z" {...BLUE} />
        <Sheen d="M13 4.4A8.6 8.6 0 0 0 7.8 12c0 .8-2.2.8-2.2 0A10.6 10.6 0 0 1 13 4.4Z" o={0.55} />
      </symbol>

      <symbol id="ico-clock" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="13.4" {...BLUE} />
        <circle cx="16" cy="16" r="9.6" fill="#eaf2ff" />
        <path d="M16 8.8V16l5 3.2" fill="none" stroke="url(#icoGold)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16" cy="16" r="1.8" fill="#8a5609" />
        <Sheen d="M16 2.6a13.4 13.4 0 0 1 11.6 6.6C25 6.4 20.8 4.6 16 4.6S7 6.4 4.4 9.2A13.4 13.4 0 0 1 16 2.6Z" o={0.3} />
      </symbol>

      <symbol id="ico-person" viewBox="0 0 32 32">
        <circle cx="16" cy="9" r="7" {...GOLD} />
        <path d="M2 31.4a14 14 0 0 1 28 0Z" {...BLUE} />
        <Sheen d="M13 3.4a6.8 6.8 0 0 0-3.8 5c-.2.9-1.8.7-1.6-.4A7 7 0 0 1 13 3.4Z" o={0.55} />
      </symbol>

      <symbol id="ico-people" viewBox="0 0 32 32">
        <circle cx="23.4" cy="9.6" r="5.6" {...BLUE} />
        <path d="M13.4 30.4a10.4 10.4 0 0 1 20.4 0Z" {...BLUE} />
        <circle cx="11.2" cy="8.6" r="6.8" {...GOLD} />
        <path d="M-1.4 30.6a12.8 12.8 0 0 1 25.6 0Z" {...GOLD} />
      </symbol>

      <symbol id="ico-mouse" viewBox="0 0 32 32">
        <rect x="7.4" y="1.4" width="17.2" height="29.2" rx="8.6" {...BLUE} />
        <path d="M16 7.4v5.8" stroke="url(#icoGold)" strokeWidth="3.6" strokeLinecap="round" />
        <Sheen d="M11.4 4.4a6.8 6.8 0 0 0-2.4 5v7c0 .9-1.6.9-1.6 0v-7a8.4 8.4 0 0 1 3-6.4Z" o={0.45} />
      </symbol>

      <symbol id="ico-frame" viewBox="0 0 32 32">
        <rect x="1.6" y="4.4" width="28.8" height="23.2" rx="3.2" {...BLUE} />
        <rect x="6" y="17.4" width="20" height="6" rx="2" {...GOLD} />
        <Sheen d="M4.8 5.4h22.4a1.6 1.6 0 0 1 1.6 1.6v1.4H3.2V7a1.6 1.6 0 0 1 1.6-1.6Z" o={0.24} />
      </symbol>

      <symbol id="ico-text" viewBox="0 0 32 32">
        <rect x="1.6" y="4.4" width="28.8" height="23.2" rx="3.2" {...BLUE} />
        <path d="M8 11.4h16M16 11.4V22" {...GOLDLINE} strokeWidth="4" />
        <Sheen d="M4.8 5.4h22.4a1.6 1.6 0 0 1 1.6 1.6v1.4H3.2V7a1.6 1.6 0 0 1 1.6-1.6Z" o={0.24} />
      </symbol>

      <symbol id="ico-phone" viewBox="0 0 32 32">
        <rect x="7.4" y="0.8" width="17.2" height="30.4" rx="3.8" {...BLUE} />
        <rect x="9.8" y="5" width="12.4" height="20.8" rx="1.6" fill="#d9e8ff" opacity=".85" />
        <rect x="13" y="27.4" width="6" height="2" rx="1" {...GOLD} />
      </symbol>

      <symbol id="ico-screen" viewBox="0 0 32 32">
        <rect x="1.4" y="3.4" width="29.2" height="20.8" rx="3" {...BLUE} />
        <rect x="4.4" y="6.4" width="23.2" height="14.8" rx="1.6" fill="#d9e8ff" opacity=".8" />
        <path d="M10.6 29.6h10.8M16 24.2v5.4" stroke="url(#icoGold)" strokeWidth="3.4" strokeLinecap="round" />
      </symbol>

      <symbol id="ico-chart" viewBox="0 0 32 32">
        <rect x="1.6" y="4.4" width="28.8" height="23.2" rx="3.2" {...BLUE} />
        <g fill="url(#icoGold)">
          <rect x="6.4" y="15.4" width="4.4" height="8" rx="1.8" />
          <rect x="13.8" y="10.4" width="4.4" height="13" rx="1.8" />
          <rect x="21.2" y="7" width="4.4" height="16.4" rx="1.8" />
        </g>
      </symbol>

      <symbol id="ico-star" viewBox="0 0 32 32">
        <path d="m16 1 4.7 9.5 10.5 1.5-7.6 7.4 1.8 10.4L16 24.9 6.6 29.8l1.8-10.4L.8 12l10.5-1.5Z" {...GOLD} />
        <Sheen d="m16 4.6 3.2 6.4-7.4 1.2Z" o={0.45} />
      </symbol>

      <symbol id="ico-tag" viewBox="0 0 32 32">
        <path d="M1.6 2.6h12.6a2.8 2.8 0 0 1 2 .8l14.2 14.2a2.8 2.8 0 0 1 0 4l-9.8 9.8a2.8 2.8 0 0 1-4 0L2.4 17.2a2.8 2.8 0 0 1-.8-2Z" {...BLUE} />
        <circle cx="9.6" cy="10.4" r="3.6" {...GOLD} />
        <Sheen d="M3.8 4.6h9.4l1.8 1.8H3.8Z" o={0.3} />
      </symbol>

      <symbol id="ico-shuffle" viewBox="0 0 32 32">
        <path d="M2.4 9.4h5l11 13.2h5M2.4 22.6h5l3.8-4.6M20.4 9.4h3" {...GOLDLINE} strokeWidth="3.6" />
        <path d="M22.2 4.6 29.6 9.4l-7.4 4.8Zm0 13.2 7.4 4.8-7.4 4.8Z" {...GOLD} />
      </symbol>

      <symbol id="ico-crop" viewBox="0 0 32 32">
        <path d="M8.6 1.4v22h22M1.4 8.6h22v22" {...GOLDLINE} strokeWidth="4.6" />
      </symbol>

      <symbol id="ico-download" viewBox="0 0 32 32">
        <path d="M16 1.6v17m0 0 7-7M16 18.6l-7-7" {...GOLDLINE} strokeWidth="4.4" />
        <path d="M2.6 22.4v4.4a3.2 3.2 0 0 0 3.2 3.2h20.4a3.2 3.2 0 0 0 3.2-3.2v-4.4" fill="none" stroke="url(#icoBlue)" strokeWidth="4" strokeLinecap="round" />
      </symbol>

      <symbol id="ico-upload" viewBox="0 0 32 32">
        <path d="M16 19.4v-17m0 0 7 7M16 2.4l-7 7" {...GOLDLINE} strokeWidth="4.4" />
        <path d="M2.6 22.4v4.4a3.2 3.2 0 0 0 3.2 3.2h20.4a3.2 3.2 0 0 0 3.2-3.2v-4.4" fill="none" stroke="url(#icoBlue)" strokeWidth="4" strokeLinecap="round" />
      </symbol>

      <symbol id="ico-leaf" viewBox="0 0 32 32">
        <path d="M29.4 2.6c1.8 12.6-4.6 21.4-14.8 21.4-5 0-9-3.1-9-7.7C5.6 7.5 14.8 2.2 29.4 2.6Z" {...BLUE} />
        <path d="M28.2 3.8C19.6 9.1 12.6 17.7 8.4 29.2" fill="none" stroke="url(#icoGold)" strokeWidth="3.2" strokeLinecap="round" />
      </symbol>

      <symbol id="ico-menu" viewBox="0 0 32 32">
        <path d="M3.4 7.6h25.2M3.4 16h25.2M3.4 24.4h25.2" {...GOLDLINE} strokeWidth="4.8" />
      </symbol>

      <symbol id="ico-archive" viewBox="0 0 32 32">
        <rect x="1.6" y="3" width="28.8" height="7.6" rx="2.2" {...GOLD} />
        <path d="M4 12.4h24v15.4a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3Z" {...BLUE} />
        <path d="M12 18.4h8" {...GOLDLINE} strokeWidth="3.4" />
        <Sheen d="M3.8 4h24.4a1.2 1.2 0 0 1 1.2 1.2v1.4H2.6V5.2A1.2 1.2 0 0 1 3.8 4Z" o={0.36} />
      </symbol>

      <symbol id="ico-dot" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="9.6" {...GOLD} />
        <Sheen d="M16 6.4a9.6 9.6 0 0 1 8.4 5c-1.8-2.2-4.8-3.6-8.4-3.6s-6.6 1.4-8.4 3.6A9.6 9.6 0 0 1 16 6.4Z" />
      </symbol>
    </svg>
  );
}
