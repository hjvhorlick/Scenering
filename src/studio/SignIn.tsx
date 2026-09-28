import { useState, type FormEvent } from "react";
import {
  createProfile,
  forgetProfile,
  getProfileName,
  hasProfile,
  isStrongHashing,
  signIn,
} from "../lib/session";
import { navigate, SITE_PATH } from "../lib/route";
import logo from "../assets/scenering-logo.png";
import Icon from "../components/icons/Icon";
import IconSprite from "../components/icons/IconSprite";

/**
 * The door to the studio.
 *
 * Two states, decided by whether this machine already has a local sign-in:
 * set one up, or use it. The copy is careful not to imply an account exists
 * somewhere — there is no account server, and saying so plainly is better
 * than letting someone assume their work is backed up.
 */
export default function SignIn() {
  const existing = hasProfile();
  const [name, setName] = useState(getProfileName() ?? "");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (existing) {
        const ok = await signIn(passphrase);
        if (!ok) setError("That passphrase does not match the one saved on this machine.");
      } else {
        if (name.trim().length < 2) {
          setError("Tell Scenering what to call you — two characters is enough.");
        } else if (passphrase.length < 8) {
          setError("Use at least 8 characters. A short sentence works well.");
        } else if (passphrase !== confirm) {
          setError("The two passphrases are different.");
        } else {
          await createProfile(name, passphrase);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="si-page">
      <IconSprite />
      <header className="si-top">
        <img src={logo} alt="Scenering" height={30} style={{ height: 30, width: "auto" }} />
        <a className="si-back" href={SITE_PATH} onClick={(e) => { e.preventDefault(); navigate(SITE_PATH); }}>
          <Icon glyph="←" /> Back to the website
        </a>
      </header>

      <main className="si-center">
        <form className="si-card" onSubmit={onSubmit}>
          <span className="si-pill">Studio</span>

          <div>
            <h1>{existing ? `Welcome back, ${getProfileName()}.` : "Set up your sign-in."}</h1>
            <p style={{ marginTop: 8 }}>
              {existing
                ? "Enter your passphrase to open the studio."
                : "Scenering keeps your projects in this browser. Choose a name and a passphrase to keep the studio behind a door."}
            </p>
          </div>

          {!existing && (
            <div className="si-field">
              <label htmlFor="si-name">Your name</label>
              <input
                id="si-name"
                name="name"
                autoComplete="nickname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex"
              />
            </div>
          )}

          <div className="si-field">
            <label htmlFor="si-pass">Passphrase</label>
            <input
              id="si-pass"
              name="password"
              type="password"
              autoComplete={existing ? "current-password" : "new-password"}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder={existing ? "" : "At least 8 characters"}
            />
          </div>

          {!existing && (
            <div className="si-field">
              <label htmlFor="si-confirm">Passphrase again</label>
              <input
                id="si-confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          )}

          {error && <div className="si-error">{error}</div>}

          <button className="si-btn" type="submit" disabled={busy}>
            {busy ? "One moment…" : existing ? "Sign in" : "Create sign-in and open the studio"}
          </button>

          {existing &&
            (resetting ? (
              <div className="si-note">
                <b>There is no way to recover a forgotten passphrase.</b>
                <span>
                  Nothing was encrypted with it, so clearing it is safe: your projects, media and
                  settings stay exactly where they are. You will be asked to choose a new name and
                  passphrase.
                </span>
                <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
                  <button
                    type="button"
                    className="si-quiet"
                    onClick={() => {
                      forgetProfile();
                      setResetting(false);
                      setPassphrase("");
                    }}
                  >
                    Clear it and start again
                  </button>
                  <button type="button" className="si-quiet" onClick={() => setResetting(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="si-quiet" onClick={() => setResetting(true)}>
                Forgotten your passphrase?
              </button>
            ))}

          <div className="si-note">
            <b>What this sign-in is</b>
            <span>
              A lock on this machine. Scenering has no account server yet, so nothing is registered,
              nothing is sent anywhere and there is nobody to reset a password with. Your passphrase
              is not stored — only a {isStrongHashing() ? "SHA-256" : "hashed"} fingerprint of it,
              which is enough to check it against.
            </span>
            {!isStrongHashing() && (
              <span>
                This page is not on a secure origin, so the browser will not give Scenering real
                SHA-256. The fallback is weaker. Open the studio over https or on localhost for the
                proper one.
              </span>
            )}
          </div>
        </form>
      </main>

      <footer className="si-foot">
        Projects are saved in this browser. Accounts and billing are not live yet.
      </footer>
    </div>
  );
}
