import { useEffect, useRef, useState } from "react";
import { SITE_SECTIONS, goToSection, navigate } from "../lib/route";
import { getInterfacePlan, signOut, useSession } from "../lib/session";
import SocialLinksRow from "./SocialLinks";
import ApiKeysModal from "../components/ApiKeysModal";
import { useApiKeysConfigured } from "./api-key-status";
import "./site-corner-menu.css";

/**
 * The pages of the site. Separate from the FRONT-PAGE AREAS below: these are
 * documents, those are places on one long page.
 */
const PRODUCT_LINKS = [
  ["/", "Home"], ["/features", "Features"], ["/how-it-works", "How It Works"],
  ["/pricing", "Pricing"], ["/about", "About"], ["/manual", "Manual"], ["/faq", "FAQ"], ["/contact", "Contact"],
] as const;

export default function SiteCornerMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { signedIn, checking, name, account } = useSession();
  const interfacePlan = getInterfacePlan(account);
  const hasOwnKeys = useApiKeysConfigured();
  /**
   * The provider-key dialog, owned by the menu.
   *
   * The key button used to sit in the studio's top bar, where it took the width
   * of a button for something most people set once. It now lives here, beside
   * the account entries, and in the account & membership panel — the two places
   * a person goes to change how their studio works.
   */
  const [keysOpen, setKeysOpen] = useState(false);
  const path = typeof window === "undefined" ? "/" : window.location.pathname;
  const inStudio = path === "/app" || path.startsWith("/app/");
  /**
   * Where the provider-key dialog is offered: the studio and the owner's admin
   * pages — never the public website.
   *
   * The dialog stores keys for the studio's own tools (stock search, voiceover)
   * and is only wired into a surface that can save them. On the marketing pages
   * it was an entry that could be clicked and do nothing, which is exactly what
   * the owner reported: "it does not work when I am in the website sections,
   * but it works in the app". The website now offers navigation only; inside
   * the app the same keys also sit in Account, membership & billing.
   */
  const inAppArea = inStudio || path === "/admin" || path.startsWith("/admin/");

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("mousedown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [open]);

  const go = (href: string) => { setOpen(false); navigate(href); };
  /**
   * One click must always be enough. The intent is recorded BEFORE the event
   * or navigation, so if the studio is not listening yet (its chunk still
   * loading or its listener not registered), it finds the intent when it
   * mounts instead of the click silently vanishing — the "click Membership
   * twice before anything happens" bug.
   */
  const openAccount = (focus?: "admin") => {
    setOpen(false);
    try { window.sessionStorage.setItem("scenering_account_intent", focus || "account"); } catch { /* storage unavailable */ }
    if (inStudio) window.dispatchEvent(new CustomEvent("scenering-open-account", focus ? { detail: { focus } } : undefined));
    else navigate("/app?account=1");
  };

  return <div className="sc-corner" ref={ref}>
    <button
      className={`sc-corner-trigger${open ? " is-open" : ""}`}
      type="button"
      /* The name does not depend on the word being on screen: a phone renders
         the ☰ glyph alone and a screen reader still reads "Menu". */
      aria-label="Menu"
      aria-expanded={open}
      aria-controls="sc-corner-panel"
      onClick={() => setOpen((value) => !value)}
    >
      <span className="sc-corner-bars" aria-hidden="true"><i /><i /><i /></span>
      <span className="sc-corner-word">Menu</span>
      {signedIn && <em>{interfacePlan === "sceneforge" ? "Forge" : interfacePlan === "sceneflow" ? "Flow" : "Free"}</em>}
    </button>

    {open && <div className="sc-corner-panel" id="sc-corner-panel">
      {/* The panel's head carries the real wordmark rather than a letter in a
          box. The menu opens over whatever page you are on, including the
          studio, so it is the one place that has to say plainly whose menu
          this is. The mark is the same file the front page uses, served at
          two widths; the status line underneath still says who is signed in
          and on which plan. */}
      <div className="sc-corner-head">
        <img
          className="sc-corner-logo"
          src="/marketing/mark-scenering-240.webp"
          srcSet="/marketing/mark-scenering-120.webp 120w, /marketing/mark-scenering-240.webp 240w"
          sizes="128px"
          width={240}
          height={76}
          alt="Scenering"
          decoding="async"
        />
        <span>{signedIn ? `${name || "Your account"} · ${interfacePlan}${account?.user.role === "admin" && interfacePlan !== account.membership.plan_id ? " preview" : ""}` : "From idea to video"}</span>
      </div>

      {!checking && (signedIn ? <div className="sc-corner-actions">
        {!inStudio && <button className="is-primary" onClick={() => go("/app")}>Open Studio</button>}
        {account?.user.role === "admin" && <button onClick={() => go("/admin/email-centre")}>Email Centre</button>}
        {account?.user.role === "admin" && <button onClick={() => openAccount("admin")}>Owner administration</button>}
        <button onClick={() => openAccount()}>Account, membership & billing</button>
        {/* Personal Pexels, Pixabay and Speechify keys — optional, stored in
            this browser only. The label says whether any are saved, so the menu
            doubles as the status the studio's old key button showed with a dot.
            Offered in the app only: see inAppArea above. */}
        {inAppArea && <button
          onClick={() => { setOpen(false); setKeysOpen(true); }}
          title="Pexels, Pixabay and Speechify keys, stored in this browser"
        >
          API keys
          <small>{hasOwnKeys ? "Set" : "Not set"}</small>
        </button>}
        <button onClick={async () => { setOpen(false); await signOut(); navigate("/"); }}>Sign out</button>
      </div> : <div className="sc-corner-actions">
        <button className="is-primary" onClick={() => go("/register")}>Get Started Free</button>
        <button onClick={() => go("/login")}>Login</button>
      </div>)}

      <div className="sc-corner-separator" />
      <nav aria-label="Scenering pages" className="sc-corner-links">
        {PRODUCT_LINKS.map(([href, label]) => <button key={href} className={path === href ? "is-current" : ""} onClick={() => go(href)}><span>{label}</span>{path === href && <small>Current</small>}</button>)}
      </nav>

      {/* The front page explains each part of the studio in its own area;
          these go straight to one. They used to be feature NAMES pointing at
          separate marketing pages, so clicking "Captions" never took anyone
          to the captions area — now every one of them scrolls to the thing
          it names, from this page or any other. */}
      <div className="sc-corner-separator" />
      <nav aria-label="Front page sections" className="sc-corner-links sc-corner-sections">
        <b className="sc-corner-group">Jump to a section</b>
        {SITE_SECTIONS.map((section) => (
          <button key={section.id} onClick={() => { setOpen(false); goToSection(section.id); }}>
            <span>{section.label}</span>
          </button>
        ))}
      </nav>

      {/* The owner's configured social profiles — the same strip the public
          footers show, so the studio carries them too. Renders nothing until
          links are saved in Owner administration. */}
      <SocialLinksRow size={40} style={{ padding: "10px 14px 0" }} />
      <div className="sc-corner-legal"><button onClick={() => go("/privacy")}>Privacy</button><button onClick={() => go("/terms")}>Terms</button><button onClick={() => go("/cookies")}>Cookies</button></div>
    </div>}
    {/* Outside the panel on purpose: closing the menu (which happens the moment
        the entry above is clicked, and again whenever the panel loses focus)
        must not close the dialog the entry just opened. */}
    <ApiKeysModal isOpen={keysOpen} onClose={() => setKeysOpen(false)} />
  </div>;
}
