export type EmailTemplateKind = "verification" | "password_reset" | "subscription" | "security" | "training" | "marketing";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const SITE_URL = "https://scenering.com";
const SUPPORT_URL = `${SITE_URL}/contact`;

const EYEBROW: Record<EmailTemplateKind, string> = {
  verification: "ACCOUNT VERIFICATION",
  password_reset: "PASSWORD & SECURITY",
  subscription: "ACCOUNT UPDATE",
  security: "SECURITY NOTICE",
  training: "CREATOR TIPS",
  marketing: "SCENERING NEWS",
};

/** Escape data before placing it in an HTML email or an HTML attribute. */
export function escapeEmailHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function textToParagraphs(text: string): string {
  const normalized = String(text || "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return `<p style="margin:0;color:#475569;font-size:16px;line-height:1.7">There is no additional message.</p>`;
  return normalized.split(/\n{2,}/).map((paragraph) =>
    `<p style="margin:0 0 18px;color:#475569;font-size:16px;line-height:1.7">${escapeEmailHtml(paragraph).replace(/\n/g, "<br>")}</p>`,
  ).join("");
}

function emailFrame(options: {
  preheader: string;
  eyebrow: string;
  title: string;
  bodyHtml: string;
  kind: EmailTemplateKind;
}): string {
  const optionalEmailFooter = options.kind === "marketing" || options.kind === "training"
    ? `<p style="margin:0 0 12px;color:#64748b;font-size:12px;line-height:1.6">You are receiving optional Scenering updates. You can manage your email preferences in your <a href="${SITE_URL}/app" style="color:#5145cd;text-decoration:underline">Scenering account</a>.</p>`
    : `<p style="margin:0 0 12px;color:#64748b;font-size:12px;line-height:1.6">This is a service message about your Scenering account. Required account and security messages are separate from optional product news.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeEmailHtml(options.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f5fa;font-family:Arial,Helvetica,sans-serif;color:#182238;-webkit-text-size-adjust:100%;">
  <div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all">${escapeEmailHtml(options.preheader)}&#8203;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f3f5fa" style="width:100%;border-collapse:collapse;background-color:#f3f5fa">
    <tr><td align="center" style="padding:32px 14px">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:separate;border-spacing:0;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(21,32,58,.08)">
        <tr><td height="5" bgcolor="#6258e8" style="height:5px;background-color:#6258e8;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td bgcolor="#111a33" style="padding:24px 30px;background-color:#111a33">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse">
            <tr>
              <td width="42" height="42" align="center" valign="middle" bgcolor="#6258e8" style="width:42px;height:42px;border-radius:12px;background-color:#6258e8;color:#ffffff;font-size:21px;font-weight:800;line-height:42px">S</td>
              <td style="padding-left:12px">
                <div style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:.02em;line-height:1.2">Scenering</div>
                <div style="padding-top:4px;color:#b8c2dd;font-size:11px;letter-spacing:.12em;line-height:1.3;text-transform:uppercase">Turn your script into video</div>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:34px 34px 30px">
          <p style="margin:0 0 10px;color:#6258e8;font-size:11px;font-weight:700;letter-spacing:.14em;line-height:1.4">${escapeEmailHtml(options.eyebrow)}</p>
          <h1 style="margin:0 0 22px;color:#111a33;font-size:28px;font-weight:750;line-height:1.2;letter-spacing:-.02em">${escapeEmailHtml(options.title)}</h1>
          ${options.bodyHtml}
        </td></tr>
        <tr><td bgcolor="#f8f9fc" style="padding:22px 30px;background-color:#f8f9fc;border-top:1px solid #e9edf5">
          <p style="margin:0 0 8px;color:#182238;font-size:13px;font-weight:700;line-height:1.5">Need a hand?</p>
          <p style="margin:0 0 14px;color:#64748b;font-size:12px;line-height:1.6">Visit <a href="${SITE_URL}" style="color:#5145cd;text-decoration:underline">scenering.com</a> or <a href="${SUPPORT_URL}" style="color:#5145cd;text-decoration:underline">contact our team</a>.</p>
          ${optionalEmailFooter}
          <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.6">© Scenering · Create something worth watching.</p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;color:#94a3b8;font-size:11px;line-height:1.5">Sent by Scenering · <a href="${SITE_URL}" style="color:#64748b;text-decoration:underline">scenering.com</a></p>
    </td></tr>
  </table>
</body>
</html>`;
}

function textPreheader(text: string): string {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 140);
}

