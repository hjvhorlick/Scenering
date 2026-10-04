export type EmailKind = "verification" | "password_reset" | "subscription" | "security" | "training" | "marketing";
export interface EmailMessage { to: string; subject: string; text: string; html?: string; kind: EmailKind }
export interface EmailProvider { send(message: EmailMessage): Promise<void> }

class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage) {
    // Safe development fallback: messages are never silently discarded and no
    // provider or credentials are invented. Configure EMAIL_PROVIDER in hosted environments.
    console.info(`[email:${message.kind}] to=${message.to} subject=${message.subject}\n${message.text}`);
  }
}

function provider(): EmailProvider {
  // Provider adapters can be added behind this seam (SMTP, Resend, Postmark,
  // etc.) without changing auth or campaign code. Console is deliberately the
  // only built-in provider until real credentials are configured.
  return new ConsoleEmailProvider();
}

export async function sendTransactionalEmail(message: Omit<EmailMessage, "kind"> & { kind?: Exclude<EmailKind, "marketing" | "training"> }) {
  return provider().send({ ...message, kind: message.kind || "security" });
}
export async function sendMarketingEmail(message: Omit<EmailMessage, "kind"> & { kind?: "marketing" | "training" }) {
  return provider().send({ ...message, kind: message.kind || "marketing" });
}
export async function sendVerificationEmail(to: string, name: string, url: string) {
  return sendTransactionalEmail({ to, kind: "verification", subject: "Verify your Scenering email", text: `Hello ${name},\n\nVerify your email to open Scenering:\n${url}\n\nThis link expires in 24 hours.` });
}
export async function sendPasswordResetEmail(to: string, name: string, url: string) {
  return sendTransactionalEmail({ to, kind: "password_reset", subject: "Reset your Scenering password", text: `Hello ${name},\n\nReset your password here:\n${url}\n\nThis link expires in one hour. Ignore this message if you did not request it.` });
}
export async function sendSubscriptionEmail(to: string, subject: string, text: string) {
  return sendTransactionalEmail({ to, kind: "subscription", subject, text });
}

/** Administrator-manageable training sequence seed. */
export const TRAINING_SEQUENCE = [
  "Welcome", "Getting Started", "Create Your First Project", "Understanding Scenes", "Finding Visuals",
  "Voice Over", "Captions", "Video Studio", "Rendering", "Advanced Features",
] as const;
