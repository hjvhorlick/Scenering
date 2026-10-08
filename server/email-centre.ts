import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { sendMarketingEmail } from "./email.ts";
import { env } from "../src/env.ts";
import { db, EMAIL_TEMPLATE_CATEGORIES, type EmailAudienceFilter, type EmailAudienceType, type EmailCampaign, type EmailRecipient, type EmailTemplate, type User } from "../src/db.ts";
import { findSession, platformRateLimit, publicBaseUrl, requirePlatformAdmin, signEmailPreferenceToken, verifyEmailPreferenceToken } from "./platform.ts";

/**
 * The Admin Email Centre — marketing mail for Scenering.
 *
 * Scope and separation
 * --------------------
 * Everything in this file is *marketing* mail: the campaigns an
 * administrator composes from branded templates and sends to a
 * consent-holding audience. Transactional mail (email verification,
 * password resets, security notices, billing and account notifications)
 * lives in server/platform.ts + server/email.ts's sendTransactionalEmail
 * and is deliberately untouched here — a verification link or a receipt
 * must never depend on a marketing preference, and a campaign must never
 * be able to pose as one. The only shared code is the provider adapter.
 *
 * Safety properties
 * -----------------
 * - Consent is the gate: every audience SQL fragment joins
 *   email_preferences with marketing_consent = 1. Unsubscribed and
 *   never-consented accounts cannot be selected; deleted accounts are
 *   absent from `users` (cascades) and malformed addresses are filtered
 *   twice (SQL prefilter + per-recipient validation).
 * - Templates are HTML, but only a sanitised subset survives rendering:
 *   an allowlist of tags/attributes/CSS properties, no scripts, no
 *   inline event handlers, no javascript:/data: URLs. Variable values
 *   are HTML-escaped before insertion, so recipient-supplied text can
 *   never inject markup.
 * - Sending is queued and batched. POST /send marks the campaign
 *   'sending' via a conditional status transition (two racing
 *   invocations cannot both win) and delivers the first bounded batch;
 *   the Worker's Cron Trigger drains the rest a batch at a time, and the
 *   admin UI's "continue" calls do the same while the page is open. Each
 *   delivery row is claimed (pending → sent) before its provider call,
 *   so no recipient is emailed twice even when the drainers race.
 * - Test sends render through the identical pipeline, are visually
 *   bannered "[Test]" and create no delivery rows — they can never count
 *   as campaign deliveries.
 */

type AdminAuth = { user: User };
/** The KV-backed limiter every platform endpoint uses (see
 *  platformRateLimit) — the Email Centre's routes are under the same
 *  protection, keyed to the admin's account (or IP pre-auth). */
const rateLimit = platformRateLimit;

const nowIso = () => new Date().toISOString();
const EMAIL_RE = /^\S+@\S+\.\S+$/;
function isValidEmail(value: string): boolean {
  return typeof value === "string" && value.length <= 254 && EMAIL_RE.test(value) && !/\s/.test(value);
}
function bad(res: Response, message: string) { return res.status(400).json({ error: message }); }
function asyncHandlerVoid(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next); };
}
const adminOf = (req: Request): User => ((req as any).auth as AdminAuth).user;

/** Absolute base for links inside email. Production always has
 *  PUBLIC_APP_URL; the request-derived fallback keeps local `wrangler dev`
 *  links clickable. The cron path (no request) falls back to the var or
 *  localhost. */
