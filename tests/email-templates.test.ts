import { createHarness } from "./harness.ts";
import {
  buildBrandedTextEmail,
  buildPasswordResetEmail,
  buildVerificationEmail,
} from "../src/lib/email-templates.ts";

const h = createHarness();
const verification = buildVerificationEmail(
  "<script>alert('x')</script>",
  "https://scenering.com/verify-email?token=sample&source=welcome",
);
h.eq(verification.subject, "Verify your Scenering email", "verification mail keeps its clear subject");
h.ok(verification.html.includes("Scenering"), "verification mail has the brand header");
h.ok(verification.html.includes("Let’s get you started"), "verification mail has a friendly headline");
h.ok(verification.html.includes("Verify email address"), "verification mail has a clear action button");
h.ok(verification.html.includes("expires in 24 hours"), "verification mail shows the true token lifetime");
h.ok(verification.html.includes("Need a hand?"), "verification mail has a helpful footer");
h.ok(verification.html.includes("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;"), "recipient content is escaped before HTML rendering");
h.ok(!verification.html.includes("<script>alert("), "untrusted recipient content cannot become executable HTML");
h.ok(verification.html.includes("token=sample&amp;source=welcome"), "action URL query parameters are escaped in HTML attributes");
h.ok(verification.text.includes("https://scenering.com/verify-email?token=sample&source=welcome"), "plain-text verification mail retains the usable link");
h.ok(verification.html.includes("max-width:600px"), "email content is responsive on narrow screens");

const reset = buildPasswordResetEmail("Jordan Morgan", "https://scenering.com/reset-password?token=sample");
h.eq(reset.subject, "Reset your Scenering password", "password-reset subject is specific");
h.ok(reset.html.includes("Choose a new password"), "password-reset mail has a clear action button");
h.ok(reset.html.includes("expires in one hour"), "password-reset mail shows the true token lifetime");
h.ok(reset.html.includes("Your password will not change"), "password-reset mail explains the safety case");
h.ok(reset.html.includes("contact our team"), "password-reset mail footer includes a support route");

const unsafeUrl = buildVerificationEmail("Jordan", "javascript:alert(1)");
h.ok(!unsafeUrl.html.includes('href="javascript:'), "unsafe action schemes are never used in email links");
h.ok(unsafeUrl.html.includes("could not create a valid action link"), "invalid action URLs show a safe recovery message");

const accountNotice = buildBrandedTextEmail(
  "subscription",
  "A quick account update",
  "Hello Jordan,\n\nYour plan is active. <img src=x onerror=alert(1)>",
);
h.ok(accountNotice.html.includes("ACCOUNT UPDATE"), "generic account mail has an appropriate eyebrow label");
h.ok(accountNotice.html.includes("Your plan is active. &lt;img"), "generic text content is escaped before HTML rendering");
h.ok(!accountNotice.html.includes("<img src=x"), "generic account text cannot inject HTML");
h.ok(accountNotice.text.includes("<img src=x"), "plain-text fallback preserves the original message");

console.log("PASS Email templates: branded, responsive and safe HTML with plain-text fallbacks");
h.done("Branded email templates");
