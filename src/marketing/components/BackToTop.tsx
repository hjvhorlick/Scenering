import { useEffect, useRef, useState } from "react";
import Icon from "../../components/icons/Icon";

/**
 * Back to the top.
 *
 * The page is deliberately long — it is the whole product, in order — so
 * there has to be a way out of the bottom of it that is not a scroll
 * gesture. It appears once the hero is well out of sight and stays out of
 * the way until then.
 *
 * It does two things a plain `href="#top"` does not: it honours
 * `prefers-reduced-motion` (a smooth 12-screen scroll is unpleasant, and for
 * some people worse than that), and it puts keyboard focus back on the main
 * landmark, so tabbing after pressing it continues from the top of the page
 * rather than from wherever the reading position happened to be.
 */
export default function BackToTop() {
  const [shown, setShown] = useState(false);
  // The scroll handler runs on every frame of a flick; keep it from setting
  // state (and re-rendering the page) unless the answer actually changed.
  const shownRef = useRef(false);

  useEffect(() => {
    const update = () => {
      const past = window.scrollY > window.innerHeight * 1.2;
      if (past === shownRef.current) return;
      shownRef.current = past;
      setShown(past);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const toTop = () => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    // Reading order restarts at the top, so the keyboard should too.
    document.getElementById("main")?.focus({ preventScroll: true });
  };

  return (
    <button
      type="button"
      className={`mkt-totop${shown ? " is-shown" : ""}`}
      onClick={toTop}
      // Out of the tab order until it is on screen: a button nobody can see
      // should not be a stop on the way to the footer.
      tabIndex={shown ? 0 : -1}
      aria-hidden={shown ? undefined : true}
    >
      <span aria-hidden="true"><Icon glyph="↑" /></span>
      <span className="mkt-totop-word">Top</span>
      <span className="mkt-sr">Back to the top of the page</span>
    </button>
  );
}