function emailBaseUrl(req?: Request): string {
  const configured = String(env().PUBLIC_APP_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (req) return publicBaseUrl(req).replace(/\/+$/, "");
  return "http://localhost:8787";
}

// ---------------------------------------------------------------------------
// Template variables
// ---------------------------------------------------------------------------

/** The only variables templates may use. Values are computed per recipient
 *  at render time — never author-supplied — and everything user-derived is
 *  escaped before it touches HTML. */
export const EMAIL_TEMPLATE_VARIABLES = [
  { key: "{{first_name}}", label: "First name", description: "The recipient's first name. Falls back to \"there\"." },
  { key: "{{display_name}}", label: "Display name", description: "The recipient's full display name. Falls back to \"Scenering member\"." },
  { key: "{{email}}", label: "Email address", description: "The recipient's email address." },
  { key: "{{unsubscribe_url}}", label: "Unsubscribe link", description: "One-click link that opts this recipient out of marketing mail." },
  { key: "{{preferences_url}}", label: "Preferences link", description: "Signed link to this recipient's email-preference page." },
  { key: "{{current_year}}", label: "Current year", description: "The current four-digit year." },
] as const;

function escapeHtml(value: string): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
/** Recipient values are never trusted: control characters are stripped
 *  (they have no business in a name or a subject) before use anywhere. */
function cleanValue(value: string): string {
  return String(value).replace(/[\x00-\x1F\x7F]/g, "").trim();
}

interface EmailVariables { first_name: string; display_name: string; email: string; unsubscribe_url: string; preferences_url: string; current_year: string }

function emailVariables(recipient: EmailRecipient, linkUserId: string | null, base: string): EmailVariables {
  const displayName = cleanValue(recipient.displayName || "");
  const firstName = displayName.split(/\s+/)[0] || "";
  const token = linkUserId ? signEmailPreferenceToken(linkUserId) : "";
  return {
    first_name: firstName || "there",
    display_name: displayName || "Scenering member",
    email: recipient.email,
    unsubscribe_url: token ? `${base}/unsubscribe?token=${encodeURIComponent(token)}` : `${base}/email-preferences`,
    preferences_url: token ? `${base}/email-preferences?token=${encodeURIComponent(token)}` : `${base}/email-preferences`,
    current_year: String(new Date().getUTCFullYear()),
  };
}

const VARIABLE_PATTERN = /\{\{\s*(first_name|display_name|email|unsubscribe_url|preferences_url|current_year)\s*\}\}/g;
/** HTML context: every value is entity-escaped on the way in. */
function interpolateHtml(text: string, vars: EmailVariables): string {
  return String(text).replace(VARIABLE_PATTERN, (_match, key: string) => escapeHtml((vars as any)[key] ?? ""));
}
/** Plain-text/subject context: values render as words — control characters
 *  and any HTML tags in a display name are removed, so a subject line can
 *  never end up carrying literal markup. */
function plainTextValue(value: string): string {
  return cleanValue(value).replace(/<[^>]*>/g, "");
}
function interpolateText(text: string, vars: EmailVariables): string {
  return String(text).replace(VARIABLE_PATTERN, (_match, key: string) => plainTextValue((vars as any)[key] ?? ""));
}

// ---------------------------------------------------------------------------
// HTML sanitiser — the render-time allowlist
// ---------------------------------------------------------------------------

const ALLOWED_TAGS = new Set([
  "p", "br", "div", "span", "h1", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s",
  "ul", "ol", "li", "a", "blockquote", "hr", "img", "table", "thead", "tbody", "tfoot",
  "tr", "td", "th", "caption", "center", "small", "font",
]);
const GLOBAL_ATTRS = new Set(["style", "align", "valign", "width", "height", "bgcolor", "title", "dir"]);
const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel", "class"]),
  img: new Set(["src", "alt", "class"]),
  font: new Set(["color", "face", "size"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
};
const ALLOWED_CSS_PROPERTIES = new Set([
  "color", "background", "background-color", "font-size", "font-weight", "font-style", "font-family",
  "text-align", "text-decoration", "text-transform", "line-height", "letter-spacing", "word-spacing",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border", "border-top", "border-right", "border-bottom", "border-left", "border-color", "border-width", "border-style", "border-radius",
  "width", "max-width", "min-width", "height", "max-height", "display", "vertical-align", "white-space", "word-break",
]);

/** Tags whose *content* is dangerous and is removed with the tag itself. */
const BLOCKED_WITH_CONTENT = /<(script|style|iframe|object|applet|noscript|template|svg|math|form|textarea|select|button)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
/** Leftovers of dangerous tags that never paired (or are void). */
const BLOCKED_TAGS = /<\/?(?:script|style|iframe|object|embed|applet|noscript|template|svg|math|form|input|button|link|meta|base|area|source|track|param|frame|frameset)\b[^>]*>/gi;
const ANY_TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
const NUMERIC_ATTRS = new Set(["width", "height", "colspan", "rowspan", "size"]);

function sanitizeStyleDeclaration(value: string): string {
  const kept: string[] = [];
  for (const declaration of String(value).split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 1) continue;
    const prop = declaration.slice(0, colon).trim().toLowerCase();
    const val = declaration.slice(colon + 1).trim();
    if (!prop || !val) continue;
    if (!ALLOWED_CSS_PROPERTIES.has(prop)) continue;
    // No expressions, behaviours, imports or url() — the classic CSS vectors.
    if (/expression\s*\(|javascript\s*:|behavior\s*:|@import|url\s*\(/i.test(val)) continue;
    if (/[{}<>]/.test(val)) continue;
    kept.push(`${prop}: ${val}`);
  }
  return kept.join("; ");
}

function safeUrl(value: string, base: string): string | null {
  // Control characters are stripped first so "java\tscript:" cannot disguise
  // a scheme, then the scheme itself is checked against an allowlist.
  const cleaned = String(value).replace(/[\x00-\x1F\x7F]/g, "").trim();
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("vbscript:") || lower.startsWith("data:") || lower.startsWith("file:")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(cleaned)) return lower.startsWith("http:") || lower.startsWith("https:") || lower.startsWith("mailto:") || lower.startsWith("tel:") ? cleaned : null;
  if (cleaned.startsWith("//")) return null;
  if (cleaned.startsWith("/")) return `${base}${cleaned}`;
  if (cleaned.startsWith("#")) return cleaned;
  return null; // relative fragments have no meaning inside an email
}

/**
 * Rebuilds template HTML from scratch, keeping only allowlisted tags with
 * allowlisted attributes and allowlisted CSS. Anything else — scripts,
 * event handlers, unknown tags, javascript:/data: URLs, exotic CSS — is
 * dropped. Text between removed tags survives (except for the
 * content-dangerous tags above), so an over-eager tag costs formatting,
 * never content.
 */
export function sanitizeEmailHtml(html: string, base: string): string {
  let output = String(html || "");
  output = output.replace(/<!--[\s\S]*?-->/g, "");
  output = output.replace(BLOCKED_WITH_CONTENT, "");
  output = output.replace(BLOCKED_TAGS, "");
  return output.replace(ANY_TAG, (_match, closing: string, rawName: string, rawAttrs: string) => {
    const tag = String(rawName).toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (closing) return `</${tag}>`;
    const allowed = new Set([...GLOBAL_ATTRS, ...(TAG_ATTRS[tag] || [])]);
    const kept: string[] = [];
    let hasHref = false;
    for (const attrMatch of String(rawAttrs || "").matchAll(ATTR)) {
      const name = String(attrMatch[1] || "").toLowerCase();
      let value = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";
      if (!allowed.has(name)) continue;
      if (name === "href" || name === "src") {
        const resolved = safeUrl(String(value), base);
        if (!resolved) continue;
        value = resolved;
        if (name === "href") hasHref = true;
      } else if (name === "style") {
        const sanitized = sanitizeStyleDeclaration(String(value));
        if (!sanitized) continue;
        value = sanitized;
      } else if (NUMERIC_ATTRS.has(name)) {
        const trimmed = String(value).trim();
        if (!/^\d+%?$/.test(trimmed)) continue;
        value = trimmed;
      } else {
        value = String(value);
      }
      kept.push(`${name}="${escapeHtml(String(value)).replace(/"/g, "&quot;")}"`);
    }
    if (tag === "a") {
      if (hasHref) {
        kept.push('target="_blank"', 'rel="noopener noreferrer"');
        // class is only ever a rendering hint (the cta button transform
        // below); it carries no styling by itself.
      }
    }
    if (tag === "img" && !kept.some((attr) => attr.startsWith("alt="))) kept.push('alt=""');
    return `<${tag}${kept.length ? " " + kept.join(" ") : ""}>`;
  });
}

// ---------------------------------------------------------------------------
// Branded layout
// ---------------------------------------------------------------------------

const BRAND = {
  primary: "#6366f1",
  primaryDark: "#4f46e5",
  page: "#eef0f6",
  card: "#ffffff",
  ink: "#1f2937",
  muted: "#64748b",
  hairline: "#e2e8f0",
} as const;
const EMAIL_FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
const CTA_BUTTON_STYLE = `display:inline-block;background-color:${BRAND.primary};color:#ffffff;font-family:${EMAIL_FONT};font-size:15px;font-weight:700;line-height:1.2;text-decoration:none;border-radius:10px;padding:14px 30px;margin:10px 0;`;

/** Turns `<a class="cta" href="…">` links into real, email-safe buttons —
 *  inline styles only, no CSS classes exist inside an email. */
function applyCtaButtonStyles(html: string): string {
  return html.replace(/<a\b([^>]*)>/gi, (match, attrs: string) => {
    if (!/class="[^"]*\bcta\b[^"]*"/i.test(attrs)) return match;
    return `<a${attrs.replace(/\s*style="[^"]*"/i, "").replace(/\s*class="[^"]*"/i, "")} style="${CTA_BUTTON_STYLE}">`;
  });
}

export interface RenderedEmail { subject: string; html: string; text: string }

interface LayoutOptions {
  subject: string;
  preheader: string;
  bodyHtml: string;
  heroImageUrl: string | null;
  base: string;
  unsubscribeUrl: string;
  preferencesUrl: string;
  isTest: boolean;
}

/**
 * The one Scenering email layout: table-based, inline-styled, 600px
 * max-width card that reflows on phones (no external CSS — email clients
 * strip <style> blocks and many never load them). Logo header, optional
 * hero image, content, call-to-action, and a footer carrying the contact
 * route, the business identification, and the legally required
 * unsubscribe / manage-preferences links.
 */
function renderSceneringLayout(options: LayoutOptions): string {
  const { subject, preheader, bodyHtml, heroImageUrl, base, unsubscribeUrl, preferencesUrl, isTest } = options;
  const year = new Date().getUTCFullYear();
  const hero = heroImageUrl
    ? `<tr><td style="padding:0;"><a href="${escapeHtml(base)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;"><img src="${escapeHtml(heroImageUrl)}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></a></td></tr>`
    : "";
  const hasOwnCta = /style="[^"]*background-color:\s*#6366f1/i.test(bodyHtml) || /<a[^>]*style="[^"]*display:inline-block/i.test(bodyHtml);
  const cta = hasOwnCta ? "" : `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:14px 32px 34px;">
        <a href="${escapeHtml(base)}/app" target="_blank" rel="noopener noreferrer" style="${CTA_BUTTON_STYLE}">Open Scenering</a>
      </td></tr></table>`;
  const testBanner = isTest ? `
      <tr><td align="center" style="padding:0 0 14px;">
        <span style="display:inline-block;background-color:#fef3c7;color:#92400e;border:1px solid #f59e0b;border-radius:999px;font-family:${EMAIL_FONT};font-size:12px;font-weight:700;padding:6px 16px;">Test email — never delivered to a campaign audience</span>
      </td></tr>` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.page};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.page};">${escapeHtml(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.page};">
<tr><td align="center" style="padding:28px 12px 40px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">${testBanner}
<tr><td style="background-color:${BRAND.card};border:1px solid ${BRAND.hairline};border-radius:14px;overflow:hidden;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:26px 32px 18px;">
      <a href="${escapeHtml(base)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">
        <img src="${escapeHtml(base)}/scenering-logo.png" alt="Scenering" width="164" style="display:block;width:164px;max-width:70%;height:auto;border:0;">
      </a>
    </td></tr>
  </table>${hero}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td class="scn-body" style="padding:6px 32px 6px;font-family:${EMAIL_FONT};font-size:16px;line-height:1.65;color:${BRAND.ink};">
${bodyHtml}
    </td></tr>
  </table>${cta}
