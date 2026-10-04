import { useEffect, useRef, useState } from "react";
import { navigate } from "../lib/route";
import { getInterfacePlan, signOut, useSession } from "../lib/session";
import "./site-corner-menu.css";

const PRODUCT_LINKS = [
  ["/", "Home"], ["/features", "Features"], ["/how-it-works", "How It Works"],
  ["/pricing", "Pricing"], ["/about", "About"], ["/manual", "Manual"], ["/faq", "FAQ"], ["/contact", "Contact"],
] as const;

export default function SiteCornerMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { signedIn, checking, name, account } = useSession();
  const interfacePlan = getInterfacePlan(account);
  const path = typeof window === "undefined" ? "/" : window.location.pathname;
  const inStudio = path === "/app" || path.startsWith("/app/");

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("mousedown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [open]);

  const go = (href: string) => { setOpen(false); navigate(href); };
  const openAccount = () => {
    setOpen(false);
    if (inStudio) window.dispatchEvent(new Event("scenering-open-account"));
    else navigate("/app?account=1");
  };

  return <div className="sc-corner" ref={ref}>
    <button className={`sc-corner-trigger${open ? " is-open" : ""}`} type="button" aria-expanded={open} aria-controls="sc-corner-panel" onClick={() => setOpen((value) => !value)}>
      <span className="sc-corner-bars" aria-hidden="true"><i /><i /><i /></span>
      <span>Menu</span>
      {signedIn && <em>{interfacePlan === "sceneforge" ? "Forge" : interfacePlan === "sceneflow" ? "Flow" : "Free"}</em>}
    </button>

    {open && <div className="sc-corner-panel" id="sc-corner-panel">
      <div className="sc-corner-head"><div className="sc-corner-mark" aria-hidden="true">S</div><div><b>Scenering</b><span>{signedIn ? `${name || "Your account"} · ${interfacePlan}${account?.user.role === "admin" && interfacePlan !== account.membership.plan_id ? " preview" : ""}` : "From idea to video"}</span></div></div>

      {!checking && (signedIn ? <div className="sc-corner-actions">
        {!inStudio && <button className="is-primary" onClick={() => go("/app")}>Open Studio</button>}
        {account?.user.role === "admin" && <button onClick={openAccount}>Owner administration</button>}
        <button onClick={openAccount}>Account, membership & billing</button>
        <button onClick={async () => { setOpen(false); await signOut(); navigate("/"); }}>Sign out</button>
      </div> : <div className="sc-corner-actions">
        <button className="is-primary" onClick={() => go("/register")}>Get Started Free</button>
        <button onClick={() => go("/login")}>Login</button>
      </div>)}

      <div className="sc-corner-separator" />
      <nav aria-label="Scenering pages" className="sc-corner-links">
        {PRODUCT_LINKS.map(([href, label]) => <button key={href} className={path === href ? "is-current" : ""} onClick={() => go(href)}><span>{label}</span>{path === href && <small>Current</small>}</button>)}
      </nav>

      <div className="sc-corner-legal"><button onClick={() => go("/privacy")}>Privacy</button><button onClick={() => go("/terms")}>Terms</button><button onClick={() => go("/cookies")}>Cookies</button></div>
    </div>}
  </div>;
}
