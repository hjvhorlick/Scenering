import { createHarness } from "./harness.ts";
import { setEnv } from "../src/env.ts";
import { sendTransactionalEmail } from "../server/email.ts";

const h = createHarness();
const originalFetch = globalThis.fetch;

try {
  setEnv({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test_key" });
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
  };

  await sendTransactionalEmail({
    to: "person@example.com",
    subject: "A test message",
    text: "Plain-text body",
    html: "<p>HTML body</p>",
    kind: "security",
  });

  h.eq(requestUrl, "https://api.resend.com/emails", "the adapter calls Resend's email endpoint");
  h.eq(requestInit?.method, "POST", "the adapter sends a POST request");
  const headers = new Headers(requestInit?.headers);
  h.eq(headers.get("Authorization"), "Bearer re_test_key", "the adapter authenticates with the configured secret");
  const body = JSON.parse(String(requestInit?.body));
  h.eq(body.from, "Scenering <noreply@scenering.com>", "mail uses the Scenering sender identity");
  h.eq(body.to[0], "person@example.com", "mail is addressed to the requested recipient");
  h.eq(body.subject, "A test message", "the subject reaches Resend");
  h.eq(body.text, "Plain-text body", "the text body reaches Resend");
  h.eq(body.html, "<p>HTML body</p>", "an explicitly supplied HTML body reaches Resend");

  await sendTransactionalEmail({ to: "person@example.com", subject: "A branded notice", text: "A plain-text notice.", kind: "security" });
  const brandedBody = JSON.parse(String(requestInit?.body));
  h.ok(brandedBody.html.includes("Scenering"), "transactional messages without custom HTML receive the branded email template");
  h.ok(brandedBody.html.includes("Need a hand?"), "the default transactional layout includes the shared footer");
  h.eq(brandedBody.text, "A plain-text notice.", "the branded HTML layout keeps the plain-text fallback unchanged");

  setEnv({ EMAIL_PROVIDER: "resend" });
  await sendTransactionalEmail({ to: "person@example.com", subject: "No key", text: "test" })
    .then(() => h.ok(false, "Resend refuses to run without its API key"))
    .catch((error) => h.ok(String(error).includes("RESEND_API_KEY"), "a missing API key produces an actionable error"));

  setEnv({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test_key" });
  globalThis.fetch = async () => new Response("domain is not verified", { status: 403 });
  await sendTransactionalEmail({ to: "person@example.com", subject: "Rejected", text: "test" })
    .then(() => h.ok(false, "a rejected Resend request must not look successful"))
    .catch((error) => {
      h.ok(String(error).includes("403"), "provider failures include the HTTP status");
      h.ok(String(error).includes("domain is not verified"), "provider failures include Resend's diagnostic response");
    });
} finally {
  globalThis.fetch = originalFetch;
}

h.done("Resend email adapter");
