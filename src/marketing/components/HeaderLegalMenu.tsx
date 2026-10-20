import { useEffect, useRef, useState } from "react";
import { navigate } from "../../lib/route";
import "./header-legal-menu.css";

export const HEADER_LEGAL_LINKS = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refunds", label: "Refund & Cancellation Policy" },
  { href: "/cookies", label: "Cookie Information" },
] as const;

export default function HeaderLegalMenu({ currentPath }: { currentPath?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activePath =
    currentPath ?? (typeof window === "undefined" ? "/" : window.location.pathname.replace(/\/+$/, "") || "/");
  const isLegalPage = HEADER_LEGAL_LINKS.some((item) => item.href === activePath);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      className={`mkt-nav-legal${open ? " is-open" : ""}`}
      ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={`mkt-nav-link mkt-nav-legal-trigger${open ? " is-open" : ""}${isLegalPage ? " is-active" : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="mkt-nav-legal-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <span>Legal</span>
        <span className="mkt-nav-legal-caret" aria-hidden="true" />
      </button>

      <div
        id="mkt-nav-legal-panel"
        className={`mkt-nav-legal-panel${open ? " is-open" : ""}`}
        role="menu"
        aria-label="Legal pages"
      >
        {HEADER_LEGAL_LINKS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            role="menuitem"
            className={`mkt-nav-legal-item${activePath === item.href ? " is-current" : ""}`}
            aria-current={activePath === item.href ? "page" : undefined}
            onClick={(e) => {
              if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented && e.button === 0) {
                e.preventDefault();
                setOpen(false);
                navigate(item.href);
              }
            }}
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}
