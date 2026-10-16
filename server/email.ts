import { env } from "../src/env.ts";
import {
  buildBrandedTextEmail,
  buildPasswordResetEmail,
  buildVerificationEmail,
  type EmailTemplateKind,
} from "../src/lib/email-templates.ts";
import { automaticReplyTo } from "./inbox-settings.ts";

export type EmailKind = EmailTemplateKind;
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  kind: EmailKind;
  /** Optional Reply-To override; falls back to the EMAIL_REPLY_TO var. */
  replyTo?: string;
  /** Provider-side tags (Resend supports a small array) — used to carry
   *  campaign metadata like "campaign:<id>" alongside the message kind. */
  tags?: string[];
  /** Optional sender, `Name <address@scenering.com>`; the inbox replies from
   *  the owner's own address. Defaults to the noreply sender. */
  from?: string;
  /** Extra email headers: threading (In-Reply-To, References) for inbox
   *  replies and List-Unsubscribe for campaigns. Only a known set passes. */
  headers?: Record<string, string>;
  /** Resend Idempotency-Key: a retried request can never send twice. */
  idempotencyKey?: string;
}

/** The only extra headers the app may set. Anything else is dropped, and
 *  values lose line breaks so a header can never be split or injected. */
const ALLOWED_EXTRA_HEADERS = new Set(["In-Reply-To", "References", "List-Unsubscribe", "List-Unsubscribe-Post"]);
export function cleanExtraHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!headers) return undefined;
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!ALLOWED_EXTRA_HEADERS.has(name)) continue;
    const clean = String(value ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 2000);
    if (clean) out[name] = clean;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Resend tags are `{ name, value }` pairs limited to letters, digits, `_`
 * and `-`. The app writes them as "name:value" strings; this converts them,
 * replacing any other character, so a tag can never make Resend refuse
 * the whole message.
 */
export function resendTags(tags: string[] | undefined): Array<{ name: string; value: string }> | undefined {
  if (!tags || tags.length === 0) return undefined;
  const clean = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256);
  const out = tags.slice(0, 10).map((tag) => {
    const [name, ...rest] = String(tag).split(":");
    return { name: clean(name || "tag") || "tag", value: clean(rest.join(":") || "1") || "1" };
  });
  return out.length ? out : undefined;
}
/** What the provider told us about an accepted message. `messageId` is
 *  Resend's email id — the handle delivery webhooks match against. Null
 *  when the provider could not supply one (the console provider, for
 *  instance, which only logs). */
export interface EmailSendResult { messageId: string | null }
export interface EmailProvider { send(message: EmailMessage): Promise<EmailSendResult> }

const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_FROM = "Scenering <noreply@scenering.com>";

class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<EmailSendResult> {
    // Safe development fallback: messages are never silently discarded and no
    // provider or credentials are invented. Configure EMAIL_PROVIDER in hosted environments.
    const extra = [message.from ? `from=${message.from}` : "", message.replyTo ? `reply-to=${message.replyTo}` : "", ...Object.entries(cleanExtraHeaders(message.headers) || {}).map(([name, value]) => `${name}=${value}`)].filter(Boolean).join(" ");
    console.info(`[email:${message.kind}] to=${message.to} subject=${message.subject}${extra ? ` ${extra}` : ""}\n${message.text}`);
    return { messageId: null };
  }
}

class ResendEmailProvider implements EmailProvider {
  constructor(private readonly apiKey: string) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    // RESEND_API_KEY exists only inside this class, constructed from the
    // server-side secret — it is never returned, logged, or exposed to any
    // response payload.
    // Reply-To precedence: the message's own, then the EMAIL_REPLY_TO var,
    // then the owner's inbox address when "replies to automatic emails"
    // is switched on in the Email Centre settings.
    const replyTo = message.replyTo || (env().EMAIL_REPLY_TO ? String(env().EMAIL_REPLY_TO) : undefined) || (await automaticReplyTo());
    const headers = cleanExtraHeaders(message.headers);
    const tags = resendTags(message.tags);
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey.slice(0, 256) } : {}),
      },
      body: JSON.stringify({
        from: message.from || RESEND_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(headers ? { headers } : {}),
        ...(tags ? { tags } : {}),
      }),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Resend email request failed (${response.status})${detail ? `: ${detail}` : ""}`);
    }

    // Resend answers { id: "email_..." } for an accepted message. A missing
    // id is not a failure — the send succeeded — it only means delivery
    // webhooks will not be able to match this particular message.
    let messageId: string | null = null;
    try {
      const body = (await response.json()) as { id?: string } | null;
      if (body && typeof body.id === "string" && body.id) messageId = body.id;
    } catch {
      // Non-JSON success body: keep messageId null.
    }
    return { messageId };
  }
}

function provider(): EmailProvider {
  const configured = String(env().EMAIL_PROVIDER || "console").trim().toLowerCase();
  if (configured === "console") return new ConsoleEmailProvider();
  if (configured === "resend") {
    const apiKey = String(env().RESEND_API_KEY || "").trim();
    if (!apiKey) throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
    return new ResendEmailProvider(apiKey);
  }
  throw new Error(`Unsupported EMAIL_PROVIDER: ${configured}`);
}

/**
 * Transactional mail: verification, password resets, security notices,
 * billing/subscription and account notifications. These are *never* gated
 * on marketing consent and must never be sent through the Email Centre's
 * campaign machinery — a verification link the user needs cannot depend on
 * a marketing preference.
 */
export async function sendTransactionalEmail(message: Omit<EmailMessage, "kind"> & { kind?: Exclude<EmailKind, "marketing" | "training"> }): Promise<EmailSendResult> {
  const kind = message.kind || "security";
  const html = message.html || buildBrandedTextEmail(kind, message.subject, message.text).html;
  return provider().send({ ...message, kind, html });
}
/**
 * Marketing mail: the admin Email Centre's campaigns, training sequences
 * and anything subscription-shaped that is promotional. Only ever sent to
 * accounts with marketing consent, and always carries an unsubscribe path.
 */
export async function sendMarketingEmail(message: Omit<EmailMessage, "kind"> & { kind?: "marketing" | "training" }): Promise<EmailSendResult> {
  return provider().send({ ...message, kind: message.kind || "marketing" });
}
/**
 * Personal correspondence from the owner's inbox: a reply to a customer's
 * message, or a conversation the owner starts with one person. It is not
 * marketing (no consent gate and no unsubscribe footer: it answers or
 * addresses a single person) and not an account notice, so it has its own
 * kind and always carries the owner's From and Reply-To.
 */
export async function sendConversationEmail(message: Omit<EmailMessage, "kind">): Promise<EmailSendResult> {
  return provider().send({ ...message, kind: "conversation" });
}
export async function sendVerificationEmail(to: string, name: string, url: string) {
  return sendTransactionalEmail({ to, kind: "verification", ...buildVerificationEmail(name, url) });
}
export async function sendPasswordResetEmail(to: string, name: string, url: string) {
  return sendTransactionalEmail({ to, kind: "password_reset", ...buildPasswordResetEmail(name, url) });
}
export async function sendSubscriptionEmail(to: string, subject: string, text: string) {
  return sendTransactionalEmail({ to, kind: "subscription", subject, text });
}

/** Administrator-manageable training sequence seed. */
export const TRAINING_SEQUENCE = [
  "Welcome", "Getting Started", "Create Your First Project", "Understanding Scenes", "Finding Visuals",
  "Voice Over", "Captions", "Video Studio", "Rendering", "Advanced Features",
] as const;
