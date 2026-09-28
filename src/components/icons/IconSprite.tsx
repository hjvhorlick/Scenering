/**
 * The icon sprite.
 *
 * One hidden <svg> mounted once per surface, holding every icon as a
 * <symbol> plus the three gradients they all share. Icons are then a
 * ~60-byte <use> rather than a few hundred bytes of repeated path data, which
 * matters on screens like the Studio that show forty of them at once.
 *
 * House style, taken from the Scenering key art: a dimensional blue body, a
 * gold accent carrying the meaning, a white specular highlight across the top
 * third, and a dark blue outline so the shape survives on a light porcelain
 * panel. Shadows are applied in CSS, not here, so a flat context can switch
 * them off.
 *
 * Drawn on a 32x32 grid with a 2px margin: the live area is 28x28, and every
 * icon is optically centred inside it rather than mathematically centred, so
 * a row of mixed icons sits on one line.
 */

/** Soft ground shadow under a round body. */
const Base = ({ cx = 16, cy = 17.4, r = 13 }: { cx?: number; cy?: number; r?: number }) => (
  <circle cx={cx} cy={cy} r={r} fill="#0b2a63" opacity=".22" />
);

/** The glossy sweep across the top of a round body. */
const Shine = () => (
  <path
    d="M16 3.4c5.9 0 10.9 3.3 12.6 7.9-2.8-3.2-7.2-5.2-12.6-5.2S6.2 8.1 3.4 11.3C5.1 6.7 10.1 3.4 16 3.4Z"
    fill="#fff"
    opacity=".34"
  />
);

/** A round blue body — the backing for every verb icon. */
const Disc = () => (
  <>
    <Base />
    <circle cx="16" cy="16" r="13" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" />
    <Shine />
  </>
);

const gold = { fill: "url(#icoGold)", stroke: "#8a5609", strokeWidth: 0.7, strokeLinejoin: "round" as const };
const goldRound = { ...gold, strokeLinecap: "round" as const };