/** Branded HTML shell for account notices while preserving a plain-text body. */
export function buildBrandedTextEmail(kind: EmailTemplateKind, subject: string, text: string): RenderedEmail {
  return {
    subject,
    text,
    html: emailFrame({
      preheader: textPreheader(text) || subject,
      eyebrow: EYEBROW[kind],
      title: subject,
      bodyHtml: textToParagraphs(text),
      kind,
    }),
  };
}

function buildActionEmail(options: {
  kind: "verification" | "password_reset";
  name: string;
  url: string;
}): RenderedEmail {
  const recipient = String(options.name || "").trim() || "there";
  const verification = options.kind === "verification";
  const subject = verification ? "Verify your Scenering email" : "Reset your Scenering password";
  const title = verification ? "Let’s get you started" : "Reset your password";
  const preheader = verification
    ? "Confirm your email address to finish creating your Scenering account."
    : "Use the secure link to choose a new Scenering password.";
  const actionLabel = verification ? "Verify email address" : "Choose a new password";
  const validity = verification ? "This link expires in 24 hours." : "This link expires in one hour.";
  const intro = verification
    ? "Thanks for creating a Scenering account. Confirm your email address to finish setting it up."
    : "We received a request to reset the password for your Scenering account. Use the secure button below to choose a new one.";
  const safetyNote = verification
    ? "If you did not create this account, you can ignore this message."
    : "If you did not request a password reset, you can safely ignore this email. Your password will not change.";
  const safeUrl = safeHttpUrl(options.url);
  const button = safeUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0 22px;border-collapse:separate"><tr><td align="center" bgcolor="#6258e8" style="border-radius:9px;background-color:#6258e8"><a href="${escapeEmailHtml(safeUrl)}" style="display:inline-block;padding:14px 22px;border:1px solid #6258e8;border-radius:9px;color:#ffffff;font-size:15px;font-weight:700;line-height:1.2;text-decoration:none">${escapeEmailHtml(actionLabel)}</a></td></tr></table>`
    : `<p style="margin:22px 0;color:#9f1239;font-size:13px;line-height:1.6">We could not create a valid action link. Please request a new email from Scenering.</p>`;
  const fallbackLink = safeUrl
    ? `<p style="margin:0 0 8px;color:#64748b;font-size:12px;line-height:1.6">If the button does not work, copy and paste this link into your browser:</p><p style="margin:0 0 22px;color:#5145cd;font-size:12px;line-height:1.6;word-break:break-all"><a href="${escapeEmailHtml(safeUrl)}" style="color:#5145cd;text-decoration:underline;word-break:break-all">${escapeEmailHtml(safeUrl)}</a></p>`
    : "";
  const text = [
    `Hello ${recipient},`,
    intro,
    `${actionLabel}: ${safeUrl || options.url}`,
    validity,
    safetyNote,
    "— The Scenering team",
  ].join("\n\n");

  return {
    subject,
    text,
    html: emailFrame({
      preheader,
      eyebrow: EYEBROW[options.kind],
      title,
      bodyHtml: `<p style="margin:0 0 16px;color:#182238;font-size:16px;line-height:1.7">Hello ${escapeEmailHtml(recipient)},</p><p style="margin:0;color:#475569;font-size:16px;line-height:1.7">${escapeEmailHtml(intro)}</p>${button}${fallbackLink}<p style="margin:0 0 12px;color:#475569;font-size:13px;font-weight:700;line-height:1.6">${escapeEmailHtml(validity)}</p><p style="margin:0;color:#64748b;font-size:13px;line-height:1.6">${escapeEmailHtml(safetyNote)}</p>`,
      kind: options.kind,
    }),
  };
}

export function buildVerificationEmail(name: string, url: string): RenderedEmail {
  return buildActionEmail({ kind: "verification", name, url });
}

export function buildPasswordResetEmail(name: string, url: string): RenderedEmail {
  return buildActionEmail({ kind: "password_reset", name, url });
}