</td></tr>
<tr><td style="padding:22px 16px 0;font-family:${EMAIL_FONT};font-size:12px;line-height:1.7;color:${BRAND.muted};text-align:center;">
  You are receiving this message because you opted in to product news from Scenering.<br>
  <a href="${escapeHtml(preferencesUrl)}" target="_blank" rel="noopener noreferrer" style="color:${BRAND.primary};text-decoration:underline;">Manage your email preferences</a>
  &nbsp;·&nbsp;
  <a href="${escapeHtml(unsubscribeUrl)}" target="_blank" rel="noopener noreferrer" style="color:${BRAND.primary};text-decoration:underline;">Unsubscribe</a><br>
  Questions? <a href="${escapeHtml(base)}/contact" target="_blank" rel="noopener noreferrer" style="color:${BRAND.primary};text-decoration:underline;">Contact Scenering support</a><br>
  <span style="color:${BRAND.muted};">© ${year} Henry John Vincent Horlick · Horlick Group · Scenering</span>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** HTML → readable plain text, for the text fallback of templates that did
 *  not author one. Structure survives (headings, lists, links' text);
 *  markup does not. */
export function htmlToPlainText(html: string): string {
  let text = String(html || "");
  text = text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<li\b[^>]*>/gi, "• ");
  text = text.replace(/<\/(p|div|h1|h2|h3|h4|li|tr|blockquote|table|ul|ol)\s*>/gi, "\n\n");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function kindForTemplate(template: EmailTemplate): "marketing" | "training" {
  return template.category === "training" ? "training" : "marketing";
}
function resolveHeroUrl(heroImageUrl: string | null | undefined, base: string): string | null {
  const value = String(heroImageUrl || "").trim();
  if (!value) return null;
  if (/^https:\/\//i.test(value)) return value;
  if (/^https?:\/\//i.test(value)) return null; // plain http heroes are dropped: mixed content is blocked by clients
  if (value.startsWith("/") && !value.startsWith("//")) return `${base}${value}`;
  return null;
}

/** Renders one campaign message for one recipient. The same path serves
 *  previews (sample recipient), tests (banner + subject prefix, no
 *  delivery rows) and real sends. */
export function renderCampaignMessage(input: {
  template: EmailTemplate;
  campaignSubject: string;
  recipient: EmailRecipient;
  /** Whose account the unsubscribe/preferences tokens point at — the
   *  recipient for real sends, the reviewing admin for tests/previews. */
  linkUserId: string | null;
  base: string;
  isTest: boolean;
}): RenderedEmail {
  const { template, campaignSubject, recipient, linkUserId, base, isTest } = input;
  const vars = emailVariables(recipient, linkUserId, base);
  const subjectBase = interpolateText(String(campaignSubject || template.subject || ""), vars) || "(no subject)";
  const subject = isTest ? `[Test] ${subjectBase}` : subjectBase;
  const preheader = interpolateText(template.preheader || "", vars);
  const sanitizedBody = applyCtaButtonStyles(sanitizeEmailHtml(interpolateHtml(template.htmlBody || "", vars), base));
  const textBody = String(template.textBody || "").trim()
    ? interpolateText(template.textBody, vars)
    : htmlToPlainText(sanitizedBody);
  const footer = [
    isTest ? "[Test email — no campaign audience received this message]" : "",
    "—",
    "Scenering — turn ideas, scripts and audio into polished faceless videos.",
    `Manage your email preferences: ${vars.preferences_url}`,
    `Unsubscribe from marketing email: ${vars.unsubscribe_url}`,
    `Contact Scenering support: ${base}/contact`,
    `© ${vars.current_year} Henry John Vincent Horlick · Horlick Group · Scenering`,
  ].filter(Boolean).join("\n");
  return {
    subject,
    html: renderSceneringLayout({
      subject, preheader, bodyHtml: sanitizedBody,
      heroImageUrl: resolveHeroUrl(template.heroImageUrl, base),
      base, unsubscribeUrl: vars.unsubscribe_url, preferencesUrl: vars.preferences_url, isTest,
    }),
    text: `${textBody.trim()}\n\n${footer}`,
  };
}

// ---------------------------------------------------------------------------
// Audiences
// ---------------------------------------------------------------------------

export const EMAIL_AUDIENCE_TYPES: Array<{ value: EmailAudienceType; label: string }> = [
  { value: "all_consented", label: "All marketing-consented users" },
  { value: "free_plan", label: "Free-plan users" },
  { value: "paid_plan", label: "Paid-plan users" },
  { value: "registered_range", label: "Users registered within a date range" },
  { value: "training_step", label: "Users at a selected training step" },
  { value: "manual", label: "Manually selected users" },
  { value: "test_recipient", label: "Test recipient only" },
];

const TRAINING_STEP_LABELS = [
  "Welcome", "Getting Started", "Create Your First Project", "Understanding Scenes", "Finding Visuals",
  "Voice Over", "Captions", "Video Studio", "Rendering", "Advanced Features",
];

export function describeAudience(type: string, filter: EmailAudienceFilter): string {
  switch (type) {
    case "all_consented": return "All users with marketing consent";
    case "free_plan": return "Free-plan users with marketing consent";
    case "paid_plan": return "Paid-plan users with marketing consent";
    case "registered_range": {
      const from = filter.registeredFrom ? filter.registeredFrom.slice(0, 10) : "the beginning";
      const to = filter.registeredTo ? filter.registeredTo.slice(0, 10) : "today";
      return `Marketing-consented users registered ${from} → ${to}`;
    }
    case "training_step": {
      const step = Math.max(0, Math.trunc(Number(filter.trainingStep) || 0));
      return `Marketing-consented users at training step ${step}${TRAINING_STEP_LABELS[step] ? ` (${TRAINING_STEP_LABELS[step]})` : ""}`;
    }
    case "manual": return `${(filter.userIds || []).length} manually selected user${(filter.userIds || []).length === 1 ? "" : "s"} (consent still required)`;
    case "test_recipient": return `Test recipient only (${String(filter.testEmail || "no address set")})`;
    default: return "Unknown audience";
  }
}

/** date-only bounds become start-of-day / end-of-day so a "registered in
 *  March" range includes March 31st (stored timestamps are full ISO). */
function normalizeDateBound(value: string, edge: "start" | "end"): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return edge === "start" ? `${raw}T00:00:00.000Z` : `${raw}T23:59:59.999Z`;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function parseAudienceFilter(type: string, body: any): { filter: EmailAudienceFilter } | { error: string } {
  const filter: EmailAudienceFilter = {};
  if (type === "registered_range") {
    const from = normalizeDateBound(String(body?.registeredFrom || body?.filter?.registeredFrom || ""), "start");
    const to = normalizeDateBound(String(body?.registeredTo || body?.filter?.registeredTo || ""), "end");
    if (from) filter.registeredFrom = from;
    if (to) filter.registeredTo = to;
    if (filter.registeredFrom && filter.registeredTo && filter.registeredFrom > filter.registeredTo) return { error: "The registration date range is reversed." };
  } else if (type === "training_step") {
    const step = Number(body?.trainingStep ?? body?.filter?.trainingStep ?? 0);
    if (!Number.isInteger(step) || step < 0 || step > TRAINING_STEP_LABELS.length - 1) return { error: `Training step must be between 0 and ${TRAINING_STEP_LABELS.length - 1}.` };
    filter.trainingStep = step;
  } else if (type === "manual") {
    const ids = Array.isArray(body?.userIds) ? body.userIds : Array.isArray(body?.filter?.userIds) ? body.filter.userIds : [];
    const clean = ids.filter((id: unknown) => typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id)).slice(0, 50);
    if (clean.length === 0) return { error: "Select at least one user for a manual audience (up to 50)." };
    filter.userIds = clean;
  } else if (type === "test_recipient") {
    const email = String(body?.testEmail || body?.filter?.testEmail || "").trim().toLowerCase();
    if (!isValidEmail(email)) return { error: "Enter a valid test recipient email address." };
    filter.testEmail = email;
  }
  return { filter };
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const TEMPLATE_LIMITS = { name: 120, description: 500, subject: 200, preheader: 200, htmlBody: 100000, textBody: 50000, heroImageUrl: 500 };

function parseHeroImageUrl(value: unknown): string | null | { error: string } {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.length > TEMPLATE_LIMITS.heroImageUrl) return { error: "The hero image URL is too long." };
  if (/^https:\/\/\S+$/i.test(raw) || (/^\//.test(raw) && !raw.startsWith("//"))) return raw;
  return { error: "The hero image must be an https:// URL or a site path starting with /." };
}

function parseTemplateInput(body: any, options: { lenient?: boolean }): { value: Omit<EmailTemplate, "id" | "createdBy" | "createdAt" | "updatedAt" | "archivedAt" | "status"> } | { error: string } {
  const lenient = Boolean(options.lenient);
  const name = String(body?.name ?? "").trim();
  const subject = String(body?.subject ?? "").trim();
  const htmlBody = String(body?.htmlBody ?? body?.html_body ?? "");
  if (!lenient) {
    if (name.length < 1 || name.length > TEMPLATE_LIMITS.name) return { error: `The template name must be 1–${TEMPLATE_LIMITS.name} characters.` };
    if (subject.length < 1 || subject.length > TEMPLATE_LIMITS.subject) return { error: `The subject must be 1–${TEMPLATE_LIMITS.subject} characters.` };
    if (!htmlBody.trim()) return { error: "The HTML body is required." };
  } else if (name.length > TEMPLATE_LIMITS.name || subject.length > TEMPLATE_LIMITS.subject) {
    return { error: "A field is too long to preview." };
  }
  const description = String(body?.description ?? "").trim();
  if (description.length > TEMPLATE_LIMITS.description) return { error: `The description must be at most ${TEMPLATE_LIMITS.description} characters.` };
  const category = String(body?.category ?? "announcement").trim().toLowerCase();
  if (!(EMAIL_TEMPLATE_CATEGORIES as readonly string[]).includes(category)) return { error: "Choose a valid template category." };
  const preheader = String(body?.preheader ?? "").trim();
  if (preheader.length > TEMPLATE_LIMITS.preheader) return { error: `The preheader must be at most ${TEMPLATE_LIMITS.preheader} characters.` };
  if (htmlBody.length > TEMPLATE_LIMITS.htmlBody) return { error: `The HTML body must be at most ${TEMPLATE_LIMITS.htmlBody.toLocaleString()} characters.` };
  const textBody = String(body?.textBody ?? body?.text_body ?? "");
  if (textBody.length > TEMPLATE_LIMITS.textBody) return { error: `The plain-text body must be at most ${TEMPLATE_LIMITS.textBody.toLocaleString()} characters.` };
  const hero = parseHeroImageUrl(body?.heroImageUrl ?? body?.hero_image_url);
  if (hero && typeof hero === "object") return { error: hero.error };
  return { value: { name, description, category, subject, preheader, htmlBody, textBody, heroImageUrl: hero && typeof hero === "string" ? hero : null } };
}

function parseCampaignInput(body: any): {
  value: {
    name: string;
    templateId: string;
    subject: string;
    audienceType: EmailAudienceType;
    audienceFilter: EmailAudienceFilter;
    status: "draft" | "scheduled";
    scheduledAt: string | null;
  };
} | { error: string } {
  const name = String(body?.name ?? "").trim();
  if (name.length < 1 || name.length > 120) return { error: "The campaign name must be 1–120 characters." };
  const templateId = String(body?.templateId ?? body?.template_id ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(templateId)) return { error: "Choose a template for this campaign." };
  const subject = String(body?.subject ?? "").trim();
  if (subject.length > 200) return { error: "The subject override must be at most 200 characters." };
  const audienceType = String(body?.audienceType ?? body?.audience_type ?? "").trim() as EmailAudienceType;
  if (!EMAIL_AUDIENCE_TYPES.some((entry) => entry.value === audienceType)) return { error: "Choose a valid audience." };
  const parsedFilter = parseAudienceFilter(audienceType, body);
  if ("error" in parsedFilter) return { error: parsedFilter.error };
  let scheduledAt: string | null = null;
  const wantsSchedule = body?.schedule === true || Boolean(body?.scheduledAt || body?.scheduled_at);
  if (wantsSchedule) {
    const raw = String(body?.scheduledAt || body?.scheduled_at || "").trim();
    const parsed = Date.parse(raw);
    if (!raw || !Number.isFinite(parsed)) return { error: "The schedule time is not a valid date." };
    if (parsed <= Date.now() + 60000) return { error: "Schedule the campaign at least one minute in the future, or save it as a draft." };
    if (parsed > Date.now() + 180 * 24 * 3600000) return { error: "Campaigns can be scheduled at most 180 days ahead." };
    scheduledAt = new Date(parsed).toISOString();
  }
  return { value: { name, templateId, subject, audienceType, audienceFilter: parsedFilter.filter, status: scheduledAt ? "scheduled" : "draft", scheduledAt } };
}

// ---------------------------------------------------------------------------
// Send engine — queue + bounded batches
// ---------------------------------------------------------------------------

/** Per-invocation batch. 20 provider calls + their D1 updates stay far
 *  inside a Worker invocation's subrequest budget and wall time. */
export const SEND_BATCH_SIZE = 20;
/** Per-cron-tick budget across every campaign — bounds each cron run. */
export const CRON_SEND_BUDGET = 40;
/** Hard ceiling on one campaign's audience. */
export const MAX_AUDIENCE = 10000;

async function resolveCampaignAudience(campaign: EmailCampaign): Promise<{ recipients: EmailRecipient[] } | { error: string }> {
  const type = String(campaign.audienceType);
  if (type === "test_recipient") {
    const email = String((campaign.audienceFilter || {}).testEmail || "").trim().toLowerCase();
    if (!isValidEmail(email)) return { error: "The campaign's test recipient address is not valid." };
    return { recipients: [{ userId: null, email, displayName: "" }] };
  }
  const rows = await db.listEmailAudience(type, campaign.audienceFilter || {}, MAX_AUDIENCE + 1);
  return { recipients: rows.filter((row) => isValidEmail(row.email)) };
}

/** Recomputes a campaign's counter columns from its delivery rows. One
 *  grouped query; called after every batch and after provider webhooks. */
async function refreshCampaignCounts(campaignId: string): Promise<Record<string, number>> {
  const counts = await db.emailDeliveryCounts(campaignId);
  const handedToProvider = (counts.sent || 0) + (counts.delivered || 0) + (counts.bounced || 0) + (counts.unsubscribed || 0);
  await db.updateEmailCampaign(campaignId, {
    sentCount: handedToProvider,
    deliveredCount: counts.delivered || 0,
    failedCount: (counts.failed || 0) + (counts.bounced || 0),
    unsubscribedCount: counts.unsubscribed || 0,
  });
  return counts;
}

async function finalizeEmailCampaign(campaignId: string): Promise<string> {
  const counts = await refreshCampaignCounts(campaignId);
  const sent = (counts.sent || 0) + (counts.delivered || 0) + (counts.bounced || 0) + (counts.unsubscribed || 0);
  const failed = (counts.failed || 0) + (counts.bounced || 0);
  const status = failed === 0 ? "completed" : sent === 0 ? "failed" : "partially_failed";
  await db.updateEmailCampaign(campaignId, { status, completedAt: nowIso() });
  return status;
}

/** Sends one bounded batch of a campaign's pending deliveries. Safe to
 *  call concurrently and repeatedly: each row must be claimed
 *  (pending → sent) before its provider call, so a racing invocation
 *  simply finds nothing to claim. */
export async function processCampaignBatch(campaignId: string, batchSize: number): Promise<{ processed: number; remaining: number; status: string; counts: Record<string, number> }> {
  const campaign = await db.findEmailCampaign(campaignId);
  if (!campaign) return { processed: 0, remaining: 0, status: "missing", counts: {} };
  if (String(campaign.status) !== "sending") {
    return { processed: 0, remaining: 0, status: String(campaign.status), counts: await db.emailDeliveryCounts(campaignId) };
  }
  const deliveries = await db.listPendingEmailDeliveries(campaignId, Math.max(1, Math.min(batchSize, 50)));
  if (deliveries.length === 0) {
    const counts = await db.emailDeliveryCounts(campaignId);
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    if (total === 0) {
      // Nothing queued yet. Either the queueing invocation is still between
      // its transition and its insert (a racing "continue" call), or the
      // queue was never built. Only the second case should end the campaign.
      const startedAgo = Date.now() - Date.parse(String(campaign.startedAt || campaign.updatedAt || ""));
      if (campaign.recipientCount > 0 && Number.isFinite(startedAgo) && startedAgo > 10 * 60000) {
        await db.updateEmailCampaign(campaignId, { status: "failed", completedAt: nowIso() });
        return { processed: 0, remaining: 0, status: "failed", counts };
      }
      return { processed: 0, remaining: campaign.recipientCount, status: "sending", counts };
    }
    const status = await finalizeEmailCampaign(campaignId);
    return { processed: 0, remaining: 0, status, counts: await db.emailDeliveryCounts(campaignId) };
  }

  const template = await db.findEmailTemplate(campaign.templateId);
  if (!template) {
    for (const delivery of deliveries) await db.markEmailDeliveryFailed(delivery.id, "The campaign's template no longer exists.");
    const status = await finalizeEmailCampaign(campaignId);
    return { processed: deliveries.length, remaining: 0, status, counts: await db.emailDeliveryCounts(campaignId) };
  }

  const names = await db.findUserNamesByIds(deliveries.map((d) => d.userId).filter((id): id is string => Boolean(id)));
  const base = emailBaseUrl();
  let processed = 0;
  for (const delivery of deliveries) {
    // Claim first, send second: this is what makes concurrent drainers
    // duplicate-proof. A claim that returns false means another invocation
    // already took this recipient.
    if (!(await db.claimEmailDelivery(delivery.id))) continue;
    processed += 1;
    try {
      const rendered = renderCampaignMessage({
        template,
        campaignSubject: campaign.subject || template.subject,
        recipient: { userId: delivery.userId, email: delivery.email, displayName: names.get(String(delivery.userId)) || "" },
        linkUserId: delivery.userId,
        base,
        isTest: false,
      });
      const result = await sendMarketingEmail({
        to: delivery.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        kind: kindForTemplate(template),
        tags: [`campaign:${campaign.id}`],
      });
      await db.markEmailDeliverySent(delivery.id, result.messageId);
    } catch (error: any) {
      await db.markEmailDeliveryFailed(delivery.id, String(error?.message || error || "Provider request failed").slice(0, 500));
    }
  }

  const counts = await refreshCampaignCounts(campaignId);
  const remaining = counts.pending || 0;
  let status = String(campaign.status);
  if (remaining === 0) status = await finalizeEmailCampaign(campaignId);
  return { processed, remaining, status, counts };
}

/**
 * The Cron Trigger's entry point (worker.ts, every five minutes):
 * starts due scheduled campaigns and drains in-flight ones, within a fixed
 * send budget per tick. Failures in one campaign never stop the others.
 */
export async function processEmailCampaignQueue(budget: number = CRON_SEND_BUDGET): Promise<{ dueStarted: number; processed: number }> {
  let processed = 0;
  let dueStarted = 0;
  try {
    const due = await db.listDueScheduledEmailCampaigns();
    for (const campaign of due) {
      if (processed >= budget) break;
      // The conditional transition is the race guard: if an admin's request
      // or another isolate already started this campaign, this is a no-op.
      const audience = await resolveCampaignAudience(campaign);
      if ("error" in audience || audience.recipients.length === 0) {
        await db.updateEmailCampaignWhere(campaign.id, ["scheduled"], { status: "failed", completedAt: nowIso() });
        continue;
      }
      const started = await db.transitionEmailCampaign(campaign.id, ["scheduled"], { status: "sending", startedAt: nowIso(), recipientCount: audience.recipients.length });
      if (!started) continue;
      dueStarted += 1;
      await db.createEmailDeliveries(audience.recipients.map((recipient) => ({ id: db.newId("dlv"), campaignId: campaign.id, userId: recipient.userId, email: recipient.email })));
      processed += await processCampaignBatch(campaign.id, Math.min(SEND_BATCH_SIZE, budget - processed)).then((r) => r.processed);
    }
  } catch (error: any) {
    console.warn("Email campaign scheduler error:", error?.message || error);
  }
  try {
    const sending = await db.listSendingEmailCampaigns();
    for (const campaign of sending) {
      if (processed >= budget) break;
      processed += await processCampaignBatch(campaign.id, Math.min(SEND_BATCH_SIZE, budget - processed)).then((r) => r.processed);
    }
  } catch (error: any) {
    console.warn("Email campaign queue error:", error?.message || error);
  }
  return { dueStarted, processed };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** Serialises a template for the admin API. Bodies are returned verbatim —
 * the admin wrote them and the editor needs them — but they are sanitised
 * again at render time, so nothing stored can ever reach a recipient
 * unsanitised. */
function apiTemplate(template: EmailTemplate, createdByEmail: string | null) {
  return {
    id: template.id, name: template.name, description: template.description, category: template.category,
    subject: template.subject, preheader: template.preheader, htmlBody: template.htmlBody, textBody: template.textBody,
    heroImageUrl: template.heroImageUrl, status: template.status, createdBy: template.createdBy, createdByEmail,
    createdAt: template.createdAt, updatedAt: template.updatedAt, archivedAt: template.archivedAt,
  };
}
function apiCampaign(campaign: EmailCampaign, template: { id: string; name: string; category: string; subject?: string } | null, createdByEmail: string | null) {
  return {
    id: campaign.id, name: campaign.name, templateId: campaign.templateId, templateName: template?.name || null,
    templateCategory: template?.category || null, subject: campaign.subject || "",
    resolvedSubject: campaign.subject || template?.subject || "", audienceType: campaign.audienceType,
    audienceFilter: campaign.audienceFilter, audienceDescription: describeAudience(String(campaign.audienceType), campaign.audienceFilter || {}),
    status: campaign.status, recipientCount: campaign.recipientCount, sentCount: campaign.sentCount,
    deliveredCount: campaign.deliveredCount, failedCount: campaign.failedCount, unsubscribedCount: campaign.unsubscribedCount,
    createdBy: campaign.createdBy, createdByEmail, scheduledAt: campaign.scheduledAt, startedAt: campaign.startedAt,
    completedAt: campaign.completedAt, createdAt: campaign.createdAt, updatedAt: campaign.updatedAt,
  };
}

async function creatorsByEmails(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, string>();
  // One bounded query per request, not per row.
  const rows = unique.length ? await (async () => {
    const chunk = unique.slice(0, 100);
    const result = await env().DB.prepare(`SELECT id, email FROM users WHERE id IN (${chunk.map(() => "?").join(", ")})`).bind(...chunk).all();
    return (result.results || []) as Array<{ id: string; email: string }>;
  })() : [];
  for (const row of rows) map.set(String(row.id), String(row.email));
  return map;
}

/** Sample values for previews — the reviewing admin's own identity where it
 *  makes sense (the links in a preview must work for the person looking at
 *  it), with neutral placeholders otherwise. */
function previewRecipient(admin: User, sample: any): EmailRecipient {
  const displayName = cleanValue(String(sample?.displayName || admin.displayName || "Alex Rivera"));
  const email = String(sample?.email || admin.email || "member@example.com").trim().toLowerCase();
  return { userId: admin.id, email: isValidEmail(email) ? email : admin.email, displayName };
}

export function registerEmailCentreRoutes(app: Express) {
  // ---- dashboard -----------------------------------------------------------
  app.get("/api/admin/email/dashboard", requirePlatformAdmin, rateLimit("admin-email-dashboard", 240, 3600000), asyncHandlerVoid(async (_req, res) => {
    const [stats, recent, creators] = await Promise.all([
      db.emailCentreDashboardStats(),
      db.listEmailCampaigns(10),
      db.emailTemplateUsageCounts(),
    ]);
    const recentTemplates = await Promise.all(recent.map((campaign) => db.findEmailTemplate(campaign.templateId)));
    const templateById = new Map(recentTemplates.filter(Boolean).map((t) => [t!.id, t!]));
    res.setHeader("Cache-Control", "no-store");
    res.json({
      stats,
      recentCampaigns: recent.map((campaign) => apiCampaign(campaign, templateById.get(campaign.templateId) ? { id: campaign.templateId, name: templateById.get(campaign.templateId)!.name, category: templateById.get(campaign.templateId)!.category, subject: templateById.get(campaign.templateId)!.subject } : null, null)),
      meta: {
        variables: EMAIL_TEMPLATE_VARIABLES,
        categories: EMAIL_TEMPLATE_CATEGORIES,
        audienceTypes: EMAIL_AUDIENCE_TYPES,
        batch: { size: SEND_BATCH_SIZE, cronBudget: CRON_SEND_BUDGET, maxAudience: MAX_AUDIENCE },
        emailProviderConfigured: Boolean(env().EMAIL_PROVIDER && String(env().EMAIL_PROVIDER).toLowerCase() === "resend"),
      },
      templateUsage: Object.fromEntries(creators),
    });
  }));

  // ---- templates -----------------------------------------------------------
  app.get("/api/admin/email/templates", requirePlatformAdmin, rateLimit("admin-email-templates", 300, 3600000), asyncHandlerVoid(async (_req, res) => {
    const [templates, usage] = await Promise.all([db.listEmailTemplates(), db.emailTemplateUsageCounts()]);
    const creators = await creatorsByEmails(templates.map((t) => t.createdBy));
    res.setHeader("Cache-Control", "no-store");
    res.json({ templates: templates.map((t) => apiTemplate(t, creators.get(t.createdBy) || null)), usage: Object.fromEntries(usage) });
  }));

  app.post("/api/admin/email/templates", requirePlatformAdmin, rateLimit("admin-email-templates", 300, 3600000), asyncHandlerVoid(async (req, res) => {
    const parsed = parseTemplateInput(req.body, {});
    if ("error" in parsed) return bad(res, parsed.error);
    const template = await db.createEmailTemplate({ id: db.newId("tpl"), ...parsed.value, createdBy: adminOf(req).id });
    res.status(201).json({ template: apiTemplate(template, adminOf(req).email) });
  }));

  app.get("/api/admin/email/templates/:id", requirePlatformAdmin, rateLimit("admin-email-templates", 300, 3600000), asyncHandlerVoid(async (req, res) => {
    const template = await db.findEmailTemplate(String(req.params.id));
    if (!template) return res.status(404).json({ error: "Template not found." });
    const [usage, creator] = await Promise.all([db.emailTemplateUsageCounts(), creatorsByEmails([template.createdBy])]);
    res.json({ template: apiTemplate(template, creator.get(template.createdBy) || null), usage: usage.get(template.id) || 0 });
  }));

  app.put("/api/admin/email/templates/:id", requirePlatformAdmin, rateLimit("admin-email-templates", 300, 3600000), asyncHandlerVoid(async (req, res) => {
    const existing = await db.findEmailTemplate(String(req.params.id));
    if (!existing) return res.status(404).json({ error: "Template not found." });
    const parsed = parseTemplateInput({ ...existing, ...req.body }, {});
    if ("error" in parsed) return bad(res, parsed.error);
    const updated = await db.updateEmailTemplate(existing.id, parsed.value);
    res.json({ template: apiTemplate(updated || existing, adminOf(req).email) });
  }));

  app.post("/api/admin/email/templates/:id/duplicate", requirePlatformAdmin, rateLimit("admin-email-templates", 300, 3600000), asyncHandlerVoid(async (req, res) => {
    const existing = await db.findEmailTemplate(String(req.params.id));
    if (!existing) return res.status(404).json({ error: "Template not found." });
    const copy = await db.createEmailTemplate({
      id: db.newId("tpl"),
      name: `${existing.name} (copy)`.slice(0, TEMPLATE_LIMITS.name),
      description: existing.description, category: existing.category, subject: existing.subject, preheader: existing.preheader,
      htmlBody: existing.htmlBody, textBody: existing.textBody, heroImageUrl: existing.heroImageUrl,
      createdBy: adminOf(req).id,
    });
    res.status(201).json({ template: apiTemplate(copy, adminOf(req).email) });
  }));

  app.post("/api/admin/email/templates/:id/archive", requirePlatformAdmin, rateLimit("admin-email-templates", 300, 3600000), asyncHandlerVoid(async (req, res) => {
    const existing = await db.findEmailTemplate(String(req.params.id));
    if (!existing) return res.status(404).json({ error: "Template not found." });
    const archived = req.body?.archived === false ? false : true;
    const updated = await db.archiveEmailTemplate(existing.id, archived);
    res.json({ template: apiTemplate(updated || existing, null) });
  }));

  app.delete("/api/admin/email/templates/:id", requirePlatformAdmin, rateLimit("admin-email-templates", 300, 3600000), asyncHandlerVoid(async (req, res) => {
    const existing = await db.findEmailTemplate(String(req.params.id));
    if (!existing) return res.status(404).json({ error: "Template not found." });
    const usage = await db.emailTemplateUsageCounts();
    const timesUsed = usage.get(existing.id) || 0;
    if (timesUsed > 0) {
      return res.status(409).json({ error: `This template has been used by ${timesUsed} campaign${timesUsed === 1 ? "" : "s"} and cannot be deleted. Archive it instead — campaign history stays readable either way.` });
    }
    await db.deleteEmailTemplate(existing.id);
    res.json({ deleted: true });
  }));

  // ---- render preview (template editor + campaign detail) ------------------
  app.post("/api/admin/email/render-preview", requirePlatformAdmin, rateLimit("admin-email-preview", 300, 3600000), asyncHandlerVoid(async (req, res) => {
    const admin = adminOf(req);
    let template: EmailTemplate | null = null;
    let campaignSubject = String(req.body?.subject ?? "");
    if (req.body?.templateId) {
      template = await db.findEmailTemplate(String(req.body.templateId));
      if (!template) return res.status(404).json({ error: "Template not found." });
    } else if (req.body?.template) {
      const parsed = parseTemplateInput(req.body.template, { lenient: true });
      if ("error" in parsed) return bad(res, parsed.error);
      template = { ...parsed.value, id: "preview", status: "active", createdBy: admin.id, createdAt: nowIso(), updatedAt: nowIso(), archivedAt: null } as EmailTemplate;
    } else {
      return bad(res, "Provide a template id or template fields to preview.");
    }
    const recipient = previewRecipient(admin, req.body?.sample);
    const rendered = renderCampaignMessage({
      template,
      campaignSubject: campaignSubject || template.subject,
      recipient,
      linkUserId: admin.id,
      base: emailBaseUrl(req),
      isTest: false,
    });
    res.setHeader("Cache-Control", "no-store");
    res.json({ subject: rendered.subject, html: rendered.html, text: rendered.text });
  }));

  // ---- audience ------------------------------------------------------------
  app.get("/api/admin/email/audience-count", requirePlatformAdmin, rateLimit("admin-email-audience", 300, 3600000), asyncHandlerVoid(async (req, res) => {
    const type = String(req.query.type || "").trim();
    if (!EMAIL_AUDIENCE_TYPES.some((entry) => entry.value === type)) return bad(res, "Choose a valid audience.");
    const body = {
      registeredFrom: req.query.registeredFrom, registeredTo: req.query.registeredTo,
      trainingStep: req.query.trainingStep, userIds: String(req.query.userIds || "").split(",").map((id) => id.trim()).filter(Boolean),
      testEmail: req.query.testEmail,
    };
    const parsed = parseAudienceFilter(type, body);
    if ("error" in parsed) return bad(res, parsed.error);
    const count = await db.countEmailAudience(type, parsed.filter);
    res.setHeader("Cache-Control", "no-store");
    res.json({ count, description: describeAudience(type, parsed.filter), audienceType: type });
  }));

  app.get("/api/admin/email/recipients", requirePlatformAdmin, rateLimit("admin-email-recipients", 240, 3600000), asyncHandlerVoid(async (req, res) => {
    const query = String(req.query.q || "").slice(0, 100);
    const recipients = await db.searchEmailRecipients(query, 25);
    res.setHeader("Cache-Control", "no-store");
    res.json({ recipients });
  }));

  // ---- campaigns -----------------------------------------------------------
  app.get("/api/admin/email/campaigns", requirePlatformAdmin, rateLimit("admin-email-campaigns", 300, 3600000), asyncHandlerVoid(async (_req, res) => {
    const campaigns = await db.listEmailCampaigns(100);
    const templates = await db.listEmailTemplates();
    const templateById = new Map(templates.map((t) => [t.id, t]));
    const creators = await creatorsByEmails(campaigns.map((c) => c.createdBy));
    res.setHeader("Cache-Control", "no-store");
    res.json({ campaigns: campaigns.map((campaign) => apiCampaign(campaign, templateById.get(campaign.templateId) ? { id: campaign.templateId, name: templateById.get(campaign.templateId)!.name, category: templateById.get(campaign.templateId)!.category, subject: templateById.get(campaign.templateId)!.subject } : null, creators.get(campaign.createdBy) || null)) });
  }));

  app.post("/api/admin/email/campaigns", requirePlatformAdmin, rateLimit("admin-email-campaigns", 300, 3600000), asyncHandlerVoid(async (req, res) => {
    const parsed = parseCampaignInput(req.body);
    if ("error" in parsed) return bad(res, parsed.error);
    const template = await db.findEmailTemplate(parsed.value.templateId);
    if (!template) return bad(res, "Choose a template for this campaign.");
    if (String(template.status) === "archived") return bad(res, "This template is archived. Duplicate or restore it before using it in a campaign.");
    const campaign = await db.createEmailCampaign({ id: db.newId("cmp"), ...parsed.value, createdBy: adminOf(req).id });
    res.status(201).json({ campaign: apiCampaign(campaign, { id: template.id, name: template.name, category: template.category, subject: template.subject }, adminOf(req).email) });
  }));

  app.get("/api/admin/email/campaigns/:id", requirePlatformAdmin, rateLimit("admin-email-campaigns", 300, 3600000), asyncHandlerVoid(async (req, res) => {
    const campaign = await db.findEmailCampaign(String(req.params.id));
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    const [template, counts, failures, liveCount, creator] = await Promise.all([
      db.findEmailTemplate(campaign.templateId),
      db.emailDeliveryCounts(campaign.id),
      db.listRecentEmailDeliveryFailures(campaign.id, 25),
      db.countEmailAudience(String(campaign.audienceType), campaign.audienceFilter || {}),
      creatorsByEmails([campaign.createdBy]),
    ]);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      campaign: apiCampaign(campaign, template ? { id: template.id, name: template.name, category: template.category, subject: template.subject } : null, creator.get(campaign.createdBy) || null),
      deliveryCounts: counts,
      liveAudienceCount: liveCount,
      recentFailures: failures.map((f) => ({ email: f.email, status: f.status, reason: f.failureReason, at: f.updatedAt })),
      variables: EMAIL_TEMPLATE_VARIABLES,
    });
  }));

  app.post("/api/admin/email/campaigns/:id/preview", requirePlatformAdmin, rateLimit("admin-email-preview", 300, 3600000), asyncHandlerVoid(async (req, res) => {
    const campaign = await db.findEmailCampaign(String(req.params.id));
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    const template = await db.findEmailTemplate(campaign.templateId);
    if (!template) return res.status(404).json({ error: "The campaign's template no longer exists." });
    const admin = adminOf(req);
    const rendered = renderCampaignMessage({
      template,
      campaignSubject: campaign.subject || template.subject,
      recipient: previewRecipient(admin, req.body?.sample),
      linkUserId: admin.id,
      base: emailBaseUrl(req),
      isTest: false,
    });
    res.setHeader("Cache-Control", "no-store");
    res.json({ subject: rendered.subject, html: rendered.html, text: rendered.text });
  }));

  app.post("/api/admin/email/campaigns/:id/test", requirePlatformAdmin, rateLimit("admin-email-test", 60, 3600000), asyncHandlerVoid(async (req, res) => {
    const campaign = await db.findEmailCampaign(String(req.params.id));
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    const template = await db.findEmailTemplate(campaign.templateId);
    if (!template) return res.status(404).json({ error: "The campaign's template no longer exists." });
    const to = String(req.body?.to || "").trim().toLowerCase();
    if (!isValidEmail(to)) return bad(res, "Enter a valid test recipient email address.");
    const admin = adminOf(req);
    const rendered = renderCampaignMessage({
      template,
      campaignSubject: campaign.subject || template.subject,
      recipient: { userId: admin.id, email: to, displayName: cleanValue(String(req.body?.displayName || admin.displayName)) },
      // The links in a test email point at the reviewing admin's own
      // preferences, so they can be clicked and verified end to end.
      linkUserId: admin.id,
      base: emailBaseUrl(req),
      isTest: true,
    });
    try {
      const result = await sendMarketingEmail({
        to, subject: rendered.subject, text: rendered.text, html: rendered.html,
        kind: kindForTemplate(template), tags: [`campaign-test:${campaign.id}`],
      });
      // Deliberately no delivery rows: a test send must never count as a
      // campaign delivery.
      res.json({ sent: true, to, messageId: result.messageId });
    } catch (error: any) {
      res.status(502).json({ error: `The email provider rejected the test send: ${String(error?.message || error).slice(0, 300)}` });
    }
  }));

  app.post("/api/admin/email/campaigns/:id/send", requirePlatformAdmin, rateLimit("admin-email-send", 600, 3600000), asyncHandlerVoid(async (req, res) => {
    const campaign = await db.findEmailCampaign(String(req.params.id));
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    const status = String(campaign.status);
    if (status === "scheduled" && campaign.scheduledAt && Date.parse(campaign.scheduledAt) > Date.now() + 60000) {
      return res.status(409).json({ error: `This campaign is scheduled for ${new Date(campaign.scheduledAt).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" })} and will be sent automatically then.` });
    }
    if (status === "sending") {
      // A campaign already in flight: process the next bounded batch. The
      // admin UI calls this while its page is open; the Cron Trigger is the
      // backstop when it is not.
      const progress = await processCampaignBatch(campaign.id, SEND_BATCH_SIZE);
      return res.json({ campaign: await db.findEmailCampaign(campaign.id), progress, started: false });
    }
    if (!["draft", "scheduled"].includes(status)) {
      return res.status(409).json({ error: `This campaign has already been sent (${status}). Sending cannot be repeated.` });
    }
    // Resolve the audience BEFORE the transition: an empty or oversized
    // audience is a validation error that must leave the draft intact.
    const audience = await resolveCampaignAudience(campaign);
    if ("error" in audience) return bad(res, audience.error);
    if (audience.recipients.length === 0) return bad(res, "No eligible recipients match this audience. Every campaign audience requires marketing consent.");
    if (audience.recipients.length > MAX_AUDIENCE) return bad(res, `This audience has ${audience.recipients.length.toLocaleString()} recipients; the maximum per campaign is ${MAX_AUDIENCE.toLocaleString()}.`);
    const started = await db.transitionEmailCampaign(campaign.id, ["draft", "scheduled"], { status: "sending", startedAt: nowIso(), recipientCount: audience.recipients.length });
    if (!started) {
      // A racing invocation won the transition — continue draining instead
      // of erroring; the claim guard keeps the two from duplicating sends.
      const progress = await processCampaignBatch(campaign.id, SEND_BATCH_SIZE);
      return res.json({ campaign: await db.findEmailCampaign(campaign.id), progress, started: false });
    }
    await db.createEmailDeliveries(audience.recipients.map((recipient) => ({ id: db.newId("dlv"), campaignId: campaign.id, userId: recipient.userId, email: recipient.email })));
    const progress = await processCampaignBatch(campaign.id, SEND_BATCH_SIZE);
    res.json({ campaign: await db.findEmailCampaign(campaign.id), progress, started: true });
  }));

  app.post("/api/admin/email/campaigns/:id/cancel", requirePlatformAdmin, rateLimit("admin-email-campaigns", 300, 3600000), asyncHandlerVoid(async (req, res) => {
    const campaign = await db.findEmailCampaign(String(req.params.id));
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    if (!["draft", "scheduled", "sending"].includes(String(campaign.status))) {
      return res.status(409).json({ error: `Only draft, scheduled or in-flight campaigns can be cancelled (this one is ${campaign.status}).` });
    }
    await db.updateEmailCampaignWhere(campaign.id, ["draft", "scheduled", "sending"], { status: "cancelled", completedAt: nowIso() });
    res.json({ campaign: await db.findEmailCampaign(campaign.id) });
  }));

  // ---- public preference endpoints ----------------------------------------
  // GET/PUT /api/email-preferences accept either a signed-in session (the
  // account-settings path, exactly as before) or the signed token from a
  // marketing email, so recipients can manage preferences without signing
  // in. POST /api/email/unsubscribe is the one-click opt-out behind the
  // {{unsubscribe_url}} variable.

  async function preferenceTarget(req: Request): Promise<User | null> {
    // A signed-in session wins (the account-settings path); the signed
    // token from a marketing email works signed-out.
    const session = await findSession(req);
    if (session?.user) return session.user;
    const token = String((req.query && req.query.token) || (req.body && req.body.token) || "");
    if (!token) return null;
    const userId = verifyEmailPreferenceToken(token);
    return userId ? await db.findUserById(userId) : null;
  }

  app.get("/api/email-preferences", rateLimit("email-preferences", 120, 3600000), asyncHandlerVoid(async (req, res) => {
    const user = await preferenceTarget(req);
    if (!user) return res.status(401).json({ error: "Sign in, or use the link from a Scenering email, to manage email preferences." });
    const preference = await db.findEmailPreference(user.id);
    // The public shape carries preferences only — no account details.
    res.json(preference || { marketingConsent: false, consentSource: "none", trainingStep: 0, updatedAt: null });
  }));

  app.put("/api/email-preferences", rateLimit("email-preferences", 120, 3600000), asyncHandlerVoid(async (req, res) => {
    const user = await preferenceTarget(req);
    if (!user) return res.status(401).json({ error: "Sign in, or use the link from a Scenering email, to manage email preferences." });
    const existing = await db.findEmailPreference(user.id);
    const consent = Boolean(req.body?.marketingConsent);
    const preference = await db.upsertEmailPreference({
      userId: user.id,
      marketingConsent: consent,
      consentTimestamp: nowIso(),
      consentSource: consent ? "preferences_link" : "preferences_link",
      consentVersion: "2026-10",
      trainingStep: existing?.trainingStep || 0,
      updatedAt: nowIso(),
    });
    res.json(preference);
  }));

  app.post("/api/email/unsubscribe", rateLimit("email-unsubscribe", 30, 3600000), asyncHandlerVoid(async (req, res) => {
    const token = String(req.body?.token || "");
    let user: User | null = null;
    if (token) {
      const userId = verifyEmailPreferenceToken(token);
      user = userId ? await db.findUserById(userId) : null;
      if (!user) return bad(res, "This unsubscribe link is invalid or has expired. Sign in to manage preferences from your account.");
    } else {
      const session = await findSession(req);
      user = session?.user || null;
      if (!user) return bad(res, "This unsubscribe link is invalid or has expired. Sign in to manage preferences from your account.");
    }
    const existing = await db.findEmailPreference(user.id);
    await db.upsertEmailPreference({
      userId: user.id,
      marketingConsent: false,
      consentTimestamp: nowIso(),
      consentSource: "unsubscribe_link",
      consentVersion: "2026-10",
      trainingStep: existing?.trainingStep || 0,
      updatedAt: nowIso(),
    });
    // Transactional mail (verification, password resets, security notices,
    // billing) is unaffected: it has never depended on marketing consent.
    res.json({ ok: true, message: "You have been unsubscribed from Scenering marketing email. Account and security messages are unaffected." });
  }));
}

// ---------------------------------------------------------------------------
// Resend delivery webhook (optional) — delivered / bounced / unsubscribed
// ---------------------------------------------------------------------------

/**
 * Resend's delivery events, signed the Standard Webhooks (Svix) way:
 * `svix-signature: v1,<base64 HMAC-SHA256 of "id.timestamp.body">`. When
 * RESEND_WEBHOOK_SECRET is configured this upgrades campaign history from
 * "the provider accepted it" to actual delivered/bounced/unsubscribed
 * counts. Unconfigured, it reports 503 and everything else keeps working.
 */
export function registerResendWebhook(app: Express) {
  app.post("/api/webhooks/resend", express.raw({ type: "application/json", limit: "1mb" }), asyncHandlerVoid(async (req, res) => {
    const secret = String(env().RESEND_WEBHOOK_SECRET || "").trim();
    if (!secret) return res.status(503).json({ error: "Email delivery webhook is not configured" });
    const svixId = String(req.headers["svix-id"] || "");
    const timestamp = String(req.headers["svix-timestamp"] || "");
    const signatureHeader = String(req.headers["svix-signature"] || "");
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
    if (!svixId || !timestamp || !signatureHeader) return res.status(401).json({ error: "Invalid signature" });
    const ageSeconds = Math.floor(Date.now() / 1000) - Number(timestamp);
    if (!Number.isFinite(ageSeconds) || Math.abs(ageSeconds) > 300) return res.status(401).json({ error: "Invalid signature" });

    let key: Buffer;
    try {
      const decoded = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
      key = decoded.length > 0 ? decoded : Buffer.from(secret, "utf8");
    } catch {
      key = Buffer.from(secret, "utf8");
    }
    const expected = createHmac("sha256", key).update(`${svixId}.${timestamp}.${body.toString("utf8")}`).digest("base64");
    const supplied = signatureHeader.split(" ").filter((part) => part.startsWith("v1,")).map((part) => part.slice(3).trim());
    const signatureValid = supplied.some((signature) => signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected)));
    if (!signatureValid) return res.status(401).json({ error: "Invalid signature" });

    let event: any;
    try { event = JSON.parse(body.toString("utf8")); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
    const type = String(event?.type || "");
    const emailId = String(event?.data?.email_id || "");
    if (!type) return res.status(400).json({ error: "Invalid event" });
    if (await db.webhookEventExists(svixId)) {
      await db.markWebhookEventDuplicate(svixId);
      return res.json({ received: true, status: "duplicate" });
    }
    const record = async (status: string) => {
      await db.recordWebhookEvent({ providerEventId: svixId, eventName: `resend:${type}`, status, payload: { email_id: emailId, subject: String(event?.data?.subject || "").slice(0, 200) } });
      return status;
    };
    const handled = type === "email.delivered" ? "delivered" : type === "email.bounced" ? "bounced" : type === "email.unsubscribed" ? "unsubscribed" : null;
    if (!handled || !emailId) return res.json({ received: true, status: await record("ignored") });

    const advanced = await db.advanceEmailDeliveryByMessageId(emailId, handled, type === "email.bounced" ? `Provider reported a bounce (${String(event?.data?.bounce_type || "unspecified")})` : null);
    const delivery = await db.findEmailDeliveryByMessageId(emailId);
    if (handled === "unsubscribed" && delivery?.userId) {
      // A provider-level opt-out is honoured exactly like our own link.
      const existing = await db.findEmailPreference(delivery.userId);
      await db.upsertEmailPreference({
        userId: delivery.userId, marketingConsent: false, consentTimestamp: nowIso(), consentSource: "unsubscribe_link",
        consentVersion: "2026-10", trainingStep: existing?.trainingStep || 0, updatedAt: nowIso(),
      });
    }
    if (delivery) await refreshCampaignCounts(delivery.campaignId);
    return res.json({ received: true, status: await record(advanced ? "processed" : "unmatched") });
  }));
}