export default function IconSprite() {
  return (
    <svg aria-hidden="true" focusable="false" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
      <defs>
        <linearGradient id="icoBlue" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#82bcff" />
          <stop offset="0.45" stopColor="#2f6fe4" />
          <stop offset="1" stopColor="#12409f" />
        </linearGradient>
        <linearGradient id="icoGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffeaa7" />
          <stop offset="0.45" stopColor="#ffc43c" />
          <stop offset="1" stopColor="#e2900f" />
        </linearGradient>
        <linearGradient id="icoSteel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#dbe6f7" />
          <stop offset="1" stopColor="#9fb4d4" />
        </linearGradient>
      </defs>

      {/* ---------------------------------------------------- transport */}

      <symbol id="ico-play" viewBox="0 0 32 32">
        <Disc />
        <path d="M13.2 10.4 22.6 16l-9.4 5.6Z" {...gold} />
      </symbol>

      <symbol id="ico-stop" viewBox="0 0 32 32">
        <Disc />
        <rect x="11.4" y="11.4" width="9.2" height="9.2" rx="2.2" {...gold} />
      </symbol>

      <symbol id="ico-pause" viewBox="0 0 32 32">
        <Disc />
        <rect x="11.2" y="10.8" width="3.5" height="10.4" rx="1.6" {...gold} />
        <rect x="17.3" y="10.8" width="3.5" height="10.4" rx="1.6" {...gold} />
      </symbol>

      <symbol id="ico-record" viewBox="0 0 32 32">
        <Disc />
        <circle cx="16" cy="16" r="5.2" {...gold} />
      </symbol>

      <symbol id="ico-replay" viewBox="0 0 32 32">
        <Disc />
        <path d="M21.6 16a5.6 5.6 0 1 1-2.2-4.45" fill="none" stroke="url(#icoGold)" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M20.6 7.8v4.4h-4.4Z" {...gold} />
      </symbol>

      <symbol id="ico-loop" viewBox="0 0 32 32">
        <Disc />
        <path d="M11 14.2h9.4a2.6 2.6 0 0 1 0 5.2H12" fill="none" stroke="url(#icoGold)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M13.6 10.9 10.3 14.2l3.3 3.3Z" {...gold} />
      </symbol>

      {/* ------------------------------------------------------ answers */}

      <symbol id="ico-check" viewBox="0 0 32 32">
        <Disc />
        <path d="m10.6 16.3 3.6 3.7 7.3-7.8" fill="none" stroke="url(#icoGold)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </symbol>

      <symbol id="ico-close" viewBox="0 0 32 32">
        <Disc />
        <path d="m11.6 11.6 8.8 8.8m0-8.8-8.8 8.8" fill="none" stroke="url(#icoGold)" strokeWidth="3.1" strokeLinecap="round" />
      </symbol>

      <symbol id="ico-plus" viewBox="0 0 32 32">
        <Disc />
        <path d="M16 10.4v11.2M10.4 16h11.2" fill="none" stroke="url(#icoGold)" strokeWidth="3.2" strokeLinecap="round" />
      </symbol>

      <symbol id="ico-minus" viewBox="0 0 32 32">
        <Disc />
        <path d="M10.4 16h11.2" fill="none" stroke="url(#icoGold)" strokeWidth="3.2" strokeLinecap="round" />
      </symbol>

      <symbol id="ico-ban" viewBox="0 0 32 32">
        <Disc />
        <circle cx="16" cy="16" r="5.8" fill="none" stroke="url(#icoGold)" strokeWidth="2.6" />
        <path d="m11.9 11.9 8.2 8.2" stroke="url(#icoGold)" strokeWidth="2.6" strokeLinecap="round" />
      </symbol>

      <symbol id="ico-warning" viewBox="0 0 32 32">
        <Base cy={18.4} r={12.4} />
        <path d="M16 3.6 30 26.4H2Z" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M16 6.6 26.6 23.9H5.4Z" fill="#fff" opacity=".22" />
        <path d="M16 11.4v6.4" stroke="#6b3d05" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="16" cy="21.6" r="1.6" fill="#6b3d05" />
      </symbol>

      {/* ------------------------------------------------------ arrows */}

      <symbol id="ico-up" viewBox="0 0 32 32">
        <Disc />
        <path d="M16 21.4V11m0 0-4.6 4.6M16 11l4.6 4.6" fill="none" stroke="url(#icoGold)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </symbol>

      <symbol id="ico-down" viewBox="0 0 32 32">
        <Disc />
        <path d="M16 10.6V21m0 0 4.6-4.6M16 21l-4.6-4.6" fill="none" stroke="url(#icoGold)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </symbol>

      <symbol id="ico-left" viewBox="0 0 32 32">
        <Disc />
        <path d="M21.4 16H11m0 0 4.6-4.6M11 16l4.6 4.6" fill="none" stroke="url(#icoGold)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </symbol>

      <symbol id="ico-right" viewBox="0 0 32 32">
        <Disc />
        <path d="M10.6 16H21m0 0-4.6-4.6M21 16l-4.6 4.6" fill="none" stroke="url(#icoGold)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </symbol>

      <symbol id="ico-caret-up" viewBox="0 0 32 32">
        <Disc />
        <path d="m10.8 19 5.2-5.6 5.2 5.6Z" {...gold} />
      </symbol>

      <symbol id="ico-caret-down" viewBox="0 0 32 32">
        <Disc />
        <path d="m10.8 13 5.2 5.6L21.2 13Z" {...gold} />
      </symbol>

      <symbol id="ico-pan-h" viewBox="0 0 32 32">
        <Disc />
        <path d="M9.6 16h12.8m0 0-3.6-3.4M22.4 16l-3.6 3.4M9.6 16l3.6-3.4M9.6 16l3.6 3.4" fill="none" stroke="url(#icoGold)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </symbol>

      <symbol id="ico-pan-v" viewBox="0 0 32 32">
        <Disc />
        <path d="M16 9.6v12.8m0 0 3.4-3.6M16 22.4l-3.4-3.6M16 9.6l3.4 3.6M16 9.6l-3.4 3.6" fill="none" stroke="url(#icoGold)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </symbol>

      {/* ----------------------------------------------------- the craft */}

      <symbol id="ico-gear" viewBox="0 0 32 32">
        <Base />
        <path
          d="M16 2.6l2.9 1.1 2.4-2 2.2 2.2-2 2.4 1.1 2.9 3 .7v3.1l-3 .7-1.1 2.9 2 2.4-2.2 2.2-2.4-2-2.9 1.1-.7 3h-3.1l-.7-3-2.9-1.1-2.4 2-2.2-2.2 2-2.4-1.1-2.9-3-.7v-3.1l3-.7L6.1 6.3l-2-2.4 2.2-2.2 2.4 2 2.9-1.1.7-3h3.1Z"
          transform="translate(0 2.4) scale(0.92) translate(1.4 0)"
          fill="url(#icoBlue)"
          stroke="#0e3374"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="16" r="5" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="0.9" />
        <circle cx="16" cy="16" r="2.1" fill="#12409f" opacity=".55" />
        <path d="M16 4.6c4.2 0 7.8 2 9.6 5-2.4-2-5.8-3.2-9.6-3.2S8.8 7.6 6.4 9.6c1.8-3 5.4-5 9.6-5Z" fill="#fff" opacity=".3" />
      </symbol>

      <symbol id="ico-script" viewBox="0 0 32 32">
        <Base cy={18} r={12} />
        <path d="M6.6 4.4h13.2l6 6v17.2a1.8 1.8 0 0 1-1.8 1.8H6.6a1.8 1.8 0 0 1-1.8-1.8V6.2a1.8 1.8 0 0 1 1.8-1.8Z" fill="url(#icoSteel)" stroke="#0e3374" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M19.8 4.4l6 6h-6Z" fill="#9fb4d4" stroke="#0e3374" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M8.8 14.4h13M8.8 18.4h13M8.8 22.4h8.4" stroke="url(#icoBlue)" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M8.8 10.4h7" stroke="url(#icoGold)" strokeWidth="2.2" strokeLinecap="round" />
      </symbol>

      <symbol id="ico-mic" viewBox="0 0 32 32">
        <Base cy={19} r={11.4} />
        <rect x="11.4" y="2.6" width="9.2" height="15.6" rx="4.6" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" />
        <path d="M13 5.4h6M13 8.2h6M13 11h6" stroke="#0b2a63" strokeWidth="1" opacity=".45" strokeLinecap="round" />
        <path d="M13.4 4.2c0-.7.6-1.2 1.4-1.2h1.4c-1.6.6-2.4 2-2.4 3.6Z" fill="#fff" opacity=".4" />
        <path d="M7.6 15.2a8.4 8.4 0 0 0 16.8 0" fill="none" stroke="url(#icoGold)" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M16 23.6v5.2M11.8 28.8h8.4" stroke="url(#icoGold)" strokeWidth="2.6" strokeLinecap="round" />
      </symbol>

      <symbol id="ico-captions" viewBox="0 0 32 32">
        <Base cy={18.6} r={12.6} />
        <path d="M4.4 6.2a2.6 2.6 0 0 1 2.6-2.6h18a2.6 2.6 0 0 1 2.6 2.6v13a2.6 2.6 0 0 1-2.6 2.6H14.2l-6 5.4v-5.4H7a2.6 2.6 0 0 1-2.6-2.6Z" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M7 5.4h18a1.4 1.4 0 0 1 1.4 1.4v2.4H5.6V6.8A1.4 1.4 0 0 1 7 5.4Z" fill="#fff" opacity=".3" />
        <path d="M9 13.4h8.4M9 17.6h14" stroke="url(#icoGold)" strokeWidth="2.6" strokeLinecap="round" />
      </symbol>

      <symbol id="ico-clapper" viewBox="0 0 32 32">
        <Base cy={19.4} r={12.6} />
        <rect x="3.4" y="12.6" width="25.2" height="15.4" rx="2.4" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" />
        <path d="M5.8 13.6h20.4a1.4 1.4 0 0 1 1.4 1.4v1.8H4.4V15a1.4 1.4 0 0 1 1.4-1.4Z" fill="#fff" opacity=".26" />
        <path d="M4.2 8.2 27.1 3.6l1.3 5.4L5.5 13.6Z" fill="#12409f" stroke="#0e3374" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="m9.6 7.2 2.9 5.1 3.5-.7-2.9-5.1Zm7.8-1.6 2.9 5.1 3.5-.7-2.9-5.1Z" fill="url(#icoSteel)" />
        <path d="M16 18.4 22 22l-6 3.6Z" {...gold} />
      </symbol>

      <symbol id="ico-film" viewBox="0 0 32 32">
        <Base cy={18.4} r={12.4} />
        <rect x="2.6" y="6.6" width="26.8" height="18.8" rx="2.4" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" />
        <rect x="8.4" y="10.2" width="15.2" height="11.6" rx="1.4" fill="url(#icoSteel)" opacity=".9" />
        <g fill="url(#icoGold)">
          <rect x="4.2" y="9" width="2.8" height="2.8" rx=".8" />
          <rect x="4.2" y="14.6" width="2.8" height="2.8" rx=".8" />
          <rect x="4.2" y="20.2" width="2.8" height="2.8" rx=".8" />
          <rect x="25" y="9" width="2.8" height="2.8" rx=".8" />
          <rect x="25" y="14.6" width="2.8" height="2.8" rx=".8" />
          <rect x="25" y="20.2" width="2.8" height="2.8" rx=".8" />
        </g>
      </symbol>

      <symbol id="ico-image" viewBox="0 0 32 32">
        <Base cy={18.4} r={12.4} />
        <rect x="3.4" y="5.6" width="25.2" height="20.8" rx="2.8" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" />
        <rect x="5.8" y="8" width="20.4" height="16" rx="1.6" fill="#0b2a63" opacity=".35" />
        <circle cx="11.4" cy="12.6" r="2.6" fill="url(#icoGold)" />
        <path d="M6.2 23.4 13 16l4.6 4.8 3.6-3.2 6 5.8Z" fill="url(#icoSteel)" />
        <path d="M6 7h20a1.4 1.4 0 0 1 1.4 1.4v1.2H4.6V8.4A1.4 1.4 0 0 1 6 7Z" fill="#fff" opacity=".22" />
      </symbol>

      <symbol id="ico-search" viewBox="0 0 32 32">
        <Base cx={14.4} cy={15.4} r={11.4} />
        <path d="m19.6 19.6 7.6 7.6" stroke="url(#icoGold)" strokeWidth="4.4" strokeLinecap="round" />
        <circle cx="14" cy="14" r="9.6" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" />
        <circle cx="14" cy="14" r="6.4" fill="#cfe2ff" opacity=".5" />
        <path d="M14 5.4a8.6 8.6 0 0 1 7.5 4.4c-1.8-1.8-4.4-2.9-7.5-2.9S8.3 8 6.5 9.8A8.6 8.6 0 0 1 14 5.4Z" fill="#fff" opacity=".4" />
      </symbol>

      <symbol id="ico-palette" viewBox="0 0 32 32">
        <Base cy={18} r={12.4} />
        <path d="M16 3.4c7.5 0 13.6 5.2 13.6 11.6 0 3.9-3.2 5.6-6 5.6h-2.2c-1.6 0-2.8 1.2-2.8 2.7 0 .8.4 1.4.4 2.2 0 1.6-1.3 3.1-3 3.1-7.5 0-13.6-5.9-13.6-13.2S8.5 3.4 16 3.4Z" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" strokeLinejoin="round" />
        <circle cx="9.6" cy="12.4" r="2.4" fill="url(#icoGold)" />
        <circle cx="15.4" cy="8.6" r="2.4" fill="#fff" opacity=".85" />
        <circle cx="21.6" cy="11.4" r="2.4" fill="url(#icoGold)" />
        <circle cx="9.8" cy="19.6" r="2.4" fill="#fff" opacity=".7" />
      </symbol>

      <symbol id="ico-bolt" viewBox="0 0 32 32">
        <Base cy={18} r={11.4} />
        <path d="M18.6 2.6 7.4 18.2h6.2L12.8 29.4 24.6 13.4h-6.6Z" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M18.2 4.8 10 16.8h4.2Z" fill="#fff" opacity=".4" />
      </symbol>

      <symbol id="ico-sparkle" viewBox="0 0 32 32">
        <Base cy={18} r={11.4} />
        <path d="M16 2.4c.9 5.7 3.5 9.1 9.2 10.6-5.7 1.4-8.3 4.9-9.2 10.6-.9-5.7-3.5-9.2-9.2-10.6 5.7-1.5 8.3-4.9 9.2-10.6Z" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="1" strokeLinejoin="round" />
        <path d="M24.8 20.4c.5 2.9 1.8 4.6 4.6 5.3-2.8.7-4.1 2.5-4.6 5.4-.4-2.9-1.7-4.7-4.6-5.4 2.9-.7 4.2-2.4 4.6-5.3Z" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1" strokeLinejoin="round" />
      </symbol>

      <symbol id="ico-eye" viewBox="0 0 32 32">
        <Base cy={17.4} r={12.4} />
        <path d="M16 6.4c7 0 12.6 4.6 14.4 9.6-1.8 5-7.4 9.6-14.4 9.6S3.4 21 1.6 16C3.4 11 9 6.4 16 6.4Z" fill="url(#icoSteel)" stroke="#0e3374" strokeWidth="1.1" strokeLinejoin="round" />
        <circle cx="16" cy="16" r="6.2" fill="url(#icoBlue)" stroke="url(#icoGold)" strokeWidth="1.5" />
        <circle cx="16" cy="16" r="2.8" fill="#081f4d" />
        <circle cx="13.9" cy="13.6" r="1.5" fill="#fff" opacity=".8" />
      </symbol>

      <symbol id="ico-flag" viewBox="0 0 32 32">
        <Base cy={19} r={11.4} />
        <path d="M7.4 3.4v25.2" stroke="url(#icoSteel)" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M9.6 4.6h17.8v12.2H9.6Z" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="1.1" strokeLinejoin="round" />
        <g fill="#12409f">
          <rect x="9.6" y="4.6" width="4.4" height="4" />
          <rect x="18.4" y="4.6" width="4.5" height="4" />
          <rect x="14" y="8.6" width="4.4" height="4.1" />
          <rect x="22.9" y="8.6" width="4.5" height="4.1" />
          <rect x="9.6" y="12.7" width="4.4" height="4.1" />
          <rect x="18.4" y="12.7" width="4.5" height="4.1" />
        </g>
      </symbol>

      <symbol id="ico-scissors" viewBox="0 0 32 32">
        <Base cy={18.4} r={11.8} />
        <path d="M9.4 4.6 22.6 23.4M22.6 4.6 9.4 23.4" stroke="url(#icoSteel)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="8.6" cy="25.4" r="4.2" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="1.1" />
        <circle cx="23.4" cy="25.4" r="4.2" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="1.1" />
        <circle cx="8.6" cy="25.4" r="1.6" fill="#12409f" />
        <circle cx="23.4" cy="25.4" r="1.6" fill="#12409f" />
      </symbol>

      <symbol id="ico-pencil" viewBox="0 0 32 32">
        <Base cy={18.4} r={12} />
        <path d="M22.4 2.8 29.2 9.6 11.8 27 3.4 29.6 6 21.2Z" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M22.4 2.8 29.2 9.6l-3.6 3.6-6.8-6.8Z" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="m3.4 29.6 2.6-8.4 2.5 2.5Z" fill="url(#icoSteel)" stroke="#0e3374" strokeWidth="1" strokeLinejoin="round" />
        <path d="m20.4 7 4.6 4.6-11 11Z" fill="#fff" opacity=".24" />
      </symbol>

      <symbol id="ico-trash" viewBox="0 0 32 32">
        <Base cy={19} r={11.4} />
        <path d="M6.6 8.6h18.8l-1.8 19a2.4 2.4 0 0 1-2.4 2.2H10.8a2.4 2.4 0 0 1-2.4-2.2Z" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M12.6 14.4v10M16 14.4v10M19.4 14.4v10" stroke="#0b2a63" strokeWidth="1.8" strokeLinecap="round" opacity=".5" />
        <path d="M4.4 5.6h23.2v3.6H4.4Z" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M12.4 2.4h7.2v3.2h-7.2Z" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="1.1" strokeLinejoin="round" />
      </symbol>

      <symbol id="ico-lock" viewBox="0 0 32 32">
        <Base cy={20} r={11} />
        <path d="M9.6 13.4v-3.8a6.4 6.4 0 0 1 12.8 0v3.8" fill="none" stroke="url(#icoSteel)" strokeWidth="3.2" strokeLinecap="round" />
        <rect x="5.6" y="13.2" width="20.8" height="16.2" rx="3" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="1.1" />
        <circle cx="16" cy="20.2" r="2.8" fill="#12409f" />
        <path d="M16 22.4v3.4" stroke="#12409f" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M8.4 14.4h15.2a1.4 1.4 0 0 1 1.4 1.4v1H7V15.8a1.4 1.4 0 0 1 1.4-1.4Z" fill="#fff" opacity=".3" />
      </symbol>

      <symbol id="ico-speaker" viewBox="0 0 32 32">
        <Base cy={18} r={11.8} />
        <path d="M4.4 12.2h5l7-5.8v19.2l-7-5.8h-5Z" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M19.6 11.4a6.6 6.6 0 0 1 0 9.2M23.4 7.6a12 12 0 0 1 0 16.8" fill="none" stroke="url(#icoGold)" strokeWidth="2.6" strokeLinecap="round" />
      </symbol>

      <symbol id="ico-music" viewBox="0 0 32 32">
        <Base cy={19.4} r={11.4} />
        <path d="M12.4 22.4V6.6l14-3.2v15.8" fill="none" stroke="url(#icoGold)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        <ellipse cx="8.6" cy="23.4" rx="5.4" ry="4.4" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" />
        <ellipse cx="22.6" cy="20.2" rx="5.2" ry="4.2" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" />
        <path d="M12.4 10.4 26.4 7.2" stroke="url(#icoGold)" strokeWidth="3" strokeLinecap="round" />
      </symbol>

      <symbol id="ico-headphones" viewBox="0 0 32 32">
        <Base cy={19.4} r={11.8} />
        <path d="M4.6 20.4v-4.2a11.4 11.4 0 0 1 22.8 0v4.2" fill="none" stroke="url(#icoBlue)" strokeWidth="3.4" strokeLinecap="round" />
        <rect x="2.6" y="17.6" width="7.4" height="11.4" rx="3.2" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="1.1" />
        <rect x="22" y="17.6" width="7.4" height="11.4" rx="3.2" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="1.1" />
      </symbol>

      <symbol id="ico-visualiser" viewBox="0 0 32 32">
        <Base cy={18.6} r={12.4} />
        <rect x="2.4" y="6.4" width="27.2" height="19.2" rx="3" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" />
        <g fill="url(#icoGold)">
          <rect x="6.4" y="16.4" width="2.8" height="5.6" rx="1.4" />
          <rect x="11" y="12.4" width="2.8" height="9.6" rx="1.4" />
          <rect x="15.6" y="9.2" width="2.8" height="12.8" rx="1.4" />
          <rect x="20.2" y="13.4" width="2.8" height="8.6" rx="1.4" />
          <rect x="24.8" y="17" width="2.8" height="5" rx="1.4" />
        </g>
        <path d="M5.4 7.4h21.2a1.4 1.4 0 0 1 1.4 1.4v1.2H4V8.8a1.4 1.4 0 0 1 1.4-1.4Z" fill="#fff" opacity=".24" />
      </symbol>

      <symbol id="ico-rocket" viewBox="0 0 32 32">
        <Base cy={19.4} r={11.4} />
        <path d="M16 1.6c5 4 7.4 9.2 7.4 14.8l-2.8 6.4h-9.2l-2.8-6.4C8.6 10.8 11 5.6 16 1.6Z" fill="url(#icoSteel)" stroke="#0e3374" strokeWidth="1.1" strokeLinejoin="round" />
        <circle cx="16" cy="12.4" r="3.6" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" />
        <path d="M8.6 15.6 4.4 21.4l4.6-.6Zm14.8 0 4.2 5.8-4.6-.6Z" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M16 30.4c-2 -2.4-3-4.6-3-6.6h6c0 2-1 4.2-3 6.6Z" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="1" strokeLinejoin="round" />
        <path d="M14.4 3.8c-2.6 3.2-4 6.8-4.2 10.8l2.2-.8c.2-3.6 1-7 2-10Z" fill="#fff" opacity=".45" />
      </symbol>

      <symbol id="ico-target" viewBox="0 0 32 32">
        <Disc />
        <circle cx="16" cy="16" r="8.4" fill="none" stroke="url(#icoGold)" strokeWidth="2.2" />
        <circle cx="16" cy="16" r="3.6" fill="url(#icoGold)" />
      </symbol>

      <symbol id="ico-folder" viewBox="0 0 32 32">
        <Base cy={19} r={12} />
        <path d="M3.4 7.4a2.4 2.4 0 0 1 2.4-2.4h6.4l3 3.6h11.4a2.4 2.4 0 0 1 2.4 2.4v14.6a2.4 2.4 0 0 1-2.4 2.4H5.8a2.4 2.4 0 0 1-2.4-2.4Z" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M3.8 13.6h24.4v11.4a2.4 2.4 0 0 1-2.4 2.4H6.2a2.4 2.4 0 0 1-2.4-2.4Z" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M6.2 14.6h19.6a1.4 1.4 0 0 1 1.4 1.4v1H4.8v-1a1.4 1.4 0 0 1 1.4-1.4Z" fill="#fff" opacity=".35" />
      </symbol>

      <symbol id="ico-globe" viewBox="0 0 32 32">
        <Disc />
        <path d="M3.2 16h25.6M16 3c3.4 3.6 5.2 8.1 5.2 13S19.4 25.4 16 29c-3.4-3.6-5.2-8.1-5.2-13S12.6 6.6 16 3Z" fill="none" stroke="url(#icoGold)" strokeWidth="1.8" />
        <path d="M5.6 9.4c2.9 1.7 6.5 2.6 10.4 2.6s7.5-.9 10.4-2.6M5.6 22.6c2.9-1.7 6.5-2.6 10.4-2.6s7.5.9 10.4 2.6" fill="none" stroke="url(#icoGold)" strokeWidth="1.6" strokeLinecap="round" />
      </symbol>

      <symbol id="ico-bell" viewBox="0 0 32 32">
        <Base cy={19.4} r={11.4} />
        <path d="M16 2.6a2.2 2.2 0 0 1 2.2 2.2v1a8.8 8.8 0 0 1 6.6 8.5v5.1l2.8 4.4H4.4l2.8-4.4v-5.1a8.8 8.8 0 0 1 6.6-8.5v-1A2.2 2.2 0 0 1 16 2.6Z" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M12.4 25.8h7.2a3.6 3.6 0 0 1-7.2 0Z" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M13 7.4c-2.4 1.4-3.8 3.8-3.8 6.6v4.4l-1 1.6V14c0-3 1.8-5.6 4.8-6.6Z" fill="#fff" opacity=".45" />
      </symbol>

      <symbol id="ico-bulb" viewBox="0 0 32 32">
        <Base cy={19.4} r={10.6} />
        <path d="M16 2.4a9.6 9.6 0 0 1 5.8 17.2c-1 .8-1.6 1.8-1.6 3v1.2h-8.4v-1.2c0-1.2-.6-2.2-1.6-3A9.6 9.6 0 0 1 16 2.4Z" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M11.8 25.4h8.4v1.8a2.4 2.4 0 0 1-2.4 2.4h-3.6a2.4 2.4 0 0 1-2.4-2.4Z" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M13.4 5.2A7.4 7.4 0 0 0 9 12c0 .6-1.8.6-1.8 0a9.2 9.2 0 0 1 5.4-8.2Z" fill="#fff" opacity=".5" />
      </symbol>

      <symbol id="ico-clock" viewBox="0 0 32 32">
        <Disc />
        <circle cx="16" cy="16" r="9" fill="#e8f1ff" opacity=".9" stroke="#0e3374" strokeWidth="1" />
        <path d="M16 9.6V16l4.6 3" fill="none" stroke="url(#icoGold)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16" cy="16" r="1.6" fill="#8a5609" />
      </symbol>

      <symbol id="ico-person" viewBox="0 0 32 32">
        <Base cy={19.4} r={11.8} />
        <circle cx="16" cy="9.6" r="6.2" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="1.1" />
        <path d="M3.8 29.4a12.2 12.2 0 0 1 24.4 0Z" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M13.4 4.4a6.2 6.2 0 0 0-3.4 4.6c-.2.8-1.6.6-1.4-.4a6.4 6.4 0 0 1 4.8-4.8Z" fill="#fff" opacity=".5" />
      </symbol>

      <symbol id="ico-people" viewBox="0 0 32 32">
        <Base cy={20} r={12} />
        <circle cx="23.2" cy="10.6" r="5" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" />
        <path d="M14 28.4a9.4 9.4 0 0 1 18.4 0Z" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" strokeLinejoin="round" />
        <circle cx="11.4" cy="9.6" r="6" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="1.1" />
        <path d="M-.2 28.6a11.6 11.6 0 0 1 23.2 0Z" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="1.1" strokeLinejoin="round" />
      </symbol>

      <symbol id="ico-mouse" viewBox="0 0 32 32">
        <Base cy={19} r={10.6} />
        <rect x="8.4" y="2.6" width="15.2" height="26.8" rx="7.6" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" />
        <path d="M16 8v5.2" stroke="url(#icoGold)" strokeWidth="3" strokeLinecap="round" />
        <path d="M11.6 5.4a6 6 0 0 0-2 4.4v6c0 .8-1.4.8-1.4 0v-6a7.4 7.4 0 0 1 2.6-5.6Z" fill="#fff" opacity=".4" />
      </symbol>

      <symbol id="ico-frame" viewBox="0 0 32 32">
        <Base cy={18} r={12.4} />
        <rect x="2.6" y="5.4" width="26.8" height="21.2" rx="3" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" />
        <rect x="6.6" y="9.4" width="18.8" height="13.2" rx="1.8" fill="#0b2a63" opacity=".4" />
        <rect x="6.6" y="18" width="18.8" height="4.6" rx="1.4" fill="url(#icoGold)" />
        <path d="M5 6.4h22a1.4 1.4 0 0 1 1.4 1.4v1.2H3.6V7.8A1.4 1.4 0 0 1 5 6.4Z" fill="#fff" opacity=".24" />
      </symbol>

      <symbol id="ico-text" viewBox="0 0 32 32">
        <Base cy={18.4} r={12.4} />
        <rect x="2.6" y="5.4" width="26.8" height="21.2" rx="3" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" />
        <path d="M9 11.6h14M16 11.6v9.4" fill="none" stroke="url(#icoGold)" strokeWidth="3" strokeLinecap="round" />
        <path d="M5 6.4h22a1.4 1.4 0 0 1 1.4 1.4v1.2H3.6V7.8A1.4 1.4 0 0 1 5 6.4Z" fill="#fff" opacity=".24" />
      </symbol>

      <symbol id="ico-phone" viewBox="0 0 32 32">
        <Base cy={19} r={10.2} />
        <rect x="8.2" y="1.8" width="15.6" height="28.4" rx="3.4" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" />
        <rect x="10.4" y="5.6" width="11.2" height="19.4" rx="1.4" fill="#cfe2ff" opacity=".75" />
        <rect x="13.4" y="26.6" width="5.2" height="1.8" rx=".9" fill="url(#icoGold)" />
      </symbol>

      <symbol id="ico-screen" viewBox="0 0 32 32">
        <Base cy={18.4} r={12.4} />
        <rect x="2.4" y="4.6" width="27.2" height="18.8" rx="2.8" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" />
        <rect x="5" y="7.2" width="22" height="13.6" rx="1.4" fill="#cfe2ff" opacity=".7" />
        <path d="M11.6 27.4h8.8M16 23.4v4" stroke="url(#icoGold)" strokeWidth="2.6" strokeLinecap="round" />
      </symbol>

      <symbol id="ico-chart" viewBox="0 0 32 32">
        <Base cy={18.4} r={12.4} />
        <rect x="2.6" y="5.4" width="26.8" height="21.2" rx="3" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" />
        <g fill="url(#icoGold)">
          <rect x="7.4" y="16" width="3.8" height="6.6" rx="1.4" />
          <rect x="14.1" y="11.4" width="3.8" height="11.2" rx="1.4" />
          <rect x="20.8" y="8.4" width="3.8" height="14.2" rx="1.4" />
        </g>
      </symbol>

      <symbol id="ico-star" viewBox="0 0 32 32">
        <Base cy={18.6} r={11.8} />
        <path d="m16 2.2 4.3 8.7 9.6 1.4-6.9 6.8 1.6 9.5-8.6-4.5-8.6 4.5 1.6-9.5-6.9-6.8 9.6-1.4Z" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="m16 5.4 2.8 5.8-6.6 1Z" fill="#fff" opacity=".45" />
      </symbol>

      <symbol id="ico-tag" viewBox="0 0 32 32">
        <Base cy={18.4} r={12} />
        <path d="M3.4 4.4h11.2a2.4 2.4 0 0 1 1.7.7l12.6 12.6a2.4 2.4 0 0 1 0 3.4l-8.8 8.8a2.4 2.4 0 0 1-3.4 0L4.1 17.3a2.4 2.4 0 0 1-.7-1.7Z" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" strokeLinejoin="round" />
        <circle cx="10.4" cy="11.4" r="3.2" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="1" />
        <path d="M5.4 6.4h8.4l1.6 1.6H5.4Z" fill="#fff" opacity=".3" />
      </symbol>

      <symbol id="ico-shuffle" viewBox="0 0 32 32">
        <Disc />
        <path d="M9.4 11.4h3.2l6 9.2h3.6M9.4 20.6h3.2l2.2-3.4M20.6 11.4h1.8" fill="none" stroke="url(#icoGold)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20.6 8.4 23.8 11.4 20.6 14.4Zm0 9.2 3.2 3-3.2 3Z" {...goldRound} />
      </symbol>

      <symbol id="ico-crop" viewBox="0 0 32 32">
        <Disc />
        <path d="M10.6 5.4v16h16M5.4 10.6h16v16" fill="none" stroke="url(#icoGold)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      </symbol>

      <symbol id="ico-download" viewBox="0 0 32 32">
        <Disc />
        <path d="M16 8.6v9.8m0 0 4.4-4.4M16 18.4l-4.4-4.4M10.4 22.4h11.2" fill="none" stroke="url(#icoGold)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      </symbol>

      <symbol id="ico-upload" viewBox="0 0 32 32">
        <Disc />
        <path d="M16 22.4v-9.8m0 0 4.4 4.4M16 12.6l-4.4 4.4M10.4 9.2h11.2" fill="none" stroke="url(#icoGold)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      </symbol>

      <symbol id="ico-leaf" viewBox="0 0 32 32">
        <Base cy={19} r={11.4} />
        <path d="M27.4 4.6c1.6 11.4-4.2 19.4-13.4 19.4-4.6 0-8.2-2.8-8.2-7 0-8 8.4-12.8 21.6-12.4Z" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M26.4 5.6C18.6 10.4 12.2 18.2 8.4 28.6" fill="none" stroke="url(#icoGold)" strokeWidth="2.4" strokeLinecap="round" />
      </symbol>

      <symbol id="ico-menu" viewBox="0 0 32 32">
        <Disc />
        <path d="M9.6 11.6h12.8M9.6 16h12.8M9.6 20.4h12.8" fill="none" stroke="url(#icoGold)" strokeWidth="2.8" strokeLinecap="round" />
      </symbol>

      <symbol id="ico-archive" viewBox="0 0 32 32">
        <Base cy={19} r={11.8} />
        <rect x="3.4" y="4.6" width="25.2" height="6.6" rx="1.8" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="1.1" />
        <path d="M5.4 12.6h21.2v13.2a2.6 2.6 0 0 1-2.6 2.6H8a2.6 2.6 0 0 1-2.6-2.6Z" fill="url(#icoBlue)" stroke="#0e3374" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M12.6 17.4h6.8" stroke="url(#icoGold)" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M5.4 5.6h21.2a1 1 0 0 1 1 1v1.2H4.4V6.6a1 1 0 0 1 1-1Z" fill="#fff" opacity=".32" />
      </symbol>

      <symbol id="ico-dot" viewBox="0 0 32 32">
        <Disc />
        <circle cx="16" cy="16" r="4.6" fill="url(#icoGold)" stroke="#8a5609" strokeWidth="0.8" />
      </symbol>
    </svg>
  );
}
